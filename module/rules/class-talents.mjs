/**
 * **THE WARRIOR'S AND THE PALADIN'S KINDS** (04-TALENTS; D-772, the talent
 * plan's Phases 4 and 5). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * `rules/talent-effects.mjs` holds the rows; this holds what each new kind is
 * READ as, one function a kind, each called by ONE door (named beside it), and
 * `warrior-talents.test.mjs` / `paladin-talents.test.mjs` hold every number a
 * row carries to 04's own Effect cell.
 *
 *   calledShot    `{headModifier}`: Heavy Hand's *you do not suffer the −2* on a
 *                 called shot to the Head (`rollTest`, and the dialog's line)
 *   hitLays       `{sl, condition, value}`: a condition laid on the target by an
 *                 attack reaching an SL (Deep Cut), landing as a rider's does
 *   critical      `{on, below, atRank}`: a Critical Injury on `on` or better
 *                 against a target below a share of its Health (Executioner)
 *   targetBoon    `{kind, boons, below, atRank}`: a Boon on a Test against a
 *                 target below a share of its Health (Hammer of Wrath), an
 *                 automatic line on the dialog
 *   kill          `{halfActions, gain, nextAttack, atRank}`: what an attack or
 *                 effect of yours reducing a target to 0 gives (Follow Through,
 *                 Rampage), from `applyDamage`'s one door (`afterBlow`)
 *   allyDown      `{feet, self, nextAttack}`: what a friendly target dropping to
 *                 0 within reach gives (Vengeance), from the same door
 *   turnStart     `{heal, while}`: Health at the start of each of your turns
 *                 while a pool holds more than a number (Blood Craze)
 *   extraStrike   `{sl, trait, count, target, rating, atRank}`: one extra attack
 *                 off a card at an SL, `count` a round (Flurry; Wide Swing's
 *                 Cleave, which needs the trait on the blow)
 *   freeReaction  `{reaction, count}`: the first N Parries or Blocks a round cost
 *                 no Reaction (Bladeturn, Deflection)
 *   block         `{add, allyWithin}`: what a Block takes off beyond 06's four
 *                 (Redoubt; Shield Wall while a friendly target is near)
 *   blockRetort   `{amount, type}`: the attacker takes damage when you Block
 *                 (Holy Shield)
 *   offHand       `{noPenalty}`: an Off-Hand Attack without 06 §2's −2 (Second
 *                 Strike)
 *   reckless      `{boons, exposed, atRank}`: a Boon on your attacks, and attacks
 *                 against you gain one until your next turn (Reckless)
 *   unanswerable  `true`: your attacks cannot be Parried or Blocked (Titan's
 *                 Presence)
 *   manaBack      `{sl, amount}`: Mana back on a Casting Test at an SL
 *                 (Illumination)
 *   rest          `{short: {mana, drink}}`: what a rest returns beyond 05's
 *                 (Light's Reserve)
 *   freeHealing   `true`: a healing feature costs no Mana while the counter the
 *                 talent grants has a use (Divine Favor)
 *   steadfast     `{immune, speedFloor}`: conditions refused and a Speed that
 *                 cannot be reduced (Unyielding)
 *   plate         `{ward, fromBodyAP, atRank}`: Ward against the school named
 *                 at a Long Rest (Blessed Plate; Warded Plate off the Body AP)
 *   beacon        `{share, feet}`: half of what another creature restores from
 *                 your healing, on the creature named (Beacon)
 *
 * And `onUse` gained `nextAttack` (Precise Strike), `laysBane` (Taunt,
 * Judgement), `laysBoon` (Blessing), `plate` and `beacon` (the Use that names a
 * school or a creature after a Long Rest) - read by `workflows.useFeature` off
 * the granting talent's row, every refusal asked before anything is paid.
 */

import { talentEffect } from "./talent-effects.mjs";
import { evaluateAmount } from "./class-features.mjs";
// A Use's area that strikes at the start of a turn takes D-756's whole shape
// (04's Firestorm, D-775).
import { emptyAreaTick } from "./area-ticks.mjs";
// Rupture's *twice the Combo Points spent plus your rank* names `spent`, which a
// feature's scope does not carry (D-773): the riders' own evaluator reads it.
import { evaluateExpression } from "./expressions.mjs";
// The ONE hold at 1 Health (D-777): Cauterize's catch reads it, and so do
// Intervention, Spirit Shell, Guardian Spirit and 07's Aegis of the Light.
import { ASKED_HOLDS, heldAt } from "./blow-doors.mjs";
// What a grant of temporary Health is (05; D-777).
import { TEMP_SPANS } from "./temporary-health.mjs";

/** A taken talent's rank, a whole number from 1. */
const rankOf = talent => Math.max(1, Math.trunc(Number(talent?.taken) || 0));

/** An expression at a scope, a whole number never below nothing. */
const amount = (expr, scope = {}) => {
  if (expr === null || expr === undefined) return 0;
  return Math.max(0, Math.trunc(Number(evaluateAmount(typeof expr === "number" ? expr : String(expr), scope))) || 0);
};

/**
 * The taken talents carrying a row of one kind, each with its row and rank, in
 * a stable order (by identifier) because what they come to is read by a person.
 *
 * @param {Array} talents  `AzerothActor#takenTalents`' rows
 * @param {string} kind
 * @param {Function} [rowOf]  the table lookup, injectable for a test
 */
function rowsOfKind(talents = [], kind, rowOf = talentEffect) {
  const out = [];
  for (const t of talents ?? []) {
    if (!(Math.trunc(Number(t?.taken) || 0) > 0)) continue;
    const entry = rowOf(t.className, t.identifier, t.race ?? null);
    const row = entry?.[kind];
    if (row === undefined || row === null || row === false) continue;
    out.push({ talent: t, entry, row, rank: rankOf(t) });
  }
  return out.sort((a, b) => String(a.talent.identifier).localeCompare(String(b.talent.identifier)));
}

/**
 * A row's clauses at a rank: the row, with every `atRank` clause the rank has
 * reached laid over it (the `modifies` patch's and the rider's own shape).
 *
 * @param {object} row
 * @param {number} rank
 * @returns {object}
 */
export function atRankOf(row, rank = 1) {
  const out = { ...(row ?? {}) };
  delete out.atRank;
  for (const clause of row?.atRank ?? []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(out, rest);
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  The attack                                   */
/* -------------------------------------------- */

/**
 * **HEAVY HAND** (04: *When making a called shot to the Head, you do not suffer
 * the −2 to your Attack Test*): the Head's modifier, or null where no talent
 * changes it. `rules/modifiers.mjs#calledShotCost` takes it.
 *
 * @param {Array} talents
 * @returns {{headModifier: number|null, by: string[]}}
 */
export function calledShotFor(talents = [], rowOf = talentEffect) {
  const rows = rowsOfKind(talents, "calledShot", rowOf).filter(r => Number.isFinite(Number(r.row.headModifier)));
  if (!rows.length) return { headModifier: null, by: [] };
  return { headModifier: Math.max(...rows.map(r => Math.trunc(Number(r.row.headModifier)))), by: rows.map(r => r.talent.name) };
}

/**
 * **A CONDITION AN ATTACK LAYS AT AN SL** (04's Deep Cut: *When an attack of
 * yours reaches SL 2, the target gains Bleeding equal to your rank in this
 * talent*): one row a talent the blow reached, its value at the rank. Nothing
 * on a miss, and a value that comes to nothing lays nothing (*Bleeding 0* is not
 * a condition, the rider's rule).
 *
 * @param {Array} talents
 * @param {{sl?: number, hit?: boolean}} o
 * @returns {Array<{identifier: string, name: string, id: string, value: number|null}>}
 */
export function hitConditionsFor(talents = [], { sl = 0, hit = false } = {}, rowOf = talentEffect) {
  if (!hit) return [];
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "hitLays", rowOf)) {
    if (!row.condition) continue;
    if ((Math.trunc(Number(sl)) || 0) < (Number(row.sl) || 0)) continue;
    if (row.value === null || row.value === undefined) {
      out.push({ identifier: talent.identifier, name: talent.name, id: row.condition, value: null });
      continue;
    }
    const n = amount(row.value, { rank });
    if (n > 0) out.push({ identifier: talent.identifier, name: talent.name, id: row.condition, value: n });
  }
  return out;
}

/**
 * Whether a target stands below a share of its Health. Null - nothing known -
 * is never below anything: a target with no Health recorded is not judged.
 *
 * @param {{value?: number, max?: number}|null} health
 * @param {number} below  a share, 0.5 for *half*
 */
export function healthBelow(health, below) {
  const max = Number(health?.max);
  const value = Number(health?.value);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return false;
  return value < max * Number(below);
}

/**
 * **EXECUTIONER** (04: *You inflict a Critical Injury on 19 or 20 against a
 * target below half Health. At rank 2 this applies below three quarters*): the
 * lowest natural die that inflicts one against this target, or null.
 *
 * @param {Array} talents
 * @param {{health?: {value: number, max: number}|null}} o  the target's
 * @returns {{on: number|null, by: string[]}}
 */
export function criticalOnFor(talents = [], { health = null } = {}, rowOf = talentEffect) {
  let on = null;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "critical", rowOf)) {
    const r = atRankOf(row, rank);
    if (!Number.isFinite(Number(r.on)) || !healthBelow(health, r.below)) continue;
    on = on === null ? Number(r.on) : Math.min(on, Number(r.on));
    by.push(talent.name);
  }
  return { on, by };
}

/**
 * **HAMMER OF WRATH** (04: *Your attacks gain a Boon against a target below half
 * Health. At rank 2 this applies below three quarters*): the Boons on this kind
 * of Test against this target, and the talents giving them.
 *
 * @param {Array} talents
 * @param {{kind?: string, health?: object|null}} o
 * @returns {{boons: number, by: string[]}}
 */
export function targetBoonsFor(talents = [], { kind = "attack", health = null } = {}, rowOf = talentEffect) {
  let boons = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "targetBoon", rowOf)) {
    const r = atRankOf(row, rank);
    if (r.kind !== kind || !healthBelow(health, r.below)) continue;
    const n = Math.max(0, Math.trunc(Number(r.boons ?? 1)) || 0);
    if (!n) continue;
    boons += n;
    by.push(talent.name);
  }
  return { boons, by };
}

/**
 * **SECOND STRIKE'S FIRST SENTENCE** (04: *Your Off-Hand Attacks do not take the
 * −2*): whether 06 §2's −2 is waived, and by whom.
 *
 * @param {Array} talents
 * @returns {{waived: boolean, by: string[]}}
 */
export function offHandPenaltyFor(talents = [], rowOf = talentEffect) {
  const rows = rowsOfKind(talents, "offHand", rowOf).filter(r => r.row.noPenalty === true);
  return { waived: rows.length > 0, by: rows.map(r => r.talent.name) };
}

/**
 * **RECKLESS** (04: *Your attacks gain a Boon. Until your next turn, attacks
 * against you gain one too. At rank 2 only ranged attacks do*): the Boon the
 * holder's attacks take, and the exposure an attack made with it lays on the
 * holder. Null where no talent says so.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, boons: number, exposed: {boons: number, ranged: boolean}}|null}
 */
export function recklessFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "reckless", rowOf);
  if (!first) return null;
  const r = atRankOf(first.row, first.rank);
  return {
    identifier: first.talent.identifier,
    name: first.talent.name,
    boons: Math.max(0, Math.trunc(Number(r.boons ?? 1)) || 0),
    exposed: { boons: Math.max(0, Math.trunc(Number(r.exposed?.boons ?? 1)) || 0), ranged: r.exposed?.ranged === true }
  };
}

/** The flag Reckless's exposure stands under, on the holder's own effect. */
export const EXPOSED_FLAG = "exposed";

/**
 * **WHAT AN ATTACK AGAINST AN EXPOSED CREATURE TAKES** (Reckless's *attacks
 * against you gain one too*; at rank 2 *only ranged attacks do*): the Boons off
 * the target's standing exposures, for a blow of this range.
 *
 * @param {Array<{boons: number, ranged: boolean, source?: string}>} exposures  the target's flags
 * @param {{range?: "melee"|"ranged"|null}} o
 * @returns {{boons: number, names: string[], judged: {boons: number, names: string[]}}}
 *   `judged` where the blow's range is not known and only the table can say
 */
export function exposedBoonsOn(exposures = [], { range = null } = {}) {
  const out = { boons: 0, names: [], judged: { boons: 0, names: [] } };
  for (const e of exposures ?? []) {
    const n = Math.max(0, Math.trunc(Number(e?.boons)) || 0);
    if (!n) continue;
    const name = String(e?.source ?? "");
    if (e.ranged === true && range === null) {
      out.judged.boons += n;
      if (name) out.judged.names.push(name);
      continue;
    }
    if (e.ranged === true && range !== "ranged") continue;
    out.boons += n;
    if (name) out.names.push(name);
  }
  return out;
}

/**
 * **TITAN'S PRESENCE** (04: *Your attacks cannot be Parried or Blocked*):
 * whether the attacker's blows offer the defender no Parry and no Block.
 *
 * @param {Array} talents  the ATTACKER's
 */
export function unanswerableFor(talents = [], rowOf = talentEffect) {
  return rowsOfKind(talents, "unanswerable", rowOf).length > 0;
}

/**
 * **THE EXTRA ATTACKS A CARD OFFERS** (04's Flurry: *Once a round, when an
 * attack reaches SL 2, make one extra attack against the same target. At rank 2
 * this may happen twice a round*; Wide Swing: *Cleave triggers on SL 3 rather
 * than only when an attack you made reduces a target to 0 Health. At rank 2 it
 * triggers on SL 2* - 08 §5's Cleave being *one attack against another target
 * within reach at Damage Rating −2. Once per round*). One a talent the blow
 * reached, with how many a round it allows; Wide Swing only on a blow whose
 * weapon carries Cleave.
 *
 * @param {Array} talents
 * @param {{sl?: number, hit?: boolean, traits?: string[]}} o
 * @returns {Array<{identifier: string, name: string, count: number, target: "same"|"other", rating: number, trait: string|null}>}
 */
export function extraStrikesFor(talents = [], { sl = 0, hit = false, traits = [] } = {}, rowOf = talentEffect) {
  if (!hit) return [];
  const held = (traits ?? []).map(t => String(t ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase());
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "extraStrike", rowOf)) {
    const r = atRankOf(row, rank);
    if ((Math.trunc(Number(sl)) || 0) < (Number(r.sl) || 0)) continue;
    if (r.trait && !held.includes(String(r.trait).toLowerCase())) continue;
    const n = amount(r.count ?? 1, { rank });
    if (n < 1) continue;
    out.push({
      identifier: talent.identifier, name: talent.name, count: n,
      target: r.target === "other" ? "other" : "same",
      rating: Math.trunc(Number(r.rating)) || 0,
      trait: r.trait ?? null
    });
  }
  return out;
}

/**
 * **THE NEXT ONE-OF-N MARK A ROUND ALLOWS** (Flurry's *twice a round*,
 * Bladeturn's *the second costs none either*): the first of
 * `<identifier>:1` .. `<identifier>:<count>` the round's record does not hold,
 * or null where every one is spent. The record is the combatant's `round` flag,
 * marked through the queued door `markRoundOnce` (D-761), which answers whether
 * THIS write made the mark.
 *
 * @param {string} identifier
 * @param {number} count
 * @param {string[]} used  the round record's `once` list
 * @returns {string|null}
 */
export function nextRoundMark(identifier, count, used = []) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  for (let i = 1; i <= n; i++) {
    const key = `${identifier}:${i}`;
    if (!(used ?? []).includes(key)) return key;
  }
  return null;
}

/**
 * How many of a talent's marks a round still holds (04's Riptide: *once a round,
 * or twice a round at rank 2*; D-774), for a line that says how many are left.
 *
 * @param {string} identifier
 * @param {number} count
 * @param {string[]} used  the round record's `once` list
 */
export function roundMarksLeft(identifier, count, used = []) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  let left = 0;
  for (let i = 1; i <= n; i++) if (!(used ?? []).includes(`${identifier}:${i}`)) left++;
  return left;
}

/* -------------------------------------------- */
/*  Reactions                                    */
/* -------------------------------------------- */

/**
 * **A REACTION THAT COSTS NO REACTION** (04's Bladeturn: *Your first Parry each
 * round costs no Reaction. At rank 2 the second costs none either*;
 * Deflection: the same of Block): how many a round, and the talent, or null.
 *
 * @param {Array} talents
 * @param {"parry"|"block"} reaction
 * @returns {{identifier: string, name: string, count: number}|null}
 */
export function freeReactionsFor(talents = [], reaction, rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "freeReaction", rowOf)) {
    if (row.reaction !== reaction) continue;
    const count = amount(row.count ?? 1, { rank });
    if (count > 0) return { identifier: talent.identifier, name: talent.name, count };
  }
  return null;
}

/**
 * **WHAT A BLOCK TAKES OFF BEYOND 06's FOUR, FROM THE TALENTS** (04's Redoubt:
 * *Your Block reduces 1 more damage per rank*; Shield Wall: *While a friendly
 * target is within 5 feet of you, your Block reduces 1 more damage per rank*).
 *
 * @param {Array} talents
 * @param {{allyNear?: boolean}} o  a friendly target (other than the blocker)
 *   within 5 feet, as the Block's door measured it
 * @returns {{bonus: number, rows: Array<{name: string, amount: number}>}}
 */
export function blockBonusFor(talents = [], { allyNear = false } = {}, rowOf = talentEffect) {
  const rows = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "block", rowOf)) {
    if (row.allyWithin && allyNear !== true) continue;
    const n = amount(row.add ?? "rank", { rank });
    if (n > 0) rows.push({ name: talent.name, amount: n });
  }
  return { bonus: rows.reduce((s, r) => s + r.amount, 0), rows };
}

/** The feet within which Shield Wall's friendly target must stand, or null where no talent asks. */
export function blockAllyFeet(talents = [], rowOf = talentEffect) {
  const feet = rowsOfKind(talents, "block", rowOf).map(r => Number(r.row.allyWithin)).filter(n => Number.isFinite(n) && n > 0);
  return feet.length ? Math.max(...feet) : null;
}

/**
 * **HOLY SHIELD** (04: *Whenever you Block, the attacker takes Holy damage equal
 * to your rank*): what the attacker takes, or null.
 *
 * @param {Array} talents  the BLOCKER's
 * @returns {{name: string, amount: number, type: string}|null}
 */
export function blockRetortFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "blockRetort", rowOf);
  if (!first) return null;
  const n = amount(first.row.amount ?? "rank", { rank: first.rank });
  return n > 0 ? { name: first.talent.name, amount: n, type: first.row.type ?? null } : null;
}

/* -------------------------------------------- */
/*  A kill, a fall, a turn                       */
/* -------------------------------------------- */

/**
 * **WHAT A KILL GIVES** (04's Follow Through: *When an attack or effect of yours
 * reduces a target to 0 Health, your next attack this round gains a Boon. At
 * rank 2 you also gain a Half-Action*; Rampage: *... gain a Half-Action. At rank
 * 2 you also gain 2 Rage*), summed over every talent the attacker holds.
 *
 * **AND SHADOWBURN** (04: *A spell of yours that reduces a target to 0 Health
 * returns 3 Mana per rank to you*; D-775): a row marked `spell` pays out only on
 * a blow a SPELL dealt - its card, its area's tick or its laid tick - which the
 * damage door says (`spell`).
 *
 * @param {Array} talents  the ATTACKER's
 * @param {Function} [rowOf]
 * @param {{spell?: boolean}} [o]  whether the killing blow was a spell's
 * @returns {{halfActions: number, gains: Array<{pool: string, amount: number}>,
 *   nextAttack: Array<{source: string, name: string, boons: number, lasts: string}>, by: string[]}}
 */
export function killRewardsFor(talents = [], rowOf = talentEffect, { spell = false } = {}) {
  const out = { halfActions: 0, gains: [], nextAttack: [], by: [] };
  for (const { talent, row, rank } of rowsOfKind(talents, "kill", rowOf ?? talentEffect)) {
    const r = atRankOf(row, rank);
    if (r.spell === true && spell !== true) continue;
    // A row that only offers another attack (04's Killing Spree and Beast Frenzy,
    // D-773) gives the kill's maker nothing here: `killStrikesFor` reads it.
    if (!r.halfActions && !r.gain && !r.nextAttack) continue;
    out.halfActions += Math.max(0, Math.trunc(Number(r.halfActions)) || 0);
    if (r.gain?.pool && amount(r.gain.amount, { rank }) > 0) out.gains.push({ pool: r.gain.pool, amount: amount(r.gain.amount, { rank }) });
    if (r.nextAttack) {
      out.nextAttack.push({
        source: talent.identifier, name: talent.name,
        boons: amount(r.nextAttack.boons ?? 0, { rank }), penetration: amount(r.nextAttack.penetration ?? 0, { rank }),
        damage: amount(r.nextAttack.damage ?? 0, { rank }), lasts: r.nextAttack.lasts
      });
    }
    out.by.push(talent.name);
  }
  return out;
}

/**
 * **VENGEANCE** (04: *When a friendly target within 20 feet drops to 0 Health,
 * your next attack this encounter adds your tier per rank to its damage*): the
 * promise one holder lays when a friendly target falls in reach, and the reach.
 * **The holder's own fall lays nothing** (MY READING, for the lead): it is 02's
 * fallen-friend Zeal's wording, on which the lead ruled *"Others only"* (D-768).
 *
 * @param {Array} talents  the HOLDER's
 * @param {{tier?: number}} o
 * @returns {{feet: number, self: boolean, grants: Array<object>}|null}
 */
export function allyDownFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const rows = rowsOfKind(talents, "allyDown", rowOf);
  if (!rows.length) return null;
  const grants = rows.map(({ talent, row, rank }) => ({
    source: talent.identifier, name: talent.name,
    boons: amount(row.nextAttack?.boons ?? 0, { rank, tier }),
    penetration: amount(row.nextAttack?.penetration ?? 0, { rank, tier }),
    damage: amount(row.nextAttack?.damage ?? 0, { rank, tier }),
    lasts: row.nextAttack?.lasts ?? "encounter"
  }));
  return {
    feet: Math.max(...rows.map(r => Number(r.row.feet) || 0)),
    self: rows.some(r => r.row.self === true),
    grants
  };
}

/**
 * **WHETHER A FALL LAYS VENGEANCE'S PROMISE ON ONE HOLDER** (04: *When a friendly
 * target within 20 feet drops to 0 Health*; D-772): ANOTHER creature on the
 * holder's side (MY READING, the lead's *"Others only"*, D-768), at 0 Health,
 * within the row's reach - and a distance nothing measured is no distance, as
 * `afterBlow` rules for Righteous Fury (D-768). ONE reading for the damage door
 * and the GM's query (the architect's review of D-772).
 *
 * @param {{self?: boolean, sameSide?: boolean, fallenHealth?: number|null, feet?: number|null, reach?: number}} o
 */
export function avengedBy({ self = false, sameSide = false, fallenHealth = null, feet = null, reach = 0 } = {}) {
  if (self || sameSide !== true) return false;
  if (!(typeof fallenHealth === "number" && fallenHealth <= 0)) return false;
  return typeof feet === "number" && Number.isFinite(feet) && feet <= (Number(reach) || 0);
}

/**
 * **BLOOD CRAZE** (04: *While you hold more than 7 Rage, recover 1 Health per
 * rank at the start of each of your turns*): the Health this turn's start
 * restores, read off the pools as they stand when the turn starts.
 *
 * @param {Array} talents
 * @param {{pools?: Array<{name: string, value: number}>}} o
 * @returns {{heal: number, by: string[]}}
 */
export function turnStartHealFor(talents = [], { pools = [] } = {}, rowOf = talentEffect) {
  let heal = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "turnStart", rowOf)) {
    const gate = row.while ?? null;
    if (gate?.pool) {
      const pool = (pools ?? []).find(p => p?.name === gate.pool) ?? null;
      if (!pool || !((Number(pool.value) || 0) > (Number(gate.above) || 0))) continue;
    }
    const n = amount(row.heal ?? 0, { rank });
    if (n <= 0) continue;
    heal += n;
    by.push(talent.name);
  }
  return { heal, by };
}

/* -------------------------------------------- */
/*  Casting, resting, healing                    */
/* -------------------------------------------- */

/**
 * **ILLUMINATION** (04: *When a Casting Test of yours reaches SL 2 or better, 1
 * Mana per rank returns to you*): the Mana a Casting Test at this SL returns.
 *
 * **AND CLEARCASTING** (04: *When you Overchannel and the Casting Test succeeds, 2
 * Mana per rank returns to you*; D-775): a row marked `overchannel` returns only
 * where the Test was Overchannelled and succeeded.
 *
 * @param {Array} talents
 * @param {{sl?: number, overchannelled?: boolean, success?: boolean}} o
 * @returns {{amount: number, by: string[]}}
 */
export function manaBackFor(talents = [], { sl = 0, overchannelled = false, success = true } = {}, rowOf = talentEffect) {
  let total = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "manaBack", rowOf)) {
    if ((Math.trunc(Number(sl)) || 0) < (Number(row.sl) || 0)) continue;
    if (row.overchannel === true && !(overchannelled === true && success === true)) continue;
    const n = amount(row.amount ?? "rank", { rank });
    if (n <= 0) continue;
    total += n;
    by.push(talent.name);
  }
  return { amount: total, by };
}

