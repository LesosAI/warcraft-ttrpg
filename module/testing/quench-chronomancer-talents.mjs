/**
 * **THE CHRONOMANCER'S SHIFTING SANDS AND CHRONOWEAVER, THROUGH THE REAL DOORS** (04; stage
 * 2b), in a live world: each cast through `castSpell` with its dialog lines named, each Use
 * pressed from the sheet's own control, each offer pressed from the card it posted.
 *
 * WRITTEN, NOT RUN in stage 2b (the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chronomancer-talents`. Every document a test makes is deleted in
 * `after`.
 */

import { cleanup, drainAreaWork, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { disengage } from "../applications/combat-actions.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import { HASTENED_FLAG } from "../rules/chromatic-talents.mjs";
import { SUSPENDED_MOMENT_FLAG } from "../rules/chronomancer.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { chronoQueryHandler } from "../effects/chronomancer.mjs";
import {
  answerAsk, chooser, chronomancerWith, featureNamed, fightWith, freshTurn, halvesOf, parsed, pick, pressUse, sandOf, sceneWith, talentNamed,
  tokenOf, turnForward, until
} from "./quench-chronomancer-common.mjs";

/** Cast a spell at creatures with the dialog's lines named, the die pinned, the dialog skipped. */
async function castAt(caster, name, victims, { face = 19, lines = [] } = {}) {
  const spell = await until(() => caster.items.find(i => i.type === "spell" && i.name === name), `${name} known`);
  // In a fight, on the caster's own turn with the Half-Actions the spell spends (the live fix).
  await freshTurn(caster, halvesOf(spell));
  canvas.tokens.setTargets(victims.map(v => tokenOf(v).id));
  const targets = targetSnapshots();
  canvas.tokens.setTargets([]);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  let card = null;
  try { card = await game.system.azeroth.workflows.castSpell({ actor: caster, spell, dc: 5, targets, talentLines: lines }); } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  }
  if (card) made.push(card);
  await settle();
  return card;
}

/** A card's Apply on one row, through the card's own door. */
async function applyRow(card, index = 0) {
  const doc = game.messages.get(card.id);
  const button = parsed(doc).querySelector(`button[data-action="applyDamage"][data-target-index="${index}"]`);
  if (!button) throw new Error(`the card offers no Apply on row ${index}`);
  await CARD_ACTIONS.applyDamage(button, doc);
  await settle();
}

/** A card's Resist on one row, failed or passed with the die pinned. */
async function resistRow(card, index = 0, face = 1) {
  const doc = game.messages.get(card.id);
  const button = parsed(doc).querySelector(`button[data-action="resistTest"][data-target-index="${index}"]`)
    ?? parsed(doc).querySelector('button[data-action="resistTest"]');
  if (!button) throw new Error("the card offers no Resist");
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  try { await CARD_ACTIONS.resistTest(button, doc); } finally { unpin(); await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); }
  await settle();
}

/** A bandit with Health enough to take every test, its armor set. */
async function bandit(ap = 0) {
  const b = await makeNpc("Bandit");
  await b.update({ "system.health.value": 300, "system.health.max": 300, "system.ap.body": ap, "system.ap.head": ap, "system.ap.limb": ap });
  return b;
}

