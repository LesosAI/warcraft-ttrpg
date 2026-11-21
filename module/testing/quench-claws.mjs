/**
 * **THE SOVEREIGN'S CLAWS AND 08 §5's DEFT, THROUGH THE REAL DOORS** (02 §7's Blood-Forged
 * Claws, 04's Ravenous, 08 §5 and §7; the San'layn and Sovereign plan, B.5, C1, C5, C15, C16,
 * DF1 to DF4; D-1160 to D-1169).
 *
 * Two batches. `azeroth-rpg.claws` presses what a player presses - the Combat tab's Equip and
 * Attack, the Overview tile's picker, the card's Off-Hand and claw-roll buttons - and reads the
 * actor, the budget, the card and the animation recorder back. `azeroth-rpg.deft` rolls a Deft
 * dagger, reads a Classic find, and runs the Deft migration on a world document holding the old
 * trait list. The die is pinned through `fixtures.mjs#pinDie` wherever a Test decides anything.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, fromPack, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, settle, tokenData, tokenDrawn, untilHook, warnings, KNOWN } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { attackWithDialog, reactionStateOf } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { CLAW_USES_FLAG } from "../rules/initiative.mjs";
import { CLAW_HIT_HOOK } from "../rules/claw-hit.mjs";
import { CLAWS_EQUIP_CUE, CLAWS_FEATURE } from "../rules/claws.mjs";
import { canReact } from "../rules/reactions.mjs";
import { disarmOptions } from "../rules/npc-disarm-options.mjs";
import { tarHit } from "../rules/tar-reactions.mjs";
import { goesOn } from "../rules/consumables.mjs";
import { weaponTraining } from "../rules/equipment-training.mjs";
import { isClaws } from "../rules/unarmed.mjs";
import { buildDeftUpdate } from "../rules/deft-migration.mjs";

const SCOPE = "azeroth-rpg";
const SOVEREIGN = "Sovereign";
const SANLAYN = "San'layn";

async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const clawsOf = actor => actor.items.find(i => i.type === "weapon" && isClaws(i)) ?? null;
const named = (actor, name) => actor.items.find(i => i.name === name) ?? null;
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => game.i18n.localize(p.label));
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;

/** Every attack card an actor posts while `fn` runs, in order. */
async function cardsFrom(actor, fn) {
  const cards = [];
  const hookId = Hooks.on("createChatMessage", msg => {
    if (msg.speaker?.actor === actor.id && msg.flags?.[SCOPE]?.kind === "attack") cards.push(msg);
  });
  try { await fn(); } finally { Hooks.off("createChatMessage", hookId); }
  await settle();
  for (const c of cards) made.push(c);
  return cards;
}

/** A started fight, its turn events landed. */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag(SCOPE, "budget") !== undefined), "every combatant's budget");
  return combat;
}

/** A Sovereign, its claws landed. */
async function sovereign(name, { level = 1, abilities = { str: 10, dex: 16, con: 14, cha: 14 }, ranks = {} } = {}) {
  const actor = await makeCharacter({ name, classes: [[SOVEREIGN, level]], race: SANLAYN, abilities });
  await until(() => actor.items.some(i => i.type === "feature" && i.name === CLAWS_FEATURE), `${name}'s ${CLAWS_FEATURE}`);
  await until(() => clawsOf(actor), `${name}'s claws`);
  for (const [talent, rank] of Object.entries(ranks)) {
    const item = await until(() => named(actor, talent), `${talent} on ${name}`);
    await item.update({ "system.taken": rank });
    await until(() => (actor.items.get(item.id)?.system?.taken ?? 0) === rank, `${talent} at rank ${rank}`);
  }
  return actor;
}

