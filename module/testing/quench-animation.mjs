/**
 * WHAT THE ANIMATION LAYER PLAYS, INSIDE A LIVE WORLD (D-727 to D-730).
 *
 * `rules/animation.mjs` and `rules/animation-table.mjs` are covered in Node by
 * `animation.test.mjs` and `animation-table.test.mjs`; what neither can reach
 * is the half this batch exists for:
 *
 *  - **a REAL card, Region, effect and Resist record**, written by the real
 *    doors (`attackWithDialog`, `castWithDialog`, `CARD_ACTIONS.placeArea`,
 *    `CARD_ACTIONS.applySpellEffect`, `CARD_ACTIONS.resistTest`), read by the
 *    real reader (`module/animation/records.mjs`) and planned by the real law
 *    on the real token ids. A unit test builds its own record and so can never
 *    see a recorder that moved (D-681, the commonest fault here);
 *  - **Sequencer itself**: a loop in the manager, ended by a deleted effect, a
 *    deleted token, a GM's Stop and a scene change, and every asset key the
 *    table ships resolving to an exact leaf of the live database;
 *  - **a feature's Use** (the Legacy branches' door 2): 02's Blink and Shadowstep
 *    pressed from the sheet's own Use, the pick answered on the board, and the
 *    `use` and `arrive` cues read back off the recorder at the points the card
 *    recorded - and a Use with no row saying `no-row`. Written in phase B4 and
 *    NOT run there (the phase was offline);
 *  - **the Legacy branches' rows** (phase B7): one case a branch, each pressed from
 *    the sheet's own control - Wind Walk, Thunder Clap and Bash, Shadow Trap and The
 *    Long Watch, The Bench, Black Arrow and Dark Minion, Big Bad Voodoo, Ethereal Form
 *    - and the B4 review's six: a floor's catch through its effect's update, one
 *    landing one cue, a `rise` on a token still drawing, a `missed` rider, a GM-hidden
 *    Region, and The Long Watch on a screen that does not own the warden. Written in
 *    phase B7 and NOT run there either.
 *
 * ## How it drives
 *
 * `module/testing/animation-recorder.mjs` REPLACES the player (D-729), so the
 * first half asserts the steps the layer would have played without drawing
 * anything: no canvas to fight, no teardown races, nothing left standing in
 * the lead's world. The second half puts the real player back
 * (`director.resetPlayer()`) and reads `Sequencer.EffectManager` directly.
 *
 * ## Four things that will bite whoever edits this
 *
 * 1. **`smoke.spec.mjs` swaps the PLAYER for a recorder before the run** -
 *    Sequencer 4.2.3 throws when an effect is destroyed mid-initialisation and
 *    the batches switch scenes constantly, so the one module that touches
 *    Sequencer is stood down while everything of ours keeps running. The three
 *    client switches are left ON. This batch installs a recorder of its own
 *    and hands back whatever it found, and it is the one batch that puts the
 *    REAL player back (`resetPlayer`) for its live half.
 * 2. **`playCueFor` returns BEFORE `noteSkip` when `animationAvailability()`
 *    is false.** A screen where nothing may play records no skip either, so
 *    never assert a skip word without the availability gate open - `before`
 *    asserts it once, by name, rather than letting every test fail obscurely.
 * 3. **Nothing plays before `sequencerEffectManagerReady`**, which is false
 *    again after every `canvasTearDown`. A test that views a scene waits for
 *    availability before expecting a cue (`untilAvailable`).
 * 4. **Never tear down or switch a scene with an effect in flight.** End the
 *    loops and poll the manager until they are gone first. The vendor fault is
 *    a page error and the smoke spec rightly fails the whole run on one.
 *
 * **`jaamod` IS NOT DEPENDED ON.** Jinker's pack ships exactly one step in the
 * table (the saw blade) and the library gate is exercised in BOTH directions
 * by handing `plan` the library list, over a record a real creature really
 * made - so this batch passes whether the lead has the module on or off.
 */

import { cleanup, dialogFor, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenDrawn, untilHook, warnings, tokenData } from "./fixtures.mjs";
// The Legacy branches' rows (phase B7): what their doors lay, by the constants the doors write.
import { boundOf } from "../documents/bound.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
import { TRAP_FLAG } from "../rules/traps.mjs";
import { WATCH_FLAG } from "../rules/marks.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { NO_HEALING_FLAG } from "../rules/no-healing.mjs";
// The pick a step opens on the board (the Legacy branches' doors 2 and 3).
import { cancelPick, pickState } from "../canvas/place.mjs";
import { checkText } from "./geometry.mjs";
import { attackWithDialog, castWithDialog, npcAttackWithDialog, reactionRows } from "../applications/actions.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
// A Region laid off a failed card's own record, by a hand other than the card's door.
import { placeArea } from "../canvas/regions.mjs";
import { endSustain, rollTest } from "../dice/workflows.mjs";
import {
  ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING,
  ROLL_DIALOG_SETTING, animationHidden, animationStops, setAnimationHidden, setAnimationStops
} from "../settings.mjs";
import { animationAvailability, librariesOn, moduleOn, soundsOn } from "../animation/availability.mjs";
// `plan` is a name three `module/rules/` modules export (the loot generator's
// and the Forge's are the other two), so it is aliased at every import.
import { animationRows, plan as planCue, visibleLoops, withKey } from "../rules/animation.mjs";
// The director's own privacy set and the reader that fills it (integration
// rule 6): a private cast's loop plays nowhere and is listed nowhere.
import { notePrivacy, privateCasts } from "../animation/records.mjs";
import { allAssetKeys, libraryOf } from "../rules/animation-table.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** The layer's own surface, as a macro reaches it. */
const api = () => game.system.azeroth.animations;

/** The loop layers one key has in Sequencer's manager, on this screen. */
function playing(key) {
  return globalThis.Sequencer?.EffectManager?.getEffects?.({ name: `${key}|*` }) ?? [];
}

/**
 * THE LAW'S OWN LAST REFUSAL, past the availability gate's.
 *
 * `animationAvailability`'s refusal goes through `noteSkip` as
 * `unavailable:<reason>` - it is not one of `SKIPS`, and it is the answer a
 * screen gives before the canvas has settled or with a switch off. A test that
 * compared `lastSkip()` to a law word would report *expected "failed-cast",
 * got "unavailable:unsettled"*, which names the symptom and not the cause. This
 * takes the last LAW word and says plainly when there is not one.
 */
function lawSkip(recorder) {
  const words = recorder.skips.map(s => s.skip).filter(w => !String(w).startsWith("unavailable:"));
  if (words.length) return words.at(-1);
  const seen = recorder.skips.map(s => s.skip).join(", ");
  return seen ? `nothing the law refused; the screen did: ${seen}` : null;
}

/** Every effect this system owns that is in the manager right now. */
function ours() {
  return globalThis.Sequencer?.EffectManager?.getEffects?.({ name: "azeroth-rpg:*" }) ?? [];
}

/**
 * **BEING IN THE MANAGER IS NOT BEING DRAWN**, and ending one that is not yet
 * drawn is the vendor fault D-729 records.
 *
 * `EffectManager._playEffect` puts the effect in the manager and THEN awaits
 * `CanvasEffect#_initialize`, which sets `ready = false` on its first line and
 * `ready = true` on its last (sequencer.js 4.2.3 L15618-15640). In between,
 * `_createSprite` sets `this.sprite.volume` after an `await sprite.activate()`
 * — so anything that destroys the effect inside that window leaves Sequencer
 * setting a property on null, which is an unhandled `TypeError` and a PAGE
 * ERROR the smoke spec rightly fails the whole run on.
 *
 * A first play of a cold asset takes hundreds of milliseconds to get there, so
 * a test that polls `getEffects` and ends the loop the moment it appears hits
 * it every time. **Wait for `ready`, never for presence alone.**
 */
async function drawn(key, count, ms = 30000) {
  await until(() => {
    const list = playing(key);
    return list.length === count && list.every(e => e.ready === true);
  }, `${count} layer(s) of ${key} drawn and past initialisation`, ms);
}

/** Everything this system is playing, past initialisation. Best effort. */
async function allDrawn(ms = 20000) {
  await until(() => ours().every(e => e.ready === true), "every effect to finish initialising", ms)
    .catch(() => {});
}

/**
 * A card's rendered markup as a detached element.
 *
 * Every card control reads its own `dataset` and the message, so a detached
 * box drives `CARD_ACTIONS` exactly as the log does - and it costs no wait on
 * the chat log's own render schedule.
 */
function cardBox(message) {
  const box = document.createElement("div");
  box.innerHTML = message.content;
  return box;
}

/**
 * Run `fn` with this user reading the world as a PLAYER.
 *
 * Only a second client could be a player for real; the role is stubbed on the
 * one user there is - `quench-phase12.mjs`'s own shape - for calls that are
 * SYNCHRONOUS (`factsFor`, `stateSnapshot`, `plan`, `loopsFor`), so no awaited
 * write and no other module's listener ever sees the stub.
 *
 * It is the only way to reach the two gates that hide a GM's hidden creature:
 * a GM sees a hidden token (`token.visible` is true, drawn faded), so
 * `visible` is `token.visible && !(doc.hidden && !isGM)` and the second half is
 * what a player is refused by.
 */
function asPlayer(fn) {
  Object.defineProperty(game.user, "isGM", { value: false, configurable: true });
  try {
    return fn();
  } finally {
    delete game.user.isGM;
  }
}

