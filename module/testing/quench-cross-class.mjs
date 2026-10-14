/**
 * **THE CROSS-CLASS RULINGS, LIVE** (D-778; the lead, 2026-10-03). One focused
 * test per ruling the phase builds, through the real doors:
 *
 * - O-157, *"selected Effects, not conditions."*: 02's Dispel ends the effects
 *   selected through the one chooser, greys a condition and a Ward Aegis Eternal
 *   marks with their reasons, and refuses with nothing paid where it may end
 *   nothing; 04's Unstable Affliction answers a Dispel with its Fel, and
 *   Everlasting Affliction at rank 2 holds on a failed Casting Test.
 * - O-158, *"Yes."*: Blast Wave's failed Test pushes a creature from the caster,
 *   Immovable refuses it, and Thunderstorm moves what it names.
 * - O-159, *"Yes."*: Frost Nova's Entangled prompts its Test at the held
 *   creature's turn, and a pass ends it.
 * - O-160, *"Yes."*: Devotion on a second class's Mend.
 * - O-161, *"Player can use them at anytime if selected."*: Taunt out of a fight,
 *   its Bane on a round of the world's clock.
 * - O-163, *"cost by the entry or 1 Power if not mentioned."*: Mirror Image's 2,
 *   Arcane Concentration's rank off it, and Felstep's 2 Health.
 * - O-165 and O-203, *"Yes."*: Frostbolt's hit drops the Speed 10 feet, and
 *   Permafrost 5 further.
 *
 * Written in Phase B2 and NOT run there (the brief: *"write it, register it ...
 * DO NOT RUN it"*). Run alone with `QUENCH_BATCH=azeroth-rpg.cross-class`. Every
 * document a test makes is deleted in `after`, a fight or a scene a test already
 * deleted excepted.
 */

import { cleanup, drainAreaWork, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { dispelOptionsOn } from "../effects/dispel.mjs";
import { SPEED_DROP_FLAG } from "../effects/speed-drop.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";

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
const health = actor => actor.system?.health?.value ?? 0;
const sustained = actor => actor.getFlag("azeroth-rpg", "sustaining") ?? [];

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
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** Hand the turn to an actor and wait for its own turn's work to land. */
async function turnOf(combat, actor) {
  const mine = combat.getCombatantsByActor(actor)[0];
  const index = combat.turns.findIndex(c => c.id === mine.id);
  if (index !== combat.turn) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.update({ turn: index });
    await settled;
  }
  await until(() => combat.combatant?.id === mine.id, `${actor.name}'s turn`);
  await settle();
  return mine;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Cross Class Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) await new Promise(r => setTimeout(r, 100));
  await settle();
  return scene;
}

