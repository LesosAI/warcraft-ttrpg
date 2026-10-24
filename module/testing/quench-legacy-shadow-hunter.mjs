/**
 * **THE SHADOW HUNTER'S TWELVE, LIVE** (04-TALENTS, the Troll's Legacy on the
 * Shaman; the Legacy branches' phase B6b). A troll Shaman holds the Shadow Hunter's
 * twelve beside the class's thirty-six (B5's door 1), and each talent here is pressed
 * through the sheet's own control or the attack door, its outcome read back off the
 * documents:
 *
 * - Big Bad Voodoo, pressed on the sheet, holds a Sustain of its own keyed
 *   `big-bad-voodoo` at 5 Mana a turn for 15 Mana, and its aura lays 07's Aegis
 *   floor's own flag on every ally within 20 feet - never on the shaman, never on an
 *   ally 35 feet off - holding that ally at 1 by any source with no Critical Injury
 *   refused; the Sustain ended, the floor goes and the ally falls;
 * - Troll's Blood refuses a hostile creature in words with nothing paid, and on a
 *   friend its card's Apply lays the rank plus 1 at the start of each of ten turns;
 * - Jinx's rider on a melee hit lays a Bane on the target's next Resilience Test, two
 *   at rank 2, for 2 Mana, and a ranged blow draws no Jinx;
 * - Cursed Prey at rank 2 prices Jinx at nothing against a creature the troll laid a
 *   condition on, and the Bane still lands.
 *
 * Written in B6b and NOT run (the brief: offline, Vitest only). The packs must be
 * built from the current `packs-src/` first (`npm run packs:build`), since the
 * Legacy talents ride the talents pack. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-shadow-hunter`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { inflictCondition } from "../effects/inflict.mjs";

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const workflows = () => game.system.azeroth.workflows;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const health = actor => actor.system?.health?.value ?? 0;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const sustained = actor => actor.getFlag("azeroth-rpg", "sustaining") ?? [];
const floorOn = actor => actor.effects.find(e => e.getFlag("azeroth-rpg", FLOOR_FLAG)) ?? null;
const baneOn = actor => actor.effects.find(e => e.getFlag("azeroth-rpg", LAID_BANE_FLAG))?.getFlag("azeroth-rpg", LAID_BANE_FLAG) ?? null;

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/** The control the Combat tab draws for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`)
  ?? sheet.element?.querySelector(`[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Legacy Shadow Hunter Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors, by their tokens, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens?.(true)?.[0]?.document ?? null;
    return token ? { actorId: a.id, tokenId: token.id, sceneId: token.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** Fill a pool. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => poolOf(actor, name).value === pool.max, `${name} full`);
  return poolOf(actor, name);
}

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Set a creature's Health. */
async function setHealth(actor, value) {
  await actor.update({ "system.health.value": value });
  await until(() => health(actor) === value, `${actor.name} at ${value} Health`);
}

/**
 * A troll Shaman at a level, the Shadow Hunter's twelve on the sheet, with these
 * talents taken and these weapons in hand - waiting for each grant the ranks make.
 */
