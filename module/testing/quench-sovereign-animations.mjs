/**
 * **EVERY SOVEREIGN ITEM PLAYS A PICTURE AND A SOUND, READ BACK LIVE** (the San'layn and Sovereign plan's C14
 * and C.4; the lead: *"I expect all automation as well as animations/sound to be completed as well"*).
 *
 * **What "verified" means here**, for each of the 36 spells, 02 §7's features with something to show, 04's
 * talents with a row, the states the blood magic lays and CORE's pool events:
 *
 *  1. a recipe keyed as the table keys it (`rules/sovereign-animations.mjs`, `sovereign-core-animations.mjs`);
 *  2. a sound step in every cue, every asset a full leaf of `tools/animation/assets.json` (the Vitest
 *     `module/rules/sovereign-animations.test.mjs` and `animation-sound-census.test.mjs` hold this);
 *  3. **played live through the real control** - the sheet's Cast or Use, the card's buttons, the tracker's
 *     Next Turn, a real attack card - and read back through the recorder: the cue came back with an effect
 *     step and a sound step, on the tokens the record names, and no `SKIPS` word stood in its place; where
 *     the item stands a loop, the loop stood;
 *  4. every asset the played cue carries resolves to a LEAF of the running client's Sequencer database.
 *
 * **How it reuses the batches that already press every control** (the Necromancer's pattern,
 * `quench-necromancer-animations.mjs`): the Sovereign's spell, core and feature batches run again with the
 * recorder standing in for the player (D-729), and what the recorder heard during each test is kept as that
 * test's evidence. Then one `it` an item judges that item's cues - and where no earlier batch pressed the
 * control that animates an item, a test here presses it (the `ANI:` tests).
 *
 * Two batches: `azeroth-rpg.sovereign-animations` (the spells) and `azeroth-rpg.sovereign-animations-features`
 * (the pools, the features and the talents).
 */

import { cleanup, give, made, makeCharacter, openSheet, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING } from "../settings.mjs";
import { SCENE_SETTLE, chooser, fightWith, pick, pressCard, pressUse, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { board, castOk, creature, pressBoard, resist } from "./quench-necromancer-spells.mjs";
import { npcAttacks } from "./quench-necromancer-review.mjs";
import { sovereignSpellsBatch } from "./quench-sovereign-spells.mjs";
import { sovereignCoreBatch } from "./quench-sovereign-core.mjs";
import { sovereignDominionBatch, sovereignFeaturesBatch, sovereignRavenousBatch, sovereignVaingloriousBatch } from "./quench-sovereign-features.mjs";
import { SOV_FEATURE_ITEMS, SOV_SPELL2_ITEMS, SOV_SPELL_ITEMS } from "./sovereign-animation-items.mjs";
import { sovereignSpells2Batch } from "./quench-sovereign-spells2.mjs";
import { BOND_FLAG, COMMAND_FLAG } from "../rules/sovereign-spells.mjs";
import { FEED_DAYS_FLAG, feedDaysOf, withFeedDay } from "../rules/feeding.mjs";
import { RecordingPlayer } from "./animation-recorder.mjs";
import { animationAvailability } from "../animation/availability.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = () => game.system.azeroth.animations;
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const sov = () => game.system.azeroth.sovereign;
const feats = () => game.system.azeroth.sovereignFeatures;

/* ------------------------------------------------------------------ */
/*  The listener                                                       */
/* ------------------------------------------------------------------ */

/** Who a token is, as a judge reads it. */
function roleOf(doc) {
  const actor = doc?.actor ?? null;
  if (!actor) return "gone";
  if (actor.items?.some(i => i.type === "class" && i.name === "Sovereign")) return "sovereign";
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

/** The listener's lifetime around a whole batch: the switches on, the recorder in, each scene settled. */
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
      return roles[source]?.role === "sovereign" ? null : `its source is ${roles[source]?.name ?? "nobody"} (${roles[source]?.role ?? "none"}), not the Sovereign`;
    case "target":
      return placedOn(cue).some(id => roles[id]?.role && roles[id].role !== "sovereign") ? null : "no effect step is placed on a creature other than the Sovereign";
    case "point":
      return cue.steps.some(s => s.kind === "effect" && s.at) ? null : "no effect step is placed at a point";
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
      // With an asset, the loop of one state: a layer only that state's loop carries (D-1390).
      const stood = runs.flatMap(r => r.loops).some(l => l.loop?.identifier === want.key
        && (!want.asset || (l.loop?.layers ?? []).some(x => x.asset === want.asset)));
      assert.isTrue(stood, `${item.name}: ${want.key}'s loop${want.asset ? ` (${want.asset})` : ""} never stood`);
      line.push(`${want.key}/loop stood${want.asset ? ` (${want.asset})` : ""}`);
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

/** A Sovereign at a level, these spells known (embedded past the learning door, as fixtures may), its Vitae full. */
async function sovereign(name, { level = 17, spells = [], abilities = { con: 16, cha: 16, dex: 14 } } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", spells, abilities });
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  await setPool(s, "vitae", vitaeOf(s).max);
  return s;
}

/** A Sovereign with these talents at these ranks (FEATURES' shape). */
async function sovereignWith(name, { level = 20, ranks = {} } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", abilities: { con: 16, cha: 16, dex: 14 } });
  await s._talentGrant;
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(s, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  return s;
}

/** A pool set by a GM's hand (the named `hand` door). */
async function setPool(actor, which, value) {
  const pool = which === "vitae" ? vitaeOf(actor) : tributeOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value }, {}, { vitaeGain: "hand", tributeGain: "hand" });
  await until(() => (which === "vitae" ? vitaeOf(actor) : tributeOf(actor)).value === Math.min(value, pool.max), `${which} set`);
}

/** The words dialog a cast asks (Royal Command, Royal Herald, Oath of Fealty), answered. */
const words = text => async () => {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.querySelector('input[name="words"]')), "the words dialog", 15000);
  app.element.querySelector('input[name="words"]').value = text;
  app.element.querySelector('button[data-action="ok"]').click();
};

