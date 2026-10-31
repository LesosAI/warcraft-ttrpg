/** Pick a ranged cloud at the scarab's elevation, then review every enemy in it. */
import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";
import { pickPoint } from "../canvas/place.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { PLAGUE_CLOUD } from "../rules/plague-cloud.mjs";

export async function reviewPlagueCloudArea({ actor, scene, sourceToken, chooseOption, payment }) {
  const elevation = Number(sourceToken?.elevation ?? 0);
  const sourceValid = () => globalThis.canvas?.scene === scene && Number.isFinite(elevation)
    && Number(sourceToken?.elevation ?? 0) === elevation
    && scene?.tokens?.get(sourceToken?.id) === sourceToken && sourceToken?.actor === actor;
  if (!sourceValid()) return { ok: false, reason: "scene" };
  const at = point => ({ kind: "points", points: [point], elevation });
  const distance = (token, point) => feetBetweenFootprints(footprintOf(token), at(point), scene.grid);
  const inRange = point => sourceValid() && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    && Number.isFinite(distance(sourceToken, point)) && distance(sourceToken, point) >= 0
    && distance(sourceToken, point) <= PLAGUE_CLOUD.feet;
  const point = await pickPoint({ sceneId: scene.id,
    hint: "Plague Cloud: choose a point within 60 feet, at the scarab's elevation. Escape cancels.",
    accept: inRange });
  if (!point) return { ok: false, reason: "cancelled" };
  const origin = Object.freeze({ x: point.x, y: point.y });
  if (!inRange(origin)) return { ok: false, reason: "range" };
  const selection = await reviewNearbyEnemies({ actor, scene, sourceToken, chooseOption,
    name: PLAGUE_CLOUD.name, radius: PLAGUE_CLOUD.radius, payment,
    measure: (_source, token) => distance(token, origin), validOrigin: () => inRange(origin),
    areaLabel: "within 10 feet of the chosen point" });
  return { ...selection, origin: { ...origin, elevation } };
}
