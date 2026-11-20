/**
 * **THE NECROMANCER, VERIFIED THROUGH THE REAL CONTROLS** (the Necromancer plan's Phase 7; the lead:
 * *"I need to make sure that all automations and animation/sounds are built and functional. Be sure
 * to check all talents, spells, features, etc"*). Two halves:
 *
 * - **What plays.** The recorder (`testing/animation-recorder.mjs`) stands in for the player, and
 *   every record is written by the door that writes it in play: a raise cast from the sheet's Cast,
 *   a raised Skeletal Archer's bow shot from its own sheet and landed by the card's Apply (whose
 *   death draws the Essence wisp and feeds a Warlock's Soul Harvest), Stitch Abomination's graft
 *   chooser answered and its space pressed on the board, Bone Armor's and Dark Ritual's Uses pressed
 *   on the sheet (each servant's collapse cued where it stood), Plague Cloud placed by the card's
 *   Place area, and Circle of the Damned and Grand Circle's move pressed on the board. Each cue's
 *   steps are read back, the sound step among them; each loop stands while its state does and ends
 *   when the state is deleted, with no code path of its own (D-729).
 * - **What the earlier batches reached around.** The Essence Long Rest exposure from the sheet's own
 *   Long Rest (the Phase 4a batch called `longRest()`), a Forsaken making none, and Grave Calling's
 *   two spells drawn on the Spells tab with their Cast.
 *
 * The circle and the Abomination's space are pressed on the 2D board here (`pickPoint`'s own door),
 * where the earlier batches used `setCirclePick` and `setStitchPick`, the board's stand-ins.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-verify`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, featureNamed, manaOf, pick, pressCard, pressUse, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castWith, npcAttacks, tick } from "./quench-necromancer-review.mjs";
import { hordeActorsOf } from "../effects/necromancer-horde.mjs";
import { circleOf } from "../effects/necromancer-talents.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { ESSENCE_GAIN_KEY } from "../rules/animation-records.mjs";
import { CIRCLE_KEY, COLLAPSE_KEY, GRAFT_KEY } from "../rules/necromancer-animations.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = () => game.system.azeroth.animations;
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const bondOf = actor => actor.getFlag(SCOPE, "bond") ?? null;
const entryOf = actor => bondOf(actor)?.entryName ?? actor.name;
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;
const NECROS = [];

/** Press the 2D board at a canvas point, as a browser does. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Wait for a pick to arm, then press the board at a point. */
async function pressBoardWhenArmed(point) {
  await until(pickActive, "the board pick armed", 15000);
  await settle();
  pressBoard(point);
}

/** A Necromancer at a level, Intelligence 16 and Constitution 14, its talents at ranks. */
async function necromancerWith(name, { level = 14, race = "Human", spells = [], ranks = {} } = {}) {
  const n = await makeCharacter({ name, classes: [["Necromancer", level]], race, spells, abilities: { int: 16, con: 14 } });
  NECROS.push(n);
  await until(() => essenceOf(n), "the Essence pool");
  await until(() => ["Raise Dead", "Animate Corpse"].every(s => n.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
  await n._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(n, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
    await until(() => talentNamed(n, talent)?.system?.taken === taken, `${talent} at rank ${taken}`);
  }
  return n;
}

async function bankEssence(actor, value) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === Math.min(value, pool.max), "Essence banked");
}

async function bankMana(actor, value = 999) {
  const pool = manaOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value: Math.min(value, pool.max) });
  await until(() => manaOf(actor).value === Math.min(value, pool.max), "Mana banked");
}

/** A bestiary creature named for the test, at a Health (its block's where none is named). */
async function creature(entry, name, health = null) {
  const npc = await makeNpc(entry);
  const update = { name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}` };
  if (health !== null) update["system.health.value"] = health;
  await npc.update(update);
  return npc;
}

/** Press a Use on the sheet, answer each chooser it opens in turn; the card, or null with the warnings. */
async function useWith(actor, featureName, steps = [], { ms = 30000 } = {}) {
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    const { feature, card } = await pressUse(actor, featureName, [], 15);
    for (const step of steps) {
      if (step.board) { await step.board(); continue; }
      const app = await chooser(feature, 15000).catch(err => { throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}`); });
      await step(app);
      await sleep(150);
    }
    const message = await Promise.race([card, sleep(ms).then(() => null)]);
    return { message, warned };
  } finally {
    ui.notifications.warn = original;
  }
}

