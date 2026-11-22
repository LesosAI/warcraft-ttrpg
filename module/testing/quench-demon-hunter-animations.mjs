/**
 * **EVERY DEMON HUNTER ITEM PLAYS A PICTURE AND A SOUND, READ BACK LIVE** (the Demon Hunter plan's Phase 6;
 * D-1580; the lead's completeness bar: *every feature, talent and spell has a door, an animation with a sound
 * step, and a live test that presses the real control*).
 *
 * **What "verified" means here**, for each of the class's twenty own spells, 02's features with a row, the states
 * the class lays and 04's talents with a row:
 *
 *  1. a recipe keyed as the table keys it (`rules/demon-hunter-animations.mjs`);
 *  2. a sound step in every cue, every asset a full leaf of `tools/animation/assets.json` (the Vitest
 *     `module/rules/demon-hunter-animations.test.mjs` and `animation-sound-census.test.mjs` hold this);
 *  3. **played live through the real control** - the sheet's Cast or Use, the card's buttons, a real attack card -
 *     and read back through the recorder: the cue came back with an effect step and a sound step, on the tokens
 *     the record names, and no `SKIPS` word stood in its place; where the item stands a loop, the loop stood;
 *  4. every asset the played cue carries resolves to a LEAF of the running client's Sequencer database.
 *
 * **How it reuses the batches that already press every control** (the Sovereign's pattern,
 * `quench-sovereign-animations.mjs`): the Demon Hunter's spells and features batches run again with the recorder
 * standing in for the player (D-729), and what the recorder heard during each test is kept as that test's
 * evidence. Then one `it` an item judges that item's cues - and where no earlier batch pressed the control that
 * animates an item, a test here presses it (the `ANI:` tests: the two placed areas and the three talents' Uses).
 *
 * One batch: `azeroth-rpg.demon-hunter-animations`. It needs `packs:build` first, as its two reruns do.
 */

import { cleanup, made, makeCharacter, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING } from "../settings.mjs";
import { SCENE_SETTLE, pressCard, pressUse, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castOk, creature, pressBoard } from "./quench-necromancer-spells.mjs";
import { demonHunterSpellsBatch } from "./quench-demon-hunter-spells.mjs";
import { demonHunterFeaturesBatch } from "./quench-demon-hunter-features.mjs";
import { DH_FEATURE_ITEMS, DH_SPELL_ITEMS } from "./demon-hunter-animation-items.mjs";
import { RecordingPlayer } from "./animation-recorder.mjs";
import { animationAvailability } from "../animation/availability.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = () => game.system.azeroth.animations;
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;
const hatredOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "hatred") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;

/* ------------------------------------------------------------------ */
/*  The listener                                                       */
/* ------------------------------------------------------------------ */

/** Who a token is, as a judge reads it. */
function roleOf(doc) {
  const actor = doc?.actor ?? null;
  if (!actor) return "gone";
  if (actor.items?.some(i => i.type === "class" && i.name === "Demon Hunter")) return "hunter";
  return actor.type === "character" ? "character" : "creature";
}

/** The recorder, with each token a cue names resolved to a name and a role at the moment it plays. */
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

/** The listener's lifetime around the batch: the switches on, the recorder in, each scene settled. */
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
    EVIDENCE.length = 0;
    SPY = new NamingRecorder();
    const director = api().director;
    realSet = director.setPlayer;
    realReset = director.resetPlayer;
    held.player = realSet(SPY);
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

/** A batch's context whose `it` keeps what was heard from its body's first line to a moment after its last. */
function recording(context, batch) {
  const it = (title, fn) => context.it(title, async function () {
    const mocha = this;
    const ctx = Object.create(mocha);
    ctx.timeout = ms => (ms === undefined ? mocha.timeout() : mocha.timeout(ms + 30000));
    const mark = { cues: SPY.cues.length, skips: SPY.skips.length, loops: SPY.loops.length };
    try {
      await fn.call(ctx);
    } finally {
      // A Region's cue, a loop or a door's own card lands a moment after the card the body waited on.
      await sleep(1500);
      EVIDENCE.push({ batch, title, cues: SPY.cues.slice(mark.cues), skips: SPY.skips.slice(mark.skips), loops: SPY.loops.slice(mark.loops) });
    }
  });
  return { ...context, it };
}

/* ------------------------------------------------------------------ */
/*  The judge                                                          */
/* ------------------------------------------------------------------ */

/** Whether a key is an exact leaf of the running client's Sequencer database. */
function liveLeaf(key) {
  const db = globalThis.Sequencer?.Database;
  if (!db) return false;
  try {
    return db.entryExists(key) && (db.getPathsUnder(key) || []).length === 0;
  } catch {
    return false;
  }
}

