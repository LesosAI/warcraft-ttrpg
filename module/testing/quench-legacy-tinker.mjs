/**
 * **THE TINKER'S TWELVE, LIVE** (04-TALENTS, the Gnome's Legacy on the Rogue; the
 * Legacy branches' phase B6b). A gnome Rogue holds the Tinker's twelve beside the
 * class's thirty-six (B5's door 1), and each talent here is pressed through the
 * sheet's own control, its outcome read back off the documents:
 *
 * - The Bench is refused in words with no tinker's kit and in a fight, and with a
 *   kit, out of a fight, its one chooser builds a Gnomish Battle Chicken bound to the
 *   gnome as a construct - which, in a fight, spends the ONE Half-Action the
 *   constructs share on the tinker's record, and has none left after;
 * - Gadgeteer's checklist names two gadgets, each granted its own Use once a Short
 *   Rest, and the Recombobulator, pressed on the sheet at a Deafened ally, ends it
 *   and spends its use;
 * - the Arclight Spanner mends one construct targeted - the tier a rank, one
 *   condition on it ended - and refuses a creature that is no construct in words;
 * - Pocket Factory, pressed on the sheet in a fight, assembles two Clockwork Gnomes
 *   at the point picked within 30 feet, each in the fight with one Half-Action of
 *   its own.
 *
 * Written in B6b and NOT run (the brief: offline, Vitest only). The packs must be
 * built from the current `packs-src/` first (`npm run packs:build`): the Legacy
 * talents ride the talents pack, and the Gnomish Battle Chicken and the Clockwork
 * Gnome are 14's blocks in the bestiary pack. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-tinker`. Every document a test makes is deleted
 * in `after`.
 */

import { cleanup, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { cancelPick, pickState } from "../canvas/place.mjs";
import { CONSTRUCT_TURN_FLAG } from "../rules/constructs.mjs";
import { boundOf, bondOf } from "../documents/bound.mjs";
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
const gadgetNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name && i.getFlag("azeroth-rpg", "feature")?.gadget) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const health = actor => actor.system?.health?.value ?? 0;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");

