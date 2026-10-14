/**
 * Placing a spell's area from its chat card.
 *
 * **V14 ships no crosshair.** `MeasuredTemplate` carried its own preview-and-
 * click flow and was deleted with it, and nothing in
 * `client/canvas/interaction/` replaces it — there is a ping and a ruler and
 * that is all. So the pick is hand-rolled: a click on the board, converted
 * with `canvas.canvasCoordinatesFromClient`, which is what core's own
 * `Canvas##onClickLeft` uses (`client/canvas/board.mjs:2486`).
 *
 * **Which clicks an area asks for is `rules/placement.mjs`** (D-723): a circle
 * as it always was, a cone from the caster's token with one click for its
 * facing, a line clicked where it starts and again for its direction. The
 * facing click draws the area from its origin to the pointer until it lands.
 *
 * **The listener sits on the WINDOW, in the capture phase, and keeps only a
 * press on the board.** It used to sit on the board element itself, which
 * does not keep the press off the layer underneath: PIXI's EventSystem adds
 * its own capture listener for `pointerdown` to that element when the canvas
 * is made (`@pixi/events` 7.4.3, `EventSystem#addEvents`, verified in the
 * 14.367 install), listeners on one element run in the order they were added,
 * and stopping propagation does not stop a sibling listener. So PIXI had
 * already handed the press to the Tokens layer, and aiming a cone at an enemy
 * selected the enemy. The window is the first stop on the capture path.
 *
 * **A pick may be pressed on a view that is not the board** (D-763; the lead,
 * 2026-09-29: *Approve it*). A 3D view draws its own `<canvas>` over a hidden
 * board, so a press there never reached a pick that kept only presses on
 * `canvas.app.view`: a clicked area, a cone's facing and every Measure tool
 * waited for a click that never came. `registerPickSurface` names such an
 * element and how to read the canvas point it was pressed at; `pointOf` is the
 * one reading every press and pointer move goes through; and the aim preview,
 * which is drawn on `canvas.controls` where a 3D view cannot see it, is
 * announced on `azerothAimPreview` for the view to draw. **With nothing
 * registered the board behaves exactly as before**: `pointOf` answers the board
 * through `canvas.canvasCoordinatesFromClient` and everything else with null,
 * which is the old `event.target !== board` refusal. `placeArea` stays the one
 * writer of a spell's Region.
 *
 * **A pick is announced as it begins and as it ends, and it can be cancelled
 * from outside** (D-767; the lead, 2026-09-30: *Right-click without drag*). A 3D
 * view turns its camera on a right-DRAG, so its reader names no point for a
 * right press and the board's right-click cancel never reaches it; the view
 * reads `azerothPickState` to know an aim is open and calls `cancelPick()` on a
 * right-click that did not drag, which is Escape's own path. `pickState()` is
 * the state a listener that arrived late reads. The bookkeeping - one pick at a
 * time, each announced once each way - is `rules/placement.mjs#pickTracker`.
 */

import { areaFor, lengthenArea, widenArea } from "../rules/areas.mjs";
import {
  AIM_PREVIEW_HOOK, PICK_MODES, PICK_OUTCOMES, PICK_STATE_HOOK, STEP_ORIGINS, aimPreviewData, facingDegrees,
  finitePoint, outline, pickTracker, placementSteps
} from "../rules/placement.mjs";
import { pixelsPerFoot, placeArea, schoolColor } from "./regions.mjs";

/** The aim preview's name on `canvas.controls`, which a test looks for. */
export const AIM_PREVIEW = "azeroth-aim-preview";

/**
 * How close to its origin a facing click may land and still be refused, in
 * SCREEN pixels, converted at the zoom of the moment. A click that close names
 * no direction a player meant.
 */
const AIM_DEAD_ZONE_PX = 4;

/** Where the area's outline would be drawn when no colour is named. */
const PREVIEW_COLOR = "#8b1a1a";

/**
 * **THE ONE PICK WAITING FOR A PRESS, ANNOUNCED** (D-723, D-767): which pick is
 * open, the `azerothPickState` announcement of its start and its end, and the
 * cancel a new pick, Escape and `cancelPick()` share. `Hooks.callAll` reports a
 * listener's throw itself.
 */
