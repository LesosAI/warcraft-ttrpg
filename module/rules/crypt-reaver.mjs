/** Classic Crypt Reaver adaptations. Costs, reach and uses are tabletop rules. */
export const REAVER_CLEAVE = Object.freeze({ name: "Reaver Cleave", action: "action", feet: 10,
  targets: 3, uses: 1, per: "short" });

/** The adapter supplies current scene distances and hostile/living targets,
 * then pays one Action before resolving the returned strikes independently.
 * No target, stale measurement, duplicate victim or unrecognized weapon is
 * silently converted into a different attack.
 */
export function reaverCleavePlan({ attacks = [], targets = [] } = {}) {
  if (!Array.isArray(attacks) || !Array.isArray(targets)) return null;
  const weapons = attacks.filter(a => a?.name === "Foreclaws");
  if (weapons.length !== 1) return null;
  const weapon = weapons[0];
  if (!Number.isFinite(weapon.bonus) || !Number.isFinite(weapon.damage) || weapon.damage <= 0
    || !Array.isArray(weapon.traits) || !weapon.traits.includes("Reach") || weapon.range != null) return null;
  if (targets.length < 1 || targets.length > REAVER_CLEAVE.targets) return null;
  if (targets.some(t => typeof t?.uuid !== "string" || !t.uuid.trim() || t.alive !== true || t.hostile !== true
    || !Number.isFinite(t.feet) || t.feet < 0 || t.feet > REAVER_CLEAVE.feet)) return null;
  if (new Set(targets.map(t => t.uuid)).size !== targets.length) return null;
  return { index: attacks.indexOf(weapon), attack: { ...weapon, traits: [...weapon.traits] }, action: REAVER_CLEAVE.action,
    targets: targets.map(t => t.uuid), options: { budget: "none", singleAttack: true, mode: "hand" } };
}

/** Inclusive Classic 50% trigger. Dead or invalid Health cannot enrage. */
export function reaverEnrageEligible(health = {}) {
  return Number.isFinite(health.value) && Number.isFinite(health.max) && health.max > 0
    && health.value > 0 && health.value <= health.max / 2;
}
