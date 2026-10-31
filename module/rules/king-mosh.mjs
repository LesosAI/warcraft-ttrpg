/** Classic King Mosh adaptations; tabletop costs and distances are design choices. */
export const ROYAL_TRAMPLE = Object.freeze({ name: "Royal Trample", action: "action",
  feet: 10, uses: 1, per: "encounter", weapon: "Stamp" });
export const TERRIFYING_ROAR = Object.freeze({ name: "Terrifying Roar", action: "action",
  feet: 30, uses: 1, per: "encounter", dc: 17, resilience: "spirit", condition: "frightened" });
export const VICIOUS_REND = Object.freeze({ name: "Vicious Rend", action: "action",
  uses: 1, per: "encounter", weapon: "Jaws", condition: "bleeding", seconds: 12 });

/** A reviewed set of all living enemies in the trample area. No arbitrary
 * target cap: unlike Guard Cleave this affects each enemy in the area.
 * One ordinary Stamp per creature preserves its defense, armor and reactions. */
export function royalTramplePlan({ attacks = [], targets = [] } = {}) {
  if (!Array.isArray(attacks) || !Array.isArray(targets) || !targets.length) return null;
  const matching = attacks.filter(row => row?.name === ROYAL_TRAMPLE.weapon);
  if (matching.length !== 1) return null;
  const attack = matching[0];
  if (!Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage) || attack.damage <= 0
    || attack.range != null || !Array.isArray(attack.traits)) return null;
  if (targets.some(target => typeof target?.uuid !== "string" || !target.uuid.trim()
    || target.alive !== true || target.hostile !== true || target.sameLevel !== true
    || target.clearPath !== true || !Number.isFinite(target.feet) || target.feet < 0
    || target.feet > ROYAL_TRAMPLE.feet)
    || new Set(targets.map(target => target.uuid)).size !== targets.length) return null;
  return { index: attacks.indexOf(attack), attack: { ...attack, traits: [...attack.traits] },
    action: ROYAL_TRAMPLE.action, targets: targets.map(target => target.uuid),
    feet: ROYAL_TRAMPLE.feet, options: { budget: "none", singleAttack: true, mode: "hand" } };
}
