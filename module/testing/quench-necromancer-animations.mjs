/**
 * **EVERY NECROMANCER ITEM PLAYS A PICTURE AND A SOUND, READ BACK LIVE** (team ANI; the lead:
 * *"Ensure all spells and abilities have verified animations and sound"*, then *"Yes, just the
 * Necromancer plus the census, keep going"*).
 *
 * **What "verified" means here**, for each of the 57 spells, the 8 features, the 36 talents, the
 * grafts, the raised creatures' abilities and the events:
 *
 *  1. a recipe keyed as the table keys it (`rules/necromancer-animations.mjs` and the rows it
 *     shares with the knight and the Warlock);
 *  2. a sound step in every cue, every asset a full leaf of `tools/animation/assets.json` (the
 *     Vitest `module/rules/animation-sound-census.test.mjs` holds this over every class);
 *  3. **played live through the real control** - the sheet's Cast or Use, the card's buttons, the
 *     tracker's Next Turn, a real attack card - and read back through the recorder: the cue came
 *     back with an effect step and a sound step, on the tokens the record names, and no `SKIPS`
 *     word or `unavailable:` refusal stood in its place;
 *  4. every asset the played cue carries resolves to a LEAF of the running client's Sequencer
 *     database (`entryExists` and an empty `getPathsUnder`, the rule `azeroth-rpg.animation`
 *     applies to the whole table).
 *
 * **How it reuses the batches that already press every control.** The Necromancer's nine batches
 * already drive every door through the real controls. Each animation batch below runs one or more
 * of them again with the recorder standing in for the player (`RecordingPlayer`, D-729): every
 * test body runs unchanged, and what the recorder heard during it is kept as that test's evidence.
 * A batch that installs its own recorder (`necromancer-verify`) gets a tee, so both hear every cue.
 * Then one `it` an item judges that item's cues from the evidence of the scenario that pressed its
 * control - and where no earlier batch pressed the control that animates an item (an area spell's
 * Place area, a raised creature's own Use or Cast), a test here presses it.
 *
 * Five batches, each well under the smoke run's per-batch budget:
 * `azeroth-rpg.necromancer-animations-spells` (tiers 1 and 2, and the Essence batch),
 * `-t3`, `-t45`, `-features-talents` (the talents, the horde and the verify batches) and
 * `-creatures` (the review and fix batches, the grafts and the raised creatures' abilities).
 */

