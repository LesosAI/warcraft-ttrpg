/**
 * Phase 12 (2026-09-06): what the lead found at the table, batch by batch.
 *
 * - `tableBatch`: an affix's grants reach the score, the skill Test and the
 *   spell; a corruption rung does what 10 says; a skill's right click says
 *   what it covers; the row's detail says what the entry says; a Critical
 *   Injury is the target's; a cast, a use and a move spend the turn's
 *   budget; The Party is marked and joins the fight.
 * - `spellEffectBatch`: Ice Lance's rider, a failed Resist Test's
 *   conditions, a lasting spell laid on its target, Spellpower on a tier-3
 *   spell; who resisted, recorded on the card row by row and shown to the
 *   target's owner and the GM (D-726); and what a cast records reaching the
 *   Region it places and the effect it lays (D-724).
 * - `creatorSpellsBatch`: the spells step, the shelved catalogue, the
 *   owner on Finish.
 *
 * Every test makes its own documents and `cleanup` removes them.
 */

import { cleanup, inspect, made, makeCharacter, makeNpc, openSheet, pinDie, settle, cardOf, fromPack, PACK_FOR, untilHook } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
// The GM-side door a Resist row's record goes through (D-726): what it refuses
// is the half no unit test can reach.
import { annotateQueryHandler } from "../dice/annotate.mjs";
import { MOVEMENT_LIMIT_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { applyAffixInPlace, affixOf } from "../applications/affix-dialog.mjs";
import { attackWithDialog, castWithDialog, describeSkill, npcAttackWithDialog } from "../applications/actions.mjs";
// Hiding (D-717): the Combat tab's own door, driven without clicking.
import { clearHidden, hide } from "../applications/combat-actions.mjs";
import { NO_HEALING } from "../rules/corruption-effects.mjs";
import { stepsFor } from "../rules/creation.mjs";

const until = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
};

/** A target as the pipeline snapshots one (roll-dialog.mjs#targetSnapshots), with the statuses given. */
const snapshotOf = (npc, statuses = []) => ({
  tokenId: null, sceneId: null, actorId: npc.id, name: npc.name, defense: npc.system.defense,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {},
  immune: [], vulnerable: [], statuses
});

/** An affix from the pack by name, as the plain shape the appliers read. */
async function affixNamed(name) {
  const pack = game.packs.get("azeroth-rpg.affixes");
  const docs = await pack.getDocuments();
  const doc = docs.find(d => d.name === name);
  if (!doc) throw new Error(`no affix named ${name}`);
  return affixOf(doc);
}

/** The warnings a call raised, with the notifier put back. */
async function noticesFrom(fn) {
  const watch = notice();
  try { return { result: await fn(), warned: watch.warns }; }
  finally { watch.done(); }
}

/** Every `ui.notifications.warn` this block raises, and the restore. */
function notice() {
  const warns = [];
  const original = ui.notifications.warn;
  ui.notifications.warn = (...args) => { warns.push(args[0]); return original.apply(ui.notifications, args); };
  return { warns, done: () => { ui.notifications.warn = original; } };
}

/**
 * A token on the given scene and a started fight whose turn is that token's -
 * which is everything `onPreMoveToken` gates on (D-718).
 *
 * The token is created with `actorLink` so the combatant, the world actor and
 * the thing being dragged are one creature.
 */
async function fightOnAScene(scene, actor, { y = 500 } = {}) {
  await actor.update({ "prototypeToken.actorLink": true });
  const data = (await actor.getTokenDocument({
    x: 500, y, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
  })).toObject();
  const [token] = await scene.createEmbeddedDocuments("Token", [data]);
  for (let i = 0; i < 60 && !canvas.ready; i++) await new Promise(r => setTimeout(r, 100));
  await settle();
  const combat = await Combat.create({ scene: scene.id });
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id, tokenId: token.id, sceneId: scene.id }]);
  await combat.startCombat();
  const combatant = combat.combatants.find(c => c.tokenId === token.id);
  for (let i = 0; i < 100 && combatant.budget.halfActions !== 2; i++) await new Promise(r => setTimeout(r, 50));
  if (combat.combatant?.id !== combatant.id) throw new Error("the fight did not open on the mover's turn");
  return { token, combat, combatant };
}

/**
 * End a movement test's fight WITHOUT leaving a write in flight.
 *
 * **`Combat#_onExit` clears the mover's movement history and is NOT awaited by
 * the delete** (`#onExit` → `_clearMovementHistoryOnExit`, 14.367), so a token
 * update lands after `combat.delete()` resolves - and if the scene has gone by
 * then the server throws *The Scene X does not exist in scenes*, which the
 * smoke spec rightly fails the whole run on. Clearing the history here first
 * makes core's own call a no-op: `clearMovementHistory` returns early on an
 * empty `_movementHistory`.
 */
async function endMovementFight(token, combat) {
  await token.clearMovementHistory();
  await combat.delete();
  // **AND NOTHING IS LEFT SELECTED.** A card button with no target row falls
  // back to `canvas.tokens.controlled` (`dice/chat.mjs`), so a token left
  // selected by one batch answers another batch's card - and a Resilience Test
  // rolled by the wrong actor reads as the condition never landing.
  canvas?.tokens?.releaseAll?.();
  await settle();
}

/** The roll dialog skipped for the test - the setting is "skip", not a boolean - and put back after. */
async function withDialogSkipped(fn) {
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  try { return await fn(); } finally { await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); }
}

/**
 * Core's scrolling status text off for a test, and back after.
 *
 * `ActiveEffect#_displayScrollingStatus` animates a PIXI text over every token
 * an effect lands on for two seconds and NOTHING awaits it, so a test that
 * lands a condition on a token and then takes its scene off the board leaves
 * that animation running against a torn-down canvas: core throws *Cannot read
 * properties of null* out of `#animateFrame` and again out of
 * `PreciseText.destroy`, and those are PAGE ERRORS the smoke spec rightly
 * fails the whole run on. `InterfaceCanvasGroup#createScrollingText` returns
 * at once while the setting is off (14.367), so nothing is left to animate.
 */
async function withoutScrollingText(fn) {
  const before = game.settings.get("core", "scrollingStatusText");
  await game.settings.set("core", "scrollingStatusText", false);
  try { return await fn(); } finally { await game.settings.set("core", "scrollingStatusText", before); }
}

/**
 * Press a card's Resist button with the die pinned and the dialog skipped, and
 * hand back the Resilience card the Test posted (D-726) - kept in `made`, so
 * the batch's teardown takes it with everything else.
 */
async function pressResist(button, message, face) {
  const before = new Set(game.messages.map(m => m.id));
  await withDialogSkipped(async () => {
    const unpin = pinDie(face);
    try { await CARD_ACTIONS.resistTest(button, message); } finally { unpin(); }
  });
  const posted = game.messages.filter(m => !before.has(m.id) && m.flags?.["azeroth-rpg"]?.kind === "resilience");
  made.push(...posted);
  return posted.at(-1) ?? null;
}

/** The record a spell card holds under a key, once the write that makes it has landed (D-726). */
async function recordOn(message, key, ready = record => Boolean(record)) {
  await until(() => ready(message.getFlag("azeroth-rpg", "resists")?.[key]), `the Resist record under ${key}`);
  return message.getFlag("azeroth-rpg", "resists")[key];
}

/** Press the board at a canvas point, the way a player's click lands (D-723's own helper). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/**
 * A card run through THIS SYSTEM'S render hook alone, as the GM or as a user
 * who is not one (D-726).
 *
 * Only a second client could be a player for real. The role is stubbed on the
 * one user there is - `quench-phase0.mjs`'s own shape - for a call that is
 * SYNCHRONOUS and runs nothing but the system's hook, so no other module's
 * listener and no awaited write ever sees the stub, and it is off again before
 * the next line.
 */
function renderedAs(message, { asPlayer = false } = {}) {
  const ours = (Hooks.events.renderChatMessageHTML ?? []).find(h => String(h.fn).includes("data-resist-owner"));
  if (!ours) throw new Error("the system's chat render hook is not registered");
  const box = document.createElement("div");
  box.innerHTML = message.content;
  if (asPlayer) Object.defineProperty(game.user, "isGM", { value: false, configurable: true });
  try {
    ours.fn(message, box);
  } finally {
    if (asPlayer) delete game.user.isGM;
  }
  return box;
}

/* ------------------------------------------------------------------------ */

