/**
 * Migration to 0.11.7 - 08 §11's sixteen slots become thirteen (D-689).
 *
 * The chapter now prints a **Slot** column, and two rows often name one slot:
 * *a sash and a belt are the same slot even if the name is different* (the
 * lead, 2026-09-09). So `circlet` and `mask` are one `head`, `amulet`,
 * `pendant` and `brooch` one `neck`, `ring` and `signetRing` one `finger`.
 * §11 also gained a **Shoulder**, and §11's Clothing table gained a slot of
 * its own, so a garment that was worn nowhere is now worn somewhere.
 *
 * A world that has run 0.11.5 stores the old vocabulary. `GearData.slot` is a
 * `choiceField`, so a stored `signetRing` would be refused at load and the
 * document made invisible to any migration (CLAUDE.md §15) - `cleanSlot` in
 * `GearData.migrateData` nulls it first, which is why this migration compares
 * against the PACK COPY rather than against `undefined` (D-665). A `null` slot
 * is re-read from the pack, and that is how §11's Clothing and §10's robes
 * pick up `clothing`.
 *
 * Idempotent: a slot already in the new vocabulary is left exactly as it is,
 * so a second run writes nothing.
 *
 * **0.11.5 is not edited.** A world has already run it and it must stay what
 * it was.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { isWornSlot, wornSlotFor } from "../rules/worn.mjs";

/**
 * D-686's vocabulary to D-689's. A key already in the new vocabulary maps to
 * itself, which is what makes the whole migration idempotent.
 */
export const SLOT_MERGE = Object.freeze({
  circlet: "head",
  mask: "head",
  amulet: "neck",
  pendant: "neck",
  brooch: "neck",
  cloak: "back",
  gloves: "hands",
  ring: "finger",
  signetRing: "finger",
  belt: "waist",
  sash: "waist",
  leggings: "legs",
  boots: "feet",
  bracers: "wrist"
});

/**
 * The slot a stored value becomes, or null where it is neither vocabulary.
 *
 * @param {string|null} stored  what the world holds on `system.slot`
 * @returns {string|null} a key in `WORN_SLOTS`
 */
export function mergedSlot(stored) {
  if (isWornSlot(stored)) return stored;
  return SLOT_MERGE[stored] ?? null;
}

/**
 * The update for one gear item's raw system, or null.
 *
 * Three cases, in order:
 *
 * 1. **The stored key is D-686's** - merge it, and never ask the pack: a GM
 *    who moved a *Cloak of the Wolf* onto the brooch slot by hand meant the
 *    neck, and the pack copy would overrule them.
 * 2. **The stored key is already D-689's** - nothing to do, and this is what
 *    a second run sees everywhere.
 * 3. **There is no stored key at all** - the pack copy answers where it has
 *    one, else the item's own name through `wornSlotFor`. That is how a
 *    garment picks up `clothing`, which no world could have stored.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {string} name         the item's name, for a piece of gear the pack lacks
 */
export function buildSlotMergeUpdate(raw, pack = null, name = "") {
  if (!raw || typeof raw !== "object") return null;

  const merged = mergedSlot(raw.slot);
  if (merged) return merged === raw.slot ? null : { "system.slot": merged };

  // No slot the world can answer with. The pack copy is the authority, since
  // the gear parser stamps the slot from §11's own Slot column.
  const wanted = pack ? mergedSlot(pack.slot) : wornSlotFor(name);
  return wanted ? { "system.slot": wanted } : null;
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  return walkWorld({
    item: doc => {
      if (doc.type !== "gear") return null;
      const raw = rawSystem(doc);
      return buildSlotMergeUpdate(raw, packCopy(gear, raw, doc.name), doc.name);
    }
  }, log);
}
