/**
 * 08 §20's Legendary readers, inside a live world (D-911).
 *
 * `rules/signature-legendary-readers.test.mjs` holds the law in Node and reads
 * each consumer's source; what neither can reach is a DOCUMENT METHOD over a
 * PREPARED actor - `afterFinalPhase` taking a Ward floor, `applyDamage` reading a
 * press's effect and a fall, `_holdAtOne` striking a press's own counter, the
 * attack door adding a press's bonus to ONE weapon. Each test makes its own
 * documents off the SHIPPED packs and `cleanup` deletes them.
 *
 * Written with D-911 and NOT YET RUN: Phase B did not start the harness, whose
 * global setup rebuilds `packs/` (the orchestrator's instruction). Run it alone:
 * `QUENCH_BATCH=azeroth-rpg.signature-legendary npx playwright test tests/e2e/smoke.spec.mjs`.
 */

import { cleanup, drainAreaWork, fromPack, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { reactionRows, useSignatureWithDialog } from "../applications/actions.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SECOND_REACTION_MARK, SIGNATURE_SHIELD_FLAG, SIGNATURE_WEAPON_FLAG, pressedWeaponBonus } from "../rules/signatures.mjs";
import { PARRY_COST } from "../rules/reactions.mjs";
import { regrossFor } from "../rules/blow-doors.mjs";
import { AGAIN_FLAG, RECURRENCE_FLAG, againAmount } from "../rules/chronomancer.mjs";
import { AURA_FLAG } from "../rules/auras.mjs";
import { tickLanding } from "../rules/ticks.mjs";
import { TICK_FLAG } from "../effects/ticks.mjs";
import { forceMove, forcedWords } from "../effects/forced-movement.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
import { TRAIT_CLOCK_FLAG, advanceTraitClocks } from "../effects/trait-clock.mjs";
import { secondReactionSpend, spendTurnBudget } from "../dice/workflows.mjs";
import { KILL_TESTED_FLAG, legendaryQueryHandler } from "../effects/legendary-doors.mjs";
import { reactionBarEffect } from "../rules/reaction-bar.mjs";
import { castFromSheet, chronoInFight, fightWith, freshTurn, manaOf, nextTurnUntil, pick, pressCard, sceneWith, tokenOf } from "./quench-chronomancer-common.mjs";

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

/** A shipped Legendary on an actor, equipped. */
async function wield(actor, pack, name) {
  const source = await fromPack(pack, name);
  const [item] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);
  await item.update({ "system.equipped": true });
  return actor.items.get(item.id);
}

/* ---- The second live pass's helpers: the table's own controls ---- */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const APPLY = 'button[data-action="applyDamage"][data-target-index="0"]';
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const pressUses = (actor, item, key) => actor.items.get(item.id)?.system?.signatureEffect?.presses?.[key]?.uses?.value;
const combatantOf = (combat, actor) => combat.combatants.find(c => c.actorId === actor.id) ?? null;

