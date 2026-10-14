/**
 * BAG SLOTS AT THE DOCUMENT DOORS (05 *Speed and movement*, 08 §11; D-735 to
 * D-742).
 *
 * `rules/slots.mjs` has its own Vitest and knows the law. Nothing there can
 * see the thing this batch exists for: **whether anything CALLS it**. The
 * refusals live in `AzerothItem`'s static pre-operation hooks, which is the
 * one seam the Gear tab, the paper doll, the compendium browser, a sidebar
 * drag, a macro, the creator and the loot settle all pass through — and right
 * code with no caller is this repository's commonest real fault (D-681).
 *
 * Three things every test below is written around:
 *
 * - **A REFUSED CREATE IS SILENT.** `_preCreateOperation` splices the document
 *   out of the batch, so `createEmbeddedDocuments` resolves with fewer
 *   documents than it was handed and throws nothing. The COUNT is the
 *   assertion, and the warning is counted separately.
 * - **A REFUSED UPDATE OR DELETE CANCELS THE WHOLE OPERATION**, so the
 *   assertion is that the stored value did not move.
 * - **Nothing here passes the bypass except the two doors that hold it.** The
 *   sheet never does and neither do the fixtures, which is what makes these
 *   tests about the real door rather than about a flag.
 *
 * Phase 5 adds the Gear tab's own tests to this same batch.
 */

import {
  bagOf, bagWell, bagZone, browserOpen, cleanup, dragOver, forgeDrop, fromPack, gearInspector,
  gearTab, gearTile, inspect, made, makeCharacter, makeNpc, openSheet, settle, useAction,
  warnings, wellOfTile, PACK_FOR
} from "./fixtures.mjs";
import { checkSheet, checkText, formatFindings } from "./geometry.mjs";
import { SORT_STEP } from "../rules/bags.mjs";
import { ledger } from "../rules/slots.mjs";
import { buildBagUpdate } from "../migrations/0.12.10-bag-slots.mjs";
import { buildWellUpdate } from "../migrations/0.12.11-bag-wells.mjs";
import { rawSystem, walkWorld } from "../migrations/walk.mjs";
import { LOOT_OFFER_SETTING, lootOffer } from "../settings.mjs";
import { cancelOffer, claimLootQueryHandler, presentLoot } from "../documents/loot-offer.mjs";

