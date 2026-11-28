/**
 * Migration to 0.18.0 - the Witch Hunter release, the sixteenth class (the Witch Hunter plan; version
 * 0.18.0, the proposal the lead did not change).
 *
 * Every document is read against its PACK COPY, never against `undefined` (D-665):
 *
 * 1. **The Human opens the class** (02 §3's matrix: *Only a Human may take the Witch Hunter.*; the lead,
 *    R5: *"Human only (Recommended)"*). A race item a character already holds keeps its own `classes`
 *    list, which `rules/guise.mjs#raceOpensClass` and the creator read, so a held race whose list is the
 *    pack's less the Witch Hunter takes the pack's list. A GM's own list is left alone.
 * 2. **A held brew or medallion takes its pack copy's descriptor** (08 §11's medallion, 08 §12's nineteen
 *    brews). Only a copy that came from the pack - the same identifier AND the same 08 section - is read,
 *    so a GM's hand-made *Decoction* is never touched: a brew's `use` where it differs from the pack
 *    copy's (`walk.mjs#sameStored`), the medallion's Neck `slot` where it holds none, and the medallion's
 *    rarity ladder (`flags.azeroth-rpg.medallion`) where it carries none.
 * 3. **The rules chapters the world already imported** are brought up to the book whose 02 §7 counts
 *    sixteen classes, as 0.16.0 did for fifteen.
 *
 * **A PACK BUILT BEFORE THE WITCH HUNTER'S BOOK WARNS AND STAMPS NOTHING** (D-758's rule): step 1 needs a
 * races pack in which a race names the class, step 2 a gear pack that holds the medallion, step 3 a rules
 * pack whose 02 §7 counts sixteen. Each says so in the console and writes nothing; none throws. Every
 * document touched is logged by `walkWorld`; a second run writes nothing.
 */

import { packCopy, packSystems, rawSystem, sameStored, walkWorld } from "./walk.mjs";
import { isBrewIdentifier } from "../rules/witch-hunter-brews.mjs";
import { MEDALLION, MEDALLION_SLOT } from "../rules/medallion.mjs";

/** The class this release adds (02 §7). */
export const WITCH_HUNTER = "Witch Hunter";

/** The class count of the book step 3 brings a world up to. */
export const WITCH_HUNTER_CLASS_COUNT = 16;

/** The rules compendium's key (`applications/rules-journals.mjs#RULES_PACK`). */
const RULES_PACK = "azeroth-rpg.rules";

/**
 * A held list widened to the pack's where the pack added the Witch Hunter and nothing else, or null.
 *
 * @param {string[]|null} held
 * @param {string[]|null} pack
 * @returns {string[]|null}
 */
function widened(held, pack) {
  if (!Array.isArray(held) || !Array.isArray(pack)) return null;
  if (!pack.includes(WITCH_HUNTER) || held.includes(WITCH_HUNTER)) return null;
  const added = pack.filter(c => !held.includes(c));
  const kept = held.every(c => pack.includes(c));
  return kept && added.length === 1 && added[0] === WITCH_HUNTER ? [...pack] : null;
}

/**
 * The update one held race takes, or null (step 1).
 *
 * @param {object|null} raw   the held race's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildWitchHunterRaceUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const classes = widened(raw.classes, pack.classes);
  return classes ? { "system.classes": classes } : null;
}

/** Whether a held item is the pack's own copy: the same identifier and the same 08 section. */
function fromPack(raw, pack) {
  return Boolean(raw?.identifier && pack?.identifier === raw.identifier
    && String(raw?.source?.section ?? "") === String(pack?.source?.section ?? ""));
}

/**
 * The update one held gear item takes, or null (step 2).
 *
 * @param {object|null} raw         the held item's stored `system`
 * @param {object|null} pack        its pack copy's `system`
 * @param {object|null} heldFlags   the held item's `flags.azeroth-rpg`
 * @param {object|null} packFlags   the pack copy's `flags.azeroth-rpg`
 * @returns {object|null}
 */
