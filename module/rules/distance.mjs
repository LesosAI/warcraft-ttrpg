/**
 * How far away a target is, and what the distance costs (06; D-669). Pure,
 * no Foundry imports (CLAUDE.md §3).
 *
 * 06 states both rules in one sentence each and the system honoured
 * neither: a melee weapon could reach across a scene and a bow was as
 * accurate at four hundred feet as at forty (the lead, 2026-09-06).
 *
 * - **Reach.** *You are Engaged with any enemy within your reach, which is
 *   5 feet, or 10 feet with a **Reach** weapon.* There is no melee attack
 *   past that: a blow you cannot reach with is not a Bane, it is nothing.
 *   **The tool WARNS rather than refusing** (D-716): see `rangeBand`.
 * - **Range.** *Every ranged weapon lists a Range. Out to that distance,
 *   attack normally. Past it to twice that distance, take a Bane. Beyond
 *   twice, you cannot attack at all.*
 * - **Engaged.** *Ranged attacks and Casting Tests made while Engaged
 *   suffer a Bane.*
 *
 * A thrown weapon carries its distance inside 08 §5's trait - `Thrown (30
 * ft)` - because 08 gives a Range column to what shoots and a trait to what
 * is thrown (D-531).
 *
 * **Every distance is measured between the nearest spaces two tokens occupy,
 * in three dimensions** (D-732, `footprintApart`): a token's footprint is
 * convention on the map, and 05 §Size says size does not change reach.
 */

import { attackModeOf } from "./ammunition.mjs";

/** 06: reach is five feet, or ten with a Reach weapon. */
export const BASE_REACH = 5;
export const REACH_WEAPON = 10;

/** The reach a set of weapon traits gives. */
export function reachOf(traits = []) {
  return (traits ?? []).some(t => /^reach\b/i.test(String(t).trim())) ? REACH_WEAPON : BASE_REACH;
}

