/**
 * **WHAT A TALENT SPENDS AS PART OF AN ATTACK, AND DAMAGE OR HEALING LAID ON A
 * CREATURE AT THE START OF EACH OF ITS TURNS** (D-770; the lead, 2026-10-03:
 * *"Lines on attack dialog"*, *"Build the tick now"*), inside a live world.
 *
 * - Mangle through the REAL attack dialog: the line ticked, 2 Ferocity paid
 *   when the attack rolls, and Bleeding at the rank LANDED on the target with
 *   no button pressed (the lead, 2026-10-03: *"Lands automatically"*), the card
 *   saying so; refused in words when the pool is short, with the Half-Action
 *   and the Ferocity still in hand;
 * - Rip spending all the Ferocity, its Bleeding off what was spent, landed;
 * - Feral Charge once a round: the free Move granted, the round marked, the
 *   Inflict button kept for a blow with no target, and a second refused in
 *   words;
 * - Feral Charge paid BEFORE the blow from the Combat tab's own button (*"Either
 *   order"*): the free Move, the chip, the dialog's line drawn as paid, a second
 *   press refused, and the next attack its charge - nothing paid twice, Prone
 *   landed on a hit, the button greyed with its reason after;
 * - a pool that moves while the attack is being paid for is paid from what it
 *   holds then (the review's item D);
 * - Moonfire cast at a creature in no fight lays no tick and says so (item A);
 * - Rejuvenation laid from its card, healing at each start of its target's
 *   turn and gone at its last; Moonfire's card laying its tick on the caster's
 *   span;
 * - Serpent's tears: the Test on the card, a failure laying 2 damage a turn for
 *   3 turns, and nothing after;
 * - `endTick` removing a laid heal.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.riders-ticks`. Every document a test
 * makes is deleted in `after`.
 */

import { cleanup, dialogFor, drainAreaWork, fromPack, give, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
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

const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const ticks = () => game.system.azeroth.ticks;

/** A card's HTML as a document the buttons can be read off. */
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Riders Ticks Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/** Target one actor's token, as a player's click would. */
function target(actor) {
  const token = actor?.getActiveTokens?.(true)[0] ?? null;
  canvas.tokens.setTargets(token ? [token.id] : []);
  return token;
}

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing", 30000);
  return combat;
}

/** The next round of a fight, and its turn events landed on the active GM's client. */
async function nextRound(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextRound();
  await settled;
}

/** The effect on an actor carrying a laid tick of this name, or null. */
const tickEffect = (actor, name) => actor.effects.find(e => e.name === name && e.getFlag("azeroth-rpg", "tick")) ?? null;

