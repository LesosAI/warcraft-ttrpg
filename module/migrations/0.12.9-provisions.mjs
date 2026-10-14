/**
 * Migration to 0.12.9 - what a Short Rest may eat or drink (08 §12, D-733).
 *
 * `GearData.provision` is new, so every piece of gear in a world carries the
 * schema's null: the bread a character bought on day one would be no food at
 * all, and their Short Rest would recover nothing while the window told them
 * they were carrying nothing to eat.
 *
 * The pack copy is the authority, because the gear parser stamps the provision
 * from 08 §12's own table - the shelf and the category cell. A piece of gear
 * the pack does not hold is a hand-made one and stays **null**: there is no
 * row to read it off, no name to guess it from (*Funeral gray* is D-689's
 * lesson about guessing at a name), and the GM's own select on the item sheet
 * is the door for it.
 *
 * Idempotent, and compared against the PACK COPY rather than against
 * `undefined` - a document loaded through the model never has an absent field,
 * which is D-665's fault and is not repeated. A provision already stored is
 * the world's own and is never overwritten.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { cleanProvision } from "../rules/provisions.mjs";

/**
 * The update for one gear item's raw system, or null.
 *
 * @param {object} raw        the stored system
 * @param {object|null} pack  the pack copy's system, where one exists
 */
export function buildProvisionUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object") return null;
  // Already food or drink: the world's own answer, and a second run's.
  if (cleanProvision(raw.provision)) return null;
  const wanted = pack ? cleanProvision(pack.provision) : null;
  return wanted ? { "system.provision": wanted } : null;
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  return walkWorld({
    item: doc => {
      if (doc.type !== "gear") return null;
      const raw = rawSystem(doc);
      return buildProvisionUpdate(raw, packCopy(gear, raw, doc.name));
    }
  }, log);
}