/** The distance inside a `Thrown (30 ft)` trait, or null. */
export function thrownRange(traits = []) {
  for (const trait of traits ?? []) {
    const m = /^thrown\s*\((\d+)\s*ft\)$/i.exec(String(trait).trim());
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * How far a weapon reaches or carries, the way it is being used (D-731).
 *
 * A shot takes 08 §7's own Range column; a throw takes the Thrown trait's
 * number, which 08 §7's Thrown table also prints as its Range; a blow in the
 * hand carries a reach and no range. **`mode` is the way the blow is struck**
 * (`rules/ammunition.mjs#attackModes`), and with none the weapon's first way is
 * read - so a Spear asked nothing reaches ten feet, where this used to answer
 * that every Spear was thrown.
 *
 * @param {{range?: number|null, traits?: string[], launcher?: string|null}} weapon
 * @param {"hand"|"thrown"|"shot"|null} [mode]
 * @returns {{kind: "ranged"|"thrown"|"melee", range: number|null, reach: number}}
 */
export function reachAndRange(weapon = {}, mode = null) {
  const traits = weapon.traits ?? [];
  const reach = reachOf(traits);
  const used = attackModeOf(weapon, mode);
  // 04's Longshot (D-773): the percent the maximum grows rides the spec to the band.
  const longshot = Math.max(0, Math.trunc(Number(weapon.longshot)) || 0);
  const stretch = longshot ? { longshot } : {};
  if (used === "shot") return { kind: "ranged", range: weapon.range ?? null, reach, ...stretch };
  if (used === "thrown") return { kind: "thrown", range: thrownRange(traits) ?? weapon.range ?? null, reach, ...stretch };
  return { kind: "melee", range: null, reach };
}

/**
 * **THE FARTHEST A WEAPON SHOOTS** (06 §5: *Past it to twice that distance, take
 * a Bane. Beyond twice, you cannot attack at all*), grown by 04's Longshot (*Your
 * weapon's maximum Range increases by 25% per rank, rounded up*; D-773). **MY
 * READING**: the maximum is twice the Range, and only it grows - the Range, where
 * the Bane begins, does not.
 *
 * @param {number} range
 * @param {number} [percent]  how much the maximum grows, a whole percent
 */
export function maximumRange(range, percent = 0) {
  const base = Math.max(0, Number(range) || 0) * 2;
  const grow = Math.max(0, Math.trunc(Number(percent)) || 0);
  return grow ? Math.ceil(base * (100 + grow) / 100) : base;
}

/**
 * WHICH WAY A WEAPON THAT HAS TWO OPENS ON (D-731), off the measured distance.
 *
 * | Distance | Opens |
 * |---|---|
 * | not measured | in the hand |
 * | inside reach (5 ft, 10 with Reach) | in the hand |
 * | past reach, inside twice the throwing range | thrown |
 * | past twice the throwing range | in the hand, with D-716's out-of-reach warning |
 *
 * Past twice its range a throw is refused (06 §5) while a blow in the hand only
 * warns (D-716), so the hand is the way that can still be made - which is how a
 * longsword at that distance behaves. A weapon with one way always opens on it.
 * The roll dialog is where the roller changes it (D-601).
 *
 * @param {string[]} modes  `attackModes(weapon)`
 * @param {{distance?: number|null, reach?: number, throwRange?: number|null}} [o]
 * @returns {string}
 */
export function defaultAttackMode(modes = [], { distance = null, reach = BASE_REACH, throwRange = null } = {}) {
  const list = Array.isArray(modes) && modes.length ? modes : ["hand"];
  if (!(list.includes("hand") && list.includes("thrown"))) return list[0];
  if (distance === null || distance === undefined || distance === "") return "hand";
  const feet = Number(distance);
  if (!Number.isFinite(feet) || feet <= reach) return "hand";
  const band = rangeBand(feet, { kind: "thrown", range: throwRange ?? null, reach });
  return band.ok && band.band !== "unknown" ? "thrown" : "hand";
}

/**
 * What the distance to the target does to this attack.
 *
 * **A MELEE BLOW OUTSIDE REACH WARNS AND ROLLS** (D-716, superseding D-669's
 * refusal in part). 06 gives no melee attack past reach and the door refused
 * one outright, which read at the table as the system deciding a step nobody
 * had taken: the tokens are where the GM last dragged them, a five-foot step
 * is not modelled, and a Reach weapon held by somebody standing on a stair is
 * a judgement. So the band still says *beyond* and carries `warn`, the dialog
 * raises a line naming the distance and the reach, and whether the blow is
 * legal stays the table's. **A shot past twice its Range is still refused**:
 * 06 states that one as a hard stop and nothing about the geometry is in
 * doubt at four hundred feet.
 *
 * `distance` travels back on the result because the dialog's line has to print
 * it and nothing downstream measures a second time.
 *
 * @param {number|null} distance   feet, or null where nothing was measured
 * @param {{kind: string, range: number|null, reach: number}} spec
 * @returns {{band: "unknown"|"reach"|"normal"|"long"|"beyond", banes: number, ok: boolean, warn: boolean, max: number|null, distance: number|null}}
 */
export function rangeBand(distance, spec) {
  const { kind, range, reach } = spec;
  const band = (b, { banes = 0, ok = true, warn = false, max = null } = {}) =>
    ({ band: b, banes, ok, warn, max, distance: distance ?? null });
  if (distance === null || distance === undefined) return band("unknown");
  if (kind === "melee") {
    // A melee blow lands inside reach or not at all: 06 gives no long band,
    // so *beyond* carries a warning rather than a Bane (D-716).
    return distance <= reach
      ? band("reach", { max: reach })
      : band("beyond", { warn: true, max: reach });
  }
  if (range === null || range === undefined) return band("unknown");
  const max = maximumRange(range, spec.longshot ?? 0);
  if (distance <= range) return band("normal", { max });
  if (distance <= max) return band("long", { banes: 1, max });
  return band("beyond", { ok: false, max });
}

/**
 * Whether the attacker is Engaged: an enemy inside their own reach (06).
 * The distances are measured by the caller, which is what keeps this pure.
 *
 * @param {number[]} enemyDistances  feet to each enemy that could engage
 * @param {number} reach
 */
export function isEngaged(enemyDistances = [], reach = BASE_REACH) {
  return engagedCount(enemyDistances, reach) > 0;
}

/**
 * HOW MANY enemies are inside the attacker's own reach.
 *
 * 04's Deadly Poise reads *while you are Engaged with exactly one enemy*, which
 * `isEngaged` cannot answer: it says whether anybody is there and not how many.
 */
export function engagedCount(enemyDistances = [], reach = BASE_REACH) {
  return (enemyDistances ?? []).filter(d => typeof d === "number" && d <= reach).length;
}

/** The reach a character threatens with, off every weapon they have equipped. */
export function reachHeld(weapons = []) {
  return weapons.reduce((most, w) => Math.max(most, reachOf(w?.traits ?? [])), BASE_REACH);
}

/* -------------------------------------------- */
/*  Where the distance is measured from (D-732)  */
/* -------------------------------------------- */

/**
 * **THE DISTANCE BETWEEN TWO CREATURES IS THE DISTANCE BETWEEN THE NEAREST
 * SPACES THEY OCCUPY** (D-732).
 *
 * 05 §Size: *Size does not change your Health, your Defense, your reach or the
 * square you stand in: a Large creature and a Small one both hold five feet of
 * ground.* A Large token is 2×2, a Huge one 3×3 and an Enormous one 4×4 (D-636,
 * D-637), and that footprint is convention on the map. Measured between the
 * two CENTRES, the convention pushes reach away: a Medium rogue in a square
 * touching a 3×3 boss is ten feet from its centre, outside the five feet 06
 * gives, so the stab warned it was out of reach and a Dagger opened as a throw.
 *
 * A footprint is one of three shapes, by the scene's grid, and every one keeps
 * the token's ELEVATION: core measures a path in three dimensions wherever a
 * point carries one, a v14 Level is a band of absolute elevation rather than a
 * second plane (`client/canvas/placeables/token.mjs#_testCulled` compares a
 * token's elevation to `canvas.level.elevation`), and a Harpy twenty feet up is
 * twenty feet from the Warrior under it.
 *
 * | Grid | Footprint | Nearest pair |
 * |---|---|---|
 * | square | `squares`: the rectangle core lays out (`squareFootprint`) | per axis (`nearestSquares`), one measure |
 * | hex | `points`: the centres of core's occupied hexes | every pair (`nearestApart`) |
 * | gridless | `box`: the token's box shrunk by half a grid unit (`shrunkBox`) | per axis (`nearestBoxPoints`), one measure |
 */

/** Token dispositions, as `CONST.TOKEN_DISPOSITIONS` numbers them (14.367). */
export const DISPOSITIONS = Object.freeze({ SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });

/**
 * The least of a measure over every pair of points, or null where no pair could
 * be measured - *nothing is measured*, which every reader already treats as the
 * table's distance (D-669). A pair the measure throws on or answers with
 * something other than a number is passed over.
 *
 * @param {Array<object>} from
 * @param {Array<object>} to
 * @param {(a: object, b: object) => number|null} measure  feet between two points
 * @returns {number|null}
 */
export function nearestApart(from = [], to = [], measure = () => null) {
  let best = null;
  for (const a of from ?? []) {
    for (const b of to ?? []) {
      let feet = null;
      try {
        feet = measure(a, b);
      } catch {
        feet = null;
      }
      if (typeof feet !== "number" || !Number.isFinite(feet)) continue;
      if (best === null || feet < best) best = feet;
    }
  }
  return best;
}

/**
 * The squares a token covers on a SQUARE grid, exactly as core lays them out:
 * the top-left square is the one under the token's position nudged half a
 * square in (a quarter for a half-square token), and the rectangle runs as many
 * squares across and down as the token's size rounds up to
 * (`TokenDocument#_positionToGridOffset` and `#getOccupiedGridSpaceOffsets`,
 * verified at 14.367). **No wall sweep**: core builds a `ClockwiseSweepPolygon`
 * per call to leave out a square behind a wall, which every v14 token pays
 * because every token has a Level, and a distance read on every move cannot.
 *
 * @param {{x?: number, y?: number, width?: number, height?: number, size?: number}} o
 *   `x`, `y` and `size` in pixels, `width` and `height` in grid squares
 * @returns {{i0: number, j0: number, i1: number, j1: number}} rows and columns, inclusive
 */
export function squareFootprint({ x = 0, y = 0, width = 1, height = 1, size = 100 } = {}) {
  const w = Math.max(Math.round(Number(width) * 2) / 2, 0.5);
  const h = Math.max(Math.round(Number(height) * 2) / 2, 0.5);
  const anchorX = Math.round(Number(x)) + (size * (Number.isInteger(w) ? 0.5 : 0.25));
  const anchorY = Math.round(Number(y)) + (size * (Number.isInteger(h) ? 0.5 : 0.25));
  const j0 = Math.floor(anchorX / size);
  const i0 = Math.floor(anchorY / size);
  return { i0, j0, i1: i0 + Math.ceil(h) - 1, j1: j0 + Math.ceil(w) - 1 };
}

/** The nearest of two ranges on one axis: the facing ends, or one shared value where they overlap. */
function facing(a0, a1, b0, b1, shared) {
  if (a1 < b0) return [a1, b0];
  if (b1 < a0) return [a0, b1];
  const at = shared(Math.max(a0, b0), Math.min(a1, b1));
  return [at, at];
}

/**
 * The nearest square of each of two rectangles, one axis at a time. Every
 * diagonal rule core has measures a longer path for a larger step on either
 * axis, so the pair nearest on both axes is the nearest pair.
 *
 * @returns {{from: {i: number, j: number}, to: {i: number, j: number}}}
 */
export function nearestSquares(a, b) {
  const [ia, ib] = facing(a.i0, a.i1, b.i0, b.i1, low => low);
  const [ja, jb] = facing(a.j0, a.j1, b.j0, b.j1, low => low);
  return { from: { i: ia, j: ja }, to: { i: ib, j: jb } };
}

/**
 * A token's box on a GRIDLESS scene, shrunk by half a grid unit on every side.
 *
 * **A Medium token shrinks to its own centre**, so two Medium tokens measure
 * centre to centre exactly as they always did, while a Large token keeps a unit
 * square of positions and a Huge one two. Whole-cell centres got the middle of
 * an even-sized token's side wrong: it sits on a cell boundary, and a rogue
 * centred against a 2×2 measured 5.59 ft - out of reach of the creature it was
 * touching (D-732's review).
 *
 * @param {{x?: number, y?: number, width?: number, height?: number, unit?: number}} o  all in pixels
 * @returns {{left: number, top: number, right: number, bottom: number}}
 */
export function shrunkBox({ x = 0, y = 0, width = 0, height = 0, unit = 100 } = {}) {
  const cx = Number(x) + (Number(width) / 2);
  const cy = Number(y) + (Number(height) / 2);
  const hw = Math.max(0, (Number(width) - Number(unit)) / 2);
  const hh = Math.max(0, (Number(height) - Number(unit)) / 2);
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

/** The nearest point of each of two boxes, one axis at a time. */
export function nearestBoxPoints(a, b) {
  const [xa, xb] = facing(a.left, a.right, b.left, b.right, (low, high) => (low + high) / 2);
  const [ya, yb] = facing(a.top, a.bottom, b.top, b.bottom, (low, high) => (low + high) / 2);
  return { from: { x: xa, y: ya }, to: { x: xb, y: yb } };
}

/** A footprint's points, for a pair of footprints of different shapes. */
function pointsOf(footprint) {
  if (footprint.kind === "points") return footprint.points ?? [];
  if (footprint.kind === "box") return [{ x: (footprint.left + footprint.right) / 2, y: (footprint.top + footprint.bottom) / 2 }];
  const out = [];
  for (let i = footprint.i0; i <= footprint.i1; i++) {
    for (let j = footprint.j0; j <= footprint.j1; j++) out.push({ x: (j + 0.5) * footprint.size, y: (i + 0.5) * footprint.size });
  }
  return out;
}

/**
 * **FEET BETWEEN TWO FOOTPRINTS** (D-732), through the scene's own measure.
 *
 * Every point handed to `measure` carries its token's elevation, so the grid
 * measures in three dimensions exactly as core's own movement does. A measure
 * that throws is *unmeasured* - null - and never a broken roll.
 *
 * @param {object|null} a  `{kind: "squares", i0, j0, i1, j1, size, elevation}`,
 *   `{kind: "points", points, elevation}` or `{kind: "box", left, top, right, bottom, elevation}`
 * @param {object|null} b
 * @param {(p: object, q: object) => number|null} measure
 * @returns {number|null}
 */
export function footprintApart(a, b, measure = () => null) {
  if (!a || !b) return null;
  const at = (point, elevation) => ({ x: point.x, y: point.y, elevation: Number(elevation) || 0 });
  if (a.kind === "squares" && b.kind === "squares" && a.size === b.size) {
    const { from, to } = nearestSquares(a, b);
    const centre = square => ({ x: (square.j + 0.5) * a.size, y: (square.i + 0.5) * a.size });
    return nearestApart([at(centre(from), a.elevation)], [at(centre(to), b.elevation)], measure);
  }
  if (a.kind === "box" && b.kind === "box") {
    const { from, to } = nearestBoxPoints(a, b);
    return nearestApart([at(from, a.elevation)], [at(to, b.elevation)], measure);
  }
  return nearestApart(pointsOf(a).map(p => at(p, a.elevation)), pointsOf(b).map(p => at(p, b.elevation)), measure);
}

/* -------------------------------------------- */
/*  Who is an enemy, and how far anybody reaches */
/* -------------------------------------------- */

/**
 * The reach a creature threatens with (06 §5): five feet, or ten with a
 * **Reach** weapon in hand or a Reach row on its block. **ONE reading, for the
 * Opportunity Attack and for Engaged** (D-732's review): a Doomguard threatened
 * ten feet when somebody walked away and cast beside a character ten feet off
 * with no Bane, because the Engaged check read only what it held.
 *
 * @param {{weapons?: Array<{traits?: string[]}>, rows?: Array<{traits?: string[]}>}} o
 *   the equipped weapons, and a creature's attack rows
 */
export function threatReach({ weapons = [], rows = [] } = {}) {
  return Math.max(reachHeld(weapons ?? []), reachHeld(rows ?? []));
}

/**
 * **WHETHER A TOKEN IS AN ENEMY THE ROLLER IS ENGAGED WITH** (06 §5; D-732's
 * review). One definition, read by a ranged attack's and a Casting Test's
 * Engaged Bane alike:
 *
 * 1. **A defeated creature never counts** - at 0 Health or marked defeated in
 *    the fight. A Priest healing beside last round's dead gnoll is not Engaged.
 * 2. **A token the roller cannot see never counts for a player** - hidden by the
 *    GM, or Hidden by D-717's `invisible`. Counted, its Bane printed its name on
 *    the card and gave the ambush away. A GM sees everything, and counts it.
 * 3. **In the roller's own fight, THE TRACKER'S SIDES DECIDE, and nothing
 *    else does** (the coordinator's call after the verifier's pass):
 *    `AzerothCombatant#side` - a GM's override, the Party (D-658), a bond, and
 *    otherwise FRIENDLY against everything else. So a NEUTRAL or SECRET token
 *    in the fight is on the side the tracker put it on, and it engages and is
 *    engaged exactly as the Opportunity Attack, which reads the same sides,
 *    already had it. An earlier version kept an unsettled neutral out of the
 *    fight's Engaged check while the tracker let it make Opportunity Attacks.
 * 4. **Outside it, FRIENDLY and HOSTILE are each other's enemies and nothing
 *    else is**: a NEUTRAL or SECRET token engages nobody and nobody engages it.
 *
 * @param {{disposition?: number, fight?: string|null, side?: string|null}} roller
 * @param {{disposition?: number, fight?: string|null, side?: string|null,
 *   defeated?: boolean, health?: number|null, hidden?: boolean}} other
 * @param {{gm?: boolean}} [o]  whether the rolling user is a GM
 * @returns {boolean}
 */
export function countsAsEnemy(roller, other, { gm = false } = {}) {
  if (!roller || !other) return false;
  if (other.defeated === true) return false;
  if (typeof other.health === "number" && other.health <= 0) return false;
  if (other.hidden === true && gm !== true) return false;
  const inOneFight = Boolean(roller.fight) && roller.fight === other.fight && Boolean(roller.side) && Boolean(other.side);
  if (inOneFight) return roller.side !== other.side;
  const { FRIENDLY, HOSTILE } = DISPOSITIONS;
  return (roller.disposition === FRIENDLY && other.disposition === HOSTILE)
    || (roller.disposition === HOSTILE && other.disposition === FRIENDLY);
}

/**
 * **WHETHER A CREATURE IS AN ALLY OF AN AURA'S HOLDER** (D-755; the lead,
 * 2026-09-25). 02 §7 writes *allies* and 04 *friendly targets*, and the lead's
 * reading of both is one rule:
 *
 * 1. **The holder is their own ally** (the lead, 2026-09-26, reversing
 *    2026-09-25's *allies, not the Paladin*): *the caster counts as an ally
 *    unless the spell or aura specifically says "other than you" or similar
 *    wording.* The exception is the SOURCE's to state - `rules/auras.mjs
 *    #excludesHolder` reads it off the sentence and an aura carries it as
 *    `excludeOwner` - so it is no part of this question, which is now true of
 *    the holder whatever their standing says.
 * 2. **In the holder's own fight, THE TRACKER'S SIDE DECIDES**, exactly as
 *    `countsAsEnemy` reads it - a GM's override, the Party, a bond, and
 *    otherwise the token's disposition, all inside `AzerothCombatant#side`.
 * 3. **Outside it, both must be of the Party or bound to it** (D-658, D-643).
 *    A friendly token nobody has put in the Party is not *your* ally until a
 *    fight puts it on your side - and a creature in the fight with no combatant
 *    of its own is judged outside it, the way the tracker leaves it.
 *
 * **A defeated or a hidden creature is still an ally.** The enemy rule drops
 * both because an ENGAGED check must not see them; nothing about lying at 0
 * Health or standing unseen stops a Boon from reaching somebody.
 *
 * @param {{uuid?: string|null, fight?: string|null, side?: string|null,
 *   party?: boolean, boundToParty?: boolean}} owner  `canvas/engaged.mjs#allyStandingOf`
 * @param {{uuid?: string|null, fight?: string|null, side?: string|null,
 *   party?: boolean, boundToParty?: boolean}} other
 * @returns {boolean}
 */
export function countsAsAlly(owner, other) {
  if (!owner || !other) return false;
  if (owner.uuid && owner.uuid === other.uuid) return true;
  const inOneFight = Boolean(owner.fight) && owner.fight === other.fight && Boolean(owner.side) && Boolean(other.side);
  if (inOneFight) return owner.side === other.side;
  const ofParty = s => s.party === true || s.boundToParty === true;
  return ofParty(owner) && ofParty(other);
}
