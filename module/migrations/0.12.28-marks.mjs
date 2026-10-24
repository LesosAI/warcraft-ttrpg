/**
 * Migration to 0.12.28 - a spell's damage that bypasses armor and Ward, and what a creature
 * ability's Test governs (the Legacy branches' B8a2 pass; the lead: *"Build them now"*).
 *
 * 07's Stormfury and eight more write *The target takes 20 Nature damage, bypassing armor and
 * Ward*, and the card's Apply met each with the target's Armor Points and Ward. 14's abilities
 * write *or half on a Resilience (Reflex) Test*, *unless it passes*, and the Wild Kodo's *makes
 * a Resilience (Reflex) Test at DC 14 or takes 3 damage and is knocked **Prone***, and an
 * ability's card recorded no Test for any of it to read. The parsers now stamp a spell's
 * `system.damage.bypass` (`rules/bypass.mjs`) and an ability's `automation.damage.half`,
 * `automation.damage.onFail` and `automation.inflicts.onFail` (`rules/ability-automation.mjs
 * #seedAutomation`, reading `rules/resisted.mjs`); the packs are regenerated, so a copy dragged
 * out afresh is right already. This is the repair pass over what a world holds.
 *
 * **COMPARED AGAINST THE PACK COPY, NEVER AGAINST `undefined`** (D-665). A spell read through
 * the model carries `damage.bypass` at its initial, `false`, and a creature's ability its three
 * marks at theirs, so the stored marks are held against the pack's and the pack's are written
 * wherever they differ. **Only the marks**: a GM's own Rating, DC or condition stands. **And
 * only while the words are the book's**: a spell whose effect, or an ability whose prose, a GM
 * rewrote keeps what it holds. An ability is matched by its creature's name and its own.
 * Idempotent by construction: after one pass every book-worded mark equals its pack copy's.
 *
 * **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO** (D-758's rule, 0.12.27's shape): the
 * chain runs this as soon as the code is present, and a pack compiled before the parsers
 * stamped the marks reads every one at its initial - a throw would stop the chain with a
 * console error on every load. Each half warns, names the fix, and stamps nothing.
 *
 * A class feature's price on its success (02's *On success, spend 8 Mana*, `cost.on`) is
 * stamped by the feature sync at every world load (D-621), so no feature is touched here.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";

/** The packs every mark here is read from. */
export const SPELLS_PACK = "azeroth-rpg.spells";
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/** The lists a creature's descriptors live in, in the model's own order. */
const LISTS = Object.freeze(["creatureAbilities", "bossActions"]);

/**
 * A spell's update, or null: the pack's `damage.bypass` wherever the stored one differs, while
 * the spell's words are still the book's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildBypassUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (plainOf(raw.effect) !== plainOf(pack.effect)) return null;
  const want = pack.damage?.bypass === true;
  if ((raw.damage?.bypass === true) === want) return null;
  return { "system.damage.bypass": want };
}

/** One ability's three marks, as the comparison reads them. */
function marksOf(automation) {
  return {
    half: automation?.damage?.half === true,
    onFail: automation?.damage?.onFail === true,
    governs: automation?.inflicts?.onFail === true
  };
}

/**
 * A creature's update, or null: every book-worded ability row's three marks off the pack's row
 * of the same name, the whole list written where any row moved (an array is what it is).
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildAbilityMarksUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const update = {};
  for (const list of LISTS) {
    const stored = Array.isArray(raw[list]) ? raw[list] : [];
    const fresh = Array.isArray(pack[list]) ? pack[list] : [];
    if (!stored.length || !fresh.length) continue;
    const byName = new Map(fresh.map(r => [r?.name, r]));
    let moved = false;
    const rows = stored.map(row => {
      const want = byName.get(row?.name) ?? null;
      if (!want || !row?.automation || plainOf(row.description) !== plainOf(want.description)) return row;
      const have = marksOf(row.automation);
      const need = marksOf(want.automation);
      if (have.half === need.half && have.onFail === need.onFail && have.governs === need.governs) return row;
      moved = true;
      const automation = JSON.parse(JSON.stringify(row.automation));
      automation.damage = { ...(automation.damage ?? {}), half: need.half, onFail: need.onFail };
      automation.inflicts = { ...(automation.inflicts ?? {}), onFail: need.governs };
      return { ...row, automation };
    });
    if (moved) update[`system.${list}`] = rows;
  }
  return Object.keys(update).length ? update : null;
}

/**
 * Whether the compiled spells pack carries the bypass at all: some spell's `damage.bypass`
 * set. A pack compiled before the parser stamped it carries it on none.
 *
 * @param {Iterable<object>} systems
 * @returns {boolean}
 */
export function packCarriesBypass(systems = []) {
  for (const s of systems ?? []) if (s?.damage?.bypass === true) return true;
  return false;
}

/**
 * Whether the compiled bestiary carries the ability marks at all: some row's mark set.
 *
 * @param {Iterable<object>} systems
 * @returns {boolean}
 */
export function packCarriesAbilityMarks(systems = []) {
  for (const s of systems ?? []) {
    for (const list of LISTS) {
      for (const row of s?.[list] ?? []) {
        const m = marksOf(row?.automation);
        if (m.half || m.onFail || m.governs) return true;
      }
    }
  }
  return false;
}

export async function migrate(log = console.log) {
  const spells = await packSystems(SPELLS_PACK);
  const bestiary = await packSystems(BESTIARY_PACK);
  const spellsReady = packCarriesBypass(spells.byIdentifier.values());
  const bestiaryReady = packCarriesAbilityMarks(bestiary.byName.values());
  const stale = [!spellsReady ? SPELLS_PACK : null, !bestiaryReady ? BESTIARY_PACK : null].filter(Boolean);
  if (stale.length) {
    console.warn(`azeroth-rpg | ${stale.join(" and ")} carry none of the 0.12.28 marks yet, so nothing from ${stale.length > 1 ? "them" : "it"} was stamped. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.27 and reload.");
  }
  if (!spellsReady && !bestiaryReady) return 0;
  return walkWorld({
    item: doc => {
      if (!spellsReady || doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildBypassUpdate(raw, packCopy(spells, raw, doc.name));
    },
    actor: doc => {
      if (!bestiaryReady || doc.type !== "npc") return null;
      return buildAbilityMarksUpdate(rawSystem(doc), bestiary.byName.get(doc.name) ?? null);
    }
  }, log);
}