import { give, made, makeNpc, openSheet, pinDie, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SCENE_SETTLE, chooser, pick, pressCard, pressUse, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import {
  bankEssence, castOk, creature, lifecycle, necro, necromancerSpellsBatch, necromancerSpellsT3Batch,
  necromancerSpellsT45Batch, pressBoard
} from "./quench-necromancer-spells.mjs";
import { CREATURE_ITEMS, FT_ITEMS, SPELL_ITEMS, T3_ITEMS, T45_ITEMS } from "./necromancer-animation-items.mjs";
import { necromancerTalentsBatch } from "./quench-necromancer-talents.mjs";
import { necromancerHordeBatch } from "./quench-necromancer-horde.mjs";
import { castWith, necromancerReviewBatch, npcAttacks, tick } from "./quench-necromancer-review.mjs";
import { necromancerFixesBatch } from "./quench-necromancer-fixes.mjs";
import { necromancerEssenceBatch } from "./quench-necromancer-essence.mjs";
import { necromancerVerifyBatch } from "./quench-necromancer-verify.mjs";
import { RecordingPlayer } from "./animation-recorder.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { hordeActorsOf } from "../effects/necromancer-horde.mjs";
import { NECRO_NO_ROW } from "../rules/necromancer-animations.mjs";
import { FEATURE_ANIMATIONS } from "../rules/animation-table.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = () => game.system.azeroth.animations;
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;

/* ------------------------------------------------------------------ */
/*  The listener                                                       */
/* ------------------------------------------------------------------ */

/** Who a token is, as a judge reads it: the Necromancer, one of its raised dead, a character or a creature. */
function roleOf(doc) {
  const actor = doc?.actor ?? null;
  if (!actor) return "gone";
  if (actor.items?.some(i => i.type === "class" && i.name === "Necromancer")) return "necromancer";
  if (actor.getFlag?.(SCOPE, "bond")) return "raised";
  return actor.type === "character" ? "character" : "creature";
}

/**
 * **THE RECORDER, WITH NAMES.** A cue's steps carry token ids; the token may be deleted by the time
 * a judge reads it (a collapse, a test's own cleanup), so each id the cue or its record names is
 * resolved to a name and a role at the moment it plays.
 */
class NamingRecorder extends RecordingPlayer {
  playCue(steps, record = null) {
    const id = super.playCue(steps, record);
    const cue = this.cues.at(-1);
    if (id && cue?.id === id) cue.who = whoOf(steps, record);
    return id;
  }
}

function whoOf(steps, record) {
  const ids = new Set([
    record?.source?.tokenId,
    ...(record?.targets ?? []).map(t => t?.tokenId),
    ...(record?.risen ?? []).flatMap(r => r?.tokenIds ?? []),
    ...(steps ?? []).flatMap(s => [s.on, s.fromToken, s.toToken])
  ].filter(Boolean));
  const scene = game.scenes.get(record?.sceneId ?? "") ?? canvas?.scene ?? null;
  const out = {};
  for (const id of ids) {
    const doc = scene?.tokens?.get(id) ?? canvas?.scene?.tokens?.get(id) ?? null;
    out[id] = { name: doc?.name ?? "?", role: roleOf(doc) };
  }
  return out;
}

/** A player that hands every call to another and tells the listener too (a batch's own recorder). */
function teeOf(primary, spy) {
  return {
    playCue(steps, record) { spy.playCue(steps, record); return primary.playCue(steps, record); },
    playLoop(loop) { spy.playLoop(loop); return primary.playLoop(loop); },
    endLoop(key) { spy.endLoop(key); return primary.endLoop(key); },
    activeLoops() { return primary.activeLoops(); },
    noteSkip(skip, record) { spy.noteSkip?.(skip, record); return primary.noteSkip?.(skip, record); },
    get lastLoopRefusal() { return primary.lastLoopRefusal; }
  };
}

/** What each recorded test heard, oldest first: `{batch, title, cues, skips, loops}`. */
const EVIDENCE = [];
let SPY = null;

/**
 * The listener's lifetime, around a whole animation batch: the switches on, the recorder in, a
 * batch's own `setPlayer` tee'd onto it, and each new scene waited until the settle gate opens.
 */
function listening(context) {
  const { before, after } = context;
  const held = {};
  let realSet = null;
  let realReset = null;
  before(async function () {
    this.timeout(60000);
    for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
      held[key] = game.settings.get(SCOPE, key);
      await game.settings.set(SCOPE, key, true);
    }
    held.photosensitive = game.settings.get("core", "photosensitiveMode");
    if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", false);
    // Each batch judges only what it heard itself: a full run holds five of these.
    EVIDENCE.length = 0;
    SPY = new NamingRecorder();
    const director = api().director;
    realSet = director.setPlayer;
    realReset = director.resetPlayer;
    held.player = realSet(SPY);
    // A batch that swaps in its own recorder gets a tee, and its "previous" is the listener, so
    // putting it back puts the listener back.
    director.setPlayer = next => {
      if (!next || next === SPY) realSet(SPY);
      else realSet(teeOf(next, SPY));
      return SPY;
    };
    director.resetPlayer = () => realSet(SPY);
    SCENE_SETTLE.wait = async () => {
      const start = Date.now();
      while (Date.now() - start < 8000) {
        const state = animationAvailability();
        if (state.ok || !["unsettled", "noCanvas"].includes(state.reason)) return;
        await sleep(100);
      }
    };
  });
  after(async function () {
    this.timeout(60000);
    SCENE_SETTLE.wait = null;
    const director = api().director;
    if (realSet) director.setPlayer = realSet;
    if (realReset) director.resetPlayer = realReset;
    if (realSet && held.player) realSet(held.player);
    if (held.photosensitive) await game.settings.set("core", "photosensitiveMode", true);
    for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
      if (key in held) await game.settings.set(SCOPE, key, held[key]);
    }
  });
}

