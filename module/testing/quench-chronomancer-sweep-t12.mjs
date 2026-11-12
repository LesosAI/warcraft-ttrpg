/**
 * **THE CHRONOMANCER SWEEP, STAGE 2: THE NINETEEN TIER 1 AND 2 SAND SPELLS, PLAYED LIKE A
 * PLAYER** (the lead's play-test, 2026-11-10: *"I need you to go through and test all
 * features and spells, there are too many issues I quickly found."*).
 *
 * The batches before drove the doors by direct calls on one actor, and the lead's faults sat
 * BETWEEN doors. Every test here plays one spell at the table's pace, in a started fight with
 * tokens on a viewed scene, through the controls a player presses: the sheet's own Cast, the
 * roll dialog, the card's own buttons as the chat log draws them (Resist, Apply, Place area,
 * Apply effect), a creature's own Attack on its sheet, the Spells tab's End Sustain and the
 * tracker's Next Turn. After every press it reads the WORLD - Health, Armor Points and Decay,
 * conditions, token positions, Regions, effects and their spans, the pools and the budget -
 * against 07 §12's words, and the turns that follow: a tick at a turn's start, a Sustain's
 * upkeep, a deferred half, a delayed heal, an expiry at the right boundary.
 *
 * **A SOFT CHECK A STEP**: every check is written to the run's progress file as a `SWEEP`
 * line (`console.debug("[quench-progress] ...")`, which the smoke spec copies there) and a
 * failed one is collected, so one run reports every fault a spell has rather than its first.
 * A test fails at its end, naming them all.
 *
 * Two batches, so each runs under twelve minutes: `azeroth-rpg.chronomancer-sweep-t12`
 * (tier 1, ten spells) and `azeroth-rpg.chronomancer-sweep-t12-tier2` (tier 2, nine). Run each
 * alone with `QUENCH_BATCH`. Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, give, made, openSheet, pinDie, settle, untilHook, warnings, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import {
  boardRead, castFromSheet, chronoInFight, freshTurn, halvesOf, manaOf, nextTurnUntil, pressCard, sandOf, textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";

/* -------------------------------------------- */
/*  The sweep's own helpers                      */
/* -------------------------------------------- */

const live = message => game.messages.get(message?.id ?? message);
const flagsOf = message => live(message)?.flags?.["azeroth-rpg"] ?? {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = v => { try { return JSON.stringify(v); } catch { return String(v); } };
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;
const decayOf = actor => actor?.effects?.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]) ?? null;
const decayValue = actor => Number(decayOf(actor)?.flags?.["azeroth-rpg"]?.[DECAY_FLAG]?.value) || 0;
const combatantOfToken = (combat, doc) => combat.combatants.find(x => x.tokenId === doc.id) ?? null;
const statusesOf = actor => [...(actor?.statuses ?? [])].sort();
const spanOf = effect => {
  const d = effect?.duration ?? {};
  return { value: d.value ?? null, units: d.units ?? null, seconds: d.seconds ?? null, rounds: d.rounds ?? null, turns: d.turns ?? null, expiry: d.expiry ?? null };
};

/** Whether an effect's span is N of the fight's rounds, ending at a turn's end (`durations.mjs#minuteSpan`). */
const fightRoundsSpan = (effect, n) => spanOf(effect).units === "rounds" && spanOf(effect).value === n && spanOf(effect).expiry === "turnEnd";

/** Whether an effect's span is N minutes of the world's clock (out of a fight). */
const clockMinutes = (effect, n) => (spanOf(effect).units === "minutes" && spanOf(effect).value === n) || (spanOf(effect).units === "seconds" && spanOf(effect).value === n * 60);

