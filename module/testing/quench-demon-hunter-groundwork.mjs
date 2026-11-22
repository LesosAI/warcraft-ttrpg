/**
 * **THE DEMON HUNTER'S HATRED AND ENERGY, THROUGH THE REAL DOORS** (the Demon Hunter plan's Phase 3):
 * the pools a Night Elf Demon Hunter holds, the cap that rises with Fel and is never trimmed when it
 * falls, a cast from the sheet's own Cast that pays Energy and gives Hatred on a failed Test as on a
 * successful one, a Short Rest turning 4 Hatred into 2 Fel, a Long Rest with Warding Tattoos, and the
 * Rogue's Energy left paying no spell.
 *
 * Needs the Demon Hunter's class item and its borrowed spells in the packs (`packs:parse` and
 * `packs:build`, a later step than the groundwork that wrote this batch). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.demon-hunter-groundwork`.
 */

import { cleanup, give, makeCharacter, settle, warnings } from "./fixtures.mjs";
import { castFromSheet, sceneWith, until } from "./quench-chronomancer-common.mjs";

const hatredOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "hatred") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const manaOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana") ?? null;
const felOf = actor => actor.system?.corruption?.fel ?? 0;

/** A Night Elf Demon Hunter at a level, its pools in place. */
async function hunterWith(name, { level = 1, spells = [] } = {}) {
  const actor = await makeCharacter({ name, classes: [["Demon Hunter", level]], race: "Night Elf", spells, abilities: { dex: 16, wis: 14 } });
  await until(() => hatredOf(actor) && energyOf(actor), "the Hatred and Energy pools");
  return actor;
}

/** Hatred set by a GM's hand (the named `hand` door). */
async function setHatred(actor, value) {
  const pool = hatredOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { hatredGain: "hand" });
  await settle();
}

