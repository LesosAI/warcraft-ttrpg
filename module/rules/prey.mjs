/**
 * **THE SOVEREIGN'S PREY** (02 §7's Hunt Mortal and Blood-Forged Claws; the San'layn and Sovereign plan's
 * C4). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 02 §7: *Hunt Mortal. Once on each of your turns, mark one creature you can see within 60 feet as your
 * prey. You have one prey at a time. Marking another creature ends the first mark. The mark ends when
 * your prey dies or the fight ends. Outside a fight, you may mark a creature at any time, and the mark
 * lasts 1 minute.* And Blood-Forged Claws: *When your claws hit a creature that is not your prey, you
 * may mark it as your prey.* Unending Pursuit: *When your prey dies ... You may then mark a new prey,
 * even if you have marked one this turn.*
 *
 * The mark is a flag on the SOVEREIGN (`PREY_FLAG`), never on the prey: the prey is the Sovereign's
 * fact, and a creature marked by two Sovereigns is two marks. Whether it still stands is DERIVED
 * (`preyActive`) - the fight it was made in has ended, the minute it was given outside one has run, or
 * the prey is dead - so the fight's end and the clock end it with no write of their own. The Ranger's
 * Quarry (`combat-actions.mjs#markTarget`) is untouched (C-5).
 *
 * **Marking a new prey leaves Tribute alone** (02 §7's *Losing Tribute*: *Marking a new prey leaves it
 * alone*): nothing here touches a pool.
 */

/** The flag on the Sovereign that holds the mark. */
export const PREY_FLAG = "prey";

/** Hunt Mortal's reach (02 §7: *within 60 feet*). */
export const PREY_FEET = 60;

/** *Outside a fight ... the mark lasts 1 minute* (02 §7), in world seconds. */
export const PREY_OUT_OF_FIGHT_SECONDS = 60;

/** The ways a mark is made: Hunt Mortal (once a turn), the claws (on a hit), Unending Pursuit (after a death). */
export const PREY_WAYS = Object.freeze(["hunt", "claws", "pursuit"]);

/** The feature names the marks read (02 §7). */
export const HUNT_MORTAL = "Hunt Mortal";
export const BLOOD_FORGED_CLAWS = "Blood-Forged Claws";
export const UNENDING_PURSUIT = "Unending Pursuit";

const str = v => (typeof v === "string" && v ? v : null);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * A mark as a flag carried it, cleaned, or null.
 *
 * @param {unknown} raw
 * @returns {{actorUuid: string, tokenUuid: string|null, name: string, combatId: string|null, round: number|null, turn: number|null, markedAt: number, way: string}|null}
 */
export function cleanPrey(raw) {
  const actorUuid = str(raw?.actorUuid);
  if (!actorUuid) return null;
  return {
    actorUuid,
    tokenUuid: str(raw?.tokenUuid),
    name: typeof raw?.name === "string" ? raw.name : "",
    combatId: str(raw?.combatId),
    round: num(raw?.round),
    turn: num(raw?.turn),
    markedAt: num(raw?.markedAt) ?? 0,
    way: PREY_WAYS.includes(raw?.way) ? raw.way : "hunt"
  };
}

/**
 * **WHETHER A MARK STILL STANDS**: made in a fight, while that fight still runs; made outside one,
 * for a minute of world time; and never once its creature is dead.
 *
 * @param {object|null} mark  `cleanPrey`'s shape
 * @param {{liveCombats?: Iterable<string>, now?: number, preyDead?: boolean}} o
 */
export function preyActive(mark, { liveCombats = [], now = 0, preyDead = false } = {}) {
  const m = cleanPrey(mark);
  if (!m || preyDead) return false;
  if (m.combatId) return new Set(liveCombats ?? []).has(m.combatId);
  return Number(now) - m.markedAt < PREY_OUT_OF_FIGHT_SECONDS;
}

/** Whether a creature (its actor uuid, or its token uuid) is this Sovereign's prey, the mark standing. */
export function isPreyOf(mark, { actorUuid = null, tokenUuid = null } = {}, facts = {}) {
  const m = cleanPrey(mark);
  if (!m || !preyActive(m, facts)) return false;
  if (tokenUuid && m.tokenUuid) return m.tokenUuid === tokenUuid;
  return Boolean(actorUuid) && m.actorUuid === actorUuid;
}

/**
 * **WHY THIS MARK MAY NOT BE MADE**, or null (02 §7). Reason words; `PREY_REFUSAL_WORDS` says them.
 *
 * - `feature` - Hunt Mortal is not held (or, for the claws, Blood-Forged Claws);
 * - `self` - a creature never marks itself;
 * - `same` - it is already your prey;
 * - `turn` - Hunt Mortal in a fight, off your own turn, or a second time this turn (Unending
 *   Pursuit's free mark after a death excepted, and the claws' mark is never counted);
 * - `far` - Hunt Mortal past 60 feet (a distance that could not be measured is not refused);
 * - `dead` - the creature is at 0 Health.
 *
 * @param {object} o
 * @param {"hunt"|"claws"|"pursuit"} [o.way]
 * @param {boolean} [o.holds]          the feature the way reads is held
 * @param {boolean} [o.self]
 * @param {boolean} [o.same]
 * @param {boolean} [o.inFight]
 * @param {boolean} [o.ownTurn]
 * @param {boolean} [o.markedThisTurn] a Hunt Mortal mark already made this turn
 * @param {boolean} [o.freeMark]       Unending Pursuit's mark after a death stands unspent
 * @param {number|null} [o.feet]
 * @param {number} [o.health]
 * @returns {string|null}
 */
export function preyRefusal({ way = "hunt", holds = true, self = false, same = false, inFight = false, ownTurn = true, markedThisTurn = false, freeMark = false, feet = null, health = 1 } = {}) {
  if (!holds) return "feature";
  if (self) return "self";
  if (Math.trunc(Number(health)) <= 0) return "dead";
  if (same) return "same";
  if (way === "claws") return null;
  if (way === "hunt" || way === "pursuit") {
    if (feet !== null && feet !== undefined && Number.isFinite(Number(feet)) && Number(feet) > PREY_FEET) return "far";
    if (inFight) {
      if (!ownTurn) return "turn";
      if (markedThisTurn && !(way === "pursuit" || freeMark)) return "turn";
    }
  }
  return null;
}

/** The lang key each refusal is said in. */
export const PREY_REFUSAL_WORDS = Object.freeze({
  feature: "AZEROTH.Prey.Refuse.feature",
  self: "AZEROTH.Prey.Refuse.self",
  same: "AZEROTH.Prey.Refuse.same",
  turn: "AZEROTH.Prey.Refuse.turn",
  far: "AZEROTH.Prey.Refuse.far",
  dead: "AZEROTH.Prey.Refuse.dead",
  target: "AZEROTH.Prey.Refuse.target"
});

/** The round mark Hunt Mortal's once-a-turn writes (`identifier@<turn>`, D-779's `turnMark`). */
export const HUNT_MARK = "hunt-mortal";

/** The round mark Unending Pursuit's free mark writes once it is earned, and spends when used. */
export const PURSUIT_FREE_MARK = "unending-pursuit:free";

/**
 * The mark a door writes.
 *
 * @param {{actorUuid: string, tokenUuid?: string|null, name?: string, combatId?: string|null, round?: number|null, turn?: number|null, now?: number, way?: string}} o
 */
export function preyMark({ actorUuid, tokenUuid = null, name = "", combatId = null, round = null, turn = null, now = 0, way = "hunt" } = {}) {
  return cleanPrey({ actorUuid, tokenUuid, name, combatId, round, turn, markedAt: now, way });
}
