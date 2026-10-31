/** 07's Mana Burn: drain 3 Mana; add one Arcane damage per missing point.
 * Pure planning only. The runtime must claim the application before writing
 * this pool change and applying damage through the normal strike workflow.
 */
import { MANA, poolNamed } from "./pools.mjs";

export const MANA_BURN_DRAIN = 3;
export const MANA_BURN_DAMAGE = 2;

/** Resolve one Mana pool, never combine a multiclass character's pools.
 * The existing cost selector chooses the first named Mana pool by default;
 * an explicit class item chooses that class where it holds Mana. Unnamed NPC
 * Power is Mana, but Focus, Energy and Momentum are not valid drain targets.
 * Invalid stored values fail closed rather than manufacturing shortage damage.
 */
export function manaBurnPlan(pools = [], { itemId = null } = {}) {
  const eligible = (Array.isArray(pools) ? pools : []).filter(pool =>
    pool?.kind === "power" && (pool.name === MANA || !pool.name));
  const pool = poolNamed(eligible, MANA, { itemId });
  if (pool && (!Number.isFinite(pool.value) || pool.value < 0
    || !Number.isInteger(pool.value))) return null;
  const drained = Math.min(MANA_BURN_DRAIN, pool?.value ?? 0);
  const shortage = MANA_BURN_DRAIN - drained;
  return {
    drained,
    shortage,
    damage: MANA_BURN_DAMAGE + shortage,
    change: pool && drained > 0
      ? { itemId: pool.itemId ?? null, kind: "power", value: pool.value - drained }
      : null
  };
}
