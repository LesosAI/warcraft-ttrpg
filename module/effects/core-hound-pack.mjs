/** Serialized revival writer. Foundry adapters supply live snapshots and
 * persistence; no caller-provided Health values cross a GM query boundary.
 * Persist the complete plan before any Health writes. A failed/uncertain
 * claim or Health write is reported, never replayed automatically. */
import { coreHoundPackStep } from "../rules/core-hound-pack.mjs";

const pending = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** read() returns {state, snapshot} after verifying active GM, scene, combat,
 * exact token identities and distinct writable actor instances. writeState
 * and restore must repeat those checks immediately before their own write.
 * The lock key is the persistent pack UUID, never a creature name.
 * restore(tokenUuid, health) changes current Health only. */
export async function advanceCoreHoundPack({ key, read, writeState, restore } = {}) {
  const result = { ok: false, reason: null, restored: [], uncertain: [], deferred: [] };
  if (typeof key !== "string" || !key || typeof read !== "function"
    || typeof writeState !== "function" || typeof restore !== "function") return { ...result, reason: "arguments" };
  if (pending.has(key)) return { ...result, reason: "busy" };
  const safeRead = async () => { try { return await read(); } catch { return null; } };
  pending.add(key);
  try {
    const initial = await safeRead();
    if (!initial) return { ...result, reason: "unavailable" };
    const plan = coreHoundPackStep(initial.state, initial.snapshot);
    if (!plan.ok) return { ...result, reason: plan.reason };
    if (same(initial.state, plan.next)) return { ...result, ok: true };
    // Validate again before claiming. The adapter can refuse an intervening
    // authority, clock, membership or Health change without any write.
    const before = await safeRead();
    if (!same(initial, before)) return { ...result, reason: "changed" };
    try {
      await writeState(plan.next, initial);
    } catch {
      return { ...result, reason: "claimUncertain", uncertain: plan.revivals.map(row => row.tokenUuid) };
    }
    let expected = { state: plan.next, snapshot: initial.snapshot };
    const claimed = await safeRead();
    if (!same(expected, claimed)) return { ...result, reason: "claimChanged",
      deferred: plan.revivals.map(row => row.tokenUuid) };
    for (let index = 0; index < plan.revivals.length; index++) {
      const revival = plan.revivals[index];
      const current = await safeRead();
      if (!same(expected, current)) {
        result.reason = "changed";
        result.deferred.push(...plan.revivals.slice(index).map(row => row.tokenUuid));
        return result;
      }
      try {
        await restore(revival.tokenUuid, revival.health, expected);
      } catch {
        result.reason = "restoreUncertain";
        result.uncertain.push(revival.tokenUuid);
        result.deferred.push(...plan.revivals.slice(index + 1).map(row => row.tokenUuid));
        return result;
      }
      expected = { ...expected, snapshot: { ...expected.snapshot,
        members: expected.snapshot.members.map(member => member.tokenUuid === revival.tokenUuid
          ? { ...member, health: { ...member.health, value: revival.health } } : member) } };
      const after = await safeRead();
      if (!same(expected, after)) {
        result.reason = "restoreUnverified";
        result.uncertain.push(revival.tokenUuid);
        result.deferred.push(...plan.revivals.slice(index + 1).map(row => row.tokenUuid));
        return result;
      }
      result.restored.push(revival.tokenUuid);
    }
    return { ...result, ok: true };
  } catch {
    return { ...result, reason: "unavailable" };
  } finally {
    pending.delete(key);
  }
}
