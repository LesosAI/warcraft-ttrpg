/**
 * The feedback batch: what the lead found by using the system after the
 * Phase 0-6 build, as uses. The dialog's labels and checkboxes; links in
 * every prose field; the conditions strip; the browser's meta and empty
 * line; the keyboard on the attribute rail. Later phases append the item
 * sheet, the affix drop, the floating Health text and the row detail.
 */

import { cleanup, settle, untilHook, dialogFor, firstFromPack, made, makeCharacter, makeNpc, openSheet, pinDie, useAction, cardOf, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { AzerothCompendiumBrowser } from "../applications/compendium-browser.mjs";
import { checkText } from "./geometry.mjs";
import { composite, contrast, parseColour, toHex } from "./colour.mjs";
import { checkNoRawKeys } from "./expectations.mjs";
import { AZEROTH } from "../config.mjs";
import { coins } from "../helpers/coins.mjs";
import { forgeDrop, fromPack, gearInspector, gearTab, gearTile, give, itemOf } from "./fixtures.mjs";
import { affixOf } from "../applications/affix-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { canGoOn, nameFor, priceFor } from "../rules/affixes.mjs";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const RULES_LINK = 'a.content-link[data-uuid^="Compendium.azeroth-rpg.rules.JournalEntry."]';

/**
 * The ink an element is drawn in against the ground it is drawn on: its own
 * background composited down its ancestors onto the first opaque one, which
 * is `checkText`'s own walk. **A LINK NEEDS THIS AND `checkText` CANNOT GIVE
 * IT**: the label shares its element with the icon, so it is never a leaf and
 * no ceiling in the suite has ever measured one (O-150). On the dark character
 * sheet the parchment's link stood at 1.23:1 and every `checkText` passed.
 */
function inkOnGround(el) {
  const ink = parseColour(getComputedStyle(el).color);
  const layers = [];
  let ground = null;
  for (let node = el; node; node = node.parentElement) {
    const bg = parseColour(getComputedStyle(node).backgroundColor);
    if (bg && bg[3] >= 0.999) { ground = bg.slice(0, 3); break; }
    if (bg && bg[3] > 0) layers.push(bg);
  }
  if (!ink || !ground) return { ratio: 0, ink: String(ink), ground: String(ground) };
  // Innermost first as walked; the outermost wash lies on the opaque ground.
  for (const layer of layers.reverse()) ground = composite(layer, ground);
  const seen = composite(ink, ground);
  return { ratio: contrast(seen, ground), ink: toHex(seen), ground: toHex(ground) };
}

/** `inkOnGround`'s answer as an assertion message. */
const said = (where, m) => `${where}: ${m.ink} on ${m.ground} at ${m.ratio.toFixed(2)}:1`;

async function openBrowser(category, filters = {}) {
  const app = await AzerothCompendiumBrowser.browse({ category, filters });
  for (let i = 0; i < 100 && !app._dataLoaded; i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return app;
}

export function feedbackBatch(context) {
  const { describe, it, assert, after, before } = context;

  describe("The feedback pass", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    // ---- screenshot 1: the roll dialog ---------------------------------------------
    it("the dialog's lines read Effects and Situational, and each checkbox sits square on its line", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Feedback Dialog", classes: [["Warrior", 5]] });
      await actor.update({ "system.fatigue": 3 });
      const sheet = await openSheet(actor);
      try {
        click(useAction(sheet, "rollSkill").el);
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "the roll dialog did not open");
        const legends = [...dialog.element.querySelectorAll("fieldset legend")].map(l => l.textContent.trim());
        assert.deepEqual(legends, [game.i18n.localize("AZEROTH.Dialog.Automatic"), game.i18n.localize("AZEROTH.Dialog.Judgement")]);
        assert.equal(legends[0], "Effects");
        assert.equal(legends[1], "Situational");
        const line = dialog.element.querySelector(".azeroth-dialog-line");
        const box = line.querySelector('input[type="checkbox"]');
        const r = box.getBoundingClientRect();
        const l = line.getBoundingClientRect();
        assert.isAtMost(Math.abs(r.width - r.height), 1, `the checkbox box is not square: ${r.width}x${r.height}`);
        assert.isAtMost(Math.abs((r.top + r.height / 2) - (l.top + l.height / 2)), 2, "the checkbox is not centred on its line");
        assert.equal(getComputedStyle(box).borderTopStyle, "none", "the sheet paints its own border on core's checkbox");
        const fieldset = dialog.element.querySelector("fieldset.azeroth-dialog-lines");
        assert.isAtMost(parseFloat(getComputedStyle(fieldset).rowGap) || 0, 4, "core's 16px fieldset gap is still between the lines");
        await dialog.close();
      } finally {
        await sheet.close();
      }
    });

    // ---- screenshot 3: links in every prose field ---------------------------------------
    it("a Plagued Ghoul's Grave Plague links the rules journal on the Traits tab", async function () {
      this.timeout(30000);
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      try {
        sheet.changeTab("traits", "primary");
        await new Promise(r => setTimeout(r, 300));
        const panel = sheet.element.querySelector('section[data-tab="traits"]');
        const link = panel.querySelector(`.azeroth-abilities ${RULES_LINK}`);
        assert.ok(link, `the ability's @UUID did not become a content link: ${panel.querySelector(".azeroth-abilities")?.innerHTML.slice(0, 300)}`);
        assert.include(link.textContent, "10-CORRUPTION");
        assert.notInclude(panel.textContent, "@UUID[", "raw @UUID text is still on the page");
        assert.deepEqual(checkText(panel), [], "the enriched link fails the legibility floor");
        // `checkText` never reaches the link's own label (O-150), so the pair is
        // measured here - and THE PARCHMENT KEEPS ITS LINK: the dark sheet's
        // re-ink stops at the character's root.
        const parchment = inkOnGround(link);
        assert.isAtLeast(parchment.ratio, 4.5, said("the creature's link", parchment));
        const inkToken = parseColour(getComputedStyle(sheet.element).getPropertyValue("--azeroth-ink").trim())?.slice(0, 3);
        assert.deepEqual(parseColour(getComputedStyle(link).color)?.slice(0, 3).map(Math.round), inkToken,
          "the creature's link took the dark sheet's ink");
      } finally {
        await sheet.close();
      }
    });

    it("the spell card's Effect line and the talent card's Effect are enriched", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Feedback Caster", classes: [["Priest", 5]], spells: ["Cure Blight"] });
      const spell = actor.items.find(i => i.type === "spell");
      assert.ok(spell, "Cure Blight is not in the pack");
      const pool = actor.system.powers.find(p => p.name === "mana");
      if (pool) await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const card = await cardOf("spell", actor, { spell });
      const el = card?.element ?? card;
      assert.ok(el?.querySelector, "no spell card rendered");
      assert.ok(el.querySelector(`.azeroth-card-effect ${RULES_LINK}`), "the spell's Effect did not enrich its link");
      assert.notInclude(el.textContent, "@UUID[");
      assert.deepEqual(checkText(el), []);

      const lock = await makeCharacter({ name: "ZZ Feedback Warlock", classes: [["Warlock", 5]], talents: ["Felguard"] });
      assert.ok(lock.items.find(i => i.type === "talent"), "Felguard is not in the pack");
      const sheet = await openSheet(lock);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        // The class brings all three branches (D-610); open the one Felguard is in.
        const felguard = lock.items.find(i => i.type === "talent" && i.name === "Felguard");
        const button = sheet.element.querySelector(`[data-action="openBranch"][data-branch="Warlock/${felguard.system.branch}"]`);
        assert.ok(button, "Felguard's branch is not listed");
        click(button);
        await new Promise(r => setTimeout(r, 400));
        const effect = sheet.element.querySelector(`.azeroth-talent-effect ${RULES_LINK}`);
        assert.ok(effect, "the talent card's Effect did not enrich its link");
        assert.notInclude(sheet.element.querySelector('section[data-tab="progress"]').textContent, "@UUID[");
        // The card's link is the dark sheet's own now, not a rule of the card's.
        const card = inkOnGround(effect);
        assert.isAtLeast(card.ratio, 4.5, said("the talent card's link", card));
      } finally {
        await sheet.close();
      }
    });

    // THE DARK SHEET'S LINK, outside the talent card (D-749's window). The
    // parchment's link - dark ink on an 18% bronze wash - stood on every dark
    // tab at 1.23:1 and passed every ceiling, because a link holds its icon and
    // `checkText` never reaches the label (O-150). 02's level-1 Pummel names
    // 06-COMBAT, so a Warrior's Combat tab carries a real one.
    it("a content link on the character's dark Combat tab is light ink on its own plate", async function () {
      this.timeout(40000);
      const warrior = await makeCharacter({ name: "ZZ Feedback Link Warrior", classes: [["Warrior", 1]] });
      const feature = () => warrior.items.find(i => i.type === "feature" && i.name === "Pummel") ?? null;
      for (let i = 0; i < 200 && !feature(); i++) await new Promise(r => setTimeout(r, 50));
      assert.ok(feature(), "the level-1 Warrior holds no Pummel");
      const sheet = await openSheet(warrior);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const row = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${feature().id}"]`);
        assert.ok(row, "Pummel has no row on the Combat tab");
        click(row.querySelector('[data-action="expandItem"]'));
        await settle();
        const link = row.querySelector(`.azeroth-feature-effect ${RULES_LINK}`);
        assert.ok(link, `Pummel's text did not enrich its link: ${row.querySelector(".azeroth-feature-effect")?.innerHTML.slice(0, 200)}`);
        assert.isNull(link.closest("[hidden]"), "Pummel's text did not open");
        assert.include(link.textContent, "06-COMBAT");
        const label = inkOnGround(link);
        assert.isAtLeast(label.ratio, 4.5, said("the Combat tab's link", label));
        // The icon is a glyph and takes the ornament floor.
        const icon = link.querySelector("i");
        assert.ok(icon, "the link drew no icon");
        const glyph = inkOnGround(icon);
        assert.isAtLeast(glyph.ratio, 3, said("the Combat tab's link icon", glyph));
      } finally {
        await sheet.close();
      }
    });

    // ---- screenshot 4: the conditions strip -----------------------------------------------
    it("a valued condition's stepper sits inside its bubble, and + on Poisoned lights the chip", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Feedback Strip", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        const li = sheet.element.querySelector(".azeroth-condition.is-valued");
        assert.ok(li, "no valued condition chip");
        const box = li.getBoundingClientRect();
        for (const b of li.querySelectorAll('[data-action="stepCondition"]')) {
          const r = b.getBoundingClientRect();
          assert.ok(r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
            "a stepper button sits outside its condition's bubble");
          assert.ok(b.getAttribute("aria-label"), "a stepper button has no accessible name");
        }
        assert.notEqual(getComputedStyle(li).borderTopWidth, "0px", "the bubble has no border of its own");
        const toggle = li.querySelector(".azeroth-condition-toggle");
        assert.equal(getComputedStyle(toggle).backgroundColor, "rgba(0, 0, 0, 0)", "the toggle still paints its own ground");
        const ul = sheet.element.querySelector(".azeroth-conditions");
        assert.isAtLeast(parseFloat(getComputedStyle(ul).columnGap) || 0, 6, "the chips run together");
        assert.deepEqual(checkText(ul), []);

        const plus = sheet.element.querySelector('[data-action="stepCondition"][data-condition="poisoned"][data-delta="1"]');
        const wait = untilHook("createActiveEffect", 5000, e => e.parent?.id === actor.id);
        click(plus);
        await wait;
        await settle();
        const lit = sheet.element.querySelector('.azeroth-condition[data-condition="poisoned"]');
        assert.ok(lit?.classList.contains("is-active"), "Poisoned did not light its chip");
        assert.isFalse(lit.querySelector('[data-delta="-1"]').disabled, "the minus stays disabled on an active chip");
      } finally {
        await sheet.close();
      }
    });

    // ---- the audit's cheap tier -------------------------------------------------------------
    it("the browser says when nothing matches, and a spell row shows its tier", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const row = app.element.querySelector('[data-category="spells"] li[data-uuid] .azeroth-browser-meta');
        assert.ok(row, "spell rows carry no meta run");
        assert.match(row.textContent, /T[1-5]/, "the meta does not show the tier");
        const input = app.element.querySelector("input[type=search]");
        input.value = "zzqxv";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        const empty = app.element.querySelector('[data-category="spells"] .azeroth-browser-empty');
        assert.ok(empty && !empty.hidden, "no empty line when nothing matches");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        assert.isTrue(empty.hidden, "the empty line stays once rows are back");
        assert.deepEqual(checkText(app.element.querySelector('[data-category="spells"]')), []);
      } finally {
        await app.close();
      }
    });

    it("Enter on an attribute plate rolls it, and the plate is focusable", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Feedback Plate", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        const plate = sheet.element.querySelector('.azeroth-plate[data-action="rollAbility"]');
        assert.equal(plate.getAttribute("tabindex"), "0", "the plate is not focusable");
        assert.equal(plate.getAttribute("role"), "button");
        plate.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "Enter on the plate did not open the roll dialog");
        await dialog.close();
      } finally {
        await sheet.close();
      }
    });

    it("weapon rows show range and traits, gear is grouped by kind, and the NPC says when it has no attacks", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Feedback Rows", classes: [["Warrior", 5]], weapons: ["Amani hatchet"], gear: [(await firstFromPack(PACK_FOR.gear, () => true)).name] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        // The list opens on a header row (D-649); the first item row carries the id.
        const row = sheet.element.querySelector(".azeroth-weapon[data-item-id]");
        assert.ok(row.querySelector(".azeroth-weapon-range"), "no range on the weapon row");
        assert.ok(row.querySelector(".azeroth-weapon-traits"), "no traits on the weapon row");
        sheet.changeTab("gear", "primary");
        await settle();
        // The tab is BAG PANELS now (D-738), not a list grouped by kind: what
        // is worn or held, then the base pack, then a panel for every bag on
        // the bar. Each is headed with its own name.
        const headings = [...sheet.element.querySelectorAll(".azeroth-bag-panel-name")].map(h => h.textContent.trim());
        assert.include(headings, game.i18n.localize("AZEROTH.Bags.Equipped"), `no Worn panel: ${headings.join(" | ")}`);
        assert.include(headings, game.i18n.localize("AZEROTH.Bags.Carried"), `no Carried panel: ${headings.join(" | ")}`);
        assert.deepEqual(checkNoRawKeys(sheet.element.querySelector('section[data-tab="gear"]')), []);
      } finally {
        await sheet.close();
      }
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.attacks": [] });
      const ns = await openSheet(npc);
      try {
        assert.include(ns.element.querySelector(".azeroth-attacks").textContent, game.i18n.localize("AZEROTH.Sheet.NoAttacks"));
      } finally {
        await ns.close();
      }
    });
    // ---- screenshot 5: the item sheet edits again --------------------------------------------
    it("an owned suit's category, cost and traits are editable, and a select change reaches the document", async function () {
      this.timeout(40000);
      const owner = await makeCharacter({ name: "ZZ Feedback Owner", classes: [["Warrior", 5]] });
      let item = null;
      try { item = await itemOf("armor", { owned: owner, name: "Silk-lined coat" }); } catch { item = await itemOf("armor", { owned: owner }); }
      const sheet = await openSheet(item);
      try {
        assert.isTrue(sheet.isEditable, "the owner's item sheet is not editable");
        const select = sheet.element.querySelector('select[name="system.category"]');
        assert.ok(select, "Category is not a select on an editable sheet");
        // A price is coin, not copper (08 §2, D-672): a text box carrying the
        // mixed form, typed the same way and stored as copper.
        const cost = sheet.element.querySelector('input[name="system.cost"][data-coin]');
        assert.ok(cost, "Cost is not a coin input");
        assert.equal(cost.value, coins(item.system.cost), "the Cost box does not carry the price in coin");
        assert.ok(sheet.element.querySelector('.azeroth-item__tags[data-path="system.traits"] ~ .azeroth-item__tag-add input'), "Traits cannot be added");
        const other = [...select.options].find(o => o.value && o.value !== select.value);
        const wait = untilHook("updateItem", 5000, i => i.id === item.id);
        select.value = other.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(item.system.category, other.value, "the category select did not write");
      } finally {
        await sheet.close();
      }
    });

    it("a tag adds on Enter and on +, refuses a duplicate, and removes on its ×", async function () {
      this.timeout(40000);
      const owner = await makeCharacter({ name: "ZZ Feedback Tagger", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const item = owner.items.find(i => i.type === "weapon");
      const sheet = await openSheet(item);
      try {
        const before = [...(item.system.traits ?? [])];
        const input = sheet.element.querySelector('input.azeroth-item__tag-input[data-path="system.traits"]');
        assert.ok(input, "no tag input for traits");
        input.value = "Quench Tag";
        let wait = untilHook("updateItem", 5000, i => i.id === item.id);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await wait;
        assert.deepEqual(item.system.traits, [...before, "Quench Tag"], "Enter did not add the tag");

        await settle();
        const again = sheet.element.querySelector('input.azeroth-item__tag-input[data-path="system.traits"]');
        again.value = "quench tag";
        click(sheet.element.querySelector('[data-action="addTag"][data-path="system.traits"]'));
        await new Promise(r => setTimeout(r, 400));
        assert.equal(item.system.traits.length, before.length + 1, "a duplicate tag was added");

        const remove = sheet.element.querySelector('[data-action="removeTag"][data-tag="Quench Tag"]');
        assert.ok(remove, "the new tag has no remove button");
        wait = untilHook("updateItem", 5000, i => i.id === item.id);
        click(remove);
        await wait;
        assert.deepEqual(item.system.traits, before, "× did not remove the tag");
      } finally {
        await sheet.close();
      }
    });

    // ---- an affix or a trait dropped on the item sheet ------------------------------------------
    it("a prefix then a suffix dropped on a weapon apply in place, without compounding, and a second prefix is refused", async function () {
      this.timeout(60000);
      const owner = await makeCharacter({ name: "ZZ Feedback Smith", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const item = owner.items.find(i => i.type === "weapon");
      const base = { name: item.name, type: item.type, system: item.system.toObject() };
      const docs = await game.packs.get("azeroth-rpg.affixes").getDocuments();
      const legal = docs.filter(d => { const a = affixOf(d); return (a.kind === "prefix" || a.kind === "suffix") && canGoOn(a, base) && !a.minimumRarity; });
      const prefixDoc = legal.find(d => affixOf(d).kind === "prefix");
      const suffixDoc = legal.find(d => affixOf(d).kind === "suffix");
      const prefix2 = legal.find(d => affixOf(d).kind === "prefix" && d.id !== prefixDoc?.id);
      assert.ok(prefixDoc && suffixDoc, "no legal prefix and suffix for the hatchet in the pack");
      const sheet = await openSheet(item);
      try {
        let created = false;
        const spy = Hooks.on("createItem", () => { created = true; });
        let wait = untilHook("updateItem", 5000, i => i.id === item.id);
        forgeDrop(sheet.element, { type: "Item", uuid: prefixDoc.uuid });
        await wait;
        Hooks.off("createItem", spy);
        assert.notOk(created, "the drop created an item instead of applying in place");
        assert.equal(item.name, nameFor({ base, prefix: affixOf(prefixDoc) }), "the prefix did not rename the item");
        assert.equal(item.getFlag("azeroth-rpg", "generated")?.prefix, prefixDoc.id);

        await settle();
        wait = untilHook("updateItem", 5000, i => i.id === item.id);
        forgeDrop(sheet.element, { type: "Item", uuid: suffixDoc.uuid });
        await wait;
        const both = nameFor({ base, prefix: affixOf(prefixDoc), suffix: affixOf(suffixDoc) });
        assert.equal(item.name, both, "the suffix did not join the prefix");
        const gen = item.getFlag("azeroth-rpg", "generated");
        assert.ok(gen.base, "the un-affixed base was not stashed");
        const expectedCost = priceFor({ base: gen.base, rarity: item.system.rarity });
        assert.equal(item.system.cost, expectedCost, "the cost compounded across two applications");

        if (prefix2) {
          let updated = false;
          const spy2 = Hooks.on("updateItem", i => { if (i.id === item.id) updated = true; });
          forgeDrop(sheet.element, { type: "Item", uuid: prefix2.uuid });
          await new Promise(r => setTimeout(r, 600));
          Hooks.off("updateItem", spy2);
          assert.notOk(updated, "a second prefix was applied over the first");
          assert.equal(item.name, both);
        }
      } finally {
        await sheet.close();
      }
    });

    it("a trait dropped on a suit appends its name once", async function () {
      this.timeout(40000);
      const owner = await makeCharacter({ name: "ZZ Feedback Armourer", classes: [["Warrior", 5]] });
      const item = await itemOf("armor", { owned: owner });
      const trait = (await game.packs.get("azeroth-rpg.traits").getDocuments())[0];
      assert.ok(trait, "the traits pack is empty");
      const sheet = await openSheet(item);
      try {
        const before = [...(item.system.traits ?? [])].filter(t => t !== trait.name);
        await item.update({ "system.traits": before });
        const wait = untilHook("updateItem", 5000, i => i.id === item.id);
        forgeDrop(sheet.element, { type: "Item", uuid: trait.uuid });
        await wait;
        assert.deepEqual(item.system.traits, [...before, trait.name], "the trait was not appended");
        forgeDrop(sheet.element, { type: "Item", uuid: trait.uuid });
        await new Promise(r => setTimeout(r, 500));
        assert.equal(item.system.traits.filter(t => t === trait.name).length, 1, "the trait was appended twice");
      } finally {
        await sheet.close();
      }
    });
    // ---- screenshot 2: the Health change floats off the token -------------------------------------
    it("damage sinks red and healing rises green over the token, from any door", async function () {
      this.timeout(60000);
      if (!canvas?.ready) this.skip();
      const previous = canvas.scene;
      const scene = await Scene.create({ name: "ZZ Feedback Scene", width: 1000, height: 1000, grid: { size: 100 } });
      made.push(scene);
      await scene.view();
      const actor = await makeCharacter({ name: "ZZ Feedback Wounded", classes: [["Warrior", 5]] });
      await actor.update({ "prototypeToken.actorLink": true });
      await scene.createEmbeddedDocuments("Token", [(await actor.getTokenDocument({ x: 200, y: 200 })).toObject()]);
      for (let i = 0; i < 60 && !actor.getActiveTokens(true).length; i++) await new Promise(r => setTimeout(r, 100));
      assert.isAtLeast(actor.getActiveTokens(true).length, 1, "the linked token never drew");
      // **DRAWN IS NOT VISIBLE, AND `_showHealthChange` SKIPS AN INVISIBLE
      // TOKEN** (`actor.mjs`, and core's own `_displayScrollingStatus` does
      // the same). A newly viewed scene hands back the token before vision
      // has settled, so the first one or two changes drew nothing at all and
      // this test failed at whichever assertion the delay happened to reach
      // (2026-09-12). Wait for the thing the assertions depend on.
      for (let i = 0; i < 100 && !actor.getActiveTokens(true)[0]?.visible; i++) await new Promise(r => setTimeout(r, 100));
      assert.isTrue(actor.getActiveTokens(true)[0]?.visible === true, "the token never became visible");
      const real = canvas.interface.createScrollingText;
      const calls = [];
      // **CORE DRAWS OVER THE SAME TOKEN.** `ActiveEffect#_displayScrollingStatus`
      // writes `+(Fatigued)` through this very method when a status lands, so
      // a bare call count reads core's text as ours, and the Fatigue step
      // below failed for drawing exactly what core is supposed to draw
      // (2026-09-12). Ours is a sign and digits; anything else is core's.
      const others = [];
      canvas.interface.createScrollingText = (origin, text, opts) => {
        (/^[+−]\d+$/.test(String(text)) ? calls : others).push({ text, opts });
        return Promise.resolve();
      };
      try {
        await actor.update({ "system.health.value": actor.system.health.max });
        calls.length = 0;
        await actor.applyDamage(3);
        await settle();
        assert.equal(calls.length, 1, "damage drew no floating text");
        assert.equal(calls[0].text, "\u22123");
        assert.equal(calls[0].opts.fill, AZEROTH.HEALTH_TEXT.damage, "damage is not red");
        assert.equal(calls[0].opts.direction, CONST.TEXT_ANCHOR_POINTS.BOTTOM, "damage does not sink");

        calls.length = 0;
        await actor.applyHealing(2);
        await settle();
        assert.equal(calls.length, 1, "healing drew no floating text");
        assert.equal(calls[0].text, "+2");
        assert.equal(calls[0].opts.fill, AZEROTH.HEALTH_TEXT.heal, "healing is not green");
        assert.equal(calls[0].opts.direction, CONST.TEXT_ANCHOR_POINTS.TOP, "healing does not rise");

        calls.length = 0;
        await actor.applyHealing(999);
        assert.equal(actor.system.health.value, actor.system.health.max, "healing went above the maximum");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].text, "+1");

        calls.length = 0;
        others.length = 0;
        await actor.update({ "system.fatigue": 1 });
        await settle();
        assert.equal(calls.length, 0, `a Fatigue change drew Health text: ${calls.map(c => c.text).join(", ")}`);
        // And core's own status text DID land, which is what says the stub is
        // still wired and the token is still visible.
        assert.deepEqual(others.map(c => c.text), ["+(Fatigued)"], "core did not draw the status it applied");

        // The banner's input is a door too.
        const sheet = await openSheet(actor);
        try {
          const input = sheet.element.querySelector('input[name="system.health.value"]');
          const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
          input.value = String(actor.system.health.value - 2);
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await wait;
          await settle();
          assert.equal(calls.length, 1, "the sheet's Health input drew no floating text");
          assert.equal(calls[0].text, "\u22122");
        } finally {
          await sheet.close();
        }
      } finally {
        canvas.interface.createScrollingText = real;
        if (previous && previous.id !== scene.id) await previous.view();
      }
    });

    // ---- bag tiles: the card beside the panels, and the pen -----------------------------------------
    //
    // **The Gear tab's rows became tiles and hidden cards** (D-738), so the
    // inline detail this test was written for is the inspector now. One for
    // one: a click opens the card, the pick survives a re-render, and the pen
    // on the card opens the item's own sheet.
    it("a tile's click opens its card, which survives a re-render, and the pen opens the sheet", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Feedback Rows", classes: [["Warrior", 5]], weapons: ["Amani hatchet"], armor: [(await firstFromPack(PACK_FOR.armor, d => !d.system.shield)).name] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const tile = gearTab(sheet).querySelector(".azeroth-bag-tile[data-item-id]");
        assert.ok(tile, "the tab draws no bag tile");
        assert.equal(tile.getAttribute("role"), "option", "a tile is not an option of its listbox");
        const id = tile.dataset.itemId;
        const card = gearInspector(sheet, id);
        assert.ok(card?.hidden, "the card is open before any click");

        // **A CLICK NEVER RE-RENDERS**: every card is already in the DOM and
        // the click only unhides one, which is what lets a double-click work
        // and a control queried off the card stay live.
        click(tile);
        await settle();
        assert.isFalse(card.hidden, "clicking the tile did not open its card");
        assert.equal(tile.getAttribute("aria-selected"), "true");
        const labels = [...card.querySelectorAll("dt")].map(d => d.textContent.trim());
        assert.include(labels, game.i18n.localize("AZEROTH.Item.Cost"), `no Cost on the card: ${labels.join(", ")}`);
        assert.deepEqual(checkNoRawKeys(card), []);
        assert.deepEqual(checkText(card), [], "the card fails the legibility floor");
        assert.notInclude(card.textContent, "[object Object]");

        await sheet.render();
        await settle();
        assert.isFalse(gearInspector(sheet, id).hidden, "the pick did not survive a re-render");
        // A SECOND CLICK STILL SELECTS: a toggle would make a double-click's
        // first half undo the pick its second half acts on.
        click(gearTile(sheet, id));
        await settle();
        assert.isFalse(gearInspector(sheet, id).hidden, "a second click closed the card");

        const pen = gearInspector(sheet, id).querySelector('[data-action="openItem"]');
        assert.ok(pen, "no pen to open the sheet");
        click(pen);
        await new Promise(r => setTimeout(r, 400));
        const item = actor.items.get(id);
        assert.ok(item.sheet.rendered, "the pen did not open the item sheet");
        await item.sheet.close();
      } finally {
        await sheet.close();
      }
    });

    it("right-click on a weapon row offers Edit, Attack, Equip and Delete, and Equip equips", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Feedback Menu", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const row = sheet.element.querySelector(".azeroth-weapon[data-item-id]");
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 }));
        await new Promise(r2 => setTimeout(r2, 400));
        const menu = document.querySelector("#context-menu");
        assert.ok(menu, "no context menu opened on a weapon row");
        const items = [...menu.querySelectorAll(".context-item")];
        const texts = items.map(i => i.textContent.trim());
        for (const key of ["AZEROTH.Sheet.Edit", "AZEROTH.Sheet.Attack", "AZEROTH.Sheet.Equip", "AZEROTH.Sheet.Delete"]) {
          assert.include(texts, game.i18n.localize(key), `the menu lacks ${key}: ${texts.join(" | ")}`);
        }
        assert.notInclude(texts, game.i18n.localize("AZEROTH.Sheet.Cast"), "Cast is offered on a weapon");
        // *Save to hotbar* (the lead, 2026-09-13). The drag is the other door
        // and `quench-phase0.mjs` presses that one; this is the menu entry,
        // which is not a sheet action and so is invisible to the audit.
        assert.include(texts, game.i18n.localize("AZEROTH.Macro.SaveToHotbar"),
          `the menu offers no way to put a weapon on the hotbar: ${texts.join(" | ")}`);
        const equip = items.find(i => i.textContent.trim() === game.i18n.localize("AZEROTH.Sheet.Equip"));
        const wait = untilHook("updateItem", 5000, i => i.parent?.id === actor.id);
        equip.click();
        await wait;
        assert.isTrue(actor.items.get(row.dataset.itemId).system.equipped, "Equip from the menu did not equip");
      } finally {
        document.querySelector("#context-menu")?.remove();
        await sheet.close();
      }
    });

    // ---- the class pass (D-610) -------------------------------------------

    const talentsOf = actor => actor.items.filter(t => t.type === "talent");
    const until = async (test, ms = 10000) => {
      for (let i = 0; i < ms / 100 && !test(); i++) await new Promise(r => setTimeout(r, 100));
    };

    it("a class dropped on the sheet opens its three branches in the class's order, and deleting it takes them back", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Class Drop Branches" });
      const sheet = await openSheet(actor);
      try {
        const cls = await fromPack(PACK_FOR.class, "Warrior");
        const wait = untilHook("createItem", 5000, i => i.parent?.id === actor.id && i.type === "class");
        forgeDrop(sheet.element, { type: "Item", uuid: cls.uuid });
        const [item] = await wait;
        await until(() => talentsOf(actor).length >= 36);
        assert.lengthOf(talentsOf(actor), 36, "the class did not bring its thirty-six talents");
        sheet.changeTab("progress", "primary");
        await sheet.render({ force: true });
        await settle();
        const names = [...sheet.element.querySelectorAll(".azeroth-branch-name")].map(e => e.textContent.trim());
        assert.deepEqual(names, ["Arms", "Fury", "Bulwark"], "not the class's three branches in its order");
        assert.notInclude(sheet.element.textContent, game.i18n.localize("AZEROTH.Talent.NoBranches"),
          "the sheet still says to add a class");
        await item.delete();
        await until(() => talentsOf(actor).length === 0);
        assert.lengthOf(talentsOf(actor), 0, "the class left and its talents stayed behind");
      } finally {
        await sheet.close();
      }
    });

    it("the level is set on the Progress tab, the banner reads it, and Health, tier, Proficiency and the talent points follow", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Level Up", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const input = sheet.element.querySelector('section[data-tab="progress"] select.azeroth-level-select');
        assert.ok(input, "no level select on the Progress tab of a character holding a class");
        assert.notOk(sheet.element.querySelector(".azeroth-banner input.azeroth-level-input, .azeroth-banner select"),
          "the banner offers a level control; it only reads the level (D-611)");
        assert.lengthOf(input.querySelectorAll("option"), 20);
        assert.include(sheet.element.querySelector(".azeroth-identity-line").textContent, "Warrior",
          "the class is not named on the banner");
        const healthBefore = actor.system.health.max;
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        input.value = "9";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        await settle();
        assert.equal(actor.system.classes[0].level, 9, "the level did not reach the class array");
        assert.equal(actor.system.level, 9);
        assert.equal(actor.system.tier, 2);
        assert.equal(actor.system.proficiency, 3);
        assert.isAbove(actor.system.health.max, healthBefore, "Health did not grow with the level");
        await sheet.render({ force: true });
        await settle();
        assert.equal(sheet.element.querySelector(".azeroth-talent-points strong").textContent.trim(), "9",
          "one talent point a level (02 §9)");
        assert.equal(sheet.element.querySelector("select.azeroth-level-select").value, "9");
        assert.include(sheet.element.querySelector(".azeroth-level").textContent, "9", "the banner did not read the level");
      } finally {
        await sheet.close();
      }
    });

    it("a second class is stored at the level it functions at when the character levels (02 §10)", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Level Two-Class", classes: [["Mage", 9], ["Rogue", 5]] });
      await actor.setLevel(11);
      assert.deepEqual(actor.system.classes.map(c => c.level), [11, 10]);
      await actor.setLevel(3);
      assert.deepEqual(actor.system.classes.map(c => c.level), [3, 3]);
      assert.equal(actor.system.level, 3);
      const empty = await makeCharacter({ name: "ZZ Level No Class" });
      await empty.setLevel(5);
      assert.equal(empty.system.level, 1, "a level with no class to carry it");
      const sheet = await openSheet(empty);
      try {
        assert.notOk(sheet.element.querySelector("select.azeroth-level-select"), "a classless sheet offers a level control");
      } finally {
        await sheet.close();
      }
    });

    it("an attribute score is edited on its plate, the modifier follows, and a click into it does not roll", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Score Edit", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        // Nameless since 2026-09-06: the box shows the score as worn and its change handler writes the base.
        const input = sheet.element.querySelector('input.azeroth-score[data-ability-score="str"]');
        assert.ok(input, "the Strength plate has no score input");
        const plate = input.closest(".azeroth-plate");
        const r = input.getBoundingClientRect();
        const p = plate.getBoundingClientRect();
        assert.isTrue(r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1,
          "the score input sits outside its plate");
        const messages = game.messages.size;
        const apps = foundry.applications.instances.size;
        click(input);
        await new Promise(res => setTimeout(res, 600));
        assert.equal(game.messages.size, messages, "a click into the score rolled");
        assert.equal(foundry.applications.instances.size, apps, "a click into the score opened a dialog");
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        input.value = "16";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        await settle();
        assert.equal(actor.system.abilities.str.value, 16, "the score did not reach the document");
        assert.equal(actor.system.abilities.str.mod, 3);
        assert.equal(sheet.element.querySelector('.azeroth-plate[data-ability="str"] ~ .azeroth-chip-mod').textContent.trim(), "+3",
          "the modifier chip did not follow");
      } finally {
        await sheet.close();
      }
    });

    it("an NPC's score edits on its plate too, and an absent slot stays a dash", async function () {
      this.timeout(40000);
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      try {
        const inputs = sheet.element.querySelectorAll("input.azeroth-score");
        const absent = sheet.element.querySelectorAll(".azeroth-plate.is-absent");
        assert.equal(inputs.length + absent.length, 6, "every plate is an input or an absent dash");
        assert.isAbove(inputs.length, 0);
        for (const a of absent) assert.notOk(a.querySelector("input"), "an absent slot draws an input");
        const input = inputs[0];
        // Nameless since 2026-09-06: the key rides on data-ability-score.
        const key = input.dataset.abilityScore;
        const wait = untilHook("updateActor", 5000, a => a.id === npc.id);
        input.value = "12";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(npc.system.abilities[key].value, 12, "the NPC's score did not reach the document");
      } finally {
        await sheet.close();
      }
    });

    it("the Progress tab names each class, its features by level and what is ahead; a classless sheet says so", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Class Features", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        const entry = sheet.element.querySelector(".azeroth-class-entry");
        assert.ok(entry, "no class entry on the Progress tab");
        assert.include(entry.querySelector(".azeroth-class-name").textContent, "Warrior");
        const levels = [...entry.querySelectorAll(".azeroth-feature-level")].map(e => e.textContent.trim());
        assert.isAbove(levels.length, 0, "no level-1 feature listed");
        assert.isTrue(levels.every(l => /\b1$/.test(l)), `a feature above level 1 is listed: ${levels.join(" | ")}`);
        assert.notInclude(entry.textContent, "@UUID", "a feature's link printed raw");
        assert.ok(entry.querySelector(".azeroth-class-next"), "nothing ahead is named at level 1");
        const before = levels.length;
        await actor.setLevel(5);
        await sheet.render({ force: true });
        await settle();
        const after = sheet.element.querySelectorAll(".azeroth-class-entry .azeroth-feature-level").length;
        assert.isAbove(after, before, "level 5 unlocked nothing");
        assert.equal(checkText(sheet.element.querySelector("section[data-tab='progress']")).length, 0,
          "the class list breaks the legibility floor");
      } finally {
        await sheet.close();
      }
      const empty = await makeCharacter({ name: "ZZ Class None" });
      const bare = await openSheet(empty);
      try {
        assert.ok(bare.element.querySelector(".azeroth-class-entry--empty"), "a classless sheet does not say so");
      } finally {
        await bare.close();
      }
    });

    // ---- the design pass (D-611) ------------------------------------------

    it("the class sheet lists its branches and features as rows, its chips are one height, and a nullable choice writes null", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Class Sheet Rows", classes: [["Shaman", 1]] });
      const item = actor.items.find(i => i.type === "class");
      const sheet = await openSheet(item);
      try {
        const tables = [...sheet.element.querySelectorAll(".azeroth-item__table")];
        assert.isAtLeast(tables.length, 2, "branches and features tables");
        const rows = tables.map(t => t.querySelectorAll("tbody tr").length);
        assert.equal(rows[0], 3, "three branch rows (the row loop read ../field and drew none)");
        assert.isAbove(rows[1], 0, "feature rows");
        assert.notInclude(sheet.element.textContent, "@UUID[", "a feature's link printed raw");
        assert.include(tables[0].textContent, "Elemental");

        const chips = [...sheet.element.querySelectorAll(".azeroth-item__tag:not(.azeroth-item__tag--none)")];
        assert.isAbove(chips.length, 3);
        const heights = new Set(chips.map(c => Math.round(c.getBoundingClientRect().height)));
        assert.equal(heights.size, 1, `chips of different heights: ${[...heights].join(", ")}`);
        const add = sheet.element.querySelector(".azeroth-item__tag-add input");
        assert.equal(Math.round(add.getBoundingClientRect().height), [...heights][0], "the add input is not chip height");

        const select = sheet.element.querySelector('select[name="system.momentum.name"]');
        assert.ok(select, "Momentum is not a select");
        assert.ok(select.dataset.nullable, "a nullable choice carries no dash");
        assert.equal(select.options[0].value, "", "the dash is not the first option");
        assert.equal(select.value, "", "a Shaman's Momentum should read as the dash");
        let wait = untilHook("updateItem", 5000, i => i.id === item.id);
        select.value = "rage";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(item.system.momentum.name, "rage");
        await settle();
        const again = sheet.element.querySelector('select[name="system.momentum.name"]');
        wait = untilHook("updateItem", 5000, i => i.id === item.id);
        again.value = "";
        again.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.isNull(item.system.momentum.name, "the dash did not write back as null");
      } finally {
        await sheet.close();
      }
    });

    it("no label on the sheets casts core's text shadow, and a branch card holds its count", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ No Shadow", classes: [["Shaman", 1]] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        const shadowed = [...sheet.element.querySelectorAll("dt, dd, label, summary")]
          .filter(el => getComputedStyle(el).textShadow !== "none");
        assert.lengthOf(shadowed, 0, `text with a shadow: ${shadowed.slice(0, 5).map(e => e.className || e.tagName).join(", ")}`);
        for (const button of sheet.element.querySelectorAll(".azeroth-branch button")) {
          const b = button.getBoundingClientRect();
          for (const child of button.children) {
            const c = child.getBoundingClientRect();
            assert.isTrue(c.top >= b.top - 1 && c.bottom <= b.bottom + 1 && c.right <= b.right + 1,
              `${child.className} sits outside its branch card`);
          }
        }
        assert.ok(sheet.element.querySelector("select.azeroth-level-select"), "the level control is not on Progress");
      } finally {
        await sheet.close();
      }
    });

    // ---- class features and favorites (D-612) -----------------------------

    const featuresOf = actor => actor.items.filter(i => i.type === "feature");
    const featureNamed = (actor, name) => featuresOf(actor).find(i => i.name === name) ?? null;
    const untilSync = actor => actor._featureSync ?? Promise.resolve();

    it("a class grants its features at its level, the level moves them, and the class takes them away", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Features Warrior", classes: [["Warrior", 1]] });
      await until(() => featuresOf(actor).length >= 4);
      assert.deepEqual(featuresOf(actor).map(f => f.name).sort(), ["Charge", "Pummel", "Second Wind", "Shieldbearer"],
        "the level-1 Warrior features");
      const wind = featureNamed(actor, "Second Wind");
      assert.equal(wind.system.kind, "action");
      assert.equal(wind.system.action, "half");
      assert.deepEqual({ pool: wind.system.cost.pool, amount: wind.system.cost.amount }, { pool: "rage", amount: 6 });
      assert.equal(wind.system.heal, "tier");
      assert.isFalse(actor.hasExtraAttack, "Extra Attack at level 1");

      await actor.setLevel(5);
      await untilSync(actor);
      await until(() => featureNamed(actor, "Extra Attack"));
      assert.ok(featureNamed(actor, "Extra Attack"), "level 5 did not grant Extra Attack");
      assert.isTrue(actor.hasExtraAttack, "the feature does not report Extra Attack");
      assert.isTrue(featureNamed(actor, "Extra Attack").system.extraAttack);

      await actor.setLevel(1);
      await untilSync(actor);
      await until(() => !featureNamed(actor, "Extra Attack"));
      assert.notOk(featureNamed(actor, "Extra Attack"), "a level down left Extra Attack behind");
      assert.lengthOf(featuresOf(actor), 4);

      // Idempotent: a second sync changes nothing.
      const before = featuresOf(actor).map(f => f.id).sort();
      await actor.syncClassFeatures();
      assert.deepEqual(featuresOf(actor).map(f => f.id).sort(), before, "a second sync recreated features");

      const cls = actor.items.find(i => i.type === "class");
      await cls.delete();
      await until(() => featuresOf(actor).length === 0);
      assert.lengthOf(featuresOf(actor), 0, "the class left and its features stayed");
    });

    it("using a feature spends its pool, posts a card with the heal, strikes a use, and a rest restores it", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Features Use", classes: [["Warrior", 3]] });
      await until(() => featuresOf(actor).length >= 4);
      const wind = featureNamed(actor, "Second Wind");
      const rage = actor.poolSnapshot().find(p => p.kind === "momentum");
      assert.ok(rage, "no Rage pool");
      // Nothing to spend: refused, no card.
      const messages = game.messages.size;
      assert.isNull(await game.system.azeroth.workflows.useFeature({ actor, item: wind }));
      assert.equal(game.messages.size, messages, "a refused use posted a card");
      await actor.updatePool({ itemId: rage.itemId, kind: "momentum", value: 8 });
      const card = await game.system.azeroth.workflows.useFeature({ actor, item: wind });
      made.push(card);
      assert.ok(card, "no card");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "momentum").value, 2, "6 Rage were not spent");
      assert.equal(card.flags["azeroth-rpg"].heal, actor.system.tier, "the heal is the tier");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.ok(el.querySelector('[data-action="applyHealing"]'), "no Apply healing button");
      assert.include(el.textContent, "Second Wind");
      assert.notInclude(el.textContent, "@UUID[");

      // The heal lands on the speaker when nothing is targeted or controlled.
      await actor.update({ "system.health.value": 1 });
      const button = el.querySelector('[data-action="applyHealing"]');
      await CARD_ACTIONS.applyHealing(button, card);
      assert.equal(actor.system.health.value, 1 + actor.system.tier, "the heal did not land on the speaker");

      // A limited feature: War Cry is level 14; Unbroken (11) is once per encounter.
      await actor.setLevel(11);
      await untilSync(actor);
      await until(() => featureNamed(actor, "Unbroken"));
      const unbroken = featureNamed(actor, "Unbroken");
      assert.deepEqual({ value: unbroken.system.uses.value, max: unbroken.system.uses.max, per: unbroken.system.uses.per },
        { value: 1, max: 1, per: "encounter" });
      const used = await game.system.azeroth.workflows.useFeature({ actor, item: unbroken });
      made.push(used);
      assert.equal(featureNamed(actor, "Unbroken").system.uses.value, 0, "a use was not struck");
      assert.isFalse(featureNamed(actor, "Unbroken").system.available);
      assert.isNull(await game.system.azeroth.workflows.useFeature({ actor, item: featureNamed(actor, "Unbroken") }), "a spent feature was used");
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await actor.shortRest({ food: await give(actor, "Rations, one day") });
      assert.equal(featureNamed(actor, "Unbroken").system.uses.value, 1, "a Short Rest did not restore a per-encounter use");

      // Core draws them: Use on an action, none on a passive, the chips.
      const sheet = await openSheet(actor);
      try {
        const rows = [...sheet.element.querySelectorAll(".azeroth-feature[data-item-id]")];
        assert.isAtLeast(rows.length, 6);
        const windRow = rows.find(r => r.dataset.itemId === wind.id);
        assert.ok(windRow.querySelector('[data-action="useFeature"]'), "no Use on Second Wind");
        const charge = rows.find(r => r.dataset.itemId === featureNamed(actor, "Charge").id);
        assert.notOk(charge.querySelector('[data-action="useFeature"]'), "Use on a passive");
        assert.include(windRow.textContent, "Rage");
        assert.deepEqual(checkText(sheet.element.querySelector("section[data-tab='core']")), []);
      } finally {
        await sheet.close();
      }
    });

    it("a Casting feature goes through the dialog and its card carries the Test and the damage", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Features Shaman", classes: [["Shaman", 9]] });
      await until(() => featureNamed(actor, "Forked Lightning"));
      const bolt = featureNamed(actor, "Forked Lightning");
      assert.isTrue(bolt.system.casting);
      assert.deepEqual({ amount: bolt.system.damage.amount, type: bolt.system.damage.type }, { amount: "6", type: "nature" });
      // A natural 1 is a fumble whatever the DC (05 §4), so an unpinned die
      // failed this cast once in twenty runs and the damage was simply not
      // there (2026-09-07). The Test under test is the card, not the luck.
      const restore = pinDie(15);
      let card;
      try {
        card = await game.system.azeroth.workflows.useFeature({ actor, item: bolt, dc: 1 });
      } finally {
        restore();
      }
      made.push(card);
      assert.lengthOf(card.rolls, 1, "no Casting Test rolled");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.ok(el.querySelector(".azeroth-card-headline"), "the Test is not on the card");
      assert.ok(el.querySelector('[data-action="applyDamage"][data-damage="6"]'), "no 6 Nature damage to apply");
      assert.deepEqual(checkText(el), []);
    });

    it("stars gather under Fatigue with their own button, and the sixteenth is refused", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({
        name: "ZZ Favorites", classes: [["Mage", 5]], weapons: ["Amani hatchet"],
        spells: await (async () => {
          const pack = game.packs.get(PACK_FOR.spell);
          const index = await pack.getIndex({ fields: ["system.school", "system.tier"] });
          return index.filter(e => e.system?.school === "fire" && e.system?.tier <= 2).slice(0, 14).map(e => e.name);
        })()
      });
      await until(() => featuresOf(actor).length >= 3);
      const spell = actor.items.find(i => i.type === "spell");
      const weapon = actor.items.find(i => i.type === "weapon");
      const sheet = await openSheet(actor);
      try {
        assert.ok(sheet.element.querySelector(".azeroth-favorite--empty"), "an empty favorites list does not say so");
        // Star from the row.
        sheet.changeTab("spells", "primary");
        await settle();
        const star = sheet.element.querySelector(`.azeroth-spell[data-item-id="${spell.id}"] [data-action="toggleFavorite"]`);
        assert.ok(star, "no star on a spell row");
        let wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        click(star);
        await wait;
        await actor.toggleFavorite(weapon.id);
        await actor.toggleFavorite(featureNamed(actor, "Blink").id);
        assert.deepEqual(actor.favorites, [spell.id, weapon.id, featureNamed(actor, "Blink").id]);
        await sheet.render({ force: true });
        await settle();
        const rows = [...sheet.element.querySelectorAll(".azeroth-favorite[data-item-id]")];
        assert.lengthOf(rows, 3);
        assert.ok(rows[0].querySelector('[data-action="castSpell"]'), "the starred spell has no Cast");
        assert.ok(rows[1].querySelector('[data-action="rollAttack"]'), "the starred weapon has no Attack");
        assert.ok(rows[2].querySelector('[data-action="useFeature"]'), "the starred feature has no Use");
        assert.ok(sheet.element.querySelector(`.azeroth-spell[data-item-id="${spell.id}"] .azeroth-star.is-favorite`), "the row's star is not lit");
        // The Favorites list sits under Fatigue.
        const fatigue = sheet.element.querySelector(".azeroth-fatigue");
        const list = sheet.element.querySelector(".azeroth-favorites");
        assert.isTrue(!!(fatigue.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING), "Favorites are not under Fatigue");
        assert.deepEqual(checkText(sheet.element.querySelector("section[data-tab='core']")), []);
        // Unstar from the favorites row.
        wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        click(rows[1].querySelector('[data-action="toggleFavorite"]'));
        await wait;
        assert.deepEqual(actor.favorites, [spell.id, featureNamed(actor, "Blink").id]);

        // Fifteen at most: the sixteenth is refused with a notice and nothing moves.
        const candidates = actor.items.filter(i => !actor.favorites.includes(i.id) && i.type !== "class" && i.type !== "talent");
        for (const item of candidates) { if (actor.favorites.length >= 15) break; await actor.toggleFavorite(item.id); }
        assert.lengthOf(actor.favorites, 15, "could not fill fifteen favorites");
        const extra = candidates.find(i => !actor.favorites.includes(i.id));
        assert.ok(extra, "no sixteenth candidate");
        await actor.toggleFavorite(extra.id);
        assert.lengthOf(actor.favorites, 15, "the sixteenth favorite was taken");
        assert.notInclude(actor.favorites, extra.id);
        await sheet.render({ force: true });
        await settle();
        assert.include(sheet.element.querySelector(".azeroth-favorites-count").textContent, "15 / 15");
      } finally {
        await sheet.close();
      }
    });

    // ---- reminders on the roll dialog (D-613) -----------------------------

    it("the roll dialog offers a passive with a Boon as an unchecked line, and one without as a note, by kind", async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, false);
      const actor = await makeCharacter({ name: "ZZ Reminders Rogue", classes: [["Rogue", 9]], weapons: ["Amani hatchet"] });
      await until(() => featureNamed(actor, "Evasion"));
      const sheet = await openSheet(actor);
      try {
        // An attack: Opening rides as a line with +1; Finisher, Poisoner are notes; Evasion (resilience) is absent.
        sheet.changeTab("combat", "primary");
        await settle();
        const pending = dialogFor(actor, 5000);
        click(sheet.element.querySelector('.azeroth-weapon [data-action="rollAttack"]'));
        const dialog = await pending;
        try {
          const line = dialog.element.querySelector('input[name="line-feature-opening"]');
          assert.ok(line, "Opening is not offered as a line");
          assert.isFalse(line.checked, "a reminder line starts checked - D2 SS12");
          const notes = [...dialog.element.querySelectorAll(".azeroth-dialog-reminder-list li strong")].map(e => e.textContent.trim());
          assert.include(notes, "Finisher");
          assert.include(notes, "Extra Attack");
          assert.notInclude(notes, "Evasion", "a Resilience reminder on an attack");
          assert.notInclude(notes, "Opening", "a lined feature is also a note");
          const preview = () => dialog.element.querySelector(".azeroth-dialog-preview").textContent;
          const before = preview();
          line.checked = true;
          line.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));
          assert.notEqual(preview(), before, "ticking Opening changed nothing in the preview");
          // The two groups this decision draws, measured; the dialog's older
          // furniture has its own debt and its own test.
          for (const sel of [".azeroth-dialog-reminders", 'label.azeroth-dialog-line:has(input[name="line-feature-opening"])']) {
            const el = dialog.element.querySelector(sel);
            assert.ok(el, `${sel} not drawn`);
            const findings = checkText(el);
            assert.deepEqual(findings, [], `${sel}: ${findings.map(f => f.detail).join(" | ")}`);
          }
        } finally {
          await dialog.close();
        }

        // A Resilience Test: Evasion is the note, Opening is nowhere.
        const pending2 = dialogFor(actor, 5000);
        click(sheet.element.querySelector('[data-action="rollResilience"][data-resilience="reflex"]'));
        const dialog2 = await pending2;
        try {
          const notes = [...dialog2.element.querySelectorAll(".azeroth-dialog-reminder-list li strong")].map(e => e.textContent.trim());
          assert.include(notes, "Evasion");
          assert.notOk(dialog2.element.querySelector('input[name="line-feature-opening"]'), "Opening on a Resilience Test");
        } finally {
          await dialog2.close();
        }
      } finally {
        await sheet.close();
      }
    });

    it("the roll dialog's every line meets the floor: an attack with its location row, and a cast with its Mana row (D-619)", async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, false);
      const measure = (dialog, what) => {
        const findings = checkText(dialog.element.querySelector(".azeroth-dialog"));
        assert.deepEqual(findings, [], `${what}: ${findings.map(f => f.detail).join(" | ")}`);
      };

      // A Warrior's attack: the location row, the Momentum line, the notes beside them.
      const warrior = await makeCharacter({ name: "ZZ Dialog Floor Warrior", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      await until(() => featureNamed(warrior, "Second Wind"));
      const sheet = await openSheet(warrior);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const pending = dialogFor(warrior, 5000);
        click(sheet.element.querySelector('.azeroth-weapon [data-action="rollAttack"]'));
        const dialog = await pending;
        try {
          assert.ok(dialog.element.querySelector(".azeroth-dialog-location"), "no location row on an attack");
          assert.ok(dialog.element.querySelector(".azeroth-dialog-note"), "no note drawn on the attack dialog");
          measure(dialog, "attack");
        } finally {
          await dialog.close();
        }
      } finally {
        await sheet.close();
      }

      // A Shaman's cast: the Mana row with its count and the Overchannel note.
      const spellPack = game.packs.get(PACK_FOR.spell);
      const spellIndex = await spellPack.getIndex({ fields: ["system.school", "system.tier"] });
      const spell = spellIndex.find(e => e.system?.school === "nature" && e.system?.tier === 1);
      assert.ok(spell, "no tier-1 Nature spell in the pack");
      const shaman = await makeCharacter({ name: "ZZ Dialog Floor Shaman", classes: [["Shaman", 5]], spells: [spell.name] });
      const sheet2 = await openSheet(shaman);
      try {
        sheet2.changeTab("spells", "primary");
        await settle();
        const pending = dialogFor(shaman, 5000);
        click(sheet2.element.querySelector('[data-action="castSpell"]'));
        const dialog = await pending;
        try {
          assert.ok(dialog.element.querySelector(".azeroth-dialog-casting"), "no casting row on a cast");
          measure(dialog, "cast");
        } finally {
          await dialog.close();
        }
      } finally {
        await sheet2.close();
      }
    });

    // ---- the Spells header and the rail (D-614) ---------------------------

    it("the Spells tab heads with Core's Mana bar and 07 SS5's minimum, and the rail's plates reach the bottom", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Spells Header", classes: [["Mage", 5]], abilities: { int: 16 }, spells: ["Cure Blight"] });
      const sheet = await openSheet(actor);
      try {
        const coreSegments = sheet.element.querySelectorAll('section[data-tab="core"] .azeroth-pool-track .azeroth-segment').length;
        sheet.changeTab("spells", "primary");
        await settle();
        const header = sheet.element.querySelector(".azeroth-spells-header");
        assert.ok(header, "no Spells header");
        const bar = header.querySelector(".azeroth-pool-track");
        assert.ok(bar, "no Mana bar on the Spells header");
        assert.equal(bar.querySelectorAll(".azeroth-segment").length, actor.system.powers[0].max, "the bar's segments are not the pool's cap");
        assert.isAtLeast(coreSegments, bar.querySelectorAll(".azeroth-segment").length, "Core draws fewer segments than Spells");
        assert.ok(header.querySelector('[data-action="spendPool"]'), "the header's bar has no Spend");
        // Mage 5: tier 2, full caster, Intelligence +3: 4+3 at tier 1, then 2+3 = 12.
        const known = header.querySelector(".azeroth-spells-known");
        assert.include(known.textContent, "12", "the minimum is not 07 SS5's 12 for a tier-2 Mage at +3");
        assert.include(known.textContent, "Mage");
        assert.include(known.querySelector("dd strong").textContent, "1", "the count of spells held");
        assert.ok(known.classList.contains("is-short"), "one spell against twelve is not marked short");
        assert.deepEqual(checkText(header), []);
        // The rail: the last plate ends at the bottom of its track.
        const rail = sheet.element.querySelector(".azeroth-attributes");
        const plates = rail.querySelectorAll(".azeroth-attribute");
        const last = plates[plates.length - 1].getBoundingClientRect();
        const box = rail.getBoundingClientRect();
        assert.isAtMost(box.bottom - last.bottom, 16, `the last plate stops ${Math.round(box.bottom - last.bottom)}px short of the rail's bottom`);
      } finally {
        await sheet.close();
      }
      // A class that casts nothing draws no Spells tab at all (D-639); a spell
      // item brings the tab, headed "No casting class", and its deletion takes
      // it away. The Ranger's Spell DC is not casting.
      const warrior = await makeCharacter({ name: "ZZ Spells No Caster", classes: [["Warrior", 1]] });
      const plain = await openSheet(warrior);
      try {
        const navTabs = () => [...plain.element.querySelectorAll("nav.tabs [data-tab]")].map(a => a.dataset.tab);
        assert.notInclude(navTabs(), "spells", "a Warrior draws a Spells tab");
        assert.isNull(plain.element.querySelector("section[data-tab='spells']"), "the Spells part rendered with no tab");
        plain.changeTab("spells", "primary");
        await settle();
        assert.notEqual(plain.tabGroups.primary, "spells", "changeTab reached a tab the nav does not draw");
        const scroll = await fromPack(PACK_FOR.spell, "Cure Blight");
        const [held] = await warrior.createEmbeddedDocuments("Item", [scroll.toObject()]);
        await until(() => navTabs().includes("spells"));
        plain.changeTab("spells", "primary");
        await settle();
        assert.include(plain.element.querySelector(".azeroth-spells-known").textContent, game.i18n.localize("AZEROTH.Sheet.NoCaster"));
        await held.delete();
        await until(() => !navTabs().includes("spells"));
        assert.equal(plain.tabGroups.primary, "core", "the sheet did not fall back to Core when its tab left");
        assert.isNull(plain.element.querySelector("section[data-tab='spells']"));
      } finally {
        await plain.close();
      }
      const ranger = await makeCharacter({ name: "ZZ Spells Ranger", classes: [["Ranger", 1]] });
      const rangerSheet = await openSheet(ranger);
      try {
        assert.notInclude([...rangerSheet.element.querySelectorAll("nav.tabs [data-tab]")].map(a => a.dataset.tab), "spells",
          "a Ranger's Spell DC drew a Spells tab");
        assert.isNumber(ranger.system.spellDC, "the Ranger lost its Spell DC");
      } finally {
        await rangerSheet.close();
      }
    });

    // ---- cards: Attack, the target's Test, the area; the Measure control (D-616) ----

    it("a feature's card carries the target's Test with the DC, the pre-sized area, and Attack where it attacks", async function () {
      this.timeout(60000);
      const ranger = await makeCharacter({ name: "ZZ Card Ranger", classes: [["Ranger", 5]], abilities: { wis: 16 } });
      await until(() => featureNamed(ranger, "Snare"));
      const snare = await game.system.azeroth.workflows.useFeature({ actor: ranger, item: featureNamed(ranger, "Snare") });
      made.push(snare);
      const el = document.createElement("div");
      el.innerHTML = snare.content;
      const resist = el.querySelector('[data-action="resistTest"]');
      assert.ok(resist, "no Resist button on Snare's card");
      assert.equal(resist.dataset.resilience, "reflex");
      assert.equal(Number(resist.dataset.dc), ranger.system.spellDC, "the DC on the button is not the Spell DC");
      assert.include(resist.textContent, String(ranger.system.spellDC));
      const place = el.querySelector('[data-action="placeArea"]');
      assert.ok(place, "no Place area button on Snare's card");
      assert.include(place.textContent, "15 ft circle");
      assert.deepEqual(snare.flags["azeroth-rpg"].area, { shape: "circle", distanceFt: 15, origin: "point" });
      assert.notOk(el.querySelector('[data-action="attackFromCard"]'), "Attack on a feature that does not attack");
      assert.deepEqual(checkText(el), []);

      const paladin = await makeCharacter({ name: "ZZ Card Paladin", classes: [["Paladin", 14]], weapons: ["Amani hatchet"] });
      await until(() => featureNamed(paladin, "Divine Storm"));
      const zeal = paladin.poolSnapshot().find(p => p.kind === "momentum");
      await paladin.updatePool({ itemId: zeal.itemId, kind: "momentum", value: 10 });
      const storm = await game.system.azeroth.workflows.useFeature({ actor: paladin, item: featureNamed(paladin, "Divine Storm") });
      made.push(storm);
      const el2 = document.createElement("div");
      el2.innerHTML = storm.content;
      assert.ok(el2.querySelector('[data-action="attackFromCard"]'), "no Attack on Divine Storm's card");
      assert.include(el2.querySelector('[data-action="placeArea"]').textContent, "10 ft circle");

      // The Resist button opens the target's dialog with the DC on it, and the
      // Attack button opens the speaker's attack dialog on their weapon.
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, false);
      let pending = dialogFor(ranger, 5000);
      const { resilienceWithDialog } = await import("../applications/actions.mjs");
      resilienceWithDialog(ranger, "reflex", null, { dc: ranger.system.spellDC });
      let dialog = await pending;
      try {
        assert.ok(dialog, "no Resilience dialog");
        assert.equal(Number(dialog.element.querySelector('input[name="dc"]').value), ranger.system.spellDC, "the DC did not reach the dialog");
      } finally {
        await dialog?.close();
      }
      pending = dialogFor(paladin, 5000);
      CARD_ACTIONS.attackFromCard(el2.querySelector('[data-action="attackFromCard"]'), storm);
      dialog = await pending;
      try {
        assert.ok(dialog, "Attack from the card opened no dialog");
        assert.include(dialog.element.textContent, "Amani hatchet");
      } finally {
        await dialog?.close();
      }
    });

    it("a spell's card offers the target's Test as a button with the Spell DC", async function () {
      this.timeout(60000);
      const pack = game.packs.get(PACK_FOR.spell);
      const index = await pack.getIndex({ fields: ["system.test.resilience", "system.school", "system.tier"] });
      const entry = index.find(e => e.system?.test?.resilience && e.system?.school === "fire" && e.system?.tier <= 2);
      assert.ok(entry, "no fire spell with a Resilience Test in the pack");
      const actor = await makeCharacter({ name: "ZZ Card Caster", classes: [["Mage", 5]], spells: [entry.name] });
      const spell = actor.items.find(i => i.type === "spell");
      const pool = actor.system.powers.find(p => p.name === "mana");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const card = await cardOf("spell", actor, { spell });
      const el = card?.element ?? card;
      const button = el.querySelector('[data-action="resistTest"]');
      assert.ok(button, "no Resist button on the spell card");
      assert.equal(button.dataset.resilience, spell.system.test.resilience);
      assert.equal(Number(button.dataset.dc), actor.system.spellDC);
    });

    it("the Measure control places a flagged Region and Clear removes it", async function () {
      this.timeout(60000);
      const { measureArea, clearMeasuredAreas, areaTextFor } = await import("../canvas/measure.mjs");
      assert.equal(areaTextFor("circle", 15), "A 15 ft radius on the ground");
      assert.equal(areaTextFor("cone", 30), "A 30 ft cone");
      // The test world has no active scene; a measured area needs one to
      // hold the Region, active or not.
      const scene = await Scene.create({ name: "ZZ Measure Scene", width: 2000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      const before = scene.regions.size;
      const region = await measureArea({ shape: "circle", distanceFt: 15, scene, origin: { x: 1000, y: 1000 } });
      try {
        assert.ok(region, "no Region placed");
        assert.isTrue(region.getFlag("azeroth-rpg", "measured"));
        assert.deepEqual(region.getFlag("azeroth-rpg", "area"), { shape: "circle", distanceFt: 15, origin: "point" });
        assert.equal(scene.regions.size, before + 1);
        const cone = await measureArea({ shape: "cone", distanceFt: 20, scene, origin: { x: 1000, y: 1000 }, rotation: 45 });
        assert.ok(cone);
        assert.equal(await clearMeasuredAreas(scene), 2, "Clear did not remove both measured areas");
        assert.equal(scene.regions.size, before);
      } finally {
        await clearMeasuredAreas(scene);
      }
      // The control is registered with its four tools.
      await ui.controls.render({ force: true });
      const control = ui.controls.controls?.azerothMeasure;
      assert.ok(control, "the Measure control is not registered");
      assert.deepEqual(Object.keys(control.tools).sort(), ["circle", "clear", "cone", "line"]);
      assert.ok(ui.controls.element.querySelector('[data-control="azerothMeasure"]'), "the Measure control is not drawn");
    });

    // ---- the Combat tab's figure (D-617) ----------------------------------

    it("the armour figure's tiles carry AP and the called shot's price, the lit tile is the attack's, and the maneuvers list", async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, false);
      const armor = await firstFromPack(PACK_FOR.armor, d => d.system.category === "mail" && !d.system.shield);
      const actor = await makeCharacter({ name: "ZZ Figure Warrior", classes: [["Warrior", 3]], weapons: ["Amani hatchet"], armor: [armor.name] });
      const suit = actor.items.find(i => i.type === "armor");
      await suit.update({ "system.equipped": true });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const tiles = [...sheet.element.querySelectorAll(".azeroth-figure-tile")];
        assert.deepEqual(tiles.map(t => t.dataset.location), ["head", "body", "limb"], "the figure is Head, Body, Limb");
        for (const tile of tiles) {
          const ap = tile.querySelector(".azeroth-figure-ap").textContent.trim();
          assert.equal(ap, String(actor.system.ap[tile.dataset.location]), `${tile.dataset.location} AP`);
        }
        assert.include(tiles[0].querySelector(".azeroth-figure-price").textContent, "−2", "the Head's price is a Bane and −2");
        assert.include(tiles[2].querySelector(".azeroth-figure-price").textContent, "Bane");
        assert.include(tiles[1].querySelector(".azeroth-figure-price").textContent, game.i18n.localize("AZEROTH.Sheet.CalledShotFree"));
        assert.equal(tiles[1].getAttribute("aria-pressed"), "true", "the Body is not lit by default");
        assert.isAbove(Number(sheet.element.querySelector(".azeroth-combat-big").textContent), 0, "no Defense beside the figure");
        assert.lengthOf(sheet.element.querySelectorAll(".azeroth-maneuver"), 7, "05 SS11's three and 06 SS7's four");

        // Click Head: it lights, the field carries it, and the attack dialog opens on it.
        click(tiles[0]);
        await settle();
        assert.equal(tiles[0].getAttribute("aria-pressed"), "true");
        assert.equal(tiles[1].getAttribute("aria-pressed"), "false");
        assert.equal(sheet.element.querySelector("[data-field=azeroth-location]").value, "head");
        const pending = dialogFor(actor, 5000);
        click(sheet.element.querySelector('.azeroth-weapon [data-action="rollAttack"]'));
        const dialog = await pending;
        try {
          assert.ok(dialog, "no attack dialog");
          assert.equal(dialog.element.querySelector('select[name="location"]').value, "head", "the dialog did not open on the lit tile");
        } finally {
          await dialog?.close();
        }
        // A re-render keeps the choice.
        await sheet.render({ force: true });
        await settle();
        assert.equal(sheet.element.querySelector('.azeroth-figure-tile[data-location="head"]').getAttribute("aria-pressed"), "true", "a re-render lost the lit tile");
        const panel = sheet.element.querySelector('section[data-tab="combat"]');
        assert.deepEqual(checkText(panel), [], "the Combat tab breaks the legibility floor");
      } finally {
        await sheet.close();
      }
    });

    // ---- a feature that is a menu: the Totem chooser (D-618) --------------

    it("Use on Totem asks which totem, lists every totem with those above the level greyed, and a dismissed chooser costs nothing", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Totem Shaman", classes: [["Shaman", 7]] });
      await until(() => featureNamed(actor, "Totem"));
      const totem = featureNamed(actor, "Totem");
      assert.equal(totem.system.choice, "totems", "Totem is not a menu feature");
      const cls = actor.items.find(i => i.type === "class");
      assert.lengthOf(cls.system.totems, 7, "the Shaman's seven totems are not on the class");

      const { featureChoices } = await import("../dice/workflows.mjs");
      const options = await featureChoices(actor, totem);
      // D-635: the whole table, level order, and what level 7 has not reached greyed.
      assert.deepEqual(options.map(o => o.name), ["Stoneskin", "Searing", "Healing Stream", "Windfury", "Grounding", "Tremor", "Mana Tide"],
        "the chooser does not list the whole table");
      assert.deepEqual(options.filter(o => o.available !== false).map(o => o.name), ["Stoneskin", "Searing", "Healing Stream", "Windfury", "Grounding"],
        "the chooser does not grey what level 7 has not reached (Tremor is level 9)");

      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const before = actor.poolSnapshot().find(p => p.kind === "power").value;

      // Dismiss: no Mana spent, no card.
      const messages = game.messages.size;
      const dismissed = game.system.azeroth.workflows.useFeature({ actor, item: totem });
      const chooser = await (async () => {
        for (let i = 0; i < 100; i++) {
          const app = foundry.applications.instances.get(`azeroth-choose-${totem.id}`);
          if (app?.rendered) return app;
          await new Promise(r => setTimeout(r, 50));
        }
        return null;
      })();
      assert.ok(chooser, "Use on Totem opened no chooser");
      const shown = [...chooser.element.querySelectorAll("#azeroth-choose-select option")].map(o => o.textContent.trim());
      assert.lengthOf(shown, 7, "the chooser does not list the whole table (D-635)");
      assert.include(shown.join(" | "), "Grounding");
      const tremor = [...chooser.element.querySelectorAll("#azeroth-choose-select option")].find(o => o.textContent.includes("Tremor"));
      assert.ok(tremor?.disabled, "Tremor is not greyed at level 7");
      assert.deepEqual(checkText(chooser.element.querySelector(".azeroth-choose")), []);
      await chooser.close();
      assert.isNull(await dismissed, "a dismissed chooser still used the feature");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, before, "a dismissed chooser spent Mana");
      assert.equal(game.messages.size, messages, "a dismissed chooser posted a card");

      // Choose Grounding: the card names it, spends 2 Mana, and offers the 30 ft area.
      const used = game.system.azeroth.workflows.useFeature({ actor, item: totem });
      const chooser2 = await (async () => {
        for (let i = 0; i < 100; i++) {
          const app = foundry.applications.instances.get(`azeroth-choose-${totem.id}`);
          if (app?.rendered) return app;
          await new Promise(r => setTimeout(r, 50));
        }
        return null;
      })();
      assert.ok(chooser2, "the second chooser did not open");
      const select = chooser2.element.querySelector("#azeroth-choose-select");
      select.value = String(options.findIndex(o => o.name === "Grounding"));
      chooser2.element.querySelector('button[data-action="choose"]').click();
      const card = await used;
      made.push(card);
      assert.ok(card, "no card after choosing");
      assert.equal(card.flags["azeroth-rpg"].choice, "Grounding");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, before - 2, "2 Mana were not spent");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.include(el.querySelector(".azeroth-chosen").textContent, "Grounding");
      assert.include(el.textContent, "Grounding Totem", "the totem's effect is not on the card");
      assert.include(el.querySelector('[data-action="placeArea"]').textContent, "30 ft circle");
      assert.deepEqual(checkText(el), []);
    });

    // ---- the other two menus (D-619) --------------------------------------

    /** The chooser for a menu feature, once rendered; null after five seconds. */
    const openChooser = async item => {
      for (let i = 0; i < 100; i++) {
        const app = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
        if (app?.rendered) return app;
        await new Promise(r => setTimeout(r, 50));
      }
      return null;
    };
    const chooseByName = (chooser, options, name) => {
      const select = chooser.element.querySelector("#azeroth-choose-select");
      select.value = String(options.findIndex(o => o.name === name));
      chooser.element.querySelector('button[data-action="choose"]').click();
    };

    it("Use on Elemental Bond lists 14's elementals from the bestiary, Standard before Elite, and the card links the block", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Bond Shaman", classes: [["Shaman", 17]] });
      await until(() => featureNamed(actor, "Elemental Bond"));
      const bond = featureNamed(actor, "Elemental Bond");
      assert.equal(bond.system.choice, "elementals", "Elemental Bond is not a menu feature");
      const { featureChoices } = await import("../dice/workflows.mjs");
      const options = await featureChoices(actor, bond);
      const names = options.map(o => o.name);
      assert.include(names, "Fire Elemental");
      assert.include(names, "Greater Water Elemental");
      assert.lengthOf(names, 8, `14 SS9 holds eight elementals; offered: ${names.join(", ")}`);
      // Typed elemental, but SS13's: the eye caught both on the first capture.
      assert.notInclude(names, "Searing Totem");
      assert.notInclude(names, "Treant");
      assert.isBelow(names.indexOf("Water Elemental"), names.indexOf("Greater Fire Elemental"), "an Elite listed before a Standard");
      assert.ok(options.every(o => o.uuid?.startsWith("Compendium.azeroth-rpg.bestiary.")), "an option without its block's uuid");
      assert.ok(options.every(o => /Tier \d/.test(o.tag)), "an option without its tier on the tag");

      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const before = actor.poolSnapshot().find(p => p.kind === "power").value;

      const used = game.system.azeroth.workflows.useFeature({ actor, item: bond });
      const chooser = await openChooser(bond);
      assert.ok(chooser, "Use on Elemental Bond opened no chooser");
      assert.deepEqual(checkText(chooser.element.querySelector(".azeroth-choose")), []);
      chooseByName(chooser, options, "Fire Elemental");
      const card = await used;
      made.push(card);
      assert.ok(card, "no card after choosing");
      assert.equal(card.flags["azeroth-rpg"].choice, "Fire Elemental");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, before - 12, "12 Mana were not spent");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      const link = el.querySelector('a.content-link[data-uuid^="Compendium.azeroth-rpg.bestiary."]');
      assert.ok(link, "the card does not link the elemental's block");
      assert.include(link.textContent, "Fire Elemental");
    });

    it("Shapeshift learns a Beast by taking it, holds to 02 SS7's Forms table, and lists only the known forms once full", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Forms Druid", classes: [["Druid", 1]] });
      await until(() => featureNamed(actor, "Shapeshift"));
      const shift = featureNamed(actor, "Shapeshift");
      assert.equal(shift.system.choice, "forms", "Shapeshift is not a menu feature");
      const cls = actor.items.find(i => i.type === "class");
      assert.deepEqual(cls.system.forms.map(f => [f.level, f.known]), [[1, 1], [5, 2], [9, 3], [14, 4], [17, 5]], "the Forms table is not on the class");

      const { featureChoices } = await import("../dice/workflows.mjs");
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex({ fields: ["system.creatureType", "system.weightClass"] });
      const eligible = index.filter(e => e.system?.creatureType === "beast" && ["chaff", "standard"].includes(e.system?.weightClass)).length;
      assert.isAbove(eligible, 5, "the bestiary holds too few Beasts to test with");
      let options = await featureChoices(actor, shift);
      assert.lengthOf(options, eligible, "not every Beast at Chaff or Standard weight is offered");
      assert.ok(options.every(o => o.learn && !o.known), "a form is known before any was taken");
      assert.notInclude(options.map(o => o.name), "Devilsaur", "an Elite Beast is offered");

      // Take Black Bear: learned, linked on the card, nothing spent.
      const messages = game.messages.size;
      const used = game.system.azeroth.workflows.useFeature({ actor, item: shift });
      const chooser = await openChooser(shift);
      assert.ok(chooser, "Use on Shapeshift opened no chooser");
      assert.include(chooser.element.querySelector(".azeroth-choose-note").textContent, "0 of 1");
      assert.deepEqual(checkText(chooser.element.querySelector(".azeroth-choose")), []);
      chooseByName(chooser, options, "Black Bear");
      const card = await used;
      made.push(card);
      assert.ok(card, "no card after choosing");
      assert.equal(game.messages.size, messages + 1);
      assert.deepEqual(shift.system.known.map(k => k.name), ["Black Bear"], "the form taken was not learned");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.ok(el.querySelector('a.content-link[data-uuid^="Compendium.azeroth-rpg.bestiary."]'), "the card does not link the form's block");

      // Full at level 1: Black Bear alone.
      options = await featureChoices(actor, shift);
      assert.deepEqual(options.map(o => o.name), ["Black Bear"], "a full table still offers new forms");
      assert.isTrue(options[0].known);

      // Level 5 opens a second: every eligible Beast again, the known one first.
      await actor.setLevel(5);
      await until(() => featureNamed(actor, "Extra Attack"));
      options = await featureChoices(actor, shift);
      assert.lengthOf(options, eligible);
      assert.equal(options[0].name, "Black Bear");
      assert.isTrue(options[0].known);
      assert.isTrue(options[1].learn);
    });

    // ---- cards and rows (D-622) -------------------------------------------

    it("a provenance label never breaks inside a word, however long the Circumstance row runs", async function () {
      this.timeout(30000);
      const { renderTemplate } = foundry.applications.handlebars;
      const html = await renderTemplate("systems/azeroth-rpg/templates/chat/partials/provenance.hbs", {
        provenance: [
          { source: "die", formula: "2d20kh" },
          { label: "AZEROTH.Dialog.Circumstance", value: null, formula: "The target cannot see you, You are flanking the target, 2 more Boons" },
          { label: "AZEROTH.Sheet.Proficiency", value: 3 }
        ]
      });
      const host = document.createElement("div");
      host.className = "azeroth azeroth-card";
      host.innerHTML = html;
      document.body.appendChild(host);
      try {
        // A flex item stretches to its row, so the TEXT is measured: a Range over
        // the contents gives one rect per line box.
        const lines = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length; };
        for (const label of host.querySelectorAll(".azeroth-provenance-label")) {
          assert.equal(lines(label), 1, `"${label.textContent.trim()}" wraps`);
        }
        const value = [...host.querySelectorAll(".azeroth-provenance-value")].find(v => v.textContent.includes("flanking"));
        assert.isAbove(lines(value), 1, "the long value did not wrap under itself");
        assert.deepEqual(checkText(host), []);
      } finally {
        host.remove();
      }
    });

    it("every rolled card says its verdict in words: Success and the margin's name, Hit or Miss on an attack, Near miss on a natural 1", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Verdict", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const verdict = el => el.querySelector(".azeroth-card-verdict")?.textContent.replace(/\s+/g, " ").trim() ?? null;
      // A skill Test: face 15 + rank 1 against DC 12 is SL 0 - Success, Bare.
      let card = await cardOf("skill", actor, { face: 15 });
      assert.equal(verdict(card.element), "Success Bare");
      // Face 20 against DC 12 is SL 1 - and a natural 20 never reads below Strong.
      card = await cardOf("skill", actor, { face: 20 });
      assert.equal(verdict(card.element), "Success Strong");
      // A natural 1 against DC 5: total 2, margin -3, SL 0 - a Failure and a near miss, never bare.
      card = await cardOf("skill", actor, { face: 1, args: { dc: 5 } });
      assert.equal(verdict(card.element), "Failure Near miss");
      // An attack says Hit or Miss.
      card = await cardOf("attack", actor, { face: 15 });
      assert.equal(verdict(card.element), "Hit Strong");
      card = await cardOf("attack", actor, { face: 5 });
      assert.equal(verdict(card.element), "Miss Near miss");
      assert.deepEqual(checkText(card.element), []);
    });

    it("an expanded feature says where it came from, and so do a race's trait and its talents", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Origin", classes: [["Warrior", 1]], race: "Orc" });
      await until(() => featureNamed(actor, "Second Wind") && featureNamed(actor, "Blood Fury"));
      const sheet = await openSheet(actor);
      try {
        const origin = name => {
          // Features sit at the foot of Combat (D-665).
          const row = [...sheet.element.querySelectorAll("section[data-tab='combat'] .azeroth-feature")].find(li => li.querySelector(".azeroth-feature-name").textContent.trim() === name);
          assert.ok(row, `${name} is not listed`);
          return row.querySelector(".azeroth-item-origin")?.textContent.trim() ?? null;
        };
        assert.equal(origin("Second Wind"), "Warrior \u00b7 level 1");
        assert.equal(origin("Blood Fury"), "Orc \u00b7 trait");
        sheet.changeTab("progress", "primary");
        await settle();
        const tile = sheet.element.querySelector(".azeroth-racial-row .azeroth-talent .azeroth-talent-meta");
        assert.ok(tile, "no racial tile card");
        assert.include(tile.textContent.replace(/\s+/g, " "), "Orc \u00b7 tier 1");
        sheet.element.querySelector('[data-action="openBranch"]').click();
        await settle();
        const treeMeta = sheet.element.querySelector(".azeroth-tree .azeroth-talent-meta");
        assert.ok(treeMeta, "no tree card");
        assert.include(treeMeta.textContent.replace(/\s+/g, " "), "Warrior \u00b7 ");
      } finally {
        await sheet.close();
      }
    });

    // ---- the race applied, Speed, and the restamp (D-620, D-621) ---------

    const racialOf = (actor, race) => actor.items.filter(i => i.type === "talent" && i.system.race === race);

    it("a race dropped on the sheet brings its trait as a feature and its eight talents, the picks follow the tier, and the next race replaces both", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Race Drop", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const nightElf = await fromPack(PACK_FOR.race, "Night Elf");
        const wait = untilHook("createItem", 5000, i => i.parent?.id === actor.id && i.type === "race");
        forgeDrop(sheet.element, { type: "Item", uuid: nightElf.uuid });
        await wait;
        await until(() => racialOf(actor, "Night Elf").length === 8 && featureNamed(actor, "Shadowmeld"));
        const shadowmeld = featureNamed(actor, "Shadowmeld");
        assert.equal(shadowmeld.system.kind, "action");
        assert.equal(shadowmeld.system.action, "half");
        assert.equal(shadowmeld.system.className, "Night Elf");
        assert.lengthOf(actor.items.filter(i => i.type === "talent" && !i.system.race), 36, "the class's thirty-six moved");
        assert.deepEqual(racialOf(actor, "Night Elf").map(t => t.system.tier).sort(), [1, 1, 1, 2, 2, 3, 3, 4]);
        assert.isTrue(racialOf(actor, "Night Elf").every(t => t.system.taken === 0 && t.system.ranks === 1));

        await sheet.render({ force: true });
        await settle();
        assert.include(sheet.element.querySelector("section[data-tab='combat'] .azeroth-features").textContent, "Shadowmeld", "the trait is not under Features on Combat (D-665)");
        assert.ok(sheet.element.querySelector("section[data-tab='core'] .azeroth-effect-list"), "Core lost its effect list");
        assert.isNull(sheet.element.querySelector("section[data-tab='core'] .azeroth-features"), "Features still sit on Core");
        sheet.changeTab("progress", "primary");
        await settle();
        const row = () => sheet.element.querySelector(".azeroth-racial-row");
        assert.ok(row(), "no racial talents on Progress");
        assert.lengthOf(row().querySelectorAll(".azeroth-talent"), 8);
        const heading = () => sheet.element.querySelector(".azeroth-talents-heading");
        assert.include(heading().textContent, "Night Elf");
        assert.include(heading().textContent.replace(/\s+/g, " "), "1 / 1", "one pick at level 1");
        assert.deepEqual(checkText(row()), []);
        // Every untaken tile fades under full ink (D-640), one state each, and the card stays opaque.
        const tiles = [...row().querySelectorAll(".azeroth-talent")];
        assert.isTrue(tiles.every(t => t.classList.contains("azeroth-talent--untaken")), "an untaken tile is not marked untaken");
        assert.isTrue(tiles.some(t => t.classList.contains("azeroth-talent--available")), "no tile is available at level 1");
        assert.isTrue(tiles.some(t => t.classList.contains("azeroth-talent--locked")), "no tile is locked at level 1");
        assert.equal(getComputedStyle(tiles[0].querySelector(".azeroth-talent-name")).opacity, "0.65");
        assert.equal(getComputedStyle(tiles[0].querySelector(".azeroth-talent-card")).opacity, "1", "the card faded with the tile");
        // The tree's own socket now (D-758): the ICON fades with the name, and
        // the rank badge - the count, on its own plate - does not.
        assert.equal(getComputedStyle(tiles[0].querySelector(".azeroth-talent-icon")).opacity, "0.65", "the untaken icon does not fade");
        assert.equal(getComputedStyle(tiles[0].querySelector(".azeroth-talent-rank")).opacity, "1", "the badge faded with the tile");
        assert.equal(tiles[0].querySelector(".azeroth-talent-socket")?.tagName, "BUTTON", "the racial socket is not a button");

        const talent = name => racialOf(actor, "Night Elf").find(t => t.name === name);
        const button = name => sheet.element.querySelector(`.azeroth-racial-row [data-action="takeTalent"][data-item-id="${talent(name).id}"]`);
        const reason = name => sheet.element.querySelector(`.azeroth-racial-row .azeroth-talent[data-item-id="${talent(name).id}"] .azeroth-talent-locked`)?.textContent.trim() ?? null;

        // Level 1: a tier-1 talent takes; a tier-2 is locked by tier, and after the pick everything is.
        assert.ok(button("Nature's Ally"), "Nature's Ally offers no Learn button");
        assert.notOk(button("Ten Thousand Years"), "a tier-2 talent is offered at level 1");
        assert.include(reason("Ten Thousand Years"), "tier");
        click(button("Nature's Ally"));
        await until(() => talent("Nature's Ally").system.taken === 1);
        await settle();
        const takenTile = row().querySelector(`.azeroth-talent[data-item-id="${talent("Nature's Ally").id}"]`);
        assert.isTrue(takenTile.classList.contains("azeroth-talent--taken"), "the taken tile is not marked taken");
        assert.isFalse(takenTile.classList.contains("azeroth-talent--locked") || takenTile.classList.contains("azeroth-talent--untaken"),
          "a taken tile still reads locked or untaken");
        assert.equal(getComputedStyle(takenTile.querySelector(".azeroth-talent-name")).opacity, "1");
        assert.equal(getComputedStyle(takenTile.querySelector(".azeroth-talent-icon")).opacity, "1", "a taken tile's icon still fades");
        assert.equal(takenTile.querySelector(".azeroth-talent-rank")?.textContent.trim(), "1/1");
        assert.notOk(button("Woodscraft"), "a second pick is offered at level 1");
        assert.include(heading().textContent.replace(/\s+/g, " "), "0 / 1");

        // Level 5 opens a second pick and tier 2; tier 3 stays shut.
        await actor.setLevel(5);
        await until(() => featureNamed(actor, "Extra Attack"));
        await sheet.render({ force: true });
        await settle();
        sheet.changeTab("progress", "primary");
        await settle();
        assert.include(heading().textContent.replace(/\s+/g, " "), "1 / 2");
        assert.ok(button("Ten Thousand Years"), "a tier-2 talent is not offered at level 5");
        assert.notOk(button("Starlight Road"), "a tier-3 talent is offered at level 5");
        click(button("Ten Thousand Years"));
        await until(() => talent("Ten Thousand Years").system.taken === 1);

        // The next race replaces trait and talents alike; the class's thirty-six stay.
        const tauren = await fromPack(PACK_FOR.race, "Tauren");
        const wait2 = untilHook("createItem", 5000, i => i.parent?.id === actor.id && i.type === "race");
        forgeDrop(sheet.element, { type: "Item", uuid: tauren.uuid });
        await wait2;
        await until(() => actor.raceItem?.name === "Tauren" && racialOf(actor, "Night Elf").length === 0
          && racialOf(actor, "Tauren").length === 8 && featureNamed(actor, "Endurance") && !featureNamed(actor, "Shadowmeld"), 15000);
        assert.lengthOf(actor.items.filter(i => i.type === "race"), 1, "two races held");
        assert.lengthOf(actor.items.filter(i => i.type === "talent" && !i.system.race), 36);
        assert.equal(featureNamed(actor, "Endurance").system.kind, "passive");
      } finally {
        await sheet.close();
      }
    });

    it("Blood Fury gains 2 Rage once an encounter, and Endurance rides the Body Resilience dialog as a line", async function () {
      this.timeout(90000);
      const orc = await makeCharacter({ name: "ZZ Orc Fury", classes: [["Warrior", 5]], race: "Orc" });
      await until(() => featureNamed(orc, "Blood Fury"));
      const fury = featureNamed(orc, "Blood Fury");
      assert.equal(fury.system.gain.pool, "momentum");
      assert.equal(fury.system.uses.max, 1);
      const rage = orc.poolSnapshot().find(p => p.kind === "momentum");
      assert.ok(rage, "a Warrior with no Rage pool");
      await orc.updatePool({ itemId: rage.itemId, kind: "momentum", value: 3 });
      const card = await game.system.azeroth.workflows.useFeature({ actor: orc, item: fury });
      made.push(card);
      assert.ok(card, "Blood Fury posted no card");
      assert.equal(orc.poolSnapshot().find(p => p.kind === "momentum").value, 5, "2 Rage were not gained");
      assert.include(card.content, "Gained 2");
      assert.equal(fury.system.uses.value, 0);
      assert.isNull(await game.system.azeroth.workflows.useFeature({ actor: orc, item: fury }), "a second use in the encounter");

      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, false);
      const tauren = await makeCharacter({ name: "ZZ Tauren Endurance", classes: [["Warrior", 5]], race: "Tauren" });
      await until(() => featureNamed(tauren, "Endurance"));
      const sheet = await openSheet(tauren);
      try {
        const pending = dialogFor(tauren, 5000);
        click(sheet.element.querySelector('[data-action="rollResilience"][data-resilience="body"]'));
        const dialog = await pending;
        try {
          const line = dialog.element.querySelector('input[name="line-feature-endurance"]');
          assert.ok(line, "Endurance is not a line on the Body Resilience dialog");
          assert.isFalse(line.checked, "a reminder line starts checked - D2 SS12");
        } finally {
          await dialog.close();
        }
      } finally {
        await sheet.close();
      }
    });

    it("Speed: mail costs 5, Greater Muffled buys it back, a Torn muscle takes 10 until its effect goes, and the banner says why", async function () {
      this.timeout(90000);
      const armorPack = game.packs.get(PACK_FOR.armor);
      const armorIndex = await armorPack.getIndex({ fields: ["system.category", "system.shield", "system.source"] });
      // **08 §8'S OWN SUIT, NEVER A FIND.** This asserts an ABSOLUTE Speed, so
      // it has to be a suit that grants nothing: the armor pack is 203 Classic
      // finds against 77 chapter rows (D-685), the index order is the
      // LevelDB's, and D-697 gives a haste rating a `+N Speed` Signature - the
      // first mail suit in the index turned out to be the Quivering Tunic at
      // +10 feet, and the test read 35 where it wanted 25. Scope an assertion
      // to what the rule owns (D-681).
      const mail = armorIndex.find(e => e.system?.category === "mail" && !e.system?.shield
        && e.system?.source?.document !== "Classic");
      assert.ok(mail, "no chapter mail suit in the pack");
      const actor = await makeCharacter({ name: "ZZ Speed", classes: [["Warrior", 5]], race: "Human", armor: [mail.name] });
      await until(() => featureNamed(actor, "Adaptable"));
      assert.equal(actor.system.speed, 30, "a Human in nothing is not at 30");
      const suit = actor.items.find(i => i.type === "armor" && i.name === mail.name);
      await suit.update({ "system.equipped": true });
      assert.equal(actor.system.speed, 25, "mail is Encumbering (08 SS8)");
      assert.deepEqual(actor.system.speedParts.map(p => p.key), ["race", "armor"]);
      const sheet = await openSheet(actor);
      try {
        const dd = [...sheet.element.querySelectorAll("dd[data-tooltip]")].find(d => /\bft\b/.test(d.textContent));
        assert.ok(dd, "the banner's Speed carries no tooltip");
        assert.include(dd.textContent, "25");
        assert.include(dd.dataset.tooltip, "Armor");
        assert.include(dd.dataset.tooltip, "-5");
      } finally {
        await sheet.close();
      }
      await suit.setFlag("azeroth-rpg", "grants", ["Muffled (Greater)"]);
      assert.equal(actor.system.speed, 30, "Greater Muffled did not buy the Speed back (08 SS6)");
      await game.system.azeroth.workflows.sufferInjury({
        actor, location: "limb", result: { name: "Torn muscle", description: "Speed reduced by 10 feet until a Long Rest" }
      });
      assert.equal(actor.system.speed, 20, "the injury's ten feet were not taken");
      const injury = actor.effects.find(e => e.getFlag("azeroth-rpg", "injury"));
      assert.ok(injury);
      await injury.delete();
      assert.equal(actor.system.speed, 30, "the feet did not return with the effect");
      await actor.toggleStatusEffect("slowed", { active: true });
      assert.equal(actor.system.speed, 15, "Slowed halves the Speed after everything else");
      await actor.toggleStatusEffect("slowed", { active: false });
      assert.equal(actor.system.speed, 30);
    });

    it("a feature granted before its table moved is restamped by the sync, the uses in hand kept, and a second sync changes nothing (D-621)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Restamp Shaman", classes: [["Shaman", 7]] });
      await until(() => featureNamed(actor, "Totem") && featureNamed(actor, "Reincarnation"));
      const totem = featureNamed(actor, "Totem");
      const reincarnation = featureNamed(actor, "Reincarnation");
      const settled = await actor.syncClassFeatures();
      assert.deepEqual(settled, { created: 0, updated: 0, deleted: 0 }, "a fresh character's features are not in step with the table");
      await totem.update({ "system.choice": null, "system.area": "" });
      await reincarnation.update({ "system.uses.value": 0 });
      const counts = await actor.syncClassFeatures();
      assert.equal(counts.updated, 1, "the sync restamped something other than the Totem");
      assert.equal(totem.system.choice, "totems", "the Totem's chooser did not come back");
      assert.equal(totem.system.area, "A 30 ft radius centered on you", "the Totem's area did not come back");
      assert.equal(reincarnation.system.uses.value, 0, "a spent use came back");
      const again = await actor.syncClassFeatures();
      assert.deepEqual(again, { created: 0, updated: 0, deleted: 0 }, "a second sync changed something");
    });
  });
}
