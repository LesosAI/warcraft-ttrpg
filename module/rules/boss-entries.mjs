/**
 * **A BOSS IS NEVER A CHARACTER'S CREATURE OR A CHARACTER'S SHAPE** (D-1804; the lead,
 * 2026-11-22: *"boss's like King Mosh can't be shapeshift or summon targets"*). Pure: no
 * Foundry.
 *
 * The ONE reading of "this block is a Boss" for every door that makes a creature from a
 * 14 entry for a character - a companion, a demon, an elemental, a summon, a construct, a
 * raised dead, a creature adopted from the banner - and for every shape a character takes
 * off a block (Shapeshift, the Avatar of the Wild, Metamorphosis, the drake forms, the
 * Gnomish Battle Rig). `rules/bound.mjs#eligible` and `#bossRefusal`, `rules/shapes.mjs
 * #isShapeshiftForm` and `#isAvatarForm`, and the documents' doors all ask it.
 *
 * It lives in this leaf rather than in `rules/bound.mjs` because `bound.mjs` imports
 * `shapes.mjs`, and `shapes.mjs` needs the same answer: one module both may import with
 * no cycle. `rules/bound.mjs` re-exports it.
 *
 * A creature's OWN summon (a Boss Action calling its minions, `documents/summon.mjs` from
 * a creature card) is the GM's side and is not judged here.
 */

/** The weight class that names a Boss (13 §5's ladder; `AZEROTH.weightClasses.boss`). */
export const BOSS_WEIGHT_CLASS = "boss";

const isBossWord = value => typeof value === "string" && value.trim().toLowerCase() === BOSS_WEIGHT_CLASS;

/**
 * Whether a block is a Boss: its own weight class, or - for a world creature - the weight
 * class of the 14 entry it was made from (`sourceWeightClass`, read off
 * `_stats.compendiumSource` or its bond's `entryUuid` by the caller, as D-1798 reads an
 * elemental's family). A GM's own homebrew creature carrying the Boss class is a Boss.
 *
 * Takes a chooser row (`weightClass`), an actor's `system` or a whole actor's source
 * (`system.weightClass`), so every door hands it what it already holds.
 *
 * @param {{weightClass?: string|null, sourceWeightClass?: string|null, system?: {weightClass?: string|null}}} entry
 * @returns {boolean}
 */
export function isBossEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return false;
  return isBossWord(entry.weightClass) || isBossWord(entry.sourceWeightClass) || isBossWord(entry.system?.weightClass);
}
