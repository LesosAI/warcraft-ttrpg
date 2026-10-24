/**
 * **THE LEGACY BRANCHES' DOORS, LIVE** (the approved plan's phase B1, and the B1 fix
 * run). The seven branches' talent ROWS land in phase B6, so a door is driven here
 * through what Foundry already holds - real items, real effects, real cards - and
 * **through the controls a player presses** (the B1 review: the batch handed its
 * targets to `useFeature`, called `castSpell` and `reactWithDialog` straight, and so
 * could not see the sheet's own reading of what is targeted). Tokens stand on a
 * scene, the creature aimed at is targeted through `canvas.tokens.setTargets`, the
 * sheet's Attack, Use and Cast are clicked, and a card's buttons are pressed through
 * `CARD_ACTIONS` with the button the card itself drew:
 *
 * - door 15: what is wielded and worn, read off the items by the actor's one
 *   builder (`AzerothActor#gateFacts`), and a weapon's Type cleaned at the door;
 * - door 14: a creature's attack from its own sheet offers the Parry; once Wind Walk
 *   holds the striker its next card offers none, and the first card's Parry is
 *   refused in words;
 * - door 13 and the lead's *"Yes, take it back"*: a Parry pressed on a real attack's
 *   card withdraws the Bleeding Deep Cut raised, the layer it added, and the Rage the
 *   hit built - and the card then refuses its Critical Injury, its Bleed and its Apply
 *   in words;
 * - doors 16, 19, 26 and 17: a Use pressed on the sheet is resisted at 10 + Strength
 *   + Proficiency where it names it and at no DC where it does not, and its Stun,
 *   pressed on the card, carries the Test that ends it, its layer and its minute;
 * - doors 17 and 18: the gate facts read what the user laid and whom it marked;
 * - door 8: a Warrior's Cast is refused in words, and a creature's Cast pays its
 *   Power pool;
 * - door 9: Focus refills after a still turn and not after a turn that moved - the
 *   round-ending turn included, and Engaged measured on the fight's own scene;
 * - the Reaction-action Use (Pummel) refused at a creature Wind Walk holds;
 * - the B8a pass's gaps: 07's Rimebind and 02's Shadow Word: Death land nothing on a
 *   passed Test, 02's Entangling Roots lays its Entangled with its escape and no Resist,
 *   the tauren's War Stomp gathers, resists at the Standard DC and lands its Prone, and
 *   07's Stormfury posts each creature around its target its own Test;
 * - the B8a2 pass's: Thornguard's cast card offers no Resist and an older card's is refused
 *   in words, Shadow Word: Death pays its 8 Mana on the success alone, the Wild Kodo's
 *   card records each creature's Resist and lands its Prone, Stormfury's 20 meets no Ward,
 *   the troll's Berserking lays its encounter's Boon and the orc's Thrall's Discipline its
 *   Boon on a friend within 60 feet;
 * - the B9a pass's: 07's Nature's Grasp asks its Test of the next melee hit (a withdrawn
 *   hit lays it again), and Holy Wrath's and Earth Shock's Tests are drawn only for the
 *   creature they name, the others told why in words.
 *
 * Written in B1, rewritten in the B1 fix run, and NOT run in either (the brief:
 * offline, Vitest only); the B8a and B8a2 cases were written offline too. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-doors`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, PACK_FOR, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { LAID_BY_FLAG, laidByMap } from "../rules/talent-gates.mjs";
import { CHALLENGE_FLAG, WATCH_FLAG, markOf } from "../rules/marks.mjs";
import { UNANSWERED_FLAG, canReact } from "../rules/reactions.mjs";
import { NO_OPPORTUNITY_FLAG, STRUCK_TEST_FLAG } from "../rules/struck-tests.mjs";
import { STRUCK_POSTED_HOOK } from "../effects/struck-tests.mjs";
import { annotateHere } from "../dice/annotate.mjs";
import { reactionStateOf } from "../applications/actions.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { MOVED_MARK } from "../rules/rest.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
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
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const itemNamed = (actor, name) => actor.items.find(i => i.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;

/**
 * A target snapshot with no token, as `targetSnapshots` shapes one - for the gate facts
 * alone (doors 17 and 18), which read a snapshot and press nothing.
 */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  speedDropped: false, health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements, { name = "ZZ Legacy Doors Scene" } = {}) {
  const scene = await Scene.create({ name, width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, `${name} viewed`);
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors, by their tokens where they stand, with the turn events settled (D-627). */
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

/** Pass the turn on until it is this actor's, one forward step at a time (core runs a turn's end only forward). */
async function passTo(combat, actor, max = 4) {
  for (let i = 0; i < max; i++) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.nextTurn();
    await settled;
    if (combat.combatant?.actorId === actor.id) return combat.combatant;
  }
  throw new Error(`${actor.name}'s turn never came round`);
}

/** A character of one class, waiting for the class's grants. */
async function characterOf(name, [cls, level], extra = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], ...extra });
  await settle();
  return actor;
}