const picks = pickTracker(state => Hooks.callAll(PICK_STATE_HOOK, state));

/**
 * **THE PICK WAITING NOW** (D-767): `game.system.azeroth.canvas.pickState()`.
 * The `{active: true, mode, hint, sceneId}` its start announced on
 * `azerothPickState` (`rules/placement.mjs#pickStartState`), the same frozen
 * object, or null when no pick is waiting - for a view that began listening
 * after the pick did.
 *
 * @returns {Readonly<{active: true, mode: "point"|"facing", hint: string|null, sceneId: string|null}>|null}
 */
export function pickState() {
  return picks.state();
}

/**
 * **CANCEL THE PICK WAITING NOW, EXACTLY AS ESCAPE DOES** (D-767):
 * `game.system.azeroth.canvas.cancelPick()`. The same path an Escape takes - the
 * listeners off, the hint taken down, the aim's preview gone, its end announced
 * as `cancelled`, and its caller handed null, so nothing is placed - and true;
 * false, and nothing done, where no pick is waiting. A 3D view calls it on a
 * right-click that did not drag, since its right-drag turns the camera.
 *
 * @returns {boolean}
 */
export function cancelPick() {
  return picks.cancel(PICK_OUTCOMES.CANCELLED);
}

/**
 * The elements besides the board a pick may be pressed on (D-763), each with
 * the reader that says where on the canvas a press landed.
 *
 * @type {Map<Element, Readonly<{element: Element, pointAt: Function|null}>>}
 */
const surfaces = new Map();

/**
 * **NAME AN ELEMENT A PICK MAY BE PRESSED ON** (D-763): a 3D view's `<canvas>`,
 * drawn over the 2D board, so a spell's area, a cone's facing and the Measure
 * control's clicks can be made in it. `game.system.azeroth.canvas.registerPickSurface`.
 *
 * **The reader.** `pointAt(event)` is handed the `pointerdown` or `pointermove`
 * DOM event (a `PointerEvent`) whose target is the element or inside it, and
 * answers synchronously with `{x, y}` in CANVAS PIXELS - the scene's own
 * coordinates, the space `canvas.canvasCoordinatesFromClient` answers in and a
 * Region's shape is stored in - or with null where the press names no point on
 * the ground (the sky). A non-finite answer or a throw is read as null. It is
 * called in the window's capture phase, before the view's own listeners have
 * seen the event, so a view reads its own point for the event rather than a
 * cursor state its handler has not yet updated. **Without `pointAt`** the
 * surface is read through core's pointer,
 * `canvas.app.renderer.events.pointer.getLocalPosition(canvas.stage)`, which a
 * view that keeps core's pointer in step answers from its own raycast; it is
 * exact for a press made after the pointer has rested, and a pointer MOVE reads
 * it one event late, because the view updates it after this listener has run.
 *
 * **What a press does.** A press on the surface that names a point is the
 * pick's, as a press on the board is: it is kept from the view underneath, a
 * left press places, any other button cancels, and Escape still cancels. A
 * press that names no point is left alone and the pick keeps waiting.
 *
 * **Several surfaces** may be registered at once, and a press is read by the
 * INNERMOST registered element that holds its target. The board itself is
 * always the board. Registering an element again replaces its reader.
 *
 * **Unregistering.** The returned function takes this registration off and
 * answers whether it did; it does nothing once the element has been registered
 * again, so an old view's cleanup cannot take a newer one's surface away. A
 * view unregisters when it goes (`canvasTearDown`); a surface left registered
 * after its element has left the page is never pressed, and is held here until
 * it is unregistered.
 *
 * @param {Element} element
 * @param {{pointAt?: ((event: PointerEvent) => ({x: number, y: number}|null))|null}} [options]
 * @returns {() => boolean}  unregister
 */
export function registerPickSurface(element, { pointAt = null } = {}) {
  if (element?.nodeType !== 1) throw new TypeError("azeroth-rpg | registerPickSurface: the surface must be a DOM element");
  if (pointAt !== null && typeof pointAt !== "function") {
    throw new TypeError("azeroth-rpg | registerPickSurface: pointAt must be a function or null");
  }
  const entry = Object.freeze({ element, pointAt });
  surfaces.set(element, entry);
  return () => {
    if (surfaces.get(element) !== entry) return false;
    surfaces.delete(element);
    return true;
  };
}

