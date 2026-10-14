/**
 * The damage pipeline, inside a live world (D-711 phase 2).
 *
 * **These are use tests, and they exist because a unit test cannot see a
 * missing caller** (D-681). `rules/damage-spec.mjs`, `rules/mitigation.mjs`
 * and `rules/talent-effects.mjs` cover the law in Node, and every one of them
 * passed on the day Sulfuras dealt physical damage, the card printed a
 * Pierce-reduced number with no word for why, and twenty talents in 04 said
 * *adds 1 damage per rank* with nothing reading them.
 *
 * What a Vitest cannot reach: `attackWithDialog` resolving the traits pack,
 * `resolveDamage` running against a REAL target's Ward, the card's own
 * rendered HTML, and a Combo Point pool actually emptying. Every one of those
 * is a document method over a prepared actor.
 *
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, fromPack, made, makeCharacter, makeNpc, pinDie, settle, untilHook, PACK_FOR } from "./fixtures.mjs";
import { attackWithDialog, npcAttackWithDialog } from "../applications/actions.mjs";
// The card's own Apply, pressed rather than imitated: the `damaged` mark is
// written on that path and nothing else (D-681).
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** What a pool holds now, by name. */
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name)?.value ?? null;

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

/** A scene at five feet a square, with the actors placed on it. */
async function sceneWith(placements) {
  const scene = await Scene.create({
    name: "ZZ Damage Scene", width: 4000, height: 2000,
    grid: { size: 100, distance: 5, units: "ft" }
  });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "hostile" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    // Every token core makes is HOSTILE by default (14.367's schema), so a
    // test that means "an enemy" says which side it is on.
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

/** Target a token the way a player does (v14 moved this onto the layer). */
function target(actor) {
  const token = actor?.getActiveTokens?.(true)[0] ?? null;
  canvas.tokens.setTargets(token ? [token.id] : []);
  return token;
}

/** A weapon out of 08 §7 or §20, in the actor's hands. */
async function arm(actor, name) {
  const doc = await fromPack(PACK_FOR.weapon, name);
  if (!doc) throw new Error(`the weapons pack holds no "${name}"`);
  const source = doc.toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} to be in hand`);
  return actor.items.get(item.id);
}

/** The rendered HTML of a card, as `renderChatMessageHTML` hands it over. */
function renderedText(message) {
  const box = document.createElement("div");
  box.innerHTML = message.content;
  return box.textContent.replace(/\s+/g, " ");
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
    "every combatant's own budget landing");
  return combat;
}

export function damagePipelineBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Damage: school, Pierce, and what a talent adds (D-711 phase 2)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    /* ---- 08 §7: a Greater School enchantment converts the damage ---------- */

    it("makes a GREATER School enchantment deal its school and take the Ward lane", async function () {
      this.timeout(180000);
      // *A weapon with a Greater School enchantment deals damage of that school
      // instead of Physical. Subtract the target's Ward instead of its Armor
      // Points.* 08 §7 says it once and nothing on the character path read it:
      // Sulfuras was a mace.
      const actor = await makeCharacter({ name: "ZZ Firelord", classes: [["Warrior", 5]], abilities: { str: 16 } });
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.ap.body": 3, "system.ward": { fire: 1 } });
      await until(() => (npc.system.ward?.fire ?? 0) === 1, "the ghoul's Fire Ward landing");
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      target(npc);

      const hammer = await arm(actor, "Sulfuras, Hand of Ragnaros");
      assert.include(hammer.system.traits, "Flaming (Greater)", "the pack's Sulfuras carries no Greater Flaming");
      const unpin = pinDie(18);
      let card;
      try {
        card = await attackWithDialog(actor, hammer);
      } finally {
        unpin();
      }
      assert.ok(card, "the blow was refused");
      const flags = card.flags["azeroth-rpg"];
      assert.equal(flags.damageType, "fire", "the card records the damage as physical");
      const row = flags.damageByTarget[0];
      assert.ok(row, "the card carries no damage row for the target");
      assert.equal(row.ward, 1, "the Ward lane was not taken");
      assert.isNull(row.armor, "the blow was mitigated by Armor Points");
      assert.equal(row.mitigation, 1, "the Ward took something other than 1 off");
      const text = renderedText(card);
      assert.include(text, "Fire", "the card never says what kind of damage it was");
      assert.include(text, "vs Ward 1", "the card never names the Ward");
    });

    it("leaves a LESSER enchantment physical, and 08 §7 is why", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Lesser Flame", classes: [["Warrior", 5]], abilities: { str: 16 } });
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.ap.body": 3, "system.ward": { fire: 5 } });
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      target(npc);
      // A Classic find at Lesser grade: the chapter grades the enchantment and
      // only the Greater one converts.
      const blade = await arm(actor, "Fiery Retributer");
      assert.isTrue((blade.system.traits ?? []).some(t => /\(Lesser\)$/.test(t)), "this weapon is not a Lesser one");
      const unpin = pinDie(18);
      let card;
      try {
        card = await attackWithDialog(actor, blade);
      } finally {
        unpin();
      }
      assert.equal(card.flags["azeroth-rpg"].damageType, "physical", "a Lesser enchantment converted the damage");
      assert.equal(card.flags["azeroth-rpg"].damageByTarget[0].ward, null, "a Lesser enchantment took the Ward lane");
    });

    /* ---- 08 §5: Pierce, and the word for it on the card ------------------- */

    it("PIERCES three Armor Points with two, and says so on the card", async function () {
      this.timeout(180000);
      // Pierce has been wired since D-641 and the card printed the already
      // reduced number with no word for why (the lead's item 28).
      const actor = await makeCharacter({ name: "ZZ Pick", classes: [["Warrior", 5]], abilities: { str: 16 } });
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.ap.body": 3 });
      await until(() => (npc.system.ap?.body ?? 0) === 3, "the ghoul's Armor Points landing");
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      target(npc);
      const pick = await arm(actor, "War pick");
      assert.include(pick.system.traits, "Pierce 2", "the pack's War pick carries no Pierce 2");
      const unpin = pinDie(18);
      let card;
      try {
        card = await attackWithDialog(actor, pick);
      } finally {
        unpin();
      }
      const row = card.flags["azeroth-rpg"].damageByTarget[0];
      assert.equal(row.penetration, 2, "the Pierce never reached the mitigation");
      assert.equal(row.armor, 3, "the target's Armor Points are not on the row");
      assert.equal(row.mitigation, 1, "3 armour less 2 Pierce is 1");
      const text = renderedText(card);
      assert.include(text, "vs AP 3", "the card never names the Armor Points");
      assert.include(text, "Pierce 2", "the card never says the Pierce took two off");
    });

    it("fires a bolt with the higher Pierce of the launcher and the shot (08 §7)", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Arbalest", classes: [["Ranger", 5]], abilities: { dex: 16 } });
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.ap.body": 3 });
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      target(npc);
      const bow = await arm(actor, "Arbalest");
      const bolts = await arm(actor, "Heavy bolts");
      assert.isAbove(bolts.system.quantity ?? 0, 0, "the bundle is empty");
      assert.include(bow.system.traits, "Pierce 2", "the Arbalest carries no Pierce 2");
      const unpin = pinDie(18);
      let card;
      try {
        card = await attackWithDialog(actor, bow);
      } finally {
        unpin();
      }
      assert.ok(card, "the shot was refused");
      assert.equal(card.flags["azeroth-rpg"].damageByTarget[0].penetration, 2,
        "the launcher's Pierce did not reach the shot");
    });

    it("gives a creature's own attack row its Pierce too (14, D-647)", async function () {
      this.timeout(120000);
      const npc = await makeNpc("Plagued Ghoul");
      const rows = npc.system.attacks ?? [];
      assert.isAbove(rows.length, 0, "the ghoul has no attack row");
      // The creature path has read a trait's Pierce since D-647 and now shares
      // `rules/damage-spec.mjs` with the character's door.
      await npc.update({ "system.attacks": rows.map((a, i) => (i === 0 ? { ...a, traits: [...(a.traits ?? []), "Pierce 2"] } : a)) });
      await until(() => (npc.system.attacks[0].traits ?? []).includes("Pierce 2"), "the row's Pierce landing");
      const unpin = pinDie(18);
      let card;
      try {
        card = await npcAttackWithDialog(npc, 0);
      } finally {
        unpin();
      }
      assert.ok(card, "the creature's blow was refused");
      assert.equal(card.flags["azeroth-rpg"].damage.penetration, 2, "a creature's row lost its Pierce");
    });

    /* ---- 04: what a talent adds to the damage ---------------------------- */

    it("ELEMENTAL FURY waits for the target to have been damaged, then adds per rank", async function () {
      this.timeout(240000);
      // *Fire and Nature damage you deal increases by 1 per rank against a
      // target that has taken damage from you.* The mark is the attacker's own
      // combatant flag, written where the blow is applied.
      const actor = await makeCharacter({ name: "ZZ Stormcaller", classes: [["Shaman", 5]], abilities: { str: 16 } });
      const fury = actor.items.find(i => i.type === "talent" && i.system?.identifier === "elemental-fury");
      assert.ok(fury, "the Shaman's talents did not arrive");
      await fury.update({ "system.taken": 2 });
      await until(() => actor.items.get(fury.id).system.taken === 2, "Elemental Fury at rank 2");

      const npc = await makeNpc("Plagued Ghoul");
      // Health enough to take the first blow and still be standing, so the two
      // swings differ in the talent and in nothing else.
      await npc.update({ "system.ap.body": 0, "system.ward": {}, "system.health.max": 99, "system.health.value": 99 });
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      target(npc);
      const combat = await fightWith([actor, npc]);
      const hammer = await arm(actor, "Sulfuras, Hand of Ragnaros");

      const swing = async () => {
        const unpin = pinDie(18);
        try { return await attackWithDialog(actor, hammer); } finally { unpin(); }
      };
      const first = await swing();
      assert.ok(first, "the first blow was refused");
      const before = first.flags["azeroth-rpg"].damageByTarget[0].damage;

      // **THE APPLY BUTTON IS WHAT WRITES THE MARK, SO THE TEST PRESSES IT.**
      // A hand-seeded flag showed only that the dialog READS one; the write
      // path - `applyDamageToTargets` → `afterBlow` → `markDamaged` - was
      // exercised by nothing, which is D-681's shape exactly.
      const mine = combat.getCombatantsByActor(actor)[0];
      const key = npc.getActiveTokens(true)[0]?.id ?? npc.id;
      const health = npc.system.health.value;
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0" } }, first);
      await until(() => npc.system.health.value < health, "the first blow landing on the ghoul");
      await until(() => mine.getFlag("azeroth-rpg", "damaged")?.[key] === true,
        "the Apply press writing the attacker's damaged mark");

      const second = await swing();
      const after = second.flags["azeroth-rpg"].damageByTarget[0].damage;
      assert.equal(after - before, 2, "Elemental Fury's two points never reached the second blow");
      assert.include(renderedText(second), fury.name, "the card does not say which talent added it");
    });

    it("DEADLY POISE comes ticked with exactly one enemy in reach", async function () {
      this.timeout(240000);
      const actor = await makeCharacter({ name: "ZZ Duellist", classes: [["Rogue", 5]], abilities: { str: 14, dex: 16 } });
      const poise = actor.items.find(i => i.type === "talent" && i.system?.identifier === "deadly-poise");
      assert.ok(poise, "the Rogue's talents did not arrive");
      await poise.update({ "system.taken": 2 });
      await until(() => actor.items.get(poise.id).system.taken === 2, "Deadly Poise at rank 2");

      const one = await makeNpc("Plagued Ghoul");
      const two = await makeNpc("Plagued Ghoul");
      await one.update({ "system.ap.body": 0 });
      await two.update({ "system.ap.body": 0 });
      await sceneWith([
        { actor, x: 500, y: 500, side: "friendly" },
        { actor: one, x: 600, y: 500 },
        { actor: two, x: 2000, y: 500 }
      ]);
      target(one);
      const dagger = await arm(actor, "Dagger");

      const swing = async () => {
        const unpin = pinDie(18);
        try { return await attackWithDialog(actor, dagger); } finally { unpin(); }
      };
      const alone = await swing();
      const withOne = alone.flags["azeroth-rpg"].damageByTarget[0].damage;
      assert.include(renderedText(alone), poise.name, "the auto-checked line never reached the card");

      // A second enemy inside reach and the clause stops holding. ORTHOGONALLY
      // adjacent, so no grid's diagonal rule can make five feet into seven.
      const other = two.getActiveTokens(true)[0].document;
      await other.update({ x: 500, y: 600 });
      for (let i = 0; i < 200 && other.y !== 600; i++) await new Promise(r => setTimeout(r, 50));
      await settle();
      const crowd = await swing();
      const withTwo = crowd.flags["azeroth-rpg"].damageByTarget[0].damage;
      assert.equal(withOne - withTwo, 2, "Deadly Poise held with two enemies in reach");
    });

    it("SEAL OF COMMAND's use lays +1 Holy a rank for the encounter, and the fight's end lifts it", async function () {
      this.timeout(240000);
      const actor = await makeCharacter({ name: "ZZ Sealbearer", classes: [["Paladin", 9]], abilities: { str: 16 } });
      const seal = actor.items.find(i => i.type === "talent" && i.system?.identifier === "seal-of-command");
      assert.ok(seal, "the Paladin's talents did not arrive");
      await seal.update({ "system.taken": 2 });
      await until(() => actor.items.find(i => i.type === "feature" && i.name === seal.name), "the granted feature");
      const feature = actor.items.find(i => i.type === "feature" && i.name === seal.name);

      const combat = await fightWith([actor]);
      // **THE ZEAL IS FILLED AFTER THE FIGHT STARTS**: 02 §7 begins every
      // encounter with Momentum at 0, so a pool filled before `startCombat`
      // is zeroed by `_fightStart` and the use is refused for the pool.
      const zeal = actor.system.momenta.find(p => p.name === "zeal");
      assert.ok(zeal, "the Paladin holds no Zeal pool");
      await actor.updatePool({ itemId: zeal.itemId, kind: "momentum", value: zeal.max });
      await until(() => actor.system.momenta.find(p => p.name === "zeal").value >= 5, "Zeal in the pool");
      assert.equal(actor.system.damageBonus.spell.holy, 0, "the lane did not start at zero");
      await game.system.azeroth.workflows.useFeature({ actor, item: feature });
      await until(() => actor.system.damageBonus.spell.holy === 2, "Seal of Command's two points on the Holy lane");
      assert.equal(actor.system.damageBonus.attack.holy, 2, "the attack lane took nothing");

      // **`endCombat()` OPENS A CONFIRM DIALOG** in v14 and nothing presses it,
      // so the test hung until its own four-minute timeout. Deleting the fight
      // is the other door and it fires `_onExit` for every combatant, which is
      // where `_leaveFight` lifts the buff.
      await combat.delete();
      await until(() => actor.system.damageBonus.spell.holy === 0, "the encounter's buff lapsing with the fight");
    });

    /* ---- 02 §7: Finisher ------------------------------------------------- */

    it("FINISHER spends every Combo Point before the die and adds them to the damage", async function () {
      this.timeout(240000);
      // *Spend all your Combo Points and add that many to the damage of one
      // attack.* As a Use button it emptied the pool onto a card of its own
      // and the attack never saw the points (the lead's item 11).
      const actor = await makeCharacter({ name: "ZZ Finisher", classes: [["Rogue", 5]], abilities: { str: 14, dex: 16 } });
      const combo = actor.system.momenta.find(p => p.name === "comboPoints");
      assert.ok(combo, "the Rogue holds no Combo Points");
      assert.equal(combo.max, 5, "05 §11 caps Combo Points at five");
      await actor.updatePool({ itemId: combo.itemId, kind: "momentum", value: 3 });
      await until(() => poolOf(actor, "comboPoints") === 3, "three Combo Points");
      assert.ok(actor.items.some(i => i.type === "feature" && i.name === "Finisher"), "the Rogue holds no Finisher");

      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.ap.body": 0 });
      await sceneWith([{ actor, x: 500, y: 500, side: "friendly" }, { actor: npc, x: 600, y: 500 }]);
      target(npc);
      const dagger = await arm(actor, "Dagger");

      // **THE DIALOG OFFERS IT**, and not on the three blows 02 excludes.
      const spec = { kind: "attack", title: "Quench Finisher", damage: { rating: dagger.system.rating, kind: "physical" } };
      assert.deepEqual(prepareRoll(actor, spec).finisher, { value: 3, max: 5 },
        "the roll dialog offers no Finisher to a Rogue holding Combo Points");
      assert.isNull(prepareRoll(actor, { ...spec, offHand: true }).finisher, "an off-hand blow was offered a Finisher");
      assert.isNull(prepareRoll(actor, { ...spec, parry: true }).finisher, "a Parry was offered a Finisher");
      assert.isNull(prepareRoll(actor, { ...spec, budget: "none" }).finisher,
        "a blow somebody else paid for - a Reaction, or Extra Attack's second roll - was offered a Finisher");

      // **AND SPENDING IT MOVES THE DAMAGE.** Two rolls that differ in nothing
      // but the Finisher, so the Success Level and the Rating are identical
      // and the three points are the whole of the difference.
      // **NOT `target`**: this file's own `target(actor)` helper is a module
      // binding, and a `const target` anywhere in this block shadows it for the
      // WHOLE block - so the `target(npc)` call above threw a TDZ error from a
      // line that reads perfectly (*Cannot access 'target' before
      // initialization*). Named for what it is instead.
      const row = { tokenId: npc.getActiveTokens(true)[0].id, sceneId: canvas.scene.id, actorId: npc.id,
        name: npc.name, defense: npc.system.defense, apByLocation: { body: 0, head: 0, limb: 0 },
        absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], conditions: {},
        size: null, swarm: false, creatureType: null, acted: null };
      const roll = async finisherSpent => {
        const unpin = pinDie(18);
        try {
          return await game.system.azeroth.workflows.rollTest({
            actor, kind: "attack", dc: 10, title: "Quench Finisher", budget: "none",
            finisherSpent, damage: { rating: dagger.system.rating, kind: "physical" }, targets: [row]
          });
        } finally {
          unpin();
        }
      };
      const plain = await roll(0);
      assert.equal(poolOf(actor, "comboPoints"), 3, "a roll spending nothing took a Combo Point");
      const spent = await roll(3);
      await until(() => poolOf(actor, "comboPoints") === 0, "the Combo Points being spent");
      const base = plain.flags["azeroth-rpg"].damageByTarget[0].damage;
      const more = spent.flags["azeroth-rpg"].damageByTarget[0].damage;
      assert.equal(more - base, 3, "three Combo Points added nothing to the damage");
      assert.include(renderedText(spent), game.i18n.localize("AZEROTH.Card.FinisherSpent"),
        "the card never says the points were spent");
    });
  });
}
