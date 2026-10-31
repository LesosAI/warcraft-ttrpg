export const GALE_RECEIPTS = "envelopingGaleReceipts";
const busy = new Set();
const writer = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const id = value => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One payment, independently recorded saves, and one conditional stun per
 * target. The GM adapter supplies authenticated geometry, actual rolls and
 * condition writes. Uncertain work remains claimed rather than replayed. */
export async function runEnvelopingGale({ actor, requestId, targets, validate, pay, resist, apply } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !id(actor?.uuid) || !id(requestId) || !Array.isArray(targets) || !targets.length
    || targets.some(target => !id(target)) || new Set(targets).size !== targets.length
    || [validate, pay, resist, apply].some(fn => typeof fn !== "function")) return refuse("invalid");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const read = () => actor.getFlag("azeroth-rpg", GALE_RECEIPTS) ?? [];
  const current = () => writer() && fromUuidSync(actor.uuid) === actor;
  let expected, record;
  try {
    expected = structuredClone(read());
    if (!Array.isArray(expected)) return refuse("receiptInvalid");
    if (expected.some(row => row?.requestId === requestId)) return refuse("alreadyClaimed");
    if (expected.some(row => !["complete", "cancelled"].includes(row?.stage))) return refuse("reconcile");
    const index = expected.length;
    const unchanged = () => current() && same(read(), expected);
    const valid = target => unchanged() && validate(target) === true && unchanged();
    const save = async patch => {
      if (!unchanged()) throw Error("Gale receipt changed");
      const next = structuredClone(expected); next[index] = { ...record, ...patch };
      await actor.setFlag("azeroth-rpg", GALE_RECEIPTS, next);
      if (!current() || !same(read(), next)) throw Error("Gale receipt unconfirmed");
      expected = next; record = next[index];
    };
    if (!valid()) return refuse("changed");
    await save({ requestId, targets: [...targets], stage: "paying", paid: null, results: [] });
    if (!valid()) return refuse("changed");
    const payment = await pay();
    if (payment !== true) {
      await save({ stage: payment === false ? "cancelled" : "unresolved", paid: payment === false ? false : null });
      return refuse("payment");
    }
    await save({ stage: "resolving", paid: true });
    for (const targetUuid of targets) {
      if (!valid(targetUuid)) return refuse("changed");
      await save({ stage: "rolling", pendingTarget: targetUuid });
      if (!valid(targetUuid)) return refuse("changed");
      const test = await resist(targetUuid);
      if (typeof test?.passed !== "boolean" || !id(test.cardUuid)) return refuse("testUncertain");
      const result = { targetUuid, passed: test.passed, cardUuid: test.cardUuid, applied: false, immune: false };
      await save({ stage: test.passed ? "resolving" : "applying", pendingTarget: test.passed ? null : targetUuid,
        results: [...record.results, result] });
      if (test.passed) continue;
      if (!valid(targetUuid)) return refuse("changed");
      const outcome = await apply(targetUuid, { messageUuid: test.cardUuid, valid: () => valid(targetUuid) });
      if (outcome?.ok !== true || !(outcome.immune === true || id(outcome.effectId))) return refuse("effectUncertain");
      const results = structuredClone(record.results);
      results[results.length - 1] = { ...result, immune: outcome.immune === true,
        applied: outcome.immune !== true, effectId: outcome.immune === true ? null : outcome.effectId };
      await save({ stage: "resolving", pendingTarget: null, results });
    }
    if (!unchanged()) return refuse("changed");
    await save({ stage: "complete" });
    return { ok: true, paid: true, results: structuredClone(record.results) };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(actor.uuid); }
}
