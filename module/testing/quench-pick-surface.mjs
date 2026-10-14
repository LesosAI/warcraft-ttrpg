/**
 * A PICK PRESSED ON A VIEW THAT IS NOT THE BOARD (D-763; the lead, 2026-09-29:
 * *Approve it* - areas aimed and placed by clicking in 3D, the aim preview
 * drawn in 3D, the 2D board unchanged), inside a live world.
 *
 * The seam's reading has its Vitests (`canvas/place.test.mjs`: the board, a
 * surface, the innermost of two, a reader that answers the sky or throws, the
 * unregister) and the payload its own (`placement.test.mjs`). What none of them
 * can reach is the real pick on a real board: the window's capture listener,
 * a card's Place area, the Measure control, and core's own 2D preview.
 *
 * The 3D view is stood in for by a plain element on the page, registered with
 * a reader that answers a known canvas point, and pressed with the same
 * `PointerEvent` a browser dispatches. **With nothing registered the board is
 * untouched**: `azeroth-rpg.regions` presses the board for every placement and
 * is its proof; this batch presses the board once more with a surface
 * registered, and an element nobody registered.
 */

import { CARD_ACTIONS } from "../dice/chat.mjs";
import { AIM_PREVIEW, placeSpellArea, registerPickSurface } from "../canvas/place.mjs";
import { clearMeasuredAreas } from "../canvas/measure.mjs";
import { AIM_PREVIEW_HOOK, outline } from "../rules/placement.mjs";
import { areaFor } from "../rules/areas.mjs";
import { chooseControl, cleanup, drainAreaWork, made, pinDie, pressTool, settle, toolButton } from "./fixtures.mjs";

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

/** A promise, or a failure naming what never happened. */
function within(promise, ms, what) {
  let timer = null;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(what)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Degrees between two facings, the short way round: 359.99 is 0. */
const facingGap = (a, b) => {
  const gap = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(gap, 360 - gap);
};

/**
 * A stand-in for a 3D view's `<canvas>`: a plain element on the page, off the
 * board's corner, taken away by the test that made it.
 */
function standIn() {
  const element = document.createElement("div");
  element.dataset.azerothPickStandIn = "";
  Object.assign(element.style, { position: "fixed", left: "4px", top: "4px", width: "60px", height: "60px", zIndex: "1" });
  document.body.append(element);
  return element;
}

/** Press (or move over) an element the way a browser does. */
function press(element, { type = "pointerdown", button = 0 } = {}) {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent(type, {
    clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
    button, buttons: type === "pointerdown" ? (button === 2 ? 2 : 1) : 0,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Press the 2D board at a canvas point, as `azeroth-rpg.regions` does. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/**
 * Cancel any pick still waiting, with the guard `azeroth-rpg.regions` uses: an
 * Escape that got past the pick would reach core's dismiss, which closes every
 * window, Quench's results with them.
 */
function escape() {
  const guard = event => { if (event.key === "Escape") event.stopPropagation(); };
  document.addEventListener("keydown", guard, true);
  try {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  } finally {
    document.removeEventListener("keydown", guard, true);
  }
}

/** Resolve when `ui.notifications.info` says `text` - the pick's hint, so the pick is waiting. */
function whenTold(text, ms = 10000) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const held = ui.notifications.info;
  const putBack = () => { if (own) ui.notifications.info = held; else delete ui.notifications.info; };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { putBack(); reject(new Error(`the pick never said "${text}"`)); }, ms);
    ui.notifications.info = (...args) => {
      const shown = held.apply(ui.notifications, args);
      if (String(args[0]) === text) { clearTimeout(timer); putBack(); resolve(); }
      return shown;
    };
  });
}

/** A card's button, off its rendered content, as the chat door reads it. */
function buttonOn(message, selector) {
  return new DOMParser().parseFromString(message.content, "text/html").querySelector(selector);
}

/** The aim preview on the 2D board, while a facing is being picked, or null. */
const boardPreview = () => canvas.controls?.children?.find(c => c.name === AIM_PREVIEW && !c.destroyed) ?? null;

