/**
 * **THE CHROMATIC CHAMPION'S LIFE-BINDER, EARTH-WARDER AND OUTCAST TALENTS, LIVE** (stage 3A
 * of the Chromatic Champion plan): each door pressed through its real control - the Spells
 * tab's cast and the roll dialog's own talent line, the Combat tab's attack and its rider
 * line, a granted feature's Use, a card's row - and read back off the card, the board and the
 * actors.
 *
 * - Lifebinder's Flame: a branch Fire spell split on the dialog's line, the creature picked in
 *   the chooser, the target's row halved, the heal landed; Kindling Heart's Rage beside it;
 *   and a Fire Breath and a Fire Chromatic Breath split through the chooser, a Frost one asked
 *   nothing (D-845);
 * - Hearthfire: the Champion's Immolation heals an ally and the Champion at their turns and
 *   strikes no enemy;
 * - Lifeblood: a blow below half Health posts the holder's offer, and its press heals;
 * - Ember Strikes: the attack line makes the blow Fire, and a hit lays Scorched;
 * - Void Surge, Obsidian Skin, Earthshatter: the rider line spends the Void on a hit;
 * - Whisper of Madness: 4 Void and a Spirit Resist; a non-humanoid refused for nothing;
 * - False Opening: the next attack's card offers no Parry or Block;
 * - Charged Steel: a weapon hit's promise taken by the next branch spell;
 * - Court Guise: the face taken from the sheet, restored when its effect goes;
 * - Shattering Bolt at SL 2: Armor Points lost until a Short Rest;
 * - the Outcast: Tail Sweep's Resist rows, Wings Beneath's fall, Silver Tongue's line;
 * - Earth-Warder's Craft: its spells learned, Earthmeld free, Thunderlash's Void.
 *
 * And stage 3B's: the 3A review's fixes (a second Court Guise, a guise switched off, a split
 * with nothing targeted), Silver Tongue under a Court Guise alone (the lead, 2026-11-08), Font
 * of Magic with Overflow, Spellbreak with Spellthief, Hasten with Borrowed Moment, Rewind off
 * its offer, Weight of Ages' Bane and lost Reaction, Anchor of Ages' Test, Glimpse Ahead,
 * Earthen Spike's ground, Mana Hunger once a round, and the Bronze and Black Drakes.
 *
 * And stage 3C's, the 3B review's fixes: the Black Drake's landing on a real move alone (an
 * undo and a GM's token-config edit land nobody, a hidden creature is not caught), Anchor of
 * Ages' Entangled escaped at the Champion's Spell DC, Disrupt Weave asked of no ally's cast,
 * Rewind offered for no enemy and refused once its turn has passed, Spellthief's ally picked
 * before Spellbreak's Full Action, Font of Magic refused off its turn before the chooser, 02's
 * Bloodlust giving its Half-Action, Earthen Spike pinning what it knocked Prone, and Draconic
 * spoken by an Outcast who took it.
 *
 * **WRITTEN, NOT YET RUN** (stage 3A: the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chromatic-champion-talents`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, dialogFor, makeCharacter, makeNpc, made, openSheet, pinDie, settle, tokenData, tokenDrawn, untilHook, warnings, giveTurn } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { COURT_GUISE_FLAG, CHARGED_STEEL_FLAG } from "../rules/chromatic-talents.mjs";
import { HIT_MARK_FLAG } from "../rules/hit-marks.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { pickState } from "../canvas/place.mjs";

/** Press the board where a pick is waiting, at a point in canvas pixels (a Breath's aim). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Whether the one chooser is open for this item now. */
const chooserOpen = item => Boolean(foundry.applications.instances.get(`azeroth-choose-${item.id}`)?.rendered);

const CHAMPION = "Chromatic Champion";
const OUTCAST = "Chromatic Outcast";

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

const poolOf = (actor, name) => (actor.poolSnapshot?.() ?? []).find(p => p.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;

/**
 * Fill a pool to its maximum and wait for it. A fight's start EMPTIES Rage (02 §7, D-627:
 * `rules/momentum.mjs#fightStart`), and a Mage is made with no Mana, so a test that pays
 * either inside a fight, or casts a Mage's spell, fills it first.
 */
async function fillPool(actor, name) {
  const pool = await until(() => poolOf(actor, name), `${actor.name}'s ${name}`);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => poolOf(actor, name)?.value === pool.max, `${actor.name}'s ${name} full`);
}

/**
 * Two characters of The Party (D-658): out of a fight an ALLY is a Party member (D-755,
 * `rules/distance.mjs#countsAsAlly`), so a friendly token alone is not one, and a door that
 * names an ally - Lifeblood, Rewind, Font of Magic - refuses or offers nothing without it.
 */
async function partyOf(...actors) {
  for (const a of actors) await a.setParty(true);
  await until(() => actors.every(a => a.isParty), "the Party marked");
}

/**
 * A spent Use, read where the reader meets it: the sheet greys the control (it carries
 * `disabled`, so a click on it does nothing and says nothing - the Combat tab's own rule),
 * and the door itself refuses in words with nothing made (the Paladin batch's shape).
 */
async function assertSpent(assert, actor, featureName) {
  await until(() => featureNamed(actor, featureName)?.system?.uses?.value === 0, `${featureName}'s use struck`);
  const item = featureNamed(actor, featureName);
  const sheet = await openSheet(actor);
  try {
    const control = await until(() => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`), `${featureName}'s Use drawn`);
    assert.isTrue(control.disabled, `the sheet does not grey ${featureName}'s spent Use`);
  } finally { await sheet.close(); }
  let card = null;
  const said = await warnings(async () => { card = await game.system.azeroth.workflows.useFeature({ actor, item: featureNamed(actor, featureName) }); });
  assert.isNull(card, `a spent ${featureName} was made`);
  assert.include(said.join(" "), game.i18n.format("AZEROTH.Feature.NoUses", { name: featureName }));
}

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Chromatic Talents Scene", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(tokenOf(p.actor))), "every token drawn");
  await settle();
  return scene;
}

/** A fight on the viewed scene holding these actors, started. */
async function fightOf(scene, actors) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id, tokenId: tokenOf(a).id, sceneId: scene.id })));
  const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await started;
  return combat;
}

/** A Champion at a level, its pools full, with these branch talents taken at these ranks. */
async function championWith(name, { level = 20, ranks = {}, weapons = [], corruption = {}, abilities = null } = {}) {
  const champion = await makeCharacter({ name, classes: [[CHAMPION, level]], race: OUTCAST, weapons, corruption, ...(abilities ? { abilities } : {}) });
  await champion._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(champion, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  for (const item of champion.items.filter(i => i.type === "weapon")) await item.update({ "system.equipped": true });
  for (const name of ["energy", "rage"]) {
    const pool = await until(() => poolOf(champion, name), `the Champion's ${name}`);
    await champion.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
    await until(() => poolOf(champion, name).value === pool.max, `${name} full`);
  }
  return champion;
}

/**
 * Press a control that opens the roll dialog, tick these boxes by their `name`, and roll,
 * the die pinned; hand back the card it posts. `answer` runs while the card is awaited, for
 * a chooser the cast opens after the dialog.
 */
async function pressWithDialog(control, actor, { tick = [], face = 15, kind = null, answer = null } = {}) {
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === actor.id && (!kind || m.flags?.["azeroth-rpg"]?.kind === kind))
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    const button = control();
    if (!button) throw new Error("the control is not drawn");
    button.click();
    const dialog = await dialogFor(actor, 10000);
    if (!dialog) throw new Error("the roll dialog did not open");
    for (const name of tick) {
      const box = dialog.element.querySelector(`input[name="${name}"]`);
      if (!box) throw new Error(`the dialog draws no ${name}`);
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
    dialog.element.querySelector('button[data-action="roll"]').click();
    if (answer) await answer();
    return await posted;
  } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  }
}

/** Press a granted feature's Use on the Combat tab at the tokens targeted, the dialog skipped. */
async function pressUse(actor, featureName, targets = [], face = 15) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
    ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${featureName}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  control.click();
  try { return await posted; } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** The one chooser, opened for this item, and a pick by name in it. */
