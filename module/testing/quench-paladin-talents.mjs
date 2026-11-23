/**
 * **THE PALADIN'S THIRTY-SIX, LIVE** (04-TALENTS; D-772, the talent plan's Phase
 * 5). One focused test per talent the phase builds, through the real doors:
 *
 * - Retribution: Crusader Strike's tier on the hit; Hammer of Wrath's line on
 *   the dialog; Judgement's Bane for a round a rank; Consecrated's weapon and
 *   Sanctified Weapon's Greater grade; Hammer of Justice brought down for no
 *   Mana and no action; Vengeance's promise when a friend falls, and through
 *   the GM's query for a holder another user owns (the architect's review);
 *   Fanaticism's Zeal kept and begun at 3; Wrath of the Light at the weapon's
 *   Rating.
 * - Benediction (rebuilt by the class talent audit, D-1875): Blessing's lasting
 *   Boon on one friend and on two at rank 2; Healing Hands on Lay on Hands;
 *   Mending Word with Twofold Light's half; Illumination's Mana back; Divine
 *   Favor's counter, and no Mana waived any more. Beacon of Hope and Mercy of
 *   Uther are `azeroth-rpg.audit-martial`'s.
 * - Aegis: Redoubt and Holy Shield at the Block; Blessed Plate's school;
 *   Unyielding's Prone refused and Speed held; Sacred Duty's aura.
 *
 * Written in Phase 5 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.paladin-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings, tokenDrawn, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { reactWithDialog } from "../applications/actions.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
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
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor", "spell"].includes(i.type)) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");

/** A target snapshot at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: actor.getActiveTokens?.(true)?.[0]?.id ?? null, sceneId: canvas?.scene?.id ?? null, actorId: actor.id, name: actor.name, defense: 10,
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
  const scene = await Scene.create({ name: "ZZ Paladin Talents Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, {
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })));
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/** A Paladin at a level with these talents taken and these things held and worn. */
async function paladinWith(name, { level = 5, ranks = {}, weapons = [], armor = [], spells = [], abilities = { str: 14, cha: 16 } } = {}) {
  const paladin = await makeCharacter({ name, classes: [["Paladin", level]], weapons, armor, spells, abilities });
  for (const n of [...weapons, ...armor]) {
    const item = await until(() => itemNamed(paladin, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => paladin.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(paladin, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(paladin, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return paladin;
}

/** Set a pool to a value - a Momentum pool AFTER a fight starts, which begins it at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Fill a pool to its maximum. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await setPool(actor, name, pool.max);
  return poolOf(actor, name);
}

/** One attack straight through the workflow, the die pinned. */
async function strike(actor, { face = 15, dc = 5, ...extra } = {}) {
  const held = actor.readyWeapons()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: held?.system?.rating ?? 1, kind: "physical", weaponRating: held?.system?.rating ?? 1 },
      strike: { rangeKind: "melee" }, weaponId: held?.id ?? null, ...extra
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

export function paladinTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Paladin's thirty-six (D-772)", function () {
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

    /* ---- Retribution --------------------------------------------------- */

    it("CRUSADER STRIKE: 4 Zeal adds the tier to the hit", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Crusader", { weapons: ["Longsword"], ranks: { "Crusader Strike": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([paladin, ghoul]);
      await giveTurn(combat, paladin);
      await setPool(paladin, "zeal", 4);
      const card = await strike(paladin, { targets: [rowOf(ghoul)], riders: ["crusader-strike"] });
      assert.isTrue(card.rolls[0].outcome.success);
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rider.Card.Damage", { n: paladin.system.tier }), "the card does not add the tier");
    });

    it("HAMMER OF WRATH: the attack dialog draws a ticked Boon against a target below half Health, and none against a whole one", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Wrath", { weapons: ["Longsword"], ranks: { "Hammer of Wrath": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      canvas.tokens.setTargets([ghoul.getActiveTokens(true)[0].id]);
      const spec = { kind: "attack", title: "Longsword", damage: { rating: 4, kind: "physical" }, rangeKind: "melee" };
      const whole = prepareRoll(paladin, spec).situational.automatic.map(l => l.id);
      assert.notInclude(whole, "talentBoon", "a Boon against a target at full Health");
      await ghoul.update({ "system.health.value": Math.floor((ghoul.system.health.max - 1) / 2) });
      const low = prepareRoll(paladin, spec).situational.automatic.find(l => l.id === "talentBoon");
      assert.ok(low, "no Boon against a target below half Health");
      assert.equal(low.boons, 1);
    });

    it("JUDGEMENT: one target takes a Bane on attacks against anyone but the Paladin for a round a rank", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Judgement", { weapons: ["Longsword"], ranks: { "Righteous Fury": 1, Judgement: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([paladin, ghoul]);
      await giveTurn(combat, paladin);
      await setPool(paladin, "zeal", 6);
      await use(paladin, "Judgement", { targets: [rowOf(ghoul)] });
      const bane = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane")), "Judgement's Bane");
      const flag = bane.getFlag("azeroth-rpg", "laidBane");
      assert.equal(flag.except?.actorId, paladin.id, "the Bane does not spare the Paladin");
      assert.isTrue(flag.lasting === true);
      assert.deepInclude(bane.duration, { value: 2, units: "rounds" }, "the span is not a round a rank");
    });

    it("CONSECRATED and SANCTIFIED WEAPON: the Use enchants the main hand with Blessed, Greater with the talent, and moves on the next Use", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Consecrated", { weapons: ["Longsword"] });
      const sword = itemNamed(paladin, "Longsword");
      await use(paladin, "Consecrated");
      await until(() => sword.getFlag("azeroth-rpg", "consecrated"), "the sword enchanted");
      assert.include(paladin.items.get(sword.id).system.traits, "Blessed (Lesser)");
      await talentNamed(paladin, "Sanctified Weapon").update({ "system.taken": 1 });
      await until(() => paladin.items.get(sword.id).system.traits.includes("Blessed (Greater)"), "the Greater grade", 30000);
      // With nothing in the main hand the Use is refused, and costs nothing.
      await sword.update({ "system.equipped": false });
      const feature = featureNamed(paladin, "Consecrated");
      await feature.update({ "system.uses.value": 1 });
      const said = await warnings(async () => { await use(paladin, "Consecrated"); });
      assert.include(said, game.i18n.format("AZEROTH.Consecrated.NoWeapon", { name: "Consecrated" }));
      assert.equal(featureNamed(paladin, "Consecrated").system.uses.value, 1, "a refused Use was struck");
    });

    it("HAMMER OF JUSTICE at rank 2: a 6 Zeal Judgement brings 07's Hammer of Justice down on its target for no Mana and no action", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Hammer", { weapons: ["Longsword"], ranks: { "Righteous Fury": 1, Judgement: 1, "Hammer of Justice": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ghoul, x: 1200, y: 1000, side: "hostile" }]);
      const combat = await fightWith([paladin, ghoul]);
      const mine = await giveTurn(combat, paladin);
      await setPool(paladin, "zeal", 6);
      const mana = poolOf(paladin, "mana")?.value ?? null;
      const before = game.messages.size;
      await use(paladin, "Judgement", { targets: [rowOf(ghoul)] });
      const hammer = await until(() => game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.spellName === "Hammer of Justice"), "Hammer of Justice cast", 30000);
      made.push(hammer);
      assert.include(textOf(hammer), game.i18n.format("AZEROTH.Cast.FreeBy", { name: "Hammer of Justice" }), "the card does not say what paid for it");
      assert.equal(hammer.flags["azeroth-rpg"].targets?.[0]?.actorId, ghoul.id, "the Hammer fell on another creature");
      assert.equal(poolOf(paladin, "mana")?.value ?? null, mana, "the free cast spent Mana");
      assert.equal(mine.budget.halfActions, 1, "the free cast spent a Half-Action beside Judgement's");
      // Rank 1's refund stands beside it: 6 paid, 2 back.
      assert.equal(poolOf(paladin, "zeal").value, 2);
    });

    it("VENGEANCE: a friendly creature dropping to 0 within 20 feet promises the tier a rank to the next attack this encounter", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Vengeance", { weapons: ["Longsword"], ranks: { Vengeance: 2 } });
      const ally = await makeCharacter({ name: "ZZ PT Fallen", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      await fightWith([paladin, ally, ghoul]);
      await ally.applyDamage(ally.system.health.value, { struck: true, attack: true, by: ghoul });
      await until(() => paladin.pendingNextAttack().damage === paladin.system.tier * 2, "Vengeance's promise", 30000);
    });

    it("VENGEANCE for a holder another user owns: the fall goes to the GM through the query, which judges it again and lays the promise", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Vengeance Far", { weapons: ["Longsword"], ranks: { Vengeance: 1 } });
      const ally = await makeCharacter({ name: "ZZ PT Fallen Far", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      await fightWith([paladin, ally, ghoul]);
      // This client stands in for a player who owns the fallen ally and not the
      // Paladin: the holder reads as not ours, and the GM's query is captured
      // and answered by the registered handler, as the GM's client answers it.
      const gm = game.users.activeGM;
      const seen = [];
      Object.defineProperty(paladin, "isOwner", { value: false, configurable: true });
      gm.query = async (name, data) => {
        seen.push({ name, data });
        return CONFIG.queries[name](data, { user: game.user });
      };
      try {
        await ally.applyDamage(ally.system.health.value, { struck: true, attack: true, by: ghoul });
        await until(() => seen.length === 1, "the fall passed to the GM", 30000);
      } finally {
        delete gm.query;
        delete paladin.isOwner;
      }
      assert.equal(seen[0].name, "azeroth-rpg.vengeance");
      assert.equal(seen[0].data.holderUuid, paladin.uuid);
      assert.equal(seen[0].data.fallenUuid, ally.uuid);
      await until(() => paladin.pendingNextAttack().damage === paladin.system.tier, "the promise the GM laid", 30000);
      // A creature that stands again lays nothing, whatever the request says.
      await ally.update({ "system.health.value": 1 });
      await until(() => ally.system.health.value === 1, "the ally standing");
      const none = await CONFIG.queries["azeroth-rpg.vengeance"]({ holderUuid: paladin.uuid, fallenUuid: ally.uuid, feet: 5 }, { user: game.user });
      assert.deepEqual(none, [], "a creature still standing laid Vengeance");
    });

    // 2 Zeal a rank, and the Zeal no longer kept, since the class talent audit (D-1874).
    it("FANATICISM: a fight begins at 2 Zeal a rank, and the Zeal drains when the fight ends", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Fanatic", { weapons: ["Longsword"], ranks: { Fanaticism: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([paladin, ghoul]);
      await until(() => poolOf(paladin, "zeal").value === 4, "4 Zeal at the fight's start");
      await setPool(paladin, "zeal", 5);
      await combat.delete();
      await until(() => poolOf(paladin, "zeal").value === 0, "the Zeal drained at the fight's end", 30000);
    });

    it("WRATH OF THE LIGHT: 10 Zeal deals Holy at the main-hand weapon's Rating, and offers Blinded until the Paladin's turn starts", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Light", { level: 13, weapons: ["Longsword"], ranks: { "Seal of Command": 1, "Wrath of the Light": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([paladin, ghoul]);
      await giveTurn(combat, paladin);
      await setPool(paladin, "zeal", 10);
      const card = await use(paladin, "Wrath of the Light", { targets: [rowOf(ghoul)] });
      assert.ok(card, "the Use posted no card");
      assert.equal(card.flags["azeroth-rpg"].damageByTarget[0].damage, itemNamed(paladin, "Longsword").system.rating, "the damage is not the weapon's Rating");
      const blinded = parsed(card).querySelector('[data-action="applyCondition"][data-condition="blinded"]');
      assert.ok(blinded, "no Blinded button");
      assert.equal(blinded.dataset.until, "casterTurnStart");
    });

    /* ---- Benediction --------------------------------------------------- */

    // Until the start of the Paladin's next turn, and two friends at rank 2, since the class talent audit (D-1874).
    it("BLESSING: rank 1 lays a lasting Boon no Test spends; rank 2 lays one on each of two friends", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Blessing", { ranks: { Blessing: 1 } });
      const friend = await makeCharacter({ name: "ZZ PT Blessed", classes: [["Warrior", 3]] });
      const other = await makeCharacter({ name: "ZZ PT Blessed Too", classes: [["Warrior", 3]] });
      await fill(paladin, "mana");
      await use(paladin, "Blessing", { targets: [rowOf(friend)] });
      const laid = await until(() => friend.effects.find(e => e.getFlag("azeroth-rpg", "laidBoon")?.lasting === true), "the lasting Boon on the friend");
      assert.equal(laid.duration?.units, "seconds", "out of a fight it does not run a round of the world's clock");
      const unpin = pinDie(10);
      try {
        const test = await workflows().rollTest({ actor: friend, kind: "skill", dc: 10, title: "Athletics" });
        made.push(test);
      } finally {
        unpin();
      }
      assert.ok(friend.effects.get(laid.id), "a Test spent the lasting Boon");
      await talentNamed(paladin, "Blessing").update({ "system.taken": 2 });
      await until(() => talentNamed(paladin, "Blessing").system.taken === 2, "rank 2");
      await fill(paladin, "mana");
      await use(paladin, "Blessing", { targets: [rowOf(friend), rowOf(other)] });
      await until(() => other.effects.some(e => e.getFlag("azeroth-rpg", "laidBoon")?.lasting === true), "the Boon on the second friend");
    });

    // Devotion and Holy Guidance left 04 with the class talent audit's Benediction (D-1875); Healing Hands adds its
    // rank, to no more than the tier, where the heal lands.
    it("HEALING HANDS: Lay on Hands restores its rank more, to no more than the tier", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Healing Hands", { level: 9, ranks: { "Healing Hands": 3 } });
      const patient = await makeCharacter({ name: "ZZ PT Patient", classes: [["Warrior", 3]] });
      await patient.update({ "system.health.value": 1 });
      await patient.applyHealing(5, { from: paladin, feature: true, featureName: "Lay on Hands" });
      const want = Math.min(patient.system.health.max, 1 + 5 + Math.min(3, paladin.system.tier));
      await until(() => patient.system.health.value === want, "the rank, capped at the tier, more");
    });

    // Light's Reserve left 04 with the class talent audit's Benediction (D-1875). Mending Word and Twofold Light:
    it("MENDING WORD and TWOFOLD LIGHT: 4 Zeal heals a friend twice the tier, and a second friend within 10 feet half", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Mending", { ranks: { "Mending Word": 1, "Twofold Light": 1 } });
      const first = await makeCharacter({ name: "ZZ PT Mended", classes: [["Warrior", 3]] });
      const second = await makeCharacter({ name: "ZZ PT Mended Too", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: paladin, x: 1500, y: 1000 }, { actor: first, x: 1000, y: 1000 }, { actor: second, x: 1100, y: 1000 }]);
      // Twofold Light's *friendly target* is the ally rule (D-755): out of a fight, a Party member (D-658).
      for (const a of [paladin, first, second]) await a.setParty(true);
      await first.update({ "system.health.value": 1 });
      await second.update({ "system.health.value": 1 });
      await setPool(paladin, "zeal", 6);
      const card = await use(paladin, "Mending Word", { targets: [rowOf(first)] });
      assert.ok(card, "the Use posted no card");
      assert.equal(poolOf(paladin, "zeal").value, 2, "Mending Word did not take 4 Zeal");
      const heal = 2 * paladin.system.tier;
      assert.equal(card.flags["azeroth-rpg"].heal, heal);
      // The heal names its card, as the card's own Apply does (the class talent audit's final review).
      await first.applyHealing(heal, { from: paladin, feature: true, featureName: "Mending Word", messageId: card.id });
      await until(() => second.system.health.value === 1 + Math.floor(heal / 2), "half to the second friend");
      await until(() => card.flags["azeroth-rpg"].twofoldShared === true, "the card marked as having shared");
      // A second heal off the same card shares nothing: the card is claimed once.
      await first.update({ "system.health.value": 1 });
      const sharedOnce = second.system.health.value;
      await first.applyHealing(heal, { from: paladin, feature: true, featureName: "Mending Word", messageId: card.id });
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(second.system.health.value, sharedOnce, "a second heal off one Mending Word card shared again");
    });

    it("ILLUMINATION: a Casting Test at SL 2 returns a Mana a rank", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Illumination", { spells: ["Holy Light"], ranks: { Illumination: 2 } });
      await setPool(paladin, "mana", 6);
      const spell = await until(() => itemNamed(paladin, "Holy Light"), "Holy Light known");
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await workflows().castSpell({ actor: paladin, spell, dc: 5 });
      } finally {
        unpin();
      }
      made.push(card);
      assert.isAtLeast(card.flags["azeroth-rpg"].sl, 2);
      await until(() => poolOf(paladin, "mana").value === 6 - spell.system.mana + 2, "the Mana back");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Cast.ManaBackRow", { n: 2 }));
    });

    // The Beacon talent left 04 with the class talent audit's Benediction (D-1875); 02's Beacon of Hope is
    // `azeroth-rpg.audit-martial`'s.

    // A Holy heal cast as a Half-Action since the class talent audit (D-1875): its counter is the rank an encounter,
    // and no healing feature's Mana is waived any more (the wave-2 fix run deleted the old waiver).
    it("DIVINE FAVOR: its counter is the rank an encounter, and Lay on Hands pays its Mana", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Favor", { ranks: { "Divine Favor": 2 } });
      const patient = await makeCharacter({ name: "ZZ PT Favor Patient", classes: [["Warrior", 3]] });
      const counter = await until(() => featureNamed(paladin, "Divine Favor"), "the counter");
      assert.equal(Number(counter.system.uses?.max), 2);
      assert.equal(counter.system.uses?.per, "encounter");
      await setPool(paladin, "mana", 5);
      await use(paladin, "Lay on Hands", { targets: [rowOf(patient)] });
      await until(() => poolOf(paladin, "mana").value === 5 - 2, "Lay on Hands pays its 2");
      assert.equal(paladin.items.get(counter.id).system.uses.value, 2, "the counter was struck by a feature");
    });

    /* ---- Aegis --------------------------------------------------------- */

    it("REDOUBT and HOLY SHIELD: a Block takes 4 and the rank, and its card carries the rank's Holy back to the attacker", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Shield", { weapons: ["Longsword"], armor: ["Kite shield"], ranks: { Redoubt: 2, "Holy Shield": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const blow = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: ghoul }), content: "<p>ZZ PT a blow</p>" });
      made.push(blow);
      const card = await reactWithDialog(paladin, "block", { messageId: blow.id });
      assert.ok(card, "the Block was refused");
      made.push(card);
      assert.equal(paladin.getFlag("azeroth-rpg", "mitigate").amount, 4 + 2, "the Block is not 06's four and Redoubt's two");
      const apply = parsed(card).querySelector('[data-action="applyDamage"]');
      assert.ok(apply, "the Block's card carries no Holy back");
      const before = ghoul.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, card);
      await until(() => ghoul.system.health.value === before - 2, "Holy Shield's 2 on the attacker");
    });

    it("BLESSED PLATE: the Use names a school, and the Paladin holds Ward the rank against it", async function () {
      this.timeout(240000);
      const paladin = await paladinWith("ZZ PT Plate", { ranks: { "Blessed Plate": 3 } });
      const item = await until(() => featureNamed(paladin, "Blessed Plate"), "Blessed Plate granted");
      const before = paladin.system.ward?.shadow ?? 0;
      const used = workflows().useFeature({ actor: paladin, item });
      await pickOne(item, game.i18n.localize(AZEROTH.schools.shadow));
      const card = await used;
      if (card) made.push(card);
      await until(() => (paladin.system.ward?.shadow ?? 0) === before + 3, "Ward 3 against Shadow");
    });

    it("UNYIELDING: Prone is refused, and Slowed does not reduce the Speed", async function () {
      this.timeout(180000);
      const paladin = await paladinWith("ZZ PT Unyielding", { ranks: { Unyielding: 1 } });
      const speed = paladin.system.speed;
      await paladin.toggleStatusEffect("prone", { active: true });
      await settle();
      assert.isFalse(paladin.statuses.has("prone"), "an Unyielding Paladin was knocked Prone");
      await paladin.toggleStatusEffect("slowed", { active: true });
      await until(() => paladin.statuses.has("slowed"), "Slowed laid");
      assert.equal(paladin.system.speed, speed, "Slowed reduced an Unyielding Speed");
    });

    it("SACRED DUTY: the Paladin's Armor Points rise by the rank while another friendly creature stands within 5 feet, and fall when it leaves", async function () {
      this.timeout(300000);
      const paladin = await paladinWith("ZZ PT Duty", { ranks: { "Sacred Duty": 2 } });
      const ally = await makeCharacter({ name: "ZZ PT Duty Ally", classes: [["Warrior", 3]] });
      // Out of a fight a friend is a fellow member of the Party (D-755), never a
      // token's disposition (B8b).
      for (const a of [paladin, ally]) await a.setParty(true);
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ally, x: 2000, y: 1000 }]);
      await drainAreaWork();
      const base = paladin.system.ap?.body ?? 0;
      await ally.getActiveTokens(true)[0].document.update({ x: 1100, y: 1000 });
      await until(() => ally.getActiveTokens(true)[0].document.x === 1100, "the ally beside the Paladin");
      await drainAreaWork();
      await until(() => (paladin.system.ap?.body ?? 0) === base + 2, "Sacred Duty's 2", 30000);
      await ally.getActiveTokens(true)[0].document.update({ x: 2000, y: 1000 });
      await until(() => ally.getActiveTokens(true)[0].document.x === 2000, "the ally gone");
      await drainAreaWork();
      await until(() => (paladin.system.ap?.body ?? 0) === base, "the aura lifted", 30000);
    });
  });
}
