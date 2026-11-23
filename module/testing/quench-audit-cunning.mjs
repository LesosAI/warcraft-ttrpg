/**
 * **THE CLASS TALENT AUDIT'S ROGUE, PRIEST AND SHAMAN, LIVE** (D-1880 to D-1887; the lead,
 * 2026-11-22: *"Build these changes and ensure all automation and any animtaions/sounds work as
 * well"*).
 *
 * The rows, the readers and their consumers' censuses are Vitest (`rogue-talents.test.mjs`,
 * `priest-talents.test.mjs`, `shaman-talents.test.mjs`, the migration's). What only a world can
 * show is the real doors, and every changed feature or talent with a control is PRESSED on the
 * sheet (the Combat tab's own `useFeature` button, or the maneuver's `useManeuver`), never handed
 * to the workflow:
 *
 * - 04's Master of Shadows (a minute's state; an attack keeps the Hide, a blow ends both),
 *   Adrenaline (its Energy discounted off its own price), Death Mark (the naming), Combat
 *   Reflexes (the free Riposte, once a round); 02's Shadowstep (one creature named, refused in
 *   words with nothing spent);
 * - 04's Spirit Shell (6 Mana, 02's Ward at half the tier on the priest), Miracle (a minute of free
 *   Mend), Herald of the Void (one more Sustain); 02's Divine Hymn (refused with no target, nothing
 *   spent) and Mass Mend's tier plus 2 on its card;
 * - 04's Eye of the Storm (a Sustain of its own at 2 Mana), Tide of the Ancestors (its totem bound
 *   outside the tier's count), Flametongue (the Sustain held, no Fire conversion); 02's Forked
 *   Lightning (2 Mana).
 *
 * Every creature is a `ZZ` fixture, deleted in `after`. Written in the class pass; not run there (the
 * live pass runs it alone through `QUENCH_BATCH=azeroth-rpg.audit-cunning`).
 */

import { cleanup, made, makeCharacter, openSheet, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { AZEROTH } from "../config.mjs";
import { HERALD_FLAG, MIRACLE_FLAG, SHADOWS_FLAG, wardAmount } from "../rules/class-talents.mjs";
import { chooser, pick, sceneWith } from "./quench-chronomancer-common.mjs";

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

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const flagged = (actor, flag) => (actor.effects ?? []).find(e => e.flags?.["azeroth-rpg"]?.[flag]) ?? null;

/** A character of a class at a level, these talents taken, waiting for what each grants. */
async function characterWith(name, cls, { level = 20, ranks = {}, abilities = { int: 16, wis: 16, cha: 16, dex: 16 } } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], abilities });
  await actor._talentGrant;
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(actor, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(actor, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return actor;
}

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = await until(() => poolOf(actor, name), `the ${name} pool`);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(pool.max, value) });
  await until(() => poolOf(actor, name)?.value === Math.min(pool.max, value), `${name} at ${value}`);
}

/**
 * Press the feature's Use on the sheet, the roll dialog skipped and the die pinned. Answers the
 * pending card (null where the Use posts none) so a chooser the Use opens may be answered first.
 */
async function pressUse(actor, featureName, face = 15) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${featureName}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  control.click();
  const done = async () => {
    try { return await posted; } finally {
      unpin();
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      await sheet.close();
    }
  };
  return { feature, card: done() };
}

