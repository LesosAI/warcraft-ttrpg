/**
 * A PLAYER CHARACTER'S TOKEN SEES (D-759; the lead, 2026-09-29: *Yes, with
 * migration*), inside a live world.
 *
 * Players saw nothing on a scene with Token Vision, because
 * `rules/tokens.mjs#CHARACTER_TOKEN` set no `sight` and core's default is OFF:
 * a token with no sight gives its owner no vision source (14.367,
 * `client/canvas/placeables/token.mjs#_isVisionSource`), and a player with no
 * vision source sees a black board. The pure rule and the migration's builders
 * have their Vitests (`tokens.test.mjs`, `0.12.15-character-sight.test.mjs`).
 * What none of them can reach is core's own perception on a prepared board:
 *
 * 1. a character the CREATOR makes - `apply(state)`, the door a player uses -
 *    whose token becomes a vision source for its owner, sees a creature across
 *    a lit room, and sees nothing of it once the room is dark (range 0 and
 *    `basic`: no darkvision, which is a separate rules question);
 * 2. migration 0.12.15 turning a blind character's prototype and its placed
 *    tokens, linked and unlinked, back on - a range a GM set kept, a
 *    disposition a GM chose kept, a creature's token untouched - and a second
 *    run finding nothing.
 *
 * **A player is stubbed, never faked by a second client**: `asPlayer` defines
 * `game.user.isGM` false around SYNCHRONOUS reads alone (`quench-animation.mjs`'s
 * own shape), so no awaited write and no other module's listener sees it.
 */

import { cleanup, drainAreaWork, fromPack, made, makeCharacter, makeNpc, settle, PACK_FOR } from "./fixtures.mjs";

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

/** Run a synchronous read with this user reading the world as a PLAYER. */
function asPlayer(fn) {
  Object.defineProperty(game.user, "isGM", { value: false, configurable: true });
  try {
    return fn();
  } finally {
    delete game.user.isGM;
  }
}

/** 01 §9's Kaelen Voss through the creator's own `apply`: `quench-phase9.mjs`'s state, renamed. */
async function kaelen(name) {
  const uuidOf = async (packId, entry) => (await fromPack(packId, entry)).uuid;
  const road = [];
  for (const entry of ["Bedroll", "Waterskin", "Tinderbox", "Hardtack, a week", "Rope, 50 ft (hemp)"]) {
    road.push({ uuid: await uuidOf(PACK_FOR.equipment, entry), quantity: 1, road: true });
  }
  return {
    race: await uuidOf(PACK_FOR.race, "Human"),
    cls: await uuidOf(PACK_FOR.class, "Warrior"),
    method: "array",
    abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    rolled: null,
    career: await uuidOf(PACK_FOR.career, "Grave-Tender"),
    allowTier2: false,
    ranks: { athletics: 3, survival: 2 },
    adaptable: "perception",
    racialTalent: "Refugee's Road",
    classTalent: "wide-swing",
    spells: [],
    side: null,
    equipment: [
      { uuid: await uuidOf(PACK_FOR.armor, "Studded leather"), quantity: 1, road: false },
      { uuid: await uuidOf(PACK_FOR.weapon, "Greataxe"), quantity: 1, road: false },
      ...road
    ],
    name,
    img: "icons/svg/mystery-man.svg",
    motive: "The dead of Lordaeron do not stay down."
  };
}

/** A token for this actor on the scene, from its own prototype, drawn. */
async function place(scene, actor, { x, y, ...rest }) {
  const data = (await actor.getTokenDocument({ x, y, ...rest })).toObject();
  const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
  await until(() => canvas.tokens.get(doc.id)?.center, `${actor.name}'s token drawn`);
  return doc;
}

