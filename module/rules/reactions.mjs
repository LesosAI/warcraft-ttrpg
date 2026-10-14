/**
 * 06 §6's Reaction table. Pure: a snapshot in, a verdict out, no Foundry.
 *
 * **You have one Reaction per round and it refreshes at the start of your
 * turn.** The economy for that already exists and needed nothing:
 * `rules/initiative.mjs#freshTurn` grants `reactions: 1`, `spend` refuses when
 * it is gone, and a Full Action takes the Reaction with it (D-255). What was
 * missing was the five Reactions themselves - only **Pummel** existed, as a
 * Warrior and Rogue class feature that put a note on a card and applied
 * nothing.
 *
 * This module is the chapter's own table, and `reactions.test.mjs` reads it
 * back off `docs/book/06-COMBAT.md` (D-678): a rule the book states once and
 * no entry repeats is the shape that survives longest unbuilt, and a test that
 * reads the chapter is the only kind that finds it.
 *
 * | Reaction | Requires | Effect |
 * |---|---|---|
 * | Opportunity Attack | an enemy leaving your reach without Disengaging | one attack at the moment they leave |
 * | Parry | a melee weapon in hand, a class that builds Momentum, and 1 Momentum (a Rogue pays 1 Energy) | an Attack Test against the attacker's total; meet or beat it and the attack deals no damage |
 * | Block | a shield | reduce the damage of one attack by 4 |
 * | Pummel | Warrior or Rogue, engaged in melee | that creature takes two Banes on its next Casting Test |
 * | Readied action | having used Ready on your turn | the action you named, when the trigger fires |
 *
 * **All five are built now.** Opportunity Attack needed **Disengage** and
 * Readied action needed **Ready**, so those two of 05's Half-Actions came with
 * them - without Disengage no character can ever avoid an Opportunity Attack,
 * and a Readied action has nothing to trigger. `HALF_ACTIONS` below is 05's
 * whole table with what `module/` carries of each, so the four that are still
 * only a line on the roll dialog cannot be quietly forgotten.
 *
 * **What is NOT here, on purpose.** *Parry cannot be used against an attack
 * you cannot see, and neither can Block* is the table's judgement (D2 §12), so
 * it is a line on the card and never a refusal - nothing in this system knows
 * what a creature can see. **A Readied action's trigger is prose** for the same
 * reason: 05 says *name a trigger*, and a vocabulary invented for it would be
 * the tool deciding what a table may wait for. Nothing detects one; the card
 * carries the words and somebody presses the button.
 */

import { BASE_REACH } from "./distance.mjs";
import { attackModes } from "./ammunition.mjs";
import { succeeded } from "./resolution.mjs";

/** 06 §6's rows, in the chapter's own order. */
export const REACTION_KEYS = Object.freeze([
  "opportunityAttack", "parry", "block", "pummel", "readied"
]);

/** *Reduce the damage of one attack by 4.* */
export const BLOCK_REDUCTION = 4;

/**
 * *A melee weapon in hand, a class that builds Momentum, and 1 Momentum (a
 * Rogue pays 1 Energy).* (06 §6's Requires column, D-720.)
 *
 * **A caster never sees the Parry button.** The gate is the POOL and not the
 * class name: a Warrior, a Paladin, a Ranger, a Rogue and a Druid each hold a
 * Momentum pool and nobody else does, so reading the pools answers the class
 * question without a second list to keep in step with 02.
 *
 * A creature is judged the same way: 14's block prints a Momentum row or it
 * does not, and one that does may Parry and pays 1 (D-720).
 */
export const PARRY_COST = 1;

/** A Rogue's Momentum is Combo Points, and 06 says the Parry comes off Energy. */
export const PARRY_COMBO_POOL = "comboPoints";
export const PARRY_ENERGY_POOL = "energy";

/** *That creature takes two Banes on the next Casting Test it makes.* */
export const PUMMEL_BANES = 2;

/** Which Test Pummel's Banes land on. */
export const PUMMEL_KIND = "casting";

/** *Pummel is how a melee class answers a caster, and it belongs to these two.* */
export const PUMMEL_CLASSES = Object.freeze(["Warrior", "Rogue"]);