/**
 * **LIGHT'S RESERVE** (04: *A Short Rest with a drink returns 3 more Mana per
 * rank*): the Mana a rest returns beyond 05's.
 *
 * @param {Array} talents
 * @param {{kind?: "short"|"long", drinks?: boolean}} o
 * @returns {{mana: number, by: string[], className: string|null}}  `className`
 *   the talent's class, whose Mana pool takes it where a character holds two
 */
export function restBonusFor(talents = [], { kind = "short", drinks = false } = {}, rowOf = talentEffect) {
  let mana = 0;
  const by = [];
  let className = null;
  for (const { talent, row, rank } of rowsOfKind(talents, "rest", rowOf)) {
    const r = row?.[kind] ?? null;
    if (!r) continue;
    if (r.drink === true && drinks !== true) continue;
    const n = amount(r.mana ?? 0, { rank });
    if (n <= 0) continue;
    mana += n;
    by.push(talent.name);
    className ??= talent.className ?? null;
  }
  return { mana, by, className };
}

/**
 * **DIVINE FAVOR** (04: *Your first healing feature after each Long Rest costs no
 * Mana. At rank 2 the first two cost none*): the talent whose counter waives a
 * healing feature's Mana, or null. The counter is the feature the talent grants
 * (`counter("rank", "long")`); the door strikes one of its uses. **A healing
 * feature of ANY class the character holds** (`waives`; the lead, 2026-10-03, on
 * O-160: *"Yes."* to *does your healing features count a healing feature the
 * character holds from a second class?*; D-778).
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, talentId: string|null}|null}
 */
export function freeHealingFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "freeHealing", rowOf);
  return first ? { identifier: first.talent.identifier, name: first.talent.name, talentId: first.talent.id ?? null, className: first.talent.className ?? null } : null;
}

/**
 * Whether Divine Favor's waiver reaches this feature: a healing feature priced
 * in Mana, of whichever class granted it (D-778; it was the talent's own class
 * alone, D-772's reading, until the lead ruled on O-160).
 *
 * @param {{className: string|null}|null} favor  `freeHealingFor`'s answer
 * @param {{heal?: string|null, cost?: {pool?: string}|null, className?: string}} feature  the descriptor
 */
export function waives(favor, feature = {}) {
  return Boolean(favor) && Boolean(feature?.heal) && feature?.cost?.pool === "mana";
}

/**
 * **THE CONDITIONS A1 SETS THE SPEED TO 0 IN** (D-779): Entangled (*Your Speed is
 * 0*) and Prone (*Your Speed is 0 until you Stand*). `class-answers.test.mjs`
 * reads them back off A1, so a fourteenth condition that stops a creature is
 * found there rather than missed here.
 */
export const SPEED_ZERO_CONDITIONS = Object.freeze(["entangled", "prone"]);

/**
 * **UNYIELDING** (04: *Your Speed cannot be reduced, and you are immune to the
 * Prone condition*): the conditions refused and whether the Speed is held at its
 * unreduced number. **`speedZero`** (D-779; the lead, 2026-10-03, on O-175: *"It
 * prevents that condition."*) refuses every condition A1 sets the Speed to 0 in.
 *
 * @param {Array} talents
 * @returns {{immune: string[], speedFloor: boolean, by: string[]}}
 */
export function steadfastFor(talents = [], rowOf = talentEffect) {
  const out = { immune: [], speedFloor: false, by: [] };
  for (const { talent, row } of rowsOfKind(talents, "steadfast", rowOf)) {
    const refused = [...(row.immune ?? []), ...(row.speedZero === true ? SPEED_ZERO_CONDITIONS : [])];
    for (const id of refused) if (!out.immune.includes(id)) out.immune.push(id);
    if (row.speedFloor === true) out.speedFloor = true;
    out.by.push(talent.name);
  }
  out.immune.sort();
  return out;
}

/** The actor flag the schools named at a Long Rest stand under, by talent identifier. */
export const PLATE_FLAG = "plates";

/**
 * **WARD AGAINST THE SCHOOL NAMED AT A LONG REST** (04's Blessed Plate: *Name a
 * school at each Long Rest. You gain Ward 1 per rank against it*; Warded Plate:
 * *Name a school during a Long Rest. A third of your Armor Points, rounded down,
 * applies to your Ward of that school. At rank 2 you may apply half your Armor
 * Points*). **Your Armor Points are the BODY's** (MY READING, for the lead, after
 * the lead's own reading of Avenging Bulwark's *your Armor Points*, D-755).
 *
 * **Two halves, read at two moments**: a fixed Ward (`part: "fixed"`) with the
 * rest of the Ward in `prepareDerivedData`, and a share of the Armor Points
 * (`part: "armor"`) once every Active Effect has moved them
 * (`CharacterData#afterFinalPhase`) - a Sacred Duty or a Thick Hide lands in the
 * `final` phase, and the share would read the Armor Points before it.
 *
 * @param {Array} talents
 * @param {{named?: Record<string, string>, bodyAP?: number, part?: "fixed"|"armor"|"both"}} o
 *   `named` the holder's `PLATE_FLAG`, a school by talent identifier
 * @returns {{ward: Record<string, number>, rows: Array<{name: string, school: string, amount: number}>}}
 */
export function plateWards(talents = [], { named = {}, bodyAP = 0, part = "both" } = {}, rowOf = talentEffect) {
  const ward = {};
  const rows = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "plate", rowOf)) {
    const school = named?.[talent.identifier] ?? null;
    if (typeof school !== "string" || !school) continue;
    const r = atRankOf(row, rank);
    const fixed = part !== "armor" && r.ward !== undefined && r.ward !== null ? amount(r.ward, { rank }) : 0;
    const share = part !== "fixed" && Number(r.fromBodyAP) > 0 ? Math.floor(Math.max(0, Math.trunc(Number(bodyAP)) || 0) / Number(r.fromBodyAP)) : 0;
    const n = fixed + share;
    if (n <= 0) continue;
    ward[school] = (ward[school] ?? 0) + n;
    rows.push({ name: talent.name, school, amount: n });
  }
  return { ward, rows };
}

/** The actor flag Beacon's chosen creature stands under, on the holder. */
export const BEACON_FLAG = "beacon";

/**
 * **BEACON** (04: *Choose a friendly target you know during a Long Rest. When
 * another target within 120 feet of you restores Health from your spells and
 * effects, your chosen target restores half as much, rounded down*): the share
 * and the reach, or null.
 *
 * @param {Array} talents  the HEALER's
 * @returns {{name: string, share: "half", feet: number}|null}
 */
export function beaconFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "beacon", rowOf);
  if (!first) return null;
  return { name: first.talent.name, share: first.row.share === "half" ? "half" : "half", feet: Math.max(0, Number(first.row.feet) || 0) };
}

/**
 * Whether Beacon passes a share of this heal on (04's own conditions): the
 * healed creature is ANOTHER target than the chosen one, the heal came from the
 * holder, and it stood within the reach - a distance nothing could measure is no
 * distance at all, as `afterBlow` rules for Righteous Fury (D-768).
 *
 * @param {{healedUuid: string|null, chosenUuid: string|null, fromHolder: boolean, feet: number|null, reach: number}} o
 */
export function beaconShares({ healedUuid = null, chosenUuid = null, fromHolder = false, feet = null, reach = 0 } = {}) {
  if (!fromHolder || !chosenUuid || !healedUuid || healedUuid === chosenUuid) return false;
  return typeof feet === "number" && Number.isFinite(feet) && feet <= reach;
}

/* -------------------------------------------- */
/*  A Use's own rows                             */
/* -------------------------------------------- */

/**
 * **WHAT A TALENT'S USE LAYS ON ITS TARGET**, at the rank (04's Taunt: *A
 * target that can see you takes a Bane, per rank, attacking anyone but you
 * until the end of your next turn*; Judgement: *The target takes a Bane on
 * attacks against anyone but you for one round per rank*; Blessing: *A friendly
 * target you can see gains a Boon on their next Test. At rank 2 it applies to
 * every Test they make this round*).
 *
 * @param {object|null} onUse  the granting talent's `onUse`
 * @param {number} rank
 * @returns {{bane: {kind: string, banes: number, except: boolean, until: string|null, rounds: number}|null,
 *   boon: {kinds: string, boons: number, until: string}|null}}
 */
export function onUseLays(onUse, rank = 1) {
  const bane = onUse?.laysBane ? atRankOf(onUse.laysBane, rank) : null;
  const boon = onUse?.laysBoon ? atRankOf(onUse.laysBoon, rank) : null;
  return {
    bane: bane ? {
      kind: bane.kind, banes: amount(bane.banes ?? 1, { rank }), except: bane.except === "user",
      until: bane.until ?? null, rounds: amount(bane.rounds ?? 0, { rank }),
      // 04's Feint (D-773): *the target's next attack AGAINST YOU* - the one
      // creature the Bane bears on, where Taunt's `except` is the one it spares.
      ...(bane.only === "user" ? { only: true } : {})
    } : null,
    boon: boon ? { kinds: boon.kinds ?? "all", boons: amount(boon.boons ?? 1, { rank }), until: boon.until ?? "next" } : null
  };
}

/**
 * **WHAT A TALENT'S USE PROMISES THE NEXT ATTACK** (04's Precise Strike: *Your
 * next attack this turn ignores 1 Armor Point per rank*), as a grant
 * `rules/next-attack.mjs#nextAttackEntry` lays, or null.
 *
 * @param {object|null} onUse
 * @param {{identifier: string, name: string}} talent
 * @param {{rank?: number, tier?: number}} [scope]
 */
export function onUseNextAttack(onUse, talent, { rank = 1, tier = 1 } = {}) {
  const n = onUse?.nextAttack ?? null;
  if (!n || !talent?.identifier) return null;
  return {
    source: talent.identifier, name: talent.name ?? "",
    boons: amount(n.boons ?? 0, { rank, tier }),
    penetration: amount(n.penetration ?? 0, { rank, tier }),
    damage: amount(n.damage ?? 0, { rank, tier }),
    lasts: n.lasts
  };
}

/* -------------------------------------------- */
/*  The talents read by name                     */
/* -------------------------------------------- */

/**
 * **WOUNDED BEAST'S PRICE** (04: *Your weapon attacks add 1 to their Damage
 * Rating per rank, and every attack that damages you deals 1 more damage per
 * rank*): what an attack that got through deals to the holder. Nothing is added
 * to a blow that deals nothing, or to one that is no attack (a tick, a
 * retaliation).
 *
 * @param {{amount: number, attack: boolean, ranks: number}} o
 * @returns {number}
 */
export function woundedBeastTaken({ amount: dealt = 0, attack = false, ranks = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(dealt)) || 0);
  if (!attack || n <= 0) return n;
  return n + Math.max(0, Math.trunc(Number(ranks)) || 0);
}

/**
 * **UNBREAKABLE** (04: *While you carry a shield, roll any Critical Injury
 * against you twice and take the lower result*): how many d20 a Critical Injury
 * rolls, and the one that counts.
 *
 * @param {{unbreakable?: boolean, shield?: boolean}} o
 */
export function criticalRollCount({ unbreakable = false, shield = false } = {}) {
  return unbreakable && shield ? 2 : 1;
}

/** The lower of the dice a Critical Injury rolled. */
export function lowerRoll(totals = []) {
  const list = (totals ?? []).map(Number).filter(Number.isFinite);
  return list.length ? Math.min(...list) : null;
}

/* ======================================================================== */
/*  THE RANGER'S AND THE ROGUE'S KINDS (D-773, the talent plan's Phases 6-7) */
/* ======================================================================== */

/*
 * One function a kind, each called by ONE door (named beside it), and
 * `ranger-talents.test.mjs` / `rogue-talents.test.mjs` hold every number a row
 * carries to 04's own Effect cell:
 *
 *   steady        `{pool, amount}`: what a Half-Action spent on 05's **Steady**
 *                 returns (Steady Aim) - `rollTest`, off the dialog's own Steady
 *                 line ticked
 *   range         `{percent}`: how far a weapon's maximum Range grows (Longshot) -
 *                 `attackWithDialog`, into `rules/distance.mjs#rangeBand`
 *   cancels       `{ranged, atRank}`: the dialog lines a RANGED attack never
 *                 raises (Careful Shot) - `roll-dialog.mjs#prepareRoll`
 *   critical      gained `while {pool, full}` (Deadeye) and `when: "engagedOne"`
 *                 (Master Duellist); `targetBoon` gained `when` beside `below`
 *   flank         `{companion, atRank}`: who counts as flanking (Pack Tactics) -
 *                 the attack door measures, `packFlanks` judges
 *   hitLays       gained `via: "companion"`: a condition the COMPANION's blow
 *                 lays at an SL (Ferocious Bite), read off its owner's talents
 *   hitTest       `{resilience, bane, via}`: a Test the companion's hit forces,
 *                 at the owner's Spell DC (Intimidation)
 *   kill          gained `strike`: one more attack a kill gives (Beast Frenzy's
 *                 companion, Killing Spree's Riposte) - `effects/after-blow.mjs`
 *   quarry        `{companionHits}`: the companion's hit on the mark builds the
 *                 owner's Quarry (Shared Quarry at rank 2) - `rollTest`
 *   barrage       `{targets, widen, refund}`: what a talent does to Barrage's
 *                 own Use (Barrage's four, Chimaera Shot's six) - `useFeature`
 *   coating       `{free, atRank}`: a poison applied for no action, and taking
 *                 hold with no Test (Coated Blades)
 *   snare         `{escape}`: what a creature takes pulling clear of the Snare
 *                 (Entrapment) - the Snare card's escape Test
 *   opening       `{unseen, marks}`: who counts as under 02's Opening (Cheap
 *                 Shot, Subterfuge) - `openingFor` is the one reading
 *   finisher      on a `mod("Finisher")` patch: `{bleeding}` (Rupture), `{free,
 *                 counts}` (Death Mark) - `finisherOptionsFor`
 *   moved         `{feet, defense}`: Defense after a walk (Fleet Footed) -
 *                 `AzerothCombatant#spendMovement`
 *   parry         `{gain}`: what a Parry that holds builds (Perfect Timing)
 *   blowShare     `{share, feet, count}`: half a blow on a second enemy (Blade
 *                 Flurry) - a button on the card
 *   hidden        `{pierce, loseReaction}`: what an attack made while hidden does
 *                 (Find Weakness, Waylay)
 *   stealth       `{keep}`: actions do not end a Hide (Master of Shadows)
 *   evade         `{cost, feet}`: a Disengaged step after a blow that missed or
 *                 dealt nothing (Elusive) - a button on the card
 *   turnStart     gained `restore {pool, amount}` (Adrenaline's Energy)
 *
 * And `onUse` gained `deters` (Deterrence), `ward` (Cloak of Shadows), `hide`
 * (Shadow Dance), `holdOpening` (Overkill), `deathMark` (Death Mark), `perRound`
 * (Adrenaline's once a round per rank) and `skillTest` (Preparation); `laysBane`
 * gained `only` (Feint's *against you*); a rider gained `pierce`, `forced`
 * (Trueshot), `loseReaction`, `speedDrop`, `until` and `noCasting`, and `needs:
 * "opening"` (Garrote).
 */

/** An expression at a rank, a whole number never below nothing (the readers' own). */
const at = (expr, scope) => amount(expr, scope);

/**
 * The taken talents' PATCHES on one class feature, each with its talent and rank,
 * sorted by identifier: what 04 says a talent does to 02's Opening, Finisher or
 * Snare rides the `mod(...)` patch that also names the talent on the feature's
 * chip, and its reader reads the patch rather than a second row beside it.
 *
 * @param {Array} talents
 * @param {string} feature  the class feature's name
 */
function patchRowsOf(talents = [], feature, rowOf = talentEffect) {
  const out = [];
  for (const t of talents ?? []) {
    if (!(Math.trunc(Number(t?.taken) || 0) > 0)) continue;
    const entry = rowOf(t.className, t.identifier, t.race ?? null);
    const mods = !entry?.modifies ? [] : Array.isArray(entry.modifies) ? entry.modifies : [entry.modifies];
    for (const m of mods) if (m?.feature === feature) out.push({ talent: t, patch: m, rank: rankOf(t) });
  }
  return out.sort((a, b) => String(a.talent.identifier).localeCompare(String(b.talent.identifier)));
}

/**
 * **STEADY AIM** (04: *Spending a Half-Action on **Steady** returns 1 Focus per
 * rank*): the pool and the amount a Half-Action spent on Steady returns, or null.
 * **MY READING** (D-773): 05's Steady is a judgement line on the roll dialog and
 * nothing spends its Half-Action (O-100), so the dialog's own Steady line ticked
 * on an attack IS the Half-Action spent on Steady.
 *
 * @param {Array} talents
 * @returns {{pool: string, amount: number, by: string[]}|null}
 */
export function steadyReturnFor(talents = [], rowOf = talentEffect) {
  let total = 0;
  let pool = null;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "steady", rowOf)) {
    const n = at(row.amount ?? "rank", { rank });
    if (n <= 0 || !row.pool) continue;
    pool ??= row.pool;
    if (row.pool !== pool) continue;
    total += n;
    by.push(talent.name);
  }
  return total > 0 ? { pool, amount: total, by } : null;
}

/**
 * **LONGSHOT** (04: *Your weapon's maximum Range increases by 25% per rank,
 * rounded up*): the percent the maximum grows. **MY READING** (D-773): 06 §5's
 * maximum is *twice that distance* - the farthest a weapon may shoot - and that
 * is what grows; the Range itself, where the Bane begins, does not.
 *
 * @param {Array} talents
 * @returns {{percent: number, by: string[]}}
 */
export function rangeStretchFor(talents = [], rowOf = talentEffect) {
  let percent = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "range", rowOf)) {
    const n = at(row.percent ?? 0, { rank });
    if (n <= 0) continue;
    percent += n;
    by.push(talent.name);
  }
  return { percent, by };
}

/**
 * **CAREFUL SHOT** (04: *Your ranged attacks ignore the Bane for being Engaged.
 * At rank 2 they ignore the Bane from a target behind cover*): the dialog's line
 * ids a ranged attack never raises, and the talents that take them off. Nothing
 * on a blow in the hand.
 *
 * @param {Array} talents
 * @param {{range?: "melee"|"ranged"|null}} o
 * @returns {{ids: string[], by: string[]}}
 */
export function cancelledBanesFor(talents = [], { range = null } = {}, rowOf = talentEffect) {
  const ids = new Set();
  const by = [];
  if (range !== "ranged") return { ids: [], by };
  for (const { talent, row, rank } of rowsOfKind(talents, "cancels", rowOf)) {
    const r = atRankOf(row, rank);
    const list = (r.ranged ?? []).filter(id => typeof id === "string" && id);
    if (!list.length) continue;
    for (const id of list) ids.add(id);
    by.push(talent.name);
  }
  return { ids: [...ids].sort(), by };
}

/**
 * Whether a row's `while` pool gate holds (04's Deadeye: *While your Quarry is
 * full*): the named pool at its maximum. A pool the actor does not hold never
 * is.
 *
 * @param {{pool: string, full?: boolean}|null} gate
 * @param {Array<{name: string, value: number, max: number}>} pools
 */
export function poolGateHolds(gate, pools = []) {
  if (!gate?.pool) return true;
  const pool = (pools ?? []).find(p => p?.name === gate.pool) ?? null;
  if (!pool) return false;
  if (gate.full === true) return (Number(pool.max) || 0) > 0 && (Number(pool.value) || 0) >= (Number(pool.max) || 0);
  return true;
}

/**
 * **DEADEYE AND MASTER DUELLIST** beside Executioner (04: *While your Quarry is
 * full, you inflict a Critical Injury on 17 to 20*; *While you are Engaged with
 * exactly one enemy, your attacks against it ... inflict a Critical Injury on 19
 * or 20*): the lowest natural die a `critical` row allows on this blow, with its
 * gates - a target's Health share, a pool full, a fact the attack door measured.
 * `criticalOnFor` above reads Executioner's Health gate alone; this reads every
 * gate and is the one the roll asks.
 *
 * @param {Array} talents
 * @param {{health?: object|null, pools?: Array, facts?: Record<string, boolean>}} o
 * @returns {{on: number|null, by: string[]}}
 */
export function criticalRangeFor(talents = [], { health = null, pools = [], facts = {} } = {}, rowOf = talentEffect) {
  let on = null;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "critical", rowOf)) {
    const r = atRankOf(row, rank);
    if (!Number.isFinite(Number(r.on))) continue;
    if (r.below !== undefined && r.below !== null && !healthBelow(health, r.below)) continue;
    if (r.while && !poolGateHolds(r.while, pools)) continue;
    if (r.when && facts?.[r.when] !== true) continue;
    on = on === null ? Number(r.on) : Math.min(on, Number(r.on));
    by.push(talent.name);
  }
  return { on, by };
}

/**
 * **MASTER DUELLIST'S BOON** beside Hammer of Wrath's (04: *your attacks against
 * it gain a Boon*): every `targetBoon` row whose gates hold - a Health share, a
 * fact the door measured.
 *
 * @param {Array} talents
 * @param {{kind?: string, health?: object|null, facts?: Record<string, boolean>}} o
 * @returns {{boons: number, by: string[]}}
 */
export function targetBoonsWith(talents = [], { kind = "attack", health = null, facts = {} } = {}, rowOf = talentEffect) {
  let boons = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "targetBoon", rowOf)) {
    const r = atRankOf(row, rank);
    // `on` names every kind of Test the Boon reaches (04's Twisted Faith: a
    // Casting Test, and at rank 2 *your attacks do as well*; D-774).
    if (!(Array.isArray(r.on) ? r.on : [r.kind]).includes(kind)) continue;
    if (r.below !== undefined && r.below !== null && !healthBelow(health, r.below)) continue;
    if (r.when && facts?.[r.when] !== true) continue;
    const n = Math.max(0, Math.trunc(Number(r.boons ?? 1)) || 0);
    if (!n) continue;
    boons += n;
    by.push(talent.name);
  }
  return { boons, by };
}

/**
 * **PACK TACTICS** (04: *You and your companion always count as flanking a
 * target you are both Engaged with. At rank 2 any friendly target counts as
 * flanking alongside your companion*): what the holder's talent lets count.
 *
 * @param {Array} talents  the RANGER's
 * @returns {{name: string, companion: boolean, any: boolean}|null}
 */
export function flankingFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "flank", rowOf);
  if (!first) return null;
  const r = atRankOf(first.row, first.rank);
  return { name: first.talent.name, companion: r.companion === true, any: r.any === true };
}

/**
 * **WHETHER A BLOW COUNTS AS FLANKING UNDER PACK TACTICS** (06 §5: *Flanking
 * grants a Boon on your Attack Tests against that target*). The door measures
 * who stands Engaged with the target; this judges it. **MY READING** (D-773):
 * *count as flanking* is 06 §5's Boon, and the rank 2 clause reaches any friendly
 * attacker Engaged with a target the companion is Engaged with.
 *
 * @param {{row: {companion: boolean, any: boolean}|null, attackerEngaged: boolean,
 *   partnerEngaged: boolean, attackerIsPair: boolean}} o
 *   `attackerIsPair`: the attacker is the Ranger or the companion, and the
 *   partner the other of the two; else the attacker is another friend and the
 *   partner the companion
 */
export function packFlanks({ row = null, attackerEngaged = false, partnerEngaged = false, attackerIsPair = true } = {}) {
  if (!row || attackerEngaged !== true || partnerEngaged !== true) return false;
  return attackerIsPair ? row.companion === true : row.any === true;
}

/**
 * **A TEST THE COMPANION'S HIT FORCES** (04's Intimidation: *When your companion
 * hits, the target makes a Spirit Resilience Test against your Spell DC or takes
 * a Bane for one round per rank*), off the OWNER's talents. **MY READING**
 * (D-773): an unqualified *takes a Bane* is a Bane on every Test, for the span.
 *
 * @param {Array} talents  the owner's
 * @returns {Array<{identifier: string, name: string, resilience: string, bane: {kind: string, banes: number, rounds: number}}>}
 */
export function companionHitTestsFor(talents = [], rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "hitTest", rowOf)) {
    if (row.via !== "companion" || !row.resilience) continue;
    const rounds = at(row.bane?.rounds ?? "rank", { rank });
    const banes = Math.max(1, at(row.bane?.banes ?? 1, { rank }));
    if (rounds < 1) continue;
    out.push({ identifier: talent.identifier, name: talent.name, resilience: row.resilience, bane: { kind: row.bane?.kind ?? "all", banes, rounds } });
  }
  return out;
}

/**
 * **THE CONDITIONS A COMPANION'S BLOW LAYS AT AN SL** (04's Ferocious Bite: *When
 * your companion's attack reaches SL 2, the target gains Bleeding equal to your
 * rank*): `hitConditionsFor`'s reading over the OWNER's rows marked for the
 * companion.
 *
 * @param {Array} talents  the owner's
 * @param {{sl?: number, hit?: boolean}} o
 */
export function companionHitConditionsFor(talents = [], { sl = 0, hit = false } = {}, rowOf = talentEffect) {
  if (!hit) return [];
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "hitLays", rowOf)) {
    if (row.via !== "companion" || !row.condition) continue;
    if ((Math.trunc(Number(sl)) || 0) < (Number(row.sl) || 0)) continue;
    const n = row.value === null || row.value === undefined ? null : at(row.value, { rank });
    if (n !== null && n <= 0) continue;
    out.push({ identifier: talent.identifier, name: talent.name, id: row.condition, value: n });
  }
  return out;
}