/** A character of these classes with these talents taken and these spells known, waiting for each grant. */
async function characterWith(name, classes, { ranks = {}, spells = [], abilities = null } = {}) {
  const actor = await makeCharacter({ name, classes, spells, ...(abilities ? { abilities } : {}) });
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
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Fill a pool to its maximum. */
async function fill(actor, name) {
  await setPool(actor, name, poolOf(actor, name).max);
  return poolOf(actor, name);
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
async function use(actor, name, { targets = [], face = 18 } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** The chooser a feature opened, once rendered. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/** Pick these options by name in the chooser, select or checklist alike, and press its button. */
async function pick(app, names) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
    if (!option) throw new Error(`the chooser offers no ${names[0]}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) {
      const label = box.closest("label")?.textContent?.trim() ?? "";
      box.checked = names.some(n => label.startsWith(n));
    }
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** What was said through `ui.notifications.info` while this ran. */
async function infosDuring(fn) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const held = ui.notifications.info;
  const said = [];
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    await fn();
  } finally {
    if (own) ui.notifications.info = held;
    else delete ui.notifications.info;
  }
  return said;
}

/** 02's Dispel on one creature, these effects selected in its chooser, the die pinned. */
async function dispel(priest, target, names, face = 18) {
  const item = await until(() => featureNamed(priest, "Dispel"), "Dispel granted");
  const unpin = pinDie(face);
  try {
    const used = workflows().useFeature({ actor: priest, item, targets: [rowOf(target)] });
    await pick(await chooser(item), names);
    const card = await used;
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Press a Resist button with the die pinned. */
async function pressResist(button, message, face) {
  const unpin = pinDie(face);
  try {
    await CARD_ACTIONS.resistTest(button, message);
  } finally {
    unpin();
  }
}

export function crossClassBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The cross-class rulings (D-778)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- O-157: 02's Dispel ---------------------------------------------- */

    it("DISPEL: ends the effect selected, greys a condition with its reason, and pays its 4 Mana", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ XC Dispel", [["Priest", 5]], { abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ XC Dispel Ally", classes: [["Warrior", 3]] });
      const [hex] = await ally.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Hex", img: "icons/svg/aura.svg", flags: { "azeroth-rpg": { spell: "Item.zzhex" } } }]);
      await ally.toggleStatusEffect("prone", { active: true });
      await until(() => ally.statuses.has("prone"), "Prone on the ally");
      await fill(priest, "mana");
      const before = poolOf(priest, "mana").value;
      const item = await until(() => featureNamed(priest, "Dispel"), "Dispel granted");
      const used = workflows().useFeature({ actor: priest, item, targets: [rowOf(ally)] });
      const app = await chooser(item);
      const text = app.element.textContent.replace(/\s+/g, " ");
      const reason = game.i18n.format("AZEROTH.Dispel.Refuse.Condition", { conditions: game.i18n.localize(CONFIG.AZEROTH.conditions.prone) });
      assert.include(text, reason, "the condition is not greyed in words");
      await pick(app, ["ZZ Hex"]);
      const card = await used;
      made.push(card);
      assert.ok(card, "the Dispel posted no card");
      await until(() => !ally.effects.has(hex.id), "the effect selected ended");
      assert.isTrue(ally.statuses.has("prone"), "a condition was ended");
      assert.equal(poolOf(priest, "mana").value, before - 4, "the Dispel did not cost 4 Mana");
    });

    it("DISPEL: refuses with nothing paid where it may end nothing, and names Aegis Eternal beside the Ward it marks", async function () {
      this.timeout(120000);
      const priest = await characterWith("ZZ XC Dispel Aegis", [["Priest", 20]], { ranks: { "Spirit Shell": 1, "Aegis Eternal": 1 }, abilities: { wis: 16 } });
      const dispeller = await characterWith("ZZ XC Dispeller", [["Priest", 5]], { abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ XC Aegis Ally", classes: [["Warrior", 3]] });
      await fill(priest, "mana");
      assert.ok(await use(priest, "Ward", { targets: [rowOf(ally)] }), "the Ward was refused");
      const ward = await until(() => ally.effects.find(e => e.getFlag("azeroth-rpg", "priestWard")), "the Ward on the ally");
      const row = dispelOptionsOn(ally).find(r => r.id === ward.id);
      assert.deepInclude(row, { available: false, reason: "marked", by: "Aegis Eternal" });
      await fill(dispeller, "mana");
      const before = poolOf(dispeller, "mana").value;
      const said = await warnings(async () => {
        assert.isNull(await use(dispeller, "Dispel", { targets: [rowOf(ally)] }), "a Dispel with nothing to end was used");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Dispel.Nothing", { name: "Dispel", target: ally.name }));
      assert.equal(poolOf(dispeller, "mana").value, before, "a refused Dispel spent Mana");
      assert.isTrue(ally.effects.has(ward.id), "the marked Ward was ended");
    });

    it("UNSTABLE AFFLICTION and EVERLASTING AFFLICTION: a failed Casting Test holds the warlock's effect; an ended one strikes the dispeller", async function () {
      this.timeout(180000);
      const warlock = await characterWith("ZZ XC Warlock", [["Warlock", 13]], { ranks: { "Unstable Affliction": 1, "Everlasting Affliction": 2 } });
      const priest = await characterWith("ZZ XC Unstable Priest", [["Priest", 5]], { abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ XC Afflicted", classes: [["Warrior", 3]] });
      const [agony] = await ally.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Agony", origin: warlock.uuid,
        flags: { "azeroth-rpg": { tick: { kind: "damage", type: "shadow", amount: 2, rounds: 10, until: "", when: "startOfTurn", spellpower: false, source: warlock.uuid, castUuid: null, cast: null, name: "ZZ Agony" } } }
      }]);
      await fill(priest, "mana");
      // The gate's Casting Test fails on a 1: the effect holds.
      assert.ok(await dispel(priest, ally, ["ZZ Agony"], 1), "the Dispel was refused");
      await settle();
      assert.isTrue(ally.effects.has(agony.id), "Everlasting Affliction's gate let a failed Test end it");
      // On a 20 it ends, and Unstable Affliction answers.
      await fill(priest, "mana");
      const count = game.messages.size;
      assert.ok(await dispel(priest, ally, ["ZZ Agony"], 20), "the second Dispel was refused");
      await until(() => !ally.effects.has(agony.id), "the warlock's effect ended");
      const strike = await until(() => game.messages.contents.slice(count).find(m => m.flags?.["azeroth-rpg"]?.kind === "unstable"), "Unstable Affliction's card");
      made.push(strike);
      assert.equal(strike.flags["azeroth-rpg"].damageType, "fel");
      assert.equal(strike.flags["azeroth-rpg"].targets[0].actorId, priest.id, "the Fel is not on the dispeller");
    });

    /* ---- O-158: forced movement ------------------------------------------ */

    it("BLAST WAVE: a failed Test pushes the creature from the caster; IMMOVABLE refuses it in words", async function () {
      this.timeout(180000);
      const mage = await characterWith("ZZ XC Blast", [["Mage", 9]], { ranks: { "Blast Wave": 1 }, abilities: { int: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const warrior = await characterWith("ZZ XC Immovable", [["Warrior", 5]], { ranks: { Immovable: 1 } });
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }, { actor: warrior, x: 900, y: 1000 }]);
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const ghoulToken = ghoul.getActiveTokens(true)[0].document;
      const warriorToken = warrior.getActiveTokens(true)[0].document;
      await fill(mage, "mana");
      const card = await cast(mage, "Blast Wave", { targets: targetSnapshots([ghoul.getActiveTokens(true)[0], warrior.getActiveTokens(true)[0]]) });
      assert.ok(card, "Blast Wave was refused");
      const forced = card.flags["azeroth-rpg"].forced;
      assert.deepInclude(forced, { on: "fail", toward: "away", from: "caster" });
      assert.isAtLeast(forced.feet, 10, "Blast Wave's rank did not add its 5 feet");
      const resist = index => parsed(card).querySelector(`[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`);
      const x = ghoulToken.x;
      await pressResist(resist(0), card, 1);
      await until(() => ghoulToken.x === x + (forced.feet / 5) * 100, "the ghoul pushed from the caster");
      const wx = warriorToken.x;
      const said = await infosDuring(async () => {
        await pressResist(resist(1), card, 1);
        await settle();
      });
      assert.equal(warriorToken.x, wx, "Immovable's holder was pushed");
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Forced.Refuse.Immovable", { name: warriorToken.name, source: "Blast Wave" }));
    });

    it("THUNDERSTORM: the creatures the Use names are moved 10 feet away from the shaman once it succeeds", async function () {
      this.timeout(180000);
      const shaman = await characterWith("ZZ XC Storm", [["Shaman", 13]], { ranks: { Thunderstorm: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }]);
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const token = ghoul.getActiveTokens(true)[0].document;
      await fill(shaman, "mana");
      const y = token.y;
      assert.ok(await use(shaman, "Thunderstorm", { targets: targetSnapshots([ghoul.getActiveTokens(true)[0]]), face: 20 }), "Thunderstorm was refused");
      await until(() => token.y === y + 200, "the ghoul moved 10 feet away");
      assert.equal(token.x, 1000, "the push left the line from the shaman");
    });

    /* ---- O-159: the Test to break free ----------------------------------- */

    it("FROST NOVA: the Entangled carries its escape, the held creature's turn prompts the Test, and a pass ends it", async function () {
      this.timeout(240000);
      const mage = await characterWith("ZZ XC Nova", [["Mage", 9]], { ranks: { "Frost Nova": 2 }, abilities: { int: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([mage, ghoul]);
      await turnOf(combat, mage);
      await fill(mage, "mana");
      const card = await cast(mage, "Frost Nova", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Frost Nova was refused");
      const button = parsed(card).querySelector('[data-action="resistTest"][data-purpose="spell"][data-target-index="0"]');
      await pressResist(button, card, 1);
      const held = await until(() => ghoul.effects.find(e => e.statuses?.has("entangled")), "the ghoul Entangled");
      const escape = held.getFlag("azeroth-rpg", ESCAPE_FLAG);
      assert.deepInclude(escape, { condition: "entangled", on: "action", resilience: "reflex", banes: 1 });
      assert.include(escape.talents, "Frost Nova");
      const count = game.messages.size;
      await turnOf(combat, ghoul);
      const prompt = await until(() => game.messages.contents.slice(count).find(m => m.flags?.["azeroth-rpg"]?.purpose === "escape"), "the escape's prompt", 30000);
      made.push(prompt);
      const test = parsed(prompt).querySelector('[data-action="resistTest"][data-purpose="escape"]');
      assert.equal(test?.dataset.effectId, held.id, "the prompt names another effect");
      await pressResist(test, prompt, 20);
      await until(() => !ghoul.effects.has(held.id), "the Entangled ended on a pass");
      const said = await warnings(async () => { await pressResist(test, prompt, 20); });
      assert.isAbove(said.length, 0, "a second press was not refused");
    });

    /* ---- O-160: a second class's healing feature ------------------------- */

    it("DEVOTION: a Paladin-Priest's Mend restores the rank more, and names the talent", async function () {
      this.timeout(120000);
      const both = await characterWith("ZZ XC Devotion", [["Paladin", 5], ["Priest", 5]], { ranks: { Devotion: 2 } });
      const mend = await until(() => featureNamed(both, "Mend"), "Mend granted");
      await until(() => String(featureNamed(both, "Mend")?.system?.heal ?? "").endsWith("+2"), "Devotion's rank on Mend's heal");
      assert.include(featureNamed(both, "Mend").system.modifiedBy ?? [], "Devotion");
      assert.ok(mend);
    });

    /* ---- O-161: a Use at any time --------------------------------------- */

    it("TAUNT: used out of a fight, its Bane runs a round of the world's clock", async function () {
      this.timeout(120000);
      const warrior = await characterWith("ZZ XC Taunt", [["Warrior", 5]], { ranks: { Taunt: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await setPool(warrior, "rage", 10);
      assert.ok(await use(warrior, "Taunt", { targets: [rowOf(ghoul)] }), "Taunt was refused out of a fight");
      const laid = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane")), "Taunt's Bane");
      assert.equal(laid.duration?.units, "seconds", "out of a fight the span is not the world's clock");
      assert.equal(laid.duration?.value, 6, "out of a fight the span is not one round");
    });

    /* ---- O-163: the upkeep by the entry ---------------------------------- */

    it("MIRROR IMAGE: the turn's start pays 07's 2 Mana, and 1 under Arcane Concentration", async function () {
      this.timeout(240000);
      const mage = await characterWith("ZZ XC Upkeep", [["Mage", 9]], { spells: ["Mirror Image"], abilities: { int: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      assert.ok(await cast(mage, "Mirror Image"), "Mirror Image was refused");
      await until(() => sustained(mage).some(e => e.name === "Mirror Image"), "Mirror Image held");
      assert.deepEqual(sustained(mage).find(e => e.name === "Mirror Image").upkeep, { mana: 2, health: 0 }, "the entry's upkeep was not recorded");
      const combat = await fightWith([mage, ghoul]);
      await turnOf(combat, ghoul);
      await fill(mage, "mana");
      const full = poolOf(mage, "mana").value;
      await turnOf(combat, mage);
      await until(() => poolOf(mage, "mana").value === full - 2, "07's 2 Mana paid");
      await talentNamed(mage, "Arcane Concentration").update({ "system.taken": 1 });
      await until(() => talentNamed(mage, "Arcane Concentration").system.taken === 1, "Arcane Concentration at rank 1");
      await turnOf(combat, ghoul);
      await fill(mage, "mana");
      await turnOf(combat, mage);
      await until(() => poolOf(mage, "mana").value === full - 1, "1 Mana under Arcane Concentration");
    });

    it("FELSTEP: the turn's start pays 2 Health rather than Mana, never below 1", async function () {
      this.timeout(240000);
      const warlock = await characterWith("ZZ XC Felstep", [["Warlock", 5]], { spells: ["Felstep"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      assert.ok(await cast(warlock, "Felstep"), "Felstep was refused");
      await until(() => sustained(warlock).some(e => e.name === "Felstep"), "Felstep held");
      const combat = await fightWith([warlock, ghoul]);
      await turnOf(combat, ghoul);
      await warlock.update({ "system.health.value": warlock.system.health.max });
      await fill(warlock, "mana");
      const mana = poolOf(warlock, "mana").value;
      const before = health(warlock);
      await turnOf(combat, warlock);
      await until(() => health(warlock) === before - 2, "2 Health paid");
      assert.equal(poolOf(warlock, "mana").value, mana, "Felstep's upkeep took Mana");
    });

    /* ---- O-165 and O-203: the Speed drop --------------------------------- */

    it("FROSTBOLT: a hit drops the Speed 10 feet until the end of the caster's next turn, and Permafrost 5 further", async function () {
      this.timeout(180000);
      const mage = await characterWith("ZZ XC Frostbolt", [["Mage", 9]], { ranks: { Frostbolt: 1, Permafrost: 1 }, abilities: { int: 16 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([mage, ghoul]);
      await turnOf(combat, mage);
      await fill(mage, "mana");
      const card = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)], face: 10 });
      assert.ok(card, "Frostbolt was refused");
      assert.isTrue(card.rolls[0].outcome.success, "the pinned face missed");
      assert.isBelow(card.rolls[0].outcome.sl, 3, "the pinned face reached Slowed instead");
      const drop = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", SPEED_DROP_FLAG)), "the Speed drop");
      assert.equal(drop.getFlag("azeroth-rpg", SPEED_DROP_FLAG).feet, 15, "Permafrost's 5 did not ride the drop");
      assert.equal(drop.start?.combatant, combat.getCombatantsByActor(mage)[0].id, "the drop is not keyed on the caster's turn");
    });
  });
}
