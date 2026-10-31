/** Sonic Burst uses the shared whole-area GM review. */
import { SONIC_BURST } from "../rules/sonic-burst.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";

export function reviewSonicBurstTargets(options) {
  return reviewNearbyEnemies({ ...options, name: SONIC_BURST.name, radius: SONIC_BURST.radius,
    payment: "Spend an Action and the Short Rest use." });
}
