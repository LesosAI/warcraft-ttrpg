/**
 * **WHAT A SPELL'S SUCCESS LEVEL ADDS, WHERE NO OTHER READER TAKES IT** (D-812;
 * the lead: *"complete them"*, of every Success-Level-gated effect). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * 07 §8: *Where a rider says at SL 2, that is the Casting Test's Success Level*,
 * and *A Ward comes off the Success Level as well as off the damage, so a creature
 * with Ward 3 turns an ordinary SL 1 cast into SL 0 and shrugs off every rider the
 * spell had.* Twenty entries in 07 carry an *At SL N or better* clause. Most of
 * them already had a reader of their own (the hit condition, the Speed drop, the
 * forced move, the tick, the area's entry, Arcane Missiles' fourth dart and the
 * cure table); this module reads the seven that had none, in the chapter's words,
 * and names the two that stay the table's (`SL_UNREAD`). The census
 * (`spell-sl-census.test.mjs`) holds every clause in the spells pack to a reader
 * or a reason.
 *
 * Two moments:
 *
 * - **On the hit**, on every creature the card records, as the cast lands -
 *   Searing Pain's Bane (`hitBane`) and Fel Bolt's Ward drop (`hitWardDrop`).
 * - **On a failed Resist**, on the creature that failed it, where the card the
 *   cast posted records this rider - Frostbite's first round, Shadow Wave's
 *   Blinded (`failCondition`), Slow's lost Reaction (`failNoReaction`) and Turn
 *   Undead's destruction (`failDestroy`).
 *
 * A descriptor is read at the cast and carried on the card as a record of the
 * moment (D-724); the Resist never reads the caster or the entry again.
 */

import { AZEROTH } from "../config.mjs";
import { flatText, sentences } from "./spell-effects.mjs";

/** The kinds of rider this module reads. */
export const SL_RIDER_KINDS = Object.freeze(["hitBane", "hitWardDrop", "failCondition", "failNoReaction", "failDestroy"]);

/** The kinds a failed Resist lands, which the card carries to the Test. */
export const SL_FAIL_KINDS = Object.freeze(["failCondition", "failNoReaction", "failDestroy"]);

/**
 * **THE TWO CLAUSES THAT STAY THE TABLE'S**, keyed by the spell's identifier, each
 * with its reason. A ceiling in the census holds this list and may only fall.
 */
export const SL_UNREAD = Object.freeze({
  // *each of them sheds dim light out to a 5 ft radius until the ash is washed off*:
  // a light on a token, with no number on any Test and an end no clock can count.
  ashfall: "a light on the creatures caught, ended when the ash is washed off, which no clock or door can judge",
  // *A Casting Test at SL 2 or better also tells you the school*: information the
  // GM gives; the card already prints the SL beside the entry's words.
  "detect-magic": "information the GM gives at the table; the card prints the Success Level beside the entry's words"
});

/** The flat words of an entry, bold markers gone. */
function plain(effectText) {
  return flatText(effectText).replace(/\*\*/g, "");
}

/**
 * **EVERY *AT SL N OR BETTER* CLAUSE IN AN ENTRY**, sentence by sentence, through
 * the repository's one splitter: `{at, sentence}`.
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @returns {Array<{at: number, sentence: string}>}
 */
export function slClauses(effectText) {
  const out = [];
  for (const sentence of sentences(plain(effectText))) {
    const m = /\b[Aa]t SL (\d+) or better\b/.exec(sentence);
    if (m) out.push({ at: Number(m[1]), sentence });
  }
  return out;
}

/** A condition word to its id, or null where A1 has no such condition. */
function conditionOf(word) {
  const id = String(word ?? "").trim().toLowerCase();
  return Object.hasOwn(AZEROTH.conditions, id) ? id : null;
}

/** A school word to its key, or null. */
function schoolOf(word) {
  const key = String(word ?? "").trim().toLowerCase();
  return Object.hasOwn(AZEROTH.schools, key) ? key : null;
}

/** 06 §6's Tests by the word the entry uses. */
const TEST_WORDS = Object.freeze({ attack: "attack", casting: "casting" });

