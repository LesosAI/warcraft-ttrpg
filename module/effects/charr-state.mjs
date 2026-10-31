import { CHARR_ABILITIES, charrOutcome } from "../rules/flame-buffet.mjs";

export const CHARR_RECEIPTS = "charrReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Adapters authenticate geometry and permissions. Save each claim before its
 * side effect; uncertain results require review rather than automatic retry. */
export async function runCharrAbility({ actor, name, requestId, targets, validate, pay, resist, damage, stack } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!Object.hasOwn(CHARR_ABILITIES, name ?? "") || !writer() || !id(actor?.uuid) || !id(requestId)
    || !Array.isArray(targets) || !targets.length || targets.some(target => !id(target))
    || new Set(targets).size !== targets.length || (name === "Flame Buffet" && targets.length !== 1)
    || [validate, pay, resist, damage, ...(name === "Flame Buffet" ? [stack] : [])].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", CHARR_RECEIPTS) ?? [];
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
      if (!unchanged()) throw Error("Charr receipt changed");
      const next = structuredClone(expected); next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", CHARR_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Charr receipt unconfirmed");
      expected = next; record = next[index];
    };
    const saveResult = async (result, stage, pendingTarget) => {
      const results = structuredClone(record.results); results[results.length - 1] = result;
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
      const result = { targetUuid, passed: null, cardUuid: null, damage: null, stack: null };
      await save({ stage: "rolling", pendingTarget: targetUuid, results: [...record.results, result] });
      if (!valid(targetUuid)) return refuse("changed");
      const test = await resist(targetUuid);
      if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
      result.passed = test.passed; result.cardUuid = test.cardUuid;
      await saveResult(result, "damaging", targetUuid);
      const outcome = charrOutcome(name, result.passed);
      if (!outcome || !valid(targetUuid)) return refuse("changed");
      const claim = { valid: () => valid(targetUuid), messageUuid: result.cardUuid,
        applicationId: JSON.stringify([actor.uuid, requestId, targetUuid]) };
      const dealt = await damage(targetUuid, outcome, claim);
      if (dealt?.ok !== true || !Array.isArray(dealt.lines) || !dealt.lines.length
        || dealt.lines.some(line => typeof line !== "string")) return refuse("damageUncertain");
      result.damage = { rating: outcome.rating, school: outcome.school, lines: [...dealt.lines] };
      await saveResult(result, outcome.addStack ? "stacking" : "resolving", outcome.addStack ? targetUuid : null);
      if (!valid(targetUuid)) return refuse("changed");
      if (!outcome.addStack) continue;
      const effect = await stack(targetUuid, claim);
      if (effect?.ok !== true || !(effect.dead === true || (id(effect.effectId)
        && Number.isInteger(effect.stacks) && effect.stacks >= 1 && effect.stacks <= 5))) return refuse("effectUncertain");
      result.stack = effect.dead === true ? { skipped: "dead" } : { effectId: effect.effectId, stacks: effect.stacks };
      await saveResult(result, "resolving", null);
      if (!valid(targetUuid)) return refuse("changed");
    }
    await save({ stage: "complete" });
    return { ok: true, paid: true, results: structuredClone(record.results) };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
