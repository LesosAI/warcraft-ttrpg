/** Damage since the start of the previous turn, including the current turn. */
export const LUNAR_DAMAGE_FLAG = 'lunarDamage';
const keys = value => Array.isArray(value) ? value.filter(k => typeof k === 'string') : [];
export function lunarDamageTypes({amount = 0, type = null, parts = []} = {}) {
  let left = Math.max(0, Math.trunc(Number(amount)) || 0);
  const types = [];
  for (const part of parts ?? []) {
    const damage = Math.min(left, Math.max(0, Math.trunc(Number(part?.damage)) || 0));
    left -= damage;
    if (damage > 0) types.push(part.type);
  }
  if (left > 0) types.push(type);
  return [...new Set(types)];
}
export function recordLunarDamage(held, {key, type, types = [type], dealt} = {}) {
  if (!key || !(dealt > 0) || !types.some(t => ['arcane', 'nature'].includes(t))) return null;
  const current = keys(held?.current);
  if (current.includes(key)) return null;
  return {current: [...current, key], previous: keys(held?.previous)};
}
export function advanceLunarDamage(held) {
  return {current: [], previous: keys(held?.current)};
}
export function lunarDamageQualifies(held, key) {
  return Boolean(key && (keys(held?.current).includes(key) || keys(held?.previous).includes(key)));
}
