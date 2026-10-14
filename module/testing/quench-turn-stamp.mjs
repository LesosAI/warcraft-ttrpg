/**
 * A LATE BOOKKEEPING WRITE NEVER PUTS THE TURN BACK (D-765; the lead,
 * 2026-09-30: *Fix it*), inside a live world.
 *
 * Core stamps every combatant update with the turn as the WRITING client sees
 * it, and the server writes that turn back into the fight. A write prepared
 * before a Next Turn and landing after it put the tracker back on the creature
 * before. The law and its census have their Vitest (`turn-stamp.test.mjs`);
 * what only a live world shows is the race itself:
 *
 * 1. a move's charge held back across two Next Turns leaves the tracker where
 *    the clicks put it, and the charge still lands, once;
 * 2. the system's own turn reset held back across the next click, the same;
 * 3. a `side` write REORDERS the fight and keeps core's stamp, so the creature
 *    whose turn it is keeps it at its new place - and an `initiative` write
 *    keeps its stamp too;
 * 4. a bookkeeping write on a fight whose order moved under it (an Initiative
 *    changed mid-round, which core re-sorts on the next combatant write) keeps
 *    core's stamp, and the creature whose turn it is keeps it;
 * 5. every write a round's turn events make goes out unstamped where it is
 *    bookkeeping and stamped where it names an Initiative.
 *
 * **The write is held where a slow connection holds it**: at the socket, AFTER
 * `_preUpdateOperation` has stamped it. `quench-movement.mjs`'s `slowWrites`
 * holds a combatant's `update` before it runs, which stamps the write with the
 * turn as it is when the hold ends - fresh - and so cannot show a stale stamp.
 * Holding the request instead is the round trip a player's client makes: the
 * write is fixed as it leaves, and arrives after the GM's clicks.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15), and release a held
 * write before its fight goes, or the server refuses it and the refusal prints
 * during some later batch.
 */

import { cleanup, fromPack, made, settle, untilHook } from "./fixtures.mjs";
import { MOVEMENT_LIMIT_SETTING } from "../settings.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000, every = 25) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, every));
  }
}

/** Whether a combatant update request names this combatant, with a flag of the system's in it. */
const namesFlag = (request, id, flag) => (request.operation?.updates ?? []).some(u => {
  if (u?._id !== id) return false;
  const scope = u.flags?.["azeroth-rpg"] ?? {};
  return flag in scope || `flags.azeroth-rpg.${flag}` in u;
});

/**
 * Watch every combatant update this client sends, as it leaves: what it named
 * and whether core's turn stamp was on it. With `hold`, the FIRST request that
 * `match` takes is kept back - not sent - until `release`, which sends it as it
 * was and resolves when the server has answered it.
 *
 * @param {(request: object) => boolean} match
 * @param {{hold?: boolean}} [options]
 */
function watchWrites(match = () => true, { hold = false } = {}) {
  const socket = game.socket;
  const own = Object.prototype.hasOwnProperty.call(socket, "emit");
  const real = socket.emit;
  const seen = [];
  let held = null;
  let released = null;
  let caught;
  const heldOne = new Promise(r => { caught = r; });
  socket.emit = function (event, request, ...rest) {
    if (event === "modifyDocument" && request?.type === "Combatant" && request?.action === "update") {
      const row = {
        ids: (request.operation?.updates ?? []).map(u => u?._id),
        updates: foundry.utils.deepClone(request.operation?.updates ?? []),
        stamped: "combatTurn" in (request.operation ?? {}),
        stamp: request.operation?.combatTurn,
        matched: match(request)
      };
      seen.push(row);
      if (hold && !held && row.matched) {
        held = { event, request, rest, row };
        caught(row);
        return this;
      }
    }
    return real.call(this, event, request, ...rest);
  };
  const restore = () => {
    if (own) socket.emit = real;
    else delete socket.emit;
  };
  return {
    seen,
    heldOne,
    restore,
    /** Send the held request as it was, and resolve once the server has answered. Idempotent. */
    release() {
      restore();
      if (!held) return Promise.resolve(null);
      released ??= new Promise(resolve => {
        const [ack, ...more] = held.rest;
        real.call(socket, held.event, held.request, response => {
          try {
            if (typeof ack === "function") ack(response);
          } finally {
            resolve(response);
          }
        }, ...more);
      });
      return released;
    }
  };
}

