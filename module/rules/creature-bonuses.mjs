/**
 * A creature's own Casting Test bonus, Boons and Banes, and condition
 * immunities (D-1760 to D-1762). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * A character takes all three from what it wears: a GM's Casting Test bonus on
 * an item (`rules/item-bonuses.mjs`), 08 §6's *A Boon on Perception* and 08
 * §20's *A Boon on Attack Tests*, and a Signature that refuses a condition. A
 * bestiary creature carries no gear, so 14's blocks print none of them and a GM
 * had no way to give a creature any. These are the GM's own numbers, set in the
 * NPC generator, and each lands on the derived value the doors ALREADY read:
 *
 *  - `castingBonus` joins `system.itemBonus.casting`, the property
 *    `workflows.mjs#castSpell` reads off whichever actor casts. `NpcData` never
 *    derived `itemBonus` at all, so a ring's Casting Test bonus did nothing on a
 *    creature either (D-681's shape); it derives it now, from the same
 *    `bonusTotals` the character uses, with the creature's own number added.
 *  - `boonsBanes` is composed into 08 §6's own grant sentences and read by
 *    `grants.mjs#grantsFor`, the one reader of a worn Boon, so a skill row lands
 *    in `system.skillBoons`/`skillBanes` exactly as a ring's does, and a Test
 *    row in the creature's standing `testBoons`/`testBanes`.
 *  - `conditionImmune` joins `system.conditionImmunities`, which
 *    `AzerothActor#toggleStatusEffect` and every Inflict door refuse at.
 *
 * Every stored field is cleaned only where it is present (CLAUDE.md §15) and a
 * data operator is left whole (D-1727's review).
 */

import { AZEROTH } from "../config.mjs";
import { bonusAtTier } from "./augments.mjs";
import { bonusTotals, cleanPoints } from "./item-bonuses.mjs";
import { grantsFor } from "./grants.mjs";
import { isDataOperator } from "./creature-spellpower.mjs";

/* -------------------------------------------- */
/*  The Casting Test bonus                       */
/* -------------------------------------------- */

/**
 * The most a thing a character carries adds to a Casting Test at a tier: 08
 * §9's Augment, *+1 at tiers 1 and 2, and +2 at tiers 3 and 4*. 08 sells no
 * other Casting Test bonus. The review NOTES a creature above it, never refuses
 * (D-104), and `creature-bonuses.test.mjs` reads the two numbers off the chapter.
 *
 * @param {number} tier
 * @returns {number}
 */
export function castingBonusCeiling(tier) {
  return bonusAtTier(tier);
}

/**
 * The stored `castingBonus` made valid, only where it is PRESENT: a whole
 * number inside `item-bonuses.mjs`' limit (the same range a GM may type on an
 * item), and a value that is no number at all dropped so the schema's initial
 * stands. A penalty is kept: a GM may hand a creature a cursed hand.
 *
 * @param {object} source  an NPC's system source, whole or partial
 * @returns {object}
 */
export function cleanCastingBonusSource(source) {
  if (!source || typeof source !== "object" || !("castingBonus" in source)) return source;
  const value = source.castingBonus;
  if (isDataOperator(value)) return source;
  const n = value === null || value === "" || typeof value === "boolean" ? NaN : Math.trunc(Number(value));
  if (Number.isFinite(n)) source.castingBonus = cleanPoints(n);
  else delete source.castingBonus;
  return source;
}

/**
 * What a creature's equipped things add to a Casting Test and a Damage Rating
 * (`item-bonuses.mjs#bonusTotals`, the character's own reading), with the
 * creature's own Casting Test bonus added to the casting total and named as a
 * source. The shape is `CharacterData.itemBonus`'s exactly, so the cast door
 * reads one property off either actor.
 *
 * @param {object} [o]
 * @param {Array<{equipped?: boolean, name?: string, bonus?: object}>} [o.items]
 * @param {number} [o.castingBonus]  `system.castingBonus`
 * @param {string} [o.name]          the creature's name, the source the bonus is filed under
 * @returns {{damageRating: number, casting: number, sources: {damageRating: object[], casting: object[]}}}
 */
export function creatureItemBonus({ items = [], castingBonus = 0, name = "" } = {}) {
  const out = bonusTotals(items);
  const own = cleanPoints(castingBonus);
  if (own) {
    out.casting += own;
    out.sources.casting.push({ name, points: own, own: true });
  }
  return out;
}