export function buildWitchHunterGearUpdate(raw, pack = null, heldFlags = null, packFlags = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !fromPack(raw, pack)) return null;
  const update = {};
  if (isBrewIdentifier(pack.identifier) && pack.use && !sameStored(raw.use, pack.use)) update["system.use"] = structuredClone(pack.use);
  if (pack.identifier === MEDALLION) {
    if (!raw.slot && pack.slot === MEDALLION_SLOT) update["system.slot"] = MEDALLION_SLOT;
    const ladder = packFlags?.medallion ?? null;
    if (ladder && !heldFlags?.medallion) update["flags.azeroth-rpg.medallion"] = structuredClone(ladder);
  }
  return Object.keys(update).length ? update : null;
}

/** Whether the races pack opens the class: a race's list names it. */
export function racePackCarriesWitchHunter(table) {
  for (const sys of table?.byIdentifier?.values?.() ?? []) {
    if (Array.isArray(sys?.classes) && sys.classes.includes(WITCH_HUNTER)) return true;
  }
  return false;
}

/** Whether the gear pack carries the Witch Hunter's 08: it holds the medallion. */
export function gearPackCarriesWitchHunter(table) {
  return Boolean(table?.byIdentifier?.get?.(MEDALLION));
}

export async function migrate(log = console.log) {
  let touched = 0;
  const races = await packSystems("azeroth-rpg.races");
  const gear = await packSystems("azeroth-rpg.gear");
  const racesReady = racePackCarriesWitchHunter(races);
  const gearReady = gearPackCarriesWitchHunter(gear);
  if (!racesReady) {
    console.warn("azeroth-rpg | azeroth-rpg.races predates the Witch Hunter's book (no race names the class), so no held race was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.18.0 and reload.");
  }
  if (!gearReady) {
    console.warn("azeroth-rpg | azeroth-rpg.gear predates the Witch Hunter's book (it holds no witch hunter's medallion), so no held brew or medallion was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.18.0 and reload.");
  }
  if (racesReady || gearReady) {
    touched += await walkWorld({
      item: doc => {
        const raw = rawSystem(doc);
        if (racesReady && doc.type === "race") {
          const update = buildWitchHunterRaceUpdate(raw, packCopy(races, raw, doc.name));
          if (update) log(`azeroth-rpg | 0.18.0: ${doc.name} opens the Witch Hunter`);
          return update;
        }
        if (gearReady && doc.type === "gear") {
          const pack = gear.byIdentifier.get(raw?.identifier) ?? null;
          const update = buildWitchHunterGearUpdate(raw, pack, doc.flags?.["azeroth-rpg"] ?? null, gear.flagsByIdentifier?.get(raw?.identifier) ?? null);
          if (update) log(`azeroth-rpg | 0.18.0: ${doc.name} takes its 08 copy (${Object.keys(update).join(", ")})`);
          return update;
        }
        return null;
      }
    }, log);
  }
  // 3. The rules chapters, keyed on the class COUNT (the Necromancer plan's finding 6).
  const { rulesPackCountsClasses } = await import("../rules/rules-journal-repair.mjs");
  const pack = game.packs.get(RULES_PACK);
  if (!pack) return touched;
  const documents = await pack.getDocuments();
  const chapters = documents.map(d => ({ name: d.name, pages: [...d.pages].map(p => ({ name: p.name })) }));
  if (!rulesPackCountsClasses(chapters, WITCH_HUNTER_CLASS_COUNT)) {
    console.warn(`azeroth-rpg | ${RULES_PACK} predates the Witch Hunter's book (02 §7 counts fewer than sixteen classes), so no held chapter was brought up to it. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.18.0 and reload.");
    return touched;
  }
  const { repairRulesJournals } = await import("../applications/rules-journals.mjs");
  const journals = await repairRulesJournals(log);
  return touched + (journals?.pages ?? 0);
}
