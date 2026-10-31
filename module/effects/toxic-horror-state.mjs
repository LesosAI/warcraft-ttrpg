import { TOXIC_POISONS } from "../rules/toxic-horror.mjs";
export const TOXIC_RECEIPTS = "toxicHorrorReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Internal active-GM controller. The query adapter supplies authenticated
 * geometry, payment, real resistance cards and layToxicPoison callbacks. */
export async function runToxicPoison({ actor, kind, requestId, targets, validate, pay, resist, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !id(actor?.uuid) || !Object.hasOwn(TOXIC_POISONS, kind ?? "") || !id(requestId)
    || !Array.isArray(targets) || !targets.length || targets.some(t => !id(t))
    || new Set(targets).size !== targets.length || (kind === "localized" && targets.length !== 1)
    || [validate, pay, resist, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", TOXIC_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = async target => unchanged() && await validate(target) && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Toxic Horror receipt changed");
      const next = structuredClone(expected);
      next[index] = { ...record, ...patch };
      await actor.setFlag("azeroth-rpg", TOXIC_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Toxic Horror receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!await valid()) return refuse("changed");
    await save({ requestId, kind, targets: [...targets], stage: "paying", paid: null, consumed: null, results: [] });
    if (!await valid()) return refuse("changed");
    // Localized Toxin's adapter reports consumed=true when no limited use is
    // required. Deadly Poison must confirm both action and encounter-use writes.
    const payment = await pay();
    if (payment?.paid !== true || payment?.consumed !== true) {
      await save({ stage: payment?.paid === false && payment?.consumed === false ? "cancelled" : "unresolved",
        paid: payment?.paid ?? null, consumed: payment?.consumed ?? null });
      return refuse("payment");
    }
    await save({ stage: "resolving", paid: true, consumed: true });
    for (const target of targets) {
      if (!await valid(target)) return refuse("changed");
      await save({ stage: "rolling", pendingTarget: target });
      if (!await valid(target)) return refuse("changed");
      const test = await resist(target);
      if (typeof test?.passed !== "boolean" || !id(test.cardId)) return refuse("testUncertain");
      const result = { targetUuid: target, passed: test.passed, cardId: test.cardId,
        // JSON tuple encoding avoids collisions between arbitrary UUID/request strings.
        exposureId: JSON.stringify([actor.uuid, requestId, kind, target]),
        stage: test.passed ? "complete" : "applying", outcome: null };
      await save({ stage: "resolving", pendingTarget: null, results: [...record.results, result] });
      if (test.passed) continue;
      if (!await valid(target)) return refuse("changed");
      // The persisted applying row is the mutation claim. Do not enter the
      // effect helper until its acknowledgement has been verified by save().
      const outcome = await apply(target, { kind, exposureId: result.exposureId, valid: () => valid(target) });
      if (outcome?.ok !== true || typeof outcome.applied !== "boolean"
        || (outcome.applied && !id(outcome.effectId))
        || (!outcome.applied && !["immune", "duplicate", "existing"].includes(outcome.reason))) return refuse("outcomeUncertain");
      const results = structuredClone(record.results);
      results[results.length - 1] = { ...result, stage: "complete", outcome: structuredClone(outcome) };
      await save({ results });
    }
    if (!unchanged() || record.results.length !== targets.length || record.results.some(r => r.stage !== "complete")) return refuse("incomplete");
    await save({ stage: "complete" });
    return { ok: true, paid: true, consumed: true, results: structuredClone(record.results) };
  } catch {
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
