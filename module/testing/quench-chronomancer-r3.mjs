/**
 * **STAGE R3: THE LEAD'S RULINGS ON O-301, O-303 AND STAGE R's QUESTIONS, THROUGH THE REAL CONTROLS**
 * (the lead, 2026-11-10: *"o301 - each target needs to be rolled against it's defense or make it's
 * own resilence test if relevant."*, *"303 - end it however the creature is freed of the effect"*,
 * *"touch is 5 feet.  pummel requires melee. timed areas, yes.  old feature refusals you can
 * address how it makes sense within the system"*).
 *
 * Two batches, each run alone with `QUENCH_BATCH`:
 *
 * - `azeroth-rpg.chronomancer-r3-held` (O-303): Sand Prison's Sustain ends when its last creature
 *   is freed by ANY route - a GM's hand on the conditions (and never while one is left), the
 *   creature's token deleted, the creature falling to 0 Health - and a Dispel of the Decay alone
 *   leaves it standing (O-308's Dispel of the Sustain itself is `azeroth-rpg.stage6`).
 * - `azeroth-rpg.chronomancer-r3` (O-301, Pummel, O-298, the old feature refusals): every target of
 *   a multi-target spell judged on its own number from one die; Pummel refused out of melee reach;
 *   a timed area placed in a fight outliving it on the world's clock; the range door's words
 *   where a Chronomancer refusal said the same thing a second time.
 *
 * Every document a test makes is deleted in `after`.
 */

import { made, makeCharacter, makeNpc, openSheet, pinDie, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import {
  chooser, chronoInFight, featureNamed, freshTurn, manaOf, nextTurnUntil, pick, pressUse, sandOf, sceneWith, textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import {
  AT, FT, east, frame, live, flagsOf, sleep, resistRow, sustainOf, stepTurn, decayOf, buttonsOn, placeFrom, press, declineOpenAsk
} from "./quench-chronomancer-sweep-t12.mjs";

/** The t12 kit's sweep stand-in: a fault is the test's failure. */
const strictSw = () => ({ log: () => {}, check: ok => ok, fail: (what, err) => { throw new Error(`${what}: ${err?.message ?? err}`); }, wait: (fn, what, ms) => until(fn, what, ms) });
import { castFromSheet } from "./quench-chronomancer-common.mjs";

/** The caster's Mana back to full. */
async function fill(c) {
  const mana = manaOf(c);
  if (mana && mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  await until(() => manaOf(c)?.value === manaOf(c)?.max, "the Mana full");
}

/** What `ui.notifications.info` said while `fn` ran, and for `ms` after. */
async function infosDuring(fn, ms = 0) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const held = ui.notifications.info;
  const said = [];
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return held.apply(ui.notifications, args); };
  try {
    await fn();
    if (ms) await sleep(ms);
  } finally {
    if (own) ui.notifications.info = held;
    else delete ui.notifications.info;
  }
  return said;
}

/** Cast Sand Prison from the sheet at a creature's token and fail its Reflex Test from the card. */
async function prison(c, foe) {
  await fill(c);
  await freshTurn(c, 2);
  const card = await castFromSheet(c, "Sand Prison", { targets: [foe.doc.object], face: 18 });
  if (!card) throw new Error("Sand Prison posted no card");
  const sw = { fail: (what, err) => { throw new Error(`${what}: ${err?.message ?? err}`); }, wait: (fn, what, ms) => until(fn, what, ms) };
  const r = await resistRow(sw, card, 0, 1);
  if (r?.success !== false) throw new Error("the Reflex Test did not fail");
  await until(() => foe.actor.statuses.has("entangled") && foe.actor.statuses.has("blinded"), "Entangled and Blinded laid");
  await until(() => foe.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.holds === true).length === 2, "both conditions marked as holding the creature");
  return card;
}

const conditionEffect = (actor, id) => actor.effects.find(e => e.statuses?.has(id) && e.flags?.["azeroth-rpg"]?.sustained === true) ?? null;

