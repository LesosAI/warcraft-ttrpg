/**
 * **THE CHRONOMANCER'S GUARDIAN OF TIME, THROUGH THE REAL DOORS** (04; stage 2c), in a live
 * world: each Use pressed from the sheet's own control, each Block pressed on a real attack's
 * card, each ask in a blow answered in its own dialog, the echo rolled through the attack door
 * with its d20s pinned through core's mapping, and the field read off the scene.
 *
 * WRITTEN, NOT RUN in stage 2c (the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chronomancer-guardian`. Every document a test makes is deleted in
 * `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { attackWithDialog, reactionRows } from "../applications/actions.mjs";
import { actorTraining, trainingWarning } from "../rules/equipment-training.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { DEFERRED_FLAG, FIELD_FLAG, SENTINEL_FLAG } from "../rules/guardian.mjs";
import { DIFFICULT_BEHAVIOR } from "../rules/area-ground.mjs";
import { featureNamed, fightWith, parsed, pressUse, sandOf, sceneWith, talentNamed, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";

const health = actor => actor.system?.health?.value ?? 0;
const deferred = actor => actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [];

/**
 * A Chronomancer in mail behind a shield with a sword, its Hourglass in the Ranged slot, its
 * Mana full, these talents taken at these ranks and its Sand filled to `sand`.
 */
async function guardianWith(name, { level = 20, ranks = {}, sand = 0, shield = true } = {}) {
  const c = await makeCharacter({
    name, classes: [["Chronomancer", level]], race: "Human", bags: ["Hourglass"],
    weapons: ["Longsword"], armor: [...(shield ? ["Kite shield"] : []), "Mail hauberk"], abilities: { str: 16, int: 18, con: 14 }
  });
  await c._talentGrant;
  for (const [talent, taken] of Object.entries({ "Bronzed Steel": 1, ...ranks })) {
    const item = await until(() => talentNamed(c, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
    await until(() => talentNamed(c, talent)?.system?.taken === taken, `${talent} at rank ${taken}`);
  }
  for (const n of ["Longsword", ...(shield ? ["Kite shield"] : []), "Mail hauberk"]) {
    const item = await until(() => c.items.find(i => i.name === n), `${n} carried`);
    await item.update({ "system.equipped": true });
    await until(() => c.items.get(item.id)?.system?.equipped === true, `${n} worn`);
  }
  const glass = await until(() => c.items.find(i => i.name === "Hourglass"), "the Hourglass carried");
  await glass.update({ "system.rarity": "epic", "system.equipped": true });
  await until(() => (sandOf(c)?.max ?? 0) > 0, "the Sand cap");
  await setSand(c, sand);
  await c.update({ "system.health.value": c.system.health.max });
  await settle();
  return c;
}

/** Fill the Sand pool. */
async function setSand(actor, value) {
  const pool = sandOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: Math.min(pool.max, value) });
  await until(() => sandOf(actor).value === Math.min(pool.max, value), `${value} Sand`);
}

/** A target snapshot with no token, as `targetSnapshots` shapes one. */
function snapshotOf(actor) {
  const s = actor.system ?? {};
  return {
    tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: s.defense ?? 10,
    apByLocation: { body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 },
    absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [...(actor.statuses ?? [])],
    size: s.size ?? null, swarm: false, creatureType: s.creatureType ?? null, acted: null
  };
}

