/**
 * WHAT AN AREA DOES TO WHO MOVES THROUGH IT AND STANDS IN IT (D-757; the lead's
 * play-test, 2026-09-25), inside a live world.
 *
 * The pure rules have their Vitests - `area-ground.test.mjs` holds every
 * Difficult-ground sentence in 07 to its descriptor, `area-ticks.test.mjs` the
 * entering clauses, the Tests and the riders, `movement.test.mjs` the cost of
 * a foot. What none of them can reach is core's own movement on a prepared
 * world: a Region behavior laid by the GM's reconciler and read by core's path
 * planner, a turn's budget charged at core's measured cost, a token walking
 * into Rain of Fire, a Resist card posted at a turn and pressed, a rider laid
 * by the aura door and lifted when its creature walks out, and an attacker's
 * card answering a blow on an Immolating caster.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15): a turn's work runs on
 * the active GM's client after the update that moved the turn, a Region's
 * behavior arrives off a queued pass, and a token's document position is
 * interpolated while it travels (D-669).
 */

import {
  cleanup, drainAreaWork, errorsDuring, fromPack, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings
} from "./fixtures.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
import { pixelsPerFoot, placeArea } from "../canvas/regions.mjs";
import { reconcileGround, sweepAreas } from "../canvas/sustained-areas.mjs";
import { AzerothTerrainData, DifficultForBehaviorType, movementFactsOf } from "../canvas/behaviors.mjs";
import { AREAS_ENTERED_HOOK, areaDamageOn } from "../effects/area-strikes.mjs";
import { IGNORES_GROUND_FLAG } from "../rules/area-ground.mjs";
import { SWIM_ACTION, paceFor } from "../rules/movement.mjs";
import { DIFFICULT_BEHAVIOR } from "../rules/area-ground.mjs";
import { auraBanesOn } from "../rules/auras.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
import { ROLL_DIALOG_SETTING, MOVEMENT_LIMIT_SETTING } from "../settings.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const health = actor => actor.system.health.value;
const tokenOf = actor => actor.getActiveTokens(true)[0]?.document ?? null;
const placeable = actor => actor.getActiveTokens(true)[0] ?? null;

/** Every Power pool at its cap: a cast and a Sustain pay first (07 §8, 05 §12). */
async function fillMana(actor) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
}

/** A creature's Power, filled past anything these casts cost: its pool names no type (D-637). */
async function fillPower(npc, value = 60) {
  await npc.update({ "system.power.max": value, "system.power.value": value });
  await until(() => npc.system.power.value === value, `${npc.name}'s Power`);
}

/**
 * Tokens for these actors on the batch's scene, linked, at a disposition.
 * Core makes every token HOSTILE by default (14.367), so a test that means
 * *friendly* says so. A square is five feet: 100 px.
 */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y, disposition = "FRIENDLY" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS[disposition] })).toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => p.actor.getActiveTokens(true).length), "every token drawn");
  await settle();
  return tokens;
}

/** A started fight over these actors' tokens, its first turn's events over (D-627). */
async function fightOver(scene, actors) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = tokenOf(a);
    return { actorId: a.id, tokenId: token?.id ?? null, sceneId: scene.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  return combat;
}

/** Move the turn on and wait for its work: `combatTurnChange` follows it. */
async function nextTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await settled;
}

/** A cast through the workflow, the Test pinned to succeed (or, with a face of 1, to fail). */
async function cast(actor, spell, targets = [], face = 18) {
  const unpin = pinDie(face);
  try {
    return await game.system.azeroth.workflows.castSpell({ actor, spell, dc: 5, targets });
  } finally {
    unpin();
  }
}

/** Cast a spell and place its area off the card, as the card's own door does. */
async function castAndPlace(scene, caster, spell, origin) {
  const card = await cast(caster, spell);
  if (!card) throw new Error(`${caster.name} could not cast ${spell.name}`);
  made.push(card);
  if (card.flags["azeroth-rpg"].success !== true) throw new Error(`${spell.name} did not go off`);
  const region = await placeArea({ item: spell, scene, origin, flags: regionFlagsFromCard(card, caster, spell), widenFt: card.flags["azeroth-rpg"].widen });
  if (!region) throw new Error(`no Region was placed for ${spell.name}`);
  return { card, region };
}

/** The Difficult-ground behaviors the reconciler laid on a Region. */
const groundOn = region => region.behaviors.filter(b => b.type === DIFFICULT_BEHAVIOR && b.getFlag("azeroth-rpg", "ground") === true);

/** What a walk between two top-left positions costs this token, through core's own planner. */
function walkCost(actor, from, to) {
  const token = placeable(actor);
  const path = token.createTerrainMovementPath([{ ...from, action: "walk" }, { ...to, action: "walk" }]);
  return token.measureMovementPath(path);
}

/** A card's button, off its rendered content, as the chat door reads it. */
function buttonOn(message, selector) {
  const doc = new DOMParser().parseFromString(message.content, "text/html");
  return doc.querySelector(selector);
}

/**
 * A card run through THIS SYSTEM'S render hook alone (`quench-phase12.mjs`'s
 * own shape): what every reader is shown once the hook has drawn the records.
 */
function renderedCard(message) {
  const ours = (Hooks.events.renderChatMessageHTML ?? []).find(h => String(h.fn).includes("data-resist-owner"));
  if (!ours) throw new Error("the system's chat render hook is not registered");
  const box = document.createElement("div");
  box.innerHTML = message.content;
  ours.fn(message, box);
  return box;
}

/** The next time the GM's client has judged what a move of this token entered (the area door's own hook). */
const entering = (token, predicate = () => true) =>
  untilHook(AREAS_ENTERED_HOOK, 15000, (doc, entered) => doc?.id === token.id && predicate(entered));

/** The areaTest cards posted since a message count, for one actor. */
const areaCards = (since, actor) => game.messages.contents.slice(since)
  .filter(m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === actor.uuid);

/** Core's scrolling status text off for a test that lands a condition (quench-phase12's reason). */
async function withoutScrollingText(fn) {
  const before = game.settings.get("core", "scrollingStatusText");
  await game.settings.set("core", "scrollingStatusText", false);
  try { return await fn(); } finally { await game.settings.set("core", "scrollingStatusText", before); }
}

/**
 * What is left on the board after a test: the fight - its movement history
 * cleared first, or core's own unawaited clear lands after the delete (the
 * movement batch's reason) - the tokens, then the areas nothing swept.
 */