/**
 * **WHERE ON THE CANVAS A PRESS OR A POINTER MOVE LANDED** (D-763), in canvas
 * pixels, or null where it is not the pick's.
 *
 * - On the board: `canvas.canvasCoordinatesFromClient`, as the pick always read
 *   it (`client/canvas/board.mjs`).
 * - On a registered surface, or inside one: that surface's reader
 *   (`registerPickSurface`), through `rules/placement.mjs#finitePoint`.
 * - Anywhere else: null. With nothing registered, that is every press that is
 *   not on the board, exactly as before.
 *
 * @param {Event} event
 * @param {HTMLCanvasElement|null} [board]  the board's element, `canvas.app.view`
 * @returns {{x: number, y: number}|null}
 */
export function pointOf(event, board = canvas?.app?.view ?? null) {
  const target = event?.target ?? null;
  if (!target) return null;
  if (board && target === board) return canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  const surface = surfaceHolding(target);
  if (!surface) return null;
  try {
    return finitePoint(surface.pointAt
      ? surface.pointAt(event)
      : canvas?.app?.renderer?.events?.pointer?.getLocalPosition?.(canvas.stage));
  } catch (err) {
    // A view whose reader cannot answer must not take the pick down with it.
    console.warn("azeroth-rpg | a pick surface could not say where it was pressed", err);
    return null;
  }
}

/** The innermost registered surface that is, or holds, this element. */
function surfaceHolding(target) {
  if (!surfaces.size) return null;
  for (let element = target; element; element = element.parentElement ?? null) {
    const surface = surfaces.get(element);
    if (surface) return surface;
  }
  return null;
}

/**
 * Wait for one click on the board and return where it landed, in canvas
 * pixels. Escape or a right-click cancels and returns `null`, and so does a
 * scene change, since the click would land on a different board.
 *
 * **Or on a registered pick surface** (D-763): every press and pointer move is
 * read through `pointOf`, so a view registered with `registerPickSurface` is
 * pressed exactly as the board is, and with nothing registered only the board
 * is.
 *
 * **One pick at a time.** Two Place area presses before a click used to leave
 * two listeners waiting, and the one click resolved both — two Regions. A new
 * pick cancels the one before it, which resolves `null` to its caller.
 *
 * **Announced** (D-767): its start on `azerothPickState` as it begins to wait,
 * and its end - `placed`, `cancelled` or `failed` - the moment that is decided,
 * once, in a `finally` whatever the cleanup does. **Its hint goes with it**:
 * the notification it showed is taken down as it ends, however it ends, so a
 * pick that is over never asks for a click. A pick begun with no board to
 * press is never begun, and announces nothing.
 *
 * @param {object} [options]
 * @param {string|null} [options.hint]  Said as a notification when the pick opens.
 * @param {Function|null} [options.onMove]  Called with the pointer's canvas
 *   point as it moves over the board or a pick surface, for a preview.
 * @param {"point"|"facing"} [options.mode]  What is announced as waited for
 *   (`rules/placement.mjs#PICK_MODES`): `pickFacing` passes `facing`.
 * @param {((point: {x: number, y: number}) => boolean)|null} [options.accept]
 *   Asked of a left press that names a point: `false` refuses it - the caller
 *   says why - and the pick keeps waiting. A throw fails the pick.
 * @param {Function|null} [options.onEnd]  Called once as the pick ends, with its
 *   cleanup and before its end is announced: `pickFacing` takes its aim down
 *   there, so a pick begun after it never has its first outline cleared.
 * @param {string|null} [options.sceneId]  The scene announced; the viewed one where left out.
 * @returns {Promise<{x: number, y: number}|null>}
 */
