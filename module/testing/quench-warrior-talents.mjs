/**
 * **THE WARRIOR'S THIRTY-SIX, LIVE** (04-TALENTS; D-772, the talent plan's Phase
 * 4). One focused test per talent the phase builds, through the real doors:
 *
 * - Arms: Heavy Hand's Head without the −2; Deep Cut's Bleeding landed at SL 2;
 *   Wide Swing's Cleave button at SL 3; Precise Strike's Pierce promised and
 *   taken; Follow Through's Boon on a kill; Executioner's 19; Mortal Strike's
 *   block on healing; Bladeturn's free Parry.
 * - Fury: Reckless's exposure; Bloodthirst paid on a hit alone; Second Strike's
 *   off hand without the −2; Rampage's Half-Action; Titan's Presence offering
 *   no Parry; Blood Craze's heal at the turn's start; Flurry's extra attack,
 *   once a round; Wounded Beast's price.
 * - Bulwark: 02's Shieldbearer and Shield Wall at the Block; Deflection's free
 *   Block; Taunt's Bane that spares the warrior; Warded Plate's school; Anchor's
 *   refused Disengage; Shield Slam's blow and Stun; Unbreakable's two dice.
 *
 * Written in Phase 4 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.warrior-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { disengage } from "../applications/combat-actions.mjs";
import { reactWithDialog, reactionRows } from "../applications/actions.mjs";
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

const workflows = () => game.system.azeroth.workflows;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.label);

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing", 30000);
  return combat;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Warrior Talents Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/**
 * A Warrior at a level with these talents taken and these things held and worn,
 * waiting for what each grants.
 */
