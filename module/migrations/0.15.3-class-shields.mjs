/**
 * Migration to 0.15.3 - a class whose Armor row refuses shields stops reading as a
 * shield-bearer (02 §7; found beside the Death Knight's *Any; no shields*, D-948).
 *
 * The class parser read `shields` as *does the Armor row name a shield*, so 02's *Up to
 * mail, no shields* (the Ranger), *Up to leather, no shields* (the Rogue and the Druid)
 * and the Death Knight's *Any; no shields* all stamped `shields: true`, and
 * `equipment-training.mjs#trainingProfile` trained every one of them with a shield. The
 * parser reads the refusal now; a class item a world already holds keeps the stamp it
 * was embedded with, so this is the repair pass over what is there (CLAUDE.md §15).
 *
 * **THE GUARD IS THE PACK COPY, NEVER `undefined`** (D-665): a held class item is
 * written only where it stores `shields: true` and its pack copy - found by identifier,
 * then by name - stores `false`. A world migrated before the class pack is rebuilt finds
 * the pack still saying `true` and writes nothing; a second pass finds `false` stored
 * and writes nothing. Every document touched is logged by `walkWorld`.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

const CLASSES = "azeroth-rpg.classes";

/**
 * The update for one class item's raw system, or null.
 *
 * @param {object} raw        the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildShieldsUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (raw.shields !== true || pack.shields !== false) return null;
  return { "system.shields": false };
}

/**
 * **WHETHER THE CLASS PACK CARRIES THE REPAIR** (D-758's rule, the F1 review): a pack built
 * before the parser read the refusal says `shields: true` on every class, so a pass over it
 * would write nothing and mark the world past this version with its Rangers, Rogues and
 * Druids still trained with a shield. A pack in which no class refuses shields has not been
 * rebuilt.
 *
 * @param {{byIdentifier?: Map<string, object>}|null} table  `walk.mjs#packSystems`
 * @returns {boolean}
 */
export function packCarriesRepair(table) {
  for (const system of table?.byIdentifier?.values?.() ?? []) if (system?.shields === false) return true;
  return false;
}

export async function migrate(log = console.log) {
  const table = await packSystems(CLASSES);
  // A pack that predates the repair WARNS and stamps nothing (D-758): it never throws,
  // because a throw is a console error on every load.
  if (!packCarriesRepair(table)) {
    console.warn(`azeroth-rpg | ${CLASSES} still trains every class with a shield (D-948), so no class was repaired. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.3 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => (doc.type === "class" ? buildShieldsUpdate(rawSystem(doc), packCopy(table, rawSystem(doc), doc.name)) : null)
  }, log);
}
