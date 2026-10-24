/**
 * **DOOR 1, LIVE: A LEGACY IS A FOURTH BRANCH, KEPT BY ONE PEOPLE** (04 §1; D-781,
 * the Legacy branches' phase B5).
 *
 * Driven through the real doors: a class and a race embedded on a character (the
 * grant chain `_onCreateDescendantDocuments` starts), a race dropped and a race
 * deleted (the resync), the sheet's own Progress tab and its Open, the creator's
 * `apply`, and migration 0.12.25's `migrate`. Every outcome is read back off the
 * documents.
 *
 * - an orc Warrior holds Blademaster's twelve beside the class's thirty-six, and a
 *   human Warrior does not;
 * - the Progress tab draws the Legacy fourth, marked *Blademaster (Orc)* in words,
 *   and its tree on the Warrior's crest;
 * - a race change withdraws the old people's branch whole - its taken ranks with
 *   it, so the points come back - and brings the new people's untaken; a race
 *   deleted takes the branch it kept;
 * - the creator makes a Forsaken Ranger who spends the level's point on Dark
 *   Ranger's Keening Arrows, and refuses a human Warrior Wolf's Pace in words;
 * - migration 0.12.25 gives a character made before it the branch it is owed.
 *
 * Written in B5 and NOT run (the brief: offline, Vitest only). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-branches`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, fromPack, made, makeCharacter, openSheet, settle, PACK_FOR } from "./fixtures.mjs";
import { pointsSpent } from "../rules/talents.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
/** The class talents a character holds, a racial talent never among them. */
const classTalents = actor => actor.items.filter(i => i.type === "talent" && !i.system?.race);
/** The Legacy talents a character holds, by people. */
const legacyOf = (actor, people) => classTalents(actor).filter(i => i.system?.legacy === people);

