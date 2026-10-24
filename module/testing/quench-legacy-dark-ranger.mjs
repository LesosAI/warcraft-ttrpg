/**
 * **THE DARK RANGER, LIVE** (04's Dark Ranger (Forsaken); the Legacy branches' phase
 * B6a).
 *
 * A Forsaken Ranger holds the branch beside the class's thirty-six (door 1, B5), each
 * talent set at its ranks, and each is pressed from the sheet's own control with
 * tokens on a scene - the Combat tab's Attack and Use, the Spells tab's Cast, the roll
 * dialog's rider lines, the cards' own buttons and the board's own pick - the die
 * pinned through `fixtures.mjs#pinDie`, and every outcome read back off the documents:
 *
 * - Grave Bond: the Companion's chooser lists the Plagued Ghoul beside the beasts,
 *   tagged, and a failed Spirit Test binds it, said on a card;
 * - Keening Arrows: a shot at SL 2 offers the ghoul's Spirit Test at the Spell DC, a
 *   failure Frightens it for the rank's rounds on its own clock, and the Attack's second
 *   roll offers no second Test;
 * - Shadowcraft and Embrace the Shadows: the three spells known; Shadow Walk cast from
 *   the Spells tab with Wisdom, 1 Focus at rank 2, the ranger displaced, and the turn
 *   recorded as moved; Dark Passage paid in Focus less the rank 2 discount;
 * - Black Arrow through the real dialog, and Dark Minion: 2 Focus and no arrow spent, the
 *   rank's Shadow named on the card, the no-healing mark keyed on the ranger's turn - and
 *   the marked ghoul's fall raising a Risen Skeleton bound to the ranger, on the board;
 * - Cold Company: Frightened refused at the one landing door;
 * - Banshee's Wail: 2 Quarry and a use, the Spirit Test at the Spell DC, Frightened for
 *   the fight's ten rounds on the ghoul's clock;
 * - Dread: a Boon and the rank's damage against a Frightened ghoul, neither against a
 *   steady one;
 * - Hush of the Grave: 4 Focus and a use, a point past 60 feet refused in words and one
 *   inside it placed, Silenced keyed on the ranger's next turn start;
 * - Life Drain: 3 Quarry, the Shadow through the ghoul's Ward, and the ranger healed by
 *   what it took;
 * - Thrall of the Banshee: 4 Focus once a Long Rest, the Resist the named ghoul's alone,
 *   and a failure binding it as a thrall, Charmed and on the ranger's side.
 *
 * Written in B6a and NOT run (the brief: offline, Vitest only). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.legacy-dark-ranger`. Every document a test makes is deleted
 * in `after`, and the creatures it bound with their owners.
 */

import { cleanup, dialogFor, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { cancelPick, pickState } from "../canvas/place.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
import { boundOf } from "../documents/bound.mjs";
import { NO_HEALING_FLAG } from "../rules/no-healing.mjs";
import { MOVED_MARK } from "../rules/rest.mjs";
import { THRALL_FLAG, THRALL_KIND } from "../rules/legacy-uses.mjs";
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
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const classTalents = actor => actor.items.filter(i => i.type === "talent" && !i.system?.race);
const provenanceOf = card => card.rolls?.[0]?.options?.provenance ?? [];
const combatantOf = (combat, actor) => combat.getCombatantsByActor(actor)[0] ?? null;
const attackCardsBy = actor => game.messages.filter(m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "attack");

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements, { name = "ZZ Legacy Dark Ranger Scene" } = {}) {
  const scene = await Scene.create({ name, width: 5000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  if (!pool) throw new Error(`${actor.name} holds no ${name}`);
  const v = Math.min(pool.max ?? value, value);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: v });
  await until(() => poolOf(actor, name).value === v, `${v} ${name}`);
  return v;
}

/** Press the 2D board at a canvas point, as a browser does (`quench-pick-state.mjs`'s shape). */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** The chooser an item opened, once rendered. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name}'s chooser`, ms);
}

/**
 * **A FORSAKEN RANGER WITH THE DARK RANGER'S TALENTS AT THESE RANKS** (door 1: the
 * race keeps the branch, so it arrives untaken beside the class's thirty-six), these
 * weapons in hand - a bundle of arrows carried and nocked, never worn (D-641) - waiting
 * for every grant the ranks make, the spells they teach among them.
 */
