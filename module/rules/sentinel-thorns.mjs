/** A melee hit, not necessarily Health loss, triggers Thorns once. */
export const SENTINEL_THORNS_DAMAGE = 3;
export function sentinelThornsHit({ flags = {}, index, before, after } = {}) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after < 0 || after > before) return false;
  if (flags.kind !== "attack" || flags.notAttack === true || flags.parry === true || flags.strike?.rangeKind !== "melee") return false;
  if (!Number.isInteger(index) || index < 0 || index >= (flags.targets?.length ?? 0)) return false;
  const row = flags.damageByTarget?.[index];
  return row?.hit === true && row.withdrawn !== true && Number.isFinite(row.damage)
    && row.damage >= 0 && before - after <= row.damage;
}
