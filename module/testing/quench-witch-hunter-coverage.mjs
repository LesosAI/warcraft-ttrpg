/**
 * **WHAT THE OTHER WITCH HUNTER BATCHES LEFT UNPRESSED** (the Witch Hunter plan's wave 2d-B; the architect review's
 * section E). One batch, run alone (`QUENCH_BATCH=azeroth-rpg.witch-hunter-coverage`), one `it` an effect, every case
 * making its own actors (`ZZ WHC ...`) and pressing the real control - the Hunter panel's Drink, Coat weapon and Throw,
 * the Gear tab's Use, the sheet's Use and its rolls, the Combat tab's attack, a card's Resist, Parry, Apply, Warn or
 * struck-back button, the board's pick, the tracker's own Next Turn - with the d20 pinned, and reading the result off
 * the actor's derived numbers, its tokens, the roll dialog's own lines and the card.
 *
 * - **The Decoction, all eight types**, each drunk through the panel and read.
 * - **The other brews**: Silvering oil and Blindweed oil at the hit, Gromsblood draught's struck-back row pressed,
 *   Mageroyal draught's refill at a turn's start, Wintersbite draught's Boons on a Reflex Test and on a Parry,
 *   Fadeleaf drops' sight on the token and its putting back, and the failures of Sungrass flash, Icecap flask and Rowan
 *   dust off the bomb card's own Resist.
 * - **The Tome and Studied on the dialog**: Field Brews' poison Boon reminder, the Tome's tracking Boon, Studied's
 *   automatic Boon on a Resist against a Studied maker, and the Tome's weakness Bane on the Ash ring's own area Test.
 * - **Greater Signs** for the Ember, Rowan, Ash and Lull Signs (the Gale Sign is the signs batch's).
 * - **The Medallion's warning Boon** read on the ally's own Resist dialog and spent by the roll.
 * - **Extra Attack**: two rolls, two cards, one Attack.
 * - **Finding 2**: Whispering (Type)'s whisper, and Blessed (Lesser) and Elixir of Demonslaying on the attack dialog.
 *
 * Needs the class, its brews, its medallion and the bestiary in the compiled packs. Written in wave 2d-B; wave 4 runs
 * it in the lead's live pass.
 */

