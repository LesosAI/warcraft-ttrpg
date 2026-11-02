/** The approved racial refill restores every Power pool, never Momentum. */
export function hungerMasteredPools(pools = []) {
  const seen = new Set(), changes = [];
  for (const pool of pools) {
    if (pool?.kind !== 'power' || typeof pool.itemId !== 'string' || !pool.itemId
      || !Number.isFinite(pool.max) || pool.max <= 0 || seen.has(pool.itemId)) continue;
    seen.add(pool.itemId);
    changes.push({ itemId: pool.itemId, kind: 'power', value: Math.trunc(pool.max) });
  }
  return changes;
}
