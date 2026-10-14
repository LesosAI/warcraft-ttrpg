/**
 * What a consumable does when it is used (08 §12, §13; D-668): a draught
 * drunk, an oil laid on the weapon the user picks, an explosive thrown.
 *
 * The picker is a DialogV2, so the tests drive `useGear` directly where a
 * choice is not the thing under test, and open the dialog where it is.
 */

import { cleanup, gearInspector, gearTab, give, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook } from "./fixtures.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { checkText } from "./geometry.mjs";
import { AZEROTH } from "../config.mjs";
// 08 §12's minute and 04's Envenom (D-719, D-711 phase 2).
import { POISON_ROUNDS, coatingFired } from "../rules/consumables.mjs";

/** Wait for a condition, the way every other batch does. */
const until = async (fn, what, ms = 5000) => {
  const step = 50;
  for (let waited = 0; waited < ms; waited += step) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, step));
  }
  throw new Error(`timed out waiting for ${what}`);
};

// `give` is `fixtures.mjs`' now (D-733): the rest tests feed a character out of
// the same pack this batch draws its draughts and bandages from.

export function consumableBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Using a consumable (D-668)", function () {
    let dialog = null;
    before(async function () {
      dialog = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      if (dialog !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, dialog);
      await cleanup();
    });

    const use = (actor, item, targets = []) => game.system.azeroth.workflows.useGear({ actor, item, targets });

    it("a healing draught restores Health, marks one off and says so on a card", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Draught Drinker", classes: [["Warrior", 3]] });
      const draught = await give(actor, "Healing draught");
      assert.equal(draught.system.use.kind, "restore", "the pack carries no Use");
      assert.equal(draught.system.use.heal.health, 4);
      await actor.update({ "system.health.value": 4 });
      const before = actor.system.health.value;

      const card = await use(actor, draught);
      assert.ok(card, "no card was posted");
      assert.equal(actor.system.health.value, before + 4, "the draught healed nothing");
      assert.isNull(actor.items.get(draught.id) ?? null, "the last draught was not consumed");
      assert.include(card.content, "Health restored");
      assert.include(card.content, "Healing draught");
    });

    it("a mana draught fills the caster's own pool and stops at its cap", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Mana Drinker", classes: [["Mage", 3]] });
      const draught = await give(mage, "Mana draught");
      const mana = () => mage.system.powers.find(p => p.name === "mana");
      const max = mana().max;
      await mage.updatePool({ itemId: mana().itemId, kind: "power", value: 0 });
      await use(mage, draught);
      assert.equal(mana().value, Math.min(max, 6), "the Mana did not come back");
      const second = await give(mage, "Superior mana draught");
      await use(mage, second);
      assert.isAtMost(mana().value, max, "the pool went past its cap");
    });

    it("a tonic takes a Fatigue point off and a steadying draught ends Numbed", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Tonic", classes: [["Warrior", 1]] });
      await actor.update({ "system.fatigue": 2 });
      await use(actor, await give(actor, "Restorative tonic"));
      assert.equal(actor.system.fatigue, 1, "the tonic removed no Fatigue");

      await actor.toggleStatusEffect("numbed", { active: true });
      await settle();
      assert.isTrue(actor.statuses.has("numbed"));
      const card = await use(actor, await give(actor, "Steadying draught"));
      assert.isFalse(actor.statuses.has("numbed"), "Numbed was not ended");
      assert.include(card.content, game.i18n.localize(AZEROTH.conditions.numbed));
    });

    it("an elixir lays an effect for its hour and the attribute rises while it stands - the modifier with it - and an edit on the plate under it stores none of it", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Elixir", classes: [["Warrior", 3]] });
      const str = () => actor.system.abilities.str;
      const before = str().total ?? str().value;
      const modBefore = str().mod;
      await use(actor, await give(actor, "Elixir of the bear"));
      await settle();
      const effect = actor.effects.find(e => e.name === "Elixir of the bear");
      assert.ok(effect, "the elixir laid no effect");
      assert.equal(effect.duration?.units, "hours");
      const after = str().total ?? str().value;
      assert.equal(after, before + 2, "Strength did not rise");
      // **THE MODIFIER MOVES WITH THE SCORE** (D-769's fix of the delta): it
      // used to cancel itself, so the elixir moved the total and no Test.
      assert.equal(str().mod, modBefore + 1, "the elixir's +2 did not move the modifier");
      await effect.delete();
      await settle();
      assert.equal(str().total ?? str().value, before, "Strength stayed up");
      assert.equal(str().mod, modBefore, "the modifier stayed up after the elixir went");

      // THE PLATE UNDER AN ELIXIR (D-769, the review): typed one higher than it
      // shows, it stores one higher than it stood, never the elixir's +2.
      await use(actor, await give(actor, "Elixir of the bear"));
      await settle();
      const second = actor.effects.find(e => e.name === "Elixir of the bear");
      assert.ok(second, "the second elixir laid no effect");
      const stored = actor._source.system.abilities.str.value;
      const sheet = await openSheet(actor);
      try {
        const input = sheet.element.querySelector('input.azeroth-score[data-ability-score="str"]');
        assert.equal(Number(input.value), before + 2, "the plate does not show the score as worn");
        input.value = String(before + 3);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        for (let i = 0; i < 100 && actor._source.system.abilities.str.value === stored; i++) await new Promise(r => setTimeout(r, 50));
        assert.equal(actor._source.system.abilities.str.value, stored + 1, "the edit stored the elixir's +2 with it");
      } finally {
        await sheet.close();
      }
      await second.delete();
      await settle();
      assert.equal(str().total ?? str().value, before + 1, "the edit's one point did not outlive the elixir alone");
    });

    it("a dressing is limited by the PATIENT and a Short Rest clears it (08 §12)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Bandaged", classes: [["Warrior", 3]] });
      await actor.update({ "system.health.value": 2 });
      const first = await give(actor, "Linen bandage");
      await use(actor, first);
      assert.isTrue(actor.getFlag("azeroth-rpg", "dressed") === true, "the patient was not marked");
      const health = actor.system.health.value;
      const second = await give(actor, "Wool bandage");
      const refused = await use(actor, second);
      assert.isNull(refused, "a second dressing was allowed");
      assert.equal(actor.system.health.value, health, "the second dressing healed anyway");
      assert.ok(actor.items.get(second.id), "the refused dressing was consumed");
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await actor.shortRest({ food: await give(actor, "Rations, one day") });
      await settle();
      assert.isNotOk(actor.getFlag("azeroth-rpg", "dressed"), "the rest did not clear the patient");
      assert.ok(await use(actor, second), "a dressing after the rest was refused");
    });

    it("an oil goes on the ONE weapon it fits, and the blade carries its trait for the hour without changing", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Oiler", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      const stored = sword.toObject().system;
      const oil = await give(actor, "Oil of frost");
      assert.equal(oil.system.use.trait, "Frostbound (Lesser)");
      assert.equal(oil.system.use.appliesTo, "weapon");

      const card = await use(actor, oil);
      assert.ok(card, "no card for the oil");
      const coating = sword.getFlag("azeroth-rpg", "coating");
      assert.ok(coating, "nothing was laid on the blade");
      assert.equal(coating.name, "Oil of frost");
      assert.include(sword.system.traits, "Frostbound (Lesser)", "the trait is not on the derived list");
      // 08 §13: nothing about the item changes.
      assert.deepEqual(sword.toObject().system.traits, stored.traits, "the oil was written into the weapon");
      assert.include(card.content, sword.name);

      // A stone adds a Rating to the same blade, derived and not stored.
      const rating = sword.system.rating;
      await sword.unsetFlag("azeroth-rpg", "coating");
      await settle();
      await use(actor, await give(actor, "Sharpening stone"));
      await settle();
      assert.equal(sword.system.rating, rating + 1, "the stone added no Rating");
      assert.equal(sword.toObject().system.rating, stored.rating, "the stone was written into the weapon");
    });

    it("a stone refuses what its column does not name, and an armor kit finds the suit", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Wrong Target", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      // A shield lacquer goes on shields, and this character carries none.
      const lacquer = await give(actor, "Shield lacquer");
      const refused = await use(actor, lacquer);
      assert.isNull(refused, "the lacquer went on something that is not a shield");
      assert.ok(actor.items.get(lacquer.id), "the refused lacquer was consumed");

      const pack = game.packs.get("azeroth-rpg.armor");
      const suit = (await pack.getDocuments()).find(d => d.name === "Chain hauberk" || (d.system.category === "mail" && !d.system.shield));
      const [worn] = await actor.createEmbeddedDocuments("Item", [suit.toObject()]);
      await worn.update({ "system.equipped": true });
      const body = worn.system.armorPoints.body;
      await use(actor, await give(actor, "Armor kit"));
      await settle();
      assert.equal(worn.system.armorPoints.body, body + 1, "the kit added no Armor Point");
      assert.equal(worn.toObject().system.apBonus, suit.system.apBonus ?? 0, "the kit was written into the suit");
    });

    it("a poison lands on the weapon and carries its Test to the card", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Poisoner", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = actor.items.find(i => i.name === "Dagger");
      const kiss = await give(actor, "Spider's kiss");
      assert.deepEqual(kiss.system.use.resist, { resilience: "body", dc: 12 });
      await use(actor, kiss);
      const coating = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(coating, "the poison did not land");
      assert.deepEqual(coating.statuses, ["numbed"]);
      assert.equal(coating.resist.dc, 12);
    });

    it("an explosive posts its damage, its radius and its Test, and applies nothing on its own", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Sapper", classes: [["Warrior", 3]] });
      const npc = await makeNpc("Plagued Ghoul");
      const before = npc.system.health.value;
      const card = await use(actor, await give(actor, "Dynamite"), []);
      assert.ok(card, "no card for the dynamite");
      assert.equal(npc.system.health.value, before, "an explosive applied itself");
      const flags = card.flags["azeroth-rpg"];
      assert.equal(flags.kind, "gear");
      assert.ok(flags.area, "no area on the card");
      assert.include(card.content, "10");
    });

    it("a coating is wiped off by hand, and a rest takes it (08 §13, D-670)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Wiper", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      const rating = sword.system.rating;
      await use(actor, await give(actor, "Sharpening stone"));
      await settle();
      assert.ok(sword.getFlag("azeroth-rpg", "coating"), "the stone did not land");
      assert.equal(sword.system.rating, rating + 1);

      // By hand, from the sheet.
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const wipe = gearInspector(sheet, sword.id)?.querySelector('[data-action="clearCoating"]');
        assert.ok(wipe, "no way to wipe a coating off");
        wipe.click();
        await until(() => !sword.getFlag("azeroth-rpg", "coating"), "the coating wiped");
        assert.equal(sword.system.rating, rating, "the Rating stayed up after the wipe");
      } finally {
        await sheet.close();
      }

      // And a Short Rest is 08 §13's hour.
      await use(actor, await give(actor, "Oil of frost"));
      await settle();
      assert.ok(sword.getFlag("azeroth-rpg", "coating"), "the oil did not land");
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await actor.shortRest({ food: await give(actor, "Rations, one day") });
      await settle();
      assert.isNotOk(sword.getFlag("azeroth-rpg", "coating"), "the rest did not wear the oil off");
      assert.notInclude(sword.system.traits, "Frostbound (Lesser)", "the trait outlived the coating");
    });

    it("A POISON LANDS ON EVERY HIT AND NO LONGER LEAVES WITH THE FIRST (08 §12, D-719)", async function () {
      this.timeout(120000);
      // *It lasts for one minute and lands on every hit the weapon makes in
      // that time.* It used to come off the blade with the first blow that
      // landed, which is what D-670 said and D-719 supersedes.
      const actor = await makeCharacter({ name: "ZZ Envenomed", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const npc = await makeNpc("Plagued Ghoul");
      void npc;
      const dagger = actor.items.find(i => i.name === "Dagger");
      await use(actor, await give(actor, "Spider's kiss"));
      await settle();
      const coating = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(coating, "the poison did not land on the dagger");
      assert.equal(coating.rounds, POISON_ROUNDS, "the coating carries no minute to count");
      // Laid out of a fight, so the stamp is there with no fight in it: the
      // clock is handed over by `_fightStart` and the test below walks it.
      assert.ok(coating.laid, "the coating records no moment it was laid from");
      assert.isNull(coating.laid.combatId, "a coating laid out of a fight names one");

      const restore = pinDie(20);
      try {
        for (const pass of ["first", "second"]) {
          const card = await attackWithDialog(actor, dagger);
          assert.ok(card, `the ${pass} attack was refused`);
          assert.include(card.content, "Spider's kiss", `the ${pass} card does not name the poison`);
          assert.include(card.content, game.i18n.localize(AZEROTH.conditions.numbed),
            `the ${pass} card offers no condition`);
          assert.ok(dagger.getFlag("azeroth-rpg", "coating"),
            `the poison left the blade with the ${pass} blow`);
        }
      } finally {
        restore();
      }
    });

    it("takes a poison off at the end of its minute, with a line, and not before (08 §12, D-719)", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Minute", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = actor.items.find(i => i.name === "Dagger");
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;

      await use(actor, await give(actor, "Spider's kiss"));
      await settle();
      const laid = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(laid, "the poison did not land");
      assert.equal(laid.laid.combatId, combat.id, "the coating did not record the fight it was laid in");

      // One round short of the minute: still on the blade.
      await combat.update({ round: laid.laid.round + POISON_ROUNDS - 1 });
      await combat._turnTicks(combat.getCombatantsByActor(actor)[0]);
      assert.ok(dagger.getFlag("azeroth-rpg", "coating"), "the poison came off a round early");

      // The tenth: gone, and the tick says so.
      await combat.update({ round: laid.laid.round + POISON_ROUNDS });
      await combat._turnTicks(combat.getCombatantsByActor(actor)[0]);
      await until(() => !dagger.getFlag("azeroth-rpg", "coating"), "the poison wearing off");
      const said = game.messages.contents.slice(-4).map(m => m.content).join(" ");
      assert.include(said, "Spider's kiss", "nothing was said when the poison wore off");
    });

    it("STARTS THE MINUTE OF A BLADE COATED BEFORE INITIATIVE, AT THE FIGHT (08 §12, D-719)", async function () {
      this.timeout(180000);
      // The fault: a poison laid out of a fight had no round to count from and
      // 08 no longer takes one off with the blow, so the dagger a Rogue coats
      // in the corridor kept laying its poison for the rest of the session.
      const actor = await makeCharacter({ name: "ZZ Early Coat", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = actor.items.find(i => i.name === "Dagger");
      await use(actor, await give(actor, "Spider's kiss"));
      await settle();
      const before = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(before, "the poison did not land");
      assert.isNull(before.laid.combatId, "the coating named a fight before there was one");

      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;
      await until(() => dagger.getFlag("azeroth-rpg", "coating")?.laid?.combatId === combat.id,
        "the fight handing the coating its clock");
      const laid = dagger.getFlag("azeroth-rpg", "coating");
      assert.equal(laid.laid.round, 1, "the clock started before the fight's first round");

      // Ten rounds on it is gone, exactly as one laid in the fight would be.
      await combat.update({ round: laid.laid.round + POISON_ROUNDS });
      await combat._turnTicks(combat.getCombatantsByActor(actor)[0]);
      await until(() => !dagger.getFlag("azeroth-rpg", "coating"), "the poison wearing off");
    });

    it("TAKES A POISON OFF WHEN ITS FIGHT ENDS, MINUTE OR NO MINUTE (08 §12, D-719)", async function () {
      this.timeout(180000);
      // The fault: `_coatingsWornOff` counts to ten at the coater's own turn
      // and a fight that ends at round five never reaches it. The stamp then
      // named a fight nothing was counting, `coatingExpired` refused to judge
      // it against any other fight's round, and Blade venom laid at round 3 of
      // fight A landed on every hit of B, C and D until somebody rested.
      const actor = await makeCharacter({ name: "ZZ Fight Over", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = actor.items.find(i => i.name === "Dagger");
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;
      // **A ROUND UPDATE'S EVENTS ARE NOT AWAITED BY THE UPDATE** (D-627).
      // `_onUpdate` starts `_manageTurnEvents` and returns, and those events
      // write combatant flags - so deleting the fight straight after a round
      // change sends a Combatant update to a Combat that is already gone, and
      // the server answers *The Combat ... does not exist in combats*, which
      // the smoke spec rightly fails on. `combatTurnChange` is core's own
      // signal that the whole dispatch is over.
      const toRound = async n => {
        const done = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.update({ round: n });
        await done;
      };
      await toRound(3);

      await use(actor, await give(actor, "Spider's kiss"));
      await settle();
      const laid = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(laid, "the poison did not land");
      assert.equal(laid.laid.combatId, combat.id, "the coating did not record the fight it was laid in");
      assert.equal(laid.laid.round, 3, "the coating did not record the round it was laid in");

      // The fight ends at round five, four rounds short of the minute.
      // `endCombat()` opens a confirm dialog in v14 and nothing presses it, so
      // the fight is DELETED, which is the door a GM closing the tracker uses
      // and which fires `_onExit` for every combatant.
      await toRound(5);
      await settle();
      await combat.delete();
      await until(() => !dagger.getFlag("azeroth-rpg", "coating"),
        "the poison leaving the blade with the fight", 15000);
      const said = game.messages.contents.slice(-4).map(m => m.content).join(" ");
      assert.include(said, "Spider's kiss", "nothing was said when the fight took the poison off");
    });

    it("ENVENOM adds its rank to a poison that deals damage (04, the lead's 30)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Envenom", classes: [["Rogue", 5]], weapons: ["Dagger"] });
      const talent = actor.items.find(i => i.type === "talent" && i.system?.identifier === "envenom");
      assert.ok(talent, "the Rogue's talents did not arrive");
      await talent.update({ "system.taken": 2 });
      await until(() => actor.items.get(talent.id).system.taken === 2, "Envenom at rank 2");
      const dagger = actor.items.find(i => i.name === "Dagger");
      await use(actor, await give(actor, "Blade venom"));
      await settle();
      const coating = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(coating, "the venom did not land");
      assert.equal(coating.envenom, 2, "the rank was not stamped on the coating");
      // Blade venom's OWN +2 is 08's `rating` and reaches the derived weapon
      // (`WeaponData#prepareDerivedData`); Envenom's two are the talent's, and
      // `coatingFired` carries them onto the blow. The rating is asserted
      // explicitly rather than read off the pack, because *1 MORE damage* is
      // the rule under test and the pack's own number is 08's business.
      assert.equal(coatingFired({ ...coating, rating: 2 }, { success: true }).extraDamage, 2,
        "Envenom's rank never reached the blow");
      assert.equal(coatingFired({ ...coating, rating: null }, { success: true }).extraDamage, 0,
        "Envenom added damage to a poison that deals none");
    });

    it("makes DEFT HANDS apply a poison for no action at all (04, the lead's 27)", async function () {
      this.timeout(180000);
      const plain = await makeCharacter({ name: "ZZ Slow Hands", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const deft = await makeCharacter({ name: "ZZ Deft Hands", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const talent = deft.items.find(i => i.type === "talent" && i.system?.identifier === "deft-hands");
      assert.ok(talent, "the Rogue's talents did not arrive");
      await talent.update({ "system.taken": 1 });
      await until(() => deft.items.get(talent.id).system.taken === 1, "Deft Hands taken");

      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: plain.id }, { actorId: deft.id }]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;
      await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
        "every combatant's budget landing");

      await use(plain, await give(plain, "Spider's kiss"));
      await until(() => combat.getCombatantsByActor(plain)[0].budget.halfActions === 1,
        "the Half-Action 08 §12 charges for a coating");

      await use(deft, await give(deft, "Spider's kiss"));
      await settle();
      assert.ok(deft.items.find(i => i.name === "Dagger").getFlag("azeroth-rpg", "coating"),
        "Deft Hands' poison never landed");
      assert.equal(combat.getCombatantsByActor(deft)[0].budget.halfActions, 2,
        "Deft Hands still paid half a turn for the coating");
    });

    it("the Gear tab carries a Use where the chapter gives one and nowhere else, at the floor", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Gear Sheet", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      const draught = await give(actor, "Healing draught");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // **THE CONTROLS ARE ON THE CARD** (D-738): a 44px well holds an icon
        // and one badge, and everything a row used to carry is on the
        // inspector beside the panels. The card is in the DOM whether it is
        // showing or not, so this reads it without picking anything up.
        const row = id => gearInspector(sheet, id);
        assert.ok(row(draught.id)?.querySelector('[data-action="useGear"]'), "no Use on a draught");
        assert.isNull(row(rope.id)?.querySelector('[data-action="useGear"]') ?? null, "a rope offers a Use");
        assert.isNull(row(actor.items.find(i => i.name === "Longsword").id)?.querySelector('[data-action="useGear"]') ?? null,
          "a weapon offers a Use");
        const findings = checkText(gearTab(sheet));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
    });
  });
}
