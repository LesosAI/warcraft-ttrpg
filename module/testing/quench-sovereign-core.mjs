/**
 * **THE SOVEREIGN'S CORE, THROUGH THE REAL DOORS** (the San'layn and Sovereign plan's V1 to V5, F1 to F5,
 * T1, T3, C3, C4 and C14's pool cues; C.4's rows *Vitae size*, *Rest refills nothing*, *Casting in
 * Vitae*, *Overflow*, *Overflow to 0*, *Refused*, *The Blood Royal*, *One feeding, both halves*, *Hunt
 * Mortal*, *Tribute lanes*, *Tribute and Guard*, *Tribute cap*). The sheet's own controls are pressed -
 * Cast, Feed, Hunt Mortal's Mark, Guard, the feeding card's Test and the claw card's Mark as prey - and
 * the animation recorder stands in for Sequencer so the feeding stream, the Tribute wisp and the drain
 * pulse are read back with their sound steps.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.sovereign-core`.
 */

import { cleanup, give, made, makeCharacter, makeNpc, openSheet, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { ANIMATIONS_SETTING, ANIMATION_LOOPS_SETTING, ANIMATION_SOUNDS_SETTING, ROLL_DIALOG_SETTING } from "../settings.mjs";
import { castFromSheet, chooser, fightWith, freshTurn, pick, pressCard, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { animationAvailability } from "../animation/availability.mjs";
import { clawHitPayload, fireClawHits } from "../rules/claw-hit.mjs";
import { DIED_AT_FLAG, sovereignQueryHandler } from "../effects/sovereign-core.mjs";
import { FED_TODAY_FLAG } from "../rules/feeding.mjs";
import { BLOOD_SINCE_REST_FLAG } from "../rules/rest.mjs";

const SCOPE = "azeroth-rpg";
const api = () => game.system.azeroth.animations;
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sov = () => game.system.azeroth.sovereign;

/** A Sovereign at a level: Constitution 16 (+3), Charisma 16 (+3), Dexterity 14. */
async function sovereignWith(name, { level = 1, abilities = { con: 16, cha: 16, dex: 14 } } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", abilities });
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  return s;
}

/** A pool set by a GM's hand (the named `hand` door). */
async function setPool(actor, which, value) {
  const pool = which === "vitae" ? vitaeOf(actor) : tributeOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value }, {}, { vitaeGain: "hand", tributeGain: "hand" });
  await until(() => (which === "vitae" ? vitaeOf(actor) : tributeOf(actor)).value === Math.min(value, pool.max), `${which} set`);
}

/** A creature from the bestiary, at full Health, named for the test. */
async function creature(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "system.health.value": npc.system.health.max });
  return npc;
}

/**
 * Press a Combat tab control with these targets; the warnings it raised.
 *
 * **A REFUSAL IS WAITED FOR BY ITS OWN WORDS** (FIXC, the CORE flake): where `expect` is given the press waits until a
 * warning it matches has been said, never a fixed 900 ms. The control's handler awaits a dynamic `import()` before
 * the door judges, and an import resolves through a task, so the warning lands behind whatever the page is doing at
 * that moment - a recorder rerun's cues, a turn change's render - and a fixed window read an empty list. Without
 * `expect` the press settles 900 ms and the caller waits for the write it asserts.
 */
async function pressCombat(actor, action, targets = [], expect = null) {
  // Core's `User#_onUpdateTokenTargets` reads `canvas.scene.id` and throws with no scene viewed (14.367), which a
  // batch run after another that deleted its scene meets (ANIM's rerun): targets only on a viewed scene.
  if (canvas?.scene) canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const button = sheet.element.querySelector(`section[data-tab="combat"] [data-action="${action}"]`);
  if (!button) throw new Error(`the Combat tab draws no ${action}`);
  let elapsed = null;
  // The warnings said while the press runs, read as they arrive (`fixtures.mjs#warnings`' own capture, inline).
  const said = [];
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    const start = Date.now();
    button.click();
    if (!expect) await sleep(900);
    else {
      try {
        await until(() => said.some(w => expect.test(w)), `a warning matching ${expect}`, 10000);
        elapsed = Date.now() - start;
      } catch {
        // What the page held when the words never came: a chooser left open, the fight the actor reads, the targets.
        const open = [...foundry.applications.instances.values()].filter(a => a.rendered && String(a.id ?? "").startsWith("azeroth-choose-")).map(a => a.id);
        console.debug(`[quench-progress] FIXC pressCombat ${action}: no ${expect} in 10 s; choosers ${JSON.stringify(open)}; fight ${actor.activeFight?.()?.id ?? "none"}; targets ${JSON.stringify([...(game.user?.targets ?? [])].map(t => t.name))}`);
      }
    }
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  if (elapsed !== null) console.debug(`[quench-progress] FIXC pressCombat ${action}: ${expect} heard after ${elapsed} ms`);
  return { sheet, said };
}

