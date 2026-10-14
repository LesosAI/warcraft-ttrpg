/**
 * Migration to 0.12.2 — the Classic combat ratings, on what a world already
 * holds (08 §20; D-697).
 *
 * Nothing in 05 or 06 has a rating: to-hit is the Attack Test, and dodge,
 * parry, block and defense are Defense, a Reaction or Armor Points. So 594
 * lines across the vendored record had a reading the law could make and
 * nowhere at all to put it — 08 §6's affix pool sells no Defense, Attack or
 * Speed — and the finds that carried one reached the table saying *Signature
 * to be written* or saying nothing. The lead settled the five mappings on
 * 2026-09-10 and the carrier is 08 §20's own standing Signature; a stale
 * rarity gate on the regeneration tick was fixed in the same pass, so 40 more
 * Rares tick as their line says.
 *
 * **This is not a schema change.** `system.signatureEffect` has held every one
 * of these keys since 0.12.0; what moved is the pack's CONTENT. The packs are
 * regenerated, so a copy dragged out afresh is right — this is the repair pass
 * over what is already in a world, which is the half a rule enforced only on
 * create never gets (CLAUDE.md §15, and 0.12.0's own note).
 *
 * **THE GUARD IS THE ITEM STILL BEING THE TOOL'S OWN.** Three tests, all three
 * of which must hold: it is a Classic find (`flags.azeroth-rpg.classic`), its
 * stored descriptor fires NOTHING, and its stored sentence is either empty or
 * still opens A9's *Signature to be written*. A GM who wrote either half keeps
 * both. Idempotent by construction: after the pass the descriptor fires, so
 * the second test never holds again.
 *
 * **What it does NOT repair, on purpose.** Giving an item its Signature moved
 * what its budget bought — 321 of the 511 dropped the `+1 Fortitude` the
 * top-up ladder had added to reach the band's floor — and `system.budget` and
 * `flags.azeroth-rpg.grants` are that whole conversion rather than this one
 * sentence. Restamping them is replacing the item, which is what dragging a
 * fresh copy out of the rebuilt compendium already is. 0.12.1 drew the line in
 * the same place and for the same reason.
 */

import { hasSignature, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
// The same reading of a sentence 0.12.1 makes — tags stripped, runs of space
// collapsed, case ignored — rather than a second copy of two lines that would
// then be two things to keep in step.
import { flat } from "./0.12.1-signature-rewrites.mjs";

/** Which pack answers for a type. */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

/**
 * How every placeholder A9 ever wrote opens. It is the tool's own words and
 * never a GM's, which is what makes it a safe thing to overwrite.
 */
export const PLACEHOLDER_OPENER = "signature to be written";

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object} flags        the stored flags, whole
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildRatingUpdate(raw, flags = {}, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  // Only a Classic find. A chapter item's Signature is 08 §20's own and is
  // 0.12.1's business, not this one's.
  if (!flags?.["azeroth-rpg"]?.classic) return null;
  // The pack fires now...
  const now = signatureEffectOf({ signatureEffect: pack.signatureEffect });
  if (!hasSignature(now)) return null;
  // ...and the copy in the world does not.
  if (hasSignature(signatureEffectOf(raw))) return null;
  // And the sentence beside it is still the tool's: nothing at all, or the
  // placeholder. Anything else is a hand and is left alone.
  const prose = flat(signatureProse(raw));
  if (prose && !prose.startsWith(PLACEHOLDER_OPENER)) return null;
  // Both halves move together, always: a descriptor without its sentence
  // leaves the sheet arguing with the die.
  return {
    "system.signature": pack.signature ?? "",
    "system.signatureEffect": clone(pack.signatureEffect)
  };
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      return buildRatingUpdate(raw, doc.toObject?.().flags ?? doc.flags, packCopy(table, raw, doc.name));
    }
  }, log);
}
