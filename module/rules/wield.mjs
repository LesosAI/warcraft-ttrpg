/**
 * **WHAT A CHARACTER WIELDS AND WEARS, AS FACTS A TALENT GATES ON** (the Legacy
 * branches' door 15). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The Blademaster's and the Mountain King's rows ask four questions nothing
 * answered:
 *
 * - **`twoHanded`** - *While you wield a two-handed weapon* (Critical Strike,
 *   Blade Circle, Bloodied Blade, Bladestorm). 08 §7's **Two-handed weapons**
 *   alone (the plan's *As read*): the Overview figure's own `twoHanded`, which
 *   is `worn.mjs#isTwoHanded` of the main hand - a Versatile weapon's grip is
 *   never tracked, and a bow or a crossbow is a launcher and bars nothing.
 * - **`noSuit`** - *While you wear no armor in your Chest slot* (Wolf's Pace,
 *   Read the Blade, Blade Circle, Bloodied Blade). Only a suit fills the Chest
 *   tile (`worn.mjs#figureSlots`' `body`), so robes in the Clothing slot and a
 *   shield do not break it (the plan's *As read*).
 * - **`twoTypes`** - *While you hold melee weapons of two different types, one
 *   in each hand, such as an axe and a hammer* (Axe and Hammer): the main hand
 *   and the off hand each a melee weapon, each of a weapon TYPE, and the two
 *   types different.
 * - **`hammerOrMace`** - the main hand is of the hammer or the mace type (Storm
 *   Bolt's *a weapon of the hammer or mace type counts as Thrown (20 ft)*).
 *
 * ## The weapon's TYPE
 *
 * 08 §7 gains a **Type** column (the lead, phase 0: *"Type, not kind"* - 08 §5
 * already uses Kind for trait kinds): axe, hammer, mace, sword, dagger, spear,
 * club, staff, flail, polearm. The parser stamps it (the plan's phase B5); the
 * field is `system.weaponType` on the weapon, **never `type`**, which is the Item
 * document's own subtype, and a free string the model cleans (`cleanWeaponType`)
 * rather than a `choices` that would refuse a document at load (CLAUDE.md §15).
 * A weapon with no type stamped yet answers no type, and a gate that needs one
 * fails closed.
 */

import { figureSlots, isTwoHanded } from "./worn.mjs";
// 08 §8's categories, for the worn suit's category (the Witch Hunter plan's armor-category gate).
import { isArmorCategory } from "./armor.mjs";
import { isShot } from "./ammunition.mjs";
// A glaive thrown by Flame Crash lies where it landed and is in no hand (the review's C4).
import { glaiveAway } from "./demon-hunter-spells.mjs";

/**
 * The category of the suit in the Chest tile (`figureSlots`' `body`): `none` with no suit, the suit's
 * `system.category` where it is one of 08 §8's, else null.
 *
 * @param {{system?: {category?: string}}|null} body
 * @returns {string|null}
 */
export function suitCategoryOf(body) {
  if (!body) return "none";
  const category = body.system?.category ?? null;
  return isArmorCategory(category) ? category : null;
}

/** Ordinary Attack follows the equipped hand; special strikes keep their own economy. */
export function attackOffHand(weapon, { offHand = null, budget = null, damage = true, opportunity = false, riposte = false, fromFeature = null } = {}) {
  return offHand ?? (weapon?.type === "weapon" && weapon.system?.equipped === true && weapon.system?.offHand === true
    && damage !== false && (budget === null || budget === "half")
    && !opportunity && !riposte && !fromFeature);
}

/**
 * **A VERSATILE WEAPON IN TWO HANDS** (08 §5: *Versatile (X): Damage Rating X when used in two
 * hands*). The weapon is used in two hands when it is the one swung in the main hand and the Off
 * hand tile holds nothing - no shield, no second weapon, no claws. `wieldFacts#bothHands` reads
 * the same grip for the Death Knight's talents; this is the Rating's reading of it, and it was
 * missing: the attack door swung every Versatile weapon at its one-handed Rating whatever the
 * off hand held, so the trait was a note and nothing more (the lead, 2026-11-23).
 *
 * The answer is **the printed X or the one-handed Rating plus 1, whichever is more** (the lead,
 * 2026-11-23: *"applied to all weapons that have or have the versatile trait added to it"*). Every
 * base weapon in 08 §7 prints X exactly one above its Rating, so for those the two readings are the
 * same number. A forged or found item keeps the base's `Versatile (5)` over a Rating its affixes
 * have raised (62 of the weapons pack's 138 Versatile items print X at or below their Rating), and
 * a trait added by hand may print no X at all; the step of 1 is what the trait is worth there, so a
 * two-handed blow always swings above the one-handed one and never below the printed X.
 *
 * @param {{type?: string, system?: object}} weapon  the weapon swung
 * @param {Iterable<object>} items  what the actor owns (`figureSlots` reads which are equipped)
 * @param {{offHand?: boolean, melded?: boolean}} [o]  an Off-Hand Attack is never two-handed
 * @returns {number|null} the Damage Rating to swing at, or null where nothing changes
 */
