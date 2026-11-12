/**
 * **THE GUARDIAN OF TIME'S LAW** (04's third Chronomancer branch, the tank; stage 2c of the
 * Chronomancer build). Pure: no Foundry imports (CLAUDE.md §3). Every number a door reads
 * lives on the talent's row in `talent-effects.mjs` and is read here at the talent's rank;
 * `guardian-talents.test.mjs` holds each to 04's own words and each reader to its caller.
 *
 * The lead's rule, verbatim: *"We need automation and animations fully complete for
 * everything"*. The doors are `effects/guardian.mjs` (the writes), `AzerothActor#applyDamage`
 * (Borrowed Time asked in the blow, after Dilation's split; Borrowed Hour among the holds at
 * 1), `effects/blow-doors.mjs` (Interposed Moment and Timeless Sentinel as moves),
 * `applications/actions.mjs` (the Block's Sand and its Spirit Test; the echo's rolls) and
 * `canvas/distortion-field.mjs` (the ground about the Guardian).
 *
 * `rowOf` is the talent table's lookup, handed in so a test may hand a row of its own.
 */

import { atRankRow } from "./chronomancer.mjs";
import { appendDeferred, DEFERRED_FLAG } from "./deferred-damage.mjs";
import { heldAt, wouldDrop } from "./blow-doors.mjs";

export { DEFERRED_FLAG };

/** A whole number at or above nothing. */
const count = v => Math.max(0, Math.trunc(Number(v)) || 0);

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** The first taken talent carrying a row of one kind, at its rank, with its name, or null. */
export function guardianRow(talents = [], kind, rowOf) {
  const found = [...(talents ?? [])]
    .filter(t => Math.trunc(Number(t?.taken) || 0) > 0)
    .map(t => ({ t, row: rowOf?.(t.className, t.identifier, t.race ?? null)?.[kind] ?? null }))
    .filter(r => r.row)
    .sort((a, b) => String(a.t.identifier).localeCompare(String(b.t.identifier)))[0] ?? null;
  if (!found) return null;
  const rank = rankOf(found.t);
  return { ...atRankRow(found.row, rank), name: found.t.name, identifier: found.t.identifier, talentId: found.t.id ?? null, rank };
}

/**
 * The sources a put-off row is written under. Unmade Wound erases only Borrowed Time's (*Half
 * the damage Borrowed Time has put off*), and Timeless Sentinel's free use of it is Borrowed
 * Time's too.
 */
export const BORROWED_TIME = "Borrowed Time";
export const BORROWED_HOUR = "Borrowed Hour";

/* -------------------------------------------- */
/*  Turned Aside                                 */
/* -------------------------------------------- */

/**
 * **TURNED ASIDE** (04: *When you Block an attack, gain 1 Sand. At rank 2 you also gain 1
 * when an attack against you misses. At rank 3 a Block gives 2.*): the Sand one event gives,
 * `block` or `miss`, and the talent's name.
 *
 * @param {Array} talents
 * @param {"block"|"miss"} event
 * @param {Function} rowOf
 * @returns {{gain: number, name: string|null}}
 */
export function turnedAsideGain(talents = [], event, rowOf) {
  const row = guardianRow(talents, "turnedAside", rowOf);
  if (!row || !["block", "miss"].includes(event)) return { gain: 0, name: null };
  return { gain: count(row[event]), name: row.name };
}

/* -------------------------------------------- */
/*  Grinding Block                               */
/* -------------------------------------------- */

/**
 * **GRINDING BLOCK** (04: *When you Block, the attacker makes a Spirit Resilience Test against
 * your Spell DC. On a failure it is Slowed until the end of its next turn. At rank 2 your Block
 * takes 1 more damage off.*): the Test a Block offers the attacker, or null. The 1 more off is
 * the row's `block` (`class-talents.mjs#blockBonusFor`, the Block's one door).
 *
 * @returns {{name: string, resilience: string, condition: string, until: string}|null}
 */
export function grindingBlockOf(talents = [], rowOf) {
  const row = guardianRow(talents, "grind", rowOf);
  if (!row) return null;
  return { name: row.name, resilience: row.resilience ?? "spirit", condition: row.condition ?? "slowed", until: row.until ?? "endOfNextTurn" };
}

/* -------------------------------------------- */
/*  Borrowed Time and Unmade Wound               */
/* -------------------------------------------- */

