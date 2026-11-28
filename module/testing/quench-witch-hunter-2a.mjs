/**
 * **THE WITCH HUNTER'S GROUNDWORK, BREWS AND TOME, THROUGH THE REAL CONTROLS** (the Witch Hunter plan's wave 2a-A).
 * Three batches, each run alone (`QUENCH_BATCH=azeroth-rpg.witch-hunter-groundwork`, `-brews`, `-tome`), every test
 * making its own Human Witch Hunter (`ZZ WH ...`) and leaving nothing another test reads:
 *
 * - **groundwork**: the class item, Tempo and Energy, the kit's medallion and its Neck slot, the Human-only door, the
 *   Tempo idle drain at a round's end and the Guard that empties it.
 * - **brews**: the rest's brewing window, the Prepare window pressed (create first, spoil after), the Hunter panel's
 *   own Use button on every one of the nineteen brews, overdose on the dialog, the non-maker's poison, an oil's hit,
 *   each bomb's card and the Decoction.
 * - **tome**: the Tome begun, the record of types damaged, the learning Test at a Long Rest, Studied's numbers at the
 *   attack door, the weakness Bane on a bomb's Resist, Studied's Tempo, and Parry paid in Tempo.
 *
 * Needs the class, its brews and its medallion in the compiled packs (`packs:parse`, then `packs:build` through the
 * harness). Written in wave 2a-A and run in the lead's live pass (wave 4).
 */

import { cleanup, give, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, settle, untilHook, warnings } from "./fixtures.mjs";
import { fightWith, freshTurn, sceneWith, textOf, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { BREW_IDENTIFIERS, brewOf } from "../rules/witch-hunter-brews.mjs";
import { BREW_EFFECT_FLAG, BREW_WINDOW_FLAG, OIL_FLAG, TOME_FLAG, WEAKNESS_CARD_FLAG } from "../rules/witch-hunter-standing.mjs";
import { REMAINS_FLAG } from "../rules/laid-immune.mjs";

const SCOPE = "azeroth-rpg";
const tempoOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tempo") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const brewsHeld = actor => actor.items.filter(i => i.type === "gear" && BREW_IDENTIFIERS.includes(i.system?.identifier));
const carriers = actor => actor.effects.filter(e => e.flags?.[SCOPE]?.[BREW_EFFECT_FLAG]);

/** A Human Witch Hunter at a level, its Tome begun on a second type and its formulas known. */
async function hunterWith(name, { level = 1, second = "beast", formulas = null, abilities = { str: 16, con: 14, int: 14, wis: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [["Witch Hunter", level]], race: "Human", abilities });
  await until(() => tempoOf(actor) && energyOf(actor), "the Tempo and Energy pools");
  const tome = await import("../effects/witch-hunter-tome.mjs");
  if (second) await tome.startTome(actor, { choice: second });
  if (formulas) await (await import("../effects/witch-hunter-brews.mjs")).chooseFormulas(actor, { picks: formulas });
  return actor;
}

/** A brew from the gear pack given to an actor, as though brewed by `maker`. */
async function brewFor(actor, identifier, { maker = actor, doses = 1, type = null } = {}) {
  const name = brewOf(identifier).name;
  const item = await give(actor, name, PACK_FOR.equipment);
  const spellDC = (await import("../effects/witch-hunter-brews.mjs")).whSpellDC(maker);
  await item.update({ "system.quantity": doses, [`flags.${SCOPE}.whBrewed`]: { maker: maker.uuid, generation: 0, brewed: doses, type, school: null, spellDC, tier: maker.system?.tier ?? 1 } });
  return item;
}

/** Press the Hunter panel's own Use for one brew, with the roll dialog skipped and the d20 pinned. */
async function pressBrewUse(actor, item, { face = 10, targets = [] } = {}) {
  if (canvas?.scene || targets.length) canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-action="whUseBrew"][data-item-id="${item.id}"]`);
  if (!control) throw new Error(`the Hunter panel draws no Use for ${item.name}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && ["whBrewUse", "feature"].includes(m.flags?.[SCOPE]?.kind))
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    unpin();
    if (canvas?.scene) canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-groundwork                                 */
