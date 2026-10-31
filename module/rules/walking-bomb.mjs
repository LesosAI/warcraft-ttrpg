import { resolveDamage } from "./mitigation.mjs";

/** Classic Walking Bomb's outgoing-melee proc, adapted to tabletop attack
 * outcomes. The runtime must persist a detonation claim before any explosion
 * damage or self-destruction. See CLASSIC-NPC-WALKING-BOMB-RESEARCH.json.
 */
const identifier = value => typeof value === "string" && value.trim().length > 0;
export const WALKING_BOMB_BLAST = Object.freeze({ name: "Walking Bomb Explosion",
  radius: 10, rating: 3, dc: 15, resilience: "reflex", type: "physical" });

/** D1's tier-1 small-area budget; success halves before Body armor. */
export function walkingBombDamage({ target = {}, resisted, dealtHalved = false } = {}) {
  if (typeof resisted !== "boolean") return null;
  return resolveDamage({ rating: WALKING_BOMB_BLAST.rating, sl: 0, kind: "physical",
    location: "body", apByLocation: target.apByLocation ?? {},
    immune: target.immune ?? [], vulnerable: target.vulnerable ?? [],
    passedHalf: resisted, dealtHalved, slAddsToDamage: false });
}

export function walkingBombTrigger({ bombUuid, health, detonation = null, attack } = {}) {
  if (!identifier(bombUuid) || !Number.isFinite(health) || health <= 0 || detonation !== null) return null;
  if (!attack || !identifier(attack.id) || attack.sourceUuid !== bombUuid
    || !identifier(attack.targetUuid) || attack.targetUuid === bombUuid) return null;
  if (attack.kind !== "attack" || attack.rangeKind !== "melee" || attack.hit !== true
    || attack.withdrawn === true || attack.parried === true || attack.retaliation === true) return null;
  // Armor absorbing the strike does not turn a successful attack into a miss.
  return { bombUuid, attackId: attack.id, targetUuid: attack.targetUuid };
}
