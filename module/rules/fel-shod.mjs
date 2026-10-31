/** Fel-shod's ground fire is presentation only: no damage, radius of effect,
 * movement cost or ongoing condition is supplied by the authored rule. */
export const FEL_SHOD_GROUND = "felShodGround";
const id = value => typeof value === "string" && value.trim().length > 0;

export function felShodExpiry({ time, combat = null } = {}) {
  if (!Number.isFinite(time) || time < 0) return null;
  if (!combat) return { time: time + 6 };
  if (![combat.id, combat.combatantId].every(id) || !Number.isSafeInteger(combat.round) || combat.round < 1
    || !Number.isSafeInteger(combat.turn) || combat.turn < 0
    || !Number.isSafeInteger(combat.sourceTurn) || combat.sourceTurn < 0) return null;
  return { combatId: combat.id, combatantId: combat.combatantId,
    round: combat.round + (combat.sourceTurn > combat.turn ? 0 : 1) };
}

/** Current source index is supplied afresh, so reordering initiative cannot
 * give the fire the lifetime of another creature's turn. */
export function felShodExpired(expiry, { time, combat = null } = {}) {
  if (!expiry || typeof expiry !== "object") return true;
  if (!expiry.combatId) return Number.isFinite(expiry.time) && Number.isFinite(time) && time >= expiry.time;
  if (!combat || combat.id !== expiry.combatId || combat.started !== true || combat.sourceTurn < 0) return true;
  return combat.round > expiry.round || (combat.round === expiry.round && combat.turn > combat.sourceTurn);
}

/** The small marker is sized in pixels for legibility, not as a gameplay area. */
export function felShodMarker({ messageUuid, sourceTokenUuid, targetTokenUuid, sceneId, levelId,
  x, y, elevation, gridSize, expiry } = {}) {
  if (![messageUuid, sourceTokenUuid, targetTokenUuid, sceneId, levelId].every(id)
    || ![x, y, elevation, gridSize].every(Number.isFinite) || gridSize <= 0 || !expiry) return null;
  return { key: JSON.stringify([messageUuid, targetTokenUuid]), messageUuid, sourceTokenUuid, targetTokenUuid,
    sceneId, levelId, x, y, elevation, radius: gridSize / 4, expiry: structuredClone(expiry) };
}
