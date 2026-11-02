/** Read the complete rescue clause; this is not ordinary healing or an attack. */
export function damageAboveHealthFloor(health, damage, floor = null) {
  if (!Number.isFinite(floor) || floor < 0) return damage;
  if (!Number.isFinite(health) || !Number.isFinite(damage)) return damage;
  return Math.max(0, Math.min(damage, health - floor));
}

export function sealingFlameFrom(item) {
  const s = item?.system;
  if (item?.type !== 'spell' || s?.target !== 'One creature' || s?.action !== 'reaction' || s?.duration?.kind !== 'instant') return null;
  const text = String(s.effect ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const clause = /^Cast as a Reaction when a creature drops to 0 Health\. It stands at (\d+) Health instead, every Bleeding on it ends, and every Critical Injury it took this fight stops worsening\. It takes (\d+) Fire damage as the wound closes, which cannot drop it below (\d+) Health, and it may not benefit from this again until it finishes a Long Rest\.$/.exec(text);
  if (!clause) return null;
  const [health, rating, floor] = clause.slice(1).map(Number);
  if (![health, rating, floor].every(n => Number.isSafeInteger(n) && n > 0) || floor > health) return null;
  return { trigger: 'drops-to-zero', health, remove: ['bleeding'], stabilizeInjuries: 'current-fight', damage: { rating, school: 'fire', healthFloor: floor }, recipientRecovery: 'long' };
}
