/**
 * 06 §6's Reactions, inside a live world (D-693).
 *
 * **These are use tests, and they exist because a unit test cannot see a
 * missing caller.** `rules/reactions.mjs` and `rules/banes.mjs` cover the law
 * in Node, and both passed the day Parry and Block existed nowhere in
 * `module/`. What neither can reach is the turn budget spending a real
 * Reaction, an Active Effect laid on another actor's sheet reaching that
 * actor's prepared data, and the roll dialog counting it — every one of those
 * is a document method over a prepared actor and none of them loads under
 * Vitest (D-681).
 *
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, dialogFor, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, useAction } from "./fixtures.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
// The GM-side door a player's Parry or Block asks through (D-720): what it
// refuses is the half no unit test can reach.
import { annotateQueryHandler } from "../dice/annotate.mjs";
import { reactionRows, takeOpportunity } from "../applications/actions.mjs";
import { clearReady, disengage, readyWith } from "../applications/combat-actions.mjs";
import { defaultChoice } from "../applications/roll-dialog.mjs";
import { MOVEMENT_LIMIT_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { BLOCK_REDUCTION, PUMMEL_BANES } from "../rules/reactions.mjs";

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

/**
 * Notifications of one kind raised while `fn` runs, with the original put
 * back. **A refusal that says nothing is the fault this exists to catch.**
 */
async function noticesFrom(kind, fn) {
  const raised = [];
  const original = ui.notifications[kind];
  ui.notifications[kind] = function (...args) { raised.push(args[0]); return original.apply(this, args); };
  try { await fn(raised); } finally { ui.notifications[kind] = original; }
  return raised;
}

/** A target snapshot for a world actor, in the shape the roll dialog builds. */
function snapshotOf(actor) {
  const s = actor.system ?? {};
  return {
    tokenId: null, sceneId: null, actorId: actor.id, name: actor.name,
    defense: s.defense ?? 10,
    apByLocation: { body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 },
    absent: [], wardBySchool: {}, immune: [], vulnerable: [],
    statuses: [...(actor.statuses ?? [])], size: s.size ?? null, swarm: false,
    creatureType: s.creatureType ?? null, acted: null
  };
}

/**
 * Start a fight and WAIT FOR ITS TURN EVENTS TO FINISH.
 *
 * v14 dispatches `_onStartRound` and `_onStartTurn` from `_onUpdate` on the
 * active GM's client and **the update that started the fight does not await
 * them** (D-627). Both call `resetBudget`, so a Half-Action spent before they
 * land is silently put back and the test then waits forever for a number that
 * was already written and overwritten. `combatTurnChange` is core's own signal
 * that the whole dispatch is over: `_manageTurnEvents` awaits the events and
 * then calls it (verified at 14.367, combat.mjs:878).
 */
async function startAndSettle(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing");
  return combat;
}

/** A started fight holding these actors, deleted with the batch. */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  return startAndSettle(combat);
}

/* ---- a scene, so a departure can be MEASURED ---------------------------- */

/**
 * A scene at five feet a square with the actors placed on it, in
 * `quench-phase15.mjs`'s shape. **Every token core makes is HOSTILE by
 * default** (14.367's schema), so a test that means "an enemy" says which
 * side it is on or nothing is ever an enemy of anything.
 */
async function sceneWith(placements) {
  const scene = await Scene.create({
    name: "ZZ Reaction Scene", width: 4000, height: 2000,
    grid: { size: 100, distance: 5, units: "ft" }
  });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "hostile" } of placements) {
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
 * Put a token where it is asked and WAIT FOR IT TO ARRIVE.
 *
 * v14 interpolates a travelling token's own document position, so
 * `await doc.update({x})` resolves when the movement is accepted rather than
 * when it is over (D-669). Poll the document until it holds what was written.
 */
async function moveTo(actor, x, y = 500) {
  const doc = actor.getActiveTokens(true)[0]?.document;
  if (!doc) throw new Error(`${actor.name} has no token on the scene`);
  await doc.update({ x, y });
  for (let i = 0; i < 200 && (doc.x !== x || doc.y !== y); i++) await new Promise(r => setTimeout(r, 50));
  await settle();
  if (doc.x !== x) throw new Error(`${actor.name} stopped at ${doc.x} on its way to ${x}`);
  return doc;
}

/**
 * A step the test needs that a turn's Half-Actions would not pay for (D-718):
 * putting a token back where the next assertion needs it is a GM's hand on the
 * board, not a Move. The world setting is put back immediately, so every other
 * move in this batch is judged by the rule.
 */
async function withoutMovementLimit(fn) {
  const before = game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING);
  await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, false);
  try { return await fn(); } finally { await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, before); }
}

/** A fight over the tokens on a scene, with a named actor holding the turn. */
async function fightOnScene(scene, actors, first) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens(true)[0]?.document;
    return { actorId: a.id, tokenId: token?.id ?? null, sceneId: scene.id };
  }));
  await startAndSettle(combat);
  const mine = combat.getCombatantsByActor(first)[0];
  const index = combat.turns.findIndex(c => c.id === mine.id);
  if (index !== combat.turn) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.update({ turn: index });
    await settled;
  }
  await until(() => combat.combatant?.id === mine.id, `${first.name} holding the turn`);
  await until(() => combat.getCombatantsByActor(first)[0].budget.halfActions === 2, "a fresh budget");
  return combat;
}

/** The Opportunity Attack cards a move posted, newest first. */
function opportunityCards() {
  return game.messages.filter(m => m.flags?.["azeroth-rpg"]?.reaction === "opportunityAttack");
}

/** A card's own button, parsed out of the content the template wrote. */
function buttonOn(message, action) {
  const box = document.createElement("div");
  box.innerHTML = message.content;
  return box.querySelector(`[data-action="${action}"]`);
}

/**
 * Fill a pool, and wait for the write.
 *
 * **A Parry costs a point** (06 §6, D-720), and 02 §7 starts every fight with
 * Momentum at 0 - so a Parry with nothing in hand is refused and every test
 * that means to parry has to pay for it.
 */
async function fillPool(actor, name, value) {
  const pool = (actor.poolSnapshot?.() ?? []).find(p => p.name === name);
  if (!pool) throw new Error(`${actor.name} holds no ${name} pool`);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => (actor.poolSnapshot().find(p => p.name === name)?.value ?? 0) === value,
    `${actor.name}'s ${name} reaching ${value}`);
  return pool;
}

/** What a pool holds now. */
const poolValue = (actor, name) => actor.poolSnapshot().find(p => p.name === name)?.value ?? null;

/** Post a real attack card at one target, with the Reaction rows the door builds. */
async function attackCard(attacker, victim, { face = 15, rating = 8 } = {}) {
  const target = snapshotOf(victim);
  const unpin = pinDie(face);
  try {
    return await game.system.azeroth.workflows.rollTest({
      actor: attacker, kind: "attack", dc: 5, title: "ZZ Reaction attack",
      targets: [target], reactions: reactionRows([target]),
      modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
      damage: { rating, kind: "physical" }
    });
  } finally {
    unpin();
  }
}