export function ridersTicksBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Riders on the attack dialog, and ticks on the creature (D-770)", function () {
    let restore = null;
    let wasViewing = null;
    let bear = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      bear = await fromPack("azeroth-rpg.bestiary", "Black Bear");
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // Fights first, then the scene, then everything else (D-757's order).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /** A level 5 Druid in the Black Bear, these Feral talents taken, holding this much Ferocity. */
    async function feralDruid(name, { ferocity = 0, ranks = {} } = {}) {
      const druid = await makeCharacter({ name, classes: [["Druid", 5]] });
      for (const [talent, rank] of Object.entries(ranks)) {
        const t = await until(() => talentNamed(druid, talent), `${talent} on the sheet`);
        await t.update({ "system.taken": rank });
      }
      await game.system.azeroth.shapes.takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.inShapeshiftForm === true, "the Black Bear");
      assert.ok(poolOf(druid, "ferocity"), "the Druid holds no Ferocity");
      await setFerocity(druid, ferocity);
      for (const [talent] of Object.entries(ranks)) {
        await until(() => druid.riderLines().some(l => l.name === talent), `${talent}'s line`);
      }
      return druid;
    }

    /**
     * Put this much Ferocity in the pool. **AFTER a fight starts**, never before:
     * a fight begins every Momentum pool at 0 (02 §7, D-627), Ferocity among them.
     */
    async function setFerocity(druid, value) {
      const pool = poolOf(druid, "ferocity");
      await druid.updatePool({ itemId: pool.itemId, kind: "momentum", value });
      await until(() => poolOf(druid, "ferocity").value === value, `${value} Ferocity`);
    }

    /** One attack with the bear's first natural row, straight through the workflow, the die pinned. */
    async function claw(druid, { riders = [], face = 18, ghoul = null } = {}) {
      const claws = druid.readyWeapons()[0];
      assert.ok(claws?.natural, "the bear has no natural attack");
      const unpin = pinDie(face);
      try {
        const row = ghoul ? { tokenId: ghoul.getActiveTokens(true)[0]?.id ?? null, sceneId: canvas.scene?.id ?? null, actorId: ghoul.id, name: ghoul.name,
          defense: ghoul.system.defense, apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, immune: [], vulnerable: [],
          statuses: [], conditions: {}, size: null, swarm: false, creatureType: null, acted: null } : null;
        const card = await game.system.azeroth.workflows.rollTest({
          actor: druid, kind: "attack", dc: 10, title: claws.name, riders,
          damage: { rating: claws.system.rating ?? 0, kind: "physical" }, strike: { rangeKind: "melee" },
          ...(row ? { targets: [row] } : {})
        });
        if (card) made.push(card);
        return card;
      } finally {
        unpin();
      }
    }

    it("MANGLE through the real attack dialog: an unticked line priced in Ferocity, 2 paid when the attack rolls, and Bleeding at the rank LANDED on the target with no button pressed", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Mangle", { ferocity: 3, ranks: { Mangle: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      target(ghoul);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const claws = druid.readyWeapons()[0];
      const unpin = pinDie(18);
      let card = null;
      try {
        const pending = attackWithDialog(druid, claws);
        const dialog = await dialogFor(druid, 8000);
        assert.ok(dialog, "the attack dialog did not open");
        const box = dialog.element.querySelector('input[name="rider-mangle"]');
        assert.ok(box, "the dialog draws no Mangle line");
        assert.isFalse(box.checked, "a rider came ticked: spending a pool is the player's call");
        assert.isFalse(box.disabled, "Mangle was greyed with 3 Ferocity held");
        const line = box.closest("label").textContent.replace(/\s+/g, " ");
        assert.include(line, game.i18n.format("AZEROTH.Rider.Price", { n: 2, pool: game.i18n.localize("AZEROTH.Pool.Ferocity") }), "the line names no price");
        box.checked = true;
        dialog.element.querySelector('button[data-action="roll"]').click();
        card = await pending;
      } finally {
        unpin();
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
      assert.ok(card, "the attack posted no card");
      made.push(card);
      assert.isTrue(card.rolls[0].outcome.success, "the pinned blow missed");
      assert.equal(poolOf(druid, "ferocity").value, 1, "Mangle did not take 2 Ferocity");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rider.Card.Paid", { n: 2, pool: game.i18n.localize("AZEROTH.Pool.Ferocity") }),
        "the card does not say what was paid");
      // **LANDED WITH THE BLOW** (the lead: *"Lands automatically"*): nothing pressed.
      await until(() => ghoul.statuses?.has("bleeding"), "Bleeding on the ghoul with no button pressed");
      const bleeding = ghoul.effects.find(e => e.statuses?.has("bleeding"));
      assert.equal(bleeding.getFlag("azeroth-rpg", "value"), 2, "the ghoul bleeds at the wrong value");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rider.Card.Landed", {
        name: ghoul.name, condition: game.i18n.localize(AZEROTH.conditions.bleeding), value: 2
      }), "the card does not say what landed on whom");
      assert.isNull(parsed(card).querySelector('[data-action="applyCondition"][data-condition="bleeding"]'), "the card still offers a button for what already landed");
    });

    it("MANGLE refused when the pool is short: greyed with its reason in words on the dialog, and refused at the roll with the Half-Action and the Ferocity in hand", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Short", { ferocity: 1, ranks: { Mangle: 1 } });
      const spec = { kind: "attack", title: "Claws", damage: { rating: 4, kind: "physical" }, rangeKind: "melee" };
      const line = prepareRoll(druid, spec).riders.find(l => l.identifier === "mangle");
      assert.ok(line, "the dialog offers no Mangle line");
      assert.isFalse(line.available, "Mangle was offered with 1 Ferocity held");
      assert.equal(line.reason.key, "AZEROTH.Rider.Refused.Short");
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      await setFerocity(druid, 1);
      const budget = foundry.utils.deepClone(mine.getFlag("azeroth-rpg", "budget"));
      let card = null;
      const said = await warnings(async () => { card = await claw(druid, { riders: ["mangle"] }); });
      assert.isNull(card, "a short pool still rolled");
      const words = game.i18n.format("AZEROTH.Rider.Refused.Short", { name: "Mangle", cost: 2, pool: game.i18n.localize("AZEROTH.Pool.Ferocity"), value: 1 });
      assert.include(said, words, "the refusal is not said in words");
      assert.equal(poolOf(druid, "ferocity").value, 1, "a refused rider spent Ferocity");
      assert.deepEqual(mine.getFlag("azeroth-rpg", "budget"), budget, "a refused rider spent the Half-Action (D-768)");
    });

    it("RIP spends ALL the Ferocity, and its Bleeding is half of it rounded down plus the rank", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Rip", { ferocity: 5, ranks: { Mangle: 1, Rip: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const card = await claw(druid, { riders: ["rip"], ghoul });
      assert.ok(card, "Rip's attack posted no card");
      assert.equal(poolOf(druid, "ferocity").value, 0, "Rip did not spend all the Ferocity");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rider.Card.Paid", { n: 5, pool: game.i18n.localize("AZEROTH.Pool.Ferocity") }));
      // Landed with the blow at floor(5/2) + 1, and no button left to press.
      await until(() => ghoul.statuses?.has("bleeding"), "Rip's Bleeding on the ghoul");
      assert.equal(ghoul.effects.find(e => e.statuses?.has("bleeding")).getFlag("azeroth-rpg", "value"), 3, "Rip's Bleeding is not floor(5/2) + 1");
      assert.isNull(parsed(card).querySelector('[data-action="applyCondition"][data-condition="bleeding"]'), "the card still offers Rip's Bleeding as a button");
    });

    it("FERAL CHARGE once a round: 2 Ferocity buys a free Move and marks the round, Prone on a hit at rank 2, and a second is refused in words", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Charge", { ferocity: 6, ranks: { "Feral Charge": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      await setFerocity(druid, 6);
      const freeBefore = mine.budget.freeMove ?? 0;
      const card = await claw(druid, { riders: ["feral-charge"] });
      assert.ok(card, "Feral Charge's attack posted no card");
      await until(() => (mine.getFlag("azeroth-rpg", "round")?.riders ?? []).includes("feral-charge"), "the round's mark");
      await until(() => (mine.budget.freeMove ?? 0) === freeBefore + 1, "the free Move");
      // 6 less 2 for the charge, and what the hit built back in the form (D-627).
      const built = (card.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "ferocity")?.gained ?? 0;
      assert.equal(poolOf(druid, "ferocity").value, Math.min(poolOf(druid, "ferocity").max, 4 + built), "the charge was not paid");
      // No target was recorded, so nothing could land: the Inflict button is kept, and the card says why.
      assert.ok(parsed(card).querySelector('[data-action="applyCondition"][data-condition="prone"]'), "rank 2's hit offers no Prone");
      assert.include(textOf(card), game.i18n.localize("AZEROTH.Rider.Card.NoTarget"), "the card does not say why the button is there");
      // The line is greyed on the dialog now, with its reason.
      const line = prepareRoll(druid, { kind: "attack", title: "Claws", damage: { rating: 4, kind: "physical" }, rangeKind: "melee" })
        .riders.find(l => l.identifier === "feral-charge");
      assert.isFalse(line.available, "Feral Charge was offered twice in a round");
      assert.equal(line.reason.key, "AZEROTH.Rider.Refused.Once");
      // And a second, pressed anyway, is refused before anything is spent.
      const ferocity = poolOf(druid, "ferocity").value;
      const budget = foundry.utils.deepClone(mine.getFlag("azeroth-rpg", "budget"));
      let second = "unset";
      const said = await warnings(async () => { second = await claw(druid, { riders: ["feral-charge"] }); });
      assert.isNull(second, "a second Feral Charge rolled");
      assert.include(said, game.i18n.format("AZEROTH.Rider.Refused.Once", { name: "Feral Charge", cost: 2, pool: game.i18n.localize("AZEROTH.Pool.Ferocity"), value: ferocity }));
      assert.equal(poolOf(druid, "ferocity").value, ferocity, "the refused charge spent Ferocity");
      assert.deepEqual(mine.getFlag("azeroth-rpg", "budget"), budget, "the refused charge spent the Half-Action");
    });

    it("FERAL CHARGE paid BEFORE the blow from the Combat tab's own button: the free Move and the chip, the dialog's line drawn as paid, a second press refused, and the next attack its charge with nothing paid twice", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Precharge", { ferocity: 6, ranks: { "Feral Charge": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      await setFerocity(druid, 6);
      const freeBefore = mine.budget.freeMove ?? 0;
      const sheet = druid.sheet;
      await sheet.render({ force: true });
      const selector = 'section[data-tab="combat"] [data-action="primeRider"][data-rider="feral-charge"]';
      try {
        // The REAL button, pressed (D-748): never the door called by hand.
        const button = await until(() => sheet.element?.querySelector(selector), "the Combat tab's Feral Charge button");
        assert.isFalse(button.disabled, "the charge was greyed on the druid's own turn with 6 Ferocity");
        button.click();
        await until(() => (mine.getFlag("azeroth-rpg", "round")?.primed ?? []).includes("feral-charge"), "the charge primed on the round's record");
        await until(() => poolOf(druid, "ferocity").value === 4, "2 Ferocity paid for the charge");
        await until(() => (mine.budget.freeMove ?? 0) === freeBefore + 1, "the charge's free Move");
        await until(() => sheet.element?.querySelector('section[data-tab="combat"] .azeroth-state-chip[data-rider="feral-charge"]'), "the chip saying the charge is paid");
        // The attack's dialog draws the line as paid, with its words.
        const line = prepareRoll(druid, { kind: "attack", title: "Claws", damage: { rating: 4, kind: "physical" }, rangeKind: "melee" })
          .riders.find(l => l.identifier === "feral-charge");
        assert.isTrue(line.primed, "the dialog does not know the charge is paid");
        assert.equal(line.reason.key, "AZEROTH.Rider.Refused.Primed");
        // A second press is refused in words and pays nothing.
        const { primeRider } = await import("../applications/combat-actions.mjs");
        let again = "unset";
        const said = await warnings(async () => { again = await primeRider(druid, "feral-charge"); });
        assert.isNull(again, "a second charge was paid");
        assert.include(said, game.i18n.format("AZEROTH.Rider.Refused.Primed", { name: "Feral Charge" }));
        assert.equal(poolOf(druid, "ferocity").value, 4, "the refused press spent Ferocity");
        // The next attack is the charge, ticked or not: nothing more paid, Prone LANDED on the hit.
        const card = await claw(druid, { ghoul });
        assert.ok(card, "the charging attack posted no card");
        const built = (card.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "ferocity")?.gained ?? 0;
        assert.equal(poolOf(druid, "ferocity").value, Math.min(poolOf(druid, "ferocity").max, 4 + built), "the charge was paid twice");
        assert.equal(mine.budget.freeMove ?? 0, freeBefore + 1, "the attack granted a second free Move");
        assert.include(textOf(card), game.i18n.localize("AZEROTH.Rider.Card.PaidBefore"), "the card does not say the charge was paid before the blow");
        await until(() => ghoul.statuses?.has("prone"), "Prone on the ghoul with no button pressed");
        await until(() => (mine.getFlag("azeroth-rpg", "round")?.primed ?? []).length === 0, "the charge taken by the attack");
        assert.include(mine.getFlag("azeroth-rpg", "round").riders ?? [], "feral-charge", "the round no longer counts the charge spent");
        // And the tab's button is greyed with its reason in words.
        await sheet.render();
        await until(() => sheet.element?.querySelector(selector)?.disabled === true, "the charge greyed after the attack");
        assert.include(sheet.element.querySelector('section[data-tab="combat"] .azeroth-state-why')?.textContent ?? "",
          game.i18n.format("AZEROTH.Rider.Refused.Once", { name: "Feral Charge" }), "the greyed charge does not say why");
      } finally {
        await sheet.close();
      }
    });

    it("a pool that moves while the attack is being paid for is paid from what it holds THEN, never from what it held when the attack was asked for (the review's item D)", async function () {
      this.timeout(180000);
      const druid = await feralDruid("ZZ Rider Fresh", { ferocity: 3, ranks: { Mangle: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      await setFerocity(druid, 3);
      // Ferocity rises to 6 while the Half-Action's queued write is in flight.
      const spend = mine.spendAction;
      mine.spendAction = async function (...args) {
        const result = await spend.apply(this, args);
        await setFerocity(druid, 6);
        return result;
      };
      let card = null;
      try {
        card = await claw(druid, { riders: ["mangle"] });
      } finally {
        delete mine.spendAction;
      }
      assert.ok(card, "Mangle's attack posted no card");
      const built = (card.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "ferocity")?.gained ?? 0;
      assert.equal(poolOf(druid, "ferocity").value, Math.min(poolOf(druid, "ferocity").max, 4 + built),
        "Mangle was paid off the pool as it stood before the budget: the rise was written over");
    });

    it("MOONFIRE cast at a creature in no fight lays no tick: the card says so in words and offers no Apply for it (the review's item A)", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Tick Outside", classes: [["Druid", 5]], spells: ["Moonfire"] });
      const bystander = await makeCharacter({ name: "ZZ Tick Bystander", classes: [["Warrior", 3]] });
      const mana = druid.system.powers.find(p => p.name === "mana");
      await druid.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await until(() => druid.system.powers.find(p => p.name === "mana").value === mana.max, "a full Mana pool");
      assert.isNull(druid.activeFight(), "the druid is in a fight");
      assert.isNull(bystander.activeFight(), "the target is in a fight");
      const row = { tokenId: null, sceneId: null, actorId: bystander.id, name: bystander.name, defense: bystander.system.defense,
        apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], conditions: {} };
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await game.system.azeroth.workflows.castSpell({ actor: druid, spell: druid.items.find(i => i.name === "Moonfire"), targets: [row] });
      } finally {
        unpin();
      }
      assert.ok(card, "Moonfire posted no card");
      made.push(card);
      assert.isNull(card.flags["azeroth-rpg"].tick ?? null, "a tick nothing can end was stamped on the card");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Tick.NoClock", { spell: "Moonfire" }), "the card does not say why no tick is laid");
      assert.isNull(parsed(card).querySelector('[data-action="applySpellEffect"]'), "the card offers an Apply that lays a tick nothing ends");
      assert.ok(parsed(card).querySelector('[data-action="applyDamage"]'), "Moonfire's 4 on the cast left the card");
    });

    it("REJUVENATION, laid from its card, heals at each start of its target's turn, counts down, and is gone at its last - and Moonfire's card lays its tick on the caster's span", async function () {
      this.timeout(240000);
      const druid = await makeCharacter({ name: "ZZ Tick Druid", classes: [["Druid", 5]], spells: ["Rejuvenation", "Moonfire"] });
      const patient = await makeCharacter({ name: "ZZ Tick Patient", classes: [["Warrior", 3]] });
      const mana = druid.system.powers.find(p => p.name === "mana");
      await druid.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await until(() => druid.system.powers.find(p => p.name === "mana").value === mana.max, "a full Mana pool");
      const row = { tokenId: null, sceneId: null, actorId: patient.id, name: patient.name, defense: patient.system.defense,
        apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], conditions: {} };
      const cast = async name => {
        const unpin = pinDie(18);
        try {
          const card = await game.system.azeroth.workflows.castSpell({ actor: druid, spell: druid.items.find(i => i.name === name), targets: [row] });
          if (card) made.push(card);
          return card;
        } finally {
          unpin();
        }
      };
      const combat = await fightWith([patient]);
      // Moonfire: 4 on the cast, and a tick of 2 laid on the caster's span.
      const moon = await cast("Moonfire");
      const moonTick = moon.flags["azeroth-rpg"].tick;
      assert.deepInclude(moonTick, { kind: "damage", type: "arcane", amount: 2, rounds: 1, until: "casterTurnEnd" });
      assert.ok(parsed(moon).querySelector('[data-action="applySpellEffect"]'), "Moonfire's card offers no Apply for its tick");
      assert.ok(parsed(moon).querySelector('[data-action="applyDamage"]'), "Moonfire's 4 is no longer on the card");
      assert.include(textOf(moon), game.i18n.localize("AZEROTH.Tick.Label"), "the card does not say what lands each turn");

      const rejuv = await cast("Rejuvenation");
      assert.ok(rejuv?.flags?.["azeroth-rpg"]?.tick, "Rejuvenation's card carries no tick");
      assert.isNull(parsed(rejuv).querySelector('[data-action="applyHealing"]'), "the card still heals at the cast");
      const apply = parsed(rejuv).querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(apply, "Rejuvenation's card offers no Apply");
      await CARD_ACTIONS.applySpellEffect(apply, rejuv);
      const laid = await until(() => tickEffect(patient, "Rejuvenation"), "Rejuvenation laid");
      assert.deepInclude(laid.getFlag("azeroth-rpg", "tick"), { kind: "heal", amount: 2, rounds: 10, source: druid.uuid });
      await patient.update({ "system.health.value": Math.max(1, patient.system.health.max - 8) });
      const start = patient.system.health.value;
      await nextRound(combat);
      await until(() => patient.system.health.value === start + 2, "the first turn start's 2 Health");
      await until(() => tickEffect(patient, "Rejuvenation")?.getFlag("azeroth-rpg", "tick")?.rounds === 9, "the countdown");
      // The last of its ten, without walking nine more rounds: the countdown is the rule.
      await tickEffect(patient, "Rejuvenation").update({ "flags.azeroth-rpg.tick.rounds": 1 });
      // **A CASTER WHO HAS GONE MUST NOT THROW** (D-757's lesson): the druid is
      // deleted, and the tick still lands with no hand behind it.
      await druid.delete();
      await until(() => !game.actors.has(druid.id), "the druid gone");
      await nextRound(combat);
      await until(() => patient.system.health.value === start + 4, "the last turn start's 2 Health, its caster gone");
      await until(() => !tickEffect(patient, "Rejuvenation"), "Rejuvenation gone at its last");
      await nextRound(combat);
      await settle();
      assert.equal(patient.system.health.value, start + 4, "Rejuvenation healed after it ended");
    });

    it("SERPENT'S TEARS: the Test on the card, and a failure lays 2 damage at each of the next 3 turn starts, then nothing", async function () {
      this.timeout(240000);
      const rogue = await makeCharacter({ name: "ZZ Tick Poisoner", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = rogue.items.find(i => i.name === "Dagger");
      await dagger.update({ "system.equipped": true });
      const tears = await give(rogue, "Serpent's tears");
      await game.system.azeroth.workflows.useGear({ actor: rogue, item: tears });
      const coating = await until(() => rogue.items.get(dagger.id)?.getFlag("azeroth-rpg", "coating"), "the poison on the dagger");
      assert.deepInclude(coating.tick, { kind: "damage", amount: "2", rounds: 3 }, "the coating carries no tick");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: rogue, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      target(ghoul);
      const combat = await fightWith([ghoul]);
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await attackWithDialog(rogue, rogue.items.get(dagger.id));
      } finally {
        unpin();
      }
      assert.ok(card, "the poisoned blow posted no card");
      made.push(card);
      assert.ok(card.flags["azeroth-rpg"].poisons?.length, "the card carries no tick poison");
      const button = parsed(card).querySelector('[data-action="resistTest"][data-purpose="poison"]');
      assert.ok(button, "the card offers no Test for the poison");
      assert.equal(button.dataset.dc, "13");
      const fail = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, card);
      } finally {
        fail();
      }
      const laid = await until(() => tickEffect(ghoul, "Serpent's tears"), "the poison's tick on the ghoul");
      assert.deepInclude(laid.getFlag("azeroth-rpg", "tick"), { kind: "damage", type: null, amount: 2, rounds: 3, source: rogue.uuid });
      const start = ghoul.system.health.value;
      for (let turn = 1; turn <= 3; turn++) {
        await nextRound(combat);
        await until(() => ghoul.system.health.value === start - 2 * turn, `turn ${turn}'s 2 damage`);
      }
      await until(() => !tickEffect(ghoul, "Serpent's tears"), "the poison gone after its third turn");
      await nextRound(combat);
      await settle();
      assert.equal(ghoul.system.health.value, start - 6, "the poison dealt damage after its turns");
    });

    it("ENDTICK removes one healing tick the caster laid, and finds nothing to end after", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Tick Ender", classes: [["Druid", 5]], spells: ["Rejuvenation"] });
      const patient = await makeCharacter({ name: "ZZ Tick Ended", classes: [["Warrior", 3]] });
      const mana = druid.system.powers.find(p => p.name === "mana");
      await druid.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const row = { tokenId: null, sceneId: null, actorId: patient.id, name: patient.name, defense: patient.system.defense,
        apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], conditions: {} };
      const unpin = pinDie(18);
      let card = null;
      try {
        card = await game.system.azeroth.workflows.castSpell({ actor: druid, spell: druid.items.find(i => i.name === "Rejuvenation"), targets: [row] });
      } finally {
        unpin();
      }
      made.push(card);
      await CARD_ACTIONS.applySpellEffect(parsed(card).querySelector('[data-action="applySpellEffect"][data-target-index="0"]'), card);
      await until(() => tickEffect(patient, "Rejuvenation"), "Rejuvenation laid");
      assert.isNull(await ticks().endTick(patient, { from: patient, kind: "heal" }), "another hand's heal was ended");
      assert.isNull(await ticks().endTick(patient, { from: druid, kind: "damage" }), "a heal was ended as damage");
      const ended = await ticks().endTick(patient, { from: druid, kind: "heal" });
      assert.equal(ended?.name, "Rejuvenation", "endTick ended nothing");
      await until(() => !tickEffect(patient, "Rejuvenation"), "the heal gone");
      assert.isNull(await ticks().endTick(patient, { from: druid, kind: "heal" }), "endTick found a second heal to end");
    });
  });
}
