/**
 * **THE CLASS TALENT AUDIT'S WARRIOR, PALADIN AND RANGER, LIVE** (class agent A, D-1870 to D-1879; the
 * lead, 2026-11-22: *"Build these changes and ensure all automation and any animtaions/sounds work as
 * well"*).
 *
 * The rows, the readers and their consumers' censuses are Vitest (`warrior-talents.test.mjs`,
 * `paladin-talents.test.mjs`, `ranger-talents.test.mjs`, `audit-martial.test.mjs` and the migration's).
 * What only a world can show is the real doors, and every changed feature or talent that has a control is
 * PRESSED on the sheet (the Combat tab's own `useFeature` button), never handed to the workflow:
 *
 * - the Warrior: Second Wind's twice the tier plus Constitution, Last Stand at 6 Rage, Whirlwind's action and
 *   its two attacks a creature, Unbreakable's Reaction laying the redirect; Frenzy's Rage the first time below
 *   half; Blood Craze refusing Frightened over 7 Rage; Precise Strike a line on the attack's own dialog;
 * - the Paladin: Lay on Hands at five times the tier, Mercy of Uther's full heal and the condition it ends,
 *   Mending Word's heal on a friend, Avenging Wrath's encounter Boon and its climb, Beacon of Hope's hold on an
 *   ally, Divine Storm a Half-Action, Seal of Command once an encounter; Fanaticism's Zeal at a fight's start;
 * - the Ranger: Readiness's refilled Focus, Rapid Fire an action once an encounter, Barrage a Half-Action,
 *   Snare's standing count, and Aimed Shot and Kill Shot as lines on the attack's own dialog.
 *
 * Every document is a `ZZ` fixture, deleted in `after`. Written in the class pass; not run there (the live
 * pass runs it alone through `QUENCH_BATCH=azeroth-rpg.audit-martial`).
 */

import { cleanup, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SENTINEL_FLAG } from "../rules/guardian.mjs";
import { LAID_BOON_FLAG } from "../rules/banes.mjs";
import { AVENGING_WRATH, BEACON_OF_HOPE, UNBREAKABLE } from "../rules/audit-martial.mjs";

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
const textOf = message => (new DOMParser().parseFromString(message?.content ?? "", "text/html").body.textContent ?? "").replace(/\s+/g, " ");

/** A character of a class at a level, these talents taken, waiting for what each grants. */
async function characterWith(name, cls, { level = 9, ranks = {}, abilities = { str: 14, con: 14, cha: 16, wis: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(actor, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(actor, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return actor;
}

/** Set a pool to a value, never past its cap; returns the value set. */
async function setPool(actor, name, value) {
  const pool = await until(() => poolOf(actor, name), `${actor.name}'s ${name}`);
  const want = Math.min(value, pool.max ?? value);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: want });
  await until(() => poolOf(actor, name).value === want, `${want} ${name}`);
  return want;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Audit Martial Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])); i++) await new Promise(r => setTimeout(r, 100));
  await settle();
  return scene;
}

/** A started fight holding these actors, the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  // A creature standing on the viewed scene joins by its token, as it does at the table: the ally rule
  // finds a combatant by its token first (`canvas/engaged.mjs#combatantIn`), and one made from the actor
  // alone left Divine Storm's friend out of the fight and so out of its allies (the live pass's probe).
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const t = a.getActiveTokens(true)[0]?.document ?? null;
    return t ? { actorId: a.id, tokenId: t.id, sceneId: t.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/**
 * **PRESS THE SHEET'S OWN USE** for a feature: the Combat tab's `useFeature` button, the die pinned, the
 * creatures targeted on the canvas, and the card it posts (or null where the press made none within the wait).
 */
