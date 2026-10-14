/**
 * Migration to 0.12.3 — the last sixty Classic Signatures, on what a world
 * already holds (08 §20; D-698).
 *
 * The lead answered the remaining groups of `SIGNATURES-TO-WRITE.md` in one
 * pass — *SL 3 or higher "Effect"* for a chance on hit, *passive effects while
 * equipped* for a `Use:` with a cooldown, *passive effect that improves bound
 * companions* for the pets, *change to Class Feature or Talent Improvement*
 * for a line naming a WoW ability, and *remove Threat mention* — and forty of
 * the sixty finds that fired nothing now fire. This is the repair pass over
 * the copies already in a world, which is the half a rule enforced only on
 * create never gets (CLAUDE.md §15).
 *
 * **This is not a schema change either.** `system.signatureEffect` gained
 * `empowers`, `bound` and four keys inside `onHit`, and every one of them is
 * nullable with an initial — a document stored before them loads with the
 * initials and is valid, and `cleanSignature` writes only the keys it is
 * handed (D-671). What moved is the pack's CONTENT.
 *
 * **THE GUARD IS 0.12.2's, IMPORTED RATHER THAN COPIED.** Three tests, all
 * three of which must hold: it is a Classic find (`flags.azeroth-rpg.classic`),
 * its stored descriptor fires NOTHING, and its stored sentence is either empty
 * or still opens A9's *Signature to be written*. A GM who wrote either half
 * keeps both.
 *
 * **AND IT CLEARS AS WELL AS STAMPS**, which 0.12.2 could not. Three finds
 * carry no Signature at all now, and that is the lead's answer rather than an
 * omission: a threat line offers nothing (*remove Threat mention*), and an
 * item whose whole content is one unchosen school or one all-school resistance
 * carries 08 §10's POINTS instead — *if it belongs on the suit, it is a grant
 * and not a Signature at all*. A world copy still printing the placeholder
 * beside a pack copy that has none is the same staleness in the other
 * direction, so both halves are emptied.
 *
 * Idempotent by construction: after the pass the world copy either fires or
 * carries no sentence at all, and the guard never holds a second time.
 *
 * **What it does NOT repair, on purpose.** `system.budget` and
 * `flags.azeroth-rpg.grants` are the whole conversion rather than this one
 * sentence — five finds' budgets moved with their points — and restamping them
 * is replacing the item, which is what dragging a fresh copy out of the
 * rebuilt compendium already is. 0.12.1 and 0.12.2 drew the line in the same
 * place.
 */

import { hasSignature, signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { flat } from "./0.12.1-signature-rewrites.mjs";
import { PLACEHOLDER_OPENER } from "./0.12.2-classic-ratings.mjs";

/** Which pack answers for a type. */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object} flags        the stored flags, whole
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildLineUpdate(raw, flags = {}, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  // Only a Classic find. A chapter item's Signature is 08 §20's own.
  if (!flags?.["azeroth-rpg"]?.classic) return null;
  // The copy in the world still fires nothing...
  if (hasSignature(signatureEffectOf(raw))) return null;
  // ...and the sentence beside it is still the tool's: nothing at all, or the
  // placeholder. Anything else is a hand and is left alone.
  const prose = flat(signatureProse(raw));
  if (prose && !prose.startsWith(PLACEHOLDER_OPENER)) return null;
  const now = signatureEffectOf({ signatureEffect: pack.signatureEffect });
  const packProse = flat(signatureProse({ signature: pack.signature }));
  if (hasSignature(now)) {
    // Both halves move together, always: a descriptor without its sentence
    // leaves the sheet arguing with the die.
    return {
      "system.signature": pack.signature ?? "",
      "system.signatureEffect": clone(pack.signatureEffect)
    };
  }
  // THE OTHER DIRECTION: the pack has no Signature and the world still prints
  // one that was never written. Nothing to stamp, and something to take away.
  if (!packProse && prose) return { "system.signature": "", "system.signatureEffect": clone(pack.signatureEffect) };
  return null;
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      return buildLineUpdate(raw, doc.toObject?.().flags ?? doc.flags, packCopy(table, raw, doc.name));
    }
  }, log);
}