/**
 * **SHARED QUARRY AT RANK 2** (04: *its hits build Quarry for you as well*):
 * whether the companion's hit on the owner's mark builds the owner's Quarry.
 *
 * @param {Array} talents  the owner's
 * @returns {{name: string}|null}
 */
export function companionQuarryFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "quarry", rowOf)) {
    if (atRankOf(row, rank).companionHits === true) return { name: talent.name };
  }
  return null;
}

/**
 * **ONE MORE ATTACK A KILL GIVES** (04's Beast Frenzy: *Once a round per rank,
 * when an attack your companion made reduces a target to 0 Health, it may attack
 * again immediately*; Killing Spree: *When a Riposte of yours reduces a target to
 * 0 Health, make one attack immediately against another target within reach*):
 * the offers a kill makes, for the striker (`self`) or the holder's companion.
 *
 * @param {Array} talents  the HOLDER's
 * @param {{who: "self"|"companion", riposte?: boolean}} o
 * @returns {Array<{identifier: string, name: string, count: number, target: "same"|"other"|"any"}>}
 */
export function killStrikesFor(talents = [], { who = "self", riposte = false } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "kill", rowOf)) {
    const s = atRankOf(row, rank).strike ?? null;
    if (!s || (s.who ?? "self") !== who) continue;
    if (s.riposte === true && riposte !== true) continue;
    const count = at(s.count ?? 1, { rank });
    if (count < 1) continue;
    out.push({ identifier: talent.identifier, name: talent.name, count, target: ["same", "other"].includes(s.target) ? s.target : "any" });
  }
  return out;
}

/**
 * **WHAT A TALENT DOES TO BARRAGE'S OWN USE** (04's Barrage: *attack up to four
 * targets within a 10-foot radius*; Chimaera Shot: *Your Barrage may attack up to
 * six targets within a 15-foot radius. If more than four targets are chosen, 2
 * Focus returns to you*): the targets the Use may name, the feet its circle
 * widens, and the refund. The largest of each holds.
 *
 * @param {Array} talents
 * @param {string} grant  the granting talent's identifier
 * @returns {{targets: number|null, widen: number, refund: {pool: string, amount: number, over: number}|null, by: string[]}}
 */
export function grantLimitsFor(talents = [], grant, rowOf = talentEffect) {
  const out = { targets: null, widen: 0, refund: null, by: [] };
  for (const { talent, row } of rowsOfKind(talents, "barrage", rowOf)) {
    if (row.grant !== grant) continue;
    if (Number.isFinite(Number(row.targets))) out.targets = Math.max(out.targets ?? 0, Math.trunc(Number(row.targets)));
    if (Number(row.widen) > 0) out.widen = Math.max(out.widen, Math.trunc(Number(row.widen)));
    if (row.refund?.pool && Number(row.refund.amount) > 0) out.refund = { pool: row.refund.pool, amount: Math.trunc(Number(row.refund.amount)), over: Math.trunc(Number(row.refund.over)) || 0 };
    out.by.push(talent.name);
  }
  return out;
}

/**
 * Whether a Use naming this many targets is refused (Barrage's *up to four*), and
 * whether the refund is due (Chimaera Shot's *more than four*).
 *
 * @param {{targets: number|null, refund: object|null}} limits  `grantLimitsFor`'s
 * @param {number} named  the targets the Use names
 * @returns {{refused: boolean, refund: {pool: string, amount: number}|null}}
 */
export function barrageJudgement(limits, named = 0) {
  const n = Math.max(0, Math.trunc(Number(named)) || 0);
  const refused = limits?.targets !== null && limits?.targets !== undefined && n > limits.targets;
  const refund = !refused && limits?.refund && n > limits.refund.over ? { pool: limits.refund.pool, amount: limits.refund.amount } : null;
  return { refused, refund };
}

/**
 * **COATED BLADES** (04: *You may apply a poison you carry without spending an
 * action. At rank 2 the poison needs no Test to take hold*).
 *
 * @param {Array} talents
 * @returns {{free: boolean, noTest: boolean, by: string[]}}
 */
export function coatingTalentsFor(talents = [], rowOf = talentEffect) {
  const out = { free: false, noTest: false, by: [] };
  for (const { talent, row, rank } of rowsOfKind(talents, "coating", rowOf)) {
    const r = atRankOf(row, rank);
    if (r.free === true) out.free = true;
    if (r.noTest === true) out.noTest = true;
    out.by.push(talent.name);
  }
  return out;
}

/**
 * **ENTRAPMENT** (04: *A creature that frees itself from your **Snare** class
 * feature takes 5 damage as it pulls clear*): what the Snare's escape Test deals
 * on a pass, or null. The damage names no type, so it is untyped - the lead's
 * ruling on 08 §12's *N damage* (D-770), read here the same way (MY READING).
 *
 * @param {Array} talents  the SNARE's maker's
 * @returns {{name: string, damage: number}|null}
 */
export function snareEscapeFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, "Snare", rowOf)) {
    const n = at(patch.escape?.damage ?? 0, { rank });
    if (n > 0) return { name: talent.name, damage: n };
  }
  return null;
}

/**
 * **VILE CONCOCTION** (04: *A target already suffering one of your poisons takes
 * a Bane per rank on Resilience Tests against your poisons*): the Banes a poison
 * Test of this Rogue's takes where the target already suffers one. **MY READING**
 * (D-773): a poison the system records with its poisoner's hand - 08 §12's four
 * that tick - is one the target is *suffering*; the conditions a poison lays do
 * not record whose poison it was.
 *
 * @param {Array} talents  the POISONER's
 * @returns {{banes: number, name: string|null}}
 */
export function poisonTestBanesFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "poisonTest", rowOf)) {
    const n = at(row.banes ?? "rank", { rank });
    if (n > 0) return { banes: n, name: talent.name };
  }
  return { banes: 0, name: null };
}

/**
 * **PARALYTIC** (04: *A target that fails a Resilience Test against one of your
 * poisons loses its next Reaction. At rank 2 it is **Entangled** until it passes a
 * Resilience Test against your poisons*): what a failed poison Test of this
 * Rogue's lays. **MY READING** (D-773): *its next Reaction* is the one it holds;
 * one already spent this round is not taken from the round after.
 *
 * @param {Array} talents  the POISONER's
 * @returns {{loseReaction: boolean, entangle: boolean, name: string|null}}
 */
export function poisonFailFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "poisonFail", rowOf)) {
    const r = atRankOf(row, rank);
    return { loseReaction: r.loseReaction === true, entangle: r.entangle === true, name: talent.name };
  }
  return { loseReaction: false, entangle: false, name: null };
}

/** The effect flag Paralytic's Entangled stands under: the poisoner whose passed Test ends it. */
export const PARALYTIC_FLAG = "paralytic";

/** The effect flag a Garrote's Bleeding carries (04: *cannot cast while that Bleeding lasts*; D-773). */
export const NO_CASTING_FLAG = "noCasting";

/**
 * What bars a creature from casting (04's Garrote): the names its standing
 * effects carry under `NO_CASTING_FLAG`, sorted, once each. `castRefusal` reads
 * the answer.
 *
 * @param {Array<object>} flagsList  each ACTIVE effect's `flags["azeroth-rpg"]`
 * @returns {string[]}
 */
export function noCastingFrom(flagsList = []) {
  const out = new Set();
  for (const flags of flagsList ?? []) {
    const by = flags?.[NO_CASTING_FLAG]?.source ?? null;
    if (typeof by === "string" && by) out.add(by);
  }
  return [...out].sort();
}

/**
 * Whether a laid tick is one of THIS poisoner's poisons (08 §12's four that tick):
 * a damage tick of no type, laid by a weapon's blow rather than a spell's card
 * (no `castUuid`), by this hand.
 *
 * @param {object|null} tick  a laid tick's flag
 * @param {string|null} poisonerUuid
 */
export function isPoisonTickBy(tick, poisonerUuid) {
  if (!tick || !poisonerUuid) return false;
  return tick.kind === "damage" && !tick.type && !tick.castUuid && tick.source === poisonerUuid;
}

/* ---- the Opening (02 §7) ------------------------------------------------- */

/** The effect flag Overkill's hold stands under, on the Rogue. */
export const OPENING_HELD_FLAG = "openingHeld";

/** The effect flag one of Subterfuge's marks stands under, on the Rogue. */
export const OPENING_MARK_FLAG = "openingMark";

/**
 * Whether a target snapshot is one an entry names: the token where both name
 * one, else the actor.
 *
 * @param {{actorId?: string|null, tokenId?: string|null}|null} entry
 * @param {{actorId?: string|null, tokenId?: string|null}|null} target
 */
export function namesTarget(entry, target) {
  if (!entry || !target) return false;
  if (entry.tokenId && target.tokenId) return entry.tokenId === target.tokenId;
  return Boolean(entry.actorId) && entry.actorId === target.actorId;
}

/**
 * **WHO COUNTS AS UNDER 02's OPENING** (*Against a target that has not yet acted,
 * your attacks gain a Boon. If your attack against the target hits, you may
 * spend 2 Energy to gain 1 Combo Point*), the ONE reading the card's trade, the
 * dialog's line and Garrote's gate ask:
 *
 * - **02**: a target that has not acted (`acted === false`; null is no fight);
 * - **Cheap Shot** (*applies against any target that has not seen you, whether
 *   or not it has acted*): MY READING (D-773), an attack made while HIDDEN is one
 *   no target has seen - the one *has not seen you* the system can measure;
 * - **Overkill** (*Once per Short Rest, your Opening class feature holds until
 *   the end of your next turn*): a target its hold names, the ones not yet acted
 *   when it was used (MY READING);
 * - **Subterfuge** (*A target you attack while hidden is treated as being under
 *   your Opening ... for a number of rounds equal to your rank*): the attack made
 *   while hidden, and a target one of its marks names.
 *
 * @param {{acted?: boolean|null, hidden?: boolean, held?: Array<object>, marks?: Array<object>,
 *   target?: {actorId?: string|null, tokenId?: string|null}|null}} state
 * @param {Array} talents  the Rogue's
 * @returns {{applies: boolean, why: string[], by: string[]}}  `why` the keys, in order:
 *   notActed, unseen, held, marked; `by` the talents that put the target under it
 */
export function openingFor({ acted = null, hidden = false, held = [], marks = [], target = null } = {}, talents = [], rowOf = talentEffect) {
  const why = [];
  const by = [];
  if (acted === false) why.push("notActed");
  const opening = patchRowsOf(talents, "Opening", rowOf);
  const first = test => opening.find(test) ?? null;
  const unseen = first(r => r.patch.unseen === true);
  if (hidden === true && unseen) { why.push("unseen"); by.push(unseen.talent.name); }
  // A hold and a mark count only while the talent that laid them is still taken.
  const holds = first(r => r.patch.held === true);
  if (holds && (held ?? []).some(h => (h?.targets ?? []).some(t => namesTarget(t, target)))) { why.push("held"); by.push(holds.talent.name); }
  const marker = first(r => Boolean(r.patch.marks));
  // *A target you attack while hidden is treated as being under your Opening*:
  // the attack made from hiding is one of them, and its mark holds the rounds after.
  if (marker && (hidden === true || (marks ?? []).some(m => namesTarget(m, target)))) { why.push("marked"); by.push(marker.talent.name); }
  return { applies: why.length > 0, why, by };
}

/**
 * **WHAT A BLOW THAT NEEDS THE OPENING MAY ASSUME** (04's Garrote, D-773): true
 * where the target is measured under it, false where it is measured NOT under it
 * (it has acted, in a fight, and no talent holds it), and null where nothing
 * could be measured - no target, or no fight and no talent's reason - which the
 * rider's line leaves to the table (`riders.mjs#ridersFor`).
 *
 * @param {{applies: boolean}|null} state  `openingFor`'s answer
 * @param {{acted?: boolean|null}|null} target  the snapshot
 * @returns {boolean|null}
 */
export function openingGate(state, target) {
  if (state?.applies === true) return true;
  if (!target || target.acted === null || target.acted === undefined) return null;
  return false;
}

/**
 * **SUBTERFUGE'S MARK** (04): the rounds a target attacked while hidden is
 * treated as under the Opening, or 0 where no talent says so.
 *
 * @param {Array} talents
 * @returns {{rounds: number, name: string|null}}
 */
export function openingMarkRoundsFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, "Opening", rowOf)) {
    const n = at(patch.marks ?? 0, { rank });
    if (n > 0) return { rounds: n, name: talent.name };
  }
  return { rounds: 0, name: null };
}

/**
 * **CHEAP SHOT AT RANK 2** (*that attack builds 1 Combo Point without spending
 * Energy*): the Combo Points an attack made while hidden builds beyond 05's, in
 * place of the Opening's paid trade. **MY READING** (D-773): on a hit, as the
 * trade it replaces is.
 *
 * @param {Array} talents
 * @returns {{amount: number, name: string|null}}
 */
export function unseenComboFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, "Opening", rowOf)) {
    const n = at(atRankOf(patch, rank).freeCombo ?? 0, { rank });
    if (n > 0) return { amount: n, name: talent.name };
  }
  return { amount: 0, name: null };
}

/* ---- the Finisher (02 §7) ------------------------------------------------ */

/** The actor flag Death Mark's named target stands under, until a rest. */
export const DEATH_MARK_FLAG = "deathMark";

/**
 * **WHAT THE TALENTS DO TO 02's FINISHER**, read off their `mod("Finisher")`
 * patches (the chip on the feature is theirs too):
 *
 * - **Rupture** (*may apply Bleeding equal to twice the Combo Points spent plus
 *   your rank, instead of dealing damage*): `bleeding`, an expression in `spent`
 *   and `rank`. **MY READING** (D-773): *instead of dealing damage* is instead of
 *   the Finisher's own added damage - the attack's own still lands - and the
 *   Bleeding is the hit's, as Rip's is (D-770).
 * - **Death Mark** (*your Finisher against it costs no Combo Points and counts as
 *   having spent five*): `free` and `counts`, against the target named.
 * - **Ruthlessness** (*When your Finisher class feature reaches SL 2, 1 Combo
 *   Point per rank returns to you*): `back {sl, amount}`.
 *
 * @param {Array} talents
 * @returns {{bleeding: {name: string, rank: number, expr: string}|null, mark: {name: string, counts: number}|null,
 *   back: {name: string, sl: number, amount: number}|null}}
 */
export function finisherOptionsFor(talents = [], rowOf = talentEffect) {
  const out = { bleeding: null, mark: null, back: null };
  for (const { talent: t, patch: m, rank } of patchRowsOf(talents, "Finisher", rowOf)) {
    if (m.bleeding && !out.bleeding) out.bleeding = { name: t.name, rank, expr: String(m.bleeding) };
    if (m.free === true && !out.mark) out.mark = { name: t.name, counts: Math.max(1, at(m.counts ?? 5, { rank })) };
    if (m.back && !out.back) out.back = { name: t.name, sl: Math.trunc(Number(m.back.sl)) || 0, amount: at(m.back.amount ?? "rank", { rank }) };
  }
  return out;
}

/**
 * **THE FINISHER THIS BLOW OFFERS** (02 §7: *spend all your Combo Points and add
 * that many to the damage of one attack*), with the talents laid over it: the
 * points it spends, the points it COUNTS, and whether Rupture's Bleeding is on
 * offer. Null where there is nothing to offer: no points and no Death Mark on
 * this target.
 *
 * @param {{value: number, max: number}|null} pool  the Combo Points
 * @param {ReturnType<typeof finisherOptionsFor>} options
 * @param {{marked?: boolean}} o  the target is the one Death Mark named
 * @returns {{value: number, max: number, spends: number, counts: number, free: string|null, bleeding: object|null}|null}
 */
export function finisherOffer(pool, options = {}, { marked = false } = {}) {
  const value = Math.max(0, Math.trunc(Number(pool?.value)) || 0);
  const max = Math.max(value, Math.trunc(Number(pool?.max)) || 0);
  const free = marked && options?.mark ? options.mark : null;
  if (!free && value < 1) return null;
  if (!pool && !free) return null;
  return {
    value, max,
    spends: free ? 0 : value,
    counts: free ? free.counts : value,
    free: free ? free.name : null,
    bleeding: options?.bleeding ?? null
  };
}

/**
 * Rupture's Bleeding for the points a Finisher counted (*twice the Combo Points
 * spent plus your rank*): 0 where nothing was counted.
 *
 * @param {{expr: string, rank: number}|null} bleeding
 * @param {number} counted
 */
export function ruptureBleeding(bleeding, counted = 0) {
  if (!bleeding || !(counted > 0)) return 0;
  const n = evaluateExpression(String(bleeding.expr ?? ""), { rank: Number(bleeding.rank) || 0, spent: Math.trunc(Number(counted)) || 0 });
  return Math.max(0, Math.trunc(Number(n)) || 0);
}

/* ---- Duelling ------------------------------------------------------------ */

/**
 * **FLEET FOOTED** (04: *While you have moved at least 10 feet this turn, your
 * Defense rises by 1 per rank until your next turn*): the Defense a walk of this
 * many feet gives, or null.
 *
 * @param {Array} talents
 * @param {{feet?: number}} o  the feet the turn has metered
 * @returns {{defense: number, name: string, feet: number}|null}
 */
export function fleetFootedFor(talents = [], { feet = 0 } = {}, rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "moved", rowOf)) {
    const need = Math.max(0, Number(row.feet) || 0);
    const n = at(row.defense ?? "rank", { rank });
    if (n > 0 && (Number(feet) || 0) >= need) return { defense: n, name: talent.name, feet: need };
  }
  return null;
}

/** The effect flag Fleet Footed's Defense stands under, on the Rogue. */
export const FLEET_FOOTED_FLAG = "fleetFooted";

/**
 * **PERFECT TIMING** (04: *A **Parry** that reduces an attack's damage to 0
 * builds 1 Combo Point*): what a Parry that holds builds. 06 §6's Parry is all
 * or nothing, so a Parry that holds is one that reduces the attack to 0.
 *
 * @param {Array} talents
 * @returns {Array<{pool: string, amount: number, name: string}>}
 */
export function parryGainsFor(talents = [], rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "parry", rowOf)) {
    const n = at(row.gain?.amount ?? 1, { rank });
    if (n > 0 && row.gain?.pool) out.push({ pool: row.gain.pool, amount: n, name: talent.name });
  }
  return out;
}

/**
 * **EVERY TALENT THAT FREES A REACTION OF THIS KIND** (04's Bladeturn and Combat
 * Reflexes on the Parry, Deflection on the Block): `freeReactionsFor` answers the
 * first; this answers each, so a Warrior-Rogue holding two has both counts.
 *
 * **AND ONE A TURN, WITH A MELEE WEAPON IN EACH HAND** (04's Main Gauche as the
 * lead reworked it, 2026-10-03, on O-180: *"Main gauge can be reworked to allow 1
 * parry per turn without spending a reaction."*; D-779): `per: "turn"` counts the
 * free Parry on the fight's turn rather than its round (`class-answers.mjs
 * #turnMark`), and `needs: "dualMelee"` holds it to a melee weapon in each hand -
 * both handed to the door, which measures the hands.
 *
 * @param {Array} talents
 * @param {"parry"|"block"} reaction
 * @returns {Array<{identifier: string, name: string, count: number, per: "round"|"turn", needs: string|null}>}
 */
export function freeReactionRowsFor(talents = [], reaction, rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "freeReaction", rowOf)) {
    if (row.reaction !== reaction) continue;
    const count = at(row.count ?? 1, { rank });
    if (count > 0) out.push({ identifier: talent.identifier, name: talent.name, count, per: row.per === "turn" ? "turn" : "round", needs: row.needs ?? null });
  }
  return out;
}

/**
 * **BLADE FLURRY** (04: *Once a round per rank, when you hit with an attack, a
 * second enemy within 5 feet of the target takes half the damage, rounded
 * down*). **MY READING** (D-773): half of what the blow dealt the target, landing
 * on the second creature as it stands - no second roll and no second mitigation -
 * and no attack, so it offers no Parry.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, count: number, feet: number}|null}
 */
export function blowShareFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "blowShare", rowOf);
  if (!first) return null;
  const count = at(first.row.count ?? "rank", { rank: first.rank });
  return count > 0 ? { identifier: first.talent.identifier, name: first.talent.name, count, feet: Math.max(0, Number(first.row.feet) || 0) } : null;
}

/** Half a blow, rounded down - Blade Flurry's share of what landed. */
export function halfShare(dealt = 0) {
  return Math.floor(Math.max(0, Math.trunc(Number(dealt)) || 0) / 2);
}

/* ---- Subtlety, and a blow struck from hiding ----------------------------- */

/**
 * **WHAT AN ATTACK MADE WHILE HIDDEN DOES** (04's Find Weakness: *Your attacks
 * while hidden ignore 2 Armor Points per rank*; Waylay: *A target you attack while
 * hidden cannot use a Reaction until its next turn*), summed.
 *
 * @param {Array} talents
 * @returns {{pierce: number, loseReaction: boolean, by: string[]}}
 */
export function hiddenAttackFor(talents = [], rowOf = talentEffect) {
  const out = { pierce: 0, loseReaction: false, by: [] };
  for (const { talent, row, rank } of rowsOfKind(talents, "hidden", rowOf)) {
    const pierce = at(row.pierce ?? 0, { rank });
    out.pierce += pierce;
    if (row.loseReaction === true) out.loseReaction = true;
    if (pierce > 0 || row.loseReaction === true) out.by.push(talent.name);
  }
  return out;
}

/**
 * **MASTER OF SHADOWS** (04: *Taking actions while hidden does not make you
 * visible*): whether an attack or a cast leaves the Hide standing.
 */
export function keepsHidden(talents = [], rowOf = talentEffect) {
  return rowsOfKind(talents, "stealth", rowOf).some(r => r.row.keep === true);
}

/**
 * **GHOSTLY STRIKE** beside Titan's Presence (04: *An attack you make while hidden
 * cannot be **Parried** or **Blocked***): whether this attacker's blow offers no
 * Parry and no Block, the attack made while hidden or not.
 *
 * @param {Array} talents  the ATTACKER's
 * @param {{hidden?: boolean}} o
 */
export function unanswerableWith(talents = [], { hidden = false } = {}, rowOf = talentEffect) {
  return rowsOfKind(talents, "unanswerable", rowOf).some(r => r.row === true || (r.row === "hidden" && hidden === true));
}

/**
 * **ELUSIVE** (04: *When an attack against you misses or deals no damage, you may
 * spend 2 Energy and move 5 feet per rank as though you had **Disengaged***): the
 * price and the feet, or null.
 *
 * @param {Array} talents  the DEFENDER's
 * @returns {{name: string, pool: string, cost: number, feet: number}|null}
 */
export function evadeFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "evade", rowOf);
  if (!first) return null;
  const feet = at(first.row.feet ?? 0, { rank: first.rank });
  const cost = at(first.row.cost?.amount ?? 0, { rank: first.rank });
  return feet > 0 && first.row.cost?.pool ? { name: first.talent.name, pool: first.row.cost.pool, cost, feet } : null;
}

/**
 * **WHAT THE TURN'S START RESTORES TO A POOL** (04's Adrenaline: *Your Energy pool
 * returns 1 more per rank at the start of your turn*): beside 05 §12's own refill,
 * by pool.
 *
 * @param {Array} talents
 * @returns {{byPool: Record<string, number>, by: string[]}}
 */
export function turnStartRestoreFor(talents = [], rowOf = talentEffect) {
  const byPool = {};
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "turnStart", rowOf)) {
    const r = row.restore ?? null;
    if (!r?.pool) continue;
    const n = at(r.amount ?? "rank", { rank });
    if (n <= 0) continue;
    byPool[r.pool] = (byPool[r.pool] ?? 0) + n;
    by.push(talent.name);
  }
  return { byPool, by };
}

/* ---- What a Use does, beyond its descriptor ------------------------------ */

/**
 * **WHAT THE RANGER'S AND THE ROGUE'S USES LAY, AT THE RANK** (D-773): Deterrence's
 * Banes on attacks against the user, Cloak of Shadows' Ward, Shadow Dance's hide,
 * Overkill's hold, Death Mark's naming, Adrenaline's once a round per rank, and
 * Preparation's Stealth Test. Null keys where the row says nothing.
 *
 * @param {object|null} onUse  the granting talent's `onUse`
 * @param {number} rank
 */
export function onUseRogueRanger(onUse, rank = 1) {
  const o = onUse ?? {};
  return {
    deters: o.deters ? { banes: Math.max(1, at(o.deters.banes ?? "rank", { rank })), until: o.deters.until ?? "userTurnStart" } : null,
    // And 04's Prismatic Ward (*Ward 2 against every school until the end of your
    // next turn*; D-775): every school, with no chooser, and its own span.
    ward: o.ward ? { amount: Math.max(1, at(o.ward.amount ?? "rank", { rank })), until: o.ward.until ?? "userTurnStart", ...(o.ward.everySchool === true ? { everySchool: true } : {}) } : null,
    hide: o.hide ? { until: o.hide.until ?? "userTurnEnd" } : null,
    holdOpening: o.holdOpening ? { until: o.holdOpening.until ?? "userTurnEnd" } : null,
    deathMark: o.deathMark === true,
    perRound: o.perRound !== undefined ? Math.max(1, at(o.perRound, { rank })) : null,
    skillTest: o.skillTest?.skill ? {
      skill: o.skillTest.skill, dc: o.skillTest.dc ?? "opposed",
      gain: o.skillTest.gain?.pool ? { pool: o.skillTest.gain.pool, amount: Math.max(1, at(o.skillTest.gain.amount ?? "rank", { rank })) } : null
    } : null
  };
}