export function tableBatch(context) {
  const { describe, it, assert, after, before } = context;

  describe("Grants, corruption and the table's fixes (2026-09-06)", function () {
    // **`cleanup` NEEDS A LONG TIMEOUT** and its own docblock says so: a hook
    // takes mocha's 2000 ms default, and this one deletes a dozen actors, each
    // waiting on the talent grant its class started. It timed out under load
    // and reported as a failing suite with every test in it green.
    after(async function () { this.timeout(180000); await cleanup(); });

    // ---- an affix's grants (08 §6) ---------------------------------------

    it("of the Bear on a worn sword raises Strength's total and modifier, and the item says what it grants", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Bear Warrior", classes: [["Warrior", 3]], weapons: ["Longsword"], abilities: { str: 15 } });
      const sword = actor.items.find(i => i.name === "Longsword");
      await applyAffixInPlace(sword, await affixNamed("of the Bear"));
      await until(() => actor.items.get(sword.id)?.name === "Longsword of the Bear", "the affixed name");
      assert.deepEqual(actor.items.get(sword.id).getFlag("azeroth-rpg", "grants"), ["+1 Strength"]);
      assert.equal(actor.system.abilities.str.bonus, 0, "a sword in the pack grants nothing");
      await sword.update({ "system.equipped": true });
      await until(() => actor.system.abilities.str.bonus === 1, "the worn grant");
      assert.equal(actor.system.abilities.str.value, 15, "the stored score is untouched");
      assert.equal(actor.system.abilities.str.total, 16);
      assert.equal(actor.system.abilities.str.mod, 3, "the modifier reads the total");
      const sheet = await openSheet(actor);
      try {
        const chip = sheet.element.querySelector('.azeroth-attribute [data-ability="str"] ~ .azeroth-chip-gear, .azeroth-attribute .azeroth-chip-gear');
        assert.ok(chip, "no gear chip on the plate");
        assert.equal(chip.textContent.trim(), "+1");
        // The plate shows the score as worn and says how on hover; typing writes the base less the gear.
        const score = sheet.element.querySelector('input.azeroth-score[data-ability-score="str"]');
        assert.equal(score.value, "16", "the plate does not show the score as worn");
        assert.include(score.dataset.tooltip, "15 + 1", "the hover does not say base plus gear");
        assert.include(score.dataset.tooltip, "Longsword of the Bear");
        score.value = "17";
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        score.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(actor.system.abilities.str.value, 16, "typing 17 as worn did not store 16");
        await actor.update({ "system.abilities.str.value": 15 });
        sheet.changeTab("gear", "primary");
        await settle();
        // The row's inline detail became the inspector card (D-738), and the
        // prose - grants and all - is the same `detailProse` HTML.
        const card = await inspect(sheet, sword.id);
        const prose = card.querySelector(".azeroth-item-grants");
        assert.ok(prose, "the card names no grant");
        assert.include(prose.textContent, "+1 Strength");
      } finally {
        await sheet.close();
      }
      const itemSheet = await openSheet(sword);
      try {
        const grants = [...itemSheet.element.querySelectorAll(".azeroth-item__grant-list li")].map(li => li.textContent.trim());
        assert.deepEqual(grants, ["+1 Strength"], "the item sheet does not list its grants");
      } finally {
        await itemSheet.close();
      }
      await sword.update({ "system.equipped": false });
      await until(() => actor.system.abilities.str.bonus === 0, "the grant off");
    });

    it("of the Prowler worn is an automatic Boon line on a Stealth Test and nothing on Athletics", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Prowler", classes: [["Rogue", 1]] });
      // A worn thing from 08 §11 - the fixture's `gear` is the affix pool, so the item is embedded by hand.
      const [cloak] = await actor.createEmbeddedDocuments("Item", [(await fromPack(PACK_FOR.equipment, "Bedroll")).toObject()]);
      await applyAffixInPlace(cloak, await affixNamed("of the Prowler"));
      await cloak.update({ "system.equipped": true });
      await until(() => (actor.system.skillBoons?.stealth ?? []).length === 1, "the Boon on Stealth");
      const stealth = prepareRoll(actor, { kind: "skill", skill: "stealth", modifiers: [] });
      const line = stealth.situational.automatic.find(l => l.id === "gearBoon");
      assert.ok(line, "no gearBoon line");
      assert.equal(line.boons, 1);
      const athletics = prepareRoll(actor, { kind: "skill", skill: "athletics", modifiers: [] });
      assert.isUndefined(athletics.situational.automatic.find(l => l.id === "gearBoon"));
    });

    it("of Embers worn adds a point of Spellpower to a tier-3 Fire spell's damage and none to a tier-1", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Ember Mage", classes: [["Mage", 9]], spells: ["Ashfall", "Blast Wave"], armor: ["Robes"] });
      const robes = mage.items.find(i => i.name === "Robes");
      await applyAffixInPlace(robes, await affixNamed("of Embers"));
      await robes.update({ "system.equipped": true });
      await until(() => mage.system.spellpower?.fire === 1, "Spellpower in Fire");
      const npc = await makeNpc("Plagued Ghoul");
      const ashfall = mage.items.find(i => i.name === "Ashfall");
      const card = await cardOf("spell", mage, { spell: ashfall, face: 20, args: { targets: [snapshotOf(npc)] } });
      const flags = card.message.flags["azeroth-rpg"];
      assert.equal(flags.damageByTarget[0].damage, ashfall.system.damage.rating + 1, "Spellpower did not raise the tier-3 spell");
      const blast = mage.items.find(i => i.name === "Blast Wave");
      assert.isNotNull(blast.system.damage.rating, "Blast Wave carries no Rating");
      const low = await cardOf("spell", mage, { spell: blast, face: 20, args: { targets: [snapshotOf(npc)] } });
      assert.equal(low.message.flags["azeroth-rpg"].damageByTarget[0].damage, blast.system.damage.rating, "a tier-1 spell is the entry's authority (07 §9)");
    });

    // ---- corruption's rungs (10 §4 to §6) --------------------------------

    it("Fel 10: healing from another is reduced by 2, Vulnerable to Holy, +1 on Fel damage, and the tab prints the rungs", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Fel-marked", classes: [["Warlock", 3]], corruption: { fel: 10 } });
      const s = actor.system;
      assert.equal(s.healingReduction, 2);
      assert.deepEqual(s.vulnerable, ["holy"]);
      assert.equal(s.damageRatingBonus.bySchool.fel, 1);
      assert.equal(s.damageRatingBonus.all, 0);
      const healer = await makeNpc("Plagued Ghoul");
      await actor.update({ "system.health.value": 1 });
      await actor.applyHealing(5, { from: healer });
      assert.equal(actor.system.health.value, 4, "5 from another creature reaches 3 at Fel 10");
      await actor.update({ "system.health.value": 1 });
      await actor.applyHealing(5);
      assert.equal(actor.system.health.value, 6, "a character's own healing is whole");
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("corruption", "primary");
        await settle();
        const rows = sheet.element.querySelectorAll(".azeroth-track.is-fel .azeroth-rung-row");
        assert.lengthOf(rows, 2, "Emberlit and Fel-marked");
        assert.include(rows[0].textContent, "Emberlit");
        assert.include(rows[1].textContent, "Vulnerable (Holy)");
        const findings = checkText(sheet.element.querySelector('section[data-tab="corruption"]'));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
        sheet.changeTab("core", "primary");
        await settle();
        const names = [...sheet.element.querySelectorAll(".azeroth-threshold-row .azeroth-note")].map(n => n.textContent.trim());
        assert.deepEqual(names, ["Emberlit", "Fel-marked"], "the effects partial names the rungs");
      } finally {
        await sheet.close();
      }
    });

    it("Fel 15: no healing from another, +1 on all damage, Blinded refused, and the turn's tick burns 1", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Burning", classes: [["Warrior", 3]], corruption: { fel: 15 }, weapons: ["Longsword"] });
      assert.equal(actor.system.healingReduction, NO_HEALING);
      assert.equal(actor.system.damageRatingBonus.all, 1);
      assert.deepEqual(actor.system.conditionImmunities, ["blinded"]);
      const refused = await actor.toggleStatusEffect("blinded", { active: true });
      assert.equal(refused, false);
      assert.isFalse(actor.statuses.has("blinded"));
      const other = await makeNpc("Plagued Ghoul");
      await actor.update({ "system.health.value": 3 });
      await actor.applyHealing(9, { from: other });
      assert.equal(actor.system.health.value, 3, "healing from another does nothing at all");
      // The sheet's attack door carries the rung's Rating; the card's provenance names it.
      const weapon = actor.items.find(i => i.name === "Longsword");
      await withDialogSkipped(async () => {
        const unpin = pinDie(15);
        try {
          const wait = untilHook("createChatMessage", 5000, m => m.rolls?.length > 0 && m.speaker?.actor === actor.id);
          await attackWithDialog(actor, weapon);
          const [message] = await wait;
          made.push(message);
          assert.include(message.content, game.i18n.localize("AZEROTH.Corruption.DamageBonus"), "the attack's provenance does not name the rung");
        } finally { unpin(); }
      });
      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await actor.update({ "system.health.value": 5 });
        await combat.startCombat();
        await until(() => actor.system.health.value === 4, "the Burning tick");
      } finally {
        await combat.delete();
      }
    });

    it("Undeath 10: Speed down 5, Poisoned refused; Void 10: a Fatigue floor a Long Rest cannot clear", async function () {
      this.timeout(60000);
      const control = await makeCharacter({ name: "ZZ Control", classes: [["Warrior", 1]] });
      const grey = await makeCharacter({ name: "ZZ Grey", classes: [["Warrior", 1]], corruption: { undeath: 10 } });
      assert.equal(grey.system.speed, control.system.speed - 5);
      assert.equal(await grey.toggleStatusEffect("poisoned", { active: true }), false);
      assert.isFalse(grey.statuses.has("poisoned"));
      assert.deepEqual(grey.system.vulnerable, ["holy"]);
      const spoken = await makeCharacter({ name: "ZZ Spoken to", classes: [["Priest", 1]], corruption: { void: 10 } });
      assert.equal(spoken.system.fatigueFloor, 1);
      assert.equal(spoken.system.fatigue, 1, "the floor holds on a fresh sheet");
      await spoken.update({ "system.fatigue": 3 });
      await spoken.longRest();
      assert.equal(spoken.system.fatigue, 2, "a Long Rest takes one");
      await spoken.update({ "system.fatigue": 1 });
      await spoken.longRest();
      assert.equal(spoken.system.fatigue, 1, "and never below the floor");
    });

    it("the rungs' judgement lines reach the dialog: +1 against Fel on a Resilience Test, a Bane by ear on Perception", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Listening", classes: [["Priest", 1]], corruption: { fel: 5, void: 5 } });
      const resilience = prepareRoll(actor, { kind: "resilience", resilience: "spirit", modifiers: [] });
      const fel = resilience.situational.judgement.find(l => l.id === "felResilience");
      assert.ok(fel, "no felResilience line");
      assert.equal(fel.modifier, 1);
      assert.isFalse(fel.checked, "the table's call, unchecked");
      const perception = prepareRoll(actor, { kind: "skill", skill: "perception", modifiers: [] });
      assert.ok(perception.situational.judgement.find(l => l.id === "voidEar"), "no voidEar line on Perception");
      const stealth = prepareRoll(actor, { kind: "skill", skill: "stealth", modifiers: [] });
      assert.isUndefined(stealth.situational.judgement.find(l => l.id === "voidEar"));
    });

    // ---- skills, descriptions, the critical's target ------------------------

    it("a skill row carries its key and 02 §8's sentence on hover, and Describe opens it in a dialog", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Skilled", classes: [["Rogue", 1]] });
      const sheet = await openSheet(actor);
      try {
        const row = sheet.element.querySelector('li.azeroth-skill[data-skill-key="athletics"]');
        assert.ok(row, "no skill row keyed athletics");
        const name = row.querySelector('[data-action="rollSkill"]');
        assert.include(name.dataset.tooltip, "Climbing, swimming", "the hover does not say what Athletics covers");
        const menu = sheet.element.querySelector("li.azeroth-skill");
        assert.ok(menu, "no skill rows");
        const opened = describeSkill("athletics");
        await until(() => document.querySelector(".azeroth-skill-dialog .azeroth-skill-text"), "the skill dialog");
        const dialog = document.querySelector(".azeroth-skill-dialog");
        assert.include(dialog.textContent, "holding a rope");
        const app = foundry.applications.instances.get(dialog.closest(".application")?.id) ?? null;
        await (app?.close?.() ?? Promise.resolve());
        await opened.catch(() => null);
      } finally {
        await sheet.close();
      }
    });

    it("a spell row's detail says what the entry does, and the spell sheet has an Effect section", async function () {
      this.timeout(30000);
      const mage = await makeCharacter({ name: "ZZ Rimeblood", classes: [["Mage", 3]], spells: ["Rimeblood"] });
      const spell = mage.items.find(i => i.name === "Rimeblood");
      const sheet = await openSheet(mage);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        const detail = sheet.element.querySelector(`.azeroth-item-detail[data-item-id="${spell.id}"]`);
        assert.ok(detail, "no detail under the spell row");
        assert.include(detail.querySelector(".azeroth-item-effect")?.textContent ?? "", "Casting Tests gain a Boon", "the row's detail does not say what Rimeblood does");
        assert.include(detail.querySelector(".azeroth-item-lore")?.textContent ?? "", "cold goes inward");
      } finally {
        await sheet.close();
      }
      const itemSheet = await openSheet(spell);
      try {
        const effect = itemSheet.element.querySelector(".azeroth-item__effect");
        assert.ok(effect, "no Effect section on the spell sheet");
        // WHAT THE READER SEES, not what the markup carries. This asserted the
        // `enriched` ATTRIBUTE until 2026-09-06 and so stayed green while every
        // editable sheet printed a blank editor: core reads the enriched HTML
        // off the element's children and ignores that attribute entirely.
        assert.include(effect.textContent, "Casting Tests gain a Boon");
        const editor = effect.querySelector("prose-mirror");
        if (editor) assert.include(editor.querySelector(".editor-content")?.textContent ?? "", "Casting Tests gain a Boon",
          "the editor's toggled view is empty");
      } finally {
        await itemSheet.close();
      }
    });

    it("a natural 20's Critical Injury is rolled for the TARGET, not the attacker", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Crit Attacker", classes: [["Warrior", 3]], weapons: ["Longsword"] });
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("attack", actor, { face: 20, args: { targets: [snapshotOf(npc)] } });
      const button = card.element.querySelector('[data-action="criticalInjury"]');
      assert.ok(button, "no Critical Injury button on a natural 20");
      const wait = untilHook("createChatMessage", 5000, m => m.flags?.["azeroth-rpg"]?.kind === "critical");
      await CARD_ACTIONS.criticalInjury(button, card.message);
      const [critical] = await wait;
      made.push(critical);
      assert.equal(ChatMessage.getSpeakerActor(critical.speaker)?.id, npc.id, "the injury card speaks as the attacker");
    });

    // ---- the turn's budget --------------------------------------------------

    it("in a fight a Half-Action spell, a feature and a move spend the turn's budget, and refuse when it is out", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Budget Mage", classes: [["Mage", 3]], spells: ["Ice Lance"] });
      const spell = mage.items.find(i => i.name === "Ice Lance");
      const combat = await Combat.create({});
      await combat.activate();
      try {
        const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: mage.id }]);
        await combat.startCombat();
        await until(() => combatant.budget.halfActions === 2, "a fresh budget");
        await cardOf("spell", mage, { spell, face: 15, args: { targets: [] } });
        assert.equal(combatant.budget.halfActions, 1, "a Half-Action spell did not spend");
        await combatant.spendMovement({ passed: { distance: mage.system.speed }, history: { distance: 0 } });
        assert.equal(combatant.budget.halfActions, 0, "a Speed's worth of movement is one Move");
        assert.equal(combatant.getFlag("azeroth-rpg", "moveHalves"), 1);
        const pool = mage.system.powers.find(p => p.name === "mana");
        await mage.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
        const before = mage.system.powers.find(p => p.name === "mana").value;
        const refused = await game.system.azeroth.workflows.castSpell({ actor: mage, spell, targets: [] });
        assert.isNull(refused, "a spent budget did not refuse the cast");
        assert.equal(mage.system.powers.find(p => p.name === "mana").value, before, "the refused cast paid Mana");
      } finally {
        await combat.delete();
      }
    });

    // ---- what a weapon's traits do (08 §5) -----------------------------------

    it("a Fast weapon's hit gains a point of Momentum over the hit's own, once a round; Heavy below Strength 13 is a Bane line", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Fast Warrior", classes: [["Warrior", 3]], weapons: ["Dagger", "Amani war-scythe"], abilities: { str: 10 } });
      const dagger = actor.items.find(i => i.name === "Dagger");
      const scythe = actor.items.find(i => i.name === "Amani war-scythe");
      assert.include(dagger.system.traits, "Fast", "the pack's Dagger is not Fast");
      assert.include(scythe.system.traits, "Heavy", "the pack's war-scythe is not Heavy");
      const heavy = prepareRoll(actor, { kind: "attack", heavyBane: true, modifiers: [] });
      assert.ok(heavy.situational.automatic.find(l => l.id === "heavyWeapon"), "no Heavy line on the attack");
      const combat = await Combat.create({});
      await combat.activate();
      try {
        const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await combat.startCombat();
        await until(() => combatant.budget.halfActions === 2, "a fresh budget");
        const rage = () => actor.poolSnapshot().find(p => p.name === "rage").value;
        assert.equal(rage(), 0, "a fight opens at 0 Rage");
        await withDialogSkipped(async () => {
          const unpin = pinDie(15);
          try {
            const wait = untilHook("createChatMessage", 5000, m => m.rolls?.length > 0 && m.speaker?.actor === actor.id);
            await attackWithDialog(actor, dagger, null, { budget: "half" });
            const [message] = await wait;
            made.push(message);
            assert.equal(rage(), 2, "a hit is 1 Rage and Fast is 1 more");
            assert.include(message.content, game.i18n.localize("AZEROTH.Card.FastMomentum"), "the card's provenance does not name Fast");
            // Extra Attack is level 5: the second swing this round is the off hand, exempt from the limit (D-409); Fast has been had.
            const wait2 = untilHook("createChatMessage", 5000, m => m.rolls?.length > 0 && m.speaker?.actor === actor.id);
            await attackWithDialog(actor, dagger, null, { offHand: true });
            const [second] = await wait2;
            made.push(second);
            assert.equal(rage(), 2, "the off hand builds none, and Fast is once a round");
          } finally { unpin(); }
        });
      } finally {
        await combat.delete();
      }
    });

    it("Bleed fires at SL 2 with a Bleeding 1 button for the target; Nick adds its point at SL 1; nothing fires on a bare hit", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Bleeder", classes: [["Warrior", 3]], weapons: ["Amani hatchet", "Bardiche"], abilities: { str: 16 } });
      const hatchet = actor.items.find(i => i.name === "Amani hatchet");
      const bardiche = actor.items.find(i => i.name === "Bardiche");
      assert.include(hatchet.system.traits, "Bleed");
      assert.include(bardiche.system.traits, "Nick");
      const npc = await makeNpc("Plagued Ghoul");
      const w = game.system.azeroth.workflows;
      const { weaponTraitEffects } = await import("../rules/weapon-traits.mjs");
      const cardWith = async (weapon, face) => {
        const unpin = pinDie(face);
        try {
          const wait = untilHook("createChatMessage", 5000, m => m.rolls?.length > 0 && m.speaker?.actor === actor.id);
          await w.rollTest({ actor, kind: "attack", dc: 10, title: weapon.name, modifiers: [{ label: "AZEROTH.Sheet.Proficiency", value: 2 }],
            damage: { rating: weapon.system.rating, kind: "physical" }, targets: [snapshotOf(npc)],
            weaponEffects: weaponTraitEffects(weapon.system.traits, { strength: 16 }) });
          const [message] = await wait;
          made.push(message);
          const div = document.createElement("div");
          div.innerHTML = message.content;
          return { message, element: div };
        } finally { unpin(); }
      };
      // d20 20 with +2 against DC 10: SL 2, a critical.
      const bleed = await cardWith(hatchet, 20);
      const button = bleed.element.querySelector('[data-action="applyCondition"][data-condition="bleeding"]');
      assert.ok(button, "no Bleeding button at SL 2");
      assert.equal(button.dataset.value, "1");
      // d20 10 with +2: total 12, SL 0 - a bare hit fires nothing.
      const bare = await cardWith(hatchet, 10);
      assert.isNull(bare.element.querySelector('[data-action="applyCondition"]'), "Bleed fired on a bare hit");
      // Nick at SL 1: d20 15 + 2 = 17, SL 1, one more damage than the Rating.
      const nick = await cardWith(bardiche, 15);
      assert.equal(nick.message.flags["azeroth-rpg"].damageByTarget[0].damage, bardiche.system.rating + 1 + 1, "Nick's point is not on the damage (Rating + SL 1 + Nick)");
    });

    // ---- a feature pays; a creature's pools -------------------------------------

    it("Sic 'Em's Use pays 2 Focus (the lead, 2026-09-06)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Sic Ranger", classes: [["Ranger", 5]] });
      await until(() => actor.items.some(i => i.type === "talent" && i.name === "Sic 'Em"), "the class's talents", 15000);
      await actor.items.find(i => i.type === "talent" && i.name === "Sic 'Em").update({ "system.taken": 1 });
      await until(() => actor.items.some(i => i.type === "feature" && i.name === "Sic 'Em"), "the granted feature", 10000);
      const feature = actor.items.find(i => i.type === "feature" && i.name === "Sic 'Em");
      const focus = () => actor.poolSnapshot().find(p => p.name === "focus");
      await actor.updatePool({ itemId: focus().itemId, kind: "power", value: focus().max });
      assert.equal(focus().value, 6, "Focus is not full");
      const message = await game.system.azeroth.workflows.useFeature({ actor, item: feature, targets: [] });
      if (message) made.push(message);
      assert.equal(focus().value, 4, "Sic 'Em did not pay its 2 Focus");
    });

    it("a creature's hit gains Momentum in a fight, its sheet lists the maneuvers, and Use spends its pool", async function () {
      this.timeout(90000);
      // 14's blocks print an em-dash for Momentum; the pool is given here, as a GM's creature might carry one.
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.momentum.max": 10, "system.momentum.value": 0 });
      assert.ok(npc.system.attacks?.length, "the Ghoul has no attack");
      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: npc.id }]);
        await combat.startCombat();
        await settle();
        await withDialogSkipped(async () => {
          const unpin = pinDie(19);
          try {
            const wait = untilHook("createChatMessage", 5000, m => m.rolls?.length > 0 && m.speaker?.actor === npc.id);
            await npcAttackWithDialog(npc, 0, null, { targets: [] });
            await wait;
          } finally { unpin(); }
        });
        assert.isAbove(npc.system.momentum.value, 0, "the creature's hit built no Momentum");
        const sheet = await openSheet(npc);
        try {
          const rows = sheet.element.querySelectorAll(".azeroth-maneuvers .azeroth-maneuver");
          assert.isAbove(rows.length, 3, "the creature's sheet lists no maneuvers");
          const before = npc.system.momentum.value;
          await npc.update({ "system.momentum.value": npc.system.momentum.max });
          await settle();
          const use = sheet.element.querySelector('.azeroth-maneuvers [data-action="useManeuver"][data-maneuver="overbear"]');
          assert.ok(use, "no Use on Overbear");
          assert.isFalse(use.disabled, "Overbear is greyed with a full pool");
          const wait = untilHook("updateActor", 5000, a => a.id === npc.id);
          use.click();
          await wait;
          assert.isBelow(npc.system.momentum.value, npc.system.momentum.max, "the maneuver spent nothing");
          void before;
        } finally {
          await sheet.close();
        }
      } finally {
        await combat.delete();
      }
    });

    // ---- The Party ----------------------------------------------------------

    it("a character marked as The Party is friendly in a fight and Add The Party puts it in", async function () {
      this.timeout(60000);
      const hero = await makeCharacter({ name: "ZZ Party Hero", classes: [["Warrior", 1]] });
      await hero.setParty(true);
      assert.isTrue(hero.isParty);
      const combat = await Combat.create({});
      await combat.activate();
      try {
        const added = await combat.addParty();
        assert.ok(added.some(c => c.actorId === hero.id), "Add The Party did not add the marked character");
        const combatant = combat.combatants.find(c => c.actorId === hero.id);
        assert.equal(combatant.side, "friendly", "a party member is on the party's side without a token");
        const again = await combat.addParty();
        assert.lengthOf(again, 0, "a member already in is not added twice");
      } finally {
        await combat.delete();
        await hero.setParty(false);
        assert.isFalse(hero.isParty);
      }
    });
  });

  // ---- Hiding (D-717) -----------------------------------------------------

  describe("Hide, and what gives you away (D-717)", function () {
    // **`cleanup` NEEDS A LONG TIMEOUT** and its own docblock says so: a hook
    // takes mocha's 2000 ms default, and this one deletes a dozen actors, each
    // waiting on the talent grant its class started. It timed out under load
    // and reported as a failing suite with every test in it green.
    after(async function () { this.timeout(180000); await cleanup(); });

    it("a made Stealth Test hides the character, an attack reveals them, and a second Hide in the round is refused", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({
        name: "ZZ Hiding Rogue", classes: [["Rogue", 3]], weapons: ["Dagger"], skillRanks: { stealth: 3 }
      });
      const combat = await Combat.create({});
      await combat.activate();
      try {
        const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await combat.startCombat();
        await until(() => combatant.budget.halfActions === 2, "a fresh budget");

        await withDialogSkipped(async () => {
          const unpin = pinDie(20);
          try {
            const card = await hide(actor);
            assert.ok(card, "Hide rolled nothing");
            made.push(card);
            assert.equal(card.rolls[0].options.dc, game.system.azeroth.config.OPPOSED_DC, "the Hide did not roll against 05 §5's DC");
            await until(() => actor.statuses.has("invisible"), "the invisible status", 8000);
            assert.isTrue(actor.getFlag("azeroth-rpg", "hidden"), "the Hide left no mark of its own");
            assert.isTrue(combatant.getFlag("azeroth-rpg", "round")?.stealth, "the round was not marked");
            // **IT SPENDS NOTHING** (D-717): the button sits beside Guard and
            // costs no Half-Action, which is the only thing the round bounds.
            assert.equal(combatant.budget.halfActions, 2, "a Hide spent a Half-Action");

            // A second one in the same round is refused, in words.
            const refused = await noticesFrom(() => hide(actor));
            assert.isNull(refused.result, "a second Hide in the round rolled anyway");
            assert.deepEqual(refused.warned, [game.i18n.localize("AZEROTH.Combat.StealthThisRound")],
              `the refusal was not said: ${refused.warned.join(" | ")}`);

            // And the blow gives you away.
            const struck = await attackWithDialog(actor, actor.items.find(i => i.name === "Dagger"));
            assert.ok(struck, "the attack was refused");
            made.push(struck);
            await until(() => !actor.statuses.has("invisible"), "the attack to reveal the rogue", 8000);
            assert.isUndefined(actor.getFlag("azeroth-rpg", "hidden"), "the mark outlived the reveal");
          } finally {
            unpin();
          }
        });
      } finally {
        await combat.delete();
      }
    });

    it("a GM's own invisibility is not a Hide, and an attack leaves it alone", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Wraith", classes: [["Warrior", 3]], weapons: ["Dagger"] });
      await actor.toggleStatusEffect("invisible", { active: true });
      await until(() => actor.statuses.has("invisible"), "the hand-toggled status");
      assert.isUndefined(actor.getFlag("azeroth-rpg", "hidden"), "a hand toggle wrote the system's own mark");
      await withDialogSkipped(async () => {
        const unpin = pinDie(15);
        try {
          const card = await attackWithDialog(actor, actor.items.find(i => i.name === "Dagger"));
          assert.ok(card, "the attack was refused");
          made.push(card);
        } finally {
          unpin();
        }
      });
      await settle();
      assert.isTrue(actor.statuses.has("invisible"), "the attack stripped a GM's own invisibility");
      // The chip's x clears it either way, because the chip is drawn off the status.
      await clearHidden(actor);
      await until(() => !actor.statuses.has("invisible"), "the chip's x to clear it", 8000);
    });
  });

  // ---- the drag itself is bounded (05 §10, D-718) -------------------------

  describe("A drag past what the turn pays for (05 §10, D-718)", function () {
    let scene = null;
    let wasViewing = null;
    let wasLimited = null;
    before(async function () {
      this.timeout(120000);
      // The scene this batch was found on, so it is handed back at the end:
      // deleting a VIEWED scene tears the canvas down and leaves the world
      // with none (the distance batch learned this, 2026-09-06). ONE scene for
      // the three tests, for the same reason.
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      wasLimited = game.settings.get("azeroth-rpg", MOVEMENT_LIMIT_SETTING);
      scene = await Scene.create({
        name: "ZZ Movement Scene", width: 6000, height: 2000,
        grid: { size: 100, distance: 5, units: "ft" }
      });
      made.push(scene);
      await scene.view();
      await settle();
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, wasLimited);
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    it("refuses a drag of a hundred feet on a Speed 30 turn, leaves the token where it was, and says why", async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
      const actor = await makeCharacter({ name: "ZZ Drag Walker", classes: [["Warrior", 3]] });
      assert.equal(actor.system.speed, 30, "the fixture's Speed is not 30");
      const { token, combat } = await fightOnAScene(scene, actor, { y: 500 });
      try {
        const watch = notice();
        try {
          // A hundred feet at five feet a square: twenty squares east.
          const moved = await token.move({ x: 500 + 20 * 100, y: 500 });
          assert.isFalse(moved, "a hundred feet was allowed on two Half-Actions");
          // D-669: a token's document position is interpolated while it
          // travels, so the assertion is polled rather than read once.
          await until(() => token.x === 500, "the token to stay where it was", 4000);
          assert.lengthOf(watch.warns, 1, "the refusal said nothing");
          assert.include(watch.warns[0], "60", "the refusal does not say what the turn pays for");
        } finally {
          watch.done();
        }

        // Sixty feet is exactly what two Half-Actions buy, and it lands.
        const near = await token.move({ x: 500 + 12 * 100, y: 500 });
        assert.isTrue(near, "sixty feet was refused on two Half-Actions");
        await until(() => token.x === 500 + 12 * 100, "the legal move to land", 8000);
      } finally {
        await endMovementFight(token, combat);
      }
    });

    it("the world setting turns the limit off and the same drag lands", async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, false);
      const actor = await makeCharacter({ name: "ZZ Drag Free", classes: [["Warrior", 3]] });
      const { token, combat } = await fightOnAScene(scene, actor, { y: 800 });
      try {
        const moved = await token.move({ x: 500 + 20 * 100, y: 800 });
        assert.isTrue(moved, "the setting did not turn the limit off");
        await until(() => token.x === 500 + 20 * 100, "the unlimited move to land", 10000);
      } finally {
        await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
        await endMovementFight(token, combat);
      }
    });

    it("a flying pace carries the flying distance, and only with the fly action", async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", MOVEMENT_LIMIT_SETTING, true);
      const actor = await makeCharacter({ name: "ZZ Drag Flier", classes: [["Warrior", 3]] });
      await actor.update({ "system.flyingSpeed": 120 });
      assert.equal(actor.system.flyingSpeed, 120, "the flying pace did not store");
      const { token, combat } = await fightOnAScene(scene, actor, { y: 1100 });
      try {
        const watch = notice();
        try {
          // A hundred feet on foot is still refused: the ground pace is 30.
          assert.isFalse(await token.move({ x: 500 + 20 * 100, y: 1100 }), "a hundred feet on foot was allowed");
          await until(() => token.x === 500, "the walker to stay put", 4000);
          assert.lengthOf(watch.warns, 1, "the refusal said nothing");
        } finally {
          watch.done();
        }
        // The same hundred feet with wings is well inside 240.
        const flew = await token.move({ x: 500 + 20 * 100, y: 1100, action: "fly" });
        assert.isTrue(flew, "a hundred feet of flight was refused at a flying pace of 120");
        await until(() => token.x === 500 + 20 * 100, "the flight to land", 10000);
      } finally {
        await endMovementFight(token, combat);
      }
    });
  });
}

