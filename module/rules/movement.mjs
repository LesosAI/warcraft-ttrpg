/**
 * How far a turn's Half-Actions carry you (05 §10, D-718). Pure, no Foundry
 * imports (CLAUDE.md §3).
 *
 * 05 §10 states it once: *A Move Half-Action carries you up to your Speed.
 * Two of them carry you twice as far.* Until D-718 the system only WARNED
 * after the fact — `AzerothCombatant#spendMovement` charged what it could and
 * printed a notice for the rest — so a token could be dragged the length of a
 * scene on one Half-Action and the tracker said nothing that stopped it.
 *
 * The pace is the Speed the move is being made at. A creature that FLIES has
 * two (14 §1: *a rider shows both paces — its own and its mount's — and so
 * does anything that flies*), and v14 names which one is in use: every
 * movement waypoint carries an `action`, and `fly` is one of core's own
 * (`CONFIG.Token.movement.actions`, verified at 14.367). So the pace is read
 * off the move rather than off a guess about the creature.
 *
 * **What the turn pays for is not what it has LEFT.** A drag is judged against
 * the whole turn's movement — core's history plus this path — so the Half-
 * Actions already spent ON MOVING have to be counted back in, or a second drag
 * would be measured as if the first had never happened. That is `paid`.
 *
 * The same sum is what `AzerothCombatant#spendMovement` charges against, so the
 * limit and the spend cannot disagree: a drag the rule allows is a drag the
 * budget pays for, to the foot.
 *
 * **And the charge is worked out whole before it is written** (D-761):
 * `chargeMoves` folds `rules/initiative.mjs#spend` over the Moves owed, so the
 * combatant writes the budget and the Moves paid in one update, one charge at a
 * time; `movementLeft` answers what the same judgement still allows (D-762).
 *
 * **On a grid a step costs the squares it enters** (D-764): a step inside one
 * square is free, drawn or not, and each square entered costs the scene's grid
 * distance by its diagonal rule (`stepFeet`, `measuredStep`, `squareFeet`).
 */

import { spend } from "./initiative.mjs";

/** Core's own movement action for flight (`CONFIG.Token.movement.actions.fly`). */
export const FLY_ACTION = "fly";

/** Core's own movement action for swimming (`CONFIG.Token.movement.actions.swim`). */
export const SWIM_ACTION = "swim";

/**
 * **THE CONDITIONS WHOSE RULE IS *YOUR SPEED IS 0*** (A1): Entangled, and Prone
 * until you **Stand**. The final review of D-757 (2026-09-26) found a creature
 * brought to Speed 0 moving freely, because a pace of 0 was read as *no pace to
 * judge*. A creature carrying either moves at no pace at all - on foot, in the
 * air or in the water - since A1 names no pace it leaves standing. 05 writes
 * crawling once, as a price (*Climbing, swimming, and crawling cost the same*),
 * and gives Prone no crawl: a Prone creature Stands, then moves.
 * `movement.test.mjs` reads the list off A1.
 */
export const STOPPING_CONDITIONS = Object.freeze(["entangled", "prone"]);

/**
 * **HOW FAST A CREATURE SWIMS, BY THE WORDS 14 WRITES** (the final review of
 * D-757): *swims at its Speed* is a Speed of its own, and *swims at twice its
 * Speed* twice it - keyed by the sense `rules/ability-automation.mjs` reads off
 * those words, the same sense `NpcData` derives `swimSpeed` from. 02's Island
 * Blood (*You swim at full Speed*) is the first of the two.
 */
export const SWIM_SENSES = Object.freeze({ swim: 1, swimFast: 2 });

/**
 * The multiple of its Speed a creature swims at, off its senses: 2, 1, or 0 for
 * a creature that swims the way 05 prices it, at two feet a foot.
 *
 * @param {string[]|Set<string>} [senses]
 * @returns {number}
 */
export function swimMultiplier(senses = []) {
  let most = 0;
  for (const sense of senses ?? []) most = Math.max(most, SWIM_SENSES[sense] ?? 0);
  return most;
}

/**
 * Whether a creature carries a condition that holds its Speed at 0.
 *
 * @param {string[]|Set<string>} [statuses]
 * @returns {boolean}
 */
export function stoppedBy(statuses = []) {
  const held = statuses instanceof Set ? statuses : new Set(statuses ?? []);
  return STOPPING_CONDITIONS.some(id => held.has(id));
}

