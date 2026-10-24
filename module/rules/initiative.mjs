/**
 * Initiative and the turn budget. Pure functions, no Foundry imports.
 *
 * **INITIATIVE IS NEVER ROLLED** (D-256). It is `10 + Dex modifier + talents`,
 * compared once: the side holding the highest acts first, and **the sides then
 * alternate — everybody on one side, then everybody on the other**. That is not
 * a per-combatant order with a different sort, and building it as one is the
 * mistake this module exists to prevent.
 *
 * A turn is **two Half-Actions plus one Reaction** (D-012, completed by D-255),
 * and **you may Attack once for each Half-Action you spend on it** (05 §10,
 * D-711) — so a turn holds at most two Attacks and there is no counter here at
 * all. The once-a-round limit is gone, for a character and for a creature
 * alike, which is why 14 §1's Boss and Elite exemption went with it: there is
 * nothing left to be exempt from.
 *
 * **Extra Attack is TWO ROLLS IN ONE ATTACK, never a second Attack** (02 §6:
 * *Two attacks each time you Attack*), which is `rollsPerAttack` below. An
 * **Off-Hand Attack RIDES the main-hand Attack** (06 §1, D-711): it costs no
 * Half-Action in a turn where an Attack has already been made, may be made
 * **once each round** (06 §2), and **Extra Attack does not double it**. A lone
 * off-hand blow — no main-hand Attack this turn — still costs its own
 * Half-Action, because there is nothing for it to ride. Either way it is made
 * **in your own turn** (06 §1: *in a turn in which you Attack*), so a blow
 * bought with the Reaction is nothing to ride and a press outside the turn is
 * refused rather than charged.
 *
 * **EVERY HALF-ACTION IS SPENT ON YOUR OWN TURN** (05: *On your turn you have two
 * Half-Actions and one Reaction*; the lead, 2026-10-23: *"Refuse off-turn
 * Half-Actions"*). Outside its owner's turn only the Reaction is open: a Use, an
 * attack, a cast, a Stand, a gadget priced in Half-Actions, an action or a Full
 * Action is refused in words - unless the Half-Action was given to be taken AT
 * ONCE (`grantAtOnce`: 04's Remote Control, *one of your constructs within 60 feet
 * takes a Half-Action at once*; 05's Ready, whose named action the Reaction takes
 * when the trigger fires). A turn's leftover Half-Actions used to pay for a Use
 * pressed on somebody else's turn, since the budget is reset only when the
 * creature's own turn comes round again.
 *
 * **Every refusal is an i18n key and its params**, never an English sentence
 * (CLAUDE.md §11): the tracker has to say why an action is unavailable, and
 * `AzerothCombatant#spendAction` is what localises it.
 */

import { AZEROTH } from "../config.mjs";

/** Two sides. Neutral acts with the side it is not hostile to; the GM decides. */
export const SIDES = Object.freeze(["friendly", "hostile"]);

export const HALF_ACTIONS_PER_TURN = AZEROTH.HALF_ACTIONS_PER_TURN;
export const REACTIONS_PER_TURN = AZEROTH.REACTIONS_PER_TURN;

/** *You may make one each round* (06 §2). */
export const OFF_HAND_ATTACKS_PER_ROUND = 1;

/** 02 §6's *two attacks each time you Attack* — rolls, not Attack actions. */
export const ROLLS_PER_EXTRA_ATTACK = 2;

/** Every refusal `spend` and `restore` can return, as i18n keys. */
export const BUDGET_REFUSALS = Object.freeze({
  noSuchCost: "AZEROTH.Budget.Refuse.NoSuchCost",
  noReaction: "AZEROTH.Budget.Refuse.NoReaction",
  needsHalves: "AZEROTH.Budget.Refuse.NeedsHalves",
  fullTakesReaction: "AZEROTH.Budget.Refuse.FullTakesReaction",
  offHandSpent: "AZEROTH.Budget.Refuse.OffHandSpent",
  offHandNotYourTurn: "AZEROTH.Budget.Refuse.OffHandNotYourTurn",
  // Any Half-Action, action or Full Action outside its owner's turn (the lead:
  // *"Refuse off-turn Half-Actions"*), with the at-once allowance spent.
  notYourTurn: "AZEROTH.Budget.Refuse.NotYourTurn",
  nothingToRestore: "AZEROTH.Budget.Refuse.NothingToRestore"
});

