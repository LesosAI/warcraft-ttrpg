/**
 * **THE FIX RUNS AFTER THE NECROMANCER'S PHASE 4, THROUGH THE REAL CONTROLS** (the 4a review's
 * worklist, then the fix runs' review): Potent on a placed area at a turn start, on an entry and on a
 * failed area Test, and on a tick (O-413); Binding on the card's Resist and on an area's Test (O-411);
 * 07 §4's cast cap and tier 5 gate with the GM's *teach anyway* (the lead, 2026-11-18: *"Yes the tier
 * 5 spells learned via tomes should be learnable by the GM manually to the character"*); an item's
 * casting with the empower lines; Flesh Offering's drawn price (O-412); the death watch's live cases;
 * and the fix runs' review's own items - a refused plague rising offered again, Far-reaching at Heat
 * Mirage's and Mindstatic's pickers, Lasting on Enslave the Dead and Plague of Undeath, the Plague
 * Bladder's Poisoned with its shed DC, Grave Guard's overflow halved off its record by Icebound
 * Fortitude, and Enslave the Dead on a creature bound to another character.
 *
 * **Every cast is the sheet's own Cast** with its dialog's lines ticked by their checkboxes; every area
 * is laid by the card's own Place area and a press on the board; every turn-start strike lands because
 * the fight was moved to that creature's turn with the tracker's own Next Turn; every entry is a token
 * walking in; every Test is pressed on its card (the fix runs' review: the earlier tests called
 * `castSpell`, `placeArea`, `_areaTicks` and `postAreaTest` behind the controls).
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-fixes`.
 */

import { cleanup, forgeDrop, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, untilHook, warnings, KNOWN } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { castFromSheet, chooser, fightWith, manaOf, nextTurnUntil, pick, pressCard, sceneWith, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castWith, nextCard, npcAttacks, refusedCast, tick } from "./quench-necromancer-review.mjs";
import { pickActive, pressBoard } from "./quench-chronomancer-sweep-t12.mjs";
import { AREAS_ENTERED_HOOK, areaDamageOn } from "../effects/area-strikes.mjs";
import { ROUND_SECONDS } from "../rules/area-ticks.mjs";
import { onDeath } from "../effects/death-watch.mjs";
import { capacityOf, hordeActorsOf, setStitchPick } from "../effects/necromancer-horde.mjs";

const SCOPE = "azeroth-rpg";
const FT = 20; // pixels a foot: 100 px a 5 ft square
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const health = actor => actor.system.health.value;
const bondOf = actor => actor.getFlag(SCOPE, "bond") ?? null;
const NECROS = [];

/** A Necromancer at a level (or a multiclass whose classes are given), Intelligence 16 unless named. */
async function necromancerWith(name, { level = 5, race = "Human", spells = [], ranks = {}, int = 16, classes = null } = {}) {
  const n = await makeCharacter({ name, classes: classes ?? [["Necromancer", level]], race, spells, abilities: { int, con: 14 } });
  NECROS.push(n);
  await until(() => essenceOf(n), "the Essence pool");
  await n._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => n.items.find(i => i.type === "talent" && i.name === talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  return n;
}

async function bankEssence(actor, value) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === Math.min(value, pool.max), "Essence banked");
}

/** Every Power pool banked (a Mage and Necromancer hold two, 02 §10: each class keeps its own). */
async function bankMana(actor, value = 99) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: Math.min(value, pool.max) });
    await until(() => actor.poolSnapshot().find(p => p.itemId === pool.itemId && p.kind === "power")?.value === Math.min(value, pool.max), "Mana banked");
  }
}

async function creature(entry, name, { health: hp = null } = {}) {
  const npc = await makeNpc(entry);
  // A Bandit holds 3 Health: a test that strikes twice gives it more, so the first blow kills nothing.
  const max = hp ?? npc.system.health.max;
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.max": max, "system.health.value": max });
  return npc;
}

/** A corpse: a bestiary creature, named for the test, at 0 Health. */
async function corpse(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

const kill = npc => npc.update({ "system.health.value": 0 });
const centreOf = actor => ({ x: tokenOf(actor).center.x, y: tokenOf(actor).center.y });
const hordeOf = necro => hordeActorsOf(necro).sort((a, b) => (bondOf(a).since ?? 0) - (bondOf(b).since ?? 0));

/** Wait for the Resilience card a creature's Resist posted. */
const resistCard = (actor, ms = 30000) => untilHook("createChatMessage", ms, m => m.flags?.[SCOPE]?.kind === "resilience"
  && (m.speaker?.actor === actor.id || ChatMessage.getSpeakerActor(m.speaker)?.id === actor.id)).then(([m]) => { made.push(m); return m; });

/** The area Test card the area door posts for a creature. */
const areaTestCard = (actor, ms = 30000) => nextCard(m => m.flags?.[SCOPE]?.kind === "areaTest" && m.flags[SCOPE].area?.actorUuid === actor.uuid, ms);

/** The next time the GM's client has judged what a move of this token entered (the area door's own hook). */
const entering = token => untilHook(AREAS_ENTERED_HOOK, 15000, (doc, entered) => doc?.id === token.id && entered > 0);

/** The *teach anyway* confirm the GM's drop opens. */
const teachDialog = () => until(() => [...foundry.applications.instances.values()]
  .find(a => a.rendered && a.element?.querySelector?.('button[data-action="yes"]') && (a.title ?? a.options?.window?.title ?? "") === game.i18n.localize("AZEROTH.Spell.Teach.Title")) ?? null, "the teach-anyway confirm", 10000);

async function spellUuid(name) {
  const pack = game.packs.get("azeroth-rpg.spells");
  const entry = (await pack.getIndex()).find(e => e.name === name);
  if (!entry) throw new Error(`the spells pack holds no ${name}`);
  return entry.uuid ?? `Compendium.azeroth-rpg.spells.Item.${entry._id}`;
}

/** Press the card's Place area and click the board at `point`; the Region laid. */
async function placeAt(card, point) {
  const created = untilHook("createRegion", 30000);
  const p = await pressCard(card, 'button[data-action="placeArea"]');
  try {
    await until(pickActive, "the area pick armed", 15000);
    await settle();
    pressBoard(point);
    const [region] = await created;
    return region;
  } finally {
    await p.release();
  }
}

/** A Utility dialog (`applications/thematic-utility-dialog.mjs`) answered by its own fields (stage 9's shape). */
async function answerUtility(values, ms = 30000) {
  const names = Object.keys(values);
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered
    && a.element?.querySelector(`[name="${names[0]}"]`) && a.element.querySelector('button[data-action="accept"]')), `the dialog asking ${names[0]}`, ms);
  for (const [name, value] of Object.entries(values)) {
    const input = app.element.querySelector(`[name="${name}"]`);
    if (!input) throw new Error(`the dialog draws no ${name}`);
    if (typeof value === "boolean") input.checked = value;
    else input.value = String(value);
  }
  app.element.querySelector('button[data-action="accept"]').click();
  await until(() => !app.rendered, `the dialog asking ${names[0]} to close`, ms);
}

