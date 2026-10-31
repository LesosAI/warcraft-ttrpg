import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";
import { pickPoint } from "../canvas/place.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { LIGHTNING_CLOUD, lightningCloudPlacement } from "../rules/lightning-cloud.mjs";

/** Select a fixed point, then review the initial victims. An empty cloud
 * is legal: creatures entering later are governed by the timed Region. */
export async function reviewLightningCloudArea({ actor, scene, sourceToken, chooseOption, payment }) {
  const elevation = Number(sourceToken?.elevation ?? 0);
  const sourceValid = () => globalThis.canvas?.scene === scene && Number.isFinite(elevation)
    && Number(sourceToken?.elevation ?? 0) === elevation
    && scene?.tokens?.get(sourceToken?.id) === sourceToken && sourceToken?.actor === actor;
  if (!sourceValid()) return { ok: false, reason: "scene" };
  const distance = (token, point) => feetBetweenFootprints(footprintOf(token),
    { kind: "points", points: [point], elevation }, scene.grid);
  const inRange = point => sourceValid() && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    && Number.isFinite(distance(sourceToken, point)) && distance(sourceToken, point) >= 0
    && distance(sourceToken, point) <= LIGHTNING_CLOUD.feet;
  const point = await pickPoint({ sceneId: scene.id,
    hint: "Lightning Cloud: choose a point within 60 feet at your elevation. Escape cancels.", accept: inRange });
  if (!point) return { ok: false, reason: "cancelled" };
  const placement = lightningCloudPlacement({ sceneId: scene.id, x: point.x, y: point.y, elevation });
  if (!placement || !inRange(placement)) return { ok: false, reason: "range" };
  const origin = Object.freeze({ x: placement.x, y: placement.y, elevation });
  const selection = await reviewNearbyEnemies({ actor, scene, sourceToken, chooseOption,
    name: LIGHTNING_CLOUD.name, radius: LIGHTNING_CLOUD.radius, payment, allowEmpty: true,
    measure: (_source, token) => distance(token, origin), validOrigin: () => inRange(origin),
    areaLabel: "within 10 feet of the chosen point" });
  return { ...selection, origin };
}