/* ------------------------------------------------------------------ */

export function witchHunterGroundworkBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's groundwork: the class, Tempo, Energy, the kit and the medallion (wave 2a-A)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.classes").getIndex();
      if (!index.some(e => e.name === "Witch Hunter")) throw new Error("the classes pack holds no Witch Hunter: run packs:parse and rebuild the packs");
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("the class item names Tempo capped at 5, Energy, four branches and the medallion in its kit", async function () {
      this.timeout(60000);
      const cls = (await game.packs.get("azeroth-rpg.classes").getDocuments()).find(d => d.name === "Witch Hunter");
      assert.equal(cls.system.momentum?.name, "tempo");
      assert.equal(cls.system.power?.name, "energy");
      assert.equal(cls.system.branches.length, 4, "Wolf, Gryphon, Bear and Cat");
      assert.ok(JSON.stringify(cls.system.kit ?? []).toLowerCase().includes("medallion"), "the kit carries the witch hunter's medallion");
    });

    it("a Human Witch Hunter holds Tempo at 0 capped at 5, Energy at 10, and 48 talents", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WH Pools", { second: null });
      assert.equal(tempoOf(wh).max, 5, "Tempo's cap");
      assert.equal(tempoOf(wh).value, 0, "a new hunter holds none");
      assert.equal(energyOf(wh).max, 10, "Energy's 10");
      assert.equal(wh.items.filter(i => i.type === "talent" && !i.system?.race).length, 48, "four branches of twelve");
    });

    it("the medallion worn in the Neck slot adds its rarity to the Spell DC, and none in a bag", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WH Medallion", { second: null });
      const { whSpellDC } = await import("../effects/witch-hunter-brews.mjs");
      const base = whSpellDC(wh);
      assert.ok(Number.isFinite(base), "a Spell DC off Intelligence");
      const medallion = await give(wh, "Witch hunter's medallion");
      assert.equal(medallion.system.slot, "neck", "the Neck slot");
      await medallion.update({ "system.rarity": "rare" });
      assert.equal(whSpellDC(wh), base, "carried, not worn: nothing");
      await medallion.update({ "system.equipped": true });
      await until(() => whSpellDC(wh) === base + 2, "Rare adds 2");
    });

    it("Tempo empties at a round's end when two rounds pass with no hit, and the Guard empties it", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WH Drain", { second: null });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }]);
      const combat = await fightWith([wh, foe]);
      const pool = tempoOf(wh);
      await wh.updatePool({ itemId: pool.itemId, kind: "momentum", value: 3 });
      await until(() => tempoOf(wh).value === 3, "3 Tempo");
      // Round 1 ends, then round 2: no hit in either, so it empties (the fight's first round stands in for no hit).
      for (let i = 0; i < 2 && tempoOf(wh).value > 0; i++) {
        const settled = untilHook("combatRound", 60000, c => c.id === combat.id);
        await combat.nextRound();
        await settled;
      }
      await until(() => tempoOf(wh).value === 0, "the idle drain emptied the Tempo");
      // The Guard empties it too (05 §11's Guard; `momentum.mjs#lossOnGuard`).
      await wh.updatePool({ itemId: pool.itemId, kind: "momentum", value: 2 });
      await until(() => tempoOf(wh).value === 2, "2 Tempo");
      await freshTurn(wh, 1);
      const sheet = await openSheet(wh);
      sheet.element.querySelector('section[data-tab="combat"] [data-action="guard"]')?.click();
      await until(() => tempoOf(wh).value === 0, "the Guard emptied the Tempo");
      await sheet.close();
    });

    it("only a Human opens the class (R5), and the class takes no second class (P1)", async function () {
      this.timeout(60000);
      const { AZEROTH } = await import("../config.mjs");
      assert.equal(AZEROTH.classRaceOnly["witch-hunter"], "human");
      assert.ok((AZEROTH.creationOnlyClasses ?? []).includes("witch-hunter"), "creation-only, the Death Knight's path");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-brews                                      */
/* ------------------------------------------------------------------ */

export function witchHunterBrewsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's brews through the real controls (wave 2a-A)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get(PACK_FOR.equipment).getIndex({ fields: ["system.identifier"] });
      for (const id of BREW_IDENTIFIERS) if (!index.some(e => e.system?.identifier === id)) throw new Error(`the gear pack holds no ${id}: run packs:parse and rebuild the packs`);
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("a Short Rest opens the brewing; the Prepare window pressed creates the new brews and spoils the old", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Prepare", { formulas: ["liferoot-tonic", "kingsblood-draught", "peacebloom-draught", "mageroyal-draught", "hunters-oil", "liquid-fire"] });
      const old = await brewFor(wh, "liquid-fire", { doses: 1 });
      await wh.shortRest({ food: await give(wh, "Bread and cheese") });
      await until(() => wh.getFlag(SCOPE, BREW_WINDOW_FLAG)?.open === true, "the brewing window open");
      const card = [...game.messages].reverse().find(m => m.speaker?.actor === wh.id && /Prepare/.test(m.content ?? ""));
      assert.ok(card, "the rest card says the brewing is open");
      const sheet = await openSheet(wh);
      sheet.element.querySelector('section[data-tab="combat"] [data-action="whPrepare"]').click();
      const app = await until(() => foundry.applications.instances.get(`azeroth-brew-prepare-${wh.id}`)?.rendered ? foundry.applications.instances.get(`azeroth-brew-prepare-${wh.id}`) : null, "the Prepare window");
      const step = id => app.element.querySelector(`[data-action="brewStep"][data-identifier="${id}"][data-by="1"]`);
      step("liferoot-tonic").click();
      await settle();
      await until(() => app.element.querySelector('[data-brew-count="liferoot-tonic"]')?.textContent?.trim() === "1", "one Liferoot dose");
      step("hunters-oil").click();
      await until(() => app.element.querySelector('[data-brew-count="hunters-oil"]')?.textContent?.trim() === "1", "one Hunter's oil dose");
      app.element.querySelector(".azeroth-brew-submit").click();
      await until(() => brewsHeld(wh).some(i => i.system.identifier === "liferoot-tonic") && !wh.items.get(old.id), "the new brews made and the old spoiled");
      const oil = brewsHeld(wh).find(i => i.system.identifier === "hunters-oil");
      assert.equal(oil.flags[SCOPE].whBrewed.type, "undead", "Hunter's oil names the first type known by default");
      // The window is closed by a write AFTER the brews are made and the old ones spoiled (`prepareBrews`' order), so it
      // is waited for, never read at once (wave 4's second run caught it mid-flight; CLAUDE.md §15's race).
      await until(() => wh.getFlag(SCOPE, BREW_WINDOW_FLAG)?.open === false, "the window closes with the brewing");
      const refused = await warnings(() => (async () => (await import("../effects/witch-hunter-brews.mjs")).prepareBrews(wh, { picks: { "liferoot-tonic": 1 } }))());
      assert.ok(refused.some(w => /only when they finish a Short or Long Rest/.test(w)), `a second brewing refused: ${refused.join(" | ")}`);
      await sheet.close();
    });

    it("every elixir drunk through the panel's own Use lays its carrier, and Toxicity past the limit is overdose on the dialog", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WH Elixirs", { abilities: { str: 16, con: 10, int: 14, wis: 14 } });
      const counted = ["liferoot-tonic", "kingsblood-draught", "mageroyal-draught", "goldthorn-draught", "fadeleaf-drops", "wintersbite-draught", "gromsblood-draught", "firebloom-cordial"];
      for (const id of counted) {
        const item = await brewFor(wh, id);
        const card = await pressBrewUse(wh, item);
        assert.ok(card, `${id}: the card`);
        await until(() => carriers(wh).some(e => e.flags[SCOPE][BREW_EFFECT_FLAG].identifier === id), `${id}: its carrier`);
      }
      const { toxicityOf } = await import("../rules/witch-hunter-standing.mjs");
      const tox = toxicityOf({ effects: wh.effects, conMod: 0 });
      assert.equal(tox.limit, 1, "Constitution 10: limit 1");
      assert.equal(tox.overdose, counted.length - 1, "each elixir past the limit is a point");
      // The overdose read off a real dialog (wave 2d-B): the sheet's Athletics opened, its automatic line ticked.
      const { throughDialog } = await import("./quench-witch-hunter-common.mjs");
      const dialogSheet = await openSheet(wh);
      try {
        const { lines } = await throughDialog(wh, () => dialogSheet.element.querySelector('[data-action="rollSkill"][data-skill="athletics"]').click());
        const line = lines.find(l => l.name === "line-wh-overdose");
        assert.ok(line?.checked, `the overdose line is on the dialog, ticked: ${lines.map(l => l.name).join(", ")}`);
      } finally { await dialogSheet.close(); }
      // Kingsblood draught's Damage Rating, Mageroyal's refill, Goldthorn's refusal and the Firebloom DC.
      assert.equal(wh.system.damageBonus.attack.all, 1, "Kingsblood adds 1 at tier 1");
      assert.ok(wh.system.conditionImmunities.includes("poisoned"), "Goldthorn refuses Poisoned");
      // Silverleaf tonic ends every elixir, counts nothing and lays no carrier.
      const silver = await brewFor(wh, "silverleaf-tonic");
      await pressBrewUse(wh, silver);
      await until(() => carriers(wh).length === 0, "every elixir ended");
    });

    it("Peacebloom draught heals at once and counts for a minute; a Decoction acts until the next Long Rest", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Peacebloom", { level: 14 });
      await wh.update({ "system.health.value": 1 });
      const peace = await brewFor(wh, "peacebloom-draught");
      await pressBrewUse(wh, peace);
      await until(() => (wh.system.health.value ?? 0) > 1, "Peacebloom's Health");
      const dec = await brewFor(wh, "decoction", { type: "dragonkin" });
      await pressBrewUse(wh, dec);
      await until(() => carriers(wh).some(e => e.flags[SCOPE][BREW_EFFECT_FLAG].identifier === "decoction"), "the Decoction's carrier");
      const second = await brewFor(wh, "decoction", { type: "dragonkin" });
      const said = await warnings(() => pressBrewUse(wh, second).catch(() => null));
      assert.ok(said.some(w => /as many Decoctions/.test(w)), `the second Decoction refused: ${said.join(" | ")}`);
      await wh.longRest();
      await until(() => !carriers(wh).some(e => e.flags[SCOPE][BREW_EFFECT_FLAG].identifier === "decoction"), "the Long Rest ends the Decoction");
    });

    it("a non-Witch Hunter who drinks one gains nothing and, on a failed Body Test, takes the 10 Nature tick", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Maker");
      const ally = await makeCharacter({ name: "ZZ WH Drinker", classes: [["Warrior", 1]], race: "Human" });
      const tonic = await brewFor(ally, "liferoot-tonic", { maker: wh });
      await pressBrewUse(ally, tonic, { face: 1 });
      await until(() => ally.effects.some(e => e.flags?.[SCOPE]?.tick?.amount === "10"), "the poison's tick laid");
      assert.equal(carriers(ally).length, 0, "no effect of the elixir");
    });

    it("an oil coats one weapon and its hit adds its damage against its type; the fight's end takes it off", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WH Oil");
      const sword = await give(wh, "Longsword", PACK_FOR.weapon);
      await sword.update({ "system.equipped": true });
      const oil = await brewFor(wh, "hunters-oil", { type: "humanoid" });
      await pressBrewUse(wh, oil);
      await until(() => sword.getFlag(SCOPE, OIL_FLAG)?.identifier === "hunters-oil", "the oil on the sword");
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 900, y: 1000, side: "hostile" }]);
      const combat = await fightWith([wh, foe]);
      await freshTurn(wh, 1);
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const unpin = pinDie(20);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      try {
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === wh.id && m.rolls?.length);
        await game.system.azeroth.actions.attackWithDialog(wh, sword, null, { budget: "none" });
        const [card] = await posted;
        made.push(card);
        assert.ok(/Hunter's oil/.test(textOf(card)), "the card names the oil's damage");
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
        canvas.tokens.setTargets([]);
      }
      // `endCombat()` opens core's confirm in v14 and nothing presses it (the batch hung on it in wave 4, as
      // `quench-audit-engine.mjs` and `quench-damage.mjs` found); deleting the fight runs `_onExit` for every
      // combatant, which is the `_leaveFight` that takes the oil off.
      await combat.delete();
      await until(() => !sword.getFlag(SCOPE, OIL_FLAG), "the oil off with the fight");
    });

    it("each bomb posts one card with a Resist row per target at the maker's Spell DC; Silver dust's failure strips Immune (Physical)", async function () {
      this.timeout(300000);
      const wh = await hunterWith("ZZ WH Bombs");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      for (const id of ["liquid-fire", "sungrass-flash", "icecap-flask", "silver-dust", "rowan-dust"]) {
        const bomb = await brewFor(wh, id);
        const card = await pressBrewUse(wh, bomb, { targets: [tokenOf(foe)] });
        assert.ok(card, `${id}: its card`);
        assert.equal(card.flags[SCOPE].kind, "feature", `${id}: the feature card's shape`);
        assert.equal(card.flags[SCOPE].targets.length, 1, `${id}: one row`);
        assert.ok(/Resist|Resilience/.test(card.content), `${id}: its Resist row`);
      }
      // Silver dust's failure, through the card's OWN Resist pressed for the creature with a failed die (wave 2d-B; the
      // review's section E): a creature Immune to Physical damage loses it, read off its derived `immune`.
      await foe.update({ "system.immune": ["physical"] });
      await until(() => (tokenOf(foe).actor.system.immune ?? []).includes("physical"), "Immune (Physical) set");
      const dust = await pressBrewUse(wh, await brewFor(wh, "silver-dust"), { targets: [tokenOf(foe)] });
      const posted = untilHook("createChatMessage", 30000, m => m.rolls?.length && m.id !== dust.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
      const { pressCard } = await import("./quench-chronomancer-common.mjs");
      const { release } = await pressCard(dust, 'button[data-action="resistTest"][data-target-index="0"]', { face: 1 });
      try { await posted; } finally { await release(); }
      await until(() => tokenOf(foe).actor.effects.some(e => e.flags?.[SCOPE]?.[REMAINS_FLAG]), "the strip laid");
      await until(() => !(tokenOf(foe).actor.system.immune ?? []).includes("physical"), "Immune (Physical) stripped off the derived immune");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  azeroth-rpg.witch-hunter-tome                                       */
/* ------------------------------------------------------------------ */

export function witchHunterTomeBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Tome of Silver and Ash and Studied through the real doors (wave 2a-A)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.classes").getIndex();
      if (!index.some(e => e.name === "Witch Hunter")) throw new Error("the classes pack holds no Witch Hunter: run packs:parse and rebuild the packs");
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("the Tome begins with Undead and the choice, and the panel draws both", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WH Tome Start", { second: null });
      const tome = await import("../effects/witch-hunter-tome.mjs");
      await tome.startTome(wh, { choice: "beast" });
      assert.deepEqual(wh.getFlag(SCOPE, TOME_FLAG).known, ["undead", "beast"]);
      const sheet = await openSheet(wh);
      assert.ok(/Undead/.test(sheet.element.querySelector(".azeroth-hunter-panel")?.textContent ?? ""), "the panel names the types known");
      await sheet.close();
    });

    it("a blow on a type not known is recorded, and the Long Rest's Investigation Test teaches it", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WH Learn");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 900, y: 1000, side: "hostile" }]);
      const target = tokenOf(foe).actor;
      // `struck: true`, as every door that lands a blow passes it: without it `applyDamage` writes the Health and returns
      // before `afterBlow`, which is where the Tome's record is kept (wave 4's live run).
      await target.applyDamage(1, { struck: true, attack: true, by: wh, type: "physical" });
      await until(() => (wh.getFlag(SCOPE, TOME_FLAG)?.damaged ?? []).length > 0, "the type damaged recorded");
      await wh.longRest();
      await until(() => wh.getFlag(SCOPE, TOME_FLAG)?.learnOpen === "long", "the learning chance open");
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(20);
      try {
        const sheet = await openSheet(wh);
        sheet.element.querySelector('section[data-tab="combat"] [data-action="whLearn"]').click();
        await until(() => wh.getFlag(SCOPE, TOME_FLAG)?.learned === true, "the Test made");
        await sheet.close();
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
      }
      assert.ok(wh.getFlag(SCOPE, TOME_FLAG).known.length === 3, "a natural 20 teaches the type");
    });

    it("a weapon hit on a Studied type gains the tier, the Tome's Pierce, and 1 more Tempo", async function () {
      this.timeout(240000);
      const wh = await hunterWith("ZZ WH Studied", { second: "humanoid" });
      const tome = await import("../effects/witch-hunter-tome.mjs");
      await tome.writeTome(wh, { ...wh.getFlag(SCOPE, TOME_FLAG), studied: ["humanoid"] });
      const sword = await give(wh, "Longsword", PACK_FOR.weapon);
      await sword.update({ "system.equipped": true });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 900, y: 1000, side: "hostile" }]);
      await fightWith([wh, foe]);
      await freshTurn(wh, 1);
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const unpin = pinDie(20);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      try {
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === wh.id && m.rolls?.length);
        await game.system.azeroth.actions.attackWithDialog(wh, sword, null, {});
        const [card] = await posted;
        made.push(card);
        const text = textOf(card);
        assert.ok(/Studied/.test(text), "Studied's damage named on the card");
        assert.ok(/Tome of Silver and Ash/.test(text), "the Tome's Pierce named on the card");
        // 05 §11's +1 and +1 at SL 2 (a natural 20), and Studied's 1 more.
        await until(() => tempoOf(wh).value >= 2, "the hit's Tempo with Studied's 1 more");
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
        canvas.tokens.setTargets([]);
      }
    });

    it("a bomb's card records the weakness its row names, and a Parry is paid in Tempo", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Weakness", { second: "humanoid" });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: wh, x: 800, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const flash = await brewFor(wh, "sungrass-flash");
      const card = await pressBrewUse(wh, flash, { targets: [tokenOf(foe)] });
      const record = card.flags[SCOPE][WEAKNESS_CARD_FLAG];
      assert.deepEqual(record?.types, ["humanoid"], "Humanoid's row names Sungrass flash");
      // Read off the Resist's OWN dialog (wave 2d-B; the review's section E), never `resistLinesFor` called by hand.
      const { resistDialog } = await import("./quench-witch-hunter-common.mjs");
      const { lines } = await resistDialog(card, 'button[data-action="resistTest"][data-target-index="0"]', tokenOf(foe).actor);
      const bane = lines.find(l => l.name === "line-talentBane");
      assert.ok(bane?.checked, `the Bane on the Resist's dialog: ${lines.map(l => l.text).join(" | ")}`);
      assert.include(bane.text, "Tome of Silver and Ash", "named for the Tome");
      const { parryPoolFor } = await import("../rules/reactions.mjs");
      assert.equal(parryPoolFor(wh.poolSnapshot())?.name, "tempo", "Parry is paid in Tempo, never Energy");
    });
  });
}