/**
 * **WHETHER A CREATURE HAS A PACE BY ITS OWN NATURE** (the final review of
 * D-757): its race's Speed or its block's, the first of its Speed parts
 * (`rules/speed.mjs`), before anything it carries, wears or has laid on it. A
 * totem is Speed 0 by nature (14 §13) and nobody walks it; a creature BROUGHT
 * to 0 - Entangled, Prone, an area's Speed drop, a load - has a pace and cannot
 * use it, and the two are judged differently (`movementAllowed`).
 *
 * @param {Array<{key: string, value: number}>} [speedParts]
 * @returns {boolean}
 */
export function pacedByNature(speedParts = []) {
  const parts = Array.isArray(speedParts) ? speedParts : [];
  const base = parts.find(p => p?.key === "race" || p?.key === "block") ?? parts[0] ?? null;
  return Number(base?.value) > 0;
}

/*
 * WHAT A FOOT COSTS (05 §10; D-757, the lead's call of 2026-09-25):
 *
 *   - **Difficult ground** (rubble, deep snow, corpses, thick undergrowth)
 *     costs two feet for every one crossed.
 *   - **Climbing, swimming, and crawling** cost the same. You cover half the
 *     distance.
 *
 * *The budget charges core's cost, matched to 05*: Difficult ground, climb,
 * swim and crawl are two feet a foot; a jump is one, because 05 is silent and
 * core's default of two would charge a leap as a climb; and **overlapping
 * Difficult ground takes the higher cost and never multiplies**. The last is
 * read as ONE principle for every pair 05 prices the same (the implementer's
 * reading, D-757, for the lead to confirm): a creature crawling through
 * Difficult ground pays two feet a foot, not four, because 05 gives each of
 * them the same single price and no rule for stacking them.
 */

/** 05 §10: *costs two feet for every one crossed*. The difficulty a Difficult-ground Region lays. */
export const DIFFICULT_COST = 2;

/**
 * The cost a MOVEMENT ACTION puts on each foot, by core's action key
 * (`CONFIG.Token.movement.actions`, 14.367). An action absent here costs a
 * foot a foot. `canvas/behaviors.mjs` gives each of these actions a
 * `getCostFunction` at `init` that reads this table through `actionCost`;
 * core keeps a function it is given and builds one off `costMultiplier` only
 * where none was (`Game#initializeMovementActions`, game.mjs:846-850).
 */
export const ACTION_COST = Object.freeze({ swim: 2, crawl: 2, climb: 2, jump: 1 });

/**
 * Whether a step lies on ground a GM made free: a Region at difficulty 0,
 * which core costs 0 with the terrain on the waypoint to say why. An
 * unrendered token's step is costed 0 too and carries no terrain at all.
 */
function freeGround(waypoint) {
  const difficulty = waypoint?.terrain?.difficulty;
  return difficulty !== null && difficulty !== undefined && Number(difficulty) === 0;
}

/*
 * A STEP IS CHARGED BY THE SQUARES IT ENTERS (D-764; the lead, 2026-09-29:
 * *squares entered. Each square can be configured at the scene level for an
 * amount of feet per square, default is 5*).
 *
 * The 2D board's rule, for every walk: moving about inside your square is
 * free, and each square you enter costs the SCENE's grid distance (Difficult
 * ground twice it), diagonals by the scene's diagonal rule. `system.json`'s
 * `grid.distance` is the 5 a new scene starts from; a GM sets another per
 * scene, and nothing here names a number of feet.
 *
 * Verified at 14.367 (`common/grid/square.mjs` L479-594, `hexagonal.mjs`
 * L925-1023): core's grid measures a step's `cost` off the grid OFFSETS its two
 * ends fall in - `c` spaces by the diagonal rule, times the grid's `distance`,
 * and 0 where both ends lie in one space - and its `distance` off the pixel
 * positions. A token resting off its square's centre (a GM's unsnapped drag, a
 * 3D view's continuous walk) takes steps that stay inside one square: core
 * costs them 0 and measures a distance, and the meter read that shape as an
 * UNRENDERED token and charged the distance on top of the squares the walk's
 * boundary crossings had already paid for.
 */

