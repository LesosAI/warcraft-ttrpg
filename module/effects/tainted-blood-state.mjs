export const TAINTED_BLOOD_RECEIPTS = "taintedBloodReceipts";
const busy = new Set();
const identity = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = actor => globalThis.game?.user?.isGM === true
  && game.users?.activeGM?.id === game.user.id && fromUuidSync(actor?.uuid) === actor;

/** Record the Action, use and effect writes separately. Uncertain writes
 * require reconciliation; another request cannot pay or apply them again. */
export async function runTaintedBlood({ actor, requestId, validate, payAction, payUse, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!identity(actor?.uuid) || !identity(requestId) || !writer(actor)
    || [validate, payAction, payUse, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", TAINTED_BLOOD_RECEIPTS) ?? [];
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receipts");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => writer(actor) && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Tainted Blood receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", TAINTED_BLOOD_RECEIPTS, next);
      if (!writer(actor) || !same(read(), next)) throw Error("Tainted Blood receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, stage: "payingAction", actionPaid: null, usePaid: null, effectId: null });
    if (!valid()) return refuse("changed");
    const action = await payAction();
    if (action !== true) {
      await save({ stage: action === false ? "cancelled" : "unresolved", actionPaid: action === false ? false : null });
      return refuse("action");
    }
    await save({ stage: "payingUse", actionPaid: true });
    if (!valid()) return refuse("changed");
    if (await payUse() !== true) return refuse("useUncertain");
    await save({ stage: "applying", usePaid: true });
    if (!valid()) return refuse("changed");
    const result = await apply({ valid });
    if (result?.ok !== true || !identity(result.effectId)) return refuse("effectUncertain");
    if (!valid()) return refuse("changed");
    await save({ stage: "complete", effectId: result.effectId });
    return { ok: true, effectId: result.effectId };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