/**
 * **A BATCH'S CONTEXT WHOSE `it` KEEPS WHAT WAS HEARD.** The body runs unchanged (its own
 * `this.timeout` is given 30 seconds more for the listening); what the recorder heard from the
 * body's first line to a moment after its last is that test's evidence.
 */
function recording(context, batch) {
  const it = (title, fn) => context.it(title, async function () {
    const mocha = this;
    const ctx = Object.create(mocha);
    ctx.timeout = ms => (ms === undefined ? mocha.timeout() : mocha.timeout(ms + 30000));
    const mark = { cues: SPY.cues.length, skips: SPY.skips.length, loops: SPY.loops.length };
    try {
      await fn.call(ctx);
    } finally {
      // A rising, a collapse or a Region's cue lands a moment after the card the body waited on.
      await sleep(1500);
      EVIDENCE.push({ batch, title, cues: SPY.cues.slice(mark.cues), skips: SPY.skips.slice(mark.skips), loops: SPY.loops.slice(mark.loops) });
    }
  });
  return { ...context, it };
}

/* ------------------------------------------------------------------ */
/*  The judge                                                          */
/* ------------------------------------------------------------------ */

/** Whether a key is an exact leaf of the running client's Sequencer database (`azeroth-rpg.animation`'s rule). */
function liveLeaf(key) {
  const db = globalThis.Sequencer?.Database;
  if (!db) return false;
  try {
    return db.entryExists(key) && (db.getPathsUnder(key) || []).length === 0;
  } catch {
    return false;
  }
}

/** A cue's steps, as the report prints them: `kind asset @ where`. */
function describeSteps(cue) {
  const who = cue.who ?? {};
  const where = s => {
    if (s.on) return `on ${who[s.on]?.name ?? s.on}`;
    if (s.fromToken || s.toToken) return `${who[s.fromToken]?.name ?? s.fromToken ?? "?"} -> ${who[s.toToken]?.name ?? s.toToken ?? "?"}`;
    if (s.at) return `at (${Math.round(s.at.x)}, ${Math.round(s.at.y)})`;
    return "";
  };
  return cue.steps.map(s => `${s.kind} ${s.asset}${where(s) ? ` ${where(s)}` : ""}`);
}

/** The token ids a cue's effect steps are placed on. */
const placedOn = cue => cue.steps.filter(s => s.kind === "effect").flatMap(s => [s.on, s.fromToken, s.toToken]).filter(Boolean);

/**
 * **THE ROLE A CUE MUST PLAY FOR**: `caster` (the record's source is the Necromancer), `target` (an
 * effect step on a creature other than the Necromancer), `risen` (an effect step on a token the
 * record says rose), `source` (the record's source is a creature that is not the Necromancer),
 * `point` (an effect step at a canvas point: a Region's ground or where a body stood), or `any`.
 */
function whoFault(cue, who) {
  const roles = cue.who ?? {};
  const source = cue.record?.source?.tokenId ?? null;
  switch (who) {
    case "caster":
      return roles[source]?.role === "necromancer" ? null : `its source is ${roles[source]?.name ?? "nobody"} (${roles[source]?.role ?? "none"}), not the Necromancer`;
    case "target":
      return placedOn(cue).some(id => roles[id]?.role && roles[id].role !== "necromancer") ? null : "no effect step is placed on a creature other than the Necromancer";
    case "risen": {
      const risen = new Set((cue.record?.risen ?? []).flatMap(r => r.tokenIds ?? []));
      return risen.size && placedOn(cue).some(id => risen.has(id)) ? null : "no effect step is placed on a token the record says rose";
    }
    case "source":
      return source && roles[source]?.role !== "necromancer" && placedOn(cue).includes(source) ? null : `its source ${roles[source]?.name ?? "nobody"} is not the creature acting`;
    case "point":
      return cue.steps.some(s => s.kind === "effect" && s.at) ? null : "no effect step is placed at a point";
    default:
      return null;
  }
}

/** The evidence of the scenarios an item names, by title prefix. */
const scenarios = from => EVIDENCE.filter(e => from.some(prefix => e.title.startsWith(prefix)));

