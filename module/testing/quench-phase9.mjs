/**
 * The character creator (D-636): the two doors, Kaelen Voss made from 01's
 * worked example and read back off the actor, the refusals and the notes,
 * the roll, a caster's spells, the window at the floor, and what the sheet
 * reads back - Adaptable's skill at the cheap rate, the tongues, the purse.
 */

import { cleanup, made, makeCharacter, openSheet, fromPack, pinDie, settle, useAction, PACK_FOR } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { STEPS } from "../rules/creation.mjs";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
/** Poll for a render the click did not await. */
const until = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
};

export function creatorBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The character creator", function () {
    after(async function () {
      this.timeout(90000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-creator")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
    const ROAD = ["Bedroll", "Waterskin", "Tinderbox", "Hardtack, a week", "Rope, 50 ft (hemp)"];

    /** 01 §9's Kaelen Voss: Human Warrior, Grave-Tender, the array, a greataxe, Athletics 3 and Survival 2. */
    async function kaelen(overrides = {}) {
      const road = [];
      for (const name of ROAD) road.push({ uuid: await uuidOf(PACK_FOR.equipment, name), quantity: 1, road: true });
      return {
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
        name: "ZZ Kaelen Voss",
        img: "icons/svg/mystery-man.svg",
        motive: "The dead of Lordaeron do not stay down.",
        ...overrides
      };
    }

    const creatorOf = actor => new (game.system.azeroth.creator)(actor ? { actor } : {});

    // ---- the doors ---------------------------------------------------------

    it("the Actor directory's footer carries New character once, after a re-render", async function () {
      this.timeout(30000);
      const { addCreatorButton, CREATOR_BUTTON_CLASS, creatorButton } = await import("../applications/creator-button.mjs");
      const button = creatorButton();
      assert.equal(button.tagName, "BUTTON");
      assert.isFalse(button.hasAttribute("data-action"), "the door must not be a data-action: an unregistered one is a silent no-op");
      await ui.actors.render({ force: true });
      await settle();
      const element = ui.actors.element;
      assert.ok(element.querySelector(`.${CREATOR_BUTTON_CLASS}`), "the footer carries no New character button");
      assert.isFalse(addCreatorButton(element), "a second render stacked a second button");
      assert.equal(element.querySelectorAll(`.${CREATOR_BUTTON_CLASS}`).length, 1);
    });

    it("a blank character's banner offers Build, and a Warrior's does not", async function () {
      this.timeout(30000);
      const blank = await Actor.create({ name: "ZZ Blank Sheet", type: "character" });
      made.push(blank);
      const sheet = await openSheet(blank);
      const door = useAction(sheet, "openCreator");
      assert.ok(door.el, "a blank sheet carries no Build button");
      assert.isTrue(door.registered, "openCreator is not registered on the sheet");
      await sheet.close();
      const warrior = await makeCharacter({ name: "ZZ Built Already", classes: [["Warrior", 1]] });
      const built = await openSheet(warrior);
      assert.isNull(useAction(built, "openCreator").el, "a character with a class still offers Build");
      await built.close();
    });

    // ---- Kaelen, made and read back ---------------------------------------

    it("makes Kaelen Voss from 01's worked example, and the sheet's numbers are the chapter's", async function () {
      this.timeout(120000);
      const creator = creatorOf(null);
      const before = game.actors.size;
      const result = await creator.apply(await kaelen());
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const actor = result.actor;
      made.push(actor);
      assert.equal(game.actors.size, before + 1, "one actor, no more");

      const s = actor.system;
      assert.equal(actor.raceItem?.name, "Human");
      assert.equal(actor.items.get(s.classes[0]?.itemId)?.name, "Warrior");
      assert.equal(actor.careerItem?.name, "Grave-Tender");
      assert.equal(s.career.tier, 1);
      assert.equal(s.abilities.str.value, 16);
      assert.equal(s.abilities.cha.value, 8);
      assert.equal(s.health.max, 15, "Frame 13 + Con +2");
      assert.equal(s.health.value, 15, "Health opens full");
      assert.equal(s.defense, 11);
      assert.equal(s.initiative, 11);
      assert.equal(s.resolve, 4);
      assert.equal(s.spiritTether.value, 3);
      assert.deepEqual({ body: s.ap.body, head: s.ap.head, limb: s.ap.limb }, { body: 3, head: 2, limb: 2 });
      assert.equal(s.speed, 30);
      // Kaelen Voss has Strength 16, so 16 + 3 (05 *Speed and movement*,
      // D-735). The character stopped counting pounds altogether.
      assert.equal(s.bagSlots.base, 19);
      assert.isNull(s.spellDC);
      assert.equal(s.momenta[0]?.name, "rage");
      assert.equal(s.momenta[0]?.max, 10);
      assert.equal(s.momenta[0]?.value, 0);
      assert.equal(s.xp.earned, 100);
      assert.equal(s.xp.spent, 90);
      assert.deepEqual(actor.getFlag("azeroth-rpg", "skillRanks"), { athletics: 3, survival: 2 });
      assert.lengthOf(actor.getFlag("azeroth-rpg", "xpLedger") ?? [], 5);
      assert.deepEqual([...s.languages], ["common"]);
      assert.equal(s.coin, 249, "10s less studded 3s 60c, a greataxe 3s 30c and the road kit 61c");
      assert.match(s.motive, /Lordaeron/);
      assert.isTrue(actor.prototypeToken.actorLink);
      assert.equal(actor.prototypeToken.width, 1);

      const talents = actor.items.filter(i => i.type === "talent");
      assert.equal(talents.filter(t => !t.system.race).length, 36, "the class's thirty-six");
      assert.equal(talents.filter(t => t.system.race).length, 8, "the race's eight");
      assert.equal(talents.find(t => t.name === "Refugee's Road")?.system.taken, 1, "the racial pick");
      assert.equal(talents.find(t => t.name === "Wide Swing")?.system.taken, 1, "the talent point");
      const features = actor.items.filter(i => i.type === "feature");
      assert.isAtLeast(features.length, 5, "four Warrior features and the Human trait");
      const adaptable = features.find(f => f.name === "Adaptable");
      assert.ok(adaptable, "no Adaptable feature");
      assert.equal(adaptable.system.known?.[0]?.uuid, "azeroth-rpg.skill.perception");

      const studded = actor.items.find(i => i.name === "Studded leather");
      const axe = actor.items.find(i => i.name === "Greataxe");
      assert.isTrue(studded?.system.equipped, "the suit is not worn");
      assert.isTrue(axe?.system.equipped, "the weapon is not drawn");
      for (const name of ROAD) {
        const row = actor.items.find(i => i.name === name);
        assert.ok(row, `no ${name}`);
        assert.equal(row.system.quantity, 1);
      }
    });

    it("the sheet reads Adaptable's skill at the cheap rate, and prints the tongues and the purse", async function () {
      this.timeout(120000);
      const creator = creatorOf(null);
      const result = await creator.apply(await kaelen({ name: "ZZ Kaelen Reads" }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const actor = result.actor;
      made.push(actor);
      const sheet = await openSheet(actor);
      try {
        const buy = sheet.element.querySelector('[data-action="buyRank"][data-skill="perception"]');
        assert.ok(buy, "no Buy on the Perception row");
        const spent = actor.system.xp.spent;
        click(buy);
        for (let i = 0; i < 100 && actor.system.xp.spent === spent; i++) await new Promise(r => setTimeout(r, 50));
        assert.equal(actor.system.xp.spent, spent + 10, "Perception is in-career through Adaptable: Rank 1 costs 10, not 20");
        assert.equal(actor.getFlag("azeroth-rpg", "skillRanks")?.perception, 1);
        const core = sheet.element.querySelector(".azeroth-core-identity");
        assert.ok(core, "the Core tab carries no identity lines");
        assert.include(core.textContent, "Common");
        assert.include(core.querySelector('input[name="system.motive"]')?.value ?? "", "Lordaeron");
        const purse = sheet.element.querySelector(".azeroth-purse-coins");
        assert.equal(purse?.textContent.trim(), "2s 49c");
      } finally {
        await sheet.close();
      }
    });

    it("Build on a blank sheet fills that actor and makes no other", async function () {
      this.timeout(120000);
      const blank = await Actor.create({ name: "ZZ Handed Over", type: "character" });
      made.push(blank);
      const before = game.actors.size;
      const creator = creatorOf(blank);
      const result = await creator.apply(await kaelen({ name: "ZZ Handed Over, Built" }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.equal(result.actor.id, blank.id, "the creator made a second actor");
      assert.equal(game.actors.size, before, "no other actor");
      assert.equal(blank.name, "ZZ Handed Over, Built");
      assert.equal(blank.system.health.max, 15);
      assert.equal(blank.system.coin, 249);
      assert.equal(blank.raceItem?.name, "Human");
      assert.isTrue(blank.prototypeToken.actorLink);
    });

    // ---- refusals and notes -----------------------------------------------

    it("refuses what the book refuses, on the step it belongs to, and makes nothing", async function () {
      this.timeout(120000);
      const creator = creatorOf(null);
      const before = game.actors.size;
      const base = await kaelen();
      const codes = async (over, want) => {
        const r = await creator.apply({ ...base, ...over });
        assert.isFalse(r.ok, `${want} was accepted`);
        assert.include(r.reasons.map(x => x.code), want);
        return r.reasons.find(x => x.code === want).step;
      };
      assert.equal(await codes({ race: null }, "noRace"), "race");
      assert.equal(await codes({ abilities: { ...base.abilities, dex: 16 } }, "arrayValueTwice"), "abilities");
      assert.equal(await codes({ ranks: { athletics: 4, survival: 1 } }, "xpOver"), "skills");
      assert.equal(await codes({ racialTalent: null }, "noRacialTalent"), "talents");
      assert.equal(await codes({ equipment: [...base.equipment, { uuid: await uuidOf(PACK_FOR.armor, "Chain shirt"), quantity: 1, road: false }] }, "purseOverspent"), "equipment");
      assert.equal(await codes({ name: " " }, "noName"), "name");
      const elf = await codes({ race: await uuidOf(PACK_FOR.race, "Blood Elf"), adaptable: null, racialTalent: "Magister's Training" }, "sideUnchosen");
      assert.equal(elf, "languages");
      assert.equal(game.actors.size, before, "a refusal made an actor");
    });

    it("notes the table's judgements on the career step and never refuses them", async function () {
      this.timeout(60000);
      const creator = creatorOf(null);
      const base = await kaelen({
        race: await uuidOf(PACK_FOR.race, "Orc"), adaptable: null, racialTalent: "Warsong Memory",
        career: await uuidOf(PACK_FOR.career, "Watchman")
      });
      await creator.render({ force: true });
      await settle();
      await creator.setState({ ...base, step: "career" });
      await settle();
      const notes = [...creator.element.querySelectorAll(".azeroth-forge-notes li")].map(li => li.textContent);
      assert.ok(notes.some(t => /Alliance/.test(t)), "an Alliance career on an orc is not noted");
      assert.ok(notes.some(t => /Entry/.test(t)), "the Entry is not put to the table");
      const reasons = [...creator.element.querySelectorAll(".azeroth-forge-reasons li")].map(li => li.textContent);
      assert.notOk(reasons.some(t => /Alliance|Watchman/.test(t)), "the side was refused");
      await creator.close();
    });

    it("stars the ability 01 §3 puts the 16 in, and the class card names it in words", async function () {
      this.timeout(90000);
      // *"A 16 in the ability your class fights or casts with"* — the chapter
      // says it once and the pane marked nothing, so a player picking Warrior
      // had no way to know (the lead, 2026-09-13). Ink and a word, never a
      // colour alone.
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await settle();
      await creator.setState(await kaelen());

      const starred = async () => {
        await creator.goTo("abilities");
        await settle();
        return [...creator.element.querySelectorAll("li[data-ability]")]
          .filter(li => li.querySelector(".azeroth-creator-primary"))
          .map(li => li.dataset.ability);
      };
      assert.deepEqual(await starred(), ["str"], "a Warrior's Strength is not starred");

      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Mage"), classTalent: null, spells: [] });
      assert.deepEqual(await starred(), ["int"], "a Mage's Intelligence is not starred");

      // THE RANGER HOLDS BOTH: it fights with Dexterity and casts with Wisdom,
      // so two rows are starred and each says which.
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Ranger"), classTalent: null, spells: [] });
      assert.deepEqual(await starred(), ["dex", "wis"], "the Ranger does not star both");
      const mark = key => creator.element
        .querySelector(`li[data-ability="${key}"] .azeroth-creator-primary`)?.getAttribute("aria-label") ?? "";
      assert.include(mark("dex"), game.i18n.localize("AZEROTH.Creator.FightsWithTip"));
      assert.include(mark("wis"), game.i18n.localize("AZEROTH.Creator.CastsWithTip"));

      // And the class card prints the fighting ability beside the casting one.
      await creator.goTo("class");
      await settle();
      const detail = creator.element.querySelector(".azeroth-creator-detail")?.textContent ?? "";
      assert.include(detail, game.i18n.localize("AZEROTH.Creator.FightsWith"), "the class card does not name the fighting ability");
      assert.include(detail, game.i18n.localize("AZEROTH.Ability.Dex.Label"));
      assert.include(detail, game.i18n.localize("AZEROTH.Item.CastingAbility"));

      // A class that casts nothing still names one.
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Rogue"), classTalent: null, spells: [] });
      await settle();
      const rogue = creator.element.querySelector(".azeroth-creator-detail")?.textContent ?? "";
      assert.include(rogue, game.i18n.localize("AZEROTH.Creator.FightsWith"));
      assert.notInclude(rogue, game.i18n.localize("AZEROTH.Item.CastingAbility"), "a Rogue was given a casting ability");
      assert.deepEqual(await starred(), ["dex"], "a Rogue's Dexterity is not starred");

      await creator.close();
    });

    it("rolls 4d6 drop the lowest six times, posts once, and rerolls the set below the floor", async function () {
      this.timeout(60000);
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await settle();
      await creator.setState({ step: "abilities", method: "roll" });
      const messages = game.messages.size;
      let unpin = pinDie(6, 6);
      let set;
      try { set = await creator.roll(); } finally { unpin(); }
      assert.deepEqual(set, [18, 18, 18, 18, 18, 18]);
      assert.equal(game.messages.size, messages + 1, "one chat message for the six");
      await settle();
      assert.isNull(creator.element.querySelector('[data-action="creatorReroll"]'), "a set above the floor offers Reroll");
      unpin = pinDie(1, 6);
      try { set = await creator.roll(); } finally { unpin(); }
      assert.deepEqual(set, [3, 3, 3, 3, 3, 3]);
      await settle();
      assert.ok(creator.element.querySelector('[data-action="creatorReroll"]'), "a set below the floor offers no Reroll");
      for (const m of [...game.messages.contents].slice(-2)) await m.delete();
      await creator.close();
    });

    it("asks a Priest for four plus the Wisdom modifier tier-1 spells of the Light or Shadow, and refuses Fire", async function () {
      this.timeout(90000);
      const creator = creatorOf(null);
      const pack = game.packs.get(PACK_FOR.spell);
      const index = await pack.getIndex({ fields: ["system.school", "system.tier", "system.classes"] });
      const holy = index.filter(e => e.system.tier === 1 && e.system.school === "holy").slice(0, 7).map(e => e.uuid);
      const fire = index.find(e => e.system.tier === 1 && e.system.school === "fire")?.uuid;
      assert.lengthOf(holy, 7, "07 holds fewer than seven tier-1 Holy spells");
      const base = await kaelen({
        cls: await uuidOf(PACK_FOR.class, "Priest"),
        abilities: { str: 12, dex: 13, con: 14, int: 10, wis: 16, cha: 8 },
        classTalent: null, spells: [], name: "ZZ Priest Spells"
      });
      const few = await creator.apply({ ...base, spells: holy.slice(0, 3) });
      assert.isFalse(few.ok);
      const count = few.reasons.find(r => r.code === "spellCount");
      assert.ok(count, "the count was not refused");
      assert.deepEqual(count.data, { required: 7, chosen: 3 });
      const wrong = await creator.apply({ ...base, spells: [...holy.slice(0, 6), fire] });
      assert.include(wrong.reasons.map(r => r.code), "spellSchool");
    });

    // ---- the window ---------------------------------------------------------

    it("renders every step at the floor, with Kaelen's choices in it", async function () {
      this.timeout(120000);
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await settle();
      await creator.setState(await kaelen());
      for (const step of STEPS) {
        await creator.goTo(step);
        await settle();
        const findings = checkText(creator.element);
        assert.deepEqual(findings, [], `${step}: ${findings.map(f => `${f.kind} ${f.detail}`).join("; ")}`);
        // The window frame carries core's own actions (close, toggleControls);
        // the pane's are the ones this window must register.
        const frame = creator.element.querySelector(".azeroth-creator-frame");
        for (const el of frame.querySelectorAll("[data-action]")) {
          assert.isFunction(creator.options.actions?.[el.dataset.action], `${step}: ${el.dataset.action} has no handler`);
        }
      }
      await creator.close();
    });

    it("loads the class's kit into the cart and the summary prices it", async function () {
      this.timeout(60000);
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await settle();
      await creator.setState({ ...(await kaelen()), equipment: [], step: "equipment" });
      await settle();
      const kit = creator.element.querySelector('[data-action="creatorKit"]');
      assert.ok(kit, "no kit button for a class with one");
      click(kit);
      await settle();
      const rows = creator.state.equipment;
      assert.lengthOf(rows, 8, "studded, sword, shield and the five of the road");
      assert.equal(rows.filter(r => r.road).length, 5);
      assert.include(creator.element.querySelector(".azeroth-creator-purse")?.textContent ?? "", "1s 89c", "811c spent of 10s leaves 1s 89c");
      await creator.close();
    });

    it("browses the catalogue inside the window: typing filters the rows, Enter buys the first match, no popup (D-638)", async function () {
      this.timeout(60000);
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await settle();
      await creator.setState({ ...(await kaelen()), equipment: [], step: "equipment" });
      await settle();
      assert.isNull(creator.element.querySelector("datalist"), "a native datalist popup");
      const input = () => creator.element.querySelector("input[name=itemSearch]");
      const list = () => creator.element.querySelector("[data-picker-list=items]");
      const showing = () => [...list().querySelectorAll("li[data-search]:not([hidden])")].map(li => li.dataset.search);
      const type = text => { input().value = text; input().dispatchEvent(new Event("input", { bubbles: true })); };
      assert.isAbove(showing().length, 200, "the whole Common catalogue browses before anything is typed");
      type("longsw");
      assert.deepEqual(showing(), ["longsword"]);
      const drawn = input();
      drawn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await until(() => input() !== drawn, "the render after Enter");
      assert.lengthOf(creator.state.equipment, 1, "Enter bought the one row showing");
      assert.equal(creator.state.equipment[0].uuid, await uuidOf(PACK_FOR.weapon, "Longsword"));
      assert.equal(input().value, "longsw", "the term survives the render");
      assert.deepEqual(showing(), ["longsword"], "the list is still filtered after the render");
      type("zzzz");
      assert.deepEqual(showing(), []);
      assert.isFalse(list().querySelector(".azeroth-picker-none").hidden, "nothing matches, said in the list");
      await creator.close();
    });

    it("Cancel leaves nothing behind", async function () {
      this.timeout(60000);
      const before = game.actors.size;
      const creator = creatorOf(null);
      await creator.render({ force: true });
      await creator.setState(await kaelen({ name: "ZZ Never Made" }));
      click(creator.element.querySelector('[data-action="creatorCancel"]'));
      await settle();
      assert.isFalse(creator.rendered);
      assert.equal(game.actors.size, before);
      assert.isUndefined(game.actors.find(a => a.name === "ZZ Never Made"));
    });

    it("the packs carry every class's kit and every career's side", async function () {
      this.timeout(30000);
      const classes = await game.packs.get(PACK_FOR.class).getDocuments();
      assert.lengthOf(classes, 9);
      for (const c of classes) {
        assert.isAtLeast(c.system.kit.length, 8, `${c.name} has no kit`);
        assert.equal(c.system.kit.filter(r => r.road).length, 5, `${c.name} lacks the road kit`);
      }
      const careers = await game.packs.get(PACK_FOR.career).getIndex({ fields: ["system.tier", "system.side"] });
      const tierOne = careers.filter(e => e.system.tier === 1);
      assert.lengthOf(tierOne, 16);
      assert.lengthOf(tierOne.filter(e => e.system.side !== "anyone"), 6, "six standing careers among the sixteen");
      assert.equal(careers.find(e => e.name === "Watchman")?.system.side, "alliance");
    });
  });
}
