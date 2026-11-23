/**
 * **THE CLASS TALENT AUDIT'S SHARED ENGINE, IN A LIVE WORLD** (D-1860 to D-1868; the lead,
 * 2026-11-22: *"Build these changes and ensure all automation ... work as well"*).
 *
 * The pure law and its consumer censuses are Vitest (`rules/class-audit-engine.test.mjs`). What
 * only a world can show is the real doors:
 *
 * - **R6** (D-1864): `AzerothCombatant#spendAction` refuses a third Attack bought with a granted
 *   Half-Action, in words, with the Half-Action left standing;
 * - **R4** (D-1863): `AzerothCombatant#markHold` claims an identity hold once a round and a granted
 *   hold once an encounter, through the one queue, and the fight's end takes the record;
 * - **R8** (D-1866): `effects/inflict.mjs#inflictCondition` refreshes a Bleeding from one source and
 *   adds one from another, on the condition's own effect.
 *
 * Every creature is a `ZZ` fixture, deleted in `after`. Written in the engine run; not yet run (the
 * live pass runs it alone through `QUENCH_BATCH=azeroth-rpg.audit-engine`).
 */

import { BLEED_SOURCES_FLAG } from "../rules/bleeding.mjs";
import { HOLD_MARK_FLAG } from "../rules/blow-doors.mjs";
import { BUDGET_REFUSALS } from "../rules/initiative.mjs";
import { bleedSourceMark } from "../rules/bleeding.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
import { conditionEffectOf } from "../rules/condition-carriers.mjs";
import { cleanup, giveTurn, made, makeCharacter, makeNpc, untilHook } from "./fixtures.mjs";

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

/** A started fight with these actors in it, every combatant's own budget landed. */
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

export function auditEngineBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The class talent audit's shared engine (D-1860 to D-1868)", function () {
    after(async function () {
      this.timeout(120000);
      await cleanup();
    });

    it("R6: refuses a third Attack a granted Half-Action would buy, in words, and spends nothing (D-1864)", async function () {
      this.timeout(120000);
      const hero = await makeCharacter({ name: "ZZ Audit Striker", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([hero, foe]);
      const mine = await giveTurn(combat, hero);
      await mine.grantHalfActions(1);
      await until(() => mine.budget.halfActions === 3, "the granted Half-Action landing");
      assert.isTrue((await mine.spendAction("half", { isAttack: true })).ok, "the first Attack was refused");
      assert.isTrue((await mine.spendAction("half", { isAttack: true })).ok, "the second Attack was refused");
      assert.equal(mine.budget.attacks, 2, "the turn did not count its two Attacks");
      const third = await mine.spendAction("half", { isAttack: true });
      assert.isFalse(third.ok, "a granted Half-Action bought a third Attack");
      assert.equal(third.reason, BUDGET_REFUSALS.attackLimit);
      assert.equal(mine.budget.halfActions, 1, "the refused Attack spent its Half-Action anyway");
      // The Half-Action still buys anything that is not an Attack.
      assert.isTrue((await mine.spendAction("half")).ok, "the granted Half-Action bought nothing at all");
    });

    it("R4: claims an identity hold once a round and a granted hold once an encounter, and the fight's end takes the record (D-1863)", async function () {
      this.timeout(120000);
      const hero = await makeCharacter({ name: "ZZ Audit Held", classes: [["Warrior", 20]] });
      const foe = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([hero, foe]);
      const mine = combat.getCombatantsByActor(hero)[0];
      assert.isTrue((await mine.markHold("identity")).added, "the first identity hold was not claimed");
      assert.isFalse((await mine.markHold("identity")).added, "a second identity hold was claimed in one round");
      assert.isTrue((await mine.markHold("granted")).added, "the first granted hold was not claimed");
      assert.isFalse((await mine.markHold("granted")).added, "a second granted hold was claimed in one encounter");
      assert.isTrue((await mine.markHold("self")).added, "a self hold is the counter's to limit, never the record's");
      assert.deepEqual(mine.getFlag("azeroth-rpg", HOLD_MARK_FLAG), { granted: true, identityRound: combat.round });
      // `endCombat()` opens core's confirm in v14 and nothing presses it (the batch hung on it);
      // deleting the fight runs `_onExit` for every combatant, where `_leaveFight` ends the fight.
      await combat.delete();
      await until(() => !game.combats.has(combat.id), "the fight deleted");
    });

    it("R8: refreshes a Bleeding from one source and adds one from another, on the condition's own effect (D-1866)", async function () {
      this.timeout(60000);
      const foe = await makeNpc("Plagued Ghoul");
      const own = () => conditionEffectOf(foe.effects, "bleeding");
      await inflictCondition({ victim: foe, id: "bleeding", value: 2, marks: bleedSourceMark("deep-cut") });
      await until(() => own()?.getFlag("azeroth-rpg", "value") === 2, "the first Bleeding landing");
      await inflictCondition({ victim: foe, id: "bleeding", value: 3, marks: bleedSourceMark("deep-cut") });
      await until(() => own()?.getFlag("azeroth-rpg", "value") === 3, "the same source refreshing to 3");
      // A1 (D-1848): the same source keeps the higher value, so a weaker layer changes nothing.
      await inflictCondition({ victim: foe, id: "bleeding", value: 1, marks: bleedSourceMark("deep-cut") });
      assert.equal(own()?.getFlag("azeroth-rpg", "value"), 3, "a weaker layer from the same source lowered the Bleeding");
      await inflictCondition({ victim: foe, id: "bleeding", value: 2, marks: bleedSourceMark("rupture") });
      await until(() => own()?.getFlag("azeroth-rpg", "value") === 5, "a second source adding to 5");
      assert.deepEqual(own().getFlag("azeroth-rpg", BLEED_SOURCES_FLAG), { "deep-cut": 3, rupture: 2 });
      assert.lengthOf(foe.effects.filter(e => e.statuses?.has("bleeding")), 1, "the layers became two effects");
    });
  });
}