export function chronomancerTalentsBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The Chronomancer's Shifting Sands and Chronoweaver (04; stage 2b)", function () {
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("GRIT OF AGES adds 2 damage for 2 Sand on one cast, 1 SL for 2 Sand on another, and refuses both on one", async function () {
      this.timeout(300000);
      // Sand below the glass's cap, so the hit's own gain is never cut and can be measured.
      const c = await chronomancerWith("ZZ CT Grit", { level: 5, ranks: { "Grit of Ages": 3 }, spells: ["Sand Blast"], sand: 4 });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }]);
      const start = sandOf(c).value;
      assert.equal(start, 4, "4 Sand to start");
      const plain = await castAt(c, "Sand Blast", [b]);
      const base = plain.flags["azeroth-rpg"].damageByTarget[0].damage;
      await settle();
      const sand = sandOf(c).value;
      // What one pinned hit gives back, measured on the plain cast (the same die, the same target).
      const gain = sand - start;
      assert.isAtMost(sand, sandOf(c).max - gain, "room in the glass for the second hit's gain");
      const dmg = await castAt(c, "Sand Blast", [b], { lines: ["grit-damage2"] });
      assert.equal(dmg.flags["azeroth-rpg"].damageByTarget[0].damage, base + 2, "2 more damage");
      await until(() => sandOf(c).value === sand - 2 + gain, `the 2 Sand paid and the hit's ${gain} gained (${sand} - 2 + ${gain})`);
      const sl = await castAt(c, "Sand Blast", [b], { lines: ["grit-sl1"] });
      assert.equal(sl.flags["azeroth-rpg"].sl, plain.flags["azeroth-rpg"].sl + 1, "1 more SL");
      let both = null;
      const said = await warnings(async () => { both = await castAt(c, "Sand Blast", [b], { lines: ["grit-damage1", "grit-sl1"] }); });
      assert.isNull(both, "both on one cast refused");
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Grit.OneOnly", { name: "Sand Blast" }));
    });

    it("HEAVY HOURS lays a Bane on a Reflex Resist against the caster's spell while it carries the caster's Decay, and bars its Disengage at rank 2", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Heavy", { level: 5, ranks: { "Heavy Hours": 2 }, spells: ["Sand Blast", "Sand Breath"] });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 900, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await castAt(c, "Sand Blast", [b]);
      await until(() => b.effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]), "the caster's Decay");
      const card = await castAt(c, "Sand Breath", [b]);
      const rolled = untilHook("createChatMessage", 20000, m => m.flags?.["azeroth-rpg"]?.kind === "resilience" || m.rolls?.[0]?.options?.kind === "resilience");
      await resistRow(card, 0, 10);
      const [test] = await rolled;
      made.push(test);
      assert.isAtLeast(test.rolls[0].options.banes ?? test.rolls[0].banes ?? 0, 1, "the Bane on the Resist");
      await turnForward(combat, b);
      let done = null;
      const said = await warnings(async () => { done = await disengage(b); });
      assert.isNull(done, "the Disengage refused");
      assert.include(said.join(" "), "cannot Disengage");
    });

    it("DRAGGING SANDS gains 1 Sand off a Slowed creature a spell damages, once a cast", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Drag", { level: 5, ranks: { "Dragging Sands": 1 }, spells: ["Sand Blast"] });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }]);
      await b.toggleStatusEffect("slowed", { active: true });
      const before = sandOf(c).value;
      const card = await castAt(c, "Sand Blast", [b], { face: 12 });
      assert.ok(card);
      assert.isTrue(card.flags["azeroth-rpg"].success, "the pinned Sand Blast hit");
      // The hit's own Sand (02 §7: +1, and +1 more at SL 2 or better - read off the card, since
      // the caster's Intelligence and Proficiency put a pinned 12 at SL 2; the live fix) and
      // Dragging Sands' +1.
      const hit = (card.flags["azeroth-rpg"].sl ?? 0) >= 2 ? 2 : 1;
      await until(() => sandOf(c).value === before + hit + 1, `the hit's ${hit} Sand and Dragging Sands' 1 (holding ${sandOf(c)?.value})`);
    });

    it("ECHOING SANDS lands half the damage the creature took again at the caster's next turn start, all of it at rank 2", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Echo", { level: 5, ranks: { "Echoing Sands": 2 }, spells: ["Sand Blast"], sand: 4 });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await turnForward(combat, c);
      const card = await castAt(c, "Sand Blast", [b], { lines: ["echoing-sands"] });
      assert.ok(card.flags["azeroth-rpg"].chronoAgain?.echo, "the card records the echo");
      await applyRow(card, 0);
      const took = 300 - b.system.health.value;
      await turnForward(combat, b);
      await turnForward(combat, c);
      await until(() => b.system.health.value === 300 - 2 * took, "all of it again at rank 2");
    });

    it("ARRESTED MOMENT Stuns a creature the caster Slowed that fails a Resist against its spell, and strikes its use", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Arrest", { level: 5, ranks: { "Arrested Moment": 1 }, spells: ["Stutter", "Sand Breath"] });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 900, y: 1000, side: "hostile" }]);
      // **OUT OF A FIGHT** (the live fix): Stutter and Sand Breath are each an Action, so in a fight
      // the second waits for the caster's next turn, and the bandit's own turn between them ends
      // Stutter's Slowed (*until the end of its next turn*) before Sand Breath's Test is made.
      // Out of a fight the Slowed holds a round of the world's clock, which nothing advances here.
      const stutter = await castAt(c, "Stutter", [b]);
      await resistRow(stutter, 0, 1);
      await until(() => b.statuses.has("slowed"), "Slowed by the caster");
      // *A creature you have Slowed fails*: the Slowed Stutter's own failure lays is not one the
      // bandit already had, so that failure lays no Stun (MY READING, D-884).
      await settle();
      assert.isFalse(b.statuses.has("stunned"), "Stutter's own failure Stunned the creature it was Slowing");
      const breath = await castAt(c, "Sand Breath", [b]);
      await resistRow(breath, 0, 1);
      await until(() => b.statuses.has("stunned"), "Stunned too");
      const counter = c.grantedFeature(talentNamed(c, "Arrested Moment").id);
      await until(() => counter.system.uses.value === 0, "the use struck");
    });

    it("EROSION makes the caster's Decay 1 higher, and at rank 2 adds it to the tier", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Erode", { level: 9, ranks: { Erosion: 2 }, spells: ["Sand Blast"] });
      const b = await bandit(4);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }]);
      await castAt(c, "Sand Blast", [b]);
      const decay = () => b.effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG])?.flags["azeroth-rpg"][DECAY_FLAG].value ?? 0;
      await until(() => decay() === 2, "Decay 1 + 1");
      await castAt(c, "Sand Blast", [b]);
      await until(() => decay() === Math.min(c.system.tier, 4), "added, held to the tier");
    });

    it("STORM OF AGES widens Sandstorm by 5 feet, and at rank 2 by 5 more a Sand", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Storm", { level: 9, ranks: { "Storm of Ages": 2 }, spells: ["Sandstorm"], sand: 3 });
      await sceneWith([{ actor: c, x: 800, y: 1000 }]);
      const card = await castAt(c, "Sandstorm", [], { lines: ["storm-2"] });
      // The card's area is `rules/areas.mjs#areaFor`'s shape (`{shape, distanceFt, origin}`),
      // never the Target line's words (the live fix: the test matched a regex against the object).
      const area = card.flags["azeroth-rpg"].area ?? null;
      assert.equal(area?.shape, "circle", "Sandstorm's circle");
      assert.equal(area?.distanceFt, 30, `15 + 5 + 10 feet (the card carries ${JSON.stringify(area)})`);
    });

    it("WITHERING HOURS halves a heal inside Withering Sands at rank 2", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Wither", { level: 9, ranks: { "Withering Hours": 2 }, spells: ["Withering Sands"] });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1300, y: 1000, side: "hostile" }]);
      await b.update({ "system.health.value": 100 });
      const card = await castAt(c, "Withering Sands", []);
      const doc = game.messages.get(card.id);
      const place = parsed(doc).querySelector('button[data-action="placeArea"]');
      assert.ok(place, "the card offers Place area");
      const placed = untilHook("createRegion", 20000);
      const pressed = CARD_ACTIONS.placeArea(place, doc);
      const point = tokenOf(b).center;
      const client = canvas.clientCoordinatesFromCanvas(point);
      // The pick armed (D-767's announced state), so the press below reaches it rather than racing it.
      await until(() => game.system.azeroth.canvas.pickState()?.active === true, "the pick armed");
      canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", { clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }));
      await pressed;
      await placed;
      await settle();
      await b.applyHealing(10, { from: c, spell: true });
      await until(() => b.system.health.value === 105, "half of 10");
    });

    it("TEMPORAL LOOP is offered when an enemy ends a move, and a failed Spirit Test returns it", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Loop", { level: 9, ranks: { "Temporal Loop": 1 }, sand: 4 });
      const b = await bandit(0);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1200, y: 1000, side: "hostile" }]);
      const combat = await fightWith([c, b]);
      await turnForward(combat, b);
      const offered = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.chronoOffer?.kind === "temporalLoop");
      await tokenOf(b).document.move({ x: 1500, y: 1000 });
      const [offer] = await offered;
      made.push(offer);
      // The offer's own button, pressed through the card's own action (the Rewind door the
      // offer template shares), inside its message row as the chat log draws it.
      const button = parsed(offer).querySelector('button[data-action="rewind"]');
      assert.ok(button, "the offer carries a button");
      assert.equal(button.dataset.featureId, c.grantedFeature(talentNamed(c, "Temporal Loop").id).id, "the button names the Loop's feature");
      const row = document.createElement("li");
      row.dataset.messageId = offer.id;
      row.append(button);
      const card = await CARD_ACTIONS[button.dataset.action](button, game.messages.get(offer.id));
      assert.ok(card, "the press made the Loop's card");
      made.push(card);
      await resistRow(card, 0, 1);
      await until(() => tokenOf(b).document.x === 1200, "returned to where its move began");
    });

    it("COLLAPSE OF HOURS spends every Sand and strikes the Decayed for the tier plus the Sand, after Armor Points", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Collapse", { level: 9, ranks: { "Collapse of Hours": 1 }, spells: ["Sand Blast"], sand: 6 });
      const b = await bandit(1);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }]);
      await castAt(c, "Sand Blast", [b]);
      await until(() => b.effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]), "the Decay");
      const sand = sandOf(c).value;
      const health = b.system.health.value;
      await (await pressUse(c, "Collapse of Hours")).card;
      await until(() => sandOf(c).value === 0, "all the Sand spent");
      await until(() => b.system.health.value === health - Math.max(0, c.system.tier + sand - b.system.ap.body), "tier plus Sand, less Body AP");
    });

    it("COLLAPSE OF HOURS on a creature the Chronomancer's player does not own lands through the GM's handler, judged again there (stage 11, D-906)", async function () {
      // Every Quench test runs as the GM, so the player's half is the handler the player's query
      // reaches (`CHRONO_QUERY`) called directly, and the judgement the Use asks before it spends.
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Collapse GM", { level: 9, ranks: { "Collapse of Hours": 1 }, spells: ["Sand Blast"], sand: 6 });
      const b = await bandit(1);
      const clean = await bandit(1);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: b, x: 1100, y: 1000, side: "hostile" }, { actor: clean, x: 1100, y: 1300, side: "hostile" }]);
      await castAt(c, "Sand Blast", [b]);
      await until(() => b.effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]), "the Decay");
      const health = b.system.health.value;
      // A Rating past anything the talent can deal is capped at rank 2's twice the tier plus the
      // glass's whole Sand (`collapseDamage`, judged on the GM's client).
      const most = 2 * c.system.tier + sandOf(c).max;
      const done = await chronoQueryHandler({ op: "collapse", byUuid: c.uuid, targetUuid: b.uuid, rating: 999 }, { user: game.user });
      assert.isTrue(done?.ok, "the handler struck the Decayed creature");
      const dealt = Math.max(0, most - b.system.ap.body);
      assert.equal(done.damage, dealt, "the Rating capped at the tier plus a full glass, less Body Armor Points");
      await until(() => b.system.health.value === health - dealt, "the GM's client wrote the Health");
      // A creature the Chronomancer neither Slowed nor Decayed is refused there, and keeps its Health.
      const cleanHealth = clean.system.health.value;
      let refused = null;
      try { await chronoQueryHandler({ op: "collapse", byUuid: c.uuid, targetUuid: clean.uuid, rating: 5 }, { user: game.user }); } catch (err) { refused = err.message; }
      assert.equal(refused, game.i18n.localize("AZEROTH.Chrono.NotHeld"), "the handler refuses a creature Collapse does not strike");
      assert.equal(clean.system.health.value, cleanHealth, "and writes nothing on it");
      // The Use's own judgement for a player with no GM online: the creature is not theirs to write.
      const player = game.users.find(u => !u.isGM) ?? null;
      if (player) {
        assert.isFalse(b.testUserPermission(player, "OWNER"), "the bandit is not the player's");
        assert.isTrue(gmAbsentFor({ owned: [b.testUserPermission(player, "OWNER")], isGM: false, gmActive: false }), "with no GM the Use is refused before the Sand is spent");
        assert.isFalse(gmAbsentFor({ owned: [b.testUserPermission(player, "OWNER")], isGM: false, gmActive: true }), "with a GM online it is written there");
      }
    });

    it("GIFT OF MOMENTS lays a Boon and at rank 2 10 feet of Speed; SHARED HOURS gives the giver 2 Sand at rank 2", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Gift", { level: 9, ranks: { "Gift of Moments": 2, "Shared Hours": 2 }, sand: 4 });
      const ally = await makeCharacter({ name: "ZZ CT Gift Ally", classes: [["Warrior", 5]] });
      // **OUT OF A FIGHT AN ALLY IS THE PARTY'S** (D-658, D-755: `rules/distance.mjs#countsAsAlly`; the
      // live fix): with no fight and no Party the door read the ally as hostile and refused in words.
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const speed = ally.system.speed;
      await (await pressUse(c, "Gift of Moments", [tokenOf(ally)])).card;
      await until(() => ally.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBoon), "the Boon laid");
      await until(() => ally.system.speed === speed + 10, "10 feet of Speed");
      await until(() => sandOf(c).value === 4 - 2 + 2, "Shared Hours' 2 Sand back");
    });

    it("QUICKSTEP moves a willing ally 10 feet a rank without an Opportunity Attack", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Quick", { level: 5, ranks: { Quickstep: 2 }, sand: 2 });
      const ally = await makeCharacter({ name: "ZZ CT Quick Ally", classes: [["Warrior", 5]] });
      // **OUT OF A FIGHT AN ALLY IS THE PARTY'S** (D-658, D-755: `rules/distance.mjs#countsAsAlly`; the
      // live fix): with no fight and no Party the door read the ally as hostile and refused in words.
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const { card } = await pressUse(c, "Quickstep", [tokenOf(ally)]);
      const target = { x: 1300, y: 1000 };
      await until(() => canvas.app?.view, "the board");
      const client = canvas.clientCoordinatesFromCanvas({ x: target.x + 50, y: target.y + 50 });
      // The pick armed (D-767's announced state) before the press, rather than a fixed 300 ms the
      // Use's judgement can outlast (the live fix: the press landed before the pick and the card
      // never came).
      await until(() => game.system.azeroth.canvas.pickState()?.active === true, "Quickstep's pick armed");
      canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", { clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }));
      assert.ok(await card);
      await until(() => tokenOf(ally).document.x === target.x, "the ally moved 15 feet");
    });

    it("SECOND CHANCE gives an ally an extra Reaction it may spend after its own", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Second", { level: 9, ranks: { "Gift of Moments": 1, "Second Chance": 1 }, sand: 3 });
      const ally = await makeCharacter({ name: "ZZ CT Second Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const combat = await fightWith([c, ally]);
      await turnForward(combat, c);
      await (await pressUse(c, "Second Chance", [tokenOf(ally)])).card;
      const theirs = combat.getCombatantsByActor(ally)[0];
      await until(() => (theirs.budget.given ?? []).length === 1, "the Reaction given");
      assert.isTrue((await theirs.spendAction("reaction")).ok, "its own Reaction");
      assert.isTrue((await theirs.spendAction("reaction")).ok, "the given one");
      assert.isFalse((await theirs.spendAction("reaction")).ok, "and no third");
    });

    it("UNFADING is offered when an ally gains a condition, and ends it with the ally barred from it until its next turn's end", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Unfading", { level: 9, ranks: { Unfading: 1 }, sand: 2 });
      const ally = await makeCharacter({ name: "ZZ CT Unfaded", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      await fightWith([c, ally]);
      const offered = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.chronoOffer?.kind === "unfading");
      await ally.toggleStatusEffect("slowed", { active: true });
      const [offer] = await offered;
      made.push(offer);
      const { useFeatureWithDialog } = await import("../applications/actions.mjs");
      const target = { actorId: ally.id, tokenId: tokenOf(ally).id, sceneId: canvas.scene.id, name: ally.name };
      const card = await useFeatureWithDialog(c, c.grantedFeature(talentNamed(c, "Unfading").id), null, { targets: [target], answers: { messageId: offer.id } });
      made.push(card);
      await until(() => !ally.statuses.has("slowed"), "Slowed ended");
      assert.include(ally.system.conditionImmunities ?? [], "slowed", "barred from Slowed");
    });

    it("SWIFT CURRENT and TWINNED HOURS restamp Slipstream: 2 Mana and two uses", async function () {
      this.timeout(120000);
      const c = await chronomancerWith("ZZ CT Slip Talents", { level: 9, ranks: { "Swift Current": 2, "Twinned Hours": 2 } });
      const slip = await until(() => featureNamed(c, "Slipstream"), "Slipstream");
      await until(() => slip.system.cost.amount === 2 && slip.system.uses.max === 2, "the restamp");
    });

    it("ECHO OF POWER gives an ally back 2 a rank of a pool other than Sand", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Echo Power", { level: 9, ranks: { "Gift of Moments": 1, "Second Chance": 1, "Echo of Power": 2 }, sand: 3 });
      const ally = await makeCharacter({ name: "ZZ CT Rage Ally", classes: [["Warrior", 5]] });
      // **OUT OF A FIGHT AN ALLY IS THE PARTY'S** (D-658, D-755: `rules/distance.mjs#countsAsAlly`; the
      // live fix): with no fight and no Party the door read the ally as hostile and refused in words.
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      await (await pressUse(c, "Echo of Power", [tokenOf(ally)])).card;
      await until(() => (ally.poolSnapshot().find(p => p.name === "rage")?.value ?? 0) === 4, "4 Rage");
    });

    it("SUSPENDED MOMENT switches an ally's conditions off until the start of the caster's next turn", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Moment", { level: 9, ranks: { "Suspended Moment": 1 }, sand: 2 });
      const ally = await makeCharacter({ name: "ZZ CT Moment Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const combat = await fightWith([c, ally]);
      await turnForward(combat, c);
      await ally.toggleStatusEffect("slowed", { active: true });
      await (await pressUse(c, "Suspended Moment", [tokenOf(ally)])).card;
      await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", SUSPENDED_MOMENT_FLAG)), "the suspension");
      assert.isFalse(ally.statuses.has("slowed"), "Slowed does nothing");
      await turnForward(combat, ally);
      await turnForward(combat, c);
      await until(() => ally.statuses.has("slowed"), "back on at the caster's turn");
    });

    it("WEAVER'S LORE brings one willing ally within 5 feet along on Farstep", async function () {
      this.timeout(240000);
      const c = await chronomancerWith("ZZ CT Weaver", { level: 16, ranks: { "Weaver's Lore": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Weaver Ally", classes: [["Warrior", 5]] });
      // **OUT OF A FIGHT AN ALLY IS THE PARTY'S** (D-658, D-755: `rules/distance.mjs#countsAsAlly`; the
      // live fix): with no fight and no Party the door read the ally as hostile and refused in words.
      await c.setParty(true);
      await ally.setParty(true);
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }]);
      const spell = await until(() => c.items.find(i => i.type === "spell" && i.name === "Farstep"), "Farstep taught");
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(19);
      const cast = game.system.azeroth.workflows.castSpell({ actor: c, spell, dc: 5, targets: [] });
      await pick(await chooser({ id: `${c.id}-farstep`, name: "Weaver's Lore" }), ally.name);
      const client = canvas.clientCoordinatesFromCanvas({ x: 1650, y: 1050 });
      await new Promise(r => setTimeout(r, 300));
      canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", { clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }));
      const card = await cast;
      unpin();
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      made.push(card);
      await until(() => tokenOf(c).document.x === 1600 && tokenOf(ally).document.x === 1700, "both moved, the ally in formation");
    });

    it("RECOVERED HOURS and THE GLASS TURNS BACK give back a spent use, a spell's 07 §4 gate, and up to 3 of a pool", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ CT Glass", { level: 20, ranks: { "Recovered Hours": 2, "The Glass Turns Back": 1 }, spells: ["Epoch"], sand: 8 });
      const ally = await makeCharacter({ name: "ZZ CT Glass Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: ally, x: 1000, y: 1000 }]);
      const slip = await until(() => featureNamed(c, "Slipstream"), "Slipstream");
      await slip.update({ "system.uses.value": 0 });
      // 07 §4's one record (D-882): Epoch's one use this Short Rest, spent.
      await c.setFlag("azeroth-rpg", SPELL_USES_FLAG, { epoch: { spent: 1, per: "short" } });
      // `pressUse` resolves once the control is clicked and hands back the card still pending,
      // so the chooser the Use opens is answered before the card is awaited.
      const pending = await pressUse(c, "Recovered Hours", [tokenOf(c)]);
      const app = await chooser(featureNamed(c, "Recovered Hours"));
      await pick(app, "Epoch");
      assert.ok(await pending.card, "Recovered Hours' card");
      await until(() => c.getFlag("azeroth-rpg", SPELL_USES_FLAG)?.epoch?.spent === 0, "Epoch's gate opened");
      const glass = await pressUse(c, "The Glass Turns Back");
      const first = await chooser(featureNamed(c, "The Glass Turns Back"));
      await pick(first, "Slipstream");
      assert.ok(await glass.card, "The Glass Turns Back's card");
      await until(() => slip.system.uses.value === 1, "Slipstream's use back");
      // *spend all your Sand* - and *Each ally within 60 feet, you included, ... regains up to 3 of
      // one Momentum or Power pool it holds*: the caster's Mana is full, so its one pool to regain
      // is the Sand it has just spent, and it ends on 3 (the live fix: the test expected 0).
      await until(() => sandOf(c).value === 3, `every Sand spent, then 3 regained (holding ${sandOf(c)?.value})`);
    });
  });
}
