/**
 * The loot generator (D-666): a find rolled by scenario and tier, offered
 * row by row, and created into "Generated Items" — re-forgeable, because
 * the payload is the Forge's own shape.
 *
 * The draw is injected, so every test here pins it: `stepping()` hands the
 * window a sequence and the rows come out the same every run.
 */

import { cleanup, made, openSheet, settle } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { AZEROTH } from "../config.mjs";

const change = el => el.dispatchEvent(new Event("change", { bubbles: true }));

/** A draw that walks a fixed sequence, so a row is the same every run. */
function stepping(values = [0.5]) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Every item the tool made, so the batch can take them back out. */
function keep(result) {
  for (const item of result.items ?? []) made.push(item);
  return result;
}

/**
 * What the LIST holds against what the STATE holds, once the render has
 * stopped moving. The wait is on exactly the number the caller then asserts
 * (CLAUDE.md §15: an `until` that waits on one field and asserts another is a
 * race), and it returns both sides rather than throwing, so a mismatch fails
 * as an assertion with its numbers instead of as a timeout.
 */
async function drawnRows(generator, ms = 4000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const want = generator.state.rows.length;
    const drawn = generator.element.querySelectorAll("li[data-index]").length;
    if (drawn === want || Date.now() > deadline) return { want, drawn };
    await settle();
  }
}

