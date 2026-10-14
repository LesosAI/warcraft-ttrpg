/**
 * Phase 2 batch: the roll dialog, as uses. A click opens it pre-filled with
 * what the rules settle; the person changes what they may; the card carries
 * why. And the two doors around it: dismiss rolls nothing, the setting skips
 * it with the automatic lines still counted, shift inverts.
 */

import { cleanup, settle, untilHook, made, makeCharacter, makeNpc, openSheet, useAction, dialogFor } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { dialogId } from "../applications/roll-dialog.mjs";


/** Wait for an application to leave `instances`. */
async function gone(app, ms = 3000) {
  for (let i = 0; i < ms / 100 && foundry.applications.instances.has(app.id); i++) await new Promise(r => setTimeout(r, 100));
}

/** Click a synthetic event on an element, optionally with shift held. */
function click(el, { shift = false } = {}) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: shift }));
}

export function rollDialogBatch(context) {
  const { describe, it, assert, after, before } = context;

  describe("The roll dialog", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    it("Fatigue 3 pre-checks a Bane, the preview reads 2d20kl, and the card carries the DC that was typed", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Dialog Tired", classes: [["Warrior", 5]] });
      await actor.update({ "system.fatigue": 3 });
      const sheet = await openSheet(actor);
      try {
        const { el, registered } = useAction(sheet, "rollSkill");
        assert.ok(el && registered, "no skill button, or no handler");
        click(el);
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "the roll dialog did not open");
        const form = dialog.element.querySelector("form");
        const fatigue = form.elements["line-fatigue"];
        assert.ok(fatigue, "no Fatigue line was offered");
        assert.isTrue(fatigue.checked, "the Fatigue Bane was not pre-checked");
        assert.include(dialog.element.querySelector(".azeroth-dialog-preview").textContent, "2d20kl", "the preview did not net one Bane");
        assert.ok(form.elements["line-flanking"] === undefined, "flanking is not a skill-Test line");
        assert.isFalse(form.elements["line-highGround"].checked, "a judgement line came pre-checked (D2 SS12)");

        form.elements.dc.value = "15";
        form.elements.dc.dispatchEvent(new Event("input", { bubbles: true }));
        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
        dialog.element.querySelector('button[data-action="roll"]').click();
        const [message] = await wait;
        const roll = message.rolls[0];
        assert.equal(roll.dc, 15, "the typed DC did not reach the roll");
        assert.include(message.content, "15", "the card does not show DC 15");
        assert.include(roll.formula, "2d20kl", "the roll did not net the Fatigue Bane");
        // Provenance reconstructs the total: the kept die plus every valued row.
        const sum = roll.provenance.filter(r => typeof r.value === "number").reduce((a, r) => a + r.value, 0);
        assert.equal(roll.natural + sum, roll.total, "natural + provenance values != total");
        assert.ok(roll.provenance.some(r => r.label === "AZEROTH.Dialog.Circumstance"), "no circumstance row on the card");
      } finally {
        await sheet.close();
      }
    });

    it("2 Momentum nets the head shot's Bane to 0, keeps the -2, and the pool drops by 2", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Dialog Headshot", classes: [["Warrior", 5]], weapons: ["Amani hatchet"] });
      const pool = actor.system.momenta[0];
      assert.ok(pool, "a Warrior should hold Rage");
      await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: 4 });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const el = sheet.element.querySelector('[data-action="rollAttack"]');
        assert.ok(el, "no Attack button");
        click(el);
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "the roll dialog did not open");
        const form = dialog.element.querySelector("form");
        form.elements.location.value = "head";
        form.elements.location.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        let preview = dialog.element.querySelector(".azeroth-dialog-preview").textContent;
        assert.include(preview, "2d20kl", "a head shot should show one Bane before it is paid for");
        assert.include(preview, "- 2", "the head shot's -2 is missing from the preview");
        assert.isFalse(form.elements.momentum.disabled, "the Momentum toggle is disabled with 4 in the pool");
        form.elements.momentum.checked = true;
        form.elements.momentum.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        preview = dialog.element.querySelector(".azeroth-dialog-preview").textContent;
        assert.match(preview, /^1d20/, "paying did not cancel the Bane");
        assert.include(preview, "- 2", "paying removed the -2, which it never does (D-239)");

        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
        dialog.element.querySelector('button[data-action="roll"]').click();
        const [message] = await wait;
        const roll = message.rolls[0];
        assert.equal(roll.location, "head");
        assert.match(roll.formula, /^1d20/, "the roll did not net the Bane to 0");
        assert.ok(roll.provenance.some(r => r.label === "AZEROTH.Card.CalledShotPenalty" && r.value === -2), "the -2 is not on the card");
        assert.ok(roll.provenance.some(r => r.label === "AZEROTH.Dialog.MomentumSpent"), "the Momentum spent is not on the card");
        assert.equal(actor.system.momenta[0].value, 2, "the pool did not drop by 2");
        assert.equal(message.getFlag("azeroth-rpg", "momentumSpent"), 2);
      } finally {
        await sheet.close();
      }
    });

    it("dismissing the dialog rolls nothing", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Dialog Dismiss", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        const before = game.messages.size;
        const { el } = useAction(sheet, "rollSkill");
        click(el);
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "the roll dialog did not open");
        await dialog.close();
        await gone(dialog);
        await new Promise(r => setTimeout(r, 300));
        assert.equal(game.messages.size, before, "a dismissed dialog posted a card");
      } finally {
        await sheet.close();
      }
    });

    it("the skip setting rolls with the automatic lines and no dialog; shift-click inverts it", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const actor = await makeCharacter({ name: "ZZ Dialog Skip", classes: [["Warrior", 5]] });
      await actor.update({ "system.fatigue": 3 });
      const sheet = await openSheet(actor);
      try {
        const { el } = useAction(sheet, "rollSkill");
        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
        click(el);
        const [message] = await wait;
        assert.notOk(foundry.applications.instances.get(dialogId(actor)), "the dialog opened under the skip setting");
        const roll = message.rolls[0];
        assert.include(roll.formula, "2d20kl", "the skipped dialog dropped the automatic Fatigue Bane");
        assert.equal(roll.dc, 16, "a Warrior 5 is tier 2, so a skipped dialog rolls at DC 16 (05 SS3)");

        // Shift inverts: the dialog opens.
        click(sheet.element.querySelector('[data-action="rollSkill"]'), { shift: true });
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "shift-click under skip did not open the dialog");
        await dialog.close();
        await gone(dialog);
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
        await sheet.close();
      }
    });

    it("the DC is a Standard Test at the roller's tier when nothing is targeted (05 SS3)", async function () {
      this.timeout(30000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Dialog Tier", classes: [["Warrior", 11]] });
      assert.equal(actor.system.tier, 3);
      const sheet = await openSheet(actor);
      try {
        const { el } = useAction(sheet, "rollSkill");
        click(el);
        const dialog = await dialogFor(actor);
        assert.ok(dialog, "the roll dialog did not open");
        assert.equal(Number(dialog.element.querySelector("form").elements.dc.value), 20, "tier 3 is DC 20");
        await dialog.close();
        await gone(dialog);
      } finally {
        await sheet.close();
      }
    });

    it("an NPC's attack pre-fills a targeted creature's Defense, and its Blinded target a Boon", async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const attacker = await makeNpc("Plagued Ghoul");
      assert.ok(attacker.system.attacks?.length, "the Plagued Ghoul carries no attack");
      const victim = await makeNpc("Plagued Ghoul");
      await victim.update({ name: "ZZ Dialog Victim" });
      await victim.toggleStatusEffect("blinded", { active: true });

      const scene = await Scene.create({ name: "ZZ Dialog Scene", width: 1000, height: 1000, grid: { size: 100 } });
      made.push(scene);
      await scene.view();
      // THE GUARD GOES AFTER THE SETUP, AND IT IS AN ASSERTION (CLAUDE.md §15,
      // D-755's review). It was a `this.skip()` on `canvas.ready` above the view:
      // it judged whatever canvas happened to be up before this test made its
      // own, so a world with no scene viewed skipped the test and reported it
      // as nothing at all.
      for (let i = 0; i < 100 && !(canvas?.ready && canvas.scene?.id === scene.id); i++) await new Promise(r => setTimeout(r, 100));
      assert.isTrue(Boolean(canvas?.ready && canvas.scene?.id === scene.id), "the scene this test made is not the one being viewed");
      const tokenData = await victim.getTokenDocument({ x: 100, y: 100 });
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]);
      // WAIT FOR THE DRAW, NOT FOR THE OBJECT. Core makes the placeable at
      // once and builds its `targetArrows` only after `await loadTexture` in
      // `Token#_draw` (14.367), so a target set in between makes the layer's
      // ticker call `.clear()` on nothing - which a run of this batch ALONE
      // does every time, the ghoul's art not yet being in the browser's cache.
      for (let i = 0; i < 60 && !tokenDoc.object?.targetArrows; i++) await new Promise(r => setTimeout(r, 100));
      assert.ok(tokenDoc.object?.targetArrows, "the token never drew");
      tokenDoc.object.setTarget(true, { user: game.user, releaseOthers: true });
      await settle();
      assert.equal(game.user.targets.size, 1, "targeting did not take");

      const sheet = await openSheet(attacker);
      try {
        const el = sheet.element.querySelector('[data-action="rollAttack"]');
        assert.ok(el, "no Attack button on the NPC sheet");
        click(el);
        const dialog = await dialogFor(attacker);
        assert.ok(dialog, "the roll dialog did not open for an NPC");
        const form = dialog.element.querySelector("form");
        assert.equal(Number(form.elements.dc.value), victim.system.defense, "the DC is not the target's Defense");
        // The TARGETED TOKEN's name, which is what `targetSnapshots` has always
        // printed (`token.name ?? actor.name`). The bestiary's prototype token
        // carries the entry's own name, so renaming the actor above does not
        // rename the token; the test used to expect the actor's.
        assert.include(dialog.element.textContent, tokenDoc.name, "the target's name is not shown");
        const boon = form.elements["line-targetBlinded"];
        assert.ok(boon && boon.checked, "a Blinded target did not pre-check the attacker's Boon");
        await dialog.close();
        await gone(dialog);
      } finally {
        tokenDoc.object?.setTarget(false, { user: game.user, releaseOthers: true });
        await sheet.close();
      }
    });
  });
}
