/**
 * AN AREA THAT STRIKES AT THE START OF A TURN (D-756; the lead's play-test,
 * 2026-09-25), AND WHAT IT DOES TO A CREATURE ENTERING IT OR STANDING IN IT
 * (D-757). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 07's Consecration reads *An enemy takes 2 Holy damage when it starts its
 * turn inside the area, and an undead creature takes 3 instead.* The card
 * applied the 2 to whoever was TARGETED at the cast and nothing ever happened
 * at anybody's turn. Eighteen area spells with a **Damage** field were that
 * shape, and five more heal the same way. The damage belongs to the TICK: no
 * damage on the cast, and a creature starting its turn in an area that still
 * stands takes it then.
 *
 * ## The descriptor, `system.areaTick` on every spell
 *
 *   who        "enemy" | "creature" | "ally" | ""   the SUBJECT of 07's own
 *              sentence, read literally (the lead): *an enemy* is an enemy of
 *              the CASTER, *a creature* is EVERY creature - allies and the
 *              caster included - and *an ally* is an ally
 *              (`distance.mjs#countsAsAlly`) or the caster standing in their
 *              own area (the lead, 2026-09-26: *the caster counts as an ally
 *              unless the spell specifically says "other than you"*;
 *              `whoIncludes`). "" is a spell with no descriptor.
 *   damage     {rating, school}   the base clause's damage; nulls where none
 *   heal       n | null           the base clause's healing
 *   against    [{kinds, who, rating, school, heal, instead}]   a clause for a
 *              KIND of creature (`creature-kinds.mjs`): *and an undead
 *              creature takes 3 instead* (`instead`: it REPLACES the base
 *              clause and is scoped by the base's subject), or its own
 *              sentence, which stands beside the base. `who` is the subject
 *              that sentence names for itself: *An undead or demon enemy that
 *              starts its turn in the area takes 4 Holy damage* reaches an
 *              ENEMY of the caster and nobody else (the lead, 2026-09-26),
 *              while *A demon standing in it* names none ("") and reaches a
 *              demon whoever it stands with. An `instead` row carries "".
 *   centre     "area" | "self"    a placed Region, or the caster's own token
 *              (Immolation, Tree of Life), measured through
 *              `canvas/footprints.mjs` and never a Region
 *   feet       n | null           how far a self-centred tick reaches
 *   onEnter    whether the area does something to a creature ENTERING it
 *   test       {resilience}       the Test the start-of-turn clause is MADE
 *              OF: Thornguard's damage waits on its failure, Starweave's
 *              Slowed does. A base clause that is a Test lands nothing through
 *              `tickFor`; its `checks` row posts the Resist card.
 *   difficult  whether the effect names Difficult ground at all (D-756's
 *              reading, kept as it stood). **The movement cost reads
 *              `system.areaGround`** (D-757), which reads each sentence and
 *              is on every spell, never this.
 *   lasts      {rounds}           a timed area's span, off the Duration: *1
 *              minute* is 05's ten rounds. Null for a Sustain, which lasts
 *              as long as it is held.
 *   enter      {rating, school, once, rounds, sl}   damage on ENTERING (D-757):
 *              *and again the first time it enters the area on a turn* (Rain
 *              of Fire, Wall of Flame, Doomfall, Starfall: `once`), and
 *              Flamestrike's and Rain of Chaos's *a creature that enters the
 *              area before the end of your next turn* (`rounds: 1`; Rain of
 *              Chaos only `sl` 3 or better). Nulls where there is none.
 *   checks     [{on, resilience, where, gate, exempt, fail, success}]
 *              the Resilience Tests a creature makes at the start of its turn
 *              in the area or on entering it (D-757). A Bane on the Test is
 *              never the check's: Rimebind's *with a Bane* is its own *every Test
 *              a creature makes while it stands in the area has a Bane*, which
 *              the `remains` row lays and the dialog reads. `on` "turn" | "enter" |
 *              "both"; `fail` `{rating, school, statuses, bane, until, lose,
 *              kinds: [{kinds, not, statuses}]}`; `success` `{statuses,
 *              until}`; `until` "" | "leaves" | "casterTurnStart" |
 *              "endOfNextTurn"; `where` "" | "centre"; `gate` "" |
 *              "holds:<identifier>"; `exempt` "" | "caster".
 *   remains    [{when, who, kinds, exceptKinds, gear, bane, ward, boonAgainst,
 *              speed, healing, standFree}]   what stands on a creature WHILE it
 *              remains in the area (D-757): `when` "inside" (from the moment it
 *              is inside), "turn" (once it has started a turn there) or
 *              "turnEnd" (once it has ended one there, Slagfall). The aura
 *              door lays them (`effects/auras.mjs`, `centre: "region"`).
 *   grows      feet the area grows at the start of each of the caster's turns
 *              (Hoarfrost), or null
 *   excludesCaster   the base sentence says *other than you*
 *   retaliate  the base clause also strikes a creature that hits the caster
 *              with a melee attack (Immolation)
 *   reason     every clause of the area's rule the machinery cannot express,
 *              "; "-joined, counted under a CEILING in `area-ticks.test.mjs`
 *              that may only fall.
 *
 * **Every leaf is present on every spell**, nulls and all, the way `damage`,
 * `test` and `heal` already are on the spell model: the parser stamps the
 * whole shape (key order is what `check-packs.mjs` diffs) and the model cleans
 * only what it is handed (`cleanAreaTick`, CLAUDE.md §15).
 */

import { AZEROTH } from "../config.mjs";
import { flatText, sentences } from "./spell-effects.mjs";
import { areaFor } from "./areas.mjs";
import { CREATURE_KINDS } from "./creature-kinds.mjs";
import { countsAsAlly, countsAsEnemy } from "./distance.mjs";
// *Other than you* (the lead, 2026-09-26): the one reading of the words, which
// the aura door and this share.
import { excludesHolder } from "./auras.mjs";
// 05 §12's upkeep, read once (D-778): the turn's start charges it, Health and all.
import { isUpkeepSentence } from "./upkeep.mjs";
// A forced move an area makes (D-778): Tempest's push on entering, Void Rift's
// pull at the start of a turn - read by the one reader, so the clause is no reason.
import { readForced } from "./forced-movement.mjs";
// The Test 07 gives a held creature at the end of its turns (D-778).
import { readEscape } from "./escapes.mjs";

/** The kinds a clause may name (D-753): `creature-kinds.mjs#kindsOf` answers them. */
export const AREA_TICK_KINDS = CREATURE_KINDS;

/** The subjects 07 writes. */
export const AREA_TICK_WHO = Object.freeze(["enemy", "creature", "ally"]);

/** When a Test is made: at the start of the creature's turn, on entering, or both (D-757). */
export const AREA_CHECK_ON = Object.freeze(["turn", "enter", "both"]);

/**
 * How long what a failed Test lands lasts (D-757), in 07's own phrases:
 * *until it leaves*, *until the start of your next turn* (the CASTER's),
 * *until the end of its next turn*, or "" - the condition's own **Ends** (A1).
 */
export const AREA_UNTIL = Object.freeze(["", "leaves", "casterTurnStart", "endOfNextTurn"]);

/** When a creature starts carrying what an area lays while it remains (D-757). */
export const AREA_REMAINS_WHEN = Object.freeze(["inside", "turn", "turnEnd"]);

/**
 * A1's own **Ends** where a Test's failure lands a condition and 07 names no
 * span: *Stunned ... Ends At the end of your next turn, unless the source says
 * otherwise*. The rest end by their own rule (Prone by standing, Entangled by
 * an action and a Test) and carry no clock.
 */
export const CONDITION_DEFAULT_ENDS = Object.freeze({ stunned: "endOfNextTurn" });

/** 05's time table: *Round - ~6 seconds*, *Minute - 10 rounds*. The test reads both off the chapter. */
export const ROUND_SECONDS = 6;
export const ROUNDS_PER_MINUTE = 10;

/** No damage on entering: the whole shape. */
export function emptyEnter() {
  return { rating: null, school: null, once: false, rounds: null, sl: null };
}

/** A Test clause, every leaf present. */
export function emptyCheck() {
  return {
    on: "turn",
    resilience: null,
    where: "",
    gate: "",
    exempt: "",
    fail: { rating: null, school: null, statuses: [], bane: "", until: "", lose: false, kinds: [] },
    success: { statuses: [], until: "" }
  };
}

/** A rider an area lays while a creature remains in it, every leaf present. */
export function emptyRemains() {
  return {
    when: "inside",
    who: "creature",
    kinds: [],
    exceptKinds: [],
    gear: "",
    bane: "",
    ward: { schools: [], amount: null },
    boonAgainst: [],
    speed: null,
    healing: "",
    standFree: false
  };
}

/** A spell with no descriptor: the whole shape, every leaf empty. */
export function emptyAreaTick() {
  return {
    who: "",
    damage: { rating: null, school: null },
    heal: null,
    against: [],
    centre: "area",
    feet: null,
    onEnter: false,
    test: { resilience: null },
    difficult: false,
    lasts: { rounds: null },
    enter: emptyEnter(),
    checks: [],
    remains: [],
    grows: null,
    excludesCaster: false,
    retaliate: false,
    reason: ""
  };
}

