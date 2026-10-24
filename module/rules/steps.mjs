/**
 * **A STEP TO A CHOSEN POINT** (the Legacy branches' door 3). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * Nothing in this system put a token where its owner's words said it went. 02's
 * Blink (*move 20 feet to a point you have seen*) and Shadowstep (*move to any
 * point you can see within 60 feet*) said so on the card and moved nobody - the
 * plan's finding, *"02's Blink and Shadowstep move no token"* - and 04's Fade Step
 * and 07's Shadow Walk and Dark Passage arrived with the same words. One door now
 * picks the space and moves the token:
 *
 * - **The pick** is `canvas/place.mjs#pickPoint` - the board or a registered pick
 *   surface (D-763) - with `accept` refusing, in words, a space out of reach,
 *   unseen or occupied, and the pick waiting on (`stepRefusal`).
 * - **The move** is a DISPLACEMENT (`action: "displace"`, as D-769's shapes resize
 *   a token and D-778's forced movement pushes one): core meters it at nothing,
 *   `rules/movement.mjs#creatureMoved` reads it as no creature moving, so it
 *   spends no Move, enters no area and provokes no Opportunity Attack - which is
 *   what *provoking nothing* and *does not provoke Opportunity Attacks* say.
 * - **Who writes**: the mover's owner, or the active GM through `CONFIG.queries`
 *   (`effects/steps.mjs`, `azeroth-rpg.step`) - Slow Time's friend and Dark
 *   Passage's allies are often another player's.
 * - **The order** is D-768's: the pick is a judgement made before anything is paid
 *   (a dismissed pick costs nothing, Lightwell's shape), the move lands once the
 *   Use or the cast is paid for - and for a spell only once its Casting Test
 *   succeeds (07 §8: a failed Test charges the Mana and the spell does not go off).
 *
 * ## What each source says
 *
 * - `FEATURE_STEPS`: 02's two class features, their feet read off 02's rows by the
 *   Vitest. Blink's reach is `class-talents.mjs#blinkFor`'s (Improved Blink), and
 *   Slow Time's friend is the mover where the talent is taken.
 * - `stepOf`: a talent's `onUse.step {feet, sight, refuseWhile, atRank}` at its
 *   rank (04's Fade Step: *Move to a space you can see within 20 feet, or 30 feet
 *   at rank 2, provoking nothing. You cannot do this while Entangled*).
 * - `readSpellStep`: 07's words, read at the cast (Shadow Walk, Dark Passage).
 *
 * **"A point you have seen"** (Blink) is `sight: "seen"`: the door cannot know what
 * the mage has seen before, so the space need not be in sight now - MY READING,
 * for the lead. **"A space you can see"** is `sight: "see"`: the line from the
 * mover to the space is not blocked to sight (core's own `Token#checkCollision`,
 * type `sight`, asked where the token is drawn).
 *
 * **Darkness and shadow** (Shadow Walk's *Both the space you leave and the space
 * you arrive in must be in darkness or in shadow*) is the TABLE's to judge (D2
 * §12): the pick's hint says so in words, and the door moves the token where the
 * caster points.
 */

import { areaFor } from "./areas.mjs";

/** Whether the space must be in sight now (`see`), or merely one the mover has seen (`seen`). */
export const STEP_SIGHT = Object.freeze(["see", "seen"]);

/**
 * **WHOM A STEP MOVES, AS THE GM'S CLIENT JUDGES IT** (the B2 review, item h): a client
 * writes a token it does not own through `azeroth-rpg.step`, and the handler trusts the
 * payload for nothing but which token, which space and which item moves it - the feet
 * and whether that token may be moved at all are read again there off the user's own
 * item (`effects/steps.mjs#stepAllowance`):
 *
 * - `self`   the user's own token (02's Blink and Shadowstep, 04's Fade Step, 07's
 *            Shadow Walk, Dark Passage's caster);
 * - `friend` the one ally Slow Time names (*a friendly target you can see within 30
 *            feet*), within that reach of the user;
 * - `party`  an ally of the user's that a party step carries (07's Dark Passage, *Each
 *            ally within 10 ft*), landing within the burst of the user as it now stands;
 * - `pull`   a creature the user holds Entangled, pulled to a space within the feet of
 *            the user (04's None Escape).
 */