/** A kobold of the batch's own, at a stored Initiative. */
async function kobold(name, initiative) {
  const source = await fromPack("azeroth-rpg.bestiary", "Kobold");
  const data = source.toObject();
  data.name = name;
  data.system = { ...data.system, initiative };
  data.prototypeToken = { ...(data.prototypeToken ?? {}), actorLink: true };
  const actor = await Actor.create(data);
  made.push(actor);
  return actor;
}

/** Linked, hostile tokens for these actors on the scene, drawn. */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y } of placements) {
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })).toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => p.actor.getActiveTokens(true).length), "every token drawn");
  await settle();
  return tokens;
}

/**
 * A started fight over three kobolds at Initiative 30, 20 and 10 - one side, so
 * the order is theirs by Initiative - on the first one's turn, its events over.
 */
async function threeInAFight(scene, tag) {
  const first = await kobold(`ZZ ${tag} First`, 30);
  const second = await kobold(`ZZ ${tag} Second`, 20);
  const third = await kobold(`ZZ ${tag} Third`, 10);
  const tokens = await place(scene, [
    { actor: first, x: 500, y: 500 }, { actor: second, x: 900, y: 500 }, { actor: third, x: 1300, y: 500 }
  ]);
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  // Core's tracker throws on a turn change of a fight nobody views (D-764's note).
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", [first, second, third].map(a => ({
    actorId: a.id, tokenId: a.getActiveTokens(true)[0]?.document?.id ?? null, sceneId: scene.id
  })));
  const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await started;
  const of = actor => combat.getCombatantsByActor(actor)[0];
  const c = { first: of(first), second: of(second), third: of(third) };
  await until(() => combat.turns.map(t => t.id).join() === [c.first.id, c.second.id, c.third.id].join(),
    "the order First, Second, Third by Initiative");
  await until(() => combat.turn === 0 && combat.combatant?.id === c.first.id && c.first.budget.halfActions === 2,
    "First's turn, with its two Half-Actions");
  return { combat, tokens, actors: { first, second, third }, c };
}

/** Next Turn, as the tracker's button makes it, and the turn's events after it. */
async function nextTurn(combat) {
  const moved = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await moved;
}

/** End a test's fight with nothing in flight: the held write sent and answered first. */
async function clearBoard(scene, combat, tokens, watch) {
  await watch?.release?.();
  await settle();
  for (const token of tokens ?? []) {
    if (scene.tokens.has(token.id)) await token.clearMovementHistory?.().catch?.(() => {});
  }
  if (combat && game.combats.has(combat.id)) await combat.delete().catch(() => {});
  const ids = (tokens ?? []).map(t => t.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids).catch(() => {});
  await settle();
}

