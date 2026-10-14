/**
 * **THE CREATURE'S GEAR TAB** (the lead's N3, 2026-09-10) — the live layer over
 * the model (`quench-npc-gear.mjs`) and the blow (`quench-npc-swing.mjs`).
 *
 * The two batches beside this one prove the numbers move; this one proves a GM
 * can reach them. Every test here goes through the SHEET — a rendered control,
 * a real click, a real drop — because a context field and a registered handler
 * both pass a unit test while the tab does nothing at all, which is exactly the
 * fault this repository keeps finding (D-681).
 *
 * Two shapes it asserts that no static test can:
 *
 *  - **Every `data-action` the rendered tab carries is registered.** An
 *    unregistered action is a SILENT no-op in ApplicationV2, and
 *    `module/actions.test.mjs` cannot see a branch a template renders
 *    conditionally.
 *  - **The purse saves.** A sheet's form is tested by writing through an input
 *    and reading the document back (D-603): both actor sheets once rendered an
 *    empty name input and failed every submit in silence.
 */

import { cleanup, forgeDrop, fromPack, made, makeNpc, openSheet, pinDie, settle, useAction, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, the way every other batch does. */
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

/** The creature's sheet, open on the Gear tab, with the tab's section element. */
async function gearTab(actor) {
  const sheet = await openSheet(actor);
  await sheet.changeTab("gear", "primary");
  await settle();
  const tab = sheet.element.querySelector('section[data-tab="gear"]');
  if (!tab) throw new Error("the NPC sheet rendered no Gear tab");
  return { sheet, tab };
}

/** The rendered row for an item id, wherever it is listed. */
const rowFor = (root, id) => root.querySelector(`li.azeroth-carried-item[data-item-id="${id}"]`);

export function creatureGearTabBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A creature's Gear tab (N3)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor.name === "AzerothNpcSheet") await app.close();
      }
      await cleanup();
    });

    /* ---- the tab exists and every control on it is wired -------------------- */

    it("is the fourth tab on a NON-CASTER, between Traits and GM notes", async function () {
      this.timeout(60000);
      // A Kobold casts nothing, so no Spells tab is drawn between Traits and
      // Gear (D-705, D-639's rule); a caster's strip is five and
      // `quench-npc-spells.mjs` asserts that one.
      const actor = await makeNpc("Kobold");
      const { sheet } = await gearTab(actor);
      const tabs = [...sheet.element.querySelectorAll('nav.sheet-tabs a[data-tab]')].map(a => a.dataset.tab);
      assert.deepEqual(tabs, ["statistics", "traits", "gear", "notes"], `the tab strip reads ${tabs.join(", ")}`);
      const gear = sheet.element.querySelector('nav.sheet-tabs a[data-tab="gear"]');
      assert.equal(gear.textContent.trim(), game.i18n.localize("AZEROTH.NpcTab.gear"),
        "the Gear tab draws no label, so its lang key is missing");
    });

    it("REGISTERS EVERY ACTION IT RENDERS - an unregistered one is a silent no-op", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      // Something with every control on it: an equippable suit, a usable
      // draught with a quantity, and a thing that holds charges.
      await give(actor, "Mail hauberk", PACK_FOR.armor);
      await give(actor, "Healing draught", PACK_FOR.equipment);
      await give(actor, "Waterskin", PACK_FOR.equipment);
      const { sheet, tab } = await gearTab(actor);
      const actions = [...new Set([...tab.querySelectorAll("[data-action]")].map(el => el.dataset.action))];
      assert.isAtLeast(actions.length, 8, `the tab renders only ${actions.length} kinds of control`);
      const missing = actions.filter(a => typeof sheet.options.actions?.[a] !== "function");
      assert.deepEqual(missing, [], `the tab renders ${missing.join(", ")} and the sheet registers no handler`);
      // The row's own controls, by name, so a partial that stops drawing one
      // fails here rather than going quietly missing.
      for (const wanted of ["expandItem", "openItem", "toggleFavorite", "deleteItem", "toggleEquipped", "useGear", "spendCharge", "fillCharges", "browseItems"]) {
        assert.include(actions, wanted, `the tab draws no ${wanted} control`);
      }
    });

    it("carries NO container zone and NO slot tile - both are the character's (N3)", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      await give(actor, "Backpack", PACK_FOR.equipment);
      const { tab } = await gearTab(actor);
      assert.lengthOf(tab.querySelectorAll("[data-container-id]"), 0, "the creature's tab grew a container zone");
      assert.lengthOf(tab.querySelectorAll("[data-slot]"), 0, "the creature's tab grew a paper-doll slot");
      assert.lengthOf(tab.querySelectorAll('[data-action="pickSlot"]'), 0, "a slot picker reached the creature's tab");
      // And the pack is still LISTED - it is a thing that weighs its own row.
      assert.ok([...tab.querySelectorAll(".azeroth-carried-name")].some(n => n.textContent.includes("Backpack")),
        "the pack is not listed at all");
    });

    /* ---- a thing dropped on a creature -------------------------------------- */

    it("takes a weapon DROPPED on it out of a compendium, and lists it", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      const { sheet, tab } = await gearTab(actor);
      const sword = await fromPack(PACK_FOR.weapon, "Longsword");
      forgeDrop(sheet.element, { type: "Item", uuid: sword.uuid });
      await until(() => actor.items.find(i => i.name === "Longsword"), "the sword to land on the creature");
      await sheet.render();
      await settle();
      const item = actor.items.find(i => i.name === "Longsword");
      const row = rowFor(sheet.element.querySelector('section[data-tab="gear"]') ?? tab, item.id);
      assert.ok(row, "the dropped sword is on the creature and not on its Gear tab");
      assert.isFalse(item.system.equipped, "a dropped weapon arrived already in hand");
    });

    it("CLEARS a container reference a drop brought with it, so the carry line is right", async function () {
      this.timeout(60000);
      // Nothing is inside anything on a creature, and `carriedTotal` counts a
      // thing inside a container the actor holds as FREE: a stale reference
      // would silently remove its weight with no section anywhere to show it.
      const actor = await makeNpc("Kobold");
      const loose = await Item.create({
        name: "ZZ Kept in a pack", type: "gear",
        system: { weight: 12, container: "abcdefabcdefabcd" }
      });
      made.push(loose);
      const { sheet } = await gearTab(actor);
      forgeDrop(sheet.element, { type: "Item", uuid: loose.uuid });
      await until(() => actor.items.find(i => i.name === "ZZ Kept in a pack"), "the thing to land");
      const item = actor.items.find(i => i.name === "ZZ Kept in a pack");
      await until(() => !item.system.container, "the container reference to be cleared");
      assert.isNotOk(item.system.container, "the creature's copy still names a bag on another actor");
      await until(() => actor.system.carried >= 12, "the weight to reach the carry line");
    });

    /* ---- equipping, from the tab -------------------------------------------- */

    it("equips a suit from the row's own button, and the block's Armor Points move", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const before = { ...actor.system.ap };
      const suit = await give(actor, "Mail hauberk", PACK_FOR.armor);
      const { sheet } = await gearTab(actor);
      const row = rowFor(sheet.element, suit.id);
      assert.ok(row, "the suit has no row on the tab");
      const button = row.querySelector('[data-action="toggleEquipped"]');
      assert.ok(button, "the suit's row draws no Equip button");
      button.click();
      await until(() => actor.items.get(suit.id).system.equipped === true, "the suit to be worn");
      await until(() => actor.system.ap.body === before.body + 4, "Mail's four Body points");
      // And the same button takes it off again.
      await sheet.render();
      await settle();
      rowFor(sheet.element, suit.id).querySelector('[data-action="toggleEquipped"]').click();
      await until(() => actor.items.get(suit.id).system.equipped === false, "the suit to come off");
      await until(() => actor.system.ap.body === before.body, "the block's own points back");
    });

    it("puts the first suit away when a second goes on - `displacedBy`, not a copy of it", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const mail = await give(actor, "Mail hauberk", PACK_FOR.armor);
      const leather = await give(actor, "Leather jerkin", PACK_FOR.armor);
      await mail.update({ "system.equipped": true });
      const { sheet } = await gearTab(actor);
      rowFor(sheet.element, leather.id).querySelector('[data-action="toggleEquipped"]').click();
      await until(() => actor.items.get(leather.id).system.equipped === true, "the jerkin to go on");
      assert.isFalse(actor.items.get(mail.id).system.equipped, "a creature wore two suits at once (08 §8)");
    });

    /* ---- and then it swings it (N2's consumer) ------------------------------ */

    it("draws the held weapon as an ATTACK ROW beside the block's own, and swings it", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      const block = actor.system.attacks.map(a => a.name);
      assert.isNotEmpty(block, "the fixture prints no attack rows, so 'beside' proves nothing");
      const sword = await give(actor, "Longsword", PACK_FOR.weapon);
      const { sheet } = await gearTab(actor);
      // Not on the sheet while it is only carried.
      assert.lengthOf(sheet.element.querySelectorAll(".azeroth-attack-held"), 0,
        "a weapon that is merely carried already has an attack row");

      await sword.update({ "system.equipped": true });
      await until(() => actor.items.get(sword.id).system.equipped === true, "the sword in hand");
      await sheet.render();
      await settle();
      const held = [...sheet.element.querySelectorAll(".azeroth-attack-held")];
      assert.lengthOf(held, 1, "the held sword has no attack row");
      // The block's own rows are still there and still FIRST (D3 §7).
      const names = [...sheet.element.querySelectorAll(".azeroth-attack:not(.azeroth-attack-head) button")]
        .map(b => b.textContent.replace(/\s+/g, " ").trim());
      assert.equal(names.length, block.length + 1, `the rows read ${names.join(" | ")}`);
      assert.isTrue(names[0].startsWith(block[0]), "a held weapon displaced 14's own first row");
      // The Bonus the row prints is `heldAttackBonus`' own arithmetic.
      const sys = actor.system;
      const want = sys.proficiency + (sys.abilities.str.mod ?? 0) + (sys.attackBonus ?? 0);
      const printed = held[0].querySelector(".azeroth-attack-bonus").textContent.trim();
      assert.equal(printed, `${want < 0 ? "−" : "+"}${Math.abs(want)}`, `the row prints ${printed}`);
      // The mark is a WORD, never a tint alone (D5).
      assert.include(held[0].textContent, game.i18n.localize("AZEROTH.Sheet.HeldWeapon"));

      // And the click swings it, through the character's own attack door.
      const unpin = pinDie(15);
      try {
        const before = game.messages.size;
        held[0].querySelector('[data-action="rollAttack"]').click();
        await until(() => game.messages.size > before, "the swing's card");
        const card = [...game.messages].at(-1);
        assert.include(card.content, "Longsword", "the click swung something other than the held sword");
        assert.equal(card.rolls[0].options.modifier, want, "the card's modifier is not the row's Bonus");
      } finally {
        unpin();
      }
    });

    /* ---- a consumable used from the tab ------------------------------------- */

    it("drinks a draught from the row's Use button and the creature's Health moves", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const draught = await give(actor, "Healing draught", PACK_FOR.equipment);
      const heal = draught.system.use?.heal?.health ?? 0;
      assert.isAbove(heal, 0, "the pack's draught carries no Use, so this proves nothing");
      await actor.update({ "system.health.value": Math.max(1, actor.system.health.max - heal - 2) });
      const before = actor.system.health.value;
      const { sheet } = await gearTab(actor);
      const use = rowFor(sheet.element, draught.id)?.querySelector('[data-action="useGear"]');
      assert.ok(use, "the draught's row draws no Use button");
      const messages = game.messages.size;
      use.click();
      await until(() => actor.system.health.value === before + heal, "the draught to heal the creature");
      await until(() => game.messages.size > messages, "the Use card");
    });

    /* ---- the carry line and the purse --------------------------------------- */

    it("prints 05 SS10's carry line off the model's own numbers", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Abomination");
      const { sheet } = await gearTab(actor);
      const count = sheet.element.querySelector(".azeroth-load-count").textContent.replace(/\s+/g, " ").trim();
      assert.equal(count, game.i18n.format("AZEROTH.Sheet.CarriedOf", {
        used: Math.round((actor.system.carried ?? 0) * 10) / 10, max: actor.system.carryCapacity
      }), `the carry line reads "${count}"`);
      assert.ok(sheet.element.querySelector(".azeroth-load-track"), "there is no bar to fill");
    });

    it("says a `—` STRENGTH HAS NO LIMIT, in words, and draws no bar", async function () {
      this.timeout(60000);
      // A denominator that does not exist is not zero (D-508: a bar implies a
      // denominator). Read as 0 the bar was full and the count read `0 / 0 lb`.
      const actor = await makeNpc("Searing Totem");
      assert.isNull(actor.system.abilities.str.value, "the fixture has a Strength, so this proves nothing");
      assert.isNull(actor.system.carryCapacity, "the model no longer answers null");
      const { sheet } = await gearTab(actor);
      const count = sheet.element.querySelector(".azeroth-load-count").textContent.replace(/\s+/g, " ").trim();
      assert.equal(count, game.i18n.format("AZEROTH.Sheet.CarriedNoLimit", { used: 0 }), `the carry line reads "${count}"`);
      assert.isNull(sheet.element.querySelector(".azeroth-load-track"), "a bar was drawn with no denominator");
    });

    it("SAVES THE PURSE: written through the input, read back off the document (D-603)", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Kobold");
      assert.equal(actor.system.coin, 0, "14 prints no purse and the pack should carry none");
      const { sheet } = await gearTab(actor);
      const input = sheet.element.querySelector('input[name="system.coin"]');
      assert.ok(input, "the tab draws no purse input");
      input.value = "275";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await until(() => actor.system.coin === 275, "the purse to reach the document");
      // And it comes back printed in 08 §2's coin, never in raw copper (D-672).
      await sheet.render();
      await settle();
      const coins = sheet.element.querySelector(".azeroth-purse-coins").textContent.trim();
      assert.equal(coins, "2s 75c", `the purse prints "${coins}"`);
    });

    /* ---- the Augment, decided rather than left silent ------------------------ */

    it("ALLOWS an Augment on a creature and says on the tab why nothing refused it", async function () {
      this.timeout(60000);
      // 08 §9 locks an Augment to a class; `canCarry` returns true for an empty
      // class list ON PURPOSE, so the character's refusal was never a refusal
      // here - it was a no-op wearing one's clothes. It is allowed deliberately
      // and the tab prints the reason: a refusal said only by grey, or an
      // allowance said by nothing at all, is the fault S3 corrected.
      const actor = await makeNpc("Adept of the Schools");
      const focus = await give(actor, "Focus (+1)", PACK_FOR.equipment);
      assert.ok(focus.system.augment, "the pack item is not an Augment, so this proves nothing");
      const { sheet } = await gearTab(actor);
      rowFor(sheet.element, focus.id).querySelector('[data-action="toggleEquipped"]').click();
      await until(() => actor.items.get(focus.id).system.equipped === true, "the Augment to be held");
      await sheet.render();
      await settle();
      const note = sheet.element.querySelector(".azeroth-augment-note");
      assert.ok(note, "an Augment is in hand and the tab says nothing about it");
      assert.include(note.textContent, focus.system.augment.className,
        "the note does not name the class 08 §9 gives it to");
    });
  });
}
