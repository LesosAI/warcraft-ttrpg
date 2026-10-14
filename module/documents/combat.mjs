/**
 * AzerothCombat and AzerothCombatant — the side-based tracker (D2 §7).
 *
 * Core assumes a per-combatant initiative order and sorts on a rolled number.
 * This system has neither: **initiative is never rolled** (D-256) and **the
 * sides alternate** — everybody on one side, then everybody on the other. So
 * the sort is replaced, not merely configured.
 *
 * The arithmetic lives in `rules/initiative.mjs`; this is the Foundry wrapper.
 */

// Shadowform's mark, cleared at the end of the holder's own turn (D-774).
import { clearLightUsed } from "../effects/shadowform.mjs";
import {
  freshTurn,
  gainHalfActions,
  initiativeFor,
  loseTurn,
  restore,
  spend,
  turnOrder,
  withoutReaction
} from "../rules/initiative.mjs";
import { drainAtRoundEnd, fightStart, idleDecay, leaveFightPools } from "../rules/momentum.mjs";
import { bleedTick, scorchTick, sustainLimit, upkeep } from "../rules/turn-effects.mjs";
import { liftSpellEffects } from "../dice/workflows.mjs";
import { AZEROTH } from "../config.mjs";
import { gateHolds } from "../rules/ability-automation.mjs";
import { bondOf, boundOf, endBoundEncounter } from "./bound.mjs";
// 06 §5's departure and 06 §6's Reaction (D-694).
import { canReact, provokes } from "../rules/reactions.mjs";
// The Warrior's turn-start Health (04's Blood Craze) and a heal Mortal Strike
// blocks (D-772).
import { fleetFootedFor, turnStartHealFor } from "../rules/class-talents.mjs";
// D-779: 04's Bracing, laid at the end of a turn without a move.
import { bracingFor } from "../rules/class-talents.mjs";
import { bracingAmount } from "../rules/class-answers.mjs";
import { layBracing } from "../effects/class-answers.mjs";
// The Mage's and the Warlock's (D-775): a Sustain held for free, and Siphon's
// Health at the turn's start.
import { SIPHON_FLAG, siphonFor, siphonHeal, upkeepFor } from "../rules/class-talents.mjs";
// 04's Fleet Footed (D-773): the Defense a walk of ten feet lays, until the
// mover's next turn.
import { layFleetFooted } from "../effects/talent-states.mjs";
import { untilNextTurn } from "../effects/durations.mjs";
import { healingAfterBlock } from "../rules/no-healing.mjs";
// Where a departure is measured from: the nearest spaces, never the centres,
// in three dimensions (D-732); and the one reading of a threatener's reach.
import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";
import { reachOfActor } from "../canvas/engaged.mjs";
// What a turn's Half-Actions pay for in feet (05 §10, D-718), charged at core's
// measured COST so Difficult ground, a climb and a swim cost two feet a foot
// (D-757) - step by step, and never by a creature whose Speed is held at 0.
// The charge worked out whole and written once (D-761), and what the same
// judgement still allows a move to spend (D-762). On a grid a step is charged
// by the squares it enters (D-764).
import {
  MOVEMENT_UNMETERED, actionOf, askedAction, chargeMoves, creatureMoved, measuredStep, meteredFeet, movementAllowed, movementLeft, movesNeeded,
  paceFor, pacedByNature, squareFeet, stoppedBy, unmetered
} from "../rules/movement.mjs";
// Whether a creature swims by nature, and how fast (the final review of D-757).
import { movementFactsOf } from "../canvas/behaviors.mjs";
import { movementLimited } from "../settings.mjs";
// Hiding ends when the fight does (D-717).
import { reveal } from "../effects/stealth.mjs";
import { manaPool } from "../rules/pools.mjs";
// A poison's minute (08 §12, D-719).
import { coatingEndsWithFight, coatingExpired, coatingStartsIn } from "../rules/consumables.mjs";
import { reactionStateOf } from "../applications/actions.mjs";
// An area that strikes at the start of a turn (D-756): the law, what the
// creature is, who it is to the caster, what the caster stands on, and the
// sweep that takes an area away when its spell has gone.
import { checksFor, hasAreaTick, holdsPoint, shapeCentre, tickFor } from "../rules/area-ticks.mjs";
import { spellAreaFor } from "../rules/talent-effects.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import {
  actorOf, areaRecord, armAreas, casterTokenOn, growAreas, isDown, staleIn, sweepFightAreas, worldClock
} from "../canvas/sustained-areas.mjs";
// What an area does to a creature (D-756, D-757): the one door its damage and
// healing land through, the Resist card its Tests post, and the one reading of
// what a creature is and who it is to the caster.
import { kindsOfActor, postAreaTest, relationTo, strikeFromArea } from "../effects/area-strikes.mjs";
// Damage or healing laid on the creature itself, at the start of its turn (D-770).
import { landTicks } from "../effects/ticks.mjs";
// The round's record of the riders spent and paid before the blow (D-770).
import { roundOnce, roundRiders, roundStruck } from "../rules/riders.mjs";
// Whether a creature and an area are still in the world after the turn's awaits.
import { regionInWorld, tokenInWorld } from "../canvas/in-world.mjs";
import { halvedHealing } from "../rules/auras.mjs";
// Which combatant writes may leave the fight's turn alone (D-765).
import { leavesTurnAlone } from "../rules/turn-stamp.mjs";
// The budget's writes one at a time, never held behind one that does not answer
// (D-761; the final review).
import { WRITE_PATIENCE_MS, writeQueue } from "../rules/write-queue.mjs";
// THE CROSS-CLASS RULINGS (D-778): a Sustain's upkeep by its entry, Void Rift's pull
// at a turn's start, and the Test 07 gives a held or Stunned creature.
import { upkeepCost, upkeepOf } from "../rules/upkeep.mjs";
import { cleanForced } from "../rules/forced-movement.mjs";
import { forceMove, forcedWords, regionCentreOf } from "../effects/forced-movement.mjs";
import { escapesDue } from "../rules/escapes.mjs";

/** An area's forced move at a turn's start (07's Void Rift; D-778), off the Region's own record. */
function turnForced(region) {
  const forced = cleanForced(region?.flags?.["azeroth-rpg"]?.forced ?? null);
  return forced?.on === "turn" ? forced : null;
}

/**
 * **EVERY TURN-BUDGET WRITE THIS CLIENT MAKES FOR A COMBATANT, ONE AT A TIME**
 * (D-761; the lead, 2026-09-29: *Fix it in the system*).
 *
 * A write reads the budget, works out the next one and sends it, and until the
 * server answers, the document still holds the OLD budget. `spendMovement`
 * awaited a Half-Action for each Move and wrote the Moves paid after it, so a
 * second move whose charge began between the two read the Half-Action as spent
 * and the Move as unpaid, and paid again: two quick steps - a keyboard's on a
 * slow connection, or a 3D view's - cost two Half-Actions for ten feet. A Guard
 * or an attack spent beside a charge in flight read the budget the charge was
 * about to replace, and was lost with it.
 *
 * So the movement charge, a Half-Action or Reaction spent, a Half-Action put
 * back, Disengage's Move and a lost turn each wait for the one before them on
 * this client to have LANDED, and each reads the budget afresh when its turn
 * comes. **A turn's reset is not among them** (`resetBudget`): it is one write,
 * and it stays the turn boundary it always was. Keyed by the combatant's uuid,
 * in memory, on this client alone: the
 * charge runs on the mover's own client (`onMoveToken`), and two users writing
 * one combatant at the same moment is the table's to sort out, as it always
 * was. A task that throws hands its error to its own caller and the next task
 * still runs.
 *
 * **AND A WRITE THAT NEVER ANSWERS HOLDS THE REST FOR TEN SECONDS, NOT FOR
 * EVER** (the final review of D-761, 2026-09-30). Core's socket request has no
 * timeout and the socket.io client it ships drops a plain acknowledgement when
 * the connection closes, while core reloads only after an outage of five
 * seconds or more: a shorter blip during a budget write left that write's
 * promise pending for good, and every later charge, spend, restore and lost
 * turn for the combatant - an attack waiting on `spendAction` among them - hung
 * behind it until F5. The queue (`rules/write-queue.mjs`) waits on each write
 * for `WRITE_PATIENCE_MS` from the moment it starts, then lets the next one go
 * and says so, once, in words; the stalled write's own caller is left waiting
 * exactly as core leaves it.
 */
const budgetWrites = writeQueue({
  patienceMs: WRITE_PATIENCE_MS,
  onStall: combatant => {
    const seconds = WRITE_PATIENCE_MS / 1000;
    console.warn(`azeroth-rpg | a turn budget write for ${combatant?.uuid ?? "a combatant"} had no answer from the server in ${seconds}s; the next goes ahead without it (D-761)`);
    ui.notifications?.warn(game.i18n.format("AZEROTH.Combat.BudgetWriteStalled", { name: combatant?.name ?? "", seconds }));
  }
});

/**
 * Run a budget write after every one queued before it for this combatant has
 * landed, thrown, or gone ten seconds without an answer.
 *
 * @param {Combatant} combatant
 * @param {() => Promise<*>} task  reads the budget itself, when it runs
 * @returns {Promise<*>}  what the task returns
 */
function oneAtATime(combatant, task) {
  return budgetWrites.run(combatant?.uuid ?? combatant?.id ?? "", task, combatant);
}

export class AzerothCombatant extends Combatant {
  /**
   * **A LATE BOOKKEEPING WRITE NEVER PUTS THE TURN BACK** (D-765; the lead,
   * 2026-09-30: *Fix it*).
   *
   * Core stamps every combatant update with `combatTurn`, the index of the
   * creature whose turn it is as THIS client sees it when the write is prepared
   * (`client/documents/combatant.mjs` L249-259, 14.367); the server writes that
   * index into the fight and every client applies it with no turn event. A
   * move's charge prepared as the GM clicks Next Turn, or a turn's reset still
   * in flight when the next click lands, arrives after the turn has moved and
   * puts the tracker back on the creature before - on the 2D board too.
   *
   * So the stamp core just added is taken off a write that touches nothing but
   * the system's fight bookkeeping (the budget, the Moves paid, `acted`, the
   * round's record: `rules/turn-stamp.mjs#BOOKKEEPING_FLAGS`) AND lands on a
   * fight whose standing order is the one a set-up would make now
   * (`leavesTurnAlone`). Such a write cannot reorder the turns, so the stamp
   * only ever restated the turn, and a stale one restated the wrong turn.
   * **Everything else keeps it**: `initiative`, the `side` flag, `defeated`,
   * `hidden`, any core field, a write on a fight whose live order moved under
   * it (a mid-round Initiative change, which core re-sorts on the next
   * combatant write), and a turn the caller named itself.
   *
   * The write itself is untouched: D-761's single write and its queue run
   * exactly as before, and core's `turnEvents: false` stays on it.
   *
   * @override
   */
  static async _preUpdateOperation(documents, operation, user) {
    // A turn the CALLER named (core's `rollInitiative` with `updateTurn: false`)
    // is the caller's, and never ours to take off.
    const named = operation?.combatTurn !== undefined;
    const allowed = await super._preUpdateOperation(documents, operation, user);
    if (allowed === false || named || !operation || !("combatTurn" in operation)) return allowed;
    const combat = operation.parent ?? null;
    const standing = Array.isArray(combat?.turns) ? combat.turns.map(t => t?.id ?? null) : null;
    const live = typeof combat?._order === "function" ? combat._order() : null;
    // DELETED, never set to undefined: the server asks `"combatTurn" in operation`.
    if (leavesTurnAlone(operation.updates, { standing, live })) delete operation.combatTurn;
    return allowed;
  }

  /**
   * Which side this combatant fights on. Token disposition is the honest
   * source: FRIENDLY and SECRET act with the party, HOSTILE against it, and
   * NEUTRAL is the GM's call — defaulted to hostile so a neutral creature
   * never silently joins the players' side.
   */
  get side() {
    // A GM override wins: 06 leaves a NEUTRAL creature's side to the table,
    // and a summoned ally or a turncoat mid-fight has to be movable without
    // editing its token.
    const override = this.getFlag("azeroth-rpg", "side");
    if (override === "friendly" || override === "hostile") return override;

    // The Party fights with the party whatever its token says (2026-09-06),
    // and so does a creature bound to one of them (D-643).
    const actor = this.actor;
    if (actor?.isParty) return "friendly";
    const bondOwner = actor?.getFlag?.("azeroth-rpg", "bond")?.ownerUuid;
    if (bondOwner && game.actors.get(bondOwner.split(".").pop())?.isParty) return "friendly";

    const d = this.token?.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;
    return d === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? "friendly" : "hostile";
  }

  /** Put this combatant on a side, or clear the override. */
  async setSide(side) {
    if (side === null) return this.unsetFlag("azeroth-rpg", "side");
    return this.setFlag("azeroth-rpg", "side", side);
  }

  /**
   * Initiative is DERIVED, not rolled: `10 + Dex modifier + talents`.
   * Overriding `getInitiativeRoll` would still produce a roll; this produces a
   * number and nothing else.
   */
  get derivedInitiative() {
    const system = this.actor?.system;
    if (!system) return 10;
    if (this.actor.type === "npc") {
      // A bound creature acts on its owner's Initiative (D2 §7, D-643).
      const bond = bondOf(this.actor);
      const owner = bond?.ownerUuid ? fromUuidSync(bond.ownerUuid) : null;
      if (owner?.system?.abilities) return owner.system.initiative ?? initiativeFor({ dexMod: owner.system.abilities.dex?.mod ?? 0 });
      return system.initiative ?? 10;
    }
    // **THE MODEL'S OWN NUMBER, NOT A SECOND SUM** (2026-09-10).
    // `CharacterData#prepareDerivedData` computes `system.initiative` through
    // the same `initiativeFor`, with whatever a worn thing grants (08 §20's
    // `+N Initiative`); recomputing it here off the Dex modifier alone threw
    // that bonus away and the tracker disagreed with the sheet. The fallback
    // is for a character whose data has not been prepared.
    return system.initiative ?? initiativeFor({ dexMod: system.abilities?.dex?.mod ?? 0 });
  }

