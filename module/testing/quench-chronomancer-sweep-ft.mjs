/**
 * **THE CHRONOMANCER SWEEP, STAGE 4: THE EIGHT FEATURES AND THE THIRTY-SIX TALENTS, PLAYED LIKE
 * A PLAYER** (the lead's play-test, 2026-11-10: *"I need you to go through and test all features
 * and spells, there are too many issues I quickly found."*).
 *
 * Stages 2 and 3 swept the thirty-four spells. This stage plays 02 §7's eight features and 04's
 * three branches the same way, in a started fight with tokens on a viewed scene, through the
 * controls a player presses: the sheet's own Use and Cast, the roll dialog's lines, the Core
 * tab's Resilience chip, the card's own buttons as the chat log draws them (Resist, Apply, Block,
 * Parry, the offers' Reaction), a creature's own Attack from its sheet and the tracker's Next
 * Turn. After every press it reads the world - Health, conditions, effects, tokens, Regions,
 * Mana, Sand and the turn budget - against 02's and 04's words at the rank taken, and the
 * refusals: wrong target, out of range (D-893), not willing (D-894), no Hourglass, the gates.
 *
 * Earlier batches (`chronomancer-features`, `-talents`, `-guardian`, `-playtest`) already hold
 * the main line of each item; this one holds what they left: every rank's number, every refusal
 * path, and every press a player makes that they made by a direct call.
 *
 * **A SOFT CHECK A STEP** (stage 2's kit): every check is a `SWEEP` line in the run's progress
 * file, and a failed one is collected, so one run reports every fault an item has.
 *
 * Three batches, each run alone with `QUENCH_BATCH`: `azeroth-rpg.chronomancer-sweep-features`,
 * `azeroth-rpg.chronomancer-sweep-talents` (Shifting Sands and Chronoweaver) and
 * `azeroth-rpg.chronomancer-sweep-guardian` (Guardian of Time and Sand itself).
 */

