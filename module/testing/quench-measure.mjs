/**
 * THE MEASURE CONTROL, THROUGH THE REAL SCENE-CONTROL BAR (D-766; the lead,
 * 2026-09-30: *Fix it*), inside a live world.
 *
 * Choosing Measure used to fire the Circle on its own and hand the bar to core's
 * Regions control, so Cone and Line could never be chosen - while every test of
 * the control called a tool's `onChange` by hand and passed. Here nothing is
 * called by hand: the control and its tools are pressed on the bar core draws,
 * as a player presses them.
 *
 * 1. choosing Measure fires nothing - no dialog, no pick, no Region - puts its
 *    own Circle, Cone, Line and Clear on the bar with none of them lit, and
 *    leaves the board on the layer it was on;
 * 2. Circle, Cone and Line, each pressed on the bar, ask a distance and place
 *    their Region where the board is pressed, the bar staying on Measure, and
 *    Clear takes them off;
 * 3. a token the user has selected starts a measured cone, which then asks only
 *    for its facing (D-723's table, reached now that the board is left alone).
 */

import { clearMeasuredAreas } from "../canvas/measure.mjs";
import { AIM_PREVIEW, pickState } from "../canvas/place.mjs";
import { chooseControl, cleanup, controlButton, made, pressTool, toolButton, untilHook } from "./fixtures.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 10000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

/** Degrees between two facings, the short way round: 359.99 is 0. */
const facingGap = (a, b) => {
  const gap = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(gap, 360 - gap);
};

/** Press the 2D board at a canvas point, as `azeroth-rpg.regions` does. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Cancel a pick still waiting, with the guard the regions batch uses against core's dismiss. */
function escape() {
  const guard = event => { if (event.key === "Escape") event.stopPropagation(); };
  document.addEventListener("keydown", guard, true);
  try {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  } finally {
    document.removeEventListener("keydown", guard, true);
  }
}

/** The tools the bar is drawing now, by name. */
const barTools = () => [...(ui.controls.element?.querySelectorAll('#scene-controls-tools button[data-action="tool"]') ?? [])].map(b => b.dataset.tool);

/** The Measure dialog, once it has drawn its distance field. */
async function measureDialog() {
  let dialog = null;
  await until(() => {
    dialog = foundry.applications.instances.get("azeroth-measure-dialog") ?? null;
    return Boolean(dialog?.rendered && dialog.element?.querySelector('input[name="distance"]'));
  }, "the Measure control's distance dialog");
  return dialog;
}

/** Give the dialog a distance and press Place. */
function place(dialog, feet) {
  dialog.element.querySelector('input[name="distance"]').value = String(feet);
  dialog.element.querySelector('button[data-action="place"]').click();
}

/** Resolve with the next measured Region made on this scene. */
function nextMeasured(scene) {
  return untilHook("createRegion", 15000, doc => doc.parent?.id === scene.id && doc.getFlag("azeroth-rpg", "measured") === true)
    .then(([doc]) => doc);
}

