/**
 * **FINISH CAST ON A STUCK CHAIN LIGHTNING RECORD** (D-2174). The review window's Finish cast,
 * pressed through the sheet's own control: a cast that posted its card and lost only its
 * bookkeeping is closed as `done` against that card, with no new card, no payment and no
 * refund, and the caster may cast again. A PAID cast whose arcs `castSpell` could not resolve
 * after its Test is resumed from the record its card carries: one new card with the damage
 * controls, its Apply landing once, the old card superseded, nothing paid. An unresolved card
 * with no record (older than 0.18.1) offers Mark reviewed alone.
 *
 * The stuck record is MADE ON PURPOSE (CLAUDE.md §15): a real cast runs to `done`, and its record
 * is then written back to `pending`, which is what a lost reply or a failed record write leaves.
 */
import { castWithDialog } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn } from "./fixtures.mjs";

const SCOPE = "azeroth-rpg", FLAG = "chainLightningCast";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

export function chainLightningFinishBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Chain Lightning's review: Finish cast closes a finished cast against its card (D-2174)", function () {
    let scene = null, wasViewing = null, caster = null, target = null, heldDialog = null;
    const token = {};

    const mana = () => caster.system.powers.find(p => p.name === "mana")?.value ?? null;
    const cardsFor = requestId => game.messages.filter(m => m.getFlag(SCOPE, "chainLightningRequestId") === requestId);

    async function fillMana() {
      const pool = caster.system.powers.find(p => p.name === "mana");
      if (!pool || pool.value === pool.max) return;
      await caster.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      await until(() => mana() === pool.max, "the Mana filled");
    }

    /** Cast Chain Lightning at the target with a high die, through the GM's own door. */
    async function castAtTarget() {
      const spell = caster.items.find(i => i.name === "Chain Lightning");
      canvas.tokens.setTargets([token.target.id]);
      await fillMana();
      const unpin = pinDie(19);
      let card = null;
      try { card = await castWithDialog(caster, spell); } finally { unpin(); canvas.tokens.setTargets([]); }
      if (!card) throw new Error("Chain Lightning posted no card");
      made.push(card);
      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "done", "the cast record closed");
      return card;
    }

    /** What a lost reply leaves: the same request, `pending`, with no card named. */
    async function stuck() {
      const done = caster.getFlag(SCOPE, FLAG);
      const { messageId: _m, detailId: _d, ...rest } = done;
      const pending = { ...rest, stage: "pending" };
      // `setFlag` merges into an object already stored, so the old keys are taken off first.
      await caster.unsetFlag(SCOPE, FLAG);
      await caster.setFlag(SCOPE, FLAG, pending);
      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "pending" && !caster.getFlag(SCOPE, FLAG)?.messageId, "the record pending");
      return pending;
    }

    /** Press the banner's Review Chain Lightning control and answer the window it opens. */
    async function openReview() {
      const sheet = await openSheet(caster);
      const control = await until(() => sheet.element?.querySelector('[data-action="reviewChainLightningCast"]'), "the banner's review control");
      const before = new Set(foundry.applications.instances.keys());
      control.click();
      const dialog = await until(() => [...foundry.applications.instances.values()]
        .find(app => !before.has(app.id) && app.element?.querySelector?.("[data-chain-evidence]")), "the review window");
      await settle();
      return dialog;
    }

    function acknowledge(dialog) {
      const box = dialog.element.querySelector('input[name="acknowledged"]');
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }

    before(async function () {
      this.timeout(240000);
      heldDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      wasViewing = canvas.scene ?? null;
      scene = await Scene.create({ name: "ZZ Chain Lightning Finish", width: 2400, height: 1400, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene on the board", 30000);
      caster = await makeCharacter({ name: "ZZ Chain Finish Shaman", classes: [["Shaman", 5]], spells: ["Chain Lightning"] });
      target = await makeNpc("Plagued Ghoul");
      for (const [key, actor, x] of [["caster", caster, 500], ["target", target, 1300]]) {
        await actor.update({ "prototypeToken.actorLink": true });
        const [doc] = await scene.createEmbeddedDocuments("Token", [await tokenData(actor, { x, y: 600 })]);
        await until(() => tokenDrawn(canvas.tokens.get(doc.id)), `${actor.name}'s token drawn`);
        token[key] = doc;
      }
    });

    after(async function () {
      this.timeout(120000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.querySelector?.("[data-chain-evidence]")) await app.close();
      }
      await caster?.sheet?.close();
      if (heldDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, heldDialog);
      if (wasViewing && game.scenes.get(wasViewing.id)) await wasViewing.view();
      await cleanup();
    });

    it("Finish cast closes the record against the card, posts nothing, pays nothing, and the caster casts again", async function () {
      this.timeout(120000);
      const card = await castAtTarget();
      assert.isFalse(card.getFlag(SCOPE, "chainLightningRoute")?.unresolved, "the fixture cast did not resolve its arcs");
      const pending = await stuck();
      const manaBefore = mana(), healthBefore = caster.system.health.value, messagesBefore = game.messages.size;

      const dialog = await openReview();
      assert.isNotNull(dialog.element.querySelector('[data-action="finish"]'), "a finished cast offers no Finish cast");
      assert.isNull(dialog.element.querySelector('[data-action="review"]'), "Finish cast and Mark reviewed were both drawn");
      assert.equal(dialog.element.querySelector("[data-chain-evidence]").textContent.trim(),
        game.i18n.localize("AZEROTH.ChainLightning.Review.Evidence.Complete"));
      const finish = dialog.element.querySelector('[data-action="finish"]');
      assert.isTrue(finish.disabled, "Finish cast is live before the acknowledgement");
      acknowledge(dialog);
      assert.isFalse(finish.disabled, "the acknowledgement did not free Finish cast");
      finish.click();

      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "done", "the record done");
      const record = caster.getFlag(SCOPE, FLAG);
      assert.equal(record.requestId, pending.requestId);
      assert.equal(record.messageId, card.id, "the record does not name the cast's card");
      assert.equal(record.detailId, card.id);
      await settle();
      assert.lengthOf(cardsFor(pending.requestId), 1, "Finish cast posted a second card");
      assert.equal(game.messages.size, messagesBefore, "Finish cast posted a message for a card everyone can read");
      assert.equal(mana(), manaBefore, "Finish cast moved the Mana");
      assert.equal(caster.system.health.value, healthBefore, "Finish cast moved the Health");

      const again = await castAtTarget();
      assert.notEqual(again.id, card.id);
      assert.notEqual(caster.getFlag(SCOPE, FLAG).requestId, pending.requestId, "the next cast reused the finished request");
    });

    it("an unresolved card with no resume record offers Mark reviewed alone, and it pays nothing", async function () {
      this.timeout(120000);
      const card = await castAtTarget();
      // What a card older than the resume record left: unresolved, and nothing to resume from.
      await card.update({ [`flags.${SCOPE}.chainLightningRoute.unresolved`]: true });
      await until(() => card.getFlag(SCOPE, "chainLightningRoute")?.unresolved === true, "the card unresolved");
      const pending = await stuck();
      const manaBefore = mana(), messagesBefore = game.messages.size;

      const dialog = await openReview();
      assert.isNull(dialog.element.querySelector('[data-action="finish"]'), "an unresolved cast offered Finish cast");
      assert.equal(dialog.element.querySelector("[data-chain-evidence]").textContent.trim(),
        game.i18n.localize("AZEROTH.ChainLightning.Review.Evidence.NoRecord"));
      acknowledge(dialog);
      dialog.element.querySelector('[data-action="review"]').click();

      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "reviewed", "the record reviewed");
      assert.equal(caster.getFlag(SCOPE, FLAG).requestId, pending.requestId);
      await settle();
      assert.lengthOf(cardsFor(pending.requestId), 1, "Mark reviewed posted a card");
      assert.equal(game.messages.size, messagesBefore);
      assert.equal(mana(), manaBefore, "Mark reviewed moved the Mana");
    });

    /**
     * A REAL PAID CAST WHOSE ARCS FAIL AFTER THE TEST. The target walks out of the 60 feet between
     * the Casting Test and the route `castSpell` resolves after it: `offerElunesRegard` is asked at
     * exactly that point, so the caster's own instance holds a wrapper that moves the token first.
     */
    async function castUnresolved() {
      const spell = caster.items.find(i => i.name === "Chain Lightning");
      const home = { x: token.target.x, y: token.target.y };
      const own = caster.offerElunesRegard;
      caster.offerElunesRegard = async function (roll) {
        await token.target.move({ x: 2200, y: home.y, action: "displace" });
        await until(() => token.target.x === 2200, "the target out of range");
        return own?.call(caster, roll);
      };
      canvas.tokens.setTargets([token.target.id]);
      await fillMana();
      const unpin = pinDie(19);
      try { await castWithDialog(caster, spell); } finally { unpin(); canvas.tokens.setTargets([]); delete caster.offerElunesRegard; }
      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "pending", "the paid cast left pending");
      const requestId = caster.getFlag(SCOPE, FLAG).requestId;
      const card = await until(() => cardsFor(requestId)[0], "the unresolved card");
      made.push(card);
      await token.target.move({ x: home.x, y: home.y, action: "displace" });
      await until(() => token.target.x === home.x && token.target.y === home.y, "the target back in range");
      return card;
    }

    it("Finish cast resumes a paid unresolved cast: one card with damage controls, Apply once, the old card superseded, nothing paid", async function () {
      this.timeout(180000);
      const old = await castUnresolved();
      assert.isTrue(old.getFlag(SCOPE, "chainLightningRoute")?.unresolved, "the fixture's route resolved");
      const resume = old.getFlag(SCOPE, "chainLightningResume");
      assert.equal(resume?.version, 1, "the unresolved card carries no resume record");
      assert.deepEqual(resume.initial, [{ sceneId: scene.id, tokenId: token.target.id, actorId: target.id }]);
      assert.lengthOf(old.getFlag(SCOPE, "targets") ?? [], 0);
      assert.notInclude(old.content, 'data-action="applyDamage"', "the unresolved card offered damage");
      const pending = caster.getFlag(SCOPE, FLAG);
      const manaBefore = mana(), healthBefore = caster.system.health.value;

      const dialog = await openReview();
      assert.equal(dialog.element.querySelector("[data-chain-evidence]").textContent.trim(),
        game.i18n.localize("AZEROTH.ChainLightning.Review.Evidence.Resume"));
      const finish = dialog.element.querySelector('[data-action="finish"]');
      assert.isNotNull(finish, "a paid unresolved cast offers no Finish cast");
      acknowledge(dialog);
      finish.click();

      await until(() => caster.getFlag(SCOPE, FLAG)?.stage === "done", "the record done", 30000);
      const record = caster.getFlag(SCOPE, FLAG);
      assert.equal(record.requestId, pending.requestId);
      assert.equal(record.resumedFrom, old.id);
      const fresh = await until(() => game.messages.get(record.detailId), "the resumed card");
      made.push(fresh);
      assert.notEqual(fresh.id, old.id);
      assert.equal(record.messageId, fresh.id, "a card everyone can read needs no summary");
      await until(() => old.getFlag(SCOPE, "chainLightningSuperseded") === fresh.id, "the old card superseded");
      const live = cardsFor(pending.requestId).filter(m => !m.getFlag(SCOPE, "chainLightningSuperseded"));
      assert.lengthOf(live, 1, "the resume made more or fewer than one live card");
      assert.isFalse(fresh.getFlag(SCOPE, "chainLightningRoute").unresolved);
      assert.equal(fresh.getFlag(SCOPE, "chainLightningResumedFrom"), old.id);
      assert.isUndefined(fresh.getFlag(SCOPE, "chainLightningResume"));
      assert.equal(fresh.rolls[0].total, old.rolls[0].total, "the resume rolled again");
      assert.equal(fresh.getFlag(SCOPE, "cast"), old.getFlag(SCOPE, "cast"));
      const rows = fresh.getFlag(SCOPE, "targets");
      assert.isAtLeast(rows.length, 1);
      assert.equal(rows[0].tokenId, token.target.id, "the first arc is not the recorded target");
      const damage = fresh.getFlag(SCOPE, "damageByTarget")[0].damage;
      assert.isTrue(Number.isFinite(damage) && damage > 0, "the resumed card carries no damage");
      assert.equal(mana(), manaBefore, "Finish cast moved the Mana");
      assert.equal(caster.system.health.value, healthBefore, "Finish cast moved the Health");

      // The card's own Apply, once: the arc lands, and a second press of that row lands nothing.
      const apply = new DOMParser().parseFromString(fresh.content, "text/html").querySelector('[data-action="applyDamage"][data-target-index="0"]');
      assert.ok(apply, "the resumed card offers no Apply");
      const before = target.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, fresh);
      await until(() => target.system.health.value === Math.max(0, before - damage), "the first arc landing", 30000);
      await CARD_ACTIONS.applyDamage(apply, fresh);
      await settle();
      await new Promise(r => setTimeout(r, 500));
      assert.equal(target.system.health.value, Math.max(0, before - damage), "the Apply landed twice");

      const again = await castAtTarget();
      assert.notEqual(caster.getFlag(SCOPE, FLAG).requestId, pending.requestId, "the next cast reused the resumed request");
      assert.isFalse(again.getFlag(SCOPE, "chainLightningRoute").unresolved);
    });
  });
}
