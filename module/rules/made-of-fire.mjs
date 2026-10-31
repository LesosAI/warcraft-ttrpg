/** Made of Fire responds to a confirmed attack hit within the defender's
 * reach. Armor absorbing the hit does not prevent contact retaliation. */
export const MADE_OF_FIRE = Object.freeze({ name: "Made of Fire", damage: 2, school: "fire" });

export function madeOfFireHit({ flags = {}, index, before, after, feet, reach, sameLevel = false } = {}) {
  if (!sameLevel || !Number.isFinite(feet) || feet < 0 || !Number.isFinite(reach) || reach < 0 || feet > reach) return false;
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after < 0 || after > before) return false;
  if (flags.kind !== "attack" || flags.notAttack === true || flags.parry === true) return false;
  if (!Number.isInteger(index) || index < 0 || index >= (flags.targets?.length ?? 0)) return false;
  const hit = flags.damageByTarget?.[index];
  return hit?.hit === true && hit.withdrawn !== true && Number.isFinite(hit.damage)
    && hit.damage >= 0 && before - after <= hit.damage;
}
