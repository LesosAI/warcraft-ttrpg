/** A refreshed, pool-specific bonus; never add duplicate carriers together. */
export const WISDOM_FLAG = 'distilledWisdom';
export function isDistilledWisdom(use) {
  return use?.kind === 'draught' && use.target === 'self'
    && String(use.note ?? '').trim().startsWith('For one hour, your maximum Mana rises by 6 and you regain that much Mana at once.');
}
export function wisdomBonus(effects, pool) {
  return [...(effects ?? [])].some(effect => {
    const stamp = effect?.flags?.['azeroth-rpg']?.[WISDOM_FLAG];
    return effect?.active !== false && effect?.disabled !== true && !effect?.isSuppressed
      && stamp?.version === 1 && stamp.itemId === (pool.itemId ?? null)
      && stamp.poolName === (pool.name ?? null);
  }) ? 6 : 0;
}
