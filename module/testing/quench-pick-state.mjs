/**
 * A PICK ANNOUNCED AS IT BEGINS AND ENDS, AND CANCELLED FROM OUTSIDE (D-767; the
 * lead, 2026-09-30: *Right-click without drag*), inside a live world.
 *
 * A 3D view turns its camera on a right-drag, so it cannot take a right press
 * as a cancel the way the board does. It reads `azerothPickState` to know an aim
 * is open and calls `game.system.azeroth.canvas.cancelPick()` on a right-click
 * that did not drag. The tracker and the pick's own wiring have their Vitests
 * (`placement.test.mjs`, `canvas/place.test.mjs`); this is the real board:
 *
 * 1. a card's circle: its start announced with its hint and scene, its end
 *    `placed` on the press, once each, `pickState()` the same object until then,
 *    and the hint taken down;
 * 2. Escape and a right press on the board end a pick `cancelled`, once, and take
 *    the hint down;
 * 3. `cancelPick()` does exactly what Escape does - the same end, the hint down,
 *    nothing placed - and answers false when nothing waits;
 * 3a. a listener that cancels a pick as it hears it begin leaves every listener
 *    after it hearing the start before the end, with two real `Hooks.on`
 *    listeners (the final review of D-767);
 * 4. a card's cone from a token is ONE facing pick, a press on its own origin
 *    keeping it open; a line on the ground is a point pick and then a facing pick;
 *    an aimed cone cancelled from outside takes its aim down before its end;
 * 5. a pick replaced by another is announced ended before the new one begins, and
 *    a pick whose scene goes ends `failed`.
 */

import { cancelPick, pickState, placeSpellArea, AIM_PREVIEW } from "../canvas/place.mjs";
import { AIM_PREVIEW_HOOK, PICK_STATE_HOOK } from "../rules/placement.mjs";
import { cleanup, made, settle } from "./fixtures.mjs";

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

/** Press the 2D board at a canvas point with a button, as a browser does. */
function pressBoard(point, { button = 0 } = {}) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button, buttons: button === 2 ? 2 : 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Escape, with the guard against core's dismiss (which closes every window, Quench's too). */
function escape() {
  let leaked = false;
  const guard = event => {
    if (event.key !== "Escape") return;
    leaked = true;
    event.stopPropagation();
  };
  document.addEventListener("keydown", guard, true);
  try {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  } finally {
    document.removeEventListener("keydown", guard, true);
  }
  return leaked;
}

/** The 2D aim preview, while a facing is picked, or null. */
const boardPreview = () => canvas.controls?.children?.find(c => c.name === AIM_PREVIEW && !c.destroyed) ?? null;

/**
 * Everything announced while a test runs, in order - the pick's state and the
 * aim - and every hint the picks showed, as the notifications core made of them.
 */
function listen() {
  const told = [];
  const hints = [];
  const pickHook = Hooks.on(PICK_STATE_HOOK, state => told.push(["pick", state]));
  const aimHook = Hooks.on(AIM_PREVIEW_HOOK, data => told.push(["aim", data]));
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const info = ui.notifications.info;
  ui.notifications.info = (...args) => {
    const note = info.apply(ui.notifications, args);
    hints.push({ text: String(args[0]), note });
    return note;
  };
  return {
    told,
    hints,
    states: () => told.filter(([kind]) => kind === "pick").map(([, s]) => s),
    stop() {
      Hooks.off(PICK_STATE_HOOK, pickHook);
      Hooks.off(AIM_PREVIEW_HOOK, aimHook);
      if (own) ui.notifications.info = info;
      else delete ui.notifications.info;
    }
  };
}

/** Whether a hint the pick showed is still up. */
const hintUp = hint => Boolean(hint?.note) && ui.notifications.has(hint.note);