import { give, made, makeCharacter, makeNpc, openSheet, pinDie, settle, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import { HASTENED_FLAG } from "../rules/chromatic-talents.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { DEFERRED_FLAG } from "../rules/deferred-damage.mjs";
import { FIELD_FLAG } from "../rules/guardian.mjs";
import { MASTER_FLAG, SUSPEND_FLAG } from "../rules/chronomancer.mjs";
import { disengage } from "../applications/combat-actions.mjs";
import { givenReactionsLeft } from "../rules/initiative.mjs";
import {
  answerAskIfAny, castFromSheet, chronoInFight, featureNamed, freshTurn, manaOf, nextTurnUntil, pick, pressCard, sandOf, talentNamed,
  textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import {
  AT, FT, buttonsOn, creatureAttack, decayValue, declineOpenAsk, flagsOf, frame, live, placeFrom, pools,
  sleep, stepTurn, sweepTest
} from "./quench-chronomancer-sweep-t12.mjs";

/* -------------------------------------------- */
/*  Stage 4's own helpers                        */
/* -------------------------------------------- */

/**
 * **PRESS A FEATURE'S USE ON THE SHEET** at the tokens targeted, the dialog skipped and the die
 * pinned, and answer what came of it: the card (null where the Use was refused), every warning
 * said, and whether the control was drawn greyed (a refusal said by the sheet itself).
 * `during` runs after the click, before the card is awaited (a chooser, a pick, an ask).
 */
async function useSheet(actor, featureName, { targets = [], face = 15, ms = 8000, during = null } = {}) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
    ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) { await sheet.close(); canvas.tokens?.setTargets([]); throw new Error(`the sheet draws no Use for ${featureName}`); }
  if (control.disabled) {
    const words = (control.closest("[data-item-id]")?.textContent ?? "").replace(/\s+/g, " ").trim();
    await sheet.close();
    canvas.tokens?.setTargets([]);
    return { card: null, said: [], disabled: true, words, feature };
  }
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  let card = null;
  try {
    const said = await warnings(async () => {
      const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "feature")
        .then(([m]) => { made.push(m); return m; }).catch(() => null);
      control.click();
      if (during) await during();
      card = await posted;
    });
    return { card, said, disabled: false, feature };
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Whether any warning said includes every one of these fragments. */
const saidAll = (said, ...parts) => (said ?? []).some(w => parts.every(p => String(w).includes(String(p))));

/**
 * **THE ROLL DIALOG'S TALENT LINES FOR A CAST, AS DRAWN**: the sheet's Cast pressed with the
 * dialog forced open, every `tline-` box read (name, greyed, the reason beside it), and the
 * dialog closed with nothing cast.
 */
async function dialogLines(actor, spellName, { targets = [] } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  try {
    control.click();
    const dialog = await until(() => {
      const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
      return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
    }, `${spellName}'s roll dialog`);
    const lines = [...dialog.element.querySelectorAll('input[name^="tline-"]')].map(box => ({
      id: box.name.slice(6), disabled: box.disabled, checked: box.checked,
      text: (box.closest("label, li, .azeroth-roll-line, div")?.textContent ?? "").replace(/\s+/g, " ").trim()
    }));
    await dialog.close();
    await sleep(300);
    return lines;
  } finally {
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Fill a pool to a value (clamped to its maximum) and wait until it reads so. */
async function setSand(actor, value) {
  const pool = sandOf(actor);
  const v = Math.min(pool.max, value);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: v });
  await until(() => sandOf(actor).value === v, `${v} Sand`);
}

/** The caster's Mana back to full. */
async function fillMana(c) {
  const mana = manaOf(c);
  if (mana && mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  await until(() => manaOf(c).value === manaOf(c).max, "the Mana full");
}

/** The combatant of a creature in a fight: a character by its actor, a creature by its token. */
const combatantFor = (combat, who) => who?.doc ? combat.combatants.find(x => x.tokenId === who.doc.id) : combat.getCombatantsByActor(who)[0];

/** A d20 run pinned through core's mapping in turn (`fixtures.pinDie`'s formula), a 1 once spent. */
function pinFaces(faces) {
  const original = CONFIG.Dice.randomUniform;
  const queue = [...faces];
  CONFIG.Dice.randomUniform = () => (20 - (queue.length ? queue.shift() : 1)) / 20 + 0.001;
  return () => { CONFIG.Dice.randomUniform = original; };
}

/**
 * **A GUARDIAN OF TIME** in a started fight: a Human Chronomancer in mail behind a kite shield
 * with a longsword, Bronzed Steel taken and these ranks, its Epic Hourglass in the Ranged slot,
 * Sand to `sand`, its token at AT; `allies` linked friendly Warriors, `enemies` unlinked hostile
 * creatures from the bestiary.
 */
async function guardianInFight(name, { level = 20, ranks = {}, sand = 0, shield = true, allies = [], enemies = [] } = {}) {
  const c = await makeCharacter({
    name, classes: [["Chronomancer", level]], race: "Human", bags: ["Hourglass"],
    weapons: ["Longsword"], armor: [...(shield ? ["Kite shield"] : []), "Mail hauberk"], abilities: { str: 16, int: 18, con: 14 }
  });
  await c._talentGrant;
  for (const [talent, taken] of Object.entries({ "Bronzed Steel": 1, ...ranks })) {
    const item = await until(() => talentNamed(c, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
    await until(() => talentNamed(c, talent)?.system?.taken === taken, `${talent} at rank ${taken}`);
  }
  for (const n of ["Longsword", ...(shield ? ["Kite shield"] : []), "Mail hauberk"]) {
    const item = await until(() => c.items.find(i => i.name === n), `${n} carried`);
    await item.update({ "system.equipped": true });
    await until(() => c.items.get(item.id)?.system?.equipped === true, `${n} worn`);
  }
  const glass = await until(() => c.items.find(i => i.name === "Hourglass"), "the Hourglass carried");
  await glass.update({ "system.rarity": "epic", "system.equipped": true });
  await until(() => (sandOf(c)?.max ?? 0) > 0, "the Sand cap");
  await setSand(c, sand);
  await c.update({ "system.health.value": c.system.health.max });
  const friends = [];
  for (const a of allies) friends.push({ actor: await makeCharacter({ name: a.name, classes: a.classes ?? [["Warrior", 5]] }), x: a.x, y: a.y });
  const scene = await Scene.create({ name: "ZZ Guardian Sweep", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const p of [{ actor: c, ...AT }, ...friends]) {
    await p.actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(p.actor, { x: p.x, y: p.y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }));
  }
  await scene.createEmbeddedDocuments("Token", data);
  await until(() => [c, ...friends.map(f => f.actor)].every(a => tokenDrawn(tokenOf(a))), "every token drawn");
  const foes = [];
  for (const e of enemies) {
    const base = await makeNpc(e.name);
    if (e.health) await base.update({ "system.health.value": e.health, "system.health.max": e.health });
    const [doc] = await scene.createEmbeddedDocuments("Token", [await tokenData(base, { x: e.x, y: e.y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
    await until(() => tokenDrawn(doc.object), `${e.name}'s token drawn`);
    foes.push({ base, doc, get actor() { return doc.actor; } });
  }
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", [
    ...[c, ...friends.map(f => f.actor)].map(a => ({ actorId: a.id, sceneId: scene.id, tokenId: tokenOf(a)?.id })),
    ...foes.map(f => ({ actorId: f.base.id, sceneId: scene.id, tokenId: f.doc.id }))
  ]);
  const settled = untilHook("combatTurnChange", 60000, x => x.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(x => x.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's budget", 30000);
  await settle();
  return { c, scene, combat, foes, friends: friends.map(f => f.actor) };
}

/** Press a card's Apply on row 0 and answer the blow's ask, if one opens, with `yes`. */
async function applyAnswering(sw, card, yes) {
  const p = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])').catch(err => { sw.fail("pressing Apply", err); return null; });
  if (!p) return false;
  const asked = await answerAskIfAny(yes, 8000);
  await p.release();
  await sleep(800);
  return asked;
}

const deferredOf = actor => actor.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? [];

/** A creature whose first attack deals 12, so a blow gets through a Guardian's mail. */
async function hardHitter(foe) {
  const rows = (foe.actor.system.attacks ?? []).map((a, i) => (i === 0 ? { ...a, damage: 12 } : { ...a }));
  await foe.actor.update({ "system.attacks": rows });
  await until(() => foe.actor.system.attacks?.[0]?.damage === 12, `${foe.actor.name}'s blow raised to 12`);
}

/* -------------------------------------------- */
/*  Batch 1: the eight features                  */
/* -------------------------------------------- */

export function chronomancerSweepFeaturesBatch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: the eight features of 02 §7 through the real controls (stage 4)", function () {
    frame(context);

    it("TIMELESS MIND: the Core tab's Spirit chip rolls with the Proficiency twice, and the Body chip with it once", async function () {
      this.timeout(240000);
      await sweepTest("Timeless Mind", assert, async sw => {
        const { c } = await chronoInFight("ZZ S4 Timeless", { level: 1, enemies: [] });
        const prof = c.system.proficiency;
        const roll = async resilience => {
          const sheet = await openSheet(c);
          const chip = sheet.element.querySelector(`[data-action="rollResilience"][data-resilience="${resilience}"]`);
          if (!sw.check(Boolean(chip), `the Core tab draws the ${resilience} chip`)) { await sheet.close(); return null; }
          const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
          await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
          const unpin = pinDie(10);
          const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === c.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
          try { chip.click(); return await posted; } finally { unpin(); await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); await sheet.close(); }
        };
        const spirit = await roll("spirit");
        if (sw.check(Boolean(spirit), "the Spirit chip posted a card")) {
          const rows = spirit.rolls[0].options.provenance ?? [];
          sw.log("spirit rows", rows);
          const timeless = rows.filter(r => r.label === "AZEROTH.Chrono.TimelessMindRow");
          sw.check(timeless.length === 1 && Number(timeless[0].value) === prof, `one Timeless Mind row worth the Proficiency ${prof}`, rows);
          const sum = rows.reduce((n, r) => n + (Number(r.value) || 0), 0);
          sw.check(spirit.rolls[0].total === 10 + sum, "the total is the die and every row", { total: spirit.rolls[0].total, sum });
        }
        const body = await roll("body");
        if (body) sw.check(!(body.rolls[0].options.provenance ?? []).some(r => r.label === "AZEROTH.Chrono.TimelessMindRow"), "no Timeless Mind row on Body");
      });
    });

    it("ANOTHER TIMELINE: an enemy's real Attack at an ally asks it; refused below 2 Mana; a yes pays 2 Mana and the Reaction and rolls again", async function () {
      this.timeout(420000);
      await sweepTest("Another Timeline", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ S4 Timeline", {
          level: 1, allies: [{ name: "ZZ S4 Timeline Ally", x: AT.x + 15 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }]
        });
        const raptor = foes[0];
        const ally = friends[0];
        const mana = manaOf(c);
        // Below 2 Mana: nothing is asked.
        await c.updatePool({ itemId: mana.itemId, kind: "power", value: 1 });
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        const first = creatureAttack(sw, raptor, tokenOf(ally), 3);
        const askedPoor = await answerAskIfAny(true, 5000);
        const firstCard = await first;
        sw.check(!askedPoor, "no ask with 1 Mana");
        if (firstCard) sw.check(!firstCard.rolls[0].options.anotherTimeline, "the Test was not rolled again", firstCard.rolls[0].options);
        sw.check(manaOf(c).value === 1, "nothing spent", manaOf(c));
        // A round on, with the Mana: asked, paid, rolled again.
        await fillMana(c);
        await stepTurn(combat);
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        const reactionsBefore = combatantFor(combat, c).budget.reactions;
        const second = creatureAttack(sw, raptor, tokenOf(ally), 3);
        const asked = await answerAskIfAny(true, 15000);
        const card = await second;
        sw.check(asked, "the Chronomancer was asked in the Raptor's Attack Test");
        if (sw.check(Boolean(card), "the attack posted a card")) {
          const tl = card.rolls[0].options.anotherTimeline;
          sw.check(Boolean(tl) && tl.totals?.length === 2, "the card carries both results", tl);
          sw.log("card", { text: textOf(live(card)) });
        }
        await sw.wait(() => manaOf(c).value === manaOf(c).max - 2, "2 Mana paid");
        sw.check(reactionsBefore === 1 && combatantFor(combat, c).budget.reactions === 0, "the Reaction spent", { reactionsBefore, now: combatantFor(combat, c).budget.reactions });
      });
    });

    it("SLIPSTREAM with Swift Current 2 and Twinned Hours 2: an ally at 45 feet for 2 Mana, then the Chronomancer itself; a third refused; without them 45 feet is refused, an enemy too", async function () {
      this.timeout(420000);
      await sweepTest("Slipstream (Swift Current, Twinned Hours)", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ S4 Slip", {
          level: 9, ranks: { "Swift Current": 2, "Twinned Hours": 2 },
          allies: [{ name: "ZZ S4 Slip Far", x: AT.x + 45 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y + 400, health: 200 }]
        });
        const far = friends[0];
        const slip = featureNamed(c, "Slipstream");
        sw.check(slip.system.uses.max === 2 && slip.system.cost?.amount === 2, "the restamp: two uses, 2 Mana", { uses: slip.system.uses, cost: slip.system.cost });
        await freshTurn(c, 2);
        const b0 = pools(c);
        const one = await useSheet(c, "Slipstream", { targets: [tokenOf(far)] });
        sw.check(Boolean(one.card), "an ally at 45 feet takes it (Swift Current: 60 feet)", one.said);
        if (one.card) {
          await sw.wait(() => far.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Slipstream"), "the Half-Action laid on the ally");
          await sw.wait(() => manaOf(c).value === b0.mana - 2, "2 Mana paid (Swift Current 2)");
          sw.check(pools(c).halves === b0.halves - 1, "a Half-Action spent", { b0, now: pools(c) });
        }
        const self = await useSheet(c, "Slipstream", { targets: [tokenOf(c)] });
        sw.check(Boolean(self.card), "the Chronomancer may be the one (Twinned Hours 2)", self.said);
        if (self.card) await sw.wait(() => c.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Slipstream"), "the Half-Action laid on the Chronomancer");
        await sw.wait(() => featureNamed(c, "Slipstream").system.uses.value === 0, "both uses struck");
        // Without the talents: 45 feet is past 30, and an enemy is no ally.
        const { c: c2, foes: foes2, friends: friends2, combat: combat2 } = await chronoInFight("ZZ S4 Slip Plain", {
          level: 9, allies: [{ name: "ZZ S4 Slip Plain Far", x: AT.x + 45 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }]
        });
        await freshTurn(c2, 2);
        const p0 = pools(c2);
        const tooFar = await useSheet(c2, "Slipstream", { targets: [tokenOf(friends2[0])] });
        sw.check(!tooFar.card && saidAll(tooFar.said, "45 feet", "30 feet"), "45 feet refused naming the 30", tooFar.said);
        const enemy = await useSheet(c2, "Slipstream", { targets: [foes2[0].doc.object] });
        sw.check(!enemy.card && enemy.said.length > 0, "an enemy refused in words", enemy.said);
        sw.check(JSON.stringify(pools(c2)) === JSON.stringify(p0), "the refusals spent nothing", { p0, now: pools(c2) });
        void combat; void combat2;
      });
    });

    it("TURN THE GLASS: Sand equal to the tier to the Common glass's 5, said on the card; at a full glass and with no Hourglass it is cast, paid for, gains 0 and says so (D-898)", async function () {
      this.timeout(300000);
      await sweepTest("Turn the Glass", assert, async sw => {
        const { c } = await chronoInFight("ZZ S4 Glass", { level: 11, rarity: "common", enemies: [{ name: "Raptor", x: AT.x + 40 * FT, y: AT.y, health: 200 }] });
        const tier = c.system.tier;
        sw.check(sandOf(c).max === 5, "a Common glass holds 5", sandOf(c));
        await freshTurn(c, 2);
        const b0 = pools(c);
        const first = await useSheet(c, "Turn the Glass");
        if (sw.check(Boolean(first.card), "the first Use posted a card", first.said)) {
          await sw.wait(() => sandOf(c).value === tier, `${tier} Sand gained`);
          sw.check(manaOf(c).value === b0.mana - 6 && pools(c).halves === b0.halves - 1, "6 Mana and a Half-Action", { b0, now: pools(c) });
          sw.log("card", { text: textOf(live(first.card)) });
          sw.check(textOf(live(first.card)).includes(String(tier)), "the card says the Sand gained");
        }
        const second = await useSheet(c, "Turn the Glass");
        if (second.card) await sw.wait(() => sandOf(c).value === 5, "held to the glass's cap of 5");
        // **A FULL GLASS** (the lead, Stage 5: *"305 glass - let the player cast this, it's their own
        // mistake."*): cast, 6 Mana and a Half-Action paid, 0 Sand, and the card says Gained 0.
        await fillMana(c);
        await freshTurn(c, 2);
        const f0 = pools(c);
        const full = await useSheet(c, "Turn the Glass");
        if (sw.check(Boolean(full.card), "at a full glass the Use is cast, not refused", full.said)) {
          await sw.wait(() => manaOf(c).value === f0.mana - 6, "6 Mana paid at a full glass");
          sw.check(pools(c).halves === f0.halves - 1, "and a Half-Action", { f0, now: pools(c) });
          sw.check(sandOf(c).value === 5, "and the glass stays at its 5", sandOf(c));
          const said = game.i18n.format("AZEROTH.Card.Gained", { amount: 0, pool: game.i18n.localize(CONFIG.AZEROTH.poolTypes.sand ?? "sand") });
          sw.check(textOf(live(full.card)).includes(said), `the card says ${said}`, { text: textOf(live(full.card)) });
        }
        // **NO HOURGLASS** (the lead, Stage 5: *"02 can have a message that requires the hourglass if
        // they cast without one for the"* - cut off; the orchestrator's reading): cast, paid for, 0
        // Sand, and the card and a notice say it needs an Hourglass in the Ranged slot.
        await c.items.find(i => i.name === "Hourglass").update({ "system.equipped": false });
        await sw.wait(() => (sandOf(c)?.max ?? 0) === 0, "no Sand without the glass");
        await fillMana(c);
        await freshTurn(c, 2);
        const n0 = pools(c);
        const bare = await useSheet(c, "Turn the Glass");
        const notice = game.i18n.format("AZEROTH.Chrono.NoGlass", { name: "Turn the Glass" });
        if (sw.check(Boolean(bare.card), "with no Hourglass the Use is cast, not refused", bare.said)) {
          await sw.wait(() => manaOf(c).value === n0.mana - 6, "6 Mana paid with no glass");
          sw.check(pools(c).halves === n0.halves - 1, "and a Half-Action", { n0, now: pools(c) });
          sw.check((sandOf(c)?.value ?? 0) === 0, "and no Sand", sandOf(c));
          sw.check(textOf(live(bare.card)).includes(notice), "the card says it needs an Hourglass", { text: textOf(live(bare.card)) });
        }
        sw.check(saidAll(bare.said, notice), "and the player is told", bare.said);
      });
    });

    it("SUSPEND: past 30 feet refused; an enemy's failed Spirit Test holds it, immune, until its turn ends; a willing ally is held at once with no Test offered", async function () {
      this.timeout(480000);
      await sweepTest("Suspend", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ S4 Suspend", {
          level: 14, allies: [{ name: "ZZ S4 Held Ally", x: AT.x + 10 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 35 * FT, y: AT.y, health: 200 }]
        });
        const raptor = foes[0];
        const ally = friends[0];
        await freshTurn(c, 2);
        const b0 = pools(c);
        const far = await useSheet(c, "Suspend", { targets: [raptor.doc.object] });
        sw.check(!far.card && saidAll(far.said, "35 feet", "30 feet"), "35 feet refused naming the 30", far.said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(b0), "nothing spent", { b0, now: pools(c) });
        await raptor.doc.move({ x: AT.x + 25 * FT, y: AT.y, action: "displace" });
        await sw.wait(() => raptor.doc.x === AT.x + 25 * FT, "the Raptor 25 feet off");
        const used = await useSheet(c, "Suspend", { targets: [raptor.doc.object] });
        if (!sw.check(Boolean(used.card), "the Use posted a card", used.said)) return;
        await sw.wait(() => manaOf(c).value === b0.mana - 8, "8 Mana paid");
        sw.check(pools(c).halves === b0.halves - 2, "an action: both Half-Actions", { b0, now: pools(c) });
        sw.check(buttonsOn(used.card).some(b => b.action === "resistTest"), "the card offers the Raptor's Spirit Test", buttonsOn(used.card));
        sw.check(!raptor.actor.statuses.has("stunned"), "nothing lands before the Test");
        const r = await pressCard(used.card, 'button[data-action="resistTest"]', { face: 1 }).catch(err => { sw.fail("the Resist", err); return null; });
        if (r) { try { await sleep(500); declineOpenAsk(); await sw.wait(() => raptor.actor.effects.find(e => e.getFlag("azeroth-rpg", SUSPEND_FLAG)), "the hold laid on a failure"); } finally { await r.release(); } }
        sw.check(raptor.actor.statuses.has("stunned"), "Stunned");
        const hp = raptor.actor.system.health.value;
        await raptor.actor.applyDamage(6, { struck: true, attack: true });
        sw.check(raptor.actor.system.health.value === hp, "immune to damage while held", { hp, now: raptor.actor.system.health.value });
        // Until the end of ITS next turn.
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        sw.check(raptor.actor.statuses.has("stunned"), "still held on its own turn");
        await stepTurn(combat);
        await sw.wait(() => !raptor.actor.effects.find(e => e.getFlag("azeroth-rpg", SUSPEND_FLAG)) && !raptor.actor.statuses.has("stunned"), "the hold ends with its turn");
        // A willing ally: held at once, and its card offers no Test it would never want.
        await freshTurn(c, 2);
        await fillMana(c);
        const willing = await useSheet(c, "Suspend", { targets: [tokenOf(ally)] });
        if (sw.check(Boolean(willing.card), "the ally's Use posted a card", willing.said)) {
          await sw.wait(() => ally.statuses.has("stunned") && ally.effects.find(e => e.getFlag("azeroth-rpg", SUSPEND_FLAG)), "the willing ally held at once");
          sw.check(!buttonsOn(willing.card).some(b => b.action === "resistTest"), "no Spirit Test offered to a willing ally", buttonsOn(willing.card));
          sw.log("willing card", { text: textOf(live(willing.card)) });
        }
      });
    });

    it("RECALL: half the Intelligence modifier, rounded down: +2 gives one use, +1 gives none and the Use is refused with nothing spent", async function () {
      this.timeout(240000);
      await sweepTest("Recall uses", assert, async sw => {
        const { c } = await chronoInFight("ZZ S4 Recall One", { level: 9, abilities: { int: 14, con: 14 }, enemies: [] });
        sw.check(featureNamed(c, "Recall").system.uses.max === 1, "+2 gives one use", featureNamed(c, "Recall").system.uses);
        const { c: none } = await chronoInFight("ZZ S4 Recall None", { level: 9, abilities: { int: 12, con: 14 }, enemies: [] });
        sw.check(featureNamed(none, "Recall").system.uses.max === 0, "+1 gives none", featureNamed(none, "Recall").system.uses);
        await freshTurn(none, 2);
        const b0 = pools(none);
        const tried = await useSheet(none, "Recall");
        sw.check(!tried.card && (tried.disabled || tried.said.length > 0), "refused, in words or greyed", tried);
        sw.check(JSON.stringify(pools(none)) === JSON.stringify(b0), "nothing spent", { b0, now: pools(none) });
      });
    });

    it("RECURRENCE and MASTER OF HOURS: refused out of a fight; the gift refused past 30 feet and below 2 Sand, and costs no Half-Action", async function () {
      this.timeout(420000);
      await sweepTest("Recurrence and Master of Hours", assert, async sw => {
        // Out of a fight: a token on a scene, no combat.
        const lone = await (await import("./quench-chronomancer-common.mjs")).chronomancerWith("ZZ S4 Lone", { level: 20 });
        await (await import("./quench-chronomancer-common.mjs")).sceneWith([{ actor: lone, ...AT }]);
        const m0 = manaOf(lone).value;
        const rec = await useSheet(lone, "Recurrence");
        sw.check(!rec.card && rec.said.some(w => w.includes("started fight")), "Recurrence refused out of a fight", rec.said);
        const mas = await useSheet(lone, "Master of Hours");
        sw.check(!mas.card && mas.said.length > 0, "Master of Hours refused out of a fight", mas.said);
        sw.check(manaOf(lone).value === m0, "nothing spent", manaOf(lone));
        // In a fight: the gift's reach and its Sand.
        const { c, combat, friends } = await chronoInFight("ZZ S4 Master", {
          level: 20, sand: 3,
          allies: [{ name: "ZZ S4 Master Near", x: AT.x + 20 * FT, y: AT.y }, { name: "ZZ S4 Master Far", x: AT.x + 40 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y + 600, health: 200 }]
        });
        const [near, farAlly] = friends;
        await freshTurn(c, 2);
        const started = await useSheet(c, "Master of Hours");
        if (!sw.check(Boolean(started.card), "Master of Hours posted a card", started.said)) return;
        await sw.wait(() => c.effects.find(e => e.getFlag("azeroth-rpg", MASTER_FLAG)), "it runs");
        const b0 = pools(c);
        const tooFar = await useSheet(c, "Master of Hours", { targets: [tokenOf(farAlly)] });
        sw.check(!tooFar.card && saidAll(tooFar.said, "30 feet"), "the gift past 30 feet refused naming the 30", tooFar.said);
        const gift = await useSheet(c, "Master of Hours", { targets: [tokenOf(near)] });
        if (sw.check(Boolean(gift.card), "the gift posted a card", gift.said)) {
          await sw.wait(() => sandOf(c).value === b0.sand - 2, "2 Sand paid");
          sw.check(manaOf(c).value === b0.mana && pools(c).halves === b0.halves, "no Mana and no Half-Action", { b0, now: pools(c) });
          await sw.wait(() => near.effects.find(e => e.getFlag("azeroth-rpg", HASTENED_FLAG)?.source === "Master of Hours"), "the ally's Half-Action laid");
        }
        const poor = await useSheet(c, "Master of Hours", { targets: [tokenOf(near)] });
        sw.check(!poor.card && saidAll(poor.said, "2 Sand"), "a second gift with 1 Sand refused naming the 2", poor.said);
        await nextTurnUntil(near, combat);
        await sw.wait(() => combat.getCombatantsByActor(near)[0].budget.halfActions === 3, "the ally holds 3 Half-Actions on its next turn");
      });
    });
  });
}

