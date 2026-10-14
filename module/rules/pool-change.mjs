/**
 * A pool's cap raised by an effect (07: Arcane Intellect, Arcane Brilliance;
 * 2026-09-06). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * A pool's cap is not a key on the actor: it is derived per class into
 * `system.powers[]` and `system.momenta[]` (D-507), and a creature's is the
 * flat `system.power` and `system.momentum` (14). So a change that raises
 * one is the system's own change TYPE - `pool`, registered in
 * `CONFIG.ActiveEffect.changeTypes` (CLAUDE.md §6) - whose key is the pool's
 * name and whose value is the points, applied in the `final` phase where
 * the derived pools exist. `raisePool` is what the handler does, on the
 * prepared system; `poolRises` reads the sentence off a spell's effect.
 */

import { AZEROTH } from "../config.mjs";
import { clampPool } from "./progression.mjs";

/** The change type the handler registers. */
export const POOL_CHANGE_TYPE = "pool";

/** `comboPoints` → `combo points`, the words 07 writes before *pool*. */
function wordsOf(key) {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

/**
 * Every `<Pool> pool rises by N` a text states, as pool keys.
 * @param {string} text   flat text
 * @returns {Array<{key: string, points: number}>}
 */
export function poolRises(text) {
  const out = [];
  const byWords = Object.keys(AZEROTH.poolTypes).map(key => [wordsOf(key), key]);
  for (const m of String(text ?? "").matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) pool rises by (\d+)\b/g)) {
    const words = m[1].toLowerCase();
    const found = byWords.find(([w]) => w === words);
    if (found) out.push({ key: found[1], points: Number(m[2]) });
  }
  return out;
}

/**
 * Raise the named pool's cap on a prepared system, in place. A character's
 * pools are the per-class entries: the cap rises, the value is re-read from
 * the stored class entry against the new cap (derived data clamped it to
 * the old one first), and the primary mirror follows. A creature's are flat
 * by kind: a Power name raises its Power, a Momentum name its Momentum.
 *
 * @param {object} system
 * @param {string} name       a key of `AZEROTH.poolTypes`
 * @param {number|string} amount
 * @param {{type?: string}} [o]
 * @returns {boolean} whether any pool moved
 */
export function raisePool(system, name, amount, { type = "character" } = {}) {
  const n = Number(amount);
  if (!system || !Number.isFinite(n) || n === 0 || !AZEROTH.poolTypes[name]) return false;
  let touched = false;
  for (const [listKey, mirrorKey] of [["powers", "power"], ["momenta", "momentum"]]) {
    const list = Array.isArray(system[listKey]) ? system[listKey] : [];
    list.forEach((pool, i) => {
      if (pool?.name !== name) return;
      pool.max = Math.max(0, (pool.max ?? 0) + n);
      const stored = system.classes?.find?.(c => c.itemId === pool.itemId)?.[mirrorKey]?.value;
      if (stored !== undefined && stored !== null) pool.value = clampPool(stored, pool);
      if (i === 0 && system[mirrorKey] && typeof system[mirrorKey] === "object") {
        system[mirrorKey].max = pool.max;
        system[mirrorKey].value = pool.value;
      }
      touched = true;
    });
  }
  if (!touched && type === "npc") {
    const pool = AZEROTH.powerTypes[name] ? system.power : (AZEROTH.momentumTypes[name] ? system.momentum : null);
    if (pool && pool.max !== null && pool.max !== undefined) {
      pool.max = Math.max(0, pool.max + n);
      if (AZEROTH.powerTypes[name] && system.powers?.[0]) system.powers[0].max = pool.max;
      touched = true;
    }
  }
  return touched;
}