/* -------------------------------------------- */
/*  Boons and Banes                              */
/* -------------------------------------------- */

/** The two words a row may carry. */
export const EDGE_KINDS = Object.freeze(["boon", "bane"]);

/**
 * What a row may name: one of 02 §8's skills, or a KIND of Test (05 §2's four,
 * `AZEROTH.testKinds`). Parry is left out on purpose: the creature's standing
 * Test bag is read by the dialog for the Test's own kind, and nothing reads a
 * standing Boon on a Parry (`roll-dialog.mjs#snapshotOf`).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isEdgeTarget(key) {
  return typeof key === "string" && (key in AZEROTH.skills || key in AZEROTH.testKinds);
}

/** Whether a row names a skill rather than a kind of Test. */
export function isSkillEdge(row) {
  return typeof row?.on === "string" && row.on in AZEROTH.skills;
}

/**
 * One row, valid or null: a known target and a known word, lowercased.
 *
 * @param {unknown} row
 * @returns {{on: string, kind: "boon"|"bane"}|null}
 */
function cleanEdge(row) {
  if (!row || typeof row !== "object") return null;
  const kind = String(row.kind ?? "").toLowerCase();
  if (!EDGE_KINDS.includes(kind) || !isEdgeTarget(row.on)) return null;
  return { on: row.on, kind };
}

/**
 * The stored `boonsBanes` made valid, only where it is PRESENT. An array is a
 * leaf in a v14 update (`ArrayField#_updateDiff` replaces it whole), so the list
 * is rebuilt row by row: a row naming no skill or Test kind, or neither Boon nor
 * Bane, is dropped rather than refusing the creature. A value that is not a list
 * is removed so the schema's initial stands. A data operator is left whole.
 *
 * @param {object} source  an NPC's system source, whole or partial
 * @returns {object}
 */
export function cleanBoonsBanesSource(source) {
  if (!source || typeof source !== "object" || !("boonsBanes" in source)) return source;
  const list = source.boonsBanes;
  if (isDataOperator(list)) return source;
  if (!Array.isArray(list)) {
    delete source.boonsBanes;
    return source;
  }
  source.boonsBanes = list.map(cleanEdge).filter(Boolean);
  return source;
}

/**
 * The 08 §6 grant sentence a row writes: `A Boon on sleightOfHand`, `A Bane on
 * casting`. `grants.mjs#parseGrant` reads a skill by its key and a Test by its
 * kind, which `creature-bonuses.test.mjs` holds for every target.
 *
 * @param {{on: string, kind: string}} row
 * @returns {string|null}
 */
export function edgeSentence(row) {
  const edge = cleanEdge(row);
  if (!edge) return null;
  return `A ${edge.kind === "boon" ? "Boon" : "Bane"} on ${edge.on}`;
}

/**
 * What the rows grant, through the one reader a worn Boon takes
 * (`grants.mjs#grantsFor`): `boons` and `skillBanes` by skill, each naming the
 * source, and `testBoons`/`testBanes` counted by kind. Two rows of one Boon on
 * one skill are two Boons, as two rings are.
 *
 * @param {Array<{on: string, kind: string}>} [rows]  `system.boonsBanes`
 * @param {string} [name]                             the source each is filed under
 * @returns {ReturnType<typeof grantsFor>}
 */
export function boonsBanesGrants(rows = [], name = "") {
  const grants = (Array.isArray(rows) ? rows : []).map(edgeSentence).filter(Boolean);
  return grantsFor([{ equipped: true, name, grants }]);
}

/**
 * The creature's bags with its own rows ADDED, never replacing what its
 * passives and gear already gave (D-691): the four bags `NpcData` derives,
 * copied, with the rows' names appended and the counts summed.
 *
 * @param {object} held
 * @param {Record<string, string[]>} [held.skillBoons]
 * @param {Record<string, string[]>} [held.skillBanes]
 * @param {Record<string, number>} [held.testBoons]
 * @param {Record<string, number>} [held.testBanes]
 * @param {Array<{on: string, kind: string}>} [rows]
 * @param {string} [name]
 * @returns {{skillBoons: object, skillBanes: object, testBoons: object, testBanes: object}}
 */