export function turnStampBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A late bookkeeping write never puts the turn back (D-765)", function () {
    let scene = null;
    let wasViewing = null;
    let wasLimited = null;

    before(async function () {
      this.timeout(60000);
      wasLimited = game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Turn Stamp", width: 3000, height: 1500, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 30000);
    });

    after(async function () {
      this.timeout(120000);
      if (wasLimited !== null) await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, wasLimited);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    it("leaves the tracker where two Next Turns put it when a move's charge lands after them, and lands the charge once", async function () {
      this.timeout(120000);
      const { combat, tokens, actors, c } = await threeInAFight(scene, "Charge");
      const watch = watchWrites(request => namesFlag(request, c.first.id, "moveHalves"), { hold: true });
      try {
        // First steps ten feet on its own turn: the charge is worked out and
        // sent - and held, the way a player's round trip holds it.
        const token = actors.first.getActiveTokens(true)[0].document;
        assert.isTrue(await token.move({ x: 700, y: 500 }), "the ten-foot step was refused");
        const held = await Promise.race([watch.heldOne, new Promise((_, r) => setTimeout(() => r(new Error("the move's charge was never sent")), 15000))]);

        // The GM clicks on, twice, while it is in flight.
        await nextTurn(combat);
        await nextTurn(combat);
        assert.equal(combat.combatant?.id, c.third.id, "two Next Turns did not reach Third");

        await watch.release();
        await until(() => c.first.getFlag("azeroth-rpg", "moveHalves") === 1, "the held charge to land");
        await settle();
        assert.equal(combat.combatant?.id, c.third.id,
          `the late charge put the tracker back on ${combat.combatant?.name}: the turn is ${combat.turn}`);
        assert.equal(combat.turn, 2);
        // D-761's one write: the Half-Action and the Move it paid for, together.
        assert.deepEqual({ halfActions: c.first.budget.halfActions, paid: c.first.getFlag("azeroth-rpg", "moveHalves") }, { halfActions: 1, paid: 1 });
        // And why: the charge left with no turn on it.
        assert.isFalse(held.stamped, `the charge went out with core's turn stamp (${held.stamp})`);
      } finally {
        await clearBoard(scene, combat, tokens, watch);
      }
    });

    it("leaves the tracker where the next click put it when the system's own turn reset lands after it", async function () {
      this.timeout(120000);
      const { combat, tokens, c } = await threeInAFight(scene, "Reset");
      // A reset that changes nothing is diffed away and never sent, so Second
      // spends its Reaction first: its turn's reset then has one to put back.
      const reacted = await c.second.spendAction("reaction");
      assert.isTrue(reacted.ok, "Second's Reaction was refused");
      await until(() => c.second.budget.reactions === 0, "Second's Reaction spent");
      // Second's turn opens with its budget reset (`_onStartTurn`): that is the
      // write held, and the click after it lands first.
      const watch = watchWrites(request => namesFlag(request, c.second.id, "budget"), { hold: true });
      const secondsTurn = untilHook("combatTurnChange", 60000, (combat_, prior, current) => combat_.id === combat.id && current?.combatantId === c.second.id);
      const thirdsTurn = untilHook("combatTurnChange", 60000, (combat_, prior, current) => combat_.id === combat.id && current?.combatantId === c.third.id);
      try {
        await combat.nextTurn();
        const held = await Promise.race([watch.heldOne, new Promise((_, r) => setTimeout(() => r(new Error("Second's turn reset was never sent")), 15000))]);
        assert.equal(combat.combatant?.id, c.second.id);

        await combat.nextTurn();
        await thirdsTurn;
        assert.equal(combat.combatant?.id, c.third.id, "the second click did not reach Third");

        await watch.release();
        await secondsTurn;
        await until(() => c.second.budget.reactions === 1, "Second's held reset to land");
        await settle();
        assert.equal(combat.combatant?.id, c.third.id,
          `the late reset put the tracker back on ${combat.combatant?.name}: the turn is ${combat.turn}`);
        assert.equal(combat.turn, 2);
        // And why: the reset left with no turn on it.
        assert.isFalse(held.stamped, `the turn's reset went out with core's turn stamp (${held.stamp})`);
      } finally {
        await clearBoard(scene, combat, tokens, watch);
      }
    });

    it("keeps core's stamp on a side write, so the fight reorders and the creature whose turn it is keeps it, and on an initiative write", async function () {
      this.timeout(120000);
      const { combat, tokens, c } = await threeInAFight(scene, "Side");
      const watch = watchWrites();
      try {
        await nextTurn(combat);
        await nextTurn(combat);
        assert.equal(combat.combatant?.id, c.third.id);
        watch.seen.length = 0;

        // Second to the other side: the hostile side (30 and 10) still leads,
        // so the order is First, Third, Second and Third moves up to index 1.
        await c.second.setSide("friendly");
        await until(() => combat.turns.map(t => t.id).join() === [c.first.id, c.third.id, c.second.id].join(), "the fight to reorder");
        await settle();
        assert.equal(combat.combatant?.id, c.third.id, `the reorder handed the turn to ${combat.combatant?.name}`);
        assert.equal(combat.turn, 1);
        // And why: the side write kept core's stamp, at Third's new place.
        const side = watch.seen.find(r => r.ids.includes(c.second.id) && r.updates.some(u => "side" in (u.flags?.["azeroth-rpg"] ?? {})));
        assert.ok(side, "the side write was never seen leaving");
        assert.isTrue(side.stamped, "a side write went out without core's turn stamp");
        assert.equal(side.stamp, 1, "core's stamp is not Third's place in the new order");

        // An initiative write keeps its stamp as core made it.
        watch.seen.length = 0;
        await c.first.update({ initiative: 99 });
        const initiative = watch.seen.find(r => r.ids.includes(c.first.id) && r.updates.some(u => "initiative" in u));
        assert.ok(initiative, "the initiative write was never seen leaving");
        assert.isTrue(initiative.stamped, "an initiative write went out without core's turn stamp");
        assert.equal(initiative.stamp, combat.turns.findIndex(t => t.id === c.third.id));
        await settle();
        assert.equal(combat.combatant?.id, c.third.id);
      } finally {
        watch.restore();
        await clearBoard(scene, combat, tokens, null);
      }
    });

    it("keeps core's stamp on a bookkeeping write when the fight's order moved under it", async function () {
      this.timeout(120000);
      const { combat, tokens, actors, c } = await threeInAFight(scene, "Moved");
      const watch = watchWrites();
      try {
        await nextTurn(combat);
        await nextTurn(combat);
        assert.equal(combat.combatant?.id, c.third.id);

        // Third's Initiative rises past Second's mid-round. Core re-sorts a fight
        // only on a combatant write, so the standing order is now stale.
        await actors.third.update({ "system.initiative": 25 });
        await until(() => c.third.derivedInitiative === 25, "Third's Initiative to be 25");
        assert.equal(combat.turns.map(t => t.id).join(), [c.first.id, c.second.id, c.third.id].join(), "the fight re-sorted before any combatant write");
        assert.equal(combat._order().join(), [c.first.id, c.third.id, c.second.id].join(), "the live order did not move");

        watch.seen.length = 0;
        const spent = await c.third.spendAction("half");
        assert.isTrue(spent.ok, "Third's Half-Action was refused");
        await until(() => combat.turns.map(t => t.id).join() === [c.first.id, c.third.id, c.second.id].join(), "the fight to re-sort");
        await settle();
        assert.equal(combat.combatant?.id, c.third.id, `the re-sort handed the turn to ${combat.combatant?.name}`);
        assert.equal(combat.turn, 1);
        // And why: the write kept core's stamp, at Third's place in the live order.
        const write = watch.seen.find(r => r.ids.includes(c.third.id) && r.updates.some(u => "budget" in (u.flags?.["azeroth-rpg"] ?? {})));
        assert.ok(write, "the budget write was never seen leaving");
        assert.isTrue(write.stamped, "a bookkeeping write on a fight whose order moved went out unstamped");
        assert.equal(write.stamp, 1, "core's stamp is not Third's place in the live order");
      } finally {
        watch.restore();
        await clearBoard(scene, combat, tokens, null);
      }
    });

    it("sends a round's own bookkeeping unstamped and its Initiative stamped", async function () {
      this.timeout(120000);
      const { combat, tokens, actors, c } = await threeInAFight(scene, "Round");
      const watch = watchWrites();
      try {
        // Give the round's start something of each kind to write: a budget to
        // reset (a fresh one is diffed away), a round record to clear, an
        // Initiative to re-derive, and First's turn to mark as ended.
        const spent = await c.first.spendAction("half");
        assert.isTrue(spent.ok, "First's Half-Action was refused");
        await until(() => c.first.budget.halfActions === 1, "First's Half-Action spent");
        await c.second.setFlag("azeroth-rpg", "round", { number: combat.round, struck: true });
        await actors.second.update({ "system.initiative": 21 });
        await until(() => c.second.derivedInitiative === 21, "Second's Initiative to be 21");
        watch.seen.length = 0;
        const round = combat.round;
        const turned = untilHook("combatTurnChange", 60000, cb => cb.id === combat.id);
        await combat.nextRound();
        await turned;
        await until(() => combat.round === round + 1 && c.second.getFlag("azeroth-rpg", "round") === undefined, "the round's start to clear the round record");
        await until(() => c.second.initiative === 21, "the new round's Initiative to land");
        await settle();

        const kinds = { budget: 0, round: 0, acted: 0, initiative: 0 };
        for (const row of watch.seen) {
          const scoped = row.updates.flatMap(u => Object.keys(u.flags?.["azeroth-rpg"] ?? {}));
          const names = row.updates.some(u => "initiative" in u);
          for (const key of scoped) if (key in kinds) kinds[key] += 1;
          if (names) {
            kinds.initiative += 1;
            assert.isTrue(row.stamped, `an Initiative write went out unstamped: ${JSON.stringify(row.updates)}`);
          } else if (scoped.length && row.updates.every(u => Object.keys(u).every(k => k === "_id" || k === "flags"))) {
            assert.isFalse(row.stamped, `a bookkeeping write went out with core's stamp: ${JSON.stringify(row.updates)}`);
          }
        }
        for (const [kind, n] of Object.entries(kinds)) assert.isAbove(n, 0, `the round sent no ${kind} write, so this proved nothing about it`);
        assert.equal(combat.combatant?.id, c.first.id, "the new round did not open on First");
      } finally {
        watch.restore();
        await clearBoard(scene, combat, tokens, null);
      }
    });
  });
}
