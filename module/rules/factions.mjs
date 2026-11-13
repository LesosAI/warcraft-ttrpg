/**
 * **WHICH FACTION A PEOPLE BELONGS TO** (02 §1 and §5; D-911). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * 08 §20's Warchief's Hammer reads *While you belong to the Horde, you and every
 * ally within 30 feet who belongs to the Horde*, and nothing in this system
 * stored a faction: `signatureState` never carried one, so a `faction` gate
 * failed closed on everybody. The book says who belongs where, and this is that
 * sentence as a table:
 *
 * - **02 §1**: *The Horde is Thrall's ... Orgrimmar; Thunder Bluff, the tauren
 *   city; the Darkspear trolls; and the Forsaken.* The orcs are the Horde.
 * - **02 §1**: *The Alliance ... Stormwind ...; Ironforge ...; the gnomes ...;
 *   and Darnassus, the night elf city.*
 * - **02 §1**: *The three races that belong to no faction*: a blood elf, a goblin
 *   and an ogre. 02 §5's Chromatic Outcast *passes as one of the peoples* and
 *   names none of its own.
 *
 * **MY READING, for the lead** (D-911): a people's faction is the character's,
 * and a creature's is its `**Race**` run's (14 §1); a creature with no people
 * belongs to no faction. 12's organisations (the Argent Dawn, the Scarlet
 * Crusade) are not peoples; since D-912 a creature belongs to one its 14 entry
 * NAMES by name or section (the lead, on O-319), and a GM may set more on any
 * creature or character (`system.factions`). `factionsFor` is the one reader.
 */

/** The two factions 02 §1 names, as the words a gate's value carries. */
export const FACTIONS = Object.freeze(["Alliance", "Horde"]);

/** 02 §1's peoples by faction, keyed by the people's slug. */
export const PEOPLE_FACTIONS = Object.freeze({
  human: "Alliance",
  dwarf: "Alliance",
  "night-elf": "Alliance",
  gnome: "Alliance",
  orc: "Horde",
  tauren: "Horde",
  troll: "Horde",
  forsaken: "Horde"
});

/** A people's name as the table keys it: "Night Elf" -> "night-elf". */
function peopleKey(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * The factions a people belongs to: one, or none.
 *
 * @param {string|null} people  the race item's name, or a creature's `system.race`
 * @returns {string[]}
 */
export function factionsOf(people) {
  const faction = PEOPLE_FACTIONS[peopleKey(people)] ?? null;
  return faction ? [faction] : [];
}

/** 12's organisations a 14 entry may name, and the words that name each (D-912). */
export const ORGANISATIONS = Object.freeze({
  "Scarlet Crusade": Object.freeze({ name: /\bScarlet\b/i, section: /\bScarlet Crusade\b/i })
});

/**
 * **EVERY FACTION A CREATURE OR A CHARACTER BELONGS TO** (D-911, D-912): THE ONE
 * READER. Its people's (02 §1), the organisations its 14-BESTIARY entry names - its
 * NAME or its SECTION (the lead, on O-319: *"Bestiary entries naming it"*: the Scarlet
 * Knight, every entry under *4. The Scarlet Crusade*) - and the factions a GM set on it
 * (`system.factions`, comma-separated). Each once, in that order.
 *
 * @param {{people?: string|null, name?: string, section?: string, set?: string}} o
 * @returns {string[]}
 */
export function factionsFor({ people = null, name = "", section = "", set = "" } = {}) {
  const out = [...factionsOf(people)];
  for (const [org, words] of Object.entries(ORGANISATIONS)) {
    if (words.name.test(String(name ?? "")) || words.section.test(String(section ?? ""))) out.push(org);
  }
  for (const part of String(set ?? "").split(",").map(p => p.trim()).filter(Boolean)) out.push(part);
  return [...new Set(out.map(f => f.trim()))].filter(Boolean);
}