/** Whether a recorded cue answers one expectation (`kind: "attack"` matches a strike by its form). */
function answers(cue, want) {
  const r = cue.record ?? {};
  if (want.kind === "attack") return r.kind === "attack" && (!want.form || r.strike?.form === want.form);
  return r.trigger === want.trigger && (want.key === "*" ? r.kind === "spell" : r.identifier === want.key);
}

/**
 * One item's verdict: for every cue it expects, a cue the recorder heard in one of its scenarios
 * with an effect step and a sound step, every asset a live leaf, placed for the role it plays.
 * Returns the cues judged, for the report line.
 */
function judge(assert, item) {
  const runs = scenarios(item.from);
  assert.isAbove(runs.length, 0, `${item.name}: none of its scenarios ran in this batch (${item.from.join(" | ")})`);
  const heard = [];
  for (const want of item.expect) {
    const label = want.kind === "attack" ? `the ${want.form ?? "attack"} strike` : `${want.key}'s ${want.trigger} cue`;
    if (want.skip) {
      const skips = runs.flatMap(r => r.skips).filter(s => s.record?.identifier === want.key && s.record?.trigger === want.trigger).map(s => s.skip);
      assert.include(skips, want.skip, `${item.name}: ${label} was not refused "${want.skip}" (refused: ${skips.join(", ") || "nothing"})`);
      const played = runs.flatMap(r => r.cues).filter(c => answers(c, want));
      assert.lengthOf(played, 0, `${item.name}: ${label} played where it must be refused`);
      heard.push({ want, skip: want.skip });
      continue;
    }
    const cues = runs.flatMap(r => r.cues).filter(c => answers(c, want));
    if (!cues.length) {
      const skips = runs.flatMap(r => r.skips).filter(s => answers({ record: s.record }, want)).map(s => s.skip);
      assert.fail(`${item.name}: ${label} never played in ${runs.map(r => `"${r.title.slice(0, 60)}"`).join(", ")}; refused: ${skips.join(", ") || "never asked"}`);
    }
    // The first cue that carries the whole bar, else the first heard, so a fault names a real cue.
    const good = cues.find(c => c.steps.some(s => s.kind === "effect") && c.steps.some(s => s.kind === "sound") && !whoFault(c, want.who ?? "any")) ?? cues[0];
    assert.isTrue(good.steps.some(s => s.kind === "effect"), `${item.name}: ${label} drew no picture`);
    assert.isTrue(good.steps.some(s => s.kind === "sound"), `${item.name}: ${label} played no sound step: ${describeSteps(good).join(" | ")}`);
    const fault = whoFault(good, want.who ?? "any");
    assert.isNull(fault, `${item.name}: ${label}: ${fault}`);
    const notLeaves = good.steps.map(s => s.asset).filter(a => a && !liveLeaf(a));
    assert.deepEqual(notLeaves, [], `${item.name}: ${label} plays assets the live Sequencer database holds no leaf for`);
    if (want.loop) {
      const looped = runs.flatMap(r => r.loops).some(l => l.loop?.identifier === want.key);
      assert.isTrue(looped, `${item.name}: ${want.key}'s loop never stood`);
    }
    heard.push({ want, cue: good });
  }
  // The report's line, into the run's progress file (`tests/e2e/smoke.spec.mjs` keeps a `[quench-progress]` line).
  const line = heard.map(h => (h.skip
    ? `${h.want.key}/${h.want.trigger}: refused ${h.skip}`
    : `${h.want.kind === "attack" ? `strike:${h.cue.record.strike?.form}` : `${h.want.key}/${h.want.trigger}`} [${h.cue.steps.length} steps, ${h.cue.steps.filter(s => s.kind === "sound").length} sound] ${describeSteps(h.cue).join(" | ")}`));
  console.debug(`[quench-progress]   ANI ${item.name} :: ${line.join(" || ")}`);
  return heard;
}

