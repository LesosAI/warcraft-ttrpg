/**
 * **THE BLADEMASTER, LIVE** (04's Blademaster (Orc); the Legacy branches' phase B6a).
 *
 * An orc Warrior holds the branch beside the class's thirty-six (door 1, B5), each
 * talent set at its ranks, and each is pressed from the sheet's own control with
 * tokens on a scene - the Combat tab's Attack and Use, the incoming card's buttons -
 * the die pinned through `fixtures.mjs#pinDie`, and every outcome read back off the
 * documents:
 *
 * - Wolf's Pace and Blade Circle: the passives laid with a two-handed blade and no
 *   suit, gone when a suit fills the Chest, back when it comes off;
 * - Read the Blade: a Parry pressed on a ghoul's card and held gives 4 Rage at rank 2
 *   beside the Parry's own point, and a suit in the Chest stops it;
 * - Telling Blow, Critical Strike and Bloodied Blade: one pinned critical from the
 *   sheet names all three on its card;
 * - Wind Walk at rank 2: the Reaction's 4 Rage, the unanswered state, the free walk
 *   over the ground, the hiding and the Dexterity promised - and the next attack
 *   takes the promise and ends the hiding;
 * - The Challenge and Mak'gora: the mark and its Bane on the ghoul, a second naming
 *   the same turn refused in words, and the Critical Injury from 18;
 * - Afterimage: pressed on the ghoul's card, the hit withdrawn, 6 Rage and a use spent;
 * - Bladestorm: refused in words with a one-handed sword, and with a greatsword a Full
 *   Action, 10 Rage, the unanswered state and the Dexterity's Armor Points until the
 *   warrior's next turn;
 * - Return Stroke: the Combat tab's Riposte priced at nothing at rank 2 and pressed
 *   with no Rage held.
 *
 * Written in B6a and NOT run (the brief: offline, Vitest only). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-blademaster`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, PACK_FOR, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { PARRY_COST, UNANSWERED_FLAG } from "../rules/reactions.mjs";
import { CONCEAL_FLAG } from "../rules/legacy-uses.mjs";
import { NEXT_ATTACK_FLAG } from "../rules/next-attack.mjs";
import { CHALLENGE_FLAG, MARK_REFUSALS } from "../rules/marks.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { WIELD_REFUSALS } from "../rules/wield.mjs";
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
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const classTalents = actor => actor.items.filter(i => i.type === "talent" && !i.system?.race);
const talentEffectOf = (actor, identifier) => actor.effects.find(e => e.getFlag("azeroth-rpg", "talentEffect") === identifier) ?? null;
const provenanceOf = card => card.rolls?.[0]?.options?.provenance ?? [];
const rage = () => game.i18n.localize(AZEROTH.poolTypes.rage);

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements, { name = "ZZ Legacy Blademaster Scene" } = {}) {
  const scene = await Scene.create({ name, width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, `${name} viewed`);
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

/** A started fight holding these actors by their tokens, its turn events settled (D-627). */
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

