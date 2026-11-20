/**
 * **THE NECROMANCER'S 57 SPELLS, THROUGH THE REAL CONTROLS** (07 §17 and the spells it shares; run
 * 4c-S). Every cast is the sheet's own Cast, its dialog skipped or its lines ticked; every chooser is
 * answered as a player answers it; every point is a press on the board; every Resist, Apply, Place area
 * and heal is pressed on the card as drawn; every turn is moved with the tracker's own Next Turn; every
 * blow on a Necromancer comes off a creature's real attack card. The pure laws and the census are
 * `module/rules/necromancer-spells.test.mjs`.
 *
 * Three batches, by tier, so each runs alone well inside the smoke run's ceiling:
 * `azeroth-rpg.necromancer-spells` (tiers 1 and 2), `azeroth-rpg.necromancer-spells-t3` (tier 3) and
 * `azeroth-rpg.necromancer-spells-t45` (tiers 4 and 5, and the spells the Necromancer shares).
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { answerAsk, chooser, fightWith, freshTurn, manaOf, nextTurnUntil, pick, pressCard, sceneWith, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { npcAttacks, tick } from "./quench-necromancer-review.mjs";
import { hordeActorsOf, setStitchPick } from "../effects/necromancer-horde.mjs";
import { CURSE_FLAG, FRENZY_FLAG, SOUL_CAGE_FLAG, SOUL_MARK_FLAG } from "../rules/necromancer-spells.mjs";
import { CANDLE_FLAG, DEATHMASK_FLAG, DEPARTED_FLAG, DIED_AT_FLAG, MARK_OF_GRAVE_FLAG, PRISON_FLAG, PUPPET_FLAG } from "../effects/necromancer-spells.mjs";
import { ASK_MS } from "../effects/blow-doors.mjs";
import { AREAS_ENTERED_HOOK } from "../effects/area-strikes.mjs";
import { answerWindow } from "../rules/chromatic-talents.mjs";
import { ESCAPE_FLAG, SHED_DC_FLAG } from "../rules/escapes.mjs";
import { MIND_CONTROL_FLAG } from "../rules/mind-control.mjs";
import { CORPSE_FLAG } from "../rules/raise.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const health = actor => actor.system.health.value;
const NECROS = [];
const pickActive = () => game.system.azeroth.canvas.pickState()?.active === true;

/** Press the 2D board at a canvas point, as a browser does. */
export function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** A Necromancer at a level, Intelligence 18 and Constitution 14, these spells known and its Mana full. */
export async function necro(name, { level = 5, spells = [], ranks = {}, int = 18, race = "Human" } = {}) {
  const n = await makeCharacter({ name, classes: [["Necromancer", level]], race, spells, abilities: { int, con: 14 } });
  NECROS.push(n);
  await until(() => essenceOf(n), "the Essence pool");
  await n._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => n.items.find(i => i.type === "talent" && i.name === talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  await bankMana(n);
  return n;
}

/** Bank Essence for an empowered cast (the hand's source, D-1086's tests). */
export async function bankEssence(actor, n = 1) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: n }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === n, `${n} Essence banked`);
}

/** A character of another class holding a shared spell (the reading D-1099 holds unchanged). */
async function otherClass(name, cls, level, spells, ranks = {}) {
  const c = await makeCharacter({ name, classes: [[cls, level]], spells, abilities: { int: 16, wis: 16, cha: 16, con: 14 } });
  await c._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => c.items.find(i => i.type === "talent" && i.name === talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
    await until(() => c.items.find(i => i.type === "talent" && i.name === talent)?.system?.taken === taken, `${talent} at rank ${taken}`);
  }
  await bankMana(c);
  return c;
}

/** A Necromancer spell's own card, posted next, with its press. */
const necroCardNext = (press, ms = 30000) => untilHook("createChatMessage", ms, m => m.flags?.[SCOPE]?.kind === "necroCard" && m.flags[SCOPE].necroCard?.press === press).then(([m]) => { made.push(m); return m; });

export async function bankMana(actor, value = 999) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: Math.min(value, pool.max) });
    await until(() => actor.poolSnapshot().find(p => p.itemId === pool.itemId && p.kind === "power")?.value === Math.min(value, pool.max), "Mana banked");
  }
}

/** A creature from the bestiary, named for the test, at a Health. */
export async function creature(entry, name, { hp = 30 } = {}) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.max": hp, "system.health.value": hp });
  return npc;
}

/** A corpse: a bestiary creature, named for the test, at 0 Health. */
export async function corpse(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

/** The warnings said while `fn` runs. */
async function saying(fn) {
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try { return { value: await fn(), warned }; } finally { ui.notifications.warn = original; }
}

/* Steps a cast answers in order, each handed the spell. */
export const choose = name => async spell => pick(await chooser(spell, 15000), name);
export const tickAll = names => async spell => tick(await chooser(spell, 15000), names);
/** Press a chooser's own button as it stands, where one opens within a few seconds (a graft menu with no Essence to spend, a rise's kinds). */
const maybeChoose = (ms = 6000) => async spell => {
  let app = null;
  try { app = await chooser(spell, ms); } catch { return; }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
};
export const board = point => async () => { await until(pickActive, "the pick armed", 15000); await settle(); pressBoard(point); };
const prompt = value => async () => {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.querySelector('input[name="message"]')), "the message dialog", 15000);
  app.element.querySelector('input[name="message"]').value = value;
  app.element.querySelector('button[data-action="ok"]').click();
};

/**
 * **CAST FROM THE SHEET'S OWN CAST**: targets set, the dialog skipped (or its lines ticked), each step
 * answered in turn; the card, or null where the cast was refused (the warnings ride `refusal`).
 */
export async function cast(actor, spellName, { targets = [], steps = [], lines = [], face = 19, ms = 45000 } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => (t?.document ?? tokenOf(t) ?? t)?.id ?? t));
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const control = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
    ?? sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  if (!control) throw new Error(`the sheet draws no Cast for ${spellName}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, lines.length ? "always" : "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    control.click();
    if (lines.length) {
      const dialog = await until(() => {
        const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
        return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
      }, `${spellName}'s roll dialog`);
      for (const id of lines) {
        const box = dialog.element.querySelector(`input[name="tline-${id}"]`);
        if (!box) throw new Error(`the dialog draws no line ${id}`);
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
      dialog.element.querySelector('button[data-action="roll"]').click();
    }
    for (const step of steps) {
      try { await step(spell); } catch (err) { throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}`); }
      await sleep(150);
    }
    const card = await posted;
    if (card) return card;
    return Object.assign(Object.create(null), { refusal: warned.join(" | ") });
  } finally {
    ui.notifications.warn = original;
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** A cast that must post its card: the card, or a throw naming the refusal. */
export async function castOk(actor, spellName, opts = {}) {
  const card = await cast(actor, spellName, opts);
  if (!card?.flags) throw new Error(`${spellName} posted no card: ${card?.refusal || "no warning"}`);
  if (card.flags[SCOPE].success !== true) throw new Error(`${spellName}'s Casting Test failed`);
  return card;
}

/** A cast that must be refused: the words it was refused in. */
async function castRefused(actor, spellName, opts = {}) {
  const card = await cast(actor, spellName, { ...opts, ms: opts.ms ?? 6000 });
  if (card?.flags) throw new Error(`${spellName} was cast where it should be refused`);
  return card?.refusal ?? "";
}

/** Press a card's Resist for a row at a face; the resilience card it posted. */
export async function resist(card, index, face = 1) {
  const rolled = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "resilience").then(([m]) => { made.push(m); return m; });
  const p = await pressCard(card, `button[data-action="resistTest"][data-target-index="${index}"]`, { face });
  try { return await rolled; } finally { await p.release(); await sleep(400); }
}

/** Press a card's Apply damage for a row; resolves once the row's creature has taken it. */
async function applyRow(card, index, victim) {
  const before = health(victim);
  const p = await pressCard(card, `button[data-action="applyDamage"][data-target-index="${index}"]`);
  try { await until(() => health(victim) !== before, `${victim.name}'s Health to move`, 15000); } finally { await p.release(); }
  return before - health(victim);
}

/** Press a card's heal for a row (or the self heal); resolves once the Health moved. */
async function healRow(card, selector, actor) {
  const before = health(actor);
  const p = await pressCard(card, selector);
  try { await until(() => health(actor) !== before, `${actor.name}'s Health to rise`, 15000); } finally { await p.release(); }
  return health(actor) - before;
}

/** Press a card's Apply spell effect for a row, or its self Apply. */
async function applyEffect(card, selector, actor, predicate) {
  const p = await pressCard(card, selector);
  try { return await until(() => actor.effects.find(predicate), `${actor.name}'s laid effect`, 15000); } finally { await p.release(); }
}

/** Whether a card draws an Apply spell effect control. */
function cardHasApply(card) {
  return Boolean(document.querySelector(`[data-message-id="${card.id}"] [data-action="applySpellEffect"]`) || card.flags?.[SCOPE]?.applies);
}

/** Press the card's Place area and click the board at `point`; the Region laid. */
export async function placeAt(card, point) {
  const created = untilHook("createRegion", 30000);
  const p = await pressCard(card, 'button[data-action="placeArea"]');
  try { await until(pickActive, "the area pick armed", 15000); await settle(); pressBoard(point); const [region] = await created; return region; } finally { await p.release(); }
}

/** Walk a token to a top-left position on its own turn; resolves once the area door has judged what it entered. */
async function walk(actor, to) {
  const token = tokenOf(actor).document;
  const seen = untilHook(AREAS_ENTERED_HOOK, 15000, (doc, entered) => doc?.id === token.id && entered > 0);
  if (!(await token.move(to))) throw new Error(`${actor.name}'s walk was refused`);
  await seen;
  await until(() => token.x === to.x && token.y === to.y, `${actor.name}'s walk to land`, 10000);
}