/** The feeding card posted for this creature, waited for. */
const feedingCard = prey => until(() => [...game.messages].reverse().find(m => m.flags?.[SCOPE]?.feeding?.targetUuid === prey.uuid && m.flags[SCOPE].feeding.resolved !== true) ?? null, "the feeding card");

export function sovereignCoreBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Sovereign's Vitae, feeding, Tribute and prey (the San'layn and Sovereign plan)", function () {
    const held = {};
    let recorder = null;
    let previousPlayer = null;
    let restoreText = null;
    const cueOf = (trigger, key, what) => until(() => recorder.cuesFor(trigger, key).at(-1) ?? null, what, 15000);
    async function untilAvailable(ms = 20000) {
      const start = Date.now();
      for (;;) {
        const state = animationAvailability();
        if (state.ok) return state;
        if (Date.now() - start > ms) throw new Error(`nothing may play here: ${state.reason}`);
        await sleep(100);
      }
    }

    before(async function () {
      this.timeout(120000);
      if (!game.packs.get("azeroth-rpg.classes")?.index?.some?.(e => e.name === "Sovereign")) {
        const index = await game.packs.get("azeroth-rpg.classes").getIndex();
        if (!index.some(e => e.name === "Sovereign")) throw new Error("the classes pack holds no Sovereign: rebuild the packs");
      }
      for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) {
        held[key] = game.settings.get(SCOPE, key);
        await game.settings.set(SCOPE, key, true);
      }
      held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
      recorder = new (api().Recorder)();
      previousPlayer = api().director.setPlayer(recorder);
    });

    after(async function () {
      this.timeout(180000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | sovereign-core teardown (${what}): ${err?.message ?? err}`); } };
      await restore("the player", () => { if (previousPlayer) api().director.setPlayer(previousPlayer); });
      await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
      await restore("the windows", async () => {
        for (const app of [...foundry.applications.instances.values()]) {
          const id = String(app.id ?? "");
          if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
        }
      });
      await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog));
      await restore("the switches", async () => {
        for (const key of [ANIMATIONS_SETTING, ANIMATION_SOUNDS_SETTING, ANIMATION_LOOPS_SETTING]) await game.settings.set(SCOPE, key, held[key]);
      });
      await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
      await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
      await cleanup();
      await restoreText?.();
    });

    describe("Vitae (V1 to V4)", function () {
      it("Vitae size: Constitution 16 shows Vitae 18 at level 1 and 48 at level 10, drawn on the Combat tab", async function () {
        this.timeout(120000);
        const s = await sovereignWith("ZZ Sovereign Size");
        assert.equal(vitaeOf(s).max, 18, "02 §6's 10, times 1.5, plus 3");
        await s.setLevel(10);
        await until(() => vitaeOf(s).max === 48, "Vitae 48 at level 10");
        const sheet = await openSheet(s);
        sheet.changeTab("combat", "primary");
        await settle();
        const bar = sheet.element.querySelector('section[data-tab="combat"] .azeroth-sovereign .azeroth-pool.is-vitae');
        assert.ok(bar, "the Combat tab draws the Vitae bar");
        assert.equal(bar.querySelectorAll(".azeroth-segment").length, 48, "one segment a point");
        assert.ok(sheet.element.querySelector('section[data-tab="combat"] .azeroth-sovereign .azeroth-pool.is-tribute'), "and the Tribute bar");
        assert.match(sheet.element.querySelector('section[data-tab="combat"] .azeroth-prey-row').textContent, /No prey/, "the prey row says so in words");
        await sheet.close();
      });

      it("Rest refills nothing: a Long Rest leaves Vitae where it stood and the card says so", async function () {
        this.timeout(120000);
        const s = await sovereignWith("ZZ Sovereign Rest");
        await setPool(s, "vitae", 4);
        const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === s.id);
        await s.longRest({});
        const [card] = await posted;
        made.push(card);
        assert.equal(vitaeOf(s).value, 4, "no rest refills Vitae");
        assert.match(card.content, /No rest refills Vitae/, "and the card says so in words");
      });

      it("a Blood vial drunk from the Combat tab gives 2 x tier Vitae, spends one vial and counts as the next rest's unit", async function () {
        this.timeout(120000);
        const s = await sovereignWith("ZZ Sovereign Vial");
        await give(s, "Blood vial");
        await setPool(s, "vitae", 0);
        const vial = () => s.items.find(i => i.type === "gear" && i.system?.provision === "blood");
        const before = vial()?.system?.quantity ?? 1;
        const { sheet } = await pressCombat(s, "drinkVial");
        await sheet.close();
        await until(() => vitaeOf(s).value === 2, "2 x 1 Vitae");
        assert.equal(vial()?.system?.quantity ?? 0, before - 1, "one vial spent");
        assert.equal(s.getFlag(SCOPE, BLOOD_SINCE_REST_FLAG), 1, "and it is the next rest's unit");
      });

      it("Casting in Vitae: Drain Life is known on top of the count and costs 2 Vitae from the sheet's Cast", async function () {
        this.timeout(120000);
        const s = await sovereignWith("ZZ Sovereign Cast");
        await until(() => ["Drain Life", "Bloodbolt", "Decree of Frailty"].every(n => s.items.some(i => i.type === "spell" && i.name === n)), "the three spells the class teaches");
        const foe = await creature("Alliance Footman", "Drained Footman");
        await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
        await setPool(s, "vitae", 10);
        const card = await castFromSheet(s, "Drain Life", { targets: [tokenOf(foe)], face: 18 });
        assert.ok(card, "the spell card posted");
        await until(() => vitaeOf(s).value === 8, "2 Vitae spent");
        assert.match(card.content, /Vitae/, "the card names Vitae");
      });

      it("Overflow, Overflow to 0 and Refused: the rest off Health 1 for 1, Prone at 0 with no Critical Injury, refused past both", async function () {
        this.timeout(180000);
        const s = await sovereignWith("ZZ Sovereign Overflow");
        const foe = await creature("Alliance Footman", "Overflow Footman");
        await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
        await untilAvailable();
        // Decree of Frailty (4 Vitae): a cost with no healing of its own, so the Health read is the payment alone.
        await until(() => s.items.some(i => i.type === "spell" && i.name === "Decree of Frailty"), "Decree of Frailty");
        const decree = s.items.find(i => i.type === "spell" && i.name === "Decree of Frailty");
        const warnOf = sheet => sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${decree.id}"] .azeroth-spell-vitae-warn`)?.textContent ?? "";
        // Overflow: 1 Vitae and full Health pay 4 as 1 Vitae and 3 Health; temporary Health untouched.
        const top = s.system.health.max;
        await s.update({ "system.health.value": top, "system.health.temp": 3 });
        await setPool(s, "vitae", 1);
        const sheet = await openSheet(s);
        sheet.changeTab("spells", "primary");
        await settle();
        assert.match(warnOf(sheet), /takes Health/, "the Spells tab warns the cast takes Health, in words");
        await sheet.close();
        await castFromSheet(s, "Decree of Frailty", { targets: [tokenOf(foe)], face: 18 });
        await until(() => vitaeOf(s).value === 0 && s.system.health.value === top - 3, `1 Vitae and 3 Health paid (Health ${s.system.health.value} of ${top}, Vitae ${vitaeOf(s).value})`);
        assert.equal(s.system.health.temp, 3, "temporary Health is never spent");
        const pulse = await cueOf("use", "vitae:overflow", "the drain pulse");
        assert.ok(pulse.steps.some(x => x.kind === "sound"), "the pulse has a sound step");
        // Overflow to 0: 0 Vitae and 4 Health pay 4; Prone and Dying, no Critical Injury card.
        await s.update({ "system.health.value": 4, "system.health.temp": 0 });
        const sheet0 = await openSheet(s);
        sheet0.changeTab("spells", "primary");
        await settle();
        assert.match(warnOf(sheet0), /0 Health/, "the tab warns: this will drop you to 0 Health");
        await sheet0.close();
        const before = game.messages.size;
        await castFromSheet(s, "Decree of Frailty", { targets: [tokenOf(foe)], face: 18 });
        await until(() => s.system.health.value === 0, "Health 0");
        await until(() => s.statuses.has("prone"), "Prone");
        await sleep(1000);
        const after = [...game.messages].slice(before);
        assert.notOk(after.some(m => /critical/i.test(m.flags?.[SCOPE]?.kind ?? "")), "no Critical Injury from a Vitae payment");
        assert.ok(after.some(m => m.flags?.[SCOPE]?.kind === "vitaeToZero"), "the card says Dying, in words");
        // Refused: 0 Vitae and 3 Health cannot pay 4; nothing spent.
        await s.update({ "system.health.value": 3 });
        await s.toggleStatusEffect("prone", { active: false, free: true }).catch(() => {});
        const said = await warnings(async () => { await castFromSheet(s, "Decree of Frailty", { targets: [tokenOf(foe)], face: 18, ms: 3000 }); });
        assert.ok(said.some(w => /cannot pay 4 Vitae/.test(w)), `refused in words (${said.join(" | ")})`);
        assert.equal(s.system.health.value, 3, "nothing spent");
      });
    });

    describe("The Blood Royal (F1 to F5)", function () {
      it("in a fight: a Prone Medium enemy fails, loses tier Health, the Sovereign gains 5 x tier + Con; again, standing and undead are refused", async function () {
        this.timeout(240000);
        const s = await sovereignWith("ZZ Sovereign Feeds");
        const foe = await creature("Alliance Footman", "Prone Footman");
        const standing = await creature("Alliance Footman", "Standing Footman");
        const bones = await creature("Risen Skeleton", "Prone Skeleton");
        await sceneWith([
          { actor: s, x: 1000, y: 1000 },
          { actor: foe, x: 1100, y: 1000, side: "hostile" },
          { actor: standing, x: 1000, y: 1100, side: "hostile" },
          { actor: bones, x: 900, y: 1000, side: "hostile" }
        ]);
        await untilAvailable();
        await setPool(s, "vitae", 0);
        await foe.toggleStatusEffect("prone", { active: true });
        await bones.toggleStatusEffect("prone", { active: true });
        const combat = await fightWith([s, foe, standing, bones]);
        await freshTurn(s, 2);
        const healthBefore = foe.system.health.value;
        const { sheet } = await pressCombat(s, "feed", [tokenOf(foe)]);
        await sheet.close();
        const card = await feedingCard(foe);
        made.push(card);
        const press = await pressCard(card, '[data-action="resistTest"]', { face: 1 });
        try {
          await until(() => vitaeOf(s).value === 8, "5 x 1 + 3 Vitae");
        } finally {
          await press.release();
        }
        await until(() => foe.system.health.value === healthBefore - 1, "the footman loses tier Health");
        assert.equal(s.getFlag(SCOPE, BLOOD_SINCE_REST_FLAG), 1, "one feeding is one unit for the next rest (C-14)");
        assert.ok(s.getFlag(SCOPE, FED_TODAY_FLAG)?.[foe.uuid], "fed on today, on the Sovereign's own record");
        const stream = await cueOf("use", "vitae:feed", "the feeding stream");
        assert.ok(stream.steps.some(x => x.kind === "sound") && stream.steps.some(x => x.kind === "effect"), "the stream draws and sounds");
        // Again on the same creature: refused, nothing spent.
        await freshTurn(s, 2);
        let r = await pressCombat(s, "feed", [tokenOf(foe)], /already fed on/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /already fed on/.test(w)), `refused: fed today (${r.said.join(" | ")})`);
        r = await pressCombat(s, "feed", [tokenOf(standing)], /not Stunned, Entangled or Prone/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /not Stunned, Entangled or Prone/.test(w)), `refused: standing (${r.said.join(" | ")})`);
        r = await pressCombat(s, "feed", [tokenOf(bones)], /no blood to drink/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /no blood to drink/.test(w)), `refused: undead (${r.said.join(" | ")})`);
        await combat.delete();
      });

      it("outside a fight: a held Large beast gives 8 x tier + Con; a 5-minute corpse half; an 11-minute corpse is refused", async function () {
        this.timeout(240000);
        const s = await sovereignWith("ZZ Sovereign Hunts");
        const bear = await creature("Black Bear", "Held Bear");
        const corpse = await creature("Kobold", "Fresh Corpse");
        const old = await creature("Kobold", "Old Corpse");
        await sceneWith([
          { actor: s, x: 1000, y: 1000 }, { actor: bear, x: 1100, y: 1000, side: "hostile" },
          { actor: corpse, x: 900, y: 1000, side: "hostile" }, { actor: old, x: 1000, y: 900, side: "hostile" }
        ]);
        await setPool(s, "vitae", 0);
        const { sheet } = await pressCombat(s, "feed", [tokenOf(bear)]);
        const feature = s.items.find(i => i.type === "feature" && i.name === "The Blood Royal");
        const app = await chooser(feature);
        await pick(app, "A beast held still");
        await sheet.close();
        await until(() => vitaeOf(s).value === 11, "8 x 1 + 3 Vitae");
        // A corpse dead five minutes: half of (3 x 1 + 3), rounded down.
        await corpse.update({ "system.health.value": 0 });
        await until(() => Number.isFinite(Number(corpse.getFlag(SCOPE, DIED_AT_FLAG))), "the death's time recorded");
        await corpse.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime - 300);
        let r = await pressCombat(s, "feed", [tokenOf(corpse)]);
        await r.sheet.close();
        await until(() => vitaeOf(s).value === 14, "3 more Vitae from the corpse");
        // Eleven minutes: refused.
        await old.update({ "system.health.value": 0 });
        await until(() => Number.isFinite(Number(old.getFlag(SCOPE, DIED_AT_FLAG))), "the death's time recorded");
        await old.setFlag(SCOPE, DIED_AT_FLAG, game.time.worldTime - 660);
        r = await pressCombat(s, "feed", [tokenOf(old)], /more than 10 minutes/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /more than 10 minutes/.test(w)), `refused: an old corpse (${r.said.join(" | ")})`);
        assert.equal(vitaeOf(s).value, 14, "nothing gained");
      });
    });

    describe("Tribute and the prey (T1, T3, C3, C4)", function () {
      it("Tribute cap: Charisma +3 caps at 6 and Charisma -1 at 3", async function () {
        this.timeout(120000);
        const s = await sovereignWith("ZZ Sovereign Cap");
        assert.equal(tributeOf(s).max, 6);
        await s.update({ "system.abilities.cha.value": 8 });
        await until(() => tributeOf(s).max === 3, "the cap never below 3");
      });

      it("Hunt Mortal, the lanes and Guard: a second mark this turn is refused, a claw hit on the prey gives 1, on another offers Mark as prey, the prey's failed Test gives 1, Guard keeps it", async function () {
        this.timeout(240000);
        const s = await sovereignWith("ZZ Sovereign Prey");
        const a = await creature("Alliance Footman", "Prey Footman");
        const b = await creature("Alliance Footman", "Other Footman");
        await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: a, x: 1100, y: 1000, side: "hostile" }, { actor: b, x: 1000, y: 1100, side: "hostile" }]);
        await untilAvailable();
        const combat = await fightWith([s, a, b]);
        await freshTurn(s, 2);
        let r = await pressCombat(s, "markPrey", [tokenOf(a)]);
        await r.sheet.close();
        await until(() => s.preyMark()?.actorUuid === a.uuid, "the footman marked");
        r = await pressCombat(s, "markPrey", [tokenOf(b)], /marked a prey this turn/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /marked a prey this turn/.test(w)), `a second mark this turn is refused (${r.said.join(" | ")})`);
        assert.equal(s.preyMark()?.actorUuid, a.uuid, "the first mark stands");
        // The claw lane: the WEAPON door's hook, as a claw roll's hit fires it.
        await setPool(s, "tribute", 0);
        fireClawHits([clawHitPayload({ attackerUuid: s.uuid, targetActorUuid: a.uuid, targetTokenUuid: tokenOf(a).document.uuid, sl: 0 })]);
        await until(() => tributeOf(s).value === 1, "a claw hit on the prey gives 1");
        await cueOf("use", "tribute:gain", "the Tribute wisp");
        fireClawHits([clawHitPayload({ attackerUuid: s.uuid, targetActorUuid: b.uuid, targetTokenUuid: tokenOf(b).document.uuid, sl: 0 })]);
        const offer = await until(() => [...game.messages].reverse().find(m => m.flags?.[SCOPE]?.kind === "preyOffer" && m.flags[SCOPE].targetUuid === tokenOf(b).document.uuid) ?? null, "the Mark as prey card");
        made.push(offer);
        assert.equal(tributeOf(s).value, 1, "a claw hit on another creature gives none");
        const button = await until(() => document.querySelector(`[data-message-id="${offer.id}"] [data-sovereign-mark]`), "its button");
        button.click();
        await until(() => s.preyMark()?.actorUuid === b.uuid, "Blood-Forged Claws marks it");
        assert.equal(tributeOf(s).value, 1, "a new prey keeps the Tribute");
        // The will lane: the prey fails the feeding Test.
        await b.toggleStatusEffect("prone", { active: true });
        await freshTurn(s, 2);
        r = await pressCombat(s, "feed", [tokenOf(b)]);
        await r.sheet.close();
        const card = await feedingCard(b);
        made.push(card);
        const press = await pressCard(card, '[data-action="resistTest"]', { face: 1 });
        try {
          await until(() => tributeOf(s).value === 2, "the prey's failed Test gives 1");
        } finally {
          await press.release();
        }
        // Guard keeps it (R18).
        await freshTurn(s, 2);
        r = await pressCombat(s, "guard");
        await r.sheet.close();
        await sleep(1000);
        assert.equal(tributeOf(s).value, 2, "Guard does not empty Tribute");
        await combat.delete();
      });
    });

    describe("The asks are judged, and the vial (the fix pass after the reviews; D-982)", function () {
      // A player who owns nothing here, as core's query context hands the handler its asker (14.367 `#handleUserQuery`).
      const forger = { id: "ZZForgerUser0001", name: "ZZ Forger", isGM: false };

      it("a forged payload from a player is refused: no Health drained, no Vitae fed, no Tribute given, no prey cleared", async function () {
        this.timeout(180000);
        const s = await sovereignWith("ZZ Sovereign Forged", { level: 5 });
        const foe = await creature("Alliance Footman", "Forged Footman");
        await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
        await setPool(s, "vitae", 0);
        await setPool(s, "tribute", 0);
        const hp = foe.system.health.value;
        // The drain with no card, from a user owning neither actor: refused in words, nothing lost.
        const drain = await sovereignQueryHandler({ act: "drain", targetUuid: foe.uuid, sovereignUuid: s.uuid, loss: 4 }, { user: forger });
        assert.equal(drain.ok, false, "the drain is refused");
        assert.equal(drain.reason, "notYours");
        assert.match(drain.words ?? "", /do not own/, "in words");
        // A feeding with a flat 999 and no card: refused.
        const feed = await sovereignQueryHandler({ act: "feed", sovereignUuid: s.uuid, targetUuid: foe.uuid, flat: 999, anyDay: true, mode: "fight" }, { user: forger });
        assert.equal(feed.ok, false, "Vitae from nothing is refused");
        // A Tribute gain by a named source: refused for a user who owns no Sovereign and shows no card.
        const tribute = await sovereignQueryHandler({ act: "tribute", sovereignUuid: s.uuid, amount: 99, source: "unmarred" }, { user: forger });
        assert.equal(tribute.ok, false, "Tribute from nothing is refused");
        // The prey's death asked for a prey that is alive, even by the GM: the mark stands.
        await sov().markPrey(s, tokenOf(foe));
        await until(() => s.preyMark()?.actorUuid === foe.uuid, "the footman marked");
        const died = await sovereignQueryHandler({ act: "preyDied", sovereignUuid: s.uuid, deadUuid: foe.uuid }, { user: game.user });
        assert.equal(died.reason, "alive", "a prey still standing did not die");
        await sleep(500);
        assert.equal(foe.system.health.value, hp, "no Health drained");
        assert.equal(vitaeOf(s).value, 0, "no Vitae fed");
        assert.equal(tributeOf(s).value, 0, "no Tribute given");
        assert.equal(s.preyMark()?.actorUuid, foe.uuid, "the prey mark stands");
        // The GM's own free drain is judged too: a standing creature out of reach is no feeding.
        await tokenOf(foe).document.update({ x: 1600 });
        await until(() => tokenOf(foe).document.x === 1600, "the footman walks off");
        const far = await sovereignQueryHandler({ act: "drain", targetUuid: foe.uuid, sovereignUuid: s.uuid, mode: "fight" }, { user: game.user });
        assert.equal(far.ok, false, "a creature out of reach is no feeding");
        assert.equal(far.reason, "reach");
        assert.equal(foe.system.health.value, hp, "and loses nothing");
      });

      it("a vial is refused unless it is a Blood vial and Vitae is short, and in a fight drinking one is a Half-Action", async function () {
        this.timeout(240000);
        const s = await sovereignWith("ZZ Sovereign Vial Judged", { level: 5 });
        const foe = await creature("Alliance Footman", "Vial Footman");
        await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }]);
        const empty = await give(s, "Vial, empty");
        for (let i = 0; i < 3; i += 1) await give(s, "Blood vial");
        const blood = () => s.items.filter(i => i.type === "gear" && i.system?.provision === "blood").reduce((n, i) => n + (i.system?.quantity ?? 1), 0);
        // Any other item through the public door: refused in words, nothing spent.
        await setPool(s, "vitae", 0);
        const said = await warnings(async () => { await sov().drinkVial(s, empty); });
        assert.ok(said.some(w => /not a Blood vial/.test(w)), `a Vial, empty is refused (${said.join(" | ")})`);
        assert.ok(s.items.get(empty.id), "and kept");
        assert.equal(vitaeOf(s).value, 0, "no Vitae from it");
        // Full Vitae: the real control refuses, and the vial is kept.
        await setPool(s, "vitae", vitaeOf(s).max);
        const before = blood();
        let r = await pressCombat(s, "drinkVial", [], /Vitae is full/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /Vitae is full/.test(w)), `refused at full Vitae (${r.said.join(" | ")})`);
        assert.equal(blood(), before, "the vial is kept");
        // In a fight: a Half-Action, judged before the vial is spent.
        await setPool(s, "vitae", 0);
        const combat = await fightWith([s, foe]);
        const mine = await freshTurn(s, 2);
        r = await pressCombat(s, "drinkVial");
        await r.sheet.close();
        await until(() => vitaeOf(s).value === 2 * s.system.tier, "2 x tier Vitae");
        await until(() => (mine.budget?.halfActions ?? 0) === 1, "a Half-Action spent");
        assert.equal(blood(), before - 1, "one vial spent");
        r = await pressCombat(s, "drinkVial");
        await r.sheet.close();
        await until(() => (mine.budget?.halfActions ?? 0) === 0 && blood() === before - 2, "the second Half-Action and the second vial");
        r = await pressCombat(s, "drinkVial", [], /Half-Action/);
        await r.sheet.close();
        assert.ok(r.said.some(w => /Half-Action/.test(w)), `refused with no Half-Action left (${r.said.join(" | ")})`);
        assert.equal(blood(), before - 2, "and the third vial is kept");
        await combat.delete();
      });
    });
  });
}