async function pickIn(item, names) {
  const app = await until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`);
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => names.some(n => o.textContent.trim().startsWith(n)));
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) box.checked = names.some(n => (box.closest("label")?.textContent?.trim() ?? "").startsWith(n));
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** Answer the next ask a Reaction in another's Test opens (`effects/blow-doors.mjs#confirmHere`). */
async function answerAsk(yes = true) {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask")) ?? null, "the Reaction's question");
  app.element.querySelector(`button[data-action="${yes ? "yes" : "no"}"]`).click();
}

/** Move a fight forward to this actor's turn, so its turn's start runs (core starts no turn on a move back). */
async function turnForward(combat, actor) {
  const mine = combat.getCombatantsByActor(actor)[0];
  for (let i = 0; i <= combat.turns.length + 1 && combat.combatant?.id !== mine.id; i++) {
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.nextTurn();
    await settled;
  }
  await settle();
}

/**
 * Press a card's Resist button with the die pinned, through the card's own door - the roll
 * dialog SKIPPED, or the Test waits on a dialog nobody presses until Mocha's own timeout.
 */
async function pressResist(button, message, face) {
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  try {
    await CARD_ACTIONS.resistTest(button, message);
  } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  }
}

/** Whether any message of this kind is posted inside a wait. */
async function noneOfKind(kind, run, ms = 2000) {
  const before = game.messages.size;
  await run();
  await new Promise(r => setTimeout(r, ms));
  return !game.messages.contents.slice(before).some(m => m.flags?.["azeroth-rpg"]?.kind === kind);
}

const parsed = message => new DOMParser().parseFromString(message.content, "text/html");

const castControl = (sheet, spell) => () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;