export function pickPoint({ hint = null, onMove = null, mode = PICK_MODES.POINT, accept = null, onEnd = null, sceneId = null } = {}) {
  // A new pick cancels the one before it, even one that cannot begin itself.
  picks.cancel(PICK_OUTCOMES.CANCELLED);
  return new Promise(resolve => {
    const board = canvas?.app?.view;
    if (!board) return resolve(null);

    let settled = false;
    let tearDown = null;
    let shown = null;
    let pick = null;

    const onDown = event => {
      // The board, or a view registered as a pick surface (D-763); nothing
      // else is the pick's.
      const point = pointOf(event, board);
      if (!point) return;
      // The press is the pick's either way, so it never reaches the layer
      // underneath to select a token or start a drag on the way past.
      event.preventDefault();
      event.stopPropagation();
      // Right-click cancels, the way every other placement in Foundry does.
      if (event.button !== 0) return done(null, PICK_OUTCOMES.CANCELLED);
      // A press the caller refuses - a facing on its own origin - is said by the
      // caller, and the pick waits for another.
      if (accept && !accepts(point)) return;
      done(point);
    };

    const onPointerMove = event => {
      const point = pointOf(event, board);
      if (!point) return;
      try {
        onMove(point);
      } catch (err) {
        // A preview that cannot draw must not take the pick down with it.
        console.warn("azeroth-rpg | the area preview could not be drawn", err);
      }
    };

    const onKey = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      done(null, PICK_OUTCOMES.CANCELLED);
    };

    /** The caller's judgement of a press; one that throws ends the pick as failed. */
    function accepts(point) {
      try {
        return accept(point) !== false;
      } catch (err) {
        console.warn("azeroth-rpg | a pick could not judge a press", err);
        done(null, PICK_OUTCOMES.FAILED);
        return false;
      }
    }

    function done(value, outcome = value ? PICK_OUTCOMES.PLACED : PICK_OUTCOMES.CANCELLED) {
      if (settled) return;
      settled = true;
      try {
        window.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("keydown", onKey, true);
        if (tearDown !== null) Hooks.off("canvasTearDown", tearDown);
        // The hint goes with the pick it asked for (D-767).
        if (typeof shown?.remove === "function") shown.remove();
        if (typeof onEnd === "function") {
          try {
            onEnd();
          } catch (err) {
            console.warn("azeroth-rpg | a pick's aim could not be taken down", err);
          }
        }
      } finally {
        // Announced however the cleanup went, and once (D-767).
        pick?.end(outcome);
        resolve(value);
      }
    }

    // Begun: the pick before it has been stopped and its end announced, then
    // this one's start. A listener that cancels it as it hears the start stops
    // it once every listener has heard it (the final review of D-767) - still
    // inside `begin`, so it is already settled here.
    pick = picks.begin({ mode, hint, sceneId: sceneId ?? canvas?.scene?.id ?? null, stop: outcome => done(null, outcome) });
    if (settled) return;
    try {
      if (hint) shown = ui.notifications?.info(hint) ?? null;
      // The board it waits on is going: a press would land on another scene's.
      tearDown = Hooks.once("canvasTearDown", () => done(null, PICK_OUTCOMES.FAILED));
      window.addEventListener("pointerdown", onDown, true);
      if (typeof onMove === "function") window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("keydown", onKey, true);
    } catch (err) {
      // A pick announced as begun that cannot wait is over, and says so.
      console.warn("azeroth-rpg | a pick could not open", err);
      done(null, PICK_OUTCOMES.FAILED);
    }
  });
}

/**
 * Wait for the click that gives a cone or a line its facing (D-723), drawing
 * the area from its origin towards the pointer until it lands.
 *
 * Escape or a right-click cancels and returns `null`. A click on the origin
 * itself names no direction, so it is refused in words and the pick waits for
 * another. The preview is taken down however the pick ends.
 *
 * **One facing pick, announced once** (D-767): its start as `facing` with the
 * aim's hint, and its end when a press gives it a direction or it is
 * cancelled - a press refused on its own origin keeps the same pick open. The
 * aim is taken down the moment the pick ends, before its end is announced, so
 * a pick begun after it never has its first outline cleared by this one's
 * `null`.
 *
 * @param {object} options
 * @param {{x: number, y: number}} options.origin  Where the area starts, in pixels.
 * @param {object} options.area                    From `areaFor`.
 * @param {Scene|null} [options.scene]             Whose grid sizes the preview.
 * @param {string} [options.label]                 The area's name, for the hint.
 * @param {string|null} [options.color]            The Region's colour.
 * @returns {Promise<number|null>}  The facing in degrees, in [0, 360).
 */