/**
 * **THE COST FUNCTION THAT MAKES CORE'S GRID MEASURE A STEP IN SQUARES** (D-764):
 * the feet the grid hands it for a move between spaces, unchanged. Handed to
 * `TokenDocument#measureMovementPath` as `cost`, a step's `backward.cost` is the
 * squares it enters times the grid's distance, by the diagonal rule, the turn's
 * alternating diagonals carried along the whole path - `grid.measurePath`'s own
 * cost with no cost function (*the distance travelled along the direct path*,
 * `common/grid/base.mjs` L385), except that a blink's squares are counted where
 * core's bare measure costs a teleport nothing (`square.mjs` L581). A step
 * inside one space is 0 either way, and a `displace` is never measured.
 *
 * @param {object} from   core's grid offset the move starts in
 * @param {object} to     core's grid offset it ends in
 * @param {number} feet   what the grid measures the move at
 * @returns {number}
 */
export function squareFeet(from, to, feet) {
  return feet;
}

/**
 * **ONE STEP OF A MOVE AS CORE'S GRID MEASURED IT** (D-764): the `distance`
 * walked, and the `squares` it entered in feet - the `backward` segment of a
 * measurement taken with `squareFeet` - or `squares: null` on a GRIDLESS scene,
 * which has no squares and meters the walked distance as it always did. A
 * missing segment (the first waypoint of a path, which starts it) is a step of
 * nothing.
 *
 * @param {{distance?: number, cost?: number}|null} segment  core's `backward` segment
 * @param {{gridless?: boolean}} [o]
 * @returns {{distance: number, squares: number|null}}
 */
export function measuredStep(segment, { gridless = false } = {}) {
  const distance = Math.max(0, Number(segment?.distance) || 0);
  if (gridless) return { distance, squares: null };
  const squares = Number(segment?.cost);
  return { distance, squares: Number.isFinite(squares) && squares > 0 ? squares : 0 };
}

/**
 * **THE FEET ONE STEP OF A MOVE SPENT** (the final review of D-757,
 * 2026-09-26; D-764): on a grid, **the squares it entered**, and on a gridless
 * scene the step's own measured `cost` where core measured one and its distance
 * where it did not.
 *
 * **On a grid** (D-764; the lead: *squares entered*):
 *
 * - **a step that enters no new space costs nothing**, drawn or not: both its
 *   ends lie in one square (hex, cube);
 * - a step that enters spaces is charged **core's measured cost** where core
 *   measured one - Difficult ground, a climb, a swim and a crawl at two feet a
 *   foot (D-757), and nothing across a GM's free Region;
 * - and where core measured none, **the squares it entered** in feet
 *   (`measuredStep`), never its distance.
 *
 * Core leaves a step's cost unmeasured in two shapes (14.367,
 * `client/documents/token.mjs`): **a token that is not rendered** - the passed
 * waypoints of a move whose placeable is not drawn are costed 0 (L1905-1906) -
 * and **a waypoint recorded with no cost**, imputed as `Infinity` (L1775) and
 * stored as null (L2009-2010). On a grid a 0 over a square entered is the
 * first, unless the step stands on free ground, and a 0 over no square entered
 * is a step inside one - or a move of nothing: the first waypoint of a path, or
 * a displacement, which core does not measure.
 *
 * **On a gridless scene** there are no squares, and a step is charged as it
 * was before D-764: its cost where core measured one, and its distance where it
 * did not - a 0 over a real distance being the undrawn token. A bare number is
 * a distance with no squares, read the same way.
 *
 * @param {{cost?: number|null, terrain?: {difficulty?: number|null}|null}|null} waypoint
 * @param {{distance?: number, squares?: number|null}|number} step  the step as
 *   core's grid measured it (`measuredStep`), from the waypoint before it
 * @returns {number} feet, never negative
 */
export function stepFeet(waypoint, step) {
  const { distance, squares } = step !== null && typeof step === "object" ? step : { distance: step, squares: null };
  const d = Math.max(0, Number(distance) || 0);
  const raw = waypoint?.cost;
  const cost = raw === null || raw === undefined ? NaN : Number(raw);
  const measured = Number.isFinite(cost) && cost >= 0;
  if (squares === null || squares === undefined) {
    if (!measured) return d;
    if (cost === 0 && d > 0 && !freeGround(waypoint)) return d;
    return cost;
  }
  const entered = Math.max(0, Number(squares) || 0);
  if (entered === 0) return 0;
  if (measured && (cost > 0 || freeGround(waypoint))) return cost;
  return entered;
}

