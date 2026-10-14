/**
 * **WHICH COMBATANT WRITES MAY LEAVE THE TURN ALONE** (D-765; the lead,
 * 2026-09-30: *Fix it*).
 *
 * Pure: no Foundry imports. `documents/combat.mjs#AzerothCombatant._preUpdateOperation`
 * is the one caller, and it only asks this.
 *
 * **What core does, verified at 14.367.** Every combatant update is stamped
 * with `combatTurn`: the index, in the order the write would set up, of the
 * combatant whose turn it is AS THE WRITING CLIENT SEES IT
 * (`client/documents/combatant.mjs` L249-259, `Combatant._preUpdateOperation`).
 * The server writes that index into the fight whenever it differs from the
 * fight's own (`dist/database/documents/combatant.mjs`, `"combatTurn" in
 * operation`), and every client applies it with `turnEvents: false`
 * (`client/documents/combat.mjs` L730-734, `#onModifyCombatants`). The stamp is
 * there so a write that REORDERS the fight keeps the current creature current.
 *
 * **On a write that reorders nothing it only restates the turn, and a late one
 * restates an OLD turn.** A player's move charge prepared as the GM clicks Next
 * Turn, or the system's own budget reset still in flight when the next click
 * lands, reaches the server after the turn has moved and puts it back - on
 * every client, the 2D board's marker included, with no turn event to say so.
 *
 * **The rule.** Core's stamp is taken off a write when BOTH hold:
 *
 *  1. every update in it touches only the system's own fight bookkeeping on the
 *     combatant (`BOOKKEEPING_FLAGS`), which nothing the order is set up from
 *     reads; and
 *  2. the order the fight stands in (`combat.turns`) is the order a set-up
 *     would make now (`AzerothCombat#_order`). The order is LIVE - it reads
 *     each creature's derived Initiative and side at every set-up, and core
 *     re-sorts only on a combatant write - so a Dexterity elixir drunk
 *     mid-round leaves the standing order stale until the next combatant write
 *     re-sorts it. There the stamp is what keeps the current creature current,
 *     and it stays.
 *
 * A write that names anything else - `initiative`, the `side` flag (which
 * `AzerothCombatant#side` reads), `defeated`, `hidden`, core's own fields -
 * keeps core's stamp, and so does a write whose caller named a turn itself
 * (core's `rollInitiative` does).
 */

/** The flag scope the system writes its combatant flags under. */
export const FLAG_SCOPE = "azeroth-rpg";

/**
 * **THE FIGHT'S BOOKKEEPING ON A COMBATANT**: every flag the system writes on
 * one that the turn order does not read. They are the flags `_leaveFight`
 * clears as *the fight's flags*, plus a Boss's shrugged-off Critical Injuries.
 * The lead named four - the budget, the Moves paid, `acted` and the round's
 * record - and the rest are the same kind of write, made on the same beats: an
 * attack's `lastHitRound` rides one write behind its `round`, and `damageTypes`
 * lands wherever damage does.
 *
 *  - `budget`, `moveHalves`: the turn's Half-Actions, Reaction and the Moves paid (D-712, D-761).
 *  - `acted`: the first turn of the fight is over (02 §7's Sprint).
 *  - `round`, `lastHitRound`: the round's record - struck, was struck, Fast, a Stealth made (D-627).
 *  - `damageTypes`: the damage taken since the end of its last turn (14's Regeneration, D-691).
 *  - `damaged`: who it has hurt this fight (04's Elemental Fury, D-711).
 *  - `marked`: the turn a Hunter's Mark was laid in (02 §7).
 *  - `ready`: a Readied action (06 §6, D-694).
 *  - `heldPosition`: cleared with the fight's flags; nothing writes it now.
 *  - `criticalsIgnored`: a Boss's first two Critical Injuries (14 §1).
 *
 * A NEW combatant flag is classified here or in `ORDER_FLAGS` before it ships:
 * the census in `turn-stamp.test.mjs` fails on one that is in neither.
 */