  /**
   * The turn budget: two Half-Actions plus one Reaction (D-012).
   *
   * **There is no Attack counter to build** (05 §10, D-711): each Half-Action
   * may be an Attack, so a Boss needs no exemption and the weight class no
   * longer travels with the budget. What does travel is the free Move a
   * feature grants (D-712), because only the combatant knows whether this is
   * its first turn of the fight.
   */
  get budget() {
    return this.getFlag("azeroth-rpg", "budget") ?? freshTurn(this._turnFacts());
  }

  async resetBudget() {
    // The turn's movement starts over with its budget (2026-09-06) - in the
    // SAME write (D-761): between the two it used to take, the limit read the
    // old turn's Half-Actions left beside no Moves paid and refused a move the
    // new turn could pay for.
    //
    // **AND NOT QUEUED** (D-761), deliberately: the reset is the turn boundary,
    // written the moment the turn's events reach it and diffed against the
    // turn as it stands then, as it always was. Queued behind a Half-Action
    // spent while the fight's first turn was still opening, it landed after
    // that spend and wiped it - three batches spend exactly then - which is a
    // turn-boundary rule the lead did not ask to change.
    const flags = { budget: freshTurn(this._turnFacts()) };
    if (this.getFlag("azeroth-rpg", "moveHalves")) flags.moveHalves = foundry.data.operators.ForcedDeletion.create();
    return this.update({ flags: { "azeroth-rpg": flags } });
  }

  /** What `freshTurn` reads off the creature: 02 §6's feature and 02 §7's free Move. */
  _turnFacts() {
    return {
      extraAttack: this._hasExtraAttack(),
      freeMove: this._freeMoves()
    };
  }

  /**
   * Moves this turn that cost no Half-Action (02 §7's Sprint, D-712):
   * *on your first turn of a fight you may Move once without spending a
   * Half-Action.*
   *
   * **The first turn is the one before `acted` is set** — the flag lands at
   * `_onEndTurn` and `_leaveFight` clears it with the rest — so this is true
   * for exactly one turn of each fight, and the assumption the lead may
   * overturn is that a Sprint unspent is a Sprint lost.
   *
   * The number comes off the FEATURES the actor holds, never off a class
   * name: `rules/class-features.mjs` stamps `freeMove` and the sync writes it,
   * so a talent that ever grants one is read here without a second branch.
   */
  _freeMoves() {
    if (this.getFlag("azeroth-rpg", "acted") === true) return 0;
    let most = 0;
    for (const item of this.actor?.items ?? []) {
      if (item.type !== "feature") continue;
      const n = Math.trunc(Number(item.system?.freeMove ?? 0)) || 0;
      if (n > most) most = n;
    }
    return most;
  }

  /**
   * A token's movement spends the turn's Half-Actions (06 §6; the lead,
   * 2026-09-06): the first Speed's worth of feet this turn is one Move, the
   * next another. Read off core's movement history, which it clears at the
   * start of each turn (verified at 14.367:
   * Combat#_clearMovementHistoryOnStartTurn), so the distance is the turn's
   * whole and not this drag's alone. Only on the mover's own turn, and only on
   * the moving user's client.
   *
   * **THE DRAG ITSELF IS REFUSED NOW** (D-718): `onPreMoveToken` below stops a
   * move the budget cannot pay for before it happens, so the warning here is
   * the backstop for a move that got through - the world setting off, a forced
   * move, a drag the pre-hook did not see - and not the rule any more.
   *
   * **THE PACE IS THE MOVE'S OWN** (14 §1, D-718): a creature that flies has
   * two, and v14 names which one is being used on every waypoint, so
   * `rules/movement.mjs#paceFor` reads it off the movement rather than off a
   * guess. A ground Speed of 30 charged a dragon two Half-Actions for one beat
   * of its wings before this.
   *
   * **THE FEET ARE CORE'S COST, NOT ITS DISTANCE** (D-757): 05 §10 charges two
   * feet for every one crossed on Difficult ground, and a climb, a swim and a
   * crawl the same. `rules/movement.mjs#meteredFeet` reads core's measured
   * `cost` STEP BY STEP (`movementSteps`, the final review of D-757), and **on a
   * grid a step is the squares it enters** (D-764; the lead: *squares entered*):
   * a step inside one square is free, drawn or not, and where core measured no
   * cost (an unrendered token, a waypoint recorded with no cost) the squares
   * entered are charged at the scene's grid distance, never the distance walked.
   * A gridless scene has no squares and is charged the distance, as before.
   *
   * **A pace brought to 0 buys nothing** (the final review of D-757): an
   * Entangled creature's move that got past the limit - the world setting off -
   * is said and charged nothing, since no Move carries it a foot. A creature
   * with no pace by nature (a totem) is charged nothing and told nothing.
   *
   * **ONE CHARGE AT A TIME, WRITTEN ONCE** (D-761; the lead, 2026-09-29: *Fix
   * it in the system*). The move is measured now, at its own pace, off the
   * movement core handed over; what it costs is worked out when the charge
   * before it on this client has landed (`oneAtATime`), off the budget and the
   * Moves paid as they are THEN, and the two are written in one update. The
   * turn's history is inside every move's own `meteredFeet`, so a second
   * overlapping move owes only what the whole walk needs beyond what the first
   * paid, and two quick steps of ten feet cost one Half-Action, not two.
   *
   * @param {TokenMovementOperation} movement
   * @returns {Promise<number|null>}  the Moves the turn has paid for once this
   *   move is charged; null for a creature with no pace by nature
   */
  async spendMovement(movement) {
    const actor = this.actor;
    if (!this._pacedByNature()) return null;
    const speed = this._pace(movement);
    const steps = movementSteps(this.token, movement);
    const total = meteredFeet(movement, steps);
    const charged = await oneAtATime(this, async () => {
      const paid = this.getFlag("azeroth-rpg", "moveHalves") ?? 0;
      if (!(speed > 0)) {
        if (total > 0) ui.notifications?.warn(game.i18n.format("AZEROTH.Combat.MovedPast", { name: actor.name, feet: Math.round(total), speed: 0 }));
        return paid;
      }
      // **THE CEILING IS THE ONE THE LIMIT USES** (D-718), so a drag the rule
      // allows is a drag the budget pays for. It was a flat two, which is 05
      // §10's Half-Actions and not the count of MOVES a turn can hold: 02 §7's
      // Sprint adds one that costs no Half-Action, so a Rogue's first turn holds
      // three - and a flat two charged two of them and left the third free.
      const needed = movesNeeded({ spent: total, pace: speed, halves: this.movementVerdict(movement, steps).halves });
      // `isMove` inside `chargeMoves` is what lets Sprint's free Move pay for the
      // first one (D-712); without it the free Move on the budget would be
      // written and never read.
      const charge = chargeMoves(this.budget, { paid, needed, onTurn: this.isCurrentTurn });
      if (charge.refusal) ui.notifications?.warn(game.i18n.format(charge.refusal.reason, charge.refusal.params ?? {}));
      // A fight ended under the move has no budget left to write to.
      if (charge.paid !== paid && this.parent?.combatants?.has(this.id) && game.combats?.has(this.parent.id)) {
        await this.update({ flags: { "azeroth-rpg": { budget: charge.budget, moveHalves: charge.paid } } });
      }
      if (total > speed * Math.max(charge.paid, 1) && charge.paid < needed) {
        ui.notifications?.warn(game.i18n.format("AZEROTH.Combat.MovedPast", { name: actor.name, feet: Math.round(total), speed }));
      }
      return charge.paid;
    });
    // **04's FLEET FOOTED** (*While you have moved at least 10 feet this turn,
    // your Defense rises by 1 per rank until your next turn*; D-773): the turn's
    // metered feet, on the mover's own actor, AFTER the queue has answered (the
    // architect's review): the budget's queue holds budget writes alone, and an
    // actor write awaited inside it held every later spend behind it.
    // `layFleetFooted` keeps two walks landing together from laying two.
    if (this.isCurrentTurn && actor?.type === "character" && actor.isOwner) {
      const fleet = fleetFootedFor(actor.takenTalents?.() ?? [], { feet: total });
      if (fleet) await layFleetFooted(actor, { defense: fleet.defense, name: fleet.name, span: untilNextTurn(actor) });
    }
    return charged;
  }

  /**
   * The pace this move is made at (05 §10, 14 §1; D-718): the ground Speed, or
   * the flying one where the move's own action says `fly` and the creature has
   * one. A character's `system.flyingSpeed` is stored and nullable; a
   * creature's is derived from its tier (`rules/size.mjs#flyingPace`).
   *
   * **And the swimming one** (the final review of D-757): a creature that swims
   * at its Speed or twice it (`movementFactsOf`'s `swims`) swims at that, off
   * the Speed as it stands now. **Nothing at all** while Entangled or Prone
   * hold its Speed at 0 (A1; `rules/movement.mjs#STOPPING_CONDITIONS`), on the
   * ground, in the air or in the water.
   * @param {object} movement
   */
  _pace(movement) {
    const actor = this.actor ?? null;
    const system = actor?.system ?? {};
    return paceFor({
      speed: system.speed ?? 0,
      flyingSpeed: system.flyingSpeed ?? null,
      swims: movementFactsOf(actor).swims,
      stopped: stoppedBy(actor?.statuses ?? [])
    }, actionOf(movement));
  }

  /**
   * Whether this creature has a pace by its own nature: its race's or its
   * block's Speed (`rules/movement.mjs#pacedByNature`). A totem has none and
   * is never judged; a creature brought to 0 has one and cannot use it.
   */
  _pacedByNature() {
    return pacedByNature(this.actor?.system?.speedParts ?? []);
  }

  /**
   * Whether the turn's Half-Actions pay for this drag (05 §10, D-718).
   *
   * The judgement is `rules/movement.mjs#movementAllowed` and this only reads
   * the state: what moving has already cost this turn, what the budget still
   * holds, 02 §7's free Move, and whether the creature has a pace by nature.
   * @param {object} movement
   * @param {object|null} [steps]  `movementSteps`, where the caller measured them already
   */
  movementVerdict(movement, steps = movementSteps(this.token, movement)) {
    return movementAllowed(this._movementFacts(movement, steps));
  }

  /**
   * **WHAT THE LIMIT JUDGES A MOVE BY** (05 §10; D-718, D-757): the feet the
   * turn has spent with this move included, the pace the move is made at, and
   * the Moves the turn holds - paid, still in the budget, and free.
   *
   * The one gathering both the verdict and the feet-left door read
   * (`remainingMovement`, D-762), so the two cannot judge different turns. The
   * budget and the Moves paid are written in ONE update (D-761), so no read
   * here sees a Half-Action spent beside a Move not yet paid for.
   *
   * @param {object} movement
   * @param {object|null} steps  `movementSteps`, or null to meter each section whole
   */
  _movementFacts(movement, steps) {
    const budget = this.budget;
    return {
      // The feet of movement SPENT, at core's cost (D-757), never the distance.
      distance: meteredFeet(movement, steps),
      pace: this._pace(movement),
      unpaced: !this._pacedByNature(),
      paid: this.getFlag("azeroth-rpg", "moveHalves") ?? 0,
      halfActionsLeft: budget.halfActions ?? 0,
      freeMove: budget.freeMove ?? 0
    };
  }

  /** Whether the fight is standing on this combatant's turn right now. */
  get isCurrentTurn() {
    const current = this.combat?.combatant ?? null;
    return Boolean(current) && current.id === this.id;
  }

  /**
   * Spend from the budget, refusing with a reason rather than silently.
   *
   * **The rule returns an i18n key and its params** (D-711); this is where they
   * become a sentence. They were raw English toasts until then, which is a
   * hardcoded user-facing string in the one place the reader always sees.
   *
   * **WHOSE TURN IT IS COMES FROM HERE** (06 §1). The budget is pure and knows
   * only what it is handed, and the one thing on it that outlives the turn is
   * the fact an Attack was made - so an Off-Hand Attack pressed from an old
   * card rode a blow struck two turns ago until the combatant said which turn
   * this is. A caller may override it, and nothing does.
   *
   * **AFTER EVERY WRITE QUEUED BEFORE IT** (D-761): the budget is read when the
   * spend's turn comes, so a Guard beside a move whose charge is still landing
   * spends off what the charge left rather than off what it replaced.
   *
   * @param {"half"|"action"|"full"|"reaction"} cost
   */
  async spendAction(cost, options = {}) {
    return oneAtATime(this, async () => {
      const result = spend(this.budget, cost, { ...options, onTurn: options.onTurn ?? this.isCurrentTurn });
      if (!result.ok) {
        ui.notifications?.warn(game.i18n.format(result.reason, result.params ?? {}));
        return result;
      }
      await this.setFlag("azeroth-rpg", "budget", result.budget);
      return result;
    });
  }

  /**
   * **A HALF-ACTION PAID AS A MOVE, BEFORE THE WALK IT BUYS** (05, D-694):
   * Disengage's. The budget and the Moves paid are written in ONE update
   * (D-761), queued with every other budget write, so the limit never reads
   * the Half-Action spent and the Move unpaid.
   *
   * **The Move is counted whatever the turn already holds** (D-761). It was
   * capped at 05 §10's two, which is D-718's flat two in a second writer: a
   * Sprinting Rogue who had walked sixty feet and then Disengaged paid a
   * Half-Action for a Move the count dropped, and could not take the step the
   * Disengage bought. `paid + halfActionsLeft + freeMove` is the turn's Moves
   * and a Move bought with a Half-Action moves one from the second to the first.
   *
   * @returns {Promise<{ok: boolean, reason: string|null, params: object|null, budget: object}>}
   */
  async spendMoveAction() {
    return oneAtATime(this, async () => {
      const result = spend(this.budget, "half", { onTurn: this.isCurrentTurn });
      if (!result.ok) {
        ui.notifications?.warn(game.i18n.format(result.reason, result.params ?? {}));
        return result;
      }
      const paid = this.getFlag("azeroth-rpg", "moveHalves") ?? 0;
      await this.update({ flags: { "azeroth-rpg": { budget: result.budget, moveHalves: paid + 1 } } });
      return result;
    });
  }