/**
 * **HOW MANY FEET OF MOVEMENT ONE SECTION OF A MOVE SPENT**, off core's own
 * measurement.
 *
 * **Step by step where the caller measured the steps** (the final review of
 * D-757): each waypoint by `stepFeet` - on a grid the squares it entered, at
 * core's cost where core measured one (D-764). Metered whole, a section mixing
 * an unrendered move with a rendered one charged only the rendered cost, a
 * section holding one waypoint recorded with no cost lost every other step's
 * two feet a foot, and a walk across a GM's free Region was charged its whole
 * distance.
 *
 * **Whole, off the section's own totals, where it did not** - core threw, or a
 * caller named a bare distance: the `cost` where core measured one, and the
 * `distance` where the cost is unmeasured - a cost of 0 over a real distance
 * is an unrendered move, unless every step of it stands on free ground. This
 * is the reading of last resort and knows nothing of squares.
 *
 * @param {{cost?: number, distance?: number, waypoints?: object[]}|null} section
 * @param {Array<{distance: number, squares: number|null}|number>|null} [steps]
 *   each waypoint's step from the one before (`measuredStep`), index for index,
 *   as `documents/combat.mjs#movementSteps` measures them
 * @returns {number} feet, never negative
 */
export function sectionFeet(section, steps = null) {
  const waypoints = Array.isArray(section?.waypoints) ? section.waypoints : null;
  if (waypoints && Array.isArray(steps) && steps.length === waypoints.length) {
    return waypoints.reduce((feet, waypoint, i) => feet + stepFeet(waypoint, steps[i]), 0);
  }
  const distance = Math.max(0, Number(section?.distance) || 0);
  const raw = section?.cost;
  const cost = raw === null || raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(cost) || cost < 0) return distance;
  if (cost === 0 && distance > 0) {
    const moving = (waypoints ?? []).filter(w => w?.action !== "displace");
    return moving.length && moving.every(freeGround) ? 0 : distance;
  }
  return cost;
}

/**
 * **THE FEET OF MOVEMENT A TURN HAS SPENT, THIS MOVE INCLUDED** (D-757): the
 * history core keeps for the turn - its recorded and unrecorded halves, each
 * metered on its own, since one may have been measured and the other not -
 * and the passed path. It is what the turn budget charges and what the limit
 * judges (`AzerothCombatant#spendMovement`, `#movementVerdict`,
 * `onPreMoveToken`), so a Difficult-ground step costs a Plagued Ghoul two feet
 * where the same step costs a bandit one.
 *
 * A movement that names a bare `distance` - a test calling the combatant, an
 * API caller - is metered at its distance, which is what it always was.
 *
 * **On a grid a step is charged by the squares it enters** (D-764), so a walk
 * that stops off its squares' centres pays for the squares it crossed and not
 * again for the feet it wandered inside them.
 *
 * @param {object} movement  a TokenMovementOperation or TokenPreMovementOperation
 * @param {{recorded?: object[], unrecorded?: object[], history?: object[], passed?: object[]}|null} [steps]
 *   each section's steps (`measuredStep`) where the caller measured them (`sectionFeet`)
 * @returns {number}
 */
export function meteredFeet(movement, steps = null) {
  const history = movement?.history ?? null;
  let spent = 0;
  if (history && (history.recorded || history.unrecorded)) {
    spent += sectionFeet(history.recorded, steps?.recorded ?? null) + sectionFeet(history.unrecorded, steps?.unrecorded ?? null);
  } else {
    spent += sectionFeet(history, steps?.history ?? null);
  }
  return spent + sectionFeet(movement?.passed ?? null, steps?.passed ?? null);
}

/**
 * **THE DIFFICULTY OF A SPACE WHERE TERRAIN OVERLAPS** (D-757): the HIGHEST of
 * the terrain effects standing on it, never their product - *overlapping
 * Difficult ground takes the higher cost, never multiplies* (the lead). Core's
 * own `TerrainData.resolveTerrainEffects` multiplies (14.367,
 * `client/data/terrain-data.mjs:86-93`, and its behavior's hint says
 * *Overlapping movement cost modifications stack multiplicatively*), so two
 * Blizzards over one field charged four feet a foot.
 *
 * A null difficulty is impassable - `TerrainData#_initialize` reads null as
 * `Infinity` - and a difficulty below 1 (a road a GM drew) stands where nothing
 * higher does. No effect, or nothing but 1, is no terrain at all.
 *
 * @param {Array<{name?: string, difficulty?: number|null}>} effects
 * @returns {number|null}  the difficulty, or null where the space is plain ground
 */
export function resolveDifficulty(effects = []) {
  let most = null;
  for (const effect of effects ?? []) {
    if (effect?.name !== "difficulty") continue;
    const raw = effect.difficulty;
    const d = raw === null || raw === undefined ? Infinity : Number(raw);
    if (Number.isNaN(d) || d < 0) continue;
    most = most === null ? d : Math.max(most, d);
  }
  return most === null || most === 1 ? null : most;
}