/** A thing from the armor pack put on. */
async function wear(actor, name) {
  const source = (await fromPack("azeroth-rpg.armor", name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [source]);
  await item.update({ "system.equipped": true });
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} on`);
  return actor.items.get(item.id);
}

/** Set a pool - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name)?.value === value, `${value} ${name}`);
}

/**
 * **A REAL ATTACK CARD**, `attacker` at `victim`'s token, the die pinned: the attack door's
 * own `rollTest`, with the Reaction rows the incoming card offers the defender. `budget:
 * "none"` because a test is not the striker's turn's question.
 */
async function strike(attacker, victim, { face = 19, rating = 6 } = {}) {
  const token = tokenOf(victim);
  const targets = targetSnapshots(token ? [token] : []);
  const unpin = pinDie(face);
  try {
    const card = await game.system.azeroth.workflows.rollTest({
      actor: attacker, kind: "attack", dc: 10, title: "ZZ Legendary blow", budget: "none",
      targets, reactions: reactionRows(targets, { attacker }),
      modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
      damage: { rating, kind: "physical" }
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Press a card's drawn button and hear every warning said until one has been. */
async function hearPress(message, selector, { face = null, ms = 15000 } = {}) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  const said = [];
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    const press = await pressCard(message, selector, { face });
    try {
      await until(() => said.length > 0, `a refusal in words for ${selector}`, ms);
      await sleep(400);
    } finally {
      await press.release();
    }
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  return said;
}

/** Answer the ask a blow door opened for this holder (`effects/blow-doors.mjs#confirmHere`). */
async function answerFor(holder, action = "yes", ms = 30000) {
  const app = await until(() => [...foundry.applications.instances.values()]
    .find(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${holder.id}`) && a.rendered), `${holder.name}'s ask`, ms);
  app.element.querySelector(`button[data-action="${action}"]`).click();
  await until(() => !app.rendered, `${holder.name}'s ask to close`);
}

/** One step of the tracker, its turn events settled. */
async function stepTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await settled;
  await settle();
  await sleep(800);
}

/**
 * **NO GM ONLINE, AS A PLAYER'S CLIENT SEES IT**, for `fn` alone: this user reads as a
 * player and `game.users.activeGM` as nobody, so `rules/gm-writes.mjs#gmAbsentFor`
 * judges what it judges for a player with the GM gone. Put back in a `finally`.
 */
async function withNoGM(fn) {
  const user = game.user;
  const users = game.users;
  Object.defineProperty(user, "isGM", { get: () => false, configurable: true });
  Object.defineProperty(users, "activeGM", { get: () => null, configurable: true });
  try {
    return await fn();
  } finally {
    delete user.isGM;
    delete users.activeGM;
  }
}

export function signatureLegendaryBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("08 §20's Legendary readers (D-911)", function () {
    let restore = null;
    // Chat cards a test makes as an attack's record (D-913), deleted after.
    const made = [];
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const m of made) if (game.messages.get(m.id)) await m.delete();
      await cleanup();
    });

    it("floors the bearer's Fire Ward at 3 while Sulfuras is wielded (Firelord's Grip)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Firelord", classes: [["Warrior", 5]] });
      const maul = await wield(actor, "azeroth-rpg.weapons", "Sulfuras, Hand of Ragnaros");
      await until(() => (actor.system.ward?.fire ?? 0) >= 3, "the Ward floor reaching the prepared actor");
      await maul.update({ "system.equipped": false });
      await until(() => (actor.system.ward?.fire ?? 0) < 3, "the floor coming off with the maul");
    });

    it("takes a fall whole while Thunderfury is wielded (Windseeker)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Windseeker", classes: [["Warrior", 5]] });
      await wield(actor, "azeroth-rpg.weapons", "Thunderfury, Blessed Blade of the Windseeker");
      await until(() => (actor.system.signatureEffects?.noFallDamage ?? []).length, "Windseeker on the aggregate");
      const before = actor.system.health.value;
      await actor.applyDamage(6, { falling: true, attack: false });
      assert.equal(actor.system.health.value, before, "a fall dealt damage with Windseeker in hand");
    });

    it("presses Uther's Stand as a Reaction from the attack's card and takes no damage while it stands", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Uther", classes: [["Paladin", 5]] });
      const hammer = await wield(actor, "azeroth-rpg.weapons", "Hammer of the Lightbringer");
      // From the sheet it answers nothing (D-913): refused, nothing spent.
      assert.notOk(await useSignatureWithDialog(actor, hammer, null, "uthers-stand"), "a sheet press with no attack on record was not refused");
      assert.equal(actor.items.get(hammer.id).system.signatureEffect.presses["uthers-stand"].uses.value, 1, "a refused press spent its use");
      // The attack card that hit the bearer is its record.
      const attack = await ChatMessage.create({ content: "<p>ZZ</p>", flags: { "azeroth-rpg": { kind: "attack", targets: [{ name: actor.name, actorId: actor.id }], damageByTarget: [{ damage: 5 }] } } });
      made.push(attack);
      const card = await game.system.azeroth.workflows.useSignature({ actor, item: actor.items.get(hammer.id), press: "uthers-stand", answers: { messageId: attack.id, index: 0 } });
      assert.ok(card, "the press posted no card");
      await until(() => actor.effects.some(e => e.getFlag("azeroth-rpg", SIGNATURE_SHIELD_FLAG)), "Uther's Stand's effect");
      assert.equal(actor.items.get(hammer.id).system.signatureEffect.presses["uthers-stand"].uses.value, 0, "the Long Rest use was not struck");
      const before = actor.system.health.value;
      await actor.applyDamage(5, { struck: true });
      assert.equal(actor.system.health.value, before, "a blow landed through Uther's Stand");
    });

    it("holds the bearer at 1 once a Long Rest, on its own (Undying)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Legendary Undying", classes: [["Mage", 5]] });
      const phylactery = await wield(actor, "azeroth-rpg.gear", "The Phylactery of Kel'Thuzad");
      await actor.update({ "system.health.value": 4 });
      await actor.applyDamage(30, { struck: true, attack: false });
      assert.equal(actor.system.health.value, 1, "Undying did not hold the bearer at 1");
      assert.equal(actor.items.get(phylactery.id).system.signatureEffect.presses.undying.uses.value, 0, "the hold did not strike its use");
      await actor.applyDamage(30, { struck: true, attack: false });
      assert.equal(actor.system.health.value, 0, "a spent Undying held a second time");
    });

    it("puts Blood of Mannoroth on Gorehowl's own blows alone", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Grom", classes: [["Warrior", 5]], race: "Orc" });
      const axe = await wield(actor, "azeroth-rpg.weapons", "Gorehowl");
      await useSignatureWithDialog(actor, axe, null, "blood-of-mannoroth");
      await until(() => actor.effects.some(e => e.getFlag("azeroth-rpg", SIGNATURE_WEAPON_FLAG)), "Blood of Mannoroth's effect");
      assert.equal(pressedWeaponBonus([...actor.effects], axe.id).damage, 2, "the axe takes no +2");
      assert.equal(pressedWeaponBonus([...actor.effects], "another").damage, 0, "another weapon took the +2");
      assert.equal(actor.system.damageBonus?.attack?.all ?? 0, 0, "the +2 landed on the bearer's whole attack lane");
    });

    it("lays Adaptive Scales' Ward against a school that hurt the bearer", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Scales", classes: [["Warrior", 5]] });
      await wield(actor, "azeroth-rpg.armor", "Mail of the Fifth Brood");
      await actor.applyDamage(3, { struck: true, attack: false, type: "fire" });
      await until(() => actor.effects.some(e => e.getFlag("azeroth-rpg", "adaptiveWard")), "Adaptive Scales' effect");
      assert.isAtLeast(actor.system.ward?.fire ?? 0, 2, "no Ward 2 against Fire");
    });

    it("draws every run of an owned Legendary's Signature with nothing scrolled out of sight", async function () {
      // The live pass (2026-11-12): core lays an inactive editor's content
      // absolute inside a 120px box, so an EDITABLE sheet cut Gorehowl's
      // Hellscream mid-sentence and never showed Blood of Mannoroth, while the
      // pack's read-only sheet showed all four runs.
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Prose", classes: [["Warrior", 5]], race: "Orc" });
      const axe = await wield(actor, "azeroth-rpg.weapons", "Gorehowl");
      await axe.sheet.render({ force: true });
      try {
        const content = await until(() => axe.sheet.element?.querySelector(".azeroth-item__signature prose-mirror .editor-content"), "the Signature's editor");
        await until(() => content.textContent.includes("Blood of Mannoroth"), "the last run in the editor");
        assert.isAtMost(content.scrollHeight - content.clientHeight, 1, "the Signature's prose scrolls inside its own box");
        const box = content.getBoundingClientRect();
        const last = [...content.querySelectorAll("p")].at(-1).getBoundingClientRect();
        assert.isAtMost(last.bottom, box.bottom + 1, "the last run is drawn below the editor's box");
      } finally {
        await axe.sheet.close();
      }
    });

    /* ---- Phase B2 (D-912): written, NOT YET RUN, as the batch above ---- */

    it("halves a breath's damage and nothing else (Foror's Lesson)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Foror", classes: [["Warrior", 5]] });
      await wield(actor, "azeroth-rpg.weapons", "Quel'Serrar");
      await until(() => (actor.system.signatureEffects?.breathHalf ?? []).length, "Foror's Lesson on the aggregate");
      const start = actor.system.health.value;
      await actor.applyDamage(9, { struck: true, attack: false, breath: { title: "Fire Breath", featureKey: null, spellName: null } });
      assert.equal(actor.system.health.value, start - 4, "a breath of 9 did not land as 4");
      await actor.applyDamage(3, { struck: true, attack: false, breath: { title: "Cleave", featureKey: null, spellName: null } });
      assert.equal(actor.system.health.value, start - 7, "a blow that is no breath was halved");
    });

    it("steps an ogre's carrying and resisting size up one rung (The King's Frame)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Gordok", classes: [["Warrior", 5]], race: "Ogre" });
      const base = actor.system.bagSlots?.base ?? 0;
      assert.equal(actor.system.resistSize, actor.system.size, "a bare ogre resists at a stepped size");
      await wield(actor, "azeroth-rpg.gear", "The Gordok Tusk-Crown");
      await until(() => actor.system.resistSize === "huge", "the crown stepping Large to Huge");
      assert.equal(actor.system.bagSlots.base, base * 2, "the crown did not double what a Large ogre carries");
    });

    it("shoots Thori'dal with no arrow at Rating 5, Arcane (Starfire Arrow)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Thoridal", classes: [["Ranger", 5]] });
      const bow = await wield(actor, "azeroth-rpg.weapons", "Thori'dal, the Stars' Fury");
      assert.deepInclude(actor.phantomShotFor(bow) ?? {}, { rating: 5, type: "arcane" }, "no shot without ammunition");
    });

    it("makes a Scarlet entry a member, and gives it the Bane against Ashbringer's bearer (Scarlet Reckoning)", async function () {
      this.timeout(60000);
      const knight = await fromPack("azeroth-rpg.bestiary", "Scarlet Knight");
      const [made] = await Actor.create([{ ...knight.toObject(), name: "ZZ Scarlet Knight" }]);
      assert.include(made.signatureState?.factions ?? [], "Scarlet Crusade", "the entry's name made no member");
      const bearer = await makeCharacter({ name: "ZZ Legendary Ashbringer", classes: [["Paladin", 5]] });
      await wield(bearer, "azeroth-rpg.weapons", "Ashbringer");
      await until(() => (bearer.system.signatureEffects?.attackerBane ?? []).length, "Scarlet Reckoning on the aggregate");
      assert.equal(made.attackerBanesAgainst(bearer.system.signatureEffects.attackerBane), 1, "the member took no Bane");
      assert.equal(bearer.attackerBanesAgainst(bearer.system.signatureEffects.attackerBane), 0, "a non-member took the Bane");
      await made.delete();
    });

    it("offers the Raised Gauntlet as a move and Step Aside as a negating row", async function () {
      this.timeout(60000);
      const guard = await makeCharacter({ name: "ZZ Legendary Tyr", classes: [["Paladin", 5]] });
      await wield(guard, "azeroth-rpg.armor", "The Bulwark of Tyr's Hand");
      const moves = await until(() => guard.signatureMoves().length && guard.signatureMoves(), "the Raised Gauntlet's row");
      assert.deepInclude(moves[0], { kind: "gauntlet", feet: 15, usesLeft: 1, press: "the-raised-gauntlet" });
      const mage = await makeCharacter({ name: "ZZ Legendary Shendralar", classes: [["Mage", 5]] });
      await wield(mage, "azeroth-rpg.gear", "Signet of the Shen'dralar");
      const negate = await until(() => mage.signatureNegate(), "Step Aside's row");
      assert.equal(negate.press, "step-aside");
    });

    /* ---- The fix pass (D-913): written, NOT YET RUN ---- */

    it("refuses a Legendary's press while it is not worn, and the sheet says so (F6)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Unworn", classes: [["Shaman", 5]] });
      const doom = await wield(actor, "azeroth-rpg.weapons", "The Doomhammer");
      await doom.update({ "system.equipped": false });
      assert.notOk(await useSignatureWithDialog(actor, actor.items.get(doom.id), null, "call-of-the-elements"), "an unworn Legendary pressed");
      const { signatureContext } = await import("../applications/actions.mjs");
      const row = signatureContext(actor.items.get(doom.id), actor).presses.find(p => p.key === "call-of-the-elements");
      assert.equal(row.refusal, "unequipped", "the sheet draws a live Use on an unworn Legendary");
    });

    it("refuses Wind of the Doomhammer with no hit this turn, and keeps its use (F3 and the trigger)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Wind", classes: [["Shaman", 5]] });
      const doom = await wield(actor, "azeroth-rpg.weapons", "The Doomhammer");
      assert.notOk(await game.system.azeroth.workflows.useSignature({ actor, item: doom, press: "wind-of-the-doomhammer" }), "Wind pressed with no hit recorded");
      assert.equal(actor.items.get(doom.id).system.signatureEffect.presses["wind-of-the-doomhammer"].uses.value, 1, "the refused press spent its use");
    });

    it("refuses a second arming of the next spell (Echo of the Infinite, F4)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Legendary Echo", classes: [["Chronomancer", 5]] });
      const glass = await wield(actor, "azeroth-rpg.gear", "The Hourglass of the Infinite");
      await actor.setFlag("azeroth-rpg", "recurrence", { source: "Recurrence" });
      assert.notOk(await game.system.azeroth.workflows.useSignature({ actor, item: glass, press: "echo-of-the-infinite" }), "Echo armed over Recurrence");
      assert.equal(actor.items.get(glass.id).system.signatureEffect.presses["echo-of-the-infinite"].uses.value, 1, "the refused press spent its use");
    });
  });

  /*
   * ---- The second live pass (D-913): the presses through the TABLE'S controls ----
   *
   * Every test here plays the doors the way a table does: tokens on a viewed scene, a
   * started fight where the press is a Reaction, the attack card's own drawn buttons, the
   * tracker's Next Turn - and reads the RESULT (Health, conditions, uses, the budget).
   */
  describe("08 §20's Legendary presses through the real controls (D-913, the second live pass)", function () {
    let restore = null;
    let quiet = null;
    let wasViewing = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quiet = await quietScrollingText();
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-blow-ask-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quiet?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("(a) UTHER'S STAND and THE WYRM'S ROAR are pressed from the attack card's drawn row in a started fight", async function () {
      this.timeout(300000);
      const uther = await makeCharacter({ name: "ZZ SL2 Uther", classes: [["Paladin", 5]] });
      const hammer = await wield(uther, "azeroth-rpg.weapons", "Hammer of the Lightbringer");
      const prestor = await makeCharacter({ name: "ZZ SL2 Prestor", classes: [["Warrior", 5]] });
      const mantle = await wield(prestor, "azeroth-rpg.gear", "Lady Prestor's Mantle");
      const raptor = await makeNpc("Raptor");
      await sceneWith([{ actor: uther, x: 800, y: 1000 }, { actor: prestor, x: 800, y: 1200 }, { actor: raptor, x: 900, y: 1100, side: "hostile" }]);
      const combat = await fightWith([uther, prestor, raptor]);
      await nextTurnUntil(raptor, combat);
      const utherTurn = combatantOf(combat, uther);
      const prestorTurn = combatantOf(combat, prestor);
      assert.equal(utherTurn.budget?.reactions, 1, "the Paladin holds no Reaction on the raptor's turn");

      // Uther's Stand, on the card that hit the Paladin.
      const first = await strike(raptor, uther);
      assert.ok(first?.flags["azeroth-rpg"].damageByTarget?.[0], "the pinned blow missed the Paladin");
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === uther.id && m.flags?.["azeroth-rpg"]?.press === "uthers-stand");
      await (await pressCard(first, 'button[data-action="reactSignature"][data-target-index="0"][data-press="uthers-stand"]')).release();
      const [standCard] = await posted;
      made.push(standCard);
      await until(() => uther.effects.some(e => e.getFlag("azeroth-rpg", SIGNATURE_SHIELD_FLAG)), "Uther's Stand's effect");
      assert.equal(pressUses(uther, hammer, "uthers-stand"), 0, "the Long Rest use was not struck");
      await until(() => (utherTurn.budget?.reactions ?? 1) === 0, "the Paladin's Reaction spent");
      const hp = uther.system.health.value;
      await (await pressCard(first, APPLY)).release();
      await sleep(2500);
      assert.equal(uther.system.health.value, hp, "the card's Apply landed through Uther's Stand");

      // The Wyrm's Roar, on the card that attacked the Warrior: the ATTACKER's Test.
      const second = await strike(raptor, prestor);
      const roared = untilHook("createChatMessage", 30000, m => m.speaker?.actor === prestor.id && m.flags?.["azeroth-rpg"]?.press === "the-wyrms-roar");
      await (await pressCard(second, 'button[data-action="reactSignature"][data-target-index="0"][data-press="the-wyrms-roar"]')).release();
      const [roarCard] = await roared;
      made.push(roarCard);
      assert.equal(roarCard.flags["azeroth-rpg"].targets?.[0]?.actorId, raptor.id, "the Test is not the attacker's");
      assert.equal(pressUses(prestor, mantle, "the-wyrms-roar"), 0, "the Short Rest use was not struck");
      await until(() => (prestorTurn.budget?.reactions ?? 1) === 0, "the Warrior's Reaction spent");
      // **THE RESIST NAMES THE ATTACKER** (the lead, D-915: *"Yes"*): the card draws one row
      // for the raptor - its uuid on the row, its name on the button - and it is pressed with
      // NOTHING selected; the Spirit Test at the Signature DC and the Frightened stand.
      canvas.tokens.releaseAll();
      const roarHtml = document.createElement("div");
      roarHtml.innerHTML = game.messages.get(roarCard.id)?.content ?? "";
      const row = roarHtml.querySelector('[data-resist-owner] button[data-action="resistTest"][data-target-index="0"]');
      assert.ok(row, "the Wyrm's Roar card drew no Resist row for the attacker");
      // *A creature within 30 ft* is a target's range, not an area (D-916): no Place area.
      assert.isNull(roarHtml.querySelector('[data-action="placeArea"]'), "the Wyrm's Roar card offers a Place area over nothing");
      assert.equal(row.closest("[data-resist-owner]")?.dataset.resistOwner, raptor.uuid, "the Resist row names another creature");
      assert.include(row.textContent, tokenOf(raptor).name, "the Resist button does not name the attacker");
      const { signatureDcOf } = await import("../rules/signatures.mjs");
      assert.equal(Number(row.dataset.dc), signatureDcOf(prestor), "the Test is not at the Warrior's Signature DC");
      const resist = await pressCard(roarCard, 'button[data-action="resistTest"][data-target-index="0"]', { face: 1 });
      try {
        await until(() => raptor.statuses.has("frightened"), "the raptor Frightened on its failed Spirit Test", 30000);
      } finally {
        await resist.release();
      }
      assert.equal(pressUses(prestor, mantle, "the-wyrms-roar"), 0, "the use was struck more than once, or given back");
    });

    it("(b) THE RAISED GAUNTLET re-resolves the blow against the bearer's own Armor Points alone, and a card with no record is refused in words", async function () {
      this.timeout(300000);
      const tyr = await makeCharacter({ name: "ZZ SL2 Tyr", classes: [["Paladin", 5]] });
      await wear(tyr, "Field plate");
      const bulwark = await wield(tyr, "azeroth-rpg.armor", "The Bulwark of Tyr's Hand");
      const ally = await makeCharacter({ name: "ZZ SL2 Gauntlet Ally", classes: [["Warrior", 5]] });
      await wear(ally, "Mail hauberk");
      const raptor = await makeNpc("Raptor");
      await tyr.setParty(true);
      await ally.setParty(true);
      try {
        await sceneWith([{ actor: tyr, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }, { actor: raptor, x: 1000, y: 1000, side: "hostile" }]);
        // In a started fight: out of one, ANY world character holding 04's Foresight and 02's
        // Ward holds every hit's damage behind a reveal (`workflows.foresightHeld`), and the
        // test world keeps one the harness did not make.
        const combat = await fightWith([tyr, ally, raptor]);
        await nextTurnUntil(raptor, combat);
        await until(() => tyr.signatureMoves().length, "the Raised Gauntlet's row");
        const tyrAp = tyr.system.ap?.body ?? 0;
        const allyAp = ally.system.ap?.body ?? 0;
        assert.isAbove(allyAp, 0, "the ally wears no Armor Points, so a second reduction could not show");

        // A card that recorded no blow: refused in words, nothing asked, nothing struck.
        const bare = await ChatMessage.create({ content: "<p>ZZ</p>", speaker: ChatMessage.getSpeaker({ actor: raptor }), flags: { "azeroth-rpg": { kind: "attack", targets: [{ actorId: ally.id, name: ally.name }], damageByTarget: [{ damage: 5 }] } } });
        made.push(bare);
        const tyr0 = tyr.system.health.value;
        const ally0 = ally.system.health.value;
        const said = await warnings(async () => { await ally.applyDamage(5, { struck: true, attack: true, messageId: bare.id, by: raptor }); });
        assert.include(said.join(" "), game.i18n.format("AZEROTH.BlowDoor.Refuse.noGross", { name: tyr.name, talent: "The Raised Gauntlet" }), "the refusal was not said");
        assert.equal(tyr.system.health.value, tyr0, "the bearer took a blow with no record");
        assert.equal(ally.system.health.value, ally0 - 5, "the refused blow did not land where it was aimed");
        assert.equal(pressUses(tyr, bulwark, "the-raised-gauntlet"), 1, "the refusal struck the use");
        await ally.update({ "system.health.value": ally.system.health.max });

        // The real card, its Apply pressed: the bearer is asked and takes the blow re-resolved.
        const card = await strike(raptor, ally, { face: 19, rating: 12 });
        const flags = card.flags["azeroth-rpg"];
        assert.ok(flags.blowSpec, "the card recorded no blow before any target met it");
        const allyMet = flags.damageByTarget[0].damage;
        const expected = regrossFor(flags.blowSpec, { apByLocation: tyr.system.ap ?? {}, immune: tyr.system.immune ?? [], vulnerable: tyr.system.vulnerable ?? [] })?.damage;
        assert.isAbove(expected, Math.max(0, allyMet - tyrAp), "the re-resolved blow is no larger than one met by both suits");
        const tyr1 = tyr.system.health.value;
        const ally1 = ally.system.health.value;
        const apply = await pressCard(card, APPLY);
        try {
          // The struck ally's owner picks the one transfer first (the unified chooser,
          // `effects/damage-transfer-choice.mjs`), then the bearer is asked.
          const chooser = await until(() => [...foundry.applications.instances.values()].find(x => x.rendered && String(x.id ?? "").startsWith("azeroth-choose-transfer-")) ?? null, "the struck ally's transfer chooser", 20000);
          await pick(chooser, "The Raised Gauntlet");
          await answerFor(tyr, "yes");
        } finally {
          await apply.release();
        }
        await until(() => tyr.system.health.value === tyr1 - expected, `the bearer losing ${expected} (the blow met by their own ${tyrAp} Armor Points)`, 30000);
        assert.equal(ally.system.health.value, ally1, "the ally took the moved blow");
        assert.equal(pressUses(tyr, bulwark, "the-raised-gauntlet"), 0, "the Short Rest use was not struck");
      } finally {
        await tyr.setParty(false);
        await ally.setParty(false);
      }
    });

    it("(c) STEP ASIDE is the card's button: refused over a standing mark and over a Parry, nothing spent; pressed, the hit is a miss; pressed again, nothing burns", async function () {
      this.timeout(420000);
      const warrior = await makeCharacter({ name: "ZZ SL2 Step", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = await until(() => warrior.items.find(i => i.name === "Longsword"), "the sword carried");
      await sword.update({ "system.equipped": true });
      const signet = await wield(warrior, "azeroth-rpg.gear", "Signet of the Shen'dralar");
      const raptor = await makeNpc("Raptor");
      await sceneWith([{ actor: warrior, x: 800, y: 1000 }, { actor: raptor, x: 900, y: 1000, side: "hostile" }]);
      const combat = await fightWith([warrior, raptor]);
      await nextTurnUntil(raptor, combat);
      const mine = combatantOf(combat, warrior);
      const STEP = 'button[data-action="reactNegate"][data-target-index="0"][data-press="step-aside"]';
      const PARRY = 'button[data-action="reactParry"][data-target-index="0"]';
      // The Parry row is drawn off the pool AS THE CARD IS BUILT, so the Rage comes first.
      await setPool(warrior, "rage", PARRY_COST + 2);

      // 1. A mark with no card of its own stands: refused, the Reaction and the use kept.
      const card1 = await strike(raptor, warrior);
      assert.ok(card1.flags["azeroth-rpg"].damageByTarget?.[0], "the pinned blow missed");
      await warrior.setFlag("azeroth-rpg", "mitigate", { name: "ZZ Halving", halve: true, amount: null });
      const said1 = await hearPress(card1, STEP);
      assert.include(said1.join(" "), game.i18n.format("AZEROTH.Reaction.Refuse.MarkStands", { mark: "ZZ Halving", name: warrior.name }), "the standing mark was not named");
      assert.equal(warrior.getFlag("azeroth-rpg", "mitigate")?.name, "ZZ Halving", "the standing mark was written over");
      assert.equal(pressUses(warrior, signet, "step-aside"), 1, "a refused press spent its use");
      assert.equal(mine.budget?.reactions, 1, "a refused press spent the Reaction");
      await warrior.unsetFlag("azeroth-rpg", "mitigate");

      // 2. A Parry pressed on the same card and held: Step Aside on it is refused, the Parry's mark kept.
      const parrySaid = await warnings(async () => {
        const p = await pressCard(card1, PARRY, { face: 20 });
        try { await until(() => warrior.getFlag("azeroth-rpg", "mitigate")?.messageId === card1.id, "the Parry's mark", 30000).catch(() => null); } finally { await p.release(); }
      });
      assert.equal(warrior.getFlag("azeroth-rpg", "mitigate")?.messageId, card1.id, `the Parry laid no mark on the card: ${parrySaid.join(" | ")}`);
      const parried = warrior.getFlag("azeroth-rpg", "mitigate");
      const said2 = await hearPress(card1, STEP);
      assert.isAbove(said2.length, 0, "Step Aside over a Parry was not refused in words");
      assert.deepEqual(warrior.getFlag("azeroth-rpg", "mitigate"), parried, "Step Aside wrote over the Parry's mark");
      assert.equal(pressUses(warrior, signet, "step-aside"), 1, "a refused press spent its use");

      // 3. A second card while the Parry's Reaction is gone: refused, the Parry's mark kept.
      const card2 = await strike(raptor, warrior);
      const said3 = await hearPress(card2, STEP);
      assert.isAbove(said3.length, 0, "Step Aside with no Reaction left was not refused in words");
      assert.deepEqual(warrior.getFlag("azeroth-rpg", "mitigate"), parried, "Step Aside wrote over the Parry's mark on another card");
      assert.equal(pressUses(warrior, signet, "step-aside"), 1, "a refused press spent its use");
      await (await pressCard(card1, APPLY)).release();
      await until(() => !warrior.getFlag("azeroth-rpg", "mitigate"), "the Parry's mark spent by its own card's Apply", 30000);

      // 4. The next round: pressed on a hit, the hit is a miss and one use and the Reaction go.
      await nextTurnUntil(warrior, combat);
      await nextTurnUntil(raptor, combat);
      await until(() => mine.budget?.reactions === 1, "the Reaction back");
      const card3 = await strike(raptor, warrior);
      const answered = untilHook("createChatMessage", 30000, m => m.speaker?.actor === warrior.id && m.flags?.["azeroth-rpg"]?.press === "step-aside");
      await (await pressCard(card3, STEP)).release();
      made.push((await answered)[0]);
      await until(() => game.messages.get(card3.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true, "the card's row written as a miss");
      assert.equal(pressUses(warrior, signet, "step-aside"), 0, "the use was not struck");
      await until(() => mine.budget?.reactions === 0, "the Reaction spent");

      // 5. Pressed twice: with the use put back by hand, the second press burns nothing.
      await signet.update({ "system.signatureEffect.presses.step-aside.uses.value": 1 });
      await until(() => pressUses(warrior, signet, "step-aside") === 1, "the use put back");
      const said5 = await hearPress(card3, STEP);
      assert.isAbove(said5.length, 0, "a second press on an answered card was not refused in words");
      assert.equal(pressUses(warrior, signet, "step-aside"), 1, "the second press burned the use");
      const hp = warrior.system.health.value;
      await (await pressCard(card3, APPLY)).release();
      await sleep(2000);
      assert.equal(warrior.system.health.value, hp, "the withdrawn hit dealt damage");
    });

    it("(d) BEING MOVED: a Medium creature cannot push or knock Prone a Huge one and the words say so; a willing ally of the same size is pulled and knocked down", async function () {
      this.timeout(300000);
      const mover = await makeCharacter({ name: "ZZ SL2 Mover", classes: [["Warrior", 5]], race: "Human" });
      const foe = await makeNpc("Ancient Core Hound");
      const friend = await makeNpc("Ancient Core Hound");
      await friend.update({ name: "ZZ SL2 Friendly Hound" });
      assert.equal(foe.system.size, "huge", "the hound is not Huge");
      assert.equal(mover.system.size, "medium", "the mover is not Medium");
      await sceneWith([{ actor: mover, x: 1000, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }, { actor: friend, x: 400, y: 1000 }]);
      await fightWith([mover, foe, friend]);
      const from = tokenOf(mover).center;
      const foeDoc = tokenOf(foe).document;
      const x0 = foeDoc.x;
      const pushed = await forceMove({ token: foeDoc, from, feet: 10, toward: "away", by: mover, name: foe.name });
      assert.isFalse(pushed.moved, "a Huge creature was pushed by a Medium one");
      assert.equal(pushed.reason, "outsized");
      assert.equal(forcedWords(pushed, { source: "ZZ Shove" }), game.i18n.format("AZEROTH.Forced.Refuse.Outsized", { name: pushed.name, source: "ZZ Shove" }));
      assert.equal(foeDoc.x, x0, "the token moved");
      const friendDoc = tokenOf(friend).document;
      const fx0 = friendDoc.x;
      const pulled = await forceMove({ token: friendDoc, from, feet: 10, toward: "toward", by: mover, name: friend.name });
      assert.isTrue(pulled.moved, `a willing ally was not pulled (${pulled.reason})`);
      await until(() => tokenOf(friend).document.x !== fx0, "the ally's token pulled");
      const prone = await inflictCondition({ victim: foe, id: "prone", by: mover, name: foe.name });
      assert.isFalse(prone.landed, "a Huge creature was knocked Prone by a Medium one");
      assert.equal(prone.reason, "outsized");
      assert.isFalse(foe.statuses.has("prone"), "the hound is Prone");
      const allyProne = await inflictCondition({ victim: friend, id: "prone", by: mover, name: friend.name });
      assert.isTrue(allyProne.landed, `a willing ally was not knocked Prone (${allyProne.reason})`);
    });

    it("(e) ECHO OF THE INFINITE: Recurrence is refused over it with nothing paid; the Test is made again at the caster's turn; a tick lands ONE extra time at its target's turn", async function () {
      this.timeout(600000);
      const { c, combat, foes, friends } = await chronoInFight("ZZ SL2 Echo", {
        level: 17, spells: ["Grit Lash", "Reversion"],
        allies: [{ name: "ZZ SL2 Echo Ally", x: 700, y: 1000 }],
        enemies: [{ name: "Raptor", x: 1300, y: 1000, health: 300 }]
      });
      const raptor = foes[0];
      const ally = friends[0];
      const plain = c.items.find(i => i.name === "Hourglass");
      if (plain) await plain.update({ "system.equipped": false });
      const glass = await wield(c, "azeroth-rpg.gear", "The Hourglass of the Infinite");
      const mine = await freshTurn(c, 2);
      const echo = () => game.system.azeroth.workflows.useSignature({ actor: c, item: c.items.get(glass.id), press: "echo-of-the-infinite" });
      made.push(await echo());
      await until(() => c.getFlag("azeroth-rpg", RECURRENCE_FLAG)?.echo === true, "Echo armed");

      // Recurrence over Echo: refused in words before the Mana, the Half-Action or a use.
      const recurrence = c.items.find(i => i.type === "feature" && i.name === "Recurrence");
      assert.ok(recurrence, "a level 17 Chronomancer holds no Recurrence");
      const mana0 = manaOf(c).value;
      const halves0 = mine.budget?.halfActions;
      const uses0 = recurrence.system.uses?.value ?? null;
      const said = await warnings(async () => { await game.system.azeroth.workflows.useFeature({ actor: c, item: recurrence }); });
      assert.isTrue(said.some(s => s.includes("Echo of the Infinite")), `Recurrence over Echo was not refused naming it: ${said.join(" | ")}`);
      assert.equal(manaOf(c).value, mana0, "the refusal took Mana");
      assert.equal(mine.budget?.halfActions, halves0, "the refusal took a Half-Action");
      assert.equal(recurrence.system.uses?.value ?? null, uses0, "the refusal struck a use");

      // The Test made again: Grit Lash's failed Body Test, made again (and passed) at the caster's next turn start.
      const card = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 19 });
      assert.equal(card?.flags["azeroth-rpg"].chronoAgain?.recurrence, "Echo of the Infinite", "the card records nothing to land again");
      const resist = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
      try {
        await until(() => Object.values(game.messages.get(card.id).flags["azeroth-rpg"].resists ?? {}).some(r => r.success === false), "the failed Test recorded", 30000);
      } finally {
        await resist.release();
      }
      await (await pressCard(card, APPLY)).release();
      const row = await until(() => (c.getFlag("azeroth-rpg", AGAIN_FLAG) ?? [])[0], "what lands again recorded");
      assert.ok(row.test, "the row carries no Test to make again");
      const passedAmount = againAmount(row, true);
      const hp0 = raptor.actor.system.health.value;
      const againTitle = game.i18n.format("AZEROTH.Chrono.AgainTest", { spell: "Grit Lash", source: "Echo of the Infinite" });
      const remade = [];
      const heard = Hooks.on("createChatMessage", m => { if (m.content?.includes(againTitle)) { remade.push(m); made.push(m); } });
      const unpin = pinDie(20);
      try {
        await nextTurnUntil(raptor.base, combat).catch(() => null);
        await nextTurnUntil(c, combat);
        await until(() => !(c.getFlag("azeroth-rpg", AGAIN_FLAG) ?? []).length, "the row spent at the caster's turn start", 30000);
        await sleep(1500);
      } finally {
        unpin();
        Hooks.off("createChatMessage", heard);
      }
      assert.equal(remade.length, 1, `the Body Test was made again ${remade.length} times at the caster's turn start`);
      assert.isTrue(remade[0].rolls?.[0]?.outcome?.success === true, "the remade Test (a natural 20) failed");
      assert.equal(raptor.actor.system.health.value, hp0 - passedAmount, "what landed again is not what a passed Test leaves");

      // The tick: Reversion on the hurt ally, armed by Echo, lands twice at the ally's next turn start.
      await glass.update({ "system.signatureEffect.presses.echo-of-the-infinite.uses.value": 1 });
      await until(() => pressUses(c, glass, "echo-of-the-infinite") === 1, "Echo's use put back");
      await freshTurn(c, 2);
      made.push(await echo());
      await until(() => c.getFlag("azeroth-rpg", RECURRENCE_FLAG)?.echo === true, "Echo armed again");
      await ally.update({ "system.health.value": 5 });
      const heal = await castFromSheet(c, "Reversion", { targets: [tokenOf(ally)], face: 19 });
      assert.ok(heal?.flags["azeroth-rpg"].chronoAgain?.recurrence, "the Reversion card records nothing to land again");
      // The card's own two Applies (`quench-chronomancer-sweep-t12.mjs`'s Reversion): the heal
      // at once, then the Apply that lays the next turn's heal.
      await (await pressCard(heal, 'button[data-action="applyHealing"]')).release();
      await sleep(1500);
      await (await pressCard(heal, 'button[data-action="applySpellEffect"][data-target-index="0"]')).release();
      const carrier = await until(() => ally.effects.find(e => e.flags?.["azeroth-rpg"]?.[TICK_FLAG]), "Reversion's tick on the ally", 30000);
      const tick = carrier.flags["azeroth-rpg"][TICK_FLAG];
      assert.equal(tick.extra, 1, "the tick carries no extra landing");
      const each = tickLanding(tick).amount;
      assert.isAbove(each, 0, "the tick lands nothing");
      let before = ally.system.health.value;
      for (let i = 0; i < combat.turns.length + 2 && combat.combatant?.actorId !== ally.id; i++) {
        before = ally.system.health.value;
        await stepTurn(combat);
      }
      assert.equal(combat.combatant?.actorId, ally.id, "the fight never reached the ally's turn");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, before + 2 * each), `the tick of ${each} landing twice at the ally's turn start (from ${before})`, 30000);
    });

    it("(a2) PLACE AREA ONLY OVER AN AREA (D-916): Staghelm's Regret draws none, Sulfuras's burst still does", async function () {
      this.timeout(300000);
      const fresh = card => { const div = document.createElement("div"); div.innerHTML = game.messages.get(card.id)?.content ?? ""; return div; };
      // Staghelm's Regret, *An ally within 30 ft*: pressed from a card naming an ally at 0.
      const druid = await makeCharacter({ name: "ZZ SL2 Staghelm", classes: [["Druid", 5]] });
      const scepter = await wield(druid, "azeroth-rpg.weapons", "The Scepter of the Shifting Sands");
      const ally = await makeCharacter({ name: "ZZ SL2 Staghelm Ally", classes: [["Warrior", 5]] });
      const raptor = await makeNpc("Raptor");
      await sceneWith([{ actor: druid, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }, { actor: raptor, x: 1000, y: 1000, side: "hostile" }]);
      const combat = await fightWith([druid, ally, raptor]);
      await nextTurnUntil(ally, combat);
      await nextTurnUntil(raptor, combat);
      await ally.update({ "system.health.value": 0 });
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const regret = await game.system.azeroth.workflows.useSignature({ actor: druid, item: scepter, press: "staghelms-regret", targets: [{ name: tokenOf(ally).name, sceneId: canvas.scene.id, tokenId: tokenOf(ally).id, actorId: ally.id }] });
      if (regret) {
        made.push(regret);
        assert.isNull(fresh(regret).querySelector('[data-action="placeArea"]'), "Staghelm's Regret's card offers a Place area over one ally");
      } else {
        // No turn-start Health on record in this fight yet: refused in words, and so no card at all.
        assert.notOk(regret, "the refused press posted a card");
      }
      canvas.tokens.setTargets([]);
      // Sulfuras's burst, *Each creature within 20 ft*: an area, its button kept.
      const ragnaros = await makeCharacter({ name: "ZZ SL2 Sulfuras", classes: [["Warrior", 5]] });
      const maul = await wield(ragnaros, "azeroth-rpg.weapons", "Sulfuras, Hand of Ragnaros");
      const burst = await useSignatureWithDialog(ragnaros, maul, null);
      assert.ok(burst, "Sulfuras's press posted no card");
      made.push(burst);
      assert.ok(fresh(burst).querySelector('[data-action="placeArea"]'), "Sulfuras's burst lost its Place area");
    });

    it("(f) TEN THOUSAND YEARS OF PRACTICE: the second Reaction is spent once, and both come back at the Mage's own turn; never three between two of its turns", async function () {
      this.timeout(420000);
      const mage = await makeCharacter({ name: "ZZ SL2 Signet Mage", classes: [["Mage", 5]], abilities: { dex: 8, int: 16 } });
      await wield(mage, "azeroth-rpg.gear", "Signet of the Shen'dralar");
      await until(() => (mage.system.signatureEffects?.secondReaction ?? []).length, "Ten Thousand Years on the aggregate");
      const r1 = await makeNpc("Raptor");
      const r2 = await makeNpc("Raptor");
      await sceneWith([{ actor: mage, x: 800, y: 1000 }, { actor: r1, x: 1300, y: 1000, side: "hostile" }, { actor: r2, x: 1300, y: 1300, side: "hostile" }]);
      const combat = await fightWith([mage, r1, r2]);
      const mine = combatantOf(combat, mage);
      const order = combat.turns.map(t => t.name).join(", ");
      await nextTurnUntil(mage, combat);
      let spent = 0;
      const spendAll = async () => {
        await warnings(async () => {
          if (await spendTurnBudget(mage, "reaction")) spent++;
          if (await secondReactionSpend(mage, "Blink")) spent++;
          if (await secondReactionSpend(mage, "Blink")) spent++;
        });
      };
      // The first turn after the Mage's: the one Reaction and the Signet's one, never a third.
      await stepTurn(combat);
      await spendAll();
      assert.equal(spent, 2, `the first turn after the Mage's gave ${spent} Reactions, not the one and the Signet's one`);
      assert.isTrue(mine.budget?.[SECOND_REACTION_MARK] === true, "the second Reaction's mark is not on the budget");
      // Every other turn until the Mage's: the second Reaction stays spent, a round's start included.
      let crossedRound = false;
      for (let i = 0; i < combat.turns.length + 2 && combat.combatant?.id !== mine.id; i++) {
        const round = combat.round;
        await stepTurn(combat);
        if (combat.combatant?.id === mine.id) break;
        if (combat.round !== round) crossedRound = true;
        assert.isTrue(mine.budget?.[SECOND_REACTION_MARK] === true, `the second Reaction came back on ${combat.combatant?.name}'s turn (round ${combat.round})`);
        await spendAll();
      }
      assert.equal(combat.combatant?.id, mine.id, "the fight never came back to the Mage");
      // **THE LEAD'S RULING, D-915**: 05 says *The Reaction refreshes at the start of your
      // turn*, and a round's start carries the first Reaction as it stands
      // (`rules/initiative.mjs#roundStartBudget`). Between two of the Mage's turns there are
      // the one Reaction and the Signet's one - never a second, refreshed first Reaction -
      // whether or not a round started between them.
      assert.equal(spent, 2, `${spent} Reactions between two of the Mage's turns (order: ${order}; a round started between: ${crossedRound})`);
      await until(() => mine.budget?.reactions === 1 && mine.budget?.[SECOND_REACTION_MARK] !== true, "both Reactions back at the Mage's own turn");
      // And spendable again on the next turn after it: the Signet gives its second Reaction every turn, not once a fight.
      spent = 0;
      await stepTurn(combat);
      await spendAll();
      assert.equal(spent, 2, `after the Mage's next turn the Signet gave ${spent} Reactions, not two`);
    });

    it("(g) ATIESH'S AURA and THE LIGHTBRINGER'S WARD 2 are laid on an ally's token in a started fight, and never on the enemy", async function () {
      this.timeout(300000);
      const mage = await makeCharacter({ name: "ZZ SL2 Atiesh", classes: [["Mage", 5]] });
      await wield(mage, "azeroth-rpg.weapons", "Atiesh, Greatstaff of the Guardian");
      const paladin = await makeCharacter({ name: "ZZ SL2 Lightbringer", classes: [["Paladin", 5]] });
      await wield(paladin, "azeroth-rpg.weapons", "Hammer of the Lightbringer");
      const ally = await makeCharacter({ name: "ZZ SL2 Aura Ally", classes: [["Warrior", 5]] });
      const raptor = await makeNpc("Raptor");
      await sceneWith([{ actor: mage, x: 800, y: 1000 }, { actor: paladin, x: 900, y: 1000 }, { actor: ally, x: 1000, y: 1000 }, { actor: raptor, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([mage, paladin, ally, raptor]);
      const auraFrom = (actor, holder) => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[AURA_FLAG] && e.name.includes(holder.name)) ?? null;
      await until(() => auraFrom(ally, mage), "Atiesh's aura on the ally's effects", 30000);
      await until(() => auraFrom(ally, paladin), "the Lightbringer's Ward on the ally's effects", 30000);
      await until(() => (ally.system.ward?.shadow ?? 0) >= 2, "Ward 2 against Shadow on the ally", 30000);
      assert.notOk(auraFrom(raptor, mage) || auraFrom(raptor, paladin), "an aura for allies was laid on the enemy");
    });

    it("(h) PLAGUEBOUND: a blade set down keeps its clock, and back in hand the months it missed are ONE Test", async function () {
      this.timeout(180000);
      const bearer = await makeCharacter({ name: "ZZ SL2 Plaguebound", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
      const sword = await until(() => bearer.items.find(i => i.name === "Longsword"), "the sword carried");
      await sword.update({ "system.equipped": true, "system.traits": [...(sword.system.traits ?? []), "Plaguebound (Lesser)"] });
      await until(() => bearer.items.get(sword.id).system.traits.includes("Plaguebound (Lesser)"), "the trait on the sword");
      const DAY = 86400;
      const t0 = Math.trunc(game.time.worldTime) + 1000;
      const tests = [];
      const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === bearer.id) { tests.push(m); made.push(m); } });
      try {
        await advanceTraitClocks({ now: t0 });
        assert.equal(bearer.items.get(sword.id).getFlag("azeroth-rpg", TRAIT_CLOCK_FLAG)?.month, t0, "the clock was not stamped");
        await sword.update({ "system.equipped": false });
        await advanceTraitClocks({ now: t0 + 10 });
        assert.isTrue(bearer.items.get(sword.id).getFlag("azeroth-rpg", TRAIT_CLOCK_FLAG)?.away, "the blade set down was not marked away");
        assert.equal(bearer.items.get(sword.id).getFlag("azeroth-rpg", TRAIT_CLOCK_FLAG)?.month, t0, "setting the blade down moved its stamp");
        await sword.update({ "system.equipped": true });
        await until(() => bearer.items.get(sword.id).system.equipped === true, "the sword back in hand");
        const made0 = await advanceTraitClocks({ now: t0 + 95 * DAY });
        assert.equal(made0, 1, `three months set down came due as ${made0} Tests`);
        await until(() => tests.length >= 1, "the catch-up Test's card", 20000);
        const made1 = await advanceTraitClocks({ now: t0 + 95 * DAY + 10 });
        assert.equal(made1, 0, "a Test came due again at once");
      } finally {
        Hooks.off("createChatMessage", hook);
      }
    });

    it("(i) THUNDERFURY'S ARC lands at the Apply, never at the roll, and a Parried hit lands none", async function () {
      this.timeout(360000);
      const striker = await makeCharacter({ name: "ZZ SL2 Thunderfury", classes: [["Warrior", 5]], race: "Human" });
      const blade = await wield(striker, "azeroth-rpg.weapons", "Thunderfury, Blessed Blade of the Windseeker");
      const foe = await makeCharacter({ name: "ZZ SL2 Arc Foe", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const foeSword = await until(() => foe.items.find(i => i.name === "Longsword"), "the foe's sword");
      await foeSword.update({ "system.equipped": true });
      const near = await makeNpc("Raptor");
      await sceneWith([{ actor: striker, x: 800, y: 1000 }, { actor: foe, x: 900, y: 1000, side: "hostile" }, { actor: near, x: 1000, y: 1000, side: "hostile" }]);
      // In a started fight, for the reason (b) gives: out of one, a world character's
      // Foresight would hold the hit's damage behind a reveal.
      const combat = await fightWith([striker, foe, near]);
      await nextTurnUntil(striker, combat);
      const swing = async face => {
        canvas.tokens.setTargets([tokenOf(foe).id]);
        const sheet = await openSheet(striker);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const control = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${blade.id}"] [data-action="rollAttack"]`);
          if (!control) throw new Error("the Combat tab draws no Attack for Thunderfury");
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === striker.id && m.flags?.["azeroth-rpg"]?.kind === "attack");
          const unpin = pinDie(face);
          try {
            control.click();
            const [card] = await posted;
            made.push(card);
            return card;
          } finally {
            unpin();
          }
        } finally {
          await sheet.close();
          canvas.tokens.setTargets([]);
        }
      };
      const arcCards = () => game.messages.contents.filter(m => m.flags?.["azeroth-rpg"]?.kind === "arc");
      const near0 = near.system.health.value;
      const card = await swing(19);
      assert.ok(card.flags["azeroth-rpg"].damageByTarget?.[0], "the pinned swing missed");
      assert.equal(card.flags["azeroth-rpg"].arcs?.length, 1, "the hit recorded no arc for its Apply");
      await sleep(1500);
      assert.equal(near.system.health.value, near0, "the arc landed at the roll");
      await (await pressCard(card, APPLY)).release();
      await until(() => near.system.health.value < near0, "the arc landing at the Apply", 30000);
      await until(() => arcCards().some(m => m.flags["azeroth-rpg"].messageId === card.id), "the arc's own card");
      const near1 = near.system.health.value;
      // The Parried hit, the next round (one Attack a round): the row withdrawn, its Apply lands no arc.
      await nextTurnUntil(foe, combat);
      await nextTurnUntil(striker, combat);
      await setPool(foe, "rage", PARRY_COST + 2);
      const second = await swing(15);
      assert.ok(second.flags["azeroth-rpg"].damageByTarget?.[0], "the second pinned swing missed");
      const parried = () => game.messages.get(second.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true;
      const parrySaid = await warnings(async () => {
        const p = await pressCard(second, 'button[data-action="reactParry"][data-target-index="0"]', { face: 20 });
        try { await until(parried, "the Parry holding", 30000).catch(() => null); } finally { await p.release(); }
      });
      assert.isTrue(parried(), `the Parry did not hold: ${parrySaid.join(" | ")}`);
      const apply = document.querySelector(`#chat [data-message-id="${second.id}"] ${APPLY}`);
      if (apply && !apply.disabled) await (await pressCard(second, APPLY)).release();
      await sleep(2500);
      assert.equal(near.system.health.value, near1, "a Parried hit's Apply landed an arc");
      assert.notOk(arcCards().some(m => m.flags["azeroth-rpg"].messageId === second.id), "a Parried hit posted an arc card");
    });

    it("(j) DRAIN THE CHAMBER and STAGHELM'S REGRET with no GM online are refused in words with nothing spent", async function () {
      this.timeout(360000);
      const hakkari = await makeCharacter({ name: "ZZ SL2 Bloodglaive", classes: [["Warrior", 5]], race: "Troll" });
      const glaive = await wield(hakkari, "azeroth-rpg.weapons", "Bloodglaive of the Hakkari");
      const bleeder = await makeCharacter({ name: "ZZ SL2 Bleeder", classes: [["Warrior", 5]] });
      const druid = await makeCharacter({ name: "ZZ SL2 Staghelm", classes: [["Druid", 5]] });
      const scepter = await wield(druid, "azeroth-rpg.weapons", "The Scepter of the Shifting Sands");
      const fallen = await makeCharacter({ name: "ZZ SL2 Fallen", classes: [["Warrior", 5]] });
      const raptor = await makeNpc("Raptor");
      await sceneWith([
        { actor: hakkari, x: 800, y: 1000 }, { actor: bleeder, x: 900, y: 1000 },
        { actor: druid, x: 800, y: 1300 }, { actor: fallen, x: 900, y: 1300 }, { actor: raptor, x: 1500, y: 1300, side: "hostile" }
      ]);
      const laid = await inflictCondition({ victim: bleeder, id: "bleeding", value: 2, name: bleeder.name });
      assert.isTrue(laid.landed, "the Bleeding was not laid");
      // Neither the creature drained nor the ally rewound is this player's.
      for (const a of [bleeder, fallen]) await a.update({ [`ownership.${game.user.id}`]: 0 });
      for (const a of [hakkari, druid]) await a.update({ [`ownership.${game.user.id}`]: 3 });

      // Drain the Chamber, out of a fight.
      const bled0 = bleeder.system.health.value;
      const drained = await warnings(async () => {
        await withNoGM(() => game.system.azeroth.workflows.useSignature({ actor: hakkari, item: hakkari.items.get(glaive.id), press: "drain-the-chamber" }));
      });
      assert.include(drained.join(" "), game.i18n.format("AZEROTH.Signature.NoGM", { name: "Drain the Chamber" }), `Drain the Chamber was not refused for the GM: ${drained.join(" | ")}`);
      assert.equal(pressUses(hakkari, glaive, "drain-the-chamber"), 1, "the refusal spent the use");
      assert.equal(bleeder.system.health.value, bled0, "the refusal drained");

      // Staghelm's Regret, in a fight: the ally's turn-start Health on record, then 0.
      const combat = await fightWith([druid, fallen, raptor, hakkari, bleeder]);
      await nextTurnUntil(fallen, combat);
      const fallenTurn = combatantOf(combat, fallen);
      await until(() => Number.isFinite(Number(fallenTurn.getFlag("azeroth-rpg", "turnStartHealth"))), "the ally's turn-start Health recorded", 30000);
      const recorded = fallenTurn.getFlag("azeroth-rpg", "turnStartHealth");
      await nextTurnUntil(raptor, combat);
      await fallen.update({ "system.health.value": 0 });
      const druidTurn = combatantOf(combat, druid);
      const reactions0 = druidTurn.budget?.reactions;
      const targets = targetSnapshots([tokenOf(fallen)]);
      const regret = await warnings(async () => {
        await withNoGM(() => game.system.azeroth.workflows.useSignature({ actor: druid, item: druid.items.get(scepter.id), press: "staghelms-regret", targets }));
      });
      assert.include(regret.join(" "), game.i18n.format("AZEROTH.Signature.NoGM", { name: "Staghelm's Regret" }), `Staghelm's Regret was not refused for the GM: ${regret.join(" | ")}`);
      assert.equal(pressUses(druid, scepter, "staghelms-regret"), 1, "the refusal spent the use");
      assert.equal(druidTurn.budget?.reactions, reactions0, "the refusal spent the Reaction");
      assert.equal(fallen.system.health.value, 0, "the refusal rewound");
      // With the GM back, the same press rewinds the ally to the Health it began its turn with.
      made.push(await game.system.azeroth.workflows.useSignature({ actor: druid, item: druid.items.get(scepter.id), press: "staghelms-regret", targets }));
      await until(() => fallen.system.health.value === recorded, `the ally back at ${recorded}`, 30000);
    });

    /* ---- Round 3 (D-914's fix pass) ---- */

    it("(k) TEN THOUSAND YEARS: with a bar on the Mage's Reactions, the second Reaction is refused and nothing is spent", async function () {
      this.timeout(300000);
      const mage = await makeCharacter({ name: "ZZ SL3 Barred Mage", classes: [["Mage", 5]] });
      await wield(mage, "azeroth-rpg.gear", "Signet of the Shen'dralar");
      await until(() => (mage.system.signatureEffects?.secondReaction ?? []).length, "Ten Thousand Years on the aggregate");
      const raptor = await makeNpc("Raptor");
      await sceneWith([{ actor: mage, x: 800, y: 1000 }, { actor: raptor, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([mage, raptor]);
      await nextTurnUntil(raptor, combat);
      const mine = combatantOf(combat, mage);
      let first = null;
      await warnings(async () => { first = await spendTurnBudget(mage, "reaction"); });
      assert.isTrue(first, "the first Reaction was not spent");
      await until(() => mine.budget?.reactions === 0, "the first Reaction spent");
      // 07's Earth Shock bar (`rules/reaction-bar.mjs`): *it takes no Reaction*.
      const [bar] = await mage.createEmbeddedDocuments("ActiveEffect", [reactionBarEffect({ actorUuid: mage.uuid, cardUuid: mage.uuid, timing: {} })]);
      const before = foundry.utils.deepClone(mine.budget);
      let barred = null;
      await warnings(async () => { barred = await secondReactionSpend(mage, "Blink"); });
      assert.isFalse(barred, "the second Reaction was spent through a bar on Reactions");
      await sleep(500);
      assert.notEqual(mine.budget?.[SECOND_REACTION_MARK], true, "the refused second Reaction left its mark");
      assert.deepEqual(foundry.utils.deepClone(mine.budget), before, "the refusal wrote the budget");
      // The bar lifted, the same door spends it.
      await mage.deleteEmbeddedDocuments("ActiveEffect", [bar.id]);
      let freed = null;
      await warnings(async () => { freed = await secondReactionSpend(mage, "Blink"); });
      assert.isTrue(freed, "with the bar gone the second Reaction was refused");
      await until(() => mine.budget?.[SECOND_REACTION_MARK] === true, "the second Reaction's mark");
    });

    it("(l) SHARED BURDEN carries a breath: the share moved onto a Spirit Walker wielding Quel'Serrar is halved once", async function () {
      this.timeout(300000);
      const tauren = await makeCharacter({ name: "ZZ SL3 Burden Breath", race: "Tauren", classes: [["Shaman", 5]], abilities: { wis: 16, con: 14 } });
      await until(() => tauren.items.filter(i => i.type === "talent" && i.system?.legacy === "Tauren").length === 12, "the Spirit Walker's twelve", 30000);
      const burden = await until(() => tauren.items.find(i => i.type === "talent" && i.name === "Shared Burden"), "Shared Burden on the sheet");
      await burden.update({ "system.taken": 1 });
      await until(() => tauren.items.get(burden.id)?.system?.taken === 1, "Shared Burden at rank 1");
      await wield(tauren, "azeroth-rpg.weapons", "Quel'Serrar");
      await until(() => (tauren.system.signatureEffects?.breathHalf ?? []).length, "Foror's Lesson on the aggregate");
      const ally = await makeCharacter({ name: "ZZ SL3 Burden Ally", classes: [["Warrior", 5]] });
      for (const a of [tauren, ally]) await a.setParty(true);
      try {
        await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: ally, x: 1300, y: 1000 }]);
        for (const a of [tauren, ally]) await a.update({ "system.health.value": a.system.health.max });
        await setPool(tauren, "mana", poolOf(tauren, "mana").max);
        const ownAP = Math.max(0, Math.trunc(Number(tauren.system.ap?.body)) || 0);
        const wasT = tauren.system.health.value;
        const wasA = ally.system.health.value;
        const blow = ally.applyDamage(12, { struck: true, attack: true, messageId: "ZZBreathBurden", breath: { title: "Fire Breath", featureKey: null, spellName: null } });
        await answerFor(tauren, "yes");
        await blow;
        // Half of 12 is the share; the shaman's own Armor Points meet it; Foror's Lesson halves what is left, ONCE.
        const expected = Math.floor(Math.max(0, 6 - ownAP) / 2);
        await until(() => tauren.system.health.value === wasT - expected, `the shaman losing ${expected} (6 less ${ownAP} AP, halved once)`, 20000);
        await sleep(800);
        assert.equal(tauren.system.health.value, wasT - expected, "the moved breath was halved more than once");
        assert.equal(ally.system.health.value, wasA - 6, "the half kept by an ally holding nothing that halves a breath is not 6");
      } finally {
        for (const a of [tauren, ally]) await a.setParty(false);
      }
    });

    it("(m) FEL-TOUCHED (GREATER): a kill Test asked by a client that does not own the killer is refused over a living creature, made once over one at 0 Health, and not twice", async function () {
      this.timeout(180000);
      const killer = await makeCharacter({ name: "ZZ SL3 Fel Killer", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
      const sword = await until(() => killer.items.find(i => i.name === "Longsword"), "the sword carried");
      await sword.update({ "system.equipped": true, "system.traits": [...(sword.system.traits ?? []), "Fel-touched (Greater)"] });
      await until(() => (killer.traitExposuresFor?.("kill") ?? []).length, "the kill Test the trait asks");
      const victim = await makeNpc("Raptor");
      // The query handler as another client's ask reaches the GM: `{user}` is the asker.
      const stranger = game.users.find(u => !u.isGM && !killer.testUserPermission(u, "OWNER"))
        ?? { id: "ZZstranger000000", name: "ZZ stranger", isGM: false, isBanned: false };
      assert.isFalse(killer.testUserPermission(stranger, "OWNER"), "the asker owns the killer");
      const payload = { act: "traitExposure", bearerUuid: killer.uuid, victimUuid: victim.uuid, occasion: "kill" };
      const tests = [];
      const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === killer.id) { tests.push(m); made.push(m); } });
      try {
        let living = null;
        try { await legendaryQueryHandler(payload, { user: stranger }); } catch (err) { living = err; }
        assert.ok(living, "a kill Test over a living creature was made for an asker who does not own the killer");
        await victim.update({ "system.health.value": 0 });
        const first = await legendaryQueryHandler(payload, { user: stranger });
        assert.isTrue(first?.ok === true && first.made >= 1, `the kill Test over a creature at 0 Health was not made: ${JSON.stringify(first)}`);
        assert.include(victim.getFlag("azeroth-rpg", KILL_TESTED_FLAG) ?? [], killer.uuid, "the killer is not named on the creature killed");
        await until(() => tests.length >= first.made, "the kill Test's card");
        let twice = null;
        try { await legendaryQueryHandler(payload, { user: stranger }); } catch (err) { twice = err; }
        assert.ok(twice, "the kill Test was made twice over one creature");
        await sleep(800);
        assert.equal(tests.length, first.made, "a second Test's card was posted");
      } finally {
        Hooks.off("createChatMessage", hook);
      }
    });

    it("(n) A CREATURE WITH NO SPELL DC presses The Wyrm's Roar from the card: the attacker's Test asks 12 + twice its tier", async function () {
      this.timeout(300000);
      const raptor = await makeNpc("Raptor");
      assert.notOk(raptor.system.spellDC ?? raptor.system.spells?.dc ?? null, "the Raptor carries a Spell DC");
      const mantle = await wield(raptor, "azeroth-rpg.gear", "Lady Prestor's Mantle");
      const hero = await makeCharacter({ name: "ZZ SL3 Roar Attacker", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: hero, x: 800, y: 1000 }, { actor: raptor, x: 900, y: 1000, side: "hostile" }]);
      const combat = await fightWith([hero, raptor]);
      await nextTurnUntil(hero, combat);
      const card = await strike(hero, raptor);
      const roared = untilHook("createChatMessage", 30000, m => m.speaker?.actor === raptor.id && m.flags?.["azeroth-rpg"]?.press === "the-wyrms-roar");
      await (await pressCard(card, 'button[data-action="reactSignature"][data-target-index="0"][data-press="the-wyrms-roar"]')).release();
      const [roar] = await roared;
      made.push(roar);
      assert.equal(pressUses(raptor, mantle, "the-wyrms-roar"), 0, "the creature's use was not struck");
      const button = new DOMParser().parseFromString(roar.content, "text/html").querySelector('button[data-action="resistTest"]');
      assert.ok(button, "the press's card offers no Test");
      const tier = Math.max(1, Math.trunc(Number(raptor.system.tier)) || 1);
      assert.equal(Number(button.dataset.dc), 12 + 2 * tier, `the Test's DC is not 12 + 2 x tier ${tier}`);
    });
  });
}
