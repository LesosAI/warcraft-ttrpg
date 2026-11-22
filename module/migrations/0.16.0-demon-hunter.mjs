/**
 * Migration to 0.16.0 - the Demon Hunter release (the Demon Hunter plan's Phase 3; the lead, Q8:
 * version 0.16.0, the review page's default).
 *
 * Every document is read against its PACK COPY, never against `undefined` (D-665):
 *
 * 1. **The ten borrowed Fel spells name the Demon Hunter** (07: Felstep, Fel Armor, Banish,
 *    Soulchains, Hellquake, Demonhide, Nether Ward, Rend the Veil, Demonheart and Chaosbrand print
 *    `**Restricted** Warlock, Demon Hunter`). A held copy whose list is the pack's less the Demon
 *    Hunter takes the pack's list; a GM who gave a spell to another class keeps that list.
 * 2. **07 prints Energy** on the Demon Hunter's own spells, and a copy taken from a pack built
 *    before this build read Mana (the spell model's choices refused the word): it takes Energy where
 *    its pack copy prints Energy, as 0.15.4.6 did for Vitae.
 * 3. **The Night Elf and the Blood Elf open the class** (02 §3's matrix): a race item a character
 *    already holds keeps its own `classes` list, and `rules/multiclass.mjs#multiclassRefusal` reads
 *    it when the Demon Hunter is taken second, so a held race whose list is the pack's less the Demon
 *    Hunter takes the pack's list.
 * 4. **The rules chapters the world already imported** are brought up to the book whose 02 §7 counts
 *    fifteen classes (the page's id is hashed from its title, `rules-journal-repair.mjs#rulesPageId`),
 *    as 0.15.4.1 did for the San'layn's book.
 * 5. **The Moonglaive and the Sentinel's glaive gain Deft** (08 §7; the lead's Q12 default, D-1437 to
 *    D-1449): a held copy takes it at the pack's own place in its list through 0.15.4.2's own rule
 *    (`rules/deft-migration.mjs#buildDeftUpdate`), and only these two, the release's (D-1500). A weapons
 *    pack whose Moonglaive carries no Deft warns and stamps nothing.
 *
 * **A PACK BUILT BEFORE THE DEMON HUNTER'S BOOK WARNS AND STAMPS NOTHING** (D-758's rule): steps 1
 * to 3 need a spells pack in which a spell names the Demon Hunter, and step 4 a rules pack whose 02
 * §7 counts fifteen classes. Each says so in the console and writes nothing; none throws. Every
 * document touched is logged by `walkWorld`; a second run writes nothing.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
// 0.15.4.2's own rule for a weapon that gained Deft (D-1169), read again for this release's two.
import { buildDeftUpdate, isDeftTrait } from "../rules/deft-migration.mjs";

/** The two glaives 08 §7 gave Deft in this release (Q12, D-1437 to D-1449). */
export const DEFT_GAINED = Object.freeze(["moonglaive", "sentinels-glaive"]);

/** The class this release adds (02 §7). */
export const DEMON_HUNTER = "Demon Hunter";

/** The class count of the book step 4 brings a world up to. */
export const DEMON_HUNTER_CLASS_COUNT = 15;

/** The rules compendium's key (`applications/rules-journals.mjs#RULES_PACK`). */
const RULES_PACK = "azeroth-rpg.rules";

/**
 * A held list widened to the pack's where the pack added the Demon Hunter and nothing else, or null.
 *
 * @param {string[]|null} held
 * @param {string[]|null} pack
 * @returns {string[]|null}
 */
function widened(held, pack) {
  if (!Array.isArray(held) || !Array.isArray(pack)) return null;
  if (!pack.includes(DEMON_HUNTER) || held.includes(DEMON_HUNTER)) return null;
  const added = pack.filter(c => !held.includes(c));
  const kept = held.every(c => pack.includes(c));
  return kept && added.length === 1 && added[0] === DEMON_HUNTER ? [...pack] : null;
}