/**
 * Whether any taken talent's `critical` or `targetBoon` row asks this fact (04's
 * Master Duellist asks `engagedOne`; D-773): the attack door measures the enemies
 * around a token only where a row could use it, because that is not free.
 *
 * @param {Array} talents
 * @param {string} fact
 */
export function asksFact(talents = [], fact, rowOf = talentEffect) {
  return ["critical", "targetBoon"].some(kind => rowsOfKind(talents, kind, rowOf).some(r => r.row.when === fact));
}

/**
 * **A RETURN INTO A POWER POOL ON A HIT** (04's Aimed Volley: *Once a round, when
 * an attack reaches SL 2, 2 Focus per rank returns to you*; D-773). 05's gain on
 * a hit reaches the Momentum pools alone (`momentum.mjs#gainOnHit`), so a
 * `momentum` row naming a Power pool is returned here: the pool's new value,
 * never past its maximum, and nothing for a pool the actor does not hold.
 *
 * @param {Array<{itemId: string|null, kind: string, name: string, value: number, max: number}>} pools
 * @param {Record<string, number>} byPool  `momentumOnHitFor`'s gains, by pool name
 * @returns {Array<{itemId: string|null, kind: "power", name: string, value: number, gained: number}>}
 */
export function powerReturns(pools = [], byPool = {}) {
  const out = [];
  for (const p of pools ?? []) {
    if (p?.kind !== "power") continue;
    const n = Math.max(0, Math.trunc(Number(byPool?.[p.name])) || 0);
    if (!n) continue;
    const before = Number(p.value) || 0;
    const value = Math.min(Number(p.max) || 0, before + n);
    if (value > before) out.push({ itemId: p.itemId ?? null, kind: "power", name: p.name, value, gained: value - before });
  }
  return out;
}

/* ======================================================================== */
/*  THE PRIEST'S AND THE SHAMAN'S KINDS (D-774, the talent plan's Phases 8-9) */
/* ======================================================================== */

/*
 * One function a kind, each called by ONE door (named beside it), and
 * `priest-talents.test.mjs` / `shaman-talents.test.mjs` hold every number a row
 * carries to 04's own Effect cell:
 *
 *   mod("Ward")    `{targets, reduction, everySchool, undispellable, absorb, atone}`
 *                  on 02's Ward patch (Mass Ward, Shield Discipline, Aegis Eternal,
 *                  Absorption, Atonement) - `wardOptionsFor`, read by
 *                  `workflows.useFeature` as the Ward is laid and by
 *                  `effects/wards.mjs` at the one damage door
 *   mod("Mend")    `{names, further}` (Divine Providence, Circle of Healing) and a
 *                  spell's `further` (Chain Heal) - `healTargetsFor`, read where
 *                  the heal's targets are named
 *   castLine       `{free, casting, pierce, schools}`: what a counter the talent
 *                  grants buys on a Casting Test's own dialog (Inner Focus's free
 *                  Mana, Lava Burst's Ward ignored) - `talentLinesFor`
 *   charge         `{sl, max, damage}`: Static Charge's charges, gained at an SL
 *                  and spent on a damage roll - `chargeFor`, `talentLinesFor`
 *   drain          `{type, heal, once}`: Health back when damage of a type from
 *                  you reduces a target's Health (Vampiric Touch) - `drainFor`,
 *                  from `effects/after-blow.mjs`
 *   apparition     `{feet, amount, type}`: what a death while suffering your tick
 *                  does to the enemies around it (Shadowy Apparition) - from the
 *                  same door
 *   overload       `{sl, share}`: a damaging spell fired again at a share
 *                  (Overload) - a button on the card
 *   refund         `{failed}`: a failed Casting Test's Mana back (Ancestral
 *                  Knowledge) - a button on the card
 *   stormlash      `{amount, once}`: damage on a weapon hit once a round
 *                  (Stormlash; Doom Winds lifts the once) - `rollTest`
 *   firstAttack    `{ap, needs}`: Armor Points against the first attack each
 *                  round (Rockbiter) - the target snapshot, and the attack's mark
 *   maelstrom      `{every, mana}`: every Nth weapon hit returns Mana - `rollTest`
 *   earthliving    `{heal, melee}`: Health on a melee attack - `rollTest`
 *   guidance       `{feet, count}`: Earthliving's heal on friends near the shaman
 *                  (Ancestral Guidance) - a button on the attack's card
 *   spell          gained `adds` (a change the laid effect carries more of: Pain
 *                  Suppression), `heal` (Healing Wave), `further` (Chain Heal),
 *                  `onFail` (Void Eruption's Silenced) and `addTick` (Ancestral
 *                  Tide's tick); `ignoresWard.amount` reads the rank (Chastise)
 *   onUse          gained `restores` (Hymn of Hope), `inflicts` (Silence),
 *                  `ascend` (Ascendance), `walk` (Spirit Walk), `doomWinds` and
 *                  `cloudburst` - `onUsePriestShaman`
 *
 * And 02's Reincarnation, which was a counter and nothing more, with Undying
 * Spirit's `mod("Reincarnation", {returnAt, ally})` - `reincarnationFor`.
 */

/* ---- 02's Ward, and the talents that ride it ----------------------------- */

/** 02's Ward as the book prints it: one target, Ward 1, until the priest's next turn. */
export const WARD_BASE = Object.freeze({ feature: "Ward", targets: 1, amount: 1, until: "userTurnStart" });

/** The effect flag a laid Ward stands under, on the creature warded. */
export const WARD_FLAG = "priestWard";

/**
 * **WHAT THE WARD THIS PRIEST LAYS CARRIES** (02: *As a Reaction, spend 2 Mana to
 * grant a target Ward 1 of one school until your next turn*; with the five
 * talents that patch it, D-774): how many it names, every school or one, the
 * damage taken off every source, whether a Dispel may end it, the Mana a blow it
 * takes to nothing returns, and the heal a blow it takes anything off gives.
 *
 * @param {Array} talents  the PRIEST's
 * @param {{tier?: number}} [o]  the priest's tier, which Atonement's heal is
 * @returns {{targets: number, reduction: number, everySchool: boolean, undispellable: boolean,
 *   absorb: number, atone: number, by: Record<string, string[]>}}
 */
export function wardOptionsFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const out = { targets: WARD_BASE.targets, reduction: 0, everySchool: false, undispellable: false, absorb: 0, atone: 0, by: {} };
  const name = (key, talent) => { (out.by[key] ??= []).push(talent.name); };
  for (const { talent, patch, rank } of patchRowsOf(talents, WARD_BASE.feature, rowOf)) {
    const p = atRankOf(patch, rank);
    if (Number(p.targets) > out.targets) { out.targets = Math.trunc(Number(p.targets)); name("targets", talent); }
    if (p.reduction !== undefined) { const n = at(p.reduction, { rank, tier }); if (n > 0) { out.reduction += n; name("reduction", talent); } }
    if (p.everySchool === true) { out.everySchool = true; name("everySchool", talent); }
    // Aegis Eternal's *cannot be removed by Dispel* - named, since 02's Dispel greys
    // the Ward in the talent's own name (D-778).
    if (p.undispellable === true) { out.undispellable = true; name("undispellable", talent); }
    if (p.absorb?.mana !== undefined) { const n = at(p.absorb.mana, { rank, tier }); if (n > 0) { out.absorb += n; name("absorb", talent); } }
    if (p.atone?.heal !== undefined) { const n = at(p.atone.heal, { rank, tier }); if (n > 0) { out.atone = Math.max(out.atone, n); name("atone", talent); } }
  }
  return out;
}

/**
 * The schools a Ward is laid against: the one the Use's chooser named, or every
 * school with Aegis Eternal. A school the vocabulary lacks names none.
 *
 * @param {{chosen?: string|null, everySchool?: boolean, schools?: string[]}} o  `schools` the vocabulary's keys
 * @returns {string[]}
 */
export function wardSchools({ chosen = null, everySchool = false, schools = [] } = {}) {
  if (everySchool) return [...schools];
  return chosen && schools.includes(chosen) ? [chosen] : [];
}

/**
 * Why a Ward's Use is refused for its targets, before anything is paid (D-768's
 * order): none named, or more than the Ward may name.
 *
 * @param {{named?: number, allowed?: number}} o
 * @returns {string|null}  an i18n key
 */
export function wardTargetRefusal({ named = 0, allowed = 1 } = {}) {
  const n = Math.max(0, Math.trunc(Number(named)) || 0);
  if (n < 1) return "AZEROTH.Ward.NoTarget";
  return n > Math.max(1, Math.trunc(Number(allowed)) || 1) ? "AZEROTH.Ward.TooMany" : null;
}

/**
 * The `system.changes` a laid Ward carries: Ward per school, and Shield
 * Discipline's reduction on every source - each `final`, because a Ward and the
 * damage reduction are both derived (D-668's rule).
 *
 * @param {{schools: string[], amount?: number, reduction?: number}} o
 */
export function wardChanges({ schools = [], amount = WARD_BASE.amount, reduction = 0 } = {}) {
  const out = (schools ?? []).map(school => ({ key: `system.ward.${school}`, type: "add", value: String(amount), phase: "final" }));
  if (Number(reduction) > 0) out.push({ key: "system.damageReduction", type: "add", value: String(Math.trunc(Number(reduction))), phase: "final" });
  return out;
}

/**
 * **WHETHER A PRIEST'S WARD PREVENTED DAMAGE ON THIS BLOW** (04's Atonement: *When
 * your Ward class feature prevents damage*; Absorption: *When a target of your
 * Ward class feature reduces damage to 0*).
 *
 * **ONLY THIS PRIEST'S OWN WARD IS CREDITED** (the architect's review of D-774).
 * Wards on one creature add into one number (05 §15) and a creature may carry a
 * ring's Ward, a rung's, a talent's and two priests' at once, so what the blow's
 * Ward took is not by itself this priest's doing. MY READING, for the lead: this
 * priest's Ward counts LAST - it prevented damage where the blow took more Ward
 * than the creature carries without it (`wardTotal` less this Ward's `amount`), of
 * a school it covers, and likewise its Shield Discipline reduction where the blow
 * lost more to the standing reduction than the creature has without it
 * (`standingTotal` less `reduction`). Absorption asks that the blow came to
 * nothing as well. Two priests' Wards on one creature are each credited only for
 * what the other could not have taken.
 *
 * @param {{type?: string|null, schools?: string[], amount?: number, wardTook?: number, wardTotal?: number,
 *   standingTook?: number, standingTotal?: number, reduction?: number, dealt?: number}} o
 *   `amount` this Ward's own (1); `wardTotal` the creature's whole Ward in the blow's
 *   school; `standingTotal` its whole standing reduction
 * @returns {{prevented: boolean, toNothing: boolean}}
 */
export function wardPrevented({
  type = null, schools = [], amount = WARD_BASE.amount, wardTook = 0, wardTotal = 0,
  standingTook = 0, standingTotal = 0, reduction = 0, dealt = 0
} = {}) {
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  const othersWard = Math.max(0, n(wardTotal) - n(amount));
  const byWard = Boolean(type) && (schools ?? []).includes(type) && n(amount) > 0 && n(wardTook) > othersWard;
  const othersStanding = Math.max(0, n(standingTotal) - n(reduction));
  const byReduction = n(reduction) > 0 && n(standingTook) > othersStanding;
  const prevented = byWard || byReduction;
  return { prevented, toNothing: prevented && n(dealt) === 0 };
}

/* ---- Who a heal reaches -------------------------------------------------- */

/**
 * **HOW MANY A HEAL NAMES, AND WHAT THE FURTHER ONES TAKE** (02's Mend: *to a
 * target*; 04's Divine Providence: *Any healing feature of yours that names one
 * target may name two*; Circle of Healing: *also restores half as much, rounded
 * down, to one further target within 10 feet, or to two further targets at rank
 * 2*; Chain Heal: *one further friendly target within 10 feet per rank*), or null
 * where nothing here limits the heal's targets - every other feature and spell
 * reaches whom it reached before.
 *
 * @param {Array} talents  the HEALER's
 * @param {{feature?: string|null, spell?: string|null}} o  the feature's or the spell's name
 * @returns {{primary: number, further: {count: number, share: "half", feet: number, friendly: boolean}|null, by: string[]}|null}
 */
export function healTargetsFor(talents = [], { feature = null, spell = null } = {}, rowOf = talentEffect) {
  if (HEALS_ONE_TARGET.includes(feature)) {
    const out = { primary: HEALS_ONE.names, further: null, by: [] };
    // **DIVINE PROVIDENCE ON A HEALING FEATURE OF ANY CLASS** (04: *Any healing
    // feature of yours that names one target may name two*; the lead, 2026-10-03,
    // on O-160: *"Yes."*; D-778): its `healing` row, on every one of 02's healing
    // features that names one target - Mend, Lay on Hands, Regrowth - whichever
    // class the character holds it from.
    for (const { talent, row, rank } of rowsOfKind(talents, "healing", rowOf)) {
      const p = atRankOf(row, rank);
      if (Number(p.names) > out.primary) { out.primary = Math.trunc(Number(p.names)); out.by.push(talent.name); }
    }
    for (const { talent, patch, rank } of patchRowsOf(talents, feature, rowOf)) {
      const p = atRankOf(patch, rank);
      if (Number(p.names) > out.primary) { out.primary = Math.trunc(Number(p.names)); out.by.push(talent.name); }
      if (p.further) {
        const count = at(p.further.count ?? "rank", { rank });
        if (count > 0) { out.further = { count, share: "half", feet: Math.max(0, Number(p.further.feet) || 0), friendly: p.further.friendly === true }; out.by.push(talent.name); }
      }
    }
    return out;
  }
  if (spell) {
    for (const { talent, row, rank } of rowsOfKind(talents, "spell", rowOf)) {
      if (!row.further || !(row.names ?? []).includes(spell)) continue;
      const count = at(row.further.count ?? "rank", { rank });
      if (count > 0) return { primary: 1, further: { count, share: "half", feet: Math.max(0, Number(row.further.feet) || 0), friendly: true }, by: [talent.name] };
    }
  }
  return null;
}

/** 02's Mend names one target (*restore Health ... to a target within 30 feet*). */
export const HEALS_ONE = Object.freeze({ feature: "Mend", names: 1 });

/**
 * **02's HEALING FEATURES THAT NAME ONE TARGET** (D-778): Mend (*to a target within
 * 30 feet*), Lay on Hands (*to the target by touch*) and Regrowth (*a target within
 * 30 feet you can see*) - the ones 04's Divine Providence may make name two, of
 * whichever class. Second Wind heals its user and names nobody; Mass Mend names
 * any number; a talent's healing Use (Swiftmend, Guardian Spirit) names its
 * creature through its own door, which takes one (MY READING, for the lead).
 */
export const HEALS_ONE_TARGET = Object.freeze(["Mend", "Lay on Hands", "Regrowth"]);

/**
 * Why a heal's targets are refused, before anything is paid: more named than the
 * heal reaches. Null where the heal sets no limit or the count holds.
 *
 * @param {{named?: number, limits?: object|null}} o  `limits` is `healTargetsFor`'s
 * @returns {{key: string, max: number}|null}
 */
export function healTargetRefusal({ named = 0, limits = null } = {}) {
  if (!limits) return null;
  const max = limits.primary + (limits.further?.count ?? 0);
  return (Math.trunc(Number(named)) || 0) > max ? { key: "AZEROTH.Heal.TooMany", max } : null;
}

/**
 * The amount each named target restores: the first `primary` the whole heal, the
 * further ones half of it, rounded down. With no limits every target takes the
 * whole heal, as it always did.
 *
 * @param {number} amount
 * @param {object|null} limits  `healTargetsFor`'s
 * @param {number} named
 * @returns {number[]}
 */
export function healShares(amount, limits = null, named = 0) {
  const n = Math.max(0, Math.trunc(Number(named)) || 0);
  const whole = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!limits) return Array.from({ length: n }, () => whole);
  return Array.from({ length: n }, (_, i) => (i < limits.primary ? whole : Math.floor(whole / 2)));
}

/* ---- What a counter buys on the dialog ----------------------------------- */

/** The actor flag Static Charge's charges stand under. */
export const CHARGE_FLAG = "staticCharges";

/**
 * **STATIC CHARGE** (04: *When a Casting Test you make meets or exceeds SL 2, you
 * gain a Static Charge. You may hold a number of Static Charges equal to your
 * rank. When you deal damage you may spend a Static Charge to add your tier to
 * that damage*): the SL that gains one, how many may be held, and what one adds.
 *
 * @param {Array} talents
 * @param {{tier?: number}} [o]
 * @returns {{identifier: string, name: string, sl: number, max: number, damage: number}|null}
 */
export function chargeFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "charge", rowOf);
  if (!first) return null;
  const max = at(first.row.max ?? "rank", { rank: first.rank });
  return max > 0 ? { identifier: first.talent.identifier, name: first.talent.name, sl: Math.max(0, Number(first.row.sl) || 0), max, damage: at(first.row.damage ?? "tier", { rank: first.rank, tier }) } : null;
}

/**
 * The charges held after a Casting Test at this SL: one more where it reached the
 * row's SL, never past the most that may be held.
 *
 * @param {number} held
 * @param {{sl: number, max: number}|null} row  `chargeFor`'s
 * @param {number} sl
 */
export function chargesAfterTest(held = 0, row = null, sl = 0) {
  const now = Math.max(0, Math.trunc(Number(held)) || 0);
  if (!row) return now;
  if ((Math.trunc(Number(sl)) || 0) < row.sl) return Math.min(now, row.max);
  return Math.min(row.max, now + 1);
}

/** The kinds of roll a talent line may stand on. */
export const LINE_ROLLS = Object.freeze(["spell", "feature", "attack"]);

/**
 * **WHAT A TALENT'S COUNTER OR CHARGE BUYS ON THIS ROLL** (D-774): Inner Focus's
 * free Mana on a Casting Test that costs some, Lava Burst's Ward ignored on a Fire
 * spell, and Static Charge's tier on any roll that deals damage. Each is a line on
 * the roll's own dialog, unticked - spending a use is the player's call (D2 §12) -
 * and greyed with its reason in words where nothing is left. Sorted by name.
 *
 * @param {Array} talents
 * @param {{roll: "spell"|"feature"|"attack", school?: string|null, damages?: boolean, mana?: number,
 *   casting?: boolean, left?: Record<string, number>, charges?: number, tier?: number}} o
 *   `left` the uses left on each talent's counter, by talent identifier
 * @returns {Array<{id: string, identifier: string, name: string, kind: "free"|"pierce"|"charge", amount: number,
 *   left: number, available: boolean, reason: string|null}>}
 */
export function talentLinesFor(talents = [], { roll = "spell", school = null, damages = false, mana = 0, casting = false, left = {}, charges = 0, tier = 1, ticks = false, spell = "", healing = false, action = null } = {}, rowOf = talentEffect) {
  const out = [];
  const line = (talent, kind, amount, uses) => out.push({
    id: `talent-line-${talent.identifier}`, identifier: talent.identifier, name: talent.name, kind, amount,
    left: uses, available: uses > 0, reason: uses > 0 ? null : (kind === "charge" ? "AZEROTH.TalentLine.NoCharge" : "AZEROTH.TalentLine.NoUses")
  });
  // **A HEALING CLASS FEATURE AT A HALF-ACTION** (04's Nature's Swiftness; the lead,
  // 2026-10-03, on O-168: *"Yes to both."*; D-779): on a healing feature's own dialog
  // whose action is a rung the row lowers, a line spending a use of its counter -
  // the spell's own dialog carries its swift line apart (`castWithDialog`).
  if (roll === "feature" && healing === true) {
    for (const { talent, row } of rowsOfKind(talents, "castAs", rowOf)) {
      const from = Array.isArray(row.from) ? row.from : [row.from];
      if (row.features !== true || row.healing !== true || !from.includes(action)) continue;
      line(talent, "swift", 0, Math.max(0, Math.trunc(Number(left?.[talent.identifier])) || 0));
    }
  }
  for (const { talent, row, rank } of rowsOfKind(talents, "castLine", rowOf)) {
    const uses = Math.max(0, Math.trunc(Number(left?.[talent.identifier])) || 0);
    // **04's DEVOURING PLAGUE** (the lead, 2026-10-03, on O-186: *"tick on cast, and
    // 1 turn after."*; D-779): a line on the named spell's own dialog, spending a use
    // of the counter; the cast judges the target below half Health before anything
    // is paid.
    if (row.double && roll === "spell" && (row.double.spells ?? []).includes(spell)) line(talent, "double", Math.max(1, Math.trunc(Number(row.double.landings)) || 1), uses);
    if (row.free === true) {
      const casts = roll === "spell" || (roll === "feature" && casting === true);
      if (casts && (Number(mana) || 0) > 0) line(talent, "free", 0, uses);
    }
    if (row.pierce !== undefined && roll === "spell" && damages && (row.schools ?? []).includes(school)) {
      const n = at(row.pierce, { rank });
      if (n > 0) line(talent, "pierce", n, uses);
    }
    // **FEL FIRE** (04: *When you cast a Fire spell you may have it deal Fel damage
    // instead. A spell cast this way adds your rank to its damage against anything
    // not Immune (Fel)*; D-775): a line on a Fire spell that deals damage - on the
    // cast, or as its tick (`ticks`, Immolate's) - with no counter behind it:
    // always available, the player's to tick.
    if (row.convert?.to && roll === "spell" && (damages || ticks) && (row.convert.from ?? []).includes(school)) {
      out.push({
        id: `talent-line-${talent.identifier}`, identifier: talent.identifier, name: talent.name, kind: "convert",
        amount: at(row.add ?? 0, { rank }), to: row.convert.to, left: 1, available: true, reason: null
      });
    }
  }
  const charge = chargeFor(talents, { tier }, rowOf);
  if (charge && damages) {
    const t = (talents ?? []).find(x => x?.identifier === charge.identifier) ?? { identifier: charge.identifier, name: charge.name };
    line(t, "charge", charge.damage, Math.min(charge.max, Math.max(0, Math.trunc(Number(charges)) || 0)));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.identifier.localeCompare(b.identifier));
}

/**
 * The ticked lines a roll may still take, judged again at the door against what
 * is left NOW: a line no longer offered, or whose counter or charge has run out
 * since the dialog opened, is dropped and named.
 *
 * @param {Array} lines   `talentLinesFor`'s, as they stand now
 * @param {string[]} picked  the identifiers the roller ticked
 * @returns {{taken: Array<object>, lost: string[]}}
 */
export function talentLinesTaken(lines = [], picked = []) {
  const ids = [...new Set((picked ?? []).filter(id => typeof id === "string" && id))];
  const taken = [];
  const lost = [];
  for (const id of ids) {
    const l = (lines ?? []).find(x => x.identifier === id) ?? null;
    if (l?.available) taken.push(l);
    else lost.push(id);
  }
  return { taken, lost };
}

/* ---- What a cast's card offers after the die ------------------------------ */

/**
 * **OVERLOAD** (04: *When a Casting Test you make for a spell that deals damage
 * meets or exceeds SL 3, that spell fires a second time at half damage, rounded
 * down, against the same target*): whether this cast offers it.
 *
 * @param {Array} talents
 * @param {{sl?: number, damages?: boolean, success?: boolean}} o
 * @returns {{identifier: string, name: string}|null}
 */
export function overloadFor(talents = [], { sl = 0, damages = false, success = false } = {}, rowOf = talentEffect) {
  if (!damages || !success) return null;
  const [first] = rowsOfKind(talents, "overload", rowOf);
  if (!first) return null;
  return (Math.trunc(Number(sl)) || 0) >= (Number(first.row.sl) || 0) ? { identifier: first.talent.identifier, name: first.talent.name } : null;
}

/** Half a damage, rounded down - Overload's second firing. */
export function halfDamage(rating = 0) {
  return Math.floor(Math.max(0, Math.trunc(Number(rating)) || 0) / 2);
}

/**
 * **ANCESTRAL KNOWLEDGE** (04: *A Casting Test of yours that fails costs no Mana*):
 * whether this cast's card offers the Mana back - a Casting Test that failed and
 * paid some.
 *
 * @param {Array} talents
 * @param {{success?: boolean, paid?: number}} o
 * @returns {{identifier: string, name: string}|null}
 */
export function refundFor(talents = [], { success = true, paid = 0 } = {}, rowOf = talentEffect) {
  if (success || !((Math.trunc(Number(paid)) || 0) > 0)) return null;
  const [first] = rowsOfKind(talents, "refund", rowOf);
  return first?.row?.failed === true ? { identifier: first.talent.identifier, name: first.talent.name } : null;
}

/* ---- A blow's riders that cost nothing ------------------------------------ */

/** The effect flag Doom Winds' span stands under, on the shaman. */
export const DOOM_WINDS_FLAG = "doomWinds";

