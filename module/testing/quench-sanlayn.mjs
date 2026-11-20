/**
 * **THE SAN'LAYN, THROUGH THE REAL DOORS** (02 §5's thirteenth people, 08 §12's Blood vial; the
 * San'layn plan's C.4 item 3; D-1140 to D-1155).
 *
 * Every test presses what a player presses - the creator's `apply`, a race dropped on a sheet, the
 * sheet's Short Rest and Long Rest buttons and the window they open, the Combat tab's Use, the card's
 * Resist, a skill's roll dialog, the right-click menu's Fill with blood - and reads back the actor
 * and the card. The die is pinned through `fixtures.mjs#pinDie` wherever a Test decides anything.
 */

import { cleanup, dialogFor, fromPack, give, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, settle, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, BLOOD_LONG_REST_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { BLOOD_SINCE_REST_FLAG } from "../rules/rest.mjs";
import { fillWithBlood } from "../effects/blood.mjs";

const SANLAYN = "San'layn";
const SCOPE = "azeroth-rpg";

async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const gearNamed = (actor, name) => actor.items.find(i => i.type === "gear" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const restCards = actor => game.messages.filter(m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "rest");

/** A San'layn of a class, its eight racial talents landed, these taken. */
async function sanlayn(name, { cls = "Warrior", level = 3, taken = [], abilities = { con: 14, str: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], race: SANLAYN, abilities });
  await until(() => actor.items.filter(t => t.type === "talent" && t.system?.race === SANLAYN).length === 8, `${name}'s eight racial talents`);
  await until(() => featureNamed(actor, "Preserved Countenance"), `${name}'s Trait`);
  for (const t of taken) {
    const item = await until(() => talentNamed(actor, t), `${t} on ${name}`);
    await item.update({ "system.taken": 1 });
  }
  await until(() => actor.system.bloodFed === true, `${name} rests on blood`);
  return actor;
}

/** The rest card this press posts. */
async function restCardFrom(actor, fn) {
  const before = restCards(actor).length;
  await fn();
  await until(() => restCards(actor).length > before, `${actor.name}'s rest card`);
  const card = restCards(actor).at(-1);
  made.push(card);
  return card;
}

/** A scene with linked tokens, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ San'layn Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(tokenOf(p.actor))), "every token drawn");
  await settle();
  return scene;
}

/** No GM online, as a player's client sees it, for `fn` alone. */
async function withNoGM(fn) {
  const user = game.user;
  const users = game.users;
  Object.defineProperty(user, "isGM", { get: () => false, configurable: true });
  Object.defineProperty(users, "activeGM", { get: () => null, configurable: true });
  try { return await fn(); } finally {
    delete user.isGM;
    delete users.activeGM;
  }
}

export function sanlaynBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The San'layn (02 §5's thirteenth people; D-1140 to D-1155)", function () {
    const held = {};
    let wasViewing = null;

    before(async function () {
      this.timeout(60000);
      held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      held.blood = game.settings.get(SCOPE, BLOOD_LONG_REST_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      const race = await fromPack(PACK_FOR.race, SANLAYN).catch(() => null);
      assert.ok(race, "the races pack holds no San'layn: run packs:parse and packs:build");
    });

    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-rest-") || id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog);
      await game.settings.set(SCOPE, BLOOD_LONG_REST_SETTING, held.blood);
      await cleanup();
      if (wasViewing && game.scenes.has(wasViewing.id)) await wasViewing.view();
    });

    it("the creator makes a San'layn Warrior: no side asked of the race, Thalassian and the side's tongue, the Trait and the eight", async function () {
      this.timeout(120000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        const race = await fromPack(PACK_FOR.race, SANLAYN);
        const warrior = await fromPack(PACK_FOR.class, "Warrior");
        assert.deepEqual(race.system.classes, ["Warrior", "Rogue", "Warlock", "Death Knight", "Necromancer", "Sovereign"], "02 §3's row");
        await creator.setState({ race: race.uuid, cls: warrior.uuid, step: "race" });
        await settle();
        const strip = [...creator.element.querySelectorAll(".azeroth-creator-step")].map(b => b.dataset.step);
        assert.include(strip, "race");
        assert.notInclude(strip, "guise", "a San'layn walked the Mortal guise");
        const career = (await game.packs.get(PACK_FOR.career).getDocuments()).find(c => (c.system?.tier ?? 1) === 1);
        const racial = (race.system.talents ?? []).find(t => t.name === "Clean Feeder");
        const classTalent = (await game.packs.get(PACK_FOR.talent).getIndex({ fields: ["system.className", "system.tier", "system.identifier", "system.race", "system.legacy"] }))
          .find(t => t.system?.className === "Warrior" && (t.system?.tier ?? 1) === 1 && !t.system?.race && !t.system?.legacy);
        const result = await creator.apply({
          method: "array", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }, rolled: null,
          career: career.uuid, ranks: {}, racialTalent: racial?.name ?? null, classTalent: classTalent?.system?.identifier ?? null,
          spells: [], side: "horde", equipment: [], name: "ZZ San'layn Made", img: "icons/svg/mystery-man.svg"
        });
        assert.ok(result.ok, `the creator refused: ${JSON.stringify(result.reasons)}`);
        const actor = result.actor;
        made.push(actor);
        assert.equal(actor.raceItem?.name, SANLAYN);
        assert.includeMembers(actor.system.languages, ["thalassian", "orcish"], "Thalassian and the side's tongue");
        await until(() => featureNamed(actor, "Preserved Countenance"), "the Trait granted");
        assert.equal(actor.items.filter(t => t.type === "talent" && t.system?.race === SANLAYN).length, 8);
        assert.equal(talentNamed(actor, "Clean Feeder")?.system?.taken, 1, "the pick made in the creator");
        assert.isTrue(actor.system.bloodFed, "a San'layn rests on blood");
        assert.include(actor.system.conditionImmunities, "diseased", "immune to disease (Forsaken parity)");
        assert.notInclude(actor.system.conditionImmunities, "poisoned", "disease only (A.9 Q3)");
        assert.isFalse(actor.system.undead === true, "the Risen package is not the San'layn's (R11)");
      } finally {
        await creator.close();
      }
    });

    it("a race dropped on a sheet grants the Trait and embeds the eight, and the Outcast's chooser never offers the San'layn", async function () {
      this.timeout(120000);
      const warrior = await makeCharacter({ name: "ZZ San'layn Drop", classes: [["Warrior", 3]] });
      const race = (await fromPack(PACK_FOR.race, SANLAYN)).toObject();
      await warrior.createEmbeddedDocuments("Item", [race]);
      await until(() => featureNamed(warrior, "Preserved Countenance"), "the Trait granted on the drop");
      await until(() => warrior.items.filter(t => t.type === "talent" && t.system?.race === SANLAYN).length === 8, "the eight embedded");
      const feature = featureNamed(warrior, "Preserved Countenance");
      assert.equal(feature.system.kind, "passive");
      assert.deepEqual(feature.system.reminder?.kinds ?? [], [], "the GM chooses the observer's Test: no dialog line (R2)");
      assert.isTrue(warrior.system.bloodFed);
      // The Outcast's guise step lists the peoples a guise may be, and the San'layn is not one.
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        const champion = await fromPack(PACK_FOR.class, "Chromatic Champion");
        const dwarf = await fromPack(PACK_FOR.race, "Dwarf");
        const sanlaynRace = await fromPack(PACK_FOR.race, SANLAYN);
        await creator.setState({ race: dwarf.uuid, cls: champion.uuid, step: "guise" });
        await settle();
        const offered = [...creator.element.querySelectorAll('input[name="guise"]')].map(el => el.value);
        assert.isAbove(offered.length, 5, "the guise step offers the peoples");
        assert.include(offered, dwarf.uuid);
        assert.notInclude(offered, sanlaynRace.uuid, "the San'layn offered as a guise (A.9 Q6)");
      } finally {
        await creator.close();
      }
    });

    it("refuses Diseased on a San'layn and on a Forsaken (F1), and an Undeath exposure makes no Test", async function () {
      this.timeout(120000);
      const actor = await sanlayn("ZZ San'layn Immune");
      await actor.toggleStatusEffect("diseased", { active: true });
      await settle();
      assert.isFalse(actor.statuses.has("diseased"), "a San'layn took Diseased");
      const forsaken = await makeCharacter({ name: "ZZ San'layn Forsaken", classes: [["Warrior", 3]], race: "Forsaken" });
      await until(() => forsaken.system.conditionImmunities.includes("diseased"), "the Forsaken's immunity derived");
      await forsaken.toggleStatusEffect("diseased", { active: true });
      await settle();
      assert.isFalse(forsaken.statuses.has("diseased"), "a Forsaken took Diseased (F1)");
      const before = actor.system.corruption?.undeath ?? 0;
      const card = await game.system.azeroth.workflows.corruptionExposure({ actor, track: "undeath", dc: 30 });
      assert.isNull(card, "an Undeath exposure rolled for a San'layn");
      assert.equal(actor.system.corruption?.undeath ?? 0, before, "Undeath accrued");
    });

    it("a Short Rest from the sheet spends one Blood vial, the window offering blood alone; bread is refused with nothing spent", async function () {
      this.timeout(120000);
      const actor = await sanlayn("ZZ San'layn Short");
      const vials = await give(actor, "Blood vial");
      await vials.update({ "system.quantity": 2 });
      const bread = await give(actor, "Bread and cheese");
      await actor.update({ "system.health.value": 1 });
      // Bread, at the door: refused in words, nothing spent, no card.
      const cardsBefore = restCards(actor).length;
      const said = await warnings(() => actor.shortRest({ food: bread.id }));
      assert.include(said, game.i18n.format("AZEROTH.Rest.BloodNotFood", { name: actor.name }));
      assert.equal(gearNamed(actor, "Bread and cheese")?.system?.quantity, 1, "the bread was eaten");
      assert.equal(restCards(actor).length, cardsBefore, "a refused rest posted a card");
      // The sheet's button opens the San'layn's window: one blood select, the vial first.
      const sheet = await openSheet(actor);
      try {
        const card = await restCardFrom(actor, async () => {
          sheet.element.querySelector('[data-action="shortRest"]').click();
          const app = await until(() => {
            const a = foundry.applications.instances.get(`azeroth-rest-${actor.id}-blood-short`);
            return a?.rendered && a.element?.querySelector("form") ? a : null;
          }, "the blood window");
          await settle();
          const select = app.element.querySelector('select[name="blood"]');
          assert.ok(select, "the window draws no blood select");
          assert.equal(select.value, vials.id, "the vial is not preselected");
          assert.notOk([...select.options].some(o => o.value === bread.id), "bread offered as blood");
          assert.ok(app.element.querySelector('input[name="fresh"]'), "no living-source line");
          assert.isFalse(app.element.querySelector('input[name="fresh"]').checked, "the living-source line came ticked");
          app.element.querySelector('button[data-action="rest"]').click();
        });
        await until(() => gearNamed(actor, "Blood vial")?.system?.quantity === 1, "one Blood vial spent");
        assert.equal(gearNamed(actor, "Bread and cheese")?.system?.quantity, 1, "the bread was eaten on a San'layn's rest");
        assert.isAbove(actor.system.health.value, 1, "the unit restored no Health");
        assert.include(textOf(card), "Blood vial", "the card does not say what was drunk");
      } finally {
        await sheet.close();
      }
    });

    it("the living-source line rests with no vial and is printed on the card for the GM", async function () {
      this.timeout(90000);
      const actor = await sanlayn("ZZ San'layn Fresh");
      await actor.update({ "system.health.value": 1 });
      const card = await restCardFrom(actor, () => actor.shortRest({ fresh: true }));
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rest.BloodFresh", { n: 1 }));
      assert.isAbove(actor.system.health.value, 1);
      // With no unit at all a Short Rest is refused in words.
      const said = await warnings(() => actor.shortRest({}));
      assert.include(said, game.i18n.format("AZEROTH.Rest.NeedsBlood", { name: actor.name }));
    });

    it("a Long Rest at the GM's 2: one vial rests withheld (No blood, other resets done, the vial kept); two vials rest whole", async function () {
      this.timeout(120000);
      await game.settings.set(SCOPE, BLOOD_LONG_REST_SETTING, 2);
      const actor = await sanlayn("ZZ San'layn Long", { taken: ["What the Blood Remembers"] });
      const counter = await until(() => featureNamed(actor, "What the Blood Remembers"), "the counter granted");
      await counter.update({ "system.uses.value": 0 });
      await actor.update({ "system.health.value": 1, "system.fatigue": 2 });
      const one = await give(actor, "Blood vial");
      const withheld = await restCardFrom(actor, () => actor.longRest({ blood: [one.id], fresh: 0 }));
      assert.equal(actor.system.health.value, 1, "a starved Long Rest restored Health");
      assert.equal(actor.system.fatigue, 2, "a starved Long Rest removed Fatigue");
      assert.equal(gearNamed(actor, "Blood vial")?.system?.quantity, 1, "all or nothing: the one vial was spent");
      assert.equal(featureNamed(actor, "What the Blood Remembers").system.uses.value, 1, "the other resets did not run");
      assert.include(textOf(withheld), game.i18n.localize("AZEROTH.Rest.NoBloodLong"));
      // Two vials: whole.
      await one.update({ "system.quantity": 2 });
      const whole = await restCardFrom(actor, () => actor.longRest({ blood: [one.id], fresh: 0 }));
      assert.isAbove(actor.system.health.value, 1, "a fed Long Rest restored no Health");
      assert.equal(actor.system.fatigue, 1, "a fed Long Rest removed no Fatigue");
      assert.isNull(gearNamed(actor, "Blood vial"), "both vials not spent");
      assert.notInclude(textOf(whole), game.i18n.localize("AZEROTH.Rest.NoBloodLong"));
      // The sheet's Long Rest opens the window in long mode first.
      await give(actor, "Blood vial");
      const sheet = await openSheet(actor);
      try {
        sheet.element.querySelector('[data-action="longRest"]').click();
        const app = await until(() => {
          const a = foundry.applications.instances.get(`azeroth-rest-${actor.id}-blood-long`);
          return a?.rendered && a.element?.querySelector("form") ? a : null;
        }, "the long-mode window");
        await settle();
        assert.ok(app.element.querySelector("[data-blood-vial]"), "long mode lists the vials");
        assert.isNotEmpty(app.element.querySelector("[data-rest-reason]").textContent.trim(), "one vial of two is not said to fall short");
        assert.isFalse(app.element.querySelector('button[data-action="rest"]').disabled, "a Long Rest is never refused");
        await app.close();
      } finally {
        await sheet.close();
      }
    });

    it("Fill with blood: approved, the Blood vial made before the empty vial goes; refused in words with no GM online", async function () {
      this.timeout(120000);
      const actor = await sanlayn("ZZ San'layn Fill");
      const empty = await give(actor, "Vial, empty");
      await empty.update({ "system.quantity": 2 });
      // The menu offers it on the empty vial alone.
      const sheet = await openSheet(actor);
      await sheet.close();
      const order = [];
      const created = Hooks.on("createItem", item => { if (item.parent === actor) order.push(`create:${item.name}`); });
      const updated = Hooks.on("updateItem", item => { if (item.parent === actor && item.name === "Vial, empty") order.push("spend:empty"); });
      try {
        const r = await fillWithBlood(actor, empty, { source: "butcher" });
        assert.isTrue(r.ok, `the fill was refused: ${r.reason}`);
      } finally {
        Hooks.off("createItem", created);
        Hooks.off("updateItem", updated);
      }
      await until(() => gearNamed(actor, "Blood vial"), "the Blood vial made");
      assert.equal(gearNamed(actor, "Vial, empty")?.system?.quantity, 1, "one empty vial spent");
      assert.deepEqual(order.slice(0, 2), ["create:Blood vial", "spend:empty"], "the empty vial went before the Blood vial came");
      // No GM online: refused in words, nothing written.
      const said = await withNoGM(() => warnings(() => fillWithBlood(actor, gearNamed(actor, "Vial, empty"), { source: "donor" })));
      assert.include(said, game.i18n.format("AZEROTH.BloodFill.Refuse.noGM", { name: actor.name, vial: "Vial, empty" }));
      assert.equal(gearNamed(actor, "Vial, empty")?.system?.quantity, 1, "a refused fill spent the vial");
      assert.equal(gearNamed(actor, "Blood vial")?.system?.quantity, 1, "a refused fill made a Blood vial");
      // A Human may not fill one at all.
      const human = await makeCharacter({ name: "ZZ San'layn Not", classes: [["Warrior", 1]], race: "Human" });
      const hv = await give(human, "Vial, empty");
      const nope = await warnings(() => fillWithBlood(human, hv, { source: "donor" }));
      assert.include(nope, game.i18n.format("AZEROTH.BloodFill.Refuse.notBloodFed", { name: human.name, vial: hv.name }));
    });

    it("Open Vein from the Combat tab: the Body Test at 8 + Con + Proficiency, Physical 2 x tier on a failure, the San'layn healed, the unit on the card and in the next rest, the bite cue with its sound", async function () {
      this.timeout(240000);
      const held = { anim: game.settings.get(SCOPE, ANIMATIONS_SETTING), sound: game.settings.get(SCOPE, ANIMATION_SOUNDS_SETTING) };
      await game.settings.set(SCOPE, ANIMATIONS_SETTING, true);
      await game.settings.set(SCOPE, ANIMATION_SOUNDS_SETTING, true);
      const recorder = new (game.system.azeroth.animations.Recorder)();
      const previous = game.system.azeroth.animations.director.setPlayer(recorder);
      try {
        // Level 13, so twice the tier gets past a footman's Armor Points and the heal is seen.
        const actor = await sanlayn("ZZ San'layn Vein", { level: 13, taken: ["Open Vein"], abilities: { con: 16, str: 14 } });
        const vein = await until(() => featureNamed(actor, "Open Vein"), "Open Vein granted");
        assert.equal(vein.system.action, "half");
        assert.equal(vein.system.uses.max, 1);
        assert.equal(vein.system.uses.per, "encounter");
        const victim = await makeNpc("Plagued Ghoul");
        const living = await makeNpc("Alliance Footman").catch(() => null);
        const prey = living ?? victim;
        await sceneWith([{ actor, x: 1000, y: 1000 }, { actor: prey, x: 1100, y: 1000, side: "hostile" }]);
        await until(() => animationAvailability().ok, `animations available: ${animationAvailability().reason}`, 20000);
        await actor.update({ "system.health.value": 2 });
        canvas.tokens.setTargets([tokenOf(prey).id]);
        const sheet = await openSheet(actor);
        let card = null;
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${vein.id}"] [data-action="useFeature"]`);
          assert.ok(control, "the Combat tab draws no Use for Open Vein");
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "feature");
          recorder.reset();
          const unpin = pinDie(15);
          try { control.click(); [card] = await posted; } finally { unpin(); }
          made.push(card);
        } finally {
          canvas.tokens.setTargets([]);
          await sheet.close();
        }
        assert.equal(card.flags[SCOPE].featureKey, "open-vein");
        const resist = parsed(card).querySelector('button[data-action="resistTest"]');
        assert.ok(resist, "the card offers no Resist");
        assert.equal(resist.dataset.resilience, "body");
        const conMod = actor.system.abilities.con.mod;
        const prof = actor.system.proficiency ?? 0;
        assert.equal(Number(resist.dataset.dc), 8 + conMod + prof, "the Test is not at 8 + Con + Proficiency");
        // The bite cue and its sound.
        await until(() => recorder.cuesFor("use", "open-vein").length === 1, `Open Vein's cue (skips: ${recorder.skips.map(s => s.skip)})`);
        const steps = recorder.cuesFor("use", "open-vein")[0].steps;
        assert.ok(steps.some(s => s.kind === "effect" && s.asset === "jb2a.bite.200px.red"), "no bite drawn");
        assert.ok(steps.some(s => s.kind === "sound"), "the bite plays no sound");
        // The creature FAILS (a pinned 1): the unit, on the card and on the San'layn.
        const fail = pinDie(1);
        try { await CARD_ACTIONS.resistTest(resist, game.messages.get(card.id)); } finally { fail(); }
        await until(() => Object.values(game.messages.get(card.id).flags[SCOPE].resists ?? {})[0]?.success === false, "the failed Test recorded");
        const livingPrey = !(prey.system?.creatureType === "undead");
        if (livingPrey) {
          await until(() => actor.bloodSinceRest === 1, "the unit given");
          assert.equal(actor.getFlag(SCOPE, BLOOD_SINCE_REST_FLAG), 1);
          const drawn = await game.messages.get(card.id).renderHTML();
          assert.include(drawn.textContent, game.i18n.format("AZEROTH.Sanlayn.BloodUnitLine", { target: prey.name, name: actor.name }));
        } else {
          assert.equal(actor.bloodSinceRest, 0, "an undead gave blood");
        }
        // The Apply lands 2 x tier Physical (less AP) and heals the San'layn by what it took.
        const drawn = await game.messages.get(card.id).renderHTML();
        const apply = drawn.querySelector('button[data-action="applyDamage"][data-target-index="0"]');
        assert.ok(apply, "the card offers no Apply on the creature that failed");
        const before = prey.system.health.value;
        await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id));
        await until(() => prey.system.health.value < before || Number(apply.dataset.damage) === 0, "the bite's damage");
        const took = before - prey.system.health.value;
        assert.isAtMost(took, 2 * actor.system.tier, "more than twice the tier");
        await until(() => actor.system.health.value === Math.min(actor.system.health.max, 2 + took), "the San'layn healed by what it took");
        // A second Use this encounter is refused: its one use is spent.
        assert.equal(actor.items.get(vein.id).system.uses.value, 0, "the encounter's use not struck");
        // The unit is the next Short Rest's: no vial asked, the count cleared.
        if (livingPrey) {
          // The sheet's door rests at once where the count already covers it (F4).
          const { shortRestWithDialog } = await import("../applications/rest-dialog.mjs");
          const rest = await restCardFrom(actor, () => shortRestWithDialog(actor));
          assert.include(textOf(rest), game.i18n.format("AZEROTH.Rest.BloodSince", { n: 1 }));
          await until(() => actor.bloodSinceRest === 0, "the count cleared by the rest it fed");
        }
      } finally {
        game.system.azeroth.animations.director.setPlayer(previous);
        await game.settings.set(SCOPE, ANIMATIONS_SETTING, held.anim);
        await game.settings.set(SCOPE, ANIMATION_SOUNDS_SETTING, held.sound);
      }
    });

    it("migration 0.15.4.1 makes 02 §5's renamed page in a world that imported the book before, and never writes a held page (F7)", async function () {
      this.timeout(180000);
      const journals = await import("/systems/azeroth-rpg/module/applications/rules-journals.mjs");
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.15.4.1-sanlayn-journals.mjs");
      const before = game.journal.filter(journals.isImportedChapter).map(j => j.id);
      await journals.importRulesJournals();
      const options = journals.worldChapterNamed("02-CHARACTER-OPTIONS");
      const packDoc = (await game.packs.get(journals.RULES_PACK).getDocuments()).find(d => d.name === "02-CHARACTER-OPTIONS");
      const five = packDoc.pages.find(p => /^5\. The [a-z]+ races$/.test(p.name));
      assert.equal(five?.name, "5. The thirteen races", "the rules pack's 02 §5 does not count the San'layn");
      const pagesBefore = new Set(options.pages.map(p => p.id));
      try {
        // A world that imported 02 before the San'layn: §5 under its old name and id.
        // A world that imported the book before already holds the old page, kept by the repair the
        // world load ran (the test world is one): it is made only where it is absent.
        if (options.pages.has(five.id)) await options.deleteEmbeddedDocuments("JournalEntryPage", [five.id]);
        if (!options.pages.has("zEyqTNJheD6VD4cn")) {
          await options.createEmbeddedDocuments("JournalEntryPage", [{ _id: "zEyqTNJheD6VD4cn", name: "5. The twelve races", type: "text", sort: five.sort,
            text: { format: 1, content: "<p>ZZ the twelve races</p>" }, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT } }], { keepId: true });
        }
        const oldText = options.pages.get("zEyqTNJheD6VD4cn")?.text?.content;
        await migrate(() => {});
        assert.equal(options.pages.get(five.id)?.name, "5. The thirteen races", "the renamed page was not made under the id a link names");
        assert.equal(options.pages.get(five.id)?.text?.content, five.text.content);
        assert.equal(options.pages.get("zEyqTNJheD6VD4cn")?.text?.content, oldText, "the held old page was written or removed");
        const again = await journals.repairRulesJournals(() => {});
        assert.equal(again.pages, 0, "a second pass wrote pages");
      } finally {
        const added = options.pages.filter(p => !pagesBefore.has(p.id) && p.id !== five.id).map(p => p.id);
        if (added.length) await options.deleteEmbeddedDocuments("JournalEntryPage", added);
        if (!before.length) {
          await JournalEntry.deleteDocuments(game.journal.filter(journals.isImportedChapter).map(j => j.id));
          const folder = game.folders.find(f => f.type === "JournalEntry" && f.name === journals.RULES_FOLDER);
          if (folder) await folder.delete();
        }
      }
    });

    it("Courtly Masquerade draws an unticked Boon line on a skill Test's own dialog", async function () {
      this.timeout(90000);
      const actor = await sanlayn("ZZ San'layn Masque", { taken: ["Courtly Masquerade"] });
      await until(() => featureNamed(actor, "Courtly Masquerade"), "the line's feature granted");
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      const sheet = await openSheet(actor);
      try {
        sheet.element.querySelector('[data-action="rollSkill"][data-skill="deception"]').click();
        const dialog = await dialogFor(actor, 8000);
        assert.ok(dialog, "the skill's dialog did not open");
        const box = dialog.element.querySelector('input[name="line-feature-courtly-masquerade"]');
        assert.ok(box, "no Courtly Masquerade line on the Deception dialog");
        assert.isFalse(box.checked, "the line came ticked: whether a creature is looking is the table's");
        assert.include(box.closest("label").textContent, "+1");
        await dialog.close();
      } finally {
        await sheet.close();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      }
    });
  });
}