async function clearBoard(scene, combat, tokens) {
  // A turn's work runs unawaited on this client after the update that began
  // it (D-627): a fight deleted under it answers a combatant's write with
  // *does not exist*, which is a page error however it is caught.
  await settle();
  await new Promise(r => setTimeout(r, 500));
  for (const token of tokens ?? []) {
    if (scene.tokens.has(token.id)) await token.clearMovementHistory?.().catch?.(() => {});
  }
  if (combat) await combat.delete().catch(() => {});
  canvas?.tokens?.releaseAll?.();
  const ids = (tokens ?? []).map(t => t.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids).catch(() => {});
  // The sweep's queue, drained TWICE: every pass queued before this has run,
  // and so has every pass the first drain's own deletions queued (a deleted
  // Region queues the leavers' sweep), so nothing of ours is writing to a
  // Region this test is about to delete.
  await sweepAreas();
  await sweepAreas();
  const left = scene.regions.map(r => r.id);
  if (left.length) await scene.deleteEmbeddedDocuments("Region", left).catch(() => {});
  await sweepAreas();
  // And whatever those deletions started - the leavers' sweep, an aura pass,
  // an arrival wait - runs out here, so no test leaves a pass to the next
  // (the full-suite fix of D-757).
  await drainAreaWork();
}

