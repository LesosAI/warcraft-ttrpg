/** Project an Attack Test onto a spell without turning the cast into a weapon attack. */
export function castingWithAttackTest(casting, attack, choice) {
  const testProfile = Object.fromEntries([
    "weaponId", "heavyBane", "rangeKind", "rangeBand", "engaged", "engagedOne", "packFlank"
  ].map(key => [key, attack[key]]));
  testProfile.weaponEffects = {cancelsBane: attack.weaponEffects?.cancelsBane ?? []};
  return {...casting, modifiers: attack.modifiers.map(row => ({...row})), testProfile,
    attackTest: {...choice}, casting: {...casting.casting, augment: null, noAugment: true}};
}

export function blademasterWeaponKey(weapon) {
  return weapon?.id ?? (weapon?.natural ? `natural:${weapon.natural.index}` : null);
}

/** A borrowed Test consumes a promised Boon, never an unrelated damage-only promise. */
export function attackTestPromises(pending = {}) {
  return {live:(pending.live ?? []).filter(row=>Number(row.boons)>0),lapsed:pending.lapsed ?? []};
}
