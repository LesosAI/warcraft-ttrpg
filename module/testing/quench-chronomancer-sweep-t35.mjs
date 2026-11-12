/**
 * **THE CHRONOMANCER SWEEP, STAGE 3: THE FIFTEEN TIER 3, 4 AND 5 SAND SPELLS, PLAYED LIKE A
 * PLAYER** (the lead's play-test, 2026-11-10: *"I need you to go through and test all
 * features and spells, there are too many issues I quickly found."*).
 *
 * Stage 2's shape (`quench-chronomancer-sweep-t12.mjs`, whose kit this imports): every test plays
 * one spell in a started fight with tokens on a viewed scene, through the controls a player
 * presses - the sheet's own Cast and the roll dialog, the card's own buttons as the chat log draws
 * them (Resist, Apply, Place area, Apply effect, a Reaction on an incoming attack card), a
 * creature's own Attack on its sheet, the Spells tab's End Sustain and the tracker's Next Turn -
 * and reads the WORLD after every press against 07 §12's words: Health, Armor Points and Decay,
 * conditions, token positions, Regions, effects and their spans, the pools and the budget; then
 * the turns that follow (a repeat Test, an upkeep, a held effect, an expiry), the failed cast,
 * both Resist branches, 07 §4's rest gates, the animation record and the console.
 *
 * **A SOFT CHECK A STEP**: every check is a `SWEEP` line in the run's progress file, and a failed
 * one is collected, so one run reports every fault a spell has. A test fails at its end, naming
 * them all.
 *
 * Two batches, so each runs well under twelve minutes: `azeroth-rpg.chronomancer-sweep-t35` (the
 * eight tier 3 spells) and `azeroth-rpg.chronomancer-sweep-t35-tier45` (the six tier 4 spells and
 * Divert Timeway). Run each alone with `QUENCH_BATCH`. Every document a test makes is deleted in
 * `after`.
 */

import { give, made, untilHook, warnings } from "./fixtures.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";
import { LIFE_COUNT_FLAG } from "../rules/sand-spells.mjs";
import { castFromSheet, chronoInFight, freshTurn, halvesOf, manaOf, nextTurnUntil, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import {
  AT, FT, applyDamageRow, buttonsOn, castPicking, checkAnimation, checkFailedCast, checkPaid, checkUpkeep, combatantOfToken,
  creatureAttack, decayOf, decayValue, declineOpenAsk, east, endSustainFromSheet, fightRoundsSpan, flagsOf, frame, json, live,
  pickActive, placeFrom, pools, press, pressBoard, readBoard, regionOfCast, resistRow, sleep, spanOf, statusesOf, stepTurn,
  sustainOf, sweepTest
} from "./quench-chronomancer-sweep-t12.mjs";

/* -------------------------------------------- */
/*  Stage 3's own helpers                        */
/* -------------------------------------------- */

/** Every `info` and `warn` notification while `fn` runs, said nowhere. */
async function notices(fn) {
  const said = [];
  const held = { info: ui.notifications.info, warn: ui.notifications.warn };
  const own = { info: Object.prototype.hasOwnProperty.call(ui.notifications, "info"), warn: Object.prototype.hasOwnProperty.call(ui.notifications, "warn") };
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return null; };
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try { await fn(); } finally {
    for (const k of ["info", "warn"]) { if (own[k]) ui.notifications[k] = held[k]; else delete ui.notifications[k]; }
  }
  return said;
}

