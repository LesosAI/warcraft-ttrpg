/**
 * **THE SPIRIT WALKER'S TWELVE, LIVE** (04-TALENTS, the Tauren's Legacy on the
 * Shaman; the Legacy branches' phase B6b). A tauren Shaman holds the Spirit Walker's
 * twelve beside the class's thirty-six (B5's door 1), and each talent here is pressed
 * through the sheet's own control or met at the door that asks it, its outcome read
 * back off the documents:
 *
 * - The Crossing, pressed on the sheet in a fight, steps the shaman into the Spirit
 *   Realm for 4 Mana - two Half-Actions a turn there at rank 2 - where the sheet's
 *   Attack is refused in words, and pressed again steps back for nothing;
 * - Hold the Thread holds a Dying friend's Death Step within 30 feet, asked of the
 *   shaman as the step would be taken, for 2 Mana and the counter's one use; with
 *   the use spent nobody is asked and the step is taken; and its Ward of a rank
 *   against Nature and Shadow stands on the shaman;
 * - Shared Burden, asked in the blow, takes half of a friend's damage onto the shaman
 *   for 2 Mana, met by the shaman's own Armor Points, the rest staying where it was
 *   aimed - and pressed from the sheet it is refused in words;
 * - Ancestor's Hand refuses in words where no Dying friend is in reach, and lifts every
 *   Dying friend within 30 feet by the tier a rank and stands them, leaving one 40 feet
 *   off where it lies;
 * - Ethereal Form with Kindred Spirits refuses a hostile creature named, and covers the
 *   friend named beside the shaman, halving a physical blow on it.
 *
 * Written in B6b and NOT run (the brief: offline, Vitest only). The packs must be
 * built from the current `packs-src/` first (`npm run packs:build`), since the
 * Legacy talents ride the talents pack. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-spirit-walker`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, PACK_FOR, fromPack, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { realmStateFor } from "../effects/spirit-realm.mjs";
import { applyCondition } from "../effects/durations.mjs";
import { AZEROTH } from "../config.mjs";

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const workflows = () => game.system.azeroth.workflows;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const health = actor => actor.system?.health?.value ?? 0;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const etherealOn = actor => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.ethereal) ?? null;

/** The control the Combat tab draws for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`)
  ?? sheet.element?.querySelector(`[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;

/** The Attack the Combat tab draws for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Legacy Spirit Walker Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors, by their tokens, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens?.(true)?.[0]?.document ?? null;
    return token ? { actorId: a.id, tokenId: token.id, sceneId: token.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** Fill a pool. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => poolOf(actor, name).value === pool.max, `${name} full`);
  return poolOf(actor, name);
}

/** Set a creature's Health. */
async function setHealth(actor, value) {
  await actor.update({ "system.health.value": value });
  await until(() => health(actor) === value, `${actor.name} at ${value} Health`);
}

/** A weapon from the pack, in hand. */
async function wield(actor, name) {
  const source = (await fromPack(PACK_FOR.weapon, name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} in hand`);
  return actor.items.get(item.id);
}

/**
 * A tauren Shaman at a level, the Spirit Walker's twelve on the sheet, with these
 * talents taken - waiting for each grant the ranks make.
 */
async function spiritWalkerWith(name, { level = 9, ranks = {}, abilities = { wis: 16, con: 14 } } = {}) {
  const tauren = await makeCharacter({ name, race: "Tauren", classes: [["Shaman", level]], abilities });
  await until(() => tauren.items.filter(i => i.type === "talent" && i.system?.legacy === "Tauren").length === 12, "the Spirit Walker's twelve", 30000);
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(tauren, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
    await until(() => talentNamed(tauren, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return tauren;
}

/** Press a sheet's control, the die pinned, and take the card it posts. */
async function pressForCard(control, speaker, face = 15, { ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id);
  const unpin = pinDie(face);
  try {
    el.click();
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/**
 * Answer the ask a holder's door opened on this client (D-777; the death hold's own
 * dialog is the blow doors' `confirmHere`): its id starts with the holder's own, and
 * `yes` or `no` is pressed.
 */
async function answer(holder, action = "yes", ms = 15000) {
  const app = await until(() => [...foundry.applications.instances.values()]
    .find(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${holder.id}`) && a.rendered), `${holder.name}'s ask`, ms);
  app.element.querySelector(`button[data-action="${action}"]`).click();
  await until(() => !app.rendered, `${holder.name}'s ask to close`);
}

