/**
 * Migration to 0.12.24 - the cross-class rulings (D-778; the lead's answers of
 * 2026-10-03), where they move what a spell carries.
 *
 * Every new door this version builds reads 07's own words AT THE CAST - the
 * upkeep a Sustain pays, the Speed drop a hit lays, the forced move a failure or
 * an area makes, the Test a held creature is given to break free - so nothing new
 * is stored on a spell. Three descriptors the parser stamps moved with them, and a
 * world's copies are brought into line:
 *
 * - **`onFail`**: a failure's conditions are read off the failure's own clause
 *   (`spell-effects.mjs#seedOnFail`), so Absolute Zero's failure no longer lays the
 *   **Slowed** its SUCCESS names beside its Stun, and Stormwall's lays nothing;
 * - **`areaTick`**: its `reason` no longer lists what is built now - Tempest's
 *   Test on entering and its push, Void Rift's pull, Rimebind's and Thornguard's
 *   Test repeated at the end of each turn;
 * - **`tick`**: its `reason` no longer lists Felfire Aura's and Felstep's upkeep
 *   paid in Health, which the turn's start charges now.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665), and only
 * while the spell's words are the book's: a GM who rewrote an entry keeps what
 * they wrote. Idempotent by construction. What a world has already LAID is not
 * touched: a creature Absolute Zero Stunned and Slowed before this version keeps
 * both until they end.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

/** Deep equality with key order ignored: a stored object and a pack copy may list keys differently. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/** The descriptors this version restamps, in the order the parser stamps them. */
export const RESTAMPED = Object.freeze(["onFail", "areaTick", "tick"]);

/** The spells whose descriptors moved, for the log and the test. */
export const MOVED = Object.freeze({
  onFail: Object.freeze(["Absolute Zero", "Stormwall"]),
  areaTick: Object.freeze(["Rimebind", "Tempest", "Thornguard", "Void Rift"]),
  tick: Object.freeze(["Felfire Aura", "Felstep"])
});

/**
 * A spell's update, or null: the pack's `onFail`, `areaTick` and `tick` wherever
 * the stored ones differ, while the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildCrossClassUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (plainOf(raw.effect) !== plainOf(pack.effect)) return null;
  const update = {};
  for (const key of RESTAMPED) {
    if (pack[key] === undefined) continue;
    if (!same(raw[key], pack[key])) update[`system.${key}`] = clone(pack[key]);
  }
  return Object.keys(update).length ? update : null;
}

export async function migrate(log = console.log) {
  const table = await packSystems("azeroth-rpg.spells");
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildCrossClassUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