/**
 * **THE DIFFICULTY ON A SPACE THAT A SPELL OR A FEATURE LAID** (D-779; 04's Master
 * of the Land: *ignore movement penalties from non-magical sources*): the highest
 * of the effects marked `magical` - a spell area's Difficult ground, laid by the
 * system's own behavior - or null where none is. A GM's own drawn rubble (core's
 * Modify Movement Cost) is the table's terrain and carries no mark.
 *
 * @param {Array<{name: string, difficulty: number|null, magical?: boolean}>} effects
 * @returns {number|null}
 */
export function resolveMagicalDifficulty(effects = []) {
  return resolveDifficulty((effects ?? []).filter(e => e?.magical === true));
}

/**
 * **THE DIFFICULTY A CREATURE PAYS** on terrain of this difficulty (D-757).
 * One that ignores Difficult ground - Firewalk's *from every source*, a
 * Ghost Wolf, Blessing of Freedom, a dwarf's Mountain-Bred - pays a foot a
 * foot where the ground would charge more, and still cannot cross what is
 * impassable, which is a wall and not Difficult ground. A cheaper surface stays
 * cheap.
 *
 * @param {number|null|undefined} difficulty
 * @param {{ignoresGround?: boolean}} [o]
 * @returns {number}
 */
export function paidDifficulty(difficulty, { ignoresGround = false } = {}) {
  const d = difficulty === null || difficulty === undefined ? 1 : Number(difficulty);
  if (!Number.isFinite(d)) return d;
  if (ignoresGround && d > 1) return 1;
  return d;
}

/**
 * **WHAT A STEP COSTS UNDER A MOVEMENT ACTION** (D-757): the terrain's cost or
 * the action's own two-feet-a-foot, whichever is HIGHER - 05 gives climbing,
 * swimming and crawling the same single price as Difficult ground and no rule
 * for stacking them, so the lead's *never multiplies* is read for this pair as
 * for two overlapping areas. `climbsFree` is Mountain-Bred's *Climbing ... cost
 * you no extra movement*; `swimsFree` a creature that swims at its Speed or
 * twice it (14's Amphibious and Strong Swimmer, 02's Island Blood; the final
 * review of D-757), which 05's price for a swim is not written for.
 *
 * @param {number} terrainCost  what the ground charged for the step
 * @param {number} distance     the step's distance
 * @param {string} action       core's movement action key
 * @param {{climbsFree?: boolean, swimsFree?: boolean}} [o]
 * @returns {number}
 */
export function actionCost(terrainCost, distance, action, { climbsFree = false, swimsFree = false } = {}) {
  const base = Number(terrainCost);
  const free = (action === "climb" && climbsFree) || (action === SWIM_ACTION && swimsFree);
  const multiplier = free ? 1 : (ACTION_COST[action] ?? 1);
  if (!Number.isFinite(base)) return base;
  if (multiplier <= 1) return base;
  return Math.max(base, multiplier * Math.max(0, Number(distance) || 0));
}

/**
 * Grid measurement is floating point — three diagonals on a gridless scene
 * measure 30.000000000000004 — so a comparison against the allowance needs a
 * hair of slack or an exactly-legal move is refused.
 */
const EPSILON = 1e-6;

/**
 * **WHETHER A MOVE IS A CREATURE MOVING, OR A TOKEN PUT SOMEWHERE** (the final
 * review of D-757). Core fires `moveToken` for all of these (14.367,
 * `client/documents/token.mjs`), and only the first enters an area:
 *
 * - an **undo** - `TokenDocument#revertRecordedMovement` and the token layer's
 *   own, both `isUndo`, their path displaced (L1802, L2277, L2385) - puts the
 *   token back;
 * - a **paste** puts a token down;
 * - a path **displaced from end to end** is a token PUT somewhere: a GM's
 *   reposition from the token's sheet, a teleport Region's destination. Core's
 *   own Regions read it so: *Displacement does not trigger teleportation*
 *   (`data/region-behaviors/teleport-token.mjs`).
 *
 * **A blink still moves the creature.** `blink` is a movement action a creature
 * chooses - a teleport it makes itself, 02's Blink or a spell carrying its
 * caster - and arriving inside an area by one is entering it. Only `displace`,
 * core's word for a token put somewhere, is not.
 *
 * @param {object} movement     a TokenMovementOperation
 * @param {object} [operation]  the update operation `moveToken` hands over
 * @returns {boolean}
 */
