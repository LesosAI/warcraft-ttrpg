/**
 * **THE CHRONOMANCER'S EIGHT FEATURES, THROUGH THE REAL DOORS** (02 §7; stage 2b), in a live
 * world, each Use pressed from the sheet's own control:
 *
 * - Timeless Mind's second Proficiency row on a Spirit Resilience Test, and none on Body;
 * - Another Timeline asked in a creature's Attack Test, answered, paid, and the Test rolled again;
 * - Slipstream's Half-Action laid on an ally and given at its turn, refused on the user;
 * - Recall's mark, the damage counted since, and the return that heals it and moves the token;
 * - Turn the Glass's Sand, the tier, through the Hourglass's cap;
 * - Suspend on a willing ally: Stunned, immune to damage, its effects one round longer;
 * - Recurrence: a tier 1 spell's damage landing again at the caster's next turn start;
 * - Master of Hours: 3, 4 and 5 Half-Actions, three 2-Sand gifts reaching 8, any other gain stopping at 6;
 * - 07 §4's rest gate shutting a tier 4 spell until a Short Rest.
 *
 * WRITTEN, NOT RUN in stage 2b (the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chronomancer-features`. Every document a test makes is deleted in
 * `after`.
 */

import { cleanup, drainAreaWork, give, made, makeCharacter, makeNpc, pinDie, settle, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { HASTENED_FLAG } from "../rules/chromatic-talents.mjs";
import { MASTER_FLAG, RECALL_FLAG, SUSPEND_FLAG } from "../rules/chronomancer.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";
import {
  answerAsk, chronomancerWith, featureNamed, fightWith, parsed, pressUse, sandOf, sceneWith, tokenOf, turnForward, until
} from "./quench-chronomancer-common.mjs";

export function chronomancerFeaturesBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The Chronomancer's eight features (02 §7; stage 2b)", function () {
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("TIMELESS MIND counts the Proficiency twice on a Spirit Resilience Test, and once on Body", async function () {
      this.timeout(120000);
      const c = await chronomancerWith("ZZ CF Timeless", { level: 1 });
      const prof = c.system.proficiency;
      const spirit = game.system.azeroth.workflows.resilienceModifiers(c, "spirit");
      assert.deepEqual(spirit.slice(1).map(r => r.value), [prof, prof], "a second Proficiency row on Spirit");
      assert.equal(spirit.at(-1).label, "AZEROTH.Chrono.TimelessMindRow");
      const body = game.system.azeroth.workflows.resilienceModifiers(c, "body");
      assert.isFalse(body.some(r => r.label === "AZEROTH.Chrono.TimelessMindRow"), "nothing on Body");
    });

    it("ANOTHER TIMELINE is asked in an enemy's Attack Test, costs 2 Mana and the Reaction, and the Test is rolled again", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Timeline", { level: 1 });
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: bandit, x: 1000, y: 1000, side: "hostile" }]);
      await fightWith([c, bandit]);
      const before = c.poolSnapshot().find(p => p.name === "mana").value;
      const roll = game.system.azeroth.AzerothRoll.build({ dc: 10, kind: "attack", modifiers: [], rollData: {} });
      const unpin = pinDie(3);
      try { await roll.evaluate(); } finally { unpin(); }
      const asked = bandit.offerElunesRegard(roll);
      await answerAsk(true);
      await asked;
      assert.ok(roll.options.anotherTimeline, "the Test was rolled again");
      await until(() => c.poolSnapshot().find(p => p.name === "mana").value === before - 2, "2 Mana spent");
      const mine = game.combat.getCombatantsByActor(c)[0];
      assert.equal(mine.budget.reactions, 0, "the Reaction spent");
      const said = await warnings(async () => { await game.system.azeroth.workflows.useFeature({ actor: c, item: featureNamed(c, "Another Timeline") }); });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Chrono.AskedInTest", { name: "Another Timeline" }), "the sheet's Use says where it is offered");
    });

    it("ANOTHER TIMELINE is reached by a real Attack Test through the roll workflow, and its card carries both results", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Timeline Real", { level: 1 });
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: bandit, x: 1000, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, bandit]);
      const before = c.poolSnapshot().find(p => p.name === "mana").value;
      // The seam is not called by hand here: `rollTest` evaluates the roll and reaches
      // `offerElunesRegard`, which asks the Chronomancer within 30 feet.
      const unpin = pinDie(3);
      let card = null;
      try {
        const rolled = game.system.azeroth.workflows.rollTest({
          actor: bandit, kind: "attack", dc: 10, title: "ZZ Timeline attack", modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 2 }]
        });
        await answerAsk(true);
        card = await rolled;
      } finally { unpin(); }
      assert.ok(card, "the attack's card");
      made.push(card);
      const timeline = card.rolls[0].options.anotherTimeline;
      assert.ok(timeline, "the card's roll was rolled again");
      assert.equal(timeline.by, c.uuid, "by the Chronomancer");
      assert.lengthOf(timeline.totals, 2, "both results recorded");
      assert.equal(timeline.totals[0], 5, "the first result was the pinned 3 + 2");
      await until(() => c.poolSnapshot().find(p => p.name === "mana").value === before - 2, "2 Mana spent");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.reactions, 0, "the Reaction spent");
    });

    it("SLIPSTREAM gives an ally a Half-Action on its next turn, refuses the user, and is once an encounter", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Slip", { level: 5 });
      const ally = await makeCharacter({ name: "ZZ CF Slip Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const combat = await fightWith([c, ally]);
      await turnForward(combat, c);
      const self = await warnings(async () => { const { card } = await pressUse(c, "Slipstream", [tokenOf(c)]); assert.isNull(await card); });
      // The range door's own words now (O-293, D-893): *One ally other than you* refuses the
      // user before the feature's door is reached, with nothing spent.
      assert.include(self.join(" "), game.i18n.format("AZEROTH.Range.NotSelf", { name: "Slipstream" }));
      const { card } = await pressUse(c, "Slipstream", [tokenOf(ally)]);
      assert.ok(await card, "the Slipstream card");
      await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Slipstream"), "the Half-Action laid");
      await turnForward(combat, ally);
      const theirs = combat.getCombatantsByActor(ally)[0];
      await until(() => theirs.budget.halfActions === 3, "three Half-Actions on its turn");
      await until(() => featureNamed(c, "Slipstream").system.uses.value === 0, "the use struck");
    });

    it("RECALL marks the space, counts the damage since, and returns the Chronomancer healed by it", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Recall", { level: 9, abilities: { int: 18, con: 14 } });
      await sceneWith([{ actor: c, x: 800, y: 1000 }]);
      const markCard = await (await pressUse(c, "Recall")).card;
      assert.ok(markCard, "the mark's card");
      const mark = await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG), "the mark");
      await tokenOf(c).document.update({ x: 1400, y: 1000 }, { action: "displace" });
      await until(() => tokenOf(c).document.x === 1400, "the token moved off");
      const health = c.system.health.value;
      await c.applyDamage(5, { struck: true, attack: false });
      await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG)?.taken === 5, "the 5 counted on the mark");
      const usesBefore = featureNamed(c, "Recall").system.uses.value;
      const back = await (await pressUse(c, "Recall")).card;
      assert.ok(back, "the return's card");
      await until(() => tokenOf(c).document.x === mark.x, "back on the mark");
      await until(() => c.system.health.value === health, "the 5 regained");
      assert.equal(featureNamed(c, "Recall").system.uses.value, usesBefore, "the return strikes no use");
      assert.isUndefined(c.getFlag("azeroth-rpg", RECALL_FLAG) ?? undefined, "the mark is spent");
      assert.ok(back.flags["azeroth-rpg"].steps?.length, "the card records the step for the animation layer");
    });

    it("TURN THE GLASS gains Sand equal to the tier, to the Hourglass's cap", async function () {
      this.timeout(120000);
      const c = await chronomancerWith("ZZ CF Glass", { level: 11 });
      await sceneWith([{ actor: c, x: 800, y: 1000 }]);
      assert.equal(sandOf(c).value, 0);
      await (await pressUse(c, "Turn the Glass")).card;
      await until(() => sandOf(c).value === c.system.tier, "Sand equal to the tier");
    });

    it("SUSPEND holds a willing ally out of time: Stunned, immune to damage, its effects one round longer", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Suspend", { level: 14 });
      const ally = await makeCharacter({ name: "ZZ CF Suspended", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const combat = await fightWith([c, ally]);
      await turnForward(combat, c);
      const [timed] = await ally.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ timed", duration: { value: 3, units: "rounds" } }]);
      await (await pressUse(c, "Suspend", [tokenOf(ally)])).card;
      await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", SUSPEND_FLAG)), "the hold laid");
      assert.isTrue(ally.statuses.has("stunned"), "Stunned");
      assert.equal(ally.effects.get(timed.id).duration.value, 4, "its effect does not count down");
      const health = ally.system.health.value;
      await ally.applyDamage(8, { struck: true, attack: true });
      assert.equal(ally.system.health.value, health, "immune to damage");
    });

    it("RECURRENCE lands a tier 1 spell's damage again at the caster's next turn start", async function () {
      this.timeout(300000);
      // **A HALF-ACTION SPELL** (the live fix): 02 §7's Recurrence is *the next spell ... you
      // cast this turn*, and its own Half-Action leaves one, so Sand Blast (an Action) could never
      // follow it in the same turn and `castSpell` refused it. Grit Lash is tier 1, a Half-Action,
      // and deals 4 Physical.
      const c = await chronomancerWith("ZZ CF Recur", { level: 17, spells: ["Grit Lash"] });
      const bandit = await makeNpc("Bandit");
      await bandit.update({ "system.health.value": 200, "system.health.max": 200, "system.ap.body": 0 });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, bandit]);
      await turnForward(combat, c);
      await (await pressUse(c, "Recurrence")).card;
      await until(() => c.getFlag("azeroth-rpg", "recurrence"), "Recurrence armed");
      const spell = c.items.find(i => i.type === "spell" && i.name === "Grit Lash");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.halfActions, 1, "Recurrence's Half-Action spent, one left for the spell");
      canvas.tokens.setTargets([tokenOf(bandit).id]);
      const targets = targetSnapshots();
      canvas.tokens.setTargets([]);
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(19);
      let card = null;
      try { card = await game.system.azeroth.workflows.castSpell({ actor: c, spell, dc: 5, targets }); } finally { unpin(); await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); }
      if (card) made.push(card);
      assert.ok(card, "Grit Lash's card on the turn Recurrence was used");
      assert.ok(card.flags["azeroth-rpg"].chronoAgain?.recurrence, "the card records what lands again");
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applyDamage"][data-target-index="0"]');
      await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id));
      const once = bandit.system.health.value;
      assert.isBelow(once, 200, "the blow landed");
      await until(() => (c.getFlag("azeroth-rpg", "landsAgain") ?? []).length === 1, "recorded on the caster");
      await turnForward(combat, bandit);
      await turnForward(combat, c);
      await until(() => bandit.system.health.value === once - (200 - once), "the same damage landed again");
    });

    it("MASTER OF HOURS gives 3, 4 and 5 Half-Actions, its 2-Sand gifts land next turn past 6, other gains stop at 6 (D-877)", async function () {
      this.timeout(360000);
      const c = await chronomancerWith("ZZ CF Master", { level: 20, sand: 8 });
      const ally = await makeCharacter({ name: "ZZ CF Master Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const combat = await fightWith([c, ally]);
      await turnForward(combat, c);
      await (await pressUse(c, "Master of Hours")).card;
      await until(() => c.effects.find(e => e.getFlag("azeroth-rpg", MASTER_FLAG)), "Master of Hours running");
      const mine = combat.getCombatantsByActor(c)[0];
      const seen = [];
      for (let i = 0; i < 3; i++) {
        await turnForward(combat, ally);
        await turnForward(combat, c);
        const want = [3, 4, 8][i];
        await until(() => mine.budget.halfActions >= want, `${want} Half-Actions`);
        seen.push(mine.budget.halfActions);
        if (i === 1) {
          // Three gifts to the Chronomancer on its second turn (6 of the Epic glass's 8 Sand) land
          // on its third: 5 + 3 = 8. The lead: *"the eight half actions a turn is fine because of
          // the resource spend."* (D-877).
          for (let g = 1; g <= 3; g++) {
            await (await pressUse(c, "Master of Hours", [tokenOf(c)])).card;
            await until(() => (c.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Master of Hours")
              ?.getFlag("azeroth-rpg", HASTENED_FLAG)?.halves ?? 0) >= g, `gift ${g} laid`);
          }
          assert.isTrue(c.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Master of Hours")
            .getFlag("azeroth-rpg", HASTENED_FLAG).uncapped, "the gift's record is uncapped");
        }
      }
      assert.deepEqual(seen, [3, 4, 8], "3, 4, then 5 and the three gifts");
      await until(() => !c.effects.find(e => e.getFlag("azeroth-rpg", MASTER_FLAG)), "it ended after the third");
      await mine.grantHalfActions(3);
      assert.equal(mine.budget.halfActions, 8, "a capped gain adds nothing past 6 and takes nothing away");
      const theirs = combat.getCombatantsByActor(ally)[0];
      await theirs.grantHalfActions(9);
      await until(() => theirs.budget.halfActions === 6, "any other gain stops at 6");
    });

    it("07 §4: a tier 4 spell is shut until a Short Rest", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CF Gate", { level: 20, spells: ["Epoch"] });
      const bandit = await makeNpc("Bandit");
      await bandit.update({ "system.health.value": 200, "system.health.max": 200 });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      const spell = c.items.find(i => i.type === "spell" && i.name === "Epoch");
      const cast = async () => {
        canvas.tokens.setTargets([tokenOf(bandit).id]);
        const targets = targetSnapshots();
        canvas.tokens.setTargets([]);
        const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
        const unpin = pinDie(19);
        try { return await game.system.azeroth.workflows.castSpell({ actor: c, spell, dc: 5, targets }); } finally { unpin(); await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); }
      };
      const first = await cast();
      assert.ok(first, "the first casting");
      made.push(first);
      // 07 §4's ONE record (D-882): the cast's use, written with its turn budget on the GM.
      await until(() => c.getFlag("azeroth-rpg", SPELL_USES_FLAG)?.epoch?.spent === 1, "Epoch's use recorded");
      assert.equal(c.getFlag("azeroth-rpg", SPELL_USES_FLAG).epoch.per, "short");
      const mana = c.poolSnapshot().find(p => p.name === "mana")?.value;
      let second = null;
      const said = await warnings(async () => { second = await cast(); });
      assert.isNull(second, "the second casting refused");
      assert.include(said.join(" "), game.i18n.format("AZEROTH.SpellLimit.Exhausted", { name: "Epoch", rest: game.i18n.localize("AZEROTH.SpellLimit.short") }));
      assert.equal(c.poolSnapshot().find(p => p.name === "mana")?.value, mana, "the refused casting spent Mana");
      // A Short Rest takes food or drink (05 §16, D-733): with neither the door refuses the rest.
      await c.shortRest({ food: await give(c, "Bread and cheese") });
      await until(() => c.getFlag("azeroth-rpg", SPELL_USES_FLAG)?.epoch?.spent === 0, "the Short Rest opened it");
      await settle();
    });
  });
}