/** The control the Combat tab draws for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`)
  ?? sheet.element?.querySelector(`[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;

/** Press the 2D board at a canvas point, as a browser does (B2's `pressBoard`). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Legacy Tinker Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
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

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** A gnome Rogue at a level, the Tinker's twelve on the sheet, with these talents taken and their grants landed. */
async function tinkerWith(name, { level = 5, ranks = {}, abilities = { dex: 16, int: 16 } } = {}) {
  const gnome = await makeCharacter({ name, race: "Gnome", classes: [["Rogue", level]], abilities });
  await until(() => gnome.items.filter(i => i.type === "talent" && i.system?.legacy === "Gnome").length === 12, "the Tinker's twelve", 30000);
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(gnome, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
    await until(() => talentNamed(gnome, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return gnome;
}

/** The chooser an item opened, once rendered. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/** Pick these options by name in the chooser, select or checklist alike, and press its button. */
async function pick(app, names) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
    if (!option) throw new Error(`the chooser offers no ${names[0]}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) {
      const label = box.closest("label")?.textContent?.trim() ?? "";
      box.checked = names.some(n => label.startsWith(n));
    }
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
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

/** The constructs bound to a tinker, as the world holds them. */
const constructsOf = gnome => boundOf(gnome, "construct");

export function legacyTinkerBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Tinker's twelve (the Gnome's Legacy; B6b)", function () {
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
      cancelPick();
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      // What the binds made in the Bound folder for these tinkers, beside what the tests made.
      for (const a of game.actors.filter(x => String(bondOf(x)?.ownerName ?? "").startsWith("ZZ LT ") && !made.includes(x))) {
        await a.delete().catch(() => {});
      }
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("THE BENCH: refused in words with no tinker's kit and in a fight, and nothing is built", async function () {
      this.timeout(180000);
      const gnome = await tinkerWith("ZZ LT Bench Refused", { level: 3, ranks: { "The Bench": 1 } });
      const bench = await until(() => featureNamed(gnome, "The Bench"), "The Bench granted");
      let result = "pending";
      let said = await warnings(async () => { result = await workflows().useFeature({ actor: gnome, item: bench }); });
      assert.isNull(result, "a build with no kit went ahead");
      assert.include(said, game.i18n.format("AZEROTH.Construct.Refuse.NoKit", { name: "The Bench" }), `no refusal in words: ${JSON.stringify(said)}`);
      await give(gnome, "Tinker's kit");
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }]);
      await fightWith([gnome]);
      result = "pending";
      said = await warnings(async () => { result = await workflows().useFeature({ actor: gnome, item: bench }); });
      assert.isNull(result, "a build in a fight went ahead");
      assert.include(said, game.i18n.format("AZEROTH.Construct.Refuse.InFight", { name: "The Bench" }), `no refusal in words: ${JSON.stringify(said)}`);
      assert.lengthOf(constructsOf(gnome), 0, "a refused build bound a construct");
    });

    it("THE BENCH: with a kit, out of a fight, the sheet's chooser builds a Gnomish Battle Chicken bound to the gnome; in a fight it spends the constructs' one shared Half-Action on the tinker's record", async function () {
      this.timeout(240000);
      const gnome = await tinkerWith("ZZ LT Bench", { level: 3, ranks: { "The Bench": 1 } });
      await give(gnome, "Tinker's kit");
      const bench = await until(() => featureNamed(gnome, "The Bench"), "The Bench granted");
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const control = useControl(sheet, bench)();
        assert.ok(control, "the sheet draws no Use for The Bench");
        const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === gnome.id);
        control.click();
        await pick(await chooser(bench), ["Gnomish Battle Chicken"]);
        const [card] = await posted;
        made.push(card);
      } finally {
        await sheet.close();
      }
      const chicken = await until(() => constructsOf(gnome)[0] ?? null, "the construct bound", 30000);
      made.push(chicken);
      assert.equal(bondOf(chicken)?.entryName, "Gnomish Battle Chicken", "the construct is not 14's Gnomish Battle Chicken");
      assert.equal(bondOf(chicken)?.ownerUuid, gnome.uuid, "the construct is not the gnome's");
      // In a fight beside the gnome: the one Half-Action the constructs share.
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: chicken, x: 1100, y: 1000 }]);
      const combat = await fightWith([gnome, chicken]);
      const [mine, its] = [gnome, chicken].map(x => combat.getCombatantsByActor(x)[0]);
      // On the construct's own turn (the lead: *"Refuse off-turn Half-Actions"*).
      await giveTurn(combat, chicken);
      assert.equal(its.budget.halfActions, 1, "a construct took 05's two Half-Actions rather than the shared one");
      assert.isTrue((await its.spendAction("half")).ok, "the construct could not spend the shared Half-Action");
      await until(() => (mine.getFlag("azeroth-rpg", CONSTRUCT_TURN_FLAG)?.halves ?? 0) === 1, "the tinker's record of the Half-Action");
      let refused = null;
      await warnings(async () => { refused = await its.spendAction("half"); });
      assert.isFalse(refused?.ok ?? true, "the construct spent a second Half-Action this turn");
    });

    it("REMOTE CONTROL AT RANK 2 (the B9a pass): a construct takes no Half-Action on the tinker's turn, and the Reaction gives it one to take at once - one, and the next is refused in words again", async function () {
      this.timeout(240000);
      // 05 (the lead, 2026-10-23: *"Refuse off-turn Half-Actions"*): a Half-Action is spent
      // in its owner's own turn, and 04's *one of your constructs within 60 feet takes a
      // Half-Action at once* is the exception, granted through the combatant's own queued
      // door (`rules/initiative.mjs#grantAtOnce`).
      const gnome = await tinkerWith("ZZ LT Remote", { level: 9, ranks: { "The Bench": 1, "Remote Control": 2 } });
      await give(gnome, "Tinker's kit");
      const bench = await until(() => featureNamed(gnome, "The Bench"), "The Bench granted");
      const benchSheet = await openSheet(gnome);
      try {
        benchSheet.changeTab("combat", "primary");
        await settle();
        const built = untilHook("createChatMessage", 60000, m => m.speaker?.actor === gnome.id);
        useControl(benchSheet, bench)()?.click();
        await pick(await chooser(bench), ["Gnomish Battle Chicken"]);
        const [card] = await built;
        made.push(card);
      } finally {
        await benchSheet.close();
      }
      const chicken = await until(() => constructsOf(gnome)[0] ?? null, "the construct bound", 30000);
      made.push(chicken);
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: chicken, x: 1100, y: 1000 }]);
      const combat = await fightWith([gnome, chicken]);
      const its = combat.getCombatantsByActor(chicken)[0];
      await giveTurn(combat, gnome);
      await until(() => (its.budget?.halfActions ?? 0) >= 1, "a Half-Action the construct holds for its own turn");
      // On the tinker's turn the construct's own Half-Action is not its to spend.
      let refused = null;
      const said = await warnings(async () => { refused = await its.spendAction("half"); });
      assert.isFalse(refused?.ok ?? true, "a construct spent a Half-Action on the tinker's turn");
      assert.equal(refused.reason, "AZEROTH.Budget.Refuse.NotYourTurn", "the construct was refused for another reason");
      assert.include(said, game.i18n.localize("AZEROTH.Budget.Refuse.NotYourTurn"), `the refusal was not said in words: ${JSON.stringify(said)}`);
      // Remote Control's Reaction: 2 Energy, and the construct takes a Half-Action AT ONCE.
      await setPool(gnome, "energy", 10);
      const remote = await until(() => featureNamed(gnome, "Remote Control"), "Remote Control's Use granted at rank 2");
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const card = await pressForCard(useControl(sheet, remote), gnome, 15);
        assert.include(textOf(card), game.i18n.format("AZEROTH.Construct.HalfGranted", { name: chicken.name }), "the card does not say the construct takes a Half-Action at once");
      } finally {
        await sheet.close();
      }
      await until(() => poolOf(gnome, "energy").value === 8, "Remote Control's 2 Energy");
      await until(() => (its.getFlag("azeroth-rpg", "budget")?.atOnce ?? 0) === 1, "the Half-Action given to be taken at once");
      const taken = await its.spendAction("half");
      assert.isTrue(taken.ok, "the construct could not take the Half-Action Remote Control gave it");
      await until(() => (its.getFlag("azeroth-rpg", "budget")?.atOnce ?? 0) === 0, "the at-once Half-Action spent");
      // Only the one: the next is the tinker's turn again, and refused in words.
      let again = null;
      await warnings(async () => { again = await its.spendAction("half"); });
      assert.isFalse(again?.ok ?? true, "the construct took a second Half-Action on the tinker's turn");
      assert.equal(again.reason, "AZEROTH.Budget.Refuse.NotYourTurn");
    });

    it("CLUSTER ROCKETS: the point picked within 60 feet of the construct before the Energy; every creature within 10 feet of it gathered, the gnome's own ally among them; half on a passed Test, rounded down before the Ward, and the whole on a failure", async function () {
      this.timeout(300000);
      const gnome = await tinkerWith("ZZ LT Rockets", { level: 5, ranks: { "The Bench": 1, "Cluster Rockets": 1 } });
      await give(gnome, "Tinker's kit");
      const bench = await until(() => featureNamed(gnome, "The Bench"), "The Bench granted");
      const benchSheet = await openSheet(gnome);
      try {
        benchSheet.changeTab("combat", "primary");
        await settle();
        const built = untilHook("createChatMessage", 60000, m => m.speaker?.actor === gnome.id);
        useControl(benchSheet, bench)()?.click();
        await pick(await chooser(bench), ["Gnomish Battle Chicken"]);
        const [card] = await built;
        made.push(card);
      } finally {
        await benchSheet.close();
      }
      const chicken = await until(() => constructsOf(gnome)[0] ?? null, "the construct bound", 30000);
      made.push(chicken);
      const ally = await makeCharacter({ name: "ZZ LT Rockets Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      for (const a of [gnome, ally]) await a.setParty(true);
      // The point (1850, 1050) is in the ghoul's square, the ally's square touches it, and
      // the chicken stands 32 feet off it; the gnome is far outside the circle.
      await sceneWith([
        { actor: gnome, x: 1000, y: 1000 }, { actor: chicken, x: 1100, y: 1000 },
        { actor: ghoul, x: 1800, y: 1000, side: "hostile" }, { actor: ally, x: 1800, y: 1100 }
      ]);
      await setPool(gnome, "energy", 10);
      const rockets = await until(() => featureNamed(gnome, "Cluster Rockets"), "Cluster Rockets granted");
      const sheet = await openSheet(gnome);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === gnome.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
        useControl(sheet, rockets)()?.click();
        await until(() => pickState()?.mode === "point", "the rockets' pick");
        // Picked before anything is paid: the Energy still in hand while the pick waits.
        assert.equal(poolOf(gnome, "energy").value, 10, "the Energy was paid before the point was picked");
        pressBoard({ x: 1850, y: 1050 });
        [card] = await posted;
        made.push(card);
      } finally {
        cancelPick();
        await sheet.close();
      }
      await until(() => poolOf(gnome, "energy").value === 6, "the rockets' 4 Energy");
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      // *Every creature within 10 feet of that point*: the ghoul AND the ally, never the gnome.
      assert.deepEqual(flags.targets.map(t => t.tokenId).sort(), [tokenOf(ghoul).id, tokenOf(ally).id].sort(), "the Use did not gather every creature at the point");
      assert.include(flags.gathered ?? {}, { who: "creature", feet: 10, origin: "point" });
      assert.equal(flags.damageType, "fire", "the card records no damage type");
      assert.isTrue(flags.halfOnPass, "the card does not halve on a pass");
      const tier = gnome.system.tier;
      const worth = tier + 2;
      const at = actor => flags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      for (const actor of [ghoul, ally]) {
        const i = at(actor);
        const ward = flags.targets[i].wardBySchool?.fire ?? 0;
        assert.equal(flags.damageByTarget[i].damage, Math.max(0, worth - ward), `${actor.name}'s whole is not the tier plus twice the rank, less its Ward`);
        assert.equal(flags.passedByTarget[i].damage, Math.max(0, Math.floor(worth / 2) - ward), `${actor.name}'s half is not half the worth, less its Ward`);
      }
      const resistOn = actor => parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`);
      const applyOn = async actor => (await doc().renderHTML()).querySelector(`button[data-action="applyDamage"][data-target-index="${at(actor)}"]`);
      // The ghoul passes and takes the half; the ally fails and takes the whole.
      for (const [actor, face] of [[ghoul, 20], [ally, 1]]) {
        const unpin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(resistOn(actor), doc());
        } finally {
          unpin();
        }
        await until(() => Object.values(doc().flags["azeroth-rpg"].resists ?? {}).some(r => r.tokenId === tokenOf(actor).id), `${actor.name}'s Test recorded`);
      }
      const ghoulBefore = health(ghoul);
      await CARD_ACTIONS.applyDamage(await applyOn(ghoul), doc());
      await until(() => health(ghoul) === Math.max(0, ghoulBefore - flags.passedByTarget[at(ghoul)].damage), "the half on the ghoul that passed");
      const allyBefore = health(ally);
      await CARD_ACTIONS.applyDamage(await applyOn(ally), doc());
      await until(() => health(ally) === Math.max(0, allyBefore - flags.damageByTarget[at(ally)].damage), "the whole on the ally that failed");
    });

    it("GADGETEER: the checklist names two gadgets, each its own Use once a Short Rest; the Recombobulator pressed at a Deafened ally ends it and spends its use", async function () {
      this.timeout(240000);
      const gnome = await tinkerWith("ZZ LT Gadgeteer", { level: 3, ranks: { Gadgeteer: 1 } });
      const ally = await makeCharacter({ name: "ZZ LT Gadget Ally", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      const gadgeteer = await until(() => featureNamed(gnome, "Gadgeteer"), "Gadgeteer granted");
      const pending = workflows().useFeature({ actor: gnome, item: gadgeteer });
      await pick(await chooser(gadgeteer), ["Recombobulator", "Net-o-Matic Projector"]);
      const known = await pending;
      if (known) made.push(known);
      const recomb = await until(() => gadgetNamed(gnome, "Recombobulator"), "the Recombobulator known");
      await until(() => gadgetNamed(gnome, "Net-o-Matic Projector"), "the Net-o-Matic Projector known");
      assert.deepEqual({ max: recomb.system.uses.max, per: recomb.system.uses.per }, { max: 1, per: "short" }, "a gadget known is not once a Short Rest");
      assert.isNull(gadgetNamed(gnome, "Gnomish Cloaking Device"), "a gadget not named was granted");
      await applyCondition(ally, "deafened");
      await until(() => ally.statuses.has("deafened"), "the ally Deafened");
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const card = await pressForCard(useControl(sheet, recomb), gnome, 15);
        await until(() => !ally.statuses.has("deafened"), "the condition ended");
        assert.include(textOf(card), game.i18n.format("AZEROTH.Cure.Ended", { target: tokenOf(ally).name, condition: game.i18n.localize(AZEROTH.conditions.deafened) }));
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      await until(() => gnome.items.get(recomb.id)?.system?.uses?.value === 0, "the gadget's use spent");
    });

    it("ARCLIGHT SPANNER: one construct targeted is mended by the tier a rank and a condition on it ended; a creature that is no construct is refused in words", async function () {
      this.timeout(240000);
      const gnome = await tinkerWith("ZZ LT Spanner", { level: 5, ranks: { "Arclight Spanner": 1 } });
      const chicken = await makeNpc("Gnomish Battle Chicken");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: chicken, x: 1100, y: 1000 }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }]);
      const spanner = await until(() => featureNamed(gnome, "Arclight Spanner"), "the Arclight Spanner granted");
      await setPool(gnome, "energy", 10);
      // The construct hurt and Slowed, for the mend below.
      const full = chicken.system.health.max;
      await chicken.update({ "system.health.value": full - 3 });
      await until(() => health(chicken) === full - 3, "the construct hurt");
      await applyCondition(chicken, "slowed");
      await until(() => chicken.statuses.has("slowed"), "the construct Slowed");
      const sheet = await openSheet(gnome);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        // A creature that is no construct, targeted: refused in words, nothing paid.
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        const before = game.messages.size;
        const said = await warnings(async () => {
          useControl(sheet, spanner)()?.click();
          await sleep(1500);
        });
        assert.isTrue(said.some(w => w.startsWith(`Arclight Spanner: ${tokenOf(ghoul).name}`)), `no refusal in words: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused Spanner posted a card");
        assert.equal(poolOf(gnome, "energy").value, 10, "a refused Spanner spent Energy");
        // The construct, targeted.
        canvas.tokens.setTargets([tokenOf(chicken).id]);
        await settle();
        card = await pressForCard(useControl(sheet, spanner), gnome, 15);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      await until(() => !chicken.statuses.has("slowed"), "the construct's condition ended");
      await until(() => poolOf(gnome, "energy").value === 7, "3 Energy paid");
      const heal = parsed(card).querySelector('[data-action="applyHealing"]');
      assert.ok(heal, "the card offers no heal");
      await CARD_ACTIONS.applyHealing(heal, card);
      // Tier 2 at rank 1: the tier a rank is 2.
      await until(() => health(chicken) === full - 1, "the construct mended by the tier a rank");
    });

    it("POCKET FACTORY: pressed on the sheet in a fight, two Clockwork Gnomes assemble at the point picked within 30 feet, each in the fight with one Half-Action of its own", async function () {
      this.timeout(240000);
      const gnome = await tinkerWith("ZZ LT Factory", { level: 9, ranks: { "Pocket Factory": 1 } });
      const scene = await sceneWith([{ actor: gnome, x: 1000, y: 1000 }]);
      const combat = await fightWith([gnome]);
      await giveTurn(combat, gnome);
      await setPool(gnome, "energy", 10);
      const factory = await until(() => featureNamed(gnome, "Pocket Factory"), "Pocket Factory granted");
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === gnome.id);
        useControl(sheet, factory)()?.click();
        await until(() => pickState()?.mode === "point", "the factory's pick");
        pressBoard({ x: 1450, y: 1050 });
        const [card] = await posted;
        made.push(card);
      } finally {
        await sheet.close();
      }
      await until(() => poolOf(gnome, "energy").value === 6, "4 Energy paid");
      const called = await until(() => {
        const mineNow = scene.tokens.filter(t => bondOf(t.actor)?.ownerUuid === gnome.uuid);
        return mineNow.length === 2 ? mineNow : null;
      }, "two Clockwork Gnomes on the scene", 30000);
      // A called set is ONE world actor with unlinked tokens (D-643): the world actor is cleaned up.
      for (const t of called) {
        const world = game.actors.get(t.actorId);
        if (world && !made.includes(world)) made.push(world);
      }
      assert.isTrue(called.every(t => String(bondOf(t.actor)?.entryName ?? t.actor.name).includes("Clockwork Gnome")), "what assembled is not 14's Clockwork Gnome");
      await until(() => combat.combatants.filter(c => called.some(t => t.id === c.tokenId)).length === 2, "both in the gnome's fight");
      for (const c of combat.combatants.filter(cb => called.some(t => t.id === cb.tokenId))) {
        assert.equal(c.budget.halfActions, 1, "a Clockwork Gnome took 05's two Half-Actions rather than its own one");
      }
      await sleep(250);
    });
  });
}