/**
 * The table itself.
 *
 * `requires` names the door's own check; `built` says whether `module/` carries
 * it yet. `feature` marks a row that is ALREADY a class feature and is
 * referenced rather than duplicated - Pummel is stamped from
 * `rules/class-features.mjs` on the Warrior and the Rogue, and a second copy
 * here would be a second thing to keep in step with 02 §7.
 */
export const REACTIONS = Object.freeze({
  opportunityAttack: Object.freeze({
    key: "opportunityAttack", label: "AZEROTH.Reaction.OpportunityAttack",
    requires: "leavingReach", built: true, feature: false, rolls: true
  }),
  parry: Object.freeze({
    key: "parry", label: "AZEROTH.Reaction.Parry",
    // TWO things, since D-720: the weapon in hand and the point it costs.
    // `needs` is asked before `requires`, so a Mage holding a longsword is
    // refused for the class rather than told to draw a weapon.
    requires: "meleeWeapon", needs: "momentumPool", cost: PARRY_COST,
    built: true, feature: false, rolls: true
  }),
  block: Object.freeze({
    key: "block", label: "AZEROTH.Reaction.Block",
    requires: "shield", built: true, feature: false, rolls: false
  }),
  pummel: Object.freeze({
    key: "pummel", label: "AZEROTH.Reaction.Pummel",
    // The two the chapter names, ON THE ROW, so `canReact`'s `class` arm reads
    // the table rather than importing a constant beside it: a third Reaction
    // that ever belongs to a class carries its own list here and needs no new
    // branch (2026-09-10).
    requires: "class", classes: PUMMEL_CLASSES, built: true, feature: true, rolls: false
  }),
  readied: Object.freeze({
    key: "readied", label: "AZEROTH.Reaction.Readied",
    requires: "ready", built: true, feature: false, rolls: false
  })
});

/** The two a card offers the defender against an incoming blow. */
export const DEFENSIVE = Object.freeze(["block", "parry"]);

/* -------------------------------------------- */
/*  05's Half-Actions, and what module/ has      */
/* -------------------------------------------- */

/**
 * 05's Half-Action table, in the chapter's own order, with what `module/`
 * carries of each.
 *
 * **Eleven rows since D-711.** *Off-Hand Attack* left the table: it rides the
 * Attack you already spent a Half-Action on and costs none of its own, and a
 * thing that costs no Half-Action is not a Half-Action. What it does is on the
 * Attack row, where 05 now puts it.
 *
 * **Two of these are 06 §6's business** and are built with the Reactions:
 * **Disengage**, because without it no character can ever avoid an Opportunity
 * Attack, and **Ready**, because a Readied action has nothing to trigger
 * without it. The other ten are not this phase's, and four of them are not
 * built at all - `via` says what stands where a door would.
 *
 * `name` is the chapter's own word and `reactions.test.mjs` reads it back off
 * 05, so a row renamed in the book fails here rather than drifting. `built`
 * means **a door that spends the Half-Action exists**, which is a harder test
 * than "the effect is somewhere in the system": Steady and Assist both put
 * their Boon on the roll dialog and neither costs anybody half a turn.
 */
export const HALF_ACTION_KEYS = Object.freeze([
  "move", "attack", "cast", "disengage", "steady",
  "guard", "assist", "interact", "stand", "skill", "ready"
]);