export function versatileRating(weapon, items = [], { offHand = false, melded = false } = {}) {
  if (!weapon || weapon.type !== "weapon" || offHand === true || melded === true) return null;
  const sys = weapon.system ?? {};
  if (sys.equipped !== true || sys.launcher || isShot(sys)) return null;
  const rating = Number(sys.rating);
  if (!Number.isFinite(rating)) return null;
  const trait = (Array.isArray(sys.traits) ? sys.traits : []).map(t => /^Versatile\b(?:\s*\(\s*(\d+)\s*\))?/i.exec(String(t))).find(Boolean);
  if (!trait) return null;
  // The Off hand tile is the figure's own: a shield, a second weapon and the claws all fill it.
  if (figureSlots([...(items ?? [])]).offHand) return null;
  // A bare `Versatile`, or an X that no longer clears the Rating, is worth the step of 1.
  return Math.max(Number.isFinite(Number(trait[1])) ? Number(trait[1]) : 0, rating + 1);
}

/**
 * 08 §7's Type column, in the order the item sheet's select offers it: the lead's
 * ten (*"Type, not kind"*), then the three the book stream added for weapons that
 * fit none - fist (the cestus), glaive and whip - which D-781 records as awaiting
 * the lead's confirmation. `legacy-doors.test.mjs` reads the column off the chapter
 * and holds the two in step.
 */
export const WEAPON_TYPES = Object.freeze(["axe", "hammer", "mace", "sword", "dagger", "spear", "club", "staff", "flail", "polearm", "fist", "glaive", "whip"]);

/** The two types Storm Bolt throws (04: *a weapon of the hammer or mace type*). */
export const HAMMER_TYPES = Object.freeze(["hammer", "mace"]);

/**
 * A stored type as the model keeps it: one of `WEAPON_TYPES`, else null - never
 * refused. The CALLER guards on the key being present (`migrateData` runs over a
 * partial update too; D-671).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function cleanWeaponType(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return WEAPON_TYPES.includes(key) ? key : null;
}

/** Whether an item is a weapon struck in the hand: neither a launcher nor a bundle of shot. */
function inTheHand(item) {
  return item?.type === "weapon" && !item.system?.launcher && !isShot(item.system ?? {});
}

/** The words a weapon is named by, lower case: its identifier and its name. */
const wordsOf = item => [item?.system?.identifier, item?.name].filter(Boolean).join(" ").toLowerCase();

/** A glaive in the hand: 08's Glaive type or a name holding *glaive* (`equipment-training.mjs`' reading). */
export function isGlaive(item) {
  return inTheHand(item) && (cleanWeaponType(item.system?.weaponType) === "glaive" || /glaive/.test(wordsOf(item)));
}

/** A scythe in the hand: a name holding *scythe* (`equipment-training.mjs`' reading). */
export function isScythe(item) {
  return inTheHand(item) && /scythe/.test(wordsOf(item));
}

