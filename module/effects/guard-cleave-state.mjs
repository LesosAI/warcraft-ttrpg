/** Durable Guard Cleave receipt. The authorized GM handler owns target review,
 * action/use payment and ordinary strikes. Uncertain attempts never auto-replay. */
export const GUARD_CLEAVE_RECEIPTS = "guardCleaveReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function runGuardCleave({ actor, requestId, validate, pay, roll } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !actor?.uuid || typeof requestId !== "string" || !requestId.trim()
    || typeof validate !== "function" || typeof pay !== "function" || typeof roll !== "function") return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", GUARD_CLEAVE_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let records, record, paymentStarted = false;
  const save = async next => {
    if (!current()) throw new Error("Guard Cleave writer changed");
    await actor.setFlag("azeroth-rpg", GUARD_CLEAVE_RECEIPTS, [...records, next]);
    if (!current() || JSON.stringify(read()) !== JSON.stringify([...records, next])) throw new Error("Guard Cleave receipt unconfirmed");
    record = next;
  };
  try {
    records = read();
    if (!Array.isArray(records)) return refuse("receiptInvalid");
    if (records.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (records.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    if (!current() || !await validate() || !current()) return refuse("changed");
    await save({ requestId, stage: "claimed", paid: false, consumed: false, cards: [], skipped: [] });
    const valid = async () => current() && JSON.stringify(read()) === JSON.stringify([...records, record])
      && await validate() && current() && JSON.stringify(read()) === JSON.stringify([...records, record]);
    if (!await valid()) { await save({ ...record, stage: "cancelled" }); return refuse("changed"); }
    const result = await roll({ valid, pay: async () => {
      if (paymentStarted || !await valid()) return false;
      paymentStarted = true;
      await save({ ...record, stage: "paying", paid: null, consumed: null });
      if (!await valid()) return false;
      const payment = await pay();
      if (payment?.paid !== true || payment.consumed !== true) {
        await save({ ...record, stage: payment?.paid === false && payment.consumed === false ? "cancelled" : "unresolved",
          paid: payment?.paid ?? null, consumed: payment?.consumed ?? null });
        return false;
      }
      await save({ ...record, stage: "striking", paid: true, consumed: true });
      return await valid();
    } });
    const cards = result?.cards ?? [], skipped = result?.skipped ?? [];
    if (!Array.isArray(cards) || cards.length > 2 || cards.some(id => typeof id !== "string" || !id)
      || new Set(cards).size !== cards.length || !Array.isArray(skipped)) return refuse("resultInvalid");
    const complete = result?.ok === true && record.paid === true && record.consumed === true && cards.length > 0;
    const stage = complete ? "complete" : !paymentStarted || record.stage === "cancelled" ? "cancelled" : "unresolved";
    await save({ ...record, stage, cards, skipped, reason: result?.reason ?? null });
    return { ok: complete, reason: complete ? null : result?.reason ?? "unresolved",
      paid: record.paid, consumed: record.consumed, cards, skipped };
  } catch (error) {
    console.warn("azeroth-rpg | Guard Cleave requires reconciliation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