/**
 * **DOES THE SECOND ROLL OF AN EXTRA ATTACK BUILD MOMENTUM?** 06 §1 step 7
 * grants 1 Momentum per attack and carves out only the off hand, so the honest
 * reading is that each roll that lands builds its own: 2 a round for a level-5
 * martial and 4 at SL 2 or better, against 1 and 2 under the other reading.
 * Against the code as it stood the RATE does not move - two Attack actions
 * already built twice - but it cost both Half-Actions and now costs one.
 * **The book does not settle it** (O-109); this is the one line to change.
 */
export const EXTRA_ATTACK_ROLLS_BUILD_MOMENTUM = true;

/**
 * How many Attack Tests one Attack action rolls (02 §6).
 *
 * - **Extra Attack is two rolls in one Attack**, not a second Attack action.
 * - **It does not double the off hand** (06 §2, in those words).
 * - A blow struck as a **Reaction** is one attack and no more: 06 §6 gives the
 *   Opportunity Attack as *one attack against them at the moment they leave*,
 *   a Parry is not an attack at all, and 06 §7's Riposte is a Reaction's blow.
 * - An **Opposed Test that deals no damage** is one roll: 06 §7's Disarm takes
 *   a weapon rather than landing a blow, and rolling it twice would ask the
 *   table to resolve one maneuver two ways.
 *
 * The last two are the tool's rulings where 02 and 06 meet; the book says only
 * *two attacks each time you Attack*.
 */
export function rollsPerAttack({ extraAttack = false, isOffHand = false, reaction = false, opposed = false } = {}) {
  if (isOffHand || reaction || opposed) return 1;
  return extraAttack ? ROLLS_PER_EXTRA_ATTACK : 1;
}

/** Off-Hand Attacks left this round; a budget written before D-704 has one. */
function offHandLeft(budget) {
  const n = budget?.offHandAttacks;
  return n === undefined || n === null ? OFF_HAND_ATTACKS_PER_ROUND : n;
}

/** Initiative: a static number, never a roll (D-256). */
export function initiativeFor({ dexMod = 0, bonus = 0 } = {}) {
  return 10 + dexMod + bonus;
}

/**
 * Which side acts first: the one holding the single highest Initiative.
 *
 * A tie between the two sides' best is broken in the players' favour, which is
 * a choice rather than a rule — 06 does not say, and giving it to the GM's side
 * would make the tie feel like a ruling every time it happened.
 */
export function leadingSide(combatants = []) {
  const best = side =>
    combatants.filter(c => c.side === side).reduce((m, c) => Math.max(m, c.initiative ?? 0), -Infinity);
  const friendly = best("friendly");
  const hostile = best("hostile");
  if (friendly === -Infinity && hostile === -Infinity) return null;
  return hostile > friendly ? "hostile" : "friendly";
}

/**
 * The round's turn order: **every combatant on the leading side, then every
 * combatant on the other**.
 *
 * Within a side the order is the players' to choose; ties and everything else
 * sort by descending Initiative so the tracker has a stable default rather than
 * a random one.
 */
export function turnOrder(combatants = []) {
  const lead = leadingSide(combatants);
  if (!lead) return [];
  const other = lead === "friendly" ? "hostile" : "friendly";
  const bySide = side =>
    combatants
      .filter(c => c.side === side)
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0) || String(a.name).localeCompare(b.name));
  return [...bySide(lead), ...bySide(other)];
}

