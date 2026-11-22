/**
 * **ONE ENERGY POOL FOR TWO CLASSES THAT BOTH GIVE IT** (02 §10: *Two classes that both give Energy share one
 * Energy pool*; 05 §12; the lead's ruling of 2026-11-22, *"rogue - one merged pool"*; D-1719, D-1723). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * `rules/progression.mjs#poolsFor` derives ONE row for the merged pool: the first such class's place and id (the
 * HOLDER), the larger cap, and `itemIds` naming every member. The stored value stays where it always lived, on each
 * class entry's `power.value` - no schema change - and every write lands on the holder and is MIRRORED into every
 * other member (`AzerothActor#writePoolsNow`), so whichever class is removed later, the survivor holds the pool's
 * true value. This module holds the three small laws that keep that true:
 *
 * - `mirrorMembers` - the members a write mirrors into;
 * - `sharedPoolValue` - what a class joining the pool stores at its link (the holder's value, never a fresh full
 *   pool, so taking a class refills nothing);
 * - `mergeEnergyPlan` - migration 0.16.0.2's planner for a world whose two Energy entries were stored apart.
 */

import { AZEROTH } from "../config.mjs";
import { poolsFor } from "./progression.mjs";

const int = v => Math.trunc(Number(v)) || 0;
const whole = v => Math.max(0, int(v));

/** Whether a Power pool name is one two classes share (`AZEROTH.sharedPowerPools`). */
export function isSharedPool(name) {
  return Boolean(name) && (AZEROTH.sharedPowerPools ?? []).includes(name);
}

/**
 * The class items a write on this pool row also writes: every member of a merged pool but its holder. Empty for
 * every pool that is not merged.
 *
 * @param {{itemId?: string|null, itemIds?: string[]}|null} pool
 * @returns {string[]}
 */
export function mirrorMembers(pool) {
  const ids = Array.isArray(pool?.itemIds) ? pool.itemIds : [];
  return ids.filter(id => id && id !== pool.itemId);
}

/**
 * **WHAT A CLASS JOINING A SHARED POOL STORES** at its link: the value of the first class entry already holding a
 * Power pool of the same shared name, or null where the new class's pool is not shared or nobody holds it yet (the
 * class then opens full, as every new pool does).
 *
 * @param {Array<{itemId: string, power?: {value?: number}}>} classes  `system.classes`, as stored
 * @param {(itemId: string) => string|null} nameOf  the Power pool name a class item gives
 * @param {string|null} name  the joining class's Power pool name
 * @returns {number|null}
 */
export function sharedPoolValue(classes = [], nameOf = () => null, name = null) {
  if (!isSharedPool(name)) return null;
  const holder = (Array.isArray(classes) ? classes : []).find(c => c?.itemId && nameOf(c.itemId) === name);
  return holder ? whole(holder.power?.value) : null;
}

/**
 * **MIGRATION 0.16.0.2's PLANNER** (D-1723): a character whose classes give Energy twice stored two values, one an
 * entry, and the pool they now share reads the holder's. Every member entry is set to the larger stored value, held
 * to the merged pool's cap (`min(cap, max(stored))`, the coordinator's rule), so no character loses Energy it held.
 * Idempotent: a second run finds every member at that value and answers null.
 *
 * @param {{classes?: Array<object>, classItems?: Array<object>, level?: number}} o
 *   `classes` is the stored `system.classes`; `classItems` each class item's stored `system` with `itemId` and the
 *   entry's `level` laid on it (what `poolsFor` reads)
 * @returns {{classes: Array<object>, value: number, itemIds: string[]}|null}  the whole new array, or null
 */
export function mergeEnergyPlan({ classes = [], classItems = [], level = 1 } = {}) {
  const stored = Array.isArray(classes) ? classes : [];
  if (stored.length < 2) return null;
  const merged = poolsFor(Array.isArray(classItems) ? classItems : [], level).powers
    .find(p => isSharedPool(p.name) && Array.isArray(p.itemIds) && p.itemIds.length > 1);
  if (!merged) return null;
  const members = merged.itemIds.map(id => stored.find(c => c?.itemId === id)).filter(Boolean);
  if (members.length < 2) return null;
  const cap = whole(merged.max);
  const value = Math.min(cap, Math.max(...members.map(c => whole(c.power?.value))));
  if (members.every(c => whole(c.power?.value) === value && int(c.power?.value) === value)) return null;
  const ids = new Set(merged.itemIds);
  return {
    classes: stored.map(c => (ids.has(c?.itemId) ? { ...c, power: { ...(c.power ?? {}), value } } : { ...c })),
    value,
    itemIds: [...merged.itemIds]
  };
}