export function areasBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("What an area does to who moves through it and stands in it (D-757)", function () {
    let held = null;
    let wasViewing = null;
    let scene = null;

    before(async function () {
      this.timeout(60000);
      held = {
        dialog: game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING),
        limited: game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING)
      };
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Areas", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(180000);
      if (held) {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, held.dialog);
        await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, held.limited);
      }
      // FIGHTS FIRST, then the scene, then everything else (the reactions
      // batch's teardown, and its reason) - and every pass of ours that is owed
      // runs out BEFORE the scene goes (the full-suite fix of D-757).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- what core was given at init ------------------------------------ */

    it("registers the behavior, the terrain that takes the higher cost, and 05's price for a swim and a jump", function () {
      assert.equal(CONFIG.RegionBehavior.dataModels[DIFFICULT_BEHAVIOR], DifficultForBehaviorType, "the behavior subtype is not registered");
      assert.include(game.documentTypes?.RegionBehavior ?? [], DIFFICULT_BEHAVIOR, "system.json does not declare the subtype");
      assert.notEqual(game.i18n.localize(`TYPES.RegionBehavior.${DIFFICULT_BEHAVIOR}`), `TYPES.RegionBehavior.${DIFFICULT_BEHAVIOR}`, "the subtype has no label");
      assert.equal(CONFIG.Token.movement.TerrainData, AzerothTerrainData, "core's terrain still multiplies");
      // Two Difficult grounds on one space: the higher, never the product (the lead).
      const both = AzerothTerrainData.resolveTerrainEffects([{ name: "difficulty", difficulty: 2 }, { name: "difficulty", difficulty: 2 }]);
      assert.equal(both.difficulty, 2, "overlapping Difficult ground multiplied");
      assert.isNull(AzerothTerrainData.resolveTerrainEffects([]), "plain ground came back as terrain");
      // 05: a swim costs two feet a foot and a jump one, whatever core ships.
      const walker = { actor: null };
      const swim = CONFIG.Token.movement.actions.swim.getCostFunction(walker);
      const jump = CONFIG.Token.movement.actions.jump.getCostFunction(walker);
      assert.equal(swim(10, null, null, 10), 20, "a swim did not cost two feet a foot");
      assert.equal(jump(10, null, null, 10), 10, "a jump cost more than a foot a foot");
      // And a swim through Difficult water pays the higher, never both.
      assert.equal(swim(20, null, null, 10), 20, "a swim through Difficult ground paid twice over");
    });

    /* ---- 07's Difficult ground on a placed area -------------------------- */

    it("lays one Difficult-ground behavior on Blizzard's area, charges two feet a foot inside it, takes the higher where two overlap, and lets a Firewalker walk it", async function () {
      this.timeout(300000);
      const blizzard = await fromPack("azeroth-rpg.spells", "Blizzard");
      const firewalk = await fromPack("azeroth-rpg.spells", "Firewalk");
      assert.isTrue(blizzard.system.areaGround?.difficult, "the spells pack does not carry Blizzard's ground: rebuild it from packs-src");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Ground Sorceress" });
      const second = await makeNpc("Sorceress");
      await second.update({ name: "ZZ Second Sorceress" });
      await fillPower(mage);
      await fillPower(second);
      const walker = await makeCharacter({ name: "ZZ Ground Walker", classes: [["Warrior", 3]] });
      const walkerTwo = await makeCharacter({ name: "ZZ Fire Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: second, x: 200, y: 400, disposition: "HOSTILE" },
        { actor: walker, x: 1000, y: 1100 },
        { actor: walkerTwo, x: 1000, y: 1000 }
      ]);
      try {
        const { region } = await castAndPlace(scene, mage, blizzard, { x: 1100, y: 1100 });
        const [laid] = await until(() => groundOn(region).length === 1 && groundOn(region), "the reconciler's behavior on Blizzard's area");
        assert.equal(laid.system.who, "creature", "Blizzard's ground does not slow every creature");
        assert.equal(laid.system.difficulties.walk, 2);
        // IDEMPOTENT: a second pass over an unchanged world writes nothing.
        assert.equal(await reconcileGround({ scenes: [scene] }), 0, "a second reconcile wrote the Region again");
        assert.lengthOf(groundOn(region), 1, "the reconcile laid a second behavior");

        // Two squares east, both inside: ten feet at two feet a foot.
        const inside = walkCost(walker, { x: 1000, y: 1100 }, { x: 1200, y: 1100 });
        assert.equal(inside.distance, 10);
        assert.equal(inside.cost, 20, "a walk through Blizzard did not cost two feet a foot");
        // The same walk outside the area costs a foot a foot.
        const outside = walkCost(walker, { x: 2400, y: 1100 }, { x: 2600, y: 1100 });
        assert.equal(outside.cost, outside.distance, "plain ground charged extra");

        // A SECOND Blizzard over the same ground: the higher cost, never four.
        const { region: over } = await castAndPlace(scene, second, blizzard, { x: 1100, y: 1100 });
        await until(() => groundOn(over).length === 1, "the second area's behavior");
        assert.equal(walkCost(walker, { x: 1000, y: 1100 }, { x: 1200, y: 1100 }).cost, 20, "two overlapping Blizzards multiplied");

        // FIREWALK: *you ignore Difficult ground from every source*, laid off
        // its own card and read by the terrain door.
        const fireCard = await cast(mage, firewalk);
        made.push(fireCard);
        assert.isTrue(fireCard.flags["azeroth-rpg"].areaGround?.ignores, "Firewalk's card does not carry the ignoring");
        const apply = buttonOn(fireCard, '[data-action="applySpellEffect"]');
        assert.ok(apply, "Firewalk's card offers no Apply");
        await CARD_ACTIONS.applySpellEffect(apply, fireCard);
        await until(() => mage.effects.some(e => e.getFlag("azeroth-rpg", IGNORES_GROUND_FLAG) === true), "Firewalk laid with the ignoring flag");
        assert.isTrue(movementFactsOf(mage).ignoresGround, "the terrain door does not read the laid Firewalk");
        // The Firewalker crosses the same two squares at a foot a foot.
        const walked = walkCost(mage, { x: 1000, y: 1100 }, { x: 1200, y: 1100 });
        assert.equal(walked.cost, walked.distance, "a Firewalker paid for Difficult ground");
        // Another creature on the same squares still pays.
        assert.equal(walkCost(walkerTwo, { x: 1000, y: 1000 }, { x: 1200, y: 1000 }).cost, 20);

        // The Sustain ends: the area and its behavior go.
        await game.system.azeroth.workflows.endAllSustains({ actor: mage });
        await until(() => !scene.regions.has(region.id), "the first Blizzard going with its Sustain");
        await game.system.azeroth.workflows.endAllSustains({ actor: second });
        await until(() => !scene.regions.has(over.id), "the second Blizzard going with its Sustain");
      } finally {
        await clearBoard(scene, null, tokens);
      }
    });

    it("lays Consecrated Ground's ground on an undead enemy alone, and takes it off when the talent is given back", async function () {
      this.timeout(300000);
      const paladin = await makeCharacter({ name: "ZZ Ground Paladin", classes: [["Paladin", 5]] });
      const talent = await until(() => paladin.items.find(i => i.type === "talent" && i.name === "Consecrated Ground"), "the Paladin's talents granted");
      await talent.update({ "system.taken": 1 });
      const spell = await until(() => paladin.items.find(i => i.type === "spell" && i.name === "Consecration"), "the talent teaching Consecration");
      await fillMana(paladin);
      const ghoul = await makeNpc("Plagued Ghoul");
      const bandit = await makeNpc("Bandit");
      const tokens = await place(scene, [
        { actor: paladin, x: 1000, y: 1000 },
        { actor: ghoul, x: 1100, y: 1000, disposition: "HOSTILE" },
        { actor: bandit, x: 1000, y: 1100, disposition: "HOSTILE" }
      ]);
      try {
        const { region } = await castAndPlace(scene, paladin, spell, { x: 1100, y: 1100 });
        const [laid] = await until(() => groundOn(region).length === 1 && groundOn(region), "Consecrated Ground's behavior");
        assert.equal(laid.system.who, "enemy");
        assert.sameMembers([...laid.system.kinds], ["undead", "fel"]);
        assert.equal(laid.system.caster, paladin.uuid);
        // An undead enemy pays two feet a foot; a living enemy and the Paladin one.
        assert.equal(walkCost(ghoul, { x: 1100, y: 1000 }, { x: 1100, y: 1200 }).cost, 20, "the ghoul was not slowed");
        const banditWalk = walkCost(bandit, { x: 1000, y: 1100 }, { x: 1000, y: 1300 });
        assert.equal(banditWalk.cost, banditWalk.distance, "a living bandit was slowed");
        const paladinWalk = walkCost(paladin, { x: 1000, y: 1000 }, { x: 1200, y: 1000 });
        assert.equal(paladinWalk.cost, paladinWalk.distance, "the Paladin was slowed by their own ground");

        // The talent given back takes its ground off the area on the GM's
        // client - its GROUND, and never the area itself.
        await talent.update({ "system.taken": 0 });
        await until(() => groundOn(region).length === 0 || !scene.regions.has(region.id), "the ground withdrawn with the talent");
        assert.isTrue(scene.regions.has(region.id), "giving back the talent took the whole Consecration, not its ground");
        assert.lengthOf(groundOn(region), 0, "the ground stood after the talent was given back");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: paladin }).catch(() => {});
        await clearBoard(scene, null, tokens);
      }
    });

    it("charges the turn two feet a foot through Difficult ground, off core's measured cost", async function () {
      this.timeout(300000);
      const blizzard = await fromPack("azeroth-rpg.spells", "Blizzard");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Budget Sorceress" });
      await fillPower(mage);
      const mover = await makeCharacter({ name: "ZZ Budget Walker", classes: [["Warrior", 3]] });
      assert.equal(mover.system.speed, 30, "the fixture's Speed is not 30");
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: mover, x: 800, y: 1100 }
      ]);
      let combat = null;
      try {
        const { region } = await castAndPlace(scene, mage, blizzard, { x: 1100, y: 1100 });
        await until(() => groundOn(region).length === 1, "Blizzard's behavior");
        combat = await fightOver(scene, [mover]);
        const combatant = combat.combatants.find(c => c.actorId === mover.id);
        assert.equal(combat.combatant?.id, combatant.id, "the fight did not open on the mover's turn");
        await until(() => combatant.budget.halfActions === 2, "the mover's two Half-Actions");
        // Twenty feet inside the area is forty feet of movement: past one
        // Half-Action's thirty, so the turn pays two.
        const token = tokenOf(mover);
        const moved = await token.move({ x: 1200, y: 1100 });
        assert.isTrue(moved, "a forty-foot move was refused on two Half-Actions");
        await until(() => token.x === 1200, "the move to land", 10000);
        await until(() => combatant.getFlag("azeroth-rpg", "moveHalves") === 2, "the turn charged two Half-Actions for the walk");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- entering, and the Tests ----------------------------------------- */

    it("strikes a creature entering Rain of Fire once a turn, and not again when it walks out and back", async function () {
      this.timeout(300000);
      const rain = await fromPack("azeroth-rpg.spells", "Rain of Fire");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Raining Sorceress" });
      await fillPower(mage);
      const mover = await makeCharacter({ name: "ZZ Rain Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: mover, x: 500, y: 1100 }
      ]);
      let combat = null;
      try {
        const { card, region } = await castAndPlace(scene, mage, rain, { x: 1100, y: 1100 });
        assert.isFalse(tokenOf(mover).testInsideRegion(region), "the walker starts inside the rain");
        // A TWIN of the same cast, laid by another hand where the card would
        // refuse it: one spell is one area to a creature walking into both
        // (the final review of D-757), so every count below stays one.
        const twin = await placeArea({ item: rain, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(card, mage, rain) });
        assert.ok(twin, "no twin Region was laid");
        assert.equal(twin.getFlag("azeroth-rpg", "cast"), region.getFlag("azeroth-rpg", "cast"));
        combat = await fightOver(scene, [mover]);
        const token = tokenOf(mover);
        const full = health(mover);
        const expected = areaDamageOn({ actor: mover, caster: mage, spell: region.getFlag("azeroth-rpg", "spell"), damage: { rating: 2, school: "fire" } }).damage;
        assert.isAbove(expected, 0, "the walker's Ward takes all of the rain, so this proves nothing");
        const since = game.messages.size;
        // In: fifteen feet east, into the area - and into its twin, as ONE area.
        const judgedIn = entering(token, entered => entered > 0);
        assert.isTrue(await token.move({ x: 800, y: 1100 }), "the walk into the rain was refused");
        const [, areasIn] = await judgedIn;
        assert.equal(areasIn, 1, "one cast's two Regions were entered as two areas");
        await until(() => token.x === 800, "the walk in to land", 10000);
        await until(() => health(mover) === full - expected, "the rain striking the walker on the way in");
        // The line is posted after the blow lands: wait for exactly it.
        await until(() => game.messages.contents.slice(since).some(m => m.flags?.["azeroth-rpg"]?.kind === "tick"
          && m.content.includes("Rain of Fire") && m.content.includes(mover.name)), "the entry's card line");
        // Out and back in, the same turn: *the first time it enters the area on a turn*.
        assert.isTrue(await token.move({ x: 500, y: 1100 }), "the walk out was refused");
        await until(() => token.x === 500, "the walk out to land", 10000);
        // WAIT FOR EXACTLY WHAT IS ASSERTED (CLAUDE.md §15): the GM's client
        // has judged the walk back in and found it entered the rain - so any
        // strike it was going to make has been decided - never a guessed delay.
        const judged = entering(token, entered => entered > 0);
        assert.isTrue(await token.move({ x: 800, y: 1100 }), "the walk back in was refused");
        await judged;
        await until(() => token.x === 800, "the walk back to land", 10000);
        assert.equal(health(mover), full - expected, "the rain struck twice on one turn");
        const turnKey = `${combat.id}.${combat.round}.${combat.turn}`;
        assert.isTrue([region, twin].some(r => r.getFlag("azeroth-rpg", "entered")?.[token.id] === turnKey), "the area does not remember the turn it was entered on");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    it("posts Thornguard's Test on the creature's own Resist card at its turn, and a failure lands the damage and Entangled", async function () {
      this.timeout(300000);
      const thornguard = await fromPack("azeroth-rpg.spells", "Thornguard");
      const druid = await makeNpc("Sorceress");
      await druid.update({ name: "ZZ Thorn Sorceress" });
      await fillPower(druid);
      const victim = await makeCharacter({ name: "ZZ Thorned Ally", classes: [["Warrior", 3]], abilities: { dex: 20 } });
      const tokens = await place(scene, [
        { actor: druid, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: victim, x: 1000, y: 1100 }
      ]);
      let combat = null;
      try {
        await withoutScrollingText(async () => {
          const { card, region } = await castAndPlace(scene, druid, thornguard, { x: 1100, y: 1100 });
          // The area carries the spell: no Apply on the card (D-757).
          assert.notInclude(card.content, 'data-action="applySpellEffect"', "Thornguard's card offers an Apply the area carries");
          assert.isTrue(tokenOf(victim).testInsideRegion(region));
          const full = health(victim);
          const since = game.messages.size;
          combat = await fightOver(scene, [victim, druid]);
          assert.equal(combat.combatant?.actorId, victim.id, "the ally does not lead the fight");
          const [posted] = await until(() => areaCards(since, victim).length && areaCards(since, victim), "the ally's Thornguard Test card");
          made.push(posted);
          // The base clause is a Test: nothing lands until it is rolled.
          assert.equal(health(victim), full, "Thornguard struck before its Test was made");
          const button = buttonOn(posted, '[data-action="resistTest"][data-purpose="area"]');
          assert.ok(button, "the card carries no area Resist button");
          assert.equal(button.dataset.resilience, "reflex");
          assert.equal(button.dataset.actorUuid, victim.uuid);
          assert.equal(button.dataset.against, "entangled", "the card does not say what the Test resists");
          const expected = areaDamageOn({ actor: victim, caster: druid, spell: region.getFlag("azeroth-rpg", "spell"), damage: { rating: 4, school: "nature" } }).damage;
          const unpin = pinDie(1);
          try {
            await CARD_ACTIONS.resistTest(button, posted);
          } finally {
            unpin();
          }
          await until(() => victim.statuses.has("entangled"), "Entangled landed off the failure");
          await until(() => health(victim) === full - expected, "the failure's 4 Nature damage");

          // **THE TEST IS MADE ONCE** (the final review of D-757): the card
          // records it, every reader sees what it came to in place of the
          // button, and a second press is refused in words and lands nothing.
          const record = await until(() => posted.getFlag("azeroth-rpg", "areaResult"), "the Test recorded on the area's card");
          assert.isFalse(record.success, "a natural 1 recorded a success");
          assert.equal(record.name, victim.name);
          const drawn = renderedCard(posted);
          assert.isNull(drawn.querySelector('[data-action="resistTest"][data-purpose="area"]'), "the recorded card still offers its Test");
          const said = game.i18n.format("AZEROTH.Card.ResistOutcome", {
            name: victim.name, outcome: game.i18n.localize("AZEROTH.Roll.Outcome.Failure"), total: record.total, dc: record.dc
          });
          assert.include(drawn.querySelector(".azeroth-card-resisted")?.textContent ?? "", said, "the card does not say what the Test came to");
          const before = game.messages.size;
          const refused = await warnings(() => CARD_ACTIONS.resistTest(button, posted));
          assert.include(refused.join(" "), game.i18n.format("AZEROTH.AreaTest.Already", {
            name: victim.name, outcome: game.i18n.localize("AZEROTH.Roll.Outcome.Failure"), total: record.total, dc: record.dc
          }), "a second press was not refused in words");
          assert.equal(game.messages.size, before, "a second press rolled another Test");
          assert.equal(health(victim), full - expected, "a second press landed the damage again");
        });
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: druid }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    it("holds Blackout's Blinded until the creature leaves the area, and spares the caster the Test", async function () {
      this.timeout(300000);
      const blackout = await fromPack("azeroth-rpg.spells", "Blackout");
      const priest = await makeNpc("Sorceress");
      await priest.update({ name: "ZZ Dark Sorceress" });
      await fillPower(priest);
      const victim = await makeCharacter({ name: "ZZ Darkened Ally", classes: [["Warrior", 3]], abilities: { dex: 20 } });
      // A 60 ft radius at (1600, 1200) is 1200 px every way: the ally stands
      // just inside its western edge, fifteen feet from the way out.
      const tokens = await place(scene, [
        { actor: priest, x: 1700, y: 1200, disposition: "HOSTILE" },
        { actor: victim, x: 400, y: 1200 }
      ]);
      let combat = null;
      try {
        await withoutScrollingText(async () => {
          const { region } = await castAndPlace(scene, priest, blackout, { x: 1600, y: 1200 });
          assert.isTrue(tokenOf(priest).testInsideRegion(region) && tokenOf(victim).testInsideRegion(region));
          const since = game.messages.size;
          combat = await fightOver(scene, [victim, priest]);
          assert.equal(combat.combatant?.actorId, victim.id, "the ally does not lead the fight");
          const [posted] = await until(() => areaCards(since, victim).length && areaCards(since, victim), "the ally's Blackout Test card");
          made.push(posted);
          const unpin = pinDie(1);
          try {
            await CARD_ACTIONS.resistTest(buttonOn(posted, '[data-action="resistTest"][data-purpose="area"]'), posted);
          } finally {
            unpin();
          }
          const blinded = await until(() => victim.effects.find(e => e.statuses?.has("blinded")), "Blinded landed");
          assert.deepEqual(blinded.getFlag("azeroth-rpg", "leaves"), { sceneId: scene.id, regionId: region.id }, "Blinded does not name the area it lasts in");
          // The ally walks out on its own turn: Blinded goes with the area.
          const token = tokenOf(victim);
          assert.isTrue(await token.move({ x: 100, y: 1200 }), "the walk out of the dark was refused");
          await until(() => token.x === 100 && !token.testInsideRegion(region), "the ally out of the area", 10000);
          await until(() => !victim.statuses.has("blinded"), "Blinded lifted when the ally left");
          // *You ... see through it normally*: the caster's turn posts no Test.
          await nextTurn(combat);
          assert.equal(combat.combatant?.actorId, priest.id);
          await settle();
          assert.lengthOf(areaCards(since, priest), 0, "the caster made a Test in their own Blackout");
        });
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: priest }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- what an area lays while a creature remains ---------------------- */

    it("lays Insect Swarm's Bane once a creature has started its turn inside, on the dialog's Attack line, and lifts it when it walks out", async function () {
      this.timeout(300000);
      const swarm = await fromPack("azeroth-rpg.spells", "Insect Swarm");
      const druid = await makeNpc("Sorceress");
      await druid.update({ name: "ZZ Swarm Sorceress" });
      await fillPower(druid);
      const victim = await makeCharacter({ name: "ZZ Stung Ally", classes: [["Warrior", 3]], abilities: { dex: 20 } });
      const tokens = await place(scene, [
        { actor: druid, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: victim, x: 1100, y: 1100 }
      ]);
      let combat = null;
      try {
        const { region } = await castAndPlace(scene, druid, swarm, { x: 1100, y: 1100 });
        assert.isTrue(tokenOf(victim).testInsideRegion(region));
        // Not yet: *while it remains there* begins with the turn that starts inside.
        await settle();
        assert.lengthOf(victim.system.auraBaneRows ?? [], 0, "the Bane stood before a turn started in the swarm");
        combat = await fightOver(scene, [victim]);
        const token = tokenOf(victim);
        await until(() => (region.getFlag("azeroth-rpg", "armed")?.[token.id] ?? []).includes("turn"), "the rider armed at the turn's start");
        await until(() => auraBanesOn(victim.system.auraBaneRows ?? [], "attack").banes === 1, "the swarm's Bane on the ally's Attack Tests");
        // The roll dialog raises it as a ticked line naming the swarm.
        const prepared = prepareRoll(victim, { kind: "attack", targets: [] });
        const line = prepared.situational.automatic.find(l => l.id === "auraBane");
        assert.ok(line, "the dialog raised no area Bane line");
        assert.isTrue(line.checked);
        assert.include(line.name ?? "", "Insect Swarm");
        // And nothing on a Skill Test: the swarm's Bane is on Attack Tests.
        assert.isUndefined(prepareRoll(victim, { kind: "skill", skill: "athletics", targets: [] }).situational.automatic.find(l => l.id === "auraBane"));
        // Out of the swarm, twenty feet on its own turn: the Bane goes, and the
        // arming with it. The fight stays: *a minute* is the fight's, and a
        // timed area ends with the fight it was placed in (D-756).
        assert.isTrue(await token.move({ x: 1500, y: 1100 }), "the walk out of the swarm was refused");
        await until(() => token.x === 1500 && !token.testInsideRegion(region), "the ally out of the swarm", 10000);
        await until(() => (victim.system.auraBaneRows ?? []).length === 0, "the swarm's Bane lifted when the ally left");
        await until(() => !(region.getFlag("azeroth-rpg", "armed")?.[token.id]), "the arming cleared when the ally left");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("halves the healing a creature receives inside Graveblight, and gives it back whole outside", async function () {
      this.timeout(300000);
      const graveblight = await fromPack("azeroth-rpg.spells", "Graveblight");
      const warlock = await makeNpc("Sorceress");
      await warlock.update({ name: "ZZ Blight Sorceress" });
      await fillPower(warlock);
      const victim = await makeCharacter({ name: "ZZ Blighted Ally", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: warlock, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: victim, x: 1100, y: 1100 }
      ]);
      try {
        await castAndPlace(scene, warlock, graveblight, { x: 1100, y: 1100 });
        await until(() => victim.system.healingHalved === true, "Graveblight's halving on the ally");
        await victim.update({ "system.health.value": victim.system.health.max - 10 });
        const before = health(victim);
        await victim.applyHealing(6);
        assert.equal(health(victim), before + 3, "six Health inside Graveblight was not halved to three");
        // Out of the area, whole again.
        const token = tokenOf(victim);
        assert.isTrue(await token.move({ x: 1700, y: 1100 }), "the walk out of the blight was refused");
        await until(() => token.x === 1700, "the ally out of the blight", 10000);
        await until(() => victim.system.healingHalved === false, "the halving lifted when the ally left");
        const after = health(victim);
        await victim.applyHealing(6);
        assert.equal(health(victim), Math.min(victim.system.health.max, after + 6), "healing outside Graveblight was halved");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: warlock }).catch(() => {});
        await clearBoard(scene, null, tokens);
      }
    });

    it("grows Hoarfrost by five feet at the start of its caster's turn", async function () {
      this.timeout(300000);
      const hoarfrost = await fromPack("azeroth-rpg.spells", "Hoarfrost");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Frost Sorceress" });
      await fillPower(mage);
      const tokens = await place(scene, [{ actor: mage, x: 200, y: 200, disposition: "HOSTILE" }]);
      let combat = null;
      try {
        const { region } = await castAndPlace(scene, mage, hoarfrost, { x: 1100, y: 1100 });
        const radius = region.shapes[0].radius;
        assert.equal(radius, 20 * pixelsPerFoot(scene), "Hoarfrost did not go down at 20 feet");
        combat = await fightOver(scene, [mage]);
        await until(() => region.shapes[0].radius === radius + 5 * pixelsPerFoot(scene), "Hoarfrost grown at its caster's turn");
        await nextTurn(combat);
        await until(() => region.shapes[0].radius === radius + 10 * pixelsPerFoot(scene), "Hoarfrost grown again at the next");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- Immolation's answer to a blow ------------------------------------ */

    it("answers a melee hit on an Immolating caster on the attacker's card, and a thrown one not at all", async function () {
      this.timeout(300000);
      const immolation = await fromPack("azeroth-rpg.spells", "Immolation");
      const pyre = await makeNpc("Sorceress");
      await pyre.update({ name: "ZZ Burning Sorceress" });
      await fillPower(pyre);
      const striker = await makeCharacter({ name: "ZZ Burned Striker", classes: [["Warrior", 3]], weapons: ["Longsword", "Dagger"] });
      const tokens = await place(scene, [
        { actor: striker, x: 1000, y: 1000 },
        { actor: pyre, x: 1100, y: 1000, disposition: "HOSTILE" }
      ]);
      try {
        const card = await cast(pyre, immolation);
        made.push(card);
        assert.isTrue(card.flags["azeroth-rpg"].sustained, "Immolation wrote no Sustain");
        const entry = (pyre.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e.cast === card.flags["azeroth-rpg"].cast);
        assert.isTrue(entry?.areaTick?.retaliate, "the Sustain's tick does not answer a blow");
        const expected = areaDamageOn({ actor: striker, caster: pyre, spell: entry.tickSpell, damage: { rating: 2, school: "fire" } }).damage;

        const sword = striker.items.find(i => i.name === "Longsword");
        canvas.tokens.setTargets([tokenOf(pyre).id]);
        let blow = null;
        const unpin = pinDie(19);
        try {
          blow = await attackWithDialog(striker, sword);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
        }
        assert.ok(blow, "the swing posted no card");
        made.push(blow);
        assert.isTrue(blow.rolls[0].outcome.success, "a natural 19 missed; the board moved");
        assert.include(blow.content, "Immolation", "the card does not answer with Immolation");
        const back = buttonOn(blow, '.azeroth-card-struck-back [data-action="applyDamage"][data-self]');
        assert.ok(back, "the card offers no Take-back for Immolation");
        assert.equal(Number(back.dataset.damage), expected, "the Take-back is not the tick's own damage on the attacker");
        assert.equal(back.dataset.damageType, "fire", "the Take-back does not say it is Fire");
        // **A RETALIATION IS NO ATTACK** (the final review; S1's ruling): a mark
        // the striker holds against an attack - a Parry that meets every blow -
        // neither eats the fire nor is spent on it.
        await striker.setFlag("azeroth-rpg", "mitigate", { reaction: "parry", negate: true, name: "ZZ Standing Parry" });
        const full = health(striker);
        await CARD_ACTIONS.applyDamage(back, blow);
        await until(() => health(striker) === full - expected, "Immolation's damage landing on the attacker");
        assert.ok(striker.getFlag("azeroth-rpg", "mitigate"), "Immolation's answer spent a mark held against an attack");
        await striker.unsetFlag("azeroth-rpg", "mitigate");

        // A THROWN dagger is no melee attack: nothing answers it.
        const dagger = striker.items.find(i => i.name === "Dagger");
        canvas.tokens.setTargets([tokenOf(pyre).id]);
        let thrown = null;
        const again = pinDie(19);
        try {
          thrown = await attackWithDialog(striker, dagger, null, { mode: "thrown" });
        } finally {
          again();
          canvas.tokens.setTargets([]);
        }
        assert.ok(thrown, "the throw posted no card");
        made.push(thrown);
        assert.isTrue(thrown.rolls[0].outcome.success, "the throw missed; the board moved");
        assert.equal(thrown.flags["azeroth-rpg"].strike?.rangeKind, "thrown", "the throw was recorded as melee");
        assert.equal(blow.flags["azeroth-rpg"].strike?.rangeKind, "melee", "the swing was not recorded as melee");
        assert.notInclude(thrown.content, "Immolation", "a thrown blow was answered by Immolation");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: pyre }).catch(() => {});
        await clearBoard(scene, null, tokens);
      }
    });

    /* ---- the lead, 2026-09-26: a failed cast places nothing --------------- */

    it("draws neither Place area nor Resist on a failed cast and says it did not go off, and an old card's buttons refuse in words", async function () {
      this.timeout(120000);
      // THE LEAD, 2026-09-26: *a failed cast offers no Resist and no Place
      // area* (07 §8: *the spell does not go off*). Flamestrike carries both.
      const flamestrike = await fromPack("azeroth-rpg.spells", "Flamestrike");
      assert.ok(flamestrike.system.test?.resilience, "Flamestrike names no Resilience Test: this proves nothing about Resist");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Fizzling Sorceress" });
      await fillPower(mage);
      const failed = await cast(mage, flamestrike, [], 1);
      made.push(failed);
      assert.isFalse(failed.flags["azeroth-rpg"].success, "a natural 1 did not fail the Casting Test");
      assert.notInclude(failed.content, 'data-action="resistTest"', "a failed card offers a Resist");
      assert.notInclude(failed.content, 'data-action="placeArea"', "a failed card offers Place area");
      assert.include(failed.content, game.i18n.localize("AZEROTH.Card.DidNotGoOff"), "the failed card does not say the spell did not go off");
      // The record keeps the shape, for the animation layer's own refusal.
      assert.equal(failed.flags["azeroth-rpg"].area?.shape, "circle");
      // A success draws both: the same spell, the same card, the other verdict.
      const went = await cast(mage, flamestrike);
      made.push(went);
      assert.include(went.content, 'data-action="resistTest"', "a successful card lost its Resist");
      assert.include(went.content, 'data-action="placeArea"', "a successful card lost Place area");
      assert.notInclude(went.content, game.i18n.localize("AZEROTH.Card.DidNotGoOff"));

      // An OLD failed card's buttons - drawn before this - refuse in words.
      const before = scene.regions.size;
      const said = await warnings(() => CARD_ACTIONS.placeArea(null, failed));
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Area.FailedCast", { name: "Flamestrike" }), "the refusal was not said");
      assert.equal(scene.regions.size, before, "a failed Flamestrike placed an area");
      const button = document.createElement("button");
      Object.assign(button.dataset, { action: "resistTest", purpose: "spell", resilience: flamestrike.system.test.resilience, dc: "14" });
      const messages = game.messages.size;
      const resisted = await warnings(() => CARD_ACTIONS.resistTest(button, failed));
      assert.include(resisted.join(" "), game.i18n.format("AZEROTH.Card.ResistFailedCast", { name: "Flamestrike" }), "an old failed card's Resist was not refused in words");
      assert.equal(game.messages.size, messages, "an old failed card's Resist rolled a Test");
    });

    /* ---- the final review of D-757: a Speed held at 0 does not move ------- */

    it("refuses an Entangled or Prone creature's move on its own turn, on foot and with wings, and says why", async function () {
      this.timeout(300000);
      const walker = await makeCharacter({ name: "ZZ Netted Walker", classes: [["Warrior", 3]] });
      await walker.update({ "system.flyingSpeed": 120 });
      const tokens = await place(scene, [{ actor: walker, x: 500, y: 1500 }]);
      let combat = null;
      try {
        await withoutScrollingText(async () => {
          combat = await fightOver(scene, [walker]);
          const token = tokenOf(walker);
          const stopped = game.i18n.format("AZEROTH.Combat.MoveStopped", { name: walker.name });
          await walker.toggleStatusEffect("entangled", { active: true });
          await until(() => walker.system.speed === 0, "Entangled's Speed of 0");
          // A1: *Your Speed is 0.* It walked free until the review.
          let said = await warnings(async () => {
            assert.isFalse(await token.move({ x: 600, y: 1500 }), "an Entangled creature walked five feet");
          });
          assert.include(said.join(" "), stopped, "the refusal did not say the Speed is 0");
          said = await warnings(async () => {
            assert.isFalse(await token.move({ x: 600, y: 1500, action: "fly" }), "an Entangled creature flew out of the net");
          });
          assert.include(said.join(" "), stopped);
          await until(() => token.x === 500, "the netted creature to stay put", 4000);
          // Free of the net, it walks.
          await walker.toggleStatusEffect("entangled", { active: false });
          await until(() => walker.system.speed === 30, "the Speed back");
          assert.isTrue(await token.move({ x: 600, y: 1500 }), "a free creature could not walk five feet");
          await until(() => token.x === 600, "the free walk to land", 8000);
          // Prone holds it at 0 as well, until it Stands.
          await walker.toggleStatusEffect("prone", { active: true });
          await until(() => walker.system.speed === 0, "Prone's Speed of 0");
          said = await warnings(async () => {
            assert.isFalse(await token.move({ x: 700, y: 1500 }), "a Prone creature crawled off without Standing");
          });
          assert.include(said.join(" "), stopped);
        });
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("holds a Speed-10 creature in Hoarfrost where it stands once its turn starts there, and floors a Speed-5 one at 0, never below", async function () {
      this.timeout(300000);
      const hoarfrost = await fromPack("azeroth-rpg.spells", "Hoarfrost");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Frostbound Sorceress" });
      await fillPower(mage);
      const slow = await makeNpc("Plagued Ghoul");
      await slow.update({ name: "ZZ Speed Ten", "system.speed": 10 });
      const slower = await makeNpc("Plagued Ghoul");
      await slower.update({ name: "ZZ Speed Five", "system.speed": 5 });
      await until(() => slow.system.speed === 10 && slower.system.speed === 5, "the two Speeds");
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: slow, x: 1000, y: 1100, disposition: "HOSTILE" },
        { actor: slower, x: 1100, y: 1100, disposition: "HOSTILE" }
      ]);
      let combat = null;
      try {
        const { region } = await castAndPlace(scene, mage, hoarfrost, { x: 1100, y: 1100 });
        assert.isTrue(tokenOf(slow).testInsideRegion(region) && tokenOf(slower).testInsideRegion(region), "the two do not stand in the frost");
        combat = await fightOver(scene, [slow, slower]);
        for (let turn = 0; turn < 2; turn++) {
          if (turn) await nextTurn(combat);
          const actor = combat.combatant?.actor;
          assert.ok(actor === slow || actor === slower, "the fight is not on one of the two");
          // *Its Speed drops by 10 feet until it leaves*, once its turn has
          // started there: 10 becomes 0, and 5 becomes 0 rather than -5.
          await until(() => actor.system.speed === 0, `${actor.name}'s Speed at 0 in the frost`);
          const token = tokenOf(actor);
          const x = token.x;
          const said = await warnings(async () => {
            assert.isFalse(await token.move({ x: x + 100, y: token.y }), `${actor.name} walked out at Speed 0`);
          });
          assert.include(said.join(" "), game.i18n.format("AZEROTH.Combat.MoveStopped", { name: actor.name }));
          assert.equal(token.x, x);
        }
        assert.equal(slower.system.speed, 0, "the Speed-5 creature reads below 0");
        const sheet = await openSheet(slower);
        try {
          const label = game.i18n.localize("AZEROTH.Sheet.Speed");
          const dd = [...sheet.element.querySelectorAll(".azeroth-callout")]
            .find(c => c.querySelector("dt")?.textContent.trim() === label)?.querySelector("dd");
          assert.ok(dd, "the creature's banner draws no Speed");
          assert.match(dd.textContent.replace(/\s+/g, " ").trim(), /^0 ft\b/, "the sheet does not read 0 ft");
          assert.notInclude(dd.textContent, "-5");
        } finally {
          await sheet.close();
        }
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- the final review of D-757: a swimmer by nature pays a foot a foot - */

    it("swims a murloc and a crocolisk a foot a foot at their own pace, a Darkspear with Island Blood too, and a Warrior pays two", async function () {
      this.timeout(300000);
      const murloc = await makeNpc("Murloc");
      const croc = await makeNpc("Crocolisk");
      const troll = await makeCharacter({ name: "ZZ Island Swimmer", classes: [["Warrior", 3]], race: "Troll" });
      const blood = await until(() => troll.items.find(i => i.type === "talent" && i.name === "Island Blood"), "the troll's racial talents granted");
      await blood.update({ "system.taken": 1 });
      const warrior = await makeCharacter({ name: "ZZ Plain Swimmer", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: murloc, x: 400, y: 400, disposition: "HOSTILE" },
        { actor: croc, x: 400, y: 700, disposition: "HOSTILE" },
        { actor: troll, x: 400, y: 1000 },
        { actor: warrior, x: 400, y: 1300 }
      ]);
      try {
        const swimCost = (actor, y) => {
          const token = placeable(actor);
          const path = token.createTerrainMovementPath([{ x: 400, y, action: SWIM_ACTION }, { x: 600, y, action: SWIM_ACTION }]);
          return token.measureMovementPath(path);
        };
        // 14's *swims at its Speed* and *at twice its Speed*: a foot a foot.
        for (const [actor, y] of [[murloc, 400], [croc, 700]]) {
          const swum = swimCost(actor, y);
          assert.equal(swum.distance, 10);
          assert.equal(swum.cost, 10, `${actor.name} paid 05's two feet a foot to swim`);
        }
        // 02's Island Blood: *You swim at full Speed*.
        assert.isTrue(movementFactsOf(troll).swimsFree, "Island Blood reached no movement door");
        assert.equal(swimCost(troll, 1000).cost, 10, "a Darkspear with Island Blood paid double to swim");
        // Everybody else swims at two feet a foot (05 §10).
        assert.equal(swimCost(warrior, 1300).cost, 20, "a Warrior swam at a foot a foot");
        // And the pace each swims at: its Speed, or twice it.
        assert.equal(movementFactsOf(murloc).swims, 1);
        assert.equal(movementFactsOf(croc).swims, 2);
        assert.equal(paceFor({ speed: croc.system.speed, swims: movementFactsOf(croc).swims }, SWIM_ACTION), croc.system.speed * 2);
        assert.equal(croc.system.swimSpeed, croc.system.speed * 2, "the crocolisk's sheet swim speed disagrees with the pace");
        assert.equal(movementFactsOf(warrior).swims, 0);
      } finally {
        await clearBoard(scene, null, tokens);
      }
    });

    /* ---- the final review of D-757: the world's clock takes a timed area away -- */

    it("takes a timed area laid outside a fight away once the world's clock has run its minute, with no turn to judge it", async function () {
      this.timeout(180000);
      const swarm = await fromPack("azeroth-rpg.spells", "Insect Swarm");
      const druid = await makeNpc("Sorceress");
      await druid.update({ name: "ZZ Clockwork Sorceress" });
      await fillPower(druid);
      const tokens = await place(scene, [{ actor: druid, x: 200, y: 200, disposition: "HOSTILE" }]);
      try {
        const { region } = await castAndPlace(scene, druid, swarm, { x: 1100, y: 1100 });
        assert.equal(region.getFlag("azeroth-rpg", "lasts")?.rounds, 10, "*Instant, 1 minute* is not ten rounds");
        assert.isNull(region.getFlag("azeroth-rpg", "placedAt")?.combatId ?? null, "the swarm went down in a fight");
        // Half the minute: it stands.
        await game.time.advance(30);
        await sweepAreas();
        assert.isTrue(scene.regions.has(region.id), "the swarm went before its minute was out");
        // The rest of it: only the world's clock moved, and it takes the area.
        await game.time.advance(31);
        await until(() => !scene.regions.has(region.id), "the swarm taken away by the world's clock", 15000);
      } finally {
        await clearBoard(scene, null, tokens);
      }
    });

    /* ---- the final review of D-757: one area a cast, entered by a creature moving -- */

    it("places one area a cast: a second press while it stands is refused in words", async function () {
      this.timeout(180000);
      const blizzard = await fromPack("azeroth-rpg.spells", "Blizzard");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Twice Sorceress" });
      await fillPower(mage);
      const tokens = await place(scene, [{ actor: mage, x: 200, y: 200, disposition: "HOSTILE" }]);
      try {
        const { card, region } = await castAndPlace(scene, mage, blizzard, { x: 1100, y: 1100 });
        const before = scene.regions.size;
        const said = await warnings(async () => {
          assert.isNull(await CARD_ACTIONS.placeArea(null, card), "a second press placed a second area");
        });
        // Blizzard is SUSTAINED, so the refusal says taking it off ends the
        // Sustain rather than inviting the reader to (D-760).
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Area.AlreadyPlacedSustained", { name: "Blizzard" }), "the refusal was not said");
        assert.equal(scene.regions.size, before, "a second Region stands for one cast");
        assert.isTrue(scene.regions.has(region.id));
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, null, tokens);
      }
    });

    it("enters nothing by a displacement or an undo, and a walk in afterwards still strikes once", async function () {
      this.timeout(300000);
      const rain = await fromPack("azeroth-rpg.spells", "Rain of Fire");
      const mage = await makeNpc("Sorceress");
      await mage.update({ name: "ZZ Undone Sorceress" });
      await fillPower(mage);
      const mover = await makeCharacter({ name: "ZZ Displaced Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: mover, x: 500, y: 1100 }
      ]);
      let combat = null;
      try {
        const { region } = await castAndPlace(scene, mage, rain, { x: 1100, y: 1100 });
        combat = await fightOver(scene, [mover]);
        const token = tokenOf(mover);
        const full = health(mover);
        const expected = areaDamageOn({ actor: mover, caster: mage, spell: region.getFlag("azeroth-rpg", "spell"), damage: { rating: 2, school: "fire" } }).damage;
        assert.isAbove(expected, 0, "the walker's Ward takes all of the rain, so this proves nothing");

        // PUT inside by a GM's displacement: core's own word for no movement.
        let judged = entering(token);
        assert.isTrue(await token.move({ x: 800, y: 1100, action: "displace" }), "the displacement was refused");
        let [, entered] = await judged;
        assert.equal(entered, 0, "a displacement entered the rain");
        await until(() => token.x === 800 && token.testInsideRegion(region), "the token displaced into the rain", 8000);
        assert.equal(health(mover), full, "a displacement was struck by the rain");

        // Walked out, then the walk out UNDONE: back inside by an undo.
        judged = entering(token);
        assert.isTrue(await token.move({ x: 500, y: 1100 }), "the walk out was refused");
        await judged;
        await until(() => token.x === 500, "the walk out to land", 10000);
        const out = token.movement.id;
        judged = entering(token);
        assert.isTrue(await token.revertRecordedMovement(out), "the walk out could not be undone");
        [, entered] = await judged;
        assert.equal(entered, 0, "an undo entered the rain");
        await until(() => token.x === 800, "the undo to land", 8000);
        assert.equal(health(mover), full, "an undo into the rain was struck");

        // A creature WALKING in is struck, once: the displacement and the undo
        // claimed no first entry on this turn.
        judged = entering(token);
        assert.isTrue(await token.move({ x: 500, y: 1100 }), "the second walk out was refused");
        await judged;
        await until(() => token.x === 500, "the second walk out to land", 10000);
        judged = entering(token, n => n > 0);
        assert.isTrue(await token.move({ x: 800, y: 1100 }), "the walk in was refused");
        await judged;
        await until(() => health(mover) === full - expected, "the walk in struck by the rain");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: mage }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- the full-suite fix (2026-09-26): a deleted scene strands nothing -- */

    it("forgets a deleted scene's unlinked tokens in core's effect registry, so the world's clock asks the server about nothing that has gone", async function () {
      this.timeout(120000);
      const registry = foundry.documents.ActiveEffect.registry;
      const counted = id => [...registry].some(e => e.id === id);
      // A scene of its own, never viewed: the batch's scene is not the one deleted.
      const doomed = await Scene.create({ name: "ZZ Areas Doomed", width: 1000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(doomed);
      const ghoul = await makeNpc("Plagued Ghoul");
      const [token] = await doomed.createEmbeddedDocuments("Token", [(await ghoul.getTokenDocument({ x: 100, y: 100, actorLink: false })).toObject()]);
      assert.isFalse(token.actorLink, "the token is linked, so its actor outlives the scene and this proves nothing");
      // What a failed Resist against 07's Slow lays out of a fight - *Instant,
      // 1 minute* on the token's own actor (`effects/durations.mjs#spellTiming`),
      // the span the spell-effects batch left on two deleted scenes' Ghouls.
      const [slow] = await token.actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Doomed Slow", img: "icons/svg/downgrade.svg",
        duration: { value: 1, units: "minutes" }, start: { time: game.time.worldTime }
      }]);
      await until(() => counted(slow.id), "core counting the timed effect on the token's own actor");
      await drainAreaWork();
      await doomed.delete();
      made.splice(made.indexOf(doomed), 1);
      assert.isFalse(game.scenes.has(doomed.id), "the scene was not deleted");
      assert.isFalse(counted(slow.id), "core's registry still counts a timed effect of a deleted scene's token");
      // The world's clock runs past the minute. Core expires whatever it still
      // counts, and a delete naming a deleted scene is refused by the server in
      // an error notification - the page errors the full suite printed.
      const refused = await errorsDuring(async () => {
        const moved = untilHook("updateWorldTime", 15000);
        await game.time.advance(61);
        await moved;
        await drainAreaWork();
        await new Promise(r => setTimeout(r, 1000));
      });
      assert.deepEqual(refused, [], "the clock's expiry asked the server about a scene that has gone");
    });
  });
}
