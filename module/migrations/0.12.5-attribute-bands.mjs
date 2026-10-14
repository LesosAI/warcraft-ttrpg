/**
 * Migration to 0.12.5 — what an Epic's attribute suffix grants, on what a
 * world already holds (08 §6; D-701).
 *
 * **This is not a schema change.** `flags.azeroth-rpg.grants` has been an array
 * of 08 §6 sentences since the affix generator existed, and it still is; what
 * moved is the NUMBER inside one family of them. 08 §6 now says an attribute
 * suffix costs the same wherever it is set and the item's rarity says what it
 * delivers, so a found Epic that granted `+1 Strength` grants `+3 Strength` and
 * one that granted `+2` grants `+4` or `+5`. **The budget does not move**: the
 * cost is the suffix's own rung and is what it always was, which is why not one
 * of the 1,772 finds changed its `system.budget` or was refused by
 * `forge.mjs#plan`.
 *
 * The packs are regenerated, so a copy dragged out afresh is right. This is the
 * repair pass over what is already in a world — the half a rule enforced only
 * on create never gets (CLAUDE.md §15, and 0.12.0's and 0.12.2's own notes).
 *
 * **WHY THIS ONE RESTAMPS `grants` WHERE 0.12.2 DECLINED TO.** 0.12.2 left the
 * field alone because giving an item a Signature moved what its whole budget
 * bought — the grants there were a different conversion, not a different
 * number, and restamping them is replacing the item. Here the conversion is
 * identical in every other respect: the same suffix at the same rung for the
 * same points, with one number restated. The guard below is what makes that
 * true rather than asserted.
 *
 * **THE GUARD IS THAT ONLY THE NUMBER MOVED.** Four tests, all four of which
 * must hold: the item is a Classic find (`flags.azeroth-rpg.classic`), the pack
 * still holds a copy, the two lists are the same length, and every entry is
 * either identical or an attribute sentence naming the SAME ability at a
 * different number. A GM who added, removed or reworded a grant keeps all of
 * them. Idempotent by construction: after the pass the two lists are equal and
 * nothing differs.
 *
 * **A FORGED OR ROLLED ITEM IS LEFT ALONE, ON PURPOSE.** An item carrying
 * `flags.azeroth-rpg.generated` has no pack copy to read and its suffix is
 * recoverable only from the payload; the Forge rebuilds it from
 * `generated.base` the moment it is opened, which is the door that already
 * exists. 08 §20's own named Epics grant no attribute at all, so there is
 * nothing there to repair either.
 */

import { attributePointsIn } from "../rules/affixes.mjs";
import { packGrants, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** Which pack answers for a type. */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

/**
 * The sentence with its number taken out, so two readings of the same grant
 * compare equal. `+3 Strength` and `+1 Strength` both reduce to `Strength`;
 * every other family reduces to itself and so has to match exactly.
 */
export function withoutMagnitude(text) {
  const s = String(text ?? "").trim();
  return attributePointsIn(s) === null ? s : s.replace(/^\+\d+\s+/, "");
}

/**
 * The update for one document's grants, or null.
 *
 * @param {string[]|null} held  the world copy's sentences
 * @param {string[]|null} pack  the pack copy's sentences
 * @param {object} flags        the stored flags, whole
 */
export function buildGrantUpdate(held, pack, flags = {}) {
  if (!flags?.["azeroth-rpg"]?.classic) return null;
  if (!Array.isArray(held) || !Array.isArray(pack)) return null;
  if (held.length !== pack.length) return null;
  let moved = false;
  for (let i = 0; i < held.length; i++) {
    const a = String(held[i] ?? "");
    const b = String(pack[i] ?? "");
    if (a === b) continue;
    // Only the magnitude of an attribute sentence may differ, and only where
    // BOTH sides are one: a hand-written grant is not an old reading.
    if (attributePointsIn(a) === null || attributePointsIn(b) === null) return null;
    if (withoutMagnitude(a) !== withoutMagnitude(b)) return null;
    moved = true;
  }
  return moved ? { "flags.azeroth-rpg.grants": [...pack] } : null;
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const object = doc.toObject?.() ?? doc;
      const flags = object.flags ?? doc.flags ?? {};
      return buildGrantUpdate(
        flags?.["azeroth-rpg"]?.grants ?? null,
        packGrants(table, rawSystem(doc), doc.name),
        flags
      );
    }
  }, log);
}
