/**
 * **THE RANGER'S THIRTY-SIX, LIVE** (04-TALENTS; D-773, the talent plan's Phase
 * 6). One focused test per talent the phase builds, through the real doors:
 *
 * - Marksmanship: Steady Aim's Focus back; Longshot's longer shot; Careful Shot's
 *   cancelled Banes; Piercing Shot's Pierce; Barrage's target limit and Chimaera
 *   Shot's wider circle and refund; Aimed Volley's Focus at SL 2, once a round;
 *   Concussive Shot's Slowed and lost Reaction; Trueshot's hit without a roll;
 *   Rapid Fire's free attacks; Deadeye's 17.
 * - Beast Mastery: Pack Tactics' flanking; Ferocious Bite's Bleeding; Mend Pet's
 *   heal on the companion; Shared Quarry at rank 2; Intimidation's Test; Beast
 *   Frenzy's attack after a kill.
 * - Survival: Wing Clip's Speed; Deterrence's Banes; 02's Snare escape and
 *   Entrapment's 5; Trapper's free Snare; Coated Blades' free coating and its
 *   poison with no Test.
 *
 * Written in Phase 6 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.ranger-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, give, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
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
const B = () => game.system.azeroth.bound;
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
async function sceneWith(placements, { width = 6000, height = 2000 } = {}) {
  const scene = await Scene.create({ name: "ZZ Ranger Talents Scene", width, height, grid: { size: 100, distance: 5, units: "ft" } });
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

/** Target one actor's token on the viewed scene. */
function target(actor) {
  const token = actor?.getActiveTokens?.(true)[0] ?? null;
  canvas.tokens.setTargets(token ? [token.id] : []);
  return token;
}

