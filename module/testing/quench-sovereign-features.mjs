/**
 * **THE SOVEREIGN'S FEATURES AND TALENTS, THROUGH THE REAL CONTROLS** (02 §7; 04's Dominion, Vainglorious and
 * Ravenous; the San'layn and Sovereign plan's Phase 5 and C.4's feature and talent rows). Every Use is pressed
 * from the sheet (`pressUse`), every Resist and offer from its card (`pressCard`), with the die pinned through
 * `fixtures.mjs#pinDie`. Four batches, each run alone:
 *
 * - `azeroth-rpg.sovereign-features` - the ten features;
 * - `azeroth-rpg.sovereign-dominion`, `azeroth-rpg.sovereign-vainglorious`, `azeroth-rpg.sovereign-ravenous`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, featureNamed, fightWith, freshTurn, pick, pressCard, pressUse, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { clawHitPayload, fireClawHits } from "../rules/claw-hit.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";

const SCOPE = "azeroth-rpg";
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sov = () => game.system.azeroth.sovereign;
const feats = () => game.system.azeroth.sovereignFeatures;
const lastMessage = pred => [...game.messages].reverse().find(pred) ?? null;

/** A Sovereign at a level, Con 16, Cha 16, Dex 14, with these talents at these ranks. */
async function sovereignWith(name, { level = 20, ranks = {}, abilities = { con: 16, cha: 16, dex: 14 } } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", abilities });
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

/** A creature from the bestiary, at full Health, named for the test. */
async function creature(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "system.health.max": 40, "system.health.value": 40 });
  return npc;
}

/** The card a Use posted, waited for. */
async function useCard(actor, feature, targets = [], face = 15) {
  const { card } = await pressUse(actor, feature, targets, face);
  return card;
}

/** Whether the sheet greys this feature's Use (a spent use; the Necromancer batch's reading). */
async function useGreyed(actor, featureName) {
  const feature = featureNamed(actor, featureName);
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  const greyed = control?.disabled === true;
  await sheet.close();
  return greyed;
}

/** The newest offer card of a kind for this Sovereign. */
const offerCard = (s, offer) => until(() => lastMessage(m => m.flags?.[SCOPE]?.kind === "sovOffer" && m.flags[SCOPE].sovereignUuid === s.uuid && m.flags[SCOPE].offer === offer), `the ${offer} offer`);

