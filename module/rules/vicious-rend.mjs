import { VICIOUS_REND } from "./king-mosh.mjs";
import { reachOf } from "./distance.mjs";

export function viciousRendPlan({ attacks = [], targets = [] } = {}) {
  if (!Array.isArray(attacks) || !Array.isArray(targets) || targets.length !== 1) return null;
  const matching = attacks.filter(row => row?.name === VICIOUS_REND.weapon);
  if (matching.length !== 1) return null;
  const attack = matching[0], target = targets[0];
  if (!Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage) || attack.damage <= 0
    || attack.range != null || !Array.isArray(attack.traits)) return null;
  const feet = reachOf(attack.traits);
  if (typeof target?.uuid !== "string" || !target.uuid.trim() || target.alive !== true
    || target.hostile !== true || target.sameLevel !== true || target.clearPath !== true
    || !Number.isFinite(target.feet) || target.feet < 0 || target.feet > feet) return null;
  return { index: attacks.indexOf(attack), attack: { ...attack, traits: [...attack.traits] },
    targets: [target.uuid], feet, action: VICIOUS_REND.action,
    options: { budget: "none", singleAttack: true, mode: "hand" } };
}
