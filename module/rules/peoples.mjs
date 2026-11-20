/**
 * **WHAT 02 §5 SAYS A PEOPLE IS, AS DATA** (the San'layn plan, A.6 item 1; D-1140).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * Before this table a people's standing lived in four places, each with its own key:
 * `creature-kinds.mjs#UNDEAD_PEOPLES`, `undead.mjs#NO_FOOD_PEOPLES`,
 * `factions.mjs#peopleKey` and `talent-effects.mjs#classKey`'s race lookup. Three
 * faults came of it (the plan's A.7):
 *
 * - **F1.** 02 §5 says the Forsaken are immune to disease, and nothing built it:
 *   `conditionImmunities` added `diseased` only for `system.undead`, which a Forsaken
 *   is not (the Risen package, D-1035). `immune` here is read into that list.
 * - **F2.** *An apostrophe splits the key.* The parser's `slugify` drops it
 *   ("San'layn" -> `sanlayn`), while every hand-written copy turned it into a dash
 *   (`san-layn`), so every San'layn talent row would have missed in silence.
 *   `peopleKey` is `tools/parse-book/lib/markdown.mjs#slugify` exactly, and its
 *   Vitest holds the two together.
 * - **F3.** `undead.mjs` read *eats nothing* and *accrues no Undeath* off one list.
 *   They are two facts here (`food`, `accruesUndeath`).
 *
 * **THREE MEANINGS OF UNDEAD, KEPT APART** (the plan's F8). `undead` here is the KIND
 * (`creature-kinds.mjs#kindsOf`: an area that strikes the undead strikes it). The Risen
 * package - Holy weakness, poison and disease immunity, healed by nothing another
 * creature does but Death - is `system.undead` (`undead.mjs#undeadStanding`), and
 * *heals only the undead* is `system.healsOnlyUndead`. A Forsaken and a San'layn are
 * undead by kind and hold neither of the other two: the lead's *"Forsaken parity"* (R11).
 *
 * The keys:
 * - `undead`: undead by kind.
 * - `food`: what a rest eats - `"none"` (the Forsaken: *You do not breathe or eat*),
 *   `"blood"` (the San'layn: *You need blood in place of food and drink*), or absent
 *   for food and drink as 05 §16 asks of everybody.
 * - `accruesUndeath`: false where 10 §3 says the people accrue no Undeath.
 * - `immune`: the conditions the people refuse, as `CONFIG.statusEffects` ids.
 * - `guise`: false where the people may not be worn as a Chromatic Outcast's guise
 *   (the lead's A.9 Q6 answer, *No*, for the San'layn).
 */

/** A people's name as every table keys it: the parser's `slugify` ("San'layn" -> "sanlayn"). */
export function peopleKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 02 §5's facts by people. A people absent from the table eats, drinks and accrues as anyone. */
export const PEOPLE_FACTS = Object.freeze({
  forsaken: Object.freeze({ undead: true, food: "none", accruesUndeath: false, immune: Object.freeze(["diseased"]) }),
  sanlayn: Object.freeze({ undead: true, food: "blood", accruesUndeath: false, immune: Object.freeze(["diseased"]), guise: false })
});

/** The facts for a people, by name or identifier, or null. */
export function peopleFacts(people) {
  return PEOPLE_FACTS[peopleKey(people)] ?? null;
}

/** Whether a people is undead by kind (02 §5). */
export function peopleUndead(people) {
  return peopleFacts(people)?.undead === true;
}

/** What a people's rest eats: "none", "blood", or null for food and drink. */
export function peopleFood(people) {
  return peopleFacts(people)?.food ?? null;
}

/** Whether a people accrues the Undeath track (10 §3). */
export function peopleAccruesUndeath(people) {
  return peopleFacts(people)?.accruesUndeath !== false;
}

/** The conditions a people refuses, as a fresh array. */
export function peopleImmune(people) {
  return [...(peopleFacts(people)?.immune ?? [])];
}

/** Whether a people may be worn as a guise (the Chromatic Outcast's pick). */
export function peopleWornAsGuise(people) {
  return peopleFacts(people)?.guise !== false;
}

/** Whether a people's rests take blood in place of food and drink (the San'layn). */
export function peopleBloodFed(people) {
  return peopleFood(people) === "blood";
}
