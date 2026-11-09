/**
 * **THE GUISE** (the Chromatic Champion plan, *The Chromatic Outcast is a real race
 * item, and the guise is a pick beside it*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A Chromatic Champion's people is always the **Chromatic Outcast**: that race item is
 * the one the character holds, and it carries the trait, the eight racial talents and
 * the class list. The **guise** is one of the other peoples, picked beside it, and it
 * gives **looks, size, Speed and language only** (the lead: *"available to all races
 * but this would just be for their humanoid form. Not their actual Race."*). Its trait
 * and its talents are never embedded.
 *
 * **The Outcast is not the Champion's alone** (the lead, 2026-11-09: *"Allow the
 * Chromatic Outcast Race to be Warrior, Mage, Rogue, or Warlock classes as well."*). The
 * Champion is still Outcast-only, but an Outcast may take any class on its race item's
 * list, and EVERY Outcast wears a guise whatever its class: the race item has no size,
 * Speed or tongue of its own. `guiseRequired` keys on the race as well as the class for
 * exactly that reason.
 *
 * **The guise is a SNAPSHOT on the character** (`system.guise`): the uuid of the race
 * it was taken from and the four facts read off it. Data preparation cannot await a
 * pack read, so the facts travel with the pick, exactly as a shape's block travels on
 * its effect (D-769). `guiseSnapshot` is the one writer of that shape.
 *
 * Every rule here keys on an IDENTIFIER through `AZEROTH.guiseRaceFor`, never on a
 * name: the class and the race documents arrive with the book's chapters.
 */

import { AZEROTH } from "../config.mjs";

/** The guise races, by identifier: every value of `AZEROTH.guiseRaceFor`. */
export function guiseRaces() {
  return [...new Set(Object.values(AZEROTH.guiseRaceFor ?? {}))].sort();
}

/** The race a class always is, by identifier, or null for a class that picks its people. */
export function guiseRaceOf(cls) {
  const id = String(cls?.identifier ?? "").toLowerCase();
  return (AZEROTH.guiseRaceFor ?? {})[id] ?? null;
}

/** The class whose people a guise race is, by identifier, or null. */
export function guiseClassOf(race) {
  const id = String(race?.identifier ?? "").toLowerCase();
  return Object.entries(AZEROTH.guiseRaceFor ?? {}).find(([, r]) => r === id)?.[0] ?? null;
}

/** Whether a race is one that wears a guise (the Chromatic Outcast). */
export function isGuiseRace(race) {
  return guiseClassOf(race) !== null;
}

/** Whether a proposal walks the Mortal guise step in place of the race step. */
export function guiseRequired({ race = null, cls = null } = {}) {
  return guiseRaceOf(cls) !== null || isGuiseRace(race);
}

/** The peoples a guise may be: every race that is not itself a guise race, in the order given. */
export function guiseChoices(races = []) {
  return (races ?? []).filter(r => r && !isGuiseRace(r));
}

/**
 * **WHETHER A RACE MAY TAKE A CLASS** (02 §3's matrix, carried on the race item; the one
 * reading behind `rules/creation.mjs#classOpenTo` and `rules/multiclass.mjs`). A guise
 * class (the Chromatic Champion) is open to its guise race alone, whatever a race item's
 * list says; every other class is open where the race item's list names it.
 *
 * @param {{identifier?: string, classes?: string[]}|null} race
 * @param {{identifier?: string, name?: string}|null} cls
 */
export function raceOpensClass(race, cls) {
  const wanted = guiseRaceOf(cls);
  if (wanted) return String(race?.identifier ?? "").toLowerCase() === wanted;
  return Boolean(race?.classes?.includes(cls?.name));
}

/**
 * Whether a guise race opens a class: its own guise class always, else any class on the
 * race item's list (02 §3's matrix, which the parser stamps on the race). The lead,
 * 2026-11-09: *"Allow the Chromatic Outcast Race to be Warrior, Mage, Rogue, or Warlock
 * classes as well."* - so the Outcast's list is the Champion and those four, read off the
 * chapter and never kept here.
 *
 * @param {{identifier?: string, classes?: string[]}|null} race
 * @param {{identifier?: string, name?: string}|null} cls
 */
export function guiseRaceOpens(race, cls) {
  if (!race || !cls) return false;
  const id = String(cls.identifier ?? "").toLowerCase();
  if (id && id === guiseClassOf(race)) return true;
  return Array.isArray(race.classes) && race.classes.includes(cls.name);
}

/**
 * **WHAT THE CREATOR SETS WHEN A GUISE CLASS OR RACE IS PICKED** (the plan: *picking
 * the Chromatic Champion sets the race to the Chromatic Outcast and replaces the race
 * step with a Mortal guise step*; the lead, 2026-11-09: *"Allow the Chromatic Outcast
 * Race to be Warrior, Mage, Rogue, or Warlock classes as well."*). Over the creator's
 * state, by uuid; answers the patch to apply.
 *
 * - the class is a guise class (the Champion): the race becomes its guise race, and a
 *   people already picked becomes the guise rather than being thrown away;
 * - the race is a guise race (the Outcast) and the class is one it opens, or no class is
 *   held: nothing moves. Every Outcast wears a guise whatever its class, so the guise
 *   stays, and picking the Outcast never picks a class for the player;
 * - the race is a guise race and the CLASS was just changed to one it does not open: the
 *   guise goes back to being the race (or nothing), because that class picks its own
 *   people;
 * - the race is a guise race and the class it does not open was already held (the race
 *   was just picked, or the state arrived whole): nothing moves, and `validate` refuses
 *   the pair in words (`classNotOpen`), as it does for every other race;
 * - otherwise nothing, and a stale guise is cleared.
 *
 * @param {{race?: string|null, cls?: string|null, guise?: string|null}} state  uuids
 * @param {{races?: Array<{uuid: string, identifier: string, classes?: string[]}>,
 *   classes?: Array<{uuid: string, identifier: string, name?: string}>,
 *   changed?: "race"|"cls"|null}} data  `changed` the field the player just set
 * @returns {{race?: string|null, cls?: string|null, guise?: string|null}}
 */
