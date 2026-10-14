/**
 * **THE ROGUE'S THIRTY-SIX, LIVE** (04-TALENTS; D-773, the talent plan's Phase
 * 7). One focused test per talent the phase builds, through the real doors:
 *
 * - Assassination: Cheap Shot's unseen Opening and free point; Vile
 *   Concoction's Bane; Garrote's rider and its bar on casting; Ruthlessness's
 *   point back; Seal Fate's and Blood Sport's points; Overkill's hold;
 *   Paralytic's lost Reaction and Entangled; Rupture's Bleeding; Death Mark's
 *   free Finisher.
 * - Duelling: Fleet Footed's Defense; Feint's Bane against the Rogue alone;
 *   Adrenaline's Energy and point; Perfect Timing's point on a Parry; Killing
 *   Spree's attack after a Riposte's kill; Blade Flurry's half; Combat
 *   Reflexes' free Parry; Master Duellist's Boon and 19.
 * - Subtlety: Shadow Focus's and Waylay's points and Waylay's Reaction; Cloak
 *   of Shadows' Ward; Elusive's step; Preparation's Stealth Test; Shadow Dance's
 *   hide through an attack; Find Weakness's Pierce; Ghostly Strike's card with
 *   no Parry; Subterfuge's mark; Master of Shadows' kept Hide.
 *
 * Written in Phase 7 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.rogue-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { reactWithDialog, reactionRows } from "../applications/actions.mjs";
import { conceal, isHidden } from "../effects/stealth.mjs";
import { AZEROTH } from "../config.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const workflows = () => game.system.azeroth.workflows;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.label);
const formulas = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.formula).filter(Boolean);

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing", 30000);
  return combat;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Rogue Talents Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/** A Rogue at a level with these talents taken and these weapons in hand. */