/**
 * **THE FOUR FACTS, OFF WHAT THE CHARACTER HOLDS** (door 15), plus the two
 * hands' types. `melded`: a shape melds the weapons (D-769), so nothing is in
 * either hand - a suit melded is still no suit in the Chest tile only where none
 * is worn, so `noSuit` reads the items as they are.
 *
 * @param {Iterable<{type: string, name?: string, system?: object}>} items
 * @param {{melded?: boolean}} [o]
 * **THE DEATH KNIGHT'S TWO GRIPS** (04's Blood and Frost; the Death Knight plan's run F4a):
 *
 * - **`bothHands`** - *While you wield a two-handed weapon, or a Versatile weapon in both
 *   hands* (Grim Harvest, Vengeful Blood, Dancing Runeweapon): the main hand two-handed, or a
 *   Versatile weapon in the main hand with nothing in the off hand - 08 §5's *held in two
 *   hands*, the reading Versatile's own Rating takes (the lead: *"Versatile counts for Blood
 *   only in both hands"*: *"Yes"*).
 * - **`oneInEach`** - *While you wield a one-handed weapon in each hand* (Frozen Edge,
 *   Relentless Advance, Killing Machine): a melee weapon in each hand, neither two-handed, of
 *   any type - the Mountain King's *one in each hand* widened; a Versatile weapon in one hand
 *   counts.
 * - **`eitherGrip`** - either of the two (D-1017's Dancing Runeweapon: *while you wield a
 *   two-handed weapon, a Versatile weapon in both hands, or a one-handed weapon in each hand*).
 *   A gate's `wields` list is ALL-of, so the any-of reading is a fact of its own. A single
 *   one-handed weapon with an empty off hand holds neither (the lead on D-1017: *"No"*).
 *
 * @returns {{twoHanded: boolean, noSuit: boolean, twoTypes: boolean, hammerOrMace: boolean,
 *   bothHands: boolean, oneInEach: boolean, eitherGrip: boolean, mainType: string|null, offType: string|null}}
 */
export function wieldFacts(items = [], { melded = false } = {}) {
  const figure = figureSlots(items);
  const main = melded ? null : figure.mainHand;
  const off = melded ? null : (figure.offHandKind === "weapon" ? figure.offHand : null);
  const mainType = inTheHand(main) ? cleanWeaponType(main.system?.weaponType) : null;
  const offType = inTheHand(off) ? cleanWeaponType(off.system?.weaponType) : null;
  const twoHanded = !melded && isTwoHanded(figure.mainHand);
  const versatile = w => (Array.isArray(w?.system?.traits) ? w.system.traits : []).some(t => /^Versatile\b/i.test(String(t)));
  const bothHands = twoHanded || (!melded && inTheHand(main) && versatile(main) && !figure.offHand);
  const oneInEach = !melded && inTheHand(main) && inTheHand(off) && !isTwoHanded(main) && !isTwoHanded(off);
  // **THE DEMON HUNTER'S TWO GRIPS** (04's Betrayer and Souleater; the Demon Hunter plan's Phase 5): *With a
  // glaive in each hand* (Twin Blades) and *While you wield a scythe in two hands* (Reaper's Grip, Sweeping Arc,
  // Hobbling Reap) - 08's Glaive type or a name holding *glaive*, and a name holding *scythe* (the Scythe, the
  // Amani war-scythe, a Classic find named for one), the access words `equipment-training.mjs` reads.
  // A glaive lying away (Flame Crash's *A thrown glaive lies where it landed*) is in no hand (the review's C4).
  const glaiveEach = !melded && isGlaive(main) && isGlaive(off) && !isTwoHanded(main) && !isTwoHanded(off) && !glaiveAway(main) && !glaiveAway(off);
  const scytheTwoHands = !melded && isScythe(main) && isTwoHanded(main);
  return {
    // Talent gates ask for the weapon category, not whether it occupies both hands.
    twoHanded,
    noSuit: figure.body === null,
    twoTypes: Boolean(mainType && offType && mainType !== offType),
    hammerOrMace: HAMMER_TYPES.includes(mainType),
    bothHands,
    oneInEach,
    eitherGrip: bothHands || oneInEach,
    glaiveEach,
    scytheTwoHands,
    mainType,
    offType,
    // **THE WORN SUIT'S CATEGORY** (the Witch Hunter plan's armor-category gate, `talent-gates.mjs
    // #WEAR_GATE`): 08 §8's category of the suit in the Chest tile, `none` with no suit, null where the
    // suit names no category the order knows. A string, so it is not one of `WIELD_FACTS`.
    suitCategory: suitCategoryOf(figure.body)
  };
}

/**
 * **A WEAPON THAT COUNTS AS THROWN FOR ONE ATTACK** (04's Storm Bolt: *For this
 * attack a weapon of the hammer or mace type counts as **Thrown (20 ft)**, and an
 * attack made with one uses Strength*): the attack door's weapon facts with 08
 * §5's `Thrown (N ft)` laid beside its own traits and the ability the throw is
 * made with, where the weapon's type is one the row names and it is not already
 * thrown. Anything else comes back as it was.
 *
 * `throwAs` is the RIDER's (`talent-effects.mjs`, `{identifier, types, feet,
 * ability}`): `rules/attack-modes.mjs#attackPlan` then offers the throw as a way,
 * and `rollTest` refuses that way unless the rider is ticked - *for this attack*.
 *
 * @param {{traits?: string[], launcher?: string|null, range?: number|null, weaponType?: string|null}} weapon  the facts
 * @param {{identifier?: string, types?: string[], feet?: number, ability?: string|null}|null} throwAs
 * @returns {object}
 */
