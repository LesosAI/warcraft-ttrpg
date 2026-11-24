/**
 * **A CRAFTER MAY GIVE A CUT TO A SUIT THAT HAS NONE** (D-2009; the lead, 2026-11-24: *"Items
 * without a prefix option should allow selection of a Cut if relevant"*). Pure, no Foundry imports
 * (CLAUDE.md §3).
 *
 * 08 §5: *Cut traits ... sit on the suits in section 8 and on nothing else*, and *a suit's Cut ...
 * costs no budget*. 08 §8: *A suit with no Cut carries its category's three numbers as printed.*
 * 11 §14: *A crafter may give a suit that has no Cut one of the four Cuts in 08-EQUIPMENT, Cut traits, as part of the recipe. A Cut costs nothing extra.*
 *
 * The rule as built (the coordinator's reading of the lead's words; the lead may refine it):
 *
 * - **only a suit**: an armor item that is not a shield, with a category that grants Armor Points
 *   (barding is gear, and a shield is held, not worn);
 * - **only a suit with no Cut of its own**: a suit the book cuts keeps its Cut;
 * - **only where no Prefix row is drawn** (`prefixRowDrawn`): at Common, or at a rarity whose Prefix
 *   row has no option left;
 * - **only the Cuts the category takes** (`armor.mjs#cutLegality`: plate is never Harnessed, a
 *   category with no Head Armor Points is never Open); nothing greyed (D-1929);
 * - **it costs nothing**: no budget, no coin and no reagent, at any rarity.
 *
 * The Cut chosen is stored on the project (`quality.cut`) and set as the made item's `system.cuts`,
 * which `armor.mjs#armorPoints` and `#speedModifier` read as they read any suit's.
 */

import { AZEROTH } from "../config.mjs";
import { CUTS, cutLegality } from "./armor.mjs";

/** The four Cuts, in 08 §5's order. */
export const CUT_KEYS = Object.freeze(Object.keys(CUTS));

/** A suit's own Cuts, as stored: the known keys only. */
export function ownCuts(base) {
  const list = base?.system?.cuts;
  return Array.isArray(list) ? list.filter(c => typeof c === "string" && CUT_KEYS.includes(c)) : [];
}

/**
 * Whether an item is a SUIT a Cut may sit on: an armor item, not a shield, whose category grants
 * Armor Points (a row of the config's Armor Point table, never `none`).
 */
export function isSuit(base) {
  if (base?.type !== "armor" || base.system?.shield === true) return false;
  const category = base.system?.category;
  return typeof category === "string" && category !== "none" && Object.hasOwn(AZEROTH.ARMOR_AP, category);
}

/**
 * Whether the craft window draws the Prefix row: the rarity opens it (`recipes.mjs#visibleRows`)
 * AND at least one prefix may be picked (`recipes.mjs#affixChoices`, which keeps a current pick).
 * A row with nothing in it is not drawn (D-1929), and then a Cut may be offered.
 *
 * @param {boolean} opened         `visibleRows(...).prefix`
 * @param {Array} [choices]        `affixChoices({kind: "prefix", ...})`
 */
export function prefixRowDrawn(opened, choices = []) {
  return Boolean(opened) && Array.isArray(choices) && choices.length > 0;
}

/**
 * **THE CUTS THE CRAFT WINDOW OFFERS** for one item, in 08 §5's order: none where the item is not a
 * suit, carries a Cut of its own or has a Prefix row drawn; otherwise every Cut its category takes.
 *
 * @param {{base: object, prefixRow?: boolean}} o
 * @returns {string[]}
 */
export function cutChoices({ base = null, prefixRow = false } = {}) {
  if (prefixRow || !isSuit(base) || ownCuts(base).length) return [];
  return CUT_KEYS.filter(cut => cutLegality(base.system.category, cut).ok);
}

/**
 * A Cut asked for, judged before anything is spent (D-768's order): null for none or for one the
 * window offers; `{reason: "cut", cut}` for any other (an unknown Cut, a Cut the category refuses,
 * one on a shield or a suit already cut, or one beside a Prefix row).
 *
 * @param {{base: object, cut?: string|null, prefixRow?: boolean}} o
 * @returns {{reason: "cut", cut: string}|null}
 */
export function cutRefusal({ base = null, cut = null, prefixRow = false } = {}) {
  if (cut === null || cut === undefined || cut === "") return null;
  return cutChoices({ base, prefixRow }).includes(cut) ? null : { reason: "cut", cut: String(cut) };
}

/**
 * An item's system with the chosen Cut set as its one Cut (`system.cuts = [cut]`), or the system
 * unchanged for none. Never mutates.
 */
export function withCut(system, cut = null) {
  if (!cut || !CUT_KEYS.includes(cut)) return system;
  return { ...(system ?? {}), cuts: [cut] };
}

/**
 * **THE BASE A FINISHED PROJECT IS MADE FROM** (`dice/profession-workflows.mjs#deliverProject`):
 * the recipe with the project's stored Cut set on it, where the recipe still takes that Cut, else
 * the recipe as it is. Both delivery paths read it - the Common copy and the built item - so the
 * built item's stored base carries the Cut too, and an enchantment laid later (which rebuilds from
 * that base) keeps it. Never mutates.
 *
 * @param {object} recipe   the recipe as plain data `{name, type, system, ...}`
 * @param {object|null} quality  the project's `quality`
 * @returns {{base: object, cut: string|null}}
 */
export function deliveredBase(recipe, quality = null) {
  const asked = quality?.cut ?? null;
  const cut = asked && cutChoices({ base: recipe }).includes(asked) ? asked : null;
  return { base: cut ? { ...recipe, system: withCut(recipe.system, cut) } : recipe, cut };
}
