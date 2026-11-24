/**
 * **THE SOVEREIGN'S LIVE-TEST GAPS, CLOSED THROUGH THE REAL CONTROLS** (the San'layn and Sovereign plan's C.4;
 * the gaps the FEATURES, SPELLS and CORE agents named in their reports; O-438, O-439, O-444). Every Use is pressed
 * from the sheet, every spell cast from the sheet's own Cast, every Resist, offer and reaction from its card,
 * every dialog answered through its own control, with the die pinned through `fixtures.mjs#pinDie`.
 *
 * Batch `azeroth-rpg.sovereign-gaps`, run alone.
 */

import { cleanup, dialogFor, fromPack, give, made, makeCharacter, makeNpc, openSheet, pinDie, PACK_FOR, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, featureNamed, fightWith, freshTurn, pick, pressCard, pressUse, sceneWith, talentNamed, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { board, cast, castOk, resist } from "./quench-necromancer-spells.mjs";
import { npcAttacks } from "./quench-necromancer-review.mjs";
import { LEASH_FLAG } from "../effects/sovereign-spells.mjs";
import { BLOOD_CURSE_FLAG, LOOK_FLAG, OATH_FLAG, UNFADING_FLAG } from "../rules/sovereign-spells.mjs";
import { INSOLENCE_FLAG } from "../rules/sovereign-talents.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const health = actor => actor.system.health.value;
const sov = () => game.system.azeroth.sovereign;
const feats = () => game.system.azeroth.sovereignFeatures;
const lastMessage = pred => [...game.messages].reverse().find(pred) ?? null;
const offerCard = (s, offer, after = 0) => until(() => lastMessage(m => m.flags?.[SCOPE]?.kind === "sovOffer" && m.flags[SCOPE].sovereignUuid === s.uuid
  && m.flags[SCOPE].offer === offer && (m.timestamp ?? 0) >= after), `the ${offer} offer`);

/** A San'layn Sovereign at a level, these talents at these ranks, these spells known (embedded past the door as fixtures may). */
async function sovereignWith(name, { level = 20, ranks = {}, spells = [], weapons = [], abilities = { con: 16, cha: 16, dex: 14, str: 10 } } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", abilities, spells, weapons });
  await s._talentGrant;
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(s, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  for (const w of weapons) {
    const item = s.items.find(i => i.type === "weapon" && i.name === w);
    if (item) await item.update({ "system.equipped": true });
  }
  // 02 §7: *You start with full Vitae* (the creator fills it; a fixture does not).
  await setPool(s, "vitae", vitaeOf(s).max);
  return s;
}

/** A pool set by a GM's hand (the named `hand` door). */
async function setPool(actor, which, value) {
  const pool = which === "vitae" ? vitaeOf(actor) : tributeOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value }, {}, { vitaeGain: "hand", tributeGain: "hand" });
  await until(() => (which === "vitae" ? vitaeOf(actor) : tributeOf(actor)).value === Math.min(value, pool.max), `${which} set`);
}

/** A creature from the bestiary at a known Health, named for the test. */
async function creature(entry, name, hp = 60) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "system.health.max": hp, "system.health.value": hp });
  return npc;
}

/** The character's weapon Attack pressed on the sheet's Combat tab at a target; the attack card. */
async function attackFromSheet(actor, weaponName, target, { face = 20, dialog = null } = {}) {
  const weapon = actor.items.find(i => i.type === "weapon" && i.name === weaponName);
  if (!weapon) throw new Error(`${actor.name} holds no ${weaponName}`);
  canvas.tokens?.setTargets([tokenOf(target).id]);
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, dialog ? "always" : "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack")
    .then(([card]) => { made.push(card); return card; });
  try {
    const control = await until(() => sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`), `${weaponName}'s Attack`);
    control.click();
    if (dialog) {
      const d = await until(() => dialogFor(actor, 500), `${weaponName}'s roll dialog`, 15000);
      await dialog(d);
      d.element.querySelector('button[data-action="roll"]').click();
    }
    return await posted;
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Press an attack card's Apply damage for a row; the Health it took. */
async function applyRow(card, index, victim, { face = null } = {}) {
  const before = health(victim);
  const p = await pressCard(card, `button[data-action="applyDamage"][data-target-index="${index}"]`, face === null ? {} : { face });
  try { await until(() => health(victim) !== before, `${victim.name}'s Health to move`, 15000); } finally { await p.release(); }
  return before - health(victim);
}

/** The words dialog a cast asks (Royal Herald, Oath of Fealty), answered through its own button. */
const words = text => async () => {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.querySelector('input[name="words"]')), "the words dialog", 15000);
  app.element.querySelector('input[name="words"]').value = text;
  app.element.querySelector('button[data-action="ok"]').click();
};

