/**
 * **STAGE 9: O-314 AND O-225, THROUGH THE REAL CONTROLS** (the lead, 2026-11-11, verbatim:
 * *"314 - yes if there is an animation for the effected area"*, *"225 - Just the animation should
 * fire in the targetted area."*).
 *
 * One batch, run alone with `QUENCH_BATCH=azeroth-rpg.stage9`. The animation player is replaced by
 * the recorder (`testing/animation-recorder.mjs`), so every cue is read back as the steps the layer
 * would have drawn, on the exact point or token it would have drawn them at.
 *
 * - **O-314**: Mindstatic (a Priest) and Heat Mirage (a Mage) are cast from the sheet; each picks its
 *   point before the payment through its own GM-reviewed door; the card's Place area lays the Region
 *   at THAT point with no second click; the area's cue plays at the Region's centre (and Mindstatic's
 *   boundary stands a loop while it is held); a second Priest's Dispel, aimed at nothing, picks a
 *   point inside the area, lists the cast and ends it once, and the Region goes with it.
 * - **O-225**: Mass Dispel's burst plays at the Region its card places, Cleanse's on the creature
 *   the card recorded, Everburn's fire at its placed ground; a failed Everburn plays nothing and
 *   offers no Place area. No mechanical door is built for any of the three.
 *
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, made, makeCharacter, makeNpc, settle, untilHook, warnings } from "./fixtures.mjs";
import { castFromSheet, chooser, pick, pressCard, pressUse, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { flagsOf, pickActive, pressBoard, regionOfCast, sleep, sustainOf } from "./quench-chronomancer-sweep-t12.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING } from "../settings.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { privateSpellKeyStatus } from "../effects/private-spell-records.mjs";
import { feetToPoint } from "../canvas/footprints.mjs";
import { feetWords } from "../rules/range.mjs";

const NS = "azeroth-rpg";
const FT = 20; // pixels a foot: 100 px a 5 ft square
const api = () => game.system.azeroth.animations;

/** A Utility dialog (`applications/thematic-utility-dialog.mjs`) answered by its own fields. */
async function answerUtility(values, ms = 30000) {
  const names = Object.keys(values);
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered
    && a.element?.querySelector(`[name="${names[0]}"]`) && a.element.querySelector('button[data-action="accept"]')), `the dialog asking ${names[0]}`, ms);
  for (const [name, value] of Object.entries(values)) {
    const input = app.element.querySelector(`[name="${name}"]`);
    if (!input) throw new Error(`the dialog draws no ${name}`);
    if (typeof value === "boolean") input.checked = value;
    else input.value = String(value);
  }
  app.element.querySelector('button[data-action="accept"]').click();
  await until(() => !app.rendered, `the dialog asking ${names[0]} to close`, ms);
}

/** Core's image picker, answered with a path through its own callback. */
async function answerFilePicker(path, ms = 30000) {
  const Picker = foundry.applications.apps.FilePicker.implementation;
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a instanceof Picker && a.rendered), "the image picker", ms);
  app.callback(path, app);
  await app.close();
}

/** A creature's token centre on the board. */
const centreOf = actor => ({ x: tokenOf(actor).center.x, y: tokenOf(actor).center.y });

/** A Region's circle: its centre and radius in pixels. */
const circleOf = region => {
  const s = region?.shapes?.[0] ?? {};
  return { x: s.x, y: s.y, radius: s.radius, type: s.type };
};

/** Mana to the brim. */
async function fillMana(actor) {
  const pool = actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
  if (pool && pool.value !== pool.max) await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
}