/**
 * **BORROWED TIME, HELD** (04: *As a Reaction when a blow reduces your Health, spend 1 Sand.
 * Take half its damage now, rounded up. At the start of your next turn, take the other half
 * minus your rank.*), and **Timeless Sentinel's free use of it** (*you may use Borrowed Time on
 * each blow without spending Sand or your Reaction*): the talent's row at its rank, or - where
 * a Sentinel stands and the talent is not taken - Borrowed Time at rank 0 (MY READING: the
 * Sentinel hands its holder the split, and *minus your rank* takes off the rank held, which is
 * none).
 *
 * @param {Array} talents
 * @param {{sentinel?: boolean}} o
 * @param {Function} rowOf
 * @returns {{name: string, rank: number, sand: number, free: boolean}|null}
 */
export function borrowedTimeOf(talents = [], { sentinel = false } = {}, rowOf) {
  const row = guardianRow(talents, "borrowed", rowOf);
  if (row) return { name: row.name, rank: row.rank, sand: count(row.sand ?? 1) || 1, free: sentinel === true };
  return sentinel === true ? { name: BORROWED_TIME, rank: 0, sand: 0, free: true } : null;
}

/**
 * Borrowed Time's split of one blow: *half its damage now, rounded up*, and *the other half
 * minus your rank* at the next turn's start, never below nothing. A blow of 0 splits nothing.
 *
 * @param {number} amount
 * @param {{rank?: number}} o
 * @returns {{now: number, later: number, spared: number}}  `spared` what the rank took off
 */
export function borrowedSplit(amount = 0, { rank = 0 } = {}) {
  const a = count(amount);
  const now = Math.ceil(a / 2);
  const half = a - now;
  const later = Math.max(0, half - count(rank));
  return { now, later, spared: half - later };
}

/**
 * **WHETHER BORROWED TIME MAY BE ASKED ON THIS BLOW**: a blow that would reduce the Health
 * (an amount), in a started fight (*At the start of your next turn* - out of one there is no
 * next turn to land the half on; MY READING, said nowhere as a refusal, since the ask is not
 * made), the Sand and the Reaction unless the Sentinel makes it free. Answers the refusal
 * word or null.
 *
 * @param {{held?: object|null, amount?: number, inFight?: boolean, sand?: number|null, reaction?: boolean, deferred?: boolean}} o
 */
export function borrowedRefusal({ held = null, amount = 0, inFight = false, sand = null, reaction = true, deferred = false } = {}) {
  if (!held) return "unknown";
  if (deferred === true) return "deferred";
  if (!(count(amount) > 1)) return "nothing";
  if (inFight !== true) return "fight";
  if (held.free === true) return null;
  if (sand === null || sand === undefined) return "noHourglass";
  if (count(sand) < count(held.sand)) return "sand";
  if (reaction !== true) return "reaction";
  return null;
}

/**
 * **UNMADE WOUND** (04: *As a Half-Action, spend 2 Sand. Half the damage Borrowed Time has put
 * off, rounded down, never arrives. At rank 2, none of it arrives.*): the put-off list with
 * Borrowed Time's rows reduced - by half their total, rounded down, taken off the newest row
 * first, or all of them at rank 2 - and what never arrives. Every other row (Dilation's,
 * Borrowed Hour's) is left as it stands.
 *
 * @param {Array<{amount: number, source?: string}>} list  the creature's `deferredDamage`
 * @param {{whole?: boolean}} o
 * @returns {{list: Array<object>, erased: number, held: number}}  `held` Borrowed Time's total before
 */
export function unmadeErase(list = [], { whole = false } = {}) {
  const rows = (Array.isArray(list) ? list : []).filter(r => r && typeof r === "object").map(r => ({ ...r }));
  const ours = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.source === BORROWED_TIME);
  const held = ours.reduce((n, { r }) => n + count(r.amount), 0);
  let erase = whole ? held : Math.floor(held / 2);
  const erased = erase;
  for (let k = ours.length - 1; k >= 0 && erase > 0; k -= 1) {
    const row = rows[ours[k].i];
    const take = Math.min(count(row.amount), erase);
    row.amount = count(row.amount) - take;
    erase -= take;
  }
  return { list: rows.filter(r => count(r.amount) > 0), erased, held };
}