  /**
   * **THE REST OF THE TURN LOST** (07's area Tests, D-757): every Half-Action
   * and free Move gone, the Reaction kept (`rules/initiative.mjs#loseTurn`).
   * Queued with every other budget write (D-761).
   */
  async loseTurn() {
    return oneAtATime(this, () => this.setFlag("azeroth-rpg", "budget", loseTurn(this.budget)));
  }

  /**
   * **ONE MOVE THIS TURN THAT COSTS NO HALF-ACTION** (04's Feral Charge, D-770):
   * *spend 2 Ferocity to move up to your Speed*, granted when the attack that
   * paid for it rolls. D-712's door - the `freeMove` 02 §7's Sprint carries - so
   * the walk is charged, metered and judged as every walk is, and the turn's
   * reset takes an unspent one away with the turn. Queued with every other
   * budget write and read when its turn comes (D-761).
   *
   * @param {number} [n]
   */
  async grantFreeMove(n = 1) {
    return oneAtATime(this, async () => {
      const budget = this.budget;
      const held = Math.max(0, Math.trunc(Number(budget?.freeMove)) || 0);
      return this.setFlag("azeroth-rpg", "budget", { ...budget, freeMove: held + Math.max(0, Math.trunc(Number(n)) || 0) });
    });
  }

  /**
   * **A HALF-ACTION GAINED** (04's Rampage: *When an attack or effect of yours
   * reduces a target to 0 Health, gain a Half-Action*; Follow Through at rank 2;
   * D-772). The talent's own, not the GM's undo (`restoreAction`), so it is
   * anybody's to write who owns the combatant and it may take the turn past two
   * (`rules/initiative.mjs#gainHalfActions`); the turn's reset takes an unspent
   * one away. Queued with every other budget write and read when its turn comes
   * (D-761): the combatant's eighth budget door.
   *
   * @param {number} [n]
   */
  async grantHalfActions(n = 1) {
    return oneAtATime(this, async () => this.setFlag("azeroth-rpg", "budget", gainHalfActions(this.budget, n)));
  }

  /**
   * **THE REACTION LOST** (04's Concussive Shot at rank 2, Waylay, Paralytic;
   * D-773): the one this combatant holds, spent, and nothing else
   * (`rules/initiative.mjs#withoutReaction`). 06 §6's Reaction refreshes at the
   * start of the creature's own turn, so the loss holds until then. Queued with
   * every other budget write and read when its turn comes (D-761): the
   * combatant's ninth budget door. Answers whether a Reaction went.
   *
   * @returns {Promise<{lost: boolean}>}
   */
  async loseReaction() {
    return oneAtATime(this, async () => {
      const budget = this.budget;
      if (!((Number(budget?.reactions) || 0) > 0)) return { lost: false };
      await this.setFlag("azeroth-rpg", "budget", withoutReaction(budget));
      return { lost: true };
    });
  }

  /**
   * **A RIDER'S ONCE-A-ROUND MARK** (04's Feral Charge, D-770), written into
   * the round's own record beside 08 §5's Fast and a Signature's `per` rows,
   * which `_onStartRound` clears. Queued with the budget's writes (D-761) and
   * read when its turn comes (`rules/riders.mjs#roundRiders`), so two doors in
   * flight cannot each find the round unspent: what it ANSWERS is the riders
   * this write marked that were not marked before, and a door whose rider is
   * missing from it lost to the other (the lead, 2026-10-03: *"Either order"* -
   * whichever is used first pays). Sorted, once each.
   *
   * `prime` marks them paid before the blow (the Combat tab's control);
   * `consume` takes the ones an attack has just made its charge.
   *
   * @param {string[]} identifiers  the riders spent
   * @param {{prime?: boolean, consume?: string[]}} [o]
   * @returns {Promise<{added: string[], round: object}|null>}
   */
  async markRoundRiders(identifiers = [], { prime = false, consume = [] } = {}) {
    const ids = [...new Set((identifiers ?? []).filter(id => typeof id === "string" && id))];
    const gone = [...new Set((consume ?? []).filter(id => typeof id === "string" && id))];
    if (!ids.length && !gone.length) return null;
    return oneAtATime(this, async () => {
      const next = roundRiders(this.getFlag("azeroth-rpg", "round") ?? null, this.combat?.round ?? 0, { mark: ids, prime, consume: gone });
      if (next.changed) await this.setFlag("azeroth-rpg", "round", next.round);
      return { added: next.added, round: next.round };
    });
  }

  /**
   * **A ONCE-A-ROUND MARK ON THE ROUND'S RECORD** (D-771): 04's Savage Shift
   * (*Once a round, your Shapeshift class feature costs no action*) and Primal
   * Fury (*Once during your turn*). Queued with the budget's writes (D-761) and
   * read when its turn comes (`rules/riders.mjs#roundOnce`), so two doors in
   * flight cannot each find it unspent: it answers whether THIS write made the
   * mark. `round` is already one of `turn-stamp.mjs#BOOKKEEPING_FLAGS`.
   *
   * @param {string} key
   * @returns {Promise<{added: boolean, round: object}>}
   */
  async markRoundOnce(key) {
    return oneAtATime(this, async () => {
      const next = roundOnce(this.getFlag("azeroth-rpg", "round") ?? null, this.combat?.round ?? 0, key);
      if (next.changed) await this.setFlag("azeroth-rpg", "round", next.round);
      return { added: next.added, round: next.round };
    });
  }

  /**
   * **STRUCK THIS ROUND** (05 §11: the Rage a round's blow keeps; D-627): the
   * round's record marked from the damage door (`AzerothActor#_struckBy`), queued
   * with the budget's and the record's other writes (D-761) and read when its turn
   * comes (`rules/riders.mjs#roundStruck`), so a record of an older round is never
   * carried into this one (the final review of D-768 to D-775). `round` is one of
   * `turn-stamp.mjs#BOOKKEEPING_FLAGS`.
   *
   * @returns {Promise<object>}  the round's record as written
   */
  async markStruck() {
    return oneAtATime(this, async () => {
      const next = roundStruck(this.getFlag("azeroth-rpg", "round") ?? null, this.combat?.round ?? 0);
      if (next.changed) await this.setFlag("azeroth-rpg", "round", next.round);
      return next.round;
    });
  }

  /**
   * Put a Half-Action or the Reaction back (D-718). **The GM's alone**: it is
   * an undo for a spend the table decided did not happen, and a player holding
   * their own combatant must not be able to refund their turn.
   *
   * @param {"half"|"reaction"} cost
   */
  async restoreAction(cost) {
    if (!game.user.isGM) {
      const reason = game.i18n.localize("AZEROTH.Combat.RestoreGMOnly");
      ui.notifications?.warn(reason);
      return { ok: false, reason, params: {}, budget: this.budget };
    }
    // Queued with every other budget write (D-761).
    return oneAtATime(this, async () => {
      const result = restore(this.budget, cost);
      if (!result.ok) {
        ui.notifications?.warn(game.i18n.format(result.reason, result.params ?? {}));
        return result;
      }
      await this.setFlag("azeroth-rpg", "budget", result.budget);
      return result;
    });
  }

  /**
   * Every enemy whose reach this move left (06 §5, D-694): *Leaving an
   * enemy's reach without using **Disengage** provokes an **Opportunity
   * Attack**.*
   *
   * **The whole passed path is measured, not the two ends.** A run that starts
   * outside a halberdier's ten feet, cuts through them and finishes outside
   * has left that reach; reading only the origin would let anybody stroll past
   * a polearm for nothing. `provokes` is the judgement and this is the
   * measuring.
   *
   * **The positions come off the MOVEMENT, never off the document.** v14
   * interpolates a travelling token's own x and y, so a distance read here
   * would be wherever the animation had got to (D-669) - `movement.origin` and
   * the passed waypoints are exact and already final.
   *
   * A threatener with no Reaction left, one on its own side, one that is down
   * and one on another scene are all passed over: an offer nobody could take
   * is a card everybody has to read.
   *
   * **Measured between the nearest spaces, never the centres, and in three
   * dimensions** (D-732). A 3×3 boss's centre is ten feet from a rogue standing
   * against it, so the rogue was never inside its reach and walked away for
   * free; the footprint is laid at each passed position, since a Large mover's
   * squares move with it, and each carries its elevation - a Harpy twenty feet
   * up passing over a Warrior leaves nobody's reach.
   *
   * **The threateners are settled BEFORE anything is measured** (D-732's
   * review): an enemy with a Reaction and something to strike with, on this
   * scene. A move nobody could answer lays no path out at all.
   *
   * @param {TokenMovementOperation} movement
   * @returns {Array<object>} one row per enemy left behind
   */
  opportunities(movement) {
    const combat = this.combat;
    const mover = this.token;
    const scene = mover?.parent ?? null;
    if (!combat || !mover || !scene || !scene.grid) return [];
    const disengaged = this.actor?.statuses?.has("disengaging") === true;
    const threats = [];
    for (const other of combat.combatants) {
      if (other.id === this.id || other.side === this.side || other.isDefeated) continue;
      const threat = other.token;
      if (!threat || threat.parent?.id !== scene.id) continue;
      if ((other.budget?.reactions ?? 0) < 1) continue;
      // What it would be struck with, so the button can say so; a threatener
      // holding nothing is refused here rather than on a dead button.
      const may = canReact("opportunityAttack", reactionStateOf(other.actor));
      if (!may.ok) continue;
      threats.push({ other, threat, may });
    }
    if (!threats.length) return [];
    const points = pathPoints(movement);
    const end = movement?.passed?.waypoints?.at?.(-1) ?? movement?.destination ?? null;
    if (!points.length || !end) return [];
    // The mover's footprint at every passed position and at the end, laid out
    // once and measured against every threatener.
    const passed = points.map(p => footprintOf(mover, p));
    const after = footprintOf(mover, end);
    const rows = [];
    for (const { other, threat, may } of threats) {
      const from = footprintOf(threat);
      const reach = reachOfActor(other.actor);
      const closest = passed.reduce((least, footprint) => {
        const d = feetBetweenFootprints(from, footprint, scene.grid);
        return d === null ? least : Math.min(least, d);
      }, Infinity);
      const verdict = provokes({
        before: Number.isFinite(closest) ? closest : null,
        after: feetBetweenFootprints(from, after, scene.grid),
        reach,
        // 04's Anchor (D-772): *moving away from you provokes as normal* - a
        // Disengage does not spare the mover the reach of an Anchor's holder.
        disengaged: disengaged && !((other.actor?.talentRanks?.("Anchor") ?? 0) > 0)
      });
      if (!verdict.provoked) continue;
      rows.push({
        combatantId: other.id,
        actorUuid: other.actor.uuid,
        name: other.actor.name,
        with: may.with,
        reach,
        distance: Number.isFinite(closest) ? closest : reach
      });
    }
    return rows;
  }

  /**
   * Extra Attack arrives at level 5 (D-160), superseding D-012's "level 11".
   *
   * **The reading itself is the ACTOR's** (D-704): a character's feature, a
   * creature's ability, Boss Action, trait or the GM's flag, all in
   * `AzerothActor#hasExtraAttack` — because the attack door has to ask the
   * same question to know how many Tests one Attack rolls, and a second
   * reading of one question is how two of them come to disagree.
   */
  _hasExtraAttack() {
    return this.actor?.hasExtraAttack === true;
  }
}

/**
 * The positions to measure a departure against: where the move began and the
 * waypoints it passed, capped so a long drag over rough ground cannot turn
 * one step into a hundred grid measurements per enemy. The first and the last
 * are always in.
 */
function pathPoints(movement, cap = 24) {
  const waypoints = movement?.passed?.waypoints ?? [];
  const all = [movement?.origin, ...waypoints].filter(Boolean);
  if (all.length <= cap) return all;
  const stride = Math.ceil(all.length / (cap - 1));
  const out = all.filter((_, i) => i % stride === 0);
  if (out.at(-1) !== all.at(-1)) out.push(all.at(-1));
  return out;
}

/**
 * Offer the Opportunity Attacks a departure provoked, one card each (06 §6,
 * D-694).
 *
 * **Nothing is ever swung automatically.** 06 gives the attack to the creature
 * that was left and the timing with it, so this posts an offer and stops. The
 * card is made by the MOVER's client - it is the one the hook ran on - and
 * `dice/chat.mjs` shows the button only to whoever owns the threatener.
 *
 * The distance travels on the card because the mover is out of reach by the
 * time anybody reads it, and D-669 refuses a melee blow outside reach.
 */
export async function offerOpportunities(combatant, movement) {
  const rows = combatant.opportunities(movement);
  if (!rows.length) return [];
  const { renderTemplate } = foundry.applications.handlebars;
  const mover = combatant.token;
  const made = [];
  for (const row of rows) {
    const content = await renderTemplate("systems/azeroth-rpg/templates/chat/reaction-card.hbs", {
      cardClass: "azeroth-card-attack",
      title: game.i18n.localize("AZEROTH.Reaction.OpportunityAttack"),
      name: row.name,
      text: game.i18n.format("AZEROTH.Reaction.OpportunityText", { mover: combatant.name, name: row.name }),
      note: game.i18n.localize("AZEROTH.Reaction.OpportunityNote"),
      ownerUuid: row.actorUuid,
      opportunity: true,
      weapon: row.with,
      tokenId: mover?.id ?? "",
      sceneId: mover?.parent?.id ?? "",
      distance: row.distance
    });
    made.push(await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
      content,
      flags: { "azeroth-rpg": { kind: "reaction", reaction: "opportunityAttack", actorUuid: row.actorUuid } }
    }));
  }
  return made;
}

/**
 * The `moveToken` hook (verified at 14.367: TokenDocument#_onUpdateMovement
 * fires it with the movement, the operation and the user, on every connected
 * client): a combatant's move on its own turn, in a started fight, spends
 * Move (2026-09-06) - and leaving an enemy's reach offers them the blow
 * (06 §5, D-694).
 *
 * Both are scoped to the MOVER'S OWN TURN, which is what 06's sentence
 * describes. Forced movement on somebody else's turn - a Drive Back, a shove -
 * provokes nothing here, and whether it should is the table's.
 */