import { cleanup, give, made, makeCharacter, openSheet, PACK_FOR, settle, untilHook } from "./fixtures.mjs";
import { castFromSheet, fightWith, freshTurn, nextTurnUntil, pressCard, sceneWith, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import {
  SCOPE, attackFrom, brewFor, energyOf, equip, fill, foeAt, hunterWith, lineMatching, needsClass, npcSwing, partyOf, plainCharacter,
  pressBrewUse, resistDialog, resistOn, throughDialog, useSign
} from "./quench-witch-hunter-common.mjs";
// The Ash ring's Region identifier is `ASH_RING_KEY` (`ash-sign`; wave 4's live run found the guessed "ash-ring").
import { ASH_RING_KEY, WARNED_FLAG } from "../rules/witch-hunter-features.mjs";
import { BREW_EFFECT_FLAG } from "../rules/witch-hunter-standing.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";

const carrierOf = (actor, identifier) => actor.effects.find(e => e.flags?.[SCOPE]?.[BREW_EFFECT_FLAG]?.identifier === identifier) ?? null;
const tokenDocOf = actor => tokenOf(actor)?.document ?? null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A Decoction for a type drunk through the Hunter panel by a level 14 hunter; the hunter and the carrier. */
async function decoctionDrunk(name, type, { school = null, known = ["undead", "beast", "humanoid", "demon", "elemental", "dragonkin", "construct", "ooze"], weapons = [] } = {}) {
  const wh = await hunterWith(name, { level: 14, known, studied: [], weapons });
  const item = await brewFor(wh, "decoction", { type, school });
  const card = await pressBrewUse(wh, item);
  if (!card) throw new Error(`the ${type} Decoction posted no card`);
  const carrier = await until(() => carrierOf(wh, "decoction"), `the ${type} Decoction's carrier`);
  await settle();
  return { wh, carrier };
}

/** A skill Test opened from the sheet's own skill list, its dialog read and closed. */
async function skillLines(actor, skill) {
  const sheet = await openSheet(actor);
  try {
    const { lines } = await throughDialog(actor, () => sheet.element.querySelector(`[data-action="rollSkill"][data-skill="${skill}"]`).click());
    return lines;
  } finally { await sheet.close(); }
}

/** A Resilience Test opened from the sheet's own chip, its dialog read and closed. */
async function resilienceLines(actor, resilience) {
  const sheet = await openSheet(actor);
  try {
    const { lines } = await throughDialog(actor, () => sheet.element.querySelector(`[data-action="rollResilience"][data-resilience="${resilience}"]`).click());
    return lines;
  } finally { await sheet.close(); }
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-coverage                                   */
/* ------------------------------------------------------------------ */

export function witchHunterCoverageBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("What the other Witch Hunter batches left unpressed (wave 2d-B)", function () {
    before(async function () {
      this.timeout(60000);
      await needsClass();
    });
    after(async function () {
      this.timeout(90000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-roll-") || app.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    /* ---------------- The Decoction, all eight types ---------------- */

    it("DECOCTION (Undead): drunk through the panel, a creature the hunter hits to 0 Health heals the hunter twice the tier", async function () {
      this.timeout(240000);
      const { wh } = await decoctionDrunk("ZZ WHC Dec Undead", "undead", { weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1100, 1000);
      await foe.actor.update({ "system.health.value": 1 });
      await wh.update({ "system.health.value": Math.max(1, wh.system.health.max - 20) });
      const before = wh.system.health.value;
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 20 });
      const { release } = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]');
      await release();
      await until(() => (foe.actor.system.health.value ?? 1) === 0, "the creature dropped to 0");
      await until(() => wh.system.health.value === before + 2 * wh.system.tier, "the hunter healed twice the tier");
    });

    it("DECOCTION (Beast): drunk through the panel, the Speed rises 10 feet and a Survival Test draws the unticked Boon", async function () {
      this.timeout(180000);
      const wh0 = await hunterWith("ZZ WHC Dec Beast Ref", { level: 14 });
      const speed = wh0.system.speed;
      const { wh } = await decoctionDrunk("ZZ WHC Dec Beast", "beast");
      await until(() => wh.system.speed === speed + 10, "Speed rises by 10 feet");
      const lines = await skillLines(wh, "survival");
      const line = lines.find(l => l.name.startsWith("line-wh-boon-") && /Decoction/.test(l.text));
      assert.ok(line, `a Survival Test draws the Decoction's Boon: ${lines.map(l => l.text).join(" | ")}`);
      assert.isFalse(line.checked, "to track is the table's call: unticked");
    });

    it("DECOCTION (Humanoid): drunk through the panel, Insight and Deception Tests take the Boon, ticked", async function () {
      this.timeout(180000);
      const { wh } = await decoctionDrunk("ZZ WHC Dec Humanoid", "humanoid");
      for (const skill of ["insight", "deception"]) {
        const lines = await skillLines(wh, skill);
        const line = lines.find(l => l.name.startsWith("line-wh-boon-") && /Decoction/.test(l.text));
        assert.ok(line?.checked, `${skill}: the Decoction's Boon, ticked: ${lines.map(l => l.text).join(" | ")}`);
      }
      const athletics = await skillLines(wh, "athletics");
      assert.notOk(athletics.some(l => l.name.startsWith("line-wh-boon-")), "no Boon on a Test the Decoction does not name");
    });

    it("DECOCTION (Demon): drunk through the panel, Ward 2 against Fel", async function () {
      this.timeout(180000);
      const wh0 = await hunterWith("ZZ WHC Dec Demon Ref", { level: 14 });
      const fel = wh0.system.ward?.fel ?? 0;
      const { wh } = await decoctionDrunk("ZZ WHC Dec Demon", "demon");
      await until(() => (wh.system.ward?.fel ?? 0) === Math.min(10, fel + 2), "Ward 2 against Fel");
      assert.equal(wh.system.ward?.fire ?? 0, wh0.system.ward?.fire ?? 0, "and no other school");
    });

    it("DECOCTION (Elemental): brewed for Frost, drunk through the panel, Ward 2 against Frost and not Fire", async function () {
      this.timeout(180000);
      const wh0 = await hunterWith("ZZ WHC Dec Elemental Ref", { level: 14 });
      const { wh } = await decoctionDrunk("ZZ WHC Dec Elemental", "elemental", { school: "frost" });
      await until(() => (wh.system.ward?.frost ?? 0) === Math.min(10, (wh0.system.ward?.frost ?? 0) + 2), "Ward 2 against the school chosen");
      assert.equal(wh.system.ward?.fire ?? 0, wh0.system.ward?.fire ?? 0, "Fire was not chosen");
    });

    it("DECOCTION (Dragonkin): drunk through the panel, 1 Armor Point on every location", async function () {
      this.timeout(180000);
      const wh0 = await hunterWith("ZZ WHC Dec Dragonkin Ref", { level: 14 });
      const { wh } = await decoctionDrunk("ZZ WHC Dec Dragonkin", "dragonkin");
      for (const location of ["body", "head", "limb"]) {
        await until(() => wh.system.ap?.[location] === (wh0.system.ap?.[location] ?? 0) + 1, `1 Armor Point on the ${location}`);
      }
    });

    it("DECOCTION (Construct): drunk through the panel, the weapon attack's card names it as 1 more Armor Point ignored", async function () {
      this.timeout(240000);
      const { wh } = await decoctionDrunk("ZZ WHC Dec Construct", "construct", { weapons: ["Longsword"], known: ["undead"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 15 });
      assert.include(textOf(card), "Decoction", "the attack's card names the Decoction's row against a creature of any type");
    });

    it("DECOCTION (Ooze): drunk through the panel, the hunter cannot be Poisoned or Diseased", async function () {
      this.timeout(180000);
      const { wh } = await decoctionDrunk("ZZ WHC Dec Ooze", "ooze");
      await until(() => ["poisoned", "diseased"].every(c => (wh.system.conditionImmunities ?? []).includes(c)), "Poisoned and Diseased refused");
      await wh.toggleStatusEffect("poisoned", { active: true }).catch(() => null);
      await settle();
      assert.notOk(wh.statuses?.has("poisoned"), "the door refuses Poisoned");
    });

    /* ---------------- The other brews ---------------- */

    it("SILVERING OIL: laid from the panel, a hit on an undead names the oil's row, and a hit on a humanoid does not", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Silvering", { weapons: ["Longsword"], known: ["beast"], studied: [] });
      const blade = await equip(wh, "Longsword");
      await pressBrewUse(wh, await brewFor(wh, "silvering-oil"));
      await until(() => wh.items.get(blade.id).getFlag(SCOPE, "whOil")?.identifier === "silvering-oil", "the oil on the blade");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const ghoul = await foeAt(scene, "Plagued Ghoul", 1100, 1000);
      const { card } = await attackFrom(wh, blade, [ghoul.object], { face: 15 });
      assert.include(textOf(card), "Silvering oil", "the undead's row names the oil");
      await sleep(1500);
      const man = await foeAt(scene, "Defias Footpad", 900, 1000);
      const { card: other } = await attackFrom(wh, blade, [man.object], { face: 15 });
      assert.notInclude(textOf(other), "Silvering oil", "a humanoid is neither undead nor a demon");
    });

    it("BLINDWEED OIL: laid from the panel, a hit lays a Bane on the creature's next Casting Test", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Blindweed", { weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      await pressBrewUse(wh, await brewFor(wh, "blindweed-oil"));
      await until(() => wh.items.get(blade.id).getFlag(SCOPE, "whOil")?.identifier === "blindweed-oil", "the oil on the blade");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      await attackFrom(wh, blade, [foe.object], { face: 20 });
      const laid = await until(() => foe.actor.effects.find(e => e.flags?.[SCOPE]?.[LAID_BANE_FLAG]), "a Bane laid on the creature");
      assert.equal(laid.flags[SCOPE][LAID_BANE_FLAG].kind, "casting", "on its next Casting Test");
    });

    it("GROMSBLOOD DRAUGHT: drunk from the panel, a melee hit on the hunter offers the struck-back row, and its button deals the tier to the attacker", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Gromsblood");
      await pressBrewUse(wh, await brewFor(wh, "gromsblood-draught"));
      await until(() => carrierOf(wh, "gromsblood-draught"), "the draught acts");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1100, 1000);
      const attack = await npcSwing(foe.actor, tokenOf(wh), 20);
      assert.include(textOf(attack), "Gromsblood draught", "the card's struck-back row names the draught");
      const before = foe.actor.system.health.value;
      const { release } = await pressCard(attack, 'button[data-action="applyDamage"][data-self="1"]');
      await release();
      await until(() => foe.actor.system.health.value < before, "the attacker took the struck-back damage");
    });

    it("ENERGY REFILLS 2 A TURN for a Witch Hunter (the lead, 2026-11-27), not the 3 other classes' Energy refills", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Energy Two");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1600, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await nextTurnUntil(foe.actor, combat);
      await fill(wh, "power", "energy", 0);
      await nextTurnUntil(wh, combat);
      await until(() => energyOf(wh).value === 2, `2 at the turn's start, read ${energyOf(wh).value}`);
    });

    it("MAGEROYAL DRAUGHT: drunk from the panel, the hunter's Energy refills 2 and 2 more at the start of its turn", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Mageroyal");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1600, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await pressBrewUse(wh, await brewFor(wh, "mageroyal-draught"));
      await until(() => carrierOf(wh, "mageroyal-draught"), "the draught acts");
      await nextTurnUntil(foe.actor, combat);
      await fill(wh, "power", "energy", 0);
      await nextTurnUntil(wh, combat);
      await until(() => energyOf(wh).value === 4, "2 and 2 more at the turn's start");
    });

    it("WINTERSBITE DRAUGHT: drunk from the panel, a Reflex Test and a Parry each draw its Boon, ticked", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Wintersbite", { weapons: ["Longsword"] });
      await equip(wh, "Longsword");
      await pressBrewUse(wh, await brewFor(wh, "wintersbite-draught"));
      await until(() => carrierOf(wh, "wintersbite-draught"), "the draught acts");
      const reflex = await resilienceLines(wh, "reflex");
      assert.ok(reflex.find(l => l.name.startsWith("line-wh-boon-") && /Wintersbite/.test(l.text))?.checked, `a Reflex Test's Boon: ${reflex.map(l => l.text).join(" | ")}`);
      const body = await resilienceLines(wh, "body");
      assert.notOk(body.some(l => l.name.startsWith("line-wh-boon-") && /Wintersbite/.test(l.text)), "a Body Test takes none");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      // A Parry is paid in Tempo (02 §7), so the card offers none to a hunter holding 0 (wave 4's live run); 1 Tempo, as
      // the talents batch's Steel Guard holds before its swing.
      await fill(wh, "momentum", "tempo", 1);
      const attack = await npcSwing(foe.actor, tokenOf(wh), 14);
      const { lines } = await throughDialog(wh, async () => {
        await pressCard(attack, 'button[data-action="reactParry"][data-target-index="0"]', { skip: false });
      });
      assert.ok(lines.find(l => l.name.startsWith("line-wh-boon-") && /Wintersbite/.test(l.text))?.checked, `the Parry's Boon: ${lines.map(l => l.text).join(" | ")}`);
    });

    it("FADELEAF DROPS: drunk from the panel, the hunter's token sees in darkness to 60 feet, and a Silverleaf tonic puts its own sight back", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Fadeleaf");
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await pressBrewUse(wh, await brewFor(wh, "fadeleaf-drops"));
      await until(() => tokenDocOf(wh)?.sight?.range === 60 && tokenDocOf(wh)?.sight?.visionMode === "darkvision", "darkness sight to 60 feet on the token");
      assert.equal(wh.prototypeToken.sight.range, 60, "and on the prototype");
      await pressBrewUse(wh, await brewFor(wh, "silverleaf-tonic"));
      await until(() => !carrierOf(wh, "fadeleaf-drops"), "Silverleaf ends the drops");
      await until(() => tokenDocOf(wh)?.sight?.range === 0 && tokenDocOf(wh)?.sight?.visionMode === "basic", "the token's own sight put back");
    });

    for (const [id, condition, damages] of [["sungrass-flash", "blinded", false], ["icecap-flask", "entangled", true], ["rowan-dust", "silenced", false]]) {
      it(`${id.toUpperCase()}: thrown from the panel, the creature's failed Resist on the bomb's card lays ${condition}${damages ? ", and its Apply deals Frost" : ""}`, async function () {
        this.timeout(240000);
        const wh = await hunterWith(`ZZ WHC ${id}`);
        const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
        const foe = await foeAt(scene, "Kobold", 1200, 1000);
        const card = await pressBrewUse(wh, await brewFor(wh, id), { targets: [foe.object] });
        assert.ok(card, "the bomb's card");
        assert.deepEqual((card.flags[SCOPE].onFailInflicts ?? []).map(i => i.condition), [condition], `the card's failure lays ${condition}`);
        await resistOn(card, 0, 1);
        await until(() => foe.actor.statuses?.has(condition), `${condition} on a failure`);
        if (damages) {
          const before = foe.actor.system.health.value;
          const { release } = await pressCard(game.messages.get(card.id), 'button[data-action="applyDamage"][data-target-index="0"]');
          await release();
          await until(() => foe.actor.system.health.value < before, "the Frost damage landed");
        }
      });
    }

    /* ---------------- The Tome and Studied on the dialog ---------------- */

    it("FIELD BREWS: a Body Resilience Test from the sheet draws the unticked Boon against poison and disease", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHC Field Brews Boon");
      const lines = await resilienceLines(wh, "body");
      const line = lineMatching(lines, /Field Brews/);
      assert.ok(line, `the dialog draws Field Brews' Boon: ${lines.map(l => l.text).join(" | ")}`);
      assert.isFalse(line.checked, "what the Test is against is the table's: unticked");
    });

    it("TOME OF SILVER AND ASH: a Survival Test from the sheet draws the unticked Boon to track, find or recall a type known", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHC Tome Boon");
      const lines = await skillLines(wh, "survival");
      const line = lineMatching(lines, /Tome of Silver and Ash/);
      assert.ok(line, `the dialog draws the Tome's Boon: ${lines.map(l => l.text).join(" | ")}`);
      assert.isFalse(line.checked, "whether the quarry is of a type known is the table's: unticked");
    });

    it("STUDIED: a hunter resisting another's Gale Sign, its maker a Studied Humanoid, takes the automatic Boon on the Resist's own dialog", async function () {
      this.timeout(240000);
      const maker = await hunterWith("ZZ WHC Studied Maker", { known: ["undead"], studied: ["undead"] });
      const wh = await hunterWith("ZZ WHC Studied Resister", { known: ["undead", "humanoid"], studied: ["humanoid"] });
      await sceneWith([{ actor: maker, x: 1000, y: 1000 }, { actor: wh, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(maker, "Signs", "gale", { aim: { x: 1600, y: 1050 } });
      const index = (card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(wh).id);
      assert.isAtLeast(index, 0, "the cone gathered the resister");
      const { lines } = await resistDialog(card, `button[data-action="resistTest"][data-target-index="${index}"]`, wh);
      const boon = lines.find(l => l.name === "line-talentBoon");
      assert.ok(boon?.checked, `an automatic Boon: ${lines.map(l => l.text).join(" | ")}`);
      assert.include(boon.text, game.i18n.localize("AZEROTH.WitchHunter.Studied.Label"), "named Studied");
    });

    it("ASH SIGN: a Demon of a type the hunter knows starting its turn in the ring takes the Tome's weakness Bane on the area Test's own dialog", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WHC Ash Weakness", { level: 9, known: ["undead", "demon"], studied: [] });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const demon = await foeAt(scene, "Bleakheart Shadowstalker", 1300, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: demon.actorId, sceneId: scene.id, tokenId: demon.id }]);
      await freshTurn(wh, 2);
      await (await useSign(wh, "Ash Sign", "ash", { point: { x: 1350, y: 1050 } }));
      const ring = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.identifier === ASH_RING_KEY && r.flags?.[SCOPE]?.caster === wh.uuid), "the ring placed");
      assert.deepEqual(ring.flags[SCOPE].areaTick.checks[0].whWeakness?.types, ["demon"], "the ring's check row carries the weakness for the Demon row");
      const test = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.area?.regionId === ring.id).then(([m]) => { made.push(m); return m; });
      await nextTurnUntil(demon.actor, combat);
      const card = await test;
      const { lines } = await resistDialog(card, 'button[data-action="resistTest"][data-purpose="area"]', demon.actor);
      const bane = lines.find(l => l.name === "line-talentBane");
      assert.ok(bane?.checked, `the area Test's dialog carries the Bane: ${lines.map(l => l.text).join(" | ")}`);
      assert.include(bane.text, "Tome of Silver and Ash", "named for the Tome");
    });

    /* ---------------- Greater Signs ---------------- */

    it("GREATER SIGNS (Ember): the Empowered Ember Sign's card lays Scorched 2 and deals 2 plus twice the tier", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHC Greater Ember", { level: 17 });
      const target = await plainCharacter("ZZ WHC Greater Ember Target");
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: target, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(wh, "Signs", "ember", { aim: { x: 1600, y: 1050 }, empower: true });
      assert.equal(card.flags[SCOPE].whSign.empowered, true);
      assert.deepEqual((card.flags[SCOPE].onFailInflicts ?? []).map(i => [i.condition, i.value]), [["scorched", 2]], "Scorched 2 instead");
      const index = (card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(target).id);
      const t = wh.system.tier;
      assert.equal(card.flags[SCOPE].damageByTarget[index].damage, Math.max(0, 2 + t + t - (target.system.ward?.fire ?? 0)), "the damage rises by the tier");
    });

    it("GREATER SIGNS (Rowan): the Empowered Rowan Sign gives temporary Health equal to the Intelligence modifier beside the Ward", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHC Greater Rowan", { level: 17 });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await (await useSign(wh, "Signs", "rowan", { empower: true }));
      await until(() => (wh.system.ward?.fire ?? 0) >= Math.min(10, wh.system.tier), "the Ward laid");
      await until(() => (wh.system.health.temp ?? 0) === Math.max(0, wh.system.abilities.int.mod), "temporary Health equal to the Intelligence modifier");
    });

    it("GREATER SIGNS (Ash): the Empowered Ash ring is a 20 ft radius that lasts 10 minutes", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHC Greater Ash", { level: 17 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await (await useSign(wh, "Ash Sign", "ash", { point: { x: 1200, y: 1000 }, empower: true }));
      const ring = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.identifier === ASH_RING_KEY && r.flags?.[SCOPE]?.caster === wh.uuid), "the ring placed");
      assert.equal(ring.shapes[0]?.radius, 20 * (scene.grid.size / scene.grid.distance), "a 20 ft radius");
      assert.equal(ring.flags[SCOPE].lasts?.rounds, 100, "10 minutes of rounds");
    });

    it("GREATER SIGNS (Lull): the Empowered Lull Sign takes two creatures, or one for 1 minute", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHC Greater Lull", { level: 17 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const a = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const b = await foeAt(scene, "Defias Footpad", 1000, 1100);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [a, b].map(d => ({ actorId: d.actorId, sceneId: scene.id, tokenId: d.id })));
      await freshTurn(wh, 2);
      const two = await (await useSign(wh, "Lull Sign", "lull", { targets: [a.object, b.object], empower: true }));
      assert.equal((two.flags[SCOPE].targets ?? []).length, 2, "two creatures on the card");
      assert.equal(two.flags[SCOPE].onFailInflicts?.[0]?.until, "endOfNextTurn", "each until the end of its next turn");
      await freshTurn(wh, 2);
      await fill(wh, "power", "energy", energyOf(wh).max);
      const one = await (await useSign(wh, "Lull Sign", "lull", { targets: [a.object], empower: true }));
      assert.equal(one.flags[SCOPE].onFailInflicts?.[0]?.until, "minute", "one creature for 1 minute");
      await resistOn(one, 0, 1);
      const charmed = await until(() => a.actor.effects.find(e => e.statuses?.has("charmed")), "Charmed on a failure");
      assert.ok(charmed.duration?.value || charmed.duration?.rounds || charmed.duration?.seconds, "spanned for the minute");
    });

    /* ---------------- The Medallion's warning, spent ---------------- */

    it("MEDALLION WARNING: the ally's own Resist dialog on the warned spell carries the Boon, and the roll spends it", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WHC Medallion", { level: 5, known: ["undead"], studied: ["undead"] });
      const medallion = await give(wh, "Witch hunter's medallion");
      await medallion.update({ "system.equipped": true });
      const ally = await plainCharacter("ZZ WHC Medallion Ally");
      const mage = await makeCharacter({ name: "ZZ WHC Medallion Caster", classes: [["Mage", 5]], race: "Human", spells: ["Frost Nova"] });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: mage, x: 1200, y: 1000, side: "hostile" }]);
      // Out of a fight an ally is a Party member (D-755); a friendly token alone is refused as not an ally.
      await partyOf(wh, ally);
      const mana = mage.poolSnapshot().find(p => p.name === "mana");
      await mage.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const sensed = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.sense?.by === wh.uuid).then(([m]) => { made.push(m); return m; });
      const spell = await castFromSheet(mage, "Frost Nova", { targets: [tokenOf(ally)], face: 18 });
      assert.ok(spell, "the spell's card");
      const sense = await sensed;
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const { release } = await pressCard(sense, 'button[data-action="witchHunterCard"][data-wh-press="warn"]');
      const warned = await until(() => (ally.getFlag(SCOPE, WARNED_FLAG) ?? []).find(r => r.messageId === spell.id), "the warning laid on the ally");
      await release();
      canvas.tokens.setTargets([]);
      const index = (spell.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(ally).id);
      assert.isAtLeast(index, 0, "the spell names the ally");
      const { lines, card } = await resistDialog(spell, `button[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`, ally, { roll: true, face: 15 });
      const boon = lines.find(l => l.name === "line-talentBoon");
      assert.ok(boon?.checked, `the ally's Resist carries the warning's Boon: ${lines.map(l => l.text).join(" | ")}`);
      assert.include(boon.text, warned.name, "named for the warning");
      assert.ok(card, "the Resist was rolled");
      await until(() => !(ally.getFlag(SCOPE, WARNED_FLAG) ?? []).some(r => r.messageId === spell.id), "the roll spent the warning");
    });

    /* ---------------- Extra Attack ---------------- */

    it("EXTRA ATTACK: at level 5 one Attack from the Combat tab posts two cards, the second marked as the second roll", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHC Extra Attack", { level: 5, weapons: ["Longsword"] });
      assert.ok(wh.items.some(i => i.type === "feature" && i.name === "Extra Attack"), "Extra Attack granted at level 5");
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { card, second } = await attackFrom(wh, blade, [foe.object], { face: 12 });
      assert.ok(card, "the first roll's card");
      assert.ok(second, "the second roll's card");
      assert.include(textOf(second), game.i18n.localize("AZEROTH.Attack.SecondRoll"), "the second card says it is the second roll");
      assert.notInclude(textOf(card), game.i18n.localize("AZEROTH.Attack.SecondRoll"), "the first does not");
    });

    /* ---------------- Finding 2: type rules as lines and senses ---------------- */

    it("WHISPERING (TYPE): a Warrior wielding a Whispering (Undead) blade is whispered the undead placed within 100 feet", async function () {
      this.timeout(180000);
      const warrior = await makeCharacter({ name: "ZZ WHC Whispering", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
      const blade = warrior.items.find(i => i.type === "weapon" && i.name === "Longsword");
      await blade.update({ "system.traits": [...(blade.system.traits ?? []), "Whispering (Undead) (Lesser)"], "system.equipped": true });
      const scene = await sceneWith([{ actor: warrior, x: 1000, y: 1000 }]);
      const whispered = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.whispering?.by === warrior.uuid
        && (m.flags[SCOPE].whispering.reading ?? []).some(r => r.type === "undead" && r.found)).then(([m]) => { made.push(m); return m; });
      await foeAt(scene, "Plagued Ghoul", 1400, 1000);
      const card = await whispered;
      const row = card.flags[SCOPE].whispering.reading.find(r => r.type === "undead");
      assert.equal(row.grade, "lesser");
      assert.isAtMost(row.feet, 100, "within the Lesser grade's 100 feet");
    });

    it("BLESSED (LESSER): the attack dialog ticks the Boon against an undead, and draws none against a humanoid", async function () {
      this.timeout(180000);
      const warrior = await makeCharacter({ name: "ZZ WHC Blessed", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
      const blade = warrior.items.find(i => i.type === "weapon" && i.name === "Longsword");
      await blade.update({ "system.traits": [...(blade.system.traits ?? []), "Blessed (Lesser)"], "system.equipped": true });
      const scene = await sceneWith([{ actor: warrior, x: 1000, y: 1000 }]);
      const ghoul = await foeAt(scene, "Plagued Ghoul", 1100, 1000);
      const man = await foeAt(scene, "Defias Footpad", 900, 1000);
      const { lines } = await attackFrom(warrior, warrior.items.get(blade.id), [ghoul.object], { roll: false });
      assert.ok(lines.find(l => l.name === "line-type-boon-blessed-lesser")?.checked, `the Boon against an undead: ${lines.map(l => l.name).join(", ")}`);
      const { lines: other } = await attackFrom(warrior, warrior.items.get(blade.id), [man.object], { roll: false });
      assert.notOk(other.some(l => l.name === "line-type-boon-blessed-lesser"), "no line against a humanoid");
    });

    it("ELIXIR OF DEMONSLAYING: used from the Gear tab, the attack dialog ticks the Boon against a demon", async function () {
      this.timeout(180000);
      const warrior = await makeCharacter({ name: "ZZ WHC Demonslaying", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
      const blade = warrior.items.find(i => i.type === "weapon" && i.name === "Longsword");
      await blade.update({ "system.equipped": true });
      const elixir = await give(warrior, "Elixir of Demonslaying", PACK_FOR.equipment);
      const sheet = await openSheet(warrior);
      try {
        const control = sheet.element.querySelector(`[data-item-id="${elixir.id}"] [data-action="useGear"]`);
        assert.ok(control, "the Gear tab draws a Use for the elixir");
        control.click();
      } finally { await sheet.close(); }
      await until(() => warrior.effects.size > 0 && [...warrior.effects].some(e => /Demonslaying/.test(e.name ?? "")), "the elixir's carrier");
      const scene = await sceneWith([{ actor: warrior, x: 1000, y: 1000 }]);
      const demon = await foeAt(scene, "Bleakheart Shadowstalker", 1100, 1000);
      const { lines } = await attackFrom(warrior, warrior.items.get(blade.id), [demon.object], { roll: false });
      assert.ok(lines.find(l => l.name === "line-type-boon-demonslaying")?.checked, `the Boon against a demon: ${lines.map(l => l.name).join(", ")}`);
    });

    it("SHEET CONTROL GUARD: every Witch Hunter control this batch presses is drawn on the sheet", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHC Controls", { level: 9 });
      const sheet = await openSheet(wh);
      try {
        const combat = sheet.element.querySelector('section[data-tab="combat"]');
        for (const sel of ['[data-action="useManeuver"][data-maneuver="sunder"]', '[data-action="stealth"]', "[data-wh-toxicity]", '[data-wh-dc="spell"]']) {
          assert.ok(combat.querySelector(sel), `the Combat tab draws ${sel}`);
        }
        for (const name of ["Signs", "Ash Sign", "Expose Weakness", "Whirling Steel", "Medallion"]) {
          const feature = wh.items.find(i => i.type === "feature" && i.name === name);
          assert.ok(feature && sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`), `a Use for ${name}`);
        }
      } finally { await sheet.close(); }
    });
  });
}
