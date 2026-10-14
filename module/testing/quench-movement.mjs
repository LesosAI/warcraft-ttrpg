/**
 * A TURN'S MOVEMENT, CHARGED ONCE AND READ BACK (D-761, D-762; the lead,
 * 2026-09-29: *Fix it in the system* and *Add a read-only door*), inside a
 * live world.
 *
 * The pure charge and the door's arithmetic have their Vitests
 * (`movement.test.mjs`: `chargeMoves`, `movesNeeded`, `movementLeft` held to
 * `movementAllowed` foot by foot, and the combatant's doors read off its
 * source). What none of them can reach is core's own movement on a prepared
 * world, where a write takes a round trip and a second write can be made while
 * the first is still landing:
 *
 * 1. a move's charge written ONCE - the budget and the Moves paid land in the
 *    same update - and a second ten feet charged against both: one Half-Action.
 *    The two-write charge landed the budget a round trip before the Moves paid,
 *    and a move made in between paid again. With one write that moment no
 *    longer exists, so this test states the one-write invariant directly (the
 *    first update carrying the spent Half-Action carries the Move) and is the
 *    two-write charge's regression test, not a test of the queue;
 * 2. the same for the limit: a legal forty feet made once the first charge's one
 *    write has landed is judged against the whole turn and let through, where
 *    the half-written turn refused it;
 * 3. **THE QUEUE'S OWN TEST**: a Half-Action spent while a move's charge is
 *    still landing is spent off what the charge left, not lost with what it
 *    replaced - which fails if either write stops waiting its turn;
 * 3a. a budget write that never answers - a request whose acknowledgement a
 *    dropped connection lost - holds the next one ten seconds and no longer,
 *    said once in words (the final review of D-761);
 * 4. a Sprinting Rogue's Disengage, paid with the turn's last Half-Action,
 *    keeping the Move it buys - the count was capped at two;
 * 5. the feet-left door read back after a thirty-foot walk, for a flier's wings
 *    too, saying *not metered* in words for every token the budget does not
 *    judge, refusing an action the board does not know whoever the token is,
 *    and writing nothing;
 * 6. the door after a refusal: the same turn, and a move of exactly the feet it
 *    says are left landing, after which none are.
 *
 * **And a walk is charged by the SQUARES it enters** (D-764; the lead,
 * 2026-09-29: *squares entered. Each square can be configured at the scene
 * level for an amount of feet per square, default is 5*):
 *
 * 7. `squareFeet` measures exactly what core's own grid measures with no cost
 *    function, on every diagonal rule, square and hex, flat and in 3D, and
 *    counts a blink's squares where the bare measure costs a teleport nothing;
 * 8. sixty feet walked in 0.9-square steps that start and stop off the squares'
 *    centres, as a continuous walker commits them, charged exactly sixty feet -
 *    two Half-Actions at Speed 30 - with the door read back after every step;
 *    then a step inside the last square is free with nothing left, and a step
 *    into the next is refused (the old meter charged 64.5 and refused the
 *    thirteenth step);
 * 9. the same walk on a scene whose squares are ten feet: ten feet a square;
 * 10. steps that wander inside one square cost nothing, and the step out one
 *    square;
 * 11. a Difficult-ground square entered costs double, and a step inside it
 *    nothing;
 * 12. a move core leaves uncosted - an UNRENDERED token's, made on the ten-foot
 *    scene while this client views another - judged and charged by the
 *    squares it enters at that scene's ten feet, never by the feet it walks.
 *
 * **A slow connection is made on purpose.** On localhost a write lands in a few
 * milliseconds and the race needs a round trip longer than the gap between two
 * moves, which a player on a real connection has and this machine does not.
 * `slowWrites` holds back every write THIS combatant makes, for one test - the
 * shape of the race, made deterministic - and core, the hooks and the charge
 * run exactly as they do at the table.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15); an ABSENCE - no second
 * charge - is asserted once the combatant has been quiet for several times the
 * held-back latency, since a charge that never comes has no event to wait for.
 */

import { cleanup, made, makeCharacter, settle, untilHook, warnings } from "./fixtures.mjs";
import { MOVEMENT_LIMIT_SETTING } from "../settings.mjs";
// Disengage's own door, as the Combat tab presses it (05, D-694).
import { disengage } from "../applications/combat-actions.mjs";
// The cost function a step is measured in squares with (D-764).
import { squareFeet } from "../rules/movement.mjs";

/** How long each of the combatant's writes is held back: a round trip on a slow connection. */
const LATENCY_MS = 250;

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000, every = 50) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, every));
  }
}

/**
 * Hold back every write this combatant makes by `ms`, until the returned
 * function is called: a slow connection, on one document, for one test.
 * `setFlag` and the combatant's own one-write updates both go through
 * `update`, so both are held.
 */
function slowWrites(combatant, ms) {
  const own = Object.prototype.hasOwnProperty.call(combatant, "update");
  const held = combatant.update;
  combatant.update = async function (...args) {
    await new Promise(r => setTimeout(r, ms));
    return held.apply(this, args);
  };
  return () => {
    if (own) combatant.update = held;
    else delete combatant.update;
  };
}

/**
 * Resolve once this combatant has had no update for `quietMs`: every charge
 * owed has landed, including one that should never have been made.
 */
