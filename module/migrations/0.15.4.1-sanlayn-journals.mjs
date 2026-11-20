/**
 * Migration to 0.15.4.1 - the rules chapters the world already imported, brought up to the San'layn's
 * book (the San'layn plan's F7 and C-10; D-1154).
 *
 * A rules page's id is hashed from its chapter and its title (`rules/rules-journal-repair.mjs
 * #rulesPageId`), so the book renaming 02 §5 to *The thirteen races* and §7 to *The fourteen classes*
 * gives both pages new ids. A world that imported 02 before holds the old pages under the old ids;
 * `applications/rules-journals.mjs#repairRulesJournals` makes every page the book has and the world
 * lacks, under the id a link names, and never writes or removes a held page (the lead, on the close
 * review's finding 3: *"Keep the GM's copy"*). The old §5 and §7 pages are KEPT and logged.
 *
 * **A POINT STEP AFTER THE RELEASED 0.15.4** (0.15.3.1's precedent): the release that carries the
 * San'layn is the lead's to name (C-8), and `compareVersions` reads `0.15.4.1` as past `0.15.4` and
 * short of any `0.15.5` or `0.16.0`, so this step runs on every world at 0.15.4 whatever that name is.
 *
 * **A PACK THAT PREDATES THE BOOK WARNS AND STAMPS NOTHING** (D-758's rule): a rules pack whose 02 §5
 * counts fewer than thirteen races was built before the San'layn, and a pass over it would bring the
 * world up to an old book. It warns in words and writes nothing; it never throws. A journal write
 * that fails throws out of `repairRulesJournals` and the chain stops unstamped, so a retry writes only
 * what is still missing (the pass is a no-op on its second run).
 */

/** The rules compendium's key (`applications/rules-journals.mjs#RULES_PACK`). */
const RULES_PACK = "azeroth-rpg.rules";

export async function migrate(log = console.log) {
  const { rulesPackCarriesPeoples } = await import("../rules/rules-journal-repair.mjs");
  const pack = game.packs.get(RULES_PACK);
  if (!pack) return 0;
  const documents = await pack.getDocuments();
  const chapters = documents.map(d => ({ name: d.name, pages: [...d.pages].map(p => ({ name: p.name })) }));
  if (!rulesPackCarriesPeoples(chapters)) {
    console.warn(`azeroth-rpg | ${RULES_PACK} predates the San'layn's book (02 §5 counts fewer than thirteen races), so no held chapter was brought up to it. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.4.1 and reload.");
    return 0;
  }
  const { repairRulesJournals } = await import("../applications/rules-journals.mjs");
  const journals = await repairRulesJournals(log);
  return journals.pages;
}