export function chromaticChampionTalentsBatch(context) {
  const { describe, it, after, assert } = context;

  describe("the Chromatic Champion's talents and the Outcast's (stages 3A and 3B)", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("LIFEBINDER'S FLAME: the dialog's line splits Scorch, the ally picked regains the other half plus Con, and Kindling Heart gives Rage", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Lifebinder", { level: 5, ranks: { "Kindled Blood": 1, "Lifebinder's Flame": 1, "Kindling Heart": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Lifebinder Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await ally.update({ "system.health.value": 1 });
      const scorch = await until(() => spellNamed(champion, "Scorch"), "Scorch learned");
      // EXACTLY Scorch's price in Rage (a branch spell is paid in Rage through Kindled Blood,
      // and an empty pool refuses the cast): the cast leaves 0, so the 1 read after it is
      // Kindling Heart's.
      const rage = poolOf(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: rage.kind, value: scorch.system.mana });
      await until(() => poolOf(champion, "rage").value === scorch.system.mana, "the Rage at Scorch's price");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, scorch), champion, {
        tick: ["tline-lifebinders-flame"], face: 18, kind: "spell", answer: () => pickIn(scorch, [ally.name])
      });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "Scorch posted no card");
      const f = card.flags["azeroth-rpg"];
      assert.equal(f.damageByTarget[0].split, true, "the target's row was not split");
      const record = f.lifebinder;
      assert.ok(record, "the card records no split");
      assert.equal(record.heals.length, 1);
      assert.equal(record.heals[0].uuid, ally.uuid, "the ally picked is not the one healed");
      const takes = f.damageByTarget[0].damage;
      const extra = record.heals[0].amount - (champion.system.abilities.con.mod ?? 0) - takes;
      assert.include([0, 1], extra, "the heal is not the other half plus Constitution");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + record.heals[0].amount), "the ally healed");
      await until(() => poolOf(champion, "rage").value === 1, "Kindling Heart's Rage");
    });

    // **D-845** (the lead, 2026-11-09: *"I want to make sure the lifebinder healing talents can
    // trigger off the Breath attack if it's fire damage"*, and *"chromatic breath is included if
    // fire damage is picked with those talents"*): Breath opens no roll dialog, so the split is
    // the one chooser's, asked once the school is Fire and the cone aimed.
    it("LIFEBINDER'S FLAME ON A FIRE BREATH: the cone pressed from the sheet is split, the ally picked regains the other half plus Con and Rekindle, Kindling Heart gives Rage", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Breath Flame", { level: 5, ranks: { "Lifebinder's Flame": 1, "Rekindle": 1, "Kindling Heart": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Fireheal Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      // The foe in the cone east of the Champion, the ally behind it: within 30 feet, out of the cone.
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: ally, x: 900, y: 1000 }]);
      await ally.update({ "system.health.value": 1 });
      // Kindling Heart's 1 is read off an empty pool (a Breath is paid in Energy).
      const rage = poolOf(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 0 });
      await until(() => poolOf(champion, "rage").value === 0, "the Rage emptied");
      const breath = await until(() => featureNamed(champion, "Breath"), "Breath granted");
      const foeBefore = foe.system.health.value;
      const pending = pressUse(champion, "Breath");
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      pressBoard({ x: 1600, y: 1050 });
      await pickIn(breath, [game.i18n.format("AZEROTH.Lifebinder.BreathSplit", { talent: "Lifebinder's Flame" })]);
      await pickIn(breath, [ally.name]);
      const card = await pending;
      assert.ok(card, "Breath posted no card");
      const f = card.flags["azeroth-rpg"];
      assert.equal(f.damageType, "fire", "Life-Binder leads, and the Breath is not Fire");
      const index = (f.targets ?? []).findIndex(t => t.actorId === foe.id);
      assert.isAtLeast(index, 0, "the foe in the cone was not gathered");
      assert.notInclude((f.targets ?? []).map(t => t.actorId), ally.id, "the ally behind was breathed on");
      const row = f.damageByTarget[index];
      assert.equal(row.split, true, "the foe's row was not split");
      assert.equal(f.passedByTarget?.[index]?.split, true, "the row a passed Reflex Test lands was not split");
      const record = f.lifebinder;
      assert.ok(record, "the card records no split");
      assert.equal(record.heals.length, 1);
      assert.equal(record.heals[0].uuid, ally.uuid, "the ally picked is not the one healed");
      // The other half is the half taken or one more; Rekindle 1 on top of Constitution.
      const extra = record.heals[0].amount - (champion.system.abilities.con.mod ?? 0) - 1 - row.damage;
      assert.include([0, 1], extra, "the heal is not the other half plus Constitution plus Rekindle");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + record.heals[0].amount), "the ally healed");
      await until(() => poolOf(champion, "rage").value === 1, "Kindling Heart's Rage on the Breath's heal");
      // The card's own Apply lands the half on the foe (no Reflex Test recorded: the failed row).
      const button = parsed(game.messages.get(card.id)).querySelector(`[data-action="applyDamage"][data-target-index="${index}"]`);
      assert.ok(button, "the card draws no Apply for the foe");
      await CARD_ACTIONS.applyDamage(button, game.messages.get(card.id));
      await until(() => foe.system.health.value === Math.max(0, foeBefore - row.damage), `the foe to take its half, ${row.damage}`);
    });

    it("LIFEBINDER'S FLAME ON A FIRE CHROMATIC BREATH: Fire picked, the cone split and pooled into the heal; a Frost Chromatic Breath asks nothing", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Chromatic Flame", { level: 20, ranks: { "Lifebinder's Flame": 1, "Rekindle": 2 } });
      const ally = await makeCharacter({ name: "ZZ CT Chromatic Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }, { actor: ally, x: 900, y: 1000 }]);
      await ally.update({ "system.health.value": 1 });
      const feature = await until(() => featureNamed(champion, "Chromatic Breath"), "Chromatic Breath granted");
      const pending = pressUse(champion, "Chromatic Breath");
      await pickIn(feature, [game.i18n.localize("AZEROTH.School.Fire")]);
      await until(() => pickState()?.mode === "facing", "the cone's aim");
      pressBoard({ x: 1800, y: 1050 });
      await pickIn(feature, [game.i18n.format("AZEROTH.Lifebinder.BreathSplit", { talent: "Lifebinder's Flame" })]);
      await pickIn(feature, [ally.name]);
      const card = await pending;
      assert.ok(card, "Chromatic Breath posted no card");
      const f = card.flags["azeroth-rpg"];
      assert.equal(f.damageType, "fire");
      const index = (f.targets ?? []).findIndex(t => t.actorId === foe.id);
      assert.isAtLeast(index, 0, "the foe in the cone was not gathered");
      const row = f.damageByTarget[index];
      assert.equal(row.split, true, "the foe's row was not split");
      const record = f.lifebinder;
      assert.equal(record?.heals?.[0]?.uuid, ally.uuid, "the ally picked is not the one healed");
      const extra = record.heals[0].amount - (champion.system.abilities.con.mod ?? 0) - 2 - row.damage;
      assert.include([0, 1], extra, "the heal is not the other half plus Constitution plus Rekindle 2");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + record.heals[0].amount), "the ally healed");

      // A second Chromatic Champion breathes Frost: no split is asked and nothing is recorded.
      const frosty = await championWith("ZZ CT Chromatic Frost", { level: 20, ranks: { "Lifebinder's Flame": 1 } });
      const foe2 = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: frosty, x: 1000, y: 1000 }, { actor: foe2, x: 1300, y: 1000, side: "hostile" }]);
      const feature2 = await until(() => featureNamed(frosty, "Chromatic Breath"), "the second Chromatic Breath granted");
      const pending2 = pressUse(frosty, "Chromatic Breath");
      await pickIn(feature2, [game.i18n.localize("AZEROTH.School.Frost")]);
      await until(() => pickState()?.mode === "facing", "the second cone's aim");
      pressBoard({ x: 1800, y: 1050 });
      let asked = false;
      const watch = setInterval(() => { if (chooserOpen(feature2)) asked = true; }, 25);
      let card2 = null;
      try { card2 = await pending2; } finally { clearInterval(watch); }
      assert.ok(card2, "a Frost Chromatic Breath posted no card");
      assert.isFalse(asked, "a Frost Chromatic Breath asked for a split");
      assert.equal(card2.flags["azeroth-rpg"].damageType, "frost");
      assert.notOk(card2.flags["azeroth-rpg"].lifebinder, "a Frost Chromatic Breath recorded a split");
      assert.notOk((card2.flags["azeroth-rpg"].damageByTarget ?? []).some(r => r?.split), "a Frost Chromatic Breath halved a row");
    });

    it("LIFEBINDER'S FLAME: a Frost-leading Champion's Breath asks for no split and halves nothing", async function () {
      this.timeout(180000);
      const champion = await championWith("ZZ CT Breath Frost", { level: 5, ranks: { "Lifebinder's Flame": 1, "Arcane Blood": 2 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const breath = await until(() => featureNamed(champion, "Breath"), "Breath granted");
      const pending = pressUse(champion, "Breath");
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      let asked = false;
      const watch = setInterval(() => { if (chooserOpen(breath)) asked = true; }, 25);
      pressBoard({ x: 1600, y: 1050 });
      let card = null;
      try { card = await pending; } finally { clearInterval(watch); }
      assert.ok(card, "Breath posted no card");
      assert.isFalse(asked, "a Frost Breath asked a chooser");
      const f = card.flags["azeroth-rpg"];
      assert.equal(f.damageType, "frost", "Spell-Weaver leads, and the Breath is not Frost");
      assert.notOk(f.lifebinder, "a Frost Breath recorded a split");
      assert.notOk((f.damageByTarget ?? []).some(r => r?.split), "a Frost Breath halved a row");
    });

    it("HEARTHFIRE: the Champion's Immolation heals the ally and the Champion at their turns, and strikes no enemy", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Hearthfire", { level: 5, ranks: { "Hearthfire": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Hearth Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: foe, x: 1000, y: 1100, side: "hostile" }]);
      const immolation = await until(() => spellNamed(champion, "Immolation"), "Immolation learned");
      const sheet = await openSheet(champion);
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(18);
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === champion.id && m.flags?.["azeroth-rpg"]?.kind === "spell");
      castControl(sheet, immolation)().click();
      const [card] = await posted;
      made.push(card);
      unpin();
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      await sheet.close();
      assert.equal(card.flags["azeroth-rpg"].areaTick?.who, "ally", "the ring is not the allies'");
      assert.equal(card.flags["azeroth-rpg"].areaTick?.heal, 2);
      await until(() => (champion.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.areaTick?.hearthfire), "the Sustain holds Hearthfire's ring");
      await ally.update({ "system.health.value": 1 });
      await champion.update({ "system.health.value": Math.max(1, champion.system.health.max - 5) });
      const foeHealth = foe.system.health.value;
      const combat = await fightOf(scene, [champion, ally, foe]);
      await giveTurn(combat, ally);
      await until(() => ally.system.health.value === 3, "the ally healed 2 at its turn");
      await giveTurn(combat, foe);
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(foe.system.health.value, foeHealth, "the ring struck an enemy");
      const own = champion.system.health.value;
      await giveTurn(combat, champion);
      await until(() => champion.system.health.value === Math.min(champion.system.health.max, own + 2), "the Champion healed in its own ring");
    });

    it("LIFEBLOOD: a blow below half Health posts the holder's offer, and its press heals tier plus rank for 3 Rage", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Lifeblood", { level: 9, ranks: { "Lifeblood": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Lifeblood Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }]);
      await partyOf(champion, ally);
      const max = ally.system.health.max;
      await ally.update({ "system.health.value": max });
      const offer = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "lifebloodOffer" && m.flags["azeroth-rpg"].target?.includes(tokenOf(ally).id));
      await ally.applyDamage(Math.ceil(max / 2) + 1, { struck: true, attack: false });
      const [message] = await offer;
      made.push(message);
      const button = await until(() => document.querySelector(`[data-message-id="${message.id}"] [data-action="lifeblood"]`), "the offer's row drawn");
      const rage = poolOf(champion, "rage").value;
      const low = ally.system.health.value;
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === champion.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
      button.click();
      const [card] = await posted;
      made.push(card);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      await until(() => poolOf(champion, "rage").value === rage - 3, "3 Rage spent");
      assert.equal(card.flags["azeroth-rpg"].heal, champion.system.tier + 1, "the heal is not tier plus rank");
      assert.isAtMost(low, Math.floor(max / 2), "the blow left the ally above half");
    });

    it("EMBER STRIKES: the attack's line makes the blow Fire, and a hit at rank 3 lays Scorched", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Ember", { level: 9, ranks: { "Ember Strikes": 3 }, weapons: ["Longsword"] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const sword = champion.items.find(i => i.type === "weapon");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(attackControl(sheet, sword), champion, { tick: ["tline-ember-strikes"], face: 12, kind: "attack" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "the attack posted no card");
      assert.equal(card.flags["azeroth-rpg"].damageType, "fire", "the blow is not Fire");
      await until(() => foe.statuses.has("scorched"), "Scorched on any hit at rank 3");
    });

    it("VOID SURGE: the rider spends up to the tier in Void on a hit, Obsidian Skin's temporary Health and Earthshatter's Prone with it", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Void", { level: 12, ranks: { "Stormblood": 1, "Void Surge": 1, "Obsidian Skin": 1, "Earthshatter": 1 }, weapons: ["Longsword"], corruption: { void: 5 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const tier = champion.system.tier;
      const sword = champion.items.find(i => i.type === "weapon");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(attackControl(sheet, sword), champion, { tick: ["rider-void-surge"], face: 19, kind: "attack" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "the attack posted no card");
      await until(() => champion.system.corruption.void === 5 - Math.min(5, tier), "the Void spent, capped at the tier");
      await until(() => champion.system.health.temp === Math.min(5, tier), "a temporary Health a Void");
      if (Math.min(5, tier) >= 3) await until(() => foe.statuses.has("prone"), "Earthshatter's Prone");
    });

    it("WHISPER OF MADNESS: 4 Void at no Rage and a Spirit Resist on a humanoid; a beast is refused for nothing", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Whisper", { level: 9, ranks: { "Whisper of Madness": 1 } });
      const humanoid = await makeNpc("Defias Footpad");
      const beast = await makeNpc("Timber Wolf").catch(() => null);
      const placements = [{ actor: champion, x: 1000, y: 1000 }, { actor: humanoid, x: 1300, y: 1000, side: "hostile" }];
      if (beast) placements.push({ actor: beast, x: 1000, y: 1300, side: "hostile" });
      await sceneWith(placements);
      const rage = poolOf(champion, "rage").value;
      if (beast && beast.system?.creatureType !== "humanoid") {
        const said = await warnings(async () => assert.isNull(await pressUse(champion, "Whisper of Madness", [tokenOf(beast)]), "a beast was whispered to"));
        assert.ok(said.length, "the refusal said nothing");
        assert.equal(champion.system.corruption.void ?? 0, 0, "the refusal gained Void");
      }
      const card = await pressUse(champion, "Whisper of Madness", [tokenOf(humanoid)]);
      assert.ok(card, "the Whisper posted no card");
      await until(() => champion.system.corruption.void === 4, "4 Void Corruption");
      assert.equal(poolOf(champion, "rage").value, rage, "the Whisper cost Rage");
      assert.ok(new DOMParser().parseFromString(card.content, "text/html").querySelector('[data-action="resistTest"]'), "no Spirit Resist row");
      assert.equal(card.flags["azeroth-rpg"].onFailInflicts?.[0]?.condition, "charmed");
    });

    it("FALSE OPENING: the next attack's card offers no Parry and no Block", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Opening", { level: 9, ranks: { "False Opening": 1 }, weapons: ["Longsword"] });
      const defender = await makeCharacter({ name: "ZZ CT Opening Defender", classes: [["Warrior", 9]], weapons: ["Longsword"], armor: ["Kite shield"] });
      for (const item of defender.items.filter(i => ["weapon", "armor"].includes(i.type))) await item.update({ "system.equipped": true });
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: defender, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightOf(scene, [champion, defender]);
      await giveTurn(combat, champion);
      await fillPool(champion, "rage");
      assert.ok(await pressUse(champion, "False Opening"), "False Opening posted no card");
      await until(() => (champion.getFlag("azeroth-rpg", "nextAttack") ?? []).some(e => e.unanswerable), "the promise laid");
      const sword = champion.items.find(i => i.type === "weapon");
      canvas.tokens.setTargets([tokenOf(defender).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(attackControl(sheet, sword), champion, { face: 19, kind: "attack" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.equal(card.flags["azeroth-rpg"].unanswerable, true, "the card does not record the promise");
      assert.notOk((card.flags["azeroth-rpg"].reactions ?? []).some(r => r.parry || r.block), "a Parry or a Block is offered");
    });

    it("CHARGED STEEL: a weapon hit's promise adds its rank to the next branch spell at that creature", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Steel", { level: 9, ranks: { "Stormblood": 1, "Charged Steel": 2 }, weapons: ["Longsword"] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const sword = champion.items.find(i => i.type === "weapon");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      await pressWithDialog(attackControl(sheet, sword), champion, { face: 19, kind: "attack" });
      await until(() => (champion.getFlag("azeroth-rpg", CHARGED_STEEL_FLAG) ?? []).length === 1, "the promise laid");
      const bolt = await until(() => spellNamed(champion, "Lightning Bolt"), "Lightning Bolt learned");
      const card = await pressWithDialog(castControl(sheet, bolt), champion, { face: 18, kind: "spell" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "the bolt posted no card");
      assert.ok(card.rolls?.[0]?.options?.provenance?.some?.(p => p.label === "Charged Steel") || card.content.includes("Charged Steel"), "the card names no Charged Steel");
      await until(() => (champion.getFlag("azeroth-rpg", CHARGED_STEEL_FLAG) ?? []).length === 0, "the promise taken");
    });

    it("COURT GUISE: the humanoid's face taken from the sheet, and put back when its effect goes", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Guise", { level: 5, ranks: { "Court Guise": 1 } });
      const noble = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: noble, x: 1300, y: 1000, side: "hostile" }]);
      const ownImg = tokenOf(champion).document.texture.src;
      const card = await pressUse(champion, "Court Guise", [tokenOf(noble)]);
      assert.ok(card, "the guise posted no card");
      const effect = await until(() => champion.effects.find(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG)), "the guise's effect");
      await until(() => tokenOf(champion).document.texture.src === tokenOf(noble).document.texture.src, "the token wears the face");
      await effect.delete();
      await until(() => tokenOf(champion).document.texture.src === ownImg, "the token's own face back");
      // Rank 1 is one use: the second is greyed on the sheet and refused at the door.
      await assertSpent(assert, champion, "Court Guise");
    });

    it("SHATTERING BOLT: at SL 2 the target loses an Armor Point at every location until a Short Rest", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Shatter", { level: 12, ranks: { "Deathwing's Malice": 1 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const body = foe.system.ap.body;
      const bolt = await until(() => spellNamed(champion, "Shattering Bolt"), "Shattering Bolt learned");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, bolt), champion, { face: 20, kind: "spell" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "the bolt posted no card");
      const mark = await until(() => foe.effects.find(e => e.getFlag("azeroth-rpg", HIT_MARK_FLAG)?.kind === "apDrop"), "the Armor Point loss laid");
      assert.equal(mark.getFlag("azeroth-rpg", "sundered"), true);
      assert.equal(foe.system.ap.body, Math.max(0, body - 1));
      await until(() => champion.system.corruption.void === 2, "Deathwing's Malice's 2 Void");
      await foe.shortRest();
      await until(() => !foe.effects.some(e => e.getFlag("azeroth-rpg", HIT_MARK_FLAG)?.kind === "apDrop"), "the Short Rest ends it");
    });

    it("THE OUTCAST: Tail Sweep's Resist rows, Wings Beneath's harmless fall, and Silver Tongue's line in the guise", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Outcast", { level: 5 });
      for (const name of ["Tail Sweep", "Wings Beneath"]) {
        const talent = await until(() => talentNamed(champion, name), `${name} embedded`);
        if (!(talent.system.taken > 0)) await talent.update({ "system.taken": 1 });
      }
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      // The lead, 2026-11-09: *"Pay 4 from your Momentum or your Power pool (Rage, Energy,
      // Mana...). The DC is 8 + Constitution modifier + proficiency, so it works the same for
      // every class."* The Champion holds full Rage and full Energy, so the one chooser asks
      // which pays before anything is spent; Rage is picked here and Energy is left alone.
      const rage = poolOf(champion, "rage").value;
      const energy = poolOf(champion, "energy").value;
      const sweep = await until(() => featureNamed(champion, "Tail Sweep"), "Tail Sweep granted");
      const pressed = pressUse(champion, "Tail Sweep");
      const chooser = await until(() => {
        const found = foundry.applications.instances.get(`azeroth-choose-${sweep.id}`);
        return found?.rendered && found.element?.querySelector("#azeroth-choose-select") ? found : null;
      }, "Tail Sweep's pool chooser");
      const offered = [...chooser.element.querySelectorAll("#azeroth-choose-select option")].map(o => o.textContent.trim());
      assert.equal(offered.length, 2, `Rage and Energy are the two pools that pay: ${offered.join(" | ")}`);
      await pickIn(sweep, [game.i18n.localize("AZEROTH.Pool.Rage")]);
      const card = await pressed;
      assert.ok(card, "Tail Sweep posted no card");
      const resist = new DOMParser().parseFromString(card.content, "text/html").querySelector('[data-action="resistTest"]');
      assert.ok(resist, "no Reflex Resist row");
      assert.equal(Number(resist.dataset.dc), 8 + champion.system.abilities.con.mod + champion.system.proficiency, "the DC is not 8 + Con + Proficiency");
      await until(() => poolOf(champion, "rage").value === rage - 4, "4 Rage");
      assert.equal(poolOf(champion, "energy").value, energy, "the Energy was spent as well");
      const health = champion.system.health.value;
      await champion.applyDamage(10, { falling: true, attack: false, struck: false });
      assert.equal(champion.system.health.value, health, "the fall hurt");
      const tongue = await until(() => talentNamed(champion, "Silver Tongue"), "Silver Tongue embedded");
      await tongue.update({ "system.taken": 1 });
      await until(() => champion.takenTalents().some(t => t.name === "Silver Tongue"), "Silver Tongue taken");
      // The lead, 2026-11-08: Silver Tongue holds under a COURT GUISE alone, never the mortal guise.
      const bare = prepareRoll(champion, { kind: "skill", skill: "deception", targets: [] });
      assert.notOk(bare.situational.automatic.some(l => l.id === "silver-tongue"), "Silver Tongue with no Court Guise");
      await champion.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ CT stand-in guise", flags: { "azeroth-rpg": { [COURT_GUISE_FLAG]: { as: { name: "x", img: "", tokenImg: "" }, own: { name: champion.name, img: champion.img, tokenImg: "", tokenName: champion.name }, tokens: [] } } } }]);
      const roll = prepareRoll(champion, { kind: "skill", skill: "deception", targets: [] });
      assert.ok(roll.situational.automatic.some(l => l.id === "silver-tongue" && l.boons === 1), "no Silver Tongue line in the Court Guise");
      const other = prepareRoll(champion, { kind: "skill", skill: "athletics", targets: [] });
      assert.notOk(other.situational.automatic.some(l => l.id === "silver-tongue"), "Silver Tongue on Athletics");
    });

    it("EARTH-WARDER'S CRAFT: its spells learned in Rage, Earthmeld free once a Short Rest, Thunderlash's 1 Void", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Craft", { level: 12, ranks: { "Stormblood": 2, "Void Surge": 1, "Earth-Warder's Craft": 2 } });
      for (const name of ["Thunderlash", "Earthmeld", "Earthen Spike", "Stone Grip"]) await until(() => spellNamed(champion, name), `${name} learned`);
      const lines = champion.talentLineOffer({ roll: "spell", spell: "Earthmeld", mana: 4, school: "nature" });
      assert.ok(lines.some(l => l.kind === "freeCast" && l.checked), "Earthmeld's free cast is not ticked");
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const rage = poolOf(champion, "rage").value;
      const thunder = spellNamed(champion, "Thunderlash");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, thunder), champion, { face: 18, kind: "spell" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "Thunderlash posted no card");
      await until(() => champion.system.corruption.void === 1, "1 Void for a tier 2 cast");
      assert.equal(poolOf(champion, "rage").value, rage - (thunder.system.mana ?? 0), "Thunderlash was not paid in Rage");
    });

    it("COURT GUISE TWICE (the 3A review, M2): a second guise over the first, ended, gives back the TRUE face", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Guise Twice", { level: 5, ranks: { "Court Guise": 2 } });
      const first = await makeNpc("Defias Footpad");
      const second = await makeCharacter({ name: "ZZ CT Guise Second", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: first, x: 1300, y: 1000, side: "hostile" }, { actor: second, x: 1000, y: 1300 }]);
      const ownImg = tokenOf(champion).document.texture.src;
      const ownName = tokenOf(champion).document.name;
      assert.ok(await pressUse(champion, "Court Guise", [tokenOf(first)]), "the first guise posted no card");
      await until(() => tokenOf(champion).document.texture.src === tokenOf(first).document.texture.src, "the first face worn");
      assert.ok(await pressUse(champion, "Court Guise", [tokenOf(second)]), "the second guise posted no card");
      const effect = await until(() => champion.effects.find(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG)?.as?.name === tokenOf(second).document.name), "the second guise's effect");
      assert.equal(champion.effects.filter(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG)).length, 1, "the first guise's effect stands beside the second");
      assert.equal(effect.getFlag("azeroth-rpg", COURT_GUISE_FLAG).own.tokenImg, ownImg, "the second record took the first guise as the true face");
      await effect.delete();
      await until(() => tokenOf(champion).document.texture.src === ownImg && tokenOf(champion).document.name === ownName, "the true face back, not the first guise's");
    });

    it("COURT GUISE SWITCHED OFF puts the face back, and on again wears the guise (the 3A review, should-fix 5)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Guise Switch", { level: 5, ranks: { "Court Guise": 1 } });
      const noble = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: noble, x: 1300, y: 1000, side: "hostile" }]);
      const ownImg = tokenOf(champion).document.texture.src;
      await pressUse(champion, "Court Guise", [tokenOf(noble)]);
      const effect = await until(() => champion.effects.find(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG)), "the guise's effect");
      await until(() => tokenOf(champion).document.texture.src === tokenOf(noble).document.texture.src, "the face worn");
      await effect.update({ disabled: true });
      await until(() => tokenOf(champion).document.texture.src === ownImg, "switched off, the own face");
      await effect.update({ disabled: false });
      await until(() => tokenOf(champion).document.texture.src === tokenOf(noble).document.texture.src, "switched on, the guise again");
    });

    it("SILVER TONGUE (the lead, 2026-11-08): no Boon with only the mortal guise, a Boon under a Court Guise", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Tongue", { level: 5, ranks: { "Silver Tongue": 1, "Court Guise": 1 } });
      const noble = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: noble, x: 1300, y: 1000, side: "hostile" }]);
      if (!champion.system.guise) await champion.update({ "system.guise": "Compendium.azeroth-rpg.races.Item.human" }).catch(() => null);
      const bare = prepareRoll(champion, { kind: "skill", skill: "deception", targets: [] });
      assert.notOk(bare.situational.automatic.some(l => l.id === "silver-tongue"), "a Boon with only the mortal guise");
      await pressUse(champion, "Court Guise", [tokenOf(noble)]);
      await until(() => champion.effects.some(e => e.getFlag("azeroth-rpg", COURT_GUISE_FLAG)), "the guise's effect");
      const guised = prepareRoll(champion, { kind: "skill", skill: "persuasion", targets: [] });
      assert.ok(guised.situational.automatic.some(l => l.id === "silver-tongue" && l.boons === 1), "no Boon under the Court Guise");
    });

    it("LIFEBINDER'S FLAME WITH NOTHING TARGETED is refused in words before the chooser, nothing spent (the 3A review, M3)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Lifebinder Bare", { level: 5, ranks: { "Kindled Blood": 1, "Lifebinder's Flame": 1 } });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }]);
      const scorch = await until(() => spellNamed(champion, "Scorch"), "Scorch learned");
      const rage = poolOf(champion, "rage").value;
      canvas.tokens.setTargets([]);
      const sheet = await openSheet(champion);
      const said = await warnings(async () => {
        const card = await pressWithDialog(castControl(sheet, scorch), champion, { tick: ["tline-lifebinders-flame"], face: 18, kind: "spell" });
        assert.isNull(card, "a split with no target posted a card");
      });
      await sheet.close();
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Lifebinder.NeedsTarget", { name: scorch.name, talent: "Lifebinder's Flame" }));
      assert.equal(poolOf(champion, "rage").value, rage, "the refusal cost Rage");
    });

    it("FONT OF MAGIC with OVERFLOW: the Rage picked in the chooser becomes the Mage's Mana, Overflow's rank more, never past its maximum", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Font", { level: 9, ranks: { "Font of Magic": 2, "Overflow": 1 } });
      const mage = await makeCharacter({ name: "ZZ CT Font Mage", classes: [["Mage", 9]] });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: mage, x: 1200, y: 1000 }]);
      await partyOf(champion, mage);
      const mana = await until(() => poolOf(mage, "mana"), "the Mage's Mana");
      await mage.updatePool({ itemId: mana.itemId, kind: mana.kind, value: 0 });
      await until(() => poolOf(mage, "mana").value === 0, "the Mage's Mana emptied");
      const rage = poolOf(champion, "rage").value;
      const feature = await until(() => featureNamed(champion, "Font of Magic"), "Font of Magic granted");
      const card = pressUse(champion, "Font of Magic", [tokenOf(mage)]);
      await pickIn(feature, [game.i18n.format("AZEROTH.FontOfMagic.Option", { n: 3 })]);
      assert.ok(await card, "Font of Magic posted no card");
      await until(() => poolOf(champion, "rage").value === rage - 3, "3 Rage spent");
      // 3 Rage, rank 2's 1 and Overflow's 1.
      await until(() => poolOf(mage, "mana").value === Math.min(poolOf(mage, "mana").max, 5), "the Mage regained 5 Mana");
    });

    it("SPELLBREAK: one Sustain on a creature within 30 feet ended at a Full Action for twice the rank in Rage, and Spellthief's tier", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Break", { level: 12, ranks: { "Mana Hunger": 1, "Spellbreak": 2, "Spellthief": 1 } });
      const caster = await makeCharacter({ name: "ZZ CT Break Caster", classes: [["Mage", 9]] });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: caster, x: 1200, y: 1000, side: "hostile" }]);
      const cast = foundry.utils.randomID();
      await caster.setFlag("azeroth-rpg", "sustaining", [{ cast, name: "Blizzard", spellId: null, uuid: null, identifier: "blizzard" }]);
      const rage = poolOf(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 0 });
      assert.ok(await pressUse(champion, "Spellbreak", [tokenOf(caster)]), "Spellbreak posted no card");
      await until(() => !(caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.cast === cast), "the Sustain ended");
      await until(() => poolOf(champion, "rage").value === Math.min(rage.max, 4 + champion.system.tier), "2 x rank and Spellthief's tier in Rage");
    });

    it("HASTEN: 5 Rage once an encounter, and the ally's next turn starts with a third Half-Action; Borrowed Moment's 10 feet beside it", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Hasten", { level: 9, ranks: { "Sands of Time": 1, "Hasten": 1, "Borrowed Moment": 2 } });
      const ally = await makeCharacter({ name: "ZZ CT Hasten Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const combat = await fightOf(scene, [champion, ally, foe]);
      await giveTurn(combat, champion);
      await fillPool(champion, "rage");
      const rage = poolOf(champion, "rage").value;
      const speed = ally.system.speed;
      assert.ok(await pressUse(champion, "Hasten", [tokenOf(ally)]), "Hasten posted no card");
      await until(() => poolOf(champion, "rage").value === rage - 5, "5 Rage");
      await until(() => ally.effects.some(e => e.getFlag("azeroth-rpg", "hastened")), "the Half-Action laid on the ally");
      await until(() => ally.system.speed === speed + 10, "Borrowed Moment's 10 feet");
      await giveTurn(combat, ally);
      const mine = combat.getCombatantsByActor(ally)[0];
      await until(() => (mine.budget?.halfActions ?? 0) === 3, "the third Half-Action at the turn's start");
      assert.notOk(ally.effects.some(e => e.getFlag("azeroth-rpg", "hastened")), "the effect outlived its turn");
      // Once an encounter: the second is greyed on the sheet and refused in words at the door.
      await assertSpent(assert, champion, "Hasten");
    });

    it("REWIND: the blow's offer row, pressed, heals half the Health it took rounded up for 2 Rage, once a Short Rest", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Rewind", { level: 9, ranks: { "Time Lapse": 1, "Rewind": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Rewind Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }]);
      await partyOf(champion, ally);
      await ally.update({ "system.health.value": ally.system.health.max });
      const offer = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "rewindOffer");
      await ally.applyDamage(7, { struck: true, attack: false });
      const [message] = await offer;
      made.push(message);
      assert.equal(message.flags["azeroth-rpg"].rewind.taken, 7, "the offer does not record the Health the blow took");
      const button = await until(() => document.querySelector(`[data-message-id="${message.id}"] [data-action="rewind"]`), "the offer's row drawn");
      const rage = poolOf(champion, "rage").value;
      const low = ally.system.health.value;
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === champion.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
      button.click();
      const [card] = await posted;
      made.push(card);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      await until(() => poolOf(champion, "rage").value === rage - 2, "2 Rage spent");
      await until(() => ally.system.health.value === low + 4, "half of 7, rounded up");
      assert.equal(game.messages.get(message.id).flags["azeroth-rpg"].pressed?.rewind, true, "the offer is not claimed");
    });

    it("WEIGHT OF AGES: a creature the holder Slowed takes the dialog's Bane against the holder, and at rank 3 has no Reaction", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Weight", { level: 12, ranks: { "Weight of Ages": 3 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const { inflictCondition } = await import("../effects/inflict.mjs");
      await inflictCondition({ victim: foe, id: "slowed", by: champion, name: foe.name });
      await until(() => foe.statuses.has("slowed"), "the Slowed laid by the holder");
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const roll = prepareRoll(foe, { kind: "attack", targets: targetSnapshots([tokenOf(champion)]) });
      assert.ok(roll.situational.automatic.some(l => l.id === "weight-of-ages" && l.banes === 1), "no Weight of Ages Bane");
      assert.equal(foe.weightOfAgesBar, true, "rank 3 leaves the creature its Reaction");
      const refusal = game.system.azeroth.workflows.turnBudgetRefusal(foe, "reaction");
      assert.equal(refusal?.reason, "AZEROTH.WeightOfAges.NoReaction");
    });

    it("ANCHOR OF AGES: the Champion's own Arcane Anchor carries a Spirit Test at the start of a turn inside, its Entangled ended by leaving", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Anchor", { level: 12, ranks: { "Anchor of Ages": 1 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const anchor = await until(() => spellNamed(champion, "Arcane Anchor"), "Arcane Anchor learned");
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, anchor), champion, { face: 19, kind: "spell" });
      await sheet.close();
      const tick = card.flags["azeroth-rpg"].areaTick;
      assert.equal(tick?.anchor, "Anchor of Ages", "the cast's tick names no Anchor of Ages");
      assert.deepEqual(tick.checks.map(c => [c.on, c.resilience, c.fail.statuses, c.fail.until]), [["turn", "spirit", ["entangled"], "leaves"]]);
    });

    it("DISRUPT WEAVE: asked in a Mage's cast, paid tier plus 2 Rage, the Mage's failed Spirit Test fails the spell and its Mana stays spent", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Disrupt", { level: 20, ranks: { "Mana Hunger": 1, "Spellbreak": 1, "Disrupt Weave": 1 } });
      const mage = await makeCharacter({ name: "ZZ CT Disrupt Mage", classes: [["Mage", 5]], spells: ["Frostbolt"] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: mage, x: 1500, y: 1000, side: "hostile" }, { actor: foe, x: 1700, y: 1000, side: "hostile" }]);
      const spell = mage.items.find(i => i.type === "spell" && i.system.tier === 1);
      assert.ok(spell, "the Mage holds no tier 1 spell");
      await fillPool(mage, "mana");
      const rage = poolOf(champion, "rage").value;
      const mana = poolOf(mage, "mana").value;
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      // One face for every d20: the Casting Test holds at 10 and the Mage's Spirit Test against
      // a level 20 Champion's Spell DC does not.
      const unpin = pinDie(10);
      const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === mage.id && m.flags?.["azeroth-rpg"]?.kind === "spell");
      try {
        const sheet = await openSheet(mage);
        castControl(sheet, spell)().click();
        await answerAsk(true);
        const [card] = await posted;
        made.push(card);
        await sheet.close();
        assert.ok(card.rolls[0].options.disrupted, "the cast does not record the disruption");
        assert.equal(card.rolls[0].outcome.success, false, "the disrupted spell went off");
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      }
      await until(() => poolOf(champion, "rage").value === rage - (spell.system.tier + 2), "the tier plus 2 Rage");
      assert.isBelow(poolOf(mage, "mana").value, mana, "the disrupted spell's Mana was not spent");
    });

    it("GLIMPSE AHEAD: Initiative rises by the rank", async function () {
      this.timeout(120000);
      const plain = await championWith("ZZ CT Glimpse Plain", { level: 5 });
      const champion = await championWith("ZZ CT Glimpse", { level: 5, ranks: { "Glimpse Ahead": 2 } });
      await until(() => champion.system.initiative === plain.system.initiative + 2, "2 more Initiative at rank 2");
    });

    it("EARTHEN SPIKE: a Region on the creature struck, Difficult ground to the end of the caster's next turn", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Spike", { level: 12, ranks: { "Stormblood": 1, "Void Surge": 1, "Earth-Warder's Craft": 2 } });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const spike = await until(() => spellNamed(champion, "Earthen Spike"), "Earthen Spike learned");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, spike), champion, { face: 19, kind: "spell" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "Earthen Spike posted no card");
      const region = await until(() => scene.regions.find(r => r.getFlag("azeroth-rpg", "areaGround")?.from === "target"), "the ground placed at the target");
      assert.equal(region.getFlag("azeroth-rpg", "lasts")?.rounds, 1);
      await until(() => region.behaviors.some(b => b.type === "difficultFor"), "the reconciler laid its Difficult ground");
    });

    it("MANA HUNGER: a cast within 30 feet gives 1 Rage, once a round", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Hunger", { level: 5, ranks: { "Mana Hunger": 1 } });
      const mage = await makeCharacter({ name: "ZZ CT Hunger Mage", classes: [["Mage", 5]], spells: ["Frostbolt"] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: mage, x: 1200, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const combat = await fightOf(scene, [champion, mage, foe]);
      await giveTurn(combat, mage);
      const rage = poolOf(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 0 });
      const spell = mage.items.find(i => i.type === "spell" && i.system.tier === 1 && i.system.action === "half")
        ?? mage.items.find(i => i.type === "spell" && i.system.tier === 1);
      assert.ok(spell, "the Mage holds no tier 1 spell");
      await fillPool(mage, "mana");
      const cast = async () => {
        const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === mage.id && m.flags?.["azeroth-rpg"]?.kind === "spell");
        const sheet = await openSheet(mage);
        castControl(sheet, spell)().click();
        const [card] = await posted;
        made.push(card);
        await sheet.close();
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      };
      await cast();
      await until(() => poolOf(champion, "rage").value === 1, "1 Rage on the cast");
      const mana = poolOf(mage, "mana");
      await mage.updatePool({ itemId: mana.itemId, kind: mana.kind, value: mana.max });
      await combat.getCombatantsByActor(mage)[0].resetBudget();
      await cast();
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(poolOf(champion, "rage").value, 1, "Mana Hunger fed twice in a round");
    });

    it("THE BRONZE DRAKE: the form taken on the Champion's own turn gives a Half-Action back", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Bronze", { level: 20, ranks: { "Sands of Time": 2, "Glimpse Ahead": 2, "Temporal Drag": 2, "Hasten": 2, "Time Lapse": 1, "Weight of Ages": 3, "Fold Space": 2, "Rewind": 2, "Borrowed Moment": 2, "Anchor of Ages": 1, "Paradox": 2, "Bronze Drake": 1 } });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const combat = await fightOf(scene, [champion, foe]);
      await giveTurn(combat, champion);
      const mine = combat.getCombatantsByActor(champion)[0];
      const card = await pressUse(champion, "Bronze Drake");
      assert.ok(card, "the form posted no card");
      await until(() => champion.shape?.kind === "drake", "the drake form taken");
      await until(() => (mine.budget?.halfActions ?? 0) === 2, "the Half-Action the form cost given back");
      assert.ok(card.content.includes(game.i18n.format("AZEROTH.BronzeDrake.Half", { name: champion.name, talent: "Bronze Drake" })), "the card does not say so");
    });

    it("THE BLACK DRAKE: landing from flight asks every creature within 10 feet for a Reflex Test, and a failure is Prone", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Black", { level: 20, ranks: { "Stormblood": 2, "Court Guise": 2, "Silver Tongue": 2, "Void Surge": 2, "False Opening": 2, "Charged Steel": 2, "Earth-Warder's Craft": 2, "Whisper of Madness": 1, "Obsidian Skin": 3, "Deathwing's Malice": 1, "Earthshatter": 2, "Black Drake": 1 } });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      assert.ok(await pressUse(champion, "Black Drake"), "the form posted no card");
      await until(() => champion.shape?.kind === "drake", "the drake form taken");
      await settle();
      const doc = tokenOf(champion).document;
      await doc.update({ elevation: 20 });
      await until(() => tokenOf(champion).document.elevation === 20, "aloft");
      const unpin = pinDie(1);
      const landed = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "blackDrakeLanding");
      try {
        await tokenOf(champion).document.update({ elevation: 0 });
        const [card] = await landed;
        made.push(card);
      } finally { unpin(); }
      await until(() => foe.statuses.has("prone"), "the failed Reflex Test knocked Prone");
    });

    /* ---- stage 3C: the 3B review's fixes -------------------------------- */

    it("THE BLACK DRAKE LANDS ONLY ON A REAL MOVE: an undo and a GM's token-config edit land nobody, and a hidden creature is not caught (the 3B review, M1)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Black Real", { level: 20, ranks: { "Stormblood": 2, "Court Guise": 2, "Silver Tongue": 2, "Void Surge": 2, "False Opening": 2, "Charged Steel": 2, "Earth-Warder's Craft": 2, "Whisper of Madness": 1, "Obsidian Skin": 3, "Deathwing's Malice": 1, "Earthshatter": 2, "Black Drake": 1 } });
      const foe = await makeNpc("Defias Footpad");
      const lurker = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: lurker, x: 900, y: 1000, side: "hostile" }]);
      await tokenOf(lurker).document.update({ hidden: true });
      assert.ok(await pressUse(champion, "Black Drake"), "the form posted no card");
      await until(() => champion.shape?.kind === "drake", "the drake form taken");
      await settle();
      const doc = () => tokenOf(champion).document;
      const up = async () => { await doc().update({ elevation: 20 }); await until(() => doc().elevation === 20, "aloft"); };
      const unpin = pinDie(1);
      try {
        await up();
        assert.isTrue(await noneOfKind("blackDrakeLanding", () => doc().update({ elevation: 0 }, { isUndo: true })), "an undo landed the drake");
        await until(() => doc().elevation === 0, "the undo down");
        await up();
        assert.isTrue(await noneOfKind("blackDrakeLanding", () => doc().update({ elevation: 0 }, { method: "config" })), "a GM's token-config edit landed the drake");
        await until(() => doc().elevation === 0, "the edit down");
        await up();
        const landed = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "blackDrakeLanding");
        await doc().update({ elevation: 0 });
        const [card] = await landed;
        made.push(card);
        assert.include(card.content, tokenOf(foe).document.name, "the visible foe was not asked");
        await until(() => foe.statuses.has("prone"), "the visible foe Prone");
      } finally { unpin(); }
      assert.notOk(lurker.statuses.has("prone"), "the hidden creature was caught");
    });

    it("ANCHOR OF AGES' ENTANGLED HAS A WAY OUT: an action and a Reflex Test at the Champion's Spell DC, prompted at the creature's turn (the 3B review, M2; the lead)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Anchor Escape", { level: 12, ranks: { "Anchor of Ages": 1 } });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const anchor = await until(() => spellNamed(champion, "Arcane Anchor"), "Arcane Anchor learned");
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, anchor), champion, { face: 19, kind: "spell" });
      await sheet.close();
      const escape = card.flags["azeroth-rpg"].areaTick?.checks?.[0]?.fail?.escape;
      assert.deepInclude(escape, { condition: "entangled", on: "action", resilience: "reflex", dc: champion.system.spellDC }, "the check carries no escape at the Spell DC");
      const at = tokenOf(foe).center;
      const region = await placeArea({ item: anchor, scene, origin: { x: at.x, y: at.y }, flags: regionFlagsFromCard(card, champion, anchor) });
      assert.ok(region, "no Region");
      // COUNTED BEFORE THE FIGHT STARTS: the Footpad's Initiative of 12 beats a level 12
      // Champion's, so its side acts first and its turn's start - the Anchor's Test - runs
      // inside `startCombat`, before any count taken after it.
      const count = game.messages.size;
      const combat = await fightOf(scene, [champion, foe]);
      await turnForward(combat, foe);
      const test = await until(() => game.messages.contents.slice(count).find(m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === foe.uuid), "the Anchor's Spirit Test", 30000);
      made.push(test);
      await pressResist(parsed(test).querySelector('[data-action="resistTest"]'), test, 1);
      const held = await until(() => foe.effects.find(e => e.statuses?.has("entangled")), "the foe Entangled");
      assert.deepInclude(held.getFlag("azeroth-rpg", ESCAPE_FLAG) ?? {}, { condition: "entangled", on: "action", resilience: "reflex", dc: champion.system.spellDC }, "the Entangled carries no escape");
      const again = game.messages.size;
      await turnForward(combat, champion);
      await turnForward(combat, foe);
      const prompt = await until(() => game.messages.contents.slice(again).find(m => m.flags?.["azeroth-rpg"]?.purpose === "escape"), "the escape's prompt", 30000);
      made.push(prompt);
      await pressResist(parsed(prompt).querySelector('[data-action="resistTest"][data-purpose="escape"]'), prompt, 20);
      await until(() => !foe.effects.has(held.id), "the Entangled ended on a pass");
    });

    it("DISRUPT WEAVE IS ASKED OF NO ALLY'S CAST (the lead: *Enemies only*)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Disrupt Ally", { level: 20, ranks: { "Mana Hunger": 1, "Spellbreak": 1, "Disrupt Weave": 1 } });
      const mage = await makeCharacter({ name: "ZZ CT Disrupt Friend", classes: [["Mage", 5]], spells: ["Frostbolt"] });
      const foe = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: mage, x: 1500, y: 1000 }, { actor: foe, x: 1700, y: 1000, side: "hostile" }]);
      const spell = mage.items.find(i => i.type === "spell" && i.system.tier === 1);
      assert.ok(spell, "the Mage holds no tier 1 spell");
      await fillPool(mage, "mana");
      const rage = poolOf(champion, "rage").value;
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(15);
      try {
        const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === mage.id && m.flags?.["azeroth-rpg"]?.kind === "spell");
        const sheet = await openSheet(mage);
        castControl(sheet, spell)().click();
        const [card] = await posted;
        made.push(card);
        await sheet.close();
        assert.notOk(card.rolls[0].options.disrupted, "an ally's cast was disrupted");
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      }
      assert.notOk([...foundry.applications.instances.values()].some(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask")), "the Champion was asked about an ally's cast");
      assert.equal(poolOf(champion, "rage").value, rage, "Rage was spent on an ally's cast");
    });

    it("REWIND IS OFFERED FOR NO ENEMY, AND ITS OFFER LAPSES WITH THE BLOW'S TURN (the 3B review, should-fix 3)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Rewind Stale", { level: 9, ranks: { "Time Lapse": 1, "Rewind": 1 } });
      const ally = await makeCharacter({ name: "ZZ CT Rewind Stale Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: foe, x: 1100, y: 1100, side: "hostile" }]);
      const combat = await fightOf(scene, [champion, ally, foe]);
      await giveTurn(combat, foe);
      await fillPool(champion, "rage");
      assert.isTrue(await noneOfKind("rewindOffer", () => foe.applyDamage(3, { struck: true, attack: false })), "Rewind was offered for an enemy's blow");
      await ally.update({ "system.health.value": ally.system.health.max });
      const offer = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "rewindOffer");
      await ally.applyDamage(5, { struck: true, attack: false });
      const [message] = await offer;
      made.push(message);
      assert.equal(message.flags["azeroth-rpg"].rewind.at?.combatId, combat.id, "the offer records no moment");
      await turnForward(combat, champion);
      const button = await until(() => document.querySelector(`[data-message-id="${message.id}"] [data-action="rewind"]`), "the offer's row drawn");
      const rage = poolOf(champion, "rage").value;
      const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      try {
        const said = await warnings(async () => { button.click(); await new Promise(r => setTimeout(r, 1500)); });
        assert.include(said.join(" "), game.i18n.format("AZEROTH.Rewind.Stale", { name: "Rewind" }), "the stale offer was not refused in words");
      } finally {
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
      }
      assert.equal(poolOf(champion, "rage").value, rage, "a stale Rewind spent Rage");
    });

    it("SPELLTHIEF'S ALLY IS PICKED BEFORE SPELLBREAK'S FULL ACTION: a dismissed chooser spends nothing (the 3B review, should-fix 5)", async function () {
      this.timeout(300000);
      const champion = await championWith("ZZ CT Thief", { level: 12, ranks: { "Mana Hunger": 1, "Spellbreak": 2, "Spellthief": 2 } });
      const caster = await makeCharacter({ name: "ZZ CT Thief Caster", classes: [["Mage", 9]] });
      const mageA = await makeCharacter({ name: "ZZ CT Thief Mage A", classes: [["Mage", 5]] });
      const mageB = await makeCharacter({ name: "ZZ CT Thief Mage B", classes: [["Mage", 5]] });
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: caster, x: 1200, y: 1000, side: "hostile" }, { actor: mageA, x: 1000, y: 1100 }, { actor: mageB, x: 1100, y: 1100 }]);
      const combat = await fightOf(scene, [champion, caster, mageA, mageB]);
      await giveTurn(combat, champion);
      const cast = foundry.utils.randomID();
      await caster.setFlag("azeroth-rpg", "sustaining", [{ cast, name: "Blizzard", spellId: null, uuid: null, identifier: "blizzard" }]);
      const mine = combat.getCombatantsByActor(champion)[0];
      const halves = mine.budget?.halfActions ?? 0;
      const card = pressUse(champion, "Spellbreak", [tokenOf(caster)]);
      const chooser = await until(() => {
        const found = foundry.applications.instances.get(`azeroth-choose-${champion.id}-spellthief`);
        return found?.rendered ? found : null;
      }, "Spellthief's chooser before the payment");
      assert.equal(mine.budget?.halfActions ?? 0, halves, "the Full Action was spent before the pick");
      await chooser.close();
      assert.isNull(await card, "a dismissed pick made the Use");
      assert.equal(mine.budget?.halfActions ?? 0, halves, "a dismissed pick spent the Full Action");
      assert.ok((caster.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.cast === cast), "a dismissed pick ended the Sustain");
    });

    it("FONT OF MAGIC OFF ITS TURN IS REFUSED BEFORE THE CHOOSER (the 3B review, should-fix 6)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Font Budget", { level: 9, ranks: { "Font of Magic": 1 } });
      const mage = await makeCharacter({ name: "ZZ CT Font Budget Mage", classes: [["Mage", 9]] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: mage, x: 1200, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const mana = await until(() => poolOf(mage, "mana"), "the Mage's Mana");
      await mage.updatePool({ itemId: mana.itemId, kind: mana.kind, value: 0 });
      const combat = await fightOf(scene, [champion, mage, foe]);
      await giveTurn(combat, foe);
      const feature = await until(() => featureNamed(champion, "Font of Magic"), "Font of Magic granted");
      const said = await warnings(async () => assert.isNull(await pressUse(champion, "Font of Magic", [tokenOf(mage)]), "Font of Magic was made off the Champion's turn"));
      assert.ok(said.length, "the refusal said nothing");
      assert.notOk(foundry.applications.instances.get(`azeroth-choose-${feature.id}`)?.rendered, "the chooser opened before the budget's refusal");
    });

    it("02's BLOODLUST: 8 Mana, and each target's next turn starts with an extra Half-Action (the lead: *Fix it now*)", async function () {
      this.timeout(300000);
      const shaman = await makeCharacter({ name: "ZZ CT Bloodlust Shaman", classes: [["Shaman", 14]] });
      const ally = await makeCharacter({ name: "ZZ CT Bloodlust Ally", classes: [["Warrior", 5]] });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const mana = await until(() => poolOf(shaman, "mana"), "the Shaman's Mana");
      await shaman.updatePool({ itemId: mana.itemId, kind: mana.kind, value: mana.max });
      await until(() => poolOf(shaman, "mana").value === mana.max, "Mana full");
      const combat = await fightOf(scene, [shaman, ally, foe]);
      await giveTurn(combat, shaman);
      assert.ok(await pressUse(shaman, "Bloodlust", [tokenOf(ally)]), "Bloodlust posted no card");
      await until(() => poolOf(shaman, "mana").value === mana.max - 8, "8 Mana");
      await until(() => ally.effects.some(e => e.getFlag("azeroth-rpg", "hastened")?.source === "Bloodlust"), "the Half-Action laid on the ally");
      await turnForward(combat, ally);
      const theirs = combat.getCombatantsByActor(ally)[0];
      await until(() => (theirs.budget?.halfActions ?? 0) === 3, "the extra Half-Action at the turn's start");
      assert.notOk(ally.effects.some(e => e.getFlag("azeroth-rpg", "hastened")), "the effect outlived its turn");
    });

    it("EARTHEN SPIKE PINS WHAT IT KNOCKED PRONE: the Stand is refused in words while the spike stands (the 3B review, should-fix 15)", async function () {
      this.timeout(240000);
      const champion = await championWith("ZZ CT Spike Pin", { level: 12, ranks: { "Stormblood": 1, "Void Surge": 1, "Earth-Warder's Craft": 2 } });
      const foe = await makeNpc("Defias Footpad");
      const scene = await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const spike = await until(() => spellNamed(champion, "Earthen Spike"), "Earthen Spike learned");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(champion);
      const card = await pressWithDialog(castControl(sheet, spike), champion, { face: 19, kind: "spell" });
      await sheet.close();
      canvas.tokens.setTargets([]);
      assert.ok(card, "Earthen Spike posted no card");
      const region = await until(() => scene.regions.find(r => r.getFlag("azeroth-rpg", "pinsProne") === true), "the spike's Region pins");
      const { inflictCondition } = await import("../effects/inflict.mjs");
      await inflictCondition({ victim: foe, id: "prone", by: champion, name: foe.name });
      await until(() => foe.statuses.has("prone"), "knocked Prone by the Champion");
      const said = await warnings(async () => assert.isFalse(await foe.toggleStatusEffect("prone", { active: false }), "the pinned creature stood"));
      assert.include(said.join(" "), game.i18n.format("AZEROTH.TargetGround.Pinned", { name: foe.name, spell: "Earthen Spike" }));
      assert.ok(foe.statuses.has("prone"), "the Prone was lifted");
      await region.delete();
      await foe.toggleStatusEffect("prone", { active: false });
      await until(() => !foe.statuses.has("prone"), "the spike gone, the creature stands");
    });

    it("DRACONIC: an Outcast who took the racial talent speaks Draconic (the lead: *Add Draconic*)", async function () {
      this.timeout(120000);
      const champion = await championWith("ZZ CT Draconic", { level: 5 });
      const talent = await until(() => talentNamed(champion, "Draconic"), "Draconic embedded");
      if (!(talent.system.taken > 0)) await talent.update({ "system.taken": 1 });
      await until(() => champion.system.languages.includes("draconic"), "Draconic spoken");
      assert.notInclude(champion._source.system.languages, "draconic", "the derived tongue was written over the stored list");
    });
  });
}