/**
 * **THE RIDER THIS MODULE READS OFF AN ENTRY**, or null.
 *
 * - `hitBane` `{test, banes, at: null, lastingAt}` - *The target takes N T damage
 *   and a Bane on its next Attack Test. At SL 2 or better the Bane applies to every
 *   Attack Test it makes before the end of its next turn.* The Bane lands on any
 *   hit (`at` null); at `lastingAt` it is a span rather than a count.
 * - `hitWardDrop` `{at, school, amount, until: "casterTurnEnd"}` - *At SL 3 or better
 *   its Ward against Fel drops by 1 until the end of your next turn.*
 * - `failCondition` `{at, status, span}` - *At SL 3 or better a creature that fails
 *   is Blinded until the end of its next turn* (`span` `targetNextTurnEnd`), and
 *   *At SL 3 or better it is Entangled for the first round and Slowed for the rest*
 *   (`span` `firstRound`, `then` the condition for the rest).
 * - `failNoReaction` `{at, span: "duration"}` - *At SL 3 or better it also has no
 *   Reaction for the duration.*
 * - `failDestroy` `{at, kind, tier}` - *At SL 3 or better an undead creature of tier
 *   1 that fails is destroyed outright.*
 *
 * @param {string} effectText
 * @returns {object|null}
 */
export function readSlRider(effectText) {
  const text = plain(effectText);
  let m = /\bThe target takes \d+ \w+ damage and a Bane on its next (Attack|Casting) Test\.(?:\s+At SL (\d+) or better the Bane applies to every (?:Attack|Casting) Test it makes before the end of its next turn\.)?/.exec(text);
  if (m) {
    return { kind: "hitBane", test: TEST_WORDS[m[1].toLowerCase()], banes: 1, at: null, lastingAt: m[2] ? Number(m[2]) : null };
  }
  m = /\bAt SL (\d+) or better its Ward against (\w+) drops by (\d+) until the end of your next turn\./.exec(text);
  if (m && schoolOf(m[2])) {
    return { kind: "hitWardDrop", at: Number(m[1]), school: schoolOf(m[2]), amount: Number(m[3]), until: "casterTurnEnd" };
  }
  m = /\bAt SL (\d+) or better it is (\w+) for the first round and (\w+) for the rest\./.exec(text);
  if (m && conditionOf(m[2]) && conditionOf(m[3])) {
    return { kind: "failCondition", at: Number(m[1]), status: conditionOf(m[2]), span: "firstRound", then: conditionOf(m[3]) };
  }
  m = /\bAt SL (\d+) or better a creature that fails is (\w+) until the end of its next turn\./.exec(text);
  if (m && conditionOf(m[2])) {
    return { kind: "failCondition", at: Number(m[1]), status: conditionOf(m[2]), span: "targetNextTurnEnd", then: null };
  }
  m = /\bAt SL (\d+) or better it also has no Reaction for the duration\./.exec(text);
  if (m) return { kind: "failNoReaction", at: Number(m[1]), span: "duration" };
  m = /\bAt SL (\d+) or better an? (\w+) creature of tier (\d) that fails is destroyed outright\./.exec(text);
  if (m) return { kind: "failDestroy", at: Number(m[1]), creature: m[2].toLowerCase(), tier: Number(m[3]) };
  return null;
}

/**
 * **THE SUCCESS LEVEL A RIDER READS ON ONE CREATURE** (07 §8: *A Ward comes off the
 * Success Level as well as off the damage*): the mitigation's `effectiveSL` for that
 * creature where the cast dealt it damage, else the cast's own. A spell that deals
 * no damage meets no Ward (07's Frostbite: *The spell deals no damage, so no Ward
 * applies to it*).
 *
 * @param {{effectiveSL?: number}|null} damageRow  the creature's row of the card's damage
 * @param {number} sl  the cast's Success Level
 * @returns {number}
 */
export function riderSl(damageRow, sl) {
  const at = Number(damageRow?.effectiveSL);
  return Number.isFinite(at) ? Math.trunc(at) : (Math.trunc(Number(sl)) || 0);
}

/**
 * **WHETHER A RIDER LANDS AT THIS SUCCESS LEVEL**: never on a failed Casting Test
 * (07 §8: *The spell does not go off*), whatever Overchannel added to its SL; a
 * rider with no threshold lands on any success.
 *
 * @param {{at?: number|null}|null} read
 * @param {{sl?: number, success?: boolean}} o
 * @returns {boolean}
 */
