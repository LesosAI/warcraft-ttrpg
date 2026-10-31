import { spellLockBanes, spellLockAftermath } from "../rules/spell-lock.mjs";
import { SPELL_LOCK_RECEIPTS } from "./spell-lock-state.mjs";

export const SPELL_LOCK_WINDOWS = "spellLockWindows";
const busy = new Set();
const identity = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id && fromUuidSync(actor?.uuid) === actor;
const refuse = reason => ({ ok: false, reason });

/** The network adapter supplies ownership, cast-evidence and geometry checks.
 * This ledger owns ordering and replay protection on the active GM. In-flight
 * records survive reload; uncertain writes require reconciliation. */
async function transact({ actor, castId, requesterId, validate }, work) {
  if (!identity(actor?.uuid) || !identity(castId) || !identity(requesterId)
    || typeof validate !== "function" || !writer(actor)) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", SPELL_LOCK_WINDOWS) ?? [];
  try {
    let expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("windows");
    const unchanged = () => writer(actor) && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async (index, record) => {
      if (!unchanged()) throw Error("Spell Lock window changed");
      const next = structuredClone(expected);
      next[index] = structuredClone(record);
      await actor.setFlag("azeroth-rpg", SPELL_LOCK_WINDOWS, next);
      if (!writer(actor) || !same(read(), next)) throw Error("Spell Lock window unconfirmed");
      expected = next;
    };
    if (!valid()) return refuse("changed");
    return await work({ rows: expected, valid, save });
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}

/** Await every admitted reaction before returning a frozen Bane count. The
 * collector is a trusted GM callback, not client-supplied claims. It receives
 * the exact open cast to pass into claimSpellLock. Each returned claim is
 * checked against the reactor's persisted payment receipt before sealing.
 * Multiple ready windows are allowed for nested Tests within one operation. */
export async function openSpellLockWindow({ actor, castId, requesterId, validate, collect } = {}) {
  if (typeof collect !== "function") return refuse("invalid");
  return transact({ actor, castId, requesterId, validate }, async ({ rows, valid, save }) => {
    if (rows.some(row => row?.castId === castId)) return refuse("alreadyClaimed");
    if (rows.some(row => !["ready", "complete"].includes(row?.stage))) return refuse("reconcile");
    const index = rows.length;
    const record = { castId, casterUuid: actor.uuid, requesterId, stage: "collecting", claims: [], banes: null, aftermath: [] };
    await save(index, record);
    if (!valid()) return refuse("changed");
    const cast = { id: castId, casterUuid: actor.uuid, phase: "open" };
    let claims;
    try { claims = await collect({ cast, valid }); }
    finally { cast.phase = "closed"; }
    if (!valid()) return refuse("changed");
    if (!Array.isArray(claims)) return refuse("claimsUncertain");
    const snapshot = spellLockBanes(claims, { id: castId, casterUuid: actor.uuid, phase: "open" });
    // Invalid or duplicate claims must not silently turn a paid reaction into
    // zero Banes. A collector failure leaves the durable window unresolved.
    if (snapshot.reactors.length !== claims.length) return refuse("claimsUncertain");
    for (const claim of claims) {
      const reactor = fromUuidSync(claim.reactorUuid);
      const receipts = reactor?.getFlag("azeroth-rpg", SPELL_LOCK_RECEIPTS);
      if (!Array.isArray(receipts) || !receipts.some(row => same(row, claim))) return refuse("claimsUncertain");
    }
    record.claims = structuredClone(claims);
    record.banes = snapshot.banes;
    record.aftermath = claims.map(claim => ({ reactorUuid: claim.reactorUuid, stage: "pending" }));
    record.stage = "ready";
    await save(index, record);
    if (!valid()) return refuse("changed");
    return { ok: true, castId, banes: record.banes };
  });
}

/** Called after the enclosing cast operation resolves, not immediately after
 * its die roll. validate must verify that operation's completion evidence.
 * The resolver performs Spirit resistance and any resulting Silence, returning
 * their confirmed outcome. A failed or uncertain resolver is never replayed.
 * Already-ready nested windows may be completed independently by their owner. */
export async function finishSpellLockWindow({ actor, castId, requesterId, validate, resolve = null } = {}) {
  resolve ??= async args => {
    const { resolveSpellLockAftermath } = await import("./spell-lock-aftermath.mjs");
    return resolveSpellLockAftermath({ ...args, actor });
  };
  if (typeof resolve !== "function") return refuse("invalid");
  return transact({ actor, castId, requesterId, validate }, async ({ rows, valid, save }) => {
    const index = rows.findIndex(row => row?.castId === castId);
    if (index < 0) return refuse("missing");
    const record = structuredClone(rows[index]);
    if (record.casterUuid !== actor.uuid || record.requesterId !== requesterId) return refuse("owner");
    if (record.stage === "complete") return refuse("alreadyResolved");
    if (record.stage !== "ready") return refuse("reconcile");
    const cast = { id: castId, casterUuid: actor.uuid, phase: "resolved" };
    record.stage = "resolving";
    await save(index, record);
    for (let i = 0; i < record.claims.length; i += 1) {
      if (!valid()) return refuse("changed");
      record.aftermath[i].stage = "applying";
      await save(index, record);
      if (!valid()) return refuse("changed");
      const result = await resolve({ cast: structuredClone(cast), claim: structuredClone(record.claims[i]), valid });
      if (!valid()) return refuse("changed");
      if (result?.ok !== true || typeof result.resistancePassed !== "boolean" || typeof result.silenceImmune !== "boolean") return refuse("aftermathUncertain");
      const outcome = spellLockAftermath(record.claims[i], cast, result);
      if (!outcome || (outcome.silence && !identity(result.effectId))) return refuse("aftermathUncertain");
      record.aftermath[i] = { reactorUuid: record.claims[i].reactorUuid, stage: "complete",
        resistancePassed: result.resistancePassed, silenceImmune: result.silenceImmune,
        effectId: outcome.silence ? result.effectId : null };
      await save(index, record);
    }
    if (!valid()) return refuse("changed");
    record.stage = "complete";
    await save(index, record);
    return { ok: true, castId, aftermath: structuredClone(record.aftermath) };
  });
}
