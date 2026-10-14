/**
 * **WHAT A TALENT SPENDS AS PART OF AN ATTACK** (04-TALENTS; D-770; the lead,
 * 2026-10-03: *"Lines on attack dialog"*). Pure: no Foundry imports.
 *
 * Fourteen talents in 04 read *As part of an attack, spend N <pool>* - Mangle,
 * Rip, Feral Charge, Mortal Strike, Crusader Strike, Shield Slam, Piercing
 * Shot, Stormstrike and their kin - and not one had a door: the spend and the
 * blow are one act, so a Use button paid the pool onto a card of its own and
 * the attack it belonged to never saw it (the Finisher's lesson, the lead's
 * item 11). Each is a LINE on the attack's own roll dialog now, beside the
 * called shot's Momentum and the Finisher:
 *
 * - **unticked**, because spending a pool is the player's call and never the
 *   tool's (D2 §12);
 * - **priced**, in the pool it is paid from;
 * - **greyed, with the reason in words**, where the pool is short or a
 *   once-a-round use is spent - never greyed alone (D5);
 * - **paid when the attack rolls**, judged before anything is spent (D-768's
 *   order: judgement, budget, reveal, payment), and paid off the pools as they
 *   stand AFTER the budget and the reveal (`settleRiders`), never off a number
 *   read before an await;
 * - and what it does **on a hit lands with the blow**: a condition laid on the
 *   card's targets with no button pressed, through the Inflict button's own
 *   door (`effects/inflict.mjs`; the lead, 2026-10-03: *"Lands
 *   automatically"*), the card saying what landed; damage in the blow's Rating.
 *
 * **A rider that buys a move may be paid BEFORE the blow** (the lead,
 * 2026-10-03, on Feral Charge: *"Either order"*): the Combat tab's control pays
 * it on the character's own turn in a fight, grants the free Move, and marks it
 * PRIMED on the round's record; the next attack that turn is the charge - no
 * second payment, its hit lands what the rank says, its dialog line drawn as
 * already paid. Whichever door is used first pays, and the round's record is
 * the one gate both read (`roundRiders`).
 *
 * ## The row: `rider` in `talent-effects.mjs`
 *
 *   cost      `{pool, amount}`: a pool name (`AZEROTH.poolTypes`) and a number,
 *             or `"all"` for *spend all your Ferocity* (Rip)
 *   once      `"round"` where 04 says *Once a round*, else null; the mark is the
 *             combatant's round flag, beside 08 §5's Fast
 *   form      true where 04 says *in a Shapeshift form*. Out of one the line
 *             is not drawn at all - D-711 phase 2's rule for a damage line
 *             that can never hold - and the Avatar is not a Shapeshift form
 *             (D-251, D-769)
 *   weapon    `"melee"` | `"ranged"` | null: which blows it rides
 *   move      `"speed"` for *spend 2 Ferocity to move up to your Speed*:
 *             what the SPEND buys, hit or miss, so it sits beside `onHit`
 *             rather than inside it (the brief's shape, refined)
 *   onHit     `{condition, value, damage, prone}`: an A1 condition id and its
 *             value as an expression (`rules/expressions.mjs` - `rank`,
 *             `spent`, `tier`), damage added to the blow's Rating as an
 *             expression, and Prone
 *   atRank    `[{rank, onHit}]`: what a rank reaches, laid over `onHit` - the
 *             `modifies` patch's own `atRank` shape (Feral Charge's *At rank 2
 *             a hit also knocks the target Prone*)
 *   discount  `{pool, amount, min}`: **a rider that changes the rule rather
 *             than adding one** (Berserk's *your attacks in a Shapeshift form
 *             cost 1 less Ferocity, to a minimum of 1*). While it is switched
 *             on - an Active Effect flagged `riderDiscount: {identifier}`,
 *             which Berserk's Use lays with its damage buff, for the buff's
 *             own span (D-771) - every other rider in that pool costs
 *             `amount` less, never below `min`. A rider of `"all"` is never
 *             discounted: all is all (Rip; a reading of D-770's, for the lead).
 *
 * **THE WARRIOR'S AND THE PALADIN'S** (D-772) added four keys:
 *
 *   pays      `"hit"` where 04 makes the HIT the trigger of the spend (Bloodthirst:
 *             *When one of your attacks hits, spend 6 Rage*): the line is ticked
 *             before the roll and judged with the rest, and paid only when the
 *             blow lands - a miss spends nothing (MY READING, for the lead: the
 *             lead's *"Lines on attack dialog"* and 04's *when ... hits* read
 *             together). Null is D-770's own: paid when the attack rolls.
 *   needs     `"shield"`: the blow is struck WITH a shield (Shield Slam), so the
 *             line is not drawn where no shield is held or the shield is melded
 *   strike    `{rating}`: what the blow is struck with replaces the weapon's own
 *             Damage Rating (Shield Slam's *strike with your shield at Damage
 *             Rating 4*); what stands on the striker still adds
 *   onHit     gained `heal` (Health the STRIKER recovers on a hit - Bloodthirst),
 *             `noHealing` (the target recovers none until the end of the
 *             striker's next turn - Mortal Strike) and `sl` (the condition and
 *             Prone land only on a hit at that SL or better - Shield Slam's
 *             rank 2 *a hit at SL 2 also applies Stun*)
 *
 * **THE RANGER'S AND THE ROGUE'S** (D-773) added to `onHit`:
 *
 *   pierce        Armor Points the blow ignores, an expression (Piercing Shot's
 *                 *Pierce equal to your rank*); it rides the blow whether or not
 *                 it lands, since a miss deals nothing for it to pierce
 *   forced        the Success Level the attack counts as, hitting WITHOUT a roll
 *                 (Trueshot: *SL 2, or SL 3 at rank 2*): judged before the die,
 *                 since it changes what the die is for
 *   until         the span of the condition it lays: `strikerTurnStart` (Concussive
 *                 Shot's and Wing Clip's *until your next turn* - the STRIKER's)
 *   loseReaction  the target loses its Reaction (Concussive Shot at rank 2)
 *   speedDrop     feet off the target's Speed for the span (Wing Clip's *10 feet
 *                 per rank*), an expression
 *   noCasting     the Bleeding it lays carries *cannot cast while that Bleeding
 *                 lasts* (Garrote)
 *
 * and `needs: "opening"`: the blow is struck at a target under 02's Opening
 * (Garrote's *As part of an attack against a target affected by your Opening*),
 * so the line is not drawn at one that is not.
 *
 * **THE SHAMAN'S** (D-774) added `onHit.bane`: `{kind, banes}`, a Bane laid on
 * the TARGET's next Test of that kind (Stormstrike's *takes a Bane on its next
 * attack. At rank 2 it takes two Banes*), landing with the blow through 06 §6's
 * door (`effects/banes.mjs#layBane`), as a rider's condition lands.
 *
 * `spent` is what was ACTUALLY paid - for a rider of `"all"`, whatever the pool
 * held when the attack rolled.
 */

