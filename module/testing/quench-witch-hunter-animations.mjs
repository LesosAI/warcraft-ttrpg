/**
 * **EVERY WITCH HUNTER ITEM PLAYS A PICTURE AND A SOUND, READ BACK LIVE** (the Witch Hunter plan's wave 3; D-2095 to
 * D-2099; the lead's bar: *every feature, Sign, brew and talent has a door, an animation with a sound step, and a live
 * test that presses the real control*).
 *
 * **What "verified" means here**, for each Sign, each of 02's features with a row, each of 08 §12's nineteen brews,
 * the Tempo's rise and fall and 04's talents with a spread row:
 *
 *  1. a recipe keyed as the table keys it (`rules/witch-hunter-animations.mjs`);
 *  2. a sound step in every cue, every asset a full leaf of `tools/animation/assets.json` (the Vitest
 *     `module/rules/witch-hunter-animations.test.mjs` and `animation-sound-census.test.mjs` hold this);
 *  3. **played live through the real control** - the sheet's Use, the Hunter panel's own Use and pool stepper, the
 *     card's buttons, the board's pick - and read back through the recorder: the cue came back with an effect step and
 *     a sound step, on the tokens the record names, and no `SKIPS` word stood in its place; where the item stands a
 *     loop, the loop stood;
 *  4. every asset the played cue carries resolves to a LEAF of the running client's Sequencer database.
 *
 * **How it reuses the batches that already press every control** (the Demon Hunter's pattern,
 * `quench-demon-hunter-animations.mjs`): the Witch Hunter's brews, tome, signs and features batches run again with
 * the recorder standing in for the player (D-729), and what the recorder heard during each test is kept as that test's
 * evidence. Then one `it` an item judges that item's cues - and where no earlier batch pressed the control on a board
 * (the elixirs and oils are drunk and laid with no scene there, the Tempo stepper, Ashen Ring's ring), a test here
 * presses it (the `ANI:` tests).
 *
 * One batch: `azeroth-rpg.witch-hunter-animations`. It needs `packs:build` first, as its reruns do. Written in wave 3
 * and run in the lead's live pass (wave 4).
 */

import { cleanup, give, made, makeCharacter, openSheet, PACK_FOR, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SCENE_SETTLE, fightWith, freshTurn, pressUse, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { pickState } from "../canvas/place.mjs";
import { witchHunterBrewsBatch, witchHunterTomeBatch } from "./quench-witch-hunter-2a.mjs";
import { witchHunterFeaturesBatch, witchHunterSignsBatch } from "./quench-witch-hunter-signs.mjs";
import { WH_BREW_ITEMS, WH_FEATURE_ITEMS, WH_TALENT_ITEMS } from "./witch-hunter-animation-items.mjs";
import { RecordingPlayer } from "./animation-recorder.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { ASHEN_RING_KEY } from "../rules/witch-hunter-animations.mjs";
import { BREW_IDENTIFIERS, brewOf } from "../rules/witch-hunter-brews.mjs";
import { TOME_FLAG } from "../rules/witch-hunter-standing.mjs";
import { WH_BREW_LOG_FLAG } from "../rules/witch-hunter-talents.mjs";
import { moduleOn, sequencerOn } from "../animation/availability.mjs";
import { pressCard } from "./quench-chronomancer-common.mjs";
import {
  attackFrom, equip, fill, foeAt, hunterWith as whHunterWith, npcSwing, useSign
} from "./quench-witch-hunter-common.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = () => game.system.azeroth.animations;
const tempoOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tempo") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;

/* ------------------------------------------------------------------ */
/*  The listener                                                       */
/* ------------------------------------------------------------------ */

/** Who a token is, as a judge reads it. */
function roleOf(doc) {
  const actor = doc?.actor ?? null;
  if (!actor) return "gone";
  if (actor.items?.some(i => i.type === "class" && i.name === "Witch Hunter")) return "hunter";
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
      return cue.steps.some(s => s.kind === "effect" && (s.at || (s.from && s.to && !s.fromToken && !s.toToken))) ? null : "no effect step is placed at a point";
    default:
      return null;
  }
}

const scenarios = from => EVIDENCE.filter(e => from.some(prefix => e.title.startsWith(prefix)));
const answers = (cue, want) => cue.record?.trigger === want.trigger && cue.record?.identifier === want.key
  && (!want.state || (cue.record?.states ?? []).includes(want.state));

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
    const label = `${want.key}'s ${want.trigger} cue${want.state ? ` [${want.state}]` : ""}`;
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
/*  The gaps: controls no earlier batch pressed on a board             */
/* ------------------------------------------------------------------ */