/** A weapon out of 08 §7, equipped where asked. */
async function hold(actor, name, { offHand = false } = {}) {
  const doc = await fromPack(PACK_FOR.weapon, name);
  if (!doc) throw new Error(`the weapons pack holds no "${name}"`);
  const source = doc.toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true, offHand } }], { ...KNOWN });
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} in hand`);
  return actor.items.get(item.id);
}

/** Press the Combat tab's control on an item's row. */
async function pressRow(sheet, item, action) {
  sheet.changeTab("combat", "primary");
  await settle();
  const control = sheet.element.querySelector(`section[data-tab="combat"] li[data-item-id="${item.id}"] [data-action="${action}"]`);
  if (!control) throw new Error(`the Combat tab draws no ${action} on ${item.name}`);
  control.click();
  return control;
}

/** The picker `chooseOption` opened on this actor. */
async function chooserFor(actor, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const app = foundry.applications.instances.get(`azeroth-choose-${actor.id}`);
    if (app?.rendered && app.element?.querySelector("#azeroth-choose-select")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}
const optionsOf = chooser => [...chooser.element.querySelectorAll("#azeroth-choose-select option")].map(o => o.textContent.trim());
function choose(chooser, text) {
  const option = [...chooser.element.querySelectorAll("#azeroth-choose-select option")].find(o => o.textContent.includes(text));
  if (!option) throw new Error(`the chooser offers no "${text}"`);
  chooser.element.querySelector("#azeroth-choose-select").value = option.value;
  chooser.element.querySelector('button[data-action="choose"]').click();
}

/** A scene with linked tokens, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Claws Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(tokenOf(p.actor))), "every token drawn");
  await settle();
  return scene;
}

export function clawsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Sovereign's Claws (02 §7, 04's Ravenous; D-1162 to D-1168)", function () {
    const held = {};
    let wasViewing = null;
    before(async function () {
      held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      wasViewing = canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog);
      await cleanup();
      if (wasViewing && game.scenes.has(wasViewing.id)) await wasViewing.view();
    });

    it("CLAWS GRANT: embedded unequipped with Blood-Forged Claws, no bag slot and no panel; a hand delete refused in words; gone with the class", async function () {
      this.timeout(180000);
      const actor = await sovereign("ZZ Claws Grant");
      const claws = clawsOf(actor);
      assert.isFalse(claws.system.equipped, "the claws arrived equipped");
      assert.isTrue(claws.system.offHand, "the claws are not the off hand's");
      assert.isNull(claws.system.container ?? null, "the claws were put in a bag");
      assert.equal(actor.items.filter(i => isClaws(i)).length, 1, "more than one set");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        assert.isNull(sheet.element.querySelector(`section[data-tab="gear"] .azeroth-bag-tile[data-item-id="${claws.id}"]`), "the claws are drawn in a bag");
        const said = await warnings(async () => {
          await actor.deleteEmbeddedDocuments("Item", [claws.id]).catch(() => null);
        });
        assert.ok(actor.items.get(claws.id), "a hand delete took the claws");
        assert.include(said, game.i18n.format("AZEROTH.Claws.Refuse.Delete", { name: claws.name }), `the refusal did not say why: ${JSON.stringify(said)}`);
        // A hand create of a second set is refused too.
        const twice = await warnings(async () => {
          await actor.createEmbeddedDocuments("Item", [claws.toObject()], { ...KNOWN }).catch(() => null);
        });
        assert.equal(actor.items.filter(i => isClaws(i)).length, 1, "a second set was made by hand");
        assert.include(twice, game.i18n.format("AZEROTH.Claws.Refuse.Create", { name: claws.name }));
      } finally {
        await sheet.close();
      }
      const cls = actor.items.find(i => i.type === "class");
      await actor.deleteEmbeddedDocuments("Item", [cls.id]);
      await until(() => !clawsOf(actor), "the claws gone with the class");
    });

    it("EQUIP TOGGLE: the Combat tab's Equip puts a Light dagger away and fills the Off hand tile with the claws; a shield from the tile's picker takes them off", async function () {
      this.timeout(180000);
      const actor = await sovereign("ZZ Claws Equip");
      const claws = clawsOf(actor);
      const sword = await hold(actor, "Longsword");
      const dagger = await hold(actor, "Dagger", { offHand: true });
      const shield = await give(actor, "Buckler", PACK_FOR.armor);
      const sheet = await openSheet(actor);
      try {
        await pressRow(sheet, claws, "toggleEquipped");
        await until(() => actor.items.get(claws.id).system.equipped === true, "the claws equipped");
        await until(() => actor.items.get(dagger.id).system.equipped === false, "the dagger put away");
        assert.isTrue(actor.items.get(sword.id).system.equipped, "the main hand was put away");
        await sheet.render({ force: true });
        sheet.changeTab("overview", "primary");
        await settle();
        const tile = await until(() => sheet.element.querySelector('section[data-tab="overview"] [data-slot="offHand"]'), "the Off hand tile");
        assert.equal(tile.dataset.itemId ?? tile.querySelector("[data-item-id]")?.dataset.itemId, claws.id, "the Off hand tile does not show the claws");
        // The picker lists what is carried: no claws row, and no Take it off while they are worn.
        const pick = tile.matches('[data-action="pickSlot"]') ? tile : tile.querySelector('[data-action="pickSlot"]');
        assert.ok(pick, "the Off hand tile is no control");
        pick.click();
        const chooser = await chooserFor(actor);
        assert.ok(chooser, "the picker never opened");
        const rows = optionsOf(chooser);
        assert.notOk(rows.some(r => r.includes(claws.name)), `the picker lists the claws: ${rows.join(" | ")}`);
        assert.notOk(rows.some(r => r.includes(game.i18n.localize("AZEROTH.Overview.TakeOff"))), "the picker offers to take the claws off");
        choose(chooser, shield.name);
        await until(() => actor.items.get(shield.id).system.equipped === true, "the shield equipped");
        await until(() => actor.items.get(claws.id).system.equipped === false, "the shield took the claws off");
      } finally {
        await sheet.close();
      }
    });

    it("A WARRIOR'S DAGGER AND MACE keep 06 §2's hands: one in each, nothing put away", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Claws Warrior", classes: [["Warrior", 3]] });
      const mace = await hold(actor, "Mace");
      const dagger = await hold(actor, "Dagger", { offHand: true });
      await settle();
      assert.isTrue(actor.items.get(mace.id).system.equipped, "the mace was put away");
      assert.isTrue(actor.items.get(dagger.id).system.equipped, "the dagger was put away");
    });

    it("TWO-HANDED: a greatsword takes the claws off, and the claws put the greatsword away", async function () {
      this.timeout(180000);
      const actor = await sovereign("ZZ Claws Greatsword");
      const claws = clawsOf(actor);
      const sheet = await openSheet(actor);
      try {
        await pressRow(sheet, claws, "toggleEquipped");
        await until(() => actor.items.get(claws.id).system.equipped === true, "the claws equipped");
        const gsDoc = (await fromPack(PACK_FOR.weapon, "Greatsword")).toObject();
        const [gs] = await actor.createEmbeddedDocuments("Item", [{ ...gsDoc, system: { ...gsDoc.system, equipped: false } }], { ...KNOWN });
        await sheet.render({ force: true });
        await pressRow(sheet, gs, "toggleEquipped");
        await until(() => actor.items.get(gs.id).system.equipped === true, "the greatsword equipped");
        await until(() => actor.items.get(claws.id).system.equipped === false, "the greatsword took the claws off");
        await sheet.render({ force: true });
        await pressRow(sheet, claws, "toggleEquipped");
        await until(() => actor.items.get(claws.id).system.equipped === true, "the claws equipped again");
        await until(() => actor.items.get(gs.id).system.equipped === false, "the claws put the greatsword away");
      } finally {
        await sheet.close();
      }
    });

    it("OFF-HAND ATTACK: a longsword Attack, then the claws off the card with no −2; a second claw strike refused; with an empty main hand a claw strike costs a Half-Action and offers no second roll", async function () {
      this.timeout(240000);
      const actor = await sovereign("ZZ Claws Off Hand");
      const claws = clawsOf(actor);
      await claws.update({ "system.equipped": true });
      const sword = await hold(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = await giveTurn(combat, actor);
      const unpin = pinDie(18);
      try {
        const [main] = await cardsFrom(actor, () => attackWithDialog(actor, sword));
        assert.ok(main, "the longsword Attack posted no card");
        const button = parsed(main).querySelector('[data-action="offHandFromCard"]');
        assert.ok(button, "the card offers no Off-Hand Attack");
        assert.equal(button.dataset.itemId, claws.id, "the Off-Hand button is not the claws'");
        const [off] = await cardsFrom(actor, () => CARD_ACTIONS.offHandFromCard(button, game.messages.get(main.id)));
        assert.ok(off, "the claws struck nothing");
        assert.notInclude(labels(off), game.i18n.localize("AZEROTH.Dialog.OffHand"), "the Light claws took −2");
        assert.deepInclude(off.flags[SCOPE].strike, { form: "claw", rangeKind: "melee" }, "the claws were not recorded as a claw");
        assert.equal(me.budget.halfActions, 1, "the claws charged a Half-Action: they ride the Attack");
        assert.isNull(parsed(off).querySelector('[data-action="clawRollFromCard"]'), "a claw roll was offered without Ravenous");
        const said = await warnings(async () => {
          const again = await cardsFrom(actor, () => attackWithDialog(actor, claws));
          assert.equal(again.length, 0, "a second claw strike landed in the round");
        });
        assert.include(said, game.i18n.localize("AZEROTH.Budget.Refuse.OffHandSpent"));
      } finally {
        unpin();
      }
      // A fresh fight, the sword put away: the lone claw blow pays its own Half-Action.
      await sword.update({ "system.equipped": false });
      const fight2 = await fightWith([actor, foe]);
      const me2 = await giveTurn(fight2, actor);
      const unpin2 = pinDie(18);
      try {
        const [lone] = await cardsFrom(actor, () => attackWithDialog(actor, claws));
        assert.ok(lone, "the lone claw blow posted no card");
        await until(() => me2.budget.halfActions === 1, "the lone claw blow's Half-Action");
        assert.isNull(parsed(lone).querySelector('[data-action="clawRollFromCard"]'), "a second claw roll was offered");
      } finally {
        unpin2();
      }
    });

    it("UNARMED: trained with no weapon word; Disarm lists the longsword and not the claws; Sticky Tar spares them; no coating, forge or affix; a claws-only Parry refused in words", async function () {
      this.timeout(120000);
      const actor = await sovereign("ZZ Claws Unarmed");
      const claws = clawsOf(actor);
      await claws.update({ "system.equipped": true });
      assert.isTrue(weaponTraining(claws, []), "the claws are untrained");
      // A claws-only Parry, refused in its own words.
      const state = reactionStateOf(actor);
      assert.isTrue(state.unarmedOnly, "the claws alone did not read as unarmed");
      assert.deepEqual(state.meleeWeapons, [], "the claws were offered to Parry with");
      // With a point to pay (Tribute starts a fight at 0), the refusal is the claws' own.
      const paid = { ...state, inFight: false, pools: [{ kind: "momentum", name: "rage", value: 3, max: 10 }] };
      assert.equal(canReact("parry", paid).reason, "AZEROTH.Reaction.Refuse.Unarmed", "a claws-only Parry was not refused in its own words");
      const sword = await hold(actor, "Longsword");
      assert.deepEqual(disarmOptions({ readyItems: actor.readyWeapons() }).map(o => o.name), [sword.name], "Disarm lists the claws");
      const flags = { kind: "attack", source: { sceneId: "s", tokenId: "a" }, targets: [{ sceneId: "s", tokenId: "b" }], damageByTarget: [{ damage: 2 }],
        strike: { form: "claw", rangeKind: "melee", row: null, weapon: { id: claws.id, identifier: claws.system.identifier, name: claws.name } } };
      assert.isNull(tarHit({ messageId: "m", index: 0, success: true, flags }).weaponId, "Sticky Tar takes the claws");
      assert.isFalse(goesOn("weapon", claws), "a coating goes on the claws");
      for (const [change, key] of [[{ "flags.azeroth-rpg.coating": { name: "Oil" } }, "Coating"], [{ "flags.azeroth-rpg.generated": { base: {} } }, "Forge"], [{ "system.offHand": false }, "OffHand"]]) {
        const said = await warnings(() => claws.update(change).catch(() => null));
        assert.include(said, game.i18n.format(`AZEROTH.Claws.Refuse.${key}`, { name: claws.name }), `${key} was not refused in words`);
      }
      assert.isTrue(actor.items.get(claws.id).system.offHand, "the claws left the off hand");
    });

    it("RATING AND DEFT: a claw hit at SL 0 deals 2, at SL 2 fires Bleed, and the claws roll Dexterity (Deft)", async function () {
      this.timeout(120000);
      const actor = await sovereign("ZZ Claws Rating", { abilities: { str: 18, dex: 12, con: 14, cha: 14 } });
      const claws = clawsOf(actor);
      await claws.update({ "system.equipped": true });
      const dexLabel = game.i18n.format("AZEROTH.Deft.AbilityLine", { ability: game.i18n.localize("AZEROTH.Ability.Dex.Label") });
      const unpin = pinDie(10);
      try {
        const [card] = await cardsFrom(actor, () => attackWithDialog(actor, claws, null, { dc: 10 + (actor.system.abilities.dex.mod + actor.system.proficiency) }));
        assert.ok(card, "the claws struck nothing");
        assert.include(labels(card), dexLabel, `the claws did not roll Dexterity, as Deft: ${labels(card).join(", ")}`);
        assert.equal(card.flags[SCOPE].damage?.damage ?? card.flags[SCOPE].blowSpec?.rating, 2, "a claw hit at SL 0 did not deal 2");
      } finally { unpin(); }
      const unpin2 = pinDie(20);
      try {
        const [card] = await cardsFrom(actor, () => attackWithDialog(actor, claws, null, { dc: 5 }));
        const fired = [...parsed(card).querySelectorAll(".azeroth-card-fired .azeroth-fired span")].map(s => s.textContent.trim());
        assert.ok(fired.some(n => /^Bleed/.test(n)), `the SL 2 claw hit fired no Bleed: ${fired.join(", ")}`);
      } finally { unpin2(); }
    });

    it("BLOODED CLAWS: a free claw blow in a turn with no Attack, tier uses a rest, refused in words past them, restored by a Short Rest; rank 3 and Raking Claws 2 make three rolls, each firing the claw-hit hook", async function () {
      this.timeout(300000);
      const actor = await sovereign("ZZ Claws Ravenous", { level: 1, ranks: { "Blooded Claws": 1 } });
      const claws = clawsOf(actor);
      await claws.update({ "system.equipped": true });
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = await giveTurn(combat, actor);
      // Both Half-Actions spent on something else (a spell): the free claw blow still comes.
      await me.spendAction("action");
      await until(() => me.budget.halfActions === 0, "both Half-Actions spent");
      const unpin = pinDie(18);
      try {
        const [free] = await cardsFrom(actor, () => attackWithDialog(actor, claws));
        assert.ok(free, "the free claw blow was refused");
        await until(() => actor.getFlag(SCOPE, CLAW_USES_FLAG) === 1, "the use marked off");
        // Past the uses (tier 1): the next round, both Half-Actions spent again, refused in words.
        const turned = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.nextRound();
        await turned;
        const again2 = await giveTurn(combat, actor);
        await until(() => (again2.budget?.offHandAttacks ?? 0) === 1 && again2.budget.halfActions === 2, "a fresh round's budget");
        await again2.spendAction("action");
        await until(() => again2.budget.halfActions === 0, "both Half-Actions spent again");
        const said = await warnings(async () => {
          const again = await cardsFrom(actor, () => attackWithDialog(actor, claws));
          assert.equal(again.length, 0, "a claw blow past the uses landed with no Half-Action");
        });
        assert.include(said, game.i18n.format("AZEROTH.Claws.Refuse.NoFreeUses", { name: actor.name, left: 0, max: 1 }));
      } finally { unpin(); }
      await actor.resetUses("short");
      await until(() => !actor.getFlag(SCOPE, CLAW_USES_FLAG), "a Short Rest restored the uses");

      // Rank 3 and Raking Claws 2: three rolls, a fourth refused, each roll a claw hit.
      for (const [t, r] of [["Blooded Claws", 3], ["Raking Claws", 2]]) {
        const item = named(actor, t);
        await item.update({ "system.taken": r });
      }
      await until(() => actor.clawFacts().bloodedClawsRank === 3 && actor.clawFacts().rakingClawsRank === 2, "the ranks taken");
      const fight2 = await fightWith([actor, foe]);
      await giveTurn(fight2, actor);
      const fired = [];
      const hookId = Hooks.on(CLAW_HIT_HOOK, p => fired.push(p));
      const unpin2 = pinDie(18);
      try {
        const [first] = await cardsFrom(actor, () => attackWithDialog(actor, claws));
        assert.ok(first, "the first claw roll posted nothing");
        // The card records the turn it was made in (the fix pass's S1), so its next roll answers for this turn alone.
        const stamp = { combatId: fight2.id, round: fight2.round, turn: fight2.turn };
        assert.deepEqual(first.flags[SCOPE].clawRoll, { index: 1, of: 3, ...stamp });
        const b2 = parsed(first).querySelector('[data-action="clawRollFromCard"]');
        assert.ok(b2, "no second claw roll offered");
        assert.equal(b2.dataset.clawRoll, "2");
        // The same button on a card from an earlier round is no free attack now: the real press refuses it in words.
        await game.messages.get(first.id).setFlag(SCOPE, "clawRoll", { index: 1, of: 3, ...stamp, round: stamp.round - 1 });
        const stale = await warnings(() => CARD_ACTIONS.clawRollFromCard(b2, game.messages.get(first.id)));
        assert.include(stale, game.i18n.format("AZEROTH.Claws.Roll.Refuse.Stale", { name: actor.name }), "an old card's claw roll was made");
        await game.messages.get(first.id).setFlag(SCOPE, "clawRoll", { index: 1, of: 3, ...stamp });
        const [second] = await cardsFrom(actor, () => CARD_ACTIONS.clawRollFromCard(b2, game.messages.get(first.id)));
        assert.deepEqual(second.flags[SCOPE].clawRoll, { index: 2, of: 3, ...stamp });
        const said = await warnings(() => CARD_ACTIONS.clawRollFromCard(b2, game.messages.get(first.id)));
        assert.include(said, game.i18n.localize("AZEROTH.Claws.Roll.Refuse.Pressed"), "the same claw roll was made twice");
        const b3 = parsed(second).querySelector('[data-action="clawRollFromCard"]');
        const [third] = await cardsFrom(actor, () => CARD_ACTIONS.clawRollFromCard(b3, game.messages.get(second.id)));
        assert.deepEqual(third.flags[SCOPE].clawRoll, { index: 3, of: 3, ...stamp });
        assert.isNull(parsed(third).querySelector('[data-action="clawRollFromCard"]'), "a fourth claw roll was offered");
        const past = await warnings(() => CARD_ACTIONS.clawRollFromCard({ dataset: { itemId: claws.id, clawRoll: "4" } }, game.messages.get(third.id)));
        assert.include(past, game.i18n.format("AZEROTH.Claws.Roll.Refuse.PastCount", { name: actor.name, of: 3 }));
        // Every roll hit nobody targeted, so the hook fires for none of them; THE CLAW-HIT HOOK test below aims one.
      } finally {
        unpin2();
        Hooks.off(CLAW_HIT_HOOK, hookId);
      }
    });

    it("THE CLAW-HIT HOOK fires once for each target a claw roll hits, and never for a sword", async function () {
      this.timeout(180000);
      const actor = await sovereign("ZZ Claws Hook");
      const claws = clawsOf(actor);
      await claws.update({ "system.equipped": true });
      const sword = await hold(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const fired = [];
      const hookId = Hooks.on(CLAW_HIT_HOOK, p => fired.push(p));
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const unpin = pinDie(20);
      try {
        const [hit] = await cardsFrom(actor, () => attackWithDialog(actor, claws));
        await until(() => fired.length === 1, "one claw hit fired");
        assert.equal(fired[0].messageId, hit.id);
        assert.equal(fired[0].itemId, claws.id);
        assert.equal(fired[0].attackerUuid, actor.uuid);
        assert.equal(fired[0].targetActorUuid, foe.uuid);
        await cardsFrom(actor, () => attackWithDialog(actor, sword));
        await settle();
        assert.equal(fired.length, 1, "a sword hit fired the claw hook");
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        Hooks.off(CLAW_HIT_HOOK, hookId);
      }
    });

    it("ANIMATION: the Equip toggle plays the claws-equip cue with a sound, and a claw attack plays the claw strike with a sound", async function () {
      this.timeout(240000);
      const anim = { on: game.settings.get(SCOPE, ANIMATIONS_SETTING), sound: game.settings.get(SCOPE, ANIMATION_SOUNDS_SETTING) };
      await game.settings.set(SCOPE, ANIMATIONS_SETTING, true);
      await game.settings.set(SCOPE, ANIMATION_SOUNDS_SETTING, true);
      const recorder = new (game.system.azeroth.animations.Recorder)();
      const previous = game.system.azeroth.animations.director.setPlayer(recorder);
      try {
        const actor = await sovereign("ZZ Claws Animation");
        const claws = clawsOf(actor);
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
        await until(() => animationAvailability().ok, `animations available: ${animationAvailability().reason}`, 20000);
        const sheet = await openSheet(actor);
        try {
          recorder.reset();
          await pressRow(sheet, claws, "toggleEquipped");
          await until(() => actor.items.get(claws.id).system.equipped === true, "the claws equipped");
          await until(() => recorder.cuesFor("use", CLAWS_EQUIP_CUE).length === 1, `the claws-equip cue (skips: ${recorder.skips.map(s => s.skip)})`);
          const steps = recorder.cuesFor("use", CLAWS_EQUIP_CUE)[0].steps;
          assert.ok(steps.some(s => s.kind === "effect"), "the equip cue draws nothing");
          assert.ok(steps.some(s => s.kind === "sound"), "the equip cue plays no sound");
          // Taking them off plays nothing.
          recorder.reset();
          await sheet.render({ force: true });
          await pressRow(sheet, claws, "toggleEquipped");
          await until(() => actor.items.get(claws.id).system.equipped === false, "the claws off");
          await settle();
          assert.equal(recorder.cuesFor("use", CLAWS_EQUIP_CUE).length, 0, "taking the claws off played the cue");
          await claws.update({ "system.equipped": true });
        } finally {
          await sheet.close();
        }
        canvas.tokens.setTargets([tokenOf(foe).id]);
        recorder.reset();
        const unpin = pinDie(20);
        try {
          await cardsFrom(actor, () => attackWithDialog(actor, claws));
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        await until(() => recorder.cues.length >= 1, `the claw strike's cue (skips: ${recorder.skips.map(s => s.skip)})`);
        const all = recorder.allSteps();
        assert.ok(all.some(s => s.kind === "effect" && /claw/.test(String(s.asset))), `the claw strike drew no claw: ${all.map(s => s.asset).join(", ")}`);
        assert.ok(all.some(s => s.kind === "sound"), "the claw strike played no sound");
      } finally {
        game.system.azeroth.animations.director.setPlayer(previous);
        await game.settings.set(SCOPE, ANIMATIONS_SETTING, anim.on);
        await game.settings.set(SCOPE, ANIMATION_SOUNDS_SETTING, anim.sound);
      }
    });
  });
}