import { talentEffect } from "./talent-effects.mjs";
import { evaluateExpression } from "./expressions.mjs";

/** The effect flag a switched-on discount rider is read off (Berserk's Use lays it, D-771). */
export const RIDER_DISCOUNT_FLAG = "riderDiscount";

/** What `once` may say. */
export const RIDER_ONCE = Object.freeze(["round"]);

/** What a rider's spend may buy beside the blow. */
export const RIDER_MOVES = Object.freeze(["speed"]);

/** Which blows a rider may ride. */
export const RIDER_WEAPONS = Object.freeze(["melee", "ranged"]);

/** When a rider is paid (D-772): null is when the attack rolls, `hit` only once it lands. */
export const RIDER_PAYS = Object.freeze(["hit"]);

/** What a rider's blow needs: a shield in hand (D-772), a target under the Opening (D-773). */
export const RIDER_NEEDS = Object.freeze(["shield", "opening"]);

/** How long a rider's condition and Speed drop last (D-773): until the striker's next turn starts. */
export const RIDER_UNTIL = Object.freeze(["strikerTurnStart"]);

/** How long a rider's `noHealing` lasts (D-772): Mortal Strike's *until the end of your next turn*. */
export const RIDER_NO_HEALING = Object.freeze(["strikerTurnEnd"]);

/** The refusals a line or a plan may carry, as `lang/en.json` keys. */
export const RIDER_REFUSALS = Object.freeze({
  noPool: "AZEROTH.Rider.Refused.NoPool",
  short: "AZEROTH.Rider.Refused.Short",
  empty: "AZEROTH.Rider.Refused.Empty",
  once: "AZEROTH.Rider.Refused.Once",
  gone: "AZEROTH.Rider.Refused.Gone",
  // Paid before the blow from the Combat tab: drawn checked and greyed, and the
  // next attack takes it without a second payment.
  primed: "AZEROTH.Rider.Refused.Primed"
});

/** Why the Combat tab's control cannot pay a rider before the blow, as `lang/en.json` keys. */
export const RIDER_PRIME_REFUSALS = Object.freeze({
  fight: "AZEROTH.Rider.Prime.NeedsFight",
  turn: "AZEROTH.Rider.Prime.NotYourTurn",
  move: "AZEROTH.Rider.Prime.NoMove"
});

