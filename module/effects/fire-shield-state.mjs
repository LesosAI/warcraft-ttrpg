export const FIRE_SHIELD_RECEIPTS = "fireShieldReceipts";
const busy = new Set();
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
  && fromUuidSync(actor?.uuid) === actor;

/** Persist payment and the single recipient before doing either operation.
 * An uncertain payment or effect write requires review, never another cast.
 */
export async function runFireShield({ actor, requestId, targetUuid, validate, pay, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!id(actor?.uuid) || !writer(actor) || !id(requestId) || !id(targetUuid) || targetUuid === actor.uuid
      || [validate, pay, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", FIRE_SHIELD_RECEIPTS) ?? [];
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
      if (!unchanged()) throw Error("Fire Shield receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", FIRE_SHIELD_RECEIPTS, next);
      if (!writer(actor) || !same(read(), next)) throw Error("Fire Shield receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, targetUuid, stage: "paying", paid: null, effectId: null });
    if (!valid()) return refuse("changed");
    const paid = await pay();
    if (paid !== true) {
      if (paid === false) await save({ stage: "cancelled", paid: false });
      return refuse(paid === false ? "paymentRefused" : "paymentUncertain");
    }
    await save({ stage: "applying", paid: true });
    if (!valid()) return refuse("changed");
    const result = await apply(targetUuid, { valid });
    if (result?.ok !== true || !id(result.effectId)) return refuse("grantUncertain");
    await save({ stage: "complete", effectId: result.effectId });
    return { ok: true, requestId, targetUuid, effectId: result.effectId };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
