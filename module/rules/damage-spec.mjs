/**
 * WHAT A BLOW'S DAMAGE IS, before anything mitigates it. Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * 08 §7 states it once and no weapon entry repeats it:
 *
 * > **A weapon with a Greater School enchantment deals damage of that school
 * > instead of Physical. Subtract the target's Ward instead of its Armor
 * > Points.**
 *
 * That is the shape D-678 names as the one that survives longest unbuilt, and
 * it had: `attackWithDialog` built `{kind: "physical"}` off the Rating and
 * never looked at the traits, so **Sulfuras dealt physical damage** and a
 * Fire-warded elemental took it on the chin, while the creature path
 * (`attackSpecFor`) had read a school trait since D-647. One law now, read by
 * both doors.
 *
 * **A GRADE IS A WEAPON'S WORD AND A CREATURE'S BLOCK HAS NONE.** Every school
 * trait on a weapon, a suit or a stone in the packs carries `(Lesser)` or
 * `(Greater)`; every one on a creature's attack row in 14 is bare - *Flaming*,
 * *Fel-touched*, *Shadowed* - because the block is saying what the creature's
 * blow IS rather than what was enchanted onto it. So a trait converts when it
 * carries the converting grade, **or when it names no grade at all**. Gating
 * bare traits as well would have turned Ragnaros' fire into a mace.
 *
 * Pierce is read leniently here (`Pierce 2`, `Pierce (2)`): 08 §5 writes the
 * first and `rules/bestiary.mjs#traitPlaceholder` shows the second is the
 * shape a rated trait takes when a GM fills in an `(X)` by hand.
 */

// `baseTrait` strips `(Lesser)`, a rating and an `X` placeholder off a name,
// and is the normalisation every reader of a pack trait already uses (D-645).
import { baseTrait } from "./bestiary.mjs";

/** 08 §5's two grades of enchantment. */
export const TRAIT_GRADES = Object.freeze(["lesser", "greater"]);

/** Only a **Greater** School enchantment converts the damage (08 §7). */
export const CONVERTING_GRADE = "greater";

/**
 * The grade a trait's name carries, or null where it names none.
 * `Flaming (Greater)` → `"greater"`; `Flaming` → null.
 */
export function traitGrade(name = "") {
  const m = /\(\s*(lesser|greater)\s*\)\s*$/i.exec(String(name ?? ""));
  return m ? m[1].toLowerCase() : null;
}

/**
 * The highest Pierce among a list of traits (08 §5: *Pierce X reduces the
 * target's Armor Points by X*). Lenient: a rating in brackets counts.
 */
export function pierceOf(traits = []) {
  let best = 0;
  for (const trait of traits ?? []) {
    const m = /^pierce\b[^0-9]*(\d+)/i.exec(String(trait ?? "").trim());
    if (m) best = Math.max(best, Number(m[1]));
  }
  return best;
}

/**
 * The school a list of traits converts the damage to, with the trait that did
 * it, or nulls. The FIRST converting trait wins - 08 §7 gives a weapon one
 * School enchantment and the packs carry no second.
 *
 * @param {string[]} traits        the trait names on the weapon or attack row
 * @param {Record<string,string>} traitSchools  base trait name → school, read
 *   off the traits pack (`actions.mjs#traitSchools`)
 * @param {{grade?: string|null}} [o]  the grade that converts; null accepts any
 * @returns {{school: string|null, trait: string|null, grade: string|null}}
 */
export function schoolOfTraits(traits = [], traitSchools = {}, { grade = CONVERTING_GRADE } = {}) {
  for (const raw of traits ?? []) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const school = traitSchools?.[baseTrait(text).toLowerCase()] ?? null;
    if (!school) continue;
    const written = traitGrade(text);
    // A bare trait is a creature's block (14) and converts; a graded one is an
    // item's enchantment (08 §7) and converts only at the grade named.
    if (grade && written !== null && written !== grade) continue;
    return { school, trait: text, grade: written };
  }
  return { school: null, trait: null, grade: null };
}

/**
 * THE RATING AFTER A SIGNATURE HAS SPOKEN (08 §20, D-692).
 *
 * A Signature either **sets** the Damage Rating (Quel'Serrar's *its Damage
 * Rating is 8*) or **adds** to it (Verigan's *adds 2*), and a set replaces what
 * the WEAPON prints - never what stands on the creature swinging it. The door
 * worked the blow's Rating out with a talent's standing lane already in it, and
 * reading the set as the whole base threw that lane away while the card's own
 * provenance went on printing it: the number said one thing and the reasons
 * beside it another.
 *
 * `standing` is the part of `rating` that belongs to the bearer rather than to
 * the weapon, so a set can put it back. Everything else on the weapon's own
 * Rating - the printed number and what an enchantment did to it - is what a set
 * is for.
 *
 * @param {object} o
 * @param {number} o.rating        the blow's Rating as the door worked it out
 * @param {number|null} [o.set]    *its Damage Rating is N*, or null for none
 * @param {number} [o.add]         *adds N*
 * @param {number} [o.standing]    the part of `rating` that stands on the bearer
 * @returns {number}
 */
export function ratingAfterSignature({ rating = 0, set = null, add = 0, standing = 0 } = {}) {
  const held = set === null || set === undefined
    ? Number(rating) || 0
    : (Number(set) || 0) + (Number(standing) || 0);
  return held + (Number(add) || 0);
}

/**
 * What a weapon or an attack row deals, as the roll pipeline wants it.
 *
 * The four keys are `attackSpecFor`'s exactly, so the creature door could
 * delegate to this without moving a single assertion about its own shape.
 *
 * @param {{rating?: number, traits?: string[]}} weapon
 * @param {Record<string,string>} traitSchools
 * @returns {{rating: number, kind: "physical"|"magical", school: string|null, penetration: number}}
 */
export function weaponDamageSpec({ rating = 0, traits = [] } = {}, traitSchools = {}, { grade = CONVERTING_GRADE } = {}) {
  const found = schoolOfTraits(traits, traitSchools, { grade });
  return {
    rating: Number(rating) || 0,
    penetration: pierceOf(traits),
    kind: found.school ? "magical" : "physical",
    school: found.school
  };
}