export const HALF_ACTIONS = Object.freeze({
  move: Object.freeze({
    key: "move", name: "Move", built: true,
    via: "AzerothCombatant#spendMovement, off core's moveToken hook (D-659)"
  }),
  attack: Object.freeze({
    key: "attack", name: "Attack", built: true,
    via: "attackWithDialog; rollTest spends one Half-Action, and each may be an Attack (D-711). The off hand rides it: the card's own button and the weapon row's context menu, at -2 unless Light, once a round"
  }),
  cast: Object.freeze({
    key: "cast", name: "Cast", built: true,
    via: "castSpell, through workflows.spendTurnBudget on the spell's own Action line"
  }),
  disengage: Object.freeze({
    key: "disengage", name: "Disengage", label: "AZEROTH.Combat.Disengage", built: true,
    via: "the Combat tab's fight controls; the Move is paid up front and no departure provokes"
  }),
  steady: Object.freeze({
    key: "steady", name: "Steady", built: false,
    via: "a judgement line on the roll dialog only (rules/modifiers.mjs); nothing spends the Half-Action"
  }),
  guard: Object.freeze({
    key: "guard", name: "Guard", built: true,
    via: "the Combat tab's fight controls; the guarded state and the Momentum loss (D-627)"
  }),
  assist: Object.freeze({
    key: "assist", name: "Assist", built: false,
    via: "a judgement line on the recipient's roll dialog only; the assister spends nothing"
  }),
  interact: Object.freeze({
    key: "interact", name: "Interact", built: false,
    via: "drawing and sheathing are the Equip control, which costs nothing"
  }),
  stand: Object.freeze({
    key: "stand", name: "Stand", built: true,
    via: "AzerothActor#toggleStatusEffect spends the half on the way OUT of Prone"
  }),
  skill: Object.freeze({
    key: "skill", name: "Skill", built: false,
    via: "rollSkill rolls the Test and spends nothing; rollTest pays only for an attack"
  }),
  ready: Object.freeze({
    key: "ready", name: "Ready", label: "AZEROTH.Combat.Ready", built: true,
    via: "the Combat tab's fight controls; the trigger and the action stored on the combatant"
  })
});

/** The Half-Actions 05 names and nothing spends a Half-Action for. */
export function unbuiltHalfActions() {
  return HALF_ACTION_KEYS.filter(k => !HALF_ACTIONS[k].built);
}

/* -------------------------------------------- */
/*  What is in hand                              */
/* -------------------------------------------- */

/**
 * The melee weapons in hand, by name.
 *
 * *A melee weapon in hand* is what 06 asks for, so the test is whether the
 * weapon has a way of being used IN THE HAND (`rules/ammunition.mjs#attackModes`,
 * D-731). A hand weapon that may also be thrown counts - a spear reaches 10 feet
 * and parries with it - while a Javelin, which 08 §7 gives only a throw, does
 * not, and a launcher never does, whatever else is true of it.
 *
 * @param {Array<object>} weapons  `{name, equipped, traits, range, launcher, isLauncher}`
 */
export function meleeInHand(weapons = []) {
  const out = [];
  for (const weapon of weapons) {
    if (!weapon || weapon.equipped !== true) continue;
    if (weapon.isLauncher === true) continue;
    if (!attackModes(weapon).includes("hand")) continue;
    out.push(weapon.name ?? "");
  }
  return out;
}

/**
 * The shields held, by name. 08 §8's twelve carry `shield: true` and nothing
 * else in the armor pack does.
 * @param {Array<object>} armor  `{name, equipped, shield}`
 */
export function shieldsHeld(armor = []) {
  return armor.filter(a => a?.equipped === true && a?.shield === true).map(a => a.name ?? "");
}

/* -------------------------------------------- */
/*  The numbers                                  */
/* -------------------------------------------- */

/**
 * 02 §7's Shieldbearer, the Warrior's level 1: *While carrying a shield,
 * **Block** reduces damage by 5 rather than 4.* A Block is always made with a
 * shield (06 §6), so the feature is one more point on every Block the Warrior
 * makes. It was `passive()` and nothing read it (D-772, found reading the
 * Block's door for Redoubt and Shield Wall).
 */
export const SHIELDBEARER = "Shieldbearer";
export const SHIELDBEARER_REDUCTION = 5;

/**
 * What a Block takes off, with whatever a Signature adds to it.
 *
 * 08 §20's Drillborer Disk: *while you have not moved this turn, **Block**
 * reduces damage by a further 2.* That is the one item in the book that
 * modifies a Reaction, and it is why this takes a bonus at all. 04's Redoubt
 * and Shield Wall ride the same bonus (D-772), and Shieldbearer replaces the
 * four with five.
 */
export function blockReduction({ bonus = 0, shieldbearer = false } = {}) {
  return (shieldbearer === true ? SHIELDBEARER_REDUCTION : BLOCK_REDUCTION) + Math.max(0, Math.trunc(Number(bonus)) || 0);
}

/** The damage left after a Block, floored at 0. */
export function blockedDamage(damage, { bonus = 0 } = {}) {
  return Math.max(0, (Math.trunc(Number(damage)) || 0) - blockReduction({ bonus }));
}

