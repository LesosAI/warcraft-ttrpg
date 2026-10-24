/**
 * Migration to 0.12.29 - the later Tests' doors and the two cast Tests the book gave a
 * field (the Legacy branches' B9a pass; the lead: *"Build the triggers"*).
 *
 * The parser now stamps the area descriptor the doors read for five spells that had
 * none - Ring of Fire's and Stormwall's crossing, Frozen Rune's first entry, Nether
 * Rift's Bane inside it - and marks the creatures Blackout and The Deep name at the cast
 * as spared (`rules/area-ticks.mjs#readAreaTick`); and 07 prints Holy Wrath's and Earth
 * Shock's **Test** now, so their `system.test.resilience` is read. The packs are
 * regenerated, so a copy dragged out afresh is right already. This is the repair pass over
 * what a world holds: its spells, on actors and in unlocked packs.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A spell read
 * through the model carries its whole `areaTick` at the schema's initials and its Test at
 * null, so the stored descriptor is held against the pack copy's and the pack's is written
 * where they differ - the descriptor whole (an array of rows is what it is), the Test's
 * Resilience alone. **Only while the words are the book's**: a spell whose effect a GM
 * rewrote keeps what it holds. Idempotent by construction: after one pass every
 * book-worded spell's descriptor and Test equal its pack copy's.
 *
 * **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO** (D-758's rule, 0.12.27's shape):
 * the chain runs this as soon as the code is present, and a spells pack compiled before
 * the parser read the crossing carries no crossing row anywhere - a throw would stop the
 * chain with a console error on every load. It warns, names the fix, and stamps nothing.
 *
 * Nature's Grasp's trigger and Nether Rift's Test at the caster's turn are read off the
 * entry's words at the cast (`rules/struck-tests.mjs`, `rules/forced-movement.mjs`), and
 * Holy Wrath's and Earth Shock's gates too (`rules/resisted.mjs#castTestGate`): no stored
 * shape, so nothing of theirs is stamped here.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

/** The pack every stamp here is read from. */
export const SPELLS_PACK = "azeroth-rpg.spells";

/** A value as JSON with every object's keys sorted, so two cleanings of one shape compare equal. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * A spell's update, or null: the pack copy's `areaTick` where the stored one differs and
 * its `test.resilience` where that differs, while the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildLaterTestsUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (plainOf(raw.effect) !== plainOf(pack.effect)) return null;
  const update = {};
  if (pack.areaTick && canonical(raw.areaTick ?? null) !== canonical(pack.areaTick)) {
    update["system.areaTick"] = JSON.parse(JSON.stringify(pack.areaTick));
  }
  const want = pack.test?.resilience ?? null;
  if ((raw.test?.resilience ?? null) !== want) update["system.test.resilience"] = want;
  return Object.keys(update).length ? update : null;
}

/**
 * Whether the compiled spells pack carries the B9a pass's descriptors at all: some spell's
 * check row made on crossing the edge. A pack compiled before the parser read it carries
 * none.
 *
 * @param {Iterable<object>} systems
 * @returns {boolean}
 */
export function packCarriesLaterTests(systems = []) {
  for (const s of systems ?? []) {
    if ((s?.areaTick?.checks ?? []).some(c => c?.on === "cross")) return true;
  }
  return false;
}

export async function migrate(log = console.log) {
  const spells = await packSystems(SPELLS_PACK);
  if (!packCarriesLaterTests(spells.byIdentifier.values())) {
    console.warn(`azeroth-rpg | ${SPELLS_PACK} carries none of the 0.12.29 descriptors yet, so nothing was stamped. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.28 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildLaterTestsUpdate(raw, packCopy(spells, raw, doc.name));
    }
  }, log);
}