export async function pickFacing({ origin, area, scene = null, label = "", color = null } = {}) {
  if (!origin || !area) return null;
  const board = scene ?? canvas?.scene;
  const scale = pixelsPerFoot(board);
  // The dead zone is screen pixels, so it is the same size at every zoom.
  const deadZone = () => AIM_DEAD_ZONE_PX / (canvas?.stage?.scale?.x || 1);

  const preview = aimPreview();
  const tint = colorNumber(color);
  const shade = colorCss(color);
  let open = true;
  const draw = point => {
    if (!open) return;
    const rotation = point ? facingDegrees(origin, point, deadZone()) : null;
    const points = rotation === null ? null : outline(area, origin, scale, rotation);
    // Announced for a view that cannot see `canvas.controls` - a 3D one - on
    // every draw, whether or not the 2D preview could be drawn (D-763).
    Hooks.callAll(AIM_PREVIEW_HOOK, aimPreviewData({
      origin, area, rotation: points ? rotation : null, points, color: shade, label, sceneId: board?.id ?? null
    }));
    if (!preview || preview.destroyed) return;
    preview.clear();
    if (!points) return;
    const zoom = canvas?.stage?.scale?.x || 1;
    preview.lineStyle({ width: 2 / zoom, color: tint, alpha: 0.9 });
    preview.beginFill(tint, 0.25);
    preview.drawPolygon(points);
    preview.endFill();
  };
  // The aim taken down once, the moment the pick ends however it ends: the
  // pick's own cleanup calls it, and the `finally` below for anything else.
  const closeAim = () => {
    if (!open) return;
    open = false;
    if (preview && !preview.destroyed) preview.destroy();
    // The aim is over, however it ended: a view takes its outline down (D-763).
    Hooks.callAll(AIM_PREVIEW_HOOK, null);
  };
  // A press on the origin names no direction: refused in words, and the same
  // pick waits for another (D-723).
  let rotation = null;
  const accept = point => {
    rotation = facingDegrees(origin, point, deadZone());
    if (rotation !== null) return true;
    ui.notifications?.warn(game.i18n.format("AZEROTH.Area.AimSamePoint", { name: label }));
    return false;
  };

  try {
    const pressed = pickPoint({
      hint: game.i18n.format("AZEROTH.Area.ClickToAim", { name: label }),
      onMove: draw,
      mode: PICK_MODES.FACING,
      accept,
      onEnd: closeAim,
      sceneId: board?.id ?? null
    });
    // Draw at once where the pointer already is, rather than on its first move.
    draw(canvas?.mousePosition ?? null);
    const point = await pressed;
    return point ? rotation : null;
  } finally {
    closeAim();
  }
}

/** The aim preview, on the controls layer above the tokens, never taking a click. */
function aimPreview() {
  const layer = canvas?.controls;
  if (!layer) return null;
  const graphics = new PIXI.Graphics();
  graphics.name = AIM_PREVIEW;
  graphics.eventMode = "none";
  layer.addChild(graphics);
  return graphics;
}

/** A Region's `#rrggbb` as the number PIXI draws with. */
function colorNumber(color) {
  const parsed = foundry.utils.Color.from(color ?? PREVIEW_COLOR);
  return parsed.valid ? Number(parsed) : Number(foundry.utils.Color.from(PREVIEW_COLOR));
}

/** The same colour as `#rrggbb`, for the announced preview (D-763). */
function colorCss(color) {
  const parsed = foundry.utils.Color.from(color ?? PREVIEW_COLOR);
  return (parsed.valid ? parsed : foundry.utils.Color.from(PREVIEW_COLOR)).css;
}

/**
 * Place a spell's area, asking for a point only where the book says the caster
 * chooses one.
 *
 * @param {object} options
 * @param {Item} options.spell
 * @param {Actor} [options.actor]  The caster, for `centered on you`.
 * @returns {Promise<RegionDocument|null>}
 */