async function quiet(combatant, quietMs = LATENCY_MS * 6, ms = 20000) {
  let last = Date.now();
  const id = Hooks.on("updateCombatant", doc => { if (doc.id === combatant.id) last = Date.now(); });
  try {
    await until(() => Date.now() - last >= quietMs, `${combatant.name}'s writes to settle`, ms);
  } finally {
    Hooks.off("updateCombatant", id);
  }
}

/** The Half-Actions left and the Moves paid, as one fact to assert. */
const turnOf = combatant => ({
  halfActions: combatant.budget.halfActions,
  paid: combatant.getFlag("azeroth-rpg", "moveHalves") ?? 0
});

/** An actor's token on the viewed scene, as a document. By actor, NEVER by a create's return order. */
const tokenOf = actor => actor.getActiveTokens(true)[0]?.document ?? null;

/**
 * The turn as the first update that spent a Half-Action left it (D-761): the
 * one-write invariant, read off the update itself rather than off a poll, so a
 * charge that lands the budget a round trip before the Moves paid is seen in
 * the moment between the two however quickly the second follows.
 */
function firstSpend(combatant) {
  const seen = { turn: null };
  const id = Hooks.on("updateCombatant", doc => {
    if (doc.id !== combatant.id || seen.turn || doc.budget.halfActions !== 1) return;
    seen.turn = turnOf(doc);
  });
  seen.stop = () => Hooks.off("updateCombatant", id);
  return seen;
}

/**
 * Tokens for these actors on the batch's scene, linked and friendly, drawn.
 * A square is five feet: 100 px. The documents come back in no promised
 * order (fixtures.mjs's first rule): read one by its actor, through `tokenOf`.
 */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })).toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => p.actor.getActiveTokens(true).length), "every token drawn");
  await settle();
  return tokens;
}

/**
 * A started fight over these actors' tokens, on the FIRST actor's turn, with
 * its two Half-Actions in hand.
 */
async function fightOver(scene, actors) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({
    actorId: a.id, tokenId: a.getActiveTokens(true)[0]?.document?.id ?? null, sceneId: scene.id
  })));
  const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await started;
  const mine = combat.getCombatantsByActor(actors[0])[0];
  const index = combat.turns.findIndex(c => c.id === mine.id);
  if (combat.turn !== index) {
    const moved = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.update({ turn: index });
    await moved;
  }
  await until(() => combat.combatant?.id === mine.id && mine.budget.halfActions === 2 && !mine.getFlag("azeroth-rpg", "moveHalves"),
    `${actors[0].name}'s own turn with two Half-Actions`);
  return { combat, combatant: mine };
}

/**
 * End a test's fight WITHOUT leaving a write in flight: the movement history is
 * cleared first, because `Combat#_onExit` clears it unawaited after the delete
 * (quench-phase12's reason), and then the tokens go.
 */
async function clearBoard(scene, combat, tokens) {
  await settle();
  for (const token of tokens ?? []) {
    if (scene.tokens.has(token.id)) await token.clearMovementHistory?.().catch?.(() => {});
  }
  if (combat) await combat.delete().catch(() => {});
  canvas?.tokens?.releaseAll?.();
  const ids = (tokens ?? []).map(t => t.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids).catch(() => {});
  await settle();
}

/* ---- D-764: a walk charged by the squares it enters ------------------------ */

/** A 0.9-square step on 100 px squares: what a continuous walker commits. */
const STEP_PX = 90;

/**
 * The top-left x of every step of a straight walk east from `fromX`, `steps`
 * of them, `STEP_PX` apart.
 */
const stepsFrom = (fromX, steps) => Array.from({ length: steps }, (_, k) => fromX + (STEP_PX * (k + 1)));

/**
 * The feet of movement a turn has spent after each step of a walk, by the lead's
 * rule (D-764): nothing for a step whose token centre stays inside its square,
 * the scene's grid distance for each square entered. Worked out off the grid the
 * scene holds, never off the meter under test. `positions` are the token's
 * top-left corners, the first where it stands, for a token one square across.
 */
function feetBySquares(scene, positions) {
  const grid = scene.grid;
  const out = [];
  let spent = 0;
  for (let k = 1; k < positions.length; k++) {
    const a = grid.getOffset({ x: positions[k - 1].x + (grid.size / 2), y: positions[k - 1].y + (grid.size / 2) });
    const b = grid.getOffset({ x: positions[k].x + (grid.size / 2), y: positions[k].y + (grid.size / 2) });
    // A straight walk or a wander inside one square: one square at most per
    // step here, so the diagonal rule never enters into it.
    if (a.i !== b.i || a.j !== b.j) spent += grid.distance;
    out.push(spent);
  }
  return out;
}

/**
 * Walk a token through `positions` one committed step at a time, as a
 * continuous walker does: each an unsnapped move, landed, its charge landed,
 * and the feet-left door read back and held to the turn's own arithmetic -
 * `spentAfter[k]` feet spent, the Moves a Speed of `pace` needs for them paid,
 * and `pace × halves - spent` left.
 */
async function walkAndRead({ assert, label, token, combatant, positions, spentAfter, pace = 30, halves = 2 }) {
  const door = game.system.azeroth.movement.remaining;
  for (let k = 1; k < positions.length; k++) {
    const { x, y } = positions[k];
    const said = [];
    let moved = null;
    said.push(...await warnings(async () => { moved = await token.move({ x, y }); }));
    assert.isTrue(moved, `${label}: step ${k} to (${x}, ${y}) was refused; said: ${JSON.stringify(said)}`);
    await until(() => token.x === x && token.y === y, `${label}: step ${k} to land`, 10000);
    const spent = spentAfter[k - 1];
    const paid = Math.max(0, Math.min(halves, Math.ceil((spent - 1e-6) / pace)));
    await until(() => turnOf(combatant).paid === paid, `${label}: ${paid} Move(s) paid after step ${k} (${spent} ft)`, 10000);
    const left = door(token);
    assert.deepInclude(left, { metered: true, spentFeet: spent, allowedFeet: pace * halves, feetLeft: (pace * halves) - spent },
      `${label}: the door after step ${k} to (${x}, ${y})`);
    assert.equal(left.halves.paid, paid, `${label}: the door's Moves paid after step ${k}`);
  }
}

