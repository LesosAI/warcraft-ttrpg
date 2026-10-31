export const VICIOUS_REND_RECEIPTS = "viciousRendReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Claim before payment; retain uncertain strikes, resistance rolls and moves.
 * resolve owns the hit check and push, and receives the actual attack card. */
export async function runViciousRend({ actor, requestId, validate, pay, roll, resolve } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !actor?.uuid || typeof requestId !== "string" || !requestId.trim()
    || [validate, pay, roll, resolve].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", VICIOUS_REND_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let records, record, paymentStarted = false;
  const save = async next => {
    if (!current()) throw new Error("Vicious Rend writer changed");
    await actor.setFlag("azeroth-rpg", VICIOUS_REND_RECEIPTS, [...records, next]);
    if (!current() || JSON.stringify(read()) !== JSON.stringify([...records, next])) throw new Error("Vicious Rend receipt unconfirmed");
    record = next;
  };
  try {
    records = read();
    if (!Array.isArray(records)) return refuse("receiptInvalid");
    if (records.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (records.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    if (!current() || !await validate() || !current()) return refuse("changed");
    await save({ requestId, stage: "claimed", paid: false, consumed: false, attackCardId: null });
    const valid = async () => current() && JSON.stringify(read()) === JSON.stringify([...records, record])
      && await validate() && current() && JSON.stringify(read()) === JSON.stringify([...records, record]);
    const strike = await roll({ valid, pay: async () => {
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
    const card = strike?.card;
    if (!strike?.ok || !card?.id || record.paid !== true || record.consumed !== true) {
      await save({ ...record, stage: !paymentStarted || record.stage === "cancelled" ? "cancelled" : "unresolved", attackCardId: card?.id ?? null });
      return refuse(strike?.reason ?? "strikeUnresolved");
    }
    await save({ ...record, stage: "resolving", attackCardId: card.id });
    if (!await valid()) return refuse("changed");
    const result = await resolve({ card, valid, checkpoint: async details => {
      if (!await valid()) return false;
      await save({ ...record, progress: details });
      return await valid();
    } });
    await save({ ...record, stage: result?.ok === true ? (result.pending === true ? "awaitingApply" : "complete") : "unresolved", result });
    return { ok: result?.ok === true, paid: true, consumed: true, attackCardId: card.id, result };
  } catch (error) {
    console.warn("azeroth-rpg | Vicious Rend requires reconciliation", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}

/** Continue only from the normal attack's accepted Apply. The caller verifies
 * ownership, tokens and the Apply event; this door claims the saved attack
 * before resistance/movement, without paying or rolling the attack again. */
export async function resumeViciousRend({ actor, card, validate, resolve } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !actor?.uuid || !card?.id || typeof validate !== "function"
    || typeof resolve !== "function") return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", VICIOUS_REND_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor && game.messages?.get(card.id) === card;
  let expected;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    const matches = expected.map((row, index) => ({ row, index })).filter(({ row }) => row?.attackCardId === card.id);
    if (matches.length !== 1) return refuse("receiptInvalid");
    const { row, index } = matches[0];
    if (row.stage !== "awaitingApply" || row.paid !== true || row.consumed !== true) return refuse("alreadyClaimed");
    const unchanged = () => current() && JSON.stringify(read()) === JSON.stringify(expected);
    const valid = async () => unchanged() && await validate() && unchanged();
    const save = async details => {
      if (!unchanged()) throw new Error("Vicious Rend receipt changed");
      const next = structuredClone(expected);
      next[index] = { ...next[index], ...details };
      await actor.setFlag("azeroth-rpg", VICIOUS_REND_RECEIPTS, next);
      if (!current() || JSON.stringify(read()) !== JSON.stringify(next)) throw new Error("Vicious Rend receipt unconfirmed");
      expected = next;
    };
    if (!await valid()) return refuse("changed");
    await save({ stage: "resolving", result: null });
    if (!await valid()) return refuse("changed");
    const result = await resolve({ card, valid, checkpoint: async progress => {
      if (!await valid()) return false;
      await save({ progress });
      return await valid();
    } });
    // A resumed Apply must finish or remain uncertain; it cannot enqueue itself.
    const ok = result?.ok === true && result.pending !== true;
    await save({ stage: ok ? "complete" : "unresolved", result });
    return { ok, paid: true, consumed: true, attackCardId: card.id, result };
  } catch (error) {
    console.warn("azeroth-rpg | Vicious Rend Apply requires reconciliation", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