/** A cue's steps, as the report prints them. */
function describeSteps(cue) {
  const who = cue.who ?? {};
  const where = s => {
    if (s.on) return `on ${who[s.on]?.name ?? s.on}`;
    if (s.fromToken || s.toToken) return `${who[s.fromToken]?.name ?? s.fromToken ?? "?"} -> ${who[s.toToken]?.name ?? s.toToken ?? "?"}`;
    if (s.at) return `at (${Math.round(s.at.x)}, ${Math.round(s.at.y)})`;
    if (s.from && s.to) return `(${Math.round(s.from.x)}, ${Math.round(s.from.y)}) -> (${Math.round(s.to.x)}, ${Math.round(s.to.y)})`;
    return "";
  };
  return cue.steps.map(s => `${s.kind} ${s.asset}${where(s) ? ` ${where(s)}` : ""}`);
}

const placedOn = cue => cue.steps.filter(s => s.kind === "effect").flatMap(s => [s.on, s.fromToken, s.toToken]).filter(Boolean);

/** The role a cue must play for, or null where it does. */
function whoFault(cue, who) {
  const roles = cue.who ?? {};
  const source = cue.record?.source?.tokenId ?? null;
  switch (who) {
    case "caster":
      return roles[source]?.role === "hunter" ? null : `its source is ${roles[source]?.name ?? "nobody"} (${roles[source]?.role ?? "none"}), not the hunter`;
    case "target":
      return placedOn(cue).some(id => roles[id]?.role && roles[id].role !== "hunter") ? null : "no effect step is placed on a creature other than the hunter";
    case "point":
      // A point, or a stretch between two canvas points that names no token (`rules/animation.mjs#between` for a
      // placed line's or cone's `region-line` / `region-cone`: `from` and `to`, never `at`).
      return cue.steps.some(s => s.kind === "effect" && (s.at || (s.from && s.to && !s.fromToken && !s.toToken))) ? null : "no effect step is placed at a point";
    default:
      return null;
  }
}

const scenarios = from => EVIDENCE.filter(e => from.some(prefix => e.title.startsWith(prefix)));
const answers = (cue, want) => cue.record?.trigger === want.trigger && cue.record?.identifier === want.key;

/** One item's verdict: every cue it expects heard in one of its scenarios with a picture and a sound, every loop stood. */
function judge(assert, item) {
  const runs = scenarios(item.from);
  assert.isAbove(runs.length, 0, `${item.name}: none of its scenarios ran in this batch (${item.from.join(" | ")})`);
  const line = [];
  for (const want of item.expect) {
    if (want.loopOnly) {
      const stood = runs.flatMap(r => r.loops).some(l => l.loop?.identifier === want.key);
      assert.isTrue(stood, `${item.name}: ${want.key}'s loop never stood`);
      line.push(`${want.key}/loop stood`);
      continue;
    }
    const label = `${want.key}'s ${want.trigger} cue`;
    const cues = runs.flatMap(r => r.cues).filter(c => answers(c, want));
    if (!cues.length) {
      const skips = runs.flatMap(r => r.skips).filter(s => answers({ record: s.record }, want)).map(s => s.skip);
      assert.fail(`${item.name}: ${label} never played in ${runs.map(r => `"${r.title.slice(0, 60)}"`).join(", ")}; refused: ${skips.join(", ") || "never asked"}`);
    }
    const good = cues.find(c => c.steps.some(s => s.kind === "effect") && c.steps.some(s => s.kind === "sound") && !whoFault(c, want.who ?? "any")) ?? cues[0];
    assert.isTrue(good.steps.some(s => s.kind === "effect"), `${item.name}: ${label} drew no picture`);
    assert.isTrue(good.steps.some(s => s.kind === "sound"), `${item.name}: ${label} played no sound step: ${describeSteps(good).join(" | ")}`);
    const fault = whoFault(good, want.who ?? "any");
    assert.isNull(fault, `${item.name}: ${label}: ${fault}`);
    const notLeaves = good.steps.map(s => s.asset).filter(a => a && !liveLeaf(a));
    assert.deepEqual(notLeaves, [], `${item.name}: ${label} plays assets the live Sequencer database holds no leaf for`);
    if (want.loop) {
      const stood = runs.flatMap(r => r.loops).some(l => l.loop?.identifier === want.key);
      assert.isTrue(stood, `${item.name}: ${want.key}'s loop never stood`);
    }
    line.push(`${want.key}/${want.trigger} [${good.steps.length} steps, ${good.steps.filter(s => s.kind === "sound").length} sound] ${describeSteps(good).join(" | ")}`);
  }
  console.debug(`[quench-progress]   ANI ${item.name} :: ${line.join(" || ")}`);
}

