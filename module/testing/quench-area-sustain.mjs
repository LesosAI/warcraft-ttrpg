/**
 * AN AREA TAKEN OFF BY HAND ENDS ITS SUSTAIN (D-760; the lead, 2026-09-29:
 * *Deleting ends it*), inside a live world.
 *
 * D-756 built one direction - a Sustain that ends takes its area off the board
 * (`canvas/sustained-areas.mjs`, watching the caster's flag) - and nothing the
 * other way: a Region deleted by a person left the caster paying the upkeep
 * for an area that was no longer there. The pure judgement and the door's
 * wiring have their Vitests (`area-doors.test.mjs`). What none of them can
 * reach is core's own deletion on a prepared world:
 *
 * 1. a real Consecration placed off its card by the card's own door, its
 *    upkeep charged at a real turn, the Region deleted by hand, the Sustain
 *    ended by the active GM's hook, and the next round charging nothing and
 *    striking nobody;
 * 2. the Sustain ended at the Stop door taking its area away ONCE - the sweep's
 *    own deletion marked, read as no hand's, with no second end and no error
 *    from a double delete (core raises one however the promise is caught);
 * 3. an attached area deleted by core with its caster's token, and an area
 *    that went with its scene, ending nothing.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15): the end runs on the
 * active GM's client, queued behind every area pass, after the deletion that
 * began it.
 */

import {
  cleanup, drainAreaWork, errorsDuring, fromPack, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings
} from "./fixtures.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { sweepAreas } from "../canvas/sustained-areas.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

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

/**
 * Record every `ui.notifications.info` while `fn` runs, and say nothing:
 * `fixtures.mjs#warnings`' twin, for the words a Sustain's end is said in.
 */
async function infosDuring(fn) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const held = ui.notifications.info;
  const said = [];
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    await fn();
  } finally {
    if (own) ui.notifications.info = held;
    else delete ui.notifications.info;
  }
  return said;
}

/** Whether an actor still holds the Sustain one cast wrote. */
const holds = (actor, cast) => (actor.getFlag("azeroth-rpg", "sustaining") ?? []).some(entry => entry?.cast === cast);

const health = actor => actor.system.health.value;
const manaOf = actor => actor.poolSnapshot().find(p => p.name === "mana")?.value ?? null;

/** Every Power pool at its cap: a cast and a Sustain pay first (07 §8, 05 §12). */
async function fillMana(actor) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
  await until(() => (manaOf(actor) ?? 0) >= 4, `${actor.name}'s Mana`);
}

/** A creature's Power, filled past anything these casts cost: its pool names no type (D-637). */
async function fillPower(npc, value = 40) {
  await npc.update({ "system.power.max": value, "system.power.value": value });
  await until(() => npc.system.power.value === value, `${npc.name}'s Power`);
}

/** Linked tokens for these actors on the scene, at a disposition (core's default is HOSTILE). */
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
    const token = a.getActiveTokens(true)[0]?.document;
    return { actorId: a.id, tokenId: token?.id ?? null, sceneId: scene.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  return combat;
}

/** Move the turn on and wait for its ticks: `combatTurnChange` follows them. */
async function nextTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await settled;
}

/** A cast through the workflow, the Test pinned to succeed. */
async function cast(actor, spell) {
  const unpin = pinDie(18);
  try {
    return await game.system.azeroth.workflows.castSpell({ actor, spell, dc: 5, targets: [] });
  } finally {
    unpin();
  }
}

/** A board press at a canvas point: what a Place area's click waits for (quench-paladin's shape). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** The card's own Place area, with a press on the board where the area goes. */
async function placeFromCard(card, point) {
  const placing = CARD_ACTIONS.placeArea({ dataset: {} }, card);
  pressBoard(point);
  return placing;
}

/** The fight, the tokens, then the areas nothing swept, and every pass they started. */
async function clearBoard(scene, combat, tokens) {
  await settle();
  if (combat) await combat.delete().catch(() => {});
  canvas?.tokens?.releaseAll?.();
  const ids = (tokens ?? []).map(t => t.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids).catch(() => {});
  await sweepAreas();
  const left = scene.regions.map(r => r.id);
  if (left.length) await scene.deleteEmbeddedDocuments("Region", left).catch(() => {});
  await drainAreaWork();
}

