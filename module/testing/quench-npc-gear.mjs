/**
 * **A CREATURE HOLDS THINGS, AND THEY ADD TO ITS BLOCK** (the lead's N1,
 * 2026-09-10). The live layer under `rules/carried-gear.test.mjs` and
 * `rules/grant-doors.test.mjs`: the pure law and the source census both pass
 * on code nobody has run, and only a prepared actor says the number moved.
 *
 * Every test here is written the same way: read the block's own number FIRST,
 * put something on the creature, and assert the delta. Nothing compares
 * against a constant, because 14 is what states these numbers and the pack is
 * regenerated from the chapter (D3 §7).
 */

import { cleanup, fromPack, made, makeNpc, settle, PACK_FOR } from "./fixtures.mjs";

/** Wait for a condition. */
const until = async (fn, what, ms = 5000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** A pack item embedded on an actor, by name. */
async function give(actor, name, packId) {
  const doc = await fromPack(packId, name);
  if (!doc) throw new Error(`${name} is not in ${packId}`);
  const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return item;
}

/** A thing carrying an 08 §6 grant sentence, worn. `flags` is the affix door. */
async function grant(actor, name, sentences, extra = {}) {
  const [item] = await actor.createEmbeddedDocuments("Item", [{
    name: `ZZ ${name}`,
    type: "gear",
    system: { equipped: true, ...extra },
    flags: { "azeroth-rpg": { grants: sentences } }
  }]);
  made.push(item);
  return item;
}

export function creatureGearBatch(context) {
  const { describe, it, assert, after } = context;

  describe("A creature holds, wears and carries things (N1)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    /* ---- the empty case, which is 164 of the 164 --------------------------- */

    it("carrying NOTHING derives exactly what the chapter prints", async function () {
      this.timeout(60000);
      const source = await fromPack("azeroth-rpg.bestiary", "Abomination");
      const actor = await makeNpc("Abomination");
      const block = source.toObject().system;
      const sys = actor.system;
      assert.deepEqual({ ...sys.ap }, { ...block.ap }, "the Armor Points moved with nothing worn");
      assert.equal(sys.defense, block.defense, "the Defense moved with nothing worn");
      assert.equal(sys.initiative, block.initiative, "the Initiative moved with nothing worn");
      assert.equal(sys.speed, block.speed, "the Speed moved with nothing worn");
      assert.equal(sys.health.max, block.health.max, "the Health maximum moved with nothing worn");
      assert.equal(sys.abilities.str.value, block.abilities.str.value, "the Strength score moved");
      assert.equal(sys.abilities.str.total, block.abilities.str.value, "the total is not the block's score");
      assert.deepEqual({ ...sys.ward }, { ...block.ward }, "the Ward moved with nothing worn");
      // And it is carrying nothing rather than being weighed down by zero.
      assert.equal(sys.carried, 0);
      assert.equal(sys.load, "unencumbered");
      // Strength 16, Large: 16 x 10 x 2 (05 §10).
      assert.equal(sys.carryCapacity, 320, "05 §10's capacity, at the creature's own size");
      assert.deepEqual(sys.speedParts.map(p => p.key), ["block"], "an unloaded creature has one Speed part");
    });

    /* ---- 08 §8's Armor Points ---------------------------------------------- */

    it("adds a worn suit's Armor Points to the block's own, by location", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const before = { ...actor.system.ap };
      const suit = await give(actor, "Mail hauberk", PACK_FOR.armor);
      await suit.update({ "system.equipped": true });
      await until(() => actor.system.ap.body === before.body + 4, "the suit's Body points");
      // Mail is 4 / 3 / 3 (08 §8's category table), ON TOP of what 14 prints.
      assert.equal(actor.system.ap.head, before.head + 3, "the Head points did not add");
      assert.equal(actor.system.ap.limb, before.limb + 3, "the Limb points did not add");

      // And taking it off gives the block back, unchanged.
      await suit.update({ "system.equipped": false });
      await until(() => actor.system.ap.body === before.body, "the block's own points back");
      assert.deepEqual({ ...actor.system.ap }, before, "the block did not come back");
    });

    it("LEAVES A NULL LOCATION NULL — an ooze in a helmet grows no head (06 §2)", async function () {
      this.timeout(60000);
      // The Plague Ooze prints a Body line alone.
      const actor = await makeNpc("Plague Ooze");
      const before = { ...actor.system.ap };
      assert.isNull(before.head, "the fixture no longer has a null location, so this proves nothing");
      const suit = await give(actor, "Mail hauberk", PACK_FOR.armor);
      await suit.update({ "system.equipped": true });
      await until(() => actor.system.ap.body === before.body + 4, "the suit's Body points");
      assert.isNull(actor.system.ap.head, "the ooze sprouted a head to be called-shot at");
      assert.isNull(actor.system.ap.limb, "the ooze sprouted limbs");
      assert.isFalse(actor.system.hasLocation("head"), "hasLocation now offers the Head");
      assert.deepEqual(actor.system.locations, ["body"], "06 §2's called shots gained a location");
    });

    /* ---- 08 §6's and §20's grant sentences --------------------------------- */

    it("moves the Defense a ring grants, and puts it back when it comes off", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const before = actor.system.defense;
      const ring = await grant(actor, "Band of Warding", ["+2 Defense"]);
      await until(() => actor.system.defense === before + 2, "the +2 Defense reaching the creature");
      await ring.update({ "system.equipped": false });
      await until(() => actor.system.defense === before, "the Defense falling back to the block's");
    });

    it("moves the Initiative and the Attack Test's own bonus", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const before = { initiative: actor.system.initiative, attack: actor.system.attackBonus ?? 0 };
      await grant(actor, "Charm of the Quickening", ["+1 Initiative", "+3 Attack"]);
      await until(() => actor.system.initiative === before.initiative + 1, "the +1 Initiative");
      assert.equal(actor.system.attackBonus, before.attack + 3, "the +3 Attack never reached system.attackBonus");
    });

    it("moves the MODIFIER an attribute grant buys, and leaves 14's own score alone", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const score = actor.system.abilities.str.value;
      const mod = actor.system.abilities.str.mod;
      await grant(actor, "Girdle of the Bear", ["+2 Strength"]);
      await until(() => actor.system.abilities.str.total === score + 2, "the +2 Strength");
      assert.equal(actor.system.abilities.str.value, score,
        "the grant was written into the block's own score, which the sheet submits back");
      assert.equal(actor.system.abilities.str.mod, mod + 1, "the modifier never moved, so no Test moved");
      assert.deepEqual(actor.system.abilities.str.sources.map(s => s.name), ["ZZ Girdle of the Bear"],
        "the score moved and nothing says what moved it");
    });

    it("adds a Ward grant to the block's own row (08 §6, D-644)", async function () {
      this.timeout(60000);
      // The Abomination prints Shadow 2.
      const actor = await makeNpc("Abomination");
      const before = actor.system.ward.shadow ?? 0;
      await grant(actor, "Warded shroud", ["+1 Ward in Shadow", "+2 Ward in Fire"]);
      await until(() => (actor.system.ward.shadow ?? 0) === before + 1, "the Ward joining the block's row");
      assert.equal(actor.system.ward.fire ?? 0, 2, "a school the block does not print never arrived");
    });

    it("makes Fortitude a point of Health on the block's own maximum", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const before = actor.system.health.max;
      await grant(actor, "Sturdy brace", ["+3 Fortitude"]);
      await until(() => actor.system.health.max === before + 3, "the Fortitude reaching the Health maximum");
    });

    it("carries Spellpower to the creature's own spell (08 §6, §9)", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Adept of the Schools");
      const before = actor.system.spellpower?.fire ?? 0;
      await grant(actor, "Runed focus", ["+2 Spellpower in Fire"]);
      await until(() => (actor.system.spellpower?.fire ?? 0) === before + 2,
        "the Spellpower reaching the creature");
    });

    it("raises a Boon on a named skill, and a Boon on a KIND of Test in the other bag", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      await grant(actor, "Climber's harness", ["A Boon on Athletics"]);
      await until(() => (actor.system.skillBoons?.athletics ?? []).length === 1,
        "the skill Boon reaching the dialog's bag");
      await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Aegis of the Duelist", type: "gear",
        system: {
          equipped: true,
          signatureEffect: { kind: "standing", gates: [], grants: ["A Boon on Parry Tests"] }
        }
      }]);
      await until(() => (actor.system.grants?.testBoonSources?.parry ?? []).length === 1,
        "the Test Boon reaching `system.grants`, which is the bag the dialog reads");
    });

    /* ---- 05 §10's carrying rule -------------------------------------------- */

    it("takes 05 §10's fifteen feet off an OVERLOADED creature, as a Speed part", async function () {
      this.timeout(90000);
      const actor = await makeNpc("Abomination");
      const speed = actor.system.speed;
      const capacity = actor.system.carryCapacity;
      assert.isAbove(capacity, 0, "the fixture has no carry limit, so this proves nothing");

      const [load] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ A great deal of ore", type: "gear",
        system: { weight: capacity + 1 }
      }]);
      made.push(load);
      await until(() => actor.system.load === "encumbered", "the creature to become Encumbered");
      assert.equal(actor.system.speed, speed - 5, "Encumbered costs 5 feet (05 §10)");

      await load.update({ "system.weight": capacity * 2 + 1 });
      await until(() => actor.system.load === "overloaded", "the creature to become Overloaded");
      assert.equal(actor.system.speed, speed - 15, "Overloaded costs 15 feet (05 §10, D-675)");
      // A PART rather than a fifteenth condition (CLAUDE.md §4).
      const part = (actor.system.speedParts ?? []).find(p => p.key === "encumbered");
      assert.ok(part, "the load is not a Speed part, so nothing can say where the feet went");
      assert.equal(part.value, -15);
      assert.equal(actor.effects.size, 0, "the load became an Active Effect rather than a part");

      await load.update({ "system.weight": 1 });
      await until(() => actor.system.load === "unencumbered", "the load coming off");
      assert.equal(actor.system.speed, speed, "the block's own Speed did not come back");
    });

    it("gives a creature with a `—` STRENGTH no carry limit at all", async function () {
      this.timeout(60000);
      // The Banshee has no Strength score; `Math.trunc(null)` is 0, so the rule
      // as written made its capacity ZERO and one dagger Overloaded it.
      const actor = await makeNpc("Banshee");
      assert.isNull(actor.system.abilities.str.value, "the fixture has a Strength, so this proves nothing");
      assert.isNull(actor.system.carryCapacity, "a creature with no Strength was given a carry limit");
      const speed = actor.system.speed;
      const [load] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ A heavy chest", type: "gear", system: { weight: 500 }
      }]);
      made.push(load);
      await settle();
      assert.equal(actor.system.load, "unencumbered", "a creature with no Strength was Overloaded");
      assert.equal(actor.system.speed, speed, "its Speed dropped for a load it cannot have");
      // And the modifier is still `—` rather than -5.
      assert.isNull(actor.system.abilities.str.mod);
      assert.isNull(actor.system.abilities.str.total);
    });

    /* ---- the purse (N3) ----------------------------------------------------- */

    it("keeps a purse in 08 §2's coin, which 14 prints nowhere", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      assert.equal(actor.system.coin, 0, "a creature does not start with money");
      await actor.update({ "system.coin": 240 });
      await until(() => actor.system.coin === 240, "the purse to be stored");
    });
  });
}
