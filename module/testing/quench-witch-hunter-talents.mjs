/**
 * **THE WITCH HUNTER'S FORTY-EIGHT TALENTS, THROUGH THE REAL CONTROLS** (04-TALENTS' Wolf, Gryphon, Bear and Cat; the
 * Witch Hunter plan's wave 2b, D-2080 to D-2094; made real in wave 2d-B against the architect review's B1 to B5).
 * One batch, run alone (`QUENCH_BATCH=azeroth-rpg.witch-hunter-talents`), one case a talent (a few talents two), every
 * case making its own Human Witch Hunter (`ZZ WHT ...`) with the talent taken at its rank and pressing what a player
 * presses - the Hunter panel's Prepare, its steppers and its Use, the sheet's Use for a Sign or a talent's grant, a
 * maneuver's Use, the Combat tab's attack and its dialog's lines, a card's Resist, Parry, Apply, extra attack or step,
 * a token walked on the board - with the d20 pinned through `fixtures.mjs#pinDie`, and reads the RESULT off the actor,
 * the token, the dialog and the card. Where a rank is the point, the case compares the talent at two ranks on the same
 * actor, so an assertion fails if the rank does nothing.
 *
 * The shapes read are the doors' own (wave 2d-B read each one): a bomb card's `flags.area` is `rules/areas.mjs#areaFor`
 * (`{shape: "circle", distanceFt}`); an elixir's carrier takes `durations.mjs#spellTiming`'s `{duration: {value,
 * units}}` and carries the stamped brew whose `use.duration` Lasting Brews widened; Firestream's Region carries
 * `firestreamTick`'s `areaTick` and `lasts.rounds`; Leaping Strike's promise is `next-attack.mjs#nextAttackEntry`'s
 * `{source, damage}`; a talent's damage line is `line-talent-damage-<identifier>` (`talent-effects.mjs#damageLinesFor`),
 * a judgement line `line-talent-<identifier>` (`witch-hunter-talents.mjs#whDialogLines`), the Resist's named Boon and
 * Bane `line-talentBoon` and `line-talentBane` (`rules/modifiers.mjs`); the Parry is the card's `reactParry`.
 *
 * Needs the class, its talents and its brews in the compiled packs (`packs:parse`, then `packs:build` through the
 * harness). Run in the lead's live pass (wave 4), not before.
 */

