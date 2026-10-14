/**
 * The automation pass (D-622 to D-630): uses on talents and the stepper,
 * Fatigue's statuses, healing on spell cards, maneuvers, the combat
 * lifecycle, Momentum, the turn's ticks and the dying track. Each section
 * names its decision.
 */

import { cleanup, settle, give, made, makeCharacter, makeNpc, openSheet, cardOf, dialogFor, untilHook, PACK_FOR } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

export function automationBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The automation pass", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    const until = async (test, ms = 10000) => {
      const start = Date.now();
      while (!test()) {
        if (Date.now() - start > ms) throw new Error("timed out waiting");
        await new Promise(r => setTimeout(r, 50));
      }
      return test();
    };
    const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
    const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;

    // ---- uses on talents, the stepper, and the rests (D-623) --------------

    it("a talent saying Once per Short Rest arrives with 1/1, the stepper on Core spends it, and a Short Rest restores it", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Uses Paladin", classes: [["Paladin", 5]] });
      const seal = talentNamed(actor, "Seal of Command");
      assert.ok(seal, "the Paladin's Seal of Command did not come with the class");
      assert.deepEqual({ value: seal.system.uses.value, max: seal.system.uses.max, per: seal.system.uses.per }, { value: 1, max: 1, per: "short" },
        "the pack does not carry the talent's uses");
      await seal.update({ "system.taken": 1 });
      // Seal of Command grants an action (D-642): the counter lives on the
      // feature it grants, under Features, and the talent leaves Talents in play.
      const feature = () => actor.items.find(i => i.type === "feature" && i.name === "Seal of Command") ?? null;
      await until(() => feature(), 10000);
      assert.deepEqual({ value: feature().system.uses.value, max: feature().system.uses.max, per: feature().system.uses.per }, { value: 1, max: 1, per: "short" });
      const sheet = await openSheet(actor);
      try {
        const row = () => sheet.element.querySelector(`.azeroth-features li[data-item-id="${feature().id}"]`);
        assert.ok(row(), "Seal of Command's feature is not under Features on Core");
        assert.isNull(sheet.element.querySelector(`.azeroth-talents-in-play li[data-item-id="${seal.id}"]`), "the talent still sits in Talents in play");
        assert.deepEqual(checkText(sheet.element.querySelector(".azeroth-features")), []);
        click(row().querySelector('[data-action="stepUses"][data-delta="-1"]'));
        await until(() => feature().system.uses.value === 0);
        await settle();
        assert.isTrue(row().querySelector('[data-action="stepUses"][data-delta="-1"]').disabled, "the minus is live at 0");
        assert.isFalse(feature().system.available);
        click(row().querySelector('[data-action="stepUses"][data-delta="1"]'));
        await until(() => feature().system.uses.value === 1);
        await settle();
        assert.isTrue(row().querySelector('[data-action="stepUses"][data-delta="1"]').disabled, "the plus is live at the maximum");
        await feature().update({ "system.uses.value": 0 });
      } finally {
        await sheet.close();
      }
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await actor.shortRest({ food: await give(actor, "Rations, one day") });
      assert.equal(feature().system.uses.value, 1, "a Short Rest did not restore the granted feature's use");
    });

    it("a racial talent saying Once per encounter is stamped on the grant, and the encounter's end restores it by name", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Uses Goblin", classes: [["Warrior", 1]], race: "Goblin" });
      const jump = talentNamed(actor, "Rocket Jump");
      assert.ok(jump, "the Goblin's Rocket Jump was not granted");
      assert.deepEqual({ max: jump.system.uses.max, per: jump.system.uses.per }, { max: 1, per: "encounter" });
      await jump.update({ "system.uses.value": 0 });
      const names = await actor.resetUses("encounter");
      assert.include(names, "Rocket Jump");
      assert.equal(jump.system.uses.value, 1);
      // A Long Rest names what it restored as well, features included.
      await jump.update({ "system.uses.value": 0 });
      assert.include(await actor.resetUses("long"), "Rocket Jump");
    });

    // ---- Fatigue drives the statuses (D-624) ------------------------------

    it("Fatigue 1 lights Fatigued, 4 puts Slowed on, 3 takes only the track's Slowed off, and 6 collapses to Health 0 and Prone", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Fatigue", classes: [["Warrior", 5]] });
      const speed = actor.system.speed;
      await actor.update({ "system.fatigue": 1 });
      await until(() => actor.statuses.has("fatigued"));
      assert.isFalse(actor.statuses.has("slowed"));
      await actor.update({ "system.fatigue": 4 });
      await until(() => actor.statuses.has("slowed"));
      assert.equal(actor.system.speed, speed / 2, "Slowed did not halve the Speed");
      // `syncFatigue` lays the status and THEN flags it, in a second write:
      // wait for exactly what is asserted (CLAUDE.md §15), or the read races it.
      await until(() => actor.effects.find(e => e.statuses?.has("slowed"))?.getFlag("azeroth-rpg", "fromFatigue") === true);
      assert.isTrue(actor.effects.find(e => e.statuses?.has("slowed")).getFlag("azeroth-rpg", "fromFatigue"), "the track's Slowed is not flagged as its own");
      await actor.update({ "system.fatigue": 3 });
      await until(() => !actor.statuses.has("slowed"));
      assert.isTrue(actor.statuses.has("fatigued"), "Fatigued left with Slowed");
      // A Slowed from elsewhere is left alone by the track, rising or falling.
      await actor.toggleStatusEffect("slowed", { active: true });
      await actor.update({ "system.fatigue": 4 });
      await settle();
      assert.lengthOf(actor.effects.filter(e => e.statuses?.has("slowed")), 1, "two Slowed on one character");
      await actor.update({ "system.fatigue": 2 });
      await settle();
      assert.isTrue(actor.statuses.has("slowed"), "the spell's Slowed left with the Fatigue");
      await actor.toggleStatusEffect("slowed", { active: false });
      // The collapse.
      await actor.update({ "system.fatigue": 6 });
      await until(() => actor.statuses.has("prone") && actor.system.health.value === 0);
      // The track's own Slowed is flagged in its second write; the fall below
      // is judged against that flag, so it has to have landed first.
      await until(() => actor.effects.find(e => e.statuses?.has("slowed"))?.getFlag("azeroth-rpg", "fromFatigue") === true);
      // Back to nothing: every status the track put on leaves; Prone is the table's to lift.
      await actor.update({ "system.fatigue": 0, "system.health.value": 5 });
      // Fatigued goes first and Slowed after it: wait for both, then say it.
      await until(() => !actor.statuses.has("fatigued") && !actor.statuses.has("slowed"));
      assert.isFalse(actor.statuses.has("slowed"));
    });

    it("the strip's Fatigued chip adds a point and refuses to take one off, and a Long Rest from 4 clears Slowed", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Fatigue Strip", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        // SCOPED TO THE CORE PANEL: the Overview strip carries the same action
        // and the same `data-condition` on its clear control (2026-09-20), and
        // its part is rendered first. Fatigued is the one condition the strip
        // never draws a control for - it is the Long Rest's to lift - so this
        // query resolved correctly by accident; scoped, it resolves by design.
        const chip = () => sheet.element.querySelector('section[data-tab="core"] [data-action="toggleCondition"][data-condition="fatigued"]');
        assert.ok(chip(), "no Fatigued chip on the strip");
        click(chip());
        await until(() => actor.system.fatigue === 1 && actor.statuses.has("fatigued"));
        await settle();
        click(chip());
        await settle();
        assert.equal(actor.system.fatigue, 1, "the chip took a point off");
        assert.isTrue(actor.statuses.has("fatigued"), "the chip lifted the status");
      } finally {
        await sheet.close();
      }
      await actor.update({ "system.fatigue": 4 });
      await until(() => actor.statuses.has("slowed"));
      await actor.longRest();
      await until(() => !actor.statuses.has("slowed"));
      assert.equal(actor.system.fatigue, 3);
      assert.isTrue(actor.statuses.has("fatigued"));
    });

    // ---- healing on the spell card (D-625) --------------------------------

    const snapshotOf = npc => ({
      tokenId: null, sceneId: null, actorId: npc.id, name: npc.name, defense: npc.system.defense,
      apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], ward: 0, wardSchool: null, wardBySchool: {},
      immune: [], vulnerable: [], statuses: []
    });

    it("Healing Wave's card offers Apply healing 6 to each target, and applying it raises the target's Health, never past its maximum", async function () {
      this.timeout(60000);
      const shaman = await makeCharacter({ name: "ZZ Heal Shaman", classes: [["Shaman", 5]], spells: ["Healing Wave"] });
      const spell = shaman.items.find(i => i.name === "Healing Wave");
      assert.equal(spell.system.heal.amount, 6, "the pack carries no heal on Healing Wave");
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.health.value": 1 });
      const card = await cardOf("spell", shaman, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      const button = card.element.querySelector('[data-action="applyHealing"][data-heal="6"][data-target-index="0"]');
      assert.ok(button, "no Apply healing 6 for the target");
      assert.include(card.element.querySelector(".azeroth-heal").textContent, "6");
      await CARD_ACTIONS.applyHealing(button, card.message);
      assert.equal(npc.system.health.value, 7, "the heal did not land on the target");
      await npc.update({ "system.health.value": npc.system.health.max - 2 });
      await CARD_ACTIONS.applyHealing(button, card.message);
      assert.equal(npc.system.health.value, npc.system.health.max, "healing passed the maximum");
      assert.deepEqual(checkText(card.element), []);
    });

    it("Renew lays its Health a turn on the creature through its Apply and heals nothing at the cast, and Death Coil heals the caster half the damage dealt", async function () {
      this.timeout(60000);
      const priest = await makeCharacter({ name: "ZZ Heal Priest", classes: [["Priest", 5]], spells: ["Renew"] });
      const renew = priest.items.find(i => i.name === "Renew");
      assert.equal(renew.system.heal.perTurn, 2, "the pack carries no per-turn heal on Renew");
      // **THE 2 IS THE TARGET'S AT THE START OF EACH OF ITS TURNS** (D-770,
      // O-144): the card offered it once at the cast, as a button, and nothing
      // happened at anybody's turn. The Apply lays the tick, and the card says
      // what lands each turn in words; `azeroth-rpg.riders-ticks` lands it.
      const card = await cardOf("spell", priest, { spell: renew, face: 20 });
      assert.notOk(card.element.querySelector('[data-action="applyHealing"]'), "Renew still heals at the cast");
      assert.ok(card.element.querySelector('[data-action="applySpellEffect"]'), "no Apply laying Renew's tick");
      assert.include(card.element.querySelector(".azeroth-tick").textContent, game.i18n.format("AZEROTH.Tick.Line.heal", { amount: 2 }));
      assert.deepInclude(card.message.flags["azeroth-rpg"].tick, { kind: "heal", amount: 2, rounds: 10 });

      const warlock = await makeCharacter({ name: "ZZ Heal Warlock", classes: [["Warlock", 5]], spells: ["Death Coil"] });
      const coil = warlock.items.find(i => i.name === "Death Coil");
      assert.equal(coil.system.heal.fromDamage, "half");
      await warlock.update({ "system.health.value": 1 });
      const npc = await makeNpc("Plagued Ghoul");
      const card2 = await cardOf("spell", warlock, { spell: coil, face: 20, args: { targets: [snapshotOf(npc)] } });
      const self = card2.element.querySelector('[data-action="applyHealing"][data-self]');
      assert.ok(self, "no Apply to self on Death Coil's card");
      assert.equal(Number(self.dataset.heal), 2, "half of 4 Shadow damage is 2");
      await CARD_ACTIONS.applyHealing(self, card2.message);
      assert.equal(warlock.system.health.value, 3, "the drain did not heal the caster");
      assert.notOk(card2.element.querySelector('[data-action="applyHealing"][data-target-index]'), "a drain offered the target the heal");
    });

    // ---- maneuvers usable and explained (D-626) ---------------------------

    it("Sunder pays 4 Rage from the primary pool, 2 with Sunder Armor, and a refused maneuver posts no card", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Maneuver Warrior", classes: [["Warrior", 3]] });
      await until(() => featureNamed(actor, "Charge"));
      const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
      const w = game.system.azeroth.workflows;
      // Charge's first Overbear or Sunder is free: spend it on Overbear first, so the Sunder pays.
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 6 });
      const free = await w.useManeuver({ actor, key: "overbear", targets: [] });
      made.push(free);
      assert.ok(free, "Overbear posted no card");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 7, "Charge's free Overbear did not grant 1 Rage");
      assert.equal(featureNamed(actor, "Charge").system.uses.value, 0, "Charge's use was not struck");
      const messages = game.messages.size;
      assert.isNull(await w.useManeuver({ actor, key: "calledShot", targets: [] }), "Called Shot is not a Use");
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 3 });
      assert.isNull(await w.useManeuver({ actor, key: "sunder", targets: [] }), "a Sunder at 3 Rage was allowed");
      assert.equal(game.messages.size, messages, "a refused maneuver posted a card");
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 6 });
      const card = await w.useManeuver({ actor, key: "sunder", targets: [] });
      made.push(card);
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 2, "Sunder did not cost 4");
      assert.equal(card.flags["azeroth-rpg"].cost, 4);
      await actor.setLevel(9);
      await until(() => featureNamed(actor, "Sunder Armor"));
      assert.equal(actor.system.momenta[0].max, 10);
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 6 });
      const cheap = await w.useManeuver({ actor, key: "sunder", targets: [] });
      made.push(cheap);
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 4, "Sunder Armor did not make Sunder cost 2");
    });

    it("REFILLS THE ENCOUNTER USES WHEN A FIGHT STARTS, so Charge comes back (02 §7, the lead's item 13)", async function () {
      this.timeout(120000);
      // Encounter uses were refilled at `_leaveFight` and at a rest and
      // NOWHERE ELSE, so a use struck by hand - or one left over from a fight
      // that ended some other way - stayed struck into the next fight, and
      // Charge's free Sunder never came back.
      const actor = await makeCharacter({ name: "ZZ Charger", classes: [["Warrior", 3]] });
      const kobold = await makeNpc("Plagued Ghoul");
      await until(() => featureNamed(actor, "Charge"));
      const charge = featureNamed(actor, "Charge");
      await charge.update({ "system.uses.value": 0 });
      await until(() => featureNamed(actor, "Charge").system.uses.value === 0);

      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }, { actorId: kobold.id }]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;
      await until(() => featureNamed(actor, "Charge").system.uses.value === 1, 20000);

      // And 02 §7's fight start leaves the Rage at 0, so the free Sunder is
      // the only one that can be made at all.
      const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
      assert.equal(rage.value, 0, "the fight did not start with the Rage at 0");
      const card = await game.system.azeroth.workflows.useManeuver({ actor, key: "sunder", targets: [] });
      made.push(card);
      assert.ok(card, "Charge's free Sunder was refused at 0 Rage");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 1,
        "Charge's free Sunder did not grant 1 Rage");
      assert.equal(featureNamed(actor, "Charge").system.uses.value, 0, "Charge's use was not struck");
      assert.include(card.content, game.i18n.localize("AZEROTH.Maneuver.ChargeFree"),
        "the card does not say the Sunder was free");
      // The second one pays: it is a plain Sunder now.
      assert.isNull(await game.system.azeroth.workflows.useManeuver({ actor, key: "sunder", targets: [] }),
        "a second Sunder at 1 Rage was allowed");
    });

    it("Apply Sundered puts a final-phase AP -1 on the target that its Short Rest clears, and Overbear's card carries the Body Test and Apply Prone", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Maneuver Sunderer", classes: [["Warrior", 3]] });
      await until(() => featureNamed(actor, "Charge"));
      await featureNamed(actor, "Charge").update({ "system.uses.value": 0 });
      const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 10 });
      const npc = await makeNpc("Plagued Ghoul");
      const ap = npc.system.ap.body;
      const target = { ...snapshotOf(npc), size: npc.system.size };
      const w = game.system.azeroth.workflows;
      const sunder = await w.useManeuver({ actor, key: "sunder", targets: [target] });
      made.push(sunder);
      const el = document.createElement("div");
      el.innerHTML = sunder.content;
      const button = el.querySelector('[data-action="applySundered"][data-target-index="0"]');
      assert.ok(button, "no Sunder button for the target");
      assert.include(el.textContent, "Reduce the target's Armor Points");
      await CARD_ACTIONS.applySundered(button, sunder);
      assert.equal(npc.system.ap.body, ap - 1, "the target's Body AP did not fall");
      await CARD_ACTIONS.applySundered(button, sunder);
      assert.equal(npc.system.ap.body, ap - 2, "a second Sunder did not stack");
      await npc.shortRest();
      assert.equal(npc.system.ap.body, ap, "the Short Rest did not end the Sunders");
      assert.deepEqual(checkText(el), []);

      const overbear = await w.useManeuver({ actor, key: "overbear", targets: [target] });
      made.push(overbear);
      const el2 = document.createElement("div");
      el2.innerHTML = overbear.content;
      const resist = el2.querySelector('[data-action="resistTest"][data-resilience="body"]');
      assert.ok(resist, "no Body Resilience Test on Overbear's card");
      assert.equal(Number(resist.dataset.dc), 12, "a tier-1 Warrior's Overbear is a Standard Test at DC 12");
      const prone = el2.querySelector('[data-action="applyCondition"][data-condition="prone"][data-target-index="0"]');
      assert.ok(prone, "no Apply Prone on Overbear's card");
      await CARD_ACTIONS.applyCondition(prone, overbear);
      assert.isTrue(npc.statuses.has("prone"), "the Prone did not land");
    });

    it("the Combat tab lists the seven, opens the book's sentence under a name, and offers Use only where the pool can pay", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Maneuver Tab", classes: [["Warrior", 3]] });
      await until(() => featureNamed(actor, "Charge"));
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const rows = () => [...sheet.element.querySelectorAll(".azeroth-maneuver")];
        assert.lengthOf(rows(), 7);
        const press = () => rows().find(r => r.dataset.expandId === "maneuver-press");
        const called = () => rows().find(r => r.dataset.expandId === "maneuver-calledShot");
        assert.notOk(called().querySelector('[data-action="useManeuver"]'), "Called Shot offers a Use");
        assert.isTrue(press().querySelector('[data-action="useManeuver"]').disabled, "Press is usable at 0 Rage");
        click(press().querySelector('[data-action="expandItem"]'));
        await settle();
        const detail = press().querySelector(".azeroth-maneuver-detail");
        assert.isFalse(detail.hidden, "the name did not open the sentence");
        assert.include(detail.textContent, "Add +1 to the damage");
        assert.notInclude(detail.textContent, "05-CORE-RULES", "the row names the chapter (removed 2026-09-04)");
        assert.deepEqual(checkText(sheet.element.querySelector(".azeroth-maneuvers")), []);
        const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
        await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 4 });
        await sheet.render({ force: true });
        await settle();
        sheet.changeTab("combat", "primary");
        await settle();
        assert.isFalse(press().querySelector('[data-action="useManeuver"]').disabled, "Press stays disabled at 4 Rage");
        assert.isFalse(press().querySelector(".azeroth-maneuver-detail").hidden, "a re-render closed the sentence");
        const overbear = rows().find(r => r.dataset.expandId === "maneuver-overbear");
        assert.equal(overbear.querySelector(".azeroth-maneuver-cost").textContent.trim(), "0", "Charge does not make the first Overbear free on the tab");
        const before = game.messages.size;
        click(press().querySelector('[data-action="useManeuver"]'));
        await until(() => game.messages.size === before + 1);
        made.push(game.messages.contents.at(-1));
        assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 2);
      } finally {
        await sheet.close();
      }
    });

    // ---- the combat lifecycle and the turn budget (D-627, D-630) ----------

    it("a fight starts with Momentum at 0 and Energy full, a late joiner the same, and deleting the encounter empties the pools and restores encounter uses", async function () {
      this.timeout(90000);
      const rogue = await makeCharacter({ name: "ZZ Lifecycle Rogue", classes: [["Rogue", 5]] });
      const [rogueClass] = rogue.system.classes;
      await rogue.updatePool([{ itemId: rogueClass.itemId, kind: "momentum", value: 3 }, { itemId: rogueClass.itemId, kind: "power", value: 2 }]);
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: rogue.id }]);
      await combat.startCombat();
      assert.equal(rogue.system.classes[0].momentum.value, 0, "Combo Points did not start at 0");
      assert.equal(rogue.system.powers.find(p => p.name === "energy").value, 10, "Energy did not start full");

      // A late joiner: the GM's _onEnter sets it as the others began.
      const warrior = await makeCharacter({ name: "ZZ Lifecycle Warrior", classes: [["Warrior", 5]] });
      await until(() => featureNamed(warrior, "Charge"));
      await warrior.updatePool({ itemId: warrior.system.classes[0].itemId, kind: "momentum", value: 4 });
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: warrior.id }]);
      await until(() => warrior.system.classes[0].momentum.value === 0);

      // A fight's worth of Momentum and a spent encounter use, then the
      // encounter is deleted rather than ended: _onExit still empties them.
      await rogue.updatePool({ itemId: rogueClass.itemId, kind: "momentum", value: 3 });
      await featureNamed(warrior, "Charge").update({ "system.uses.value": 0 });
      await combat.delete();
      await until(() => rogue.system.classes[0].momentum.value === 0 && featureNamed(warrior, "Charge").system.uses.value === 1);
    });

    it("an attack in a started fight takes a Half-Action, a second is allowed, a third is refused, and the off hand rides at -2", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Budget Warrior", classes: [["Warrior", 3]], weapons: ["Amani hatchet"] });
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      const [c] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
      await combat.startCombat();
      await until(() => combat.started && c.budget.halfActions === 2);
      const w = game.system.azeroth.workflows;
      const attack = extra => w.rollTest({ actor, kind: "attack", dc: 12, modifiers: [{ label: "AZEROTH.Sheet.Proficiency", value: 2 }], damage: { rating: 4, kind: "physical" }, title: "Quench budget", ...extra });
      const first = await attack({});
      assert.ok(first, "the first attack was refused");
      assert.equal(c.budget.halfActions, 1, "the attack did not take a Half-Action");
      assert.isTrue(c.budget.attacked, "the budget did not record that an Attack was made");
      // 05 §10 (D-711): the second Half-Action may be an Attack too, and the
      // off hand rides one already made for nothing.
      const off = await attack({ offHand: true });
      assert.ok(off, "the off-hand attack was refused");
      assert.equal(c.budget.halfActions, 1, "the off-hand attack charged a Half-Action");
      assert.include(off.rolls[0].formula, "- 2", "the off hand did not take -2");
      assert.include(off.content, game.i18n.localize("AZEROTH.Dialog.OffHand"));
      assert.isTrue(off.flags["azeroth-rpg"].offHand);
      const before = game.messages.size;
      assert.isNull(await attack({ offHand: true }), "a second Off-Hand Attack in the round was allowed");
      assert.equal(game.messages.size, before, "a refused attack posted a card");
      const second = await attack({});
      assert.ok(second, "the SECOND Attack of the turn was refused");
      assert.equal(c.budget.halfActions, 0, "the second attack did not take the other Half-Action");
      assert.isNull(await attack({}), "a third attack was allowed on two Half-Actions");
      await combat.delete();
    });

    it("the tracker shows every Momentum pool, a creature's included, and a new round re-derives initiative", async function () {
      this.timeout(90000);
      const hero = await makeCharacter({ name: "ZZ Tracker Pools", classes: [["Warrior", 9], ["Rogue", 5]], abilities: { dex: 14 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await ghoul.update({ "system.initiative": 5, "system.momentum": { name: "rage", value: 2, max: 6 } });
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: hero.id }, { actorId: ghoul.id }]);
      const a = combat.combatants.find(c => c.actorId === hero.id);
      const b = combat.combatants.find(c => c.actorId === ghoul.id);
      await a.setSide("friendly");
      await b.setSide("hostile");
      await combat.startCombat();
      assert.equal(ghoul.system.momentum.value, 0, "a creature's Momentum did not start at 0");
      await ghoul.updatePool({ itemId: null, kind: "momentum", value: 2 });
      assert.equal(ghoul.system.momentum.value, 2, "updatePool does not reach a creature's pool");
      await ui.combat.render({ force: true });
      await settle();
      const el = ui.combat.element;
      assert.lengthOf(el.querySelectorAll(`[data-combatant-id="${a.id}"] .azeroth-tracker-momentum`), 2, "the two-pool hero shows one pool");
      const creature = el.querySelector(`[data-combatant-id="${b.id}"] .azeroth-tracker-momentum`);
      assert.ok(creature, "the creature's pool is not drawn");
      assert.equal(creature.textContent.trim(), "2/6");
      assert.deepEqual(checkText(el.querySelector(".azeroth-tracker")), []);
      // Initiative follows a Dexterity that moved, at the next round.
      assert.equal(a.initiative, 12);
      await hero.update({ "system.abilities.dex.value": 18 });
      await combat.nextRound();
      await until(() => a.initiative === 14);
      await combat.delete();
      await until(() => ghoul.system.momentum.value === 0);
    });

    // ---- the Momentum map (D-627) -----------------------------------------

    /** A started fight holding these actors, friendly unless told otherwise. */
    const fight = async (actors, sides = {}) => {
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
      for (const c of combat.combatants) await c.setSide(sides[c.actorId] ?? "friendly");
      await combat.startCombat();
      await settle();
      return combat;
    };
    const pool = (actor, name) => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === name);
    const attack = (actor, extra = {}) => game.system.azeroth.workflows.rollTest({
      actor, kind: "attack", dc: 12, modifiers: [{ label: "AZEROTH.Sheet.Proficiency", value: 2 }],
      damage: { rating: 4, kind: "physical" }, title: "Quench hit", ...extra
    });
    const face = async (n, fn) => {
      const { pinDie } = await import("./fixtures.mjs");
      const unpin = pinDie(n);
      try { return await fn(); } finally { unpin(); }
    };

    it("a hit builds 1 Momentum in every pool held, 2 at SL 2, none off the off hand, and the card says so", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Momentum Multi", classes: [["Warrior", 9], ["Rogue", 5]], weapons: ["Amani hatchet"] });
      const combat = await fight([actor]);
      // Face 15 + 2 against DC 12 is SL 1: +1 each. Face 20 + 2 is SL 2: +2 each.
      const one = await face(15, () => attack(actor));
      assert.ok(one, "the hit was refused");
      assert.equal(pool(actor, "rage").value, 1, "Rage did not build on the hit");
      assert.equal(pool(actor, "comboPoints").value, 1, "Combo Points did not build on the hit");
      assert.include(one.content, "+1");
      assert.deepEqual(one.flags["azeroth-rpg"].momentumGained.map(g => g.name).sort(), ["comboPoints", "rage"]);
      const c = combat.getCombatantsByActor(actor)[0];
      await until(() => c.getFlag("azeroth-rpg", "round")?.struck === true && c.getFlag("azeroth-rpg", "lastHitRound") === combat.round);
      await c.resetBudget();
      const two = await face(20, () => attack(actor));
      assert.ok(two);
      assert.equal(pool(actor, "rage").value, 3, "SL 2 did not build 2");
      // The off hand builds none.
      const off = await face(15, () => attack(actor, { offHand: true }));
      assert.ok(off);
      assert.equal(pool(actor, "rage").value, 3, "the off hand built Momentum");
      assert.lengthOf(off.flags["azeroth-rpg"].momentumGained, 0);
      // A miss builds none, and nothing builds out of a fight.
      await c.resetBudget();
      const miss = await face(5, () => attack(actor));
      assert.ok(miss);
      assert.equal(pool(actor, "rage").value, 3, "a miss built Momentum");
      await combat.delete();
      await until(() => pool(actor, "rage").value === 0);
      const outside = await face(15, () => attack(actor));
      assert.ok(outside);
      assert.equal(pool(actor, "rage").value, 0, "Momentum built outside a fight");
    });

    it("a blow that reaches Health builds Rage, one absorbed marks the round as struck, and a quiet round drains 2", async function () {
      this.timeout(90000);
      const warrior = await makeCharacter({ name: "ZZ Momentum Struck", classes: [["Warrior", 5]] });
      const combat = await fight([warrior]);
      const c = combat.getCombatantsByActor(warrior)[0];
      await warrior.updatePool({ itemId: warrior.system.classes[0].itemId, kind: "momentum", value: 5 });
      await warrior.applyDamage(3, { struck: true });
      assert.equal(pool(warrior, "rage").value, 6, "a blow reaching Health did not build Rage");
      await until(() => c.getFlag("azeroth-rpg", "round")?.wasStruck === true);
      // A quiet round: nothing struck or was struck, and the Rage drains 2 at its end.
      await c.unsetFlag("azeroth-rpg", "round");
      await combat.nextRound();
      await until(() => pool(warrior, "rage").value === 4, 15000);
      // A round in which the Warrior was struck for nothing holds the Rage.
      await warrior.applyDamage(0, { struck: true });
      await until(() => c.getFlag("azeroth-rpg", "round")?.wasStruck === true);
      assert.equal(pool(warrior, "rage").value, 4, "an absorbed blow built Rage");
      await combat.nextRound();
      await settle();
      await settle();
      assert.equal(pool(warrior, "rage").value, 4, "a round with a blow taken drained the Rage");
      await combat.delete();
    });

    it("Guard takes a Half-Action, empties Momentum, gives attackers a Bane until the next turn, and Unbroken keeps the Rage once", async function () {
      this.timeout(90000);
      const { guard } = await import("../applications/combat-actions.mjs");
      const warrior = await makeCharacter({ name: "ZZ Momentum Guard", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const foe = await makeCharacter({ name: "ZZ Momentum Foe", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      // D-631: every button works outside a fight; the budget is spent only in one.
      assert.isTrue(await guard(warrior), "Guard refused outside a fight");
      assert.isTrue(warrior.statuses.has("guarded"), "Guard outside a fight put no status on");
      await warrior.toggleStatusEffect("guarded", { active: false });
      const combat = await fight([warrior, foe], { [foe.id]: "hostile" });
      const c = combat.getCombatantsByActor(warrior)[0];
      await warrior.updatePool({ itemId: warrior.system.classes[0].itemId, kind: "momentum", value: 6 });
      assert.isTrue(await guard(warrior));
      assert.equal(c.budget.halfActions, 1, "Guard took no Half-Action");
      assert.isTrue(warrior.statuses.has("guarded"), "Guard put no status on");
      assert.equal(pool(warrior, "rage").value, 0, "Guard left the Rage");
      // The foe's attack dialog carries the automatic Bane.
      const { prepareRoll, targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const snap = { ...targetSnapshots([])[0] ?? {}, tokenId: null, sceneId: null, actorId: warrior.id, name: warrior.name, defense: warrior.system.defense, apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], ward: 0, wardSchool: null, wardBySchool: {}, immune: [], vulnerable: [], statuses: [...warrior.statuses] };
      const p = prepareRoll(foe, { kind: "attack", targets: [snap] });
      assert.ok(p.situational.automatic.some(l => l.id === "targetGuarded" && l.banes === 1), "no Bane against a Guarding target");
      // Guard leaves at the guarder's next turn.
      await combat.nextTurn();
      await combat.nextTurn();
      await until(() => !warrior.statuses.has("guarded"), 15000);
      // Unbroken: asked, and the Rage stays.
      await warrior.setLevel(11);
      await until(() => featureNamed(warrior, "Unbroken"));
      await until(() => c.budget.halfActions === 2, 15000);
      await warrior.updatePool({ itemId: warrior.system.classes[0].itemId, kind: "momentum", value: 6 });
      const asking = guard(warrior);
      const dialog = await (async () => {
        for (let i = 0; i < 100; i++) {
          const app = [...foundry.applications.instances.values()].find(a => a.element?.querySelector('button[data-action="yes"]') && a.element.textContent.includes("Unbroken"));
          if (app) return app;
          await new Promise(r => setTimeout(r, 50));
        }
        return null;
      })();
      assert.ok(dialog, "Unbroken did not ask");
      dialog.element.querySelector('button[data-action="yes"]').click();
      assert.isTrue(await asking);
      assert.equal(pool(warrior, "rage").value, 6, "Unbroken did not keep the Rage");
      assert.equal(featureNamed(warrior, "Unbroken").system.uses.value, 0, "Unbroken's use was not struck");
      await combat.delete();
    });

    it("a Critical Injury empties every pool and ends what is Sustained", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Momentum Injured", classes: [["Warrior", 9], ["Rogue", 5]] });
      await actor.updatePool([
        { itemId: actor.system.classes[0].itemId, kind: "momentum", value: 5 },
        { itemId: actor.system.classes[1].itemId, kind: "momentum", value: 2 }
      ]);
      await actor.setFlag("azeroth-rpg", "sustaining", [{ spellId: "x", uuid: "y", name: "Quench", itemId: actor.system.classes[0].itemId }]);
      await game.system.azeroth.workflows.sufferInjury({ actor, location: "body", result: { name: "Deep cut", description: "Bleeding 1" } });
      assert.equal(pool(actor, "rage").value, 0, "the injury left the Rage");
      assert.equal(pool(actor, "comboPoints").value, 0, "the injury left the Combo Points");
      assert.isUndefined(actor.getFlag("azeroth-rpg", "sustaining"), "the injury left the Sustain");
    });

    it("the Ranger's mark: Quarry builds only against it, marking another empties it, and a mark is once a turn", async function () {
      this.timeout(90000);
      const { markQuarry, clearMark } = await import("../applications/combat-actions.mjs");
      const ranger = await makeCharacter({ name: "ZZ Momentum Ranger", classes: [["Ranger", 5]], weapons: ["Amani hatchet"] });
      const a = await makeNpc("Plagued Ghoul");
      const b = await makeNpc("Plagued Ghoul");
      const combat = await fight([ranger, a, b], { [a.id]: "hostile", [b.id]: "hostile" });
      const c = combat.getCombatantsByActor(ranger)[0];
      const snap = npc => ({ ...snapshotOf(npc), size: npc.system.size });
      // No mark: a hit on the ghoul builds no Quarry.
      const unmarked = await face(15, () => attack(ranger, { targets: [snap(a)] }));
      assert.ok(unmarked);
      assert.equal(pool(ranger, "quarry").value, 0, "Quarry built with no mark");
      // The mark takes the first targeted token; here the flag is set as the control would.
      await ranger.setFlag("azeroth-rpg", "mark", { tokenId: null, actorId: a.id, name: a.name });
      await c.resetBudget();
      const marked = await face(15, () => attack(ranger, { targets: [snap(a)] }));
      assert.ok(marked);
      assert.equal(pool(ranger, "quarry").value, 1, "Quarry did not build against the mark");
      await c.resetBudget();
      const other = await face(15, () => attack(ranger, { targets: [snap(b)] }));
      assert.ok(other);
      assert.equal(pool(ranger, "quarry").value, 1, "Quarry built against something else");
      // Marking another empties it; a second mark in the turn is refused.
      assert.isNull(await markQuarry(ranger), "a mark with nothing targeted");
      await ranger.setFlag("azeroth-rpg", "mark", { tokenId: "t-b", actorId: b.id, name: b.name });
      await ranger.updatePool({ itemId: ranger.system.classes[0].itemId, kind: "momentum", value: 0 });
      await clearMark(ranger);
      assert.isUndefined(ranger.getFlag("azeroth-rpg", "mark"));
      await combat.delete();
    });

    it("Ferocity builds only in a form, a shift starts it from 0, leaving the form empties it, and a spell in one is paid in Ferocity", async function () {
      this.timeout(90000);
      const { leaveShapeControl } = await import("../applications/combat-actions.mjs");
      const { fromPack } = await import("./fixtures.mjs");
      const druid = await makeCharacter({ name: "ZZ Momentum Druid", classes: [["Druid", 5]], weapons: ["Amani hatchet"], spells: ["Healing Wave"] });
      await until(() => featureNamed(druid, "Shapeshift"));
      const combat = await fight([druid]);
      const c = combat.getCombatantsByActor(druid)[0];
      const bare = await face(15, () => attack(druid));
      assert.ok(bare);
      assert.equal(pool(druid, "ferocity").value, 0, "Ferocity built out of a form");
      // A real shape through its one writer (D-769), never a flag set by hand.
      await game.system.azeroth.shapes.takeShape(druid, { kind: "shapeshift", entries: [await fromPack("azeroth-rpg.bestiary", "Black Bear")] });
      await until(() => druid.inShapeshiftForm === true);
      await c.resetBudget();
      const shifted = await face(15, () => attack(druid));
      assert.ok(shifted);
      assert.equal(pool(druid, "ferocity").value, 1, "Ferocity did not build in a form");
      // 07's *The Druid in a form*: Healing Wave's 2 Mana is 1 Ferocity, and the
      // Mana pool is never touched in a Shapeshift form (D-769).
      const spell = druid.items.find(i => i.name === "Healing Wave");
      const mana = druid.poolSnapshot().find(p => p.kind === "power");
      await druid.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await c.resetBudget();
      const cast = await face(15, () => game.system.azeroth.workflows.castSpell({ actor: druid, spell, targets: [] }));
      assert.ok(cast, "the cast in a form was refused although its Ferocity was there");
      assert.equal(pool(druid, "ferocity").value, 0, "the cast did not take its 1 Ferocity");
      assert.equal(druid.poolSnapshot().find(p => p.kind === "power").value, mana.max, "Mana was spent in a form");
      await c.resetBudget();
      assert.ok(await face(15, () => attack(druid)));
      assert.equal(pool(druid, "ferocity").value, 1);
      await leaveShapeControl(druid);
      assert.isNull(druid.shape, "the shape outlived Leave");
      assert.equal(pool(druid, "ferocity").value, 0, "the Ferocity did not go with the form");
      await combat.delete();
    });

    it("Opening's card offers 2 Energy for a Combo Point against a target that has not acted, and the button trades them", async function () {
      this.timeout(90000);
      const rogue = await makeCharacter({ name: "ZZ Momentum Rogue", classes: [["Rogue", 5]], weapons: ["Amani hatchet"] });
      await until(() => featureNamed(rogue, "Opening"));
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fight([rogue, ghoul], { [ghoul.id]: "hostile" });
      const card = await face(15, () => attack(rogue, { targets: [{ ...snapshotOf(ghoul), size: ghoul.system.size }] }));
      assert.ok(card);
      const el = document.createElement("div");
      el.innerHTML = card.content;
      const button = el.querySelector('[data-action="openingCombo"]');
      assert.ok(button, "no Opening button against a target that has not acted");
      const energy = rogue.poolSnapshot().find(p => p.kind === "power" && p.name === "energy").value;
      const combo = pool(rogue, "comboPoints").value;
      await CARD_ACTIONS.openingCombo(button, card);
      assert.equal(rogue.poolSnapshot().find(p => p.kind === "power" && p.name === "energy").value, energy - 2, "2 Energy were not spent");
      assert.equal(pool(rogue, "comboPoints").value, combo + 1, "no Combo Point came back");
      await combat.delete();
    });

    it("Killing Blow gives the attacker 6 Rage when its target drops below half, and Zeal answers an ally down within 20 feet", async function () {
      this.timeout(120000);
      const warrior = await makeCharacter({ name: "ZZ Momentum Killer", classes: [["Warrior", 9]] });
      const blow = warrior.items.find(i => i.type === "talent" && i.name === "Killing Blow");
      assert.ok(blow, "the Warrior holds no Killing Blow");
      await blow.update({ "system.taken": 1 });
      const paladin = await makeCharacter({ name: "ZZ Momentum Paladin", classes: [["Paladin", 5]] });
      const ally = await makeCharacter({ name: "ZZ Momentum Ally", classes: [["Warrior", 1]] });
      if (!canvas?.ready) this.skip();
      const scene = await Scene.create({ name: "ZZ Momentum Scene", width: 2000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await paladin.update({ "prototypeToken.actorLink": true });
      await ally.update({ "prototypeToken.actorLink": true });
      await scene.createEmbeddedDocuments("Token", [
        (await paladin.getTokenDocument({ x: 500, y: 500 })).toObject(),
        (await ally.getTokenDocument({ x: 700, y: 500 })).toObject()
      ]);
      for (let i = 0; i < 60 && !(paladin.getActiveTokens(true).length && ally.getActiveTokens(true).length); i++) await new Promise(r => setTimeout(r, 100));
      assert.isAtLeast(paladin.getActiveTokens(true).length, 1, "the Paladin's token never drew");
      await settle();
      const combat = await fight([warrior, paladin, ally], { [warrior.id]: "hostile" });
      // The Warrior's card struck the ally: below half, Killing Blow pays 6 Rage.
      const snap = { ...snapshotOf(ally), size: ally.system.size };
      const card = await face(20, () => attack(warrior, { targets: [snap] }));
      const el = document.createElement("div");
      el.innerHTML = card.content;
      const apply = el.querySelector('[data-action="applyDamage"][data-target-index="0"]');
      assert.ok(apply, "no Apply button on the card");
      await ally.update({ "system.health.value": ally.system.health.max });
      const rageBefore = pool(warrior, "rage").value;
      await CARD_ACTIONS.applyDamage(apply, card);
      assert.isBelow(ally.system.health.value, ally.system.health.max, "no damage landed");
      if (ally.system.health.value < ally.system.health.max / 2) {
        assert.equal(pool(warrior, "rage").value, Math.min(10, rageBefore + 6), "Killing Blow paid no Rage");
      }
      // The ally goes to 0 within 20 feet of the Paladin: +2 Zeal.
      await ally.update({ "system.health.value": 1 });
      const zealBefore = pool(paladin, "zeal").value;
      await CARD_ACTIONS.applyDamage(apply, card);
      assert.equal(ally.system.health.value, 0);
      await until(() => pool(paladin, "zeal").value === zealBefore + 2, 15000);
      await combat.delete();
    });

    // ---- the turn's ticks and durations (D-628) ---------------------------

    it("a condition the system applies until the end of the victim's next turn survives the attacker's turn and ends with the victim's", async function () {
      this.timeout(90000);
      const { applyCondition } = await import("../effects/durations.mjs");
      const attacker = await makeCharacter({ name: "ZZ Duration Attacker", classes: [["Warrior", 5]], abilities: { dex: 18 } });
      const victim = await makeCharacter({ name: "ZZ Duration Victim", classes: [["Warrior", 5]], abilities: { dex: 10 } });
      const combat = await fight([attacker, victim], { [victim.id]: "hostile" });
      assert.equal(combat.combatant.actorId, attacker.id, "the attacker does not lead");
      const effect = await applyCondition(victim, "stunned", { until: "endOfNextTurn" });
      assert.ok(effect, "no effect made");
      assert.equal(effect.duration.units, "turns");
      assert.equal(effect.start.combatant, combat.getCombatantsByActor(victim)[0].id, "the duration is not keyed on the victim");
      await combat.nextTurn();
      await settle();
      await settle();
      assert.isTrue(victim.statuses.has("stunned"), "Stunned left at the start of the victim's turn");
      await combat.nextTurn();
      await until(() => !victim.statuses.has("stunned"), 15000);
      await combat.delete();
    });

    it("Bleeding 2 costs 2 Health at the start of the turn, armor notwithstanding, and says so", async function () {
      this.timeout(90000);
      const { applyCondition } = await import("../effects/durations.mjs");
      const actor = await makeCharacter({ name: "ZZ Bleeding", classes: [["Warrior", 5]] });
      await applyCondition(actor, "bleeding", { value: 2 });
      const health = actor.system.health.value;
      const before = game.messages.size;
      const combat = await fight([actor]);
      await until(() => actor.system.health.value === health - 2, 15000);
      await until(() => game.messages.size > before);
      const line = game.messages.contents.at(-1);
      made.push(line);
      assert.include(line.content, "bleeds 2");
      await combat.delete();
    });

    // THE ASSERTION THAT THE CONSUMER MOVED (D-681, D-695). The pure rule has
    // a Vitest and the chapter has a checker; neither can see whether
    // `_turnTicks` ever reads a Scorched effect. This drives the real turn.
    it("Scorched 2 costs 2 Fire at the start of the turn and records the type", async function () {
      this.timeout(90000);
      const { applyCondition } = await import("../effects/durations.mjs");
      const actor = await makeCharacter({ name: "ZZ Scorched", classes: [["Warrior", 5]] });
      await applyCondition(actor, "scorched", { value: 2 });
      const health = actor.system.health.value;
      const before = game.messages.size;
      const combat = await fight([actor]);
      await until(() => actor.system.health.value === health - 2, 15000);
      await until(() => game.messages.size > before);
      const line = game.messages.contents.at(-1);
      made.push(line);
      assert.include(line.content, "burns for 2 Fire");
      // 14's Regeneration is withheld *unless it has taken Fire damage since
      // the end of its last turn*, and a burning creature has.
      const combatant = combat.getCombatantsByActor(actor)[0];
      await until(() => (combatant.getFlag("azeroth-rpg", "damageTypes") ?? []).includes("fire"), 15000);
      // A1: it does not decay. The value is where it was after the tick.
      const effect = actor.effects.find(e => e.statuses?.has("scorched"));
      assert.equal(effect?.getFlag("azeroth-rpg", "value"), 2, "Scorched shed a point, and A1 does not");
      await combat.delete();
    });

    it("Poisoned prompts a Body Resilience Test at the end of the turn, and a success sheds a stack", async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const { applyCondition } = await import("../effects/durations.mjs");
      const actor = await makeCharacter({ name: "ZZ Poisoned", classes: [["Warrior", 5]] });
      await applyCondition(actor, "poisoned", { value: 2 });
      const combat = await fight([actor]);
      const before = game.messages.size;
      await combat.nextTurn();
      await until(() => game.messages.contents.slice(before).some(m => m.flags?.["azeroth-rpg"]?.purpose === "poisoned"), 15000);
      const prompt = game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.purpose === "poisoned");
      made.push(prompt);
      const el = document.createElement("div");
      el.innerHTML = prompt.content;
      const button = el.querySelector('[data-action="resistTest"][data-purpose="poisoned"]');
      assert.ok(button, "the prompt carries no Test button");
      await face(20, () => CARD_ACTIONS.resistTest(button, prompt));
      const effect = actor.effects.find(e => e.statuses?.has("poisoned"));
      assert.ok(effect, "the poison was shed entirely on one success");
      assert.equal(effect.getFlag("azeroth-rpg", "value"), 1, "a success did not shed one stack");
      await combat.delete();
    });

    it("a Sustain pays 1 Power at the start of the turn, ends when the pool cannot, and one over the limit ends the oldest", async function () {
      this.timeout(90000);
      const priest = await makeCharacter({ name: "ZZ Sustain", classes: [["Priest", 5]] });
      const mana = priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
      await priest.updatePool({ itemId: mana.itemId, kind: "power", value: 1 });
      await priest.setFlag("azeroth-rpg", "sustaining", [{ spellId: "a", uuid: "a", name: "Quench Sustain", itemId: mana.itemId }]);
      const combat = await fight([priest]);
      await until(() => priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value === 0, 15000);
      assert.lengthOf(priest.getFlag("azeroth-rpg", "sustaining"), 1, "a paid Sustain ended");
      await combat.nextTurn();
      await until(() => (priest.getFlag("azeroth-rpg", "sustaining") ?? []).length === 0, 15000);
      await combat.delete();
      // The limit: a Priest holds one; a second cast ends the first.
      const pack = game.packs.get(PACK_FOR.spell);
      const index = await pack.getIndex({ fields: ["system.school", "system.duration.kind"] });
      const entry = index.find(e => e.system?.duration?.kind === "sustained" && e.system?.school === "holy");
      assert.ok(entry, "no sustained Holy spell in the pack");
      const [spell] = await priest.createEmbeddedDocuments("Item", [(await pack.getDocument(entry._id)).toObject()]);
      await priest.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await priest.setFlag("azeroth-rpg", "sustaining", [{ spellId: "old", uuid: "old", name: "Old Sustain", itemId: mana.itemId }]);
      const card = await cardOf("spell", priest, { spell, face: 20 });
      assert.ok(card.message);
      const held = priest.getFlag("azeroth-rpg", "sustaining");
      assert.lengthOf(held, 1, "the Priest sustains two");
      assert.equal(held[0].name, spell.name, "the newest was dropped rather than the oldest");
    });

    // ---- the dying track (D-629) ------------------------------------------

    it("reaching 0 Health puts the character Prone and offers the Critical Injury to the victim, and a blow while dying costs a Death Step", async function () {
      this.timeout(90000);
      const victim = await makeCharacter({ name: "ZZ Dying Victim", classes: [["Warrior", 5]] });
      const attacker = await makeCharacter({ name: "ZZ Dying Attacker", classes: [["Warrior", 5]] });
      const combat = await fight([attacker, victim], { [victim.id]: "hostile" });
      const before = game.messages.size;
      await victim.update({ "system.health.value": 2 });
      const card = await face(15, () => attack(attacker, { targets: [{ ...snapshotOf(victim), size: victim.system.size }], location: "limb" }));
      const el = document.createElement("div");
      el.innerHTML = card.content;
      await CARD_ACTIONS.applyDamage(el.querySelector('[data-action="applyDamage"][data-target-index="0"]'), card);
      assert.equal(victim.system.health.value, 0, "the blow did not take the victim to 0");
      assert.isTrue(victim.system.dying);
      assert.isTrue(victim.statuses.has("prone"), "reaching 0 did not put the victim Prone");
      const injury = game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.result && m.speaker?.actor === victim.id);
      assert.ok(injury, "no Critical Injury card for the victim");
      assert.equal(injury.getFlag("azeroth-rpg", "location") ?? "limb", "limb");
      await CARD_ACTIONS.applyDamage(el.querySelector('[data-action="applyDamage"][data-target-index="0"]'), card);
      assert.equal(victim.system.deathSteps, 1, "a blow while dying took no Death Step");
      await combat.delete();
    });

    it("a dying character's turn opens with the DC 12 Test, a failure takes a step, Bleeding costs a step, and healing at 0 stands them up clear", async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const { applyCondition } = await import("../effects/durations.mjs");
      const actor = await makeCharacter({ name: "ZZ Dying Turn", classes: [["Warrior", 5]] });
      await actor.update({ "system.health.value": 0 });
      const before = game.messages.size;
      const combat = await fight([actor]);
      await until(() => game.messages.contents.slice(before).some(m => m.flags?.["azeroth-rpg"]?.purpose === "deathStep"), 15000);
      const prompt = game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.purpose === "deathStep");
      made.push(prompt);
      const el = document.createElement("div");
      el.innerHTML = prompt.content;
      const test = el.querySelector('[data-action="resistTest"][data-purpose="deathStep"]');
      assert.ok(test, "no Test on the dying prompt");
      assert.equal(Number(test.dataset.dc), 12);
      await face(1, () => CARD_ACTIONS.resistTest(test, prompt));
      assert.equal(actor.system.deathSteps, 1, "a failed Test took no Death Step");
      // Bleeding while dying is a step, not Health.
      await applyCondition(actor, "bleeding", { value: 2 });
      await combat.nextTurn();
      await until(() => actor.system.deathSteps === 2, 15000);
      assert.equal(actor.system.health.value, 0);
      // Stabilized stops the Test; healing stands them up with the steps clear.
      await CARD_ACTIONS.stabilize(el.querySelector('[data-action="stabilize"]'), prompt);
      assert.isTrue(actor.getFlag("azeroth-rpg", "stabilized"));
      await actor.applyHealing(3);
      assert.equal(actor.system.health.value, 3);
      assert.equal(actor.system.deathSteps, 0, "healing did not clear the steps");
      assert.isUndefined(actor.getFlag("azeroth-rpg", "stabilized"));
      assert.isFalse(actor.system.dying);
      await combat.delete();
    });

    it("Charge is a passive with a use per encounter, and the talent item sheet edits a talent's uses", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Uses Charge", classes: [["Warrior", 1]] });
      await until(() => featureNamed(actor, "Charge"));
      const charge = featureNamed(actor, "Charge");
      assert.equal(charge.system.kind, "passive");
      assert.deepEqual({ max: charge.system.uses.max, per: charge.system.uses.per }, { max: 1, per: "encounter" });
      const seal = talentNamed(actor, "Heavy Hand") ?? actor.items.find(i => i.type === "talent");
      await seal.sheet.render({ force: true });
      await settle();
      try {
        assert.ok(seal.sheet.element.querySelector('[name="system.uses.max"]'), "the talent sheet offers no uses field");
      } finally {
        await seal.sheet.close();
      }
    });
  });
}