export function onMoveToken(document, movement, operation, user) {
  if (!user?.isSelf) return;
  const { combatant } = turnMover(document);
  if (!combatant) return;
  // **A TOKEN PUT SOMEWHERE LEAVES NOBODY'S REACH** (D-769): a displacement -
  // a GM's reposition, a shape's resize with its centre held - is no creature
  // moving (`rules/movement.mjs#creatureMoved`, the reading areas already take),
  // so it offers no Opportunity Attack. Its feet are metered as before: nothing.
  return combatant.spendMovement(movement)
    .then(() => (creatureMoved(movement, operation) ? offerOpportunities(combatant, movement) : []))
    .catch(err => console.error("azeroth-rpg | opportunity attack", err));
}

/**
 * **WHOSE MOVE THE TURN BUDGET JUDGES** (05 §10; D-718, D-762): the combatant
 * standing on this token in a started fight, on its own turn. The one reading
 * the charge (`onMoveToken`), the refusal (`onPreMoveToken`) and the feet-left
 * door (`remainingMovement`) share, so none of them meters a move another
 * leaves alone.
 *
 * @param {TokenDocument|null} document
 * @returns {{combatant: AzerothCombatant|null, reason: string|null}}  the
 *   combatant, or why there is none (`rules/movement.mjs#MOVEMENT_UNMETERED`)
 */
function turnMover(document) {
  if (!document) return { combatant: null, reason: MOVEMENT_UNMETERED.NO_TOKEN };
  const fight = document.actor?.activeFight?.() ?? null;
  if (!fight?.started) return { combatant: null, reason: MOVEMENT_UNMETERED.NO_FIGHT };
  const combatant = fight.combatants.find(c => c.tokenId === document.id) ?? null;
  if (!combatant) return { combatant: null, reason: MOVEMENT_UNMETERED.NOT_COMBATANT };
  if (fight.combatant?.id !== combatant.id) return { combatant: null, reason: MOVEMENT_UNMETERED.NOT_TURN };
  return { combatant, reason: null };
}

/**
 * **WHAT THIS TOKEN MAY STILL MOVE, NOW** (D-762; the lead, 2026-09-29: *Add a
 * read-only door*): `game.system.azeroth.movement.remaining`, for a view that
 * shows *20 ft left* and stops a walker at the limit rather than learning it by
 * being refused. The system still does the charging and the refusing; this
 * reads the same turn, through the same gate (`turnMover`), the same facts
 * (`AzerothCombatant#_movementFacts`) and the same judgement
 * (`rules/movement.mjs#movementAllowed`, inside `movementLeft`), and WRITES
 * NOTHING.
 *
 * The turn so far is core's own recorded movement history, shaped as the next
 * move's `preMoveToken` will be handed it (`historyProbe`), so `spentFeet` is
 * the history the limit will meter and `feetLeft` the most the next move may
 * spend at that action's pace. **Feet are core's movement COST** (D-757): on
 * Difficult ground, or climbing, swimming or crawling, a foot crossed spends
 * two. **On a grid they are the squares entered** (D-764): the scene's grid
 * distance a square, nothing for a step inside one.
 *
 * **Not metered is said, never numbered.** A token whose move the budget does
 * not judge - no started fight, not a combatant, not its turn, no pace by
 * nature - answers `metered: false` with the `reason` and every number null.
 * `limited: false` is the world setting's (D-718): the move past `feetLeft` is
 * then let through, charged what the turn holds and warned about.
 *
 * A snapshot: read it again after the token moves, the combatant or its actor
 * changes, or the turn does.
 *
 * @param {TokenDocument|Token|null} token  a TokenDocument, or a placeable Token
 * @param {{action?: string|null}} [options]
 *   `action` the movement action to read the pace for, a key of
 *   `CONFIG.Token.movement.actions`; left out, the token's own `movementAction`.
 *   One that is not a key throws a `TypeError`, whatever the token (`askedAction`).
 * @returns {{metered: boolean, reason: string|null, combatantId: string|null,
 *   limited: boolean|null, action: string|null, pace: number|null, stopped: boolean,
 *   spentFeet: number|null, allowedFeet: number|null, feetLeft: number|null,
 *   feetBeforeNextMove: number|null,
 *   halves: {paid: number, left: number, free: number, total: number}|null}}
 */
export function remainingMovement(token, { action = null } = {}) {
  // An action the board does not know is refused whoever the token is, metered
  // or not (D-762; the final review): asked before the turn is looked at.
  const asked = askedAction(action, CONFIG.Token.movement.actions);
  const document = tokenDocumentOf(token);
  const { combatant, reason } = turnMover(document);
  if (!combatant) return { ...unmetered(reason), combatantId: null };
  const moving = asked ?? askedAction(document.movementAction ?? CONFIG.Token.movement.defaultAction, CONFIG.Token.movement.actions);
  const probe = historyProbe(document, moving);
  const left = movementLeft(combatant._movementFacts(probe, movementSteps(document, probe)));
  if (!left.metered) return { ...left, combatantId: combatant.id };
  return { ...left, limited: movementLimited(), action: moving, combatantId: combatant.id };
}

/** A TokenDocument, handed over as itself or as its placeable, or null. */
function tokenDocumentOf(token) {
  const TokenDocument = foundry.documents.TokenDocument;
  if (token instanceof TokenDocument) return token;
  if (token?.document instanceof TokenDocument) return token.document;
  return null;
}

/**
 * **THE TURN SO FAR, AS THE NEXT MOVE WILL SEE IT** (D-762). Verified at
 * 14.367 (`client/documents/token.mjs`, `#preUpdateMovement`):
 *
 * - a move's RECORDED history is the token's stored `_movementHistory`, a cost
 *   stored as null read back as `Infinity` (unmeasured);
 * - its UNRECORDED history, in a started fight, is at most one waypoint where
 *   the token stands - the path's first, or a `displace` one after a GM moved
 *   the token unrecorded - and both measure no distance and cost 0.
 *
 * So the probe is the stored history and a passed path of ONE waypoint: the
 * action asked about, where the token already stands (a waypoint naming no
 * position is measured from the one before it), costing nothing. The facts then
 * read the turn's feet at that action's pace with none added.
 *
 * A stored `terrain` is handed over as stored: the meter reads only whether its
 * difficulty is 0 (`rules/movement.mjs#stepFeet`), which the stored shape and
 * core's `TerrainData` answer alike. The probe's steps are measured by
 * `movementSteps` exactly as a move's are, so on a grid the door reads the
 * squares the turn has entered (D-764), as the charge and the refusal do.
 */
function historyProbe(document, action) {
  const waypoints = (document._source?._movementHistory ?? []).map(w => ({ ...w, cost: w.cost ?? Infinity }));
  let distance = 0;
  if (waypoints.length) {
    try {
      distance = Number(document.measureMovementPath(waypoints.map(({ cost, ...w }) => w))?.distance) || 0;
    } catch {
      distance = 0;
    }
  }
  const cost = waypoints.reduce((sum, w) => sum + w.cost, 0);
  return {
    history: {
      recorded: { waypoints, distance, cost },
      unrecorded: { waypoints: [], distance: 0, cost: 0 }
    },
    passed: { waypoints: [{ action, cost: 0 }], distance: 0, cost: 0 }
  };
}

/**
 * The `preMoveToken` hook (D-718): a drag is REFUSED where the turn's
 * Half-Actions do not pay for it.
 *
 * 05 §10 says *a Move Half-Action carries you up to your Speed; two of them
 * carry you twice as far*, and until this the system only said so after the
 * fact - `spendMovement` charged what it could and printed a notice for the
 * rest, so a token could be dragged the length of a scene and the rule had no
 * teeth at all (the lead's item 23).
 *
 * **Verified at 14.367** (`client/documents/token.mjs`): core calls
 * `Hooks.call("preMoveToken", this, move, options)` inside `_preUpdateMovement`
 * and DELETES every movement field from the update when a handler returns
 * false. The hook fires **only on the client that initiated the move**, and it
 * is SYNCHRONOUS - nothing may be awaited here, which is why the verdict reads
 * flags and derived data and writes nothing. The system sets no
 * `CONFIG.Token.documentClass`, so the hook is the door rather than an
 * override of `_preUpdateMovement`.
 *
 * Gated exactly as `onMoveToken` is: a started fight, the mover's own turn.
 * Forced movement on somebody else's turn, a GM repositioning between fights
 * and a token with no combatant are all none of this rule's business.
 *
 * **The GM is bound by it too**, deliberately: the limit is the table's
 * agreement and the world setting is the one place to relax it, with the
 * tracker's own Restore as the undo for a Half-Action spent wrongly (D-718).
 */
export function onPreMoveToken(document, movement) {
  if (!movementLimited()) return true;
  // **A DISPLACEMENT SPENDS NO FEET, SO THE LIMIT NEVER REFUSES ONE** (D-769):
  // the turn's history is in the metered sum too, so a creature that had
  // already walked its Speed - or one Entangled - had its shape's resize
  // refused although the resize spends nothing.
  if (!creatureMoved(movement)) return true;
  const { combatant } = turnMover(document);
  if (!combatant) return true;
  const actor = document.actor;
  // **THE TURN READ HERE IS NEVER HALF WRITTEN** (D-761): the budget and the
  // Moves paid land in one update, so a move made while the charge before it
  // is still landing is judged against the whole turn - a Half-Action spent
  // beside a Move not yet paid for refused a move the turn could pay for.
  const steps = movementSteps(document, movement);
  const verdict = combatant.movementVerdict(movement, steps);
  if (verdict.ok) return true;
  // A Speed held at 0 is not a budget spent, and says so in its own words
  // (the final review of D-757): *Your Speed is 0* (A1).
  if (verdict.stopped) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Combat.MoveStopped", { name: actor.name }));
    return false;
  }
  ui.notifications?.warn(game.i18n.format("AZEROTH.Combat.MoveRefused", {
    name: actor.name,
    feet: Math.round(meteredFeet(movement, steps)),
    allowed: verdict.allowedFeet
  }));
  return false;
}

/**
 * **EVERY STEP OF A MOVE, AS CORE'S GRID MEASURES IT** (the final review of
 * D-757; D-764): the turn's recorded history, its unrecorded history and the
 * passed path laid end to end and measured once through
 * `TokenDocument#measureMovementPath` (14.367, `client/documents/token.mjs`
 * L1094-1186), the measure core took each section's distance with - so the
 * scene's alternating diagonals run along the whole turn, as core's own costing
 * runs them. Each step is its `backward` segment read by
 * `rules/movement.mjs#measuredStep`: the DISTANCE walked, and the SQUARES it
 * entered in feet - the scene's grid distance a space, by its diagonal rule,
 * because every waypoint's own cost is stripped and `squareFeet` measures in its
 * place - or no squares at all on a gridless scene. The first step starts the
 * path and is a step of nothing. `rules/movement.mjs#meteredFeet` meters each
 * step (`stepFeet`): nothing inside a square, core's cost for one entered where
 * core measured one, and the squares where it did not.
 *
 * Null where nothing can be measured - no document, or core threw - and the
 * meter then reads each section whole, as it always did.
 *
 * @param {TokenDocument|null} document
 * @param {object} movement  a TokenMovementOperation or TokenPreMovementOperation
 * @returns {{recorded: object[], unrecorded: object[], passed: object[]}|null}
 *   `{distance, squares}` per waypoint, index for index
 */
function movementSteps(document, movement) {
  const recorded = movement?.history?.recorded?.waypoints ?? [];
  const unrecorded = movement?.history?.unrecorded?.waypoints ?? [];
  const passed = movement?.passed?.waypoints ?? [];
  const path = [...recorded, ...unrecorded, ...passed];
  if (typeof document?.measureMovementPath !== "function" || !path.length) return null;
  try {
    // The grid `measureMovementPath` itself measures on (L1096).
    const gridless = Boolean((document.parent?.grid ?? foundry.documents.BaseScene.defaultGrid)?.isGridless);
    const measured = document.measureMovementPath(path.map(({ cost, ...waypoint }) => waypoint), { cost: squareFeet }).waypoints ?? [];
    const steps = path.map((_, i) => measuredStep(i === 0 ? null : measured[i]?.backward, { gridless }));
    return {
      recorded: steps.slice(0, recorded.length),
      unrecorded: steps.slice(recorded.length, recorded.length + unrecorded.length),
      passed: steps.slice(recorded.length + unrecorded.length)
    };
  } catch {
    return null;
  }
}

export class AzerothCombat extends Combat {
  /**
   * @inheritDoc
   *
   * Replaces core's ordering entirely. Core orders combatant by combatant;
   * this orders **side by side**, so a slower ally still acts before a faster
   * enemy when their side holds the lead.
   *
   * THIS CANNOT BE DONE IN `_sortCombatants`. Core calls it as a bare
   * comparator — `this.combatants.contents.sort(this._sortCombatants)` — so
   * `this` inside it is undefined and a side-based comparator cannot reach the
   * other combatants it needs. Core's own comparator only ever looks at its two
   * arguments, which is why it works there and a side-aware one does not.
   */
  setupTurns() {
    this.turns ||= [];

    const order = this._order();
    const turns = this.combatants.contents
      .slice()
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    if (this.turn !== null) {
      if (this.turn < 0) this.turn = 0;
      else if (this.turn >= turns.length) {
        this.turn = 0;
        this.round++;
      }
      turns.forEach((c, i) => (c.turnNumber = i));
    }

    this.current = this._getCurrentState(turns[this.turn]);
    if (!this.previous) this.previous = this.current;

    return (this.turns = turns);
  }

  /**
   * The round's turn order, from the pure rule.
   *
   * NOT A PRIVATE METHOD. Core's `prepareDerivedData` calls `setupTurns()`
   * whenever combatants exist, and data preparation runs inside the base
   * constructor - before this class's own constructor body has installed
   * its private brand. Constructing a populated Combat, which every update
   * does for its clone, then threw "Receiver must be an instance of class
   * AzerothCombat" from inside `_safePrepareData` (2026-09-02). The same
   * holds for anything reachable from a getter core reads early.
   */
  _order() {
    const shaped = this.combatants.map(c => ({
      id: c.id,
      name: c.name,
      side: c.side,
      initiative: c.derivedInitiative
    }));
    return turnOrder(shaped).map(c => c.id);
  }