export function creatureMoved(movement, operation = {}) {
  if (operation?.isUndo === true || operation?.isPaste === true) return false;
  if (movement?.method === "undo" || movement?.method === "paste") return false;
  const waypoints = movement?.passed?.waypoints ?? [];
  if (waypoints.length && waypoints.every(w => w?.action === "displace")) return false;
  return true;
}

/**
 * Which movement action a move was made with, off v14's own waypoints.
 *
 * The LAST passed waypoint is the honest one: a creature that walks to a cliff
 * and then flies has flown the part that matters, and core writes the action
 * per segment. A movement with no waypoints at all - a test calling the
 * combatant directly, an API move - walks.
 *
 * @param {object} movement  A TokenMovementOperation or TokenPreMovementOperation.
 */
export function actionOf(movement) {
  const waypoints = movement?.passed?.waypoints;
  const last = Array.isArray(waypoints) ? waypoints[waypoints.length - 1] : null;
  return last?.action ?? "walk";
}

/**
 * The pace a move is made at, in feet.
 *
 * - **Flying** at the flying pace where the creature has one (14 §1).
 * - **Swimming** at its Speed or twice it where the creature swims by nature
 *   (`swims`, `swimMultiplier`; the final review of D-757): the Speed as it
 *   stands now, so a Slowed murloc swims at half. Anything else swims at its
 *   Speed and pays 05's two feet a foot (`actionCost`).
 * - **Nothing at all** while a condition holds its Speed at 0 (`stopped`,
 *   `STOPPING_CONDITIONS`): an Entangled drake does not fly out of the net.
 *
 * @param {{speed?: number, flyingSpeed?: number|null, swims?: number, stopped?: boolean}} paces
 * @param {string} [action]  A `CONFIG.Token.movement.actions` key.
 * @returns {number} feet, never negative
 */
export function paceFor({ speed = 0, flyingSpeed = null, swims = 0, stopped = false } = {}, action = "walk") {
  if (stopped) return 0;
  const ground = Math.max(0, Math.trunc(Number(speed)) || 0);
  const flying = Math.max(0, Math.trunc(Number(flyingSpeed)) || 0);
  // A creature with no flying pace flies nowhere faster than it walks: the
  // ground Speed is the honest fallback, and refusing the move outright would
  // stop every GM who nudges a token with the fly action selected.
  if (action === FLY_ACTION && flying > 0) return flying;
  const swimming = Math.max(0, Math.trunc(Number(swims)) || 0);
  if (action === SWIM_ACTION && swimming > 0) return ground * swimming;
  return ground;
}

/**
 * Whether the turn's Half-Actions pay for this much movement.
 *
 * **HOW MANY MOVES THE TURN CAN HOLD IS `paid + halfActionsLeft + freeMove`**,
 * and that sum is NOT capped at 05 §10's two. It already carries everything:
 * `paid` is the Moves this turn has made, `halfActionsLeft` what the budget
 * still holds, and `freeMove` 02 §7's Sprint, which is a Move that costs no
 * Half-Action — so a Rogue on the first turn of a fight has **three** Moves and
 * covers three times their Speed. A flat ceiling of two refuses exactly the
 * Move Sprint exists to give, and it refuses a Half-Action the GM has put back
 * from the tracker (D-718) for the same reason.
 *
 * The sum cannot run away: every Move spends either a free one or a half, so
 * it stays at the turn's two plus whatever was granted free, less any half
 * spent on something that was not a Move.
 *
 * **A creature with no pace BY NATURE is not judged** (`unpaced`): a totem is
 * Speed 0 in its block (14 §13), so whatever moves it is somebody else's doing
 * and 05 has nothing to say about it.
 *
 * **A pace BROUGHT to 0 refuses every foot** (the final review of D-757,
 * 2026-09-26; `stopped`): Entangled's and Prone's *Your Speed is 0* (A1), an
 * area's Speed drop, a load it cannot carry. Until then any pace of 0 read as
 * a totem's, and an Entangled creature walked out of the net. **The default
 * is to judge**: a caller that forgets to say a creature has no pace by nature
 * refuses its move rather than letting it walk.
 *
 * @returns {{ok: boolean, allowedFeet: number|null, halves: number, stopped?: true}}
 */