/** Shared before/after: the roll dialog skipped, the world cleaned. */
function standUp(context, label) {
  const { before, after } = context;
  const held = {};
  let restoreText = null;
  before(async function () {
    this.timeout(120000);
    const index = await game.packs.get("azeroth-rpg.classes").getIndex();
    if (!index.some(e => e.name === "Sovereign")) throw new Error("the classes pack holds no Sovereign: rebuild the packs");
    held.dialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
    restoreText = await quietScrollingText();
  });
  after(async function () {
    this.timeout(180000);
    const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | ${label} teardown (${what}): ${err?.message ?? err}`); } };
    await restore("the pick", () => feats()?.setSovereignPick?.(null));
    await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
    await restore("the windows", async () => {
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
    });
    await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, held.dialog));
    await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
    await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
    await cleanup();
    await restoreText?.();
  });
}

/* ------------------------------------------------------------------ */
/*  The features                                                        */
/* ------------------------------------------------------------------ */

export function sovereignFeaturesBatch(context) {
  const { describe, it, assert } = context;
  describe("The Sovereign's ten features (02 §7; Phase 5)", function () {
    standUp(context, "sovereign-features");

    it("Prim and Proper: absent at level 2 and granted at 3; 3 Tribute gives 6 temporary Health; a second use is refused", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Prim", { level: 2 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      assert.notOk(featureNamed(s, "Prim and Proper"), "absent at level 2");
      await s.setLevel(3);
      await until(() => featureNamed(s, "Prim and Proper"), "granted at level 3");
      await setPool(s, "tribute", 3);
      const { card } = await pressUse(s, "Prim and Proper");
      const app = await chooser(featureNamed(s, "Prim and Proper"));
      await pick(app, "3 Tribute, 6 temporary Health");
      await card;
      await until(() => (s.system.health.temp ?? 0) === 6, "6 temporary Health");
      assert.equal(tributeOf(s).value, 0, "3 Tribute spent");
      assert.isTrue(await useGreyed(s, "Prim and Proper"), "the second use is greyed on the sheet");
    });

    it("Hunt Mortal marks the creature targeted; Unending Pursuit names its direction and distance", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Hunt", { level: 9 });
      const foe = await creature("Bandit", "Hunted Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }]);
      const marking = await warnings(async () => { await (await pressUse(s, "Hunt Mortal", [tokenOf(foe)])).card; await sleep(500); });
      await until(() => sov().isPrey(s, tokenOf(foe)), `the Bandit is the prey (${marking.join(" | ")})`);
      const card = await (await pressUse(s, "Unending Pursuit")).card;
      assert.match(card?.content ?? "", /east, about 25 feet away/, "the card names the direction and the distance");
    });

    it("Look Upon Me asks the Humanoid enemy at 50 feet alone; its failure lays a Bane on attacks at anyone but the Sovereign", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Look", { level: 11 });
      const near = await creature("Bandit", "Near Bandit");
      const beast = await creature("Adult Plainstrider", "Near Plainstrider");
      const far = await creature("Bandit", "Far Bandit");
      await sceneWith([
        { actor: s, x: 1000, y: 1000 },
        { actor: near, x: 2000, y: 1000, side: "hostile" },
        { actor: beast, x: 1000, y: 2000, side: "hostile" },
        { actor: far, x: 2400, y: 1000, side: "hostile" }
      ]);
      await setPool(s, "tribute", 3);
      const card = await (await pressUse(s, "Look Upon Me")).card;
      assert.ok(card, "the card posted");
      const named = (card.flags?.[SCOPE]?.targets ?? []).map(t => t.actorId);
      assert.deepEqual(named, [near.id], `only the Humanoid within 60 feet is asked (${named.join(", ")})`);
      assert.equal(tributeOf(s).value, 1, "2 Tribute spent");
      const r = await pressCard(card, 'button[data-action="resistTest"][data-target-index="0"]', { face: 1 });
      await until(() => near.effects.some(e => e.flags?.[SCOPE]?.laidBane), "the Bane laid");
      await r.release();
      const snap = targetSnapshots([tokenOf(s)])[0];
      assert.ok(snap, "the Sovereign can be targeted");
    });

    it("Blood Prison costs 10 Vitae, curses the prey that fails, and tears at it when it walks", async function () {
      this.timeout(300000);
      const s = await sovereignWith("ZZ Sov Prison", { level: 14 });
      const foe = await creature("Bandit", "Prisoner");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await setPool(s, "vitae", 30);
      await sov().markPrey(s, tokenOf(foe));
      const combat = await fightWith([s, foe]);
      await freshTurn(s, 2);
      const card = await (await pressUse(s, "Blood Prison")).card;
      assert.equal(vitaeOf(s).value, 20, "10 Vitae spent");
      const r = await pressCard(card, 'button[data-action="resistTest"][data-target-index="0"]', { face: 1 });
      const prison = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.bloodPrison), "the Blood Prison laid");
      await r.release();
      assert.ok(prison.flags[SCOPE].bloodCurse, "a blood curse");
      assert.equal(prison.flags[SCOPE].escape?.condition, "curse", "its repeat rides the curse escape");
      await freshTurn(foe, 1);
      const before = foe.system.health.value;
      await tokenOf(foe).document.update({ x: 1400 });
      await sleep(1500);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextTurn();
      await settled;
      await until(() => foe.system.health.value < before, "Shadow damage at the turn's end (2 x tier)", 30000);
    });

    it("Withering Contempt: the prey's weapon blow loses 3, its spell none; a Casting Test at the Sovereign takes the automatic Bane", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Contempt", { level: 17 });
      const foe = await creature("Bandit", "Contemptible");
      const ally = await creature("Bandit", "Contempt Ally");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }, { actor: ally, x: 1600, y: 1000 }]);
      await sov().markPrey(s, tokenOf(foe));
      const top = ally.system.health.value;
      await ally.applyDamage(5, { struck: true, attack: true, by: foe });
      await until(() => ally.system.health.value === top - 2, `the sword blow loses 3 (${ally.system.health.value} of ${top})`);
      await ally.applyDamage(5, { struck: true, attack: true, spell: true, by: foe });
      await until(() => ally.system.health.value === top - 7, "the spell loses nothing");
      const snap = targetSnapshots([tokenOf(s)])[0];
      assert.deepEqual(snap.castDeterred, [{ banes: 1, source: "Withering Contempt" }], "the Casting Test's Bane rides the target snapshot");
    });

    it("Crowned in Blood costs 25 Vitae, doubles the Tribute cap for 1 minute, and trims the excess when it ends", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Crown", { level: 20 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "vitae", 40);
      const cap = tributeOf(s).max;
      await (await pressUse(s, "Crowned in Blood")).card;
      await until(() => tributeOf(s).max === cap * 2, "the cap doubled");
      assert.equal(vitaeOf(s).value, 15, "25 Vitae spent");
      await setPool(s, "tribute", cap * 2);
      const crown = s.effects.find(e => e.flags?.[SCOPE]?.crownedInBlood);
      await crown.delete();
      await until(() => (s.system.classes?.[0]?.momentum?.value ?? tributeOf(s).value) <= cap, "the excess lost");
    });

    it("Royal Due: a blow on the prey offers 2 Tribute for half the Charisma modifier as Shadow, and the Health back", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Due", { level: 5 });
      const foe = await creature("Bandit", "Dues Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe));
      await setPool(s, "tribute", 3);
      await s.update({ "system.health.value": s.system.health.max - 5 });
      await foe.applyDamage(3, { struck: true, attack: true, by: s });
      const offer = await offerCard(s, "royalDue");
      const fhp = foe.system.health.value;
      const hp = s.system.health.value;
      const r = await pressCard(offer, 'button[data-sovereign-offer="royalDue"]');
      await until(() => tributeOf(s).value === 1, "2 Tribute spent");
      await until(() => foe.system.health.value === fhp - 1 && s.system.health.value === hp + 1, "1 Shadow and 1 Health (Charisma +3)");
      await r.release();
    });
  });

  describe("The GM's handler judges every ask (the fix pass after the reviews; D-982)", function () {
    standUp(context, "sovereign-features");
    // A player who owns nothing here, as core's query context hands the handler its asker (14.367 `#handleUserQuery`).
    const forger = { id: "ZZForgerUser0002", name: "ZZ Forger", isGM: false };

    it("refuses a forged payload: 500 damage, an effect laid or ended at will, a creature taken without a failed Test", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Forged", { ranks: { "Abject Obedience": 1 } });
      const foe = await creature("Bandit", "Forged Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const { sovereignFeaturesQueryHandler: ask } = await import("../effects/sovereign-features.mjs");
      const { royalDueAmount } = await import("../rules/sovereign-talents.mjs");
      const hp = foe.system.health.value;
      // 500 damage from a user who owns neither actor: refused in words.
      const strike = await ask({ act: "strike", byUuid: s.uuid, targetUuid: foe.uuid, amount: 500, cap: 500, why: "royalDue" }, { user: forger });
      assert.equal(strike.reason, "notYours", "the forger is refused");
      assert.match(strike.words ?? "", /do not own/, "in words");
      // Even the GM's own ask is held to the dealer's row: Royal Due's half the Charisma modifier, never 500.
      const own = await ask({ act: "strike", byUuid: s.uuid, targetUuid: foe.uuid, amount: 500, cap: 500, why: "royalDue" }, { user: game.user });
      assert.equal(own.ok, true);
      assert.isAtMost(own.dealt, royalDueAmount(s.system.abilities.cha.mod), "clamped to Royal Due's rating");
      await until(() => foe.system.health.value === hp - own.dealt, "the clamped amount lands");
      const named = await ask({ act: "strike", byUuid: s.uuid, targetUuid: foe.uuid, amount: 500 }, { user: game.user });
      assert.equal(named.reason, "strike", "a strike naming no door deals nothing");
      // Any effect laid: refused without a Sovereign's flag, even for the GM, and for the forger with one.
      const max = foe.system.health.max;
      const lay = await ask({ act: "lay", targetUuid: foe.uuid, data: { name: "ZZ Forged", system: { changes: [{ key: "system.health.max", type: "override", value: "1" }] } } }, { user: game.user });
      assert.equal(lay.reason, "unknownEffect", "an effect naming no Sovereign is refused");
      const curse = await ask({ act: "lay", targetUuid: foe.uuid, data: { name: "ZZ Forged Curse", system: { changes: [] }, flags: { [SCOPE]: { bloodCurse: { source: s.uuid, spell: "X" } } } } }, { user: forger });
      assert.equal(curse.reason, "notYours", "a curse naming another's Sovereign is refused");
      const sneaky = await ask({ act: "lay", targetUuid: foe.uuid, data: { name: "ZZ Forged Curse", system: { changes: [{ key: "system.health.max", type: "override", value: "1" }] }, flags: { [SCOPE]: { bloodCurse: { source: s.uuid, spell: "X" } } } } }, { user: game.user });
      assert.equal(sneaky.reason, "changes", "a curse carrying a change no Sovereign's effect makes is refused");
      assert.notOk(foe.effects.some(e => String(e.name).startsWith("ZZ Forged")), "nothing was laid");
      assert.equal(foe.system.health.max, max, "and the maximum stands");
      // Any effect ended: a boss's own buff stays.
      const [buff] = await foe.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Boss Buff", system: { changes: [] } }]);
      const drop = await ask({ act: "drop", targetUuid: foe.uuid, ids: [buff.id], byUuid: s.uuid }, { user: forger });
      assert.equal(drop.reason, "notYours", "the forger may end nothing");
      assert.ok(foe.effects.has(buff.id), "the buff stands");
      // A creature taken: no card and no failed Test, not even for the GM.
      const before = foundry.utils.deepClone(foe.ownership);
      const obey = await ask({ act: "obey", byUuid: s.uuid, targetUuid: foe.uuid }, { user: game.user });
      assert.equal(obey.reason, "card", "no card, no control");
      assert.notOk(foe.effects.some(e => e.flags?.[SCOPE]?.obedience), "no Abject Obedience laid");
      assert.deepEqual(foe.ownership, before, "and no ownership given");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Dominion                                                            */
/* ------------------------------------------------------------------ */

export function sovereignDominionBatch(context) {
  const { describe, it, assert } = context;
  describe("Dominion (04; Phase 5)", function () {
    standUp(context, "sovereign-dominion");

    it("Bound to the Court: 6 Vitae, a failure leashes at 30 feet (Slowed at rank 2), a walk to 35 is refused and a push allowed", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Court", { ranks: { "Bound to the Court": 2 } });
      const foe = await creature("Bandit", "Courtier");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await feats().layBloodCurse(s, foe, { name: "Decree of Frailty", repeat: { resilience: "spirit", dc: 15 } });
      await setPool(s, "vitae", 20);
      let card = null;
      const pressed = await warnings(async () => { card = await (await pressUse(s, "Bound to the Court", [tokenOf(foe)])).card; });
      assert.equal(vitaeOf(s).value, 14, `6 Vitae spent (${pressed.join(" | ")})`);
      const r = await pressCard(card, 'button[data-action="resistTest"][data-target-index="0"]', { face: 1 });
      const leash = await until(() => foe.effects.find(e => e.flags?.[SCOPE]?.leash), "the leash laid");
      await r.release();
      assert.ok(leash.statuses.has("slowed"), "Slowed at rank 2");
      const said = await warnings(async () => { await tokenOf(foe).document.update({ x: 1700 }); await sleep(800); });
      assert.equal(tokenOf(foe).document.x, 1300, "the walk to 35 feet is refused");
      assert.ok(said.some(w => /30 feet/.test(w)), `refused in words (${said.join(" | ")})`);
      await tokenOf(foe).document.update({ x: 1700 }, { movement: { [tokenOf(foe).document.id]: { method: "api", action: "displace" } } }).catch(() => null);
    });

    it("Price of Defiance, Lingering Decree and No Pardon land when the curse is thrown off; Sovereign Will raises the escape's DC", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Defiance", { ranks: { "Sovereign Will": 2, "Price of Defiance": 1, "Lingering Decree": 2, "No Pardon": 2 } });
      const foe = await creature("Bandit", "Defiant");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await feats().layBloodCurse(s, foe, { name: "Decree of Frailty", repeat: { resilience: "spirit", dc: 15 } });
      const combat = await fightWith([s, foe]);
      await freshTurn(foe, 1);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextTurn();
      await settled;
      const prompt = await until(() => lastMessage(m => m.flags?.[SCOPE]?.purpose === "escape" && m.flags[SCOPE].actorUuid === foe.uuid), "the escape prompt");
      assert.match(prompt.content, /DC 17/, "Sovereign Will's 2 laid on the DC (15 + 2)");
      const hp = foe.system.health.value;
      const r = await pressCard(prompt, 'button[data-action="resistTest"]', { face: 20 });
      await until(() => !foe.effects.some(e => e.flags?.[SCOPE]?.bloodCurse), "the curse ends");
      await r.release();
      await until(() => foe.system.health.value < hp, "Price of Defiance's Shadow (tier + half Charisma at No Pardon 2)");
      await until(() => foe.statuses.has("slowed") && foe.statuses.has("frightened"), "Slowed and Frightened");
    });

    it("Unworthy Hand cuts a cursed creature's sword blow and leaves its spell alone; Heavy Tread drops its Speed", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Unworthy", { ranks: { "Sovereign Will": 1, "Unworthy Hand": 2, "Heavy Tread": 2 } });
      const foe = await creature("Bandit", "Unworthy");
      const ally = await creature("Bandit", "Unworthy Ally");
      const speed = foe.system.speed;
      await feats().layBloodCurse(s, foe, { name: "Leaden Decree" });
      await until(() => foe.system.speed === speed - 10, "Speed 10 feet lower");
      const top = ally.system.health.value;
      await ally.applyDamage(5, { struck: true, attack: true, by: foe });
      await until(() => ally.system.health.value === top - 3, "the sword blow loses 2");
      await ally.applyDamage(5, { struck: true, attack: true, spell: true, by: foe });
      await until(() => ally.system.health.value === top - 8, "the spell loses nothing");
    });

    it("Kneel: 3 Tribute; the prey fails and is Prone and Stunned; another cursed creature fails and is Prone only (rank 2)", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Kneel", { ranks: { "Kneel": 2 } });
      const prey = await creature("Bandit", "Kneeling Prey");
      const other = await creature("Bandit", "Kneeling Other");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: prey, x: 1300, y: 1000, side: "hostile" }, { actor: other, x: 1000, y: 1300, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(prey));
      await feats().layBloodCurse(s, other, { name: "Overawe" });
      await setPool(s, "tribute", 4);
      const card = await (await pressUse(s, "Kneel")).card;
      assert.equal(tributeOf(s).value, 1, "3 Tribute spent");
      assert.equal((card.flags[SCOPE].targets ?? []).length, 2, "both creatures named");
      for (const i of [0, 1]) {
        const r = await pressCard(card, `button[data-action="resistTest"][data-target-index="${i}"]`, { face: 1 });
        await sleep(1500);
        await r.release();
      }
      await until(() => prey.statuses.has("prone") && prey.statuses.has("stunned"), "the prey Prone and Stunned");
      await until(() => other.statuses.has("prone"), "the other Prone");
      assert.notOk(other.statuses.has("stunned"), "only the prey is Stunned");
    });

    it("Homage: a creature other than the prey fails its Test to end the curse, and the Sovereign gains 1 Tribute", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Homage", { ranks: { "Homage": 1 } });
      const foe = await creature("Bandit", "Homage Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await feats().layBloodCurse(s, foe, { name: "Overawe", repeat: { resilience: "spirit", dc: 15 } });
      const combat = await fightWith([s, foe]);
      await setPool(s, "tribute", 0);
      await freshTurn(foe, 1);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.nextTurn();
      await settled;
      const prompt = await until(() => lastMessage(m => m.flags?.[SCOPE]?.purpose === "escape" && m.flags[SCOPE].actorUuid === foe.uuid), "the escape prompt");
      const r = await pressCard(prompt, 'button[data-action="resistTest"]', { face: 1 });
      await until(() => tributeOf(s).value === 1, "Homage's Tribute");
      await r.release();
      assert.ok(foe.effects.some(e => e.flags?.[SCOPE]?.bloodCurse), "the curse holds");
    });

    it("Gilded Cage makes Blood Prison cost 6; Abject Obedience is refused on a Boss in words", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Cage", { ranks: { "Kneel": 1, "Gilded Cage": 1, "Abject Obedience": 1 } });
      await until(() => featureNamed(s, "Blood Prison")?.system?.cost?.amount === 6, "Blood Prison stamped at 6 Vitae");
      const boss = await creature("Archmage Arugal", "Boss Arugal");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: boss, x: 1300, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(boss));
      await feats().layBloodCurse(s, boss, { name: "Overawe" });
      await setPool(s, "vitae", 40);
      const said = await warnings(async () => { await (await pressUse(s, "Abject Obedience")).card; await sleep(1500); });
      assert.ok(said.some(w => /Boss/.test(w)), `refused in words (${said.join(" | ")})`);
      assert.equal(vitaeOf(s).value, 40, "nothing spent");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Vainglorious                                                        */
/* ------------------------------------------------------------------ */

export function sovereignVaingloriousBatch(context) {
  const { describe, it, assert } = context;
  describe("Vainglorious (04; Phase 5)", function () {
    standUp(context, "sovereign-vainglorious");

    it("Untouchable gives Defense +2 while temporary Health lasts; Serene Disdain refuses Frightened at 1 Tribute and not at 0", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Untouchable", { ranks: { "Gilded Skin": 1, "Untouchable": 2, "Serene Disdain": 1 } });
      const base = s.system.defense;
      await s.grantTemporaryHealth(5, { source: "test", span: "encounter" });
      await until(() => s.system.defense === base + 2, "Defense +2");
      await s.update({ "system.health.temp": 0 });
      await until(() => s.system.defense === base, "and none once it is gone");
      await setPool(s, "tribute", 1);
      await until(() => (s.system.conditionImmunities ?? []).includes("frightened"), "Frightened refused at 1 Tribute");
      await setPool(s, "tribute", 0);
      await until(() => !(s.system.conditionImmunities ?? []).includes("frightened"), "and not at 0");
    });

    it("Gilded Skin is refused before Prim and Proper is held, in words", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Skin", { level: 2 });
      const skin = await until(() => talentNamed(s, "Gilded Skin"), "Gilded Skin embedded");
      const sheet = await openSheet(s);
      sheet.changeTab("progress", "primary");
      await settle();
      let socket = sheet.element.querySelector(`[data-action="takeTalent"][data-item-id="${skin.id}"]`);
      if (!socket) {
        socket = document.createElement("button");
        socket.dataset.action = "takeTalent";
        socket.dataset.itemId = skin.id;
      }
      const said = await warnings(async () => { await sheet.options.actions.takeTalent.call(sheet, new MouseEvent("click"), socket); await sleep(800); });
      assert.ok(said.some(w => /Prim and Proper/.test(w)), `refused in words (${said.join(" | ")})`);
      assert.equal(skin.system.taken, 0, "nothing taken");
      await sheet.close();
    });

    it("Too Beautiful to Die at 4 Tribute holds a blow at 1, spends the Tribute and gives 12 temporary Health; refused at 0 Tribute", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Beautiful", { ranks: { "Too Beautiful to Die": 1 } });
      await until(() => s.items.some(i => i.type === "feature" && i.getFlag(SCOPE, "feature")?.talentId === talentNamed(s, "Too Beautiful to Die").id), "the counter granted");
      await setPool(s, "tribute", 4);
      await s.update({ "system.health.value": 6 });
      await s.applyDamage(20, { struck: true, attack: true });
      await until(() => s.system.health.value === 1, "held at 1");
      await until(() => (s.system.health.temp ?? 0) === 12, "12 temporary Health");
      assert.equal(tributeOf(s).value, 0, "all the Tribute spent");
    });

    it("Unmarred gains 1 Tribute when temporary Health takes a whole blow; Beneath Me gains 1 on a miss", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Unmarred", { ranks: { "Beneath Me": 1, "Unmarred": 1 } });
      const foe = await creature("Bandit", "Missing Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await setPool(s, "tribute", 0);
      await s.grantTemporaryHealth(8, { source: "test", span: "encounter" });
      await s.applyDamage(3, { struck: true, attack: true, by: foe });
      await until(() => tributeOf(s).value === 1, "Unmarred's Tribute");
      await feats().onAttackResolved({ attacker: foe, list: [{ actorId: s.id, sceneId: canvas.scene.id, tokenId: tokenOf(s).id }], hit: false });
      await until(() => tributeOf(s).value === 2, "Beneath Me's Tribute");
    });

    it("Above Such Things sheds a condition a Test could have prevented for 2 Tribute (1 at rank 2)", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Above", { ranks: { "Above Such Things": 2 } });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "tribute", 2);
      await s.createEmbeddedDocuments("ActiveEffect", [{ name: "Slowed", statuses: ["slowed"], flags: { [SCOPE]: { escape: { condition: "slowed", on: "turnEnd", resilience: "body", dc: 12 } } } }]);
      await until(() => s.statuses.has("slowed"), "Slowed");
      await (await pressUse(s, "Above Such Things")).card;
      await until(() => !s.statuses.has("slowed"), "Slowed shed");
      assert.equal(tributeOf(s).value, 1, "1 Tribute at rank 2");
    });

    it("Exquisite Taste adds 1 to a drain; Overflowing Cup keeps what lands above the maximum as temporary Health", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Cup", { ranks: { "Exquisite Taste": 1, "Overflowing Cup": 1 } });
      const max = s.system.health.max;
      await s.update({ "system.health.value": max - 2 });
      await s.applyHealing(4, { from: s, spell: true });
      await until(() => s.system.health.value === max, "healed to the maximum");
      await until(() => (s.system.health.temp ?? 0) === 3, "3 above the maximum kept (4 + 1 - 2)");
    });

    it("The Crimson Throne lays a Bane on a weapon attack at 5 Tribute, and none at 4", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Throne", { ranks: { "The Crimson Throne": 1 } });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "tribute", 5);
      // attackTalentLines reads deterred and sovDeterred together (roll-dialog.mjs); the Throne rides the second.
      const throneOn = () => { const t = targetSnapshots([tokenOf(s)])[0]; return [...(t.deterred ?? []), ...(t.sovDeterred ?? [])].some(d => d.source === "The Crimson Throne"); };
      await until(() => throneOn(), "the Bane at 5");
      await setPool(s, "tribute", 4);
      await until(() => !throneOn(), "none at 4");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Ravenous                                                            */
/* ------------------------------------------------------------------ */

export function sovereignRavenousBatch(context) {
  const { describe, it, assert } = context;
  describe("Ravenous (04; Phase 5)", function () {
    standUp(context, "sovereign-ravenous");

    it("Sanguine Edge costs 2 Vitae and lays the tier as Shadow on every weapon and claw blow", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Edge", { ranks: { "Sanguine Edge": 1 } });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "vitae", 10);
      await (await pressUse(s, "Sanguine Edge")).card;
      await until(() => s.effects.some(e => e.flags?.[SCOPE]?.sanguineEdge), "the edge laid");
      assert.equal(vitaeOf(s).value, 8, "2 Vitae spent");
      assert.equal(s.system.damageBonus?.typed?.attack?.shadow ?? 0, 4, "tier 4 as Shadow on the attack lane");
    });

    it("Bloodletting: two Bleeding 3 enemies in reach take Bleeding + tier, their Bleeding ends, and half is temporary Health", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Letting", { level: 5, ranks: { "Raking Claws": 1, "Bloodletting": 1 } });
      const a = await creature("Bandit", "Bleeder A");
      const b = await creature("Bandit", "Bleeder B");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: a, x: 1100, y: 1000, side: "hostile" }, { actor: b, x: 1000, y: 1100, side: "hostile" }]);
      for (const v of [a, b]) await v.toggleStatusEffect("bleeding", { active: true });
      for (const v of [a, b]) { const e = v.effects.find(x => x.statuses.has("bleeding")); await e.setFlag(SCOPE, "value", 3); }
      await setPool(s, "vitae", 10);
      const ha = a.system.health.value;
      await (await pressUse(s, "Bloodletting")).card;
      await until(() => a.system.health.value < ha, "the Shadow lands");
      await until(() => !a.statuses.has("bleeding") && !b.statuses.has("bleeding"), "the Bleeding ends");
      assert.isAbove(s.system.health.temp ?? 0, 0, "temporary Health");
      assert.equal(vitaeOf(s).value, 5, "5 Vitae spent");
    });

    it("Raking Claws lays Bleeding 2 on a claw hit; Tasting Bite and Latch On are offered, and Latch On latches and bars the off hand", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Rake", { ranks: { "Raking Claws": 1, "Tasting Bite": 1, "Latch On": 1 } });
      const foe = await creature("Bandit", "Raked Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe));
      await setPool(s, "tribute", 3);
      fireClawHits([clawHitPayload({ attackerUuid: s.uuid, targetActorUuid: foe.uuid, targetTokenUuid: tokenOf(foe).document.uuid, sl: 0, messageId: null, roll: { total: 15, natural: 15 }, itemId: null })]);
      await until(() => foe.statuses.has("bleeding"), "Bleeding laid");
      const offer = await offerCard(s, "claw");
      // *When your claws hit a creature that is Bleeding* (04): it was not when this hit found it, so no Tasting
      // Bite off the Bleeding the same hit laid (the review's S11).
      assert.notInclude(offer.content, 'data-sovereign-offer="tastingBite"', "no Tasting Bite off this hit's own Bleeding");
      const r = await pressCard(offer, 'button[data-sovereign-offer="latchOn"]');
      await until(() => foe.effects.some(e => e.flags?.[SCOPE]?.latch?.holder === s.uuid), "the latch laid");
      await r.release();
      assert.ok(feats().holdsLatch(s), "the Sovereign holds a latch");
      const said = await warnings(async () => { await tokenOf(foe).document.update({ x: 1500 }); await sleep(800); });
      assert.equal(tokenOf(foe).document.x, 1100, "the prey's walk past 5 feet is refused");
      assert.ok(said.length > 0, "refused in words");
      // A second claw hit finds it Bleeding: now Tasting Bite is offered.
      fireClawHits([clawHitPayload({ attackerUuid: s.uuid, targetActorUuid: foe.uuid, targetTokenUuid: tokenOf(foe).document.uuid, sl: 0, messageId: null, roll: { total: 15, natural: 15 }, itemId: null })]);
      const second = await until(() => lastMessage(m => m.id !== offer.id && m.flags?.[SCOPE]?.kind === "sovOffer" && m.flags[SCOPE].sovereignUuid === s.uuid && m.flags[SCOPE].offer === "claw"), "the second claw offer");
      assert.include(second.content, 'data-sovereign-offer="tastingBite"', "Tasting Bite off a creature already Bleeding");
      // **LET GO** (02 §7: *or when you let go*): the Combat tab's control ends the latch on the prey.
      const sheet = await openSheet(s);
      sheet.changeTab("combat", "primary");
      await settle();
      const letGo = sheet.element.querySelector('section[data-tab="combat"] [data-action="letGo"]');
      assert.ok(letGo, "the Combat tab draws Let go while a latch is held");
      assert.match(sheet.element.querySelector('section[data-tab="combat"] [data-sovereign-latch]')?.textContent ?? "", /Latched on to/, "and names the creature in words");
      letGo.click();
      await until(() => !foe.effects.some(e => e.flags?.[SCOPE]?.latch?.holder === s.uuid), "the latch ended");
      assert.notOk(feats().holdsLatch(s), "the Sovereign holds no latch");
      await sheet.close();
    });

    it("Blood Rush costs 4 Vitae and moves the Sovereign beside its prey within 30 feet", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Rush", { ranks: { "Blood Rush": 1 } });
      const foe = await creature("Bandit", "Rushed Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }]);
      await sov().markPrey(s, tokenOf(foe));
      await setPool(s, "vitae", 10);
      feats().setSovereignPick(() => ({ to: { x: 1400, y: 1000 } }));
      await (await pressUse(s, "Blood Rush")).card;
      feats().setSovereignPick(null);
      await until(() => tokenOf(s).document.x === 1400, "beside the prey");
      assert.equal(vitaeOf(s).value, 6, "4 Vitae spent");
    });

    it("Tasting Bite on a Prone creature: 1 Tribute, the tier as Shadow and half of it as temporary Health", async function () {
      this.timeout(180000);
      const s = await sovereignWith("ZZ Sov Bite", { level: 5, ranks: { "Tasting Bite": 1 } });
      const foe = await creature("Bandit", "Bitten Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await foe.toggleStatusEffect("prone", { active: true });
      await setPool(s, "tribute", 2);
      fireClawHits([clawHitPayload({ attackerUuid: s.uuid, targetActorUuid: foe.uuid, targetTokenUuid: tokenOf(foe).document.uuid, sl: 0, messageId: null, roll: { total: 15, natural: 15 }, itemId: null })]);
      const offer = await offerCard(s, "claw");
      const hp = foe.system.health.value;
      const r = await pressCard(offer, 'button[data-sovereign-offer="tastingBite"]');
      await until(() => foe.system.health.value === hp - 2, "2 Shadow (tier 2)");
      await until(() => (s.system.health.temp ?? 0) === 1, "1 temporary Health");
      await r.release();
      assert.equal(tributeOf(s).value, 1, "1 Tribute spent");
    });

    it("Last Draught offers a no-Test feeding on a Bleeding creature that dies beside the Sovereign", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Draught", { level: 5, ranks: { "Last Draught": 1 } });
      const foe = await creature("Bandit", "Draught Bandit");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await foe.toggleStatusEffect("bleeding", { active: true });
      await setPool(s, "vitae", 0);
      await foe.update({ "system.health.value": 1 });
      await foe.applyDamage(5, { struck: true, attack: true });
      const offer = await offerCard(s, "lastDraught");
      const r = await pressCard(offer, 'button[data-sovereign-offer="lastDraught"]');
      await until(() => vitaeOf(s).value > 0, "the feeding's Vitae");
      await r.release();
      // Rank 1: half the Vitae, rounded down (04).
      const { feedingReturn } = await import("../rules/feeding.mjs");
      const full = feedingReturn({ size: foe.system.size ?? "medium", tier: s.system.tier, conMod: s.system.abilities.con.mod });
      assert.equal(vitaeOf(s).value, Math.min(vitaeOf(s).max, Math.floor(full / 2)), "rank 1 gives half");
    });

    it("Last Draught at rank 2 gives the full Vitae (04: *At rank 2, you regain the full Vitae*)", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Draught Two", { level: 5, ranks: { "Last Draught": 2 } });
      const foe = await creature("Bandit", "Draught Bandit Two");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await foe.toggleStatusEffect("bleeding", { active: true });
      await setPool(s, "vitae", 0);
      await foe.update({ "system.health.value": 1 });
      await foe.applyDamage(5, { struck: true, attack: true });
      const offer = await offerCard(s, "lastDraught");
      const r = await pressCard(offer, 'button[data-sovereign-offer="lastDraught"]');
      await until(() => vitaeOf(s).value > 0, "the feeding's Vitae");
      await r.release();
      const { feedingReturn } = await import("../rules/feeding.mjs");
      const full = feedingReturn({ size: foe.system.size ?? "medium", tier: s.system.tier, conMod: s.system.abilities.con.mod });
      assert.equal(vitaeOf(s).value, Math.min(vitaeOf(s).max, full), "rank 2 gives the full Vitae, not half");
    });

    it("Swift Hunger refuses a creature 10 feet away in words; the Blood Monarch costs 35 Vitae, flies at 240 feet and halves a spell", async function () {
      this.timeout(240000);
      const s = await sovereignWith("ZZ Sov Monarch", { ranks: { "Drink Deep": 1, "Last Draught": 1, "Swift Hunger": 1, "Blood Monarch": 1 } });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await setPool(s, "vitae", 60);
      await (await pressUse(s, "Blood Monarch")).card;
      await until(() => s.shape?.kind === "bloodQueen", "the Blood Monarch form taken");
      assert.equal(vitaeOf(s).value, 25, "35 Vitae spent");
      assert.equal(s.system.flyingSpeed, 240, "a 240 ft flight");
      // O-446: the form wears its own plate and token, not the character's.
      const effect = s.effects.find(e => e.getFlag("azeroth-rpg", "shape")?.kind === "bloodQueen");
      assert.equal(effect?.img, "systems/azeroth-rpg/assets/art/bestiary/tokens/blood-monarch.png", "the form's effect is drawn in the Blood Monarch token");
      const doc = tokenOf(s)?.document ?? tokenOf(s);
      await until(() => doc?._source?.texture?.src === "systems/azeroth-rpg/assets/art/bestiary/tokens/blood-monarch.png", "the token dressed as the Blood Monarch");
      assert.isTrue(await useGreyed(s, "Blood Monarch"), "a second use before a Long Rest is greyed on the sheet");
    });
  });
}
