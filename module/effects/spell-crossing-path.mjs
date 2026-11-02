import { crossesSpace } from '../rules/spell-crossing.mjs';

/** Snapshot the straight crossing before displacement. The authoritative caller
 * includes hidden creatures; UI choices must filter visibility separately.
 * Uses TokenDocument#getSize from installed Foundry 14.367, in canvas pixels.
 */
export function crossingPath(token, to, origin = null) {
  const scene = token?.parent;
  if (!scene || !token.actor || !Number.isFinite(to?.x) || !Number.isFinite(to?.y)) return null;
  try {
    const size = token.getSize();
    if (![size.width, size.height].every(n => Number.isFinite(n) && n > 0)) return null;
    const elevation = token.elevation;
    const from = token.getCenterPoint(origin ?? {});
    const end = token.getCenterPoint({ x: to.x, y: to.y });
    if (![from.x, from.y, elevation].every(Number.isFinite)) return null;
    const targets = [];
    for (const other of scene.tokens.values()) {
      if (other.id === token.id || !other.actor) continue;
      const dimensions = other.getSize();
      const space = {
        min: { x: other.x, y: other.y, elevation: other.elevation },
        max: { x: other.x + dimensions.width, y: other.y + dimensions.height, elevation: other.elevation + other.depth * scene.grid.distance }
      };
      const polygon = other.getGridSpacePolygon();
      if (polygon) space.polygon = polygon.map(p => ({ x: other.x + p.x, y: other.y + p.y }));
      else space.ellipse = [CONST.TOKEN_SHAPES.ELLIPSE_1, CONST.TOKEN_SHAPES.ELLIPSE_2].includes(other.shape);
      if (crossesSpace(from, end, space)) targets.push({ sceneId: scene.id, tokenId: other.id, actorId: other.actor.id, actorUuid: other.actor.uuid, name: other.name, space });
    }
    return { sceneId: scene.id, tokenId: token.id, actorUuid: token.actor.uuid, from, to: end, targets };
  } catch { return null; }
}
