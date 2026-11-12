/**
 * **THE LEAD'S CHRONOMANCER PLAY-TEST, THROUGH THE REAL CONTROLS** (2026-11-10; D-887 to D-890).
 * The lead's words: *"Recall does not place a region or marker on the map for the recall
 * location. We don't need to automate the token movement on use of this as a reaction but the
 * health should be automated."*, *"Spending sand on Grit of Ages did not give SL +1"*, *"damage
 * button did not apply damage if the token was moved via failing the body test"*, *"Recurrence
 * did not trigger on the start of the player's next turn."*
 *
 * The batches before drove the doors by direct calls; every fault here sat BETWEEN doors. So
 * each test plays the table's way, in a started fight with tokens on a viewed scene: the
 * sheet's Cast and Use, the roll dialog's own line, the card's buttons as drawn in the chat
 * log, the combat tracker's Next Turn - and reads the RESULT: Health, tokens, Regions, cards.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.chronomancer-playtest`. Every document a test makes
 * is deleted in `after`.
 */

import { cleanup, drainAreaWork, made, settle, warnings } from "./fixtures.mjs";
import { AGAIN_FLAG, RECALL_FLAG, RECALL_MARKER_FLAG, RECURRENCE_FLAG } from "../rules/chronomancer.mjs";
import { recallMarkerOf } from "../canvas/recall-marker.mjs";
import { requestAttackApply } from "../effects/attack-resolution-apply.mjs";
import {
  answerAskIfAny, cardButton, castFromSheet, chronoInFight, chronomancerWith, featureNamed, freshTurn, nextTurnUntil, pressCard, pressUse,
  sandOf, textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";

const APPLY = 'button[data-action="applyDamage"][data-target-index="0"]';
const live = message => game.messages.get(message.id);
const markersOf = (scene, actor) => [...(scene?.regions ?? [])].filter(r => r.flags?.["azeroth-rpg"]?.[RECALL_MARKER_FLAG]?.actor === actor.uuid);
const combatantOfToken = (combat, doc) => combat.combatants.find(x => x.tokenId === doc.id);

export function chronomancerPlaytestBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The lead's Chronomancer play-test, through the real controls (D-887 to D-890)", function () {
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("GRIT OF AGES: the dialog's SL line raises the card's SL on a success; on a failure the card says the Sand bought no SL (D-887)", async function () {
      this.timeout(300000);
      const { c, foes } = await chronoInFight("ZZ PT Grit", { level: 5, spells: ["Grit Lash"], ranks: { "Grit of Ages": 1 }, sand: 4, enemies: [{ name: "Raptor", x: 1300, y: 1000, health: 200 }] });
      const raptor = foes[0];
      await freshTurn(c, 2);
      const sand0 = sandOf(c).value;
      assert.isAtLeast(sand0, 4, "the Sand to spend");
      // A success (natural 20): the Test's own SL and one more, on the card and in its flag.
      const won = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 20, lines: ["grit-sl1"] });
      assert.ok(won, "the cast posted no card");
      const wf = won.flags["azeroth-rpg"];
      const testSl = won.rolls[0].outcome.sl;
      assert.isTrue(wf.success, "the natural 20 failed");
      assert.equal(wf.sl, Math.min(6, testSl + 1), "the card's SL is not the Test's raised by 1");
      assert.include(textOf(won), game.i18n.format("AZEROTH.Grit.SlRaised", { n: wf.sl - testSl, sand: 2, from: testSl, to: wf.sl }));
      // The 2 spent, net of what the same cast's card says it gained (02 §7's Sand on a cast).
      const gainedOn = card => (card.rolls[0].options.provenance ?? []).reduce((n, p) => n + (Number(/(\d+) Sand gained/.exec(String(p.formula ?? ""))?.[1]) || 0), 0);
      const sand1 = sand0 - 2 + gainedOn(won);
      await until(() => sandOf(c).value === sand1, `2 Sand spent on the success (${sand0} less 2, plus ${gainedOn(won)} gained)`);
      // The lead's case: a near miss. The Sand is spent before the roll, the Test fails on its
      // total, and the card says it bought no SL and what SL it carries.
      const lost = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 2, lines: ["grit-sl1"] });
      assert.ok(lost, "the failed cast posted no card");
      const lf = lost.flags["azeroth-rpg"];
      assert.isFalse(lf.success, "a face of 2 succeeded");
      assert.equal(lf.sl, lost.rolls[0].outcome.sl, "a failed Test's SL moved");
      assert.include(textOf(lost), game.i18n.format("AZEROTH.Grit.SlFailed", { sand: 2, sl: lf.sl }));
      assert.notInclude(textOf(lost), "more SL, 2 Sand spent", "the failed card still claims an SL it did not give");
      await until(() => sandOf(c).value === sand1 - 2 + gainedOn(lost), "2 Sand spent on the failure too");
    });

    it("APPLY AFTER THE PULL: Grit Lash's failed Body Test pulls the Raptor, and the card's Apply then lands, greys and names it (D-888)", async function () {
      this.timeout(300000);
      const { c, foes } = await chronoInFight("ZZ PT Pull", { level: 5, spells: ["Grit Lash"], enemies: [{ name: "Raptor", x: 1300, y: 1000, health: 40 }] });
      const raptor = foes[0];
      await freshTurn(c, 1);
      const card = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 18 });
      assert.ok(card, "the cast posted no card");
      assert.isTrue(card.flags["azeroth-rpg"].success, "the cast failed");
      const dmg = card.flags["azeroth-rpg"].damageByTarget[0].damage;
      assert.isAbove(dmg, 0, "the card deals nothing");
      const name = card.flags["azeroth-rpg"].targets[0].name;
      const x0 = raptor.doc.x;
      // The Raptor's Body Test on the card's own Resist, failed on a natural 1; the
      // Chronomancer's Another Timeline is asked in it and declined.
      const resist = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
      try {
        await answerAskIfAny(false, 6000);
        await until(() => Object.values(live(card).flags["azeroth-rpg"].resists ?? {}).some(r => r.success === false), "the failed Test recorded", 30000);
      } finally { await resist.release(); }
      await until(() => raptor.doc.x === x0 - 200, "the Raptor pulled 10 ft toward the caster", 30000);
      const hp = raptor.actor.system.health.value;
      // O-285: the press-to-Health time, printed to the run's progress file (the first
      // Apply of the page, which paid for the damage path's dynamic imports before they
      // were warmed at `ready`).
      const pressedAt = performance.now();
      const apply = await pressCard(card, APPLY);
      await apply.release();
      await until(() => raptor.actor.system.health.value === hp - dmg, `the ${dmg} landed after the pull`, 60000);
      console.log(`[quench-progress] O-285 apply-ms ${Math.round(performance.now() - pressedAt)}`);
      // The card says so, and a player cannot press it twice.
      const drawn = await until(() => (cardButton(card, APPLY)?.disabled ? cardButton(card, APPLY) : null), "the Apply greyed once applied");
      assert.equal(drawn.textContent.trim(), game.i18n.format("AZEROTH.Card.AppliedTo", { name, n: dmg }));
      const said = await warnings(async () => { await requestAttackApply(live(card), 0); });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Card.AlreadyApplied", { name }), "a second press did not say the damage already landed");
      assert.equal(raptor.actor.system.health.value, hp - dmg, "a second press landed again");
    });

    it("RECURRENCE: a successful cast's Apply lands again at the caster's next turn start through the tracker's Next Turn, once; a failed cast spends it (D-890)", async function () {
      this.timeout(420000);
      const { c, combat, foes } = await chronoInFight("ZZ PT Recur", { level: 17, spells: ["Grit Lash"], enemies: [{ name: "Raptor", x: 1300, y: 1000, health: 300 }] });
      const raptor = foes[0];
      const raptorTurn = combatantOfToken(combat, raptor.doc);
      await freshTurn(c, 2);
      assert.ok(await (await pressUse(c, "Recurrence")).card, "Recurrence posted no card");
      await until(() => c.getFlag("azeroth-rpg", RECURRENCE_FLAG), "Recurrence armed");
      const card = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 19 });
      assert.ok(card?.flags["azeroth-rpg"].chronoAgain?.recurrence, "the card records nothing to land again");
      assert.include(textOf(card), game.i18n.localize("AZEROTH.Chrono.RecurrenceTaken"));
      assert.isUndefined(c.getFlag("azeroth-rpg", RECURRENCE_FLAG) ?? undefined, "the cast did not take the arming");
      const dmg = card.flags["azeroth-rpg"].damageByTarget[0].damage;
      const hp0 = raptor.actor.system.health.value;
      await (await pressCard(card, APPLY)).release();
      await until(() => raptor.actor.system.health.value === hp0 - dmg, "the cast's own damage");
      await until(() => (c.getFlag("azeroth-rpg", AGAIN_FLAG) ?? []).length === 1, "what lands again recorded on the caster");
      await nextTurnUntil(raptorTurn, combat);
      assert.equal(raptor.actor.system.health.value, hp0 - dmg, "it landed again before the caster's turn");
      await nextTurnUntil(c, combat);
      await until(() => raptor.actor.system.health.value === hp0 - 2 * dmg, `the ${dmg} landed again at the caster's turn start`, 30000);
      await until(() => !(c.getFlag("azeroth-rpg", AGAIN_FLAG) ?? []).length, "the record spent");
      // Once: a whole round later it has not landed a third time.
      await nextTurnUntil(raptorTurn, combat);
      await nextTurnUntil(c, combat);
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(raptor.actor.system.health.value, hp0 - 2 * dmg, "it landed more than once");
      // A failed Casting Test (a natural 1) spends the arming and lands nothing, said on the card.
      await freshTurn(c, 2);
      assert.ok(await (await pressUse(c, "Recurrence")).card, "the second Recurrence posted no card");
      await until(() => c.getFlag("azeroth-rpg", RECURRENCE_FLAG), "armed again");
      const failed = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 1 });
      assert.isFalse(failed.flags["azeroth-rpg"].success, "a natural 1 succeeded");
      assert.include(textOf(failed), game.i18n.localize("AZEROTH.Chrono.RecurrenceSpent"));
      assert.isUndefined(c.getFlag("azeroth-rpg", RECURRENCE_FLAG) ?? undefined, "the failed cast left it armed");
      const hp1 = raptor.actor.system.health.value;
      await nextTurnUntil(raptorTurn, combat);
      await nextTurnUntil(c, combat);
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(raptor.actor.system.health.value, hp1, "a failed cast landed something again");
    });

    it("RECALL: the mark lays a ring on the board; the Reaction heals the damage since, moved or not, and the ring goes; the ten minutes take it off (D-889)", async function () {
      this.timeout(480000);
      const { c, scene, combat, foes } = await chronoInFight("ZZ PT Recall", { level: 9, abilities: { int: 18, con: 14 }, enemies: [{ name: "Raptor", x: 1700, y: 1000, health: 200 }] });
      const raptorTurn = combatantOfToken(combat, foes[0].doc);
      const recall = featureNamed(c, "Recall");
      assert.equal(recall.system.uses.max, 2, "half of +4, rounded down");
      // 1. The mark, from the sheet's Use on the Chronomancer's turn.
      await freshTurn(c, 2);
      assert.ok(await (await pressUse(c, "Recall")).card, "the mark posted no card");
      const mark = await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG), "the mark");
      const ring = await until(() => recallMarkerOf(c), "the marker Region on the board");
      assert.equal(ring.name, game.i18n.format("AZEROTH.Chrono.RecallMarkerName", { name: c.name }));
      assert.equal(ring.behaviors.size, 0, "a marker carries a behavior");
      assert.equal(ring.visibility, CONST.REGION_VISIBILITY.ALWAYS, "the table cannot see the marker");
      const size = scene.grid.size;
      assert.closeTo(ring.shapes[0].x, mark.x + size / 2, 1, "the ring is not on the marked square");
      assert.closeTo(ring.shapes[0].y, mark.y + size / 2, 1, "the ring is not on the marked square");
      // 2. Off the mark, struck on the Raptor's turn, the Reaction pressed from the sheet.
      await nextTurnUntil(raptorTurn, combat);
      await tokenOf(c).document.update({ x: mark.x + 400, y: mark.y }, { action: "displace" });
      await until(() => tokenOf(c).document.x === mark.x + 400, "the token moved off");
      const full = c.system.health.value;
      await c.applyDamage(6, { struck: true, attack: false });
      await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG)?.taken === 6, "the 6 counted on the mark");
      assert.ok(await (await pressUse(c, "Recall")).card, "the return posted no card");
      await until(() => c.system.health.value === full, "the 6 regained");
      assert.equal(combat.getCombatantsByActor(c)[0].budget.reactions, 0, "the Reaction spent");
      await until(() => !markersOf(scene, c).length, "the ring taken off on the return");
      assert.equal(recall.system.uses.value, 1, "the return struck a use: only the mark spends one");
      // 3. A second mark; the token stays on it; struck; the Reaction still heals.
      await nextTurnUntil(c, combat);
      await freshTurn(c, 2);
      assert.ok(await (await pressUse(c, "Recall")).card, "the second mark posted no card");
      const second = await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG), "the second mark");
      await until(() => recallMarkerOf(c), "the second ring");
      await nextTurnUntil(raptorTurn, combat);
      const before = c.system.health.value;
      await c.applyDamage(4, { struck: true, attack: false });
      await until(() => c.getFlag("azeroth-rpg", RECALL_FLAG)?.taken === 4, "the 4 counted");
      assert.equal(tokenOf(c).document.x, second.x, "the token left the mark");
      assert.ok(await (await pressUse(c, "Recall")).card, "the second return posted no card");
      await until(() => c.system.health.value === before, "the 4 regained with the token already on the mark");
      await until(() => !markersOf(scene, c).length, "the second ring taken off");
      // 4. A third mark (a use given back by hand) lapses on the world's clock, and its ring goes.
      await recall.update({ "system.uses.value": 1 });
      await nextTurnUntil(c, combat);
      await freshTurn(c, 2);
      assert.ok(await (await pressUse(c, "Recall")).card, "the third mark posted no card");
      await until(() => recallMarkerOf(c), "the third ring");
      await game.time.advance(601);
      await until(() => !markersOf(scene, c).length, "the ring taken off when the ten minutes end", 30000);
      await settle();
    });

    it("O-262 (D-905): Slow deals no damage, and the Raptor's Arcane Ward 3 still comes off its SL, so the SL 3 rider does not land", async function () {
      this.timeout(300000);
      const { c, foes } = await chronoInFight("ZZ PT Ward", { level: 5, spells: ["Slow"], enemies: [{ name: "Raptor", x: 1300, y: 1000, health: 200 }] });
      const raptor = foes[0];
      // Defense 0 so the natural 20 lands well past SL 3; Ward 3 against Arcane.
      await raptor.actor.update({ "system.defense": 0, "system.ward.arcane": 3 });
      await until(() => raptor.actor.system.ward?.arcane === 3, "the Raptor's Arcane Ward");
      await freshTurn(c, 1);
      const card = await castFromSheet(c, "Slow", { targets: [raptor.doc.object], face: 20 });
      assert.ok(card, "the cast posted no card");
      const wf = card.flags["azeroth-rpg"];
      assert.isTrue(wf.success, "the natural 20 failed");
      assert.isAtLeast(wf.sl, 3, "the cast's own SL would have landed the rider");
      assert.equal(wf.slRider?.kind, "failNoReaction", "the card records Slow's rider");
      assert.deepEqual(wf.slRiderWard, [3], "the card records the Raptor's Ward against the rider");
      const resist = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
      try {
        await answerAskIfAny(false, 6000);
        await until(() => Object.values(live(card).flags["azeroth-rpg"].resists ?? {}).some(r => r.success === false), "the failed Test recorded", 30000);
      } finally { await resist.release(); }
      await until(() => raptor.actor.statuses.has("slowed"), "the failed Test's Slowed", 30000);
      await settle();
      const barred = raptor.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.reactionBar?.cardUuid === card.uuid);
      assert.equal(barred.length, wf.sl - 3 >= 3 ? 1 : 0, `SL ${wf.sl} less Ward 3 decides the lost Reaction`);
    });

    it("O-272 (D-905): an Intelligence written to the sheet restamps Recall's uses at once", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ PT Int", { level: 9, abilities: { int: 12, con: 14 } });
      await until(() => featureNamed(c, "Recall"), "Recall granted");
      assert.equal(featureNamed(c, "Recall").system.uses.max, 0, "+1 gives no use");
      await c.update({ "system.abilities.int.value": 14 });
      await until(() => featureNamed(c, "Recall")?.system?.uses?.max === 1, "+2 gives one use, with no level or class change", 30000);
      await c.update({ "system.abilities.int.value": 12 });
      await until(() => featureNamed(c, "Recall")?.system?.uses?.max === 0, "back to +1, back to none", 30000);
    });
  });
}