import { cleanup, made, openSheet, pinDie, settle, untilHook } from "./fixtures.mjs";
import { chooser, fightWith, freshTurn, nextTurnUntil, pick, pressCard, pressUse, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import {
  SCOPE, TIER2_FORMULAS, atRank, attackFrom, brewFor, brewsHeld, energyOf, equip, fill, foeAt, hunterWith, lineMatching, needsClass,
  npcSwing, openBrewing, openPrepare, pickSign, plainCharacter, pressBoard, pressBrewUse, pressManeuver, resistDialog, resistOn, tempoOf,
  throughDialog, useSign, wear
} from "./quench-witch-hunter-common.mjs";
import { AZEROTH } from "../config.mjs";
import { pickState } from "../canvas/place.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { signCost, whirlingSteelCost } from "../rules/witch-hunter-features.mjs";
import { BREW_EFFECT_FLAG, TOME_FLAG } from "../rules/witch-hunter-standing.mjs";
import { FIRESTREAM, MOUNTAIN_BEAR_FLAG, UNBOWED, WH_BREW_LOG_FLAG } from "../rules/witch-hunter-talents.mjs";
import { NEXT_ATTACK_FLAG } from "../rules/next-attack.mjs";
import { toxicityLimit } from "../rules/toxicity.mjs";

const carrierOf = (actor, identifier) => actor.effects.find(e => e.flags?.[SCOPE]?.[BREW_EFFECT_FLAG]?.identifier === identifier) ?? null;

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-talents                                    */
/* ------------------------------------------------------------------ */

export function witchHunterTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's forty-eight talents through the real controls (wave 2b, made real in 2d-B)", function () {
    before(async function () {
      this.timeout(60000);
      await needsClass();
    });
    after(async function () {
      this.timeout(60000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-brew-prepare-") || app.id?.startsWith("azeroth-roll-")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    /* ---------------- Wolf ---------------- */

    it("EXTRA MEASURE: the Prepare window offers 2 + Wisdom + 2 doses at rank 2, and its + greys once they are spent", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Extra Measure", { ranks: { "extra-measure": 2 }, formulas: TIER2_FORMULAS });
      const wis = wh.system.abilities.wis.mod;
      const want = Math.max(2, 2 + wis) + 2;
      await openBrewing(wh);
      const { app, sheet } = await openPrepare(wh);
      const doses = () => app.element.querySelector(".azeroth-brew-doses").textContent.trim();
      try {
        assert.equal(doses(), game.i18n.format("AZEROTH.WitchHunter.Prepare.Doses", { used: 0, doses: want, left: want }), "2 + Wisdom + 2 doses");
        await atRank(wh, "extra-measure", 0);
        await app.render();
        assert.equal(doses(), game.i18n.format("AZEROTH.WitchHunter.Prepare.Doses", { used: 0, doses: want - 2, left: want - 2 }), "at rank 0 the doses fall by 2");
        await atRank(wh, "extra-measure", 2);
        await app.render();
        const plus = () => app.element.querySelector('[data-action="brewStep"][data-identifier="liferoot-tonic"][data-by="1"]');
        for (let n = 1; n <= want; n++) {
          plus().click();
          await until(() => app.element.querySelector('[data-brew-count="liferoot-tonic"]')?.textContent?.trim() === String(n), `${n} doses stepped`);
        }
        assert.isTrue(plus().disabled, "the + greys with no dose left");
      } finally { await app.close(); await sheet.close(); }
    });

    it("POTENT BREWS: a Peacebloom draught drunk from the panel restores 2 more at rank 2 than at rank 0", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Potent", { ranks: { "potent-brews": 2 } });
      const healed = async () => {
        await wh.update({ "system.health.value": 1 });
        await until(() => wh.system.health.value === 1, "Health set to 1");
        const item = await brewFor(wh, "peacebloom-draught");
        await pressBrewUse(wh, item);
        await until(() => wh.system.health.value > 1, "the draught's Health");
        await settle();
        const got = wh.system.health.value - 1;
        const carrier = carrierOf(wh, "peacebloom-draught");
        if (carrier) await carrier.delete();
        return got;
      };
      const at2 = await healed();
      await atRank(wh, "potent-brews", 0);
      const at0 = await healed();
      assert.equal(at2 - at0, 2, `rank 2 restored ${at2}, rank 0 ${at0}`);
    });

    it("PRACTICED HANDS: in a fight, an elixir from the panel spends no Half-Action once a round", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Practiced", { ranks: { "practiced-hands": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1400, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const mine = await freshTurn(wh, 2);
      const a = await brewFor(wh, "kingsblood-draught");
      const card = await pressBrewUse(wh, a);
      assert.include(card.content, "Practiced Hands", "the card names the talent");
      assert.equal(mine.budget.halfActions, 2, "no Half-Action spent");
      const b = await brewFor(wh, "goldthorn-draught");
      await pressBrewUse(wh, b);
      await until(() => mine.budget.halfActions === 1, "the second brew this round pays its Half-Action");
    });

    it("SHARPER OILS: a Hunter's oil laid from the panel stamps 2 more damage at rank 2", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Sharper", { ranks: { "sharper-oils": 2 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const item = await brewFor(wh, "hunters-oil", { type: "humanoid" });
      await pressBrewUse(wh, item);
      const oil = await until(() => wh.items.get(blade.id).getFlag(SCOPE, "whOil"), "the oil laid");
      const base = wh.system.tier >= 3 ? 2 : 1;
      assert.equal(oil.coating.damage, base + 2, "the type oil's damage with 2 more");
    });

    it("FIELD NOTES: the Hunter panel's Learn a type opens after a Short Rest at rank 2, and its dialog carries the Boon", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Field Notes", { ranks: { "field-notes": 2 }, known: ["undead"], studied: ["undead"] });
      await wh.setFlag(SCOPE, TOME_FLAG, { known: ["undead"], studied: ["undead"], damaged: ["beast"], defeated: [], learned: false, learnOpen: "short", started: true });
      const sheet = await openSheet(wh);
      try {
        const control = sheet.element.querySelector('section[data-tab="combat"] [data-action="whLearn"]');
        assert.ok(control, "a Short Rest's learning chance draws Learn a type on the panel");
        const { lines } = await throughDialog(wh, () => control.click(), { roll: true, face: 20 });
        assert.ok(lineMatching(lines, /Field Notes/), `the dialog carries Field Notes' Boon: ${lines.map(l => l.text).join(" | ")}`);
      } finally { await sheet.close(); }
      await until(() => (wh.getFlag(SCOPE, TOME_FLAG)?.known ?? []).includes("beast"), "the Short Rest's Test taught the type");
    });

    it("WIDE BLAST: a bomb's card lays a 15 ft circle and says it is thrown up to 40 feet at rank 1", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Wide", { ranks: { "wide-blast": 1 } });
      const item = await brewFor(wh, "sungrass-flash");
      const card = await pressBrewUse(wh, item);
      assert.equal(card.flags[SCOPE].area?.shape, "circle", "the blast is a circle");
      assert.equal(card.flags[SCOPE].area?.distanceFt, 15, "the radius 10 + 5");
      const doc = new DOMParser().parseFromString(card.content, "text/html").body.textContent.replace(/\s+/g, " ");
      assert.include(doc, game.i18n.format("AZEROTH.WitchHunter.Bomb.Reach", { range: 40, radius: 15 }), "the reach 30 + 10 in words");
    });

    it("LASTING BREWS: a Kingsblood draught drunk lasts 3 minutes at rank 2", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Lasting", { ranks: { "lasting-brews": 2 } });
      const item = await brewFor(wh, "kingsblood-draught");
      await pressBrewUse(wh, item);
      const carrier = await until(() => carrierOf(wh, "kingsblood-draught"), "the elixir's carrier");
      assert.deepEqual(carrier.flags[SCOPE][BREW_EFFECT_FLAG].use.duration, { value: 3, units: "minutes" }, "the stamped span: 1 minute and 2 more");
      assert.equal(carrier.duration?.value, 3, "the carrier's own span out of a fight (`spellTiming`)");
      assert.equal(carrier.duration?.units, "minutes");
    });

    it("FOREWARNED: the Prepare window takes 3 Studied types at rank 2, and refuses the third in words at rank 0", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Forewarned", { ranks: { forewarned: 2 }, formulas: TIER2_FORMULAS, known: ["undead", "beast", "humanoid"], studied: ["humanoid"] });
      await openBrewing(wh);
      const { app, sheet } = await openPrepare(wh);
      try {
        const count = Math.max(1, Math.floor(wh.system.abilities.wis.mod / 2)) + 2;
        assert.include(app.element.querySelector(".azeroth-brew-studied legend").textContent, String(count), "the legend names the count with Forewarned");
        for (const type of ["undead", "beast", "humanoid"]) {
          const box = app.element.querySelector(`input[data-brew-studied][value="${type}"]`);
          assert.ok(box, `a Studied checkbox for ${type}`);
          if (!box.checked) {
            box.checked = true;
            box.dispatchEvent(new Event("change", { bubbles: true }));
          }
          await until(() => app.state.studied.includes(type), `${type} ticked`);
        }
        const tooMany = game.i18n.format("AZEROTH.WitchHunter.Prepare.Refuse.studied.tooMany", { name: wh.name, reason: "" });
        assert.notInclude(app.element.querySelector("[data-brew-reason]").textContent, tooMany, "three Studied at rank 2 are allowed");
        await atRank(wh, "forewarned", 0);
        await app.render();
        await until(() => app.element.querySelector("[data-brew-reason]")?.textContent?.includes(tooMany), "at rank 0 the third is refused in words");
        assert.isTrue(app.element.querySelector(".azeroth-brew-submit").disabled, "and Brew greys");
      } finally { await app.close(); await sheet.close(); }
    });

    it("CLUSTER BOMB: after a bomb this turn, the second thrown from the panel spends no Half-Action", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Cluster", { ranks: { "cluster-bomb": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1000, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const mine = await freshTurn(wh, 2);
      const first = await brewFor(wh, "sungrass-flash");
      await pressBrewUse(wh, first, { targets: [foe.object] });
      await until(() => mine.budget.halfActions === 1, "the first bomb pays its Half-Action");
      const second = await brewFor(wh, "liquid-fire");
      const card = await pressBrewUse(wh, second, { targets: [foe.object] });
      assert.include(card.content, "Cluster Bomb", "the card names the talent");
      assert.equal(mine.budget.halfActions, 1, "the second bomb spends none");
    });

    it("REFINED DECOCTIONS: a Decoction drunk through the panel leaves the Toxicity bar at 0 used at rank 1, and 1 at rank 0", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Refined", { ranks: { "refined-decoctions": 1 }, level: 14 });
      const item = await brewFor(wh, "decoction", { type: "beast" });
      await pressBrewUse(wh, item);
      await until(() => carrierOf(wh, "decoction"), "the Decoction acts");
      const limit = toxicityLimit(wh.system.abilities.con.mod);
      const bar = async () => {
        const sheet = await openSheet(wh);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          return (sheet.element.querySelector('section[data-tab="combat"] [data-wh-toxicity] .azeroth-pool-count')?.textContent ?? "").replace(/\s+/g, " ").trim();
        } finally { await sheet.close(); }
      };
      assert.equal(await bar(), `0 / ${limit}`, "Refined Decoctions counts the Decoction as none");
      await atRank(wh, "refined-decoctions", 0);
      assert.equal(await bar(), `1 / ${limit}`, "without it the Decoction counts one");
    });

    it("SEASONED BLOOD: the Hunter panel's Toxicity limit reads 1 more", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Seasoned", { ranks: { "seasoned-blood": 1 } });
      const sheet = await openSheet(wh);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const limit = toxicityLimit(wh.system.abilities.con.mod, { seasonedBlood: 1 });
        const count = sheet.element.querySelector('section[data-tab="combat"] [data-wh-toxicity] .azeroth-pool-count')?.textContent ?? "";
        assert.equal(count.replace(/\s+/g, " ").trim(), `0 / ${limit}`, "the Hunter panel's Toxicity limit with 1 more");
        assert.equal(limit, toxicityLimit(wh.system.abilities.con.mod) + 1);
      } finally { await sheet.close(); }
    });

    it("SECOND BREWING: the Use restores an elixir drunk to the last from the brewing's own record", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Second Brewing", { ranks: { "refined-decoctions": 1, "second-brewing": 1 }, level: 20 });
      await wh.setFlag(SCOPE, WH_BREW_LOG_FLAG, { generation: 0, rows: [{ identifier: "peacebloom-draught", doses: 2, type: null, school: null, name: "" }, { identifier: "liquid-fire", doses: 1, type: null, school: null, name: "" }] });
      const { card } = await pressUse(wh, "Second Brewing");
      await card;
      const restored = await until(() => brewsHeld(wh).find(i => i.system.identifier === "peacebloom-draught"), "the Peacebloom draught back");
      assert.equal(restored.system.quantity, 2, "the doses brewed");
      assert.notOk(brewsHeld(wh).some(i => i.system.identifier === "liquid-fire"), "a bomb is never restored");
    });

    /* ---------------- Gryphon ---------------- */

    it("FAR SIGNS: the Gale Sign's cone reaches 25 ft at rank 2", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Far Signs", { ranks: { "far-signs": 2 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const far = await foeAt(scene, "Defias Footpad", 1450, 1000);
      const card = await useSign(wh, "Signs", "gale", { aim: { x: 1600, y: 1050 } });
      assert.include((card.flags[SCOPE].targets ?? []).map(t => t.tokenId), far.id, "the creature 20 ft off was gathered by the 25 ft cone");
    });

    it("SEARING SCRIPT: the Ember Sign's card deals 2 more at rank 2 to a creature with no Ward", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Searing", { ranks: { "searing-script": 2 } });
      const target = await plainCharacter("ZZ WHT Searing Target");
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: target, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(wh, "Signs", "ember", { aim: { x: 1600, y: 1050 } });
      const ward = target.system.ward?.fire ?? 0;
      const row = (card.flags[SCOPE].damageByTarget ?? [])[(card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(target).id)];
      assert.ok(row, "the target was gathered");
      assert.equal(row.damage, Math.max(0, 2 + wh.system.tier + 2 - ward), "2 + tier + 2, less the Fire Ward");
    });

    it("QUICK SCRIPT: the turn's first Sign costs 2 less Energy at rank 2", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Quick", { ranks: { "quick-script": 2 } });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await fill(wh, "power", "energy", 10);
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => energyOf(wh).value === 10 - signCost("rowan", { nth: 1, ranks: { quickScript: 2 } }).cost, "1 Energy spent");
    });

    it("SHATTERING GALE: a creature that fails the Gale Sign takes Physical rank plus tier", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Shattering", { ranks: { "shattering-gale": 1 } });
      const target = await plainCharacter("ZZ WHT Shattering Target");
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }, { actor: target, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(wh, "Signs", "gale", { aim: { x: 1600, y: 1050 } });
      assert.equal(card.flags[SCOPE].noneOnPass, true, "damage on a failure alone");
      assert.equal(card.flags[SCOPE].damageType, "physical");
      const index = (card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(target).id);
      assert.isAtLeast(index, 0, "the target was gathered");
      const ap = target.system.ap?.body ?? 0;
      assert.equal(card.flags[SCOPE].damageByTarget[index].damage, Math.max(0, 1 + wh.system.tier - ap), "rank + tier, less the Body Armor Points");
    });

    it("DEEP LULL: a creature the Lull Sign charms in a fight stays Charmed 2 more rounds at rank 2", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Deep Lull", { ranks: { "deep-lull": 2 }, level: 11 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      const card = await useSign(wh, "Lull Sign", "lull", { targets: [foe.object] });
      assert.equal(card.flags[SCOPE].onFailInflicts?.[0]?.moreRounds, 2, "the card carries the rounds");
      await resistOn(card, 0, 1);
      const charmed = await until(() => foe.actor.effects.find(e => e.statuses?.has("charmed")), "Charmed on a failure");
      assert.isAtLeast(charmed.duration?.value ?? 0, 1 + 2 * combat.turns.length, "lengthened by two rounds of turns");
    });

    it("BURSTING ROWAN: an enemy beside the warded hunter takes Fire rank plus tier", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Bursting", { ranks: { "bursting-rowan": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const near = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const before = near.actor.system.health.value;
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => near.actor.system.health.value < before, "the burst landed on the enemy within 5 feet");
    });

    it("ASHEN RING: the Ash ring's radius grows 5 ft at rank 1 and carries its Holy row", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Ashen", { ranks: { "ashen-ring": 1 }, level: 9 });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await (await useSign(wh, "Ash Sign", "ash", { point: { x: 1200, y: 1000 } }));
      // The ring's identifier is `ASH_RING_KEY` (`ash-sign`, `witch-hunter-signs.mjs#landAsh`), never a guessed word.
      const { ASH_RING_KEY } = await import("../rules/witch-hunter-features.mjs");
      const ring = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.caster === wh.uuid && r.flags?.[SCOPE]?.identifier === ASH_RING_KEY), "the ring placed");
      assert.ok((ring.flags[SCOPE].areaTick?.against ?? []).some(a => a.school === "holy" && a.rating === 1), "Holy 1 to an undead or a demon");
      const perFoot = scene.grid.size / scene.grid.distance;
      assert.equal(ring.shapes[0]?.radius, 15 * perFoot, "a 10 ft radius and 5 more");
    });

    it("FIRESTREAM: the Ember Sign's cone stays on the board as an area, and a creature starting its turn in it takes Fire equal to the rank", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Firestream", { ranks: { firestream: 2 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      await (await useSign(wh, "Signs", "ember", { aim: { x: 1600, y: 1050 } }));
      const region = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.caster === wh.uuid && r.flags?.[SCOPE]?.areaTick?.onEnter === true
        && r.flags?.[SCOPE]?.areaTick?.damage?.school === FIRESTREAM.type), "the cone left alight");
      assert.deepInclude(region.flags[SCOPE].areaTick, { who: "creature", onEnter: true, damage: { rating: 2, school: "fire" } }, "Fire equal to the rank, on entry and at a turn's start");
      assert.equal(region.flags[SCOPE].lasts?.rounds, FIRESTREAM.rounds, "until the start of the next turn");
      const before = foe.actor.system.health.value;
      await nextTurnUntil(foe.actor, combat);
      await until(() => foe.actor.system.health.value < before, "the turn's start in the cone struck");
    });

    it("LIVING ROWAN: the Rowan Sign's Ward rises by 2 at rank 2", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Living Rowan", { ranks: { "bursting-rowan": 1, "living-rowan": 2 } });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => (wh.system.ward?.fire ?? 0) >= Math.min(10, wh.system.tier + 2), "Ward tier + 2 on every school");
    });

    it("TWIN SIGNS: the turn's second Sign costs 2 less Energy at rank 2", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Twin", { ranks: { "twin-signs": 2 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1600, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      await fill(wh, "power", "energy", 10);
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => energyOf(wh).value === 7, "the first at 3");
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => energyOf(wh).value === 7 - signCost("rowan", { nth: 2, ranks: { twinSigns: 2 } }).cost, "the second at 1");
    });

    it("HOLY EMBER: the Ember Sign's chooser asks Fire or Holy, and Holy reaches the card", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Holy Ember", { ranks: { "holy-ember": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { feature, card } = await pressUse(wh, "Signs");
      await pickSign(await chooser(feature), "ember");
      await pick(await chooser(feature), game.i18n.localize(AZEROTH.schools.holy));
      await until(() => pickState()?.mode === "facing", "the Ember Sign's aim");
      pressBoard({ x: 1600, y: 1050 });
      assert.equal((await card).flags[SCOPE].damageType, "holy");
    });

    it("SIGN OF THE ORDER: every Sign costs 1 less Energy", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Order", { ranks: { "sign-of-the-order": 1 } });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await fill(wh, "power", "energy", 10);
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => energyOf(wh).value === 8, "2 Energy spent");
    });

    /* ---------------- Bear ---------------- */

    it("BEAR'S HIDE: plate warns of nothing at rank 1, and at rank 2 the suit costs no Speed and no Stealth Bane", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Bear's Hide", { ranks: { "bears-hide": 1 }, armor: ["Field plate"] });
      await wear(wh, "Field plate");
      const speed1 = wh.system.speed;
      assert.include(wh.system.armorBanes ?? [], "stealth", "rank 1 keeps the trait");
      await atRank(wh, "bears-hide", 2);
      await until(() => !(wh.system.armorBanes ?? []).includes("stealth"), "rank 2: no Stealth Bane");
      assert.isAbove(wh.system.speed, speed1, "rank 2: the suit's Speed part waived");
    });

    it("IRON STOMACH: a Body Resilience Test from the sheet carries a Boon, and Spirit does at rank 2 alone", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Iron Stomach", { ranks: { "iron-stomach": 1 } });
      const sheet = await openSheet(wh);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(11);
      const rollOf = async resilience => {
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === wh.id && m.rolls?.length);
        sheet.element.querySelector(`[data-action="rollResilience"][data-resilience="${resilience}"]`).click();
        const [card] = await posted;
        made.push(card);
        return card.rolls[0];
      };
      try {
        const body = await rollOf("body");
        assert.equal(body.options.resilience, "body");
        assert.isAtLeast(Number(body.options.boons ?? body.options.netBoons ?? 1), 1, "a Boon rides the Body Test");
        assert.notProperty(body.outcome, "ironStomach", "the +1 SL is gone");
        const spirit1 = await rollOf("spirit");
        assert.isNotOk(spirit1.options.boons, "rank 1 gives Spirit no Boon");
        await atRank(wh, "iron-stomach", 2);
        const spirit2 = await rollOf("spirit");
        assert.isAtLeast(Number(spirit2.options.boons ?? spirit2.options.netBoons ?? 1), 1, "rank 2 gives Spirit the Boon");
      } finally { unpin(); await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before); await sheet.close(); }
    });

    it("PRESS: the Combat tab's Press spends 2 Tempo, at level 1 with no talent, and posts its card", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Press", {});
      await fill(wh, "momentum", "tempo", 3);
      const card = await pressManeuver(wh, "press");
      assert.equal(card.flags[SCOPE].cost, 2, "Press costs 2");
      await until(() => tempoOf(wh).value === 1, `3 Tempo less Press's 2 leaves 1, read ${tempoOf(wh).value}`);
    });

    it("SPLITTING BLOW: the Combat tab's Sunder costs 2 Tempo less at rank 2 than at rank 0, and that is what is spent", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Splitting", { ranks: { "splitting-blow": 2 } });
      const press = async () => {
        await fill(wh, "momentum", "tempo", 5);
        const card = await pressManeuver(wh, "sunder");
        await until(() => tempoOf(wh).value === 5 - card.flags[SCOPE].cost, "the Sunder's price spent");
        return card.flags[SCOPE].cost;
      };
      const at2 = await press();
      await atRank(wh, "splitting-blow", 0);
      const at0 = await press();
      assert.equal(at2, Math.max(1, at0 - 2), `Sunder at rank 2 cost ${at2}, at rank 0 ${at0}`);
      assert.isBelow(at2, at0, "the talent lowered the price");
    });

    it("UNBOWED: a Gale Sign's push at a hunter holding a greatsword at rank 2 moves nothing, and the Resist's dialog carries the automatic Boon", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Unbowed", { ranks: { unbowed: 2 }, weapons: ["Greatsword"] });
      await equip(wh, "Greatsword");
      const other = await hunterWith("ZZ WHT Unbowed Gale", {});
      const scene = await sceneWith([{ actor: other, x: 1000, y: 1000 }, { actor: wh, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(other, "Signs", "gale", { aim: { x: 1600, y: 1050 } });
      const whToken = tokenOf(wh).document;
      const index = (card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === whToken.id);
      assert.isAtLeast(index, 0, "the cone gathered the Unbowed hunter");
      assert.equal(card.flags[SCOPE].forced?.feet, 10, "the card moves a creature that fails");
      const x0 = whToken.x;
      const { lines } = await resistDialog(card, `button[data-action="resistTest"][data-target-index="${index}"]`, wh, { roll: true, face: 1 });
      const boon = lines.find(l => l.name === "line-talentBoon");
      assert.ok(boon?.checked && boon.text.includes(UNBOWED.name), `Unbowed's Boon is automatic on the Resist: ${lines.map(l => l.text).join(" | ")}`);
      await settle();
      assert.equal(scene.tokens.get(whToken.id).x, x0, "held in place on a failure");
    });

    it("UNBOWED: at rank 1 a Body Resilience Test from the sheet draws the table's unticked line", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Unbowed One", { ranks: { unbowed: 1 } });
      const sheet = await openSheet(wh);
      try {
        const { lines } = await throughDialog(wh, () => sheet.element.querySelector('[data-action="rollResilience"][data-resilience="body"]').click());
        const line = lines.find(l => l.name === `line-talent-${UNBOWED.identifier}`);
        assert.ok(line, `the dialog draws Unbowed's line: ${lines.map(l => l.name).join(", ")}`);
        assert.isFalse(line.checked, "a Test no card names is the table's call, unticked");
      } finally { await sheet.close(); }
    });

    it("BEAR'S WEIGHT: the attack dialog ticks 2 more damage with a weapon in two hands at rank 2", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Bear's Weight", { ranks: { "bears-weight": 2 }, weapons: ["Greatsword"] });
      const sword = await equip(wh, "Greatsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { lines } = await attackFrom(wh, sword, [foe.object], { roll: false });
      const line = lines.find(l => l.name === "line-talent-damage-bears-weight");
      assert.ok(line?.checked, "ticked in two hands");
      assert.include(line.text, "2", "+2 at rank 2");
    });

    it("STEEL GUARD: a successful Parry pressed on the attack card with a greatsword gives 2 Tempo at rank 2", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Steel Guard", { ranks: { "steel-guard": 2 }, weapons: ["Greatsword"] });
      await equip(wh, "Greatsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await fill(wh, "momentum", "tempo", 1);
      // A hit the Parry can meet: the creature's die at 14, the Parry's at 20 (06 §6: meet or beat the attack's total).
      const attack = await npcSwing(foe.actor, tokenOf(wh), 14);
      assert.ok(attack.content.includes('data-action="reactParry"'), "the hit offers the hunter a Parry");
      const reaction = untilHook("createChatMessage", 30000, m => m.speaker?.actor === wh.id && m.flags?.[SCOPE]?.kind === "reaction")
        .then(([m]) => { made.push(m); return m; }).catch(() => null);
      const { release } = await pressCard(attack, 'button[data-action="reactParry"][data-target-index="0"]', { face: 20 });
      try {
        const card = await reaction;
        assert.ok(card, "the Parry posted its card");
        await until(() => tempoOf(wh).value === 2, "1 Tempo paid for the Parry, then 2 given by Steel Guard");
        assert.include(card.content, "Steel Guard", "the Parry's card names the talent");
      } finally { await release(); }
    });

    it("BEAR'S WRATH: a melee hit taken in a fight, applied from the attack card, gives 1 Tempo once a round", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Bear's Wrath", { ranks: { "bears-wrath": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await fill(wh, "momentum", "tempo", 0);
      const apply = async () => {
        const attack = await npcSwing(foe.actor, tokenOf(wh), 20);
        assert.equal(attack.flags[SCOPE].strike?.rangeKind, "melee", "the blow is a melee attack");
        const { release } = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
        await release();
        await settle();
      };
      await apply();
      await until(() => tempoOf(wh).value === 1, "1 Tempo from the blow taken");
      await apply();
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(tempoOf(wh).value, 1, "a second blow in the round gives nothing at rank 1");
    });

    it("CRUSHING SWEEP: Whirling Steel's Use is priced 1 Tempo at rank 2", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Crushing", { ranks: { "bears-weight": 1, "crushing-sweep": 2 }, level: 9 });
      const steel = await until(() => wh.items.find(i => i.type === "feature" && i.name === "Whirling Steel"), "Whirling Steel granted");
      await until(() => wh.items.get(steel.id)?.system.cost?.amount === whirlingSteelCost(2), "the patched price");
      assert.isBelow(whirlingSteelCost(2), whirlingSteelCost(0), "the patch lowers 3 to 1");
    });

    it("BEAR'S ENDURANCE: dropping below half in a fight grants twice the tier in temporary Health, once", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Endurance", { ranks: { "bears-endurance": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const max = wh.system.health.max;
      await wh.update({ "system.health.value": Math.ceil(max / 2) });
      const attack = await npcSwing(foe.actor, tokenOf(wh), 20);
      const { release } = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      await release();
      await until(() => (wh.system.health.temp ?? 0) === 2 * wh.system.tier, "twice the tier");
    });

    it("URSINE FURY: the Tempo cap reads 8, and 8 Tempo holds where 5 would cap it", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WHT Ursine", { ranks: { "bears-wrath": 1, "ursine-fury": 1 } });
      await until(() => tempoOf(wh).max === 8, "the cap at 8");
      await fill(wh, "momentum", "tempo", 8);
      await settle();
      assert.equal(tempoOf(wh).value, 8, "8 Tempo holds");
      await atRank(wh, "ursine-fury", 0);
      await until(() => tempoOf(wh).max === 5, "without it the cap is 5");
      assert.isAtMost(tempoOf(wh).value, 5, "and the pool reads no more than 5");
    });

    it("THUNDEROUS SWING: a hit with a greatsword pushes the target 10 feet at rank 2", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Thunderous", { ranks: { "thunderous-swing": 2 }, weapons: ["Greatsword"] });
      const sword = await equip(wh, "Greatsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const x0 = foe.x;
      const { card } = await attackFrom(wh, sword, [foe.object], { face: 20 });
      assert.ok(card.content.includes("Thunderous Swing"), "the card names the push");
      await until(() => Math.abs(scene.tokens.get(foe.id).x - x0) >= 200, "pushed two squares");
    });

    it("MOUNTAIN BEAR: the Use lays 1 Armor Point on every location for a minute", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Mountain", { ranks: { "bears-wrath": 1, "ursine-fury": 1, "mountain-bear": 1 }, level: 20 });
      const ap = { ...wh.system.ap };
      const { card } = await pressUse(wh, "Mountain Bear");
      await card;
      const effect = await until(() => wh.effects.find(e => e.flags?.[SCOPE]?.[MOUNTAIN_BEAR_FLAG]), "the minute's effect");
      for (const location of ["body", "head", "limb"]) await until(() => wh.system.ap[location] === (ap[location] ?? 0) + 1, `1 Armor Point on the ${location}`);
      assert.ok(effect.duration?.value || effect.duration?.seconds || effect.duration?.rounds, "the effect is spanned");
    });

    /* ---------------- Cat ---------------- */

    it("FELINE REFLEXES: in studded leather the Defense rises 1 a rank, and in mail not at all", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Feline", { armor: ["Studded leather", "Scale hauberk"] });
      const defenseAt = async n => {
        await atRank(wh, "feline-reflexes", n);
        await settle();
        return wh.system.defense;
      };
      await wear(wh, "Studded leather");
      const s0 = await defenseAt(0);
      assert.equal(await defenseAt(1), s0 + 1, "rank 1 in studded leather");
      assert.equal(await defenseAt(2), s0 + 2, "rank 2 in studded leather");
      await wear(wh, "Scale hauberk");
      const m2 = wh.system.defense;
      assert.equal(await defenseAt(0), m2, "in mail the talent adds nothing");
    });

    it("TUMBLE: a melee miss offers the defender a free step once a round", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Tumble", { ranks: { tumble: 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const attack = await npcSwing(foe.actor, tokenOf(wh), 1);
      assert.ok((attack.flags[SCOPE].evades ?? []).some(e => e.actorUuid === wh.uuid && e.free === true), "a free step offered");
      const { release } = await pressCard(attack, `button[data-action="evade"][data-actor-uuid="${wh.uuid}"]`);
      await release();
      await until(() => wh.statuses?.has("disengaging") || wh.effects.some(e => e.statuses?.has("disengaging")), "the step provokes nothing");
    });

    it("HOBBLING CUT: a hit at SL 1 lays nothing at rank 1 and Slowed at rank 2", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WHT Hobbling", { weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const probe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      // The probe, at rank 0: the attack's modifier and the target's Defense off the card's own roll.
      const { card: first } = await attackFrom(wh, blade, [probe.object], { face: 10 });
      const mod = first.rolls[0].total - 10;
      const dc = first.rolls[0].options.dc;
      const face = dc + 5 - mod;
      if (face < 2 || face > 18) this.skip(`no d20 face gives SL 1 here (Defense ${dc}, modifier ${mod})`);
      await new Promise(r => setTimeout(r, 1500));
      await atRank(wh, "hobbling-cut", 1);
      const one = await foeAt(scene, "Defias Footpad", 1000, 1100);
      const { card: c1 } = await attackFrom(wh, blade, [one.object], { face });
      assert.equal(c1.rolls[0].outcome.sl, 1, "the pinned face lands SL 1");
      await new Promise(r => setTimeout(r, 1500));
      assert.notOk(one.actor.statuses?.has("slowed"), "rank 1 needs SL 2");
      await atRank(wh, "hobbling-cut", 2);
      const two = await foeAt(scene, "Defias Footpad", 900, 1000);
      await attackFrom(wh, blade, [two.object], { face });
      await until(() => two.actor.statuses?.has("slowed"), "rank 2 lays Slowed at SL 1");
    });

    it("CAT'S STEP: in studded leather the Speed rises 5 feet a rank, and in plate not at all", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Cat's Step", { armor: ["Studded leather", "Field plate"] });
      const speedAt = async n => {
        await atRank(wh, "cats-step", n);
        await settle();
        return wh.system.speed;
      };
      await wear(wh, "Studded leather");
      const s0 = await speedAt(0);
      assert.equal(await speedAt(1), s0 + 5, "rank 1 in studded leather");
      assert.equal(await speedAt(2), s0 + 10, "rank 2 in studded leather");
      await wear(wh, "Field plate");
      const p2 = wh.system.speed;
      assert.equal(await speedAt(0), p2, "in plate the talent adds nothing");
    });

    it("HUNTER'S RIPOSTE: the Combat tab's Riposte costs 2 Tempo less at rank 2, and its card's Attack ticks the tier against a Studied type", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Riposte", { ranks: { "hunters-riposte": 2 }, weapons: ["Longsword"] });
      await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const press = async () => {
        await fill(wh, "momentum", "tempo", 5);
        const card = await pressManeuver(wh, "riposte");
        await until(() => tempoOf(wh).value === 5 - card.flags[SCOPE].cost, "the Riposte's price spent");
        return card;
      };
      const card = await press();
      canvas.tokens.setTargets([foe.object.id]);
      try {
        const { lines } = await throughDialog(wh, async () => {
          await pressCard(card, 'button[data-action="attackFromCard"][data-riposte]', { skip: false });
        });
        const line = lines.find(l => l.name === "line-talent-damage-hunters-riposte");
        assert.ok(line?.checked, `the tier is ticked on a Riposte at a Studied Humanoid: ${lines.map(l => l.name).join(", ")}`);
      } finally { canvas.tokens.setTargets([]); }
      const at2 = card.flags[SCOPE].cost;
      await atRank(wh, "hunters-riposte", 0);
      const at0 = (await press()).flags[SCOPE].cost;
      assert.equal(at2, Math.max(1, at0 - 2), `Riposte at rank 2 cost ${at2}, at rank 0 ${at0}`);
    });

    it("LETHAL EDGE: a weapon attack's card reads a Critical Injury on 19 at rank 1", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Lethal", { ranks: { "lethal-edge": 1 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 19 });
      assert.equal(card.rolls[0].options.criticalOn, 19);
      assert.equal(card.rolls[0].outcome.critical, true, "a natural 19 inflicts one");
    });

    it("LETHAL EDGE: at rank 2 a natural 18 inflicts one against a Studied type, and not against a type that is not Studied", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Lethal Two", { ranks: { "lethal-edge": 2 }, weapons: ["Longsword"], known: ["undead", "beast", "humanoid"], studied: ["humanoid"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const studied = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const { card } = await attackFrom(wh, blade, [studied.object], { face: 18 });
      assert.equal(card.rolls[0].options.criticalOn, 18, "18 to 20 against a Studied Humanoid");
      assert.equal(card.rolls[0].outcome.critical, true);
      await new Promise(r => setTimeout(r, 1500));
      const beast = await foeAt(scene, "Adult Plainstrider", 900, 1000);
      const { card: other } = await attackFrom(wh, blade, [beast.object], { face: 18 });
      assert.equal(other.rolls[0].options.criticalOn, 19, "a Beast is not Studied: 19 or 20");
      assert.notEqual(other.rolls[0].outcome.critical, true, "a natural 18 inflicts none");
    });

    it("LEAPING STRIKE: a walk of 10 feet in a fight lays the promise of 2 more damage to the next attack", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Leaping", { ranks: { "cats-step": 1, "leaping-strike": 2 } });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1600, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      const token = tokenOf(wh).document;
      await token.move({ x: token.x + 200, y: token.y });
      const entry = await until(() => (wh.getFlag(SCOPE, NEXT_ATTACK_FLAG) ?? []).find(e => e.source === "leaping-strike"), "the promise laid");
      assert.equal(entry.damage, 2, "1 more damage a rank");
      assert.equal(entry.lasts, "turn", "held to this turn");
    });

    it("NIGHT EYES: the Combat tab's Hide draws the unticked Stealth line, and once hidden the attack dialog ticks rank plus tier", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WHT Night Eyes", { ranks: { "night-eyes": 1 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const sheet = await openSheet(wh);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const { lines } = await throughDialog(wh, () => sheet.element.querySelector('section[data-tab="combat"] [data-action="stealth"]').click(), { roll: true, face: 20 });
        const line = lines.find(l => l.name === "line-talent-night-eyes");
        assert.ok(line, "the Hide's Stealth Test draws Night Eyes' line");
        assert.isFalse(line.checked, "the light is the table's: unticked");
      } finally { await sheet.close(); }
      await until(() => wh.statuses?.has("invisible"), "the Hide holds");
      const { lines: hidden } = await attackFrom(wh, blade, [foe.object], { roll: false });
      const damage = hidden.find(l => l.name === "line-talent-damage-night-eyes");
      assert.ok(damage?.checked, "an attack while hidden ticks Night Eyes' damage");
      assert.include(damage.text, String(1 + wh.system.tier), "rank plus tier");
      const { clearHidden } = await import("../applications/combat-actions.mjs");
      await clearHidden(wh);
      await until(() => !wh.statuses?.has("invisible"), "seen again");
      const { lines: seen } = await attackFrom(wh, blade, [foe.object], { roll: false });
      assert.notOk(seen.find(l => l.name === "line-talent-damage-night-eyes")?.checked, "seen, the line is not ticked");
    });

    it("SECOND CUT: a hit offers one more attack on the same target for 2 Tempo, paid at the press", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Second Cut", { ranks: { "lethal-edge": 1, "second-cut": 1 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      await fill(wh, "momentum", "tempo", 3);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 15 });
      const offer = (card.flags[SCOPE].extraStrikes ?? []).find(x => x.identifier === "second-cut");
      assert.ok(offer, "the button on the hit's card");
      assert.equal(offer.cost, 2);
      await new Promise(r => setTimeout(r, 1500));
      const tempo = tempoOf(wh).value;
      const next = untilHook("createChatMessage", 30000, m => m.speaker?.actor === wh.id && m.flags?.[SCOPE]?.kind === "attack" && m.id !== card.id && !String(m.content).includes(game.i18n.localize("AZEROTH.Attack.SecondRoll")));
      const { release } = await pressCard(card, 'button[data-action="extraStrike"][data-strike="second-cut"]', { face: 1 });
      try {
        const [second] = await next;
        made.push(second);
      } finally { await release(); }
      await until(() => tempoOf(wh).value === tempo - 2, "2 Tempo paid (a missed extra attack gives none back)");
    });

    it("KILL RHYTHM: a Critical Injury inflicted in a fight gives 2 Tempo more at rank 2 than at rank 0", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WHT Kill Rhythm", { ranks: { "bears-wrath": 1, "ursine-fury": 1, "kill-rhythm": 2 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const gained = async () => {
        await freshTurn(wh, 2);
        await fill(wh, "momentum", "tempo", 0);
        const { card } = await attackFrom(wh, blade, [foe.object], { face: 20 });
        assert.equal(card.rolls[0].outcome.critical, true, "a natural 20 inflicts a Critical Injury");
        await new Promise(r => setTimeout(r, 2500));
        return tempoOf(wh).value;
      };
      const at2 = await gained();
      await atRank(wh, "kill-rhythm", 0);
      const at0 = await gained();
      assert.isBelow(at2, 8, "the cap of 8 did not clip the reading");
      assert.equal(at2 - at0, 2, `rank 2 gave ${at2}, rank 0 ${at0}`);
    });

    it("NINE LIVES: a passed Reflex Test against the Ember Sign's card lands nothing on the holder", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Nine Lives", { ranks: { "nine-lives": 1 } });
      const caster = await hunterWith("ZZ WHT Nine Lives Ember", {});
      await sceneWith([{ actor: caster, x: 1000, y: 1000 }, { actor: wh, x: 1100, y: 1000, side: "hostile" }]);
      const card = await useSign(caster, "Signs", "ember", { aim: { x: 1600, y: 1050 } });
      const index = (card.flags[SCOPE].targets ?? []).findIndex(t => t.tokenId === tokenOf(wh).id);
      assert.isAtLeast(index, 0, "the cone gathered the holder");
      await resistOn(card, index, 20);
      // The card records the Test after the Resist's own card posts (wave 4's live run: an Apply pressed at once read
      // no record and landed the whole); wait for the record the Apply reads (`rules/resisted.mjs#resistRecordOn`).
      const { resistRecordOn } = await import("../rules/resisted.mjs");
      const row = card.flags[SCOPE].targets[index];
      await until(() => typeof resistRecordOn(game.messages.get(card.id)?.flags?.[SCOPE]?.resists ?? null, row)?.success === "boolean", "the card's record of the passed Test");
      const before = wh.system.health.value;
      const { release } = await pressCard(game.messages.get(card.id), `button[data-action="applyDamage"][data-target-index="${index}"]`);
      await release();
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(wh.system.health.value, before, "no damage on a success");
    });

    it("CAT'S DANCE: a hit offers one attack with a Boon on a different creature in reach for 2 Tempo", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WHT Cat's Dance", { ranks: { "kill-rhythm": 1, "cats-dance": 1 }, weapons: ["Longsword"], level: 20 });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const other = await foeAt(scene, "Defias Footpad", 1000, 1100);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [foe, other].map(d => ({ actorId: d.actorId, sceneId: scene.id, tokenId: d.id })));
      await freshTurn(wh, 2);
      await fill(wh, "momentum", "tempo", 3);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 15 });
      const offer = (card.flags[SCOPE].extraStrikes ?? []).find(x => x.identifier === "cats-dance");
      assert.ok(offer, "the button on the hit's card");
      assert.deepInclude(offer, { target: "other", cost: 2, boons: 1, reach: true }, "a price, a Boon and the reach");
      await new Promise(r => setTimeout(r, 1500));
      canvas.tokens.setTargets([other.object.id]);
      try {
        const { lines } = await throughDialog(wh, async () => {
          await pressCard(card, 'button[data-action="extraStrike"][data-strike="cats-dance"]', { skip: false });
        });
        assert.ok(lines.some(l => l.checked && /Cat's Dance/.test(l.text)), `the extra attack's dialog carries the Boon: ${lines.map(l => l.text).join(" | ")}`);
      } finally { canvas.tokens.setTargets([]); }
    });
  });
}