/** Poll for exactly the thing the next line asserts (CLAUDE.md §15). */
async function until(fn, what, ms = 10000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

/** A pack document's data, ready to embed. */
const dataOf = async (name, packId = PACK_FOR.equipment) => (await fromPack(packId, name)).toObject();

/**
 * The base pack's own panel, off the live ledger.
 *
 * `system.bagSlots` carries the CHARACTER's numbers (D-735: what fits
 * nowhere), and a panel's own overflow is a different question — the one its
 * over row and Make room answer.
 */
const basePanel = actor =>
  ledger([...actor.items], actor.system.bagSlots.base).panels.find(p => p.key === "");

/** Embed one or more pack items by name, WITHOUT the fixture's throw-on-refusal. */
async function tryGive(actor, names, packId = PACK_FOR.equipment, system = null) {
  const payloads = [];
  for (const name of [names].flat()) {
    const data = await dataOf(name, packId);
    if (system) foundry.utils.mergeObject(data, { system });
    payloads.push(data);
  }
  return actor.createEmbeddedDocuments("Item", payloads);
}

/** `n` copies of one pack item, in ONE create call. */
async function tryGiveMany(actor, name, n, packId = PACK_FOR.equipment) {
  const one = await dataOf(name, packId);
  return actor.createEmbeddedDocuments("Item", Array.from({ length: n }, () => foundry.utils.deepClone(one)));
}

/** A container the character is wearing, created and then put on. */
async function wear(actor, name) {
  const [held] = await tryGive(actor, name);
  if (!held) throw new Error(`${actor.name} had no room for ${name}`);
  await held.update({ "system.equipped": true });
  await until(() => actor.items.get(held.id)?.system?.equipped === true, `${name} to go on`);
  return actor.items.get(held.id);
}

export function bagsBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Bag slots at the document doors (08 §11, D-737)", function () {
    after(async function () {
      this.timeout(180000);
      await cleanup();
    });

    /** A character with sixteen empty wells and nothing else at all. */
    async function carrier(name) {
      const actor = await makeCharacter({ name });
      assert.equal(actor.system.bagSlots.base, 16, "a Strength 10 character does not carry sixteen");
      return actor;
    }

    /* ---------------------------------------------------------------- */
    /*  Creating                                                        */
    /* ---------------------------------------------------------------- */

    it("creates what fits and names the rest, once", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Twenty");
      let made20 = [];
      const said = await warnings(async () => { made20 = await tryGiveMany(actor, "Torch", 20); });
      assert.lengthOf(made20, 16, "the batch did not stop at the sixteen wells there are");
      assert.lengthOf(actor.items.filter(i => i.name === "Torch"), 16);
      assert.lengthOf(said, 1, "a batch says what did not fit ONCE, not once per thing");
      assert.include(said[0], game.i18n.localize("AZEROTH.Bags.Refused.NoRoom"));
      assert.include(said[0], "Torch");
      assert.equal(actor.system.bagSlots.used, 16);
      assert.equal(actor.system.bagSlots.over, 0);
    });

    it("refuses a pickup with no room at all, GM or not", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Full");
      await tryGiveMany(actor, "Torch", 16);
      await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
      assert.isTrue(game.user.isGM, "this client is not a GM, and the refusal is not about permission");
      let more = [];
      const said = await warnings(async () => { more = await tryGive(actor, "Bedroll"); });
      assert.lengthOf(more, 0, "a full character took one more thing");
      assert.lengthOf(said, 1);
      assert.isNull(actor.items.find(i => i.name === "Bedroll") ?? null);
    });

    it("lets the bypass through, which is what the creator and the settle hold", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Bypass");
      await tryGiveMany(actor, "Torch", 16);
      await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
      const data = await dataOf("Bedroll");
      const [through] = await actor.createEmbeddedDocuments("Item", [data], { azerothBags: "bypass" });
      assert.ok(through, "the bypass did not let the create through");
      // And the character simply reads over, in words, rather than losing it.
      await until(() => actor.system.bagSlots.over === 1, "the bags to read one over");
      assert.equal(actor.system.load, "encumbered");
    });

    it("puts arrows in the quiver rather than in the pack — kind first", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Quiver");
      const quiver = await wear(actor, "Quiver");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      assert.ok(arrows, "the arrows were refused");
      assert.equal(arrows.system.container, quiver.id, "the arrows did not go in the quiver");
      // A quiver takes only arrows: a torch goes to the pack instead.
      const [torch] = await tryGive(actor, "Torch");
      assert.isNull(torch.system.container ?? null, "a torch went into the quiver");
    });

    it("stamps a newcomer last, at core's own sort density", async function () {
      this.timeout(120000);
      assert.equal(SORT_STEP, CONST.SORT_INTEGER_DENSITY, "the step is no longer core's");
      const actor = await carrier("ZZ Bags Sort");
      const [first] = await tryGive(actor, "Torch");
      const [second] = await tryGive(actor, "Bedroll");
      assert.isAbove(first.sort, 0, "a newcomer was left at sort 0 and would sort to the front");
      assert.equal(second.sort, first.sort + SORT_STEP);
    });

    /* ---------------------------------------------------------------- */
    /*  Worn or kept, never both (D-739)                                */
    /* ---------------------------------------------------------------- */

    it("keeps worn and kept apart at every door", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Xor");
      const sack = await wear(actor, "Sack");

      // A create naming both means the figure.
      const [both] = await tryGive(actor, "Torch", PACK_FOR.equipment, { equipped: true, container: sack.id });
      assert.isTrue(both.system.equipped, "the create did not keep it worn");
      assert.isNull(both.system.container ?? null, "a thing arrived worn AND in a bag");

      // Equipping a thing in a bag takes it out, in the same write.
      const [stowed] = await tryGive(actor, "Bedroll", PACK_FOR.equipment, { container: sack.id });
      assert.equal(stowed.system.container, sack.id);
      await stowed.update({ "system.equipped": true });
      await until(() => actor.items.get(stowed.id)?.system?.equipped === true, "the bedroll to go on");
      assert.isNull(actor.items.get(stowed.id).system.container ?? null,
        "equipping did not clear the bag in the same write");

      // And putting a worn thing in a bag takes it off.
      await stowed.update({ "system.container": sack.id });
      await until(() => actor.items.get(stowed.id)?.system?.container === sack.id, "the bedroll to go in the sack");
      assert.isFalse(actor.items.get(stowed.id).system.equipped, "a thing put in a bag stayed worn");

      // Both in one write: equipped wins.
      await stowed.update({ "system.equipped": true, "system.container": sack.id });
      await until(() => actor.items.get(stowed.id)?.system?.equipped === true, "the bedroll to go back on");
      assert.isNull(actor.items.get(stowed.id).system.container ?? null, "equipped did not win the tie");
    });

    /* ---------------------------------------------------------------- */
    /*  The bar: four, one of each kind, one mount                      */
    /* ---------------------------------------------------------------- */

    it("refuses a move into a container that is not being worn", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Off");
      const [sack] = await tryGive(actor, "Sack");
      const [torch] = await tryGive(actor, "Torch");
      const said = await warnings(() => torch.update({ "system.container": sack.id }));
      assert.isNull(actor.items.get(torch.id).system.container ?? null, "the torch went into a sack nobody is wearing");
      assert.lengthOf(said, 1);
      assert.include(said[0], sack.name);
    });

    it("refuses a thing of the wrong kind in a counted container", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Kind");
      const quiver = await wear(actor, "Quiver");
      const [torch] = await tryGive(actor, "Torch");
      const said = await warnings(() => torch.update({ "system.container": quiver.id }));
      assert.isNull(actor.items.get(torch.id).system.container ?? null, "a torch went into the quiver");
      assert.lengthOf(said, 1);
    });

    it("refuses the fifth container, a second quiver, a second mount, saddlebags with no mount and a barrel", async function () {
      this.timeout(180000);
      const actor = await carrier("ZZ Bags Bar");
      for (const name of ["Belt pouch", "Satchel", "Sack", "Backpack"]) await wear(actor, name);
      assert.equal(actor.system.bagSlots.capacity, 16 + 2 + 4 + 6 + 8, "the four bags did not add their wells");

      const refused = async (name, packId = PACK_FOR.equipment) => {
        const [held] = await tryGive(actor, name, packId);
        assert.ok(held, `${name} could not even be picked up`);
        const said = await warnings(() => held.update({ "system.equipped": true }));
        assert.isFalse(actor.items.get(held.id).system.equipped, `${name} was worn when it should have been refused`);
        assert.lengthOf(said, 1, `${name} was refused without a word`);
        return said[0];
      };

      assert.include(await refused("Enchanted satchel"), game.i18n.format(
        "AZEROTH.Bags.Refused.TooManyContainers", { max: 4 }));
      await wear(actor, "Quiver");
      assert.include(await refused("Quiver"), "arrows");
      assert.include(await refused("Saddlebags"), "Saddlebags");
      assert.include(await refused("Barrel"), "Barrel");

      // One mount at a time.
      await wear(actor, "Elwynn courser");
      assert.include(await refused("Frostwolf"), game.i18n.localize("AZEROTH.Bags.Refused.OneMount"));
    });

    /* ---------------------------------------------------------------- */
    /*  Taking things off                                               */
    /* ---------------------------------------------------------------- */

    it("refuses to take off a bag that still holds things, and allows it in a batch that empties it", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Empty");
      const sack = await wear(actor, "Sack");
      const [torch] = await tryGive(actor, "Torch", PACK_FOR.equipment, { container: sack.id });
      assert.equal(torch.system.container, sack.id);

      const said = await warnings(() => sack.update({ "system.equipped": false }));
      assert.isTrue(actor.items.get(sack.id).system.equipped, "a full sack came off");
      assert.lengthOf(said, 1);

      // The same act with the emptying in the same breath.
      await actor.updateEmbeddedDocuments("Item", [
        { _id: sack.id, "system.equipped": false },
        { _id: torch.id, "system.container": null }
      ]);
      await until(() => actor.items.get(sack.id)?.system?.equipped === false, "the sack to come off");
      assert.isNull(actor.items.get(torch.id).system.container ?? null);
    });

    it("refuses to take off a worn suit with no bag slot for it, and allows it with one", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Suit");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor, { equipped: true });
      assert.isTrue(shirt.system.equipped, "the suit did not arrive worn");
      // A chain shirt is 40 lb: four wells the moment it comes off.
      await tryGiveMany(actor, "Torch", 14);
      await until(() => actor.system.bagSlots.used === 14, "the bags to fill to fourteen");

      const said = await warnings(() => shirt.update({ "system.equipped": false }));
      assert.isTrue(actor.items.get(shirt.id).system.equipped, "the suit came off with nowhere to put it");
      assert.lengthOf(said, 1);
      assert.include(said[0], "Chain shirt");

      // Make room and it lands in the pack.
      const spare = actor.items.filter(i => i.name === "Torch").slice(0, 2);
      await actor.deleteEmbeddedDocuments("Item", spare.map(i => i.id));
      await until(() => actor.system.bagSlots.used === 12, "the bags to come down to twelve");
      await shirt.update({ "system.equipped": false });
      await until(() => actor.items.get(shirt.id)?.system?.equipped === false, "the suit to come off");
      assert.equal(actor.system.bagSlots.used, 16, "the suit is not being carried");
    });

    it("houses the ring a third one displaces, in the write that put the third one on", async function () {
      this.timeout(120000);
      // **THE APPENDED PLACEMENT** (D-737). `judge` may hand back a placement
      // for a document the batch never named - the ring 08 §11's two-finger
      // slot puts away - and `_preUpdateOperation` APPENDS it to
      // `operation.updates`. Nothing live had ever exercised that: every
      // earlier test went through a door that already named both documents.
      const actor = await carrier("ZZ Bags Third Ring");
      const rings = await tryGiveMany(actor, "Ring", 3);
      assert.lengthOf(rings, 3, "the three rings were not picked up");
      await actor.updateEmbeddedDocuments("Item", rings.slice(0, 2).map(r => ({ _id: r.id, "system.equipped": true })));
      await until(() => actor.items.filter(i => i.name === "Ring" && i.system.equipped).length === 2,
        "two rings to go on");

      const third = actor.items.get(rings[2].id);
      // ONE document, ONE field, naming nothing else: the displaced ring has
      // to come off and find a bag on the strength of the judgement alone.
      await third.update({ "system.equipped": true });
      await until(() => actor.items.get(third.id)?.system?.equipped === true, "the third ring to go on");
      await until(() => actor.items.filter(i => i.name === "Ring" && i.system.equipped === true).length === 2,
        "the displaced ring to come off");
      const off = rings.slice(0, 2).map(r => actor.items.get(r.id)).find(r => r.system.equipped === false);
      assert.ok(off, "no ring came off when the third went on");
      assert.isNull(off.system.container ?? null, "the displaced ring did not land in the base pack");
      assert.equal(actor.system.bagSlots.used, 1, "the displaced ring is not being carried");
    });

    it("refuses a quantity that needs another well, and allows it once there is one", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Stack");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      await arrows.update({ "system.quantity": 20 });
      await until(() => actor.items.get(arrows.id)?.system?.quantity === 20, "the bundle to hold twenty");
      // Twenty share one well; fill the other fifteen.
      await tryGiveMany(actor, "Torch", 15);
      await until(() => actor.system.bagSlots.used === 16, "the bags to fill");

      const said = await warnings(() => arrows.update({ "system.quantity": 21 }));
      assert.equal(actor.items.get(arrows.id).system.quantity, 20, "the twenty-first arrow found a well");
      assert.lengthOf(said, 1);
      assert.equal(said[0], game.i18n.localize("AZEROTH.Bags.Refused.NoRoomForMore"));

      const torch = actor.items.find(i => i.name === "Torch");
      await torch.delete();
      await until(() => actor.system.bagSlots.used === 15, "a well to come free");
      await arrows.update({ "system.quantity": 21 });
      await until(() => actor.items.get(arrows.id)?.system?.quantity === 21, "the bundle to grow");
    });

    it("refuses to delete a worn bag that still holds things, and allows the pair", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Delete");
      const sack = await wear(actor, "Sack");
      const [torch] = await tryGive(actor, "Torch", PACK_FOR.equipment, { container: sack.id });
      const said = await warnings(() => sack.delete());
      assert.ok(actor.items.get(sack.id), "a full sack was deleted and its contents spilled");
      assert.lengthOf(said, 1);
      assert.include(said[0], "Sack");
      await actor.deleteEmbeddedDocuments("Item", [sack.id, torch.id]);
      assert.isUndefined(actor.items.get(sack.id));
    });

    it("never judges an unrelated write, even on a character already over capacity", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Over");
      await tryGiveMany(actor, "Torch", 16);
      let skin = null;
      await warnings(async () => { [skin] = await tryGive(actor, "Waterskin"); });
      assert.isNull(skin ?? null, "the sixteen wells were not full");
      // Strength drops: the same things, fewer wells.
      await actor.update({ "system.abilities.str.value": 3 });
      await until(() => actor.system.bagSlots.over > 0, "the bags to read over");
      assert.equal(actor.system.bagSlots.base, 12, "Strength 3 does not carry twelve");
      assert.equal(actor.system.load, "encumbered");

      const torch = actor.items.find(i => i.name === "Torch");
      await torch.update({ name: "ZZ Renamed Torch", sort: 999 });
      await until(() => actor.items.get(torch.id)?.name === "ZZ Renamed Torch", "the rename to land");
      assert.equal(actor.items.get(torch.id).sort, 999, "a sort was refused on an over-capacity character");
      // And moving something OUT is always allowed: no write may raise the overflow.
      await torch.delete();
      await until(() => actor.system.bagSlots.used === 15, "the torch to leave");
    });

    /* ---------------------------------------------------------------- */
    /*  The capacity itself                                             */
    /* ---------------------------------------------------------------- */

    it("gives a goblin eight bag slots and sixteen with Pack Hobgoblin, with no Active Effect", async function () {
      this.timeout(180000);
      const goblin = await makeCharacter({ name: "ZZ Bags Goblin", classes: [["Rogue", 1]], race: "Goblin" });
      await goblin.update({ "system.abilities.str.value": 10 });
      await settle();
      assert.equal(goblin.system.size, "small");
      assert.equal(goblin.system.bagSlots.base, 8, "a Small character does not carry half");

      const talent = goblin.items.find(i => i.type === "talent" && i.system.identifier === "pack-hobgoblin");
      assert.ok(talent, "the goblin did not bring Pack Hobgoblin");
      await talent.update({ "system.taken": 1 });
      await until(() => goblin.system.bagSlots.base === 16, "Pack Hobgoblin to double the bag slots");
      // **INLINE, NOT AN EFFECT** (D-735): a `multiply` change in the final
      // phase lands after the ledger is derived, so it moved the number the
      // sheet printed and neither the load state nor the Speed part.
      assert.isFalse(goblin.effects.some(e => e.getFlag("azeroth-rpg", "talentEffect") === "pack-hobgoblin"),
        "Pack Hobgoblin is still an Active Effect");
      assert.equal(goblin.system.load, "unencumbered");

      await talent.update({ "system.taken": 0 });
      await until(() => goblin.system.bagSlots.base === 8, "the bag slots to fall back");
    });

    it("reads over capacity and the Speed penalty when the capacity is what moved", async function () {
      this.timeout(120000);
      const actor = await carrier("ZZ Bags Drain");
      await tryGiveMany(actor, "Torch", 16);
      await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
      const speed = actor.system.speed;
      assert.equal(actor.system.bagSlots.over, 0);

      await actor.update({ "system.abilities.str.value": 6 });
      await until(() => actor.system.bagSlots.over === 2, "two bag slots to read over");
      assert.equal(actor.system.load, "encumbered");
      assert.equal(actor.system.speed, speed - 5, "Encumbered did not cost five feet");
      assert.isTrue(actor.system.speedParts.some(p => p.key === "encumbered" && p.value === -5));

      await actor.update({ "system.abilities.str.value": 10 });
      await until(() => actor.system.bagSlots.over === 0, "the capacity to come back");
      assert.equal(actor.system.speed, speed);
    });

    /* ---------------------------------------------------------------- */
    /*  The three doors that hold the bypass                            */
    /* ---------------------------------------------------------------- */

    it("migrates a world that kept things where they no longer go, and does it once", async function () {
      this.timeout(180000);
      const actor = await carrier("ZZ Bags Legacy");
      const [sack] = await tryGive(actor, "Sack");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      const [torch] = await tryGive(actor, "Torch");

      // **STALE IT BY HAND.** Every door below refuses exactly the state the
      // migration repairs, so they are swapped out to write it - and put back
      // in a `finally`, because a checker that throws never reaches a trailing
      // restore (D-546's lesson, in a different file).
      const cls = CONFIG.Item.documentClass;
      const held = {
        preUpdate: cls.prototype._preUpdate,
        create: cls._preCreateOperation,
        update: cls._preUpdateOperation,
        remove: cls._preDeleteOperation
      };
      const nothing = async () => {};
      try {
        cls.prototype._preUpdate = nothing;
        cls._preCreateOperation = nothing;
        cls._preUpdateOperation = nothing;
        cls._preDeleteOperation = nothing;
        await actor.updateEmbeddedDocuments("Item", [
          // Worn AND kept in a bag, which nothing used to stop.
          { _id: shirt.id, "system.equipped": true, "system.container": sack.id },
          // In a sack nobody is wearing, which is how D-671 stored it.
          { _id: torch.id, "system.container": sack.id }
        ]);
      } finally {
        cls.prototype._preUpdate = held.preUpdate;
        cls._preCreateOperation = held.create;
        cls._preUpdateOperation = held.update;
        cls._preDeleteOperation = held.remove;
      }
      await until(() => actor.items.get(shirt.id)?.system?.container === sack.id, "the stale state to land");

      const rowsOf = doc => [...doc.items].map(i => ({ id: i.id, type: i.type, name: i.name, system: rawSystem(i) }));
      const forOurs = doc => (doc.id === actor.id ? buildBagUpdate(rowsOf(doc), { character: true }) : null);
      const touched = await walkWorld({ items: forOurs }, () => {});
      assert.isAbove(touched, 0, "the migration found nothing to repair");

      await until(() => (actor.items.get(shirt.id)?.system?.container ?? null) === null,
        "the worn suit to leave the sack");
      assert.isTrue(actor.items.get(sack.id).system.equipped, "the sack that holds the torch was not put on");
      assert.equal(actor.items.get(torch.id).system.container, sack.id, "the torch left the sack it was in");

      // A SECOND RUN TOUCHES NOTHING.
      assert.equal(await walkWorld({ items: forOurs }, () => {}), 0, "the migration is not idempotent");
    });

    it("finishes Kaelen Voss at nineteen bag slots, and refuses a kit that will not fit", async function () {
      this.timeout(240000);
      const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
      const road = [];
      for (const name of ["Bedroll", "Waterskin", "Tinderbox", "Hardtack, a week", "Rope, 50 ft (hemp)"]) {
        road.push({ uuid: await uuidOf(PACK_FOR.equipment, name), quantity: 1, road: true });
      }
      const kaelen = {
        race: await uuidOf(PACK_FOR.race, "Human"),
        cls: await uuidOf(PACK_FOR.class, "Warrior"),
        method: "array",
        abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
        rolled: null,
        career: await uuidOf(PACK_FOR.career, "Grave-Tender"),
        allowTier2: false,
        ranks: { athletics: 3, survival: 2 },
        adaptable: "perception",
        racialTalent: "Refugee's Road",
        classTalent: "wide-swing",
        spells: [],
        side: null,
        equipment: [
          { uuid: await uuidOf(PACK_FOR.armor, "Studded leather"), quantity: 1, road: false },
          { uuid: await uuidOf(PACK_FOR.weapon, "Greataxe"), quantity: 1, road: false },
          ...road
        ],
        name: "ZZ Bags Kaelen",
        img: "icons/svg/mystery-man.svg",
        motive: "The dead of Lordaeron do not stay down."
      };

      // An overstuffed kit is refused BY THE BOOK, before anything is made.
      const torch = await uuidOf(PACK_FOR.equipment, "Torch");
      const stuffed = new (game.system.azeroth.creator)({});
      let refused = null;
      await warnings(async () => {
        refused = await stuffed.apply({
          ...kaelen,
          name: "ZZ Bags Overstuffed",
          equipment: [...kaelen.equipment, ...Array.from({ length: 20 }, () => ({ uuid: torch, quantity: 1, road: false }))]
        });
      });
      assert.isFalse(refused.ok, "an overstuffed kit was made anyway");
      assert.include(refused.reasons.map(r => r.code), "noRoom", JSON.stringify(refused.reasons));
      assert.isNull(refused.actor);

      // And the chapter's own worked example fits, with nineteen wells.
      const creator = new (game.system.azeroth.creator)({});
      const result = await creator.apply(kaelen);
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      made.push(result.actor);
      assert.equal(result.actor.system.bagSlots.base, 19, "Strength 16 does not carry nineteen");
      assert.equal(result.actor.system.bagSlots.over, 0, "Kaelen walked out over capacity");
      assert.equal(result.actor.system.load, "unencumbered");
      // The suit and the axe are worn, so the five road things are what he carries.
      assert.equal(result.actor.system.bagSlots.used, 5, "the kit is not five loose things");
    });

    it("refuses a loot take with no bag slot for it, and says so in the offer's own words", async function () {
      this.timeout(180000);
      const savedOffer = game.settings.get("azeroth-rpg", LOOT_OFFER_SETTING) ?? null;
      const savedCharacter = game.user.character?.id ?? null;
      const actor = await carrier("ZZ Bags Looter");
      let find = null;
      try {
        await game.user.update({ character: actor.id });
        if (lootOffer()) await cancelOffer();
        await until(() => lootOffer() === null, "any standing offer to close");

        // A world Item to offer: a chain shirt is four wells the moment it lands.
        find = await Item.create({ ...(await dataOf("Chain shirt", PACK_FOR.armor)), name: "ZZ Bags Find" });
        made.push(find);
        const offer = await presentLoot({ items: [find], copper: 0, label: "ZZ Bags offer", userIds: [game.user.id] });
        assert.ok(offer, "presentLoot refused the offer");
        const row = offer.rows.find(r => r.kind === "item");

        // Fill the bags, then try to take it.
        await tryGiveMany(actor, "Torch", 16);
        await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
        let error = null;
        try {
          await claimLootQueryHandler({ offerId: offer.id, rowId: row.id, action: "take" }, { user: game.user });
        } catch (err) {
          error = err;
        }
        assert.ok(error, "a full character took the find anyway");
        assert.equal(error.message, game.i18n.format("AZEROTH.LootOffer.Refuse.NoRoom", { name: row.name }));
        assert.isNull(lootOffer().rows.find(r => r.id === row.id).claimedBy, "the refused row was claimed");

        // With room it goes through.
        const spare = actor.items.filter(i => i.name === "Torch").slice(0, 4);
        await actor.deleteEmbeddedDocuments("Item", spare.map(i => i.id));
        await until(() => actor.system.bagSlots.used === 12, "four wells to come free");
        const took = await claimLootQueryHandler({ offerId: offer.id, rowId: row.id, action: "take" }, { user: game.user });
        assert.isTrue(took.ok, "the take was refused with room for it");
        // The take completes the offer, so the settle runs on the chain behind
        // the handler. It embeds under the bypass, and the find lands.
        await until(() => lootOffer() === null, "the settle to hand the find over", 60000);
        await until(() => actor.items.find(i => i.name === "ZZ Bags Find") ?? null, "the find to reach the sheet");
      } finally {
        if (lootOffer()) await cancelOffer().catch(() => {});
        await game.settings.set("azeroth-rpg", LOOT_OFFER_SETTING, savedOffer).catch(() => {});
        await game.user.update({ character: savedCharacter }).catch(() => {});
        const cards = game.messages
          .filter(m => ["lootOffer", "lootSettled"].includes(m.flags?.["azeroth-rpg"]?.kind))
          .map(m => m.id);
        if (cards.length) await ChatMessage.deleteDocuments(cards).catch(() => {});
      }
    });
  });

  /* ================================================================== */
  /*  The Gear tab (D-738, D-740, D-741)                                */
  /* ================================================================== */

  describe("The Gear tab as bag slots (08 §11, D-738)", function () {
    /** Every sheet this half opened, closed together. */
    const sheets = [];

    after(async function () {
      this.timeout(180000);
      for (const sheet of sheets.splice(0)) await sheet.close().catch(() => {});
      await cleanup();
    });

    /** A character on the Gear tab, with whatever bags the test asks for. */
    async function onGear(name, { bags = [] } = {}) {
      const actor = await makeCharacter({ name, bags });
      const sheet = await openSheet(actor);
      sheets.push(sheet);
      sheet.changeTab("gear", "primary");
      await settle();
      return { actor, sheet };
    }

    /** Re-render and wait for the tab to be drawn again (AppV2 detaches controls). */
    async function redraw(sheet) {
      await sheet.render();
      await settle();
    }

    const cellsOf = (sheet, key) => [...(bagZone(sheet, key)?.querySelector(".azeroth-bag-grid")?.children ?? [])];

    /* ---------------------------------------------------------------- */
    /*  The wells                                                       */
    /* ---------------------------------------------------------------- */

    it("draws exactly the wells the character has, and a taken well for every slot past the first", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Wells");
      assert.lengthOf(cellsOf(sheet, ""), 16, "the base pack did not draw its sixteen wells");

      // A chain shirt is 40 lb: one tile and three taken wells (08 §11).
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await redraw(sheet);
      assert.ok(gearTile(sheet, shirt.id), "the suit drew no tile");
      const taken = cellsOf(sheet, "").filter(el => el.dataset.of === shirt.id);
      assert.lengthOf(taken, 3, "a 40 lb suit did not take four wells");
      // **NEVER A SECOND `data-item-id`**, or every selector that finds a tile
      // by id would find two of it.
      assert.isTrue(taken.every(el => el.dataset.itemId === undefined), "a taken well carries an item id");
      assert.isTrue(taken.every(el => el.getAttribute("aria-hidden") === "true"));
      assert.lengthOf(cellsOf(sheet, ""), 16, "the panel stopped drawing its capacity");
      // AND THE SIZE IS SAID IN WORDS, never by the run of wells alone.
      const card = await inspect(sheet, shirt.id);
      assert.include(card.textContent, game.i18n.format("AZEROTH.Item.BagSlotsTakes", { n: 4 }));
    });

    it("ghosts the owner's icon in every well it takes, and a press there picks the owner", async function () {
      this.timeout(120000);
      // EVERY TAKEN WELL DREW THE SAME CHAIN LINK, so a run that wrapped onto
      // the next row was indistinguishable from its neighbour's without
      // hovering (the first loaded shot, D-611). The ghost says whose it is.
      const { actor, sheet } = await onGear("ZZ Gear Ghost");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await redraw(sheet);
      const taken = cellsOf(sheet, "").filter(el => el.dataset.of === shirt.id);
      assert.lengthOf(taken, 3, "the suit did not take four wells");

      const ghosts = taken.map(el => el.querySelector("img.azeroth-bag-ghost"));
      assert.isTrue(ghosts.every(Boolean), "a taken well drew no ghost of its owner");
      assert.isTrue(ghosts.every(img => img.getAttribute("src") === shirt.img),
        "a ghost is not the owner's own icon");
      // DECORATION AND NOTHING ELSE: out of the accessibility tree, out of the
      // drag, and never a second `data-item-id` for a selector to find.
      assert.isTrue(ghosts.every(img => img.getAttribute("alt") === ""), "a ghost carries alt text");
      assert.isTrue(ghosts.every(img => img.draggable === false), "a ghost is draggable on its own");
      assert.isTrue(ghosts.every(img => img.dataset.itemId === undefined), "a ghost carries an item id");
      // The link glyph stays, as the mark that this is a continuation.
      assert.isTrue(taken.every(el => el.querySelector("i.fa-link")), "a taken well lost its link mark");

      // A CLICK ON A TAKEN WELL IS A CLICK ON ITS OWNER: the well wears the
      // owner's face, so a press has to do what a press on the thing does.
      taken[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await settle();
      const card = sheet.element.querySelector(`.azeroth-bag-inspect[data-item-id="${shirt.id}"]`);
      assert.ok(card, "the suit has no card");
      assert.isFalse(card.hidden, "a press on a taken well did not select its owner");
    });

    it("moves the stack boundary with the quantity, at twenty", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Stack");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      await arrows.update({ "system.quantity": 20 });
      await until(() => actor.items.get(arrows.id)?.system?.quantity === 20, "the bundle to hold twenty");
      await redraw(sheet);
      assert.lengthOf(cellsOf(sheet, "").filter(el => el.dataset.of === arrows.id), 0,
        "twenty arrows took more than one well");
      assert.equal(gearTile(sheet, arrows.id).querySelector(".azeroth-bag-count")?.textContent.trim(), "20");

      // *the twenty-first starts a second* (08 §11).
      await arrows.update({ "system.quantity": 21 });
      await until(() => actor.items.get(arrows.id)?.system?.quantity === 21, "the bundle to grow");
      await redraw(sheet);
      assert.lengthOf(cellsOf(sheet, "").filter(el => el.dataset.of === arrows.id), 1,
        "the twenty-first arrow found no second well");
    });

    /* ---------------------------------------------------------------- */
    /*  Selection and the inspector                                     */
    /* ---------------------------------------------------------------- */

    it("selects on a click, survives a render, and clears when the thing is deleted", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Select");
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);

      const { el, registered } = useAction(sheet, "selectItem", { within: gearTab(sheet) });
      assert.ok(el, "no tile carries selectItem");
      assert.isTrue(registered, "selectItem is not registered - the click is a silent no-op");

      const card = await inspect(sheet, torch.id);
      assert.isFalse(card.hidden, "the card did not open");
      assert.isTrue(gearTile(sheet, torch.id).classList.contains("is-selected"));
      assert.equal(gearTile(sheet, torch.id).getAttribute("aria-selected"), "true");

      // A SECOND CLICK STILL SELECTS: a toggle would make the double-click's
      // first half undo the pick its second half acts on.
      gearTile(sheet, torch.id).click();
      await settle();
      assert.isFalse(gearInspector(sheet, torch.id).hidden, "a second click closed the card");

      // It survives a render that happened for another reason.
      await redraw(sheet);
      assert.isFalse(gearInspector(sheet, torch.id).hidden, "the pick did not survive a render");

      await torch.delete();
      await redraw(sheet);
      assert.isNull(gearInspector(sheet, torch.id), "a deleted thing kept its card");
      // **WITH NOTHING SELECTED THE PREVIEW SAYS NOTHING** (the lead,
      // 2026-09-20): the section is its title strip alone. There is no hint
      // paragraph any more, so the assertion is that the BODY draws nothing.
      const body = gearTab(sheet).querySelector(".azeroth-bag-inspector-body");
      assert.ok(body, "the preview lost its body");
      assert.lengthOf([...body.querySelectorAll(".azeroth-bag-inspect:not([hidden])")], 0,
        "something was still drawn in the preview when the pick went away");
    });

    /* ---------------------------------------------------------------- */
    /*  The headers, and the Item Preview (the lead, 2026-09-20)        */
    /* ---------------------------------------------------------------- */

    it("names every run in one word, and heads the tab with none", async function () {
      this.timeout(180000);
      // The lead named *Carried* as the model of a simple header, so the bar's
      // runs are one word each. **The free panel is NOT renamed to Carried**:
      // 05's *Speed and movement* keeps what you wear and hold apart from what
      // you carry, and *Carried* already names the base pack.
      const { sheet } = await onGear("ZZ Gear Headers", { bags: ["Backpack"] });
      const tab = gearTab(sheet);

      const runs = [...tab.querySelectorAll(".azeroth-bag-bar-head")].map(h => h.textContent.trim());
      assert.deepEqual(runs, ["Bags", "Mount", "Stable"], `the bar's runs read ${runs.join(" | ")}`);

      const panels = [...tab.querySelectorAll(".azeroth-bag-panel-name")].map(h => h.textContent.trim());
      assert.include(panels, "Worn", `no Worn panel: ${panels.join(" | ")}`);
      assert.include(panels, "Carried", `no Carried panel: ${panels.join(" | ")}`);
      assert.notInclude(panels, "Worn and held", "the free panel kept its old name");

      assert.equal(tab.querySelector(".azeroth-bag-inspector-head").textContent.trim(), "Item Preview");

      // **NO `<h3>` ON THE TAB.** The bar's first run is *Bags* now, so a
      // heading of the same word above it labelled that one run - and the tab
      // button already says GEAR. The carry line is the slab's top strip.
      assert.isNull(tab.querySelector("h3"), "the Gear tab still draws a heading above the bar");
      assert.ok(tab.getAttribute("aria-label"), "the tab lost its heading and gained no accessible name");
    });

    it("hides and unhides the Item Preview, widens the bags, and remembers it", async function () {
      this.timeout(240000);
      const held = game.user.getFlag("azeroth-rpg", "gearPreview");
      try {
        const { actor, sheet } = await onGear("ZZ Gear Preview", { bags: ["Backpack"] });
        const [torch] = await tryGive(actor, "Torch");
        await redraw(sheet);

        const aside = () => gearTab(sheet).querySelector(".azeroth-bag-inspector");
        const body = () => gearTab(sheet).querySelector(".azeroth-bag-inspector-body");
        const bagsWidth = () => gearTab(sheet).querySelector(".azeroth-bags").getBoundingClientRect().width;
        // AppV2 detaches controls on a render, so the button is re-queried
        // before every dispatch (CLAUDE.md §14).
        const toggle = () => gearTab(sheet).querySelector('[data-action="togglePreview"]');

        // IT STARTS OPEN for a reader who has never touched it.
        assert.isFalse(body().hidden, "the preview did not default to open");
        assert.equal(toggle().getAttribute("aria-expanded"), "true");
        const { registered } = useAction(sheet, "togglePreview", { within: gearTab(sheet) });
        assert.isTrue(registered, "togglePreview is not registered — the press is a silent no-op");
        // A REAL BUTTON, so it is in the tab order and Enter presses it.
        assert.equal(toggle().tagName, "BUTTON", "the toggle is not a button");
        assert.equal(toggle().getAttribute("aria-controls"), body().id, "aria-controls names nothing");
        assert.notEqual(body().id, "", "the preview body has no id for aria-controls to name");

        // Selecting still fills it.
        const card = await inspect(sheet, torch.id);
        assert.isFalse(card.hidden, "the card did not open");
        const open = bagsWidth();

        // SHUT: the body goes, the bags widen, the word turns.
        toggle().click();
        await settle();
        assert.isTrue(body().hidden, "the press did not hide the preview");
        assert.equal(toggle().getAttribute("aria-expanded"), "false");
        assert.equal(toggle().textContent.trim(), game.i18n.localize("AZEROTH.Bags.PreviewShow"));
        assert.isAbove(bagsWidth(), open, "the bags did not take the full width");
        // AND IT MEASURES CLEAN SHUT, on the slab, with the strip still drawn.
        const shut = checkText(gearTab(sheet), { requireGroundWithin: true });
        assert.deepEqual(shut, [], formatFindings(shut));

        // IT SURVIVES A RENDER that happened for another reason.
        await redraw(sheet);
        assert.isTrue(body().hidden, "the preview came back open after a render");
        assert.isTrue(aside().classList.contains("is-closed"));

        // AND IT IS THE READER'S OWN, kept on `game.user`: a sheet opened
        // after it comes up shut. **Wait for exactly what is asserted** — the
        // press does not await the write, which is a round trip to the
        // server (CLAUDE.md §15).
        await until(() => game.user.getFlag("azeroth-rpg", "gearPreview") === false,
          "the preview state to reach the user");
        const { sheet: second } = await onGear("ZZ Gear Preview Two");
        assert.isTrue(second.element.querySelector(".azeroth-bag-inspector-body").hidden,
          "a second sheet did not read the reader's own state");

        // BACK OPEN, and the pick is still there.
        toggle().click();
        await settle();
        assert.isFalse(body().hidden, "the second press did not unhide it");
        assert.isFalse(gearInspector(sheet, torch.id).hidden, "the pick did not survive the toggle");
      } finally {
        // Restore what the test changed, or every later test in the suite
        // opens on a shut preview (CLAUDE.md §14 on fixture pollution).
        if (held === undefined) await game.user.unsetFlag("azeroth-rpg", "gearPreview").catch(() => null);
        else await game.user.setFlag("azeroth-rpg", "gearPreview", held).catch(() => null);
      }
    });

    it("gives each kind of thing the controls its own row used to carry", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Controls", { bags: ["Backpack"] });
      const [skin] = await tryGive(actor, "Waterskin");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await redraw(sheet);

      const has = (card, action) => Boolean(card.querySelector(`[data-action="${action}"]`));
      const water = await inspect(sheet, skin.id);
      assert.isTrue(has(water, "spendCharge"), "a waterskin has no Use one");
      assert.isTrue(has(water, "fillCharges"), "a waterskin cannot be filled");
      assert.isTrue(has(water, "openItem"));
      assert.isTrue(has(water, "deleteItem"));

      const suit = await inspect(sheet, shirt.id);
      assert.isTrue(has(suit, "toggleEquipped"), "a suit cannot be worn from its card");
      assert.isFalse(has(suit, "spendCharge"), "a suit holds charges");

      // A CONTAINER IS WEARABLE TOO (D-736): the bag bar is a main door now.
      const pack = actor.items.find(i => i.name === "Backpack");
      const bag = await inspect(sheet, pack.id);
      assert.isTrue(has(bag, "toggleEquipped"), "a worn container has no Equip control");

      // *Take out* only where the thing is in a bag.
      await skin.update({ "system.container": pack.id });
      await until(() => actor.items.get(skin.id)?.system?.container === pack.id, "the skin to go in the pack");
      await redraw(sheet);
      assert.isTrue(has(await inspect(sheet, skin.id), "takeOutItem"));
    });

    it("runs the thing's own action on a double-click", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Double");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await redraw(sheet);
      const tile = gearTile(sheet, shirt.id);
      assert.equal(tile.dataset.primary, "toggleEquipped", "a suit's press is not Equip");
      tile.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await until(() => actor.items.get(shirt.id)?.system?.equipped === true, "the suit to go on");
      await redraw(sheet);
      assert.equal(bagOf(sheet, shirt.id), "equipped", "the suit did not move to the figure's panel");
      assert.equal(actor.system.bagSlots.used, 0, "a worn suit is still taking bag slots");
    });

    /* ---------------------------------------------------------------- */
    /*  The tooltip                                                     */
    /* ---------------------------------------------------------------- */

    it("says the kind, the rarity and the bag slots on the tooltip, and measures clean", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Tip");
      const [rope] = await tryGive(actor, "Rope, 50 ft (hemp)");
      await redraw(sheet);
      const tile = gearTile(sheet, rope.id);
      assert.ok(tile.dataset.tooltipHtml, "the tile carries no tooltip");

      game.tooltip.activate(tile);
      // WAIT FOR THE PAINT, not for a guess at a delay: a contrast measured
      // mid-fade is a colour nobody ever sees (D-733).
      await until(() => getComputedStyle(game.tooltip.tooltip).opacity === "1", "the tooltip to come up");
      const card = game.tooltip.tooltip;
      assert.include(card.textContent, rope.name);
      assert.include(card.textContent, game.i18n.localize("AZEROTH.Bags.Kind.gear"));
      assert.include(card.textContent, game.i18n.localize("AZEROTH.Bags.Place.base"));
      assert.isTrue(card.classList.contains("azeroth-item-tip"), "the tooltip took no class of ours");
      const findings = checkText(card);
      assert.deepEqual(findings, [], formatFindings(findings));
      game.tooltip.deactivate();
    });

    /* ---------------------------------------------------------------- */
    /*  The keyboard                                                    */
    /* ---------------------------------------------------------------- */

    it("walks the wells with the arrows and selects with Enter", async function () {
      this.timeout(120000);
      const { actor, sheet } = await onGear("ZZ Gear Keys");
      const made3 = await tryGiveMany(actor, "Torch", 3);
      assert.lengthOf(made3, 3);
      await redraw(sheet);
      const tiles = [...gearTab(sheet).querySelectorAll(".azeroth-bag-tile")];
      assert.isAtLeast(tiles.length, 3);

      tiles[0].focus();
      tiles[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      await settle();
      assert.equal(document.activeElement, tiles[1], "ArrowRight did not move the focus");
      tiles[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      await settle();
      assert.equal(document.activeElement, tiles[0], "Home did not go to the first tile");

      // Enter presses it: a tile is an `li`, and AppV2 fires an action on a
      // CLICK alone, so `bindKeyActivation` is what makes the keyboard work.
      tiles[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await settle();
      assert.isTrue(tiles[0].classList.contains("is-selected"), "Enter did not select the tile");
    });

    /* ---------------------------------------------------------------- */
    /*  The drop table                                                  */
    /* ---------------------------------------------------------------- */

    it("puts a thing in the bag it is dropped on, and takes it out again", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Drop", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      assert.equal(bagOf(sheet, torch.id), "", "the torch did not start in the base pack");

      forgeDrop(bagZone(sheet, pack.id), { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.container === pack.id, "the torch to go in the pack");
      await redraw(sheet);
      assert.equal(bagOf(sheet, torch.id), pack.id);

      forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: torch.uuid });
      await until(() => (actor.items.get(torch.id)?.system?.container ?? null) === null, "the torch to come out");
    });

    it("wears what is dropped on the figure, and brings what is dropped on the mount place", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Wear");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      const [horse] = await tryGive(actor, "Elwynn courser");
      await redraw(sheet);

      forgeDrop(bagZone(sheet, "equipped"), { type: "Item", uuid: shirt.uuid });
      await until(() => actor.items.get(shirt.id)?.system?.equipped === true, "the suit to go on");

      forgeDrop(bagZone(sheet, "mount"), { type: "Item", uuid: horse.uuid });
      await until(() => actor.items.get(horse.id)?.system?.equipped === true, "the horse to come along");
      await until(() => actor.system.bagSlots.capacity === 32, "the mount to add its sixteen wells");

      await redraw(sheet);
      forgeDrop(bagZone(sheet, "stable"), { type: "Item", uuid: horse.uuid });
      await until(() => actor.items.get(horse.id)?.system?.equipped === false, "the horse to be stabled");
      await until(() => actor.system.bagSlots.capacity === 16, "the wells to go with it");
    });

    it("refuses to leave a LOADED mount behind, at both doors, and lets an empty one go", async function () {
      this.timeout(240000);
      // **08 §11 SAYS OF A MOUNT WHAT IT SAYS OF A BAG**: a container *comes
      // off empty* and a mount *is unloaded before you leave it behind*. The
      // law held the bag to it and skipped every mount whole, so a horse
      // carrying a torch was STABLED and the torch followed the character
      // into their own bags in silence - or, where it did not fit, the
      // refusal read *Inventory is full*, which is a sentence about the
      // character rather than about the horse.
      const { actor, sheet } = await onGear("ZZ Gear Mount Load");
      const [horse] = await tryGive(actor, "Elwynn courser");
      await horse.update({ "system.equipped": true });
      await until(() => actor.system.bagSlots.capacity === 32, "the horse to add its sixteen wells");
      const [torch] = await tryGive(actor, "Torch");
      await torch.update({ "system.container": horse.id });
      await until(() => actor.items.get(torch.id)?.system?.container === horse.id, "the torch to go on the horse");
      await redraw(sheet);
      assert.equal(bagOf(sheet, torch.id), horse.id, "the torch is not in the mount's own panel");

      // DOOR ONE: dropped on the Stable strip.
      const said = await warnings(async () => {
        forgeDrop(bagZone(sheet, "stable"), { type: "Item", uuid: horse.uuid });
        await new Promise(r => setTimeout(r, 500));
      });
      assert.isTrue(actor.items.get(horse.id).system.equipped, "a loaded horse was stabled");
      assert.equal(actor.items.get(torch.id).system.container, horse.id, "the load followed the character");
      assert.lengthOf(said, 1, "the refusal was not said in words");
      assert.include(said[0], horse.name);

      // DOOR TWO: the inspector's own control, which writes the same field
      // from a different place - a rule enforced at one door is enforced
      // nowhere (D-686).
      await redraw(sheet);
      const card = await inspect(sheet, horse.id);
      const button = card.querySelector('[data-action="toggleEquipped"]');
      assert.ok(button, "the mount's own card carries no Equip control");
      const also = await warnings(async () => {
        button.click();
        await new Promise(r => setTimeout(r, 500));
      });
      assert.isTrue(actor.items.get(horse.id).system.equipped, "the inspector stabled a loaded horse");
      assert.lengthOf(also, 1, "the second door refused without a word");

      // UNLOADED, IT GOES - and its sixteen wells go with it.
      await torch.update({ "system.container": null });
      await until(() => (actor.items.get(torch.id)?.system?.container ?? null) === null,
        "the torch to come off the horse");
      await redraw(sheet);
      forgeDrop(bagZone(sheet, "stable"), { type: "Item", uuid: horse.uuid });
      await until(() => actor.items.get(horse.id)?.system?.equipped === false, "the horse to be stabled");
      await until(() => actor.system.bagSlots.capacity === 16, "the wells to go with it");

      // AND THE DELETE DOOR SAYS THE SAME THING, through the **Carries** cell
      // rather than through a rule of its own.
      await horse.update({ "system.equipped": true });
      await until(() => actor.items.get(horse.id)?.system?.equipped === true, "the horse to come along again");
      await torch.update({ "system.container": horse.id });
      await until(() => actor.items.get(torch.id)?.system?.container === horse.id, "the torch to go back on");
      const gone = await warnings(() => horse.delete());
      assert.ok(actor.items.get(horse.id), "a loaded horse was deleted and its load spilled");
      assert.lengthOf(gone, 1, "the delete was refused without a word");
      assert.include(gone[0], horse.name);
    });

    it("equips a container dropped on an empty bag place", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Bar");
      const [sack] = await tryGive(actor, "Sack");
      await redraw(sheet);
      forgeDrop(bagZone(sheet, "bar"), { type: "Item", uuid: sack.uuid });
      await until(() => actor.items.get(sack.id)?.system?.equipped === true, "the sack to go on the bar");
      await until(() => actor.system.bagSlots.capacity === 22, "the sack to add its six wells");
      await redraw(sheet);
      assert.ok(bagZone(sheet, sack.id), "the worn sack drew no panel of its own");
    });

    it("wears a foreign thing dropped on the figure, asking for no bag slot", async function () {
      this.timeout(180000);
      // **THE BAGS ARE FULL AND THE RULE DOES NOT CARE.** 05 and 08 §11 both
      // say *what you wear and what you hold takes no bag slot*, and the drop
      // used to CREATE the thing first and equip it after - so a ring dragged
      // from the sidebar onto a full character was refused for a well it was
      // never going to fill. `slots.mjs#wearNew` is the pre-check now.
      const { actor, sheet } = await onGear("ZZ Gear Wear New");
      await tryGiveMany(actor, "Torch", 16);
      await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
      await redraw(sheet);

      const ring = await fromPack(PACK_FOR.equipment, "Signet ring");
      const held = actor.items.size;
      const said = await warnings(async () => {
        forgeDrop(bagZone(sheet, "equipped"), { type: "Item", uuid: ring.uuid });
        await until(() => actor.items.size === held + 1, "the ring to arrive");
      });
      assert.lengthOf(said, 0, `the drop was refused: ${said[0] ?? ""}`);
      const worn = actor.items.find(i => i.name === ring.name);
      assert.isTrue(worn.system.equipped, "the ring was picked up rather than put on");
      assert.isNull(worn.system.container ?? null, "a worn thing kept a container");
      assert.equal(actor.system.bagSlots.used, 16, "a worn ring took a bag slot");

      // THE SAME DOOR FROM THE PAPER DOLL. A slot tile drop is `#dropOnSlot`,
      // which is a second path into the same pre-check.
      sheet.changeTab("overview", "primary");
      await settle();
      const tile = sheet.element.querySelector('[data-slot="neck"]');
      assert.ok(tile, "the Overview draws no Neck tile");
      const amulet = await fromPack(PACK_FOR.equipment, "Amulet");
      const before = actor.items.size;
      const quiet = await warnings(async () => {
        forgeDrop(tile, { type: "Item", uuid: amulet.uuid });
        await until(() => actor.items.size === before + 1, "the amulet to arrive");
      });
      assert.lengthOf(quiet, 0, `the tile drop was refused: ${quiet[0] ?? ""}`);
      assert.isTrue(actor.items.find(i => i.name === amulet.name).system.equipped, "the amulet did not go on");
      assert.equal(actor.system.bagSlots.used, 16, "a worn amulet took a bag slot");
    });

    it("refuses a foreign thing it cannot make room for, and creates nothing", async function () {
      this.timeout(180000);
      // 08 §11 gives a Finger two, so a third ring puts one away - and with
      // every well full there is nowhere for the one that comes off. The
      // refusal is said in words and NOTHING is created, which is the half a
      // create-then-equip door could never manage.
      const { actor, sheet } = await onGear("ZZ Gear Wear Full");
      const rings = await tryGive(actor, ["Ring", "Signet ring"]);
      assert.lengthOf(rings, 2, "the two rings were not picked up");
      await actor.updateEmbeddedDocuments("Item", rings.map(r => ({ _id: r.id, "system.equipped": true })));
      await until(() => rings.every(r => actor.items.get(r.id)?.system?.equipped === true), "both rings to go on");
      const free = actor.system.bagSlots.capacity - actor.system.bagSlots.used;
      if (free > 0) await tryGiveMany(actor, "Torch", free);
      await until(() => actor.system.bagSlots.used === actor.system.bagSlots.capacity, "every well to fill");
      await redraw(sheet);

      const third = await fromPack(PACK_FOR.equipment, "Ring of the school");
      const held = actor.items.size;
      const said = await warnings(async () => {
        forgeDrop(bagZone(sheet, "equipped"), { type: "Item", uuid: third.uuid });
        await new Promise(r => setTimeout(r, 500));
      });
      assert.equal(actor.items.size, held, "the third ring was created anyway");
      assert.lengthOf(said, 1, "the refusal was not said in words");
      assert.isTrue(rings.every(r => actor.items.get(r.id)?.system?.equipped === true),
        "a refused drop took a ring off");
    });

    it("takes nothing off for a drop the create is going to refuse", async function () {
      this.timeout(240000);
      // **A FIND STILL UNDER OFFER IS REFUSED BY `_preCreate`** (D-721), and
      // this door puts away what the newcomer DISPLACES before it creates the
      // newcomer - so an offered ring dropped on a Finger took the
      // character's own ring off and then created nothing at all. The veto is
      // read before anything moves now, and the ordinary create is what says
      // no, in the offer's own words.
      const savedOffer = game.settings.get("azeroth-rpg", LOOT_OFFER_SETTING) ?? null;
      const savedCharacter = game.user.character?.id ?? null;
      const { actor, sheet } = await onGear("ZZ Gear Offered Drop");
      let find = null;
      try {
        await game.user.update({ character: actor.id });
        if (lootOffer()) await cancelOffer();
        await until(() => lootOffer() === null, "any standing offer to close");

        // 08 §11 gives a Finger two, so a third ring displaces one of them.
        const rings = await tryGive(actor, ["Ring", "Signet ring"]);
        assert.lengthOf(rings, 2, "the two rings were not picked up");
        await actor.updateEmbeddedDocuments("Item", rings.map(r => ({ _id: r.id, "system.equipped": true })));
        await until(() => rings.every(r => actor.items.get(r.id)?.system?.equipped === true), "both rings to go on");

        find = await Item.create({ ...(await dataOf("Ring of the school")), name: "ZZ Offered Ring" });
        made.push(find);
        const offer = await presentLoot({ items: [find], copper: 0, label: "ZZ Gear offer", userIds: [game.user.id] });
        assert.ok(offer, "presentLoot refused the offer");
        assert.ok(find.getFlag("azeroth-rpg", "offer")?.id, "the offer left no mark on the find");

        // THE PAPER DOLL'S OWN TILE, which is where the displacement happens.
        sheet.changeTab("overview", "primary");
        await settle();
        const tile = sheet.element.querySelector('[data-slot="finger"]');
        assert.ok(tile, "the Overview draws no Finger tile");
        const held = actor.items.size;
        const said = await warnings(async () => {
          forgeDrop(tile, { type: "Item", uuid: find.uuid });
          await new Promise(r => setTimeout(r, 600));
        });
        assert.equal(actor.items.size, held, "the offered ring reached the sheet");
        assert.lengthOf(said, 1, "the refusal was not said in words");
        assert.equal(said[0], game.i18n.format("AZEROTH.LootOffer.UnderOffer", { name: find.name }));
        // **THE HALF THIS TEST EXISTS FOR.** Both rings are still on.
        assert.isTrue(rings.every(r => actor.items.get(r.id)?.system?.equipped === true),
          "a refused drop took the character's own ring off");

        // AND THE SAME DROP ON THE BAGS: nothing is created and nothing moves,
        // which is the ordinary create meeting the same veto.
        sheet.changeTab("gear", "primary");
        await settle();
        const quiet = await warnings(async () => {
          forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: find.uuid });
          await new Promise(r => setTimeout(r, 600));
        });
        assert.equal(actor.items.size, held, "the offered ring reached the bags");
        assert.lengthOf(quiet, 1, "the bag drop refused without a word");
      } finally {
        if (lootOffer()) await cancelOffer().catch(() => {});
        await game.settings.set("azeroth-rpg", LOOT_OFFER_SETTING, savedOffer).catch(() => {});
        await game.user.update({ character: savedCharacter }).catch(() => {});
        const cards = game.messages
          .filter(m => ["lootOffer", "lootSettled"].includes(m.flags?.["azeroth-rpg"]?.kind))
          .map(m => m.id);
        if (cards.length) await ChatMessage.deleteDocuments(cards).catch(() => {});
      }
    });

    it("takes a worn thing off when it is dragged into a bag", async function () {
      this.timeout(180000);
      // `containerOf` answers null for anything worn (D-739), so a worn ring
      // dropped on the base pack matched *it is already here* and took the
      // REORDER branch - which found no tile for it in that panel and wrote
      // nothing at all.
      const { actor, sheet } = await onGear("ZZ Gear Take Off", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const [ring] = await tryGive(actor, "Signet ring");
      await ring.update({ "system.equipped": true });
      await until(() => actor.items.get(ring.id)?.system?.equipped === true, "the ring to go on");
      await redraw(sheet);
      assert.equal(bagOf(sheet, ring.id), "equipped", "the ring is not on the figure");

      forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: ring.uuid });
      await until(() => actor.items.get(ring.id)?.system?.equipped === false, "the ring to come off");
      assert.isNull(actor.items.get(ring.id).system.container ?? null, "it did not land in the base pack");

      // A SUIT WITH NOWHERE TO GO IS REFUSED, IN WORDS, and stays on.
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await shirt.update({ "system.equipped": true });
      await until(() => actor.items.get(shirt.id)?.system?.equipped === true, "the suit to go on");
      const free = actor.system.bagSlots.capacity - actor.system.bagSlots.used;
      if (free > 0) await tryGiveMany(actor, "Torch", free);
      await until(() => actor.system.bagSlots.used === actor.system.bagSlots.capacity, "every well to fill");
      await redraw(sheet);
      const said = await warnings(async () => {
        forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: shirt.uuid });
        await new Promise(r => setTimeout(r, 500));
      });
      assert.isTrue(actor.items.get(shirt.id).system.equipped, "a suit came off with no bag slot for it");
      assert.lengthOf(said, 1, "the refusal was not said in words");

      // AND A BAG THAT STILL HOLDS THINGS IS REFUSED BY ITS OWN RULE.
      const inside = actor.items.find(i => i.system?.container === pack.id);
      assert.ok(inside, "nothing ended up in the Backpack");
      await redraw(sheet);
      const about = await warnings(async () => {
        forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: pack.uuid });
        await new Promise(r => setTimeout(r, 500));
      });
      assert.isTrue(actor.items.get(pack.id).system.equipped, "a Backpack holding things came off");
      assert.lengthOf(about, 1, "the refusal was not said in words");
      assert.include(about[0], pack.name);
    });

    it("charges nothing for an arrangement, and everything for a load that fits nowhere", async function () {
      this.timeout(240000);
      // 05's *Speed and movement* is about the character's bag slots AS A
      // WHOLE. Summing the panels' own overflow read `Encumbered` beside a
      // Backpack with eight free wells, which penalises where a rope is
      // sitting rather than what is being carried.
      const { actor, sheet } = await onGear("ZZ Gear Arrange", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const speed = actor.system.speed;
      await tryGiveMany(actor, "Torch", 16);
      await until(() => actor.system.bagSlots.used === 16, "the base pack to fill");
      assert.lengthOf(actor.items.filter(i => i.system?.container === pack.id), 0,
        "the torches did not all land in the base pack");

      await actor.update({ "system.abilities.str.value": 6 });
      await until(() => actor.system.bagSlots.base === 14, "the Strength drain to land");
      assert.equal(basePanel(actor).over, 2, "the base pack does not read over");
      assert.equal(actor.system.bagSlots.over, 0, "an arrangement was charged as a load");
      assert.equal(actor.system.load, "unencumbered");
      assert.equal(actor.system.speed, speed, "Speed moved for an arrangement");

      // MOVE SOMETHING OUT, said and then DONE.
      await redraw(sheet);
      const over = bagZone(sheet, "").querySelector(".azeroth-bag-over-line");
      assert.ok(over, "the base pack did not print its over row");
      assert.equal(over.textContent.trim(), game.i18n.format("AZEROTH.Bags.PanelOver", { n: 2 }));
      const { el, registered } = useAction(sheet, "makeRoom", { within: bagZone(sheet, "") });
      assert.ok(el, "the over row offers no Make room");
      assert.isTrue(registered, "makeRoom is not registered — the press is a silent no-op");
      el.click();
      await until(() => basePanel(actor).over === 0, "Make room to empty the over row");
      assert.isAtLeast(actor.items.filter(i => i.system?.container === pack.id).length, 2,
        "nothing moved into the Backpack");
      assert.equal(actor.system.bagSlots.over, 0);

      // AND NOW WITH NOWHERE TO PUT IT. Every well full, then the same drain.
      await actor.update({ "system.abilities.str.value": 10 });
      await until(() => actor.system.bagSlots.base === 16, "the Strength to come back");
      const free = actor.system.bagSlots.capacity - actor.system.bagSlots.used;
      if (free > 0) await tryGiveMany(actor, "Torch", free);
      await until(() => actor.system.bagSlots.used === actor.system.bagSlots.capacity, "every well to fill");
      await actor.update({ "system.abilities.str.value": 6 });
      await until(() => actor.system.bagSlots.over === 2, "two bag slots to fit nowhere");
      assert.equal(actor.system.load, "encumbered");
      assert.equal(actor.system.speed, speed - 5, "Encumbered did not cost five feet");
    });

    it("refuses a thing the bag does not take, in words", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Refused", { bags: ["Quiver"] });
      const quiver = actor.items.find(i => i.name === "Quiver");
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      const said = await warnings(async () => {
        forgeDrop(bagZone(sheet, quiver.id), { type: "Item", uuid: torch.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.isNull(actor.items.get(torch.id).system.container ?? null, "a torch went into the quiver");
      assert.lengthOf(said, 1, "the refusal was not said in words");
      assert.include(said[0], quiver.name);
    });

    /* ---------------------------------------------------------------- */
    /*  EVERY ZONE, AIMED AT AS A READER AIMS AT IT (the lead,           */
    /*  2026-09-20: "I'm unable to drag a mount into the slot, check     */
    /*  that all slot drag in works")                                   */
    /* ---------------------------------------------------------------- */

    /** One run of the bag bar, found whether the zone sits on it or inside it. */
    const runOf = (sheet, key) => [...gearTab(sheet).querySelectorAll(".azeroth-bag-bar-run")]
      .find(run => run.dataset.bagZone === key || run.querySelector(`[data-bag-zone="${key}"]`)) ?? null;

    /** A run's heading — the word a reader reads before aiming at the well under it. */
    const headOf = (sheet, key) => runOf(sheet, key)?.querySelector(".azeroth-bag-bar-head") ?? null;

    /** The bar place a worn container stands in, by that container. */
    const placeOfBag = (sheet, id) =>
      gearTab(sheet).querySelector(`.azeroth-bag-tile[data-container-id="${CSS.escape(id)}"]`);

    it("takes a drop aimed at a bar run's heading and at its padding, not only at the wells", async function () {
      this.timeout(240000);
      // **THIS IS THE FAULT THE LEAD HIT.** Every run's `data-bag-zone` sat on
      // the `<ol>` of places while the box a reader sees is the RUN — its
      // heading, its six pixels of padding and the well inside them. A drop on
      // the word *Mount* matched no zone at all, `_onDropItem` handed the event
      // back to core, and the mount was left exactly where it was: to the
      // reader, dragging a mount into the place did nothing. Every test that
      // covered these zones aimed at the `<ol>` itself and so could not see it.
      const { actor, sheet } = await onGear("ZZ Gear Run Box");
      const [sack] = await tryGive(actor, "Sack");
      const [horse] = await tryGive(actor, "Elwynn courser");
      await redraw(sheet);

      forgeDrop(headOf(sheet, "bar"), { type: "Item", uuid: sack.uuid });
      await until(() => actor.items.get(sack.id)?.system?.equipped === true,
        "the sack to go on from a drop on the run's heading");

      await redraw(sheet);
      forgeDrop(headOf(sheet, "mount"), { type: "Item", uuid: horse.uuid });
      await until(() => actor.items.get(horse.id)?.system?.equipped === true,
        "the horse to come along from a drop on the run's heading");

      // AND THE RUN'S OWN PADDING, which is the rest of the box: the event's
      // target is the run itself, not the list and not the well.
      await redraw(sheet);
      forgeDrop(runOf(sheet, "stable"), { type: "Item", uuid: horse.uuid });
      await until(() => actor.items.get(horse.id)?.system?.equipped === false,
        "the horse to be stabled from a drop on the run's padding");

      // A PANEL'S HEAD IS ITS ZONE TOO — that one always was, because the zone
      // is on the `<section>`, and the audit says so rather than assuming it.
      await redraw(sheet);
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      forgeDrop(bagZone(sheet, sack.id).querySelector(".azeroth-bag-panel-head"),
        { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.container === sack.id,
        "the torch to go in the sack from a drop on the panel's head");
    });

    it("lights exactly the zone that will take the drop, on every zone", async function () {
      this.timeout(240000);
      // **WHAT LIGHTS IS WHAT TAKES IT**, or the reader is aiming at a lie.
      // The base pack lit NOTHING: `_onDragOver` asked `Boolean(zone.container)`
      // and the base pack's key is the empty string, so the one panel every
      // character has was the one zone that never said it would take the drop.
      const { actor, sheet } = await onGear("ZZ Gear Lit", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const [torch] = await tryGive(actor, "Torch");
      const [horse] = await tryGive(actor, "Elwynn courser");
      await horse.update({ "system.equipped": true });
      await until(() => actor.items.get(horse.id)?.system?.equipped === true, "the horse to come along");
      await redraw(sheet);

      const rows = [
        ["the base pack", () => bagZone(sheet, ""), () => bagZone(sheet, "")],
        ["the base pack's head", () => bagZone(sheet, "").querySelector(".azeroth-bag-panel-head"), () => bagZone(sheet, "")],
        ["a worn bag's panel", () => bagZone(sheet, pack.id), () => bagZone(sheet, pack.id)],
        ["a tile in a panel", () => gearTile(sheet, torch.id), () => bagZone(sheet, "")],
        ["the Worn panel", () => bagZone(sheet, "equipped"), () => bagZone(sheet, "equipped")],
        ["the Bags run's heading", () => headOf(sheet, "bar"), () => runOf(sheet, "bar")],
        ["the Bags run's padding", () => runOf(sheet, "bar"), () => runOf(sheet, "bar")],
        ["the Mount run's heading", () => headOf(sheet, "mount"), () => runOf(sheet, "mount")],
        ["the Stable run's heading", () => headOf(sheet, "stable"), () => runOf(sheet, "stable")],
        // A FILLED BAG PLACE lights the TILE, because the tile is what takes
        // the drop: a thing goes in that bag and a container takes its place.
        ["a filled bag place", () => placeOfBag(sheet, pack.id), () => placeOfBag(sheet, pack.id)],
        // The mount standing in its place carries no `data-container-id` —
        // nothing is ever put IN a mount by dropping on its icon — so the
        // run is the zone and the run is what lights.
        ["the mount standing in its place", () => runOf(sheet, "mount").querySelector(".azeroth-bag-tile"),
          () => runOf(sheet, "mount")]
      ];
      const faults = [];
      for (const [what, aim, want] of rows) {
        const target = aim();
        if (!target) { faults.push(`${what}: nothing to aim at`); continue; }
        const lit = dragOver(target);
        const expected = want();
        if (lit !== expected) {
          faults.push(`${what}: lit <${lit?.tagName.toLowerCase() ?? "nothing"}`
            + `${lit?.className ? ` class="${lit.className}"` : ""}>, wanted `
            + `<${expected?.tagName.toLowerCase()} class="${expected?.className}">`);
        }
      }
      // The inspector is a reading surface and deliberately lights nothing.
      dragOver(bagZone(sheet, "inspector"));
      if (gearTab(sheet).querySelector(".azeroth-drop-into")) faults.push("the Item Preview lit as a destination");
      assert.deepEqual(faults, [], faults.join("\n"));

      // AND THE LIGHT GOES OUT ON THE DROP, so a stale outline never survives.
      forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: torch.uuid });
      await settle();
      assert.isNull(gearTab(sheet).querySelector(".azeroth-drop-into"), "the outline outlived the drop");
    });

    it("puts a thing in the bag whose place it is dropped on, and swaps a container for the one standing there", async function () {
      this.timeout(240000);
      // **A FILLED PLACE TAKES THE DROP BY WHAT IS DROPPED**, never by what is
      // standing in it: a thing goes IN the bag (which is what the icon means
      // and what it always did), and a container takes its place.
      const { actor, sheet } = await onGear("ZZ Gear Place Swap", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const [torch] = await tryGive(actor, "Torch");
      const [sack] = await tryGive(actor, "Sack");
      await redraw(sheet);
      assert.ok(placeOfBag(sheet, pack.id), "the Backpack has no place on the bar");

      forgeDrop(placeOfBag(sheet, pack.id), { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.container === pack.id, "the torch to go in the pack");

      // A CONTAINER SWAPS — and 08 §11's own rule still bounds it: a bag comes
      // off EMPTY, so the swap is refused in the document's words while the one
      // standing there still holds things.
      await redraw(sheet);
      const said = await warnings(async () => {
        forgeDrop(placeOfBag(sheet, pack.id), { type: "Item", uuid: sack.uuid });
        await new Promise(r => setTimeout(r, 600));
      });
      assert.isFalse(actor.items.get(sack.id).system.equipped, "the sack went on over a loaded pack");
      assert.isTrue(actor.items.get(pack.id).system.equipped, "the loaded pack came off anyway");
      assert.lengthOf(said, 1, `the refusal was not said in words: ${said.join(" | ")}`);
      assert.include(said[0], pack.name);

      // EMPTIED, THE SWAP GOES THROUGH: the newcomer is worn and the old one
      // comes off into a bag.
      await torch.update({ "system.container": null });
      await until(() => (actor.items.get(torch.id)?.system?.container ?? null) === null, "the torch to come out");
      await redraw(sheet);
      forgeDrop(placeOfBag(sheet, pack.id), { type: "Item", uuid: sack.uuid });
      await until(() => actor.items.get(sack.id)?.system?.equipped === true, "the sack to take the place");
      await until(() => actor.items.get(pack.id)?.system?.equipped === false, "the pack to come off");

      // **AND A FOREIGN CONTAINER TAKES THE PLACE THE SAME WAY**, which is
      // `#wearNew`'s own path and would otherwise be code with no caller
      // (D-681): the one standing there comes off in the write BEFORE the
      // create, so a refused swap creates nothing.
      await redraw(sheet);
      const held = actor.items.size;
      const satchel = await fromPack(PACK_FOR.equipment, "Satchel");
      forgeDrop(placeOfBag(sheet, sack.id), { type: "Item", uuid: satchel.uuid });
      await until(() => actor.items.size === held + 1, "the foreign satchel to arrive");
      const worn = actor.items.find(i => i.name === satchel.name);
      assert.isTrue(worn.system.equipped, "the foreign satchel was picked up rather than put on");
      await until(() => actor.items.get(sack.id)?.system?.equipped === false, "the sack to give up its place");
    });

    it("takes a counted place by its own kind, and swaps one quiver for another", async function () {
      this.timeout(240000);
      // A COUNTED PLACE IS DRAWN ONLY WHEN IT IS FILLED (08 §11 gives one of
      // each kind BESIDE the four), so the empty case is the general place and
      // this is the other half: arrows go IN, anything else is refused by the
      // bag's own rule, and a second quiver takes the place rather than being
      // refused as a second of its kind.
      const { actor, sheet } = await onGear("ZZ Gear Counted", { bags: ["Quiver"] });
      const quiver = actor.items.find(i => i.name === "Quiver");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      const [torch] = await tryGive(actor, "Torch");
      const [second] = await tryGive(actor, "Quiver");
      await redraw(sheet);
      assert.ok(placeOfBag(sheet, quiver.id), "the Quiver has no place on the bar");

      forgeDrop(placeOfBag(sheet, quiver.id), { type: "Item", uuid: arrows.uuid });
      await until(() => actor.items.get(arrows.id)?.system?.container === quiver.id, "the arrows to go in the quiver");

      await redraw(sheet);
      const said = await warnings(async () => {
        forgeDrop(placeOfBag(sheet, quiver.id), { type: "Item", uuid: torch.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.isNull(actor.items.get(torch.id).system.container ?? null, "a torch went into the quiver's place");
      assert.lengthOf(said, 1, "the wrong kind was refused without a word");

      // The one standing there comes off EMPTY, so the swap is refused while
      // the arrows are in it and goes through once they are out.
      await redraw(sheet);
      const loaded = await warnings(async () => {
        forgeDrop(placeOfBag(sheet, quiver.id), { type: "Item", uuid: second.uuid });
        await new Promise(r => setTimeout(r, 600));
      });
      assert.isFalse(actor.items.get(second.id).system.equipped, "a second quiver went on over a loaded one");
      assert.lengthOf(loaded, 1, "the loaded quiver was refused without a word");

      await arrows.update({ "system.container": null });
      await until(() => (actor.items.get(arrows.id)?.system?.container ?? null) === null, "the arrows to come out");
      await redraw(sheet);
      forgeDrop(placeOfBag(sheet, quiver.id), { type: "Item", uuid: second.uuid });
      await until(() => actor.items.get(second.id)?.system?.equipped === true, "the second quiver to take the place");
      await until(() => actor.items.get(quiver.id)?.system?.equipped === false, "the first quiver to come off");
    });

    it("takes a drop on a taken well as a drop on its owner", async function () {
      this.timeout(180000);
      // A thing that takes several wells is ONE tile and a run of TAKEN wells
      // (D-738), and the run wears the owner's ghosted icon - so a drop on it
      // has to mean the owner, exactly as a click there does. `data-of` is the
      // answer and a taken well never carries a second `data-item-id`.
      const { actor, sheet } = await onGear("ZZ Gear Taken Well");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      const taken = [...bagZone(sheet, "").querySelectorAll(".azeroth-bag-well.is-taken")]
        .filter(el => el.dataset.of === shirt.id);
      assert.isAtLeast(taken.length, 1, "the suit took no wells past its first");
      // It lights the panel that will take the drop, like any other tile.
      assert.strictEqual(dragOver(taken[0]), bagZone(sheet, ""), "a taken well lit something else");

      // The suit takes wells 0 to 3 and the torch well 4; dropped on the
      // suit's RUN the two change places, and a swap of a one-well thing and
      // a four-well one holds here because the pack has room for both runs.
      assert.equal(wellOfTile(sheet, shirt.id), 0, "the suit did not start at well 0");
      assert.equal(wellOfTile(sheet, torch.id), 4, "the torch did not start at well 4");
      forgeDrop(taken[0], { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.well === 0
        && actor.items.get(shirt.id)?.system?.well === 4,
        "the drop on the taken well to swap it with its owner");
    });

    /* ---------------------------------------------------------------- */
    /*  WHICH WELL (the lead, 2026-09-20)                               */
    /* ---------------------------------------------------------------- */

    it("puts a thing in the WELL it is dropped on, and keeps the gap", async function () {
      this.timeout(180000);
      // **THE LEAD'S OWN ASK**: *I need to be able to place a carried/bag item
      // in any slot, not just the next available.* Well 12 of an empty pack.
      const { actor, sheet } = await onGear("ZZ Gear Well Twelve");
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      assert.equal(wellOfTile(sheet, torch.id), 0, "the torch did not start at the first well");

      const target = bagWell(sheet, "", 12);
      assert.ok(target, "the base pack drew no twelfth well to aim at");
      assert.equal(target.dataset.well, "12");
      // It lights the PANEL, not a zone of its own: the well is read off the
      // cell under the pointer and D-748's audit is untouched.
      assert.strictEqual(dragOver(target), bagZone(sheet, ""), "a well lit something other than its panel");

      forgeDrop(target, { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.well === 12, "the torch to land in well 12");
      await redraw(sheet);
      assert.equal(wellOfTile(sheet, torch.id), 12, "the tile is not drawn in well 12");
      // AND THE GAP IS KEPT: eleven empty wells in front of it, and nothing
      // shuffled up. The character carries one bag slot either way.
      const empties = [...bagZone(sheet, "").querySelectorAll(".azeroth-bag-well.is-empty")];
      assert.lengthOf(empties, 15, "the panel stopped drawing its capacity");
      assert.equal(actor.system.bagSlots.used, 1);
      assert.equal(actor.system.bagSlots.over, 0);
      assert.equal(actor.system.load, "unencumbered");
    });

    it("takes a worn thing off INTO THE WELL it was dropped on", async function () {
      this.timeout(180000);
      // The same gesture from the figure, which is a different door: the
      // write is `{equipped: false, container, well}` and `judge`'s homeless
      // path used to house it again for naming no bag - so the ring came off
      // into the first free well rather than the one the reader aimed at,
      // which reads as the drop being ignored.
      const { actor, sheet } = await onGear("ZZ Gear Off Into Well");
      const [ring] = await tryGive(actor, "Signet ring");
      const [torch] = await tryGive(actor, "Torch");
      assert.ok(torch, "the torch was refused");
      await ring.update({ "system.equipped": true });
      await until(() => actor.items.get(ring.id)?.system?.equipped === true, "the ring to go on");
      await redraw(sheet);
      assert.equal(bagOf(sheet, ring.id), "equipped", "the ring is not on the figure");

      forgeDrop(bagWell(sheet, "", 7), { type: "Item", uuid: ring.uuid });
      await until(() => actor.items.get(ring.id)?.system?.equipped === false, "the ring to come off");
      assert.isNull(actor.items.get(ring.id).system.container ?? null, "it did not land in the base pack");
      assert.equal(actor.items.get(ring.id).system.well, 7, "it did not land in the well it was dropped on");
      await redraw(sheet);
      assert.equal(wellOfTile(sheet, ring.id), 7, "the tile is not drawn in well 7");
    });

    it("swaps two things dropped on one another, and across two panels", async function () {
      this.timeout(240000);
      const { actor, sheet } = await onGear("ZZ Gear Swap", { bags: ["Backpack"] });
      const pack = actor.items.find(i => i.name === "Backpack");
      const [torch] = await tryGive(actor, "Torch");
      const [bedroll] = await tryGive(actor, "Bedroll");
      await redraw(sheet);
      const wasTorch = wellOfTile(sheet, torch.id);
      const wasBed = wellOfTile(sheet, bedroll.id);
      assert.notEqual(wasTorch, wasBed, "the two started in one well");

      // INSIDE ONE PANEL: dropped on each other, they change places.
      forgeDrop(gearTile(sheet, bedroll.id), { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.well === wasBed
        && actor.items.get(bedroll.id)?.system?.well === wasTorch, "the two to change places");

      // ACROSS TWO PANELS: the container travels with the well.
      const [rope] = await tryGive(actor, "Rope, 50 ft (hemp)", PACK_FOR.equipment, { container: pack.id });
      assert.equal(rope.system.container, pack.id, "the rope did not go in the pack");
      await redraw(sheet);
      const ropeWell = wellOfTile(sheet, rope.id);
      const torchWell = wellOfTile(sheet, torch.id);
      forgeDrop(gearTile(sheet, rope.id), { type: "Item", uuid: torch.uuid });
      await until(() => actor.items.get(torch.id)?.system?.container === pack.id
        && (actor.items.get(rope.id)?.system?.container ?? null) === null,
        "the two to change panels");
      assert.equal(actor.items.get(torch.id).system.well, ropeWell, "the torch did not take the rope's well");
      assert.equal(actor.items.get(rope.id).system.well, torchWell, "the rope did not take the torch's well");
    });

    it("refuses a swap that will not lie down, in words, and moves nothing", async function () {
      this.timeout(240000);
      // A one-well thing and a four-well suit, in a pack with no gap to take
      // the difference: there is no swap to make and saying so is better than
      // half-doing it.
      const { actor, sheet } = await onGear("ZZ Gear Swap Refused");
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      const [torch] = await tryGive(actor, "Torch");
      // The torch at well 0 and the suit's four wells at 1 to 4. Sending the
      // suit to well 0 puts its own run over well 1, which is where the torch
      // was going: there is no arrangement in which both land where they were
      // sent, and half a swap is worse than none.
      await actor.updateEmbeddedDocuments("Item", [
        { _id: torch.id, "system.well": 0 },
        { _id: shirt.id, "system.well": 1 }
      ]);
      await until(() => actor.items.get(shirt.id)?.system?.well === 1, "the two to take their wells");
      await redraw(sheet);
      const wasSuit = wellOfTile(sheet, shirt.id);
      const wasTorch = wellOfTile(sheet, torch.id);
      assert.equal(wasSuit, 1);
      assert.equal(wasTorch, 0);

      const said = await warnings(async () => {
        forgeDrop(gearTile(sheet, shirt.id), { type: "Item", uuid: torch.uuid });
        await new Promise(r => setTimeout(r, 500));
      });
      assert.lengthOf(said, 1, "the refusal was not said in words");
      assert.include(said[0], shirt.name);
      assert.equal(actor.items.get(shirt.id).system.well, wasSuit, "the suit moved anyway");
      assert.equal(actor.items.get(torch.id).system.well, wasTorch, "the torch moved anyway");
    });

    it("migrates a world with no positions into the wells it was already drawing", async function () {
      this.timeout(240000);
      // **NOTHING RESHUFFLES ON LOAD.** The migration stamps the well each
      // thing is ALREADY drawn in, so the first render after it is the render
      // before it - which is the only thing that makes it safe to ship.
      const { actor, sheet } = await onGear("ZZ Gear Wells Legacy");
      const kit = [];
      for (const name of ["Torch", "Bedroll", "Rope, 50 ft (hemp)", "Tinderbox"]) {
        const [one] = await tryGive(actor, name);
        assert.ok(one, `${name} was refused`);
        kit.push(one);
      }
      await redraw(sheet);
      const drawn = kit.map(i => wellOfTile(sheet, i.id));
      assert.isTrue(drawn.every(w => Number.isInteger(w)), "something was not drawn in a well at all");

      // **STALE IT BY HAND**, which is what a 0.12.10 world holds: every well
      // null. The doors judge exactly this state, so they are swapped out to
      // write it and put back in a `finally`.
      const cls = CONFIG.Item.documentClass;
      const held = { update: cls._preUpdateOperation, preUpdate: cls.prototype._preUpdate };
      const nothing = async () => {};
      try {
        cls._preUpdateOperation = nothing;
        cls.prototype._preUpdate = nothing;
        await actor.updateEmbeddedDocuments("Item", kit.map(i => ({ _id: i.id, "system.well": null })));
      } finally {
        cls._preUpdateOperation = held.update;
        cls.prototype._preUpdate = held.preUpdate;
      }
      await until(() => kit.every(i => (actor.items.get(i.id)?.system?.well ?? null) === null),
        "the stale state to land");

      const rowsOf = doc => [...doc.items].map(i => ({
        id: i.id, type: i.type, name: i.name, sort: i.sort ?? 0, system: rawSystem(i)
      }));
      const base = actor.system.bagSlots.base;
      const forOurs = doc => (doc.id === actor.id ? buildWellUpdate(rowsOf(doc), base) : null);
      const touched = await walkWorld({ items: forOurs }, () => {});
      assert.isAbove(touched, 0, "the migration found nothing to repair");
      await until(() => kit.every(i => Number.isInteger(actor.items.get(i.id)?.system?.well ?? null)),
        "every thing to get its well back");

      // EXACTLY WHERE THEY WERE.
      await redraw(sheet);
      assert.deepEqual(kit.map(i => wellOfTile(sheet, i.id)), drawn, "the migration moved something");
      // A SECOND RUN TOUCHES NOTHING.
      assert.equal(await walkWorld({ items: forOurs }, () => {}), 0, "the migration is not idempotent");
    });

    it("swaps the mount standing in the place, and refuses a loaded one in words", async function () {
      this.timeout(240000);
      const { actor, sheet } = await onGear("ZZ Gear Mount Swap");
      const [first] = await tryGive(actor, "Elwynn courser");
      const [second] = await tryGive(actor, "Brill nag");
      await first.update({ "system.equipped": true });
      await until(() => actor.items.get(first.id)?.system?.equipped === true, "the first mount to come along");
      await redraw(sheet);

      // LOADED, IT STAYS: 08 §11 unloads a mount before it is left behind, and
      // the refusal is the document's own, naming the animal.
      const [rope] = await tryGive(actor, "Rope, 50 ft (hemp)");
      await rope.update({ "system.container": first.id });
      await until(() => actor.items.get(rope.id)?.system?.container === first.id, "the rope to go on the horse");
      await redraw(sheet);
      const said = await warnings(async () => {
        forgeDrop(headOf(sheet, "mount"), { type: "Item", uuid: second.uuid });
        await new Promise(r => setTimeout(r, 600));
      });
      assert.isFalse(actor.items.get(second.id).system.equipped, "the second mount came along over a loaded one");
      assert.isTrue(actor.items.get(first.id).system.equipped, "the loaded mount was left behind");
      assert.lengthOf(said, 1, `the refusal was not said in words: ${said.join(" | ")}`);
      assert.include(said[0], first.name);

      // UNLOADED, THE SECOND TAKES THE PLACE AND THE FIRST IS STABLED.
      await rope.update({ "system.container": null });
      await until(() => (actor.items.get(rope.id)?.system?.container ?? null) === null, "the rope to come off");
      await redraw(sheet);
      forgeDrop(headOf(sheet, "mount"), { type: "Item", uuid: second.uuid });
      await until(() => actor.items.get(second.id)?.system?.equipped === true, "the second mount to come along");
      await until(() => actor.items.get(first.id)?.system?.equipped === false, "the first mount to be stabled");

      // AND A MOUNT DROPPED ON A FILLED STABLE IS LEFT BEHIND TOO: the Stable
      // is a yard rather than a place, so what is standing in it is no more
      // relevant there than anywhere else.
      await redraw(sheet);
      forgeDrop(headOf(sheet, "stable"), { type: "Item", uuid: second.uuid });
      await until(() => actor.items.get(second.id)?.system?.equipped === false, "the second mount to be stabled too");
      assert.isFalse(actor.items.get(first.id).system.equipped, "the one already stabled was disturbed");

      // **A MOUNT DRAGGED IN FROM A PACK IS THE LEAD'S OWN CASE** (2026-09-20)
      // and no test had ever made it: every mount test above holds one the
      // character already owns. It is created and brought along in one gesture.
      await redraw(sheet);
      const held = actor.items.size;
      const foreign = await fromPack(PACK_FOR.equipment, "Mountain ram");
      forgeDrop(headOf(sheet, "mount"), { type: "Item", uuid: foreign.uuid });
      await until(() => actor.items.size === held + 1, "the foreign mount to arrive");
      const brought = actor.items.find(i => i.name === foreign.name);
      await until(() => actor.items.get(brought.id)?.system?.equipped === true,
        "the foreign mount to be brought along rather than left in the Stable");
    });

    it("names the real reason at the mount place, the Worn panel and the bags", async function () {
      this.timeout(240000);
      // **A REFUSAL THAT NAMES THE WRONG RULE IS WORSE THAN NONE.** The mount
      // place borrowed the container's sentence and printed *Mount does not
      // hold Bread and cheese* at a reader who had dropped something that is
      // not a mount; the Worn panel printed *is not worn in the Worn slot*,
      // which names no slot the book has.
      const { actor, sheet } = await onGear("ZZ Gear Reasons");
      const [food] = await tryGive(actor, "Bread and cheese");
      const [horse] = await tryGive(actor, "Elwynn courser");
      await redraw(sheet);

      const notMount = await warnings(async () => {
        forgeDrop(headOf(sheet, "mount"), { type: "Item", uuid: food.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.lengthOf(notMount, 1, "the mount place refused without a word");
      assert.equal(notMount[0], game.i18n.format("AZEROTH.Bags.Refused.NotMount", { name: food.name }));

      await redraw(sheet);
      const alsoNotMount = await warnings(async () => {
        forgeDrop(headOf(sheet, "stable"), { type: "Item", uuid: food.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.lengthOf(alsoNotMount, 1, "the Stable refused without a word");
      assert.equal(alsoNotMount[0], game.i18n.format("AZEROTH.Bags.Refused.NotMount", { name: food.name }));

      await redraw(sheet);
      const notWorn = await warnings(async () => {
        forgeDrop(bagZone(sheet, "equipped"), { type: "Item", uuid: food.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.lengthOf(notWorn, 1, "the Worn panel refused without a word");
      assert.equal(notWorn[0], game.i18n.format("AZEROTH.Bags.Refused.NotWorn", { name: food.name }));

      // AND A MOUNT IS NOT CARRIED: the pure law prices a mount at no bag slot
      // at all, so a horse dropped on a bag was written into it in silence.
      await redraw(sheet);
      const notCarried = await warnings(async () => {
        forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: horse.uuid });
        await new Promise(r => setTimeout(r, 400));
      });
      assert.isNull(actor.items.get(horse.id).system.container ?? null, "a mount was put in a bag");
      assert.lengthOf(notCarried, 1, "the bags refused a mount without a word");
      assert.equal(notCarried[0], game.i18n.format("AZEROTH.Bags.Refused.MountNotCarried", { name: horse.name }));
    });

    it("takes the same drop from a world item, another actor, a pack and the browser's own row", async function () {
      this.timeout(300000);
      // Four of the five sources in the audit are one path — `!owned`, resolved
      // by uuid — and the fifth is the actor's own. The browser's row writes
      // `{type, uuid}` itself (`compendium-browser.mjs`), so its DRAG is
      // dispatched here rather than its payload being assumed.
      const { actor, sheet } = await onGear("ZZ Gear Sources");
      const other = await makeCharacter({ name: "ZZ Gear Source Actor" });
      const world = await Item.create({ ...(await dataOf("Torch")), name: "ZZ World Torch" });
      made.push(world);
      const [theirs] = await tryGive(other, "Bedroll");
      const packDoc = await fromPack(PACK_FOR.equipment, "Tinderbox");

      for (const [what, uuid] of [["a world item", world.uuid], ["another actor's item", theirs.uuid],
        ["a pack document", packDoc.uuid]]) {
        await redraw(sheet);
        const held = actor.items.size;
        forgeDrop(bagZone(sheet, ""), { type: "Item", uuid });
        await until(() => actor.items.size === held + 1, `${what} to be picked up`);
      }
      // Nothing was taken from the other character: a cross-actor drag copies.
      assert.ok(other.items.get(theirs.id), "the other character lost the thing that was dragged off them");

      // THE BROWSER'S OWN ROW, dragged with its own handler.
      const browser = await browserOpen("gear");
      try {
        const row = browser.element.querySelector(".azeroth-browser-entry[data-uuid]");
        assert.ok(row, "the browser drew no row to drag");
        const dt = new DataTransfer();
        row.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true }));
        const payload = JSON.parse(dt.getData("text/plain") || "{}");
        assert.equal(payload.type, "Item", "the browser's row wrote no Item payload");
        await redraw(sheet);
        const held = actor.items.size;
        forgeDrop(bagZone(sheet, ""), payload);
        await until(() => actor.items.size === held + 1, "the browser's row to be picked up");
      } finally {
        await browser.close().catch(() => {});
      }
    });

    it("hands a drop that lands on no zone back to core", async function () {
      this.timeout(180000);
      // The fall-through is deliberate and stays: a drop on the carry line or
      // the add row is not a destination, so a foreign thing is simply picked
      // up and one of the actor's own is core's sort and writes nothing.
      const { actor, sheet } = await onGear("ZZ Gear Fallthrough");
      const [torch] = await tryGive(actor, "Torch");
      await redraw(sheet);
      const line = gearTab(sheet).querySelector(".azeroth-load");
      assert.ok(line, "the tab draws no carry line");
      assert.isNull(dragOver(line), "the carry line lit as a drop zone");

      const held = actor.items.size;
      const where = actor.items.get(torch.id).system.container ?? null;
      forgeDrop(line, { type: "Item", uuid: torch.uuid });
      await new Promise(r => setTimeout(r, 400));
      assert.equal(actor.items.size, held, "an owned thing dropped on nothing was duplicated");
      assert.equal(actor.items.get(torch.id).system.container ?? null, where, "it moved out of its bag");

      const packDoc = await fromPack(PACK_FOR.equipment, "Soap");
      forgeDrop(line, { type: "Item", uuid: packDoc.uuid });
      await until(() => actor.items.size === held + 1, "a foreign thing to be picked up anyway");

      // **THE ITEM PREVIEW IS A READING SURFACE**, open or shut: one of the
      // actor's own dropped there does nothing at all, and a foreign thing is
      // the ordinary pickup. It lights nothing either way.
      for (const shut of [false, true]) {
        await redraw(sheet);
        const toggle = gearTab(sheet).querySelector('[data-action="togglePreview"]');
        const body = gearTab(sheet).querySelector(".azeroth-bag-inspector-body");
        if (body.hidden !== shut) { toggle.click(); await settle(); }
        const inspector = bagZone(sheet, "inspector");
        assert.ok(inspector, `the preview has no zone with the body ${shut ? "shut" : "open"}`);
        assert.isNull(dragOver(inspector), "the Item Preview lit as a destination");

        const before = actor.items.size;
        const where = actor.items.get(torch.id).system.container ?? null;
        forgeDrop(inspector, { type: "Item", uuid: torch.uuid });
        await new Promise(r => setTimeout(r, 300));
        assert.equal(actor.items.size, before, "an owned thing dropped on the preview was duplicated");
        assert.equal(actor.items.get(torch.id).system.container ?? null, where, "it moved out of its bag");

        const another = await fromPack(PACK_FOR.equipment, shut ? "Chalk and marker cord" : "Whetstone");
        forgeDrop(inspector, { type: "Item", uuid: another.uuid });
        await until(() => actor.items.size === before + 1, "a foreign thing dropped on the preview to be picked up");
      }
      // Put the reader's own preference back: it lives on `game.user`.
      await redraw(sheet);
      if (gearTab(sheet).querySelector(".azeroth-bag-inspector-body").hidden) {
        gearTab(sheet).querySelector('[data-action="togglePreview"]').click();
        await settle();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  Stacks, order and Tidy                                          */
    /* ---------------------------------------------------------------- */

    it("merges a stack dropped on its twin, and a pickup that joins one", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Merge");
      const pair = await tryGiveMany(actor, "Hunting arrows", 2, PACK_FOR.weapon);
      assert.lengthOf(pair, 2, "the two bundles were not picked up");
      await actor.updateEmbeddedDocuments("Item", pair.map(b => ({ _id: b.id, "system.quantity": 5 })));
      await until(() => actor.items.filter(i => i.name === "Hunting arrows" && i.system.quantity === 5).length === 2,
        "both bundles to hold five");
      await redraw(sheet);

      forgeDrop(gearTile(sheet, pair[0].id), { type: "Item", uuid: pair[1].uuid });
      await until(() => actor.items.filter(i => i.name === "Hunting arrows").length === 1, "the two to become one");
      const merged = actor.items.find(i => i.name === "Hunting arrows");
      assert.equal(merged.system.quantity, 10, "the merge lost arrows");

      // AND A PICKUP JOINS THE TWIN rather than standing beside it: two
      // identical bundles side by side is not what the drop looked like.
      await redraw(sheet);
      const source = await fromPack(PACK_FOR.weapon, "Hunting arrows");
      const held = actor.items.size;
      forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: source.uuid });
      await until(() => actor.items.get(merged.id)?.system?.quantity > 10, "the newcomer to join the stack");
      assert.equal(actor.items.size, held, "the pickup made a second bundle");
    });

    it("splits a stack, and refuses the split when there is no well for the second", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Split");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      await arrows.update({ "system.quantity": 10 });
      await until(() => actor.items.get(arrows.id)?.system?.quantity === 10, "the bundle to hold ten");
      await redraw(sheet);

      // The dialog asks for a NUMBER, which the one chooser cannot, so it is
      // its own `DialogV2`; the test answers it rather than clicking it.
      const held = foundry.applications.api.DialogV2.prompt;
      try {
        foundry.applications.api.DialogV2.prompt = async () => 4;
        const card = await inspect(sheet, arrows.id);
        const button = card.querySelector('[data-action="splitStack"]');
        assert.ok(button, "a stack of ten has no Split");
        button.click();
        // **WAIT FOR BOTH HALVES.** The new stack is written BEFORE the
        // source is lowered, so that a failure between the two leaves a
        // duplicate rather than losing the units - and a wait on the COUNT
        // alone therefore catches the split mid-flight, at [10, 4], about as
        // often as not (CLAUDE.md §15: wait for exactly what you assert).
        await until(() => actor.items.filter(i => i.name === "Hunting arrows").length === 2
          && actor.items.get(arrows.id)?.system?.quantity === 6, "the split to land whole");
        const stacks = actor.items.filter(i => i.name === "Hunting arrows").map(i => i.system.quantity).sort();
        assert.deepEqual(stacks, [4, 6], "the split lost arrows");

        // Fill the bags and try again: a split can only ever COST room.
        await tryGiveMany(actor, "Torch", 14);
        await until(() => actor.system.bagSlots.used === 16, "the bags to fill");
        await redraw(sheet);
        const full = actor.items.find(i => i.name === "Hunting arrows" && i.system.quantity === 6);
        const inspected = await inspect(sheet, full.id);
        const said = await warnings(async () => {
          inspected.querySelector('[data-action="splitStack"]').click();
          await new Promise(r => setTimeout(r, 400));
        });
        assert.equal(actor.items.filter(i => i.name === "Hunting arrows").length, 2, "a split with no room went through");
        assert.lengthOf(said, 1, "the refusal was not said in words");
      } finally {
        foundry.applications.api.DialogV2.prompt = held;
      }
    });

    it("splits a NOCKED bundle and leaves exactly one of them on the string", async function () {
      this.timeout(180000);
      // **THE NEW STACK IS A COPY OF THE SOURCE**, and a nocked bundle is the
      // one thing exempt from worn-or-kept (D-739, D-641) - so a split left
      // TWO bundles carrying `equipped: true` on one launcher, both reading
      // as the shot in hand. A favourite is an actor flag keyed by item id,
      // so the new stack is never starred either; this pins that too, because
      // it is the sort of thing a later copy-the-whole-row would break.
      const { actor, sheet } = await onGear("ZZ Gear Nocked Split");
      const [arrows] = await tryGive(actor, "Hunting arrows", PACK_FOR.weapon);
      await arrows.update({ "system.quantity": 10, "system.equipped": true });
      await until(() => actor.items.get(arrows.id)?.system?.equipped === true, "the bundle to go on the string");
      assert.equal(actor.items.get(arrows.id).system.quantity, 10);
      await actor.toggleFavorite(arrows.id);
      await until(() => actor.favorites.includes(arrows.id), "the bundle to be starred");
      await redraw(sheet);

      const held = foundry.applications.api.DialogV2.prompt;
      try {
        foundry.applications.api.DialogV2.prompt = async () => 4;
        const card = await inspect(sheet, arrows.id);
        const button = card.querySelector('[data-action="splitStack"]');
        assert.ok(button, "a nocked stack of ten has no Split");
        button.click();
        // The create lands first and the source falls after it, so the wait
        // names both halves or it catches the stack mid-split at [10, 4].
        await until(() => actor.items.filter(i => i.name === "Hunting arrows").length === 2
          && actor.items.get(arrows.id)?.system?.quantity === 6, "the split to land whole");
      } finally {
        foundry.applications.api.DialogV2.prompt = held;
      }

      const both = actor.items.filter(i => i.name === "Hunting arrows");
      assert.deepEqual(both.map(i => i.system.quantity).sort((a, b) => a - b), [4, 6], "the split lost arrows");
      const source = actor.items.get(arrows.id);
      const fresh = both.find(i => i.id !== arrows.id);
      assert.equal(source.system.quantity, 6, "the source kept the wrong half");
      assert.isTrue(source.system.equipped, "the source came off the string");
      assert.isFalse(fresh.system.equipped, "the split-off stack is nocked on the same launcher");
      assert.isTrue(actor.favorites.includes(arrows.id), "the source lost its star");
      assert.isFalse(actor.favorites.includes(fresh.id), "the split-off stack arrived starred");
    });

    it("cleans up the bags: type, then rarity, then name, packed to the front", async function () {
      this.timeout(240000);
      // **CLEAN UP BAGS** (the lead, 2026-09-20). Four different things on
      // purpose: a torch dropped on a torch is a MERGE (D-741), which is the
      // rule above and not this one.
      const { actor, sheet } = await onGear("ZZ Gear Clean Up");
      const [torch] = await tryGive(actor, "Torch");
      const [bedroll] = await tryGive(actor, "Bedroll");
      const [sword] = await tryGive(actor, "Longsword", PACK_FOR.weapon);
      const [shirt] = await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      assert.isTrue([torch, bedroll, sword, shirt].every(Boolean), "the kit was refused");
      await redraw(sheet);

      // Scatter them: a gap in front, and the order jumbled.
      await actor.updateEmbeddedDocuments("Item", [
        { _id: torch.id, "system.well": 14 },
        { _id: bedroll.id, "system.well": 11 },
        { _id: sword.id, "system.well": 9 },
        { _id: shirt.id, "system.well": 4 }
      ]);
      await until(() => actor.items.get(torch.id)?.system?.well === 14, "the scatter to land");
      await redraw(sheet);

      const { el, registered } = useAction(sheet, "tidyBags", { within: gearTab(sheet) });
      assert.ok(el, "the tab carries no Clean Up Bags");
      assert.isTrue(registered, "tidyBags is not registered");
      assert.equal(el.textContent.trim(), game.i18n.localize("AZEROTH.Bags.Tidy"));
      el.click();
      // 08's own order: the weapon (§7), then the suit (§8), then gear by
      // name - Bedroll before Torch. **The wells are computed from each
      // thing's own size**, never hardcoded, so the day a chapter reprices a
      // Longsword this test says what it means rather than what it counted.
      await until(() => actor.items.get(sword.id)?.system?.well === 0, "the weapon to reach the front");
      let at = 0;
      for (const held of [sword, shirt, bedroll, torch]) {
        const live = actor.items.get(held.id);
        assert.equal(live.system.well, at, `${live.name} is not packed to the front`);
        at += live.system.bagSlots;
      }

      await redraw(sheet);
      const order = [...gearTab(sheet).querySelectorAll('.azeroth-bag-panel[data-container-id=""] .azeroth-bag-tile')]
        .map(tile => tile.dataset.itemId);
      assert.deepEqual(order, [sword.id, shirt.id, bedroll.id, torch.id], "the panel is not drawn in the tidied order");

      // A SECOND PRESS WRITES NOTHING, which is what the button promises.
      const wells = order.map(id => actor.items.get(id).system.well);
      const quiet = await warnings(async () => {
        gearTab(sheet).querySelector('[data-action="tidyBags"]').click();
        await new Promise(r => setTimeout(r, 400));
      });
      assert.deepEqual(order.map(id => actor.items.get(id).system.well), wells,
        "a second Clean Up moved something");
      assert.lengthOf(quiet, 0, `the second press warned: ${quiet[0] ?? ""}`);
    });

    /* ---------------------------------------------------------------- */
    /*  The gates                                                       */
    /* ---------------------------------------------------------------- */

    it("registers every action the tab renders", async function () {
      this.timeout(180000);
      const { actor, sheet } = await onGear("ZZ Gear Actions", { bags: ["Backpack"] });
      await tryGive(actor, "Waterskin");
      await tryGive(actor, "Chain shirt", PACK_FOR.armor);
      await redraw(sheet);
      const faults = [];
      for (const el of gearTab(sheet).querySelectorAll("[data-action]")) {
        if (typeof sheet.options?.actions?.[el.dataset.action] !== "function") {
          faults.push(`<${el.tagName.toLowerCase()} data-action="${el.dataset.action}"> has no handler`);
        }
      }
      assert.deepEqual(faults, [], faults.join("\n"));
      // And every tile names a registered PRIMARY, or the double-click is a
      // silent no-op (application.mjs:1947).
      for (const tile of gearTab(sheet).querySelectorAll(".azeroth-bag-tile[data-primary]")) {
        assert.isFunction(sheet.options.actions[tile.dataset.primary],
          `${tile.dataset.primary} is not registered`);
      }
    });

    it("leaves the creature's Gear tab exactly as it was", async function () {
      this.timeout(120000);
      // 05 keeps a creature in pounds, ten times over, and `carried-row.hbs`
      // is still what draws it (the lead's N3). A bag panel here would be the
      // rule reaching an actor it was never written for.
      const ghoul = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(ghoul);
      sheets.push(sheet);
      sheet.changeTab("gear", "primary");
      await settle();
      const tab = sheet.element.querySelector('section[data-tab="gear"]');
      assert.ok(tab, "the creature has no Gear tab");
      assert.isNull(tab.querySelector(".azeroth-bag-panel"), "a bag panel reached the creature's tab");
      assert.ok(tab.querySelector(".azeroth-carried, .azeroth-note"), "the creature's own rows are gone");
    });

    it("measures clean with a tile selected and a zone lit, on a loaded character at 700", async function () {
      this.timeout(240000);
      const actor = await makeCharacter({
        name: "ZZ Gear Loaded",
        bags: ["Backpack", "Sack", "Satchel", "Belt pouch"],
        weapons: ["Amani hatchet", "Shortbow"], armor: ["Chain shirt"]
      });
      await tryGive(actor, ["Torch", "Waterskin", "Bedroll", "Rope, 50 ft (hemp)"]);
      const sheet = await openSheet(actor);
      sheets.push(sheet);
      sheet.changeTab("gear", "primary");
      await sheet.setPosition({ height: 700 });
      await settle();

      const torch = actor.items.find(i => i.name === "Torch");
      await inspect(sheet, torch.id);
      // A zone lit as a drag would light it: the drop outline is drawn on
      // hover and nothing else in the matrix ever measures it.
      bagZone(sheet, "").classList.add("azeroth-drop-into");
      await settle();
      const held = game.user.getFlag("azeroth-rpg", "gearPreview");
      try {
        const findings = checkSheet(sheet.element, { expectColumns: 4, text: false });
        assert.deepEqual(findings, [], formatFindings(findings));
        const legibility = checkText(sheet.element, { requireGroundWithin: true });
        assert.deepEqual(legibility, [], formatFindings(legibility));

        // **AND WITH THE ITEM PREVIEW SHUT** (the lead, 2026-09-20), which is
        // a different layout and not a smaller one: the bags lose the 240px
        // column and reflow across the whole slab. This is the loaded
        // character, so a panel that could not pack at the new width would
        // show here and nowhere else.
        sheet.element.querySelector('[data-action="togglePreview"]').click();
        await settle();
        assert.isTrue(sheet.element.querySelector(".azeroth-bag-inspector-body").hidden,
          "the preview did not shut");
        const shutLayout = checkSheet(sheet.element, { expectColumns: 4, text: false });
        assert.deepEqual(shutLayout, [], formatFindings(shutLayout));
        const shutText = checkText(sheet.element, { requireGroundWithin: true });
        assert.deepEqual(shutText, [], formatFindings(shutText));
      } finally {
        bagZone(sheet, "")?.classList.remove("azeroth-drop-into");
        // The preview state is the USER's flag, so it outlives this batch:
        // put back exactly what was there (CLAUDE.md §14 on fixture pollution).
        if (held === undefined) await game.user.unsetFlag("azeroth-rpg", "gearPreview").catch(() => null);
        else await game.user.setFlag("azeroth-rpg", "gearPreview", held).catch(() => null);
      }
    });
  });
}
