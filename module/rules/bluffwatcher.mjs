/** Classic guard adaptations. These are tabletop costs and distances, not WoW statistics. */
export const BLUFFWATCHER_CLEAVE = Object.freeze({ name: "Guard Cleave", action: "action",
  feet: 5, targets: 2, uses: 1, per: "encounter", weapon: "Totem-hammer" });

/** Each target receives an ordinary melee attack, including its own defense,
 * armor and reactions. The runtime pays the single Action and encounter use
 * before the first strike; Extra Attack cannot multiply this plan. */
export function bluffwatcherCleavePlan({ attacks = [], targets = [] } = {}) {
  const spec = BLUFFWATCHER_CLEAVE;
  if (!Array.isArray(attacks) || !Array.isArray(targets) || targets.length < 1 || targets.length > spec.targets) return null;
  const weapons = attacks.filter(row => row?.name === spec.weapon);
  if (weapons.length !== 1) return null;
  const weapon = weapons[0];
  if (!Number.isFinite(weapon.bonus) || !Number.isFinite(weapon.damage) || weapon.damage <= 0
    || weapon.range != null || !Array.isArray(weapon.traits)) return null;
  if (targets.some(target => typeof target?.uuid !== "string" || !target.uuid.trim()
    || target.alive !== true || target.hostile !== true || !Number.isFinite(target.feet)
    || target.feet < 0 || target.feet > spec.feet)
    || new Set(targets.map(target => target.uuid)).size !== targets.length) return null;
  return { index: attacks.indexOf(weapon), attack: { ...weapon, traits: [...weapon.traits] },
    action: spec.action, targets: targets.map(target => target.uuid),
    options: { budget: "none", singleAttack: true, mode: "hand" } };
}