export function settleGuise(state = {}, { races = [], classes = [], changed = null } = {}) {
  const race = races.find(r => r.uuid === state.race) ?? null;
  const cls = classes.find(c => c.uuid === state.cls) ?? null;
  const patch = {};
  const wanted = guiseRaceOf(cls);
  if (wanted) {
    const outcast = races.find(r => r.identifier === wanted) ?? null;
    if (outcast && race?.uuid !== outcast.uuid) {
      patch.race = outcast.uuid;
      if (race && !isGuiseRace(race) && !state.guise) patch.guise = race.uuid;
    }
    return patch;
  }
  if (race && isGuiseRace(race)) {
    if (!cls || guiseRaceOpens(race, cls) || changed !== "cls") return patch;
    patch.race = state.guise ?? null;
    patch.guise = null;
    return patch;
  }
  if (state.guise) patch.guise = null;
  return patch;
}

/**
 * The snapshot `system.guise` stores, off a race document's plain data. Null for
 * nothing, and for a guise race (an Outcast cannot be the guise of an Outcast).
 *
 * @param {{uuid?: string, identifier?: string, name?: string, img?: string, size?: string, speed?: number, languages?: string[]}|null} race
 * @returns {{uuid: string, identifier: string, name: string, img: string, size: string, speed: number|null, languages: string[]}|null}
 */
export function guiseSnapshot(race) {
  if (!race || isGuiseRace(race)) return null;
  const speed = Number(race.speed);
  return {
    uuid: String(race.uuid ?? ""),
    identifier: String(race.identifier ?? ""),
    name: String(race.name ?? ""),
    img: String(race.img ?? ""),
    size: typeof race.size === "string" && race.size in AZEROTH.sizes ? race.size : "medium",
    speed: Number.isFinite(speed) && speed > 0 ? Math.trunc(speed) : null,
    // Only a tongue `AZEROTH.languages` knows (the 1B review, item 7): the field's
    // `choices` refuse one unknown key, and that refused the whole `Actor.create` at Finish.
    languages: Array.isArray(race.languages) ? race.languages.filter(l => typeof l === "string" && l && l in (AZEROTH.languages ?? {})) : []
  };
}

/**
 * **THE PEOPLE WHOSE SIZE, SPEED AND TONGUE COUNT**: the guise where one is held,
 * else the race. Plain rows in (a race item's system data, or a snapshot), one out.
 *
 * @param {{race?: object|null, guise?: object|null}} o
 * @returns {object|null}
 */
export function peopleOf({ race = null, guise = null } = {}) {
  return guiseCounts({ race, guise }) ? guise : race;
}

/**
 * Whether a stored guise counts: one is held, and the race is a guise race or none is
 * known yet (the creator before a race is settled). **A guise left behind by a race
 * swap counts for nothing** (the final review): a GM who drops a Human race on an
 * Outcast's sheet gets a Human's size, Speed and race line, not the old guise's.
 * The race may be plain data or an Item document, whose identifier is on `system`.
 *
 * @param {{race?: object|null, guise?: object|null}} o
 * @returns {boolean}
 */
export function guiseCounts({ race = null, guise = null } = {}) {
  if (!guise || !(guise.uuid || guise.name)) return false;
  if (!race) return true;
  return isGuiseRace(race) || isGuiseRace(race.system);
}

/**
 * The three facts a guise gives, read off the people that counts: size (a key of
 * `AZEROTH.sizes`, Medium by default), Speed (feet, or null for the race's own
 * default) and languages.
 *
 * @param {{race?: object|null, guise?: object|null}} o
 * @returns {{size: string, speed: number|null, languages: string[], from: "guise"|"race"|null}}
 */
export function guiseFacts({ race = null, guise = null } = {}) {
  const people = peopleOf({ race, guise });
  const from = people === null ? null : (people === guise ? "guise" : "race");
  const speed = Number(people?.speed);
  return {
    size: typeof people?.size === "string" && people.size ? people.size : "medium",
    speed: Number.isFinite(speed) && speed > 0 ? speed : null,
    languages: Array.isArray(people?.languages) ? [...people.languages] : [],
    from
  };
}

/**
 * The sheet's race line, as its parts: the race's own name, and the guise's where
 * one is held (*"Chromatic Outcast, in the guise of a Dwarf"*). The words are the
 * sheet's (`AZEROTH.Guise.Line`).
 *
 * @param {{race?: {name?: string}|null, guise?: {name?: string}|null}} o
 * @returns {{race: string|null, guise: string|null}}
 */
export function raceLine({ race = null, guise = null } = {}) {
  return {
    race: race?.name ? String(race.name) : null,
    guise: guise?.name && guiseCounts({ race, guise }) ? String(guise.name) : null
  };
}