/**
 * WHICH POOL A PARRY COMES OUT OF (06 §6, D-720), or null where the reactor
 * builds no Momentum at all and so may not Parry.
 *
 * *A class that builds Momentum, and 1 Momentum (a Rogue pays 1 Energy).* The
 * Rogue's Momentum is Combo Points and the chapter sends the cost to Energy
 * instead, which is the one redirection in the rule.
 *
 * A character holding two Momentum pools (02 §10's multiclass) pays from one
 * that can; with neither able to pay the first is returned so `canReact` can
 * refuse in its own words rather than with a null.
 *
 * @param {Array<{kind: string, name: string|null, value: number, max: number}>} pools
 *   `AzerothActor#poolSnapshot`'s rows. A creature's carry `name: null`,
 *   because 14's block prints a number and no pool type (D-637).
 */
export function parryPoolFor(pools = []) {
  const list = pools ?? [];
  const momenta = list.filter(p => p?.kind === "momentum" && (p.max ?? 0) > 0);
  if (!momenta.length) return null;
  const purse = pool => (pool.name === PARRY_COMBO_POOL
    ? list.find(p => p?.kind === "power" && p.name === PARRY_ENERGY_POOL) ?? null
    : pool);
  const candidates = momenta.map(purse).filter(Boolean);
  if (!candidates.length) return null;
  return candidates.find(p => (p.value ?? 0) >= PARRY_COST) ?? candidates[0];
}

/**
 * WHETHER A MITIGATION MARK ANSWERS **THIS** BLOW (06 §6, D-720).
 *
 * *Reduce the damage of one attack by 4* is a count and not a span, so a Parry
 * or a Block records the card it was pressed on and only that card's Apply
 * spends it. Two things follow, and the second was wrong for as long as the
 * first was right:
 *
 * - An Apply from ANOTHER card leaves the mark standing.
 * - **An Apply with NO card is not that card either.** The sheet's damage
 *   door, a hazard and a tick all arrive without a message, and treating them
 *   as a match let any of them eat a Block pressed on a swing nobody had
 *   applied yet.
 *
 * A mark carrying no message of its own is a Signature's press with no card
 * behind it (08 §20's *halve the damage of one attack*), and it is spent by
 * the next blow that lands, whatever posted it.
 *
 * @param {{messageId?: string|null}|null} mark
 * @param {string|null} [messageId]  the card the blow is being applied from
 */
export function markAnswers(mark, messageId = null) {
  if (!mark) return false;
  if (!mark.messageId) return true;
  return mark.messageId === messageId;
}

/** The words a refusal for a standing mark is said in (D-771). */
export const MARK_STANDS = "AZEROTH.Reaction.Refuse.MarkStands";

/**
 * **A NEW MARK NEVER WRITES OVER ONE THAT STANDS** (D-771, the architect's
 * review of Phase 3). There is ONE mark on a creature (`flags.azeroth-rpg
 * .mitigate`), so a second press used to replace the first in silence and the
 * use, the pool or the Reaction the first was bought with was lost:
 *
 * - **`use`** - a Use that lays a mark (04's Survival Instincts) is refused
 *   while ANY mark stands: a Parry or a Block on a card not yet applied, a
 *   Signature's halving, its own earlier press.
 * - **`reaction`** - a Parry or a Block is refused while a mark with NO card of
 *   its own stands (Survival Instincts, a Signature's press), because that mark
 *   is spent by the very next blow - the one the Reaction answers. A mark a
 *   Parry or a Block laid on ANOTHER card is that card's (`markAnswers`) and
 *   one Reaction a round already keeps two of those apart, so that rule stands
 *   as it was.
 *
 * Judged before anything is spent (D-768's order). Null where the new mark may
 * be laid.
 *
 * @param {{name?: string, messageId?: string|null}|null} held  the mark standing
 * @param {{door?: "use"|"reaction"}} [o]
 * @returns {{key: string, params: {mark: string}}|null}
 */
export function standingMarkRefusal(held, { door = "use" } = {}) {
  if (!held || typeof held !== "object") return null;
  if (door === "reaction" && held.messageId) return null;
  return { key: MARK_STANDS, params: { mark: String(held.name ?? "") } };
}