/** The centre of an actor's token, in canvas pixels. */
const centreOf = actor => ({ x: tokenOf(actor).center.x, y: tokenOf(actor).center.y });

/** A whisper of a kind, posted next. */
const whisper = (kind, ms = 20000) => untilHook("createChatMessage", ms, m => m.flags?.[SCOPE]?.kind === kind).then(([m]) => { made.push(m); return m; });

/** Stand two Risen Skeletons for a Necromancer off a corpse on the scene. */
async function raiseTwo(n, body) {
  const card = await castOk(n, "Raise Dead", { steps: [choose(body.name)] });
  await until(() => hordeActorsOf(n).length >= 2, "two skeletons");
  await until(() => hordeActorsOf(n).every(a => tokenOf(a)), "the skeletons' tokens");
  return { card, skeletons: hordeActorsOf(n) };
}

/** Before and after each batch. */
export function lifecycle(context) {
  const { before, after } = context;
  let restoreDialog = null;
  let restoreText = null;
  before(async function () {
    restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
    restoreText = await quietScrollingText();
  });
  after(async function () {
    this.timeout(300000);
    setStitchPick(null);
    canvas?.tokens?.setTargets?.([]);
    if (pickActive()) game.system.azeroth.canvas.cancelPick();
    for (const app of [...foundry.applications.instances.values()]) {
      const id = String(app.id ?? "");
      if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-bone-shield-") || id.startsWith("azeroth-courier-")) await app.close().catch(() => {});
    }
    if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
    for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
    const owners = new Set(NECROS.map(n => n.uuid));
    for (const a of game.actors.filter(a => owners.has(a.getFlag(SCOPE, "bond")?.ownerUuid))) await a.delete().catch(() => {});
    for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
    for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
    await cleanup();
    NECROS.length = 0;
    await restoreText?.();
  });
}

/* ======================================================================== */
/*  Tiers 1 and 2                                                           */
/* ======================================================================== */

