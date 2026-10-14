/**
 * Migration to 0.12.21 - damage or healing laid on a creature that lands at the
 * start of each of its turns (D-770; the lead, 2026-10-03: *"Build the tick
 * now"*), and the lay door's two faults found on the way.
 *
 * The packs are regenerated, so a copy dragged out afresh is right already.
 * This is the repair pass over what a world holds, and it touches one type:
 *
 * - **Every spell carries `tick`**: Rejuvenation's 2 Health, Immolate's 2 Fire,
 *   Moonfire's 2 after its 4, and the reason for every per-turn sentence the
 *   tick does not carry.
 * - **Five spells' `applies` move**: a condition the entry says the target
 *   CANNOT be is no longer laid on it (Levitate's Prone, Light Unending's
 *   Frightened and Charmed, Barkskin's Bleeding, Elune's Answer's Blinded,
 *   Barrier's pair), and *Ward 3 against Shadow and Fel* lays both Wards.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A
 * spell read through the model carries `tick` at its initial - the empty shape
 * - so the stored value is held against the pack's, and the pack's is written
 * wherever the two differ. **Only while the spell's words are the book's**: a
 * GM who rewrote an entry keeps what they wrote. Idempotent by construction:
 * after one pass every book-worded spell's two descriptors equal their pack
 * copy's.
 *
 * What a world has already LAID is not touched: an effect laid before this
 * version carries no tick and keeps none, and the next cast lays one.
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

/** The two descriptors this version restamps, in the order the parser stamps them. */
export const RESTAMPED = Object.freeze(["applies", "tick"]);

/**
 * A spell's update, or null: the pack's `applies` and `tick` wherever the
 * stored ones differ, while the spell's words are still the book's.
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