export function withOwnEdges({ skillBoons = {}, skillBanes = {}, testBoons = {}, testBanes = {} } = {}, rows = [], name = "") {
  const own = boonsBanesGrants(rows, name);
  const out = {
    skillBoons: { ...(skillBoons ?? {}) }, skillBanes: { ...(skillBanes ?? {}) },
    testBoons: { ...(testBoons ?? {}) }, testBanes: { ...(testBanes ?? {}) }
  };
  for (const [skill, names] of Object.entries(own.boons)) out.skillBoons[skill] = [...(out.skillBoons[skill] ?? []), ...names];
  for (const [skill, names] of Object.entries(own.skillBanes)) out.skillBanes[skill] = [...(out.skillBanes[skill] ?? []), ...names];
  for (const [kind, n] of Object.entries(own.testBoons)) if (n) out.testBoons[kind] = (Number(out.testBoons[kind]) || 0) + n;
  for (const [kind, n] of Object.entries(own.testBanes)) if (n) out.testBanes[kind] = (Number(out.testBanes[kind]) || 0) + n;
  return out;
}

/**
 * The generator's rows off a stored list (Rework, Start from an entry), valid
 * rows only, in the stored order.
 *
 * @param {Array<object>} [list]  the stored `boonsBanes`
 * @returns {Array<{on: string, kind: string}>}
 */
export function boonsBanesStateRows(list = []) {
  return (Array.isArray(list) ? list : []).map(cleanEdge).filter(Boolean);
}

/** The list the generator writes off its rows: the valid ones, in order. */
export function boonsBanesFromRows(rows = []) {
  return boonsBanesStateRows(rows);
}

/**
 * The NPC sheet's Boons and Banes row off the STORED list: the word's lang key
 * (`Boon on {what}`), the target's lang key, and whether it is a kind of Test
 * (the sheet prints *Casting Tests* rather than *Casting*). The sheet localises.
 *
 * @param {Array<object>} [list]  the stored `boonsBanes`
 * @returns {Array<{on: string, kind: string, word: string, target: string, test: boolean}>}
 */
export function boonsBanesSheetRows(list = []) {
  return boonsBanesStateRows(list).map(row => ({
    ...row,
    word: row.kind === "boon" ? "AZEROTH.Sheet.BoonOn" : "AZEROTH.Sheet.BaneOn",
    target: isSkillEdge(row) ? AZEROTH.skills[row.on] : AZEROTH.testKinds[row.on],
    test: !isSkillEdge(row)
  }));
}

/* -------------------------------------------- */
/*  Condition immunities                         */
/* -------------------------------------------- */

/**
 * The stored `conditionImmune` made valid, only where it is PRESENT: A1's
 * conditions (`AZEROTH.conditions`, the system's one list), lowercased, each
 * once, in the list's own order. A value that is not a list is removed.
 *
 * @param {object} source  an NPC's system source, whole or partial
 * @returns {object}
 */
export function cleanConditionImmuneSource(source) {
  if (!source || typeof source !== "object" || !("conditionImmune" in source)) return source;
  const list = source.conditionImmune;
  if (isDataOperator(list)) return source;
  if (!Array.isArray(list)) {
    delete source.conditionImmune;
    return source;
  }
  source.conditionImmune = conditionImmuneFrom(list);
  return source;
}

/**
 * A list of condition keys made valid: known, lowercased, each once, in
 * `AZEROTH.conditions`' order so two writes of one set store one list.
 *
 * @param {Iterable<string>} [list]
 * @returns {string[]}
 */
export function conditionImmuneFrom(list = []) {
  const held = new Set([...(list ?? [])].map(v => String(v).toLowerCase()));
  return Object.keys(AZEROTH.conditions).filter(id => held.has(id));
}

/**
 * What the NPC sheet's Refuses row lists: the block's own refusals (its
 * standing passives, `system.refuses`) and then the GM's condition immunities,
 * each once. A carried thing's refusal is not the creature's and stays off it,
 * as `NpcData` says beside `conditionImmunities`.
 *
 * @param {string[]} [refuses]          the derived `system.refuses`
 * @param {string[]} [conditionImmune]  the stored `system.conditionImmune`
 * @returns {string[]}
 */
export function refusedKeys(refuses = [], conditionImmune = []) {
  return [...new Set([...(refuses ?? []), ...conditionImmuneFrom(conditionImmune ?? [])])];
}
