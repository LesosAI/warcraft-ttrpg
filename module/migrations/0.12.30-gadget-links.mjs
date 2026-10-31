/**
 * Migration to 0.12.30 - Gadgeteer links the gadgets it names (the lead, 2026-10-24:
 * *"On tinkerer, the gadget table is not linked within the talent gadgeteer"*).
 *
 * 04's Gadgeteer reads *You know two gadgets from the **Gadgets** table below*, and in
 * Foundry nothing stood below it. The parser now renders the table into a Gadgets
 * compendium (`tools/parse-book/gadgets.mjs`) and appends, under the talent's own words,
 * one paragraph linking each gadget's entry (`tools/parse-book/talents.mjs`,
 * `rules/gadgets.mjs#gadgetsParagraph`). A class granted afresh embeds the linked text
 * already; this is the repair pass over the copies a world holds (CLAUDE.md §15: a rule
 * applied only where a document is made needs one), on actors, on unlinked tokens, in the
 * world's Items and in unlocked world packs.
 *
 * **COMPARED AGAINST THE PACK COPY** (D-665). A talent's stored `effect` takes the pack
 * copy's only where the copy links a gadget and the stored words read as the copy's
 * without that paragraph, so a GM's own words are left alone; a second pass finds the two
 * equal and writes nothing.
 *
 * **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO** (D-758's rule). The chain runs this
 * as soon as the code is present, and a talents pack compiled before the parser linked the
 * table links nothing anywhere; a throw would stop the chain with a console error on every
 * load. It warns, names the fix, and stamps nothing.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";
import { linksGadgets, withoutGadgetLinks } from "../rules/gadgets.mjs";

/** The pack every stamp here is read from. */
export const TALENTS_PACK = "azeroth-rpg.talents";

/**
 * A talent's update, or null: the pack copy's `effect` where the copy links a gadget, the
 * stored effect is not it yet, and the stored words are the copy's own without the links.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildGadgetLinksUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack.effect !== "string") return null;
  if (!linksGadgets(pack.effect)) return null;
  if (raw.effect === pack.effect) return null;
  if ((raw.className ?? "") !== (pack.className ?? "")) return null;
  if (plainOf(raw.effect) !== plainOf(withoutGadgetLinks(pack.effect))) return null;
  return { "system.effect": pack.effect };
}

/**
 * Whether the compiled talents pack links a gadget at all. A pack compiled before the
 * parser linked the Gadgets table links none.
 *
 * @param {Iterable<object>} systems
 * @returns {boolean}
 */
export function packCarriesGadgetLinks(systems = []) {
  for (const s of systems ?? []) {
    if (linksGadgets(s?.effect)) return true;
  }
  return false;
}

export async function migrate(log = console.log) {
  const talents = await packSystems(TALENTS_PACK);
  if (!packCarriesGadgetLinks(talents.byIdentifier.values())) {
    console.warn(`azeroth-rpg | ${TALENTS_PACK} links no gadget yet, so no talent was stamped. `
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.29 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => {
      if (doc.type !== "talent") return null;
      const raw = rawSystem(doc);
      return buildGadgetLinksUpdate(raw, packCopy(talents, raw, doc.name));
    }
  }, log);
}