/**
 * What a blow leaves after the mark `AzerothActor#applyDamage` spends
 * (06 §6's Parry and Block, 08 §20's *halve the damage*).
 *
 * **The arithmetic was inline in the document and `blockedDamage` had no
 * caller at all** - right code with nothing reading it, which is this system's
 * commonest real fault (D-681). One function now, so the card's annotated
 * number and the Health that is actually written cannot disagree.
 *
 * @param {number} damage
 * @param {{negate?: boolean, halve?: boolean, amount?: number|null,
 *          bonus?: number, reaction?: string|null}|null} mark
 */
export function mitigatedDamage(damage, mark = null) {
  const n = Math.max(0, Math.trunc(Number(damage)) || 0);
  if (!mark) return n;
  // *Meet or beat it and the attack deals no damage.* All or nothing.
  if (mark.negate === true) return 0;
  if (mark.halve === true) return Math.floor(n / 2);
  // A Block is 06 §6's four plus whatever a Signature adds; the mark records
  // the bonus so the number is worked out here rather than trusted off a card
  // written before the shield changed hands. An older mark carries the total.
  if (mark.reaction === "block") {
    const bonus = mark.bonus ?? Math.max(0, (mark.amount ?? BLOCK_REDUCTION) - BLOCK_REDUCTION);
    return blockedDamage(n, { bonus });
  }
  return Math.max(0, n - Math.max(0, Math.trunc(Number(mark.amount)) || 0));
}

/**
 * *Roll an Attack Test against the attacker's total. Meet or beat it and the
 * attack deals no damage.*
 *
 * **Meet or beat is the margin, never the Success Level** (D-678): SL 0 covers
 * a margin of 0 to +4 on the way up and nothing on the way down, so reading
 * the verdict off it is the fault that made a miss a hit for months.
 */
export function parryHolds(total, attackerTotal) {
  return succeeded(total, attackerTotal);
}

/* -------------------------------------------- */
/*  Leaving an enemy's reach                     */
/* -------------------------------------------- */

/**
 * *Leaving an enemy's reach without using **Disengage** provokes an
 * **Opportunity Attack**.* (06 §5, and 06 §6's own Requires column.)
 *
 * **`before` is the CLOSEST the mover came, not where it set off.** A path
 * that starts outside a halberdier's ten feet, runs through them and ends
 * outside has left that reach as surely as one that started inside it, and
 * reading only the origin would let anybody walk straight past a polearm for
 * free. The Foundry side measures the whole passed path and hands the minimum
 * in; this only judges it.
 *
 * The distances are the caller's, which is what keeps this pure - and where
 * nothing could be measured **nothing is provoked**, the same ruling D-669
 * makes for reach at the attack door.
 *
 * @param {object} o
 * @param {number|null} o.before      feet at the closest approach
 * @param {number|null} o.after       feet where the move ended
 * @param {number} [o.reach]          the threatener's reach
 * @param {boolean} [o.disengaged]    the mover spent a Half-Action on Disengage
 * @param {boolean} [o.enemy]         06 says *an enemy*; an ally provokes nothing
 * @returns {{provoked: boolean, why: string}}
 */
export function provokes({ before = null, after = null, reach = BASE_REACH, disengaged = false, enemy = true } = {}) {
  if (!enemy) return { provoked: false, why: "ally" };
  if (disengaged) return { provoked: false, why: "disengaged" };
  // `Number(null)` is 0 and 0 is finite, so a distance nothing measured would
  // read as a creature standing on top of the threatener.
  const feet = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const near = feet(before);
  const far = feet(after);
  if (near === null || far === null) return { provoked: false, why: "unmeasured" };
  if (near > reach) return { provoked: false, why: "neverInReach" };
  if (far <= reach) return { provoked: false, why: "stayedInReach" };
  return { provoked: true, why: "leftReach" };
}

/**
 * 04's Anchor (D-772): *Enemies Engaged with you cannot **Disengage**, and
 * moving away from you provokes as normal.* Read by name (`talentRanks("Anchor")`,
 * the inline census's reading) at the two doors it changes - the departure's own
 * measure (`AzerothCombatant#opportunities`, which ignores a Disengage against an
 * Anchor's holder) and the Disengage control (`canvas/engaged.mjs#anchoredBy`),
 * which refuses a mover Engaged with one.
 *
 * The words a Disengage refused by an Anchor is said in.
 */
