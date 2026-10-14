/**
 * The Measure control (D-616).
 *
 * Core hides its Measurement Controls in V14 - `TemplateLayer.prepareSceneControls`
 * returns `visible: false` because Measured Templates are deprecated - so a
 * table has no way to drop a 15-foot circle on the board that is not a
 * spell's card. This puts the tools back, on the Region grammar the cards
 * already use (`rules/areas.mjs`, `canvas/regions.mjs`): pick a shape, give
 * a distance, click the board. A measured area is a Region flagged
 * `azeroth-rpg.measured`, and Clear removes every one on the scene.
 *
 * Verified against the shipped V14 source: a scene control is
 * `{name, order, title, icon, visible, layer, onChange, tools}` and a tool
 * with `button: true` runs its `onChange` on click without becoming the
 * active tool (client/applications/ui/scene-controls.mjs).
 *
 * **Choosing Measure fires nothing, and its own Circle, Cone and Line stay on
 * the bar** (D-766; the lead, 2026-09-30: *Fix it*). The control used to
 * activate the Regions layer from its `onChange`, and a layer's `activate`
 * hands the bar to the layer's OWN control (`InteractionLayer#activate`,
 * `client/canvas/layers/base/interaction-layer.mjs` L72-81, 14.367), so the bar
 * showed core's region tools and Cone and Line could never be chosen; and the
 * switch deactivated the tool the control had made active (`activeTool:
 * "circle"`, scene-controls.mjs L454), whose `onChange` ignored `active`, so
 * the Circle's dialog opened on its own. Now the control activates no layer
 * and names no active tool, and each tool acts only when core says it is
 * pressed (`active`). **The board stays on the layer it was on**: a measured
 * area is drawn whichever layer is active (`visibility: ALWAYS`), no layer can
 * make anything with no tool chosen (`PlaceablesLayer#_isCreationToolActive`
 * wants a creation tool; `Token#_canDrag` wants the select tool), and Clear
 * takes the measurements off.
 *
 * **A measurement runs the same placement law a card does** (D-723):
 * `rules/placement.mjs#placementSteps` decides the clicks for both. A circle
 * is clicked. A line is clicked where it starts and then aimed. **A cone
 * starts at the token the user has selected and asks only for its facing**,
 * as a card's cone starts at its caster's token (D-723's table), **and is
 * clicked where it starts and then aimed where nobody is selected**. Before
 * D-766 no token was ever selected here - activating the Regions layer
 * released every one (`PlaceablesLayer#_deactivate`) - so every measured cone
 * took two clicks; before D-723 the same emptiness put every measured cone and
 * line at its click, facing east.
 */

import { areaFor } from "../rules/areas.mjs";
import { STEP_ORIGINS, placementSteps } from "../rules/placement.mjs";
import { placeArea } from "./regions.mjs";
import { pickFacing, pickPoint } from "./place.mjs";

const MEASURE_COLOR = "#8b1a1a";

/** The phrasing `areaFor` reads, for a shape and a distance. */
export function areaTextFor(shape, distanceFt) {
  const d = Math.max(1, Math.trunc(Number(distanceFt)) || 1);
  if (shape === "cone") return `A ${d} ft cone`;
  if (shape === "line") return `A ${d} ft line on the ground`;
  return `A ${d} ft radius on the ground`;
}

/**
 * Place a measured area on a scene at a point, with a facing for a cone or
 * a line. Pure of any dialog, so a test can call it.
 * @returns {Promise<RegionDocument|null>}
 */
export async function measureArea({ shape = "circle", distanceFt = 15, scene, origin, rotation = 0 } = {}) {
  if (!scene || !origin) return null;
  const d = Math.max(1, Math.trunc(Number(distanceFt)) || 1);
  // The mark goes on WITH the Region rather than in a second write after it,
  // so anything reading a new Region reads a measurement as one.
  return placeArea({
    areaText: areaTextFor(shape, d),
    name: game.i18n.format("AZEROTH.Measure.Name", { distance: d, shape: game.i18n.localize(`AZEROTH.Measure.${shape[0].toUpperCase()}${shape.slice(1)}`) }),
    color: MEASURE_COLOR,
    scene,
    origin,
    rotation,
    flags: { measured: true }
  });
}

