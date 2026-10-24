/**
 * Migration to 0.12.26 - half the damage on a passed Test (the Legacy branches' B6
 * fix; the lead: *"Build it everywhere"*).
 *
 * 07 writes *and half of that, rounded down, on a success* on thirty-seven spells,
 * and no card ever halved anything: the Apply dealt the whole number whatever the
 * Resist came to. The parser now stamps `system.damage.half` off the entry's own
 * sentence (`rules/resisted.mjs#halvesOnPass`), and the card's Apply reads it. The
 * packs are regenerated, so a copy dragged out afresh is right already; this is the
 * repair pass over what a world holds, and it touches one key on one type.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A spell read
 * through the model carries `damage.half` at its initial - `false` - so the stored
 * value is held against the pack's, and the pack's is written wherever the two
 * differ. **Only the one key**: a GM who changed a spell's Rating keeps it. **And only
 * while the spell's words are the book's**: a GM who rewrote an entry keeps what they
 * wrote. Idempotent by construction: after one pass every book-worded spell's `half`
 * equals its pack copy's.
 *
 * A class feature's `damage.half` and `inflicts[].onFail`, and its `who`, are stamped
 * by the feature sync at every world load (D-621), so no feature is touched here.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

/**
 * A spell's update, or null: the pack's `damage.half` wherever the stored one
 * differs, while the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildHalfUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (plainOf(raw.effect) !== plainOf(pack.effect)) return null;
  const want = pack.damage?.half === true;
  const held = raw.damage?.half === true;
  return want === held ? null : { "system.damage.half": want };
}

export async function migrate(log = console.log) {
  const table = await packSystems("azeroth-rpg.spells");
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildHalfUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