export function stage9Batch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Stage 9: Mindstatic and Heat Mirage place their area (O-314); Mass Dispel, Cleanse and Everburn play where they were aimed (O-225)", function () {
    const held = {};
    let recorder = null;
    let previousPlayer = null;
    let wasViewing = null;
    let hookId = null;
    let scene = null;
    const cast = {};

    before(async function () {
      this.timeout(600000);
      // The switches ON for this batch, as `azeroth-rpg.animation` turns them, and put back after.
      for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
        held[key] = game.settings.get(NS, key);
        await game.settings.set(NS, key, true);
      }
      held.photosensitive = game.settings.get("core", "photosensitiveMode");
      if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", false);
      // **A PRIVATE RECEIPT NEEDS THE GM'S KEY** (`effects/private-spell-records.mjs`). A fresh
      // browser holds none, and an envelope an earlier run left in the world (sealed by a key only
      // that run's browser held) refuses every new key: those are unreadable residue, removed as
      // `thematic-spell-heat-mirage-live.spec.mjs` removes them.
      const status = privateSpellKeyStatus();
      if (!status.localKey && status.encryptedRecords) {
        const stale = game.messages.contents.filter(m => m.flags?.[NS]?.privateSpellEnvelope && m.author?.isGM === true).map(m => m.id);
        if (stale.length) await ChatMessage.deleteDocuments(stale);
      }
      // Every receipt this batch's casts write is the batch's, and goes in `after`.
      hookId = Hooks.on("createChatMessage", m => { if (m.flags?.[NS]?.privateSpellEnvelope) made.push(m); });

      recorder = new (api().Recorder)();
      previousPlayer = api().director.setPlayer(recorder);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;

      cast.priest = await makeCharacter({ name: "ZZ S9 Priest", classes: [["Priest", 11]], abilities: { wis: 18 }, spells: ["Mindstatic", "Mass Dispel"] });
      cast.dispeller = await makeCharacter({ name: "ZZ S9 Dispeller", classes: [["Priest", 5]], abilities: { wis: 16 } });
      cast.mage = await makeCharacter({ name: "ZZ S9 Mage", classes: [["Mage", 9]], abilities: { int: 18 }, spells: ["Heat Mirage"] });
      cast.paladin = await makeCharacter({ name: "ZZ S9 Paladin", classes: [["Paladin", 5]], abilities: { wis: 16, cha: 16 }, spells: ["Cleanse"] });
      cast.warlock = await makeCharacter({ name: "ZZ S9 Warlock", classes: [["Warlock", 16]], abilities: { int: 18, cha: 18, con: 16 }, spells: ["Everburn"] });
      cast.ghoul = await makeNpc("Plagued Ghoul");
      scene = await sceneWith([
        { actor: cast.priest, x: 700, y: 900 },
        { actor: cast.dispeller, x: 1100, y: 1200 },
        { actor: cast.mage, x: 700, y: 1500 },
        { actor: cast.paladin, x: 2200, y: 900 },
        { actor: cast.ghoul, x: 2300, y: 900, side: "hostile" },
        { actor: cast.warlock, x: 2200, y: 1500 }
      ]);
      for (const a of [cast.priest, cast.dispeller, cast.mage, cast.paladin, cast.warlock]) await fillMana(a);
      const start = Date.now();
      while (!animationAvailability().ok && Date.now() - start < 20000) await sleep(100);
      assert.isTrue(animationAvailability().ok, `nothing may play here: ${animationAvailability().reason}`);
      canvas.tokens.releaseAll();
      await settle();
    });

    after(async function () {
      this.timeout(300000);
      const step = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | stage9 teardown (${what}): ${err?.message ?? err}`); } };
      await step("the hook", () => { if (hookId !== null) Hooks.off("createChatMessage", hookId); });
      await step("the player", () => { if (previousPlayer) api().director.setPlayer(previousPlayer); });
      await step("the targets", () => canvas?.tokens?.setTargets?.([]));
      await step("the switches", async () => {
        for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) await game.settings.set(NS, key, held[key]);
        if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", true);
      });
      await step("the Sustains", async () => { for (const a of Object.values(cast)) if (a?.unsetFlag) await a.unsetFlag(NS, "sustaining"); });
      await step("the area work", () => drainAreaWork());
      await step("the scene", async () => {
        if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) await wasViewing.view();
      });
      await cleanup();
    });

    /** Press the card's Place area and answer the new Region, with no pick where the cast recorded a point. */
    async function placeRecorded(card) {
      const created = untilHook("createRegion", 30000).catch(() => null);
      const p = await pressCard(card, 'button[data-action="placeArea"]');
      try {
        const got = await created;
        // No second click was asked: the pick never armed.
        assert.isFalse(pickActive(), "Place area asked for a point the cast had already recorded");
        return got?.[0] ?? null;
      } finally { await p.release(); }
    }

    /** Press the card's Place area and click the board at `point`. */
    async function placeAt(card, point) {
      const created = untilHook("createRegion", 30000).catch(() => null);
      const p = await pressCard(card, 'button[data-action="placeArea"]');
      try {
        await until(pickActive, "the area pick armed", 15000);
        pressBoard(point);
        const got = await created;
        return got?.[0] ?? null;
      } finally { await p.release(); }
    }

    /** The one region cue for a spell, once it has played. */
    async function regionCue(identifier) {
      await until(() => recorder.cuesFor("region", identifier).length >= 1,
        `${identifier}'s region cue (skips: ${recorder.skips.map(s => s.skip).join(", ")})`, 20000);
      const cues = recorder.cuesFor("region", identifier);
      assert.lengthOf(cues, 1, `${identifier} played its area cue more than once`);
      return cues[0].steps.filter(s => s.kind === "effect");
    }

    /** Dispel, aimed at nothing, through the sheet: the point picked inside the area, the cast listed and ended once. */
    async function dispelTheArea(caster, spellItem, region, point, name) {
      let deletes = 0;
      const watch = Hooks.on("deleteRegion", r => { if (r.id === region.id) deletes += 1; });
      try {
        const manaBefore = cast.dispeller.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value;
        const { feature, card } = await pressUse(cast.dispeller, "Dispel", [], 18);
        await until(pickActive, "Dispel's point pick armed", 15000);
        pressBoard(point);
        const app = await chooser(feature);
        const text = app.element.textContent.replace(/\s+/g, " ");
        assert.include(text, `${name}:`, `the chooser lists ${name} through the area itself`);
        await pick(app, name);
        assert.ok(await card, "the Dispel posted its card");
        await until(() => !sustainOf(caster, spellItem), `${name}'s Sustain ends`, 20000);
        await until(() => !scene.regions.has(region.id), `${name}'s Region deleted`, 20000);
        await sleep(1500);
        assert.equal(deletes, 1, `${name}'s Region was deleted exactly once`);
        assert.equal(cast.dispeller.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value, manaBefore - 4, "the Dispel cost its 4 Mana, once");
      } finally { Hooks.off("deleteRegion", watch); }
    }

    it("O-314 MINDSTATIC: the point picked at the cast is where Place area lays its 15 ft Region, its cue plays there and its boundary stands; Dispel at the area ends it once", async function () {
      this.timeout(600000);
      const c = cast.priest;
      const spell = c.items.find(i => i.name === "Mindstatic");
      const aim = { x: centreOf(c).x + 20 * FT, y: centreOf(c).y };
      recorder.reset();
      const pending = castFromSheet(c, "Mindstatic", { face: 18, ms: 90000 });
      await until(pickActive, "Mindstatic's point pick armed", 30000);
      pressBoard(aim);
      await answerUtility({ stationary: true, placement: true });
      const card = await pending;
      assert.ok(card, "Mindstatic posted its card");
      assert.isTrue(flagsOf(card).success, "the Casting Test went off");
      const at = flagsOf(card).areaAt;
      assert.equal(at?.sceneId, scene.id, "the card records the scene the point was picked on");
      assert.closeTo(at.x, aim.x, 1, "the card records the point picked");
      assert.closeTo(at.y, aim.y, 1);
      await until(() => sustainOf(c, spell), "the Priest sustains Mindstatic");
      // Silent at the cast: an area plays where it is placed.
      assert.lengthOf(recorder.cuesFor("cast", "mindstatic"), 0, "Mindstatic played a cue at the cast");
      const region = await placeRecorded(card);
      assert.ok(region, "Place area laid no Region");
      const shape = circleOf(region);
      assert.equal(shape.type, "circle");
      assert.closeTo(shape.x, at.x, 1, "the Region is not at the point the cast recorded");
      assert.closeTo(shape.y, at.y, 1);
      assert.closeTo(shape.radius, 15 * FT, 1, "the Region is not 07's 15 ft radius");
      assert.isTrue(region.flags[NS].sustained, "the Region records the Sustained cast");
      assert.equal(region.flags[NS].cast, flagsOf(card).cast);
      const [pulse] = await regionCue("mindstatic");
      assert.equal(pulse.asset, "jb2a.template_circle.out_pulse.01.burst.bluewhite");
      assert.closeTo(pulse.at.x, at.x, 1, "the cue did not play at the area's centre");
      assert.closeTo(pulse.at.y, at.y, 1);
      assert.closeTo(pulse.size, 30 * FT, 1, "the cue is not sized to the area");
      const loopKey = await until(() => [...recorder.activeLoops().keys()].find(k => k.includes(":sustain-region:") && k.includes(flagsOf(card).cast)),
        "Mindstatic's boundary loop standing", 20000);
      await dispelTheArea(c, spell, region, aim, "Mindstatic");
      await until(() => !recorder.isPlaying(loopKey), "the boundary loop ended with the Sustain", 20000);
    });

    it("stage 11 (D-906): a Mindstatic point past its 30 ft Range is refused at its pick with nothing spent, and a recorded point past it is refused at Place area with nothing laid", async function () {
      this.timeout(300000);
      const c = cast.priest;
      const spell = c.items.find(i => i.name === "Mindstatic");
      await fillMana(c);
      const mana = () => c.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value;
      const manaBefore = mana();
      const far = { x: centreOf(c).x + 60 * FT, y: centreOf(c).y };
      const words = game.i18n.format("AZEROTH.Range.PointRefused", { name: "Mindstatic", distance: feetWords(feetToPoint(tokenOf(c), far)), feet: 30 });
      // At the pick, before the payment: the click is refused in the range door's words and the
      // pick waits on; cancelled, the cast posts nothing and spends nothing.
      let pending = null;
      const said = await warnings(async () => {
        pending = castFromSheet(c, "Mindstatic", { face: 18, ms: 20000 });
        await until(pickActive, "Mindstatic's point pick armed", 30000);
        pressBoard(far);
        await sleep(800);
        assert.isTrue(pickActive(), "the pick waits on after a point past the Range");
        game.system.azeroth.canvas.cancelPick();
      });
      assert.include(said, words, `refused in words: ${JSON.stringify(said)}`);
      assert.isNull(await pending, "no card: the cast was not made");
      assert.equal(mana(), manaBefore, "no Mana spent");
      assert.notOk(sustainOf(c, spell), "nothing sustained");
      // At Place area, a point a cast recorded past the Range: refused, no Region laid.
      const { placeItemArea } = await import("../canvas/place.mjs");
      const { spellPointAccept } = await import("../canvas/range.mjs");
      const regions = scene.regions.size;
      let laid = "unset";
      const placed = await warnings(async () => {
        laid = await placeItemArea({ item: spell, actor: c, token: tokenOf(c), guessToken: false,
          atPoint: { sceneId: scene.id, x: far.x, y: far.y }, accept: spellPointAccept(tokenOf(c), spell) });
      });
      assert.isNull(laid, "Place area laid nothing at a recorded point past the Range");
      assert.include(placed, words, `refused in the same words: ${JSON.stringify(placed)}`);
      assert.equal(scene.regions.size, regions, "no Region on the scene");
    });

    it("O-314 HEAT MIRAGE: the anchor picked at the cast is where Place area lays its 5 ft Region beside the image's tile; it shimmers once there; Dispel at the area ends it and the image goes", async function () {
      this.timeout(600000);
      const c = cast.mage;
      const spell = c.items.find(i => i.name === "Heat Mirage");
      const aim = { x: centreOf(c).x + 30 * FT, y: centreOf(c).y };
      recorder.reset();
      const pending = castFromSheet(c, "Heat Mirage", { face: 18, ms: 120000 });
      await answerUtility({ objectLabel: "ZZ S9 wagon by the road", imageDescription: "A stationary red wagon" });
      await until(pickActive, "Heat Mirage's anchor pick armed", 30000);
      pressBoard(aim);
      await answerUtility({ eligible: true, reach: true, anchorConfirmed: true });
      await answerFilePicker("icons/svg/fire.svg");
      const card = await pending;
      assert.ok(card, "Heat Mirage posted its card");
      assert.isTrue(flagsOf(card).success, "the Casting Test went off");
      const at = flagsOf(card).areaAt;
      assert.equal(at?.sceneId, scene.id);
      assert.closeTo(at.x, aim.x, 1, "the card records the anchor picked");
      assert.closeTo(at.y, aim.y, 1);
      await until(() => sustainOf(c, spell), "the Mage sustains Heat Mirage");
      const tile = await until(() => scene.tiles.contents.find(t => t.flags?.[NS]?.heatMirageTicket), "the image's tile laid", 30000);
      assert.lengthOf(recorder.cuesFor("cast", "heat-mirage"), 0, "Heat Mirage played a cue at the cast");
      const region = await placeRecorded(card);
      assert.ok(region, "Place area laid no Region");
      const shape = circleOf(region);
      assert.closeTo(shape.x, at.x, 1, "the Region is not at the anchor");
      assert.closeTo(shape.y, at.y, 1);
      assert.closeTo(shape.radius, 5 * FT, 1, "the Region is not 07's 5 ft radius");
      assert.closeTo(tile.x + tile.width / 2, shape.x, 1, "the image and its Region share one centre");
      assert.closeTo(tile.y + tile.height / 2, shape.y, 1);
      const [shimmer] = await regionCue("heat-mirage");
      assert.equal(shimmer.asset, "jb2a.template_circle.aura.04.outward.001.complete.combined.refraction");
      assert.closeTo(shimmer.at.x, at.x, 1, "the shimmer did not play at the image");
      assert.closeTo(shimmer.at.y, at.y, 1);
      assert.closeTo(shimmer.size, 10 * FT, 1);
      await sleep(1500);
      assert.isUndefined([...recorder.activeLoops().keys()].find(k => k.includes(flagsOf(card).cast)), "a loop stands on the illusion");
      await dispelTheArea(c, spell, region, aim, "Heat Mirage");
      await until(() => !scene.tiles.has(tile.id), "the image's tile removed with the Sustain", 30000);
    });

    it("O-225 MASS DISPEL: nothing at the cast; its burst plays at the Region the card places, sized to its 20 ft radius", async function () {
      this.timeout(300000);
      const c = cast.priest;
      await fillMana(c);
      recorder.reset();
      const card = await castFromSheet(c, "Mass Dispel", { face: 18 });
      assert.ok(card, "Mass Dispel posted its card");
      assert.isTrue(flagsOf(card).success);
      await sleep(1000);
      assert.lengthOf(recorder.cuesFor("cast", "mass-dispel"), 0, "Mass Dispel played at the cast");
      const aim = { x: centreOf(c).x + 40 * FT, y: centreOf(c).y + 10 * FT };
      const region = await placeAt(card, aim);
      assert.ok(region, "Place area laid no Region");
      const [burst] = await regionCue("mass-dispel");
      assert.closeTo(burst.at.x, aim.x, 1, "the burst did not play at the targeted area");
      assert.closeTo(burst.at.y, aim.y, 1);
      assert.closeTo(burst.size, 40 * FT, 1, "the burst is not the area's 40 feet across");
      assert.notEqual(burst.on, tokenOf(c).id, "the burst played on the caster");
      await region.delete();
    });

    it("O-225 CLEANSE: on the one creature the card recorded, never the caster", async function () {
      this.timeout(300000);
      const c = cast.paladin;
      const target = tokenOf(cast.ghoul);
      // Cleanse is D12's cure door (`effects/cures.mjs#DOOR_CURES`) and refuses a creature with
      // nothing to end before anything is paid: the ghoul bleeds.
      await cast.ghoul.toggleStatusEffect("bleeding", { active: true });
      await until(() => cast.ghoul.statuses.has("bleeding"), "the ghoul bleeding");
      const spell = c.items.find(i => i.name === "Cleanse");
      recorder.reset();
      let card = null;
      const said = await warnings(async () => {
        const pending = castFromSheet(c, "Cleanse", { face: 18, targets: [target] });
        // Where the cure leaves a choice, the one chooser asks it before the payment.
        const app = await chooser(spell, 6000).catch(() => null);
        if (app) await pick(app, "Bleeding");
        card = await pending;
      });
      assert.ok(card, `Cleanse posted its card: ${JSON.stringify(said)}`);
      assert.isTrue(flagsOf(card).success);
      await until(() => recorder.cuesFor("cast", "cleanse").length >= 1, `Cleanse's cue (skips: ${recorder.skips.map(s => s.skip).join(", ")})`, 20000);
      const steps = recorder.cuesFor("cast", "cleanse")[0].steps.filter(s => s.kind === "effect");
      assert.deepEqual(steps.map(s => s.on), [target.id], "Cleanse did not play on the creature targeted");
      assert.closeTo(steps[0].at.x, target.center.x, 1);
      assert.closeTo(steps[0].at.y, target.center.y, 1);
    });

    it("O-225 EVERBURN: nothing at the cast; its fire plays at the ground the card places, sized to its 10 ft radius; a failed cast plays nothing and places nothing", async function () {
      this.timeout(300000);
      const c = cast.warlock;
      await fillMana(c);
      recorder.reset();
      // A tier 4 spell is once a rest (07 §4, D-882) and a failed cast spends the use, so the failure
      // is a second warlock's, off the board: a card with no token records no point either way.
      const other = await makeCharacter({ name: "ZZ S9 Warlock Fails", classes: [["Warlock", 16]], abilities: { int: 18, cha: 18, con: 16 }, spells: ["Everburn"] });
      await fillMana(other);
      let failed = null;
      const refusedFirst = await warnings(async () => { failed = await castFromSheet(other, "Everburn", { face: 1 }); });
      assert.ok(failed, `a failed Everburn posted its card: ${JSON.stringify(refusedFirst)}`);
      assert.isFalse(flagsOf(failed).success, "a natural 1 failed the Casting Test");
      await sleep(1000);
      assert.lengthOf(recorder.cues, 0, "a failed Everburn drew something");
      assert.isNull(document.querySelector(`#chat [data-message-id="${failed.id}"] button[data-action="placeArea"]`), "a failed Everburn offers Place area");
      await fillMana(c);
      recorder.reset();
      let card = null;
      const refused = await warnings(async () => { card = await castFromSheet(c, "Everburn", { face: 18 }); });
      assert.ok(card, `Everburn posted its card: ${JSON.stringify(refused)}`);
      assert.isTrue(flagsOf(card).success);
      await sleep(1000);
      assert.lengthOf(recorder.cuesFor("cast", "everburn"), 0, "Everburn played at the caster");
      assert.include(recorder.skips.map(s => s.skip), "not-this-trigger", "the cast's refusal is the law's word");
      const aim = { x: centreOf(c).x + 20 * FT, y: centreOf(c).y };
      const region = await placeAt(card, aim);
      assert.ok(region, "Place area laid no Region");
      const [fire] = await regionCue("everburn");
      assert.equal(fire.asset, "jb2a.flames.02.orange");
      assert.closeTo(fire.at.x, aim.x, 1, "the fire did not play at the targeted ground");
      assert.closeTo(fire.at.y, aim.y, 1);
      assert.closeTo(fire.size, 20 * FT, 1, "the fire is not the ground's 20 feet across");
      assert.equal(regionOfCast(scene, card)?.id, region.id, "the Region records the cast");
    });
  });
}