export function auditCunningBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The class talent audit's Rogue, Priest and Shaman (D-1880 to D-1887)", function () {
    after(async function () {
      this.timeout(120000);
      await cleanup();
    });

    /* ---- the Rogue ---- */

    it("MASTER OF SHADOWS: lays a minute's state that keeps the Hide through an attack, and a blow ends both (B10)", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ Audit Shade", "Rogue", { ranks: { "Master of Shadows": 1 } });
      const { card } = await pressUse(rogue, "Master of Shadows");
      assert.ok(await card, "the Use posted no card");
      await until(() => flagged(rogue, SHADOWS_FLAG), "the minute's state on the Rogue");
      const { conceal, reveal, isHidden } = await import("../effects/stealth.mjs");
      await conceal(rogue);
      await until(() => isHidden(rogue), "the Rogue hidden");
      await reveal(rogue, { acting: true, kind: "attack" });
      assert.isTrue(isHidden(rogue), "an attack made the Rogue visible inside the minute");
      const hp = rogue.system.health.value;
      await rogue.applyDamage(1, { struck: true, attack: true, location: "body" });
      await until(() => !flagged(rogue, SHADOWS_FLAG), "the blow ending the minute");
      await until(() => !isHidden(rogue), "the blow ending the Hide");
      assert.isBelow(rogue.system.health.value, hp, "the blow dealt nothing");
    });

    it("ADRENALINE: its own 2 Energy comes off at 1 for its rank, and a Combo Point is bought, once a round (decision 13, B12)", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ Audit Quickblade", "Rogue", { ranks: { Adrenaline: 2 } });
      await setPool(rogue, "energy", 6);
      await setPool(rogue, "comboPoints", 0);
      const { card } = await pressUse(rogue, "Adrenaline");
      await card;
      await until(() => poolOf(rogue, "comboPoints")?.value === 1, "the Combo Point bought");
      assert.equal(poolOf(rogue, "energy").value, 5, "the Energy was not discounted to its minimum of 1");
    });

    it("DEATH MARK: names one creature, refused in words with its Short Rest's use kept where none is targeted (B15)", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ Audit Marker", "Rogue", { ranks: { Rupture: 2, "Death Mark": 1 } });
      const mark = await until(() => featureNamed(rogue, "Death Mark"), "Death Mark granted");
      assert.equal(mark.system?.uses?.max, 1, "Death Mark is not once a Short Rest");
      const said = await warnings(async () => { const { card } = await pressUse(rogue, "Death Mark"); await card; });
      assert.isTrue(said.length > 0, "Death Mark with no creature named said nothing");
      assert.equal(mark.system?.uses?.value, 1, "a refused Death Mark struck its use");
    });

    it("SHADOWSTEP: 2 Combo Points, refused in words with nothing spent where no creature is named (B15)", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ Audit Stepper", "Rogue", { level: 20 });
      await setPool(rogue, "comboPoints", 3);
      const feature = await until(() => featureNamed(rogue, "Shadowstep"), "Shadowstep granted");
      assert.equal(feature.system.cost?.amount, 2, "Shadowstep does not cost 2 Combo Points");
      const said = await warnings(async () => { const { card } = await pressUse(rogue, "Shadowstep"); await card; });
      assert.isTrue(said.some(w => /target/i.test(w)), `no refusal in words: ${said.join(" | ")}`);
      assert.equal(poolOf(rogue, "comboPoints").value, 3, "a refused Shadowstep spent its points");
    });

    it("COMBAT REFLEXES: the sheet's Riposte costs no Combo Points, once a round", async function () {
      this.timeout(120000);
      const rogue = await characterWith("ZZ Audit Duellist", "Rogue", { ranks: { "Combat Reflexes": 1 } });
      await setPool(rogue, "comboPoints", 5);
      const sheet = await openSheet(rogue);
      const control = sheet.element.querySelector('[data-action="useManeuver"][data-maneuver="riposte"]');
      assert.ok(control, "the sheet draws no Riposte");
      const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === rogue.id && m.flags?.["azeroth-rpg"]?.kind === "maneuver")
        .then(([c]) => { made.push(c); return c; });
      control.click();
      const card = await posted;
      assert.equal(card.flags["azeroth-rpg"].cost, 0, "the Riposte was not free");
      assert.equal(poolOf(rogue, "comboPoints").value, 5, "the free Riposte spent points");
      await sheet.close();
    });

    /* ---- the Priest ---- */

    it("SPIRIT SHELL: 6 Mana, a school named, 02's Ward at half the tier on every ally within 20 feet (B13)", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Audit Shell", "Priest", { level: 9, ranks: { "Spirit Shell": 1 } });
      const mana = await until(() => poolOf(priest, "mana"), "the Mana pool");
      await setPool(priest, "mana", mana.max);
      const before = poolOf(priest, "mana").value;
      const { feature, card } = await pressUse(priest, "Spirit Shell");
      const app = await chooser(feature);
      await pick(app, game.i18n.localize(AZEROTH.schools.fire));
      assert.ok(await card, "the Use posted no card");
      await until(() => poolOf(priest, "mana").value === before - 6, "the 6 Mana paid");
      const ward = await until(() => (priest.effects ?? []).find(e => e.flags?.["azeroth-rpg"]?.priestWard), "02's Ward on the priest");
      assert.equal(ward.flags["azeroth-rpg"].priestWard.amount, wardAmount(priest.system.tier), "the Ward was not half the tier, rounded up");
    });

    it("MIRACLE: a minute's state, and Mend then costs no Mana (R2)", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Audit Miracle", "Priest", { level: 13, ranks: { Miracle: 1 } });
      const mana = await until(() => poolOf(priest, "mana"), "the Mana pool");
      await setPool(priest, "mana", mana.max);
      const { card } = await pressUse(priest, "Miracle");
      await card;
      await until(() => flagged(priest, MIRACLE_FLAG), "the minute's state on the priest");
      const before = poolOf(priest, "mana").value;
      const mend = await pressUse(priest, "Mend");
      await mend.card;
      assert.equal(poolOf(priest, "mana").value, before, "Mend took Mana inside the minute");
    });

    it("HERALD OF THE VOID: 8 Mana, a minute's state, teaching no spell (B7)", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Audit Herald", "Priest", { level: 13, ranks: { "Herald of the Void": 1 } });
      const mana = await until(() => poolOf(priest, "mana"), "the Mana pool");
      await setPool(priest, "mana", mana.max);
      const before = poolOf(priest, "mana").value;
      const { card } = await pressUse(priest, "Herald of the Void");
      await card;
      await until(() => flagged(priest, HERALD_FLAG), "the minute's state on the priest");
      assert.equal(poolOf(priest, "mana").value, before - 8, "the 8 Mana was not paid");
      assert.isUndefined(priest.items.find(i => i.type === "spell" && i.name === "Void Eruption"), "the capstone still taught Void Eruption");
    });

    it("DIVINE HYMN: refused in words with nothing spent where no creature is named (B5)", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ Audit Hymn", "Priest", { level: 20 });
      const mana = await until(() => poolOf(priest, "mana"), "the Mana pool");
      await setPool(priest, "mana", mana.max);
      const before = poolOf(priest, "mana").value;
      const said = await warnings(async () => { const { card } = await pressUse(priest, "Divine Hymn"); await card; });
      assert.isTrue(said.length > 0, "Divine Hymn with no creature named said nothing");
      assert.equal(poolOf(priest, "mana").value, before, "a refused Hymn spent Mana");
    });

    /* ---- the Shaman ---- */

    it("EYE OF THE STORM: 10 Mana and a Sustain of its own at 2 Mana a turn (B8)", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ Audit Storm", "Shaman", { level: 13, ranks: { "Eye of the Storm": 1 } });
      const mana = await until(() => poolOf(shaman, "mana"), "the Mana pool");
      await setPool(shaman, "mana", mana.max);
      const before = poolOf(shaman, "mana").value;
      const { card } = await pressUse(shaman, "Eye of the Storm");
      await card;
      const held = await until(() => (shaman.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e.identifier === "eye-of-the-storm"), "the Sustain held");
      assert.equal(held.upkeep?.mana, 2, "the upkeep is not 2 Mana");
      assert.equal(poolOf(shaman, "mana").value, before - 10, "the 10 Mana was not paid");
    });

    it("TIDE OF THE ANCESTORS: 10 Mana, its totem bound for the encounter outside the tier's count (B7)", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ Audit Tide", "Shaman", { level: 13, ranks: { "Tide of the Ancestors": 1 } });
      const mana = await until(() => poolOf(shaman, "mana"), "the Mana pool");
      await setPool(shaman, "mana", mana.max);
      const { card } = await pressUse(shaman, "Tide of the Ancestors");
      await card;
      const totem = await until(() => game.actors.find(a => a.getFlag("azeroth-rpg", "bond")?.ownerUuid === shaman.uuid && a.getFlag("azeroth-rpg", "bond")?.sourceName === "Tide of the Ancestors"), "the Tide totem bound");
      made.push(totem);
      assert.isTrue(totem.getFlag("azeroth-rpg", "bond").uncounted === true, "the Tide totem counts against the tier");
    });

    it("TIDE OF THE ANCESTORS at the turn start: allies within 30 feet of the totem regain the tier, and the condition chosen ends (the wave 2 review)", async function () {
      this.timeout(180000);
      const shaman = await characterWith("ZZ Audit Tidecaller", "Shaman", { level: 13, ranks: { "Tide of the Ancestors": 1 } });
      const ally = await makeCharacter({ name: "ZZ Audit Tide Ally", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }]);
      const mana = await until(() => poolOf(shaman, "mana"), "the Mana pool");
      await setPool(shaman, "mana", mana.max);
      const { card } = await pressUse(shaman, "Tide of the Ancestors");
      await card;
      const totem = await until(() => game.actors.find(a => a.getFlag("azeroth-rpg", "bond")?.ownerUuid === shaman.uuid && a.getFlag("azeroth-rpg", "bond")?.sourceName === "Tide of the Ancestors"), "the Tide totem bound");
      made.push(totem);
      // An encounter totem's token is its own copy (unlinked, `plantTotem`), which `getActiveTokens(true)`
      // never returns: the scene's own token for the actor is what was planted.
      await until(() => canvas.scene?.tokens?.some(t => t.actorId === totem.id), "the Tide totem planted");
      // Out of a fight an ally is a Party member (D-658, `countsAsAlly`), never a friendly token alone.
      await shaman.setParty(true);
      await ally.setParty(true);
      await ally.update({ "system.health.value": 1 });
      await ally.toggleStatusEffect("slowed", { active: true });
      await until(() => ally.statuses.has("slowed"), "the ally Slowed");
      // The GM's own client answers where no player of the shaman's is online.
      const { shamanTurnStart } = await import("../effects/audit-cunning.mjs");
      const lines = await shamanTurnStart(shaman);
      assert.isTrue(lines.some(l => l.includes(ally.name)), `the heal line names no ally: ${lines.join(" | ")}`);
      await until(() => ally.system.health.value === 1 + shaman.system.tier, "the tier restored");
      const app = await chooser(featureNamed(shaman, "Tide of the Ancestors"));
      await pick(app, `${ally.getActiveTokens(true)[0]?.name ?? ally.name}: ${game.i18n.localize(AZEROTH.conditions.slowed)}`);
      await until(() => !ally.statuses.has("slowed"), "the Slowed ended");
    });

    it("EYE OF THE STORM's strike card: one creature, once, refused in words otherwise (the wave 2 review)", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ Audit Eye Card", "Shaman", { level: 13, ranks: { "Eye of the Storm": 1 } });
      const foe = await makeCharacter({ name: "ZZ Audit Eye Foe", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await shaman.setFlag("azeroth-rpg", "sustaining", [{ spellId: null, uuid: null, name: "Eye of the Storm", itemId: null, cast: "zz", identifier: "eye-of-the-storm", targets: [], source: null, upkeep: { mana: 2, health: 0 } }]);
      const posted = untilHook("createChatMessage", 20000, m => m.flags?.["azeroth-rpg"]?.identifier === "eye-of-the-storm").then(([m]) => { made.push(m); return m; });
      const { shamanTurnStart } = await import("../effects/audit-cunning.mjs");
      await shamanTurnStart(shaman);
      const message = await posted;
      const { eyeApply } = await import("../effects/audit-cunning.mjs");
      canvas.tokens.setTargets([]);
      const none = await warnings(async () => { await eyeApply(message); });
      assert.isTrue(none.length > 0, "an Apply with nobody targeted said nothing");
      canvas.tokens.setTargets([foe.getActiveTokens(true)[0].id]);
      const hp = foe.system.health.value;
      assert.isTrue((await eyeApply(message))?.ok, "the strike was refused");
      await until(() => foe.system.health.value < hp, "the strike landed");
      const twice = await warnings(async () => { await eyeApply(message); });
      assert.isTrue(twice.length > 0, "a second Apply was not refused");
      canvas.tokens.setTargets([]);
    });

    it("FLAMETONGUE: 1 Mana and the Sustain held; FORKED LIGHTNING: 2 Mana (B11, B3)", async function () {
      this.timeout(120000);
      const shaman = await characterWith("ZZ Audit Flame", "Shaman", { level: 9, ranks: { Flametongue: 2 } });
      const mana = await until(() => poolOf(shaman, "mana"), "the Mana pool");
      await setPool(shaman, "mana", mana.max);
      let before = poolOf(shaman, "mana").value;
      const tongue = await pressUse(shaman, "Flametongue");
      await tongue.card;
      await until(() => (shaman.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.identifier === "flametongue"), "Flametongue held");
      assert.equal(poolOf(shaman, "mana").value, before - 1, "Flametongue did not cost 1 Mana");
      before = poolOf(shaman, "mana").value;
      const fork = await pressUse(shaman, "Forked Lightning");
      await fork.card;
      await until(() => poolOf(shaman, "mana").value === before - 2, "Forked Lightning's 2 Mana paid");
    });
  });
}