/** The one chooser for a spell, answered with a name. */
const choose = name => async spell => pick(await chooser(spell, 15000), name);

/** A whispered card for this caster naming a press, waited for. */
const pressedCard = (press, after) => until(() => lastMessage(m => m.flags?.[SCOPE]?.sovereignCard?.press === press && (m.timestamp ?? 0) >= after), `the ${press} card`, 20000);

/** A Sovereign spell cast from the sheet's Cast with the roll dialog open and its Swift Hunger box ticked. */
async function castSwift(actor, spellName, target, { face = 19 } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  canvas.tokens?.setTargets([tokenOf(target).id]);
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const control = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
    ?? sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  let card = null;
  let swiftOffered = false;
  const said = await warnings(async () => {
    control.click();
    const dialog = await until(() => {
      const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
      return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
    }, `${spellName}'s roll dialog`);
    const box = dialog.element.querySelector('input[name="swift"]');
    swiftOffered = Boolean(box) && !box.disabled;
    if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    dialog.element.querySelector('button[data-action="roll"]').click();
    card = await posted;
  });
  unpin();
  canvas.tokens?.setTargets([]);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  await sheet.close();
  return { card, said, swiftOffered };
}

/** Shared before/after: the roll dialog skipped, every window, fight and scene the batch made gone. */
function standUp(context) {
  const { before, after } = context;
  const held = {};
  let restoreText = null;
  before(async function () {
    this.timeout(120000);
    const index = await game.packs.get("azeroth-rpg.classes").getIndex();
    if (!index.some(e => e.name === "Sovereign")) throw new Error("the classes pack holds no Sovereign: rebuild the packs");
    held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
    held.viewing = canvas?.scene ?? null;
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
    restoreText = await quietScrollingText();
  });
  after(async function () {
    this.timeout(180000);
    const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | sovereign-gaps teardown (${what}): ${err?.message ?? err}`); } };
    await restore("the pick", () => feats()?.setSovereignPick?.(null));
    await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
    await restore("the windows", async () => {
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-sov-words-")) await app.close().catch(() => {});
      }
    });
    await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog));
    await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
    await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
    await cleanup();
    await restoreText?.();
    if (held.viewing && game.scenes.has(held.viewing.id)) await restore("the view", () => held.viewing.view());
  });
}

export function sovereignGapsBatch(context) {
  const { describe, it, assert } = context;

  describe("The Sovereign's features and talents, the gaps (02 §7, 04; C.4)", function () {
    standUp(context);

    it("Mirrored Self, pressed on the incoming attack card: no damage, 3 Tribute, a 15 ft step, and once per encounter", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Mirrored", { ranks: { "Mirrored Self": 1 } });
      const foe = await creature("Alliance Footman", "Gap Mirrored Footman");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "tribute", 4);
      const mirrored = await until(() => featureNamed(s, "Mirrored Self"), "Mirrored Self granted");
      const hp = health(s);
      feats().setSovereignPick(() => ({ to: { x: 1000, y: 1300 } }));
      try {
        const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
        const used = untilHook("createChatMessage", 30000, m => m.speaker?.actor === s.id && m.flags?.[SCOPE]?.kind === "feature" && m.flags[SCOPE].featureKey === "mirrored-self")
          .then(([m]) => { made.push(m); return m; });
        const p = await pressCard(attack, `button[data-action="reactNegate"][data-target-index="0"][data-feature-id="${mirrored.id}"]`);
        try { assert.ok(await used, "Mirrored Self's card posted"); } finally { await p.release(); }
        await until(() => tokenOf(s).document.y === 1300, "the Sovereign stepped 15 feet");
        await until(() => tributeOf(s).value === 1, "3 Tribute spent");
        // The negated blow lands nothing: the card's Apply finds the mark spent.
        const press = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]').catch(() => null);
        await sleep(1500);
        await press?.release?.();
        assert.equal(health(s), hp, "the negated blow dealt no damage");
        assert.equal(featureNamed(s, "Mirrored Self").system.uses?.value ?? 0, 0, "the encounter's one use is spent");
        // A second blow this encounter: the reaction is spent, said in words or drawn greyed.
        const second = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
        const button = document.querySelector(`#chat [data-message-id="${second.id}"] button[data-action="reactNegate"][data-feature-id="${mirrored.id}"]`);
        if (button && !button.disabled) {
          const said = await warnings(async () => { const q = await pressCard(second, `button[data-action="reactNegate"][data-target-index="0"][data-feature-id="${mirrored.id}"]`); await sleep(1500); await q.release(); });
          assert.ok(said.length > 0, "a second Mirrored Self this encounter is refused in words");
        }
        assert.equal(tributeOf(s).value, 1, "nothing more spent");
      } finally {
        feats().setSovereignPick(null);
      }
    });

    it("Example to Others: a cursed creature drops, the offer is pressed, the spread Test fails and the curse lands with no Vitae spent", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Example", { ranks: { "Example to Others": 1 } });
      const dead = await creature("Bandit", "Gap Example Fallen", 20);
      const next = await creature("Bandit", "Gap Example Next", 20);
      await sceneWith([{ actor: s, x: 800, y: 1000 }, { actor: dead, x: 1300, y: 1000, side: "hostile" }, { actor: next, x: 1400, y: 1000, side: "hostile" }]);
      await feats().layBloodCurse(s, dead, { name: "Decree of Frailty", repeat: { resilience: "spirit", dc: 15 } });
      await until(() => dead.effects.some(e => e.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]), "the curse on the first");
      await setPool(s, "vitae", 30);
      const t0 = Date.now() - 1000;
      await dead.applyDamage(40, { struck: true, attack: true, by: s });
      const offer = await offerCard(s, "example", t0);
      const prompted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.purpose === "sovSpread").then(([m]) => { made.push(m); return m; });
      const r = await pressCard(offer, `button[data-sovereign-offer="example"][data-target="${tokenOf(next).document.uuid}"]`);
      const prompt = await prompted;
      await r.release();
      const q = await pressCard(prompt, 'button[data-action="resistTest"]', { face: 1 });
      await until(() => next.effects.some(e => e.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]), "the curse spread to the second");
      await q.release();
      assert.equal(vitaeOf(s).value, 30, "the spread costs no Vitae (R33)");
    });

    it("Swift Hunger through the cast dialog: Shadow Lance at 5 ft as a Half-Action for 17 Vitae; at 10 ft and a second time in the round, refused in words", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Swift", { level: 11, ranks: { "Swift Hunger": 1 }, spells: ["Shadow Lance"] });
      const near = await creature("Bandit", "Gap Swift Near");
      const far = await creature("Bandit", "Gap Swift Far");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }, { actor: far, x: 1000, y: 1200, side: "hostile" }]);
      const combat = await fightWith([s, near, far]);
      let mine = await freshTurn(s, 2);
      await setPool(s, "vitae", 40);
      const halves = () => mine.budget?.halfActions ?? 0;
      const before = halves();
      const done = await castSwift(s, "Shadow Lance", near);
      assert.isTrue(done.swiftOffered, "the cast dialog offers Swift Hunger's Half-Action");
      assert.ok(done.card, `the Half-Action cast posted (Half-Actions before ${before}; ${done.said.join(" | ")})`);
      await until(() => vitaeOf(s).value === 23, "14 + 3 Vitae spent");
      await until(() => halves() === 1, "one Half-Action spent, one left");
      // A second time in the round the dialog greys the line (its reason drawn beside it), so the cast asks the action
      // it costs - and one Half-Action is left, which is refused in words.
      const again = await castSwift(s, "Shadow Lance", near);
      assert.isFalse(again.swiftOffered, "the dialog greys Swift Hunger once the round's use is spent");
      assert.isNull(again.card, "a second Swift Hunger in the round is refused");
      assert.ok(again.said.length > 0, `refused in words (${again.said.join(" | ")})`);
      assert.equal(vitaeOf(s).value, 23, "nothing spent on the refusal");
      // The next round: a creature 10 feet away is out of reach.
      await freshTurn(s, 2);
      mine = combat.getCombatantsByActor(s)[0];
      const farTry = await castSwift(s, "Shadow Lance", far);
      assert.isNull(farTry.card, "a creature 10 feet away is refused");
      assert.ok(farTry.said.some(w => /reach/.test(w)), `refused in words (Half-Actions ${halves()}; ${farTry.said.join(" | ")})`);
      assert.equal(vitaeOf(s).value, 23, "nothing spent on the refusal");
    });

    it("Crimson Flourish: after Sovereign's Kiss (a Half-Action) the next sword Attack carries its Boon; after Bloodbolt (an action) it does not", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Flourish", { level: 5, ranks: { "Crimson Flourish": 1 }, spells: ["Sovereign's Kiss"], weapons: ["Dagger"] });
      const foe = await creature("Bandit", "Gap Flourish Bandit", 80);
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      // A promise to the next attack is held to a fight's round (`rules/next-attack.mjs`: out of a fight nothing is laid).
      await fightWith([s, foe]);
      await setPool(s, "vitae", 30);
      const flourishHeld = () => (s.getFlag(SCOPE, "nextAttack") ?? []).some(e => e?.name === "Crimson Flourish");
      await freshTurn(s, 2);
      await castOk(s, "Sovereign's Kiss", { targets: [foe] });
      await until(flourishHeld, "the Half-Action Death spell lays the Boon");
      const boon = await attackFromSheet(s, "Dagger", foe);
      assert.include(textOf(boon), "Crimson Flourish", "the attack after a Half-Action Death spell names Crimson Flourish's Boon");
      await until(() => !flourishHeld(), "the attack took the Boon");
      await freshTurn(s, 2);
      await castOk(s, "Bloodbolt", { targets: [foe] });
      await sleep(1500);
      assert.isFalse(flourishHeld(), "an action spell lays no Boon");
    });

    it("Insolence Repaid: a miss gives a Boon on the next attack at that creature; at rank 2 an Intimidation Test at it takes the Boon instead (O-444)", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Insolence", { ranks: { "Insolence Repaid": 2 }, weapons: ["Dagger"] });
      const foe = await creature("Alliance Footman", "Gap Insolent Footman", 80);
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const promised = () => (s.getFlag(SCOPE, INSOLENCE_FLAG) ?? []).some(p => p?.against === foe.uuid);
      await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 1 });
      await until(promised, "the miss lays the promise");
      // Rank 2: the Intimidation Test at the creature that missed draws the Boon, checked, and takes the promise.
      canvas.tokens?.setTargets([tokenOf(foe).id]);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      const sheet = await openSheet(s);
      try {
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === s.id).then(([m]) => { made.push(m); return m; });
        sheet.element.querySelector('[data-action="rollSkill"][data-skill="intimidation"]').click();
        const dialog = await until(() => dialogFor(s, 500), "the Intimidation dialog", 15000);
        const line = [...dialog.element.querySelectorAll("input[type=checkbox]")].find(b => (b.closest("label")?.textContent ?? "").includes("Insolence Repaid"));
        assert.ok(line, "the skill dialog draws Insolence Repaid's Boon");
        assert.isTrue(line.checked, "the Boon comes checked: the creature's own miss");
        const unpin = pinDie(10);
        let skillCard = null;
        try { dialog.element.querySelector('button[data-action="roll"]').click(); skillCard = await posted; } finally { unpin(); }
        assert.equal(Number(skillCard?.rolls?.[0]?.options?.boons ?? 0), 1, "the Intimidation Test rolled with the Boon");
      } finally {
        await sheet.close();
        canvas.tokens?.setTargets([]);
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      }
      await until(() => !promised(), "the skill Test took the promise");
      const boonsOf = card => Number(card?.rolls?.[0]?.options?.boons ?? 0);
      const after = await attackFromSheet(s, "Dagger", foe);
      assert.equal(boonsOf(after), 0, "the following attack takes no Boon");
      // Rank 1's attack lane: a fresh miss, then the attack carries it.
      await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 1 });
      await until(promised, "a second miss lays a second promise");
      const boon = await attackFromSheet(s, "Dagger", foe);
      assert.equal(boonsOf(boon), 1, "the attack at the creature that missed carries the one Boon");
      await until(() => !promised(), "the attack took the promise");
    });

    it("Royal Due once a turn: the first blow on the prey offers it and the press lands; the second blow that turn offers nothing", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Due", { level: 5 });
      const foe = await creature("Bandit", "Gap Due Bandit", 80);
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await freshTurn(s, 2);
      await sov().markPrey(s, tokenOf(foe));
      await setPool(s, "tribute", 5);
      const t0 = Date.now() - 1000;
      await foe.applyDamage(3, { struck: true, attack: true, by: s });
      const offer = await offerCard(s, "royalDue", t0);
      const r = await pressCard(offer, 'button[data-sovereign-offer="royalDue"]');
      await until(() => tributeOf(s).value === 3, "2 Tribute spent");
      await r.release();
      const t1 = Date.now();
      await foe.applyDamage(3, { struck: true, attack: true, by: s });
      await sleep(2500);
      const second = lastMessage(m => m.flags?.[SCOPE]?.kind === "sovOffer" && m.flags[SCOPE].offer === "royalDue" && m.flags[SCOPE].sovereignUuid === s.uuid && (m.timestamp ?? 0) >= t1);
      assert.isNull(second, "a second Royal Due this turn is not offered");
      assert.equal(tributeOf(s).value, 3, "nothing more spent");
    });

    it("Sanguine Edge on a real hit: the same pinned sword blow deals the tier more as Shadow once the edge is laid", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Edge", { ranks: { "Sanguine Edge": 1 }, weapons: ["Dagger"] });
      const foe = await creature("Bandit", "Gap Edge Bandit", 120);
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "vitae", 10);
      const plain = await attackFromSheet(s, "Dagger", foe, { face: 18 });
      const d1 = await applyRow(plain, 0, foe);
      await (await pressUse(s, "Sanguine Edge")).card;
      await until(() => s.effects.some(e => e.flags?.[SCOPE]?.sanguineEdge), "the edge laid");
      assert.equal(vitaeOf(s).value, 8, "2 Vitae spent");
      const edged = await attackFromSheet(s, "Dagger", foe, { face: 18 });
      const d2 = await applyRow(edged, 0, foe);
      assert.equal(d2 - d1, s.system.tier, `the edged blow deals the tier (${s.system.tier}) more: ${d1} then ${d2}`);
    });
  });

  describe("The Sovereign's spells, the gaps (07 §17; C.4)", function () {
    standUp(context);

    it("Captivating Gaze's leash, walked live: 10 ft is allowed, 15 ft is refused in words, and a push is never refused", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Gaze", { level: 5, spells: ["Captivating Gaze"] });
      const foe = await creature("Bandit", "Gap Gazed Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "vitae", 20);
      const card = await castOk(s, "Captivating Gaze", { targets: [foe] });
      await resist(card, 0, 1);
      const leash = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.[LEASH_FLAG]), "the leash laid");
      assert.equal(leash.flags[SCOPE][LEASH_FLAG].feet, 10, "held at 10 feet (R62)");
      await tokenOf(foe).document.update({ x: 1200 });
      await until(() => tokenOf(foe).document.x === 1200, "a walk to 10 feet is allowed");
      const said = await warnings(async () => { await tokenOf(foe).document.update({ x: 1300 }); await sleep(900); });
      assert.equal(tokenOf(foe).document.x, 1200, "a walk to 15 feet is refused");
      assert.ok(said.length > 0, `refused in words (${said.join(" | ")})`);
      // A push through the one forced-movement door (D-778), 20 feet straight away from the caster.
      const { forceMove } = await import("../effects/forced-movement.mjs");
      const pushed = await forceMove({ token: tokenOf(foe).document, from: tokenOf(s).center, feet: 20, toward: "away", by: s, name: "ZZ push" });
      assert.isTrue(pushed.moved, `the push moved the leashed creature (${pushed.reason ?? "no reason"})`);
      await until(() => tokenOf(foe).document.x >= 1500, "a push is never refused by the leash");
    });

    it("Mirror of Self: a hit's Apply asks the Reaction, the yes casts it for 7 Vitae and 8 temporary Health takes the blow first", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Mirror", { level: 5, spells: ["Mirror of Self"] });
      const foe = await creature("Alliance Footman", "Gap Mirror Footman");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await setPool(s, "vitae", 20);
      const hp = health(s);
      const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
      const t0 = Date.now() - 500;
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]', { face: 19 });
      try {
        const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && (a.element?.textContent ?? "").includes("Mirror of Self") && a.element.querySelector('button[data-action="yes"]')), "the Mirror of Self ask", 15000);
        ask.element.querySelector('button[data-action="yes"]').click();
        await until(() => vitaeOf(s).value === 13, "7 Vitae spent");
        const granted = game.i18n.format("AZEROTH.SovSpell.Mirror.Granted", { name: s.name, n: 8 });
        await until(() => lastMessage(m => (m.timestamp ?? 0) >= t0 && textOf(m).includes(granted)), "the 8 temporary Health granted before the blow");
        await until(() => health(s) < hp || (s.system.health.temp ?? 0) < 8, "the blow met the temporary Health first");
      } finally { await p.release(); }
    });

    it("Oath of Fealty: two willing creatures, the words asked, the oath on each, and the Broken press tells the caster", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Oath", { level: 5, spells: ["Oath of Fealty"] });
      const ally = await makeCharacter({ name: "ZZ Gap Oath Ally", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      const t0 = Date.now() - 1000;
      const card = await castOk(s, "Oath of Fealty", { targets: [s, ally], steps: [words("I will hold the pass")] });
      assert.ok(card, "the oath's card posted");
      await until(() => [s, ally].every(a => a.effects.some(e => e.flags?.[SCOPE]?.[OATH_FLAG])), "the oath on both");
      const sworn = await until(() => lastMessage(m => m.flags?.[SCOPE]?.sovereignCard?.press === "oathBroken" && m.flags[SCOPE].sovereignCard.who === ally.uuid && (m.timestamp ?? 0) >= t0), "the ally's oath card");
      const t1 = Date.now() - 500;
      const r = await pressCard(sworn, 'button[data-action="sovereignCard"][data-sov-press="oathBroken"]');
      await until(() => lastMessage(m => (m.timestamp ?? 0) >= t1 && textOf(m).includes(ally.name) && /broke/i.test(textOf(m))), "the caster told the oath broke");
      await r.release();
    });

    it("Royal Seal on a door: laid through the chooser, and opening the door tells the caster with the caster on another scene (R63)", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Seal", { level: 5, spells: ["Royal Seal"] });
      const scene = await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [1150, 950, 1150, 1150], door: CONST.WALL_DOOR_TYPES.DOOR, ds: CONST.WALL_DOOR_STATES.CLOSED }]);
      const card = await castOk(s, "Royal Seal", { steps: [choose(game.i18n.localize("AZEROTH.SovSpell.Seal.Door"))] });
      assert.ok(card, "the seal's card posted");
      await until(() => scene.walls.get(wall.id)?.flags?.[SCOPE] && Object.keys(scene.walls.get(wall.id).flags[SCOPE]).length > 0, "the seal on the door");
      const elsewhere = await Scene.create({ name: "ZZ Gap Seal Elsewhere", width: 2000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(elsewhere);
      await elsewhere.view();
      await until(() => canvas.scene?.id === elsewhere.id, "another scene viewed");
      const t0 = Date.now() - 500;
      await scene.walls.get(wall.id).update({ ds: CONST.WALL_DOOR_STATES.OPEN });
      const opened = game.i18n.format("AZEROTH.SovSpell.Seal.Opened", { target: game.i18n.localize("AZEROTH.SovSpell.Seal.Door") });
      await until(() => lastMessage(m => (m.timestamp ?? 0) >= t0 && m.content.includes(foundry.utils.escapeHTML(opened).slice(0, 20))), "the caster told the door was opened");
      await scene.view();
    });

    it("Royal Herald: the creature named in the chooser and the message asked; the herald's card reaches that creature", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Herald", { level: 5, spells: ["Royal Herald"] });
      const to = await makeCharacter({ name: "ZZ Gap Herald Listener", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      const t0 = Date.now() - 1000;
      const card = await castOk(s, "Royal Herald", { steps: [choose(to.name), words("Kneel before the court")] });
      assert.ok(card, "the herald's card posted");
      await until(() => lastMessage(m => (m.timestamp ?? 0) >= t0 && m.content.includes("Kneel before the court") && m.content.includes(s.name)), "the message delivered with the caster's name");
    });

    it("Eyes of the Swarm: the swarm rises beside the caster, the look rides an effect, and the card's Look press is answered", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Swarm", { level: 11, spells: ["Eyes of the Swarm"] });
      const scene = await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      const tokensBefore = scene.tokens.size;
      const t0 = Date.now() - 1000;
      await castOk(s, "Eyes of the Swarm");
      await until(() => scene.tokens.size > tokensBefore, "the swarm's token beside the caster");
      await until(() => s.effects.some(e => e.flags?.[SCOPE]?.[LOOK_FLAG]?.kind === "swarm"), "the look's effect");
      const look = await pressedCard("look", t0);
      const said = await warnings(async () => { const r = await pressCard(look, 'button[data-action="sovereignCard"][data-sov-press="look"]'); await sleep(1200); await r.release(); });
      assert.deepEqual(said, [], "the look out of a fight is answered with no refusal");
    });

    it("Gaze from the Throne: a creature whose blood the caster holds, picked in the chooser; its failed Test opens the watch and its Look", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Throne", { level: 17, spells: ["Gaze from the Throne"] });
      const foe = await creature("Bandit", "Gap Throne Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1800, y: 1000, side: "hostile" }]);
      const { rememberBlood } = await import("../effects/sovereign-spells.mjs");
      await rememberBlood(s, foe);
      const t0 = Date.now() - 1000;
      const card = await castOk(s, "Gaze from the Throne", { steps: [choose(foe.name)] });
      await resist(card, 0, 1);
      await pressedCard("look", t0);
    });

    it("Royal Approach: a space closer to the prey picked on the board, the caster displaced there with no Opportunity Attack", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Approach", { level: 5, spells: ["Royal Approach"] });
      const foe = await creature("Bandit", "Gap Approached Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe));
      await castOk(s, "Royal Approach", { steps: [board({ x: 1350, y: 1050 })] });
      await until(() => tokenOf(s).document.x === 1300, "the caster displaced 15 feet toward the prey");
    });
  });

  describe("Vitae and Tribute, the gaps (O-438, O-439; the creator's Claws)", function () {
    standUp(context);

    /** Shadow Lance from the sheet at 5 Vitae and 9 Health: an overflow that ends at exactly 0. */
    async function overflowToZero(s, foe) {
      await setPool(s, "vitae", 5);
      await s.update({ "system.health.value": 9 });
      await until(() => health(s) === 9, "Health 9");
      await castOk(s, "Shadow Lance", { targets: [foe] });
      await until(() => vitaeOf(s).value === 0 && health(s) === 0, "Vitae 0 and Health 0: the overflow paid in full");
    }

    /** Back up to 6 Health for the sword blow. */
    async function standUpAgain(s) {
      await s.update({ "system.health.value": 6 });
      if (s.statuses.has("prone")) await s.toggleStatusEffect("prone", { active: false });
      await until(() => health(s) === 6, "Health 6");
    }

    it("O-438: Too Beautiful to Die never catches an overflow to 0, and still holds a sword blow", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Hold Beautiful", { level: 11, ranks: { "Too Beautiful to Die": 1 }, spells: ["Shadow Lance"] });
      const foe = await creature("Bandit", "Gap Hold Target A");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      await until(() => s.items.some(i => i.type === "feature" && i.getFlag(SCOPE, "feature")?.talentId === talentNamed(s, "Too Beautiful to Die").id), "the counter granted");
      await setPool(s, "tribute", 4);
      await overflowToZero(s, foe);
      assert.equal(tributeOf(s).value, 4, "no Tribute spent: the hold never met the payment");
      assert.equal(s.system.health.temp ?? 0, 0, "no temporary Health");
      await standUpAgain(s);
      await s.applyDamage(20, { struck: true, attack: true });
      await until(() => health(s) === 1, "the sword blow held at 1");
    });

    it("O-438: Unfading Glory never catches an overflow to 0, and still holds a sword blow for a Tribute", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Hold Glory", { level: 11, spells: ["Shadow Lance", "Unfading Glory"] });
      const foe = await creature("Bandit", "Gap Hold Target B");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      await setPool(s, "vitae", vitaeOf(s).max);
      await castOk(s, "Unfading Glory");
      await until(() => s.effects.some(e => e.flags?.[SCOPE]?.[UNFADING_FLAG]), "Unfading Glory standing");
      await setPool(s, "tribute", 2);
      await overflowToZero(s, foe);
      assert.equal(tributeOf(s).value, 2, "no Tribute spent: the hold never met the payment");
      await standUpAgain(s);
      await s.applyDamage(20, { struck: true, attack: true });
      await until(() => health(s) === 1, "the sword blow held at 1");
      await until(() => tributeOf(s).value === 1, "1 Tribute spent on the blow");
    });

    it("O-438: 07's Aegis floor never catches an overflow to 0, and still holds a sword blow", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Hold Aegis", { level: 11, spells: ["Shadow Lance"] });
      const foe = await creature("Bandit", "Gap Hold Target C");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      await s.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Aegis floor", img: "icons/svg/shield.svg", flags: { [SCOPE]: { [FLOOR_FLAG]: { stay: 1, by: null, name: "Aegis", held: false, noCritical: false } } } }]);
      await overflowToZero(s, foe);
      await standUpAgain(s);
      await s.applyDamage(20, { struck: true, attack: true });
      await until(() => health(s) === 1, "the sword blow held at the floor");
    });

    it("O-439: a Critical Injury pressed on its card empties Tribute", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Gap Critical", { level: 5 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "tribute", 4);
      const card = await game.system.azeroth.workflows.rollCriticalInjury({ actor: s, location: "body" });
      made.push(card);
      const r = await pressCard(card, 'button[data-action="sufferInjury"]');
      await until(() => tributeOf(s).value === 0, "the Critical Injury empties Tribute");
      await r.release();
    });

    it("O-439: the prey's first failed Test in a round gives 1 Tribute, and its second that round gives nothing", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Gap Will", { level: 5, spells: ["Captivating Gaze"] });
      const foe = await creature("Bandit", "Gap Will Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await freshTurn(s, 2);
      await sov().markPrey(s, tokenOf(foe));
      await setPool(s, "tribute", 0);
      await setPool(s, "vitae", 30);
      const first = await castOk(s, "Captivating Gaze", { targets: [foe] });
      await resist(first, 0, 1);
      await until(() => tributeOf(s).value === 1, "the first failed Test gives 1");
      const second = await castOk(s, "Captivating Gaze", { targets: [foe] });
      await resist(second, 0, 1);
      await sleep(2000);
      assert.equal(tributeOf(s).value, 1, "the second failed Test in the round gives nothing");
    });

    it("the creator's apply makes a San'layn Sovereign holding the Claws, unequipped and out of the bags; a hand delete is refused", async function () {
      this.timeout(180000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        const race = await fromPack(PACK_FOR.race, "San'layn");
        const cls = await fromPack(PACK_FOR.class, "Sovereign");
        await creator.setState({ race: race.uuid, cls: cls.uuid, step: "race" });
        await settle();
        const profession = (await game.packs.get(PACK_FOR.profession).getDocuments()).find(c => c.system?.identifier === "wilderness-survival");
        const racial = (race.system.talents ?? []).find(t => t.name === "Clean Feeder");
        // Sovereign Will, a tier 1 talent with no gate (Gilded Skin waits on Prim and Proper at level 3, B.13 Q35).
        const classTalent = (await game.packs.get(PACK_FOR.talent).getIndex({ fields: ["system.className", "system.tier", "system.identifier", "system.race", "system.legacy"] }))
          .find(t => t.system?.className === "Sovereign" && t.system?.identifier === "sovereign-will");
        // The array's six values (16, 14, 13, 12, 10, 8), Constitution first as the class casts with it.
        const abilities = { str: 8, dex: 14, con: 16, int: 10, wis: 12, cha: 13 };
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.tier", "system.restricted", "system.school"] });
        const offered = ["Leaden Decree", "Bleed for Me", "Veil of Majesty", "Captivating Gaze", "Royal Approach", "Air of Majesty", "Taste of Lineage", "Royal Seal"];
        const required = 4 + Math.floor((abilities.con - 10) / 2);
        const spells = offered.map(n => index.find(e => e.name === n)?.uuid).filter(Boolean).slice(0, required);
        const result = await creator.apply({
          method: "array", abilities, rolled: null, profession: profession.uuid, ranks: {}, racialTalent: racial?.name ?? null,
          classTalent: classTalent?.system?.identifier ?? null, spells, side: "horde", equipment: [], name: "ZZ Gap Created Sovereign", img: "icons/svg/mystery-man.svg"
        });
        assert.ok(result.ok, `the creator refused: ${JSON.stringify(result.reasons)}`);
        const actor = result.actor;
        made.push(actor);
        const claws = await until(() => actor.items.find(i => i.type === "weapon" && i.system?.identifier === "sovereign-claws"), "the Claws embedded");
        assert.isFalse(claws.system.equipped === true, "the Claws arrive unequipped");
        assert.isNotOk(claws.system.container, "the Claws sit in no container");
        const said = await warnings(async () => { await claws.delete().catch(() => null); await sleep(600); });
        assert.ok(actor.items.get(claws.id), "a hand delete is refused");
        assert.ok(said.length > 0, "refused in words");
        const classItem = actor.items.find(i => i.type === "class" && i.name === "Sovereign");
        await classItem.delete();
        await until(() => !actor.items.some(i => i.system?.identifier === "sovereign-claws"), "the Claws go with the class");
      } finally {
        await creator.close();
      }
    });
  });
}