/** A real attack card from `attacker` at `victim`, the die pinned, with the defender's Reaction rows. */
async function attackCard(attacker, victim, { face = 15, rating = 8 } = {}) {
  const target = snapshotOf(victim);
  const unpin = pinDie(face);
  try {
    const card = await game.system.azeroth.workflows.rollTest({
      actor: attacker, kind: "attack", dc: 10, title: "ZZ Guardian attack",
      targets: [target], reactions: reactionRows([target]),
      modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
      damage: { rating, kind: "physical" }
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Answer the ask a blow door opened for this holder (`effects/blow-doors.mjs#confirmHere`). */
async function answer(holder, action = "yes", ms = 20000) {
  const app = await until(() => [...foundry.applications.instances.values()]
    .find(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${holder.id}`) && a.rendered), `${holder.name}'s ask`, ms);
  app.element.querySelector(`button[data-action="${action}"]`).click();
  await until(() => !app.rendered, `${holder.name}'s ask to close`);
}

/**
 * A run of d20 faces, pinned through core's mapping in turn (`fixtures.pinDie`'s own formula,
 * CLAUDE.md §14): each roll takes the next face, and a face of 1 once the run is spent.
 */
function pinFaces(faces) {
  const original = CONFIG.Dice.randomUniform;
  const queue = [...faces];
  CONFIG.Dice.randomUniform = () => (20 - (queue.length ? queue.shift() : 1)) / 20 + 0.001;
  return () => { CONFIG.Dice.randomUniform = original; };
}

export function chronomancerGuardianBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Chronomancer's Guardian of Time (04; stage 2c)", function () {
    let restore = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-blow-ask-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("BRONZED STEEL lets a Chronomancer wear mail and carry a shield with no Access Bane", async function () {
      this.timeout(120000);
      const c = await guardianWith("ZZ GT Steel");
      const profile = actorTraining(c);
      for (const n of ["Kite shield", "Mail hauberk"]) {
        assert.isNull(trainingWarning(c.items.find(i => i.name === n), profile), `${n} outside the Access`);
      }
      await talentNamed(c, "Bronzed Steel").update({ "system.taken": 0 });
      await until(() => talentNamed(c, "Bronzed Steel").system.taken === 0, "the talent given back");
      assert.equal(trainingWarning(c.items.find(i => i.name === "Kite shield"), actorTraining(c)), "shield", "a shield without the talent");
    });

    it("TIME-LOCK lays a Bane per rank on the creature targeted, sparing the Guardian, for 2 Sand, pressed from the sheet", async function () {
      this.timeout(180000);
      const c = await guardianWith("ZZ GT Lock", { ranks: { "Time-Lock": 2 }, sand: 6 });
      const b = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1200, y: 1000, side: "hostile" }]);
      const { card } = await pressUse(c, "Time-Lock", [tokenOf(b)]);
      assert.ok(await card, "the Use's card");
      const laid = await until(() => b.effects.find(e => e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG]), "the laid Bane");
      assert.equal(laid.flags["azeroth-rpg"][LAID_BANE_FLAG].source, "Time-Lock");
      assert.equal(laid.flags["azeroth-rpg"][LAID_BANE_FLAG].banes, 2, "a Bane per rank");
      assert.equal(sandOf(c).value, 4, "2 Sand paid");
    });

    it("TURNED ASIDE gains Sand for a Block and, at rank 2, for an attack that misses; GRINDING BLOCK slows a failed attacker and takes 1 more off", async function () {
      this.timeout(240000);
      const c = await guardianWith("ZZ GT Block", { ranks: { "Turned Aside": 3, "Grinding Block": 2 }, sand: 0 });
      const b = await makeNpc("Bandit");
      const combat = await fightWith([c, b]);
      await giveTurn(combat, b);
      const card = await attackCard(b, c, { face: 15 });
      assert.include(card.content, 'data-action="reactBlock"', "the card offers the Block");
      const posted = untilHook("createChatMessage", 20000, m => m.flags?.["azeroth-rpg"]?.reaction === "block");
      await CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, card);
      const [blockCard] = await posted;
      made.push(blockCard);
      assert.equal(c.getFlag("azeroth-rpg", "mitigate").amount, 5, "06's four and Grinding Block's one");
      await until(() => sandOf(c).value === 2, "2 Sand for the Block at rank 3");
      const grind = blockCard.flags["azeroth-rpg"].grind;
      assert.equal(grind.target, b.uuid, "the attacker's Test recorded");
      const button = parsed(blockCard).querySelector('button[data-action="resistTest"][data-purpose="grind"]');
      assert.ok(button, "the Block's card offers the attacker's Test");
      const unpin = pinDie(1);
      try { await CARD_ACTIONS.resistTest(button, game.messages.get(blockCard.id)); } finally { unpin(); }
      await until(() => b.statuses.has("slowed"), "the attacker Slowed");
      // The miss: a pinned 1 against the Guardian.
      const before = sandOf(c).value;
      await attackCard(b, c, { face: 1 });
      await until(() => sandOf(c).value === before + 1, "1 Sand for the miss");
    });

    it("ECHO OF THE BLADE rolls three echoes on 19, 17 and 15, each on its own card at its depth, and never a fourth", async function () {
      this.timeout(240000);
      const c = await guardianWith("ZZ GT Echo", { ranks: { "Echo of the Blade": 1 } });
      const b = await makeNpc("Bandit");
      await b.update({ "system.health.value": 300, "system.health.max": 300 });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 900, y: 1000, side: "hostile" }]);
      canvas.tokens.setTargets([tokenOf(b).id]);
      const cards = [];
      const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "attack") cards.push(m); });
      const unpin = pinFaces([19, 17, 15, 20]);
      try {
        await attackWithDialog(c, c.items.find(i => i.name === "Longsword"));
        await settle();
      } finally {
        unpin();
        Hooks.off("createChatMessage", hook);
        canvas.tokens.setTargets([]);
      }
      made.push(...cards);
      assert.equal(cards.length, 4, "the Attack Test and three echoes");
      assert.deepEqual(cards.map(m => m.flags["azeroth-rpg"].strike?.echo ?? 0), [0, 1, 2, 3], "each echo's depth on its strike");
      assert.deepEqual(cards.slice(1).map(m => m.flags["azeroth-rpg"].echo?.key), ["echo-of-the-blade", "echo-of-the-blade", "echo-of-the-blade"]);
      // No shield, no echo.
      await c.items.find(i => i.name === "Kite shield").update({ "system.equipped": false });
      const plain = [];
      const hook2 = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "attack") plain.push(m); });
      const unpin2 = pinFaces([20]);
      canvas.tokens.setTargets([tokenOf(b).id]);
      try { await attackWithDialog(c, c.items.find(i => i.name === "Longsword")); await settle(); } finally { unpin2(); Hooks.off("createChatMessage", hook2); canvas.tokens.setTargets([]); }
      made.push(...plain);
      assert.equal(plain.length, 1, "no echo without a shield");
    });

    it("BORROWED TIME, asked in the blow, takes half now and the rest less the rank at the turn's start; UNMADE WOUND erases half of it at that turn's start, and from the sheet", async function () {
      this.timeout(300000);
      const c = await guardianWith("ZZ GT Borrow", { ranks: { "Turned Aside": 1, "Borrowed Time": 1, "Unmade Wound": 1 } });
      const b = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await setSand(c, 5);
      await giveTurn(combat, b);
      const was = health(c);
      const blow = c.applyDamage(9, { struck: true, attack: true, messageId: "ZZBorrowCard" });
      await answer(c, "yes");
      await blow;
      assert.equal(health(c), was - 5, "half, rounded up, now");
      assert.deepEqual(deferred(c).map(r => [r.amount, r.source]), [[3, "Borrowed Time"]], "the other half less the rank put off");
      assert.equal(sandOf(c).value, 4, "1 Sand paid");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.reactions, 0, "the Reaction spent");
      // **THE TURN'S START ASKS UNMADE WOUND FIRST** (O-274, D-880): on the turn's fresh
      // Half-Actions, before the half lands. A yes pays 2 Sand and a Half-Action and erases half
      // of 3, rounded down: 1 never arrives, 2 does.
      const posted = untilHook("createChatMessage", 60000, m => m.flags?.["azeroth-rpg"]?.featureKey === "unmade-wound");
      // **ANSWERED WHILE THE TURN IS STILL MOVING** (the live fix): on the active GM's client
      // core fires `combatTurnChange` only after it has AWAITED the turn's events
      // (14.367 `Combat#_manageTurnEvents`), and the turn's start awaits this ask - so a test
      // that awaited `turnForward` first found the dialog already closed as *no* by its own timer.
      const forward = turnForward(combat, c);
      await answer(c, "yes", 60000);
      await forward;
      const [unmadeCard] = await posted;
      made.push(unmadeCard);
      await until(() => !deferred(c).length, "the rest landed at the turn's start");
      assert.equal(health(c), was - 7, "half of the 3 put off never arrived; the other 2 landed");
      assert.equal(sandOf(c).value, 2, "2 Sand paid for Unmade Wound");
      await until(() => combat.getCombatantsByActor(c)[0].budget.halfActions === 1, "one of the turn's two Half-Actions spent");
      // A blow put off ON the Guardian's own turn (its Reaction back with the turn), so the
      // turn's other Half-Action reaches it from the sheet before the next turn's start.
      await setSand(c, 5);
      const second = c.applyDamage(12, { struck: true, attack: true, messageId: "ZZBorrowCard2" });
      await answer(c, "yes");
      await second;
      assert.deepEqual(deferred(c).map(r => r.amount), [5]);
      const { card } = await pressUse(c, "Unmade Wound");
      assert.ok(await card, "the Use's card");
      await until(() => deferred(c)[0]?.amount === 3, "half of 5, rounded down, never arrives");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.halfActions, 0, "the turn's second Half-Action spent");
    });

    it("BORROWED TIME is not asked of a blow temporary Health takes whole (D-880)", async function () {
      this.timeout(240000);
      const c = await guardianWith("ZZ GT Borrow Temp", { ranks: { "Borrowed Time": 1 } });
      const b = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await setSand(c, 5);
      await giveTurn(combat, b);
      await c.grantTemporaryHealth(10, { source: "ZZ test" });
      await until(() => (c.system.health.temp ?? 0) === 10, "10 temporary Health");
      const was = health(c);
      await c.applyDamage(6, { struck: true, attack: true, messageId: "ZZBorrowTemp" });
      assert.isFalse([...foundry.applications.instances.values()].some(a => String(a.id ?? "").startsWith(`azeroth-blow-ask-${c.id}`)), "no ask opened");
      assert.equal(health(c), was, "the Health untouched");
      assert.equal(c.system.health.temp, 4, "temporary Health took it");
      assert.equal(sandOf(c).value, 5, "no Sand spent");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.reactions, 1, "no Reaction spent");
    });

    it("INTERPOSED MOMENT swaps places with an ally attacked within 10 feet and takes the attack, for 2 Sand and the Reaction", async function () {
      this.timeout(240000);
      const c = await guardianWith("ZZ GT Interpose", { ranks: { "Interposed Moment": 1 }, sand: 4 });
      const ally = await makeCharacter({ name: "ZZ GT Ward", classes: [["Warrior", 3]] });
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      await ally.update({ "system.health.value": ally.system.health.max });
      const at = { c: { x: tokenOf(c).document.x, y: tokenOf(c).document.y }, a: { x: tokenOf(ally).document.x, y: tokenOf(ally).document.y } };
      const wasC = health(c);
      const wasA = health(ally);
      const blow = ally.applyDamage(6, { struck: true, attack: true, messageId: "ZZInterposedCard" });
      await answer(c, "yes");
      await blow;
      assert.equal(health(ally), wasA, "the ally takes none of it");
      assert.equal(health(c), wasC - 6, "the Guardian takes the attack");
      assert.equal(sandOf(c).value, 2, "2 Sand paid");
      await until(() => tokenOf(c).document.x === at.a.x && tokenOf(ally).document.x === at.c.x, "the two swapped places");
      const swap = game.messages.contents.findLast(m => m.flags?.["azeroth-rpg"]?.featureKey === "interposed-moment");
      assert.ok(swap?.flags["azeroth-rpg"].steps?.length === 2, "the swap recorded for its animation");
    });

    it("WEATHERED BY AGES raises Fortitude by 2 per rank", async function () {
      this.timeout(120000);
      const c = await guardianWith("ZZ GT Weathered");
      const base = c.system.health.max;
      await talentNamed(c, "Weathered by Ages").update({ "system.taken": 2 });
      await until(() => c.system.health.max === base + 4, "4 more Health");
    });

    it("BORROWED HOUR holds the Guardian at 1 once per Long Rest and puts the rest of the blow off to its turn", async function () {
      this.timeout(240000);
      const c = await guardianWith("ZZ GT Hour", { ranks: { "Borrowed Hour": 1 } });
      const b = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await giveTurn(combat, b);
      await c.update({ "system.health.value": 5 });
      await c.applyDamage(12, { struck: true, attack: true, messageId: "ZZHourCard" });
      assert.equal(health(c), 1, "held at 1");
      assert.deepEqual(deferred(c).map(r => [r.amount, r.source]), [[8, "Borrowed Hour"]], "the rest put off");
      assert.equal(featureNamed(c, "Borrowed Hour").system.uses.value, 0, "the use struck");
      await c.unsetFlag("azeroth-rpg", DEFERRED_FLAG);
      await c.update({ "system.health.value": 5 });
      await c.applyDamage(12, { struck: true, attack: true, messageId: "ZZHourCard2" });
      assert.equal(health(c), 0, "no use left: it falls");
    });

    it("DISTORTION FIELD lays one Region attached to the Guardian's token, Difficult ground for its enemies, 15 feet past it at rank 2", async function () {
      this.timeout(180000);
      const c = await guardianWith("ZZ GT Field", { ranks: { "Distortion Field": 2 } });
      const scene = await sceneWith([{ actor: c, x: 800, y: 1000 }]);
      const region = await until(() => scene.regions.find(r => r.flags?.["azeroth-rpg"]?.[FIELD_FLAG]?.token === tokenOf(c).id), "the field's Region");
      assert.equal(region._source.attachment.token, tokenOf(c).id, "attached to the token");
      assert.equal(region.shapes[0].radius, 17.5 * 20, "15 feet past a Medium token's edge, in pixels");
      const ground = region.behaviors.find(bh => bh.type === DIFFICULT_BEHAVIOR);
      assert.equal(ground?.system?.who, "enemy");
      assert.equal(ground?.system?.caster, c.uuid);
      await talentNamed(c, "Distortion Field").update({ "system.taken": 0 });
      await until(() => !scene.regions.some(r => r.flags?.["azeroth-rpg"]?.[FIELD_FLAG]), "the field taken off with the talent");
    });

    it("TIMELESS SENTINEL draws every attack on an ally within 30 feet to the Guardian, asked of nobody, with Borrowed Time free on the blow", async function () {
      this.timeout(300000);
      const c = await guardianWith("ZZ GT Sentinel", { ranks: { "Borrowed Hour": 1, "Timeless Sentinel": 1 }, sand: 6 });
      const ally = await makeCharacter({ name: "ZZ GT Sentinel Ward", classes: [["Warrior", 3]] });
      const b = await makeNpc("Bandit");
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1300, y: 1000 }, { actor: b, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, ally, b]);
      await giveTurn(combat, c);
      const { card } = await pressUse(c, "Timeless Sentinel");
      assert.ok(await card, "the Use's card");
      await until(() => c.effects.find(e => e.flags?.["azeroth-rpg"]?.[SENTINEL_FLAG]), "the Sentinel's effect");
      assert.equal(sandOf(c).value, 1, "5 Sand paid");
      await giveTurn(combat, b);
      const wasC = health(c);
      const wasA = health(ally);
      const blow = ally.applyDamage(6, { struck: true, attack: true, messageId: "ZZSentinelCard" });
      // The move asks nobody; the Guardian is asked only about Borrowed Time, free.
      await answer(c, "yes");
      await blow;
      assert.equal(health(ally), wasA, "the ally takes none of it");
      assert.equal(health(c), wasC - 3, "half now");
      assert.deepEqual(deferred(c).map(r => r.amount), [3], "the other half put off (rank 0: Borrowed Time is not taken)");
      assert.equal(sandOf(c).value, 1, "no Sand spent on Borrowed Time");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.reactions, 1, "no Reaction spent");
    });
  });
}