/** The caster's Mana back to full. */
async function fill(c) {
  const mana = manaOf(c);
  if (mana && mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
}

/** A Short Rest through the one door, on bread the character carries (05 §16). */
async function shortRestOf(actor) {
  const bread = await give(actor, "Bread and cheese");
  await actor.shortRest({ food: bread });
  await sleep(500);
}

/** The AP at every location, for a read. */
const apOf = actor => ({ body: actor.system.ap?.body ?? null, head: actor.system.ap?.head ?? null, limb: actor.system.ap?.limb ?? null });

/** The words of 07 §4's gate for a spell. */
const gateWords = (spell, rest) => game.i18n.format("AZEROTH.SpellLimit.Exhausted", { name: spell.name, rest: game.i18n.localize(`AZEROTH.SpellLimit.${rest}`) });

/**
 * **07 §4's GATE, THROUGH THE SHEET**: a second cast before the rest is refused in the gate's own
 * words, posting nothing and spending no Mana and no Half-Action.
 */
async function checkGate(sw, c, spellName, rest, { targets = [] } = {}) {
  const spell = c.items.find(i => i.type === "spell" && i.name === spellName);
  await freshTurn(c, Math.max(1, halvesOf(spell)));
  const b0 = pools(c);
  let refused = null;
  const said = await warnings(async () => { refused = await castFromSheet(c, spellName, { targets, face: 18, ms: 5000 }); });
  sw.check(!refused, `a second ${spellName} before a ${rest} Rest posts no card`);
  sw.check(said.includes(gateWords(spell, rest)), `refused in 07 §4's words (${rest})`, said);
  sw.check(pools(c).mana === b0.mana && pools(c).halves === b0.halves, "the refusal spent nothing", { b0, now: pools(c) });
}

/** Press the card's Apply on a target's laid effect (`applySpellEffect`), or on the caster (`self`). */
async function applyEffect(sw, card, { index = 0, self = false } = {}) {
  const sel = self ? 'button[data-action="applySpellEffect"][data-self="1"]' : `button[data-action="applySpellEffect"][data-target-index="${index}"]`;
  const p = await press(sw, card, sel);
  if (p) await p.release();
  return Boolean(p);
}

/** The attack card's dice: the d20s it rolled, for reading a Boon or a Bane. */
const d20sOf = message => {
  const roll = live(message)?.rolls?.[0];
  const die = roll?.dice?.find?.(d => d.faces === 20) ?? null;
  return { formula: roll?.formula ?? null, number: die?.number ?? null, modifiers: die?.modifiers ?? [] };
};

/** Whether this attack card's d20 carries a Bane (two d20s, the lower kept). */
const hasBane = message => { const d = d20sOf(message); return d.number >= 2 && d.modifiers.some(m => /^kl/.test(m)); };

/** Lay Decay through the one writer (setup for 07 §9's higher-X rule). */
async function decaySetup(victim, value, by) {
  const { layDecay } = await import("../effects/decay.mjs");
  return layDecay({ victim, value, by, source: "ZZ setup" });
}

/** The repeat-Test prompt posted for this held effect (its button names the effect). */
function escapePrompt(effectId) {
  return untilHook("createChatMessage", 60000, m => /data-purpose="escape"/.test(m.content ?? "") && Boolean(effectId) && (m.content ?? "").includes(effectId))
    .then(([m]) => { made.push(m); return m; }).catch(() => null);
}

/**
 * **07 §2's DC ON THE CARD** (D-892): the Casting Test's DC the card's roll carries, against the
 * one 07 names - a creature aimed at, its Defense; an area, an ally or nothing, 10 + 2 a tier.
 */
function checkDC(sw, card, want, why) {
  const dc = Number(live(card)?.rolls?.[0]?.options?.dc);
  sw.check(dc === want, `the Casting Test's DC is ${want}: ${why} (07 §2)`, { dc });
}

/** Whether an Opportunity Attack was offered in this window. */
function watchOffers() {
  const offers = [];
  const id = Hooks.on("createChatMessage", m => { if (/opportunityAttack/.test(m.content ?? "")) offers.push(m.id); });
  return { offers, stop: () => Hooks.off("createChatMessage", id) };
}

/* -------------------------------------------- */
/*  Tier 3                                       */
/* -------------------------------------------- */

export function chronomancerSweepTier3Batch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: the eight tier 3 sand spells through the real controls (stage 3)", function () {
    frame(context);

    it("HOUR OF DUST: 12 Physical plus Spellpower less Body AP, no Ward; Decay 2 at SL 2 until a Short Rest, the higher X kept; nothing below SL 2; a failure lands nothing", async function () {
      this.timeout(600000);
      await sweepTest("Hour of Dust", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ SW3 Dust", { level: 11, spells: ["Hour of Dust", "Sand Blast"], enemies: [
          { name: "Raptor", ...east(40), health: 120 }, { name: "Raptor", x: AT.x + 40 * FT, y: AT.y + 200, health: 120 }] });
        const [raptor, other] = foes;
        await raptor.actor.update({ "system.ward.arcane": 3 });
        const { arcaneSpellpower } = await spellpowerKit();
        await arcaneSpellpower(c, 2);
        const spell = c.items.find(i => i.name === "Hour of Dust");
        const body = raptor.actor.system.ap.body;
        const ap0 = apOf(raptor.actor);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Hour of Dust", { targets: [raptor.doc.object], face: 20 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), sl: f.sl, rows: f.damageByTarget });
        sw.check(f.success === true && f.sl >= 2, "a natural 20 succeeds at SL 2 or better", { sl: f.sl });
        checkDC(sw, card, raptor.actor.system.defense, "aimed at one creature, its Defense");
        await checkPaid(sw, c, spell, before, card);
        sw.check(Number(spell.system.mana) === 11, "Hour of Dust costs 11 Mana (D-886)", spell.system.mana);
        const row = f.damageByTarget?.[0] ?? {};
        sw.check(row.type === "physical", "the row is Physical", row);
        sw.check(row.ward === null || row.ward === undefined || row.ward === 0, "no Ward comes off a Physical spell", row);
        sw.check(row.damage === Math.max(0, 12 + 2 - body), `12 plus the Arcane Spellpower 2 (tier 3, 07 §9) less Body AP ${body}; SL adds nothing`, row);
        const decay = await sw.wait(() => decayOf(raptor.actor), "Decay laid at SL 2");
        if (decay) {
          const flag = decay.flags["azeroth-rpg"][DECAY_FLAG];
          sw.check(flag.value === 2 && flag.until === "shortRest", "Decay 2 until a Short Rest", flag);
          sw.log("decay span", spanOf(decay));
          sw.check(!(Number(decay._source?.duration?.value) > 0), "a Short Rest Decay carries no span of rounds", decay._source?.duration);
          const ap1 = apOf(raptor.actor);
          sw.check(["body", "head", "limb"].every(k => ap0[k] === null || ap1[k] === Math.max(0, ap0[k] - 2)), "AP 2 lower at every location, never below 0", { ap0, ap1 });
        }
        await applyDamageRow(sw, card, 0, raptor.actor);
        await checkAnimation(sw, card, true);
        // Sand Blast's Decay 1 at SL 2 on top: the higher X (2) stays, as does its Short Rest span.
        await freshTurn(c, 2);
        const blast = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        if (blast) {
          await sleep(1500);
          const d2 = decayOf(raptor.actor);
          sw.check(decayValue(raptor.actor) === 2 && d2?.flags?.["azeroth-rpg"]?.[DECAY_FLAG]?.until === "shortRest"
            && raptor.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]).length === 1, "a Decay 1 laid after keeps Decay 2 until a Short Rest, one effect", d2?.flags?.["azeroth-rpg"]?.[DECAY_FLAG]);
        }
        // **O-295** (the lead: *"Yes, decay AP reduction only counts if it's already applied."*):
        // the first cast's row met Body AP before its own Decay (checked above); a LATER cast meets
        // the Decay that is already applied.
        await freshTurn(c, 2);
        await fill(c);
        const apNow = raptor.actor.system.ap.body;
        sw.check(apNow === Math.max(0, body - 2), `O-295: the Raptor's Body AP stands at ${body} less its Decay 2`, { body, apNow });
        const again = await castFromSheet(c, "Hour of Dust", { targets: [raptor.doc.object], face: 20 });
        if (sw.check(Boolean(again), "a second Hour of Dust at the Decayed Raptor posted a card")) {
          const ar = flagsOf(again).damageByTarget?.[0] ?? {};
          sw.check(ar.damage === Math.max(0, 12 + 2 - apNow), `O-295: the later cast meets the Decay already applied: 14 less Body AP ${apNow}`, ar);
          await applyDamageRow(sw, again, 0, raptor.actor);
        }
        // Below SL 2: the other Raptor takes the damage and no Decay.
        await freshTurn(c, 2);
        await fill(c);
        const low = await castFromSheet(c, "Hour of Dust", { targets: [other.doc.object], face: 9 });
        if (low) {
          const lf = flagsOf(low);
          sw.log("low card", { sl: lf.sl, success: lf.success, rows: lf.damageByTarget });
          if (sw.check(lf.success === true && lf.sl < 2, "a cast at SL 0 or 1", { sl: lf.sl, success: lf.success })) {
            await sleep(1500);
            sw.check(!decayOf(other.actor), "below SL 2 lays no Decay", other.actor.effects.map(e => e.name));
            await applyDamageRow(sw, low, 0, other.actor);
          }
        }
        // A Short Rest ends the Decay (the creature's own rest).
        await raptor.actor.shortRest();
        await sw.wait(() => !decayOf(raptor.actor), "a Short Rest ended Decay 2", 15000);
        sw.check(raptor.actor.system.ap.body === body, "Body AP back after the rest", { body, now: raptor.actor.system.ap.body });
        await fill(c);
        await checkFailedCast(sw, c, "Hour of Dust", { targets: [raptor.doc.object] });
      });
    });

    it("SHIFTING HOURS: a sustained 20 ft radius; a chosen creature starting its turn there makes a Spirit Test and is Slowed while it stays; an ally in it has 10 ft more Speed; 3 Mana upkeep; End Sustain takes it off", async function () {
      this.timeout(600000);
      await sweepTest("Shifting Hours", assert, async sw => {
        const { c, scene, combat, foes, friends } = await chronoInFight("ZZ SW3 Shift", { level: 11, spells: ["Shifting Hours"],
          enemies: [{ name: "Raptor", ...east(45), health: 80 }], allies: [{ name: "ZZ SW3 Hastened", x: AT.x + 45 * FT, y: AT.y + 100 }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Shifting Hours");
        const speed = ally.system.speed?.value ?? ally.system.speed;
        const rSpeed = raptor.actor.system.speed?.value ?? raptor.actor.system.speed;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Shifting Hours", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, areaTick: f.areaTick ?? null });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Shifting Hours");
        checkDC(sw, card, 16, "an area, however a creature is targeted");
        sw.check(f.area?.shape === "circle" && f.area?.distanceFt === 20, "a 20 ft radius", f.area);
        sw.check(textOf(live(card)).includes(game.i18n.format("AZEROTH.Area.ChosenAtCast", { spell: "Shifting Hours", names: raptor.doc.name })), "the card says the Raptor was chosen", textOf(live(card)));
        const region = await placeFrom(sw, card, raptor.doc.object.center);
        if (!sw.check(Boolean(region), "Place area laid the field")) return;
        sw.log("region", { behaviors: [...region.behaviors].map(b => b.type), flags: region.flags?.["azeroth-rpg"] });
        await checkAnimation(sw, card, true);
        await sw.wait(() => (ally.system.speed?.value ?? ally.system.speed) === speed + 10, `the ally in the field has 10 ft more Speed (${speed})`, 20000);
        sw.log("ally effects", ally.effects.map(e => ({ name: e.name, changes: e.system?.changes, flags: Object.keys(e.flags?.["azeroth-rpg"] ?? {}) })));
        sw.check((raptor.actor.system.speed?.value ?? raptor.actor.system.speed) === rSpeed, "the enemy's Speed does not rise", { rSpeed, now: raptor.actor.system.speed });
        // The Raptor's turn start: its Spirit Test.
        const test = untilHook("createChatMessage", 40000, m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === raptor.actor.uuid)
          .then(([m]) => { made.push(m); return m; }).catch(() => null);
        const allyTests = [];
        const watch = Hooks.on("createChatMessage", m => { if (m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === ally.uuid) allyTests.push(m.id); });
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const tc = await test;
        if (sw.check(Boolean(tc), "the chosen Raptor's Spirit Test card posted at its turn start")) {
          sw.log("test card", { text: textOf(live(tc)), buttons: buttonsOn(tc) });
          const p = await press(sw, tc, 'button[data-action="resistTest"]', { face: 1 });
          await sw.wait(() => { declineOpenAsk(); return raptor.actor.statuses.has("slowed"); }, "the failure Slowed the Raptor", 30000);
          if (p) await p.release();
          const slowed = raptor.actor.effects.find(e => e.statuses?.has("slowed"));
          sw.log("slowed", { span: spanOf(slowed), flags: slowed?.flags?.["azeroth-rpg"] });
          sw.check((raptor.actor.system.speed?.value ?? raptor.actor.system.speed) === Math.floor(rSpeed / 2), "Slowed halves its Speed", { rSpeed, now: raptor.actor.system.speed });
        }
        // Walked out: the Slowed ends with the leaving. (The area names itself on the Slowed a
        // moment after the condition lands; a player's move comes after that.)
        await sw.wait(() => raptor.actor.effects.find(e => e.statuses?.has("slowed"))?.flags?.["azeroth-rpg"]?.leaves?.regionId === region.id, "the Slowed names the field it lasts in", 15000);
        await raptor.doc.move({ x: raptor.doc.x + 60 * FT, y: raptor.doc.y, action: "displace" });
        await sw.wait(() => raptor.doc.x === AT.x + 105 * FT, "the Raptor displaced 60 ft east (`TokenDocument#move`, the forced-move door's own shape)", 15000);
        const left = await sw.wait(() => !raptor.actor.statuses.has("slowed"), "the Slowed ended when it left the field", 20000);
        if (!left) {
          // What the leavers' sweep sees: where the token is, whether core counts it inside, and
          // whether a pass run by hand lifts it (the hook or the judgement).
          const effect = raptor.actor.effects.find(e => e.statuses?.has("slowed"));
          sw.log("leave diagnosis", { x: raptor.doc.x, y: raptor.doc.y, inside: raptor.doc.testInsideRegion(region), flag: effect?.flags?.["azeroth-rpg"]?.leaves ?? null, movement: raptor.doc.movement?.passed?.waypoints?.at?.(-1) ?? null });
          const { sweepLeavers } = await import("../canvas/sustained-areas.mjs");
          const lifted = await sweepLeavers({ scenes: [scene] });
          sw.log("leave diagnosis: a pass by hand", { lifted, slowed: raptor.actor.statuses.has("slowed") });
        }
        // The ally's turn: never asked (it was not chosen).
        await nextTurnUntil(ally, combat);
        await sleep(1500);
        Hooks.off("createChatMessage", watch);
        sw.check(!allyTests.length, "the ally, not chosen, makes no Test", allyTests);
        // Upkeep, then End Sustain.
        await checkUpkeep(sw, c, combat, spell, 3);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !regionOfCast(scene, card), "the field taken off with the Sustain", 20000);
        await sw.wait(() => (ally.system.speed?.value ?? ally.system.speed) === speed, "the ally's Speed back once the field is gone", 20000);
        await fill(c);
        await checkFailedCast(sw, c, "Shifting Hours", { targets: [raptor.doc.object] });
      });
    });

    it("SAND PRISON: a failed Reflex Test is Entangled, Blinded and gains Decay 1; the Test is repeated at the end of each of its turns and a success leaves the spell; 3 Mana upkeep; End Sustain frees it", async function () {
      this.timeout(600000);
      await sweepTest("Sand Prison", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW3 Prison", { level: 11, spells: ["Sand Prison"], enemies: [
          { name: "Raptor", ...east(40), health: 80 }, { name: "Raptor", x: AT.x + 40 * FT, y: AT.y + 200, health: 80 }] });
        const [raptor, other] = foes;
        const spell = c.items.find(i => i.name === "Sand Prison");
        const rTurn = combatantOfToken(combat, raptor.doc);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Sand Prison", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Sand Prison");
        const r = await resistRow(sw, card, 0, 1);
        sw.check(r?.success === false, "the Reflex Test failed", r);
        await sw.wait(() => raptor.actor.statuses.has("entangled") && raptor.actor.statuses.has("blinded"), "Entangled and Blinded");
        await sw.wait(() => decayValue(raptor.actor) === 1, "and Decay 1");
        const held = raptor.actor.effects.find(e => e.statuses?.has("entangled"));
        sw.log("held", { span: spanOf(held), escape: held?.flags?.["azeroth-rpg"]?.escape ?? null, effects: raptor.actor.effects.map(e => ({ name: e.name, statuses: [...e.statuses], span: spanOf(e) })) });
        sw.check(Boolean(held?.flags?.["azeroth-rpg"]?.escape), "the Entangled carries the repeat Test", held?.flags?.["azeroth-rpg"]);
        sw.check((raptor.actor.system.speed?.value ?? raptor.actor.system.speed) === 0, "Entangled: Speed 0", raptor.actor.system.speed);
        await checkAnimation(sw, card, true);
        // End of its turn: the repeat Test, failed; still held.
        const prompt1 = escapePrompt(held?.id);
        await nextTurnUntil(rTurn, combat);
        await stepTurn(combat);
        const pc1 = await prompt1;
        if (sw.check(Boolean(pc1), "the end of its turn posted the repeat Test")) {
          sw.log("prompt", { text: textOf(live(pc1)), buttons: buttonsOn(pc1) });
          const p = await press(sw, pc1, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 1 });
          await sleep(3000);
          declineOpenAsk();
          if (p) await p.release();
          sw.check(raptor.actor.statuses.has("entangled") && raptor.actor.statuses.has("blinded"), "a failed repeat leaves it held", statusesOf(raptor.actor));
        }
        // The caster's upkeep.
        await checkUpkeep(sw, c, combat, spell, 3);
        // END SUSTAIN: the spell ends, and with it the prison (Entangled and Blinded); the Decay stays.
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !raptor.actor.statuses.has("entangled") && !raptor.actor.statuses.has("blinded"), "the prison ends with the Sustain", 20000);
        sw.check(decayValue(raptor.actor) === 1, "the Decay stays", decayValue(raptor.actor));
        // A second casting at the other Raptor: a success on the repeat Test leaves the spell.
        await fill(c);
        await freshTurn(c, 2);
        const second = await castFromSheet(c, "Sand Prison", { targets: [other.doc.object], face: 18 });
        if (second) {
          const r2 = await resistRow(sw, second, 0, 1);
          sw.check(r2?.success === false, "the second Reflex Test failed", r2);
          await sw.wait(() => other.actor.statuses.has("entangled"), "the other Raptor held");
          const prompt2 = escapePrompt(other.actor.effects.find(e => e.statuses?.has("entangled"))?.id);
          await nextTurnUntil(combatantOfToken(combat, other.doc), combat);
          await stepTurn(combat);
          const pc2 = await prompt2;
          if (sw.check(Boolean(pc2), "its repeat Test posted")) {
            const outcome = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "escapeOutcome")
              .then(([m]) => { made.push(m); return m; }).catch(() => null);
            const p = await press(sw, pc2, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 20 });
            await sw.wait(() => { declineOpenAsk(); return !other.actor.statuses.has("entangled") && !other.actor.statuses.has("blinded"); }, "a success leaves the spell: Entangled and Blinded end", 30000);
            if (p) await p.release();
            sw.check(decayValue(other.actor) === 1, "its Decay stays", decayValue(other.actor));
            // **O-292** (the lead: *"292 - end when target escapes"*): the last creature out of the
            // prison ends the Sustain; the card says so; no upkeep at the caster's next turn start.
            await sw.wait(() => !sustainOf(c, spell), "O-292: the last creature out ends the Sustain", 20000);
            const oc = await outcome;
            const said = game.i18n.format("AZEROTH.Escape.SustainLeft", { name: other.actor.name, source: "Sand Prison", caster: c.name });
            sw.check(Boolean(oc) && textOf(live(oc)).includes(said), "O-292: the escape's card says the Sustain ends", oc ? textOf(live(oc)) : null);
            const manaThen = manaOf(c).value;
            if (combat.combatant?.id === combat.getCombatantsByActor(c)[0]?.id) await stepTurn(combat);
            await nextTurnUntil(c, combat);
            await sleep(2000);
            sw.check(manaOf(c).value === manaThen, "O-292: no upkeep at the caster's next turn start once the Sustain has ended", { manaThen, now: manaOf(c).value });
          }
          sw.log("sustain after the last target left", c.getFlag("azeroth-rpg", "sustaining"));
          if (sustainOf(c, spell)) await endSustainFromSheet(sw, c, spell);
        }
        // A passed Test lays nothing.
        await fill(c);
        await freshTurn(c, 2);
        const passed = await castFromSheet(c, "Sand Prison", { targets: [raptor.doc.object], face: 18 });
        if (passed) {
          const r3 = await resistRow(sw, passed, 0, 20);
          sw.check(r3?.success === true, "a passed Test", r3);
          await sleep(1500);
          sw.check(!raptor.actor.statuses.has("entangled") && !raptor.actor.statuses.has("blinded"), "a passed Test lays nothing", statusesOf(raptor.actor));
          if (sustainOf(c, spell)) await endSustainFromSheet(sw, c, spell);
        }
        await fill(c);
        await checkFailedCast(sw, c, "Sand Prison", { targets: [raptor.doc.object] });
      });
    });

    it("SANDS RUN BACK: a Reaction off the caster's turn; up to four creatures each regain what they took since the start of the caster's last turn, to no more than 6; no Reaction left refuses", async function () {
      this.timeout(600000);
      await sweepTest("Sands Run Back", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW3 Back", { level: 11, spells: ["Sands Run Back"],
          enemies: [{ name: "Raptor", x: AT.x + 300, y: AT.y + 100, health: 80 }],
          allies: [{ name: "ZZ SW3 Back A", x: AT.x + 200, y: AT.y + 100 }, { name: "ZZ SW3 Back B", x: AT.x + 100, y: AT.y + 200 }] });
        const raptor = foes[0];
        const [a, b] = friends;
        const spell = c.items.find(i => i.name === "Sands Run Back");
        // The caster's own turn starts; then the Raptor strikes A (its own Attack, applied from its card) and B takes 9.
        await freshTurn(c, 2);
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const hpA = a.system.health.value;
        const hpB = b.system.health.value;
        const attack = await creatureAttack(sw, raptor, tokenOf(a), 19);
        let tookA = 0;
        if (attack) {
          const pa = await press(sw, attack, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
          if (pa) await pa.release();
          await sw.wait(() => { declineOpenAsk(); return a.system.health.value < hpA; }, "the Raptor's blow landed on A", 30000);
          tookA = hpA - a.system.health.value;
        }
        await b.applyDamage(9, { struck: true, attack: false });
        await sw.wait(() => b.system.health.value === hpB - 9, "B took 9");
        // Still the Raptor's turn: the Reaction from the sheet at A, B and the Raptor itself (which took nothing).
        const before = pools(c);
        const card = await castFromSheet(c, "Sands Run Back", { targets: [tokenOf(a), tokenOf(b), raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the Reaction cast posted a card off the caster's turn")) return;
        // **EACH TARGET ON ITS OWN NUMBER** (O-301; the lead: *"o301 - each target needs to be rolled
        // against it's defense or make it's own resilence test if relevant."*): the two allies are
        // willing (16), the Raptor is not (its Defense), and the one roll is read against each. This
        // test asserted the first target's 16 for the whole cast (D-892's reading) until Stage R3.
        const each = flagsOf(card).eachTarget ?? [];
        sw.check(each.length === 3 && each[0].dc === 16 && each[1].dc === 16 && each[2].dc === Number(raptor.actor.system.defense),
          "each target's own number: 16 for the two willing allies, the Raptor's Defense for the Raptor (O-301)", each);
        checkDC(sw, card, Math.min(16, Number(raptor.actor.system.defense)), "the roll carries the lowest of the three (O-301)");
        sw.check(each.every(r => r.success), "the 18 beat every number", each);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), heal: flagsOf(card).heal ?? null, healByTarget: flagsOf(card).healByTarget ?? null });
        await sw.wait(() => manaOf(c).value === before.mana - Number(spell.system.mana), `paid ${spell.system.mana} Mana`);
        sw.check(Number(spell.system.mana) === 11, "Sands Run Back costs 11 Mana (D-886)", spell.system.mana);
        await sw.wait(() => pools(c).reactions === before.reactions - 1, "the Reaction spent", 10000);
        sw.check(pools(c).halves === before.halves, "no Half-Action spent", { before, now: pools(c) });
        const heals = buttonsOn(card).filter(x => x.action === "applyHealing");
        sw.log("heal buttons", heals);
        const wantA = Math.min(6, tookA);
        const btnA = heals.find(x => x.index === "0");
        const btnB = heals.find(x => x.index === "1");
        sw.check(new RegExp(`\\b${wantA}\\b`).test(btnA?.text ?? ""), `A regains the ${tookA} it took (to no more than 6)`, btnA);
        sw.check(/\b6\b/.test(btnB?.text ?? ""), "B regains 6 of its 9", btnB);
        if (btnA) { const p = await press(sw, card, 'button[data-action="applyHealing"][data-target-index="0"]'); if (p) await p.release(); }
        await sw.wait(() => a.system.health.value === hpA - tookA + wantA, "A's Health back", 20000);
        if (btnB) { const p = await press(sw, card, 'button[data-action="applyHealing"][data-target-index="1"]'); if (p) await p.release(); }
        await sw.wait(() => b.system.health.value === hpB - 9 + 6, "B's 6 back", 20000);
        await checkAnimation(sw, card, true);
        // No Reaction left this round: refused in words, nothing spent.
        const b1 = pools(c);
        let again = null;
        const said = await warnings(async () => { again = await castFromSheet(c, "Sands Run Back", { targets: [tokenOf(a)], face: 18, ms: 5000 }); });
        sw.check(!again, "a second Reaction in the round posts no card", said);
        sw.check(said.length > 0, "refused in words", said);
        sw.check(manaOf(c).value === b1.mana, "the refusal spent no Mana", { b1, now: pools(c) });
        // A failed cast, on a later turn with the Reaction back.
        await nextTurnUntil(c, combat);
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        await fill(c);
        const bf = pools(c);
        const failed = await castFromSheet(c, "Sands Run Back", { targets: [tokenOf(a)], face: 1 });
        if (sw.check(Boolean(failed), "the failed Reaction posted a card")) {
          sw.check(flagsOf(failed).success === false, "a natural 1 failed");
          sw.check(!buttonsOn(failed).some(x => x.action === "applyHealing"), "a failed cast offers nothing to apply", buttonsOn(failed));
          await sw.wait(() => manaOf(c).value === bf.mana - Number(spell.system.mana), "the failure still paid its Mana");
          await sw.wait(() => pools(c).reactions === bf.reactions - 1, "and spent the Reaction", 10000);
          await checkAnimation(sw, failed, false);
        }
      });
    });

    it("DUNE COLLAPSE: a 20 ft radius; a failed Reflex Test takes 6 Physical less AP and is Prone, a passed one half and keeps its feet; the area is Difficult ground for a minute", async function () {
      this.timeout(600000);
      await sweepTest("Dune Collapse", assert, async sw => {
        const { c, scene, combat, foes } = await chronoInFight("ZZ SW3 Dune", { level: 11, spells: ["Dune Collapse"], enemies: [
          { name: "Raptor", ...east(45), health: 80 }, { name: "Raptor", x: AT.x + 45 * FT, y: AT.y + 100, health: 80 }] });
        const [a, b] = foes;
        const spell = c.items.find(i => i.name === "Dune Collapse");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Dune Collapse", { targets: [a.doc.object, b.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, rows: f.damageByTarget, areaGround: f.areaGround ?? null });
        await checkPaid(sw, c, spell, before, card);
        sw.check(f.area?.shape === "circle" && f.area?.distanceFt === 20, "a 20 ft radius", f.area);
        checkDC(sw, card, 16, "an area");
        const region = await placeFrom(sw, card, a.doc.object.center);
        if (sw.check(Boolean(region), "Place area laid the collapse")) {
          sw.log("region", { behaviors: [...region.behaviors].map(x => ({ type: x.type, system: x.system?.toObject?.() ?? x.system })), flags: region.flags?.["azeroth-rpg"] });
          await sw.wait(() => region.behaviors.size > 0, "the area is Difficult ground", 20000);
        }
        const ra = await resistRow(sw, card, 0, 1);
        const rb = await resistRow(sw, card, 1, 20);
        sw.check(ra?.success === false && rb?.success === true, "one failed, one passed", { ra, rb });
        await sw.wait(() => a.actor.statuses.has("prone"), "the failure knocked Prone");
        sw.check(!b.actor.statuses.has("prone"), "the success keeps its feet");
        const apA = a.actor.system.ap.body;
        const apB = b.actor.system.ap.body;
        const hpA = a.actor.system.health.value;
        const hpB = b.actor.system.health.value;
        sw.log("rows after the Tests", flagsOf(card).damageByTarget);
        await applyDamageRow(sw, card, 0, a.actor);
        sw.check(hpA - a.actor.system.health.value === Math.max(0, 6 - apA), `the failure took 6 less Body AP ${apA}`, { hpA, now: a.actor.system.health.value });
        const pb = await press(sw, card, 'button[data-action="applyDamage"][data-target-index="1"]:not([data-rider])');
        if (pb) await pb.release();
        await sleep(6000);
        sw.check(hpB - b.actor.system.health.value === Math.max(0, Math.floor(6 / 2) - apB), `the success took half of 6 less Body AP ${apB}`, { hpB, now: b.actor.system.health.value, row: flagsOf(card).damageByTarget?.[1] });
        await checkAnimation(sw, card, true);
        // The ground lasts 1 minute: ten of the fight's rounds.
        const laid = combat.round;
        if (region) {
          sw.log("region lasts", { laid, flags: scene.regions.get(region.id)?.flags?.["azeroth-rpg"] });
          while (combat.round < laid + 9) await stepTurn(combat);
          sw.check(Boolean(scene.regions.get(region.id)), "the ground still stands nine rounds on", { round: combat.round, laid });
          for (let i = 0; i < 3 * combat.turns.length && scene.regions.get(region.id); i++) await stepTurn(combat);
          sw.check(!scene.regions.get(region.id), "the ground is gone after a minute", { round: combat.round, laid });
          sw.check(combat.round <= laid + 11, "and not long after", { round: combat.round, laid });
        }
        await fill(c);
        await checkFailedCast(sw, c, "Dune Collapse", { targets: [a.doc.object] });
      });
    });

    it("NEVER WAS: a Reaction on the incoming attack card; the hit deals no damage and lays nothing; a failed cast leaves the blow; from the sheet with no card it is refused", async function () {
      this.timeout(600000);
      await sweepTest("Never Was", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW3 Never", { level: 11, spells: ["Never Was"],
          enemies: [{ name: "Raptor", x: AT.x + 300, y: AT.y + 200, health: 60 }], allies: [{ name: "ZZ SW3 Spared", x: AT.x + 200, y: AT.y + 200 }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Never Was");
        // From the sheet with no card: refused in words, nothing spent.
        const b0 = pools(c);
        let bare = null;
        const said0 = await warnings(async () => { bare = await castFromSheet(c, "Never Was", { targets: [tokenOf(ally)], face: 18, ms: 5000 }); });
        sw.check(!bare && said0.length > 0, "cast from the sheet with no attack card it is refused in words", said0);
        sw.check(pools(c).mana === b0.mana && pools(c).reactions === b0.reactions, "and spends nothing", { b0, now: pools(c) });
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const effects0 = ally.effects.map(e => e.id).sort();
        const attack = await creatureAttack(sw, raptor, tokenOf(ally), 19);
        if (!sw.check(Boolean(attack), "the Raptor's attack posted")) return;
        const af = flagsOf(attack);
        sw.log("attack", { total: attack.rolls?.[0]?.total, buttons: buttonsOn(attack), rows: af.damageByTarget });
        sw.check(Number(af.damageByTarget?.[0]?.damage) > 0, "the hit carries damage", af.damageByTarget);
        const before = pools(c);
        const hp = ally.system.health.value;
        const sel = '[data-sand-answer] button[data-spell-identifier="never-was"][data-target-index="0"]';
        if (!sw.check(Boolean(document.querySelector(`[data-message-id="${attack.id}"] ${sel}`)), "the attack card offers Never Was", buttonsOn(attack))) return;
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "spell").then(([m]) => { made.push(m); return m; }).catch(() => null);
        const p = await press(sw, attack, sel, { face: 18 });
        const cast = await posted;
        if (p) await p.release();
        if (!sw.check(Boolean(cast), "the Reaction cast posted a card")) return;
        sw.log("cast card", { text: textOf(live(cast)), buttons: buttonsOn(cast) });
        await sw.wait(() => manaOf(c).value === before.mana - Number(spell.system.mana), `paid ${spell.system.mana} Mana`);
        await sw.wait(() => pools(c).reactions === before.reactions - 1, "the Reaction spent", 10000);
        await sw.wait(() => flagsOf(attack).damageByTarget?.[0]?.withdrawn === true, "the hit written as no hit", 20000);
        const pa = await press(sw, attack, 'button[data-action="applyDamage"][data-target-index="0"]', { allowDisabled: true });
        if (pa) await pa.release();
        await sleep(5000);
        declineOpenAsk();
        sw.check(ally.system.health.value === hp, "the ally took nothing", { hp, now: ally.system.health.value });
        sw.check(json(ally.effects.map(e => e.id).sort()) === json(effects0), "and nothing was laid on it", ally.effects.map(e => e.name));
        await checkAnimation(sw, cast, true);
        // THE FAILED BRANCH: a second blow, the answer's Casting Test a natural 1: the Mana and the
        // Reaction are spent and the blow stands.
        await nextTurnUntil(c, combat);
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        await fill(c);
        const attack2 = await creatureAttack(sw, raptor, tokenOf(ally), 19);
        if (attack2) {
          const bf = pools(c);
          const posted2 = untilHook("createChatMessage", 30000, m => m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "spell").then(([m]) => { made.push(m); return m; }).catch(() => null);
          const p2 = await press(sw, attack2, sel, { face: 1 });
          const cast2 = await posted2;
          if (p2) await p2.release();
          if (sw.check(Boolean(cast2), "the failed answer posted a card")) {
            sw.check(flagsOf(cast2).success === false, "a natural 1 failed");
            await sw.wait(() => manaOf(c).value === bf.mana - Number(spell.system.mana), "the failure paid its Mana");
            await sleep(1500);
            sw.check(flagsOf(attack2).damageByTarget?.[0]?.withdrawn !== true, "the blow stands", flagsOf(attack2).damageByTarget?.[0]);
            await checkAnimation(sw, cast2, false);
            const hp2 = ally.system.health.value;
            const want = Number(flagsOf(attack2).damageByTarget?.[0]?.damage) || 0;
            const pa2 = await press(sw, attack2, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
            if (pa2) await pa2.release();
            await sw.wait(() => { declineOpenAsk(); return ally.system.health.value === Math.max(0, hp2 - want); }, `the standing blow's ${want} lands`, 30000);
          }
        }
      });
    });

    it("TEMPORAL SANCTUARY: allies within 15 ft gain no condition and what is on them does nothing and does not count down until they leave or the spell ends; an enemy inside is untouched; 3 Mana upkeep", async function () {
      this.timeout(600000);
      await sweepTest("Temporal Sanctuary", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW3 Sanct", { level: 11, spells: ["Temporal Sanctuary"],
          enemies: [{ name: "Raptor", x: AT.x + 200, y: AT.y + 100, health: 60 }], allies: [{ name: "ZZ SW3 Sheltered", x: AT.x + 100, y: AT.y }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Temporal Sanctuary");
        // On the ally before: a Stun (hand-toggled) and a timed effect of 3 rounds.
        await ally.toggleStatusEffect("stunned", { active: true });
        const stun = await sw.wait(() => ally.effects.find(e => e.statuses?.has("stunned")), "the ally Stunned");
        const [timed] = await ally.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Timed", img: "icons/svg/clockwork.svg",
          duration: { value: 3, units: "rounds", expiry: "turnEnd" }, start: { combat: combat.id, combatant: combat.getCombatantsByActor(ally)[0]?.id ?? null, round: combat.round, turn: combat.turn, time: game.time.worldTime },
          system: { changes: [{ key: "system.speed", type: "add", value: "5", phase: "final" }] } }]);
        const speed0 = ally.system.speed?.value ?? ally.system.speed;
        sw.log("timed before", { span: spanOf(timed), start: timed._source?.start });
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Temporal Sanctuary", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Temporal Sanctuary");
        await applyEffect(sw, card, { self: true });
        await sw.wait(() => c.effects.find(e => e.flags?.["azeroth-rpg"]?.sandAura?.kind === "sanctuary"), "the aura's carrier on the caster", 20000);
        await sw.wait(() => ally.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the aura on the ally", 30000);
        await sw.wait(() => ally.effects.get(stun.id)?.disabled === true && ally.effects.get(timed.id)?.disabled === true, "the Stun and the timed effect held", 30000);
        sw.check(!ally.statuses.has("stunned"), "a held Stun does nothing", statusesOf(ally));
        sw.check((ally.system.speed?.value ?? ally.system.speed) === speed0 - 5, "a held effect's change does nothing", { speed0, now: ally.system.speed });
        sw.check(!raptor.actor.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the enemy inside carries no Sanctuary", raptor.actor.effects.map(e => e.name));
        await sw.wait(() => c.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the caster is an ally of their own Sanctuary", 20000);
        await ally.toggleStatusEffect("prone", { active: true });
        await sleep(500);
        sw.check(!ally.statuses.has("prone"), "the ally gains no condition inside", statusesOf(ally));
        await raptor.actor.toggleStatusEffect("prone", { active: true });
        await sw.wait(() => raptor.actor.statuses.has("prone"), "the enemy inside still gains one", 10000);
        await checkAnimation(sw, card, true);
        // Two rounds pass: what is held does not count down; the upkeep is paid.
        const held0 = spanOf(ally.effects.get(timed.id));
        await checkUpkeep(sw, c, combat, spell, 3);
        await nextTurnUntil(c, combat);
        await stepTurn(combat);
        await nextTurnUntil(c, combat);
        sw.check(Boolean(ally.effects.get(timed.id)), "the held 3-round effect still stands", { round: combat.round });
        sw.log("timed while held", { span: spanOf(ally.effects.get(timed.id)), held0 });
        // End Sustain: the hold ends, the Stun and the timed effect resume with their rounds grown.
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !ally.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the aura lifted with the Sustain", 30000);
        await sw.wait(() => ally.effects.get(stun.id)?.disabled === false && ally.statuses.has("stunned"), "the Stun resumed", 30000);
        await sw.wait(() => ally.effects.get(timed.id)?.disabled === false, "the timed effect resumed", 30000);
        const resumed = ally.effects.get(timed.id);
        sw.log("timed resumed", { span: spanOf(resumed), start: resumed?._source?.start, round: combat.round });
        sw.check(Number(resumed?.duration?.remaining) >= 2, "it resumes with the rounds it had left, not fewer", { remaining: resumed?.duration?.remaining, span: spanOf(resumed) });
        await fill(c);
        await checkFailedCast(sw, c, "Temporal Sanctuary");
      });
    });

    it("SCOURING VEIL: a Half-Action; until the end of the caster's next turn each creature that hits the caster in melee takes 3 Physical less its AP and gains Decay 1", async function () {
      this.timeout(600000);
      await sweepTest("Scouring Veil", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW3 Veil", { level: 11, spells: ["Scouring Veil"], enemies: [{ name: "Raptor", x: AT.x + 100, y: AT.y, health: 80 }] });
        const raptor = foes[0];
        const spell = c.items.find(i => i.name === "Scouring Veil");
        // The fixture's character stands at its stored 10 Health; two bites of 7 would put the
        // caster in the Spirit Realm before its failed cast (A1, 06 §9). Its own maximum.
        await c.update({ "system.health.value": Math.max(40, c.system.health.max ?? 0) });
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Scouring Veil", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), rows: flagsOf(card).damageByTarget ?? null, retaliation: flagsOf(card).spellRetaliation ?? null });
        await checkPaid(sw, c, spell, before, card);
        sw.check(halvesOf(spell) === 1, "a Half-Action", spell.system.action);
        sw.check(!buttonsOn(card).some(b => b.action === "applyDamage"), "its 3 is never dealt at its own cast", buttonsOn(card));
        checkDC(sw, card, 16, "aimed at nothing");
        if (sw.check(buttonsOn(card).some(b => b.action === "applySpellEffect"), "the card offers the Apply that carries the Veil", buttonsOn(card))) await applyEffect(sw, card, { self: true });
        const veil = await sw.wait(() => c.effects.find(e => e.name?.includes("Scouring Veil") || e.flags?.["azeroth-rpg"]?.spellRetaliation), "the Veil on the caster", 20000);
        if (veil) sw.log("veil", { name: veil.name, span: spanOf(veil), start: veil._source?.start, flags: Object.keys(veil.flags?.["azeroth-rpg"] ?? {}) });
        await checkAnimation(sw, card, true);
        // The Raptor's turn: its bite hits the caster.
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const hpR = raptor.actor.system.health.value;
        const apR = raptor.actor.system.ap.body;
        const hpC = c.system.health.value;
        const bite = await creatureAttack(sw, raptor, tokenOf(c), 19);
        if (bite) {
          sw.log("bite", { rows: flagsOf(bite).damageByTarget, buttons: buttonsOn(bite) });
          const pb = await press(sw, bite, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
          if (pb) await pb.release();
          await sw.wait(() => { declineOpenAsk(); return c.system.health.value < hpC; }, "the bite landed on the caster", 30000);
          // The Veil answers on the bite's own card, as every retaliation does (D-692's struck-back
          // row): *Take N back* lands on the card's speaker, the Raptor.
          const back = '[data-action="applyDamage"][data-self="1"][data-struck-index="0"]';
          const drawn = await sw.wait(() => document.querySelector(`[data-message-id="${bite.id}"] button${back}`), "the bite's card offers the Veil's answer", 15000);
          if (drawn) {
            sw.check(new RegExp(`\\b${Math.max(0, 3 - apR)}\\b`).test(drawn.textContent), `it reads 3 less the Raptor's Body AP ${apR}`, drawn.textContent.trim());
            sw.log("the answer as drawn", { attrs: Object.fromEntries([...drawn.attributes].map(a => [a.name, a.value])), rows: flagsOf(bite).signatureRetaliations ?? null, resolution: flagsOf(bite).attackResolution?.targets?.[0] ?? null });
            // The answer is refused until the bite's own Apply has finished writing (D-888's
            // *Applying* to *Applied*): the Health moves before the record says so.
            await sw.wait(() => flagsOf(bite).attackResolution?.targets?.[0]?.stage === "applied", "the bite's Apply recorded as applied", 30000);
            const { heldSpellRetaliations } = await import("../effects/spell-retaliation-sources.mjs");
            sw.log("the Veil the door reads", heldSpellRetaliations(c));
            const said = await warnings(async () => { const pt = await press(sw, bite, `button${back}`); if (pt) await pt.release(); await sleep(4000); });
            sw.log("the answer's press said", said);
          }
          await sw.wait(() => raptor.actor.system.health.value === hpR - Math.max(0, 3 - apR), `the Raptor took 3 less Body AP ${apR}`, 20000);
          await sw.wait(() => decayValue(raptor.actor) === 1, "and gained Decay 1", 20000);
          sw.log("retaliation", { hpR, now: raptor.actor.system.health.value, decay: decayValue(raptor.actor) });
        }
        // Past the end of the caster's next turn the Veil is gone, and a bite then is not answered.
        await nextTurnUntil(c, combat);
        await stepTurn(combat);
        await sw.wait(() => !c.effects.find(e => e.id === veil?.id), "the Veil ended at the end of the caster's next turn", 20000);
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const hpR2 = raptor.actor.system.health.value;
        const hpC2 = c.system.health.value;
        const late = await creatureAttack(sw, raptor, tokenOf(c), 19);
        if (late) {
          const pl = await press(sw, late, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
          if (pl) await pl.release();
          await sw.wait(() => { declineOpenAsk(); return c.system.health.value < hpC2; }, "the late bite landed", 30000);
          await sleep(3000);
          sw.check(raptor.actor.system.health.value === hpR2, "a bite after the Veil is not answered", { hpR2, now: raptor.actor.system.health.value });
        }
        await fill(c);
        const saidFailed = await warnings(async () => { await checkFailedCast(sw, c, "Scouring Veil"); });
        sw.log("the failed cast's notices", { said: saidFailed, pools: pools(c), turn: combat.combatant?.name ?? null });
      });
    });
  });
}