export function animationBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Animations: what plays, and what never does (D-727 to D-730)", function () {
    /** What was held before this batch touched it, restored in `after`. */
    const held = {};
    let previousPlayer = null;
    let recorder = null;
    let scene = null;
    let elsewhere = null;
    let wasViewing = null;

    /** The board. */
    let caster = null;       // a Mage, with everything this batch casts
    let swordsman = null;    // a Warrior 1: swings, misses and Parries
    let ally = null;         // a second recipient for a buff
    let alpha = null;        // three creatures, so a chain has an order
    let beta = null;
    let gamma = null;
    let ghost = null;        // a creature the GM has hidden
    let shredder = null;     // the one pack row whose strike is Jinker's
    const token = {};        // every token document, by fixture name

    /** Put a scene on the board and wait until something may play on it. */
    async function view(target) {
      await target.view();
      await until(() => canvas.ready && canvas.scene?.id === target.id, `${target.name} on the board`, 30000);
      await untilAvailable();
    }

    /** Wait for the settle gate, and say WHICH reason stood if it never opens. */
    async function untilAvailable(ms = 20000) {
      const start = Date.now();
      for (;;) {
        const state = animationAvailability();
        if (state.ok) return state;
        if (Date.now() - start > ms) throw new Error(`nothing may play here: ${state.reason}`);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    /** A token for an actor on the batch's scene, drawn and ready to be aimed at. */
    async function place(actor, { x, y, side = "hostile", hidden = false }) {
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await tokenData(actor, {
        x, y, hidden,
        disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
      }));
      const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
      // Drawn, not merely made: `center` is there before the texture load, and a token
      // targeted before its arrows exist throws in core's ticker (`fixtures.mjs#tokenDrawn`).
      await until(() => tokenDrawn(canvas.tokens.get(doc.id)), `${actor.name}'s token drawn`, 20000);
      return doc;
    }

    /** The caster's Mana, filled: `castSpell` refuses a pool below the cost. */
    async function fillMana() {
      const pool = caster.system.powers.find(p => p.name === "mana");
      if (!pool || pool.value === pool.max) return;
      await caster.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      await until(() => caster.system.powers.find(p => p.name === "mana").value === pool.max, "the Mana filled");
    }

    /** Cast a spell at a list of token documents, with the die pinned. */
    async function cast(name, face, targets = []) {
      const spell = caster.items.find(i => i.name === name);
      if (!spell) throw new Error(`the caster does not hold ${name}`);
      canvas.tokens.setTargets(targets.map(t => t.id));
      await fillMana();
      recorder.reset();
      const unpin = pinDie(face);
      let card = null;
      try {
        card = await castWithDialog(caster, spell);
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
      }
      if (!card) throw new Error(`${name} posted no card`);
      made.push(card);
      return card;
    }

    /** Every asset a cue played, in order. */
    const assetsOf = steps => steps.map(s => s.asset);

    before(async function () {
      this.timeout(600000);

      // 1. The switches, ON for this batch whatever the world holds - a run
      //    started from a world where the lead had turned animations off would
      //    otherwise report every assertion here as "no cue". Photosensitive
      //    mode is core's and refuses every effect outright. Both are
      //    snapshotted and put back exactly as they were found.
      for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
        held[key] = game.settings.get("azeroth-rpg", key);
        await game.settings.set("azeroth-rpg", key, true);
      }
      held.photosensitive = game.settings.get("core", "photosensitiveMode");
      if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", false);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      held.dialog = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      // BOTH MAPS ARE SNAPSHOTTED. `animationHidden` is the lead's OWN client
      // setting - the loops they have taken off their screen - and writing `{}`
      // over it without keeping a copy would throw that away on every run.
      held.stops = animationStops();
      held.hidden = animationHidden();
      await setAnimationStops({});
      await setAnimationHidden({});

      // 2. The player that draws nothing. `setPlayer` hands back whatever was
      //    installed - the smoke spec's own recorder, or the real player at a
      //    table - and `after` puts exactly that back.
      recorder = new (api().Recorder)();
      previousPlayer = api().director.setPlayer(recorder);

      // 3. The board.
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({
        name: "ZZ Animation Scene", width: 3000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      made.push(scene);
      elsewhere = await Scene.create({
        name: "ZZ Animation Other Scene", width: 1000, height: 1000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      made.push(elsewhere);
      await view(scene);

      // **THE GATE, ONCE AND BY NAME.** `playCueFor` returns before it records
      // a skip when nothing may play, so without this every assertion below
      // would fail as "no cue" whatever the real reason was.
      assert.isTrue(animationAvailability().ok, `nothing may play here: ${animationAvailability().reason}`);
      assert.isTrue(moduleOn("sequencer"), "Sequencer is not running; this batch is the animation layer's");
      assert.isTrue(moduleOn("JB2A_DnD5e"), "JB2A_DnD5e is not running; every shipped picture is its");
      assert.isTrue(soundsOn(), "sounds are off (psfx, the system switch or Sequencer's own), and this batch asserts on them");

      caster = await makeCharacter({
        name: "ZZ Anim Caster", classes: [["Mage", 5]],
        spells: [
          "Fireball", "Flamestrike", "Frost Nova", "Chain Lightning", "Arcane Missiles",
          "Arcane Intellect", "Hex", "Immolate", "Lightning Shield"
        ]
      });
      // A Warrior 1: Rage to pay for a Parry, and no Extra Attack (level 5),
      // so one swing posts exactly one card.
      swordsman = await makeCharacter({ name: "ZZ Anim Swordsman", classes: [["Warrior", 1]], weapons: ["Longsword"] });
      ally = await makeCharacter({ name: "ZZ Anim Ally" });
      alpha = await makeNpc("Plagued Ghoul");
      beta = await makeNpc("Plagued Ghoul");
      gamma = await makeNpc("Plagued Ghoul");
      ghost = await makeNpc("Plagued Ghoul");
      shredder = await makeNpc("Venture Co. Shredder");
      await beta.update({ name: "ZZ Anim Beta" });
      await gamma.update({ name: "ZZ Anim Gamma" });
      await ghost.update({ name: "ZZ Anim Ghost" });

      token.caster = await place(caster, { x: 500, y: 500, side: "friendly" });
      token.swordsman = await place(swordsman, { x: 700, y: 500, side: "friendly" });
      token.ally = await place(ally, { x: 500, y: 900, side: "friendly" });
      token.alpha = await place(alpha, { x: 1500, y: 500 });
      token.beta = await place(beta, { x: 1500, y: 900 });
      token.gamma = await place(gamma, { x: 1500, y: 1300 });
      token.ghost = await place(ghost, { x: 900, y: 900, hidden: true });
      token.shredder = await place(shredder, { x: 700, y: 1300 });
      canvas.tokens.releaseAll();
      await settle();
    });

    /**
     * **EVERY RESTORE ON ITS OWN.** A teardown is a list of unrelated
     * obligations and one of them throwing must not cost the rest: written as
     * a straight run, a throw at the roll-dialog setting left photosensitive
     * mode OFF, the three switches ON and `cleanup()` unreached, so every ZZ
     * scene, actor and card in this batch survived into the next run - which
     * is the shape `smoke.spec.mjs`' own sweep exists to clear up after.
     */
    async function restore(what, fn) {
      try {
        await fn();
      } catch (err) {
        console.warn(`azeroth-rpg | animation batch teardown (${what}): ${err?.message ?? err}`);
      }
    }

    after(async function () {
      this.timeout(600000);
      try {
        // NOTHING IS LEFT STANDING ON THE BOARD. Every live test ends its own
        // loops, but an aborted one does not, and a scene deleted under a live
        // effect is the vendor fault in D-729 (a page error, which fails the
        // whole smoke run).
        await restore("the manager", async () => {
          await new Promise(r => setTimeout(r, 250));
          await allDrawn();
          globalThis.Sequencer?.EffectManager?.endEffects?.({ name: "azeroth-rpg:*" }, false);
          await until(() => ours().length === 0, "the manager to empty", 8000);
        });
        await restore("the Sustain", async () => { if (caster) await caster.unsetFlag("azeroth-rpg", "sustaining"); });
        await restore("the player", () => { if (previousPlayer) api().director.setPlayer(previousPlayer); });
        await restore("the selection", () => {
          canvas?.tokens?.setTargets?.([]);
          canvas?.tokens?.releaseAll?.();
        });
        await restore("the stops", () => setAnimationStops(held.stops ?? {}));
        await restore("the hides", () => setAnimationHidden(held.hidden ?? {}));
        await restore("the roll dialog", () => game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, held.dialog));
        await restore("photosensitive mode", async () => {
          if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", true);
        });
        await restore("the switches", async () => {
          for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
            await game.settings.set("azeroth-rpg", key, held[key]);
          }
        });
        // Step off a ZZ scene before it is deleted: deleting the VIEWED scene
        // tears the canvas down and leaves the world with none.
        await restore("the scene", async () => {
          if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) {
            await wasViewing.view();
          }
        });
      } finally {
        await cleanup();
      }
    });

    /* ------------------------------------------------------------------ */
    /*  What one completed action plays                                    */
    /* ------------------------------------------------------------------ */

    describe("One completed action, through the real doors", function () {
      it("a hit records the swing, the impact and both sounds, on the exact attacker and target tokens", async function () {
        this.timeout(120000);
        const sword = swordsman.items.find(i => i.name === "Longsword");
        canvas.tokens.setTargets([token.alpha.id]);
        recorder.reset();
        const unpin = pinDie(18);
        let card = null;
        try {
          card = await attackWithDialog(swordsman, sword);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        assert.ok(card, "the swing posted no card");
        made.push(card);
        assert.isTrue(card.rolls[0].outcome.success, "a natural 18 did not land; the board moved");

        await until(() => recorder.cues.length === 1, `one cue for the swing (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.lastSteps();
        assert.deepEqual(assetsOf(steps), [
          "jb2a.sword.melee.01.white",
          "psfx.weapon-swooshes.light.v1.group01",
          "jb2a.impact.001.blue",
          "psfx.impacts.slashing.v1"
        ], "a hit did not play the swing, its swoosh, the impact and its thud");

        const [swing, swoosh, impact, thud] = steps;
        assert.equal(swing.library, "JB2A_DnD5e");
        assert.equal(swing.fromToken, token.swordsman.id, "the swing does not start at the swinger's own token");
        assert.equal(swing.toToken, token.alpha.id, "the swing does not reach the token that was aimed at");
        assert.equal(swing.travel, "stretch");
        assert.notProperty(swing, "missed", "a hit was marked as a miss");
        assert.equal(swoosh.kind, "sound");
        assert.equal(swoosh.library, "psfx");
        assert.equal(impact.on, token.alpha.id, "the impact did not land on the target's token");
        // **THE IMPACT LANDS AFTER THE SWING, and how long after is the
        // TABLE's.** Pinning the exact 380 here would make the next
        // frame-driven tune of a starting value fail an integration test a
        // long way from the thing that moved; `animation-table.test.mjs` is
        // where a number is held. What this batch owns is the ordering.
        assert.isAbove(impact.delay, 0, "the impact lands on the same frame as the swing");
        assert.isAbove(impact.delay, swing.delay ?? 0, "the impact does not wait for the swing");
        assert.equal(thud.kind, "sound");
        assert.equal(thud.on, token.alpha.id, "the thud was not heard where the blow landed");
        // The distance is the action's and it is in FEET, measured between the
        // two token centres - it is what a bucketed file is chosen by.
        const from = canvas.tokens.get(token.swordsman.id).center;
        const to = canvas.tokens.get(token.alpha.id).center;
        assert.closeTo(swing.feet, Math.hypot(to.x - from.x, to.y - from.y) / 20, 0.01,
          "the swing did not measure the distance it travelled in feet between the token centres");
        assert.isAbove(swing.feet, 30, "the swing measured pixels, or measured nothing");
      });

      it("a miss records a missed swing and has no impact step at all", async function () {
        this.timeout(120000);
        const sword = swordsman.items.find(i => i.name === "Longsword");
        canvas.tokens.setTargets([token.alpha.id]);
        recorder.reset();
        const unpin = pinDie(1);
        let card = null;
        try {
          card = await attackWithDialog(swordsman, sword);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        assert.ok(card, "the swing posted no card");
        made.push(card);
        assert.isFalse(card.rolls[0].outcome.success, "a natural 1 landed; the board moved");

        await until(() => recorder.cues.length === 1, "one cue for the miss");
        const steps = recorder.lastSteps();
        assert.deepEqual(assetsOf(steps), [
          "jb2a.sword.melee.01.white",
          "psfx.weapon-swooshes.light.v1.group01"
        ], "a miss played something other than the swing and its swoosh");
        assert.isTrue(steps[0].missed, "the swing does not say it missed");
        assert.notInclude(assetsOf(steps), "jb2a.impact.001.blue", "a miss drew the impact of a hit");
        assert.notInclude(assetsOf(steps), "psfx.impacts.slashing.v1", "a miss was heard to land");
      });

      it("a Dagger at 5 ft cues the swing in the hand, never the thrown dagger (D-731)", async function () {
        this.timeout(120000);
        // The law keys on the recorded FORM, so nothing in the animation table
        // moved: what moved is the door, which no longer throws a Dagger that is
        // stabbed at arm's reach. Placed well away from the rest of the board,
        // so the only creature inside the stabber's reach is the one struck.
        const stabber = await makeCharacter({ name: "ZZ Anim Stabber", classes: [["Rogue", 1]], weapons: ["Dagger"] });
        const dagger = stabber.items.find(i => i.name === "Dagger");
        await dagger.update({ "system.equipped": true });
        await until(() => stabber.items.get(dagger.id)?.system?.equipped === true, "the dagger drawn");
        const adjacent = await makeNpc("Plagued Ghoul");
        await adjacent.update({ name: "ZZ Anim Adjacent" });
        const mine = await place(stabber, { x: 2200, y: 500, side: "friendly" });
        const theirs = await place(adjacent, { x: 2300, y: 500 });
        try {
          canvas.tokens.setTargets([theirs.id]);
          recorder.reset();
          const unpin = pinDie(18);
          let card = null;
          try {
            card = await attackWithDialog(stabber, dagger);
          } finally {
            unpin();
            canvas.tokens.setTargets([]);
          }
          assert.ok(card, "the stab posted no card");
          made.push(card);
          assert.deepInclude(card.flags["azeroth-rpg"].strike, { form: "dagger", rangeKind: "melee" },
            "a Dagger at arm's reach was recorded as a throw");
          await until(() => recorder.cues.length === 1, `one cue for the stab (skips: ${recorder.skips.map(s => s.skip)})`);
          const steps = recorder.lastSteps();
          assert.include(assetsOf(steps), "jb2a.dagger.melee.02.white", "the stab did not play the dagger's swing");
          assert.notInclude(assetsOf(steps), "jb2a.dagger.throw.01.white", "the stab played a thrown dagger");
          assert.equal(steps[0].fromToken, mine.id, "the swing does not start at the stabber's token");
          assert.equal(steps[0].toToken, theirs.id, "the swing does not reach the creature struck");
        } finally {
          await mine.delete().catch(() => {});
          await theirs.delete().catch(() => {});
        }
      });

      it("a Parry records nothing, because a Parry Test is not an attack", async function () {
        this.timeout(180000);
        // *A class that builds Momentum, and 1 Momentum* (06 §6, D-720).
        const sword = swordsman.items.find(i => i.name === "Longsword");
        await sword.update({ "system.equipped": true });
        await until(() => swordsman.items.get(sword.id)?.system?.equipped === true, "the sword drawn");
        const rage = swordsman.poolSnapshot().find(p => p.name === "rage");
        assert.ok(rage, "a Warrior holds no Rage pool");
        await swordsman.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 6 });
        await until(() => (swordsman.poolSnapshot().find(p => p.name === "rage")?.value ?? 0) === 6, "the Rage to pay for the Parry");

        const s = swordsman.system;
        const target = {
          tokenId: token.swordsman.id, sceneId: scene.id, actorId: swordsman.id, name: swordsman.name,
          defense: s.defense ?? 10,
          apByLocation: { body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 },
          absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], conditions: {},
          size: null, swarm: false, creatureType: null, acted: null
        };
        const weak = pinDie(5);
        let blow = null;
        try {
          blow = await rollTest({
            actor: caster, kind: "attack", dc: 5, title: "ZZ Anim blow",
            targets: [target], reactions: reactionRows([target]),
            modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
            damage: { rating: 8, kind: "physical" }
          });
        } finally {
          weak();
        }
        assert.ok(blow, "the incoming blow posted no card");
        made.push(blow);

        recorder.reset();
        const strong = pinDie(20);
        let parried = null;
        try {
          parried = await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, blow);
        } finally {
          strong();
        }
        assert.ok(parried, "the Parry posted no card");
        made.push(parried);
        assert.isTrue(parried.flags["azeroth-rpg"].parry, "the Parry card does not say it is one");
        await until(() => recorder.skips.length >= 1, "the law's refusal of the Parry");
        assert.equal(lawSkip(recorder), "parry", "a Parry Test was planned as an attack");
        assert.lengthOf(recorder.cues, 0, "a Parry Test drew something");
      });

      it("a failed Fireball records failed-cast; a failed card places no area, and a Region laid off its record anyway records failed-cast", async function () {
        this.timeout(180000);
        const failed = await cast("Fireball", 1, [token.alpha]);
        assert.isFalse(failed.flags["azeroth-rpg"].success, "a natural 1 did not record a failed Casting Test");
        await until(() => recorder.skips.length >= 1, "the law's refusal of the failed cast");
        assert.equal(lawSkip(recorder), "failed-cast", "a failed Casting Test animated");
        assert.lengthOf(recorder.cues, 0, "a failed Fireball drew something");

        // 07 §8 charges the Mana and nothing else, and THE CARD'S DOOR PLACES
        // NOTHING (the lead, 2026-09-26: *Refuse Place area on any failed
        // cast*), an Instant as readily as a Sustain - refused in words.
        const failedArea = await cast("Flamestrike", 1, []);
        assert.isFalse(failedArea.flags["azeroth-rpg"].success);
        const before = scene.regions.size;
        const said = await warnings(async () => {
          const refused = await CARD_ACTIONS.placeArea({ dataset: {} }, failedArea);
          assert.isNull(refused, "Place area placed something from a failed card");
        });
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Area.FailedCast", { name: "Flamestrike" }));
        assert.equal(scene.regions.size, before, "a failed Flamestrike placed an outline");

        // THE LAW STILL COVERS THE REGION TRIGGER: an area laid off the failed
        // card's record by any other hand never draws.
        const spell = caster.items.find(i => i.name === "Flamestrike");
        recorder.reset();
        const region = await placeArea({ item: spell, scene, origin: { x: 2400, y: 1600 }, flags: regionFlagsFromCard(failedArea, caster, spell) });
        assert.ok(region, "no Region was laid off the failed card's record");
        await until(() => recorder.skips.length >= 1, "the law's refusal of the failed card's area");
        assert.equal(lawSkip(recorder), "failed-cast", "an area laid off a failed cast animated");
        assert.lengthOf(recorder.cues, 0);
        await region.delete();
      });

      it("a Region placed from a successful Flamestrike cues at the shape's own centre, sized from its radius", async function () {
        this.timeout(180000);
        const card = await cast("Flamestrike", 18, []);
        assert.isTrue(card.flags["azeroth-rpg"].success, "a natural 18 did not land the Casting Test");
        assert.equal(card.flags["azeroth-rpg"].area?.shape, "circle");
        assert.equal(card.flags["azeroth-rpg"].area?.distanceFt, 20, "08's own radius moved");

        recorder.reset();
        const placing = CARD_ACTIONS.placeArea({ dataset: {} }, card);
        // Inside Flamestrike's 60 feet of the caster at (500, 500): Place area refuses a point past
        // the Range and the pick waits on (O-288, D-893), so (2000, 1200), 75 feet off, never placed.
        pressBoard({ x: 1200, y: 900 });
        const region = await placing;
        assert.ok(region, "Place area placed nothing");
        try {
          await until(() => recorder.cues.length === 1, `one cue for the placed area (skips: ${recorder.skips.map(s => s.skip)})`);
          const steps = recorder.lastSteps();
          assert.deepEqual(assetsOf(steps), [
            "jb2a.sacred_flame.target.yellow",
            "jb2a.impact.ground_crack.orange.02",
            "psfx.3rd-level-spells.fireball.v1.001.explosion"
          ], "the column, the scorched ground and the bang did not all play");
          // AT THE AREA'S OWN CENTRE, never on the caster, and sized from the
          // Region: a 20 ft radius on a 100px/5ft grid is 400px, so the column
          // at 0.7 of the diameter is 560px across.
          assert.closeTo(steps[0].at.x, 1200, 1, "the column was not drawn where the area was placed");
          assert.closeTo(steps[0].at.y, 900, 1);
          assert.closeTo(steps[0].size, 560, 1, "the column was not sized from the area's own radius");
          assert.closeTo(steps[1].size, 800, 1, "the scorched ground is not the area's whole diameter");
          assert.isTrue(steps[1].below, "the scorched ground was drawn over the tokens");
          assert.notEqual(steps[0].at.x, canvas.tokens.get(token.caster.id).center.x,
            "the area was cued on the caster");
        } finally {
          await region.delete();
        }
      });

      it("Frost Nova cues at cast on the caster's own token, sized from the Target line's radius", async function () {
        this.timeout(120000);
        const card = await cast("Frost Nova", 18, []);
        assert.isTrue(card.flags["azeroth-rpg"].success);
        await until(() => recorder.cues.length === 1, `one cue for Frost Nova (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.lastSteps();
        assert.deepEqual(assetsOf(steps), [
          "jb2a.impact.ground_crack.frost.01.white",
          "psfx.impacts.magicaleffects.cold"
        ]);
        assert.equal(steps[0].on, token.caster.id, "a self-centred area was not cued on the caster");
        // *A 10 ft radius centered on you*: 20 feet across, 400px on this grid.
        assert.closeTo(steps[0].size, 400, 1, "the nova was not sized from its own Target line");
        assert.isTrue(steps[0].below, "the ice was drawn over the tokens");
        // AND IT NEVER WAITED FOR Place area: this cast placed no Region, and
        // the cue fired on the card alone.
        const placed = [...scene.regions].filter(r => r.getFlag("azeroth-rpg", "cast") === card.flags["azeroth-rpg"].cast);
        assert.lengthOf(placed, 0, "a self-centred area waited for a Region");
      });

      /**
       * **07's 15 FEET BETWEEN CREATURES** (the Chronomancer live fix, which found both tests
       * stale against 0.12.32's enforcement): Chain Lightning arcs *to a creature within 15 feet*
       * and the active GM chooses the path from the ONE target the caster names
       * (`effects/chain-lightning-path.mjs`: two or more targets are refused before payment),
       * and Arcane Missiles' second creature must be *within 15 feet of the first*. The ghouls
       * stand 20 feet apart for every other test here, so these two move Alpha and Gamma into a
       * column 15 feet apart - Gamma, Alpha, Beta from the top - and put them back after.
       */
      /** Move Alpha to `to` and answer the function that puts it back where it was. */
      async function nearerAlpha(to) {
        const was = { x: token.alpha.x, y: token.alpha.y };
        const put = async ({ x, y }) => {
          await token.alpha.move({ x, y, action: "displace" });
          await until(() => token.alpha.x === x && token.alpha.y === y, `Alpha at ${x},${y}`, 20000);
        };
        await put(to);
        await settle();
        return () => put(was);
      }

      // Put Alpha back after the test that moved it, however that test ended.
      let alphaBack = null;
      context.afterEach?.(async function () {
        const back = alphaBack;
        alphaBack = null;
        if (typeof back === "function") await back();
      });

      async function inColumn(fn) {
        const at = doc => ({ x: doc.x, y: doc.y });
        const was = { alpha: at(token.alpha), gamma: at(token.gamma) };
        const put = async (doc, { x, y }) => {
          await doc.move({ x, y, action: "displace" });
          await until(() => doc.x === x && doc.y === y, `${doc.name} at ${x},${y}`, 20000);
        };
        try {
          await put(token.alpha, { x: 1500, y: 600 });
          await put(token.gamma, { x: 1500, y: 300 });
          await settle();
          return await fn();
        } finally {
          await put(token.alpha, was.alpha);
          await put(token.gamma, was.gamma);
        }
      }

      it("Chain Lightning arcs in the order the card recorded, never three bolts from the caster", async function () {
        this.timeout(120000);
        // Beta named alone: the GM's path runs Beta, then Alpha 15 feet from it, then Gamma 15
        // feet from Alpha - not the order a reader taking the caster's nearest creature would
        // draw, since Gamma is the nearest of the three to nobody but Alpha.
        const card = await inColumn(() => cast("Chain Lightning", 18, [token.beta]));
        assert.deepEqual((card.flags["azeroth-rpg"].targets ?? []).map(t => t.tokenId),
          [token.beta.id, token.alpha.id, token.gamma.id], "the card did not record the order they were aimed at");

        await until(() => recorder.cues.length === 1, `one cue for Chain Lightning (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.lastSteps();
        const arcs = steps.filter(s => s.asset?.startsWith("jb2a.chain_lightning."));
        assert.lengthOf(arcs, 3, "the bolt did not make three legs");
        assert.deepEqual(arcs.map(a => [a.fromToken, a.toToken]), [
          [token.caster.id, token.beta.id],
          [token.beta.id, token.alpha.id],
          [token.alpha.id, token.gamma.id]
        ], "the arcs did not follow the recorded order, target to target");
        assert.equal(arcs[0].asset, "jb2a.chain_lightning.primary.blue", "the first leg is not the primary bolt");
        assert.equal(arcs[1].asset, "jb2a.chain_lightning.secondary.blue");
        assert.deepEqual(arcs.map(a => a.delay), [0, 350, 700], "the legs did not stagger");
        // One static crackle on each creature, and one bang for the lot.
        assert.lengthOf(steps.filter(s => s.asset === "jb2a.static_electricity.01.blue"), 3);
        assert.lengthOf(steps.filter(s => s.kind === "sound"), 2, "a sound was copied per picture");
      });

      it("Arcane Missiles records exactly three darts to the first target, and one launch sound", async function () {
        this.timeout(120000);
        const card = await inColumn(() => cast("Arcane Missiles", 18, [token.alpha, token.beta]));
        assert.isTrue(card.flags["azeroth-rpg"].success);
        await until(() => recorder.cues.length === 1, `one cue for Arcane Missiles (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.lastSteps();
        const darts = steps.filter(s => s.asset === "jb2a.magic_missile.purple");
        assert.lengthOf(darts, 3, "the three darts are not three");
        for (const dart of darts) {
          assert.equal(dart.fromToken, token.caster.id);
          assert.equal(dart.toToken, token.alpha.id, "a dart went at the second target; the fourth is conditional and unrecorded");
        }
        assert.deepEqual(darts.map(d => d.delay), [0, 180, 360]);
        assert.lengthOf(steps.filter(s => s.kind === "sound"), 1, "three darts were launched three times over");
      });

      it("Hex cues nothing at cast, `resisted` on a passed Test, and a step on the creature that failed one", async function () {
        this.timeout(180000);
        // Hex reaches 30 feet and Alpha stands 50 off (O-288, D-893): Alpha steps in to 25 feet for
        // this test, and back after it (`nearerAlpha`).
        const back = await nearerAlpha({ x: 1000, y: 500 });
        alphaBack = back;
        const card = await cast("Hex", 18, [token.alpha]);
        assert.isTrue(card.flags["azeroth-rpg"].success, "the Casting Test failed; a resist cue needs a successful cast");
        await until(() => recorder.skips.length >= 1, "the law's answer at cast");
        assert.equal(lawSkip(recorder), "not-this-trigger", "Hex drew something at cast; 07 waits for the resistance");
        assert.lengthOf(recorder.cues, 0);

        const row = cardBox(card).querySelector('[data-action="resistTest"][data-target-index]');
        assert.ok(row, "the card drew no Resist row for its recorded target");

        /**
         * Press a Resist row and KEEP THE CARD IT POSTS.
         *
         * `CARD_ACTIONS.resistTest` answers nothing, so a Resilience card made
         * here reaches neither `made` nor `cleanup` and survives the batch -
         * two a run, in a log the smoke sweep now empties but a table does not.
         * The new messages are taken off `game.messages` around the press.
         */
        const pressResist = async face => {
          const before = new Set(game.messages.map(m => m.id));
          const unpin = pinDie(face);
          try { await CARD_ACTIONS.resistTest(row, card); } finally { unpin(); }
          const posted = game.messages.filter(m => !before.has(m.id));
          made.push(...posted);
          return posted;
        };

        // A PASSED Test is a word, never a picture: 07's transformation waits
        // for a failure.
        recorder.reset();
        const passed = await pressResist(20);
        assert.isAbove(passed.length, 0, "the Resist press posted no card at all");
        await until(() => card.getFlag("azeroth-rpg", "resists")?.[token.alpha.id]?.success === true, "the passed Test recorded");
        await until(() => recorder.skips.length >= 1, "the law's answer to a passed Test");
        assert.equal(lawSkip(recorder), "resisted", "a creature that shook the Hex off was drawn as a frog");
        assert.lengthOf(recorder.cues, 0);

        // And a FAILED one plays on the creature that failed it.
        recorder.reset();
        await pressResist(1);
        await until(() => card.getFlag("azeroth-rpg", "resists")?.[token.alpha.id]?.success === false, "the failed Test recorded");
        await until(() => recorder.cues.length === 1, `one cue for the failed Test (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.lastSteps();
        assert.equal(steps[0].asset, "jb2a.smoke.puff.centered.grey");
        assert.equal(steps[0].on, token.alpha.id, "the Hex was not drawn on the creature that failed the Test");
        assert.equal(steps[0].filter, "HEX");
        // Hex is Sustained; drop it so the live half's own Sustains are not
        // fighting 05 §12's limit with a leftover.
        await endSustain({ actor: caster, spellId: caster.items.find(i => i.name === "Hex").id });
      });

      it("a card the reader may not read plays nothing at all", async function () {
        this.timeout(120000);
        const card = await cast("Fireball", 18, [token.alpha]);
        await until(() => recorder.cues.length === 1, "the Fireball's own cue");

        // **NO CARD PASSES `messageMode` TODAY** (the audit behind D-724), so a
        // hidden card cannot be made by casting one: the message is made to say
        // it is hidden and the REAL READER is asked. Re-firing
        // `createChatMessage` would run every other module's listener over a
        // card that already exists, which is a worse test than this one.
        Object.defineProperty(card, "isContentVisible", { value: false, configurable: true });
        try {
          const record = api().records.cardRecord(card);
          assert.isFalse(record.contentVisible, "the reader does not read the card's own visibility");
          const { skip, steps } = planCue(record, api().records.factsFor(record));
          assert.equal(skip, "hidden", "a card the chat selector hid was announced on the board");
          assert.lengthOf(steps, 0);
        } finally {
          delete card.isContentVisible;
        }
      });

      it("a card from a scene this client is not looking at plays nothing", async function () {
        this.timeout(180000);
        const card = await cast("Fireball", 18, [token.alpha]);
        assert.equal(card.flags["azeroth-rpg"].source?.sceneId, scene.id, "the card does not name the scene it happened on");
        await view(elsewhere);
        try {
          // The record is the card's own and the facts are this client's: the
          // scene under the reader has changed and nothing else has.
          const record = api().records.cardRecord(card);
          const facts = api().records.factsFor(record);
          assert.equal(facts.sceneId, elsewhere.id, "the facts did not follow the scene change");
          const { skip, steps } = planCue(record, facts);
          assert.equal(skip, "other-scene", "a blow on another board was drawn on this one");
          assert.lengthOf(steps, 0);
        } finally {
          await view(scene);
        }
      });

      it("a Touch buff with no recorded target cues on each recipient it is applied to", async function () {
        this.timeout(180000);
        // Nothing targeted, so the cast trigger has nothing to aim at and the
        // `cast|effect` fallback is what draws - once per effect the Apply
        // lays (D-729; the plan's *first laid effect* is superseded).
        const card = await cast("Arcane Intellect", 18, []);
        assert.isTrue(card.flags["azeroth-rpg"].success);
        assert.lengthOf(card.flags["azeroth-rpg"].targets ?? [], 0, "the cast recorded a target, so the fallback would be refused");

        canvas.tokens.get(token.ally.id).control({ releaseOthers: true });
        canvas.tokens.get(token.swordsman.id).control({ releaseOthers: false });
        assert.lengthOf(canvas.tokens.controlled, 2, "two recipients were not selected, so this proves nothing");
        recorder.reset();
        const apply = cardBox(card).querySelector('[data-action="applySpellEffect"]:not([data-self])');
        assert.ok(apply, "the card carries no Apply for a target");
        try {
          await CARD_ACTIONS.applySpellEffect(apply, card);
          await until(() => ally.effects.some(e => e.getFlag("azeroth-rpg", "cast") === card.flags["azeroth-rpg"].cast)
            && swordsman.effects.some(e => e.getFlag("azeroth-rpg", "cast") === card.flags["azeroth-rpg"].cast),
          "both effects laid");
          await until(() => recorder.cues.length === 2, `a cue for each recipient (got ${recorder.cues.length}, skips: ${recorder.skips.map(s => s.skip)})`);
          const on = recorder.cues.flatMap(c => c.steps)
            .filter(s => s.asset === "jb2a.on_token_buff.001.001.bluepurple")
            .map(s => s.on)
            .sort();
          assert.deepEqual(on, [token.ally.id, token.swordsman.id].sort(),
            "the buff was not drawn on both recipients");
        } finally {
          canvas.tokens.releaseAll();
          for (const holder of [ally, swordsman]) {
            const laid = holder.effects.filter(e => e.getFlag("azeroth-rpg", "cast") === card.flags["azeroth-rpg"].cast).map(e => e.id);
            if (laid.length) await holder.deleteEmbeddedDocuments("ActiveEffect", laid);
          }
        }
      });

      it("a creature the GM has hidden is not given away by a cue or by a standing loop", async function () {
        this.timeout(180000);
        // A GM SEES A HIDDEN TOKEN, drawn faded, so `token.visible` is true for
        // them: the gate is the second half of `visible` and only a player is
        // refused by it. The role is stubbed around SYNCHRONOUS reads alone.
        const sword = swordsman.items.find(i => i.name === "Longsword");
        canvas.tokens.setTargets([token.ghost.id]);
        recorder.reset();
        const unpin = pinDie(18);
        let card = null;
        try {
          card = await attackWithDialog(swordsman, sword);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        assert.ok(card, "the swing at the hidden creature posted no card");
        made.push(card);

        const record = api().records.cardRecord(card);
        assert.equal(record.targets[0]?.tokenId, token.ghost.id, "the card did not record the hidden creature");
        const gm = planCue(record, api().records.factsFor(record));
        assert.isNull(gm.skip, `the GM was refused the cue too: ${gm.skip}`);
        const player = asPlayer(() => planCue(record, api().records.factsFor(record)));
        assert.equal(player.skip, "no-anchor", "a player was shown a blow landing on a creature they cannot see");

        // And the same for a loop standing on it. **CAST FOR REAL**: Immolate
        // is `sustain-target`, so the Sustain the workflow writes is the
        // record `loopsFor` reads, and a hand-written flag would be the one
        // thing in this batch that had never been through a door.
        const immolate = caster.items.find(i => i.name === "Immolate");
        try {
          const burn = await cast("Immolate", 18, [token.ghost]);
          const held0 = burn.flags["azeroth-rpg"].cast;
          await until(() => (caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.cast === held0), "the Sustain on the hidden creature");
          const asGM = api().loopsFor(api().records.stateSnapshot());
          assert.lengthOf(asGM.filter(l => l.cast === held0), 1, "the GM has no loop on the hidden creature");
          const asThem = asPlayer(() => api().loopsFor(api().records.stateSnapshot()));
          assert.lengthOf(asThem.filter(l => l.cast === held0), 0,
            "a standing flame said where the hidden creature was");
        } finally {
          await endSustain({ actor: caster, spellId: immolate.id }).catch(() => {});
        }
      });

      it("a private cast's loop plays nowhere and is LISTED nowhere", async function () {
        this.timeout(180000);
        // **WHAT A SINGLE CLIENT CAN AND CANNOT SAY.** A GM sees every card, so
        // no cast made here is truly private to this screen: only a second
        // client could be the reader who may not read it. What IS real is the
        // whole chain under that one fact - the card, the cast, the Sustain,
        // the director's own privacy SET, the law's filter and the window's
        // rows - so the one property is stubbed on the message and
        // `notePrivacy`, the REAL reader the director calls on every card, is
        // asked. Nothing is faked: the set, the loop and the rows are the
        // system's own.
        const immolate = caster.items.find(i => i.name === "Immolate");
        const card = await cast("Immolate", 18, [token.alpha]);
        const secret = card.flags["azeroth-rpg"].cast;
        await until(() => (caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.cast === secret), "the Sustain");
        try {
          // Public first, so the difference is this one fact and nothing else.
          const loops = api().loopsFor(api().records.stateSnapshot());
          assert.lengthOf(loops.filter(l => l.cast === secret), 1, "the cast implied no loop to keep private");
          assert.isFalse(privateCasts().has(secret), "the cast was private before it was made so");
          assert.lengthOf(visibleLoops(loops, { privateCasts: privateCasts() }).filter(l => l.cast === secret), 1);
          assert.lengthOf(api().director.wantedLoops().filter(l => l.cast === secret), 1,
            "the director did not want the loop while the card was readable");

          Object.defineProperty(card, "isContentVisible", { value: false, configurable: true });
          notePrivacy(card);
          assert.isTrue(privateCasts().has(secret), "the reader did not take the card as private");

          // THE LOOP IS DROPPED...
          assert.lengthOf(visibleLoops(loops, { privateCasts: privateCasts() }).filter(l => l.cast === secret), 0,
            "a private cast's loop was still played");
          assert.lengthOf(api().director.wantedLoops().filter(l => l.cast === secret), 0,
            "the director still wanted a private cast's loop");
          // ...AND IT IS NOT LISTED. Not greyed, not explained: a row saying
          // *not shown to you* would itself announce the cast.
          const rows = animationRows(loops, { privateCasts: privateCasts(), isGM: true });
          assert.lengthOf(rows.filter(r => r.cast === secret), 0, "the stop window listed a private cast");
          assert.notInclude(rows.map(r => r.key).join(" "), secret, "a private cast's key reached the window");
        } finally {
          delete card.isContentVisible;
          // The set is the director's and outlives this test: put the cast back
          // to public through the same reader, or every later loop of it is
          // silently dropped.
          notePrivacy(card);
          await endSustain({ actor: caster, spellId: immolate.id }).catch(() => {});
        }
        assert.isFalse(privateCasts().has(secret), "the privacy set kept the cast after the card became readable again");
      });

      it("a step whose library is off is dropped, and the rest of the cue still plays", async function () {
        this.timeout(180000);
        // THE READER FIRST, against what the WORLD knows rather than against a
        // second copy of its own arithmetic: re-deriving `librariesOn()` from
        // the same map and comparing the two is a tautology that passes however
        // wrong both are. `moduleOn` is the one fact outside it.
        const running = librariesOn();
        assert.include(running, "JB2A_DnD5e", "the reader does not name the library every shipped picture comes from");
        assert.equal(running.includes("jaamod"), moduleOn("jaamod"),
          "the reader disagrees with the world about whether Jinker's pack is running");
        assert.notInclude(running, "nonsense", "the reader named a library that is not one");

        // The one Jinker's step the table ships: a Venture Co. Shredder's saw
        // arm. Swung for real, so the record is a real creature's.
        assert.equal(shredder.system.attacks[0]?.name, "Saw arm", "the Shredder's rows moved");
        canvas.tokens.setTargets([token.alpha.id]);
        const unpin = pinDie(18);
        let card = null;
        try {
          card = await npcAttackWithDialog(shredder, 0);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        assert.ok(card, "the saw arm posted no card");
        made.push(card);
        const record = api().records.cardRecord(card);
        assert.equal(record.strike?.form, "saw", "the saw arm did not record a saw");

        // BOTH WAYS, over the same real record, so the batch passes whether or
        // not the lead is running Jinker's pack.
        const facts = api().records.factsFor(record);
        const on = planCue(record, { ...facts, libraries: ["JB2A_DnD5e", "psfx", "jaamod"] });
        assert.isNull(on.skip);
        assert.include(assetsOf(on.steps), "jaamod.traps.saw_blade", "the saw blade did not play with Jinker's pack on");

        const off = planCue(record, { ...facts, libraries: ["JB2A_DnD5e", "psfx"] });
        assert.isNull(off.skip, `the whole cue was lost with Jinker's pack off: ${off.skip}`);
        assert.notInclude(assetsOf(off.steps), "jaamod.traps.saw_blade", "a step of a module that is off still played");
        assert.include(assetsOf(off.steps), "jb2a.impact.001.blue", "turning one library off cost the other library's steps");

        // And with EVERY library off there is nothing to draw, said in a word.
        const none = planCue(record, { ...facts, libraries: [] });
        assert.equal(none.skip, "library-off", "a cue with no library said the wrong thing");
      });
    });

    /* ------------------------------------------------------------------ */
    /*  A feature's Use (the Legacy branches' door 2)                      */
    /* ------------------------------------------------------------------ */

    describe("A feature's Use, pressed from the sheet's own control (door 2)", function () {
      /**
       * **PRESS A STEP FROM THE SHEET AND ANSWER ITS PICK ON THE BOARD**: the feature's
       * own Use on the Combat tab - never `useFeature` called by hand, which cannot see
       * the button (D-774's lesson) - the pick waited for, the board pressed at a
       * canvas point, and the card it posts.
       */
      async function stepFromSheet(actor, feature, point) {
        const sheet = await openSheet(actor);
        try {
          const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
            ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
          assert.ok(control, `the sheet draws no Use for ${feature.name}`);
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
          recorder.reset();
          control.click();
          await until(() => pickState()?.mode === "point", `${feature.name}'s pick`);
          pressBoard(point);
          // `untilHook` resolves with the hook's ARGUMENTS (`fixtures.mjs`): the card is
          // the first. Taking the list as the card read `flags` off an array (phase B7).
          const [card] = await posted;
          made.push(card);
          return card;
        } finally {
          cancelPick();
          await sheet.close();
        }
      }

      /**
       * **WHAT A STEP'S TWO CUES CAME TO**: the `use` at the space left and the
       * `arrive` at the space picked, each read off the record the card carried and
       * neither ever placed ON the token, which stands at the destination by then.
       */
      async function assertStepCues(card, { key, token, before, after, departs, arrives }) {
        const flags = card.flags["azeroth-rpg"];
        assert.equal(flags.featureKey, key, "the card does not name its feature by the key its row is filed under");
        assert.equal(flags.source?.tokenId, token.id, "the card does not name who used it");
        assert.equal(flags.casting, false, `${key} makes no Casting Test`);
        const move = flags.steps?.[0] ?? null;
        assert.ok(move, "the card recorded no move");
        assert.equal(move.tokenId, token.id);
        assert.deepEqual(move.from, before, "the move's departure is not where the token's centre stood");
        assert.deepEqual(move.to, after, "the move's arrival is not the space picked");

        await until(() => recorder.cuesFor("use", key).length === 1 && recorder.cuesFor("arrive", key).length === 1,
          `${key}'s use and arrive cues (cues: ${recorder.cues.map(c => `${c.record?.trigger}:${c.record?.identifier}`)}, skips: ${recorder.skips.map(s => s.skip)})`);
        const departure = recorder.cuesFor("use", key)[0].steps;
        const arrival = recorder.cuesFor("arrive", key)[0].steps;
        const leaves = departure.find(s => s.kind === "effect");
        const lands = arrival.find(s => s.kind === "effect");
        assert.equal(leaves.asset, departs);
        assert.equal(lands.asset, arrives);
        assert.deepEqual(leaves.at, before, "the departure was not drawn where the token stood");
        assert.deepEqual(lands.at, after, "the arrival was not drawn where the token landed");
        assert.notProperty(leaves, "on", "the departure was placed on the token, which has already left");
        assert.notProperty(lands, "on", "the arrival rides the token rather than the recorded point");
        // A step's `scale` is a multiple of the mover's width, worked out into a size.
        assert.isAbove(leaves.size, 0, "the departure has no size");
        // Each sound beside its picture, at the same point.
        assert.deepEqual(departure.find(s => s.kind === "sound")?.at, before, "the departure was heard somewhere else");
        assert.deepEqual(arrival.find(s => s.kind === "sound")?.at, after, "the arrival was heard somewhere else");
        // And the law refused nothing on the way.
        assert.lengthOf(recorder.skipsFor("use"), 0, `the use cue was refused: ${recorder.skipsFor("use")}`);
      }

      it("02's Blink departs where the mage stood and arrives where the pick put them", async function () {
        this.timeout(180000);
        const mage = await makeCharacter({ name: "ZZ Anim Blinker", classes: [["Mage", 3]] });
        const doc = await place(mage, { x: 2200, y: 1500, side: "friendly" });
        try {
          const pool = mage.poolSnapshot().find(p => p.name === "mana");
          await mage.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
          await until(() => mage.poolSnapshot().find(p => p.name === "mana").value === pool.max, "the mage's Mana");
          const blink = await until(() => mage.items.find(i => i.type === "feature" && i.name === "Blink"), "Blink granted");
          // 15 feet east: one square's width from the token's own centre, inside 20.
          const card = await stepFromSheet(mage, blink, { x: 2550, y: 1550 });
          await until(() => doc.x === 2500 && doc.y === 1500, "the mage displaced to the space picked");
          await assertStepCues(card, {
            key: "blink", token: doc, before: { x: 2250, y: 1550 }, after: { x: 2550, y: 1550 },
            departs: "jb2a.misty_step.01.blue", arrives: "jb2a.misty_step.02.blue"
          });
        } finally {
          await doc.delete().catch(() => {});
        }
      });

      it("02's Shadowstep does the same, darkened, at its own reach", async function () {
        this.timeout(240000);
        const rogue = await makeCharacter({ name: "ZZ Anim Shadowstepper", classes: [["Rogue", 20]] });
        const doc = await place(rogue, { x: 2200, y: 1800, side: "friendly" });
        try {
          // Shadowstep spends 4 Combo Points (02 §7).
          const combo = rogue.poolSnapshot().find(p => p.name === "comboPoints");
          assert.ok(combo, "a Rogue holds no Combo Points");
          await rogue.updatePool({ itemId: combo.itemId, kind: combo.kind, value: combo.max });
          await until(() => rogue.poolSnapshot().find(p => p.name === "comboPoints").value === combo.max, "the rogue's Combo Points");
          const step = await until(() => rogue.items.find(i => i.type === "feature" && i.name === "Shadowstep"), "Shadowstep granted");
          // 25 feet east, inside its 60 and in sight on a board with no walls.
          const card = await stepFromSheet(rogue, step, { x: 2750, y: 1850 });
          await until(() => doc.x === 2700 && doc.y === 1800, "the rogue displaced to the space picked");
          await assertStepCues(card, {
            key: "shadowstep", token: doc, before: { x: 2250, y: 1850 }, after: { x: 2750, y: 1850 },
            departs: "jb2a.smoke.puff.centered.grey", arrives: "jb2a.misty_step.02.blue"
          });
          // Shadowed, as the row writes it.
          assert.equal(recorder.cuesFor("use", "shadowstep")[0].steps[0].filter, "DARK");
          assert.equal(recorder.cuesFor("arrive", "shadowstep")[0].steps[0].filter, "SHADOW_B");
        } finally {
          await doc.delete().catch(() => {});
        }
      });

      it("a feature with no row in the table says `no-row` rather than drawing nothing in silence", async function () {
        this.timeout(120000);
        // 02's Second Wind: a Use with no row (yet), recorded and refused in a word.
        const warrior = await makeCharacter({ name: "ZZ Anim Second Wind", classes: [["Warrior", 3]] });
        const doc = await place(warrior, { x: 2600, y: 900, side: "friendly" });
        try {
          const wind = await until(() => warrior.items.find(i => i.type === "feature" && i.name === "Second Wind"), "Second Wind granted");
          // Second Wind costs 6 Rage (02 §6): a fresh Warrior holds none, so the Use was
          // refused for its price and posted nothing (B8b).
          const rage = warrior.poolSnapshot().find(p => p.name === "rage");
          await warrior.updatePool({ itemId: rage.itemId, kind: rage.kind, value: rage.max });
          await until(() => warrior.poolSnapshot().find(p => p.name === "rage")?.value === rage.max, "the Warrior's Rage full");
          recorder.reset();
          const card = await game.system.azeroth.workflows.useFeature({ actor: warrior, item: wind });
          assert.ok(card, "Second Wind posted no card");
          made.push(card);
          assert.equal(card.flags["azeroth-rpg"].featureKey, "second-wind");
          await until(() => recorder.skipsFor("use").length >= 1, "the law's answer to Second Wind's Use");
          assert.include(recorder.skipsFor("use"), "no-row");
          assert.lengthOf(recorder.cuesFor("use", "second-wind"), 0);
        } finally {
          await doc.delete().catch(() => {});
        }
      });
    });

    /* ------------------------------------------------------------------ */
    /*  The Legacy branches' rows (phase B7), and the B4 review's cases      */
    /* ------------------------------------------------------------------ */

    describe("The Legacy branches' rows, pressed from the sheet (phase B7)", function () {
      /**
       * One case a Legacy branch, each pressed from the sheet's own control and read back
       * off the recorder - and the B4 review's six: a floor's catch through its effect's
       * update (Big Bad Voodoo), one condition landing playing one cue (Shadow Trap's
       * spring), a `rise` on a token still drawing (The Bench, Dark Minion), a `missed`
       * rider (Bash), a GM-hidden Region (the trap) and The Long Watch on a screen that
       * does not own the warden. Written in phase B7 and NOT run there (the phase was
       * offline); every document a case makes is taken up in its own `finally`.
       */
      const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
      const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
      const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
      const wanted = key => api().director.reconcile().filter(l => l.identifier === key);

      /** A hero of one people and one class, the Legacy's twelve on the sheet and these ranks taken. */
      async function legacyHero(name, { race, className, level = 9, ranks = {}, weapons = [], abilities = null }) {
        const hero = await makeCharacter({ name, race, classes: [[className, level]], weapons, ...(abilities ? { abilities } : {}) });
        await until(() => hero.items.filter(i => i.type === "talent" && i.system?.legacy === race).length === 12, `${name}'s Legacy twelve`, 30000);
        for (const n of weapons) {
          const item = await until(() => hero.items.find(i => i.name === n && ["weapon", "armor", "gear"].includes(i.type)), `${n} held`);
          if (/arrows|bolts/i.test(n)) continue;
          await item.update({ "system.equipped": true });
          await until(() => hero.items.get(item.id)?.system?.equipped === true, `${n} in hand`);
        }
        for (const [talent, rank] of Object.entries(ranks)) {
          const t = await until(() => talentNamed(hero, talent), `${talent} on the sheet`);
          await t.update({ "system.taken": rank });
          await until(() => talentNamed(hero, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
        }
        await settle();
        return hero;
      }

      /** Set a pool to a value (AFTER any fight starts, which begins every Momentum pool at 0). */
      async function setPool(actor, name, value) {
        const pool = poolOf(actor, name);
        if (!pool) throw new Error(`${actor.name} holds no ${name}`);
        await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
        await until(() => poolOf(actor, name).value === value, `${actor.name}'s ${value} ${name}`);
      }

      /** A started fight holding these actors by their tokens, its turn events landed (D-627). */
      async function fightWith(actors) {
        const combat = await Combat.create({ scene: canvas.scene?.id ?? null });
        made.push(combat);
        await combat.activate();
        await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
          const doc = a.getActiveTokens?.(true)?.[0]?.document ?? null;
          return doc ? { actorId: a.id, tokenId: doc.id, sceneId: doc.parent.id } : { actorId: a.id };
        }));
        const turned = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.startCombat();
        await turned;
        await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's budget landing", 30000);
        return combat;
      }

      /** The chooser a feature opened, its option picked by name and pressed. */
      async function choose(feature, name) {
        const app = await until(() => {
          const found = foundry.applications.instances.get(`azeroth-choose-${feature.id}`);
          return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
        }, `${feature.name}'s chooser`);
        const select = app.element.querySelector("#azeroth-choose-select");
        if (select) {
          const option = [...select.options].find(o => o.textContent.trim().startsWith(name));
          if (!option) throw new Error(`${feature.name}'s chooser offers no ${name}`);
          select.value = option.value;
        } else {
          for (const box of app.element.querySelectorAll('input[name="choice"]')) {
            box.checked = (box.closest("label")?.textContent?.trim() ?? "").startsWith(name);
          }
        }
        app.element.querySelector('button[data-action="choose"]').click();
      }

      /**
       * **PRESS THE COMBAT TAB'S USE FOR ONE FEATURE AND TAKE ITS CARD** - never `useFeature`
       * by hand, which cannot see the button (D-774) - the die pinned, a point pick
       * answered on the board, a chooser's option picked, the recorder reset first.
       */
      async function useFromSheet(actor, feature, { face = 15, point = null, option = null, targets = [] } = {}) {
        const sheet = await openSheet(actor);
        const unpin = pinDie(face);
        canvas.tokens.setTargets(targets.map(t => t.id));
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
            ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
          assert.ok(control, `the sheet draws no Use for ${feature.name}`);
          const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
          recorder.reset();
          control.click();
          if (point) {
            await until(() => pickState()?.mode === "point", `${feature.name}'s pick`);
            pressBoard(point);
          }
          if (option) await choose(feature, option);
          const [card] = await posted;
          made.push(card);
          return card;
        } finally {
          unpin();
          cancelPick();
          canvas.tokens.setTargets([]);
          await sheet.close();
        }
      }

      /** The sheet's Attack for one weapon, these rider lines ticked on the real dialog (D-770). */
      async function attackWithRiders(actor, weapon, target, { riders = [], face = 20 } = {}) {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
        const sheet = await openSheet(actor);
        const unpin = pinDie(face);
        canvas.tokens.setTargets([target.id]);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "attack");
          recorder.reset();
          const control = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`);
          assert.ok(control, `no Attack on the Combat tab for ${weapon.name}`);
          control.click();
          const dialog = await dialogFor(actor, 8000);
          assert.ok(dialog, "the attack dialog did not open");
          for (const id of riders) {
            const box = dialog.element.querySelector(`input[name="rider-${id}"]`);
            assert.ok(box, `the dialog draws no ${id} line`);
            assert.isFalse(box.disabled, `the ${id} line was greyed`);
            box.checked = true;
          }
          // **EXTRA ATTACK'S SECOND WEAPON IS CHOSEN ON THE DIALOG** (0.14.0; the Chronomancer
          // live fix found this stale): a hero with Extra Attack draws `extraWeapon` with no
          // default and the Roll button disabled until one is picked, so a press here did
          // nothing and the card never came. The first legal weapon, as a player would pick.
          const select = dialog.element.querySelector('select[name="extraWeapon"]');
          if (select && !select.value) {
            const first = [...select.options].find(o => o.value && !o.disabled);
            assert.ok(first, "the dialog offers no second weapon to choose");
            select.value = first.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          const roll = dialog.element.querySelector('button[data-action="roll"]');
          await until(() => !roll.disabled, "the Roll button enabled", 5000);
          roll.click();
          const [card] = await posted;
          made.push(card);
          return card;
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await sheet.close();
          await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
        }
      }

      /** Take up what a case placed and made: its tokens, its fights, the creatures it bound. */
      async function takeUp({ docs = [], combats = [], actors = [] } = {}) {
        // **OUR PASSES FIRST, THEN ONLY WHAT THE WORLD STILL HOLDS** (B8b). A pass still owed
        // (an area's, an arrival's) wrote to a token this had just deleted - *undefined id
        // [...] does not exist* - and a fight's end deletes the creatures it called with their
        // tokens (`_leaveFight`, on the active GM's client and unawaited), so the Risen
        // Skeleton's token was deleted twice and the server logged the refusal.
        await drainAreaWork().catch(() => {});
        for (const combat of combats) {
          if (combat && game.combats.has(combat.id)) await combat.delete().catch(() => {});
        }
        if (combats.length) {
          const called = actors.filter(a => a?.getFlag?.("azeroth-rpg", "bond"));
          for (let i = 0; i < 100 && called.some(a => game.actors.has(a.id)); i++) await new Promise(r => setTimeout(r, 50));
        }
        const held = doc => Boolean(doc?.id && doc.parent?.getEmbeddedCollection?.(doc.documentName)?.has?.(doc.id));
        for (const actor of actors) {
          for (const doc of (canvas.scene?.tokens ?? []).filter(t => t.actorId === actor?.id)) {
            if (held(doc)) await doc.delete().catch(() => {});
          }
        }
        for (const doc of docs) if (held(doc)) await doc.delete().catch(() => {});
        for (const actor of actors) if (actor && game.actors.has(actor.id)) await actor.delete().catch(() => {});
        await drainAreaWork().catch(() => {});
      }

      it("BLADEMASTER: Wind Walk at rank 2 from the sheet gathers the wind at the orc, and stands two pictures - the wind while no blow may answer him, the refraction while he is hidden - and none for the free walk", async function () {
        this.timeout(240000);
        const orc = await legacyHero("ZZ Anim Wind Walker", { race: "Orc", className: "Warrior", level: 5, ranks: { "Wind Walk": 2 } });
        const doc = await place(orc, { x: 2000, y: 200, side: "friendly" });
        try {
          await setPool(orc, "rage", 6);
          const wind = await until(() => featureNamed(orc, "Wind Walk"), "Wind Walk granted");
          const card = await useFromSheet(orc, wind);
          assert.equal(card.flags["azeroth-rpg"].featureKey, "wind-walk", "the card does not name its feature");
          await until(() => recorder.cuesFor("use", "wind-walk").length === 1, `Wind Walk's use cue (skips: ${recorder.skips.map(s => s.skip)})`);
          const gust = recorder.cuesFor("use", "wind-walk")[0].steps.find(s => s.kind === "effect");
          assert.equal(gust.asset, "jb2a.wind_stream.white");
          assert.equal(gust.on, doc.id, "the wind did not gather at the orc");
          const loops = await until(() => {
            const list = wanted("wind-walk");
            return list.length === 2 ? list : null;
          }, "Wind Walk's two standing pictures");
          assert.sameMembers(loops.map(l => l.layers[0].asset), ["jb2a.wind_stream.white", "jb2a.condition.boon.02.001.refraction"],
            "the two pictures are not the wind's and the refraction's: the free walk stood one too, or a state stood none");
          for (const l of loops) assert.deepEqual(l.anchors, [doc.id], "a Wind Walk picture stands off the orc");
          for (const l of loops) assert.isTrue(recorder.isPlaying(l.key), `${l.key} is not playing`);
        } finally {
          await takeUp({ docs: [doc] });
        }
      });

      it("MOUNTAIN KING: Thunder Clap from the sheet bursts at the dwarf, sized from its own 10 feet; Bash on the real dialog jolts the ghoul on a hit and says `missed` on a miss (the B4 review)", async function () {
        this.timeout(300000);
        const dwarf = await legacyHero("ZZ Anim Thunder", { race: "Dwarf", className: "Warrior", level: 9, ranks: { "Thunder Clap": 1, Bash: 1 }, weapons: ["Battleaxe"] });
        const ghoul = await makeNpc("Plagued Ghoul");
        await ghoul.update({ name: "ZZ Anim Thunder Ghoul" });
        const mine = await place(dwarf, { x: 2000, y: 700, side: "friendly" });
        const theirs = await place(ghoul, { x: 2100, y: 700 });
        try {
          await setPool(dwarf, "rage", 10);
          const clap = await until(() => featureNamed(dwarf, "Thunder Clap"), "Thunder Clap granted");
          await useFromSheet(dwarf, clap);
          await until(() => recorder.cuesFor("use", "thunder-clap").length === 1, `Thunder Clap's cue (skips: ${recorder.skips.map(s => s.skip)})`);
          const steps = recorder.cuesFor("use", "thunder-clap")[0].steps;
          const wave = steps.find(s => s.asset === "jb2a.thunderwave.center.blue");
          assert.ok(wave, "the clap drew no thunder");
          assert.equal(wave.on, mine.id, "the thunder did not burst at the dwarf");
          // *Every enemy within 10 feet of you*: twenty feet across, 400px on this grid.
          assert.closeTo(wave.size, 400, 1, "the thunder is not the clap's own 20 feet across");
          assert.include(steps.map(s => s.asset), "psfx.cantrips.thunderclap.v1");

          // Bash, ticked on the real dialog: a miss rode the rider and landed nothing.
          const axe = dwarf.items.find(i => i.name === "Battleaxe");
          await setPool(dwarf, "rage", 10);
          const missed = await attackWithRiders(dwarf, axe, theirs, { riders: ["bash"], face: 1 });
          assert.isFalse(missed.rolls[0].outcome.success, "a natural 1 landed; the board moved");
          assert.include(missed.flags["azeroth-rpg"].ridden ?? [], "bash", "the attack card does not record the rider it rode");
          await until(() => recorder.skipsFor("hit").includes("missed"), `Bash's \`missed\` (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          assert.lengthOf(recorder.cuesFor("hit", "bash"), 0, "a missed Bash drew its jolt");
          // And a hit jolts the ghoul, a beat after the axe's own impact.
          await setPool(dwarf, "rage", 10);
          await attackWithRiders(dwarf, axe, theirs, { riders: ["bash"], face: 20 });
          await until(() => recorder.cuesFor("hit", "bash").length === 1, "Bash's jolt on the hit");
          const jolt = recorder.cuesFor("hit", "bash")[0].steps.find(s => s.kind === "effect");
          assert.equal(jolt.on, theirs.id, "the jolt did not land on the ghoul");
          assert.isAbove(jolt.delay ?? 0, 0, "the jolt landed before the blow");
        } finally {
          await takeUp({ docs: [mine, theirs] });
        }
      });

      it("WARDEN: Shadow Trap from the sheet - its rune at the Region once its card has spoken, standing while the trap does and NEVER on a player's board the GM hid it from (the MUST-FIX); a ghoul springing it plays exactly one cue (the B4 review) and wears the chains", async function () {
        this.timeout(300000);
        const warden = await legacyHero("ZZ Anim Trapper", { race: "Night Elf", className: "Rogue", level: 3, ranks: { "Shadow Trap": 1 } });
        const ghoul = await makeNpc("Plagued Ghoul");
        await ghoul.update({ name: "ZZ Anim Trap Ghoul" });
        const mine = await place(warden, { x: 2000, y: 1100, side: "friendly" });
        const theirs = await place(ghoul, { x: 2700, y: 1100 });
        try {
          await setPool(warden, "energy", 10);
          const trap = await until(() => featureNamed(warden, "Shadow Trap"), "Shadow Trap granted");
          await useFromSheet(warden, trap, { point: { x: 2350, y: 1150 } });
          const region = await until(() => scene.regions.find(r => r.flags?.["azeroth-rpg"]?.[TRAP_FLAG]?.setter === warden.uuid), "the trap's Region");
          // **FILED UNDER THE FEATURE'S OWN KEY** (the B4 review).
          assert.equal(region.flags["azeroth-rpg"][TRAP_FLAG].identifier, "shadow-trap");
          // The Region was laid BEFORE the card; its cue waited for the card and then played.
          await until(() => recorder.cuesFor("region", "shadow-trap").length === 1, `the trap's region cue (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          const rune = recorder.cuesFor("region", "shadow-trap")[0].steps.find(s => s.kind === "effect");
          const centre = { x: region.shapes[0].x, y: region.shapes[0].y };
          assert.closeTo(rune.at.x, centre.x, 1, "the rune was not drawn on the trap");
          assert.closeTo(rune.at.y, centre.y, 1);
          const standing = await until(() => wanted("shadow-trap").find(l => l.binding === "region"), "the trap's standing rune");
          assert.deepEqual(standing.anchors, [region.id]);

          // **A REGION THE GM HAS HIDDEN STANDS NOTHING ON A PLAYER'S BOARD** (the MUST-FIX).
          await region.update({ hidden: true });
          await until(() => scene.regions.get(region.id)?.hidden === true, "the trap hidden");
          const asGM = api().loopsFor(api().records.stateSnapshot()).filter(l => l.identifier === "shadow-trap");
          assert.lengthOf(asGM, 1, "the GM lost the hidden trap's rune");
          const asThem = asPlayer(() => api().loopsFor(api().records.stateSnapshot())).filter(l => l.identifier === "shadow-trap");
          assert.lengthOf(asThem, 0, "a player was shown the rune of a trap the GM hid");
          const recordFor = asPlayer(() => api().records.regionRecord(scene.regions.get(region.id)));
          assert.isFalse(recordFor.contentVisible, "a player's record of the hidden trap is not hidden");
          assert.equal(planCue(recordFor, api().records.factsFor(recordFor)).skip, "hidden");
          await region.update({ hidden: false });
          await until(() => scene.regions.get(region.id)?.hidden === false, "the trap shown again");

          // The ghoul walks into it: ONE landing, ONE cue (create and the marks' update).
          recorder.reset();
          await theirs.update({ x: 2300, y: 1100 });
          // The landing is a create and then its marks' update: wait for the escape itself,
          // never the status alone (B8b: the status was read before the marks had landed).
          const held = await until(() => ghoul.effects.find(e => e.statuses?.has("entangled") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the trap's Entangled on the ghoul, with its escape");
          assert.equal(held?.getFlag("azeroth-rpg", ESCAPE_FLAG)?.source, "Shadow Trap", "the Entangled does not name the trap on its escape");
          await until(() => recorder.cuesFor("effect", "shadow-trap").length >= 1, "the spring's cue");
          await new Promise(r => setTimeout(r, 2000));
          assert.lengthOf(recorder.cuesFor("effect", "shadow-trap"), 1, "one landing cued more than once");
          assert.equal(recorder.cuesFor("effect", "shadow-trap")[0].steps[0].on, theirs.id, "the chains closed somewhere else");
          const chains = await until(() => wanted("shadow-trap").find(l => l.binding === "effect"), "the chains standing on the ghoul");
          assert.deepEqual(chains.anchors, [theirs.id]);
        } finally {
          await takeUp({ docs: [mine, theirs] });
        }
      });

      it("WARDEN: The Long Watch stands its marker on the creature watched for the warden's owners, and on no screen that does not own the warden (the B4 review)", async function () {
        this.timeout(240000);
        const warden = await legacyHero("ZZ Anim Watcher", { race: "Night Elf", className: "Rogue", level: 9, ranks: { "The Long Watch": 1 } });
        const ghoul = await makeNpc("Plagued Ghoul");
        await ghoul.update({ name: "ZZ Anim Watched Ghoul" });
        const mine = await place(warden, { x: 2000, y: 1500, side: "friendly" });
        const theirs = await place(ghoul, { x: 2400, y: 1500 });
        let card = null;
        try {
          const watch = await until(() => featureNamed(warden, "The Long Watch"), "The Long Watch granted");
          card = await useFromSheet(warden, watch, { targets: [theirs] });
          await until(() => warden.getFlag("azeroth-rpg", WATCH_FLAG)?.tokenId === theirs.id, "the watch on the ghoul");
          const marker = await until(() => wanted("the-long-watch")[0], "the watch's marker");
          assert.equal(marker.binding, "mark");
          assert.deepEqual(marker.anchors, [theirs.id], "the marker does not stand on the creature watched");
          // A screen that does not own the warden works out no such loop at all.
          Object.defineProperty(warden, "isOwner", { value: false, configurable: true });
          try {
            const elsewhere = asPlayer(() => api().loopsFor(api().records.stateSnapshot())).filter(l => l.identifier === "the-long-watch");
            assert.lengthOf(elsewhere, 0, "a non-owner's screen stood the warden's watch");
          } finally {
            delete warden.isOwner;
          }
          // And the whispered card itself is private there: the pair is noted, the loop dropped.
          Object.defineProperty(card, "isContentVisible", { value: false, configurable: true });
          notePrivacy(card);
          assert.isTrue(privateCasts().has(`feature:${warden.id}:the-long-watch`), "the whispered card's pair was not noted");
          assert.lengthOf(api().director.wantedLoops().filter(l => l.identifier === "the-long-watch"), 0, "a private watch was still wanted");
        } finally {
          if (card) {
            delete card.isContentVisible;
            notePrivacy(card);
          }
          await takeUp({ docs: [mine, theirs] });
        }
      });

      it("TINKER: The Bench builds a Gnomish Battle Chicken out of a fight, and its `rise` plays on the construct's token even while that token is still drawing (the MUST-FIX)", async function () {
        this.timeout(300000);
        const gnome = await legacyHero("ZZ Anim Tinker", { race: "Gnome", className: "Rogue", level: 3, ranks: { "The Bench": 1 }, abilities: { dex: 16, int: 16 } });
        await give(gnome, "Tinker's kit");
        const mine = await place(gnome, { x: 2000, y: 1800, side: "friendly" });
        let chicken = null;
        try {
          const bench = await until(() => featureNamed(gnome, "The Bench"), "The Bench granted");
          const card = await useFromSheet(gnome, bench, { option: "Gnomish Battle Chicken" });
          chicken = await until(() => boundOf(gnome, "construct")[0] ?? null, "the construct bound", 30000);
          const doc = await until(() => scene.tokens.find(t => t.actorId === chicken.id), "the construct's token on the board", 30000);
          assert.deepEqual((card.flags["azeroth-rpg"].risen ?? []).flatMap(r => r.tokenIds), [doc.id], "the card does not record the token that stood up");
          await until(() => recorder.cuesFor("rise", "the-bench").length === 1, `The Bench's rise (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          assert.notInclude(recorder.skipsFor("rise"), "no-anchor", "the rise was refused for a token still drawing");
          const steam = recorder.cuesFor("rise", "the-bench")[0].steps.find(s => s.kind === "effect");
          assert.equal(steam.on, doc.id, "the steam did not rise where the construct stands");
        } finally {
          await takeUp({ docs: [mine], actors: chicken ? [chicken] : [] });
        }
      });

      it("DARK RANGER: Black Arrow on the real dialog shoots its own dark arrow and stands its mark on the ghoul; the marked ghoul's fall raises a skeleton, whose `rise` plays on its token", async function () {
        this.timeout(300000);
        const ranger = await legacyHero("ZZ Anim Black Arrow", { race: "Forsaken", className: "Ranger", level: 13, ranks: { "Black Arrow": 1, "Dark Minion": 1 }, weapons: ["Shortbow", "Hunting arrows"], abilities: { dex: 16, wis: 14, con: 12 } });
        const ghoul = await makeNpc("Plagued Ghoul");
        await ghoul.update({ name: "ZZ Anim Arrow Ghoul" });
        const mine = await place(ranger, { x: 2400, y: 300, side: "friendly" });
        const theirs = await place(ghoul, { x: 2700, y: 300 });
        let combat = null;
        let risen = null;
        try {
          combat = await fightWith([ranger, ghoul]);
          await giveTurn(combat, ranger);
          await setPool(ranger, "focus", 5);
          const bow = ranger.items.find(i => i.name === "Shortbow");
          const card = await attackWithRiders(ranger, bow, theirs, { riders: ["black-arrow"], face: 20 });
          assert.isTrue(card.rolls[0].outcome.success, "the pinned 20 missed");
          await until(() => recorder.cues.some(c => c.record?.kind === "attack"), "the shot's cue");
          const shot = recorder.cues.find(c => c.record?.kind === "attack").steps[0];
          assert.equal(shot.asset, "jb2a.arrow.poison.green.01", "the shot played the bow's own arrow, not Black Arrow's");
          assert.equal(shot.filter, "DARK");
          await until(() => ghoul.effects.some(e => e.flags?.["azeroth-rpg"]?.[NO_HEALING_FLAG]?.source === "Black Arrow"), "the no-healing mark");
          const mark = await until(() => wanted("black-arrow")[0], "Black Arrow's mark standing");
          assert.deepEqual(mark.anchors, [theirs.id]);
          // The marked ghoul falls; Dark Minion's skeleton rises on the board.
          recorder.reset();
          await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, location: "body", type: null });
          risen = await until(() => boundOf(ranger, "summon").find(a => a.getFlag("azeroth-rpg", "bond")?.sourceName === "Dark Minion"), "the Risen Skeleton bound", 30000);
          const doc = await until(() => scene.tokens.find(t => t.actorId === risen.id), "the skeleton's token", 30000);
          await until(() => recorder.cuesFor("rise", "dark-minion").length === 1, `Dark Minion's rise (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          assert.equal(recorder.cuesFor("rise", "dark-minion")[0].steps.find(s => s.kind === "effect").on, doc.id, "the grave smoke did not rise where the skeleton stands");
        } finally {
          await takeUp({ docs: [mine, theirs], combats: combat ? [combat] : [], actors: risen ? [risen] : [] });
        }
      });

      it("SHADOW HUNTER: Big Bad Voodoo stands its mask while it is Sustained, and its floor's catch - an UPDATE of the floor's effect - plays the mask on the ally held at 1 (the B4 review)", async function () {
        this.timeout(300000);
        const troll = await legacyHero("ZZ Anim Voodoo", { race: "Troll", className: "Shaman", level: 16, ranks: { "The Loa Gather": 1, "Big Bad Voodoo": 1 }, abilities: { wis: 16, str: 14 } });
        const ally = await makeCharacter({ name: "ZZ Anim Voodoo Ally", classes: [["Warrior", 5]] });
        for (const a of [troll, ally]) await a.setParty(true);
        const mine = await place(troll, { x: 2500, y: 700, side: "friendly" });
        const theirs = await place(ally, { x: 2700, y: 700, side: "friendly" });
        try {
          const mana = poolOf(troll, "mana");
          await setPool(troll, "mana", mana.max);
          const voodoo = await until(() => featureNamed(troll, "Big Bad Voodoo"), "Big Bad Voodoo granted");
          await useFromSheet(troll, voodoo);
          const held = await until(() => (troll.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e?.identifier === "big-bad-voodoo"), "the Sustain under its key");
          const mask = await until(() => wanted("big-bad-voodoo")[0], "the voodoo's standing mask");
          assert.equal(mask.binding, "sustain-self");
          assert.deepEqual(mask.anchors, [mine.id], "the mask does not stand on the troll");
          // The floor on the ally, and a blow it holds at 1: the floor's catch is written as
          // an update of its effect, and the update is the cue.
          await drainAreaWork();
          await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", FLOOR_FLAG)), "the floor on the ally", 30000);
          await ally.update({ "system.health.value": ally.system.health.max });
          recorder.reset();
          await ally.applyDamage(999, { struck: true });
          await until(() => ally.system.health.value === 1, "the ally held at 1");
          await until(() => recorder.cuesFor("hold", "big-bad-voodoo").length === 1, `the floor's catch (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          const caught = recorder.cuesFor("hold", "big-bad-voodoo")[0].steps.filter(s => s.kind === "effect");
          assert.isTrue(caught.every(s => s.on === theirs.id), "the catch was drawn off the ally held");
          // The Sustain dropped, the mask is no longer wanted.
          await game.system.azeroth.workflows.endSustain({ actor: troll, cast: held.cast });
          await until(() => wanted("big-bad-voodoo").length === 0, "the mask gone with the Sustain");
        } finally {
          await takeUp({ docs: [mine, theirs] });
        }
      });

      it("SPIRIT WALKER: Ethereal Form's arrival waits for its card and then plays on the shaman, its ghost stands while the form does - and not where the Use's card is private (the B4 review)", async function () {
        this.timeout(240000);
        const tauren = await legacyHero("ZZ Anim Ethereal", { race: "Tauren", className: "Shaman", level: 9, ranks: { "Ethereal Form": 1 }, abilities: { wis: 16, con: 14 } });
        await tauren.setParty(true);
        const mine = await place(tauren, { x: 2500, y: 1800, side: "friendly" });
        let card = null;
        try {
          const mana = poolOf(tauren, "mana");
          await setPool(tauren, "mana", mana.max);
          const form = await until(() => featureNamed(tauren, "Ethereal Form"), "Ethereal Form granted");
          card = await useFromSheet(tauren, form);
          await until(() => tauren.effects.some(e => e.flags?.["azeroth-rpg"]?.ethereal), "the form on the shaman");
          // The state was laid BEFORE the card: its cue waited for the card, then played.
          await until(() => recorder.cuesFor("effect", "ethereal-form").length === 1, `the form's arrival (skips: ${recorder.skips.map(s => `${s.record?.trigger}:${s.skip}`)})`);
          const arrival = recorder.cuesFor("effect", "ethereal-form")[0];
          assert.deepEqual(arrival.record.states, ["ethereal"], "the arrival does not name the state it answers");
          assert.equal(arrival.steps.find(s => s.kind === "effect").on, mine.id);
          const ghost = await until(() => wanted("ethereal-form")[0], "the form's ghost standing");
          assert.deepEqual(ghost.anchors, [mine.id]);
          assert.equal(ghost.privacy, `feature:${tauren.id}:ethereal-form`, "the loop names no privacy pair");
          // The same Use's card made private here: what the Use laid stands no picture.
          Object.defineProperty(card, "isContentVisible", { value: false, configurable: true });
          notePrivacy(card);
          assert.lengthOf(api().director.wantedLoops().filter(l => l.identifier === "ethereal-form"), 0, "a private Use's state still stood its picture");
          assert.lengthOf(animationRows(api().loopsFor(api().records.stateSnapshot()), { privateCasts: privateCasts(), isGM: true }).filter(r => r.identifier === "ethereal-form"), 0,
            "the stop window listed a private Use's state");
        } finally {
          if (card) {
            delete card.isContentVisible;
            notePrivacy(card);
          }
          await takeUp({ docs: [mine] });
        }
      });

      // ---- The B8a2 pass (written offline, not run): 02 §5's racial Uses. ----
      it("RACIAL USES (the B8a2 pass): War Stomp from the sheet stamps at the tauren and draws nothing on an enemy; Berserking flares at the troll, its glow stands while the encounter's Boon does and goes when the fight ends", async function () {
        this.timeout(240000);
        const tauren = await makeCharacter({ name: "ZZ Anim Stomp", race: "Tauren", classes: [["Warrior", 5]], abilities: { str: 16, con: 14 } });
        const troll = await makeCharacter({ name: "ZZ Anim Berserk", race: "Troll", classes: [["Warrior", 5]], abilities: { str: 16, con: 14 } });
        for (const [hero, name] of [[tauren, "War Stomp"], [troll, "Berserking"]]) {
          const talent = await until(() => talentNamed(hero, name), `${name} among the racial eight`);
          await talent.update({ "system.taken": 1 });
          await until(() => featureNamed(hero, name), `${name}'s Use granted`);
        }
        const ghoul = await makeNpc("Plagued Ghoul");
        await ghoul.update({ name: "ZZ Anim Stomp Ghoul" });
        const stomper = await place(tauren, { x: 2000, y: 1200, side: "friendly" });
        const near = await place(ghoul, { x: 2100, y: 1200 });
        const rager = await place(troll, { x: 2600, y: 1200, side: "friendly" });
        let combat = null;
        try {
          combat = await fightWith([tauren, troll, ghoul]);
          // Each Use is a Half-Action, made on its own creature's turn (the lead: *"Refuse
          // off-turn Half-Actions"*).
          await giveTurn(combat, tauren);
          await setPool(tauren, "rage", 6);
          const card = await useFromSheet(tauren, featureNamed(tauren, "War Stomp"));
          assert.equal(card.flags["azeroth-rpg"].featureKey, "war-stomp", "the card does not name War Stomp");
          await until(() => recorder.cuesFor("use", "war-stomp").length === 1, `War Stomp's use cue (skips: ${recorder.skips.map(s => s.skip)})`);
          const stamp = recorder.cuesFor("use", "war-stomp")[0].steps.filter(s => s.kind === "effect");
          assert.sameMembers(stamp.map(s => s.asset), ["jb2a.impact.ground_crack.orange.02", "jb2a.smoke.puff.ring.01.white"]);
          for (const s of stamp) assert.equal(s.on, stomper.id, "the stamp drew off the tauren");
          assert.notInclude(stamp.map(s => s.on), near.id, "the stamp drew on an enemy before its Test");
          // Berserking: the flare at the troll, and the glow standing on the encounter's Boon.
          await giveTurn(combat, troll);
          await setPool(troll, "rage", 6);
          await useFromSheet(troll, featureNamed(troll, "Berserking"));
          await until(() => recorder.cuesFor("use", "berserking").length === 1, "Berserking's flare");
          assert.equal(recorder.cuesFor("use", "berserking")[0].steps.find(s => s.kind === "effect").on, rager.id, "the flare drew off the troll");
          const glow = await until(() => wanted("berserking")[0], "Berserking's glow standing");
          assert.deepEqual(glow.anchors, [rager.id], "the glow stands off the troll");
          await combat.delete();
          combat = null;
          await until(() => !troll.effects.some(e => e.flags?.["azeroth-rpg"]?.talentBuff === "Berserking"), "the encounter's Boon lifted at the fight's end");
          await until(() => wanted("berserking").length === 0, "the glow gone with the Boon");
        } finally {
          await takeUp({ docs: [stomper, near, rager], combats: combat ? [combat] : [], actors: [tauren, troll] });
        }
      });

      it("BLOOD FURY (D-798): from the sheet, a roar and a red flare at the orc on every Use; a Shaman's red haze stands on the fury and goes with the fight; a Warrior's Momentum plays the cue alone", async function () {
        this.timeout(240000);
        // The lead's ruling: an orc with no Momentum pool takes +1 on weapon attacks and
        // spells instead. That is a state the encounter holds, so it is a LOOP on the
        // fury's own effect; the Momentum is gone into a pool, so it is the cue alone.
        const shaman = await makeCharacter({ name: "ZZ Anim Fury Shaman", race: "Orc", classes: [["Shaman", 5]] });
        const warrior = await makeCharacter({ name: "ZZ Anim Fury Warrior", race: "Orc", classes: [["Warrior", 5]], abilities: { str: 16 } });
        await until(() => featureNamed(shaman, "Blood Fury") && featureNamed(warrior, "Blood Fury"), "Blood Fury granted to both orcs");
        const furyToken = await place(shaman, { x: 2000, y: 1200, side: "friendly" });
        const rageToken = await place(warrior, { x: 2600, y: 1200, side: "friendly" });
        const furied = () => shaman.effects.some(e => e.flags?.["azeroth-rpg"]?.bloodFury);
        let combat = null;
        try {
          combat = await fightWith([shaman, warrior]);
          // The Shaman: no Momentum pool, so the fury and its haze.
          await giveTurn(combat, shaman);
          const card = await useFromSheet(shaman, featureNamed(shaman, "Blood Fury"));
          assert.equal(card.flags["azeroth-rpg"].featureKey, "blood-fury", "the card does not name Blood Fury");
          await until(() => recorder.cuesFor("use", "blood-fury").length === 1, `Blood Fury's use cue (skips: ${recorder.skips.map(s => s.skip)})`);
          const flare = recorder.cuesFor("use", "blood-fury")[0].steps.filter(s => s.kind === "effect");
          assert.deepEqual(flare.map(s => s.asset), ["jb2a.cast_generic.fire.01.orange"]);
          for (const s of flare) assert.equal(s.on, furyToken.id, "the flare drew off the Shaman");
          await until(furied, "the fury's effect on the Shaman");
          const haze = await until(() => wanted("blood-fury")[0], "the red haze standing on the fury");
          assert.deepEqual(haze.anchors, [furyToken.id], "the haze stands off the Shaman");
          // The Warrior: 2 Rage, the cue at him, and no second haze anywhere.
          await giveTurn(combat, warrior);
          await useFromSheet(warrior, featureNamed(warrior, "Blood Fury"));
          await until(() => recorder.cuesFor("use", "blood-fury").length === 1, "the Warrior's Blood Fury cue");
          assert.equal(recorder.cuesFor("use", "blood-fury")[0].steps.find(s => s.kind === "effect").on, rageToken.id, "the Warrior's flare drew off another token");
          assert.isFalse(warrior.effects.some(e => e.flags?.["azeroth-rpg"]?.bloodFury), "a Warrior's Blood Fury laid the fury");
          assert.deepEqual(wanted("blood-fury").map(l => l.anchors[0]), [furyToken.id], "a Warrior's Momentum stood a haze");
          // *Until the encounter ends*: the fight's end lifts the fury, and the haze goes with it.
          await combat.delete();
          combat = null;
          await until(() => !furied(), "the fury lifted at the fight's end");
          await until(() => wanted("blood-fury").length === 0, "the haze gone with the fury");
        } finally {
          await takeUp({ docs: [furyToken, rageToken], combats: combat ? [combat] : [], actors: [shaman, warrior] });
        }
      });
    });

    /* ------------------------------------------------------------------ */
    /*  Live Sequencer                                                     */
    /* ------------------------------------------------------------------ */

    describe("Live Sequencer: loops that end when the world says so", function () {
      /** Put the real player in for one test, and take it out again. */
      async function withRealPlayer(fn) {
        api().director.resetPlayer();
        try {
          return await fn();
        } finally {
          // **END EVERYTHING AND WAIT FOR THE MANAGER TO EMPTY BEFORE THE NEXT
          // SCENE CHANGE.** Sequencer 4.2.3 throws when an effect is destroyed
          // while it is still initialising, and `canvasTearDown` destroys every
          // visible effect; a page error fails the whole smoke run.
          try {
            // EVERY key this system owns, cues included: a cue section is in
            // the manager too, and a scene torn down over one is the same
            // vendor fault as a loop. **Past initialisation first** - see
            // `drawn` above; ending one mid-`_initialize` is the fault itself.
            // The pause is for the gap between `play()` and the manager's own
            // insert: an effect not yet IN the manager is not yet watched for.
            await new Promise(r => setTimeout(r, 250));
            await allDrawn();
            globalThis.Sequencer?.EffectManager?.endEffects?.({ name: "azeroth-rpg:*" }, false);
            await until(() => ours().length === 0, "the manager to empty", 10000).catch(() => {});
          } catch { /* Sequencer is not running; nothing to clear */ }
          api().director.setPlayer(recorder);
        }
      }

      /** Sustain a spell on a target and reconcile, returning the loop. */
      async function sustainedLoop(name, targets) {
        const card = await cast(name, 18, targets);
        assert.isTrue(card.flags["azeroth-rpg"].success, `${name} did not land`);
        const spell = caster.items.find(i => i.name === name);
        await until(() => (caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.spellId === spell.id), `the ${name} Sustain`);
        const wanted = api().director.reconcile();
        const loop = wanted.find(l => l.identifier === spell.system.identifier) ?? null;
        assert.ok(loop, `${name} implied no loop: ${wanted.map(l => l.identifier)}`);
        return { card, spell, loop };
      }

      it("every asset the table ships is an exact leaf of the live Sequencer database", function () {
        this.timeout(60000);
        const db = globalThis.Sequencer?.Database;
        assert.ok(db, "Sequencer's database is not there");
        const running = new Set(librariesOn());
        const checked = [];
        const missing = [];
        for (const key of allAssetKeys()) {
          const library = libraryOf(key);
          // A key whose module is off has nothing to resolve against; the
          // library gate drops its step, and that is tested above.
          if (!library || !running.has(library)) continue;
          checked.push(key);
          // **A LEAF IS A KEY WITH NOTHING NAMED UNDER IT**, and
          // `getPathsUnder` is the live database's own answer to that
          // question: it strips an array suffix and a DISTANCE BUCKET and
          // returns the next `.`-segment beneath the path (sequencer.js 4.2.3
          // L6812-6836), so a real leaf - including a bucketed one like
          // `jb2a.sword.melee.01.white`, whose children are `05ft`…`90ft` -
          // answers with an EMPTY list, and a branch answers `["01", "02"]`.
          // It is the same rule `tools/animation/snapshot.mjs` applied in Node,
          // asked of the running client.
          //
          // `getEntry` cannot do this. It looks for an exact `dbPath` and,
          // failing that, falls back to `dbPath.startsWith(key)` (L6761-6781),
          // so a branch resolves to the array of its children or to the single
          // child where it has one; `Array.isArray(entry)` is precisely that
          // branch case rather than a healthy one, which is what the first
          // version of this test accepted. Comparing `entry.dbPath` to the key
          // instead refuses all 55 bucketed leaves in the table, because the
          // entry it hands back for one is the range find beneath it.
          let ok = false;
          try {
            ok = db.entryExists(key) && (db.getPathsUnder(key) || []).length === 0;
          } catch {
            ok = false;
          }
          if (!ok) missing.push(key);
        }
        assert.isAbove(checked.length, 100, "almost nothing was checked; a library must be off");
        assert.deepEqual(missing, [], `the live database has no leaf for: ${missing.join(", ")}`);
      });

      it("Immolate's loop stands in the manager while the Sustain is held, and leaves when it is dropped", async function () {
        this.timeout(180000);
        await withRealPlayer(async () => {
          const { spell, loop } = await sustainedLoop("Immolate", [token.alpha]);
          assert.equal(loop.binding, "sustain-target", "Immolate is not bound to what it burns");
          assert.deepEqual(loop.anchors, [token.alpha.id], "the flames are not on the creature that was hit");
          await drawn(loop.key, loop.layers.length);

          await endSustain({ actor: caster, spellId: spell.id });
          api().director.reconcile();
          await until(() => playing(loop.key).length === 0, "the flames to go out when the Sustain is dropped");
        });
      });

      it("Lightning Shield's three charges stand while the effect does, and leave when it is deleted", async function () {
        this.timeout(180000);
        await withRealPlayer(async () => {
          const card = await cast("Lightning Shield", 18, []);
          assert.isTrue(card.flags["azeroth-rpg"].success);
          const apply = cardBox(card).querySelector('[data-action="applySpellEffect"][data-self]');
          assert.ok(apply, "Lightning Shield's card carries no Apply for the caster");
          await CARD_ACTIONS.applySpellEffect(apply, card);
          const cast0 = card.flags["azeroth-rpg"].cast;
          const laid = await until(() => caster.effects.find(e => e.getFlag("azeroth-rpg", "cast") === cast0), "the laid effect");

          const wanted = api().director.reconcile();
          const loop = wanted.find(l => l.identifier === "lightning-shield") ?? null;
          assert.ok(loop, `Lightning Shield implied no loop: ${wanted.map(l => l.identifier)}`);
          assert.equal(loop.binding, "effect", "Lightning Shield does not follow the effect it laid");
          assert.lengthOf(loop.layers, 3, "the three charges are not three");
          await drawn(loop.key, 3);

          // THE END PATH NOTHING HAD DRIVEN LIVE: the effect is deleted and the
          // loop is no longer implied, so the reconciler ends it.
          await laid.delete();
          api().director.reconcile();
          await until(() => playing(loop.key).length === 0, "the charges to leave with the effect");
        });
      });

      it("a loop leaves when the creature it stands on is deleted", async function () {
        this.timeout(180000);
        await withRealPlayer(async () => {
          const spare = await makeNpc("Plagued Ghoul");
          await spare.update({ name: "ZZ Anim Spare" });
          // Inside Immolate's 60 feet of the caster at (500, 500) (O-288, D-893): it stood 85 off.
          const doc = await place(spare, { x: 1100, y: 500 });
          const { spell, loop } = await sustainedLoop("Immolate", [doc]);
          await drawn(loop.key, loop.layers.length);
          await doc.delete();
          api().director.reconcile();
          await until(() => playing(loop.key).length === 0, "the flames to leave with the creature");
          await endSustain({ actor: caster, spellId: spell.id }).catch(() => {});
        });
      });

      it("a GM's Stop ends a loop, it stays ended through a forced reconcile, and Resume brings it back", async function () {
        this.timeout(180000);
        await withRealPlayer(async () => {
          const { spell, loop } = await sustainedLoop("Immolate", [token.beta]);
          await drawn(loop.key, loop.layers.length);

          await setAnimationStops(withKey(animationStops(), loop.key, {
            by: game.user.name, userId: game.user.id, at: Date.now()
          }));
          api().director.reconcile();
          await until(() => playing(loop.key).length === 0, "the flames to stop on a GM's Stop");
          // A STOP HOLDS THROUGH A RECONCILE. The world still holds the Sustain,
          // so nothing but the setting is keeping it off the board.
          assert.lengthOf(api().director.reconcile().filter(l => l.key === loop.key), 0,
            "a stopped loop was wanted again by the next reconcile");
          await settle();
          assert.lengthOf(playing(loop.key), 0, "a stopped loop came back");

          await setAnimationStops({});
          api().director.reconcile();
          await drawn(loop.key, loop.layers.length);
          await endSustain({ actor: caster, spellId: spell.id });
        });
      });

      it("a loop survives a scene switch and is playing again on the way back", async function () {
        this.timeout(240000);
        await withRealPlayer(async () => {
          const { spell, loop } = await sustainedLoop("Immolate", [token.gamma]);
          await drawn(loop.key, loop.layers.length);
          // Let the effect finish initialising before the canvas goes: an
          // effect destroyed mid-initialisation is the vendor fault in D-729.
          await new Promise(r => setTimeout(r, 1200));

          await view(elsewhere);
          assert.lengthOf(playing(loop.key), 0, "the loop survived the canvas teardown as a picture");
          // The STATE survived: the Sustain is still held, on an actor whose
          // token is on another board.
          assert.isTrue((caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.spellId === spell.id),
            "the scene change dropped the Sustain");

          await view(scene);
          api().director.reconcile();
          await drawn(loop.key, loop.layers.length, 30000);
          await endSustain({ actor: caster, spellId: spell.id });
        });
      });

      it("the stop window opens from the tool, Stop and Resume work through its own controls, and it reads clean", async function () {
        this.timeout(240000);
        await withRealPlayer(async () => {
          const { spell, loop } = await sustainedLoop("Immolate", [token.alpha]);
          await drawn(loop.key, loop.layers.length);

          // THE TOOL'S OWN `onChange`, not a direct call: a `button: true` tool
          // runs it without becoming the active tool (D-730).
          const controls = { tokens: { tools: {} } };
          Hooks.callAll("getSceneControlButtons", controls);
          const tool = controls.tokens.tools.azerothAnimations;
          assert.ok(tool, "the Token controls carry no animation tool");
          assert.isTrue(tool.button, "the tool is not a button, so opening the window would release every selected token");
          await tool.onChange();
          const app = await until(() => [...foundry.applications.instances.values()].find(a => a.element?.id === "azeroth-animations" && a.rendered),
            "the stop window rendered");
          await settle();
          try {
            const row = app.element.querySelector(`[data-loop-key="${loop.key}"]`);
            assert.ok(row, `the window does not list the loop: ${[...app.element.querySelectorAll("[data-loop-key]")].map(r => r.dataset.loopKey)}`);
            assert.include(row.textContent, "Playing", "a playing row does not say so in words");

            const stop = row.querySelector('[data-action="animationStop"]');
            assert.ok(stop, "the GM's row carries no Stop");
            stop.click();
            await until(() => animationStops()[loop.key], "the Stop written to the world setting");
            await until(() => playing(loop.key).length === 0, "the flames to stop");
            await until(() => {
              const again = app.element.querySelector(`[data-loop-key="${loop.key}"]`);
              return again && /Stopped/.test(again.textContent);
            }, "the row to say it is stopped, in words");

            // LEGIBILITY, at a ceiling of nothing (D-608).
            const findings = checkText(app.element);
            assert.deepEqual(findings, [], `the stop window is not legible:\n${JSON.stringify(findings, null, 2)}`);

            const resume = app.element.querySelector(`[data-loop-key="${loop.key}"] [data-action="animationResume"]`);
            assert.ok(resume, "a stopped row carries no Resume");
            resume.click();
            await until(() => !animationStops()[loop.key], "the Stop cleared");
            await drawn(loop.key, loop.layers.length);
          } finally {
            await setAnimationStops({});
            await app.close().catch(() => {});
            await endSustain({ actor: caster, spellId: spell.id }).catch(() => {});
          }
        });
      });
    });
  });
}

/** Press the board at a canvas point, the way a player's click lands (D-723). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}