/**
 * Whether a rider row is one a door can use: a cost it pays, or a discount it
 * lays on the others. The census reads this - a `rider: {}` clears nothing.
 *
 * @param {object|null|undefined} rider
 */
export function isRider(rider) {
  if (!rider || typeof rider !== "object") return false;
  const cost = rider.cost ?? null;
  const pays = Boolean(cost && typeof cost.pool === "string" && cost.pool
    && (cost.amount === "all" || (Number.isInteger(cost.amount) && cost.amount > 0)));
  const discounts = Boolean(rider.discount && typeof rider.discount.pool === "string" && Number(rider.discount.amount) > 0);
  return pays || discounts;
}

/** What a rider does on a hit at a rank: `onHit`, with every clause the rank has reached laid over it. */
export function onHitAt(rider, rank = 1) {
  const base = { condition: null, value: null, damage: null, prone: false, heal: null, noHealing: null, sl: null, ...(rider?.onHit ?? {}) };
  // The Ranger's and the Rogue's keys (D-773) are named only where a rider
  // carries one, so every rider before them reads back the shape it always did.
  for (const clause of rider?.atRank ?? []) {
    if ((Number(rank) || 0) >= (Number(clause?.rank) || Infinity)) Object.assign(base, clause.onHit ?? {});
  }
  return base;
}

/**
 * A price in a pool, with the discounts switched on laid over it: never below
 * a discount's `min`, and never below 1 - a rider that costs nothing is not a
 * spend. `"all"` is never discounted.
 *
 * @param {number|"all"} amount
 * @param {string} pool
 * @param {Array<{pool: string, amount: number, min?: number}>} discounts
 * @returns {number|"all"}
 */
export function discountedCost(amount, pool, discounts = []) {
  if (amount === "all") return "all";
  let cost = Math.max(0, Math.trunc(Number(amount)) || 0);
  for (const d of discounts ?? []) {
    if (!d || d.pool !== pool) continue;
    const floor = Math.max(1, Math.trunc(Number(d.min)) || 1);
    cost = Math.max(Math.min(cost, floor), cost - (Math.trunc(Number(d.amount)) || 0));
  }
  return cost;
}

/**
 * The identifiers of the discount riders switched on, off the flags of the
 * actor's ACTIVE effects (`RIDER_DISCOUNT_FLAG`). Sorted, once each.
 *
 * @param {Array<object>} flagsList  each effect's `flags["azeroth-rpg"]`
 * @returns {string[]}
 */
export function riderDiscountsOf(flagsList = []) {
  const out = new Set();
  for (const flags of flagsList ?? []) {
    const id = flags?.[RIDER_DISCOUNT_FLAG]?.identifier ?? null;
    if (typeof id === "string" && id) out.add(id);
  }
  return [...out].sort();
}

/** The family a blow belongs to for a rider's `weapon` gate: a throw and a shot ride `ranged`. */
function weaponFamily(rangeKind) {
  if (!rangeKind) return null;
  return rangeKind === "melee" ? "melee" : "ranged";
}

/** The talents taken that carry a rider row, each with its rank. */
function takenRiders(talents = [], rowOf = talentEffect) {
  const out = [];
  for (const t of talents ?? []) {
    const rank = Math.trunc(Number(t?.taken) || 0);
    if (rank < 1) continue;
    const rider = rowOf(t.className, t.identifier, t.race ?? null)?.rider ?? null;
    if (isRider(rider)) out.push({ talent: t, rider, rank });
  }
  return out;
}

/**
 * What a rider does when the blow it rode lands - or does not.
 *
 * The move is bought by the SPEND and comes whether the blow lands or not; the
 * condition, Prone and the damage come on a hit alone. A condition whose value
 * works out at nothing lays nothing: *Bleeding 0* is not a condition (the rule
 * `firedCondition` keeps for Sulfuron Hammer).
 *
 * @param {object} rider  the row's `rider`
 * @param {{hit?: boolean, spent?: number, rank?: number, tier?: number, sl?: number}} o
 * @returns {{move: string|null, condition: {id: string, value: number|null}|null, prone: boolean, damage: number}}
 */