/** A Human Witch Hunter at a level, its Tome holding these types, these talents at these ranks, its pools filled. */
async function hunter(name, { level = 1, ranks = {}, known = ["undead", "beast"], studied = ["undead"] } = {}) {
  const actor = await makeCharacter({ name, classes: [["Witch Hunter", level]], race: "Human", abilities: { str: 16, con: 18, int: 16, wis: 14 } });
  await actor._talentGrant;
  await until(() => tempoOf(actor) && energyOf(actor), "the Tempo and Energy pools");
  await actor.setFlag(SCOPE, TOME_FLAG, { known, studied, damaged: [], defeated: [], learned: false, learnOpen: null });
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(actor, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  const energy = energyOf(actor);
  await actor.updatePool({ itemId: energy.itemId, kind: "power", value: energy.max });
  return actor;
}

/** A brew from the gear pack given to an actor, as though the actor brewed it. */
async function brewFor(actor, identifier, { type = null } = {}) {
  const item = await give(actor, brewOf(identifier).name, PACK_FOR.equipment);
  const spellDC = (await import("../effects/witch-hunter-brews.mjs")).whSpellDC(actor);
  await item.update({ "system.quantity": 1, [`flags.${SCOPE}.whBrewed`]: { maker: actor.uuid, generation: 0, brewed: 1, type, school: null, spellDC, tier: actor.system?.tier ?? 1 } });
  return item;
}

/** Press the Hunter panel's own control for one brew (Drink or Coat weapon), the roll dialog skipped; its card. */
async function pressBrew(actor, item) {
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-action="whUseBrew"][data-item-id="${item.id}"]`);
  if (!control) throw new Error(`the Hunter panel draws no control for ${item.name}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && ["whBrewUse", "feature"].includes(m.flags?.[SCOPE]?.kind))
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Press the board where a pick waits, at a point in canvas pixels. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

