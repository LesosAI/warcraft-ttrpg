/**
 * Migration to 0.12.70 - an orc's Blood Fury reads the lead's ruling (D-798).
 *
 * **Not a schema change; the text a world already holds.** 02 §5's trait gained
 * its second sentence - *If you have no Momentum pool, your weapon attacks and
 * spells instead add 1 to their Damage Rating until the encounter ends* - and
 * `workflows.useFeature` does it from this version on. An Orc race item a
 * character already holds still carries the one-sentence text, so the trait's
 * feature (stamped from the race item by the sync, D-620) and the card it posts
 * would say less than the Use does.
 *
 * The shape 0.12.58 and 0.12.67 set: the race item's trait text is replaced
 * with the pack's only where it is EXACTLY the old standard sentence, compared
 * flattened (`0.12.1-signature-rewrites.mjs#flat`), so a GM's own wording
 * stays. The feature follows the race item at the next sync, which runs for
 * every character at world load (D-621).
 *
 * **A pack that does not carry the new sentence stamps nothing and says so**
 * (D-758: a migration that throws is a console error on every load), rather
 * than writing the old text over itself.
 */

import { flat } from "./0.12.1-signature-rewrites.mjs";
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** 02 §5's Blood Fury before the lead's ruling, as the races pack held it. */
export const OLD_BLOOD_FURY = "<p>Once per encounter, spend a Half-Action to gain 2 Momentum.</p>";

/** The sentence the ruling added, which the pack copy must carry before anything is written. */
export const NO_POOL_SENTENCE = "If you have no Momentum pool";

/**
 * The update for one item, or null.
 *
 * @param {string} type  the item's type
 * @param {object} raw  its stored `system`
 * @param {string|null} next  the races pack's Orc trait text
 * @returns {object|null}
 */
export function bloodFuryTextUpdate(type, raw, next) {
  if (type !== "race" || raw?.identifier !== "orc") return null;
  if (raw?.trait?.name !== "Blood Fury") return null;
  if (flat(raw.trait.description) !== flat(OLD_BLOOD_FURY)) return null;
  if (typeof next !== "string" || !flat(next).includes(flat(NO_POOL_SENTENCE))) return null;
  return { "system.trait.description": next };
}

export async function migrate(log = console.log) {
  const { byIdentifier } = await packSystems("azeroth-rpg.races");
  const next = byIdentifier.get("orc")?.trait?.description ?? null;
  if (typeof next !== "string" || !flat(next).includes(flat(NO_POOL_SENTENCE))) {
    console.warn("azeroth-rpg | migration 0.12.70: the races pack does not carry Blood Fury's new text; rebuild the packs. Nothing was changed.");
    return 0;
  }
  return walkWorld({ item: doc => bloodFuryTextUpdate(doc.type, rawSystem(doc), next) }, log);
}
