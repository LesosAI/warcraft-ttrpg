/**
 * **05's MOVING THROUGH A SPACE, AT THE MOVE DOOR** (05 §Size: *You may move through the space of a creature two or
 * more sizes larger than you, and it may move through yours. Neither of you may end a Move there*; 07's Veil of Mist;
 * FIXC, O-476). The pure law is `module/rules/move-through.test.mjs`; this batch drives core's own move
 * (`TokenDocument#move`, which a drag ends in) on a started fight, on the mover's turn, and reads what the door
 * judges of the very movement core built.
 *
 * **A Quench run is a GM's, and a GM's drag is not refused** (the brief): so each move is made for real and lands,
 * which is the GM's half, and the movement core handed `preMoveToken` is judged again for a player through the
 * door's own `user` (`moveThroughRefusalFor(document, movement, {user})`). The player's own refused drag, end to end
 * on a player's client, is `tests/e2e/move-through-player.spec.mjs`.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.move-through`.
 */

import { cleanup, made, makeCharacter, makeNpc, quietScrollingText, warnings } from "./fixtures.mjs";
import { fightWith, freshTurn, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castOk } from "./quench-necromancer-spells.mjs";
import { moveThroughRefusalFor } from "../documents/combat.mjs";
import { VEIL_FLAG } from "../rules/sovereign-spells.mjs";

const SCOPE = "azeroth-rpg";
const PLAYER = Object.freeze({ isGM: false, name: "a player" });
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;

/** A bestiary creature, named for the test, at full Health, at a size. */
async function creature(entry, name, size = null) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.value": npc.system.health.max, ...(size ? { "system.size": size } : {}) });
  return npc;
}

/**
 * Move a token through core's own door and keep the movement core handed `preMoveToken`: whether the move landed, the
 * warnings said, and the movement.
 */
async function moveAndKeep(actor, waypoints) {
  const doc = tokenOf(actor).document;
  let movement = null;
  const id = Hooks.on("preMoveToken", (d, m) => { if (d.id === doc.id) movement = m; });
  let moved = false;
  try {
    const said = await warnings(async () => { moved = await doc.move(waypoints); });
    const last = Array.isArray(waypoints) ? waypoints.at(-1) : waypoints;
    if (moved) await until(() => doc.x === last.x && doc.y === last.y, `${actor.name}'s token to arrive`, 20000);
    return { doc, moved, said, movement };
  } finally {
    Hooks.off("preMoveToken", id);
  }
}

/** Put a token back where it started, as a displacement a GM makes (which the door never judges). */
async function putBack(actor, x, y) {
  const doc = tokenOf(actor).document;
  await doc.move({ x, y, action: "displace" });
  await until(() => doc.x === x && doc.y === y, `${actor.name}'s token back`, 20000);
}

