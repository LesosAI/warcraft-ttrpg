/**
 * **THE SHARED ROOTS OF THE TALENT PLAN'S PHASE 0** (D-768), inside a live
 * world: one focused test per root cause, each driving the real door.
 *
 * - a patch on a class feature stamps the NUMBER at its talent's rank;
 * - a counter *equal to your tier* follows the tier;
 * - a class feature's damage takes its lane;
 * - Toughness holds Health above the base maximum;
 * - Shield of Faith follows a shield created in hand and one deleted;
 * - Feral Spirit's two Spirit Wolves called off the pack once paid (D-776),
 *   and one of each for Storm, Earth and Fire;
 * - `afterBlow` reached from an area's tick, and Righteous Fury on the Paladin;
 * - Unkillable read off the class feature;
 * - a refused cast or feature keeps the Half-Action and the Hide (the lead,
 *   2026-10-03: *Keeps the Half-Action*).
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.talent-roots`. Every document a
 * test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { useFeatureWithDialog } from "../applications/actions.mjs";
import { strikeFromArea } from "../effects/area-strikes.mjs";
import { conceal, isHidden } from "../effects/stealth.mjs";
import { tierForLevel } from "../rules/progression.mjs";

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

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
/** A pool's current value, by name. */
const poolValue = (actor, name) => actor.poolSnapshot().find(p => p.name === name)?.value ?? null;

/** Take a talent at a rank and wait for the write to land. */
async function take(actor, name, rank) {
  const talent = talentNamed(actor, name);
  if (!talent) throw new Error(`${actor.name} holds no talent ${name}`);
  await talent.update({ "system.taken": rank });
  await until(() => actor.items.get(talent.id)?.system?.taken === rank, `${name} at rank ${rank}`);
  return talent;
}