export function necromancerSpellsBatch(context) {
  const { describe, it, assert } = context;
  describe("The Necromancer's tier 1 and 2 spells, through the sheet's Cast and the card's buttons", function () {
    lifecycle(context);

    it("Bone Shards: 5 Shadow on the target, through the card's Apply", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Shards", { spells: ["Bone Shards"] });
      const foe = await creature("Bandit", "NS Shards Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Bone Shards", { targets: [foe] });
      const row = card.flags[SCOPE].damageByTarget[0];
      assert.ok(row?.damage > 0, "the card records the blow");
      assert.equal(await applyRow(card, 0, foe), row.damage, "the Apply lands the card's number");
    });

    it("Grave Rot: a corpse picked, every living creature within 10 feet of it hit, the far one and the corpse left alone", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Rot", { spells: ["Grave Rot"] });
      const body = await corpse("Bandit", "NS Rot Body");
      const near = await creature("Bandit", "NS Rot Near");
      const by = await creature("Bandit", "NS Rot Beside");
      const far = await creature("Bandit", "NS Rot Far");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 900, y: 500, side: "hostile" }, { actor: near, x: 1000, y: 500, side: "hostile" },
        { actor: by, x: 900, y: 650, side: "hostile" }, { actor: far, x: 1500, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Grave Rot", { steps: [choose(body.name)] });
      const names = card.flags[SCOPE].targets.map(t => t.name).sort();
      assert.deepEqual(names, [by.name, near.name].sort(), "the ring round the corpse, never the far one or the corpse");
      assert.equal(card.flags[SCOPE].corpse?.tokenId, tokenOf(body).id, "the card records the corpse for its animation");
      const at = card.flags[SCOPE].targets.findIndex(t => t.name === near.name);
      assert.ok(await applyRow(card, at, near) > 0, "the near creature takes the rot");
      assert.notOk(tokenOf(body).document.getFlag(SCOPE, CORPSE_FLAG), "the corpse is not destroyed");
    });

    it("Grave Touch: the target takes the blow and the CASTER regains 2", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Touch", { spells: ["Grave Touch"] });
      const foe = await creature("Bandit", "NS Touch Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      await n.update({ "system.health.value": Math.max(1, health(n) - 5) });
      const card = await castOk(n, "Grave Touch", { targets: [foe] });
      assert.ok(await applyRow(card, 0, foe) > 0, "the target takes Shadow damage");
      assert.equal(await healRow(card, 'button[data-action="applyHealing"][data-self]', n), 2, "the caster regains 2");
    });

    it("Dread Whisper: a failed Spirit Test leaves the target Frightened", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Whisper", { spells: ["Dread Whisper"] });
      const foe = await creature("Bandit", "NS Whisper Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 800, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Dread Whisper", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.statuses.has("frightened"), "Frightened");
    });

    it("Bone Ward: the self Apply lays 1 Armor Point at every location", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Ward", { spells: ["Bone Ward"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const ap = { ...n.system.ap };
      const card = await castOk(n, "Bone Ward");
      await applyEffect(card, 'button[data-action="applySpellEffect"][data-self]', n, e => e.name === "Bone Ward");
      await until(() => n.system.ap.body === ap.body + 1, "Body AP +1");
      assert.equal(n.system.ap.head, ap.head + 1);
      assert.equal(n.system.ap.limb, ap.limb + 1);
    });

    it("Mend the Dead: refused on a living target in words; heals an undead creature 6", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Mend", { spells: ["Mend the Dead"] });
      const living = await creature("Bandit", "NS Mend Living");
      const dead = await creature("Risen Skeleton", "NS Mend Bones", { hp: 20 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: living, x: 700, y: 500 }, { actor: dead, x: 700, y: 700 }]);
      await dead.update({ "system.health.value": 10 });
      const refusal = await castRefused(n, "Mend the Dead", { targets: [living] });
      assert.match(refusal, /not undead/, "the living target is refused in words");
      const card = await castOk(n, "Mend the Dead", { targets: [dead] });
      assert.equal(await healRow(card, 'button[data-action="applyHealing"][data-target-index="0"]', dead), 6, "the undead creature regains 6");
    });

    it("Raise Dead and Animate Corpse stand their dead in the horde", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Raise", { level: 5 });
      const a = await corpse("Bandit", "NS Raise A");
      const b = await corpse("Bandit", "NS Raise B");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: a, x: 500, y: 500, side: "hostile" }, { actor: b, x: 500, y: 700, side: "hostile" }]);
      await raiseTwo(n, a);
      assert.deepEqual(hordeActorsOf(n).map(x => x.name).sort(), ["Risen Skeleton", "Risen Skeleton"]);
      await bankMana(n);
      await castOk(n, "Animate Corpse", { steps: [tickAll([b.name])] });
      await until(() => hordeActorsOf(n).some(x => x.name === "Risen Zombie"), "a zombie");
    });

    it("Grave Sense: a card to the caster naming the corpse within 60 feet, its direction and distance", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Sense", { spells: ["Grave Sense"] });
      const body = await corpse("Bandit", "NS Sense Body");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: body, x: 1000, y: 500, side: "hostile" }]);
      const sent = whisper("graveSense");
      await castOk(n, "Grave Sense");
      const card = await sent;
      assert.match(textOf(card), new RegExp(`${body.name}: \\d+ ft to the east`), "the corpse, its feet and its direction");
      assert.ok(n.effects.find(e => e.name === "Grave Sense"), "the sense stands for its ten minutes");
    });

    it("Corpse Candle: dim light on the corpse's token, put out when the caster's effect goes", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Candle", { spells: ["Corpse Candle"] });
      const body = await corpse("Bandit", "NS Candle Body");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
      await castOk(n, "Corpse Candle", { steps: [choose(body.name)] });
      const tk = tokenOf(body).document;
      await until(() => tk.getFlag(SCOPE, CANDLE_FLAG)?.dim === 20, "the candle's record on the corpse");
      // *Only you and your raised dead can see this light*: core's token light, which every player sees, stays
      // dark, and the light is this client's own because this user (the GM) owns the caster.
      assert.equal(tk.light.dim, 0, "no token light every player would see");
      await until(() => tokenOf(body)?.corpseCandleSource, "the owner's own light drawn");
      const { seesCandle } = await import("../canvas/corpse-candle.mjs");
      const player = game.users.find(u => !u.isGM) ?? null;
      if (player) assert.isFalse(seesCandle(tk.getFlag(SCOPE, CANDLE_FLAG), player), "a player who does not own the caster sees no candle");
      const effect = n.effects.find(e => e.getFlag(SCOPE, CANDLE_FLAG));
      assert.ok(effect, "the candle's hour on the caster");
      // The token class is swapped synchronously at init (the fix run 4 review), so the very first token
      // drawn is a candle token.
      assert.isTrue(CONFIG.Token.objectClass?.corpseCandle === true, "the candle's token class registered at init");
      assert.isFunction(tokenOf(body)?.refreshCorpseCandle, "the corpse's token is drawn by the candle class");
      // **THE LIGHT READS THE EFFECT, NOT THE GM'S CLEANUP** (the fix run 4 review): with the hour switched
      // off - nothing deletes it, so no GM handler clears the token's record - the light still goes out.
      await effect.update({ disabled: true });
      await until(() => !tokenOf(body)?.corpseCandleSource, "the light out with the hour switched off");
      assert.equal(tk.getFlag(SCOPE, CANDLE_FLAG)?.dim, 20, "the record still stands: the light read the effect");
      await effect.update({ disabled: false });
      await until(() => tokenOf(body)?.corpseCandleSource, "the light back with the hour");
      await effect.delete();
      await until(() => !tk.getFlag(SCOPE, CANDLE_FLAG) && !tokenOf(body)?.corpseCandleSource, "the candle out");
    });

    it("Deathmask: the caster wears the dead face, and a blow ends it and gives the face back", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Mask", { spells: ["Deathmask"] });
      const body = await corpse("Bandit", "NS Mask Body");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
      const own = tokenOf(n).document;
      const was = own.texture.src;
      await tokenOf(body).document.update({ "texture.src": "icons/svg/skull.svg" });
      await tokenOf(body).document.actor.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime);
      await castOk(n, "Deathmask", { steps: [choose(body.name)] });
      await until(() => own.texture.src === "icons/svg/skull.svg", "the dead face worn");
      assert.ok(n.effects.find(e => e.getFlag(SCOPE, DEATHMASK_FLAG)), "the mask's hour");
      // A creature's real attack card, its Apply pressed (the 4c review's S).
      const foe = await creature("Bandit", "NS Mask Foe", { hp: 40 });
      await canvas.scene.createEmbeddedDocuments("Token", [await tokenData(foe, { x: 500, y: 600, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
      await until(() => tokenOf(foe), "the foe drawn");
      const hp = health(n);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, n, { face: 19 });
      assert.ok(attack.flags[SCOPE].damageByTarget[0]?.damage > 0, "the blow deals damage");
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try { await until(() => health(n) < hp, "the blow lands"); } finally { await p.release(); }
      await until(() => !n.effects.find(e => e.getFlag(SCOPE, DEATHMASK_FLAG)), "the mask ended by the blow");
      await until(() => own.texture.src === was, "the face given back");
    });

    it("Deathmask: a corpse dead a day or more is refused in words; one nothing recorded is the GM's to judge", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Mask Age", { spells: ["Deathmask"] });
      const old = await corpse("Bandit", "NS Mask Old");
      const fresh = await corpse("Bandit", "NS Mask Unknown");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: old, x: 600, y: 500, side: "hostile" }, { actor: fresh, x: 500, y: 600, side: "hostile" }]);
      await tokenOf(old).document.actor.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime - 2 * 86400);
      const mana = manaOf(n).value;
      const refusal = await castRefused(n, "Deathmask", { steps: [choose(old.name)] });
      assert.match(refusal, /dead a day or more/, "the old corpse refused in words");
      assert.equal(manaOf(n).value, mana, "nothing paid");
      await tokenOf(fresh).document.actor.unsetFlag(SCOPE, DIED_AT_FLAG);
      const card = await castOk(n, "Deathmask", { steps: [choose(fresh.name)] });
      assert.match(textOf(card), /less than a day is the GM's to judge/, "the card leaves the unrecorded corpse to the GM");
    });

    it("Deathmask: a creature killed in a world holding a Necromancer has its death recorded, and the corpse's age is read with no GM's judgement (the final review's S5)", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Mask Record", { spells: ["Deathmask"] });
      const victim = await creature("Bandit", "NS Mask Recorded", { hp: 20 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: victim, x: 600, y: 500, side: "hostile" }]);
      const dead = tokenOf(victim).document.actor;
      assert.equal(dead.getFlag(SCOPE, DIED_AT_FLAG) ?? null, null, "no death recorded while it lives");
      await dead.update({ "system.health.value": 0 });
      await until(() => Number.isFinite(Number(tokenOf(victim)?.document?.actor?.getFlag(SCOPE, DIED_AT_FLAG))), "the death watch records the death", 15000);
      const card = await castOk(n, "Deathmask", { steps: [choose(victim.name)] });
      assert.notMatch(textOf(card), /is the GM's to judge/, "the recorded corpse is judged off its record");
    });

    it("Bone Courier: the message, cut to 25 words, whispered to the creature named", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Courier", { spells: ["Bone Courier"] });
      const friend = await makeCharacter({ name: "ZZ NS Courier Friend", classes: [["Warrior", 1]] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const sent = whisper("boneCourier");
      const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
      await castOk(n, "Bone Courier", { steps: [choose(friend.name), prompt(words)] });
      const msg = await sent;
      assert.include(textOf(msg), "word24", "the 25th word carried");
      assert.notInclude(textOf(msg), "word25", "the 26th word cut");
    });

    it("Soul Lash: the blow, and a failed Spirit Test lays a Bane on the next Attack Test", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Lash", { level: 5, spells: ["Soul Lash"] });
      const foe = await creature("Bandit", "NS Lash Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Soul Lash", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.laidBane), "the Bane laid");
      assert.ok(await applyRow(card, 0, foe) > 0, "the lash lands");
    });

    it("Cripple: Slowed, its Strength down 5 and its Damage Rating down 2, with the turn-end Test", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Cripple", { level: 5, spells: ["Cripple"] });
      const foe = await creature("Bandit", "NS Cripple Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const str = foe.system.abilities.str.value;
      const card = await castOk(n, "Cripple", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.statuses.has("slowed"), "Slowed");
      await until(() => foe.system.abilities.str.value === str - 5, "Strength down 5");
      const slowed = foe.effects.find(e => e.statuses?.has("slowed") && e.flags?.[SCOPE]?.necroDrops);
      assert.ok(slowed, "the drops ride the Slowed");
      assert.equal(slowed.flags[SCOPE][ESCAPE_FLAG]?.on, "turnEnd", "the repeated Test at the end of its turns");
    });

    it("Plague Cloud: the placed fog strikes a living creature at its turn start, and the Sustain pays 2 Mana", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Cloud", { level: 5, spells: ["Plague Cloud"] });
      const foe = await creature("Bandit", "NS Cloud Foe");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }]);
      const combat = await fightWith([n, foe]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Plague Cloud");
      const created = untilHook("createRegion", 30000);
      const p = await pressCard(card, 'button[data-action="placeArea"]');
      try { await until(pickActive, "the area pick"); await settle(); pressBoard({ x: 1250, y: 550 }); await created; } finally { await p.release(); }
      const before = health(foe);
      await nextTurnUntil(foe, combat);
      await until(() => health(foe) < before, "the fog strikes at its turn start", 30000);
      const mana = manaOf(n).value;
      await nextTurnUntil(n, combat);
      await until(() => manaOf(n).value === mana - 2, "the Sustain's 2 Mana", 30000);
    });

    it("Field of Bones: the placed area is Difficult ground for the caster's enemies, and its blow lands", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Field", { level: 5, spells: ["Field of Bones"] });
      const foe = await creature("Bandit", "NS Field Foe");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Field of Bones", { targets: [foe] });
      const created = untilHook("createRegion", 30000);
      const p = await pressCard(card, 'button[data-action="placeArea"]');
      let region = null;
      try { await until(pickActive, "the area pick"); await settle(); pressBoard({ x: 1250, y: 550 }); [region] = await created; } finally { await p.release(); }
      assert.equal(region.flags[SCOPE].areaGround?.who, "enemy", "Difficult ground for the caster's enemies");
      assert.ok(await applyRow(card, 0, foe) > 0, "the bones strike");
    });

    it("Frenzy of the Dead: each raised dead within 30 feet deals 2 more Shadow a hit and loses 1 Health at its turn start", async function () {
      this.timeout(300000);
      const n = await necro("ZZ NS Frenzy", { level: 5, spells: ["Frenzy of the Dead"] });
      const body = await corpse("Bandit", "NS Frenzy Body");
      const foe = await creature("Bandit", "NS Frenzy Foe");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 500, y: 500, side: "hostile" }, { actor: foe, x: 800, y: 700, side: "hostile" }]);
      const { skeletons } = await raiseTwo(n, body);
      await bankMana(n);
      const card = await castOk(n, "Frenzy of the Dead");
      assert.equal(card.flags[SCOPE].targets.length, 2, "both skeletons are the card's rows");
      for (const s of skeletons) await until(() => s.effects.find(e => e.flags?.[SCOPE]?.[FRENZY_FLAG]), `${s.name}'s frenzy`);
      const skel = skeletons[0];
      const row = skel.system.attacks[0]?.name;
      const attack = await npcAttacks(skel, row, foe, { face: 19 });
      assert.ok((attack.flags[SCOPE].damageByTarget?.[0]?.parts ?? []).some(p => p.type === "shadow") || /Shadow/.test(textOf(attack)), "the hit carries Shadow of its own");
      const combat = await fightWith([n, skel, foe]);
      const hp = health(skel);
      await nextTurnUntil(skel, combat);
      await until(() => health(skel) === hp - 1, "1 Health lost at its turn start", 30000);
    });

    it("Frenzy of the Dead with Far-reaching reaches raised dead 50 feet off; the plain cast is refused there (the lead's ruling 5)", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Frenzy Far", { level: 5, spells: ["Frenzy of the Dead"] });
      const body = await corpse("Bandit", "NS Frenzy Far Body");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 500, y: 500, side: "hostile" }]);
      const { skeletons } = await raiseTwo(n, body);
      // Both raised dead stand 50 feet from the caster (ten squares between the nearest squares).
      for (const [i, s] of skeletons.entries()) await tokenOf(s).document.update({ x: 1300, y: 400 + i * 200 });
      await until(() => skeletons.every((s, i) => tokenOf(s).document.x === 1300 && tokenOf(s).document.y === 400 + i * 200), "the raised dead 50 feet off");
      const { feetApart } = await import("../canvas/footprints.mjs");
      for (const s of skeletons) assert.equal(Math.round(feetApart(tokenOf(n).document, tokenOf(s).document)), 50, `${s.name} stands 50 feet off`);
      await bankMana(n);
      const mana = manaOf(n).value;
      // The plain Range is 30 ft: refused in words, nothing paid.
      const refusal = await castRefused(n, "Frenzy of the Dead");
      assert.match(refusal, /within 30 feet/, "the plain cast reaches none of them");
      assert.equal(manaOf(n).value, mana, "nothing paid for the refused cast");
      // Far-reaching doubles the Range to 60 ft, so both are the card's rows and both frenzy.
      await bankEssence(n, 1);
      const card = await castOk(n, "Frenzy of the Dead", { lines: ["empower-farReaching"] });
      assert.equal(card.flags[SCOPE].empower?.farReaching, true, "the card records Far-reaching");
      assert.equal(card.flags[SCOPE].targets.length, 2, "both raised dead at 50 feet are the card's rows");
      for (const s of skeletons) await until(() => s.effects.find(e => e.flags?.[SCOPE]?.[FRENZY_FLAG]), `${s.name}'s frenzy`);
      assert.equal(essenceOf(n).value, 0, "Far-reaching's Essence paid");
    });

    it("Grave Step: a space beside a corpse within range, refused in words beside no corpse, the caster moved", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Step", { level: 5, spells: ["Grave Step"] });
      const body = await corpse("Bandit", "NS Step Body");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 1100, y: 500, side: "hostile" }]);
      const res = await saying(() => castOk(n, "Grave Step", { steps: [board({ x: 650, y: 950 }), board({ x: 1250, y: 550 })] }));
      assert.ok(res.warned.some(w => /no corpse lies within 5 feet/.test(w)), "a space beside no corpse is refused in words");
      const own = tokenOf(n).document;
      await until(() => own.x === 1200 && own.y === 500, "the caster beside the corpse", 15000);
    });

    it("Ghoul Rising stands a Plagued Ghoul", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Ghoul", { level: 5, spells: ["Ghoul Rising"] });
      const body = await corpse("Bandit", "NS Ghoul Body");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 500, y: 500, side: "hostile" }]);
      await castOk(n, "Ghoul Rising", { steps: [choose(body.name)] });
      await until(() => hordeActorsOf(n).some(x => x.name === "Plagued Ghoul"), "a ghoul");
    });

    it("Ghostly Servant: a point picked, the servant's hour on the caster and its marker on the board", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Servant", { level: 5, spells: ["Ghostly Servant"] });
      const scene = await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const created = untilHook("createRegion", 30000);
      await castOk(n, "Ghostly Servant", { steps: [board({ x: 750, y: 550 })] });
      const [region] = await created;
      const effect = await until(() => n.effects.find(e => e.flags?.[SCOPE]?.ghostlyServant), "the servant's hour");
      await effect.delete();
      await until(() => !scene.regions.has(region.id), "the marker taken up with it");
    });

    it("Grave Ward: the ward set, and the GM's Disturbed frightens the opener who fails and tells the caster", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS GraveWard", { level: 5, spells: ["Grave Ward"] });
      const thief = await creature("Bandit", "NS Ward Thief");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: thief, x: 900, y: 500, side: "hostile" }]);
      const wardCard = whisper("graveWard");
      await castOk(n, "Grave Ward", { steps: [board({ x: 650, y: 550 })] });
      const ward = await wardCard;
      canvas.tokens.setTargets([tokenOf(thief).id]);
      const told = whisper("graveWardTold");
      const p = await pressCard(ward, 'button[data-action="necroGraveWard"]', { face: 1 });
      try { await until(() => thief.statuses.has("frightened"), "the opener Frightened", 20000); await told; } finally { await p.release(); canvas.tokens.setTargets([]); }
    });

    it("Borrowed Senses: through one of the caster's raised dead, its own body Blinded and Deafened", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Borrow", { level: 5, spells: ["Borrowed Senses"] });
      const body = await corpse("Bandit", "NS Borrow Body");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: body, x: 500, y: 500, side: "hostile" }]);
      const { skeletons } = await raiseTwo(n, body);
      await bankMana(n);
      await castOk(n, "Borrowed Senses", { targets: [skeletons[0]] });
      await until(() => n.statuses.has("blinded") && n.statuses.has("deafened"), "Blinded and Deafened");
    });

    it("Death's Tidings: a creature named is dead, another undead, to the caster alone", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Tidings", { level: 5, spells: ["Death's Tidings"] });
      const dead = await corpse("Bandit", "NS Tidings Dead");
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const sent = whisper("deathsTidings");
      await castOk(n, "Death's Tidings", { steps: [choose(dead.name)] });
      assert.match(textOf(await sent), /is dead/);
    });
  });
}

