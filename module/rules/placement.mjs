/**
 * Putting an area on the board: which clicks it asks for, which way it faces,
 * and whether the Region follows a token (D-723, amending D-616).
 *
 * Pure functions, no Foundry imports. `rules/areas.mjs` reads the shape 07 §9
 * asked for off a Target line; this decides how the table lays that shape
 * down. Both doors run it — a card's Place area (`canvas/place.mjs`) and the
 * Measure control (`canvas/measure.mjs`) — so a card and a measurement cannot
 * disagree about a cone.
 *
 * **The rule.**
 *
 *  - **A circle is unchanged.** On the caster's token where the entry centres
 *    it on them, and it follows the token; clicked everywhere else.
 *  - **A cone starts at the caster's token centre and asks one click for its
 *    facing** (07 §9: *a cone spreads from you*). With no token there is no
 *    caster on the board to spread from, so it asks two: where it starts, then
 *    where it faces.
 *  - **A line on the ground is clicked where it starts, then clicked for its
 *    direction**, and the entry fixes the length. All five lines in 07 say
 *    *on the ground*; `areaFor` gives them a placed point.
 *  - **Only a circle attaches.** A Region attached to a token moves AND ROTATES
 *    with it, so an Instant cone attached to its caster drifts off the ground
 *    it landed on the moment the caster walks away.
 *
 * Range is not checked: it never was, and 07 does not say whether a line's
 * Range is measured to where it starts or to where it ends.
 *
 * **Every cone and line before this faced east.** `placeItemArea` never asked
 * for a click on a cone, so it aimed from the token's centre at the token's
 * centre, and `atan2(0, 0)` is 0.
 */

import { LINE_WIDTH_FT, ORIGINS } from "./areas.mjs";

/** Where a placement takes its origin from. */
export const STEP_ORIGINS = Object.freeze({ TOKEN: "token", CLICK: "click" });

/** The shapes `areaFor` returns, and so the shapes there are steps for. */
const SHAPES = new Set(["circle", "cone", "line"]);

/** The shapes that point somewhere. A circle has no facing. */
const FACED = new Set(["cone", "line"]);

/**
 * The steps that put an area on the board.
 *
 * @param {object|null} area           From `areaFor`.
 * @param {object} [options]
 * @param {boolean} [options.hasToken] Whether the caster has a token here.
 * @returns {{origin: "token"|"click", facing: boolean, attach: boolean}|null}
 *   `origin` is where the area starts: the token's centre, or a click.
 *   `facing` asks a second click for the direction. `attach` makes the Region
 *   follow the token. Null for no area, or a shape this does not draw.
 */
export function placementSteps(area, { hasToken = false } = {}) {
  if (!area || !SHAPES.has(area.shape)) return null;
  // `self` is 07 §9's default, measured from the caster. With no token there
  // is nothing on the board to measure from, so the caster clicks instead.
  const onCaster = area.origin === ORIGINS.SELF && Boolean(hasToken);
  return {
    origin: onCaster ? STEP_ORIGINS.TOKEN : STEP_ORIGINS.CLICK,
    facing: FACED.has(area.shape),
    attach: onCaster && area.shape === "circle"
  };
}

/**
 * The facing from one point to another, in degrees, in [0, 360).
 *
 * **Canvas y runs DOWN**, so 90 is towards the bottom of the screen. That is
 * core's own convention: a cone or a line dragged on the Regions layer takes
 * `atan2(dy, dx)` in degrees (`client/data/shapes.mjs`, `_onDragMove`), and a
 * shape's `rotation` is an `AngleField` that stores [0, 360).
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} [minDistance]  A click no further than this from `from`
 *   names no direction. The canvas passes a few screen pixels at the current
 *   zoom; the default refuses only the same point.
 * @returns {number|null}  Null where the points coincide or are not numbers.
 */