export const BOOKKEEPING_FLAGS = Object.freeze([
  "budget", "moveHalves", "acted", "round", "lastHitRound", "damageTypes",
  "damaged", "marked", "ready", "heldPosition", "criticalsIgnored"
]);

/**
 * The combatant flags the turn order reads: a GM's side override
 * (`AzerothCombatant#side`, which `AzerothCombat#_order` sorts by). A write to
 * one of these always keeps core's stamp.
 */
export const ORDER_FLAGS = Object.freeze(["side"]);

const BOOKKEEPING = new Set(BOOKKEEPING_FLAGS);

/** A plain object to walk into: not an array, not null, not a class instance core cleaned in (an operator). */
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A key as a flag's name: v13's `-=key` deletion and `==key` replacement forms read as the key itself. */
function flagName(key) {
  const name = String(key).split(".")[0];
  return name.startsWith("-=") || name.startsWith("==") ? name.slice(2) : name;
}

/**
 * The `azeroth-rpg` flags one update touches, or null where it touches
 * anything else - a field, another scope's flag, or the whole scope replaced.
 *
 * Reads both the expanded shape core's diff sends (`{flags: {"azeroth-rpg":
 * {budget: …}}}`) and a dotted one (`{"flags.azeroth-rpg.budget": …}`), and
 * never looks inside a flag's value: whatever is under a flag is that flag's.
 *
 * @param {object} update  one entry of `operation.updates`
 * @returns {Set<string>|null}
 */
export function flagKeysOf(update) {
  if (!isPlainObject(update)) return null;
  const keys = new Set();
  // Everything below `flags`, whether it arrived nested or dotted.
  const scopeEntries = [];
  for (const [key, value] of Object.entries(update)) {
    if (key === "_id") continue;
    const [head, ...rest] = key.split(".");
    if (head !== "flags") return null;
    if (!rest.length) {
      if (!isPlainObject(value)) return null;
      for (const [scope, below] of Object.entries(value)) scopeEntries.push([scope.split("."), below]);
    } else {
      scopeEntries.push([rest, value]);
    }
  }
  for (const [[scope, ...below], value] of scopeEntries) {
    if (scope !== FLAG_SCOPE) return null;
    if (below.length) {
      keys.add(flagName(below[0]));
      continue;
    }
    // The scope itself: every key under it is a flag. Replacing the scope with
    // something that is not an object is not bookkeeping.
    if (!isPlainObject(value)) return null;
    for (const flag of Object.keys(value)) keys.add(flagName(flag));
  }
  return keys;
}

/**
 * Whether one update touches the system's fight bookkeeping and nothing else.
 * An update that names no flag at all is not bookkeeping: it has nothing to say.
 *
 * @param {object} update
 * @returns {boolean}
 */
export function bookkeepingOnly(update) {
  const keys = flagKeysOf(update);
  if (!keys || !keys.size) return false;
  for (const key of keys) if (!BOOKKEEPING.has(key)) return false;
  return true;
}

/**
 * Whether two turn orders are the same combatants in the same order.
 *
 * @param {string[]} standing  the fight's `turns`, as ids
 * @param {string[]} live      the order a set-up would make now, as ids
 */
export function sameOrder(standing, live) {
  if (!Array.isArray(standing) || !Array.isArray(live)) return false;
  if (standing.length !== live.length) return false;
  return standing.every((id, i) => id === live[i]);
}

/**
 * **WHETHER CORE'S TURN STAMP MAY BE TAKEN OFF A COMBATANT WRITE** (D-765): every
 * update is bookkeeping alone, and the fight's standing order is the order a
 * set-up would make now. Anything less keeps core's stamp.
 *
 * @param {object[]} updates  `operation.updates`
 * @param {{standing?: string[], live?: string[]}} orders  ids, the fight's `turns` and `_order()`
 * @returns {boolean}
 */
export function leavesTurnAlone(updates, { standing = null, live = null } = {}) {
  if (!Array.isArray(updates) || !updates.length) return false;
  if (!updates.every(bookkeepingOnly)) return false;
  return sameOrder(standing, live);
}