/** One `it` an item, in describes by group, for the items this batch heard. */
function verdicts(context, items) {
  const { describe, it, assert } = context;
  const groups = [...new Set(items.map(i => i.group))];
  for (const group of groups) {
    describe(`Verified: ${group}`, function () {
      for (const item of items.filter(i => i.group === group)) {
        if (item.quiet) {
          it(`${item.name} plays nothing of its own, and says why (${item.key})`, function () {
            assert.isString(NECRO_NO_ROW[item.key], `${item.name}: no quiet reason in NECRO_NO_ROW`);
            assert.isAbove(NECRO_NO_ROW[item.key].length, 10, `${item.name}: a quiet reason in words`);
            assert.notOk(FEATURE_ANIMATIONS[item.key], `${item.name}: a quiet item has no row of its own`);
            console.debug(`[quench-progress]   ANI ${item.name} :: quiet: ${NECRO_NO_ROW[item.key]}`);
            if (item.expect?.length) judge(assert, item);
          });
          continue;
        }
        const title = item.expect.map(w => (w.skip ? `${w.key} refused ${w.skip}` : w.kind === "attack" ? `the ${w.form} strike` : `${w.key} on ${w.trigger}`)).join(", ");
        it(`${item.name}: ${title}, with a picture and a sound, read back live`, function () {
          judge(assert, item);
        });
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/*  The items                                                          */
/* ------------------------------------------------------------------ */

// The items live in `necromancer-animation-items.mjs`, pure, so a Vitest can hold them to the class.

/* ------------------------------------------------------------------ */
/*  The gaps: controls no earlier batch pressed                        */
/* ------------------------------------------------------------------ */

/** Press the card's Place area and the board at each point in turn until the Region is laid (a cone or a line takes a facing). */
async function placeAim(card, points) {
  const created = untilHook("createRegion", 30000);
  const p = await pressCard(card, 'button[data-action="placeArea"]');
  try {
    for (const point of points) {
      await until(pickActive, "the area pick armed", 15000);
      await settle();
      pressBoard(point);
      await sleep(600);
      if (!pickActive()) break;
    }
    if (pickActive()) { game.system.azeroth.canvas.cancelPick(); throw new Error("the area pick never took the board's presses"); }
    const [doc] = await created;
    return doc;
  } finally {
    await p.release();
  }
}

/** Wait for a cue of a trigger and key in what the listener heard since `from`. */
const heardSince = (from, trigger, key, what) => until(() => SPY.cues.slice(from).find(c => c.record?.trigger === trigger && c.record?.identifier === key) ?? null, what, 20000);

/** An area spell's card cast and its Place area pressed on the board; resolves once its region cue was heard. */
async function areaGap(assert, { name, spell, level, at, points, extra = [] }) {
  const n = await necro(`ZZ ANI ${name}`, { level, spells: [spell] });
  const foe = await creature("Bandit", `ANI ${name} Foe`, { hp: 60 });
  const others = [];
  for (const [entry, x, y] of extra) others.push({ actor: await creature(entry, `ANI ${name} ${entry}`, { hp: 30 }), x, y, side: "hostile" });
  await sceneWith([{ actor: n, x: 500, y: 600 }, { actor: foe, x: at.x, y: at.y, side: "hostile" }, ...others]);
  const from = SPY.cues.length;
  const card = await castOk(n, spell, { targets: [foe] });
  const placed = await placeAim(card, points);
  assert.ok(placed, `${spell}'s Region laid`);
  const key = card.flags[SCOPE].identifier;
  return heardSince(from, "region", key, `${spell}'s region cue`);
}

/** A creature ability pressed on the NPC sheet's own Use control; its card. */
async function useOnSheet(actor, name, targets = []) {
  const index = actor.system.creatureAbilities.findIndex(r => r.name === name);
  if (index < 0) throw new Error(`${actor.name} holds no ${name}`);
  canvas.tokens.setTargets(targets.map(t => tokenOf(t)?.id).filter(Boolean));
  await settle();
  const sheet = await openSheet(actor);
  const prior = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(20);
  const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "ability").then(([m]) => { made.push(m); return m; });
  try {
    const button = await until(() => sheet.element?.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`), `${actor.name}'s Use for ${name}`);
    button.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, prior);
    await sheet.close().catch(() => {});
  }
}

/** A creature's block spell cast from its own Spells tab; its card. */
async function castOnNpcSheet(actor, name, targets = []) {
  canvas.tokens.setTargets(targets.map(t => tokenOf(t)?.id).filter(Boolean));
  await settle();
  const sheet = await openSheet(actor);
  const prior = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(19);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell").then(([m]) => { made.push(m); return m; });
  try {
    const button = await until(() => sheet.element?.querySelector(`section[data-tab="spells"] [data-action="castSpell"][data-name="${name}"]`), `${actor.name}'s Cast for ${name}`);
    button.click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, prior);
    await sheet.close().catch(() => {});
  }
}

/** A bestiary creature for a gap test, linked, at full Health and full Power. */
async function npcFor(entry, name) {
  const npc = await makeNpc(entry);
  const update = { name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "prototypeToken.actorLink": true };
  if (Number(npc.system.power?.max) > 0) update["system.power.value"] = npc.system.power.max;
  await npc.update(update);
  return npc;
}

/** The gaps of tier 3: three placed areas and Graveblight's loop. */
function t3Gaps(context) {
  const { describe, it, assert } = context;
  describe("ANI: the tier 3 areas no earlier batch placed", function () {
    lifecycle(context);
    it("ANI: Plague Wind's cone, placed by the card's Place area, plays its region cue", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Wind", spell: "Plague Wind", level: 11, at: { x: 800, y: 600 }, points: [{ x: 850, y: 650 }, { x: 900, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the cone's sound");
    });
    it("ANI: Grave Tide's line, placed by the card's Place area, plays its region cue", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Tide", spell: "Grave Tide", level: 11, at: { x: 900, y: 600 }, points: [{ x: 950, y: 650 }, { x: 1000, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the line's sound");
    });
    it("ANI: Terror of the Grave's ground, placed by the card's Place area, plays its region cue", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Terror", spell: "Terror of the Grave", level: 11, at: { x: 1000, y: 600 }, points: [{ x: 1050, y: 650 }, { x: 1100, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the skull sign's sound");
    });
    it("ANI: Graveblight's area, placed by the card's Place area, plays its region cue and stands its loop while the Sustain holds", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Blight", spell: "Graveblight", level: 11, at: { x: 1200, y: 600 }, points: [{ x: 1250, y: 650 }, { x: 1300, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the blight's sound");
      await until(() => {
        api().director.reconcile({ force: true });
        return SPY.loops.some(l => l.loop?.identifier === "graveblight");
      }, "Graveblight's loop standing", 20000);
    });
  });
}

