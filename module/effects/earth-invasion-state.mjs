import { EARTH_INVASION_ABILITIES, earthInvasionOutcome } from "../rules/earth-invasion.mjs";

export const EARTH_INVASION_RECEIPTS = "earthInvasionReceipts";
const busy = new Set();
const id = v => typeof v === "string" && v.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Each side effect has a durable claim. A lost acknowledgement blocks replay.
 * The adapter authenticates ownership, scene geometry, costs and condition writes.
 */
export async function runEarthInvasionAbility({ actor, name, requestId, targets, validate, pay, resist, damage, stun } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const spec = Object.hasOwn(EARTH_INVASION_ABILITIES, name ?? "") ? EARTH_INVASION_ABILITIES[name] : null;
  if (!spec || !writer() || !id(actor?.uuid) || !id(requestId)
    || !Array.isArray(targets) || !targets.length || targets.some(t => !id(t))
    || new Set(targets).size !== targets.length || (spec.targets === "one" && targets.length !== 1)
    || [validate, pay, resist, ...(spec.damage ? [damage] : []), ...(spec.stun ? [stun] : [])]
      .some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", EARTH_INVASION_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(r => r?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(r => !["complete", "cancelled"].includes(r?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = target => unchanged() && validate(target) === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Earth invasion receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", EARTH_INVASION_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Earth invasion receipt unconfirmed");
      expected = next; record = next[index];
    };
    const saveResult = async (result, stage, pendingTarget) => {
      const results = structuredClone(record.results);
      results[results.length - 1] = result;
      await save({ results, stage, pendingTarget });
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, name, targets: [...targets], stage: "paying", paid: null, results: [] });
    if (!valid()) return refuse("changed");
    const payment = await pay();
    if (payment !== true) {
      await save({ stage: payment === false ? "cancelled" : "unresolved", paid: payment === false ? false : null });
      return refuse("payment");
    }
    await save({ stage: "resolving", paid: true });
    for (const targetUuid of targets) {
      if (!valid(targetUuid)) return refuse("changed");
      const result = { targetUuid, passed: null, cardUuid: null, damage: null, stun: null };
      await save({ stage: "rolling", pendingTarget: targetUuid, results: [...record.results, result] });
      if (!valid(targetUuid)) return refuse("changed");
      const test = await resist(targetUuid);
      if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
      result.passed = test.passed; result.cardUuid = test.cardUuid;
      const outcome = earthInvasionOutcome(name, test.passed);
      await saveResult(result, "resolving", targetUuid);
      const claim = { valid: () => valid(targetUuid), messageUuid: test.cardUuid,
        applicationId: JSON.stringify([actor.uuid, requestId, targetUuid]) };
      if (spec.damage) {
        await saveResult(result, "damaging", targetUuid);
        if (!claim.valid()) return refuse("changed");
        const dealt = await damage(targetUuid, outcome, claim);
        if (dealt?.ok !== true || !Array.isArray(dealt.lines) || !dealt.lines.length
          || dealt.lines.some(line => typeof line !== "string")) return refuse("damageUncertain");
        result.damage = { rating: outcome.damage, type: outcome.type, lines: [...dealt.lines] };
        await saveResult(result, "resolving", targetUuid);
      }
      if (!claim.valid()) return refuse("changed");
      if (outcome.stunned) {
        await saveResult(result, "stunning", targetUuid);
        if (!claim.valid()) return refuse("changed");
        const effect = await stun(targetUuid, outcome, claim);
        if (effect?.ok !== true || !(effect.dead === true || effect.immune === true || id(effect.effectId))) return refuse("effectUncertain");
        result.stun = effect.dead === true ? { skipped: "dead" }
          : effect.immune === true ? { immune: true } : { effectId: effect.effectId };
      }
      await saveResult(result, "resolving", null);
      if (!claim.valid()) return refuse("changed");
    }
    await save({ stage: "complete", pendingTarget: null });
    return { ok: true, paid: true, results: structuredClone(record.results) };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
