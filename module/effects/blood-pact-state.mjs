export const BLOOD_PACT_RECEIPTS = "bloodPactReceipts";
const busy = new Set();
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
  && fromUuidSync(actor?.uuid) === actor;

/** Claim payment and each recipient before doing work. An uncertain write is
 * left for reconciliation, never treated as permission to grant another buffer.
 */
export async function runBloodPact({ actor, requestId, targets, validate, pay, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(actor?.uuid) || !writer(actor) || !id(requestId) || !Array.isArray(targets)
      || !targets.length || targets.some(t => !id(t)) || new Set(targets).size !== targets.length
      || [validate, pay, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", BLOOD_PACT_RECEIPTS) ?? [];
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(r => r?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(r => !["complete", "cancelled"].includes(r?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => writer(actor) && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Blood Pact receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", BLOOD_PACT_RECEIPTS, next);
      if (!writer(actor) || !same(read(), next)) throw Error("Blood Pact receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, targets: [...targets], stage: "paying", paid: null, pending: null, results: [] });
    if (!valid()) return refuse("changed");
    const paid = await pay();
    if (paid !== true) {
      if (paid === false) await save({ stage: "cancelled", paid: false });
      return refuse(paid === false ? "paymentRefused" : "paymentUncertain");
    }
    await save({ stage: "applying", paid: true });
    for (const uuid of targets) {
      if (!valid()) return refuse("changed");
      await save({ pending: uuid });
      const result = await apply(uuid, { valid });
      if (result?.ok !== true || typeof result.landed !== "boolean" || (result.landed && !id(result.effectId))) return refuse("grantUncertain");
      await save({ results: [...record.results, { uuid, landed: result.landed, effectId: result.effectId ?? null }], pending: null });
    }
    await save({ stage: "complete" });
    return { ok: true, requestId, results: record.results };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