/** Every board press a pick waits for: a pointerdown on the board at a canvas point. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Answer an open Reaction ask (Another Timeline's) with no, if one is open now. */
function declineOpenAsk() {
  const app = [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask"));
  app?.element?.querySelector('button[data-action="no"]')?.click();
  return Boolean(app);
}

/**
 * The sweep's record for one spell: soft checks, each written to the progress file, the
 * failures collected and asserted at the end; a console watch for errors and deprecations.
 */
function sweep(spell, assert) {
  const failures = [];
  const log = (step, data) => console.debug(`[quench-progress] SWEEP ${spell} | ${step} | ${json(data)}`.slice(0, 4000));
  const errors = [];
  const heldError = console.error;
  const heldWarn = console.warn;
  console.error = (...args) => { errors.push(args.map(a => a?.stack ?? a?.message ?? String(a)).join(" ").slice(0, 600)); return heldError.apply(console, args); };
  console.warn = (...args) => {
    const text = args.map(a => `${a?.message ?? String(a)} ${a?.stack ?? ""}`).join(" ");
    const ours = /systems\/azeroth-rpg\/module\//.test(text) && !/quench/i.test(text.split("systems/azeroth-rpg/module/")[0] ?? "");
    if (/deprecat/i.test(text) && ours) errors.push(`deprecation: ${text.slice(0, 600)}`);
    return heldWarn.apply(console, args);
  };
  return {
    log,
    check(ok, what, data) {
      log(ok ? "ok" : "FAIL", data === undefined ? { what } : { what, data });
      if (!ok) failures.push(data === undefined ? what : `${what} [${json(data).slice(0, 600)}]`);
      return Boolean(ok);
    },
    async wait(fn, what, ms = 20000) {
      try { const v = await until(fn, what, ms); log("ok", { what }); return v; } catch {
        failures.push(`timed out: ${what}`);
        log("FAIL", { what: `timed out: ${what}` });
        return null;
      }
    },
    fail(what, err) {
      failures.push(`${what}: ${err?.message ?? err}`);
      log("THREW", { what, error: String(err?.stack ?? err).slice(0, 1500) });
    },
    finish() {
      console.error = heldError;
      console.warn = heldWarn;
      if (errors.length) failures.push(`the console took ${errors.length} error(s): ${errors.slice(0, 3).join(" || ")}`);
      log("END", { failures });
      assert.deepEqual(failures, [], `${spell}: ${failures.length} fault(s)`);
    }
  };
}

/** Run a test body under the sweep, so a throw is one more recorded fault. */
async function sweepTest(spell, assert, body) {
  const sw = sweep(spell, assert);
  try { await body(sw); } catch (err) { sw.fail("the test threw", err); }
  sw.finish();
}

/** The recorder the animation director plays into, in place of the real player. */
let recorder = null;
let previousPlayer = null;

/** Whether the animation layer was told of this card: a cue played, or the law's refusal, for its cast. */
function animationOf(card) {
  const f = flagsOf(card);
  const same = r => r && (r.cast ? r.cast === f.cast : r.identifier === f.identifier);
  const cue = recorder?.cues?.find(c => same(c.record)) ?? null;
  const skip = recorder?.skips?.find(s => same(s.record)) ?? null;
  return cue ? { cue: true, steps: cue.steps?.length ?? 0 } : skip ? { skip: skip.skip } : null;
}

/** Check the animation record for a cast: a success plays (or the screen says why not), a failure plays nothing. */
async function checkAnimation(sw, card, success) {
  const seen = await sw.wait(() => animationOf(card), `the animation layer told of ${flagsOf(card).identifier}'s card`, 8000);
  if (!seen) return;
  if (success) sw.check(seen.cue || String(seen.skip).startsWith("unavailable:"), "a successful cast plays a cue", seen);
  else sw.check(!seen.cue, "a failed cast plays nothing", seen);
}

/** The world as the sweep records it, logged. */
function readBoard(sw, step, actors) {
  const read = boardRead({ actors });
  sw.log(`board: ${step}`, read);
  return read;
}

/** Mana, Sand and the turn budget of a caster now. */
function pools(actor) {
  const combat = actor.activeFight?.() ?? game.combat;
  const mine = combat?.getCombatantsByActor?.(actor)?.[0] ?? null;
  return { mana: manaOf(actor)?.value ?? null, sand: sandOf(actor)?.value ?? null, halves: mine?.budget?.halfActions ?? null, reactions: mine?.budget?.reactions ?? null };
}

/** The Sand a card says the cast gained, read off its provenance (02 §7's gain). */
const sandClaimed = card => (live(card)?.rolls?.[0]?.options?.provenance ?? []).reduce((n, p) => n + (Number(/(\d+) Sand gained/.exec(String(p.formula ?? ""))?.[1]) || 0), 0);

/** Check what a successful cast paid: its Mana, its Half-Actions, and the Sand its card says. */
async function checkPaid(sw, actor, spell, before, card) {
  const want = Number(spell.system.mana) || 0;
  await sw.wait(() => manaOf(actor)?.value === before.mana - want, `${spell.name} paid ${want} Mana (${before.mana} before)`);
  const halves = halvesOf(spell);
  if (halves) sw.check(pools(actor).halves === before.halves - halves, `${spell.name} spent ${halves} Half-Action(s)`, { before: before.halves, now: pools(actor).halves });
  const gained = sandClaimed(card);
  await sw.wait(() => (sandOf(actor)?.value ?? 0) === Math.min(sandOf(actor)?.max ?? 0, before.sand + gained), `the Sand the card says it gained (${gained})`, 8000);
  sw.log("paid", { before, after: pools(actor), sandClaimed: gained });
}

/** The card's own buttons, by action, as drawn now. */
function buttonsOn(card) {
  const root = document.querySelector(`#chat [data-message-id="${card.id}"]`) ?? document.querySelector(`[data-message-id="${card.id}"]`);
  return [...(root?.querySelectorAll("button[data-action]") ?? [])].map(b => ({ action: b.dataset.action, index: b.dataset.targetIndex ?? null, disabled: b.disabled, text: b.textContent.replace(/\s+/g, " ").trim() }));
}

/** Cast through the sheet; where the spell asks for a pick before paying, press the board at `point`. */
async function castPicking(actor, spellName, { targets = [], face = 18, lines = null, point = null } = {}) {
  const posting = castFromSheet(actor, spellName, { targets, face, lines });
  if (point) {
    await until(pickActive, `${spellName}'s pick armed`, 20000);
    pressBoard(point);
  }
  return posting;
}

/**
 * **A FAILED CASTING TEST, THROUGH THE SHEET** (07 §8, D-756): a natural 1. The card says so in
 * words, its Mana is spent, and it offers nothing to resist, apply or place, and plays nothing.
 */
async function checkFailedCast(sw, actor, spellName, { targets = [], point = null } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  await freshTurn(actor, Math.max(1, halvesOf(spell)));
  const before = pools(actor);
  const card = await castPicking(actor, spellName, { targets, face: 1, point });
  if (!sw.check(Boolean(card), "the failed cast posted a card")) return null;
  const f = flagsOf(card);
  sw.check(f.success === false, "a natural 1 failed the Casting Test", { sl: f.sl, success: f.success });
  sw.check(textOf(live(card)).includes(game.i18n.localize("AZEROTH.Card.DidNotGoOff")), "the failed card says it did not go off");
  const offered = buttonsOn(card).filter(b => ["resistTest", "applyDamage", "applyHealing", "applySpellEffect", "placeArea"].includes(b.action));
  sw.check(!offered.length, "a failed cast offers nothing to resist, apply or place", offered);
  await sw.wait(() => manaOf(actor)?.value === before.mana - (Number(spell.system.mana) || 0), "the failed cast still paid its Mana");
  await checkAnimation(sw, card, false);
  return card;
}

/** Press a Resist row on a spell card with the die pinned; decline any Another Timeline ask; answer the record. */
async function resistRow(sw, card, index, face) {
  const target = flagsOf(card).targets?.[index] ?? null;
  const key = target?.tokenId ?? target?.actorId ?? null;
  let pressed = null;
  try {
    pressed = await pressCard(card, `button[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`, { face });
  } catch (err) { sw.fail(`Resist row ${index}`, err); return null; }
  try {
    return await sw.wait(() => {
      declineOpenAsk();
      const r = flagsOf(card).resists?.[key];
      return r && typeof r.success === "boolean" ? r : null;
    }, `${target?.name ?? "the target"}'s Test recorded on the card`, 30000);
  } finally { await pressed.release(); }
}

/** Press a card button and release; a throw is a recorded fault. */
async function press(sw, card, selector, o = {}) {
  try { const p = await pressCard(card, selector, o); await sleep(50); return p; } catch (err) { sw.fail(`pressing ${selector}`, err); return null; }
}

/** Press Apply on a damage row and wait for the Health to move by the card's number. */
async function applyDamageRow(sw, card, index, victim) {
  const row = flagsOf(card).damageByTarget?.[index] ?? null;
  const n = Number(row?.damage) || 0;
  const hp = victim.system.health.value;
  const p = await press(sw, card, `button[data-action="applyDamage"][data-target-index="${index}"]:not([data-rider])`);
  if (!p) return null;
  await p.release();
  await sw.wait(() => victim.system.health.value === Math.max(0, hp - n), `the Apply landed ${n} on ${victim.name} (${hp} before)`, 30000);
  await sw.wait(() => document.querySelector(`[data-message-id="${card.id}"] button[data-action="applyDamage"][data-target-index="${index}"]`)?.disabled, "the Apply greyed once applied", 15000);
  return n;
}

/** Place the card's area: press the board at `point`, and at `facing` too where the pick asks for a direction. */
async function placeFrom(sw, card, point, facing = null) {
  const created = untilHook("createRegion", 30000).catch(() => null);
  const p = await press(sw, card, 'button[data-action="placeArea"]', { skip: false });
  if (!p) return null;
  try {
    if (!(await sw.wait(pickActive, "the area pick armed", 15000))) return null;
    pressBoard(point);
    await sleep(400);
    if (pickActive() && facing) pressBoard(facing);
    const got = await created;
    return got?.[0] ?? null;
  } finally { await p.release(); }
}

/** A creature's own attack from its sheet at a token, on its turn, the die pinned. Answers the attack card. */
async function creatureAttack(sw, foe, victimToken, face) {
  canvas.tokens.setTargets([victimToken.id]);
  const sheet = await openSheet(foe.actor);
  const control = sheet.element.querySelector('[data-action="rollAttack"][data-attack="0"]');
  if (!sw.check(Boolean(control), "the creature's sheet draws its attack")) { await sheet.close(); return null; }
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "attack" && m.speaker?.token === foe.doc.id)
    .then(([m]) => { made.push(m); return m; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** The caster's own weapon attack from the Combat tab. */
async function weaponAttack(sw, actor, weapon, victimToken, face) {
  canvas.tokens.setTargets([victimToken.id]);
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${weapon.id}"] [data-action="rollAttack"]`)
    ?? sheet.element.querySelector(`[data-item-id="${weapon.id}"] [data-action="rollAttack"]`);
  if (!sw.check(Boolean(control), "the Combat tab draws the weapon's Attack")) { await sheet.close(); return null; }
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "attack" && m.speaker?.actor === actor.id)
    .then(([m]) => { made.push(m); return m; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** End a Sustain from the Spells tab's own control. */
async function endSustainFromSheet(sw, actor, spell) {
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="endSustain"]`);
  if (!sw.check(Boolean(control), `the Spells tab draws End Sustain for ${spell.name}`)) { await sheet.close(); return false; }
  control.click();
  await sw.wait(() => !(actor.getFlag("azeroth-rpg", "sustaining") ?? []).some(e => e.spellId === spell.id || e.name === spell.name), `${spell.name}'s Sustain ended`);
  await sheet.close();
  return true;
}

/** An Arcane Spellpower of `n` on the caster, as a worn grant would add it (`final`, a derived number). */
async function arcaneSpellpower(actor, n) {
  const [e] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "ZZ Arcane Spellpower", img: "icons/svg/aura.svg",
    system: { changes: [{ key: "system.spellpower.arcane", type: "add", value: String(n), phase: "final" }] }
  }]);
  return e;
}

/** The sustaining entry for a spell, or null. */
const sustainOf = (actor, spell) => (actor.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e.spellId === spell.id || e.name === spell.name) ?? null;

/** Check a Sustain's upkeep at the caster's next turn start, through the tracker. */
async function checkUpkeep(sw, c, combat, spell, upkeep) {
  const before = manaOf(c).value;
  if (combat.combatant?.id === combat.getCombatantsByActor(c)[0]?.id) await stepTurn(combat);
  await nextTurnUntil(c, combat);
  await sw.wait(() => manaOf(c).value === before - upkeep, `${spell.name}'s upkeep of ${upkeep} Mana paid at the caster's turn start (${before} before)`, 20000);
  sw.check(Boolean(sustainOf(c, spell)), `${spell.name} still sustained after its upkeep`);
}

/** Press the tracker's Next Turn once: the current creature's turn ends. */
async function stepTurn(combat) {
  const settled = untilHook("combatTurnChange", 60000, x => x.id === combat.id);
  const control = ui.combat?.viewed?.id === combat.id ? ui.combat.element?.querySelector('button[data-action="nextTurn"]') : null;
  if (control && !control.disabled) control.click();
  else await combat.nextTurn();
  await settled;
  await settle();
}

/** A Region this card placed, on the scene. */
const regionOfCast = (scene, card) => [...scene.regions].find(r => r.flags?.["azeroth-rpg"]?.cast === flagsOf(card).cast) ?? null;

/* -------------------------------------------- */
/*  The batches                                  */
/* -------------------------------------------- */

/** Shared before/after: the recorder in place of the player, every document deleted after. */
function frame(context) {
  const { before, after } = context;
  before(async function () {
    recorder = new (game.system.azeroth.animations.Recorder)();
    previousPlayer = game.system.azeroth.animations.director.setPlayer(recorder);
  });
  after(async function () {
    this.timeout(240000);
    canvas?.tokens?.setTargets?.([]);
    if (previousPlayer) game.system.azeroth.animations.director.setPlayer(previousPlayer);
    for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
    await drainAreaWork();
    for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
    await cleanup();
  });
}

const AT = { x: 800, y: 1000 };
const FT = 20; // pixels a foot on the sweep's scene (100 px a 5 ft square)
const east = feet => ({ x: AT.x + feet * FT, y: AT.y });

export function chronomancerSweepTier1Batch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: the ten tier 1 sand spells through the real controls (stage 2)", function () {
    frame(context);

    it("SAND BLAST: 6 Physical less Body AP, no Ward, no Spellpower below tier 3; Decay 1 at SL 2 for a minute; refused with no Mana; a failure lands nothing", async function () {
      this.timeout(600000);
      await sweepTest("Sand Blast", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW Blast", { level: 9, spells: ["Sand Blast"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
        const raptor = foes[0];
        await raptor.actor.update({ "system.ward.arcane": 3 });
        await arcaneSpellpower(c, 2);
        const spell = c.items.find(i => i.name === "Sand Blast");
        const body = raptor.actor.system.ap.body;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), sl: f.sl, damageByTarget: f.damageByTarget });
        sw.check(f.success === true && f.sl >= 2, "a natural 20 succeeds at SL 2 or better", { sl: f.sl });
        await checkPaid(sw, c, spell, before, card);
        const row = f.damageByTarget?.[0] ?? {};
        sw.check(row.type === "physical", "the row is Physical", row);
        sw.check(row.ward === null || row.ward === undefined || row.ward === 0, "no Ward comes off a Physical spell (07 §9)", row);
        sw.check(row.damage === Math.max(0, 6 - body), `6 less the Body AP ${body}, and the Arcane Spellpower 2 adds nothing at tier 1 (07 §9)`, row);
        // At SL 2: Decay 1, one effect, a minute, Armor Points 1 lower at every location.
        const decay = await sw.wait(() => decayOf(raptor.actor), "Decay laid at SL 2");
        if (decay) {
          sw.check(decayValue(raptor.actor) === 1, "Decay 1", decay.flags["azeroth-rpg"][DECAY_FLAG]);
          sw.log("decay span", { span: spanOf(decay), start: decay.start ?? null });
          sw.check(fightRoundsSpan(decay, 10), "Decay lasts 1 minute: ten of the fight's rounds", spanOf(decay));
          sw.check(raptor.actor.system.ap.body === Math.max(0, body - 1), "Body AP 1 lower under Decay 1", { body, now: raptor.actor.system.ap.body });
        }
        await applyDamageRow(sw, card, 0, raptor.actor);
        await checkAnimation(sw, card, true);
        readBoard(sw, "after Sand Blast", [c, raptor.actor]);
        // A second Sand Blast at SL 0 or 1 lays no Decay and leaves the first's 1.
        await freshTurn(c, 2);
        const low = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 6 });
        if (low) {
          const lf = flagsOf(low);
          sw.log("low card", { sl: lf.sl, success: lf.success });
          if (lf.success && lf.sl < 2) sw.check(decayValue(raptor.actor) === 1 && raptor.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]).length === 1, "a cast below SL 2 adds no Decay and one effect stands");
        }
        // No Mana: refused in words, nothing spent.
        await freshTurn(c, 2);
        const mana = manaOf(c);
        await c.updatePool({ itemId: mana.itemId, kind: "power", value: 1 });
        const b0 = pools(c);
        let refused = null;
        const said = await warnings(async () => { refused = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18, ms: 4000 }); });
        sw.check(!refused, "a cast with 1 Mana posts no card");
        sw.check(said.some(w => w.includes(game.i18n.format("AZEROTH.Cast.NoMana", { name: "Sand Blast", mana: spell.system.mana }))), "the refusal names the Mana", said);
        sw.check(pools(c).halves === b0.halves && manaOf(c).value === 1, "the refusal spent nothing", { b0, now: pools(c) });
        await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
        // A failed Casting Test.
        await checkFailedCast(sw, c, "Sand Blast", { targets: [raptor.doc.object] });
        // PAST THE RANGE (60 ft): 07 §9 measures from the caster, and the cast is refused in words
        // before anything is spent (O-288, D-893). A displacement through `move`, which core reads
        // off the waypoint, so nothing is metered on the Raptor's behalf (D-892's note).
        await raptor.doc.move({ x: AT.x + 80 * FT, y: raptor.doc.y, action: "displace" });
        await sw.wait(() => raptor.doc.x === AT.x + 80 * FT, "the Raptor 80 feet off");
        await freshTurn(c, 2);
        const bFar = pools(c);
        let far = null;
        const saidFar = await warnings(async () => { far = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18, ms: 4000 }); });
        sw.check(!far, "a cast at 80 ft, Range 60 ft, posts no card");
        sw.check(saidFar.some(w => w.includes("80 feet") && w.includes("60 feet")), "the refusal names the distance and the Range", saidFar);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(bFar), "and spends nothing", { bFar, now: pools(c) });
        await raptor.doc.move({ x: AT.x + 40 * FT, y: raptor.doc.y, action: "displace" });
        await sw.wait(() => raptor.doc.x === AT.x + 40 * FT, "the Raptor back at 40 feet");
        // NO HOURGLASS (D-848): the glass off the Ranged slot, the Sand gone, the spell still cast,
        // and nothing gained.
        const glass = c.items.find(i => i.name === "Hourglass");
        await glass.update({ "system.equipped": false });
        await sw.wait(() => (sandOf(c)?.value ?? 0) === 0 && (sandOf(c)?.max ?? 0) === 0, "the Sand gone with the glass", 15000);
        await freshTurn(c, 2);
        const bare = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        if (sw.check(Boolean(bare), "a Chronomancer with no Hourglass still casts")) {
          await sleep(1500);
          sw.check((sandOf(c)?.value ?? 0) === 0, "and gains no Sand", { sand: sandOf(c), claimed: sandClaimed(bare) });
          sw.log("no-glass card", { text: textOf(live(bare)) });
        }
        await glass.update({ "system.equipped": true });
        // The minute passes in the fight's rounds, through the tracker: Decay is still there nine
        // rounds after it was laid, and gone by the end of the tenth.
        const laid = Number(decayOf(raptor.actor)?.start?.round) || null;
        sw.log("decay laid in round", { laid, now: combat.round });
        if (laid) {
          while (combat.round < laid + 9 || (combat.round === laid + 9 && combat.combatant?.tokenId !== raptor.doc.id)) await stepTurn(combat);
          sw.check(Boolean(decayOf(raptor.actor)), "Decay still stands nine rounds on", { round: combat.round, laid });
          for (let i = 0; i < 2 * combat.turns.length + 1 && decayOf(raptor.actor); i++) await stepTurn(combat);
          sw.check(!decayOf(raptor.actor), "Decay gone ten rounds on", { round: combat.round, laid });
          sw.check(combat.round === laid + 10 || combat.round === laid + 11, "and not before the tenth round", { round: combat.round, laid });
          sw.check(raptor.actor.system.ap.body === body, "Body AP back once Decay ends", { body, now: raptor.actor.system.ap.body });
        }
      });
    });

    it("SAND BREATH: a 15 ft cone; a failure takes 3 Physical less AP and is Slowed to the end of its next turn; a success takes half and is not Slowed", async function () {
      this.timeout(600000);
      await sweepTest("Sand Breath", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW Breath", { level: 9, spells: ["Sand Breath"], enemies: [
          { name: "Raptor", x: AT.x + 200, y: AT.y, health: 60 }, { name: "Raptor", x: AT.x + 200, y: AT.y + 100, health: 60 }] });
        const [a, b] = foes;
        const spell = c.items.find(i => i.name === "Sand Breath");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sand Breath", { targets: [a.doc.object, b.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), sl: f.sl, damageByTarget: f.damageByTarget, area: f.area });
        await checkPaid(sw, c, spell, before, card);
        sw.check(f.area?.shape === "cone" && f.area?.distanceFt === 15, "the card's area is a 15 ft cone", f.area);
        const region = await placeFrom(sw, card, { x: AT.x + 300, y: AT.y + 50 });
        sw.check(Boolean(region), "Place area laid the cone");
        readBoard(sw, "after the cone", [c, a.actor, b.actor]);
        const ra = await resistRow(sw, card, 0, 1);
        const rb = await resistRow(sw, card, 1, 20);
        sw.check(ra?.success === false && rb?.success === true, "one failed, one passed", { ra, rb });
        await sw.wait(() => a.actor.statuses.has("slowed"), "the failure Slowed");
        sw.check(!b.actor.statuses.has("slowed"), "the success is not Slowed");
        const slowed = a.actor.effects.find(e => e.statuses?.has("slowed"));
        sw.log("slowed span", spanOf(slowed));
        // The damage: 3 less AP on the failure; half of 3 on the success.
        const rows = flagsOf(card).damageByTarget ?? [];
        sw.log("rows after the Tests", rows);
        const apA = a.actor.system.ap.body;
        const hpA = a.actor.system.health.value;
        const hpB = b.actor.system.health.value;
        await applyDamageRow(sw, card, 0, a.actor);
        sw.check(hpA - a.actor.system.health.value === Math.max(0, 3 - apA), `the failure took 3 less Body AP ${apA}`, { hpA, now: a.actor.system.health.value });
        const passedRow = buttonsOn(card).find(b => b.action === "applyDamage" && b.index === "1");
        sw.log("the passed row's Apply, as drawn", passedRow);
        sw.check(new RegExp(`\\b${Math.max(0, Math.floor(3 / 2) - b.actor.system.ap.body)}$`).test(passedRow?.text ?? ""), "the passed row's Apply says the half it lands", passedRow);
        const pb = await press(sw, card, 'button[data-action="applyDamage"][data-target-index="1"]:not([data-rider])');
        if (pb) await pb.release();
        await sleep(6000);
        const tookB = hpB - b.actor.system.health.value;
        sw.log("the success took", { tookB, row: flagsOf(card).damageByTarget?.[1] });
        sw.check(tookB === Math.max(0, Math.floor(3 / 2) - b.actor.system.ap.body), "the success took half of 3, rounded down, less AP", { tookB });
        // Sand: the failed Test gives 1, once a cast.
        sw.log("sand after the Tests", pools(c));
        // Slowed lasts to the END of the creature's next turn.
        const aTurn = combatantOfToken(combat, a.doc);
        await nextTurnUntil(aTurn, combat);
        sw.check(a.actor.statuses.has("slowed"), "still Slowed during its next turn");
        await stepTurn(combat);
        await sw.wait(() => !a.actor.statuses.has("slowed"), "the Slowed ended at the end of its next turn", 20000);
        await checkAnimation(sw, card, true);
        await checkFailedCast(sw, c, "Sand Breath", { targets: [a.doc.object] });
      });
    });

    it("MENDING SANDS: the Health taken since the start of the caster's last turn comes back, to no more than 6", async function () {
      this.timeout(600000);
      await sweepTest("Mending Sands", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW Mend", { level: 9, spells: ["Mending Sands"],
          enemies: [{ name: "Raptor", ...east(45), health: 60 }], allies: [{ name: "ZZ SW Mended", x: AT.x + 100, y: AT.y }] });
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Mending Sands");
        // The ally is struck on the Raptor's turn, after the caster's last turn started.
        await freshTurn(c, 2);
        await nextTurnUntil(combatantOfToken(combat, foes[0].doc), combat);
        const full = ally.system.health.value;
        await ally.applyDamage(5, { struck: true, attack: false });
        await sw.wait(() => ally.system.health.value === full - 5, "the ally took 5");
        // The caster's next turn: Mending Sands at the ally.
        await nextTurnUntil(c, combat);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Mending Sands", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), heal: flagsOf(card).heal ?? null });
        await checkPaid(sw, c, spell, before, card);
        const heal = buttonsOn(card).find(b => b.action === "applyHealing");
        sw.check(Boolean(heal), "the card offers Apply healing", buttonsOn(card));
        sw.check(/\b5\b/.test(heal?.text ?? ""), "the heal is the 5 taken since the start of the caster's last turn", heal);
        const p = await press(sw, card, 'button[data-action="applyHealing"]');
        if (p) await p.release();
        await sw.wait(() => ally.system.health.value === full, "the ally's 5 regained", 20000);
        await checkAnimation(sw, card, true);
        // The cap: 9 taken, 6 back.
        await nextTurnUntil(combatantOfToken(combat, foes[0].doc), combat);
        await ally.applyDamage(9, { struck: true, attack: false });
        await nextTurnUntil(c, combat);
        await freshTurn(c, 2);
        const second = await castFromSheet(c, "Mending Sands", { targets: [tokenOf(ally)], face: 18 });
        const h2 = second ? buttonsOn(second).find(b => b.action === "applyHealing") : null;
        sw.check(/\b6\b/.test(h2?.text ?? ""), "no more than 6", h2);
        await checkFailedCast(sw, c, "Mending Sands", { targets: [tokenOf(ally)] });
      });
    });

    it("SANDTRAP: a sustained 10 ft circle, Difficult ground for the creatures chosen as it is cast; 1 Mana upkeep; End Sustain takes it off", async function () {
      this.timeout(600000);
      await sweepTest("Sandtrap", assert, async sw => {
        const { c, scene, combat, foes } = await chronoInFight("ZZ SW Trap", { level: 9, spells: ["Sandtrap"], enemies: [{ name: "Raptor", ...east(40), health: 60 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Sandtrap");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sandtrap", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, sustained: f.sustained });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Sandtrap", c.getFlag("azeroth-rpg", "sustaining"));
        sw.check(f.area?.shape === "circle" && f.area?.distanceFt === 10, "a 10 ft circle", f.area);
        const region = await placeFrom(sw, card, raptor.doc.object.center);
        if (sw.check(Boolean(region), "Place area laid the trap")) {
          const behaviors = [...region.behaviors].map(b => ({ type: b.type, system: b.system?.toObject?.() ?? b.system }));
          sw.log("region", { name: region.name, behaviors, flags: region.flags?.["azeroth-rpg"] });
          await sw.wait(() => region.behaviors.size > 0, "the trap carries a Difficult ground behavior", 15000);
          const ground = [...region.behaviors].map(b => json(b.system?.toObject?.() ?? b.system)).join(" ");
          sw.check(ground.includes(raptor.actor.uuid) || ground.includes(raptor.doc.id) || ground.includes(raptor.doc.uuid), "the ground names the chosen Raptor", ground);
        }
        sw.check(textOf(live(card)).includes(game.i18n.format("AZEROTH.Area.ChosenAtCast", { spell: "Sandtrap", names: flagsOf(card).targets?.[0]?.name ?? "" })), "the card says the Raptor was chosen, not spared a Test");
        const lay = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        if (lay) { await lay.release(); await sleep(3000); }
        sw.log("after the card's Apply", raptor.actor.effects.map(e => ({ name: e.name, changes: e.system?.changes ?? [], span: spanOf(e), flags: Object.keys(e.flags?.["azeroth-rpg"] ?? {}) })));
        await checkAnimation(sw, card, true);
        await checkUpkeep(sw, c, combat, spell, 1);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !regionOfCast(scene, card), "the trap taken off with the Sustain", 20000);
        sw.log("Raptor effects after the Sustain", raptor.actor.effects.map(e => e.name));
        await checkFailedCast(sw, c, "Sandtrap", { targets: [raptor.doc.object] });
      });
    });

    it("MOMENT'S WARNING: cast as a Reaction from the incoming attack card, the Defense rises by 2 and the hit becomes a miss", async function () {
      this.timeout(600000);
      await sweepTest("Moment's Warning", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW Warn", { level: 9, spells: ["Moment's Warning"],
          enemies: [{ name: "Raptor", x: AT.x + 300, y: AT.y + 200, health: 60 }], allies: [{ name: "ZZ SW Warned", x: AT.x + 200, y: AT.y + 200 }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Moment's Warning");
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const defense = ally.system.defense;
        const bonus = raptor.actor.system.attacks?.[0]?.bonus ?? 4;
        const attack = await creatureAttack(sw, raptor, tokenOf(ally), Math.max(2, Math.min(19, defense - bonus)));
        if (!sw.check(Boolean(attack), "the Raptor's attack posted")) return;
        const af = flagsOf(attack);
        sw.log("attack", { total: attack.rolls?.[0]?.total, defense, success: attack.rolls?.[0]?.outcome?.success, buttons: buttonsOn(attack), rows: af.damageByTarget });
        const before = pools(c);
        const hp = ally.system.health.value;
        const sel = '[data-sand-answer] button[data-spell-identifier="moments-warning"][data-target-index="0"]';
        const offered = document.querySelector(`[data-message-id="${attack.id}"] ${sel}`);
        if (!sw.check(Boolean(offered), "the attack card offers Moment's Warning to the Chronomancer", buttonsOn(attack))) return;
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "spell").then(([m]) => { made.push(m); return m; }).catch(() => null);
        const p = await press(sw, attack, sel, { face: 18 });
        const cast = await posted;
        if (p) await p.release();
        if (!sw.check(Boolean(cast), "the Reaction cast posted a card")) return;
        sw.log("cast card", { text: textOf(live(cast)), buttons: buttonsOn(cast) });
        await sw.wait(() => manaOf(c).value === before.mana - spell.system.mana, `Moment's Warning paid ${spell.system.mana} Mana`);
        await sw.wait(() => pools(c).reactions === before.reactions - 1, "the Reaction spent", 10000);
        await sw.wait(() => flagsOf(attack).damageByTarget?.[0]?.withdrawn === true, "the hit written as a miss on the attack card", 20000);
        const drawn = document.querySelector(`[data-message-id="${attack.id}"]`)?.textContent?.replace(/\s+/g, " ") ?? "";
        sw.log("attack after", { drawn, buttons: buttonsOn(attack) });
        sw.check(drawn.includes(game.i18n.localize("AZEROTH.Card.Answered")), "the attack card says the blow was answered", drawn);
        const apply = buttonsOn(attack).find(b => b.action === "applyDamage" && b.index === "0");
        sw.check(/\b0$/.test(apply?.text ?? "0"), "the Apply reads the nothing left", apply);
        const said = await warnings(async () => { const pa = await press(sw, attack, 'button[data-action="applyDamage"][data-target-index="0"]'); if (pa) await pa.release(); await sleep(4000); });
        sw.check(ally.system.health.value === hp, "the ally took nothing", { hp, now: ally.system.health.value });
        sw.log("Apply on the withdrawn row said", said);
        // A second press of the answer is refused before anything is spent.
        const mana1 = manaOf(c).value;
        const again = document.querySelector(`[data-message-id="${attack.id}"] ${sel}`);
        if (again) {
          const said2 = await warnings(async () => { const p2 = await press(sw, attack, sel, { face: 18 }); if (p2) await p2.release(); await sleep(3000); });
          sw.log("second answer said", said2);
          sw.check(manaOf(c).value === mana1, "a second Moment's Warning on the answered blow spends nothing", { mana1, now: manaOf(c).value });
        }
        await checkAnimation(sw, cast, true);
      });
    });

    it("QUICKENING: Speed +10 and Initiative +2 laid by the card's Apply for 10 minutes, then gone on the clock", async function () {
      this.timeout(600000);
      await sweepTest("Quickening", assert, async sw => {
        const { c, foes, friends } = await chronoInFight("ZZ SW Quick", { level: 9, spells: ["Quickening"],
          enemies: [{ name: "Raptor", ...east(50), health: 60 }], allies: [{ name: "ZZ SW Quickened", x: AT.x + 100, y: AT.y }] });
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Quickening");
        const speed = ally.system.speed?.value ?? ally.system.speed;
        const init = ally.system.initiative?.value ?? ally.system.initiative;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Quickening", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        const p = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        if (p) await p.release();
        const effect = await sw.wait(() => ally.effects.find(e => e.name?.includes("Quickening")), "Quickening laid on the ally");
        if (effect) {
          sw.log("effect", { changes: effect.system?.changes, span: spanOf(effect) });
          sw.check(fightRoundsSpan(effect, 100), "10 minutes: a hundred of the fight's rounds", spanOf(effect));
        }
        const speed1 = ally.system.speed?.value ?? ally.system.speed;
        const init1 = ally.system.initiative?.value ?? ally.system.initiative;
        sw.check(speed1 === speed + 10, "Speed 10 feet higher", { speed, speed1 });
        sw.check(init1 === init + 2, "Initiative 2 higher", { init, init1 });
        await checkAnimation(sw, card, true);
        await checkFailedCast(sw, c, "Quickening", { targets: [tokenOf(ally)] });
        // THE FIGHT ENDS two rounds in: the rest of the ten minutes is the world's clock's.
        const combat = c.activeFight?.() ?? game.combat;
        await combat.delete();
        await sleep(1000);
        await game.time.advance(6);
        await sleep(1500);
        sw.check(Boolean(ally.effects.find(e => e.name?.includes("Quickening"))), "Quickening laid in a fight outlives the fight's end on the clock", ally.effects.map(e => ({ name: e.name, span: spanOf(e) })));
        await game.time.advance(600);
        await sw.wait(() => !ally.effects.find(e => e.name?.includes("Quickening")), "and is gone once ten minutes of the clock have passed", 20000);
        // OUT OF A FIGHT: the span is the world's ten minutes.
        const out = await castFromSheet(c, "Quickening", { targets: [tokenOf(ally)], face: 18 });
        if (out) {
          const p2 = await press(sw, out, 'button[data-action="applySpellEffect"][data-target-index="0"]');
          if (p2) await p2.release();
          const e2 = await sw.wait(() => ally.effects.find(e => e.name?.includes("Quickening")), "Quickening laid out of a fight");
          if (e2) sw.check(clockMinutes(e2, 10), "out of a fight: ten minutes of the clock", spanOf(e2));
          await game.time.advance(590);
          await sleep(1500);
          sw.check(Boolean(ally.effects.find(e => e.name?.includes("Quickening"))), "still there at 9 minutes 50");
          await game.time.advance(15);
          await sw.wait(() => !ally.effects.find(e => e.name?.includes("Quickening")), "gone at ten minutes", 20000);
        }
        void foes;
      });
    });

    it("GRIT LASH: 4 Physical less AP; a failed Body Test pulls it 10 ft and the Apply still lands; a passed one stays put", async function () {
      this.timeout(600000);
      await sweepTest("Grit Lash", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ SW Lash", { level: 9, spells: ["Grit Lash"], enemies: [{ name: "Raptor", ...east(25), health: 60 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Grit Lash");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), rows: flagsOf(card).damageByTarget });
        await checkPaid(sw, c, spell, before, card);
        const x0 = raptor.doc.x;
        const r = await resistRow(sw, card, 0, 1);
        sw.check(r?.success === false, "the Body Test failed", r);
        await sw.wait(() => raptor.doc.x === x0 - 200, "pulled 10 ft toward the caster", 20000);
        const ap = raptor.actor.system.ap.body;
        const n = await applyDamageRow(sw, card, 0, raptor.actor);
        sw.check(n === Math.max(0, 4 - ap), `4 less Body AP ${ap}`, { n });
        await checkAnimation(sw, card, true);
        // The second, on a Half-Action left: a passed Test leaves it where it stands.
        const second = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 18 });
        if (second) {
          const x1 = raptor.doc.x;
          const r2 = await resistRow(sw, second, 0, 20);
          sw.check(r2?.success === true, "the second Body Test passed", r2);
          await sleep(1500);
          sw.check(raptor.doc.x === x1, "a passed Test is not pulled", { x1, now: raptor.doc.x });
          await applyDamageRow(sw, second, 0, raptor.actor);
        }
        await checkFailedCast(sw, c, "Grit Lash", { targets: [raptor.doc.object] });
      });
    });

    it("SANDSKIN: Body AP +1 for a minute by the card's Apply; a second casting replaces the first", async function () {
      this.timeout(600000);
      await sweepTest("Sandskin", assert, async sw => {
        const { c, friends } = await chronoInFight("ZZ SW Skin", { level: 9, spells: ["Sandskin"],
          enemies: [{ name: "Raptor", ...east(50), health: 60 }], allies: [{ name: "ZZ SW Skinned", x: AT.x + 100, y: AT.y }] });
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Sandskin");
        const body = ally.system.ap.body;
        const head = ally.system.ap.head;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sandskin", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        const p = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        if (p) await p.release();
        const effect = await sw.wait(() => ally.effects.find(e => e.name?.includes("Sandskin")), "Sandskin laid");
        if (effect) sw.check(fightRoundsSpan(effect, 10), "1 minute: ten of the fight's rounds", spanOf(effect));
        sw.check(ally.system.ap.body === body + 1 && ally.system.ap.head === head, "Body AP 1 higher, the Head unchanged", { body, now: ally.system.ap.body, head, headNow: ally.system.ap.head });
        await checkAnimation(sw, card, true);
        const again = await castFromSheet(c, "Sandskin", { targets: [tokenOf(ally)], face: 18 });
        if (again) {
          const p2 = await press(sw, again, 'button[data-action="applySpellEffect"][data-target-index="0"]');
          if (p2) await p2.release();
          await sleep(2500);
          sw.check(ally.effects.filter(e => e.name?.includes("Sandskin")).length === 1, "one Sandskin a creature", ally.effects.map(e => e.name));
          sw.check(ally.system.ap.body === body + 1, "still 1 higher, not 2", { body, now: ally.system.ap.body });
        }
        await checkFailedCast(sw, c, "Sandskin", { targets: [tokenOf(ally)] });
      });
    });

    it("STUTTER: a failed Spirit Test is Slowed and has no Reaction until the end of its next turn; a passed one is untouched", async function () {
      this.timeout(600000);
      await sweepTest("Stutter", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW Stutter", { level: 9, spells: ["Stutter"], enemies: [{ name: "Raptor", ...east(40), health: 60 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Stutter");
        const rTurn = combatantOfToken(combat, raptor.doc);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Stutter", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        const r = await resistRow(sw, card, 0, 1);
        sw.check(r?.success === false, "the Spirit Test failed", r);
        await sw.wait(() => raptor.actor.statuses.has("slowed"), "Slowed");
        sw.log("effects", raptor.actor.effects.map(e => ({ name: e.name, statuses: [...e.statuses], span: spanOf(e) })));
        await nextTurnUntil(rTurn, combat);
        sw.check(raptor.actor.statuses.has("slowed"), "Slowed through its next turn");
        const barred = game.system.azeroth.workflows.turnBudgetRefusal(raptor.actor, "reaction");
        sw.check(Boolean(barred), "no Reaction on its next turn: a Reaction is refused", { barred, budget: rTurn.budget });
        await stepTurn(combat);
        await sw.wait(() => !raptor.actor.statuses.has("slowed"), "Slowed ended at the end of its next turn", 20000);
        sw.check(!raptor.actor.effects.some(e => /Reaction/i.test(e.name ?? "")), "the no-Reaction effect ended with it", raptor.actor.effects.map(e => e.name));
        await nextTurnUntil(rTurn, combat);
        sw.check(!game.system.azeroth.workflows.turnBudgetRefusal(raptor.actor, "reaction"), "its Reaction is back the turn after", rTurn.budget);
        await checkAnimation(sw, card, true);
        // A passed Test lays nothing.
        await freshTurn(c, 2);
        const passed = await castFromSheet(c, "Stutter", { targets: [raptor.doc.object], face: 18 });
        if (passed) {
          const r2 = await resistRow(sw, passed, 0, 20);
          sw.check(r2?.success === true, "the second Test passed", r2);
          await sleep(1500);
          sw.check(!raptor.actor.statuses.has("slowed"), "a passed Test is not Slowed", statusesOf(raptor.actor));
        }
        await checkFailedCast(sw, c, "Stutter", { targets: [raptor.doc.object] });
      });
    });

    it("ECHO STEP: a teleport within 5 ft a point of Intelligence modifier, provoking nothing; past it the pick refuses; a failed cast stays put", async function () {
      this.timeout(600000);
      await sweepTest("Echo Step", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW Echo", { level: 9, spells: ["Echo Step", "Grit Lash"], enemies: [{ name: "Raptor", x: AT.x + 100, y: AT.y, health: 60 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Echo Step");
        const mod = c.system.abilities.int.mod;
        const feet = 5 * mod;
        await freshTurn(c, 2);
        const before = pools(c);
        const offers = [];
        const watch = Hooks.on("createChatMessage", m => { if (/opportunityAttack/.test(m.content ?? "")) offers.push(m.id); });
        let card = null;
        const said = await warnings(async () => {
          const posting = castFromSheet(c, "Echo Step", { face: 18 });
          await until(pickActive, "Echo Step's pick armed");
          // Past the feet: refused in words, the pick waits.
          pressBoard({ x: AT.x - (feet + 10) * FT + 50, y: AT.y + 50 });
          await sleep(500);
          sw.check(pickActive(), "a point past the feet leaves the pick waiting");
          pressBoard({ x: AT.x - feet * FT + 50, y: AT.y + 50 });
          card = await posting;
        });
        Hooks.off("createChatMessage", watch);
        sw.log("refusals", said);
        sw.check(said.length > 0, "the far point was refused in words", said);
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), steps: flagsOf(card).steps });
        await checkPaid(sw, c, spell, before, card);
        await sw.wait(() => tokenOf(c).document.x === AT.x - feet * FT, `the token stepped ${feet} ft west`, 20000);
        await sleep(1500);
        sw.check(!offers.length, "the step provoked no Opportunity Attack", offers);
        await checkAnimation(sw, card, true);
        // After the step a Grit Lash still resists and applies.
        const lash = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 18 });
        if (lash) { await resistRow(sw, lash, 0, 20); await applyDamageRow(sw, lash, 0, raptor.actor); }
        // A failed cast picks, pays, and moves nothing.
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const at = { x: tokenOf(c).document.x, y: tokenOf(c).document.y };
        await checkFailedCast(sw, c, "Echo Step", { point: { x: at.x + 2 * 100 + 50, y: at.y + 50 } });
        await sleep(1500);
        sw.check(tokenOf(c).document.x === at.x && tokenOf(c).document.y === at.y, "a failed Echo Step does not move", { at, now: { x: tokenOf(c).document.x, y: tokenOf(c).document.y } });
      });
    });
  });
}

