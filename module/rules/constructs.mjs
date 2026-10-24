/**
 * **THE TINKER'S CONSTRUCTS** (the Legacy branches' door 6). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * 04's Tinker: *You build constructs from the **Constructs** table below, one whose
 * tier is no higher than yours. Building one takes a Short Rest and a tinker's kit,
 * and so does rebuilding one wrecked at 0 Health. You hold one at a time. Your
 * constructs act on your Initiative using their blocks in 14-BESTIARY, and between
 * them take one Half-Action and one Reaction each turn.* (The Bench.)
 *
 * A construct is D-643's sixth bound kind (`rules/bound.mjs#BOUND_KINDS`): a world
 * actor made from its 14 block, held until released, its token placed beside the
 * tinker (door 4). What this module holds:
 *
 * - `CONSTRUCTS`: 04's own table, read back off the chapter by the Vitest, with the
 *   rebuild each takes (*Rebuilding a wrecked one takes a Long Rest*, the Arcanite
 *   Dragonling's own words).
 * - `constructsFor`: what the tinker's talents give, off the `constructs` row kind -
 *   `holds` (The Bench's one, Assembly Line's second), `halfActions` (Remote
 *   Control's two), `reactions`, `health` and `ap` (Reinforced Plating), `damage`
 *   (Engineering Upgrade), `finisher` and `buildsCombo` (Supercharge), `tenMinutes`
 *   (Arclight Spanner at rank 2), each with `atRank`.
 * - `constructEligible` and `rebuildTime`.
 * - **THE SHARED TURN** (the lead, phase 0: *one shared construct turn (one
 *   Half-Action and a Reaction, or two Half-Actions with Remote Control)*): a record
 *   on the OWNER's combatant (`CONSTRUCT_TURN_FLAG`, one of `turn-stamp.mjs
 *   #BOOKKEEPING_FLAGS`) of what the owner's constructs have spent since the owner's
 *   own turn began (cleared there, never by the round: the B2 review), and a
 *   VIEW of each construct's own budget clamped by what is left of it
 *   (`sharedView`). `AzerothCombatant#budget` reads the view; the construct's own
 *   queued doors write the record through the owner's own queued door, so every
 *   reader - the tracker, the movement limit, a Use's refusal - sees the shared
 *   limit and nothing writes the budget beside the queue (D-761).
 *
 * **Wrecked** is a construct at 0 Health: it stays held (it is not released at the
 * fight's end, as a summon is) and takes no healing until The Bench rebuilds it -
 * MY READING, for the lead: *rebuilding one wrecked at 0 Health* takes a rest, so a
 * heal does not stand it up.
 */

import { evaluateExpression } from "./expressions.mjs";
import { talentEffect } from "./talent-effects.mjs";

/**
 * 04's **Constructs** table: the four The Bench builds, by tier. Pocket Factory's
 * Clockwork Gnomes are not on it (*They are not constructs you hold*).
 */
export const CONSTRUCTS = Object.freeze([
  Object.freeze({ name: "Gnomish Battle Chicken", tier: 1, rebuild: "short" }),
  Object.freeze({ name: "Mechanical Dragonling", tier: 2, rebuild: "short" }),
  Object.freeze({ name: "Mithril Mechanical Dragonling", tier: 3, rebuild: "short" }),
  Object.freeze({ name: "Arcanite Dragonling", tier: 4, rebuild: "long" })
]);

/** The flag the owner's combatant keeps the shared turn under. */
export const CONSTRUCT_TURN_FLAG = "constructTurn";

/** The gear item a build needs (*a tinker's kit*), by identifier. */
export const CONSTRUCT_KIT = "tinkers-kit";

/** How long a rebuild takes, in the rest vocabulary the card says it in. */
export const REBUILD_TIMES = Object.freeze(["tenMinutes", "short", "long"]);

/** Why a build is refused, each said in words (`AZEROTH.Construct.Refuse.*`). */
export const CONSTRUCT_REFUSALS = Object.freeze({
  inFight: "AZEROTH.Construct.Refuse.InFight",
  noKit: "AZEROTH.Construct.Refuse.NoKit",
  tier: "AZEROTH.Construct.Refuse.Tier",
  notOnTable: "AZEROTH.Construct.Refuse.NotOnTable",
  standing: "AZEROTH.Construct.Refuse.Standing"
});

/** A construct on the table, by name, or null. */
export function constructNamed(name) {
  return CONSTRUCTS.find(c => c.name === name) ?? null;
}

