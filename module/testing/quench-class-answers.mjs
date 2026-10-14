/**
 * **THE LEAD'S CLASS ANSWERS, LIVE** (D-779; the lead's rulings of 2026-10-03 on
 * O-166 to O-195). One focused test per answer, through the real doors:
 *
 * - O-175, *"It prevents that condition."*: Unyielding refuses Entangled.
 * - O-172, *"Yes"*: Fanaticism's Zeal carries into the next fight.
 * - O-170, *"Yes."*: Improved Moonfire's rank rides Moonfire's tick.
 * - O-173, *"Heals cancel the fall."*: Undying Rage holds the warrior at 1, and a
 *   heal takes the fall away.
 * - O-174, *"Next move"*: Bracing's Armor Points after a turn with no move.
 * - O-180: Main Gauche's free Parry a turn with a melee weapon in each hand, and a
 *   ranged blow offering no Parry to a defender without Anticipation.
 * - O-192, *"Per cast"*: Overchannel Mastery charges the Mana once more, no Health.
 * - O-185: Miracle's promise - the next healing spell succeeds on a 1.
 * - O-183, *"The caster"*: Divine Aegis's schools named at the cast, the Ward laid
 *   when the card's heal restores to full.
 * - O-188, *"1 mana"*: Flametongue held as a Sustain at 1 Mana, refused twice.
 * - O-194, *"It counts against the limit"*: a second Curse past the number refused.
 * - O-177: a companion's maneuver paid from its Ranger's Quarry.
 * - O-186: Devouring Plague's line refused on a target above half Health.
 *
 * Written in D-779 and NOT run there (the brief: *"Quench: write ... register it
 * ... Do not run it."*). Run alone with `QUENCH_BATCH=azeroth-rpg.class-answers`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { reactionStateOf } from "../applications/actions.mjs";
import { BRACING_FLAG, DIVINE_AEGIS, UNDYING_RAGE } from "../rules/class-answers.mjs";

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
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const health = actor => actor.system?.health?.value ?? 0;
const sustained = actor => actor.getFlag("azeroth-rpg", "sustaining") ?? [];
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  speedDropped: false, health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
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

/** A character of one class with these talents taken, waiting for each grant. */
async function characterWith(name, [cls, level], { ranks = {}, spells = [], abilities = null } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], spells, ...(abilities ? { abilities } : {}) });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(actor, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(actor, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return actor;
}

/** A weapon from the pack, put in hand (quench-attacks.mjs's own `arm`). */
async function arm(actor, name, extra = {}) {
  const source = (await fromPack(PACK_FOR.weapon, name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true, ...extra } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} in hand`);
  return actor.items.get(item.id);
}

/** Set a character's pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Fill a character's pool to its maximum. */
async function fill(actor, name) {
  await setPool(actor, name, poolOf(actor, name).max);
  return poolOf(actor, name);
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
async function use(actor, name, { targets = [], face = 18, ...extra } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets, ...extra });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
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

export function classAnswersBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The lead's class answers (D-779)", function () {
    let restore = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      await drainAreaWork();
      await cleanup();
    });

    it("UNYIELDING: Entangled, which sets Speed to 0, is refused at the door every condition goes through", async function () {
      this.timeout(120000);
      const paladin = await characterWith("ZZ CA Unyielding", ["Paladin", 9], { ranks: { Unyielding: 1 } });
      await until(() => (paladin.system.conditionImmunities ?? []).includes("entangled"), "Entangled among the immunities");
      await paladin.toggleStatusEffect("entangled", { active: true });
      await settle();
      assert.isFalse(paladin.statuses.has("entangled"), "Unyielding's holder was Entangled");
    });

    it("FANATICISM: the Zeal kept out of one fight carries into the next, where a paladin without it starts at 0", async function () {
      this.timeout(180000);
      const fanatic = await characterWith("ZZ CA Fanatic", ["Paladin", 9], { ranks: { Fanaticism: 1 } });
      const plain = await characterWith("ZZ CA Plain Paladin", ["Paladin", 9]);
      await setPool(fanatic, "zeal", 4);
      await setPool(plain, "zeal", 4);
      await fightWith([fanatic, plain]);
      // The fight's start resets every Momentum pool: wait for the one it should reset.
      await until(() => poolOf(plain, "zeal").value === 0, "the plain paladin's Zeal reset at the fight's start", 30000);
      await settle();
      assert.equal(poolOf(fanatic, "zeal").value, 4, "the fight's start reset the fanatic's Zeal");
    });

    it("IMPROVED MOONFIRE: Moonfire's tick carries Moonfire's rank and Improved Moonfire's", async function () {
      this.timeout(180000);
      const druid = await characterWith("ZZ CA Moonfire", ["Druid", 5], { ranks: { Moonfire: 1, "Improved Moonfire": 2 }, abilities: { wis: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The target fights and the druid does not: the tick has its clock (D-770).
      await fightWith([ghoul]);
      await fill(druid, "mana");
      const card = await cast(druid, "Moonfire", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Moonfire was refused");
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "damage", type: "arcane", amount: 2 + 1 + 2 }, "the tick is not 2 + Moonfire's 1 + Improved Moonfire's 2");
    });

    it("UNDYING RAGE: a drop to 0 holds the warrior at 1 and spends the Rage, and a heal cancels the fall", async function () {
      this.timeout(180000);
      const warrior = await characterWith("ZZ CA Undying", ["Warrior", 13], { ranks: { "Wounded Beast": 1, "Undying Rage": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([warrior, ghoul]);
      await setPool(warrior, "rage", 6);
      await warrior.applyDamage(health(warrior) + 5, { struck: true, attack: false });
      const held = await until(() => warrior.effects.find(e => e.getFlag("azeroth-rpg", UNDYING_RAGE.flag)), "the held rounds' effect");
      assert.equal(health(warrior), 1, "the warrior was not held at 1");
      assert.equal(poolOf(warrior, "rage").value, 0, "the Rage was not spent");
      assert.equal(held.getFlag("azeroth-rpg", UNDYING_RAGE.flag).rounds, 3, "not one round per 2 Rage");
      await warrior.applyHealing(3, { from: warrior });
      await until(() => !warrior.effects.has(held.id), "the heal cancelling the fall");
      await settle();
      assert.equal(health(warrior), 4, "the cancelled fall took the Health anyway");
    });

    it("BRACING: a turn ended with no move lays the Armor Points", async function () {
      this.timeout(180000);
      const warrior = await characterWith("ZZ CA Bracing", ["Warrior", 5], { ranks: { Bracing: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warrior, ghoul]);
      await giveTurn(combat, warrior);
      const before = warrior.system.ap?.body ?? 0;
      // Core runs the end of a turn only when the turn moves FORWARD (14.367
      // `Combat##triggerTurnEvents`), so the turn is passed on, never set back.
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextTurn();
      await settled;
      await until(() => warrior.effects.find(e => e.getFlag("azeroth-rpg", BRACING_FLAG)), "Bracing's effect", 30000);
      assert.equal(warrior.system.ap.body, before + 2, "the body's Armor Points did not rise by the rank");
    });

    it("MAIN GAUCHE: a melee weapon in each hand frees one Parry a turn, and one weapon frees none", async function () {
      this.timeout(180000);
      const rogue = await characterWith("ZZ CA Main Gauche", ["Rogue", 5], { ranks: { "Main Gauche": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await arm(rogue, "Dagger");
      await fightWith([rogue, ghoul]);
      assert.isFalse(reactionStateOf(rogue).free.parry, "one Dagger freed a Parry");
      await arm(rogue, "Dagger", { offHand: true });
      await until(() => reactionStateOf(rogue).free.parry, "the free Parry with a Dagger in each hand");
    });

    it("PARRY: a ranged blow offers no Parry to a defender without Anticipation, and a melee blow does", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ CA Parrier", ["Rogue", 5]);
      const archer = await characterWith("ZZ CA Archer", ["Ranger", 5]);
      // The row the attack door would build for a defender holding a Dagger
      // (`reactionRows`), handed straight in: what is under test is the filter.
      const rows = [{ index: 0, name: rogue.name, actorUuid: rogue.uuid, block: null, blockOff: 0, parry: "Dagger" }];
      const blow = async rangeKind => {
        const unpin = pinDie(19);
        try {
          const card = await workflows().rollTest({
            actor: archer, kind: "attack", dc: 5, title: "ZZ Blow", traits: [], budget: "none",
            damage: { rating: 3, kind: "physical", weaponRating: 3 }, targets: [rowOf(rogue)], reactions: rows, strike: { rangeKind }
          });
          made.push(card);
          return card;
        } finally {
          unpin();
        }
      };
      assert.notInclude((await blow("ranged")).content, 'data-action="reactParry"', "a ranged blow offered a Parry");
      assert.include((await blow("melee")).content, 'data-action="reactParry"', "a melee blow offered no Parry");
    });

    it("OVERCHANNEL MASTERY: an Overchannel costs the spell's Mana once more and no Health", async function () {
      this.timeout(120000);
      const mage = await characterWith("ZZ CA Mastery", ["Mage", 9], { spells: ["Frostbolt"], abilities: { int: 16 } });
      await until(() => featureNamed(mage, "Overchannel Mastery"), "Overchannel Mastery granted");
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const mana = poolOf(mage, "mana").value;
      const hp = health(mage);
      const spell = spellNamed(mage, "Frostbolt");
      const card = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)], overchannel: 3 });
      assert.ok(card, "the Overchannelled cast was refused");
      assert.equal(health(mage), hp, "Overchannel Mastery's Overchannel cost Health");
      await until(() => poolOf(mage, "mana").value === mana - 2 * spell.system.mana, "the spell's Mana charged twice");
    });

    it("MIRACLE: the Use's promise makes the next healing spell succeed on a 1, and the promise is taken", async function () {
      this.timeout(180000);
      const priest = await characterWith("ZZ CA Miracle", ["Priest", 9], { ranks: { "Hymn of Hope": 1, Miracle: 1 }, spells: ["Flash of Light"], abilities: { wis: 16 } });
      assert.ok(await use(priest, "Miracle"), "Miracle's Use was refused");
      await until(() => (priest.getFlag("azeroth-rpg", "nextSpell") ?? []).some(e => e.miracle), "Miracle's promise laid");
      await fill(priest, "mana");
      const card = await cast(priest, "Flash of Light", { targets: [rowOf(priest)], face: 1 });
      assert.ok(card, "the healing spell was refused");
      assert.isTrue(card.rolls[0].outcome.success, "a 1 failed under Miracle");
      assert.isTrue(card.flags["azeroth-rpg"].miracle, "the card does not mark its heal unreduced");
      await until(() => !(priest.getFlag("azeroth-rpg", "nextSpell") ?? []).some(e => e.miracle), "the promise taken");
    });

    it("DIVINE AEGIS: the school named at the cast becomes Ward 1 when the card's heal restores to full", async function () {
      this.timeout(180000);
      const priest = await characterWith("ZZ CA Aegis", ["Priest", 9], { ranks: { "Divine Aegis": 1 }, spells: ["Flash of Light"], abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ CA Aegis Ally", classes: [["Warrior", 3]] });
      const short = Math.max(1, ally.system.health.max - 1);
      await ally.update({ "system.health.value": short });
      await until(() => health(ally) === short, "the ally one short of full");
      await fill(priest, "mana");
      const spell = await until(() => spellNamed(priest, "Flash of Light"), "Flash of Light known");
      const unpin = pinDie(18);
      let card = null;
      try {
        const casting = workflows().castSpell({ actor: priest, spell, targets: [rowOf(ally)] });
        await pick(await chooser(talentNamed(priest, "Divine Aegis")), ["Fire"]);
        card = await casting;
        if (card) made.push(card);
      } finally {
        unpin();
      }
      assert.ok(card, "the healing spell was refused");
      assert.deepEqual(card.flags["azeroth-rpg"].aegis?.schools, ["fire"], "the school named is not on the card");
      const button = parsed(card).querySelector('[data-action="applyHealing"]');
      assert.ok(button, "the card offers no heal");
      await CARD_ACTIONS.applyHealing(button, card);
      await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", DIVINE_AEGIS.flag)), "Divine Aegis's Ward", 30000);
      assert.isAtLeast(ally.system.ward?.fire ?? 0, 1, "no Ward against Fire");
    });

    it("FLAMETONGUE: the Use holds a Sustain of its own for 1 Mana, and is refused while it stands", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ CA Flametongue", ["Shaman", 5], { ranks: { Flametongue: 1 } });
      await fill(shaman, "mana");
      const mana = poolOf(shaman, "mana").value;
      assert.ok(await use(shaman, "Flametongue"), "Flametongue was refused");
      await until(() => sustained(shaman).some(e => e.identifier === "flametongue"), "Flametongue held");
      assert.deepEqual(sustained(shaman).find(e => e.identifier === "flametongue").upkeep, { mana: 1, health: 0 });
      await until(() => poolOf(shaman, "mana").value === mana - 1, "beginning it costing 1 Mana");
      const said = await warnings(async () => {
        assert.isNull(await use(shaman, "Flametongue"), "a held Flametongue was begun again");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Flametongue.Already", { name: "Flametongue" }));
    });

    it("CURSE: a Curse standing counts, and a second past the number is refused with nothing spent", async function () {
      this.timeout(180000);
      const warlock = await characterWith("ZZ CA Curse", ["Warlock", 9], { abilities: { cha: 16 } });
      const one = await makeNpc("Plagued Ghoul");
      const two = await makeNpc("Plagued Ghoul");
      await one.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Cursed", origin: warlock.uuid,
        flags: { "azeroth-rpg": { laidBane: { kind: "all", banes: 1, source: "Curse", lasting: true } } }
      }]);
      await fill(warlock, "mana");
      const mana = poolOf(warlock, "mana").value;
      const said = await warnings(async () => {
        assert.isNull(await use(warlock, "Curse", { targets: [rowOf(two)] }), "a second Curse past the number was used");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Curse.Standing", { name: "Curse", n: 1, max: 1 }));
      assert.equal(poolOf(warlock, "mana").value, mana, "the refused Curse spent Mana");
    });

    it("SHARED QUARRY: a companion whose own Momentum cannot pay a maneuver pays it from its Ranger's Quarry", async function () {
      this.timeout(180000);
      const ranger = await characterWith("ZZ CA Quarry", ["Ranger", 9], { ranks: { "Shared Quarry": 1 } });
      const wolf = await makeNpc("Wolf");
      await wolf.setFlag("azeroth-rpg", "bond", { kind: "companion", ownerUuid: ranger.uuid });
      await wolf.updatePool({ itemId: null, kind: "momentum", value: 0 });
      await until(() => (wolf.poolSnapshot().find(p => p.kind === "momentum")?.value ?? 0) === 0, "the wolf's own Momentum empty");
      await setPool(ranger, "quarry", 5);
      assert.equal(wolf.momentumPayer({ amount: 2 })?.actor?.id, ranger.id, "the companion's payer is not the Ranger");
      const card = await workflows().useManeuver({ actor: wolf, key: "press", targets: [] });
      assert.ok(card, "the companion's Press was refused");
      made.push(card);
      await until(() => poolOf(ranger, "quarry").value === 3, "Press's 2 off the Ranger's Quarry");
    });

    it("DEVOURING PLAGUE: the line on a target above half Health is refused in words, nothing spent", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ CA Plague", ["Priest", 9], { ranks: { "Shadow Word: Pain": 1, "Vampiric Touch": 1, "Devouring Plague": 1 }, abilities: { wis: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(priest, "mana");
      const mana = poolOf(priest, "mana").value;
      const said = await warnings(async () => {
        assert.isNull(await cast(priest, "Shadow Word: Pain", { targets: [rowOf(ghoul)], talentLines: ["devouring-plague"] }), "the doubling was cast on a creature at full Health");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.DevouringPlague.NotBelow", { name: "Shadow Word: Pain", talent: "Devouring Plague", target: ghoul.name }));
      assert.equal(poolOf(priest, "mana").value, mana, "the refused cast spent Mana");
    });
  });
}