export function movementBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A turn's movement, charged once, by the squares it enters, and read back (D-761, D-762, D-764)", function () {
    let scene = null;
    let wasViewing = null;
    let wasLimited = null;

    before(async function () {
      this.timeout(60000);
      wasLimited = game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Movement Charge", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(120000);
      if (wasLimited !== null) await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, wasLimited);
      // Fights first, then the scene (the reactions batch's teardown, and its reason).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    /* ---- D-761: the charge ------------------------------------------------ */

    it("writes a move's charge ONCE - the Half-Action and the Move it paid in one update - and charges ten feet more against both: ONE Half-Action (the two-write regression)", async function () {
      this.timeout(120000);
      const walker = await makeCharacter({ name: "ZZ Overlap Walker", classes: [["Warrior", 3]] });
      assert.equal(walker.system.speed, 30, "the fixture's Speed is not 30");
      const tokens = await place(scene, [{ actor: walker, x: 500, y: 500 }]);
      const token = tokenOf(walker);
      let combat = null;
      let restore = null;
      let spent = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        restore = slowWrites(combatant, LATENCY_MS);
        spent = firstSpend(combatant);
        // Ten feet, not awaited.
        const first = token.move({ x: 700, y: 500 });
        // THE ONE WRITE, STATED DIRECTLY. The two-write charge landed the budget
        // a held round trip before the Moves it paid, and a second move made in
        // that moment - two quick steps on a slow connection - read a Half-Action
        // spent and no Move paid, and paid again. With one write there is no such
        // moment: the update that spends the Half-Action carries the Move.
        await until(() => spent.turn, "the first move's charge to land", 15000, 5);
        assert.deepEqual(spent.turn, { halfActions: 1, paid: 1 },
          "the first move's charge landed its Half-Action without the Move it paid: the charge is two writes again");
        // And the next ten feet, begun the moment the charge is seen, owe nothing more.
        const arrived = untilHook("moveToken", 15000, doc => doc.id === token.id);
        const second = token.move({ x: 900, y: 500 });
        await arrived;
        await Promise.allSettled([first, second]);
        await until(() => token.x === 900, "the second move to land", 10000);
        await quiet(combatant);
        assert.deepEqual(turnOf(combatant), { halfActions: 1, paid: 1 },
          "twenty feet at Speed 30 is one Move: the second move's charge paid again");
      } finally {
        spent?.stop();
        restore?.();
        await clearBoard(scene, combat, tokens);
      }
    });

    it("judges a legal move made once the first charge's one write has landed against the WHOLE turn, and lets it through (the two-write regression)", async function () {
      this.timeout(120000);
      const walker = await makeCharacter({ name: "ZZ Landing Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [{ actor: walker, x: 500, y: 800 }]);
      const token = tokenOf(walker);
      let combat = null;
      let restore = null;
      let spent = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        restore = slowWrites(combatant, LATENCY_MS);
        spent = firstSpend(combatant);
        const first = token.move({ x: 700, y: 800 });
        await until(() => spent.turn, "the first move's charge to land", 15000, 5);
        // The limit reads what the charge wrote, and it wrote the turn whole.
        assert.deepEqual(spent.turn, { halfActions: 1, paid: 1 },
          "the first move's charge landed its Half-Action without the Move it paid: the limit would read the turn a Move short");
        // Thirty feet more: forty in all, which two Half-Actions pay for. The
        // limit read the half-written turn as one Move and refused it.
        let moved = null;
        const said = await warnings(async () => { moved = await token.move({ x: 1300, y: 800 }); });
        await Promise.allSettled([first]);
        assert.isTrue(moved, `a legal forty feet was refused after the first charge landed; said: ${JSON.stringify(said)}`);
        await until(() => token.x === 1300, "the second move to land", 10000);
        await until(() => turnOf(combatant).paid === 2, "the second Move charged", 10000);
        await quiet(combatant);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 });
      } finally {
        spent?.stop();
        restore?.();
        await clearBoard(scene, combat, tokens);
      }
    });

    it("spends a Half-Action taken beside a landing charge off what the charge left, not off what it replaced", async function () {
      this.timeout(120000);
      const walker = await makeCharacter({ name: "ZZ Busy Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [{ actor: walker, x: 500, y: 1100 }]);
      const token = tokenOf(walker);
      let combat = null;
      let restore = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        restore = slowWrites(combatant, LATENCY_MS);
        const arrived = untilHook("moveToken", 15000, doc => doc.id === token.id);
        const first = token.move({ x: 700, y: 1100 });
        // The charge has begun and its write is on its way: now a Guard, say.
        // THE QUEUE'S OWN LIVE TEST: the two writes really overlap here, and if
        // either stops waiting its turn - the charge or the spend - the spend
        // reads the budget the charge is about to replace and one Half-Action
        // is lost (break-tested with the charge taken out of `oneAtATime`).
        await arrived;
        const spent = await combatant.spendAction("half");
        assert.isTrue(spent.ok, "the Half-Action was refused");
        await Promise.allSettled([first]);
        await quiet(combatant);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 1 },
          "a move and a Half-Action are two Half-Actions: the one spent beside the charge was lost with it");
      } finally {
        restore?.();
        await clearBoard(scene, combat, tokens);
      }
    });

    it("lets the next budget write go ahead when one never answers - after ten seconds, said once in words - and leaves the lost write's caller waiting (the final review of D-761)", async function () {
      this.timeout(90000);
      const walker = await makeCharacter({ name: "ZZ Unanswered Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [{ actor: walker, x: 2600, y: 500 }]);
      let combat = null;
      let restore = null;
      let letGo = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        // THE WRITE THAT NEVER ANSWERS: the combatant's next budget write is
        // sent nowhere and its promise stays pending - a request whose socket
        // acknowledgement a dropped connection lost, which core's request, with
        // no timeout, waits on for ever - until the test lets it go, having
        // written nothing. Every other write goes through as it would.
        const own = Object.prototype.hasOwnProperty.call(combatant, "update");
        const held = combatant.update;
        combatant.update = function (data, ...rest) {
          if (!letGo && data?.flags?.["azeroth-rpg"]?.budget !== undefined) return new Promise(resolve => { letGo = resolve; });
          return held.call(this, data, ...rest);
        };
        restore = () => {
          if (own) combatant.update = held;
          else delete combatant.update;
        };
        const stalled = game.i18n.format("AZEROTH.Combat.BudgetWriteStalled", { name: combatant.name, seconds: 10 });
        let lost = null;
        let next = null;
        let waited = 0;
        const said = await warnings(async () => {
          lost = combatant.spendAction("half");
          await until(() => letGo, "the lost write to be sent", 10000, 5);
          const began = Date.now();
          next = await combatant.spendAction("reaction");
          waited = Date.now() - began;
        });
        assert.isTrue(next?.ok, `the write after the lost one was refused: ${JSON.stringify(next)}`);
        assert.isAtLeast(waited, 9500, "the next write went ahead before the lost one had had its ten seconds");
        assert.isBelow(waited, 20000, "the next write waited far past its ten seconds");
        assert.deepEqual(said.filter(s => s === stalled), [stalled], `the stall was not said once, in words; said: ${JSON.stringify(said)}`);
        // The lost write sent nothing; the one after it landed.
        await until(() => combatant.budget.reactions === 0, "the Reaction spent after the lost write to land", 10000);
        assert.equal(combatant.budget.halfActions, 2, "the lost write's Half-Action landed");
        // Its own caller is still waiting, exactly as core's promise does.
        const settled = await Promise.race([lost.then(() => "settled", () => "settled"), new Promise(r => setTimeout(() => r("waiting"), 100))]);
        assert.equal(settled, "waiting", "the queue settled a write that never answered");
        // And the queue is moving: the next write is not held a second time.
        const began = Date.now();
        const third = await combatant.spendAction("half");
        assert.isTrue(third?.ok);
        assert.isBelow(Date.now() - began, 5000, "a write after the stall was held again");
        await until(() => combatant.budget.halfActions === 1, "the Half-Action after the stall to land", 10000);
        // An answer that comes after all changes nothing and says nothing more.
        const late = await warnings(async () => {
          letGo();
          await lost;
          await new Promise(r => setTimeout(r, 250));
        });
        assert.deepEqual(late.filter(s => s === stalled), [], "a late answer said the stall again");
        assert.deepEqual({ halfActions: combatant.budget.halfActions, reactions: combatant.budget.reactions }, { halfActions: 1, reactions: 0 });
      } finally {
        letGo?.();
        restore?.();
        await clearBoard(scene, combat, tokens);
      }
    });

    it("keeps the Move a Sprinting Rogue's Disengage buys, which a flat two dropped", async function () {
      this.timeout(120000);
      const rogue = await makeCharacter({ name: "ZZ Sprinting Disengager", classes: [["Rogue", 4]] });
      await until(() => rogue.items.some(i => i.type === "feature" && i.name === "Sprint"), "the level-4 Sprint feature");
      assert.equal(rogue.system.speed, 30, "the fixture's Speed is not 30");
      const tokens = await place(scene, [{ actor: rogue, x: 500, y: 300 }]);
      const token = tokenOf(rogue);
      let combat = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [rogue]));
        assert.equal(combatant.budget.freeMove, 1, "the first turn did not hold Sprint's free Move");
        // Sixty feet: Sprint's free Move and one Half-Action (02 §7, D-712).
        assert.isTrue(await token.move({ x: 1700, y: 300 }), "sixty feet was refused on a Sprinting turn");
        await until(() => turnOf(combatant).paid === 2, "the walk to be charged", 10000);
        assert.deepEqual({ ...turnOf(combatant), free: combatant.budget.freeMove }, { halfActions: 1, paid: 2, free: 0 });
        // Disengage: the last Half-Action, paid AS a Move (05, D-694).
        await disengage(rogue);
        await until(() => turnOf(combatant).paid === 3, "the Disengage's Move to be counted", 10000);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 3 }, "the Disengage's Half-Action and its Move did not land together");
        // The thirty feet it bought.
        let moved = null;
        const said = await warnings(async () => { moved = await token.move({ x: 2300, y: 300 }); });
        assert.isTrue(moved, `the thirty feet a Disengage bought were refused; said: ${JSON.stringify(said)}`);
        await until(() => token.x === 2300, "the Disengage's walk to land", 10000);
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 3 }, "the walk a Disengage bought was charged again");
      } finally {
        if (rogue.statuses?.has("disengaging")) await rogue.toggleStatusEffect("disengaging", { active: false }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- D-762: the feet-left door ---------------------------------------- */

    it("reads the feet left off the verdict a move is judged by, says who is not metered, and writes nothing", async function () {
      this.timeout(120000);
      const door = game.system.azeroth?.movement?.remaining;
      assert.isFunction(door, "game.system.azeroth.movement.remaining is not a door");
      const walker = await makeCharacter({ name: "ZZ Door Walker", classes: [["Warrior", 3]] });
      const waiter = await makeCharacter({ name: "ZZ Door Waiter", classes: [["Warrior", 3]] });
      const bystander = await makeCharacter({ name: "ZZ Door Bystander", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [
        { actor: walker, x: 500, y: 1400 },
        { actor: waiter, x: 500, y: 1600 },
        { actor: bystander, x: 2500, y: 1600 }
      ]);
      const [token, waiting, standing] = [walker, waiter, bystander].map(tokenOf);
      let combat = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker, waiter]));

        // NOT METERED IS SAID, NEVER NUMBERED.
        const nulls = { feetLeft: null, spentFeet: null, allowedFeet: null, feetBeforeNextMove: null, halves: null, pace: null };
        assert.deepInclude(door(null), { metered: false, reason: "noToken", combatantId: null, ...nulls });
        assert.deepInclude(door(standing), { metered: false, reason: "noFight", ...nulls }, "a token in no fight read as metered");
        assert.deepInclude(door(waiting), { metered: false, reason: "notTurn", ...nulls }, "a combatant whose turn it is not read as metered");
        // AN ACTION THE BOARD DOES NOT KNOW THROWS, WHOEVER THE TOKEN IS (the final
        // review of D-762): it was refused only where the turn was metered, and a
        // bystander answered *not metered* for an action nothing can perform.
        for (const [who, asked] of [["no token", null], ["a bystander", standing], ["a waiting combatant", waiting], ["a bystander's placeable", standing.object]]) {
          assert.throws(() => door(asked, { action: "levitate" }), TypeError, /movement action/, `${who} was read for an action the board does not know`);
        }
        // A known one is still read, metered or not.
        assert.deepInclude(door(standing, { action: "fly" }), { metered: false, reason: "noFight" });

        // A fresh turn: sixty feet at Speed 30, and the placeable reads the same.
        // Only the walker's own documents are watched: the door could write
        // nothing else, and the world's own passes may write the others.
        const writes = [];
        const ours = new Set([combatant.id, token.id, walker.id, combat.id]);
        const watched = ["updateCombatant", "updateToken", "updateActor", "updateCombat"].map(name =>
          [name, Hooks.on(name, doc => { if (ours.has(doc.id)) writes.push(`${name} ${doc.name ?? doc.id}`); })]);
        let fresh;
        try {
          fresh = door(token);
          assert.notInstanceOf(fresh, Promise, "the door is not a read");
          assert.deepEqual(fresh, {
            metered: true, reason: null, limited: true, action: "walk", pace: 30, stopped: false,
            spentFeet: 0, allowedFeet: 60, feetLeft: 60, feetBeforeNextMove: 0,
            halves: { paid: 0, left: 2, free: 0, total: 2 }, combatantId: combatant.id
          });
          assert.deepEqual(door(token.object), fresh, "the placeable reads a different turn from its document");
          for (let i = 0; i < 20; i++) door(token);
          await new Promise(r => setTimeout(r, 500));
        } finally {
          for (const [name, id] of watched) Hooks.off(name, id);
        }
        assert.deepEqual(writes, [], "reading the door wrote to the world");

        // Thirty feet walked and charged: thirty left, the paid Move used up.
        assert.isTrue(await token.move({ x: 1100, y: 1400 }), "a thirty-foot walk was refused");
        await until(() => turnOf(combatant).paid === 1, "the walk to be charged", 10000);
        const walked = door(token);
        assert.deepInclude(walked, { metered: true, spentFeet: 30, allowedFeet: 60, feetLeft: 30, feetBeforeNextMove: 0 });
        assert.deepEqual(walked.halves, { paid: 1, left: 1, free: 0, total: 2 });

        // WINGS: the same turn at the flying pace (14 §1, D-718).
        await walker.update({ "system.flyingSpeed": 120 });
        await until(() => walker.system.flyingSpeed === 120, "the flying pace to store");
        assert.deepInclude(door(token, { action: "fly" }), { action: "fly", pace: 120, allowedFeet: 240, spentFeet: 30, feetLeft: 210 });
        assert.throws(() => door(token, { action: "levitate" }), TypeError, /movement action/);
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("reads the same turn after a refusal, and a move of exactly the feet it says are left lands", async function () {
      this.timeout(120000);
      const door = game.system.azeroth.movement.remaining;
      const walker = await makeCharacter({ name: "ZZ Refused Walker", classes: [["Warrior", 3]] });
      const tokens = await place(scene, [{ actor: walker, x: 500, y: 1800 }]);
      const token = tokenOf(walker);
      let combat = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        assert.isTrue(await token.move({ x: 1100, y: 1800 }), "a thirty-foot walk was refused");
        await until(() => turnOf(combatant).paid === 1, "the walk to be charged", 10000);
        const before = door(token);
        assert.equal(before.feetLeft, 30);

        // Forty-five feet more is past the turn: refused, and nothing moves.
        let refused = null;
        const said = await warnings(async () => { refused = await token.move({ x: 2000, y: 1800 }); });
        assert.isFalse(refused, "a move past the turn's limit was let through");
        assert.lengthOf(said, 1, "the refusal said nothing");
        await until(() => token.x === 1100, "the token to stay where it was", 4000);
        assert.deepEqual(door(token), before, "a refused move changed what the door reads");

        // EXACTLY what the door says is left: it lands, and nothing is left.
        const squares = before.feetLeft / 5;
        assert.isTrue(await token.move({ x: 1100 + squares * 100, y: 1800 }), `a move of the ${before.feetLeft} ft the door said were left was refused`);
        await until(() => turnOf(combatant).paid === 2, "the last Move to be charged", 10000);
        const spent = door(token);
        assert.deepInclude(spent, { spentFeet: 60, allowedFeet: 60, feetLeft: 0, feetBeforeNextMove: 0 });
        assert.deepEqual(spent.halves, { paid: 2, left: 0, free: 0, total: 2 });
        // And five feet more is refused, as the door said it would be.
        let past = null;
        await warnings(async () => { past = await token.move({ x: 1100 + (squares + 1) * 100, y: 1800 }); });
        assert.isFalse(past, "a step past a door that read nothing left was let through");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- D-764: a walk charged by the squares it enters ------------------- */

    // Ten-foot squares, made once for the two tests that walk them: viewed for
    // the drawn walk, and left UNVIEWED for the undrawn one.
    let tenFoot = null;
    const tenFootScene = async () => {
      if (tenFoot && game.scenes.has(tenFoot.id)) return tenFoot;
      tenFoot = await Scene.create({ name: "ZZ Movement Ten-Foot Squares", width: 4000, height: 2000, grid: { size: 100, distance: 10, units: "ft" } });
      made.push(tenFoot);
      return tenFoot;
    };
    const viewBatchScene = async () => {
      if (canvas.scene?.id === scene.id && canvas.ready) return;
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the batch's scene to be viewed again");
    };

    it("measures a step in squares exactly as core's grid does with no cost function, on every diagonal rule, square and hex, flat and 3D, and counts a blink's squares", function () {
      // `squareFeet` is handed to core as the cost of a move between spaces.
      // Held against core's own bare measure (`grid.measurePath` with no cost
      // function) over random walks, so a core that ever measures otherwise
      // says so here rather than at the table.
      const { SquareGrid, HexagonalGrid } = foundry.grid;
      let seed = 764;
      const random = () => { seed = ((seed * 1103515245) + 12345) % 2147483648; return seed / 2147483648; };
      let compared = 0;
      const mismatches = [];
      for (const [rule, diagonals] of Object.entries(CONST.GRID_DIAGONALS)) {
        const grids = {
          square: new SquareGrid({ size: 100, distance: 5, diagonals }),
          "hex rows": new HexagonalGrid({ size: 100, distance: 5, columns: false, even: false, diagonals }),
          "hex columns": new HexagonalGrid({ size: 100, distance: 5, columns: true, even: true, diagonals })
        };
        for (const [kind, grid] of Object.entries(grids)) {
          for (const flat of [true, false]) {
            for (let walk = 0; walk < 20; walk++) {
              const path = [];
              let x = 500 + (random() * 100);
              let y = 500 + (random() * 100);
              let elevation = 0;
              for (let k = 0; k < 12; k++) {
                x += (random() - 0.3) * 160;
                y += (random() - 0.5) * 160;
                elevation = Math.max(0, elevation + ((random() - 0.5) * 8));
                path.push(flat ? { x, y } : { x, y, elevation });
              }
              const bare = grid.measurePath(path);
              const squares = grid.measurePath(path, { cost: squareFeet });
              for (let i = 1; i < path.length; i++) {
                compared += 1;
                const a = bare.waypoints[i].backward.cost;
                const b = squares.waypoints[i].backward.cost;
                if (Math.abs(a - b) > 1e-9) mismatches.push(`${rule} ${kind} ${flat ? "2D" : "3D"} step ${i}: ${a} vs ${b}`);
              }
            }
          }
        }
      }
      assert.isAbove(compared, 9000, "the walks measured too few steps to mean anything");
      assert.deepEqual(mismatches.slice(0, 10), [], `${mismatches.length} of ${compared} steps measured apart from core's own measure`);
      // A step inside one square is nothing, a square entered its distance.
      const grid = new SquareGrid({ size: 100, distance: 5, diagonals: CONST.GRID_DIAGONALS.EQUIDISTANT });
      const inside = grid.measurePath([{ x: 510, y: 520 }, { x: 590, y: 580 }], { cost: squareFeet });
      assert.deepInclude(inside, { cost: 0 });
      assert.isAbove(inside.distance, 0, "a step inside a square measured no distance at all");
      // A blink: core's bare measure costs a teleport nothing; its squares count.
      const blink = [{ x: 550, y: 550 }, { x: 850, y: 550, teleport: true }];
      assert.equal(grid.measurePath(blink).cost, 0);
      assert.equal(grid.measurePath(blink, { cost: squareFeet }).cost, 15);
    });

    it("charges sixty feet walked in 0.9-square steps off the squares' centres EXACTLY sixty - two Half-Actions at Speed 30 - and the door agrees after every step", async function () {
      this.timeout(180000);
      const walker = await makeCharacter({ name: "ZZ Square Walker", classes: [["Warrior", 3]] });
      assert.equal(walker.system.speed, 30, "the fixture's Speed is not 30");
      // The token's centre from (573, 273): 23 px off its square's centre on both axes.
      const start = { x: 523, y: 223 };
      const tokens = await place(scene, [{ actor: walker, ...start }]);
      const token = tokenOf(walker);
      let combat = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        const positions = [start, ...stepsFrom(start.x, 13).map(x => ({ x, y: start.y }))];
        assert.isTrue(positions.every(p => (p.x + 50) % 100 !== 50 && (p.y + 50) % 100 !== 50), "a step stops on a square's centre");
        const spentAfter = feetBySquares(scene, positions);
        // Twelve squares entered and one step that stays inside square 12.
        assert.deepEqual(spentAfter, [5, 10, 15, 20, 25, 30, 35, 35, 40, 45, 50, 55, 60]);
        await walkAndRead({ assert, label: "five-foot squares", token, combatant, positions, spentAfter });
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 }, "sixty feet of squares is two Moves at Speed 30");

        // NOTHING LEFT, AND A STEP INSIDE THE SQUARE IS STILL FREE: the
        // centre from 1743 to 1783, square 17 still.
        const door = game.system.azeroth.movement.remaining;
        const spent = door(token);
        assert.deepInclude(spent, { spentFeet: 60, feetLeft: 0 });
        const wander = { x: 1733, y: start.y };
        let moved = null;
        const said = await warnings(async () => { moved = await token.move(wander); });
        assert.isTrue(moved, `a step inside the square the walk stands in was refused with nothing left; said: ${JSON.stringify(said)}`);
        await until(() => token.x === wander.x, "the step inside the square to land", 10000);
        assert.deepEqual(door(token), spent, "a step inside one square changed what the turn has spent");
        // And the next square is five feet the turn does not hold.
        let past = null;
        const refused = await warnings(async () => { past = await token.move({ x: 1763, y: start.y }); });
        assert.isFalse(past, "a step into a new square was let through with nothing left");
        assert.lengthOf(refused, 1, "the refusal said nothing");
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 });
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("charges the same walk ten feet a square on a scene whose squares are ten feet", async function () {
      this.timeout(180000);
      const ten = await tenFootScene();
      const walker = await makeCharacter({ name: "ZZ Ten-Foot Walker", classes: [["Warrior", 3]] });
      let combat = null;
      let tokens = [];
      try {
        await ten.view();
        await until(() => canvas.ready && canvas.scene?.id === ten.id, "the ten-foot scene to be viewed");
        assert.equal(ten.grid.distance, 10, "the scene's squares are not ten feet");
        // The centre from (505, 573): the first step stays inside square 5.
        const start = { x: 455, y: 523 };
        tokens = await place(ten, [{ actor: walker, ...start }]);
        const token = tokenOf(walker);
        let combatant;
        ({ combat, combatant } = await fightOver(ten, [walker]));
        const positions = [start, ...stepsFrom(start.x, 7).map(x => ({ x, y: start.y }))];
        const spentAfter = feetBySquares(ten, positions);
        assert.deepEqual(spentAfter, [0, 10, 20, 30, 40, 50, 60]);
        await walkAndRead({ assert, label: "ten-foot squares", token, combatant, positions, spentAfter });
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 }, "six ten-foot squares is two Moves at Speed 30");
        // The seventh square is ten feet more: refused.
        let past = null;
        await warnings(async () => { past = await token.move({ x: positions.at(-1).x + STEP_PX, y: start.y }); });
        assert.isFalse(past, "a seventh ten-foot square was let through on a sixty-foot turn");
      } finally {
        await clearBoard(ten, combat, tokens);
        await viewBatchScene();
      }
    });

    it("charges nothing for steps that wander inside one square, and one square for the step out", async function () {
      this.timeout(180000);
      const walker = await makeCharacter({ name: "ZZ Wandering Walker", classes: [["Warrior", 3]] });
      // Square (5, 8): the centre wanders from (555, 855) to its corners and back.
      const start = { x: 505, y: 805 };
      const tokens = await place(scene, [{ actor: walker, ...start }]);
      const token = tokenOf(walker);
      let combat = null;
      try {
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        const wander = [{ x: 515, y: 805 }, { x: 525, y: 818 }, { x: 535, y: 830 }, { x: 544, y: 812 }, { x: 510, y: 840 }];
        const positions = [start, ...wander];
        const spentAfter = feetBySquares(scene, positions);
        assert.deepEqual(spentAfter, [0, 0, 0, 0, 0], "a wander step left square (5, 8)");
        await walkAndRead({ assert, label: "inside one square", token, combatant, positions, spentAfter });
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 2, paid: 0 }, "wandering inside one square spent a Move");
        // The step out: square (6, 8), five feet, one Move.
        await walkAndRead({ assert, label: "the step out", token, combatant, positions: [wander.at(-1), { x: 560, y: 840 }], spentAfter: [5] });
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 1, paid: 1 });
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("charges a Difficult-ground square entered double, and a step inside it nothing", async function () {
      this.timeout(180000);
      const walker = await makeCharacter({ name: "ZZ Mud Walker", classes: [["Warrior", 3]] });
      // A GM's Difficult ground over squares 12 to 15 of rows 13 and 14: core's
      // own Modify Movement Cost, walking at two feet a foot (05 §10, D-757).
      const [mud] = await scene.createEmbeddedDocuments("Region", [{
        name: "ZZ Movement Mud",
        shapes: [{ type: "rectangle", x: 1200, y: 1300, width: 400, height: 200, anchorX: 0, anchorY: 0, rotation: 0 }],
        behaviors: [{ type: "modifyMovementCost", system: { difficulties: { walk: 2 } } }]
      }]);
      // The centre from (1023, 1373), square (10, 13).
      const start = { x: 973, y: 1323 };
      const tokens = await place(scene, [{ actor: walker, ...start }]);
      const token = tokenOf(walker);
      let combat = null;
      try {
        await until(() => scene.regions.has(mud.id), "the mud to stand");
        let combatant;
        ({ combat, combatant } = await fightOver(scene, [walker]));
        // Square 11 on plain ground (5), square 12 in the mud (10), a step
        // inside it (0), squares 13 and 14 in the mud (10 each).
        const positions = [start, ...stepsFrom(start.x, 5).map(x => ({ x, y: start.y }))];
        assert.deepEqual(positions.map(p => Math.floor((p.x + 50) / 100)), [10, 11, 12, 12, 13, 14]);
        await walkAndRead({ assert, label: "Difficult ground", token, combatant, positions, spentAfter: [5, 15, 15, 25, 35] });
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 }, "thirty-five feet of movement is two Moves at Speed 30");
      } finally {
        await clearBoard(scene, combat, tokens);
        if (scene.regions.has(mud.id)) await scene.deleteEmbeddedDocuments("Region", [mud.id]).catch(() => {});
      }
    });

    it("charges a move core leaves uncosted - an UNRENDERED token's - by the squares it enters at the scene's ten feet, never the feet it walks", async function () {
      this.timeout(180000);
      // THE SHAPE, MADE BY CORE: a token on a scene this client is not viewing
      // has no placeable, and core costs every passed waypoint of its move 0
      // (14.367, token.mjs L1905-1906). Moved outside a fight: a fight on a
      // scene nobody views is one core's own tracker throws on (`"turn" in
      // undefined`, combat-tracker.mjs L186-188), and core records no history
      // for it (`TokenDocument#combatant` reads `game.combat`, token.mjs L351).
      await viewBatchScene();
      const ten = await tenFootScene();
      const walker = await makeCharacter({ name: "ZZ Undrawn Walker", classes: [["Warrior", 3]] });
      await walker.update({ "prototypeToken.actorLink": true });
      const start = { x: 455, y: 523 };
      const data = (await walker.getTokenDocument({ ...start, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })).toObject();
      const tokens = await ten.createEmbeddedDocuments("Token", [data]);
      const token = ten.tokens.find(t => t.actorId === walker.id);
      let combat = null;
      try {
        assert.notEqual(canvas.scene?.id, ten.id, "the ten-foot scene is being viewed");
        assert.isFalse(token.rendered, "the token is drawn");
        // Six and three-tenths squares walked, from the centre (505, 573) to
        // (1135, 573), and six entered: sixty feet by squares at ten feet a
        // square, sixty-three by the feet walked.
        const end = { x: start.x + (STEP_PX * 7), y: start.y };
        const moved = await Promise.race([token.move(end), new Promise(r => setTimeout(() => r("no answer in 15 s"), 15000))]);
        assert.strictEqual(moved, true, "the undrawn token did not move");
        await until(() => token.x === end.x, "the undrawn move to land", 10000);
        const undrawn = foundry.utils.deepClone(token.movement);
        const passed = undrawn?.passed?.waypoints ?? [];
        assert.isAbove(passed.length, 1, "core laid no intermediate squares on the undrawn move");
        assert.isTrue(passed.every(w => w.cost === 0), `core costed an undrawn move: ${JSON.stringify(passed.map(w => w.cost))}`);
        assert.equal(undrawn.passed.cost, 0);
        assert.closeTo(undrawn.passed.distance, 63, 1e-6, "the undrawn walk is not sixty-three feet");

        // THE DOORS, handed the move core made. The ten-foot scene is viewed
        // now so the fight is one core's tracker draws; the meter measures the
        // move on the scene's own grid whatever this client shows.
        await ten.view();
        await until(() => canvas.ready && canvas.scene?.id === ten.id, "the ten-foot scene to be viewed");
        await until(() => walker.getActiveTokens(true).length, "the token drawn");
        let combatant;
        ({ combat, combatant } = await fightOver(ten, [walker]));
        assert.equal(combatant.token?.id, token.id);
        const verdict = combatant.movementVerdict(undrawn);
        assert.isTrue(verdict.ok, `sixty feet of squares was refused on a sixty-foot turn (the feet walked are 63): ${JSON.stringify(verdict)}`);
        assert.equal(verdict.allowedFeet, 60);
        const paid = await combatant.spendMovement(undrawn);
        assert.equal(paid, 2, "sixty feet of squares is two Moves at Speed 30");
        await quiet(combatant, 750);
        assert.deepEqual(turnOf(combatant), { halfActions: 0, paid: 2 });
        // And a seventh square is ten feet the turn does not hold.
        const further = foundry.utils.deepClone(undrawn);
        further.passed.waypoints.push({ ...further.passed.waypoints.at(-1), x: end.x + STEP_PX, cost: 0, intermediate: false });
        assert.isFalse(combatant.movementVerdict(further).ok, "a seventh ten-foot square was let through");
      } finally {
        await clearBoard(ten, combat, tokens);
        await viewBatchScene();
      }
    });
  });
}
