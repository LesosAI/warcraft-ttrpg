/**
 * Phase 1 batch: the seam, as uses. Rest and the pools, the end of a fight,
 * the per-turn refill, a burned Tether, and item create / delete / equip on
 * the character sheet - every one a click or a call on the document, with
 * the side effect read back off the actor.
 */

import { cleanup, settle, untilHook, fromPack, gearInspector, give, made, makeCharacter, makeNpc, openSheet, restDialogFor, useAction, PACK_FOR } from "./fixtures.mjs";

/** The NEWEST rendered DialogV2, or null. A closing dialog lingers in
 * `instances` through its animation, and the first match was the one the
 * previous click had just dismissed. */
function openDialog() {
  let found = null;
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof foundry.applications.api.DialogV2 && app.element && app.rendered) found = app;
  }
  return found;
}

/** Wait for a dialog to leave `instances`, up to 3s. */
async function gone(app) {
  for (let i = 0; i < 30 && foundry.applications.instances.has(app.id); i++) await new Promise(r => setTimeout(r, 100));
}

export function seamBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The seam: rest, pools, the fight, the Tether, items", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    // ---- rest and the pools --------------------------------------------------

    const until = async (test, ms = 10000) => {
      const start = Date.now();
      while (!test()) {
        if (Date.now() - start > ms) throw new Error("timed out waiting");
        await new Promise(r => setTimeout(r, 50));
      }
      return test();
    };
    const lastCard = () => {
      const message = game.messages.contents.at(-1);
      made.push(message);
      const el = document.createElement("div");
      el.innerHTML = message.content;
      return { message, text: el.textContent.replace(/\s+/g, " ").trim() };
    };

    it("a Long Rest posts a card naming who rested and what came back, and a Short Rest's card names the uses it restored (D-623)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Card", classes: [["Mage", 5]], abilities: { con: 14 } });
      await until(() => actor.items.some(i => i.type === "feature" && i.name === "Evocation"));
      await actor.update({ "system.health.value": 1, "system.fatigue": 3 });
      await actor.updatePool({ itemId: actor.system.classes[0].itemId, kind: "power", value: 0 });
      const before = game.messages.size;
      await actor.longRest();
      assert.equal(game.messages.size, before + 1, "a Long Rest posted no card");
      const long = lastCard();
      assert.equal(long.message.flags["azeroth-rpg"].rest, "long");
      assert.include(long.text, actor.name);
      assert.match(long.text, /Health\s*\+\d+/, "no Health line");
      assert.match(long.text, /Mana\s*\+\d+/, "no Mana line");
      assert.match(long.text, /Fatigue\s*\u2212\s*1/, "no Fatigue line");
      assert.include(long.text, "Resolve");
      assert.equal(actor.system.fatigue, 2);

      const evocation = actor.items.find(i => i.type === "feature" && i.name === "Evocation");
      await evocation.update({ "system.uses.value": 0 });
      // 05 §16: A CHARACTER'S SHORT REST TAKES FOOD OR DRINK (D-733), and the
      // card names what was spent on it beside what came back.
      const bread = await give(actor, "Bread and cheese");
      const ale = await give(actor, "Ale, a pint");
      await actor.shortRest({ food: bread, drink: ale });
      const short = lastCard();
      assert.equal(short.message.flags["azeroth-rpg"].rest, "short");
      assert.include(short.text, "Uses restored");
      assert.include(short.text, "Evocation");
      assert.include(short.text, "1 of 2");
      assert.include(short.text, "Bread and cheese", "the card does not name what was eaten");
      assert.include(short.text, "Ale, a pint", "the card does not name what was drunk");
    });

    it("a Diseased Long Rest restores no Health and removes no Fatigue, fills the Mana, and the card says so (A1)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Diseased", classes: [["Priest", 5]], abilities: { con: 14 } });
      await actor.update({ "system.health.value": 1, "system.fatigue": 2 });
      await actor.updatePool({ itemId: actor.system.classes[0].itemId, kind: "power", value: 0 });
      await actor.toggleStatusEffect("diseased", { active: true });
      await actor.longRest();
      const card = lastCard();
      assert.equal(actor.system.health.value, 1, "a Diseased Long Rest restored Health");
      assert.equal(actor.system.fatigue, 2, "a Diseased Long Rest removed Fatigue");
      assert.equal(actor.system.powers[0].value, actor.system.powers[0].max, "the Mana did not fill");
      assert.include(card.text, "Diseased");
      assert.notMatch(card.text, /Health\s*\+/, "a Diseased Long Rest claimed Health");
      await actor.toggleStatusEffect("diseased", { active: false });
    });

    it("the third Short Rest of a day warns on the card and still rests, and a Long Rest starts the count over", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Rest Count", classes: [["Warrior", 5]] });
      // ONE ITEM, ONE REST (D-733): four days of rations feed the four rests
      // below and the last one takes the item with it, whatever the row says
      // it keeps for.
      const rations = await give(actor, "Rations, one day");
      await rations.update({ "system.quantity": 4 });
      for (let i = 0; i < 3; i++) {
        await actor.update({ "system.health.value": 1 });
        await actor.shortRest({ food: rations });
        assert.equal(rations.system.quantity, 3 - i, `the ${i + 1} rest did not mark one off`);
      }
      const third = lastCard();
      assert.include(third.text, "3 of 2");
      assert.include(third.text, "Past the second");
      assert.isAbove(actor.system.health.value, 1, "the third Short Rest did not rest");
      await actor.longRest();
      await actor.shortRest({ food: rations });
      assert.include(lastCard().text, "1 of 2");
      assert.isNull(actor.items.get(rations.id) ?? null, "the last ration was not eaten");
    });

    it("a creature takes a Short Rest from its sheet, and its Sundered effects end with it (05 SS11)", async function () {
      this.timeout(60000);
      const npc = await makeNpc("Plagued Ghoul");
      await npc.createEmbeddedDocuments("ActiveEffect", [{
        name: "Sundered", flags: { "azeroth-rpg": { sundered: true } },
        system: { changes: [{ key: "system.ap.body", type: "add", value: -1, phase: "final" }] }
      }]);
      const ap = npc.system.ap.body;
      await npc.update({ "system.health.value": 1 });
      const sheet = await openSheet(npc);
      try {
        const { el, registered } = useAction(sheet, "shortRest");
        assert.ok(el && registered, "no Short Rest on the NPC sheet");
        const wait = untilHook("updateActor", 5000, a => a.id === npc.id);
        el.click();
        await wait;
        await until(() => !npc.effects.some(e => e.getFlag("azeroth-rpg", "sundered")));
      } finally {
        await sheet.close();
      }
      assert.isAbove(npc.system.health.value, 1, "the creature did not rest");
      assert.equal(npc.system.ap.body, ap + 1, "the Sunder did not end with the rest");
      const card = lastCard();
      assert.include(card.text, "Sundered cleared");
    });
    it("a Short Rest restores half a Priest's Mana INTO classes[] and the derived pool agrees", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Priest", classes: [["Priest", 5]] });
      const max = actor.system.powers[0].max;
      assert.isAbove(max, 0, "a Priest 5 should hold Mana");
      await actor.updatePool({ itemId: actor.system.classes[0].itemId, kind: "power", value: 0 });
      assert.equal(actor.system.powers[0].value, 0);
      // 05 §16, D-733: the drink is what returns the Mana, so the pint is the
      // whole reason this rest moves a pool at all. Nothing is eaten, so the
      // Health stays where it is and the card says why.
      await give(actor, "Ale, a pint");
      await actor.update({ "system.health.value": 1 });
      const sheet = await openSheet(actor);
      try {
        const { el, registered } = useAction(sheet, "shortRest");
        assert.ok(el && registered, "no Short Rest button, or no handler");
        el.click();
        // THE SHEET'S BUTTON OPENS THE WINDOW NOW; the rest is taken when it
        // is answered (D-733).
        const window = await restDialogFor(actor, 8000);
        assert.ok(window, "the Short Rest button opened no window");
        window.element.querySelector('button[data-action="rest"]').click();
        // Wait on EXACTLY the field asserted (CLAUDE.md §15).
        await until(() => actor.system.classes[0].power.value === Math.floor(max / 2));
        await settle();
        assert.equal(actor.system.classes[0].power.value, Math.floor(max / 2), "the stored pool did not move");
        assert.equal(actor.system.powers[0].value, Math.floor(max / 2), "the derived pool disagrees with the stored one");
        assert.equal(actor.system.health.value, 1, "a rest with nothing eaten restored Health");
      } finally {
        await sheet.close();
      }
    });

    it("a Long Rest does not wake you at full Health (05 SS16)", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Sleeper", classes: [["Warrior", 5]], abilities: { con: 14 } });
      const max = actor.system.health.max;
      await actor.update({ "system.health.value": 1, "system.fatigue": 2 });
      await actor.longRest();
      const expected = Math.min(max, 1 + Math.ceil(max / 4) + 2);
      assert.equal(actor.system.health.value, expected, `a quarter of ${max} rounded up, plus Con +2, from 1`);
      assert.notEqual(actor.system.health.value, max, "a Long Rest restored full Health");
      assert.equal(actor.system.fatigue, 1, "a Long Rest removes one Fatigue");
    });

    it("a Long Rest fills Mana and Focus and leaves Energy alone", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Mage/Rogue", classes: [["Mage", 9], ["Rogue", 5]] });
      const [mage, rogue] = actor.system.classes;
      await actor.updatePool([{ itemId: mage.itemId, kind: "power", value: 0 }, { itemId: rogue.itemId, kind: "power", value: 4 }]);
      await actor.longRest();
      const mana = actor.system.powers.find(p => p.name === "mana");
      const energy = actor.system.powers.find(p => p.name === "energy");
      assert.equal(mana.value, mana.max, "Mana should be full");
      assert.equal(energy.value, 4, "Energy is not restored by rest - it refills per turn (05 SS12)");
    });

    it("updatePool clamps to the pool's cap and floor", async function () {
      this.timeout(20000);
      const actor = await makeCharacter({ name: "ZZ Seam Clamp", classes: [["Warrior", 5]] });
      const id = actor.system.classes[0].itemId;
      await actor.updatePool({ itemId: id, kind: "momentum", value: 99 });
      assert.equal(actor.system.momenta[0].value, 10, "Rage caps at 10 (D-507)");
      await actor.updatePool({ itemId: id, kind: "momentum", value: -5 });
      assert.equal(actor.system.momenta[0].value, 0);
    });

    // ---- the fight ------------------------------------------------------------
    it("ending a fight zeroes every Momentum pool through classes[], and a turn refills Energy", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Seam Warrior/Rogue", classes: [["Warrior", 9], ["Rogue", 5]] });
      const [warrior, rogue] = actor.system.classes;
      await actor.updatePool([
        { itemId: warrior.itemId, kind: "momentum", value: 6 },
        { itemId: rogue.itemId, kind: "momentum", value: 3 },
        { itemId: rogue.itemId, kind: "power", value: 2 }
      ]);
      assert.equal(actor.system.momenta[0].value, 6);
      const combat = await Combat.create({});
      await combat.activate();
      try {
        const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        // A fight starts with Momentum at 0 and Energy full (02 SS7, D-627), so
        // the pools are set again after the start and before the turn.
        await combat.startCombat();
        assert.equal(actor.system.classes[0].momentum.value, 0, "the fight did not start at 0 Rage");
        assert.equal(actor.system.powers.find(p => p.name === "energy").value, 10, "the fight did not start with Energy full");
        await settle();
        await actor.updatePool([
          { itemId: warrior.itemId, kind: "momentum", value: 6 },
          { itemId: rogue.itemId, kind: "momentum", value: 3 },
          { itemId: rogue.itemId, kind: "power", value: 2 }
        ]);
        // The turn's refill runs on the GM's client after the turn moves.
        await combat.nextTurn();
        await until(() => actor.system.powers.find(p => p.name === "energy").value === 5);
        const energy = actor.system.powers.find(p => p.name === "energy");
        assert.equal(energy.value, 5, "the Rogue's Energy refills 3 a turn (05 SS12)");
        // Core's endCombat awaits a modal confirm, so it is not awaited here:
        // the zeroing runs before super, the actor's update is the signal,
        // and the prompt is answered afterwards - Yes deletes the combat.
        const zeroed = untilHook("updateActor", 5000, a => a.id === actor.id);
        const ending = combat.endCombat();
        await zeroed;
        assert.equal(actor.system.classes[0].momentum.value, 0, "Rage did not die with the fight");
        assert.equal(actor.system.classes[1].momentum.value, 0, "Combo Points did not die with the fight");
        assert.equal(actor.system.momenta[0].value, 0, "the derived Momentum disagrees");
        await until(() => openDialog(), 10000);
        const prompt = openDialog();
        assert.ok(prompt, "core's End Combat confirm did not open");
        prompt.element.querySelector('button[data-action="yes"]').click();
        await ending;
        void combatant;
      } finally {
        if (game.combats.has(combat.id)) await combat.delete().catch(() => {});
      }
    });

    // ---- the Tether -------------------------------------------------------------
    it("Burn a Tether stands you at 1 Health for one Tether, and refuses with none", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Tether", classes: [["Warrior", 5]] });
      await actor.update({ "system.health.value": 0, "system.spiritTether.value": 2 });
      const sheet = await openSheet(actor);
      try {
        const { el, registered } = useAction(sheet, "burnTether");
        assert.ok(el && registered, "no Burn a Tether button, or no handler");
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        el.click();
        await wait;
        assert.equal(actor.system.spiritTether.value, 1);
        assert.equal(actor.system.health.value, 1);
        await actor.update({ "system.spiritTether.value": 0, "system.health.value": 0 });
        await actor.burnTether();
        assert.equal(actor.system.health.value, 0, "a burn with no Tether left should do nothing");
      } finally {
        await sheet.close();
      }
    });

    // ---- items: create, delete, equip ---------------------------------------------
    it("Add on the Gear tab opens the browser, and the GM's right click makes a blank item (2026-09-06)", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Gear" });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const el = sheet.element.querySelector('[data-action="browseItems"][data-type="gear"]');
        assert.ok(el, "no Add gear button");
        assert.isFunction(sheet.options.actions.browseItems, "browseItems is not registered");
        assert.isFunction(sheet.options.actions.createItem, "createItem is not registered for the menu");
        el.click();
        await settle();
        const browser = foundry.applications.instances.get("azeroth-compendium-browser");
        assert.ok(browser?.rendered, "Add did not open the compendium browser");
        await browser.close();
        // The menu's own click: a blank item of the button's kind.
        const wait = untilHook("createItem", 5000, i => i.parent?.id === actor.id);
        sheet.options.actions.createItem.call(sheet, new MouseEvent("click"), el);
        const [item] = await wait;
        assert.equal(item.type, "gear");
        await settle();
        assert.ok(item.sheet?.rendered, "the new item's sheet did not open");
        await item.sheet.close();
      } finally {
        await sheet.close();
      }
    });

    it("Delete removes the item after the confirm, and cancel leaves it", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Seam Delete", weapons: ["Amani hatchet"] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const before = actor.items.size;
        let el = sheet.element.querySelector('[data-action="deleteItem"]');
        assert.ok(el, "no Delete button on a carried item");
        assert.isFunction(sheet.options.actions.deleteItem, "deleteItem is not registered");

        // Cancel.
        el.click();
        await settle();
        let dialog = openDialog();
        assert.ok(dialog, "no confirm dialog opened");
        dialog.element.querySelector('button[data-action="no"]').click();
        await gone(dialog);
        await settle();
        assert.equal(actor.items.size, before, "cancelling the confirm deleted the item");

        // Confirm.
        el = sheet.element.querySelector('[data-action="deleteItem"]');
        const wait = untilHook("deleteItem", 5000, i => i.parent?.id === actor.id);
        el.click();
        await settle();
        dialog = openDialog();
        assert.ok(dialog, "no confirm dialog opened the second time");
        dialog.element.querySelector('button[data-action="yes"]').click();
        await wait;
        assert.equal(actor.items.size, before - 1, "confirming did not delete the item");
      } finally {
        await sheet.close();
      }
    });

    it("equipping a suit sets the Armor Points, and a second suit unequips the first", async function () {
      this.timeout(40000);
      const pack = game.packs.get(PACK_FOR.armor);
      const suits = (await pack.getDocuments()).filter(d => !d.system.shield && d.system.category !== "none").slice(0, 2).map(d => d.name);
      assert.equal(suits.length, 2, "need two suits from the armor pack");
      const actor = await makeCharacter({ name: "ZZ Seam Armour", classes: [["Warrior", 5]], armor: suits });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // **THE ROWS BECAME TILES AND HIDDEN CARDS** (D-738): every control a
        // row carried is on the inspector card, which is in the DOM whether it
        // is showing or not, so the buttons are live without a click first.
        const ids = actor.items.filter(i => i.type === "armor").map(i => i.id);
        assert.isAtLeast(ids.length, 2, "the fixture did not embed two suits");
        const toggleFor = id => gearInspector(sheet, id)?.querySelector('[data-action="toggleEquipped"]') ?? null;
        assert.isTrue(ids.slice(0, 2).every(id => Boolean(toggleFor(id))), "the suits carry no equip toggle");
        assert.isFunction(sheet.options.actions.toggleEquipped, "toggleEquipped is not registered");
        const bodyBefore = actor.system.ap?.body ?? 0;

        // Through the handler first, so a failure names the handler and not
        // the click path; the second suit goes through the click.
        const button = toggleFor(ids[0]);
        const result = await sheet.options.actions.toggleEquipped.call(sheet, new Event("click"), button);
        assert.ok(Array.isArray(result) && result.length, `toggleEquipped returned ${JSON.stringify(result)} - no update was written`);
        await settle();
        const first = actor.items.get(ids[0]);
        assert.isTrue(first.system.equipped, "the first suit did not equip");
        assert.notEqual(actor.system.ap?.body, bodyBefore, "equipping a suit changed no Armor Point");

        // The sheet re-rendered on the first update, so the card queried above
        // is the OLD DOM: a click on a detached element bubbles to nothing.
        // Re-query by id.
        const secondId = ids[1];
        const fresh = toggleFor(secondId);
        assert.ok(fresh, "the second suit's equip button is gone after the re-render");
        const wait = untilHook("updateItem", 5000, i => i.parent?.id === actor.id);
        fresh.click();
        await wait;
        await new Promise(r => setTimeout(r, 300));
        const second = actor.items.get(secondId);
        assert.isTrue(second.system.equipped, "the second suit did not equip");
        assert.isFalse(actor.items.get(first.id).system.equipped, "two suits are equipped at once");
      } finally {
        await sheet.close();
      }
    });
  });
}