/* -------------------------------------------- */
/*  O-303: a held Sustain ends however the       */
/*  creature is freed                            */
/* -------------------------------------------- */

export function chronomancerR3HeldBatch(context) {
  const { describe, it, assert } = context;

  describe("O-303: a held Sustain ends however its last creature is freed (the lead: *\"303 - end it however the creature is freed of the effect\"*)", function () {
    frame(context);

    it("a GM's hand: the Sustain stands while one of the conditions is left, ends once both are deleted, is ended once, and pays no more upkeep", async function () {
      this.timeout(600000);
      const { c, combat, foes } = await chronoInFight("ZZ R3 Held Hand", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      await prison(c, raptor);
      assert.ok(sustainOf(c, spell), "the caster sustains Sand Prison");
      // One of the two deleted by hand: still Blinded, so still held.
      await raptor.actor.deleteEmbeddedDocuments("ActiveEffect", [conditionEffect(raptor.actor, "entangled").id]);
      await until(() => !raptor.actor.statuses.has("entangled"), "the Entangled deleted by hand");
      await sleep(2500);
      assert.ok(sustainOf(c, spell), "the Sustain stands while the creature is still Blinded by the cast");
      // The other: nobody is held, and the Sustain ends - once.
      const said = await infosDuring(async () => {
        await raptor.actor.deleteEmbeddedDocuments("ActiveEffect", [conditionEffect(raptor.actor, "blinded").id]);
        await until(() => !sustainOf(c, spell), "O-303: the Sustain ends once the creature carries none of the cast's conditions", 20000);
      }, 2500);
      const notice = game.i18n.format("AZEROTH.Escape.SustainLeftNotice", { name: c.name, spell: "Sand Prison" });
      assert.equal(said.filter(s => s === notice).length, 1, `the Sustain was ended exactly once: ${JSON.stringify(said)}`);
      assert.isFalse((c.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.name === "Sand Prison"), "no Sand Prison entry is left on the caster");
      // No upkeep at the caster's next turn start.
      const manaThen = manaOf(c).value;
      if (combat.combatant?.id === combat.getCombatantsByActor(c)[0]?.id) await stepTurn(combat);
      await nextTurnUntil(c, combat);
      await sleep(2000);
      assert.equal(manaOf(c).value, manaThen, "no upkeep once the Sustain has ended");
    });

    it("the creature's token deleted from the scene frees it, and the Sustain ends", async function () {
      this.timeout(600000);
      const { c, foes } = await chronoInFight("ZZ R3 Held Token", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      await prison(c, raptor);
      assert.ok(sustainOf(c, spell), "the caster sustains Sand Prison");
      await raptor.doc.delete();
      await until(() => !sustainOf(c, spell), "O-303: the Sustain ends once the held creature's token is gone", 20000);
    });

    it("the creature falling to 0 Health frees it, and the Sustain ends", async function () {
      this.timeout(600000);
      const { c, foes } = await chronoInFight("ZZ R3 Held Fall", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      await prison(c, raptor);
      await raptor.actor.update({ "system.health.value": 0 });
      await until(() => !sustainOf(c, spell), "O-303: the Sustain ends once the held creature is at 0 Health", 20000);
    });

    it("a passed escape ends only the cast's own Blinded: a Flash Powder's Blinded survives it (stage 11, D-906)", async function () {
      this.timeout(600000);
      const { c, combat, foes } = await chronoInFight("ZZ R3 Held Powder", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      await prison(c, raptor);
      // A Blinded the cast did not lay (a thrown Flash Powder), its own effect with no cast on it.
      const [powder] = await raptor.actor.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Flash Powder", img: "icons/svg/blind.svg", statuses: ["blinded"] }]);
      await until(() => raptor.actor.effects.has(powder.id), "the Flash Powder's Blinded laid");
      const held = conditionEffect(raptor.actor, "entangled");
      assert.ok(held?.flags?.["azeroth-rpg"]?.escape, "the Entangled carries the repeat Test");
      // The end of the Raptor's turn posts the repeat Test; a pass leaves the spell.
      const prompt = untilHook("createChatMessage", 60000, m => /data-purpose="escape"/.test(m.content ?? "") && (m.content ?? "").includes(held.id))
        .then(([m]) => { made.push(m); return m; }).catch(() => null);
      const rTurn = combat.combatants.find(x => x.tokenId === raptor.doc.id);
      await nextTurnUntil(rTurn, combat);
      await stepTurn(combat);
      const card = await prompt;
      assert.ok(card, "the end of its turn posted the repeat Test");
      const p = await press(strictSw(), card, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 20 });
      await until(() => { declineOpenAsk(); return !raptor.actor.statuses.has("entangled") && !conditionEffect(raptor.actor, "blinded"); }, "the pass ends the cast's Entangled and Blinded", 30000);
      if (p) await p.release();
      await sleep(1500);
      assert.isTrue(raptor.actor.effects.has(powder.id), "the Flash Powder's Blinded is still on the Raptor");
      assert.isTrue(raptor.actor.statuses.has("blinded"), "and the Raptor is still Blinded by it");
      await until(() => !sustainOf(c, spell), "the last creature out ends the Sustain", 20000);
    });

    it("the creature's scene deleted frees it, and the Sustain ends (stage 11, D-906: core fires no deleteToken for a deleted scene)", async function () {
      this.timeout(600000);
      const { c, combat, scene, foes } = await chronoInFight("ZZ R3 Held Scene", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      await prison(c, raptor);
      // The fight first, so nothing of it is left to write on the scene's tokens; leaving it ends
      // no Sustain.
      await combat.delete();
      await sleep(2500);
      assert.ok(sustainOf(c, spell), "the Sustain stands once the fight is over");
      let deletedTokens = 0;
      const counter = Hooks.on("deleteToken", () => { deletedTokens++; });
      try {
        await scene.delete();
        await until(() => !sustainOf(c, spell), "the Sustain ends once the held creature's scene is gone", 20000);
        assert.equal(deletedTokens, 0, "core fired no deleteToken: the deleteScene hook is what freed it");
      } finally {
        Hooks.off("deleteToken", counter);
      }
    });

    it("Dispel of the Decay alone leaves the Sustain standing: only the Sustain's own row ends it (O-308, `azeroth-rpg.stage6`)", async function () {
      this.timeout(600000);
      const { c, scene, foes } = await chronoInFight("ZZ R3 Held Dispel", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      const priest = await makeCharacter({ name: "ZZ R3 Held Priest", classes: [["Priest", 5]], abilities: { wis: 16 } });
      await priest.update({ "prototypeToken.actorLink": true });
      await scene.createEmbeddedDocuments("Token", [await tokenData(priest, { x: AT.x + 40 * FT, y: AT.y + 200, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })]);
      await until(() => tokenDrawn(tokenOf(priest)), "the priest's token drawn");
      await prison(c, raptor);
      const decay = await until(() => decayOf(raptor.actor), "Sand Prison's Decay 1");
      const pm = priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
      if (pm) await priest.updatePool({ itemId: pm.itemId, kind: "power", value: pm.max });
      const { feature, card } = await pressUse(priest, "Dispel", [raptor.doc.object], 18);
      const app = await chooser(feature);
      const text = app.element.textContent.replace(/\s+/g, " ");
      // O-308 (the lead: *"308 - sustained spells are ended by dispel, so Sand Prison would be stopped."*):
      // the held creature's conditions are listed as the Sustain, not greyed as conditions.
      assert.include(text, game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Sand Prison", caster: c.name, held: raptor.doc.name }), "the chooser lists the Sustain");
      await pick(app, decay.name);
      await card;
      await until(() => !decayOf(raptor.actor), "the Dispel ended the Decay it was given");
      await sleep(2500);
      assert.ok(sustainOf(c, spell), "the Sustain stands: the Decay alone was selected");
      assert.isTrue(raptor.actor.statuses.has("entangled") && raptor.actor.statuses.has("blinded"), "the creature is still held");
    });
  });
}

/* -------------------------------------------- */
/*  O-301, Pummel, O-298 and the old refusals    */
/* -------------------------------------------- */

/** Press a feature's Use on the sheet expecting a refusal: what was warned, and whether a card posted. */
async function refusedUse(actor, featureName, targets = [], ms = 2500) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
    ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) { await sheet.close(); canvas.tokens?.setTargets([]); throw new Error(`the sheet draws no Use for ${featureName}`); }
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  let posted = null;
  const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === actor.id) { posted = m; made.push(m); } });
  try {
    const said = await warnings(async () => { control.click(); await sleep(ms); });
    return { said, card: posted };
  } finally {
    Hooks.off("createChatMessage", hook);
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Cast from the sheet through the OPEN dialog: read the DC row and the per-target list, tick lines, press Roll. */
async function castThroughDialog(actor, spellName, { targets = [], face = 15, ticks = () => [] } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    const dialog = await until(() => {
      const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
      return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
    }, `${spellName}'s roll dialog`);
    // O-307: one labelled field per target - its name, its number and the reason beside it.
    const read = {
      dcInput: dialog.element.querySelector('input[name="dc"]')?.value ?? null,
      each: [...dialog.element.querySelectorAll(".azeroth-dialog-each-row")].map(li => [
        li.querySelector("label")?.textContent?.trim() ?? "", Number(li.querySelector("input")?.value),
        li.querySelector(".azeroth-dialog-note")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
      ])
    };
    for (const box of [...dialog.element.querySelectorAll('input[name^="tline-"]')]) {
      if (ticks(box.name.slice(6)) && !box.disabled) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    dialog.element.querySelector('button[data-action="roll"]').click();
    return { read, card: await posted };
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** A sweep stand-in the t12 kit's press helpers take: a throw is the test's failure. */
const strict = () => ({
  log: () => {}, check: ok => ok,
  fail: (what, err) => { throw new Error(`${what}: ${err?.message ?? err}`); },
  wait: (fn, what, ms) => until(fn, what, ms)
});

export function chronomancerR3Batch(context) {
  const { describe, it, assert } = context;

  describe("Stage R3: each target on its own number, Pummel in melee, timed areas past the fight, the range door's words", function () {
    frame(context);

    /* ---- O-301 ------------------------------------------------------------ */

    it("O-301: Stasis at a willing ally, a hostile Raptor and a hostile creature in no fight rolls once, reads the total against each number, and only the targets it beat take a Test", async function () {
      this.timeout(600000);
      const { c, scene, foes, friends } = await chronoInFight("ZZ R3 Each", {
        level: 20, ranks: { "Stasis Lore": 1 }, sand: 8, spells: ["Sand Blast"],
        enemies: [{ name: "Raptor", x: AT.x + 25 * FT, y: AT.y + 200, health: 200 }],
        allies: [{ name: "ZZ R3 Each Ally", x: AT.x + 15 * FT, y: AT.y }]
      });
      const [raptor] = foes;
      const [ally] = friends;
      // A HOSTILE creature on the board and in no fight: not willing, so its Defense. This was a
      // NEUTRAL creature until the lead's call on O-300 (2026-11-11: *"300 - neutral can be
      // willing"*, D-900): a NEUTRAL one is willing now and would give 10 + 2 a tier.
      const strangerBase = await makeNpc("Raptor");
      await strangerBase.update({ "system.defense": 20 });
      const [strangerDoc] = await scene.createEmbeddedDocuments("Token", [await tokenData(strangerBase, { x: AT.x + 20 * FT, y: AT.y - 200, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
      await until(() => tokenDrawn(strangerDoc.object), "the hostile creature's token drawn");
      await until(() => c.items.find(i => i.type === "spell" && i.name === "Stasis"), "Stasis learned", 30000);
      const raptorDefense = Number(raptor.actor.system.defense);
      assert.notEqual(raptorDefense, 18, "the Raptor's Defense differs from the tier's number");
      const mod = Number(c.system.abilities.int.mod) + Number(c.system.proficiency);
      const face = 18 - mod;
      assert.isTrue(face >= 2 && face <= 19, `a die face lands the total on 18 (modifier ${mod})`);
      await freshTurn(c, 1);
      const sandBefore = sandOf(c).value;
      const manaBefore = manaOf(c).value;
      const targets = [ally.getActiveTokens(true)[0], raptor.doc.object, strangerDoc.object];
      const { read, card } = await castThroughDialog(c, "Stasis", { targets, face, ticks: id => id.startsWith("sand-") });
      // The dialog: no single DC to type, a field per target with its own number (O-307).
      assert.isNull(read.dcInput, "with several targets the dialog draws no single DC");
      assert.deepEqual(read.each, [
        [targets[0].name, 18, game.i18n.format("AZEROTH.Dialog.DC.EachWilling", { name: targets[0].name, dc: 18 })],
        [targets[1].name, raptorDefense, game.i18n.format("AZEROTH.Dialog.DC.EachDefense", { name: targets[1].name, dc: raptorDefense })],
        [targets[2].name, 20, game.i18n.format("AZEROTH.Dialog.DC.EachDefense", { name: targets[2].name, dc: 20 })]
      ], "the dialog draws a field for each target, its own number in it");
      assert.ok(card, "the cast posted a card");
      const f = flagsOf(card);
      const total = Number(live(card).rolls[0].total);
      assert.equal(total, 18, "one roll, total 18");
      assert.isTrue(f.success, "the Test went off: it beat at least one number");
      assert.equal(Number(live(card).rolls[0].options.dc), raptorDefense, "the roll carries the lowest number");
      // Each target's verdict, on the card and in its record.
      assert.deepEqual(f.eachTarget.map(r => [r.name, r.dc, r.success]), [[targets[0].name, 18, true], [targets[1].name, raptorDefense, true], [targets[2].name, 20, false]]);
      const text = textOf(live(card));
      assert.include(text, game.i18n.format("AZEROTH.Cast.EachTarget.HitWilling", { sl: 0, total: 18, dc: 18 }), "the ally's hit, its own SL 0");
      assert.include(text, game.i18n.format("AZEROTH.Cast.EachTarget.HitDefense", { sl: Math.floor((18 - raptorDefense) / 5), total: 18, dc: raptorDefense }), "the Raptor's hit at its own SL");
      assert.include(text, game.i18n.format("AZEROTH.Cast.EachTarget.MissDefense", { total: 18, dc: 20 }), "the hostile creature's miss, in words");
      // The missed target is off the card's targets (what the Resist rows, the Apply and the animation record read).
      assert.deepEqual(f.targets.map(t => t.tokenId), [targets[0].id, targets[1].id], "only the targets the Test beat are recorded");
      assert.deepEqual(f.slByTarget, [0, Math.floor((18 - raptorDefense) / 5)], "each target's own SL is recorded");
      const resistButtons = buttonsOn(card).filter(b => b.action === "resistTest");
      assert.equal(resistButtons.length, 2, "two Resist rows: the missed creature makes no Test");
      // Paid once: 5 Sand, no Mana.
      await until(() => sandOf(c).value === sandBefore - 5, "5 Sand paid, once");
      assert.equal(manaOf(c).value, manaBefore, "no Mana");
      // Each makes ITS OWN Test: the Raptor fails, the ally passes, each recorded on its own row.
      const sw = strict();
      const rRaptor = await resistRow(sw, card, 1, 1);
      const rAlly = await resistRow(sw, card, 0, 20);
      assert.isFalse(rRaptor?.success, "the Raptor's own Test failed");
      assert.isTrue(rAlly?.success, "the ally's own Test passed");
      const resists = flagsOf(card).resists ?? {};
      assert.isFalse(Object.hasOwn(resists, strangerDoc.id), "nothing recorded for the missed creature");
      // The single-target cast keeps its one DC: Sand Blast at the Raptor shows the Raptor's Defense to type.
      await freshTurn(c, 2);
      const single = await castThroughDialog(c, "Sand Blast", { targets: [raptor.doc.object], face: 15 });
      assert.equal(Number(single.read.dcInput), raptorDefense, "one target: one DC, the Raptor's Defense");
      assert.deepEqual(single.read.each, [], "and no per-target list");
    });

    /* ---- O-300 ------------------------------------------------------------ */

    it("O-300: a NEUTRAL creature is willing, in the fight and out of it: Sand Blast's dialog reads 10 + 2 a tier at it and the Raptor's Defense at the Raptor, and Suspend holds it at once with no Test", async function () {
      // **THE LEAD'S CALL** (O-300, 2026-11-11: *"300 - neutral can be willing"*; D-900).
      this.timeout(600000);
      const { c, scene, combat, foes } = await chronoInFight("ZZ R3 Neutral", {
        level: 20, sand: 8, spells: ["Sand Blast"],
        enemies: [{ name: "Raptor", x: AT.x + 25 * FT, y: AT.y + 200, health: 200 }]
      });
      const [raptor] = foes;
      // A Defense apart from Sand Blast's tier number (12), so the two readings cannot coincide.
      await raptor.actor.update({ "system.defense": 15 });
      await until(() => Number(raptor.actor.system.defense) === 15, "the Raptor's Defense 15");
      // One NEUTRAL creature in the fight (the tracker puts it on a side) and one in no fight.
      const inBase = await makeNpc("Raptor");
      await inBase.update({ "system.defense": 20, "system.health.value": 200, "system.health.max": 200 });
      const outBase = await makeNpc("Raptor");
      await outBase.update({ "system.defense": 20 });
      const [inDoc, outDoc] = await scene.createEmbeddedDocuments("Token", [
        await tokenData(inBase, { x: AT.x + 15 * FT, y: AT.y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL }),
        await tokenData(outBase, { x: AT.x + 15 * FT, y: AT.y - 200, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL })
      ]);
      await until(() => tokenDrawn(inDoc.object) && tokenDrawn(outDoc.object), "the neutral creatures' tokens drawn");
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: inBase.id, sceneId: scene.id, tokenId: inDoc.id }]);
      await until(() => combat.combatants.find(x => x.tokenId === inDoc.id), "the neutral creature in the fight");
      const blast = c.items.find(i => i.type === "spell" && i.name === "Sand Blast");
      const tierDc = 10 + 2 * Number(blast.system.tier);
      const raptorDefense = Number(raptor.actor.system.defense);
      assert.notEqual(raptorDefense, tierDc, "the Raptor's Defense differs from the tier's number");
      // Single target, in the fight: the tier's number, not its Defense 20.
      await fill(c);
      await freshTurn(c, 2);
      const atIn = await castThroughDialog(c, "Sand Blast", { targets: [inDoc.object], face: 15 });
      assert.equal(Number(atIn.read.dcInput), tierDc, "a NEUTRAL creature in the fight: 10 + 2 a tier");
      // Single target, out of any fight: the tier's number.
      await fill(c);
      await freshTurn(c, 2);
      const atOut = await castThroughDialog(c, "Sand Blast", { targets: [outDoc.object], face: 15 });
      assert.equal(Number(atOut.read.dcInput), tierDc, "a NEUTRAL creature in no fight: 10 + 2 a tier");
      // The HOSTILE Raptor still gives its Defense.
      await fill(c);
      await freshTurn(c, 2);
      const atRaptor = await castThroughDialog(c, "Sand Blast", { targets: [raptor.doc.object], face: 15 });
      assert.equal(Number(atRaptor.read.dcInput), raptorDefense, "a HOSTILE creature: its Defense");
      // Suspend at the NEUTRAL creature in the fight: willing, held at once, no Test offered.
      await fill(c);
      await freshTurn(c, 2);
      const used = await pressUse(c, "Suspend", [inDoc.object], 15);
      const card = await used.card;
      assert.ok(card, "Suspend at a NEUTRAL creature posted a card (no NotWilling refusal)");
      await until(() => inDoc.actor?.statuses?.has("stunned"), "the NEUTRAL creature held at once");
      assert.isFalse(buttonsOn(card).some(b => b.action === "resistTest"), "no Spirit Test offered to a willing creature");
    });

    /* ---- Pummel ------------------------------------------------------------ */

    it("Pummel requires melee: a creature 5 feet off is Pummelled, 10 feet off is refused in words with nothing spent, and a Reach weapon takes it at 10", async function () {
      this.timeout(300000);
      const warrior = await makeCharacter({ name: "ZZ R3 Pummel", classes: [["Warrior", 3]], weapons: ["Longsword", "Halberd"] });
      const caster = await makeNpc("Raptor");
      await sceneWith([{ actor: warrior, ...AT }, { actor: caster, ...east(10), side: "hostile" }]);
      const sword = warrior.items.find(i => i.name === "Longsword");
      const halberd = warrior.items.find(i => i.name === "Halberd");
      await halberd.update({ "system.equipped": false });
      await sword.update({ "system.equipped": true });
      await until(() => warrior.readyWeapons().some(w => w.id === sword.id) && !warrior.readyWeapons().some(w => w.id === halberd.id), "the sword in hand, the halberd put away");
      const casterToken = tokenOf(caster);
      // 10 feet, a sword: refused, in melee's words.
      const far = await refusedUse(warrior, "Pummel", [casterToken]);
      assert.isNull(far.card, "no card: nothing was spent");
      assert.include(far.said.join(" "), game.i18n.format("AZEROTH.Range.RefusedMelee", { target: casterToken.name, distance: "10", name: "Pummel", feet: 5 }), `refused in words: ${JSON.stringify(far.said)}`);
      // A Reach weapon: 10 feet is inside the reach.
      await sword.update({ "system.equipped": false });
      await halberd.update({ "system.equipped": true });
      await until(() => warrior.readyWeapons().some(w => w.id === halberd.id), "the halberd in hand");
      const { card: reached } = await pressUse(warrior, "Pummel", [casterToken], 15);
      assert.ok(await reached, "with a Reach weapon the creature 10 feet off is Pummelled");
      // 5 feet, the sword: Pummelled.
      await halberd.update({ "system.equipped": false });
      await sword.update({ "system.equipped": true });
      await casterToken.document.move({ x: AT.x + 5 * FT, y: AT.y, action: "displace" });
      await until(() => casterToken.document.x === AT.x + 5 * FT, "the creature 5 feet off");
      const { card: near } = await pressUse(warrior, "Pummel", [casterToken], 15);
      assert.ok(await near, "a creature 5 feet off is Pummelled");
    });

    /* ---- O-298 ------------------------------------------------------------- */

    it("O-298: Dune Collapse placed in round 2 of a fight that ends in round 3 still stands, runs out on the world's clock, and is deleted once", async function () {
      this.timeout(600000);
      const { c, combat, scene } = await chronoInFight("ZZ R3 Dune", { level: 11, spells: ["Dune Collapse"], enemies: [{ name: "Raptor", x: AT.x + 40 * FT, y: AT.y + 400, health: 300 }] });
      // To the caster's turn in round 2.
      for (let i = 0; i < 8 && !(combat.round === 2 && combat.combatant?.actor?.id === c.id); i++) await stepTurn(combat);
      assert.equal(combat.round, 2, "round 2");
      await fill(c);
      const card = await castFromSheet(c, "Dune Collapse", { face: 18 });
      assert.ok(card, "the cast posted a card");
      const region = await placeFrom(strict(), card, { x: AT.x + 30 * FT, y: AT.y - 400 });
      assert.ok(region, "the area placed");
      const placedAt = region.flags["azeroth-rpg"].placedAt;
      assert.equal(placedAt.round, 2, "placed in round 2");
      // Round 3, then the fight ends.
      for (let i = 0; i < 8 && combat.round < 3; i++) await stepTurn(combat);
      assert.equal(combat.round, 3, "round 3");
      let deletes = 0;
      const counter = Hooks.on("deleteRegion", r => { if (r.id === region.id) deletes++; });
      try {
        await combat.delete();
        await sleep(2500);
        assert.isTrue(scene.regions.has(region.id), "O-298: the area outlives its fight");
        // The world's clock: the minute is counted from the time it went down, the fight's round included.
        const left = placedAt.time + 60 - game.time.worldTime;
        assert.isTrue(left > 0 && left <= 54, `the fight's round already ran six seconds of the minute (left ${left})`);
        await game.time.advance(left - 1);
        await sleep(2500);
        assert.isTrue(scene.regions.has(region.id), "a second short of the minute it still stands");
        await game.time.advance(1);
        await until(() => !scene.regions.has(region.id), "O-298: at the minute it is taken off", 20000);
        await sleep(2000);
        assert.equal(deletes, 1, "deleted once");
      } finally {
        Hooks.off("deleteRegion", counter);
      }
    });

    /* ---- the old feature refusals -------------------------------------------- */

    it("the range door's words, and nothing spent, where a Chronomancer refusal said the same thing a second time", async function () {
      this.timeout(900000);
      const { c, combat, foes, friends } = await chronoInFight("ZZ R3 Words", {
        level: 20, sand: 8,
        ranks: { "Gift of Moments": 1, "Quickstep": 1, "Second Chance": 1, "Echo of Power": 1, "Suspended Moment": 1, "Recovered Hours": 1 },
        enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y + 200, health: 200 }],
        allies: [{ name: "ZZ R3 Words Ally", x: AT.x + 40 * FT, y: AT.y }]
      });
      const [raptor] = foes;
      const allyToken = friends[0].getActiveTokens(true)[0];
      const far = name => game.i18n.format("AZEROTH.Range.Refused", { target: allyToken.name, distance: "40", name, feet: 30 });
      const check = async (feature, targets, words) => {
        const mana = manaOf(c).value;
        const sand = sandOf(c).value;
        const r = await refusedUse(c, feature, targets);
        assert.isNull(r.card, `${feature}: no card`);
        assert.include(r.said.join(" | "), words, `${feature}: ${JSON.stringify(r.said)}`);
        assert.equal(manaOf(c).value, mana, `${feature}: no Mana spent`);
        assert.equal(sandOf(c).value, sand, `${feature}: no Sand spent`);
      };
      // Slipstream: 40 feet, the Chronomancer itself, a hostile Raptor.
      await check("Slipstream", [allyToken], far("Slipstream"));
      await check("Slipstream", [tokenOf(c)], game.i18n.format("AZEROTH.Range.NotSelf", { name: "Slipstream" }));
      await check("Slipstream", [raptor.doc.object], game.i18n.format("AZEROTH.Range.NotWilling", { target: raptor.doc.name, name: "Slipstream" }));
      await check("Suspend", [allyToken], far("Suspend"));
      for (const talent of ["Gift of Moments", "Quickstep", "Second Chance", "Echo of Power", "Suspended Moment", "Recovered Hours"]) {
        await check(talent, [allyToken], far(talent));
      }
      // Master of Hours' gift, once it runs: the 30 feet is the door's.
      await fill(c);
      await freshTurn(c, 1);
      const { card: master } = await pressUse(c, "Master of Hours", [], 15);
      assert.ok(await master, "Master of Hours runs");
      await check("Master of Hours", [allyToken], far("Master of Hours"));
      void combat;
    });
  });
}
