export const ROYAL_TRAMPLE_RECEIPTS = "royalTrampleReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** One claimed area attack, with ordered durable checkpoints for every target.
 * Uncertain payment, cards or writes require reconciliation, never replay. */
export async function runRoyalTrample({ actor, requestId, targets, validate, pay, roll } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !actor?.uuid || typeof requestId !== "string" || !requestId.trim()
    || !Array.isArray(targets) || !targets.length || targets.some(id => typeof id !== "string" || !id.trim())
    || new Set(targets).size !== targets.length || [validate, pay, roll].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", ROYAL_TRAMPLE_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record, paymentStarted = false;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && JSON.stringify(read()) === JSON.stringify(expected);
    const valid = async () => unchanged() && await validate() && unchanged();
    const save = async patch => {
      if (!unchanged()) throw new Error("Royal Trample receipt changed");
      const next = structuredClone(expected);
      next[index] = { ...record, ...patch };
      await actor.setFlag("azeroth-rpg", ROYAL_TRAMPLE_RECEIPTS, next);
      if (!current() || JSON.stringify(read()) !== JSON.stringify(next)) throw new Error("Royal Trample receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!await valid()) return refuse("changed");
    await save({ requestId, targets: [...targets], stage: "claimed", paid: false, consumed: false, through: -1, cards: [], skipped: [] });
    const result = await roll({ valid, pay: async () => {
      if (paymentStarted || !await valid()) return false;
      paymentStarted = true;
      await save({ stage: "paying", paid: null, consumed: null });
      if (!await valid()) return false;
      const payment = await pay();
      if (payment?.paid !== true || payment.consumed !== true) {
        await save({ stage: payment?.paid === false && payment.consumed === false ? "cancelled" : "unresolved",
          paid: payment?.paid ?? null, consumed: payment?.consumed ?? null });
        return false;
      }
      await save({ stage: "striking", paid: true, consumed: true });
      return await valid();
    }, checkpoint: async ({ strike, uuid, cards, skipped } = {}) => {
      if (!await valid() || strike !== record.through + 1 || uuid !== record.targets[strike]
        || !Array.isArray(cards) || !Array.isArray(skipped) || cards.length + skipped.length > strike + 1
        || cards.some(id => typeof id !== "string" || !id) || new Set(cards).size !== cards.length
        || JSON.stringify(cards.slice(0, record.cards.length)) !== JSON.stringify(record.cards)
        || JSON.stringify(skipped.slice(0, record.skipped.length)) !== JSON.stringify(record.skipped)) return false;
      await save({ through: strike, cards: [...cards], skipped: structuredClone(skipped) });
      return await valid();
    } });
    const complete = result?.ok === true && record.paid === true && record.consumed === true
      && record.through === targets.length - 1 && record.cards.length > 0
      && record.cards.length + record.skipped.length === targets.length
      && JSON.stringify(result.cards) === JSON.stringify(record.cards)
      && JSON.stringify(result.skipped) === JSON.stringify(record.skipped);
    await save({ stage: complete ? "complete" : !paymentStarted || record.stage === "cancelled" ? "cancelled" : "unresolved",
      reason: result?.reason ?? null });
    return { ok: complete, paid: record.paid, consumed: record.consumed, cards: record.cards,
      skipped: record.skipped, reason: complete ? null : result?.reason ?? "unresolved" };
  } catch (error) {
    console.warn("azeroth-rpg | Royal Trample requires reconciliation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
