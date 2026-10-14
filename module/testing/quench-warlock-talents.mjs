/**
 * **THE WARLOCK'S THIRTY-SIX, LIVE** (04-TALENTS; D-775, the talent plan's Phase
 * 11). One focused test per talent the phase builds, through the real doors:
 *
 * - Affliction: Malediction's tick and minute; 02's Life Tap with Improved Life
 *   Tap; Siphon; Curse of Agony's tick; Drain Soul's Mana; 02's Curse paid on its
 *   success, its Bane on a failed Resist, and Pandemic's further targets; Soul
 *   Swap; Haunt; Everlasting Affliction's minute; Soul Reaper.
 * - Demonology: Demonic Aegis's school; Master Summoner's free summoning;
 *   Demonic Sacrifice's Ward and lock; Demonic Knowledge's Boon; Command Demon.
 * - Destruction: Ruin's higher die and Mana; Backdraft's Half-Action; Shadow
 *   Bolt's rank; Shadowburn's Mana; Emberstorm; Fel Fire; Soul Fire; Cataclysm.
 *
 * Unstable Affliction and Everlasting Affliction's rank 2 wait on what 02's
 * Dispel ends (D-774's question) and have nothing here to run.
 *
 * Written in Phase 11 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.warlock-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

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

const workflows = () => game.system.azeroth.workflows;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.label).filter(Boolean);
const usesOf = (actor, name) => featureNamed(actor, name)?.system?.uses?.value ?? null;
const sustained = actor => actor.getFlag("azeroth-rpg", "sustaining") ?? [];
const ticksOn = actor => actor.effects.filter(e => e.getFlag("azeroth-rpg", "tick")?.kind);
const bondOf = actor => actor?.getFlag?.("azeroth-rpg", "bond") ?? null;

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  speedDropped: false, health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing", 30000);
  return combat;
}

/** A Warlock at a level with these talents taken and these spells known, waiting for what each grants or teaches. */
async function warlockWith(name, { level = 9, ranks = {}, spells = [], abilities = { cha: 16, int: 14 } } = {}) {
  const warlock = await makeCharacter({ name, classes: [["Warlock", level]], spells, abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(warlock, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(warlock, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return warlock;
}

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Fill a pool to its maximum. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await setPool(actor, name, pool.max);
  return poolOf(actor, name);
}

/** Set a creature's Health. */
async function setHealth(actor, value) {
  await actor.update({ "system.health.value": value });
  await until(() => actor.system.health.value === value, `${actor.name} at ${value} Health`);
}

/** Cast through the workflow, the die pinned. */
async function cast(actor, name, { targets = [], face = 18, ...extra } = {}) {
  const spell = await until(() => spellNamed(actor, name), `${name} known`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().castSpell({ actor, spell, targets, ...extra });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Use a feature through the workflow, the die pinned. */
async function use(actor, name, { targets = [], face = 18, dc = 10, ...extra } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets, dc, ...extra });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** The chooser a feature opened, once rendered. */
async function chooser(item, ms = 10000) {
  for (let i = 0; i < ms / 50; i++) {
    const app = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (app?.rendered && app.element?.querySelector(".azeroth-choose")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`${item.name} opened no chooser`);
}

/** Pick one option by name in a chooser that takes one, and press its button. */
async function pickOne(item, name) {
  const app = await chooser(item);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...(select?.options ?? [])].find(o => o.textContent.trim().startsWith(name));
  if (!option) throw new Error(`${item.name}'s chooser offers no ${name}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

/** Summon a demon through Bound Demon, answering its chooser (and Demonic Aegis's school, where asked). */
async function summon(warlock, demon, { school = null } = {}) {
  const item = await until(() => featureNamed(warlock, "Bound Demon"), "Bound Demon held");
  await fill(warlock, "mana");
  const used = workflows().useFeature({ actor: warlock, item });
  await pickOne(item, demon);
  if (school) await pickOne(item, school);
  const card = await used;
  if (card) made.push(card);
  return until(() => game.actors.find(a => bondOf(a)?.ownerUuid === warlock.uuid && bondOf(a)?.kind === "demon"), `${demon} bound`);
}

/** A tick of the warlock's laid straight on a creature, as a card's Apply lays one (D-770). */
async function layTickOf(warlock, victim, { amount = 2, type = "shadow", rounds = 10, name = "Curse of Agony" } = {}) {
  const [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [{
    name, origin: warlock.uuid,
    flags: { "azeroth-rpg": { tick: {
      kind: "damage", type, amount, rounds, until: "", when: "startOfTurn", spellpower: false,
      source: warlock.uuid, castUuid: null, cast: null, name
    } } }
  }]);
  return effect;
}

/** The Boons a skipped casting dialog takes for this actor (the dialog's own reading). */
async function castingBoons(actor) {
  const { defaultChoice } = await import("../applications/roll-dialog.mjs");
  return defaultChoice(actor, { kind: "casting", title: "ZZ", modifiers: [], targets: [] })?.boons ?? 0;
}

export function warlockTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Warlock's thirty-six (D-775)", function () {
    let restore = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      // Every creature a test bound is a world actor the fixtures did not make.
      for (const a of game.actors.filter(x => x.name?.startsWith("ZZ ") || String(bondOf(x)?.ownerName ?? "").startsWith("ZZ "))) {
        if (!made.includes(a)) made.push(a);
      }
      await cleanup();
    });

    /* ---- Affliction ------------------------------------------------------ */

    it("MALEDICTION: Curse of Agony's tick deals the rank more, and Curse of Weakness lasts a minute a rank longer", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Maled", { ranks: { "Curse of Agony": 1, Malediction: 2 }, spells: ["Curse of Weakness"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const bare = await warlockWith("ZZ WlT Maled Bare", { ranks: { "Curse of Agony": 1 } });
      await fill(bare, "mana");
      const plain = await cast(bare, "Curse of Agony", { targets: [rowOf(ghoul)] });
      await fill(warlock, "mana");
      const card = await cast(warlock, "Curse of Agony", { targets: [rowOf(ghoul)] });
      assert.equal(Number(card.flags["azeroth-rpg"].tick.amount), Number(plain.flags["azeroth-rpg"].tick.amount) + 2, "Malediction did not raise the tick");
      await fill(warlock, "mana");
      const weak = await cast(warlock, "Curse of Weakness", { targets: [rowOf(ghoul)] });
      assert.include(textOf(weak), "3 minutes", "Curse of Weakness's span is not three minutes");
    });

    it("02's LIFE TAP with IMPROVED LIFE TAP: Health spent through the chooser, 4 Mana a Health at rank 2, never below 1", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Tap", { ranks: { "Improved Life Tap": 2 } });
      await setPool(warlock, "mana", 0);
      await setHealth(warlock, 10);
      const item = await until(() => featureNamed(warlock, "Life Tap"), "Life Tap held");
      const used = workflows().useFeature({ actor: warlock, item });
      await pickOne(item, "3 Health");
      const card = await used;
      if (card) made.push(card);
      await until(() => warlock.system.health.value === 7, "3 Health spent");
      assert.equal(poolOf(warlock, "mana").value, 12, "the Mana is not 4 a Health");
      await setHealth(warlock, 1);
      const said = await warnings(async () => {
        assert.isNull(await workflows().useFeature({ actor: warlock, item }), "Life Tap took the last Health");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.LifeTap.NoHealth", { name: "Life Tap" }));
    });

    it("SIPHON: Shadow that cost a creature Health restores the highest loss at the warlock's next turn, twice the rank at most", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Siphon", { ranks: { Siphon: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warlock, ghoul]);
      await giveTurn(combat, warlock);
      await setHealth(warlock, warlock.system.health.max - 10);
      await ghoul.applyDamage(3, { struck: true, attack: false, type: "shadow", by: warlock });
      await until(() => warlock.getFlag("azeroth-rpg", "siphon")?.highest === 3, "the loss recorded");
      await giveTurn(combat, ghoul);
      const before = warlock.system.health.value;
      await giveTurn(combat, warlock);
      await until(() => warlock.system.health.value === before + 3, "3 Health restored");
    });

    it("DRAIN SOUL: a death under the held spell returns 07's 3 Mana and the rank", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Drain", { ranks: { "Improved Life Tap": 1, "Drain Soul": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const card = await cast(warlock, "Drain Soul", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Drain Soul was refused");
      await until(() => sustained(warlock).some(e => e.name === "Drain Soul"), "Drain Soul held");
      await setPool(warlock, "mana", 0);
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, type: "fel", by: warlock, spell: true });
      await until(() => poolOf(warlock, "mana").value === 5, "3 Mana and 2 more back");
    });

    it("02's CURSE with PANDEMIC: three named at rank 2, four refused before anything is paid; the Mana paid on a success alone", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Pandemic", { ranks: { "Curse of Agony": 1, Pandemic: 2 } });
      const ghouls = [];
      for (let i = 0; i < 4; i++) ghouls.push(await makeNpc("Plagued Ghoul"));
      const full = (await fill(warlock, "mana")).value;
      const said = await warnings(async () => {
        assert.isNull(await use(warlock, "Curse", { targets: ghouls.map(g => rowOf(g)) }), "four creatures were cursed");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Curse.TooMany", { name: "Curse", max: 3 }));
      assert.equal(poolOf(warlock, "mana").value, full, "the refusal cost Mana");
      const failed = await use(warlock, "Curse", { targets: ghouls.slice(0, 3).map(g => rowOf(g)), face: 2, dc: 25 });
      assert.isFalse(failed.flags["azeroth-rpg"].success ?? true);
      assert.equal(poolOf(warlock, "mana").value, full, "a failed Curse spent Mana");
      assert.isNull(parsed(failed).querySelector('[data-action="resistTest"]'), "a failed Curse forced a Resist");
      const card = await use(warlock, "Curse", { targets: ghouls.slice(0, 3).map(g => rowOf(g)), face: 18, dc: 10 });
      await until(() => poolOf(warlock, "mana").value === full - 4, "4 Mana on the success");
      assert.ok(parsed(card).querySelector('[data-action="resistTest"]'), "the success forced no Resist");
    });

    it("02's CURSE: a failed Spirit Resist lays a Bane on every Test for the card's minutes", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Curse", { ranks: { Malediction: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const card = await use(warlock, "Curse", { targets: [rowOf(ghoul)], face: 18, dc: 10 });
      assert.equal(card.flags["azeroth-rpg"].curse?.minutes, 2, "Malediction's minute is not on the card");
      const button = parsed(card).querySelector('[data-action="resistTest"]');
      const unpin = pinDie(1);
      try { await CARD_ACTIONS.resistTest(button, card); } finally { unpin(); }
      await until(() => ghoul.effects.some(e => e.getFlag("azeroth-rpg", "laidBane")?.source === "Curse"), "the Curse's Bane laid");
    });

    it("SOUL SWAP: every ongoing effect of the warlock's moves from the first creature to the second, whole", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Swap", { level: 11, ranks: { "Soul Swap": 1 } });
      const first = await makeNpc("Plagued Ghoul");
      const second = await makeNpc("Plagued Ghoul");
      await layTickOf(warlock, first, { amount: 3, rounds: 7 });
      const said = await warnings(async () => {
        assert.isNull(await use(warlock, "Soul Swap", { targets: [rowOf(first)] }), "Soul Swap named one creature");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.SoulSwap.TwoTargets", { name: "Soul Swap" }));
      // Named the other way round: the one carrying the effects is taken first.
      const card = await use(warlock, "Soul Swap", { targets: [rowOf(second), rowOf(first)] });
      assert.ok(card, "Soul Swap was refused");
      await until(() => ticksOn(second).length === 1 && ticksOn(first).length === 0, "the tick moved");
      const moved = ticksOn(second)[0].getFlag("azeroth-rpg", "tick");
      assert.equal(moved.amount, 3);
      assert.equal(moved.rounds, 7, "the turns left did not travel");
      assert.equal(moved.source, warlock.uuid);
    });

    it("HAUNT: each tick of the warlock's on the target deals the rank more, once, and its death restores the tier", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Haunt", { level: 13, ranks: { Haunt: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const bare = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const said = await warnings(async () => {
        assert.isNull(await use(warlock, "Haunt", { targets: [rowOf(bare)] }), "a creature carrying nothing was haunted");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Haunt.Nothing", { name: "Haunt", target: bare.name }));
      await layTickOf(warlock, ghoul, { amount: 2 });
      const card = await use(warlock, "Haunt", { targets: [rowOf(ghoul)], face: 18, dc: 10 });
      assert.ok(card, "Haunt was refused");
      await until(() => ticksOn(ghoul)[0]?.getFlag("azeroth-rpg", "tick")?.amount === 4, "the tick raised by 2");
      await fill(warlock, "mana");
      await use(warlock, "Haunt", { targets: [rowOf(ghoul)], face: 18, dc: 10 });
      await settle();
      assert.equal(ticksOn(ghoul)[0].getFlag("azeroth-rpg", "tick").amount, 4, "a second Haunt raised it again");
      await setHealth(warlock, warlock.system.health.max - 10);
      const before = warlock.system.health.value;
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, type: "physical", by: warlock });
      await until(() => warlock.system.health.value === before + (warlock.system.tier ?? 1), "the tier restored on its death");
    });

    it("EVERLASTING AFFLICTION: Curse of Agony's tick counts ten turns more a rank, and a timed curse's span a minute more", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Everlast", { level: 13, ranks: { "Curse of Agony": 1, "Everlasting Affliction": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const card = await cast(warlock, "Curse of Agony", { targets: [rowOf(ghoul)] });
      assert.equal(card.flags["azeroth-rpg"].tick.rounds, 20, "the tick did not count on with the minute");
      assert.include(textOf(card), "2 minutes");
    });

    it("SOUL REAPER: the turn's start holds it for nothing, and its target's death restores twice the tier", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Reaper", { level: 17, ranks: { "Everlasting Affliction": 1, "Soul Reaper": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await layTickOf(warlock, ghoul);
      await fill(warlock, "mana");
      const card = await cast(warlock, "Soul Reaper", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Soul Reaper was refused");
      await until(() => sustained(warlock).some(e => e.name === "Soul Reaper"), "Soul Reaper held");
      const combat = await fightWith([warlock, ghoul]);
      await giveTurn(combat, ghoul);
      const held = poolOf(warlock, "mana").value;
      await giveTurn(combat, warlock);
      await settle();
      assert.equal(poolOf(warlock, "mana").value, held, "the upkeep charged Soul Reaper");
      await setHealth(warlock, warlock.system.health.max - 20);
      const before = warlock.system.health.value;
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, type: "fel", by: warlock, spell: true });
      await until(() => warlock.system.health.value === before + 2 * (warlock.system.tier ?? 1), "twice the tier restored");
    });

    /* ---- Demonology ------------------------------------------------------ */

    it("DEMONIC AEGIS: at rank 2 the summoning asks Fel or Shadow, and the demon carries Ward 1 against it", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Aegis", { ranks: { "Demonic Aegis": 2 } });
      const demon = await summon(warlock, "Imp", { school: "Shadow" });
      assert.equal(bondOf(demon).school, "shadow", "the bond does not carry the school");
      await until(() => (demon.system.ward?.shadow ?? 0) >= 1, "Ward 1 against Shadow");
    });

    it("MASTER SUMMONER: Bound Demon costs no action, and a second demon may be held at rank 2", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Master", { ranks: { "Fel Domination": 1, "Master Summoner": 2 } });
      const item = await until(() => featureNamed(warlock, "Bound Demon"), "Bound Demon held");
      await until(() => item.system.action === null, "the summoning costs no action");
      await summon(warlock, "Imp");
      await fill(warlock, "mana");
      const used = workflows().useFeature({ actor: warlock, item });
      await pickOne(item, "Voidwalker");
      const card = await used;
      if (card) made.push(card);
      await until(() => game.actors.filter(a => bondOf(a)?.ownerUuid === warlock.uuid && bondOf(a)?.kind === "demon").length === 2, "two demons held");
    });

    it("DEMONIC SACRIFICE: the demon goes for Mana and its Ward for the encounter, and is refused at the summoning until a Long Rest", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Sacrifice", { level: 11, ranks: { "Demonic Sacrifice": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const demon = await summon(warlock, "Voidwalker");
      await demon.update({ "system.ward.shadow": 2 });
      await until(() => (demon.system.ward?.shadow ?? 0) >= 2, "the demon's Ward");
      const combat = await fightWith([warlock, ghoul]);
      await giveTurn(combat, warlock);
      await setPool(warlock, "mana", 0);
      const before = warlock.system.ward?.shadow ?? 0;
      const card = await use(warlock, "Demonic Sacrifice");
      assert.ok(card, "Demonic Sacrifice was refused");
      await until(() => poolOf(warlock, "mana").value === 2 * (warlock.system.tier ?? 1), "twice the tier in Mana");
      await until(() => (warlock.system.ward?.shadow ?? 0) === before + 2, "the demon's Ward on the warlock");
      assert.deepEqual((warlock.getFlag("azeroth-rpg", "sacrificed") ?? []).map(e => e.name), ["Voidwalker"]);
      const item = featureNamed(warlock, "Bound Demon");
      await fill(warlock, "mana");
      const said = await warnings(async () => {
        const used = workflows().useFeature({ actor: warlock, item });
        await pickOne(item, "Voidwalker");
        assert.isNull(await used, "the sacrificed demon was summoned again");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Sacrifice.Locked", { name: "Voidwalker" }));
      await combat.delete();
      await until(() => !warlock.effects.some(e => e.getFlag("azeroth-rpg", "talentBuff") === "Demonic Sacrifice"), "the Ward lifted with the fight");
      await warlock.longRest();
      await until(() => !warlock.getFlag("azeroth-rpg", "sacrificed"), "the lock cleared at the Long Rest");
    });

    it("DEMONIC KNOWLEDGE: at rank 2 a Boon on every Casting Test while a Bound Demon stands", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Know", { ranks: { "Demonic Embrace": 1, "Demonic Empowerment": 1, "Demonic Knowledge": 2 } });
      assert.equal(await castingBoons(warlock), 0, "a Boon with no demon");
      await summon(warlock, "Imp");
      assert.equal(await castingBoons(warlock), 1, "no Boon with the demon held");
    });

    it("COMMAND DEMON: a Casting Test binds the GM's demon until the next Long Rest, counted against nothing", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Command", { level: 13, ranks: { "Command Demon": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const said = await warnings(async () => {
        assert.isNull(await use(warlock, "Command Demon", { targets: [rowOf(ghoul)] }), "a ghoul was commanded");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.CommandDemon.NotDemon", { name: "Command Demon", target: ghoul.name, feet: 20 }));
      await summon(warlock, "Voidwalker");
      const imp = await makeNpc("Imp");
      const card = await use(warlock, "Command Demon", { targets: [rowOf(imp)], face: 18, dc: 10 });
      assert.ok(card, "Command Demon was refused");
      await until(() => bondOf(imp)?.until === "longRest" && bondOf(imp)?.uncounted === true, "the Imp bound until the Long Rest, uncounted");
      await warlock.longRest();
      await until(() => !bondOf(imp), "the Imp released at the Long Rest");
    });

    /* ---- Destruction ----------------------------------------------------- */

    it("RUIN: a spell that drops a character to 0 rolls the injury twice and keeps the higher, with 2 Mana at rank 2", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Ruin", { ranks: { Ruin: 2 } });
      const victim = await makeCharacter({ name: "ZZ WlT Ruin Victim", classes: [["Warrior", 3]] });
      await setPool(warlock, "mana", 0);
      const posted = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "critical");
      await victim.applyDamage(victim.system.health.value + 5, { struck: true, attack: false, type: "shadow", by: warlock, spell: true });
      const card = await posted;
      made.push(card);
      assert.lengthOf(card.rolls, 2, "the injury was rolled once");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Card.CriticalTwiceHigher", { totals: card.rolls.map(r => r.total).join(", ") }));
      await until(() => poolOf(warlock, "mana").value === 2, "Ruin's 2 Mana");
    });

    it("BACKDRAFT: an SL 3 Casting Test lays a Half-Action on the next spell that costs an action, a use struck when it is taken", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT Backdraft", { ranks: { "Shadow Bolt": 1, Backdraft: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([warlock, ghoul]);
      const mine = await giveTurn(combat, warlock);
      await fill(warlock, "mana");
      const first = await cast(warlock, "Shadow Bolt", { targets: [rowOf(ghoul)], face: 20 });
      assert.isAtLeast(first.flags["azeroth-rpg"].sl, 3);
      await until(() => (warlock.getFlag("azeroth-rpg", "nextSpell") ?? []).some(e => e.cast === "half"), "the Half-Action promised");
      await mine.resetBudget();
      const left = usesOf(warlock, "Backdraft");
      await fill(warlock, "mana");
      const second = await cast(warlock, "Shadow Bolt", { targets: [rowOf(ghoul)], face: 10 });
      assert.include(labels(second), "Backdraft");
      await until(() => usesOf(warlock, "Backdraft") === left - 1, "a use struck");
      assert.equal(mine.getFlag("azeroth-rpg", "budget")?.halfActions, 1, "the bolt cost an action");
    });

    it("SHADOW BOLT: the rank rides the Rating", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Bolt", { ranks: { "Shadow Bolt": 3 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const card = await cast(warlock, "Shadow Bolt", { targets: [rowOf(ghoul)] });
      assert.ok((card.rolls[0].options.provenance ?? []).some(p => p.label === "Shadow Bolt" && p.value === 3));
    });

    it("SHADOWBURN: a spell's kill in a fight returns 3 Mana a rank, an attack's none", async function () {
      this.timeout(240000);
      const warlock = await warlockWith("ZZ WlT Burn", { level: 11, ranks: { Shadowburn: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const other = await makeNpc("Plagued Ghoul");
      await fightWith([warlock, ghoul, other]);
      await setPool(warlock, "mana", 0);
      await other.applyDamage(other.system.health.value + 5, { struck: true, attack: true, type: "physical", by: warlock });
      await settle();
      assert.equal(poolOf(warlock, "mana").value, 0, "an attack's kill returned Mana");
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, type: "shadow", by: warlock, spell: true });
      await until(() => poolOf(warlock, "mana").value === 6, "6 Mana back");
    });

    it("EMBERSTORM: a Fire spell costs 2 less, never below 2", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Ember", { level: 11, ranks: { Backdraft: 1, Emberstorm: 1 }, spells: ["Incinerate"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const spell = await until(() => spellNamed(warlock, "Incinerate"), "Incinerate known");
      const entry = spell.system.mana;
      const before = (await fill(warlock, "mana")).value;
      const card = await cast(warlock, "Incinerate", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Incinerate was refused");
      await until(() => poolOf(warlock, "mana").value === before - Math.max(Math.min(entry, 2), entry - 2), "the cost 2 less, floored at 2");
    });

    it("FEL FIRE: the line ticked makes a Fire spell's damage Fel and adds the rank", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT FelFire", { level: 13, ranks: { "Fel Fire": 2 }, spells: ["Searing Pain"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(warlock, "mana");
      const plain = await cast(warlock, "Searing Pain", { targets: [rowOf(ghoul)] });
      await fill(warlock, "mana");
      const fel = await cast(warlock, "Searing Pain", { targets: [rowOf(ghoul)], talentLines: ["fel-fire"] });
      assert.equal(fel.flags["azeroth-rpg"].damageByTarget[0].damage, plain.flags["azeroth-rpg"].damageByTarget[0].damage + 2, "the rank did not ride the converted spell");
      assert.include(labels(fel), "Fel Fire");
    });

    it("SOUL FIRE: out of a fight the promise holds a round of the world's clock (D-778); in one, Health spent and the next spell this turn counted at SL 3 with the tier added", async function () {
      this.timeout(300000);
      const warlock = await warlockWith("ZZ WlT SoulFire", { level: 13, ranks: { "Shadow Bolt": 1, "Soul Fire": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      await setHealth(warlock, warlock.system.health.max);
      const whole = warlock.system.health.value;
      assert.ok(await use(warlock, "Soul Fire"), "Soul Fire was refused out of a fight");
      await until(() => warlock.system.health.value === whole - 2 * (warlock.system.tier ?? 1), "twice the tier in Health out of a fight");
      const promised = (warlock.getFlag("azeroth-rpg", "nextSpell") ?? []).find(e => e.source === "soul-fire");
      assert.isNumber(promised?.turn?.clock, "out of a fight the promise is not held to the world's clock");
      // Once per Short Rest: the promise and the use are given back for the fight's.
      await warlock.unsetFlag("azeroth-rpg", "nextSpell");
      await featureNamed(warlock, "Soul Fire").update({ "system.uses.value": 1 });
      await until(() => usesOf(warlock, "Soul Fire") === 1, "the use given back");
      const combat = await fightWith([warlock, ghoul]);
      await giveTurn(combat, warlock);
      await setHealth(warlock, warlock.system.health.max);
      const before = warlock.system.health.value;
      assert.ok(await use(warlock, "Soul Fire"), "Soul Fire was refused in a fight");
      await until(() => warlock.system.health.value === before - 2 * (warlock.system.tier ?? 1), "twice the tier in Health");
      await fill(warlock, "mana");
      const card = await cast(warlock, "Shadow Bolt", { targets: [rowOf(ghoul)], face: 2, dc: 30 });
      assert.isTrue(card.rolls[0].outcome.success, "the promised SL 3 did not hold");
      assert.isAtLeast(card.rolls[0].outcome.sl, 3);
      assert.include(labels(card), "Soul Fire");
    });

    it("CATACLYSM: the Test opens at DC 22 and the cast costs 6 Health, where 07 states 26 and 10", async function () {
      this.timeout(180000);
      const warlock = await warlockWith("ZZ WlT Cata", { level: 17, ranks: { "Fel Fire": 1, Cataclysm: 1 } });
      await until(() => spellNamed(warlock, "Cataclysm"), "Cataclysm learned");
      await fill(warlock, "mana");
      await setHealth(warlock, warlock.system.health.max);
      const before = warlock.system.health.value;
      const card = await cast(warlock, "Cataclysm");
      assert.ok(card, "Cataclysm was refused");
      assert.equal(card.rolls[0].options.dc, 22, "the Test was not against DC 22");
      assert.equal(warlock.system.health.value, before - 6, "the cast did not cost 6 Health");
    });
  });
}
