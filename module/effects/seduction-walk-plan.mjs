import { seductionApproachPath } from "../rules/seduction-path.mjs";
import { seductionRouteSteps } from "../rules/seduction-route-steps.mjs";
import { footprintOf, feetBetweenFootprints } from "../canvas/footprints.mjs";
import { wanderCrossesOccupied } from "../rules/wander-occupancy.mjs";

/** Read-only V14 adapter. Budget is the remaining movement allowance; this
 * function neither spends it nor bypasses the normal movement hooks. */
export function planSeductionWalk({ token, source, waypoints, budget } = {}) {
  const refuse = reason => ({ ok: false, reason, path: [], cost: 0 });
  const scene = token?.parent, object = token?.object, grid = scene?.grid;
  const bounds = globalThis.canvas?.dimensions?.sceneRect, level = token?._source?.level;
  if (!scene || globalThis.canvas?.scene !== scene || scene.tokens?.get(token?.id) !== token
    || source?.parent !== scene || scene.tokens?.get(source.id) !== source || !source.actor || !token.actor
    || !scene.levels?.get(level) || source._source?.level !== level
    || ![grid?.size, bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(Number.isFinite)
    || grid.size <= 0 || ![object?.checkCollision, object?.measureMovementPath,
      object?.createTerrainMovementPath, token?.getMovementOrigin, token?.getSnappedPosition].every(fn => typeof fn === "function")) return refuse("sceneOrGeometry");
  const origin = waypoints?.[0];
  if (origin?.x !== token.x || origin?.y !== token.y || origin?.elevation !== token.elevation
    || origin?.level !== level) return refuse("staleOrigin");
  const size = { width: token.width * grid.size, height: token.height * grid.size };
  const targetFootprint = footprintOf(source);
  if (!targetFootprint) return refuse("sceneOrGeometry");
  try {
    const expanded = seductionRouteSteps(waypoints, point => token.getSnappedPosition({ ...token._source, ...point }));
    if (!expanded) return refuse("routeGeometry");
    // Match V14's native history bridge: external displacement adds no cost,
    // but earlier diagonal steps remain part of the cumulative measurement.
    const history = [...(token.movementHistory ?? [])].map(point => ({ ...point }));
    const last = history.at(-1);
    if (last && ["x", "y", "elevation", "level"].some(key => last[key] !== origin[key]))
      history.push({ ...origin, action: "displace", cost: 0 });
    const measure = path => object.measureMovementPath(object.createTerrainMovementPath(path, { preview: true }), { preview: true }).cost;
    const priorCost = history.length ? measure(history) : 0;
    if (!Number.isFinite(priorCost) || priorCost < 0) return refuse("uncheckedHistory");
    return seductionApproachPath({ waypoints: expanded, budget,
      measure: path => measure([...history, ...path.map(point => ({ ...point, action: "walk" }))]) - priorCost,
      distanceToSource: point => feetBetweenFootprints(footprintOf(token, point), targetFootprint, grid),
      clear: (from, to) => {
        if (to.x < bounds.x || to.y < bounds.y || to.x + size.width > bounds.x + bounds.width
          || to.y + size.height > bounds.y + bounds.height) return false;
        const start = token.getMovementOrigin({ ...token._source, ...from });
        const end = token.getMovementOrigin({ ...token._source, ...to });
        if (object.checkCollision(end, { origin: start, type: "move", mode: "any" }) !== false) return false;
        for (const other of scene.tokens.values()) {
          if (other === token || !other.actor || other._source?.level !== level) continue;
          if (wanderCrossesOccupied(from, to, size, { x: other.x, y: other.y,
            width: other.width * grid.size, height: other.height * grid.size })) return false;
        }
        return true;
      }
    });
  } catch { return refuse("unchecked"); }
}
