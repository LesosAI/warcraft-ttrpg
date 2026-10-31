// What a Use's card records for the animation layer (the Legacy branches' door 2).
import { stepRecord } from "../rules/animation-records.mjs";

/** Read-only native walking preview. Rocket Jump changes Opportunity Attacks,
 * not collision, terrain price, destination occupancy or the actor's Speed. */
export function planRocketJump(token, destination) {
  const no = reason => ({ ok: false, reason });
  const scene = token?.parent, object = token?.object, grid = scene?.grid;
  const bounds = globalThis.canvas?.dimensions?.sceneRect;
  const speed = token?.actor?.system?.speed;
  if (!scene || globalThis.canvas?.scene !== scene || scene.tokens?.get(token.id) !== token
    || !object || typeof object.checkCollision !== "function"
    || typeof object.measureMovementPath !== "function" || typeof object.createTerrainMovementPath !== "function"
    || typeof token.getSnappedPosition !== "function" || typeof token.getMovementOrigin !== "function"
    || ![grid?.size, bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(Number.isFinite)
    || grid.size <= 0) return no("geometry");
  if (!Number.isFinite(speed) || speed <= 0) return no("stopped");
  if (![destination?.x, destination?.y].every(Number.isFinite)) return no("destination");
  try {
    const to = grid.isGridless ? { x: Math.round(destination.x), y: Math.round(destination.y) }
      : token.getSnappedPosition({ ...token._source, x: destination.x, y: destination.y });
    if (![to.x, to.y].every(Number.isFinite)) return no("destination");
    if (to.x === token.x && to.y === token.y) return no("same");
    const width = token.width * grid.size, height = token.height * grid.size;
    if (![width, height].every(n => Number.isFinite(n) && n > 0)
      || to.x < bounds.x || to.y < bounds.y || to.x + width > bounds.x + bounds.width
      || to.y + height > bounds.y + bounds.height) return no("bounds");
    for (const other of scene.tokens.values()) {
      if (other === token || !other.actor || other.level !== token.level) continue;
      if (to.x < other.x + other.width * grid.size && to.x + width > other.x
        && to.y < other.y + other.height * grid.size && to.y + height > other.y) return no("occupied");
    }
    const from = { x: token.x, y: token.y };
    const origin = token.getMovementOrigin(token._source);
    const end = token.getMovementOrigin({ ...token._source, ...to });
    if (object.checkCollision(end, { origin, type: "move", mode: "any" }) !== false) return no("blocked");
    const waypoint = p => ({ ...p, elevation: token.elevation, level: token.level, action: "walk" });
    const path = object.createTerrainMovementPath([waypoint(from), waypoint(to)]);
    const cost = object.measureMovementPath(path, { preview: true }).cost;
    if (!Number.isFinite(cost) || cost <= 0 || cost > speed) return no("cost");
    return { ok: true, from, to: { x: to.x, y: to.y }, cost, speed,
      elevation: token.elevation, level: token.level };
  } catch { return no("geometry"); }
}

/**
 * **THE MOVE ROCKET JUMP'S CARD RECORDS FOR THE ANIMATION LAYER** (the B8a2 pass, in the
 * shape `rules/animation-records.mjs#stepRecord` governs): the one move a COMPLETED jump made,
 * the token's centre before and after, as the card's `steps`. `module/animation/records.mjs
 * #cardRecords` reads it into a `use` record and an `arrive` record, which play the take-off
 * and the landing. **The landing is the plan's, never the token's**: a token's document is
 * interpolated while it travels (D-669). A jump stopped or prevented records no move, so
 * nothing is drawn for a flight that did not happen.
 *
 * @param {{sceneId?: string|null, tokenId?: string|null, from?: {x: number, y: number}|null,
 *   to?: {x: number, y: number}|null, width?: number, height?: number, sizeX?: number,
 *   sizeY?: number, moved?: boolean}} o  `from` and `to` the token's TOP-LEFT before and
 *   after; `width` and `height` its squares; `sizeX` and `sizeY` the grid's pixels a square
 * @returns {object[]}  one move, or none
 */
export function rocketJumpSteps({ sceneId = null, tokenId = null, from = null, to = null, width = 1, height = 1, sizeX = 100, sizeY = 100, moved = false } = {}) {
  const step = moved === true ? stepRecord({ sceneId, tokenId, kind: "self", from, to, width, height, sizeX, sizeY }) : null;
  return step ? [step] : [];
}
