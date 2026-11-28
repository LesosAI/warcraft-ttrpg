/**
 * **THE HUNTER PANEL, AS A VIEW** (D11's *The Witch Hunter's Hunter panel carries its pools, its Toxicity, its types and
 * its brews*; the Witch Hunter plan's wave 3, D-2100 to D-2102). Pure: no Foundry imports. The character sheet hands it
 * what `effects/witch-hunter-brews.mjs#hunterPanelFor` already worked out and what it read off the actor, and draws
 * what comes back through `templates/actor/partials/hunter-panel.hbs`. Every word is a `lang/en.json` key the sheet
 * localises; nothing here decides a rule, it only lays out the numbers the law made.
 *
 * What it lays out:
 *
 *  - **the Toxicity track**: one segment a point of the limit, filled to what is used, and past the limit one more
 *    segment a point of overdose, marked `over` with its words beside it (colour is never the only carrier: the track
 *    also says *2 of 3* and *1 point of overdose: −1 on every Test*);
 *  - **the types known** in 14 §1's order, each with its Studied mark in words and its weakness row (the Sign, the bomb
 *    and the damage type, `tome.mjs#WEAKNESS`), and the count of Studied types the Wisdom modifier allows;
 *  - **the brews held**, each with the control 08 §12's kind names (*Drink*, *Coat weapon*, *Throw*) and the heading's
 *    count of doses held against the doses a brewing makes;
 *  - **the medallion's state**: worn in the Neck slot or not, its Spell DC bonus, and whether it senses spells;
 *  - **Prepare**: live in the brewing window a rest opens, greyed with its reason in words otherwise.
 */

import { CREATURE_TYPES, studiedCount, weaknessOf } from "./tome.mjs";
import { brewOf } from "./witch-hunter-brews.mjs";

const int = v => Math.trunc(Number(v)) || 0;

/** The control a brew's row carries, by 08 §12's kind: an elixir and the Decoction are drunk, an oil coats, a bomb is thrown. */
export const BREW_CONTROL = Object.freeze({ elixir: "drink", decoction: "drink", oil: "coat", bomb: "throw" });

/**
 * **THE TOXICITY TRACK**: a segment for each point of the limit, filled to the count used, and one more for each point
 * of overdose, filled and marked `over`.
 *
 * @param {{used?: number, limit?: number}} o
 * @returns {Array<{filled: boolean, over: boolean}>}
 */
export function toxicitySegments({ used = 0, limit = 1 } = {}) {
  const u = Math.max(0, int(used));
  const l = Math.max(1, int(limit));
  return Array.from({ length: Math.max(u, l) }, (_, i) => ({ filled: i < u, over: i >= l }));
}

/**
 * **THE TYPES KNOWN**, in 14 §1's order (`tome.mjs#CREATURE_TYPES`), each with whether it is Studied and its weakness row.
 *
 * @param {{known?: Iterable<string>, studied?: Iterable<string>}} o
 * @returns {Array<{key: string, studied: boolean, sign: string|null, bomb: string|null, damage: string|null}>}
 */
export function typeRows({ known = [], studied = [] } = {}) {
  const k = new Set(known ?? []);
  const s = new Set(studied ?? []);
  return CREATURE_TYPES.filter(type => k.has(type)).map(type => {
    const w = weaknessOf(type);
    return { key: type, studied: s.has(type), sign: w?.sign ?? null, bomb: w?.bomb ?? null, damage: w?.damage ?? null };
  });
}

/**
 * **HOW MANY TYPES MAY BE STUDIED, AND WHY** (02's Studied: *up to half your Wisdom modifier, rounded down, and at least
 * 1*; 04's Forewarned adds 1 a rank): the count `tome.mjs#studiedCount` gives, with the modifier it was read off.
 *
 * @param {{wisMod?: number, forewarned?: number}} o
 * @returns {{wisMod: number, forewarned: number, count: number}}
 */
export function studiedAllowance({ wisMod = 0, forewarned = 0 } = {}) {
  return { wisMod: int(wisMod), forewarned: Math.max(0, int(forewarned)), count: studiedCount(wisMod, forewarned) };
}

/**
 * **THE BREWS HELD**, each with its control, and the heading's count: the doses held against the doses a brewing makes.
 *
 * @param {{brews?: Array<{identifier: string, quantity?: number}>, doses?: number}} o
 * @returns {{rows: Array<object>, held: number, doses: number}}
 */
export function brewRows({ brews = [], doses = 0 } = {}) {
  const rows = (brews ?? []).map(b => {
    const kind = brewOf(b.identifier)?.kind ?? null;
    return { ...b, kind, control: BREW_CONTROL[kind] ?? "drink" };
  });
  const held = rows.reduce((n, b) => n + Math.max(0, int(b.quantity ?? 1)), 0);
  return { rows, held, doses: Math.max(0, int(doses)) };
}

/**
 * **THE MEDALLION'S STATE** (08 §11's witch hunter's medallion; 02's Medallion): carried or not, worn in the Neck slot or
 * not, its rarity's Spell DC bonus (`medallion.mjs#medallionBonus`, read by the caller), and whether the feature senses.
 *
 * @param {{carried?: boolean, worn?: boolean, bonus?: number, feature?: boolean}} o
 * @returns {{state: "none"|"carried"|"worn", bonus: number, senses: boolean}}
 */
export function medallionState({ carried = false, worn = false, bonus = 0, feature = false } = {}) {
  const state = worn ? "worn" : (carried ? "carried" : "none");
  return { state, bonus: worn ? Math.max(0, int(bonus)) : 0, senses: worn && feature === true };
}
