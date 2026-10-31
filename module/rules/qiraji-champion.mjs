/** Reviewed Classic Champion adaptations. All numbers are tabletop choices. */
export const QIRAJI_CLEAVE = Object.freeze({ name: "Qiraji Cleave", action: "action", feet: 10,
  targets: 3, uses: 1, per: "short" });
export const QIRAJI_VENGEANCE = Object.freeze({ name: "Vengeance", action: "action", feet: 10,
  strikes: 3, speed: 10, rounds: 3, healthPercent: 30, uses: 1, per: "short" });
export const QIRAJI_SHOUT = Object.freeze({ name: "Frightening Shout", action: "action", feet: 10,
  radius: 15, dc: 20, resilience: "spirit", main: "stunned", others: "frightened", uses: 1, per: "short" });

/** Strictly below 30%, alive, with finite authoritative Health. */
export function vengeanceEligible(health = {}) {
  const { value, max } = health;
  return Number.isFinite(value) && Number.isFinite(max) && max > 0 && value > 0
    && value * 100 < max * QIRAJI_VENGEANCE.healthPercent;
}

/** A weapon row is an attack choice, never an extra attack by itself. */
export function championPincers(attacks = []) {
  if (!Array.isArray(attacks)) return null;
  const index = attacks.findIndex(row => row?.name === "Pincers");
  const row = attacks[index];
  if (!row || !Number.isFinite(row.bonus) || !Number.isFinite(row.damage) || row.damage < 0
    || !Array.isArray(row.traits) || !row.traits.includes("Reach") || row.range != null) return null;
  return { index, attack: { ...row, traits: [...row.traits] } };
}

/** Order and identities are fixed before paying. Measurements come from the
 * adapter's current scene, never from a player's query payload. */
export function championStrikePlan({ name, attacks = [], targets = [], health = {} } = {}) {
  const weapon = championPincers(attacks);
  if (!weapon || !Array.isArray(targets)) return null;
  const vengeance = name === QIRAJI_VENGEANCE.name, cleave = name === QIRAJI_CLEAVE.name;
  if (!vengeance && !cleave) return null;
  if (vengeance && (!vengeanceEligible(health) || targets.length !== 1)) return null;
  if (cleave && (targets.length < 1 || targets.length > QIRAJI_CLEAVE.targets)) return null;
  if (targets.some(t => typeof t?.uuid !== "string" || !t.uuid || t.alive !== true
    || !Number.isFinite(t.feet) || t.feet < 0 || t.feet > QIRAJI_CLEAVE.feet)) return null;
  if (new Set(targets.map(t => t.uuid)).size !== targets.length) return null;
  return { ...weapon, action: "action", targets: vengeance
    ? Array(QIRAJI_VENGEANCE.strikes).fill(targets[0].uuid) : targets.map(t => t.uuid),
  options: { budget: "none", singleAttack: true, mode: "hand" } };
}

/** Timed Speed only: the burst's strikes are paid and resolved separately.
 * No extra-action flag persists after the ability has been used. */
export function vengeanceSpeedEffect({ sourceUuid, timing } = {}) {
  if (typeof sourceUuid !== "string" || !sourceUuid || !timing?.duration || !timing?.start) return null;
  const { duration, start } = timing;
  const world = duration.units === "seconds" && duration.value === 18 && Number.isFinite(start.time);
  const combat = duration.units === "rounds" && duration.value === 3 && duration.expiry === "turnEnd"
    && typeof start.combat === "string" && start.combat && typeof start.combatant === "string" && start.combatant
    && Number.isInteger(start.round) && start.round >= 1 && Number.isInteger(start.turn) && start.turn >= 0;
  if (!world && !combat) return null;
  return { name: QIRAJI_VENGEANCE.name, img: "icons/svg/wingfoot.svg", origin: sourceUuid,
    disabled: false, statuses: [], duration: { ...duration }, start: { ...start },
    // Add the bonus before Slowed's multiplier (priority 10).
    system: { changes: [{ key: "system.speed", type: "add", value: QIRAJI_VENGEANCE.speed, phase: "final", priority: 5 }] },
    flags: { "azeroth-rpg": { qirajiVengeance: { version: 1, sourceUuid } } } };
}