function gaps(context) {
  const { describe, it, assert, before, after } = context;
  describe("ANI: the Witch Hunter's controls no earlier batch presses on a board", function () {
    let restoreText = null;
    before(async function () { restoreText = await quietScrollingText(); });
    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("ANI: every elixir and the Decoction, drunk through the Hunter panel on the board", async function () {
      this.timeout(300000);
      const wh = await hunter("ZZ ANI WH Elixirs", { level: 14 });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      for (const id of BREW_IDENTIFIERS.filter(x => ["elixir", "decoction"].includes(brewOf(x).kind))) {
        const item = await brewFor(wh, id, { type: id === "decoction" ? "dragonkin" : null });
        const card = await pressBrew(wh, item);
        assert.ok(card, `${id}: its card`);
        await sleep(400);
      }
    });

    it("ANI: every oil, laid on the blade through the Hunter panel on the board", async function () {
      this.timeout(180000);
      const wh = await hunter("ZZ ANI WH Oils");
      const sword = await give(wh, "Longsword", PACK_FOR.weapon);
      await sword.update({ "system.equipped": true });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      for (const id of BREW_IDENTIFIERS.filter(x => brewOf(x).kind === "oil")) {
        const item = await brewFor(wh, id, { type: id === "hunters-oil" ? "undead" : null });
        const card = await pressBrew(wh, item);
        assert.ok(card, `${id}: its card`);
        await sleep(400);
      }
    });

    it("ANI: Tempo stepped up and down on the Hunter panel's own Tempo bar", async function () {
      this.timeout(120000);
      const wh = await hunter("ZZ ANI WH Tempo");
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const pool = tempoOf(wh);
      await wh.updatePool({ itemId: pool.itemId, kind: "momentum", value: 2 });
      await until(() => tempoOf(wh).value === 2, "2 Tempo");
      const step = async delta => {
        const sheet = await openSheet(wh);
        const control = sheet.element.querySelector(`section[data-tab="combat"] [data-wh-pool="tempo"] [data-action="stepPool"][data-delta="${delta}"]`);
        if (!control) throw new Error(`the Hunter panel draws no Tempo step of ${delta}`);
        control.click();
        await settle();
      };
      await step(1);
      await until(() => tempoOf(wh).value === 3, "the step up landed");
      await step(-1);
      await until(() => tempoOf(wh).value === 2, "the step down landed");
    });

    it("ANI: Ashen Ring, the Ash ring placed with its Holy fire", async function () {
      this.timeout(240000);
      const wh = await hunter("ZZ ANI WH Ashen", { level: 9, ranks: { "Ashen Ring": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 800, y: 1000 }]);
      const combat = await fightWith([wh]);
      await freshTurn(wh, 1);
      const unpin = pinDie(15);
      try {
        const { card } = await pressUse(wh, "Ash Sign");
        await until(() => pickState()?.mode === "point", "the Ash ring's point");
        pressBoard({ x: 1000, y: 1050 });
        await card;
      } finally {
        unpin();
      }
      const ring = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.caster === wh.uuid && (r.flags?.[SCOPE]?.areaTick?.against ?? []).some(a => a?.school === "holy")), "the Ash ring with Ashen Ring's row");
      assert.ok(ring, "the ring carries Ashen Ring's Holy row, which the records key ashen-ring");
      await sleep(800);
      // `activeLoops()` answers a Map keyed by loop key (the player's own shape, read as the Death Knight batch reads it),
      // so the loop standing is a key the recorder heard played for Ashen Ring (wave 4's live run).
      const standing = new Set(api().director.activeLoops().keys());
      const played = SPY.loops.filter(l => l.loop?.identifier === ASHEN_RING_KEY);
      assert.ok(played.length, "Ashen Ring's loop played on the ring");
      assert.ok(played.some(l => standing.has(l.key)), "Ashen Ring's loop still stands while the ring does");
      await combat.delete();
    });

    /* ---- The talents whose doors landed in wave 2b (the review's A3; 2d-A's `WH_TALENT_ITEMS` prefixes) ---- */

    it("ANI: Firestream, the Ember Sign's cone left alight on the board", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Firestream", { ranks: { firestream: 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      // In a started fight, as the talents batch's FIRESTREAM case: the cone stands *until the start of your next turn*,
      // and out of a fight there is no turn to hold it, so its loop never had a moment to stand (wave 4's live run).
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      await (await useSign(wh, "Signs", "ember", { aim: { x: 1600, y: 1050 } }));
      await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.caster === wh.uuid && r.flags?.[SCOPE]?.featureKey === "firestream"), "Firestream's Region");
      await until(() => SPY.loops.some(l => l.loop?.identifier === "firestream"), "Firestream's loop standing on the cone");
      await combat.delete();
    });

    it("ANI: Bursting Rowan, the burst on the enemy beside the warded hunter", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Bursting", { ranks: { "bursting-rowan": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const near = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const before = near.actor.system.health.value;
      await (await useSign(wh, "Signs", "rowan"));
      await until(() => near.actor.system.health.value < before, "the burst landed");
      await until(() => [...game.messages].some(m => m.flags?.[SCOPE]?.featureKey === "bursting-rowan"), "the burst's event card");
      await sleep(800);
    });

    it("ANI: Tumble, the free step pressed off a melee miss", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Tumble", { ranks: { tumble: 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      const attack = await npcSwing(foe.actor, tokenOf(wh), 1);
      const { release } = await pressCard(attack, `button[data-action="evade"][data-actor-uuid="${wh.uuid}"]`);
      await release();
      await until(() => [...game.messages].some(m => m.flags?.[SCOPE]?.featureKey === "tumble"), "Tumble's event card");
      await sleep(800);
    });

    it("ANI: Second Cut, the one more attack pressed off a hit's card", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Second Cut", { ranks: { "lethal-edge": 1, "second-cut": 1 }, weapons: ["Longsword"] });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await freshTurn(wh, 2);
      await fill(wh, "momentum", "tempo", 3);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 15 });
      const { release } = await pressCard(card, 'button[data-action="extraStrike"][data-strike="second-cut"]', { face: 15 });
      try {
        await until(() => [...game.messages].some(m => m.flags?.[SCOPE]?.featureKey === "second-cut"), "Second Cut's event card", 30000);
      } finally { await release(); }
      await sleep(800);
    });

    it("ANI: Cat's Dance, the attack with a Boon on a different creature in reach", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Cat's Dance", { ranks: { "kill-rhythm": 1, "cats-dance": 1 }, weapons: ["Longsword"], level: 20 });
      const blade = await equip(wh, "Longsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const other = await foeAt(scene, "Defias Footpad", 1000, 1100);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [foe, other].map(d => ({ actorId: d.actorId, sceneId: scene.id, tokenId: d.id })));
      await freshTurn(wh, 2);
      await fill(wh, "momentum", "tempo", 3);
      const { card } = await attackFrom(wh, blade, [foe.object], { face: 15 });
      await sleep(1500);
      canvas.tokens.setTargets([other.object.id]);
      const { release } = await pressCard(card, 'button[data-action="extraStrike"][data-strike="cats-dance"]', { face: 15 });
      try {
        await until(() => [...game.messages].some(m => m.flags?.[SCOPE]?.featureKey === "cats-dance"), "Cat's Dance's event card", 30000);
      } finally { await release(); canvas.tokens.setTargets([]); }
      await sleep(800);
    });

    it("ANI: Thunderous Swing, the push off a hit with a weapon in two hands", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Thunderous", { ranks: { "thunderous-swing": 1 }, weapons: ["Greatsword"] });
      const sword = await equip(wh, "Greatsword");
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Defias Footpad", 1100, 1000);
      const x0 = foe.x;
      await attackFrom(wh, sword, [foe.object], { face: 20 });
      await until(() => scene.tokens.get(foe.id).x !== x0, "the target pushed");
      await sleep(1200);
    });

    it("ANI: Mountain Bear, the Use's minute and its loop", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Mountain", { ranks: { "bears-wrath": 1, "ursine-fury": 1, "mountain-bear": 1 }, level: 20 });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const { card } = await pressUse(wh, "Mountain Bear");
      await card;
      await until(() => wh.effects.some(e => e.flags?.[SCOPE]?.whMountainBear), "the minute's effect");
      await sleep(800);
    });

    it("ANI: Second Brewing, the Use that puts the brewing back", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Second Brewing", { ranks: { "refined-decoctions": 1, "second-brewing": 1 }, level: 20 });
      await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      await wh.setFlag(SCOPE, WH_BREW_LOG_FLAG, { generation: 0, rows: [{ identifier: "peacebloom-draught", doses: 2, type: null, school: null, name: "" }] });
      const { card } = await pressUse(wh, "Second Brewing");
      await card;
      await until(() => wh.items.some(i => i.system?.identifier === "peacebloom-draught"), "the draught put back");
      await sleep(800);
    });

    it("ANI: Bear's Endurance, the temporary Health when a blow takes the hunter below half in a fight", async function () {
      this.timeout(240000);
      const wh = await whHunterWith("ZZ ANI WH Endurance", { ranks: { "bears-endurance": 1 } });
      const scene = await sceneWith([{ actor: wh, x: 1000, y: 1000 }]);
      const foe = await foeAt(scene, "Kobold", 1100, 1000);
      const combat = await fightWith([wh]);
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: foe.actorId, sceneId: scene.id, tokenId: foe.id }]);
      await wh.update({ "system.health.value": Math.ceil(wh.system.health.max / 2) });
      const attack = await npcSwing(foe.actor, tokenOf(wh), 20);
      const { release } = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      await release();
      await until(() => (wh.system.health.temp ?? 0) > 0, "the temporary Health");
      await until(() => [...game.messages].some(m => m.flags?.[SCOPE]?.featureKey === "bears-endurance"), "Bear's Endurance's event card");
      await sleep(800);
    });
  });
}