export function riderOutcome(rider, { hit = false, spent = 0, rank = 1, tier = 1, sl = 0 } = {}) {
  const on = onHitAt(rider, rank);
  const scope = { rank, tier, spent, sl };
  // **A CONDITION AT AN SL** (Shield Slam's rank 2, D-772: *a hit at SL 2 also
  // applies Stun*): the condition and Prone land only where the hit reached it.
  const reached = on.sl === null || on.sl === undefined || (Math.trunc(Number(sl)) || 0) >= Number(on.sl);
  let condition = null;
  if (hit && reached && on.condition) {
    if (on.value === null || on.value === undefined) condition = { id: on.condition, value: null };
    else {
      const n = Math.trunc(evaluateExpression(on.value, scope) ?? 0);
      condition = n > 0 ? { id: on.condition, value: n } : null;
    }
  }
  const damage = hit && on.damage ? Math.max(0, Math.trunc(evaluateExpression(on.damage, scope) ?? 0)) : 0;
  const out = { move: rider?.move ?? null, condition, prone: hit && reached && on.prone === true, damage };
  // **THE TYPE THE DAMAGE IS, WHERE THE ROW NAMES ONE** (04's Stormstrike: *the
  // target takes Nature damage equal to your tier*; D-777, the lead: *"Different
  // damage types in one attack are possible"*): a second amount on the blow, met
  // by its own Ward. Named only where carried; a rider naming none rides the
  // blow's own type (Crusader Strike's *add your tier to its damage*).
  if (on.type) out.damageType = on.type;
  // The Warrior's two (D-772), named only where a rider carries them, so every
  // rider before them reads back exactly the four keys it always did.
  // Bloodthirst: Health the STRIKER recovers on a hit.
  if (on.heal !== null && on.heal !== undefined) out.heal = hit ? Math.max(0, Math.trunc(evaluateExpression(on.heal, scope) ?? 0)) : 0;
  // Mortal Strike: the target recovers no Health until the striker's turn ends.
  if (on.noHealing) out.noHealing = hit ? on.noHealing : null;
  // **THE RANGER'S AND THE ROGUE'S** (D-773), each named only where carried.
  // Piercing Shot's Pierce rides the blow, landed or not (a miss pierces nothing).
  if (on.pierce !== null && on.pierce !== undefined) out.pierce = Math.max(0, Math.trunc(evaluateExpression(on.pierce, scope) ?? 0));
  // Trueshot's SL: what the attack counts as, hit without a roll.
  if (on.forced !== null && on.forced !== undefined) out.forced = Math.max(0, Math.trunc(Number(on.forced)) || 0);
  // Concussive Shot's and Wing Clip's span, and what lands with the hit.
  if (on.until) out.until = on.until;
  if (on.loseReaction === true) out.loseReaction = hit && reached;
  if (on.speedDrop !== null && on.speedDrop !== undefined) out.speedDrop = hit && reached ? Math.max(0, Math.trunc(evaluateExpression(on.speedDrop, scope) ?? 0)) : 0;
  // Garrote's *cannot cast while that Bleeding lasts*, on the Bleeding it laid.
  if (on.noCasting === true) out.noCasting = hit && reached && condition !== null;
  // Stormstrike's Bane on the target's next attack (D-774), named only where carried.
  if (on.bane?.kind) {
    const banes = Math.max(0, Math.trunc(evaluateExpression(on.bane.banes ?? 1, scope) ?? 0));
    out.bane = hit && reached && banes > 0 ? { kind: on.bane.kind, banes } : null;
  }
  return out;
}

/**
 * **TRUESHOT'S SUCCESS LEVEL** (04: *The attack hits without a roll and counts as
 * SL 2, or SL 3 at rank 2*; D-773): the highest a paid or primed rider forces,
 * or null where none does. Judged before the die.
 *
 * @param {Array<{line?: object}>} paid  the riders this attack paid for
 * @returns {number|null}
 */
export function forcedSl(paid = []) {
  let sl = null;
  for (const p of paid ?? []) {
    const n = p?.line?.onHit?.forced;
    if (n === null || n === undefined || !Number.isFinite(Number(n))) continue;
    sl = sl === null ? Number(n) : Math.max(sl, Number(n));
  }
  return sl;
}

/**
 * **THE ARMOR POINTS THE PAID RIDERS PIERCE** (Piercing Shot, D-773), summed.
 *
 * @param {Array<{line?: object, spent?: number}>} paid
 * @param {{tier?: number}} [o]
 */
export function riderPierce(paid = [], { tier = 1 } = {}) {
  let n = 0;
  for (const p of paid ?? []) {
    if (!p?.line?.row) continue;
    n += riderOutcome(p.line.row, { hit: true, spent: p.spent ?? 0, rank: p.line.rank ?? 1, tier }).pierce ?? 0;
  }
  return n;
}

/**
 * **WHAT A LINE'S RIDER DOES, READ OFF ITS ROW** (the D-770 review, item C).
 * A line carries `onHit` already merged at its rank and no `atRank` of its
 * own, so handing the LINE to `riderOutcome` read correctly only at that one
 * rank and would drop every clause of a higher one. This reads the row the line
 * was built from, at the line's rank, which is the one way a door asks.
 *
 * @param {object} line  a `ridersFor` line
 * @param {{hit?: boolean, spent?: number, tier?: number, sl?: number}} [o]
 */
