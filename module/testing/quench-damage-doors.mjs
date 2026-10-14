/**
 * **THE DAMAGE DOOR'S RULINGS, LIVE** (D-777; the lead, 2026-10-03). One focused
 * test per ruling the phase builds, through the real doors:
 *
 * - O-154, *"raise HP past max as temp hp"*: 05's temporary Health on both
 *   actors - granted, taken first by damage, never stacked, ended with what
 *   granted it - by Last Stand, Rallying Cry, Power Word: Shield, Ice Barrier,
 *   Living Seed, Light's Grace and the Flask of the Titans, and drawn on both
 *   banners in words.
 * - O-155, *"If the talent moves damage it should just move the damage as
 *   directed"*: Guardian and Shield of the Righteous ASKED in the blow, and Spirit
 *   Link Totem's division.
 * - O-156, *"Yes."*: Intervention, Spirit Shell and Guardian Spirit asked in the
 *   blow, and 07's Aegis of the Light's floor.
 * - O-162, *"Different damage types in one attack are possible"*: Arcane Power's
 *   Arcane on a Fire spell, Stormlash's and Stormstrike's Nature on a blow.
 *
 * Written in Phase B1 and NOT run there (the brief: *"Quench: write, don't
 * run"*). Run alone with `QUENCH_BATCH=azeroth-rpg.damage-doors`. Every document
 * a test makes is deleted in `after`, a fight or a scene a test already deleted
 * excepted (a refused delete is a console error the smoke run fails on). A
 * holder this GM owns is asked through a dialog on this client, which `answer`
 * presses.
 */

import { cleanup, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { layWard } from "../effects/wards.mjs";
import { SPIRIT_LINK_FLAG } from "../rules/class-talents.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
import { TEMP_FLAG } from "../rules/temporary-health.mjs";

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
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const weaponNamed = (actor, name) => actor.items.find(i => i.type === "weapon" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const temp = actor => actor.system?.health?.temp ?? 0;
const health = actor => actor.system?.health?.value ?? 0;

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
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Damage Doors Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) await new Promise(r => setTimeout(r, 100));
  await settle();
  return scene;
}

/**
 * A character of a class at a level with these talents taken and these weapons
 * held and equipped, waiting for what each grants or teaches.
 */
