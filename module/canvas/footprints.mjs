/**
 * HOW FAR APART TWO TOKENS ARE (D-732): between the nearest spaces they occupy,
 * never between their centres, and in three dimensions. **This is the one place
 * in the system that measures a distance between tokens**, and
 * `rules/distance.test.mjs` fails on a `measurePath` anywhere else.
 *
 * 05 §Size: *Size does not change your Health, your Defense, your reach or the
 * square you stand in: a Large creature and a Small one both hold five feet of
 * ground.* A Large token is 2×2, a Huge 3×3 and an Enormous 4×4 (D-636, D-637),
 * which is convention on the map. Core's `measurePath` between two centres let
 * that convention push reach away: a Medium rogue in a square touching a 3×3
 * boss measured ten feet.
 *
 * ## The footprint, by grid (`rules/distance.mjs` holds the law)
 *
 * - **Square**: the rectangle of squares core lays out, worked out from the
 *   token's position and size - no call into core, and no wall sweep.
 * - **Hex**: core's `TokenDocument#getOccupiedGridSpaceOffsets` (14.367,
 *   `client/documents/token.mjs:1419`), whose hex layout depends on the token's
 *   shape and the row's parity. It sweeps the VIEWED canvas's walls, so a token
 *   on a scene nobody is viewing is laid out as a box instead.
 * - **Gridless**: the token's box shrunk by half a grid unit on every side.
 *
 * **Every point carries the token's elevation**, and the scene's own
 * `measurePath` measures in three dimensions, as core's own movement measure
 * does. A v14 Level is a band of absolute elevation, so a rogue on the upper
 * floor is as far above the ogre below as the floors are apart.
 *
 * **A token's footprint is worked out once per pass** (`footprintOf`), and a
 * throw anywhere in core is *unmeasured* - null - never a broken roll.
 */

import { footprintApart, shrunkBox, squareFootprint } from "../rules/distance.mjs";

/** A token's document, from a placeable or a document. */
function documentOf(token) {
  return token?.document ?? token ?? null;
}

/** Whether a scene is the one the canvas is drawing. */
function viewed(scene) {
  return Boolean(scene?.id) && globalThis.canvas?.scene?.id === scene.id;
}

/**
 * A token's footprint on its scene, at its own position or at the position
 * `data` gives (a waypoint, a movement's origin). Null where there is nothing
 * to lay out, or where core threw.
 *
 * @param {Token|TokenDocument} token
 * @param {object} [data]  `{x, y, elevation, width, height, shape, level}`, as core's own methods take it
 * @returns {object|null}  a footprint `rules/distance.mjs#footprintApart` measures
 */
export function footprintOf(token, data = {}) {
  const doc = documentOf(token);
  const scene = doc?.parent ?? null;
  const grid = scene?.grid ?? null;
  if (!doc || !grid) return null;
  try {
    const x = data.x ?? doc.x;
    const y = data.y ?? doc.y;
    const width = data.width ?? doc.width;
    const height = data.height ?? doc.height;
    const elevation = Number(data.elevation ?? doc.elevation ?? 0) || 0;
    if (grid.isSquare) {
      return { kind: "squares", ...squareFootprint({ x, y, width, height, size: grid.size }), size: grid.size, elevation };
    }
    if (grid.isHexagonal && viewed(scene) && typeof doc.getOccupiedGridSpaceOffsets === "function") {
      const seen = new Set();
      const points = [];
      // A token with depth covers one hex at more than one height; the hex is
      // counted once, at the token's own elevation.
      for (const { i, j } of doc.getOccupiedGridSpaceOffsets(data)) {
        const key = `${i},${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { x: px, y: py } = grid.getCenterPoint({ i, j });
        points.push({ x: px, y: py });
      }
      if (points.length) return { kind: "points", points, elevation };
    }
    const size = doc.getSize({ width, height });
    return { kind: "box", ...shrunkBox({ x, y, width: size.width, height: size.height, unit: grid.size }), elevation };
  } catch {
    return null;
  }
}

/**
 * Feet between two footprints on one scene's grid, or null where nothing could
 * be measured.
 *
 * @param {object|null} a  `footprintOf`
 * @param {object|null} b
 * @param {object|null} grid  the scene's grid; the viewed canvas's where none is given
 */
export function feetBetweenFootprints(a, b, grid = null) {
  const measuring = grid ?? globalThis.canvas?.grid ?? null;
  if (!measuring) return null;
  return footprintApart(a, b, (p, q) => measuring.measurePath([p, q]).distance);
}

/**
 * **FEET FROM A TOKEN TO A POINT ON ITS SCENE** (D-779, 04's Lightwell: *set a
 * font of Light within 30 feet*): the token's nearest space to the point, at the
 * token's own elevation, through the one measure; null where either is missing.
 *
 * @param {Token|TokenDocument} token
 * @param {{x: number, y: number}} point  canvas pixels
 * @returns {number|null}
 */
export function feetToPoint(token, point) {
  const doc = documentOf(token);
  const scene = doc?.parent ?? null;
  if (!doc || !scene || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const elevation = Number(doc.elevation ?? 0) || 0;
  return feetBetweenFootprints(footprintOf(doc), { kind: "points", points: [{ x: point.x, y: point.y }], elevation }, scene.grid ?? null);
}

/**
 * **FEET BETWEEN TWO TOKENS**: the nearest spaces they occupy, in three
 * dimensions (D-732), or null where either is missing or they stand on
 * different scenes. A reader measuring one token against many works its own
 * footprint out once and calls `feetBetweenFootprints` instead.
 *
 * @param {Token|TokenDocument} a
 * @param {Token|TokenDocument} b
 * @param {{from?: object, to?: object}} [o]  positions to measure at instead of where the tokens stand
 * @returns {number|null}
 */
export function feetApart(a, b, { from = {}, to = {} } = {}) {
  const first = documentOf(a);
  const second = documentOf(b);
  if (!first || !second) return null;
  const scene = first.parent ?? null;
  if (!scene || second.parent?.id !== scene.id) return null;
  return feetBetweenFootprints(footprintOf(first, from), footprintOf(second, to), scene.grid ?? null);
}