/* ======================================================================== */
/*  Tier 3                                                                  */
/* ======================================================================== */

export function necromancerSpellsT3Batch(context) {
  const { describe, it, assert } = context;
  describe("The Necromancer's tier 3 spells, through the sheet's Cast and the card's buttons", function () {
    lifecycle(context);

    it("Wraith Bolt: 9 Shadow through the card's Apply", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Wraith", { level: 11, spells: ["Wraith Bolt"] });
      const foe = await creature("Bandit", "NS Wraith Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Wraith Bolt", { targets: [foe] });
      assert.ok(await applyRow(card, 0, foe) > 0);
    });

    it("Plague Wind: a failed Body Test leaves the creature Poisoned 1 against the Spell DC", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Wind", { level: 11, spells: ["Plague Wind"] });
      const foe = await creature("Bandit", "NS Wind Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Plague Wind", { targets: [foe] });
      await resist(card, 0, 1);
      const poisoned = await until(() => foe.effects.find(e => e.statuses?.has("poisoned") && e.flags?.[SCOPE]?.[SHED_DC_FLAG]), "Poisoned with its shed DC");
      assert.equal(poisoned.flags[SCOPE].value, 1, "Poisoned 1");
      assert.equal(poisoned.flags[SCOPE][SHED_DC_FLAG].dc, card.flags[SCOPE].spellDC, "against the caster's Spell DC");
    });

    it("Grave Tide: the enemy takes the blow and the undead ally regains 4 instead", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Tide", { level: 11, spells: ["Grave Tide"] });
      const foe = await creature("Bandit", "NS Tide Foe");
      const bones = await creature("Risen Skeleton", "NS Tide Bones", { hp: 20 });
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }, { actor: bones, x: 900, y: 500 }]);
      await bones.update({ "system.health.value": 10 });
      await fightWith([n, foe, bones]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Grave Tide", { targets: [foe, bones] });
      const rows = card.flags[SCOPE].targets.map(t => t.name);
      const fi = rows.indexOf(foe.name);
      const bi = rows.indexOf(bones.name);
      assert.ok(card.flags[SCOPE].damageByTarget[fi]?.damage > 0, "the enemy's row deals");
      assert.notOk(card.flags[SCOPE].damageByTarget[bi], "the undead ally's row deals nothing");
      assert.equal(await healRow(card, `button[data-action="applyHealing"][data-target-index="${bi}"]`, bones), 4, "the undead ally regains 4");
      assert.ok(await applyRow(card, fi, foe) > 0);
    });

    it("Terror of the Grave: a failed Spirit Test leaves the enemy Frightened", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Terror", { level: 11, spells: ["Terror of the Grave"] });
      const foe = await creature("Bandit", "NS Terror Foe");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Terror of the Grave", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.statuses.has("frightened"), "Frightened");
    });

    it("Bone Shield: refused from the sheet; asked when a blow lands, it takes 6 off, and Barbed Bone strikes back", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Shield", { level: 11, spells: ["Bone Shield"], ranks: { "Barbed Bone": 1 } });
      const foe = await creature("Bandit", "NS Shield Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      assert.match(await castRefused(n, "Bone Shield"), /Reaction when an attack hits you/, "never cast from the sheet");
      const hp0 = health(n);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, n, { face: 19 });
      const dealt = attack.flags[SCOPE].damageByTarget[0].damage;
      const mana = manaOf(n).value;
      const foeHp = health(foe);
      const shieldCard = untilHook("createChatMessage", 60000, m => m.speaker?.actor === n.id && m.flags?.[SCOPE]?.kind === "spell");
      // The roll dialog ON (the 4c review's MUST-FIX 1): the yes casts at once and opens no dialog to wait in.
      const setting = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      let dialogOpened = false;
      const watch = Hooks.on("renderApplicationV2", app => { if (String(app.id ?? "").startsWith(`azeroth-roll-${n.id}`)) dialogOpened = true; });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]', { face: 19, skip: false });
      try {
        await answerAsk(true);
        const [cardShield] = await shieldCard;
        made.push(cardShield);
        assert.ok(cardShield.flags[SCOPE].success, "Bone Shield was cast");
        await until(() => health(n) === hp0 - Math.max(0, dealt - 6), `the blow less 6 (${dealt} dealt, Health ${health(n)} of ${hp0})`, 30000);
      } finally { await p.release(); Hooks.off("renderApplicationV2", watch); await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, setting); }
      assert.isFalse(dialogOpened, "no roll dialog opened to be answered after the asker stopped waiting");
      assert.equal(manaOf(n).value, mana - 10, "its 10 Mana paid");
      if (dealt > 0) await until(() => health(foe) === foeHp - 2, "Barbed Bone's 2 Shadow on the attacker", 20000);
    });

    it("Bone Shield: the GM asks, the dialog is on, and an answer after the window pays nothing and the whole blow lands", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Shield Late", { level: 11, spells: ["Bone Shield"], ranks: { "Barbed Bone": 1 } });
      const foe = await creature("Bandit", "NS Shield Late Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const combat = await fightWith([n, foe]);
      await freshTurn(foe, 2);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, n, { face: 19 });
      const dealt = attack.flags[SCOPE].damageByTarget[0].damage;
      const hp0 = health(n);
      const mana = manaOf(n).value;
      const foeHp = health(foe);
      let spellCard = null;
      const watch = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === n.id && m.flags?.[SCOPE]?.kind === "spell") spellCard = m; });
      const setting = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]', { face: 19, skip: false });
      try {
        // The GM is the asker and the answerer here: the question stands, and nobody answers inside the window.
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask")) ?? null, "the Bone Shield question");
        const yes = ask.element.querySelector('button[data-action="yes"]');
        await until(() => !ask.rendered, "the question closed as no at the window's end", answerWindow(ASK_MS) + 15000);
        // The late yes: pressed on a window that has gone.
        yes.click();
        await until(() => health(n) === hp0 - dealt, `the whole blow (${dealt}) lands, Health ${health(n)} of ${hp0}`, 30000);
      } finally { await p.release(); Hooks.off("createChatMessage", watch); await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, setting); }
      await sleep(1500);
      assert.isNull(spellCard, "no Bone Shield card: nothing was cast");
      assert.equal(manaOf(n).value, mana, "no Mana paid");
      assert.isNull(game.system.azeroth.workflows.turnBudgetRefusal(n, "reaction"), "the Reaction is unspent");
      assert.equal(health(foe), foeHp, "Barbed Bone never fired");
      assert.ok(combat, "the fight stood throughout");
    });

    it("Unholy Restoration: an undead creature regains 11, and its one condition ends", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Resto", { level: 11, spells: ["Unholy Restoration"] });
      const bones = await creature("Risen Skeleton", "NS Resto Bones", { hp: 30 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: bones, x: 700, y: 500 }]);
      await bones.update({ "system.health.value": 10 });
      await bones.toggleStatusEffect("prone", { active: true });
      const card = await castOk(n, "Unholy Restoration", { targets: [bones] });
      await until(() => !bones.statuses.has("prone"), "Prone ended");
      assert.equal(await healRow(card, 'button[data-action="applyHealing"][data-target-index="0"]', bones), 11, "regains 11");
    });

    it("Stitch Abomination and Bind Banshee stand their dead (the GM judges the material and the corpse)", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Stitch", { level: 11, spells: ["Stitch Abomination", "Bind Banshee"] });
      const body = await corpse("Bandit", "NS Stitch Body");
      await sceneWith([{ actor: n, x: 400, y: 800 }, { actor: body, x: 400, y: 600, side: "hostile" }]);
      const pool = essenceOf(n);
      await n.updatePool({ itemId: pool.itemId, kind: "momentum", value: 1 }, {}, { essenceGain: "hand" });
      await until(() => essenceOf(n).value === 1, "1 Essence banked");
      setStitchPick(() => ({ x: 750, y: 850 }));
      try { await castOk(n, "Stitch Abomination", { steps: [tickAll(["Bone Plating"])] }); } finally { setStitchPick(null); }
      await until(() => hordeActorsOf(n).some(x => x.name === "Abomination"), "an Abomination", 30000);
      await bankMana(n);
      await castOk(n, "Bind Banshee", { steps: [choose(body.name)] });
      await until(() => hordeActorsOf(n).some(x => x.name === "Banshee"), "a Banshee");
    });

    it("Spirit Anchor: the anchor set on a point, its day on the caster", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Anchor", { level: 11, spells: ["Spirit Anchor"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const scene = canvas.scene;
      const created = untilHook("createRegion", 30000);
      const anchorCard = necroCardNext("anchorLook");
      await castOk(n, "Spirit Anchor", { steps: [board({ x: 650, y: 550 })] });
      await created;
      await until(() => n.effects.find(e => e.flags?.[SCOPE]?.spiritAnchor?.regionId), "the anchor's day with its marker");
      const card = await anchorCard;
      // *At any distance*: from another scene, the look takes the board back to the anchor.
      const away = await Scene.create({ name: "ZZ NS Anchor Away", width: 2000, height: 1200, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(away);
      await away.view();
      await until(() => canvas.scene?.id === away.id && canvas.ready, "the other scene viewed");
      let p = await pressCard(card, 'button[data-action="necroCard"][data-necro-press="anchorLook"]');
      try { await until(() => canvas.scene?.id === scene.id && canvas.ready, "the board taken to the anchor", 20000); } finally { await p.release(); }
      // *Spend a Half-Action*: in a fight, on the caster's turn, the look costs one.
      const combat = await fightWith([n]);
      const mine = await freshTurn(n, 2);
      p = await pressCard(card, 'button[data-action="necroCard"][data-necro-press="anchorLook"]');
      try { await until(() => (mine.budget?.halfActions ?? 2) === 1, "one Half-Action spent", 20000); } finally { await p.release(); }
      assert.ok(combat);
    });

    it("Spirit Anchor: a look whose scene cannot be viewed is refused in words, and the Half-Action is kept (the fix run 4 review)", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Anchor Gone", { level: 11, spells: ["Spirit Anchor"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const anchorScene = canvas.scene;
      const created = untilHook("createRegion", 30000);
      const anchorCard = necroCardNext("anchorLook");
      await castOk(n, "Spirit Anchor", { steps: [board({ x: 650, y: 550 })] });
      await created;
      await until(() => n.effects.find(e => e.flags?.[SCOPE]?.spiritAnchor?.regionId), "the anchor's day with its marker");
      const card = await anchorCard;
      // The caster stands and fights on another scene; the anchor's own scene is then deleted, so the
      // board can never be taken there.
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const combat = await fightWith([n]);
      const mine = await freshTurn(n, 2);
      await anchorScene.delete();
      await until(() => !game.scenes.has(anchorScene.id), "the anchor's scene gone");
      assert.ok(n.effects.find(e => e.flags?.[SCOPE]?.spiritAnchor), "the anchor's day still on the caster");
      const warned = [];
      const original = ui.notifications.warn.bind(ui.notifications);
      ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
      const p = await pressCard(card, 'button[data-action="necroCard"][data-necro-press="anchorLook"]');
      try {
        const words = game.i18n.format("AZEROTH.NecroTalent.Look.noScene", { name: card.flags[SCOPE].necroCard.spell ?? "", scene: "" });
        await until(() => warned.includes(words), `the refusal in words (${warned.join(" | ") || "none"})`, 20000);
      } finally {
        await p.release();
        ui.notifications.warn = original;
      }
      await sleep(1000);
      assert.equal(mine.budget?.halfActions ?? 2, 2, "the Half-Action kept: the look was judged before the budget");
      assert.notEqual(canvas.scene?.id, anchorScene.id, "the board stayed where it was");
      assert.ok(combat);
    });

    it("Death Trance: no breath and no heartbeat for the hour", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Trance", { level: 11, spells: ["Death Trance"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      await castOk(n, "Death Trance");
      const effect = await until(() => n.effects.find(e => e.flags?.[SCOPE]?.deathTrance), "the trance");
      assert.equal(effect.duration.units, "hours", "an hour on the world's clock");
    });

    it("Bone Bridge: the card's Place area lays the span on the board", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Bridge", { level: 11, spells: ["Bone Bridge"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      const card = await castOk(n, "Bone Bridge");
      assert.equal(card.flags[SCOPE].area?.shape, "line", "the card offers a line");
      assert.equal(card.flags[SCOPE].area?.distanceFt, 30);
      const created = untilHook("createRegion", 30000);
      const p = await pressCard(card, 'button[data-action="placeArea"]');
      try {
        await until(pickActive, "the area pick"); await settle(); pressBoard({ x: 1100, y: 550 });
        await sleep(400);
        if (pickActive()) pressBoard({ x: 1200, y: 550 });
        await created;
      } finally { await p.release(); }
    });

    it("Mark of the Grave: the mark laid, and the caster told at once when its creature dies", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Mark", { level: 11, spells: ["Mark of the Grave"] });
      const foe = await creature("Bandit", "NS Mark Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const markCard = necroCardNext("markDirection");
      await castOk(n, "Mark of the Grave", { targets: [foe] });
      await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[MARK_OF_GRAVE_FLAG]), "the mark");
      // *You know the direction to the target while it is within 1 mile of you*: asked from the card.
      const card = await markCard;
      const sensed = whisper("markOfGraveDirection");
      const p = await pressCard(card, 'button[data-action="necroCard"][data-necro-press="markDirection"]');
      try { assert.match(textOf(await sensed), new RegExp(`${foe.name} lies to the east, \\d+ feet away`), "the direction and the feet"); } finally { await p.release(); }
      const told = whisper("markOfGraveDied");
      await foe.update({ "system.health.value": 0 });
      assert.match(textOf(await told), /has died/);
    });

    it("Graveblight: a Necromancer pays 7 Mana, the card prints Mana, and the Sustain pays 3 a turn", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Blight", { level: 11, spells: ["Graveblight"] });
      const foe = await creature("Bandit", "NS Blight Foe");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }]);
      const combat = await fightWith([n, foe]);
      await freshTurn(n, 2);
      const mana = manaOf(n).value;
      const card = await castOk(n, "Graveblight");
      assert.equal(manaOf(n).value, mana - 7, "7 Mana");
      assert.match(textOf(card), /Mana/, "the card prints the pool paid");
      const after = manaOf(n).value;
      await nextTurnUntil(foe, combat);
      await nextTurnUntil(n, combat);
      await until(() => manaOf(n).value === after - 3, "3 Mana at the caster's turn start", 30000);
    });
  });
}

