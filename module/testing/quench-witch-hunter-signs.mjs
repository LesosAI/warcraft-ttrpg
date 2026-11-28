/**
 * **THE WITCH HUNTER'S SIGNS AND CLASS FEATURES, THROUGH THE REAL CONTROLS** (the Witch Hunter plan's wave 2a-B). Two
 * batches, each run alone (`QUENCH_BATCH=azeroth-rpg.witch-hunter-signs`, `azeroth-rpg.witch-hunter-features`), every
 * test making its own Human Witch Hunter (`ZZ WHS ...`) and pressing what a player presses - the sheet's own Use
 * (`pressUse`, which `featureAims` hands the creatures targeted), the one chooser, the board for a cone or a point,
 * a card's Resist, Warn or Learn button - with the d20 pinned through `fixtures.mjs#pinDie`:
 *
 * - **signs**: the Gale Sign's push on a failure, the Ember Sign's damage and Scorched, the Rowan Sign on an ally and
 *   on the hunter, Greater Signs' Empowered line, the Ash ring's Slowed at a turn's start and its Immune strip, the
 *   Lull Sign in and out of a fight, and the Tome's weakness record on a Sign's card.
 * - **features**: Read the Trail with a Hard result and the GM's Learn the type, Expose Weakness and its Immune
 *   refusal, Whirling Steel's attacks and the turn's Attack count, the Medallion's cast watcher, its warning and its
 *   pulse, the Decoction gate, and The Last Hunt's cap, its cheaper Sign and its clip.
 *
 * Needs the class in the compiled packs (`packs:parse`, then `packs:build` through the harness). Written in wave 2a-B,
 * run in the lead's live pass (wave 4).
 */