/** A weapon or a suit from the pack, put in hand or on. */
async function wear(actor, packId, name, extra = {}) {
  const source = (await fromPack(packId, name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true, ...extra } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} on`);
  return actor.items.get(item.id);
}

/**
 * **AN ORC WARRIOR WITH THE BLADEMASTER'S TALENTS AT THESE RANKS** (door 1: the race
 * keeps the branch, so it arrives untaken beside the class's thirty-six), these weapons
 * in hand, waiting for every grant the ranks make.
 */
async function orcWarrior(name, { level = 9, ranks = {}, weapons = [], abilities = { str: 16, dex: 16, con: 14 } } = {}) {
  const orc = await makeCharacter({ name, classes: [["Warrior", level]], race: "Orc", weapons, abilities });
  await until(() => classTalents(orc).filter(t => t.system?.legacy === "Orc").length === 12, `${name}'s Blademaster twelve`, 30000);
  for (const n of weapons) {
    const item = await until(() => itemNamed(orc, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => orc.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(orc, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(orc, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return orc;
}

/**
 * **PRESS A SHEET'S CONTROL AND TAKE THE CARD IT POSTS**, the die pinned while the
 * press rolls. `control` is re-queried at the press, because a render detaches a
 * control queried before it (CLAUDE.md §15).
 */
async function pressForCard(control, speaker, face = 15, { kind = null, ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id && (!kind || m.flags?.["azeroth-rpg"]?.kind === kind));
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

/** Press a control that refuses, and hear every warning said until one has been. */
async function pressAndHear(control, { done = said => said.length > 0, ms = 15000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error("no control to press");
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  const said = [];
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    el.click();
    await until(() => done(said), "a refusal in words", ms);
    await settle();
    await sleep(250);
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  return said;
}

/** The Combat tab's Use for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;
/** The Combat tab's Attack for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;
/** A creature's own first attack row (`npc-statistics.hbs`). */
const clawsControl = sheet => () => sheet.element?.querySelector('[data-action="rollAttack"][data-attack="0"]') ?? null;
/** The Combat tab's maneuver Use. */
const maneuverControl = (sheet, key) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-action="useManeuver"][data-maneuver="${key}"]`) ?? null;

/** A ghoul's Claws pressed on its own sheet at the defender, the die pinned: the attack's card. */
async function clawsAt(ghoul, defender, face = 15) {
  canvas.tokens.setTargets([tokenOf(defender).id]);
  const sheet = await openSheet(ghoul);
  try {
    return await pressForCard(clawsControl(sheet), ghoul, face, { kind: "attack" });
  } finally {
    await sheet.close();
    canvas.tokens.setTargets([]);
  }
}

/** The orc's sheet open on the Combat tab, for `fn`, closed after. */
async function onCombatTab(actor, fn) {
  const sheet = await openSheet(actor);
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    return await fn(sheet);
  } finally {
    await sheet.close();
  }
}

export function legacyBlademasterBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Blademaster (Orc; the Legacy branches' B6a)", function () {
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
      canvas?.tokens?.releaseAll?.();
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("WOLF'S PACE AND BLADE CIRCLE: with a greatsword and no suit, Speed +10 and Defense +2 at rank 2; a suit in the Chest takes both off, and taking it off gives them back", async function () {
      this.timeout(180000);
      const orc = await orcWarrior("ZZ LBM Pace", { weapons: ["Greatsword"] });
      const speed = orc.system.speed;
      const defense = orc.system.defense;
      await talentNamed(orc, "Wolf's Pace").update({ "system.taken": 2 });
      await talentNamed(orc, "Blade Circle").update({ "system.taken": 2 });
      await until(() => talentEffectOf(orc, "wolfs-pace") && talentEffectOf(orc, "blade-circle"), "both passives laid by the sync");
      await until(() => orc.system.speed === speed + 10, "Speed 10 feet higher");
      await until(() => orc.system.defense === defense + 2, "Defense 2 higher");
      // A suit fills the Chest tile (`rules/worn.mjs`): both gates close.
      const hide = await wear(orc, PACK_FOR.armor, "Hide");
      await until(() => !talentEffectOf(orc, "wolfs-pace") && !talentEffectOf(orc, "blade-circle"), "both passives taken off by the suit");
      // Taken off again: the sync lays both back on the update.
      await hide.update({ "system.equipped": false });
      await until(() => talentEffectOf(orc, "wolfs-pace") && talentEffectOf(orc, "blade-circle"), "both passives back with the Chest empty");
      // With the greatsword set down, Wolf's Pace stands and Blade Circle does not.
      await itemNamed(orc, "Greatsword").update({ "system.equipped": false });
      await until(() => talentEffectOf(orc, "wolfs-pace") && !talentEffectOf(orc, "blade-circle"), "Blade Circle gone with the two-handed blade");
    });

    it("READ THE BLADE: a Parry pressed on the ghoul's card and held gives 2 Rage a rank beside the Parry's own point, and a suit in the Chest stops it", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Read", { weapons: ["Greatsword"], ranks: { "Read the Blade": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(orc, "rage", 3);
      const first = await clawsAt(ghoul, orc, 12);
      assert.isTrue(first.rolls[0].outcome.success, "the pinned Claws missed");
      const parry = parsed(first).querySelector('button[data-action="reactParry"][data-target-index="0"]');
      assert.ok(parry, "the card offers the orc no Parry");
      let unpin = pinDie(20);
      try {
        const answered = await CARD_ACTIONS.reactParry(parry, game.messages.get(first.id));
        assert.ok(answered, "the Parry was refused");
        made.push(answered);
      } finally {
        unpin();
      }
      await until(() => poolOf(orc, "rage").value === 3 - PARRY_COST + 4, "the held Parry's 4 Rage beside its point");
      // A suit in the Chest: the same Parry builds nothing more.
      await wear(orc, PACK_FOR.armor, "Hide");
      await setPool(orc, "rage", 3);
      const second = await clawsAt(ghoul, orc, 12);
      const again = parsed(second).querySelector('button[data-action="reactParry"][data-target-index="0"]');
      assert.ok(again, "the second card offers no Parry");
      unpin = pinDie(20);
      try {
        const answered = await CARD_ACTIONS.reactParry(again, game.messages.get(second.id));
        assert.ok(answered, "the second Parry was refused");
        made.push(answered);
      } finally {
        unpin();
      }
      await until(() => poolOf(orc, "rage").value === 3 - PARRY_COST, "the Parry's point and nothing more");
      await sleep(400);
      assert.equal(poolOf(orc, "rage").value, 3 - PARRY_COST, "Read the Blade gave Rage with a suit in the Chest");
    });

    it("TELLING BLOW, CRITICAL STRIKE AND BLOODIED BLADE: one critical pressed from the sheet names all three on its card", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Critical", { level: 13, weapons: ["Greatsword"], ranks: { "Telling Blow": 2, "Critical Strike": 2, "Bloodied Blade": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([orc, ghoul]);
      await giveTurn(combat, orc);
      await setPool(orc, "rage", 0);
      const blade = itemNamed(orc, "Greatsword");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let card = null;
      try {
        card = await onCombatTab(orc, sheet => pressForCard(attackControl(sheet, blade), orc, 20, { kind: "attack" }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      const outcome = card.rolls[0].outcome;
      assert.isTrue(outcome.success, "the pinned 20 missed");
      assert.isTrue(outcome.critical, "a natural 20 is no critical");
      assert.isAtLeast(outcome.sl, 3, "the pinned 20 did not reach SL 3");
      // Telling Blow's 2 and Bloodied Blade's 3, each named beside 05's own gain.
      const further = name => provenanceOf(card).find(p => p.label === name)?.formula ?? null;
      assert.equal(further("Telling Blow"), game.i18n.format("AZEROTH.Card.FurtherMomentum", { n: 2, pool: rage() }), "the card does not name Telling Blow's 2 Rage");
      assert.equal(further("Bloodied Blade"), game.i18n.format("AZEROTH.Card.FurtherMomentum", { n: 3, pool: rage() }), "the card does not name Bloodied Blade's 3 Rage");
      await until(() => poolOf(orc, "rage").value >= 5, "at least the five further Rage on the pool");
      // Critical Strike at rank 2 and SL 3: twice half the Dexterity, rounded up, ignoring Armor Points.
      const dex = orc.system.abilities.dex.mod;
      assert.include(textOf(card), game.i18n.format("AZEROTH.SlDamage.CardIgnores", { n: 2 * Math.ceil(dex / 2), sl: 3 }), "the card does not say Critical Strike's damage");
    });

    it("WIND WALK AT RANK 2: the Reaction's 4 Rage, the unanswered state, the walk over the ground, and a hiding that CARRIES the Dexterity; the attack that ends it adds the Dexterity, and no promise is laid", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Wind", { level: 5, weapons: ["Greatsword"], ranks: { "Wind Walk": 2 }, abilities: { str: 16, dex: 14, con: 14 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([orc, ghoul]);
      const mine = await giveTurn(combat, orc);
      await setPool(orc, "rage", 6);
      const wind = await until(() => featureNamed(orc, "Wind Walk"), "Wind Walk granted");
      await onCombatTab(orc, sheet => pressForCard(useControl(sheet, wind), orc, 15));
      await until(() => poolOf(orc, "rage").value === 2, "Wind Walk's 4 Rage");
      await until(() => mine.budget.reactions === 0, "the Reaction spent");
      await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", UNANSWERED_FLAG)?.source === "Wind Walk"), "no Reaction against the orc");
      await until(() => orc.effects.find(e => e.flags?.["azeroth-rpg"]?.freeWalk?.source === "Wind Walk"), "the ground ignored for the walk");
      const hiding = await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", CONCEAL_FLAG)), "the rank 2 hiding");
      assert.deepEqual(hiding.getFlag("azeroth-rpg", CONCEAL_FLAG).ends, ["attack"], "the hiding ends at anything but an attack");
      const dex = orc.system.abilities.dex.mod;
      // *that attack adds your Dexterity modifier*: carried by the hiding the attack ends (the
      // B6 review), never a promise held to the encounter.
      assert.equal(hiding.getFlag("azeroth-rpg", CONCEAL_FLAG).damage, dex, "the hiding does not carry the Dexterity its attack adds");
      assert.isFalse((orc.getFlag("azeroth-rpg", NEXT_ATTACK_FLAG) ?? []).some(e => e.source === "wind-walk"), "a next-attack promise was laid beside the hiding");
      const blade = itemNamed(orc, "Greatsword");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let card = null;
      try {
        card = await onCombatTab(orc, sheet => pressForCard(attackControl(sheet, blade), orc, 18, { kind: "attack" }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      assert.isTrue(provenanceOf(card).some(p => p.label === "Wind Walk" && p.value === dex), "the attack does not name the Dexterity Wind Walk's hiding carried");
      await until(() => !orc.effects.some(e => e.getFlag("azeroth-rpg", CONCEAL_FLAG)), "the hiding ended by the attack");
    });

    it("WIND WALK OUT OF A FIGHT: the hiding still carries the Dexterity, and the next attack - whenever it comes - adds it and ends the hiding", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Wind Out", { level: 5, weapons: ["Greatsword"], ranks: { "Wind Walk": 2 }, abilities: { str: 16, dex: 14, con: 14 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(orc, "rage", 6);
      const wind = await until(() => featureNamed(orc, "Wind Walk"), "Wind Walk granted");
      await onCombatTab(orc, sheet => pressForCard(useControl(sheet, wind), orc, 15));
      const dex = orc.system.abilities.dex.mod;
      const hiding = await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", CONCEAL_FLAG)), "the hiding out of a fight");
      assert.equal(hiding.getFlag("azeroth-rpg", CONCEAL_FLAG).damage, dex, "out of a fight the hiding carries no Dexterity");
      const blade = itemNamed(orc, "Greatsword");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let card = null;
      try {
        card = await onCombatTab(orc, sheet => pressForCard(attackControl(sheet, blade), orc, 18, { kind: "attack" }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      assert.isTrue(provenanceOf(card).some(p => p.label === "Wind Walk" && p.value === dex), "the attack out of a fight does not add the Dexterity");
      await until(() => !orc.effects.some(e => e.getFlag("azeroth-rpg", CONCEAL_FLAG)), "the hiding ended by the attack");
    });

    it("THE CHALLENGE AND MAK'GORA: the naming costs nothing and marks the ghoul with its Bane, a second naming this turn is refused in words, and the attack at it crits from 18", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Challenge", { weapons: ["Greatsword"], ranks: { "The Challenge": 1, "Mak'gora": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([orc, ghoul]);
      const mine = await giveTurn(combat, orc);
      const halves = mine.budget.halfActions;
      const challenge = await until(() => featureNamed(orc, "The Challenge"), "The Challenge granted");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      try {
        await onCombatTab(orc, async sheet => {
          await pressForCard(useControl(sheet, challenge), orc, 15);
          await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", CHALLENGE_FLAG)?.tokenId === tokenOf(ghoul).id), "the mark naming the ghoul");
          await until(() => ghoul.effects.find(e => e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG]?.source === "The Challenge" && e.origin === orc.uuid), "the Bane on the ghoul");
          assert.equal(mine.budget.halfActions, halves, "the naming cost an action");
          // *Once per turn* (the plan's reading: on each of your own turns).
          const said = await pressAndHear(useControl(sheet, challenge));
          assert.include(said, game.i18n.format(MARK_REFUSALS.spent, { name: "The Challenge" }), `the second naming was not refused in words: ${JSON.stringify(said)}`);
        });
        // Mak'gora at rank 2, against the creature named.
        const blade = itemNamed(orc, "Greatsword");
        const card = await onCombatTab(orc, sheet => pressForCard(attackControl(sheet, blade), orc, 15, { kind: "attack" }));
        assert.equal(card.rolls[0].options.criticalOn, 18, "Mak'gora did not lower the critical to 18 against the named ghoul");
      } finally {
        canvas.tokens.setTargets([]);
      }
    });

    it("AFTERIMAGE: pressed on the ghoul's card, the hit becomes a miss, 6 Rage and a use spent", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Afterimage", { level: 13, weapons: ["Greatsword"], ranks: { Afterimage: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(orc, "rage", 6);
      const afterimage = await until(() => featureNamed(orc, "Afterimage"), "Afterimage granted");
      assert.equal(afterimage.system.uses?.max, 1, "rank 1 does not count one use a Short Rest");
      const card = await clawsAt(ghoul, orc, 15);
      assert.isTrue(card.rolls[0].outcome.success, "the pinned Claws missed");
      const negate = parsed(card).querySelector(`button[data-action="reactNegate"][data-target-index="0"][data-feature-id="${afterimage.id}"]`);
      assert.ok(negate, "the card offers the orc no Afterimage");
      const answered = await CARD_ACTIONS.reactNegate(negate, game.messages.get(card.id));
      assert.ok(answered, "Afterimage was refused");
      made.push(answered);
      await until(() => game.messages.get(card.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true, "the card's row written as a miss");
      await until(() => poolOf(orc, "rage").value === 0, "Afterimage's 6 Rage");
      await until(() => orc.items.get(afterimage.id)?.system?.uses?.value === 0, "the Short Rest's use struck");
      // The Apply then deals nothing.
      const health = orc.system.health.value;
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applyDamage"][data-target-index="0"]');
      if (apply) await warnings(async () => { await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id)); });
      assert.equal(orc.system.health.value, health, "the withdrawn hit dealt damage");
    });

    it("BLADESTORM: refused in words with a one-handed sword, nothing spent; with a greatsword a Full Action, 10 Rage, the unanswered state and the Dexterity's Armor Points until the orc's next turn", async function () {
      this.timeout(240000);
      const orc = await orcWarrior("ZZ LBM Storm", { level: 17, weapons: ["Longsword"], ranks: { Bladestorm: 1 } });
      const one = await makeNpc("Plagued Ghoul");
      const two = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: orc, x: 1000, y: 1000 }, { actor: one, x: 1100, y: 1000, side: "hostile" }, { actor: two, x: 1000, y: 1100, side: "hostile" }]);
      const combat = await fightWith([orc, one, two]);
      const mine = await giveTurn(combat, orc);
      await setPool(orc, "rage", 10);
      const storm = await until(() => featureNamed(orc, "Bladestorm"), "Bladestorm granted");
      // *while you wield a two-handed weapon*: a Longsword is not one (Versatile's grip is never tracked).
      const said = await onCombatTab(orc, sheet => pressAndHear(useControl(sheet, storm)));
      assert.include(said, game.i18n.format(WIELD_REFUSALS.twoHanded, { name: "Bladestorm" }), `not refused in words: ${JSON.stringify(said)}`);
      assert.equal(poolOf(orc, "rage").value, 10, "the refused Use spent Rage");
      assert.equal(mine.budget.halfActions, 2, "the refused Use spent the turn");
      // The greatsword in hand.
      await itemNamed(orc, "Longsword").update({ "system.equipped": false });
      await wear(orc, PACK_FOR.weapon, "Greatsword");
      const bodyAp = orc.system.ap?.body ?? 0;
      const dex = orc.system.abilities.dex.mod;
      canvas.tokens.setTargets([tokenOf(one).id, tokenOf(two).id]);
      let card = null;
      try {
        card = await onCombatTab(orc, sheet => pressForCard(useControl(sheet, storm), orc, 15));
      } finally {
        canvas.tokens.setTargets([]);
      }
      await until(() => poolOf(orc, "rage").value === 0, "Bladestorm's 10 Rage");
      await until(() => mine.budget.halfActions === 0, "the Full Action");
      await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", UNANSWERED_FLAG)?.source === "Bladestorm"), "no Reaction against the orc");
      const buff = await until(() => orc.effects.find(e => e.getFlag("azeroth-rpg", "talentBuff") === "Bladestorm"), "the Armor Points' effect");
      assert.equal(buff._source.duration?.expiry, "turnStart", "the Armor Points do not end at the orc's next turn");
      assert.equal(buff._source.start?.combatant, mine.id, "the span is not keyed on the orc's own turn");
      const onBody = (buff.system.changes ?? []).find(c => c.key === "system.ap.body") ?? null;
      assert.equal(String(onBody?.value ?? ""), String(dex), "the Dexterity is not on the Body's Armor Points");
      assert.equal(onBody?.phase, "final", "the Armor Points are not laid after the derivation");
      await until(() => (orc.system.ap?.body ?? 0) === bodyAp + dex, "the Body's Armor Points raised by the Dexterity");
      // One roll for each creature named (Whirlwind's allowance).
      const allowance = { attacks: card.flags["azeroth-rpg"].attacks ?? null, named: (card.flags["azeroth-rpg"].targets ?? []).map(t => t.name) };
      assert.equal(card.flags["azeroth-rpg"].attacks?.allowed, 2, `the card does not allow one attack a creature: ${JSON.stringify(allowance)}`);
      assert.ok(parsed(card).querySelector('button[data-action="attackFromCard"]'), "the card offers no Attack");
    });

    it("RETURN STROKE: the Combat tab's Riposte is priced at nothing at rank 2, pressable with no Rage, and greyed without the talent", async function () {
      this.timeout(180000);
      const orc = await orcWarrior("ZZ LBM Return", { weapons: ["Greatsword"] });
      await setPool(orc, "rage", 0);
      await onCombatTab(orc, async sheet => {
        assert.isTrue(maneuverControl(sheet, "riposte")()?.disabled === true, "a Riposte at 4 Rage was offered with none");
      });
      await talentNamed(orc, "Read the Blade").update({ "system.taken": 1 });
      await talentNamed(orc, "Return Stroke").update({ "system.taken": 2 });
      await until(() => talentNamed(orc, "Return Stroke").system.taken === 2, "Return Stroke at rank 2");
      await onCombatTab(orc, async sheet => {
        await until(() => maneuverControl(sheet, "riposte")()?.disabled === false, "the Riposte priced at nothing");
        await pressForCard(maneuverControl(sheet, "riposte"), orc, 15);
      });
      assert.equal(poolOf(orc, "rage").value, 0, "the free Riposte spent Rage");
    });
  });
}
