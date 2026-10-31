export const TERRIFYING_ROAR_RECEIPTS = "terrifyingRoarReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** A saved claim precedes payment and every target's Test/effect. Uncertain
 * operations remain claimed until reviewed; this function never resumes them. */
export async function runTerrifyingRoar({ actor, requestId, targets, validate, pay, resolve } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !actor?.uuid || typeof requestId !== "string" || !requestId.trim()
    || !Array.isArray(targets) || !targets.length || targets.some(id => typeof id !== "string" || !id.trim())
    || new Set(targets).size !== targets.length || [validate, pay, resolve].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", TERRIFYING_ROAR_RECEIPTS) ?? [];
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => writer() && fromUuidSync(actor.uuid) === actor && JSON.stringify(read()) === JSON.stringify(expected);
    const valid = async () => unchanged() && await validate() && unchanged();
    const save = async patch => {
      if (!unchanged()) throw new Error("Terrifying Roar receipt changed");
      const next = structuredClone(expected); next[index] = { ...record, ...patch };
      await actor.setFlag("azeroth-rpg", TERRIFYING_ROAR_RECEIPTS, next);
      if (!writer() || fromUuidSync(actor.uuid) !== actor || JSON.stringify(read()) !== JSON.stringify(next)) throw new Error("Terrifying Roar receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!await valid()) return refuse("changed");
    await save({ requestId, targets: [...targets], stage: "paying", paid: null, consumed: null, results: [] });
    if (!await valid()) return refuse("changed");
    const payment = await pay();
    if (payment?.paid !== true || payment.consumed !== true) {
      await save({ stage: payment?.paid === false && payment.consumed === false ? "cancelled" : "unresolved",
        paid: payment?.paid ?? null, consumed: payment?.consumed ?? null });
      return refuse("payment");
    }
    await save({ stage: "resolving", paid: true, consumed: true });
    if (!await valid()) return refuse("changed");
    const result = await resolve({ valid, checkpoint: async progress => {
      if (!await valid() || !Array.isArray(progress?.results) || !Number.isInteger(progress.index)
        || progress.index < 0 || progress.index >= targets.length || progress.results.length !== progress.index + 1
        || progress.results.some((row, i) => row?.index !== i || row.actorUuid !== record.targets[i])
        || !["resisting", "resisted", "inflicting", "resolved"].includes(progress.stage)) return false;
      const previous = record.progress;
      const fixed = previous ? previous.index + (previous.stage === "resolved" ? 1 : 0) : 0;
      if (previous && (progress.index < previous.index || progress.index > previous.index + 1
        || progress.index > previous.index && previous.stage !== "resolved"
        || JSON.stringify(progress.results.slice(0, fixed)) !== JSON.stringify(record.results.slice(0, fixed)))) return false;
      await save({ progress: { index: progress.index, stage: progress.stage }, results: structuredClone(progress.results) });
      return await valid();
    } });
    const complete = result?.ok === true && record.progress?.stage === "resolved"
      && record.progress.index === targets.length - 1 && record.results.length === targets.length
      && record.results.every(row => ["resisted", "frightened", "immune", "deafened", "fallen"].includes(row.outcome))
      && JSON.stringify(record.results) === JSON.stringify(result.results);
    await save({ stage: complete ? "complete" : "unresolved", reason: result?.reason ?? null });
    return { ok: complete, paid: true, consumed: true, results: record.results, reason: complete ? null : result?.reason ?? "unresolved" };
  } catch (error) {
    console.warn("azeroth-rpg | Terrifying Roar requires reconciliation", error); return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
