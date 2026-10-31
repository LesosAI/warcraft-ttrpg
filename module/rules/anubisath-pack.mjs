/** Anubisath Sentinel pack law. All identities are concrete actor UUIDs,
 * including synthetic token actors; never compendium IDs or actor names.
 * Runtime callers persist the assignment and claim a death before applying it.
 */
export const SENTINEL_POWERS = Object.freeze([
  "mana-burn", "mending", "shadow-storm", "thunderclap", "mortal-strike",
  "fire-arcane-reflect", "shadow-frost-reflect", "knock-away", "thorns"
]);

const identity = value => typeof value === "string" && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;
const health = member => Number.isInteger(member?.health) && member.health >= 0
  && Number.isInteger(member?.maximum) && member.maximum > 0;

/** Assignment is explicit and immutable for the encounter. The GM can choose
 * four powers or supply a shuffled list; this pure layer never rolls on load. */
export function sentinelPackAssignment({ packId, members, powers } = {}) {
  if (!identity(packId) || !Array.isArray(members) || members.length !== 4
    || !members.every(identity) || !unique(members)) {
    return { ok: false, reason: "Choose four different Sentinel actors for this pack." };
  }
  if (!Array.isArray(powers) || powers.length !== 4 || !unique(powers)
    || !powers.every(power => SENTINEL_POWERS.includes(power))) {
    return { ok: false, reason: "Choose four different Sentinel powers." };
  }
  return { ok: true, pack: { id: packId, members: members.map((uuid, index) => ({
    uuid, original: powers[index]
  })) } };
}

/** Reject incomplete or corrupt stored membership instead of reconstructing
 * it from nearby actors. A missing member does not admit a replacement. */
export function validSentinelPack(pack) {
  if (!pack || !Array.isArray(pack.members)) return false;
  return sentinelPackAssignment({ packId: pack.id,
    members: pack.members.map(member => member?.uuid),
    powers: pack.members.map(member => member?.original) }).ok;
}

/** Return the original powers whose bearers have fallen. Receipts are UUIDs
 * from this exact persisted pack, not inherited power lists on dead actors. */
export function sentinelKnownPowers(pack, memberUuid, fallen = []) {
  if (!validSentinelPack(pack) || !Array.isArray(fallen)) return [];
  const member = pack.members.find(row => row.uuid === memberUuid);
  if (!member) return [];
  return [member.original, ...pack.members.filter(row => row.uuid !== memberUuid
    && fallen.includes(row.uuid)).map(row => row.original)];
}

/** Plan one observed living-to-dead transition. `claimed` contains persisted
 * death receipts. The runtime must claim before any writes, then record each
 * confirmed recipient separately; an uncertain write must never be replayed.
 * Healing is an explicit tabletop amount, not a claim about client scaling.
 */
export function sentinelDeathPlan({ pack, sourceUuid, previousHealth, members,
  claimed = [], healing } = {}) {
  if (!validSentinelPack(pack) || !Array.isArray(members)
    || !Array.isArray(claimed) || !claimed.every(identity)
    || !Number.isInteger(healing) || healing < 0) {
    return { ok: false, reason: "The Sentinel pack state is incomplete." };
  }
  const original = pack.members.find(member => member.uuid === sourceUuid);
  if (!original || claimed.includes(sourceUuid)) {
    return { ok: false, reason: "This death has already been claimed or is outside this pack." };
  }
  if (!members.every(member => identity(member?.uuid))
    || !unique(members.map(member => member.uuid))) {
    return { ok: false, reason: "The Sentinel actors could not be identified uniquely." };
  }
  const source = members.find(member => member.uuid === sourceUuid);
  if (!health(source) || source.packId !== pack.id || source.health !== 0
    || !Number.isInteger(previousHealth) || previousHealth <= 0) {
    return { ok: false, reason: "Power transfers only when a living Sentinel falls." };
  }
  const recipients = [];
  const unavailable = [];
  for (const assigned of pack.members) {
    if (assigned.uuid === sourceUuid) continue;
    const member = members.find(candidate => candidate.uuid === assigned.uuid);
    if (!health(member) || member.packId !== pack.id) {
      unavailable.push(assigned.uuid);
      continue;
    }
    if (member.health === 0) continue;
    recipients.push({ uuid: member.uuid, power: original.original,
      healing: Math.min(healing, Math.max(0, member.maximum - member.health)) });
  }
  return { ok: true, claim: sourceUuid, packId: pack.id, recipients, unavailable };
}