export function lootBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The loot generator (D-666)", function () {
    after(async function () {
      this.timeout(90000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-loot")) await app.close().catch(() => {});
      }
      await cleanup();
      const folder = game.folders.find(f => f.type === "Item" && f.name === game.i18n.localize("AZEROTH.Loot.Folder"));
      if (folder) await folder.delete().catch(() => {});
    });

    const generatorOf = (values = [0.5, 0.2, 0.8, 0.35, 0.65, 0.05, 0.95, 0.45]) =>
      new (game.system.azeroth.loot)({ random: stepping(values) });
    const folderNamed = () => game.folders.find(f => f.type === "Item" && f.name === game.i18n.localize("AZEROTH.Loot.Folder"));

    it("rolls a dungeon at tier 2 and creates every accepted find in Generated Items, with the purse reported and never made", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      const before = game.items.size;
      const result = keep(await generator.apply({ scenario: "dungeon", tier: 2 }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.isAbove(result.items.length, 0, "nothing was created");
      assert.equal(game.items.size, before + result.items.length);
      const folder = folderNamed();
      assert.ok(folder, "the Generated Items folder was not made");
      for (const item of result.items) {
        assert.equal(item.folder?.id, folder.id, `${item.name} is not in the folder`);
        const stamp = item.getFlag("azeroth-rpg", "loot");
        assert.ok(stamp, `${item.name} carries no loot flag`);
        assert.equal(stamp.scenario, "dungeon");
        assert.equal(stamp.tier, 2);
        assert.notEqual(item.system.rarity, "legendary", "a Legendary was rolled");
      }
      // 13 §8's purse is a line, never a document.
      assert.equal(result.coin.copper, result.coin.days * 12);
      assert.isString(result.coin.text);
      assert.isEmpty(result.items.filter(i => /purse|coin/i.test(i.name)), "the coin was made as an item");
      assert.equal(game.settings.get("azeroth-rpg", "lootFolder"), folder.id, "the folder was not remembered");

      // Every find keeps the catalogue's own words, and its sheet PRINTS them
      // (the lead, 2026-09-06: a generated item's description read blank).
      const shown = result.items[0];
      const packId = { weapon: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor", gear: "azeroth-rpg.gear" }[shown.type];
      const baseName = shown.getFlag("azeroth-rpg", "generated")?.base?.name ?? shown.name;
      const source = (await game.packs.get(packId).getDocuments()).find(d => d.name === baseName);
      assert.ok(source, `${baseName} is not in the ${shown.type} pack`);
      assert.equal(shown.system.description, source.system.description, "the find lost the catalogue's words");
      const itemSheet = await openSheet(shown);
      try {
        const prose = itemSheet.element.querySelector(".azeroth-item__description .azeroth-item__prose");
        assert.ok(prose, "no description section on a find's sheet");
        const words = source.system.description.replace(/<[^>]+>/g, "").trim().slice(0, 20);
        assert.include(prose.textContent, words, "the find's sheet prints no description");
      } finally {
        await itemSheet.close();
      }

      // The second run reuses the folder rather than making a second one.
      const second = keep(await generatorOf().apply({ scenario: "wilderness", tier: 1 }));
      assert.isTrue(second.ok, JSON.stringify(second.reasons));
      assert.lengthOf(game.folders.filter(f => f.type === "Item" && f.name === game.i18n.localize("AZEROTH.Loot.Folder")), 1);
    });

    it("a Rare find opens in the Forge and re-forges from the base it was made of, without compounding its price", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      const result = keep(await generator.apply({
        scenario: "dungeon", tier: 3,
        table: { weights: { common: 0, uncommon: 0, rare: 1, epic: 0 }, named: 0, count: [1, 1] }
      }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const item = result.items[0];
      assert.equal(item.system.rarity, "rare");
      const generated = item.getFlag("azeroth-rpg", "generated");
      assert.ok(generated?.base?.system, "the base was not stashed whole");
      assert.equal(generated.rarity, "rare");
      assert.ok(generated.suffix, "a Rare carries a suffix (08 §4)");
      // 08 §4's multiplier, where the catalogue states a price at all: an
      // Augment is issued rather than sold and carries none.
      const basePrice = generated.base.system.cost;
      if (basePrice === null) assert.isNull(item.system.cost, "a base with no price forged one");
      else assert.equal(item.system.cost, basePrice * 25, "a Rare is the base at twenty-five times (08 §4)");

      const { AzerothForge } = await import("../applications/forge.mjs");
      assert.isTrue(AzerothForge.forgeable(item), "the find cannot be forged");
      const forge = new AzerothForge({ item });
      const plan = await forge.apply({ rarity: "uncommon", prefixes: [], suffix: generated.suffix, greater: [] });
      assert.isTrue(plan.ok, JSON.stringify(plan.reasons));
      assert.equal(item.system.rarity, "uncommon");
      if (basePrice !== null) assert.equal(item.system.cost, basePrice * 5, "the price compounded on the second forging");
      await forge.close();
    });

    it("a named Epic is 08 §20's own document, copied whole; an unnamed one sends the GM to the Forge", async function () {
      this.timeout(60000);
      const named = keep(await generatorOf().apply({
        scenario: "boss", tier: 4,
        table: { weights: { common: 0, uncommon: 0, rare: 0, epic: 1 }, named: 1, count: [1, 1] }
      }));
      assert.isTrue(named.ok, JSON.stringify(named.reasons));
      const epic = named.items[0];
      assert.equal(epic.system.rarity, "epic");
      assert.isNotEmpty(epic.system.signature ?? "", "a named Epic carries a Signature (08 §20)");
      assert.isNull(epic.getFlag("azeroth-rpg", "generated") ?? null, "a named thing was forged rather than copied");
      const packId = { weapon: "azeroth-rpg.weapons", armor: "azeroth-rpg.armor", gear: "azeroth-rpg.gear" }[epic.type];
      const source = (await game.packs.get(packId).getIndex()).find(e => e.name === epic.name);
      assert.ok(source, `${epic.name} is not in the ${epic.type} pack`);
      assert.notEqual(epic.id, source._id, "the copy kept the pack document's id");

      const unnamed = keep(await generatorOf().apply({
        scenario: "boss", tier: 4,
        table: { weights: { common: 0, uncommon: 0, rare: 0, epic: 1 }, named: 0, count: [1, 1] }
      }));
      assert.isTrue(unnamed.ok, JSON.stringify(unnamed.reasons));
      const forgeMe = unnamed.items[0];
      assert.equal(forgeMe.system.rarity, "epic");
      assert.isAtLeast(forgeMe.system.budget, 4);
      assert.isAtMost(forgeMe.system.budget, 5);
      assert.ok(forgeMe.getFlag("azeroth-rpg", "generated")?.base?.system, "an unnamed Epic keeps no base");
      assert.include(unnamed.notes.map(n => n.code), "unnamedEpic", "no note sends the GM to the Forge");
    });

    it("keeps a locked row through a re-roll, re-rolls one row alone, and leaves an unticked find uncreated", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      await generator.render({ force: true });
      await settle();
      await generator.setState({ scenario: "dungeon", tier: 2, table: { count: [3, 3] } });
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();
      const names = () => generator.state.rows.map(r => r.base.uuid);
      const first = names();
      assert.lengthOf(first, 3);

      // EVERY ROLLED ROW DRAWS, and nothing had asserted it. A screenshot of
      // the window read as though three of four rows had been lost
      // (2026-09-11); measured, the state held 4, the DOM held 4, and
      // `.azeroth-generator-pane` is `overflow-y: auto` at 533px over 985px of
      // content - the rest is SCROLLED, not missing. This is the assertion
      // that says so, so the question cannot be re-opened off an image.
      const drawn = await drawnRows(generator);
      assert.equal(drawn.drawn, drawn.want, "the list drew fewer rows than the state holds");
      assert.equal(drawn.want, 3);
      const pane = generator.element.querySelector(".azeroth-generator-pane");
      assert.isAtLeast(pane.scrollHeight, pane.clientHeight, "the pane is not the scroll container");

      // Keep row 1, roll again: it stays where it was and nothing repeats it.
      generator.element.querySelectorAll('[data-action="lootLockRow"]')[1].click();
      await settle();
      assert.isTrue(generator.state.rows[1].locked);
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();
      assert.equal(generator.state.rows[1].base.uuid, first[1], "the kept row moved");

      // One row again: the others do not move.
      const before = names();
      generator.element.querySelectorAll('[data-action="lootRerollRow"]')[0].click();
      await settle();
      const after = names();
      assert.equal(after[1], before[1], "another row moved with the re-roll");
      assert.equal(after[2], before[2], "another row moved with the re-roll");

      // Untick the first: it is not created.
      const box = generator.element.querySelector('input[name="accept-0"]');
      box.checked = false;
      change(box);
      await settle();
      assert.isFalse(generator.state.rows[0].accepted);
      const result = keep(await generator.apply());
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.lengthOf(result.items, 2, "the unticked find was created");
    });

    it("refuses a find with nothing taken, and creates nothing", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      await generator.render({ force: true });
      await settle();
      await generator.setState({ scenario: "site", tier: 1 });
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();
      for (const box of generator.element.querySelectorAll('input[name^="accept-"]')) {
        box.checked = false;
        change(box);
      }
      await settle();
      const before = game.items.size;
      const result = await generator.apply();
      assert.isFalse(result.ok);
      assert.deepEqual(result.reasons.map(r => r.code), ["noRows"]);
      assert.equal(game.items.size, before, "something was created on a refusal");
      const summary = generator.element.querySelector(".azeroth-forge-reasons")?.textContent ?? "";
      assert.include(summary, game.i18n.localize("AZEROTH.Loot.Reason.noRows"));
      await generator.close();
    });

    it("the Dungeon select carries 14 §14's index, grouped by band, and a pick names the tier", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      await generator.render({ force: true });
      await settle();
      const select = generator.element.querySelector('select[name="dungeon"]');
      assert.ok(select, "no Dungeon select on the Dungeon scenario");
      assert.lengthOf(select.querySelectorAll("option"), 42, "41 dungeons and the blank");
      assert.isAbove(select.querySelectorAll("optgroup").length, 1, "the list is not grouped by band");
      const monastery = [...select.options].find(o => o.textContent.includes("The Scarlet Monastery"));
      assert.ok(monastery, "the Scarlet Monastery is not listed");
      select.value = monastery.value;
      change(select);
      await settle();
      assert.equal(generator.state.tier, 2, "the pick did not name the tier");
      assert.equal(generator.element.querySelector('select[name="tier"]').value, "2");
      // The option and the line say the DUNGEON, never its one Boss (D-703):
      // the loot is the whole dungeon's and the label used to say otherwise.
      assert.equal(monastery.textContent.trim(), "The Scarlet Monastery", "the option still names the Boss");
      assert.notInclude(generator.element.textContent, "High Inquisitor Whitemane",
        "the Dungeon line still names the Boss as though the loot were his");
      assert.include(generator.element.textContent,
        game.i18n.format("AZEROTH.Loot.DungeonLine", { dungeon: "The Scarlet Monastery", band: "5–10", tier: 2 }),
        "the Dungeon line does not name the place, its band and its tier");

      // A row's own kind select redraws that row alone.
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();
      const kindSelect = generator.element.querySelector('select[name="row-kind-0"]');
      const want = kindSelect.value === "combat" ? "noncombat" : "combat";
      kindSelect.value = want;
      change(kindSelect);
      await settle();
      assert.equal(generator.state.rows[0].kind, want, "the row did not take the kind it was given");
      await generator.close();
    });

    it("a Boss names a dungeon too, and a named find drawn there is that dungeon's (D-702)", async function () {
      this.timeout(60000);
      // A draw pinned at 0.99 always takes the LAST row of the named pool, and
      // the pool is the book's own followed by this place's Classic finds - so
      // every row here is a find from the dungeon named, by construction. That
      // is what makes the assertion about the zone a real one rather than a
      // hope about which seed came up.
      const generator = generatorOf([0.99]);
      await generator.render({ force: true });
      await settle();

      // L2: a Boss stands in a dungeon (D-528), so the select is offered there.
      await generator.setState({ scenario: "boss", tier: 4 });
      const select = generator.element.querySelector('select[name="dungeon"]');
      assert.ok(select, "a Boss scenario offers no Dungeon select");
      const option = [...select.options].find(o => o.textContent.includes("Naxxramas"));
      assert.ok(option, "Naxxramas is not listed");
      select.value = option.value;
      change(select);
      await settle();
      assert.equal(generator.state.dungeon?.dungeon, "Naxxramas", "the pick did not name the dungeon");

      // The window says what the place holds, rather than drawing in silence.
      assert.include(generator.element.textContent,
        game.i18n.format("AZEROTH.Loot.FoundHere", { n: 436, dungeon: "Naxxramas" }),
        "the window does not say what the dungeon holds");

      const result = keep(await generator.apply({
        scenario: "dungeon", tier: 4,
        table: { weights: { common: 0, uncommon: 0, rare: 0, epic: 1 }, named: 1, combat: 1, count: [3, 3] }
      }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.lengthOf(result.items, 3);
      for (const item of result.items) {
        assert.equal(item.system.source.document, "Classic", `${item.name} is not a Classic find`);
        assert.equal(item.system.source.section, "Classic · Naxxramas", `${item.name} came from somewhere else`);
        assert.equal(item.system.rarity, "epic");
        assert.equal(item.getFlag("azeroth-rpg", "loot")?.dungeon, "Naxxramas");
      }

      // And a dungeon 14 §14 names that the record never dropped anything in
      // says so, rather than leaving the GM wondering.
      const bare = generatorOf([0.99]);
      await bare.render({ force: true });
      await settle();
      const other = bare.element.querySelector('select[name="dungeon"]');
      const kara = [...other.options].find(o => o.textContent.includes("Karazhan"));
      assert.ok(kara, "Karazhan is not listed");
      other.value = kara.value;
      change(other);
      await settle();
      assert.include(bare.element.textContent,
        game.i18n.format("AZEROTH.Loot.FoundNone", { dungeon: "Karazhan" }),
        "a dungeon with no Classic loot says nothing about it");
      await bare.close();
    });

    it("a Boss scenario names ONE boss, and the rows created are that boss's (D-703)", async function () {
      this.timeout(60000);
      // Pinned at 0.99 the draw always takes the LAST row of the named pool,
      // and the pool is the book's own followed by this place's finds - so
      // every row is a find of whatever place is named, by construction.
      const generator = generatorOf([0.99]);
      await generator.render({ force: true });
      await settle();

      // A dungeon scenario names no boss: no second select at all.
      await generator.setState({ scenario: "dungeon", tier: 4 });
      assert.isNull(generator.element.querySelector('select[name="boss"]'),
        "a Dungeon scenario offers a Boss select");

      await generator.setState({ scenario: "boss", tier: 4 });
      const select = generator.element.querySelector('select[name="dungeon"]');
      const option = [...select.options].find(o => o.textContent.trim() === "Naxxramas");
      assert.ok(option, "Naxxramas is not listed by its own name");
      select.value = option.value;
      change(select);
      await settle();

      const bossSelect = generator.element.querySelector('select[name="boss"]');
      assert.ok(bossSelect, "a Boss scenario with a dungeon offers no Boss select");
      assert.isUndefined(bossSelect.dataset.action, "the Boss select carries a data-action");
      assert.equal(bossSelect.dataset.loot, "boss", "the Boss select carries no data-loot hook");
      assert.equal(bossSelect.options[0].textContent.trim(),
        game.i18n.format("AZEROTH.Loot.AnyBoss", { dungeon: "Naxxramas" }), "the first row is not Any boss");
      assert.lengthOf(bossSelect.options, 15, "Naxxramas' fourteen bosses and the Any row");
      const kt = [...bossSelect.options].find(o => o.value === "Kel'Thuzad");
      assert.ok(kt, "Kel'Thuzad is not among Naxxramas' bosses");
      assert.include(kt.textContent, "36", "the boss is offered without its drop count");

      kt.selected = true;
      bossSelect.value = "Kel'Thuzad";
      change(bossSelect);
      await settle();
      assert.equal(generator.state.boss, "Kel'Thuzad", "the pick did not name the boss");
      assert.include(generator.element.textContent,
        game.i18n.format("AZEROTH.Loot.FoundBoss", { boss: "Kel'Thuzad", n: 36, dungeon: "Naxxramas", total: 436 }),
        "the window does not say what the boss drops of the dungeon's own total");
      // The new control is measured like every other surface (D-608).
      const findings = checkText(generator.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));

      // Leaving the Boss scenario drops the boss rather than scoping a hidden
      // select (the bug `#dungeonName()` was written to prevent). Checked HERE
      // rather than at the end: `apply` closes the window, and `element` is
      // null on a closed AppV2.
      await generator.setState({ scenario: "dungeon" });
      assert.isNull(generator.state.boss, "the boss survived the scenario change");
      assert.isNull(generator.element.querySelector('select[name="boss"]'),
        "the Boss select outlived the Boss scenario");
      await generator.setState({ scenario: "boss", boss: "Kel'Thuzad" });
      assert.equal(generator.state.boss, "Kel'Thuzad", "the boss did not come back with the scenario");

      const result = keep(await generator.apply({
        scenario: "boss", tier: 4, boss: "Kel'Thuzad",
        table: { weights: { common: 0, uncommon: 0, rare: 0, epic: 1 }, named: 1, combat: 1, count: [3, 3] }
      }));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      assert.lengthOf(result.items, 3);
      for (const item of result.items) {
        assert.equal(item.system.source.section, "Classic · Naxxramas", `${item.name} came from somewhere else`);
        assert.equal(item.getFlag("azeroth-rpg", "classic")?.boss, "Kel'Thuzad", `${item.name} is not Kel'Thuzad's`);
        assert.equal(item.getFlag("azeroth-rpg", "loot")?.boss, "Kel'Thuzad", `${item.name} does not record the boss`);
        assert.equal(item.getFlag("azeroth-rpg", "loot")?.dungeon, "Naxxramas");
      }

      // THE FOLD: Naxxramas holds no Rare at all, so a Rare draw there takes
      // the place's Epics rather than falling through to the book's twelve -
      // and the row is stamped at the rarity the thing actually is.
      const folded = keep(await generatorOf([0.99]).apply({
        scenario: "boss", tier: 4, dungeon: generator.state.dungeon, boss: "Kel'Thuzad",
        table: { weights: { common: 0, uncommon: 0, rare: 1, epic: 0 }, named: 1, combat: 1, count: [1, 1] }
      }));
      assert.isTrue(folded.ok, JSON.stringify(folded.reasons));
      assert.equal(folded.items[0].system.rarity, "epic", "the Rare draw did not fold onto the place's own shelf");
      assert.equal(folded.items[0].getFlag("azeroth-rpg", "loot")?.rarity, "epic", "the stamp disagrees with the item");
      assert.equal(folded.items[0].getFlag("azeroth-rpg", "classic")?.boss, "Kel'Thuzad");
    });

    it("Browse opens the browser in pick mode; the row's own door takes a Common weapon and refuses a Legendary", async function () {
      this.timeout(60000);
      const generator = generatorOf();
      await generator.render({ force: true });
      await settle();
      await generator.setState({ scenario: "dungeon", tier: 1, table: { count: [2, 2] } });
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();

      generator.element.querySelectorAll('[data-action="lootBrowseRow"]')[0].click();
      await settle();
      const browser = foundry.applications.instances.get("azeroth-compendium-browser");
      assert.ok(browser, "Browse did not open the compendium browser");
      const wanted = game.i18n.format("AZEROTH.Loot.PickItem", {
        rarity: game.i18n.localize(AZEROTH.rarities[generator.state.rows[0].rarity])
      });
      assert.equal(browser.title, wanted, "the browser did not open in pick mode for this row");
      await browser.close();

      // The refusals are at OUR door: the browser's filters cannot say *not
      // that* (D-645), so the receiver is what a test drives.
      const docs = await game.packs.get("azeroth-rpg.weapons").getDocuments();
      const legendary = docs.find(d => d.system.rarity === "legendary");
      const common = docs.find(d => d.name === "Longsword");
      const before = generator.state.rows[0].base.uuid;
      assert.isFalse(await generator.takeItem(0, legendary), "a Legendary was taken as loot");
      assert.equal(generator.state.rows[0].base.uuid, before, "the row moved on a refusal");
      const affix = (await game.packs.get("azeroth-rpg.affixes").getDocuments())[0];
      assert.isFalse(await generator.takeItem(0, affix), "an affix was taken as a thing");
      assert.isTrue(await generator.takeItem(0, common), "a Common weapon was refused");
      assert.equal(generator.state.rows[0].base.uuid, common.uuid);
      assert.isTrue(generator.state.rows[0].locked, "a picked row is not kept");
      await generator.close();
    });

    it("the Item directory carries Roll loot once, and the window renders at the floor with every action wired", async function () {
      this.timeout(90000);
      const { addLootButton, LOOT_BUTTON_CLASS } = await import("../applications/loot-generator-button.mjs");
      const directory = document.createElement("div");
      directory.innerHTML = '<footer class="directory-footer"></footer>';
      assert.isTrue(addLootButton(directory), "no button was added for a GM");
      assert.isFalse(addLootButton(directory), "a second button was stacked");
      assert.lengthOf(directory.querySelectorAll(`.${LOOT_BUTTON_CLASS}`), 1);

      const generator = generatorOf();
      await generator.render({ force: true });
      await settle();
      const frame = generator.element.querySelector(".azeroth-generator-frame");
      assert.ok(frame, "no frame");
      let findings = checkText(generator.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      for (const el of frame.querySelectorAll("[data-action]")) {
        assert.isFunction(generator.options.actions?.[el.dataset.action], `${el.dataset.action} has no handler`);
      }
      // And with finds on the list, where the rarity tints and the notes are.
      generator.element.querySelector('[data-action="lootRoll"]').click();
      await settle();
      findings = checkText(generator.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      assert.include(generator.element.textContent, game.i18n.localize("AZEROTH.Loot.TableNote").slice(0, 24),
        "the window does not say whose odds these are");
      for (const el of frame.querySelectorAll("[data-action]")) {
        assert.isFunction(generator.options.actions?.[el.dataset.action], `${el.dataset.action} has no handler`);
      }
      await generator.close();
    });

    it("the tier's ceiling holds: a tier-1 find is never Rare or Epic, whatever the scenario", async function () {
      this.timeout(60000);
      for (const scenario of Object.keys(AZEROTH.lootScenarios)) {
        const generator = generatorOf([0.99, 0.01, 0.5, 0.75, 0.25]);
        await generator.setState({ scenario, tier: 1 });
        const rolled = generator.state;
        assert.equal(rolled.table.weights.rare, 0, `${scenario}: a tier-1 table offers Rare`);
        assert.equal(rolled.table.weights.epic, 0, `${scenario}: a tier-1 table offers Epic`);
        await generator.close();
      }
    });
  });
}