/**
 * **STORMLASH** (04: *Once a round, when you hit with a weapon attack, add Nature
 * damage equal to your rank*; Doom Winds: *Your Stormlash triggers on every hit
 * until your next turn*): what it adds, and whether the round's once holds.
 *
 * @param {Array} talents
 * @param {{doomWinds?: boolean}} [o]
 * @returns {{identifier: string, name: string, amount: number, once: boolean}|null}
 */
export function stormlashFor(talents = [], { doomWinds = false } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "stormlash", rowOf);
  if (!first) return null;
  const amount = at(first.row.amount ?? "rank", { rank: first.rank });
  // *add NATURE damage* (D-777): the type the amount is, a second amount on the
  // blow met by its own Ward - the lead: *"Different damage types in one attack
  // are possible"*.
  return amount > 0 ? {
    identifier: first.talent.identifier, name: first.talent.name, amount,
    once: first.row.once === "round" && doomWinds !== true, type: first.row.type ?? null
  } : null;
}

/**
 * **ROCKBITER** (04: *While you carry a shield, your Armor Points rise by 1 per
 * rank against the first attack each round*): the Armor Points, or null where no
 * shield is held (a melded one is held by nobody, D-769).
 *
 * @param {Array} talents  the TARGET's
 * @param {{shield?: boolean}} o
 * @returns {{identifier: string, name: string, ap: number}|null}
 */
export function firstAttackFor(talents = [], { shield = false } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "firstAttack", rowOf);
  if (!first) return null;
  if (first.row.needs === "shield" && shield !== true) return null;
  const ap = at(first.row.ap ?? "rank", { rank: first.rank });
  return ap > 0 ? { identifier: first.talent.identifier, name: first.talent.name, ap } : null;
}

/** The round record's mark the first attack against a Rockbiter holder leaves. */
export const FIRST_ATTACK_MARK = "firstAttack";

/**
 * Armor Points with Rockbiter's laid over every location the creature has.
 *
 * @param {{body?: number|null, head?: number|null, limb?: number|null}} ap
 * @param {number} more
 */
export function apWith(ap = {}, more = 0) {
  const n = Math.max(0, Math.trunc(Number(more)) || 0);
  const out = {};
  for (const [k, v] of Object.entries(ap ?? {})) out[k] = v === null || v === undefined ? v : (Number(v) || 0) + n;
  return out;
}

/**
 * **MAELSTROM** (04: *Every third weapon hit returns 2 Mana per rank to you*): the
 * count after this hit, and the Mana it returns where it was the third.
 *
 * @param {Array} talents
 * @param {number} count  the hits counted before this one
 * @returns {{count: number, mana: number, name: string}|null}
 */
export function maelstromStep(talents = [], count = 0, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "maelstrom", rowOf);
  if (!first) return null;
  const every = Math.max(1, Math.trunc(Number(first.row.every)) || 3);
  const next = (Math.max(0, Math.trunc(Number(count)) || 0) + 1);
  if (next < every) return { count: next, mana: 0, name: first.talent.name };
  return { count: 0, mana: at(first.row.mana ?? "2*rank", { rank: first.rank }), name: first.talent.name };
}

/** The actor flag Maelstrom's count stands under. */
export const MAELSTROM_FLAG = "maelstrom";

/**
 * **EARTHLIVING** (04: *When you make a melee attack, you may restore Health to
 * yourself equal to half your tier, rounded down, plus your rank*): the Health, or
 * null where the attack is not a melee one.
 *
 * @param {Array} talents
 * @param {{melee?: boolean, tier?: number}} o
 * @returns {{name: string, heal: number}|null}
 */
export function earthlivingFor(talents = [], { melee = false, tier = 1 } = {}, rowOf = talentEffect) {
  if (!melee) return null;
  const [first] = rowsOfKind(talents, "earthliving", rowOf);
  if (!first) return null;
  const heal = at(first.row.heal ?? "rank", { rank: first.rank, tier });
  return heal > 0 ? { name: first.talent.name, heal } : null;
}

/**
 * **ANCESTRAL GUIDANCE** (04: *When your Earthliving triggers, one friendly target
 * within 10 feet restores the same amount. At rank 2 a second friendly target
 * within 10 feet does as well*): how many presses the card's button allows, and
 * the reach.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, count: number, feet: number}|null}
 */
export function guidanceFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "guidance", rowOf);
  if (!first) return null;
  const count = at(first.row.count ?? "rank", { rank: first.rank });
  return count > 0 ? { identifier: first.talent.identifier, name: first.talent.name, count, feet: Math.max(0, Number(first.row.feet) || 0) } : null;
}

/**
 * Whether one more press of a card's heal button is refused: the presses the card
 * records against its allowance (the architect's review of D-773's shape, a card
 * that heals counting its presses as one that attacks does).
 *
 * @param {{made?: number, allowed?: number}} o
 * @returns {string|null}
 */
export function cardHealRefusal({ made = 0, allowed = 1 } = {}) {
  return (Math.max(0, Math.trunc(Number(made)) || 0)) >= Math.max(1, Math.trunc(Number(allowed)) || 1) ? "AZEROTH.Card.HealsSpent" : null;
}

/* ---- What a blow does beyond its target ----------------------------------- */

/**
 * **VAMPIRIC TOUCH** (04: *Once a round, when Shadow damage from you reduces a
 * target's Health, you restore Health equal to your rank*): the Health, the
 * damage type, and the round's once.
 *
 * @param {Array} talents  the ATTACKER's
 * @param {{type?: string|null}} o  the blow's damage type
 * @returns {{identifier: string, name: string, heal: number, once: string|null}|null}
 */
export function drainFor(talents = [], { type = null } = {}, rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "drain", rowOf)) {
    if (!type || row.type !== type) continue;
    const heal = at(row.heal ?? "rank", { rank });
    if (heal > 0) return { identifier: talent.identifier, name: talent.name, heal, once: row.once ?? null };
  }
  return null;
}

/**
 * **SHADOWY APPARITION** (04: *When a target dies while suffering Shadow damage
 * from you, every other enemy within 20 feet takes Shadow damage equal to your
 * tier*): the reach, the damage and its type, or null.
 *
 * @param {Array} talents  the PRIEST's
 * @param {{tier?: number}} [o]
 * @returns {{identifier: string, name: string, feet: number, amount: number, type: string}|null}
 */
export function apparitionFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "apparition", rowOf);
  if (!first) return null;
  const amount = at(first.row.amount ?? "tier", { rank: first.rank, tier });
  return amount > 0 ? { identifier: first.talent.identifier, name: first.talent.name, feet: Math.max(0, Number(first.row.feet) || 0), amount, type: first.row.type ?? "shadow" } : null;
}

/**
 * **EVERY STRIKE A DEATH SETS OFF** (Shadowy Apparition, D-774; and 04's Living Bomb:
 * *When a target burning from Ignite drops to 0 Health, every enemy within 10 feet
 * takes Fire damage equal to your tier per rank*; D-775): each row the holder takes,
 * with what the fallen creature must be suffering from the holder - a tick of the
 * row's type, or the holder's Ignite (`from: "ignite"`).
 *
 * @param {Array} talents  the HOLDER's
 * @param {{tier?: number}} [o]
 * @returns {Array<{identifier: string, name: string, feet: number, amount: number, type: string, from: string|null}>}
 */
export function apparitionsFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "apparition", rowOf)) {
    const amount = at(row.amount ?? "tier", { rank, tier });
    if (amount <= 0) continue;
    out.push({ identifier: talent.identifier, name: talent.name, feet: Math.max(0, Number(row.feet) || 0), amount, type: row.type ?? "shadow", from: row.from ?? null });
  }
  return out;
}

/**
 * Whether a creature is *suffering Shadow damage from you* (Shadowy Apparition):
 * an active tick of that type the priest laid on it (D-770's carrier). MY
 * READING, for the lead: a tick, never an area the priest stands in.
 *
 * @param {Array<object|null>} ticks  each active effect's `flags["azeroth-rpg"].tick`
 * @param {{source?: string|null, type?: string}} o
 */
export function sufferingFrom(ticks = [], { source = null, type = "shadow" } = {}) {
  if (!source) return false;
  return (ticks ?? []).some(t => t && t.kind === "damage" && t.source === source && t.type === type);
}

/**
 * The key a damage type is recorded under in the attacker's `damaged` map (04's
 * Twisted Faith: *a target dealt Shadow damage by you*; D-774): beside the bare
 * key the map has always carried, so `damaged[key]` still says *damaged at all*.
 * The writer (`effects/after-blow.mjs#markDamaged`) and the reader
 * (`roll-dialog.mjs`'s Twisted Faith line) both ask this, never a template string.
 *
 * @param {string} key  the victim's token id, or its actor's
 * @param {string} type
 */
export function damagedTypeKey(key, type) {
  return `${key}:${type}`;
}

/* ---- Shadowform ----------------------------------------------------------- */

/** The actor flag a Holy blow or a heal leaves on a Shadowform holder until their turn ends. */
export const SHADOWFORM_FLAG = "lightUsed";

/**
 * **SHADOWFORM'S FACT** (04: *If you have not dealt Holy damage or used a healing
 * spell or feature since your last turn*): readable in a fight alone, where a turn
 * exists - true where nothing has been marked since the priest's own last turn
 * ended, false where something has. Out of a fight it is the table's (null).
 *
 * @param {{fightId?: string|null, mark?: {combat?: string}|null}} o
 * @returns {boolean|null}
 */
export function shadowformHolds({ fightId = null, mark = null } = {}) {
  if (!fightId) return null;
  return !(mark && mark.combat === fightId);
}

/* ---- What a Use does, beyond its descriptor ------------------------------ */

/** The actor flag Cloudburst's promise stands under, on the shaman. */
export const CLOUDBURST_FLAG = "cloudburst";

/** The effect flag Ascendance's span stands under. */
export const ASCEND_FLAG = "ascendance";

/** The effect flag Spirit Walk's span stands under. */
export const SPIRIT_WALK_FLAG = "spiritWalk";

/**
 * **WHAT THE PRIEST'S AND THE SHAMAN'S USES DO, AT THE RANK** (D-774): Hymn of
 * Hope's Mana to every ally in reach, Silence's condition, Ascendance's SL,
 * Spirit Walk's walk, Doom Winds' span and Cloudburst's promise. Null keys where
 * the row says nothing.
 *
 * @param {object|null} onUse  the granting talent's `onUse`
 * @param {{rank?: number, tier?: number}} [scope]
 */
export function onUsePriestShaman(onUse, { rank = 1, tier = 1 } = {}) {
  const o = onUse ?? {};
  return {
    restores: o.restores?.pool ? { pool: o.restores.pool, amount: at(o.restores.amount ?? "tier", { rank, tier }), feet: Math.max(0, Number(o.restores.feet) || 0) } : null,
    inflicts: o.inflicts?.condition ? { condition: o.inflicts.condition, until: o.inflicts.until ?? null, feet: Math.max(0, Number(o.inflicts.feet) || 0) || null } : null,
    ascend: o.ascend ? { schools: [...(o.ascend.schools ?? [])], sl: Math.max(1, Math.trunc(Number(o.ascend.sl)) || 1), until: o.ascend.until ?? "userTurnStart" } : null,
    walk: o.walk ? { until: o.walk.until ?? "userTurnEnd" } : null,
    doomWinds: o.doomWinds ? { until: o.doomWinds.until ?? "userTurnStart" } : null,
    cloudburst: o.cloudburst ? { feet: Math.max(0, Number(o.cloudburst.feet) || 0) } : null,
    // Guardian Spirit's Use restores the tier to ONE creature targeted (D-774).
    aims: o.aims === "one" ? "one" : null,
    // 04's Thunderstorm (*are moved 10 feet away from you in any direction*; the
    // lead, 2026-10-03, on O-158: *"Yes."*; D-778): the creatures the Use names,
    // moved through the forced-movement door once it has succeeded.
    push: o.push ? { feet: at(o.push.feet ?? 0, { rank, tier }), from: o.push.from ?? "user" } : null
  };
}

/**
 * **WHETHER A FEATURE'S USE IS AIMED AT THE CREATURES TARGETED** (D-774, found
 * beside 02's Ward). The sheet's Use button handed targets to a non-casting
 * feature only where it laid a Bane (Pummel), ended a heal over time (Swiftmend)
 * or named a partner (Symbiosis), so every Use since that reads its targets -
 * Taunt's, Judgement's and Feint's Banes, Blessing's Boon, Beacon's and Death
 * Mark's naming (D-772, D-773) - was refused *name one target* from the sheet
 * whatever was targeted, and Barrage's fifth target was never refused. Their
 * Quench tests handed the targets straight to `useFeature`, which is why nothing
 * saw it (D-681's shape). This is the ONE reading the button asks; a self-heal
 * like Second Wind is still handed none, so it never moves onto whoever happens
 * to be selected.
 *
 * @param {{name?: string, lays?: object|null, attack?: boolean, onUse?: object|null, barrage?: boolean}} o
 */
export function featureAims({ name = "", lays = null, attack = false, onUse = null, barrage = false } = {}) {
  if (lays?.kind || attack === true || barrage === true) return true;
  const o = onUse ?? {};
  // 04's Soul Swap and Haunt name their creatures (D-775); Thunderstorm moves the
  // ones it names (D-778).
  if (o.ends || o.partner || o.beacon || o.laysBane || o.laysBoon || o.deathMark || o.inflicts || o.aims || o.swap || o.haunt || o.push) return true;
  // 02's Blink (Slow Time's friend) and Counterspell (Spellsteal's caster), D-775;
  // and 02's Dispel, whose one target (and Rapture's second) the Use ends effects
  // on (D-778).
  return name === WARD_BASE.feature || name === REINCARNATION.feature || name === BLINK.feature || name === COUNTERSPELL.feature || name === DISPEL_FEATURE;
}

/**
 * **ASCENDANCE** (04: *your Fire and Nature damage spells count as reaching one SL
 * higher until your next turn*): the SL a cast's riders read. MY READING, for the
 * lead: the cast's Success Level, never whether it succeeded - CLAUDE.md §7 reads
 * success off the margin - so a failed Test stays failed and an SL of a damage
 * spell of those schools rises.
 *
 * @param {number} sl
 * @param {{school?: string|null, damages?: boolean, success?: boolean, ascended?: {schools: string[], sl: number}|null}} o
 */
export function ascendedSl(sl = 0, { school = null, damages = false, success = false, ascended = null } = {}) {
  const n = Math.trunc(Number(sl)) || 0;
  if (!ascended || !success || !damages || !(ascended.schools ?? []).includes(school)) return n;
  return n + ascended.sl;
}

/**
 * **WHAT A TALENT LAYS MORE OF ON A SPELL'S EFFECT** (04's Pain Suppression: *Each
 * rank adds 1 to the damage it prevents*): the changes the spell's laid effect
 * carries, with each talent's `adds` laid over them at its rank - added to a change
 * of the same key, or a new one. Read at the cast, so the card's Apply lays it.
 *
 * @param {Array<{key: string, type?: string, value: string|number}>} changes  the spell's own
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{changes: Array<object>, by: Array<{name: string, key: string, amount: number}>}}
 */
export function spellAddsFor(changes = [], talents = [], { name = "" } = {}, rowOf = talentEffect) {
  const out = (changes ?? []).map(c => ({ ...c }));
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "spell", rowOf)) {
    if (!Array.isArray(row.adds) || !(row.names ?? []).includes(name)) continue;
    for (const a of row.adds) {
      // An add a rank reaches (04's Frost Armor: *At rank 2 its Ward against
      // Frost is 2*; D-775).
      if (rank < (Number(a.minRank) || 1)) continue;
      const n = at(a.amount ?? "rank", { rank });
      if (!a.key || n <= 0) continue;
      const held = out.find(c => c.key === a.key && (c.type ?? "add") === "add");
      if (held) held.value = String((Number(held.value) || 0) + n);
      else out.push({ key: a.key, type: "add", value: String(n) });
      by.push({ name: talent.name, key: a.key, amount: n });
    }
  }
  return { changes: out, by };
}

/**
 * **WHAT A TALENT ADDS TO A SPELL'S OWN HEAL** (04's Healing Wave: *Each rank adds
 * 1 to the Health it restores*), summed, with the talents.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{amount: number, by: Array<{name: string, amount: number}>}}
 */
export function spellHealFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  let amount = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "spell", rowOf)) {
    if (!(Number(row.heal) > 0) || !(row.names ?? []).includes(name)) continue;
    const n = rank * Math.trunc(Number(row.heal));
    amount += n;
    by.push({ name: talent.name, amount: n });
  }
  return { amount, by };
}

/**
 * **WHAT A TALENT LAYS ON A FAILED RESIST** (04's Void Eruption: *a creature that
 * fails the Test is also Silenced until the end of your next turn*): the
 * conditions, beside the spell's own, once each.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{statuses: string[], by: string[]}}
 */
export function spellOnFailFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  const statuses = [];
  const by = [];
  for (const { talent, row } of rowsOfKind(talents, "spell", rowOf)) {
    if (!Array.isArray(row.onFail) || !(row.names ?? []).includes(name)) continue;
    for (const id of row.onFail) if (!statuses.includes(id)) statuses.push(id);
    by.push(talent.name);
  }
  return { statuses, by };
}

/**
 * **A TICK A TALENT GIVES A SPELL THAT HAS NONE** (04's Ancestral Tide: *Each
 * target also regains 4 Health at the start of their next turn*): the tick's
 * stored shape (D-770's `system.tick`), or null.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @returns {{kind: string, amount: string, rounds: number, hit: true, when: "startOfTurn", name: string}|null}
 */
export function spellTickFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  for (const { talent, row } of rowsOfKind(talents, "spell", rowOf)) {
    const t = row.addTick;
    if (!t?.kind || !(row.names ?? []).includes(name)) continue;
    return {
      kind: t.kind, type: null, amount: String(t.amount), rounds: Math.max(1, Math.trunc(Number(t.rounds)) || 1),
      until: "", when: "startOfTurn", hit: true, sl: null, spellpower: false, reason: "", name: talent.name
    };
  }
  return null;
}

/* ---- 02's Reincarnation, and Undying Spirit ------------------------------ */

/** 02's Reincarnation: *Once between Long Rests, return from Dying at 1 Health without spending a Tether*. */
export const REINCARNATION = Object.freeze({ feature: "Reincarnation", health: 1 });

/**
 * What the shaman's Reincarnation returns them at, and whom it brings with them
 * (04's Undying Spirit: *returns you at half your maximum Health rather than 1,
 * and one Dying friendly target within 30 feet returns with you at 1 Health*).
 *
 * @param {Array} talents
 * @returns {{returnAt: "one"|"half", ally: {feet: number}|null, by: string[]}}
 */
export function reincarnationFor(talents = [], rowOf = talentEffect) {
  const out = { returnAt: "one", ally: null, by: [] };
  for (const { talent, patch, rank } of patchRowsOf(talents, REINCARNATION.feature, rowOf)) {
    const p = atRankOf(patch, rank);
    if (p.returnAt === "half") out.returnAt = "half";
    if (p.ally?.feet !== undefined) out.ally = { feet: Math.max(0, Number(p.ally.feet) || 0) };
    out.by.push(talent.name);
  }
  return out;
}

/**
 * The Health a Reincarnation returns the shaman at: 1, or half the maximum,
 * rounded down and never below 1 (MY READING, for the lead: 04 does not say how
 * an odd maximum halves).
 *
 * @param {{max?: number, returnAt?: "one"|"half"}} o
 */
export function reincarnatedHealth({ max = 1, returnAt = "one" } = {}) {
  if (returnAt !== "half") return REINCARNATION.health;
  return Math.max(REINCARNATION.health, Math.floor(Math.max(0, Math.trunc(Number(max)) || 0) / 2));
}

/**
 * Why Reincarnation is refused before anything is spent: the shaman is not Dying
 * (06 §9: at 0 Health), or the friend named is not Dying.
 *
 * @param {{health?: number, allyHealth?: number|null}} o
 * @returns {string|null}
 */
export function reincarnationRefusal({ health = 1, allyHealth = null } = {}) {
  if ((Math.trunc(Number(health)) || 0) > 0) return "AZEROTH.Reincarnation.NotDying";
  if (allyHealth !== null && allyHealth !== undefined && (Math.trunc(Number(allyHealth)) || 0) > 0) return "AZEROTH.Reincarnation.AllyNotDying";
  return null;
}

/**
 * Whether this character holds a talent whose damage waits on Shadowform's fact
 * (04's Shadowform, D-774), so a Holy blow or a heal it gives is worth marking.
 *
 * @param {Array} talents
 */
export function marksLightUse(talents = [], rowOf = talentEffect) {
  return rowsOfKind(talents, "damage", rowOf).some(r => r.row?.when === "shadowform");
}

/* ======================================================================== */
/*  THE MAGE'S AND THE WARLOCK'S KINDS (D-775, the talent plan's 10 and 11)  */
/* ======================================================================== */

/*
 * One function a kind, each called by ONE door (named beside it), and
 * `mage-talents.test.mjs` / `warlock-talents.test.mjs` hold every number a row
 * carries to 04's own Effect cell (and 02's and 07's where a talent patches one):
 *
 *   mod("Blink")        `{feet, friendly}` (Improved Blink, Slow Time) - `blinkFor`,
 *                       read by `workflows.useFeature` as the Blink is used
 *   freeUse             `{feature, minRank}`: a feature's Mana waived while the
 *                       counter the talent grants holds a use (Improved Blink at
 *                       rank 2) - `freeUseFor`, Divine Favor's shape (D-772)
 *   overchannel         `{less}`: Health off an Overchannel's price (Overchanneller)
 *                       - `overchannelReliefFor`, read by `castSpell` and its dialog
 *   upkeep              `{spells, free, minRank}`: a Sustain that costs nothing at
 *                       the turn's start (Mana Shield at rank 2, Soul Reaper) -
 *                       `upkeepFor`, read by `AzerothCombat#_turnTicks`
 *   mod("Shape the Weave") `{sustains}` and `archmage {sustains, boons}`: the
 *                       Sustain limit (Netherwind, Archmage) - `sustainsFor`, read
 *                       where a Sustain is written; and Archmage's Boons -
 *                       `archmageBoons`, the Casting Test's line
 *   ignite              `{amount, type}`: a tick laid by Fire damage that reduced a
 *                       creature's Health (Ignite) - `igniteFor`, `igniteTick`,
 *                       from the one damage door
 *   retaliate           `{type, amount, melee}`: what a melee blow on the holder
 *                       takes back (Molten Skin) - `retaliationsFor`, read by
 *                       `effects/area-strikes.mjs#retaliationRows`
 *   immuneAsWard        `{schools, ward}`: an immunity read as Ward by the holder's
 *                       spells (Burning Soul) - `immuneAsWardFor`
 *   immune              `{types}`: damage types the holder is Immune to (Frozen
 *                       Core) - `damageImmunitiesFor`, `CharacterData`'s `immune`
 *   spellCritical       `{on, when, minRank}`: a spell's Critical Injury on a face
 *                       (Shatter at rank 2) - `spellCriticalFor`, the spell card
 *   spellCost           `{schools, less, min}`: a school's spells cheaper (Emberstorm)
 *                       - `spellDiscountFor`, with a Use's state (Icy Veins)
 *   castingBoon         `{boons, while, minRank}`: a Boon on every Casting Test while
 *                       a fact holds (Demonic Knowledge at rank 2) - `castingBoonsFor`
 *   extend              `{spells, features, ongoing, minutes}`: minutes a laid span
 *                       lasts beyond its own (Malediction, Everlasting Affliction) -
 *                       `spanExtensionFor`
 *   siphon              `{types, max}`: Health at the turn's start off the highest
 *                       loss dealt (Siphon) - `siphonFor`, `siphonRecord`, `siphonHeal`
 *   death               `{spell, mana, heal}`: what a creature's death under a held
 *                       spell returns (Drain Soul, Soul Reaper) - `deathRewardsFor`
 *   cauterize           `{stay, feet, amount, type}`: a blow that would drop the
 *                       holder to 0 (Cauterize) - `cauterizeFor`, `cauterizes`
 *   ruin                `{higher, mana, minRank}`: a spell's Critical Injury rolled
 *                       twice, the higher kept (Ruin) - `ruinFor`
 *   mod("Life Tap")     `{mana}` (Improved Life Tap) - `lifeTapFor`, 02's Life Tap
 *   mod("Curse")        `{further}` (Pandemic) - `curseFor`, 02's Curse
 *   mod("Counterspell") `{steals}` (Spellsteal) - `counterspellFor`
 *   mod("Bound Demon")  `{aegis}` (Demonic Aegis) - `aegisWardFor`; `{free}`
 *                       (Master Summoner) - `talent-effects.mjs#patchFeature`
 *   onUse               `veins`, `areaTick`, `haunt`, `swap`, `sacrifice`, `command`
 *                       and `soulFire` - `onUseMageWarlock`
 */

/* ---- 02's Blink, and the talents that ride it ---------------------------- */

/** 02's Blink as the book prints it: *Spend 2 Mana as a Reaction to move 20 feet to a point you have seen*. */
export const BLINK = Object.freeze({ feature: "Blink", feet: 20 });

/**
 * **WHAT A MAGE'S BLINK REACHES, AND WHOM** (04's Improved Blink: *Your Blink class
 * feature reaches 10 feet further per rank*; Slow Time: *You may use your Blink
 * class feature on a friendly target you can see within 30 feet instead of on
 * yourself*; D-775): the feet, read off the talents' patches on 02's Blink, and
 * whether a friend may be the one who moves.
 *
 * @param {Array} talents
 * @returns {{feet: number, friendly: {feet: number}|null, by: string[]}}
 */