async function warriorWith(name, { level = 5, ranks = {}, weapons = [], armor = [], abilities = { str: 16, con: 14 } } = {}) {
  const warrior = await makeCharacter({ name, classes: [["Warrior", level]], weapons, armor, abilities });
  for (const n of [...weapons, ...armor]) {
    const item = await until(() => itemNamed(warrior, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => warrior.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(warrior, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(warrior, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return warrior;
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** One attack straight through the workflow, the die pinned. */
async function strike(actor, { weapon = null, face = 15, dc = 5, ...extra } = {}) {
  const held = weapon ?? actor.readyWeapons()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: held?.system?.rating ?? 1, kind: "physical", weaponRating: held?.system?.rating ?? 1 },
      strike: { rangeKind: "melee" }, weaponId: held?.id ?? null, traits: held?.system?.traits ?? [], ...extra
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Use a feature through the workflow, the die pinned. */
async function use(actor, name, { targets = [], face = 15 } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** The chooser a feature opened, once rendered; pick one option by name. */
async function pickOne(item, name, ms = 10000) {
  let app = null;
  for (let i = 0; i < ms / 50 && !app; i++) {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (found?.rendered && found.element?.querySelector(".azeroth-choose")) app = found;
    else await new Promise(r => setTimeout(r, 50));
  }
  if (!app) throw new Error(`${item.name} opened no chooser`);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...(select?.options ?? [])].find(o => o.textContent.trim().startsWith(name));
  if (!option) throw new Error(`${item.name}'s chooser offers no ${name}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

export function warriorTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Warrior's thirty-six (D-772)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Arms ---------------------------------------------------------- */

    it("HEAVY HAND: a called shot to the Head keeps its Bane and loses the −2", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Heavy", { weapons: ["Longsword"] });
      const without = await strike(warrior, { location: "head" });
      assert.include(labels(without), "AZEROTH.Card.CalledShotPenalty", "with no talent the Head should take its −2");
      await talentNamed(warrior, "Heavy Hand").update({ "system.taken": 1 });
      await until(() => talentNamed(warrior, "Heavy Hand").system.taken === 1, "Heavy Hand taken");
      const card = await strike(warrior, { location: "head" });
      assert.notInclude(labels(card), "AZEROTH.Card.CalledShotPenalty", "Heavy Hand left the −2 on the Head");
    });

    it("DEEP CUT: an attack at SL 2 lands Bleeding equal to the rank on the target, with no button pressed", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Deep Cut", { weapons: ["Longsword"], ranks: { "Deep Cut": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const card = await strike(warrior, { targets: [rowOf(ghoul)] });
      assert.isAtLeast(card.rolls[0].outcome.sl, 2, "the pinned blow did not reach SL 2");
      await until(() => ghoul.statuses?.has("bleeding"), "Bleeding on the ghoul");
      assert.equal(ghoul.effects.find(e => e.statuses?.has("bleeding")).getFlag("azeroth-rpg", "value"), 2);
      assert.isNull(parsed(card).querySelector('[data-action="applyCondition"][data-condition="bleeding"]'), "the card still offers what landed");
    });

    it("WIDE SWING: a Cleave weapon's blow at SL 3 offers Cleave's extra attack at −2, and a blow at SL 2 does not at rank 1", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Wide Swing", { weapons: ["Battleaxe"], ranks: { "Wide Swing": 1 } });
      const axe = itemNamed(warrior, "Battleaxe");
      const high = await strike(warrior, { weapon: axe, face: 15, dc: 2 });
      assert.isAtLeast(high.rolls[0].outcome.sl, 3);
      const button = parsed(high).querySelector('[data-action="extraStrike"][data-strike="wide-swing"]');
      assert.ok(button, "no Cleave button at SL 3");
      assert.deepInclude(high.flags["azeroth-rpg"].extraStrikes.find(x => x.identifier === "wide-swing"), { target: "other", rating: -2 });
      const low = await strike(warrior, { weapon: axe, face: 10, dc: 10 });
      if ((low.rolls[0].outcome.sl ?? 0) < 3) {
        assert.isNull(parsed(low).querySelector('[data-action="extraStrike"][data-strike="wide-swing"]'), "Cleave offered below SL 3 at rank 1");
      }
    });

    it("PRECISE STRIKE: the Use pays 4 Rage and lays a Pierce of the rank on the next attack this turn, which takes it", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Precise", { weapons: ["Longsword"], ranks: { "Precise Strike": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await giveTurn(combat, warrior);
      await setPool(warrior, "rage", 6);
      const card = await use(warrior, "Precise Strike");
      assert.ok(card, "the Use posted no card");
      assert.equal(poolOf(warrior, "rage").value, 2, "the Use did not take 4 Rage");
      await until(() => warrior.pendingNextAttack().penetration === 2, "a Pierce of 2 promised");
      const blow = await strike(warrior, { targets: [rowOf(ghoul)], budget: "none" });
      assert.include(textOf(blow), game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: 2 }), "the attack does not name the promise it took");
      await until(() => (warrior.getFlag("azeroth-rpg", "nextAttack") ?? []).length === 0, "the promise taken");
    });

    it("FOLLOW THROUGH and RAMPAGE: a kill promises a Boon this round and gives a Half-Action", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Kill", { weapons: ["Longsword"], ranks: { "Follow Through": 1, Rampage: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      const mine = await giveTurn(combat, warrior);
      const before = mine.budget.halfActions;
      await ghoul.update({ "system.health.value": 2 });
      await ghoul.applyDamage(5, { struck: true, attack: true, by: warrior });
      await until(() => warrior.pendingNextAttack().boons === 1, "Follow Through's Boon promised");
      await until(() => mine.budget.halfActions === before + 1, "Rampage's Half-Action");
    });

    it("EXECUTIONER: an attack on a target below half Health inflicts a Critical Injury on 19", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Executioner", { weapons: ["Longsword"], ranks: { Executioner: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const max = ghoul.system.health.max;
      const low = await strike(warrior, { targets: [rowOf(ghoul, { health: { value: Math.floor((max - 1) / 2), max } })] });
      assert.equal(low.rolls[0].options.criticalOn, 19, "Executioner did not lower the critical");
      const full = await strike(warrior, { targets: [rowOf(ghoul, { health: { value: max, max } })] });
      assert.notEqual(full.rolls[0].options.criticalOn, 19, "Executioner fired on a target at full Health");
    });

    it("MORTAL STRIKE: a hit blocks the target's healing until the end of the warrior's next turn", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Mortal", { weapons: ["Longsword"], ranks: { "Mortal Strike": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await giveTurn(combat, warrior);
      await setPool(warrior, "rage", 8);
      const card = await strike(warrior, { targets: [rowOf(ghoul)], riders: ["mortal-strike"] });
      assert.isTrue(card.rolls[0].outcome.success);
      const mark = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "noHealing")), "the block on the ghoul");
      assert.equal(mark.start?.combatant, combat.getCombatantsByActor(warrior)[0].id, "the block is not keyed on the warrior's turn");
      await ghoul.update({ "system.health.value": 1 });
      await ghoul.applyHealing(5);
      assert.equal(ghoul.system.health.value, 1, "a blocked creature restored Health");
    });

    it("BLADETURN: the first Parry of a round costs no Reaction, marked through the round's record", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Bladeturn", { weapons: ["Longsword"], ranks: { Bladeturn: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      const mine = combat.getCombatantsByActor(warrior)[0];
      await setPool(warrior, "rage", 3);
      await mine.spendAction("reaction");
      await until(() => mine.budget.reactions === 0, "the Reaction spent");
      const card = await reactWithDialog(warrior, "parry", { attackTotal: 12 });
      assert.ok(card, "the free Parry was refused");
      made.push(card);
      assert.include(mine.getFlag("azeroth-rpg", "round")?.once ?? [], "bladeturn:1", "the round does not record the free Parry");
      assert.equal(mine.budget.reactions, 0, "the budget moved");
      await warrior.unsetFlag("azeroth-rpg", "reacted");
      const said = await warnings(async () => { await reactWithDialog(warrior, "parry", { attackTotal: 12 }); });
      assert.isNotEmpty(said, "a second Parry with no Reaction left was not refused");
    });

    /* ---- Fury ---------------------------------------------------------- */

    it("RECKLESS: an attack made with its line ticked lays the exposure on the warrior, ranged-only at rank 2", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Reckless", { weapons: ["Longsword"], ranks: { Reckless: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await giveTurn(combat, warrior);
      await strike(warrior, { targets: [rowOf(ghoul)], chosen: ["reckless"], boons: 1 });
      const effect = await until(() => warrior.effects.find(e => e.getFlag("azeroth-rpg", "exposed")), "the exposure");
      assert.deepEqual(effect.getFlag("azeroth-rpg", "exposed"), { boons: 1, ranged: true, source: "Reckless" });
      assert.equal(effect.duration?.expiry, "turnStart", "the exposure does not end at the warrior's next turn");
    });

    it("BLOODTHIRST: a miss spends no Rage; a hit spends 6 and restores the rank", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Bloodthirst", { weapons: ["Longsword"], ranks: { Bloodthirst: 2 } });
      await setPool(warrior, "rage", 10);
      await warrior.update({ "system.health.value": Math.max(1, warrior.system.health.max - 5) });
      const before = warrior.system.health.value;
      const rage = game.i18n.localize(AZEROTH.poolTypes.rage);
      const miss = await strike(warrior, { face: 1, dc: 30, riders: ["bloodthirst"] });
      assert.isFalse(miss.rolls[0].outcome.success);
      assert.equal(poolOf(warrior, "rage").value, 10, "a miss spent Bloodthirst's Rage");
      assert.notInclude(textOf(miss), game.i18n.format("AZEROTH.Rider.Card.Paid", { n: 6, pool: rage }), "the miss's card says it paid");
      const hit = await strike(warrior, { riders: ["bloodthirst"] });
      assert.isTrue(hit.rolls[0].outcome.success);
      await until(() => warrior.system.health.value === before + 2, "the rank restored");
      assert.include(textOf(hit), game.i18n.format("AZEROTH.Rider.Card.Paid", { n: 6, pool: rage }), "the hit's card does not say it paid 6 Rage");
    });

    it("SECOND STRIKE: an Off-Hand Attack takes no −2", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Second", { weapons: ["Longsword"], ranks: { "Second Strike": 1 } });
      const card = await strike(warrior, { offHand: true, budget: "none" });
      assert.notInclude(labels(card), "AZEROTH.Dialog.OffHand", "the off hand still took −2");
    });

    it("TITAN'S PRESENCE: the attack's card offers its target no Parry and no Block", async function () {
      this.timeout(180000);
      const titan = await warriorWith("ZZ WT Titan", { weapons: ["Longsword"], ranks: { "Titan's Presence": 1 } });
      const defender = await warriorWith("ZZ WT Defender", { weapons: ["Longsword"], armor: ["Kite shield"] });
      await setPool(defender, "rage", 5);
      const plain = await warriorWith("ZZ WT Plain", { weapons: ["Longsword"] });
      assert.isNotEmpty(reactionRows([rowOf(defender)], { attacker: plain }), "a defender who could react was offered nothing");
      assert.deepEqual(reactionRows([rowOf(defender)], { attacker: titan }), [], "Titan's Presence left a Parry or a Block on the card");
    });

    it("BLOOD CRAZE: more than 7 Rage at the start of the warrior's turn restores the rank, and 7 restores nothing", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Craze", { weapons: ["Longsword"], ranks: { Bloodthirst: 1, "Blood Craze": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await warrior.update({ "system.health.value": Math.max(1, warrior.system.health.max - 5) });
      const before = warrior.system.health.value;
      // The turn's own door, which `_turnTicks` runs at the start of each of
      // the warrior's turns on the active GM's client.
      await setPool(warrior, "rage", 7);
      assert.deepEqual(await combat._talentTicks(warrior), [], "7 Rage is not more than 7");
      await setPool(warrior, "rage", 8);
      const lines = await combat._talentTicks(warrior);
      await until(() => warrior.system.health.value === before + 2, "Blood Craze's 2");
      assert.include(lines.join(" "), "Blood Craze", "the turn's line does not name the talent");
    });

    it("FLURRY: an attack at SL 2 offers one extra attack against the same target, pressed once a round", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Flurry", { weapons: ["Longsword"], ranks: { Flurry: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      const mine = await giveTurn(combat, warrior);
      const card = await strike(warrior, { targets: [rowOf(ghoul)] });
      const button = parsed(card).querySelector('[data-action="extraStrike"][data-strike="flurry"]');
      assert.ok(button, "no Flurry button at SL 2");
      const unpin = pinDie(15);
      let extra = null;
      try {
        extra = await CARD_ACTIONS.extraStrike(button, card);
      } finally {
        unpin();
      }
      assert.ok(extra, "the extra attack posted no card");
      made.push(extra);
      await until(() => (mine.getFlag("azeroth-rpg", "round")?.once ?? []).includes("flurry:1"), "the round's Flurry mark");
      const said = await warnings(async () => { await CARD_ACTIONS.extraStrike(button, card); });
      assert.include(said, game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: "Flurry" }), "a second Flurry this round was not refused in words");
    });

    it("WOUNDED BEAST: an attack that gets through deals the rank more, and a tick does not", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Wounded", { weapons: ["Longsword"], ranks: { "Wounded Beast": 2 } });
      const full = warrior.system.health.max;
      await warrior.applyDamage(3, { struck: true, attack: true });
      await until(() => warrior.system.health.value === full - 5, "3 and the rank's 2");
      await warrior.applyDamage(3, { struck: true, attack: false });
      await until(() => warrior.system.health.value === full - 8, "a tick's 3 alone");
    });

    /* ---- Bulwark ------------------------------------------------------- */

    it("SHIELDBEARER and SHIELD WALL: a Block takes 5, and the rank more with another friendly creature within 5 feet", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Wall", { weapons: ["Longsword"], armor: ["Kite shield"], ranks: { "Shield Wall": 2 } });
      const ally = await makeCharacter({ name: "ZZ WT Wall Ally", classes: [["Priest", 3]] });
      await sceneWith([{ actor: warrior, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      const card = await reactWithDialog(warrior, "block", {});
      assert.ok(card, "the Block was refused");
      made.push(card);
      const mark = await until(() => warrior.getFlag("azeroth-rpg", "mitigate"), "the Block's mark");
      assert.equal(mark.amount, 5 + 2, "02's five and Shield Wall's two");
    });

    it("DEFLECTION: the first Block of a round costs no Reaction", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Deflection", { weapons: ["Longsword"], armor: ["Kite shield"], ranks: { Deflection: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      const mine = combat.getCombatantsByActor(warrior)[0];
      await mine.spendAction("reaction");
      await until(() => mine.budget.reactions === 0, "the Reaction spent");
      const card = await reactWithDialog(warrior, "block", {});
      assert.ok(card, "the free Block was refused");
      made.push(card);
      assert.include(mine.getFlag("azeroth-rpg", "round")?.once ?? [], "deflection:1");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Reaction.FreeBy", { talent: "Deflection" }));
    });

    it("TAUNT: one creature targeted takes a Bane a rank on attacks against anyone but the warrior; two targets are refused with the Rage kept", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Taunt", { weapons: ["Longsword"], ranks: { Taunt: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const other = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul, other]);
      await giveTurn(combat, warrior);
      await setPool(warrior, "rage", 8);
      const said = await warnings(async () => { await use(warrior, "Taunt", { targets: [rowOf(ghoul), rowOf(other)] }); });
      assert.include(said, game.i18n.format("AZEROTH.Laid.OneTarget", { name: "Taunt" }));
      assert.equal(poolOf(warrior, "rage").value, 8, "a refused Taunt spent Rage");
      await use(warrior, "Taunt", { targets: [rowOf(ghoul)] });
      const bane = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane")), "Taunt's Bane on the ghoul");
      const flag = bane.getFlag("azeroth-rpg", "laidBane");
      assert.equal(flag.banes, 2);
      assert.isTrue(flag.lasting === true);
      assert.equal(flag.except?.actorId, warrior.id, "the Bane does not spare the warrior");
      assert.equal(bane.duration?.expiry, "turnEnd");
      assert.equal(bane.start?.combatant, combat.getCombatantsByActor(warrior)[0].id, "the span is not the warrior's next turn");
    });

    it("WARDED PLATE: the Use names a school, and a third of the Body Armor Points is Ward against it", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Plate", { weapons: ["Longsword"], armor: ["Field plate"], ranks: { "Warded Plate": 1 } });
      const item = await until(() => featureNamed(warrior, "Warded Plate"), "Warded Plate granted");
      const before = warrior.system.ward?.fire ?? 0;
      const used = workflows().useFeature({ actor: warrior, item });
      await pickOne(item, game.i18n.localize(AZEROTH.schools.fire));
      const card = await used;
      if (card) made.push(card);
      await until(() => warrior.getFlag("azeroth-rpg", "plates")?.["warded-plate"] === "fire", "the school named");
      await until(() => (warrior.system.ward?.fire ?? 0) === before + Math.floor((warrior.system.ap?.body ?? 0) / 3), "a third of the Body AP as Fire Ward");
      assert.isAbove(warrior.system.ap?.body ?? 0, 2, "the suit gave too few Armor Points to read");
    });

    it("ANCHOR: an enemy Engaged with the warrior is refused the Disengage in words, its Half-Action kept", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Anchor", { weapons: ["Longsword"], ranks: { Anchor: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warrior, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([warrior, ghoul]);
      const theirs = await giveTurn(combat, ghoul);
      const budget = foundry.utils.deepClone(theirs.budget);
      const said = await warnings(async () => { await disengage(ghoul); });
      assert.isNotEmpty(said.filter(s => s.includes(warrior.name)), "the refusal does not name the Anchor");
      assert.deepEqual(theirs.budget, budget, "a refused Disengage spent the Half-Action");
      assert.isFalse(ghoul.statuses?.has("disengaging") === true);
    });

    it("SHIELD SLAM: 6 Rage strikes with the shield at Damage Rating 4, no Pierce, and Stuns at SL 2 at rank 2", async function () {
      this.timeout(240000);
      const warrior = await warriorWith("ZZ WT Slam", { weapons: ["Longsword"], armor: ["Kite shield"], ranks: { "Shield Slam": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await giveTurn(combat, warrior);
      await setPool(warrior, "rage", 6);
      const card = await strike(warrior, { targets: [rowOf(ghoul)], riders: ["shield-slam"] });
      const sl = card.rolls[0].outcome.sl;
      assert.isAtLeast(sl, 2);
      const damage = card.flags["azeroth-rpg"].damage;
      assert.equal(damage.damage, 4 + sl, "the blow is not the shield's 4 and the SL");
      assert.equal(damage.penetration, 0, "the shield carried the sword's Pierce");
      await until(() => ghoul.statuses?.has("stunned"), "Stunned on the ghoul");
    });

    it("UNBREAKABLE: with a shield, a Critical Injury rolls two dice and takes the lower; without, one", async function () {
      this.timeout(180000);
      const warrior = await warriorWith("ZZ WT Unbreakable", { weapons: ["Longsword"], armor: ["Kite shield"], ranks: { Unbreakable: 1 } });
      const twice = await workflows().rollCriticalInjury({ actor: warrior, location: "body" });
      made.push(twice);
      assert.equal(twice.rolls.length, 2, "two dice with a shield");
      assert.include(textOf(twice), "Unbreakable");
      const shield = itemNamed(warrior, "Kite shield");
      await shield.update({ "system.equipped": false });
      await until(() => warrior.shieldInHand === false, "the shield put away");
      const once = await workflows().rollCriticalInjury({ actor: warrior, location: "body" });
      made.push(once);
      assert.equal(once.rolls.length, 1, "two dice without a shield");
    });
  });
}
