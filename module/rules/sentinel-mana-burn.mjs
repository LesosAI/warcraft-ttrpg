/** Classic Sentinel Mana Burn: explicit tabletop scaling, Shadow damage
 * equal to actual Mana lost. No damage for a Mana shortage, no source gain. */
export const SENTINEL_MANA_BURN = Object.freeze({ radius: 30, drain: 4, dc: 20,
  resilience: "spirit", school: "shadow", action: "action" });

export function sentinelManaBurnPlan({ pools, itemId = null, resisted, npc = false } = {}) {
  if (!Array.isArray(pools) || typeof resisted !== "boolean"
    || !(itemId === null || (typeof itemId === "string" && itemId.length))) return null;
  const eligible = pools.filter(pool => pool?.kind === "power"
    && (pool.name === "mana" || (npc && pool.name == null)));
  if (!eligible.length && itemId === null) return { drained: 0, damage: 0, change: null };
  const selected = eligible.filter(pool => pool.itemId === itemId);
  if (selected.length !== 1 || !Number.isInteger(selected[0].value) || selected[0].value < 0) return null;
  const pool = selected[0], drained = Math.min(pool.value, resisted ? 2 : SENTINEL_MANA_BURN.drain);
  return { drained, damage: drained,
    change: drained ? { itemId, kind: "power", value: pool.value - drained } : null };
}
