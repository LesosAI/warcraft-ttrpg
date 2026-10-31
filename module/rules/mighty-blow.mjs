/** Tabletop adaptation of Devilsaur's Classic Mighty Blow. */
export const MIGHTY_BLOW = Object.freeze({ name: "Mighty Blow", weapon: "Stamp", action: "action",
  uses: 1, per: "encounter", feet: 5, damageBonus: 2, push: 10, dc: 15, resilience: "body" });

export function mightyBlowPlan({ attacks = [], targets = [] } = {}) {
  if (!Array.isArray(attacks) || !Array.isArray(targets) || targets.length !== 1) return null;
  const matches = attacks.filter(row => row?.name === MIGHTY_BLOW.weapon);
  if (matches.length !== 1) return null;
  const attack = matches[0], target = targets[0];
  if (!Number.isFinite(attack.bonus) || !Number.isFinite(attack.damage) || attack.damage <= 0
    || attack.range != null || !Array.isArray(attack.traits)) return null;
  if (typeof target?.uuid !== "string" || !target.uuid.trim() || target.alive !== true
    || target.hostile !== true || target.sameLevel !== true || !Number.isFinite(target.feet)
    || target.feet < 0 || target.feet > MIGHTY_BLOW.feet) return null;
  return { index: attacks.indexOf(attack), attack: { ...attack, traits: [...attack.traits] },
    targetUuid: target.uuid, damageBonus: MIGHTY_BLOW.damageBonus, action: MIGHTY_BLOW.action,
    options: { budget: "none", singleAttack: true, mode: "hand" } };
}

/** A miss or a withdrawn result never starts the push Test. Damage absorbed
 * by armor does not turn an otherwise successful attack into a miss. */
export function mightyBlowHit({ flags = {}, index } = {}) {
  if (flags.kind !== "attack" || flags.notAttack === true || flags.parry === true
    || !Number.isInteger(index) || index < 0 || index >= (flags.targets?.length ?? 0)) return false;
  const row = flags.damageByTarget?.[index];
  return row?.hit === true && row.withdrawn !== true && Number.isFinite(row.damage) && row.damage >= 0;
}