/* -------------------------------------------- */
/*  Tier 4 and Divert Timeway                    */
/* -------------------------------------------- */

export function chronomancerSweepTier45Batch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: the six tier 4 sand spells and Divert Timeway through the real controls (stage 3)", function () {
    frame(context);

    it("EPOCH: 11 Physical less AP and Decay 2 (over a Decay 1, one effect); a failed Spirit Test Stuns to the end of its next turn; once a Short Rest; a failure lands nothing", async function () {
      this.timeout(600000);
      await sweepTest("Epoch", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW4 Epoch", { level: 16, spells: ["Epoch", "Sand Blast"], enemies: [
          { name: "Raptor", ...east(40), health: 120 }, { name: "Raptor", x: AT.x + 40 * FT, y: AT.y + 200, health: 120 }] });
        const [raptor, other] = foes;
        const spell = c.items.find(i => i.name === "Epoch");
        const rTurn = combatantOfToken(combat, raptor.doc);
        await decaySetup(raptor.actor, 1, c);
        await sw.wait(() => decayValue(raptor.actor) === 1, "a Decay 1 on the Raptor first");
        const ap0 = { body: raptor.actor.system.ap.body + 1 };
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Epoch", { targets: [raptor.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), sl: f.sl, rows: f.damageByTarget });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Number(spell.system.mana) === 17, "Epoch costs 17 Mana (D-886)", spell.system.mana);
        await sw.wait(() => decayValue(raptor.actor) === 2 && raptor.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]).length === 1, "Decay 2 replaces the 1: one effect, the higher X", 20000);
        const d = decayOf(raptor.actor);
        if (d) { sw.log("decay", { flag: d.flags["azeroth-rpg"][DECAY_FLAG], span: spanOf(d) }); sw.check(fightRoundsSpan(d, 10), "Decay 2 lasts a minute", spanOf(d)); }
        const row = f.damageByTarget?.[0] ?? {};
        sw.check(row.type === "physical" && (row.ward === null || row.ward === undefined || row.ward === 0), "Physical, no Ward", row);
        sw.log("body AP", { before: ap0.body, now: raptor.actor.system.ap.body, row });
        // **O-295** (the lead: *"Yes, decay AP reduction only counts if it's already applied."*):
        // the Decay 1 already on the Raptor counts; the Decay 2 this cast lays does not.
        sw.check(row.damage === Math.max(0, 11 - Math.max(0, ap0.body - 1)), `O-295: 11 less the Body AP with the standing Decay 1 (${Math.max(0, ap0.body - 1)}), never with the Decay 2 it lays (${Math.max(0, ap0.body - 2)})`, row);
        const r = await resistRow(sw, card, 0, 1);
        sw.check(r?.success === false, "the Spirit Test failed", r);
        await sw.wait(() => raptor.actor.statuses.has("stunned"), "Stunned");
        const stun = raptor.actor.effects.find(e => e.statuses?.has("stunned"));
        sw.log("stun span", { span: spanOf(stun), start: stun?._source?.start });
        await applyDamageRow(sw, card, 0, raptor.actor);
        await checkAnimation(sw, card, true);
        // A1: Stunned ends at the end of its next turn.
        await nextTurnUntil(rTurn, combat);
        sw.check(raptor.actor.statuses.has("stunned"), "still Stunned during its next turn");
        await stepTurn(combat);
        await sw.wait(() => !raptor.actor.statuses.has("stunned"), "the Stun ended at the end of its next turn (A1)", 20000);
        // 07 §4: once a Short Rest.
        await fill(c);
        await checkGate(sw, c, "Epoch", "short", { targets: [raptor.doc.object] });
        // A Short Rest reopens it; a passed Test lands the damage and the Decay and no Stun.
        await shortRestOf(c);
        await fill(c);
        await freshTurn(c, 2);
        const passed = await castFromSheet(c, "Epoch", { targets: [other.doc.object], face: 18 });
        if (sw.check(Boolean(passed), "after a Short Rest Epoch casts again")) {
          const r2 = await resistRow(sw, passed, 0, 20);
          sw.check(r2?.success === true, "a passed Spirit Test", r2);
          await sleep(1500);
          sw.check(!other.actor.statuses.has("stunned"), "a pass is not Stunned", statusesOf(other.actor));
          sw.check(decayValue(other.actor) === 2, "Decay 2 whatever the Test", decayValue(other.actor));
          await applyDamageRow(sw, passed, 0, other.actor);
        }
        await shortRestOf(c);
        await fill(c);
        await checkFailedCast(sw, c, "Epoch", { targets: [raptor.doc.object] });
        // 07 §4: an attempted casting spends the use, as it spends the Mana.
        await fill(c);
        await checkGate(sw, c, "Epoch", "short", { targets: [raptor.doc.object] });
      });
    });

    it("HOUR OF HASTE: each target gains a Half-Action on its next turn, and only that turn; once a Short Rest; out of a fight it is refused", async function () {
      this.timeout(600000);
      await sweepTest("Hour of Haste", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ SW4 Haste", { level: 16, spells: ["Hour of Haste"],
          enemies: [{ name: "Raptor", ...east(60), health: 60 }], allies: [{ name: "ZZ SW4 Haste A", x: AT.x + 100, y: AT.y }, { name: "ZZ SW4 Haste B", x: AT.x, y: AT.y + 100 }] });
        const [a, b] = friends;
        const spell = c.items.find(i => i.name === "Hour of Haste");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Hour of Haste", { targets: [tokenOf(a), tokenOf(b)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(Number(spell.system.mana) === 18, "Hour of Haste costs 18 Mana (D-886)", spell.system.mana);
        checkDC(sw, card, 18, "aimed at allies");
        const words = textOf(live(card));
        sw.check(words.includes(game.i18n.format("AZEROTH.Bloodlust.Line", { name: a.name, talent: "Hour of Haste" })) && words.includes(game.i18n.format("AZEROTH.Bloodlust.Line", { name: b.name, talent: "Hour of Haste" })), "the card says each gains a Half-Action on its next turn", words);
        await checkAnimation(sw, card, true);
        const aTurn = combat.getCombatantsByActor(a)[0];
        await nextTurnUntil(aTurn, combat);
        await sw.wait(() => aTurn.budget?.halfActions === 3, "A's next turn holds 3 Half-Actions", 20000);
        sw.log("A's budget", aTurn.budget);
        const bTurn = combat.getCombatantsByActor(b)[0];
        await nextTurnUntil(bTurn, combat);
        await sw.wait(() => bTurn.budget?.halfActions === 3, "B's next turn holds 3 Half-Actions", 20000);
        await nextTurnUntil(aTurn, combat);
        await sleep(1000);
        sw.check(aTurn.budget?.halfActions === 2, "the turn after is back to 2", aTurn.budget);
        // 07 §4's gate.
        await fill(c);
        await checkGate(sw, c, "Hour of Haste", "short", { targets: [tokenOf(a)] });
        // After a Short Rest: a failed cast gives nothing.
        await shortRestOf(c);
        await fill(c);
        const failed = await checkFailedCast(sw, c, "Hour of Haste", { targets: [tokenOf(a)] });
        if (failed) {
          await nextTurnUntil(aTurn, combat);
          await sleep(1000);
          sw.check(aTurn.budget?.halfActions === 2, "a failed Hour of Haste gives no Half-Action", aTurn.budget);
        }
        // Out of a fight: refused in words, nothing spent.
        await shortRestOf(c);
        await combat.delete();
        await sleep(1000);
        await fill(c);
        const b0 = pools(c);
        let out = null;
        // At the caster, who is their own ally whatever the Party says (D-755): out of a fight an
        // ally not in the Party is not willing (O-293, D-893) and would be refused for that first.
        const said = await warnings(async () => { out = await castFromSheet(c, "Hour of Haste", { targets: [tokenOf(c)], face: 18, ms: 5000 }); });
        sw.check(!out && said.some(w => w.includes("next turn")), "out of a fight it is refused in words", said);
        sw.check(manaOf(c).value === b0.mana, "and spends nothing", { b0, now: manaOf(c).value });
      });
    });

    it("TIMESLIP: up to six willing creatures each teleport up to 60 ft to a space picked, provoking nothing and charging no feet; past 60 ft the pick refuses; Resist and Apply still land after the move", async function () {
      this.timeout(600000);
      await sweepTest("Timeslip", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW4 Slip", { level: 16, spells: ["Timeslip", "Grit Lash"],
          enemies: [{ name: "Raptor", x: AT.x + 200, y: AT.y, health: 80 }], allies: [{ name: "ZZ SW4 Slipped", x: AT.x + 100, y: AT.y + 100 }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Timeslip");
        const allyTurn = combat.getCombatantsByActor(ally)[0];
        await freshTurn(c, 2);
        const before = pools(c);
        const allyBudget = json(allyTurn.budget);
        const casterAt = { x: tokenOf(c).document.x, y: tokenOf(c).document.y };
        const allyAt = { x: tokenOf(ally).document.x, y: tokenOf(ally).document.y };
        const watch = watchOffers();
        let card = null;
        const said = await warnings(async () => {
          const posting = castFromSheet(c, "Timeslip", { targets: [tokenOf(c), tokenOf(ally)], face: 18 });
          await until(pickActive, "the first space's pick armed");
          // Past 60 ft: refused, the pick waits.
          pressBoard({ x: casterAt.x + 70 * FT + 50, y: casterAt.y + 50 });
          await sleep(500);
          sw.check(pickActive(), "a space past 60 ft leaves the pick waiting");
          pressBoard({ x: casterAt.x + 50, y: casterAt.y + 50 * FT + 50 });
          await sleep(600);
          await until(pickActive, "the second space's pick armed");
          pressBoard({ x: allyAt.x + 50, y: allyAt.y + 50 * FT + 50 });
          card = await posting;
        });
        watch.stop();
        sw.log("refusals", said);
        sw.check(said.length > 0, "the far space was refused in words", said);
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), steps: flagsOf(card).steps });
        await checkPaid(sw, c, spell, before, card);
        await sw.wait(() => tokenOf(c).document.y === casterAt.y + 50 * FT && tokenOf(c).document.x === casterAt.x, "the caster teleported 50 ft", 20000);
        await sw.wait(() => tokenOf(ally).document.y === allyAt.y + 50 * FT && tokenOf(ally).document.x === allyAt.x, "the ally teleported 50 ft, away from the Raptor beside it", 20000);
        await sleep(1500);
        sw.check(!watch.offers.length, "the teleports provoked no Opportunity Attack", watch.offers);
        sw.check(pools(c).halves === before.halves - 2, "the caster's Action and no Move", { before, now: pools(c) });
        sw.check(json(allyTurn.budget) === allyBudget, "the ally's budget untouched", { allyBudget, now: allyTurn.budget });
        await checkAnimation(sw, card, true);
        readBoard(sw, "after Timeslip", [c, ally, raptor.actor]);
        // After the move: the Raptor follows (displaced, inside Grit Lash's 30 ft), and the
        // caster's Grit Lash resists and applies from the new space.
        const nextTo = { x: tokenOf(ally).document.x + 100, y: tokenOf(ally).document.y };
        await raptor.doc.move({ ...nextTo, action: "displace" });
        await sw.wait(() => raptor.doc.x === nextTo.x && raptor.doc.y === nextTo.y, "the Raptor displaced beside the moved ally", 15000);
        await sleep(1000);
        await freshTurn(c, 2);
        await fill(c);
        const lash = await castFromSheet(c, "Grit Lash", { targets: [raptor.doc.object], face: 18 });
        if (lash) { const rr = await resistRow(sw, lash, 0, 20); sw.check(rr?.success === true, "a Resist on a card cast after the move", rr); await applyDamageRow(sw, lash, 0, raptor.actor); }
        // And the moved ally's blow lands from the Raptor's card.
        await nextTurnUntil(combatantOfToken(combat, raptor.doc), combat);
        const hp = ally.system.health.value;
        const bite = await creatureAttack(sw, raptor, tokenOf(ally), 19);
        if (bite) {
          const want = Number(flagsOf(bite).damageByTarget?.[0]?.damage) || 0;
          const pb = await press(sw, bite, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
          if (pb) await pb.release();
          await sw.wait(() => { declineOpenAsk(); return ally.system.health.value === Math.max(0, hp - want); }, `the moved ally takes the ${want} from the card`, 30000);
        }
        // 07 §4's gate, then a failed cast after a Short Rest: every space picked, nobody moved.
        await fill(c);
        await checkGate(sw, c, "Timeslip", "short", { targets: [tokenOf(c)] });
        await shortRestOf(c);
        await fill(c);
        await freshTurn(c, 2);
        const at = { x: tokenOf(c).document.x, y: tokenOf(c).document.y };
        const failed = await castPicking(c, "Timeslip", { targets: [tokenOf(c)], face: 1, point: { x: at.x + 300 + 50, y: at.y + 50 } });
        if (sw.check(Boolean(failed), "the failed cast posted a card")) {
          sw.check(flagsOf(failed).success === false, "a natural 1 failed");
          await sleep(1500);
          sw.check(tokenOf(c).document.x === at.x && tokenOf(c).document.y === at.y, "a failed Timeslip moves nobody", { at, now: { x: tokenOf(c).document.x, y: tokenOf(c).document.y } });
          await checkAnimation(sw, failed, false);
        }
      });
    });

    it("DESERT'S WEIGHT: a 30 ft radius; every creature takes 10 Physical less AP and Decay 2; a failed Spirit Test is Slowed for the minute with a repeat Test at its turn's end; Difficult ground for the minute; once a Short Rest", async function () {
      this.timeout(600000);
      await sweepTest("Desert's Weight", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ SW4 Weight", { level: 16, spells: ["Desert's Weight"], enemies: [
          { name: "Raptor", ...east(80), health: 120 }, { name: "Raptor", x: AT.x + 80 * FT, y: AT.y + 200, health: 120 }] });
        const [a, b] = foes;
        const spell = c.items.find(i => i.name === "Desert's Weight");
        // The Body AP the blow meets: 07 writes *takes 10 Physical damage and gains Decay 2*, so the
        // card's number is worked out against the AP before the Decay it lays.
        const apA = a.actor.system.ap.body;
        const apB = b.actor.system.ap.body;
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Desert's Weight", { targets: [a.doc.object, b.doc.object], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const f = flagsOf(card);
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card), area: f.area, rows: f.damageByTarget });
        await checkPaid(sw, c, spell, before, card);
        sw.check(f.area?.shape === "circle" && f.area?.distanceFt === 30, "a 30 ft radius", f.area);
        checkDC(sw, card, 18, "an area");
        const region = await placeFrom(sw, card, { x: a.doc.object.center.x, y: a.doc.object.center.y + 100 });
        if (sw.check(Boolean(region), "Place area laid the weight")) {
          sw.log("region", { behaviors: [...region.behaviors].map(x => x.type), flags: region.flags?.["azeroth-rpg"] });
          await sw.wait(() => region.behaviors.size > 0, "the area is Difficult ground", 20000);
        }
        await sw.wait(() => decayValue(a.actor) === 2 && decayValue(b.actor) === 2, "Decay 2 on every creature caught", 20000);
        const ra = await resistRow(sw, card, 0, 1);
        const rb = await resistRow(sw, card, 1, 20);
        sw.check(ra?.success === false && rb?.success === true, "one failed, one passed", { ra, rb });
        await sw.wait(() => a.actor.statuses.has("slowed"), "the failure Slowed");
        sw.check(!b.actor.statuses.has("slowed"), "the success is not Slowed");
        const slowed = a.actor.effects.find(e => e.statuses?.has("slowed"));
        sw.log("slowed", { span: spanOf(slowed), escape: slowed?.flags?.["azeroth-rpg"]?.escape ?? null });
        sw.check(fightRoundsSpan(slowed, 10), "Slowed for the duration: a minute", spanOf(slowed));
        sw.check(Boolean(slowed?.flags?.["azeroth-rpg"]?.escape), "with its repeat Test", slowed?.flags?.["azeroth-rpg"]);
        sw.log("rows after the Tests", flagsOf(card).damageByTarget);
        const hpA = a.actor.system.health.value;
        const hpB = b.actor.system.health.value;
        await applyDamageRow(sw, card, 0, a.actor);
        sw.check(hpA - a.actor.system.health.value === Math.max(0, 10 - apA), `the failure took 10 less Body AP ${apA} (the AP before its Decay)`, { hpA, now: a.actor.system.health.value });
        const pb = await press(sw, card, 'button[data-action="applyDamage"][data-target-index="1"]:not([data-rider])');
        if (pb) await pb.release();
        await sw.wait(() => hpB - b.actor.system.health.value === Math.max(0, 10 - apB), `the success took the whole 10 less Body AP ${apB}: no half on a pass`, 30000);
        await checkAnimation(sw, card, true);
        // Its turn's end: the repeat Test, a success ends the Slowed and keeps the Decay.
        const prompt = escapePrompt(slowed?.id);
        await nextTurnUntil(combatantOfToken(combat, a.doc), combat);
        await stepTurn(combat);
        const pc = await prompt;
        if (sw.check(Boolean(pc), "the end of its turn posted the repeat Test")) {
          const p = await press(sw, pc, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 20 });
          await sw.wait(() => { declineOpenAsk(); return !a.actor.statuses.has("slowed"); }, "a success ended the Slowed", 30000);
          if (p) await p.release();
          sw.check(decayValue(a.actor) === 2, "the Decay stays", decayValue(a.actor));
        }
        await fill(c);
        await checkGate(sw, c, "Desert's Weight", "short", { targets: [a.doc.object] });
        await shortRestOf(c);
        await fill(c);
        await checkFailedCast(sw, c, "Desert's Weight", { targets: [a.doc.object] });
      });
    });

    it("PRISTINE TIMELINE: up to four allies cannot be Slowed, Entangled, Stunned or knocked Prone while sustained; other conditions still land; 4 Mana upkeep; End Sustain lifts it", async function () {
      this.timeout(600000);
      await sweepTest("Pristine Timeline", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ SW4 Pristine", { level: 16, spells: ["Pristine Timeline"],
          enemies: [{ name: "Raptor", ...east(60), health: 60 }], allies: [{ name: "ZZ SW4 Pristine A", x: AT.x + 100, y: AT.y }, { name: "ZZ SW4 Pristine B", x: AT.x, y: AT.y + 100 }] });
        const [a, b] = friends;
        const spell = c.items.find(i => i.name === "Pristine Timeline");
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Pristine Timeline", { targets: [tokenOf(a), tokenOf(b)], face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(halvesOf(spell) === 1, "a Half-Action", spell.system.action);
        sw.check(Boolean(sustainOf(c, spell)), "the caster sustains Pristine Timeline");
        checkDC(sw, card, 18, "aimed at allies");
        await applyEffect(sw, card, { index: 0 });
        await applyEffect(sw, card, { index: 1 });
        const ea = await sw.wait(() => a.effects.find(e => e.name?.includes("Pristine Timeline")), "laid on A", 20000);
        await sw.wait(() => b.effects.find(e => e.name?.includes("Pristine Timeline")), "laid on B", 20000);
        if (ea) sw.log("effect", { span: spanOf(ea), flags: ea.flags?.["azeroth-rpg"], changes: ea.system?.changes });
        for (const s of ["slowed", "entangled", "stunned", "prone"]) {
          await a.toggleStatusEffect(s, { active: true });
          await sleep(300);
          sw.check(!a.statuses.has(s), `A cannot be ${s}`, statusesOf(a));
        }
        await a.toggleStatusEffect("blinded", { active: true });
        await sw.wait(() => a.statuses.has("blinded"), "A can still be Blinded", 10000);
        await checkAnimation(sw, card, true);
        await checkUpkeep(sw, c, combat, spell, 4);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => !a.effects.find(e => e.name?.includes("Pristine Timeline")), "lifted from A with the Sustain", 20000);
        await a.toggleStatusEffect("prone", { active: true });
        await sw.wait(() => a.statuses.has("prone"), "A can be knocked Prone again", 10000);
        await fill(c);
        await checkGate(sw, c, "Pristine Timeline", "short", { targets: [tokenOf(a)] });
        await shortRestOf(c);
        await fill(c);
        await checkFailedCast(sw, c, "Pristine Timeline", { targets: [tokenOf(a)] });
      });
    });

    it("BASTION OF HOURS: the caster's AP rise by 2 at every location; each enemy within 10 ft takes a Bane on attacks against anyone but the caster; 4 Mana upkeep; End Sustain lifts both", async function () {
      this.timeout(600000);
      await sweepTest("Bastion of Hours", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ SW4 Bastion", { level: 16, spells: ["Bastion of Hours"],
          enemies: [{ name: "Raptor", x: AT.x + 200, y: AT.y, health: 60 }, { name: "Raptor", x: AT.x + 500, y: AT.y + 200, health: 60 }],
          allies: [{ name: "ZZ SW4 Guarded", x: AT.x + 200, y: AT.y + 100 }] });
        const [near, far] = foes;
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Bastion of Hours");
        const ap0 = apOf(c);
        await freshTurn(c, 2);
        const before = pools(c);
        const card = await castFromSheet(c, "Bastion of Hours", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.log("card", { text: textOf(live(card)), buttons: buttonsOn(card) });
        await checkPaid(sw, c, spell, before, card);
        sw.check(halvesOf(spell) === 1, "a Half-Action", spell.system.action);
        await applyEffect(sw, card, { self: true });
        await sw.wait(() => { const ap = apOf(c); return ["body", "head", "limb"].every(k => ap0[k] === null || ap[k] === ap0[k] + 2); }, `AP 2 higher at every location (${json(ap0)})`, 20000);
        const taunt = await sw.wait(() => near.actor.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane?.source === "Bastion of Hours"), "the near Raptor carries the Bane", 30000);
        if (taunt) sw.check(taunt.flags["azeroth-rpg"].laidBane.except?.actorId === c.id, "sparing the caster", taunt.flags["azeroth-rpg"].laidBane);
        await sleep(1000);
        sw.check(!far.actor.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane?.source === "Bastion of Hours"), "the Raptor 25 ft off carries none");
        await checkAnimation(sw, card, true);
        // The near Raptor's bite at the ally: a Bane; at the caster: none.
        await nextTurnUntil(combatantOfToken(combat, near.doc), combat);
        const atAlly = await creatureAttack(sw, near, tokenOf(ally), 15);
        if (atAlly) { sw.log("bite at the ally", d20sOf(atAlly)); sw.check(hasBane(atAlly), "the bite at the ally takes a Bane", d20sOf(atAlly)); }
        const atCaster = await creatureAttack(sw, near, tokenOf(c), 15);
        if (atCaster) { sw.log("bite at the caster", d20sOf(atCaster)); sw.check(!hasBane(atCaster), "the bite at the caster takes none", d20sOf(atCaster)); }
        await checkUpkeep(sw, c, combat, spell, 4);
        await endSustainFromSheet(sw, c, spell);
        await sw.wait(() => { const ap = apOf(c); return ["body", "head", "limb"].every(k => ap[k] === ap0[k]); }, "AP back with the Sustain", 20000);
        await sw.wait(() => !near.actor.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane?.source === "Bastion of Hours"), "the Bane lifted with it", 30000);
        await fill(c);
        await checkGate(sw, c, "Bastion of Hours", "short");
        await shortRestOf(c);
        await fill(c);
        await checkFailedCast(sw, c, "Bastion of Hours");
      });
    });

    it("DIVERT TIMEWAY: 30 Mana and a Full Action; the GM's undoing said on the card; the first casting costs only its Mana, a later one 2 Fatigue no rest removes and a Spirit's Tether, said before the Mana; no Tether refuses; once a Long Rest", async function () {
      this.timeout(600000);
      await sweepTest("Divert Timeway", assert, async sw => {
        const { c, foes, friends } = await chronoInFight("ZZ SW5 Divert", { level: 16, spells: ["Divert Timeway"],
          enemies: [{ name: "Raptor", ...east(40), health: 60 }], allies: [{ name: "ZZ SW5 Witness", x: AT.x + 100, y: AT.y }] });
        const raptor = foes[0];
        const ally = friends[0];
        const spell = c.items.find(i => i.name === "Divert Timeway");
        sw.check(Number(spell.system.mana) === 30 && spell.system.action === "full" && Number(spell.system.tier) === 5, "Mana 30, a Full Action, tier 5 (D-886)", { mana: spell.system.mana, action: spell.system.action, tier: spell.system.tier });
        await c.update({ "system.spiritTether.value": 1 });
        const fatigue0 = c.system.fatigue ?? 0;
        await freshTurn(c, 2);
        const before = pools(c);
        let card = null;
        const said = await notices(async () => { card = await castFromSheet(c, "Divert Timeway", { targets: [tokenOf(c), tokenOf(ally), raptor.doc.object], face: 18 }); });
        if (!sw.check(Boolean(card), "the first casting posted a card")) return;
        sw.log("first", { text: textOf(live(card)), buttons: buttonsOn(card), said });
        sw.check(said.includes(game.i18n.localize("AZEROTH.Divert.First")), "the first casting is said to cost only its Mana", said);
        sw.log("divert DC", { dc: live(card)?.rolls?.[0]?.options?.dc });
        await checkPaid(sw, c, spell, before, card);
        sw.check(textOf(live(card)).includes(game.i18n.localize("AZEROTH.Divert.GmDecides")), "the card says the undoing is the GM's", textOf(live(card)));
        sw.check(c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG) === 1, "the life count is 1", c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG));
        sw.check((c.system.fatigue ?? 0) === fatigue0 && c.system.spiritTether.value === 1, "the first casting takes no Fatigue and no Tether", { fatigue: c.system.fatigue, tether: c.system.spiritTether.value });
        await checkAnimation(sw, card, true);
        // Once a Long Rest.
        await fill(c);
        await checkGate(sw, c, "Divert Timeway", "long", { targets: [tokenOf(c)] });
        // A Long Rest, then the second casting: its price said before the Mana, then paid.
        await c.longRest();
        await sleep(1000);
        await fill(c);
        await freshTurn(c, 2);
        const b2 = pools(c);
        let second = null;
        const said2 = await notices(async () => { second = await castFromSheet(c, "Divert Timeway", { targets: [tokenOf(c)], face: 18 }); });
        if (sw.check(Boolean(second), "the second casting posted a card")) {
          sw.log("second", { text: textOf(live(second)), said: said2 });
          sw.check(said2.includes(game.i18n.format("AZEROTH.Divert.Price", { fatigue: 2, tether: 1 })), "the price is said before it is paid", said2);
          await checkPaid(sw, c, spell, b2, second);
          sw.check(textOf(live(second)).includes(game.i18n.format("AZEROTH.Divert.Paid", { name: c.name, fatigue: 2, tether: 1 })), "the card says the price paid", textOf(live(second)));
          await sw.wait(() => c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG) === 2 && c.system.spiritTether.value === 0, "the life count 2 and the Tether spent", 15000);
          sw.check((c.system.fatigue ?? 0) >= fatigue0 + 2 && (c.system.fatigueFloor ?? 0) >= 2, "2 Fatigue gained, on the floor", { fatigue: c.system.fatigue, floor: c.system.fatigueFloor });
        }
        // No rest removes it.
        await shortRestOf(c);
        await c.longRest();
        await sleep(1000);
        sw.check((c.system.fatigue ?? 0) >= 2, "no rest removes the 2 Fatigue", { fatigue: c.system.fatigue, floor: c.system.fatigueFloor });
        // No Tether left: refused in words, nothing spent, the gate untouched.
        await fill(c);
        await freshTurn(c, 2);
        const b3 = pools(c);
        let third = null;
        const said3 = await warnings(async () => { third = await castFromSheet(c, "Divert Timeway", { targets: [tokenOf(c)], face: 18, ms: 5000 }); });
        sw.check(!third, "a casting with no Tether posts no card");
        sw.check(said3.includes(game.i18n.format("AZEROTH.Divert.NoTether", { tether: 1 })), "refused in words", said3);
        sw.check(pools(c).mana === b3.mana && pools(c).halves === b3.halves, "nothing spent", { b3, now: pools(c) });
        sw.check((Number(c.getFlag("azeroth-rpg", SPELL_USES_FLAG)?.[spell.system.identifier]?.spent) || 0) === 0, "the gate left open", c.getFlag("azeroth-rpg", SPELL_USES_FLAG));
        // A failed casting (with a Tether): the Mana goes, and no life price is paid.
        await c.update({ "system.spiritTether.value": 1 });
        const count = c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG);
        const fat = c.system.fatigue;
        await fill(c);
        await checkFailedCast(sw, c, "Divert Timeway", { targets: [tokenOf(c)] });
        await sleep(1000);
        sw.check(c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG) === count && c.system.fatigue === fat && c.system.spiritTether.value === 1, "a failed casting is no casting: no count, no Fatigue, no Tether", { count: c.getFlag("azeroth-rpg", LIFE_COUNT_FLAG), fatigue: c.system.fatigue, tether: c.system.spiritTether.value });
      });
    });
  });
}

/** The Arcane Spellpower helper (stage 2's shape), local so the kit stays small. */
async function spellpowerKit() {
  return {
    async arcaneSpellpower(actor, n) {
      const [e] = await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Arcane Spellpower", img: "icons/svg/aura.svg",
        system: { changes: [{ key: "system.spellpower.arcane", type: "add", value: String(n), phase: "final" }] }
      }]);
      return e;
    }
  };
}