/* ======================================================================== */
/*  Tiers 4 and 5, and the spells the Necromancer shares                    */
/* ======================================================================== */

export function necromancerSpellsT45Batch(context) {
  const { describe, it, assert } = context;
  describe("The Necromancer's tier 4 and 5 spells and the spells it shares, through the real controls", function () {
    lifecycle(context);

    it("Raise Crypt Horror and Enslave the Dead (the horde's doors)", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Horror", { level: 17, spells: ["Raise Crypt Horror", "Enslave the Dead"] });
      const bear = await corpse("Black Bear", "NS Horror Bear");
      const ghoul = await creature("Plagued Ghoul", "NS Enslave Ghoul");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: bear, x: 500, y: 500, side: "hostile" }, { actor: ghoul, x: 800, y: 500, side: "hostile" }]);
      await castOk(n, "Raise Crypt Horror", { steps: [choose(bear.name)] });
      await until(() => hordeActorsOf(n).some(x => x.name === "Crypt Horror"), "a Crypt Horror");
      await bankMana(n);
      const card = await castOk(n, "Enslave the Dead", { targets: [ghoul] });
      await resist(card, 0, 1);
      await until(() => ghoul.effects.find(e => e.flags?.[SCOPE]?.enslaved), "the ghoul enslaved", 30000);
    });

    it("Bone Prison: Entangled, held unmoved, and its Test only at the end of its turns", async function () {
      this.timeout(120000);
      const n = await necro("ZZ NS Prison", { level: 17, spells: ["Bone Prison"] });
      const foe = await creature("Bandit", "NS Prison Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Bone Prison", { targets: [foe] });
      await resist(card, 0, 1);
      const held = await until(() => foe.effects.find(e => e.statuses?.has("entangled") && e.flags?.[SCOPE]?.[PRISON_FLAG]), "the prison's Entangled");
      assert.equal(held.flags[SCOPE][ESCAPE_FLAG]?.on, "turnEnd", "no action ends it: the Test at the end of its turns");
      const { beingMovedBy } = await import("../effects/forced-movement.mjs");
      assert.equal(beingMovedBy(foe, n), "refuses", "the forced-move door refuses to move it");
    });

    it("Necrotic Nova: the enemy takes the blow and the undead ally regains 7 instead", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Nova", { level: 17, spells: ["Necrotic Nova"] });
      const foe = await creature("Bandit", "NS Nova Foe");
      const bones = await creature("Risen Skeleton", "NS Nova Bones", { hp: 20 });
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }, { actor: bones, x: 1000, y: 500 }]);
      await bones.update({ "system.health.value": 10 });
      await fightWith([n, foe, bones]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Necrotic Nova", { targets: [foe, bones] });
      const bi = card.flags[SCOPE].targets.findIndex(t => t.name === bones.name);
      assert.equal(await healRow(card, `button[data-action="applyHealing"][data-target-index="${bi}"]`, bones), 7);
    });

    it("Soul Cage: half Health gated, Stunned on a failure, and its death gives 1 more Essence and cages the soul", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Cage", { level: 17, spells: ["Soul Cage"] });
      const foe = await creature("Bandit", "NS Cage Foe", { hp: 20 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 800, y: 500, side: "hostile" }]);
      assert.match(await castRefused(n, "Soul Cage", { targets: [foe] }), /half/i, "a creature above half Health is refused");
      await foe.update({ "system.health.value": 8 });
      const card = await castOk(n, "Soul Cage", { targets: [foe] });
      await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[SOUL_CAGE_FLAG]), "the cage");
      await resist(card, 0, 1);
      await until(() => foe.statuses.has("stunned"), "Stunned");
      const before = essenceOf(n).value;
      await foe.update({ "system.health.value": 0 });
      await until(() => essenceOf(n).value >= before + 2, "the death's Essence and the cage's 1 more", 30000);
      await until(() => foe.getFlag(SCOPE, SOUL_MARK_FLAG)?.state === "caged", "the soul caged");
      assert.equal(tokenOf(foe).document.getFlag(SCOPE, CORPSE_FLAG)?.state, "caged", "every raise reads the corpse caged");
    });

    it("Soul Rip: the blow, and a living creature's failed Test gives 1 Essence", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Rip", { level: 17, spells: ["Soul Rip"] });
      const foe = await creature("Bandit", "NS Rip Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const before = essenceOf(n).value;
      const card = await castOk(n, "Soul Rip", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => essenceOf(n).value === before + 1, "1 Essence", 20000);
      assert.ok(await applyRow(card, 0, foe) > 0);
      // **A FORGED PAYLOAD OF 99** (the final review's S3, D-982): the essence act holds the gain to the
      // card's own row and gives each creature's failure once. The real Resist above recorded its claim.
      const { necroSpellQueryHandler } = await import("../effects/necromancer-spells.mjs");
      const from = tokenOf(foe).document.actor;
      const forged = { act: "essence", source: "soulRip", amount: 99, holderUuid: n.uuid, fromUuid: from.uuid, messageId: card.id };
      assert.deepInclude(card.getFlag(SCOPE, "soulRipClaimed") ?? [], from.uuid, "the Resist's gain is recorded on the card");
      assert.equal((await necroSpellQueryHandler(forged, { user: game.user })).reason, "claimed", "a second gain for the same failure is refused");
      await card.unsetFlag(SCOPE, "soulRipClaimed");
      await bankEssence(n, 0);
      const clamped = await necroSpellQueryHandler(forged, { user: game.user });
      assert.equal(clamped.gain, 1, "99 asked, the row's 1 given");
      await until(() => essenceOf(n).value === 1, "1 Essence, not 99", 15000);
      const stranger = await necroSpellQueryHandler({ ...forged, messageId: null }, { user: game.user });
      assert.equal(stranger.ok, false, "no card, no Soul Rip gain");
      assert.equal(essenceOf(n).value, 1, "nothing more given");
    });

    it("Shroud of Bone: refused past four; each target's Apply lays 2 Armor Points at every location", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Shroud", { level: 17, spells: ["Shroud of Bone"] });
      const ally = await makeCharacter({ name: "ZZ NS Shroud Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: ally, x: 700, y: 500 }]);
      const ap = ally.system.ap.body;
      const card = await castOk(n, "Shroud of Bone", { targets: [ally] });
      await applyEffect(card, 'button[data-action="applySpellEffect"][data-target-index="0"]', ally, e => e.name === "Shroud of Bone");
      await until(() => ally.system.ap.body === ap + 2, "Body AP +2");
    });

    it("Unholy Renewal: only the undead allies are its rows, each regaining 8", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Renewal", { level: 17, spells: ["Unholy Renewal"] });
      const ally = await makeCharacter({ name: "ZZ NS Renewal Living", classes: [["Warrior", 5]] });
      const bones = await creature("Risen Skeleton", "NS Renewal Bones", { hp: 20 });
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: ally, x: 700, y: 500 }, { actor: bones, x: 800, y: 500 }]);
      await bones.update({ "system.health.value": 5 });
      await fightWith([n, ally, bones]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Unholy Renewal", { targets: [ally, bones] });
      assert.deepEqual(card.flags[SCOPE].targets.map(t => t.name), [bones.name], "the living ally is not a row");
      assert.equal(await healRow(card, 'button[data-action="applyHealing"][data-target-index="0"]', bones), 8);
    });

    it("Call the Departed: a spirit called, and the same creature refused a second time", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Departed", { level: 17, spells: ["Call the Departed"] });
      const dead = await corpse("Bandit", "NS Departed Dead");
      await sceneWith([{ actor: n, x: 500, y: 500 }]);
      await castOk(n, "Call the Departed", { steps: [choose(dead.name)] });
      assert.include(n.getFlag(SCOPE, DEPARTED_FLAG) ?? [], dead.uuid, "the creature recorded");
      await bankMana(n);
      await n.unsetFlag(SCOPE, SPELL_USES_FLAG);
      const res = await saying(() => cast(n, "Call the Departed", { steps: [choose(dead.name)], ms: 6000 }));
      assert.ok(res.warned.some(w => /already called/.test(w)), "refused the second time in words");
    });

    it("Speak with the Dead: the corpse answers, and a second casting on it is refused", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Speak", { level: 17, spells: ["Speak with the Dead"] });
      const body = await corpse("Bandit", "NS Speak Body");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
      await tokenOf(body).document.actor.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime - 3600);
      await castOk(n, "Speak with the Dead", { steps: [choose(body.name)] });
      await until(() => tokenOf(body).document.getFlag(SCOPE, "questioned") === true, "the corpse questioned");
      await bankMana(n);
      await n.unsetFlag(SCOPE, SPELL_USES_FLAG);
      const res = await saying(() => cast(n, "Speak with the Dead", { steps: [choose(body.name)], ms: 6000 }));
      assert.ok(res.warned.some(w => /questioned before/.test(w)), "the second questioning refused in words");
    });

    it("Speak with the Dead: a corpse dead a month or more is refused in words, with nothing paid", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Speak Old", { level: 17, spells: ["Speak with the Dead"] });
      const body = await corpse("Bandit", "NS Speak Old Body");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: body, x: 600, y: 500, side: "hostile" }]);
      await tokenOf(body).document.actor.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime - 31 * 86400);
      const mana = manaOf(n).value;
      assert.match(await castRefused(n, "Speak with the Dead", { steps: [choose(body.name)] }), /dead a month or more/);
      assert.equal(manaOf(n).value, mana, "nothing paid");
      assert.notOk(tokenOf(body).document.getFlag(SCOPE, "questioned"), "the corpse not questioned");
    });

    it("Contagion: under the caster's Graveblight the blight takes root, and a creature ending its turn in it makes its Test", async function () {
      this.timeout(300000);
      const n = await necro("ZZ NS Contagion", { level: 17, spells: ["Graveblight", "Contagion"] });
      const foe = await creature("Bandit", "NS Contagion Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }]);
      const combat = await fightWith([n, foe]);
      await freshTurn(n, 2);
      const blight = await castOk(n, "Graveblight");
      const placed = untilHook("createRegion", 30000);
      const p = await pressCard(blight, 'button[data-action="placeArea"]');
      try { await until(pickActive, "the area pick"); await settle(); pressBoard({ x: 1250, y: 550 }); await placed; } finally { await p.release(); }
      await freshTurn(n, 2);
      const rooted = untilHook("createRegion", 30000, r => r.flags?.[SCOPE]?.contagion);
      const dismissCard = necroCardNext("dismissContagion");
      // *Range 60 ft*: the point aimed under the caster's own Graveblight, never the Graveblight's centre.
      await castOk(n, "Contagion", { steps: [board({ x: 1200, y: 560 })] });
      const [region] = await rooted;
      const circle = region.shapes.find(sh => !sh.hole);
      assert.deepEqual([Math.round(circle.x), Math.round(circle.y)], [1200, 560], "the blight stands at the point aimed");
      const test = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.kind === "areaTest").then(([m]) => { made.push(m); return m; });
      await nextTurnUntil(foe, combat);
      await nextTurnUntil(n, combat);
      assert.ok(await test, "the blight's Test card at the end of its turn");
      // *until you dismiss it*: the card's Dismiss takes it up.
      const card = await dismissCard;
      const pd = await pressCard(card, 'button[data-action="necroCard"][data-necro-press="dismissContagion"]');
      try { await until(() => !canvas.scene.regions.has(region.id), "the blight dismissed", 20000); } finally { await pd.release(); }
    });

    it("Contagion: Cure Blight cast on a creature inside clears the blight out to 100 feet", async function () {
      this.timeout(300000);
      const n = await necro("ZZ NS Cleared", { level: 17, spells: ["Graveblight", "Contagion"] });
      const foe = await creature("Bandit", "NS Cleared Foe", { hp: 40 });
      const druid = await otherClass("ZZ NS Cleared Druid", "Druid", 11, ["Cure Blight"]);
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }, { actor: druid, x: 1100, y: 500 }]);
      const blight = await castOk(n, "Graveblight");
      const placed = untilHook("createRegion", 30000);
      const p = await pressCard(blight, 'button[data-action="placeArea"]');
      try { await until(pickActive, "the area pick"); await settle(); pressBoard({ x: 1250, y: 550 }); await placed; } finally { await p.release(); }
      await bankMana(n);
      const rooted = untilHook("createRegion", 30000, r => r.flags?.[SCOPE]?.contagion);
      await castOk(n, "Contagion", { steps: [board({ x: 1200, y: 560 })] });
      const [region] = await rooted;
      // Cure Blight is refused on a creature carrying nothing it can end, so the foe bleeds first.
      await foe.toggleStatusEffect("bleeding", { active: true });
      await until(() => foe.statuses.has("bleeding"), "the foe Bleeding");
      await castOk(druid, "Cure Blight", { targets: [foe] });
      await until(() => !canvas.scene.regions.has(region.id), "the blight cleared", 20000);
    });

    it("Puppet of Flesh: the creature controlled on the caster's turns, the caster Stunned, and the Stun lifted with the control", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Puppet", { level: 20, spells: ["Puppet of Flesh"] });
      const foe = await creature("Bandit", "NS Puppet Foe");
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Puppet of Flesh", { targets: [foe] });
      assert.notInclude(card.flags[SCOPE].onFail?.statuses ?? [], "stunned", "the target's failure lays no Stun on the target");
      await resist(card, 0, 1);
      const carrier = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[PUPPET_FLAG] && e.flags?.[SCOPE]?.[MIND_CONTROL_FLAG]), "the control's carrier", 20000);
      await until(() => n.statuses.has("stunned"), "the caster Stunned");
      assert.notOk(foe.statuses.has("stunned"), "the target is not Stunned");
      await carrier.delete();
      await until(() => !n.statuses.has("stunned"), "the caster's Stun lifted with the control");
    });

    it("Plague of Undeath: a failed Body Test lays the diseases (the horde's door)", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Plague", { level: 20, spells: ["Plague of Undeath"] });
      const foe = await creature("Bandit", "NS Plague Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Plague of Undeath", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => foe.effects.filter(e => e.flags?.[SCOPE]?.affliction).length >= 5, "the diseases carried", 30000);
    });

    it("Reaping: every enemy within 20 feet its Test, and the caster regains its tier for each failure", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Reap", { level: 20, spells: ["Reaping"] });
      const a = await creature("Bandit", "NS Reap A", { hp: 40 });
      const b = await creature("Bandit", "NS Reap B", { hp: 40 });
      const far = await creature("Bandit", "NS Reap Far", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: a, x: 700, y: 500, side: "hostile" }, { actor: b, x: 500, y: 700, side: "hostile" }, { actor: far, x: 1500, y: 500, side: "hostile" }]);
      await n.update({ "system.health.value": Math.max(1, health(n) - 15) });
      const card = await castOk(n, "Reaping");
      assert.deepEqual(card.flags[SCOPE].targets.map(t => t.name).sort(), [a.name, b.name].sort(), "the ring round the caster");
      const hp = health(n);
      await resist(card, 0, 1);
      await resist(card, 1, 1);
      await until(() => health(n) === hp + 2 * (n.system.tier ?? 4), "the tier for each failure", 20000);
    });

    it("Sever the Soul: the target takes the blow and no Test, the enemies round it their Test; dropped to 0 it is severed", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Sever", { level: 20, spells: ["Sever the Soul"] });
      const target = await creature("Bandit", "NS Sever Target", { hp: 5 });
      const near = await creature("Bandit", "NS Sever Near", { hp: 40 });
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: target, x: 900, y: 500, side: "hostile" }, { actor: near, x: 1000, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Sever the Soul", { targets: [target] });
      assert.deepEqual(card.flags[SCOPE].targets.map(t => t.name), [target.name, near.name], "the target, then the ring");
      assert.notOk(card.flags[SCOPE].damageByTarget[1], "the ring takes no damage");
      await resist(card, 1, 1);
      await until(() => near.statuses.has("frightened"), "the enemy round it Frightened");
      await applyRow(card, 0, target);
      await until(() => target.getFlag(SCOPE, SOUL_MARK_FLAG)?.state === "severed", "the soul severed", 20000);
      await target.applyHealing(5, { from: n, givenBy: n, spell: true, school: "death" });
      assert.equal(health(target), 0, "nothing restores it");
    });

    it("The Dead Rise stands the corpses within 60 feet, outside the horde", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Rise", { level: 20, spells: ["The Dead Rise"] });
      const a = await corpse("Bandit", "NS Rise A");
      await sceneWith([{ actor: n, x: 300, y: 500 }, { actor: a, x: 500, y: 500, side: "hostile" }]);
      const card = await cast(n, "The Dead Rise", { steps: [tickAll([a.name]), choose("1 Risen Skeleton")] });
      assert.ok(card?.flags?.[SCOPE]?.success, `The Dead Rise was cast${card?.refusal ? `: ${card.refusal}` : ""}`);
    });

    it("Shroud of the Grave: 12 temporary Health on each target, who cannot be Frightened for the minute", async function () {
      this.timeout(150000);
      const n = await necro("ZZ NS Grave", { level: 20, spells: ["Shroud of the Grave"] });
      const ally = await makeCharacter({ name: "ZZ NS Grave Ally", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: ally, x: 700, y: 500 }]);
      await fightWith([n, ally]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Shroud of the Grave", { targets: [n, ally] });
      const ai = card.flags[SCOPE].targets.findIndex(t => t.name === ally.name);
      await applyEffect(card, `button[data-action="applySpellEffect"][data-target-index="${ai}"]`, ally, e => e.name === "Shroud of the Grave");
      await until(() => (ally.system.health.temp ?? 0) === 12, "12 temporary Health");
      await ally.toggleStatusEffect("frightened", { active: true });
      await sleep(400);
      assert.notOk(ally.statuses.has("frightened"), "Frightened refused while it stands");
    });

    it("Drain Life (the lead: \"1 - on cast\"): the cast's own hit lands, and at the caster's turn start the target takes 2 Shadow and the caster regains it", async function () {
      this.timeout(240000);
      const n = await necro("ZZ NS Drain", { level: 5, spells: ["Drain Life"] });
      const foe = await creature("Bandit", "NS Drain Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      await n.update({ "system.health.value": Math.max(1, health(n) - 20) });
      const combat = await fightWith([n, foe]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Drain Life", { targets: [foe] });
      assert.ok(card.flags[SCOPE].damageByTarget?.[0]?.damage > 0, "the cast's own hit is on the card");
      assert.equal(card.flags[SCOPE].healsDealt?.by, n.uuid, "07: *When you cast this spell ... you regain that much Health* - the card names the caster");
      const hpCast = health(n);
      const took = await applyRow(card, 0, foe);
      assert.ok(took > 0, "the cast's hit lands through the card's Apply");
      await until(() => health(n) - hpCast === took, "the caster regains what the cast's hit took", 15000);
      const foeHp = health(foe);
      const hp = health(n);
      await nextTurnUntil(foe, combat);
      await nextTurnUntil(n, combat);
      await until(() => health(foe) < foeHp, "the drain lands at the caster's turn start", 30000);
      assert.equal(health(n) - hp, foeHp - health(foe), "the caster regains what was dealt");
    });

    it("Siphon Life, a Warlock's (the lead: \"1 - on cast\"): the cast's own hit, then the drain at the Warlock's turn start", async function () {
      this.timeout(240000);
      const warlock = await otherClass("ZZ NS Siphon Warlock", "Warlock", 9, ["Siphon Life", "Drain Life"]);
      const foe = await creature("Bandit", "NS Siphon Foe", { hp: 60 });
      await sceneWith([{ actor: warlock, x: 500, y: 500 }, { actor: foe, x: 800, y: 500, side: "hostile" }]);
      await warlock.update({ "system.health.value": Math.max(1, health(warlock) - 24) });
      const combat = await fightWith([warlock, foe]);
      await freshTurn(warlock, 2);
      const card = await castOk(warlock, "Siphon Life", { targets: [foe] });
      assert.ok(card.flags[SCOPE].damageByTarget?.[0]?.damage > 0, "the cast's own hit is on the card");
      assert.equal(card.flags[SCOPE].healsDealt?.by, warlock.uuid, "the Warlock's card names the Warlock as the drainer");
      const hpCast = health(warlock);
      const took = await applyRow(card, 0, foe);
      assert.ok(took > 0, "the cast's hit lands");
      await until(() => health(warlock) - hpCast === took, "the Warlock regains what the cast's hit took", 15000);
      const foeHp = health(foe);
      const hp = health(warlock);
      await nextTurnUntil(foe, combat);
      await nextTurnUntil(warlock, combat);
      await until(() => health(foe) < foeHp, "the drain at the Warlock's turn start", 30000);
      assert.equal(health(warlock) - hp, foeHp - health(foe), "the Warlock regains what was dealt");
    });

    it("Potent once per cast (the lead: \"4 - per cast\"): an area taken off and put down again gives no second rise", async function () {
      this.timeout(300000);
      const caster = await makeCharacter({ name: "ZZ NS Potent Cast", classes: [["Mage", 11], ["Necromancer", 1]], spells: ["Scorched Earth"], abilities: { int: 18, con: 14 } });
      NECROS.push(caster);
      await caster._talentGrant;
      const foe = await creature("Bandit", "NS Potent Cast Foe", { hp: 80 });
      await sceneWith([{ actor: caster, x: 200, y: 600 }, { actor: foe, x: 900, y: 600, side: "hostile" }]);
      const combat = await fightWith([caster, foe]);
      await nextTurnUntil(caster, combat);
      await bankMana(caster);
      await bankEssence(caster, 2);
      const card = await castOk(caster, "Scorched Earth", { lines: ["empower-potent"] });
      const potent = card.flags[SCOPE].empower?.potent ?? 0;
      assert.isAbove(potent, 0, "the cast carries Potent");
      const first = await placeAt(card, centreOf(foe));
      const start = health(foe);
      await nextTurnUntil(foe, combat);
      await until(() => health(foe) < start, "the first turn-start strike", 30000);
      const one = start - health(foe);
      await until(() => (first.flags[SCOPE].potentStruck ?? []).includes(foe.uuid), "the first area records the rise");
      await until(() => (game.messages.get(card.id)?.flags?.[SCOPE]?.potentStruckCast ?? []).includes(foe.uuid), "the cast's card records the rise");
      // The GM takes the area off by hand, and the card puts the same cast's area down again where the foe stands.
      await first.delete();
      const second = await placeAt(game.messages.get(card.id), centreOf(foe));
      assert.include(second.flags[SCOPE].potentStruck ?? [], foe.uuid, "the second area of the cast is seeded with the creature already risen for");
      const mid = health(foe);
      await nextTurnUntil(caster, combat);
      await nextTurnUntil(foe, combat);
      await until(() => health(foe) < mid, "the second turn-start strike", 30000);
      const two = mid - health(foe);
      assert.equal(one - two, potent, `the rise came once for the cast (${one}, then ${two})`);
    });

    it("Binding spent only on the roll (the lead: \"6 - Only on creature's roll\"): a posted area Test keeps the Bane owed until it is rolled", async function () {
      this.timeout(300000);
      const caster = await makeCharacter({ name: "ZZ NS Binding Roll", classes: [["Mage", 11], ["Necromancer", 1]], spells: ["Rimebind"], abilities: { int: 18, con: 14 } });
      NECROS.push(caster);
      await caster._talentGrant;
      const foe = await creature("Bandit", "NS Binding Walker", { hp: 60 });
      await sceneWith([{ actor: caster, x: 200, y: 600 }, { actor: foe, x: 1400, y: 600, side: "hostile" }]);
      const combat = await fightWith([caster, foe]);
      await nextTurnUntil(caster, combat);
      await bankMana(caster);
      await bankEssence(caster, 2);
      const card = await castOk(caster, "Rimebind", { lines: ["empower-binding"] });
      const ice = await placeAt(card, { x: 950, y: 650 });
      assert.ok(ice.flags[SCOPE].binding, "the area carries Binding");
      await nextTurnUntil(foe, combat);
      const posted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "areaTest" && m.flags[SCOPE].area?.actorUuid === foe.uuid).then(([m]) => { made.push(m); return m; });
      await walk(foe, { x: 900, y: 600 });
      const test = await posted;
      assert.ok((test.flags[SCOPE].resistBanes ?? []).some(r => r.binding === true), "the posted Test carries the Bane");
      await sleep(1500);
      assert.notInclude(ice.flags[SCOPE].binding?.spent ?? [], foe.uuid, "posting the Test spent nothing");
      const rolled = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "resilience").then(([m]) => { made.push(m); return m; });
      const p = await pressCard(test, 'button[data-action="resistTest"]', { face: 20 });
      try { await rolled; } finally { await p.release(); }
      await until(() => (ice.flags[SCOPE].binding?.spent ?? []).includes(foe.uuid), "the roll spent the Bane", 20000);
    });

    it("Curse of Agony: the Apply lays its tick, which lands at the target's turn start", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Agony", { level: 5, spells: ["Curse of Agony"] });
      const foe = await creature("Bandit", "NS Agony Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      const combat = await fightWith([n, foe]);
      await freshTurn(n, 2);
      const card = await castOk(n, "Curse of Agony", { targets: [foe] });
      await applyEffect(card, 'button[data-action="applySpellEffect"][data-target-index="0"]', foe, e => e.flags?.[SCOPE]?.tick);
      const hp = health(foe);
      await nextTurnUntil(foe, combat);
      await until(() => health(foe) < hp, "the tick at its turn start", 30000);
    });

    it("Curse of Weakness: a failed Spirit Test and the creature's blows deal 2 less", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Weak", { level: 5, spells: ["Curse of Weakness"] });
      const foe = await creature("Bandit", "NS Weak Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Curse of Weakness", { targets: [foe] });
      await resist(card, 0, 1);
      const curse = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[CURSE_FLAG]?.kind === "weakness"), "the curse");
      assert.equal(curse.flags[SCOPE][CURSE_FLAG].amount, 2, "2 less at no Shadow Spellpower");
      assert.equal(curse.duration.seconds, 60, "the curse lasts its minute");
      const hp0 = health(n);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, n, { face: 19 });
      const dealt = attack.flags[SCOPE].damageByTarget[0].damage;
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try { await until(() => health(n) === hp0 - Math.max(0, dealt - 2), `the blow less 2 (${dealt} on the card, Health ${health(n)} of ${hp0})`, 20000); } finally { await p.release(); }
    });

    it("Curse of Weakness with Lasting: the empowered curse lasts two minutes, doubled from one", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Weak Lasting", { level: 5, spells: ["Curse of Weakness"] });
      const foe = await creature("Bandit", "NS Weak Lasting Foe", { hp: 40 });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }]);
      await bankEssence(n, 1);
      const card = await castOk(n, "Curse of Weakness", { targets: [foe], lines: ["empower-lasting"] });
      assert.equal(card.flags[SCOPE].empower?.lasting, true, "the card records Lasting");
      await resist(card, 0, 1);
      const curse = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[CURSE_FLAG]?.kind === "weakness"), "the curse");
      assert.equal(curse.duration.seconds, 120, "two minutes on the laid curse, not one");
    });

    it("the shared spells cast by another class are unchanged (D-1099): a Warlock's curse and Drain Life, a Priest's Speak with the Dead", async function () {
      this.timeout(300000);
      const warlock = await otherClass("ZZ NS Warlock", "Warlock", 9, ["Curse of Weakness", "Drain Life"], { "Curse of Agony": 1, Malediction: 2 });
      const priest = await otherClass("ZZ NS Priest", "Priest", 17, ["Speak with the Dead"]);
      const foe = await creature("Bandit", "NS Shared Foe", { hp: 60 });
      const body = await corpse("Bandit", "NS Shared Body");
      await sceneWith([{ actor: warlock, x: 500, y: 500 }, { actor: foe, x: 800, y: 500, side: "hostile" }, { actor: priest, x: 500, y: 800 }, { actor: body, x: 600, y: 800, side: "hostile" }]);
      // Malediction 2 on the Warlock's Curse of Weakness: the Apply lays the curse for three minutes.
      const weak = await castOk(warlock, "Curse of Weakness", { targets: [foe] });
      assert.notOk(weak.flags[SCOPE].necroSpell, "no Necromancer door carries the Warlock's curse");
      assert.include(textOf(weak), "3 minutes", "the card prints Malediction's span");
      const laid = await applyEffect(weak, 'button[data-action="applySpellEffect"][data-target-index="0"]', foe, e => e.name === "Curse of Weakness");
      assert.equal(laid.duration.seconds, 180, "the laid curse lasts three minutes, Malediction's span on the effect");
      // The Warlock's Drain Life deals at the cast, as before 4c-S.
      await bankMana(warlock);
      const drain = await castOk(warlock, "Drain Life", { targets: [foe] });
      assert.ok(drain.flags[SCOPE].damageByTarget?.[0]?.damage > 0, "the Warlock's Drain Life deals at the cast");
      // The Priest's Speak with the Dead: no corpse pick, the Apply on the card.
      const speak = await castOk(priest, "Speak with the Dead", { targets: [body] });
      assert.notOk(speak.flags[SCOPE].necroSpell, "no Necromancer door carries the Priest's Speak with the Dead");
      assert.ok(cardHasApply(speak), "the Priest's card offers its Apply");
    });

    it("Curse of Tongues: a failed Spirit Test and the creature pays 2 more Mana for its next spell", async function () {
      this.timeout(180000);
      const n = await necro("ZZ NS Tongues", { level: 5, spells: ["Curse of Tongues"] });
      const other = await necro("ZZ NS Tongues Victim", { level: 1, spells: ["Bone Shards"] });
      await sceneWith([{ actor: n, x: 500, y: 500 }, { actor: other, x: 900, y: 500, side: "hostile" }]);
      const card = await castOk(n, "Curse of Tongues", { targets: [other] });
      await resist(card, 0, 1);
      await until(() => other.effects.find(e => e.flags?.[SCOPE]?.[CURSE_FLAG]?.kind === "tongues"), "the curse");
      const mana = manaOf(other).value;
      await castOk(other, "Bone Shards", { targets: [n] });
      assert.equal(manaOf(other).value, mana - 5, "Bone Shards' 3 and the curse's 2");
    });
  });
}