export function chronomancerSweepTier2Batch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: the nine tier 2 sand spells through the real controls (stage 2)", function () {
    frame(context);

    /** A sustained area that strikes at a turn's start: place, tick, Test, upkeep, end. */
    async function stormLike(sw, { name, damage, resilience, onFail }) {
      const { c, scene, combat, foes } = await chronoInFight(`ZZ SW ${name}`, { level: 9, spells: [name], enemies: [{ name: "Raptor", ...east(45), health: 80 }] });
      const raptor = foes[0];
      const spell = c.items.find(i => i.name === name);
      const rTurn = combatantOfToken(combat, raptor.doc);
      await freshTurn(c, 2);
      const before = pools(c);
      const card = await castFromSheet(c, name, { face: 18 });
      if (!sw.check(Boolean(card), "the cast posted a card")) return null;
      const f = flagsOf(card);
      sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, areaTick: f.areaTick ?? null });
      await checkPaid(sw, c, spell, before, card);
      sw.check(!buttonsOn(card).some(b => b.action === "applyDamage"), "nothing lands on the cast: the area strikes at a turn's start");
      sw.check(textOf(live(card)).includes(`${damage} ${game.i18n.localize("AZEROTH.DamageType.Physical")}`), "the card names the damage Physical, in words", textOf(live(card)));
      const region = await placeFrom(sw, card, raptor.doc.object.center);
      if (!sw.check(Boolean(region), "Place area laid the area")) return null;
      sw.log("region", { behaviors: [...region.behaviors].map(b => b.type), flags: region.flags?.["azeroth-rpg"] });
      await checkAnimation(sw, card, true);
      // The Raptor's turn: the tick, and its Test.
      const hp = raptor.actor.system.health.value;
      const ap = raptor.actor.system.ap.body;
      const test = untilHook("createChatMessage", 40000, m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === raptor.actor.uuid)
        .then(([m]) => { made.push(m); return m; }).catch(() => null);
      await nextTurnUntil(rTurn, combat);
      await sw.wait(() => raptor.actor.system.health.value === hp - Math.max(0, damage - ap), `${damage} Physical less Body AP ${ap} at the Raptor's turn start`, 30000);
      const tc = await test;
      if (sw.check(Boolean(tc), `the Raptor's ${resilience} Test card posted`)) {
        sw.log("test card", { text: textOf(live(tc)), buttons: buttonsOn(tc) });
        const p = await press(sw, tc, 'button[data-action="resistTest"]', { face: 1 });
        await sw.wait(() => { declineOpenAsk(); return onFail.landed(raptor.actor); }, `the failure laid ${onFail.what}`, 30000);
        if (p) await p.release();
      }
      return { c, scene, combat, raptor, spell, card, region, rTurn };
    }

    it("SANDSTORM: Difficult ground; a creature starting its turn there takes 4 Physical less AP and a failed Reflex Test Blinds it to the end of that turn; 2 Mana upkeep", async function () {
      this.timeout(600000);
      await sweepTest("Sandstorm", assert, async sw => {
        const s = await stormLike(sw, { name: "Sandstorm", damage: 4, resilience: "Reflex", onFail: { what: "Blinded", landed: a => a.statuses.has("blinded") } });
        if (!s) return;
        const { c, scene, combat, raptor, spell, card, region, rTurn } = s;
        sw.check([...region.behaviors].length > 0, "the storm is Difficult ground", [...region.behaviors].map(b => b.type));
        const blind = raptor.actor.effects.find(e => e.statuses?.has("blinded"));
        sw.log("blinded span", spanOf(blind));
        await stepTurn(combat);
        await sw.wait(() => !raptor.actor.statuses.has("blinded"), "Blinded ended at the end of that turn", 20000);
        await checkUpkeep(sw, c, combat, spell, 2);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !regionOfCast(scene, card), "the storm taken off with the Sustain", 20000);
        await checkFailedCast(sw, c, "Sandstorm");
      });
    });

    it("WITHERING SANDS: a creature starting its turn there takes 5 Physical less AP and a failed Spirit Test gains Decay 1; 2 Mana upkeep", async function () {
      this.timeout(600000);
      await sweepTest("Withering Sands", assert, async sw => {
        const s = await stormLike(sw, { name: "Withering Sands", damage: 5, resilience: "Spirit", onFail: { what: "Decay 1", landed: a => decayValue(a) === 1 } });
        if (!s) return;
        const { c, scene, combat, raptor, spell, card } = s;
        const decay = decayOf(raptor.actor);
        if (decay) sw.log("decay", { span: spanOf(decay), value: decayValue(raptor.actor) });
        await checkUpkeep(sw, c, combat, spell, 2);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !regionOfCast(scene, card), "the area taken off with the Sustain", 20000);
        await checkFailedCast(sw, c, "Withering Sands");
      });
    });

    it("DILATION: on a willing ally, a blow lands half now, rounded up, and the rest at the start of its next turn; it ends after the caster's next turn", async function () {
      this.timeout(600000);
      await sweepTest("Dilation", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW Dilate", { level: 9, spells: ["Dilation"],
          enemies: [{ name: "Raptor", x: AT.x + 300, y: AT.y + 100, health: 60 }], allies: [{ name: "ZZ SW Dilated", x: AT.x + 200, y: AT.y + 100 }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Dilation");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Dilation", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        const p = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        if (p) await p.release();
        const effect = await sw.wait(() => ally.effects.find(e => e.flags?.["azeroth-rpg"]?.deferral), "Dilation laid");
        if (effect) {
          sw.log("effect", { name: effect.name, span: spanOf(effect), start: effect._source?.start ?? null });
          sw.check(spanOf(effect).units === "turns" && spanOf(effect).value === 1 && effect._source?.start?.combatant === combat.getCombatantsByActor(c)[0]?.id,
            "until the end of the CASTER's next turn: a turn's span keyed on the caster", { span: spanOf(effect), start: effect._source?.start ?? null });
        }
        await checkAnimation(sw, card, true);
        // The Raptor's turn: its own attack, applied from its card.
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const attack = await creatureAttack(sw, raptor, tokenOf(ally), 19);
        if (!attack) return;
        const dealt = Number(flagsOf(attack).damageByTarget?.[0]?.damage) || 0;
        sw.log("attack", { total: attack.rolls?.[0]?.total, rows: flagsOf(attack).damageByTarget, buttons: buttonsOn(attack) });
        const hp = ally.system.health.value;
        const pa = await press(sw, attack, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        if (pa) await pa.release();
        await answerAndWait(sw, () => ally.system.health.value === hp - Math.ceil(dealt / 2), `half of ${dealt} now, rounded up`);
        // The ally's next turn start lands the rest, unreduced.
        await nextTurnUntil(ally, combat);
        await sw.wait(() => ally.system.health.value === hp - dealt, `the other ${Math.floor(dealt / 2)} at the start of its next turn`, 20000);
        // The caster's next turn ends it.
        await nextTurnUntil(c, combat);
        await stepTurn(combat);
        await sw.wait(() => !ally.effects.find(e => e.flags?.["azeroth-rpg"]?.deferral), "Dilation ended after the caster's next turn", 20000);
        await checkFailedCast(sw, c, "Dilation", { targets: [tokenOf(ally)] });
      });
    });

    /** Wait while declining any ask that opens. */
    async function answerAndWait(sw, fn, what, ms = 30000) {
      return sw.wait(() => { declineOpenAsk(); return fn(); }, what, ms);
    }

    it("REVERSION: 2 Health at once, and 3 plus the Intelligence modifier at the start of the target's next turn", async function () {
      this.timeout(600000);
      await sweepTest("Reversion", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ SW Revert", { level: 9, spells: ["Reversion"],
          enemies: [{ name: "Raptor", ...east(50), health: 60 }], allies: [{ name: "ZZ SW Reverted", x: AT.x + 200, y: AT.y }] });
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Reversion");
        const mod = c.system.abilities.int.mod;
        await ally.applyDamage(15, { struck: true, attack: false });
        await freshTurn(c, 2);
        const hp = ally.system.health.value;
        const before = pools(c);
        const card = await castFromSheet(c, "Reversion", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), tick: flagsOf(card).tick ?? null });
        await checkPaid(sw, c, spell, before, card);
        const heal = buttonsOn(card).find(b => b.action === "applyHealing");
        if (sw.check(Boolean(heal), "the card offers Apply healing for the 2", buttonsOn(card))) {
          const p = await press(sw, card, 'button[data-action="applyHealing"]');
          if (p) await p.release();
          await sw.wait(() => ally.system.health.value === hp + 2, "2 Health at once", 20000);
        }
        const lay = buttonsOn(card).find(b => b.action === "applySpellEffect");
        if (sw.check(Boolean(lay), "the card offers the Apply that lays the next turn's heal", buttonsOn(card))) {
          const p = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
          if (p) await p.release();
          await sw.wait(() => ally.effects.some(e => e.flags?.["azeroth-rpg"]?.tick), "the heal tick laid on the ally", 20000);
        }
        await checkAnimation(sw, card, true);
        const h1 = ally.system.health.value;
        await nextTurnUntil(ally, combat);
        await sw.wait(() => ally.system.health.value === Math.min(ally.system.health.max, h1 + 3 + mod), `3 + ${mod} at the start of its next turn`, 20000);
        await nextTurnUntil(c, combat);
        await nextTurnUntil(ally, combat);
        await sleep(1000);
        sw.check(!ally.effects.some(e => e.flags?.["azeroth-rpg"]?.tick), "the tick ends after it lands once", ally.effects.map(e => e.name));
        await checkFailedCast(sw, c, "Reversion", { targets: [tokenOf(ally)] });
      });
    });

    it("TIME TRAP: a glyph of 5 ft a point of Intelligence modifier; the first enemy to enter makes a Spirit Test and is Stunned on a failure; the glyph fades", async function () {
      this.timeout(600000);
      await sweepTest("Time Trap", assert, async sw => {
        const { c, scene, combat, foes } = await chronoInFight("ZZ SW Glyph", { level: 9, spells: ["Time Trap"], enemies: [{ name: "Raptor", x: AT.x + 1000, y: AT.y, health: 60 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Time Trap");
        const mod = c.system.abilities.int.mod;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Time Trap", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, areaTick: f.areaTick });
        await checkPaid(sw, c, spell, before, card);
        sw.check(f.area?.distanceFt === 5 * mod, `a radius of 5 x ${mod}`, f.area);
        const centre = { x: AT.x + 500 + 50, y: AT.y + 50 };
        const region = await placeFrom(sw, card, centre);
        if (!sw.check(Boolean(region), "Place area laid the glyph")) return;
        sw.log("glyph", { behaviors: [...region.behaviors].map(b => b.type), flags: region.flags?.["azeroth-rpg"] });
        await checkAnimation(sw, card, true);
        // The Raptor walks in on its turn.
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const test = untilHook("createChatMessage", 40000, m => m.flags?.["azeroth-rpg"]?.kind === "areaTest").then(([m]) => { made.push(m); return m; }).catch(() => null);
        await raptor.doc.move({ x: AT.x + 600, y: AT.y });
        const tc = await test;
        if (sw.check(Boolean(tc), "entering posted the Raptor's Spirit Test card")) {
          sw.log("test card", { text: textOf(live(tc)), buttons: buttonsOn(tc) });
          const p = await press(sw, tc, 'button[data-action="resistTest"]', { face: 1 });
          await sw.wait(() => { declineOpenAsk(); return raptor.actor.statuses.has("stunned"); }, "the failure Stunned the Raptor", 30000);
          if (p) await p.release();
        }
        await sw.wait(() => !scene.regions.get(region.id), "the glyph faded once sprung", 20000);
        await checkFailedCast(sw, c, "Time Trap");
      });
    });

    it("ACCELERATE: Speed doubles and Difficult ground is ignored while sustained; 2 Mana upkeep; End Sustain takes it off", async function () {
      this.timeout(600000);
      await sweepTest("Accelerate", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ SW Accel", { level: 9, spells: ["Accelerate"],
          enemies: [{ name: "Raptor", ...east(50), health: 60 }], allies: [{ name: "ZZ SW Accelerated", x: AT.x + 100, y: AT.y }] });
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Accelerate");
        const speed = ally.system.speed?.value ?? ally.system.speed;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Accelerate", { targets: [tokenOf(ally)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Accelerate");
        const p = await press(sw, card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        if (p) await p.release();
        const effect = await sw.wait(() => ally.effects.find(e => e.name?.includes("Accelerate")), "Accelerate laid");
        if (effect) sw.log("effect", { changes: effect.system?.changes, span: spanOf(effect), flags: effect.flags?.["azeroth-rpg"] });
        const speed1 = ally.system.speed?.value ?? ally.system.speed;
        sw.check(speed1 === speed * 2, "Speed doubled", { speed, speed1 });
        await checkAnimation(sw, card, true);
        await checkUpkeep(sw, c, combat, spell, 2);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !ally.effects.find(e => e.name?.includes("Accelerate")), "Accelerate lifted with the Sustain", 20000);
        await checkFailedCast(sw, c, "Accelerate", { targets: [tokenOf(ally)] });
      });
    });

    it("DRAG OF AGES: each creature chosen in a 15 ft radius makes a Spirit Test; a failure is Slowed for a minute and gains Decay of half the Intelligence modifier; a success at its turn's end ends the Slowed", async function () {
      this.timeout(600000);
      await sweepTest("Drag of Ages", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW Drag", { level: 9, spells: ["Drag of Ages"], enemies: [
          { name: "Raptor", ...east(45), health: 60 }, { name: "Raptor", x: AT.x + 45 * FT, y: AT.y + 100, health: 60 }] });
        const [a, b] = foes;
        const spell = c.items.find(i => i.name === "Drag of Ages");
        const half = Math.floor(c.system.abilities.int.mod / 2);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Drag of Ages", { targets: [a.doc.object, b.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: flagsOf(card).area, decayFail: flagsOf(card).decayFail });
        await checkPaid(sw, c, spell, before, card);
        const region = await placeFrom(sw, card, a.doc.object.center);
        sw.check(Boolean(region), "Place area laid the radius");
        const ra = await resistRow(sw, card, 0, 1);
        const rb = await resistRow(sw, card, 1, 20);
        sw.check(ra?.success === false && rb?.success === true, "one failed, one passed", { ra, rb });
        await sw.wait(() => a.actor.statuses.has("slowed"), "the failure Slowed");
        await sw.wait(() => decayValue(a.actor) === half, `the failure gains Decay ${half}`);
        sw.check(!b.actor.statuses.has("slowed") && !decayOf(b.actor), "the success takes nothing", { statuses: statusesOf(b.actor), decay: decayValue(b.actor) });
        const slowed = a.actor.effects.find(e => e.statuses?.has("slowed"));
        sw.log("slowed", { span: spanOf(slowed), escape: slowed?.flags?.["azeroth-rpg"]?.escape ?? null });
        sw.check(fightRoundsSpan(slowed, 10), "Slowed for 1 minute: ten of the fight's rounds", spanOf(slowed));
        await checkAnimation(sw, card, true);
        // At the end of its turn it repeats the Test; a success ends the Slowed and keeps the Decay.
        const aTurn = combatantOfToken(combat, a.doc);
        const prompt = untilHook("createChatMessage", 60000, m => /data-purpose="escape"/.test(m.content ?? "")).then(([m]) => { made.push(m); return m; }).catch(() => null);
        await nextTurnUntil(aTurn, combat);
        await stepTurn(combat);
        const pc = await prompt;
        if (sw.check(Boolean(pc), "the end of its turn posted the repeat Test")) {
          sw.log("prompt", { text: textOf(live(pc)), buttons: buttonsOn(pc) });
          const p = await press(sw, pc, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 20 });
          await sw.wait(() => { declineOpenAsk(); return !a.actor.statuses.has("slowed"); }, "a success ended the Slowed", 30000);
          if (p) await p.release();
          sw.check(decayValue(a.actor) === half, "the Decay stays", decayValue(a.actor));
        }
        await checkFailedCast(sw, c, "Drag of Ages", { targets: [a.doc.object] });
      });
    });

    it("SANDWALL: a 30 ft wall that blocks sight and is Difficult ground while sustained; 2 Mana upkeep; End Sustain takes it down", async function () {
      this.timeout(600000);
      await sweepTest("Sandwall", assert, async sw => {
        const { c, scene, combat } = await chronoInFight("ZZ SW Wall", { level: 9, spells: ["Sandwall"], enemies: [{ name: "Raptor", ...east(55), health: 60 }] });
        const spell = c.items.find(i => i.name === "Sandwall");
        const walls0 = scene.walls.size;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sandwall", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: flagsOf(card).area });
        await checkPaid(sw, c, spell, before, card);
        const region = await placeFrom(sw, card, { x: AT.x + 600, y: AT.y - 300 }, { x: AT.x + 600, y: AT.y + 600 });
        if (!sw.check(Boolean(region), "Place area laid the wall")) return;
        sw.log("region", { behaviors: [...region.behaviors].map(b => b.type), shapes: region.shapes.map(s => s.toObject?.() ?? s) });
        await sw.wait(() => region.behaviors.size > 0, "the wall's space is Difficult ground", 20000);
        const wall = await sw.wait(() => scene.walls.find(w => w.flags?.["azeroth-rpg"]?.sandwall === region.id), "a sight-blocking Wall raised with it", 20000);
        if (wall) {
          sw.log("wall", { c: [...wall.c], sight: wall.sight, move: wall.move });
          sw.check(wall.sight === CONST.EDGE_SENSE_TYPES.NORMAL && wall.move === CONST.WALL_MOVEMENT_TYPES.NONE, "it blocks sight and nothing else", { sight: wall.sight, move: wall.move });
          sw.check(Math.hypot(wall.c[2] - wall.c[0], wall.c[3] - wall.c[1]) === 30 * FT, "30 feet long, along the line placed", [...wall.c]);
        }
        await checkAnimation(sw, card, true);
        await checkUpkeep(sw, c, combat, spell, 2);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !regionOfCast(scene, card), "the wall's area taken off with the Sustain", 20000);
        await sw.wait(() => scene.walls.size === walls0, "the Wall taken down with it", 20000);
        await checkFailedCast(sw, c, "Sandwall");
      });
    });

    it("HOURSTRIKE: the next weapon attack this turn deals 2 more Physical on a hit and lays Decay 1", async function () {
      this.timeout(600000);
      await sweepTest("Hourstrike", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ SW Hour", { level: 9, spells: ["Hourstrike"], enemies: [{ name: "Raptor", x: AT.x + 100, y: AT.y, health: 80 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Hourstrike");
        const dagger = await give(c, "Dagger", PACK_FOR.weapon);
        await dagger.update({ "system.equipped": true });
        // A blow without it, for the number to compare.
        await freshTurn(c, 2);
        const plain = await weaponAttack(sw, c, dagger, raptor.doc.object, 18);
        const plainDamage = Number(flagsOf(plain)?.damageByTarget?.[0]?.damage) || 0;
        sw.log("plain blow", { rows: flagsOf(plain)?.damageByTarget });
        // The next turn: Hourstrike (a Half-Action), then the dagger.
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Hourstrike", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), nextAttack: c.getFlag("azeroth-rpg", "nextAttack") });
        await checkPaid(sw, c, spell, before, card);
        await checkAnimation(sw, card, true);
        const self = await press(sw, card, 'button[data-action="applySpellEffect"][data-self="1"]');
        if (self) await self.release();
        const laid = await sw.wait(() => c.effects.find(e => e.name === "Hourstrike"), "the card's Apply laid Hourstrike on the caster", 15000);
        if (laid) sw.check(spanOf(laid).units === "turns" && spanOf(laid).value === 0, "until the end of your turn", spanOf(laid));
        const blow = await weaponAttack(sw, c, dagger, raptor.doc.object, 18);
        if (!blow) return;
        const rows = flagsOf(blow).damageByTarget ?? [];
        sw.log("blow", { text: textOf(live(blow)), rows });
        sw.check(Number(rows[0]?.damage) === plainDamage + 2, "2 more damage on the hit", { plainDamage, now: rows[0]?.damage });
        await applyDamageRow(sw, blow, 0, raptor.actor);
        await sw.wait(() => decayValue(raptor.actor) === 1, "Decay 1 on the creature hit", 20000);
        // The promise is spent by the blow: a second swing this turn adds nothing.
        sw.check(!(c.getFlag("azeroth-rpg", "nextAttack") ?? []).some(p => p.name === "Hourstrike"), "the promise taken by the blow", c.getFlag("azeroth-rpg", "nextAttack"));
        const combat = c.activeFight?.() ?? game.combat;
        await stepTurn(combat);
        await sw.wait(() => !c.effects.find(e => e.name === "Hourstrike"), "Hourstrike's effect gone at the end of the caster's turn", 15000);
        await checkFailedCast(sw, c, "Hourstrike");
      });
    });
  });
}

/* -------------------------------------------- */
/*  The sweep's kit, shared with stage 3          */
/*  (`quench-chronomancer-sweep-t35.mjs`)         */
/* -------------------------------------------- */

export {
  live, flagsOf, sleep, json, pickActive, decayOf, decayValue, combatantOfToken, statusesOf, spanOf, fightRoundsSpan,
  clockMinutes, pressBoard, declineOpenAsk, sweepTest, checkAnimation, readBoard, pools, sandClaimed, checkPaid, buttonsOn,
  castPicking, checkFailedCast, resistRow, press, applyDamageRow, placeFrom, creatureAttack, weaponAttack, endSustainFromSheet,
  sustainOf, checkUpkeep, stepTurn, regionOfCast, frame, AT, FT, east
};