  /**
   * Put The Party into this fight (2026-09-06): every character marked as
   * one of the party, by its tokens on the viewed scene where it has any,
   * else by the actor alone. One already in the fight is left as it is.
   * @returns {Promise<Combatant[]>}
   */
  async addParty() {
    const party = game.actors.filter(a => a.isParty);
    const scene = this.scene ?? canvas.scene ?? null;
    const rows = [];
    for (const actor of party) {
      const tokens = scene ? scene.tokens.filter(t => t.actorId === actor.id) : [];
      if (tokens.length) {
        for (const token of tokens) {
          if (this.combatants.some(c => c.tokenId === token.id)) continue;
          rows.push({ actorId: actor.id, tokenId: token.id, sceneId: scene.id });
        }
      } else if (!this.combatants.some(c => c.actorId === actor.id)) {
        rows.push({ actorId: actor.id });
      }
    }
    if (!rows.length) return [];
    return this.createEmbeddedDocuments("Combatant", rows);
  }

  /** Which side leads this round, for the tracker to label. */
  get leadingSide() {
    const first = this._order()[0];
    return this.combatants.get(first)?.side ?? null;
  }

  /**
   * @inheritDoc
   *
   * Initiative is never rolled: every combatant is given its derived number,
   * and every pool is set as 02 SS7 says a fight begins - Momentum at 0,
   * Energy and Focus full - before the first turn (D-627). Awaited here, so
   * the GM's click and a test both see it land; the lifecycle methods below
   * are core's and are not.
   */
  async startCombat() {
    await this._assignInitiative();
    for (const combatant of this.combatants) await this._fightStart(combatant);
    return super.startCombat();
  }

  /** A combatant's pools as a fight begins. */
  async _fightStart(combatant) {
    const actor = combatant.actor;
    if (!actor?.poolSnapshot) return;
    // **AND ITS ENCOUNTER USES** (02 §7's Charge, the lead's item 13). They
    // were refilled only at `_leaveFight` and at a rest, so a use struck by
    // hand - or one left over from a fight that ended some other way - stayed
    // struck into the next fight, and Charge's free Sunder never came back.
    // *Once per encounter* has to be true at the START of one as well as at
    // the end of the last: a late joiner comes through `_onEnter`, which calls
    // this, so both doors are covered by the one line.
    await actor.resetUses?.("encounter");
    // **AND THE POISON ON A BLADE COATED BEFORE INITIATIVE** (08 §12, D-719).
    // Its minute could not start: `coatingExpired` has no round to count from
    // and 08 no longer takes a poison off with the blow, so a dagger prepared
    // in the corridor laid its poison on every hit for the rest of the session.
    // The clock starts when the blade enters its first fight.
    await this._coatingClocksStart(actor);
    // Fanaticism at rank 2 (04): the Paladin begins every fight holding 3 Zeal.
    // At rank 1 the Zeal kept out of the last fight carries into this one (D-779;
    // the lead, 2026-10-03, on O-172: *"Yes"*); rank 2's 3 stands as built.
    const fanaticism = actor.talentRanks?.("Fanaticism") ?? 0;
    const zealStart = fanaticism >= 2 ? 3 : 0;
    const updates = fightStart(actor.poolSnapshot(), { zealStart, keepsZeal: fanaticism >= 1 });
    if (updates.length) await actor.updatePool(updates);
  }

  /**
   * Hand the fight's clock to every coating that was waiting for one
   * (08 §12, D-719).
   *
   * The judgement is `rules/consumables.mjs#coatingStartsIn` and this only
   * writes. The round is this fight's own, floored at 1 because `startCombat`
   * runs before core advances round 0 to round 1 - a poison stamped at round 0
   * would come off a round early. A coating already carrying a LIVE fight is
   * left alone, so nothing re-starts a minute that is already running.
   *
   * **AND A STAMP NAMING A DEAD FIGHT IS RESTARTED HERE** (the final review,
   * 2026-09-13). `_coatingsEndWithFight` takes a poison off when its own fight
   * ends and this is the net under it: a fight deleted while no GM was active,
   * or one reset to round 0, would otherwise leave a `combatId` that
   * `coatingExpired` can never match, and the poison would land on every hit
   * for the rest of the session. The fight the coating names is looked up
   * here, because the rule is pure and `game.combats` is not.
   */
  async _coatingClocksStart(actor) {
    for (const item of actor?.items ?? []) {
      const coating = item.getFlag("azeroth-rpg", "coating") ?? null;
      const named = coating?.laid?.combatId ?? null;
      const laidFightLive = named ? Boolean(game.combats.get(named)?.started) : false;
      if (!coatingStartsIn(coating, { laidFightLive })) continue;
      await item.setFlag("azeroth-rpg", "coating", {
        ...coating, laid: { combatId: this.id, round: Math.max(1, this.round ?? 1) }
      });
    }
  }

  /*
   * The lifecycle (D-627), on v14's own methods. Each runs on the active
   * GM's client only, after the update that moved the turn, and the click
   * that moved it does not await it. `_onExit` also fires for every
   * combatant when the combat is deleted, which is how a fight closed from
   * the sidebar still empties its Momentum and restores its encounter uses.
   */

  /** @inheritDoc */
  async _onEnter(combatant) {
    await super._onEnter(combatant);
    // A late joiner enters as the others began (02 SS7).
    if (this.started) await this._fightStart(combatant);
    // A character's bound creatures on the scene join beside it (D2 §7, D-643).
    const owner = combatant.actor;
    if (owner?.type === "character" && this.scene) {
      const bound = new Set(boundOf(owner).map(a => a.id));
      const tokens = this.scene.tokens.filter(t => bound.has(t.actorId) && !this.combatants.some(c => c.tokenId === t.id));
      if (tokens.length) {
        await this.createEmbeddedDocuments("Combatant", tokens.map(t => ({ tokenId: t.id, sceneId: this.scene.id, actorId: t.actorId })));
      }
    }
  }

  /** @inheritDoc */
  async _onExit(combatant) {
    await super._onExit(combatant);
    // **WHETHER THE FIGHT ENDED, OR ONE COMBATANT LEFT IT** (the final review,
    // 2026-09-13). Core calls `#onExit` for every combatant when the combat is
    // DELETED and for one when it is removed, and the two want different
    // answers about a poison's minute: the fight ending takes the minute with
    // it, a fighter walking out does not end everybody else's. A deleted
    // combat is gone from the collection by the time `_onDelete` runs, which
    // is the same test `_leaveFight` already uses to decide whether its flags
    // are still writable.
    await this._leaveFight(combatant, { ended: !game.combats.has(this.id) });
  }

  /** @inheritDoc */
  async _onStartRound(context) {
    await super._onStartRound(context);
    // The order is re-derived each round, so a Dexterity or a level that
    // moved mid-fight counts, whoever advanced the round; every budget is
    // fresh, the off hand's one blow being per ROUND (06 SS2).
    await this._assignInitiative();
    for (const combatant of this.combatants) {
      await combatant.resetBudget();
      if (combatant.getFlag("azeroth-rpg", "round") !== undefined) await combatant.unsetFlag("azeroth-rpg", "round");
      // 14 §1: *they refresh at the top of the round and unspent ones are
      // lost.* Full again, whatever is left (D-691).
      const actor = combatant.actor;
      const points = actor?.system?.bossPoints ?? null;
      if (actor?.type === "npc" && (points?.max ?? 0) > 0 && points.value !== points.max) {
        await actor.update({ "system.bossPoints.value": points.max });
      }
    }
  }

