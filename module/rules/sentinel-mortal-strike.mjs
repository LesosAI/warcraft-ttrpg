/** The Classic Sentinel's Mortal Strike halves healing; it is distinct from
 * the Warrior talent that prevents all healing. Multiple halving effects
 * share the existing healingHalved state and do not compound. */
import { MORTAL_STRIKE_FLAGS, mortalStrikeEffect, mortalStrikeHalvesHealing } from "./mortal-strike.mjs";
export const SENTINEL_MORTAL_STRIKE = MORTAL_STRIKE_FLAGS.sentinel;

export function sentinelMortalStrikeEffect({ sourceUuid, targetUuid, messageUuid, timing } = {}) {
  return mortalStrikeEffect({ kind: "sentinel", sourceUuid, targetUuid, messageUuid, timing,
    labels: { name: "Sentinel Mortal Strike",
      description: "<p>Healing you receive is halved until the end of the Sentinel's next turn. Multiple effects that halve healing do not compound.</p>" } });
}

export function sentinelHalvesHealing(effects = []) {
  return mortalStrikeHalvesHealing(effects);
}