export function blinkFor(talents = [], rowOf = talentEffect) {
  const out = { feet: BLINK.feet, friendly: null, by: [] };
  for (const { talent, patch, rank } of patchRowsOf(talents, BLINK.feature, rowOf)) {
    const p = atRankOf(patch, rank);
    if (p.feet !== undefined) out.feet += at(p.feet, { rank });
    if (p.friendly?.feet !== undefined) out.friendly = { feet: Math.max(0, Number(p.friendly.feet) || 0) };
    out.by.push(talent.name);
  }
  return out;
}

/**
 * **WHO A BLINK MOVES, JUDGED BEFORE ANYTHING IS PAID** (D-775): the mage where
 * nobody else is named; with Slow Time, ONE friendly creature, within its reach
 * where both stand. Without Slow Time the Use moves the mage whatever is targeted.
 *
 * @param {{named?: number, self?: boolean, hostile?: boolean, feet?: number|null, friendly?: {feet: number}|null}} o
 *   `named` the creatures targeted other than the mage
 * @returns {string|null}  a lang key, or null
 */
export function blinkTargetRefusal({ named = 0, hostile = false, feet = null, friendly = null } = {}) {
  if (!friendly || !(named > 0)) return null;
  if (named > 1) return "AZEROTH.Blink.OneTarget";
  if (hostile) return "AZEROTH.Laid.NotFriendly";
  if (typeof feet === "number" && Number.isFinite(feet) && feet > friendly.feet) return "AZEROTH.Blink.TooFar";
  return null;
}

/**
 * **A FEATURE A TALENT'S COUNTER MAKES FREE** (04's Improved Blink: *At rank 2 it
 * costs no Mana once per Short Rest*; D-775): Divine Favor's shape (D-772) for one
 * named feature, the counter the talent grants at that rank holding the free uses.
 * MY READING, for the lead: the first Blink while the counter holds a use is the
 * free one, as Divine Favor's first heal is.
 *
 * @param {Array} talents
 * @param {string} feature  the class feature's name
 * @returns {{identifier: string, name: string, talentId: string|null, feature: string}|null}
 */
export function freeUseFor(talents = [], feature = "", rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "freeUse", rowOf)) {
    if (row.feature !== feature || rank < (Number(row.minRank) || 1)) continue;
    return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, feature };
  }
  return null;
}

/* ---- Overchannel ---------------------------------------------------------- */

/**
 * **OVERCHANNELLER** (04: *When you Overchannel, its cost to you is reduced by 1 per
 * rank - the Health*; D-775): the Health taken off a cast's Overchannel, summed.
 * `rules/casting.mjs#overchannelCost` lays it on the price.
 *
 * @param {Array} talents
 * @returns {{amount: number, by: string[]}}
 */
export function overchannelReliefFor(talents = [], rowOf = talentEffect) {
  let amount = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "overchannel", rowOf)) {
    const n = at(row.less ?? "rank", { rank });
    if (n <= 0) continue;
    amount += n;
    by.push(talent.name);
  }
  return { amount, by };
}

/* ---- A Sustain's price and its limit -------------------------------------- */

/**
 * **WHAT A TALENT TAKES OFF A SUSTAIN'S UPKEEP**, entry by entry, read by the
 * turn's upkeep (`AzerothCombat#_turnTicks` through `rules/upkeep.mjs#upkeepCost`):
 *
 * - **free** - 04's Mana Shield (*At rank 2 it costs no Mana to hold*) and Soul
 *   Reaper (*Sustaining it costs no Mana*; D-775): this spell's Mana is nothing.
 * - **less**, **min** - 04's Arcane Concentration (*Each effect you Sustain costs 1
 *   less Mana per rank at the start of your turn, to a minimum of 1*; D-778): every
 *   spell's Mana, never below the minimum by the talent's own hand.
 * - **weaveLess** - 04's Netherwind on 02's Shape the Weave (*the Mana each costs at
 *   the start of your turn is reduced by the number of effects you are
 *   Sustaining*; D-778): the count held at the turn's start, where the mage holds
 *   Shape the Weave, which the patch rides.
 *
 * The upkeep itself is the entry's (the lead, 2026-10-03, on O-163: *"cost by the
 * entry or 1 Power if not mentioned."*), and these take off its Mana alone.
 *
 * @param {Array} talents
 * @param {{name?: string, held?: number, weave?: boolean}} spell  the Sustain's name, how many
 *   the caster holds, and whether the caster holds Shape the Weave
 * @returns {{free: boolean, by: string[], less: number, min: number, lessBy: string[], weaveLess: number, weaveBy: string[]}}
 */
export function upkeepFor(talents = [], { name = "", held = 0, weave = false } = {}, rowOf = talentEffect) {
  const out = { free: false, by: [], less: 0, min: 1, lessBy: [], weaveLess: 0, weaveBy: [] };
  for (const { talent, row, rank } of rowsOfKind(talents, "upkeep", rowOf)) {
    if (rank < (Number(row.minRank) || 1)) continue;
    // A row naming spells reaches those alone; one naming none reaches every Sustain.
    if (Array.isArray(row.spells) && row.spells.length && !row.spells.includes(name)) continue;
    if (row.free === true) out.by.push(talent.name);
    if (row.less !== undefined) {
      const n = at(row.less, { rank });
      if (n > 0) {
        out.less += n;
        out.min = Math.max(out.min, Math.max(0, Math.trunc(Number(row.min ?? 1)) || 0));
        out.lessBy.push(talent.name);
      }
    }
  }
  out.free = out.by.length > 0;
  if (weave) {
    const count = Math.max(0, Math.trunc(Number(held)) || 0);
    for (const { talent, patch, rank } of patchRowsOf(talents, "Shape the Weave", rowOf)) {
      if (atRankOf(patch, rank).upkeepLess !== "held" || count <= 0) continue;
      out.weaveLess = count;
      out.weaveBy.push(talent.name);
    }
  }
  return out;
}

/**
 * **HOW MANY MORE SUSTAINS A MAGE MAY HOLD** (04's Netherwind: *Your Shape the
 * Weave class feature Sustains 1 further effect per rank*; Archmage: *While it runs
 * you may sustain one further spell than you otherwise could*; D-775), on top of
 * 05 §12's limit (`turn-effects.mjs#sustainLimit`). Netherwind patches Shape the
 * Weave, so it adds nothing to a mage who does not hold it yet; Archmage's needs
 * the spell's laid effect standing on the mage.
 *
 * @param {Array} talents
 * @param {{holdsWeave?: boolean, archmageStanding?: boolean}} o
 * @returns {{more: number, by: string[]}}
 */
export function sustainsFor(talents = [], { holdsWeave = false, archmageStanding = false } = {}, rowOf = talentEffect) {
  let more = 0;
  const by = [];
  if (holdsWeave) {
    for (const { talent, patch, rank } of patchRowsOf(talents, "Shape the Weave", rowOf)) {
      const n = at(atRankOf(patch, rank).sustains ?? 0, { rank });
      if (n <= 0) continue;
      more += n;
      by.push(talent.name);
    }
  }
  if (archmageStanding) {
    for (const { talent, row } of rowsOfKind(talents, "archmage", rowOf)) {
      const n = Math.max(0, Math.trunc(Number(row.sustains)) || 0);
      if (n <= 0) continue;
      more += n;
      by.push(talent.name);
    }
  }
  return { more, by };
}

/** 07's Archmage: *Your Casting Tests gain a Boon for each spell you are sustaining, to a maximum of three*. */
export const ARCHMAGE = Object.freeze({ identifier: "archmage", max: 3 });

/**
 * **ARCHMAGE'S BOONS** (07: *Your Casting Tests gain a Boon for each spell you are
 * sustaining, to a maximum of three*; 04's Archmage: *its maximum is four Boons
 * rather than three*; D-775, the spell's own line built with the talent): one a
 * Sustain held, while the spell's laid effect stands on the caster.
 *
 * @param {{standing?: boolean, sustaining?: number}} o
 * @param {Array} talents
 * @returns {{boons: number, max: number, by: string[]}}
 */
export function archmageBoons({ standing = false, sustaining = 0 } = {}, talents = [], rowOf = talentEffect) {
  if (!standing) return { boons: 0, max: 0, by: [] };
  let max = ARCHMAGE.max;
  const by = [];
  for (const { talent, row } of rowsOfKind(talents, "archmage", rowOf)) {
    const m = Math.max(0, Math.trunc(Number(row.boons)) || 0);
    if (m > max) {
      max = m;
      by.push(talent.name);
    }
  }
  return { boons: Math.min(max, Math.max(0, Math.trunc(Number(sustaining)) || 0)), max, by };
}

/* ---- Fire ------------------------------------------------------------------ */

/** The mark a laid tick of Ignite's carries, so its own landing lays no other. */
export const IGNITE_MARK = "ignite";

/**
 * **IGNITE** (04: *When your Fire damage reduces a target's Health, it takes 1
 * further Fire damage per rank at the start of its next turn*; D-775): the damage
 * and its type, or null.
 *
 * @param {Array} talents  the ATTACKER's
 * @returns {{identifier: string, name: string, amount: number, type: string}|null}
 */
export function igniteFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "ignite", rowOf);
  if (!first) return null;
  const amount = at(first.row.amount ?? "rank", { rank: first.rank });
  return amount > 0 ? { identifier: first.talent.identifier, name: first.talent.name, amount, type: first.row.type ?? "fire" } : null;
}

/**
 * Whether a blow lays Ignite: the attacker holds it, the blow's damage is of its
 * type and reduced the target's Health, and the blow was not Ignite's own tick -
 * MY READING, for the lead: a burn whose landing laid the next would never go out.
 *
 * @param {{row?: object|null, type?: string|null, dealt?: number, fromIgnite?: boolean}} o
 */
export function ignites({ row = null, type = null, dealt = 0, fromIgnite = false } = {}) {
  return Boolean(row) && type === row.type && (Number(dealt) || 0) > 0 && fromIgnite !== true;
}

/**
 * The tick Ignite lays (D-770's laid shape): one turn start, the mage's hand,
 * marked as Ignite's.
 *
 * @param {{name: string, amount: number, type: string}} row  `igniteFor`'s
 * @param {{source?: string|null}} [o]
 */
export function igniteTick(row, { source = null } = {}) {
  return {
    kind: "damage", type: row.type, amount: row.amount, rounds: 1, until: "", when: "startOfTurn",
    spellpower: false, source, castUuid: null, cast: null, name: row.name, [IGNITE_MARK]: true
  };
}

/**
 * Whether a creature is *burning from Ignite* (04's Combustion and Living Bomb;
 * D-775): an active tick of Ignite's this hand laid on it.
 *
 * @param {Array<object|null>} ticks  each active effect's `flags["azeroth-rpg"].tick`
 * @param {{source?: string|null}} o
 */
export function igniteBurning(ticks = [], { source = null } = {}) {
  if (!source) return false;
  return (ticks ?? []).some(t => t && t.kind === "damage" && t.source === source && t[IGNITE_MARK] === true);
}

/**
 * **WHAT A MELEE BLOW ON THE HOLDER TAKES BACK** (04's Molten Skin: *a creature that
 * hits you in melee takes Fire damage equal to your rank*; D-775).
 *
 * @param {Array} talents  the creature STRUCK's
 * @returns {Array<{identifier: string, name: string, type: string|null, amount: number, melee: boolean}>}
 */
export function retaliationsFor(talents = [], rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "retaliate", rowOf)) {
    const amount = at(row.amount ?? "rank", { rank });
    if (amount > 0) out.push({ identifier: talent.identifier, name: talent.name, type: row.type ?? null, amount, melee: row.melee === true });
  }
  return out;
}

/**
 * **BURNING SOUL** (04: *Your Fire spells treat Immune (Fire) as Ward 3 instead*;
 * D-775): the Ward an immunity of this school is read as, or 0.
 *
 * @param {Array} talents  the CASTER's
 * @param {{school?: string|null}} o  the spell's damage school
 * @returns {{ward: number, by: string[]}}
 */
export function immuneAsWardFor(talents = [], { school = null } = {}, rowOf = talentEffect) {
  if (!school) return { ward: 0, by: [] };
  for (const { talent, row } of rowsOfKind(talents, "immuneAsWard", rowOf)) {
    if (!(row.schools ?? []).includes(school)) continue;
    const ward = Math.max(0, Math.trunc(Number(row.ward)) || 0);
    if (ward > 0) return { ward, by: [talent.name] };
  }
  return { ward: 0, by: [] };
}

/**
 * What a spell meets with Burning Soul laid over the target: the immunity gone and
 * its Ward that much higher (MY READING, for the lead: added to any Ward of the
 * school the creature carries), or the inputs as they were.
 *
 * @param {{immune?: string[], ward?: number, school?: string|null, asWard?: number}} o
 * @returns {{immune: string[], ward: number, read: boolean}}
 */
export function immuneReadAsWard({ immune = [], ward = 0, school = null, asWard = 0 } = {}) {
  const list = Array.isArray(immune) ? immune : [];
  if (!(asWard > 0) || !school || !list.includes(school)) return { immune: list, ward, read: false };
  return { immune: list.filter(t => t !== school), ward: (Number(ward) || 0) + asWard, read: true };
}

/**
 * **CAUTERIZE** (04: *Once per Long Rest, when you would drop to 0 Health you stay
 * at 1 instead, and every enemy within 10 feet takes Fire damage equal to your
 * tier*; D-775): the Health it holds at, the reach and the Fire, or null.
 *
 * @param {Array} talents  the HOLDER's
 * @param {{tier?: number}} [o]
 * @returns {{identifier: string, name: string, talentId: string|null, stay: number, feet: number, amount: number, type: string}|null}
 */
export function cauterizeFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "cauterize", rowOf);
  if (!first) return null;
  return {
    identifier: first.talent.identifier, name: first.talent.name, talentId: first.talent.id ?? null,
    stay: Math.max(1, Math.trunc(Number(first.row.stay)) || 1), feet: Math.max(0, Number(first.row.feet) || 0),
    amount: at(first.row.amount ?? "tier", { rank: first.rank, tier }), type: first.row.type ?? "fire"
  };
}

/**
 * Whether a blow is Cauterize's to catch, and what it leaves of the blow: one
 * that would take a creature above 0 to 0 or below, while the counter holds a use.
 *
 * @param {{before?: number, amount?: number, stay?: number, usesLeft?: number}} o
 * @returns {{saved: boolean, amount: number}}
 */
export function cauterizes({ before = 0, amount = 0, stay = 1, usesLeft = 0 } = {}) {
  const a = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!((Math.trunc(Number(usesLeft)) || 0) > 0)) return { saved: false, amount: a };
  // The ONE hold every catch in the system reads (D-777): `blow-doors.mjs#heldAt`.
  return heldAt({ before, amount: a, stay });
}

/* ---- Frost ----------------------------------------------------------------- */

/**
 * **FROZEN CORE** (04: *You are Immune (Frost)*; D-775): the damage types a talent
 * makes the holder Immune to, sorted, for `CharacterData`'s derived `immune`.
 *
 * @param {Array} talents
 * @returns {string[]}
 */
export function damageImmunitiesFor(talents = [], rowOf = talentEffect) {
  const out = new Set();
  for (const { row } of rowsOfKind(talents, "immune", rowOf)) for (const t of row.types ?? []) out.add(t);
  return [...out].sort();
}

/**
 * **SHATTER'S FACT** (04: *a target that is Entangled or Slowed, or whose Speed is
 * otherwise reduced*; D-775): the target's own conditions, or a drop laid on its
 * Speed (MY READING, for the lead: a laid effect that lowers `system.speed` - a
 * blow's drop, an area's - is *otherwise reduced*; a suit's own Speed cost is not).
 *
 * @param {{statuses?: string[], speedDropped?: boolean}} target
 */
export function speedReducedFact({ statuses = [], speedDropped = false } = {}) {
  const list = Array.isArray(statuses) ? statuses : [];
  return list.includes("entangled") || list.includes("slowed") || speedDropped === true;
}

/**
 * **SHATTER AT RANK 2** (04: *At rank 2 they inflict a Critical Injury on 19 or 20
 * against such a target*; D-775): the lowest face a spell's Casting Test inflicts a
 * Critical Injury on where the fact holds, or null.
 *
 * @param {Array} talents
 * @param {{facts?: Record<string, boolean>}} o
 * @returns {{on: number, by: string[]}|null}
 */
export function spellCriticalFor(talents = [], { facts = {} } = {}, rowOf = talentEffect) {
  let on = null;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "spellCritical", rowOf)) {
    if (rank < (Number(row.minRank) || 1)) continue;
    if (row.when && facts?.[row.when] !== true) continue;
    const face = Math.trunc(Number(row.on)) || 0;
    if (face < 1) continue;
    on = on === null ? face : Math.min(on, face);
    by.push(talent.name);
  }
  return on === null ? null : { on, by };
}

/* ---- What a talent restates of a named spell -------------------------------- */

/**
 * **A SPELL'S OWN NUMBER, AS A TALENT RESTATES IT** (04's Sunfire: *Its Casting Test
 * is against DC 22 rather than 26*; Cataclysm: *against DC 22 rather than 26, and it
 * costs you 6 Health rather than 10*; D-775): the first taken `spell` row naming the
 * spell and carrying the key, or null.
 *
 * @param {Array} talents
 * @param {{name?: string}} spell
 * @param {"dc"|"health"} key
 * @returns {number|null}
 */
function spellRestated(talents = [], { name = "" } = {}, key, rowOf = talentEffect) {
  for (const { row } of rowsOfKind(talents, "spell", rowOf)) {
    if (!(row.names ?? []).includes(name) || row[key] === undefined || row[key] === null) continue;
    const n = Math.trunc(Number(row[key]));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** The Casting Test's DC a talent restates for a spell (Sunfire, Cataclysm), or null. */
export function spellDcFor(talents = [], spell = {}, rowOf = talentEffect) {
  return spellRestated(talents, spell, "dc", rowOf);
}

/** The Health a spell costs as a talent restates it (Cataclysm's 6), or null. */
export function spellHealthFor(talents = [], spell = {}, rowOf = talentEffect) {
  return spellRestated(talents, spell, "health", rowOf);
}

/**
 * Icy Veins' standing state as the discount and the Boon read it (D-775): one entry
 * a laid effect, off its own flag (`VEINS_FLAG`).
 *
 * @param {Array<object|null>} flags  each ACTIVE effect's `flags["azeroth-rpg"][VEINS_FLAG]`
 * @returns {Array<{boons: number, schools: string[], less: number, source: string}>}
 */
export function veinsStates(flags = []) {
  return (flags ?? [])
    .filter(f => f && typeof f === "object")
    .map(f => ({
      boons: Math.max(0, Math.trunc(Number(f.boons)) || 0), schools: Array.isArray(f.schools) ? [...f.schools] : [],
      less: Math.max(0, Math.trunc(Number(f.less)) || 0), source: String(f.source ?? "")
    }));
}

/* ---- What a spell costs, and what a Casting Test gains --------------------- */

/**
 * **WHAT A TALENT TAKES OFF A SPELL'S MANA** (04's Emberstorm: *Your Fire and Fel
 * spells cost 2 less Mana, to a minimum of 2*; Icy Veins' state: *your Frost spells
 * cost 1 less Mana per rank*; D-775), worked out against the entry's own Mana, each
 * row's floor its own (MY READING, for the lead: Emberstorm's minimum is of the cost
 * it reduces; a Signature's discount or the next spell's are their own).
 *
 * @param {Array} talents
 * @param {{school?: string|null, mana?: number, states?: Array<{less: number, schools: string[], source?: string}>}} o
 *   `states` a Use's standing discounts (Icy Veins), off the caster's effects
 * @returns {{amount: number, by: Array<{name: string, amount: number}>}}
 */
export function spellDiscountFor(talents = [], { school = null, mana = 0, states = [] } = {}, rowOf = talentEffect) {
  const by = [];
  let left = Math.max(0, Math.trunc(Number(mana)) || 0);
  if (!school || left <= 0) return { amount: 0, by };
  for (const { talent, row, rank } of rowsOfKind(talents, "spellCost", rowOf)) {
    if (!(row.schools ?? []).includes(school)) continue;
    const floor = Math.max(0, Math.trunc(Number(row.min)) || 0);
    const n = Math.min(at(row.less ?? 0, { rank }), Math.max(0, left - floor));
    if (n <= 0) continue;
    left -= n;
    by.push({ name: talent.name, amount: n });
  }
  for (const s of states ?? []) {
    if (!(s?.schools ?? []).includes(school)) continue;
    const n = Math.min(Math.max(0, Math.trunc(Number(s.less)) || 0), left);
    if (n <= 0) continue;
    left -= n;
    by.push({ name: String(s.source ?? ""), amount: n });
  }
  return { amount: by.reduce((sum, b) => sum + b.amount, 0), by };
}

/**
 * **A BOON ON EVERY CASTING TEST** (04's Demonic Knowledge: *At rank 2 your Casting
 * Tests gain a Boon while you control a Bound Demon*; Icy Veins' state: *your
 * Casting Tests gain a Boon*; D-775): an automatic line, named - a casting
 * feature's Test is a Casting Test (the lead's *"Yes, casting features count"*,
 * D-768).
 *
 * @param {Array} talents
 * @param {{facts?: Record<string, boolean>, states?: Array<{boons: number, source?: string}>}} o
 * @returns {{boons: number, by: string[]}}
 */
export function castingBoonsFor(talents = [], { facts = {}, states = [] } = {}, rowOf = talentEffect) {
  let boons = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "castingBoon", rowOf)) {
    if (rank < (Number(row.minRank) || 1)) continue;
    if (row.while && facts?.[row.while] !== true) continue;
    const n = Math.max(0, Math.trunc(Number(row.boons)) || 0);
    if (n <= 0) continue;
    boons += n;
    by.push(talent.name);
  }
  for (const s of states ?? []) {
    const n = Math.max(0, Math.trunc(Number(s?.boons)) || 0);
    if (n <= 0) continue;
    boons += n;
    by.push(String(s.source ?? ""));
  }
  return { boons, by };
}

/* ---- How long a warlock's effects last ------------------------------------- */

/**
 * **MINUTES A LAID SPAN LASTS BEYOND ITS OWN** (04's Malediction: *A curse that
 * deals no damage lasts a further minute per rank*; Everlasting Affliction: *Your
 * ongoing effects last one further minute per rank*; D-775): the rows naming this
 * spell or feature, and those reaching every ongoing effect, summed. MY READING,
 * for the lead: an *ongoing effect* is one a spell or feature of the warlock's lays
 * with a timed span - a Sustained one holds as long as it is held, and an instant
 * one lays nothing.
 *
 * @param {Array} talents
 * @param {{spell?: string|null, feature?: string|null, ongoing?: boolean}} o
 * @returns {{minutes: number, by: string[]}}
 */
export function spanExtensionFor(talents = [], { spell = null, feature = null, ongoing = false } = {}, rowOf = talentEffect) {
  let minutes = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "extend", rowOf)) {
    const named = (spell && (row.spells ?? []).includes(spell)) || (feature && (row.features ?? []).includes(feature));
    const every = row.ongoing === true && ongoing === true;
    if (!named && !every) continue;
    const n = at(row.minutes ?? "rank", { rank });
    if (n <= 0) continue;
    minutes += n;
    by.push(talent.name);
  }
  return { minutes, by };
}

/** 05's table: *Minute - 10 rounds*. */
const ROUNDS_A_MINUTE = 10;

/**
 * A Duration line with minutes added, in 07's own phrasing so `effectDuration`
 * reads it as an entry's: *Instant, 1 minute* and 2 more is *3 minutes*. Null where
 * nothing is added or the span is not one the clock counts in minutes or hours.
 *
 * @param {{text?: string}} duration
 * @param {number} minutes
 * @returns {string|null}
 */
export function extendedSpan(duration = {}, minutes = 0) {
  const add = Math.max(0, Math.trunc(Number(minutes)) || 0);
  if (!add) return null;
  const m = /(\d+)\s*(minute|hour)s?/i.exec(String(duration?.text ?? ""));
  if (!m) return null;
  const base = Number(m[1]) * (m[2].toLowerCase() === "hour" ? 60 : 1);
  return `${base + add} minutes`;
}

/**
 * A laid tick counted over its spell's span, lengthened with it (D-775): Curse of
 * Agony's ten turns are its minute, so a further minute is ten more. A tick whose
 * count is not its span's - a one-turn burn - is left as it was.
 *
 * @param {object|null} tick  a stored or laid tick
 * @param {{spanRounds?: number|null, minutes?: number}} o  `spanRounds` the entry's own span in rounds
 */
export function extendTickRounds(tick, { spanRounds = null, minutes = 0 } = {}) {
  const add = Math.max(0, Math.trunc(Number(minutes)) || 0);
  if (!tick || !add || !(Number(spanRounds) > 0) || Number(tick.rounds) !== Number(spanRounds)) return tick;
  return { ...tick, rounds: Number(tick.rounds) + add * ROUNDS_A_MINUTE };
}

/* ---- Affliction ------------------------------------------------------------ */

/** The actor flag Siphon's record stands under: `{combat, highest}`. */
export const SIPHON_FLAG = "siphon";