export function deftBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("08 §5's Deft, across the system (DF2 to DF4; D-1160, D-1169)", function () {
    let priorDialog;
    before(async function () {
      priorDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, priorDialog);
      await cleanup();
    });

    it("a Rogue's Deft dagger rolls Dexterity, named on the card; a longsword rolls Strength", async function () {
      this.timeout(120000);
      const rogue = await makeCharacter({ name: "ZZ Deft Rogue", classes: [["Rogue", 3]], abilities: { str: 10, dex: 16 } });
      const dagger = await hold(rogue, "Dagger");
      assert.include(dagger.system.traits, "Deft", "the pack's Dagger carries no Deft");
      const dexLabel = game.i18n.format("AZEROTH.Deft.AbilityLine", { ability: game.i18n.localize("AZEROTH.Ability.Dex.Label") });
      const unpin = pinDie(10);
      try {
        const [card] = await cardsFrom(rogue, () => attackWithDialog(rogue, dagger));
        assert.include(labels(card), dexLabel, `the Deft dagger did not roll Dexterity: ${labels(card).join(", ")}`);
        const strong = await makeCharacter({ name: "ZZ Deft Warrior", classes: [["Warrior", 3]], abilities: { str: 16, dex: 10 } });
        const sword = await hold(strong, "Longsword");
        const [blow] = await cardsFrom(strong, () => attackWithDialog(strong, sword));
        assert.include(labels(blow), game.i18n.localize("AZEROTH.Ability.Str.Label"), "the longsword did not roll Strength");
        assert.notInclude(labels(blow), dexLabel);
      } finally { unpin(); }
    });

    it("a Classic dagger find carries Deft from its base", async function () {
      this.timeout(120000);
      const pack = game.packs.get(PACK_FOR.weapon);
      const docs = await pack.getDocuments();
      const finds = docs.filter(d => d.flags?.[SCOPE]?.classic && /^Dagger\b/.test(String(d.flags?.[SCOPE]?.base ?? "")));
      assert.isAbove(finds.length, 0, "no Classic find sits on the Dagger base");
      const lacking = finds.filter(d => !(d.system.traits ?? []).includes("Deft")).map(d => d.name);
      assert.deepEqual(lacking, [], `Classic finds on the Dagger base without Deft: ${lacking.join(", ")}`);
    });

    it("the migration restamps an owned dagger made before the build with Deft and logs it, and leaves a longsword alone", async function () {
      this.timeout(180000);
      const owner = await makeCharacter({ name: "ZZ Deft Migration", classes: [["Rogue", 2]] });
      const daggerDoc = (await fromPack(PACK_FOR.weapon, "Dagger")).toObject();
      const swordDoc = (await fromPack(PACK_FOR.weapon, "Longsword")).toObject();
      const oldTraits = daggerDoc.system.traits.filter(t => t !== "Deft");
      const [dagger, sword] = await owner.createEmbeddedDocuments("Item", [
        { ...daggerDoc, system: { ...daggerDoc.system, traits: oldTraits } },
        { ...swordDoc }
      ], { ...KNOWN });
      const swordTraits = [...sword.system.traits];
      assert.notInclude(owner.items.get(dagger.id).system.traits, "Deft", "the old-world dagger already holds Deft");
      // The law alone, against the pack copy.
      assert.deepEqual(buildDeftUpdate({ traits: oldTraits }, daggerDoc.system)?.["system.traits"], daggerDoc.system.traits);
      const { migrate } = await import("../migrations/0.15.4.2-deft.mjs");
      const log = [];
      await migrate(line => log.push(String(line)));
      await until(() => owner.items.get(dagger.id).system.traits.includes("Deft"), "the dagger restamped");
      assert.deepEqual(owner.items.get(dagger.id).system.traits, daggerDoc.system.traits, "the dagger's list is not the pack's");
      assert.deepEqual(owner.items.get(sword.id).system.traits, swordTraits, "the longsword was touched");
      assert.ok(log.some(l => l.includes(owner.name) && l.includes(dagger.name)), `the touched dagger was not logged: ${log.slice(-5).join(" | ")}`);
      // A second run writes nothing for it.
      const again = [];
      await migrate(line => again.push(String(line)));
      assert.notOk(again.some(l => l.includes(owner.name) && l.includes(dagger.name)), "the second run touched the dagger again");
    });
  });
}