/** Delete every measured area on a scene. Returns how many went. */
export async function clearMeasuredAreas(scene) {
  if (!scene) return 0;
  const ids = scene.regions.filter(r => r.getFlag("azeroth-rpg", "measured") === true).map(r => r.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  return ids.length;
}

/** Ask for a distance, then the clicks the shape takes, then place. */
async function measureFromTool(shape) {
  const { DialogV2 } = foundry.applications.api;
  const label = game.i18n.localize("AZEROTH.Measure.Distance");
  const distance = await DialogV2.wait({
    id: "azeroth-measure-dialog",
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: game.i18n.localize(`AZEROTH.Measure.${shape[0].toUpperCase()}${shape.slice(1)}`) },
    position: { width: 320 },
    content: `<div class="azeroth-dialog"><div class="azeroth-dialog-row"><label for="azeroth-measure-distance">${label}</label>
      <input type="number" id="azeroth-measure-distance" name="distance" value="15" min="5" step="5" autofocus></div></div>`,
    rejectClose: false,
    buttons: [{ action: "place", label: "AZEROTH.Measure.Place", default: true, callback: (event, button) => Number(button.form.elements.distance?.value) || 15 }]
  });
  if (!distance) return null;
  const scene = canvas?.scene;
  if (!scene) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Area.NoScene"));
    return null;
  }
  const text = areaTextFor(shape, distance);
  const area = areaFor(text);
  // The token the user has selected, where the board is still on the Tokens
  // layer (D-766): a measured cone starts there, and asks where it starts where
  // nobody is selected (see the header).
  const token = canvas.tokens?.controlled?.[0] ?? null;
  const steps = placementSteps(area, { hasToken: Boolean(token) });
  if (!steps) return null;

  let origin;
  if (steps.origin === STEP_ORIGINS.TOKEN) {
    origin = { x: token.center.x, y: token.center.y };
  } else {
    origin = await pickPoint({
      hint: game.i18n.format(steps.facing ? "AZEROTH.Area.ClickToStart" : "AZEROTH.Area.ClickToPlace", { name: text })
    });
    if (!origin) return null;
  }

  let rotation = 0;
  if (steps.facing) {
    rotation = await pickFacing({ origin, area, scene, label: text, color: MEASURE_COLOR });
    if (rotation === null) return null;
  }
  return measureArea({ shape, distanceFt: distance, scene, origin, rotation });
}

/** Clear every measured area on the viewed scene, and say how many went. */
async function clearFromTool() {
  const count = await clearMeasuredAreas(canvas?.scene);
  ui.notifications?.info(game.i18n.format("AZEROTH.Measure.Cleared", { count }));
  return count;
}

/**
 * Register the control. Call once, at init.
 *
 * **No `layer`, no control `onChange`, no `activeTool`** (D-766): choosing
 * Measure puts its four buttons on the bar and does nothing else. A tool's
 * `onChange` runs its measurement only when `active` is true - core presses a
 * button with `true` (`SceneControls##onChangeTool`) and deactivates a tool
 * with `false`, and a tool that ignored the flag fired on its own deactivation.
 */
export function registerMeasureControls() {
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.can?.("REGION_CREATE")) return;
    const tool = (name, order, icon, run) => ({
      name, order, icon,
      title: `AZEROTH.Measure.${name[0].toUpperCase()}${name.slice(1)}`,
      button: true,
      onChange: (event, active) => (active === true ? run() : undefined)
    });
    controls.azerothMeasure = {
      name: "azerothMeasure",
      order: 0,
      title: "AZEROTH.Measure.Title",
      icon: "fa-solid fa-ruler-combined",
      visible: true,
      tools: {
        circle: tool("circle", 1, "fa-regular fa-circle", () => measureFromTool("circle")),
        cone: tool("cone", 2, "fa-solid fa-play", () => measureFromTool("cone")),
        line: tool("line", 3, "fa-solid fa-minus", () => measureFromTool("line")),
        clear: tool("clear", 4, "fa-solid fa-broom", clearFromTool)
      }
    };
  });
}
