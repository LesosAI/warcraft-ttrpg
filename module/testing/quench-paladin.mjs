/**
 * THE PALADIN'S PLAY-TEST, AND THE AREAS THAT STRIKE AT A TURN (D-752, D-753,
 * D-756; the lead, 2026-09-25), inside a live world.
 *
 * The pure rules have their Vitests - `class-features.test.mjs` holds Lay on
 * Hands to 02, `talent-effects.test.mjs` Open Hand and Consecrated Ground to 04,
 * `area-ticks.test.mjs` every tick to 07. What none of them can reach is the
 * path on a prepared world: the sync stamping a use and patching a second one,
 * a talent embedding a spell and taking back only its own copy, a real cast
 * that deals nothing, a Region placed off the card and read at a real turn
 * through core's own containment test, the Sustain's end taking the Region with
 * it on the GM's client, and a card that says *30 ft circle*.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15). A turn's ticks run on
 * the active GM's client after the update that moved the turn, and
 * `combatTurnChange` is called only once they are done.
 */

import { cleanup, drainAreaWork, fromPack, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
import { pixelsPerFoot, placeArea } from "../canvas/regions.mjs";
import { sweepAreas } from "../canvas/sustained-areas.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { VULNERABLE_DAMAGE_BONUS } from "../rules/mitigation.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellsNamed = (actor, name) => actor.items.filter(i => i.type === "spell" && i.name === name);
const health = actor => actor.system.health.value;

/** Every Power pool at its cap: a cast and a Sustain pay first (07 §8, 05 §12). */
async function fillMana(actor) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
  await until(() => actor.poolSnapshot().some(p => p.name === "mana" && p.value >= 2), `${actor.name}'s Mana`);
}

/**
 * Tokens for these actors on the batch's scene, linked, at a disposition.
 * **Core makes every token HOSTILE by default** (14.367), so a test that means
 * *friendly* says so. A square is five feet: 100 px.
 */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y, disposition = "FRIENDLY" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS[disposition] })).toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => p.actor.getActiveTokens(true).length), "every token drawn");
  await settle();
  return tokens;
}

/** A started fight over these actors' tokens, its first turn's events over (D-627). */
async function fightOver(scene, actors) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens(true)[0]?.document;
    return { actorId: a.id, tokenId: token?.id ?? null, sceneId: scene.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  return combat;
}

/** Move the turn on and wait for its ticks: `combatTurnChange` follows them. */
async function nextTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await settled;
}

/** Every combatant's turn once, from the one after the current. */
async function wholeRound(combat) {
  for (let i = 0; i < combat.turns.length; i++) await nextTurn(combat);
}

/** A cast through the workflow, the Test pinned to succeed (or, with a face of 1, to fail). */
async function cast(actor, spell, targets = [], face = 18) {
  const unpin = pinDie(face);
  try {
    return await game.system.azeroth.workflows.castSpell({ actor, spell, dc: 5, targets });
  } finally {
    unpin();
  }
}

/** The turn cards a spell's tick wrote, in order. */
const tickLines = (since, spell) => game.messages.contents.slice(since)
  .filter(m => m.flags?.["azeroth-rpg"]?.kind === "tick" && m.content.includes(spell));

/** A creature's Power, filled past anything these casts cost: its pool names no type (D-637). */
async function fillPower(npc, value = 20) {
  await npc.update({ "system.power.max": value, "system.power.value": value });
  await until(() => npc.system.power.value === value, `${npc.name}'s Power`);
}

/** A board press at a canvas point: what a Place area's click waits for (quench-phase12's shape). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/**
 * **THE SWEEP'S QUEUE, DRAINED, BEFORE A TEST DELETES A REGION OF ITS OWN.** A
 * fight's end, a token's and an actor's deletion each queue a pass on this
 * client (the active GM's), and a pass deleting a Region the test is deleting
 * too is an error notification from core however the promise is caught. This
 * joins the queue - so every pass queued before it has run - and sweeps.
 */
async function drainSweeps() {
  await sweepAreas();
}

/** What is left on the board after a test: the fight, the tokens, then the areas nothing swept. */
async function clearBoard(scene, combat, tokens) {
  if (combat) await combat.delete().catch(() => {});
  const ids = (tokens ?? []).map(t => t.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids).catch(() => {});
  await drainSweeps();
  const left = scene.regions.map(r => r.id);
  if (left.length) await scene.deleteEmbeddedDocuments("Region", left).catch(() => {});
  // And whatever those deletions started runs out here, so no test leaves a
  // pass to the next (the full-suite fix of D-757).
  await drainAreaWork();
}