/**
 * **SIPHON** (04: *At the start of your turn, if any target lost Health to Shadow
 * or Fel damage from you since the start of your last turn, you restore Health equal
 * to the highest amount a single target lost, to a maximum of twice your rank*;
 * D-775): the types and the most it restores, or null.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, types: string[], max: number}|null}
 */
export function siphonFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "siphon", rowOf);
  if (!first) return null;
  const max = at(first.row.max ?? "2*rank", { rank: first.rank });
  return max > 0 ? { identifier: first.talent.identifier, name: first.talent.name, types: [...(first.row.types ?? [])], max } : null;
}

/**
 * The record a blow leaves: the highest single loss in this fight since the turn's
 * start - a blow of another fight starts it again.
 *
 * @param {{combat?: string|null, highest?: number}|null} held
 * @param {{fight?: string|null, dealt?: number}} o
 * @returns {{combat: string|null, highest: number}}
 */
export function siphonRecord(held = null, { fight = null, dealt = 0 } = {}) {
  const n = Math.max(0, Math.trunc(Number(dealt)) || 0);
  const same = held && held.combat === fight;
  return { combat: fight, highest: Math.max(same ? (Math.trunc(Number(held.highest)) || 0) : 0, n) };
}

/**
 * What the turn's start restores off the record: the highest loss, capped at the
 * row's most, and nothing for a record of another fight.
 *
 * @param {{combat?: string|null, highest?: number}|null} record
 * @param {{max: number}|null} row  `siphonFor`'s
 * @param {{fight?: string|null}} o
 */
export function siphonHeal(record = null, row = null, { fight = null } = {}) {
  if (!row || !record || record.combat !== fight) return 0;
  return Math.min(row.max, Math.max(0, Math.trunc(Number(record.highest)) || 0));
}

/** 07's Drain Soul: *If it dies while you are holding the spell you regain 3 Mana* - the spell's own. */
export const DRAIN_SOUL = Object.freeze({ identifier: "drain-soul", name: "Drain Soul", mana: 3 });

/**
 * **WHAT A DEATH UNDER A HELD SPELL RETURNS** (07's Drain Soul's 3 Mana; 04's Drain
 * Soul: *Each rank adds 1 Mana to what its target's death returns*; Soul Reaper:
 * *when the target dies you restore Health equal to twice your tier*; D-775): the
 * Mana and the Health for one held spell, by its name.
 *
 * @param {Array} talents  the CASTER's
 * @param {{spell?: string, tier?: number}} o  the held spell's name
 * @returns {{mana: number, heal: number, by: string[]}}
 */
export function deathRewardsFor(talents = [], { spell = "", tier = 1 } = {}, rowOf = talentEffect) {
  let mana = spell === DRAIN_SOUL.name ? DRAIN_SOUL.mana : 0;
  let heal = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "death", rowOf)) {
    if (row.spell !== spell) continue;
    const m = at(row.mana ?? 0, { rank, tier });
    const h = at(row.heal ?? 0, { rank, tier });
    if (m <= 0 && h <= 0) continue;
    mana += m;
    heal += h;
    by.push(talent.name);
  }
  return { mana, heal, by };
}

/**
 * Whether a Sustain entry is held ON this creature: its recorded targets name the
 * creature's token, else its actor (D-724's record).
 *
 * @param {{targets?: Array<{tokenId?: string|null, actorId?: string|null}>}} entry
 * @param {{tokenId?: string|null, actorId?: string|null}} fallen
 */
export function heldOn(entry = {}, fallen = {}) {
  return (entry?.targets ?? []).some(t => (t?.tokenId && t.tokenId === fallen?.tokenId) || (!t?.tokenId && t?.actorId && t.actorId === fallen?.actorId));
}

/** The flag a tick Haunt raised carries: `{by, heal}`. */
export const HAUNT_MARK = "haunt";

/**
 * **HAUNT** (04: *each ongoing effect of yours on that target deals 1 further damage
 * per rank, of that effect's own damage type, and you restore Health equal to your
 * tier when the target dies*; D-775): a laid tick raised, and the heal carried on it
 * (MY READING, for the lead: the heal holds while one of the effects Haunt raised
 * stands - 04 gives the heal no span). **A tick this warlock already haunted is not
 * raised again** (MY READING: *deals 1 further damage per rank* is what the effect
 * deals while haunted, not a raise that compounds on every cast); its heal keeps the
 * larger.
 *
 * @param {object} tick  a laid tick of the warlock's
 * @param {{add?: number, by?: string|null, heal?: number}} o
 */
export function hauntedTick(tick, { add = 0, by = null, heal = 0 } = {}) {
  if (!tick) return tick;
  const h = Math.max(0, Math.trunc(Number(heal)) || 0);
  const held = tick[HAUNT_MARK];
  if (held && held.by === by) return { ...tick, [HAUNT_MARK]: { by, heal: Math.max(Math.trunc(Number(held.heal)) || 0, h) } };
  return { ...tick, amount: (Math.trunc(Number(tick.amount)) || 0) + Math.max(0, Math.trunc(Number(add)) || 0), [HAUNT_MARK]: { by, heal: h } };
}

/**
 * The Health a death returns to each warlock who haunted the creature, off its
 * ticks: one heal a warlock, the largest it carried.
 *
 * @param {Array<object|null>} ticks  the fallen creature's laid ticks
 * @returns {Array<{by: string, heal: number}>}
 */
export function hauntHeals(ticks = []) {
  const by = new Map();
  for (const t of ticks ?? []) {
    const h = t?.[HAUNT_MARK];
    if (!h?.by || !(h.heal > 0)) continue;
    by.set(h.by, Math.max(by.get(h.by) ?? 0, h.heal));
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([who, heal]) => ({ by: who, heal }));
}

/**
 * **SOUL SWAP'S EFFECTS** (04: *Every ongoing effect of yours ends on the first
 * target and begins on the second, keeping its remaining duration, its damage and
 * its damage type*; D-775): the ids of what the warlock laid there - a tick its hand
 * laid, a spell effect whose origin is the warlock, a Bane its Curse laid (MY
 * READING, for the lead: those are its ongoing effects; a condition another spell's
 * Resist laid is the condition's, not the warlock's).
 *
 * @param {Array<{id: string, origin?: string|null, flags?: object}>} effects  the first target's, plain
 * @param {{caster?: string|null}} o  the warlock's uuid
 * @returns {string[]}
 */
export function swappableEffects(effects = [], { caster = null } = {}) {
  if (!caster) return [];
  return (effects ?? [])
    .filter(e => {
      const f = e?.flags?.["azeroth-rpg"] ?? {};
      if (f.tick?.source === caster) return true;
      if (f.spell && e.origin === caster) return true;
      // The Bane a Curse laid (`effects/banes.mjs`): its source the feature's name,
      // its origin the warlock.
      return Boolean(f.laidBane) && f.laidBane.source === CURSE.feature && e.origin === caster;
    })
    .map(e => e.id)
    .sort();
}

/* ---- 02's Curse, Life Tap and Counterspell, and the talents that ride them -- */

/**
 * 02's Curse: *As an action, make a Casting Test. On success, spend 4 Mana and force
 * a target you can see to make a Spirit Resilience Test against your Spell DC. If
 * they fail, all Tests they make have a Bane for 1 minute.* The Mana is paid on the
 * Test's success (D-775, found beside Pandemic: it was paid before the Test).
 */
export const CURSE = Object.freeze({ feature: "Curse", targets: 1, bane: { kind: "all", banes: 1 }, minutes: 1, payOn: "success" });

/**
 * **WHAT A WARLOCK'S CURSE REACHES, AND FOR HOW LONG** (04's Pandemic: *Your Curse
 * class feature may name one further target within 30 feet per rank*; Malediction:
 * *A curse that deals no damage lasts a further minute per rank*; Everlasting
 * Affliction: *Your ongoing effects last one further minute per rank*; D-775).
 * MY READING, for the lead: Pandemic's *within 30 feet* is of the first target, as
 * D-774 read Circle of Healing's further one.
 *
 * @param {Array} talents
 * @returns {{primary: number, further: {count: number, feet: number}|null, minutes: number, by: string[]}}
 */
export function curseFor(talents = [], rowOf = talentEffect) {
  const out = { primary: CURSE.targets, further: null, minutes: CURSE.minutes, by: [] };
  for (const { talent, patch, rank } of patchRowsOf(talents, CURSE.feature, rowOf)) {
    const p = atRankOf(patch, rank);
    if (p.further) {
      const count = at(p.further.count ?? "rank", { rank });
      out.further = { count: (out.further?.count ?? 0) + count, feet: Math.max(0, Number(p.further.feet) || 0) };
    }
    out.by.push(talent.name);
  }
  const longer = spanExtensionFor(talents, { feature: CURSE.feature, ongoing: true }, rowOf);
  out.minutes += longer.minutes;
  for (const n of longer.by) if (!out.by.includes(n)) out.by.push(n);
  return out;
}

/** 02's Life Tap: *As a Half-Action, spend any amount of Health to gain twice that much Mana*. */
export const LIFE_TAP = Object.freeze({ feature: "Life Tap", mana: 2 });

/**
 * **WHAT A HEALTH SPENT ON LIFE TAP RETURNS** (02; 04's Improved Life Tap: *returns
 * 1 further Mana per rank for each Health you spend*; D-775).
 *
 * @param {Array} talents
 * @returns {{perHealth: number, by: string[]}}
 */
export function lifeTapFor(talents = [], rowOf = talentEffect) {
  let perHealth = LIFE_TAP.mana;
  const by = [];
  for (const { talent, patch, rank } of patchRowsOf(talents, LIFE_TAP.feature, rowOf)) {
    const n = at(atRankOf(patch, rank).mana ?? 0, { rank });
    if (n <= 0) continue;
    perHealth += n;
    by.push(talent.name);
  }
  return { perHealth, by };
}

/**
 * The amounts a Life Tap may spend (05, *Spending Health*: never below 1 Health),
 * each with the Mana it buys, for the one chooser.
 *
 * @param {{health?: number, perHealth?: number}} o
 * @returns {Array<{health: number, mana: number}>}
 */
export function lifeTapChoices({ health = 0, perHealth = LIFE_TAP.mana } = {}) {
  const most = Math.max(0, (Math.trunc(Number(health)) || 0) - 1);
  return Array.from({ length: most }, (_, i) => ({ health: i + 1, mana: (i + 1) * Math.max(0, Math.trunc(Number(perHealth)) || 0) }));
}

/** 02's Counterspell: *Spend 4 Mana as a Reaction to force a Bane on a Casting Test you can see within 30 feet*. */
export const COUNTERSPELL = Object.freeze({ feature: "Counterspell", feet: 30 });

/**
 * **SPELLSTEAL** (04: *Your Counterspell class feature also ends one effect the caster
 * is Sustaining*; D-775): whether the Use ends one of the caster's Sustains.
 *
 * @param {Array} talents
 * @returns {{steals: boolean, by: string[]}}
 */
export function counterspellFor(talents = [], rowOf = talentEffect) {
  const by = [];
  for (const { talent, patch, rank } of patchRowsOf(talents, COUNTERSPELL.feature, rowOf)) {
    if (atRankOf(patch, rank).steals === true) by.push(talent.name);
  }
  return { steals: by.length > 0, by };
}

/* ---- Demonology ------------------------------------------------------------ */

/**
 * **DEMONIC AEGIS AT RANK 2** (04: *At rank 2 it gains Ward 1 against Fel or against
 * Shadow, chosen when you summon it*; D-775): the Ward and the schools to choose
 * from, or null below the rank.
 *
 * @param {Array} talents
 * @returns {{name: string, ward: number, schools: string[]}|null}
 */
export function aegisWardFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, "Bound Demon", rowOf)) {
    const a = patch.aegis;
    if (!a || rank < (Number(a.minRank) || 1)) continue;
    const ward = Math.max(0, Math.trunc(Number(a.ward)) || 0);
    if (ward > 0 && (a.schools ?? []).length) return { name: talent.name, ward, schools: [...a.schools] };
  }
  return null;
}

/** The actor flag the demons a Demonic Sacrifice dismissed stand under until a Long Rest: `[{name, uuid}]`. */
export const SACRIFICED_FLAG = "sacrificed";

/**
 * The record a Demonic Sacrifice leaves (04: *The dismissed demon cannot be
 * summoned again until your next Long Rest*; D-775): the demon's entry name and its
 * world actor, added once, sorted.
 *
 * @param {Array<{name?: string, uuid?: string|null}>} held  the flag as it stands
 * @param {{name?: string, uuid?: string|null}} demon
 * @returns {Array<{name: string, uuid: string|null}>}
 */
export function sacrificeRecord(held = [], demon = {}) {
  const list = (Array.isArray(held) ? held : [])
    .filter(e => e && typeof e === "object" && e.name)
    .map(e => ({ name: String(e.name), uuid: e.uuid ? String(e.uuid) : null }));
  const name = String(demon?.name ?? "");
  if (!name) return list;
  const uuid = demon?.uuid ? String(demon.uuid) : null;
  if (!list.some(e => e.name === name && e.uuid === uuid)) list.push({ name, uuid });
  return list.sort((a, b) => a.name.localeCompare(b.name) || String(a.uuid).localeCompare(String(b.uuid)));
}

/**
 * Whether a chooser's option is a demon the warlock sacrificed (D-775): 02's own
 * table names a demon by its entry (MY READING, for the lead: *that demon* is the
 * entry - another Imp is the Imp summoned again), and the GM's own creature by its
 * world actor.
 *
 * @param {Array<{name?: string, uuid?: string|null}>} held
 * @param {{name?: string, uuid?: string|null, world?: boolean}} option
 */
export function isSacrificed(held = [], option = {}) {
  return (Array.isArray(held) ? held : []).some(e => e && (option?.world
    ? (e.uuid && e.uuid === option.uuid) || e.name === option.name
    : e.name === option?.name));
}

/**
 * **THE DEMON'S WARD, ON THE WARLOCK** (04's Demonic Sacrifice: *that demon's Ward
 * until the encounter ends*; D-775): the `final` changes for every school the
 * demon carries Ward against, read off it before it goes (the Ward is derived on a
 * character, D-668).
 *
 * @param {Record<string, number>} ward  the demon's Ward by school
 * @returns {Array<{key: string, type: "add", value: string, phase: "final"}>}
 */
export function sacrificedWardChanges(ward = {}) {
  return Object.entries(ward ?? {})
    .map(([school, n]) => [school, Math.max(0, Math.trunc(Number(n)) || 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([school, n]) => ({ key: `system.ward.${school}`, type: "add", value: String(n), phase: "final" }));
}

/**
 * **WHY COMMAND DEMON IS REFUSED, BEFORE ANYTHING IS PAID** (04: *make a Casting
 * Test targeting a Demon you can see within 20 feet*; D-775): one creature, a
 * demon, within the reach where both stand, and none already bound to anybody.
 *
 * @param {{named?: number, demon?: boolean, feet?: number|null, reach?: number, bound?: boolean}} o
 * @returns {string|null}  a lang key
 */
export function commandRefusal({ named = 0, demon = false, feet = null, reach = 20, bound = false } = {}) {
  if (named !== 1) return "AZEROTH.Laid.OneTarget";
  if (!demon) return "AZEROTH.CommandDemon.NotDemon";
  if (bound) return "AZEROTH.CommandDemon.Bound";
  if (typeof feet === "number" && Number.isFinite(feet) && feet > reach) return "AZEROTH.Laid.TooFar";
  return null;
}

/* ---- Destruction ----------------------------------------------------------- */

/**
 * **RUIN** (04: *When one of your spells inflicts a Critical Injury, roll twice on
 * the table and take the higher result. At rank 2 you also gain 2 Mana*; D-775).
 *
 * @param {Array} talents  the CASTER's
 * @returns {{name: string, higher: boolean, mana: number}|null}
 */
export function ruinFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "ruin", rowOf);
  if (!first) return null;
  const mana = first.rank >= (Number(first.row.minRank) || 1) ? Math.max(0, Math.trunc(Number(first.row.mana)) || 0) : 0;
  return { name: first.talent.name, higher: first.row.higher === true, mana };
}

/** The higher of the dice a Critical Injury rolled (Ruin's; Unbreakable's is `lowerRoll`). */
export function higherRoll(totals = []) {
  const list = (totals ?? []).map(Number).filter(Number.isFinite);
  return list.length ? Math.max(...list) : null;
}

/**
 * **WHY SOUL FIRE IS REFUSED, BEFORE ANYTHING IS SPENT** (04: *spend Health equal to
 * twice your tier. Your next spell this turn ...*; D-775): the Health may never take
 * the warlock below 1 (05, *Spending Health*). **Out of a fight it is no longer
 * refused** (the lead, 2026-10-03, on O-161: *"Player can use them at anytime if
 * selected."*; D-778): *this turn* is then one round of the world's clock
 * (`effects/next-spell.mjs`, MY READING, for the lead).
 *
 * @param {{health?: number, cost?: number}} o
 * @returns {string|null}
 */
export function soulFireRefusal({ health = 0, cost = 0 } = {}) {
  if ((Math.trunc(Number(health)) || 0) - Math.max(0, Math.trunc(Number(cost)) || 0) < 1) return "AZEROTH.SoulFire.NoHealth";
  return null;
}

/* ---- What a Use does, beyond its descriptor ------------------------------ */

/** The effect flag Icy Veins' span stands under, on the mage. */
export const VEINS_FLAG = "icyVeins";

/**
 * **WHAT THE MAGE'S AND THE WARLOCK'S USES DO, AT THE RANK** (D-775): Icy Veins' state,
 * Firestorm's area, Haunt's raise, Soul Swap's reach, Demonic Sacrifice's Ward,
 * Command Demon's reach and Soul Fire's promise. Null keys where the row says
 * nothing.
 *
 * @param {object|null} onUse  the granting talent's `onUse`
 * @param {{rank?: number, tier?: number}} [scope]
 */
export function onUseMageWarlock(onUse, { rank = 1, tier = 1 } = {}) {
  const o = onUse ?? {};
  return {
    veins: o.veins ? {
      boons: Math.max(0, Math.trunc(Number(o.veins.boons)) || 0), schools: [...(o.veins.schools ?? [])],
      less: at(o.veins.less ?? "rank", { rank }), until: o.veins.until ?? "userTurnEnd"
    } : null,
    areaTick: o.areaTick ? useAreaTick({ who: o.areaTick.who, amount: at(o.areaTick.amount ?? "tier", { rank, tier }), type: o.areaTick.type ?? null, rounds: o.areaTick.rounds ?? null }) : null,
    haunt: o.haunt ? { add: at(o.haunt.add ?? "rank", { rank, tier }), heal: at(o.haunt.heal ?? "tier", { rank, tier }) } : null,
    swap: o.swap ? { feet: Math.max(0, Number(o.swap.feet) || 0) } : null,
    sacrifice: o.sacrifice ? { ward: o.sacrifice.ward === true } : null,
    command: o.command ? { feet: Math.max(0, Number(o.command.feet) || 0), kind: o.command.kind ?? "demon" } : null,
    soulFire: o.soulFire ? {
      health: at(o.soulFire.health ?? "2*tier", { rank, tier }), sl: Math.max(0, Math.trunc(Number(o.soulFire.sl)) || 0),
      damage: at(o.soulFire.damage ?? "tier", { rank, tier })
    } : null
  };
}

/**
 * **A USE'S AREA THAT STRIKES AT THE START OF A TURN** (04's Firestorm: *anything
 * starting its turn there takes Fire damage equal to your tier per rank*; D-775), in
 * D-756's descriptor's whole shape, the number worked out at the Use, so the Region
 * placed from the card carries it as a spell's carries its own (`_areaTicks`).
 *
 * @param {{who?: string, amount?: number, type?: string|null, rounds?: number|null}} o
 */
export function useAreaTick({ who = "creature", amount = 0, type = null, rounds = null } = {}) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  return {
    ...emptyAreaTick(),
    who,
    damage: { rating: n > 0 ? n : null, school: type },
    lasts: { rounds: Number(rounds) > 0 ? Math.trunc(Number(rounds)) : null }
  };
}

/* -------------------------------------------- */
/*  The damage door's kinds (D-777)              */
/* -------------------------------------------- */

/*
 * **THE DAMAGE DOOR'S KINDS** (D-777; the lead's rulings of 2026-10-03 on
 * O-154, O-155 and O-156). Each is read by ONE door, named beside it:
 *
 *   tempHealth  a grant of 05's temporary Health - `{amount, span}` on an
 *               `onUse` (Last Stand's Use: `tempHealthOnUse`); `{on, feature,
 *               amount, span}` read at the healing door (Living Seed, Light's
 *               Grace: `healTempFor`); `{spells, add}` on what a named spell
 *               grants (Power Word: Shield, Ice Barrier: `spellTempFor`)
 *   holds       `{kind, feet, heal}`: another creature held at 1 Health, asked
 *               of the holder in the blow (Intervention, Spirit Shell, Guardian
 *               Spirit: `holdRowsFor`, at `effects/blow-doors.mjs#holdBlow`)
 *   moves       `{kind, feet, cost, atRank}`: a hit aimed at a friendly target
 *               taken onto the holder, asked in the blow (Guardian:
 *               `guardianFor`, at `effects/blow-doors.mjs#redirectBlow`)
 *   links       `{feet}`: the damage a linked ally takes divided among every
 *               ally within the feet of the totem (Spirit Link Totem:
 *               `spiritLinkFor`, at `effects/blow-doors.mjs#divideBlow`)
 *   aegis       `{heal}`: the Health a creature 07's Aegis of the Light held
 *               restores when the spell ends (`aegisHealFor`)
 *
 * and the patch `mod("Shield of the Righteous", { reach })` - Guardian of the
 * Weak's - which `righteousReach` reads off the patch (`patchRowsOf`).
 */

/** A grant's span, one 05's law knows, else a Long Rest's. */
const spanIn = span => (TEMP_SPANS.includes(span) ? span : "longRest");

/**
 * **04's LAST STAND AT THE USE** (*As a Half-Action, spend 10 Rage for temporary
 * Health equal to twice your tier per rank. It lasts until the encounter ends*):
 * the amount at the rank and tier, and its span, or null where the Use grants none.
 *
 * @param {object|null} onUse  the granting talent's `onUse`
 * @param {{rank?: number, tier?: number}} [scope]
 * @returns {{amount: number, span: string}|null}
 */
export function tempHealthOnUse(onUse, { rank = 1, tier = 1 } = {}) {
  const t = onUse?.tempHealth;
  if (!t) return null;
  const n = at(t.amount ?? "tier", { rank, tier });
  return n > 0 ? { amount: n, span: spanIn(t.span) } : null;
}

/**
 * **WHAT A HEAL GRANTS BESIDE ITS HEALTH** (04's Living Seed: *When you heal a
 * friendly target to full Health, they gain temporary Health equal to your tier
 * per rank until the encounter ends*; Light's Grace: *Casting Mend on a target at
 * full Health grants temporary Health equal to your tier plus your rank*), read at
 * the one healing door, where the target and what it held before are known.
 *
 * Light's Grace names no span: until a Long Rest (the rulings' READING, for the
 * lead). The door grants each through 05's law, so the larger stands.
 *
 * @param {Array} talents  the HEALER's
 * @param {{tier?: number, healedToFull?: boolean, atFull?: boolean, feature?: string|null, friendly?: boolean}} o
 *   `healedToFull` the heal took the target from below its maximum to it;
 *   `atFull` the target stood at its maximum before; `feature` the healing
 *   feature's name; `friendly` the target counts as the healer's ally
 * @returns {Array<{identifier: string, name: string, amount: number, span: string}>}
 */
export function healTempFor(talents = [], { tier = 1, healedToFull = false, atFull = false, feature = null, friendly = true } = {}, rowOf = talentEffect) {
  const out = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "tempHealth", rowOf)) {
    if (row.on === "healedToFull") {
      if (!(healedToFull === true && friendly === true)) continue;
    } else if (row.on === "atFull") {
      if (atFull !== true || (row.feature && row.feature !== feature)) continue;
    } else continue;
    const n = at(row.amount ?? "tier", { rank, tier });
    if (n > 0) out.push({ identifier: talent.identifier, name: talent.name, amount: n, span: spanIn(row.span) });
  }
  return out;
}

/**
 * **WHAT A TALENT ADDS TO A SPELL'S TEMPORARY HEALTH** (04's Power Word: Shield
 * and Ice Barrier: *Each rank adds 2 to the temporary Health it grants*), read by
 * `castSpell` where the spell's own words grant some.
 *
 * @param {Array} talents  the CASTER's
 * @param {{name?: string}} spell
 * @returns {{add: number, by: Array<{name: string, amount: number}>}}
 */
export function spellTempFor(talents = [], { name = "" } = {}, rowOf = talentEffect) {
  let add = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "tempHealth", rowOf)) {
    if (!(row.spells ?? []).includes(name)) continue;
    const n = at(row.add ?? 0, { rank });
    if (n > 0) {
      add += n;
      by.push({ name: talent.name, amount: n });
    }
  }
  return { add, by };
}

/**
 * **THE HOLDS A HOLDER'S TALENTS GIVE** (04's Intervention, Spirit Shell and
 * Guardian Spirit; D-777): one row a talent, the heal at the holder's tier, for
 * the damage door to judge (`blow-doors.mjs#holdJudgement`) and ask.
 *
 * @param {Array} talents  the HOLDER's
 * @param {{tier?: number}} [o]
 * @returns {Array<{kind: string, identifier: string, name: string, talentId: string|null, feet: number, heal: number}>}
 */