/** Whether a stored descriptor is a tick at all. */
export function hasAreaTick(tick) {
  return Boolean(tick && typeof tick === "object" && AREA_TICK_WHO.includes(tick.who));
}

const SCHOOL = new Map(Object.keys(AZEROTH.schools).map(k => [k.charAt(0).toUpperCase() + k.slice(1), k]));
const RESILIENCE = new Map(Object.keys(AZEROTH.resiliences).map(k => [k.charAt(0).toUpperCase() + k.slice(1), k]));
const schoolOf = word => SCHOOL.get(String(word ?? "")) ?? null;

/** Every `**Condition**` named in a run of text, as ids, in order and once. */
function conditionsIn(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/\*\*([A-Za-z]+)\*\*/g)) {
    const id = m[1].toLowerCase();
    if (AZEROTH.conditions?.[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

/** An identifier off a spell's name, as the pack keys it: "Starfall" -> "starfall". */
function slug(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * A start-of-turn clause in an area: the TIME (*starts its turn*, *at the
 * start of each of its turns*) and the PLACE (*inside the area*, *in the
 * line*, *in it*, *within 30 feet*, *there*, *at the center*). Cataclysm's
 * burning and Light Unending's healing name the time and no place - they are
 * on the creature, not in the area, and are not ticks (O-144).
 */
const START = /\b(?:starts|begins) (?:its|their) turns?\b|\bat the start of (?:each of )?(?:its|their) turns?\b/i;
const WHERE = /\binside\b|\bin (?:the area|the line|it)\b|\bwithin \d+ feet\b|\bthere\b|\bat the center\b/i;

/** Whether a sentence is one of those: what the census counts. */
export function isStartOfTurnSentence(sentence) {
  return START.test(sentence) && WHERE.test(sentence) && !isUpkeep(sentence);
}

/**
 * 05 §12's upkeep, which every sustained entry restates: the caster's turn, not
 * the area's. Exported for `rules/ticks.mjs`, whose census skips it too (D-770).
 * **Its Health forms too** (D-778): Felfire Aura's *2 Mana and 1 Health* and
 * Felstep's *2 Health ... rather than Mana* are upkeep the turn's start charges
 * now (`rules/upkeep.mjs`), never a per-turn sentence a tick leaves unread.
 */
export function isUpkeep(sentence) {
  return isUpkeepSentence(sentence);
}

/*
 * THE BASE CLAUSE, in 07's own grammar. Each shape is a sentence the chapter
 * writes; one it does not know leaves the spell without a tick, and the census
 * - which reads the chapter with the looser `isStartOfTurnSentence` - fails on
 * it by name rather than letting the damage go back to the cast unseen.
 */
const BASE = [
  // *A creature takes 2 Fire damage when it starts its turn inside the area*,
  // *An enemy takes 2 Holy damage when it starts its turn inside the area*.
  s => {
    const m = /^(A creature|An enemy) takes (\d+) ([A-Z][a-z]+) damage when it starts its turn (?:inside the area|in the area|in the line)\b/.exec(s);
    return m ? { who: m[1] === "An enemy" ? "enemy" : "creature", damage: { rating: Number(m[2]), school: schoolOf(m[3]) } } : null;
  },
  // *Every creature in the area takes 4 Frost damage at the start of each of its turns*.
  s => {
    const m = /^Every creature in the area takes (\d+) ([A-Z][a-z]+) damage at the start of each of its turns\b/.exec(s);
    return m ? { who: "creature", damage: { rating: Number(m[1]), school: schoolOf(m[2]) } } : null;
  },
  // Immolation: *A creature that starts its turn within 5 feet of you, or that
  // hits you with a melee attack, takes 2 Fire damage.*
  s => {
    const m = /^A creature that starts its turn within (\d+) feet of you\b[^.]*?\btakes (\d+) ([A-Z][a-z]+) damage\b/.exec(s);
    return m ? { who: "creature", centre: "self", feet: Number(m[1]), damage: { rating: Number(m[2]), school: schoolOf(m[3]) } } : null;
  },
  // *An ally regains 3 Health when it starts its turn inside the area*, *An
  // ally that starts its turn in the area regains 4 Health*.
  s => {
    const m = /^An ally (?:that starts its turn (?:in|inside) the area )?regains (\d+) Health\b(?: when it starts its turn (?:in|inside) the area\b)?/.exec(s);
    if (!m) return null;
    if (!/starts its turn (?:in|inside) the area/.test(s)) return null;
    return { who: "ally", heal: Number(m[1]) };
  },
  // Tree of Life: *every ally within 30 feet regains 4 Health at the start of
  // each of their turns*.
  s => {
    const m = /\bevery ally within (\d+) feet regains (\d+) Health at the start of each of their turns\b/.exec(s);
    return m ? { who: "ally", centre: "self", feet: Number(m[1]), heal: Number(m[2]) } : null;
  },
  // A base clause that is a TEST: *A creature that enters the area or starts
  // its turn inside it makes a Reflex Resilience Test*, *While you hold both,
  // a creature that starts its turn in the area makes a Spirit Resilience
  // Test*, *A creature that is not native to fire and begins its turn in the
  // area makes a Body Resilience Test*.
  s => {
    const m = /^(?:While you hold both, )?[Aa] creature (?:that is not native to fire and |that )?(?:enters the area or )?(?:starts|begins) its turn (?:inside it|inside|in the area|in it|there)\b[^.]*?\b(?:makes|must pass) an? (Body|Reflex|Spirit) Resilience Test\b/.exec(s);
    return m ? { who: "creature", test: { resilience: RESILIENCE.get(m[1]) ?? null } } : null;
  },
  // Glacier: *…and a creature that begins its turn in it makes the Test again
  // or is Slowed* - THE Test being the entry's own **Test** field.
  (s, fields) => {
    if (!/\ba creature that begins its turn in it makes the Test again\b/.test(s)) return null;
    return { who: "creature", test: { resilience: fields?.test?.resilience ?? null } };
  }
];

/** Thornguard's second sentence: the damage the base Test's FAILURE lands. */
const ON_FAILURE = /^On a failure it takes (\d+) ([A-Z][a-z]+) damage\b/;

/*
 * THE KIND CLAUSES. `instead` is the book's word: *and an undead creature
 * takes 3 instead* refines the enemy clause beside it, and Graveblight's
 * *regains 4 Health at the start of its turn instead* replaces the creature
 * clause before it. The others are their own sentences, and reach a creature
 * of the kind whoever it stands with.
 */
const KIND = [
  s => {
    const m = /, and an? (undead creature|demon) takes (\d+) instead\b/.exec(s);
    return m ? { kinds: [kindWord(m[1])], who: "", rating: Number(m[2]), school: null, heal: null, instead: true } : null;
  },
  s => {
    const m = /^An? (undead creature|demon) inside the area regains (\d+) Health at the start of its turn instead\b/.exec(s);
    return m ? { kinds: [kindWord(m[1])], who: "", rating: null, school: null, heal: Number(m[2]), instead: true } : null;
  },
  // Hallowed Ground: *An undead or demon enemy that starts its turn in the area
  // takes 4 Holy damage* - an ENEMY of the caster, and no ally whatever it is
  // (the lead, 2026-09-26: an allied Forsaken, a warlock's bound Imp and a
  // Forsaken Paladin in their own Hallowed Ground are treated as allies).
  s => {
    const m = /^An undead or demon enemy that starts its turn in the area takes (\d+) ([A-Z][a-z]+) damage\b/.exec(s);
    return m ? { kinds: ["undead", "demon"], who: "enemy", rating: Number(m[1]), school: schoolOf(m[2]), heal: null, instead: false } : null;
  },
  s => {
    const m = /^(?:A demon standing in it|Any demon inside it) regains (\d+) Health at the start of each of its turns\b/.exec(s);
    return m ? { kinds: ["demon"], who: "", rating: null, school: null, heal: Number(m[1]), instead: false } : null;
  }
];

function kindWord(word) {
  return /undead/i.test(word) ? "undead" : "demon";
}

/* -------------------------------------------- */
/*  Entering (D-757)                             */
/* -------------------------------------------- */

/*
 * 07's damage ON ENTERING, in its four shapes. The first three are a creature
 * struck again the first time it enters on a turn; the last two strike every
 * entry inside a span of one round after the cast.
 */
const ENTER_AGAIN = /\band again the first time it enters (?:the area|or crosses the line) on a turn\b/i;
const ENTER_SAME = /\btakes (\d+) ([A-Z][a-z]+) damage\b[^.]*?\ba creature takes the same the first time it enters the area on a turn\b/;
const ENTER_WINDOW = /^A creature that enters the area before the end of your next turn takes (\d+) ([A-Z][a-z]+) damage\b/;
const ENTER_SL = /^At SL (\d+) or better the ground burns until the end of your next turn and a creature entering it takes (\d+) ([A-Z][a-z]+) damage\b/;

/** The damage a creature takes on entering, or null. `base` is the base clause's damage. */
function readEnter(list, base) {
  for (const s of list) {
    if (ENTER_AGAIN.test(s) && base?.rating !== null && base?.rating !== undefined) {
      return { rating: base.rating, school: base.school ?? null, once: true, rounds: null, sl: null };
    }
    let m = ENTER_SAME.exec(s);
    if (m) return { rating: Number(m[1]), school: schoolOf(m[2]), once: true, rounds: null, sl: null };
    m = ENTER_WINDOW.exec(s);
    if (m) return { rating: Number(m[1]), school: schoolOf(m[2]), once: false, rounds: 1, sl: null };
    m = ENTER_SL.exec(s);
    if (m) return { rating: Number(m[2]), school: schoolOf(m[3]), once: false, rounds: 1, sl: Number(m[1]) };
  }
  return null;
}

/* -------------------------------------------- */
/*  The Tests (D-757)                            */
/* -------------------------------------------- */

/** When a sentence's Test is made: on entering, at the start of a turn, or both; null where it is no such clause. */
function checkTrigger(s) {
  if (/^(?:While you hold both, )?[Aa] creature that enters the area or (?:starts|begins) its turn (?:inside it|there|in it|inside|in the area)\b/.test(s)) return "both";
  if (/^A creature that enters the area\b(?! or)/.test(s)) return "enter";
  if (/\b(?:[Aa] creature|one) that (?:is not native to fire and )?(?:starts|begins) its turn (?:in the area|inside|in it|there|at the center)\b/.test(s)) return "turn";
  return null;
}

/** The Test a sentence makes: a named Resilience, or *the same Test* / *the Test again* - the entry's own. */
const CHECK_TEST = /\b(?:makes|must pass) an? (Body|Reflex|Spirit) Resilience Test against your Spell DC\b|\bmakes the (?:same )?Test(?: again)?\b/;

/** 07's span phrases, as `AREA_UNTIL` words. */
function untilIn(text) {
  if (/\buntil it leaves\b/i.test(text)) return "leaves";
  if (/\buntil the start of your next turn\b/i.test(text)) return "casterTurnStart";
  if (/\buntil the end of its next turn\b/i.test(text)) return "endOfNextTurn";
  return "";
}

/**
 * What a failed Test lands, off the words AFTER the Test in its own sentence:
 * *or be **Entangled***, *or be knocked **Prone***, *or is **Slowed** until it
 * leaves*, *or has a Bane on Attack Tests until the end of its next turn*, *or
 * loses its turn*, and The Deep's *: on a failure it is ... and on a success
 * it is **Slowed** only*. Null where the sentence states no outcome of its own.
 */
function outcomeInSentence(rest) {
  const deep = /^:? ?on a failure it is (.+?) (until it leaves|until the end of its next turn|until the start of your next turn)?, and on a success it is (.+?) only\b/i.exec(rest.replace(/^[:,]\s*/, ""));
  if (deep) {
    const until = untilIn(deep[2] ?? "");
    return {
      fail: { statuses: conditionsIn(deep[1]), until },
      success: { statuses: conditionsIn(deep[3]), until }
    };
  }
  const or = /\bor (?:be |is )?(.+)$/i.exec(rest);
  if (!or) return null;
  // Everything up to the next clause of the same sentence (*, and the area is
  // Difficult ground*), which is the area's own and never the failure's.
  const clause = or[1].split(/, and (?!on a success)/)[0];
  if (/^has a Bane on Attack Tests\b/i.test(clause)) return { fail: { bane: "attack", until: untilIn(clause) } };
  if (/^loses its turn\b/i.test(clause)) return { fail: { lose: true } };
  const statuses = conditionsIn(clause);
  return statuses.length ? { fail: { statuses, until: untilIn(clause) } } : null;
}

/**
 * The outcome a check with none of its own takes from the sentences around it:
 * *On a failure it takes 4 Nature damage and is **Entangled*** (Thornguard, and
 * Rimebind's cast), *A demon that fails is **Frightened***, *Anything that is
 * not a demon and fails is **Stunned**, ...* (Nether Collapse).
 */
function outcomeAround(list) {
  const fail = { rating: null, school: null, statuses: [], kinds: [] };
  let found = false;
  for (const s of list) {
    const damage = /^On a failure it takes (\d+) ([A-Z][a-z]+) damage(?: and is (?:knocked )?(.*))?$/.exec(s);
    if (damage && fail.rating === null) {
      fail.rating = Number(damage[1]);
      fail.school = schoolOf(damage[2]);
      // Up to the next clause: *, and it may repeat the Test ...* is the escape, not the failure.
      fail.statuses = conditionsIn((damage[3] ?? "").split(/, and /)[0]);
      found = true;
      continue;
    }
    const demon = /^A demon that fails is (.+)$/.exec(s);
    if (demon) {
      fail.kinds.push({ kinds: ["demon"], not: false, statuses: conditionsIn(demon[1].split(/ and may\b/)[0]) });
      found = true;
      continue;
    }
    const other = /^Anything that is not a demon and fails is (.+)$/.exec(s);
    if (other) {
      fail.kinds.push({ kinds: ["demon"], not: true, statuses: conditionsIn(other[1].split(/, because\b/)[0]) });
      found = true;
    }
  }
  return found ? fail : null;
}

/**
 * **EVERY RESILIENCE TEST A CREATURE MAKES IN THE AREA** - at the start of its
 * turn there, on entering it, or both - with what a failure (and The Deep's
 * success) lands. One row a clause. A clause whose only outcome is forced
 * movement (Tempest's push) is not one: moving a token is the table's, and the
 * clause stays a reason.
 */
function readChecks(list, fields = {}, body = "") {
  const out = [];
  const exempt = /\bYou and any creature you name as you cast\b/.test(body) ? "caster" : "";
  const holds = /\bWhile you hold both\b/.test(body) ? /\bsustaining \*\*([^*]+)\*\*/.exec(body) : null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const on = checkTrigger(s);
    if (!on) continue;
    const test = CHECK_TEST.exec(s);
    if (!test) continue;
    const resilience = test[1] ? (RESILIENCE.get(test[1]) ?? null) : (fields?.test?.resilience ?? null);
    if (!resilience) continue;
    const row = emptyCheck();
    row.on = on;
    row.resilience = resilience;
    row.where = /\bat the center\b/.test(s) ? "centre" : "";
    row.gate = holds && /\bWhile you hold both\b/.test(s) ? `holds:${slug(holds[1])}` : "";
    row.exempt = exempt;
    const inSentence = outcomeInSentence(s.slice(test.index + test[0].length));
    if (inSentence) {
      Object.assign(row.fail, inSentence.fail ?? {});
      if (inSentence.success) row.success = { statuses: inSentence.success.statuses ?? [], until: inSentence.success.until ?? "" };
    } else {
      // *makes the same Test* reads the entry's own failure wherever it stands;
      // a Test of its own reads the sentences after it.
      const around = outcomeAround(test[1] ? list.slice(i + 1) : list);
      if (!around) continue;
      Object.assign(row.fail, around);
    }
    const lands = row.fail.rating !== null || row.fail.statuses.length || row.fail.bane || row.fail.lose || row.fail.kinds.length || row.success.statuses.length;
    if (lands) out.push(row);
  }
  return out;
}

/* -------------------------------------------- */
/*  While it remains (D-757)                     */
/* -------------------------------------------- */

/** Who a rider's sentence names, off its subject. */
function riderSubject(s) {
  const enemy = /^An? (undead or demon )?enemy\b/.exec(s);
  if (enemy) return { who: "enemy", kinds: enemy[1] ? ["undead", "demon"] : [] };
  if (/^An ally\b/.test(s)) return { who: "ally", kinds: [] };
  return { who: "creature", kinds: [] };
}

/**
 * **WHAT STANDS ON A CREATURE WHILE IT REMAINS**, one row a sentence: a Bane on
 * Attack Tests (Insect Swarm, Hallowed Ground's enemies, Crucible), a Ward
 * gained and a Boon against conditions (Hallowed Ground's allies), a Speed
 * that drops (Hoarfrost, Slagfall), healing halved (Graveblight), standing
 * from Prone for nothing (Tidecall), and a Bane on every Test (Rimebind).
 *
 * `when` is the sentence's own time: *that starts its turn there* - the rider
 * begins at the start of a turn in the area; *that ends its turn there* - at
 * the end of one (Slagfall); *inside it* with no turn named - from the moment
 * it is inside.
 */
function readRemains(list, against = []) {
  const out = [];
  // Graveblight's *An undead creature ... regains 4 Health ... instead*: the
  // clause it replaces is the base's, halving included (the implementer's
  // reading, D-757).
  const insteadKinds = [...new Set(against.filter(r => r.instead).flatMap(r => r.kinds))];
  for (const s of list) {
    const row = emptyRemains();
    const subject = riderSubject(s);
    row.who = subject.who;
    row.kinds = subject.kinds;
    let any = false;
    if (/\bhas a Bane on (?:its )?Attack Tests while it remains\b/.test(s)) { row.bane = "attack"; any = true; }
    if (/^Every Test a creature makes while it stands in the area has a Bane\b/.test(s)) { row.bane = "all"; any = true; }
    const ward = /\bgains Ward (\d+) against ([A-Z][a-z]+)(?: and Ward \1 against ([A-Z][a-z]+))? until it leaves\b/.exec(s);
    if (ward) {
      row.ward = { schools: [schoolOf(ward[2]), schoolOf(ward[3])].filter(Boolean), amount: Number(ward[1]) };
      any = true;
    }
    const boon = /\bhas a Boon on Resilience Tests against ((?:\*\*[A-Za-z]+\*\*(?:,? (?:and|or) |, )?)+)/.exec(s);
    if (boon) { row.boonAgainst = conditionsIn(boon[1]).sort(); any = true; }
    const speed = /\b(?:its Speed drops|has its Speed drop) by (\d+) feet until it leaves\b/.exec(s);
    if (speed) { row.speed = -Number(speed[1]); any = true; }
    if (/\bhealing it receives while inside is halved\b/.test(s)) {
      row.healing = "half";
      row.exceptKinds = insteadKinds;
      any = true;
    }
    if (/\bmay stand from \*\*Prone\*\* without spending movement\b/.test(s)) { row.standFree = true; any = true; }
    if (!any) continue;
    if (/\bwearing metal armor or holding a metal weapon\b/.test(s)) row.gear = "metal";
    // *Healing it receives WHILE INSIDE is halved* names its own time, whatever
    // the turn clause beside it says: the halving is there the moment it is.
    row.when = row.healing === "half" ? "inside"
      : /\bthat ends its turn there\b/.test(s) ? "turnEnd"
        : /\b(?:starts|begins) its turn\b/.test(s) ? "turn"
          : "inside";
    out.push(row);
  }
  return out;
}

/**
 * WHAT THE MACHINERY CANNOT DO, clause by clause. Each is read off the effect
 * as 07 writes it, and each phrase is one count under the test's ceiling -
 * **unless `covered` says the descriptor carries it** (D-757 built the
 * entering, the Tests and the riders, and a clause it carries is no reason). A
 * clause about the area's EDGE or its light, or about the cast itself (*must
 * already be burning*, *The Doomfall ends*), is not a tick's and is not listed.
 */
export const UNEXPRESSED = Object.freeze([
  { key: "entering", re: /\bagain the first time it enters\b|\bthe first time it enters the area on a turn\b/i, text: "damage again the first time it enters on a turn", covered: t => t.enter.rating !== null },
  // Tempest's entering Test, whose only outcome is the push, is the forced move's
  // own (D-778: `rules/forced-movement.mjs#readForced`, `on: "enter"`).
  { key: "enterTest", re: /\benters the area (?:must pass|or (?:starts|begins) its turn)\b|\bwhen it first enters\b|\benters the area for the duration makes\b/i, text: "a Resilience Test on entering", covered: (t, body) => t.checks.some(c => c.on !== "turn") || readForced(body)?.on === "enter" },
  { key: "turnTest", re: /\b(?:starts|begins) its turn (?:in|inside|there|at)\b[^.]*?\b(?:makes|must pass) (?:a|an|the) (?:\w+ )?(?:Resilience )?Test\b/i, text: "a Resilience Test at the start of the turn", covered: t => t.checks.some(c => c.on !== "enter") },
  { key: "remainsBane", re: /\bBane on (?:its )?Attack Tests while it remains\b/i, text: "a Bane on Attack Tests while it remains", covered: t => t.remains.some(r => r.bane === "attack") },
  { key: "metal", re: /\bwearing metal armor or holding a metal weapon\b/i, text: "a metal weapon is the table's to judge: 08 records no material", covered: () => false },
  { key: "remainsWard", re: /\bWard \d+ against [^.]*?until it leaves\b/i, text: "a Ward while it remains", covered: t => t.remains.some(r => r.ward.amount !== null) },
  { key: "remainsBoon", re: /\bBoon on Resilience Tests against\b/i, text: "a Boon on Resilience Tests while it remains", covered: t => t.remains.some(r => r.boonAgainst.length) },
  { key: "remainsSpeed", re: /\bSpeed drops? by \d+ feet until it leaves\b/i, text: "Speed drops while it remains", covered: t => t.remains.some(r => r.speed !== null) },
  { key: "halvedHealing", re: /\bhealing it receives while inside is halved\b/i, text: "healing received inside is halved", covered: t => t.remains.some(r => r.healing === "half") },
  { key: "growth", re: /\bgrows by \d+ feet\b/i, text: "the area grows at the start of each of the caster's turns", covered: t => t.grows !== null },
  { key: "moves", re: /\bmove the area up to \d+ feet\b/i, text: "the caster may move the area", covered: () => false },
  { key: "conditionEnds", re: /\bone (?:condition|poison or one disease) on it ends\b/i, text: "a condition on it ends", covered: () => false },
  { key: "drink", re: /\bdrinks from it\b/i, text: "an ally drinking from it as an action", covered: () => false },
  { key: "standFree", re: /\bstand from \*\*Prone\*\* without spending movement\b/i, text: "standing from Prone costs no movement", covered: t => t.remains.some(r => r.standFree) },
  { key: "retaliate", re: /\bhits you with a melee attack\b/i, text: "damage to a creature that hits the caster in melee", covered: t => t.retaliate },
  // Tempest's push and Void Rift's pull (D-778; the lead: *"Yes."*): read by
  // `readForced` and landed by the forced-movement door. Nether Rift's pull at the
  // CASTER's turn is not (`FORCED_UNREAD`).
  { key: "forced", re: /\b(?:pulled|pushed) \d+ feet toward\b/i, text: "forced movement", covered: (t, body) => ["enter", "turn"].includes(readForced(body)?.on) },
  { key: "held", re: /\bcannot leave the area without a second success\b/i, text: "a creature that failed cannot leave without a second success", covered: () => false },
  { key: "named", re: /\bany creature you name as you cast\b/i, text: "the creatures named at the cast", covered: () => false },
  { key: "native", re: /\bnot native to fire\b/i, text: "a creature native to fire makes no Test: the table's to judge", covered: () => false },
  // Rimebind's and Thornguard's (D-778; the lead: *"Yes."*): the Entangled a
  // failure lands carries its escape, offered at the end of each of its turns
  // (`rules/escapes.mjs`). A repeat that ends another condition is still the table's.
  { key: "repeat", re: /\bmay repeat the Test at the end of each of its turns\b/i, text: "the Test repeated at the end of each of its turns to end it", covered: (t, body, fields) => Boolean(readEscape(body, fields)) },
  { key: "further", re: /\bmay not willingly move further in\b/i, text: "a demon that fails may not willingly move further in", covered: () => false },
  { key: "casterChoice", re: /\bone creature of your choice inside the area\b|\bstrikes two creatures each turn\b/i, text: "a creature of the caster's choice struck at the caster's turns", covered: () => false },
  { key: "everyTest", re: /\bEvery Test a creature makes while it stands in the area has a Bane\b/i, text: "a Bane on every Test made inside", covered: t => t.remains.some(r => r.bane === "all") }
]);

/** 07's Duration as rounds: *Instant, 1 minute* is ten (05's table). Null for anything untimed. */
export function roundsIn(duration = {}) {
  if (duration?.kind !== "timed") return null;
  const m = /(\d+)\s*(minute|hour|round)s?\b/i.exec(String(duration?.text ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "round") return n;
  if (unit === "minute") return n * ROUNDS_PER_MINUTE;
  return n * 60 * ROUNDS_PER_MINUTE;
}

/**
 * **READ THE DESCRIPTOR OFF 07's OWN WORDS.** The parser stamps what this
 * returns on every spell (`tools/parse-book/spells.mjs`), so the pack, the
 * migration and a Forge-less world all carry the same descriptor.
 *
 * A spell has one where it places an area (or is Self) and says something
 * about a creature in it: a start-of-turn clause (D-756), damage or a Test on
 * entering, a Test at the start of a turn, or a rider while it remains (D-757).
 * A spell whose only such clause is not the start of a turn - Flamestrike's
 * entering damage, Rimebind's entering Test - reads `who` as *a creature*,
 * which is what every one of them writes.
 *
 * @param {string} effectText  the effect, HTML or flat
 * @param {{target?: string, duration?: {kind?: string|null, text?: string},
 *   damage?: {rating?: number|null, school?: string|null},
 *   test?: {resilience?: string|null}}} [fields]  07 §9's own fields; the
 *   **Test** is what *makes the Test again* names
 * @returns {ReturnType<typeof emptyAreaTick>|null}  null where the spell has no descriptor
 */
export function readAreaTick(effectText, fields = {}) {
  const target = String(fields?.target ?? "").trim();
  const self = /^self$/i.test(target);
  if (!areaFor(target) && !self) return null;
  const text = flatText(effectText);
  const list = sentences(text).filter(s => !isUpkeep(s));
  const body = list.join(" ");

  const tick = emptyAreaTick();
  let found = false;
  let baseSentence = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!found) {
      for (const shape of BASE) {
        const base = shape(s, fields);
        if (!base) continue;
        found = true;
        baseSentence = s;
        tick.who = base.who;
        if (base.damage) tick.damage = { rating: base.damage.rating, school: base.damage.school };
        if (base.heal !== undefined) tick.heal = base.heal;
        if (base.centre) tick.centre = base.centre;
        if (base.feet !== undefined) tick.feet = base.feet;
        if (base.test) {
          tick.test = { resilience: base.test.resilience };
          // Thornguard: the damage is the Test's failure, in the next sentence.
          const failed = ON_FAILURE.exec(list[i + 1] ?? "");
          if (failed) tick.damage = { rating: Number(failed[1]), school: schoolOf(failed[2]) };
        }
        break;
      }
    }
    for (const kind of KIND) {
      const row = kind(s);
      if (row) tick.against.push(row);
    }
  }
  // A kind clause with no base clause of its own (Doomfire's and Nether
  // Collapse's demons): the tick is every creature's, and only the kind is paid.
  if (!found && tick.against.length) {
    found = true;
    tick.who = "creature";
  }

  // D-757: entering, the Tests, the riders, the growth, the retaliation.
  const enter = readEnter(list, tick.damage);
  const checks = readChecks(list, fields, body);
  const remains = readRemains(list, tick.against);
  const grows = /\bat the start of each of your turns it grows by (\d+) feet\b/.exec(body);
  if (!found && (enter || checks.length || remains.length)) {
    found = true;
    tick.who = "creature";
  }
  if (!found) return null;
  // A clause that says *instead* inherits the base clause's school.
  tick.against = tick.against.map(row => ({ ...row, school: row.rating !== null ? (row.school ?? tick.damage.school) : null }));
  // Self-centred has no Region to measure, so the reach is the sentence's.
  if (self) tick.centre = "self";

  if (enter) tick.enter = enter;
  tick.checks = checks;
  tick.remains = remains;
  tick.grows = grows ? Number(grows[1]) : null;
  tick.excludesCaster = Boolean(baseSentence && excludesHolder(baseSentence));
  tick.retaliate = Boolean(baseSentence && /\bor that hits you with a melee attack\b/.test(baseSentence));
  tick.onEnter = /\bagain the first time it enters\b|\benters (?:the area|or crosses)\b|\bwhen it first enters\b|\bthe first time it enters\b|\bcreature entering it\b/i.test(body);
  tick.difficult = /\*\*Difficult ground\*\*|\bdifficult (?:ground|terrain)\b/i.test(body);
  tick.lasts = { rounds: roundsIn(fields?.duration ?? {}) };
  tick.reason = UNEXPRESSED.filter(c => c.re.test(body) && !c.covered(tick, body, fields)).map(c => c.text).join("; ");
  return tick;
}

/**
 * **WHETHER THE CAST ITSELF DEALS THE SPELL'S DAMAGE.** Not where the tick
 * carries it (Consecration, Rain of Fire and sixteen more): the card offers no
 * damage and no Apply, because 07 lands it when a creature starts its turn in
 * the area. Glacier's and Doomfire's damage is the CAST's - a Test every
 * creature in the area makes once - and stays on the card.
 *
 * @param {{damage?: {rating?: number|null}, areaTick?: object}} sys  a spell's system data
 */
export function castDealsDamage(sys = {}) {
  if (sys?.damage?.rating === null || sys?.damage?.rating === undefined) return false;
  // **AND NOT WHERE A TICK ON THE CREATURE IS THE SPELL'S DAMAGE** (D-770;
  // O-144): Immolate's *the target takes 2 Fire damage at the start of each of
  // its turns* lands at those turns, through the effect the card's Apply lays,
  // and the card applied it once at the cast. Moonfire's 4 is the cast's own
  // and its 2 a second number (`hit`), so it keeps its Apply.
  if (creatureTickIs(sys?.tick, "damage")) return false;
  const tick = sys?.areaTick;
  if (!hasAreaTick(tick)) return true;
  const ticks = (tick.damage?.rating ?? null) !== null || (tick.against ?? []).some(r => (r?.rating ?? null) !== null);
  return !ticks;
}

/**
 * Whether a spell's tick ON THE CREATURE (`rules/ticks.mjs`, D-770) is the
 * spell's own number of this kind - Immolate's damage, Rejuvenation's healing -
 * rather than a second number after the cast's (Moonfire's 4 then 2, Bloom's 4
 * then 3). Read off the stored shape, so this module imports nothing of that
 * one's.
 */
function creatureTickIs(tick, kind) {
  return Boolean(tick && typeof tick === "object" && tick.kind === kind && tick.when === "startOfTurn" && tick.hit !== true);
}

/**
 * **WHETHER THE CAST ITSELF HEALS.** Not where the tick carries the healing:
 * Healing Rain's 3 is an ally's at the start of its turn in the rain, and the
 * card offered it to whoever was targeted at the cast.
 */
export function castHeals(sys = {}) {
  // Rejuvenation's 2 is the target's at the start of each of its turns (D-770).
  if (creatureTickIs(sys?.tick, "heal")) return false;
  const tick = sys?.areaTick;
  if (!hasAreaTick(tick)) return true;
  return !((tick.heal ?? null) !== null || (tick.against ?? []).some(r => (r?.heal ?? null) !== null));
}

/**
 * **WHETHER THE AREA CARRIES WHAT THE SPELL LAYS** (D-757): a placed area whose
 * descriptor is the spell's rule. Its card offers no Apply - laying the spell
 * on whoever was targeted at the cast was never 07's rule for an area on the
 * ground, and for Hallowed Ground, Tidecall, Thornguard and Nether Collapse the
 * laid effect carried the very conditions their Tests land and their Boons
 * guard against. A self-centred descriptor keeps its Apply: Tree of Life's
 * laid effect is what carries its tick and its aura's gate.
 */
export function areaCarriesSpell(sys = {}) {
  const tick = sys?.areaTick;
  return hasAreaTick(tick) && tick.centre === "area";
}

/**
 * **WHAT A TICK DOES, AS PARTS A CARD CAN SAY** - the pure half of the card's
 * *Each turn* line (CLAUDE.md §4: a derived line is composed in the pure
 * module and the door hands the words). One part a payload, in 07's order: the
 * base clause, then each kind clause. A clause that says *instead* keeps the
 * base clause's subject; one that is its own sentence names its kinds and the
 * subject it names for itself, where it names one (*an undead or demon
 * enemy*), else null. A base clause that is a Test says nothing here - its
 * `checks` row is what lands.
 *
 * @returns {Array<{kind: "damage"|"heal", who: string|null, kinds: string[],
 *   rating: number|null, school: string|null, amount: number|null, instead: boolean}>}
 */
export function tickParts(tick) {
  if (!hasAreaTick(tick)) return [];
  const gated = Boolean(tick.test?.resilience);
  const out = [];
  const part = (kind, extra) => ({ kind, who: null, kinds: [], rating: null, school: null, amount: null, instead: false, ...extra });
  if (!gated && (tick.damage?.rating ?? null) !== null) out.push(part("damage", { who: tick.who, rating: tick.damage.rating, school: tick.damage.school ?? null }));
  if (!gated && (tick.heal ?? null) !== null) out.push(part("heal", { who: tick.who, amount: tick.heal }));
  for (const row of tick.against ?? []) {
    if (row?.instead && gated) continue;
    const who = row?.instead ? tick.who : (row?.who || null);
    const kinds = [...(row?.kinds ?? [])];
    if ((row?.rating ?? null) !== null) out.push(part("damage", { who, kinds, rating: row.rating, school: row.school ?? tick.damage?.school ?? null, instead: row.instead === true }));
    if ((row?.heal ?? null) !== null) out.push(part("heal", { who, kinds, amount: row.heal, instead: row.instead === true }));
  }
  return out;
}

/**
 * Whether a tick's subject reaches a creature standing in this relation to the
 * caster.
 *
 * **AN ALLY IS THE CASTER TOO, STANDING IN THEIR OWN AREA** (the lead,
 * 2026-09-26): *a Forsaken Paladin in their own Hallowed Ground is treated as an
 * ally - regains 2*, and *the caster counts as an ally unless the spell or aura
 * specifically says "other than you" or similar wording* - which is
 * `excluded`, off the base sentence's own words (`excludesCaster`). A
 * self-centred tick never reaches its caster however this reads: *within 30
 * feet of you* is somebody else, and the door never measures the caster
 * against their own token.
 *
 * @param {string} who
 * @param {string} relation
 * @param {{excluded?: boolean}} [o]
 */
export function whoIncludes(who, relation, { excluded = false } = {}) {
  if (excluded && relation === "self") return false;
  if (who === "creature") return true;
  if (who === "enemy") return relation === "enemy";
  if (who === "ally") return relation === "ally" || relation === "self";
  return false;
}

/**
 * WHO THE VICTIM IS TO THE CASTER: "self", "ally", "enemy" or "other".
 *
 * `countsAsAlly` and `countsAsEnemy` are the law (D-732, D-755), over
 * `canvas/engaged.mjs#allyStandingOf`'s reading of each. **The enemy rule's
 * three exclusions are the Engaged check's and not this one's**: a creature at
 * 0 Health, a defeated one or one hidden from a player is not somebody you are
 * Engaged with, and is still an enemy starting its turn in your Consecration -
 * 06 §8 is what a blow on the dying does. The tick runs on the GM's client.
 *
 * @param {object|null} caster  standing
 * @param {object|null} victim  standing
 */
export function relationOf(caster, victim) {
  if (!caster || !victim) return "other";
  if (caster.uuid && caster.uuid === victim.uuid) return "self";
  if (countsAsAlly(caster, victim)) return "ally";
  if (countsAsEnemy(caster, { ...victim, defeated: false, health: null, hidden: false }, { gm: true })) return "enemy";
  return "other";
}

/**
 * **WHAT ONE CREATURE TAKES FROM ONE TICK**: `{damage: {rating, school}|null,
 * heal: n|null}`, or null where the area does nothing to it.
 *
 * The base clause reaches whoever its subject names; a base clause that is a
 * Test lands nothing here (its `checks` row posts the Resist card). A kind
 * clause that says *instead* replaces the base for a creature of its kind
 * inside the base's own subject; one that is its own sentence adds to it for a
 * creature of its kind inside the subject that sentence names (*an undead or
 * demon enemy*: an enemy, the lead's 2026-09-26 call), or whoever it stands
 * with where it names none (*a demon standing in it*). **The Rating is the
 * entry's**: what the caster's standing bonuses add is the door's to add, at
 * the tick (`rules/spell-bonus.mjs`).
 *
 * @param {object} tick
 * @param {{relation?: string, kinds?: Set<string>|string[]}} o
 */
export function tickFor(tick, { relation = "other", kinds = [] } = {}) {
  if (!hasAreaTick(tick)) return null;
  const k = kinds instanceof Set ? kinds : new Set(kinds ?? []);
  const excluded = tick.excludesCaster === true;
  const inScope = whoIncludes(tick.who, relation, { excluded });
  const gated = Boolean(tick.test?.resilience);
  const base = inScope && !gated;
  let damage = base && (tick.damage?.rating ?? null) !== null ? { rating: tick.damage.rating, school: tick.damage.school ?? null } : null;
  let heal = base && (tick.heal ?? null) !== null ? tick.heal : null;
  for (const row of tick.against ?? []) {
    if (!(row?.kinds ?? []).some(kind => k.has(kind))) continue;
    if (row.instead) {
      if (!base) continue;
      damage = (row.rating ?? null) !== null ? { rating: row.rating, school: row.school ?? tick.damage?.school ?? null } : null;
      heal = row.heal ?? null;
      continue;
    }
    if (row.who && !whoIncludes(row.who, relation, { excluded })) continue;
    if (excluded && relation === "self") continue;
    if ((row.rating ?? null) !== null) damage = { rating: row.rating, school: row.school ?? null };
    if ((row.heal ?? null) !== null) heal = row.heal;
  }
  if (!damage && heal === null) return null;
  return { damage, heal };
}

/* -------------------------------------------- */
/*  What entering, a Test and a rider land (D-757) */
/* -------------------------------------------- */

/**
 * **THE DAMAGE A CREATURE TAKES ON ENTERING**, or null: the area's `enter`
 * clause, for a creature its subject reaches, where the cast's Success Level
 * reached the clause's (Rain of Chaos: *At SL 3 or better*). The span and the
 * once-a-turn memory are the door's (`firstEntry`, `areaLapsed`).
 *
 * @param {object} tick
 * @param {{relation?: string, sl?: number|null}} o
 * @returns {{rating: number, school: string|null}|null}
 */
export function enterFor(tick, { relation = "other", sl = null } = {}) {
  if (!hasAreaTick(tick)) return null;
  const enter = tick.enter ?? null;
  if (!enter || enter.rating === null || enter.rating === undefined) return null;
  if (enter.sl !== null && enter.sl !== undefined && !(Number(sl) >= Number(enter.sl))) return null;
  if (!whoIncludes(tick.who, relation, { excluded: tick.excludesCaster === true })) return null;
  return { rating: Number(enter.rating), school: enter.school ?? null };
}

/**
 * **WHETHER THIS ENTRY IS THE FIRST ON THE TURN** (Rain of Fire's *again the
 * first time it enters the area on a turn*), off the area's own memory of who
 * entered on which turn. A clause that strikes every entry (Flamestrike) never
 * asks. Pure: the door stores what this returns.
 *
 * @param {Record<string, string>|null} memory  token id -> the turn key it last entered on
 * @param {string} tokenId
 * @param {string} turnKey  the fight's own `combat.round.turn`
 * @returns {{first: boolean, memory: Record<string, string>}}
 */
export function firstEntry(memory, tokenId, turnKey) {
  const held = memory && typeof memory === "object" ? memory : {};
  if (!tokenId || !turnKey) return { first: false, memory: held };
  if (held[tokenId] === turnKey) return { first: false, memory: held };
  return { first: true, memory: { ...held, [tokenId]: turnKey } };
}

/**
 * **THE TESTS A CREATURE MAKES NOW**: the area's checks made on this trigger -
 * the start of its turn, or entering - that reach it. A check exempting the
 * caster (Blackout, The Deep: *You ... see through it normally*) skips them; one
 * made *at the center* (Void Rift) needs the creature there; one gated on a
 * second Sustain (Starweave's *While you hold both*) needs the caster to hold
 * it.
 *
 * @param {object} tick
 * @param {"turn"|"enter"} trigger
 * @param {{relation?: string, atCentre?: boolean, holds?: Set<string>|string[]}} o
 * @returns {object[]}  the check rows
 */
export function checksFor(tick, trigger, { relation = "other", atCentre = false, holds = [] } = {}) {
  if (!hasAreaTick(tick)) return [];
  const held = holds instanceof Set ? holds : new Set(holds ?? []);
  return (tick.checks ?? []).filter(c => {
    if (!(c.on === trigger || c.on === "both")) return false;
    if (c.exempt === "caster" && relation === "self") return false;
    if (tick.excludesCaster === true && relation === "self") return false;
    if (c.where === "centre" && !atCentre) return false;
    if (c.gate) {
      const [kind, id] = String(c.gate).split(":");
      if (kind !== "holds" || !held.has(id)) return false;
    }
    return true;
  });
}

/**
 * **WHERE AN AREA'S CENTRE IS**, in the scene's pixels, off the Region's shape
 * (14.367, `common/data/data.mjs`): a circle, an ellipse, a ring, a cone and a
 * line name their centre or origin as `x`, `y`; a rectangle its corner and its
 * size; a polygon its points, whose mean is taken. Null for anything else.
 *
 * @param {object|null} shape  a Region shape's data
 * @returns {{x: number, y: number}|null}
 */
export function shapeCentre(shape) {
  if (!shape || typeof shape !== "object") return null;
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : null);
  if (["circle", "ellipse", "ring", "cone", "line"].includes(shape.type)) {
    const x = n(shape.x);
    const y = n(shape.y);
    return x === null || y === null ? null : { x, y };
  }
  if (shape.type === "rectangle") {
    const [x, y, w, h] = [n(shape.x), n(shape.y), n(shape.width), n(shape.height)];
    if ([x, y, w, h].includes(null)) return null;
    // The anchor is the fraction of the size the x, y sit at (0 is the corner).
    const ax = n(shape.anchorX) ?? 0;
    const ay = n(shape.anchorY) ?? 0;
    return { x: x - ax * w + w / 2, y: y - ay * h + h / 2 };
  }
  if (shape.type === "polygon" && Array.isArray(shape.points) && shape.points.length >= 6) {
    let sx = 0;
    let sy = 0;
    const count = Math.floor(shape.points.length / 2);
    for (let i = 0; i < count; i++) {
      sx += Number(shape.points[2 * i]) || 0;
      sy += Number(shape.points[2 * i + 1]) || 0;
    }
    return { x: sx / count, y: sy / count };
  }
  return null;
}

/**
 * **WHETHER A CREATURE STANDS AT THE CENTRE** (Void Rift: *a creature that
 * begins its turn at the center*): the space it occupies holds the centre point,
 * edges included, so a centre laid on a grid corner is held by every creature
 * whose space touches it.
 *
 * @param {{x: number, y: number, width: number, height: number}|null} box  the token's space, in pixels
 * @param {{x: number, y: number}|null} point
 */
export function holdsPoint(box, point) {
  if (!box || !point) return false;
  const [x, y, w, h] = [box.x, box.y, box.width, box.height].map(Number);
  if (![x, y, w, h, point.x, point.y].every(Number.isFinite)) return false;
  return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

/**
 * **WHAT A TEST LANDS**, failed or passed: the damage, the conditions each with
 * its span (07's own, else A1's default, `CONDITION_DEFAULT_ENDS`), a Bane, a
 * lost turn. A failure by a creature of a kind the check names takes that
 * kind's conditions (Nether Collapse's demon is Frightened; anything else is
 * Stunned, Numbed, Entangled and Prone).
 *
 * @param {object} check
 * @param {{success?: boolean, kinds?: Set<string>|string[]}} o
 * @returns {{damage: {rating: number, school: string|null}|null, statuses: Array<{id: string, until: string}>,
 *   bane: {kind: string, until: string}|null, lose: boolean}}
 */
export function checkOutcome(check, { success = false, kinds = [] } = {}) {
  const k = kinds instanceof Set ? kinds : new Set(kinds ?? []);
  const nothing = { damage: null, statuses: [], bane: null, lose: false, forced: null };
  if (!check) return nothing;
  const spanned = (ids, until) => ids.map(id => ({ id, until: until || CONDITION_DEFAULT_ENDS[id] || "" }));
  if (success) {
    return { ...nothing, statuses: spanned(check.success?.statuses ?? [], check.success?.until ?? "") };
  }
  const fail = check.fail ?? {};
  let statuses = [...(fail.statuses ?? [])];
  for (const row of fail.kinds ?? []) {
    const is = (row.kinds ?? []).some(x => k.has(x));
    if (is !== (row.not === true)) statuses = [...statuses, ...(row.statuses ?? [])];
  }
  const feet = Math.max(0, Math.trunc(Number(fail.forced?.feet)) || 0);
  return {
    damage: fail.rating !== null && fail.rating !== undefined ? { rating: Number(fail.rating), school: fail.school ?? null } : null,
    statuses: spanned([...new Set(statuses)], fail.until ?? ""),
    bane: fail.bane ? { kind: fail.bane, until: fail.until || "endOfNextTurn" } : null,
    lose: fail.lose === true,
    // The forced move a failure makes (Tempest's push on entering; D-778).
    forced: feet > 0 ? { feet, toward: fail.forced.toward === "toward" ? "toward" : "away" } : null
  };
}

/**
 * **THE TEST ON ENTERING WHOSE ONLY OUTCOME IS A FORCED MOVE** (07's Tempest: *one
 * that fails a Reflex Resilience Test against your Spell DC when it first enters is
 * pushed 10 feet toward the edge*; D-778, the lead on O-158: *"Yes."*): the area's
 * forced move as a check row - `emptyCheck`'s whole shape, made on entering, whose
 * failure is the push - for the area door to post and the card's door to land. Built
 * at the door off the Region's `forced` (`dice/chat.mjs#regionFlagsFromCard`), never
 * stamped on the spell. Null for a move that is not made on entering.
 *
 * @param {{on: string, feet: number, toward: string, resilience: string|null}|null} forced
 * @returns {object|null}
 */
export function forcedCheck(forced) {
  if (!forced || forced.on !== "enter" || !forced.resilience || !(Number(forced.feet) > 0)) return null;
  const row = emptyCheck();
  row.on = "enter";
  row.resilience = forced.resilience;
  row.fail.forced = { feet: Math.trunc(Number(forced.feet)), toward: forced.toward === "toward" ? "toward" : "away" };
  return row;
}

/**
 * **THE RIDERS THAT STAND ON A CREATURE IN THE AREA** (D-757): each row the
 * creature is inside the scope of - its subject (`whoIncludes`), its kinds and
 * the kinds it spares, and Crucible's metal - and whose time has come: from the
 * moment it is inside, or once it has started (or, Slagfall, ended) a turn
 * there, which the door remembers as `armed`.
 *
 * `metal` is `true` (it wears Mail or Plate), `false`, or `null` where nothing
 * can be read: Crucible's Bane is then the table's line (`judged`), because
 * *holding a metal weapon* has no field in 08 to answer it.
 *
 * @param {object} tick
 * @param {{relation?: string, kinds?: Set<string>|string[], armed?: Set<string>|string[], metal?: boolean|null}} o
 * @returns {Array<{index: number, row: object, judged: boolean}>}
 */
export function ridersFor(tick, { relation = "other", kinds = [], armed = [], metal = null, uuid = null } = {}) {
  if (!hasAreaTick(tick)) return [];
  const k = kinds instanceof Set ? kinds : new Set(kinds ?? []);
  const on = armed instanceof Set ? armed : new Set(armed ?? []);
  const out = [];
  (tick.remains ?? []).forEach((row, index) => {
    // **THE CREATURES THE CASTER CHOSE** (07's Barrier: *Every creature you choose
    // inside the area*; D-779): a row naming them reaches those alone, by uuid.
    if (row.who === "chosen") {
      if (!uuid || !(row.chosen ?? []).includes(uuid)) return;
    } else if (!whoIncludes(row.who, relation, { excluded: tick.excludesCaster === true })) return;
    if ((row.kinds ?? []).length && !row.kinds.some(x => k.has(x))) return;
    if ((row.exceptKinds ?? []).some(x => k.has(x))) return;
    if (row.when !== "inside" && !on.has(row.when)) return;
    // Crucible's Bane is ticked on Mail or Plate and the table's line on
    // anything else - no metal read, or none that can be.
    const judged = row.gear === "metal" && metal !== true;
    out.push({ index, row, judged });
  });
  return out;
}

/**
 * What a rider row gives, in the aura door's payload vocabulary
 * (`rules/auras.mjs#auraPayloadOf`): a Bane (a flag; the table's line where
 * `judged`), a Ward gained, a Boon against conditions, a Speed, halved
 * healing, standing from Prone for nothing.
 *
 * @param {object} row
 * @param {{judged?: boolean}} [o]
 */
export function riderPayload(row, { judged = false } = {}) {
  const out = {};
  if (row?.bane) out.bane = judged ? { kind: row.bane, banes: 1, judged: true } : { kind: row.bane, banes: 1 };
  if (row?.ward?.amount) out.ward = { schools: [...(row.ward.schools ?? [])], amount: row.ward.amount };
  if ((row?.boonAgainst ?? []).length) out.boon = { kind: "resilience", against: [...row.boonAgainst], boons: 1 };
  if (row?.speed) out.speed = row.speed;
  if (row?.healing === "half") out.healing = "half";
  if (row?.standFree) out.standFree = true;
  return out;
}

/**
 * **WHETHER A TIMED AREA'S SPAN IS OVER.** An area placed in a fight counts
 * that fight's rounds and ends with it - a minute has no clock outside the
 * fight it was spent in (the coating's rule, D-719). One placed outside any
 * fight counts world time at 05's six seconds a round. No span, no lapse.
 *
 * **TEN ROUNDS FROM THE MOMENT IT WENT DOWN, NOT FROM THE ROUND** (the review,
 * N3). 05's minute is ten rounds, so the area stands until the same point in
 * the order ten rounds on: at a turn's start in its last round it still stands
 * for a turn that comes at or before the turn it was placed in, and not for
 * one after. Every creature then starts exactly ten turns inside it, the
 * caster included. Judged at the round's first boundary instead, a creature
 * acting before the caster lost its tenth. A placement that recorded no turn -
 * a Region laid before the turn was recorded - ends at its last round's first
 * boundary, as it always did.
 *
 * @param {{lasts?: {rounds?: number|null}, placedAt?: {combatId?: string|null,
 *   round?: number|null, turn?: number|null, time?: number|null}}} area
 * @param {{time?: number, fights?: Record<string, number>, turns?: Record<string, number>}} now
 *   the world's time, and every STARTED fight's round and turn, by id
 */
export function areaLapsed({ lasts = null, placedAt = null } = {}, { time = 0, fights = {}, turns = {} } = {}) {
  const rounds = Number(lasts?.rounds);
  if (!(rounds > 0)) return false;
  if (placedAt?.combatId) {
    const round = fights?.[placedAt.combatId];
    if (round === undefined || round === null) return true;
    const elapsed = Number(round) - (Number(placedAt.round) || 0);
    const at = placedAt.turn;
    const turn = turns?.[placedAt.combatId];
    if (!Number.isFinite(at) || !Number.isFinite(turn)) return elapsed >= rounds;
    return elapsed > rounds || (elapsed === rounds && turn > at);
  }
  if (placedAt?.time === null || placedAt?.time === undefined) return false;
  return (Number(time) || 0) - Number(placedAt.time) >= rounds * ROUND_SECONDS;
}

/**
 * **A TIMED AREA LAID BEFORE A FIGHT JOINS IT** (the coating's rule, D-719; the
 * review, N3): the clock it counts from in the fight's terms. The round the
 * fight is in LESS the whole rounds the world's clock has already run since it
 * went down - six seconds a round (05) - so a minute that began before
 * initiative is not handed out again; and one turn back, because it joins at a
 * turn's BOUNDARY, before that turn's start is judged, where an area placed
 * during a turn comes after it. The world time it went down is kept.
 *
 * @param {{time?: number|null}|null} placedAt  the area's record, placed outside any fight
 * @param {{combatId: string, round?: number, turn?: number, time?: number}} fight  now
 * @returns {{combatId: string, round: number, turn: number, time: number}}
 */
export function joinFight(placedAt = null, { combatId = null, round = 0, turn = 0, time = 0 } = {}) {
  const then = placedAt?.time;
  const spent = then === null || then === undefined || !Number.isFinite(Number(then))
    ? 0
    : Math.max(0, Math.floor(((Number(time) || 0) - Number(then)) / ROUND_SECONDS));
  return {
    combatId,
    round: (Number(round) || 0) - spent,
    turn: (Number(turn) || 0) - 1,
    time: then === null || then === undefined ? (Number(time) || 0) : Number(then)
  };
}

/**
 * **WHICH AREAS NO LONGER STAND**, by id: a Sustain that is not held any more
 * (05 §12 - dropped, out-paid, over the limit, ended by a Critical Injury), or
 * a span that is over. Only an area that carries a cast is judged; anything a
 * table drew by hand, and an Instant area, is left where it is.
 *
 * **A SUSTAIN WHOSE HOLDER IS DOWN IS NOT HELD** (the review, M1): 0 Health is
 * a Critical Injury (06 §8, §9) and a Critical Injury ends what you Sustain
 * (05 §12), so a row the reader marks `down` - the creature the card recorded
 * as casting it lies at 0 Health or defeated - goes whatever its caster's flag
 * still says. A TIMED area is not held by anybody and outlives its caster.
 *
 * @param {Array<{id: string, cast?: string|null, caster?: string|null,
 *   sustained?: boolean, down?: boolean, lasts?: object, placedAt?: object}>} regions
 * @param {Map<string, Set<string>>} held  every caster's held casts, by uuid;
 *   a caster that no longer exists, or is down, holds nothing
 * @param {{time?: number, fights?: Record<string, number>, turns?: Record<string, number>}} now
 * @returns {string[]}
 */
export function staleAreas(regions = [], held = new Map(), now = {}) {
  const out = [];
  for (const r of regions ?? []) {
    if (!r?.id || !r.cast) continue;
    if (r.sustained === true && (r.down === true || !held?.get?.(r.caster ?? "")?.has(r.cast))) {
      out.push(r.id);
      continue;
    }
    if (areaLapsed(r, now)) out.push(r.id);
  }
  return out;
}

/*
 * THE MODEL'S GUARD (CLAUDE.md §15): `migrateData` runs over PARTIAL update
 * data as well as whole documents, so every depth cleans only the keys it was
 * handed and never rebuilds an object around them.
 */
const nullableNumber = v => (v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : null);
const signedNumber = v => (v === null || (typeof v === "number" && Number.isFinite(v)) ? v : null);
const conditionList = list => (Array.isArray(list) ? [...new Set(list.filter(id => typeof id === "string" && AZEROTH.conditions?.[id]))] : []);
const kindList = list => (Array.isArray(list) ? list.filter(k => AREA_TICK_KINDS.includes(k)) : []);
const testKind = v => (v === "all" || (typeof v === "string" && v in AZEROTH.testKinds) ? v : "");

/** One stored check row, whole: an array is written whole, so a row is cleaned as one. */
function cleanCheckRow(r) {
  const fail = r?.fail && typeof r.fail === "object" ? r.fail : {};
  const success = r?.success && typeof r.success === "object" ? r.success : {};
  return {
    on: AREA_CHECK_ON.includes(r?.on) ? r.on : "turn",
    resilience: r?.resilience && AZEROTH.resiliences[r.resilience] ? r.resilience : null,
    where: r?.where === "centre" ? "centre" : "",
    gate: typeof r?.gate === "string" && /^holds:[a-z0-9-]+$/.test(r.gate) ? r.gate : "",
    exempt: r?.exempt === "caster" ? "caster" : "",
    fail: {
      rating: nullableNumber(fail.rating ?? null),
      school: fail.school && AZEROTH.schools[fail.school] ? fail.school : null,
      statuses: conditionList(fail.statuses),
      bane: testKind(fail.bane),
      until: AREA_UNTIL.includes(fail.until) ? fail.until : "",
      lose: fail.lose === true,
      kinds: Array.isArray(fail.kinds) ? fail.kinds.filter(k => k && typeof k === "object").map(k => ({
        kinds: kindList(k.kinds), not: k.not === true, statuses: conditionList(k.statuses)
      })) : []
    },
    success: {
      statuses: conditionList(success.statuses),
      until: AREA_UNTIL.includes(success.until) ? success.until : ""
    }
  };
}

/** One stored rider row, whole. */
function cleanRemainsRow(r) {
  const ward = r?.ward && typeof r.ward === "object" ? r.ward : {};
  return {
    when: AREA_REMAINS_WHEN.includes(r?.when) ? r.when : "inside",
    who: AREA_TICK_WHO.includes(r?.who) ? r.who : "creature",
    kinds: kindList(r?.kinds),
    exceptKinds: kindList(r?.exceptKinds),
    gear: r?.gear === "metal" ? "metal" : "",
    bane: testKind(r?.bane),
    ward: {
      schools: Array.isArray(ward.schools) ? ward.schools.filter(s => AZEROTH.schools[s]) : [],
      amount: nullableNumber(ward.amount ?? null)
    },
    boonAgainst: conditionList(r?.boonAgainst),
    speed: signedNumber(r?.speed ?? null),
    healing: r?.healing === "half" ? "half" : "",
    standFree: r?.standFree === true
  };
}

/**
 * Clean a stored `areaTick` in place, key by key, and hand it back.
 * @param {object} tick
 */
export function cleanAreaTick(tick) {
  if (!tick || typeof tick !== "object") return tick;
  if ("who" in tick && !(tick.who === "" || AREA_TICK_WHO.includes(tick.who))) tick.who = "";
  if ("damage" in tick) {
    if (!tick.damage || typeof tick.damage !== "object" || Array.isArray(tick.damage)) tick.damage = { rating: null, school: null };
    else {
      if ("rating" in tick.damage) tick.damage.rating = nullableNumber(tick.damage.rating);
      if ("school" in tick.damage && tick.damage.school !== null && !AZEROTH.schools[tick.damage.school]) tick.damage.school = null;
    }
  }
  if ("heal" in tick) tick.heal = nullableNumber(tick.heal);
  if ("against" in tick) {
    // An array is written whole, so a row is a whole object and is cleaned as one.
    tick.against = Array.isArray(tick.against) ? tick.against.filter(r => r && typeof r === "object").map(r => ({
      kinds: Array.isArray(r.kinds) ? r.kinds.filter(k => AREA_TICK_KINDS.includes(k)) : [],
      // A row stored before a clause could name its own subject names none.
      who: AREA_TICK_WHO.includes(r.who) ? r.who : "",
      rating: nullableNumber(r.rating ?? null),
      school: r.school && AZEROTH.schools[r.school] ? r.school : null,
      heal: nullableNumber(r.heal ?? null),
      instead: r.instead === true
    })) : [];
  }
  if ("centre" in tick && !["area", "self"].includes(tick.centre)) tick.centre = "area";
  if ("feet" in tick) tick.feet = nullableNumber(tick.feet);
  if ("onEnter" in tick && typeof tick.onEnter !== "boolean") tick.onEnter = tick.onEnter === true;
  if ("difficult" in tick && typeof tick.difficult !== "boolean") tick.difficult = tick.difficult === true;
  if ("test" in tick) {
    if (!tick.test || typeof tick.test !== "object" || Array.isArray(tick.test)) tick.test = { resilience: null };
    else if ("resilience" in tick.test && tick.test.resilience !== null && !AZEROTH.resiliences[tick.test.resilience]) tick.test.resilience = null;
  }
  if ("lasts" in tick) {
    if (!tick.lasts || typeof tick.lasts !== "object" || Array.isArray(tick.lasts)) tick.lasts = { rounds: null };
    else if ("rounds" in tick.lasts) {
      const n = tick.lasts.rounds;
      tick.lasts.rounds = typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
    }
  }
  if ("enter" in tick) {
    if (!tick.enter || typeof tick.enter !== "object" || Array.isArray(tick.enter)) tick.enter = emptyEnter();
    else {
      const e = tick.enter;
      if ("rating" in e) e.rating = nullableNumber(e.rating);
      if ("school" in e && e.school !== null && !AZEROTH.schools[e.school]) e.school = null;
      if ("once" in e && typeof e.once !== "boolean") e.once = e.once === true;
      if ("rounds" in e) e.rounds = typeof e.rounds === "number" && Number.isInteger(e.rounds) && e.rounds > 0 ? e.rounds : null;
      if ("sl" in e) e.sl = typeof e.sl === "number" && Number.isInteger(e.sl) ? e.sl : null;
    }
  }
  if ("checks" in tick) tick.checks = Array.isArray(tick.checks) ? tick.checks.filter(r => r && typeof r === "object").map(cleanCheckRow) : [];
  if ("remains" in tick) tick.remains = Array.isArray(tick.remains) ? tick.remains.filter(r => r && typeof r === "object").map(cleanRemainsRow) : [];
  if ("grows" in tick) tick.grows = typeof tick.grows === "number" && Number.isInteger(tick.grows) && tick.grows > 0 ? tick.grows : null;
  if ("excludesCaster" in tick && typeof tick.excludesCaster !== "boolean") tick.excludesCaster = tick.excludesCaster === true;
  if ("retaliate" in tick && typeof tick.retaliate !== "boolean") tick.retaliate = tick.retaliate === true;
  if ("reason" in tick && typeof tick.reason !== "string") tick.reason = "";
  return tick;
}