export function visionBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A player character's token sees (D-759)", function () {
    let wasViewing = null;

    before(function () {
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });

    after(async function () {
      this.timeout(120000);
      canvas?.tokens?.releaseAll?.();
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      // Every pass a token's create or delete queued runs out before a scene goes.
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("gives a character the creator makes a token that sees what is lit in its line of sight, and nothing in the dark", async function () {
      this.timeout(180000);
      const creator = new (game.system.azeroth.creator)({});
      const result = await creator.apply(await kaelen("ZZ Seeing Kaelen"));
      assert.isTrue(result.ok, JSON.stringify(result.reasons));
      const actor = result.actor;
      made.push(actor);

      // THE PROTOTYPE: sight on, and nothing else in it decided - core's own
      // range 0 and `basic`, because darkvision is a separate rules question.
      const sight = actor.prototypeToken.sight;
      assert.isTrue(sight.enabled, "the creator made a character whose token is blind");
      assert.equal(sight.range, 0, "the creator gave the character a vision range");
      assert.equal(sight.visionMode, "basic", "the creator gave the character a vision mode");

      // A LIT ROOM with Token Vision: Global Illumination on, no walls, a ghoul
      // nineteen squares away across it. **No padding**: core skips a vision
      // source standing in the padding when it tests a point inside the scene
      // (14.367, `CanvasVisibility#testVisibility`), and the default quarter
      // would put a token at x 500 outside the scene's own rectangle.
      const scene = await Scene.create({
        name: "ZZ Vision Room", width: 3000, height: 2000, padding: 0, tokenVision: true,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" },
        environment: { darknessLevel: 0, globalLight: { enabled: true } }
      });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the lit room on the board", 30000);
      assert.isTrue(canvas.visibility.tokenVision, "the scene does not use Token Vision, so this proves nothing");
      await until(() => canvas.environment.globalLightSource.active, "the room's Global Illumination");

      const ghoulActor = await makeNpc("Plagued Ghoul");
      const mine = await place(scene, actor, { x: 500, y: 1000 });
      const theirs = await place(scene, ghoulActor, { x: 2400, y: 1000 });
      // A copy of the same character set BLIND, which is every character token before D-759.
      const blindDoc = await place(scene, actor, { x: 500, y: 1400, sight: { enabled: false } });
      assert.isTrue(mine.sight.enabled, "the placed token does not carry the prototype's sight");
      assert.isFalse(blindDoc.sight.enabled, "the blind copy sees, so this proves nothing");
      const token = canvas.tokens.get(mine.id);
      const ghoul = canvas.tokens.get(theirs.id);
      const blind = canvas.tokens.get(blindDoc.id);
      canvas.tokens.releaseAll();
      await settle();

      try {
        // THE FAULT'S OWN DOOR: whether core makes the token a vision source for
        // a player who owns it. A blind token never is, and that is a black board.
        assert.isTrue(asPlayer(() => token._isVisionSource()), "the owner of a sighted character is given no vision source");
        assert.isFalse(asPlayer(() => blind._isVisionSource()), "a blind token became a vision source, so this proves nothing");

        // Controlled, the sighted token IS the eyes, and core's own test says
        // what it sees: the ghoul across the lit room. A token is controlled
        // only while its layer is the active one (14.367, `PlaceableObject#control`).
        canvas.tokens.activate();
        assert.isTrue(token.control({ releaseOthers: true, force: true }), "the character's token could not be controlled");
        await until(() => token.vision?.active === true, "the character's vision source");
        assert.isTrue(token.hasSight);
        assert.isTrue(ghoul.isVisible, "a sighted character does not see a creature across a lit room");
        assert.isTrue(canvas.visibility.testVisibility({ x: 2800, y: 300, elevation: 0 }, { tolerance: 0 }),
          "a sighted character does not see the far corner of a lit room");

        // THE ROOM GOES DARK: range 0 perceives only what is lit, and nothing is.
        await scene.update({ "environment.globalLight.enabled": false });
        await until(() => canvas.environment.globalLightSource.active === false, "the room going dark");
        await until(() => ghoul.isVisible === false, "the ghoul lost in the dark", 10000);
        assert.isFalse(canvas.visibility.testVisibility({ x: 2800, y: 300, elevation: 0 }, { tolerance: 0 }),
          "a character with no darkvision sees the far corner of a dark room");
        assert.isTrue(token.isVisible, "the character cannot see its own token");

        // And a blind token, controlled, is no vision source at all: a GM sees
        // everything through it, and a player it belongs to would see nothing.
        assert.isTrue(blind.control({ releaseOthers: true, force: true }), "the blind copy could not be controlled");
        await settle();
        assert.notEqual(blind.vision?.active, true, "a blind token gave its controller a vision source");
      } finally {
        canvas.tokens.releaseAll();
      }
    });

    it("0.12.15 turns a blind character's sight on, prototype and placed, linked and unlinked, keeps what a GM set, and twice changes nothing", async function () {
      this.timeout(120000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.15-character-sight.mjs");
      const pc = await makeCharacter({ name: "ZZ Blinded PC" });
      assert.isTrue(pc.prototypeToken.sight.enabled, "a character made now is blind: `_preCreate` stamped nothing");
      // Stale it ON PURPOSE (CLAUDE.md §15): a GM set it blind with a range, and
      // NEUTRAL for a masquerade - a choice this version must not undo.
      await pc.update({
        "prototypeToken.sight.enabled": false,
        "prototypeToken.sight.range": 30,
        "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL
      });
      assert.isFalse(pc.prototypeToken.sight.enabled, "the stale did not take");

      // A scene of its own, never viewed.
      const scene = await Scene.create({ name: "ZZ Vision Migration", width: 1200, height: 1200, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      const npc = await makeNpc("Bandit");
      // ONE CREATE EACH: `createEmbeddedDocuments` makes no promise about the
      // order it hands a batch back in (fixtures.mjs), and a destructure by
      // position read the unlinked token as the linked one in the full suite.
      const tokenOn = async data => (await scene.createEmbeddedDocuments("Token", [data]))[0];
      const linked = await tokenOn({ name: pc.name, actorId: pc.id, actorLink: true, x: 100, y: 100,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, sight: { enabled: false, range: 15, visionMode: "darkvision" } });
      const unlinked = await tokenOn({ name: pc.name, actorId: pc.id, actorLink: false, x: 300, y: 100, sight: { enabled: false } });
      const creature = await tokenOn({ name: npc.name, actorId: npc.id, actorLink: false, x: 500, y: 100, sight: { enabled: false } });
      assert.isTrue(linked.actorLink && !unlinked.actorLink && creature.actorId === npc.id, "the three tokens are not the ones asked for");
      // The unlinked token's own Health, in its delta: linking would throw it away.
      await unlinked.actor.update({ "system.health.value": 3 });
      await until(() => unlinked.actor.system.health.value === 3, "the unlinked token's own Health");

      const logged = [];
      const touched = await migrate(line => logged.push(line));
      assert.isAtLeast(touched, 3, "the migration did not touch the prototype and both placed tokens");
      assert.ok(logged.some(l => l.includes(linked.id)) && logged.some(l => l.includes(unlinked.id)), "a placed token was touched and not logged");

      // The prototype sees; its range and the GM's disposition are kept.
      assert.isTrue(pc.prototypeToken.sight.enabled, "the prototype is still blind");
      assert.equal(pc.prototypeToken.sight.range, 30, "the prototype's range was clobbered");
      assert.equal(pc.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.NEUTRAL, "the migration re-stamped a disposition a GM chose");

      // The linked token sees, with the range and mode a GM gave it.
      const a = scene.tokens.get(linked.id);
      assert.isTrue(a.sight.enabled, "the linked token is still blind");
      assert.equal(a.sight.range, 15, "the linked token's range was clobbered");
      assert.equal(a.sight.visionMode, "darkvision", "the linked token's vision mode was clobbered");
      assert.equal(a.disposition, CONST.TOKEN_DISPOSITIONS.NEUTRAL, "the linked token's disposition was re-stamped");

      // The unlinked token sees, stays unlinked, and keeps its own Health.
      const b = scene.tokens.get(unlinked.id);
      assert.isTrue(b.sight.enabled, "the unlinked token is still blind");
      assert.isFalse(b.actorLink, "the migration linked a token and threw its delta away");
      assert.equal(b.actor.system.health.value, 3, "the unlinked token lost its own Health");

      // A creature's token is not a player character's.
      assert.isFalse(scene.tokens.get(creature.id).sight.enabled, "the migration gave a creature's token sight");

      // IDEMPOTENT: a second run has nothing left to do, here or anywhere.
      assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
    });
  });
}