export function measureBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Measure control, through the real scene-control bar (D-766)", function () {
    let scene = null;
    let wasViewing = null;

    before(async function () {
      this.timeout(60000);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      // A 100px / 5ft grid: a foot is 20 pixels.
      scene = await Scene.create({ name: "ZZ Measure Bar", width: 3000, height: 2000, grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 30000);
    });

    after(async function () {
      this.timeout(120000);
      escape();
      await foundry.applications.instances.get("azeroth-measure-dialog")?.close?.();
      await clearMeasuredAreas(scene).catch(() => {});
      // Back on the Tokens control, where every other batch expects the bar.
      if (controlButton("tokens") && ui.controls.control?.name !== "tokens") await chooseControl("tokens").catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    it("fires nothing when Measure is chosen, and draws its own Circle, Cone, Line and Clear with none lit", async function () {
      this.timeout(30000);
      canvas.tokens.activate();
      await chooseControl("tokens");
      canvas.tokens.releaseAll();
      const before = scene.regions.size;
      const told = [];
      const info = ui.notifications.info;
      const states = [];
      const hook = Hooks.on("azerothPickState", state => states.push(state));
      ui.notifications.info = (...args) => { told.push(String(args[0])); return info.apply(ui.notifications, args); };
      try {
        await chooseControl("azerothMeasure");
        assert.sameMembers(barTools(), ["circle", "cone", "line", "clear"], "the bar is not drawing Measure's own tools");
        for (const name of ["circle", "cone", "line", "clear"]) {
          assert.equal(toolButton(name)?.getAttribute("aria-pressed"), "false", `${name} is lit as though it were chosen`);
        }
        // Long enough for a dialog or a pick to have opened, if anything had fired.
        await new Promise(r => setTimeout(r, 500));
        assert.isNotOk(foundry.applications.instances.get("azeroth-measure-dialog")?.rendered, "choosing Measure opened a measurement's dialog");
        assert.isNull(pickState(), "choosing Measure opened a pick");
        assert.deepEqual(states, [], "choosing Measure announced a pick");
        assert.deepEqual(told, [], "choosing Measure asked for a click");
        assert.equal(scene.regions.size, before, "choosing Measure placed something");
        assert.equal(ui.controls.control?.name, "azerothMeasure", "the bar was handed to another control");
        // The board stays on the layer it was on: Measure owns none.
        assert.strictEqual(canvas.activeLayer, canvas.tokens, `choosing Measure activated ${canvas.activeLayer?.options?.name}`);
      } finally {
        Hooks.off("azerothPickState", hook);
        ui.notifications.info = info;
        await chooseControl("tokens");
      }
    });

    it("measures a Circle, a Cone and a Line from the bar, each where the board is pressed, and Clear takes them off", async function () {
      this.timeout(60000);
      canvas.tokens.activate();
      await chooseControl("tokens");
      // Nobody selected, so the cone asks where it starts.
      canvas.tokens.releaseAll();
      const before = scene.regions.size;
      try {
        await chooseControl("azerothMeasure");

        // CIRCLE: a distance, then one press.
        let landed = nextMeasured(scene);
        pressTool("circle");
        place(await measureDialog(), 15);
        await until(() => pickState()?.mode === "point", "the circle's pick");
        assert.include(pickState().hint, "A 15 ft radius on the ground", "the circle's pick asks for something else");
        pressBoard({ x: 1000, y: 1000 });
        const circle = await landed;
        assert.equal(circle.shapes[0].type, "circle");
        assert.closeTo(circle.shapes[0].x, 1000, 0.5);
        assert.closeTo(circle.shapes[0].y, 1000, 0.5);
        assert.equal(circle.shapes[0].radius, 300, "15 ft at 20px a foot");
        assert.equal(ui.controls.control?.name, "azerothMeasure", "the Circle handed the bar away");

        // CONE: a distance, where it starts, then where it faces.
        landed = nextMeasured(scene);
        pressTool("cone");
        place(await measureDialog(), 20);
        await until(() => pickState()?.mode === "point", "the cone's start");
        pressBoard({ x: 400, y: 400 });
        await until(() => pickState()?.mode === "facing", "the cone's aim");
        pressBoard({ x: 400, y: 100 });
        const cone = await landed;
        assert.equal(cone.shapes[0].type, "cone");
        assert.closeTo(cone.shapes[0].x, 400, 0.5, "the cone does not start where it was pressed");
        assert.closeTo(cone.shapes[0].y, 400, 0.5, "the cone does not start where it was pressed");
        assert.isBelow(facingGap(cone.shapes[0].rotation, 270), 0.5, `the cone faces ${cone.shapes[0].rotation}, not the second press`);
        assert.equal(ui.controls.control?.name, "azerothMeasure", "the Cone handed the bar away");

        // LINE: a distance, where it starts, then its direction.
        landed = nextMeasured(scene);
        pressTool("line");
        place(await measureDialog(), 20);
        await until(() => pickState()?.mode === "point", "the line's start");
        pressBoard({ x: 1000, y: 400 });
        await until(() => pickState()?.mode === "facing", "the line's aim");
        pressBoard({ x: 1400, y: 400 });
        const line = await landed;
        assert.equal(line.shapes[0].type, "line");
        assert.closeTo(line.shapes[0].x, 1000, 0.5);
        assert.closeTo(line.shapes[0].y, 400, 0.5);
        assert.isBelow(facingGap(line.shapes[0].rotation, 0), 0.5, `the line runs at ${line.shapes[0].rotation}, not towards the second press`);
        assert.equal(line.shapes[0].length, 400, "20 ft at 20px a foot");

        for (const region of [circle, cone, line]) assert.isTrue(region.getFlag("azeroth-rpg", "measured"), `${region.name} is not marked as measured`);
        assert.equal(scene.regions.size, before + 3);
        assert.isNull(pickState(), "a pick outlived its measurement");

        // CLEAR, from the bar too.
        pressTool("clear");
        await until(() => scene.regions.size === before, "Clear to take the three measurements off");
      } finally {
        escape();
        await foundry.applications.instances.get("azeroth-measure-dialog")?.close?.();
        await clearMeasuredAreas(scene);
        await chooseControl("tokens");
      }
    });

    it("starts a measured cone at the token the user has selected, and asks only for its facing", async function () {
      this.timeout(60000);
      const actor = await Actor.create({ name: "ZZ Measuring Hunter", type: "character" });
      made.push(actor);
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, x: 600, y: 600, width: 1, height: 1 }]);
      try {
        await until(() => actor.getActiveTokens(false, false)[0]?.renderable === true, "the token drawn");
        canvas.tokens.activate();
        await chooseControl("tokens");
        const token = actor.getActiveTokens(false, false)[0];
        token.control({ releaseOthers: true });
        await until(() => canvas.tokens.controlled.some(t => t.id === tokenDoc.id), "the token selected");

        await chooseControl("azerothMeasure");
        assert.isTrue(canvas.tokens.controlled.some(t => t.id === tokenDoc.id), "choosing Measure released the selected token");

        const landed = nextMeasured(scene);
        pressTool("cone");
        place(await measureDialog(), 15);
        // No start to press: the aim opens on the token.
        await until(() => pickState()?.mode === "facing", "the cone's aim");
        assert.ok(canvas.controls.children.find(c => c.name === AIM_PREVIEW && !c.destroyed), "no aim drawn on the board");
        pressBoard({ x: 650, y: 950 });
        const cone = await landed;
        assert.closeTo(cone.shapes[0].x, 650, 0.5, "the measured cone does not start at the selected token's centre");
        assert.closeTo(cone.shapes[0].y, 650, 0.5, "the measured cone does not start at the selected token's centre");
        assert.isBelow(facingGap(cone.shapes[0].rotation, 90), 0.5, `the measured cone faces ${cone.shapes[0].rotation}, not the press below the token`);
        assert.isNull(cone._source.attachment.token, "a measured cone follows the token");
      } finally {
        escape();
        await foundry.applications.instances.get("azeroth-measure-dialog")?.close?.();
        canvas.tokens.releaseAll();
        await clearMeasuredAreas(scene);
        await tokenDoc.delete().catch(() => {});
        await chooseControl("tokens");
      }
    });
  });
}