export function pickStateBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A pick announced as it begins and ends, and cancelled from outside (D-767)", function () {
    let scene = null;
    let wasViewing = null;

    before(async function () {
      this.timeout(60000);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Pick State", width: 3000, height: 2000, grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 30000);
      canvas.tokens.releaseAll();
    });

    after(async function () {
      this.timeout(120000);
      cancelPick();
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    /** A spell of the world's own with this Target line. */
    async function spellWith(name, target, school = "arcane") {
      const spell = await Item.create({ name, type: "spell", system: { target, school, tier: 1 } });
      made.push(spell);
      return spell;
    }

    /** A character with a linked token on the board at (600, 600), centred at (650, 650). */
    async function casterOnBoard(name) {
      const caster = await Actor.create({ name, type: "character", prototypeToken: { actorLink: true } });
      made.push(caster);
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [{ name, actorId: caster.id, actorLink: true, x: 600, y: 600, width: 1, height: 1 }]);
      await until(() => caster.getActiveTokens(false, false).length > 0, "the caster's token on the board");
      await settle();
      return { caster, tokenDoc };
    }

    it("announces a card's circle begun with its hint and placed, once each, mirrored by pickState(), with the hint taken down", async function () {
      this.timeout(30000);
      assert.strictEqual(game.system.azeroth.canvas.pickState, pickState, "pickState is not on the public surface");
      assert.strictEqual(game.system.azeroth.canvas.cancelPick, cancelPick, "cancelPick is not on the public surface");
      const spell = await spellWith("ZZ Announced Circle", "A 20 ft radius on the ground");
      const heard = listen();
      try {
        assert.isNull(pickState(), "a pick was waiting before the test began");
        const placing = placeSpellArea({ spell });
        const hint = game.i18n.format("AZEROTH.Area.ClickToPlace", { name: spell.name });
        assert.deepEqual(heard.states(), [{ active: true, mode: "point", hint, sceneId: scene.id }]);
        assert.isTrue(Object.isFrozen(heard.states()[0]), "a listener was handed the state itself");
        assert.strictEqual(pickState(), heard.states()[0], "pickState() is not what the start announced");
        assert.equal(heard.hints.length, 1);
        assert.isTrue(hintUp(heard.hints[0]), "the hint was not up while the pick waited");

        pressBoard({ x: 1500, y: 700 });
        const region = await within(placing, 5000, "the press placed nothing");
        assert.ok(region, "no Region was placed");
        assert.deepEqual(heard.states(), [heard.states()[0], { active: false, mode: "point", outcome: "placed", sceneId: scene.id }]);
        assert.isNull(pickState(), "pickState() outlived the pick");
        assert.isFalse(hintUp(heard.hints[0]), "the hint outlived the pick it asked for");
      } finally {
        heard.stop();
        cancelPick();
      }
    });

    it("announces Escape and a right press on the board as cancelled, once each, and takes the hint down", async function () {
      this.timeout(30000);
      const spell = await spellWith("ZZ Cancelled Circle", "A 10 ft radius on the ground");
      const before = scene.regions.size;
      const heard = listen();
      try {
        const escaped = placeSpellArea({ spell });
        await until(() => pickState()?.active, "the first pick");
        assert.isFalse(escape(), "the Escape went on past the pick to the page");
        assert.isNull(await within(escaped, 5000, "Escape ended nothing"), "Escape placed a Region");
        const refused = placeSpellArea({ spell });
        await until(() => pickState()?.active, "the second pick");
        pressBoard({ x: 1500, y: 700 }, { button: 2 });
        assert.isNull(await within(refused, 5000, "the right press ended nothing"), "a right press placed a Region");
        assert.deepEqual(heard.states().map(s => [s.active, s.mode, s.outcome ?? "begun"]), [
          [true, "point", "begun"], [false, "point", "cancelled"], [true, "point", "begun"], [false, "point", "cancelled"]
        ]);
        assert.isNull(pickState());
        assert.isTrue(heard.hints.every(h => !hintUp(h)), "a cancelled pick's hint stayed up");
        assert.equal(scene.regions.size, before, "a cancelled pick placed something");
      } finally {
        heard.stop();
        cancelPick();
      }
    });

    it("cancels through cancelPick() exactly as Escape does, and answers false when nothing waits", async function () {
      this.timeout(30000);
      const spell = await spellWith("ZZ Door-Cancelled Circle", "A 10 ft radius on the ground");
      const before = scene.regions.size;
      const heard = listen();
      try {
        assert.isFalse(cancelPick(), "cancelPick() said it cancelled a pick nobody began");
        assert.deepEqual(heard.states(), [], "cancelPick() with nothing waiting announced something");

        // Escape first, to have its effects to compare with.
        const escaped = placeSpellArea({ spell });
        await until(() => pickState()?.active, "the Escape pick");
        escape();
        await within(escaped, 5000, "Escape ended nothing");
        const byEscape = heard.states().at(-1);

        const waiting = placeSpellArea({ spell });
        await until(() => pickState()?.active, "the door's pick");
        assert.isTrue(cancelPick(), "cancelPick() did not cancel the pick waiting");
        // At once, as Escape's is: the same end, the hint down, the pick gone.
        assert.deepEqual(heard.states().at(-1), byEscape, "cancelPick() ended the pick differently from Escape");
        assert.isNull(pickState());
        assert.isFalse(hintUp(heard.hints.at(-1)), "cancelPick() left the hint up");
        assert.isNull(await within(waiting, 5000, "cancelPick() did not hand its caller anything"), "cancelPick() placed a Region");
        assert.isFalse(cancelPick(), "a second cancelPick() found a pick");
        assert.equal(heard.states().length, 4, "a pick was announced more than once each way");
        assert.equal(scene.regions.size, before, "a cancelled pick placed something");
        // And the board still picks afterwards.
        const next = placeSpellArea({ spell });
        await until(() => pickState()?.active, "a pick after the door");
        pressBoard({ x: 800, y: 800 });
        assert.ok(await within(next, 5000, "the board stopped picking after cancelPick()"), "the board placed nothing after cancelPick()");
      } finally {
        heard.stop();
        cancelPick();
      }
    });

    it("tells every listener a pick's start before its end when an earlier listener cancels it as it begins (the final review of D-767)", async function () {
      this.timeout(30000);
      const spell = await spellWith("ZZ Cancelled As It Began", "A 10 ft radius on the ground");
      const before = scene.regions.size;
      // TWO REAL LISTENERS, in the order core calls them: the first cancels the
      // pick the moment it hears it begin, as a view might; the second only
      // listens. The cancel used to be carried out inside the first listener's
      // call, so the second heard the end before it heard the start.
      const first = [];
      const second = [];
      let answered = null;
      let waitingAfterCancel = null;
      const heard = listen();
      const canceller = Hooks.on(PICK_STATE_HOOK, state => {
        first.push(state);
        if (state.active && answered === null) {
          answered = cancelPick();
          waitingAfterCancel = pickState();
        }
      });
      const listener = Hooks.on(PICK_STATE_HOOK, state => second.push({ state, waiting: pickState() }));
      try {
        const placing = placeSpellArea({ spell });
        assert.isNull(await within(placing, 5000, "the pick cancelled as it began never ended"), "a pick cancelled as it began placed a Region");
        assert.isTrue(answered, "cancelPick() inside the start found no pick to cancel");
        const shape = s => [s.active, s.mode, s.outcome ?? "begun"];
        const told = [[true, "point", "begun"], [false, "point", "cancelled"]];
        assert.deepEqual(first.map(shape), told, "the listener that cancelled heard it out of order");
        assert.deepEqual(second.map(({ state }) => shape(state)), told, "a listener after the one that cancelled heard the end before the start");
        assert.strictEqual(second[0].state, first[0], "the two listeners were handed different starts");
        // The pick is still the one waiting until every listener has heard it begin.
        assert.strictEqual(second[0].waiting, first[0], "pickState() was not the pick being announced while its start was told");
        assert.strictEqual(waitingAfterCancel, first[0], "the pick was stopped before every listener had heard it begin");
        assert.isNull(pickState(), "pickState() outlived the cancelled pick");
        assert.deepEqual(heard.hints, [], "a hint was shown for a pick already over");
        assert.equal(scene.regions.size, before, "a pick cancelled as it began placed something");
      } finally {
        Hooks.off(PICK_STATE_HOOK, canceller);
        Hooks.off(PICK_STATE_HOOK, listener);
        heard.stop();
        cancelPick();
      }
      // And the board still picks afterwards, with nobody cancelling.
      const next = placeSpellArea({ spell });
      try {
        await until(() => pickState()?.active, "a pick after the one cancelled as it began");
        pressBoard({ x: 900, y: 900 });
        assert.ok(await within(next, 5000, "the board stopped picking"), "the board placed nothing after a pick cancelled as it began");
      } finally {
        cancelPick();
      }
    });

    it("aims a card's cone as ONE facing pick, a ground line as a point pick then a facing pick, and cancels an aim with its outline down first", async function () {
      this.timeout(45000);
      const { caster, tokenDoc } = await casterOnBoard("ZZ Announced Caster");
      const cone = await spellWith("ZZ Announced Cone", "A 15 ft cone", "frost");
      const wall = await spellWith("ZZ Announced Wall", "A 20 ft line on the ground", "frost");
      const heard = listen();
      const warn = ui.notifications.warn;
      const warned = [];
      ui.notifications.warn = (...args) => { warned.push(String(args[0])); return null; };
      try {
        // THE CONE: from the token, so the facing is all it asks.
        const aiming = placeSpellArea({ spell: cone, actor: caster });
        const aim = game.i18n.format("AZEROTH.Area.ClickToAim", { name: cone.name });
        await until(() => pickState()?.mode === "facing", "the cone's aim");
        assert.deepEqual(heard.states(), [{ active: true, mode: "facing", hint: aim, sceneId: scene.id }]);
        // A press on the token's centre names no direction: refused, the same pick open.
        pressBoard({ x: 650, y: 650 });
        await until(() => warned.includes(game.i18n.format("AZEROTH.Area.AimSamePoint", { name: cone.name })), "the refusal in words");
        assert.equal(heard.states().length, 1, "a press refused on the origin ended the pick");
        assert.strictEqual(pickState(), heard.states()[0]);
        pressBoard({ x: 650, y: 950 });
        assert.ok(await within(aiming, 5000, "the cone was never placed"), "no cone was placed");
        assert.deepEqual(heard.states().at(-1), { active: false, mode: "facing", outcome: "placed", sceneId: scene.id });
        assert.equal(heard.states().length, 2);

        // THE LINE: where it starts, then which way.
        heard.told.length = 0;
        const walling = placeSpellArea({ spell: wall, actor: caster });
        await until(() => pickState()?.mode === "point", "the line's start");
        pressBoard({ x: 1000, y: 400 });
        await until(() => pickState()?.mode === "facing", "the line's aim");
        pressBoard({ x: 1000, y: 1000 });
        assert.ok(await within(walling, 5000, "the line was never placed"), "no line was placed");
        assert.deepEqual(heard.states().map(s => [s.active, s.mode, s.outcome ?? s.hint]), [
          [true, "point", game.i18n.format("AZEROTH.Area.ClickToStart", { name: wall.name })],
          [false, "point", "placed"],
          [true, "facing", game.i18n.format("AZEROTH.Area.ClickToAim", { name: wall.name })],
          [false, "facing", "placed"]
        ]);

        // AN AIM CANCELLED FROM OUTSIDE: its outline down, then its end.
        heard.told.length = 0;
        const dropped = placeSpellArea({ spell: cone, actor: caster });
        await until(() => pickState()?.mode === "facing" && boardPreview(), "the cone's aim, drawn");
        assert.isTrue(cancelPick());
        assert.isNull(await within(dropped, 5000, "cancelPick() did not end the aim"));
        assert.isNull(boardPreview(), "the 2D aim outlived cancelPick()");
        const aimDown = heard.told.findIndex(([kind, data]) => kind === "aim" && data === null);
        const ended = heard.told.findIndex(([kind, s]) => kind === "pick" && s?.active === false);
        assert.isAtLeast(aimDown, 0, "the aim's end was not announced");
        assert.isBelow(aimDown, ended, "the pick was announced over before its aim came down");
        assert.deepEqual(heard.told[ended][1], { active: false, mode: "facing", outcome: "cancelled", sceneId: scene.id });
      } finally {
        ui.notifications.warn = warn;
        heard.stop();
        cancelPick();
        await tokenDoc.delete().catch(() => {});
      }
    });

    it("ends a pick replaced by another before the new one begins, and fails a pick whose scene goes", async function () {
      this.timeout(60000);
      const first = await spellWith("ZZ Replaced Circle", "A 10 ft radius on the ground");
      const second = await spellWith("ZZ Replacing Circle", "A 10 ft radius on the ground");
      const heard = listen();
      const other = await Scene.create({ name: "ZZ Pick State Elsewhere", width: 1000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(other);
      try {
        const waiting = placeSpellArea({ spell: first });
        const replacing = placeSpellArea({ spell: second });
        assert.deepEqual(heard.states().map(s => [s.active, s.outcome ?? s.hint]), [
          [true, game.i18n.format("AZEROTH.Area.ClickToPlace", { name: first.name })],
          [false, "cancelled"],
          [true, game.i18n.format("AZEROTH.Area.ClickToPlace", { name: second.name })]
        ]);
        assert.isNull(await within(waiting, 5000, "the replaced pick never ended"), "the replaced pick placed something");
        pressBoard({ x: 1500, y: 1500 });
        assert.ok(await within(replacing, 5000, "the replacing pick placed nothing"));

        // The board goes under a pick: a scene change.
        heard.told.length = 0;
        const stranded = placeSpellArea({ spell: first });
        await until(() => pickState()?.active, "the pick before the scene change");
        await other.view();
        await until(() => canvas.ready && canvas.scene?.id === other.id, "the other scene to be viewed", 30000);
        assert.isNull(await within(stranded, 5000, "the scene change ended nothing"));
        assert.deepEqual(heard.states().at(-1), { active: false, mode: "point", outcome: "failed", sceneId: scene.id });
        assert.equal(heard.states().length, 2);
        assert.isNull(pickState());
      } finally {
        heard.stop();
        cancelPick();
        await scene.view();
        await until(() => canvas.ready && canvas.scene?.id === scene.id, "the batch's scene again", 30000);
      }
    });
  });
}