/* -------------------------------------------- */
/*  Batch 2: Shifting Sands and Chronoweaver     */
/* -------------------------------------------- */

export function chronomancerSweepTalentsBatch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: Shifting Sands and Chronoweaver through the real controls (stage 4)", function () {
    frame(context);

    it("GRIT OF AGES at rank 1: the dialog offers 1 or 2 damage or 1 SL (twice the rank) and no more; greyed with the reason past the Sand held", async function () {
      this.timeout(240000);
      await sweepTest("Grit of Ages rank 1", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ S4 Grit", { level: 5, ranks: { "Grit of Ages": 1 }, spells: ["Grit Lash"], sand: 1, enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }] });
        await freshTurn(c, 1);
        const lines = await dialogLines(c, "Grit Lash", { targets: [foes[0].doc.object] });
        sw.log("lines", lines);
        const grit = lines.filter(l => l.id.startsWith("grit-")).map(l => l.id).sort();
        sw.check(JSON.stringify(grit) === JSON.stringify(["grit-damage1", "grit-damage2", "grit-sl1"]), "rank 1: damage 1 and 2, SL 1", grit);
        const byId = Object.fromEntries(lines.map(l => [l.id, l]));
        sw.check(byId["grit-damage1"]?.disabled === false, "1 damage for the 1 Sand held is open", byId["grit-damage1"]);
        sw.check(byId["grit-damage2"]?.disabled === true && byId["grit-sl1"]?.disabled === true, "2 Sand lines greyed with 1 held", { d2: byId["grit-damage2"], s1: byId["grit-sl1"] });
        sw.check(pools(c).sand === 1 && pools(c).halves >= 1, "the closed dialog spent nothing", pools(c));
      });
    });

    it("EROSION at rank 1: Sand Blast's Decay 1 is laid as 2, and a second cast does not add to it", async function () {
      this.timeout(300000);
      await sweepTest("Erosion rank 1", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ S4 Erosion", { level: 9, ranks: { Erosion: 1 }, spells: ["Sand Blast"], enemies: [{ name: "Raptor", x: AT.x + 30 * FT, y: AT.y, health: 300 }] });
        const raptor = foes[0];
        await freshTurn(c, 2);
        const one = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        sw.check(Boolean(one) && flagsOf(one).sl >= 2, "a natural 20 at SL 2", one ? flagsOf(one).sl : null);
        await sw.wait(() => decayValue(raptor.actor) === 2, "Decay 1 laid as 2");
        await freshTurn(c, 2);
        const two = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        if (two) { await sleep(1500); sw.check(decayValue(raptor.actor) === 2, "rank 1 does not add: still 2", decayValue(raptor.actor)); }
      });
    });

    it("STORM OF AGES at rank 1: Sandstorm's 15 feet becomes 20, and the dialog offers no Sand", async function () {
      this.timeout(240000);
      await sweepTest("Storm of Ages rank 1", assert, async sw => {
        const { c } = await chronoInFight("ZZ S4 Storm", { level: 9, ranks: { "Storm of Ages": 1 }, spells: ["Sandstorm"], sand: 3, enemies: [] });
        await freshTurn(c, 2);
        const lines = await dialogLines(c, "Sandstorm");
        sw.check(!lines.some(l => l.id.startsWith("storm-")), "no Sand line at rank 1", lines);
        const card = await castFromSheet(c, "Sandstorm", { face: 18 });
        if (sw.check(Boolean(card), "the cast posted a card")) sw.check(flagsOf(card).area?.distanceFt === 20, "a 20 ft radius", flagsOf(card).area);
      });
    });

    it("WITHERING HOURS at rank 3: Withering Sands' turn-start strike deals 5 + 3", async function () {
      this.timeout(360000);
      await sweepTest("Withering Hours rank 3", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ S4 Wither", { level: 9, ranks: { "Withering Hours": 3 }, spells: ["Withering Sands"], enemies: [{ name: "Raptor", x: AT.x + 30 * FT, y: AT.y, health: 300 }] });
        const raptor = foes[0];
        await raptor.actor.update({ "system.ap.body": 0, "system.ap.head": 0, "system.ap.limb": 0 });
        await freshTurn(c, 2);
        const card = await castFromSheet(c, "Withering Sands", { face: 18 });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const region = await placeFrom(sw, card, raptor.doc.object.center);
        sw.check(Boolean(region), "the area placed");
        const hp = raptor.actor.system.health.value;
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        await sleep(1500);
        declineOpenAsk();
        await sw.wait(() => raptor.actor.system.health.value < hp, "the strike at its turn start", 20000);
        sw.check(hp - raptor.actor.system.health.value === 8, "5 + 3 for rank 3", { hp, now: raptor.actor.system.health.value });
      });
    });

    it("TEMPORAL LOOP through the offer's own button: 2 Sand and the Reaction, a failed Spirit Test returns the Raptor", async function () {
      this.timeout(360000);
      await sweepTest("Temporal Loop", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ S4 Loop", { level: 9, ranks: { "Temporal Loop": 1 }, sand: 4, enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }] });
        const raptor = foes[0];
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        const x0 = raptor.doc.x;
        const offered = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.chronoOffer?.kind === "temporalLoop").then(([m]) => { made.push(m); return m; }).catch(() => null);
        await raptor.doc.move({ x: x0 + 300, y: raptor.doc.y });
        await sw.wait(() => raptor.doc.x === x0 + 300, "the Raptor moved");
        const offer = await offered;
        if (!sw.check(Boolean(offer), "the move posted the Loop's offer")) return;
        const b0 = pools(c);
        const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "feature").then(([m]) => { made.push(m); return m; }).catch(() => null);
        const p = await pressCard(offer, 'button[data-action="rewind"]').catch(err => { sw.fail("pressing the offer", err); return null; });
        const card = await posted;
        if (p) await p.release();
        if (!sw.check(Boolean(card), "the offer's button posted the Loop's card")) return;
        await sw.wait(() => sandOf(c).value === b0.sand - 2, "2 Sand paid");
        sw.check(combatantFor(combat, c).budget.reactions === 0, "the Reaction spent");
        const r = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 }).catch(err => { sw.fail("the Resist", err); return null; });
        if (r) { try { await sleep(400); declineOpenAsk(); await sw.wait(() => raptor.doc.x === x0, "returned to where its move began", 20000); } finally { await r.release(); } }
      });
    });

    it("UNFADING through the offer's own button: the ally's Slowed ends for 2 Sand and the Reaction, and the ally is barred from it", async function () {
      this.timeout(300000);
      await sweepTest("Unfading", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ S4 Unfade", { level: 9, ranks: { Unfading: 1 }, sand: 2, allies: [{ name: "ZZ S4 Unfade Ally", x: AT.x + 60 * FT, y: AT.y }], enemies: [] });
        const ally = friends[0];
        const offered = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.chronoOffer?.kind === "unfading").then(([m]) => { made.push(m); return m; }).catch(() => null);
        await ally.toggleStatusEffect("slowed", { active: true });
        const offer = await offered;
        if (!sw.check(Boolean(offer), "the condition posted the offer")) return;
        const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "feature").then(([m]) => { made.push(m); return m; }).catch(() => null);
        let said = [];
        said = await warnings(async () => {
          const p = await pressCard(offer, 'button[data-action="rewind"]').catch(err => { sw.fail("pressing the offer", err); return null; });
          await posted;
          if (p) await p.release();
        });
        const card = await posted;
        if (!sw.check(Boolean(card), "the offer's button posted Unfading's card", said)) return;
        await sw.wait(() => !ally.statuses.has("slowed"), "Slowed ended");
        sw.check((ally.system.conditionImmunities ?? []).includes("slowed"), "barred from Slowed");
        sw.check(sandOf(c).value === 0 && combatantFor(combat, c).budget.reactions === 0, "2 Sand and the Reaction", pools(c));
        await sw.wait(() => featureNamed(c, "Unfading").system.uses.value === 0, "its use this encounter struck (rank 1)");
      });
    });

    it("SECOND CHANCE at rank 2 costs 2 Sand; the ally's extra Reaction lasts to the end of its next turn and no longer", async function () {
      this.timeout(360000);
      await sweepTest("Second Chance rank 2", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ S4 Second", { level: 9, ranks: { "Gift of Moments": 1, "Second Chance": 2 }, sand: 3, allies: [{ name: "ZZ S4 Second Ally", x: AT.x + 20 * FT, y: AT.y }], enemies: [] });
        const ally = friends[0];
        await freshTurn(c, 2);
        const used = await useSheet(c, "Second Chance", { targets: [tokenOf(ally)] });
        if (!sw.check(Boolean(used.card), "the Use posted a card", used.said)) return;
        await sw.wait(() => sandOf(c).value === 1, "2 Sand paid at rank 2");
        const theirs = combat.getCombatantsByActor(ally)[0];
        await sw.wait(() => (theirs.budget.given ?? []).length === 1, "the Reaction given");
        const now = () => ({ round: combat.round, turn: combat.turn });
        await nextTurnUntil(ally, combat);
        sw.check(givenReactionsLeft(theirs.budget, now()) === 1, "still held on the ally's next turn", theirs.budget);
        await stepTurn(combat);
        await nextTurnUntil(c, combat);
        await sleep(500);
        // The record may stand until the ally's next reset; what counts is that it cannot be spent.
        sw.check(givenReactionsLeft(theirs.budget, now()) === 0, "lapsed once that turn has ended", { budget: theirs.budget, now: now() });
        const own = await theirs.spendAction("reaction");
        const extra = await theirs.spendAction("reaction");
        sw.check(own.ok === true && extra.ok === false, "its own Reaction spends, and no second", { own: own.ok, extra: extra.ok });
      });
    });

    it("QUICKSTEP, SUSPENDED MOMENT and GIFT OF MOMENTS refuse an enemy or too many with nothing spent; SHARED HOURS gives 1 Sand at rank 1, its uses the Intelligence modifier", async function () {
      this.timeout(360000);
      await sweepTest("Chronoweaver refusals and Shared Hours", assert, async sw => {
        const { c, combat, foes, friends } = await chronoInFight("ZZ S4 Weave", {
          level: 9, ranks: { Quickstep: 1, "Suspended Moment": 1, "Gift of Moments": 1, "Shared Hours": 1 }, sand: 4,
          allies: [{ name: "ZZ S4 Weave A", x: AT.x + 10 * FT, y: AT.y }, { name: "ZZ S4 Weave B", x: AT.x + 15 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }]
        });
        const [a, b] = friends;
        const counter = c.grantedFeature(talentNamed(c, "Shared Hours").id);
        sw.check(counter?.system?.uses?.max === c.system.abilities.int.mod, "Shared Hours' uses are the Intelligence modifier", { uses: counter?.system?.uses, int: c.system.abilities.int.mod });
        await freshTurn(c, 2);
        const b0 = pools(c);
        const qs = await useSheet(c, "Quickstep", { targets: [foes[0].doc.object] });
        sw.check(!qs.card && qs.said.length > 0, "Quickstep at an enemy refused in words", qs.said);
        const sm = await useSheet(c, "Suspended Moment", { targets: [tokenOf(a), tokenOf(b)] });
        sw.check(!sm.card && saidAll(sm.said, "1"), "Suspended Moment at two allies refused at rank 1", sm.said);
        const gm = await useSheet(c, "Gift of Moments", { targets: [foes[0].doc.object] });
        sw.check(!gm.card && gm.said.length > 0, "Gift of Moments at an enemy refused", gm.said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(b0), "the refusals spent nothing", { b0, now: pools(c) });
        const speed = a.system.speed;
        const gift = await useSheet(c, "Gift of Moments", { targets: [tokenOf(a)] });
        if (sw.check(Boolean(gift.card), "Gift of Moments at an ally posted a card", gift.said)) {
          await sw.wait(() => a.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBoon), "the Boon laid");
          await sw.wait(() => sandOf(c).value === b0.sand - 2 + 1, "2 Sand paid, Shared Hours' 1 back at rank 1");
          sw.check(a.system.speed === speed, "no Speed at rank 1", { speed, now: a.system.speed });
          sw.check(counter.system.uses.value === counter.system.uses.max - 1, "a Shared Hours use struck", counter.system.uses);
        }
        void combat;
      });
    });

    it("STASIS LORE: Stasis cast for 5 Sand and no Mana at a creature with no Arcane Anchor, its Test offered", async function () {
      this.timeout(300000);
      await sweepTest("Stasis Lore", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ S4 Stasis", { level: 16, ranks: { "Stasis Lore": 1 }, sand: 6, enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y, health: 200 }] });
        const raptor = foes[0];
        await until(() => c.items.find(i => i.type === "spell" && i.name === "Stasis"), "Stasis learned", 30000);
        await freshTurn(c, 1);
        const b0 = pools(c);
        const lines = await dialogLines(c, "Stasis", { targets: [raptor.doc.object] });
        const sandLine = lines.find(l => l.id.startsWith("sand-"));
        if (!sw.check(Boolean(sandLine), "the dialog offers the 5 Sand line", lines)) return;
        const card = await castFromSheet(c, "Stasis", { targets: [raptor.doc.object], face: 18, lines: [sandLine.id] });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        sw.check(flagsOf(card).success === true, "the cast succeeded", flagsOf(card));
        await sw.wait(() => sandOf(c).value === Math.min(sandOf(c).max, b0.sand - 5 + 0) || sandOf(c).value <= b0.sand - 4, "5 Sand paid");
        sw.check(manaOf(c).value === b0.mana, "no Mana", { b0, now: pools(c) });
        sw.check(buttonsOn(card).some(x => x.action === "resistTest"), "the Raptor's Spirit Test offered (no Anchor needed)", buttonsOn(card));
        sw.log("card", { text: textOf(live(card)) });
      });
    });

    it("COLLAPSE OF HOURS at rank 2: refused below 3 Sand; then twice the tier plus the Sand on the Decayed Raptor", async function () {
      this.timeout(360000);
      await sweepTest("Collapse of Hours rank 2", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ S4 Collapse", { level: 13, ranks: { "Collapse of Hours": 2 }, spells: ["Sand Blast"], enemies: [{ name: "Raptor", x: AT.x + 30 * FT, y: AT.y, health: 300 }] });
        const raptor = foes[0];
        await freshTurn(c, 2);
        await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
        await sw.wait(() => decayValue(raptor.actor) > 0, "the caster's Decay on the Raptor");
        await freshTurn(c, 2);
        await setSand(c, 2);
        const poor = await useSheet(c, "Collapse of Hours");
        sw.check(!poor.card && saidAll(poor.said, "3"), "2 Sand refused naming the 3", poor.said);
        await setSand(c, 4);
        const hp = raptor.actor.system.health.value;
        const body = raptor.actor.system.ap.body;
        const used = await useSheet(c, "Collapse of Hours");
        if (!sw.check(Boolean(used.card), "the Use posted a card", used.said)) return;
        const want = Math.max(0, 2 * c.system.tier + 4 - body);
        await sw.wait(() => sandOf(c).value === 0, "every Sand spent");
        await sw.wait(() => raptor.actor.system.health.value === hp - want, `twice the tier ${c.system.tier} plus 4, less Body AP ${body}: ${want}`);
      });
    });

    it("ECHOING SANDS at rank 1 lands half, rounded down, again; HEAVY HOURS at rank 1 does not bar a Disengage", async function () {
      this.timeout(420000);
      await sweepTest("Echoing Sands and Heavy Hours rank 1", assert, async sw => {
        const { c, combat, foes } = await chronoInFight("ZZ S4 Echo", { level: 5, ranks: { "Grit of Ages": 1, "Echoing Sands": 1, "Heavy Hours": 1 }, spells: ["Sand Blast"], sand: 4, enemies: [{ name: "Raptor", x: AT.x + 30 * FT, y: AT.y, health: 300 }] });
        const raptor = foes[0];
        await raptor.actor.update({ "system.ap.body": 0, "system.ap.head": 0, "system.ap.limb": 0 });
        await freshTurn(c, 2);
        const card = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18, lines: ["echoing-sands"] });
        if (!sw.check(Boolean(card), "the cast posted a card")) return;
        const n = flagsOf(card).damageByTarget?.[0]?.damage ?? 0;
        const hp = raptor.actor.system.health.value;
        const p = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        await p.release();
        await sw.wait(() => raptor.actor.system.health.value === hp - n, `the ${n} applied`);
        await nextTurnUntil(combatantFor(combat, raptor), combat);
        let done = null;
        const said = await warnings(async () => { done = await disengage(raptor.actor); });
        sw.check(done !== null, "rank 1 does not bar a Disengage", said);
        await stepTurn(combat);
        await nextTurnUntil(c, combat);
        await sw.wait(() => raptor.actor.system.health.value === hp - n - Math.floor(n / 2), `half of ${n}, rounded down, again`);
      });
    });

    it("RANKS AND GATES: Arrested Moment 2 holds two uses; Echo of Power 1 gives back 2; Recovered Hours 2 reaches two allies; The Glass Turns Back refused below 3 Sand; Halt bought with Sand succeeds on a 1", async function () {
      this.timeout(480000);
      await sweepTest("Chronomancer ranks and gates", assert, async sw => {
        const { c, combat, friends } = await chronoInFight("ZZ S4 Ranks", {
          level: 20, sand: 2,
          ranks: { "Arrested Moment": 2, "Gift of Moments": 1, "Second Chance": 1, "Echo of Power": 1, "Recovered Hours": 2, "The Glass Turns Back": 1, "Stasis Lore": 1, "Halt the Sands": 1 },
          allies: [{ name: "ZZ S4 Ranks A", x: AT.x + 10 * FT, y: AT.y }, { name: "ZZ S4 Ranks B", x: AT.x + 15 * FT, y: AT.y }],
          enemies: [{ name: "Raptor", x: AT.x + 20 * FT, y: AT.y + 600, health: 300 }]
        });
        const [a, b] = friends;
        const arrested = c.grantedFeature(talentNamed(c, "Arrested Moment").id);
        sw.check(arrested?.system?.uses?.max === 2 && arrested.system.uses.per === "short", "Arrested Moment at rank 2: twice per Short Rest", arrested?.system?.uses);
        // The Glass Turns Back with 2 Sand: refused naming the 3, nothing spent.
        await freshTurn(c, 2);
        const b0 = pools(c);
        const glass = await useSheet(c, "The Glass Turns Back");
        sw.check(!glass.card && saidAll(glass.said, "3"), "The Glass Turns Back with 2 Sand refused naming the 3", glass.said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(b0), "nothing spent", { b0, now: pools(c) });
        // Echo of Power at rank 1: 2 of the ally's Rage.
        await setSand(c, 8);
        const rage = a.poolSnapshot().find(p => p.name === "rage");
        if (rage) await a.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 0 });
        const echo = await useSheet(c, "Echo of Power", { targets: [tokenOf(a)] });
        if (sw.check(Boolean(echo.card), "Echo of Power posted a card", echo.said)) {
          await sw.wait(() => (a.poolSnapshot().find(p => p.name === "rage")?.value ?? 0) === 2, "2 Rage at rank 1");
          sw.check(sandOf(c).value === 5, "3 Sand paid", pools(c));
        }
        // Recovered Hours at rank 2: both allies regain their spent Charge.
        for (const ally of [a, b]) {
          const charge = ally.items.find(i => i.type === "feature" && i.name === "Charge");
          if (charge) await charge.update({ "system.uses.value": 0 });
        }
        await setSand(c, 8);
        const rec = await useSheet(c, "Recovered Hours", { targets: [tokenOf(a), tokenOf(b)] });
        if (sw.check(Boolean(rec.card), "Recovered Hours at two allies posted a card (rank 2)", rec.said)) {
          for (const ally of [a, b]) await sw.wait(() => ally.items.find(i => i.type === "feature" && i.name === "Charge")?.system?.uses?.value === 1, `${ally.name}'s Charge back`);
          sw.check(sandOf(c).value === 4, "4 Sand paid", pools(c));
        }
        // Halt bought with Sand, from the sheet's Cast and the dialog's own line: a natural 1 succeeds.
        await freshTurn(c, 2);
        await setSand(c, 6);
        await until(() => c.items.find(i => i.type === "spell" && i.name === "Halt"), "Halt learned", 30000);
        const h0 = pools(c);
        const lines = await dialogLines(c, "Halt");
        const sandLine = lines.find(l => l.id.startsWith("sand-"));
        if (sw.check(Boolean(sandLine), "the dialog offers Halt's 5 Sand line", lines)) {
          const card = await castFromSheet(c, "Halt", { face: 1, lines: [sandLine.id] });
          if (sw.check(Boolean(card), "the Halt cast posted a card")) {
            sw.check(flagsOf(card).success === true, "a natural 1 succeeds when Halt is bought with Sand", { sl: flagsOf(card).sl, success: flagsOf(card).success });
            sw.check(manaOf(c).value === h0.mana, "no Mana", { h0, now: pools(c) });
            sw.check(sandOf(c).value <= h0.sand - 5 + 2, "5 Sand paid", { h0, now: pools(c) });
          }
        }
        void combat;
      });
    });
  });
}