async function press(actor, featureName, { face = 18, targets = [], ms = 20000, after = null } = {}) {
  const item = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  // Core's `setTargets` broadcasts the viewed scene's id, so it is called only where a scene is viewed.
  if (canvas.scene) canvas.tokens?.setTargets?.(targets.map(a => a.getActiveTokens(true)[0]?.id).filter(Boolean));
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  try {
    const control = await until(() => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`), `${featureName}'s Use drawn`);
    // `untilHook` resolves the hook's arguments, so the message is the first.
    const posted = untilHook("createChatMessage", ms, m => m.flags?.["azeroth-rpg"]?.itemId === item.id).then(([m]) => m).catch(() => null);
    control.click();
    if (after) await after(item);
    const card = await posted;
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
    if (canvas.scene) canvas.tokens?.setTargets?.([]);
    await sheet.close().catch(() => {});
  }
}

/** Pick options by name in the chooser a feature opened, and press its button. */
async function pick(item, names, ms = 10000) {
  let app = null;
  for (let i = 0; i < ms / 50 && !app; i++) {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (found?.rendered && found.element?.querySelector(".azeroth-choose")) app = found;
    else await new Promise(r => setTimeout(r, 50));
  }
  if (!app) throw new Error(`${item.name} opened no chooser`);
  const boxes = [...app.element.querySelectorAll('input[type="checkbox"]')];
  if (boxes.length) {
    for (const box of boxes) box.checked = names.some(n => (box.closest("label")?.textContent ?? "").includes(n));
  } else {
    const select = app.element.querySelector("#azeroth-choose-select");
    const option = [...(select?.options ?? [])].find(o => names.some(n => o.textContent.trim().startsWith(n)));
    if (!option) throw new Error(`${item.name}'s chooser offers none of ${names.join(", ")}`);
    select.value = option.value;
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

export function auditMartialBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The class talent audit's Warrior, Paladin and Ranger (D-1870 to D-1879)", function () {
    let restore = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await cleanup();
    });

    /* ---- the Warrior ---- */

    it("02's Second Wind: pressed, its card heals twice the tier plus the Constitution modifier, for 6 Rage (A13)", async function () {
      this.timeout(60000);
      const warrior = await characterWith("ZZ Martial Winded", "Warrior", { level: 9 });
      await setPool(warrior, "rage", 10);
      const card = await press(warrior, "Second Wind");
      assert.ok(card, "Second Wind's press posted no card");
      const want = 2 * warrior.system.tier + warrior.system.abilities.con.mod;
      assert.equal(card.flags["azeroth-rpg"].heal, want, "the heal is not twice the tier plus Constitution");
      assert.equal(poolOf(warrior, "rage").value, 4, "Second Wind did not take its 6 Rage");
    });

    it("04's Last Stand: pressed, it takes 6 Rage and grants twice the tier a rank in temporary Health", async function () {
      this.timeout(60000);
      const warrior = await characterWith("ZZ Martial Stander", "Warrior", { level: 13, ranks: { "Last Stand": 1 } });
      await setPool(warrior, "rage", 10);
      const card = await press(warrior, "Last Stand");
      assert.ok(card, "Last Stand's press posted no card");
      assert.equal(poolOf(warrior, "rage").value, 4, "Last Stand did not cost 6 Rage");
      await until(() => (warrior.system.health.temp ?? 0) === 2 * warrior.system.tier, "the temporary Health landing");
    });

    it("04's Unbreakable: pressed as a Reaction, it lays the redirect of every attack within 10 feet and frees every Block", async function () {
      this.timeout(60000);
      const warrior = await characterWith("ZZ Martial Unbroken", "Warrior", { level: 17, ranks: { Unbreakable: 1 } });
      await setPool(warrior, "rage", 10);
      const card = await press(warrior, "Unbreakable");
      assert.ok(card, "Unbreakable's press posted no card");
      const laid = await until(() => warrior.effects.find(e => e.flags?.["azeroth-rpg"]?.[SENTINEL_FLAG]), "the redirect laid");
      assert.equal(laid.flags["azeroth-rpg"][SENTINEL_FLAG].feet, UNBREAKABLE.feet);
      assert.ok(laid.flags["azeroth-rpg"].unbreakable, "the free Blocks' flag is missing");
      assert.equal(poolOf(warrior, "rage").value, 4, "Unbreakable did not cost 6 Rage");
      assert.equal(featureNamed(warrior, "Unbreakable").system.uses.value, 0, "its once an encounter was not struck");
    });

    it("04's Whirlwind: pressed, an action for 8 Rage whose card allows two attacks for every creature named (R5)", async function () {
      this.timeout(90000);
      const warrior = await characterWith("ZZ Martial Whirler", "Warrior", { level: 17, ranks: { Whirlwind: 1 } });
      const a = await makeNpc("Plagued Ghoul");
      const b = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: warrior, x: 500, y: 500 }, { actor: a, x: 600, y: 500, side: "hostile" }, { actor: b, x: 500, y: 600, side: "hostile" }]);
      await setPool(warrior, "rage", 10);
      const card = await press(warrior, "Whirlwind", { targets: [a, b] });
      assert.ok(card, "Whirlwind's press posted no card");
      assert.equal(card.flags["azeroth-rpg"].attacks?.allowed, 4, "two creatures named should allow four presses");
      assert.equal(poolOf(warrior, "rage").value, 2, "Whirlwind did not cost 8 Rage");
    });

    it("04's Frenzy: the first drop below half Health each encounter gives twice the tier in Rage, and the second gives none", async function () {
      this.timeout(90000);
      const warrior = await characterWith("ZZ Martial Frenzied", "Warrior", { level: 5, ranks: { Frenzy: 1 } });
      const foe = await makeNpc("Plagued Ghoul");
      await fightWith([warrior, foe]);
      await setPool(warrior, "rage", 0);
      const max = warrior.system.health.max;
      // A new character stands below its maximum (the fixture's Health is the schema's initial), and 04's
      // Frenzy fires on a DROP below half, so the warrior starts whole (the live pass's probe: 10 of 23).
      await warrior.update({ "system.health.value": max });
      await until(() => warrior.system.health.value === max, "the warrior whole");
      await warrior.applyDamage(Math.ceil(max / 2) + 1, { attack: true, struck: true });
      await until(() => poolOf(warrior, "rage").value >= 2 * warrior.system.tier, "Frenzy's Rage");
      const counter = featureNamed(warrior, "Frenzy");
      assert.equal(counter?.system?.uses?.value, 0, "Frenzy's once an encounter was not struck");
    });

    it("04's Blood Craze: Frightened is refused over 7 Rage, and lands at 7", async function () {
      this.timeout(60000);
      const warrior = await characterWith("ZZ Martial Crazed", "Warrior", { level: 9, ranks: { "Blood Craze": 1 } });
      await setPool(warrior, "rage", 8);
      await until(() => warrior.system.conditionImmunities?.includes("frightened"), "Frightened refused over 7 Rage");
      await warrior.toggleStatusEffect("frightened", { active: true });
      assert.isFalse(warrior.statuses.has("frightened"), "Frightened landed over 7 Rage");
      await setPool(warrior, "rage", 7);
      await until(() => !warrior.system.conditionImmunities?.includes("frightened"), "the refusal lifting at 7");
    });

    it("04's Precise Strike: a line on the attack's own dialog for 4 Rage, never a Use", async function () {
      this.timeout(60000);
      const warrior = await characterWith("ZZ Martial Precise", "Warrior", { level: 5, ranks: { "Precise Strike": 2 } });
      await setPool(warrior, "rage", 10);
      assert.isNull(featureNamed(warrior, "Precise Strike"), "Precise Strike still grants a Use");
      const line = warrior.riderLines({ weapon: "melee" }).find(l => l.identifier === "precise-strike");
      assert.ok(line, "no Precise Strike line on the attack");
      assert.equal(line.cost, 4);
      assert.equal(line.does.pierce, 2, "rank 2 should ignore 2 Armor Points");
    });

    /* ---- the Paladin ---- */

    it("02's Lay on Hands: pressed on a friend, its card heals five times the tier (A12)", async function () {
      this.timeout(90000);
      const paladin = await characterWith("ZZ Martial Healer", "Paladin", { level: 9 });
      const friend = await makeCharacter({ name: "ZZ Martial Friend", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: paladin, x: 500, y: 500 }, { actor: friend, x: 600, y: 500 }]);
      await setPool(paladin, "mana", 99);
      const card = await press(paladin, "Lay on Hands", { targets: [friend] });
      assert.ok(card, "Lay on Hands' press posted no card");
      assert.equal(card.flags["azeroth-rpg"].heal, 5 * paladin.system.tier, "the heal is not five times the tier");
    });

    it("04's Mercy of Uther: Lay on Hands heals the friend whole and ends the condition chosen, its use back at each Short Rest", async function () {
      this.timeout(120000);
      const paladin = await characterWith("ZZ Martial Merciful", "Paladin", { level: 20, ranks: { "Mercy of Uther": 1 } });
      const friend = await makeCharacter({ name: "ZZ Martial Ailing", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: paladin, x: 500, y: 500 }, { actor: friend, x: 600, y: 500 }]);
      await setPool(paladin, "mana", 99);
      await friend.toggleStatusEffect("prone", { active: true });
      await until(() => friend.statuses.has("prone"), "the friend Prone");
      const loh = await until(() => featureNamed(paladin, "Lay on Hands"), "Lay on Hands");
      await until(() => loh.system.ends === 1 && loh.system.heal === "max", "Mercy of Uther's stamp on Lay on Hands");
      assert.equal(loh.system.uses?.refill, "short", "Mercy of Uther's Short Rest refill was not stamped");
      const prone = game.i18n.localize(CONFIG.AZEROTH?.conditions?.prone ?? "") || "Prone";
      // The chooser opens in the judgement, before anything is paid (D-768): pressed, then picked.
      const card = await press(paladin, "Lay on Hands", { targets: [friend], after: item => pick(item, [prone, "Prone"]) });
      assert.ok(card, "Lay on Hands' press posted no card");
      assert.equal(card.flags["azeroth-rpg"].heal, friend.system.health.max, "the heal is not the friend's whole Health");
      await until(() => !friend.statuses.has("prone"), "Prone ended");
      assert.equal(featureNamed(paladin, "Lay on Hands").system.uses.value, 0, "the use was not struck");
    });

    it("04's Mending Word: pressed on a friend for 4 Zeal, its card heals twice the tier", async function () {
      this.timeout(90000);
      const paladin = await characterWith("ZZ Martial Mender", "Paladin", { level: 5, ranks: { "Mending Word": 1 } });
      const friend = await makeCharacter({ name: "ZZ Martial Mended", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: paladin, x: 500, y: 500 }, { actor: friend, x: 700, y: 500 }]);
      await setPool(paladin, "zeal", 6);
      const card = await press(paladin, "Mending Word", { targets: [friend] });
      assert.ok(card, "Mending Word's press posted no card");
      assert.equal(card.flags["azeroth-rpg"].heal, 2 * paladin.system.tier);
      assert.equal(poolOf(paladin, "zeal").value, 2, "Mending Word did not cost 4 Zeal");
    });

    it("02's Avenging Wrath: pressed, it lays the encounter's Boon and the climb's round", async function () {
      this.timeout(90000);
      const paladin = await characterWith("ZZ Martial Wrathful", "Paladin", { level: 20 });
      const foe = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([paladin, foe]);
      await giveTurn(combat, paladin);
      await setPool(paladin, "mana", 99);
      const card = await press(paladin, "Avenging Wrath");
      assert.ok(card, "Avenging Wrath's press posted no card");
      const climb = await until(() => paladin.effects.find(e => e.flags?.["azeroth-rpg"]?.[AVENGING_WRATH.flag]), "the climb's effect");
      assert.equal(climb.flags["azeroth-rpg"][AVENGING_WRATH.flag].round, combat.round);
      await until(() => paladin.effects.some(e => e.flags?.["azeroth-rpg"]?.[LAID_BOON_FLAG]), "the encounter's Boon laid");
    });

    it("02's Beacon of Hope: pressed, an ally within 30 feet is held at 1 the first time, and not the second", async function () {
      this.timeout(120000);
      const paladin = await characterWith("ZZ Martial Beacon", "Paladin", { level: 20 });
      const friend = await makeCharacter({ name: "ZZ Martial Beaconed", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 500, y: 500 }, { actor: friend, x: 700, y: 500 }, { actor: foe, x: 1500, y: 500, side: "hostile" }]);
      const combat = await fightWith([paladin, friend, foe]);
      await giveTurn(combat, paladin);
      await setPool(paladin, "mana", 99);
      const card = await press(paladin, "Beacon of Hope");
      assert.ok(card, "Beacon of Hope's press posted no card");
      const beacon = await until(() => paladin.effects.find(e => e.flags?.["azeroth-rpg"]?.[BEACON_OF_HOPE.flag]), "the Beacon laid");
      assert.equal(beacon.duration?.expiry, "combatEnd", "in a fight the Beacon does not end with the encounter");
      await friend.applyDamage(friend.system.health.value + 5, { attack: true, struck: true });
      await until(() => friend.system.health.value === 1, "the friend held at 1");
      // The first drop of each ally, recorded on the Beacon itself (06 §9's rule 2: never the shared granted mark).
      await until(() => (paladin.effects.get(beacon.id)?.flags?.["azeroth-rpg"]?.[BEACON_OF_HOPE.flag]?.held ?? []).includes(friend.uuid), "the ally recorded on the Beacon");
      await friend.applyDamage(5, { attack: true, struck: true });
      await until(() => friend.system.health.value === 0, "a second fall is not held");
      // A second Beacon while one stands is refused in words, nothing paid.
      const mana = poolOf(paladin, "mana").value;
      const again = await press(paladin, "Beacon of Hope", { ms: 4000 });
      assert.isNull(again, "a second Beacon was laid while one stands");
      assert.equal(poolOf(paladin, "mana").value, mana, "the refused Beacon was paid for");
    });

    it("02's Divine Storm: a hit from its card heals a wounded friend within 10 feet by the tier, once for that hit", async function () {
      this.timeout(180000);
      const paladin = await characterWith("ZZ Martial Tempest", "Paladin", { level: 20 });
      const sword = (await paladin.createEmbeddedDocuments("Item", [(await game.packs.get("azeroth-rpg.weapons").getDocuments({ name: "Longsword" }))[0].toObject()], { azerothIdentify: "known" }))[0];
      await sword.update({ "system.equipped": true });
      await until(() => paladin.items.get(sword.id)?.system?.equipped === true, "the sword in hand");
      const friend = await makeCharacter({ name: "ZZ Martial Stormed", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: paladin, x: 500, y: 500 }, { actor: friend, x: 500, y: 600 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const combat = await fightWith([paladin, friend, foe]);
      await giveTurn(combat, paladin);
      // The Paladin counts as its own ally (D-755) and a new character stands below its maximum, so two
      // wounded friends would open the pick: the Paladin starts whole and the friend is the one wounded.
      await paladin.update({ "system.health.value": paladin.system.health.max });
      await friend.update({ "system.health.value": 1 });
      await setPool(paladin, "zeal", 10);
      const card = await press(paladin, "Divine Storm", { targets: [foe] });
      assert.ok(card, "Divine Storm's press posted no card");
      const { CARD_ACTIONS } = await import("../dice/chat.mjs");
      const button = new DOMParser().parseFromString(card.content, "text/html").querySelector('[data-action="attackFromCard"]');
      assert.ok(button, "the card offers no Attack");
      canvas.tokens.setTargets([foe.getActiveTokens(true)[0].id]);
      const unpin = pinDie(19);
      let shot = null;
      try {
        shot = await CARD_ACTIONS.attackFromCard(button, card);
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
      }
      assert.ok(shot, "the card's Attack made no attack");
      made.push(shot);
      assert.isTrue(shot.rolls[0].outcome.success, "the pinned attack missed");
      await until(() => friend.system.health.value === 1 + paladin.system.tier, "the friend healed by the tier");
      await until(() => (game.messages.get(card.id)?.getFlag("azeroth-rpg", "divineStormHealed") ?? []).includes(shot.id), "the hit recorded on the Divine Storm card");
    });

    it("02's Divine Storm is a Half-Action, and 04's Seal of Command is once an encounter", async function () {
      this.timeout(60000);
      const paladin = await characterWith("ZZ Martial Stormer", "Paladin", { level: 20, ranks: { "Seal of Command": 1 } });
      const storm = await until(() => featureNamed(paladin, "Divine Storm"), "Divine Storm granted");
      assert.equal(storm.system.action, "half");
      const seal = await until(() => featureNamed(paladin, "Seal of Command"), "Seal of Command granted");
      assert.equal(Number(seal.system.uses?.max), 1);
      assert.equal(seal.system.uses?.per, "encounter");
      // Pressed once, the encounter's one use is struck and the button greys.
      await setPool(paladin, "zeal", 10);
      const card = await press(paladin, "Seal of Command");
      assert.ok(card, "Seal of Command's press posted no card");
      await until(() => featureNamed(paladin, "Seal of Command").system.uses.value === 0, "the encounter's use struck");
    });

    it("04's Fanaticism: a fight begins with 2 Zeal a rank", async function () {
      this.timeout(90000);
      const paladin = await characterWith("ZZ Martial Fanatic", "Paladin", { level: 13, ranks: { Fanaticism: 2 } });
      const foe = await makeNpc("Plagued Ghoul");
      await fightWith([paladin, foe]);
      await until(() => poolOf(paladin, "zeal").value === 4, "4 Zeal at the fight's start");
    });

    /* ---- the Ranger ---- */

    it("04's Readiness: pressed, it refills the Focus with no action, its use struck", async function () {
      this.timeout(60000);
      const ranger = await characterWith("ZZ Martial Ready", "Ranger", { level: 13, ranks: { Readiness: 1 } });
      await setPool(ranger, "focus", 0);
      const card = await press(ranger, "Readiness");
      assert.ok(card, "Readiness' press posted no card");
      await until(() => poolOf(ranger, "focus").value === poolOf(ranger, "focus").max, "the Focus refilled");
      assert.equal(featureNamed(ranger, "Readiness").system.uses.value, 0, "its use was not struck");
    });

    it("04's Rapid Fire: pressed, an action once an encounter whose card allows three attacks a rank; Barrage a Half-Action", async function () {
      this.timeout(90000);
      const ranger = await characterWith("ZZ Martial Volley", "Ranger", { level: 13, ranks: { Barrage: 1, "Rapid Fire": 2 } });
      const foe = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 500, y: 500 }, { actor: foe, x: 1000, y: 500, side: "hostile" }]);
      const rf = await until(() => featureNamed(ranger, "Rapid Fire"), "Rapid Fire granted");
      assert.equal(rf.system.action, "action");
      assert.equal(rf.system.uses.per, "encounter");
      const barrage = await until(() => featureNamed(ranger, "Barrage"), "Barrage granted");
      assert.equal(barrage.system.action, "half");
      const card = await press(ranger, "Rapid Fire", { targets: [foe] });
      assert.ok(card, "Rapid Fire's press posted no card");
      assert.equal(card.flags["azeroth-rpg"].attacks?.allowed, 6, "rank 2 should allow six presses");
      await until(() => featureNamed(ranger, "Rapid Fire").system.uses.value === 0, "the encounter's use struck");
    });

    it("02's Aimed Shot and Kill Shot: lines on the attack's own dialog, Kill Shot greyed in words at a creature not marked", async function () {
      this.timeout(60000);
      const ranger = await characterWith("ZZ Martial Marksman", "Ranger", { level: 20 });
      await until(() => featureNamed(ranger, "Kill Shot"), "Kill Shot granted");
      const lines = ranger.riderLines({ weapon: "shot" });
      const aimed = lines.find(l => l.identifier === "aimed-shot");
      const kill = lines.find(l => l.identifier === "kill-shot");
      assert.ok(aimed, "no Aimed Shot line");
      assert.equal(aimed.cost, 3);
      assert.ok(kill, "no Kill Shot line");
      // No target and no Quarry: refused in words, never by the grey alone.
      assert.isFalse(kill.available, "Kill Shot was open with no marked target");
      assert.ok(kill.reason?.key, "Kill Shot's refusal names no reason");
      assert.equal(featureNamed(ranger, "Kill Shot").system.kind, "passive", "Kill Shot still draws a Use");
      assert.equal(featureNamed(ranger, "Aimed Shot").system.kind, "passive", "Aimed Shot still draws a Use");
    });

    it("02's Snare: pressed, its card says how many Snares the Ranger may keep set", async function () {
      this.timeout(60000);
      const ranger = await characterWith("ZZ Martial Trapper", "Ranger", { level: 9 });
      await sceneWith([{ actor: ranger, x: 500, y: 500 }]);
      const card = await press(ranger, "Snare");
      assert.ok(card, "Snare's press posted no card");
      const said = textOf({ content: `<p>${game.i18n.format("AZEROTH.Martial.SnareLimit", { limit: ranger.system.tier })}</p>` }).trim();
      assert.include(textOf(card), said, "the card names no standing count");
    });
  });
}