export function movementAllowed({ distance = 0, pace = 0, paid = 0, halfActionsLeft = 0, freeMove = 0, unpaced = false } = {}) {
  const feet = Math.max(0, Number(distance) || 0);
  if (unpaced) return { ok: true, allowedFeet: null, halves: 0 };
  const halves = wholeCount(paid) + wholeCount(halfActionsLeft) + wholeCount(freeMove);
  if (!(pace > 0)) return { ok: feet <= EPSILON, allowedFeet: 0, halves, stopped: true };
  const allowedFeet = pace * halves;
  return { ok: feet <= allowedFeet + EPSILON, allowedFeet, halves };
}

/** A count of Moves or Half-Actions: a whole number, never below 0. The one reading every rule here shares. */
function wholeCount(n) {
  return Math.max(0, Math.trunc(Number(n)) || 0);
}

/* ====================== D-761: a walk charged once, and the feet it has left */

/**
 * **HOW MANY MOVES A TURN'S WALK HAS HAD TO PAY FOR** (05 §10, D-718): one for
 * every Speed's worth of feet the turn has spent, and never more than the turn
 * holds (`movementAllowed`'s `halves`), so a drag the limit allows is a drag the
 * budget pays for.
 *
 * **With the verdict's own hair of slack** (D-761): three diagonals on a
 * gridless scene measure 30.000000000000004 feet, which the limit lets through
 * as thirty and a bare `Math.ceil` charged as two Moves.
 *
 * @param {{spent?: number, pace?: number, halves?: number}} o
 *   `spent` the feet the turn has spent with this move, at core's cost
 *   (`meteredFeet`); `pace` the move's pace; `halves` the Moves the turn holds
 * @returns {number}
 */
export function movesNeeded({ spent = 0, pace = 0, halves = 0 } = {}) {
  if (!(pace > 0)) return 0;
  const feet = Math.max(0, Number(spent) || 0);
  return Math.min(wholeCount(halves), Math.max(0, Math.ceil((feet - EPSILON) / pace)));
}

/**
 * **THE CHARGE FOR A TURN'S WALK, WORKED OUT BEFORE ANYTHING IS WRITTEN** (D-761;
 * the lead, 2026-09-29: *Fix it in the system*).
 *
 * The Moves still owed are spent one at a time off the budget exactly as
 * `rules/initiative.mjs#spend` spends one - a free Move first (02 §7's Sprint,
 * D-712), then a Half-Action - and the first the budget refuses ends the
 * charge, with its reason. **Pure, so the caller can write the budget and the
 * Moves paid in ONE update**: `AzerothCombatant#spendMovement` awaited a spend
 * per Move and wrote the count after, and a reader between the two writes saw a
 * Half-Action spent and no Move paid for - a second move's charge paid again,
 * and the limit refused a move the turn could still pay for.
 *
 * @param {object} budget  the combatant's budget (`freshTurn`'s shape)
 * @param {{paid?: number, needed?: number, onTurn?: boolean}} [o]
 *   `paid` the Moves the turn has already paid for; `needed` the Moves the walk
 *   needs (`movesNeeded`); `onTurn` whether it is the mover's own turn
 * @returns {{budget: object, paid: number, refusal: {reason: string, params: object}|null}}
 *   the budget after the charge, the Moves paid for with it, and why it stopped
 *   short, if it did
 */
export function chargeMoves(budget, { paid = 0, needed = 0, onTurn = true } = {}) {
  let current = budget;
  let count = wholeCount(paid);
  const owed = wholeCount(needed);
  while (count < owed) {
    const result = spend(current, "half", { isMove: true, onTurn });
    if (!result.ok) return { budget: current, paid: count, refusal: { reason: result.reason, params: result.params ?? {} } };
    current = result.budget;
    count += 1;
  }
  return { budget: current, paid: count, refusal: null };
}

/**
 * **WHY A TOKEN'S MOVE IS NOT METERED AT ALL** (D-762): the reasons
 * `game.system.azeroth.movement.remaining` answers with instead of a number, so
 * nothing that is not a limit ever reads as one.
 *
 * - `noToken`: nothing that is a token was handed over.
 * - `noFight`: the token's creature is in no started fight.
 * - `notCombatant`: the fight holds the creature, but not this token.
 * - `notTurn`: it is not this combatant's turn - a move now is somebody
 *   else's business (a shove, a GM's nudge), and 05 §10 does not charge it.
 * - `unpaced`: no pace by nature, a totem (`pacedByNature`): never judged.
 */
export const MOVEMENT_UNMETERED = Object.freeze({
  NO_TOKEN: "noToken",
  NO_FIGHT: "noFight",
  NOT_COMBATANT: "notCombatant",
  NOT_TURN: "notTurn",
  UNPACED: "unpaced"
});

