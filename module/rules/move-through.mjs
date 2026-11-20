/**
 * **MOVING THROUGH A SPACE** (05 §Size: *You may move through the space of a creature two or more sizes larger than
 * you, and it may move through yours. Neither of you may end a Move there*; FIXC, O-476). Pure: no Foundry imports
 * (CLAUDE.md §3). The reader is `documents/combat.mjs#moveThroughRefusalFor`, asked by `onPreMoveToken` beside the
 * leash (`rules/leash.mjs`), whose shape this copies.
 *
 * `rules/size.mjs#canMoveThrough` held the ladder half of 05's sentence from D-545 and nothing called it. Nothing in
 * the system stopped a walk through another creature's space, so 05's rule, 07's Veil of Mist (*you may move through
 * a creature's space, whatever its size, and you cannot end a Move there*), 07's Windwalk, 04's Ethereal Form, 02's
 * Underfoot and 14's Unstoppable were all text. They are built together here, because the base rule alone would
 * have turned every one of those permissions into a refusal.
 *
 * ## What the door judges (the narrowest reading of 05, for the lead)
 *
 * - **Whom**: a creature on its own turn in a started fight (the budget's own gate, `turnMover`), moving willingly
 *   (`movement.mjs#creatureMoved`: a displacement and a forced move are never refused), moved by a player. A GM's
 *   drag is not refused.
 * - **Where**: a square grid only. A hex or gridless scene, a mover or a creature with no size on 05's ladder, and a
 *   path core could not lay out are not judged.
 * - **Who is in the way**: every other token on the scene that has an actor, is not hidden, is not defeated and
 *   does not stand at 0 Health, and stands at the mover's height (within one grid distance; a flier passes over).
 *   Ally and enemy alike: 05 says *a creature*. A creature whose space the mover already shares when the move
 *   starts is left alone.
 * - **Passing**: allowed through a creature two or more sizes apart (`canMoveThrough`), or where a permission the
 *   mover holds covers it (`passes`). Otherwise refused.
 * - **Ending**: a move that stops in another creature's space is refused, whatever the permission (Veil of Mist and
 *   05 both say so; none of the permissions lifts it). Where a move stops is where core's move ends with nothing
 *   pending; a move core split at a stop is judged where it really stops.
 * - **A blink** (core's `blink` action) passes over nothing and is judged where it lands only.
 */

import { SIZES, canMoveThrough, rung } from "./size.mjs";

/** A size on 05's ladder, or false: `size.mjs#rung` reads a null as Medium, which here would judge a creature with no size. */
const sized = size => typeof size === "string" && SIZES.includes(size.toLowerCase());

/** What a permission lets the mover pass: every creature, any larger one, or any smaller one. */
export const THROUGH_KINDS = Object.freeze(["any", "larger", "smaller"]);

/** Why a move is refused, each said in words (`AZEROTH.MoveThrough.*`). */
export const MOVE_THROUGH_REFUSALS = Object.freeze({
  through: "AZEROTH.MoveThrough.Through",
  end: "AZEROTH.MoveThrough.End"
});

const plain = text => String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/**
 * **WHAT A SENTENCE LETS ITS BEARER PASS**, or null. Read off the words of 02, 04, 07 and 14 (held by
 * `move-through.test.mjs`'s census over those chapters):
 *
 * - *you may move through a creature's space* (07's Veil of Mist, Windwalk) and *move through the space of any
 *   creature* (04's Ethereal Form): `any`;
 * - *move through the space of any creature larger than you* (02's Underfoot): `larger`;
 * - *moves through the space of any creature smaller than itself* (14's Unstoppable): `smaller`.
 *
 * 05's own *two or more sizes larger* restated (14's Under Everything) is the base rule and reads null.
 *
 * @param {string} text
 * @returns {"any"|"larger"|"smaller"|null}
 */
export function readMoveThrough(text) {
  const t = plain(text);
  if (!t) return null;
  if (/\bmoves? through the space of any creature larger than (?:you|it|itself)\b/i.test(t)) return "larger";
  if (/\bmoves? through the space of any creature smaller than (?:you|it|itself)\b/i.test(t)) return "smaller";
  if (/\bmay move through (?:a|any) creature's space\b/i.test(t)) return "any";
  if (/\bmay move through the space of any creature\b/i.test(t)) return "any";
  return null;
}

/**
 * **THE PERMISSIONS A MOVER HOLDS**, sorted and each once: Veil of Mist's own flag (`through`), Ethereal Form's flag,
 * and every text it carries - a laid spell effect's description (Windwalk), a feature's (Underfoot), a creature
 * ability's (Unstoppable).
 *
 * @param {{effects?: Array<object>, texts?: Array<string>, veilFlag?: string, etherealFlag?: string}} o  plain effects
 *   (`{active, disabled, description, flags}`) and texts
 * @returns {string[]}  `THROUGH_KINDS` held
 */
export function moveThroughOf({ effects = [], texts = [], veilFlag = "veilOfMist", etherealFlag = "ethereal" } = {}) {
  const held = new Set();
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const flags = e.flags?.["azeroth-rpg"] ?? {};
    if (flags[veilFlag]?.through === true) held.add("any");
    if (flags[etherealFlag]) held.add("any");
    const read = readMoveThrough(e.description ?? "");
    if (read) held.add(read);
  }
  for (const text of texts ?? []) {
    const read = readMoveThrough(text);
    if (read) held.add(read);
  }
  return THROUGH_KINDS.filter(k => held.has(k));
}