/**
 * **WHAT THE BATCH NEEDS TO PLAY ANYTHING** (the review's B5: *the animations batch fails wholesale if Sequencer or
 * JB2A is absent*). Every judgement below reads a cue a live Sequencer played from JB2A's database; with either module
 * off nothing can play, so the batch SKIPS, and says why in words, rather than failing every item.
 */
function librariesMissing() {
  const missing = [];
  if (!sequencerOn()) missing.push("Sequencer");
  if (!moduleOn("JB2A_DnD5e")) missing.push("JB2A");
  return missing;
}

/* ------------------------------------------------------------------ */
/*  The batch                                                          */
/* ------------------------------------------------------------------ */

export function witchHunterAnimationsBatch(context) {
  const { describe, before, it, assert } = context;
  describe("The Witch Hunter's animations and sounds, read back live", function () {
    // The skip comes first, before the listener's own `before`: Mocha skips every test of a suite whose `before` hook
    // calls `this.skip()`, and the reason is printed beside the progress lines the smoke run keeps.
    before(function () {
      const missing = librariesMissing();
      if (!missing.length) return;
      const reason = `azeroth-rpg.witch-hunter-animations SKIPPED: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not active, so no cue can play`;
      console.warn(`[quench-progress] ${reason}`);
      ui.notifications?.warn(reason);
      this.skip();
    });
    it("ANIMATION LIBRARIES: Sequencer and JB2A are active, so every cue below can play", function () {
      assert.deepEqual(librariesMissing(), [], "Sequencer and JB2A are active");
    });
    listening(context);
    for (const [batch, fn] of [
      ["witch-hunter-brews", witchHunterBrewsBatch], ["witch-hunter-tome", witchHunterTomeBatch],
      ["witch-hunter-signs", witchHunterSignsBatch], ["witch-hunter-features", witchHunterFeaturesBatch], ["ani-gaps", gaps]
    ]) {
      fn(recording(context, batch));
    }
    verdicts(context, [...WH_FEATURE_ITEMS, ...WH_BREW_ITEMS, ...WH_TALENT_ITEMS]);
  });
}