/** The labels a chooser offers, as drawn. */
function offered(app) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) return [...select.options].map(o => o.textContent.trim());
  return [...app.element.querySelectorAll('input[name="choice"]')].map(b => b.closest("label")?.textContent?.trim() ?? "");
}

/** The sheet's own Long Rest, pressed with a die pinned; resolves once `done` holds. */
async function pressLongRest(actor, done, { face = null, what = "the Long Rest" } = {}) {
  const sheet = await openSheet(actor);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = face ? pinDie(face) : () => {};
  try {
    const control = await until(() => sheet.element.querySelector('[data-action="longRest"]'), "the Long Rest control");
    control.click();
    await until(done, what, 60000);
  } finally {
    unpin();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

const hordeOf = necro => hordeActorsOf(necro).sort((a, b) => (bondOf(a).since ?? 0) - (bondOf(b).since ?? 0));

export function necromancerVerifyBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Necromancer verified: what plays, through the real doors (the recorder)", function () {
    const held = {};
    let recorder = null;
    let previousPlayer = null;
    let restoreText = null;
    let necro = null;
    let lock = null;
    let kobold = null;
    let archer = null;

    /** Wait for the settle gate on the viewed board, and say which reason stood if it never opens. */
    async function untilAvailable(ms = 20000) {
      const start = Date.now();
      for (;;) {
        const state = animationAvailability();
        if (state.ok) return state;
        if (Date.now() - start > ms) throw new Error(`nothing may play here: ${state.reason}`);
        await sleep(100);
      }
    }
    /** The newest cue one trigger played for one key, waited for. */
    const cueOf = (trigger, key, what) => until(() => recorder.cuesFor(trigger, key).at(-1) ?? null, what, 20000);
    /** The loop keys of one identifier the recorder holds as playing. */
    const playingOf = key => [...recorder.activeLoops().keys()].filter(k => recorder.loops.some(l => l.key === k && l.loop?.identifier === key));
    /** Force a reconcile and wait for a loop of a key to stand, or to be gone. */
    async function loopStands(key, yes = true) {
      return until(() => {
        api().director.reconcile({ force: true });
        return yes ? playingOf(key).length > 0 : playingOf(key).length === 0;
      }, `${key}'s loop ${yes ? "standing" : "ended"}`, 20000);
    }
    /** A cue's step kinds, and the sound step's asset. */
    function heard(cue, what) {
      const kinds = new Set(cue.steps.map(s => s.kind));
      assert.isTrue(kinds.has("effect"), `${what}: a picture`);
      assert.isTrue(kinds.has("sound"), `${what}: a sound step`);
      const sound = cue.steps.find(s => s.kind === "sound");
      assert.match(String(sound.asset ?? ""), /^psfx\./, `${what}: the sound is a PSFX leaf (${sound.asset})`);
      return cue;
    }

    before(async function () {
      this.timeout(120000);
      for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
        held[key] = game.settings.get(SCOPE, key);
        await game.settings.set(SCOPE, key, true);
      }
      held.photosensitive = game.settings.get("core", "photosensitiveMode");
      if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", false);
      held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
      recorder = new (api().Recorder)();
      previousPlayer = api().director.setPlayer(recorder);
    });

    after(async function () {
      this.timeout(240000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | Necromancer verify teardown (${what}): ${err?.message ?? err}`); } };
      await restore("the pick", () => { if (pickActive()) game.system.azeroth.canvas.cancelPick(); });
      await restore("the player", () => { if (previousPlayer) api().director.setPlayer(previousPlayer); });
      await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
      await restore("the windows", async () => {
        for (const app of [...foundry.applications.instances.values()]) {
          const id = String(app.id ?? "");
          if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close();
        }
      });
      await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog));
      await restore("photosensitive mode", async () => { if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", true); });
      await restore("the switches", async () => {
        for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) await game.settings.set(SCOPE, key, held[key]);
      });
      await restore("the Sustains", async () => { for (const n of NECROS) await game.system.azeroth.workflows.endAllSustains?.({ actor: n }); });
      await restore("the raised dead", async () => {
        const owners = new Set(NECROS.map(n => n.uuid));
        for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete();
        for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete();
      });
      await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
      await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    it("sets up: a level 14 Necromancer beside a corpse, a Kobold at 1 Health 60 feet off, and a Warlock 15 feet from the Kobold", async function () {
      this.timeout(300000);
      necro = await necromancerWith("ZZ Verify Necro", {
        spells: ["Plague Cloud", "Stitch Abomination"],
        ranks: { "Skeletal Archery": 1, "Bone Armor": 1, "Circle of the Damned": 1, "Grand Circle": 2 }
      });
      lock = await makeCharacter({ name: "ZZ Verify Warlock", classes: [["Warlock", 14]], race: "Human" });
      await until(() => featureNamed(lock, "Soul Harvest"), "Soul Harvest granted");
      const body = await creature("Bandit", "Verify Corpse", 0);
      kobold = await creature("Kobold", "Verify Kobold", 1);
      await sceneWith([
        { actor: necro, x: 1000, y: 1000 },
        { actor: body, x: 1200, y: 1000, side: "hostile" },
        { actor: kobold, x: 2200, y: 1000, side: "hostile" },
        { actor: lock, x: 2500, y: 1000 }
      ]);
      await untilAvailable();
      assert.equal(essenceOf(necro).value, 0, "the Necromancer starts with no Essence");
      for (const f of ["Bone Armor", "Circle of the Damned", "Grand Circle", "Dark Ritual"]) assert.ok(featureNamed(necro, f), `${f} held`);
    });

    it("Raise Dead from the sheet's Cast: the circle at cast and the rising on every token it stood up, each with its sound; Deathly Vigor's shield rides the rising", async function () {
      this.timeout(180000);
      await bankMana(necro);
      recorder.reset();
      const card = await castWith(necro, "Raise Dead", { steps: [
        app => pick(app, "ZZ Verify Corpse"),
        async app => {
          const label = offered(app).find(l => /Skeletal Archer/.test(l));
          assert.ok(label, `Skeletal Archery offers an archer: ${offered(app).join(" / ")}`);
          await pick(app, label);
        }
      ] });
      assert.ok(card?.flags[SCOPE].success, "Raise Dead was cast");
      const risen = card.flags[SCOPE].risen?.[0]?.tokenIds ?? [];
      assert.lengthOf(risen, 2, "the card records the two it stood up");
      const cast = heard(await cueOf("cast", "raise-dead", "Raise Dead's cast cue"), "Raise Dead at cast");
      assert.equal(cast.steps.find(s => s.kind === "effect").on, tokenOf(necro).id, "the circle at the Necromancer");
      const rise = heard(await cueOf("rise", "raise-dead", "Raise Dead's rising"), "Raise Dead's rising");
      const on = new Set(rise.steps.filter(s => s.kind === "effect").map(s => s.on));
      assert.sameMembers([...on], risen, "the rising on every token the raise stood up, and nowhere else");
      heard(await cueOf("rise", "deathly-vigor", "Deathly Vigor's shield"), "Deathly Vigor");
      archer = hordeOf(necro).find(x => entryOf(x) === "Skeletal Archer");
      assert.ok(archer, "a Skeletal Archer rose");
    });

    it("the Skeletal Archer's Bone bow from its own sheet: the arrow and its sound; its kill draws the Essence wisp from the corpse and gives the Warlock Soul Harvest's 2 Mana", async function () {
      this.timeout(180000);
      await bankMana(lock, 3);
      recorder.reset();
      const attack = await npcAttacks(archer, "Bone bow", kobold, { face: 19 });
      assert.ok(attack, "the bow posted its attack card");
      const shot = await until(() => recorder.cues.find(c => c.record?.kind === "attack" && c.record?.source?.tokenId === tokenOf(archer).id) ?? null, "the bow's cue", 20000);
      heard(shot, "the Bone bow");
      assert.isTrue(shot.record.hit === true, "the shot hit");
      assert.equal(shot.record.strike?.form, "arrow", "the bow shoots an arrow");
      const { release } = await pressCard(attack, '[data-action="applyDamage"]');
      try {
        await until(() => kobold.system.health.value === 0, "the Kobold dropped by the card's Apply");
      } finally { await release(); }
      // The death watch: 1 Essence for a living enemy 60 feet off, on the holder's own pool queue.
      await until(() => essenceOf(necro).value === 1, "1 Essence from the Kobold's death");
      const wisp = heard(await cueOf("use", ESSENCE_GAIN_KEY, "the Essence wisp"), "the Essence wisp");
      assert.equal(wisp.record.source?.tokenId, tokenOf(necro).id, "drawn to the Necromancer");
      assert.equal(wisp.record.targets?.[0]?.tokenId, tokenOf(kobold).id, "from the corpse");
      const strand = wisp.steps.find(s => s.asset === "jb2a.ranged.04.projectile.01.green");
      assert.equal(strand?.fromToken, tokenOf(kobold).id, "the wisp leaves the corpse");
      assert.equal(strand?.toToken, tokenOf(necro).id, "and reaches the Necromancer");
      await until(() => manaOf(lock).value === 5, "Soul Harvest: the Warlock 15 feet from the death gains 2 Mana");
      // Soul Harvest's own wisp (this run's fix: it gave its Mana with no picture and no sound).
      const harvest = heard(await cueOf("use", "soul-harvest", "Soul Harvest's wisp"), "Soul Harvest");
      assert.equal(harvest.record.source?.tokenId, tokenOf(lock).id, "drawn to the Warlock");
      assert.equal(harvest.record.targets?.[0]?.tokenId, tokenOf(kobold).id, "from the corpse");
    });

    it("Stitch Abomination: the graft chooser answered, the space pressed on the board, the stitching cued on the creature that rose", async function () {
      this.timeout(180000);
      await bankMana(necro);
      assert.equal(essenceOf(necro).value, 1, "the Kobold's Essence banked for the graft");
      recorder.reset();
      const card = await castWith(necro, "Stitch Abomination", { steps: [async app => {
        const labels = offered(app);
        assert.ok(labels.some(l => l.startsWith("Meat Hook")), `the graft menu: ${labels.join(" / ")}`);
        // Answering the chooser closes it; the board pick arms after it.
        const space = pressBoardWhenArmed({ x: 1050, y: 1450 });
        await tick(app, ["Meat Hook"]);
        await space;
      }] });
      assert.ok(card?.flags[SCOPE].success, "Stitch Abomination was cast");
      const abom = await until(() => hordeOf(necro).find(x => entryOf(x) === "Abomination"), "an Abomination in the horde");
      assert.deepEqual(abom.getFlag(SCOPE, "grafts"), ["meatHook"], "with its graft");
      assert.equal(essenceOf(necro).value, 0, "the graft's Essence spent");
      const doc = await until(() => tokenOf(abom)?.document, "the Abomination's token");
      assert.isBelow(Math.hypot(doc.x + doc.width * 50 - 1050, doc.y + doc.height * 50 - 1450), 160, "standing where the board was pressed");
      const rise = heard(await cueOf("rise", "stitch-abomination", "the Abomination's rising"), "Stitch Abomination's rising");
      assert.isTrue(rise.steps.filter(s => s.kind === "effect").every(s => s.on === doc.id), "on the Abomination's token");
      heard(await cueOf("rise", GRAFT_KEY, "the graft stitching"), "the graft stitching");
    });

    it("Bone Armor from the sheet (a talent): the plates at the Necromancer, and the skeleton's collapse cued where it stood", async function () {
      this.timeout(120000);
      const skeleton = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton");
      assert.ok(skeleton, "a Risen Skeleton stands");
      const name = tokenOf(skeleton).document.name;
      const at = { x: tokenOf(skeleton).center.x, y: tokenOf(skeleton).center.y };
      recorder.reset();
      const { message, warned } = await useWith(necro, "Bone Armor", [app => pick(app, name)]);
      assert.ok(message, `Bone Armor posted; warnings: ${warned.join(" | ")}`);
      const plates = heard(await cueOf("use", "bone-armor", "Bone Armor's cue"), "Bone Armor");
      assert.equal(plates.steps.find(s => s.kind === "effect").on, tokenOf(necro).id, "at the Necromancer");
      await until(() => !game.actors.has(skeleton.id), "the skeleton collapsed");
      const dust = heard(await cueOf("use", COLLAPSE_KEY, "the collapse"), "the collapse");
      const where = dust.steps.find(s => s.kind === "effect").at;
      assert.isBelow(Math.hypot(where.x - at.x, where.y - at.y), 2, "the bone dust where the body stood");
    });

    it("Dark Ritual from the sheet (a feature): the Mana drawn in at the Necromancer, and the archer's collapse cued", async function () {
      this.timeout(120000);
      await bankMana(necro, 1);
      recorder.reset();
      const feature = featureNamed(necro, "Dark Ritual");
      const { message, warned } = await useWith(necro, "Dark Ritual", [app => pick(app, tokenOf(archer).document.name)]);
      assert.ok(message, `Dark Ritual posted; warnings: ${warned.join(" | ")}`);
      assert.equal(message.flags[SCOPE].featureKey, "dark-ritual", "under its key");
      const inflow = heard(await cueOf("use", "dark-ritual", "Dark Ritual's cue"), "Dark Ritual");
      assert.equal(inflow.steps.find(s => s.kind === "effect").on, tokenOf(necro).id, "at the Necromancer");
      await until(() => !game.actors.has(archer.id), "the archer collapsed");
      heard(await cueOf("use", COLLAPSE_KEY, "the archer's collapse"), "the archer's collapse");
      assert.isAbove(manaOf(necro).value, 1, "Mana regained");
      assert.equal(feature.system.uses?.value ?? 0, 0, "once per encounter");
    });

    it("Plague Cloud (an area spell): the card's Place area cues the fog on its Region and stands it while the Sustain does; taking the area off ends both", async function () {
      this.timeout(180000);
      await bankMana(necro);
      recorder.reset();
      const card = await castWith(necro, "Plague Cloud", {});
      assert.ok(card?.flags[SCOPE].success, "Plague Cloud was cast");
      const created = untilHook("createRegion", 30000);
      const { release } = await pressCard(card, 'button[data-action="placeArea"]');
      let region = null;
      try {
        await pressBoardWhenArmed({ x: 1500, y: 1700 });
        [region] = await created;
      } finally { await release(); }
      assert.ok(region, "the fog's Region laid");
      const fog = heard(await cueOf("region", "plague-cloud", "the fog's cue"), "Plague Cloud's fog");
      assert.isTrue(fog.steps.some(s => s.kind === "effect" && s.asset === "jb2a.fog_cloud.01.white"), "the fog itself");
      await loopStands("plague-cloud");
      assert.isTrue((necro.getFlag(SCOPE, "sustaining") ?? []).some(e => e?.name === "Plague Cloud"), "the Sustain is held");
      const [key] = playingOf("plague-cloud");
      await region.delete();
      await loopStands("plague-cloud", false);
      assert.include(recorder.ended, key, "the fog's loop ended with its Region");
      await until(() => !(necro.getFlag(SCOPE, "sustaining") ?? []).some(e => e?.name === "Plague Cloud"), "taking the area off ends its Sustain (D-760)");
    });

    it("Circle of the Damned pressed on the board: the circle cued as it is drawn and turning while it stands; Grand Circle's move cued, the loop following; deleting the Region ends it", async function () {
      this.timeout(180000);
      await bankEssence(necro, 0);
      recorder.reset();
      const placed = await useWith(necro, "Circle of the Damned", [{ board: () => pressBoardWhenArmed({ x: 900, y: 1150 }) }]);
      assert.ok(placed.message, `the circle's Use posted; warnings: ${placed.warned.join(" | ")}`);
      const region = await until(() => circleOf(necro), "the circle's Region");
      assert.equal(region.flags[SCOPE].featureKey, CIRCLE_KEY, "its key");
      assert.isBelow(Math.hypot((region.shapes[0].x ?? 0) - 900, (region.shapes[0].y ?? 0) - 1150), 2, "centred where the board was pressed");
      heard(await cueOf("region", CIRCLE_KEY, "the circle's cue"), "the circle as it is drawn");
      await loopStands(CIRCLE_KEY);
      const moved = await useWith(necro, "Grand Circle", [{ board: () => pressBoardWhenArmed({ x: 2000, y: 1800 }) }]);
      assert.ok(moved.message, `Grand Circle's move posted; warnings: ${moved.warned.join(" | ")}`);
      heard(await cueOf("use", "grand-circle", "Grand Circle's cue"), "Grand Circle's move");
      await until(() => {
        const shape = circleOf(necro)?.shapes?.[0];
        return shape && Math.abs((shape.x ?? 0) - 2000) < 2 && Math.abs((shape.y ?? 0) - 1800) < 2;
      }, "the circle moved to the point pressed");
      await loopStands(CIRCLE_KEY);
      const latest = recorder.loops.filter(l => l.loop?.identifier === CIRCLE_KEY).at(-1);
      assert.ok(latest, "the circle's loop is played");
      await circleOf(necro).delete();
      await loopStands(CIRCLE_KEY, false);
    });
  });

  describe("The Necromancer verified: the controls the earlier batches reached around", function () {
    let restoreText = null;
    let restoreDialog = null;
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(120000);
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    it("the sheet's Long Rest, holding 2 Essence: a Body Test at DC 14 on the Undeath track, a failure adds 1 Undeath, and the Essence stays", async function () {
      this.timeout(120000);
      const n = await necromancerWith("ZZ Verify Rest", { level: 5 });
      await bankEssence(n, 2);
      const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === n.id && m.flags?.[SCOPE]?.kind === "corruption" && m.flags[SCOPE].occasion === "essence")
        .then(([m]) => { made.push(m); return m; });
      let card = null;
      await pressLongRest(n, () => { card ??= game.messages.contents.find(m => m.speaker?.actor === n.id && m.flags?.[SCOPE]?.occasion === "essence") ?? null; return Boolean(card); }, { face: 1, what: "the exposure card" });
      card = await posted;
      assert.equal(card.rolls[0].options.dc, 14, "DC 12 plus the 2 Essence held");
      assert.equal(card.flags[SCOPE].track, "undeath", "on the Undeath track");
      await until(() => (n.system.corruption?.undeath ?? 0) === 1, "the failure adds 1 Undeath");
      assert.equal(essenceOf(n).value, 2, "Essence is kept until spent");
    });

    it("the sheet's Long Rest for a Forsaken Necromancer holding 3 Essence: no Test and no Undeath", async function () {
      this.timeout(120000);
      const n = await necromancerWith("ZZ Verify Forsaken", { level: 5, race: "Forsaken" });
      await bankEssence(n, 3);
      let tested = false;
      const id = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === n.id && m.flags?.[SCOPE]?.occasion === "essence") tested = true; });
      const before = game.time.worldTime;
      try {
        await pressLongRest(n, () => game.messages.contents.some(m => m.speaker?.actor === n.id && m.flags?.[SCOPE]?.kind === "rest") || game.time.worldTime > before, { what: "the rest to finish" });
        await sleep(2500);
      } finally {
        Hooks.off("createChatMessage", id);
      }
      assert.isFalse(tested, "no exposure card for a Forsaken");
      assert.equal(n.system.corruption?.undeath ?? 0, 0, "and no Undeath");
    });

    it("Grave Calling: a level 1 Necromancer made with other spells draws Raise Dead and Animate Corpse on its Spells tab, each with its Cast", async function () {
      this.timeout(60000);
      const n = await necromancerWith("ZZ Verify Caller", { level: 1, spells: ["Bone Shards"] });
      const sheet = await openSheet(n);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        for (const name of ["Raise Dead", "Animate Corpse", "Bone Shards"]) {
          const spell = n.items.find(i => i.type === "spell" && i.name === name);
          assert.ok(spell, `${name} known`);
          assert.ok(sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`), `${name} draws its Cast`);
        }
        const granted = ["Raise Dead", "Animate Corpse"].map(s => n.items.find(i => i.type === "spell" && i.name === s));
        assert.isTrue(granted.every(s => s.getFlag(SCOPE, "spellFrom") === featureNamed(n, "Grave Calling")?.id), "both carried by the feature (its spellFrom), not by the count");
      } finally {
        await sheet.close();
      }
    });
  });
}