export function moveThroughBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("05's Moving through a space and the permissions that lift it (FIXC, O-476)", function () {
    let restoreText = null;
    let mover, footman, giant, gnome, sov, combat;

    before(async function () {
      this.timeout(240000);
      restoreText = await quietScrollingText();
      mover = await makeCharacter({ name: "ZZ Through Human", classes: [["Warrior", 3]], race: "Human" });
      gnome = await makeCharacter({ name: "ZZ Through Gnome", classes: [["Rogue", 3]], race: "Gnome" });
      sov = await makeCharacter({ name: "ZZ Through Sovereign", classes: [["Sovereign", 11]], race: "San'layn", spells: ["Veil of Mist"], abilities: { con: 16, cha: 16, dex: 14 } });
      await sov._talentGrant;
      await until(() => vitaeOf(sov), "the Sovereign's Vitae");
      const pool = vitaeOf(sov);
      await sov.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max }, {}, { vitaeGain: "hand" });
      footman = await creature("Alliance Footman", "Through Footman");
      giant = await creature("Alliance Footman", "Through Giant", "huge");
      // Row 1000: the human walks east past the footman (1100) and the giant (1300). Row 1400: the gnome. Row 1800: the Sovereign.
      await sceneWith([
        { actor: mover, x: 1000, y: 1000 },
        { actor: footman, x: 1100, y: 1000, side: "hostile" },
        { actor: giant, x: 1300, y: 1000, side: "hostile" },
        { actor: gnome, x: 1000, y: 1400 },
        { actor: sov, x: 1000, y: 1800 }
      ]);
      combat = await fightWith([mover, footman, giant, gnome, sov]);
    });

    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      // Core's `_onExit` clears each combatant token's movement history after the fight is deleted, unawaited
      // (14.367 `Combat#_clearMovementHistoryOnExit`); a scene deleted first made that write a page error. Wait for it.
      for (const scene of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) {
        await until(() => [...scene.tokens].every(t => !(t._source?._movementHistory?.length)), "the fight's movement histories cleared", 15000).catch(() => {});
      }
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("a GM's walk through a creature of the same size lands, and the same walk by a player is refused, naming it", async function () {
      this.timeout(120000);
      await freshTurn(mover, 2);
      const walk = await moveAndKeep(mover, { x: 1200, y: 1000 });
      assert.isTrue(walk.moved, `the GM's move landed (${walk.said.join(" | ")})`);
      assert.notOk(walk.said.some(w => /space/.test(w)), "nothing said to the GM");
      assert.ok(walk.movement, "core handed the hook its movement");
      assert.deepInclude(moveThroughRefusalFor(walk.doc, walk.movement, { user: PLAYER }), { kind: "through", name: "ZZ Through Footman" });
      assert.isNull(moveThroughRefusalFor(walk.doc, walk.movement, { user: game.user }), "the GM's own move is not judged");
      await putBack(mover, 1000, 1000);
    });

    it("a player may pass a creature two sizes larger, and may not stop in its space", async function () {
      this.timeout(120000);
      await freshTurn(mover, 2);
      // Past the footman first would be refused; go round it on row 1100, then through the giant at 1300.
      const round = await moveAndKeep(mover, [{ x: 1100, y: 1100 }, { x: 1200, y: 1100 }, { x: 1200, y: 1000 }, { x: 1400, y: 1000 }]);
      assert.isTrue(round.moved);
      assert.isNull(moveThroughRefusalFor(round.doc, round.movement, { user: PLAYER }), "through a Huge creature: 05 lets a Medium mover pass");
      await putBack(mover, 1200, 1000);
      const stop = await moveAndKeep(mover, { x: 1300, y: 1000 });
      assert.deepInclude(moveThroughRefusalFor(stop.doc, stop.movement, { user: PLAYER }), { kind: "end", name: "ZZ Through Giant" });
      await putBack(mover, 1000, 1000);
    });

    it("a displacement and a move off the mover's turn are never judged", async function () {
      this.timeout(120000);
      await freshTurn(mover, 2);
      const shove = await moveAndKeep(mover, { x: 1200, y: 1000, action: "displace" });
      assert.isNull(moveThroughRefusalFor(shove.doc, shove.movement, { user: PLAYER }), "a displacement is no willing move");
      await putBack(mover, 1000, 1000);
      await freshTurn(footman, 1);
      const offTurn = await moveAndKeep(mover, { x: 1200, y: 1000 });
      assert.isNull(moveThroughRefusalFor(offTurn.doc, offTurn.movement, { user: PLAYER }), "not the mover's turn");
      await putBack(mover, 1000, 1000);
    });

    it("Underfoot: a Small gnome passes a Medium creature, and still may not stop in its space", async function () {
      this.timeout(120000);
      await putBack(footman, 1100, 1400);
      try {
        await freshTurn(gnome, 2);
        const walk = await moveAndKeep(gnome, { x: 1200, y: 1400 });
        assert.isNull(moveThroughRefusalFor(walk.doc, walk.movement, { user: PLAYER }), "any creature larger than you");
        await putBack(gnome, 1000, 1400);
        const stop = await moveAndKeep(gnome, { x: 1100, y: 1400 });
        assert.deepInclude(moveThroughRefusalFor(stop.doc, stop.movement, { user: PLAYER }), { kind: "end" });
        await putBack(gnome, 1000, 1400);
      } finally { await putBack(footman, 1100, 1000); }
    });

    it("Veil of Mist, cast from the sheet: the Sovereign moves through a creature's space whatever its size, and cannot end a Move there", async function () {
      this.timeout(180000);
      await putBack(footman, 1100, 1800);
      try {
        await freshTurn(sov, 2);
        const before = await moveAndKeep(sov, { x: 1200, y: 1800 });
        assert.deepInclude(moveThroughRefusalFor(before.doc, before.movement, { user: PLAYER }), { kind: "through" }, "refused before the Veil");
        await putBack(sov, 1000, 1800);
        await freshTurn(sov, 2);
        await castOk(sov, "Veil of Mist");
        await until(() => sov.effects.find(e => e.flags?.[SCOPE]?.[VEIL_FLAG]?.through === true), "the Veil's own effect, with its through");
        const walk = await moveAndKeep(sov, { x: 1200, y: 1800 });
        assert.isNull(moveThroughRefusalFor(walk.doc, walk.movement, { user: PLAYER }), "through a Medium footman under the Veil");
        await putBack(sov, 1000, 1800);
        const stop = await moveAndKeep(sov, { x: 1100, y: 1800 });
        assert.deepInclude(moveThroughRefusalFor(stop.doc, stop.movement, { user: PLAYER }), { kind: "end" }, "and you cannot end a Move there");
        await putBack(sov, 1000, 1800);
      } finally { await putBack(footman, 1100, 1000); }
    });
  });
}
