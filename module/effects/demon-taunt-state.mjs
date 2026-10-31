/** Durable activation state for Torment, Suffering and Soothing Kiss. The adapter authenticates
 * ownership, geometry, vision, action budget and timed effect payloads.
 * A claimed write with an uncertain result must be reconciled, never replayed.
 */
export const DEMON_TAUNT_RECEIPTS = "demonTauntReceipts";
const busy = new Set();
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function runDemonTaunt({ actor, name, requestId, targets, validate, pay, apply, clear, resist } = {}) {
  const refuse = reason => ({ ok: false, reason });
  const resistedAbility = name === "Soothing Kiss";
  if (!writer() || !id(actor?.uuid) || !id(requestId) || !["Torment", "Suffering", "Soothing Kiss"].includes(name)
      || !Array.isArray(targets) || !targets.length || targets.some(t => !id(t))
      || new Set(targets).size !== targets.length || (name !== "Suffering" && targets.length !== 1)
      || [validate, pay, apply, clear, ...(resistedAbility ? [resist] : [])].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", DEMON_TAUNT_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(r => r?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(r => !["complete", "cancelled"].includes(r?.stage))) return refuse("reconcile");
    const previous = name === "Torment" ? [...expected].reverse().find(r => r.name === "Torment" && r.stage === "complete") : null;
    const oldTargets = (previous?.targets ?? []).filter(t => !targets.includes(t));
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = () => unchanged() && validate() === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Taunt receipt changed");
      const next = structuredClone(expected);
      next[index] = structuredClone({ ...record, ...patch });
      await actor.setFlag("azeroth-rpg", DEMON_TAUNT_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Taunt receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, name, targets: [...targets], oldTargets, results: [], cleared: [], stage: "paying", paid: null });
    if (!valid()) return refuse("changed");
    const payment = await pay();
    if (payment !== true) {
      await save({ stage: payment === false ? "cancelled" : "unresolved", paid: payment === false ? false : null });
      return refuse("payment");
    }
    await save({ stage: "applying", paid: true, pendingTarget: null });
    for (const targetUuid of targets) {
      if (!valid()) return refuse("changed");
      await save({ stage: resistedAbility ? "rolling" : "applying", pendingTarget: targetUuid });
      if (!valid()) return refuse("changed");
      const entry = { targetUuid, effectId: null };
      if (resistedAbility) {
        const test = await resist(targetUuid, { valid });
        if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
        entry.passed = test.passed; entry.cardUuid = test.cardUuid;
      }
      await save({ stage: "applying", results: [...record.results, entry] });
      if (!valid()) return refuse("changed");
      if (entry.passed === true) {
        await save({ pendingTarget: null });
        continue;
      }
      const result = await apply(targetUuid, { valid, applicationId: JSON.stringify([actor.uuid, requestId, targetUuid]) });
      if (result?.ok !== true || !id(result.effectId)) return refuse("effectUncertain");
      await save({ results: [...record.results.slice(0, -1), { ...entry, effectId: result.effectId }], pendingTarget: null });
    }
    // Establish the replacement before removing the previous single-target
    // Torment. Suffering never clears Torment or another Suffering application.
    for (const targetUuid of oldTargets) {
      if (!valid()) return refuse("changed");
      await save({ stage: "clearing", pendingTarget: targetUuid });
      if (!valid()) return refuse("changed");
      if (await clear(targetUuid, { valid, name: "Torment", sourceUuid: actor.uuid }) !== true) return refuse("clearUncertain");
      await save({ cleared: [...record.cleared, targetUuid], pendingTarget: null });
    }
    if (!valid()) return refuse("changed");
    await save({ stage: "complete", pendingTarget: null });
    return { ok: true, paid: true, results: structuredClone(record.results), cleared: [...record.cleared] };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