async function shadowHunterWith(name, { level = 9, ranks = {}, weapons = [], abilities = { wis: 16, str: 14 } } = {}) {
  const troll = await makeCharacter({ name, race: "Troll", classes: [["Shaman", level]], weapons, abilities });
  await until(() => troll.items.filter(i => i.type === "talent" && i.system?.legacy === "Troll").length === 12, "the Shadow Hunter's twelve", 30000);
  for (const n of weapons) {
    const item = await until(() => itemNamed(troll, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => troll.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(troll, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
    await until(() => talentNamed(troll, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return troll;
}

/** Press a sheet's control, the die pinned, and take the card it posts. */
async function pressForCard(control, speaker, face = 15, { ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id);
  const unpin = pinDie(face);
  try {
    el.click();
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** One melee attack straight through the workflow, the die pinned. */
async function strike(actor, { face = 15, dc = 5, ...extra } = {}) {
  const held = actor.readyWeapons?.()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: held?.system?.rating ?? 1, kind: "physical", weaponRating: held?.system?.rating ?? 1 },
      strike: { rangeKind: "melee" }, weaponId: held?.id ?? null, traits: [], ...extra
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

export function legacyShadowHunterBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Shadow Hunter's twelve (the Troll's Legacy; B6b)", function () {
    let restore = null;
    let wasViewing = null;
    let quietText = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quietText = await quietScrollingText();
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("BIG BAD VOODOO: a Sustain of its own keyed big-bad-voodoo for 15 Mana and 5 a turn, its floor on every ally within 20 feet but the shaman, holding at 1 by any source, and gone with the Sustain", async function () {
      this.timeout(240000);
      const troll = await shadowHunterWith("ZZ LSH Voodoo", { level: 16, ranks: { "The Loa Gather": 1, "Big Bad Voodoo": 1 } });
      const ally = await makeCharacter({ name: "ZZ LSH Voodoo Ally", classes: [["Warrior", 5]] });
      const far = await makeCharacter({ name: "ZZ LSH Voodoo Far", classes: [["Warrior", 5]] });
      // Out of a fight an ally is the Party's (D-755).
      for (const a of [troll, ally, far]) await a.setParty(true);
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: far, x: 1700, y: 1000 }]);
      await setHealth(ally, ally.system.health.max);
      await setHealth(far, far.system.health.max);
      const full = (await fill(troll, "mana")).value;
      const voodoo = await until(() => featureNamed(troll, "Big Bad Voodoo"), "Big Bad Voodoo granted");
      const sheet = await openSheet(troll);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        await pressForCard(useControl(sheet, voodoo), troll, 15);
      } finally {
        await sheet.close();
      }
      const held = await until(() => sustained(troll).find(e => e?.identifier === "big-bad-voodoo"), "the Sustain held under its key");
      assert.deepEqual(held.upkeep, { mana: 5, health: 0 }, "the Sustain's upkeep is not 04's 5 Mana a turn");
      await until(() => poolOf(troll, "mana").value === full - 15, "15 Mana paid");
      await until(() => troll.items.get(voodoo.id)?.system?.uses?.value === 0, "the Long Rest's one use struck");
      await drainAreaWork();
      const floor = await until(() => floorOn(ally), "the floor on the ally within 20 feet", 30000);
      assert.isNull(floorOn(troll), "the floor lies on the shaman, whom 04 leaves out");
      assert.isNull(floorOn(far), "the floor lies on an ally 35 feet away");
      assert.isFalse(floor.getFlag("azeroth-rpg", FLOOR_FLAG).noCritical, "the floor refuses a Critical Injury");
      // *By any source*: a blow far past the ally's Health holds it at 1.
      await ally.applyDamage(999, { struck: true });
      await until(() => health(ally) === 1, "the ally held at 1");
      // The Sustain ended, the floor goes and the ally falls.
      await workflows().endSustain({ actor: troll, cast: held.cast });
      await until(() => !sustained(troll).some(e => e?.identifier === "big-bad-voodoo"), "the Sustain ended");
      await drainAreaWork();
      await until(() => !floorOn(ally), "the floor lifted with the Sustain", 30000);
      await ally.applyDamage(5, { struck: true });
      await until(() => health(ally) === 0, "the ally no longer held");
    });

    it("TROLL'S BLOOD: a hostile creature is refused in words with nothing paid; on a friend the card's Apply lays the rank plus 1 at the start of each of ten turns", async function () {
      this.timeout(240000);
      const troll = await shadowHunterWith("ZZ LSH Blood", { level: 5, ranks: { "Troll's Blood": 2 } });
      const ally = await makeCharacter({ name: "ZZ LSH Blood Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: ghoul, x: 1000, y: 1200, side: "hostile" }]);
      const combat = await fightWith([troll, ally, ghoul]);
      await giveTurn(combat, troll);
      const full = (await fill(troll, "mana")).value;
      const blood = await until(() => featureNamed(troll, "Troll's Blood"), "Troll's Blood granted");
      const sheet = await openSheet(troll);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        const before = game.messages.size;
        const said = await warnings(async () => {
          useControl(sheet, blood)()?.click();
          await sleep(1500);
        });
        assert.include(said, game.i18n.format("AZEROTH.Laid.NotFriendly", { name: "Troll's Blood", target: tokenOf(ghoul).name }), `no refusal in words: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused Troll's Blood posted a card");
        assert.equal(poolOf(troll, "mana").value, full, "a refused Troll's Blood spent Mana");
        canvas.tokens.setTargets([tokenOf(ally).id]);
        await settle();
        card = await pressForCard(useControl(sheet, blood), troll, 15);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      await until(() => poolOf(troll, "mana").value === full - 2, "2 Mana paid");
      const apply = parsed(card).querySelector('button[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(apply, "the card offers no Apply for the friend");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      const tick = await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", "tick"))?.getFlag("azeroth-rpg", "tick"), "the tick on the friend");
      assert.include(tick, { kind: "heal", amount: 3, rounds: 10, via: "feature" }, "the tick is not the rank plus 1 for ten turns");
    });

    it("JINX: a melee hit with the rider ticked lays a Bane on the target's next Resilience Test - two at rank 2 - for 2 Mana, and a ranged blow draws no Jinx", async function () {
      this.timeout(240000);
      const troll = await shadowHunterWith("ZZ LSH Jinx", { level: 5, ranks: { Jinx: 2 }, weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const full = (await fill(troll, "mana")).value;
      assert.isFalse(troll.riderLines({ weapon: "ranged" }).some(l => l.identifier === "jinx"), "a ranged blow offers Jinx");
      assert.isTrue(troll.riderLines({ weapon: "melee" }).some(l => l.identifier === "jinx"), "a melee blow does not offer Jinx");
      const card = await strike(troll, { targets: [rowOf(ghoul)], riders: ["jinx"] });
      assert.ok(card, "the blow was refused");
      assert.isTrue(card.rolls[0].outcome.success, "the pinned blow missed");
      await until(() => poolOf(troll, "mana").value === full - 2, "2 Mana spent");
      const bane = await until(() => baneOn(ghoul), "the Bane on the ghoul");
      assert.equal(bane.kind, "resilience", "the Bane is not on a Resilience Test");
      assert.equal(bane.banes, 2, "rank 2's two Banes");
      assert.notEqual(bane.lasting, true, "the Bane is not spent by the next Test");
    });

    it("CURSED PREY: at rank 2 Jinx costs nothing against a creature the troll laid a condition on, and its Bane still lands", async function () {
      this.timeout(240000);
      const troll = await shadowHunterWith("ZZ LSH Prey", { level: 5, ranks: { Jinx: 1, "Cursed Prey": 2 }, weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const landed = await inflictCondition({ victim: ghoul, id: "slowed", by: troll, name: ghoul.name });
      assert.isTrue(landed.landed, "Slowed did not land");
      await until(() => ghoul.statuses.has("slowed"), "the ghoul Slowed by the troll");
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const [prey] = targetSnapshots([tokenOf(ghoul)]);
      await setPool(troll, "mana", 0);
      const line = troll.riderLines({ weapon: "melee", target: prey }).find(l => l.identifier === "jinx") ?? null;
      assert.ok(line, "no Jinx line at the prey");
      assert.equal(line.cost, 0, "Jinx is priced against the prey");
      assert.isTrue(line.available, "a free Jinx is refused at 0 Mana");
      assert.equal(line.freeBy, "Cursed Prey");
      // A creature nobody laid anything on: Jinx at its own 2 Mana, refused at 0.
      const other = await makeNpc("Plagued Ghoul");
      const plain = troll.riderLines({ weapon: "melee", target: rowOf(other) }).find(l => l.identifier === "jinx") ?? null;
      assert.equal(plain?.cost, 2, "Jinx free against a creature the troll laid nothing on");
      assert.isFalse(plain?.available ?? true, "a 2-Mana Jinx offered at 0 Mana");
      const card = await strike(troll, { targets: [prey], riders: ["jinx"] });
      assert.ok(card, "the free Jinx was refused");
      await until(() => baneOn(ghoul), "the free Jinx's Bane on the prey");
      assert.equal(poolOf(troll, "mana").value, 0, "the free Jinx spent Mana");
    });

    it("EVIL EYE AT RANK 2: a cast that lands gathers every enemy within 15 feet; a failure Frightens AND Slows at once until the end of its next turn, a pass lays neither, and Cursed Prey then reads the troll as the layer", async function () {
      this.timeout(300000);
      const troll = await shadowHunterWith("ZZ LSH Evil Eye", { level: 9, ranks: { Jinx: 1, "Evil Eye": 2 } });
      const failing = await makeNpc("Plagued Ghoul");
      const passing = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: failing, x: 1100, y: 1000, side: "hostile" }, { actor: passing, x: 1000, y: 1200, side: "hostile" }]);
      const combat = await fightWith([troll, failing, passing]);
      await giveTurn(combat, troll);
      await fill(troll, "mana");
      const eye = await until(() => featureNamed(troll, "Evil Eye"), "Evil Eye granted");
      const sheet = await openSheet(troll);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, eye), troll, 18);
      } finally {
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.deepEqual(flags.targets.map(t => t.tokenId).sort(), [tokenOf(failing).id, tokenOf(passing).id].sort(), "the Use did not gather the two enemies within 15 feet");
      assert.deepEqual(flags.onFailInflicts.map(i => i.condition), ["frightened", "slowed"], "rank 2's failure does not lay both");
      const at = actor => flags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      for (const [actor, face] of [[failing, 1], [passing, 20]]) {
        const unpin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`), doc());
        } finally {
          unpin();
        }
      }
      await until(() => failing.statuses?.has("frightened") && failing.statuses?.has("slowed"), "the failure's Frightened and Slowed");
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded");
      assert.isFalse(passing.statuses?.has("frightened") === true || passing.statuses?.has("slowed") === true, "a passed Test laid a condition");
      const fear = failing.effects.find(e => e.statuses?.has("frightened"));
      assert.equal(fear._source.duration?.expiry, "turnEnd", "the Frightened does not end at a turn's end");
      assert.include(fear.getFlag("azeroth-rpg", "laidBy") ?? [], troll.uuid, "the Frightened does not name the troll - Cursed Prey's *a condition that you laid*");
    });

    it("BAD MOJO AT RANK 2: the one creature's failed Spirit Test lays the Stun at once, its escape at the Spell DC with the rank's Bane", async function () {
      this.timeout(240000);
      const troll = await shadowHunterWith("ZZ LSH Mojo", { level: 13, ranks: { "Bad Mojo": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }]);
      await fill(troll, "mana");
      const mojo = await until(() => featureNamed(troll, "Bad Mojo"), "Bad Mojo granted");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const sheet = await openSheet(troll);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, mojo), troll, 18);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      const doc = () => game.messages.get(card.id);
      assert.isTrue(doc().flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(parsed(doc()).querySelector('button[data-action="resistTest"][data-target-index="0"]'), doc());
      } finally {
        unpin();
      }
      const stun = await until(() => ghoul.effects.find(e => e.statuses?.has("stunned") && e.getFlag("azeroth-rpg", "escape")), "the failure's Stun with its escape");
      assert.include(stun.getFlag("azeroth-rpg", "escape"), { on: "turnEnd", resilience: "spirit", banes: 1, dc: troll.system.spellDC }, "the escape is not the Spirit Test at the Spell DC with the rank's Bane");
    });
  });
}
