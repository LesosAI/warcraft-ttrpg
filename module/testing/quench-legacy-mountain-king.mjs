/**
 * **THE MOUNTAIN KING, LIVE** (04's Mountain King (Dwarf); the Legacy branches'
 * phase B6a).
 *
 * A dwarf Warrior holds the branch beside the class's thirty-six (door 1, B5), each
 * talent set at its ranks, and each is pressed from the sheet's own control with
 * tokens on a scene - the Combat tab's Attack, Use and maneuvers, the roll dialog's
 * rider lines, the cards' own buttons - the die pinned through `fixtures.mjs#pinDie`,
 * and every outcome read back off the documents:
 *
 * - Bash through the real attack dialog: 2 Rage, the ghoul's Reaction gone and, at
 *   rank 2 and SL 2, Prone landed with no button pressed;
 * - Storm Bolt: a Mace opens as a throw at 15 feet once the line can be paid, 6 Rage,
 *   the Stun keyed on the GHOUL's own turn end, and its Reaction at rank 2;
 * - Axe and Hammer: an axe and a mace in the two hands, the off-hand card naming the
 *   rank's damage and building Rage;
 * - Unmoved: 2 Rage at the end of a turn that paid no Move, none after one that did;
 * - Rockslide: Charge's uses at 1 + the rank, each free Overbear striking one and
 *   giving its Rage, and the next paying the maneuver's price;
 * - Thunder Clap at rank 2: 6 Rage, the tier's Nature on the card, the Body Test at
 *   10 + Strength + Proficiency, Slowed laid at once on every enemy gathered and keyed
 *   on each ghoul's own turn end;
 * - Shoulder to Shoulder: 1 Armor Point on an ally 5 feet off and none on the dwarf,
 *   10 feet at rank 2;
 * - Hammer and Anvil: the rank's damage named on the card against a Prone ghoul and
 *   not against a standing one;
 * - Bedrock: the Use's halving mark, 4 Rage and a use, and the Apply halved;
 * - Hold the Hall at rank 2: a step inside the reach offered as an Opportunity
 *   Attack, its hit knocking the ghoul Prone, the first of the round free and the
 *   second paid;
 * - The Mountain Wakes: one effect carrying the Armor Points, Ward and Damage Rating,
 *   the Long Rest's use struck, and the effect gone with the fight;
 * - Stout Heart: Second Wind's card healing the tier plus the rank.
 *
 * Written in B6a and NOT run (the brief: offline, Vitest only). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-mountain-king`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, dialogFor, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { AURA_FLAG } from "../rules/auras.mjs";
import { syncAuras } from "../effects/auras.mjs";
import { maneuverCost } from "../rules/maneuvers.mjs";
import { AZEROTH } from "../config.mjs";

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const classTalents = actor => actor.items.filter(i => i.type === "talent" && !i.system?.race);
const provenanceOf = card => card.rolls?.[0]?.options?.provenance ?? [];
const combatantOf = (combat, actor) => combat.getCombatantsByActor(actor)[0] ?? null;
const auraOn = (actor, source) => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[AURA_FLAG]?.source === source) ?? null;
const opportunityCards = () => game.messages.filter(m => m.flags?.["azeroth-rpg"]?.reaction === "opportunityAttack");

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements, { name = "ZZ Legacy Mountain King Scene" } = {}) {
  const scene = await Scene.create({ name, width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, `${name} viewed`);
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors by their tokens, its turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({ scene: canvas.scene?.id ?? null });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens?.(true)?.[0]?.document ?? null;
    return token ? { actorId: a.id, tokenId: token.id, sceneId: token.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** The next turn, FORWARD, so core runs the turn events (a rewind runs none), its events landed. */
async function nextTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.nextTurn();
  await settled;
}