export function demonHunterGroundworkBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Demon Hunter's Hatred and Energy (the Demon Hunter plan's Phase 3)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.classes").getIndex();
      if (!index.some(e => e.name === "Demon Hunter")) throw new Error("the classes pack holds no Demon Hunter: run packs:parse and rebuild the packs");
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("holds Hatred capped at 5 and Energy at 10, and the cap rises 2 for each 5 Fel", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Pools");
      assert.equal(hatredOf(dh).max, 5, "Hatred's cap at Fel 0");
      assert.equal(energyOf(dh).max, 10, "Energy's flat 10");
      assert.equal(hatredOf(dh).value, 0, "a new hunter holds none");
      await dh.update({ "system.corruption.fel": 5 });
      await until(() => hatredOf(dh).max === 7, "the cap at Fel 5");
      await dh.update({ "system.corruption.fel": 10 });
      await until(() => hatredOf(dh).max === 9, "the cap at Fel 10");
      await dh.update({ "system.corruption.fel": 0 });
    });

    it("refuses a rise that names no door, in words, and keeps what a fallen cap left above it", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Cap");
      const pool = hatredOf(dh);
      const said = await warnings(async () => {
        await dh.updatePool({ itemId: pool.itemId, kind: "momentum", value: 3 });
        await settle();
      });
      assert.ok(said.some(w => /gains Hatred only/.test(w)), `the refusal said: ${said.join(" | ")}`);
      assert.equal(hatredOf(dh).value, 0, "nothing written");
      await dh.update({ "system.corruption.fel": 10 });
      await until(() => hatredOf(dh).max === 9, "the cap at Fel 10");
      await setHatred(dh, 9);
      await until(() => hatredOf(dh).value === 9, "9 Hatred");
      // Fel falls (Fel Lash's shed, here by hand): the cap falls and the Hatred held stays.
      await dh.update({ "system.corruption.fel": 0 });
      await until(() => hatredOf(dh).max === 5, "the cap at Fel 0");
      assert.equal(hatredOf(dh).value, 9, "the Hatred held is never trimmed to a fallen cap");
      // A gain above the cap adds nothing; a spend lands as written.
      await setHatred(dh, 10);
      assert.equal(hatredOf(dh).value, 9, "a gain above the cap adds nothing");
      await setHatred(dh, 7);
      await until(() => hatredOf(dh).value === 7, "a spend from above the cap");
    });

    it("a cast from the sheet pays Energy and gives 1 plus its tier in Hatred, on a failed Test and a successful one (C63, Q7)", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Cast", { spells: ["Fel Armor"] });
      const armor = dh.items.find(i => i.type === "spell" && i.name === "Fel Armor");
      assert.ok(armor, "the borrowed Fel Armor is held");
      const mana = armor.system.mana ?? 0;
      await dh.updatePool({ itemId: energyOf(dh).itemId, kind: "power", value: 10 });
      await until(() => energyOf(dh).value === 10, "a full Energy pool");
      const energy = energyOf(dh).value;
      await sceneWith([{ actor: dh, x: 800, y: 1000 }]);
      const failed = await castFromSheet(dh, "Fel Armor", { face: 1 });
      assert.ok(failed, "the cast posted its card");
      await until(() => hatredOf(dh).value === 2, "2 Hatred for a failed tier 1 cast");
      await until(() => energyOf(dh).value === energy - mana, "the cast's Mana paid in Energy");
      const card = await castFromSheet(dh, "Fel Armor", { face: 20 });
      assert.ok(card, "the second cast posted its card");
      await until(() => hatredOf(dh).value === 4, "2 more for a successful one");
    });

    it("a Short Rest turns 4 Hatred into 2 Fel Corruption, unresisted, and empties the pool (R2)", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Short");
      await setHatred(dh, 4);
      await until(() => hatredOf(dh).value === 4, "4 Hatred");
      await dh.shortRest({ food: await give(dh, "Bread and cheese") });
      await until(() => felOf(dh) === 2, "2 Fel Corruption");
      await until(() => hatredOf(dh).value === 0, "the pool emptied");
      const card = [...game.messages].reverse().find(m => m.speaker?.actor === dh.id && /Hatred held/.test(m.content ?? ""));
      assert.ok(card, "the Fel's card names the Hatred held");
    });

    it("a Long Rest with Warding Tattoos leaves 3 out: 6 Hatred gives 1 Fel", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Long", { level: 14 });
      await until(() => dh.hasFeature("Warding Tattoos"), "Warding Tattoos granted at level 14");
      await dh.update({ "system.corruption.fel": 5 });
      await until(() => hatredOf(dh).max === 7, "the cap at Fel 5");
      await setHatred(dh, 6);
      await until(() => hatredOf(dh).value === 6, "6 Hatred");
      await dh.longRest();
      await until(() => hatredOf(dh).value === 0, "the pool emptied");
      assert.equal(felOf(dh), 6, "6 less 3 is 3, 1 Fel for 3: Fel 5 becomes 6");
    });

    it("leaves the Rogue's Energy paying no spell: a Mage and Rogue pays a Mage spell in Mana", async function () {
      this.timeout(180000);
      const mr = await makeCharacter({ name: "ZZ DH Rogue Mage", classes: [["Mage", 3], ["Rogue", 1]], race: "Human", spells: ["Frostbolt"] });
      await until(() => manaOf(mr) && energyOf(mr), "the Mana and Energy pools");
      const frostbolt = mr.items.find(i => i.type === "spell" && i.name === "Frostbolt");
      await mr.updatePool({ itemId: manaOf(mr).itemId, kind: "power", value: 10 });
      await until(() => manaOf(mr).value === 10, "a full Mana pool");
      const mana = manaOf(mr).value;
      const energy = energyOf(mr).value;
      await sceneWith([{ actor: mr, x: 800, y: 1000 }]);
      await castFromSheet(mr, "Frostbolt", { face: 20 });
      await until(() => manaOf(mr).value === mana - (frostbolt.system.mana ?? 0), "the Mana paid");
      assert.equal(energyOf(mr).value, energy, "the Rogue's Energy untouched");
      assert.equal(hatredOf(mr), null, "no Hatred pool on a Mage and Rogue");
    });
  });
}