/** A Warrior holding these weapons in hand, with these talents taken (`quench-warrior-talents.mjs`'s shape). */
async function warriorWith(name, { level = 5, ranks = {}, weapons = [], abilities = { str: 16, con: 14 } } = {}) {
  const warrior = await makeCharacter({ name, classes: [["Warrior", level]], weapons, abilities });
  for (const n of weapons) {
    const item = await until(() => itemNamed(warrior, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => warrior.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(warrior, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(warrior, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return warrior;
}

/** A weapon or a suit from the pack, put in hand or on. */
async function wear(actor, packId, name, extra = {}) {
  const source = (await fromPack(packId, name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true, ...extra } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} on`);
  return actor.items.get(item.id);
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/**
 * **PRESS A SHEET'S CONTROL AND TAKE THE CARD IT POSTS**, the die pinned while the
 * press rolls. `control` is re-queried at the press, because a render detaches a
 * control queried before it (CLAUDE.md §15). A `kind` names the card's own kind,
 * where the press might post another message first.
 */
async function pressForCard(control, speaker, face = 15, { kind = null, ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id && (!kind || m.flags?.["azeroth-rpg"]?.kind === kind));
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

/**
 * **PRESS A CONTROL THAT REFUSES, AND HEAR THE WORDS**: every warning until one has
 * been said (or `done` holds), swallowed as `fixtures.mjs#warnings` swallows them.
 * The click's handler is the sheet's own, which nothing hands back to await.
 */
async function pressAndHear(control, { done = said => said.length > 0, ms = 15000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error("no control to press");
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  const said = [];
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    el.click();
    await until(() => done(said), "a refusal in words", ms);
    await settle();
    await sleep(250);
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  return said;
}

/** The control the Combat tab draws for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;

/** The Attack the Combat tab draws for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;

/** A creature's own attack row, the block's first: `npc-statistics.hbs`. */
const clawsControl = sheet => () => sheet.element?.querySelector('[data-action="rollAttack"][data-attack="0"]') ?? null;

/** 04's Wind Walk as the state it leaves (`UNANSWERED_FLAG`): no Reaction may be taken against its bearer. */
async function windWalk(actor) {
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    // A core icon that exists (14.367 ships no `wind.svg`; its 404 was a page error).
    name: "ZZ Wind Walk", img: "icons/svg/wingfoot.svg", flags: { "azeroth-rpg": { [UNANSWERED_FLAG]: { source: "Wind Walk" } } }
  }]);
  await until(() => actor.effects.has(effect.id), "the unanswered state on the striker");
  return effect;
}

export function legacyDoorsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Legacy branches' doors (B1)", function () {
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
      canvas?.tokens?.releaseAll?.();
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

    it("DOOR 15: a two-handed blade with no suit reads as both, a suit in the Chest ends noSuit, and a weapon's Type is cleaned", async function () {
      this.timeout(120000);
      const warrior = await characterOf("ZZ LD Blademaster", ["Warrior", 5]);
      const blade = await wear(warrior, PACK_FOR.weapon, "Greatsword");
      await until(() => warrior.gateFacts().wield.twoHanded === true, "the Greatsword read as two-handed");
      assert.isTrue(warrior.gateFacts().wield.noSuit, "no suit worn and noSuit false");
      await wear(warrior, PACK_FOR.armor, "Chain shirt");
      await until(() => warrior.gateFacts().wield.noSuit === false, "the Chain shirt filling the Chest tile");
      // `migrateData` cleans the field on a partial update too (D-671).
      await blade.update({ "system.weaponType": " Sword " });
      await until(() => warrior.items.get(blade.id)?.system?.weaponType === "sword", "the Type cleaned to a key");
      await blade.update({ "system.weaponType": "halberd" });
      await until(() => warrior.items.get(blade.id)?.system?.weaponType === null, "a word 08 §7 does not print refused to null");
    });

    it("DOOR 14: a creature's attack from its own sheet offers the Parry; once Wind Walk holds the striker its next card offers none, and the first card's Parry is refused in words", async function () {
      this.timeout(180000);
      const defender = await warriorWith("ZZ LD Defender", { weapons: ["Longsword"] });
      await setPool(defender, "rage", 3);
      const striker = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: defender, x: 1000, y: 1000 }, { actor: striker, x: 1100, y: 1000, side: "hostile" }]);
      canvas.tokens.setTargets([tokenOf(defender).id]);
      const sheet = await openSheet(striker);
      let first = null;
      try {
        first = await pressForCard(clawsControl(sheet), striker, 15, { kind: "attack" });
        assert.isTrue(first.rolls[0].outcome.success, "the pinned Claws missed");
        assert.ok(parsed(first).querySelector('button[data-action="reactParry"][data-target-index="0"]'), "the card offers the defender no Parry against an ordinary striker");
        await windWalk(striker);
        const second = await pressForCard(clawsControl(sheet), striker, 15, { kind: "attack" });
        assert.isTrue(second.rolls[0].outcome.success, "the second pinned Claws missed");
        assert.isNull(parsed(second).querySelector('button[data-action="reactParry"]'), "a Parry was offered against the unanswerable striker");
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      // The first card still draws its Parry: the door asks again at the press (a card is a record of a moment).
      const parry = parsed(first).querySelector('button[data-action="reactParry"][data-target-index="0"]');
      let answered = "pending";
      const said = await warnings(async () => {
        answered = await CARD_ACTIONS.reactParry(parry, game.messages.get(first.id));
      });
      assert.isNull(answered, "the Parry was made against the unanswerable striker");
      assert.isTrue(said.some(w => w.includes("Wind Walk")), `the refusal does not name what holds the striker: ${JSON.stringify(said)}`);
      assert.equal(poolOf(defender, "rage").value, 3, "the refused Parry spent the Rage");
    });

    it("DOOR 13 AND THE LEAD'S *Yes, take it back*: a Parry pressed on a real attack's card withdraws Deep Cut's Bleeding, its layer and the Rage the hit built, and the card refuses its Critical Injury, its Bleed and its Apply in words", async function () {
      this.timeout(300000);
      // Level 4: no Extra Attack (02 §6), so the sheet's one Attack is one roll and one
      // card. At 5 the second roll's own hit built 2 more Rage, recorded on ITS card,
      // and this card's record read 2 against a pool that rose by 4 (B8b).
      const striker = await warriorWith("ZZ LD Deep Cut", { level: 4, weapons: ["Amani hatchet"], ranks: { "Deep Cut": 1 } });
      const parrier = await warriorWith("ZZ LD Parrier", { weapons: ["Longsword"] });
      const bleeder = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: striker, x: 1000, y: 1000 }, { actor: parrier, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([striker, parrier]);
      await giveTurn(combat, striker);
      await setPool(parrier, "rage", 1);
      // Somebody else's Bleeding, already standing: Deep Cut raises it and ADDS its layer (MUST-FIX 3).
      const laid = await inflictCondition({ victim: parrier, id: "bleeding", value: 1, by: bleeder, name: parrier.name });
      assert.isTrue(laid.landed, "the bleeder's Bleeding did not land");
      const bleedingOf = () => parrier.effects.find(e => e.statuses?.has("bleeding")) ?? null;
      const layersOf = () => bleedingOf()?.getFlag("azeroth-rpg", LAID_BY_FLAG) ?? [];
      await until(() => layersOf().includes(bleeder.uuid), "the bleeder named on the Bleeding");
      const rageBefore = poolOf(striker, "rage").value;
      const hatchet = itemNamed(striker, "Amani hatchet");
      canvas.tokens.setTargets([tokenOf(parrier).id]);
      const sheet = await openSheet(striker);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        // A natural 20: a hit at SL 2 or better, and a critical.
        card = await pressForCard(attackControl(sheet, hatchet), striker, 20, { kind: "attack" });
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      const flags = card.flags["azeroth-rpg"];
      assert.isTrue(card.rolls[0].outcome.success, "the pinned blow missed");
      assert.isAtLeast(card.rolls[0].outcome.sl, 2, "the pinned blow did not reach SL 2");
      // What the hit built on the striker, recorded on the card for the withdrawal.
      await until(() => poolOf(striker, "rage").value > rageBefore, "the Rage the hit built");
      const rageHit = poolOf(striker, "rage").value;
      const built = (flags.momentumOnMiss ?? []).filter(r => r.actorUuid === striker.uuid && r.pool === "rage").reduce((n, r) => n + r.amount, 0);
      assert.equal(built, rageHit - rageBefore, "the card does not record the Rage the hit built");
      // Deep Cut's landing, with the layer it added to a Bleeding that stood.
      // A condition's row is written with no `kind` (`rules/miss.mjs#hitRecordRow` reads it as one).
      const landing = (flags.landedOnHit ?? []).find(r => (r.kind ?? "condition") === "condition" && r.id === "bleeding" && r.index === 0);
      assert.ok(landing, "the card records no Bleeding the hit landed");
      assert.include(landing, { had: true, prior: 1, laidByAdded: striker.uuid }, "the landing does not record the layer it added");
      await until(() => layersOf().includes(striker.uuid), "the striker added to the Bleeding's layers");
      // The buttons the card drew for the parrier and the GM.
      const drawn = parsed(card);
      const parry = drawn.querySelector('button[data-action="reactParry"][data-target-index="0"]');
      const injury = drawn.querySelector('button[data-action="criticalInjury"]');
      const bleed = drawn.querySelector('button[data-action="applyCondition"][data-condition="bleeding"][data-target-index="0"]');
      const apply = drawn.querySelector('button[data-action="applyDamage"][data-target-index="0"]');
      assert.ok(parry, "the card offers no Parry");
      assert.ok(injury, "a natural 20 offers no Critical Injury");
      assert.ok(bleed, "the hatchet's Bleed offers no Inflict");
      assert.ok(apply, "the card offers no Apply");
      // The Parry, pressed on the card and pinned to hold (meet or beat the striker's total).
      const unpin = pinDie(20);
      try {
        const parried = await CARD_ACTIONS.reactParry(parry, game.messages.get(card.id));
        assert.ok(parried, "the Parry was refused");
        made.push(parried);
      } finally {
        unpin();
      }
      await until(() => game.messages.get(card.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true, "the card's row written as a miss");
      // MUST-FIX 3: the Bleeding back where it stood, the striker's layer off it, the bleeder's kept.
      await until(() => bleedingOf()?.getFlag("azeroth-rpg", "value") === 1, "the Bleeding back at its prior value");
      await until(() => !layersOf().includes(striker.uuid), "the striker's layer taken back off the Bleeding it raised");
      assert.deepEqual(layersOf(), [bleeder.uuid], "the bleeder's own layer went with the striker's");
      // The lead's *"Yes, take it back"*: the Rage the withdrawn hit built, and the card says so.
      await until(() => poolOf(striker, "rage").value === rageBefore, "the Rage the withdrawn hit built taken back");
      const after = game.messages.get(card.id);
      assert.deepEqual(after.flags["azeroth-rpg"].momentumWithdrawn, [{ name: striker.name, pool: "rage", amount: rageHit - rageBefore }], "the card does not record what was taken back");
      const rendered = await after.renderHTML();
      assert.include(rendered.textContent, game.i18n.localize("AZEROTH.Miss.TakenBack"), "the card does not say the Rage was taken back");
      const name = after.flags["azeroth-rpg"].targets[0].name;
      // MUST-FIX 2: the Critical Injury and the trait's Bleed, refused on the withdrawn row.
      const injuries = game.messages.size;
      let said = await warnings(async () => { await CARD_ACTIONS.criticalInjury(injury, after); });
      assert.include(said, game.i18n.format("AZEROTH.Miss.InjuryWithdrawn", { name }), `the injury was not refused in words: ${JSON.stringify(said)}`);
      assert.equal(game.messages.size, injuries, "a withdrawn hit rolled a Critical Injury");
      said = await warnings(async () => { await CARD_ACTIONS.applyCondition(bleed, after); });
      assert.include(said, game.i18n.format("AZEROTH.Miss.PressWithdrawn", { name }), `the Bleed was not refused in words: ${JSON.stringify(said)}`);
      assert.equal(bleedingOf()?.getFlag("azeroth-rpg", "value"), 1, "a withdrawn hit laid its trait's Bleeding");
      // SHOULD-FIX g: the Apply reads the row's own withdrawal, applies nothing, and spends this card's mark.
      const health = parrier.system.health.value;
      said = await warnings(async () => { await CARD_ACTIONS.applyDamage(apply, after); });
      assert.include(said, game.i18n.format("AZEROTH.Miss.ApplyWithdrawn", { name }), `the Apply was not refused in words: ${JSON.stringify(said)}`);
      assert.equal(parrier.system.health.value, health, "the withdrawn hit dealt damage");
      await until(() => parrier.getFlag("azeroth-rpg", "mitigate") === undefined, "the Parry's mark spent with this card");
    });

    it("DOORS 16, 19, 26 AND 17: a Use pressed on the sheet is resisted at 10 + Strength + Proficiency where it names it and at no DC where it does not, and its Stun, pressed on the card, carries its escape, its layer and its minute", async function () {
      this.timeout(180000);
      const clapper = await characterOf("ZZ LD Clapper", ["Warrior", 5], { abilities: { str: 16 } });
      const target = await characterOf("ZZ LD Stunned", ["Warrior", 5]);
      await sceneWith([{ actor: clapper, x: 1000, y: 1000 }, { actor: target, x: 1100, y: 1000, side: "hostile" }]);
      // By NAME, never by position: the created documents came back in another order
      // than they were asked for (B8b: probed three times out of three, the Unnamed
      // Shout first), and the Thunder Clap's DC was read off the wrong feature.
      const embedded = await clapper.createEmbeddedDocuments("Item", [
        {
          name: "ZZ Thunder Clap", type: "feature",
          system: {
            kind: "action", action: "half", resist: "body", resistDc: "str",
            inflicts: [{ condition: "stunned", until: "minute", escape: { on: "turnEnd", resilience: "spirit", dc: "str", banes: 1 } }]
          }
        },
        // A Use naming no DC, on a class with no Spell DC (the B1 review, item d).
        { name: "ZZ Unnamed Shout", type: "feature", system: { kind: "action", action: "half", resist: "spirit" } }
      ]);
      const clap = embedded.find(i => i.name === "ZZ Thunder Clap");
      const shout = embedded.find(i => i.name === "ZZ Unnamed Shout");
      const strDc = 10 + (clapper.system.abilities?.str?.mod ?? 0) + (clapper.system.proficiency ?? 0);
      canvas.tokens.setTargets([tokenOf(target).id]);
      const sheet = await openSheet(clapper);
      let card = null;
      let plain = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        // Each press's OWN card (B8b: the first message the clapper posted was read once
        // as the Use's and carried no DC; a feature card is the Use's).
        card = await pressForCard(useControl(sheet, clap), clapper, 15, { kind: "feature" });
        plain = await pressForCard(useControl(sheet, shout), clapper, 15, { kind: "feature" });
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      const resist = parsed(card).querySelector('button[data-action="resistTest"]');
      assert.ok(resist, "the card offers no Resist");
      assert.equal(Number(resist.dataset.dc), strDc, `the Resist is not at 10 + Strength + Proficiency (the item's resistDc ${JSON.stringify(clapper.items.get(clap.id)?.system?.resistDc)}, the card's kind ${card.flags?.["azeroth-rpg"]?.kind})`);
      const record = card.flags["azeroth-rpg"].inflictEscapes?.stunned ?? null;
      assert.include(record ?? {}, { condition: "stunned", on: "turnEnd", resilience: "spirit", dc: strDc, banes: 1 }, "the card carries no escape for the Stun");
      const unnamed = parsed(plain).querySelector('button[data-action="resistTest"]');
      assert.ok(unnamed, "the plain Use's card offers no Resist");
      assert.equal(unnamed.dataset.dc ?? "", "", "a Use that names no DC was resisted at the Strength one in silence");
      // The card's Inflict reaches the creature selected (`actorsFor`), as the GM presses it.
      const press = parsed(card).querySelector('button[data-action="applyCondition"][data-condition="stunned"]');
      assert.ok(press, "the card offers no Stun");
      const victim = tokenOf(target);
      victim.control({ releaseOthers: true });
      try {
        await CARD_ACTIONS.applyCondition(press, card);
      } finally {
        victim.release();
      }
      const stun = await until(() => target.effects.find(e => e.statuses?.has("stunned") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the Stun with its escape");
      assert.include(stun.getFlag("azeroth-rpg", ESCAPE_FLAG), { dc: strDc, banes: 1, on: "turnEnd" }, "the escape's DC and Banes");
      assert.deepEqual(stun.getFlag("azeroth-rpg", LAID_BY_FLAG), [clapper.uuid], "the Stun does not name who laid it");
      // Out of a fight *for one minute* is the world's minute.
      assert.equal(stun._source.duration?.units, "minutes", "the Stun's span is not the world's minute");
      assert.equal(stun._source.duration?.value, 1, "the Stun's span is not one minute");
    });

    it("DOORS 17 AND 18: the gate facts read the conditions the user laid and the creatures it marked", async function () {
      this.timeout(120000);
      const warden = await characterOf("ZZ LD Warden", ["Rogue", 5]);
      const prey = await makeNpc("Plagued Ghoul");
      // The one landing door a blow's condition goes through (D-770), naming its layer.
      const landed = await inflictCondition({ victim: prey, id: "slowed", by: warden, name: prey.name });
      assert.isTrue(landed.landed, "Slowed did not land");
      await until(() => prey.effects.find(e => e.statuses?.has("slowed"))?.getFlag("azeroth-rpg", LAID_BY_FLAG), "the layer named on the Slowed");
      const snapshot = rowOf(prey, {
        statuses: [...prey.statuses],
        laidBy: laidByMap(prey.effects.map(e => ({ statuses: [...(e.statuses ?? [])], flags: e.flags ?? {}, disabled: e.active === false })))
      });
      assert.deepEqual(warden.gateFacts(snapshot).target.laidByUser, ["slowed"], "the warden's Slowed is not read as the warden's");
      const stranger = await characterOf("ZZ LD Stranger", ["Rogue", 5]);
      assert.deepEqual(stranger.gateFacts(snapshot).target.laidByUser, [], "somebody else's Slowed read as the stranger's");
      // The marks: a Challenge effect on the user and a Watch on its own flag.
      await warden.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Challenge", img: "icons/svg/sword.svg", flags: { "azeroth-rpg": { [CHALLENGE_FLAG]: markOf(snapshot) } } }]);
      await warden.setFlag("azeroth-rpg", WATCH_FLAG, markOf(snapshot));
      await until(() => warden.gateFacts(snapshot).challenged === true, "the Challenge read off the effect");
      assert.isTrue(warden.gateFacts(snapshot).watched, "the Watch was not read off the flag");
      assert.isFalse(stranger.gateFacts(snapshot).watched, "another's Watch read as the stranger's");
    });

    it("DOOR 8 AND THE B1 REVIEW'S ITEM c: a Warrior's Cast pressed on the sheet is refused in words with nothing spent, and a creature's Cast pressed on its own sheet pays its Power pool", async function () {
      this.timeout(180000);
      const warrior = await characterOf("ZZ LD No Mana", ["Warrior", 5], { spells: ["Arcane Missiles"] });
      const spell = await until(() => warrior.items.find(i => i.type === "spell" && i.name === "Arcane Missiles"), "the spell on the sheet");
      const before = warrior.system.health?.value ?? 0;
      const sheet = await openSheet(warrior);
      let said = [];
      try {
        // The Spells tab draws a learned spell (D-639); the Core tab's row is the other door.
        const cast = () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
          ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
        assert.ok(cast(), "the sheet draws no Cast for the learned spell");
        said = await pressAndHear(cast);
      } finally {
        await sheet.close();
      }
      const words = game.i18n.format("AZEROTH.Cast.NoPool", { name: "Arcane Missiles", pool: game.i18n.localize(AZEROTH.poolTypes.mana), n: 2 });
      assert.include(said, words, `the refusal is not NoPool's words: ${JSON.stringify(said)}`);
      assert.equal(warrior.system.health?.value ?? 0, before, "the refused cast cost Health");
      // A creature's Power pool IS its Mana (the lead, 2026-09-10), whatever its block calls it.
      const adept = await makeNpc("Adept of the Schools");
      const aimed = await characterOf("ZZ LD Missiled", ["Warrior", 5]);
      await sceneWith([{ actor: adept, x: 1000, y: 1000, side: "hostile" }, { actor: aimed, x: 1300, y: 1000 }]);
      const power = adept.system.power?.value ?? 0;
      assert.isAtLeast(power, 2, "the Adept holds no Power to pay with");
      canvas.tokens.setTargets([tokenOf(aimed).id]);
      const npcSheet = await openSheet(adept);
      let card = null;
      try {
        const cast = () => npcSheet.element?.querySelector('section[data-tab="spells"] [data-action="castSpell"][data-name="Arcane Missiles"]') ?? null;
        assert.ok(cast(), "the creature's Spells tab draws no Cast for its Arcane Missiles");
        card = await pressForCard(cast, adept, 18);
      } finally {
        await npcSheet.close();
        canvas.tokens.setTargets([]);
      }
      assert.ok(card, "the creature's cast was refused");
      await until(() => (adept.system.power?.value ?? 0) === power - 2, "the creature's Power paying the 2 Mana");
    });

    it("DOOR 9: Focus refills after a still turn and not after a turn that moved", async function () {
      this.timeout(240000);
      const ranger = await characterOf("ZZ LD Focus", ["Ranger", 5]);
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 2);
      // A turn that moves: Disengage's door pays a Move, the measure Bracing reads.
      assert.isTrue((await mine.spendMoveAction()).ok, "the Move was not paid");
      await passTo(combat, ghoul);
      await until(() => mine.getFlag("azeroth-rpg", "lastTurn")?.moved === true, "the moved turn recorded at its end", 30000);
      await passTo(combat, ranger);
      // The turn's start resets the budget and then refills: wait for the reset, then give the refill its chance.
      await until(() => (mine.getFlag("azeroth-rpg", "budget")?.halfActions ?? 0) === 2, "the ranger's turn starting", 30000);
      await settle();
      await sleep(750);
      assert.equal(poolOf(ranger, "focus").value, 2, "Focus refilled after a turn that moved");
      // A still turn: nothing paid, and the next turn refills.
      await passTo(combat, ghoul);
      await until(() => mine.getFlag("azeroth-rpg", "lastTurn")?.moved === false, "the still turn recorded at its end", 30000);
      await passTo(combat, ranger);
      await until(() => poolOf(ranger, "focus").value === 4, "Focus refilled by 2 after a still turn", 30000);
    });

    it("DOOR 9 ACROSS A ROUND'S END (MUST-FIX 1): a turn marked as moving that ends the round is recorded under its own round as moved, and Focus does not refill after it", async function () {
      this.timeout(240000);
      const ranger = await characterOf("ZZ LD Round Focus", ["Ranger", 5]);
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 2);
      const roundNow = combat.round;
      // A Half-Action that is not a Move, so the next turn's reset can be seen arriving.
      assert.isTrue((await mine.spendAction("half")).ok, "the Half-Action was not spent");
      // The mark a cast a talent counts as moving leaves on the round's record
      // (Shadowcraft's Shadow Walk, `workflows.castSpell`), through the same queued door.
      const marked = await mine.markRoundOnce(MOVED_MARK);
      assert.isTrue(marked.added, "the MOVED_MARK was not written");
      // The turn that ends the round: core hands it `context.round`, the round it was in.
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextRound();
      await settled;
      const record = await until(() => {
        const t = mine.getFlag("azeroth-rpg", "lastTurn");
        return t?.round === roundNow ? t : null;
      }, "the round-ending turn recorded under the round it was in", 30000);
      assert.isTrue(record.moved, "the round-ending turn's MOVED_MARK was read as an older round's and the turn as still");
      if (combat.combatant?.actorId !== ranger.id) await passTo(combat, ranger);
      await until(() => combat.combatant?.id === mine.id && (mine.getFlag("azeroth-rpg", "budget")?.halfActions ?? 0) === 2, "the ranger's next turn starting", 30000);
      await settle();
      await sleep(750);
      assert.equal(poolOf(ranger, "focus").value, 2, "Focus refilled after a round-ending turn that moved");
    });

    it("DOOR 9 ON THE FIGHT'S OWN SCENE (the B1 review's item b): a still turn beside an enemy is Engaged though the GM is viewing another scene, and Focus does not refill", async function () {
      this.timeout(240000);
      const ranger = await characterOf("ZZ LD Engaged Focus", ["Ranger", 5]);
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 2);
      // The GM looks elsewhere: the board the old reading measured on holds neither token.
      await sceneWith([], { name: "ZZ Legacy Doors Elsewhere" });
      // A still turn, with a Half-Action spent so the next turn's reset can be seen arriving.
      assert.isTrue((await mine.spendAction("half")).ok, "the Half-Action was not spent");
      await passTo(combat, ghoul);
      const record = await until(() => {
        const t = mine.getFlag("azeroth-rpg", "lastTurn");
        return t && t.moved === false ? t : null;
      }, "the still turn recorded at its end", 30000);
      assert.isTrue(record.engaged, "the turn beside the ghoul was read off the GM's viewed board, and not as Engaged");
      await passTo(combat, ranger);
      await until(() => (mine.getFlag("azeroth-rpg", "budget")?.halfActions ?? 0) === 2, "the ranger's turn starting", 30000);
      await settle();
      await sleep(750);
      assert.equal(poolOf(ranger, "focus").value, 2, "Focus refilled after a turn that ended Engaged");
    });

    it("THE B1 REVIEW'S ITEM a: Pummel pressed on the sheet at a creature Wind Walk holds is refused in words, and lays nothing", async function () {
      this.timeout(180000);
      const warrior = await characterOf("ZZ LD Pummeller", ["Warrior", 5]);
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warrior, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await windWalk(ghoul);
      const pummel = await until(() => featureNamed(warrior, "Pummel"), "Pummel granted");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const sheet = await openSheet(warrior);
      let said = [];
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        said = await pressAndHear(useControl(sheet, pummel), { done: heard => heard.some(w => w.includes("Wind Walk")) });
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
      assert.include(said, game.i18n.format("AZEROTH.Reaction.Refuse.Unanswered", { source: "Wind Walk" }), `not refused in words: ${JSON.stringify(said)}`);
      assert.isFalse(ghoul.effects.some(e => e.getFlag("azeroth-rpg", LAID_BANE_FLAG)), "Pummel laid its Bane on the unanswerable creature");
    });

    it("THE LEAD'S *Build it everywhere*: 07's Flamestrike, half on a passed Reflex Test - recorded on the spell's card, halved before the Ward, and the whole on a failure", async function () {
      this.timeout(240000);
      const mage = await characterOf("ZZ LD Flamestrike", ["Mage", 3], { spells: ["Flamestrike"], abilities: { int: 16 } });
      const passing = await makeNpc("Plagued Ghoul");
      const failing = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: passing, x: 1500, y: 1000, side: "hostile" }, { actor: failing, x: 1500, y: 1100, side: "hostile" }]);
      const spell = await until(() => mage.items.find(i => i.type === "spell" && i.name === "Flamestrike"), "Flamestrike known");
      assert.isTrue(spell.system.damage.half, "Flamestrike carries no half on a pass (`damage.half`, stamped by the parser)");
      const pool = poolOf(mage, "mana");
      await mage.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
      await until(() => poolOf(mage, "mana").value === pool.max, "the mage's Mana full");
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await game.system.azeroth.workflows.castSpell({ actor: mage, spell, targets: [rowOf(passing), rowOf(failing)] });
        made.push(card);
      } finally {
        unpin();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.isTrue(flags.halfOnPass, "the spell's card does not halve on a pass");
      const ward = row => row?.wardBySchool?.fire ?? 0;
      for (const [i, row] of flags.targets.entries()) {
        assert.equal(flags.passedByTarget[i].damage, Math.max(0, Math.floor(spell.system.damage.rating / 2) - ward(row)), `row ${i}'s half is not half the Rating, less the Ward`);
      }
      for (const [actor, face] of [[passing, 20], [failing, 1]]) {
        const i = flags.targets.findIndex(t => t.actorId === actor.id);
        const button = parsed(doc()).querySelector(`button[data-action="resistTest"][data-purpose="spell"][data-target-index="${i}"]`);
        assert.ok(button, `${actor.name}'s row offers no Reflex Test`);
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, doc());
        } finally {
          pin();
        }
      }
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded on the spell's card");
      const drawn = await doc().renderHTML();
      for (const [actor, half] of [[passing, true], [failing, false]]) {
        const i = flags.targets.findIndex(t => t.actorId === actor.id);
        const apply = drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${i}"]`);
        const expected = half ? flags.passedByTarget[i].damage : flags.damageByTarget[i].damage;
        assert.equal(Number(apply?.dataset.damage), expected, `${actor.name}'s Apply does not name ${half ? "the half" : "the whole"}`);
        const before = actor.system.health.value;
        await CARD_ACTIONS.applyDamage(apply, doc());
        await until(() => actor.system.health.value === Math.max(0, before - expected), `${half ? "the half" : "the whole"} on ${actor.name}`);
      }
      assert.include(drawn.textContent, game.i18n.localize("AZEROTH.Card.ResistHalf"), "the card does not say the creature that passed takes half");
    });

    it("THE LEAD'S *Land automatically* ON 02's EARTHQUAKE: pressed on the sheet, a creature that fails the card's Reflex Test is knocked Prone at once and one that passes is not, each recorded on the card", async function () {
      this.timeout(240000);
      const shaman = await characterOf("ZZ LD Quake", ["Shaman", 20]);
      const failing = await makeNpc("Plagued Ghoul");
      const passing = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: failing, x: 1500, y: 1000, side: "hostile" }, { actor: passing, x: 1500, y: 1200, side: "hostile" }]);
      const quake = await until(() => featureNamed(shaman, "Earthquake"), "Earthquake granted");
      assert.deepEqual(quake.system.inflicts.map(i => [i.condition, i.onFail]), [["prone", true]], "Earthquake's Prone is not the Test's (`onFail`)");
      await setPool(shaman, "mana", poolOf(shaman, "mana").max);
      const sheet = await openSheet(shaman);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, quake), shaman, 15);
      } finally {
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      assert.deepEqual(doc().flags["azeroth-rpg"].onFailInflicts, [{ condition: "prone", value: null, until: null }], "the card lands nothing on a failure");
      // Its circle names no size, so the Use measures nobody: the one Resist, rolled for the token selected.
      const resist = () => parsed(doc()).querySelector('button[data-action="resistTest"]');
      assert.ok(resist(), "the card offers no Reflex Test");
      for (const [actor, face] of [[failing, 1], [passing, 20]]) {
        const token = tokenOf(actor);
        token.control({ releaseOthers: true });
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(resist(), doc());
        } finally {
          pin();
          token.release();
        }
      }
      await until(() => failing.statuses?.has("prone"), "the failure's Prone, laid with no button pressed");
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded on the card");
      assert.isFalse(passing.statuses?.has("prone") === true, "a passed Test laid the Prone");
      const record = Object.values(doc().flags["azeroth-rpg"].resists).find(r => r.tokenId === tokenOf(failing).id) ?? null;
      assert.deepEqual(record?.landed, ["prone"], "the card does not say the Prone landed");
      assert.include((await doc().renderHTML()).textContent, game.i18n.format("AZEROTH.Card.ResistLanded", { conditions: game.i18n.localize(AZEROTH.conditions.prone) }), "the card does not say what the failure landed");
    });

    // ---- The B8a pass (written offline, not run): the gaps the B6 fix found. ----

    it("THE B8a PASS ON 07's RIMEBIND: *On a failure it takes 2 Frost damage* - a creature whose Test passed takes none of it, said in words, its Apply taken off and a stale one refused; the failure takes the whole", async function () {
      this.timeout(240000);
      const mage = await characterOf("ZZ LD Rimebind", ["Mage", 9], { spells: ["Rimebind"], abilities: { int: 16 } });
      const passing = await makeNpc("Plagued Ghoul");
      const failing = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: passing, x: 1500, y: 1000, side: "hostile" }, { actor: failing, x: 1500, y: 1100, side: "hostile" }]);
      const spell = await until(() => mage.items.find(i => i.type === "spell" && i.name === "Rimebind"), "Rimebind known");
      assert.isTrue(spell.system.damage.onFail, "Rimebind's damage is not the failure's (`damage.onFail`, stamped by the parser)");
      const pool = poolOf(mage, "mana");
      await mage.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
      await until(() => poolOf(mage, "mana").value === pool.max, "the mage's Mana full");
      // Cast from the sheet's own control, both ghouls targeted through the canvas.
      const sheet = await openSheet(mage);
      let card = null;
      canvas.tokens.setTargets([tokenOf(passing).id, tokenOf(failing).id]);
      try {
        const cast = () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
          ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
        assert.ok(cast(), "the sheet draws no Cast for Rimebind");
        card = await pressForCard(cast, mage, 18, { kind: "spell" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.isTrue(flags.noneOnPass, "the spell's card does not spare a pass");
      const at = actor => flags.targets.findIndex(t => t.actorId === actor.id);
      // The Apply a copy of the card drew before any Test was recorded.
      const stale = parsed(doc()).querySelector(`button[data-action="applyDamage"][data-target-index="${at(passing)}"]`);
      assert.ok(stale, "the card offers no Apply before the Tests");
      for (const [actor, face] of [[passing, 20], [failing, 1]]) {
        const button = parsed(doc()).querySelector(`button[data-action="resistTest"][data-purpose="spell"][data-target-index="${at(actor)}"]`);
        assert.ok(button, `${actor.name}'s row offers no Reflex Test`);
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, doc());
        } finally {
          pin();
        }
      }
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded on the spell's card");
      const drawn = await doc().renderHTML();
      assert.isNull(drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(passing)}"]`), "the creature that passed is still offered the Apply");
      assert.include(drawn.textContent, game.i18n.localize("AZEROTH.Card.ResistNone"), "the card does not say the pass takes none");
      const kept = passing.system.health.value;
      await CARD_ACTIONS.applyDamage(stale, doc());
      await settle();
      assert.equal(passing.system.health.value, kept, "a creature that passed took the failure's damage off a stale Apply");
      const apply = drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(failing)}"]`);
      assert.ok(apply, "the creature that failed is offered no Apply");
      const health = failing.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, doc());
      await until(() => failing.system.health.value === Math.max(0, health - flags.damageByTarget[at(failing)].damage), "the failure's whole on the ghoul");
    });

    it("THE B8a PASS ON 02's SHADOW WORD: DEATH: pressed on the sheet, a target whose Spirit Test passes takes none of the Shadow damage and one that fails takes the whole", async function () {
      this.timeout(240000);
      const priest = await characterOf("ZZ LD Death", ["Priest", 14], { abilities: { wis: 16 } });
      const passing = await makeNpc("Plagued Ghoul");
      const failing = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }, { actor: passing, x: 1500, y: 1000, side: "hostile" }, { actor: failing, x: 1500, y: 1200, side: "hostile" }]);
      const death = await until(() => featureNamed(priest, "Shadow Word: Death"), "Shadow Word: Death granted");
      assert.isTrue(death.system.damage.onFail, "the feature's stamp does not mark its damage the failure's");
      await setPool(priest, "mana", poolOf(priest, "mana").max);
      const sheet = await openSheet(priest);
      let card = null;
      canvas.tokens.setTargets([tokenOf(passing).id, tokenOf(failing).id]);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, death), priest, 18, { kind: "feature" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.isTrue(flags.noneOnPass, "the feature's card does not spare a pass");
      const at = actor => flags.targets.findIndex(t => t.actorId === actor.id);
      for (const [actor, face] of [[passing, 20], [failing, 1]]) {
        const button = parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`);
        assert.ok(button, `${actor.name}'s row offers no Spirit Test`);
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, doc());
        } finally {
          pin();
        }
      }
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded on the feature's card");
      const drawn = await doc().renderHTML();
      assert.isNull(drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(passing)}"]`), "the target that passed is still offered the Apply");
      const apply = drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(failing)}"]`);
      assert.ok(apply, "the target that failed is offered no Apply");
      const health = failing.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, doc());
      await until(() => failing.system.health.value === Math.max(0, health - flags.damageByTarget[at(failing)].damage), "the failure's whole on the ghoul");
      assert.equal(passing.system.health.value, passing.system.health.max, "the target that passed took damage");
    });

    it("THE B8a PASS ON 02's ENTANGLING ROOTS: pressed on the sheet, the card offers no Resist and an Entangled on the target, laid carrying its escape at the druid's Spell DC", async function () {
      this.timeout(240000);
      const druid = await characterOf("ZZ LD Roots", ["Druid", 14], { abilities: { wis: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1500, y: 1000, side: "hostile" }]);
      const roots = await until(() => featureNamed(druid, "Entangling Roots"), "Entangling Roots granted");
      assert.isNull(roots.system.resist, "Entangling Roots still offers a Resist at the cast");
      assert.deepEqual(roots.system.inflicts.map(i => [i.condition, i.escape?.on, i.escape?.resilience, i.escape?.dc]), [["entangled", "action", "reflex", "spellDc"]], "the Entangled carries no escape");
      await setPool(druid, "mana", poolOf(druid, "mana").max);
      const sheet = await openSheet(druid);
      let card = null;
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, roots), druid, 18, { kind: "feature" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      assert.isTrue(doc().flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
      const html = parsed(doc());
      assert.isNull(html.querySelector('button[data-action="resistTest"]'), "the card offers a Resist 02 never asks for");
      const inflict = html.querySelector('button[data-action="applyCondition"][data-condition="entangled"][data-target-index="0"]');
      assert.ok(inflict, "the card offers no Entangled on the target");
      await CARD_ACTIONS.applyCondition(inflict, doc());
      const held = await until(() => ghoul.effects.find(e => e.statuses?.has("entangled") && e.getFlag("azeroth-rpg", ESCAPE_FLAG)), "the Entangled, carrying its escape");
      assert.deepInclude(held.getFlag("azeroth-rpg", ESCAPE_FLAG), { condition: "entangled", on: "action", resilience: "reflex", dc: druid.system.spellDC }, "the escape is not 02's: an action and a Reflex Test at the Spell DC");
    });

    it("THE B8a PASS ON THE TAUREN'S WAR STOMP: pressed on the sheet it spends a Half-Action's worth and 4 Rage, gathers the enemy within 5 feet and not the one beyond, resists at the Standard DC for the tier, and its failure lands the Prone at once", async function () {
      this.timeout(240000);
      const tauren = await characterOf("ZZ LD Stomp", ["Warrior", 5], { race: "Tauren", abilities: { str: 16, con: 14 } });
      const stomp = await until(() => talentNamed(tauren, "War Stomp"), "War Stomp among the tauren's eight");
      await stomp.update({ "system.taken": 1 });
      const use = await until(() => featureNamed(tauren, "War Stomp"), "War Stomp's Use granted");
      assert.equal(use.system.cost.pool, "momentum", "War Stomp's price is not 05 §11's kind word");
      assert.equal(use.system.resistDc, "standard", "War Stomp resists at no Standard DC");
      const near = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: tauren, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }, { actor: far, x: 1500, y: 1000, side: "hostile" }]);
      await setPool(tauren, "rage", 6);
      const sheet = await openSheet(tauren);
      let card = null;
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        card = await pressForCard(useControl(sheet, use), tauren, 15, { kind: "feature" });
      } finally {
        await sheet.close();
      }
      await until(() => poolOf(tauren, "rage").value === 2, "War Stomp's 4 Rage paid");
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.deepEqual(flags.targets.map(t => t.actorId), [near.id], "the Use did not gather the enemy within 5 feet alone");
      const resist = parsed(doc()).querySelector('button[data-action="resistTest"][data-target-index="0"]');
      assert.ok(resist, "the card offers the near ghoul no Reflex Test");
      assert.equal(Number(resist.dataset.dc), AZEROTH.STANDARD_DC[tauren.system.tier ?? 1], "the Test is not at the Standard DC for the tauren's tier");
      const pin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resist, doc());
      } finally {
        pin();
      }
      await until(() => near.statuses?.has("prone"), "the failure's Prone, laid with no button pressed");
      assert.isFalse(far.statuses?.has("prone") === true, "the ghoul 25 feet off was knocked Prone");
    });

    it("THE B8a PASS ON 07's STORMFURY: every creature within 15 feet of the target is posted its own Reflex Test - the target among them - one beyond is not, a failure takes the 10 Nature and a pass takes nothing", async function () {
      this.timeout(240000);
      const shaman = await characterOf("ZZ LD Stormfury", ["Shaman", 17], { spells: ["Stormfury"], abilities: { wis: 16 } });
      const struck = await makeNpc("Plagued Ghoul");
      const beside = await makeNpc("Plagued Ghoul");
      const beyond = await makeNpc("Plagued Ghoul");
      await sceneWith([
        { actor: shaman, x: 600, y: 1000 }, { actor: struck, x: 1500, y: 1000, side: "hostile" },
        { actor: beside, x: 1700, y: 1000, side: "hostile" }, { actor: beyond, x: 2500, y: 1000, side: "hostile" }
      ]);
      const spell = await until(() => shaman.items.find(i => i.type === "spell" && i.name === "Stormfury"), "Stormfury known");
      assert.deepInclude(spell.system.splash, { feet: 15, rating: 10, school: "nature", resilience: "reflex" }, "Stormfury carries no splash");
      await setPool(shaman, "mana", poolOf(shaman, "mana").max);
      const before = game.messages.size;
      // Cast from the sheet's own control, the one target aimed at through the canvas.
      const sheet = await openSheet(shaman);
      let card = null;
      canvas.tokens.setTargets([tokenOf(struck).id]);
      try {
        const cast = () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
          ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
        assert.ok(cast(), "the sheet draws no Cast for Stormfury");
        card = await pressForCard(cast, shaman, 18, { kind: "spell" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      assert.isTrue(card.flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
      const tests = () => game.messages.contents.slice(before).filter(m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.trigger === "splash");
      await until(() => tests().length === 2, "a splash Test for each creature within 15 feet");
      made.push(...tests());
      const of = actor => tests().find(m => m.flags["azeroth-rpg"].area.actorUuid === actor.uuid) ?? null;
      assert.ok(of(struck), "the target makes no Test, though the entry names its Bane");
      assert.ok(of(beside), "the creature beside the target makes no Test");
      assert.isNull(of(beyond), "a creature 50 feet off was posted a Test");
      assert.include(parsed(card).body.textContent, game.i18n.localize("AZEROTH.Splash.Label"), "the spell's card does not say whom the splash reaches");
      for (const [actor, face] of [[beside, 1], [struck, 20]]) {
        const message = of(actor);
        const button = parsed(message).querySelector('button[data-action="resistTest"][data-purpose="area"]');
        assert.ok(button, `${actor.name}'s splash card offers no Test`);
        const health = actor.system.health.value;
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, game.messages.get(message.id));
        } finally {
          pin();
        }
        await until(() => game.messages.get(message.id)?.flags?.["azeroth-rpg"]?.areaResult, `${actor.name}'s Test recorded`);
        if (face === 1) await until(() => actor.system.health.value < health, "the failure's 10 Nature on the ghoul beside the target");
        else {
          await settle();
          assert.equal(actor.system.health.value, health, "a passed splash Test dealt damage");
        }
      }
    });

    // ---- The B8a2 pass (written offline, not run): the gaps the B8a pass named. ----

    it("THE B8a2 PASS ON 07's THORNGUARD: its Test is a creature's entering or starting its turn there, so its cast card offers no Resist and lays no Entangled on whoever was targeted, an older card's Resist is refused in words, and Cyclone's cast Test still stands", async function () {
      this.timeout(240000);
      const druid = await characterOf("ZZ LD Thorn", ["Druid", 9], { spells: ["Thornguard", "Cyclone"], abilities: { wis: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1500, y: 1000, side: "hostile" }]);
      const thorn = await until(() => druid.items.find(i => i.type === "spell" && i.name === "Thornguard"), "Thornguard known");
      const cyclone = await until(() => druid.items.find(i => i.type === "spell" && i.name === "Cyclone"), "Cyclone known");
      await setPool(druid, "mana", poolOf(druid, "mana").max);
      const sheet = await openSheet(druid);
      const castOf = spell => () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
        ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
      let card = null;
      let second = null;
      try {
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        card = await pressForCard(castOf(thorn), druid, 18, { kind: "spell" });
        const doc = () => game.messages.get(card.id);
        assert.isTrue(doc().flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
        assert.isNull(parsed(doc()).querySelector('button[data-action="resistTest"][data-purpose="spell"]'), "Thornguard's card offers a Resist 07 asks only of a creature entering or starting its turn there");
        assert.notOk(doc().flags["azeroth-rpg"].onFail, "the card carries a failure's Entangled for a Test it never offers");
        // An older card drew that Resist: its press is refused in words and lays nothing.
        const stale = document.createElement("button");
        Object.assign(stale.dataset, { action: "resistTest", purpose: "spell", targetIndex: "0", resilience: "reflex", dc: String(druid.system.spellDC ?? 15) });
        const said = await warnings(() => CARD_ACTIONS.resistTest(stale, doc()));
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Card.ResistNotAtCast", { name: "Thornguard" }), "the older card's Resist was not refused in words");
        await settle();
        assert.isFalse(ghoul.statuses?.has("entangled") === true, "an older card's Resist laid Thornguard's Entangled on the target");
        // A Test the cast asks still stands on its card: Cyclone's *A creature that fails a Reflex Resilience Test*.
        await setPool(druid, "mana", poolOf(druid, "mana").max);
        second = await pressForCard(castOf(cyclone), druid, 18, { kind: "spell" });
        assert.ok(parsed(game.messages.get(second.id)).querySelector('button[data-action="resistTest"][data-purpose="spell"]'), "Cyclone's card offers no Resist at the cast");
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
    });

    it("THE B8a2 PASS ON 02's SHADOW WORD: DEATH'S PRICE: *On success, spend 8 Mana* - a failed Casting Test pays none of it, offers nothing and says so; a success pays the 8 once the Test has succeeded", async function () {
      this.timeout(240000);
      const priest = await characterOf("ZZ LD Death Price", ["Priest", 14], { abilities: { wis: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }, { actor: ghoul, x: 1500, y: 1000, side: "hostile" }]);
      const death = await until(() => featureNamed(priest, "Shadow Word: Death"), "Shadow Word: Death granted");
      assert.equal(death.system.cost.on, "success", "the feature's stamp does not pay its price on the success");
      const full = poolOf(priest, "mana").max;
      await setPool(priest, "mana", full);
      const sheet = await openSheet(priest);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(ghoul).id]);
        const failed = await pressForCard(useControl(sheet, death), priest, 1, { kind: "feature" });
        const lost = game.messages.get(failed.id);
        assert.isFalse(lost.flags["azeroth-rpg"].success, "a natural 1 succeeded");
        await settle();
        assert.equal(poolOf(priest, "mana").value, full, "a failed Casting Test paid the 8 Mana 02 names only on a success");
        assert.isNull(parsed(lost).querySelector('button[data-action="resistTest"]'), "a failed Test offered the target a Resist");
        assert.include(parsed(lost).body.textContent, game.i18n.format("AZEROTH.Feature.OnSuccess.Unpaid", { name: death.name, pool: game.i18n.localize(AZEROTH.poolTypes.mana) }), "the card does not say nothing was paid");
        const paid = await pressForCard(useControl(sheet, death), priest, 18, { kind: "feature" });
        assert.isTrue(game.messages.get(paid.id).flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
        await until(() => poolOf(priest, "mana").value === full - 8, "the 8 Mana paid on the success");
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
    });

    it("THE B8a2 PASS ON 14's WILD KODO: Unstoppable pressed on its own sheet records each creature's Resist - a pass takes none of the 3 and keeps its feet, a failure takes the 3 and is knocked Prone at once", async function () {
      this.timeout(240000);
      const kodo = await makeNpc("Wild Kodo");
      const passing = await characterOf("ZZ LD Kodo Pass", ["Warrior", 3]);
      const failing = await characterOf("ZZ LD Kodo Fail", ["Warrior", 3]);
      await sceneWith([{ actor: kodo, x: 1000, y: 1000, side: "hostile" }, { actor: passing, x: 1300, y: 1000 }, { actor: failing, x: 1300, y: 1300 }]);
      const index = kodo.system.creatureAbilities.findIndex(r => r.name === "Unstoppable");
      const row = kodo.system.creatureAbilities[index];
      assert.isTrue(row.automation.damage.onFail, "Unstoppable's damage is not its failure's (the seed's mark)");
      assert.isTrue(row.automation.inflicts.onFail, "Unstoppable's Prone is not its failure's");
      const sheet = await openSheet(kodo);
      let card = null;
      try {
        sheet.changeTab("traits", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(passing).id, tokenOf(failing).id]);
        const use = () => sheet.element?.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`) ?? null;
        assert.ok(use(), "the kodo's sheet draws no Use for Unstoppable");
        card = await pressForCard(use, kodo, 15, { kind: "ability" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.noneOnPass, "the ability's card does not spare a pass");
      assert.deepEqual((flags.onFailInflicts ?? []).map(i => i.condition), ["prone"], "the card's failure lands no Prone");
      const at = actor => flags.targets.findIndex(t => t.actorId === actor.id);
      // A character made by the fixture holds the schema's initial Health beneath its derived
      // maximum (10 of a Warrior 3's 17), so "took nothing" is read against what it held (B8b).
      const passingHeld = passing.system.health.value;
      for (const [actor, face] of [[passing, 20], [failing, 1]]) {
        const button = parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`);
        assert.ok(button, `${actor.name}'s row offers no Reflex Test`);
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, doc());
        } finally {
          pin();
        }
      }
      await until(() => Object.keys(doc().flags["azeroth-rpg"].resists ?? {}).length === 2, "both Tests recorded on the ability's card");
      await until(() => failing.statuses?.has("prone"), "the failure's Prone, laid with no button pressed");
      assert.isFalse(passing.statuses?.has("prone") === true, "the creature that passed was knocked Prone");
      const drawn = await doc().renderHTML();
      assert.isNull(drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(passing)}"]`), "the creature that passed is still offered the Apply");
      const apply = drawn.querySelector(`button[data-action="applyDamage"][data-target-index="${at(failing)}"]`);
      assert.ok(apply, "the creature that failed is offered no Apply");
      const health = failing.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, doc());
      await until(() => failing.system.health.value === Math.max(0, health - flags.damageByTarget[at(failing)].damage), "the failure's 3 on the one that failed");
      assert.equal(passing.system.health.value, passingHeld, "the creature that passed took damage");
    });

    it("THE B8a2 PASS ON 07's STORMFURY'S 20: *bypassing armor and Ward* - a target warded against Nature takes the whole 20 off the card, and the card says why", async function () {
      this.timeout(240000);
      const shaman = await characterOf("ZZ LD Storm Past", ["Shaman", 17], { spells: ["Stormfury"], abilities: { wis: 16 } });
      const warded = await makeNpc("Plagued Ghoul");
      await warded.update({ "system.ward.nature": 4 });
      await until(() => Number(warded.system.ward?.nature) === 4, "the ghoul's Ward against Nature");
      await sceneWith([{ actor: shaman, x: 600, y: 1000 }, { actor: warded, x: 1500, y: 1000, side: "hostile" }]);
      const spell = await until(() => shaman.items.find(i => i.type === "spell" && i.name === "Stormfury"), "Stormfury known");
      assert.isTrue(spell.system.damage.bypass, "Stormfury's damage carries no bypass (stamped by the parser)");
      await setPool(shaman, "mana", poolOf(shaman, "mana").max);
      const before = game.messages.size;
      const sheet = await openSheet(shaman);
      let card = null;
      canvas.tokens.setTargets([tokenOf(warded).id]);
      try {
        const cast = () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
          ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
        card = await pressForCard(cast, shaman, 18, { kind: "spell" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      // The splash's own Test cards, taken up with the rest.
      await settle();
      made.push(...game.messages.contents.slice(before).filter(m => m.flags?.["azeroth-rpg"]?.kind === "areaTest"));
      const flags = game.messages.get(card.id).flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.isTrue(flags.damageByTarget[0].bypass === true, "the row's mitigation does not say it bypassed");
      assert.isAtLeast(flags.damageByTarget[0].damage, 20, "Ward 4 against Nature came off the 20 the entry deals past it");
      assert.include(parsed(game.messages.get(card.id)).body.textContent, game.i18n.localize("AZEROTH.Card.Bypass"), "the card does not say the damage bypasses armor and Ward");
    });

    it("THE B8a2 PASS ON THE TROLL'S BERSERKING: a Half-Action and 4 Rage lay a Boon on the troll's own attacks for the encounter - lasting, no Test spending it - and the fight's end lifts it", async function () {
      this.timeout(240000);
      const troll = await characterOf("ZZ LD Berserk", ["Warrior", 5], { race: "Troll", abilities: { str: 16, con: 14 } });
      const talent = await until(() => talentNamed(troll, "Berserking"), "Berserking among the troll's eight");
      await talent.update({ "system.taken": 1 });
      const use = await until(() => featureNamed(troll, "Berserking"), "Berserking's Use granted");
      assert.equal(use.system.uses.per, "short", "Berserking is not once per Short Rest");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: troll, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([troll, ghoul]);
      // The troll's own turn: Berserking is a Half-Action (the lead: *"Refuse off-turn
      // Half-Actions"*), so the case says whose turn it is rather than trust the Initiatives.
      await giveTurn(combat, troll);
      await setPool(troll, "rage", 6);
      const sheet = await openSheet(troll);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        await pressForCard(useControl(sheet, use), troll, 15, { kind: "feature" });
      } finally {
        await sheet.close();
      }
      await until(() => poolOf(troll, "rage").value === 2, "Berserking's 4 Rage paid");
      const boon = await until(() => troll.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBoon?.source === "Berserking"), "the Boon on the troll");
      assert.deepEqual(boon.flags["azeroth-rpg"].laidBoon, { kind: "attack", boons: 1, source: "Berserking", lasting: true }, "the Boon is not a lasting one on attacks");
      assert.equal(boon.flags["azeroth-rpg"].talentBuff, "Berserking", "the Boon rides no encounter lift");
      assert.equal(boon.flags["azeroth-rpg"].until, "encounter");
      // A lasting Boon is no count: an attack's spend leaves it standing, and the attacks read it.
      const { spendLaidBoons } = await import("../effects/banes.mjs");
      assert.deepEqual(await spendLaidBoons(troll, "attack"), [], "an attack spent the encounter's Boon");
      assert.isTrue(troll.effects.has(boon.id), "the Boon went with a Test");
      assert.lengthOf((troll.system.laidBoonRows ?? []).filter(r => r.kind === "attack"), 1, "the troll's attacks read no Boon");
      await combat.delete();
      await until(() => !troll.effects.has(boon.id), "the encounter's Boon lifted when the fight ended");
    });

    it("THE B8a2 PASS ON THE ORC'S THRALL'S DISCIPLINE: 4 Rage and no action lay a Boon on the friend targeted within 60 feet, spent by its next Test; a friend 70 feet off is refused in words with nothing paid", async function () {
      this.timeout(240000);
      const orc = await characterOf("ZZ LD Discipline", ["Warrior", 9], { race: "Orc", abilities: { str: 16, con: 14 } });
      const talent = await until(() => talentNamed(orc, "Thrall's Discipline"), "Thrall's Discipline among the orc's eight");
      await talent.update({ "system.taken": 1 });
      const use = await until(() => featureNamed(orc, "Thrall's Discipline"), "Thrall's Discipline's Use granted");
      assert.isNull(use.system.action, "Thrall's Discipline costs an action");
      const near = await characterOf("ZZ LD Disciple Near", ["Warrior", 3]);
      const far = await characterOf("ZZ LD Disciple Far", ["Warrior", 3]);
      // Fifty feet and seventy feet off, on five feet a hundred-pixel square.
      await sceneWith([{ actor: orc, x: 500, y: 1000 }, { actor: near, x: 1500, y: 1000 }, { actor: far, x: 1900, y: 1000 }]);
      await setPool(orc, "rage", 6);
      const sheet = await openSheet(orc);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        canvas.tokens.setTargets([tokenOf(far).id]);
        const said = await pressAndHear(useControl(sheet, use));
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Laid.TooFar", { name: use.name, target: tokenOf(far).document.name, feet: 60 }), "a friend past 60 feet was not refused in words");
        assert.equal(poolOf(orc, "rage").value, 6, "the refused Use paid its Rage");
        canvas.tokens.setTargets([tokenOf(near).id]);
        await pressForCard(useControl(sheet, use), orc, 15, { kind: "feature" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      await until(() => poolOf(orc, "rage").value === 2, "the 4 Rage paid");
      const boon = await until(() => near.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBoon?.source === "Thrall's Discipline"), "the Boon on the friend");
      assert.notOk(boon.flags["azeroth-rpg"].laidBoon.lasting, "a next-Test Boon was laid lasting");
      const { spendLaidBoons } = await import("../effects/banes.mjs");
      assert.deepEqual(await spendLaidBoons(near, "skill"), ["Thrall's Discipline"], "the friend's next Test did not spend it");
      await until(() => !near.effects.has(boon.id), "the Boon spent");
    });

    // ---- The B9a pass (written offline, not run): a later Test's door, and two gated cast Tests. ----

    it("THE B9a PASS ON 07's NATURE'S GRASP: the Apply lays it; the next melee hit ends it and asks its striker's Test, whose failure Entangles and bars Opportunity Attacks; a hit turned into a miss lays the spell again and takes the Entangled off; a withdrawn hit's Test is refused in words; a pass lands nothing; and a hit after the spell has gone asks nothing", async function () {
      this.timeout(300000);
      // 07: *The next creature to hit you with a melee attack must pass a Reflex Resilience
      // Test against your Spell DC or be **Entangled** and unable to make Opportunity Attacks
      // while it is held. The spell then ends whether the Test passed or failed.* (the lead:
      // *"Build the triggers"*). Door 13: a hit turned into a miss withdraws what it laid.
      const grasp = await fromPack("azeroth-rpg.spells", "Nature's Grasp");
      const druid = await makeNpc("Sorceress");
      await druid.update({ name: "ZZ LD Grasp Sorceress", "system.power.max": 60, "system.power.value": 60 });
      await until(() => druid.system.power.value === 60, "the Sorceress's Power");
      const striker = await warriorWith("ZZ LD Grasp Striker", { weapons: ["Longsword"] });
      await sceneWith([{ actor: druid, x: 1000, y: 1000, side: "hostile" }, { actor: striker, x: 1100, y: 1000 }]);
      const pinCast = pinDie(18);
      let castCard = null;
      try {
        castCard = await game.system.azeroth.workflows.castSpell({ actor: druid, spell: grasp, dc: 5, targets: [] });
      } finally {
        pinCast();
      }
      assert.ok(castCard, "Nature's Grasp was refused");
      made.push(castCard);
      assert.isTrue(castCard.flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
      assert.equal(castCard.flags["azeroth-rpg"].struckTest?.on, "meleeHit", "the card carries no Test for the next blow");
      const apply = parsed(castCard).querySelector('[data-action="applySpellEffect"]');
      assert.ok(apply, "the card offers no Apply");
      await CARD_ACTIONS.applySpellEffect(apply, castCard);
      const holding = () => druid.effects.find(e => e.getFlag("azeroth-rpg", STRUCK_TEST_FLAG)) ?? null;
      await until(holding, "the trigger laid on the caster");
      const row = rowOf(druid, { tokenId: tokenOf(druid).id, sceneId: canvas.scene.id, defense: 5 });
      /** One blow in melee, pinned to hit, and the striker's Tests the GM's door posted for it. */
      const blow = async () => {
        const judged = untilHook(STRUCK_POSTED_HOOK, 30000, m => m?.speaker?.actor === striker.id);
        const pin = pinDie(15);
        let card = null;
        try {
          card = await game.system.azeroth.workflows.rollTest({
            actor: striker, kind: "attack", dc: 5, title: "ZZ Grasp blow", targets: [row],
            damage: { rating: 3, kind: "physical" }, strike: { rangeKind: "melee" }
          });
        } finally {
          pin();
        }
        assert.ok(card, "the blow posted no card");
        made.push(card);
        const [, posted] = await judged;
        const tests = game.messages.contents.filter(m => m.flags?.["azeroth-rpg"]?.area?.trigger === "struck" && m.flags["azeroth-rpg"].area.struck?.messageId === card.id);
        made.push(...tests);
        return { card, posted, tests };
      };
      const press = async (test, face) => {
        const button = parsed(test).querySelector('[data-action="resistTest"][data-purpose="area"]');
        assert.ok(button, "the striker's Test card carries no Resist");
        const pin = pinDie(face);
        try {
          await CARD_ACTIONS.resistTest(button, game.messages.get(test.id));
        } finally {
          pin();
        }
      };
      // A Parry's own annotation (`dice/annotate.mjs`), the write door 13 makes on the card.
      const withdraw = card => annotateHere({
        messageId: card.id, index: 0, reaction: "parry", to: 0,
        mitigated: card.flags["azeroth-rpg"].damageByTarget?.[0]?.damage ?? 0, withdrawn: true
      });

      // THE FIRST HIT ends the spell and asks its Test; the failure Entangles and bars the Opportunity Attack.
      const first = await blow();
      assert.equal(first.posted, 1, "the hit asked no Test of its striker");
      assert.lengthOf(first.tests, 1, "the hit asked its striker more than one Test");
      await until(() => !holding(), "the spell ending with the blow that asked its Test");
      await press(first.tests[0], 1);
      await until(() => striker.statuses?.has("entangled"), "the failure's Entangled on the striker");
      const held = striker.effects.find(e => e.statuses?.has("entangled"));
      assert.equal(held.getFlag("azeroth-rpg", NO_OPPORTUNITY_FLAG)?.condition, "entangled", "the Entangled does not bar Opportunity Attacks");
      assert.equal(canReact("opportunityAttack", reactionStateOf(striker)).reason, "AZEROTH.Reaction.Refuse.Grasped", "a grasped striker may still make an Opportunity Attack");
      // TURNED INTO A MISS: the spell waits again and the Entangled comes off.
      await withdraw(first.card);
      await until(holding, "the spell laid again once its hit was withdrawn");
      await until(() => !striker.statuses?.has("entangled"), "the withdrawn hit's Entangled taken off");
      await until(() => game.messages.get(first.tests[0].id)?.flags?.["azeroth-rpg"]?.area?.struck?.undone === true, "the Test card marked as settled");

      // A HIT WITHDRAWN BEFORE ITS TEST: refused in words, and nothing lands.
      const second = await blow();
      assert.equal(second.posted, 1, "the spell laid again asked nothing at the next hit");
      await until(() => !holding(), "the spell ending with the second blow");
      await withdraw(second.card);
      await until(holding, "the spell laid again once the second hit was withdrawn");
      const said = await warnings(() => press(second.tests[0], 1));
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Struck.Withdrawn", { name: striker.name, spell: "Nature's Grasp" }), "the withdrawn hit's Test was not refused in words");
      await settle();
      assert.isFalse(striker.statuses?.has("entangled") === true, "a withdrawn hit's Test landed its Entangled");

      // A PASS lands nothing, and the spell is spent all the same.
      const third = await blow();
      assert.equal(third.posted, 1);
      await until(() => !holding(), "the spell ending with the third blow");
      await press(third.tests[0], 20);
      await until(() => game.messages.get(third.tests[0].id)?.flags?.["azeroth-rpg"]?.areaResult, "the pass recorded");
      await settle();
      assert.isFalse(striker.statuses?.has("entangled") === true, "a passed Test Entangled the striker");

      // And a hit after the spell has gone asks nothing.
      const fourth = await blow();
      assert.equal(fourth.posted, 0, "a hit after the spell had ended asked a Test");
      assert.lengthOf(fourth.tests, 0);
    });

    it("THE B9a PASS ON 07's HOLY WRATH: the undead target's Resist is drawn and its failure Stuns; the living one is told in words it makes no Test, and an older card's press is refused", async function () {
      this.timeout(240000);
      // 07: *Every creature in the area takes 3 Holy damage. Against an undead creature the
      // Damage Rating is 7 instead, and an undead creature that fails a Spirit Resilience Test
      // against your Spell DC is **Stunned** until the end of its next turn.*
      const paladin = await characterOf("ZZ LD Wrath", ["Paladin", 9], { spells: ["Holy Wrath"], abilities: { wis: 16, cha: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: paladin, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }, { actor: bandit, x: 1000, y: 1100, side: "hostile" }]);
      const wrath = await until(() => paladin.items.find(i => i.type === "spell" && i.name === "Holy Wrath"), "Holy Wrath known");
      await setPool(paladin, "mana", poolOf(paladin, "mana").max);
      const sheet = await openSheet(paladin);
      const castOf = spell => () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
        ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
      let card = null;
      try {
        canvas.tokens.setTargets([tokenOf(ghoul).id, tokenOf(bandit).id]);
        card = await pressForCard(castOf(wrath), paladin, 18, { kind: "spell" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.isTrue(flags.success, "the pinned 18 failed its Casting Test");
      assert.deepEqual(flags.testGate?.kinds, ["undead"], "the card carries no gate on who makes the Test");
      const at = actor => flags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      assert.isAtLeast(at(ghoul), 0, "the ghoul is not among the card's targets");
      assert.isAtLeast(at(bandit), 0, "the bandit is not among the card's targets");
      const resist = actor => parsed(doc()).querySelector(`button[data-action="resistTest"][data-purpose="spell"][data-target-index="${at(actor)}"]`);
      assert.ok(resist(ghoul), "the undead target was offered no Resist");
      assert.isNull(resist(bandit), "the living target was offered a Resist 07 does not ask of it");
      const text = (parsed(doc()).body.textContent ?? "").replace(/\s+/g, " ");
      assert.include(text, game.i18n.format("AZEROTH.Card.TestGate.Kind", { name: flags.targets[at(bandit)].name, spell: "Holy Wrath" }), "the card does not say why the living target makes no Test");
      // The living one's older card: the press judges again, off the creature as it stands.
      const stale = document.createElement("button");
      Object.assign(stale.dataset, { action: "resistTest", purpose: "spell", targetIndex: String(at(bandit)), resilience: "spirit", dc: String(paladin.system.spellDC ?? 15) });
      const said = await warnings(() => CARD_ACTIONS.resistTest(stale, doc()));
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Card.TestGate.Kind", { name: bandit.name, spell: "Holy Wrath" }), "the living target's press was not refused in words");
      await settle();
      assert.isFalse(bandit.statuses?.has("stunned") === true, "the living target was Stunned");
      // The undead one fails, and is Stunned.
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resist(ghoul), doc());
      } finally {
        unpin();
      }
      await until(() => ghoul.statuses?.has("stunned"), "the undead target Stunned on its failure");
    });

    it("THE B9a PASS ON 07's EARTH SHOCK: a target holding a Sustained spell makes the Test and loses the spell on a failure; one holding none is told in words it makes no Test", async function () {
      this.timeout(240000);
      // 07: *The target takes 1 Nature damage. If it is holding a Sustained spell it must pass
      // a Spirit Resilience Test against your Spell DC or lose it.*
      const shaman = await characterOf("ZZ LD Shock", ["Shaman", 5], { spells: ["Earth Shock"], abilities: { wis: 16 } });
      const sorceress = await makeNpc("Sorceress");
      await sorceress.update({ name: "ZZ LD Shocked Sorceress", "system.power.max": 60, "system.power.value": 60 });
      await until(() => sorceress.system.power.value === 60, "the Sorceress's Power");
      const plain = await makeNpc("Bandit");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: sorceress, x: 1300, y: 1000, side: "hostile" }, { actor: plain, x: 1300, y: 1200, side: "hostile" }]);
      // The Sorceress holds one Sustain.
      const hoarfrost = await fromPack("azeroth-rpg.spells", "Hoarfrost");
      const pinHold = pinDie(18);
      try {
        const held = await game.system.azeroth.workflows.castSpell({ actor: sorceress, spell: hoarfrost, dc: 5, targets: [] });
        assert.ok(held?.flags?.["azeroth-rpg"]?.success, "the Sorceress's Hoarfrost did not go off");
        made.push(held);
      } finally {
        pinHold();
      }
      await until(() => (sorceress.getFlag("azeroth-rpg", "sustaining") ?? []).length === 1, "the Sorceress sustaining Hoarfrost");
      const shock = await until(() => shaman.items.find(i => i.type === "spell" && i.name === "Earth Shock"), "Earth Shock known");
      const sheet = await openSheet(shaman);
      const castOf = spell => () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
        ?? sheet.element?.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
      let atHolder = null;
      let atPlain = null;
      try {
        await setPool(shaman, "mana", poolOf(shaman, "mana").max);
        canvas.tokens.setTargets([tokenOf(sorceress).id]);
        atHolder = await pressForCard(castOf(shock), shaman, 18, { kind: "spell" });
        await setPool(shaman, "mana", poolOf(shaman, "mana").max);
        canvas.tokens.setTargets([tokenOf(plain).id]);
        atPlain = await pressForCard(castOf(shock), shaman, 18, { kind: "spell" });
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      // At the one holding a Sustain: the Test, and the spell lost on a failure.
      const holderCard = () => game.messages.get(atHolder.id);
      assert.isTrue(holderCard().flags["azeroth-rpg"].success, "the pinned 18 failed its Casting Test");
      assert.equal(holderCard().flags["azeroth-rpg"].testGate?.loses, "sustain", "the card does not carry what a failure loses");
      const button = parsed(holderCard()).querySelector('button[data-action="resistTest"][data-purpose="spell"][data-target-index="0"]');
      assert.ok(button, "the target holding a Sustain was offered no Resist");
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, holderCard());
      } finally {
        unpin();
      }
      await until(() => (sorceress.getFlag("azeroth-rpg", "sustaining") ?? []).length === 0, "the failure losing the Sustained spell");
      // At the one holding none: no button, the reason in words, and an older press refused.
      const plainCard = () => game.messages.get(atPlain.id);
      assert.isNull(parsed(plainCard()).querySelector('button[data-action="resistTest"][data-purpose="spell"]'), "a target holding no Sustain was offered a Resist");
      const text = (parsed(plainCard()).body.textContent ?? "").replace(/\s+/g, " ");
      assert.include(text, game.i18n.format("AZEROTH.Card.TestGate.Sustain", { name: plainCard().flags["azeroth-rpg"].targets[0].name, spell: "Earth Shock" }), "the card does not say why the target makes no Test");
      const stale = document.createElement("button");
      Object.assign(stale.dataset, { action: "resistTest", purpose: "spell", targetIndex: "0", resilience: "spirit", dc: String(shaman.system.spellDC ?? 15) });
      const said = await warnings(() => CARD_ACTIONS.resistTest(stale, plainCard()));
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Card.TestGate.Sustain", { name: plain.name, spell: "Earth Shock" }), "the older press was not refused in words");
    });
  });
}