export function outcomeOfLine(line, { hit = false, spent = 0, tier = 1, sl = 0 } = {}) {
  return riderOutcome(line?.row ?? line, { hit, spent, rank: line?.rank ?? 1, tier, sl });
}

/**
 * **WHAT A RIDER LAYS ON THE TARGET** (the lead, 2026-10-03: *"Lands
 * automatically"*): the condition an outcome names, then Prone, once each, in
 * the order they land. Nothing on a miss - `riderOutcome` names none there.
 *
 * @param {{condition: {id: string, value: number|null}|null, prone: boolean}|null} outcome
 * @returns {Array<{id: string, value: number|null}>}
 */
export function riderConditions(outcome) {
  const out = [];
  if (outcome?.condition?.id) out.push({ id: outcome.condition.id, value: outcome.condition.value ?? null });
  if (outcome?.prone === true && !out.some(c => c.id === "prone")) out.push({ id: "prone", value: null });
  return out;
}

/**
 * **WHETHER A RIDER WRITES ON THE CREATURE STRUCK** (the architect's review of
 * D-774): a condition or Prone, a lost Reaction, a Speed drop, no healing, or a
 * Bane on its next Test (Stormstrike's) - each written on the target, through the
 * GM's client where the striker's does not own it. The attack door asks it before
 * anything is paid, so a rider whose landing needs a GM is refused with nothing
 * spent when none is online. Read at the line's rank on a hit at the best SL a
 * blow can reach, since what is asked is whether it COULD land.
 *
 * @param {object} line  a `ridersFor` line
 * @param {{tier?: number}} [o]
 * @returns {boolean}
 */
export function riderWritesOnTarget(line, { tier = 1 } = {}) {
  if (!line) return false;
  const done = outcomeOfLine(line, { hit: true, spent: Math.max(1, Math.trunc(Number(line.cost)) || 1), tier, sl: 6 });
  return riderConditions(done).length > 0 || done.loseReaction === true || (Number(done.speedDrop) || 0) > 0
    || Boolean(done.noHealing) || Boolean(done.bane);
}

/**
 * **THE LINES THE ATTACK DIALOG DRAWS** (D-770): one a rider the character
 * holds, priced at the pool it pays from, `available` or refused with its
 * reason, and what it would do on a hit as it stands now. Sorted by name, so
 * a list a person reads never wobbles between renders.
 *
 * @param {Array<{identifier: string, className: string, race?: string|null, name: string, taken: number}>} talents
 *   the talents taken, as `AzerothActor#takenTalents` hands them
 * @param {object} o
 * @param {Array<{itemId: string|null, kind: string, name: string, value: number, max: number}>} o.pools
 * @param {boolean} [o.form]            a Shapeshift form is worn
 * @param {string|null} [o.weapon]      the blow's range kind: melee, thrown or a shot
 * @param {string[]} [o.usedThisRound]  the once-a-round riders already spent this round
 * @param {string[]} [o.primed]  the riders paid before the blow from the Combat
 *   tab THIS turn and not yet taken by an attack: drawn as already paid
 * @param {string[]} [o.activeDiscounts] the discount riders switched on
 * @param {number} [o.tier]
 * @param {Function} [o.rowOf]  the table lookup, injectable so a test can hand
 *   in a row the table does not hold yet (`talentCensus`'s own pattern)
 * @returns {Array<object>}  each line carries its `row`, the rider it was built
 *   from, so what it does is read off the row and never off the line
 *   (`outcomeOfLine`)
 */