  /** @inheritDoc */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    // Reactions refresh at the start of your turn (06 SS6), and so do Energy
    // and Focus (05 SS12: "refills 3 a turn", "refills 2 a turn").
    await combatant.resetBudget();
    await combatant.actor?.refillTurn?.();
    // Guard holds until your next turn (05 SS10).
    const actor = combatant.actor;
    if (actor?.statuses?.has("guarded")) await actor.toggleStatusEffect("guarded", { active: false });
    await this._turnTicks(combatant);
    // **AN ESCAPE ON THE CREATURE'S OWN ACTION** (07's Frost Nova: *Entangled until it
    // spends an action and passes another Reflex Resilience Test*; D-778): offered as
    // its turn begins, the action spent only by a Test it makes.
    await this._escapePrompts(combatant, "action").catch(err => console.warn("azeroth-rpg | an escape prompt", err));
  }

  /**
   * A prompt card at a turn's boundary (D-628, D-629): one Test button naming
   * its actor, and Stabilized where the track is the dying one. **And the Test 07
   * gives a held or Stunned creature** (D-778): its Resilience, the effect it would
   * end, and the escape on the card's own flag, which its one press is recorded under.
   */
  async _prompt(actor, { purpose, title, text, testLabel, dc = null, stabilize = false, cardClass = "azeroth-card-attack", resilience = "body", effectId = null, escape = null }) {
    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate("systems/azeroth-rpg/templates/chat/prompt-card.hbs", {
      cardClass, title, name: actor.name, text, testLabel, dc, actorUuid: actor.uuid, purpose, stabilize, resilience, effectId
    });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: { "azeroth-rpg": { kind: "prompt", purpose, actorUuid: actor.uuid, ...(escape ? { escape: { effectId, ...escape } } : {}) } }
    });
  }

  /**
   * **THE TEST 07 GIVES A HELD OR STUNNED CREATURE, OFFERED ON ITS TURN** (D-778;
   * the lead, 2026-10-03, on O-159: *"Yes."*): one prompt for each condition it
   * carries whose escape is offered on this beat - `action` as its turn begins (Frost
   * Nova, Ice Shackles, Entangling Vines), `turnEnd` as it ends (Absolute Zero's Stun,
   * Rimebind's and Thornguard's Entangled). The button is the Resist door's
   * (`dice/chat.mjs#rollResists`, purpose `escape`), at the caster's Spell DC the
   * cast recorded, with the talents' Banes on it.
   *
   * @param {Combatant} combatant
   * @param {"action"|"turnEnd"} on
   */
  async _escapePrompts(combatant, on) {
    const actor = combatant?.actor ?? null;
    if (!actor || combatant.isDefeated) return;
    const plain = (actor.effects ?? []).map(e => ({
      id: e.id, statuses: [...(e.statuses ?? [])], flags: e.flags ?? {}, disabled: e.disabled === true || e.active === false
    }));
    for (const { id, escape } of escapesDue(plain, on)) {
      const resilience = game.i18n.localize(AZEROTH.resiliences[escape.resilience] ?? escape.resilience);
      const condition = game.i18n.localize(AZEROTH.conditions[escape.condition] ?? escape.condition);
      await this._prompt(actor, {
        purpose: "escape", resilience: escape.resilience, effectId: id, escape, dc: escape.dc,
        title: game.i18n.format("AZEROTH.Escape.Title", { condition }),
        text: game.i18n.format(on === "action" ? "AZEROTH.Escape.PromptAction" : "AZEROTH.Escape.PromptTurnEnd", {
          name: actor.name, condition, source: escape.source, resilience, dc: escape.dc ?? "—", banes: escape.banes
        }),
        testLabel: game.i18n.format("AZEROTH.Card.ResistTest", { resilience, dc: escape.dc ?? "—" })
      });
    }
  }

  /**
   * The start of a turn's ticks (D-628): Bleeding takes its Health, armor and
   * Ward not applying; a Sustain pays its Power or ends. One card line each.
   */
  async _turnTicks(combatant) {
    const actor = combatant.actor;
    if (!actor) return;
    const lines = [];
    // The dying track (06 SS8, D-629): at 0 Health and not stabilized, the
    // turn opens with a DC 12 Body Resilience Test - the table's roll, from
    // a card - and a failure takes a Death Step.
    if (actor.type === "character" && (actor.system?.health?.value ?? 0) <= 0 && !actor.getFlag("azeroth-rpg", "stabilized")
      && (actor.system?.deathSteps ?? 0) < AZEROTH.DEATH_STEPS) {
      await this._prompt(actor, {
        purpose: "deathStep",
        cardClass: "azeroth-card-critical",
        title: game.i18n.localize("AZEROTH.Sheet.Dying"),
        text: game.i18n.format("AZEROTH.Combat.DyingPrompt", { name: actor.name, steps: actor.system.deathSteps ?? 0, max: AZEROTH.DEATH_STEPS }),
        testLabel: game.i18n.format("AZEROTH.Card.ResistTest", { resilience: game.i18n.localize(AZEROTH.resiliences.body), dc: AZEROTH.DEATH_STEP_DC }),
        dc: AZEROTH.DEATH_STEP_DC,
        stabilize: true
      });
    }
    const bleeding = actor.effects.filter(e => e.statuses?.has("bleeding")).map(e => e.getFlag("azeroth-rpg", "value") ?? 1);
    if (bleeding.length) {
      const health = actor.system?.health?.value ?? 0;
      const tick = bleedTick({ bleeding, health, dying: health <= 0 });
      if (tick.bled > 0) {
        // *You lose X Health* (A1): no temporary Health is touched (05), and 07's
        // Aegis floor - *by any source* - still holds (D-777).
        await actor.loseHealth(tick.bled);
        lines.push(game.i18n.format("AZEROTH.Combat.Bled", { name: actor.name, amount: tick.bled }));
      } else if (tick.deathStep && actor.takeDeathStep) {
        await actor.takeDeathStep();
        lines.push(game.i18n.format("AZEROTH.Combat.BledStep", { name: actor.name }));
      }
    }
    // SCORCHED (A1, D-695): Bleeding's twin, beside it because it is the same
    // beat of the turn. The difference is that it is FIRE, so 05 §15's Immune
    // and Vulnerable answer it - the pure rule routes the total through
    // `mitigation.mjs` with the school named, passing no Armor Point and Ward 0
    // because A1's entry says neither applies. Nothing decays: A1 gives it
    // "values from separate sources add together" and no ceiling, exactly as
    // Bleeding has since D-628.
    const scorched = actor.effects.filter(e => e.statuses?.has("scorched")).map(e => e.getFlag("azeroth-rpg", "value") ?? 1);
    if (scorched.length) {
      const health = actor.system?.health?.value ?? 0;
      const burn = scorchTick({
        scorched, health, dying: health <= 0,
        immune: actor.system?.immune ?? [],
        vulnerable: actor.system?.vulnerable ?? [],
        school: AZEROTH.SCORCHED_SCHOOL
      });
      if (burn.burned > 0) {
        // Past armor and Ward, as A1 says, and never through `applyDamage`'s struck
        // door, which would roll a Critical Injury - but DAMAGE, so 05's temporary
        // Health takes it first (D-777).
        await actor.takeStraightDamage(burn.burned);
        // THE TYPE IS RECORDED (D-691's own flag): 14's Regeneration is
        // withheld *unless it has taken Fire damage since the end of its last
        // turn*, and a creature burning at the start of its turn has. Written
        // here rather than through `applyDamage`, which drops the type on any
        // call that is not a blow.
        if (combatant?.isOwner) {
          const taken = combatant.getFlag("azeroth-rpg", "damageTypes") ?? [];
          if (!taken.includes(AZEROTH.SCORCHED_SCHOOL)) {
            await combatant.setFlag("azeroth-rpg", "damageTypes", [...taken, AZEROTH.SCORCHED_SCHOOL]);
          }
        }
        lines.push(game.i18n.format(burn.vulnerable ? "AZEROTH.Combat.ScorchedVulnerable" : "AZEROTH.Combat.Scorched",
          { name: actor.name, amount: burn.burned }));
      } else if (burn.immune) {
        lines.push(game.i18n.format("AZEROTH.Combat.ScorchedImmune", { name: actor.name }));
      }
    }
    // AN AREA THAT STRIKES AT THE START OF A TURN (D-756): Consecration's Holy,
    // Rain of Fire's Fire, Healing Rain's Health. Beside Scorched because it is
    // the same beat, and BEFORE the regeneration below, so a Fire tick withholds
    // this turn's mending as 14 says it does.
    for (const line of await this._areaTicks(combatant)) lines.push(line);
    // **AND WHAT IS LAID ON THE CREATURE ITSELF** (D-770; the lead: *"Build
    // the tick now"*): Rejuvenation's Health, Immolate's Fire, a poison's
    // damage a turn - the same beat as the area's, after it, and before the
    // regeneration below for the same reason.
    for (const line of await this._effectTicks(combatant)) lines.push(line);
    // Burning (10 §4, 2026-09-06): 1 damage at the start of each turn that
    // nothing mitigates - straight to Health, no armor, no Ward.
    for (const tick of actor.system?.corruptionEffects?.ticks ?? []) {
      if (!(tick.damage > 0) || (actor.system?.health?.value ?? 0) <= 0) continue;
      // *1 damage* (10 §4): damage, so 05's temporary Health takes it first (D-777).
      await actor.takeStraightDamage(tick.damage);
      lines.push(game.i18n.format("AZEROTH.Combat.Burned", { name: actor.name, amount: tick.damage, rung: tick.name }));
    }
    // A CREATURE'S REGENERATION (14, D-691): Health at the start of each of
    // its turns, withheld where it has taken the named damage since the end
    // of its last one - which is what the round flag's `damageTypes` records.
    // A creature at 0 Health is down and stops mending itself.
    for (const line of this._regeneration(actor, combatant)) {
      if (line.healed > 0) await actor.adjustHealth(line.healed);
      lines.push(line.text);
    }
    // **WHAT THE SIGNATURES ON WHAT IS WORN GIVE BACK** (08 §20, D-692): 95
    // Classic finds say *at the start of each of your turns, regain 1 Mana* or
    // the same in Health, and nothing read one. It sits beside the creature's
    // regeneration because it is the same beat of the turn; the difference is
    // that a character's comes off the things they are wearing.
    for (const line of await this._signatureTicks(actor)) lines.push(line);
    // **AND WHAT A TALENT GIVES BACK** (04's Blood Craze: *While you hold more
    // than 7 Rage, recover 1 Health per rank at the start of each of your
    // turns*; D-772), at the same beat.
    for (const line of await this._talentTicks(actor)) lines.push(line);
    // **A POISON'S MINUTE IS UP** (08 §12, D-719): *it lasts for one minute and
    // lands on every hit the weapon makes in that time.* Ten rounds, counted
    // from the round it was laid in, at the COATER's own turn - the clock is
    // theirs and nobody else's turn should take it off their blade.
    for (const line of await this._coatingsWornOff(actor)) lines.push(line);
    const sustaining = actor.getFlag?.("azeroth-rpg", "sustaining") ?? [];
    if (sustaining.length && actor.poolSnapshot) {
      // **EACH SUSTAIN PAYS ITS OWN ENTRY'S UPKEEP** (the lead, 2026-10-03, on O-163:
      // *"cost by the entry or 1 Power if not mentioned."*; D-778): the number the
      // cast wrote on the entry (07's *While sustaining this spell you pay N Mana* -
      // and Health, for Felfire Aura and Felstep), else the held spell's own words,
      // else 05's 1. **A TALENT TAKES ITS SHARE OFF THE MANA** (`upkeepFor`): Mana
      // Shield at rank 2 and Soul Reaper hold theirs free (D-775), Arcane
      // Concentration takes its rank off each to a minimum of 1, and Netherwind -
      // while Shape the Weave is held - the count held as the turn starts. The
      // Health is the caster's own, never below 1 (05, *Spending Health*).
      const holdTalents = actor.type === "character" ? (actor.takenTalents?.() ?? []) : [];
      const weave = actor.hasFeature?.("Shape the Weave") === true;
      const costOf = entry => upkeepCost(
        upkeepOf(entry, actor.items?.get?.(entry?.spellId)?.system ?? null),
        upkeepFor(holdTalents, { name: entry?.name ?? "", held: sustaining.length, weave })
      );
      const r = upkeep(sustaining, actor.poolSnapshot(), { costOf, health: actor.system?.health?.value ?? null });
      if (r.updates.length) await actor.updatePool(r.updates, r.health !== null ? { "system.health.value": r.health } : {});
      else if (r.health !== null) await actor.update({ "system.health.value": r.health });
      if (r.ended.length) {
        await actor.setFlag("azeroth-rpg", "sustaining", r.kept);
        for (const e of r.ended) {
          lines.push(game.i18n.format("AZEROTH.Combat.SustainEnded", { name: actor.name, spell: e.name }));
          // What the Sustain held goes with it (D-657; closes O-93).
          await liftSpellEffects(actor, actor.items.get(e.spellId)?.uuid ?? e.uuid ?? null);
        }
      }
      // What the upkeep came to, in words (D-778): the Mana and the Health paid -
      // Felstep's is Health alone, Felfire Aura's both.
      if (r.kept.length - r.free.length > 0) {
        const paidKey = r.paid.health > 0
          ? (r.paid.mana > 0 ? "AZEROTH.Combat.SustainPaidBoth" : "AZEROTH.Combat.SustainPaidHealth")
          : "AZEROTH.Combat.SustainPaidMana";
        lines.push(game.i18n.format(paidKey, {
          name: actor.name, count: r.kept.length - r.free.length, mana: r.paid.mana, health: r.paid.health
        }));
      }
      for (const e of r.free) lines.push(game.i18n.format("AZEROTH.Combat.SustainFree", { name: actor.name, spell: e.name }));
    }
    // **HOARFROST GROWS** at the start of each of its caster's turns (07,
    // D-757), after the upkeep: an area whose Sustain went unpaid is swept by
    // the flag's own hook, which is queued ahead of this.
    const scene = combatant.token?.parent ?? null;
    if (scene) await growAreas(scene, actor, combatant.token).catch(err => console.warn("azeroth-rpg | an area did not grow", err));
    if (lines.length) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""), flags: { "azeroth-rpg": { kind: "tick" } } });
    }
  }

  /**
   * **AN AREA THAT STRIKES AT THE START OF A TURN** (D-756; the lead's
   * play-test, 2026-09-25): *An enemy takes 2 Holy damage when it starts its
   * turn inside the area, and an undead creature takes 3 instead.* The cast
   * deals none of it (`area-ticks.mjs#castDealsDamage`); this is where it lands.
   *
   * Two kinds of source, each ticked ONCE PER CAST:
   *
   * - **A Region placed from a spell's card** carrying `areaTick`
   *   (`dice/chat.mjs#regionFlagsFromCard`), that still stands - its Sustain
   *   held, its caster not down, its span not over (`staleIn`) - and that holds the token,
   *   through `TokenDocument#testInsideRegion` (14.367,
   *   `client/documents/token.mjs:3236`) on the DOCUMENT, never
   *   `TokenDocument#regions`, which core rewrites asynchronously.
   * - **A caster's own token** (`centre: "self"`): Immolation while its
   *   Sustain is held, Tree of Life while its laid effect stands, measured
   *   between the nearest spaces through `canvas/footprints.mjs` (D-732). The
   *   caster is never in their own - *within 5 feet of you* is somebody else.
   *
   * Who is struck is 07's subject read literally (`relationOf`, `tickFor`);
   * what the creature is, `creature-kinds.mjs`. **What lands goes through
   * `effects/area-strikes.mjs#strikeFromArea`** (D-757), the one door an
   * area's damage and healing take - the tick, an entry and a failed Test:
   * `resolveDamage` at SL 0 - Ward, Immune, Vulnerable and an ally's aura
   * after the Ward (D-755) - with what the caster STANDS on added
   * (`standingSpellBonus`, read now, where the caster stands now), then
   * `applyDamage` as a blow of that type, so 06 §8's Prone and 14's withheld
   * Regeneration follow - **and never as an ATTACK** (the review, S1): a mark
   * that halves *one attack* is not spent by the ground, and a dying character
   * takes no Death Step from it (06 §9 counts an attack). Healing goes through
   * `applyHealing` from the caster, as a spell's. One line each for the turn's
   * card.
   *
   * **And the area's Tests and riders at the same beat** (D-757): a Test made
   * at the start of a turn in a placed area posts the creature's own Resist
   * card AFTER its ticks land (`postAreaTest`), and a rider held *once it has
   * started its turn there* is armed on the area for the aura door
   * (`armAreas`). This is the ONE place turn-start area work happens.
   *
   * **Damage lands before healing** where one tick carries both for one
   * creature (the review, S5): a dying character is not stood up and knocked
   * down again, and a creature at full Health nets the difference. After the
   * lead's Hallowed Ground ruling no spell in 07 carries both, so this is a
   * guard.
   *
   * **Nobody out of the fight is ticked** (the orchestrator's call,
   * 2026-09-26): a combatant marked defeated, and a creature at 0 Health, whose
   * part in the fight is over (05). A dying CHARACTER still is - Healing Rain is
   * one of 06 §9's ways back. A hidden enemy is still an enemy (`relationOf`).
   *
   * @param {Combatant} combatant
   * @returns {Promise<string[]>}
   */
  async _areaTicks(combatant) {
    const lines = [];
    const actor = combatant?.actor ?? null;
    const token = combatant?.token ?? null;
    const scene = token?.parent ?? null;
    if (!actor || !token || !scene) return lines;
    // The turn boundary is where a timed area's span is judged (D-756): the
    // fight's clock goes on an area laid before it, and what has gone is swept.
    await sweepFightAreas(this).catch(err => console.warn("azeroth-rpg | an area sweep did not finish", err));
    if (combatant.isDefeated || (actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0)) return lines;
    // What the creature is and who it is to each caster: the ONE reading the
    // entry, the rider and the ground read too (`effects/area-strikes.mjs`),
    // each creature's combatant found by its token first.
    const kinds = kindsOfActor(actor);
    const tests = [];
    for (const source of tickSources(scene, token, worldClock())) {
      // A creature one source has just killed takes nothing more from the
      // next - neither a blow on the dead nor a heal that stands it up (14).
      if (actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0) break;
      const caster = source.caster;
      const relation = relationTo({ caster, casterToken: source.casterToken, actor, token, fight: this });
      // THE TESTS MADE AT THE START OF A TURN IN THE AREA (D-757): Thornguard,
      // Starweave, Blackout, The Deep, Firelands, Entangling Vines, Glacier,
      // Deep Winter, Hailstorm, Nether Collapse, Void Rift - each the creature's
      // own Resist card, through the spell card's door, after its ticks land.
      if (source.region) {
        const holds = new Set((caster?.getFlag?.("azeroth-rpg", "sustaining") ?? []).map(e => e?.identifier).filter(Boolean));
        for (const check of checksFor(source.tick, "turn", { relation, atCentre: atCentreOf(token, source.region), holds })) {
          tests.push({ region: source.region, check, caster });
        }
      }
      const payload = tickFor(source.tick, { relation, kinds });
      if (!payload) continue;
      // The ONE door an area's damage and healing land through (D-757): the
      // tick, an entry and a failed Test all strike through it.
      for (const line of await strikeFromArea({ actor, caster, spell: source.spell ?? {}, damage: payload.damage, heal: payload.heal })) lines.push(line);
      // **AND THE PULL BESIDE IT** (07's Void Rift: *takes 4 Shadow damage at the
      // start of each of its turns and is pulled 10 feet toward the center*; D-778,
      // the lead on O-158: *"Yes."*): toward the area's own centre, through the one
      // door - a displacement, never metered, never an Opportunity Attack, entering
      // nothing - on the creature the tick struck, and never one it has just killed.
      const forced = source.region ? turnForced(source.region) : null;
      if (forced && !(actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0)) {
        const r = await forceMove({ token, from: regionCentreOf(source.region), feet: forced.feet, toward: forced.toward, by: caster, name: token.name ?? actor.name });
        lines.push(forcedWords(r, { toward: forced.toward, source: source.spell?.name ?? source.region.name ?? "" }));
      }
    }
    // A creature that has STARTED a turn in an area carries what the area lays
    // *while it remains* from now (D-757): Insect Swarm's Bane, Hallowed
    // Ground's Ward, Hoarfrost's Speed. The aura door lays it.
    await armAreas(scene, token, "turn").catch(err => console.warn("azeroth-rpg | an area rider did not arm", err));
    // Dead creatures make no Test (14): one the ticks above put at 0 is spared.
    // Nor does a creature, or an area, that has left the world while this
    // turn's work awaited (the full-suite fix of D-757): the strike door asks
    // the same of the creature.
    if (!(actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0)) {
      for (const { region, check, caster } of tests) {
        if (tokenInWorld(token) && regionInWorld(region)) await postAreaTest({ actor, token, region, check, trigger: "turn", caster });
      }
    }
    return lines;
  }

  /**
   * **DAMAGE OR HEALING LAID ON THE CREATURE ITSELF** (D-770; O-144, O-114):
   * every tick its own effects carry, through `effects/ticks.mjs#landTicks` -
   * typed damage and healing through the area's one door, an untyped poison's
   * printed number, damage before healing, each counted down and gone at its
   * last. On the active GM's client, as all of a turn's work is (D-627).
   *
   * **Nobody out of the fight is ticked** (D-756's rule for an area): a
   * defeated combatant, and a creature at 0 Health. A dying CHARACTER still is
   * - Rejuvenation is one of 06 §9's ways back - and a tick is no attack, so it
   * costs the dying no Death Step.
   *
   * @param {Combatant} combatant
   * @returns {Promise<string[]>}
   */
  async _effectTicks(combatant) {
    const actor = combatant?.actor ?? null;
    if (!actor) return [];
    if (combatant.isDefeated || (actor.type === "npc" && (actor.system?.health?.value ?? 0) <= 0)) return [];
    return landTicks(actor);
  }

  /**
   * The coatings whose time is up, wiped off what this actor carries
   * (08 §12, D-719).
   *
   * The judgement is `rules/consumables.mjs#coatingExpired` and this only
   * writes; a coating laid outside a fight, or in another one, is left alone,
   * because the fight's rounds are the only clock this system counts.
   */
  async _coatingsWornOff(actor) {
    const lines = [];
    for (const item of actor?.items ?? []) {
      const coating = item.getFlag("azeroth-rpg", "coating") ?? null;
      if (!coatingExpired(coating, { combatId: this.id, round: this.round })) continue;
      await item.unsetFlag("azeroth-rpg", "coating");
      lines.push(game.i18n.format("AZEROTH.Combat.CoatingWornOff", {
        name: actor.name, coating: coating.name ?? "", item: item.name
      }));
    }
    return lines;
  }

  /**
   * The poisons whose fight is over, wiped off what this actor carries
   * (08 §12, D-719; the final review, 2026-09-13).
   *
   * **THE MINUTE DOES NOT OUTLIVE THE FIGHT IT WAS USED IN.** `_coatingsWornOff`
   * counts ten rounds at the coater's own turn, and a fight that ends at round
   * five never reaches the tenth: the stamp then names a fight nothing is
   * counting, `coatingExpired` refuses to judge it against any other fight's
   * round number, and the poison landed on every hit of every later fight until
   * a rest. This is the other end of the clock.
   *
   * The judgement is `rules/consumables.mjs#coatingEndsWithFight` and this only
   * writes. It is said in words, in the tick's own shape, because a poison
   * silently leaving a blade between fights is a number a Rogue would go on
   * expecting.
   */
  async _coatingsEndWithFight(actor) {
    const lines = [];
    for (const item of actor?.items ?? []) {
      const coating = item.getFlag("azeroth-rpg", "coating") ?? null;
      if (!coatingEndsWithFight(coating, this.id)) continue;
      await item.unsetFlag("azeroth-rpg", "coating");
      lines.push(game.i18n.format("AZEROTH.Combat.CoatingWornOff", {
        name: actor.name, coating: coating.name ?? "", item: item.name
      }));
    }
    if (lines.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""),
        flags: { "azeroth-rpg": { kind: "tick" } }
      });
    }
    return lines;
  }

  /**
   * What the Signatures on what is WORN give back at the start of the turn
   * (08 §20, D-692): *at the start of each of your turns, regain 1 Mana*, and
   * the same in Health. 95 Classic finds carry one.
   *
   * The aggregate is the model's own `system.signatureEffects`, so the gate is
   * judged once, in `prepareDerivedData`, and the tick reads the same answer
   * the Overview column does.
   *
   * **A CREATURE COMPOSES THE SAME FIELD** (Phase 4b): `NpcData` sets it too,
   * so a creature carrying a Classic ring regains its Mana here exactly as a
   * character does. It had the widened Critical Injury from the day the roll
   * door was merged and none of the standing half, which is the missing-caller
   * shape all over again (D-681). 14's own regeneration is a different thing
   * and stays `_regeneration` above.
   *
   * **AND FOR TWO DAYS THAT LAST PARAGRAPH WAS FALSE** (2026-09-10). The line
   * below read `p.name === "mana"`, and a creature's block names no pool type
   * at all — `poolSnapshot()` hands back `name: null` for all 164 of them — so
   * the Mana half was skipped on every creature in the game, in silence, while
   * the docblock four lines above asserted the opposite. It is CLAUDE.md §15's
   * own entry, *a pool is held by its value, never by its name* (D-637), come
   * back. `rules/pools.mjs#manaPool` is the one reading now: a Power pool named
   * `mana` if there is one, else the ONLY Power pool, else nothing.
   *
   * **Neither is topped up past its maximum**, and Health at 0 is not mended:
   * the same two rules the creature's own regeneration keeps. Mana is a POOL,
   * so it goes through `updatePool` and lands on the class entry that owns it;
   * a character with no Mana pool takes none rather than growing one.
   */
  async _signatureTicks(actor) {
    const tick = actor?.system?.signatureEffects?.tick ?? null;
    const lines = [];
    if (!tick) return lines;
    const health = actor.system?.health ?? { value: 0, max: 0 };
    if (tick.health > 0 && health.value > 0 && health.value < health.max) {
      // Halved inside an area that halves what it receives (07's Graveblight,
      // D-757), and nothing where a blow left it recovering none (04's Mortal
      // Strike, D-772).
      const healed = Math.min(healingAfterBlock(halvedHealing(tick.health, actor.system?.healingHalved === true), actor.system?.healingBlocked === true), health.max - health.value);
      if (healed > 0) {
        await actor.adjustHealth(healed);
        lines.push(game.i18n.format("AZEROTH.Combat.SignatureHealth", { name: actor.name, amount: healed }));
      }
    }
    if (tick.mana > 0) {
      const pool = manaPool(actor.poolSnapshot?.() ?? []);
      if (pool && pool.value < pool.max) {
        const gained = Math.min(tick.mana, pool.max - pool.value);
        await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.value + gained });
        lines.push(game.i18n.format("AZEROTH.Combat.SignatureMana", { name: actor.name, amount: gained }));
      }
    }
    return lines;
  }

  /**
   * What a creature's regeneration does at the start of its turn (14, D-691).
   *
   * The gate and the withholding are the pure rule's - `gateHolds` and the
   * damage type the ability names - and the damage the creature has taken
   * *since the end of its last turn* is the combatant's own round flag, which
   * `_onEndTurn` clears.
   */
  _regeneration(actor, combatant) {
    const out = [];
    const health = actor.system?.health ?? { value: 0, max: 0 };
    if (actor.type !== "npc" || health.value <= 0 || health.value >= health.max) return out;
    const taken = combatant?.getFlag("azeroth-rpg", "damageTypes") ?? [];
    for (const row of [...(actor.system.creatureAbilities ?? []), ...(actor.system.bossActions ?? [])]) {
      const tick = row?.automation?.tick ?? null;
      if (!(tick?.heal > 0)) continue;
      if (!gateHolds(tick.when ?? null, { health }, null)) continue;
      if (tick.unless && taken.includes(tick.unless)) {
        out.push({ healed: 0, text: game.i18n.format("AZEROTH.Combat.RegrowthWithheld", {
          name: actor.name, ability: row.name,
          type: game.i18n.localize(AZEROTH.damageTypes[tick.unless] ?? tick.unless)
        }) });
        continue;
      }
      // **A BLOW THAT LEFT IT RECOVERING NONE** (04's Mortal Strike: *recovers
      // no Health from any source*; D-772): withheld, and said.
      if (actor.system?.healingBlocked === true) {
        out.push({ healed: 0, text: game.i18n.format("AZEROTH.Combat.RegrowthBlocked", { name: actor.name, ability: row.name, by: (actor.system?.healingBlockedBy ?? []).join(", ") }) });
        continue;
      }
      // Halved inside an area that halves what it receives (07's Graveblight, D-757).
      const healed = Math.min(halvedHealing(tick.heal, actor.system?.healingHalved === true), health.max - health.value);
      if (healed <= 0) continue;
      out.push({ healed, text: game.i18n.format("AZEROTH.Combat.Regrowth", { name: actor.name, amount: healed, ability: row.name }) });
    }
    return out;
  }

  /**
   * **WHAT A TALENT GIVES BACK AT THE START OF THE TURN** (04's Blood Craze:
   * *While you hold more than 7 Rage, recover 1 Health per rank at the start of
   * each of your turns*; D-772): read off the pools as the turn starts, through
   * the one healing door - so Mortal Strike's block and Graveblight's halving
   * reach it - from the character themself. A character at 0 Health is dying
   * and mends nothing by it (MY READING, for the lead: Blood Craze is no way
   * back from 06 §9's dying track).
   *
   * @param {Actor} actor
   * @returns {Promise<string[]>}
   */
  async _talentTicks(actor) {
    const lines = [];
    if (actor?.type !== "character" || typeof actor.takenTalents !== "function") return lines;
    // **SIPHON** (04: *At the start of your turn, if any target lost Health to
    // Shadow or Fel damage from you since the start of your last turn, you restore
    // Health equal to the highest amount a single target lost, to a maximum of
    // twice your rank*; D-775): the record the damage door kept, read and cleared
    // at every one of the warlock's turn starts, whatever it heals.
    for (const line of await this._siphon(actor)) lines.push(line);
    const health = actor.system?.health ?? { value: 0, max: 0 };
    if (!(health.value > 0) || health.value >= health.max) return lines;
    const due = turnStartHealFor(actor.takenTalents(), { pools: actor.poolSnapshot?.() ?? [] });
    if (!(due.heal > 0)) return lines;
    const before = health.value;
    await actor.applyHealing(due.heal, { from: actor });
    const healed = Math.max(0, (actor.system?.health?.value ?? before) - before);
    lines.push(game.i18n.format("AZEROTH.Combat.TalentHeal", { name: actor.name, amount: healed, talent: due.by.join(", ") }));
    return lines;
  }

  /**
   * Siphon's Health at the warlock's turn start, off the highest single Shadow or
   * Fel loss its damage door recorded since the last one (D-775). The record goes
   * either way; a warlock at 0 Health is dying and mends nothing by it (Blood
   * Craze's reading, D-772).
   *
   * @param {Actor} actor
   * @returns {Promise<string[]>}
   */
  async _siphon(actor) {
    const record = actor.getFlag?.("azeroth-rpg", SIPHON_FLAG) ?? null;
    if (!record) return [];
    const row = siphonFor(actor.takenTalents());
    const heal = siphonHeal(record, row, { fight: this.id });
    if (actor.isOwner) await actor.unsetFlag("azeroth-rpg", SIPHON_FLAG);
    const health = actor.system?.health ?? { value: 0, max: 0 };
    if (!(heal > 0) || !(health.value > 0) || health.value >= health.max) return [];
    const before = health.value;
    await actor.applyHealing(heal, { from: actor });
    const healed = Math.max(0, (actor.system?.health?.value ?? before) - before);
    return [game.i18n.format("AZEROTH.Siphon.Line", { name: actor.name, amount: healed, talent: row?.name ?? "" })];
  }

  /** @inheritDoc */
  async _onEndRound(context) {
    await super._onEndRound(context);
    // The round's drains (02 SS7, D-627): Rage after a quiet round, Combo
    // Points after two idle rounds. One line in chat per actor that moved.
    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (!actor?.poolSnapshot) continue;
      const round = combatant.getFlag("azeroth-rpg", "round") ?? {};
      const health = actor.system?.health ?? { value: 0, max: 0 };
      const belowHalf = (health.value ?? 0) < (health.max ?? 0) / 2;
      const holds = (actor.talentRanks?.("Frenzy") ?? 0) > 0 || Boolean(actor.items?.some(i => i.type === "feature" && i.name === "Deathwish"));
      const updates = [];
      const lines = [];
      for (const pool of actor.poolSnapshot().filter(p => p.kind === "momentum")) {
        let value = pool.value;
        if (pool.name === "rage") value = drainAtRoundEnd(pool, { struck: round.struck === true, wasStruck: round.wasStruck === true, belowHalf, holdsBelowHalf: holds });
        if (pool.name === "comboPoints") value = idleDecay(pool, { round: context?.round ?? this.round, lastHitRound: combatant.getFlag("azeroth-rpg", "lastHitRound") ?? null });
        if (value === pool.value) continue;
        updates.push({ itemId: pool.itemId, kind: "momentum", value });
        lines.push(game.i18n.format("AZEROTH.Combat.PoolDrained", { name: actor.name, pool: game.i18n.localize(AZEROTH.momentumTypes[pool.name] ?? pool.name), value }));
      }
      if (updates.length) await actor.updatePool(updates);
      if (lines.length) {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: lines.map(l => `<p class="azeroth-drain">${l}</p>`).join(""), flags: { "azeroth-rpg": { kind: "drain" } } });
      }
    }
  }

  /** @inheritDoc */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    // Core re-records `previous` from the current state on EVERY combatant
    // write (`#onModifyCombatants`), and the turnEnd expiry refresh that runs
    // right after this method keys on `previous.combatantId`. A flag written
    // here left it naming the new turn's actor, and nothing "until the end of
    // your next turn" ever ended (D-628). Hold the ended turn across the writes.
    const previous = this.previous ? foundry.utils.deepClone(this.previous) : null;
    try {
      // "A target that has not yet acted" (Opening, 02 SS7) reads this.
      if (!combatant.getFlag("azeroth-rpg", "acted")) await combatant.setFlag("azeroth-rpg", "acted", true);
      // *Since the end of his last turn* (14's Regeneration, D-691): the
      // record starts over here, so what lands before this creature's next
      // turn is what withholds its mending.
      if (combatant.getFlag("azeroth-rpg", "damageTypes") !== undefined) await combatant.unsetFlag("azeroth-rpg", "damageTypes");
      const actor = combatant.actor;
      // Disengage bought a Move THIS turn and nothing more (05, D-694), so
      // the state goes at the end of it. Guard's is lifted at the start of
      // the next turn instead, because that is how long Guard lasts.
      if (actor?.statuses?.has("disengaging")) await actor.toggleStatusEffect("disengaging", { active: false });
      // **SHADOWFORM'S MARK** (04: *since your last turn*; D-774): a Holy blow
      // or a heal made before this turn ended no longer bars the next turn's
      // line. The actor's own flag, never a combatant write.
      await clearLightUsed(actor).catch(err => console.warn("azeroth-rpg | Shadowform's mark", err));
      // **04's BRACING** (*If you do not move by the end of your turn, your Armor
      // Points increase by 1 per rank*; the lead, 2026-10-03, on O-174: *"Next move"*;
      // D-779): a turn that paid for no Move lays the Armor Points on the warrior's
      // own actor - never a combatant write - and the next move lifts them
      // (`effects/class-answers.mjs`).
      const bracing = actor?.type === "character" ? bracingFor(actor.takenTalents?.() ?? []) : null;
      if (bracing && bracingAmount({ moved: (combatant.getFlag("azeroth-rpg", "moveHalves") ?? 0) > 0, rank: bracing.amount }) > 0) {
        await layBracing(actor, { amount: bracing.amount, name: bracing.name }).catch(err => console.warn("azeroth-rpg | Bracing", err));
      }
      // *A creature that ends its turn there* (07's Slagfall, D-757): what the
      // area lays from the end of a turn inside it is armed now, on the area's
      // own flag - never a combatant write, which would move `previous`.
      const token = combatant.token ?? null;
      if (token?.parent) await armAreas(token.parent, token, "turnEnd").catch(err => console.warn("azeroth-rpg | an area rider did not arm", err));
      // Poisoned (A1): a Body Resilience Test at the end of each of your turns
      // against the poison's DC; a success sheds a stack. The Test is a card
      // button - the table's roll, at the DC the table knows (D-628).
      if (actor?.statuses?.has("poisoned")) {
        const stacks = actor.effects.find(e => e.statuses?.has("poisoned"))?.getFlag("azeroth-rpg", "value") ?? 1;
        await this._prompt(actor, {
          purpose: "poisoned",
          title: game.i18n.localize(AZEROTH.conditions.poisoned),
          text: game.i18n.format("AZEROTH.Combat.PoisonedPrompt", { name: actor.name, stacks }),
          testLabel: game.i18n.localize("AZEROTH.Combat.PoisonedTest")
        });
      }
      // **THE TEST REPEATED AT THE END OF EACH OF ITS TURNS** (07's Absolute Zero,
      // Rimebind, Thornguard ...; D-778): Poisoned's shape, a card and no combatant
      // write, so `previous` stands.
      await this._escapePrompts(combatant, "turnEnd").catch(err => console.warn("azeroth-rpg | an escape prompt", err));
    } finally {
      if (previous && this.previous) Object.assign(this.previous, previous);
    }
  }

  /**
   * What leaves with a combatant (05 SS11, D-612): its Momentum, its
   * encounter uses and its fight flags. The flags go only while the combat
   * and the combatant still exist - `_onExit` fires after a deletion too.
   *
   * @param {Combatant} combatant
   * @param {{ended?: boolean}} [options]  whether the FIGHT ended, as against
   *   one combatant leaving a fight that carries on. A poison's minute is the
   *   fight's and goes with it (08 §12, D-719); everything else here leaves
   *   with the combatant either way.
   */
  async _leaveFight(combatant, { ended = false } = {}) {
    const actor = combatant.actor;
    // **EVERY MOMENTUM POOL GOES - BUT A FANATIC'S ZEAL** (04's Fanaticism at
    // rank 1: *Your Zeal does not drain out of combat*; D-772): read by name, the
    // inline row's own way, and kept between the fights.
    const momenta = leaveFightPools(actor?.poolSnapshot?.() ?? [], { keepsZeal: (actor?.talentRanks?.("Fanaticism") ?? 0) >= 1 });
    if (momenta.length) await actor.updatePool(momenta);
    await actor?.resetUses?.("encounter");
    // **A TALENT'S DAMAGE BUFF BOUGHT FOR THE FIGHT LAPSES WITH IT** (04,
    // D-711 phase 2): Seal of Command is *until the encounter ends*, which is
    // not a duration core can count. Arcane Power's *until the end of your next
    // turn* carries a real duration and expires through core (D-628).
    const lapsed = (actor?.effects ?? [])
      .filter(e => e.getFlag("azeroth-rpg", "talentBuff") && e.getFlag("azeroth-rpg", "until") === "encounter")
      .map(e => e.id);
    if (lapsed.length) await actor.deleteEmbeddedDocuments("ActiveEffect", lapsed);
    // **AND TEMPORARY HEALTH BOUGHT FOR THE FIGHT** (04's Last Stand and Living
    // Seed: *until the encounter ends*; D-777): what is left of it goes.
    await actor?.endTemporaryHealth?.({ kind: "encounterEnd", combatId: this.id });
    // The buffs bought for the fight lapse and the creatures called for it go (D-643).
    if (actor?.type === "character") await endBoundEncounter(actor).catch(err => console.error("azeroth-rpg | bound encounter", err));
    // The fight's states go with the fight (05, D-694): a Disengage bought a
    // Move in a round that no longer exists.
    if (actor?.statuses?.has("disengaging")) await actor.toggleStatusEffect("disengaging", { active: false });
    // And a Hide is a fight's state too (D-717). Only a Hide: `reveal` clears
    // core's `invisible` where the system's own flag says the system set it,
    // so a GM's wraith keeps the invisibility it was given.
    await reveal(actor);
    // **AND THE POISON'S MINUTE, WHERE THE FIGHT ITSELF IS OVER** (08 §12,
    // D-719; the final review, 2026-09-13). A poison laid at round 3 of a
    // fight that ends at round 5 has four rounds of its minute left and no
    // clock to spend them on: `coatingExpired` judges nothing outside the
    // fight that laid it, so the blade kept its poison into the next fight
    // and the one after. A combatant walking out of a fight that carries on
    // keeps theirs - the minute is still running in there.
    if (ended) await this._coatingsEndWithFight(actor);
    if (!game.combats.has(this.id) || !this.combatants.has(combatant.id)) return;
    // `ready` is the trigger and the action a Ready named (06 SS6, D-694);
    // `moveHalves` is what the turn's movement has paid for.
    // `damaged` is who this creature has hurt in the fight (04's Elemental Fury
    // and Lunar Guidance, D-711 phase 2).
    for (const key of ["budget", "round", "lastHitRound", "acted", "heldPosition", "marked", "damageTypes", "ready", "moveHalves", "damaged"]) {
      if (combatant.getFlag("azeroth-rpg", key) !== undefined) await combatant.unsetFlag("azeroth-rpg", key);
    }
  }

  /**
   * @inheritDoc
   *
   * The pools are emptied here as well as on exit, before core's confirm, so
   * the GM and a test see them land at once; the second pass on exit finds
   * nothing to move and writes nothing.
   *
   * **THIS IS THE FIGHT ENDING**, so a poison's minute ends with it (08 §12,
   * D-719). The exit pass says the same thing from the other side, for a fight
   * deleted from the sidebar rather than ended from the tracker.
   */
  async endCombat() {
    for (const combatant of this.combatants) await this._leaveFight(combatant, { ended: true });
    return super.endCombat();
  }

  async _assignInitiative() {
    const updates = this.combatants
      .filter(c => c.initiative !== c.derivedInitiative)
      .map(c => ({ _id: c.id, initiative: c.derivedInitiative }));
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
  }
}

