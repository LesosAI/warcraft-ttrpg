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
 * **AND A CLASS MAY NAME THE FEW IT PAIRS WITH** (`AZEROTH.multiclassOnlyWith`; the lead, on
 * the Necromancer: *"Multiclassing is allowed with Warrior, Mage, Rogue."*): either direction, a
 * pairing whose class holds a list is legal only with a class the list names.
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

/** The classes a class multiclasses with, or null where it names none (any class). */
export function pairsOnlyWith(cls) {
  const id = String(cls?.identifier ?? "").toLowerCase();
  const list = id ? (AZEROTH.multiclassOnlyWith ?? {})[id] : null;
  return Array.isArray(list) ? list : null;
}

/** Whether two classes may be held together under `AZEROTH.multiclassOnlyWith`. */
function pairAllowed(a, b) {
  const id = c => String(c?.identifier ?? "").toLowerCase();
  const ofA = pairsOnlyWith(a);
  const ofB = pairsOnlyWith(b);
  return (!ofA || ofA.includes(id(b))) && (!ofB || ofB.includes(id(a)));
}

/** The last resort for a partner's name where the door gave none: `death-knight` -> `Death Knight`. */
function titleOf(id) {
  return String(id ?? "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Why a class may not join the classes already held, or null where it may. The count
 * (02 §10's two) is the item's own veto; this answers the creation-only rule and the
 * race's row.
 *
 * @param {Array<{identifier?: string, name?: string}>} held  the classes the character holds now
 * @param {{identifier?: string, name?: string}} adding        the class being added
 * @param {{race?: {identifier?: string, name?: string, classes?: string[]}|null, nameOf?: ((id: string) => string|null)|null}} [o]
 *   the race item the character holds, as plain data, or null for none; `nameOf` a class
 *   identifier's name as the class pack prints it, for the refusal's words
 * @returns {{reason: "AZEROTH.Multiclass.NotSecond"|"AZEROTH.Multiclass.HoldsCreationOnly"|"AZEROTH.Multiclass.NotOnRow"|"AZEROTH.Multiclass.NotForRace"|"AZEROTH.Multiclass.NotPaired",
 *   name: string, race?: string, partners?: string}|null}  `name` the class the refusal names; `race` the race, for NotOnRow;
 *   `partners` the classes it pairs with, for NotPaired
 */
export function multiclassRefusal(held = [], adding = null, { race = null, nameOf = null } = {}) {
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
  // A class that names its partners (the Necromancer: Warrior, Mage, Rogue), either way round.
  const unpaired = others.find(c => !pairAllowed(c, adding));
  if (unpaired) {
    const limited = pairsOnlyWith(adding) ? adding : unpaired;
    return {
      reason: "AZEROTH.Multiclass.NotPaired",
      name: String(limited.name ?? ""),
      // The partners by the CLASS ITEMS' own names (the architect's S4): `nameOf` is the door's
      // reading of the class pack; an identifier it cannot name is spelt out as a last resort.
      partners: pairsOnlyWith(limited).map(id => (typeof nameOf === "function" ? nameOf(id) : null) || titleOf(id)).join(", ")
    };
  }
  if (race && !raceOpensClass(race, adding)) {
    return { reason: "AZEROTH.Multiclass.NotOnRow", name: String(adding.name ?? ""), race: String(race.name ?? "") };
  }
  return null;
}