export function throwAsWeapon(weapon, throwAs) {
  if (!weapon || !throwAs) return weapon;
  const type = cleanWeaponType(weapon.weaponType);
  const feet = Math.max(0, Math.trunc(Number(throwAs.feet)) || 0);
  if (!type || !(throwAs.types ?? []).includes(type) || !(feet > 0) || weapon.launcher) return weapon;
  const traits = [...(weapon.traits ?? [])];
  const ability = ["str", "dex"].includes(throwAs.ability) ? throwAs.ability : "dex";
  // **A HAMMER THAT THROWS ALREADY STILL THROWS ON STRENGTH FOR STORM BOLT** (the B6
  // review: 08 §7's Light hammer and the Wildhammer stormhammer carry Thrown (20 ft) of
  // their own, and were thrown on Dexterity with the rider ticked). Its throw is no
  // rider's to make - it may be thrown without one, on Dexterity - so nothing is added
  // and nothing is refused; the rider, where it is ticked, makes THAT throw on its
  // ability (`riderThrowModifiers`).
  if (traits.some(t => /^thrown\b/i.test(String(t).trim()))) {
    return ability === "dex" ? weapon : { ...weapon, riderAbility: { identifier: throwAs.identifier ?? null, ability } };
  }
  return {
    ...weapon,
    traits: [...traits, `Thrown (${feet} ft)`],
    throwAbility: ability,
    throwAs: throwAs.identifier ?? null
  };
}

/**
 * **THE MODIFIER LINES OF A THROW A TICKED RIDER MAKES ON ITS OWN ABILITY** (04's Storm
 * Bolt: *an attack made with one uses Strength*; the B6 review): the way the roller
 * chose, where it carries a rider's ability (`throwAsWeapon`'s `riderAbility`, laid on
 * the thrown way by the attack door) and that rider is among the lines ticked - else
 * null, and the way's own lines stand.
 *
 * @param {{riderModifiers?: {identifier?: string|null, modifiers?: object[]}|null}} way
 * @param {string[]} ticked  the rider identifiers the roller ticked
 * @returns {object[]|null}
 */
export function riderThrowModifiers(way, ticked = []) {
  const swap = way?.riderModifiers ?? null;
  if (!swap?.identifier || !Array.isArray(swap.modifiers)) return null;
  return (Array.isArray(ticked) ? ticked : []).includes(swap.identifier) ? swap.modifiers : null;
}

/** Why a Use is refused for what is (not) wielded, as `lang/en.json` keys (door 15). */
export const WIELD_REFUSALS = Object.freeze({
  twoHanded: "AZEROTH.Wield.Needs.TwoHanded",
  noSuit: "AZEROTH.Wield.Needs.NoSuit",
  twoTypes: "AZEROTH.Wield.Needs.TwoTypes",
  hammerOrMace: "AZEROTH.Wield.Needs.HammerOrMace",
  // The Death Knight's two grips (run F4a).
  bothHands: "AZEROTH.Wield.Needs.BothHands",
  oneInEach: "AZEROTH.Wield.Needs.OneInEach",
  // Either of them (D-1017's Dancing Runeweapon).
  eitherGrip: "AZEROTH.Wield.Needs.EitherGrip",
  // The Demon Hunter's two (Phase 5): Twin Blades', and the Souleater's scythe.
  glaiveEach: "AZEROTH.Wield.Needs.GlaiveEach",
  scytheTwoHands: "AZEROTH.Wield.Needs.ScytheTwoHands"
});

/**
 * **WHY A USE THAT NEEDS SOMETHING IN HAND IS REFUSED** (04's Bladestorm: *As a
 * Full Action while you wield a two-handed weapon*): the first named fact that
 * does not hold, as its refusal's key, or null where every one holds. Asked with
 * the Use's other refusals, before anything is paid (D-768's order).
 *
 * @param {string[]} wields  the facts the Use names (`onUse.wields`)
 * @param {ReturnType<typeof wieldFacts>|null} facts
 * @returns {string|null}
 */
export function wieldRefusal(wields = [], facts = null) {
  for (const fact of wields ?? []) {
    if (!WIELD_REFUSALS[fact]) continue;
    if (facts?.[fact] !== true) return WIELD_REFUSALS[fact];
  }
  return null;
}