export const ANCHORED = "AZEROTH.Combat.DisengageAnchored";

/**
 * **WHETHER A MOVER ENGAGED WITH AN ANCHOR MAY DISENGAGE**: never, and the
 * refusal names who holds them - the enemies inside whose reach the mover
 * stands and who hold Anchor, as the Disengage control measured them. Asked
 * before the Half-Action is spent (D-768's order).
 *
 * @param {string[]} anchoredBy  the names of those enemies
 * @returns {{key: string, params: {names: string}}|null}
 */
export function disengageRefusal(anchoredBy = []) {
  const names = [...new Set((anchoredBy ?? []).filter(n => typeof n === "string" && n))].sort();
  return names.length ? { key: ANCHORED, params: { names: names.join(", ") } } : null;
}

/* -------------------------------------------- */
/*  Ready, and the action it holds               */
/* -------------------------------------------- */

/**
 * How much of a trigger or an action is kept. A card is a card: 05 says *name
 * a trigger and an action*, which is a sentence rather than a paragraph.
 */
export const READY_TEXT_MAX = 240;

/**
 * *Name a trigger and an action. When the trigger occurs, spend your Reaction
 * to take it.* (05's Half-Action table.)
 *
 * Both halves are PROSE and stay prose (D2 §12). A vocabulary of triggers
 * would be the tool deciding what a table may wait for, and nothing here
 * detects one - the entry is a record, and somebody presses the button.
 *
 * @returns {{ok: boolean, reason: string|null, entry: object|null}}
 */
export function readyEntry({ trigger = "", action = "", round = null, turn = null } = {}) {
  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, READY_TEXT_MAX);
  const t = clean(trigger);
  const a = clean(action);
  if (!t) return { ok: false, reason: "AZEROTH.Combat.ReadyNeedsTrigger", entry: null };
  if (!a) return { ok: false, reason: "AZEROTH.Combat.ReadyNeedsAction", entry: null };
  return {
    ok: true,
    reason: null,
    entry: {
      trigger: t,
      action: a,
      round: Number.isFinite(Number(round)) ? Number(round) : null,
      turn: Number.isFinite(Number(turn)) ? Number(turn) : null
    }
  };
}

/* -------------------------------------------- */
/*  Whether it may be made at all                */
/* -------------------------------------------- */

/**
 * Whether this Reaction may be made, and the reason where it may not.
 *
 * The reason is an i18n key, not a sentence: the tracker has to say WHY an
 * action is unavailable rather than merely grey it out, and every refusal in
 * this system is localised (CLAUDE.md §11).
 *
 * The order is the order the table would ask in: is there a Reaction left, has
 * one already been spent on THIS attack, and is the thing it needs in hand.
 *
 * @param {string} key   a `REACTIONS` key
 * @param {object} state
 * @param {number} [state.reactionsLeft]   the turn budget's own count
 * @param {boolean} [state.inFight]        out of a fight nothing is spent
 * @param {boolean} [state.alreadyReacted] a Reaction already answered this blow
 * @param {string[]} [state.meleeWeapons]
 * @param {string[]} [state.shields]
 * @param {string[]} [state.attacks]       what an Opportunity Attack could be struck with
 * @param {boolean} [state.leftReach]      the mover really did leave this reach
 * @param {object|null} [state.readied]    the `readyEntry` held on the combatant
 * @param {string[]} [state.classNames]    the classes the reactor holds, for Pummel
 * @param {Array<object>} [state.pools]    `poolSnapshot`'s rows, for a Parry's point
 * @param {Record<string, boolean>} [state.free]  a Reaction of this key left
 *   this round that costs no Reaction (04's Bladeturn for a Parry, Deflection
 *   for a Block; D-772), so a spent Reaction does not refuse it
 * @returns {{ok: boolean, reason: string|null, with: string|null}}
 */
