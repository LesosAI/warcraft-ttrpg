import { starfallSelection } from "../rules/starfall.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = frame => {
  const words = [frame?.combatUuid, frame?.combatantId, frame?.casterUuid, frame?.cast, frame?.regionUuid];
  if (words.some(word => typeof word !== "string" || !word.trim())
    || !Number.isSafeInteger(frame?.round) || frame.round < 1
    || !Number.isSafeInteger(frame?.turn) || frame.turn < 0) return null;
  // One delivery per cast and combatant turn, even if a cast has duplicate Regions.
  return JSON.stringify([frame.combatUuid, frame.round, frame.turn, frame.combatantId, frame.casterUuid, frame.cast]);
};

/** Serialized delivery engine. All adapters are mandatory:
 * read() must establish active-GM authority, current turn, live Sustain/Region,
 * current enhancement and candidate membership; null means no authority/context.
 * Receipts must be durable and scoped by the supplied turn/cast key.
 * strike() must use the existing area mitigation/damage door, never raw Health.
 * This factory is not registered as a player query or turn hook on its own.
 */
export function createStarfallDelivery({ read, readReceipt, writeReceipt, strike }) {
  if ([read, readReceipt, writeReceipt, strike].some(fn => typeof fn !== "function")) throw Error("Starfall requires all delivery adapters");
  let queue = Promise.resolve();
  const uncertain = new Set();
  return function deliver(chosen) {
    const selected = Array.isArray(chosen) ? [...chosen] : chosen;
    const run = async () => {
      const frame = await read();
      const key = identity(frame);
      if (!key) return { ok: false, reason: "context" };
      if (uncertain.has(key)) return { ok: false, reason: "review" };
      const prior = await readReceipt(key);
      if (prior != null) return { ok: false, reason: prior.state === "done" ? "used" : "review" };
      const plan = starfallSelection({ ...frame, selected });
      if (!plan.ok) return plan;
      let receipt = { version: 1, key, state: "claimed", regionUuid: frame.regionUuid,
        targets: plan.targets, completed: [], attempted: null };
      const frameCurrent = async () => {
        const next = await read();
        if (identity(next) !== key || next.regionUuid !== frame.regionUuid) return false;
        const fresh = starfallSelection({ ...next, selected });
        return fresh.ok && fresh.limit === plan.limit && same(fresh.targets, plan.targets);
      };
      const current = async () => await frameCurrent() && same(await readReceipt(key), receipt);
      const save = async next => {
        await writeReceipt(key, structuredClone(next));
        if (!same(await readReceipt(key), next)) throw Error("Starfall receipt not confirmed");
        receipt = next;
      };
      try {
        if (!await frameCurrent()) return { ok: false, reason: "changed" };
        await save(receipt);
        for (const uuid of plan.targets) {
          if (!await current()) return { ok: false, reason: "changed" };
          await save({ ...receipt, attempted: uuid });
          if (!await current()) return { ok: false, reason: "changed" };
          await strike({ uuid, damage: { ...plan.damage }, frame: structuredClone(frame) });
          if (!await current()) return { ok: false, reason: "changed" };
          await save({ ...receipt, completed: [...receipt.completed, uuid], attempted: null });
        }
        if (!await current()) return { ok: false, reason: "changed" };
        await save({ ...receipt, state: "done" });
        return { ok: true, targets: [...plan.targets] };
      } catch {
        // A write or strike may have succeeded before throwing. Keep its
        // durable attempt and refuse replay; never roll back or refund damage.
        uncertain.add(key);
        return { ok: false, reason: "review" };
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  };
}