/** Every Power pool to its cap: a use or a cast pays first. */
async function fillPools(actor) {
  for (const pool of (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "power" && p.max > 0 && p.value < p.max)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
}

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
  const scene = await Scene.create({ name: "ZZ Roots Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** The final number on a feature card's damage line. */
const cardDamage = message => new DOMParser().parseFromString(message.content, "text/html")
  .querySelector(".azeroth-damage strong")?.textContent.trim() ?? null;

export function talentRootsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Talent roots: rank, tier, lanes, afterBlow, Unkillable, the Half-Action (D-768)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // FIGHTS FIRST, then the scene, then everything else - the auras batch's
      // order and its reason: a Paladin on a scene owes an aura pass, and a pass
      // still owed when its scene goes reaches the server after it has gone
      // (the full-suite fix of D-757).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    // ---- 1. a patch stamps the number at its own talent's rank ----------

    it("RANK: Explosive Trap at rank 2 stamps Snare at 6 Fire, and Snare's card deals 6", async function () {
      this.timeout(90000);
      const ranger = await makeCharacter({ name: "ZZ Roots Trapper", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Snare") && talentNamed(ranger, "Explosive Trap"), "Snare and the talent");
      await take(ranger, "Explosive Trap", 2);
      // The number, never the word: `"3*rank"` read rank 1 at Use (D-768).
      await until(() => featureNamed(ranger, "Snare")?.system?.damage?.amount === "6", "Snare stamped at 6 Fire");
      assert.equal(featureNamed(ranger, "Snare").system.damage.type, "fire");
      const card = await game.system.azeroth.workflows.useFeature({ actor: ranger, item: featureNamed(ranger, "Snare") });
      made.push(card);
      assert.ok(card, "Snare posted no card");
      assert.equal(cardDamage(card), "6", "Explosive Trap at rank 2 did not deal 6");
    });

    // ---- 2. a counter equal to your tier follows the tier ---------------

    it("TIER: Survival Instincts counts the Druid's tier, and the count moves with the level", async function () {
      this.timeout(90000);
      const druid = await makeCharacter({ name: "ZZ Roots Druid", classes: [["Druid", 5]] });
      await until(() => talentNamed(druid, "Survival Instincts"), "the Druid's talents");
      await take(druid, "Survival Instincts", 1);
      await until(() => featureNamed(druid, "Survival Instincts"), "the granted counter");
      assert.equal(featureNamed(druid, "Survival Instincts").system.uses.max, tierForLevel(5), "the counter read tier 1 at level 5");
      await druid.setLevel(11);
      await until(() => featureNamed(druid, "Survival Instincts")?.system?.uses?.max === tierForLevel(11),
        "the counter to follow the tier to level 11");
    });

    // ---- 3. a class feature's damage takes its lane ----------------------

    it("LANE: Pyroblast, a Casting Test, takes what stands on the spell lane", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ Roots Mage", classes: [["Mage", 5]] });
      await until(() => talentNamed(mage, "Pyroblast"), "the Mage's talents");
      await take(mage, "Pyroblast", 2);
      await until(() => featureNamed(mage, "Pyroblast"), "Pyroblast");
      // What Seal of Command and Arcane Power lay: a `final` change on the lane.
      await mage.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Fire lane",
        system: { changes: [{ key: "system.damageBonus.spell.fire", type: "add", value: "2", phase: "final" }] }
      }]);
      await until(() => mage.system.damageBonus?.spell?.fire === 2, "the Fire lane at 2");
      await fillPools(mage);
      const unpin = pinDie(15);
      let card;
      try {
        card = await useFeatureWithDialog(mage, featureNamed(mage, "Pyroblast"));
      } finally {
        unpin();
      }
      assert.ok(card, "Pyroblast posted no card");
      made.push(card);
      // 2 × tier (2) + rank (2) is 6, and the lane adds 2.
      assert.equal(cardDamage(card), "8", "the spell lane never reached a casting feature");
      assert.include(card.content, game.i18n.localize("AZEROTH.Card.TalentDamage"), "the card does not say what the lane added");
    });

    // ---- 4. Toughness holds Health above the base maximum ---------------

    it("TOUGHNESS: Health holds above the base maximum, through a heal and a later preparation", async function () {
      this.timeout(90000);
      const warrior = await makeCharacter({ name: "ZZ Roots Tough", classes: [["Warrior", 5]] });
      await until(() => talentNamed(warrior, "Toughness"), "the Warrior's talents");
      const base = warrior.system.health.max;
      await take(warrior, "Toughness", 2);
      await until(() => warrior.system.health.max === base + 4, "Toughness's 4 on the maximum");
      await warrior.applyHealing(999);
      await until(() => warrior.system.health.value === base + 4, "a heal to the raised maximum");
      // The clamp used to cut it back at the very next preparation.
      await warrior.update({ "system.motive": "ZZ a later write" });
      await until(() => warrior.system.motive === "ZZ a later write", "the later write");
      assert.equal(warrior.system.health.value, base + 4, "Health was clamped back to the base maximum");
      assert.isAbove(warrior.system.health.value, base);
    });

    // ---- 5. Shield of Faith on a shield created in hand and deleted ------

    it("SHIELD OF FAITH: a shield created in hand lays the Defense, and deleting it takes the Defense away", async function () {
      this.timeout(90000);
      const paladin = await makeCharacter({ name: "ZZ Roots Faith", classes: [["Paladin", 1]] });
      await until(() => talentNamed(paladin, "Shield of Faith"), "the Paladin's talents");
      await take(paladin, "Shield of Faith", 1);
      const laid = () => paladin.effects.find(e => e.getFlag("azeroth-rpg", "talentEffect") === "shield-of-faith") ?? null;
      assert.isNull(laid(), "Shield of Faith stood with no shield in hand");
      const source = (await fromPack(PACK_FOR.armor, "Buckler")).toObject();
      const [shield] = await paladin.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
      assert.ok(shield, "the Buckler was not made");
      await until(() => laid(), "Shield of Faith laid by a shield created in hand");
      await shield.delete();
      await until(() => !laid(), "Shield of Faith lifted with the shield deleted while held");
    });

    // ---- 6. a summon judged before anything is paid ----------------------

    // D-776: 14 §13 prints the Spirit Wolf (the lead: *Add Spirit Wolf to 14*,
    // and *"Beast"*), so the call D-768 refused before anything was paid now
    // pays and binds. The refusal itself is `rules/bound.mjs#summonRefusal`'s,
    // held for a name the pack lacks in `bound.test.mjs`.
    it("SUMMONS: Feral Spirit pays and calls two Spirit Wolves off the pack, and Storm, Earth and Fire calls one of each", async function () {
      this.timeout(120000);
      const shaman = await makeCharacter({ name: "ZZ Roots Shaman", classes: [["Shaman", 5]] });
      await until(() => talentNamed(shaman, "Feral Spirit") && talentNamed(shaman, "Storm, Earth and Fire"), "the Shaman's talents");
      await take(shaman, "Feral Spirit", 1);
      await take(shaman, "Storm, Earth and Fire", 1);
      await until(() => featureNamed(shaman, "Feral Spirit") && featureNamed(shaman, "Storm, Earth and Fire"), "the two granted features");
      const storm = featureNamed(shaman, "Storm, Earth and Fire").system.summons;
      assert.deepEqual([...storm.entries], ["Storm Elemental", "Earth Elemental", "Fire Elemental"]);
      assert.equal(storm.count, 1, "Storm, Earth and Fire calls more than one of each");
      const feral = featureNamed(shaman, "Feral Spirit").system.summons;
      assert.deepEqual([...feral.entries], ["Spirit Wolf"], "Feral Spirit calls something other than the Spirit Wolf");
      assert.equal(feral.count, 2, "Feral Spirit does not call two");
      const combat = await fightWith([shaman]);
      await fillPools(shaman);
      await until(() => poolValue(shaman, "mana") !== null, "the Shaman's Mana pool");
      const mana = poolValue(shaman, "mana");
      assert.isAtLeast(mana, 6, "the Shaman's Mana cannot pay Feral Spirit's 6");
      const mine = combat.getCombatantsByActor(shaman)[0];
      const budget = JSON.stringify(mine.getFlag("azeroth-rpg", "budget"));
      const { boundOf, bondOf } = game.system.azeroth.bound;
      assert.lengthOf(boundOf(shaman, "summon"), 0, "the Shaman held a summon before the call");
      let card = null;
      const said = await warnings(async () => {
        card = await game.system.azeroth.workflows.useFeature({ actor: shaman, item: featureNamed(shaman, "Feral Spirit") });
      });
      assert.ok(card, `Feral Spirit was refused with the Spirit Wolf in the pack: ${said.join(" | ")}`);
      const called = await until(() => boundOf(shaman, "summon")[0] ?? null, "the Spirit Wolves bound to the Shaman");
      // Cleaned up with the batch if the fight's end has not taken it already.
      made.push(called);
      const bond = bondOf(called);
      assert.equal(bond.entryName, "Spirit Wolf", "the call bound something other than the Spirit Wolf");
      assert.match(bond.entryUuid ?? "", /^Compendium\.azeroth-rpg\.bestiary\./, "the Spirit Wolf was not made from the bestiary pack");
      assert.equal(bond.count, 2, "one bond does not stand for the two wolves called");
      assert.equal(bond.until, "encounter", "the wolves do not end with the encounter");
      assert.equal(bond.sourceName, "Feral Spirit");
      assert.isFalse(called.prototypeToken.actorLink, "two wolves share one linked Health");
      assert.equal(called.system.creatureType, "beast", "the Spirit Wolf is not a Beast (the lead: *\"Beast\"*)");
      assert.equal(called.system.tier, 2);
      assert.isNumber(called.system.handlingDC, "a Beast carries a Handling DC (D-174)");
      assert.lengthOf(boundOf(shaman, "summon"), 1, "the call bound more than one set");
      await until(() => poolValue(shaman, "mana") === mana - 6, "Feral Spirit's 6 Mana paid");
      assert.notEqual(JSON.stringify(mine.getFlag("azeroth-rpg", "budget")), budget, "the call spent nothing from the turn");
      await combat.delete();
    });

    // ---- 7. afterBlow from an area's tick, Righteous Fury on the Paladin --

    it("AFTERBLOW: an area's strike marks its caster's damaged target, and Righteous Fury pays the Paladin struck", async function () {
      this.timeout(180000);
      const paladin = await makeCharacter({ name: "ZZ Roots Fury", classes: [["Paladin", 5]] });
      await until(() => talentNamed(paladin, "Righteous Fury"), "the Paladin's talents");
      await take(paladin, "Righteous Fury", 2);
      const ghoul = await makeNpc("Plagued Ghoul");
      await ghoul.update({ "system.health.max": 99, "system.health.value": 99, "system.immune": [], "system.vulnerable": [] });
      await sceneWith([{ actor: paladin, x: 500, y: 500, side: "friendly" }, { actor: ghoul, x: 1500, y: 500, side: "hostile" }]);
      const combat = await fightWith([paladin, ghoul]);
      const mine = combat.getCombatantsByActor(paladin)[0];
      // The area's door, as `_areaTicks` drives it: the damage door marks the caster.
      const health = ghoul.system.health.value;
      await strikeFromArea({ actor: ghoul, caster: paladin, spell: { name: "Consecration", school: "holy" }, damage: { rating: 3, school: "holy" } });
      await until(() => ghoul.system.health.value < health, "the area's damage landing");
      const key = ghoul.getActiveTokens(true)[0]?.id ?? ghoul.id;
      await until(() => mine.getFlag("azeroth-rpg", "damaged")?.[key] === true, "the caster's damaged mark from an area's tick");
      // *Whenever a friendly target within 20 feet takes damage* - the Paladin is one.
      const zeal = poolValue(paladin, "zeal") ?? 0;
      await paladin.applyDamage(3, { struck: true, attack: false, type: "physical" });
      await until(() => poolValue(paladin, "zeal") === Math.min(10, zeal + 2), "Righteous Fury's 2 Zeal for the Paladin's own wound");
      await combat.delete();
    });

    // ---- 8. Unkillable reads the class feature ---------------------------

    it("UNKILLABLE: a level-20 Warrior with Rage is held at 1 Health and the Rage goes", async function () {
      this.timeout(120000);
      const warrior = await makeCharacter({ name: "ZZ Roots Unkillable", classes: [["Warrior", 20]] });
      await until(() => featureNamed(warrior, "Unkillable"), "the level-20 feature");
      const combat = await fightWith([warrior]);
      const rage = warrior.poolSnapshot().find(p => p.name === "rage");
      assert.ok(rage, "the Warrior holds no Rage pool");
      // Filled AFTER the start: 02 §7 begins every fight at 0 (D-627).
      await warrior.updatePool({ itemId: rage.itemId, kind: "momentum", value: 3 });
      await warrior.update({ "system.health.value": 5 });
      await until(() => poolValue(warrior, "rage") === 3 && warrior.system.health.value === 5, "Rage 3 and Health 5");
      await warrior.applyDamage(20, { struck: true, attack: false, type: "physical" });
      await until(() => warrior.system.health.value === 1, "the blow held at 1 Health");
      // All Rage lost to the save, then 05 §11's 1 for a blow that reached Health.
      await until(() => poolValue(warrior, "rage") === 1, "the Rage emptied by the save");
      await combat.delete();
    });

    // ---- 10. a refused cast or feature keeps the Half-Action ---------------

    it("KEEPS THE HALF-ACTION: a cast refused for Mana leaves the budget and the Hide, and a feature refused for Rage the budget", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ Roots Short", classes: [["Mage", 3]], spells: ["Frostbolt"] });
      const spell = mage.items.find(i => i.type === "spell" && i.name === "Frostbolt");
      assert.ok(spell, "no Frostbolt to cast");
      const combat = await fightWith([mage]);
      const mine = combat.getCombatantsByActor(mage)[0];
      const mana = mage.poolSnapshot().find(p => p.name === "mana");
      await mage.updatePool({ itemId: mana.itemId, kind: "power", value: 0 });
      await until(() => poolValue(mage, "mana") === 0, "an empty Mana pool");
      await conceal(mage);
      await until(() => isHidden(mage), "the Mage hidden");
      const budget = JSON.stringify(mine.getFlag("azeroth-rpg", "budget"));
      let card = null;
      const said = await warnings(async () => {
        card = await game.system.azeroth.workflows.castSpell({ actor: mage, spell, targets: [] });
      });
      assert.isNull(card, "a cast with no Mana was made");
      assert.isAbove(said.length, 0, "the refusal said nothing");
      await settle();
      assert.equal(JSON.stringify(mine.getFlag("azeroth-rpg", "budget")), budget, "the refused cast spent the Half-Action (the lead: *Keeps the Half-Action*)");
      assert.isTrue(isHidden(mage), "the refused cast ended the Hide");
      await combat.delete();

      // A feature refused for its pool keeps it too: Second Wind with no Rage.
      const warrior = await makeCharacter({ name: "ZZ Roots No Rage", classes: [["Warrior", 1]] });
      await until(() => featureNamed(warrior, "Second Wind"), "Second Wind");
      const fight = await fightWith([warrior]);
      const theirs = fight.getCombatantsByActor(warrior)[0];
      await until(() => poolValue(warrior, "rage") === 0, "an empty Rage pool at the start");
      const held = JSON.stringify(theirs.getFlag("azeroth-rpg", "budget"));
      let used = null;
      // Read rather than queued: core prints a queued notice batches later (fixtures.mjs#warnings).
      const refusal = await warnings(async () => {
        used = await game.system.azeroth.workflows.useFeature({ actor: warrior, item: featureNamed(warrior, "Second Wind") });
      });
      assert.isNull(used, "Second Wind was used with no Rage");
      assert.isAbove(refusal.length, 0, "the refusal said nothing");
      await settle();
      assert.equal(JSON.stringify(theirs.getFlag("azeroth-rpg", "budget")), held, "the refused feature spent the Half-Action");
      await fight.delete();
    });
  });
}