/** Core's image picker, answered with a path through its own callback (stage 9's shape). */
async function answerFilePicker(path, ms = 30000) {
  const Picker = foundry.applications.apps.FilePicker.implementation;
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a instanceof Picker && a.rendered), "the image picker", ms);
  app.callback(path, app);
  await app.close();
}

/** The warnings said while `fn` runs, kept beside its own result. */
async function saying(fn) {
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    return { value: await fn(), warned };
  } catch (err) {
    // A throw says what was said beside it (a refusal is a warning, a timeout is not why).
    throw new Error(`${err?.message ?? err}; warnings: ${warned.join(" | ") || "none"}`);
  } finally { ui.notifications.warn = original; }
}

/** Walk a token to a top-left position on its own turn; resolves once it stands there. */
async function walk(actor, to, { judged = false } = {}) {
  const token = tokenOf(actor).document;
  const seen = judged ? entering(token) : null;
  assert(await token.move(to), `${actor.name}'s walk was refused`);
  if (seen) await seen;
  await until(() => token.x === to.x && token.y === to.y, `${actor.name}'s walk to land`, 10000);
}
function assert(ok, what) { if (!ok) throw new Error(what); }

export function necromancerFixesBatch(context) {
  const { describe, it, assert: chai, before, after } = context;

  describe("The Necromancer fix runs (the 4a review's worklist and the fix runs' review)", function () {
    let restoreDialog = null;
    let restoreText = null;
    let receiptHook = null;
    before(async function () {
      // **A PRIVATE RECEIPT NEEDS THE GM'S KEY** (Heat Mirage and Mindstatic write one;
      // `effects/private-spell-records.mjs`): an envelope an earlier run left, sealed by a key only that
      // run's browser held, is unreadable residue and fails the next world load's clean console, so it
      // goes first (stage 9's shape), and every receipt this batch writes goes in `after`.
      const { privateSpellKeyStatus } = await import("../effects/private-spell-records.mjs");
      const status = privateSpellKeyStatus();
      if (!status.localKey && status.encryptedRecords) {
        const stale = game.messages.contents.filter(m => m.flags?.[SCOPE]?.privateSpellEnvelope && m.author?.isGM === true).map(m => m.id);
        if (stale.length) await ChatMessage.deleteDocuments(stale);
      }
      receiptHook = Hooks.on("createChatMessage", m => { if (m.flags?.[SCOPE]?.privateSpellEnvelope) made.push(m); });
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(300000);
      if (receiptHook !== null) Hooks.off("createChatMessage", receiptHook);
      setStitchPick(null);
      canvas?.tokens?.setTargets?.([]);
      if (pickActive()) game.system.azeroth.canvas.cancelPick();
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-grave-guard-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      for (const n of NECROS) await game.system.azeroth.workflows.endAllSustains?.({ actor: n }).catch(() => {});
      const owners = new Set(NECROS.map(n => n.uuid));
      for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete().catch(() => {});
      for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    describe("Potent (MUST-FIX 2, O-413), through the real controls", function () {
      it("Plague Cloud, laid by the card's Place area, rises its first turn-start strike on a creature by the tier, once", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Potent Area", { level: 5, spells: ["Plague Cloud"] });
        const foe = await creature("Bandit", "Potent Area Bandit", { health: 40 });
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 900, y: 600, side: "hostile" }]);
        const combat = await fightWith([necro, foe]);
        await bankMana(necro);
        await bankEssence(necro, 2);
        await nextTurnUntil(necro, combat);
        const card = await castWith(necro, "Plague Cloud", { lines: ["empower-potent"] });
        chai.ok(card?.flags[SCOPE].success, "the cast went off");
        chai.equal(card.flags[SCOPE].empower?.potent, 2, "Potent at tier 2");
        const region = await placeAt(card, centreOf(foe));
        chai.equal(region.flags[SCOPE].potent, 2, "the area carries Potent");
        chai.deepEqual(region.flags[SCOPE].potentStruck ?? [], [], "and has reached nobody");
        const start = health(foe);
        await nextTurnUntil(foe, combat);
        await until(() => health(foe) < start, "the first turn-start strike to land");
        const first = start - health(foe);
        await until(() => (region.flags[SCOPE].potentStruck ?? []).includes(foe.uuid), "the Region to record the creature");
        const mid = health(foe);
        await nextTurnUntil(necro, combat);
        await nextTurnUntil(foe, combat);
        await until(() => health(foe) < mid, "the second turn-start strike to land");
        const second = mid - health(foe);
        chai.equal(first - second, 2, `the first strike rose by the tier and the second did not (${first}, ${second})`);
        await combat.delete();
      });

      it("Curse of Agony's tick takes Potent on its first landing alone, at the creature's own turn starts", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Potent Tick", { level: 5, spells: ["Curse of Agony"] });
        const foe = await creature("Bandit", "Potent Tick Bandit", { health: 40 });
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 700, y: 600, side: "hostile" }]);
        const combat = await fightWith([necro, foe]);
        await bankMana(necro);
        await bankEssence(necro, 2);
        await nextTurnUntil(necro, combat);
        const card = await castFromSheet(necro, "Curse of Agony", { targets: [tokenOf(foe)], face: 19, lines: ["empower-potent"] });
        chai.ok(card, "the cast posted its card");
        const press = await pressCard(card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
        await press.release();
        const carrier = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.tick), "the tick laid");
        chai.equal(carrier.flags[SCOPE].tick.potent, 2, "the tick carries Potent");
        const start = health(foe);
        await nextTurnUntil(foe, combat);
        await until(() => health(foe) < start, "the first landing");
        const first = start - health(foe);
        const mid = health(foe);
        await nextTurnUntil(necro, combat);
        await nextTurnUntil(foe, combat);
        await until(() => health(foe) < mid, "the second landing");
        chai.equal(first - (mid - health(foe)), 2, "the first landing rose by the tier, the second did not");
        await combat.delete();
      });

      // A Necromancer's own areas strike only at a turn start; 07's areas that strike on ENTRY and on a
      // FAILED area Test are a Mage's (Flamestrike, Rimebind), and a Necromancer may multiclass with a
      // Mage (02 §10, `AZEROTH.multiclassOnlyWith`): Mage 11 and Necromancer 1, tier 3, Potent 3.
      it("Flamestrike's area rises a creature's first ENTRY by the tier, and Rimebind's a creature's first FAILED area Test", async function () {
        this.timeout(300000);
        const caster = await necromancerWith("ZZ Fix Potent Mage", { classes: [["Mage", 11], ["Necromancer", 1]], spells: ["Flamestrike", "Rimebind"] });
        chai.equal(caster.system.tier, 3, "tier 3: Potent is 3");
        const walker = await creature("Bandit", "Potent Walker", { health: 60 });
        const failer = await creature("Bandit", "Potent Failer", { health: 60 });
        await sceneWith([{ actor: caster, x: 200, y: 600 }, { actor: walker, x: 1400, y: 600, side: "hostile" }, { actor: failer, x: 1400, y: 1200, side: "hostile" }]);
        const combat = await fightWith([caster, walker, failer]);
        await nextTurnUntil(caster, combat);
        // **ENTRY**: Flamestrike laid where nobody stands, then the walker walks in on its own turn.
        await bankMana(caster);
        await bankEssence(caster, 2);
        const flame = await castWith(caster, "Flamestrike", { lines: ["empower-potent"] });
        chai.ok(flame?.flags[SCOPE].success, "Flamestrike went off");
        const fire = await placeAt(flame, { x: 950, y: 650 });
        chai.equal(fire.flags[SCOPE].potent, 3, "the area carries Potent 3");
        const expected = areaDamageOn({ actor: walker, caster, spell: fire.flags[SCOPE].spell, damage: { rating: 2 + 3, school: "fire" } }).damage;
        chai.isAbove(expected, 0, "the walker's defences take the whole entry, so this proves nothing");
        await nextTurnUntil(walker, combat);
        const before = health(walker);
        await walk(walker, { x: 900, y: 600 }, { judged: true });
        await until(() => health(walker) === before - expected, `the entry's 2 Fire risen by 3 (${before - health(walker)} landed, ${expected} expected)`);
        await until(() => (fire.flags[SCOPE].potentStruck ?? []).includes(walker.uuid), "the Region records the walker once the strike landed");
        // **A FAILED AREA TEST**: Rimebind laid where nobody stands; the failer walks in, its Test is
        // pressed on its own card and fails.
        await nextTurnUntil(caster, combat);
        await bankMana(caster);
        await bankEssence(caster, 2);
        const rime = await castWith(caster, "Rimebind", { lines: ["empower-potent"] });
        chai.ok(rime?.flags[SCOPE].success, "Rimebind went off");
        const ice = await placeAt(rime, { x: 950, y: 1250 });
        chai.equal(ice.flags[SCOPE].potent, 3, "the area carries Potent 3");
        const iced = areaDamageOn({ actor: failer, caster, spell: ice.flags[SCOPE].spell, damage: { rating: 2 + 3, school: "frost" } }).damage;
        chai.isAbove(iced, 0, "the failer's defences take the whole strike, so this proves nothing");
        await nextTurnUntil(failer, combat);
        const asked = areaTestCard(failer);
        await walk(failer, { x: 900, y: 1200 }, { judged: true });
        const test = await asked;
        const start = health(failer);
        const { release } = await pressCard(test, 'button[data-action="resistTest"]', { face: 1 });
        await until(() => health(failer) === start - iced, `the failure's 2 Frost risen by 3 (${start - health(failer)} landed, ${iced} expected)`);
        await release();
        await until(() => (ice.flags[SCOPE].potentStruck ?? []).includes(failer.uuid), "the Region records the failer once the strike landed");
        await combat.delete();
      });
    });

    describe("Binding (MUST-FIX 3, O-411), through the real controls", function () {
      it("lays a Bane on Cripple's Resist, the card's single target, pressed on the card", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Fix Binding", { level: 5, spells: ["Cripple"] });
        const foe = await creature("Bandit", "Binding Bandit");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 2);
        const card = await castFromSheet(necro, "Cripple", { targets: [tokenOf(foe)], face: 19, lines: ["empower-binding"] });
        chai.ok(card, "the cast posted its card");
        chai.ok((card.flags[SCOPE].resistBanes ?? []).some(r => r.binding === true), "the card's Resist carries Binding");
        const posted = resistCard(foe);
        const press = await pressCard(card, 'button[data-action="resistTest"]', { face: 10 });
        let result;
        try { result = await posted; } finally { await press.release(); }
        chai.isAtLeast(result.rolls[0].options?.banes ?? 0, 1, `the Resist was made with Binding's Bane: ${JSON.stringify(result.rolls[0].options?.provenance ?? null)}`);
        chai.equal(essenceOf(necro).value, 1, "1 Essence paid for the line");
      });

      it("Rimebind's area gives the Bane on the first Test it asks a creature walking in, and none on its next", async function () {
        this.timeout(300000);
        const caster = await necromancerWith("ZZ Fix Binding Mage", { classes: [["Mage", 11], ["Necromancer", 1]], spells: ["Rimebind"] });
        const foe = await creature("Bandit", "Binding Walker", { health: 60 });
        await sceneWith([{ actor: caster, x: 200, y: 600 }, { actor: foe, x: 1400, y: 600, side: "hostile" }]);
        const combat = await fightWith([caster, foe]);
        await nextTurnUntil(caster, combat);
        await bankMana(caster);
        await bankEssence(caster, 2);
        const rime = await castWith(caster, "Rimebind", { lines: ["empower-binding"] });
        chai.ok(rime?.flags[SCOPE].success, "Rimebind went off");
        const ice = await placeAt(rime, { x: 950, y: 650 });
        chai.ok(ice.flags[SCOPE].binding, "the area carries Binding");
        await nextTurnUntil(foe, combat);
        const first = areaTestCard(foe);
        await walk(foe, { x: 900, y: 600 }, { judged: true });
        const test1 = await first;
        chai.ok((test1.flags[SCOPE].resistBanes ?? []).some(r => r.binding === true), "the first Test the area asks carries Binding's Bane");
        // Passed (a 20), so the creature walks out again: Entangled would hold it.
        const made1 = resistCard(foe);
        const p1 = await pressCard(test1, 'button[data-action="resistTest"]', { face: 20 });
        try { await made1; } finally { await p1.release(); }
        await until(() => (ice.flags[SCOPE].binding?.spent ?? []).includes(foe.uuid), "the area records the creature's Bane spent");
        await walk(foe, { x: 1400, y: 600 });
        await nextTurnUntil(caster, combat);
        await nextTurnUntil(foe, combat);
        const second = areaTestCard(foe);
        await walk(foe, { x: 900, y: 600 }, { judged: true });
        const test2 = await second;
        chai.isFalse((test2.flags[SCOPE].resistBanes ?? []).some(r => r.binding === true), "no second Bane for the creature that had its first Test");
        await combat.delete();
      });
    });

    describe("07 §4's cast cap and tier 5 gate (MUST-FIX 4; the lead's ruling)", function () {
      it("the sheet's Cast refuses a tier 1 Necromancer's tier 3 spell in words with nothing spent; a tier 5 spell is outside the cap", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Fix Cap", { level: 1, spells: ["Wraith Bolt", "Reaping"] });
        const foe = await creature("Bandit", "Cap Target");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro, 30);
        const reaping = necro.items.find(i => i.name === "Reaping");
        chai.isNull(necro.castCapWords(reaping), "tier 5 is outside the cap");
        const mana = manaOf(necro).value;
        const words = await refusedCast(necro, "Wraith Bolt", { targets: [tokenOf(foe)] });
        chai.ok(words && words.includes("Wraith Bolt") && words.includes("tier 1"), `refused in words: ${words}`);
        chai.equal(manaOf(necro).value, mana, "nothing was spent");
      });

      it("the GM's drop of a tier 5 spell asks teach-anyway: no adds nothing, yes teaches it", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Fix Teach", { level: 1 });
        const sheet = await openSheet(necro);
        sheet.changeTab("spells", "primary");
        await settle();
        const target = () => sheet.element.querySelector('section[data-tab="spells"]') ?? sheet.element;
        const uuid = await spellUuid("Reaping");
        forgeDrop(target(), { type: "Item", uuid });
        let ask = await teachDialog();
        // Why, in words: here 07 §4's tier 3 rule, since the GM's confirm names the refusal it passes.
        chai.include(ask.element.textContent, game.i18n.format("AZEROTH.Spell.LearnRefused.tierFive", { name: necro.name, spell: "Reaping" }), "the confirm says why");
        ask.element.querySelector('button[data-action="no"]').click();
        await sleep(800);
        chai.isFalse(necro.items.some(i => i.name === "Reaping"), "no taught nothing");
        forgeDrop(target(), { type: "Item", uuid });
        ask = await teachDialog();
        ask.element.querySelector('button[data-action="yes"]').click();
        await until(() => necro.items.some(i => i.name === "Reaping"), "yes teaches it");
        await sheet.close();
      });

      it("the document's seam refuses a player's tier 5 spell and strips a forged spellFrom from one it lets through", async function () {
        this.timeout(60000);
        const necro = await necromancerWith("ZZ Fix Seam", { level: 1 });
        const pack = game.packs.get("azeroth-rpg.spells");
        const reaping = (await pack.getDocument((await pack.getIndex()).find(e => e.name === "Reaping")._id)).toObject();
        const shards = (await pack.getDocument((await pack.getIndex()).find(e => e.name === "Bone Shards")._id)).toObject();
        // A flag naming an item the character DOES hold (the Grave Calling feature) that teaches some
        // other spell: forged, since the grant table pairs that feature with Raise Dead and Animate
        // Corpse alone (the fix runs' review).
        const graveCalling = necro.items.find(i => i.type === "feature" && i.name === "Grave Calling");
        chai.ok(graveCalling, "Grave Calling is held");
        foundry.utils.setProperty(shards, "flags.azeroth-rpg.spellFrom", graveCalling.id);
        // **A PLAYER'S DROP, THROUGH THE ITEM'S OWN BATCH SEAM**: the test world holds no second user,
        // so the operation is run with a non-GM user record (`{id: "zzPlayer", isGM: false}`) -
        // exactly what core hands `_preCreateOperation` for a player's write.
        const player = { id: "zzPlayer", isGM: false };
        const docs = [new CONFIG.Item.documentClass(reaping, { parent: necro }), new CONFIG.Item.documentClass(shards, { parent: necro })];
        const said = await warnings(async () => {
          await CONFIG.Item.documentClass._preCreateOperation(docs, { parent: necro }, player);
        });
        chai.deepEqual(docs.map(d => d.name), ["Bone Shards"], "the tier 5 spell was spliced out, the class's own spell kept");
        chai.isNull(docs[0].flags?.[SCOPE]?.spellFrom ?? null, "a spellFrom the grant table does not pair with this spell is stripped");
        chai.ok(said.some(s => s.includes("Reaping")), `refused in words: ${said.join(" | ")}`);
        // And the cast cap does not honour such a flag either.
        chai.ok(necro.castCapWords({ name: "Wraith Bolt", system: { tier: 3, school: "death", classes: ["Necromancer"] }, flags: { [SCOPE]: { spellFrom: graveCalling.id } } }), "a forged spellFrom escapes the cast cap");
        chai.isNull(necro.castCapWords({ name: "Raise Dead", system: { tier: 3, school: "death", classes: ["Necromancer"] }, flags: { [SCOPE]: { spellFrom: graveCalling.id } } }), "a spell the feature teaches is outside the cap");
      });
    });

    describe("an item's casting honours the empower lines (SHOULD-FIX; D-1084)", function () {
      // **WHY AN ITEM'S CASTING AND NOT A `free` CAST**: the doors that cast free through a dialog are a
      // Paladin's (`castFreeSpell`) and a Priest's Legendary (The Archbishop's Prayer), and neither class
      // may hold Essence (02 §10: a Necromancer multiclasses with a Warrior, a Mage or a Rogue alone).
      // The one free cast a Necromancer reaches is Claim the Fallen's empowered press, held in the
      // `necromancer-review` batch; this is the item's casting, pressed on the sheet's From items row.
      it("Potent ticked on an item's Bone Shards from the Spells tab: 1 Essence paid, no Mana, the card records it", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Fix Item Cast", { level: 5 });
        const foe = await creature("Bandit", "Item Cast Target", { health: 30 });
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        const uuid = await spellUuid("Bone Shards");
        const [wand] = await necro.createEmbeddedDocuments("Item", [{
          name: "ZZ Wand of Shards", type: "gear", system: { rarity: "epic", budget: 4, spells: [{ uuid, name: "Bone Shards", dc: 14, uses: { value: 1, max: 1, per: "short" } }] }
        }], { ...KNOWN });
        await bankMana(necro, 20);
        await bankEssence(necro, 2);
        const mana = manaOf(necro).value;
        canvas.tokens.setTargets([tokenOf(foe).id]);
        const sheet = await openSheet(necro);
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        const unpin = pinDie(19);
        const posted = nextCard(m => m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell", 40000);
        let card;
        try {
          sheet.changeTab("spells", "primary");
          await settle();
          const control = await until(() => sheet.element.querySelector(`.azeroth-item-spells li[data-item-id="${wand.id}"] [data-action="castItemSpell"]`), "the From items row's Cast");
          control.click();
          const dialog = await until(() => {
            const d = foundry.applications.instances.get(`azeroth-roll-${necro.id}`);
            return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
          }, "the item cast's dialog");
          const box = dialog.element.querySelector('input[name="tline-empower-potent"]');
          chai.ok(box && !box.disabled, "the item's casting draws Potent");
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
          dialog.element.querySelector('button[data-action="roll"]').click();
          card = await posted;
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
          await sheet.close();
        }
        chai.ok(card?.flags[SCOPE].viaItem, "an item's casting");
        chai.deepEqual(card.flags[SCOPE].empower?.picks, ["potent"], "the card records Potent");
        await until(() => essenceOf(necro).value === 1, "1 Essence spent");
        chai.equal(manaOf(necro).value, mana, "no Mana spent");
      });
    });

    describe("Flesh Offering's price, corpse and card row (SHOULD-FIX; O-412)", function () {
      it("the dialog draws the lower price, the corpse is destroyed, and the card names the saving", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Fix Flesh", { level: 5, spells: ["Bone Shards"], ranks: { "Flesh Offering": 1 } });
        const foe = await creature("Bandit", "Flesh Target");
        const dead = await creature("Bandit", "Flesh Corpse");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 600, y: 600, side: "hostile" }, { actor: dead, x: 300, y: 700, side: "hostile" }]);
        await kill(dead);
        await bankMana(necro, 10);
        const spell = necro.items.find(i => i.name === "Bone Shards");
        const talent = necro.items.find(i => i.type === "talent" && i.name === "Flesh Offering");
        canvas.tokens.setTargets([tokenOf(foe).id]);
        const sheet = await openSheet(necro);
        sheet.changeTab("spells", "primary");
        await settle();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        const unpin = pinDie(19);
        const posted = untilHook("createChatMessage", 40000, m => m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "spell").then(([m]) => { made.push(m); return m; });
        let card;
        try {
          sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`).click();
          const dialog = await until(() => {
            const d = foundry.applications.instances.get(`azeroth-roll-${necro.id}`);
            return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
          }, "the cast dialog");
          const price = () => dialog.element.querySelector("[data-mana-base]")?.textContent?.trim();
          chai.equal(price(), "3", "the price before the line");
          const box = dialog.element.querySelector('input[name="tline-flesh-offering"]');
          chai.ok(box && !box.disabled, "Flesh Offering is offered");
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
          chai.equal(price(), "2", "the drawn price follows the ticked line (O-412)");
          dialog.element.querySelector('button[data-action="roll"]').click();
          const app = await chooser(talent, 15000);
          await pick(app, "ZZ Flesh Corpse");
          card = await posted;
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
          await sheet.close();
        }
        chai.ok(card, "the cast posted its card");
        chai.equal(manaOf(necro).value, 8, "2 Mana paid, not 3");
        chai.equal(tokenOf(dead).document.getFlag(SCOPE, "corpse")?.state, "destroyed", "the corpse is destroyed");
        chai.include(textOf(card), talent.name, "the card names the offering");
      });
    });

    describe("the death watch, live (SHOULD-FIX)", function () {
      it("two Necromancers on one death each gain 1; a friendly creature gives none", async function () {
        this.timeout(120000);
        const a = await necromancerWith("ZZ Fix Watch A");
        const b = await necromancerWith("ZZ Fix Watch B");
        const foe = await creature("Kobold", "Watch Foe");
        const friend = await creature("Kobold", "Watch Friend");
        await sceneWith([{ actor: a, x: 200, y: 600 }, { actor: b, x: 200, y: 900 }, { actor: foe, x: 600, y: 700, side: "hostile" }, { actor: friend, x: 500, y: 1000 }]);
        await kill(friend);
        await sleep(1500);
        chai.equal(essenceOf(a).value + essenceOf(b).value, 0, "a friendly creature's death gives none");
        await kill(foe);
        await until(() => essenceOf(a).value === 1 && essenceOf(b).value === 1, "each Necromancer gains 1 from the one death");
      });

      it("in a started fight the tracker's sides decide, and the mark off and on gives once", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Fix Sides");
        const turncoat = await creature("Kobold", "Turncoat");
        const marked = await creature("Kobold", "Twice Marked");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: turncoat, x: 600, y: 600 }, { actor: marked, x: 600, y: 900, side: "hostile" }]);
        const combat = await fightWith([necro, turncoat, marked]);
        await combat.combatants.find(c => c.actorId === turncoat.id).setSide("hostile");
        await kill(turncoat);
        await until(() => essenceOf(necro).value === 1, "a friendly token on the other side of the fight is an enemy");
        const dead = CONFIG.specialStatusEffects.DEFEATED ?? "dead";
        await marked.toggleStatusEffect(dead, { active: true, overlay: true });
        await until(() => essenceOf(necro).value === 2, "the defeated mark gives 1");
        await marked.toggleStatusEffect(dead, { active: false });
        await sleep(500);
        await marked.toggleStatusEffect(dead, { active: true, overlay: true });
        await sleep(1500);
        chai.equal(essenceOf(necro).value, 2, "the mark laid again on a creature that never healed gives nothing");
        await combat.delete();
      });

      it("a death on a scene the GM is not viewing gives Essence, and a raised creature's fall is its own event", async function () {
        this.timeout(180000);
        const necro = await necromancerWith("ZZ Fix Unviewed");
        const foe = await creature("Kobold", "Unviewed Foe");
        const bones = await creature("Risen Skeleton", "Fix Raised");
        await sceneWith([{ actor: bones, x: 200, y: 600 }]);
        const away = await Scene.create({ name: "ZZ Fix Unviewed Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
        made.push(away);
        await necro.update({ "prototypeToken.actorLink": true });
        await away.createEmbeddedDocuments("Token", [
          await tokenData(necro, { x: 200, y: 600, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }),
          await tokenData(foe, { x: 600, y: 600, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })
        ]);
        chai.notEqual(canvas.scene?.id, away.id, "the GM views another scene");
        await kill(foe);
        await until(() => essenceOf(necro).value === 1, "a death on an unviewed scene gives 1");
        // One of the raised dead dropping to 0 hands its own event to the watch's listeners.
        await bones.setFlag(SCOPE, "bond", { kind: "raised", ownerUuid: necro.uuid, horde: true });
        const heard = [];
        const off = onDeath(event => { if (event.actor === bones) heard.push(event); });
        try {
          await kill(bones);
          await until(() => heard.some(e => e.raisedDown === true), "the raisedDown event");
        } finally {
          off();
        }
      });
    });

    /* ---------------------------------------------------------------- */
    /*  Fix run 3: the fix runs' review                                  */
    /* ---------------------------------------------------------------- */

    describe("a plague rising the GM's client refuses is offered again (MUST-FIX 2)", function () {
      it("the GM refuses the rising for the places; its Essence-free press is spent, and the next turn start offers it again", async function () {
        this.timeout(360000);
        // Intelligence 12 (+1): three places. Raise Dead fills two; the ghoul fits the third.
        const necro = await necromancerWith("ZZ Fix Reoffer", { level: 20, int: 12, spells: ["Plague of Undeath"] });
        const body = await corpse("Bandit", "Reoffer Corpse");
        const victim = await creature("Bandit", "Reoffer Plagued", { health: 20 });
        const other = await creature("Bandit", "Reoffer Bystander", { health: 40 });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }, { actor: victim, x: 700, y: 900, side: "hostile" }, { actor: other, x: 1500, y: 1500, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Reoffer Corpse")] });
        chai.lengthOf(hordeOf(necro), 2, "two skeletons");
        chai.equal(capacityOf(necro).total, 3, "Int 12: three places");
        await bankMana(necro);
        const card = await castWith(necro, "Plague of Undeath", { targets: [tokenOf(victim)] });
        chai.ok(card?.flags[SCOPE].success, "cast");
        const r = await pressCard(card, `[data-resist-owner="${victim.uuid}"] button[data-action="resistTest"]`, { face: 1 });
        await until(() => victim.effects.some(e => e.flags?.[SCOPE]?.plagueRise), "plagued");
        await r.release();
        await kill(victim);
        const corpseToken = () => tokenOf(victim)?.document ?? null;
        await until(() => corpseToken()?.getFlag(SCOPE, "plagueRising")?.casterUuid === necro.uuid, "the rising marked on its corpse");
        const firstOffer = nextCard(m => m.flags?.[SCOPE]?.offer === "rising", 60000);
        const combat = await fightWith([necro, other]);
        await nextTurnUntil(necro, combat);
        const offer = await firstOffer;
        chai.isTrue(corpseToken().getFlag(SCOPE, "plagueRising").offered, "offered at the turn start");
        // **BETWEEN THE PRESS AND THE GM'S HANDLER THE PLACES FALL** (Intelligence to 8: two places,
        // both full). The bestiary read inside the GM's raise is held until the write has landed, so
        // the handler judges the places as they stand then - the race the review named, made certain.
        const pack = game.packs.get("azeroth-rpg.bestiary");
        let held = false;
        pack.getIndex = async function (...args) {
          if (!held) {
            held = true;
            await necro.update({ "system.abilities.int.value": 8 });
            await until(() => capacityOf(necro).total === 2, "two places");
          }
          return Object.getPrototypeOf(pack).getIndex.apply(pack, args);
        };
        let infos = [];
        const infoBefore = ui.notifications.info.bind(ui.notifications);
        ui.notifications.info = (msg, ...rest) => { infos.push(String(msg)); return infoBefore(msg, ...rest); };
        let said;
        try {
          said = await saying(async () => {
            const p = await pressCard(offer, 'button[data-action="hordeRise"]');
            await until(() => held && corpseToken()?.getFlag(SCOPE, "plagueRising")?.offered === false, "the rising put back to not offered", 30000);
            await sleep(800);
            await p.release();
          });
        } finally {
          delete pack.getIndex;
          ui.notifications.info = infoBefore;
        }
        chai.isTrue(held, "the GM's raise read the bestiary");
        chai.isFalse(hordeOf(necro).some(x => x.name === "Plagued Ghoul"), "nothing rose");
        chai.ok(said.warned.length, `the refusal said in words: ${said.warned.join(" | ") || "none"}`);
        chai.ok(infos.some(i => i.includes(game.i18n.format("AZEROTH.Horde.RisingReoffered", { name: corpseToken().name, owner: necro.name }))), `the offer again said in words: ${infos.join(" | ")}`);
        chai.isUndefined(corpseToken().getFlag(SCOPE, "corpse"), "the corpse is open again");
        // The places mended, the next turn start posts a fresh card, and its press stands the ghoul.
        await necro.update({ "system.abilities.int.value": 12 });
        await until(() => capacityOf(necro).total === 3, "three places again");
        const again = nextCard(m => m.flags?.[SCOPE]?.offer === "rising" && m.id !== offer.id, 60000);
        await nextTurnUntil(other, combat);
        await nextTurnUntil(necro, combat);
        const fresh = await again;
        chai.equal(fresh.flags[SCOPE].corpse.tokenId, corpseToken().id, "the same corpse is offered again");
        const rose = nextCard(m => m.flags?.[SCOPE]?.featureKey === "horde:rise", 60000);
        const p2 = await pressCard(fresh, 'button[data-action="hordeRise"]');
        await rose;
        await p2.release();
        await until(() => hordeOf(necro).some(x => x.name === "Plagued Ghoul"), "the ghoul stands from the offer made again");
        await combat.delete();
      });
    });

    describe("Far-reaching at Heat Mirage's and Mindstatic's point pickers (the 4a review's SHOULD-FIX)", function () {
      it("Heat Mirage's anchor 90 feet off a 60 ft Range lands with Far-reaching ticked", async function () {
        this.timeout(300000);
        // Mage 5 (tier 2: the character's level is its highest class's) and Necromancer 2.
        const caster = await necromancerWith("ZZ Fix Mirage", { classes: [["Mage", 5], ["Necromancer", 2]], spells: ["Heat Mirage"] });
        await sceneWith([{ actor: caster, x: 300, y: 600 }]);
        await canvas.animatePan({ x: 1300, y: 650, scale: 0.5, duration: 0 });
        await settle();
        await bankMana(caster);
        await bankEssence(caster, 1);
        const aim = { x: centreOf(caster).x + 90 * FT, y: centreOf(caster).y };
        const { value: card, warned } = await saying(async () => {
          const pending = castFromSheet(caster, "Heat Mirage", { face: 18, ms: 120000, lines: ["empower-farReaching"] });
          // A cast that settles before its dialogs says why (its own throw, or its warnings), never a bare timeout.
          const early = pending.then(c => { throw new Error(`the cast settled before its dialogs: ${c ? "a card" : "no card"}`); });
          await Promise.race([answerUtility({ objectLabel: "ZZ Fix wagon far off", imageDescription: "A stationary wagon" }), early]);
          await Promise.race([until(pickActive, "Heat Mirage's anchor pick armed", 30000), early]);
          pressBoard(aim);
          await Promise.race([answerUtility({ eligible: true, reach: true, anchorConfirmed: true }), early]);
          await Promise.race([answerFilePicker("icons/svg/fire.svg"), early]);
          early.catch(() => {});
          return pending;
        });
        chai.ok(card, `no card; warnings: ${warned.join(" | ") || "none"}`);
        chai.ok(card?.flags[SCOPE].success, "Heat Mirage posted its card");
        chai.equal(card.flags[SCOPE].empower?.farReaching, true, "the card records Far-reaching");
        chai.closeTo(card.flags[SCOPE].areaAt?.x ?? 0, aim.x, 1, "the anchor 90 feet off, inside the doubled 120");
        await game.system.azeroth.workflows.endAllSustains?.({ actor: caster }).catch(() => {});
      });

      // Mindstatic is a Priest's spell and a Necromancer never multiclasses with a Priest: this one
      // holds it as a spell the GM taught (the fixture's embed is the teach-anyway's own bypass).
      it("Mindstatic's point 50 feet off a 30 ft Range lands with Far-reaching ticked", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Static", { level: 11, spells: ["Mindstatic"] });
        await sceneWith([{ actor: necro, x: 300, y: 600 }]);
        await canvas.animatePan({ x: 1000, y: 650, scale: 0.5, duration: 0 });
        await settle();
        await bankMana(necro);
        await bankEssence(necro, 1);
        const aim = { x: centreOf(necro).x + 50 * FT, y: centreOf(necro).y };
        const { value: card, warned } = await saying(async () => {
          const pending = castFromSheet(necro, "Mindstatic", { face: 18, ms: 90000, lines: ["empower-farReaching"] });
          await until(pickActive, "Mindstatic's point pick armed", 30000);
          pressBoard(aim);
          // The GM's review of the boundary (stage 9's shape), before the payment.
          await answerUtility({ stationary: true, placement: true });
          return pending;
        });
        chai.ok(card, `no card; warnings: ${warned.join(" | ") || "none"}`);
        chai.ok(card?.flags[SCOPE].success, "Mindstatic posted its card");
        chai.equal(card.flags[SCOPE].empower?.farReaching, true, "the card records Far-reaching");
        chai.closeTo(card.flags[SCOPE].areaAt?.x ?? 0, aim.x, 1, "the point 50 feet off, inside the doubled 60");
        await game.system.azeroth.workflows.endAllSustains?.({ actor: necro }).catch(() => {});
      });
    });

    describe("Lasting on Enslave the Dead and Plague of Undeath (D-1087), live", function () {
      it("Enslave the Dead with Lasting holds its creature two hours, and hands it back after", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Slave Lasting", { level: 17, spells: ["Enslave the Dead"] });
        const skel = await creature("Risen Skeleton", "Lasting Thrall");
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: skel, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        const card = await castWith(necro, "Enslave the Dead", { targets: [tokenOf(skel)], lines: ["empower-lasting"] });
        chai.equal(card?.flags[SCOPE].empower?.lasting, true, "the card records Lasting");
        const { release } = await pressCard(card, `[data-resist-owner="${skel.uuid}"] button[data-action="resistTest"]`, { face: 1 });
        const control = await until(() => skel.effects.find(e => e.flags?.[SCOPE]?.enslaved), "the control laid");
        await release();
        chai.equal(control.duration.seconds, 7200, "two hours, doubled from one");
        await game.time.advance(3610);
        await sleep(1500);
        chai.ok(skel.effects.some(e => e.flags?.[SCOPE]?.enslaved), "still held after the first hour");
        await game.time.advance(3600);
        await until(() => !skel.effects.some(e => e.flags?.[SCOPE]?.enslaved), "handed back after the second", 30000);
        await until(() => tokenOf(skel).document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE, "back on its own side");
      });

      it("Plague of Undeath with Lasting lays its tick and its rising mark for twenty rounds", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Plague Lasting", { level: 20, spells: ["Plague of Undeath"] });
        const victim = await creature("Bandit", "Lasting Plagued", { health: 30 });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: victim, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        const card = await castWith(necro, "Plague of Undeath", { targets: [tokenOf(victim)], lines: ["empower-lasting"] });
        chai.equal(card?.flags[SCOPE].empower?.lasting, true, "the card records Lasting");
        const now = game.time.worldTime;
        const { release } = await pressCard(card, `[data-resist-owner="${victim.uuid}"] button[data-action="resistTest"]`, { face: 1 });
        const carrier = await until(() => victim.effects.find(e => e.flags?.[SCOPE]?.plagueRise), "plagued");
        await release();
        chai.equal(carrier.flags[SCOPE].tick.rounds, 20, "the tick counts twenty rounds, doubled from ten");
        chai.closeTo(carrier.flags[SCOPE].plagueRise.until - now, 20 * (CONFIG.time?.roundTime ?? 6), 6, "a death rises a ghoul for twenty rounds");
        chai.equal(carrier.duration.seconds, 20 * ROUND_SECONDS, "the carrier's span out of a fight: twenty rounds of the clock");
      });
    });

    describe("Plague Bladder's Poisoned and Grave Guard's overflow under Icebound, live", function () {
      it("a failed Plague Bladder Test lays Poisoned 1 carrying the Spell DC it is shed at", async function () {
        this.timeout(300000);
        const necro = await necromancerWith("ZZ Fix Bladder", { level: 11, spells: ["Stitch Abomination"], ranks: { "Surgeon's Hand": 2 } });
        const foe = await creature("Bandit", "Bladder Foe", { health: 60 });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: foe, x: 850, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await bankEssence(necro, 1);
        setStitchPick(() => ({ x: 750, y: 650 }));
        try {
          await castWith(necro, "Stitch Abomination", { steps: [app => tick(app, ["Plague Bladder"])] });
        } finally {
          setStitchPick(null);
        }
        const abom = hordeOf(necro).find(x => x.name === "Abomination");
        chai.ok(abom, "the Abomination stands");
        const asked = nextCard(m => m.flags?.[SCOPE]?.kind === "graftTest" && m.flags[SCOPE].graftTest.graft === "plagueBladder", 60000);
        const combat = await fightWith([necro, abom, foe]);
        await nextTurnUntil(foe, combat);
        const test = await asked;
        const { release } = await pressCard(test, 'button[data-action="resistTest"][data-purpose="graft"]', { face: 1 });
        const poisoned = await until(() => foe.effects.find(e => e.statuses?.has?.("poisoned") && e.flags?.[SCOPE]?.shedDc), "Poisoned, carrying its shed DC");
        await release();
        chai.equal(poisoned.getFlag(SCOPE, "value"), 1, "Poisoned 1");
        chai.equal(poisoned.flags[SCOPE].shedDc.dc, necro.system.spellDC, "shed at the Necromancer's Spell DC");
        await combat.delete();
      });

      // Icebound Fortitude is a Death Knight's (04) and a Necromancer never multiclasses with one, so the
      // STATE the knight's yes lays is laid here by hand: it is what the damage door reads.
      it("Grave Guard's overflow reaches the Necromancer as its record, and Icebound halves it off that record", async function () {
        this.timeout(300000);
        const necro = await necromancerWith("ZZ Fix Guard Ice", { level: 11 });
        const body = await corpse("Bandit", "Guard Ice Corpse");
        const brute = await creature("Bandit", "Guard Ice Brute", { health: 30 });
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: body, x: 500, y: 600, side: "hostile" }, { actor: brute, x: 200, y: 600, side: "hostile" }]);
        await bankMana(necro);
        await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Guard Ice Corpse")] });
        const [skel] = hordeOf(necro);
        await tokenOf(skel).document.update({ x: 400, y: 600 });
        await sleep(800);
        await skel.update({ "system.health.temp": 0, "system.health.max": 1, "system.health.value": 1 });
        const { DK_FLAGS, iceboundBlow } = await import("../rules/death-knight-talents.mjs");
        await necro.createEmbeddedDocuments("ActiveEffect", [{ name: "Icebound Fortitude", img: "icons/svg/ice-shield.svg", origin: necro.uuid, flags: { [SCOPE]: { [DK_FLAGS.icebound]: { name: "Icebound Fortitude" } } } }]);
        const attack = await npcAttacks(brute, "Hand axe", necro);
        const row = attack.flags[SCOPE].damageByTarget?.[0] ?? null;
        chai.ok(row?.mitigationSource, "the attack card recorded the blow's resolver inputs");
        // The expected landing, worked out here off the same record through the pure laws.
        const { recordOf, resolveRecord, graveGuardRecord } = await import("../rules/blow-records.mjs");
        const { graveGuardInput, graveGuardSplit } = await import("../rules/necromancer-features.mjs");
        const { wardBySchool } = await import("../rules/ward.mjs");
        const { schoolArmorBySchool } = await import("../rules/auras.mjs");
        const record = recordOf(row.mitigationSource);
        const input = graveGuardInput(record.input, {
          apByLocation: skel.system.ap ?? {}, wardBySchool: wardBySchool(skel.system.ward), schoolArmorBySchool: schoolArmorBySchool(skel.system.schoolArmor),
          immune: skel.system.immune ?? [], vulnerable: skel.system.vulnerable ?? []
        });
        const met = resolveRecord({ ...record, input });
        const split = graveGuardSplit({ damage: met.damage, health: 1, temp: 0 });
        chai.isAbove(split.overflow, 1, "the blow passes the servant's 1 Health with something to halve");
        const overflowRecord = graveGuardRecord({ ...record, input }, { room: 1 });
        const iced = iceboundBlow({ amount: split.overflow, input: overflowRecord.input, resolve: inp => resolveRecord(overflowRecord, inp) });
        chai.isAbove(iced.cut, 0, "Icebound cuts the overflow");
        const before = health(necro);
        const { release } = await pressCard(attack, '[data-action="applyDamage"]');
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && String(a.id).startsWith("azeroth-grave-guard-")) ?? null, "Grave Guard's question");
        ask.element.querySelector(`button[data-action="r:${skel.id}"]`).click();
        await until(() => health(necro) < before, "the overflow to land on the Necromancer");
        await release();
        await sleep(800);
        chai.equal(before - health(necro), split.overflow - iced.cut, `the overflow ${split.overflow}, halved off its record (cut ${iced.cut})`);
      });
    });

    describe("Enslave the Dead on a creature bound to another character (the lead's Q3)", function () {
      it("takes control of a Death Knight's raised skeleton, leaves its bond untouched, and hands it back", async function () {
        this.timeout(240000);
        const necro = await necromancerWith("ZZ Fix Slave Other", { level: 17, spells: ["Enslave the Dead"] });
        const knight = await makeCharacter({ name: "ZZ Fix Other Knight", classes: [["Death Knight", 5]], race: "Human" });
        const skel = await creature("Risen Skeleton", "Other Knight's Skeleton");
        const bond = { kind: "raised", ownerUuid: knight.uuid };
        await skel.setFlag(SCOPE, "bond", bond);
        await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: skel, x: 700, y: 600, side: "hostile" }]);
        await bankMana(necro);
        const card = await castWith(necro, "Enslave the Dead", { targets: [tokenOf(skel)] });
        chai.ok(card?.flags[SCOPE].success, "cast: a bound creature is a target");
        const { release } = await pressCard(card, `[data-resist-owner="${skel.uuid}"] button[data-action="resistTest"]`, { face: 1 });
        await until(() => skel.effects.some(e => e.flags?.[SCOPE]?.enslaved), "the control laid");
        await release();
        chai.deepEqual(bondOf(skel), bond, "its bond to the knight is untouched");
        await game.time.advance(3610);
        await until(() => !skel.effects.some(e => e.flags?.[SCOPE]?.enslaved), "handed back after the hour", 30000);
        chai.isTrue(game.actors.has(skel.id), "never deleted");
        chai.deepEqual(bondOf(skel), bond, "still the knight's");
      });
    });
  });
}
