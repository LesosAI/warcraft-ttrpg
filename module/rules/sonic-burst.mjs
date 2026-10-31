/** Maraudon Sonic Burst adaptation. Enemy designation belongs to the GM. */
export const SONIC_BURST = Object.freeze({ name: "Sonic Burst", action: "action", radius: 15,
  dc: 17, resilience: "body", damage: 7, damageType: "physical", uses: 1, per: "short",
  condition: "silenced", until: "endOfNextTurn" });

/** Select the reviewed enemies in the measured area, once per actor. */
export function sonicBurstTargets(sourceUuid, candidates = []) {
  if (typeof sourceUuid !== "string" || !sourceUuid || !Array.isArray(candidates)) return [];
  const seen = new Set([sourceUuid]);
  return candidates.filter(row => {
    if (typeof row?.actorUuid !== "string" || !row.actorUuid || seen.has(row.actorUuid)
      || row.enemy !== true || !Number.isFinite(row.distance) || row.distance < 0 || row.distance > SONIC_BURST.radius) return false;
    seen.add(row.actorUuid);
    return true;
  });
}

/** The resistance halves the physical rating before mitigation and prevents silence. */
export function sonicBurstOutcome(resisted) {
  if (typeof resisted !== "boolean") return null;
  return { rating: resisted ? Math.floor(SONIC_BURST.damage / 2) : SONIC_BURST.damage,
    damageType: SONIC_BURST.damageType, condition: resisted ? null : SONIC_BURST.condition,
    until: resisted ? null : SONIC_BURST.until };
}
