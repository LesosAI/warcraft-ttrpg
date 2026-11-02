/** Nature's Ward carried by an ongoing, self-centred allied healing area. */
export const HEALING_AREA_WARD = 'healingAreaWard';

export function isHealingWardArea(area) {
  return area?.centre === 'self' && area.who === 'ally'
    && Number(area.heal) > 0 && Number(area.feet) > 0;
}

export function healingAreaWardStamp(area, ward, school) {
  if (!isHealingWardArea(area) || !['nature', 'shadow'].includes(school)
    || !ward?.schools?.includes(school) || !(Number(ward.amount) > 0)) return null;
  return { school, amount: Math.trunc(Number(ward.amount)), name: ward.name };
}

/** Pure source descriptor for the existing aura distance/lifecycle machinery. */
export function healingAreaWardSource(effect, ownerUuid) {
  if (!effect?.id || !ownerUuid || effect.active === false || effect.disabled === true || effect.isSuppressed === true) return null;
  const flags = effect.flags?.['azeroth-rpg'] ?? {};
  const stored = flags[HEALING_AREA_WARD];
  const area = flags.areaTick;
  const stamp = healingAreaWardStamp(area, {amount:stored?.amount, schools:[stored?.school], name:stored?.name}, stored?.school);
  if (!stamp) return null;
  const key = `${ownerUuid}:healingWard:${effect.id}`;
  return {
    key, group:key, name:stamp.name || effect.name, origin:effect.origin || ownerUuid,
    img:effect.img, text:'',
    aura:{feet:Number(area.feet),targets:'allies',centre:'self',excludeOwner:area.excludesCaster === true,
      ward:{amount:stamp.amount,schools:[stamp.school]}}
  };
}