export function legacyBranchesBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The Legacy branches, door 1 (B5)", function () {
    after(async function () {
      this.timeout(120000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-creator")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    it("gives an orc Warrior Blademaster's twelve beside the class's thirty-six, and a human Warrior nothing more", async function () {
      this.timeout(60000);
      const orc = await makeCharacter({ name: "ZZ Legacy Orc", classes: [["Warrior", 1]], race: "Orc" });
      await until(() => classTalents(orc).length === 48, "the orc's 48 class talents");
      const blademaster = legacyOf(orc, "Orc");
      assert.lengthOf(blademaster, 12);
      assert.isTrue(blademaster.every(t => t.system.className === "Warrior" && t.system.branch === "Blademaster" && t.system.taken === 0));
      assert.lengthOf(classTalents(orc).filter(t => t.system.legacy && t.system.legacy !== "Orc"), 0, "another people's branch");
      const human = await makeCharacter({ name: "ZZ Legacy Human", classes: [["Warrior", 1]], race: "Human" });
      await settle();
      assert.lengthOf(classTalents(human), 36);
      assert.lengthOf(classTalents(human).filter(t => t.system.legacy), 0, "a human warrior holds a Legacy's talent");
    });

    it("draws the Legacy fourth on the Progress tab, marked with its people, and opens its tree on the class's crest", async function () {
      this.timeout(60000);
      const orc = await makeCharacter({ name: "ZZ Legacy Frame", classes: [["Warrior", 1]], race: "Orc" });
      await until(() => classTalents(orc).length === 48, "the orc's 48 class talents");
      const sheet = await openSheet(orc);
      try {
        sheet.changeTab("progress", "primary");
        await sheet.render({ force: true });
        await settle();
        const names = [...sheet.element.querySelectorAll(".azeroth-branch-name")].map(e => e.textContent.trim());
        assert.deepEqual(names, ["Arms", "Fury", "Bulwark", "Blademaster (Orc)"]);
        const open = sheet.element.querySelector('[data-action="openBranch"][data-branch="Warrior/Blademaster"]');
        assert.ok(open, "the Legacy branch has no Open");
        click(open);
        await until(() => sheet.element.querySelector(".azeroth-tree-title"), "the tree");
        assert.include(sheet.element.querySelector(".azeroth-tree-title").textContent.replace(/\s+/g, " "), "Warrior · Blademaster (Orc)");
        assert.include(sheet.element.querySelector(".azeroth-tree-crest")?.getAttribute("src") ?? "", "/crest/warrior.png");
        assert.lengthOf(sheet.element.querySelectorAll(".azeroth-tree .azeroth-talent"), 12);
      } finally {
        await sheet.close();
      }
    });

    it("withdraws the old people's branch whole on a race change, points and all, and brings the new people's untaken", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Legacy Turncoat", classes: [["Warrior", 3]], race: "Orc" });
      await until(() => legacyOf(actor, "Orc").length === 12, "Blademaster's twelve");
      const pace = legacyOf(actor, "Orc").find(t => t.name === "Wolf's Pace");
      await pace.update({ "system.taken": 2 });
      await until(() => pointsSpent(classTalents(actor).map(t => t.system)) === 2, "two points spent in Blademaster");

      // A dwarf now: Mountain King arrives untaken and Blademaster leaves, its two points with it.
      const dwarf = (await fromPack(PACK_FOR.race, "Dwarf")).toObject();
      await actor.createEmbeddedDocuments("Item", [dwarf]);
      await until(() => actor.raceItem?.name === "Dwarf" && legacyOf(actor, "Orc").length === 0 && legacyOf(actor, "Dwarf").length === 12,
        "Blademaster withdrawn and Mountain King embedded", 20000);
      assert.lengthOf(actor.items.filter(i => i.type === "race"), 1, "two races held");
      assert.equal(pointsSpent(classTalents(actor).map(t => t.system)), 0, "the points spent in Blademaster did not come back");
      assert.isTrue(legacyOf(actor, "Dwarf").every(t => t.system.taken === 0 && t.system.branch === "Mountain King"));
      assert.lengthOf(classTalents(actor), 48, "the class's thirty-six moved");

      // No race at all: the branch it kept leaves too.
      await actor.raceItem.delete();
      await until(() => legacyOf(actor, "Dwarf").length === 0, "Mountain King withdrawn with the race", 20000);
      assert.lengthOf(classTalents(actor), 36);
    });

    it("makes a Forsaken Ranger in the creator on Dark Ranger's Keening Arrows, and refuses a human Warrior Wolf's Pace in words", async function () {
      this.timeout(120000);
      const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
      const creator = new (game.system.azeroth.creator)({});
      const base = {
        method: "array",
        abilities: { str: 10, dex: 16, con: 13, int: 8, wis: 14, cha: 12 },
        rolled: null,
        career: await uuidOf(PACK_FOR.career, "Grave-Tender"),
        allowTier2: false,
        ranks: { survival: 2 },
        adaptable: null,
        spells: [],
        side: null,
        equipment: [],
        img: "icons/svg/mystery-man.svg",
        motive: "The Dark Lady saw me once."
      };
      const result = await creator.apply({
        ...base,
        race: await uuidOf(PACK_FOR.race, "Forsaken"),
        cls: await uuidOf(PACK_FOR.class, "Ranger"),
        racialTalent: "Remembered Life",
        classTalent: "keening-arrows",
        name: "ZZ Legacy Dark Ranger"
      });
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      made.push(result.actor);
      const ranger = result.actor;
      assert.lengthOf(legacyOf(ranger, "Forsaken"), 12, "the Dark Ranger's twelve");
      assert.equal(legacyOf(ranger, "Forsaken").find(t => t.name === "Keening Arrows")?.system.taken, 1, "the level's point");

      const refused = await new (game.system.azeroth.creator)({}).apply({
        ...base,
        abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
        race: await uuidOf(PACK_FOR.race, "Human"),
        cls: await uuidOf(PACK_FOR.class, "Warrior"),
        adaptable: "perception",
        racialTalent: "Refugee's Road",
        classTalent: "wolfs-pace",
        name: "ZZ Legacy Refused"
      });
      assert.isFalse(refused.ok);
      assert.include(refused.reasons.map(r => r.code), "classTalentNotYourPeople");
      assert.include(game.i18n.format("AZEROTH.Creator.Refused.classTalentNotYourPeople", { name: "Wolf's Pace", people: "Orc" }), "Orc");
    });

    it("OFFERS a Legacy's tier 1 on the talents step to its own people alone, and picks none by default (B9a)", async function () {
      this.timeout(120000);
      // The creator's pane, rendered: an orc Warrior is offered Blademaster's three
      // beside the class's own; a human Warrior is not offered them at all, so the
      // refusal above is reached only by a pick handed in by hand. Nothing is chosen
      // until the player chooses (the full run's `classTalentNotYourPeople` was a
      // test picking the index's first tier 1 talent, a Blademaster one).
      const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      try {
        const offered = async race => {
          await creator.setState({ race: await uuidOf(PACK_FOR.race, race), cls: await uuidOf(PACK_FOR.class, "Warrior"), classTalent: null, step: "talents" });
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return [...creator.element.querySelectorAll('input[name="classTalent"]')].map(i => ({ value: i.value, checked: i.checked }));
        };
        const orc = await offered("Orc");
        assert.include(orc.map(o => o.value), "wolfs-pace", "an orc Warrior is not offered Wolf's Pace");
        assert.isFalse(orc.some(o => o.checked), "a talent was chosen before the player chose one");
        const human = await offered("Human");
        assert.isAbove(human.length, 0, "a human Warrior is offered no tier 1 talent at all");
        assert.notInclude(human.map(o => o.value), "wolfs-pace", "a human Warrior is offered another people's Legacy");
        for (const id of ["read-the-blade", "telling-blow", "bash", "stout-heart", "axe-and-hammer"]) {
          assert.notInclude(human.map(o => o.value), id, `a human Warrior is offered the Legacy talent ${id}`);
        }
        assert.isFalse(human.some(o => o.checked), "a talent was chosen before the player chose one");
      } finally {
        await creator.close().catch(() => null);
      }
    });

    it("gives a character made before migration 0.12.25 the branch its people keep", async function () {
      this.timeout(180000);
      const troll = await makeCharacter({ name: "ZZ Legacy Before", classes: [["Shaman", 2]], race: "Troll" });
      await until(() => legacyOf(troll, "Troll").length === 12, "Shadow Hunter's twelve");
      // As a world made before this version held it: the class's thirty-six alone.
      await troll.deleteEmbeddedDocuments("Item", legacyOf(troll, "Troll").map(t => t.id));
      await until(() => legacyOf(troll, "Troll").length === 0, "the branch taken off by hand");
      const { migrate } = await import("../migrations/0.12.25-legacy-branches.mjs");
      await migrate(() => {});
      await until(() => legacyOf(troll, "Troll").length === 12, "the migration's Shadow Hunter", 30000);
      // A second pass finds nothing to embed.
      await migrate(() => {});
      await settle();
      assert.lengthOf(legacyOf(troll, "Troll"), 12, "the migration embedded the branch twice");
    });

    it("holds the seven Legacies as lore: a people, a class, a branch, and no ranks (D-781)", async function () {
      const pack = game.packs.get("azeroth-rpg.legacies");
      const index = await pack.getIndex();
      assert.equal(index.size, 7);
      const doc = await pack.getDocument(index.find(e => e.name === "Blademaster")._id);
      assert.equal(doc.system.race, "Orc");
      assert.equal(doc.system.className, "Warrior");
      assert.equal(doc.system.branch, "Blademaster");
      assert.isAbove(doc.system.builds.length, 40);
      assert.notProperty(doc.system.toObject(), "ranks");
      assert.notProperty(doc.system.toObject(), "rank");
    });
  });
}