/**
 * **UNMADE WOUND, HELD**: the first taken talent whose Use erases Borrowed Time's put-off
 * damage (its row's `onUse.unmade`), at its rank - `whole` at rank 2 (*none of it arrives*) -
 * with its name, or null. The turn's start reads it (`unmadeTurnStart`); the sheet's Use reads
 * the same row through `effects/guardian.mjs#judgeGuardianUse`.
 *
 * @param {Array} talents
 * @param {Function} rowOf
 * @returns {{name: string, identifier: string, talentId: string|null, rank: number, whole: boolean}|null}
 */
export function unmadeWoundOf(talents = [], rowOf) {
  const found = [...(talents ?? [])]
    .filter(t => Math.trunc(Number(t?.taken) || 0) > 0)
    .map(t => ({ t, row: rowOf?.(t.className, t.identifier, t.race ?? null)?.onUse?.unmade ?? null }))
    .filter(r => r.row)
    .sort((a, b) => String(a.t.identifier).localeCompare(String(b.t.identifier)))[0] ?? null;
  if (!found) return null;
  const rank = rankOf(found.t);
  return { name: found.t.name, identifier: found.t.identifier, talentId: found.t.id ?? null, rank, whole: atRankRow(found.row, rank).whole === true };
}

/**
 * **UNMADE WOUND AT THE START OF THE GUARDIAN'S TURN** (O-274, closed by D-880). 04: *As a
 * Half-Action, spend 2 Sand. Half the damage Borrowed Time has put off, rounded down, never
 * arrives*; Borrowed Time: *At the start of your next turn, take the other half*. The half
 * lands at the turn's start, before the Guardian could spend a Half-Action, so the turn's
 * start ASKS first, once, on the turn's fresh Half-Actions: whether Unmade Wound erases the
 * damage Borrowed Time has put off before it lands. Answers the refusal word (null where it
 * may be asked) with `unmadeErase`'s plan: `nothing` where no Borrowed Time row would lose a
 * point (Dilation's and Borrowed Hour's rows never count), `noHourglass` with no glass,
 * `sand` short of the price, `half` with no Half-Action left.
 *
 * @param {{held?: object|null, list?: Array, sand?: number|null, price?: number, half?: boolean}} o
 * @returns {{refusal: string|null, list: Array, erased: number, held: number}}
 */
export function unmadeTurnStart({ held = null, list = [], sand = null, price = 2, half = true } = {}) {
  const plan = unmadeErase(list, { whole: held?.whole === true });
  if (!held) return { refusal: "unknown", ...plan };
  if (!(plan.erased > 0)) return { refusal: "nothing", ...plan };
  if (sand === null || sand === undefined) return { refusal: "noHourglass", ...plan };
  if (count(sand) < count(price)) return { refusal: "sand", ...plan };
  if (half !== true) return { refusal: "half", ...plan };
  return { refusal: null, ...plan };
}

/** The put-off list with one more row, the one shape every writer uses (`deferred-damage.mjs`). */
export function borrowedRow(list = [], { amount = 0, type = null, by = null, source = BORROWED_TIME } = {}) {
  return appendDeferred(list, { amount, type, by, source });
}

/* -------------------------------------------- */
/*  Borrowed Hour                                */
/* -------------------------------------------- */

/**
 * **BORROWED HOUR** (04: *Once per Long Rest, when a blow would drop you to 0 Health, you stay
 * at 1 Health. The rest of that blow arrives at the start of your next turn.*; the lead: *"Fix
 * borrowed hour."* - the *less any Health you regain* clause is cut): the one hold at 1
 * (`blow-doors.mjs#heldAt`), and the rest of the blow, for the put-off list. Only in a started
 * fight, where there is a next turn for the rest to arrive at (MY READING), and only with a
 * use left.
 *
 * @param {{held?: boolean, before?: number, amount?: number, usesLeft?: number, inFight?: boolean}} o
 * @returns {{saved: boolean, amount: number, rest: number}}
 */
export function borrowedHourCatch({ held = false, before = 0, amount = 0, usesLeft = 0, inFight = false } = {}) {
  const a = count(amount);
  if (held !== true || count(usesLeft) < 1 || inFight !== true || !wouldDrop({ before, amount: a })) return { saved: false, amount: a, rest: 0 };
  const saved = heldAt({ before, amount: a, stay: 1 });
  return { saved: saved.saved, amount: saved.amount, rest: Math.max(0, a - saved.amount) };
}

/* -------------------------------------------- */
/*  Interposed Moment and Timeless Sentinel      */
/* -------------------------------------------- */

