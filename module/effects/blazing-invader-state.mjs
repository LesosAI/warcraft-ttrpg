import { BLAZING_ABILITIES, blazingOutcome } from "../rules/blazing-invader.mjs";

export const BLAZING_RECEIPTS = "blazingInvaderReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Persist each claim before rolling, damaging or slowing. Adapters must
 * authenticate the scene and provide confirmed side-effect results. Lost
 * acknowledgements remain unresolved and are never automatically replayed. */
export async function runBlazingAbility({ actor, name, requestId, targets, validate, pay, resist, damage, slow } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const spec = Object.hasOwn(BLAZING_ABILITIES, name ?? "") ? BLAZING_ABILITIES[name] : null;
  if (!spec || !writer() || !id(actor?.uuid) || !id(requestId)
    || !Array.isArray(targets) || !targets.length || targets.some(target => !id(target))
    || new Set(targets).size !== targets.length
    || [validate, pay, damage, ...(spec.resilience ? [resist, slow] : [])].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", BLAZING_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = target => unchanged() && validate(target) === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Blazing ability receipt changed");
      const next = structuredClone(expected); next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", BLAZING_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Blazing ability receipt unconfirmed");
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
      const result = { targetUuid, passed: null, cardUuid: null, damage: null, slow: null };
      await save({ stage: spec.resilience ? "rolling" : "damaging", pendingTarget: targetUuid,
        results: [...record.results, result] });
      if (spec.resilience) {
        if (!valid(targetUuid)) return refuse("changed");
        const test = await resist(targetUuid);
        if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
        result.passed = test.passed; result.cardUuid = test.cardUuid;
        await saveResult(result, "damaging", targetUuid);
      }
      const outcome = blazingOutcome(name, result.passed);
      if (!outcome || !valid(targetUuid)) return refuse("changed");
      const claim = { valid: () => valid(targetUuid), messageUuid: result.cardUuid };
      const dealt = await damage(targetUuid, outcome, claim);
      if (dealt?.ok !== true || !Array.isArray(dealt.lines) || !dealt.lines.length
        || dealt.lines.some(line => typeof line !== "string")) return refuse("damageUncertain");
      result.damage = { rating: outcome.rating, school: outcome.school, lines: [...dealt.lines] };
      await saveResult(result, outcome.slow ? "slowing" : "resolving", outcome.slow ? targetUuid : null);
      if (!valid(targetUuid)) return refuse("changed");
      if (!outcome.slow) continue;
      const effect = await slow(targetUuid, claim);
      if (effect?.ok !== true || !(effect.immune === true || effect.dead === true || id(effect.effectId))) return refuse("effectUncertain");
      result.slow = effect.dead === true ? { skipped: "dead" }
        : effect.immune === true ? { immune: true, effectId: null } : { immune: false, effectId: effect.effectId };
      await saveResult(result, "resolving", null);
      if (!valid(targetUuid)) return refuse("changed");
    }
    await save({ stage: "complete" });
    return { ok: true, paid: true, results: structuredClone(record.results) };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