/** One `it` an item, in describes by group. */
function verdicts(context, items) {
  const { describe, it, assert } = context;
  for (const group of [...new Set(items.map(i => i.group))]) {
    describe(`Verified: ${group}`, function () {
      for (const item of items.filter(i => i.group === group)) {
        const title = item.expect.map(w => (w.loopOnly ? `${w.key}'s loop` : `${w.key} on ${w.trigger}`)).join(", ");
        it(`${item.name}: ${title}, with a picture and a sound, read back live`, function () { judge(assert, item); });
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/*  The gaps: controls no earlier batch pressed                        */
/* ------------------------------------------------------------------ */

/** A Night Elf Demon Hunter at a level, these spells known, these talents at these ranks, its pools in place. */
async function hunter(name, { level = 17, spells = [], ranks = {}, fel = 0 } = {}) {
  const actor = await makeCharacter({ name, classes: [["Demon Hunter", level]], race: "Night Elf", spells, abilities: { dex: 16, wis: 16 }, corruption: { fel } });
  await actor._talentGrant;
  await until(() => hatredOf(actor) && energyOf(actor), "the Hatred and Energy pools");
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(actor, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  return actor;
}

/** Hatred set by a GM's hand (the named `hand` door), and Energy by a plain write. */
async function setPools(actor, { hatred = null, energy = null } = {}) {
  if (hatred !== null) {
    const pool = hatredOf(actor);
    await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: hatred }, {}, { hatredGain: "hand" });
    await until(() => hatredOf(actor).value === hatred, `${hatred} Hatred`);
  }
  if (energy !== null) {
    const pool = energyOf(actor);
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: energy });
    await until(() => energyOf(actor).value === energy, `${energy} Energy`);
  }
}

/** Press the card's Place area and the board at each point in turn until the Region is laid. */
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

/** The two placed areas and the three talents' Uses no earlier batch presses. */
function gaps(context) {
  const { describe, it, assert, before, after } = context;
  describe("ANI: the controls no Demon Hunter batch test presses", function () {
    let restoreText = null;
    before(async function () { restoreText = await quietScrollingText(); });
    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("ANI: Eye Beam and Draw Soul, each area placed from its card on the board", async function () {
      this.timeout(180000);
      const dh = await hunter("ZZ ANI Beam", { level: 17, spells: ["Eye Beam", "Draw Soul"] });
      const foe = await creature("Alliance Footman", "ANI Beam Footman", { hp: 60 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      await setPools(dh, { energy: 10 });
      const beam = await castOk(dh, "Eye Beam", { targets: [foe] });
      const line = await placeAim(beam, [{ x: 1250, y: 1050 }, { x: 1550, y: 1050 }]);
      assert.ok(line, "Eye Beam's line placed");
      await setPools(dh, { energy: 10 });
      const soul = await castOk(dh, "Draw Soul", { targets: [foe] });
      const cone = await placeAim(soul, [{ x: 1250, y: 1050 }, { x: 1400, y: 1050 }]);
      assert.ok(cone, "Draw Soul's cone placed");
    });

    it("ANI: Gift of the Skull and Chaos Blast, pressed from the sheet", async function () {
      this.timeout(180000);
      const dh = await hunter("ZZ ANI Skull", { level: 17, ranks: { "Gift of the Skull": 1, "Chaos Blast": 1 } });
      const foe = await creature("Alliance Footman", "ANI Skull Footman", { hp: 60 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }]);
      await setPools(dh, { hatred: 4, energy: 10 });
      const skull = await pressUse(dh, "Gift of the Skull");
      assert.ok(await skull.card, "Gift of the Skull's card posted");
      await until(() => dh.shape?.kind === "skull", "the lesser shape");
      const blast = await pressUse(dh, "Chaos Blast", [tokenOf(foe)]);
      assert.ok(await blast.card, "Chaos Blast's card posted");
    });

    it("ANI: Silence the Weave, pressed from the sheet", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ ANI Silence", { level: 20, ranks: { "Silence the Weave": 1 } });
      const foe = await creature("Alliance Footman", "ANI Silence Footman", { hp: 60 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      // The footman stands 15 feet off, inside the 30, so the Use asks whom to lay the Banes on: answered through the
      // talents' chooser seam, as the talents batch answers it (an unanswered chooser posts no card).
      const { setDhTalentChoice } = await import("../effects/demon-hunter-talents.mjs");
      setDhTalentChoice(async kind => (kind === "silence" ? [foe.uuid] : null));
      try {
        const silence = await pressUse(dh, "Silence the Weave");
        assert.ok(await silence.card, "Silence the Weave's card posted");
      } finally {
        setDhTalentChoice(null);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  The batch                                                          */
/* ------------------------------------------------------------------ */

export function demonHunterAnimationsBatch(context) {
  const { describe } = context;
  describe("The Demon Hunter's animations and sounds, read back live", function () {
    listening(context);
    for (const [batch, fn] of [["demon-hunter-spells", demonHunterSpellsBatch], ["demon-hunter-features", demonHunterFeaturesBatch], ["ani-gaps", gaps]]) {
      fn(recording(context, batch));
    }
    verdicts(context, [...DH_SPELL_ITEMS, ...DH_FEATURE_ITEMS]);
  });
}