/** Whether an ask stands open for this holder. */
const askOpen = holder => [...foundry.applications.instances.values()].some(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${holder.id}`) && a.rendered);

export function legacySpiritWalkerBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Spirit Walker's twelve (the Tauren's Legacy; B6b)", function () {
    let restore = null;
    let wasViewing = null;
    let quietText = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quietText = await quietScrollingText();
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
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("THE CROSSING: pressed on the sheet in a fight, the shaman is in the Spirit Realm for 4 Mana with two Half-Actions a turn at rank 2, the Attack is refused in words, and a second press steps back for nothing", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Crossing", { level: 5, ranks: { "The Crossing": 2 } });
      const mace = await wield(tauren, "Mace");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([tauren, ghoul]);
      await giveTurn(combat, tauren);
      const full = (await fill(tauren, "mana")).value;
      const crossing = await until(() => featureNamed(tauren, "The Crossing"), "The Crossing granted");
      const sheet = await openSheet(tauren);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const card = await pressForCard(useControl(sheet, crossing), tauren, 15);
        assert.include(textOf(card), game.i18n.format("AZEROTH.Spirit.Crossed", { name: tauren.name, n: 1 }));
        await until(() => realmStateFor(tauren).in === true, "the shaman in the Spirit Realm");
        const realm = realmStateFor(tauren);
        assert.equal(realm.by, "crossing");
        assert.equal(realm.halfActions, 2, "rank 2's two Half-Actions a turn in the realm");
        assert.equal(realm.heals, "others", "the realm's heals are not The Crossing's");
        await until(() => poolOf(tauren, "mana").value === full - 4, "4 Mana paid");
        // *You cannot touch the living world*: the sheet's Attack, refused in words.
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        const before = game.messages.size;
        const said = await warnings(async () => {
          attackControl(sheet, mace)()?.click();
          await sleep(1500);
        });
        assert.include(said, game.i18n.format("AZEROTH.Spirit.Refuse.Attack", { name: tauren.name }), `no refusal in words: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused attack posted a card");
        canvas.tokens.setTargets([]);
        // Pressed again: stepped back, for nothing.
        const mana = poolOf(tauren, "mana").value;
        const back = await pressForCard(useControl(sheet, crossing), tauren, 15);
        assert.include(textOf(back), game.i18n.format("AZEROTH.Spirit.SteppedBack", { name: tauren.name, feature: "The Crossing" }));
        await until(() => realmStateFor(tauren).in === false, "the shaman back in the living world");
        assert.equal(poolOf(tauren, "mana").value, mana, "stepping back cost Mana");
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
    });

    it("HOLD THE THREAD: a Dying friend's Death Step within 30 feet is asked of the shaman and held for 2 Mana and the counter's one use; with the use spent nobody is asked and the step is taken", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Thread", { level: 5, ranks: { "Hold the Thread": 1 } });
      const dying = await makeCharacter({ name: "ZZ LSW Thread Dying", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: dying, x: 1300, y: 1000 }]);
      const full = (await fill(tauren, "mana")).value;
      const counter = await until(() => featureNamed(tauren, "Hold the Thread"), "the hold's counter granted");
      assert.deepEqual({ max: counter.system.uses.max, per: counter.system.uses.per }, { max: 1, per: "short" }, "the counter is not the rank a Short Rest");
      // The Ward a rank against Nature and Shadow, standing.
      await until(() => (tauren.system.ward?.nature ?? 0) >= 1 && (tauren.system.ward?.shadow ?? 0) >= 1, "Ward 1 against Nature and Shadow");
      // Pressed from the sheet it is refused in words, nothing spent: the hold is asked at the step.
      let result = "pending";
      const said = await warnings(async () => { result = await workflows().useFeature({ actor: tauren, item: counter }); });
      assert.isNull(result, "a hold pressed from the sheet went ahead");
      assert.include(said, game.i18n.format("AZEROTH.DeathHold.SheetUse", { name: "Hold the Thread", feet: 30 }), `no refusal in words: ${JSON.stringify(said)}`);
      assert.equal(poolOf(tauren, "mana").value, full, "the refused press spent Mana");
      assert.equal(tauren.items.get(counter.id)?.system?.uses?.value, 1, "the refused press struck the counter");
      await setHealth(dying, 0);
      const step = dying.takeDeathStep();
      await answer(tauren, "yes");
      await step;
      await sleep(500);
      assert.equal(dying.system.deathSteps ?? 0, 0, "the held step was taken");
      await until(() => poolOf(tauren, "mana").value === full - 2, "2 Mana paid");
      await until(() => tauren.items.get(counter.id)?.system?.uses?.value === 0, "the counter's use struck by the hold");
      // The use spent: nobody is asked, and the step lands.
      await dying.takeDeathStep();
      await until(() => (dying.system.deathSteps ?? 0) === 1, "the step taken with the counter spent");
      assert.isFalse(askOpen(tauren), "the shaman was asked with no use left");
    });

    it("SHARED BURDEN: asked in the blow, half a friend's damage lands on the shaman for 2 Mana, met by the shaman's own Armor Points, the rest where it was aimed; from the sheet it is refused in words", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Burden", { level: 5, ranks: { "Shared Burden": 1 } });
      const ally = await makeCharacter({ name: "ZZ LSW Burden Ally", classes: [["Warrior", 5]] });
      for (const a of [tauren, ally]) await a.setParty(true);
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: ally, x: 1300, y: 1000 }]);
      await setHealth(tauren, tauren.system.health.max);
      await setHealth(ally, ally.system.health.max);
      const full = (await fill(tauren, "mana")).value;
      const wasT = health(tauren);
      const wasA = health(ally);
      // The share is met by the shaman's own Body Armor Points (the plan's *As read*).
      const ownAP = Math.max(0, Math.trunc(Number(tauren.system.ap?.body)) || 0);
      const blow = ally.applyDamage(7, { struck: true, attack: true, messageId: "ZZBurdenCard" });
      await answer(tauren, "yes");
      await blow;
      await until(() => health(tauren) === wasT - Math.max(0, 3 - ownAP), "half of 7, rounded down, on the shaman, less the shaman's own Armor Points");
      assert.equal(health(ally), wasA - 4, "the rest did not stay on the friend");
      await until(() => poolOf(tauren, "mana").value === full - 2, "2 Mana paid");
      const burden = await until(() => featureNamed(tauren, "Shared Burden"), "Shared Burden granted");
      let result = "pending";
      const said = await warnings(async () => { result = await workflows().useFeature({ actor: tauren, item: burden }); });
      assert.isNull(result, "Shared Burden pressed from the sheet went ahead");
      assert.include(said, game.i18n.format("AZEROTH.BlowDoor.SheetUse", { name: "Shared Burden", feet: 30 }), `no refusal in words: ${JSON.stringify(said)}`);
      assert.equal(poolOf(tauren, "mana").value, full - 2, "the refused press spent Mana");
    });

    it("ANCESTOR'S HAND: refused in words with no Dying friend in reach; then every Dying friend within 30 feet restores the tier a rank and stands, and one 40 feet off is left", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Hand", { level: 5, ranks: { "Hold the Thread": 1, "Ancestor's Hand": 1 } });
      const near = await makeCharacter({ name: "ZZ LSW Hand Near", classes: [["Warrior", 5]] });
      const far = await makeCharacter({ name: "ZZ LSW Hand Far", classes: [["Warrior", 5]] });
      for (const a of [tauren, near, far]) await a.setParty(true);
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: near, x: 1300, y: 1000 }, { actor: far, x: 1800, y: 1000 }]);
      const full = (await fill(tauren, "mana")).value;
      const hand = await until(() => featureNamed(tauren, "Ancestor's Hand"), "Ancestor's Hand granted");
      // Nobody Dying: refused in words, nothing paid.
      let result = "pending";
      const said = await warnings(async () => { result = await workflows().useFeature({ actor: tauren, item: hand }); });
      assert.isNull(result, "Ancestor's Hand went ahead with nobody Dying");
      assert.include(said, game.i18n.format("AZEROTH.Lift.NoneDying", { name: "Ancestor's Hand", feet: 30 }), `no refusal in words: ${JSON.stringify(said)}`);
      assert.equal(poolOf(tauren, "mana").value, full, "the refused Use spent Mana");
      // Both friends Dying and Prone.
      for (const a of [near, far]) {
        await setHealth(a, 0);
        if (!a.statuses.has("prone")) await applyCondition(a, "prone");
        await until(() => a.statuses.has("prone"), `${a.name} Prone`);
      }
      const sheet = await openSheet(tauren);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        await pressForCard(useControl(sheet, hand), tauren, 15);
      } finally {
        await sheet.close();
      }
      // Tier 2 at rank 1: the tier a rank is 2.
      await until(() => health(near) === 2, "the near friend lifted by the tier a rank");
      await until(() => !near.statuses.has("prone"), "the near friend standing");
      assert.equal(health(far), 0, "a Dying friend 40 feet off was lifted");
      assert.isTrue(far.statuses.has("prone"), "a friend 40 feet off was stood up");
      await until(() => poolOf(tauren, "mana").value === full - 4, "4 Mana paid");
    });

    it("ETHEREAL FORM AND KINDRED SPIRITS: a hostile creature named is refused in words; the friend named is covered beside the shaman, and a physical blow on it is halved", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Ethereal", { level: 9, ranks: { "Ethereal Form": 1, "Kindred Spirits": 1 } });
      const ally = await makeCharacter({ name: "ZZ LSW Kindred", classes: [["Warrior", 5]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      for (const a of [tauren, ally]) await a.setParty(true);
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: ally, x: 1300, y: 1000 }, { actor: ghoul, x: 1000, y: 1300, side: "hostile" }]);
      const full = (await fill(tauren, "mana")).value;
      const form = await until(() => featureNamed(tauren, "Ethereal Form"), "Ethereal Form granted");
      const sheet = await openSheet(tauren);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        const before = game.messages.size;
        const said = await warnings(async () => {
          useControl(sheet, form)()?.click();
          await sleep(1500);
        });
        assert.include(said, game.i18n.format("AZEROTH.Ethereal.Refuse.NotFriendly", { name: "Ethereal Form", talent: "Kindred Spirits", n: 1, feet: 30 }), `no refusal in words: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused Ethereal Form posted a card");
        assert.equal(poolOf(tauren, "mana").value, full, "a refused Ethereal Form spent Mana");
        canvas.tokens.setTargets([tokenOf(ally).id]);
        await settle();
        await pressForCard(useControl(sheet, form), tauren, 15);
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      await until(() => etherealOn(tauren) && etherealOn(ally), "both ethereal");
      await until(() => poolOf(tauren, "mana").value === full - 6, "6 Mana paid");
      await setHealth(ally, ally.system.health.max);
      const was = health(ally);
      await ally.applyDamage(9, { struck: true, type: "physical" });
      await until(() => health(ally) === was - 4, "nine physical halved to four on the friend");
    });

    it("ETHEREAL FORM AT RANK 2, EITHER WAY: off the shaman's turn the Use is its Reaction with nothing asked; on it, with both to pay, the chooser asks, and the Reaction answered keeps both Half-Actions", async function () {
      this.timeout(300000);
      const tauren = await spiritWalkerWith("ZZ LSW Ethereal Rungs", { level: 9, ranks: { "Ethereal Form": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }]);
      const form = await until(() => featureNamed(tauren, "Ethereal Form"), "Ethereal Form granted");
      // *At rank 2 you may use it as a Reaction* - a second way (the B6 review), never the only one.
      assert.equal(form.system.action, "half", "rank 2 took the Half-Action away");
      assert.deepEqual(form.system.rungs, ["half", "reaction"], "rank 2 does not stamp both rungs");
      const combat = await fightWith([tauren, ghoul]);
      const mine = combat.getCombatantsByActor(tauren)[0];
      // Off the shaman's turn only the Reaction can pay: taken, nothing asked.
      await giveTurn(combat, ghoul);
      await fill(tauren, "mana");
      const sheet = await openSheet(tauren);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        // What the press says in words if it posts nothing (B8b: off the turn it posted no
        // card, and the hook's timeout alone named nothing).
        let off = null;
        const heard = await warnings(async () => {
          off = await pressForCard(useControl(sheet, form), tauren, 15).catch(err => err);
        });
        if (off instanceof Error) throw new Error(`${off.message}; said in words: ${JSON.stringify(heard)}`);
        await until(() => mine.budget.reactions === 0, "the Reaction spent off the turn");
        assert.include(textOf(off), game.i18n.localize(AZEROTH.actions.reaction), "the card does not say it was taken as a Reaction");
        await until(() => etherealOn(tauren), "the shaman ethereal");
        await tauren.deleteEmbeddedDocuments("ActiveEffect", [etherealOn(tauren).id]);
        // On the shaman's turn both can pay: the one chooser asks which.
        // FORWARD to the shaman's turn, a turn at a time (B8b): `giveTurn` writes the turn
        // index, and where the shaman stands before the ghoul that is a rewind, on which
        // core starts no turn - so its budget was never reset and the wait never ended.
        for (let i = 0; i < 4 && combat.combatant?.actorId !== tauren.id; i++) {
          const turned = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
          await combat.nextTurn();
          await turned;
        }
        await until(() => mine.budget.reactions === 1 && mine.budget.halfActions === 2, "a fresh turn");
        await fill(tauren, "mana");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === tauren.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
        const unpin = pinDie(15);
        try {
          useControl(sheet, form)()?.click();
          const app = await until(() => {
            const found = foundry.applications.instances.get(`azeroth-choose-${form.id}`);
            return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
          }, "the rung's chooser");
          const reaction = game.i18n.localize(AZEROTH.actions.reaction);
          const select = app.element.querySelector("#azeroth-choose-select");
          if (select) select.value = [...select.options].find(o => o.textContent.trim().startsWith(reaction))?.value ?? select.value;
          else for (const box of app.element.querySelectorAll('input[name="choice"]')) box.checked = (box.closest("label")?.textContent ?? "").trim().startsWith(reaction);
          app.element.querySelector('button[data-action="choose"]').click();
          const [card] = await posted;
          made.push(card);
        } finally {
          unpin();
        }
        await until(() => mine.budget.reactions === 0, "the Reaction the chooser named spent");
        assert.equal(mine.budget.halfActions, 2, "the Reaction answered spent a Half-Action too");
      } finally {
        await sheet.close();
      }
    });

    it("ETHEREAL FORM'S CHIP NAMES BOTH RUNGS AT RANK 2 (the B8a pass; written offline, not run), and its own alone at rank 1", async function () {
      this.timeout(240000);
      const tauren = await spiritWalkerWith("ZZ LSW Ethereal Chip", { level: 9, ranks: { "Ethereal Form": 1 } });
      const chip = async () => {
        const sheet = await openSheet(tauren);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const form = featureNamed(tauren, "Ethereal Form");
          return [...(sheet.element?.querySelectorAll(`section[data-tab="combat"] .azeroth-feature[data-item-id="${form?.id}"] .azeroth-feature-chip`) ?? [])].map(c => c.textContent.trim());
        } finally {
          await sheet.close();
        }
      };
      const half = game.i18n.localize(AZEROTH.actions.half);
      const reaction = game.i18n.localize(AZEROTH.actions.reaction);
      await until(() => featureNamed(tauren, "Ethereal Form"), "Ethereal Form granted");
      const one = await chip();
      assert.include(one, half, "rank 1's chip does not name the Half-Action");
      assert.notInclude(one.join(" "), reaction, "rank 1's chip names a Reaction it cannot be taken as");
      const t = talentNamed(tauren, "Ethereal Form");
      await t.update({ "system.taken": 2 });
      await until(() => (featureNamed(tauren, "Ethereal Form")?.system?.rungs ?? []).length === 2, "rank 2's two rungs stamped");
      const two = await chip();
      assert.include(two, game.i18n.format("AZEROTH.Feature.RungEither", { first: half, second: reaction }), `rank 2's chip does not name both rungs: ${JSON.stringify(two)}`);
    });
  });
}
