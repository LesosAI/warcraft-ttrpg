/** Authored T3 earth-invasion actions. Pure; damage is before Armor Points.
 * Source review: docs/design/CLASSIC-EARTH-INVASION-REVIEW.md.
 * These budgets and durations are tabletop decisions, not client coefficients.
 */
export const EARTH_INVASION_ABILITIES = Object.freeze({
  "Crushing Knockdown": Object.freeze({
    actor: "Thundering Invader", action: "action", range: 5, targets: "one",
    dc: 17, resist: "body", damage: 7, stun: true, per: "short"
  }),
  "Avalanchion's Trample": Object.freeze({
    actor: "Avalanchion", action: "action", range: 5, targets: "enemies",
    dc: 17, resist: "reflex", damage: 10, stun: false, per: "short"
  }),
  "Ground Tremor": Object.freeze({
    actor: "Avalanchion", action: "action", range: 10, targets: "enemies",
    dc: 17, resist: "body", damage: 0, stun: true, per: "short"
  }),
  "Hurled Boulder": Object.freeze({
    actor: "Avalanchion", action: "action", range: 60, targets: "one",
    dc: 17, resist: "reflex", damage: 7, stun: false, per: null
  })
});

/** Unknown/unresolved Tests have no result; callers must not treat them as failure.
 * A successful Test halves damage before armor. Stun immunity is adjudicated
 * separately by the condition writer, never by suppressing the damage packet.
 */
export function earthInvasionOutcome(name, passed) {
  if (!Object.hasOwn(EARTH_INVASION_ABILITIES, name) || typeof passed !== "boolean") return null;
  const rule = EARTH_INVASION_ABILITIES[name];
  return {
    damage: passed ? Math.floor(rule.damage / 2) : rule.damage,
    type: "physical",
    stunned: rule.stun && !passed,
    until: rule.stun && !passed ? "endOfTargetNextTurn" : null,
    seconds: rule.stun && !passed ? 6 : null
  };
}
