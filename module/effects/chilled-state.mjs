export const CHILLED_RECEIPTS = "chilledReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Single-target use controller. The authenticated query adapter supplies
 * synchronous identity/geometry validation and real payment, Test and effect
 * callbacks. Every irreversible step has a verified persistent claim first. */
export async function runChilled({ actor, requestId, targetUuid, validate, pay, resist, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !id(actor?.uuid) || !id(requestId) || !id(targetUuid)
    || [validate, pay, resist, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", CHILLED_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Chilled receipt changed");
      const next = structuredClone(expected);
      next[index] = { ...record, ...patch };
      await actor.setFlag("azeroth-rpg", CHILLED_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Chilled receipt unconfirmed");
      expected = next;
      record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, targetUuid, stage: "paying", paid: null });
    if (!valid()) return refuse("changed");
    const paid = await pay();
    if (paid !== true) {
      await save({ stage: paid === false ? "cancelled" : "unresolved", paid: paid === false ? false : null });
      return refuse("payment");
    }
    await save({ stage: "rolling", paid: true });
    if (!valid()) return refuse("changed");
    const test = await resist();
    if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
    await save({ stage: test.passed ? "complete" : "applying", passed: test.passed, cardUuid: test.cardUuid });
    if (test.passed) return { ok: true, passed: true, cardUuid: test.cardUuid, applied: false };
    if (!valid()) return refuse("changed");
    const outcome = await apply({ messageUuid: test.cardUuid, valid });
    if (outcome?.ok !== true || !id(outcome.effectId)) return refuse("outcomeUncertain");
    await save({ stage: "complete", effectId: outcome.effectId });
    return { ok: true, passed: false, cardUuid: test.cardUuid, applied: true, effectId: outcome.effectId };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