export function slRiderHolds(read, { sl = 0, success = false } = {}) {
  if (!read || success !== true) return false;
  if (read.at === null || read.at === undefined) return true;
  return (Math.trunc(Number(sl)) || 0) >= Number(read.at);
}

/**
 * **SEARING PAIN'S BANE AT THIS SUCCESS LEVEL**: a count (spent by its next Test of
 * the kind) below `lastingAt`, a span to the end of the creature's next turn at it.
 *
 * @param {{kind: string, test: string, banes: number, lastingAt: number|null}|null} read
 * @param {{sl?: number, success?: boolean}} o
 * @returns {{test: string, banes: number, lasting: boolean}|null}
 */
export function hitBaneAt(read, { sl = 0, success = false } = {}) {
  if (read?.kind !== "hitBane" || !slRiderHolds(read, { sl, success })) return null;
  const lasting = read.lastingAt !== null && read.lastingAt !== undefined && (Math.trunc(Number(sl)) || 0) >= read.lastingAt;
  return { test: read.test, banes: read.banes, lasting };
}

/**
 * **THE FAILURE RIDER THE CARD CARRIES**, or null: a fail kind, read at a cast that
 * succeeded and on a card that offers the Test. The SL is judged at the Resist, on
 * the creature that failed it (`riderSl`), so the record keeps its threshold.
 *
 * @param {object|null} read  `readSlRider`'s
 * @param {{success?: boolean, resist?: boolean}} o
 * @returns {object|null}
 */
export function failRiderRecord(read, { success = false, resist = false } = {}) {
  if (!read || !SL_FAIL_KINDS.includes(read.kind) || success !== true || resist !== true) return null;
  return { ...read };
}

/**
 * **A RECORD OFF A CARD, CLEANED**, or null where it says nothing this can land.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function cleanFailRider(raw) {
  if (!raw || typeof raw !== "object" || !SL_FAIL_KINDS.includes(raw.kind)) return null;
  const at = Math.trunc(Number(raw.at));
  if (!Number.isFinite(at)) return null;
  if (raw.kind === "failCondition") {
    const status = conditionOf(raw.status);
    if (!status || !["firstRound", "targetNextTurnEnd"].includes(raw.span)) return null;
    return { kind: raw.kind, at, status, span: raw.span, then: conditionOf(raw.then) };
  }
  if (raw.kind === "failNoReaction") return { kind: raw.kind, at, span: "duration" };
  const tier = Math.trunc(Number(raw.tier));
  if (!Number.isFinite(tier) || typeof raw.creature !== "string" || !raw.creature) return null;
  return { kind: raw.kind, at, creature: raw.creature, tier };
}

/**
 * **WHETHER TURN UNDEAD DESTROYS THIS CREATURE** (MY READING, for the lead: *an
 * undead creature of tier 1* is one of that kind whose tier is exactly 1; a creature
 * with no tier recorded is not destroyed).
 *
 * @param {{creature: string, tier: number}|null} rider
 * @param {{kinds?: Iterable<string>, tier?: number|null}} o  `kinds` as
 *   `rules/creature-kinds.mjs#kindsOf` answers them (a Set) or a list
 * @returns {boolean}
 */
export function destroysCreature(rider, { kinds = [], tier = null } = {}) {
  if (!rider || rider.kind !== "failDestroy") return false;
  if (!new Set(kinds ?? []).has(rider.creature)) return false;
  return Number.isFinite(Number(tier)) && tier !== null && Math.trunc(Number(tier)) === rider.tier;
}

/**
 * **THE CONDITIONS AN ENTRY NAMES ONLY INSIDE AN *AT SL N* CLAUSE**: never an
 * Apply's to lay regardless of the Success Level. Frostbite's pack copy laid its
 * *Entangled for the first round* on every Apply, a pass or a failure, at any SL.
 *
 * @param {string} effectText
 * @returns {string[]}
 */
export function slGatedStatuses(effectText) {
  const gated = new Set();
  const free = new Set();
  for (const sentence of sentences(plain(effectText))) {
    const inClause = /\b[Aa]t SL \d+ or better\b/.test(sentence);
    for (const id of Object.keys(AZEROTH.conditions)) {
      if (!new RegExp(`\\b${id}\\b`, "i").test(sentence)) continue;
      (inClause ? gated : free).add(id);
    }
  }
  return [...gated].filter(id => !free.has(id)).sort();
}
