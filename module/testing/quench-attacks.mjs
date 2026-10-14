/**
 * How many attacks a turn, inside a live world (D-704, rewritten for D-711).
 *
 * **These are use tests, and they exist because a unit test cannot see a
 * missing caller** (D-681). `rules/initiative.mjs` and
 * `rules/attacks-per-round.test.mjs` cover the law and the source text in Node;
 * what neither can reach is a real turn budget on a real combatant, a second
 * roll actually reaching `rollTest`, and the dialog's own `<select>` sending
 * that roll at somebody else. Every one of those is a document method over a
 * prepared actor, and none of them loads under Vitest.
 *
 * The three rules under test:
 *
 * 1. **05 §10** — *you may Attack once for each Half-Action you spend on it*:
 *    two Attacks a turn, and the third refused for want of a Half-Action, in
 *    words. For a creature exactly as for a character, which is why 14 §1's
 *    Boss exemption went.
 * 2. **06 §1** — the off hand RIDES the main-hand Attack and costs no
 *    Half-Action; a lone off-hand blow pays for itself; one each round.
 * 3. **02 §6** — Extra Attack is *two attacks each time you Attack*: ONE
 *    Half-Action, TWO cards.
 *
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, giveTurn, made, makeBoss, makeCharacter, makeNpc, dialogFor, fromPack, pinDie, settle, untilHook, PACK_FOR } from "./fixtures.mjs";
import { attackWithDialog, castWithDialog, npcAttackWithDialog, reactionRows } from "../applications/actions.mjs";
// Where a distance between tokens is measured (D-732).
import { distanceBetween, enemyDistances } from "../applications/roll-dialog.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
// A Parry pressed on a real attack card (D-724).
import { CARD_ACTIONS } from "../dice/chat.mjs";

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

/**
 * Notifications of one kind raised while `fn` runs, with the original put back.
 * **A refusal that says nothing is a fault**: the tracker has to say why an
 * action is unavailable.
 */
async function noticesFrom(kind, fn) {
  const raised = [];
  const original = ui.notifications[kind];
  ui.notifications[kind] = function (...args) { raised.push(String(args[0] ?? "")); return original.apply(this, args); };
  try { await fn(raised); } finally { ui.notifications[kind] = original; }
  return raised;
}

/** Every attack card an actor posts while `fn` runs, in order. */
async function cardsFrom(actor, fn) {
  const cards = [];
  const hookId = Hooks.on("createChatMessage", msg => {
    if (msg.speaker?.actor === actor.id && msg.flags?.["azeroth-rpg"]?.kind === "attack") cards.push(msg);
  });
  try { await fn(); } finally { Hooks.off("createChatMessage", hookId); }
  await settle();
  return cards;
}

/**
 * Start a fight and WAIT FOR ITS TURN EVENTS TO FINISH (D-627): both call
 * `resetBudget`, so a spend made before they land is silently put back.
 */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing");
  return combat;
}

/** The combatant for an actor in a fight. */
const combatantOf = (combat, actor) => combat.getCombatantsByActor(actor)[0];