/** A chooser answered by an option's name. */
const choose = name => async spell => pick(await chooser(spell, 15000), name);

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

/** The spells no spell batch test casts, each through the sheet's own Cast. */
function spellGaps(context) {
  const { describe, it, assert, before, after } = context;
  describe("ANI: the spells no spell batch test casts, through the sheet's own Cast", function () {
    let restoreText = null;
    before(async function () { restoreText = await quietScrollingText(); });
    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof JournalEntry && game.journal.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("ANI: Veil of Majesty and Read the Supplicant, worn at the Sovereign", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ ANI Veil", { spells: ["Veil of Majesty", "Read the Supplicant"] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      assert.ok(await castOk(s, "Veil of Majesty"));
      assert.ok(await castOk(s, "Read the Supplicant"));
    });

    it("ANI: Royal Approach toward the prey, the space picked on the board", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ ANI Approach", { spells: ["Royal Approach"] });
      const foe = await creature("Alliance Footman", "ANI Approach Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe).document, { way: "hunt" });
      assert.ok(await castOk(s, "Royal Approach", { steps: [board({ x: 1350, y: 1050 })] }));
    });

    it("ANI: Taste of Lineage on fresh blood, then Gaze from the Throne on the blood held", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Taste", { spells: ["Taste of Lineage", "Gaze from the Throne"] });
      const foe = await creature("Alliance Footman", "ANI Taste Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      // Its blood spilled through the one damage door, which writes when (`AzerothActor#applyDamage`'s `bledAt`).
      await foe.applyDamage(2, { by: s, attack: true, struck: true });
      await until(() => foe.getFlag(SCOPE, "bledAt") !== undefined, "the blood's time written");
      assert.ok(await castOk(s, "Taste of Lineage", { targets: [foe] }));
      await sleep(800);
      assert.ok(await castOk(s, "Gaze from the Throne", { steps: [choose(foe.name)] }));
    });

    it("ANI: Royal Seal on a letter the Sovereign owns", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ ANI Seal", { spells: ["Royal Seal"] });
      const letter = await JournalEntry.create({ name: "ZZ ANI Sealed Letter" });
      made.push(letter);
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      assert.ok(await castOk(s, "Royal Seal", { steps: [choose("ZZ ANI Sealed Letter")] }));
    });

    it("ANI: Twilight Bloodbolt, Shadow Lance and Sovereign's Kiss at the creature targeted", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Bolts", { spells: ["Twilight Bloodbolt", "Shadow Lance", "Sovereign's Kiss"] });
      const foe = await creature("Alliance Footman", "ANI Bolt Footman", { hp: 120 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      assert.ok(await castOk(s, "Twilight Bloodbolt", { targets: [foe] }));
      assert.ok(await castOk(s, "Shadow Lance", { targets: [foe] }));
      assert.ok(await castOk(s, "Sovereign's Kiss", { targets: [foe] }));
    });

    it("ANI: Overawe, Edict of Denial, Edict of Stillness, Grant an Audience and Shackles of the Court, each failed", async function () {
      this.timeout(300000);
      const s = await sovereign("ZZ ANI Edicts", { spells: ["Overawe", "Edict of Denial", "Edict of Stillness", "Grant an Audience", "Shackles of the Court"] });
      const foe = await creature("Alliance Footman", "ANI Edict Footman", { hp: 120 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      for (const name of ["Overawe", "Edict of Denial", "Edict of Stillness", "Grant an Audience", "Shackles of the Court"]) {
        const card = await castOk(s, name, { targets: [foe] });
        await resist(card, 0, 1);
        await sleep(600);
      }
    });

    it("ANI: Bloodbolt Ascension among two enemies within 20 feet", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ ANI Ascension", { spells: ["Bloodbolt Ascension"] });
      const one = await creature("Alliance Footman", "ANI Ascend One", { hp: 60 });
      const two = await creature("Alliance Footman", "ANI Ascend Two", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: one, x: 1100, y: 1000, side: "hostile" }, { actor: two, x: 1000, y: 1200, side: "hostile" }]);
      assert.ok(await castOk(s, "Bloodbolt Ascension"));
      await until(() => s.effects.some(e => e.flags?.[SCOPE]?.sovereignOwn === "bloodbolt-ascension"), "the flight laid on the Sovereign");
    });

    it("ANI: Eyes of the Swarm rises beside the Sovereign", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ ANI Eyes", { spells: ["Eyes of the Swarm"] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      assert.ok(await castOk(s, "Eyes of the Swarm"));
    });

    it("ANI: Oath of Fealty between the Sovereign and a willing ally, and Royal Herald to a creature named", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Oath", { spells: ["Oath of Fealty", "Royal Herald"] });
      const ally = await makeCharacter({ name: "ZZ ANI Oath Ally", classes: [["Warrior", 3]], race: "Human" });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      assert.ok(await castOk(s, "Oath of Fealty", { targets: [s, ally], steps: [words("I swear fealty to the throne")] }));
      assert.ok(await castOk(s, "Royal Herald", { steps: [choose(ally.name), words("The Sovereign summons you")] }));
    });

    it("ANI: Edict of the Crown placed on the board", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Crown", { spells: ["Edict of the Crown"] });
      const foe = await creature("Alliance Footman", "ANI Crown Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Edict of the Crown");
      assert.ok(await placeAim(card, [{ x: 1650, y: 1050 }]), "the Region laid");
    });

    it("ANI: Crimson Cascade's line, aimed on the board", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Cascade", { spells: ["Crimson Cascade"] });
      const foe = await creature("Alliance Footman", "ANI Cascade Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Crimson Cascade");
      assert.ok(await placeAim(card, [{ x: 1050, y: 1050 }, { x: 1650, y: 1050 }]), "the line laid");
    });

    it("ANI: Mirror of Self answers a blow that hits the Sovereign", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ ANI Mirror", { spells: ["Mirror of Self"] });
      const foe = await creature("Alliance Footman", "ANI Mirror Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === s.id && m.flags?.[SCOPE]?.identifier === "mirror-of-self").then(([m]) => { made.push(m); return m; });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try {
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.options?.window?.title === "Mirror of Self" && a.element?.querySelector('button[data-action="yes"]')) ?? null, "Mirror of Self's question", 15000);
        // The Reaction casts Mirror of Self through `castSpell`: its Casting Test is pinned to succeed.
        const unpin = pinDie(20);
        try {
          ask.element.querySelector('button[data-action="yes"]').click();
          assert.ok(await posted, "Mirror of Self's card posted");
        } finally { unpin(); }
      } finally {
        await p.release();
      }
    });
  });
}

