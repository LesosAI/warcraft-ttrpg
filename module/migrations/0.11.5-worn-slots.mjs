/**
 * Migration to 0.11.5 - which of 08 §11's slots a worn thing goes in (D-686).
 *
 * `GearData.slot` is new, so every piece of gear in a world carries the
 * schema's null: a ring worn since the world was made would sit in no slot,
 * and the sheet would let a second ring on beside it. The pack copy is the
 * authority, because the gear parser stamps the slot from §11's own row name;
 * a piece of gear the pack does not hold is read off its own name through the
 * same law, so a GM's *Cloak of the Wolf* still lands on the shoulders.
 *
 * Idempotent, and compared against the PACK COPY rather than against
 * `undefined` - a document loaded through the model never has an absent
 * field, which is D-665's fault and is not repeated. A slot already stored is
 * the world's own and is never overwritten.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { isWornSlot, wornSlotFor } from "../rules/worn.mjs";

/**
 * The update for one gear item's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {string} name         the item's name, for a piece of gear the pack lacks
 */
export function buildWornSlotUpdate(raw, pack = null, name = "") {
  if (!raw || typeof raw !== "object") return null;
  // Already in a slot: the world's own answer, and a second run's.
  if (isWornSlot(raw.slot)) return null;
  const wanted = pack ? (isWornSlot(pack.slot) ? pack.slot : null) : wornSlotFor(name);
  return wanted ? { "system.slot": wanted } : null;
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  return walkWorld({
    item: doc => {
      if (doc.type !== "gear") return null;
      const raw = rawSystem(doc);
      return buildWornSlotUpdate(raw, packCopy(gear, raw, doc.name), doc.name);
    }
  }, log);
}
