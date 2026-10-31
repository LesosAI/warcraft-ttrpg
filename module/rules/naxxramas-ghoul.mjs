/** Reviewed tabletop adaptations for Classic identity 16447. No Foundry imports. */
import { reachOf } from "./distance.mjs";

export const GHOUL_CLEAVE = Object.freeze({ name: "Ghoul Cleave", action: "action", targets: 3, uses: 1, per: "encounter" });
export const RENDING_CLAWS = Object.freeze({ name: "Rending Claws", weapon: "Claws", condition: "bleeding", action: "action", targets: 1, uses: 1, per: "encounter", seconds: 12 });
export const FLESH_ROT = Object.freeze({ name: "Flesh Rot", weapon: "Claws", action: "action", targets: 1, uses: 1, per: "encounter", seconds: 12, strikeBonus: 2, periodicDamage: 2, school: "physical" });
export const GHOUL_ENRAGE = Object.freeze({ name: "Ghoul Enrage", action: "half", uses: 1, per: "encounter", seconds: 12, damage: 2 });

/** Inclusive 30% threshold; multiplication avoids rounding fractional maxima. */
export function ghoulEnrageEligible({ value, max } = {}) {
  return Number.isFinite(value) && Number.isFinite(max) && max > 0
    && value > 0 && value * 10 <= max * 3;
}

/** The caller measures current geometry and reviews hostility before payment. */
export function ghoulAttackPlan({ ability, attacks = [], targets = [] } = {}) {
  const spec = [GHOUL_CLEAVE, RENDING_CLAWS, FLESH_ROT].find(row => row.name === ability);
  if (!spec || !Array.isArray(attacks) || !Array.isArray(targets)
    || !targets.length || targets.length > spec.targets) return null;
  const matches = attacks.filter(row => row?.name === "Claws");
  if (matches.length !== 1) return null;
  const attack = matches[0];
  if (!Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage) || attack.damage <= 0
    || attack.range != null || !Array.isArray(attack.traits)) return null;
  const feet = reachOf(attack.traits);
  if (targets.some(target => typeof target?.uuid !== "string" || !target.uuid.trim()
    || target.alive !== true || target.hostile !== true || target.sameLevel !== true
    || target.clearPath !== true || !Number.isFinite(target.feet) || target.feet < 0 || target.feet > feet)
    || new Set(targets.map(target => target.uuid)).size !== targets.length) return null;
  return { index: attacks.indexOf(attack), attack: { ...attack, traits: [...attack.traits],
    damage: attack.damage + (spec.strikeBonus ?? 0) }, targets: targets.map(target => target.uuid),
    feet, action: spec.action, options: { budget: "none", singleAttack: true, mode: "hand" } };
}