/**
 * **THE SECOND EIGHTEEN'S GAPS** (D-1390): what `azeroth-rpg.sovereign-spells2` leaves unpressed - the three areas a
 * player places from the card, and the two charms its tests end at once (Mesmerize's by harm, Blood Bond's by the
 * caster's press) - each through the real control, the charms left standing until their loops have stood.
 */
function spell2Gaps(context) {
  const { describe, it, assert, before, after } = context;
  const loopStood = (key, asset) => SPY.loops.some(l => l.loop?.identifier === key && (l.loop?.layers ?? []).some(x => x.asset === asset));
  describe("ANI2: the second eighteen's areas and charms, through the real controls", function () {
    let restoreText = null;
    before(async function () { restoreText = await quietScrollingText(); });
    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("ANI2: Incite Terror, Blood Wound and Cauldron of Blood placed on the board from their cards", async function () {
      this.timeout(300000);
      const s = await sovereign("ZZ ANI2 Areas", { spells: ["Incite Terror", "Blood Wound", "Cauldron of Blood"] });
      const foe = await creature("Alliance Footman", "ANI2 Area Footman", { hp: 120 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      for (const name of ["Incite Terror", "Blood Wound", "Cauldron of Blood"]) {
        await setPool(s, "vitae", vitaeOf(s).max);
        const card = await castOk(s, name);
        assert.ok(await placeAim(card, [{ x: 1650, y: 1050 }]), `${name}: the Region laid`);
        await sleep(800);
      }
    });

    it("ANI2: Mesmerize and Blood Bond stand their charms on the creature until the loops have stood", async function () {
      this.timeout(240000);
      const s = await sovereign("ZZ ANI2 Charms", { spells: ["Mesmerize", "Blood Bond"] });
      const foe = await creature("Alliance Footman", "ANI2 Mesmer Footman", { hp: 60 });
      const thrall = await creature("Alliance Footman", "ANI2 Bond Thrall", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: thrall, x: 1000, y: 1100, side: "hostile" }]);
      const card = await castOk(s, "Mesmerize", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[COMMAND_FLAG]?.kind === "charm"), "Mesmerize's Charmed laid");
      await until(() => loopStood("sovereigns-blood-magic", "jb2a.sleep.symbol.dark_pink"), "the charm's loop stood", 15000);
      // Blood Bond asks three feeding days and a willing or Charmed creature (07 §17): written as the feeding door writes them.
      await thrall.toggleStatusEffect("charmed", { active: true });
      let rec = {};
      for (const day of [0, 1, 2]) rec = withFeedDay(rec, thrall.uuid, (game.time.worldTime ?? 0) - day * 86400);
      await s.update({ [`flags.${SCOPE}.${FEED_DAYS_FLAG}`]: foundry.data.operators.ForcedReplacement.create(rec) });
      await until(() => feedDaysOf(s.getFlag(SCOPE, FEED_DAYS_FLAG) ?? {}, thrall.uuid) === 3, "three feeding days on record");
      await setPool(s, "vitae", vitaeOf(s).max);
      assert.ok(await castOk(s, "Blood Bond", { targets: [thrall] }));
      await until(() => thrall.effects.find(e => e.flags?.[SCOPE]?.[BOND_FLAG]?.by === s.uuid), "the bond laid");
      await until(() => loopStood("sovereigns-blood-magic", "jb2a.markers.heart.pink.01"), "the bond's loop stood", 15000);
    });
  });
}

