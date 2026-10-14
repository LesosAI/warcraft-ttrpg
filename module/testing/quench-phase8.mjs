/**
 * The catalogue and the Forge (D-631 to D-634): the gear pack and 08 §20's
 * named items, a named suit's Body AP on the sheet, the rarity colour at
 * the floor, the Forge window and its refusals, an item that casts, Guard
 * outside a fight and the stepper's glyphs.
 */

import { cleanup, settle, gearTab, gearTile, give, inspect, made, makeCharacter, openSheet, fromPack, PACK_FOR } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { rarityClass } from "../helpers/rarity.mjs";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const change = el => el.dispatchEvent(new Event("change", { bubbles: true }));

export function forgeBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The catalogue and the Forge", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    const until = async (test, ms = 10000) => {
      const start = Date.now();
      while (!test()) {
        if (Date.now() - start > ms) throw new Error("timed out waiting");
        await new Promise(r => setTimeout(r, 50));
      }
      return test();
    };
    const affix = async name => {
      const doc = await fromPack("azeroth-rpg.affixes", name);
      return { id: doc.id, ...(doc.getFlag("azeroth-rpg", "affix") ?? {}) };
    };
    const embed = async (actor, packId, name) => {
      const doc = await fromPack(packId, name);
      const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
      return item;
    };

    // ---- the catalogue (D-632) ---------------------------------------------

    it("the gear pack holds the chapter's catalogue: kits, draughts, mounts, augments and materials", async function () {
      this.timeout(30000);
      const pack = game.packs.get(PACK_FOR.equipment);
      assert.ok(pack, "no gear pack");
      const index = await pack.getIndex({ fields: ["system.cost", "system.traits", "system.rarity", "folder"] });
      assert.isAtLeast(index.size, 440, "08 SS9 to SS17 hold more than this");
      const draught = index.find(e => e.name === "Healing draught");
      assert.ok(draught, "no Healing draught");
      assert.equal(draught.system.cost, 150, "a Healing draught is 1s 50c");
      const goat = index.find(e => e.name === "Riding goat");
      assert.ok(goat, "no Riding goat");
      assert.include(goat.system.traits, "Climber");
      assert.ok(index.find(e => e.name === "Scroll (tier 1)"), "the scroll rows are not named by tier");
      assert.equal(index.find(e => e.name === "Focus (+1)")?.system.cost, 400, "a Mage's Focus at +1 is 4s");
      assert.ok(index.find(e => e.name === "Copper ore"), "SS17's materials are missing");
      assert.ok(pack.folders.find(f => f.name === "Consumables"), "the pack is not foldered by section");
      assert.equal(index.find(e => e.name === "Flask of the Titans")?.system.rarity, "epic", "SS20's consumables are missing");
    });

    it("SS20's named weapons and suits are in the packs at their rarity, with their Signature", async function () {
      this.timeout(30000);
      const ash = await fromPack(PACK_FOR.weapon, "Ashbringer");
      assert.equal(ash.system.rarity, "legendary");
      assert.equal(ash.system.rating, 6);
      assert.include(ash.system.traits, "Keen (Greater)");
      assert.include(ash.system.signature, "undead");
      assert.isNull(ash.system.budget, "a Legendary spends no budget");
      const blade = await fromPack(PACK_FOR.weapon, "Perdition's Blade");
      assert.equal(blade.system.rarity, "epic");
      assert.equal(blade.system.budget, 5);
      const bulwark = await fromPack(PACK_FOR.armor, "The Bulwark of Tyr's Hand");
      assert.equal(bulwark.system.category, "plate");
      assert.equal(bulwark.system.apBonus, 3, "AP 8 over plate's 5");
      assert.equal(bulwark.system.armorPoints.body, 8);
      const shield = await fromPack(PACK_FOR.armor, "Skullflame Shield");
      assert.isTrue(shield.system.shield);
      assert.equal(shield.system.apBonus, 2);
      const storms = await fromPack(PACK_FOR.armor, "The Ten Storms");
      assert.include(storms.getFlag("azeroth-rpg", "grants") ?? [], "+1 Ward in Nature", "a Ward in the Traits cell is a grant");
      assert.notInclude(storms.system.traits, "Ward 1 (Nature)");
    });

    it("a named suit's Body AP reaches the sheet: the Bulwark is 8 on a Warrior", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Forge Bulwark", classes: [["Warrior", 5]] });
      const suit = await embed(actor, PACK_FOR.armor, "The Bulwark of Tyr's Hand");
      await suit.update({ "system.equipped": true });
      assert.equal(actor.system.ap.body, 8);
      assert.equal(actor.system.ap.head, 4, "the margin lands on Body alone");
    });

    // ---- the colour (D-634) ------------------------------------------------

    it("an item's name takes its rarity's colour on the sheets, at the floor", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Forge Colour", classes: [["Warrior", 5]] });
      const ash = await embed(actor, PACK_FOR.weapon, "Ashbringer");
      assert.equal(rarityClass("legendary"), "azeroth-rarity-legendary");
      assert.equal(rarityClass("common"), "");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        // **THE TAB IS TILES AND CARDS** (D-738): the name is on the inspector
        // card, and the tile carries the rarity as a RING round its icon.
        const card = await inspect(sheet, ash.id);
        assert.ok(card, "no card for the sword");
        const name = card.querySelector(".azeroth-bag-inspect-name");
        assert.isTrue(name.classList.contains("azeroth-rarity-legendary"), "the card's name is not coloured");
        assert.ok(gearTile(sheet, ash.id).querySelector(".azeroth-rarity-legendary"),
          "the tile's icon carries no rarity ring");
        assert.deepEqual(checkText(gearTab(sheet)), []);
        sheet.changeTab("combat", "primary");
        await settle();
        const weapon = sheet.element.querySelector(`.azeroth-weapon[data-item-id="${ash.id}"] .azeroth-weapon-name`);
        assert.isTrue(weapon.classList.contains("azeroth-rarity-legendary"), "the Combat row is not coloured");
        assert.deepEqual(checkText(sheet.element.querySelector(".azeroth-weapons")), []);
      } finally {
        await sheet.close();
      }
      const itemSheet = await openSheet(ash);
      try {
        const name = itemSheet.element.querySelector(".azeroth-item__name");
        assert.isTrue(name.classList.contains("azeroth-rarity-legendary"), "the item header is not coloured");
        assert.deepEqual(checkText(itemSheet.element.querySelector(".azeroth-item__header")), []);
      } finally {
        await itemSheet.close();
      }
    });

    // ---- the Forge (D-633) -------------------------------------------------

    it("the Forge makes a Rare Keen Longsword of the Bear from a Common one, and a second forging does not compound", async function () {
      this.timeout(60000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Smith", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      assert.ok(sword, "no Longsword");
      const keen = await affix("Keen");
      const bear = await affix("of the Bear");
      const forge = new AzerothForge({ item: sword });
      const first = await forge.apply({ rarity: "rare", prefixes: [keen.id], suffix: bear.id });
      assert.isTrue(first.ok, first.reasons.join("; "));
      assert.equal(sword.name, "Keen Longsword of the Bear");
      assert.equal(sword.system.rarity, "rare");
      assert.equal(sword.system.budget, 3);
      assert.equal(sword.system.cost, 6000, "2s 40c at twenty-five times");
      assert.include(sword.system.traits, "Keen (Lesser)");
      assert.include(sword.getFlag("azeroth-rpg", "grants"), "+1 Strength");
      assert.equal(sword.getFlag("azeroth-rpg", "generated").base.name, "Longsword", "the base is not stashed");
      const second = await forge.apply({ rarity: "uncommon", prefixes: [], suffix: bear.id });
      assert.isTrue(second.ok, second.reasons.join("; "));
      assert.equal(sword.name, "Longsword of the Bear");
      assert.equal(sword.system.cost, 1200, "the multiplier compounded");
      assert.notInclude(sword.system.traits, "Keen (Lesser)");
      assert.equal(sword.system.budget, 1);
    });

    it("the Forge refuses what the chapter refuses, says why, and leaves the item alone", async function () {
      this.timeout(60000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Refusal", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      const keen = await affix("Keen");
      const bear = await affix("of the Bear");
      const forge = new AzerothForge({ item: sword });
      const p = await forge.apply({ rarity: "uncommon", prefixes: [keen.id], suffix: bear.id });
      assert.isFalse(p.ok);
      assert.match(p.reasons.join(" "), /one affix/);
      assert.equal(sword.name, "Longsword");
      assert.equal(sword.system.rarity, "common");
      const warding = await affix("of Fire Warding");
      const low = await forge.apply({ rarity: "uncommon", prefixes: [], suffix: warding.id });
      assert.isFalse(low.ok);
      assert.match(low.reasons.join(" "), /below rare/);
    });

    it("the Forge window renders at the floor and applies through its form", async function () {
      this.timeout(90000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Window", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = actor.items.find(i => i.name === "Longsword");
      const keen = await affix("Keen");
      const bear = await affix("of the Bear");
      const forge = new AzerothForge({ item: sword });
      await forge.render({ force: true });
      await settle();
      try {
        const content = forge.element.querySelector(".window-content");
        assert.deepEqual(checkText(content), []);
        const select = name => forge.element.querySelector(`select[name="${name}"]`);
        select("rarity").value = "rare";
        change(select("rarity"));
        await until(() => forge.state?.rarity === "rare");
        await settle();
        select("prefix-0").value = keen.id;
        change(select("prefix-0"));
        await until(() => forge.state?.prefixes?.[0] === keen.id);
        await settle();
        select("suffix").value = bear.id;
        change(select("suffix"));
        await until(() => forge.state?.suffix === bear.id);
        await settle();
        assert.include(forge.element.querySelector(".azeroth-forge-summary").textContent, "Keen Longsword of the Bear");
        assert.deepEqual(checkText(forge.element.querySelector(".window-content")), []);
        click(forge.element.querySelector('button[type="submit"]'));
        await until(() => sword.name === "Keen Longsword of the Bear", 15000);
        assert.equal(sword.system.rarity, "rare");
      } finally {
        await forge.close();
      }
    });

    // ---- the Signature box takes free typing (the lead, 2026-09-14) ---------

    /**
     * *Those fields should not require html `<p>` style formatting. It should
     * just be free type and it format itself after submitted.*
     *
     * The box is a plain `<textarea>` at both ends: it loaded `system.signature`
     * verbatim, so a GM opening the Forge on any pack item read tags out of it,
     * and it stored whatever was typed back verbatim, so a plain sentence
     * reached the item without the paragraph every one of 08 §20's entries
     * carries. `rules/prose.mjs` is the NPC generator's own pair, moved out for
     * a second reader.
     */
    const SIGNATURE_HTML = "<p>A Priest holding it may cast <strong>Renew</strong> once per Short Rest without spending Mana.</p>";

    it("the Forge's Signature box shows a stored Signature as PROSE, with no tag in it", async function () {
      this.timeout(60000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Prose In", classes: [["Priest", 5]] });
      const [relic] = await actor.createEmbeddedDocuments("Item", [{
        name: "Chalice of the Dawn", type: "gear",
        system: { cost: 100, rarity: "rare", budget: 0, signature: SIGNATURE_HTML }
      }]);
      const forge = new AzerothForge({ item: relic });
      await forge.render({ force: true });
      await settle();
      try {
        const box = forge.element.querySelector('textarea[name="signatureText"]');
        assert.ok(box, "the Signature box is not drawn on a Rare");
        assert.notInclude(box.value, "<", `the box shows raw HTML: ${box.value}`);
        assert.include(box.value, "**Renew**", "the bold run is not written back as markup");
        assert.include(box.value, "A Priest holding it may cast", "the sentence is not in the box");
        assert.equal(forge.state.signatureText, box.value, "the state and the box disagree");
        // And the preview still reads the sentence, off the HTML Apply will store.
        assert.ok(forge.element.querySelector(".azeroth-forge-preview"), "no preview under the box");
      } finally {
        await forge.close();
      }
    });

    it("a plain sentence typed into the box is stored in the pack's own paragraph and drawn on the item sheet", async function () {
      this.timeout(90000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Prose Out", classes: [["Priest", 5]] });
      const [relic] = await actor.createEmbeddedDocuments("Item", [{
        name: "Vigil Lantern", type: "gear",
        system: { cost: 100, rarity: "rare", budget: 0, signature: SIGNATURE_HTML }
      }]);
      const sentence = "It glows faintly when undead are near.";
      const forge = new AzerothForge({ item: relic });
      await forge.render({ force: true });
      await settle();
      try {
        const box = forge.element.querySelector('textarea[name="signatureText"]');
        assert.ok(box, "the Signature box is not drawn on a Rare");
        box.value = sentence;
        change(box);
        await until(() => forge.state?.signatureText === sentence);
        await settle();
        click(forge.element.querySelector('button[type="submit"]'));
        await until(() => (relic.system.signature ?? "").includes("glows"), 15000);
      } finally {
        await forge.close();
      }
      assert.equal(relic.system.signature, `<p>${sentence}</p>`, "the typed sentence was not wrapped in the paragraph");
      assert.isTrue(relic.system.signature.startsWith("<p>"));
      const itemSheet = await openSheet(relic);
      try {
        const block = itemSheet.element.querySelector(".azeroth-item__signature");
        assert.ok(block, "the item sheet draws no Signature block");
        assert.include(block.textContent, sentence, "the sentence is not on the item sheet");
        assert.notInclude(block.textContent, "<p>", "the sheet prints the tag as text");
      } finally {
        await itemSheet.close();
      }
    });

    // ---- the phrase guide (the lead, 2026-09-14) ---------------------------

    /**
     * *Can we add an explanation on the creator to show what trigger words and
     * phrases are possible?* The reader is a dozen regular expressions over a
     * free-typed sentence and the preview only ever answered after the fact,
     * so the panel is the one place a GM can learn the phrasing.
     *
     * `rules/signature-phrases.test.mjs` holds the reader to every example;
     * what is checked HERE is that the panel a GM opens actually carries them
     * — a table with no reader is the fault this repository keeps finding
     * (D-681), and so is a reader with no panel.
     */
    const openForgeOn = async (actorName, itemName) => {
      const { AzerothForge } = await import("../applications/forge.mjs");
      // No class: the panel and the reader's class gate both come off the
      // CLASSES PACK, never off the bearer, so the thirty-six talents a class
      // brings with it would be a minute spent for nothing.
      const actor = await makeCharacter({ name: actorName });
      const [relic] = await actor.createEmbeddedDocuments("Item", [{
        name: itemName, type: "gear", system: { cost: 100, rarity: "rare", budget: 0 }
      }]);
      const forge = new AzerothForge({ item: relic });
      await forge.render({ force: true });
      await settle();
      return { forge, relic };
    };

    it("the Forge lists every phrasing its reader understands, shut until it is asked for", async function () {
      this.timeout(90000);
      const { SIGNATURE_PHRASES, SIGNATURE_PHRASE_GROUPS } = await import("../rules/signatures.mjs");
      const { forge } = await openForgeOn("ZZ Forge Phrases", "Bench Token");
      try {
        const panel = forge.element.querySelector("details.azeroth-forge-phrases");
        assert.ok(panel, "no phrase guide under the Signature box");
        assert.isFalse(panel.open, "the guide is open before anybody asked for it");
        // NO `data-action` ON IT: a `<details>` toggles itself, and the actions
        // map fires on click alone (D-677's rule for the browser's facets).
        assert.notOk(panel.getAttribute("data-action"), "the guide carries a data-action");
        assert.notOk(panel.querySelector("summary")?.getAttribute("data-action"), "the summary carries a data-action");
        panel.open = true;
        await settle();
        const rows = panel.querySelectorAll(".azeroth-forge-phrases-list dt");
        assert.isAtLeast(rows.length, SIGNATURE_PHRASES.length,
          `the panel draws ${rows.length} phrases and the reader knows ${SIGNATURE_PHRASES.length}`);
        assert.equal(panel.querySelectorAll(".azeroth-forge-phrases-list dd").length, rows.length,
          "a phrase with nothing beside it says what fires and not what it becomes");
        const headings = [...panel.querySelectorAll(".azeroth-forge-phrases-group")].map(el => el.textContent.trim());
        assert.equal(headings.length, SIGNATURE_PHRASE_GROUPS.length, "a group is missing its heading");
        for (const heading of headings) assert.notInclude(heading, "AZEROTH.", `a raw lang key on the panel: ${heading}`);
        // Every example the table names is on the panel, in its own words.
        const drawn = [...rows].map(el => el.textContent.trim());
        for (const { key } of SIGNATURE_PHRASES) {
          const example = game.i18n.localize("AZEROTH.Forge.Phrases.Example." + key);
          assert.include(drawn, example, `${key} is not drawn on the panel`);
        }
        // OPEN, it is measurable: a closed `<details>` is skipped by `painted`
        // (D-679), so this check means nothing until the panel is open.
        assert.deepEqual(checkText(panel), []);
        assert.deepEqual(checkText(forge.element.querySelector(".window-content")), []);
        // AND IT SURVIVES THE NEXT RENDER. Every `[data-forge]` control
        // re-renders the whole window, so a guide opened to copy a phrasing out
        // of would shut itself the moment the box beside it was typed in.
        const rarity = forge.element.querySelector('select[name="rarity"]');
        rarity.value = "epic";
        change(rarity);
        await until(() => forge.state?.rarity === "epic");
        await settle();
        // RE-QUERY: the render replaced the element this test was holding.
        assert.isTrue(forge.element.querySelector("details.azeroth-forge-phrases")?.open,
          "the guide shut itself when the window re-rendered");
      } finally {
        await forge.close();
      }
    });

    it("a phrase taken off the panel and typed into the box is read by the preview", async function () {
      this.timeout(90000);
      const { forge } = await openForgeOn("ZZ Forge Phrase Read", "Bench Token II");
      try {
        const box = forge.element.querySelector('textarea[name="signatureText"]');
        assert.ok(box, "the Signature box is not drawn on a Rare");
        // TWO WHOSE SUMMARY LINE IS NOT THE PHRASE BACK AGAIN: *inflicts a
        // Critical Injury on a natural 19 as well as a 20* reads out as *A
        // Critical Injury on a natural 19*, and *may spend 4 Rage as a
        // Reaction* as *Pressing it spends 4 Rage*. A row whose two halves
        // share their words would pass on an echo.
        for (const [key, expected] of [
          ["criticalRange", game.i18n.format("AZEROTH.Signature.Summary.CriticalOn", { n: 19 })],
          ["poolCost", game.i18n.format("AZEROTH.Signature.Summary.UseCost", {
            n: 4, pool: game.i18n.localize("AZEROTH.Pool.Rage")
          })]
        ]) {
          const example = game.i18n.localize("AZEROTH.Forge.Phrases.Example." + key);
          // RE-QUERY: the control is replaced by every render (AppV2).
          const field = forge.element.querySelector('textarea[name="signatureText"]');
          field.value = example;
          change(field);
          await until(() => forge.state?.signatureText === example);
          await settle();
          const preview = forge.element.querySelector(".azeroth-forge-preview");
          assert.ok(preview, `no preview for "${example}"`);
          assert.include(preview.textContent.replace(/\s+/g, " "), expected,
            `the panel offers "${example}" and the preview does not say ${expected}`);
        }
      } finally {
        await forge.close();
      }
    });

    it("an Epic carries a Signature and a spell the bearer casts at the item's DC for no Mana, once per Short Rest", async function () {
      this.timeout(90000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const { castItemSpell } = await import("../applications/actions.mjs");
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const actor = await makeCharacter({ name: "ZZ Forge Wand", classes: [["Shaman", 5]] });
      const [wand] = await actor.createEmbeddedDocuments("Item", [{ name: "Wand", type: "gear", system: { cost: 100, rarity: "common", budget: 0 } }]);
      const gronn = await affix("of the Gronn");
      const wave = await fromPack(PACK_FOR.spell, "Healing Wave");
      const forge = new AzerothForge({ item: wand });
      const p = await forge.apply({
        rarity: "epic", prefixes: [], suffix: gronn.id, name: "Wand of Renewal",
        signatureKind: "gated", signatureText: "<p>A Shaman holding it hears the tide.</p>",
        spells: [{ uuid: wave.uuid, name: wave.name, tier: 1, dc: 14, max: 1, per: "short" }]
      });
      assert.isTrue(p.ok, p.reasons.join("; "));
      assert.equal(p.spent, 5, "2 for the suffix, 1 for the gated Signature, 2 for the casting");
      assert.equal(wand.name, "Wand of Renewal");
      assert.deepEqual(wand.system.spells[0].uses, { value: 1, max: 1, per: "short" });
      assert.include(wand.system.signature, "tide");

      const mana = actor.system.powers.find(p => p.name === "mana");
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const before = game.messages.size;
      const message = await castItemSpell(actor, wand, 0);
      assert.ok(message, "no card");
      made.push(message);
      const flags = message.getFlag("azeroth-rpg", "viaItem");
      assert.equal(flags?.dc, 14, "the item's DC did not ride the cast");
      assert.include(message.content, "Wand of Renewal", "the card does not say where the spell came from");
      assert.equal(actor.system.powers.find(p => p.name === "mana").value, mana.max, "the item's casting cost Mana");
      assert.equal(wand.system.spells[0].uses.value, 0, "the use was not struck");
      const refused = await castItemSpell(actor, wand, 0);
      assert.isNull(refused, "a spent item cast again");
      assert.equal(game.messages.size, before + 1);
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await actor.shortRest({ food: await give(actor, "Rations, one day") });
      assert.equal(wand.system.spells[0].uses.value, 1, "a Short Rest did not restore the item's casting");
    });

    it("an item's spell shows under From items on the Spells tab and on the item sheet", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Forge Tab", classes: [["Shaman", 5]] });
      const wave = await fromPack(PACK_FOR.spell, "Healing Wave");
      const [wand] = await actor.createEmbeddedDocuments("Item", [{
        name: "Wand of Renewal", type: "gear",
        system: { rarity: "epic", budget: 4, spells: [{ uuid: wave.uuid, name: wave.name, dc: 14, uses: { value: 1, max: 1, per: "short" } }] }
      }]);
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        const row = sheet.element.querySelector(`.azeroth-item-spells li[data-item-id="${wand.id}"]`);
        assert.ok(row, "no From items row");
        assert.include(row.textContent, "Healing Wave");
        assert.ok(row.querySelector('[data-action="castItemSpell"]'), "no Cast on the row");
        assert.deepEqual(checkText(sheet.element.querySelector(".azeroth-item-spells")), []);
      } finally {
        await sheet.close();
      }
      const itemSheet = await openSheet(wand);
      try {
        const row = itemSheet.element.querySelector(".azeroth-item-spell");
        assert.ok(row, "the item sheet lists no spell");
        assert.include(row.textContent, "DC 14");
        assert.deepEqual(checkText(itemSheet.element.querySelector(".azeroth-item__spells")), []);
      } finally {
        await itemSheet.close();
      }
    });

    // ---- every menu in 02 asks (D-635) --------------------------------------

    const pick = async (actor, item, name) => {
      const pending = game.system.azeroth.workflows.useFeature({ actor, item });
      const app = await until(() => {
        const a = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
        return a?.rendered ? a : null;
      }, 10000);
      const select = app.element.querySelector("select[name=choice]");
      const option = [...select.options].find(o => o.textContent.trim().startsWith(name));
      assert.ok(option, `${name} is not on the chooser`);
      select.value = option.value;
      app.element.querySelector('button[data-action="choose"]').click();
      return pending;
    };

    it("the Totem chooser lists all seven, greys what a level 1 Shaman has not reached, and Searing links its block", async function () {
      this.timeout(60000);
      const { featureChoices } = await import("../dice/workflows.mjs");
      const actor = await makeCharacter({ name: "ZZ Menu Shaman", classes: [["Shaman", 1]] });
      await until(() => actor.items.find(i => i.type === "feature" && i.name === "Totem"));
      const options = await featureChoices(actor, actor.items.find(i => i.type === "feature" && i.name === "Totem"));
      assert.lengthOf(options, 7);
      assert.deepEqual(options.filter(o => o.available !== false).map(o => o.name), ["Stoneskin", "Searing"]);
      const windfury = options.find(o => o.name === "Windfury");
      assert.isFalse(windfury.available);
      assert.include(windfury.tag, "5");
      assert.ok(options.find(o => o.name === "Searing").uuid, "Searing does not link its block in 14");
    });

    it("Bound Demon lists the six demons with those above the level greyed, and Metamorphosis the three greater", async function () {
      this.timeout(60000);
      const { featureChoices } = await import("../dice/workflows.mjs");
      const feature = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name);
      const young = await makeCharacter({ name: "ZZ Menu Warlock", classes: [["Warlock", 5]] });
      await until(() => feature(young, "Bound Demon"));
      const options = await featureChoices(young, feature(young, "Bound Demon"));
      // The menu is 02 SS7's TABLE plus the GM's own demons (D-650), so the
      // table is what this asserts. Written as an exact list over the whole
      // menu, it passed only in an empty world: the lead's own world grew a
      // loose Infernal, a Prince Malchezaar and two released demons, and the
      // test failed on correct behaviour (2026-09-08).
      const table = options.filter(o => !o.world);
      assert.deepEqual(table.map(o => o.name), ["Imp", "Voidwalker", "Succubus", "Felhunter", "Infernal", "Doomguard"]);
      assert.deepEqual(table.filter(o => o.available !== false).map(o => o.name), ["Imp", "Voidwalker"]);
      assert.ok(table.every(o => o.uuid), "a demon does not link its block in 14");
      assert.ok(options.filter(o => o.world).every(o => o.uuid && o.tag),
        "a demon the GM already owns is listed without a block or a tag");
      const old = await makeCharacter({ name: "ZZ Menu Warlock Old", classes: [["Warlock", 17]] });
      await until(() => feature(old, "Metamorphosis"));
      const greater = await featureChoices(old, feature(old, "Metamorphosis"));
      assert.deepEqual(greater.map(o => o.name), ["Felhunter", "Infernal", "Doomguard"]);
      assert.isTrue(greater.every(o => o.available !== false));
      const bound = await featureChoices(old, feature(old, "Bound Demon"));
      assert.lengthOf(bound.filter(o => o.available !== false && !o.world), 6, "a level 17 Warlock binds any of the six");
    });

    it("Companion offers 14's Beasts, a pick binds a world actor, and a second is refused at capacity (D-643)", async function () {
      this.timeout(90000);
      const { featureChoices } = await import("../dice/workflows.mjs");
      const actor = await makeCharacter({ name: "ZZ Menu Ranger", classes: [["Ranger", 5]] });
      await until(() => actor.items.find(i => i.type === "feature" && i.name === "Companion"));
      const companion = actor.items.find(i => i.type === "feature" && i.name === "Companion");
      const options = await featureChoices(actor, companion);
      assert.isAbove(options.length, 10, "14 holds more Beasts than this");
      assert.isTrue(options.every(o => o.uuid), "a beast does not link its block in 14");
      const open = options.filter(o => o.available !== false);
      assert.isAbove(open.length, 1, "no beast with a Handling DC to bind");
      assert.isTrue(options.filter(o => o.available === false).every(o => o.tag === game.i18n.localize("AZEROTH.Bound.NoHandling")), "a greyed beast is not greyed for its Handling DC");
      const [first, second] = open;
      const card = await pick(actor, companion, first.name);
      assert.ok(card, "no card for the bond");
      made.push(card);
      const bound = game.system.azeroth.bound.boundOf(actor, "companion");
      assert.lengthOf(bound, 1, "the pick made no bound actor");
      made.push(bound[0]);
      assert.equal(bound[0].name, first.name);
      assert.deepEqual(companion.system.known.map(k => k.uuid), [bound[0].uuid], "the feature does not know the actor it bound");
      assert.isNull(await pick(actor, companion, second.name), "a second bond was allowed at capacity one");
      assert.lengthOf(game.system.azeroth.bound.boundOf(actor, "companion"), 1);
      assert.equal((await featureChoices(actor, companion)).find(o => o.name === first.name).tag, game.i18n.localize("AZEROTH.Feature.Bonded"), "the held beast is not tagged Bonded on the menu");
    });

    it("War Cry offers its two cries with the level's numbers, and a school feature the seven schools", async function () {
      this.timeout(60000);
      const { featureChoices } = await import("../dice/workflows.mjs");
      const feature = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name);
      const warrior = await makeCharacter({ name: "ZZ Menu Warrior", classes: [["Warrior", 14]] });
      await until(() => feature(warrior, "War Cry"));
      const cries = await featureChoices(warrior, feature(warrior, "War Cry"));
      assert.deepEqual(cries.map(o => o.name), ["Rallying Cry", "Battle Shout"]);
      assert.include(cries[0].description, "14");
      assert.include(cries[1].description, "4");
      const priest = await makeCharacter({ name: "ZZ Menu Priest", classes: [["Priest", 1]] });
      await until(() => feature(priest, "Ward"));
      const schools = await featureChoices(priest, feature(priest, "Ward"));
      assert.lengthOf(schools, Object.keys(CONFIG.AZEROTH.schools).length);
    });

    it("Avatar of the Wild offers the Avatar first and every Elite Beast; Poisoner offers the poisons carried and says so when none", async function () {
      this.timeout(60000);
      const { featureChoices, featureMenu } = await import("../dice/workflows.mjs");
      const feature = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name);
      const druid = await makeCharacter({ name: "ZZ Menu Druid", classes: [["Druid", 20]] });
      await until(() => feature(druid, "Avatar of the Wild"));
      const forms = await featureChoices(druid, feature(druid, "Avatar of the Wild"));
      assert.equal(forms[0]?.name, "Avatar");
      assert.isTrue(forms.slice(1).every(o => o.weightClass === "elite"));
      const rogue = await makeCharacter({ name: "ZZ Menu Rogue", classes: [["Rogue", 14]] });
      await until(() => feature(rogue, "Poisoner"));
      const empty = await featureMenu(rogue, feature(rogue, "Poisoner"));
      assert.lengthOf(empty.options, 0);
      assert.ok(empty.note, "no note says a poison must be carried");
      const poison = await fromPack(PACK_FOR.equipment, "Crippling poison");
      await rogue.createEmbeddedDocuments("Item", [poison.toObject()]);
      const some = await featureChoices(rogue, feature(rogue, "Poisoner"));
      assert.deepEqual(some.map(o => o.name), ["Crippling poison"]);
    });

    // ---- the buttons (D-631) -----------------------------------------------

    it("Guard works outside a fight: the state lands, the Momentum goes, the card posts", async function () {
      this.timeout(30000);
      const { guard } = await import("../applications/combat-actions.mjs");
      const actor = await makeCharacter({ name: "ZZ Forge Guard", classes: [["Warrior", 5]] });
      const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 5 });
      const before = game.messages.size;
      const result = await guard(actor);
      assert.isTrue(result, "Guard refused outside a fight");
      assert.isTrue(actor.statuses.has("guarded"));
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 0);
      assert.equal(game.messages.size, before + 1);
      made.push(game.messages.contents.at(-1));
    });

    it("the uses stepper draws as a glyph, not a boxed button", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Forge Stepper", classes: [["Warrior", 5]] });
      await until(() => actor.items.find(i => i.type === "feature" && i.system?.uses?.per));
      const sheet = await openSheet(actor);
      try {
        const step = sheet.element.querySelector('.azeroth-features [data-action="stepUses"]') ?? sheet.element.querySelector('[data-action="stepUses"]');
        assert.ok(step, "no stepper on Core");
        const style = getComputedStyle(step);
        assert.equal(style.borderStyle, "none", `the stepper draws a ${style.borderStyle} border`);
        assert.deepEqual(checkText(step.closest("li") ?? step.parentElement), []);
      } finally {
        await sheet.close();
      }
    });
  });
}