export function pickSurfaceBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A pick pressed on a view that is not the board (D-763)", function () {
    let scene = null;
    let wasViewing = null;
    const messages = [];

    before(async function () {
      this.timeout(60000);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      // A 100px / 5ft grid: a foot is 20 pixels.
      scene = await Scene.create({ name: "ZZ Pick Surface", width: 3000, height: 2000, grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 30000);
      canvas.tokens.releaseAll();
    });

    after(async function () {
      this.timeout(120000);
      escape();
      const ids = messages.map(m => m?.id).filter(id => id && game.messages.has(id));
      if (ids.length) await ChatMessage.implementation.deleteDocuments(ids).catch(() => {});
      await drainAreaWork();
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    /** A spell of the world's own, cast by `actor` with the die pinned to go off, and its card. */
    async function castCard(actor, name, target, school) {
      const spell = await Item.create({ name, type: "spell", system: { target, school, tier: 1 } });
      made.push(spell);
      const unpin = pinDie(20);
      let card;
      try {
        card = await game.system.azeroth.workflows.castSpell({ actor, spell });
      } finally {
        unpin();
      }
      messages.push(card);
      assert.isTrue(card?.getFlag("azeroth-rpg", "success"), `${name} did not go off`);
      const button = buttonOn(card, '[data-action="placeArea"]');
      assert.ok(button, `${name}'s card offers no Place area`);
      return { spell, card, button };
    }

    it("places a card's circle where the surface says it was pressed", async function () {
      this.timeout(30000);
      const caster = await Actor.create({ name: "ZZ Surface Caster", type: "character" });
      made.push(caster);
      const { spell, card, button } = await castCard(caster, "ZZ Surface Blast", "A 20 ft radius on the ground", "fire");
      const surface = standIn();
      const off = registerPickSurface(surface, { pointAt: () => ({ x: 1500, y: 700 }) });
      const before = scene.regions.size;
      try {
        const told = whenTold(game.i18n.format("AZEROTH.Area.ClickToPlace", { name: spell.name }));
        const placing = CARD_ACTIONS.placeArea(button, card);
        await told;
        press(surface);
        const region = await within(placing, 5000, "a press on the registered surface placed nothing");
        assert.ok(region, "no Region was placed");
        const shape = region.shapes[0];
        assert.equal(shape.type, "circle");
        assert.closeTo(shape.x, 1500, 0.5, "the circle is not where the surface said it was pressed");
        assert.closeTo(shape.y, 700, 0.5, "the circle is not where the surface said it was pressed");
        assert.equal(shape.radius, 400, "20 ft at 20px a foot");
        // Through the card's own door: the Region carries the cast that placed it.
        assert.isString(card.getFlag("azeroth-rpg", "cast"), "the card records no cast");
        assert.equal(region.getFlag("azeroth-rpg", "cast"), card.getFlag("azeroth-rpg", "cast"), "the Region does not carry its card's cast");
        assert.equal(scene.regions.size, before + 1, "one press placed more than one Region");
      } finally {
        off();
        surface.remove();
        escape();
      }
    });

    it("announces the aim of a card's cone with the outline the board draws, faces the press on the surface, and announces the end", async function () {
      this.timeout(30000);
      const caster = await Actor.create({ name: "ZZ Aiming Caster", type: "character", prototypeToken: { actorLink: true } });
      made.push(caster);
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [{
        name: caster.name, actorId: caster.id, actorLink: true, x: 600, y: 600, width: 1, height: 1
      }]);
      await until(() => caster.getActiveTokens(false, false).length > 0, "the caster's token on the board");
      await settle();
      const { spell, card, button } = await castCard(caster, "ZZ Surface Cone", "A 15 ft cone", "frost");
      const announced = [];
      const hook = Hooks.on(AIM_PREVIEW_HOOK, data => announced.push(data));
      let aim = { x: 650, y: 950 };
      const surface = standIn();
      const off = registerPickSurface(surface, { pointAt: () => aim });
      try {
        const placing = CARD_ACTIONS.placeArea(button, card);
        await until(() => announced.length > 0 && boardPreview(), "the aim to open");
        // The pointer moves over the surface, straight below the caster.
        press(surface, { type: "pointermove" });
        const drawn = await until(() => {
          const last = announced.at(-1);
          return last?.points && facingGap(last.rotation, 90) < 0.01 ? last : null;
        }, "the aim drawn towards the pointer on the surface");
        const origin = { x: 650, y: 650 };
        assert.deepEqual({ ...drawn.origin }, origin, "the cone does not start at the caster's token");
        assert.equal(drawn.area?.shape, "cone");
        assert.deepEqual([...drawn.points], outline(areaFor("A 15 ft cone"), origin, 20, drawn.rotation),
          "the announced outline is not the polygon the board draws");
        assert.equal(drawn.color, "#4a90d9", "the announced colour is not the Region's");
        assert.equal(drawn.label, spell.name);
        assert.equal(drawn.sceneId, scene.id);
        assert.isTrue(Object.isFrozen(drawn), "a listener was handed the aim itself rather than a copy");
        // And the board drew its own preview, exactly as it always did.
        assert.ok(boardPreview(), "the 2D aim preview is gone");

        // Pressed on the surface, east of the caster: the cone faces the press.
        aim = { x: 950, y: 650 };
        press(surface);
        const region = await within(placing, 5000, "a press on the registered surface placed nothing");
        assert.ok(region, "no Region was placed");
        const shape = region.shapes[0];
        assert.equal(shape.type, "cone");
        assert.closeTo(shape.x, 650, 0.5);
        assert.closeTo(shape.y, 650, 0.5);
        assert.isBelow(facingGap(shape.rotation, 0), 0.5, `the cone faces ${shape.rotation}, not the press on the surface`);
        assert.isNull(announced.at(-1), "the end of the aim was not announced");
        assert.isNull(boardPreview(), "the 2D aim preview outlived the pick");
      } finally {
        Hooks.off(AIM_PREVIEW_HOOK, hook);
        off();
        surface.remove();
        escape();
        await tokenDoc.delete().catch(() => {});
      }
    });

    it("takes the Measure control's circle from the surface, because the control calls the same pick", async function () {
      this.timeout(30000);
      canvas.tokens.activate();
      canvas.tokens.releaseAll();
      // Through the bar (D-766), as a player presses it.
      await chooseControl("azerothMeasure");
      assert.ok(toolButton("circle"), "the Measure control draws no Circle tool on the bar");
      const surface = standIn();
      const off = registerPickSurface(surface, { pointAt: () => ({ x: 1200, y: 900 }) });
      try {
        const told = whenTold(game.i18n.format("AZEROTH.Area.ClickToPlace", { name: "A 15 ft radius on the ground" }));
        // A tool pressed on the bar hands nothing back: the Region is taken as it is made.
        const measuring = new Promise(resolve => {
          const id = Hooks.on("createRegion", doc => {
            if (doc.parent?.id !== scene.id || doc.getFlag("azeroth-rpg", "measured") !== true) return;
            Hooks.off("createRegion", id);
            resolve(doc);
          });
        });
        pressTool("circle");
        let dialog = null;
        await until(() => {
          dialog = foundry.applications.instances.get("azeroth-measure-dialog") ?? null;
          return Boolean(dialog?.rendered && dialog.element?.querySelector('input[name="distance"]'));
        }, "the Measure control's distance dialog");
        dialog.element.querySelector('input[name="distance"]').value = "15";
        dialog.element.querySelector('button[data-action="place"]').click();
        await told;
        press(surface);
        const region = await within(measuring, 5000, "a press on the registered surface measured nothing");
        assert.ok(region, "the Measure control placed nothing");
        const shape = region.shapes[0];
        assert.equal(shape.type, "circle");
        assert.closeTo(shape.x, 1200, 0.5);
        assert.closeTo(shape.y, 900, 0.5);
        assert.equal(shape.radius, 300, "15 ft at 20px a foot");
        assert.isTrue(region.getFlag("azeroth-rpg", "measured"), "the measured circle is not marked");
      } finally {
        off();
        surface.remove();
        escape();
        await foundry.applications.instances.get("azeroth-measure-dialog")?.close?.();
        await clearMeasuredAreas(scene);
        await chooseControl("tokens").catch(() => {});
      }
    });

    it("leaves an element nobody registered alone, still takes the board with a surface registered, and forgets a surface unregistered", async function () {
      this.timeout(30000);
      const makeSpell = async name => {
        const spell = await Item.create({ name, type: "spell", system: { target: "A 10 ft radius on the ground", school: "arcane", tier: 1 } });
        made.push(spell);
        return spell;
      };
      const first = await makeSpell("ZZ Stray Circle");
      const second = await makeSpell("ZZ Forgotten Circle");
      const stray = standIn();
      const view = standIn();
      const off = registerPickSurface(view, { pointAt: () => ({ x: 300, y: 300 }) });
      try {
        let settled = false;
        const told = whenTold(game.i18n.format("AZEROTH.Area.ClickToPlace", { name: first.name }));
        const placing = placeSpellArea({ spell: first }).then(region => { settled = true; return region; });
        await told;
        press(stray);
        await new Promise(r => setTimeout(r, 300));
        assert.isFalse(settled, "a press on an element nobody registered was taken as the pick");
        // The board is still the board.
        pressBoard({ x: 800, y: 800 });
        const region = await within(placing, 5000, "a press on the board placed nothing with a surface registered");
        assert.closeTo(region.shapes[0].x, 800, 0.5, "the board's press did not land where it was pressed");
        assert.closeTo(region.shapes[0].y, 800, 0.5, "the board's press did not land where it was pressed");

        // Unregistered, the view is nobody's.
        assert.isTrue(off(), "the unregister did not take the surface off");
        let gone = false;
        const toldAgain = whenTold(game.i18n.format("AZEROTH.Area.ClickToPlace", { name: second.name }));
        const forgotten = placeSpellArea({ spell: second }).then(r => { gone = true; return r; });
        await toldAgain;
        press(view);
        await new Promise(r => setTimeout(r, 300));
        assert.isFalse(gone, "a press on an unregistered surface was taken as the pick");
        escape();
        assert.isNull(await within(forgotten, 5000, "Escape did not cancel the pick"), "Escape placed a Region");
      } finally {
        off();
        stray.remove();
        view.remove();
        escape();
      }
    });
  });
}
