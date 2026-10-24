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

import { figureSlots } from "./worn.mjs";
import { isShot } from "./ammunition.mjs";

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

/**
 * **THE FOUR FACTS, OFF WHAT THE CHARACTER HOLDS** (door 15), plus the two
 * hands' types. `melded`: a shape melds the weapons (D-769), so nothing is in
 * either hand - a suit melded is still no suit in the Chest tile only where none
 * is worn, so `noSuit` reads the items as they are.
 *
 * @param {Iterable<{type: string, name?: string, system?: object}>} items
 * @param {{melded?: boolean}} [o]
 * @returns {{twoHanded: boolean, noSuit: boolean, twoTypes: boolean, hammerOrMace: boolean,
 *   mainType: string|null, offType: string|null}}
 */
export function wieldFacts(items = [], { melded = false } = {}) {
  const figure = figureSlots(items);
  const main = melded ? null : figure.mainHand;
  const off = melded ? null : (figure.offHandKind === "weapon" ? figure.offHand : null);
  const mainType = inTheHand(main) ? cleanWeaponType(main.system?.weaponType) : null;
  const offType = inTheHand(off) ? cleanWeaponType(off.system?.weaponType) : null;
  return {
    twoHanded: !melded && figure.twoHanded === true,
    noSuit: figure.body === null,
    twoTypes: Boolean(mainType && offType && mainType !== offType),
    hammerOrMace: HAMMER_TYPES.includes(mainType),
    mainType,
    offType
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
  hammerOrMace: "AZEROTH.Wield.Needs.HammerOrMace"
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
