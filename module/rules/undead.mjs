/**
 * **THE DEATH KNIGHT IS UNDEAD, LIKE THE RISEN** (02 §7's Risen Knight; the plan's
 * *Undead, like the Risen*; D-946). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead, verbatim:
 * - *"undead like the Risen. Death magic and DK spells/talents plus consumables will
 *   be how they heal"*;
 * - *"require the target to be undead for all healing the death knight has access
 *   to"*;
 * - *"Death Knight specific spells do not acrue undeath as they are immune"*;
 * - *"normal consumables act as they would for any other player."*;
 * - on a Short Rest for a character who does not eat - the Death Knight, the Forsaken
 *   and the Risen: *"They do recover health but do not have to eat or drink."*
 *
 * What it carries over from 10 §9's Risen: *Vulnerable (Holy)*, *Immune to poison and
 * disease*, and healed by nothing another creature does - with the lead's exception,
 * a spell of the Death school. What it does not (*"okay"*): the Risen's Speed -10 ft
 * and Ward 2 against Shadow.
 *
 * **ONE HEALING JUDGEMENT** (`healingRefusal`), asked by `AzerothActor#applyHealing`
 * before anything lands, so every door that heals - a card's Apply, a tick, an aura,
 * a feature - is judged by the same words.
 */

import { DEATH } from "./schools.mjs";
import { DEATH_KNIGHT } from "./runes.mjs";

/** The class identifiers whose holder is undead (02 §7). */
export const UNDEAD_CLASSES = Object.freeze([DEATH_KNIGHT]);

/** 02 §5's people that do not eat (*"You do not breathe or eat"*). */
const NO_FOOD_PEOPLES = Object.freeze(["forsaken"]);

/** The conditions a Death Knight refuses (10 §9's Risen: *Immune to poison and disease*). */
export const UNDEAD_CLASS_IMMUNE = Object.freeze(["poisoned", "diseased"]);

/** The damage types a Death Knight is Vulnerable to (10 §9's Risen: *Vulnerable (Holy)*). */
export const UNDEAD_CLASS_VULNERABLE = Object.freeze(["holy"]);

const key = v => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Whether a list of class identifiers (or names) holds a class whose holder is undead. */
export function undeadByClass(classes = []) {
  return (classes ?? []).some(c => UNDEAD_CLASSES.includes(key(typeof c === "string" ? c : (c?.identifier ?? c?.name))));
}

/**
 * **WHO NEEDS NO FOOD OR DRINK TO RECOVER ON A SHORT REST** (the lead: *"They do recover
 * health but do not have to eat or drink."*): a Death Knight, a Forsaken (02 §5: *You do
 * not breathe or eat*), and a character who has become The Risen (10 §9: *You do not
 * eat, breathe, sleep or age*), read off the ending's own `noFood` note.
 *
 * @param {{classes?: Array<string|{identifier?: string}>, race?: string|null, endings?: Array<{notes?: string[]}>}} o
 */
export function needsNoFood({ classes = [], race = null, endings = [], rungs = [] } = {}) {
  if (needsNoDrink({ classes, race, endings })) return true;
  // **10 §6's UNDEATH AT 5, *Touched by it*** (the F1 review's note): *You no longer need to
  // eat* - the food alone, so the drink a caster's Mana waits on is still asked for.
  return (rungs ?? []).some(r => (r?.notes ?? []).includes("noFood"));
}

/**
 * **WHO NEEDS NO DRINK EITHER** (the lead: *"They do recover health but do not have to eat
 * or drink."*, O-331): the Death Knight, the Forsaken and The Risen. Undeath's rung at 5
 * lifts the food alone (`needsNoFood`'s `rungs`), so it is not here.
 *
 * @param {{classes?: Array, race?: string|null, endings?: Array<{notes?: string[]}>}} o
 */
export function needsNoDrink({ classes = [], race = null, endings = [] } = {}) {
  if (undeadByClass(classes)) return true;
  if (NO_FOOD_PEOPLES.includes(key(race))) return true;
  return (endings ?? []).some(e => (e?.notes ?? []).includes("noFood"));
}

/**
 * **WHO ACCRUES NO UNDEATH, FROM ANY SOURCE** (10 §3: *The Forsaken do not accrue
 * Undeath*; the lead: *"Death Knight specific spells do not acrue undeath as they are
 * immune"*, read for every source as the Forsaken's is, D-946). The rule 10 states once
 * and nothing built until this plan (CLAUDE.md §7's *a rule the book states once*): the
 * exposure Test and the unresisted point both ask it.
 *
 * @param {{track: string, classes?: Array, race?: string|null}} o
 * @returns {boolean}
 */
