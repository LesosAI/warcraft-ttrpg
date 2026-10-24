/**
 * **THE TWO MARKS A LEGACY NAMES A CREATURE WITH** (the Legacy branches' door
 * 18). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * - **The Challenge** (the Blademaster): *Once per turn, name a creature that can
 *   see you. This costs no action and no Rage. Until the end of your next turn it
 *   takes a Bane on attacks against anybody but you, and your attacks against it
 *   gain a Boon. Naming another creature ends it on the first.* Mak'gora reads
 *   it: *Against the creature you named with The Challenge, you inflict a
 *   Critical Injury on 19 or 20.* The mark is an Active Effect on the USER,
 *   flagged `CHALLENGE_FLAG` with the creature named and spanned to the end of
 *   the user's next turn, so core expires it (D-628); the Bane on the creature is
 *   06 §6's laid Bane, Taunt's shape (D-772). **Once per turn on each of your
 *   own turns** (the plan's *As read*): in a fight, only on the user's own turn
 *   and once in it; out of one there is no turn to count, and it may be named
 *   (MY READING, for the lead: D-778's *"Player can use them at anytime"*).
 * - **The Long Watch** (the Warden): *As a Half-Action, mark one creature you can
 *   see. Until your next Long Rest you know its direction and rough distance, it
 *   does not know you have done this, and your attacks against it ignore 2 Armor
 *   Points. Marking another ends the first.* **Visible only to its owner** (the
 *   lead: *"Yes"*): a FLAG on the user's own actor (`WATCH_FLAG`), never an effect
 *   with an icon and never anything on the creature, cleared at a Long Rest; the
 *   Use's card is whispered to the user's owners.
 *
 * Both answer a TARGET fact `talent-gates.mjs#targetFactsOf` reads -
 * `challenged`, `watched` - for `critical`, `targetBoon` and `pierce` rows.
 */

/** The effect flag The Challenge's mark stands under, on the user. */
export const CHALLENGE_FLAG = "challenge";

/** The actor flag The Long Watch's mark stands under, on the user. */
export const WATCH_FLAG = "watch";

/** The two marks, as an `onUse.mark` names them. */
export const MARK_KINDS = Object.freeze(["challenge", "watch"]);

/** Why naming a creature is refused, as `lang/en.json` keys. */
export const MARK_REFUSALS = Object.freeze({
  one: "AZEROTH.Mark.OneTarget",
  turn: "AZEROTH.Mark.NotYourTurn",
  spent: "AZEROTH.Mark.SpentThisTurn",
  self: "AZEROTH.Mark.NotSelf"
});

/** The round's-record mark The Challenge spends on the user's own turn. */
export const CHALLENGE_TURN_MARK = "challenge";

/**
 * **WHAT A MARK RECORDS OF THE CREATURE** - the token where there is one, the
 * actor, and the name for the card - as plain data, or null for no creature.
 *
 * @param {{tokenId?: string|null, sceneId?: string|null, actorId?: string|null, name?: string}|null} target
 * @returns {{tokenId: string|null, sceneId: string|null, actorId: string|null, name: string}|null}
 */
export function markOf(target) {
  if (!target || typeof target !== "object") return null;
  const tokenId = typeof target.tokenId === "string" && target.tokenId ? target.tokenId : null;
  const actorId = typeof target.actorId === "string" && target.actorId ? target.actorId : null;
  if (!tokenId && !actorId) return null;
  return {
    tokenId,
    sceneId: typeof target.sceneId === "string" && target.sceneId ? target.sceneId : null,
    actorId,
    name: String(target.name ?? "")
  };
}

/** A mark as a stored flag or a query may carry it: the known keys, or null. */
export function cleanMark(raw) {
  return markOf(raw);
}

/** Whether a mark names a creature: by token where both carry one, else by actor. */
export function markNames(mark, target) {
  if (!mark || !target) return false;
  if (mark.tokenId && target.tokenId) return mark.tokenId === target.tokenId;
  return Boolean(mark.actorId) && mark.actorId === target.actorId;
}