/** A free Move the turn holds (02 §7's Sprint, D-712); a budget without one has none. */
function freeMovesLeft(budget) {
  const n = budget?.freeMove;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * The Half-Actions the budget holds TO BE TAKEN AT ONCE, whoever's turn it is
 * (`grantAtOnce`); a budget that never had one holds none. Never more than the
 * Half-Actions themselves: an at-once Half-Action is one of them.
 */
export function atOnceLeft(budget) {
  const n = budget?.atOnce;
  const held = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return Math.min(held, Math.max(0, Math.trunc(Number(budget?.halfActions)) || 0));
}

/**
 * A fresh turn's budget. Reactions refresh at the start of your turn (06 §6),
 * and the off hand's one is per ROUND rather than per turn.
 *
 * **There is no Attack counter** (05 §10, D-711): *you may Attack once for each
 * Half-Action you spend on it*, so the Half-Actions are the only bound and a
 * Boss needs no exemption. `attacked` is not a counter — it is the fact the off
 * hand rides, and nothing else reads it.
 *
 * @param {object} [o]
 * @param {boolean} [o.extraAttack]  02 §6's feature, a creature's trait or flag.
 * @param {number} [o.freeMove]      Moves this turn that cost no Half-Action
 *                                   (02 §7's Sprint, D-712).
 * @param {number|null} [o.halfActions]  A turn of FEWER Half-Actions than 05's two,
 *   where the creature's own words say so (04's Pocket Factory: *each takes one
 *   Half-Action a turn of its own*; the Legacy branches' door 6). Never more than
 *   two; null or absent is 05's two.
 * @param {number|null} [o.reactions]  A turn with no Reaction, where the creature's
 *   state says so (06 §10's Spirit Realm: *You cannot touch the living world*; the
 *   Legacy branches' door 10). Never more than 06 §6's one; null or absent is it.
 */
export function freshTurn({ extraAttack = false, freeMove = 0, halfActions = null, reactions = null } = {}) {
  const halves = halfActions === null || halfActions === undefined
    ? HALF_ACTIONS_PER_TURN
    : Math.max(0, Math.min(HALF_ACTIONS_PER_TURN, Math.trunc(Number(halfActions)) || 0));
  const answers = reactions === null || reactions === undefined
    ? REACTIONS_PER_TURN
    : Math.max(0, Math.min(REACTIONS_PER_TURN, Math.trunc(Number(reactions)) || 0));
  return {
    halfActions: halves,
    reactions: answers,
    // 06 §2: *You may make one each round.* Nothing counted it before D-704,
    // so two Half-Actions bought two off-hand blows.
    offHandAttacks: OFF_HAND_ATTACKS_PER_ROUND,
    // **WHETHER AN ATTACK HAS BEEN MADE THIS TURN** (06 §1, D-711). The off
    // hand *rides the first*, so the one thing the budget has to remember about
    // attacking is whether there is anything to ride. It is not a limit and
    // nothing refuses on it.
    attacked: false,
    // Moves that cost no Half-Action. `AzerothCombatant#_freeMoves` is what
    // decides there is one, off the features the actor holds and whether the
    // combatant has acted yet; this only carries the number.
    freeMove: Math.max(0, Math.trunc(Number(freeMove)) || 0),
    // **HOW MANY TESTS ONE ATTACK ROLLS IS NOT STORED HERE**, deliberately.
    // `rollsPerAttack` above is the law and the attack door asks the ACTOR, so
    // a Druid whose Extra Attack is *while in a Shapeshift form* is read as it
    // stands rather than as it stood when the turn began. A copy on the budget
    // would be a second answer to one question with nothing reading it, which
    // is this system's commonest real fault (D-681).
    extraAttack
  };
}

/**
 * **A TURN LOST** (07's Void Rift: *or loses its turn describing what it can
 * see*; D-757): the turn's Half-Actions and its free Move are gone, and nothing
 * else is - the Reaction is not the turn's, and a blow already struck stays
 * struck. The budget the combatant carries, spent to nothing; never a refusal,
 * since there is nothing left to refuse.
 *
 * @param {ReturnType<typeof freshTurn>} budget
 * @returns {ReturnType<typeof freshTurn>}
 */
export function loseTurn(budget) {
  const b = budget && typeof budget === "object" ? budget : freshTurn();
  return { ...b, halfActions: 0, freeMove: 0 };
}

/**
 * Spend from the budget. Returns the new budget, or a refusal naming what was
 * short — the tracker has to say why an action is unavailable, not merely grey
 * it out. **The reason is an i18n key and `params` are its format arguments**;
 * `AzerothCombatant#spendAction` localises them.
 *
 * @param {object} budget
 * @param {"half"|"action"|"full"|"reaction"} cost  D-255's ladder.
 * @param {object} [options]
 * @param {boolean} [options.isAttack]   An Attack, so it sets `attacked`.
 * @param {boolean} [options.isOffHand]  Rides an Attack already made this turn
 *                                       (06 §1, D-711) and is counted against
 *                                       its own one a round (06 §2).
 * @param {boolean} [options.isMove]     Draws on a free Move first (D-712).
 * @param {boolean} [options.onTurn]     Whether it is this creature's turn.
 *                                       The combatant is what knows (see
 *                                       below): outside it a Half-Action, an
 *                                       action and a Full Action are refused
 *                                       but for the at-once allowance, and the
 *                                       off hand by its own name.
 */
export function spend(budget, cost, { isAttack = false, isOffHand = false, isMove = false, onTurn = true } = {}) {
  const base = { half: 1, action: 2, full: 2, reaction: 0 }[cost];
  if (base === undefined) {
    return { ok: false, reason: BUDGET_REFUSALS.noSuchCost, params: { cost: String(cost) }, budget };
  }

  // **AND ONLY IN YOUR OWN TURN** (06 §1: *in a turn in which you Attack*).
  // `attacked` sits on the budget until the turn is reset, so the button on a
  // card the fight has moved past would have bought a free blow on somebody
  // else's turn - and a lone off-hand blow would have spent a Half-Action of a
  // turn that is not being taken. The card's own button is drawn only in the
  // attacker's turn now as well; this is the door, because a card is a record
  // of a moment and the press can come at any time (D-693).
  if (isAttack && isOffHand && !onTurn) {
    return { ok: false, reason: BUDGET_REFUSALS.offHandNotYourTurn, params: {}, budget };
  }

  // **THE OFF HAND RIDES THE ATTACK** (06 §1, D-711): *when you Attack with the
  // weapon in your main hand you may also make one attack with the weapon in
  // your off hand. It costs no Half-Action.* A lone off-hand blow in a turn
  // where nothing has been swung has nothing to ride, so it pays for itself —
  // the lead's ruling in the decision, and the only reading under which the off
  // hand is not simply a free extra attack every turn.
  const rides = isAttack && isOffHand && cost !== "reaction";
  const halves = rides ? (budget.attacked === true ? 0 : 1) : base;

  // **ONE OFF-HAND ATTACK A ROUND** (06 §2: *You may make one each round*),
  // asked BEFORE the Half-Actions so a second one is refused by its own rule
  // rather than by whatever else is short.
  const offHand = offHandLeft(budget);
  if (isAttack && isOffHand && offHand < 1) {
    return { ok: false, reason: BUDGET_REFUSALS.offHandSpent, params: {}, budget };
  }

  // A free Move is spent before the Half-Actions (02 §7's Sprint, D-712).
  const free = isMove ? Math.min(halves, freeMovesLeft(budget)) : 0;
  const owed = halves - free;

  // **OUTSIDE YOUR OWN TURN, ONLY THE REACTION** (05; the lead, 2026-10-23:
  // *"Refuse off-turn Half-Actions"*). The budget keeps a turn's unspent
  // Half-Actions until the creature's next turn resets it, so a Use pressed on
  // somebody else's turn spent them. Refused here - the one judgement every door
  // reaches (`AzerothCombatant#spendAction`, `workflows.turnBudgetRefusal`, the
  // walk's `chargeMoves`) - before anything is spent, unless the Half-Actions owed
  // were given to be taken AT ONCE (`grantAtOnce`). A Full Action is a turn's
  // whole and is never taken at once. Asked BEFORE the Half-Actions, so a turn with
  // none left says it is not this creature's turn rather than that it is short.
  const atOnce = atOnceLeft(budget);
  const offTurn = onTurn === false && cost !== "reaction";
  if (offTurn && (cost === "full" || owed < 1 || owed > atOnce)) {
    return { ok: false, reason: BUDGET_REFUSALS.notYourTurn, params: {}, budget };
  }

  if (cost === "reaction") {
    if (budget.reactions < 1) return { ok: false, reason: BUDGET_REFUSALS.noReaction, params: {}, budget };
  } else if (budget.halfActions < owed) {
    return { ok: false, reason: BUDGET_REFUSALS.needsHalves, params: { n: owed }, budget };
  }

  // A Full Action takes both Half-Actions AND the Reaction (D-255).
  if (cost === "full" && budget.reactions < 1) {
    return { ok: false, reason: BUDGET_REFUSALS.fullTakesReaction, params: {}, budget };
  }

  return {
    ok: true,
    reason: null,
    params: null,
    budget: {
      ...budget,
      halfActions: budget.halfActions - owed,
      reactions: budget.reactions - (cost === "reaction" || cost === "full" ? 1 : 0),
      freeMove: freeMovesLeft(budget) - free,
      offHandAttacks: isAttack && isOffHand ? Math.max(0, offHand - 1) : offHand,
      // Only a MAIN-HAND blow is something to ride; an off-hand one is the
      // passenger and never becomes the thing that carries the next.
      //
      // **AND ONLY A BLOW BOUGHT WITH A HALF-ACTION.** 06 §1 gives the off hand
      // *in a turn in which you Attack*, and an Opportunity Attack or a Riposte
      // is struck on somebody else's turn with the Reaction: counting one as
      // something to ride handed a free off-hand blow to anybody who had been
      // walked past. The card draws no button for a Reaction's blow either, and
      // this is the rule behind that.
      attacked: budget.attacked === true || (isAttack && !isOffHand && cost !== "reaction"),
      // The at-once allowance, where the budget holds the key: spent first by a
      // spend outside the turn, and never more than the Half-Actions left. A budget
      // that never had one is written exactly as before.
      ...("atOnce" in (budget ?? {}) ? {
        atOnce: Math.max(0, Math.min(atOnce - (offTurn ? owed : 0), budget.halfActions - owed))
      } : {})
    }
  };
}

/**
 * **A HALF-ACTION GIVEN TO BE TAKEN AT ONCE** (the lead's *"Refuse off-turn
 * Half-Actions"*, and its two exceptions): 04's Remote Control at rank 2, *one of
 * your constructs within 60 feet takes a Half-Action at once* - on the construct's
 * own budget, while the shared turn's record carries its `extra`
 * (`rules/constructs.mjs#sharedTurnGranted`); and 05's Ready, *When the trigger
 * occurs, spend your Reaction to take it* - the Half-Action the Ready paid for, on
 * the readier's budget once the trigger's Reaction is spent
 * (`applications/combat-actions.mjs#takeReadied`), so the doors the action is taken
 * through charge nothing more. A Half-Action gained, which `spend` lets a door take
 * outside the turn; the turn's reset takes an unspent one away with the turn.
 *
 * @param {object} budget
 * @param {number} [n]
 * @returns {object}  the budget with the Half-Actions added and marked
 */
export function grantAtOnce(budget, n = 1) {
  const add = Math.max(0, Math.trunc(Number(n)) || 0);
  const gained = gainHalfActions(budget, add);
  return { ...gained, atOnce: atOnceLeft(budget) + add };
}

/**
 * **A HALF-ACTION GAINED** (04's Rampage: *When an attack or effect of yours
 * reduces a target to 0 Health, gain a Half-Action*; Follow Through at rank 2;
 * D-772). Not `restore`, which is the GM's undo and capped at the turn's two: a
 * gain is the talent's own and may take the turn past two. The turn's reset
 * takes an unspent one away with the turn, as it takes a free Move (D-712).
 *
 * @param {object} budget
 * @param {number} [n]
 * @returns {object}  the budget with the Half-Actions added
 */
export function gainHalfActions(budget, n = 1) {
  const b = budget && typeof budget === "object" ? budget : freshTurn();
  const add = Math.max(0, Math.trunc(Number(n)) || 0);
  return { ...b, halfActions: Math.max(0, Math.trunc(Number(b.halfActions)) || 0) + add };
}

/**
 * **THE REACTION LOST** (04's Concussive Shot at rank 2, Waylay and Paralytic;
 * D-773): the Reaction the budget holds, spent to nothing - and nothing else. 06
 * §6's Reaction *refreshes at the start of your turn*, so the turn's own reset
 * gives it back. Never a refusal: a creature with none left loses none.
 *
 * @param {object} budget
 * @returns {object}
 */
export function withoutReaction(budget) {
  const b = budget && typeof budget === "object" ? budget : freshTurn();
  return { ...b, reactions: 0 };
}

/**
 * **THE REACTION A WITHDRAWN HIT TOOK, GIVEN BACK** (the Legacy branches' door 13:
 * a hit turned into a miss withdraws everything it laid - a Bash's, a Concussive
 * Shot's lost Reaction). 06 §6's *one Reaction per round*: back to one, never
 * past it. Whether one was taken by THIS blow is the card's record
 * (`rules/miss.mjs#missUndoes`); this only writes the number.
 *
 * @param {object} budget
 * @returns {object}
 */
export function withReactionBack(budget) {
  const b = budget && typeof budget === "object" ? budget : freshTurn();
  return { ...b, reactions: Math.max(1, Math.trunc(Number(b.reactions)) || 0) };
}

/**
 * Put a Half-Action or the Reaction back (D-718): the GM's undo on the tracker,
 * for a spend the table decided did not happen.
 *
 * Capped at the turn's own maximum, so a restore is never a way to buy a third
 * Half-Action, and it refuses rather than silently doing nothing — a control
 * that greys out with no words is the fault this system keeps fixing.
 *
 * @param {object} budget
 * @param {"half"|"reaction"} cost
 */
export function restore(budget, cost) {
  if (cost === "half") {
    if ((budget?.halfActions ?? 0) >= HALF_ACTIONS_PER_TURN) {
      return { ok: false, reason: BUDGET_REFUSALS.nothingToRestore, params: {}, budget };
    }
    return {
      ok: true, reason: null, params: null,
      budget: { ...budget, halfActions: Math.min(HALF_ACTIONS_PER_TURN, (budget.halfActions ?? 0) + 1) }
    };
  }
  if (cost === "reaction") {
    if ((budget?.reactions ?? 0) >= REACTIONS_PER_TURN) {
      return { ok: false, reason: BUDGET_REFUSALS.nothingToRestore, params: {}, budget };
    }
    return {
      ok: true, reason: null, params: null,
      budget: { ...budget, reactions: Math.min(REACTIONS_PER_TURN, (budget.reactions ?? 0) + 1) }
    };
  }
  return { ok: false, reason: BUDGET_REFUSALS.noSuchCost, params: { cost: String(cost) }, budget };
}

// Momentum decay lives with the rest of the pool's rules (D-627); re-exported
// so the combat document and its tests keep their import.
export { momentumAfter } from "./momentum.mjs";

/**
 * A surprised combatant takes no turn in round one and holds no Reaction until
 * their side's first turn has ended (06).
 */
export function isActingThisRound({ surprised = false, round = 1 } = {}) {
  return !(surprised && round === 1);
}