/**
 * **INTERPOSED MOMENT, AS A MOVE** (04: *As a Reaction when a creature you can see attacks an
 * ally within 10 feet of you, spend 2 Sand. You and that ally swap places without provoking
 * Opportunity Attacks, and the attack targets you instead. At rank 2, within 20 feet.*): the
 * `moves` row of kind `interposed` at its rank, in `class-talents.mjs#guardianFor`'s shape, for
 * `effects/blow-doors.mjs#redirectBlow` to ask in the blow.
 *
 * @returns {{kind: "interposed", identifier: string, name: string, talentId: string|null, feet: number,
 *   cost: {pool: string, amount: number}, swap: true}|null}
 */
export function interposedFor(talents = [], rowOf) {
  const first = [...(talents ?? [])]
    .filter(t => Math.trunc(Number(t?.taken) || 0) > 0)
    .map(t => ({ t, row: rowOf?.(t.className, t.identifier, t.race ?? null)?.moves ?? null }))
    .filter(r => r.row?.kind === "interposed")
    .sort((a, b) => String(a.t.identifier).localeCompare(String(b.t.identifier)))[0] ?? null;
  if (!first) return null;
  const row = atRankRow(first.row, rankOf(first.t));
  return {
    kind: "interposed", identifier: first.t.identifier, name: first.t.name, talentId: first.t.id ?? null,
    feet: count(row.feet), cost: { pool: row.cost?.pool ?? "sand", amount: count(row.cost?.amount) }, swap: true
  };
}

/** The flag Timeless Sentinel's own effect carries on the Guardian. */
export const SENTINEL_FLAG = "timelessSentinel";

/**
 * **TIMELESS SENTINEL, STANDING** (04: *As an action, spend 5 Sand. Until the end of your next
 * turn, every attack against an ally within 30 feet of you targets you instead, and you may use
 * Borrowed Time on each blow without spending Sand or your Reaction.*): the flag of the active
 * effect that holds it on the Guardian, or null.
 *
 * @param {Array<object>} effects  the Guardian's
 * @returns {{source: string, by: string|null, feet: number}|null}
 */
export function sentinelOf(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.disabled === true || e.active === false) continue;
    const f = e.flags?.["azeroth-rpg"]?.[SENTINEL_FLAG];
    if (f && typeof f === "object") return { source: String(f.source ?? ""), by: typeof f.by === "string" ? f.by : null, feet: count(f.feet) || 30 };
  }
  return null;
}

/** The Sentinel as a move (`effects/blow-doors.mjs#movesOf`): automatic, free, no Reaction. */
export function sentinelMove(sentinel) {
  if (!sentinel) return null;
  return { kind: "sentinel", name: sentinel.source || "Timeless Sentinel", feet: count(sentinel.feet) || 30, cost: { pool: null, amount: 0 }, auto: true, free: true };
}

/* -------------------------------------------- */
/*  Distortion Field                             */
/* -------------------------------------------- */

/** The flag the field's own Region carries. */
export const FIELD_FLAG = "distortionField";

/**
 * **DISTORTION FIELD** (04: *The ground within 10 feet of you is Difficult ground for your
 * enemies. At rank 2, within 15 feet.*): the feet at the rank, and the talent, or null.
 */
export function distortionFieldOf(talents = [], rowOf) {
  const row = guardianRow(talents, "field", rowOf);
  if (!row) return null;
  return { name: row.name, identifier: row.identifier, feet: count(row.feet), who: row.who ?? "enemy" };
}

/**
 * The circle's radius in feet from the token's CENTRE: *within 10 feet of you* is measured
 * from the edge of the Guardian's own squares (D-732: never centre to centre), so the circle
 * adds half the token's width in the scene's feet.
 *
 * @param {{feet: number, width?: number, distance?: number}} o  `width` in grid squares, `distance` feet a square
 */
export function fieldRadius({ feet = 0, width = 1, distance = 5 } = {}) {
  const w = Math.max(0, Number(width) || 1);
  const d = Math.max(0, Number(distance) || 5);
  return count(feet) + (w * d) / 2;
}

/**
 * What a token's field should be: the radius and the holder, or null where it lays none. The
 * reconciler compares this with the Region standing (`canvas/distortion-field.mjs`).
 */
export function fieldWanted({ talents = [], width = 1, distance = 5, up = true } = {}, rowOf) {
  const held = distortionFieldOf(talents, rowOf);
  if (!held || !held.feet || up !== true) return null;
  return { name: held.name, feet: held.feet, radiusFt: fieldRadius({ feet: held.feet, width, distance }), who: held.who };
}