/**
 * **WHETHER A MOVER MAY PASS THROUGH ANOTHER CREATURE'S SPACE**: 05's two sizes apart, either way, or a permission
 * the mover holds. A size off the ladder is never judged here (the caller leaves that creature alone).
 *
 * @param {string} moverSize
 * @param {string} otherSize
 * @param {string[]} [through]  `moveThroughOf`
 */
export function passes(moverSize, otherSize, through = []) {
  if (canMoveThrough(moverSize, otherSize)) return true;
  const held = new Set(through ?? []);
  if (held.has("any")) return true;
  const a = rung(moverSize);
  const b = rung(otherSize);
  if (a === -1 || b === -1) return false;
  if (held.has("larger") && b > a) return true;
  if (held.has("smaller") && b < a) return true;
  return false;
}

/** Whether two footprints of squares share a square. */
export function sharesSquare(a, b) {
  if (!a || !b) return false;
  return a.i0 <= b.i1 && b.i0 <= a.i1 && a.j0 <= b.j1 && b.j0 <= a.j1;
}

const level = (a, b, height) => Math.abs((Number(a?.elevation) || 0) - (Number(b?.elevation) || 0)) < height - 1e-6;

/**
 * **THE FIRST CREATURE A MOVE MAY NOT PASS OR STOP ON**, or null.
 *
 * @param {object} o
 * @param {string} o.moverSize      the mover's size (`system.size`)
 * @param {string[]} [o.through]    `moveThroughOf`
 * @param {Array<object>} o.path    the mover's footprint at each square it occupies along the move, in order:
 *   `{i0, i1, j0, j1, elevation}` - `path[0]` where it starts; a blink adds only the footprint it lands on
 *   (the door lays the path out, `documents/combat.mjs#moveThroughPath`)
 * @param {Array<object>} o.others  `{id, name, size, i0, i1, j0, j1, elevation}` for each creature in the way
 * @param {boolean} [o.stops]       whether the move stops at the path's last step (core holds nothing pending)
 * @param {number} [o.height]       the elevation band one space spans (the scene's grid distance)
 * @returns {{kind: "through"|"end", id: string, name: string}|null}
 */
export function moveThroughRefusal({ moverSize, through = [], path = [], others = [], stops = true, height = 5 } = {}) {
  if (!sized(moverSize) || !Array.isArray(path) || path.length < 2) return null;
  const start = path[0];
  const judged = (others ?? []).filter(o => o && sized(o.size) && !(sharesSquare(start, o) && level(start, o, height)));
  if (!judged.length) return null;
  const last = path.length - 1;
  for (let k = 1; k < last; k++) {
    const step = path[k];
    for (const o of judged) {
      if (sharesSquare(step, o) && level(step, o, height) && !passes(moverSize, o.size, through)) return { kind: "through", id: String(o.id ?? ""), name: String(o.name ?? "") };
    }
  }
  const end = path[last];
  for (const o of judged) {
    if (!sharesSquare(end, o) || !level(end, o, height)) continue;
    if (stops) return { kind: "end", id: String(o.id ?? ""), name: String(o.name ?? "") };
    if (!passes(moverSize, o.size, through)) return { kind: "through", id: String(o.id ?? ""), name: String(o.name ?? "") };
  }
  return null;
}

/**
 * **THE SQUARES A TOKEN'S FOOTPRINT COVERS ALONG A LINE OF ANCHORS**: each anchor square (the footprint's top-left
 * square, in the order core's grid walks it) laid out at the footprint's own width and height.
 *
 * @param {Array<{i: number, j: number}>} anchors
 * @param {{rows: number, cols: number}} span  the footprint's squares down and across
 * @param {number} elevation
 * @returns {Array<{i0: number, i1: number, j0: number, j1: number, elevation: number}>}
 */
export function footprintsAlong(anchors = [], { rows = 1, cols = 1 } = {}, elevation = 0) {
  const out = [];
  for (const a of anchors ?? []) {
    const i = Math.trunc(Number(a?.i));
    const j = Math.trunc(Number(a?.j));
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue;
    const prev = out.at(-1);
    if (prev && prev.i0 === i && prev.j0 === j) continue;
    out.push({ i0: i, i1: i + Math.max(1, rows) - 1, j0: j, j1: j + Math.max(1, cols) - 1, elevation: Number(elevation) || 0 });
  }
  return out;
}