export function accruesTrack({ track, classes = [], race = null } = {}) {
  if (track !== "undeath") return true;
  if (undeadByClass(classes)) return false;
  return !NO_FOOD_PEOPLES.includes(key(race));
}

/**
 * The tracks of a list this character accrues (`accruesTrack`, in the list's order): what
 * 06 §10's offer may price the return in (the F1 review). A Forsaken or a Death Knight is
 * never offered Undeath, which it would pay nothing for.
 *
 * @param {string[]} tracks
 * @param {{classes?: Array, race?: string|null}} o
 * @returns {string[]}
 */
export function accruedTracks(tracks = [], { classes = [], race = null } = {}) {
  return (tracks ?? []).filter(track => accruesTrack({ track, classes, race }));
}

/**
 * **WHY A HEAL DOES NOTHING, OR NULL WHERE IT LANDS** - the one judgement.
 *
 * In order:
 * 1. **A Death Knight heals only the undead** (the lead: *"require the target to be
 *    undead for all healing the death knight has access to"*): a spell, feature or
 *    talent of a Death Knight's on a living target restores nothing -
 *    `livingTarget`. A consumable is not the knight's healing (*"normal consumables
 *    act as they would for any other player"*).
 * 2. **A Death Knight is healed by nothing another creature does** but a spell of the
 *    Death school - `notDeath`. Its own spells, features and talents heal it, and so
 *    does a consumable, which comes with no giver or names the drinker.
 *
 * A heal with no giver (`from` null: a potion, a bandage, a hazard's own) is never
 * refused here - every other rule about it is the door's.
 *
 * @param {{targetUndead?: boolean, targetDeathKnight?: boolean, sourceDeathKnight?: boolean,
 *   self?: boolean, giver?: boolean, consumable?: boolean, spell?: boolean, school?: string|null}} o
 *   `giver` a creature gives the heal; `self` that creature is the target; `school` the
 *   SPELL's own school where a spell gives it
 * @returns {"livingTarget"|"notDeath"|null}
 */
export function healingRefusal({
  targetUndead = false, targetDeathKnight = false, sourceDeathKnight = false,
  self = false, giver = false, consumable = false, spell = false, school = null
} = {}) {
  if (!giver || consumable) return null;
  if (sourceDeathKnight && !targetUndead) return "livingTarget";
  if (targetDeathKnight && !self && !(spell && school === DEATH)) return "notDeath";
  return null;
}

/**
 * **WHO A HEAL COMES FROM, FOR THE JUDGEMENT ABOVE** (the F1 review's MUST-FIX). A
 * heal given on another creature's behalf reached `applyHealing` with no `from`, and
 * `healingRefusal` lets a giverless heal land, so a Paladin's Beacon share, a Druid's
 * Symbiosis share, a cure's heal and an area's heal whose caster was not resolved all
 * healed a Death Knight. The door now names the giver three ways, and this is the one
 * reading of them:
 *
 * - `from` an actor: that creature gives it (the door's own giver);
 * - `givenBy` an actor: that creature gives it, named for this judgement ALONE, where the
 *   door withholds `from` because `from` also feeds the Vestments, 10's reduction and the
 *   healer's talents (a Beacon share names its Paladin this way);
 * - `givenBy` `"other"`, or `shared` true with no actor named: ANOTHER creature gives
 *   it and this one cannot say which - a share, a cure with no caster, an area or a tick
 *   whose caster is gone. Closed by default: it is never the target's own heal and never
 *   a Death Knight's.
 *
 * Anything else is a heal with no giver (a potion, a hazard, the creature's own rest).
 *
 * @param {{from?: object|null, givenBy?: object|string|null, shared?: boolean}} o
 * @returns {{giver: object|null, foreign: boolean}}  `giver` the creature named, else
 *   null; `foreign` true where another, unnamed creature gives it
 */
export function healGiver({ from = null, givenBy = null, shared = false } = {}) {
  const actorLike = v => Boolean(v) && typeof v === "object" && (v.documentName === "Actor" || "system" in v);
  if (actorLike(from)) return { giver: from, foreign: false };
  if (actorLike(givenBy)) return { giver: givenBy, foreign: false };
  return { giver: null, foreign: givenBy === "other" || shared === true };
}

/** The words a refusal is said in, by key: the door formats them with the names. */
export const HEALING_REFUSAL_WORDS = Object.freeze({
  livingTarget: "AZEROTH.Undead.HealsUndeadOnly",
  notDeath: "AZEROTH.Undead.OnlyDeathHeals"
});
