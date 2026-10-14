/**
 * Containers and charges (08 §11, §15; 09 §5; D-671, D-736, D-738): a pack
 * that holds things by weight, a quiver that holds arrows and nothing else,
 * an enchanted satchel that weighs its own way, and a waterskin that is spent
 * and filled again.
 *
 * **A CONTAINER IS WORN OR IT HOLDS NOTHING** (08 §11, D-736). Every test
 * here put a bag on the character and dropped things in it; the bag now needs
 * a place in the bag bar first, and a move into one that is off is refused in
 * words. The rows became tiles and inspector cards at the same time (D-738),
 * so the selectors go through `fixtures.mjs`' own helpers rather than naming
 * a class this file would have to chase.
 */

import {
  bagOf, bagZone, cleanup, forgeDrop, gearInspector, gearTab, gearTile, inspect,
  makeCharacter, openSheet, settle, warnings
} from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";

/** Wait for a condition. */
const until = async (fn, what, ms = 5000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** A pack item embedded on an actor, by name. */
async function give(actor, name, packId = "azeroth-rpg.gear") {
  const pack = game.packs.get(packId);
  const doc = (await pack.getDocuments()).find(d => d.name === name);
  if (!doc) throw new Error(`${name} is not in ${packId}`);
  const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return item;
}

/**
 * A container ON the character (08 §11, D-736).
 *
 * **A bag off the bar holds nothing**, so every test that puts something in
 * one has to wear it first - and the wearing is a judged write like any
 * other, so this waits for exactly the field it is about to rely on.
 */
async function worn(actor, name, packId = "azeroth-rpg.gear") {
  const bag = await give(actor, name, packId);
  if (!bag) throw new Error(`${actor.name} had no room for ${name}`);
  await bag.update({ "system.equipped": true });
  await until(() => actor.items.get(bag.id)?.system?.equipped === true, `${name} to go on`);
  return actor.items.get(bag.id);
}

/** One panel's drop zone, re-queried: a render detaches everything. */
async function zoneOf(sheet, key) {
  await sheet.render({ force: true });
  await settle();
  const zone = bagZone(sheet, key);
  if (!zone) throw new Error(`no bag panel for "${key}"`);
  return zone;
}

export function containerBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Containers and charges (08 §11, D-671)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    it("the pack's containers carry 08's own Holds column", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Packer", classes: [["Warrior", 1]] });
      const pack = await give(actor, "Backpack");
      assert.equal(pack.system.capacity.weight, 40, "the backpack holds no weight");
      assert.isNull(pack.system.capacity.count);
      const quiver = await give(actor, "Quiver");
      assert.deepEqual(
        { count: quiver.system.capacity.count, of: quiver.system.capacity.of },
        { count: 40, of: "arrows" },
        "the quiver does not know what it holds"
      );
      const satchel = await give(actor, "Enchanted satchel");
      assert.equal(satchel.system.capacity.weight, 100);
      assert.equal(satchel.system.capacity.weightAs, 20, "the satchel does not weigh its own way");
    });

    it("a thing dragged onto a worn bag goes in it, and the panel says whose it is", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Stower", classes: [["Warrior", 1]] });
      const pack = await worn(actor, "Backpack");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        assert.equal(bagOf(sheet, rope.id), "", "the rope is not in the base pack to begin with");
        // A BAG OF ITS OWN, headed with its name and its fill in bag slots
        // (08 §11): the Backpack holds 40 lb, which is eight wells.
        const head = bagZone(sheet, pack.id).querySelector(".azeroth-bag-panel-head");
        assert.include(head.textContent, pack.name, "the pack's panel is not headed with its name");
        assert.include(head.textContent, game.i18n.format("AZEROTH.Bags.PanelFill", { used: 0, max: 8 }),
          `the pack does not say how many bag slots it adds: "${head.textContent.trim()}"`);

        forgeDrop(await zoneOf(sheet, pack.id), { type: "Item", uuid: rope.uuid });
        await until(() => actor.items.get(rope.id)?.system?.container === pack.id, "the rope to go in the pack");
        await sheet.render({ force: true });
        await settle();
        assert.equal(bagOf(sheet, rope.id), pack.id, "the rope's tile is not in the pack's panel");

        // And back out again: the base pack is a zone of its own.
        forgeDrop(await zoneOf(sheet, ""), { type: "Item", uuid: rope.uuid });
        await until(() => (actor.items.get(rope.id)?.system?.container ?? null) === null, "the rope to come back out");
      } finally {
        await sheet.close();
      }
    });

    it("a bag that is not being worn holds nothing, and says so", async function () {
      this.timeout(90000);
      // 08 §11: *a container adds its bag slots only while you wear it, and it
      // comes off empty*. Off the bar it is an ordinary 40 lb thing.
      const actor = await makeCharacter({ name: "ZZ Unworn", classes: [["Warrior", 1]] });
      const pack = await give(actor, "Backpack");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        assert.isNull(bagZone(sheet, pack.id), "an unworn bag drew a panel of its own");
        assert.equal(actor.system.bagSlots.capacity, 16, "an unworn bag added wells");

        const said = await warnings(async () => {
          await rope.update({ "system.container": pack.id });
          await new Promise(r => setTimeout(r, 300));
        });
        assert.isNull(actor.items.get(rope.id).system.container ?? null, "a rope went into a bag that is off");
        assert.lengthOf(said, 1, "the refusal was not said in words");
        assert.include(said[0], pack.name);
      } finally {
        await sheet.close();
      }
    });

    it("a quiver refuses a rope on the drag, and never offers to hold itself", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Quiverer", classes: [["Ranger", 1]], weapons: ["Hunting arrows"] });
      const quiver = await worn(actor, "Quiver");
      const backpack = await worn(actor, "Backpack");
      const arrows = actor.items.find(i => i.name === "Hunting arrows");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // Re-render before every drop: a write re-renders the sheet, and an
        // element queried before that render is detached after it.
        const into = async (bag, item) => forgeDrop(await zoneOf(sheet, bag.id), { type: "Item", uuid: item.uuid });

        // The bundle was embedded before the quiver went on, so it starts in
        // the base pack; the drop is what puts it where it belongs.
        await into(quiver, arrows);
        await until(() => actor.items.get(arrows.id)?.system?.container === quiver.id, "the arrows into the quiver");
        await into(backpack, arrows);
        await until(() => actor.items.get(arrows.id)?.system?.container === backpack.id, "the arrows into the pack");
        await into(quiver, arrows);
        await until(() => actor.items.get(arrows.id)?.system?.container === quiver.id, "the arrows back into the quiver");

        // 08 §11's column names arrows and nothing else.
        await into(quiver, rope);
        await new Promise(r => setTimeout(r, 400));
        assert.isNull(actor.items.get(rope.id).system.container ?? null, "a quiver took a rope");

        // A pack takes both.
        await into(backpack, rope);
        await until(() => actor.items.get(rope.id)?.system?.container === backpack.id, "the rope into the pack");

        // **NOTHING HOLDS ITSELF.** D-736 retired the nesting rule - Foundry
        // has no bag inside a bag - so a bag dropped on its own panel is not a
        // move at all, and the drop writes nothing rather than taking it off.
        await into(quiver, quiver);
        await new Promise(r => setTimeout(r, 400));
        assert.isNull(actor.items.get(quiver.id).system.container ?? null, "the quiver went inside itself");
        assert.isTrue(actor.items.get(quiver.id).system.equipped, "the quiver came off its own panel");
      } finally {
        await sheet.close();
      }
    });

    it("Put in on the tile's right click is the same door, and Take out is beside it", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Menu", classes: [["Warrior", 1]] });
      const pack = await worn(actor, "Backpack");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // THE TILE, not the card: the bags come before the inspector in the
        // DOM and the menu binds `li[data-item-id]` (D-738).
        const openMenu = async id => {
          document.querySelector("#context-menu")?.remove();
          const row = gearTile(sheet, id);
          assert.ok(row, `no bag tile for ${id}`);
          const r = row.getBoundingClientRect();
          row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 }));
          await new Promise(r2 => setTimeout(r2, 400));
          const menu = document.querySelector("#context-menu");
          assert.ok(menu, "no context menu opened on a carried row");
          return [...menu.querySelectorAll(".context-item")].map(i => i.textContent.trim());
        };

        const loose = await openMenu(rope.id);
        assert.include(loose, game.i18n.localize("AZEROTH.Container.PutIn"), `no Put in on a carried row: ${loose.join(" | ")}`);
        assert.notInclude(loose, game.i18n.localize("AZEROTH.Container.TakeOut"), "Take out is offered on a thing that is in nothing");

        await rope.update({ "system.container": pack.id });
        await until(() => actor.items.get(rope.id)?.system?.container === pack.id, "the rope into the pack");
        await sheet.render({ force: true });
        await settle();
        const inside = await openMenu(rope.id);
        assert.include(inside, game.i18n.localize("AZEROTH.Container.TakeOut"), "no Take out on a thing in a pack");

        // Take out is one click and needs no dialog.
        const item = [...document.querySelectorAll("#context-menu .context-item")]
          .find(i => i.textContent.trim() === game.i18n.localize("AZEROTH.Container.TakeOut"));
        item.click();
        await until(() => (rope.system.container ?? null) === null, "Take out to take it out");
      } finally {
        document.querySelector("#context-menu")?.remove();
        await sheet.close();
      }
    });

    it("a full container refuses one more (08 §11's count)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Full", classes: [["Ranger", 1]], weapons: ["Hunting arrows"] });
      const quiver = await worn(actor, "Quiver");
      const arrows = actor.items.find(i => i.name === "Hunting arrows");
      const more = await give(actor, "Hunting arrows", "azeroth-rpg.weapons");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // **A QUIVER OF FORTY ARROWS IS TWO WELLS** (08 §11: *one for every
        // twenty, and they take nothing else*), so two bundles of twenty fill
        // it and the third has nowhere to go.
        assert.equal(quiver.system.capacity.count, 40);
        assert.equal(bagZone(sheet, quiver.id).querySelectorAll(".azeroth-bag-grid > li").length, 2,
          "the quiver did not draw two wells");
        await arrows.update({ "system.quantity": 20, "system.container": quiver.id });
        await until(() => actor.items.get(arrows.id)?.system?.quantity === 20, "the first bundle to hold twenty");
        await more.update({ "system.quantity": 20, "system.container": quiver.id });
        await until(() => actor.items.get(more.id)?.system?.container === quiver.id, "the second bundle into the quiver");

        const third = await give(actor, "Hunting arrows", "azeroth-rpg.weapons");
        await third.update({ "system.quantity": 20 });
        await until(() => actor.items.get(third.id)?.system?.quantity === 20, "the third bundle to hold twenty");

        const said = await warnings(async () => {
          forgeDrop(await zoneOf(sheet, quiver.id), { type: "Item", uuid: third.uuid });
          await new Promise(r => setTimeout(r, 400));
        });
        assert.isNull(actor.items.get(third.id).system.container ?? null, "a full quiver took a third bundle");
        assert.lengthOf(said, 1, "the refusal was not said in words");
      } finally {
        await sheet.close();
      }
    });

    it("a waterskin holds a day, is spent, and is filled again (09 §5)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Thirsty", classes: [["Warrior", 1]] });
      const skin = await give(actor, "Waterskin");
      assert.deepEqual(
        { value: skin.system.charges.value, max: skin.system.charges.max, unit: skin.system.charges.unit },
        { value: 1, max: 1, unit: "day" },
        "the waterskin holds no day"
      );
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // THE INSPECTOR, not the tile: a 44px well has room for one badge and
        // everything a row used to print is on the card beside the panels
        // (D-738).
        const card = await inspect(sheet, skin.id);
        assert.include(card.textContent, "1 / 1", "the card does not say what is left");
        const row = () => gearInspector(sheet, skin.id);
        const spend = row().querySelector('[data-action="spendCharge"]');
        assert.ok(spend, "no Use one on a thing with charges");
        assert.isFunction(sheet.options.actions?.spendCharge, "spendCharge is not registered");
        assert.isFalse(spend.disabled, "the button is disabled with a day still in the skin");
        spend.click();
        // A spend writes one field, and the maximum and the unit have to
        // survive it: rebuilding them in `migrateData` emptied the skin.
        await until(() => skin.system.charges.value === 0, "the day drunk");
        assert.equal(skin.system.charges.max, 1, "the spend wiped the skin's maximum");
        assert.equal(skin.system.charges.unit, "day", "the spend wiped the skin's unit");
        await sheet.render({ force: true });
        await settle();
        assert.isTrue(row().querySelector('[data-action="spendCharge"]').disabled, "an empty skin still offers a drink");
        row().querySelector('[data-action="fillCharges"]').click();
        await until(() => skin.system.charges.value === 1, "the skin filled");
      } finally {
        await sheet.close();
      }
    });

    it("the enchanted satchel adds sixteen wells worn and takes three off", async function () {
      this.timeout(90000);
      // The one entry lighter than what is in it: *100 lb at the weight of 20*
      // (08 §11). Worn, its Holds is what counts - 100 lb is sixteen wells.
      // Off, it is an ordinary 20 lb thing and takes THREE bag slots.
      const actor = await makeCharacter({ name: "ZZ Weigher", classes: [["Warrior", 1]] });
      const satchel = await give(actor, "Enchanted satchel");
      assert.equal(satchel.system.weight, 20, "08 §11 prints 20 lb for the enchanted satchel");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const card = await inspect(sheet, satchel.id);
        assert.include(card.textContent, game.i18n.format("AZEROTH.Item.BagSlotsTakes", { n: 3 }),
          "the satchel does not say what it takes while it is off");

        await satchel.update({ "system.equipped": true });
        await until(() => actor.system.bagSlots.capacity === 32, "the satchel to add its sixteen wells");
        await sheet.render({ force: true });
        await settle();
        const head = bagZone(sheet, satchel.id).querySelector(".azeroth-bag-panel-head");
        assert.include(head.textContent, game.i18n.format("AZEROTH.Bags.PanelFill", { used: 0, max: 16 }),
          `the satchel's panel does not say sixteen: "${head.textContent.trim()}"`);

        const rope = await give(actor, "Rope, 50 ft (hemp)");
        await rope.update({ "system.container": satchel.id });
        await until(() => actor.items.get(rope.id)?.system?.container === satchel.id, "the rope into the satchel");
        await sheet.render({ force: true });
        await settle();
        assert.equal(bagOf(sheet, rope.id), satchel.id);
        const findings = checkText(gearTab(sheet));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
    });

    it("a character with no container is offered no Put in at all", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Bagless", classes: [["Warrior", 1]], weapons: ["Longsword"] });
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        assert.isNull(gearTab(sheet).querySelector("select"), "a Kept-in select with nowhere to keep anything");
        const row = gearTile(sheet, rope.id);
        assert.ok(row, "the rope drew no tile");
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 }));
        await new Promise(r2 => setTimeout(r2, 400));
        const texts = [...document.querySelectorAll("#context-menu .context-item")].map(i => i.textContent.trim());
        assert.notInclude(texts, game.i18n.localize("AZEROTH.Container.PutIn"), "Put in is offered with nowhere to put anything");
        // And the inspector's own control says the same thing.
        const card = await inspect(sheet, rope.id);
        assert.isNull(card.querySelector('[data-action="putInItem"]'), "Put in is on the card with nowhere to put anything");
      } finally {
        document.querySelector("#context-menu")?.remove();
        await sheet.close();
      }
    });

    it("refuses to delete a worn bag that still holds things, and lets it go once it is empty", async function () {
      this.timeout(90000);
      // 08 §11: a bag *comes off empty*. Deleting a full one would spill its
      // contents into a base pack that may have no room for them, and there
      // would be nothing left to put them back in (D-737).
      const actor = await makeCharacter({ name: "ZZ Spiller", classes: [["Warrior", 1]] });
      const pack = await worn(actor, "Backpack");
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      await rope.update({ "system.container": pack.id });
      await until(() => actor.items.get(rope.id)?.system?.container === pack.id, "the rope into the pack");

      const said = await warnings(async () => {
        await pack.delete();
        await new Promise(r => setTimeout(r, 300));
      });
      assert.ok(actor.items.get(pack.id), "a pack holding a rope was deleted");
      assert.lengthOf(said, 1, "the refusal was not said in words");
      assert.include(said[0], pack.name);

      await rope.update({ "system.container": null });
      await until(() => (actor.items.get(rope.id)?.system?.container ?? null) === null, "the rope to come out");
      await pack.delete();
      await until(() => !actor.items.get(pack.id), "the empty pack to go");
      assert.ok(actor.items.get(rope.id), "the rope went with the pack");

      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        assert.ok(gearTile(sheet, rope.id), "the rope is listed nowhere");
        assert.equal(bagOf(sheet, rope.id), "", "the rope is not in the base pack");
      } finally {
        await sheet.close();
      }
    });
  });
}