export function ridersFor(talents = [], { pools = [], form = false, weapon = null, shield = false, opening = null, usedThisRound = [], primed = [], activeDiscounts = [], tier = 1, rowOf = talentEffect } = {}) {
  const rows = takenRiders(talents, rowOf);
  const discounts = rows
    .filter(r => r.rider.discount && activeDiscounts.includes(r.talent.identifier))
    .map(r => r.rider.discount);
  const family = weaponFamily(weapon);
  const out = [];
  for (const { talent, rider, rank } of rows) {
    if (!rider.cost) continue;
    if (rider.form === true && form !== true) continue;
    if (rider.weapon && family && rider.weapon !== family) continue;
    // **A BLOW STRUCK WITH A SHIELD NEEDS ONE** (Shield Slam, D-772): with none
    // held - or one melded into a shape - the line can never hold, and is not
    // drawn (D-711 phase 2's rule for a line that can never hold).
    if (rider.needs === "shield" && shield !== true) continue;
    // **A BLOW AT A TARGET UNDER THE OPENING** (Garrote, D-773): drawn where the
    // door found the target under it, and where it could not tell (`null`: no
    // target, no fight) left for the table to tick - never drawn at a target the
    // door knows is not.
    if (rider.needs === "opening" && opening === false) continue;
    const pool = (pools ?? []).find(p => p?.name === rider.cost.pool) ?? null;
    const all = rider.cost.amount === "all";
    const cost = all ? null : discountedCost(rider.cost.amount, rider.cost.pool, discounts);
    const value = Math.max(0, Math.trunc(Number(pool?.value) || 0));
    const spend = all ? value : cost;
    const params = { name: talent.name, pool: rider.cost.pool, cost: cost ?? value, value };
    const isPrimed = (primed ?? []).includes(talent.identifier);
    let reason = null;
    if (!pool) reason = { key: RIDER_REFUSALS.noPool, params };
    // Paid before the blow: the round is marked as well, so this comes first.
    else if (isPrimed) reason = { key: RIDER_REFUSALS.primed, params };
    else if (rider.once === "round" && (usedThisRound ?? []).includes(talent.identifier)) reason = { key: RIDER_REFUSALS.once, params };
    else if (all && value < 1) reason = { key: RIDER_REFUSALS.empty, params };
    else if (!all && value < cost) reason = { key: RIDER_REFUSALS.short, params };
    out.push({
      id: `rider-${talent.identifier}`,
      identifier: talent.identifier,
      name: talent.name,
      rank,
      pool: rider.cost.pool,
      all,
      cost,
      spend,
      once: rider.once ?? null,
      move: rider.move ?? null,
      // When it is paid, and what the blow is struck with (D-772).
      pays: rider.pays ?? null,
      strike: rider.strike ?? null,
      // What the blow needs (D-772, D-773), so the roll can judge it again.
      needs: rider.needs ?? null,
      onHit: onHitAt(rider, rank),
      // What it would do on a hit that reached every SL a clause asks for, so
      // the line can say *at SL 2, Stunned* rather than nothing.
      does: riderOutcome(rider, { hit: true, spent: spend ?? 0, rank, tier, sl: 6 }),
      available: reason === null,
      primed: Boolean(pool) && isPrimed,
      reason,
      row: rider
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.identifier.localeCompare(b.identifier));
}

/**
 * **THE PAYMENT, JUDGED WHOLE BEFORE ANYTHING IS SPENT** (D-768's order).
 *
 * The ticked riders against the pools as they will stand once the roll has
 * paid what it pays first (the caller hands them in already less the called
 * shot's Momentum and the Finisher): the fixed prices in the lines' own order,
 * then each rider of `"all"` taking what is left. One that cannot pay refuses
 * the WHOLE roll with its reason, and nothing is written.
 *
 * @param {Array<object>} lines   `ridersFor`'s lines, as they stand now
 * @param {string[]} chosen       the identifiers the roller ticked
 * @param {{pools: Array<{itemId: string|null, kind: string, name: string, value: number}>}} o
 * @returns {{ok: true, paid: Array<{identifier: string, name: string, pool: string, spent: number, line: object}>,
 *   writes: Array<{itemId: string|null, kind: string, value: number}>, once: string[], move: boolean}
 *   | {ok: false, reason: {key: string, params: object}}}
 */
export function riderPlan(lines = [], chosen = [], { pools = [] } = {}) {
  const ids = [...new Set((chosen ?? []).filter(id => typeof id === "string" && id))];
  const empty = { ok: true, paid: [], writes: [], once: [], move: false };
  if (!ids.length) return empty;
  const byId = new Map((lines ?? []).map(l => [l.identifier, l]));
  for (const id of ids) {
    if (!byId.has(id)) return { ok: false, reason: { key: RIDER_REFUSALS.gone, params: { name: id } } };
  }
  const left = new Map();
  const poolOf = name => (pools ?? []).find(p => p?.name === name) ?? null;
  const have = name => (left.has(name) ? left.get(name) : Math.max(0, Math.trunc(Number(poolOf(name)?.value) || 0)));
  const picked = (lines ?? []).filter(l => ids.includes(l.identifier));
  const paid = [];
  for (const line of [...picked.filter(l => !l.all), ...picked.filter(l => l.all)]) {
    if (!line.available) return { ok: false, reason: line.reason };
    const pool = poolOf(line.pool);
    if (!pool) return { ok: false, reason: { key: RIDER_REFUSALS.noPool, params: { name: line.name, pool: line.pool, cost: line.cost ?? 0, value: 0 } } };
    const now = have(line.pool);
    const spent = line.all ? now : line.cost;
    if (line.all && now < 1) return { ok: false, reason: { key: RIDER_REFUSALS.empty, params: { name: line.name, pool: line.pool, cost: 0, value: now } } };
    if (!line.all && now < spent) return { ok: false, reason: { key: RIDER_REFUSALS.short, params: { name: line.name, pool: line.pool, cost: spent, value: now } } };
    left.set(line.pool, now - spent);
    paid.push({ identifier: line.identifier, name: line.name, pool: line.pool, spent, line });
  }
  const writes = [...left.entries()].map(([name, value]) => {
    const pool = poolOf(name);
    return { itemId: pool.itemId ?? null, kind: pool.kind, value };
  });
  return {
    ok: true,
    paid,
    writes,
    once: paid.filter(p => p.line.once === "round").map(p => p.identifier).sort(),
    move: paid.some(p => p.line.move === "speed")
  };
}

/**
 * **THE PAYMENT, OFF THE POOLS AS THEY STAND WHEN IT IS MADE** (the D-770
 * review, item D). `riderPlan` judged against the pools as they stood when the
 * attack was asked for, and the writes it worked out were written after two
 * awaits - the budget's queued spend and the reveal - so a pool that moved in
 * between (a hit landing on another card, a Momentum write at the turn's
 * start) had the move written over. This settles the same picks against the
 * pools read AFTER those awaits: the fixed prices first, then *all* taking what
 * is left NOW, each pool written once from its fresh value.
 *
 * **A pool that fell below a price in between pays what it holds**, floored at
 * nothing, the Finisher's rule (*a pool that has moved since the dialog opened
 * pays what is in it*): the attack was judged payable and its Half-Action is
 * already spent, so it is never refused here (D-768). A pool that is gone pays
 * nothing. What was actually paid is what the outcome reads - Rip's Bleeding is
 * half of THAT.
 *
 * @param {{paid: Array<{identifier: string, name: string, pool: string, spent: number, line: object}>}|null} plan
 * @param {{pools: Array<{itemId: string|null, kind: string, name: string, value: number}>}} o  the pools now
 * @returns {{paid: Array<{identifier: string, name: string, pool: string, spent: number, line: object}>,
 *   writes: Array<{itemId: string|null, kind: string, value: number}>}}
 */
export function settleRiders(plan, { pools = [] } = {}) {
  const poolOf = name => (pools ?? []).find(p => p?.name === name) ?? null;
  const left = new Map();
  const have = name => (left.has(name) ? left.get(name) : Math.max(0, Math.trunc(Number(poolOf(name)?.value) || 0)));
  const order = plan?.paid ?? [];
  const settled = new Map();
  for (const p of [...order.filter(x => !x.line?.all), ...order.filter(x => x.line?.all)]) {
    if (!poolOf(p.pool)) {
      settled.set(p, { ...p, spent: 0 });
      continue;
    }
    const now = have(p.pool);
    const price = Math.max(0, Math.trunc(Number(p.spent)) || 0);
    const spent = p.line?.all ? now : Math.min(now, price);
    left.set(p.pool, now - spent);
    settled.set(p, { ...p, spent });
  }
  const writes = [...left.entries()].map(([name, value]) => {
    const pool = poolOf(name);
    return { itemId: pool.itemId ?? null, kind: pool.kind, value };
  });
  return { paid: order.map(p => settled.get(p)), writes };
}

/**
 * **THE ROUND'S RECORD OF RIDERS, WRITTEN ONCE** (D-770; the lead, 2026-10-03:
 * *"Either order"*). Pure: what `AzerothCombatant#markRoundRiders` writes, worked
 * out from the record as it stands when the queued write's turn comes.
 *
 * `riders` is every once-a-round rider spent this round - the ONE gate the
 * attack's dialog and the Combat tab's control both read; `primed` the ones
 * paid before the blow and not yet taken by an attack. A record from an older
 * round is a new round's and starts empty.
 *
 * @param {{number?: number, riders?: string[], primed?: string[]}|null} round  the combatant's `round` flag
 * @param {number} number  the fight's round now
 * @param {{mark?: string[], prime?: boolean, consume?: string[]}} [o]
 *   `mark` the riders to mark spent, `prime` whether those are paid before the
 *   blow, `consume` the primed riders an attack has just taken
 * @returns {{round: object, added: string[], changed: boolean}}  `added` the
 *   riders this write marked that were not marked before - one already there was
 *   spent by the other door first
 */
export function roundRiders(round, number, { mark = [], prime = false, consume = [] } = {}) {
  const clean = list => [...new Set((list ?? []).filter(id => typeof id === "string" && id))];
  const same = round?.number === number;
  const held = same ? clean(round?.riders) : [];
  const primedHeld = same ? clean(round?.primed) : [];
  const added = clean(mark).filter(id => !held.includes(id)).sort();
  const riders = [...new Set([...held, ...added])].sort();
  const gone = clean(consume);
  const primed = [...new Set([...primedHeld.filter(id => !gone.includes(id)), ...(prime ? added : [])])].sort();
  const changed = !same || added.length > 0 || primed.length !== primedHeld.length || primed.some(id => !primedHeld.includes(id));
  return { round: { ...(same ? round : {}), number, riders, primed }, added, changed };
}

/**
 * **A ONCE-A-ROUND MARK ON THE ROUND'S RECORD** (D-771): Savage Shift's free
 * shift (*Once a round*) and Primal Fury's further Ferocity (*Once during your
 * turn* - a combatant takes one turn a round, so the round is the turn's
 * clock). The record's `once` list, beside the riders' own, written by the
 * queued combatant door `markRoundOnce` (D-761) and read when its turn comes,
 * so two doors in flight cannot each find the mark unspent. A record from an
 * older round is a new round's and starts empty.
 *
 * @param {{number?: number, once?: string[]}|null} round  the combatant's `round` flag
 * @param {number} number  the fight's round now
 * @param {string} key
 * @returns {{round: object, added: boolean, changed: boolean}}  `added` false
 *   where the mark was already spent this round
 */
export function roundOnce(round, number, key) {
  const same = round?.number === number;
  const held = same ? [...new Set((round?.once ?? []).filter(k => typeof k === "string" && k))] : [];
  if (typeof key !== "string" || !key) return { round: { ...(same ? round : {}), number, once: held.sort() }, added: false, changed: !same };
  if (held.includes(key)) return { round: { ...round, once: held.sort() }, added: false, changed: false };
  return { round: { ...(same ? round : {}), number, once: [...held, key].sort() }, added: true, changed: true };
}

/**
 * **THE ROUND'S WAS-STRUCK MARK** (05 §11: Rage is kept through a round in which
 * you were struck; D-627), written by the queued combatant door `markStruck`
 * (D-761) and read when its turn comes. **A record from an older round is a new
 * round's and starts empty** - the final review of D-768 to D-775 found the damage
 * door spreading a stale record under the new round's number, which re-stamped
 * last round's `once` and riders marks as this round's, and leaving a stale
 * `wasStruck` standing so this round's was never written.
 *
 * @param {{number?: number, wasStruck?: boolean}|null} round  the combatant's `round` flag
 * @param {number} number  the fight's round now
 * @returns {{round: object, changed: boolean}}
 */
export function roundStruck(round, number) {
  const same = round?.number === number;
  if (same && round.wasStruck === true) return { round, changed: false };
  return { round: { ...(same ? round : {}), number, wasStruck: true }, changed: true };
}

/**
 * **WHETHER THE COMBAT TAB MAY PAY A RIDER BEFORE THE BLOW** (the lead,
 * 2026-10-03: *"Either order"*). Only a rider whose spend buys a move - the
 * thing that has to happen before the blow - and only in a fight, on the
 * character's own turn, where the attack's dialog would offer the same line
 * (`line.available`): the pool, the form and the once-a-round gate are the
 * line's own. **On the character's own turn** is the tool's (D-770): a charge
 * paid on somebody else's turn would buy a Move the turn's start takes away.
 *
 * @param {object|null} line  a `ridersFor` line
 * @param {{inFight?: boolean, onTurn?: boolean}} [o]
 * @returns {{ok: boolean, reason: {key: string, params: object}|null}}
 */
export function primeJudgement(line, { inFight = false, onTurn = false } = {}) {
  if (!line) return { ok: false, reason: { key: RIDER_REFUSALS.gone, params: { name: "" } } };
  const params = { name: line.name, pool: line.pool, cost: line.cost ?? 0, value: line.spend ?? 0 };
  if (!line.move) return { ok: false, reason: { key: RIDER_PRIME_REFUSALS.move, params } };
  if (!inFight) return { ok: false, reason: { key: RIDER_PRIME_REFUSALS.fight, params } };
  if (line.primed) return { ok: false, reason: line.reason ?? { key: RIDER_REFUSALS.primed, params } };
  if (!line.available) return { ok: false, reason: line.reason };
  if (!onTurn) return { ok: false, reason: { key: RIDER_PRIME_REFUSALS.turn, params } };
  return { ok: true, reason: null };
}

/**
 * The Combat tab's controls: one a rider that buys a move, each judged as its
 * press will be. Sorted as the lines are.
 *
 * @param {Array<object>} lines  `ridersFor`'s
 * @param {{inFight?: boolean, onTurn?: boolean}} [o]
 * @returns {Array<{line: object, ok: boolean, reason: object|null}>}
 */
export function chargeLines(lines = [], o = {}) {
  return (lines ?? []).filter(l => l?.move).map(line => ({ line, ...primeJudgement(line, o) }));
}
