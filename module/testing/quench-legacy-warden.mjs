/**
 * **THE WARDEN'S TWELVE, LIVE** (04-TALENTS, the Night Elf's Legacy on the Rogue;
 * the Legacy branches' phase B6b). A night elf Rogue holds the Warden's twelve beside
 * the class's thirty-six (B5's door 1), and each talent here is pressed through the
 * sheet's own control or the attack door, its outcome read back off the documents:
 *
 * - Warden's Mail at rank 2 gives the Encumbering trait's Speed back, and at rank 1
 *   leaves it taken;
 * - Shadow Trap, pressed on the sheet, sets its Region at the point picked within 30
 *   feet for 3 Energy, and the first ENEMY to come into it is Entangled with the
 *   Reflex escape at the warden's Spell DC - an ally passes it untouched;
 * - Shadow Strike's rider on a thrown blow lays Bleeding equal to the rank and Slowed
 *   on the STRIKER's clock, for 3 Energy;
 * - Fan of Knives refuses a target past 10 feet in words before anything is paid, and
 *   within the feet posts its card for 4 Energy;
 * - Warden's Cage's card offers a Reflex Resist at the Spell DC, and its Stun, pressed
 *   on the card, carries the Body escape at the end of each of the creature's turns.
 *
 * Written in B6b and NOT run (the brief: offline, Vitest only). The packs must be
 * built from the current `packs-src/` first (`npm run packs:build`), since the
 * Legacy talents ride the talents pack. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-warden`. Every document a test makes is deleted
 * in `after`.
 */

