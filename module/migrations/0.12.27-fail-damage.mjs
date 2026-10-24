/**
 * Migration to 0.12.27 - a damage the failure deals and a pass does not, and a spell's
 * splash around its target (the Legacy branches' B8a pass).
 *
 * 07's Rimebind writes *On a failure it takes 2 Frost damage*, and its card's Apply dealt
 * the 2 whatever the Resist came to; Stormfury's *Every creature within 15 feet of it
 * makes a Reflex Resilience Test against your Spell DC or takes 10 Nature damage* was
 * carried by nothing at all. The parser now stamps `system.damage.onFail` and
 * `system.splash` off the entry's own sentences (`rules/resisted.mjs#noneOnPass`,
 * `rules/splash.mjs#readSplash`), and the card reads both. The packs are regenerated, so
 * a copy dragged out afresh is right already; this is the repair pass over what a world
 * holds, and it touches two keys on one type.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A spell read
 * through the model carries `damage.onFail` at its initial - `false` - and `splash` at the
 * empty shape, so the stored values are held against the pack's and the pack's are written
 * wherever they differ. **Only the two keys**: a GM who changed a spell's Rating keeps it.
 * **And only while the spell's words are the book's**: a GM who rewrote an entry keeps
 * what they wrote. Idempotent by construction: after one pass every book-worded spell's two
 * keys equal its pack copy's.
 *
 * **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO** (D-758's rule, 0.12.13's shape):
 * the chain runs this as soon as the code is present, and a spells pack compiled before
 * the parser stamped either key reads both at their initials on every spell - a throw
 * would stop the chain with a console error on every load. It warns, names the fix, and
 * stamps nothing.
 *
 * A class feature's `damage.onFail` (02's Shadow Word: Death) is stamped by the feature
 * sync at every world load (D-621), so no feature is touched here.
 *
 * 0.12.26 was not reopened for this: a world opened since the B6 fix has already run it
 * (the checkout is the install), and a migration that has run never runs again.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";
import { cleanSplash, emptySplash } from "../rules/splash.mjs";

/** The spells pack every key here is read from. */
export const SPELLS_PACK = "azeroth-rpg.spells";

/** A splash as the comparison reads it: the whole shape, nulls for what is absent. */
function splashOf(raw) {
  const out = emptySplash();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const key of Object.keys(out)) if (key in raw) out[key] = raw[key];
  }
  return cleanSplash(out);
}

/** Whether two splashes say the same thing, key by key. */
function sameSplash(a, b) {
  const x = splashOf(a);
  const y = splashOf(b);
  return Object.keys(x).every(key => (x[key] ?? null) === (y[key] ?? null));
}

/**
 * A spell's update, or null: the pack's `damage.onFail` and `splash` wherever the stored
 * ones differ, while the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildFailDamageUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (plainOf(raw.effect) !== plainOf(pack.effect)) return null;
  const update = {};
  const want = pack.damage?.onFail === true;
  if ((raw.damage?.onFail === true) !== want) update["system.damage.onFail"] = want;
  if (!sameSplash(raw.splash, pack.splash)) update["system.splash"] = splashOf(pack.splash);
  return Object.keys(update).length ? update : null;
}

/**
 * Whether the compiled pack carries the keys at all: some spell's `damage.onFail` set, or
 * some spell's splash reaching anybody. A pack compiled before the parser stamped them
 * carries neither on any of its spells.
 *
 * @param {Iterable<object>} systems  the pack's spell systems
 * @returns {boolean}
 */
export function packCarriesFailDamage(systems = []) {
  for (const s of systems ?? []) {
    if (s?.damage?.onFail === true || Number(s?.splash?.feet) > 0) return true;
  }
  return false;
}

export async function migrate(log = console.log) {
  const table = await packSystems(SPELLS_PACK);
  if (!packCarriesFailDamage(table.byIdentifier.values())) {
    console.warn(`azeroth-rpg | ${SPELLS_PACK} carries no failure-only damage and no splash yet, so no spell was stamped. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.26 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildFailDamageUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