async function characterWith(name, cls, { level = 5, ranks = {}, spells = [], weapons = [], abilities = null } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], spells, weapons, abilities });
  for (const n of weapons) {
    const item = await until(() => weaponNamed(actor, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => actor.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(actor, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(actor, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return actor;
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Set a creature's Health. */
async function setHealth(actor, value) {
  await actor.update({ "system.health.value": value });
  await until(() => health(actor) === value, `${actor.name} at ${value} Health`);
}

/** Make these the Party, so they count as each other's allies out of a fight (D-755). */
async function party(...actors) {
  for (const a of actors) await a.setParty(true);
}

/**
 * Answer the ask a holder's door opened on this client (D-777): its dialog's
 * id starts with the holder's own, and `yes` or `no` is pressed.
 */
async function answer(holder, action = "yes", ms = 15000) {
  const app = await until(() => [...foundry.applications.instances.values()]
    .find(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${holder.id}`) && a.rendered), `${holder.name}'s ask`, ms);
  app.element.querySelector(`button[data-action="${action}"]`).click();
  await until(() => !app.rendered, `${holder.name}'s ask to close`);
}

/** Pick an option in a feature's chooser (`workflows.chooseOption`) by its name. */
async function pickOne(item, name, ms = 10000) {
  const app = await until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...(select?.options ?? [])].find(o => o.textContent.trim().startsWith(name));
  if (!option) throw new Error(`${item.name}'s chooser offers no ${name}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

/** Cast through the workflow, the die pinned. */
async function cast(actor, name, { targets = [], face = 18, ...extra } = {}) {
  const spell = await until(() => spellNamed(actor, name), `${name} known`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().castSpell({ actor, spell, targets, ...extra });
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

export function damageDoorsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The damage door's rulings (D-777)", function () {
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
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-blow-ask-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // Only what is still there: a fight a test deleted is not asked for twice.
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- O-154: 05's temporary Health ----------------------------------- */

    it("TEMPORARY HEALTH: both actors carry it from 0; damage takes it first; the record goes with the last of it", async function () {
      this.timeout(60000);
      const pc = await makeCharacter({ name: "ZZ Temp Character", classes: [["Warrior", 3]] });
      const npc = await makeNpc("Bandit");
      assert.equal(temp(pc), 0, "a character starts with none");
      assert.equal(temp(npc), 0, "a creature starts with none");
      const max = pc.system.health.max;
      await setHealth(pc, max);
      const granted = await pc.grantTemporaryHealth(6, { source: "ZZ Test", span: "longRest" });
      assert.isTrue(granted.landed);
      assert.equal(temp(pc), 6);
      assert.equal(pc.getFlag("azeroth-rpg", TEMP_FLAG)?.source, "ZZ Test");
      await pc.applyDamage(4, { struck: true, attack: true });
      assert.equal(temp(pc), 2, "the blow came off temporary Health first");
      assert.equal(health(pc), max, "and none of it touched the creature's own");
      await pc.applyDamage(5, { struck: true, attack: true });
      assert.equal(temp(pc), 0);
      assert.equal(health(pc), max - 3, "only what was left over touched it");
      assert.notOk(pc.getFlag("azeroth-rpg", TEMP_FLAG), "the record went with the last of it");
      await npc.grantTemporaryHealth(5, { source: "ZZ Test" });
      await npc.applyDamage(2, { struck: true, attack: true });
      assert.equal(temp(npc), 3, "a creature's is taken the same way");
    });

    it("NO STACK: a smaller grant is wasted, a larger replaces, healing never restores it, a Long Rest ends it", async function () {
      this.timeout(60000);
      const pc = await makeCharacter({ name: "ZZ Temp Stack", classes: [["Warrior", 3]] });
      await pc.grantTemporaryHealth(8, { source: "First" });
      const smaller = await pc.grantTemporaryHealth(5, { source: "Second" });
      assert.isFalse(smaller.landed);
      assert.equal(temp(pc), 8, "the smaller grant is wasted");
      await pc.grantTemporaryHealth(10, { source: "Third" });
      assert.equal(temp(pc), 10, "the larger replaces");
      await pc.applyDamage(4, { struck: true, attack: true });
      await pc.applyHealing(20, { from: pc });
      assert.equal(temp(pc), 6, "healing never restores it");
      await pc.longRest();
      assert.equal(temp(pc), 0, "a Long Rest ends it (the rulings' READING)");
    });

    it("A1: Scorched's and Burning's damage take it first; Bleeding's Health lost never touches it", async function () {
      this.timeout(60000);
      const pc = await makeCharacter({ name: "ZZ Temp A1", classes: [["Warrior", 3]] });
      const max = pc.system.health.max;
      await setHealth(pc, max);
      await pc.grantTemporaryHealth(5, { source: "ZZ" });
      await pc.takeStraightDamage(3);
      assert.equal(temp(pc), 2, "Scorched's Fire is damage: temporary Health first");
      assert.equal(health(pc), max);
      await pc.loseHealth(2);
      assert.equal(temp(pc), 2, "Bleeding is Health lost: temporary Health untouched");
      assert.equal(health(pc), max - 2);
    });

    it("LAST STAND: the Use pays 10 Rage and grants twice the tier per rank, and the fight's end takes it", async function () {
      this.timeout(90000);
      const warrior = await characterWith("ZZ Last Stand", "Warrior", { level: 6, ranks: { "Last Stand": 2 } });
      const foe = await makeNpc("Bandit");
      const combat = await fightWith([warrior, foe]);
      await giveTurn(combat, warrior);
      await setPool(warrior, "rage", 10);
      const card = await use(warrior, "Last Stand");
      assert.ok(card, "the Use posts its card");
      const tier = warrior.system.tier;
      await until(() => temp(warrior) === 2 * tier * 2, "twice the tier per rank");
      assert.equal(warrior.getFlag("azeroth-rpg", TEMP_FLAG)?.span, "encounter");
      assert.equal(warrior.getFlag("azeroth-rpg", TEMP_FLAG)?.combatId, combat.id, "the fight it lasts for");
      assert.equal(poolOf(warrior, "rage").value, 0, "10 Rage paid");
      // `endCombat()` opens core's confirm in v14; deleting the fight runs
      // `_onExit` for every combatant, which is where `_leaveFight` ends it.
      await combat.delete();
      await until(() => temp(warrior) === 0, "the fight's end to take it");
    });

    it("RALLYING CRY: every ally within 30 feet, the warrior among them, gains the warrior's level until a Long Rest", async function () {
      this.timeout(90000);
      const warrior = await characterWith("ZZ Rallier", "Warrior", { level: 14 });
      const ally = await makeCharacter({ name: "ZZ Rallied", classes: [["Warrior", 3]] });
      await party(warrior, ally);
      await sceneWith([{ actor: warrior, x: 100, y: 100 }, { actor: ally, x: 300, y: 100 }]);
      const cry = await until(() => featureNamed(warrior, "War Cry"), "War Cry granted");
      const pending = use(warrior, "War Cry");
      await pickOne(cry, game.i18n.localize("AZEROTH.Feature.WarCry.Rallying"));
      await pending;
      await until(() => temp(ally) === 14 && temp(warrior) === 14, "the level on both");
      assert.equal(ally.getFlag("azeroth-rpg", TEMP_FLAG)?.span, "longRest");
    });

    it("POWER WORD: SHIELD: the Apply grants 6 and 2 a rank with the laid effect, and the effect's end takes it", async function () {
      this.timeout(90000);
      const priest = await characterWith("ZZ Shield Priest", "Priest", { level: 3, ranks: { "Power Word: Shield": 2 }, abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ Shielded", classes: [["Warrior", 3]] });
      await setPool(priest, "mana", poolOf(priest, "mana").max);
      const card = await cast(priest, "Power Word: Shield", { targets: [rowOf(ally)] });
      assert.equal(card.getFlag("azeroth-rpg", "temporaryHealth")?.amount, 10, "07's 6 and the rank's 4 ride the card");
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(apply, "the card offers the Apply");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      await until(() => temp(ally) === 10, "the Apply to grant it");
      const laid = ally.effects.find(e => e.getFlag("azeroth-rpg", "spellName") === "Power Word: Shield");
      assert.ok(laid, "the effect it rides");
      assert.equal(ally.getFlag("azeroth-rpg", TEMP_FLAG)?.effectId, laid.id);
      await laid.delete();
      await until(() => temp(ally) === 0, "the effect's end to take it");
    });

    it("ICE BARRIER: the mage's own 8 and 2 a rank, on itself", async function () {
      this.timeout(90000);
      const mage = await characterWith("ZZ Barrier Mage", "Mage", { level: 5, ranks: { "Ice Barrier": 1 }, abilities: { int: 16 } });
      await setPool(mage, "mana", poolOf(mage, "mana").max);
      const card = await cast(mage, "Ice Barrier");
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"][data-self]');
      assert.ok(apply, "a Self spell's Apply");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      await until(() => temp(mage) === 10, "Ice Barrier's 8 and the rank's 2");
    });

    it("LIVING SEED: a heal that takes a friend to full grants the tier per rank until the encounter ends; one that does not grants none", async function () {
      this.timeout(60000);
      const druid = await characterWith("ZZ Seed Druid", "Druid", { level: 5, ranks: { "Living Seed": 2 } });
      const ally = await makeCharacter({ name: "ZZ Seeded", classes: [["Warrior", 3]] });
      const other = await makeCharacter({ name: "ZZ Not Full", classes: [["Warrior", 3]] });
      await party(druid, ally, other);
      await setHealth(ally, ally.system.health.max - 3);
      await ally.applyHealing(5, { from: druid, spell: true });
      await until(() => temp(ally) === druid.system.tier * 2, "Living Seed's grant");
      assert.equal(ally.getFlag("azeroth-rpg", TEMP_FLAG)?.span, "encounter");
      await setHealth(other, other.system.health.max - 6);
      await other.applyHealing(2, { from: druid, spell: true });
      assert.equal(temp(other), 0, "a heal short of full grants none");
    });

    it("LIGHT'S GRACE: Mend on a creature at full grants the tier plus the rank, through the card's own Apply", async function () {
      this.timeout(90000);
      const priest = await characterWith("ZZ Grace Priest", "Priest", { level: 3, ranks: { "Light's Grace": 2 }, abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ Graced", classes: [["Warrior", 3]] });
      await setHealth(ally, ally.system.health.max);
      await setPool(priest, "mana", poolOf(priest, "mana").max);
      const card = await use(priest, "Mend", { targets: [rowOf(ally)] });
      const button = parsed(card).querySelector('[data-action="applyHealing"][data-target-index="0"]');
      assert.ok(button, "Mend's card offers its heal");
      await CARD_ACTIONS.applyHealing(button, card);
      await until(() => temp(ally) === priest.system.tier + 2, "Light's Grace's grant");
    });

    it("FLASK OF THE TITANS: twice the level for an hour, on an effect whose end takes it", async function () {
      this.timeout(60000);
      const pc = await makeCharacter({ name: "ZZ Flask Drinker", classes: [["Warrior", 6]] });
      const flask = await give(pc, "Flask of the Titans");
      const card = await workflows().useGear({ actor: pc, item: flask });
      if (card) made.push(card);
      await until(() => temp(pc) === 2 * pc.system.level, "the flask's twice the level");
      const carrier = pc.effects.find(e => e.name === "Flask of the Titans");
      assert.ok(carrier?.duration?.value, "an effect of the draught's hour carries it");
      await carrier.delete();
      await until(() => temp(pc) === 0, "the hour's end to take it");
    });

    it("THE BANNER: both sheets draw it past the maximum in words, its source and span in the tooltip", async function () {
      this.timeout(60000);
      const pc = await makeCharacter({ name: "ZZ Temp Banner", classes: [["Warrior", 3]] });
      const npc = await makeNpc("Bandit");
      await pc.grantTemporaryHealth(7, { source: "ZZ Source", span: "encounter" });
      await npc.grantTemporaryHealth(4, { source: "ZZ Source" });
      for (const [actor, n] of [[pc, 7], [npc, 4]]) {
        const sheet = await openSheet(actor);
        const line = sheet.element.querySelector(".azeroth-temp-health");
        assert.ok(line, `${actor.name}: the banner draws it`);
        assert.equal(line.textContent.trim(), game.i18n.format("AZEROTH.Health.Temporary", { n }));
        assert.include(line.dataset.tooltip ?? "", "ZZ Source");
        await sheet.close();
      }
    });

    /* ---- O-156: the hold at 1 -------------------------------------------- */

    it("INTERVENTION: asked in the blow; a yes holds at 1 and strikes a use, a no lets it fall", async function () {
      this.timeout(120000);
      const paladin = await characterWith("ZZ Intervener", "Paladin", { level: 9, ranks: { Intervention: 2 } });
      const ally = await makeCharacter({ name: "ZZ Intervened", classes: [["Warrior", 3]] });
      await party(paladin, ally);
      await sceneWith([{ actor: paladin, x: 100, y: 100 }, { actor: ally, x: 500, y: 100 }]);
      const counter = await until(() => featureNamed(paladin, "Intervention"), "Intervention's counter");
      const left = counter.system.uses.value;
      assert.equal(left, 2, "a use a rank");
      await setHealth(ally, 3);
      const blow = ally.applyDamage(10, { struck: true, attack: true });
      await answer(paladin, "yes");
      await blow;
      assert.equal(health(ally), 1, "held at 1");
      assert.equal(paladin.items.get(counter.id).system.uses.value, left - 1, "a use struck");
      await setHealth(ally, 3);
      const again = ally.applyDamage(10, { struck: true, attack: true });
      await answer(paladin, "no");
      await again;
      assert.equal(health(ally), 0, "a no lets it fall");
      assert.equal(paladin.items.get(counter.id).system.uses.value, left - 1, "and strikes nothing");
    });

    it("SPIRIT SHELL: an attack on a creature the priest warded is asked; a yes holds at 1", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Shell Priest", "Priest", { level: 9, ranks: { "Spirit Shell": 1 } });
      const ally = await makeCharacter({ name: "ZZ Shelled", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: priest, x: 100, y: 100 }, { actor: ally, x: 300, y: 100 }]);
      const laid = await layWard({ priest, target: ally, ward: { schools: ["fire"] }, span: null });
      assert.isTrue(laid.landed, "the priest's Ward stands on it");
      await setHealth(ally, 2);
      const blow = ally.applyDamage(9, { struck: true, attack: true });
      await answer(priest, "yes");
      await blow;
      assert.equal(health(ally), 1);
    });

    it("GUARDIAN SPIRIT: a yes holds at 1 and restores the tier", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Guardian Spirit", "Priest", { level: 9, ranks: { "Guardian Spirit": 1 } });
      const ally = await makeCharacter({ name: "ZZ Spirited", classes: [["Warrior", 3]] });
      await party(priest, ally);
      await sceneWith([{ actor: priest, x: 100, y: 100 }, { actor: ally, x: 1500, y: 100 }]);
      await setHealth(ally, 2);
      const blow = ally.applyDamage(9, { struck: true, attack: true });
      await answer(priest, "yes");
      await blow;
      await until(() => health(ally) === 1 + priest.system.tier, "held at 1, then the tier restored");
    });

    it("AEGIS OF THE LIGHT: the Apply lays the floor; a blow is held at 1; no Critical Injury; its end restores the tier", async function () {
      this.timeout(150000);
      const paladin = await characterWith("ZZ Aegis Paladin", "Paladin", { level: 20, ranks: { "Aegis of the Light": 1 } });
      const ally = await makeCharacter({ name: "ZZ Aegised", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Bandit");
      const combat = await fightWith([paladin, ally, foe]);
      const card = await cast(paladin, "Aegis of the Light", { targets: [rowOf(ally)], free: { by: "ZZ" } });
      assert.ok(card.getFlag("azeroth-rpg", "floor"), "the card carries 07's floor");
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(apply, "the card offers the Apply");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      const floor = await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", FLOOR_FLAG)), "the floor laid");
      await setHealth(ally, 3);
      await ally.applyDamage(30, { struck: true, attack: true });
      assert.equal(health(ally), 1, "no source reduces it below 1");
      await until(() => ally.effects.get(floor.id)?.getFlag("azeroth-rpg", FLOOR_FLAG)?.held === true, "the floor marked as having held");
      const refused = await workflows().rollCriticalInjury({ actor: ally });
      made.push(refused);
      assert.include(refused.content, game.i18n.format("AZEROTH.AegisLight.NoCritical", { name: ally.name }));
      await ally.effects.get(floor.id).delete();
      await until(() => health(ally) === 1 + paladin.system.tier, "the talent's tier restored as the floor ends");
      await combat.delete();
    });

    /* ---- O-155: a blow moved or divided ------------------------------------ */

    it("GUARDIAN: a hit on a friend within 5 feet is asked; a yes pays 6 Rage and the warrior takes it in full, a no lands it where it was aimed", async function () {
      this.timeout(120000);
      const warrior = await characterWith("ZZ Guardian", "Warrior", { level: 5, ranks: { Guardian: 1 } });
      const ally = await makeCharacter({ name: "ZZ Guarded", classes: [["Warrior", 3]] });
      await party(warrior, ally);
      await sceneWith([{ actor: warrior, x: 100, y: 100 }, { actor: ally, x: 200, y: 100 }]);
      await setHealth(warrior, warrior.system.health.max);
      await setHealth(ally, ally.system.health.max);
      await setPool(warrior, "rage", 6);
      const wasW = health(warrior);
      const wasA = health(ally);
      const blow = ally.applyDamage(7, { struck: true, attack: true, messageId: "ZZGuardianCard" });
      await answer(warrior, "yes");
      await blow;
      assert.equal(health(ally), wasA, "the friend takes none of it");
      assert.equal(health(warrior), wasW - 7, "the warrior takes it in full");
      assert.equal(poolOf(warrior, "rage").value, 0, "6 Rage paid");
      await setPool(warrior, "rage", 6);
      const declined = ally.applyDamage(4, { struck: true, attack: true, messageId: "ZZGuardianCard2" });
      await answer(warrior, "no");
      await declined;
      assert.equal(health(ally), wasA - 4);
      assert.equal(poolOf(warrior, "rage").value, 6, "nothing paid");
    });

    it("SHIELD OF THE RIGHTEOUS and GUARDIAN OF THE WEAK: a spell on a friend 20 feet away is asked, and Ward 1 takes 1 of its Fire", async function () {
      this.timeout(120000);
      const paladin = await characterWith("ZZ Righteous", "Paladin", { level: 11, ranks: { "Guardian of the Weak": 1 } });
      const ally = await makeCharacter({ name: "ZZ Shielded Friend", classes: [["Warrior", 3]] });
      await party(paladin, ally);
      await sceneWith([{ actor: paladin, x: 100, y: 100 }, { actor: ally, x: 500, y: 100 }]);
      const feature = await until(() => featureNamed(paladin, "Shield of the Righteous"), "the level 11 feature");
      await setHealth(paladin, paladin.system.health.max);
      await setPool(paladin, "zeal", feature.system.cost.amount);
      const was = health(paladin);
      const wasA = health(ally);
      const blow = ally.applyDamage(6, { struck: true, attack: false, spell: true, type: "fire", messageId: "ZZRighteousCard" });
      await answer(paladin, "yes");
      await blow;
      assert.equal(health(paladin), was - 5, "the Paladin is the target, Ward 1 against Fire taking 1");
      assert.equal(health(ally), wasA, "the friend takes none of it");
      assert.equal(poolOf(paladin, "zeal").value, 0, "the Zeal paid");
    });

    it("SPIRIT LINK TOTEM: the Use links the standing totem, and a blow on a linked friend is divided evenly among the friends within 20 feet of it", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ Linker", "Shaman", { level: 9, ranks: { "Spirit Link Totem": 1 } });
      const totem = await makeNpc("Bandit");
      const a = await makeCharacter({ name: "ZZ Linked A", classes: [["Warrior", 3]] });
      const b = await makeCharacter({ name: "ZZ Linked B", classes: [["Warrior", 3]] });
      await party(shaman, a, b);
      // A totem of the shaman's, as `documents/bound.mjs#bind` marks one (D-643).
      await totem.setFlag("azeroth-rpg", "bond", { ownerUuid: shaman.uuid, kind: "totem" });
      await sceneWith([
        { actor: shaman, x: 3000, y: 100 }, { actor: totem, x: 500, y: 500 },
        { actor: a, x: 600, y: 500 }, { actor: b, x: 400, y: 500 }
      ]);
      const card = await use(shaman, "Spirit Link Totem");
      assert.ok(card, "the Use posts its card");
      await until(() => shaman.getFlag("azeroth-rpg", SPIRIT_LINK_FLAG)?.totem === totem.uuid, "the link naming the totem");
      assert.equal(shaman.getFlag("azeroth-rpg", SPIRIT_LINK_FLAG)?.token, totem.getActiveTokens(true)[0]?.document?.uuid, "and the token standing now");
      await setHealth(a, a.system.health.max);
      await setHealth(b, b.system.health.max);
      const wasA = health(a);
      const wasB = health(b);
      await a.applyDamage(9, { struck: true, attack: true, messageId: "ZZLinkCard" });
      await until(() => health(b) === wasB - 4, "B's share");
      assert.equal(health(a), wasA - 5, "A keeps its share and the remainder");
    });

    it("SPIRIT LINK TOTEM's Use: refused in words with no totem standing, nothing written", async function () {
      this.timeout(60000);
      const shaman = await characterWith("ZZ Unlinked", "Shaman", { level: 9, ranks: { "Spirit Link Totem": 1 } });
      const card = await use(shaman, "Spirit Link Totem");
      assert.notOk(card, "no card for a refused Use");
      assert.notOk(shaman.getFlag("azeroth-rpg", SPIRIT_LINK_FLAG));
    });

    /* ---- O-162: a second amount of its own type ---------------------------- */

    it("ARCANE POWER: a Fire spell on a creature Immune to Fire lands the Arcane amount alone", async function () {
      this.timeout(90000);
      const mage = await characterWith("ZZ Arcane Mage", "Mage", { level: 9, ranks: { "Arcane Power": 2 }, spells: ["Fireball"], abilities: { int: 16 } });
      await setPool(mage, "mana", poolOf(mage, "mana").max);
      const foe = await makeNpc("Bandit");
      await use(mage, "Arcane Power");
      await until(() => (mage.system.damageBonus?.typed?.spell?.arcane ?? 0) === 2, "the typed lane's 2 Arcane");
      const card = await cast(mage, "Fireball", { targets: [rowOf(foe, { immune: ["fire"] })] });
      const row = card.getFlag("azeroth-rpg", "damageByTarget")?.[0];
      assert.equal(row?.damage, 2, "the Fire is nothing; the Arcane lands");
      assert.equal(row?.mainDamage, 0, "the spell's own Fire");
      assert.equal(row?.parts?.[0]?.type, "arcane");
    });

    it("STORMLASH and STORMSTRIKE: a weapon hit carries their Nature as its own amount, met by a Nature Ward", async function () {
      this.timeout(90000);
      const shaman = await characterWith("ZZ Storm Shaman", "Shaman", { level: 9, ranks: { Stormlash: 2, Stormstrike: 1 }, weapons: ["Longsword"], abilities: { str: 16 } });
      await setPool(shaman, "mana", poolOf(shaman, "mana").max);
      const foe = await makeNpc("Bandit");
      const blade = weaponNamed(shaman, "Longsword");
      const unpin = pinDie(15);
      let card = null;
      try {
        card = await workflows().rollTest({
          actor: shaman, kind: "attack", dc: 5, title: blade.name, weaponId: blade.id, traits: blade.system.traits ?? [],
          damage: { rating: blade.system.rating ?? 1, kind: "physical", weaponRating: blade.system.rating ?? 1 }, strike: { rangeKind: "melee" },
          targets: [rowOf(foe, { wardBySchool: { nature: 1 } })], riders: ["stormstrike"]
        });
      } finally {
        unpin();
      }
      assert.ok(card, "the attack posts its card");
      made.push(card);
      const parts = card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.parts ?? [];
      const nature = parts.find(p => p.type === "nature");
      assert.ok(nature, "the Nature is its own amount");
      assert.equal(nature.amount, 2 + shaman.system.tier, "Stormlash's 2 and Stormstrike's tier, one amount of one type");
      assert.equal(nature.damage, nature.amount - 1, "met by the Nature Ward alone");
    });
  });
}
