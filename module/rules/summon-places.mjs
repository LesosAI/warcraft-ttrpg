/**
 * **WHERE A CALLED CREATURE STANDS, AND HOW MANY ARE CALLED** (the Legacy branches'
 * door 4). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * D-643 made a talent's `summons` a bound world actor and stopped there: the
 * creature was in the *Bound* folder and nothing stood on the board. D-708 planted
 * a totem beside its shaman and D-691 rang a Boss's summons round the Boss, each
 * with its own ring. 04's Pocket Factory (*Two Clockwork Gnomes, or three at rank
 * 2, assemble in spaces within 30 feet*), Dark Minion's risen dead and The Bench's
 * constructs all need the same thing - tokens placed, on the owner's side, in the
 * owner's fight - so the ring is one law here and the three doors read it:
 *
 * - `ringSpots`: the free squares a number of tokens take around a point, the
 *   point's own square first where it is free;
 * - `summonCountAt`: a count by rank - a number, `"rank"`, `"1+rank"` - bound at
 *   the stamp (`talent-effects.mjs#grantsFor`);
 * - `placeOf`: a granting talent's `onUse.place {within, halfActions}` - the feet
 *   the picked point may lie from the owner, and the Half-Actions each called
 *   creature takes a turn of its own (Pocket Factory's *each takes one Half-Action
 *   a turn of its own*);
 * - `placeRefusal`: a picked point past the feet, refused in words and the pick
 *   kept open.
 */

import { evaluateExpression } from "./expressions.mjs";

/** Why a placement is refused, said in words (`AZEROTH.Place.Refuse.*`). */
export const PLACE_REFUSALS = Object.freeze({
  far: "AZEROTH.Place.Refuse.Far",
  noToken: "AZEROTH.Place.Refuse.NoToken",
  unmeasured: "AZEROTH.Place.Refuse.Unmeasured"
});

/** The squares out from a point, in the order a ring is searched: the four sides, then the four corners. */
export const RING = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);

/** How many rings out a search goes before it gives up and stacks. */
export const RINGS = 3;

/**
 * **HOW MANY ARE CALLED, AT THE RANK**: a number, or an expression in `rank` and
 * `tier` (04's Pocket Factory: *Two ... or three at rank 2* is `"1+rank"`), a whole
 * number never below 0. Null and nonsense read 0, which calls nobody.
 *
 * @param {number|string|null} count
 * @param {number} [rank]
 * @param {{tier?: number}} [scope]
 * @returns {number}
 */
export function summonCountAt(count, rank = 1, { tier = 1 } = {}) {
  if (count === null || count === undefined || count === "") return 0;
  const n = typeof count === "number" ? count : evaluateExpression(String(count), { rank: Math.trunc(Number(rank)) || 1, tier: Math.trunc(Number(tier)) || 1 });
  return Math.max(0, Math.trunc(Number(n)) || 0);
}

/**
 * **WHERE AND HOW A TALENT'S CALLED CREATURES STAND** (the granting talent's
 * `onUse.place`): the feet the picked point may lie from the owner, and the
 * Half-Actions each takes a turn of its own, or null where the row names no place.
 *
 * @param {{place?: {within?: number, halfActions?: number}}|null} onUse
 * @returns {{within: number, halfActions: number|null}|null}
 */
export function placeOf(onUse) {
  const p = onUse?.place;
  if (!p || typeof p !== "object") return null;
  const within = Math.trunc(Number(p.within));
  if (!(within > 0)) return null;
  const halves = Math.trunc(Number(p.halfActions));
  return { within, halfActions: halves >= 0 && halves <= 2 && p.halfActions !== undefined && p.halfActions !== null ? halves : null };
}

/**
 * Whether a picked point lies past the feet: the refusal key, or null.
 *
 * @param {{within: number, apart: number|null}} o
 * @returns {string|null}
 */
export function placeRefusal({ within, apart = null } = {}) {
  if (apart === null || apart === undefined || !Number.isFinite(Number(apart))) return "unmeasured";
  return Number(apart) > Number(within) + 1e-6 ? "far" : null;
}

/** Whether two boxes overlap (touching edges do not). */
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * **THE FREE SQUARES A NUMBER OF TOKENS TAKE ROUND A POINT**: top-lefts, the
 * point's own square first where `includeOrigin` and it is free, then ring after
 * ring of the eight squares round it (`RING`), each one whose whole footprint is on
 * the board and overlaps nothing standing - nor any spot this call has already
 * given. Where the rings run out, the rest stack on the first ring's first square
 * and the GM drags them (D-708's fallback: a creature is always placed).
 *
 * @param {object} o
 * @param {{x: number, y: number}} o.origin   a top-left in pixels, on the grid
 * @param {number} [o.count]
 * @param {{w?: number, h?: number}} [o.cell]  the grid's pixels a square
 * @param {{width?: number, height?: number}} [o.size]  the token's footprint in pixels
 * @param {Array<{x: number, y: number, width: number, height: number}>} [o.standing]
 * @param {{x: number, y: number, width: number, height: number}|null} [o.board]
 * @param {boolean} [o.includeOrigin]
 * @param {number} [o.rings]
 * @returns {Array<{x: number, y: number}>}
 */
export function ringSpots({ origin, count = 1, cell = {}, size = {}, standing = [], board = null, includeOrigin = true, rings = RINGS } = {}) {
  const many = Math.max(0, Math.trunc(Number(count)) || 0);
  if (!origin || !many) return [];
  const w = Number(cell.w) > 0 ? Number(cell.w) : 100;
  const h = Number(cell.h) > 0 ? Number(cell.h) : w;
  const width = Number(size.width) > 0 ? Number(size.width) : w;
  const height = Number(size.height) > 0 ? Number(size.height) : h;
  const taken = [...(standing ?? [])].filter(Boolean);
  const onBoard = box => !board
    || (box.x >= board.x && box.y >= board.y && box.x + box.width <= board.x + board.width && box.y + box.height <= board.y + board.height);
  const free = spot => {
    const box = { ...spot, width, height };
    return onBoard(box) && !taken.some(t => overlaps(t, box));
  };
  const candidates = [];
  if (includeOrigin) candidates.push({ x: origin.x, y: origin.y });
  for (let out = 1; out <= Math.max(1, Math.trunc(Number(rings)) || RINGS); out++) {
    for (const [dx, dy] of RING) candidates.push({ x: origin.x + dx * w * out, y: origin.y + dy * h * out });
  }
  const spots = [];
  for (const spot of candidates) {
    if (spots.length >= many) break;
    if (!free(spot)) continue;
    spots.push({ x: Math.round(spot.x), y: Math.round(spot.y) });
    taken.push({ ...spot, width, height });
  }
  const fallback = { x: Math.round(origin.x + (includeOrigin ? 0 : w)), y: Math.round(origin.y) };
  while (spots.length < many) spots.push({ ...fallback });
  return spots;
}