/** A row's clauses at a rank. */
function atRank(row, rank) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of Array.isArray(row?.atRank) ? row.atRank : []) {
    if (rank >= (Math.trunc(Number(clause?.rank)) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/** An expression at a scope, a whole number never below 0. */
function amount(expr, scope) {
  if (expr === null || expr === undefined || expr === "") return 0;
  const n = typeof expr === "number" ? expr : evaluateExpression(String(expr), scope);
  return Math.max(0, Math.trunc(Number(n)) || 0);
}

/**
 * **WHAT THE TINKER'S TALENTS GIVE THEIR CONSTRUCTS**, off every taken `constructs`
 * row at its rank: `holds` summed (The Bench's one and Assembly Line's second),
 * `halfActions` and `reactions` the largest any row names (Remote Control's *two
 * Half-Actions each turn between them, rather than one*), the Health, Armor Points
 * and damage summed, and the flags any row sets.
 *
 * @param {Array<{identifier: string, className?: string, race?: string|null, name: string, taken: number}>} talents
 * @param {{tier?: number}} [scope]
 * @param {Function} [rowOf]
 * @returns {{holds: number, halfActions: number, reactions: number, health: number, ap: number, damage: number,
 *   finisher: boolean, buildsCombo: boolean, tenMinutes: boolean, by: string[]}}
 */
export function constructsFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const out = { holds: 0, halfActions: 0, reactions: 0, health: 0, ap: 0, damage: 0, finisher: false, buildsCombo: false, tenMinutes: false, by: [] };
  const rows = (talents ?? [])
    .filter(t => (Math.trunc(Number(t?.taken)) || 0) > 0)
    .map(t => ({ t, row: rowOf(t.className, t.identifier, t.race ?? null)?.constructs ?? null }))
    .filter(r => r.row && typeof r.row === "object")
    .sort((a, b) => String(a.t.identifier).localeCompare(String(b.t.identifier)));
  for (const { t, row: raw } of rows) {
    const rank = Math.max(1, Math.trunc(Number(t.taken)) || 1);
    const row = atRank(raw, rank);
    const scope = { rank, tier: Math.max(1, Math.trunc(Number(tier)) || 1) };
    out.holds += amount(row.holds, scope);
    out.halfActions = Math.max(out.halfActions, amount(row.halfActions, scope));
    out.reactions = Math.max(out.reactions, amount(row.reactions, scope));
    out.health += amount(row.health, scope);
    out.ap += amount(row.ap, scope);
    out.damage += amount(row.damage, scope);
    if (row.finisher === true) out.finisher = true;
    if (row.buildsCombo === true) out.buildsCombo = true;
    if (row.tenMinutes === true) out.tenMinutes = true;
    out.by.push(t.name);
  }
  return out;
}

/**
 * **HOW MANY CONSTRUCTS THE TINKER MAY HOLD**: what the rows give, and one where
 * none says (The Bench's *You hold one at a time*).
 *
 * @param {ReturnType<typeof constructsFor>} given
 * @returns {number}
 */
export function constructCapacity(given = {}) {
  const n = Math.trunc(Number(given?.holds)) || 0;
  return n > 0 ? n : 1;
}

/**
 * **WHETHER A CONSTRUCT MAY BE BUILT**: one of the table's, *whose tier is no higher
 * than yours*. A lang key's tail, or null.
 *
 * @param {{name?: string}} entry
 * @param {{tier?: number}} o  the character's
 * @returns {{ok: boolean, reason: string|null}}
 */
export function constructEligible(entry = {}, { tier = 1 } = {}) {
  const row = constructNamed(entry?.name);
  if (!row) return { ok: false, reason: "notOnTable" };
  if (row.tier > (Math.trunc(Number(tier)) || 1)) return { ok: false, reason: "tier" };
  return { ok: true, reason: null };
}

/**
 * **HOW LONG A REBUILD TAKES**: a Long Rest for the Arcanite Dragonling, else a
 * Short Rest - or ten minutes with Arclight Spanner at rank 2 (*rebuilding a
 * wrecked construct takes ten minutes rather than a Short Rest*), which shortens
 * only what a Short Rest would have taken (MY READING, for the lead).
 *
 * @param {{name?: string, tenMinutes?: boolean}} o
 * @returns {"tenMinutes"|"short"|"long"}
 */
export function rebuildTime({ name = "", tenMinutes = false } = {}) {
  const row = constructNamed(name);
  if (row?.rebuild === "long") return "long";
  return tenMinutes === true ? "tenMinutes" : "short";
}

/**
 * **WHETHER A CONSTRUCT IS WRECKED** (*wrecked at 0 Health*): a bound construct at
 * 0 Health. A wrecked one takes no healing until it is rebuilt.
 *
 * @param {{kind?: string|null, health?: number|null}} o
 */
export function isWrecked({ kind = null, health = null } = {}) {
  return kind === "construct" && Number.isFinite(Number(health)) && Number(health) <= 0;
}

/* -------------------------------------------- */
/*  The shared turn                              */
/* -------------------------------------------- */

/**
 * **WHAT THE OWNER'S CONSTRUCTS TAKE BETWEEN THEM EACH TURN**: one Half-Action and
 * one Reaction (The Bench), or the most the rows say (Remote Control's two).
 *
 * @param {ReturnType<typeof constructsFor>} given
 * @returns {{halfActions: number, reactions: number}}
 */
export function sharedAllowance(given = {}) {
  return {
    halfActions: Math.max(1, Math.trunc(Number(given?.halfActions)) || 0),
    reactions: Math.max(1, Math.trunc(Number(given?.reactions)) || 0)
  };
}

/** The shared record as stored, cleaned: the round, what was spent, and what was granted beside the allowance. */
export function cleanShared(raw) {
  if (!raw || typeof raw !== "object") return null;
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  return { round: Math.trunc(Number(raw.round)) || 0, halves: n(raw.halves), reactions: n(raw.reactions), extra: n(raw.extra) };
}

/**
 * **WHAT IS LEFT OF THE SHARED TURN**: the allowance and anything granted beside it,
 * less what was spent - the record standing now. *Each turn* is the OWNER's (the B2
 * review): the record is cleared at the start of the tinker's own turn
 * (`AzerothCombatant#resetConstructTurn`, from `AzerothCombat#_onStartTurn`) and is
 * not keyed on the round - keyed on the round, a fight whose enemy side acts first let
 * two Reactions fall between one of the tinker's turns and the next.
 *
 * @param {object|null} record
 * @param {{halfActions: number, reactions: number}} allowance
 * @returns {{halfActions: number, reactions: number}}
 */
export function sharedTurnLeft(record, allowance) {
  const r = cleanShared(record);
  const a = { halfActions: Math.max(0, Math.trunc(Number(allowance?.halfActions)) || 0), reactions: Math.max(0, Math.trunc(Number(allowance?.reactions)) || 0) };
  if (!r) return a;
  return { halfActions: Math.max(0, a.halfActions + r.extra - r.halves), reactions: Math.max(0, a.reactions - r.reactions) };
}

/**
 * **THE SHARED TURN WITH A SPEND GIVEN BACK** (the B2 review: the GM's undo,
 * `AzerothCombatant#restoreAction`, put the Half-Action or the Reaction back on the
 * construct and left the tinker's record holding it): the record less what is
 * refunded, never below nothing. Null where there is no record to refund.
 *
 * @param {object|null} record
 * @param {{halves?: number, reactions?: number}} refunded
 * @returns {object|null}
 */
export function sharedTurnRefunded(record, { halves = 0, reactions = 0 } = {}) {
  const r = cleanShared(record);
  if (!r) return null;
  return {
    ...r,
    halves: Math.max(0, r.halves - Math.max(0, Math.trunc(Number(halves)) || 0)),
    reactions: Math.max(0, r.reactions - Math.max(0, Math.trunc(Number(reactions)) || 0))
  };
}

/**
 * **THE SHARED TURN AFTER A SPEND**: the record with the Half-Actions and the
 * Reaction a construct has just spent added, refused where the shared turn has not
 * got them. `halves` and `reactions` are what the construct's own spend took.
 * `force` records it whatever is left - a walk already made, which the movement
 * door charges after the fact (D-718's backstop) and cannot take back.
 *
 * @param {object|null} record
 * @param {number} round  the fight's round now, stamped on a record begun now (a note
 *   for a reader; the record's window is the tinker's turn, not the round)
 * @param {{halves?: number, reactions?: number}} spent
 * @param {{halfActions: number, reactions: number}} allowance
 * @param {{force?: boolean}} [o]
 * @returns {{ok: boolean, record: object, refusal: string|null}}
 */
export function sharedTurnAfter(record, round, { halves = 0, reactions = 0 } = {}, allowance, { force = false } = {}) {
  const now = Math.trunc(Number(round)) || 0;
  const base = cleanShared(record) ?? { round: now, halves: 0, reactions: 0, extra: 0 };
  const left = sharedTurnLeft(base, allowance);
  const h = Math.max(0, Math.trunc(Number(halves)) || 0);
  const x = Math.max(0, Math.trunc(Number(reactions)) || 0);
  const added = { ...base, halves: base.halves + h, reactions: base.reactions + x };
  if (force === true) return { ok: true, record: added, refusal: null };
  if (h > left.halfActions) return { ok: false, record: base, refusal: "AZEROTH.Construct.SharedHalves" };
  if (x > left.reactions) return { ok: false, record: base, refusal: "AZEROTH.Construct.SharedReaction" };
  return { ok: true, record: added, refusal: null };
}

/**
 * **A HALF-ACTION GRANTED BESIDE THE SHARED TURN** (Remote Control at rank 2: *one
 * of your constructs within 60 feet takes a Half-Action at once*): the record with
 * one more this round.
 *
 * @param {object|null} record
 * @param {number} round
 * @param {number} [n]
 */
export function sharedTurnGranted(record, round, n = 1) {
  const now = Math.trunc(Number(round)) || 0;
  const base = cleanShared(record) ?? { round: now, halves: 0, reactions: 0, extra: 0 };
  return { ...base, extra: base.extra + Math.max(0, Math.trunc(Number(n)) || 0) };
}

/**
 * **A CONSTRUCT'S BUDGET AS THE SHARED TURN LEAVES IT**: its own Half-Actions and
 * Reaction, each no more than the shared turn has left. Every other key is the
 * construct's own.
 *
 * @param {object} budget  the construct's own
 * @param {{halfActions: number, reactions: number}} left  `sharedTurnLeft`'s
 * @returns {object}
 */
export function sharedView(budget, left) {
  if (!budget || typeof budget !== "object") return budget;
  return {
    ...budget,
    halfActions: Math.min(Math.max(0, Number(budget.halfActions) || 0), Math.max(0, Number(left?.halfActions) || 0)),
    reactions: Math.min(Math.max(0, Number(budget.reactions) || 0), Math.max(0, Number(left?.reactions) || 0))
  };
}

/**
 * **THE VIEW IS THE CLAMP, NEVER THE STORE** (the Legacy branches' door 6; found live in
 * B8b): a construct's own budget after a write judged on its shared view. The spend, the
 * undo or the walk's charge moves the construct's OWN Half-Actions and Reaction by what
 * it moved the view, and every other key is the write's. The doors wrote the view itself
 * as the construct's own budget, so a construct holding 05's two Half-Actions, seeing the
 * shared turn's one, spent it and was left with none of its own: Remote Control's granted
 * Half-Action then landed on the tinker's record and reached nobody who had acted.
 *
 * @param {object} own     the construct's own budget as stored (`_ownBudget`)
 * @param {object} before  the view the write was judged on
 * @param {object} after   the view the write produced
 * @param {{cap?: {halfActions?: number, reactions?: number}|null}} [o]  the ceiling an
 *   undo may not lift the construct's own past (its fresh turn)
 * @returns {object}  the budget to store
 */
export function ownAfterShared(own, before, after, { cap = null } = {}) {
  if (!after || typeof after !== "object") return after;
  if (!own || typeof own !== "object") return after;
  const n = v => Math.max(0, Number(v) || 0);
  const moved = key => {
    const next = n(own[key]) + (n(after[key]) - n(before?.[key]));
    const ceiling = Number(cap?.[key]);
    return Math.max(0, Number.isFinite(ceiling) ? Math.min(ceiling, next) : next);
  };
  return { ...after, halfActions: moved("halfActions"), reactions: moved("reactions") };
}

/**
 * **WHAT A CONSTRUCT'S SPEND TOOK**, between the view it was judged against and the
 * budget it wrote: the Half-Actions and the Reaction, never below 0.
 *
 * @param {object} before  the view
 * @param {object} after   the budget written
 * @returns {{halves: number, reactions: number}}
 */
export function sharedSpent(before, after) {
  return {
    halves: Math.max(0, (Number(before?.halfActions) || 0) - (Number(after?.halfActions) || 0)),
    reactions: Math.max(0, (Number(before?.reactions) || 0) - (Number(after?.reactions) || 0))
  };
}