export function paladinBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Paladin's play-test, and the areas that strike at a turn (D-752, D-753, D-756)", function () {
    let restore = null;
    let wasViewing = null;
    let scene = null;

    before(async function () {
      this.timeout(60000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Paladin", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(180000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // FIGHTS FIRST, then the scene, then everything else (the reactions
      // batch's teardown, and its reason) - and every pass of ours that is owed
      // runs out BEFORE the scene goes (the full-suite fix of D-757).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- 02 §7's Lay on Hands, and 04's Open Hand ------------------------- */

    it("gives Lay on Hands one use a Long Rest: refused after it, still refused after a Short Rest, back after the Long Rest", async function () {
      this.timeout(120000);
      const w = game.system.azeroth.workflows;
      const paladin = await makeCharacter({ name: "ZZ Laying Paladin", classes: [["Paladin", 5]] });
      const loh = await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 1 && featureNamed(paladin, "Lay on Hands"),
        "Lay on Hands stamped with one use");
      assert.equal(loh.system.uses.per, "long");
      assert.equal(loh.system.uses.value, 1, "a newly limited feature does not start full");
      await fillMana(paladin);

      assert.ok(await w.useFeature({ actor: paladin, item: loh }), "the first Lay on Hands posted no card");
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 0, "the use struck");
      let card = null;
      let said = await warnings(async () => { card = await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }); });
      assert.isNull(card, "a second Lay on Hands was made");
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Feature.NoUses", { name: "Lay on Hands" }));

      // A Short Rest brings back what it refreshes, and a Long Rest's use is not that.
      await paladin.resetUses("short");
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 0, "a Short Rest brought Lay on Hands back");
      said = await warnings(async () => { card = await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }); });
      assert.isNull(card, "Lay on Hands was made after a Short Rest");
      assert.include(said.join(" "), "Lay on Hands");

      await paladin.longRest();
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 1, "the Long Rest bringing Lay on Hands back");
      assert.ok(await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }), "Lay on Hands refused after a Long Rest");
    });

    it("gives Lay on Hands a second use with Open Hand, grants no counter of its own, and refuses a third", async function () {
      this.timeout(120000);
      const w = game.system.azeroth.workflows;
      const paladin = await makeCharacter({ name: "ZZ Open Hand Paladin", classes: [["Paladin", 5]] });
      await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 1, "Lay on Hands stamped");
      await talentNamed(paladin, "Open Hand").update({ "system.taken": 1 });
      await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 2, "Open Hand's second use on the feature");
      const loh = featureNamed(paladin, "Lay on Hands");
      assert.equal(loh.system.uses.per, "long");
      assert.include(loh.system.modifiedBy, "Open Hand", "the feature does not name what changed it");
      await paladin.syncClassFeatures();
      assert.isNull(featureNamed(paladin, "Open Hand"), "Open Hand still grants a Short Rest counter of its own");

      await paladin.longRest();
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 2, "two uses after a Long Rest");
      await fillMana(paladin);
      assert.ok(await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }), "the first use was refused");
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 1, "the first use struck");
      assert.ok(await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }), "Open Hand's second use was refused");
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 0, "the second use struck");
      let card = null;
      const said = await warnings(async () => { card = await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }); });
      assert.isNull(card, "a third Lay on Hands was made");
      assert.include(said.join(" "), "Lay on Hands");
    });

    /* ---- 04's Consecrated Ground ------------------------------------------ */

    it("teaches Consecration once at either rank and takes back only its own copy; one already known is left alone", async function () {
      this.timeout(120000);
      const paladin = await makeCharacter({ name: "ZZ Ground Paladin", classes: [["Paladin", 5]] });
      const talent = talentNamed(paladin, "Consecrated Ground");
      await talent.update({ "system.taken": 1 });
      const taught = await until(() => spellsNamed(paladin, "Consecration")[0], "Consecrated Ground teaching Consecration");
      assert.equal(taught.getFlag("azeroth-rpg", "spellFrom"), talent.id, "the copy does not say the talent taught it");
      // No feature of its own: the old ten-foot consecration is gone.
      assert.isNull(featureNamed(paladin, "Consecrated Ground"), "the talent still grants a consecration of its own");
      await talent.update({ "system.taken": 2 });
      await paladin.syncClassFeatures();
      assert.lengthOf(spellsNamed(paladin, "Consecration"), 1, "rank 2 taught Consecration twice");
      await talent.update({ "system.taken": 0 });
      await paladin.syncClassFeatures();
      await until(() => spellsNamed(paladin, "Consecration").length === 0, "rank 0 taking the talent's copy back");

      const knower = await makeCharacter({ name: "ZZ Knowing Paladin", classes: [["Paladin", 5]], spells: ["Consecration"] });
      const own = spellsNamed(knower, "Consecration")[0];
      assert.ok(own, "the fixture knows no Consecration");
      const theirs = talentNamed(knower, "Consecrated Ground");
      await theirs.update({ "system.taken": 1 });
      await knower.syncClassFeatures();
      assert.deepEqual(spellsNamed(knower, "Consecration").map(s => s.id), [own.id], "a known Consecration was taught again");
      await theirs.update({ "system.taken": 0 });
      await knower.syncClassFeatures();
      assert.deepEqual(spellsNamed(knower, "Consecration").map(s => s.id), [own.id], "rank 0 took away a Consecration the talent never taught");
    });

    /* ---- 07's Consecration: nothing on the cast, everything at the turn ---- */

    it("deals nothing on the cast; the placed area strikes an undead enemy for 3, a living one for 2, and nobody on the Paladin's side or outside it", async function () {
      this.timeout(300000);
      const w = game.system.azeroth.workflows;
      // The Paladin leads the fight, so every creature in it starts exactly one turn per round after the cast.
      const paladin = await makeCharacter({ name: "ZZ Consecrating Paladin", classes: [["Paladin", 5]], spells: ["Consecration"], abilities: { dex: 20 } });
      const ally = await makeCharacter({ name: "ZZ Consecrated Ally", classes: [["Rogue", 5]] });
      await paladin.setParty(true);
      await ally.setParty(true);
      const ghoul = await makeNpc("Plagued Ghoul");
      const bandit = await makeNpc("Bandit");
      const outsider = await makeNpc("Bandit");
      await outsider.update({ name: "ZZ Bandit Outside" });
      await fillMana(paladin);
      // A 20 ft radius at (1100, 1100) is 400 px across every side of it.
      const tokens = await place(scene, [
        { actor: paladin, x: 200, y: 200 },
        { actor: ally, x: 1000, y: 1100 },
        { actor: ghoul, x: 1000, y: 1000, disposition: "HOSTILE" },
        { actor: bandit, x: 1100, y: 1000, disposition: "HOSTILE" },
        { actor: outsider, x: 2400, y: 1000, disposition: "HOSTILE" }
      ]);
      let combat = null;
      try {
        const spell = spellsNamed(paladin, "Consecration")[0];
        const before = { ghoul: health(ghoul), bandit: health(bandit), ally: health(ally), outsider: health(outsider) };
        const [target] = targetSnapshots([bandit.getActiveTokens(true)[0]]);
        const card = await cast(paladin, spell, [target]);
        assert.ok(card, "the cast posted no card");
        made.push(card);
        const flags = card.flags["azeroth-rpg"];
        assert.isTrue(flags.success);
        // NOTHING ON THE CAST: no damage worked out, no Apply, the target untouched.
        assert.isTrue((flags.damageByTarget ?? []).every(row => row === null), "the cast worked out damage for its target");
        assert.notInclude(card.content, 'data-action="applyDamage"', "the card offers an Apply for the tick's damage");
        assert.equal(health(bandit), before.bandit, "the cast damaged its target");
        // The card says what the area does instead, in words.
        assert.include(card.content, game.i18n.localize("AZEROTH.Card.AreaTickLabel"));
        assert.isTrue(flags.sustained, "the cast's Sustain was not recorded on the card");
        assert.equal(flags.areaTick?.who, "enemy");
        assert.ok((paladin.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.cast === flags.cast), "no Sustain entry for the cast");

        // The area, placed off the card as the card's own door places it.
        const region = await placeArea({ item: spell, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(card, paladin, spell), widenFt: flags.widen });
        assert.ok(region, "no Region was placed");
        const rf = region.flags["azeroth-rpg"];
        assert.equal(rf.caster, paladin.uuid);
        assert.isTrue(rf.sustained);
        assert.equal(rf.areaTick?.who, "enemy");
        assert.equal(region.shapes[0].radius, 20 * pixelsPerFoot(scene));
        const inside = actor => actor.getActiveTokens(true)[0].document.testInsideRegion(region);
        assert.isTrue(inside(ghoul) && inside(bandit) && inside(ally), "the area does not hold the three placed inside it");
        assert.isFalse(inside(outsider), "the area holds the bandit placed outside it");

        const since = game.messages.size;
        combat = await fightOver(scene, [paladin, ally, ghoul, bandit, outsider]);
        assert.equal(combat.combatant?.actorId, paladin.id, "the Paladin does not lead the fight");
        for (let i = 1; i < combat.turns.length; i++) await nextTurn(combat);

        // 07: *an undead creature takes 3 instead* - and the Plagued Ghoul is
        // Vulnerable (Holy), so 06's +2 lands and no Ward applies.
        await until(() => health(ghoul) === before.ghoul - (3 + VULNERABLE_DAMAGE_BONUS), "the ghoul's tick");
        await until(() => health(bandit) === before.bandit - 2, "the bandit's tick");
        assert.equal(health(ally), before.ally, "Consecration struck an ally");
        assert.equal(health(outsider), before.outsider, "Consecration struck a bandit outside it");
        const lines = tickLines(since, "Consecration");
        assert.ok(lines.some(m => m.content.includes(ghoul.name) && m.content.includes(String(3 + VULNERABLE_DAMAGE_BONUS))
          && m.content.includes("Vulnerable")), "no tick line names the ghoul's damage");
        assert.ok(lines.some(m => m.content.includes(bandit.name) && m.content.includes("2")), "no tick line names the bandit's damage");

        // THE SUSTAIN ENDS AND THE AREA GOES WITH IT, on the GM's client.
        await w.endSustain({ actor: paladin, spellId: spell.id });
        await until(() => !scene.regions.has(region.id), "the Region deleted when the Sustain ended");
        const held = { ghoul: health(ghoul), bandit: health(bandit) };
        await wholeRound(combat);
        await settle();
        assert.equal(health(ghoul), held.ghoul, "the ghoul was struck after the Sustain ended");
        assert.equal(health(bandit), held.bandit, "the bandit was struck after the Sustain ended");

        // The card cannot place it again, and says why.
        const said = await warnings(() => CARD_ACTIONS.placeArea(null, card));
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Area.NotSustained", { name: "Consecration" }));
        // And one placed anyway, off the stale record, is taken straight off.
        const stale = await placeArea({ item: spell, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(card, paladin, spell) });
        await until(() => !scene.regions.has(stale.id), "a Region placed for an ended Sustain being swept");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- *a creature* is everybody; *an ally* heals -------------------------- */

    it("strikes an ally standing in Rain of Fire, and heals an ally and the druid standing in the druid's own Healing Rain", async function () {
      this.timeout(300000);
      const mage = await makeCharacter({ name: "ZZ Raining Mage", classes: [["Mage", 5]], spells: ["Rain of Fire"], abilities: { dex: 20 } });
      const druid = await makeCharacter({ name: "ZZ Raining Druid", classes: [["Druid", 5]], spells: ["Healing Rain"] });
      const ally = await makeCharacter({ name: "ZZ Rained-On Ally", classes: [["Rogue", 5]] });
      for (const a of [mage, druid, ally]) await a.setParty(true);
      await fillMana(mage);
      await fillMana(druid);
      const tokens = await place(scene, [
        { actor: mage, x: 200, y: 200 },
        { actor: ally, x: 1000, y: 1000 },
        { actor: druid, x: 1100, y: 1000 }
      ]);
      let combat = null;
      try {
        const fire = spellsNamed(mage, "Rain of Fire")[0];
        const rainCard = await cast(mage, fire);
        made.push(rainCard);
        assert.isTrue(rainCard.flags["azeroth-rpg"].success);
        await placeArea({ item: fire, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(rainCard, mage, fire) });
        const heal = spellsNamed(druid, "Healing Rain")[0];
        const healCard = await cast(druid, heal);
        made.push(healCard);
        assert.isTrue(healCard.flags["azeroth-rpg"].success);
        // Nothing healed on the cast: the rain is an ally's at its turn.
        assert.notInclude(healCard.content, 'data-action="applyHealing"', "Healing Rain offered its Health on the cast");
        await placeArea({ item: heal, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(healCard, druid, heal) });

        // Wounded, so the rain has room to mend.
        await ally.update({ "system.health.value": ally.system.health.max - 6 });
        await druid.update({ "system.health.value": druid.system.health.max - 6 });
        const before = { ally: health(ally), druid: health(druid) };
        const since = game.messages.size;
        combat = await fightOver(scene, [mage, ally, druid]);
        for (let i = 1; i < combat.turns.length; i++) await nextTurn(combat);

        // The ally: 2 Fire from Rain of Fire (*a creature*) and 3 from the Healing Rain (*an ally*).
        await until(() => health(ally) === before.ally - 2 + 3, "the ally's two ticks");
        // The druid is in the fire too, and standing in their own rain is *an
        // ally* of it (the lead, 2026-09-26: a Paladin in their own Hallowed
        // Ground regains 2), so the rain mends them as well.
        await until(() => health(druid) === before.druid - 2 + 3, "the druid's Rain of Fire and Healing Rain ticks");
        const lines = [...tickLines(since, "Rain of Fire"), ...tickLines(since, "Healing Rain")];
        assert.ok(lines.some(m => m.content.includes(ally.name) && m.content.includes("Rain of Fire")), "no line for the ally's burn");
        assert.ok(lines.some(m => m.content.includes(ally.name) && m.content.includes("Healing Rain")), "no line for the ally's mending");
        assert.ok(lines.some(m => m.content.includes(druid.name) && m.content.includes("Healing Rain")), "no line for the druid's mending in their own rain");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    /* ---- Consecrated Ground at rank 2: a 30 ft circle ---------------------- */

    it("says 30 ft circle on the card at rank 2, and places a Region that size", async function () {
      this.timeout(120000);
      const paladin = await makeCharacter({ name: "ZZ Wide Ground Paladin", classes: [["Paladin", 5]] });
      await fillMana(paladin);
      const talent = talentNamed(paladin, "Consecrated Ground");
      await talent.update({ "system.taken": 2 });
      const spell = await until(() => spellsNamed(paladin, "Consecration")[0], "the talent teaching Consecration");
      const card = await cast(paladin, spell);
      made.push(card);
      assert.equal(card.flags["azeroth-rpg"].widen, 10);
      assert.equal(card.flags["azeroth-rpg"].area?.distanceFt, 30);
      assert.deepEqual(card.flags["azeroth-rpg"].ground, { difficult: ["undead", "fel"], who: "enemy" });
      assert.include(card.content, "30 ft circle", "the card's Place area does not say 30 ft");
      const region = await placeArea({ item: spell, scene, origin: { x: 1500, y: 1000 }, flags: regionFlagsFromCard(card, paladin, spell), widenFt: card.flags["azeroth-rpg"].widen });
      try {
        assert.equal(region.shapes[0].radius, 30 * pixelsPerFoot(scene), "the Region is not 30 feet");
        assert.include(region.name, "(30 ft circle)");
        assert.deepEqual(region.flags["azeroth-rpg"].ground, { difficult: ["undead", "fel"], who: "enemy" });
      } finally {
        // The Sustain's end takes the Region with it; a second delete of our
        // own would race the sweep and core would say so as an error.
        await game.system.azeroth.workflows.endSustain({ actor: paladin, spellId: spell.id }).catch(() => {});
        await until(() => !scene.regions.has(region.id), "the Region going with the Sustain");
      }
    });

    /* ---- the review of D-756: a creature's area goes with the creature ---- */

    it("ends a creature's Sustain at 0 Health by any write, takes its area away and strikes nobody after; a failed Blizzard places nothing; Immolation cast from the pack burns (M1, N1, S6)", async function () {
      this.timeout(300000);
      const blizzard = await fromPack("azeroth-rpg.spells", "Blizzard");
      const immolation = await fromPack("azeroth-rpg.spells", "Immolation");
      const ally = await makeCharacter({ name: "ZZ Frozen Ally", classes: [["Rogue", 5]], abilities: { dex: 20 } });
      await ally.setParty(true);
      const sorceress = await makeNpc("Sorceress");
      await sorceress.update({ name: "ZZ Blizzard Sorceress" });
      const pyre = await makeNpc("Sorceress");
      await pyre.update({ name: "ZZ Immolating Sorceress" });
      await fillPower(sorceress);
      await fillPower(pyre);
      // A 20 ft radius at (1100, 1100) holds the ally's square and not the
      // pyre's beside it, which is 5 feet from the ally.
      const tokens = await place(scene, [
        { actor: ally, x: 1400, y: 1100 },
        { actor: sorceress, x: 200, y: 200, disposition: "HOSTILE" },
        { actor: pyre, x: 1500, y: 1100, disposition: "HOSTILE" }
      ]);
      let combat = null;
      try {
        // 07 §8: a failed Casting Test costs the Mana and the spell does not go
        // off - a Sustained one holds no area to place (N1).
        const failed = await cast(sorceress, blizzard, [], 1);
        made.push(failed);
        assert.isFalse(failed.flags["azeroth-rpg"].success, "a natural 1 did not fail the Casting Test");
        assert.isFalse(failed.flags["azeroth-rpg"].sustained);
        const before = scene.regions.size;
        const refused = await warnings(() => CARD_ACTIONS.placeArea(null, failed));
        assert.include(refused.join(" "), game.i18n.format("AZEROTH.Area.FailedCast", { name: "Blizzard" }));
        assert.equal(scene.regions.size, before, "a failed Blizzard placed an outline");

        // A CREATURE SUSTAINS: its Power pool is its Mana (D-637), so the cast
        // writes an entry and the card says so - the premise O-145 stood on.
        const card = await cast(sorceress, blizzard);
        made.push(card);
        const flags = card.flags["azeroth-rpg"];
        assert.isTrue(flags.success);
        assert.isTrue(flags.sustained, "a creature's sustained cast wrote no Sustain");
        assert.equal(flags.caster, sorceress.uuid, "the card does not record who holds the cast");
        assert.ok((sorceress.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.cast === flags.cast), "no Sustain entry on the creature");
        const region = await placeArea({ item: blizzard, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(card, sorceress, blizzard) });
        assert.ok(region, "no Region was placed");
        assert.isTrue(ally.getActiveTokens(true)[0].document.testInsideRegion(region), "the area does not hold the ally");
        assert.isFalse(pyre.getActiveTokens(true)[0].document.testInsideRegion(region), "the area holds the pyre's square");

        // Immolation FROM THE PACK, never embedded: the Sustain entry carries its
        // self-centred tick and what the tick is keyed by (S6).
        const burning = await cast(pyre, immolation);
        made.push(burning);
        const entry = (pyre.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e.cast === burning.flags["azeroth-rpg"].cast);
        assert.ok(entry, "no Sustain entry for the pack's Immolation");
        assert.isNull(pyre.items.get(entry.spellId) ?? null, "the fixture embedded Immolation, so this proves nothing");
        assert.equal(entry.areaTick?.centre, "self", "the Sustain entry carries no self-centred tick");
        assert.deepEqual(entry.tickSpell, { name: "Immolation", school: "fire", tier: immolation.system.tier, takesSpellpower: immolation.system.takesSpellpower === true });

        const full = health(ally);
        const since = game.messages.size;
        combat = await fightOver(scene, [ally, sorceress, pyre]);
        assert.equal(combat.combatant?.actorId, ally.id, "the ally does not lead the fight");
        // 2 Frost from Blizzard (*a creature*) and 2 Fire from Immolation (*within 5 feet*).
        await until(() => health(ally) === full - 4, "the ally's Blizzard and Immolation ticks");
        assert.ok(tickLines(since, "Blizzard").some(m => m.content.includes(ally.name)), "no Blizzard line");
        assert.ok(tickLines(since, "Immolation").some(m => m.content.includes(ally.name)), "no Immolation line");

        // KILLED THROUGH THE SHEET'S OWN WRITE - not `adjustHealth` - and the
        // Sustain still ends, and the area goes with it (M1).
        await sorceress.update({ "system.health.value": 0 });
        await until(() => !(sorceress.getFlag("azeroth-rpg", "sustaining") ?? []).length, "the dead creature's Sustain ending");
        await until(() => !scene.regions.has(region.id), "the dead creature's Blizzard going");
        // Killed by a blow: `adjustHealth` waits, so the entry is gone when the blow returns.
        await pyre.applyDamage(999, { struck: true });
        assert.lengthOf(pyre.getFlag("azeroth-rpg", "sustaining") ?? [], 0, "the blow returned with the Sustain still held");

        const after = health(ally);
        const quiet = game.messages.size;
        await wholeRound(combat);
        await settle();
        assert.equal(combat.combatant?.actorId, ally.id, "the round did not come back to the ally");
        assert.equal(health(ally), after, "a dead creature's area struck the ally");
        assert.lengthOf(tickLines(quiet, "Blizzard"), 0, "a Blizzard line after its caster died");
        assert.lengthOf(tickLines(quiet, "Immolation"), 0, "an Immolation line after its caster died");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("ends a character's Sustain at 0 Health with the Critical Injury, once; a tick keeps a one-attack mark; the defeated and the dead are not ticked, the hidden are (M1, S1)", async function () {
      this.timeout(300000);
      const paladin = await makeCharacter({ name: "ZZ Falling Paladin", classes: [["Paladin", 5]], spells: ["Consecration"], abilities: { dex: 20 } });
      await paladin.setParty(true);
      await fillMana(paladin);
      const marked = await makeNpc("Bandit");
      await marked.update({ name: "ZZ Braced Bandit" });
      const lurker = await makeNpc("Plagued Ghoul");
      await lurker.update({ name: "ZZ Hidden Ghoul" });
      const beaten = await makeNpc("Bandit");
      await beaten.update({ name: "ZZ Defeated Bandit" });
      const fallen = await makeNpc("Bandit");
      await fallen.update({ name: "ZZ Fallen Bandit" });
      const tokens = await place(scene, [
        { actor: paladin, x: 200, y: 200 },
        { actor: marked, x: 1000, y: 1000, disposition: "HOSTILE" },
        { actor: lurker, x: 1100, y: 1000, disposition: "HOSTILE" },
        { actor: beaten, x: 1000, y: 1100, disposition: "HOSTILE" },
        { actor: fallen, x: 1100, y: 1100, disposition: "HOSTILE" }
      ]);
      await lurker.getActiveTokens(true)[0].document.update({ hidden: true });
      let combat = null;
      try {
        const spell = spellsNamed(paladin, "Consecration")[0];
        const card = await cast(paladin, spell);
        made.push(card);
        const region = await placeArea({ item: spell, scene, origin: { x: 1100, y: 1100 }, flags: regionFlagsFromCard(card, paladin, spell) });
        combat = await fightOver(scene, [paladin, marked, lurker, beaten, fallen]);
        assert.equal(combat.combatant?.actorId, paladin.id, "the Paladin does not lead the fight");
        const combatantOf = actor => combat.combatants.find(c => c.actorId === actor.id);
        await combatantOf(beaten).update({ defeated: true });
        await fallen.update({ "system.health.value": 0 });
        // Halve the damage of ONE ATTACK (08 §20's Battlegear of Wrath): a mark
        // with no card, which the next blow that is an attack spends.
        await marked.setFlag("azeroth-rpg", "mitigate", { name: "Battlegear of Wrath", halve: true });

        // The ground is no attack (S1): the full 2 lands and the mark stands.
        const was = health(marked);
        const lines = await combat._areaTicks(combatantOf(marked));
        assert.equal(health(marked), was - 2, "Consecration's tick was halved by a mark meant for an attack");
        assert.ok(lines.some(l => l.includes(marked.name)), "no line for the braced bandit");
        assert.ok(marked.getFlag("azeroth-rpg", "mitigate"), "a tick spent the one-attack mark");
        // A hidden enemy is still an enemy: 3 to an undead, and 06's 2 for its Vulnerable (Holy).
        const hid = health(lurker);
        await combat._areaTicks(combatantOf(lurker));
        assert.equal(health(lurker), hid - (3 + VULNERABLE_DAMAGE_BONUS), "a hidden ghoul was not struck");
        // Nobody out of the fight is ticked: damage to the dead is noise.
        const beatenWas = health(beaten);
        assert.lengthOf(await combat._areaTicks(combatantOf(beaten)), 0, "a defeated combatant was ticked");
        assert.equal(health(beaten), beatenWas);
        assert.lengthOf(await combat._areaTicks(combatantOf(fallen)), 0, "a creature at 0 Health was ticked");

        // THE PALADIN FALLS. 06 §9: reaching 0 is a Critical Injury, and 05 §12
        // ends a Sustain on one - at the 0, before any Suffer is pressed.
        const since = game.messages.size;
        await paladin.applyDamage(999, { struck: true });
        assert.isUndefined(paladin.getFlag("azeroth-rpg", "sustaining"), "0 Health left the Sustain held");
        await until(() => !scene.regions.has(region.id), "the fallen Paladin's Consecration going");
        const injury = await until(() => game.messages.contents.slice(since).find(m => m.flags?.["azeroth-rpg"]?.kind === "critical"), "the Critical Injury card");
        made.push(injury);
        // Suffer finds nothing held and writes nothing more: the Sustain is ended once.
        await CARD_ACTIONS.sufferInjury(null, injury);
        await until(() => paladin.effects.some(e => e.getFlag("azeroth-rpg", "injury")), "the injury laid by Suffer");
        assert.isUndefined(paladin.getFlag("azeroth-rpg", "sustaining"), "Suffer wrote a Sustain back");
      } finally {
        await clearBoard(scene, combat, tokens);
      }
    });

    it("places a world creature's area from its card while an unlinked token speaks for it, and takes it away when that token falls or is deleted (S3, S2, M1)", async function () {
      this.timeout(300000);
      const blizzard = await fromPack("azeroth-rpg.spells", "Blizzard");
      const sorceress = await makeNpc("Sorceress");
      await sorceress.update({ name: "ZZ Sidebar Sorceress", "prototypeToken.actorLink": false });
      await fillPower(sorceress);
      // Owned, so the card's door finds the spell at once and arms its click
      // in the same call (quench-phase12's press follows the call the same way).
      const [owned] = await sorceress.createEmbeddedDocuments("Item", [blizzard.toObject()]);
      const [token] = await scene.createEmbeddedDocuments("Token", [
        (await sorceress.getTokenDocument({ x: 300, y: 300, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })).toObject()
      ]);
      await until(() => canvas.tokens.get(token.id), "the unlinked token drawn");
      const tokens = [token];
      try {
        assert.isFalse(token.actorLink, "the token is linked, so this proves nothing");
        // Cast from the WORLD actor, as the sidebar sheet does.
        const card = await cast(sorceress, owned);
        made.push(card);
        const speaker = ChatMessage.getSpeakerActor(card.speaker);
        assert.notEqual(speaker?.uuid, sorceress.uuid, "the speaker is the world actor, so this proves nothing");
        assert.equal(card.flags["azeroth-rpg"].caster, sorceress.uuid, "the card does not record the world actor as the caster");
        // The card's own door: it used to refuse *no longer sustained* here.
        let region = null;
        const said = await warnings(async () => {
          const placing = CARD_ACTIONS.placeArea({ dataset: {} }, card);
          pressBoard({ x: 1100, y: 1100 });
          region = await placing;
        });
        assert.ok(region, `Place area placed nothing (${said.join(" ")})`);
        assert.equal(region.getFlag("azeroth-rpg", "caster"), sorceress.uuid, "the Region names the speaker's copy");
        assert.equal(region.getFlag("azeroth-rpg", "source")?.tokenId, token.id, "the Region does not name the token that cast it");
        // It stands: the sweep the Region's creation queued finds it held.
        await drainSweeps();
        assert.isTrue(scene.regions.has(region.id), "the Region was swept the moment it landed");

        // The token's creature falls; the Sustain is the world actor's, and the
        // area answers to the token the card recorded (M1).
        await token.actor.applyDamage(999, { struck: true });
        await until(() => !scene.regions.has(region.id), "the area of a fallen unlinked caster going");

        // A token actor casting for itself, and its token deleted: its synthetic
        // actor dies with the token (S2).
        const second = await makeNpc("Sorceress");
        await second.update({ name: "ZZ Token Sorceress", "prototypeToken.actorLink": false });
        const [own] = await scene.createEmbeddedDocuments("Token", [
          (await second.getTokenDocument({ x: 300, y: 600, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })).toObject()
        ]);
        tokens.push(own);
        await until(() => canvas.tokens.get(own.id), "the second unlinked token drawn");
        await fillPower(own.actor);
        const theirs = await cast(own.actor, blizzard);
        made.push(theirs);
        assert.equal(theirs.flags["azeroth-rpg"].caster, own.actor.uuid, "a token actor's card names another caster");
        const area = await placeArea({ item: blizzard, scene, origin: { x: 2000, y: 1000 }, flags: regionFlagsFromCard(theirs, own.actor, blizzard) });
        await drainSweeps();
        assert.isTrue(scene.regions.has(area.id), "the token actor's area did not stand");
        await own.delete();
        await until(() => !scene.regions.has(area.id), "the area of a deleted token's caster going");
      } finally {
        await clearBoard(scene, null, tokens);
      }
    });

    it("drops a token actor's last Sustain from the sheet's Stop without the world actor's list showing through (the final review of D-757)", async function () {
      this.timeout(120000);
      const w = game.system.azeroth.workflows;
      const sorceress = await makeNpc("Sorceress");
      await sorceress.update({ name: "ZZ Stopped Sorceress", "prototypeToken.actorLink": false });
      // The WORLD actor holds a Sustain, and an unlinked token's copy inherits it.
      const held = { spellId: null, uuid: "Compendium.azeroth-rpg.spells.Item.zzStoppedSpell01", name: "ZZ Held Spell", cast: "zzStoppedCast001", itemId: null };
      await sorceress.setFlag("azeroth-rpg", "sustaining", [held]);
      const [token] = await scene.createEmbeddedDocuments("Token", [
        (await sorceress.getTokenDocument({ x: 300, y: 900, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })).toObject()
      ]);
      const tokens = [token];
      try {
        assert.isFalse(token.actorLink, "the token is linked, so this proves nothing");
        await until(() => (token.actor?.getFlag("azeroth-rpg", "sustaining") ?? []).length === 1, "the token's copy inheriting the Sustain");
        // The sheet's Stop, on the token's copy: an UNSET on its delta let the
        // world actor's list show through, and the Stop dropped nothing.
        const ended = await w.endSustain({ actor: token.actor, uuid: held.uuid });
        assert.equal(ended?.cast, held.cast, "the Stop found nothing to end");
        await until(() => (token.actor.getFlag("azeroth-rpg", "sustaining") ?? []).length === 0, "the token's copy holding nothing after its Stop");
        assert.lengthOf(sorceress.getFlag("azeroth-rpg", "sustaining") ?? [], 1, "the Stop on the token's copy reached the world actor");
      } finally {
        await clearBoard(scene, null, tokens);
        await sorceress.unsetFlag("azeroth-rpg", "sustaining").catch(() => {});
      }
    });

    it("gives Open Hand's use at once when it is taken mid-day, and takes a spent one back when it is untaken (S4)", async function () {
      this.timeout(120000);
      const w = game.system.azeroth.workflows;
      const paladin = await makeCharacter({ name: "ZZ Mid-Day Paladin", classes: [["Paladin", 5]] });
      await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 1, "Lay on Hands stamped");
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 1);
      const talent = talentNamed(paladin, "Open Hand");
      await talent.update({ "system.taken": 1 });
      await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 2, "Open Hand's second use on the feature");
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 2, "the second use waits for a Long Rest");
      await fillMana(paladin);
      assert.ok(await w.useFeature({ actor: paladin, item: featureNamed(paladin, "Lay on Hands") }), "Lay on Hands refused");
      await until(() => featureNamed(paladin, "Lay on Hands").system.uses.value === 1, "the use struck");
      await talent.update({ "system.taken": 0 });
      await until(() => featureNamed(paladin, "Lay on Hands")?.system?.uses?.max === 1, "Open Hand's use withdrawn");
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 0, "the spent use was handed back");
      // A second sync over an unchanged maximum writes nothing.
      const stamp = featureNamed(paladin, "Lay on Hands")._stats?.modifiedTime ?? null;
      await paladin.syncClassFeatures();
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 0);
      assert.equal(featureNamed(paladin, "Lay on Hands")._stats?.modifiedTime ?? null, stamp, "the restamp of an unchanged maximum wrote the feature");
    });
  });
}