/**
 * **THE USER'S MARKS, OFF WHAT IT CARRIES**: the newest Challenge among its active
 * effects' `CHALLENGE_FLAG`s (one stands at a time; the door deletes the old
 * when it names a new one), and the Watch off its own flag.
 *
 * @param {{effects?: Array<object>, watch?: object|null}} o  each ACTIVE effect's
 *   `flags["azeroth-rpg"]`, and the actor's `WATCH_FLAG`
 * @returns {{challenge: object|null, watch: object|null}}
 */
export function marksFrom({ effects = [], watch = null } = {}) {
  let challenge = null;
  for (const flags of effects ?? []) {
    const mark = cleanMark(flags?.[CHALLENGE_FLAG] ?? null);
    if (mark) challenge = mark;
  }
  return { challenge, watch: cleanMark(watch) };
}

/**
 * **WHETHER THE CHALLENGE MAY BE NAMED NOW**: one creature, never the user, and -
 * in a fight - on the user's own turn and once in it (the round's record holds the
 * user's one turn a round, so the round's mark is the turn's). A lang key, or null.
 *
 * @param {{named?: number, self?: boolean, inFight?: boolean, onTurn?: boolean, used?: string[]}} o
 * @returns {string|null}
 */
export function challengeRefusal({ named = 0, self = false, inFight = false, onTurn = false, used = [] } = {}) {
  if ((Math.trunc(Number(named)) || 0) !== 1) return MARK_REFUSALS.one;
  if (self) return MARK_REFUSALS.self;
  if (!inFight) return null;
  if (!onTurn) return MARK_REFUSALS.turn;
  if ((used ?? []).includes(CHALLENGE_TURN_MARK)) return MARK_REFUSALS.spent;
  return null;
}

/**
 * Whether a Watch may be laid: one creature, never the user. A lang key, or null.
 *
 * @param {{named?: number, self?: boolean}} o
 */
export function watchRefusal({ named = 0, self = false } = {}) {
  if ((Math.trunc(Number(named)) || 0) !== 1) return MARK_REFUSALS.one;
  if (self) return MARK_REFUSALS.self;
  return null;
}

/**
 * **WHETHER NAMING THIS CREATURE ENDS THE FIRST** (*Naming another creature ends
 * it on the first*; *Marking another ends the first*): the mark that stands where
 * it names another creature, else null - naming the same creature again leaves
 * nothing to end.
 *
 * @param {object|null} standing
 * @param {object|null} next
 * @returns {object|null}
 */
export function markReplaced(standing, next) {
  if (!standing) return null;
  return markNames(standing, next) ? null : standing;
}

/** The eight points of the compass, from north clockwise, as `lang/en.json` keys' tails. */
export const COMPASS = Object.freeze(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]);

/**
 * **THE DIRECTION AND ROUGH DISTANCE** (The Long Watch: *you know its direction and
 * rough distance*), between two centres in the scene's pixels: one of eight
 * compass points (north is up the board, the canvas's -y), and the feet rounded to
 * the nearest 10 - *rough* (MY READING, for the lead) - never below 5. Null where
 * either point is missing or the two coincide.
 *
 * @param {{x: number, y: number}|null} from
 * @param {{x: number, y: number}|null} to
 * @param {{size?: number, distance?: number}} [grid]  pixels a square, feet a square
 * @returns {{direction: string, feet: number}|null}
 */
export function bearingTo(from, to, { size = 100, distance = 5 } = {}) {
  if (!from || !to || ![from.x, from.y, to.x, to.y].every(v => Number.isFinite(Number(v)))) return null;
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  const px = Math.hypot(dx, dy);
  if (px < 1e-6) return null;
  const perPixel = (Number(distance) > 0 ? Number(distance) : 5) / (Number(size) > 0 ? Number(size) : 100);
  const feet = Math.max(5, Math.round((px * perPixel) / 10) * 10);
  // Clockwise from north: the board's y grows downward.
  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return { direction: COMPASS[Math.round(angle / 45) % 8], feet };
}
