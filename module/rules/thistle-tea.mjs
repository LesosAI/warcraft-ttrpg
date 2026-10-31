/** 08's Thistle Tea refill. Class identity matters: Tinkers also have Combo Points. */
export function thistleTeaRefill(use, classes = [], pools = []) {
  if (use?.kind !== 'draught' || !/^A Rogue drinking it as a Half-Action goes to their full Combo Points at once\./.test(use.note ?? '')) return null;
  const rogue = classes.find(c => c.system?.identifier === 'rogue');
  if (!rogue) return null;
  const pool = pools.find(p => p.itemId === rogue.id && p.kind === 'momentum' && p.name === 'comboPoints');
  if (!pool || !Number.isFinite(pool.max) || pool.max < 0) return null;
  return {itemId:pool.itemId,kind:pool.kind,value:pool.max};
}