export function areaSustainBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("An area taken off by hand ends its Sustain (D-760)", function () {
    let restore = null;
    let wasViewing = null;
    let scene = null;

    before(async function () {
      this.timeout(60000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Hand Areas", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(180000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // FIGHTS FIRST, then the scene, then everything else - and every pass of
      // ours that is owed runs out BEFORE the scene goes (the full-suite fix of D-757).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("ends the Sustain a Consecration placed off its card held when a hand deletes the area, and the next round charges nothing and strikes nobody", async function () {
      this.timeout(300000);
      const paladin = await makeCharacter({ name: "ZZ Hand Paladin", classes: [["Paladin", 5]], spells: ["Consecration"], abilities: { dex: 20 } });
      await paladin.setParty(true);
      await fillMana(paladin);
      const bandit = await makeNpc("Bandit");
      // A 20 ft radius at (1500, 1000) holds the bandit's square.
      const tokens = await place(scene, [
        { actor: paladin, x: 300, y: 300 },
        { actor: bandit, x: 1500, y: 1000, disposition: "HOSTILE" }
      ]);
      let combat = null;
      try {
        combat = await fightOver(scene, [paladin, bandit]);
        assert.equal(combat.combatant?.actorId, paladin.id, "the Paladin does not lead the fight");
        const spell = paladin.items.find(i => i.type === "spell" && i.name === "Consecration");
        const card = await cast(paladin, spell);
        assert.ok(card, "the cast posted no card");
        made.push(card);
        const { cast: key, sustained, success } = card.flags["azeroth-rpg"];
        assert.isTrue(success, "a natural 18 failed the Casting Test");
        assert.isTrue(sustained, "the card recorded no Sustain");
        assert.isTrue(holds(paladin, key), "no Sustain entry for the cast");

        // THE CARD'S OWN DOOR, pressed where the area goes.
        const region = await placeFromCard(card, { x: 1500, y: 1000 });
        assert.ok(region, "Place area placed nothing");
        assert.equal(region.getFlag("azeroth-rpg", "cast"), key, "the Region does not record the cast");
        assert.isTrue(region.getFlag("azeroth-rpg", "sustained"), "the Region does not record the Sustain");
        await drainAreaWork();
        assert.isTrue(scene.regions.has(region.id), "the area was swept the moment it landed");

        // WHILE IT IS HELD, the Paladin's next turn pays for it.
        const paid = manaOf(paladin);
        await nextTurn(combat);
        await nextTurn(combat);
        assert.equal(combat.combatant?.actorId, paladin.id, "the round did not come back to the Paladin");
        await until(() => manaOf(paladin) === paid - 1, "the upkeep charged while the Sustain is held");

        // BY HAND: the Region deleted, as a GM's Delete does.
        const said = await infosDuring(async () => {
          await region.delete();
          await until(() => !holds(paladin, key), "the Sustain ending with its area");
          await drainAreaWork();
        });
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Area.SustainTakenOff", { name: paladin.name, spell: "Consecration" }),
          "the end was not said in words");
        assert.lengthOf(paladin.getFlag("azeroth-rpg", "sustaining") ?? [], 0, "the Paladin still sustains something");

        // THE NEXT ROUND: no upkeep, no line saying one was paid, and no strike.
        const mana = manaOf(paladin);
        const hp = health(bandit);
        const since = game.messages.size;
        await nextTurn(combat);
        await nextTurn(combat);
        assert.equal(combat.combatant?.actorId, paladin.id, "the round did not come back to the Paladin");
        await settle();
        assert.equal(manaOf(paladin), mana, "the upkeep was charged after the area was taken off");
        // 07's Consecration names its own upkeep, 1 Mana (D-778).
        const paidLine = game.i18n.format("AZEROTH.Combat.SustainPaidMana", { name: paladin.name, count: 1, mana: 1, health: 0 });
        assert.isFalse(game.messages.contents.slice(since).some(m => m.content.includes(paidLine)), "a card says the upkeep was paid");
        assert.equal(health(bandit), hp, "the area struck the bandit after it was taken off");
        // And the card will not put it back: taking it off ended the spell.
        const standing = scene.regions.size;
        const refused = await warnings(async () => {
          assert.isNull(await CARD_ACTIONS.placeArea(null, card), "an ended Sustain's card placed its area again");
        });
        assert.include(refused.join(" "), game.i18n.format("AZEROTH.Area.NotSustained", { name: "Consecration" }), "the refusal was not said");
        assert.equal(scene.regions.size, standing, "an area was placed for an ended Sustain");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: paladin }).catch(() => {});
        await clearBoard(scene, combat, tokens);
      }
    });

    it("takes the area away ONCE when its Sustain ends at the Stop: the sweep's own delete ends nothing more, and nothing errors", async function () {
      this.timeout(180000);
      const paladin = await makeCharacter({ name: "ZZ Stopping Paladin", classes: [["Paladin", 5]], spells: ["Consecration"] });
      await fillMana(paladin);
      const tokens = await place(scene, [{ actor: paladin, x: 300, y: 300 }]);
      try {
        const spell = paladin.items.find(i => i.type === "spell" && i.name === "Consecration");
        const card = await cast(paladin, spell);
        made.push(card);
        const key = card.flags["azeroth-rpg"].cast;
        const region = await placeFromCard(card, { x: 1500, y: 1000 });
        assert.ok(region, "Place area placed nothing");
        await drainAreaWork();
        assert.isTrue(scene.regions.has(region.id), "the area was swept the moment it landed");

        let said = [];
        const errors = await errorsDuring(async () => {
          said = await infosDuring(async () => {
            await game.system.azeroth.workflows.endSustain({ actor: paladin, spellId: spell.id });
            await until(() => !scene.regions.has(region.id), "the area going with its Sustain");
            await drainAreaWork();
            // Long enough for a second delete or a second end to have arrived.
            await new Promise(r => setTimeout(r, 500));
            await drainAreaWork();
          });
        });
        assert.deepEqual(errors, [], "the area's going raised an error: a double delete, or a write to something gone");
        assert.isFalse(holds(paladin, key), "the Stop did not end the Sustain");
        const dropped = game.i18n.format("AZEROTH.Combat.SustainDropped", { name: paladin.name, spell: "Consecration" });
        const takenOff = game.i18n.format("AZEROTH.Area.SustainTakenOff", { name: paladin.name, spell: "Consecration" });
        assert.lengthOf(said.filter(s => s === dropped), 1, "the Stop was not said once");
        assert.notInclude(said.join(" "), takenOff, "the sweep's own delete was read as a hand taking the area off");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: paladin }).catch(() => {});
        await clearBoard(scene, null, tokens);
      }
    });

    it("ends nothing when an attached area goes with its caster's token, or an area goes with its scene", async function () {
      this.timeout(240000);
      const hellfire = await fromPack("azeroth-rpg.spells", "Hellfire");
      assert.match(hellfire.system.target ?? "", /centered on you/i, "Hellfire is not centred on its caster, so nothing attaches");
      const warlock = await makeNpc("Sorceress");
      await warlock.update({ name: "ZZ Hellfire Sorceress" });
      await fillPower(warlock);
      const tokens = await place(scene, [{ actor: warlock, x: 1500, y: 1000, disposition: "HOSTILE" }]);
      const token = tokens[0];
      let elsewhere = null;
      try {
        const card = await cast(warlock, hellfire);
        made.push(card);
        const key = card.flags["azeroth-rpg"].cast;
        assert.isTrue(holds(warlock, key), "the Sorceress holds no Hellfire");
        // Self-centred: the card's door lays it on the caster's token, attached, with no press.
        const region = await CARD_ACTIONS.placeArea({ dataset: {} }, card);
        assert.ok(region, "Place area placed nothing");
        assert.equal(region._source.attachment?.token, token.id, "Hellfire's area is not attached to its caster's token");
        await drainAreaWork();

        // THE TOKEN GOES, and core takes its attached area with it: no hand took it off.
        const errors = await errorsDuring(async () => {
          await token.delete();
          await until(() => !scene.regions.has(region.id), "the attached area going with its token");
          await drainAreaWork();
        });
        assert.deepEqual(errors, [], "the token's going raised an error");
        assert.isTrue(holds(warlock, key), "an area deleted with its caster's token ended the Sustain");

        // THE SCENE GOES, and its areas with it: nothing ends either.
        await game.system.azeroth.workflows.endAllSustains({ actor: warlock });
        const again = await cast(warlock, hellfire);
        made.push(again);
        const second = again.flags["azeroth-rpg"].cast;
        elsewhere = await Scene.create({ name: "ZZ Hand Areas Elsewhere", width: 1000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
        made.push(elsewhere);
        const far = await placeArea({ item: hellfire, scene: elsewhere, origin: { x: 500, y: 500 }, flags: regionFlagsFromCard(again, warlock, hellfire) });
        assert.ok(far, "no Region was laid on the other scene");
        await drainAreaWork();
        assert.isTrue(elsewhere.regions.has(far.id), "the other scene's area was swept the moment it landed");
        await elsewhere.delete();
        made.splice(made.indexOf(elsewhere), 1);
        elsewhere = null;
        await drainAreaWork();
        assert.isTrue(holds(warlock, second), "an area deleted with its scene ended the Sustain");
      } finally {
        await game.system.azeroth.workflows.endAllSustains({ actor: warlock }).catch(() => {});
        if (elsewhere) {
          await drainAreaWork();
          await elsewhere.delete().catch(() => {});
        }
        await clearBoard(scene, null, tokens);
      }
    });
  });
}