export function facingDegrees(from, to, minDistance = 0) {
  const dx = Number(to?.x) - Number(from?.x);
  const dy = Number(to?.y) - Number(from?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const floor = Number.isFinite(minDistance) && minDistance > 0 ? minDistance : 0;
  if (Math.hypot(dx, dy) <= floor) return null;
  const degrees = Math.atan2(dy, dx) * (180 / Math.PI);
  // The second `% 360` is not redundant: -1e-15 comes back as exactly 360.
  return ((degrees % 360) + 360) % 360;
}

/**
 * How many chords an arc is drawn with. Core's gridless tolerance
 * (`common/grid/gridless.mjs`, `getCone`): no chord more than a quarter of a
 * pixel inside the true arc, and never fewer than four.
 */
function arcSegments(radius, sweepDegrees) {
  const step = Math.acos(Math.max(radius - 0.25, 0) / radius);
  return Math.max(Math.ceil((Math.PI / step) * (sweepDegrees / 360)), 4);
}

/**
 * The area's outline as a flat polygon, `[x0, y0, x1, y1, ...]` in pixels, for
 * the preview drawn while the caster aims (D-723).
 *
 * The same polygon core builds for the Region the placement will create
 * (`gridBased: false`, as `canvas/regions.mjs#shapeFor` writes every one), so
 * what the preview shows is where the area lands:
 *
 *  - a **cone** is its apex, then its round arc from `rotation − angle/2` to
 *    `rotation + angle/2`;
 *  - a **line** is four corners, the start at `origin` and the width centred
 *    on the axis (`common/grid/base.mjs`, `getLine`);
 *  - a **circle** is its ring of points.
 *
 * @param {object} area                     From `areaFor`.
 * @param {{x: number, y: number}} origin   Where it starts, in pixels.
 * @param {number} scale                    Pixels per foot.
 * @param {number} [rotation]               Facing in degrees.
 * @returns {number[]|null}  Null for no area, no size, or a shape it does not draw.
 */
export function outline(area, origin, scale, rotation = 0) {
  if (!area || !origin) return null;
  const x = Number(origin.x);
  const y = Number(origin.y);
  const reach = Number(area.distanceFt) * Number(scale);
  if (![x, y, reach].every(Number.isFinite) || reach <= 0) return null;
  const facing = (Number(rotation) || 0) * (Math.PI / 180);

  switch (area.shape) {
    case "circle": {
      const n = arcSegments(reach, 360);
      const points = [];
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * (i / n);
        points.push(x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      }
      return points;
    }

    case "cone": {
      const sweep = Number(area.angle);
      if (!Number.isFinite(sweep) || sweep <= 0) return null;
      const half = (sweep / 2) * (Math.PI / 180);
      const n = arcSegments(reach, sweep);
      const points = [x, y];
      for (let i = 0; i <= n; i++) {
        const a = (facing - half) + (2 * half) * (i / n);
        points.push(x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      }
      return points;
    }

    case "line": {
      const width = Number(area.widthFt ?? LINE_WIDTH_FT) * Number(scale);
      if (!Number.isFinite(width) || width <= 0) return null;
      const ux = Math.cos(facing);
      const uy = Math.sin(facing);
      // The half-width across the axis, a quarter turn from the facing.
      const nx = -uy * (width / 2);
      const ny = ux * (width / 2);
      const ex = x + ux * reach;
      const ey = y + uy * reach;
      return [
        x - nx, y - ny,
        ex - nx, ey - ny,
        ex + nx, ey + ny,
        x + nx, y + ny
      ];
    }

    default:
      return null;
  }
}

/* ====================== D-763: the pick seam, and the aim a 3D view draws */

/**
 * The hook the aim preview is announced on (D-763): once for every draw of the
 * 2D preview while a cone or a line is aimed, with `aimPreviewData`'s payload,
 * and once with `null` when the aim ends, however it ends.
 */
export const AIM_PREVIEW_HOOK = "azerothAimPreview";

/**
 * **A POINT A PICK CAN PLACE AT** (D-763): `{x, y}` in canvas pixels, both
 * finite numbers, or null. What a registered pick surface's `pointAt` answers
 * is read through this, so a reader that answers the sky, a string or NaN names
 * no point and the press is left alone.
 *
 * @param {*} value
 * @returns {{x: number, y: number}|null}  a fresh object, never the one handed in
 */
export function finitePoint(value) {
  if (!value || typeof value !== "object") return null;
  const x = value.x;
  const y = value.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * **WHAT THE AIM PREVIEW ANNOUNCES** (D-763; the lead, 2026-09-29: *Approve
 * it* - the aim preview drawn in 3D). The 2D preview is a PIXI graphic on
 * `canvas.controls`, which a 3D view does not show, so every draw of it is
 * also announced on `AIM_PREVIEW_HOOK` with this: the polygon the 2D preview
 * fills, in the same canvas pixels, and what it was drawn from.
 *
 * - `origin` where the area starts (a cone's apex, a line's start), `{x, y}`.
 * - `area` `rules/areas.mjs#areaFor`'s shape: `shape`, `distanceFt`, and a
 *   cone's `angle` or a line's `widthFt`.
 * - `rotation` the facing in degrees, [0, 360), canvas y DOWN (0 is east, 90
 *   south): `facingDegrees`. Null while the pointer names no direction.
 * - `points` the outline, flat `[x0, y0, x1, y1, ...]` (`outline`), or null
 *   while there is nothing to draw - the pointer on the area's own origin,
 *   which names no direction. The 2D preview is cleared at the same moment.
 *   A pointer that leaves the board and every surface announces nothing, and
 *   both previews stay where it left them.
 * - `color` the area's colour, `#rrggbb`; `label` its name; `sceneId` the scene
 *   it is being aimed on.
 *
 * Plain and FROZEN: a listener is handed copies, so nothing it does can move
 * the area being aimed.
 *
 * @returns {Readonly<object>}
 */
export function aimPreviewData({ origin = null, area = null, rotation = null, points = null, color = null, label = "", sceneId = null } = {}) {
  const at = finitePoint(origin);
  const facing = typeof rotation === "number" && Number.isFinite(rotation) ? rotation : null;
  const outlinePoints = Array.isArray(points) && points.length && points.every(Number.isFinite) ? Object.freeze([...points]) : null;
  return Object.freeze({
    origin: at ? Object.freeze(at) : null,
    area: area && typeof area === "object" ? Object.freeze({ ...area }) : null,
    rotation: facing,
    points: outlinePoints,
    color: typeof color === "string" && color ? color : null,
    label: typeof label === "string" ? label : String(label ?? ""),
    sceneId: typeof sceneId === "string" && sceneId ? sceneId : null
  });
}

/* ================= D-767: a pick announced as it begins and ends, and its cancel */

/**
 * The hook a pick is announced on (D-767; the lead, 2026-09-30: *Right-click
 * without drag*): once with `pickStartState` when a pick begins and once with
 * `pickEndState` when it ends, however it ends. A 3D view that turns its camera
 * on a right-drag reads it to know an aim is open, and cancels on a right-click
 * that did not drag through `game.system.azeroth.canvas.cancelPick()`.
 */
export const PICK_STATE_HOOK = "azerothPickState";

/**
 * What a pick is waiting for: `point` a place (a circle, where a cone or a line
 * starts - `canvas/place.mjs#pickPoint`), `facing` a direction (a cone's or a
 * line's aim, `pickFacing`, however many presses on its own origin it refuses).
 */
export const PICK_MODES = Object.freeze({ POINT: "point", FACING: "facing" });

/**
 * How a pick ended.
 *
 * - `placed`: a press gave it its point or its facing.
 * - `cancelled`: Escape, a press of any button but the left on the board,
 *   `cancelPick()`, or another pick begun while it waited.
 * - `failed`: it could not go on - the board it waited on was torn down (a scene
 *   change), or something inside the pick threw.
 */
export const PICK_OUTCOMES = Object.freeze({ PLACED: "placed", CANCELLED: "cancelled", FAILED: "failed" });

const MODES = new Set(Object.values(PICK_MODES));
const OUTCOMES = new Set(Object.values(PICK_OUTCOMES));

/** A scene's id, or null. */
const idOr = value => (typeof value === "string" && value ? value : null);

/**
 * **WHAT A PICK ANNOUNCES AS IT BEGINS** (D-767): `{active: true, mode, hint,
 * sceneId}`, frozen. `hint` is the localised line the pick showed (*Click the
 * board to place Blizzard. Right-click or Escape to cancel.*), or null where it
 * showed none; `sceneId` the scene it is being made on.
 *
 * @param {{mode: string, hint?: string|null, sceneId?: string|null}} options
 * @returns {Readonly<{active: true, mode: string, hint: string|null, sceneId: string|null}>}
 */
export function pickStartState({ mode, hint = null, sceneId = null } = {}) {
  if (!MODES.has(mode)) throw new TypeError(`azeroth-rpg | a pick's mode is "point" or "facing", not ${JSON.stringify(mode)}`);
  return Object.freeze({ active: true, mode, hint: typeof hint === "string" && hint ? hint : null, sceneId: idOr(sceneId) });
}

/**
 * **WHAT A PICK ANNOUNCES AS IT ENDS** (D-767): `{active: false, mode, outcome,
 * sceneId}`, frozen, with the mode and scene it began with.
 *
 * @param {{mode: string, outcome: string, sceneId?: string|null}} options
 * @returns {Readonly<{active: false, mode: string, outcome: string, sceneId: string|null}>}
 */
export function pickEndState({ mode, outcome, sceneId = null } = {}) {
  if (!MODES.has(mode)) throw new TypeError(`azeroth-rpg | a pick's mode is "point" or "facing", not ${JSON.stringify(mode)}`);
  if (!OUTCOMES.has(outcome)) throw new TypeError(`azeroth-rpg | a pick ends placed, cancelled or failed, not ${JSON.stringify(outcome)}`);
  return Object.freeze({ active: false, mode, outcome, sceneId: idOr(sceneId) });
}

/**
 * **THE ONE PICK WAITING, AND ITS ANNOUNCEMENT** (D-767). `canvas/place.mjs`
 * holds one of these; this is the bookkeeping, pure, so the promises it makes
 * are held in Node:
 *
 *  - **One pick at a time** (D-723): `begin` stops the pick waiting before it -
 *    whose caller is handed null - and that pick's END is announced before the
 *    new one's START, so a listener that keeps one state never sees two open.
 *  - **Exactly once each**: a pick's start when it begins, its end the first
 *    time `end` is asked, and never again.
 *  - **`cancel` is Escape's own path**: it asks the waiting pick to stop itself
 *    (`stop`, the pick's own cleanup, which ends it as Escape does), then ends it
 *    as cancelled if the stop did not, and answers whether there was one.
 *  - `state()` is the start state of the pick waiting now, or null: what a
 *    listener that arrived late reads.
 *
 * **EVERY LISTENER HEARS A PICK'S START BEFORE ITS END** (the final review of
 * D-767, 2026-09-30). `announce` is `Hooks.callAll`, which hands a state to each
 * listener in turn, so a listener that cancelled the pick as it heard the start
 * used to have the END told inside that call - and every listener registered
 * after it heard the end first and the start after it. Two rules close it:
 *
 *  - **A cancel asked for while the pick's own start is still being told waits
 *    until every listener has it**, then stops the pick exactly as `cancel` does,
 *    still inside `begin`. Until then the pick is still the one waiting:
 *    `state()` answers its start, and a later listener that asks reads the state
 *    it was handed. `cancel` answers true at once, for it will be done.
 *  - **One announcement at a time, in the order it was decided.** One decided
 *    while another is being told - a pick begun from inside a listener, whose
 *    predecessor's end has to come first - is told once every listener has the
 *    one before it. The pick waiting is still stopped at once when a new one
 *    begins: a new pick cannot wait on an announcement.
 *
 * `announce` is handed each state; a throw from it is reported and goes no
 * further, so a listener cannot strand a pick half ended.
 *
 * @param {(state: object) => void} announce
 */
export function pickTracker(announce) {
  /** The pick waiting now, as `{pick, stop, ended, deferred}`, or null. */
  let current = null;
  /** Announcements decided and not yet told, oldest first. */
  const owed = [];
  let telling = false;
  /** The pick whose START is reaching its listeners at this moment. */
  let starting = null;

  /** Tell a state once every one decided before it has been told; `begun` is the pick a start begins. */
  function tell(state, begun = null) {
    owed.push({ state, begun });
    if (telling) return;
    telling = true;
    try {
      while (owed.length) {
        const next = owed.shift();
        starting = next.begun;
        try {
          announce(next.state);
        } catch (err) {
          console.warn("azeroth-rpg | a pick's announcement threw", err);
        } finally {
          starting = null;
        }
        // A cancel a listener asked for as it heard this start, now that every
        // listener has it.
        if (next.begun?.deferred) {
          try {
            finish(next.begun, next.begun.deferred);
          } catch (err) {
            console.warn("azeroth-rpg | a pick cancelled as it began could not stop itself", err);
          }
        }
      }
    } finally {
      telling = false;
    }
  }

  /** Stop a pick as Escape does, and end it as `outcome` if its stop did not. */
  function finish(record, outcome) {
    if (record.ended()) return;
    try {
      record.stop?.(outcome);
    } finally {
      record.pick.end(outcome);
    }
  }

  /** Stop the pick waiting now, as Escape does - once its start has been told, if it is being told. */
  function cancel(outcome = PICK_OUTCOMES.CANCELLED) {
    const record = current;
    if (!record) return false;
    if (starting === record) {
      record.deferred ??= outcome;
      return true;
    }
    finish(record, outcome);
    return true;
  }

  return Object.freeze({
    state: () => current?.pick.state ?? null,
    cancel,
    /**
     * @param {{mode: string, hint?: string|null, sceneId?: string|null, stop?: (outcome: string) => void}} options
     *   `stop` is the pick's own cleanup, called by `cancel` and by a pick begun after it.
     * @returns {{state: object, end: (outcome: string) => boolean}}  `end` answers whether it was this call that ended it
     */
    begin({ mode, hint = null, sceneId = null, stop = null } = {}) {
      const state = pickStartState({ mode, hint, sceneId });
      if (current) finish(current, PICK_OUTCOMES.CANCELLED);
      let ended = false;
      const pick = {
        state,
        end(outcome) {
          if (ended) return false;
          ended = true;
          if (current?.pick === pick) current = null;
          tell(pickEndState({ mode: state.mode, outcome, sceneId: state.sceneId }));
          return true;
        }
      };
      const record = { pick, stop, ended: () => ended, deferred: null };
      current = record;
      tell(state, record);
      return pick;
    }
  });
}
