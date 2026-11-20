/**
 * Migration to 0.15.4.2 - 08 §5's Deft on the weapons a world already holds (the San'layn and
 * Sovereign plan, DF4; the lead, R15: *"apply this to the relevant items across the entire
 * system"*; D-1169).
 *
 * A point step after the RACE agent's 0.15.4.1, inside the same unreleased build, so a world
 * the working tree already took to 0.15.4.1 runs it too.
 *
 * Every weapon in the world - world items, every actor's embedded weapons (characters and
 * creatures, linked or on an unlinked token), and unlocked world packs - is read against its
 * pack copy (`rules/deft-migration.mjs#buildDeftUpdate`), never against `undefined` (D-665):
 * a held copy whose pack copy gained Deft takes it at the pack's own place in the list, and
 * anything else is left alone. **A pack built before the book named Deft carries none**: then
 * nothing is stamped and the console says why, rather than the chain throwing on every load
 * (D-758). Every document touched is logged by `walkWorld`; a second run writes nothing.
 */

import { buildDeftUpdate, packCarriesDeft } from "../rules/deft-migration.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

export async function migrate(log = console.log) {
  const table = await packSystems("azeroth-rpg.weapons");
  const systems = table ? [...(table.byIdentifier?.values?.() ?? [])] : [];
  if (!packCarriesDeft(systems)) {
    log("azeroth-rpg | 0.15.4.2: the weapons pack carries no Deft yet (rebuild the packs); nothing was stamped");
    return 0;
  }
  return walkWorld({
    item: doc => {
      if (doc.type !== "weapon") return null;
      const raw = rawSystem(doc);
      const update = buildDeftUpdate(raw, packCopy(table, raw, doc.name));
      if (update) log(`azeroth-rpg | 0.15.4.2: ${doc.name} takes 08 §5's Deft`);
      return update;
    }
  }, log);
}
