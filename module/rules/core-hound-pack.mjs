/** Core Hound pack revival. Pure encounter state; identity is scene tokens,
 * not source actors. The adapter must persist a claim BEFORE restoring Health.
 * Claims with uncertain writes need GM resolution, never automatic retries. */
export const CORE_HOUND_PACK_FLAG = "coreHoundPack";
const id = value => typeof value === "string" && value.trim().length > 0;
const roundNumber = value => Number.isInteger(value) && value >= 0;
const own = (object, key) => Object.hasOwn(object, key);

export function seedCoreHoundPack({ sceneUuid, combatUuid, tokenUuids, round } = {}) {
  if (!id(sceneUuid) || !id(combatUuid) || !roundNumber(round)
    || !Array.isArray(tokenUuids) || tokenUuids.length < 2
    || !tokenUuids.every(value => id(value) && value.startsWith(`${sceneUuid}.Token.`)
      && id(value.slice(`${sceneUuid}.Token.`.length))
      && !value.slice(`${sceneUuid}.Token.`.length).includes("."))
    || new Set(tokenUuids).size !== tokenUuids.length) return null;
  return { version: 1, sceneUuid, combatUuid, tokenUuids: [...tokenUuids],
    round, closed: false, falls: [] };
}

export function validCoreHoundPack(state) {
  if (!state || state.version !== 1 || !seedCoreHoundPack(state)
    || typeof state.closed !== "boolean" || !Array.isArray(state.falls)) return false;
  const seen = new Set();
  return state.falls.every(fall => {
    if (!fall || !state.tokenUuids.includes(fall.tokenUuid) || seen.has(fall.tokenUuid)
      || !roundNumber(fall.round) || fall.round > state.round
      || typeof fall.claimed !== "boolean") return false;
    seen.add(fall.tokenUuid);
    return true;
  });
}

/** Call whenever member Health changes and at round end. A hound first down
 * during round N revives at the END of N+1, provided a packmate still lives.
 * Snapshot every member before planning any write. An all-down snapshot seals
 * the encounter even before the grace period ends. Removed members are unknown,
 * not dead. A changed encounter or rewind requires explicit GM reconfiguration.
 *
 * members: [{tokenUuid, health:{value,max}}]; roundEnd is never inferred.
 * Returns immutable next state and only the Health writes newly claimed now.
 */
export function coreHoundPackStep(state, { sceneUuid, combatUuid, round,
  roundEnd = false, completedRound = round, members } = {}) {
  const refuse = reason => ({ ok: false, reason, next: null, revivals: [] });
  if (!validCoreHoundPack(state)) return refuse("state");
  if (sceneUuid !== state.sceneUuid || combatUuid !== state.combatUuid) return refuse("encounter");
  if (!roundNumber(round) || round < state.round || typeof roundEnd !== "boolean") return refuse("clock");
  if (!roundNumber(completedRound) || completedRound > round || completedRound < round - 1) return refuse("clock");
  if (!Array.isArray(members) || members.length !== state.tokenUuids.length) return refuse("members");
  const snapshots = new Map();
  for (const member of members) {
    if (!member || !state.tokenUuids.includes(member.tokenUuid) || snapshots.has(member.tokenUuid)
      || !member.health || !own(member.health, "value") || !own(member.health, "max")
      || !Number.isFinite(member.health.value) || member.health.value < 0
      || !Number.isFinite(member.health.max) || member.health.max <= 0
      || member.health.value > member.health.max) return refuse("members");
    snapshots.set(member.tokenUuid, member.health);
  }
  const next = { ...state, tokenUuids: [...state.tokenUuids], round,
    falls: state.falls.map(fall => ({ ...fall })) };
  const result = { ok: true, reason: null, next, revivals: [] };
  if (state.closed) return result;
  if ([...snapshots.values()].every(health => health.value === 0)) {
    next.closed = true;
    return result;
  }
  next.falls = next.falls.filter(fall => snapshots.get(fall.tokenUuid).value === 0);
  for (const tokenUuid of state.tokenUuids) {
    if (snapshots.get(tokenUuid).value > 0) continue;
    let fall = next.falls.find(entry => entry.tokenUuid === tokenUuid);
    if (!fall) {
      fall = { tokenUuid, round, claimed: false };
      next.falls.push(fall);
    }
    if (!roundEnd || completedRound <= fall.round || fall.claimed) continue;
    fall.claimed = true;
    result.revivals.push({ tokenUuid, health: snapshots.get(tokenUuid).max });
  }
  return result;
}