/** Forward through the fight until this actor holds the turn, its turn start landed. */
async function forwardTo(combat, actor) {
  for (let i = 0; i < 8 && combat.combatant?.actorId !== actor.id; i++) await nextTurn(combat);
  if (combat.combatant?.actorId !== actor.id) throw new Error(`${actor.name} never took the turn`);
  const mine = combatantOf(combat, actor);
  await until(() => mine.budget?.halfActions === 2, `${actor.name}'s fresh budget`);
  return mine;
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Put a token where it is asked and WAIT FOR IT TO ARRIVE (D-669). */
async function moveTo(actor, x, y) {
  const doc = tokenOf(actor)?.document;
  if (!doc) throw new Error(`${actor.name} has no token on the scene`);
  await doc.update({ x, y });
  for (let i = 0; i < 200 && (doc.x !== x || doc.y !== y); i++) await sleep(50);
  await settle();
  if (doc.x !== x || doc.y !== y) throw new Error(`${actor.name} stopped at ${doc.x},${doc.y} on its way to ${x},${y}`);
  return doc;
}

/**
 * **A DWARF WARRIOR WITH THE MOUNTAIN KING'S TALENTS AT THESE RANKS** (door 1: the
 * race keeps the branch, so it arrives untaken beside the class's thirty-six), these
 * weapons in hand - the second in the OFF hand where `offHand` names it - waiting for
 * every grant the ranks make. Level 4 by default: no Extra Attack, so one Attack is one
 * card and one Rage gain.
 */
async function dwarfWarrior(name, { level = 4, ranks = {}, weapons = [], offHand = null, abilities = { str: 16, dex: 12, con: 14 } } = {}) {
  const dwarf = await makeCharacter({ name, classes: [["Warrior", level]], race: "Dwarf", weapons, abilities });
  await until(() => classTalents(dwarf).filter(t => t.system?.legacy === "Dwarf").length === 12, `${name}'s Mountain King twelve`, 30000);
  for (const n of weapons) {
    const item = await until(() => itemNamed(dwarf, n), `${n} held`);
    await item.update({ "system.equipped": true, "system.offHand": n === offHand });
    await until(() => dwarf.items.get(item.id)?.system?.equipped === true && dwarf.items.get(item.id)?.system?.offHand === (n === offHand), `${n} in hand`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(dwarf, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(dwarf, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return dwarf;
}

/**
 * **PRESS A SHEET'S CONTROL AND TAKE THE CARD IT POSTS**, the die pinned while the
 * press rolls. `control` is re-queried at the press (CLAUDE.md §15).
 */
async function pressForCard(control, speaker, face = 15, { kind = null, ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id && (!kind || m.flags?.["azeroth-rpg"]?.kind === kind));
  const unpin = pinDie(face);
  try {
    el.click();
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/**
 * **PRESS THE SHEET'S ATTACK, TICK THESE RIDER LINES ON THE REAL DIALOG, AND ROLL**
 * (D-770: *"Lines on attack dialog"*). Every line named must be drawn, unticked and
 * pressable; the card is the one the roll posts.
 */
async function attackThroughDialog(sheet, weapon, speaker, { riders = [], face = 20, mode = null } = {}) {
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === speaker.id && m.flags?.["azeroth-rpg"]?.kind === "attack");
  const unpin = pinDie(face);
  try {
    const control = sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`);
    if (!control) throw new Error(`no Attack on the Combat tab for ${weapon.name}`);
    control.click();
    const dialog = await dialogFor(speaker, 8000);
    if (!dialog) throw new Error("the attack dialog did not open");
    if (mode) {
      const select = dialog.element.querySelector("[data-attack-mode]");
      if (!select) throw new Error(`the dialog offers no way to strike, and ${mode} was asked for`);
      if (select.value !== mode) throw new Error(`the dialog opened on ${select.value}, not ${mode}`);
    }
    for (const id of riders) {
      const box = dialog.element.querySelector(`input[name="rider-${id}"]`);
      if (!box) throw new Error(`the dialog draws no ${id} line`);
      if (box.checked) throw new Error(`the ${id} line came ticked: spending a pool is the player's call`);
      if (box.disabled) throw new Error(`the ${id} line was greyed: ${box.closest("label")?.textContent?.replace(/\s+/g, " ") ?? ""}`);
      box.checked = true;
    }
    dialog.element.querySelector('button[data-action="roll"]').click();
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  }
}

/** The Combat tab's Use for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;
/** The Combat tab's Attack for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;
/** A creature's own first attack row (`npc-statistics.hbs`). */
const clawsControl = sheet => () => sheet.element?.querySelector('[data-action="rollAttack"][data-attack="0"]') ?? null;
/** The Combat tab's maneuver Use. */
const maneuverControl = (sheet, key) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-action="useManeuver"][data-maneuver="${key}"]`) ?? null;

/** A ghoul's Claws pressed on its own sheet at the defender, the die pinned: the attack's card. */
async function clawsAt(ghoul, defender, face = 15) {
  canvas.tokens.setTargets([tokenOf(defender).id]);
  const sheet = await openSheet(ghoul);
  try {
    return await pressForCard(clawsControl(sheet), ghoul, face, { kind: "attack" });
  } finally {
    await sheet.close();
    canvas.tokens.setTargets([]);
  }
}

/** The dwarf's sheet open on the Combat tab, for `fn`, closed after. */
async function onCombatTab(actor, fn) {
  const sheet = await openSheet(actor);
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    return await fn(sheet);
  } finally {
    await sheet.close();
  }
}

/** The dwarf's attack at the ghoul from the Combat tab, the ghoul targeted. */
async function swingAt(dwarf, ghoul, weapon, face = 15) {
  canvas.tokens.setTargets([tokenOf(ghoul).id]);
  try {
    return await onCombatTab(dwarf, sheet => pressForCard(attackControl(sheet, weapon), dwarf, face, { kind: "attack" }));
  } finally {
    canvas.tokens.setTargets([]);
  }
}

export function legacyMountainKingBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Mountain King (Dwarf; the Legacy branches' B6a)", function () {
    let restore = null;
    let wasViewing = null;
    let quietText = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quietText = await quietScrollingText();
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      canvas?.tokens?.releaseAll?.();
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("BASH THROUGH THE REAL DIALOG: an unticked line priced in Rage, 2 paid, the ghoul's Reaction gone and, at rank 2 and SL 2, Prone landed with no button pressed", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Bash", { weapons: ["Battleaxe"], ranks: { Bash: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      await giveTurn(combat, dwarf);
      const theirs = combatantOf(combat, ghoul);
      await until(() => theirs.budget?.reactions === 1, "the ghoul's Reaction in hand");
      await setPool(dwarf, "rage", 5);
      const axe = itemNamed(dwarf, "Battleaxe");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let card = null;
      try {
        card = await onCombatTab(dwarf, sheet => attackThroughDialog(sheet, axe, dwarf, { riders: ["bash"], face: 20 }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      const outcome = card.rolls[0].outcome;
      assert.isTrue(outcome.success, "the pinned 20 missed");
      assert.isAtLeast(outcome.sl, 2, "the pinned 20 did not reach SL 2");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Rider.Card.Paid", { n: 2, pool: game.i18n.localize(AZEROTH.poolTypes.rage) }), "the card does not say what Bash was paid");
      // 2 paid before the die, then what the hit built (05 §11; D-627).
      const built = (card.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "rage")?.gained ?? 0;
      await until(() => poolOf(dwarf, "rage").value === Math.min(poolOf(dwarf, "rage").max, 3 + built), "Bash's 2 Rage paid");
      // *On a hit the target loses its Reaction* - through the combatant's own queued door.
      await until(() => theirs.budget?.reactions === 0, "the ghoul's Reaction taken by the hit");
      assert.include(textOf(card), game.i18n.format("AZEROTH.ReactionLoss.Lost", { name: ghoul.name }), "the card does not say the Reaction went");
      // *At rank 2 a hit at SL 2 also knocks it Prone* - landed with the blow.
      await until(() => ghoul.statuses?.has("prone"), "Prone on the ghoul with no button pressed");
      assert.isNull(parsed(card).querySelector('[data-action="applyCondition"][data-condition="prone"]'), "the card still offers a Prone that already landed");
    });

    it("STORM BOLT: a Mace opens as a throw at 15 feet once the line can be paid, 6 Rage, the Stun keyed on the GHOUL's own turn end, and its Reaction at rank 2", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Bolt", { weapons: ["Mace"], ranks: { Bash: 1, "Storm Bolt": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // Fifteen feet between the nearest squares (D-732): out of reach, inside the 20 ft throw.
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      await giveTurn(combat, dwarf);
      const theirs = combatantOf(combat, ghoul);
      await setPool(dwarf, "rage", 8);
      const mace = itemNamed(dwarf, "Mace");
      assert.equal(mace.system.weaponType, "mace", "the pack's Mace carries no mace type (08 §7's Type column)");
      assert.isFalse((mace.system.traits ?? []).some(t => /^thrown/i.test(t)), "the Mace is already Thrown: the test would not be Storm Bolt's");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let card = null;
      try {
        card = await onCombatTab(dwarf, sheet => attackThroughDialog(sheet, mace, dwarf, { riders: ["storm-bolt"], face: 20, mode: "thrown" }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      assert.equal(card.flags["azeroth-rpg"].strike?.rangeKind, "thrown", "the blow was not recorded as a throw");
      assert.isTrue(card.rolls[0].outcome.success, "the pinned 20 missed");
      assert.isAtLeast(card.rolls[0].outcome.sl, 2, "the pinned 20 did not reach SL 2");
      // *an attack made with one uses Strength* - where a throw is made with Dexterity (06 §1).
      assert.isTrue(provenanceOf(card).some(p => p.label === AZEROTH.abilities.str), "the throw was not made with Strength");
      assert.isFalse(provenanceOf(card).some(p => p.label === AZEROTH.abilities.dex), "the throw was made with Dexterity");
      const built = (card.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "rage")?.gained ?? 0;
      await until(() => poolOf(dwarf, "rage").value === Math.min(poolOf(dwarf, "rage").max, 2 + built), "Storm Bolt's 6 Rage paid");
      // *Stunned until the end of its next turn*: the ghoul's own combatant, at its turn end (D-628).
      const stun = await until(() => ghoul.effects.find(e => e.statuses?.has("stunned")), "the Stun on the ghoul");
      assert.equal(stun._source.duration?.expiry, "turnEnd", "the Stun does not end at a turn's end");
      assert.equal(stun._source.start?.combatant, theirs.id, "the Stun is keyed on the dwarf's turn, not the ghoul's");
      // *At rank 2 any hit also costs the target its Reaction*.
      await until(() => theirs.budget?.reactions === 0, "the ghoul's Reaction taken at rank 2");
    });

    it("AXE AND HAMMER: an axe and a mace in the two hands; the off-hand card names the rank's damage and builds Rage", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Hands", { weapons: ["Hand axe", "Mace"], offHand: "Mace", ranks: { "Axe and Hammer": 2 } });
      assert.isTrue(dwarf.gateFacts?.()?.wield?.twoTypes, "an axe and a mace in the two hands do not read as two types");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      await giveTurn(combat, dwarf);
      await setPool(dwarf, "rage", 0);
      const main = await swingAt(dwarf, ghoul, itemNamed(dwarf, "Hand axe"), 18);
      const button = parsed(main).querySelector('[data-action="offHandFromCard"]');
      assert.ok(button, "the main-hand card offers no off-hand blow");
      const before = poolOf(dwarf, "rage").value;
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === dwarf.id && m.flags?.["azeroth-rpg"]?.offHand === true);
      const unpin = pinDie(18);
      let off = null;
      try {
        await CARD_ACTIONS.offHandFromCard(button, game.messages.get(main.id));
        [off] = await posted;
        made.push(off);
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
      }
      assert.isTrue(off.rolls[0].outcome.success, "the pinned off-hand blow missed");
      assert.isTrue(provenanceOf(off).some(p => p.label === "Axe and Hammer" && p.value === 2), "the off-hand card does not name the rank's 2 damage");
      // *builds Rage as your other hits do* - 06 §2 gives an off-hand blow none without it.
      const gained = (off.flags["azeroth-rpg"].momentumGained ?? []).find(g => g.name === "rage")?.gained ?? 0;
      assert.isAbove(gained, 0, "the off-hand hit built no Rage");
      await until(() => poolOf(dwarf, "rage").value === Math.min(poolOf(dwarf, "rage").max, before + gained), "the off hand's Rage on the pool");
    });

    it("UNMOVED: a turn that paid a Move gains nothing at its end, and the next, which moved nowhere, gains 2 Rage", async function () {
      this.timeout(300000);
      const dwarf = await dwarfWarrior("ZZ LMK Unmoved", { weapons: ["Battleaxe"], ranks: { Unmoved: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      const mine = await giveTurn(combat, dwarf);
      const axe = itemNamed(dwarf, "Battleaxe");
      // A blow that lands each turn: Rage does not drain in a round the Warrior struck
      // (02 §7), so no round's end moves the pool inside what is measured here.
      await setPool(dwarf, "rage", 2);
      await swingAt(dwarf, ghoul, axe, 18);
      await until(() => combatantOf(combat, dwarf).getFlag("azeroth-rpg", "round")?.struck === true, "the round's strike recorded");
      // One square down: still beside the ghoul, a Move paid.
      await moveTo(dwarf, 1000, 1100);
      await until(() => (mine.getFlag("azeroth-rpg", "moveHalves") ?? 0) >= 1, "the Move paid for the step");
      const moved = poolOf(dwarf, "rage").value;
      await nextTurn(combat);
      await sleep(400);
      assert.equal(poolOf(dwarf, "rage").value, moved, "Unmoved gave Rage at the end of a turn that moved");
      // The dwarf's next turn: a blow and no step.
      await forwardTo(combat, dwarf);
      await swingAt(dwarf, ghoul, axe, 18);
      await until(() => combatantOf(combat, dwarf).getFlag("azeroth-rpg", "round")?.struck === true, "this round's strike recorded");
      assert.equal(mine.getFlag("azeroth-rpg", "moveHalves") ?? 0, 0, "the turn paid a Move nobody made");
      const still = poolOf(dwarf, "rage").value;
      await nextTurn(combat);
      await until(() => poolOf(dwarf, "rage").value === Math.min(poolOf(dwarf, "rage").max, still + 2), "Unmoved's 2 Rage at the end of a turn with no move");
    });

    it("ROCKSLIDE: Charge holds 1 + the rank's uses, each free Overbear strikes one and gives 1 Rage, and the next pays the maneuver's price", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Rockslide", { weapons: ["Battleaxe"], ranks: { Rockslide: 2 } });
      const charge = await until(() => featureNamed(dwarf, "Charge"), "Charge granted");
      await until(() => dwarf.items.get(charge.id)?.system?.uses?.max === 3, "Charge's three uses an encounter at rank 2");
      await until(() => dwarf.items.get(charge.id)?.system?.uses?.value === 3, "the uses in hand moving with the maximum");
      assert.include(dwarf.items.get(charge.id).system.modifiedBy ?? [], "Rockslide", "Charge does not name Rockslide among what changes it");
      await setPool(dwarf, "rage", 0);
      await onCombatTab(dwarf, async sheet => {
        for (let n = 1; n <= 3; n++) {
          await pressForCard(maneuverControl(sheet, "overbear"), dwarf, 15);
          await until(() => dwarf.items.get(charge.id)?.system?.uses?.value === 3 - n, `Charge's use ${n} struck`);
          await until(() => poolOf(dwarf, "rage").value === n, `Charge's Rage ${n}`);
        }
        // Charge spent: the fourth Overbear pays 06 §7's price, and strikes nothing.
        const price = maneuverCost("overbear", {}).cost;
        assert.isAbove(price, 0, "Overbear has no price to pay");
        await setPool(dwarf, "rage", price + 1);
        await until(() => maneuverControl(sheet, "overbear")()?.disabled !== true, "the Overbear pressable at its price");
        await pressForCard(maneuverControl(sheet, "overbear"), dwarf, 15);
        await until(() => poolOf(dwarf, "rage").value === 1, "the fourth Overbear paid in Rage");
        assert.equal(dwarf.items.get(charge.id).system.uses.value, 0, "the paid Overbear struck a Charge use it did not have");
      });
    });

    it("THUNDER CLAP AT RANK 2: 6 Rage; every enemy within 10 feet gathered and none further; the tier's Nature on each row through its own Ward and never halved; the Body Test at 10 + Strength + Proficiency, a failure laying Prone at once; the Slowed laid at once on every enemy gathered, with no button", async function () {
      this.timeout(300000);
      const dwarf = await dwarfWarrior("ZZ LMK Clap", { level: 9, weapons: ["Battleaxe"], ranks: { "Thunder Clap": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const steady = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      // The dwarf at a square; the ghoul beside it (5 feet), the steady one two squares down
      // (10 feet, the edge of the circle), the far one five squares off (25 feet).
      await sceneWith([
        { actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" },
        { actor: steady, x: 1000, y: 1200, side: "hostile" }, { actor: far, x: 1500, y: 1000, side: "hostile" }
      ]);
      // Two TOKENS of one kind, each named where it stands (the lead: *"The token's
      // name"*): the card's rows and its landed lines must both tell them apart.
      for (const [actor, label] of [[ghoul, "Ghoul beside"], [steady, "Ghoul at 10 ft"]]) {
        await tokenOf(actor).document.update({ name: label });
        await until(() => tokenOf(actor)?.document?.name === label, `${label} named`);
      }
      const combat = await fightWith([dwarf, ghoul, steady, far]);
      const mine = await giveTurn(combat, dwarf);
      const theirs = combatantOf(combat, ghoul);
      await setPool(dwarf, "rage", 8);
      const clap = await until(() => featureNamed(dwarf, "Thunder Clap"), "Thunder Clap granted");
      const tier = dwarf.system.tier;
      // *Every enemy within 10 feet of you* (the lead: *"Measure the area"*): the sheet hands
      // the Use nobody (`featureAims`), and the Use gathers the creatures inside its circle.
      const card = await onCombatTab(dwarf, sheet => pressForCard(useControl(sheet, clap), dwarf, 15));
      await until(() => poolOf(dwarf, "rage").value === 2, "Thunder Clap's 6 Rage");
      await until(() => mine.budget.halfActions === 1, "the Half-Action");
      const doc = () => game.messages.get(card.id);
      const flags = doc().flags["azeroth-rpg"];
      assert.equal(flags.area?.distanceFt, 10, "the card's area is not 10 feet");
      assert.deepEqual(flags.targets.map(t => t.tokenId).sort(), [tokenOf(ghoul).id, tokenOf(steady).id].sort(), "the Use did not gather exactly the two enemies within 10 feet");
      assert.deepEqual(flags.gathered, { who: "enemy", feet: 10, origin: "self" }, "the card does not record the circle it measured");
      assert.equal(flags.damageType, "nature", "the card records no damage type");
      assert.isUndefined(flags.halfOnPass, "Thunder Clap's damage halves on a pass: 04 writes no half");
      assert.deepEqual(flags.onFailInflicts, [{ condition: "prone", value: null, until: null }], "the failure lays something other than the Prone");
      // Each row's Nature, met by its own Ward - D-647's one number reached every selected token.
      for (const [i, row] of flags.damageByTarget.entries()) {
        assert.equal(row.damage, Math.max(0, tier - (flags.targets[i].wardBySchool?.nature ?? 0)), `row ${i}'s Nature is not the tier through its own Ward`);
      }
      const at = actor => flags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      const resistOn = actor => parsed(doc()).querySelector(`button[data-action="resistTest"][data-target-index="${at(actor)}"]`);
      const rendered = async (condition, actor) => (await doc().renderHTML()).querySelector(`button[data-action="applyCondition"][data-condition="${condition}"][data-target-index="${at(actor)}"]`);
      const recordOf = actor => Object.values(doc().flags["azeroth-rpg"].resists ?? {}).find(r => r.tokenId === tokenOf(actor).id) ?? null;
      // *Thunder Clap's Slowed lands on everyone (unresisted)* (the B6 brief): laid by the Use
      // on both ghouls it gathered, each keyed on its own turn end, said on the card, and
      // offered on no row; the far ghoul untouched.
      for (const near of [ghoul, steady]) {
        const slow = await until(() => near.effects.find(e => e.statuses?.has("slowed")), `the Use's Slowed on ${tokenOf(near).id}`);
        assert.equal(slow._source.duration?.expiry, "turnEnd", "the Slowed does not end at a turn's end");
        assert.equal(slow._source.start?.combatant, combatantOf(combat, near).id, "the Slowed is not keyed on the ghoul's own turn");
        assert.isNull(await rendered("slowed", near), "a Slowed the Use laid is still offered as a button");
      }
      // *Ghoul beside gains Slowed.* - the TOKEN the row names, never the actor both tokens
      // share (the lead, 2026-10-23: *"The token's name"*; B9b's shot read *ZZ Plagued Ghoul
      // gains Slowed* twice, and this line passed only because the actor's name contains
      // the token's).
      const slowedWord = game.i18n.localize(AZEROTH.conditions.slowed);
      assert.equal(flags.targets[at(ghoul)].name, "Ghoul beside", "the row does not carry the token's name");
      for (const label of ["Ghoul beside", "Ghoul at 10 ft"]) {
        assert.include(doc().content, game.i18n.format("AZEROTH.Rider.Card.LandedBare", { name: label, condition: slowedWord }), `the card does not say the Slowed landed on ${label}`);
      }
      assert.notInclude(doc().content, game.i18n.format("AZEROTH.Rider.Card.LandedBare", { name: ghoul.name, condition: slowedWord }), "the landed line names the actor, not the token");
      assert.isFalse(far.statuses?.has("slowed") === true, "the far ghoul was Slowed");
      assert.ok(resistOn(ghoul), "the ghoul's row offers no Body Test");
      assert.equal(resistOn(ghoul).dataset.resilience, "body");
      assert.equal(Number(resistOn(ghoul).dataset.dc), 10 + dwarf.system.abilities.str.mod + dwarf.system.proficiency, "the Test is not at 10 + Strength + Proficiency");
      assert.ok(await rendered("prone", ghoul), "the Prone is not offered before the ghoul's Test is recorded");
      // The ghoul FAILS (a pinned 1): the Prone lands at once, no button pressed (the lead:
      // *"Land automatically"*), and the card says what landed on whom.
      let unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resistOn(ghoul), doc());
      } finally {
        unpin();
      }
      await until(() => ghoul.statuses?.has("prone"), "the failure's Prone on the ghoul");
      const failed = await until(() => recordOf(ghoul), "the ghoul's Test recorded on the card");
      assert.isFalse(failed.success, "the pinned 1 passed");
      assert.deepEqual(failed.landed, ["prone"], "the card does not say the Prone landed");
      assert.isNull(await rendered("prone", ghoul), "the Prone's button stands on a row whose Test is recorded");
      assert.equal(ghoul.effects.filter(e => e.statuses?.has("slowed")).length, 1, "the failure laid a second Slowed: it is no Test's");
      // The steady ghoul PASSES (a pinned 20): no Prone, and its Nature is NOT halved.
      unpin = pinDie(20);
      try {
        await CARD_ACTIONS.resistTest(resistOn(steady), doc());
      } finally {
        unpin();
      }
      const passed = await until(() => recordOf(steady), "the steady ghoul's Test recorded");
      assert.isTrue(passed.success, "the pinned 20 failed");
      assert.isFalse(steady.statuses?.has("prone") === true, "a passed Test laid the Prone");
      const health = steady.system.health.value;
      const apply = (await doc().renderHTML()).querySelector(`button[data-action="applyDamage"][data-target-index="${at(steady)}"]`);
      assert.ok(apply, "the steady ghoul's row offers no Apply");
      await CARD_ACTIONS.applyDamage(apply, doc());
      await until(() => steady.system.health.value === Math.max(0, health - flags.damageByTarget[at(steady)].damage), "the whole Nature on the ghoul that passed");
      // The Slowed is every enemy's, pass or fail: the passed Test took nothing off it.
      assert.isTrue(steady.statuses?.has("slowed") === true, "the Slowed went with the passed Test");
      assert.equal(ghoul.effects.find(e => e.statuses?.has("slowed"))?._source.start?.combatant, theirs.id, "the ghoul's Slowed is not keyed on its own turn");
      assert.isFalse(far.statuses?.has("prone") === true || far.statuses?.has("slowed") === true, "the far ghoul was reached");
    });

    it("STORM BOLT ON A HAMMER THAT THROWS ALREADY: the Light hammer thrown with the line ticked is made on Strength, and thrown without it on Dexterity, never refused", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Light Bolt", { weapons: ["Light hammer"], ranks: { Bash: 1, "Storm Bolt": 1 }, abilities: { str: 18, dex: 10, con: 14 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // Fifteen feet: out of reach, inside the hammer's own Thrown (20 ft). Out of a fight,
      // so two attacks in a row are two attacks (no budget, no round).
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      // Rage caps at 10 (05 §11): 12 was clamped and the wait for it never ended (B8b).
      // Ten pays the one Storm Bolt (6); the plain throw costs nothing.
      await setPool(dwarf, "rage", 10);
      const hammer = itemNamed(dwarf, "Light hammer");
      assert.equal(hammer.system.weaponType, "hammer", "the Light hammer carries no hammer type");
      assert.isTrue((hammer.system.traits ?? []).some(t => /^thrown/i.test(t)), "the Light hammer carries no Thrown of its own: the test would not be the review's");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      let plain = null;
      let bolt = null;
      try {
        plain = await onCombatTab(dwarf, sheet => attackThroughDialog(sheet, hammer, dwarf, { face: 15, mode: "thrown" }));
        bolt = await onCombatTab(dwarf, sheet => attackThroughDialog(sheet, hammer, dwarf, { riders: ["storm-bolt"], face: 15, mode: "thrown" }));
      } finally {
        canvas.tokens.setTargets([]);
      }
      assert.equal(plain.flags["azeroth-rpg"].strike?.rangeKind, "thrown", "the plain throw was not recorded as a throw");
      assert.isTrue(provenanceOf(plain).some(p => p.label === AZEROTH.abilities.dex), "a throw with no Storm Bolt was not made with Dexterity (06 §1)");
      // *an attack made with one uses Strength* - the hammer's own throw, the rider ticked.
      assert.equal(bolt.flags["azeroth-rpg"].strike?.rangeKind, "thrown", "the Storm Bolt was not recorded as a throw");
      assert.isTrue(provenanceOf(bolt).some(p => p.label === AZEROTH.abilities.str), "the Storm Bolt throw was not made with Strength");
      assert.isFalse(provenanceOf(bolt).some(p => p.label === AZEROTH.abilities.dex), "the Storm Bolt throw was made with Dexterity");
    });

    it("STORM BOLT'S DIALOG LISTS THE STRENGTH ITS ROLL USES (the B8a pass; written offline, not run): the Light hammer's throw lists Dexterity, ticking the line lists Strength, and unticking it puts Dexterity back", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Bolt List", { weapons: ["Light hammer"], ranks: { Bash: 1, "Storm Bolt": 1 }, abilities: { str: 18, dex: 10, con: 14 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      // Rage caps at 10 (the case above): enough for the Storm Bolt line to be pressable.
      await setPool(dwarf, "rage", 10);
      const hammer = itemNamed(dwarf, "Light hammer");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      try {
        await onCombatTab(dwarf, async sheet => {
          attackControl(sheet, hammer)()?.click();
          const dialog = await dialogFor(dwarf, 8000);
          assert.ok(dialog, "the attack dialog did not open");
          try {
            const form = () => dialog.element.querySelector("form");
            const listed = () => form()?.querySelector(".azeroth-dialog-modifiers")?.textContent ?? "";
            const STR = game.i18n.localize(AZEROTH.abilities.str);
            const DEX = game.i18n.localize(AZEROTH.abilities.dex);
            assert.equal(form().querySelector("[data-attack-mode]")?.value, "thrown", "at 15 ft the Light hammer did not open as a throw");
            assert.include(listed(), DEX, "an unticked throw does not list Dexterity (06 §1)");
            assert.notInclude(listed(), STR, "an unticked throw lists Strength");
            const box = () => form().querySelector('input[name="rider-storm-bolt"]');
            assert.ok(box(), "the dialog draws no Storm Bolt line");
            box().checked = true;
            box().dispatchEvent(new Event("change", { bubbles: true }));
            await until(() => listed().includes(STR), "the list naming Strength once Storm Bolt is ticked");
            assert.notInclude(listed(), DEX, "the ticked throw still lists Dexterity, while its roll is made on Strength");
            box().checked = false;
            box().dispatchEvent(new Event("change", { bubbles: true }));
            await until(() => listed().includes(DEX) && !listed().includes(STR), "the list back on Dexterity once the line is unticked");
          } finally {
            await dialog.close().catch(() => {});
          }
        });
      } finally {
        canvas.tokens.setTargets([]);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
    });
    it("SHOULDER TO SHOULDER: 1 Armor Point on an ally 5 feet off and none on the dwarf; the ally 10 feet off only at rank 2", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Shoulder", { weapons: ["Battleaxe"], ranks: { Unmoved: 1, "Shoulder to Shoulder": 1 } });
      const near = await makeCharacter({ name: "ZZ LMK Near Ally", classes: [["Rogue", 3]] });
      const far = await makeCharacter({ name: "ZZ LMK Far Ally", classes: [["Rogue", 3]] });
      // Outside a fight the ally rule is the Party's (D-755).
      for (const a of [dwarf, near, far]) await a.setParty(true);
      const nearAp = near.system.ap?.body ?? 0;
      const farAp = far.system.ap?.body ?? 0;
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000 }, { actor: far, x: 1000, y: 1200 }]);
      await until(() => auraOn(near, "Shoulder to Shoulder"), "the Armor Point reaching the ally 5 feet off", 20000);
      await until(() => (near.system.ap?.body ?? 0) === nearAp + 1, "the near ally's Body Armor Points up by 1");
      await settle();
      await syncAuras(canvas.scene);
      await syncAuras(canvas.scene);
      assert.isNull(auraOn(dwarf, "Shoulder to Shoulder"), "*other than you*: the dwarf took its own Armor Point");
      assert.isNull(auraOn(far, "Shoulder to Shoulder"), "rank 1 reached 10 feet");
      // Rank 2: 10 feet.
      await talentNamed(dwarf, "Shoulder to Shoulder").update({ "system.taken": 2 });
      await until(() => auraOn(far, "Shoulder to Shoulder"), "rank 2's reach of 10 feet", 20000);
      await until(() => (far.system.ap?.body ?? 0) === farAp + 1, "the far ally's Body Armor Points up by 1");
      assert.isNull(auraOn(dwarf, "Shoulder to Shoulder"), "rank 2 laid the Armor Point on the dwarf");
    });

    it("HAMMER AND ANVIL: the rank's damage named on the card against a Prone ghoul, and not against a standing one", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Anvil", { weapons: ["Battleaxe"], ranks: { "Hammer and Anvil": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const axe = itemNamed(dwarf, "Battleaxe");
      const standing = await swingAt(dwarf, ghoul, axe, 18);
      assert.isFalse(provenanceOf(standing).some(p => p.label === "Hammer and Anvil"), "Hammer and Anvil added to a blow at a standing ghoul");
      await ghoul.toggleStatusEffect("prone", { active: true });
      await until(() => ghoul.statuses?.has("prone"), "the ghoul Prone");
      const down = await swingAt(dwarf, ghoul, itemNamed(dwarf, "Battleaxe"), 18);
      assert.isTrue(provenanceOf(down).some(p => p.label === "Hammer and Anvil" && p.value === 2), "the card does not name Hammer and Anvil's 2 against a Prone ghoul");
    });

    it("BEDROCK: the Use's halving mark for 4 Rage and a use, and the ghoul's hit Applied at half, rounded down", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Bedrock", { level: 13, weapons: ["Battleaxe"], ranks: { Bedrock: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(dwarf, "rage", 5);
      const bedrock = await until(() => featureNamed(dwarf, "Bedrock"), "Bedrock granted");
      assert.equal(bedrock.system.uses?.max, 1, "rank 1 does not count one use a Short Rest");
      const card = await clawsAt(ghoul, dwarf, 18);
      assert.isTrue(card.rolls[0].outcome.success, "the pinned Claws missed");
      const dealt = card.flags["azeroth-rpg"].damageByTarget?.[0]?.damage ?? 0;
      assert.isAbove(dealt, 0, "the ghoul's hit dealt nothing to halve");
      // *As a Reaction when an attack hits you*: pressed from the dwarf's own sheet.
      await onCombatTab(dwarf, sheet => pressForCard(useControl(sheet, bedrock), dwarf, 15));
      await until(() => poolOf(dwarf, "rage").value === 1, "Bedrock's 4 Rage");
      await until(() => dwarf.items.get(bedrock.id)?.system?.uses?.value === 0, "the Short Rest's use struck");
      await until(() => dwarf.getFlag("azeroth-rpg", "mitigate")?.halve === true, "the halving mark on the dwarf");
      const health = dwarf.system.health.value;
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applyDamage"][data-target-index="0"]');
      assert.ok(apply, "the ghoul's card offers no Apply on the dwarf");
      await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id));
      await until(() => dwarf.system.health.value === Math.max(0, health - Math.floor(dealt / 2)), "the hit taken at half, rounded down");
      await until(() => !dwarf.getFlag("azeroth-rpg", "mitigate"), "the mark spent by the blow");
    });

    it("HOLD THE HALL AT RANK 2: a step inside the reach is offered as an Opportunity Attack, its hit knocks the ghoul Prone, the round's first is free and the second paid", async function () {
      this.timeout(300000);
      const dwarf = await dwarfWarrior("ZZ LMK Hall", { weapons: ["Battleaxe"], ranks: { "Hold the Hall": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      await giveTurn(combat, ghoul);
      const mine = combatantOf(combat, dwarf);
      await until(() => mine.budget?.reactions === 1, "the dwarf's Reaction in hand");
      // A step that never leaves the dwarf's 5 feet (the diagonal square).
      const before = opportunityCards().length;
      await moveTo(ghoul, 1100, 1100);
      await until(() => opportunityCards().length === before + 1, "the step inside the reach offered as an Opportunity Attack");
      const offer = opportunityCards().at(-1);
      made.push(offer);
      const button = parsed(offer).querySelector('[data-action="opportunityAttack"]');
      assert.ok(button, "the offer carries no button");
      assert.equal(button.dataset.actorUuid, dwarf.uuid, "the offer is not the dwarf's");
      let blow = null;
      const unpin = pinDie(20);
      try {
        blow = await CARD_ACTIONS.opportunityAttack(button, game.messages.get(offer.id));
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
      }
      assert.ok(blow, "the Opportunity Attack rolled nothing");
      made.push(blow);
      assert.isTrue(blow.rolls[0].outcome.success, "the pinned 20 missed");
      await until(() => ghoul.statuses?.has("prone"), "the hit knocking the ghoul Prone");
      // *At rank 2 your first Opportunity Attack each round costs no Reaction*.
      await sleep(300);
      assert.equal(mine.budget.reactions, 1, "the round's first Opportunity Attack spent the Reaction");
      // Stood up by hand, and a second step inside the reach: offered, and paid.
      await ghoul.toggleStatusEffect("prone", { active: false });
      await until(() => !ghoul.statuses?.has("prone"), "the ghoul standing");
      const again = opportunityCards().length;
      await moveTo(ghoul, 1000, 1100);
      await until(() => opportunityCards().length === again + 1, "the second step offered");
      const second = opportunityCards().at(-1);
      made.push(second);
      const unpin2 = pinDie(20);
      try {
        const paid = await CARD_ACTIONS.opportunityAttack(parsed(second).querySelector('[data-action="opportunityAttack"]'), game.messages.get(second.id));
        if (paid) made.push(paid);
      } finally {
        unpin2();
        canvas.tokens.setTargets([]);
      }
      await until(() => mine.budget.reactions === 0, "the round's second Opportunity Attack paid with the Reaction");
    });

    it("THE MOUNTAIN WAKES: 10 Rage once a Long Rest for one effect carrying 2 Armor Points, Ward 2 in every school and 2 Damage Rating, gone with the fight", async function () {
      this.timeout(240000);
      const dwarf = await dwarfWarrior("ZZ LMK Wakes", { level: 17, weapons: ["Battleaxe"], ranks: { Bedrock: 1, "The Mountain Wakes": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dwarf, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dwarf, ghoul]);
      const mine = await giveTurn(combat, dwarf);
      await setPool(dwarf, "rage", 10);
      const wakes = await until(() => featureNamed(dwarf, "The Mountain Wakes"), "The Mountain Wakes granted");
      assert.equal(wakes.system.uses?.max, 1, "not once a Long Rest");
      const ap = dwarf.system.ap?.body ?? 0;
      const ward = dwarf.system.ward?.fire ?? 0;
      const bonus = dwarf.system.damageBonus?.attack?.all ?? 0;
      await onCombatTab(dwarf, sheet => pressForCard(useControl(sheet, wakes), dwarf, 15));
      await until(() => poolOf(dwarf, "rage").value === 0, "the 10 Rage");
      await until(() => mine.budget.halfActions === 1, "the Half-Action");
      await until(() => dwarf.items.get(wakes.id)?.system?.uses?.value === 0, "the Long Rest's use struck");
      const effect = await until(() => dwarf.effects.find(e => e.getFlag("azeroth-rpg", "talentBuff") === "The Mountain Wakes"), "the Use's one effect");
      assert.equal(effect.getFlag("azeroth-rpg", "until"), "encounter", "the effect is not held to the encounter");
      await until(() => (dwarf.system.ap?.body ?? 0) === ap + 2, "the Body's Armor Points up by 2");
      await until(() => (dwarf.system.ward?.fire ?? 0) === Math.max(ward, 2) || (dwarf.system.ward?.fire ?? 0) === ward + 2, "Ward 2 against Fire");
      for (const school of Object.keys(AZEROTH.schools)) assert.isAtLeast(dwarf.system.ward?.[school] ?? 0, 2, `no Ward 2 against ${school}`);
      await until(() => (dwarf.system.damageBonus?.attack?.all ?? 0) === bonus + 2, "the weapon attacks' Damage Rating up by 2");
      // *Until the encounter ends*: the fight's end lifts it (`_leaveFight`).
      await combat.delete();
      await until(() => !dwarf.effects.some(e => e.getFlag("azeroth-rpg", "talentBuff") === "The Mountain Wakes"), "the effect gone with the fight");
      await until(() => (dwarf.system.ap?.body ?? 0) === ap, "the Armor Points back");
    });

    it("STOUT HEART: Second Wind's card heals the tier plus the rank, and its Apply lands it", async function () {
      this.timeout(180000);
      const dwarf = await dwarfWarrior("ZZ LMK Heart", { weapons: ["Battleaxe"], ranks: { "Stout Heart": 2 } });
      const wind = await until(() => featureNamed(dwarf, "Second Wind"), "Second Wind granted");
      await until(() => (dwarf.items.get(wind.id)?.system?.modifiedBy ?? []).includes("Stout Heart"), "Second Wind naming Stout Heart");
      await setPool(dwarf, "rage", 6);
      const tier = dwarf.system.tier;
      await dwarf.update({ "system.health.value": 1 });
      await until(() => dwarf.system.health.value === 1, "the dwarf at 1 Health");
      const card = await onCombatTab(dwarf, sheet => pressForCard(useControl(sheet, wind), dwarf, 15));
      await until(() => poolOf(dwarf, "rage").value === 0, "Second Wind's 6 Rage");
      assert.equal(card.flags["azeroth-rpg"].heal, tier + 2, "the heal is not the tier plus the rank");
      const button = parsed(card).querySelector('[data-action="applyHealing"]');
      assert.ok(button, "the card offers no Apply healing");
      canvas.tokens?.releaseAll?.();
      canvas.tokens?.setTargets?.([]);
      const said = await warnings(async () => { await CARD_ACTIONS.applyHealing(button, game.messages.get(card.id)); });
      await until(() => dwarf.system.health.value === Math.min(dwarf.system.health.max, 1 + tier + 2), `the heal on the speaker: ${JSON.stringify(said)}`);
    });
  });
}