export function canReact(key, {
  reactionsLeft = 1, inFight = true, alreadyReacted = false, meleeWeapons = [], shields = [],
  attacks = [], leftReach = true, readied = null, classNames = [], pools = [], free = {}
} = {}) {
  const row = REACTIONS[key] ?? null;
  if (!row) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoSuch", with: null };
  if (!row.built) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NotBuilt", with: null };
  if (alreadyReacted) return { ok: false, reason: "AZEROTH.Reaction.Refuse.Already", with: null };
  // Out of a started fight there is no turn and no budget; 06 §6's one a round
  // is a rule about rounds, so it holds nobody outside one. A Reaction that
  // costs none this round (Bladeturn, Deflection) needs none left.
  if (inFight && reactionsLeft < 1 && free?.[key] !== true) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoReaction", with: null };
  // **WHAT IT COSTS, BEFORE WHAT IT IS MADE WITH** (06 §6, D-720). *A class
  // that builds Momentum, and 1 Momentum.* A Mage holding a longsword is
  // refused for the class rather than told to draw a weapon, because the
  // weapon would not help; and the point is asked out of a fight as readily as
  // in one, since it is a price rather than a turn's budget.
  if (row.needs === "momentumPool") {
    const purse = parryPoolFor(pools);
    if (!purse) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoMomentumClass", with: null };
    if ((purse.value ?? 0) < (row.cost ?? 0)) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoMomentum", with: null };
  }
  if (row.requires === "shield") {
    if (!shields.length) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoShield", with: null };
    return { ok: true, reason: null, with: shields[0] };
  }
  if (row.requires === "meleeWeapon") {
    if (!meleeWeapons.length) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoMelee", with: null };
    return { ok: true, reason: null, with: meleeWeapons[0] };
  }
  if (row.requires === "leavingReach") {
    // The departure itself. `provokes` is what decides it and the offer only
    // exists where it said yes, but the door asks again: a card is a record of
    // a moment and the world moves under it.
    if (!leftReach) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NotLeaving", with: null };
    // *One attack against them.* A character strikes with what is in hand and
    // a creature with a row off its own block; with neither there is no blow
    // to make, and saying so is better than a button that always refuses.
    if (!attacks.length) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoWeapon", with: null };
    return { ok: true, reason: null, with: attacks[0] };
  }
  if (row.requires === "ready") {
    // *Having used Ready on your turn.* Nothing was named, so there is
    // nothing to take.
    if (!readied?.action) return { ok: false, reason: "AZEROTH.Reaction.Refuse.NoReady", with: null };
    return { ok: true, reason: null, with: readied.action };
  }
  if (row.requires === "class") {
    // **THE BRANCH THAT WAS MISSING** (2026-09-10). `PUMMEL_CLASSES` was read
    // by this module's own test and by no code at all, and `canReact` had no
    // arm for `requires: "class"` - so it fell through to the `{ok: true}`
    // below and would have told a Mage that Pummel was hers to make. Nothing
    // asked it for Pummel today, because Pummel is a class feature and comes
    // through `workflows.useFeature`, which is what made this latent rather
    // than broken; the table is the door's own law and every row in it is
    // answered now.
    //
    // **The 06 §6 clause it does NOT enforce is the second one**: *engaged
    // with a creature in melee* is a judgement about where two tokens stand
    // and about what the table can see, so it is a line on the offer and never
    // a refusal (D2 §12), exactly as *cannot be used against an attack you
    // cannot see* is for Parry and Block.
    const held = (classNames ?? []).map(c => String(c).toLowerCase());
    const wanted = (row.classes ?? []).map(c => c.toLowerCase());
    if (!wanted.some(c => held.includes(c))) {
      return { ok: false, reason: "AZEROTH.Reaction.Refuse.WrongClass", with: null };
    }
    return { ok: true, reason: null, with: null };
  }
  return { ok: true, reason: null, with: null };
}

/**
 * The two defensive Reactions as the incoming attack's card offers them: only
 * the ones the defender could actually make, because a button for a Parry
 * without a weapon is noise the reader has to read every time.
 *
 * The `reason` still rides along, so a caller that wants to grey rather than
 * hide has the words (D-671's *listed and greyed*).
 */
export function defensiveReactions(state = {}) {
  return DEFENSIVE.map(key => ({ key, label: REACTIONS[key].label, ...canReact(key, state) }));
}