import { cleanup, drainAreaWork, give, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { chooser, fightWith, freshTurn, pick, pressCard, pressUse, sceneWith, textOf, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { pickState } from "../canvas/place.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { ASH_RING_KEY, SIGNS, WARNED_FLAG, signCost } from "../rules/witch-hunter-features.mjs";
import { LAST_HUNT_FLAG, TOME_FLAG, WEAKNESS_CARD_FLAG } from "../rules/witch-hunter-standing.mjs";
import { VULNERABLE_FLAG } from "../rules/laid-vulnerable.mjs";

const SCOPE = "azeroth-rpg";
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const tempoOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tempo") ?? null;
const effectsFlagged = (actor, flag) => [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[flag]);

/** A Human Witch Hunter at a level, its Tome holding these types, these Studied, its pools in place. */
async function hunterWith(name, { level = 1, known = ["undead", "beast"], studied = ["undead"], abilities = { str: 16, con: 14, int: 16, wis: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [["Witch Hunter", level]], race: "Human", abilities });
  await until(() => energyOf(actor) && tempoOf(actor), "the Energy and Tempo pools");
  await actor.setFlag(SCOPE, TOME_FLAG, { known, studied, damaged: [], defeated: [], learned: false, learnOpen: null });
  await fill(actor, "power", "energy", energyOf(actor).max);
  return actor;
}

/** A pool set by a GM's hand. */
async function fill(actor, kind, name, value) {
  const pool = actor.poolSnapshot().find(p => p.kind === kind && p.name === name);
  await actor.updatePool({ itemId: pool.itemId, kind, value });
  await until(() => actor.poolSnapshot().find(p => p.kind === kind && p.name === name)?.value === value, `${value} ${name}`);
}

/** Press the board where a pick waits, at a point in canvas pixels. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** A hostile creature from the bestiary, with its own token beside the hunter's on the viewed scene. */
async function foeAt(scene, name, x, y, update = null) {
  const base = await makeNpc(name);
  if (update) await base.update(update);
  const [doc] = await scene.createEmbeddedDocuments("Token", [await tokenData(base, { x, y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
  await until(() => tokenDrawn(doc.object), `${name}'s token drawn`);
  return doc;
}

/** Press a feature card's Resist for the row at an index, the die pinned; the Resilience card it posts. */
async function resistOn(card, index, face) {
  const posted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "resilience" || m.rolls?.length).then(([m]) => { made.push(m); return m; }).catch(() => null);
  const { release } = await pressCard(card, `button[data-action="resistTest"][data-target-index="${index}"]`, { face });
  try { return await posted; } finally { await release(); }
}

/** Ensure the class is in the compiled packs before a batch runs. */
async function needsClass() {
  const index = await game.packs.get("azeroth-rpg.classes").getIndex();
  if (!index.some(e => e.name === "Witch Hunter")) throw new Error("the classes pack holds no Witch Hunter: run packs:parse and rebuild the packs");
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-signs                                      */
/* ------------------------------------------------------------------ */

export function witchHunterSignsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's Signs through the real controls (wave 2a-B)", function () {
    before(async function () {
      this.timeout(60000);
      await needsClass();
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("GALE SIGN: the cone aimed from the sheet gathers the creature in front, costs 3 Energy, and a failed Body Test pushes it 10 feet", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Gale");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const front = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const behind = await foeAt(scene, "Defias Footpad", 800, 1000);
      const energy = energyOf(wh).value;
      const { feature, card } = await pressUse(wh, "Signs");
      await pick(await chooser(feature), SIGNS.gale.name);
      await until(() => pickState()?.mode === "facing", "the Gale Sign's aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.ok(posted, "the Gale Sign posted no card");
      const f = posted.flags[SCOPE];
      const reached = (f.targets ?? []).map(t => t.tokenId);
      assert.include(reached, front.id, "the creature in the cone was not gathered");
      assert.notInclude(reached, behind.id, "the creature behind was gathered");
      assert.deepEqual(f.forced, { on: "fail", feet: 10, toward: "away", from: "caster", resilience: "body" });
      assert.equal(f.whSign.sign, "gale");
      await until(() => energyOf(wh).value === energy - 3, "3 Energy spent");
      const x0 = front.x;
      await resistOn(posted, 0, 1);
      await until(() => scene.tokens.get(front.id).x !== x0, "the failed creature pushed");
      assert.isAtLeast(Math.abs(scene.tokens.get(front.id).x - x0), 100, "pushed 10 feet (two squares) away");
    });

    it("EMBER SIGN: Reflex at the Sign's DC, Fire 2 plus tier with half on a success, a failure Scorched 1 with its own layer", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Ember", { known: ["undead", "humanoid"], studied: ["undead"] });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const front = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { feature, card } = await pressUse(wh, "Signs");
      await pick(await chooser(feature), SIGNS.ember.name);
      await until(() => pickState()?.mode === "facing", "the Ember Sign's aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      const f = posted.flags[SCOPE];
      assert.equal(f.damageType, "fire");
      assert.equal(f.halfOnPass, true, "a passed Reflex Test does not halve it");
      assert.deepEqual(f.onFailInflicts, [{ condition: "scorched", value: 1, until: null }]);
      assert.match(String(f.failLayer ?? ""), /ember-sign$/, "no Scorched layer");
      // The Tome's weakness record: a Humanoid's row names the Lull Sign, so the Ember Sign's card names none of it.
      assert.notOk(f[WEAKNESS_CARD_FLAG]?.types?.includes("humanoid"), "the Ember Sign named the Humanoid row");
      const actor = front.actor;
      await resistOn(posted, 0, 1);
      await until(() => actor.statuses?.has("scorched"), "Scorched on a failure");
    });

    it("THE TOME'S WEAKNESS RECORD: an Ember Sign at a known undead carries the row the Resist reads", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Weakness", { known: ["undead"], studied: ["undead"] });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await foeAt(scene, "Plagued Ghoul", 1100, 1000);
      const { feature, card } = await pressUse(wh, "Signs");
      await pick(await chooser(feature), SIGNS.ember.name);
      await until(() => pickState()?.mode === "facing", "the aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.deepEqual(posted.flags[SCOPE][WEAKNESS_CARD_FLAG]?.types, ["undead"], "the card carries no weakness record");
      // Read off the Resist's OWN dialog (wave 2d-B; the review's section E): the card's Resist pressed for the ghoul,
      // the roll dialog set to always, and its automatic Bane line named for the Tome.
      const ghoul = canvas.tokens.get(posted.flags[SCOPE].targets[0].tokenId).actor;
      const { resistDialog } = await import("./quench-witch-hunter-common.mjs");
      const { lines } = await resistDialog(posted, 'button[data-action="resistTest"][data-target-index="0"]', ghoul);
      const bane = lines.find(l => l.name === "line-talentBane");
      assert.ok(bane?.checked, `the undead resister's dialog carries the Tome's Bane: ${lines.map(l => l.text).join(" | ")}`);
      assert.include(bane.text, "Tome of Silver and Ash", "named for the Tome");
    });

    it("ROWAN SIGN: an ally targeted gains Ward equal to the tier in every school; nobody targeted wards the hunter", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Rowan", { level: 5 });
      const ally = await makeCharacter({ name: "ZZ WHS Rowan Ally", classes: [["Warrior", 5]], race: "Human" });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }]);
      // Out of a fight an ally is a Party member (D-755); a friendly token alone is refused as not an ally.
      await (await import("./quench-witch-hunter-common.mjs")).partyOf(wh, ally);
      const { feature, card } = await pressUse(wh, "Signs", [tokenOf(ally)]);
      await pick(await chooser(feature), SIGNS.rowan.name);
      await card;
      await until(() => (ally.system.ward?.fire ?? 0) >= 2, "the ally's Ward against Fire");
      for (const school of ["fire", "frost", "shadow", "holy", "fel", "arcane", "nature"]) assert.isAtLeast(ally.system.ward?.[school] ?? 0, 2, school);
      const own = await pressUse(wh, "Signs");
      await pick(await chooser(own.feature), SIGNS.rowan.name);
      await own.card;
      await until(() => (wh.system.ward?.frost ?? 0) >= 2, "the hunter's own Ward");
    });

    it("GREATER SIGNS: the chooser offers the Empowered Gale Sign for 2 more Energy, and its failure knocks Prone", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Greater", { level: 17 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const front = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const energy = energyOf(wh).value;
      const { feature, card } = await pressUse(wh, "Signs");
      const app = await chooser(feature);
      const label = game.i18n.format("AZEROTH.WhSign.OptionEmpowered", { sign: SIGNS.gale.name, n: signCost("gale", { empower: true }).cost });
      await pick(app, label);
      await until(() => pickState()?.mode === "facing", "the aim");
      pressBoard({ x: 1600, y: 1050 });
      const posted = await card;
      assert.equal(posted.flags[SCOPE].whSign.empowered, true);
      assert.deepEqual(posted.flags[SCOPE].onFailInflicts, [{ condition: "prone", value: null, until: null }]);
      await until(() => energyOf(wh).value === energy - 5, "5 Energy spent");
      await resistOn(posted, 0, 1);
      await until(() => front.actor.statuses?.has("prone"), "Prone on a failure");
    });

    it("ASH SIGN: the ring placed at a point picked, a creature in it loses Immune (Physical), and an enemy's turn there asks its Spirit Test", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHS Ash", { level: 9 });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1300, 1000, { "system.immune": ["physical"] });
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 1);
      const { card } = await pressUse(wh, "Ash Sign");
      await until(() => pickState()?.mode === "point", "the Ash ring's point");
      pressBoard({ x: 1350, y: 1050 });
      await card;
      const ring = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.identifier === ASH_RING_KEY && r.flags?.[SCOPE]?.caster === wh.uuid), "the Ash ring placed");
      assert.equal(ring.flags[SCOPE].areaTick.checks[0].fail.until, "leaves");
      await drainAreaWork();
      await until(() => !(foe.actor.system.immune ?? []).includes("physical"), "Immune (Physical) stripped inside the ring");
      await turnForward(combat, foe.actor);
      const test = await until(() => [...game.messages].reverse().find(m => m.flags?.[SCOPE]?.area?.regionId === ring.id), "the ring's Spirit Test card");
      assert.ok(test, "no area Test posted at the enemy's turn's start");
    });

    it("LULL SIGN: in a fight a failure is Charmed to the end of its next turn; out of a fight it is a calm marker, no condition, with the Boon on Persuasion and Deception", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHS Lull", { level: 11 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const calmFoe = await foeAt(scene, "Defias Footpad", 1200, 1000);
      // Out of a fight: the calm (the lead: *"Out of a fight, a creature that fails stays calm toward you for 10 minutes,
      // and you have a Boon on Persuasion and Deception Tests against it. When the effect ends, it knows you used the Lull
      // Sign on it."*; the review's F1, wave 2d-A's D-2139): a marker effect, never Charmed.
      const out = await pressUse(wh, "Lull Sign", [calmFoe.object]);
      const outCard = await out.card;
      assert.equal(outCard.flags[SCOPE].whSign.calm, true, "out of a fight the card offers the calm");
      await resistOn(outCard, 0, 1);
      const calm = await until(() => calmFoe.actor.effects.find(e => e.flags?.[SCOPE]?.whLull?.by === wh.uuid), "the calm laid");
      assert.equal(calm.statuses?.size ?? 0, 0, "the calm lays no condition");
      assert.notOk(calmFoe.actor.statuses?.has("charmed"), "no Charmed out of a fight");
      assert.equal((calm.system?.changes ?? []).length, 0, "the calm changes no number");
      assert.equal(calm.flags[SCOPE].whLull.minutes, 10, "for 10 minutes");
      // The Boon read off the hunter's OWN roll dialog, the creature targeted: Persuasion and Deception, never Athletics.
      const { throughDialog } = await import("./quench-witch-hunter-common.mjs");
      const sheet = await openSheet(wh);
      canvas.tokens.setTargets([calmFoe.id]);
      try {
        for (const skill of ["persuasion", "deception", "athletics"]) {
          const { lines } = await throughDialog(wh, () => sheet.element.querySelector(`[data-action="rollSkill"][data-skill="${skill}"]`).click());
          const boon = lines.find(l => l.name === "line-talentBoon" && l.text.includes(SIGNS.lull.name));
          if (skill === "athletics") assert.notOk(boon, "no Boon on Athletics");
          else assert.ok(boon?.checked, `${skill}: the calm's automatic Boon: ${lines.map(l => l.text).join(" | ")}`);
        }
      } finally { canvas.tokens.setTargets([]); await sheet.close(); }
      // Its end tells the GM the creature knows.
      const knows = untilHook("createChatMessage", 20000, m => m.flags?.[SCOPE]?.lullEnded?.by === wh.uuid).then(([m]) => { made.push(m); return m; });
      await calm.delete();
      assert.ok(await knows, "the calm's end posts the GM's card");
      // In a fight: Charmed until the end of its next turn.
      const fightFoe = await foeAt(scene, "Defias Footpad", 1000, 1200);
      await fightWith([wh]);
      const combat = wh.activeFight();
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: fightFoe.actorId, sceneId: scene.id, tokenId: fightFoe.id }]);
      await freshTurn(wh, 1);
      await fill(wh, "power", "energy", energyOf(wh).max);
      const inside = await pressUse(wh, "Lull Sign", [fightFoe.object]);
      const inCard = await inside.card;
      assert.deepEqual(inCard.flags[SCOPE].onFailInflicts, [{ condition: "charmed", value: null, until: "endOfNextTurn" }]);
      await resistOn(inCard, 0, 1);
      await until(() => fightFoe.actor.statuses?.has("charmed"), "Charmed in a fight");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-features                                   */