/* -------------------------------------------- */
/*  Batch 3: Guardian of Time and Sand itself    */
/* -------------------------------------------- */

export function chronomancerSweepGuardianBatch(context) {
  const { describe, it, assert } = context;

  describe("The Chronomancer sweep: Guardian of Time and Sand through the real controls (stage 4)", function () {
    frame(context);

    it("TIME-LOCK at rank 1: one Bane on a creature within 30 feet for 2 Sand; past 30 feet refused with nothing spent", async function () {
      this.timeout(240000);
      await sweepTest("Time-Lock rank 1", assert, async sw => {
        const { c, foes } = await guardianInFight("ZZ S4 Lock", { ranks: { "Time-Lock": 1 }, sand: 4, enemies: [{ name: "Bandit", x: AT.x + 35 * FT, y: AT.y }] });
        const b = foes[0];
        await freshTurn(c, 2);
        const b0 = pools(c);
        const far = await useSheet(c, "Time-Lock", { targets: [b.doc.object] });
        sw.check(!far.card && saidAll(far.said, "35 feet", "30 feet"), "35 feet refused naming the 30", far.said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(b0), "nothing spent", { b0, now: pools(c) });
        await b.doc.move({ x: AT.x + 25 * FT, y: AT.y, action: "displace" });
        await sw.wait(() => b.doc.x === AT.x + 25 * FT, "the Bandit 25 feet off");
        const used = await useSheet(c, "Time-Lock", { targets: [b.doc.object] });
        if (!sw.check(Boolean(used.card), "the Use posted a card", used.said)) return;
        const laid = await sw.wait(() => b.actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[LAID_BANE_FLAG]), "the Bane laid");
        if (laid) sw.check(laid.flags["azeroth-rpg"][LAID_BANE_FLAG].banes === 1, "one Bane at rank 1", laid.flags["azeroth-rpg"][LAID_BANE_FLAG]);
        sw.check(sandOf(c).value === 2, "2 Sand paid", pools(c));
      });
    });

    it("TURNED ASIDE at rank 1 and GRINDING BLOCK at rank 1: the card's Block takes 4 off and gives 1 Sand; a miss gives none; the Parry pays 1 Sand", async function () {
      this.timeout(420000);
      await sweepTest("Turned Aside, Grinding Block rank 1, Parry", assert, async sw => {
        const { c, combat, foes } = await guardianInFight("ZZ S4 Block", { ranks: { "Turned Aside": 1, "Grinding Block": 1 }, sand: 0, enemies: [{ name: "Bandit", x: AT.x + 5 * FT, y: AT.y }] });
        const b = foes[0];
        await nextTurnUntil(combatantFor(combat, b), combat);
        const card = await creatureAttack(sw, b, tokenOf(c), 18);
        if (!sw.check(Boolean(card), "the Bandit's attack posted a card")) return;
        sw.check(buttonsOn(card).some(x => x.action === "reactBlock"), "the card offers the Block", buttonsOn(card));
        const blocked = untilHook("createChatMessage", 20000, m => m.flags?.["azeroth-rpg"]?.reaction === "block").then(([m]) => { made.push(m); return m; }).catch(() => null);
        const p = await pressCard(card, 'button[data-action="reactBlock"]').catch(err => { sw.fail("pressing Block", err); return null; });
        if (p) await p.release();
        const blockCard = await blocked;
        sw.check(Boolean(blockCard), "the Block posted its card");
        sw.check(c.getFlag("azeroth-rpg", "mitigate")?.amount === 4, "06's 4 and no more at Grinding Block rank 1", c.getFlag("azeroth-rpg", "mitigate"));
        await sw.wait(() => sandOf(c).value === 1, "1 Sand for the Block at rank 1");
        // A miss next round: no Sand at rank 1.
        await stepTurn(combat);
        await nextTurnUntil(combatantFor(combat, b), combat);
        const s0 = sandOf(c).value;
        await creatureAttack(sw, b, tokenOf(c), 1);
        await sleep(1500);
        sw.check(sandOf(c).value === s0, "a miss gives nothing at rank 1", { s0, now: sandOf(c).value });
        // A Parry from the next card, paid in Sand.
        await stepTurn(combat);
        await nextTurnUntil(combatantFor(combat, b), combat);
        await setSand(c, 3);
        const hit = await creatureAttack(sw, b, tokenOf(c), 15);
        if (hit && sw.check(buttonsOn(hit).some(x => x.action === "reactParry"), "the card offers the Parry", buttonsOn(hit))) {
          let pp = null;
          const parried = untilHook("createChatMessage", 15000, m => m.speaker?.actor === c.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
          const saidParry = await warnings(async () => {
            pp = await pressCard(hit, 'button[data-action="reactParry"]', { face: 20 }).catch(err => { sw.fail("pressing Parry", err); return null; });
            await parried;
          });
          if (pp) await pp.release();
          const parryCard = await parried;
          sw.log("parry", { said: saidParry, card: parryCard ? textOf(live(parryCard)) : null, reactions: combatantFor(combat, c).budget, sand: sandOf(c) });
          await sw.wait(() => sandOf(c).value === 2, "the Parry paid 1 Sand");
        }
      });
    });

    it("BORROWED TIME at rank 3, asked from the card's Apply: half now, the other half less 3 at the turn's start", async function () {
      this.timeout(360000);
      await sweepTest("Borrowed Time rank 3", assert, async sw => {
        const { c, combat, foes } = await guardianInFight("ZZ S4 Borrow", { ranks: { "Turned Aside": 1, "Borrowed Time": 3 }, sand: 4, enemies: [{ name: "Bandit", x: AT.x + 5 * FT, y: AT.y }] });
        const b = foes[0];
        await hardHitter(b);
        await nextTurnUntil(combatantFor(combat, b), combat);
        const card = await creatureAttack(sw, b, tokenOf(c), 19);
        if (!sw.check(Boolean(card), "the Bandit's attack posted a card")) return;
        const dmg = flagsOf(card).damageByTarget?.[0]?.damage ?? 0;
        sw.log("damage", { dmg, rows: flagsOf(card).damageByTarget });
        const hp = c.system.health.value;
        const asked = await applyAnswering(sw, card, true);
        sw.check(asked, "Borrowed Time asked in the blow");
        const now = Math.ceil(dmg / 2);
        const later = Math.max(0, dmg - now - 3);
        await sw.wait(() => c.system.health.value === hp - now, `half of ${dmg}, rounded up, now: ${now}`);
        sw.check(JSON.stringify(deferredOf(c).map(r => r.amount)) === JSON.stringify(later > 0 ? [later] : []), `the other half less 3 put off: ${later}`, deferredOf(c));
        sw.check(sandOf(c).value === 3 && combatantFor(combat, c).budget.reactions === 0, "1 Sand and the Reaction", pools(c));
        await nextTurnUntil(c, combat);
        await sw.wait(() => !deferredOf(c).length && c.system.health.value === hp - now - later, `the ${later} landed at the turn's start`);
      });
    });

    it("INTERPOSED MOMENT: at rank 1 an ally 15 feet off is not answered; at rank 2 it is, the two swap and the Guardian takes the blow", async function () {
      this.timeout(420000);
      await sweepTest("Interposed Moment ranks", assert, async sw => {
        const { c, combat, foes, friends } = await guardianInFight("ZZ S4 Interpose", {
          ranks: { "Interposed Moment": 1 }, sand: 4, allies: [{ name: "ZZ S4 Interposed Ally", x: AT.x + 15 * FT, y: AT.y }],
          enemies: [{ name: "Bandit", x: AT.x + 20 * FT, y: AT.y }]
        });
        const ally = friends[0];
        const b = foes[0];
        await c.setParty(true);
        await ally.setParty(true);
        await nextTurnUntil(combatantFor(combat, b), combat);
        // The Bandit's own 4 first, so the ally lives to be answered for at rank 2.
        const one = await creatureAttack(sw, b, tokenOf(ally), 15);
        if (one) {
          const asked = await applyAnswering(sw, one, true);
          sw.check(!asked, "rank 1 reaches 10 feet: an ally 15 feet off is not answered");
        }
        await talentNamed(c, "Interposed Moment").update({ "system.taken": 2 });
        await until(() => talentNamed(c, "Interposed Moment").system.taken === 2, "rank 2");
        await hardHitter(b);
        await ally.update({ "system.health.value": ally.system.health.max });
        await until(() => ally.system.health.value === ally.system.health.max, "the ally's Health full");
        await stepTurn(combat);
        await nextTurnUntil(combatantFor(combat, b), combat);
        const at = { c: tokenOf(c).document.x, a: tokenOf(ally).document.x };
        const hpA = ally.system.health.value;
        const hpC = c.system.health.value;
        const two = await creatureAttack(sw, b, tokenOf(ally), 19);
        if (!sw.check(Boolean(two), "the second attack posted a card")) return;
        // Through the card's Apply the struck ally's owner first picks the one transfer (the
        // unified chooser, `effects/damage-transfer-choice.mjs`), then the Guardian is asked.
        const p2 = await pressCard(two, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])').catch(err => { sw.fail("pressing Apply", err); return null; });
        const chooserApp = await sw.wait(() => [...foundry.applications.instances.values()].find(x => x.rendered && String(x.id ?? "").startsWith("azeroth-choose-transfer-")) ?? null, "the struck ally's transfer chooser", 15000);
        if (chooserApp) {
          sw.log("transfer options", [...chooserApp.element.querySelectorAll("option, label")].map(o => o.textContent.replace(/\s+/g, " ").trim()));
          await pick(chooserApp, "Interposed Moment").catch(err => sw.fail("picking Interposed Moment", err));
        }
        const asked = await answerAskIfAny(true, 15000);
        if (p2) await p2.release();
        sw.check(asked, "rank 2 reaches 20 feet: the Guardian asked");
        await sw.wait(() => tokenOf(c).document.x === at.a && tokenOf(ally).document.x === at.c, "the two swapped places");
        await sw.wait(() => c.system.health.value < hpC, `the Guardian takes the blow (${hpC} before)`, 20000);
        sw.check(ally.system.health.value === hpA, "the ally takes none of it", { hpA, a: ally.system.health.value, hpC, c: c.system.health.value });
        sw.check(sandOf(c).value === 2, "2 Sand paid", pools(c));
      });
    });

    it("ECHO OF THE BLADE: a 17 does not echo; an 18 echoes once, and that echo's 15 does not echo again", async function () {
      this.timeout(300000);
      await sweepTest("Echo of the Blade bands", assert, async sw => {
        const { c, combat, foes } = await guardianInFight("ZZ S4 Echo", { ranks: { "Echo of the Blade": 1 }, enemies: [{ name: "Bandit", x: AT.x + 5 * FT, y: AT.y, health: 300 }] });
        const b = foes[0];
        const attack = async faces => {
          await freshTurn(c, 2);
          const cards = [];
          const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === c.id && m.flags?.["azeroth-rpg"]?.kind === "attack") cards.push(m); });
          canvas.tokens.setTargets([b.doc.id]);
          const sheet = await openSheet(c);
          const sword = c.items.find(i => i.name === "Longsword");
          const control = sheet.element.querySelector(`[data-item-id="${sword.id}"] [data-action="rollAttack"]`);
          const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
          await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
          const unpin = pinFaces(faces);
          try { control?.click(); await sleep(4000); } finally {
            unpin(); Hooks.off("createChatMessage", hook); canvas.tokens.setTargets([]);
            await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before); await sheet.close();
          }
          made.push(...cards);
          return cards;
        };
        const seventeen = await attack([17, 20, 20]);
        sw.check(seventeen.length === 1, "a 17 makes no echo", seventeen.length);
        await stepTurn(combat);
        const eighteen = await attack([18, 15, 20]);
        sw.check(eighteen.length === 2, "an 18 echoes once, and a 15 on the echo stops it", eighteen.length);
      });
    });

    it("WEATHERED BY AGES 1 and DISTORTION FIELD 1: 2 more Health; a field 10 feet past the token", async function () {
      this.timeout(240000);
      await sweepTest("Weathered by Ages, Distortion Field rank 1", assert, async sw => {
        const { c, scene } = await guardianInFight("ZZ S4 Field", { ranks: { "Distortion Field": 1 } });
        const base = c.system.health.max;
        await talentNamed(c, "Weathered by Ages").update({ "system.taken": 1 });
        await sw.wait(() => c.system.health.max === base + 2, "2 more Health at rank 1");
        const region = await sw.wait(() => scene.regions.find(r => r.flags?.["azeroth-rpg"]?.[FIELD_FLAG]?.token === tokenOf(c).id), "the field's Region");
        if (region) sw.check(region.shapes[0].radius === 12.5 * FT, "10 feet past a Medium token's edge", region.shapes[0].radius);
      });
    });

    it("SAND: the glass's rarity caps it at 5, 6, 7, 8 and 8; the sheet counts it; Guard keeps it; out of the slot it is gone; a Short Rest empties it", async function () {
      this.timeout(300000);
      await sweepTest("Sand", assert, async sw => {
        const { c } = await guardianInFight("ZZ S4 Sand", { sand: 6 });
        const glass = c.items.find(i => i.name === "Hourglass");
        for (const [rarity, cap] of [["common", 5], ["uncommon", 6], ["rare", 7], ["epic", 8], ["legendary", 8]]) {
          await glass.update({ "system.rarity": rarity });
          await sw.wait(() => sandOf(c)?.max === cap, `${rarity}: a cap of ${cap}`);
        }
        await setSand(c, 6);
        const sheet = await openSheet(c);
        const count = sheet.element.querySelector(".azeroth-pool.is-sand .azeroth-pool-value");
        sw.check(Number(count?.value) === 6, "the sheet's Sand counter reads 6", count?.value ?? null);
        await sheet.close();
        await freshTurn(c, 2);
        const sheet2 = await openSheet(c);
        sheet2.element.querySelector('section[data-tab="combat"] [data-action="guard"]')?.click();
        await sleep(1500);
        await sheet2.close();
        sw.check(c.statuses.has("guarded"), "Guarded");
        sw.check(sandOf(c).value === 6, "Guard keeps the Sand", sandOf(c));
        await c.shortRest({ food: await give(c, "Bread and cheese") });
        await sw.wait(() => sandOf(c).value === 0, "a Short Rest empties it");
        await setSand(c, 4);
        await glass.update({ "system.equipped": false });
        await sw.wait(() => (sandOf(c)?.value ?? 0) === 0, "out of the slot it is gone");
        await glass.update({ "system.equipped": true });
        await sleep(800);
        sw.check((sandOf(c)?.value ?? 0) === 0, "and it does not come back with the glass", sandOf(c));
      });
    });
  });
}