/**
 * The update one held spell takes, or null (steps 1 and 2).
 *
 * @param {object|null} raw   the held spell's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildDemonHunterSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const update = {};
  const classes = widened(raw.classes, pack.classes);
  if (classes) update["system.classes"] = classes;
  if (pack.costPool === "energy" && raw.costPool !== "energy") update["system.costPool"] = "energy";
  return Object.keys(update).length ? update : null;
}

/**
 * The update one held race takes, or null (step 3).
 *
 * @param {object|null} raw   the held race's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildDemonHunterRaceUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const classes = widened(raw.classes, pack.classes);
  return classes ? { "system.classes": classes } : null;
}

/**
 * The update one held weapon takes, or null (step 5): this release's two glaives only.
 *
 * @param {object|null} raw   the held weapon's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildDemonHunterWeaponUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  if (!DEFT_GAINED.includes(pack.identifier ?? raw.identifier)) return null;
  return buildDeftUpdate(raw, pack);
}

/** Whether the weapons pack carries this release's Deft: its Moonglaive names the trait. */
export function weaponPackCarriesGlaiveDeft(table) {
  const moon = table?.byIdentifier?.get?.("moonglaive") ?? null;
  return Boolean(moon && (moon.traits ?? []).some(isDeftTrait));
}

/** Whether the spells pack carries the Demon Hunter's 07: a spell names the class. */
export function spellPackCarriesDemonHunter(table) {
  for (const sys of table?.byIdentifier?.values?.() ?? []) {
    if (Array.isArray(sys?.classes) && sys.classes.includes(DEMON_HUNTER)) return true;
  }
  return false;
}

/** Whether the races pack opens the class: a race's list names it. */
export function racePackCarriesDemonHunter(table) {
  for (const sys of table?.byIdentifier?.values?.() ?? []) {
    if (Array.isArray(sys?.classes) && sys.classes.includes(DEMON_HUNTER)) return true;
  }
  return false;
}

export async function migrate(log = console.log) {
  let touched = 0;
  const spells = await packSystems("azeroth-rpg.spells");
  const races = await packSystems("azeroth-rpg.races");
  const spellsReady = spellPackCarriesDemonHunter(spells);
  const racesReady = racePackCarriesDemonHunter(races);
  if (!spellsReady || !racesReady) {
    console.warn("azeroth-rpg | azeroth-rpg.spells or azeroth-rpg.races predates the Demon Hunter's book (no spell or race names the class), so no held spell or race was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0 and reload.");
  } else {
    touched += await walkWorld({
      item: doc => {
        const raw = rawSystem(doc);
        if (doc.type === "spell") {
          const update = buildDemonHunterSpellUpdate(raw, packCopy(spells, raw, doc.name));
          if (update) log(`azeroth-rpg | 0.16.0: ${doc.name} takes the Demon Hunter's 07 (${Object.keys(update).join(", ")})`);
          return update;
        }
        if (doc.type === "race") {
          const update = buildDemonHunterRaceUpdate(raw, packCopy(races, raw, doc.name));
          if (update) log(`azeroth-rpg | 0.16.0: ${doc.name} opens the Demon Hunter`);
          return update;
        }
        return null;
      }
    }, log);
  }
  // 5. The two glaives' Deft (D-1500), on its own gate: a stale weapons pack writes nothing.
  const weapons = await packSystems("azeroth-rpg.weapons");
  if (!weaponPackCarriesGlaiveDeft(weapons)) {
    console.warn("azeroth-rpg | azeroth-rpg.weapons predates the Demon Hunter's book (its Moonglaive carries no Deft), so no held glaive was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0 and reload.");
  } else {
    touched += await walkWorld({
      item: doc => {
        if (doc.type !== "weapon") return null;
        const raw = rawSystem(doc);
        const update = buildDemonHunterWeaponUpdate(raw, packCopy(weapons, raw, doc.name));
        if (update) log(`azeroth-rpg | 0.16.0: ${doc.name} takes 08 §5's Deft`);
        return update;
      }
    }, log);
  }
  // 4. The rules chapters, keyed on the class COUNT (the Necromancer plan's finding 6).
  const { rulesPackCountsClasses } = await import("../rules/rules-journal-repair.mjs");
  const pack = game.packs.get(RULES_PACK);
  if (!pack) return touched;
  const documents = await pack.getDocuments();
  const chapters = documents.map(d => ({ name: d.name, pages: [...d.pages].map(p => ({ name: p.name })) }));
  if (!rulesPackCountsClasses(chapters, DEMON_HUNTER_CLASS_COUNT)) {
    console.warn(`azeroth-rpg | ${RULES_PACK} predates the Demon Hunter's book (02 §7 counts fewer than fifteen classes), so no held chapter was brought up to it. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0 and reload.");
    return touched;
  }
  const { repairRulesJournals } = await import("../applications/rules-journals.mjs");
  const journals = await repairRulesJournals(log);
  return touched + (journals?.pages ?? 0);
}