export const STEP_KINDS = Object.freeze(["self", "friend", "party", "pull"]);

/** Why a space a None Escape chose is refused, each in words (`AZEROTH.Pull.Refuse.*`). */
export const PULL_REFUSALS = Object.freeze({
  far: "AZEROTH.Pull.Refuse.Far",
  occupied: "AZEROTH.Pull.Refuse.Occupied",
  unmeasured: "AZEROTH.Pull.Refuse.Unmeasured"
});

/**
 * **A SPACE THE USER CHOSE FOR ONE CREATURE IT PULLS** (04's None Escape: *Every creature
 * within 60 feet that you have Entangled is pulled to a space you choose within 10 feet
 * of you, and stays Entangled*; the lead, 2026-10-21: *"A space you choose"*):
 *
 * - `same`: the creature's own space - it is left where it stands, said on the card
 *   (MY READING, for the lead: the table's out where no space within the feet will
 *   hold it, a flier above the user or a crowded corridor);
 * - `apart`: the feet from the USER's space to the space the creature would fill,
 *   footprint to footprint at the creature's own height (D-732) - never centre to
 *   centre, which put a pulled creature short (the B1 review, item e); null is a space
 *   that could not be measured, which moves nobody;
 * - `occupied`: another creature stands there, or the space was chosen for another
 *   creature this Use pulls.
 *
 * @param {{within?: number, apart?: number|null, occupied?: boolean, same?: boolean}} o
 * @returns {{refusal: string|null, stays: boolean}}  `refusal` a `PULL_REFUSALS` key
 */
export function pullRefusal({ within = 10, apart = null, occupied = false, same = false } = {}) {
  if (same === true) return { refusal: null, stays: true };
  const d = Number(apart);
  if (apart === null || apart === undefined || !Number.isFinite(d)) return { refusal: "unmeasured", stays: false };
  if (d > Math.max(0, Number(within) || 0) + 1e-6) return { refusal: "far", stays: false };
  if (occupied === true) return { refusal: "occupied", stays: false };
  return { refusal: null, stays: false };
}

/**
 * **THE BURST A PARTY STEP CARRIES** (07's Dark Passage: *Target: Each ally within 10 ft*;
 * the B2 review): the circle `rules/areas.mjs#areaFor` reads off the spell's Target line,
 * its radius in feet - every ally of the caster inside it moves with the caster, and
 * nobody else does, whatever is targeted. Null where the line names no circle.
 *
 * @param {string} target  the spell's `system.target`
 * @returns {number|null}
 */
export function partyRadius(target) {
  const area = areaFor(target);
  return area?.shape === "circle" && Number(area.distanceFt) > 0 ? Number(area.distanceFt) : null;
}

/** Who a step moves: the mover alone, or the caster and each creature the spell names. */
export const STEP_WHO = Object.freeze(["self", "selfAndTargets"]);

/** Why a step is refused, each said in words (`AZEROTH.Step.Refuse.*`). */
export const STEP_REFUSALS = Object.freeze({
  far: "AZEROTH.Step.Refuse.Far",
  unseen: "AZEROTH.Step.Refuse.Unseen",
  occupied: "AZEROTH.Step.Refuse.Occupied",
  same: "AZEROTH.Step.Refuse.Same",
  held: "AZEROTH.Step.Refuse.Held",
  noToken: "AZEROTH.Step.Refuse.NoToken",
  unmeasured: "AZEROTH.Step.Refuse.Unmeasured",
  gone: "AZEROTH.Step.Refuse.Gone",
  noGM: "AZEROTH.Step.Refuse.NoGM",
  // A token this step may not move, or an item that moves nobody (the B2 review, item h).
  unallowed: "AZEROTH.Step.Refuse.Unallowed"
});

