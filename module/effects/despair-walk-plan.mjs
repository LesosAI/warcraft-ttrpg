/** Read-only Foundry 14.367 adapter. Measure with the rendered Token so region
 * terrain costs apply; ask its walk collision backend before accepting a path. */
import { despairPath } from "../rules/despair-path.mjs";
import { wanderCrossesOccupied } from "../rules/wander-occupancy.mjs";

export function planDespairWalk(token, plan) {
  const refuse = reason => ({ ok: false, reason, to: null, feet: 0 });
  const scene = token?.parent, object = token?.object, grid = scene?.grid;
  const bounds = globalThis.canvas?.dimensions?.sceneRect;
  if (!scene || globalThis.canvas?.scene !== scene || scene.tokens?.get(token.id) !== token
    || typeof object?.checkCollision !== "function" || typeof object?.measureMovementPath !== "function"
    || typeof token.getMovementOrigin !== "function" || typeof token.getSnappedPosition !== "function"
    || ![grid?.size, grid?.distance, bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(Number.isFinite)
    || grid.size <= 0 || grid.distance <= 0) return refuse("sceneOrGeometry");
  const size = { width: token.width * grid.size, height: token.height * grid.size };
  const origin = { x: token.x, y: token.y };
  const elevation = token.elevation, level = token.level;
  const waypoint = point => ({ ...point, elevation, level, action: "walk" });
  return despairPath({ origin, bearing: plan?.bearing,
    feet: Math.min(plan?.feet, token.actor?.system?.speed), pixelsPerFoot: grid.size / grid.distance,
    snap: point => grid.isGridless ? { x: Math.round(point.x), y: Math.round(point.y) }
      : token.getSnappedPosition({ ...token._source, ...point }),
    measure: (from, to) => object.measureMovementPath([waypoint(from), waypoint(to)], { preview: true }).cost,
    clear: (from, to) => {
      if (to.x < bounds.x || to.y < bounds.y || to.x + size.width > bounds.x + bounds.width
        || to.y + size.height > bounds.y + bounds.height) return false;
      const start = token.getMovementOrigin({ ...token._source, ...from });
      const end = token.getMovementOrigin({ ...token._source, ...to });
      if (object.checkCollision(end, { origin: start, type: "move", mode: "any" }) !== false) return false;
      for (const other of scene.tokens.values()) {
        if (other === token || !other.actor || other.level !== level) continue;
        // Conservative across elevations on the same scene level: do not route
        // an automatic confused walk through another creature's footprint.
        if (wanderCrossesOccupied(from, to, size, { x: other.x, y: other.y,
          width: other.width * grid.size, height: other.height * grid.size })) return false;
      }
      return true;
    }
  });
}
