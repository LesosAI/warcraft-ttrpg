import { taintedBloodHit } from "../rules/demon-abilities.mjs";
import { TAINTED_BLOOD_AURA, TAINTED_BLOOD_PENALTY, taintedBloodAuraEffect,
  taintedBloodPenaltyEffect, taintedBloodCarrier } from "../rules/tainted-blood.mjs";

export const TAINTED_BLOOD_HITS = "taintedBloodHits";
const queues = new Map();
const effectsOf = actor => [...(actor.effects?.values?.() ?? actor.effects ?? [])];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const clock = () => game.time?.worldTime;
const snapshot = effect => effect ? JSON.stringify({ id: effect.id, origin: effect.origin,
  flags: effect.flags, start: effect.start, duration: effect.duration, disabled: effect.disabled,
  active: effect.active, suppressed: effect.isSuppressed }) : null;
const timingMatches = (effect, data) => effect.start?.time === data.start.time
  && effect.duration?.value === data.duration.value && effect.duration?.units === data.duration.units;
function enqueue(owner, valid, work) {
  if (!owner?.uuid || typeof valid !== "function") return Promise.resolve({ ok: false, reason: "request" });
  const task = (queues.get(owner.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const current = () => gmHere() && fromUuidSync(owner.uuid) === owner && valid() === true;
    if (!current()) return { ok: false, reason: "authority" };
    return work(current);
  }).catch(() => ({ ok: false, reason: "writeUncertain" }));
  queues.set(owner.uuid, task);
  return task.finally(() => { if (queues.get(owner.uuid) === task) queues.delete(owner.uuid); });
}

/** The activation workflow pays before calling this writer. */
export function layTaintedBloodAura({ owner, castId, valid } = {}) {
  return enqueue(owner, valid, async current => {
    const now = clock(), data = taintedBloodAuraEffect({ ownerUuid: owner.uuid, castId, now });
    if (!data) return { ok: false, reason: "request" };
    const held = effectsOf(owner).filter(effect => effect.flags?.["azeroth-rpg"]?.[TAINTED_BLOOD_AURA]);
    if (held.length > 1) return { ok: false, reason: "ambiguous" };
    let effect = held[0];
    if (effect) {
      const state = effect.flags["azeroth-rpg"][TAINTED_BLOOD_AURA];
      if (state.version !== 1 || state.ownerUuid !== owner.uuid || effect.origin !== owner.uuid) return { ok: false, reason: "record" };
      if (state.castId === castId) return taintedBloodCarrier([effect], owner.uuid, TAINTED_BLOOD_AURA, now)
        ? { ok: true, effectId: effect.id } : { ok: false, reason: "expired" };
      await effect.update(data);
    } else [effect] = await owner.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!current() || clock() !== now || !effect?.id || owner.effects.get(effect.id) !== effect
      || taintedBloodCarrier(effectsOf(owner), owner.uuid, TAINTED_BLOOD_AURA, now) !== effect
      || !timingMatches(effect, data)
      || !same(effect.flags["azeroth-rpg"][TAINTED_BLOOD_AURA], data.flags["azeroth-rpg"][TAINTED_BLOOD_AURA])) {
      return { ok: false, reason: "effectUnconfirmed" };
    }
    return { ok: true, effectId: effect.id };
  });
}

/** One shared penalty per attacker. The durable receipt is independent of
 * the dispellable effect, so a replay after dispel cannot restore a stack.
 * An uncertain write blocks subsequent applications until reconciled. */
export function applyTaintedBloodStack({ owner, hitId, valid } = {}) {
  return enqueue(owner, valid, async current => {
    const now = clock();
    const receipts = owner.getFlag("azeroth-rpg", TAINTED_BLOOD_HITS) ?? [];
    if (!Array.isArray(receipts)) return { ok: false, reason: "record" };
    if (receipts.some(row => row.hitId === hitId)) return { ok: false, reason: "claimed" };
    if (receipts.some(row => row.stage !== "complete")) return { ok: false, reason: "unresolved" };
    const held = effectsOf(owner).filter(effect => effect.flags?.["azeroth-rpg"]?.[TAINTED_BLOOD_PENALTY]);
    if (held.length > 1) return { ok: false, reason: "ambiguous" };
    let effect = held[0];
    if (effect && (effect.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY].version !== 1
      || effect.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY].ownerUuid !== owner.uuid
      || effect.origin !== owner.uuid)) return { ok: false, reason: "record" };
    const original = snapshot(effect);
    const active = taintedBloodCarrier(held, owner.uuid, TAINTED_BLOOD_PENALTY, now);
    const record = taintedBloodHit(active?.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY], { hitId, now, melee: true, hit: true });
    const data = taintedBloodPenaltyEffect({ ownerUuid: owner.uuid, record, now });
    if (!data) return { ok: false, reason: "request" };
    let receipt = { hitId, stage: "writing", record };
    const confirmed = () => same(owner.getFlag("azeroth-rpg", TAINTED_BLOOD_HITS), [...receipts, receipt]);
    await owner.setFlag("azeroth-rpg", TAINTED_BLOOD_HITS, [...receipts, receipt]);
    if (!current() || clock() !== now || !confirmed()
      || snapshot(effect) !== original
      || !same(effectsOf(owner).filter(e => e.flags?.["azeroth-rpg"]?.[TAINTED_BLOOD_PENALTY]).map(e => e.id), held.map(e => e.id))) {
      return { ok: false, reason: "claimUnconfirmed" };
    }
    if (effect) await effect.update(data);
    else [effect] = await owner.createEmbeddedDocuments("ActiveEffect", [data]);
    if (!current() || clock() !== now || !confirmed() || !effect?.id || owner.effects.get(effect.id) !== effect
      || taintedBloodCarrier(effectsOf(owner), owner.uuid, TAINTED_BLOOD_PENALTY, now) !== effect
      || !timingMatches(effect, data)
      || !same(effect.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY], data.flags["azeroth-rpg"][TAINTED_BLOOD_PENALTY])) {
      return { ok: false, reason: "effectUnconfirmed" };
    }
    receipt = { ...receipt, stage: "complete", effectId: effect.id };
    await owner.setFlag("azeroth-rpg", TAINTED_BLOOD_HITS, [...receipts, receipt]);
    if (!current() || !confirmed()) return { ok: false, reason: "receiptUnconfirmed" };
    return { ok: true, effectId: effect.id, stacks: record.stacks, expiresAt: record.expiresAt };
  });
}