/* ------------------------------------------------------------------------ */

export function spellEffectBatch(context) {
  const { describe, it, assert, after } = context;

  describe("What a spell's card can lay (2026-09-06)", function () {
    // **`cleanup` NEEDS A LONG TIMEOUT** and its own docblock says so: a hook
    // takes mocha's 2000 ms default, and this one deletes a dozen actors, each
    // waiting on the talent grant its class started. It timed out under load
    // and reported as a failing suite with every test in it green.
    after(async function () { this.timeout(180000); await cleanup(); });

    it("Ice Lance: the rider's Rating against a Slowed target on the card, and a button for one the table knows is", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Lance Mage", classes: [["Mage", 3]], spells: ["Ice Lance"] });
      const spell = mage.items.find(i => i.name === "Ice Lance");
      assert.deepEqual(spell.system.rider.statuses, ["slowed", "entangled", "prone"], "the pack carries no rider");
      const npc = await makeNpc("Plagued Ghoul");
      const plain = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      assert.equal(plain.message.flags["azeroth-rpg"].damageByTarget[0].damage, 1, "the base Rating against an unhindered target");
      const button = plain.element.querySelector('[data-action="applyDamage"][data-rider]');
      assert.ok(button, "no rider button for the table's call");
      assert.equal(Number(button.dataset.damage), 5, "the rider's Rating is 5 instead");
      const slowed = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc, ["slowed"])] } });
      assert.equal(slowed.message.flags["azeroth-rpg"].damageByTarget[0].damage, 5, "a Slowed target takes the rider's Rating without a click");
      assert.isNull(slowed.element.querySelector('[data-action="applyDamage"][data-rider]'), "no button where the rider already applied");
      assert.include(slowed.element.querySelector(".azeroth-damage em")?.textContent ?? "", "Slowed");
    });

    it("Slow: the target's own Resist row lands Slowed on a failure and records it, and a re-roll replaces the record (D-726)", async function () {
      this.timeout(90000);
      const mage = await makeCharacter({ name: "ZZ Slow Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      assert.deepEqual(spell.system.onFail, { resilience: "spirit", statuses: ["slowed"] });
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });

      // One row, the target's, carrying its own index; no loose button beside it.
      const rows = [...card.element.querySelectorAll("[data-resist-owner]")];
      assert.lengthOf(rows, 1, "the card did not draw one Resist row for its one target");
      assert.equal(rows[0].dataset.resistOwner, npc.uuid, "the row does not name the creature it belongs to");
      const button = rows[0].querySelector('[data-action="resistTest"]');
      assert.ok(button, "the row carries no Resist Test button");
      assert.equal(button.dataset.purpose, "spell");
      assert.equal(button.dataset.targetIndex, "0");
      assert.include(button.textContent, npc.name, "the row does not say whose Test it is");
      assert.isNull(card.element.querySelector('[data-action="resistTest"]:not([data-target-index])'), "a loose Resist button stood beside the row");

      // **THE ROW ROLLS FOR ITS OWN TARGET, WHATEVER IS SELECTED.** Nothing is
      // selected here, and the Test is still the Ghoul's.
      canvas?.tokens?.releaseAll?.();
      try {
        const failed = await pressResist(button, card.message, 1);
        await until(() => npc.statuses.has("slowed"), "Slowed on a failure");
        const record = await recordOn(card.message, npc.id);
        assert.isFalse(record.success, "a failed Test recorded a success");
        assert.equal(record.index, 0, "the record does not name the row it answers");
        assert.equal(record.count, 1);
        assert.equal(record.actorId, npc.id);
        assert.isNull(record.tokenId, "a row with no token recorded one");
        assert.equal(record.name, npc.name);
        assert.equal(record.userId, game.user.id);

        // The Resilience card links back to the row it answered, with the cast.
        assert.ok(failed, "the Test posted no Resilience card");
        assert.equal(record.resultId, failed.id, "the record was not built from the Test's own card");
        assert.equal(record.total, failed.rolls[0].total, "the record's total is not the roll's");
        assert.equal(record.dc, failed.rolls[0].options.dc);
        const link = failed.flags["azeroth-rpg"].resistOf;
        assert.ok(link, "the Resilience card does not say which card's row it answered");
        assert.equal(link.messageId, card.message.id);
        assert.equal(link.index, 0);
        assert.equal(link.key, npc.id);
        assert.equal(link.identifier, "slow");
        assert.equal(link.cast, card.message.flags["azeroth-rpg"].cast, "the Test does not carry the card's cast");

        // And the card says it in words, for every reader.
        const said = game.i18n.format("AZEROTH.Card.ResistOutcome", {
          name: npc.name, outcome: game.i18n.localize("AZEROTH.Roll.Outcome.Failure"), total: record.total, dc: record.dc
        });
        const lines = [...renderedAs(card.message).querySelectorAll(".azeroth-card-resisted")].map(p => p.textContent.replace(/\s+/g, " ").trim());
        assert.lengthOf(lines, 1, "the card does not print the recorded Test");
        assert.include(lines[0], said);

        // A re-roll is the result the table accepts: the record flips and counts two.
        await npc.toggleStatusEffect("slowed", { active: false });
        const passed = await pressResist(button, card.message, 20);
        const again = await recordOn(card.message, npc.id, r => r?.count === 2);
        assert.isTrue(again.success, "the re-roll's success did not replace the failure");
        assert.equal(again.resultId, passed?.id, "the record kept the first Test");
        await settle();
        assert.isFalse(npc.statuses.has("slowed"), "a success landed the condition");
      } finally {
        canvas?.tokens?.releaseAll?.();
      }
    });

    it("Slow with no target recorded: the one button reaches the user's character and records under its key (D-726)", async function () {
      this.timeout(90000);
      const mage = await makeCharacter({ name: "ZZ Loose Slow Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [] } });
      assert.isNull(card.element.querySelector("[data-resist-owner]"), "a card with no target drew a row");
      const button = card.element.querySelector('[data-action="resistTest"]');
      assert.ok(button, "no Resist Test button");
      assert.equal(button.dataset.purpose, "spell");
      assert.isUndefined(button.dataset.targetIndex);
      // The button reaches the user's own character where no token is controlled.
      const user = game.user;
      const hadCharacter = user.character?.id ?? null;
      await user.update({ character: npc.id });
      // **IMPERSONATING SOMEBODY CYCLES THE TOKENS** (verified at 14.367:
      // `User#_onUpdate` runs `canvas.tokens.cycleTokens(true, true)` whenever
      // your own `character` changes, and with nothing controlled and no token
      // of your own on the scene that CONTROLS the first token standing there).
      // A card's Resist button rolls for the controlled tokens BEFORE it falls
      // back to the user's character, so the Test was being made by whatever
      // happened to be on the viewed scene - and this test then waited five
      // seconds for a condition that had landed on somebody else. It passed
      // only while the canvas happened to be empty when it ran, which is the
      // worst kind of green.
      canvas?.tokens?.releaseAll?.();
      try {
        await pressResist(button, card.message, 1);
        await until(() => npc.statuses.has("slowed"), "Slowed on a failure");
        const record = await recordOn(card.message, npc.id);
        assert.isFalse(record.success);
        assert.isNull(record.index, "a Test from no row recorded a row");
        assert.equal(record.actorId, npc.id);
      } finally {
        await user.update({ character: hadCharacter });
        // And again on the way out, for the same reason: a token left
        // controlled here would answer the NEXT batch's card.
        canvas?.tokens?.releaseAll?.();
      }
    });

    it("Hex: a row press records the failure and lands nothing, since the entry names no condition (D-726)", async function () {
      this.timeout(90000);
      const shaman = await makeCharacter({ name: "ZZ Hex Shaman", classes: [["Shaman", 3]], spells: ["Hex"] });
      const spell = shaman.items.find(i => i.name === "Hex");
      assert.equal(spell.system.test.resilience, "spirit", "Hex names no Resilience Test in the pack");
      assert.deepEqual(spell.system.onFail.statuses, [], "Hex names a condition to land");
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("spell", shaman, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      const button = card.element.querySelector('[data-resist-owner] [data-action="resistTest"][data-target-index="0"]');
      assert.ok(button, "Hex's card drew no Resist row for its target");
      assert.equal(button.dataset.purpose, "spell", "a row without the spell's purpose would record nothing");
      const statuses = [...npc.statuses].sort();
      const effects = npc.effects.size;
      canvas?.tokens?.releaseAll?.();
      await pressResist(button, card.message, 1);
      const record = await recordOn(card.message, npc.id);
      assert.isFalse(record.success, "a failed Hex Test recorded a success");
      assert.equal(record.index, 0);
      await settle();
      assert.deepEqual([...npc.statuses].sort(), statuses, "a failed Hex Test landed a condition the entry never names");
      assert.equal(npc.effects.size, effects, "a failed Hex Test laid an effect");
    });

    it("REFUSES A RESIST RECORD FROM SOMEBODY WHO DID NOT MAKE THE TEST, and takes nothing from the payload but two ids (D-726)", async function () {
      this.timeout(120000);
      // The record is written on the GM's client with ids a player sent, and
      // core checks only `QUERY_USER` - so the handler checks authorship and
      // ownership itself, and builds the record from the Resilience card.
      const mage = await makeCharacter({ name: "ZZ Forge Slow Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      canvas?.tokens?.releaseAll?.();
      const result = await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="0"]'), card.message, 1);
      assert.ok(result, "the Test posted no Resilience card");
      // A copy: the flag is a live object, and comparing it with itself proves nothing.
      const record = foundry.utils.deepClone(await recordOn(card.message, npc.id));

      const stranger = await User.create({ name: "ZZ Quench Resist Stranger", role: CONST.USER_ROLES.PLAYER });
      try {
        // 1. A stranger naming the real Test: refused in words, nothing moved.
        let refused = null;
        try {
          await annotateQueryHandler({ kind: "resist", messageId: card.message.id, resultId: result.id }, { user: stranger });
        } catch (err) { refused = err; }
        assert.ok(refused, "a user who made no Test recorded one");
        assert.equal(refused.message, game.i18n.localize("AZEROTH.Card.NotYours"));
        assert.deepEqual(card.message.getFlag("azeroth-rpg", "resists")[npc.id], record, "the stranger's call moved the record");

        // 1a. Making the Test is not enough: the creature has to be theirs. A
        // copy of the real Resilience card, authored by the stranger, names a
        // Ghoul the stranger does not own, so only the ownership refuses.
        const copied = result.toObject();
        delete copied._id;
        const theirCopy = await ChatMessage.create({ ...copied, author: stranger.id });
        made.push(theirCopy);
        let notOwned = null;
        try {
          await annotateQueryHandler({ kind: "resist", messageId: card.message.id, resultId: theirCopy.id }, { user: stranger });
        } catch (err) { notOwned = err; }
        assert.ok(notOwned, "a user who does not own the creature recorded its Test");
        assert.equal(notOwned.message, game.i18n.localize("AZEROTH.Card.NotYours"));
        assert.deepEqual(card.message.getFlag("azeroth-rpg", "resists")[npc.id], record, "a Test on somebody else's creature moved the record");

        // 1b. Owning the creature is not enough: the Test has to be theirs too.
        // With the Ghoul given to the stranger, only the authorship refuses.
        await npc.update({ ownership: { ...(npc.ownership ?? {}), [stranger.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
        let notTheirs = null;
        try {
          await annotateQueryHandler({ kind: "resist", messageId: card.message.id, resultId: result.id }, { user: stranger });
        } catch (err) { notTheirs = err; }
        assert.ok(notTheirs, "the creature's owner recorded a Test somebody else made");
        assert.deepEqual(card.message.getFlag("azeroth-rpg", "resists")[npc.id], record, "the owner's call on another's Test moved the record");

        // 2. The Test's own maker, with every other key forged: the record is the roll's.
        const forged = await annotateQueryHandler({
          kind: "resist", messageId: card.message.id, resultId: result.id,
          success: true, total: 99, dc: 1, sl: 6, key: "Forged0000000001", index: 7, name: "Forged", count: 40
        }, { user: game.user });
        assert.isFalse(forged.success, "the payload's success was taken on trust");
        assert.equal(forged.total, result.rolls[0].total, "the payload's total was taken on trust");
        assert.equal(forged.index, 0, "the payload's row was taken on trust");
        assert.equal(forged.key, npc.id);
        assert.equal(forged.name, npc.name);
        assert.equal(forged.count, 1, "one Test recorded twice counted as two");
        assert.notProperty(card.message.getFlag("azeroth-rpg", "resists"), "Forged0000000001", "a forged key reached the card");

        // 3. A Test made from one card is nobody's record on another.
        const other = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
        let unlinked = null;
        try {
          await annotateQueryHandler({ kind: "resist", messageId: other.message.id, resultId: result.id }, { user: game.user });
        } catch (err) { unlinked = err; }
        assert.ok(unlinked, "a Test made from one card was recorded on another");
        assert.equal(unlinked.message, game.i18n.localize("AZEROTH.Card.ResistUnlinked"));
        assert.isUndefined(other.message.getFlag("azeroth-rpg", "resists"), "the other card holds a record");
      } finally {
        await stranger.delete().catch(() => {});
      }
    });

    it("A ROW WHOSE TOKEN HAS GONE ROLLS FOR NOBODY, and never for the actor its siblings share (D-726)", async function () {
      this.timeout(180000);
      // Three unlinked Ghouls are ONE world actor and three creatures. A row
      // resolved by `targetActorOf` falls back to that actor when its token has
      // gone, so the dead Ghoul's row would roll on the world Ghoul and land
      // Slowed on every Ghoul off it. The row names nobody instead.
      const mage = await makeCharacter({ name: "ZZ Gone Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "prototypeToken.actorLink": false });
      const wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      const scene = await Scene.create({
        name: "ZZ Gone Row Scene", width: 2000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      try {
        await withoutScrollingText(async () => {
          await scene.view();
          await until(() => canvas.ready && canvas.scene?.id === scene.id, "the gone-row scene on the board", 15000);
          const data = (await npc.getTokenDocument({ x: 600, y: 600 })).toObject();
          const [doomed, survivor] = await scene.createEmbeddedDocuments("Token", [data, { ...data, x: 900 }]);
          assert.isFalse(doomed.actorLink, "the tokens are linked, so they are not siblings off one actor");
          assert.equal(doomed.actor.id, survivor.actor.id, "two unlinked tokens off one actor do not share its id");
          const rowFor = t => ({ ...snapshotOf(npc), sceneId: scene.id, tokenId: t.id });
          const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [rowFor(doomed), rowFor(survivor)] } });
          canvas?.tokens?.releaseAll?.();

          // The creature dies and its token is taken off the board.
          await doomed.delete();
          await until(() => !scene.tokens.get(doomed.id), "the doomed token off the board");
          await settle();
          const before = [...npc.statuses].sort();

          const button = card.element.querySelector('[data-action="resistTest"][data-target-index="0"]');
          assert.ok(button, "the card drew no row for the target that has gone");
          const { result, warned } = await noticesFrom(() => pressResist(button, card.message, 1));
          assert.isNull(result, "a row whose token has gone posted a Resilience card");
          assert.include(warned, game.i18n.localize("AZEROTH.Card.TargetGone"), `the press said ${JSON.stringify(warned)}`);
          await settle();
          assert.isUndefined(card.message.getFlag("azeroth-rpg", "resists"), "a row whose token has gone recorded a Test");
          assert.deepEqual([...npc.statuses].sort(), before, "the dead row's Test landed a condition on the actor its siblings share");
          assert.notInclude([...survivor.actor.statuses], "slowed", "the dead row's Test landed Slowed on another Ghoul");

          // And the row that still has its token answers exactly as it did.
          const alive = card.element.querySelector('[data-action="resistTest"][data-target-index="1"]');
          await pressResist(alive, card.message, 1);
          const record = await recordOn(card.message, survivor.id);
          assert.equal(record.tokenId, survivor.id, "the living row recorded under another key");
          assert.equal(record.index, 1);
        });
      } finally {
        await wasViewing?.view().catch(() => {});
        await scene.delete().catch(() => {});
        canvas?.tokens?.releaseAll?.();
      }
    });

    it("REFUSES A RECORD FOR A CREATURE THE CARD NEVER NAMED, however the asker's own card links it (D-726)", async function () {
      this.timeout(120000);
      // The asker authors the Resilience card, so its `resistOf` is theirs to
      // compose. With `index: null` and a creature no row names, the write used
      // to fall through to the link's own creature and print *Bob: Success* on
      // a Fireball aimed at somebody else.
      const mage = await makeCharacter({ name: "ZZ Stray Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const npc = await makeNpc("Plagued Ghoul");
      const bystander = await makeCharacter({ name: "ZZ Stray Bystander", classes: [["Warrior", 3]] });
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      canvas?.tokens?.releaseAll?.();
      const real = await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="0"]'), card.message, 20);
      assert.ok(real, "the Test posted no Resilience card");
      const record = foundry.utils.deepClone(await recordOn(card.message, npc.id));
      // **WHEN IT WAS ROLLED IS THE SERVER'S** (D-726): `timestamp` is supplied
      // by the creating client, so a forged one would freeze this record
      // against every later Test. `_stats.modifiedTime` is managed by the
      // server and ignored in creation data.
      assert.equal(record.at, real._stats?.modifiedTime, "the record's time is not the server's own");

      // A Resilience card of the bystander's own, linked to THIS card, naming a
      // creature the card never targeted and no row at all.
      const copied = real.toObject();
      delete copied._id;
      const stray = await ChatMessage.create({
        ...copied,
        speaker: ChatMessage.getSpeaker({ actor: bystander }),
        flags: {
          ...copied.flags,
          "azeroth-rpg": {
            ...copied.flags["azeroth-rpg"],
            resistOf: {
              messageId: card.message.id, key: bystander.id, index: null, sceneId: null,
              tokenId: null, actorId: bystander.id, spellUuid: null, identifier: null, cast: null
            }
          }
        }
      });
      made.push(stray);
      assert.equal(ChatMessage.getSpeakerActor(stray.speaker)?.id, bystander.id, "the stray card does not speak for the bystander");
      assert.equal(stray.author?.id, game.user.id, "the stray card is not the asker's own");
      assert.isTrue(bystander.testUserPermission(game.user, "OWNER"), "the asker does not own the bystander");

      let refused = null;
      try {
        await annotateQueryHandler({ kind: "resist", messageId: card.message.id, resultId: stray.id }, { user: game.user });
      } catch (err) { refused = err; }
      assert.ok(refused, "a creature the card never named recorded a Test on it");
      assert.equal(refused.message, game.i18n.localize("AZEROTH.Card.ResistUnlinked"));
      await settle();
      assert.hasAllKeys(card.message.getFlag("azeroth-rpg", "resists"), [npc.id], "a stray record reached the card");
      assert.deepEqual(card.message.getFlag("azeroth-rpg", "resists")[npc.id], record, "the stray call moved the real record");
      assert.equal(renderedAs(card.message).querySelectorAll(".azeroth-card-resisted").length, 1, "the card says two Tests were made");
    });

    it("says nothing about a target the GM has hidden, and everything about one in plain sight (D-726)", async function () {
      this.timeout(180000);
      const mage = await makeCharacter({ name: "ZZ Hidden Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const seen = await makeNpc("Plagued Ghoul");
      const lurker = await makeNpc("Plagued Ghoul");
      await lurker.update({ name: "ZZ Hidden Ambusher" });
      const wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      const scene = await Scene.create({
        name: "ZZ Hidden Target Scene", width: 2000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      try {
        await withoutScrollingText(async () => {
          await scene.view();
          await until(() => canvas.ready && canvas.scene?.id === scene.id, "the hidden-target scene on the board", 15000);
          const place = async (actor, x, hidden) => {
            const data = (await actor.getTokenDocument({ x, y: 600, hidden })).toObject();
            const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
            return doc;
          };
          const open = await place(seen, 600, false);
          const hid = await place(lurker, 900, true);
          assert.isTrue(hid.hidden, "the ambusher's token is not hidden");
          const rowFor = (npc, t) => ({ ...snapshotOf(npc), sceneId: scene.id, tokenId: t.id });
          const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [rowFor(seen, open), rowFor(lurker, hid)] } });
          canvas?.tokens?.releaseAll?.();
          await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="0"]'), card.message, 1);
          await recordOn(card.message, open.id);
          await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="1"]'), card.message, 1);
          await recordOn(card.message, hid.id);

          const said = box => [...box.querySelectorAll(".azeroth-card-resisted")].map(el => el.textContent);
          // The GM reads both, the hidden one included.
          const asGM = said(renderedAs(card.message));
          assert.lengthOf(asGM, 2, `the GM was shown ${JSON.stringify(asGM)}`);
          assert.isTrue(asGM.some(t => t.includes(lurker.name)), "the GM is not told what the hidden target rolled");
          // A player reads the one they can see, and is told nothing of the
          // other - not its name, and not the Spell DC it was tested against.
          const asPlayer = said(renderedAs(card.message, { asPlayer: true }));
          assert.lengthOf(asPlayer, 1, `a player was shown ${JSON.stringify(asPlayer)}`);
          assert.include(asPlayer[0], seen.name, "the visible target's result was dropped too");
          assert.isFalse(asPlayer.some(t => t.includes(lurker.name)), "a hidden target was named to a player");

          // And revealing it says so, with no new Test: the line is read off
          // the token every time the card is drawn.
          await hid.update({ hidden: false });
          await settle();
          assert.lengthOf(said(renderedAs(card.message, { asPlayer: true })), 2, "a revealed target's result stayed hidden");
        });
      } finally {
        await wasViewing?.view().catch(() => {});
        await scene.delete().catch(() => {});
        canvas?.tokens?.releaseAll?.();
      }
    });

    it("shows a Resist row to its creature's owner and the GM alone, and every recorded Test to everybody (D-726)", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ Rows Mage", classes: [["Mage", 3]], spells: ["Slow"] });
      const spell = mage.items.find(i => i.name === "Slow");
      const mine = await makeNpc("Plagued Ghoul");
      const theirs = await makeNpc("Plagued Ghoul");
      await theirs.update({ name: "ZZ Plagued Ghoul Two" });
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(mine), snapshotOf(theirs)] } });
      canvas?.tokens?.releaseAll?.();
      // Both targets answer, one after the other, and each lands its OWN key:
      // the second write must not take the first record off the card.
      await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="0"]'), card.message, 1);
      await recordOn(card.message, mine.id);
      await pressResist(card.element.querySelector('[data-action="resistTest"][data-target-index="1"]'), card.message, 20);
      await recordOn(card.message, theirs.id);
      assert.hasAllKeys(card.message.getFlag("azeroth-rpg", "resists"), [mine.id, theirs.id], "one target's record replaced the other's");
      const owners = box => [...box.querySelectorAll("[data-resist-owner]")].map(el => el.dataset.resistOwner);
      const results = box => box.querySelectorAll(".azeroth-card-resisted").length;

      // The GM sees both rows and both results, in the order of the rows.
      const asGM = renderedAs(card.message);
      assert.deepEqual(owners(asGM), [mine.uuid, theirs.uuid], "the GM is not shown every row");
      const said = [...asGM.querySelectorAll(".azeroth-card-resisted")].map(p => p.textContent);
      assert.lengthOf(said, 2, "the card does not print both recorded Tests");
      assert.include(said[0], mine.name);
      assert.include(said[0], game.i18n.localize("AZEROTH.Roll.Outcome.Failure"));
      assert.include(said[1], theirs.name);
      assert.include(said[1], game.i18n.localize("AZEROTH.Roll.Outcome.Success"));

      // A player who owns only the first Ghoul, reading a card somebody else
      // cast: their row stays, the other row goes, the caster's own buttons go,
      // and the result stays. The card is re-made in memory with another
      // author, because the author of a message always owns it.
      await mine.update({ ownership: { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
      await theirs.update({ ownership: { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
      const someoneElses = new ChatMessage.implementation({ ...card.message.toObject(), author: foundry.utils.randomID() });
      const asOwner = renderedAs(someoneElses, { asPlayer: true });
      assert.deepEqual(owners(asOwner), [mine.uuid], "a player is shown a row that is not theirs, or not their own");
      assert.isNull(asOwner.querySelector('[data-action="applySpellEffect"]'), "a player who did not cast was shown the caster's Apply");
      assert.equal(results(asOwner), 2, "the recorded Tests were not printed for the player");
      assert.ok(asOwner.querySelector(".azeroth-card-resists"), "the player's own row lost its block");

      // A player who owns neither: no row and no block, and the result still printed.
      await mine.update({ ownership: { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
      const asStranger = renderedAs(someoneElses, { asPlayer: true });
      assert.deepEqual(owners(asStranger), [], "a player who owns no target was shown a row");
      assert.isNull(asStranger.querySelector(".azeroth-card-resists"), "an empty Resist block was left standing");
      assert.equal(results(asStranger), 2, "a reader shown no row lost the results too");
      assert.isTrue(game.user.isGM, "the stubbed role outlived the render");
    });

    it("Frost Armor: Apply lays one effect on the caster with Ward 1 against Frost, and a second casting replaces it", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Armor Mage", classes: [["Mage", 3]], spells: ["Frost Armor"] });
      const spell = mage.items.find(i => i.name === "Frost Armor");
      assert.isTrue(spell.system.applies.active, "the pack does not mark Frost Armor as lasting");
      assert.deepEqual(spell.system.applies.changes, [{ key: "system.ward.frost", type: "add", value: "1" }]);
      const before = mage.system.ward?.frost ?? 0;
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [] } });
      const button = card.element.querySelector('[data-action="applySpellEffect"][data-self]');
      assert.ok(button, "no Apply to yourself on a Self spell");
      await CARD_ACTIONS.applySpellEffect(button, card.message);
      await until(() => mage.effects.some(e => e.name === "Frost Armor"), "the effect");
      const effect = mage.effects.find(e => e.name === "Frost Armor");
      assert.equal(effect.getFlag("azeroth-rpg", "spell"), spell.uuid);
      // Which cast laid it (D-724): the spell, the card's own key and the card.
      assert.equal(effect.getFlag("azeroth-rpg", "identifier"), "frost-armor", "the effect does not say which spell laid it");
      assert.match(card.message.flags["azeroth-rpg"].cast ?? "", /^[A-Za-z0-9]{16}$/, "the card carries no cast to lay");
      assert.equal(effect.getFlag("azeroth-rpg", "cast"), card.message.flags["azeroth-rpg"].cast, "the effect does not carry the card's cast");
      assert.equal(effect.getFlag("azeroth-rpg", "messageId"), card.message.id, "the effect does not name the card it was laid from");
      assert.include(effect.description ?? "", "Ward 1 against Frost");
      assert.equal(mage.system.ward.frost, before + 1, "the Ward did not rise");
      await CARD_ACTIONS.applySpellEffect(button, card.message);
      await settle();
      assert.lengthOf(mage.effects.filter(e => e.name === "Frost Armor"), 1, "a second casting stacked");
      assert.equal(mage.system.ward.frost, before + 1);
    });

    it("Blizzard records what was cast, which cast, its verdict and its caster's token, and the Sustain and the placed Region hold that same cast (D-724, D-726)", async function () {
      this.timeout(120000);
      const mage = await makeCharacter({ name: "ZZ Recorded Blizzard", classes: [["Mage", 3]], spells: ["Blizzard"] });
      const spell = mage.items.find(i => i.name === "Blizzard");
      assert.equal(spell.system.duration.kind, "sustained", "Blizzard is not Sustained in the pack");
      const npc = await makeNpc("Plagued Ghoul");
      const held = () => (mage.getFlag("azeroth-rpg", "sustaining") ?? []).find(s => s.spellId === spell.id) ?? null;
      const fill = async () => {
        const pool = mage.system.powers.find(p => p.name === "mana");
        await mage.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
        await until(() => mage.system.powers.find(p => p.name === "mana").value === pool.max, "the Mana filled");
      };

      // The card: the spell's identifier, a sixteen-character key, the verdict as decided.
      const first = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      const flags = first.message.flags["azeroth-rpg"];
      assert.equal(flags.identifier, "blizzard", "the card does not say which spell");
      assert.match(flags.cast ?? "", /^[A-Za-z0-9]{16}$/, `the card's cast is not a sixteen-character key: ${flags.cast}`);
      assert.isTrue(flags.success, "a natural 20 did not record a success");
      // Cast straight through the workflow, nobody named the caster's token.
      assert.property(flags, "source");
      assert.isNull(flags.source);

      // The Sustain, written before the card existed, carries the card's own key.
      await until(() => held(), "the Sustain");
      const entry = held();
      assert.equal(entry.cast, flags.cast, "the Sustain holds a different cast from the card");
      assert.equal(entry.identifier, "blizzard");
      assert.deepEqual(entry.targets, [{ sceneId: null, tokenId: null, actorId: npc.id }], "the Sustain does not record what it was aimed at");
      assert.isNull(entry.source);

      // **FROM HERE THE MAGE STANDS ON A SCENE THAT IS VIEWED** (D-724), so the
      // roll dialog's rule has exactly one token to name - `assert.property`
      // on a key that is always written could not fail, and this can. The
      // scene is put back and deleted however the test ends; deleting a VIEWED
      // scene leaves the world with no canvas, so what was viewed is viewed
      // again first.
      const wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      const scene = await Scene.create({
        name: "ZZ Blizzard Scene", width: 2000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      try {
        await scene.view();
        await until(() => canvas.ready && canvas.scene?.id === scene.id, "the Blizzard scene on the board", 15000);
        await mage.update({ "prototypeToken.actorLink": true });
        const [token] = await scene.createEmbeddedDocuments("Token", [(await mage.getTokenDocument({ x: 600, y: 600 })).toObject()]);
        await until(() => mage.getActiveTokens(false, true).length === 1, "the mage's token standing on the board", 15000);
        const onBoard = { sceneId: scene.id, tokenId: token.id };

        // A second casting through the door is a second cast, and it replaces the
        // first under 05 §12's limit with its own key. Nothing targeted, so the
        // DC is the tier's and not whatever another batch left aimed at.
        canvas?.tokens?.releaseAll?.();
        canvas?.tokens?.setTargets?.([]);
        await fill();
        const unpin = pinDie(20);
        let second;
        try {
          second = await withDialogSkipped(() => castWithDialog(mage, spell));
        } finally {
          unpin();
        }
        assert.ok(second, "the second casting posted no card");
        made.push(second);
        const again = second.flags["azeroth-rpg"];
        assert.match(again.cast ?? "", /^[A-Za-z0-9]{16}$/);
        assert.notEqual(again.cast, flags.cast, "two castings shared one cast key");
        assert.deepEqual(again.source, onBoard, "a cast through the dialog's door did not record the caster's token");
        await until(() => held()?.cast === again.cast, "the Sustain to hold the second cast");
        assert.lengthOf((mage.getFlag("azeroth-rpg", "sustaining") ?? []).filter(s => s.spellId === spell.id), 1, "the limit held two");
        assert.deepEqual(held().source, onBoard, "the Sustain does not record the token holding it");

        // **PLACE AREA FROM THAT CARD** (D-724, D-726): a ground circle, pressed
        // on the board, whose Region answers to the card and to the Sustain.
        const before = scene.regions.size;
        const placing = CARD_ACTIONS.placeArea({ dataset: {} }, second);
        pressBoard({ x: 1300, y: 1300 });
        const region = await placing;
        assert.ok(region, "Place Area placed nothing");
        assert.equal(scene.regions.size, before + 1);
        assert.equal(region.getFlag("azeroth-rpg", "cast"), again.cast, "the Region does not carry the card's cast");
        assert.equal(region.getFlag("azeroth-rpg", "messageId"), second.id, "the Region does not name the card it came from");
        assert.equal(region.getFlag("azeroth-rpg", "identifier"), "blizzard");
        assert.deepEqual(region.getFlag("azeroth-rpg", "source"), onBoard, "the Region does not name the token it was placed from");
        assert.equal(region.getFlag("azeroth-rpg", "cast"), held()?.cast, "the Region and the Sustain name different casts");
        // The fixed three still read off the area itself.
        assert.equal(region.getFlag("azeroth-rpg", "area")?.shape, "circle");

        // A failed Casting Test records its failure, and holds nothing new.
        await fill();
        const missed = pinDie(1);
        let failed;
        try {
          failed = await withDialogSkipped(() => castWithDialog(mage, spell));
        } finally {
          missed();
        }
        assert.ok(failed, "the failed casting posted no card");
        made.push(failed);
        assert.isFalse(failed.flags["azeroth-rpg"].success, "a failed Casting Test did not record its failure");
        assert.match(failed.flags["azeroth-rpg"].cast ?? "", /^[A-Za-z0-9]{16}$/, "a failed cast carries no key");
        await settle();
        assert.equal(held()?.cast, again.cast, "a failed Casting Test replaced the Sustain");
      } finally {
        canvas?.tokens?.releaseAll?.();
        if (wasViewing && wasViewing.id !== scene.id && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
        await scene.delete().catch(() => {});
      }
    });

    it("places a card's area from no token at all where the card's caster has none on the board, whatever is selected (D-726)", async function () {
      this.timeout(120000);
      // `tokenFor` used to fall back to the FIRST SELECTED TOKEN, anybody's, and
      // a card's Place area took that token as its caster. A cone then spread
      // from whoever the GM happened to have clicked last.
      const mage = await makeCharacter({ name: "ZZ Tokenless Cone Mage", classes: [["Mage", 3]], spells: ["Cone of Cold"] });
      const spell = mage.items.find(i => i.name === "Cone of Cold");
      assert.match(spell.system.target ?? "", /cone/i, "Cone of Cold is not a cone in the pack");
      const bystander = await makeNpc("Plagued Ghoul");
      const wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      const scene = await Scene.create({
        name: "ZZ Tokenless Cone Scene", width: 2000, height: 2000,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
      });
      try {
        await scene.view();
        await until(() => canvas.ready && canvas.scene?.id === scene.id, "the cone scene on the board", 15000);
        // Somebody else's token, standing and SELECTED; the mage has none here.
        const [other] = await scene.createEmbeddedDocuments("Token", [(await bystander.getTokenDocument({ x: 600, y: 600 })).toObject()]);
        await until(() => canvas.tokens.get(other.id), "the bystander's token drawn", 15000);
        canvas.tokens.activate();
        canvas.tokens.get(other.id).control({ releaseOthers: true });
        assert.lengthOf(canvas.tokens.controlled, 1, "the bystander was not selected, so this proves nothing");

        const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [] } });
        assert.isNull(card.message.flags["azeroth-rpg"].source, "a direct cast recorded a source");
        // A cone from no token asks where it STARTS first (D-723); a cone from a
        // token would draw its aim at once and ask only for the facing.
        const placing = CARD_ACTIONS.placeArea({ dataset: {} }, card.message);
        await settle();
        assert.isNull(canvas.controls?.children?.find(c => c.name === "azeroth-aim-preview" && !c.destroyed) ?? null,
          "the cone took the selected bystander as its caster and aimed from it");
        pressBoard({ x: 1000, y: 1000 });
        await until(() => canvas.controls?.children?.some(c => c.name === "azeroth-aim-preview" && !c.destroyed), "the aim after the start");
        pressBoard({ x: 1000, y: 1500 });
        const region = await placing;
        assert.ok(region, "no Region was placed");
        assert.closeTo(region.shapes[0].x, 1000, 0.5, "the cone did not start where it was pressed");
        assert.closeTo(region.shapes[0].y, 1000, 0.5, "the cone did not start where it was pressed");
        assert.isNull(region.getFlag("azeroth-rpg", "source"), "a Region placed from no token names one");
        assert.equal(region.getFlag("azeroth-rpg", "messageId"), card.message.id);
      } finally {
        canvas?.tokens?.releaseAll?.();
        if (wasViewing && wasViewing.id !== scene.id && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
        await scene.delete().catch(() => {});
      }
    });

    it("a Sustain ends from its row on the Spells tab, and what it laid is lifted (2026-09-06)", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Sustain Mage", classes: [["Mage", 3]], spells: ["Detect Magic"] });
      const spell = mage.items.find(i => i.name === "Detect Magic");
      assert.equal(spell.system.duration.kind, "sustained", "Detect Magic is not Sustained in the pack");
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [] } });
      await until(() => (mage.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.spellId === spell.id), "the Sustain");
      const apply = card.element.querySelector('[data-action="applySpellEffect"][data-self]');
      assert.ok(apply, "no Apply on a Sustained Self spell");
      await CARD_ACTIONS.applySpellEffect(apply, card.message);
      await until(() => mage.effects.some(e => e.name === "Detect Magic"), "the laid effect");
      const sheet = await openSheet(mage);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        const end = sheet.element.querySelector(`.azeroth-spell[data-item-id="${spell.id}"] [data-action="endSustain"]`);
        assert.ok(end, "no End on the sustained row");
        end.click();
        await until(() => !(mage.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s.spellId === spell.id), "the Sustain ended");
        await until(() => !mage.effects.some(e => e.name === "Detect Magic"), "the laid effect lifted");
        await settle();
        assert.isNull(sheet.element.querySelector(`.azeroth-spell[data-item-id="${spell.id}"] [data-action="endSustain"]`), "the row still offers End");
      } finally {
        await sheet.close();
      }
    });

    it("Arcane Intellect: Apply to a target lays the effect on that target with the entry's text", async function () {
      this.timeout(60000);
      const mage = await makeCharacter({ name: "ZZ Intellect Mage", classes: [["Mage", 3]], spells: ["Arcane Intellect"] });
      const spell = mage.items.find(i => i.name === "Arcane Intellect");
      const npc = await makeNpc("Plagued Ghoul");
      const card = await cardOf("spell", mage, { spell, face: 20, args: { targets: [snapshotOf(npc)] } });
      const button = card.element.querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(button, "no Apply to the target");
      await CARD_ACTIONS.applySpellEffect(button, card.message);
      await until(() => npc.effects.some(e => e.name === "Arcane Intellect"), "the effect on the target");
      const effect = npc.effects.find(e => e.name === "Arcane Intellect");
      assert.include(effect.description ?? "", "Mana pool rises by 2");
      assert.equal(effect.duration?.units, "hours", "8 hours on the world clock");
    });

    it("Arcane Brilliance raises the target's Mana cap by 3 with the Mana at once; Intellect does not stack on it; the cap falls with the effect (2026-09-06)", async function () {
      this.timeout(60000);
      const caster = await makeCharacter({ name: "ZZ Brilliance Mage", classes: [["Mage", 5]], spells: ["Arcane Brilliance", "Arcane Intellect"] });
      const target = await makeCharacter({ name: "ZZ Brilliance Target", classes: [["Mage", 1]] });
      const mana = () => target.system.powers.find(p => p.name === "mana");
      const before = { ...mana() };
      assert.isAbove(before.max, 0, "the target holds no Mana");
      const brilliance = caster.items.find(i => i.name === "Arcane Brilliance");
      assert.deepEqual(brilliance.system.applies.changes, [{ key: "mana", type: "pool", value: "3" }], "the pack carries no pool change");
      const card = await cardOf("spell", caster, { spell: brilliance, face: 20, args: { targets: [snapshotOf(target)] } });
      const button = card.element.querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(button, "no Apply to the target");
      await CARD_ACTIONS.applySpellEffect(button, card.message);
      await until(() => mana().max === before.max + 3, "the cap up by 3");
      assert.equal(mana().value, Math.min(before.value + 3, before.max + 3), "the extra Mana is not available at once");
      // Intellect on top: replaces, never stacks.
      const intellect = caster.items.find(i => i.name === "Arcane Intellect");
      const second = await cardOf("spell", caster, { spell: intellect, face: 20, args: { targets: [snapshotOf(target)] } });
      await CARD_ACTIONS.applySpellEffect(second.element.querySelector('[data-action="applySpellEffect"][data-target-index="0"]'), second.message);
      await until(() => mana().max === before.max + 2, "Intellect replaced Brilliance");
      assert.lengthOf(target.effects.filter(e => e.getFlag("azeroth-rpg", "spell")), 1, "two spell effects stand");
      await target.deleteEmbeddedDocuments("ActiveEffect", target.effects.map(e => e.id));
      await until(() => mana().max === before.max, "the cap back");
      assert.isAtMost(mana().value, before.max, "the value did not clamp to the cap");
    });
  });
}

/* ------------------------------------------------------------------------ */

export function creatorSpellsBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The creator's spells step and shelves (2026-09-06)", function () {
    // **`cleanup` NEEDS A LONG TIMEOUT** and its own docblock says so: a hook
    // takes mocha's 2000 ms default, and this one deletes a dozen actors, each
    // waiting on the talent grant its class started. It timed out under load
    // and reported as a failing suite with every test in it green.
    after(async function () { this.timeout(180000); await cleanup(); });
    const creatorOf = () => new (game.system.azeroth.creator)();
    const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;

    it("a Priest walks eleven steps with Spells after Talents; a Warrior walks ten without it", async function () {
      this.timeout(60000);
      const creator = creatorOf();
      await creator.render({ force: true });
      await settle();
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Priest") });
      await settle();
      const strip = () => [...creator.element.querySelectorAll(".azeroth-creator-step")].map(b => b.dataset.step);
      assert.include(strip(), "spells");
      assert.equal(strip().indexOf("spells"), strip().indexOf("talents") + 1);
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Warrior"), step: "spells" });
      await settle();
      assert.notInclude(strip(), "spells");
      assert.equal(creator.state.step, "talents", "a Warrior on the spells step is put on Talents");
      assert.deepEqual(stepsFor({ cls: { power: { caster: "none" } } }).length, 10);
      await creator.close();
    });

    it("the spells step lists a Priest's tier-1 spells, opens one on its entry, and adds it", async function () {
      this.timeout(60000);
      const creator = creatorOf();
      await creator.render({ force: true });
      await settle();
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Priest"), abilities: { str: 8, dex: 10, con: 12, int: 13, wis: 16, cha: 14 }, step: "spells" });
      await settle();
      const options = () => [...creator.element.querySelectorAll('[data-picker-list="spells"] li[data-search]')];
      assert.isAbove(options().length, 5, "no tier-1 spells listed");
      const findings = checkText(creator.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      const first = options()[0];
      const name = first.querySelector('[data-action="creatorExpand"]');
      const key = name.dataset.key;
      name.click();
      await until(() => creator.element.querySelector(`[data-key="${key}"][aria-expanded="true"]`), "the row opened");
      const entry = creator.element.querySelector(`[data-key="${key}"]`).closest("li").querySelector(".azeroth-creator-entry");
      assert.ok(entry, "no entry under the opened row");
      assert.isAbove(entry.querySelector(".azeroth-creator-effect")?.textContent.trim().length ?? 0, 20, "the effect is empty");
      creator.element.querySelector(`[data-key="${key}"]`).closest("li").querySelector('[data-action="creatorAddSpell"]').click();
      await until(() => creator.state.spells.length === 1, "the spell added");
      assert.equal(creator.state.spells[0], key);
      await creator.close();
    });

    it("the equipment step shelves the catalogue by kind, sorts on the toggle, opens a row on 08's words, and a term opens every shelf", async function () {
      this.timeout(60000);
      const creator = creatorOf();
      await creator.render({ force: true });
      await settle();
      await creator.setState({ cls: await uuidOf(PACK_FOR.class, "Warrior"), step: "equipment" });
      await settle();
      const shelves = () => [...creator.element.querySelectorAll(".azeroth-creator-shelf")];
      assert.isAbove(shelves().length, 8, "too few shelves");
      assert.isTrue(shelves().every(s => !s.querySelector("details").open), "shelves open closed");
      const light = shelves().find(s => /Light weapon/.test(s.querySelector("summary").textContent));
      assert.ok(light, "no Light weapon shelf");
      light.querySelector("summary").click();
      await settle();
      const rowsOf = shelf => [...shelf.querySelectorAll("li[data-search]")].map(li => li.dataset.search);
      const byName = rowsOf(light);
      assert.deepEqual(byName, [...byName].sort(), "the rows are not A to Z");
      creator.element.querySelector('[data-action="creatorSort"]').click();
      await until(() => creator.state.itemSort === "cost", "the sort toggled");
      await settle();
      const reopened = shelves().find(s => /Light weapon/.test(s.querySelector("summary").textContent));
      assert.isTrue(reopened.querySelector("details").open, "the opened shelf did not stay open across the render");
      const row = reopened.querySelector('li[data-search="dagger"]');
      assert.ok(row, "no Dagger on the Light weapon shelf");
      row.querySelector('[data-action="creatorExpand"]').click();
      await until(() => creator.element.querySelector('li[data-search="dagger"] .azeroth-creator-entry'), "the row opened on its entry");
      const opened = creator.element.querySelector('li[data-search="dagger"] .azeroth-creator-entry');
      assert.isAbove(opened.textContent.trim().length, 20, "08 says nothing of the dagger");
      const input = creator.element.querySelector("input[name=itemSearch]");
      input.value = "longsw";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
      const visible = shelves().filter(s => !s.hidden);
      assert.lengthOf(visible, 1, "a term did not hide the empty shelves");
      assert.isTrue(visible[0].querySelector("details").open, "a term did not open the shelf it matched");
      const findings = checkText(creator.element);
      assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      await creator.close();
    });

    it("the GM's Finish hands the character to the player named on the Name step", async function () {
      this.timeout(120000);
      const player = await User.create({ name: "ZZ Quench Player", role: CONST.USER_ROLES.PLAYER });
      const creator = creatorOf();
      try {
        await creator.render({ force: true });
        await settle();
        await creator.setState({ step: "name" });
        await settle();
        const select = creator.element.querySelector("select[name=player]");
        assert.ok(select, "the GM's Name step offers no player");
        assert.ok([...select.options].some(o => o.value === player.id), "the player is not offered");
        const road = [];
        for (const name of ["Bedroll", "Waterskin", "Tinderbox", "Hardtack, a week", "Rope, 50 ft (hemp)"]) {
          const doc = await fromPack(PACK_FOR.equipment, name).catch(() => null);
          if (doc) road.push({ uuid: doc.uuid, quantity: 1, road: true });
        }
        const result = await creator.apply({
          race: await uuidOf(PACK_FOR.race, "Human"),
          cls: await uuidOf(PACK_FOR.class, "Warrior"),
          method: "array",
          abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
          career: await uuidOf(PACK_FOR.career, "Watchman"),
          ranks: { athletics: 1 },
          adaptable: "athletics",
          racialTalent: "Refugee's Road",
          classTalent: (await game.packs.get(PACK_FOR.talent).getIndex({ fields: ["system.className", "system.tier", "system.race", "system.identifier"] }))
            .find(t => t.system.className === "Warrior" && t.system.tier === 1 && !t.system.race)?.system.identifier,
          spells: [],
          equipment: road,
          name: "ZZ Handed Over",
          player: player.id
        });
        if (result.actor) made.push(result.actor);
        assert.isTrue(result.ok, `Finish refused: ${result.reasons.map(r => r.code).join(", ")}`);
        assert.equal(result.actor.ownership[player.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, "the player does not own the character");
      } finally {
        await creator.close().catch(() => null);
        await player.delete();
      }
    });
  });
}