export function reactionBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("06 §6's Reactions (D-693, D-694)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The setting is the STRING "skip" or "always", never a boolean: a test
      // that sets it false opens every dialog and hangs on the first one.
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      // Deleting a VIEWED scene tears the canvas down and leaves the world
      // with none, which every later run then starts from (D-669's batch).
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // **THE ORDER OF THE TEARDOWN IS PART OF THE TEST.** `cleanup()` deletes
      // in the order things were made, which is actors first - and a Combat
      // deleted after them makes core look its combatants' actors up strictly
      // and clear the movement history of tokens on a scene that is already
      // gone. Both come back as page errors and the smoke suite fails on any
      // of them, which is a green batch reported as a red run. Fights first,
      // then the scenes, then everything else.
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Block ------------------------------------------------------------ */

    it("Blocks a real attack for four, spends the Reaction, and the blow lands four lighter", async function () {
      this.timeout(120000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ React Blocker", classes: [["Warrior", 5]], armor: ["Buckler"] });
      const shield = victim.items.find(i => i.name === "Buckler");
      assert.ok(shield, "the fixture did not embed a shield");
      await shield.update({ "system.equipped": true });
      await until(() => victim.items.get(shield.id)?.system?.equipped === true, "the shield being held");

      const combat = await fightWith([attacker, victim]);
      const mine = combat.getCombatantsByActor(victim)[0];
      assert.equal(mine.budget.reactions, 1, "the defender started the fight with no Reaction");

      const card = await attackCard(attacker, victim);
      assert.ok(card, "the attack produced no card");
      // The row reached the card at all - which is the half a unit test
      // cannot see, because `reactionRows` resolves a live actor's items.
      assert.include(card.content, 'data-action="reactBlock"',
        "the attack card offers no Block: `reactionRows` never reached the template");
      const damage = card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.damage ?? 0;
      assert.isAbove(damage, BLOCK_REDUCTION, "the blow is too light for a Block to be visible");

      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
      const mark = victim.getFlag("azeroth-rpg", "mitigate");
      assert.ok(mark, "the Block recorded nothing for `applyDamage` to spend");
      assert.equal(mark.amount, BLOCK_REDUCTION, "a Block took off something other than 06 §6's four");
      await until(() => combat.getCombatantsByActor(victim)[0].budget.reactions === 0,
        "the Reaction being spent");

      const health = victim.system.health.value;
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(damage) } }, card);
      assert.equal(victim.system.health.value, Math.max(0, health - (damage - BLOCK_REDUCTION)),
        "the Block did not take four off the blow that landed");
      assert.isNotOk(victim.getFlag("azeroth-rpg", "mitigate"), "the Block was not spent by the blow");
    });

    it("refuses a second Reaction in the same round, and refuses the same attack twice, BY NAME", async function () {
      this.timeout(120000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker 2", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ React Twice", classes: [["Warrior", 5]], armor: ["Buckler"] });
      await victim.items.find(i => i.name === "Buckler").update({ "system.equipped": true });
      const combat = await fightWith([attacker, victim]);

      const first = await attackCard(attacker, victim);
      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, first);
      await until(() => combat.getCombatantsByActor(victim)[0].budget.reactions === 0, "the Reaction being spent");
      // The mark the FIRST Block left. Nothing has applied damage yet, so it
      // is still standing - which is what a refused second press must not
      // touch, and asserting it away here is what this test got wrong once.
      assert.equal(victim.getFlag("azeroth-rpg", "mitigate")?.messageId, first.id,
        "the first Block recorded nothing against the attack it answered");

      // The SAME attack: already answered.
      const again = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, first);
      });
      assert.lengthOf(again, 1, "a second Block on the same attack said nothing at all");
      assert.equal(again[0], game.i18n.format("AZEROTH.Reaction.Refuse.Already", { name: victim.name }),
        "the refusal did not name the creature that had already answered");

      // A DIFFERENT attack, same round: no Reaction left.
      //
      // **THE ATTACKER'S OWN BUDGET HAS TO BE PUT BACK FIRST** (D-704). This
      // read as a second blow because a level-5 character held TWO Attack
      // actions a round, which is not what 02 §6 grants: Extra Attack is two
      // ROLLS in one Attack. The turn's Half-Actions are what the second blow
      // needs now (D-711), and the test's subject - the VICTIM's spent Reaction
      // - was never about the attacker's economy at all.
      await combat.getCombatantsByActor(attacker)[0].resetBudget();
      await until(() => combat.getCombatantsByActor(attacker)[0].budget.halfActions === 2,
        "the attacker's Half-Actions refreshing");
      const second = await attackCard(attacker, victim);
      assert.ok(second, "the second attack posted no card");
      const spent = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, second);
      });
      assert.lengthOf(spent, 1, "a Reaction with none left said nothing at all");
      assert.equal(spent[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoReaction", { name: victim.name }),
        "the refusal did not name the creature that was out of Reactions");
      // NEITHER refusal wrote anything: the mark is still the one the first
      // Block left, against the attack it answered.
      assert.equal(victim.getFlag("azeroth-rpg", "mitigate")?.messageId, first.id,
        "a refused Reaction recorded a mitigation against the wrong attack");
      assert.equal(combat.getCombatantsByActor(victim)[0].budget.reactions, 0,
        "a refused Reaction moved the budget");
    });

    it("refuses a Block to somebody carrying no shield, naming why", async function () {
      this.timeout(90000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker 3", classes: [["Warrior", 5]] });
      const bare = await makeCharacter({ name: "ZZ React Bare", classes: [["Mage", 5]] });
      await fightWith([attacker, bare]);
      const card = await attackCard(attacker, bare);
      // No shield, so no button either - a control never appears where the
      // door would refuse.
      assert.notInclude(card.content, 'data-action="reactBlock"',
        "the card offered a Block to somebody carrying no shield");
      const said = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
      });
      assert.lengthOf(said, 1, "the door refused in silence");
      assert.equal(said[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoShield", { name: bare.name }));
    });

    /* ---- Parry ------------------------------------------------------------ */

    it("Parries a blow away on a beat, and lets it through on a miss", async function () {
      this.timeout(180000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker 4", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({
        name: "ZZ React Parrier", classes: [["Warrior", 5]], weapons: ["Longsword"]
      });
      const sword = victim.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => victim.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      const combat = await fightWith([attacker, victim]);
      // **A PARRY COSTS 1 MOMENTUM** (06 §6, D-720), and 02 §7 starts every
      // fight with the pool at 0 - so the Warrior pays for it, and without
      // this the card would offer no Parry at all.
      await fillPool(victim, "rage", 6);

      // A weak blow: total 8, so a Parry rolling 20 meets or beats it easily.
      const card = await attackCard(attacker, victim, { face: 5 });
      assert.include(card.content, 'data-action="reactParry"', "the attack card offers no Parry");
      const attackTotal = card.rolls[0].total;
      const damage = card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.damage ?? 0;
      assert.isAbove(damage, 0, "the blow deals nothing, so a Parry proves nothing");

      const unpin = pinDie(20);
      try {
        await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
      } finally {
        unpin();
      }
      const mark = victim.getFlag("azeroth-rpg", "mitigate");
      assert.ok(mark, `a Parry rolling 20 against ${attackTotal} recorded nothing`);
      assert.isTrue(mark.negate, "a held Parry did not negate the damage");
      assert.equal(poolValue(victim, "rage"), 5, "the Parry did not cost 1 Rage (06 §6, D-720)");
      const health = victim.system.health.value;
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(damage) } }, card);
      assert.equal(victim.system.health.value, health, "a held Parry let the damage through");

      // The next round, a Parry that misses. The Reaction refreshes with the
      // turn; the budget flag is what holds it, so it is reset directly rather
      // than by walking the tracker through a whole round.
      await combat.getCombatantsByActor(victim)[0].resetBudget();
      await until(() => combat.getCombatantsByActor(victim)[0].budget.reactions === 1, "the Reaction refreshing");
      // And the ATTACKER's, or there is no second blow to Parry: the turn's
      // two Half-Actions are the bound (05 §10, D-711) and both were spent on
      // the blow above. A new round refreshes both budgets.
      await combat.getCombatantsByActor(attacker)[0].resetBudget();
      await until(() => combat.getCombatantsByActor(attacker)[0].budget.halfActions === 2,
        "the attacker's Half-Actions refreshing");
      const hard = await attackCard(attacker, victim, { face: 20 });
      assert.ok(hard, "the second attack posted no card");
      const hardDamage = hard.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.damage ?? 0;
      const before = victim.system.health.value;
      const missed = pinDie(1);
      try {
        await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, hard);
      } finally {
        missed();
      }
      assert.isNotOk(victim.getFlag("azeroth-rpg", "mitigate"),
        "a Parry that missed still negated the blow");
      // **BEFORE THE BLOW LANDS**: 02 §7 grants Rage for being damaged, so a
      // pool read after `applyDamage` is the Parry's point and the strike's
      // gain together, and the sum happened to come back to 5.
      assert.equal(poolValue(victim, "rage"), 4, "a Parry that missed did not cost its point");
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(hardDamage) } }, hard);
      assert.equal(victim.system.health.value, Math.max(0, before - hardDamage),
        "a missed Parry did not let the blow land in full");
      // It cost the Reaction either way: *it costs a roll and a point*.
      assert.equal(combat.getCombatantsByActor(victim)[0].budget.reactions, 0,
        "a Parry that missed did not cost the Reaction");
    });

    it("SENDS A ROGUE'S PARRY TO ENERGY, and refuses one with nothing to pay (06 §6, D-720)", async function () {
      this.timeout(180000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker 4b", classes: [["Warrior", 5]] });
      const rogue = await makeCharacter({
        name: "ZZ React Rogue", classes: [["Rogue", 5]], weapons: ["Dagger"]
      });
      const dagger = rogue.items.find(i => i.name === "Dagger");
      await dagger.update({ "system.equipped": true });
      await until(() => rogue.items.get(dagger.id)?.system?.equipped === true, "the dagger being drawn");
      const combat = await fightWith([attacker, rogue]);

      // Combo Points in hand and Energy empty: 06 names ENERGY, so this is a
      // refusal and the Combo Points are not touched.
      await fillPool(rogue, "comboPoints", 5);
      await fillPool(rogue, "energy", 0);
      const dry = await attackCard(attacker, rogue, { face: 5 });
      assert.notInclude(dry.content, 'data-action="reactParry"',
        "the card offered a Parry to a Rogue with no Energy");
      const short = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, dry);
      });
      assert.lengthOf(short, 1, "the door refused in silence");
      assert.equal(short[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoMomentum", { name: rogue.name }));
      assert.equal(poolValue(rogue, "comboPoints"), 5, "the refusal spent a Combo Point");

      // With Energy, the Parry is made and the ENERGY is what pays.
      await fillPool(rogue, "energy", 8);
      await combat.getCombatantsByActor(attacker)[0].resetBudget();
      await until(() => combat.getCombatantsByActor(attacker)[0].budget.halfActions === 2,
        "the attacker's Half-Actions refreshing");
      const card = await attackCard(attacker, rogue, { face: 5 });
      assert.include(card.content, 'data-action="reactParry"', "a Rogue holding Energy was offered no Parry");
      const unpin = pinDie(20);
      try {
        await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
      } finally {
        unpin();
      }
      assert.equal(poolValue(rogue, "energy"), 7, "the Rogue's Parry did not come out of Energy");
      assert.equal(poolValue(rogue, "comboPoints"), 5, "the Rogue's Parry spent Combo Points");
    });

    it("NEVER OFFERS A CASTER A PARRY, and leaves their Block exactly where it was", async function () {
      this.timeout(180000);
      const attacker = await makeCharacter({ name: "ZZ React Attacker 4c", classes: [["Warrior", 5]] });
      const shaman = await makeCharacter({
        name: "ZZ React Shaman", classes: [["Shaman", 5]], weapons: ["Mace"], armor: ["Buckler"]
      });
      for (const name of ["Mace", "Buckler"]) {
        const item = shaman.items.find(i => i.name === name);
        assert.ok(item, `the fixture did not embed a ${name}`);
        await item.update({ "system.equipped": true });
      }
      await until(() => shaman.items.filter(i => i.system?.equipped).length >= 2, "the mace and the shield in hand");
      const combat = await fightWith([attacker, shaman]);
      assert.isNotOk(shaman.system.momenta.length, "a Shaman was given a Momentum pool");

      const card = await attackCard(attacker, shaman);
      assert.notInclude(card.content, 'data-action="reactParry"',
        "a class that builds no Momentum was offered a Parry (06 §6, D-720)");
      // **Block is unchanged**: any shield, no cost, no class.
      assert.include(card.content, 'data-action="reactBlock"', "the Shaman's shield lost its Block");
      const said = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
      });
      assert.lengthOf(said, 1, "the door refused in silence");
      assert.equal(said[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoMomentumClass", { name: shaman.name }));
      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
      await until(() => combat.getCombatantsByActor(shaman)[0].budget.reactions === 0, "the Block spending the Reaction");
      assert.equal(shaman.getFlag("azeroth-rpg", "mitigate")?.amount, BLOCK_REDUCTION,
        "the Shaman's Block recorded something other than 06 §6's four");
    });

    /* ---- What the card says it answered (D-720) --------------------------- */

    it("MOVES THE APPLY BUTTON'S NUMBER after a Block, and says so in words", async function () {
      this.timeout(180000);
      // The mark is spent inside `applyDamage`, so the card went on printing
      // the full number after a Block had taken four off it and the Reaction
      // read as doing nothing (the lead's item 8).
      const attacker = await makeCharacter({ name: "ZZ Annotate Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ Annotate Blocker", classes: [["Warrior", 5]], armor: ["Buckler"] });
      await victim.items.find(i => i.name === "Buckler").update({ "system.equipped": true });
      const combat = await fightWith([attacker, victim]);

      const card = await attackCard(attacker, victim);
      const damage = card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.damage ?? 0;
      assert.isAbove(damage, BLOCK_REDUCTION, "the blow is too light for the number to move");
      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
      await until(() => card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.reaction === "block",
        "the card being annotated");
      const row = card.getFlag("azeroth-rpg", "damageByTarget")[0];
      assert.equal(row.to, damage - BLOCK_REDUCTION, "the annotated number is not what will land");
      assert.equal(row.mitigated, BLOCK_REDUCTION, "the annotation does not say how much was taken off");
      assert.equal(row.damage, damage,
        "the stored damage was patched: `applyDamage` would then take the four off twice");

      // And the rendered card carries it: the button's number and a line in
      // words, because colour is never the carrier.
      const box = document.createElement("div");
      box.innerHTML = card.content;
      document.body.append(box);
      try {
        // **ABOVE THE APPLY BUTTONS, NOT ABOVE THE FIRST BLOCK ON THE CARD**
        // (D-720). Every button block on a card is `.azeroth-card-actions`, and
        // on a Rogue's card Opening's trade is the FIRST of them - so the line
        // explaining a number the reader had not reached yet was printed above
        // *Spend 2 Energy*. This fixture is a Warrior and carries no Opening,
        // so one is spliced in: what is under test is which block the line is
        // anchored on, and nothing else about Opening.
        const opening = document.createElement("div");
        opening.className = "azeroth-card-actions";
        opening.innerHTML = '<button type="button" data-action="openingCombo">Opening</button>';
        box.querySelector(".azeroth-card-body").prepend(opening);

        Hooks.callAll("renderChatMessageHTML", card, box);
        const button = box.querySelector('button[data-action="applyDamage"][data-target-index="0"]');
        assert.ok(button, "the card has no Apply button for the row");
        assert.equal(button.dataset.damage, String(damage - BLOCK_REDUCTION), "the button still carries the full blow");
        assert.include(box.textContent.replace(/\s+/g, " "), game.i18n.localize("AZEROTH.Card.Answered"),
          "the card never says a Reaction answered");
        const said = box.querySelector(".azeroth-card-mitigated");
        assert.ok(said, "the line is not in the card at all");
        assert.ok(said.nextElementSibling?.querySelector('button[data-action="applyDamage"]'),
          "the Answered line was printed above the wrong buttons");
      } finally {
        box.remove();
      }
      void combat;
    });

    it("SPENDS THE MARK ON THE ATTACK IT ANSWERED and no other (D-720)", async function () {
      this.timeout(180000);
      const attacker = await makeCharacter({ name: "ZZ Mark Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ Mark Victim", classes: [["Warrior", 5]], armor: ["Buckler"] });
      await victim.items.find(i => i.name === "Buckler").update({ "system.equipped": true });
      const combat = await fightWith([attacker, victim]);

      const blocked = await attackCard(attacker, victim);
      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, blocked);
      await until(() => victim.getFlag("azeroth-rpg", "mitigate")?.messageId === blocked.id, "the Block's mark");

      // A SECOND blow, applied first. The Block was pressed against the other
      // attack and must not answer this one.
      await combat.getCombatantsByActor(attacker)[0].resetBudget();
      await until(() => combat.getCombatantsByActor(attacker)[0].budget.halfActions === 2,
        "the attacker's Half-Actions refreshing");
      const other = await attackCard(attacker, victim);
      const otherDamage = other.getFlag("azeroth-rpg", "damageByTarget")[0].damage;
      const before = victim.system.health.value;
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(otherDamage) } }, other);
      assert.equal(victim.system.health.value, Math.max(0, before - otherDamage),
        "the Block answered a blow it was never pressed against");
      assert.equal(victim.getFlag("azeroth-rpg", "mitigate")?.messageId, blocked.id,
        "the mark was eaten by the wrong attack");

      // **AND A BLOW WITH NO CARD BEHIND IT IS NOT THAT CARD EITHER** (D-720).
      // The sheet's own damage door, a hazard and a tick all arrive with no
      // message id, and the door used to read a missing one as a match - so the
      // next scratch the victim took ate a Block pressed on a swing nobody had
      // applied yet. `rules/reactions.mjs#markAnswers` is the judgement.
      const loose = victim.system.health.value;
      await victim.applyDamage(3, { struck: true });
      assert.equal(victim.system.health.value, Math.max(0, loose - 3),
        "a blow with no card behind it was mitigated by a card-bound mark");
      assert.equal(victim.getFlag("azeroth-rpg", "mitigate")?.messageId, blocked.id,
        "a blow with no card behind it spent the Block");

      // And the blow it WAS pressed against still lands four lighter.
      const blockedDamageValue = blocked.getFlag("azeroth-rpg", "damageByTarget")[0].damage;
      const now = victim.system.health.value;
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(blockedDamageValue) } }, blocked);
      assert.equal(victim.system.health.value, Math.max(0, now - (blockedDamageValue - BLOCK_REDUCTION)),
        "the Block did not answer the attack it was pressed against");
    });

    it("REFUSES AN ANNOTATION FROM SOMEBODY WHO DOES NOT OWN THE DEFENDER (D-720)", async function () {
      this.timeout(180000);
      // The annotation runs on the GM's client with a payload a PLAYER
      // composed, and core checks only `QUERY_USER` - so the handler checks
      // ownership and the mark itself, exactly as `layBaneQueryHandler` does.
      // Without it any client could rewrite the number on any Apply button.
      const attacker = await makeCharacter({ name: "ZZ Forge Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ Forge Victim", classes: [["Warrior", 5]], armor: ["Buckler"] });
      await victim.items.find(i => i.name === "Buckler").update({ "system.equipped": true });
      const combat = await fightWith([attacker, victim]);
      const card = await attackCard(attacker, victim);
      const damage = card.getFlag("azeroth-rpg", "damageByTarget")[0].damage;
      assert.isAbove(damage, BLOCK_REDUCTION, "the blow is too light for the number to move");

      const stranger = await User.create({ name: "ZZ Quench Stranger", role: CONST.USER_ROLES.PLAYER });
      try {
        // 1. Nobody has reacted, so there is no mark: refused even for the GM.
        let error = null;
        try {
          await annotateQueryHandler({ messageId: card.id, index: 0, reaction: "block", to: 0, mitigated: 99 },
            { user: game.user });
        } catch (err) { error = err; }
        assert.ok(error, "an annotation with no Reaction behind it was written");
        assert.isUndefined(card.getFlag("azeroth-rpg", "damageByTarget")[0].to, "the forged number reached the card");

        // 2. A real Block, and a stranger trying to annotate it.
        await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
        await until(() => card.getFlag("azeroth-rpg", "damageByTarget")?.[0]?.reaction === "block",
          "the Block's own annotation");
        let refused = null;
        try {
          await annotateQueryHandler({ messageId: card.id, index: 0, reaction: "parry", to: 0, mitigated: 99 },
            { user: stranger });
        } catch (err) { refused = err; }
        assert.ok(refused, "a user who owns neither the defender nor the mark rewrote the card");
        assert.include(refused.message, victim.name, "the refusal does not say whose row it is");

        // 3. And the numbers are the GM's own arithmetic, never the caller's:
        // the same forged payload from an OWNER lands on the Block's four.
        await annotateQueryHandler({ messageId: card.id, index: 0, reaction: "parry", to: 0, mitigated: 99 },
          { user: game.user });
        const row = card.getFlag("azeroth-rpg", "damageByTarget")[0];
        assert.equal(row.to, damage - BLOCK_REDUCTION, "the caller's number was taken on trust");
        assert.equal(row.mitigated, BLOCK_REDUCTION, "the caller's mitigation was taken on trust");
        assert.equal(row.reaction, "block", "the caller's word for the Reaction was taken on trust");
      } finally {
        await stranger.delete().catch(() => {});
      }
      void combat;
    });

    it("A DISMISSED PARRY DIALOG KEEPS THE POINT, AND STILL COSTS THE REACTION (06 §6, D-720)", async function () {
      this.timeout(180000);
      // *It costs a roll and a point.* The Reaction is paid at the door, so a
      // dismissed dialog still costs it - but the point buys the Attack Test,
      // and closing the window used to take it and give nothing back. It was
      // the one place in this system where a cancelled dialog charged.
      const attacker = await makeCharacter({ name: "ZZ Parry Dismiss Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({
        name: "ZZ Parry Dismisser", classes: [["Warrior", 5]], weapons: ["Longsword"]
      });
      const sword = victim.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => victim.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      const combat = await fightWith([attacker, victim]);
      await fillPool(victim, "rage", 6);
      const card = await attackCard(attacker, victim, { face: 5 });

      // The dialog has to OPEN to be dismissed, so the setting goes to
      // "always" for this one press and back in the `finally`.
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      try {
        const pressed = CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
        const dialog = await dialogFor(victim, 8000);
        assert.ok(dialog, "the Parry dialog did not open");
        await dialog.close();
        assert.isNull(await pressed, "a dismissed Parry dialog still rolled");
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
      assert.equal(poolValue(victim, "rage"), 6, "a dismissed Parry dialog spent the point");
      assert.isNotOk(victim.getFlag("azeroth-rpg", "mitigate"), "a dismissed Parry left a mark behind it");
      assert.equal(combat.getCombatantsByActor(victim)[0].budget.reactions, 0,
        "a dismissed Parry dialog handed the Reaction back");
    });

    it("A PARRY NOBODY CAN PAY FOR AT THE ROLL DOES NOT HOLD (06 §6, D-720; the final review)", async function () {
      this.timeout(180000);
      // `canReact` reads the pool at the DOOR and the dialog then stays open
      // while the world moves: a Finisher on another card, a Sunder, a Charge
      // can empty it between the offer and the confirmation, and `payParry`
      // hands back null. The mark was laid anyway, so a Warrior at 0 Rage
      // negated a blow for free - the one place a price in this system could
      // be walked past.
      const attacker = await makeCharacter({ name: "ZZ Parry Unpaid Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({
        name: "ZZ Parry Unpaid", classes: [["Warrior", 5]], weapons: ["Longsword"]
      });
      const sword = victim.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => victim.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      const combat = await fightWith([attacker, victim]);
      await fillPool(victim, "rage", 6);
      const card = await attackCard(attacker, victim, { face: 5 });

      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      // A natural 20, so the Parry WOULD hold on the roll: what stops it has
      // to be the price and not the die.
      const unpin = pinDie(20);
      let said = [];
      try {
        said = await noticesFrom("warn", async () => {
          const pressed = CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
          const dialog = await dialogFor(victim, 8000);
          assert.ok(dialog, "the Parry dialog did not open");
          // The pool goes WHILE THE WINDOW IS OPEN.
          await fillPool(victim, "rage", 0);
          dialog.element.querySelector('button[data-action="roll"]').click();
          assert.ok(await pressed, "the Parry rolled nothing at all");
        });
      } finally {
        unpin();
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
      assert.isNotOk(victim.getFlag("azeroth-rpg", "mitigate"),
        "a Parry nobody paid for still negated the blow");
      assert.equal(poolValue(victim, "rage"), 0, "the parry found a point where there was none");
      assert.include(said, game.i18n.format("AZEROTH.Reaction.Refuse.NoMomentum", { name: victim.name }),
        "the unpaid Parry refused in silence");
      // The Reaction stays spent: 06 charges the attempt, exactly as a
      // dismissed dialog is charged.
      assert.equal(combat.getCombatantsByActor(victim)[0].budget.reactions, 0,
        "an unpaid Parry handed the Reaction back");
      const last = game.messages.contents.at(-1);
      assert.include(last.content,
        game.i18n.format("AZEROTH.Reaction.ParryUnpaid", { name: victim.name, with: sword.name }),
        "chat said nothing about the parry that could not be paid for");
    });

    /* ---- Pummel and the Bane it lays -------------------------------------- */

    it("Pummel lays two Banes that reach the caster's next Casting Test, and are gone after it", async function () {
      this.timeout(180000);
      const warrior = await makeCharacter({ name: "ZZ Pummeller", classes: [["Warrior", 5]] });
      const caster = await makeCharacter({
        name: "ZZ Pummelled", classes: [["Mage", 5]], abilities: { int: 16 }
      });
      const spell = await until(() => caster.items.find(i => i.type === "spell") ?? null,
        "a spell on the caster", 1000).catch(() => null)
        ?? await (async () => {
          const pack = game.packs.get("azeroth-rpg.spells");
          const index = await pack.getIndex({ fields: ["system.tier"] });
          const entry = index.find(e => e.system?.tier === 1);
          const doc = await pack.getDocument(entry._id);
          const [made0] = await caster.createEmbeddedDocuments("Item", [doc.toObject()]);
          return made0;
        })();
      assert.ok(spell, "the caster holds no spell");

      const pummel = await until(() => warrior.items.find(i => i.type === "feature" && i.name === "Pummel") ?? null,
        "the Warrior's Pummel feature");
      // The descriptor reached the ITEM, which is the half `syncClassFeatures`
      // owns: the table moved and the ready-hook restamp is what carries it.
      assert.equal(pummel.system.lays?.kind, "casting", "Pummel's stamp carries no Bane to lay");
      assert.equal(pummel.system.lays?.banes, PUMMEL_BANES, "Pummel lays a count 06 §6 does not name");

      // Nothing laid yet.
      assert.equal(caster.system.laidBanes?.casting ?? 0, 0, "the caster started under a Bane");
      const clean = defaultChoice(caster, { kind: "casting", targets: [] });
      const banesBefore = clean.banes;

      await game.system.azeroth.workflows.useFeature({
        actor: warrior, item: pummel, targets: [snapshotOf(caster)]
      });
      await until(() => (caster.system.laidBanes?.casting ?? 0) === PUMMEL_BANES,
        "Pummel's two Banes reaching the caster's prepared data");
      const effect = caster.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane);
      assert.ok(effect, "no Active Effect carries the Bane");
      assert.equal(effect.flags["azeroth-rpg"].laidBane.source, "Pummel", "the effect does not say what laid it");
      assert.equal(effect.origin, warrior.uuid, "the effect does not say who laid it");
      // **NO `changes`**: a Bane is dice, and the roll pipeline reads the flag
      // (CLAUDE.md §6). A change on the same field would count it twice.
      assert.lengthOf(effect.system?.changes ?? [], 0, "the laid Bane wrote a stat change as well");

      // THE DIALOG COUNTS IT, which is the door D-681 keeps finding unopened.
      const under = defaultChoice(caster, { kind: "casting", targets: [] });
      assert.equal(under.banes, banesBefore + PUMMEL_BANES,
        "the laid Bane never reached the roll dialog's own count");
      assert.include(under.chosen, "laidBane", "the dialog raised no line for it");
      // And it bears on a Casting Test alone.
      assert.equal(defaultChoice(caster, { kind: "skill", skill: "athletics", targets: [] }).banes, 0,
        "a Bane laid on Casting reached a skill Test");

      // Cast, and it is SPENT - *on the NEXT Casting Test it makes*.
      const pool = caster.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
      if (pool) await caster.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const unpin = pinDie(15);
      let cast;
      try {
        cast = await game.system.azeroth.workflows.castSpell({ actor: caster, spell, targets: [] });
      } finally {
        unpin();
      }
      assert.ok(cast, "the spell did not cast");
      await until(() => (caster.system.laidBanes?.casting ?? 0) === 0, "the Bane being spent by the Test");
      assert.notOk(caster.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane),
        "the effect outlived the Test it was laid for");
      assert.equal(defaultChoice(caster, { kind: "casting", targets: [] }).banes, banesBefore,
        "the dialog still counts a Bane that was spent");
    });

    it("lays the Bane on a creature as readily as on a character", async function () {
      this.timeout(120000);
      const warrior = await makeCharacter({ name: "ZZ Pummeller 2", classes: [["Warrior", 5]] });
      const creature = await makeNpc("Plagued Ghoul");
      const pummel = await until(() => warrior.items.find(i => i.type === "feature" && i.name === "Pummel") ?? null,
        "the Warrior's Pummel feature");
      await game.system.azeroth.workflows.useFeature({
        actor: warrior, item: pummel, targets: [snapshotOf(creature)]
      });
      await until(() => (creature.system.laidBanes?.casting ?? 0) === PUMMEL_BANES,
        "the Bane reaching the creature's prepared data");
      // The creature's own standing passives are untouched by it: one is
      // standing and one is spent, and folding them together would mean one
      // number with two lifetimes.
      assert.equal(creature.system.testBanes?.casting ?? 0, 0,
        "a laid Bane was folded into the creature's own standing passive");
    });

    /* ---- Gorehowl's kill, and the two finds that Bane on a hit ------------- */

    it("lays Gorehowl's Bane from the card's own button", async function () {
      this.timeout(120000);
      const warrior = await makeCharacter({ name: "ZZ Gorehowl", classes: [["Warrior", 5]] });
      const axe = await (async () => {
        const pack = game.packs.get("azeroth-rpg.weapons");
        const index = await pack.getIndex({ fields: ["system.identifier"] });
        const entry = index.find(e => e.system?.identifier === "gorehowl");
        if (!entry) throw new Error("the weapons pack no longer holds Gorehowl");
        return pack.getDocument(entry._id);
      })();
      const [held] = await warrior.createEmbeddedDocuments("Item", [axe.toObject()]);
      await held.update({ "system.equipped": true });
      const victim = await makeNpc("Plagued Ghoul");

      const target = snapshotOf(victim);
      const unpin = pinDie(18);
      let card;
      try {
        card = await game.system.azeroth.workflows.rollTest({
          actor: warrior, kind: "attack", dc: 5, title: "ZZ Gorehowl swing",
          targets: [target], weaponId: held.id,
          weaponEffects: { criticalOn: 20, effects: [], notes: [], onKill: [{ key: "signature", name: held.name, text: "on a kill", feet: 30, bane: 1 }] },
          modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
          damage: { rating: 6, kind: "physical" }
        });
      } finally {
        unpin();
      }
      assert.include(card.content, 'data-action="layBane"',
        "Gorehowl's kill line still offers no button: the carrier never reached the card");
      await CARD_ACTIONS.layBane({ dataset: { kind: "attack", banes: "1", source: held.name } }, card);
      // With nothing selected the button reaches the controlled tokens and
      // there are none, so this only proves the door exists; the write itself
      // is proved on the named target below.
      await CARD_ACTIONS.layBane({ dataset: { kind: "attack", banes: "1", source: held.name, targetIndex: "0" } }, card);
      await until(() => (victim.system.laidBanes?.attack ?? 0) === 1, "Gorehowl's Bane reaching the creature");
      assert.equal(defaultChoice(victim, { kind: "attack", targets: [] }).banes, 1,
        "the laid Bane never reached the creature's own attack dialog");
    });

    /* ---- Opportunity Attack (D-694) --------------------------------------- */

    it("offers the enemy left behind an Opportunity Attack, and taking it spends their Reaction and NOT the round's Attack", async function () {
      this.timeout(240000);
      const mover = await makeCharacter({ name: "ZZ OA Mover", classes: [["Rogue", 5]] });
      const threat = await makeCharacter({ name: "ZZ OA Threat", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = threat.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => threat.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");

      // Five feet apart: one square on a five-foot grid, which is exactly
      // reach. **The mover leaves to the LEFT**, away from the threatener - a
      // departure that walks THROUGH the enemy's own square measures a closest
      // approach of nothing, which is right and is not what this test means.
      const scene = await sceneWith([
        { actor: mover, x: 1000, y: 500, side: "friendly" },
        { actor: threat, x: 1100, y: 500, side: "hostile" }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      const combat = await fightOnScene(scene, [mover, threat], mover);
      const theirs = () => combat.getCombatantsByActor(threat)[0];
      assert.equal(theirs().budget.reactions, 1, "the threatener started with no Reaction");
      const attackedBefore = theirs().budget.attacked;
      const halvesBefore = theirs().budget.halfActions;
      const before = opportunityCards().length;

      // Thirty feet away, out of the sword's five.
      await moveTo(mover, 400);
      await until(() => opportunityCards().length === before + 1,
        "the departure offering the enemy an Opportunity Attack");
      const card = opportunityCards().at(-1);
      made.push(card);
      assert.include(card.content, mover.name, "the offer does not say who left");
      assert.include(card.content, threat.name, "the offer does not say whose reach it was");

      // The card's own button, parsed out of what the template wrote - so a
      // missing `data-` is a failure here rather than at a table.
      const button = buttonOn(card, "opportunityAttack");
      assert.ok(button, "the offer carries no button: `offerOpportunities` never reached the template");
      assert.equal(button.dataset.actorUuid, threat.uuid, "the button does not name the creature that may strike");
      assert.equal(button.dataset.tokenId, mover.getActiveTokens(true)[0].id, "the button does not name who is leaving");
      assert.equal(Number(button.dataset.distance), 5,
        "the button does not carry the distance the departure was measured at");

      // **WHAT THE PRESSER HAD TARGETED IS PUT BACK** (the lead's item 12).
      // `takeOpportunity` is the only place in the system that re-targets for
      // the user, and `setTargets` REPLACES the set: an Opportunity Attack
      // taken mid-turn used to drop whoever the presser was aiming at, and
      // the next attack then rolled with no damage row.
      const threatToken = threat.getActiveTokens(true)[0];
      canvas.tokens.setTargets([threatToken.id]);
      const attack = await CARD_ACTIONS.opportunityAttack(button, card);
      assert.ok(attack, "the Opportunity Attack rolled nothing: the reach refusal ate it");
      made.push(attack);
      assert.deepEqual([...game.user.targets].map(t => t.id), [threatToken.id],
        "the Opportunity Attack kept the mover targeted and lost what the presser was aiming at");
      canvas.tokens.setTargets([]);
      await until(() => theirs().budget.reactions === 0, "the Reaction being spent");
      // 06 names the Reaction as the price and nothing else.
      assert.equal(theirs().budget.attacked, attackedBefore, "the Opportunity Attack counted as the turn's Attack");
      assert.equal(theirs().budget.halfActions, halvesBefore, "the Opportunity Attack spent a Half-Action");

      // A creature with no Reaction left is NOT offered one.
      //
      // **THE REPOSITIONING IS NOT A MOVE THE TURN PAYS FOR** (D-718). Walking
      // back and out again is ninety feet on one turn's thirty-foot Speed, and
      // `onPreMoveToken` refuses that - rightly. What this test is about is the
      // OFFER, so the limit is lifted for the two steps that put the token back
      // where the next assertion needs it, and stands again immediately.
      const after = opportunityCards().length;
      await withoutMovementLimit(async () => {
        await moveTo(mover, 1000);
        await moveTo(mover, 400);
      });
      await new Promise(r => setTimeout(r, 400));
      assert.equal(opportunityCards().length, after,
        "an enemy with no Reaction left was offered one anyway");

      // And both refusals say who and why.
      const twice = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.opportunityAttack(button, card);
      });
      assert.lengthOf(twice, 1, "a second press on the same offer said nothing at all");
      assert.equal(twice[0], game.i18n.format("AZEROTH.Reaction.Refuse.Already", { name: threat.name }));

      const spent = await noticesFrom("warn", async () => {
        await takeOpportunity(threat, { tokenId: button.dataset.tokenId, sceneId: scene.id, distance: 5, messageId: "zz-another-departure" });
      });
      assert.lengthOf(spent, 1, "a Reaction with none left said nothing at all");
      assert.equal(spent[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoReaction", { name: threat.name }));
    });

    it("a mover twenty feet UP leaves nobody's reach, and the same move on the ground provokes (D-732's review)", async function () {
      this.timeout(240000);
      // **ELEVATION IS PART OF EVERY DISTANCE.** The first D-732 helper laid a
      // footprint out in two dimensions, so a Harpy passing twenty feet over a
      // Warrior drew an Opportunity Attack the old centre-to-centre measure,
      // which carried elevation, never had.
      const mover = await makeCharacter({ name: "ZZ OA High Mover", classes: [["Rogue", 5]] });
      const threat = await makeCharacter({ name: "ZZ OA Ground Threat", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = threat.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => threat.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      const scene = await sceneWith([
        { actor: mover, x: 1000, y: 500, side: "friendly" },
        { actor: threat, x: 1100, y: 500, side: "hostile" }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      const moverDoc = mover.getActiveTokens(true)[0].document;
      // Up BEFORE the fight: a climb straight up in a fight is itself a departure.
      await moverDoc.update({ elevation: 20 });
      await until(() => moverDoc.elevation === 20, "the mover twenty feet up");
      await settle();
      await fightOnScene(scene, [mover, threat], mover);

      // Twenty feet up and thirty feet along: never inside the sword's five.
      const high = opportunityCards().length;
      await withoutMovementLimit(() => moveTo(mover, 400));
      await new Promise(r => setTimeout(r, 600));
      await settle();
      assert.equal(opportunityCards().length, high, "a mover twenty feet up was offered to the Warrior below it");

      // Back beside the Warrior, down to the ground, and away again.
      await withoutMovementLimit(async () => {
        await moveTo(mover, 1000);
        await moverDoc.update({ elevation: 0 });
        await until(() => moverDoc.elevation === 0, "the mover back on the ground");
        await settle();
      });
      await new Promise(r => setTimeout(r, 600));
      const low = opportunityCards().length;
      assert.equal(low, high, "coming down beside the Warrior was itself offered as leaving its reach");
      await withoutMovementLimit(() => moveTo(mover, 400));
      await until(() => opportunityCards().length === low + 1, "the same departure on the ground offering the Opportunity Attack");
      made.push(opportunityCards().at(-1));
    });

    it("PUTS THE TARGETS BACK WHEN THE BLOW IS REFUSED, not only when it lands (the final review)", async function () {
      this.timeout(240000);
      // The restore is in a `finally` and the RE-TARGET used to sit ABOVE the
      // `try`, with the budget's refusal between them: a Reaction that could
      // not be paid returned null having replaced the presser's aim and never
      // put it back - the exact fault the restore exists for, on the path it
      // reaches most often.
      const threat = await makeCharacter({
        name: "ZZ Refused Threat", classes: [["Warrior", 5]], weapons: ["Longsword"]
      });
      const sword = threat.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => threat.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      const mover = await makeCharacter({ name: "ZZ Refused Mover", classes: [["Rogue", 5]] });
      const aim = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([
        { actor: threat, x: 500, y: 500, side: "friendly" },
        { actor: mover, x: 600, y: 500 },
        { actor: aim, x: 900, y: 500 }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      const combat = await fightOnScene(scene, [threat, mover], threat);
      const aimId = aim.getActiveTokens(true)[0].id;
      const moverId = mover.getActiveTokens(true)[0].id;
      canvas.tokens.setTargets([aimId]);

      // **THE SPEND IS STUBBED, NOT THE STATE.** `canReact` reads the same
      // Reaction count off the same combatant, so emptying the budget would
      // refuse at the door - above every replacement, where there is nothing
      // to undo. The two can only disagree when the budget moves between them,
      // which is another client's write; this is that, deterministically.
      const combatant = combat.getCombatantsByActor(threat)[0];
      const proto = Object.getPrototypeOf(combatant);
      const original = proto.spendAction;
      let asked = 0;
      proto.spendAction = async function () {
        asked += 1;
        return { ok: false, reason: "AZEROTH.Budget.Refuse.NoReaction", params: {} };
      };
      try {
        const card = await takeOpportunity(threat, { tokenId: moverId, sceneId: scene.id, distance: 5 });
        assert.isNull(card, "a Reaction that could not be paid still rolled");
        assert.equal(asked, 1, "the budget was never asked - the refusal under test did not happen");
      } finally {
        proto.spendAction = original;
      }
      assert.deepEqual([...game.user.targets].map(t => t.id), [aimId],
        "a refused Opportunity Attack left the mover targeted and lost the presser's own aim");
      canvas.tokens.setTargets([]);
    });

    it("offers nothing after Disengage, and the Disengage IS the Move rather than a tax on it", async function () {
      this.timeout(240000);
      const mover = await makeCharacter({ name: "ZZ Disengage Mover", classes: [["Rogue", 5]] });
      const threat = await makeCharacter({ name: "ZZ Disengage Threat", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      await threat.items.find(i => i.name === "Longsword").update({ "system.equipped": true });
      const scene = await sceneWith([
        { actor: mover, x: 1000, y: 500, side: "friendly" },
        { actor: threat, x: 1100, y: 500, side: "hostile" }
      ]);
      assert.isTrue(canvas.ready, "the scene did not draw");
      const combat = await fightOnScene(scene, [mover, threat], mover);
      const mine = () => combat.getCombatantsByActor(mover)[0];

      await disengage(mover);
      await until(() => mover.statuses.has("disengaging"), "the Disengaging state");
      await until(() => mine().budget.halfActions === 1, "Disengage paying its Half-Action");
      assert.equal(mine().getFlag("azeroth-rpg", "moveHalves"), 1,
        "Disengage did not pay for the Move it buys, so the walk would cost a second Half-Action");

      const before = opportunityCards().length;
      await moveTo(mover, 400);
      await new Promise(r => setTimeout(r, 400));
      assert.equal(opportunityCards().length, before,
        "a Disengaged departure still provoked an Opportunity Attack");
      // 05: *Move up to your Speed without provoking.* One Half-Action, not two.
      assert.equal(mine().budget.halfActions, 1,
        "the Move after a Disengage was charged a second Half-Action");
    });

    /* ---- Ready and the Readied action (D-694) ----------------------------- */

    it("refuses a Readied action nobody readied, stores the two sentences, and the card takes it", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Readier", classes: [["Ranger", 5]] });
      const combat = await fightWith([actor]);
      const mine = () => combat.getCombatantsByActor(actor)[0];
      await until(() => mine().budget.halfActions === 2, "a fresh budget");

      // Nothing readied: refused by name, and nothing spent.
      const nothing = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.takeReadied({ dataset: { actorUuid: actor.uuid } }, { id: "zz-no-card" });
      });
      assert.lengthOf(nothing, 1, "a Readied action with nothing readied said nothing at all");
      assert.equal(nothing[0], game.i18n.format("AZEROTH.Reaction.Refuse.NoReady", { name: actor.name }));
      assert.equal(mine().budget.reactions, 1, "a refused Reaction was spent anyway");

      // *Name a trigger and an action.* Both are the words they were typed in.
      const trigger = "he steps out from behind the pillar";
      const action = "Loose the arrow I am holding";
      const entry = await readyWith(actor, { trigger, action });
      assert.ok(entry, "Ready stored nothing");
      await until(() => mine().getFlag("azeroth-rpg", "ready")?.trigger === trigger,
        "the trigger reaching the combatant");
      assert.equal(mine().getFlag("azeroth-rpg", "ready").action, action);
      await until(() => mine().budget.halfActions === 1, "Ready paying its Half-Action");

      // The chip on the Combat tab, which is the reader's own half (D-681).
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const panel = sheet.element.querySelector('section[data-tab="combat"]');
        assert.ok(panel, "the sheet drew no Combat panel");
        assert.include(panel.textContent, trigger, "the Combat tab says nothing about what is readied");
        for (const key of ["disengage", "ready", "clearReady"]) {
          const { el, registered } = useAction(sheet, key, { within: panel });
          assert.ok(el, `the Combat tab carries no ${key} control`);
          assert.isTrue(registered, `the sheet registers no handler for ${key}: the click is a silent no-op`);
        }
      } finally {
        await sheet.close();
      }

      const card = game.messages.filter(m => m.flags?.["azeroth-rpg"]?.reaction === "readied").at(-1);
      assert.ok(card, "Ready posted no card");
      made.push(card);
      assert.include(card.content, trigger, "the card does not say what is being waited for");
      const button = buttonOn(card, "takeReadied");
      assert.ok(button, "the Ready card offers no way to take it");

      await CARD_ACTIONS.takeReadied(button, card);
      await until(() => mine().budget.reactions === 0, "the Reaction being spent");
      assert.isNotOk(mine().getFlag("azeroth-rpg", "ready"),
        "the readied action outlived being taken");

      const again = await noticesFrom("warn", async () => {
        await CARD_ACTIONS.takeReadied(button, card);
      });
      assert.lengthOf(again, 1, "a second press said nothing at all");
      assert.equal(again[0], game.i18n.format("AZEROTH.Reaction.Refuse.Already", { name: actor.name }));

      // Stand down leaves nothing behind, whether or not there is anything to drop.
      await clearReady(actor);
      assert.isNotOk(mine().getFlag("azeroth-rpg", "ready"));
    });

    it("refuses Ready outside a fight, in words", async function () {
      this.timeout(90000);
      const loose = await makeCharacter({ name: "ZZ Ready No Fight", classes: [["Ranger", 3]] });
      const said = await noticesFrom("warn", async () => {
        assert.isNull(await readyWith(loose, { trigger: "anything", action: "anything" }),
          "Ready stored a trigger with no fight to wait in");
      });
      assert.lengthOf(said, 1, "Ready refused in silence");
      assert.equal(said[0], game.i18n.localize("AZEROTH.Combat.ReadyNeedsFight"));
    });
  });
}