/* ------------------------------------------------------------------ */

export function witchHunterFeaturesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's class features through the real controls (wave 2a-B)", function () {
    before(async function () {
      this.timeout(60000);
      await needsClass();
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("READ THE TRAIL: a Hard result posts the GM's Learn the type, which adds the type to the Tome once", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Trail", { level: 3, known: ["undead", "beast"] });
      // On a viewed scene: the animations batch reruns this body, and a cue with no canvas is refused (`noCanvas`).
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(20);
      let trail = null;
      try {
        const posted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.trail).then(([m]) => { made.push(m); return m; });
        const sheet = await openSheet(wh);
        const feature = wh.items.find(i => i.type === "feature" && i.name === "Read the Trail");
        sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`).click();
        trail = await posted;
        await sheet.close();
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
      }
      assert.equal(trail.flags[SCOPE].trail.hardMet, true, "a natural 20 meets the Hard DC");
      assert.ok(textOf(trail).includes(game.i18n.localize("AZEROTH.WhFeature.Trail.GmCall").slice(0, 20)), "the card leaves the scene to the GM");
      const { release } = await pressCard(trail, 'button[data-action="witchHunterCard"][data-wh-press="learn"]');
      const app = await chooser({ id: trail.id, name: "Read the Trail" });
      await pick(app, game.i18n.localize("AZEROTH.CreatureType.Ooze"));
      await release();
      await until(() => wh.getFlag(SCOPE, TOME_FLAG).known.includes("ooze"), "the type learned");
      await until(() => game.messages.get(trail.id)?.flags?.[SCOPE]?.trail?.taught === "ooze", "the card marked taught");
    });

    it("EXPOSE WEAKNESS: 3 Tempo lays Vulnerable (Holy) on a Studied undead; one Immune to Holy is refused before the Tempo", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Expose", { level: 3, known: ["undead"], studied: ["undead"] });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const ghoul = await foeAt(scene, "Plagued Ghoul", 1200, 1000);
      await fill(wh, "momentum", "tempo", 5);
      const { card } = await pressUse(wh, "Expose Weakness", [ghoul.object]);
      await card;
      await until(() => ghoul.actor.effects.some(e => (e.flags?.[SCOPE]?.[VULNERABLE_FLAG]?.types ?? []).includes("holy")), "Vulnerable (Holy) laid");
      await until(() => tempoOf(wh).value === 2, "3 Tempo spent");
      assert.include(ghoul.actor.system.vulnerable, "holy");
      const warded = await foeAt(scene, "Plagued Ghoul", 1000, 1200, { "system.immune": ["holy"] });
      await fill(wh, "momentum", "tempo", 5);
      const refused = await pressUse(wh, "Expose Weakness", [warded.object]);
      assert.isNull(await refused.card, "a creature Immune to Holy is refused, and posts no card");
      assert.equal(tempoOf(wh).value, 5, "the refusal spent Tempo");
    });

    it("WHIRLING STEEL: in two hands, one Attack's Half-Action, one press a creature, no Extra Attack roll and no Tempo", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHS Whirl", { level: 9, known: ["beast"], studied: [] });
      const sword = await give(wh, "Greatsword", PACK_FOR.weapon);
      await sword.update({ "system.equipped": true });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const a = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const b = await foeAt(scene, "Defias Footpad", 900, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [a, b].map(d => ({ actorId: d.actorId, sceneId: scene.id, tokenId: d.id })));
      const mine = await freshTurn(wh, 2);
      await fill(wh, "momentum", "tempo", 5);
      const { card } = await pressUse(wh, "Whirling Steel", [a.object, b.object]);
      const posted = await card;
      assert.equal(posted.flags[SCOPE].attacks.allowed, 2, "one attack a creature");
      await until(() => tempoOf(wh).value === 2, "3 Tempo spent");
      assert.equal(mine.budget?.attacks ?? 0, 1, "Whirling Steel counts as one Attack on the turn");
      canvas.tokens.setTargets([a.id]);
      const first = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "attack").then(([m]) => { made.push(m); return m; });
      const r1 = await pressCard(posted, 'button[data-action="attackFromCard"]', { face: 20 });
      await first;
      await r1.release();
      await settle();
      assert.equal(tempoOf(wh).value, 2, "a Whirling Steel hit gave Tempo");
      const attacks = [...game.messages].filter(m => m.flags?.[SCOPE]?.kind === "attack" && m.speaker?.actor === wh.id).length;
      assert.equal(attacks, 1, "Extra Attack added a second roll to one press");
    });

    it("MEDALLION: a spell cast within 60 feet is whispered with a Warn button; the warning's Boon rides the ally's Resist on that card; the pulse counts Studied types", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHS Medallion", { level: 5, known: ["undead"], studied: ["undead"] });
      const medallion = await give(wh, "Witch hunter's medallion");
      await medallion.update({ "system.equipped": true });
      const ally = await makeCharacter({ name: "ZZ WHS Medallion Ally", classes: [["Warrior", 5]], race: "Human" });
      const mage = await makeCharacter({ name: "ZZ WHS Medallion Caster", classes: [["Mage", 5]], race: "Human", spells: ["Frostbolt"] });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: mage, x: 1400, y: 1000, side: "hostile" }]);
      await foeAt(scene, "Plagued Ghoul", 1000, 1300);
      // Out of a fight an ally is a Party member (D-755); a friendly token alone is refused as not an ally.
      await (await import("./quench-witch-hunter-common.mjs")).partyOf(wh, ally);
      const mana = mage.poolSnapshot().find(p => p.name === "mana");
      await mage.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const sensed = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.sense?.by === wh.uuid).then(([m]) => { made.push(m); return m; });
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const unpin = pinDie(15);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      let spellCard = null;
      try {
        const castDone = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "spell").then(([m]) => { made.push(m); return m; });
        await game.system.azeroth.workflows.castSpell({ actor: mage, spell: mage.items.find(i => i.name === "Frostbolt"), targets: [{ tokenId: tokenOf(ally).id, sceneId: scene.id, actorId: ally.id, name: ally.name }] });
        spellCard = await castDone;
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
      }
      const sense = await sensed;
      assert.equal(sense.flags[SCOPE].sense.spellMessageId, spellCard.id);
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const { release } = await pressCard(sense, 'button[data-action="witchHunterCard"][data-wh-press="warn"]');
      await until(() => (ally.getFlag(SCOPE, WARNED_FLAG) ?? []).some(r => r.messageId === spellCard.id), "the warning laid on the ally");
      await release();
      // The pulse: one Studied undead within 60 feet.
      const pulsed = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.pulse?.by === wh.uuid).then(([m]) => { made.push(m); return m; });
      const { card } = await pressUse(wh, "Medallion");
      await card;
      assert.equal((await pulsed).flags[SCOPE].pulse.count, 1, "the pulse counts the Studied undead");
    });

    it("DECOCTIONS: the Prepare view offers a Decoction for a type known and defeated since the last Long Rest", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHS Decoction", { level: 14, known: ["undead", "beast"], studied: ["undead"] });
      await wh.setFlag(SCOPE, TOME_FLAG, { ...wh.getFlag(SCOPE, TOME_FLAG), defeated: ["beast"], started: true });
      // The real window (wave 2d-B; the review's section E): the rest's brewing opened, Prepare pressed on the panel, the
      // Decoction's own + stepped, and its type select read - never `prepareView` called by hand.
      const { openBrewing, openPrepare } = await import("./quench-witch-hunter-common.mjs");
      await (await import("../effects/witch-hunter-brews.mjs")).chooseFormulas(wh, { picks: ["liferoot-tonic", "kingsblood-draught", "peacebloom-draught", "mageroyal-draught", "hunters-oil", "liquid-fire"] });
      await openBrewing(wh);
      const { app, sheet } = await openPrepare(wh);
      try {
        assert.ok(app.element.querySelector('[data-brew-row="decoction"]'), "the Decoction row is offered at level 14");
        app.element.querySelector('[data-action="brewStep"][data-identifier="decoction"][data-by="1"]').click();
        await until(() => app.element.querySelector('[data-brew-count="decoction"]')?.textContent?.trim() === "1", "one Decoction stepped");
        const types = [...app.element.querySelectorAll('[data-brew-select="decoctionType"] option')].map(o => o.value).filter(Boolean);
        assert.deepEqual(types, ["beast"], "the type select offers only a type known and defeated since the last Long Rest");
      } finally { await app.close(); await sheet.close(); }
    });

    it("THE LAST HUNT: Tempo capped at 10 and every Sign 1 cheaper for the minute; its end clips the Tempo to 5", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHS Last Hunt", { level: 20, known: ["undead", "beast"], studied: [] });
      // The hunter's token on a viewed scene: the animations batch reruns this body, and a cue with no token is refused
      // (`no-anchor`).
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const { card } = await pressUse(wh, "The Last Hunt");
      await card;
      const carrier = await until(() => effectsFlagged(wh, LAST_HUNT_FLAG)[0], "The Last Hunt's carrier");
      await until(() => tempoOf(wh).max === 10, "Tempo capped at 10");
      await fill(wh, "momentum", "tempo", 9);
      const energy = energyOf(wh).value;
      const rowan = await pressUse(wh, "Signs");
      await pick(await chooser(rowan.feature), SIGNS.rowan.name);
      await rowan.card;
      await until(() => energyOf(wh).value === energy - 2, "the Rowan Sign cost 1 Energy less");
      await carrier.delete();
      await until(() => tempoOf(wh).max === 5, "the cap falls back to 5");
      await until(() => (wh.system.classes?.[0]?.momentum?.value ?? 9) === 5, "the Tempo clipped to 5");
    });
  });
}