/* -------------------------------------------- */
/*  What strikes a creature at its turn (D-756)  */
/* -------------------------------------------- */

/**
 * Whether a token stands at an area's centre (Void Rift, D-757): the space it
 * occupies holds the centre of the Region's shape (`rules/area-ticks.mjs`),
 * read off the token's DOCUMENT.
 *
 * @param {TokenDocument} token
 * @param {RegionDocument} region
 */
function atCentreOf(token, region) {
  const shape = region?.shapes?.[0] ?? null;
  const centre = shapeCentre(typeof shape?.toObject === "function" ? shape.toObject() : shape);
  if (!centre || !token) return false;
  try {
    const size = token.getSize();
    return holdsPoint({ x: token.x, y: token.y, width: size.width, height: size.height }, centre);
  } catch {
    return false;
  }
}

/** What a tick's standing bonuses are keyed by (`regionFlagsFromCard`'s `spell`), off an owned spell. */
function tickSpellOf(item, name = "") {
  return item
    ? { name: item.name, school: item.system?.school ?? null, tier: item.system?.tier ?? null, takesSpellpower: item.system?.takesSpellpower === true }
    : { name: name ?? "", school: null, tier: null, takesSpellpower: false };
}

/**
 * The self-centred ticks one actor stands at the heart of: a SUSTAINED spell
 * whose tick is `centre: "self"` while its Sustain is held (Immolation), and a
 * TIMED one while its laid effect is on them (Tree of Life, whose effect core
 * expires). Each with the cast it belongs to, where one was recorded.
 *
 * **THE ENTRY'S OWN COPY FIRST** (the review, S6): a spell cast by name from
 * the pack - a creature's Spells line - or through an item is on no actor, so
 * its Sustain entry and its laid effect carry the tick and what it is keyed by
 * (`castSpell`, `applySpellEffectFromCard`). An owned spell is the fallback for
 * an entry written before they did.
 */