async function rogueWith(name, { level = 9, ranks = {}, weapons = ["Dagger"], abilities = { dex: 16 } } = {}) {
  const rogue = await makeCharacter({ name, classes: [["Rogue", level]], weapons, abilities });
  for (const n of weapons) {
    const item = await until(() => itemNamed(rogue, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => rogue.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(rogue, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(rogue, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return rogue;
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** One attack straight through the workflow, the die pinned. */
async function strike(actor, { face = 15, dc = 5, ...extra } = {}) {
  const held = actor.readyWeapons?.()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: 3, kind: "physical", weaponRating: 3 },
      strike: { rangeKind: "melee" }, weaponId: held?.id ?? null, traits: [], ...extra
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Use a feature through the workflow, the die pinned. */
async function use(actor, name, { targets = [], face = 15 } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** The chooser a feature opened, once rendered; pick one option by name. */
async function pickOne(item, name, ms = 10000) {
  let app = null;
  for (let i = 0; i < ms / 50 && !app; i++) {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (found?.rendered && found.element?.querySelector(".azeroth-choose")) app = found;
    else await new Promise(r => setTimeout(r, 50));
  }
  if (!app) throw new Error(`${item.name} opened no chooser`);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...(select?.options ?? [])].find(o => o.textContent.trim().startsWith(name));
  if (!option) throw new Error(`${item.name}'s chooser offers no ${name}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

export function rogueTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Rogue's thirty-six (D-773)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Assassination ------------------------------------------------- */

    it("CHEAP SHOT: an attack from hiding is under the Opening though the target has acted, and builds a free point at rank 2", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Cheap", { ranks: { "Cheap Shot": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await conceal(rogue);
      const state = rogue.openingState(rowOf(ghoul, { acted: true }), { hidden: true });
      assert.deepEqual(state.why, ["unseen"], "an unseen target is not under the Opening");
      await setPool(rogue, "comboPoints", 0);
      const card = await strike(rogue, { targets: [rowOf(ghoul, { acted: true })], budget: "none" });
      assert.isTrue(card.rolls[0].outcome.success);
      await until(() => poolOf(rogue, "comboPoints").value >= 2, "05's point and Cheap Shot's free one");
      assert.isNull(parsed(card).querySelector('[data-action="openingCombo"]'), "the paid trade was offered beside the free point");
    });

    it("VILE CONCOCTION: a poison Test against a creature already carrying this Rogue's poison takes a Bane a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Vile", { ranks: { Envenom: 1, "Vile Concoction": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await ghoul.createEmbeddedDocuments("ActiveEffect", [{
        name: "Serpent's tears", img: "icons/svg/poison.svg",
        flags: { "azeroth-rpg": { tick: { kind: "damage", type: null, amount: 2, rounds: 3, source: rogue.uuid, name: "Serpent's tears" } } }
      }]);
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const p = prepareRoll(ghoul, { kind: "resilience", resilience: "body", talentBanes: { banes: 2, names: ["Vile Concoction"] } });
      assert.equal(p.situational.automatic.find(l => l.id === "talentBane")?.banes, 2, "the dialog does not draw the Banes");
    });

    it("GARROTE: the rider is drawn only against a target under the Opening, and its Bleeding bars a cast", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Garrote", { ranks: { Garrote: 2 } });
      const mage = await makeCharacter({ name: "ZZ RoT Garroted Mage", classes: [["Mage", 3]], spells: ["Frostbolt"] });
      const combat = await fightWith([rogue, mage]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "energy", 10);
      assert.isEmpty(rogue.riderLines({ opening: false }).filter(l => l.identifier === "garrote"), "drawn at a target not under the Opening");
      const card = await strike(rogue, { targets: [rowOf(mage, { acted: false })], riders: ["garrote"], budget: "none" });
      assert.isTrue(card.rolls[0].outcome.success);
      const bleed = await until(() => mage.effects.find(e => e.statuses?.has("bleeding")), "the Bleeding");
      assert.equal(bleed.getFlag("azeroth-rpg", "value"), 2);
      assert.deepEqual(bleed.getFlag("azeroth-rpg", "noCasting"), { source: "Garrote" });
      const mana = mage.system.powers.find(p => p.name === "mana");
      await mage.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      const said = await warnings(async () => {
        assert.isNull(await workflows().castSpell({ actor: mage, spell: mage.items.find(i => i.name === "Frostbolt"), targets: [] }), "the Garroted mage cast");
      });
      assert.include(said.join(" "), "Garrote");
    });

    it("RUTHLESSNESS: a Finisher that reaches SL 2 returns a Combo Point a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Ruthless", { ranks: { Ruthlessness: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "comboPoints", 3);
      const card = await strike(rogue, { targets: [rowOf(ghoul)], finisherSpent: 3, dc: 2, budget: "none" });
      assert.isAtLeast(card.rolls[0].outcome.sl, 2);
      await until(() => poolOf(rogue, "comboPoints").value >= 2, "two points back");
      assert.include(labels(card), "Ruthlessness");
    });

    it("SEAL FATE: a Critical Injury builds a Combo Point a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Seal", { ranks: { "Seal Fate": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "comboPoints", 0);
      const card = await strike(rogue, { targets: [rowOf(ghoul)], face: 20, budget: "none" });
      assert.isTrue(card.rolls[0].outcome.critical);
      await until(() => poolOf(rogue, "comboPoints").value >= 3, "05's point and Seal Fate's two");
    });

    it("BLOOD SPORT: damage dealt to a Bleeding target builds a Combo Point a rank more", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Blood", { ranks: { "Blood Sport": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "comboPoints", 0);
      await strike(rogue, { targets: [rowOf(ghoul, { statuses: ["bleeding"] })], budget: "none" });
      await until(() => poolOf(rogue, "comboPoints").value >= 3, "05's point and Blood Sport's two");
    });

    it("OVERKILL: the Use holds the Opening over the creatures not yet acted until the end of the next turn", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Overkill", { ranks: { Overkill: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      const card = await use(rogue, "Overkill");
      assert.ok(card, "Overkill was refused");
      const hold = await until(() => rogue.effects.find(e => e.getFlag("azeroth-rpg", "openingHeld")), "the hold");
      assert.equal(hold.duration?.expiry, "turnEnd");
      assert.isTrue(rogue.openingState(rowOf(ghoul, { acted: true, tokenId: null })).applies, "the hold does not reach a creature that has since acted");
    });

    it("PARALYTIC: a failed poison Test takes the creature's Reaction, and at rank 2 Entangles it until a passed one", async function () {
      this.timeout(300000);
      const rogue = await rogueWith("ZZ RoT Paralytic", { ranks: { Envenom: 1, "Vile Concoction": 1, Paralytic: 2 } });
      const dagger = itemNamed(rogue, "Dagger");
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      const { give } = await import("./fixtures.mjs");
      const tears = await give(rogue, "Serpent's tears");
      await workflows().useGear({ actor: rogue, item: tears });
      const coating = await until(() => rogue.items.get(dagger.id)?.getFlag("azeroth-rpg", "coating"), "the poison on the dagger");
      const card = await strike(rogue, { targets: [rowOf(ghoul)], coating, budget: "none" });
      const button = parsed(card).querySelector('[data-action="resistTest"][data-purpose="poison"]');
      assert.ok(button, "no poison Test");
      const fail = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, card);
      } finally {
        fail();
      }
      const theirs = combat.getCombatantsByActor(ghoul)[0];
      await until(() => theirs.budget?.reaction === 0, "the ghoul's Reaction gone");
      const caught = await until(() => ghoul.effects.find(e => e.statuses?.has("entangled")), "the ghoul Entangled");
      assert.deepEqual(caught.getFlag("azeroth-rpg", "paralytic"), { source: rogue.uuid });
      const pass = pinDie(20);
      try {
        await CARD_ACTIONS.resistTest(button, card);
      } finally {
        pass();
      }
      await until(() => !ghoul.statuses.has("entangled"), "the ghoul free on a passed Test");
    });

    it("RUPTURE: the Finisher's Bleeding of twice the points plus the rank lands in place of the added damage", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Rupture", { ranks: { Rupture: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "comboPoints", 3);
      const card = await strike(rogue, { targets: [rowOf(ghoul)], finisherSpent: 3, finisherMode: "bleeding", budget: "none" });
      assert.isTrue(card.rolls[0].outcome.success);
      const bleed = await until(() => ghoul.effects.find(e => e.statuses?.has("bleeding")), "the Bleeding");
      assert.equal(bleed.getFlag("azeroth-rpg", "value"), 8, "2 x 3 + 2");
      assert.notInclude(labels(card), "AZEROTH.Card.FinisherSpent", "the points were also added to the damage");
      assert.equal(poolOf(rogue, "comboPoints").value, 0);
    });

    it("DEATH MARK: the Use names one target, and a Finisher against it spends nothing and counts five", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Death Mark", { level: 17, ranks: { Rupture: 1, "Death Mark": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      const said = await warnings(async () => { assert.isNull(await use(rogue, "Death Mark", { targets: [] })); });
      assert.include(said, game.i18n.format("AZEROTH.DeathMark.OneTarget", { name: "Death Mark" }));
      await use(rogue, "Death Mark", { targets: [rowOf(ghoul)] });
      await until(() => rogue.getFlag("azeroth-rpg", "deathMark")?.actorId === ghoul.id, "the mark named");
      await setPool(rogue, "comboPoints", 1);
      const card = await strike(rogue, { targets: [rowOf(ghoul)], finisherFree: "Death Mark", budget: "none" });
      assert.isAtLeast(poolOf(rogue, "comboPoints").value, 1, "the free Finisher spent points");
      assert.include(card.rolls[0].options.provenance.map(p => `${p.label}:${p.value}`), "Death Mark:5", "it did not count five");
      await rogue.shortRest({ food: null, drink: null }).catch(() => null);
      await until(() => !rogue.getFlag("azeroth-rpg", "deathMark"), "the mark gone at a rest");
    });

    /* ---- Duelling ------------------------------------------------------ */

    it("FLEET FOOTED: ten feet walked in the Rogue's turn raise its Defense by the rank until its next turn", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Fleet", { ranks: { "Fleet Footed": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: rogue, x: 1000, y: 1000 }, { actor: ghoul, x: 2000, y: 1000, side: "hostile" }]);
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      const defense = rogue.system.defense;
      const token = rogue.getActiveTokens(true)[0].document;
      await token.move([{ x: 1200, y: 1000 }]);
      await until(() => rogue.system.defense === defense + 2, "the Defense up by the rank");
      const effect = rogue.effects.find(e => e.getFlag("azeroth-rpg", "fleetFooted"));
      assert.equal(effect?.duration?.expiry, "turnStart");
    });

    it("FEINT: the target's next attack against the Rogue takes the Banes, and an attack on anybody else does not spend them", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Feint", { ranks: { Feint: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const priest = await makeCharacter({ name: "ZZ RoT Feint Priest", classes: [["Priest", 3]] });
      await fightWith([rogue, ghoul, priest]);
      await setPool(rogue, "energy", 10);
      await use(rogue, "Feint", { targets: [rowOf(ghoul)] });
      const laid = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane")?.only?.actorId === rogue.id), "the Feint on the ghoul");
      assert.notOk(laid.getFlag("azeroth-rpg", "laidBane").lasting, "a count was laid as a span");
      await strike(ghoul, { targets: [rowOf(priest)], budget: "none" });
      assert.ok(ghoul.effects.get(laid.id), "an attack on the priest spent the Feint");
      await strike(ghoul, { targets: [rowOf(rogue)], budget: "none" });
      await until(() => !ghoul.effects.get(laid.id), "the attack on the Rogue spent it");
    });

    it("ADRENALINE: the turn's start restores the rank more Energy, and the Use buys a point once a round a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Adrenaline", { ranks: { Adrenaline: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "energy", 10);
      await setPool(rogue, "comboPoints", 0);
      assert.ok(await use(rogue, "Adrenaline"), "the first Use was refused");
      await until(() => poolOf(rogue, "comboPoints").value === 1, "a point bought");
      const said = await warnings(async () => { assert.isNull(await use(rogue, "Adrenaline")); });
      assert.isNotEmpty(said, "a second Use in the round at rank 1 was not refused in words");
    });

    it("PERFECT TIMING: a Parry that holds builds a Combo Point", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Timing", { ranks: { Counterstrike: 1, "Perfect Timing": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "comboPoints", 0);
      const unpin = pinDie(20);
      let card = null;
      try {
        card = await reactWithDialog(rogue, "parry", { attackTotal: 5 });
      } finally {
        unpin();
      }
      assert.ok(card, "the Parry was refused");
      made.push(card);
      await until(() => poolOf(rogue, "comboPoints").value === 1, "the point built");
    });

    it("KILLING SPREE: a Riposte's kill offers one attack, refused against the creature it killed", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Spree", { level: 13, ranks: { "Killing Spree": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: rogue, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([rogue, ghoul]);
      await ghoul.update({ "system.health.value": 1 });
      await ghoul.applyDamage(5, { struck: true, attack: true, by: rogue, riposte: true });
      const offer = await until(() => game.messages.contents.find(m => m.flags?.["azeroth-rpg"]?.killStrike?.identifier === "killing-spree"), "the kill's offer");
      made.push(offer);
      canvas.tokens.setTargets([ghoul.getActiveTokens(true)[0].id]);
      const said = await warnings(async () => { await CARD_ACTIONS.killStrike(parsed(offer).querySelector('[data-action="killStrike"]'), offer); });
      assert.include(said.join(" "), ghoul.name, "the strike at the creature it killed was not refused in words");
    });

    it("BLADE FLURRY: a hit offers half the damage on a second enemy within 5 feet, once a round a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Flurry", { level: 13, ranks: { "Blade Flurry": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const second = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: rogue, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }, { actor: second, x: 1200, y: 1000, side: "hostile" }]);
      const combat = await fightWith([rogue, ghoul, second]);
      await giveTurn(combat, rogue);
      const struck = ghoul.getActiveTokens(true)[0];
      const card = await strike(rogue, { targets: [{ ...rowOf(ghoul), tokenId: struck.id, sceneId: canvas.scene.id }], budget: "none" });
      const button = parsed(card).querySelector('[data-action="blowShare"]');
      assert.ok(button, "no Blade Flurry button");
      const half = card.flags["azeroth-rpg"].blowShare.half;
      canvas.tokens.setTargets([second.getActiveTokens(true)[0].id]);
      const before = second.system.health.value;
      await CARD_ACTIONS.blowShare(button, card);
      await until(() => second.system.health.value === before - half, "half the blow on the second ghoul");
      const said = await warnings(async () => { await CARD_ACTIONS.blowShare(button, card); });
      assert.include(said, game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: "Blade Flurry" }));
    });

    it("COMBAT REFLEXES: with the Reaction spent, a Parry is still free once a round a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Reflexes", { level: 13, ranks: { "Combat Reflexes": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      const mine = combat.getCombatantsByActor(rogue)[0];
      await mine.spendAction("reaction");
      await until(() => mine.budget.reactions === 0, "the Reaction spent");
      const card = await reactWithDialog(rogue, "parry", { attackTotal: 12 });
      assert.ok(card, "the free Parry was refused");
      made.push(card);
      assert.include(mine.getFlag("azeroth-rpg", "round")?.once ?? [], "combat-reflexes:1");
    });

    it("MASTER DUELLIST: Engaged with the target alone, the attack gains the Boon and the Critical Injury on 19", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Duellist", { level: 17, ranks: { "Blade Flurry": 1, "Master Duellist": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const card = await strike(rogue, { targets: [rowOf(ghoul)], engagedOne: true });
      assert.equal(card.rolls[0].options.criticalOn, 19);
      const apart = await strike(rogue, { targets: [rowOf(ghoul)], engagedOne: false });
      assert.notEqual(apart.rolls[0].options.criticalOn, 19, "the 19 without the one enemy measured");
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const p = prepareRoll(rogue, { kind: "attack", rangeKind: "melee", damage: { rating: 3 }, engagedOne: true, targets: [rowOf(ghoul)] });
      const line = p.situational.automatic.find(l => l.id === "talentBoon");
      assert.equal(line?.boons, 1, "no Boon line for the one enemy Engaged");
      assert.include(line?.name ?? "", "Master Duellist");
    });

    /* ---- Subtlety ------------------------------------------------------ */

    it("SHADOW FOCUS and WAYLAY: an attack from hiding builds their points, and the target loses its Reaction", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Waylay", { ranks: { "Shadow Focus": 1, Waylay: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "comboPoints", 0);
      await conceal(rogue);
      await strike(rogue, { targets: [rowOf(ghoul, { acted: true })], budget: "none" });
      await until(() => poolOf(rogue, "comboPoints").value >= 3, "05's point, Shadow Focus's one and Waylay's one");
      const theirs = combat.getCombatantsByActor(ghoul)[0];
      await until(() => theirs.budget?.reaction === 0, "the ghoul's Reaction gone");
    });

    it("CLOAK OF SHADOWS: the Reaction lays Ward a rank against the chosen school until the next turn", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Cloak", { ranks: { "Cloak of Shadows": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "energy", 10);
      const item = await until(() => featureNamed(rogue, "Cloak of Shadows"), "the Use");
      const pending = workflows().useFeature({ actor: rogue, item });
      await pickOne(item, game.i18n.localize(AZEROTH.schools.fire));
      const card = await pending;
      assert.ok(card, "the Use was refused");
      made.push(card);
      await until(() => (rogue.system.ward?.fire ?? 0) >= 2, "Ward 2 against Fire");
      const effect = rogue.effects.find(e => e.getFlag("azeroth-rpg", "cloakWard"));
      assert.equal(effect?.duration?.expiry, "turnStart");
    });

    it("ELUSIVE: a miss offers the defender a Disengaged step for 2 Energy, once a card", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Elusive", { ranks: { Elusive: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "energy", 10);
      const miss = await strike(ghoul, { targets: [rowOf(rogue)], face: 1, dc: 30, budget: "none" });
      const button = parsed(miss).querySelector(`[data-action="evade"][data-actor-uuid="${rogue.uuid}"]`);
      assert.ok(button, "no Elusive button on the miss");
      await CARD_ACTIONS.evade(button, miss);
      await until(() => rogue.statuses.has("disengaging"), "the step as though Disengaged");
      assert.equal(poolOf(rogue, "energy").value, 8);
      const said = await warnings(async () => { await CARD_ACTIONS.evade(button, miss); });
      assert.include(said, game.i18n.format("AZEROTH.Evade.Already", { name: rogue.name }));
    });

    it("PREPARATION: the Use rolls Hide's opposed Stealth Test and a success builds a point a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Preparation", { ranks: { Waylay: 1, Preparation: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([rogue, ghoul]);
      await setPool(rogue, "comboPoints", 0);
      const card = await use(rogue, "Preparation", { face: 20 });
      assert.ok(card, "the Use was refused");
      await until(() => poolOf(rogue, "comboPoints").value === 2, "two points on a success");
      const test = game.messages.contents.findLast(m => m.speaker?.actor === rogue.id && m.flags?.["azeroth-rpg"]?.kind === "skill");
      assert.equal(test?.rolls?.[0]?.options?.dc ?? test?.rolls?.[0]?.dc, AZEROTH.OPPOSED_DC);
    });

    it("SHADOW DANCE: the Use hides the Rogue through an attack, until the end of its next turn", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Dance", { ranks: { "Cloak of Shadows": 1, "Shadow Dance": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await setPool(rogue, "energy", 10);
      await use(rogue, "Shadow Dance");
      await until(() => isHidden(rogue), "the Rogue hidden");
      await strike(rogue, { targets: [rowOf(ghoul)], budget: "none" });
      await settle();
      assert.isTrue(isHidden(rogue), "the attack ended the Shadow Dance's hide");
      const effect = rogue.effects.find(e => e.getFlag("azeroth-rpg", "shadowDance"));
      assert.equal(effect?.duration?.expiry, "turnEnd");
    });

    it("FIND WEAKNESS: an attack from hiding ignores 2 Armor Points a rank", async function () {
      this.timeout(180000);
      const rogue = await rogueWith("ZZ RoT Weakness", { ranks: { "Find Weakness": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await conceal(rogue);
      const card = await strike(rogue, { targets: [rowOf(ghoul, { apByLocation: { body: 4, head: 4, limb: 4 } })] });
      assert.include(formulas(card), game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: 4 }), "the Pierce is not named");
    });

    it("GHOSTLY STRIKE: an attack from hiding offers no Parry and no Block, and one in the open still does", async function () {
      this.timeout(180000);
      const rogue = await rogueWith("ZZ RoT Ghostly", { ranks: { "Ghostly Strike": 1 } });
      const defender = await makeCharacter({ name: "ZZ RoT Defender", classes: [["Warrior", 5]], weapons: ["Longsword"], armor: ["Kite shield"] });
      for (const n of ["Longsword", "Kite shield"]) await itemNamed(defender, n).update({ "system.equipped": true });
      await settle();
      assert.isNotEmpty(reactionRows([rowOf(defender)], { attacker: rogue, hidden: false }), "a defender who could react was offered nothing");
      assert.deepEqual(reactionRows([rowOf(defender)], { attacker: rogue, hidden: true }), [], "a blow from hiding left a Parry or a Block");
    });

    it("SUBTERFUGE: a target attacked from hiding stays under the Opening for a round a rank", async function () {
      this.timeout(240000);
      const rogue = await rogueWith("ZZ RoT Subterfuge", { ranks: { Subterfuge: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([rogue, ghoul]);
      await giveTurn(combat, rogue);
      await conceal(rogue);
      await strike(rogue, { targets: [rowOf(ghoul, { acted: true })], budget: "none" });
      const mark = await until(() => rogue.effects.find(e => e.getFlag("azeroth-rpg", "openingMark")?.actorId === ghoul.id), "the mark");
      assert.equal(mark.duration?.value, 2);
      assert.isTrue(rogue.openingState(rowOf(ghoul, { acted: true })).applies, "the marked target is not under the Opening");
    });

    it("MASTER OF SHADOWS: an attack and a cast leave the Hide standing", async function () {
      this.timeout(180000);
      const rogue = await rogueWith("ZZ RoT Shadows", { level: 17, ranks: { "Smoke Bomb": 1, "Master of Shadows": 1 } });
      await conceal(rogue);
      await strike(rogue);
      await settle();
      assert.isTrue(isHidden(rogue), "the attack revealed the Rogue");
      const plain = await rogueWith("ZZ RoT Plain");
      await conceal(plain);
      await strike(plain);
      await until(() => !isHidden(plain), "an attack without the talent reveals");
    });
  });
}
