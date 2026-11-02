/** 08's Thistle Tea refill. Class identity matters: Tinkers also have Combo Points. */
export const isThistleTea = use => use?.kind === 'draught'
  && /^A Rogue drinking it as a Half-Action goes to their full Combo Points at once\./.test(use.note ?? '');

export function thistleTeaFatigue(use, classes = [], fatigue = 0, maximum = 6) {
  if (!isThistleTea(use) || classes.some(c => c.system?.identifier === 'rogue')) return null;
  return Math.min(maximum, Math.max(0, Number(fatigue) || 0) + 1);
}

export function thistleTeaRefill(use, classes = [], pools = []) {
  if (!isThistleTea(use)) return null;
  const rogue = classes.find(c => c.system?.identifier === 'rogue');
  if (!rogue) return null;
  const pool = pools.find(p => p.itemId === rogue.id && p.kind === 'momentum' && p.name === 'comboPoints');
  if (!pool || !Number.isFinite(pool.max) || pool.max < 0) return null;
  return {itemId:pool.itemId,kind:pool.kind,value:pool.max};
}
