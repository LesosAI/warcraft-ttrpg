/** Durable claims around the three non-atomic writes of a paid attack.
 * The adapter validates ownership, the declared attack, target and resources.
 * Unknown acknowledgements block another attempt until reconciled.
 */
export const LASH_RECEIPTS = "lashOfPainReceipts";
const busy = new Set();
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function runLashOfPain({ actor, requestId, targetUuid, validate, payAction, payMana, roll } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !id(actor?.uuid) || !id(requestId) || !id(targetUuid)
      || [validate, payAction, payMana, roll].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", LASH_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(r => r?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(r => !["complete", "cancelled"].includes(r?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Lash receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", LASH_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Lash receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, targetUuid, stage: "payingAction", actionPaid: null, manaPaid: null, messageUuid: null });
    if (!valid()) return refuse("changed");
    const action = await payAction();
    if (action !== true) {
      await save({ stage: action === false ? "cancelled" : "unresolved", actionPaid: action === false ? false : null });
      return refuse("action");
    }
    await save({ stage: "payingMana", actionPaid: true });
    if (!valid()) return refuse("changed");
    if (await payMana() !== true) return refuse("manaUncertain");
    await save({ stage: "rolling", manaPaid: true });
    if (!valid()) return refuse("changed");
    const result = await roll({ valid });
    if (!id(result?.messageUuid) || typeof result.passed !== "boolean") return refuse("rollUncertain");
    // Attack resolution may move or defeat the target. Record the confirmed
    // card without trying to re-run pre-attack target eligibility afterward.
    await save({ stage: "complete", messageUuid: result.messageUuid, passed: result.passed });
    return { ok: true, messageUuid: result.messageUuid, passed: result.passed };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