import { cleanup, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, PACK_FOR, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { cancelPick, pickState } from "../canvas/place.mjs";
import { TRAP_FLAG } from "../rules/traps.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { AZEROTH } from "../config.mjs";

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
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const spellDcOf = actor => actor.system?.spellDC ?? actor.system?.spells?.dc ?? null;

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

/** Press the 2D board at a canvas point, as a browser does (B2's `pressBoard`). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Legacy Warden Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Take a talent at a rank, waiting for it to land. */
async function take(actor, name, rank) {
  const t = await until(() => talentNamed(actor, name), `${name} on the sheet`);
  await t.update({ "system.taken": rank });
  await until(() => talentNamed(actor, name)?.system?.taken === rank, `${name} at rank ${rank}`);
}

/**
 * A night elf Rogue at a level, the Warden's twelve on the sheet, with these talents
 * taken and these weapons in hand - waiting for each grant the ranks make.
 */
async function wardenWith(name, { level = 5, ranks = {}, weapons = [], abilities = { dex: 16, int: 14 } } = {}) {
  const warden = await makeCharacter({ name, race: "Night Elf", classes: [["Rogue", level]], weapons, abilities });
  await until(() => warden.items.filter(i => i.type === "talent" && i.system?.legacy === "Night Elf").length === 12, "the Warden's twelve", 30000);
  for (const n of weapons) {
    const item = await until(() => itemNamed(warden, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => warden.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) await take(warden, talent, rank);
  await settle();
  return warden;
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

export function legacyWardenBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Warden's twelve (the Night Elf's Legacy; B6b)", function () {
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
      cancelPick();
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

    it("WARDEN'S MAIL: a chain shirt's Encumbering costs the warden Speed at rank 1, and nothing at rank 2", async function () {
      this.timeout(120000);
      const warden = await wardenWith("ZZ LW Mail", { level: 3, ranks: { "Warden's Mail": 1 } });
      const free = warden.system.speed;
      const shirt = await give(warden, "Chain shirt", PACK_FOR.armor);
      await shirt.update({ "system.equipped": true });
      await until(() => warden.items.get(shirt.id)?.system?.equipped === true, "the chain shirt worn");
      await until(() => warden.system.speed < free, "the chain shirt's Encumbering costing Speed at rank 1");
      const slowed = warden.system.speed;
      await take(warden, "Warden's Mail", 2);
      await until(() => warden.system.speed === free, "Warden's Mail at rank 2 giving the Speed back");
      assert.isAbove(warden.system.speed, slowed);
      // And taken back to rank 1, the cost returns: the waiver is the rank's, never stored.
      await take(warden, "Warden's Mail", 1);
      await until(() => warden.system.speed === slowed, "the cost back at rank 1");
    });

    it("SHADOW TRAP: pressed on the sheet, set at the point picked for 3 Energy; an ally passes it, and the first enemy is Entangled with the Reflex escape at the warden's Spell DC", async function () {
      this.timeout(240000);
      const warden = await wardenWith("ZZ LW Trapper", { level: 3, ranks: { "Shadow Trap": 1 } });
      const ally = await makeCharacter({ name: "ZZ LW Trap Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([
        { actor: warden, x: 600, y: 1000 }, { actor: ally, x: 1000, y: 600 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }
      ]);
      const combat = await fightWith([warden, ally, ghoul]);
      await giveTurn(combat, warden);
      await setPool(warden, "energy", 10);
      const trap = await until(() => featureNamed(warden, "Shadow Trap"), "Shadow Trap granted");
      const sheet = await openSheet(warden);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const control = useControl(sheet, trap)();
        assert.ok(control, "the sheet draws no Use for Shadow Trap");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === warden.id);
        control.click();
        await until(() => pickState()?.mode === "point", "the trap's pick");
        assert.include(pickState().hint ?? "", "30", "the pick does not say how far");
        pressBoard({ x: 1050, y: 1050 });
        const [card] = await posted;
        made.push(card);
        assert.include(textOf(card), game.i18n.format("AZEROTH.Trap.Set", { name: "Shadow Trap", condition: game.i18n.localize(AZEROTH.conditions.entangled), n: 1 }));
      } finally {
        await sheet.close();
      }
      const region = await until(() => scene.regions.find(r => r.flags?.["azeroth-rpg"]?.[TRAP_FLAG]?.identifier === "shadow-trap"), "the trap's Region");
      assert.equal(region.flags["azeroth-rpg"][TRAP_FLAG].setter, warden.uuid, "the trap does not name its setter");
      await until(() => poolOf(warden, "energy").value === 7, "3 Energy paid");
      // The ally walks through it.
      const allyToken = tokenOf(ally);
      await allyToken.document.update({ x: 1000, y: 1000 });
      await until(() => allyToken.document.x === 1000 && allyToken.document.y === 1000, "the ally arriving");
      await sleep(750);
      assert.isTrue(scene.regions.has(region.id), "an ally sprang the trap");
      assert.isFalse(ally.statuses.has("entangled"), "an ally was Entangled");
      await allyToken.document.update({ x: 1000, y: 600 });
      await until(() => allyToken.document.y === 600, "the ally walking off");
      // The ghoul walks into it.
      await tokenOf(ghoul).document.update({ x: 1000, y: 1000 });
      await until(() => ghoul.statuses.has("entangled"), "the trap's Entangled on the enemy");
      await until(() => !scene.regions.has(region.id), "the sprung trap taken up");
      const escape = ghoul.effects.find(e => e.statuses?.has("entangled"))?.getFlag("azeroth-rpg", ESCAPE_FLAG) ?? null;
      assert.include(escape ?? {}, { on: "action", resilience: "reflex", dc: spellDcOf(warden) }, "the Entangled carries no Reflex escape at the warden's Spell DC");
    });

    it("SHADOW STRIKE: a thrown blow with the rider ticked lays Bleeding equal to the rank and Slowed until the striker's next turn, for 3 Energy", async function () {
      this.timeout(240000);
      const warden = await wardenWith("ZZ LW Strike", { level: 5, ranks: { "Shadow Strike": 2 }, weapons: ["Dagger"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warden, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([warden, ghoul]);
      const mine = await giveTurn(combat, warden);
      await setPool(warden, "energy", 10);
      const dagger = itemNamed(warden, "Dagger");
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await workflows().rollTest({
          actor: warden, kind: "attack", dc: 5, title: dagger.name,
          damage: { rating: dagger.system?.rating ?? 1, kind: "physical", weaponRating: dagger.system?.rating ?? 1 },
          strike: { rangeKind: "thrown" }, weaponId: dagger.id, traits: [], targets: [rowOf(ghoul)], riders: ["shadow-strike"]
        });
        if (card) made.push(card);
      } finally {
        unpin();
      }
      assert.ok(card, "the thrown blow was refused");
      assert.isTrue(card.rolls[0].outcome.success, "the pinned blow missed");
      await until(() => poolOf(warden, "energy").value === 7, "3 Energy paid");
      await until(() => ghoul.statuses.has("bleeding") && ghoul.statuses.has("slowed"), "Bleeding and Slowed on the ghoul");
      const bleeding = ghoul.effects.find(e => e.statuses?.has("bleeding"));
      assert.equal(bleeding.getFlag("azeroth-rpg", "value"), 2, "Bleeding is not the rank");
      const slowed = ghoul.effects.find(e => e.statuses?.has("slowed"));
      assert.equal(slowed._source.duration?.expiry, "turnStart", "the Slowed does not end as a turn starts");
      assert.equal(slowed._source.start?.combatant, mine.id, "the Slowed is not on the STRIKER's clock");
      // A blow struck in the hand draws no Shadow Strike: the rider is a throw's.
      assert.isFalse(warden.riderLines({ weapon: "melee" }).some(l => l.identifier === "shadow-strike"), "a melee blow offers Shadow Strike");
      assert.isTrue(warden.riderLines({ weapon: "thrown" }).some(l => l.identifier === "shadow-strike"), "a throw does not offer Shadow Strike");
    });

    it("FAN OF KNIVES: a target past 10 feet is refused in words before anything is paid, and two within the feet take the card for 4 Energy", async function () {
      this.timeout(240000);
      const warden = await wardenWith("ZZ LW Fan", { level: 5, ranks: { "Fan of Knives": 1 }, weapons: ["Dagger"] });
      const near = await makeNpc("Plagued Ghoul");
      const close = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      await sceneWith([
        { actor: warden, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" },
        { actor: close, x: 1000, y: 1100, side: "hostile" }, { actor: far, x: 1400, y: 1000, side: "hostile" }
      ]);
      const combat = await fightWith([warden, near, close, far]);
      await giveTurn(combat, warden);
      await setPool(warden, "energy", 10);
      const fan = await until(() => featureNamed(warden, "Fan of Knives"), "Fan of Knives granted");
      const sheet = await openSheet(warden);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(near).id, tokenOf(far).id]);
        const before = game.messages.size;
        const said = await warnings(async () => {
          useControl(sheet, fan)()?.click();
          await sleep(1500);
        });
        assert.isTrue(said.some(w => w === game.i18n.format("AZEROTH.Barrage.TooFar", { name: "Fan of Knives", names: tokenOf(far).name, feet: 10 })), `no refusal in words: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused Fan of Knives posted a card");
        assert.equal(poolOf(warden, "energy").value, 10, "a refused Fan of Knives spent Energy");
        canvas.tokens.setTargets([tokenOf(near).id, tokenOf(close).id]);
        await settle();
        const card = await pressForCard(useControl(sheet, fan), warden, 15);
        assert.ok(parsed(card).querySelector('button[data-action="attackFromCard"]'), "the card draws no Attack");
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      await until(() => poolOf(warden, "energy").value === 6, "4 Energy paid");
    });

    it("WARDEN'S CAGE: the card offers a Reflex Resist at the Spell DC, and its Stun, pressed on the card, carries the Body escape at each of the creature's turn ends", async function () {
      this.timeout(240000);
      const warden = await wardenWith("ZZ LW Cage", { level: 9, ranks: { "Warden's Cage": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warden, x: 1000, y: 1000 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }]);
      await setPool(warden, "energy", 10);
      const cage = await until(() => featureNamed(warden, "Warden's Cage"), "Warden's Cage granted");
      assert.deepEqual({ max: cage.system.uses.max, per: cage.system.uses.per }, { max: 1, per: "short" }, "the cage's uses are not the rank a Short Rest");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const sheet = await openSheet(warden);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, cage), warden, 15);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      await until(() => poolOf(warden, "energy").value === 6, "4 Energy paid");
      await until(() => warden.items.get(cage.id)?.system?.uses?.value === 0, "the use struck");
      const resist = parsed(card).querySelector('button[data-action="resistTest"]');
      assert.ok(resist, "the card offers no Resist");
      assert.equal(resist.dataset.resilience, "reflex");
      assert.equal(Number(resist.dataset.dc), spellDcOf(warden), "the Resist is not at the warden's Spell DC");
      const record = card.flags["azeroth-rpg"].inflictEscapes?.stunned ?? null;
      assert.include(record ?? {}, { condition: "stunned", on: "turnEnd", resilience: "body", banes: 0 }, "the card carries no Body escape for the Stun");
      const press = parsed(card).querySelector('button[data-action="applyCondition"][data-condition="stunned"]');
      assert.ok(press, "the card offers no Stun");
      const victim = tokenOf(ghoul);
      victim.control({ releaseOthers: true });
      try {
        await CARD_ACTIONS.applyCondition(press, card);
      } finally {
        victim.release();
      }
      const stun = await until(() => ghoul.effects.find(e => e.statuses?.has("stunned") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the Stun with its escape");
      assert.include(stun.getFlag("azeroth-rpg", ESCAPE_FLAG), { on: "turnEnd", resilience: "body", dc: spellDcOf(warden) }, "the escape's Test and DC");
    });

    it("WARDEN'S CAGE, LANDED: the ghoul's failed Reflex Test on its own row lays the Stun at once, with its Body escape and the warden its layer - and the Stun's button goes from that row", async function () {
      this.timeout(240000);
      const warden = await wardenWith("ZZ LW Cage Lands", { level: 9, ranks: { "Warden's Cage": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warden, x: 1000, y: 1000 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }]);
      await setPool(warden, "energy", 10);
      const cage = await until(() => featureNamed(warden, "Warden's Cage"), "Warden's Cage granted");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const sheet = await openSheet(warden);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, cage), warden, 15);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      const doc = () => game.messages.get(card.id);
      assert.deepEqual(doc().flags["azeroth-rpg"].onFailInflicts, [{ condition: "stunned", value: null, until: null }], "the card does not carry the failure's Stun");
      const resist = parsed(doc()).querySelector('button[data-action="resistTest"][data-target-index="0"]');
      assert.ok(resist, "the ghoul's row offers no Reflex Test");
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resist, doc());
      } finally {
        unpin();
      }
      // *makes a Reflex Resilience Test against your Spell DC or is Stunned* (the lead: *"Land automatically"*).
      const stun = await until(() => ghoul.effects.find(e => e.statuses?.has("stunned") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the failure's Stun, with its escape");
      assert.include(stun.getFlag("azeroth-rpg", ESCAPE_FLAG), { on: "turnEnd", resilience: "body", dc: spellDcOf(warden) }, "the escape's Test and DC");
      assert.include(stun.getFlag("azeroth-rpg", "laidBy") ?? [], warden.uuid, "the Stun does not name the warden who laid it");
      await until(() => Object.values(doc().flags["azeroth-rpg"].resists ?? {})[0], "the ghoul's Test recorded");
      const drawn = await doc().renderHTML();
      assert.isNull(drawn.querySelector('button[data-action="applyCondition"][data-condition="stunned"][data-target-index="0"]'), "the Stun's button stands on a row whose Test is recorded");
      // A stale copy of the card pressed anyway lays nothing more, and says why.
      const stale = parsed(card).querySelector('button[data-action="applyCondition"][data-condition="stunned"][data-target-index="0"]');
      const said = await warnings(async () => { await CARD_ACTIONS.applyCondition(stale, doc()); });
      assert.include(said, game.i18n.format("AZEROTH.Card.InflictResolved", { name: doc().flags["azeroth-rpg"].targets[0].name, condition: game.i18n.localize(AZEROTH.conditions.stunned) }), `the stale press was not refused in words: ${JSON.stringify(said)}`);
    });

    it("THE VAULT OPENS: every enemy within 20 feet gathered and no further one; a failure Entangled at once for the minute with its Reflex escape, a pass left free", async function () {
      this.timeout(300000);
      const warden = await wardenWith("ZZ LW Vault", { level: 13, ranks: { "Shackle": 1, "The Vault Opens": 1 } });
      const near = await makeNpc("Plagued Ghoul");
      const steady = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      await sceneWith([
        { actor: warden, x: 1000, y: 1000 }, { actor: near, x: 1200, y: 1000, side: "hostile" },
        { actor: steady, x: 1000, y: 1300, side: "hostile" }, { actor: far, x: 1800, y: 1000, side: "hostile" }
      ]);
      const vault = await until(() => featureNamed(warden, "The Vault Opens"), "The Vault Opens granted");
      const sheet = await openSheet(warden);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, vault), warden, 15);
      } finally {
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.deepEqual(flags.targets.map(t => t.tokenId).sort(), [tokenOf(near).id, tokenOf(steady).id].sort(), "the Use did not gather exactly the enemies within 20 feet");
      const at = actor => flags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      const resistOn = actor => parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`);
      for (const [actor, face] of [[near, 1], [steady, 20]]) {
        const unpin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(resistOn(actor), doc());
        } finally {
          unpin();
        }
      }
      const held = await until(() => near.effects.find(e => e.statuses?.has("entangled") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the failure's Entangled, with its escape");
      assert.include(held.getFlag("azeroth-rpg", ESCAPE_FLAG), { on: "action", resilience: "reflex", dc: spellDcOf(warden) }, "the escape's Test and DC");
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded");
      assert.isFalse(steady.statuses?.has("entangled") === true, "a passed Test was Entangled");
      assert.isFalse(far.statuses?.has("entangled") === true, "the far ghoul was reached");
    });
  });
}
