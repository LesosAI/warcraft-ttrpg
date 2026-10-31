import { emptyAreaTick } from "./area-ticks.mjs";

/** Classic spell 6535 has both an initial strike and a persistent damage
 * area. These numbers and the footprint are explicit tabletop adaptations. */
export const LIGHTNING_CLOUD = Object.freeze({
  name: "Lightning Cloud", action: "action", power: 3,
  feet: 60, radius: 10, initial: 3, periodic: 4, school: "nature",
  rounds: 3, uses: 1, per: "short"
});

/** The initial hit is resolved by the use workflow, never replayed by a
 * Region. Entering does not hit; a living enemy must start its turn inside.
 * Timed-area cleanup owns expiry, including after the caster has fallen. */
export function lightningCloudTick() {
  return { ...emptyAreaTick(), who: "enemy",
    damage: { rating: LIGHTNING_CLOUD.periodic, school: LIGHTNING_CLOUD.school },
    lasts: { rounds: LIGHTNING_CLOUD.rounds } };
}

/** Freeze a point on the scene; neither a moving target nor the caster
 * drags the cloud after placement. Invalid positions cannot create a hazard. */
export function lightningCloudPlacement({ sceneId, x, y, elevation = 0 } = {}) {
  if (typeof sceneId !== "string" || !sceneId.trim()
    || ![x, y, elevation].every(Number.isFinite)) return null;
  return { sceneId, x, y, elevation, attach: false,
    area: { shape: "circle", distanceFt: LIGHTNING_CLOUD.radius, origin: "point" } };
}