/** A Ranger at a level with these talents taken and these things held and worn. */
async function rangerWith(name, { level = 9, ranks = {}, weapons = [], armor = [], abilities = { dex: 16, wis: 14 } } = {}) {
  const ranger = await makeCharacter({ name, classes: [["Ranger", level]], weapons, armor, abilities });
  for (const n of [...weapons, ...armor]) {
    const item = await until(() => itemNamed(ranger, n), `${n} held`);
    // A bundle of arrows is carried and nocked, never worn (D-641).
    if (/arrows|bolts/i.test(n)) continue;
    await item.update({ "system.equipped": true });
    await until(() => ranger.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(ranger, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(ranger, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return ranger;
}

/** Bind a Wolf to the Ranger as its companion, through the one door (D-643). */
async function wolfFor(ranger) {
  const feature = await until(() => featureNamed(ranger, "Companion"), "the Companion feature");
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = await pack.getIndex();
  const entry = await pack.getDocument(index.find(e => e.name === "Wolf")._id);
  const wolf = await B().bind({ owner: ranger, feature, entry, kind: "companion", until: null });
  if (!wolf) throw new Error("no wolf was bound");
  made.push(wolf);
  return wolf;
}

/** Set a pool to a value - AFTER a fight starts, which begins every Momentum pool at 0. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** One attack straight through the workflow, the die pinned. */
async function strike(actor, { weapon = null, face = 15, dc = 5, ranged = true, ...extra } = {}) {
  const held = weapon ?? actor.readyWeapons?.()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: 3, kind: "physical", weaponRating: 3 },
      strike: { rangeKind: ranged ? "ranged" : "melee" }, weaponId: held?.id ?? null, traits: [], ...extra
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

export function rangerTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Ranger's thirty-six (D-773)", function () {
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
      // The creatures the batch bound go with their owners.
      for (const actor of game.actors.filter(a => a.getFlag("azeroth-rpg", "bond")?.ownerName?.startsWith("ZZ"))) await actor.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Marksmanship -------------------------------------------------- */

    it("STEADY AIM: an attack made with the dialog's Steady line ticked returns the rank in Focus", async function () {
      this.timeout(180000);
      const ranger = await rangerWith("ZZ RT Steady", { weapons: ["Shortbow"], ranks: { "Steady Aim": 2 } });
      await setPool(ranger, "focus", 5);
      const card = await strike(ranger, { chosen: ["steady"], boons: 1 });
      await until(() => poolOf(ranger, "focus").value === 7, "2 Focus back");
      assert.include(labels(card), "Steady Aim", "the card does not name the talent");
    });

    it("LONGSHOT: a shot past twice the Range is refused without it, and made with it at rank 2", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Longshot", { weapons: ["Shortbow", "Broadhead arrows"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The Shortbow's Range is 80, so 160 feet is the farthest it shoots; 200 is past it.
      await sceneWith([{ actor: ranger, x: 500, y: 1000 }, { actor: ghoul, x: 500 + 4000, y: 1000, side: "hostile" }], { width: 6000 });
      target(ghoul);
      const bow = itemNamed(ranger, "Shortbow");
      const said = await warnings(async () => { assert.isNull(await attackWithDialog(ranger, bow), "a shot past the maximum was made"); });
      assert.isNotEmpty(said, "the refusal was not said in words");
      await talentNamed(ranger, "Longshot").update({ "system.taken": 2 });
      await until(() => talentNamed(ranger, "Longshot").system.taken === 2, "Longshot at rank 2");
      const unpin = pinDie(15);
      let card = null;
      try {
        card = await attackWithDialog(ranger, ranger.items.get(bow.id));
      } finally {
        unpin();
      }
      assert.ok(card, "Longshot's 240 feet did not reach 200");
      made.push(card);
    });

    it("CAREFUL SHOT: a ranged attack's Engaged line is not raised, and the dialog says which talent took it", async function () {
      this.timeout(120000);
      const ranger = await rangerWith("ZZ RT Careful", { weapons: ["Shortbow"], ranks: { "Careful Shot": 2 } });
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const p = prepareRoll(ranger, { kind: "attack", rangeKind: "ranged", engaged: true, damage: { rating: 3 }, targets: [] });
      const ids = [...p.situational.automatic, ...p.situational.judgement].map(l => l.id);
      assert.notInclude(ids, "engagedRanged", "the Engaged Bane was raised");
      assert.notInclude(ids, "coverLight", "rank 2 left the cover line");
      assert.isTrue(p.situational.warnings.some(w => w.includes("Careful Shot")), "the warning does not name Careful Shot");
    });

    it("PIERCING SHOT: the rider's Pierce of the rank lands on the blow's mitigation, named on the card", async function () {
      this.timeout(180000);
      const ranger = await rangerWith("ZZ RT Piercing", { weapons: ["Shortbow"], ranks: { "Piercing Shot": 3 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await setPool(ranger, "focus", 10);
      const card = await strike(ranger, { targets: [rowOf(ghoul, { apByLocation: { body: 3, head: 3, limb: 3 } })], riders: ["piercing-shot"] });
      assert.equal(poolOf(ranger, "focus").value, 7, "3 Focus not paid");
      assert.include(formulas(card), game.i18n.format("AZEROTH.NextAttack.PierceRow", { n: 3 }), "the Pierce is not named");
      assert.equal(card.flags["azeroth-rpg"].damage.damage, card.flags["azeroth-rpg"].damageByTarget[0].damage);
    });

    it("BARRAGE: five targets are refused before the Focus, and CHIMAERA SHOT takes six, widens to 15 feet and refunds 2", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Barrage", { weapons: ["Shortbow"], ranks: { Barrage: 1 } });
      const ghouls = [];
      for (let i = 0; i < 5; i++) ghouls.push(await makeNpc("Plagued Ghoul"));
      await setPool(ranger, "focus", 10);
      const said = await warnings(async () => { assert.isNull(await use(ranger, "Barrage", { targets: ghouls.map(g => rowOf(g)) })); });
      assert.include(said, game.i18n.format("AZEROTH.Barrage.TooMany", { name: "Barrage", n: 5, max: 4 }));
      assert.equal(poolOf(ranger, "focus").value, 10, "a refused Barrage spent Focus");
      await talentNamed(ranger, "Chimaera Shot").update({ "system.taken": 1 });
      await until(() => talentNamed(ranger, "Chimaera Shot").system.taken === 1, "Chimaera Shot taken");
      const card = await use(ranger, "Barrage", { targets: ghouls.map(g => rowOf(g)) });
      assert.ok(card, "five targets were refused under Chimaera Shot");
      assert.equal(card.flags["azeroth-rpg"].area?.distanceFt, 15, "the circle did not widen to 15 feet");
      await until(() => poolOf(ranger, "focus").value === 10 - 4 + 2, "the 2 Focus back for more than four");
      assert.ok(parsed(card).querySelector('[data-action="attackFromCard"][data-budget="none"]'), "the card's Attack charges the budget again");
    });

    it("AIMED VOLLEY: an attack at SL 2 returns 2 Focus a rank, once a round", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Volley", { weapons: ["Shortbow"], ranks: { "Aimed Volley": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 2);
      const first = await strike(ranger, { targets: [rowOf(ghoul)], dc: 2, budget: "none" });
      assert.isAtLeast(first.rolls[0].outcome.sl, 2);
      await until(() => poolOf(ranger, "focus").value === 6, "4 Focus back");
      await strike(ranger, { targets: [rowOf(ghoul)], dc: 2, budget: "none" });
      await settle();
      assert.equal(poolOf(ranger, "focus").value, 6, "a second volley in the round returned Focus");
    });

    it("CONCUSSIVE SHOT: a hit Slows the target until the Ranger's next turn, and takes its Reaction at rank 2", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Concussive", { weapons: ["Shortbow"], ranks: { "Concussive Shot": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 10);
      await strike(ranger, { targets: [rowOf(ghoul)], riders: ["concussive-shot"] });
      const slowed = await until(() => ghoul.effects.find(e => e.statuses?.has("slowed")), "Slowed on the ghoul");
      assert.equal(slowed.duration?.expiry, "turnStart");
      assert.equal(slowed.start?.combatant, combat.getCombatantsByActor(ranger)[0].id, "not the Ranger's clock");
      const theirs = combat.getCombatantsByActor(ghoul)[0];
      await until(() => theirs.budget?.reaction === 0, "the ghoul's Reaction gone");
    });

    it("TRUESHOT: the rider hits without a roll at SL 3 at rank 2, whatever the die", async function () {
      this.timeout(180000);
      const ranger = await rangerWith("ZZ RT Trueshot", { weapons: ["Shortbow"], ranks: { "Aimed Volley": 1, Trueshot: 2 } });
      await setPool(ranger, "focus", 10);
      const card = await strike(ranger, { face: 1, dc: 30, riders: ["trueshot"] });
      assert.isTrue(card.rolls[0].outcome.success, "a natural 1 missed under Trueshot");
      assert.equal(card.rolls[0].outcome.sl, 3);
      assert.include(formulas(card), game.i18n.format("AZEROTH.Card.Forced", { n: 3 }));
    });

    it("RAPID FIRE: the Use pays its Full Action once a Long Rest, and the card's Attack costs nothing more", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Rapid", { level: 13, weapons: ["Shortbow", "Broadhead arrows"], ranks: { "Rapid Fire": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const card = await use(ranger, "Rapid Fire");
      assert.ok(card, "Rapid Fire was refused");
      const halves = mine.budget.halfActions;
      const button = parsed(card).querySelector('[data-action="attackFromCard"]');
      assert.equal(button?.dataset.budget, "none", "the Attack button charges the budget");
      const unpin = pinDie(15);
      try {
        const shot = await CARD_ACTIONS.attackFromCard(button, card);
        if (shot) made.push(shot);
      } finally {
        unpin();
      }
      await settle();
      assert.equal(combat.getCombatantsByActor(ranger)[0].budget.halfActions, halves, "a press charged a Half-Action");
    });

    it("DEADEYE: a full Quarry puts the Critical Injury on 17, and one short of full does not", async function () {
      this.timeout(180000);
      const ranger = await rangerWith("ZZ RT Deadeye", { level: 17, weapons: ["Shortbow"], ranks: { "Aimed Volley": 1, Trueshot: 1, Deadeye: 1 } });
      const quarry = poolOf(ranger, "quarry");
      await setPool(ranger, "quarry", quarry.max);
      const full = await strike(ranger);
      assert.equal(full.rolls[0].options.criticalOn, 17);
      await setPool(ranger, "quarry", Math.max(0, quarry.max - 1));
      const short = await strike(ranger);
      assert.notEqual(short.rolls[0].options.criticalOn, 17, "Deadeye fired below a full Quarry");
    });

    /* ---- Beast Mastery ------------------------------------------------- */

    it("PACK TACTICS: the Ranger and the wolf both Engaged with the target count as flanking, an automatic line", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Pack", { weapons: ["Longsword"], ranks: { "Pack Tactics": 1 } });
      const wolf = await wolfFor(ranger);
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: ranger, x: 1000, y: 1000 }, { actor: wolf, x: 1200, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      target(ghoul);
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      // The door measures it; the dialog draws what the door measured.
      const p = prepareRoll(ranger, { kind: "attack", rangeKind: "melee", damage: { rating: 3 }, packFlank: { names: ["Pack Tactics"] } });
      const line = p.situational.automatic.find(l => l.id === "flanking");
      assert.ok(line, "no automatic flanking line");
      assert.equal(line.name, "Pack Tactics");
      const sword = itemNamed(ranger, "Longsword");
      const unpin = pinDie(15);
      let card = null;
      try {
        card = await attackWithDialog(ranger, sword);
      } finally {
        unpin();
      }
      assert.ok(card, "the attack posted no card");
      made.push(card);
      assert.include(textOf(card), game.i18n.localize("AZEROTH.Modifier.Flanking"), "the flanking Boon is not on the card");
    });

    it("FEROCIOUS BITE: the wolf's attack at SL 2 lands Bleeding equal to the Ranger's rank", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Bite", { ranks: { "Ferocious Bite": 2 } });
      const wolf = await wolfFor(ranger);
      const ghoul = await makeNpc("Plagued Ghoul");
      const card = await strike(wolf, { targets: [rowOf(ghoul)], ranged: false, dc: 2 });
      assert.isAtLeast(card.rolls[0].outcome.sl, 2);
      await until(() => ghoul.statuses?.has("bleeding"), "Bleeding on the ghoul");
      assert.equal(ghoul.effects.find(e => e.statuses?.has("bleeding")).getFlag("azeroth-rpg", "value"), 2);
    });

    it("MEND PET: the Use heals the wolf by the tier a rank, and the Ranger not at all", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Mend", { ranks: { "Hardy Companion": 1, "Mend Pet": 2 } });
      const wolf = await wolfFor(ranger);
      await setPool(ranger, "focus", 10);
      await wolf.update({ "system.health.value": 1 });
      await ranger.update({ "system.health.value": Math.max(1, ranger.system.health.max - 5) });
      const mine = ranger.system.health.value;
      const card = await use(ranger, "Mend Pet");
      assert.ok(card, "Mend Pet was refused");
      const tier = ranger.system.tier ?? 1;
      await until(() => wolf.system.health.value === Math.min(wolf.system.health.max, 1 + tier * 2), "the wolf's Health");
      assert.equal(ranger.system.health.value, mine, "the Ranger was healed");
      assert.isNull(parsed(card).querySelector('[data-action="applyHealing"]'), "the card still offers a heal to whoever is selected");
    });

    it("SHARED QUARRY: at rank 2 the wolf's hit on the Ranger's mark builds the Ranger's Quarry", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Shared", { ranks: { "Shared Quarry": 2 } });
      const wolf = await wolfFor(ranger);
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, wolf, ghoul]);
      await ranger.setFlag("azeroth-rpg", "mark", { actorId: ghoul.id, tokenId: null });
      await setPool(ranger, "quarry", 0);
      await giveTurn(combat, wolf);
      await strike(wolf, { targets: [rowOf(ghoul)], ranged: false, budget: "none" });
      await until(() => poolOf(ranger, "quarry").value > 0, "the Ranger's Quarry built");
    });

    it("INTIMIDATION: the wolf's hit offers the Spirit Test at the Ranger's Spell DC, and a failure lays a Bane on every Test", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Intimidation", { level: 13, ranks: { Intimidation: 2 } });
      const wolf = await wolfFor(ranger);
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([ranger, wolf, ghoul]);
      const card = await strike(wolf, { targets: [rowOf(ghoul)], ranged: false });
      const button = parsed(card).querySelector('[data-action="resistTest"][data-purpose="intimidation"]');
      assert.ok(button, "no Intimidation Test on the card");
      assert.equal(button.dataset.resilience, "spirit");
      assert.equal(Number(button.dataset.dc), ranger.system.spellDC);
      const fail = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, card);
      } finally {
        fail();
      }
      const laid = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane")?.kind === "all"), "the Bane on every Test");
      assert.equal(laid.duration?.value, 2, "not a round a rank");
    });

    it("BEAST FRENZY: the wolf's kill offers one more attack, and a second in the round at rank 1 is refused", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Frenzy", { level: 13, ranks: { "Beast Frenzy": 1 } });
      const wolf = await wolfFor(ranger);
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, wolf, ghoul]);
      await giveTurn(combat, wolf);
      await ghoul.update({ "system.health.value": 1 });
      await ghoul.applyDamage(5, { struck: true, attack: true, by: wolf });
      const offer = await until(() => game.messages.contents.find(m => m.flags?.["azeroth-rpg"]?.killStrike?.identifier === "beast-frenzy" && m.speaker?.actor === wolf.id), "the kill's offer");
      made.push(offer);
      const button = parsed(offer).querySelector('[data-action="killStrike"]');
      assert.ok(button, "no button on the offer");
      const unpin = pinDie(15);
      try {
        const again = await CARD_ACTIONS.killStrike(button, offer);
        assert.ok(again, "the wolf did not attack again");
        made.push(again);
      } finally {
        unpin();
      }
      const said = await warnings(async () => { await CARD_ACTIONS.killStrike(button, offer); });
      assert.include(said, game.i18n.format("AZEROTH.ExtraStrike.Spent", { name: "Beast Frenzy" }));
    });

    /* ---- Survival ------------------------------------------------------ */

    it("WING CLIP: a hit drops the target's Speed 10 feet a rank until the Ranger's next turn", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Wing Clip", { weapons: ["Shortbow"], ranks: { "Wing Clip": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      await giveTurn(combat, ranger);
      await setPool(ranger, "focus", 10);
      const speed = ghoul.system.speed;
      await strike(ranger, { targets: [rowOf(ghoul)], riders: ["wing-clip"] });
      await until(() => ghoul.system.speed === Math.max(0, speed - 20), "20 feet off the ghoul's Speed");
      const drop = ghoul.effects.find(e => e.getFlag("azeroth-rpg", "speedDrop"));
      assert.equal(drop?.duration?.expiry, "turnStart");
      assert.equal(drop?.start?.combatant, combat.getCombatantsByActor(ranger)[0].id);
    });

    it("DETERRENCE: the Reaction lays a Bane a rank on attacks against the Ranger, which the attacker's dialog draws", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Deterrence", { ranks: { Deterrence: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([ranger, ghoul]);
      await setPool(ranger, "focus", 10);
      const card = await use(ranger, "Deterrence");
      assert.ok(card, "Deterrence was refused");
      await until(() => ranger.effects.find(e => e.getFlag("azeroth-rpg", "deterred")), "the Deterrence effect");
      // The target's snapshot reads the flag off the effect (`targetSnapshots`'
      // `deterred`); the dialog draws it as the attacker's automatic line.
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const { deterrencesOf } = await import("../effects/talent-states.mjs");
      assert.deepEqual(deterrencesOf(ranger), [{ banes: 2, source: "Deterrence" }], "the snapshot does not read the effect");
      const p = prepareRoll(ghoul, { kind: "attack", rangeKind: "melee", damage: { rating: 3 }, targets: [{ ...rowOf(ranger), deterred: [{ banes: 2, source: "Deterrence" }] }] });
      assert.equal(p.situational.automatic.find(l => l.id === "targetDeterred")?.banes, 2);
    });

    it("SNARE and ENTRAPMENT: an Entangled the Snare did not lay is not its to end; its own is, for an action spent once the Test is made, and deals 5", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Snare", { ranks: { Trapper: 1, "Snake Trap": 1, Entrapment: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const card = await use(ranger, "Snare", { targets: [rowOf(ghoul)] });
      const escape = parsed(card).querySelector('[data-action="resistTest"][data-purpose="snare"]');
      assert.ok(escape, "no escape on the Snare's card");
      // Held by something else (Entangling Roots' shape): refused in words, nothing spent.
      await ghoul.toggleStatusEffect("entangled", { active: true });
      const said = await warnings(async () => { await CARD_ACTIONS.resistTest(escape, card); });
      assert.include(said, game.i18n.format("AZEROTH.Snare.NotCaught", { name: ghoul.name }));
      assert.isTrue(ghoul.statuses.has("entangled"), "the escape ended an Entangled the Snare did not lay");
      await ghoul.toggleStatusEffect("entangled", { active: false });
      // The Snare's own catch, through the card's Inflict, carries its flag.
      const inflict = parsed(card).querySelector('[data-action="applyCondition"][data-condition="entangled"]');
      await CARD_ACTIONS.applyCondition(inflict, card);
      const caught = await until(() => ghoul.effects.find(e => e.statuses?.has("entangled")), "the Snare's Entangled");
      assert.deepEqual(caught.getFlag("azeroth-rpg", "snare"), { source: ranger.uuid });
      const theirs = await giveTurn(combat, ghoul);
      const halves = theirs.budget.halfActions;
      // A dismissed dialog spends nothing: the action is paid once the Test is made.
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const pending = CARD_ACTIONS.resistTest(escape, card);
      const { dialogFor } = await import("./fixtures.mjs");
      const dialog = await dialogFor(ghoul, 5000);
      await dialog?.close();
      await pending;
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      assert.equal(combat.getCombatantsByActor(ghoul)[0].budget.halfActions, halves, "a dismissed escape spent the action");
      const before = ghoul.system.health.value;
      const pass = pinDie(20);
      try {
        await CARD_ACTIONS.resistTest(escape, card);
      } finally {
        pass();
      }
      await until(() => !ghoul.statuses.has("entangled"), "the ghoul free");
      await until(() => ghoul.system.health.value === before - 5, "Entrapment's 5");
      assert.equal(combat.getCombatantsByActor(ghoul)[0].budget.halfActions, halves - 2, "the escape did not spend its action");
    });

    it("KILL SHOT: the card's Attack is made once, and a second press is refused in words before anything happens", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Kill Shot", { level: 17, weapons: ["Shortbow", "Broadhead arrows"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      await giveTurn(combat, ranger);
      await setPool(ranger, "quarry", 3);
      const card = await use(ranger, "Kill Shot", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Kill Shot was refused");
      assert.equal(card.flags["azeroth-rpg"].attacks?.allowed, 1, "the card records no allowance of one");
      const button = parsed(card).querySelector('[data-action="attackFromCard"]');
      const unpin = pinDie(15);
      try {
        const shot = await CARD_ACTIONS.attackFromCard(button, card);
        assert.ok(shot, "the first press made no attack");
        made.push(shot);
      } finally {
        unpin();
      }
      await until(() => game.messages.get(card.id)?.getFlag("azeroth-rpg", "attacksMade") === 1, "the press counted on the card");
      const before = game.messages.contents.length;
      const said = await warnings(async () => { assert.isNull(await CARD_ACTIONS.attackFromCard(button, game.messages.get(card.id))); });
      assert.include(said, game.i18n.format("AZEROTH.Feature.AttacksSpent", { name: "Kill Shot", n: 1 }));
      assert.equal(game.messages.contents.length, before, "the refused press posted something");
    });

    it("TRAPPER: the Snare is set with no Half-Action", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Trapper", { ranks: { Trapper: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const halves = mine.budget.halfActions;
      await use(ranger, "Snare");
      await settle();
      assert.equal(combat.getCombatantsByActor(ranger)[0].budget.halfActions, halves, "the Snare took a Half-Action");
    });

    it("COATED BLADES: a coating costs no action, and at rank 2 the poison's tick lands with no Test", async function () {
      this.timeout(240000);
      const ranger = await rangerWith("ZZ RT Coated", { weapons: ["Dagger"], ranks: { "Coated Blades": 2 } });
      const dagger = itemNamed(ranger, "Dagger");
      await dagger.update({ "system.equipped": true });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([ranger, ghoul]);
      const mine = await giveTurn(combat, ranger);
      const halves = mine.budget.halfActions;
      const tears = await give(ranger, "Serpent's tears");
      await workflows().useGear({ actor: ranger, item: tears });
      await until(() => ranger.items.get(dagger.id)?.getFlag("azeroth-rpg", "coating"), "the poison on the dagger");
      assert.equal(combat.getCombatantsByActor(ranger)[0].budget.halfActions, halves, "the coating cost an action");
      const card = await strike(ranger, { weapon: ranger.items.get(dagger.id), targets: [rowOf(ghoul)], ranged: false, coating: ranger.items.get(dagger.id).getFlag("azeroth-rpg", "coating"), budget: "none" });
      assert.isNull(parsed(card).querySelector('[data-action="resistTest"][data-purpose="poison"]'), "the card still offers the poison's Test");
      await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "tick")?.source === ranger.uuid), "the tick on the ghoul");
    });
  });
}
