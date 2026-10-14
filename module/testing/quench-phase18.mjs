/**
 * Weight, carrying capacity and encumbrance (05 *Speed and movement*, 08 §11;
 * D-675, D-735): every item weighs something, the weight is what a thing's
 * BAG SLOTS are read off, what a worn bag holds is free, the load moves Speed
 * by two rungs, and size and Pack Hobgoblin move the capacity.
 *
 * **A CHARACTER STOPPED COUNTING POUNDS** (D-735). `system.carried` and
 * `system.carryCapacity` are gone from `CharacterData`; `system.bagSlots`
 * carries the whole summary and 08 §11's ladder turns a weight into wells.
 * The weights themselves did not move - the chapter still publishes them by
 * kind and the parser still stamps them - so the pack assertions below stand
 * exactly as they were. A creature in 14 keeps both fields, which is why
 * `quench-npc-gear*.mjs` still reads them.
 */

import { cleanup, gearTab, makeCharacter, openSheet, settle, PACK_FOR } from "./fixtures.mjs";
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
async function give(actor, name, packId = PACK_FOR.equipment) {
  const doc = (await game.packs.get(packId).getDocuments()).find(d => d.name === name);
  if (!doc) throw new Error(`${name} is not in ${packId}`);
  const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return item;
}

export function weightBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Weight and encumbrance (05 §10, 08 §11; D-675)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    it("the packs carry 08 §11's weights", async function () {
      this.timeout(60000);
      const weapons = await game.packs.get(PACK_FOR.weapon).getDocuments();
      const armor = await game.packs.get(PACK_FOR.armor).getDocuments();
      const of = (list, name) => list.find(d => d.name === name)?.system.weight;
      // The chapter's own anchors.
      assert.equal(of(weapons, "Greatsword"), 10, "a two-handed weapon is not 10 lb");
      assert.equal(of(weapons, "Dagger"), 1, "a light weapon is not 1 lb");
      assert.equal(of(armor, "Gordok warplate"), 98, "08 §11 works this one out at 98");
      assert.equal(of(armor, "Silvermoon chain"), 30, "08 §11 works this one out at 30");
      // A mount is never carried, so it has no weight at all.
      const gear = await game.packs.get(PACK_FOR.equipment).getDocuments();
      const mount = gear.find(d => String(d.system.source?.section ?? "").includes("Trained mounts"));
      assert.isNull(mount.system.weight ?? null, `${mount?.name} carries a weight`);
    });

    it("turns a weight into bag slots, and what a worn bag holds is free", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Load Hauler", classes: [["Warrior", 1]] });
      await actor.update({ "system.abilities.str.value": 10 });
      await settle();
      assert.equal(actor.system.bagSlots.base, 16, "Strength 10 carries sixteen bag slots (05)");
      assert.isUndefined(actor.system.carryCapacity, "a character is still counting pounds");
      assert.isUndefined(actor.system.carried, "a character is still counting pounds");

      // 08 §11's ladder, on the chapter's own anchors: a 10 lb greatsword is
      // TWO bag slots, and a 40 lb backpack off the bar is four.
      const sword = await give(actor, "Greatsword", PACK_FOR.weapon);
      await until(() => actor.system.bagSlots.used === 2, "a greatsword to take two bag slots");
      assert.equal(sword.system.bagSlots, 2, "the item does not say what it takes");

      const pack = await give(actor, "Backpack");
      await until(() => actor.system.bagSlots.used === 6, "an unworn backpack to take four beside it");

      // Worn, it stops taking bag slots and starts adding them (08 §11).
      await pack.update({ "system.equipped": true });
      await until(() => actor.system.bagSlots.capacity === 24, "the pack to add its eight wells");
      assert.equal(actor.system.bagSlots.used, 2, "a worn pack still takes bag slots");

      // And what goes IN it is free of the base pack.
      await sword.update({ "system.container": pack.id });
      await until(() => actor.items.get(sword.id)?.system?.container === pack.id, "the sword into the pack");
      assert.equal(actor.system.bagSlots.used, 2, "the sword stopped counting altogether");
      assert.equal(actor.system.load, "unencumbered");
    });

    it("past capacity the Speed drops 5 feet, and past twice it 15", async function () {
      this.timeout(120000);
      // **OVER CAPACITY CAN ONLY ARISE BY LOSING CAPACITY** (D-737): every
      // door refuses a pickup with no bag slot for it. A legacy world, a
      // migration and a GM's macro arrive there through the bypass, and this
      // is that state built the same way.
      const actor = await makeCharacter({ name: "ZZ Load Ox", classes: [["Warrior", 1]] });
      await actor.update({ "system.abilities.str.value": 10 });
      await settle();
      assert.equal(actor.system.bagSlots.base, 16);
      const speed = actor.system.speed;

      const torch = (await game.packs.get(PACK_FOR.equipment).getDocuments()).find(d => d.name === "Torch");
      const pile = async n => actor.createEmbeddedDocuments("Item",
        Array.from({ length: n }, () => foundry.utils.deepClone(torch.toObject())), { azerothBags: "bypass" });

      // Twenty one-slot things against sixteen wells: four fit nowhere.
      await pile(20);
      await until(() => actor.system.bagSlots.over === 4, "four bag slots to fit nowhere");
      assert.equal(actor.system.load, "encumbered", "the load does not read Encumbered");
      assert.equal(actor.system.speed, speed - 5, "Encumbered did not cost 5 feet");
      assert.ok(actor.system.speedParts.some(p => p.key === "encumbered" && p.value === -5),
        "no encumbered part on the Speed");

      // Past twice what the bags hold: Overloaded, and 15 feet instead of 5.
      const more = await pile(13);
      await until(() => actor.system.load === "overloaded", "the load to read Overloaded");
      assert.equal(actor.system.bagSlots.used, 33, "33 torches are not 33 bag slots");
      assert.equal(actor.system.speed, speed - 15, "Overloaded did not cost 15 feet");

      // And back down again when the load comes off.
      await actor.deleteEmbeddedDocuments("Item", more.map(i => i.id));
      await until(() => actor.system.load === "encumbered", "the load to fall back to Encumbered");
      assert.equal(actor.system.speed, speed - 5, "the Speed did not come back");
    });

    it("size doubles what an ogre carries, and Pack Hobgoblin doubles a goblin's", async function () {
      this.timeout(120000);
      const ogre = await makeCharacter({ name: "ZZ Load Ogre", classes: [["Warrior", 1]], race: "Ogre" });
      await ogre.update({ "system.abilities.str.value": 10 });
      await settle();
      // 05's *Size*: Large is ×2, and the ogre's Great Frame grants nothing
      // here - the doubling is the RUNG's, not the trait's (D-545).
      assert.equal(ogre.system.size, "large");
      assert.equal(ogre.system.bagSlots.base, 32, "a Large character does not carry double");

      const goblin = await makeCharacter({ name: "ZZ Load Goblin", classes: [["Rogue", 1]], race: "Goblin" });
      await goblin.update({ "system.abilities.str.value": 10 });
      await settle();
      assert.equal(goblin.system.size, "small");
      assert.equal(goblin.system.bagSlots.base, 8, "a Small character does not carry half");

      // *The bag slots you carry yourself are doubled and nobody asks how*
      // (02 §5). **INLINE, NEVER AN ACTIVE EFFECT** (D-735): a `multiply`
      // change lands in the `final` phase, after the ledger is derived, so it
      // moved the printed number and neither the load nor the Speed.
      const talent = goblin.items.find(i => i.type === "talent" && i.system.identifier === "pack-hobgoblin");
      assert.ok(talent, "the goblin did not bring Pack Hobgoblin");
      await talent.update({ "system.taken": 1 });
      await until(() => goblin.system.bagSlots.base === 16, "Pack Hobgoblin to double the bag slots");
      assert.isFalse(goblin.effects.some(e => e.getFlag("azeroth-rpg", "talentEffect") === "pack-hobgoblin"),
        "Pack Hobgoblin is still an Active Effect");

      // AND THE LOAD FOLLOWS IT. Twelve bag slots of torches fit the doubled
      // sixteen; untaken, the same twelve are four over eight.
      const torch = (await game.packs.get(PACK_FOR.equipment).getDocuments()).find(d => d.name === "Torch");
      await goblin.createEmbeddedDocuments("Item",
        Array.from({ length: 12 }, () => foundry.utils.deepClone(torch.toObject())));
      await until(() => goblin.system.bagSlots.used === 12, "the goblin to carry twelve bag slots");
      assert.equal(goblin.system.load, "unencumbered");

      await talent.update({ "system.taken": 0 });
      await until(() => goblin.system.bagSlots.base === 8, "the bag slots to fall back");
      assert.equal(goblin.system.bagSlots.over, 4, "the load did not follow the capacity");
      assert.equal(goblin.system.load, "encumbered");
    });

    it("the Gear tab draws the load as a bar, and says the state in words", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Load Bar", classes: [["Warrior", 1]] });
      await actor.update({ "system.abilities.str.value": 10 });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const bar = () => gearTab(sheet).querySelector(".azeroth-load");
        assert.ok(bar(), "the Gear tab draws no load bar");
        assert.include(bar().textContent, game.i18n.format("AZEROTH.Sheet.BagSlotsOf", { used: 0, max: 16 }),
          `the bar does not say what is carried against what can be: "${bar().textContent.trim()}"`);
        assert.ok(bar().querySelector(".azeroth-load-fill"), "the bar has no fill");
        // Unencumbered names no penalty.
        assert.notInclude(bar().textContent, game.i18n.localize("AZEROTH.Sheet.LoadEncumbered"));

        const torch = (await game.packs.get(PACK_FOR.equipment).getDocuments()).find(d => d.name === "Torch");
        await actor.createEmbeddedDocuments("Item",
          Array.from({ length: 20 }, () => foundry.utils.deepClone(torch.toObject())), { azerothBags: "bypass" });
        await until(() => actor.system.load === "encumbered", "the load to turn");
        await sheet.render({ force: true });
        await settle();
        // Colour is never the only carrier (D5): the word is on the bar, and
        // so is the overflow - over capacity can only arise by LOSING it, and
        // the character has to be told which.
        assert.include(bar().textContent, game.i18n.localize("AZEROTH.Sheet.LoadEncumbered"),
          "the bar does not name the state");
        assert.include(bar().textContent, game.i18n.format("AZEROTH.Sheet.BagSlotsOf", { used: 20, max: 16 }));
        assert.include(bar().textContent, game.i18n.format("AZEROTH.Sheet.BagSlotsOver", { n: 4 }),
          "the bar does not say how much is over");
        assert.isTrue(bar().classList.contains("is-encumbered"));

        const findings = checkText(gearTab(sheet));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
    });
  });
}