/** The feature and talent controls no feature batch test lands, each pressed on the sheet or the card. */
function featureGaps(context) {
  const { describe, it, assert, before, after } = context;
  describe("ANI: the features and talents no feature batch test lands", function () {
    let restoreText = null;
    before(async function () { restoreText = await quietScrollingText(); });
    after(async function () {
      this.timeout(120000);
      await feats()?.setSovereignPick?.(null);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    it("ANI: Abject Obedience lands on a cursed prey that fails, and the control stands", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ ANI Obey", { ranks: { "Kneel": 1, "Abject Obedience": 1 } });
      const foe = await creature("Bandit", "ANI Obey Bandit", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe).document, { way: "hunt" });
      await feats().layBloodCurse(s, foe, { name: "Overawe" });
      await setPool(s, "vitae", 40);
      const card = await (await pressUse(s, "Abject Obedience", [tokenOf(foe)])).card;
      assert.ok(card, "the Use posted its card");
      await resist(card, 0, 1);
      await until(() => foe.effects.some(e => e.flags?.[SCOPE]?.obedience), "the control laid");
    });

    it("ANI: Mirrored Self turns aside a blow that hits the Sovereign, pressed on the attack card, and the Sovereign steps away", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ ANI Mirrored", { ranks: { "Mirrored Self": 1 } });
      const foe = await creature("Alliance Footman", "ANI Mirrored Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "tribute", 3);
      const mirrored = await until(() => s.items.find(i => i.type === "feature" && i.name === "Mirrored Self"), "Mirrored Self granted");
      feats().setSovereignPick(() => ({ to: { x: 1000, y: 1300 } }));
      try {
        const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
        const used = untilHook("createChatMessage", 30000, m => m.speaker?.actor === s.id && m.flags?.[SCOPE]?.kind === "feature" && m.flags[SCOPE].featureKey === "mirrored-self")
          .then(([m]) => { made.push(m); return m; });
        const p = await pressCard(attack, `button[data-action="reactNegate"][data-target-index="0"][data-feature-id="${mirrored.id}"]`);
        try { assert.ok(await used, "Mirrored Self's card posted"); } finally { await p.release(); }
        await until(() => tokenOf(s).document.y === 1300, "the Sovereign stepped away");
      } finally {
        feats().setSovereignPick(null);
      }
    });

    it("ANI: the Blood vial drunk from the Combat tab, on the board", async function () {
      this.timeout(150000);
      const s = await sovereignWith("ZZ ANI Vial", { level: 5 });
      await give(s, "Blood vial");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "vitae", 0);
      const sheet = await openSheet(s);
      sheet.changeTab("combat", "primary");
      await settle();
      const button = sheet.element.querySelector('section[data-tab="combat"] [data-action="drinkVial"]');
      assert.ok(button, "the Combat tab draws the vial");
      button.click();
      await until(() => vitaeOf(s).value > 0, "the vial's Vitae");
      await sheet.close();
    });

    it("ANI: Too Beautiful to Die holds a blow at 1, on the board", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ ANI Beautiful", { ranks: { "Too Beautiful to Die": 1 } });
      const foe = await creature("Alliance Footman", "ANI Beautiful Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "tribute", 4);
      await s.update({ "system.health.value": 2, "system.health.temp": 0 });
      const held = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "sovereign" && m.flags[SCOPE].tooBeautiful === true).then(([m]) => { made.push(m); return m; });
      const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try { assert.ok(await held, "the hold's card posted"); } finally { await p.release(); }
      await until(() => s.system.health.value === 1, "held at 1 Health");
    });

    it("ANI: the latch's drain at the start of the Sovereign's turn", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ ANI Drain", { ranks: { "Tasting Bite": 1, "Latch On": 1 } });
      const foe = await creature("Bandit", "ANI Drain Bandit", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([s, foe]);
      await sov().markPrey(s, tokenOf(foe).document, { way: "claws" });
      const laid = await feats().layLatch(s, foe, { tick: { rank: 1 } });
      assert.isTrue(laid?.ok, `the latch laid (${laid?.reason ?? ""})`);
      const drained = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.kind === "sovereign" && m.flags[SCOPE].latchTick === true).then(([m]) => { made.push(m); return m; });
      // Forward to a turn that is not the Sovereign's, then to the Sovereign's start.
      const mine = combat.getCombatantsByActor(s)[0];
      for (let i = 0; i < 4 && combat.combatant?.id === mine.id; i++) {
        const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.nextTurn();
        await settled;
      }
      for (let i = 0; i < 4 && combat.combatant?.id !== mine.id; i++) {
        const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.nextTurn();
        await settled;
      }
      assert.ok(await drained, "the drain's card posted at the Sovereign's turn start");
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
    describe(`The Sovereign's animations and sounds, read back live (${name})`, function () {
      listening(context);
      for (const [batch, fn] of runs) fn(recording(context, batch));
      verdicts(context, items);
    });
  };
}

export const sovereignAnimationsBatch = animationBatch("the spells", [
  ["sovereign-spells", sovereignSpellsBatch],
  ["ani-spell-gaps", spellGaps]
], SOV_SPELL_ITEMS);

export const sovereignAnimationsFeaturesBatch = animationBatch("the pools, the features and the talents", [
  ["sovereign-core", sovereignCoreBatch],
  ["sovereign-features", sovereignFeaturesBatch],
  ["sovereign-dominion", sovereignDominionBatch],
  ["sovereign-vainglorious", sovereignVaingloriousBatch],
  ["sovereign-ravenous", sovereignRavenousBatch],
  ["ani-feature-gaps", featureGaps]
], SOV_FEATURE_ITEMS);

/** The second eighteen (07 §17; D-1390): their own batch, so a run of the first two is not lengthened. */
export const sovereignAnimations2Batch = animationBatch("the second eighteen", [
  ["sovereign-spells2", sovereignSpells2Batch],
  ["ani-spell2-gaps", spell2Gaps]
], SOV_SPELL2_ITEMS);

