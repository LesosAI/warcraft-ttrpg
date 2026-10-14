/**
 * Migration to 0.12.14 - what an area does to a creature entering it or
 * standing in it, and where it is Difficult ground (D-757; the lead's
 * play-test, 2026-09-25).
 *
 * The packs are regenerated, so a copy dragged out afresh is right already.
 * This is the repair pass over what a world holds, and it touches one type:
 *
 * - **Every spell's `areaTick`** gained `enter`, `checks`, `remains`, `grows`,
 *   `excludesCaster` and `retaliate` - Rain of Fire's entry damage, Thornguard's
 *   Test, Insect Swarm's Bane, Hoarfrost's growth, Immolation's answer to a
 *   blow - and lost the checks' unused `banes`.
 * - **Every spell carries `areaGround`**: whether 07 makes the placed area
 *   Difficult ground, when it lands and lapses, and whether the target ignores
 *   Difficult ground (Firewalk, Ghost Wolf, Blessing of Freedom ...).
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A
 * document read through the model has every new field at its initial - a
 * stored Hoarfrost reads `grows: null` and a stored Blizzard `difficult: false`
 * - so the stored value is held against the pack's, and the pack's is written
 * wherever the two differ. **Only while the spell's words are the book's**: a
 * GM who rewrote an entry keeps what they wrote, and the machinery reads the
 * descriptor they have. Idempotent by construction: after one pass every
 * book-worded spell's two descriptors equal their pack copy's.
 *
 * What a world has already PLACED is not touched: a Region laid before this
 * version carries the tick its card recorded, and a Sustain entry the tick it
 * was cast with. Both end with the spell, and the next cast carries the new one.
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

/** The two descriptors this version restamps, in the order the spell model holds them. */
export const RESTAMPED = Object.freeze(["areaTick", "areaGround"]);

/**
 * A spell's update, or null: the pack's `areaTick` and `areaGround` wherever
 * the stored ones differ, while the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildSpellUpdate(raw, pack = null) {
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
      return buildSpellUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
