/**
 * Augments — the class equipment a caster casts through (07 §3, 08 §9;
 * D-674). Held in the off hand, one at a time, class-locked, and worth its
 * grade on the Casting Test and on nothing else.
 */

import { cleanup, firstFromPack, gearTab, inspect, makeCharacter, openSheet, pinDie, settle, PACK_FOR } from "./fixtures.mjs";
import { castWithDialog } from "../applications/actions.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { checkText } from "./geometry.mjs";

/** Wait for a condition. */
const until = async (fn, what, ms = 5000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** An Augment from the gear pack, embedded on an actor. */
async function giveAugment(actor, name) {
  const pack = game.packs.get(PACK_FOR.equipment);
  const doc = (await pack.getDocuments()).find(d => d.name === name);
  if (!doc) throw new Error(`${name} is not in the gear pack`);
  const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return item;
}

/**
 * An item's card on the Gear tab, PICKED UP.
 *
 * The rows became bag tiles and hidden inspector cards (D-738), and every
 * control a row used to carry is on the card: a bare `[data-item-id]` finds
 * the tile first, which holds an icon and a badge and nothing to press.
 */
const rowFor = (sheet, id) => inspect(sheet, id);

export function augmentBatch(context) {
  const { describe, it, assert, after, before } = context;

  describe("Augments (07 §3, 08 §9; D-674)", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    it("the pack's twelve read as Augments, with their class and their grade", async function () {
      this.timeout(30000);
      const pack = await game.packs.get(PACK_FOR.equipment).getDocuments();
      const augments = pack.filter(d => d.system.augment);
      assert.isAtLeast(augments.length, 6, "the gear pack carries no Augments");
      const focus = augments.find(d => d.name === "Focus (+1)");
      assert.ok(focus, "no Focus (+1) in the pack");
      assert.deepEqual(
        { category: focus.system.augment.category, className: focus.system.augment.className, bonus: focus.system.augment.bonus, planted: focus.system.augment.planted },
        { category: "focus", className: "Mage", bonus: 1, planted: false },
        "the Focus does not read as the Mage's Augment at +1"
      );
      // A totem is planted, not held (07 §3).
      const totem = augments.find(d => d.name === "Totem (+1)");
      assert.isTrue(totem.system.augment.planted, "the totem does not read as planted");
      // A thing from another section is no Augment at all.
      const pack2 = pack.find(d => d.name === "Backpack");
      assert.isNull(pack2.system.augment, "a backpack reads as an Augment");
    });

    it("a Focus equips, and the button reads as every other item's does", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Aug Mage", classes: [["Mage", 1]] });
      const focus = await giveAugment(actor, "Focus (+1)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const button = (await rowFor(sheet, focus.id)).querySelector('[data-action="toggleEquipped"]');
        assert.ok(button, "an Augment offers no way to equip it");
        // The lead, 2026-09-07: the same word as every other row.
        assert.equal(button.textContent.trim(), game.i18n.localize("AZEROTH.Sheet.Equip"));
        assert.include(button.dataset.tooltip ?? "", "Mage", "the tooltip does not say whose Augment it is");

        // The click has to WRITE: an undefined `canCarry` threw here and the
        // button looked inert, which is what the lead saw (2026-09-07).
        button.click();
        await until(() => focus.system.equipped === true, "the focus to be equipped");
        await sheet.render({ force: true });
        await settle();
        assert.equal(
          (await rowFor(sheet, focus.id)).querySelector('[data-action="toggleEquipped"]').textContent.trim(),
          game.i18n.localize("AZEROTH.Sheet.Equipped"),
          "an equipped Augment does not say so"
        );
        const findings = checkText(gearTab(sheet));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
    });

    it("the item sheet says whose Augment it is and what it is worth", async function () {
      this.timeout(30000);
      const pack = await game.packs.get(PACK_FOR.equipment).getDocuments();
      const focus = pack.find(d => d.name === "Focus (+1)");
      const sheet = focus.sheet;
      await sheet.render({ force: true });
      try {
        const labels = [...sheet.element.querySelectorAll(".azeroth-item__field")]
          .map(f => [f.querySelector("dt")?.textContent.trim(), f.querySelector("dd")?.textContent.trim()]);
        const forWhom = labels.find(([l]) => l === game.i18n.localize("AZEROTH.Item.AugmentClass"));
        const worth = labels.find(([l]) => l === game.i18n.localize("AZEROTH.Item.AugmentBonus"));
        assert.ok(forWhom, `the sheet does not say whose Augment it is: ${labels.map(l => l[0]).join(" | ")}`);
        assert.equal(forWhom[1], "Mage");
        assert.ok(worth, "the sheet does not say what the Augment is worth");
        assert.equal(worth[1], "1");
      } finally {
        await sheet.close();
      }
    });

    it("a thing that is no Augment says nothing about one", async function () {
      this.timeout(30000);
      const pack = await game.packs.get(PACK_FOR.equipment).getDocuments();
      const sheet = pack.find(d => d.name === "Backpack").sheet;
      await sheet.render({ force: true });
      try {
        // D4 §10.1: a field with nothing in it is omitted, never drawn blank.
        const labels = [...sheet.element.querySelectorAll(".azeroth-item__field dt")].map(dt => dt.textContent.trim());
        assert.notInclude(labels, game.i18n.localize("AZEROTH.Item.AugmentClass"));
        assert.notInclude(labels, game.i18n.localize("AZEROTH.Item.AugmentBonus"));
      } finally {
        await sheet.close();
      }
    });

    it("one at a time: a second Augment puts the first away (07 §3)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Aug Two", classes: [["Mage", 5]] });
      const one = await giveAugment(actor, "Focus (+1)");
      const two = await giveAugment(actor, "Focus (+2)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        (await rowFor(sheet, one.id)).querySelector('[data-action="toggleEquipped"]').click();
        await until(() => one.system.equipped === true, "the first focus in hand");
        await sheet.render({ force: true });
        await settle();
        (await rowFor(sheet, two.id)).querySelector('[data-action="toggleEquipped"]').click();
        await until(() => two.system.equipped === true, "the second focus in hand");
        assert.isFalse(one.system.equipped, "a caster is holding two Augments");
      } finally {
        await sheet.close();
      }
    });

    it("class-locked: a Warrior is refused the Mage's Focus (08 §9)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Aug Warrior", classes: [["Warrior", 1]] });
      const focus = await giveAugment(actor, "Focus (+1)");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        (await rowFor(sheet, focus.id)).querySelector('[data-action="toggleEquipped"]').click();
        await new Promise(r => setTimeout(r, 400));
        assert.isFalse(focus.system.equipped, "a Warrior took up a Mage's Focus");
      } finally {
        await sheet.close();
      }
    });

    it("the Casting Test opens carrying the Augment, and the card counts it", async function () {
      this.timeout(60000);
      // 07 §3: it adds to the Casting Test. A skipped dialog still casts
      // through what is in hand, so the card is where this is checked.
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const source = await firstFromPack(PACK_FOR.spell, d => d.system.school === "fire" && d.system.tier === 1);
      const actor = await makeCharacter({ name: "ZZ Aug Caster", classes: [["Mage", 5]], spells: [source.name] });
      const spell = actor.items.find(i => i.type === "spell");
      const pool = actor.system.powers.find(p => p.name === "mana");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });

      const restore = pinDie(15);
      try {
        const without = await castWithDialog(actor, spell);
        assert.ok(without, "the cast posted no card");
        assert.isFalse(
          without.rolls[0].provenance.some(r => r.label === "AZEROTH.Cast.Augment"),
          "an Augment was counted with none in hand"
        );

        const focus = await giveAugment(actor, "Focus (+2)");
        await focus.update({ "system.equipped": true });
        await settle();
        await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
        const withOne = await castWithDialog(actor, spell);
        const row = withOne.rolls[0].provenance.find(r => r.label === "AZEROTH.Cast.Augment");
        assert.ok(row, "the card carries no Augment row with a focus in hand");
        assert.equal(row.value, 2, "the Focus (+2) was not worth two");
        assert.equal(withOne.rolls[0].total - without.rolls[0].total, 2, "the Augment did not reach the Test");
      } finally {
        restore();
      }
    });

    it("a totem is planted, so the dialog says the thirty feet rather than assuming it", async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const source = await firstFromPack(PACK_FOR.spell, d => d.system.school === "nature" && d.system.tier === 1);
      const actor = await makeCharacter({ name: "ZZ Aug Shaman", classes: [["Shaman", 1]], spells: [source.name] });
      const spell = actor.items.find(i => i.type === "spell");
      const totem = await giveAugment(actor, "Totem (+1)");
      await totem.update({ "system.equipped": true });
      await settle();

      const cast = castWithDialog(actor, spell);
      let dialog = null;
      for (let i = 0; i < 80 && !dialog; i++) {
        dialog = [...foundry.applications.instances.values()].find(a => a.id?.startsWith("azeroth-roll-")) ?? null;
        if (!dialog) await new Promise(r => setTimeout(r, 50));
      }
      try {
        assert.ok(dialog, "the casting dialog never opened");
        const box = dialog.element.querySelector('input[name="augment"]');
        assert.ok(box, "the dialog carries no Augment box");
        assert.equal(Number(box.value), 1, "the box did not open carrying the totem's point");
        assert.include(dialog.element.textContent, "30", "the dialog does not name the thirty feet a totem needs");
      } finally {
        dialog?.close();
        await cast.catch(() => null);
      }
    });
  });
}