/**
 * **THE ANSWER FOR A MOVE THE TURN BUDGET DOES NOT JUDGE** (D-762): every
 * number null, so a view that reads `feetLeft` cannot mistake *not metered* for
 * *no feet left*.
 *
 * @param {string} reason  one of `MOVEMENT_UNMETERED`
 */
export function unmetered(reason) {
  return {
    metered: false, reason, limited: null, action: null, pace: null, stopped: false,
    spentFeet: null, allowedFeet: null, feetLeft: null, feetBeforeNextMove: null, halves: null
  };
}

/**
 * **THE MOVEMENT ACTION A CALLER ASKED THE FEET-LEFT DOOR ABOUT** (D-762: *an
 * unknown one throws*; the final review, 2026-09-30): null where none was asked
 * - the door then reads the token's own - the action itself where it is one of
 * `actions`' own keys (`CONFIG.Token.movement.actions`), and a `TypeError`
 * naming it otherwise.
 *
 * **Asked before anything about the turn**, so an action the board does not know
 * is refused for every token, metered or not. The door checked it only past its
 * gate, and a bystander, a waiting combatant and no token at all answered *not
 * metered* for an action nothing can perform.
 *
 * @param {*} action
 * @param {object|null|undefined} actions  the movement actions the board knows, by key
 * @returns {string|null}
 */
export function askedAction(action, actions) {
  if (action === null || action === undefined) return null;
  if (typeof action === "string" && action && actions && typeof actions === "object" && Object.hasOwn(actions, action)) return action;
  throw new TypeError(`azeroth-rpg | movement.remaining: ${JSON.stringify(action) ?? String(action)} is not a movement action (CONFIG.Token.movement.actions)`);
}

/**
 * **WHAT THE TURN STILL ALLOWS A MOVE TO SPEND** (D-762; the lead, 2026-09-29:
 * *Add a read-only door*), off the SAME judgement a move is refused by.
 *
 * `facts` is exactly what `movementAllowed` is handed for a move, with
 * `distance` the feet the turn has spent so far and no move added:
 * `AzerothCombatant#_movementFacts` gathers it once for both, so the door and
 * the limit cannot read two different turns. A next move of `feetLeft` more
 * feet is allowed and one of more is refused, to `movementAllowed`'s own hair.
 *
 * - `spentFeet`: the feet of movement the turn has spent, at core's COST - on
 *   Difficult ground a foot crossed spends two (D-757) - never the distance.
 * - `allowedFeet`: what the turn's Moves carry at this pace, `pace × halves.total`.
 * - `feetLeft`: `allowedFeet - spentFeet`, never below 0: the most a next move
 *   may spend. 0 while `stopped`.
 * - `feetBeforeNextMove`: the feet the Moves ALREADY paid for still cover, before
 *   the next one is charged (`movesNeeded`); 0 before the first foot. A Move,
 *   not a Half-Action: on a Sprinting turn the next one charged may be the free
 *   one (02 §7).
 * - `halves`: `paid` the Moves the turn has paid for, `left` the Half-Actions
 *   still in the budget, `free` the Moves that cost none (02 §7's Sprint), and
 *   `total` the Moves the turn holds - the verdict's own `halves`.
 *
 * @param {{distance?: number, pace?: number, paid?: number, halfActionsLeft?: number, freeMove?: number, unpaced?: boolean}} facts
 * @returns {object}  `unmetered("unpaced")` for a creature with no pace by nature
 */
export function movementLeft(facts = {}) {
  const verdict = movementAllowed(facts);
  if (verdict.allowedFeet === null) return unmetered(MOVEMENT_UNMETERED.UNPACED);
  const spentFeet = Math.max(0, Number(facts.distance) || 0);
  const stopped = verdict.stopped === true;
  const pace = stopped ? 0 : Number(facts.pace);
  const paid = wholeCount(facts.paid);
  const feetLeft = Math.max(0, verdict.allowedFeet - spentFeet);
  const feetBeforeNextMove = stopped ? 0 : Math.min(feetLeft, Math.max(0, pace * paid - spentFeet));
  return {
    metered: true,
    reason: null,
    limited: null,
    action: null,
    pace,
    stopped,
    spentFeet,
    allowedFeet: verdict.allowedFeet,
    feetLeft,
    feetBeforeNextMove,
    halves: {
      paid,
      left: wholeCount(facts.halfActionsLeft),
      free: wholeCount(facts.freeMove),
      total: verdict.halves
    }
  };
}