/**
 * **02's TWO CLASS FEATURES THAT MOVE A TOKEN**, as 02 §7 prints them: Blink's *move
 * 20 feet to a point you have seen* and Shadowstep's *move to any point you can see
 * within 60 feet*. `legacy-bodies.test.mjs` reads both numbers off the chapter's own
 * rows.
 */
export const FEATURE_STEPS = Object.freeze({
  Blink: Object.freeze({ feet: 20, sight: "seen" }),
  Shadowstep: Object.freeze({ feet: 60, sight: "see" })
});

/** A whole number of feet above 0, or null. */
function feetOf(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The conditions a list may name: lower-case ids, each once and sorted. */
function conditionList(value) {
  const list = Array.isArray(value) ? value : (typeof value === "string" && value ? [value] : []);
  return [...new Set(list.filter(c => typeof c === "string" && /^[a-z]+$/.test(c)))].sort();
}

/**
 * **A TALENT'S STEP AT ITS RANK** (04's Fade Step): `onUse.step` with every `atRank`
 * clause the rank has reached laid over it, or null where the Use names none.
 *
 * @param {{step?: {feet?: number, sight?: string, refuseWhile?: string[], atRank?: Array<{rank: number}>}}|null} onUse
 * @param {number} [rank]
 * @returns {{feet: number, sight: "see"|"seen", refuseWhile: string[]}|null}
 */
export function stepOf(onUse, rank = 1) {
  const raw = onUse?.step;
  if (!raw || typeof raw !== "object") return null;
  const r = Math.trunc(Number(rank)) || 1;
  const merged = { ...raw };
  for (const clause of Array.isArray(raw.atRank) ? raw.atRank : []) {
    if (r >= (Math.trunc(Number(clause?.rank)) || Infinity)) {
      const { rank: _r, ...rest } = clause;
      Object.assign(merged, rest);
    }
  }
  const feet = feetOf(merged.feet);
  if (!feet) return null;
  return {
    feet,
    sight: STEP_SIGHT.includes(merged.sight) ? merged.sight : "see",
    refuseWhile: conditionList(merged.refuseWhile)
  };
}

/**
 * **A CONDITION THAT FORBIDS THE STEP** (Fade Step's *You cannot do this while
 * Entangled*): the first the mover suffers, or null.
 *
 * @param {string[]} refuseWhile
 * @param {Iterable<string>} statuses  the mover's
 * @returns {string|null}
 */
export function stepHeldBy(refuseWhile = [], statuses = []) {
  const held = new Set([...(statuses ?? [])].map(String));
  return conditionList(refuseWhile).find(c => held.has(c)) ?? null;
}

/**
 * **WHETHER A SPACE MAY BE STEPPED TO**: the reason it may not, or null.
 *
 * - `apart` is the feet from the mover's space to the destination, measured the
 *   one way every distance here is (`canvas/footprints.mjs#feetToPoint`, D-732);
 *   null is a space the door could not measure, which moves nobody.
 * - A space the token already stands in names no step.
 * - `seen` is the sight test's answer, asked only where the step needs it; null
 *   where it could not be asked, which refuses (a space nobody looked at is not
 *   one the mover can see).
 * - `occupied`: another creature stands in the space the token would fill.
 *
 * @param {{feet: number, apart?: number|null, sight?: string, seen?: boolean|null, occupied?: boolean, same?: boolean}} o
 * @returns {string|null}  a `STEP_REFUSALS` key
 */
export function stepRefusal({ feet, apart = null, sight = "see", seen = null, occupied = false, same = false } = {}) {
  if (same === true) return "same";
  const reach = feetOf(feet);
  const d = Number(apart);
  if (!reach || apart === null || apart === undefined || !Number.isFinite(d)) return "unmeasured";
  if (d > reach + 1e-6) return "far";
  if (sight === "see" && seen !== true) return "unseen";
  if (occupied === true) return "occupied";
  return null;
}

/**
 * The top-left a token takes for its centre to land on a point, before the
 * scene's own snapping: half its footprint back from the point.
 *
 * @param {{x: number, y: number}} point  canvas pixels
 * @param {{width?: number, height?: number, size?: number}} o  the token's squares and the grid's pixels
 * @returns {{x: number, y: number}}
 */
export function topLeftFor(point, { width = 1, height = 1, size = 100 } = {}) {
  const s = Number(size) > 0 ? Number(size) : 100;
  return {
    x: Math.round(Number(point?.x ?? 0) - ((Number(width) || 1) * s) / 2),
    y: Math.round(Number(point?.y ?? 0) - ((Number(height) || 1) * s) / 2)
  };
}

/** Whether two boxes in pixels overlap (touching edges do not). */
export function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * **WHETHER ANOTHER CREATURE STANDS IN THE SPACE** a box would fill: any standing
 * box but the mover's own (and any the caller excepts) overlapping it.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {Array<{id?: string, x: number, y: number, width: number, height: number}>} standing
 * @param {{except?: string[]}} [o]
 */
export function occupiedBy(box, standing = [], { except = [] } = {}) {
  const skip = new Set((except ?? []).filter(Boolean));
  return (standing ?? []).some(s => s && !skip.has(s.id) && overlaps(box, s));
}

/**
 * **WHERE EACH COMPANION OF A PARTY STEP LANDS** (07's Dark Passage: *You and each
 * target move up to 60 feet to spaces you can see*): each by the caster's own
 * displacement, so the party arrives as it stood - MY READING, for the lead: one
 * pick for the caster rather than one for every creature, and a companion whose
 * space is refused stays where it is and is said in words.
 *
 * @param {{x: number, y: number}} from  the caster's top-left before
 * @param {{x: number, y: number}} to    the caster's top-left after
 * @param {Array<{id: string, x: number, y: number}>} members
 * @returns {Array<{id: string, x: number, y: number}>}
 */
export function partyStep(from, to, members = []) {
  const dx = Number(to?.x ?? 0) - Number(from?.x ?? 0);
  const dy = Number(to?.y ?? 0) - Number(from?.y ?? 0);
  return (members ?? []).filter(m => m?.id).map(m => ({ id: m.id, x: Math.round(Number(m.x) + dx), y: Math.round(Number(m.y) + dy) }));
}

/** HTML to flat text, one space. */
function flat(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * **THE STEP 07's WORDS STATE**, or null:
 *
 * - *You move up to 30 feet to a space you can see* (Shadow Walk) - the caster;
 * - *You and each target move up to 60 feet to spaces you can see* (Dark Passage) -
 *   the caster and each creature the spell names.
 *
 * `shadow` where the entry asks for darkness or shadow at both ends, which the
 * table judges (D2 §12) and the pick's hint names. A spell 07 moves some other way
 * is named in `STEP_UNREAD` with its reason.
 *
 * @param {string} effectText  the entry's effect, HTML or flat
 * @returns {{who: "self"|"selfAndTargets", feet: number, sight: "see", shadow: boolean}|null}
 */
export function readSpellStep(effectText) {
  const text = flat(effectText);
  const shadow = /\bin darkness or in shadow\b/i.test(text);
  let m = /^You move up to (\d+) feet to a space you can see\b/.exec(text) ?? /(?:^|\. )You move up to (\d+) feet to a space you can see\b/.exec(text);
  if (m && !/\bany place you have stood before\b/.test(text)) return { who: "self", feet: Number(m[1]), sight: "see", shadow };
  m = /\bYou and each target move up to (\d+) feet to spaces you can see\b/.exec(text);
  if (m) return { who: "selfAndTargets", feet: Number(m[1]), sight: "see", shadow };
  return null;
}

/**
 * **EVERY 07 ENTRY THAT MOVES A CREATURE TO A SPACE AND THAT THE READER DOES NOT
 * TAKE**, by name, with its reason - the census in `legacy-bodies.test.mjs` fails a
 * new one.
 */
export const STEP_UNREAD = Object.freeze({
  Translocate: "the TARGET is moved and an unwilling one may resist with a Spirit Resilience Test first, which is a Resist the card would have to answer before the move; the move stays the table's",
  Farstep: "a place the mage has stood before and can picture is no point on the board, and arriving in a space that will not hold the mage puts them in the nearest that will for 4 damage, where this door refuses an occupied space; the move stays the table's"
});