function selfTicksOf(actor) {
  const out = [];
  const itemOf = (id, uuid) => actor.items?.get?.(id) ?? actor.items?.find?.(i => i.type === "spell" && i.uuid === uuid) ?? null;
  for (const entry of actor.getFlag?.("azeroth-rpg", "sustaining") ?? []) {
    const item = entry?.areaTick && entry?.tickSpell ? null : itemOf(entry?.spellId, entry?.uuid);
    const tick = entry?.areaTick ?? item?.system?.areaTick;
    if (!hasAreaTick(tick) || tick.centre !== "self") continue;
    out.push({ tick, cast: entry.cast ?? null, spell: entry.tickSpell ?? tickSpellOf(item, entry.name) });
  }
  for (const effect of actor.effects ?? []) {
    if (effect.active === false) continue;
    const f = effect.flags?.["azeroth-rpg"] ?? {};
    if (!f.spell) continue;
    const item = f.areaTick && f.tickSpell
      ? null
      : actor.items?.find?.(i => i.type === "spell" && (i.uuid === f.spell || (f.identifier && i.system?.identifier === f.identifier))) ?? null;
    const tick = f.areaTick ?? item?.system?.areaTick;
    // A Sustain answers to its entry above; only a TIMED tick answers to its effect.
    if (!hasAreaTick(tick) || tick.centre !== "self" || !(Number(tick.lasts?.rounds) > 0)) continue;
    out.push({ tick, cast: f.cast ?? null, spell: f.tickSpell ?? tickSpellOf(item, f.spellName) });
  }
  return out;
}

/**
 * **EVERY TICK THAT REACHES THIS TOKEN NOW**, once per cast (D-756): the
 * Regions on its scene that still stand and hold it, and the self-centred ticks
 * of every other token on the scene within their reach.
 *
 * @param {Scene} scene
 * @param {TokenDocument} victim
 * @param {{time: number, fights: object}} now  `canvas/sustained-areas.mjs#worldClock`
 * @returns {Array<{tick: object, caster: Actor|null, casterToken: TokenDocument|null,
 *   spell: {name?: string, school?: string|null, tier?: number|null, takesSpellpower?: boolean},
 *   region: RegionDocument|null}>}  `region` is the placed area, null for a self-centred tick
 */
function tickSources(scene, victim, now) {
  const out = [];
  const seen = new Set();
  for (const region of scene.regions ?? []) {
    const f = region.flags?.["azeroth-rpg"] ?? {};
    if (!hasAreaTick(f.areaTick) || f.areaTick.centre === "self") continue;
    const row = areaRecord(region);
    const key = row?.cast ?? region.id;
    if (seen.has(key)) continue;
    // A Region whose Sustain has gone, whose caster is down, or whose span is
    // over strikes nobody even in the moment before the sweep takes it away -
    // the sweep's own judgement (`staleIn`), so the two cannot disagree.
    if (row && staleIn(scene, [row], now).length) continue;
    let inside = false;
    try {
      inside = victim.testInsideRegion(region);
    } catch {
      inside = false;
    }
    if (!inside) continue;
    seen.add(key);
    const caster = actorOf(f.caster);
    out.push({ tick: f.areaTick, caster, casterToken: casterTokenOn(scene, f.source ?? null, caster), spell: f.spell ?? { name: region.name }, region });
  }
  for (const other of scene.tokens ?? []) {
    if (other.id === victim.id) continue;
    const carrier = other.actor ?? null;
    if (!carrier) continue;
    // A carrier that is down holds no Sustain and stands at the heart of
    // nothing (the review, M1); its laid effect's minute is core's to end.
    const carrierDown = isDown(carrier);
    for (const { tick, cast, spell } of selfTicksOf(carrier)) {
      if (carrierDown && !(Number(tick.lasts?.rounds) > 0)) continue;
      const key = cast ?? `${carrier.uuid}:${spell.name}`;
      if (seen.has(key)) continue;
      // Tree of Life's talent: *Its radius is 40 feet* (`spellAreaFor`).
      const widen = spellAreaFor(carrier.takenTalents?.() ?? [], { name: spell.name }).widen;
      const feet = feetApart(other, victim);
      if (feet === null || feet > (Number(tick.feet) || 0) + widen) continue;
      seen.add(key);
      out.push({ tick, caster: carrier, casterToken: other, spell, region: null });
    }
  }
  return out;
}