async function forsakenRanger(name, { level = 9, ranks = {}, weapons = [], abilities = { dex: 16, wis: 14, con: 12 } } = {}) {
  const ranger = await makeCharacter({ name, classes: [["Ranger", level]], race: "Forsaken", weapons, abilities });
  await until(() => classTalents(ranger).filter(t => t.system?.legacy === "Forsaken").length === 12, `${name}'s Dark Ranger twelve`, 30000);
  for (const n of weapons) {
    const item = await until(() => itemNamed(ranger, n), `${n} held`);
    if (/arrows|bolts/i.test(n)) continue;
    await item.update({ "system.equipped": true });
    await until(() => ranger.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(ranger, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(ranger, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return ranger;
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

/** The Combat tab's Use for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-feature[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;
/** The Combat tab's Attack for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;
/** The Spells tab's Cast for one spell. */
const castControl = (sheet, spell) => () => sheet.element?.querySelector(`section[data-tab="spells"] .azeroth-spell[data-item-id="${spell.id}"] [data-action="castSpell"]`) ?? null;

/** The ranger's sheet open on the Combat tab, for `fn`, closed after. */
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

/** The ranger's shot at the ghoul from the Combat tab, the ghoul targeted. */
async function shootAt(ranger, ghoul, face = 18) {
  canvas.tokens.setTargets([tokenOf(ghoul).id]);
  try {
    return await onCombatTab(ranger, sheet => pressForCard(attackControl(sheet, itemNamed(ranger, "Shortbow")), ranger, face, { kind: "attack" }));
  } finally {
    canvas.tokens.setTargets([]);
  }
}

/** A Use pressed on the Combat tab with these creatures targeted (`featureAims` decides whether it takes them). */
async function useAt(actor, feature, targets = [], face = 15) {
  canvas.tokens.setTargets(targets.map(a => tokenOf(a).id));
  try {
    return await onCombatTab(actor, sheet => pressForCard(useControl(sheet, feature), actor, face));
  } finally {
    canvas.tokens.setTargets([]);
  }
}

/** Cast from the Spells tab, the die pinned, the board pressed where the spell's pick waits. */
async function castWithPick(actor, spell, point, face = 20) {
  const sheet = await openSheet(actor);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "spell");
  const unpin = pinDie(face);
  try {
    const control = castControl(sheet, spell)();
    if (!control) throw new Error(`the Spells tab draws no Cast for ${spell.name}`);
    control.click();
    await until(() => pickState()?.mode === "point", `${spell.name}'s pick`);
    pressBoard(point);
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
    cancelPick();
    await sheet.close();
  }
}

export function legacyDarkRangerBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Dark Ranger (Forsaken; the Legacy branches' B6a)", function () {
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
      cancelPick();
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
      // What the batch bound goes with its owner.
      for (const actor of game.actors.filter(a => a.getFlag("azeroth-rpg", "bond")?.ownerName?.startsWith("ZZ"))) await actor.delete().catch(() => {});
      await cleanup();
    });

    // FIRST, before any other case leaves a ghoul in the world: the chooser lists the
    // GM's own undead beside 14's entries, and this case picks 14's.
    it("GRAVE BOND: the Companion's chooser lists the Plagued Ghoul beside the beasts, tagged with the talent, and a failed Spirit Test binds it, said on a card", async function () {
      this.timeout(180000);
      const ranger = await forsakenRanger("ZZ LDR Grave", { ranks: { "Grave Bond": 1 } });
      const companion = await until(() => featureNamed(ranger, "Companion"), "Companion granted");
      const sheet = await openSheet(ranger);
      // The Test's own card: a roll, no kind of the system's, the talent named.
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === ranger.id && !m.flags?.["azeroth-rpg"]?.kind && (m.content ?? "").includes("Grave Bond"));
      const unpin = pinDie(1);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        useControl(sheet, companion)().click();
        const app = await chooser(companion);
        const select = app.element.querySelector("#azeroth-choose-select");
        assert.ok(select, "the Companion's chooser is not a list");
        const ghoulOption = [...select.options].find(o => o.textContent.trim().startsWith("Plagued Ghoul"));
        assert.ok(ghoulOption, "the chooser does not list a Mindless Undead under Grave Bond");
        assert.include(ghoulOption.textContent, "Grave Bond", "the ghoul is not tagged with the talent that opens it");
        assert.isFalse(ghoulOption.disabled, "the ghoul is listed and greyed");
        select.value = ghoulOption.value;
        app.element.querySelector('button[data-action="choose"]').click();
        await until(() => !app.rendered, "the chooser to close");
        const [card] = await posted;
        made.push(card);
        assert.include(textOf(card), game.i18n.format("AZEROTH.GraveBond.Failed", {
          talent: "Grave Bond", name: "Plagued Ghoul", dc: ranger.system.spellDC, total: card.rolls?.[0]?.total ?? 0
        }), "the card does not say the remains failed against the Spell DC");
      } finally {
        unpin();
        await sheet.close();
      }
      const bound = await until(() => boundOf(ranger, "companion").find(a => a.name.startsWith("Plagued Ghoul")), "the ghoul bound as the companion", 30000);
      made.push(bound);
      assert.equal(bound.getFlag("azeroth-rpg", "bond")?.ownerUuid, ranger.uuid, "the bond does not name the ranger");
    });

    it("KEENING ARROWS: a shot at SL 2 offers the ghoul's Spirit Test at the Spell DC, a failure Frightens it for the rank's rounds on its own clock, and the Attack's second roll offers no second Test", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Keening", { weapons: ["Shortbow", "Hunting arrows"], ranks: { "Keening Arrows": 3 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // Thirty feet: inside the Shortbow's 80, no Engaged Bane.
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul]);
      await giveTurn(combat, ranger);
      const theirs = combatantOf(combat, ghoul);
      const before = attackCardsBy(ranger).length;
      const card = await shootAt(ranger, ghoul, 20);
      assert.isTrue(card.rolls[0].outcome.success, "the pinned 20 missed");
      assert.isAtLeast(card.rolls[0].outcome.sl, 2, "the pinned 20 did not reach SL 2");
      const test = parsed(card).querySelector('button[data-action="resistTest"][data-purpose="intimidation"][data-target-index="0"]');
      assert.ok(test, "the card offers the ghoul no Spirit Test");
      assert.equal(test.dataset.resilience, "spirit");
      assert.equal(Number(test.dataset.dc), ranger.system.spellDC, "the Test is not at the Spell DC");
      // *Once a round*: Extra Attack's second roll is the same round's, and offers none.
      if (ranger.hasExtraAttack) {
        await until(() => attackCardsBy(ranger).length >= before + 2, "the Attack's second roll");
        const second = attackCardsBy(ranger).at(-1);
        made.push(second);
        assert.isNull(parsed(second).querySelector('button[data-action="resistTest"][data-purpose="intimidation"]'), "a second Test in the same round");
      }
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(test, game.messages.get(card.id));
      } finally {
        unpin();
      }
      const frightened = await until(() => ghoul.effects.find(e => e.statuses?.has("frightened")), "the ghoul Frightened by its failure");
      assert.equal(frightened._source.duration?.value, 3, "not Frightened for one round per rank");
      assert.equal(frightened._source.duration?.units, "rounds");
      assert.equal(frightened._source.start?.combatant, theirs.id, "the rounds are not the ghoul's own");
    });

    it("SHADOWCRAFT: Shadow Ward and Shadow Walk known; Shadow Walk cast from the Spells tab with Wisdom for 1 Focus at rank 2, the ranger displaced, and the turn recorded as moved", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Shadowcraft", { ranks: { Shadowcraft: 2 } });
      const craft = talentNamed(ranger, "Shadowcraft");
      const walk = await until(() => spellNamed(ranger, "Shadow Walk"), "Shadow Walk known");
      const ward = await until(() => spellNamed(ranger, "Shadow Ward"), "Shadow Ward known");
      for (const s of [walk, ward]) assert.equal(s.getFlag("azeroth-rpg", "spellFrom"), craft.id, `${s.name} is not Shadowcraft's`);
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 2000, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const focus = await setPool(ranger, "focus", 4);
      assert.equal(walk.system.mana, 2, "07's Shadow Walk is not 2 Mana");
      // Two squares along: inside Shadow Walk's 30 feet.
      const card = await castWithPick(ranger, walk, { x: 1250, y: 1050 }, 20);
      assert.isTrue(provenanceOf(card).some(p => p.label === AZEROTH.abilities.wis), "the Casting Test was not made with Wisdom");
      await until(() => poolOf(ranger, "focus").value === focus - 1, "Shadow Walk paid in Focus, 1 less at rank 2");
      const token = tokenOf(ranger);
      await until(() => token.document.x === 1200 && token.document.y === 1000, "the ranger displaced to the space picked");
      // *Shadow Walk counts as moving for your Focus*: the round's record.
      await until(() => (mine.getFlag("azeroth-rpg", "round")?.once ?? []).includes(MOVED_MARK), "the turn recorded as moved");
    });

    it("EMBRACE THE SHADOWS: Dark Passage known and cast as Shadowcraft casts, paid in Focus less Shadowcraft's rank 2 discount", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Embrace", { ranks: { Shadowcraft: 2, "Embrace the Shadows": 1 } });
      const passage = await until(() => spellNamed(ranger, "Dark Passage"), "Dark Passage known");
      assert.equal(passage.getFlag("azeroth-rpg", "spellFrom"), talentNamed(ranger, "Embrace the Shadows").id, "Dark Passage is not Embrace the Shadows'");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }]);
      const focus = await setPool(ranger, "focus", 6);
      const price = passage.system.mana;
      const card = await castWithPick(ranger, passage, { x: 1450, y: 1250 }, 20);
      assert.isTrue(provenanceOf(card).some(p => p.label === AZEROTH.abilities.wis), "Dark Passage was not cast with Wisdom");
      await until(() => poolOf(ranger, "focus").value === focus - (price - 1), "Dark Passage paid in Focus, 1 less for Shadowcraft at rank 2");
    });

    it("BLACK ARROW THROUGH THE REAL DIALOG, AND DARK MINION: 2 Focus and no arrow spent, the rank's Shadow named on the card, the no-healing mark on the ranger's clock - and the marked ghoul's fall raises a Risen Skeleton bound to the ranger, on the board", async function () {
      this.timeout(300000);
      // Level 4: no Extra Attack (02 §6), so the sheet's Attack is one roll. At 13 its
      // second roll - which carries no rider (D-770) - was an ordinary shot and spent its
      // arrow, read as Black Arrow spending one (B8b; the reading is the lead's to rule).
      const ranger = await forsakenRanger("ZZ LDR Black Arrow", { level: 4, weapons: ["Shortbow", "Hunting arrows"], ranks: { "Black Arrow": 2, "Dark Minion": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const focus = await setPool(ranger, "focus", 5);
      const arrows = itemNamed(ranger, "Hunting arrows");
      const quiver = arrows.system.quantity;
      const bow = itemNamed(ranger, "Shortbow");
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      canvas.tokens.setTargets([tokenOf(ghoul).id]);
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === ranger.id && m.flags?.["azeroth-rpg"]?.kind === "attack");
      const unpin = pinDie(20);
      let card = null;
      try {
        await onCombatTab(ranger, async sheet => {
          attackControl(sheet, bow)().click();
          const dialog = await dialogFor(ranger, 8000);
          assert.ok(dialog, "the attack dialog did not open");
          const box = dialog.element.querySelector('input[name="rider-black-arrow"]');
          assert.ok(box, "the dialog draws no Black Arrow line");
          assert.isFalse(box.checked, "a rider came ticked: spending a pool is the player's call");
          assert.isFalse(box.disabled, "Black Arrow was greyed with 5 Focus held");
          box.checked = true;
          dialog.element.querySelector('button[data-action="roll"]').click();
          [card] = await posted;
          made.push(card);
        });
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      }
      assert.isTrue(card.rolls[0].outcome.success, "the pinned 20 missed");
      await until(() => poolOf(ranger, "focus").value === focus - 2, "Black Arrow's 2 Focus");
      // *The attack spends no ammunition*.
      await sleep(300);
      assert.equal(ranger.items.get(arrows.id).system.quantity, quiver, "Black Arrow spent an arrow");
      // *the target takes Shadow damage equal to your rank*: its own type, named.
      assert.isTrue(provenanceOf(card).some(p => p.label === "Black Arrow" && p.formula === game.i18n.format("AZEROTH.Card.PartRow", { n: 2, type: game.i18n.localize(AZEROTH.damageTypes.shadow) })),
        "the card does not name the rank's Shadow");
      // *recovers no Health until the end of your next turn*: the ranger's own clock.
      const mark = await until(() => ghoul.effects.find(e => e.flags?.["azeroth-rpg"]?.[NO_HEALING_FLAG]?.source === "Black Arrow"), "the no-healing mark on the ghoul");
      assert.equal(mark.origin, ranger.uuid, "the mark does not name the ranger");
      assert.equal(mark._source.start?.combatant, mine.id, "the mark is not on the ranger's turn");
      assert.equal(mark._source.duration?.expiry, "turnEnd");
      assert.isTrue(ghoul.system.healingBlocked === true, "the marked ghoul may still be healed");
      // DARK MINION: the marked ghoul drops to 0 before the ranger's turn ends.
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: false, location: "body", type: null });
      await until(() => ghoul.system.health.value === 0, "the ghoul at 0 Health");
      const risen = await until(() => boundOf(ranger, "summon").find(a => a.getFlag("azeroth-rpg", "bond")?.sourceName === "Dark Minion"), "a Risen Skeleton bound to the ranger by Dark Minion", 30000);
      made.push(risen);
      assert.include(risen.name, "Risen Skeleton", "what rose is not 14's Risen Skeleton");
      await until(() => canvas.scene.tokens.some(t => t.actorId === risen.id), "the Risen Skeleton standing on the board");
    });

    it("COLD COMPANY: Frightened is refused at the one landing door, and the ranger is not Frightened", async function () {
      this.timeout(120000);
      const ranger = await forsakenRanger("ZZ LDR Cold");
      // Not the people's own: Will of the Forsaken passes one Test against fear, and refuses nothing.
      assert.notInclude(ranger.system.conditionImmunities ?? [], "frightened", "a Forsaken refuses Frightened without the talent");
      await talentNamed(ranger, "Cold Company").update({ "system.taken": 1 });
      await until(() => (ranger.system.conditionImmunities ?? []).includes("frightened"), "Frightened among what the ranger refuses");
      const ghoul = await makeNpc("Plagued Ghoul");
      const landed = await inflictCondition({ victim: ranger, id: "frightened", by: ghoul, name: ranger.name });
      assert.isFalse(landed.landed, "Frightened landed on a ranger who cannot be Frightened");
      assert.equal(landed.reason, "immune");
      assert.isFalse(ranger.statuses?.has("frightened") === true, "the ranger is Frightened");
    });

    it("BANSHEE'S WAIL: 2 Quarry and a use; every enemy within 20 feet gathered, its Spirit Test on its own row at the Spell DC, and a failure Frightened at once for the fight's ten rounds on the ghoul's own clock", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Wail", { ranks: { "Banshee's Wail": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1200, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const theirs = combatantOf(combat, ghoul);
      await setPool(ranger, "quarry", 4);
      const wail = await until(() => featureNamed(ranger, "Banshee's Wail"), "Banshee's Wail granted");
      assert.equal(wail.system.uses?.max, 1, "rank 1 does not count one use a Short Rest");
      const card = await useAt(ranger, wail);
      await until(() => poolOf(ranger, "quarry").value === 2, "the Wail's 2 Quarry");
      await until(() => mine.budget.halfActions === 1, "the Half-Action");
      await until(() => ranger.items.get(wail.id)?.system?.uses?.value === 0, "the Short Rest's use struck");
      const doc = () => game.messages.get(card.id);
      assert.equal(doc().flags["azeroth-rpg"].area?.distanceFt, 20, "the card's area is not 20 feet");
      // *Every enemy within 20 feet* (the lead: *"Measure the area"*): the ghoul, gathered.
      assert.deepEqual(doc().flags["azeroth-rpg"].targets.map(t => t.tokenId), [tokenOf(ghoul).id], "the Use did not gather the ghoul 10 feet off");
      const resist = parsed(doc()).querySelector('button[data-action="resistTest"][data-target-index="0"]');
      assert.ok(resist, "the ghoul's row offers no Spirit Test");
      assert.equal(resist.dataset.resilience, "spirit");
      assert.equal(Number(resist.dataset.dc), ranger.system.spellDC, "the Test is not at the Spell DC");
      const inflict = parsed(doc()).querySelector('button[data-action="applyCondition"][data-condition="frightened"][data-target-index="0"]');
      assert.equal(inflict?.dataset.until, "minute", "the Frightened is not for one minute");
      assert.equal(inflict?.dataset.onFail, "1", "the Frightened is not marked as the Test's");
      // A failure lays it at once (the lead: *"Land automatically"*), no button pressed.
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resist, doc());
      } finally {
        unpin();
      }
      const frightened = await until(() => ghoul.effects.find(e => e.statuses?.has("frightened")), "the ghoul Frightened by its failure");
      assert.equal(frightened._source.duration?.value, 10, "a minute in a fight is not its ten rounds");
      assert.equal(frightened._source.duration?.units, "rounds");
      assert.equal(frightened._source.start?.combatant, theirs.id, "the minute is not on the ghoul's clock");
      assert.include(frightened.getFlag("azeroth-rpg", "laidBy") ?? [], ranger.uuid, "the Frightened does not name the ranger who laid it");
      const record = await until(() => Object.values(doc().flags["azeroth-rpg"].resists ?? {})[0], "the ghoul's Test recorded on the card");
      assert.deepEqual(record.landed, ["frightened"], "the card does not say the Frightened landed");
      const drawn = await doc().renderHTML();
      assert.isNull(drawn.querySelector('button[data-action="applyCondition"][data-condition="frightened"][data-target-index="0"]'), "the Frightened's button stands on a row whose Test is recorded");
      assert.include(drawn.querySelector(".azeroth-card-resisted")?.textContent ?? "", AZEROTH.conditions.frightened ? game.i18n.localize(AZEROTH.conditions.frightened) : "Frightened", "the card does not say what landed on the ghoul");
    });

    it("DREAD: an attack at a Frightened ghoul gains a Boon and the rank's damage, and one at a steady ghoul neither", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Dread", { weapons: ["Shortbow", "Hunting arrows"], ranks: { Dread: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }]);
      const steady = await shootAt(ranger, ghoul, 15);
      assert.isFalse(provenanceOf(steady).some(p => p.label === "Dread"), "Dread added to a blow at a steady ghoul");
      await ghoul.toggleStatusEffect("frightened", { active: true });
      await until(() => ghoul.statuses?.has("frightened"), "the ghoul Frightened");
      const frightened = await shootAt(ranger, ghoul, 15);
      assert.equal(frightened.rolls[0].options.boons, (steady.rolls[0].options.boons ?? 0) + 1, "no Boon against a Frightened ghoul");
      assert.isTrue(provenanceOf(frightened).some(p => p.label === "Dread" && p.value === 2), "the card does not name Dread's 2");
    });

    it("HUSH OF THE GRAVE: the point picked BEFORE the Focus, a dismissed pick costing nothing and a press past 60 feet refused in words; every enemy within 15 feet of the point gathered and no other; a failure Silenced at once until the ranger's next turn start; the Region set down where it measured", async function () {
      this.timeout(300000);
      const ranger = await forsakenRanger("ZZ LDR Hush", { level: 13, ranks: { "Hush of the Grave": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const beyond = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1500, y: 1000, side: "hostile" }, { actor: beyond, x: 2400, y: 1000, side: "hostile" }]);
      const combat = await fightWith([ranger, ghoul, beyond]);
      const mine = await giveTurn(combat, ranger);
      const focus = await setPool(ranger, "focus", 6);
      const hush = await until(() => featureNamed(ranger, "Hush of the Grave"), "Hush of the Grave granted");
      const regions = canvas.scene.regions.size;
      // A pick dismissed costs nothing (D-768's order: the point is a judgement).
      const sheet = await openSheet(ranger);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const before = game.messages.size;
        useControl(sheet, hush)()?.click();
        await until(() => pickState()?.mode === "point", "Hush's pick");
        cancelPick();
        await sleep(600);
        assert.equal(game.messages.size, before, "a dismissed pick posted a card");
        assert.equal(poolOf(ranger, "focus").value, focus, "a dismissed pick spent Focus");
        assert.equal(ranger.items.get(hush.id)?.system?.uses?.value, 1, "a dismissed pick struck the use");
        // The real Use: a point 85 feet off refused in words, then one inside the ghoul's square.
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === ranger.id && m.flags?.["azeroth-rpg"]?.kind === "feature");
        const unpin = pinDie(15);
        let card = null;
        try {
          const said = await warnings(async () => {
            useControl(sheet, hush)()?.click();
            await until(() => pickState()?.mode === "point", "Hush's pick");
            pressBoard({ x: 2750, y: 1050 });
            await sleep(400);
            assert.equal(pickState()?.mode, "point", "a point past 60 feet closed the pick");
            pressBoard({ x: 1550, y: 1050 });
            [card] = await posted;
            made.push(card);
          });
          assert.include(said, game.i18n.format("AZEROTH.Gather.PickTooFar", { feet: 60, from: ranger.name }), `the far point was not refused in words: ${JSON.stringify(said)}`);
        } finally {
          unpin();
        }
        await until(() => poolOf(ranger, "focus").value === focus - 4, "Hush's 4 Focus");
        await until(() => ranger.items.get(hush.id)?.system?.uses?.value === 0, "the Short Rest's use struck");
        const doc = () => game.messages.get(card.id);
        const flags = doc().flags["azeroth-rpg"];
        // *Every enemy within 15 feet of a point*: the ghoul at the point, never the one 40 feet on.
        assert.deepEqual(flags.targets.map(t => t.tokenId), [tokenOf(ghoul).id], "the Use did not gather exactly the enemy at the point");
        assert.include(flags.gathered ?? {}, { who: "enemy", feet: 15, origin: "point" }, "the card does not record the circle it measured");
        assert.isNull(parsed(doc()).querySelector('button[data-action="placeArea"]'), "the card offers to place an area the Use placed itself");
        await until(() => canvas.scene.regions.size === regions + 1, "the area set down on the board");
        // A failure lays the Silenced at once, until the start of the RANGER's next turn.
        const resist = parsed(doc()).querySelector('button[data-action="resistTest"][data-target-index="0"]');
        assert.ok(resist, "the ghoul's row offers no Spirit Test");
        const fail = pinDie(1);
        try {
          await CARD_ACTIONS.resistTest(resist, doc());
        } finally {
          fail();
        }
        const silenced = await until(() => ghoul.effects.find(e => e.statuses?.has("silenced")), "the ghoul Silenced by its failure");
        assert.equal(silenced._source.duration?.expiry, "turnStart", "the Silenced does not end at a turn's start");
        assert.equal(silenced._source.start?.combatant, mine.id, "the Silenced is not on the ranger's turn");
        assert.isFalse(beyond.statuses?.has("silenced") === true, "the ghoul beyond the circle was reached");
      } finally {
        cancelPick();
        await sheet.close();
      }
    });

    it("LIFE DRAIN: 3 Quarry for twice the tier plus the rank in Shadow through the ghoul's Ward, the ranger healed by what it took - and HALF on a passed Test, rounded down before the Ward", async function () {
      this.timeout(300000);
      const ranger = await forsakenRanger("ZZ LDR Drain", { level: 13, ranks: { "Life Drain": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1600, y: 1000, side: "hostile" }]);
      await setPool(ranger, "quarry", 4);
      await ranger.update({ "system.health.value": 1 });
      await until(() => ranger.system.health.value === 1, "the ranger at 1 Health");
      const drain = await until(() => featureNamed(ranger, "Life Drain"), "Life Drain granted");
      const card = await useAt(ranger, drain, [ghoul]);
      await until(() => poolOf(ranger, "quarry").value === 1, "Life Drain's 3 Quarry");
      const tier = ranger.system.tier;
      const resist = parsed(card).querySelector('button[data-action="resistTest"]');
      assert.equal(resist?.dataset.resilience, "body", "the card offers no Body Test");
      assert.equal(Number(resist.dataset.dc), ranger.system.spellDC, "the Test is not at the Spell DC");
      // 2 x tier + 1, met by the ghoul's Shadow Ward 2 (14's block).
      const flags = card.flags["azeroth-rpg"];
      const ward = ghoul.system.ward?.shadow ?? 0;
      const dealt = flags.damageByTarget?.[0]?.damage ?? null;
      assert.equal(dealt, Math.max(0, 2 * tier + 1 - ward), "the Shadow is not twice the tier plus the rank, less the Ward");
      // *and half that, rounded down, on a success* (the lead: *"Build it everywhere"*): the
      // half is worked out with the whole, halved BEFORE the Ward.
      assert.isTrue(flags.halfOnPass, "the card does not halve on a pass");
      assert.equal(flags.passedByTarget?.[0]?.damage, Math.max(0, Math.floor((2 * tier + 1) / 2) - ward), "the half is not half the worth, less the Ward");
      // The ghoul PASSES (a pinned 20): the Apply lands the half, and the drain heals what it took.
      const pass = pinDie(20);
      try {
        await CARD_ACTIONS.resistTest(resist, game.messages.get(card.id));
      } finally {
        pass();
      }
      await until(() => Object.values(game.messages.get(card.id).flags["azeroth-rpg"].resists ?? {})[0]?.success === true, "the ghoul's passed Test recorded on the card");
      const drawn = await game.messages.get(card.id).renderHTML();
      const apply = drawn.querySelector('button[data-action="applyDamage"][data-target-index="0"]');
      assert.ok(apply, "the card offers no Apply on the ghoul");
      assert.equal(Number(apply.dataset.damage), flags.passedByTarget[0].damage, "the Apply does not name the half");
      const health = ghoul.system.health.value;
      await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id));
      await until(() => ghoul.system.health.value === Math.max(0, health - flags.passedByTarget[0].damage), "the half on the ghoul that passed");
      const took = health - ghoul.system.health.value;
      await until(() => ranger.system.health.value === Math.min(ranger.system.health.max, 1 + took), "the ranger healed by what the half took");
    });

    it("THRALL OF THE BANSHEE: 4 Focus once a Long Rest, the Resist the named ghoul's alone, and a failure binding it as a thrall, Charmed and on the ranger's side", async function () {
      this.timeout(240000);
      const ranger = await forsakenRanger("ZZ LDR Thrall", { level: 17, ranks: { "Hush of the Grave": 1, "Thrall of the Banshee": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // Fifteen feet: inside the 30.
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const focus = await setPool(ranger, "focus", 6);
      const thrall = await until(() => featureNamed(ranger, "Thrall of the Banshee"), "Thrall of the Banshee granted");
      assert.equal(thrall.system.uses?.max, 1, "not once a Long Rest");
      const card = await useAt(ranger, thrall, [ghoul]);
      await until(() => poolOf(ranger, "focus").value === focus - 4, "the Thrall's 4 Focus");
      await until(() => ranger.items.get(thrall.id)?.system?.uses?.value === 0, "the Long Rest's use struck");
      const resist = parsed(card).querySelector('button[data-action="resistTest"][data-target-index="0"]');
      assert.ok(resist, "the Resist does not name the ghoul's row");
      assert.equal(resist.dataset.resilience, "spirit");
      assert.equal(Number(resist.dataset.dc), ranger.system.spellDC, "the Test is not at the Spell DC");
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(resist, game.messages.get(card.id));
      } finally {
        unpin();
      }
      const charmed = await until(() => ghoul.effects.find(e => e.statuses?.has("charmed")), "the ghoul Charmed by its failure", 20000);
      assert.equal(charmed.getFlag("azeroth-rpg", THRALL_FLAG)?.ownerUuid, ranger.uuid, "the Charmed does not name the ranger");
      await until(() => ghoul.getFlag("azeroth-rpg", "bond")?.kind === THRALL_KIND, "the ghoul bound as a thrall");
      assert.equal(ghoul.getFlag("azeroth-rpg", "bond").ownerUuid, ranger.uuid, "the thrall's bond does not name the ranger");
      await until(() => tokenOf(ghoul)?.document?.disposition === tokenOf(ranger).document.disposition, "the thrall on the ranger's side");
    });
  });
}
