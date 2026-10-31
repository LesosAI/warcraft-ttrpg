import { sentinelPackAssignment, validSentinelPack, sentinelDeathPlan,
  sentinelKnownPowers } from "../rules/anubisath-pack.mjs";
import { halvedHealing } from "../rules/auras.mjs";
import { healingAfterBlock } from "../rules/no-healing.mjs";

export const SENTINEL_PACK = "sentinelPack";
const scope = "azeroth-rpg";
const path = `flags.${scope}.${SENTINEL_PACK}`;
const busy = new Set();
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const read = actor => actor?.flags?.[scope]?.[SENTINEL_PACK];
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sentinel = actor => actor?.type === "npc" && actor.system?.creatureAbilities?.some(
  ability => ability.name === "Sentinel Pack");

/** Explicit GM setup. A final anchor receipt commits the whole assignment:
 * interrupted setup never enables a half-written pack. Repair/reset belongs
 * to the GM setup UI, never to world-load or death hooks. */
export async function assignSentinelPack({ actors, powers, packId, valid } = {}) {
  const result = { ok: false, assigned: [], reason: "invalid" };
  if (!Array.isArray(actors) || !gmHere() || typeof valid !== "function" || !valid()) return result;
  const plan = sentinelPackAssignment({ packId, powers, members: actors.map(actor => actor?.uuid) });
  if (!plan.ok) return { ...result, reason: plan.reason };
  const allowed = () => gmHere() && valid() && actors.every(actor => present(actor)
    && sentinel(actor) && actor.system.health.value > 0);
  if (!allowed() || actors.some(actor => read(actor) != null || busy.has(actor.uuid))) return result;
  actors.forEach(actor => busy.add(actor.uuid));
  const prepared = { assignment: plan.pack, ready: false, death: null, received: [] };
  try {
    for (const actor of actors) {
      if (!allowed() || read(actor) != null) return { ...result, reason: "changed" };
      await actor.update({ [path]: structuredClone(prepared) });
      if (!present(actor) || !same(read(actor), prepared)) return { ...result, reason: "unconfirmed" };
      result.assigned.push(actor.uuid);
    }
    if (!allowed() || !actors.every(actor => same(read(actor), prepared))) return { ...result, reason: "changed" };
    const committed = { ...prepared, ready: true };
    await actors[0].update({ [path]: committed });
    if (!present(actors[0]) || !same(read(actors[0]), committed)) return { ...result, reason: "unconfirmed" };
    return { ...result, ok: true, reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel pack setup", error);
    return { ...result, reason: "writeUncertain" };
  } finally { actors.forEach(actor => busy.delete(actor.uuid)); }
}

/** Only confirmed recipient receipts unlock inherited powers. A source's
 * death claim alone is not proof that a survivor received anything. */
export function activeSentinelPowers(actor) {
  const state = read(actor), pack = state?.assignment;
  if (!validSentinelPack(pack) || !Array.isArray(state.received)) return [];
  const anchor = fromUuidSync(pack.members[0].uuid);
  if (!read(anchor)?.ready || !same(read(anchor).assignment, pack)) return [];
  return sentinelKnownPowers(pack, actor.uuid, state.received);
}

/** Explicit between-encounter reset, including repair of interrupted setup.
 * Disable the anchor first, clear surviving member records, then clear the
 * anchor last. Health is untouched. An interrupted reset stays inactive. */
export async function resetSentinelPack(source, { valid } = {}) {
  const pack = read(source)?.assignment;
  const result = { ok: false, cleared: [], missing: [], reason: "invalid" };
  if (!validSentinelPack(pack) || typeof valid !== "function") return result;
  const actors = pack.members.map(row => fromUuidSync(row.uuid)).filter(Boolean);
  const fighting = actor => (game.combats?.contents ?? []).some(combat =>
    combat.started && combat.getCombatantsByActor(actor)?.length);
  const allowed = () => gmHere() && valid() && present(source)
    && actors.every(actor => present(actor) && !fighting(actor));
  if (!allowed() || queues.has(pack.id) || actors.some(actor => busy.has(actor.uuid))) return result;
  if (actors.some(actor => read(actor) != null && !same(read(actor).assignment, pack))) return result;
  result.missing = pack.members.filter(row => !actors.some(actor => actor.uuid === row.uuid)).map(row => row.uuid);
  const anchor = actors.find(actor => actor.uuid === pack.members[0].uuid);
  const ordered = [...actors.filter(actor => actor !== anchor), ...(anchor ? [anchor] : [])];
  actors.forEach(actor => busy.add(actor.uuid));
  try {
    if (anchor && read(anchor) != null) {
      await anchor.update({ [`${path}.ready`]: false });
      if (read(anchor)?.ready !== false || !allowed()) return { ...result, reason: "changed" };
    }
    for (const actor of ordered) {
      if (!allowed() || (read(actor) != null && !same(read(actor).assignment, pack))) return { ...result, reason: "changed" };
      await actor.update({ [path]: null });
      if (!present(actor) || read(actor) != null) return { ...result, reason: "unconfirmed" };
      result.cleared.push(actor.uuid);
    }
    return { ...result, ok: true, reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel pack reset", error);
    return { ...result, reason: "writeUncertain" };
  } finally { actors.forEach(actor => busy.delete(actor.uuid)); }
}

/** Serialize simultaneous deaths within a pack, including hooked updates
 * raised while another member is being processed. No automatic retries. */
export async function transferSentinelPower(options = {}) {
  const key = read(options.source)?.assignment?.id;
  if (typeof key !== "string") return { ok: false, reason: "invalid", recipients: [] };
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(() => transfer(options));
  queues.set(key, pending);
  try { return await pending; }
  finally { if (queues.get(key) === pending) queues.delete(key); }
}

async function transfer({ source, previousHealth, healing, valid } = {}) {
  const result = { ok: false, claimed: false, recipients: [], unavailable: [], reason: "invalid" };
  const initial = read(source), pack = initial?.assignment;
  if (!validSentinelPack(pack) || typeof valid !== "function") return result;
  const anchor = fromUuidSync(pack.members[0].uuid);
  const allowed = () => gmHere() && present(source) && valid()
    && present(anchor) && read(anchor)?.ready === true
    && same(read(anchor).assignment, pack) && same(read(source)?.assignment, pack)
    && source.system.health.value === 0;
  if (!allowed() || initial.death != null) return result;
  const actors = pack.members.map(row => fromUuidSync(row.uuid)).filter(Boolean);
  const matching = actors.filter(actor => same(read(actor)?.assignment, pack));
  const snapshots = matching.map(actor => ({ uuid: actor.uuid, packId: pack.id,
    health: actor.system.health.value, maximum: actor.system.health.max }));
  const plan = sentinelDeathPlan({ pack, sourceUuid: source.uuid, previousHealth,
    members: snapshots, healing });
  if (!plan.ok) return { ...result, reason: plan.reason };
  if (actors.some(actor => busy.has(actor.uuid))) return { ...result, reason: "busy" };
  actors.forEach(actor => busy.add(actor.uuid));
  result.unavailable = plan.unavailable;
  try {
    const claim = { source: source.uuid, original: pack.members.find(row => row.uuid === source.uuid).original };
    await source.update({ [`${path}.death`]: claim });
    result.claimed = same(read(source)?.death, claim);
    if (!result.claimed || !allowed()) return { ...result, reason: "changed" };
    for (const row of plan.recipients) {
      const actor = fromUuidSync(row.uuid), before = read(actor);
      if (!allowed()) return { ...result, reason: "changed" };
      if (!present(actor) || !same(before?.assignment, pack) || actor.system.health.value <= 0) {
        result.unavailable.push(row.uuid);
        continue;
      }
      if (!Array.isArray(before.received) || before.received.includes(source.uuid)) {
        return { ...result, reason: "receiptChanged" };
      }
      // Recompute missing Health after previous writes; never overwrite a
      // concurrently changed value with the original planning snapshot.
      const current = actor.system.health.value, maximum = actor.system.health.max;
      if (!Number.isInteger(current) || !Number.isInteger(maximum) || maximum <= 0) return { ...result, reason: "healthChanged" };
      const receivedHealing = healingAfterBlock(halvedHealing(healing,
        actor.system.healingHalved === true), actor.system.healingBlocked === true);
      const value = current + Math.min(receivedHealing, Math.max(0, maximum - current));
      const received = [...before.received, source.uuid];
      await actor.update({ "system.health.value": value, [`${path}.received`]: received });
      if (!present(actor) || actor.system.health.value !== value || !same(read(actor)?.received, received)
        || !same(read(actor)?.assignment, pack)) return { ...result, reason: "unconfirmed" };
      result.recipients.push({ uuid: actor.uuid, power: row.power, healing: value - current });
    }
    return { ...result, ok: true, reason: null };
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel death transfer", error);
    return { ...result, reason: "writeUncertain" };
  } finally { actors.forEach(actor => busy.delete(actor.uuid)); }
}
