/**
 * Migration to 0.15.3.1 - two repairs found by the Death Knight's close-out (run close-F2), on what
 * a world already holds. Each is read against the PACK COPY (D-665) and is a no-op on its second pass.
 *
 * **A point step inside the unreleased 0.15.3**: a world the working tree already migrated to 0.15.3
 * (the test world, and any world on the dev junction) would never run a repair added to the 0.15.3
 * entry, because `runMigrations` runs only the CHAIN entries newer than the world's setting
 * (CLAUDE.md §15). `compareVersions` reads `0.15.3.1` as past `0.15.3` and short of `0.15.4`, so a
 * world on 0.15.2 runs both in one load and a world on 0.15.3 runs this one.
 *
 * 1. **07's timed Action** (O-351): fourteen roleplay spells print *1 minute* as their Action and the
 *    parser read it as an Action, so a held copy says `action`. Only the pair `action` held /
 *    `minute` in the pack is written.
 * 2. **The rules chapters the world already imported** (F6's question 5): the importer skips a held
 *    chapter, so a world that imported the book before the Death Knight still reads 02 §7 as *The
 *    eleven classes*. `applications/rules-journals.mjs#repairRulesJournals` makes the pages the book
 *    has and the world lacks, under the ids a link names, and never writes a held page: where one
 *    differs from the book, the book's page is made beside it as `<page> (book)` (the lead's ruling
 *    on the close review's finding 3, *"Keep the GM's copy"*). Ownership and the GM-only closure
 *    are never written (`rules/rules-journal-repair.mjs`).
 *
 * **A PACK THAT PREDATES A REPAIR WARNS AND STAMPS NOTHING** (D-758's rule): a spells pack in which no
 * spell's Action is `minute`, or a rules pack whose 02 §7 is not *The twelve classes*, was built
 * before the repair. Each warns in words and skips its own step; it never throws.
 *
 * Every document touched is logged (`walkWorld`, and the journal pass per chapter).
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The update for one held spell's raw system, or null: 07's *1 minute* where the pack says so. */
export function buildTimedActionUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (pack.action !== "minute" || raw.action !== "action") return null;
  return { "system.action": "minute" };
}

/** Whether the spells pack carries step 1: a pack built before the parser read *1 minute* holds none. */
export function spellPackCarriesTimedActions(table) {
  for (const system of table?.byIdentifier?.values?.() ?? []) if (system?.action === "minute") return true;
  return false;
}

export async function migrate(log = console.log) {
  let count = 0;
  const spells = await packSystems("azeroth-rpg.spells");
  if (spellPackCarriesTimedActions(spells)) {
    count += await walkWorld({
      item: doc => (doc.type === "spell" ? buildTimedActionUpdate(rawSystem(doc), packCopy(spells, rawSystem(doc), doc.name)) : null)
    }, log);
  } else {
    console.warn("azeroth-rpg | azeroth-rpg.spells predates the 0.15.3.1 repair (no spell's Action is 1 minute, O-351), so no held spell was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.3.1 and reload.");
  }
  // **A REPAIR THAT FAILS IS NOT STAMPED** (the close review's finding 4): the error goes up to
  // `runMigrations`, which stops the chain without advancing the setting, so a fixed build (or a
  // GM who comes back over HTTPS) retries. Both steps are no-ops on a second pass, so a retry
  // writes only what is still missing.
  const { repairRulesJournals } = await import("../applications/rules-journals.mjs");
  const journals = await repairRulesJournals(log);
  count += journals.pages;
  return count;
}