export async function placeSpellArea({ spell, actor = null } = {}) {
  return placeItemArea({ item: spell, actor });
}

/**
 * Place an item's area (D-616): a spell's Target line, a feature's area in
 * the same phrasing, or a bare measurement with its own `areaText`, `name`
 * and `color`. The clicks are `rules/placement.mjs#placementSteps` (D-723).
 *
 * @param {object} options
 * @param {Item|null} [options.item]
 * @param {Actor|null} [options.actor]   The caster, for `centered on you`.
 * @param {string|null} [options.areaText]
 * @param {string|null} [options.name]
 * @param {string|null} [options.color]
 * @param {Token|TokenDocument|null} [options.token]  The caster's token, where
 *   the caller knows it. Left out, the actor's token on this scene, as it
 *   always was.
 * @param {boolean} [options.guessToken]  Whether a missing `token` may be
 *   looked for at all. A card's Place area says no (D-726): the card knows
 *   which token cast it or knows there was none, and the old fallback was
 *   whatever token happened to be SELECTED, which could be anybody's.
 * @param {object|null} [options.flags]  More `azeroth-rpg` flags for the
 *   Region (`regionDataFor`).
 * @param {number} [options.widenFt]  Feet a talent adds to a circle's radius
 *   (D-756: Consecrated Ground's rank 2), through `rules/areas.mjs#widenArea`.
 * @param {number} [options.lengthenFt]  Feet a talent adds to a cone's or a
 *   line's length (D-775: Cone of Cold), through `rules/areas.mjs#lengthenArea`.
 * @returns {Promise<RegionDocument|null>}
 */
export async function placeItemArea({ item = null, actor = null, areaText = null, name = null, color = null, token = null, guessToken = true, flags = null, widenFt = 0, lengthenFt = 0 } = {}) {
  const text = areaText ?? item?.system?.area ?? item?.system?.target ?? "";
  const label = name ?? item?.name ?? "";
  const area = lengthenArea(widenArea(areaFor(text), widenFt), lengthenFt);
  if (!area) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Area.NoArea", { name: label }));
    return null;
  }

  const scene = canvas?.scene;
  if (!scene) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Area.NoScene"));
    return null;
  }

  const caster = token ?? (guessToken ? tokenFor(actor) : null);
  const centre = caster ? centreOf(caster) : null;
  const steps = placementSteps(area, { hasToken: Boolean(centre) });
  if (!steps) {
    ui.notifications?.warn(game.i18n.format("AZEROTH.Area.NoArea", { name: label }));
    return null;
  }

  // 07 §9 measures from the caster unless the entry says otherwise, so an
  // area on the caster takes no click for where it is — asking would be
  // asking the caster where they are standing.
  let origin;
  if (steps.origin === STEP_ORIGINS.TOKEN) {
    origin = { x: centre.x, y: centre.y };
  } else {
    origin = await pickPoint({
      hint: game.i18n.format(steps.facing ? "AZEROTH.Area.ClickToStart" : "AZEROTH.Area.ClickToPlace", { name: label })
    });
    if (!origin) return null;
  }

  // A cone or a line points somewhere, and only the caster knows where.
  let rotation = 0;
  if (steps.facing) {
    rotation = await pickFacing({
      origin, area, scene, label,
      color: color ?? schoolColor(item?.system?.school)
    });
    if (rotation === null) return null;
  }

  return placeArea({
    item, areaText: text, name: label, color, scene, origin, rotation,
    token: caster, attach: steps.attach, flags, widenFt, lengthenFt
  });
}

/**
 * A token's centre in pixels: a placeable's `center`, or a TokenDocument's
 * own `getCenterPoint`, so a caller may hand over either.
 */
function centreOf(token) {
  const point = token?.center ?? token?.object?.center ?? token?.getCenterPoint?.() ?? null;
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

/** The caster's token on the current scene, if they have one. */
function tokenFor(actor) {
  if (!actor) return null;
  return actor.getActiveTokens(false, false)[0]
    ?? canvas.tokens?.controlled?.[0]
    ?? null;
}