/** A weapon out of 08 §7, in the actor's hands. */
async function arm(actor, name) {
  const doc = await fromPack(PACK_FOR.weapon, name);
  if (!doc) throw new Error(`the weapons pack holds no "${name}"`);
  const source = doc.toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} to be in hand`);
  return actor.items.get(item.id);
}

export function attacksPerRoundBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Attacks per turn (D-704, D-711)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      await cleanup();
    });

    /* ---- 05 §10: one Attack for each Half-Action -------------------------- */

    it("posts TWO attack cards in one turn and refuses the third in words", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Two Attacks Warrior", classes: [["Warrior", 3]] });
      const sword = await arm(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = combatantOf(combat, actor);
      const unpin = pinDie(18);
      try {
        const first = await cardsFrom(actor, () => attackWithDialog(actor, sword));
        assert.equal(first.length, 1, "the first Attack did not land");
        const second = await cardsFrom(actor, () => attackWithDialog(actor, sword));
        assert.equal(second.length, 1, "the SECOND Attack of the turn was refused (05 §10, D-711)");
        await until(() => me.budget.halfActions === 0, "both Half-Actions to be spent");
        const said = await noticesFrom("warn", async () => {
          const third = await cardsFrom(actor, () => attackWithDialog(actor, sword));
          assert.equal(third.length, 0, "a third Attack landed on two Half-Actions");
        });
        // THE REFUSAL IS LOCALISED, and it names the Half-Action rather than a
        // limit: every one of these was a raw English toast until D-711.
        const words = game.i18n.format("AZEROTH.Budget.Refuse.NeedsHalves", { n: 1 });
        assert.notInclude(words, "AZEROTH.Budget", "the refusal key is not in lang/en.json");
        assert.ok(said.some(s => s === words), `the refusal did not say why: ${JSON.stringify(said)}`);
      } finally {
        unpin();
      }
    });

    /* ---- 02 §6: one Half-Action, two rolls -------------------------------- */

    it("a level-5 character posts TWO cards for ONE Half-Action", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Extra Attack Warrior", classes: [["Warrior", 5]] });
      await until(() => actor.hasExtraAttack === true, "the level-5 Extra Attack feature");
      const sword = await arm(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = combatantOf(combat, actor);
      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, () => attackWithDialog(actor, sword));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 2, "Extra Attack is TWO attacks each time you Attack (02 §6)");
      // ONE Half-Action: the second roll rides inside the first, through
      // `budget: "none"`. `attacked` is the fact the off hand rides, and it is
      // what `attacks === 0` used to say before the counter went (D-711).
      await until(() => me.budget.halfActions === 1, "one Half-Action to be spent");
      assert.isTrue(me.budget.attacked, "the budget does not record that an Attack was made");
      assert.equal(me.budget.halfActions, 1, "the second roll spent a Half-Action of its own");
      // And the second card says which roll it is.
      assert.include(cards[1].content, game.i18n.localize("AZEROTH.Attack.SecondRoll"),
        "the second card does not say it is the second attack");
    });

    it("a character WITHOUT it posts one", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ One Attack Warrior", classes: [["Warrior", 4]] });
      assert.isFalse(actor.hasExtraAttack, "level 4 should not hold Extra Attack");
      const sword = await arm(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      await fightWith([actor, foe]);
      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, () => attackWithDialog(actor, sword));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 1, "one Attack, one roll");
    });

    it("gives a level-5 character FOUR rolls in a turn, two Attacks of two", async function () {
      // D7 §6's O-112 in one test: D1 measured the turn against one Attack, and
      // a level-5 martial now rolls up to four times before the off hand.
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Four Rolls Warrior", classes: [["Warrior", 5]] });
      await until(() => actor.hasExtraAttack === true, "the level-5 Extra Attack feature");
      const sword = await arm(actor, "Longsword");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = combatantOf(combat, actor);
      const unpin = pinDie(18);
      try {
        const cards = await cardsFrom(actor, async () => {
          await attackWithDialog(actor, sword);
          await attackWithDialog(actor, sword);
        });
        assert.equal(cards.length, 4, "two Attacks of two rolls each did not post four cards");
        await until(() => me.budget.halfActions === 0, "both Half-Actions to be spent");
      } finally {
        unpin();
      }
    });

    /* ---- 06 §1: the off hand rides the Attack ----------------------------- */

    it("charges NO Half-Action for an off-hand blow after a main-hand Attack (D-711)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Riding Daggers", classes: [["Rogue", 3]] });
      const dagger = await arm(actor, "Dagger");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      // *In a turn in which you Attack* (06 §1): the off hand is the Rogue's
      // own turn's, and the order of two tokenless combatants is whichever
      // Initiative came out higher.
      await giveTurn(combat, actor);
      const me = combatantOf(combat, actor);
      const unpin = pinDie(18);
      try {
        const main = await cardsFrom(actor, () => attackWithDialog(actor, dagger));
        assert.equal(main.length, 1, "the main-hand Attack did not land");
        await until(() => me.budget.halfActions === 1, "the Attack's own Half-Action");
        const off = await cardsFrom(actor, () => attackWithDialog(actor, dagger, null, { offHand: true }));
        assert.equal(off.length, 1, "the off-hand blow was refused");
        assert.equal(me.budget.halfActions, 1, "the off-hand blow charged a Half-Action: it rides the Attack");
        assert.equal(me.budget.offHandAttacks, 0, "the off-hand blow was not counted");
        // And the second is refused by its own rule, with a Half-Action still
        // in hand - so the refusal has to name the off hand, not the budget.
        const said = await noticesFrom("warn", async () => {
          const second = await cardsFrom(actor, () => attackWithDialog(actor, dagger, null, { offHand: true }));
          assert.equal(second.length, 0, "a second Off-Hand Attack landed in one round (06 §1 allows one)");
        });
        const words = game.i18n.localize("AZEROTH.Budget.Refuse.OffHandSpent");
        assert.notInclude(words, "AZEROTH.Budget", "the refusal key is not in lang/en.json");
        assert.ok(said.some(s => s === words), `the refusal did not say why: ${JSON.stringify(said)}`);
        assert.equal(me.budget.halfActions, 1, "the refused blow spent a Half-Action anyway");
      } finally {
        unpin();
      }
    });

    it("charges a LONE off-hand blow its own Half-Action (D-711)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Lone Off Hand", classes: [["Rogue", 3]] });
      const dagger = await arm(actor, "Dagger");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      await giveTurn(combat, actor);
      const me = combatantOf(combat, actor);
      const unpin = pinDie(18);
      try {
        const off = await cardsFrom(actor, () => attackWithDialog(actor, dagger, null, { offHand: true }));
        assert.equal(off.length, 1, "the lone off-hand blow was refused");
        await until(() => me.budget.halfActions === 1, "a Half-Action to be spent");
        assert.isFalse(me.budget.attacked, "an off-hand blow became the Attack the next one rides");
      } finally {
        unpin();
      }
    });

    it("draws the off hand's own button on the main-hand card (D-711)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Card Off Hand", classes: [["Rogue", 3]] });
      const main = await arm(actor, "Longsword");
      const off = await arm(actor, "Dagger");
      await off.update({ "system.offHand": true });
      await until(() => actor.items.get(off.id)?.system?.offHand === true, "the dagger to be in the off hand");
      const foe = await makeNpc("Kobold");
      // The button is drawn only in the attacker's own turn (06 §1, D-720).
      await giveTurn(await fightWith([actor, foe]), actor);
      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, () => attackWithDialog(actor, main));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 1, "the main-hand Attack did not land");
      const html = document.createElement("div");
      html.innerHTML = cards[0].content;
      const button = html.querySelector('[data-action="offHandFromCard"]');
      assert.ok(button, "the main-hand card carries no off-hand strike button");
      assert.equal(button.dataset.itemId, off.id, "the button does not name the weapon in the off hand");
      assert.include(button.textContent, off.name, "the button does not say what it swings");
    });

    it("does not double the off hand for a level-5 character (06 §2, in those words)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Off-Hand Warrior", classes: [["Warrior", 5]] });
      await until(() => actor.hasExtraAttack === true, "the level-5 Extra Attack feature");
      const dagger = await arm(actor, "Dagger");
      const foe = await makeNpc("Kobold");
      await giveTurn(await fightWith([actor, foe]), actor);
      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, () => attackWithDialog(actor, dagger, null, { offHand: true }));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 1, "Extra Attack doubled the off hand");
    });

    it("leaves the main hand its Attack after a lone off-hand blow (06 §1)", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Both Hands", classes: [["Rogue", 3]] });
      const dagger = await arm(actor, "Dagger");
      const foe = await makeNpc("Kobold");
      await giveTurn(await fightWith([actor, foe]), actor);
      const unpin = pinDie(18);
      try {
        await cardsFrom(actor, () => attackWithDialog(actor, dagger, null, { offHand: true }));
        const main = await cardsFrom(actor, () => attackWithDialog(actor, dagger));
        assert.equal(main.length, 1, "the off-hand blow ate the turn's second Half-Action");
      } finally {
        unpin();
      }
    });

    it("REFUSES AN OFF-HAND BLOW ON SOMEBODY ELSE'S TURN, and draws no button for it (06 §1)", async function () {
      this.timeout(180000);
      // *You may make one each round, and only in a turn in which you Attack.*
      // `attacked` sits on the budget until the turn is reset, so the button on
      // a card the fight has moved past bought a free blow on another
      // creature's turn - and a lone one would have spent a Half-Action of a
      // turn nobody was taking.
      const actor = await makeCharacter({ name: "ZZ Out Of Turn", classes: [["Rogue", 3]] });
      const main = await arm(actor, "Longsword");
      const off = await arm(actor, "Dagger");
      await off.update({ "system.offHand": true });
      await until(() => actor.items.get(off.id)?.system?.offHand === true, "the dagger in the off hand");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      await giveTurn(combat, actor);
      const me = combatantOf(combat, actor);

      const unpin = pinDie(18);
      let card;
      try {
        const cards = await cardsFrom(actor, () => attackWithDialog(actor, main));
        assert.equal(cards.length, 1, "the main-hand Attack did not land");
        card = cards[0];
      } finally {
        unpin();
      }
      assert.isTrue(me.budget.attacked, "the turn does not remember the Attack the off hand rides");

      // The fight moves on. The budget still says an Attack was made, because
      // nothing resets it until this combatant's turn comes round again.
      await giveTurn(combat, foe);
      assert.isTrue(me.budget.attacked, "the budget was reset by somebody else's turn");
      const halves = me.budget.halfActions;
      const unpin2 = pinDie(18);
      let said = [];
      try {
        said = await noticesFrom("warn", async () => {
          const late = await cardsFrom(actor, () => attackWithDialog(actor, off, null, { offHand: true }));
          assert.equal(late.length, 0, "an off-hand blow landed on another creature's turn");
        });
      } finally {
        unpin2();
      }
      const words = game.i18n.localize("AZEROTH.Budget.Refuse.OffHandNotYourTurn");
      assert.notInclude(words, "AZEROTH.Budget", "the refusal key is not in lang/en.json");
      assert.ok(said.some(s => s === words), `the refusal did not say why: ${JSON.stringify(said)}`);
      assert.equal(me.budget.halfActions, halves, "the refused blow spent a Half-Action anyway");
      assert.equal(me.budget.offHandAttacks, 1, "the refused blow was counted against the round's one");

      // And a card struck on this creature's turn carries the button, while one
      // struck on another's does not: a control nobody may press is not drawn.
      assert.include(card.content, 'data-action="offHandFromCard"',
        "the turn's own card carries no off-hand button");
      const unpin3 = pinDie(18);
      let elsewhere;
      try {
        elsewhere = (await cardsFrom(actor, () => attackWithDialog(actor, main)))[0] ?? null;
      } finally {
        unpin3();
      }
      if (elsewhere) {
        assert.notInclude(elsewhere.content, 'data-action="offHandFromCard"',
          "a blow struck on somebody else's turn drew the off hand's button");
      }
    });

    /* ---- 14 §1: a creature Attacks as 05 gives it -------------------------- */

    it("lets a Boss attack TWICE in its turn, and refuses the third for want of Half-Actions", async function () {
      this.timeout(120000);
      const boss = await makeBoss();
      assert.equal(boss.system.weightClass, "boss", "the fixture did not give a Boss");
      const party = await makeCharacter({ name: "ZZ Boss Victim", classes: [["Warrior", 1]] });
      const combat = await fightWith([boss, party]);
      // 14 §1's exemption is gone with the limit it was an exemption from
      // (D-711): the budget carries no Attack counter for anybody.
      assert.notProperty(combatantOf(combat, boss).budget, "attacks",
        "a Boss's budget still carries an Attack counter");
      const unpin = pinDie(18);
      try {
        const first = await cardsFrom(boss, () => npcAttackWithDialog(boss, 0));
        assert.equal(first.length, 1, "the Boss's first blow did not land");
        const second = await cardsFrom(boss, () => npcAttackWithDialog(boss, 0));
        assert.equal(second.length, 1, "the Boss was refused its SECOND attack");
        const said = await noticesFrom("warn", async () => {
          const third = await cardsFrom(boss, () => npcAttackWithDialog(boss, 0));
          assert.equal(third.length, 0, "a third attack landed on two Half-Actions");
        });
        // THE REASON MATTERS: the Half-Actions are the bound, and nothing else.
        assert.ok(said.some(s => s === game.i18n.format("AZEROTH.Budget.Refuse.NeedsHalves", { n: 1 })),
          `the refusal did not name the Half-Action: ${JSON.stringify(said)}`);
      } finally {
        unpin();
      }
    });

    it("gives a Standard creature the same two, and no more (D-711)", async function () {
      // The rule is 05's for everybody now: a Standard was refused its second
      // blow until D-711, and the Boss above was the exception. Neither is.
      this.timeout(120000);
      const foe = await makeNpc("Sellsword");
      assert.equal(foe.system.weightClass, "standard", "the fixture did not give a Standard");
      const party = await makeCharacter({ name: "ZZ Standard Victim", classes: [["Warrior", 1]] });
      const combat = await fightWith([foe, party]);
      assert.notProperty(combatantOf(combat, foe).budget, "attacks", "a Standard still carries an Attack counter");
      const unpin = pinDie(18);
      try {
        assert.equal((await cardsFrom(foe, () => npcAttackWithDialog(foe, 0))).length, 1, "the first blow did not land");
        assert.equal((await cardsFrom(foe, () => npcAttackWithDialog(foe, 0))).length, 1, "the SECOND blow was refused");
        const said = await noticesFrom("warn", async () => {
          const third = await cardsFrom(foe, () => npcAttackWithDialog(foe, 0));
          assert.equal(third.length, 0, "a third attack landed on two Half-Actions");
        });
        assert.ok(said.some(s => s === game.i18n.format("AZEROTH.Budget.Refuse.NeedsHalves", { n: 1 })),
          `the refusal did not say why: ${JSON.stringify(said)}`);
      } finally {
        unpin();
      }
    });

    it("rolls twice for a creature a GM has given Extra Attack (L1)", async function () {
      this.timeout(120000);
      const foe = await makeNpc("Sellsword");
      // The flag the NPC sheet's checkbox writes; no block in 14 carries it.
      await foe.setFlag("azeroth-rpg", "extraAttack", true);
      await until(() => foe.hasExtraAttack === true, "the GM's Extra Attack flag");
      const party = await makeCharacter({ name: "ZZ Twice-Struck", classes: [["Warrior", 1]] });
      await fightWith([foe, party]);
      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(foe, () => npcAttackWithDialog(foe, 0));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 2, "a creature with Extra Attack rolled once");
    });
  });

  /* ---- 02 §7's Sprint: the first Move of the fight is free (D-712) -------- */

  describe("Sprint (02 §7, D-712)", function () {
    after(async function () {
      this.timeout(120000);
      await cleanup();
    });

    /** Advance one turn and wait for the lifecycle to land (D-627). */
    async function step(combat) {
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextTurn();
      await settled;
      await settle();
    }

    /** Turn the tracker until it is this combatant's, however the sides fell. */
    async function turnTo(combat, combatant) {
      for (let i = 0; i < 8 && combat.combatant?.id !== combatant.id; i++) await step(combat);
      await until(() => combat.combatant?.id === combatant.id, "the combatant's own turn");
    }

    it("spends the free Move first and charges the second (a level-4 Rogue)", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Sprinter", classes: [["Rogue", 4]] });
      await until(() => actor.items.some(i => i.type === "feature" && i.name === "Sprint"),
        "the level-4 Sprint feature");
      const sprint = actor.items.find(i => i.type === "feature" && i.name === "Sprint");
      assert.equal(sprint.system.freeMove, 1, "the sync did not stamp Sprint's free Move");
      const speed = actor.system.speed;
      assert.isAbove(speed, 0, "the Rogue has no Speed to Move with");

      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = combatantOf(combat, actor);
      await turnTo(combat, me);
      await until(() => me.budget.halfActions === 2, "a fresh budget");
      assert.equal(me.budget.freeMove, 1, "the turn did not hold Sprint's free Move");

      // One Speed's worth is one Move, and Sprint pays for it.
      await me.spendMovement({ passed: { distance: speed } });
      await until(() => me.budget.freeMove === 0, "the free Move to be spent");
      assert.equal(me.budget.halfActions, 2, "the first Move charged a Half-Action");

      // The second Move is the turn's own.
      await me.spendMovement({ history: { distance: speed }, passed: { distance: speed } });
      await until(() => me.budget.halfActions === 1, "the second Move to be charged");
    });

    it("gives it once a fight, not once a turn", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Sprinter Round Two", classes: [["Rogue", 4]] });
      await until(() => actor.items.some(i => i.type === "feature" && i.name === "Sprint"), "the Sprint feature");
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      const me = combatantOf(combat, actor);
      await turnTo(combat, me);
      assert.equal(me.budget.freeMove, 1, "the first turn did not hold the free Move");

      // Round the tracker back to this combatant: `acted` lands at the end of
      // its turn, and the budget that follows is built without the Move.
      do { await step(combat); } while (combat.combatant?.id !== me.id);
      await until(() => me.getFlag("azeroth-rpg", "acted") === true, "the turn to have ended once");
      await until(() => me.budget.freeMove === 0, "the free Move to be gone on the second turn");
      assert.equal(me.budget.halfActions, 2, "the second turn did not start fresh");
    });
  });

  /* ---- L3: the two rolls may split -------------------------------------- */

  describe("The second roll may go elsewhere (D-704, L3)", function () {
    let priorSetting;
    let scene;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: true }));
      await cleanup();
    });

    it("sends the second card at the token the dialog picked", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Splitter", classes: [["Warrior", 5]] });
      await until(() => actor.hasExtraAttack === true, "the level-5 Extra Attack feature");
      const sword = await arm(actor, "Longsword");
      const a = await makeNpc("Kobold");
      const b = await makeNpc("Sellsword");

      // A scene at five feet a square, both foes inside the sword's reach: a
      // blow outside it raises a line of its own on the dialog (D-716) and
      // this test is about the second-target select, not about the distance.
      scene = await Scene.create({
        name: "ZZ Split Scene", width: 2000, height: 1000,
        grid: { size: 100, distance: 5, units: "ft" }
      });
      made.push(scene);
      await scene.view();
      const data = [];
      for (const [who, x, side] of [[actor, 500, "FRIENDLY"], [a, 600, "HOSTILE"], [b, 400, "HOSTILE"]]) {
        await who.update({ "prototypeToken.actorLink": true });
        data.push((await who.getTokenDocument({ x, y: 500, disposition: CONST.TOKEN_DISPOSITIONS[side] })).toObject());
      }
      await scene.createEmbeddedDocuments("Token", data);
      await until(() => [actor, a, b].every(w => w.getActiveTokens(true).length), "the tokens to be placed");
      await settle();

      const tokenA = a.getActiveTokens(true)[0];
      const tokenB = b.getActiveTokens(true)[0];
      canvas.tokens.setTargets([tokenA.id, tokenB.id]);
      await until(() => game.user.targets.size === 2, "both foes to be targeted");

      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, async () => {
          const rolling = attackWithDialog(actor, sword);
          const dialog = await dialogFor(actor);
          assert.ok(dialog, "the roll dialog did not open");
          const form = dialog.element.querySelector("form");
          const select = form.elements.secondTarget;
          assert.ok(select, "the dialog offered no second-attack target");
          // *The same target* first, then every token the user has targeted.
          assert.equal(select.options[0].value, "same", "the default is not the same target");
          assert.include([...select.options].map(o => o.value), tokenB.id, "the second foe was not offered");
          select.value = tokenB.id;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          dialog.element.querySelector('button[data-action="roll"]').click();
          await rolling;
        });
      } finally {
        unpin();
      }

      assert.equal(cards.length, 2, "one Attack did not post two cards");
      const targetsOf = card => (card.flags["azeroth-rpg"].targets ?? []).map(t => t.tokenId);
      assert.deepEqual(targetsOf(cards[0]), [tokenA.id, tokenB.id], "the first roll did not go at what was targeted");
      assert.deepEqual(targetsOf(cards[1]), [tokenB.id], "the second roll did not follow the dialog's pick");
    });
  });

  /* ---- D-724, D-725: what a blow records for whoever reads it next ------- */

  describe("What a blow records (D-724, D-725)", function () {
    let priorSetting;
    let wasViewing = null;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      canvas?.tokens?.setTargets?.([]);
      // Scenes last but one: deleting the VIEWED scene tears the canvas down,
      // so the scene that was being viewed is put back before this one goes.
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) await wasViewing.view().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /** The strike and the source a card recorded. */
    const recorded = card => card.flags?.["azeroth-rpg"] ?? {};

    it("a Longsword swing records a sword, in melee, from the swinger's own token - on both Extra Attack cards", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Recorded Swordsman", classes: [["Warrior", 5]] });
      await until(() => actor.hasExtraAttack === true, "the level-5 Extra Attack feature");
      const sword = await arm(actor, "Longsword");

      const scene = await Scene.create({ name: "ZZ Record Scene", width: 2000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await actor.getTokenDocument({ x: 500, y: 500, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })).toObject();
      const [placed] = await scene.createEmbeddedDocuments("Token", [data]);
      await until(() => canvas.ready && canvas.scene?.id === scene.id && actor.getActiveTokens(true).length === 1, "the swordsman's token on the viewed scene");
      // Nothing selected: the only token there is is the one that swings.
      canvas.tokens.releaseAll();
      await settle();
      assert.isTrue(canvas.ready, "the scene was viewed and the canvas is not ready");

      const unpin = pinDie(18);
      let cards;
      try {
        cards = await cardsFrom(actor, () => attackWithDialog(actor, sword));
      } finally {
        unpin();
      }
      assert.equal(cards.length, 2, "Extra Attack did not post two cards");
      for (const [i, card] of cards.entries()) {
        const flags = recorded(card);
        assert.ok(flags.strike, `card ${i + 1} recorded no strike`);
        assert.equal(flags.strike.form, "sword", `card ${i + 1}: a Longsword is not a sword`);
        assert.equal(flags.strike.rangeKind, "melee", `card ${i + 1}: a Longsword is not melee`);
        assert.equal(flags.strike.via, "identifier");
        assert.deepEqual(flags.strike.weapon, { id: sword.id, identifier: "longsword", name: "Longsword" });
        assert.isNull(flags.strike.ammunition);
        assert.ok(flags.source, `card ${i + 1} recorded no source`);
        assert.equal(flags.source.tokenId, placed.id, `card ${i + 1} names the wrong token`);
        assert.equal(flags.source.sceneId, scene.id, `card ${i + 1} names the wrong scene`);
        // An attack is not a Parry and answers nothing.
        assert.notProperty(flags, "parry");
        assert.notProperty(flags, "answers");
      }
    });

    it("a Hunting bow records the arrow it shoots and the bundle it came out of", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Recorded Archer", classes: [["Ranger", 1]], weapons: ["Hunting bow", "Hunting arrows"] });
      const bow = actor.items.find(i => i.name === "Hunting bow");
      const arrows = actor.items.find(i => i.name === "Hunting arrows");
      const unpin = pinDie(15);
      let card;
      try {
        card = await attackWithDialog(actor, bow);
      } finally {
        unpin();
      }
      assert.ok(card, "the shot posted no card");
      const { strike, source } = recorded(card);
      assert.equal(strike?.form, "arrow", "a bow does not shoot an arrow");
      assert.equal(strike.rangeKind, "ranged");
      assert.equal(strike.via, "launcher");
      assert.deepEqual(strike.weapon, { id: bow.id, identifier: "hunting-bow", name: "Hunting bow" });
      assert.deepEqual(strike.ammunition, { id: arrows.id, identifier: "hunting-arrows", name: "Hunting arrows" });
      // No token of its own anywhere: nobody is named rather than somebody guessed.
      assert.isNull(source, "a creature with no token recorded a source");
    });

    it("an Amani hatchet THROWN records a thrown axe, thrown", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Recorded Thrower", classes: [["Warrior", 1]], weapons: ["Amani hatchet"] });
      const hatchet = actor.items.find(i => i.name === "Amani hatchet");
      const unpin = pinDie(15);
      let card;
      try {
        // **SAID TO BE A THROW** (D-731). Nothing is measured here - no token on
        // any scene - and an unmeasured hatchet opens in the hand now, because
        // 08 §5's Thrown says it MAY be thrown. What this case keeps testing is
        // the thrown record, so the way is settled by the caller.
        card = await attackWithDialog(actor, hatchet, null, { mode: "thrown" });
      } finally {
        unpin();
      }
      assert.ok(card, "the throw posted no card");
      const { strike } = recorded(card);
      assert.equal(strike?.form, "thrown-axe", "an Amani hatchet is not a thrown axe");
      assert.equal(strike.rangeKind, "thrown");
      // And it rolled the throw's ability, not the hand's (06 §1).
      const labels = card.rolls[0].options.provenance.map(p => p.label);
      assert.include(labels, "AZEROTH.Ability.Dex.Label", "a throw did not roll Dexterity");
      assert.notInclude(labels, "AZEROTH.Ability.Str.Label", "a throw rolled Strength");
    });

    it("a Black Bear's claws and bite record the row each came from", async function () {
      this.timeout(120000);
      const bear = await makeNpc("Black Bear");
      // 14's block: Claws first, then Bite.
      assert.deepEqual(bear.system.attacks.map(a => a.name), ["Claws", "Bite"], "the Black Bear's rows moved");
      const unpin = pinDie(15);
      let claws;
      let bite;
      try {
        claws = (await cardsFrom(bear, () => npcAttackWithDialog(bear, 0)))[0];
        bite = (await cardsFrom(bear, () => npcAttackWithDialog(bear, 1)))[0];
      } finally {
        unpin();
      }
      assert.ok(claws && bite, "the bear's two rows did not post two cards");
      assert.equal(recorded(claws).strike?.form, "claw");
      assert.deepEqual(recorded(claws).strike.row, { index: 0, name: "Claws" });
      assert.equal(recorded(bite).strike?.form, "bite");
      assert.deepEqual(recorded(bite).strike.row, { index: 1, name: "Bite" });
      assert.isNull(recorded(bite).strike.weapon, "a block row recorded a weapon");
      assert.equal(recorded(bite).strike.via, "words");
    });

    it("a Parry card says it is a Parry, what it was made with, and which blow it answered", async function () {
      this.timeout(180000);
      const attacker = await makeCharacter({ name: "ZZ Recorded Attacker", classes: [["Warrior", 5]] });
      const victim = await makeCharacter({ name: "ZZ Recorded Parrier", classes: [["Warrior", 5]], weapons: ["Longsword"] });
      const sword = victim.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      await until(() => victim.items.get(sword.id)?.system?.equipped === true, "the sword being drawn");
      // *A class that builds Momentum, and 1 Momentum* (06 §6, D-720).
      const rage = victim.poolSnapshot().find(p => p.name === "rage");
      assert.ok(rage, "a Warrior holds no Rage pool");
      await victim.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 6 });
      await until(() => (victim.poolSnapshot().find(p => p.name === "rage")?.value ?? 0) === 6, "the Rage to pay for the Parry");

      // A real attack card at the parrier, with the Reaction rows the door builds.
      const s = victim.system;
      const target = {
        tokenId: null, sceneId: null, actorId: victim.id, name: victim.name, defense: s.defense ?? 10,
        apByLocation: { body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 },
        absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [], size: null, swarm: false,
        creatureType: null, acted: null
      };
      const weak = pinDie(5);
      let card;
      try {
        card = await game.system.azeroth.workflows.rollTest({
          actor: attacker, kind: "attack", dc: 5, title: "ZZ Recorded blow",
          targets: [target], reactions: reactionRows([target]),
          modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }],
          damage: { rating: 8, kind: "physical" }
        });
      } finally {
        weak();
      }
      assert.ok(card, "the attack posted no card");
      const strong = pinDie(20);
      let parried;
      try {
        parried = await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, card);
      } finally {
        strong();
      }
      assert.ok(parried, "the Parry posted no card");
      const flags = recorded(parried);
      assert.equal(flags.kind, "attack", "a Parry is still an Attack Test");
      assert.isTrue(flags.parry, "the Parry card does not say it is a Parry");
      assert.deepEqual(flags.answers, { messageId: card.id, index: 0 }, "the Parry does not say which blow it answered");
      assert.equal(flags.strike?.form, "sword", "the Parry does not say what it was made with");
      // And the blow it answered is not marked a Parry.
      assert.notProperty(recorded(card), "parry");
    });
  });

  /* ---- D-731: in the hand or thrown ---------------------------------------- */

  describe("In the hand or thrown (D-731)", function () {
    let priorSetting;
    let wasViewing = null;
    let scene = null;
    let rogue = null;
    let dagger = null;

    /** A token for an actor on this describe's scene, drawn and linked. */
    async function placeOn(actor, x, { y = 500, side = "hostile" } = {}) {
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await actor.getTokenDocument({
        x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
      })).toObject();
      const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
      await until(() => canvas.tokens.get(doc.id)?.center, `${actor.name}'s token drawn`, 20000);
      return doc;
    }

    /**
     * One hostile creature standing at a distance from the rogue for the length
     * of `fn`, targeted, and gone afterwards - so no earlier foe is left inside
     * the rogue's reach to make it Engaged for a later case.
     */
    async function withFoe(feet, fn, { name = "Kobold" } = {}) {
      const foe = await makeNpc(name);
      const token = await placeOn(foe, 500 + feet * 20);
      canvas.tokens.setTargets([token.id]);
      await until(() => game.user.targets.size === 1, "the foe to be targeted");
      try {
        return await fn(foe, token);
      } finally {
        canvas.tokens.setTargets([]);
        await token.delete().catch(() => {});
        // A case that failed with its dialog open must not hand that dialog to
        // the next one: `dialogFor` finds a roll dialog by the actor's id, and
        // an orphan from a failed switch once answered the 50 ft case's
        // questions with the 5 ft case's markup.
        for (const app of [...foundry.applications.instances.values()]) {
          if (app.element?.id?.startsWith("azeroth-roll-")) await app.close().catch(() => {});
        }
      }
    }

    /** The labels a card's roll carries, and the circumstance row's words. */
    const labelsOf = card => card.rolls[0].options.provenance.map(p => p.label);
    const circumstanceOf = card => card.rolls[0].options.provenance.find(p => p.label === "AZEROTH.Dialog.Circumstance")?.formula ?? "";
    const ENGAGED = () => game.i18n.localize("AZEROTH.Modifier.EngagedRanged");

    before(async function () {
      this.timeout(180000);
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Thrown Choice Scene", width: 3000, height: 1500, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene on the board", 30000);
      // Strength 16 and Dexterity 10: the two modifiers differ, so which one the
      // roll added is never ambiguous.
      rogue = await makeCharacter({ name: "ZZ Thrown Rogue", classes: [["Rogue", 1]], abilities: { str: 16, dex: 10 } });
      dagger = await arm(rogue, "Dagger");
      await placeOn(rogue, 500, { side: "friendly" });
      canvas.tokens.releaseAll();
      await settle();
    });
    after(async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-")) await app.close().catch(() => {});
      }
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) await wasViewing.view().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("a Dagger at 5 ft is struck IN THE HAND: Strength, no Engaged Bane, and a dagger in melee", async function () {
      this.timeout(120000);
      await withFoe(5, async () => {
        const unpin = pinDie(15);
        let cards;
        try {
          cards = await cardsFrom(rogue, () => attackWithDialog(rogue, dagger));
        } finally {
          unpin();
        }
        assert.equal(cards.length, 1, "the stab posted no card");
        const card = cards[0];
        assert.include(labelsOf(card), "AZEROTH.Ability.Str.Label", "a blow in the hand did not roll Strength (06 §1)");
        assert.notInclude(labelsOf(card), "AZEROTH.Ability.Dex.Label", "a blow in the hand rolled Dexterity");
        assert.notInclude(circumstanceOf(card), ENGAGED(), "a blow in the hand took the Engaged Bane a ranged attack takes");
        assert.deepInclude(card.flags["azeroth-rpg"].strike, { form: "dagger", rangeKind: "melee" });
      });
    });

    it("the same Dagger at 15 ft opens THROWN: Dexterity, and a thrown dagger", async function () {
      this.timeout(120000);
      await withFoe(15, async () => {
        const unpin = pinDie(15);
        let cards;
        try {
          cards = await cardsFrom(rogue, () => attackWithDialog(rogue, dagger));
        } finally {
          unpin();
        }
        assert.equal(cards.length, 1, "the throw posted no card");
        const card = cards[0];
        assert.include(labelsOf(card), "AZEROTH.Ability.Dex.Label", "a throw did not roll Dexterity (06 §1)");
        assert.notInclude(labelsOf(card), "AZEROTH.Ability.Str.Label", "a throw rolled Strength");
        assert.deepInclude(card.flags["azeroth-rpg"].strike, { form: "thrown-dagger", rangeKind: "thrown" });
      });
    });

    it("at 5 ft SWITCHED to Thrown it takes Dexterity and the Engaged Bane, and switching back leaves neither behind", async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      try {
        await withFoe(5, async () => {
          const unpin = pinDie(15);
          let cards;
          try {
            cards = await cardsFrom(rogue, async () => {
              const rolling = attackWithDialog(rogue, dagger);
              const dialog = await dialogFor(rogue, 8000);
              assert.ok(dialog, "the roll dialog did not open");
              const form = () => dialog.element.querySelector("form");
              const select = () => form().querySelector("select[name='attackMode']");
              const automaticBox = id => {
                const box = form().querySelector(`input[name="line-${id}"]`);
                const legend = box?.closest("fieldset")?.querySelector("legend")?.textContent?.trim() ?? null;
                return box && legend === game.i18n.localize("AZEROTH.Dialog.Automatic") ? box : null;
              };
              const listed = () => form().querySelector(".azeroth-dialog-modifiers")?.textContent ?? "";
              const STR = game.i18n.localize("AZEROTH.Ability.Str.Label");
              const DEX = game.i18n.localize("AZEROTH.Ability.Dex.Label");

              assert.ok(select(), "a Dagger's dialog draws no way to strike it");
              assert.isNull(select().getAttribute("data-action"), "the select carries a data-action, which fires on click alone");
              assert.equal(select().value, "hand", "at 5 ft the Dagger did not open in the hand");
              assert.isNull(automaticBox("engagedRanged"), "a blow in the hand raised the Engaged Bane as a measured line");
              assert.include(listed(), STR);
              assert.notInclude(listed(), DEX);

              // Thrown: the measured Engaged Bane arrives, checked, with Dexterity.
              select().value = "thrown";
              select().dispatchEvent(new Event("change", { bubbles: true }));
              assert.equal(select().value, "thrown", "the switch did not hold");
              assert.ok(automaticBox("engagedRanged"), "a throw at an adjacent target raised no Engaged Bane (06 §5)");
              assert.isTrue(automaticBox("engagedRanged").checked, "the measured Engaged Bane came unchecked");
              assert.include(listed(), DEX);
              assert.notInclude(listed(), STR);

              // Back in the hand: NOTHING of the throw survives.
              select().value = "hand";
              select().dispatchEvent(new Event("change", { bubbles: true }));
              assert.isNull(automaticBox("engagedRanged"), "the throw's Engaged Bane survived a switch back to the hand");
              const judged = form().querySelector('input[name="line-engagedRanged"]');
              if (judged) assert.isFalse(judged.checked, "the throw's checked Bane leaked onto the table's judgement line");
              assert.include(listed(), STR);
              assert.notInclude(listed(), DEX);

              // Thrown again - and then the dialog RE-RENDERED, which draws the
              // content it opened on, in the hand. The render handler has to lay
              // the throw back over it: ApplicationV2 freezes `options`, and the
              // first switch wrote `options.content`, threw, and left a form
              // showing a throw that believed it was a stab (D-731's review).
              select().value = "thrown";
              select().dispatchEvent(new Event("change", { bubbles: true }));
              await dialog.render();
              await until(() => form()?.querySelector("select[name='attackMode']")?.value === "thrown",
                "the re-rendered dialog to show the throw it was switched to", 8000);
              assert.equal(select().value, "thrown", "a re-render put the dialog back in the hand");
              assert.include(listed(), DEX, "the re-rendered throw does not list Dexterity");
              assert.notInclude(listed(), STR, "the re-rendered throw still lists Strength");
              assert.ok(automaticBox("engagedRanged"), "the re-rendered throw lost its Engaged Bane");
              dialog.element.querySelector('button[data-action="roll"]').click();
              await rolling;
            });
          } finally {
            unpin();
          }
          assert.equal(cards.length, 1, "the switched throw posted no card");
          const card = cards[0];
          assert.include(labelsOf(card), "AZEROTH.Ability.Dex.Label", "the switched throw did not roll Dexterity");
          assert.notInclude(labelsOf(card), "AZEROTH.Ability.Str.Label", "the switched throw rolled Strength");
          assert.include(circumstanceOf(card), ENGAGED(), "a throw at an adjacent target did not take the Engaged Bane");
          assert.deepInclude(card.flags["azeroth-rpg"].strike, { form: "thrown-dagger", rangeKind: "thrown" });
        });
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
    });

    it("at 50 ft it opens in the hand with the out-of-reach warning, and the throw is refused IN WORDS", async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      try {
        await withFoe(50, async () => {
          const rolling = attackWithDialog(rogue, dagger);
          const dialog = await dialogFor(rogue, 8000);
          try {
            assert.ok(dialog, "the roll dialog did not open");
            const select = dialog.element.querySelector("select[name='attackMode']");
            assert.ok(select, "the choice was taken away rather than refused");
            assert.equal(select.value, "hand", "at 50 ft the Dagger did not open in the hand");
            const thrown = select.querySelector("option[value='thrown']");
            assert.ok(thrown, "the refused way was removed rather than greyed (D5)");
            assert.isTrue(thrown.disabled, "a throw past twice its range is offered");
            const said = dialog.element.querySelector(".azeroth-dialog-mode-refused")?.textContent ?? "";
            assert.include(said, "50", `the refusal does not say how far: ${said}`);
            assert.include(said, "40", `the refusal does not say twice the range: ${said}`);
            const reach = dialog.element.querySelector('input[name="line-outOfReach"]');
            assert.ok(reach, "the blow in the hand raised no out-of-reach line (D-716)");
            assert.isTrue(reach.checked);
            assert.ok(dialog.element.querySelector(".azeroth-dialog-warnings"), "no warning sentence beside the line (D-716)");
            // **A SWITCH THAT CANNOT HAPPEN PUTS THE SELECT BACK** (D-731's
            // review). The greyed option can still be set by a script; the form
            // stays the stab's, so the select must say so.
            select.value = "thrown";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            const after = dialog.element.querySelector("select[name='attackMode']");
            assert.equal(after.value, "hand", "a refused way left the select reading Thrown over the stab's form");
            assert.ok(dialog.element.querySelector('input[name="line-outOfReach"]'), "a refused switch replaced the stab's form");
          } finally {
            await dialog?.close();
          }
          assert.isNull(await rolling, "a closed dialog rolled something");
        });
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
    });

    it("a Javelin at 5 ft stays thrown: 08 §7 prints it a Range, and it has no hand", async function () {
      this.timeout(120000);
      const javelin = await arm(rogue, "Javelin");
      try {
        await withFoe(5, async () => {
          const unpin = pinDie(15);
          let cards;
          try {
            cards = await cardsFrom(rogue, () => attackWithDialog(rogue, javelin));
          } finally {
            unpin();
          }
          assert.equal(cards.length, 1, "the Javelin posted no card");
          assert.deepInclude(cards[0].flags["azeroth-rpg"].strike, { form: "javelin", rangeKind: "thrown" });
          assert.include(labelsOf(cards[0]), "AZEROTH.Ability.Dex.Label", "a Javelin did not roll Dexterity");
        });
      } finally {
        await javelin.delete();
      }
    });

    it("REFUSES IN WORDS a way the weapon or the row has not got, at both doors, and rolls nothing (D-731's review)", async function () {
      this.timeout(120000);
      // No caller in `module/` forces a way any more - an Opportunity Attack only
      // prefers the hand - so this is the case that keeps both refusals reached.
      const javelin = await arm(rogue, "Javelin");
      let cards = [];
      try {
        const said = await noticesFrom("warn", async () => {
          cards = await cardsFrom(rogue, async () => {
            assert.isNull(await attackWithDialog(rogue, javelin, null, { mode: "hand" }), "a Javelin forced into the hand rolled");
          });
        });
        assert.deepEqual(said, [game.i18n.format("AZEROTH.Attack.NoWay.Hand", { name: javelin.name })],
          "the weapon door did not refuse the hand in words, or said something else too");
        assert.lengthOf(cards, 0, "a refused way posted a card");
      } finally {
        await javelin.delete().catch(() => {});
      }
      const headhunter = await makeNpc("Troll Headhunter");
      const index = headhunter.system.attacks.findIndex(a => a.name === "Barbed javelin");
      assert.isAtLeast(index, 0, "the Troll Headhunter no longer prints a Barbed javelin");
      const saidRow = await noticesFrom("warn", async () => {
        cards = await cardsFrom(headhunter, async () => {
          assert.isNull(await npcAttackWithDialog(headhunter, index, null, { mode: "hand" }), "a thrown-only row forced into the hand rolled");
        });
      });
      assert.deepEqual(saidRow, [game.i18n.format("AZEROTH.Attack.NoWay.Hand", { name: "Barbed javelin" })],
        "the creature door did not refuse the hand in words, or said something else too");
      assert.lengthOf(cards, 0, "a refused row posted a card");
    });

    it("a creature's Thrown row records the hand form at 5 ft and the thrown form at 20 ft, with no control", async function () {
      this.timeout(180000);
      const bandit = await makeNpc("Bandit");
      assert.equal(bandit.system.attacks[0]?.name, "Hand axe", "the Bandit's first row moved");
      const banditToken = await placeOn(bandit, 500, { y: 1000 });
      const victim = await makeCharacter({ name: "ZZ Thrown Victim", classes: [["Warrior", 1]] });
      const strikeAt = async feet => {
        const token = await placeOn(victim, 500 + feet * 20, { y: 1000, side: "friendly" });
        canvas.tokens.setTargets([token.id]);
        await until(() => game.user.targets.size === 1, "the victim to be targeted");
        const unpin = pinDie(15);
        try {
          const cards = await cardsFrom(bandit, () => npcAttackWithDialog(bandit, 0));
          assert.equal(cards.length, 1, `the Bandit's throw at ${feet} ft posted no card`);
          return cards[0].flags["azeroth-rpg"].strike;
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await token.delete().catch(() => {});
        }
      };
      try {
        const near = await strikeAt(5);
        assert.deepInclude(near, { form: "axe", rangeKind: "melee" }, "a hand axe swung in reach is recorded as thrown");
        const far = await strikeAt(20);
        assert.deepInclude(far, { form: "thrown-axe", rangeKind: "thrown" }, "a hand axe past reach is not recorded as thrown");
      } finally {
        await banditToken.delete().catch(() => {});
      }
    });
  });

  /* ---- D-732: between the nearest squares, never the centres ---------------- */

  describe("Reach beside a creature larger than a square (D-732)", function () {
    let priorSetting;
    let wasViewing = null;
    let square = null;
    let boss = null;

    /** A scene of one grid type, five feet a space, viewed and drawn. */
    async function boardOf(name, type) {
      const scene = await Scene.create({ name, width: 3000, height: 2000, grid: { type, size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, `${name} on the board`, 30000);
      return scene;
    }

    /** The square scene back on the board, where a case left another viewed. */
    async function onSquare() {
      if (canvas.scene?.id === square.id) return;
      await square.view();
      await until(() => canvas.ready && canvas.scene?.id === square.id, "the square scene back on the board", 30000);
    }

    /** A linked token for an actor at a pixel position, drawn. */
    async function standOn(scene, actor, x, y, side = "hostile") {
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await actor.getTokenDocument({
        x, y, disposition: CONST.TOKEN_DISPOSITIONS[side.toUpperCase()]
      })).toObject();
      const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
      // DRAWN, not merely placed: a centre exists as soon as the document does,
      // and core's target animation calls `_drawTargetArrows` on every targeted
      // token each tick - on a 3×3 token whose art is still loading that is
      // `undefined.clear()`, a page error that fails the run.
      await until(() => canvas.tokens.get(doc.id)?.targetArrows, `${actor.name}'s token drawn`, 20000);
      return doc;
    }

    /**
     * What CORE measures between the two centres - the rule this replaced. A case
     * asserts it first, so it can only pass where the two rules disagree.
     */
    const centres = (a, b) => canvas.grid.measurePath([canvas.tokens.get(a.id).center, canvas.tokens.get(b.id).center]).distance;
    const labelsOf = card => card.rolls[0].options.provenance.map(p => p.label);
    const circumstanceOf = card => card.rolls[0].options.provenance.find(p => p.label === "AZEROTH.Dialog.Circumstance")?.formula ?? "";

    before(async function () {
      this.timeout(180000);
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      square = await boardOf("ZZ Footprint Square", CONST.GRID_TYPES.SQUARE);
      // A Huge boss: 14's size, and a 3×3 token by the convention D-637 records.
      boss = await makeNpc("Archaedas");
      assert.equal(boss.system.size, "huge", "Archaedas is no longer Huge");
      assert.equal(boss.prototypeToken.width, 3, "Archaedas' token is no longer 3×3, so nothing here tells the two rules apart");
    });
    after(async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      canvas?.tokens?.setTargets?.([]);
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ") && game.scenes.has(wasViewing.id)) await wasViewing.view().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("a Dagger against a 3×3 creature's edge is FIVE feet away and struck in the hand, where the centres are ten apart", async function () {
      this.timeout(180000);
      await onSquare();
      const rogue = await makeCharacter({ name: "ZZ Footprint Rogue", classes: [["Rogue", 1]], abilities: { str: 16, dex: 10 } });
      const dagger = await arm(rogue, "Dagger");
      // The rogue in column 5, row 5; Archaedas across columns 6 to 8, rows 4 to 6.
      const mine = await standOn(square, rogue, 500, 500, "friendly");
      const theirs = await standOn(square, boss, 600, 400);
      canvas.tokens.releaseAll();
      canvas.tokens.setTargets([theirs.id]);
      await until(() => game.user.targets.size === 1, "Archaedas to be targeted");
      try {
        assert.equal(centres(mine, theirs), 10, "the centres are not ten feet apart, so this case cannot tell the rules apart");
        assert.equal(distanceBetween(rogue, boss), 5, "a rogue against Archaedas' edge is not five feet from it (05 §Size)");
        assert.include(enemyDistances(rogue), 5, "the rogue is not Engaged with the boss it stands against");
        const unpin = pinDie(15);
        let cards;
        try {
          cards = await cardsFrom(rogue, () => attackWithDialog(rogue, dagger));
        } finally {
          unpin();
        }
        assert.equal(cards.length, 1, "the stab posted no card");
        const card = cards[0];
        assert.include(labelsOf(card), "AZEROTH.Ability.Str.Label", "a stab at the boss beside it did not roll Strength");
        assert.notInclude(labelsOf(card), "AZEROTH.Ability.Dex.Label", "a Dagger against a Huge creature opened as a throw");
        assert.deepInclude(card.flags["azeroth-rpg"].strike, { form: "dagger", rangeKind: "melee" });
        assert.notInclude(card.content, game.i18n.localize("AZEROTH.Modifier.OutOfReach"),
          "a blow at the creature it stands against was said to be out of reach");
      } finally {
        canvas.tokens.setTargets([]);
        await mine.delete().catch(() => {});
        await theirs.delete().catch(() => {});
      }
    });

    it("a caster standing against it is Engaged, and the Casting Test takes 06 §5's Bane in its own words", async function () {
      this.timeout(180000);
      await onSquare();
      const mage = await makeCharacter({ name: "ZZ Footprint Mage", classes: [["Mage", 1]], spells: ["Frostbolt"] });
      const spell = mage.items.find(i => i.type === "spell" && i.name === "Frostbolt");
      assert.ok(spell, "the Mage holds no Frostbolt");
      const pool = mage.system.powers.find(p => p.name === "mana");
      assert.ok(pool, "the Mage holds no Mana pool");
      await mage.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      await until(() => mage.system.powers.find(p => p.name === "mana").value === pool.max, "the Mana filled");
      // Column 5, row 5: against the middle of Archaedas' left side, square on,
      // so no figure here turns on the world's diagonal rule.
      const mine = await standOn(square, mage, 500, 500, "friendly");
      const theirs = await standOn(square, boss, 600, 400);
      canvas.tokens.releaseAll();
      canvas.tokens.setTargets([theirs.id]);
      await until(() => game.user.targets.size === 1, "Archaedas to be targeted");
      try {
        assert.equal(centres(mine, theirs), 10, "the centres are not ten feet apart, so this case cannot tell the rules apart");
        assert.deepEqual(enemyDistances(mage), [5], "the caster is not five feet from the boss it stands against");
        const unpin = pinDie(15);
        let card;
        try {
          card = await castWithDialog(mage, spell);
        } finally {
          unpin();
        }
        assert.ok(card, "the Frostbolt posted no card");
        made.push(card);
        const roll = card.rolls[0];
        assert.isAtLeast(roll.options.banes ?? 0, 1, "a Casting Test made while Engaged took no Bane (06 §5)");
        assert.include(circumstanceOf(card), game.i18n.localize("AZEROTH.Modifier.EngagedCasting"),
          "the card does not say the caster was Engaged");
        assert.notInclude(circumstanceOf(card), game.i18n.localize("AZEROTH.Modifier.EngagedRanged"),
          "a Casting Test was said to be an attack at range");
      } finally {
        canvas.tokens.setTargets([]);
        await mine.delete().catch(() => {});
        await theirs.delete().catch(() => {});
      }
    });

    it("on a HEX grid, measures between the nearest hexes two tokens occupy", async function () {
      this.timeout(180000);
      const hex = await boardOf("ZZ Footprint Hex", CONST.GRID_TYPES.HEXODDR);
      const rogue = await makeCharacter({ name: "ZZ Footprint Hex Rogue", classes: [["Rogue", 1]] });
      const theirs = await standOn(hex, boss, 900, 700);
      // A hex beside one Archaedas covers, and not one it covers: core's own
      // offsets for both, so nothing about a hex's shape is assumed here.
      const covered = theirs.getOccupiedGridSpaceOffsets().map(({ i, j }) => `${i},${j}`);
      assert.isAbove(covered.length, 1, "Archaedas covers one hex, so this proves nothing");
      let beside = null;
      for (const key of covered) {
        const [i, j] = key.split(",").map(Number);
        beside = canvas.grid.getAdjacentOffsets({ i, j }).find(o => !covered.includes(`${o.i},${o.j}`)) ?? null;
        if (beside) break;
      }
      assert.ok(beside, "no hex beside Archaedas");
      const at = canvas.grid.getTopLeftPoint(beside);
      const mine = await standOn(hex, rogue, at.x, at.y, "friendly");
      try {
        assert.deepEqual(mine.getOccupiedGridSpaceOffsets().map(({ i, j }) => `${i},${j}`), [`${beside.i},${beside.j}`],
          "the rogue did not land on the hex beside Archaedas");
        assert.isAbove(centres(mine, theirs), 5, "the centres are five feet apart, so this case cannot tell the rules apart");
        assert.equal(distanceBetween(rogue, boss), 5, "a rogue on the hex beside Archaedas is not five feet from it");
      } finally {
        await mine.delete().catch(() => {});
        await theirs.delete().catch(() => {});
      }
    });

    it("on a GRIDLESS scene, shrinks both boxes by half a grid unit and measures the nearest two points in a straight line", async function () {
      this.timeout(180000);
      const open = await boardOf("ZZ Footprint Gridless", CONST.GRID_TYPES.GRIDLESS);
      const rogue = await makeCharacter({ name: "ZZ Footprint Open Rogue", classes: [["Rogue", 1]] });
      const theirs = await standOn(open, boss, 600, 400);
      // Against the middle of its left edge, and then against its corner.
      const mine = await standOn(open, rogue, 500, 500, "friendly");
      try {
        assert.equal(centres(mine, theirs), 10, "the centres are not ten feet apart, so this case cannot tell the rules apart");
        assert.equal(distanceBetween(rogue, boss), 5, "a rogue against Archaedas' edge on a gridless scene is not five feet from it");
        await mine.update({ x: 500, y: 300 });
        await until(() => mine.x === 500 && mine.y === 300, "the rogue at the corner");
        await settle();
        // One unit across and one down: a diagonal, in a straight line.
        assert.closeTo(distanceBetween(rogue, boss), Math.SQRT2 * 5, 0.01, "the corner is not one diagonal unit away");
      } finally {
        await mine.delete().catch(() => {});
        await theirs.delete().catch(() => {});
      }
    });

    it("counts no DEAD creature and no NEUTRAL one as an enemy: a caster beside both is not Engaged (D-732's review)", async function () {
      this.timeout(180000);
      await onSquare();
      const mage = await makeCharacter({ name: "ZZ Footprint Healer", classes: [["Mage", 1]], spells: ["Frostbolt"] });
      const spell = mage.items.find(i => i.type === "spell" && i.name === "Frostbolt");
      const pool = mage.system.powers.find(p => p.name === "mana");
      await mage.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      await until(() => mage.system.powers.find(p => p.name === "mana").value === pool.max, "the Mana filled");
      // Dead BEFORE it has a token: a Health change on a placed token draws
      // core's scrolling text, and deleting the token while it animates is a
      // page error inside PIXI that fails the run.
      const fallen = await makeNpc("Kobold");
      await fallen.update({ "system.health.value": 0 });
      await until(() => fallen.system.health.value === 0, "the creature at 0 Health");
      const merchant = await makeNpc("Kobold");
      const standing = await makeNpc("Kobold");
      // The caster in column 15: a dead hostile to its right, a neutral one to
      // its left, and a living hostile above it to show what an enemy measures.
      const mine = await standOn(square, mage, 1500, 1000, "friendly");
      const dead = await standOn(square, fallen, 1600, 1000, "hostile");
      const neutral = await standOn(square, merchant, 1400, 1000, "neutral");
      const living = await standOn(square, standing, 1500, 900, "hostile");
      try {
        assert.deepEqual(enemyDistances(mage), [5], "the living hostile above the caster is not its only enemy");
        await living.delete();
        await until(() => !canvas.tokens.get(living.id), "the living hostile gone");
        assert.deepEqual(enemyDistances(mage), [], "a dead creature or a neutral one counted as an enemy");
        const unpin = pinDie(15);
        let card;
        try {
          card = await castWithDialog(mage, spell);
        } finally {
          unpin();
        }
        assert.ok(card, "the Frostbolt posted no card");
        made.push(card);
        assert.equal(card.rolls[0].options.banes ?? 0, 0, "a caster beside the dead and the neutral took the Engaged Bane");
        assert.notInclude(circumstanceOf(card), game.i18n.localize("AZEROTH.Modifier.EngagedCasting"),
          "the card says the caster was Engaged beside nobody who could engage it");
      } finally {
        for (const doc of [mine, dead, neutral, living]) await doc.delete().catch(() => {});
      }
    });
  });
}