/** The gaps of tiers 4 and 5: two placed areas. */
function t45Gaps(context) {
  const { describe, it, assert } = context;
  describe("ANI: the tier 4 and 5 areas no earlier batch placed", function () {
    lifecycle(context);
    it("ANI: Necrotic Nova's burst, placed by the card's Place area, plays its region cue", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Nova", spell: "Necrotic Nova", level: 17, at: { x: 900, y: 600 }, points: [{ x: 950, y: 650 }, { x: 1000, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the toll's sound");
    });
    it("ANI: Plague of Undeath's ground, placed by the card's Place area, plays its region cue", async function () {
      this.timeout(150000);
      const cue = await areaGap(assert, { name: "Plague", spell: "Plague of Undeath", level: 20, at: { x: 900, y: 600 }, points: [{ x: 950, y: 650 }, { x: 1000, y: 650 }] });
      assert.ok(cue.steps.some(s => s.kind === "sound"), "the plague's sound");
    });
  });
}

/** The gaps of the creatures: a graft given, and the raised creatures' own Uses, Casts and attacks. */
function creatureGaps(context) {
  const { describe, it, assert } = context;
  describe("ANI: the grafts and the raised creatures' own controls", function () {
    lifecycle(context);

    it("ANI: Butcher's Arm and Bone Plating, given at Stitch Abomination's cast with the space pressed on the board, play the stitching on the Abomination", async function () {
      this.timeout(180000);
      // Surgeon's Hand 1 offers Butcher's Arm (`rules/grafts.mjs#SURGEON_GRAFTS`); the base menu holds Bone Plating.
      const n = await necro("ZZ ANI Butcher", { level: 11, spells: ["Stitch Abomination"], ranks: { "Surgeon's Hand": 1 } });
      await sceneWith([{ actor: n, x: 500, y: 600 }]);
      await bankEssence(n, 2);
      const from = SPY.cues.length;
      const card = await castWith(n, "Stitch Abomination", { steps: [async app => {
        const space = (async () => { await until(pickActive, "the board pick armed", 15000); await settle(); pressBoard({ x: 850, y: 650 }); })();
        await tick(app, ["Butcher's Arm", "Bone Plating"]);
        await space;
      }] });
      assert.ok(card?.flags[SCOPE].success, "Stitch Abomination was cast");
      const abom = await until(() => hordeActorsOf(n).find(a => (a.getFlag(SCOPE, "bond")?.entryName ?? a.name) === "Abomination"), "the Abomination in the horde");
      assert.sameMembers(abom.getFlag(SCOPE, "grafts") ?? [], ["butchersArm", "bonePlating"], "with both grafts");
      const stitch = await heardSince(from, "rise", "graft:stitch", "the stitching");
      assert.include(placedOn(stitch), tokenOf(abom).id, "on the Abomination");
    });

    it("ANI: Lichdom's binding, pressed on the sheet in the Long Rest's window with the lich on the board, plays at the lich", async function () {
      this.timeout(240000);
      // The review batch binds a lich that stands on no scene, so its card names no token and the cue
      // has no anchor (`no-anchor`, the right answer there); here the lich stands on the board.
      const lich = await necro("ZZ ANI Lich", { level: 20 });
      await until(() => lich.items.some(i => i.type === "feature" && i.name === "Lichdom"), "Lichdom granted");
      await give(lich, "Phylactery", "azeroth-rpg.gear");
      await sceneWith([{ actor: lich, x: 500, y: 600 }]);
      const sheet = await openSheet(lich);
      const prior = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      try {
        (await until(() => sheet.element.querySelector('[data-action="longRest"]'), "the Long Rest control")).click();
        await until(() => Boolean(lich.getFlag(SCOPE, "phylacteryWindow")), "the window opened by the sheet's Long Rest", 60000);
      } finally {
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, prior);
        await sheet.close().catch(() => {});
      }
      const feature = lich.items.find(i => i.type === "feature" && i.name === "Lichdom");
      const from = SPY.cues.length;
      const bound = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.featureKey === "lichdom:bind").then(([m]) => { made.push(m); return m; });
      pressUse(lich, "Lichdom").catch(() => null);
      await pick(await chooser(feature), "Bind yourself");
      assert.ok(await bound, "the binding's card");
      const cue = await heardSince(from, "use", "lichdom:bind", "the binding's cue");
      assert.include(placedOn(cue), tokenOf(lich).id, "drawn at the lich");
    });

    it("ANI: the Skeletal Mage's Frostbolt, cast from its own Spells tab at a foe", async function () {
      this.timeout(120000);
      const mage = await npcFor("Skeletal Mage", "ANI Mage");
      const foe = await creature("Bandit", "ANI Mage Foe", { hp: 40 });
      await sceneWith([{ actor: mage, x: 500, y: 600 }, { actor: foe, x: 900, y: 600, side: "hostile" }]);
      const card = await castOnNpcSheet(mage, "Frostbolt", [foe]);
      assert.ok(card?.flags[SCOPE].success, "Frostbolt was cast");
    });

    it("ANI: the Skeletal Mage's Frost Armor, cast from its own Spells tab", async function () {
      this.timeout(120000);
      const mage = await npcFor("Skeletal Mage", "ANI Mage Armor");
      await sceneWith([{ actor: mage, x: 500, y: 600 }]);
      const card = await castOnNpcSheet(mage, "Frost Armor");
      assert.ok(card?.flags[SCOPE].success, "Frost Armor was cast");
    });

    it("ANI: the Shade's Numbing Cold, pressed on its own sheet", async function () {
      this.timeout(120000);
      const shade = await npcFor("Shade", "ANI Shade");
      const foe = await creature("Bandit", "ANI Shade Foe", { hp: 40 });
      await sceneWith([{ actor: shade, x: 500, y: 600 }, { actor: foe, x: 600, y: 600, side: "hostile" }]);
      assert.ok(await useOnSheet(shade, "Numbing Cold", [foe]), "Numbing Cold posted its card");
    });

    it("ANI: the Shade's Unseen, pressed on its own sheet", async function () {
      this.timeout(120000);
      const shade = await npcFor("Shade", "ANI Shade Unseen");
      await sceneWith([{ actor: shade, x: 500, y: 600 }]);
      assert.ok(await useOnSheet(shade, "Unseen"), "Unseen posted its card");
    });

    it("ANI: the Shade's Chilling touch, its attack row pressed on its own sheet", async function () {
      this.timeout(120000);
      const shade = await npcFor("Shade", "ANI Shade Touch");
      const foe = await creature("Bandit", "ANI Touch Foe", { hp: 40 });
      await sceneWith([{ actor: shade, x: 500, y: 600 }, { actor: foe, x: 600, y: 600, side: "hostile" }]);
      const attack = await npcAttacks(shade, shade.system.attacks[0].name, foe, { face: 19 });
      assert.ok(attack, "the touch posted its attack card");
    });

    it("ANI: the Abomination's Gut Spill, pressed on its own sheet beside a foe", async function () {
      this.timeout(120000);
      const abom = await npcFor("Abomination", "ANI Abom");
      const foe = await creature("Bandit", "ANI Abom Foe", { hp: 40 });
      await sceneWith([{ actor: abom, x: 500, y: 600 }, { actor: foe, x: 700, y: 600, side: "hostile" }]);
      assert.ok(await useOnSheet(abom, "Gut Spill", [foe]), "Gut Spill posted its card");
    });

    it("ANI: the Abomination's Cleaver and Chain hook, each attack row pressed on its own sheet", async function () {
      this.timeout(150000);
      const abom = await npcFor("Abomination", "ANI Abom Blows");
      const foe = await creature("Bandit", "ANI Blows Foe", { hp: 60 });
      await sceneWith([{ actor: abom, x: 500, y: 600 }, { actor: foe, x: 700, y: 600, side: "hostile" }]);
      for (const row of ["Cleaver", "Chain hook"]) {
        const from = SPY.cues.length;
        const attack = await npcAttacks(abom, row, foe, { face: 19 });
        assert.ok(attack, `${row} posted its attack card`);
        const blow = await until(() => SPY.cues.slice(from).find(c => c.record?.kind === "attack") ?? null, `${row}'s strike cue`, 20000);
        assert.ok(blow.steps.some(s => s.kind === "sound"), `${row}'s strike plays a sound`);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  The batches                                                        */
/* ------------------------------------------------------------------ */

/** One animation batch: the listener around the scenarios it reruns and the gaps it presses, then a verdict an item. */
function animationBatch(name, runs, items) {
  return function (context) {
    const { describe } = context;
    describe(`The Necromancer's animations and sounds, read back live (${name})`, function () {
      listening(context);
      for (const [batch, fn] of runs) fn(recording(context, batch));
      verdicts(context, items);
    });
  };
}

export const necromancerAnimationsSpellsBatch = animationBatch("tiers 1 and 2, and Essence", [
  ["necromancer-spells", necromancerSpellsBatch],
  ["necromancer-essence", necromancerEssenceBatch]
], SPELL_ITEMS);

export const necromancerAnimationsT3Batch = animationBatch("tier 3", [
  ["necromancer-spells-t3", necromancerSpellsT3Batch],
  ["ani-t3-gaps", t3Gaps]
], T3_ITEMS);

export const necromancerAnimationsT45Batch = animationBatch("tiers 4 and 5, and the shared spells", [
  ["necromancer-spells-t45", necromancerSpellsT45Batch],
  ["ani-t45-gaps", t45Gaps]
], T45_ITEMS);

export const necromancerAnimationsFeaturesTalentsBatch = animationBatch("features, talents and the horde", [
  ["necromancer-talents", necromancerTalentsBatch],
  ["necromancer-horde", necromancerHordeBatch],
  ["necromancer-verify", necromancerVerifyBatch]
], FT_ITEMS);

export const necromancerAnimationsCreaturesBatch = animationBatch("grafts, creatures and the review", [
  ["necromancer-review", necromancerReviewBatch],
  ["necromancer-fixes", necromancerFixesBatch],
  ["ani-creature-gaps", creatureGaps]
], CREATURE_ITEMS);