export function holdRowsFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  return rowsOfKind(talents, "holds", rowOf)
    .filter(({ row }) => ASKED_HOLDS.includes(row.kind))
    .map(({ talent, row, rank }) => ({
      kind: row.kind, identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null,
      feet: Math.max(0, Number(row.feet) || 0), heal: row.heal ? at(row.heal, { rank, tier }) : 0
    }));
}

/**
 * **04's GUARDIAN** (*As a Reaction, spend 6 Rage to take a hit aimed at a
 * friendly target within 5 feet. You take the damage in full. At rank 2 the range
 * is 10 feet*), at its rank, or null.
 *
 * @param {Array} talents  the HOLDER's
 * @returns {{kind: "guardian", identifier: string, name: string, talentId: string|null, feet: number, cost: {pool: string, amount: number}}|null}
 */
export function guardianFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "moves", rowOf).filter(r => r.row.kind === "guardian");
  if (!first) return null;
  const row = atRankOf(first.row, first.rank);
  return {
    kind: "guardian", identifier: first.talent.identifier, name: first.talent.name, talentId: first.talent.id ?? null,
    feet: Math.max(0, Number(row.feet) || 0),
    cost: { pool: row.cost?.pool ?? "rage", amount: at(row.cost?.amount ?? 0, { rank: first.rank }) }
  };
}

/**
 * 02's Shield of the Righteous as the book prints it (the Paladin's level 11: *As
 * a Reaction, spend 6 Zeal to change the target of a spell or attack to yourself
 * within 5 feet. You have Ward 1 against a school of your choice for this attack*).
 * The price the feature item carries is the one the sync stamped, Ardent
 * Defender's discount laid on it.
 */
export const RIGHTEOUS = Object.freeze({ feature: "Shield of the Righteous", feet: 5, ward: 1, pool: "zeal" });

/**
 * **HOW FAR SHIELD OF THE RIGHTEOUS REACHES** (04's Guardian of the Weak: *Your
 * Shield of the Righteous class feature reaches 20 feet rather than 5*): read off
 * the talent's own patch on the feature.
 *
 * @param {Array} talents  the PALADIN's
 * @returns {{feet: number, by: string[]}}
 */
export function righteousReach(talents = [], rowOf = talentEffect) {
  let feet = RIGHTEOUS.feet;
  const by = [];
  for (const { talent, patch } of patchRowsOf(talents, RIGHTEOUS.feature, rowOf)) {
    const n = Number(patch.reach);
    if (Number.isFinite(n) && n > feet) {
      feet = n;
      by.push(talent.name);
    }
  }
  return { feet, by };
}

/**
 * **04's SPIRIT LINK TOTEM** (*While that totem stands, damage taken by any
 * friendly target within 20 feet of it is divided evenly among all of them*): the
 * feet the link reaches, or null.
 *
 * @param {Array} talents  the SHAMAN's
 * @returns {{identifier: string, name: string, feet: number}|null}
 */
export function spiritLinkFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "links", rowOf);
  return first ? { identifier: first.talent.identifier, name: first.talent.name, feet: Math.max(0, Number(first.row.feet) || 0) } : null;
}

/** The shaman's flag naming the totem Spirit Link Totem's Use added its effect to (D-777). */
export const SPIRIT_LINK_FLAG = "spiritLink";

/**
 * **04's AEGIS OF THE LIGHT** (*A creature held at 1 Health by it restores Health
 * equal to your tier when the spell ends*): the Health, at the caster's tier, or
 * null where the caster holds no such talent.
 *
 * @param {Array} talents  the CASTER's
 * @param {{tier?: number}} [o]
 * @returns {{identifier: string, name: string, amount: number}|null}
 */
export function aegisHealFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "aegis", rowOf);
  if (!first) return null;
  const n = at(first.row.heal ?? "tier", { rank: first.rank, tier });
  return n > 0 ? { identifier: first.talent.identifier, name: first.talent.name, amount: n } : null;
}

/**
 * 02's War Cry's **Rallying Cry** as the book prints it (the Warrior's level 14:
 * *grants every ally within 30 feet temporary Health equal to your level ... Both
 * count you as an ally*). 02 names no span: until a Long Rest (the rulings'
 * READING, for the lead).
 */
export const RALLYING_CRY = Object.freeze({ feature: "War Cry", key: "rallying", feet: 30, amount: "level", span: "longRest" });

/* ======================================================================== */
/*  THE CROSS-CLASS RULINGS' KINDS (D-778; the lead's answers of 2026-10-03) */
/* ======================================================================== */

/*
 * One reader a kind, each called by ONE door (named beside it), and
 * `cross-class.test.mjs` holds every number a row carries to 04's own Effect
 * cell (and 02's and 07's where a talent rides one):
 *
 *   mod("Dispel")   `{further: {count, feet}}` (Rapture) - `raptureFor`, read by
 *                   `workflows.useFeature` as 02's Dispel is used
 *   undispellable   `{spells, minRank}`: a laid spell Dispel cannot end (Improved
 *                   Moonfire at rank 2) - `undispellableFor`, read by `castSpell`,
 *                   whose card's Apply marks the effect it lays
 *   dispelGate      `{sl, minRank}`: an ongoing effect of the holder's that a Dispel
 *                   ends only on a Casting Test at that SL (Everlasting Affliction
 *                   at rank 2) - `dispelGateFor`, read by the Dispel door
 *   unstable        `{amount, type}`: what a creature that ends one of the holder's
 *                   ongoing effects takes (Unstable Affliction) - `unstableFor`
 *   immovable       `{pushes}`: a push the holder refuses (Immovable) -
 *                   `refusesPushFor`, read by the forced-movement door
 *   mod("Hurricane") `{push: {feet, from}}` (Typhoon) - `pushFor`, read by the
 *                   feature's Use and the card's Place area
 *   spell.push      feet a talent adds to a spell's own push (Blast Wave) -
 *                   `spellPushFor`, read by `castSpell`
 *   onUse.push      `{feet, from}`: a Use that moves the creatures it names
 *                   (Thunderstorm) - `onUsePriestShaman`
 *   escape          `{spells, banes, failStun, minRank}`: what a talent lays on
 *                   the Test 07 gives a held or Stunned creature (Frost Nova at
 *                   rank 2, Absolute Zero, Deep Freeze) - `escapeTalentsFor`
 *   upkeep          gained `less` and `min` (Arcane Concentration), and Shape the
 *                   Weave's patch `upkeepLess: "held"` (Netherwind) - `upkeepFor`
 *   slowing         `{add}`: feet the holder's effects that reduce Speed take
 *                   further (Permafrost) - `slowingFor`
 *   healing         a patch every healing FEATURE the character holds takes, of
 *                   any class (Devotion, Holy Guidance, Divine Providence; the
 *                   lead: *"Yes."* on O-160) - `talent-effects.mjs
 *                   #healingPatchesFor` for the stamp, `healTargetsFor` for the
 *                   targets
 */

/** 02's Dispel's patch name, which Rapture's row patches. */
const DISPEL_FEATURE = "Dispel";

/**
 * **04's RAPTURE** (*Your Dispel class feature may end one condition on an
 * additional target within 20 feet. You may use this a number of times equal to
 * your rank per Short Rest*), read off the talent's own patch on 02's Dispel, or
 * null. MY READING, for the lead: the further target's *one condition* is one
 * EFFECT, as the lead ruled Dispel ends (*"selected Effects, not conditions."*), and
 * *within 20 feet* is of the first target, as Circle of Healing's further one is
 * (D-774).
 *
 * @param {Array} talents  the PRIEST's
 * @returns {{identifier: string, name: string, talentId: string|null, count: number, feet: number}|null}
 */
export function raptureFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, DISPEL_FEATURE, rowOf)) {
    const p = atRankOf(patch, rank);
    if (!p.further) continue;
    const count = at(p.further.count ?? 1, { rank });
    if (count <= 0) continue;
    return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, count, feet: Math.max(0, Number(p.further.feet) || 0) };
  }
  return null;
}

/**
 * **A LAID SPELL DISPEL CANNOT END** (04's Improved Moonfire: *At rank 2 it cannot
 * be ended by Dispel or similar effects*): the talents that mark this spell's laid
 * effect, at their rank, or null.
 *
 * @param {Array} talents  the CASTER's
 * @param {{spell?: string}} o  the spell's name
 * @returns {{by: string}|null}
 */
export function undispellableFor(talents = [], { spell = "" } = {}, rowOf = talentEffect) {
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "undispellable", rowOf)) {
    if (!(row.spells ?? []).includes(spell) || rank < (Number(row.minRank) || 1)) continue;
    by.push(talent.name);
  }
  return by.length ? { by: by.join(", ") } : null;
}

/**
 * **04's EVERLASTING AFFLICTION AT RANK 2** (*Dispel and similar effects end one of
 * them only on a Casting Test that meets or exceeds SL 2*): the gate, or null.
 *
 * @param {Array} talents  the WARLOCK's - the ongoing effect's owner
 * @returns {{sl: number, name: string}|null}
 */
export function dispelGateFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "dispelGate", rowOf)) {
    if (rank < (Number(row.minRank) || 1)) continue;
    const sl = Math.max(1, Math.trunc(Number(row.sl)) || 1);
    return { sl, name: talent.name };
  }
  return null;
}

/**
 * **04's UNSTABLE AFFLICTION** (*A target that ends one of your ongoing effects
 * early takes Fel damage equal to twice your tier per rank*): the damage, at the
 * WARLOCK's tier and rank, or null. Once an effect ended (MY READING, for the
 * lead: each of the warlock's effects a Dispel ends is one ending).
 *
 * @param {Array} talents  the WARLOCK's
 * @param {{tier?: number}} [o]  the warlock's tier
 * @returns {{identifier: string, name: string, amount: number, type: string}|null}
 */
export function unstableFor(talents = [], { tier = 1 } = {}, rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "unstable", rowOf);
  if (!first) return null;
  const n = at(first.row.amount ?? "2*tier*rank", { rank: first.rank, tier });
  return n > 0 ? { identifier: first.talent.identifier, name: first.talent.name, amount: n, type: first.row.type ?? "fel" } : null;
}

/**
 * **04's IMMOVABLE** (*you cannot be pushed by any effect that does not lift you*):
 * whether the holder refuses a push, with the talent's name. MY READING, for the
 * lead: none of the pushes the system makes lifts (Typhoon, Thunderstorm, Blast
 * Wave, Gust of Wind, Tempest), and a PULL is no push (Void Rift, Ley Rift).
 * *Press and Overbear cannot move you* stays the table's: 06 §7's maneuvers move no
 * token by any door.
 *
 * @param {Array} talents  the CREATURE's
 * @returns {{name: string}|null}
 */
export function refusesPushFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "immovable", rowOf).filter(r => r.row.pushes === true);
  return first ? { name: first.talent.name } : null;
}

/** 02's Hurricane, which Typhoon's patch pushes from. */
export const HURRICANE = Object.freeze({ feature: "Hurricane" });

/**
 * **04's TYPHOON** (*Your Hurricane class feature also pushes everything in its
 * area 10 feet per rank*), read off its patch on the feature: the feet, away from
 * the area's centre (the lead, 2026-10-03, on O-158: *"Yes."* to *away from the
 * area's centre*), or null.
 *
 * @param {Array} talents
 * @param {{feature?: string}} o  the feature's name
 * @returns {{feet: number, from: string, by: string[]}|null}
 */
export function pushFor(talents = [], { feature = "" } = {}, rowOf = talentEffect) {
  let feet = 0;
  let from = "area";
  const by = [];
  for (const { talent, patch, rank } of patchRowsOf(talents, feature, rowOf)) {
    const p = atRankOf(patch, rank);
    if (!p.push) continue;
    const n = at(p.push.feet ?? 0, { rank });
    if (n <= 0) continue;
    feet += n;
    from = p.push.from ?? from;
    by.push(talent.name);
  }
  return feet > 0 ? { feet, from, by } : null;
}

/**
 * **WHAT A TALENT ADDS TO A SPELL'S OWN PUSH** (04's Blast Wave: *Each rank adds 5
 * feet to the push*), summed, with the talents.
 *
 * @param {Array} talents  the CASTER's
 * @param {{spell?: string}} o
 * @returns {{feet: number, by: string[]}}
 */
export function spellPushFor(talents = [], { spell = "" } = {}, rowOf = talentEffect) {
  let feet = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "spell", rowOf)) {
    if (row.push === undefined || !(row.names ?? []).includes(spell)) continue;
    const n = at(row.push, { rank });
    if (n <= 0) continue;
    feet += n;
    by.push(talent.name);
  }
  return { feet, by };
}

/**
 * **WHAT A TALENT LAYS ON THE TEST 07 GIVES A HELD OR STUNNED CREATURE** (the lead,
 * 2026-10-03, on O-159: *"Yes."*): 04's Frost Nova at rank 2 (*a creature it holds
 * takes a Bane on the Test to break free*), Absolute Zero (*A creature it Stuns
 * takes a Bane on every Test to end the Stun*) and Deep Freeze (*A target held by
 * your Frost Nova that fails a second Test against it is Stunned until the end of
 * your next turn*), for the spell named.
 *
 * @param {Array} talents  the CASTER's
 * @param {{spell?: string}} o
 * @returns {{banes: number, failStun: string|null, by: string[]}}
 */
export function escapeTalentsFor(talents = [], { spell = "" } = {}, rowOf = talentEffect) {
  const out = { banes: 0, failStun: null, by: [] };
  for (const { talent, row, rank } of rowsOfKind(talents, "escape", rowOf)) {
    if (!(row.spells ?? []).includes(spell) || rank < (Number(row.minRank) || 1)) continue;
    const banes = Math.max(0, Math.trunc(Number(row.banes)) || 0);
    if (banes > 0) out.banes += banes;
    if (row.failStun) out.failStun = String(row.failStun);
    if (banes > 0 || row.failStun) out.by.push(talent.name);
  }
  return out;
}

/**
 * **04's PERMAFROST** (*Your effects that reduce Speed reduce it 5 feet further per
 * rank*; the lead, 2026-10-03, on O-165: *"Yes."* to *is Slowed an effect that
 * reduces Speed by a number of feet, so Permafrost's 5 add to it?*): the feet, or
 * null. Read by the Speed-drop door (`effects/speed-drop.mjs`) for a drop the holder
 * lays, and by every door that lays the holder's **Slowed**.
 *
 * @param {Array} talents  the holder's - who laid the effect
 * @returns {{feet: number, by: string[]}|null}
 */
export function slowingFor(talents = [], rowOf = talentEffect) {
  let feet = 0;
  const by = [];
  for (const { talent, row, rank } of rowsOfKind(talents, "slowing", rowOf)) {
    const n = at(row.add ?? "5*rank", { rank });
    if (n <= 0) continue;
    feet += n;
    by.push(talent.name);
  }
  return feet > 0 ? { feet, by } : null;
}

/* ======================================================================== */
/*  THE CLASS ANSWERS' KINDS (D-779; the lead's rulings of 2026-10-03)       */
/* ======================================================================== */

/*
 * One function a kind, each called by ONE door (named beside it), and
 * `class-answers.test.mjs` holds every number a row carries to 04's own Effect
 * cell and every door to its call. The arithmetic is `rules/class-answers.mjs`.
 *
 *   rangedParry  `{feet, count}`: a Parry of a ranged attack (Anticipation) -
 *                `rangedParryFor`, read where the card offers a Parry and at the
 *                press (`applications/actions.mjs`)
 *   freeReaction gained `per: "turn"` and `needs: "dualMelee"` (Main Gauche)
 *   undying      `{per}`: Undying Rage's hold - `undyingRageFor`, the damage door
 *   bracing      `{ap}`: Bracing's Armor Points - `bracingFor`, the turn's end
 *   quarry       gained `companionSpends` (Shared Quarry's rank 1) -
 *                `companionSpendsFor`, the maneuver's and the called shot's payer
 *   mod("Snare") gained `poison {resilience, reach}` (Snake Trap) - `snakeTrapFor`
 *   landwise     `{feet}`: Master of the Land's first sentence - `landwiseFor`,
 *                the terrain door (`canvas/behaviors.mjs`)
 *   foresight    `true`: a Ward pressed from an incoming card - `foresightFor`
 *   chosenWard   `{spells, add}`: Barrier's Ward on the creatures chosen -
 *                `chosenWardFor`, at the cast
 *   aegis        `{ward, schools}`: Divine Aegis - `divineAegisFor`, at the cast
 *                and at the one healing door
 *   onUse        gained `lightwell`, `miracle` and `sustain` (Lightwell, Miracle,
 *                Flametongue) - `useFeature`
 *   castLine     gained `double` (Devouring Plague) - `talentLinesFor`, `plagueFor`
 *   flametongue  `{add, atRank}`: what a blow while Flametongue is held adds -
 *                `flametongueFor`, the attack door
 *   lavaLash     `{feet, count, condition}`: Lava Lash on Stormstrike's hit -
 *                `lavaLashFor`, `rollTest`
 *   blademaster  `true`: Elemental Blademaster - `blademasterFor`, the attack door
 */

/**
 * **04's ANTICIPATION** (*You may Parry a ranged attack made within 30 feet, once a
 * round, or twice a round at rank 2*; the lead, 2026-10-03, on O-180): the reach
 * and the round's count, or null.
 *
 * @param {Array} talents  the DEFENDER's
 * @returns {{identifier: string, name: string, feet: number, count: number}|null}
 */
export function rangedParryFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "rangedParry", rowOf)) {
    const count = at(row.count ?? "rank", { rank });
    const feet = Math.max(0, Math.trunc(Number(row.feet)) || 0);
    if (count > 0 && feet > 0) return { identifier: talent.identifier, name: talent.name, feet, count };
  }
  return null;
}

/**
 * **04's UNDYING RAGE** (*When reduced to 0 Health, spend all your Rage. You stay
 * at 1 Health for one round per 2 Rage spent, then fall as usual*; D-779): the
 * Rage a round costs, or null.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, per: number}|null}
 */
export function undyingRageFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "undying", rowOf);
  if (!first) return null;
  return { identifier: first.talent.identifier, name: first.talent.name, per: Math.max(1, Math.trunc(Number(first.row.per)) || 2) };
}

/**
 * **04's BRACING** (*If you do not move by the end of your turn, your Armor Points
 * increase by 1 per rank*; the lead, 2026-10-03, on O-174: *"Next move"*): the
 * Armor Points at the rank, or null.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, amount: number}|null}
 */
export function bracingFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "bracing", rowOf)) {
    const n = at(row.ap ?? "rank", { rank });
    if (n > 0) return { identifier: talent.identifier, name: talent.name, amount: n };
  }
  return null;
}

/**
 * **04's SHARED QUARRY AT RANK 1** (*Your companion may spend your Quarry as you
 * can*; the lead, 2026-10-03, on O-177: *"Maneuvers or other quarry costing
 * features"*): whether the owner's talents let the companion pay from the owner's
 * Quarry.
 *
 * @param {Array} talents  the OWNER's
 * @returns {{name: string}|null}
 */
export function companionSpendsFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "quarry", rowOf)) {
    if (atRankOf(row, rank).companionSpends === true) return { name: talent.name };
  }
  return null;
}

/**
 * **04's SNAKE TRAP** (*Your Snare class feature also applies a poison you carry to
 * the first creature caught. At rank 2 it applies to everything in the radius*;
 * the lead, 2026-10-03, on O-178: *"Yes, Dexterity"*): the Test the creature
 * resists with and how many it reaches, off the Snare's patch, or null.
 *
 * @param {Array} talents  the RANGER's
 * @returns {{name: string, resilience: string, reach: "first"|"all"}|null}
 */
export function snakeTrapFor(talents = [], rowOf = talentEffect) {
  for (const { talent, patch, rank } of patchRowsOf(talents, "Snare", rowOf)) {
    const p = atRankOf(patch, rank).poison ?? null;
    if (p?.resilience) return { name: talent.name, resilience: p.resilience, reach: p.reach === "all" ? "all" : "first" };
  }
  return null;
}

/**
 * **04's MASTER OF THE LAND, ITS FIRST SENTENCE** (*Any number of targets within 30
 * feet ignore movement penalties from non-magical sources*; the lead, 2026-10-03,
 * on O-179: *"Always on"*): its reach, or null.
 *
 * @param {Array} talents  the HOLDER's
 * @returns {{name: string, feet: number}|null}
 */
export function landwiseFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "landwise", rowOf);
  if (!first) return null;
  return { name: first.talent.name, feet: Math.max(0, Math.trunc(Number(first.row.feet)) || 0) };
}

/**
 * **04's FORESIGHT** (*You may spend a Reaction to use your Ward class feature after
 * an attack is rolled*; the lead, 2026-10-03, on O-181: *"Yes"* to *does a Ward
 * pressed from an incoming card answer that blow?*): the talent, or null. Rank 2's
 * *after the damage is known* is the lead's (CLARIFY, O-181).
 *
 * @param {Array} talents  the PRIEST's
 * @returns {{identifier: string, name: string}|null}
 */
export function foresightFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "foresight", rowOf);
  return first ? { identifier: first.talent.identifier, name: first.talent.name } : null;
}

/**
 * **04's BARRIER** (*You know Barrier. Each rank adds 1 to the Ward it grants*; the
 * lead, 2026-10-03, on O-182: *"Yes"*): what the talent adds to the Ward 07's spell
 * gives the creatures chosen, for the spell named, or null.
 *
 * @param {Array} talents  the CASTER's
 * @param {{spell?: string}} o
 * @returns {{name: string, add: number}|null}
 */
export function chosenWardFor(talents = [], { spell = "" } = {}, rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "chosenWard", rowOf)) {
    if (!(row.spells ?? []).includes(spell)) continue;
    return { name: talent.name, add: at(row.add ?? "rank", { rank }) };
  }
  return null;
}

/**
 * **04's DIVINE AEGIS** (*When your healing restores a target to full Health, it
 * gains Ward 1 of a number of schools equal to your rank until the end of your next
 * turn*; the lead, 2026-10-03, on O-183: *"The caster"*): the Ward and how many
 * schools the caster names at the cast, or null.
 *
 * @param {Array} talents  the HEALER's
 * @returns {{identifier: string, name: string, talentId: string|null, ward: number, count: number}|null}
 */
export function divineAegisFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "aegis", rowOf)) {
    const count = at(row.schools ?? "rank", { rank });
    const ward = at(row.ward ?? 1, { rank });
    if (count > 0 && ward > 0) return { identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null, ward, count };
  }
  return null;
}

/**
 * **04's DEVOURING PLAGUE** (the lead, 2026-10-03, on O-186: *"tick on cast, and 1
 * turn after."*): the line's spells, landings and Health threshold, and the
 * counter its use is struck from, or null.
 *
 * @param {Array} talents  the PRIEST's
 * @returns {{identifier: string, name: string, talentId: string|null, spells: string[], landings: number, below: number}|null}
 */
export function plagueFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row } of rowsOfKind(talents, "castLine", rowOf)) {
    const d = row.double ?? null;
    if (!d) continue;
    return {
      identifier: talent.identifier, name: talent.name, talentId: talent.id ?? null,
      spells: [...(d.spells ?? [])], landings: Math.max(1, Math.trunc(Number(d.landings)) || 1), below: Number(d.below) || 0.5
    };
  }
  return null;
}

/**
 * **04's FLAMETONGUE, ON A BLOW** (*While you Sustain it, your weapon attacks deal
 * Fire damage rather than Physical. At rank 2 they add 1 damage as well*): what a
 * weapon blow adds while the Sustain is held, or null where the talent is not held.
 *
 * @param {Array} talents
 * @returns {{identifier: string, name: string, add: number}|null}
 */
export function flametongueFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "flametongue", rowOf)) {
    const r = atRankOf(row, rank);
    return { identifier: talent.identifier, name: talent.name, add: Math.max(0, Math.trunc(Number(r.add)) || 0) };
  }
  return null;
}

/**
 * **04's LAVA LASH** (*Your Stormstrike spreads any Fire effect on the target to
 * one enemy within 10 feet, or to two enemies at rank 2*; the lead, 2026-10-03,
 * on O-189): the condition it spreads, its reach and how many, or null.
 *
 * @param {Array} talents
 * @returns {{name: string, condition: string, feet: number, count: number, on: string}|null}
 */
export function lavaLashFor(talents = [], rowOf = talentEffect) {
  for (const { talent, row, rank } of rowsOfKind(talents, "lavaLash", rowOf)) {
    const count = at(row.count ?? "rank", { rank });
    if (count > 0) return { name: talent.name, condition: row.condition ?? "scorched", feet: Math.max(0, Math.trunc(Number(row.feet)) || 0), count, on: row.on ?? "stormstrike" };
  }
  return null;
}

/**
 * **04's ELEMENTAL BLADEMASTER** (*Your weapon attacks count as spells for your own
 * talents and features*; the lead, 2026-10-03, on O-190: *"Any spell cast or magic
 * damage from weapon attacks."*): whether the talent is held.
 *
 * @param {Array} talents
 * @returns {{name: string}|null}
 */
export function blademasterFor(talents = [], rowOf = talentEffect) {
  const [first] = rowsOfKind(talents, "blademaster", rowOf);
  return first ? { name: first.talent.name } : null;
}
