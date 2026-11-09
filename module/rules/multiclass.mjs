/**
 * **WHO MAY TAKE A SECOND CLASS** (02 §10; the lead, on the Chromatic Champion plan:
 * *"Creation only; no 2nd class."*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 02 §10 lets a character hold two classes. A class in `AZEROTH.creationOnlyClasses`
 * is taken at creation and never multiclasses, in EITHER direction: it is never the
 * second class, and a character holding it takes no second class. Keyed by the class
 * item's identifier, never its name.
 *
 * **THE SECOND CLASS MUST BE ON THE RACE'S ROW** (02 §10: *the second must be legal for
 * your race, as the first was*; the lead, 2026-11-09, choosing *"Enforce for all races"*:
 * *"The second class must be on your race's row in 02 §3, refused in words otherwise."*).
 * The row is the race item's own list, read through `rules/guise.mjs#raceOpensClass`,
 * the reading the creator's `classOpenTo` shares. A character holding no race is not
 * judged on it: there is no row to read.
 *
 * `multiclassRefusal` is the ONE judgement, asked by every door that adds a class to a
 * character - `AzerothItem#_preCreate`, which every embed meets (a sheet drop, a macro,
 * a compendium import, the creator's Finish) - and it answers a lang key, so the
 * refusal is said in words.
 */

import { AZEROTH } from "../config.mjs";
import { raceOpensClass } from "./guise.mjs";

/** Whether a class is taken at creation only and never multiclasses. */
export function isCreationOnly(cls) {
  const id = String(cls?.identifier ?? "").toLowerCase();
  return Boolean(id) && (AZEROTH.creationOnlyClasses ?? []).includes(id);
}

/**
 * Why a class may not join the classes already held, or null where it may. The count
 * (02 §10's two) is the item's own veto; this answers the creation-only rule and the
 * race's row.
 *
 * @param {Array<{identifier?: string, name?: string}>} held  the classes the character holds now
 * @param {{identifier?: string, name?: string}} adding        the class being added
 * @param {{race?: {identifier?: string, name?: string, classes?: string[]}|null}} [o]
 *   the race item the character holds, as plain data, or null for none
 * @returns {{reason: "AZEROTH.Multiclass.NotSecond"|"AZEROTH.Multiclass.HoldsCreationOnly"|"AZEROTH.Multiclass.NotOnRow"|"AZEROTH.Multiclass.NotForRace",
 *   name: string, race?: string}|null}  `name` the class the refusal names; `race` the race, for NotOnRow
 */
export function multiclassRefusal(held = [], adding = null, { race = null } = {}) {
  const others = (held ?? []).filter(c => c && String(c.identifier ?? "") !== String(adding?.identifier ?? "\u0000"));
  if (!adding) return null;
  // A creation-only class is the first class too, and only its own race may take it
  // (02 §3: *Only a Chromatic Outcast may take the Chromatic Champion*): a GM's drop of
  // the Champion on a Dwarf with no class is refused here, not only by the creator.
  if (!others.length) {
    if (race && isCreationOnly(adding) && !raceOpensClass(race, adding)) {
      return { reason: "AZEROTH.Multiclass.NotForRace", name: String(adding.name ?? ""), race: String(race.name ?? "") };
    }
    return null;
  }
  if (isCreationOnly(adding)) return { reason: "AZEROTH.Multiclass.NotSecond", name: String(adding.name ?? "") };
  const holder = others.find(isCreationOnly);
  if (holder) return { reason: "AZEROTH.Multiclass.HoldsCreationOnly", name: String(holder.name ?? "") };
  if (race && !raceOpensClass(race, adding)) {
    return { reason: "AZEROTH.Multiclass.NotOnRow", name: String(adding.name ?? ""), race: String(race.name ?? "") };
  }
  return null;
}
