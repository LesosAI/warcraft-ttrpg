/**
 * **THE SHAMAN'S THIRTY-SIX, LIVE** (04-TALENTS; D-774, the talent plan's Phase
 * 9). One focused test per talent the phase builds, through the real doors:
 *
 * - Elemental: Static Charge's charge gained and spent; Elemental Focus's next
 *   spell; Lava Burst's Ward ignored; Overload's second firing; Ascendance's SL.
 * - Enhancement: Stormlash once a round and Doom Winds on every hit;
 *   Rockbiter's first attack; Stormstrike's rider and Bane; Maelstrom's third
 *   hit; Shamanistic Rage's tier of Mana; Spirit Walk's walk; Earthen Shield
 *   while a totem stands.
 * - Restoration: Healing Wave's rank; Chain Heal's halves; Ancestral
 *   Knowledge's Mana back; Earthliving's heal and Ancestral Guidance's friend;
 *   Riptide's swift casts; Cloudburst's allies; 02's Reincarnation with Undying
 *   Spirit; Ancestral Tide's tick.
 *
 * Feral Spirit's call (two Spirit Wolves off the pack, D-776) is `quench-talent-roots.mjs`'s
 * (D-768) and is not repeated here.
 *
 * Written in Phase 9 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.shaman-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

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
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name && ["weapon", "armor"].includes(i.type)) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const formulas = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.formula).filter(Boolean);
const healButtons = card => [...parsed(card).querySelectorAll('[data-action="applyHealing"]')].map(b => Number(b.dataset.heal));
const usesOf = (actor, name) => featureNamed(actor, name)?.system?.uses?.value ?? null;

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
  const scene = await Scene.create({ name: "ZZ Shaman Talents Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** A Shaman at a level with these talents taken and these things held, waiting for what each grants or teaches. */
async function shamanWith(name, { level = 9, ranks = {}, spells = [], weapons = [], armor = [], abilities = { wis: 16, str: 14 } } = {}) {
  const shaman = await makeCharacter({ name, classes: [["Shaman", level]], spells, weapons, armor, abilities });
  for (const n of [...weapons, ...armor]) {
    const item = await until(() => itemNamed(shaman, n), `${n} held`);
    await item.update({ "system.equipped": true });
    await until(() => shaman.items.get(item.id)?.system?.equipped === true, `${n} equipped`);
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(shaman, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(shaman, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return shaman;
}

/** A plain ally to heal. */
const allyNamed = name => makeCharacter({ name, classes: [["Warrior", 3]] });

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Fill a pool to its maximum. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await setPool(actor, name, pool.max);
  return poolOf(actor, name);
}

/** Set a creature's Health. */
async function setHealth(actor, value) {
  await actor.update({ "system.health.value": value });
  await until(() => actor.system.health.value === value, `${actor.name} at ${value} Health`);
}

/** Cast through the workflow, the die pinned. */
async function cast(actor, name, { targets = [], face = 18, ...extra } = {}) {
  const spell = await until(() => spellNamed(actor, name), `${name} known`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().castSpell({ actor, spell, targets, ...extra });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Use a feature through the workflow, the die pinned. */
async function use(actor, name, { targets = [], face = 18, dc = 10, ...extra } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets, dc, ...extra });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** One weapon attack straight through the workflow, the die pinned. */
async function strike(actor, { face = 15, dc = 5, ...extra } = {}) {
  const held = actor.readyWeapons?.()[0] ?? null;
  const unpin = pinDie(face);
  try {
    const card = await workflows().rollTest({
      actor, kind: "attack", dc, title: held?.name ?? "Unarmed",
      damage: { rating: held?.system?.rating ?? 1, kind: "physical", weaponRating: held?.system?.rating ?? 1 },
      strike: { rangeKind: "melee" }, weaponId: held?.id ?? null, traits: [], ...extra
    });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** A bestiary entry, by name. */
async function entryNamed(name) {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = await pack.getIndex();
  const entry = index.find(e => e.name === name);
  return entry ? pack.getDocument(entry._id) : null;
}

export function shamanTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Shaman's thirty-six (D-774)", function () {
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

    /* ---- Elemental ------------------------------------------------------ */

    it("STATIC CHARGE: a Casting Test at SL 2 gains a charge, and an attack with the line ticked spends it for the tier", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Static", { ranks: { "Static Charge": 1 }, spells: ["Lightning Bolt"], weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(shaman, "mana");
      const bolt = await cast(shaman, "Lightning Bolt", { targets: [rowOf(ghoul)], face: 20 });
      assert.isAtLeast(bolt.flags["azeroth-rpg"].sl, 2, "the pinned bolt did not reach SL 2");
      await until(() => shaman.getFlag("azeroth-rpg", "staticCharges") === 1, "a charge gained");
      const blow = await strike(shaman, { targets: [rowOf(ghoul)], talentLines: ["static-charge"] });
      assert.isTrue(blow.rolls[0].outcome.success);
      const row = (blow.rolls[0].options.provenance ?? []).find(p => p.label === "Static Charge");
      assert.equal(row?.value, shaman.system.tier, "the charge did not add the tier");
      await until(() => (shaman.getFlag("azeroth-rpg", "staticCharges") ?? 0) === 0, "the charge spent");
    });

    it("ELEMENTAL FOCUS: an SL 3 Casting Test lays 2 Mana a rank off the next spell", async function () {
      this.timeout(180000);
      const shaman = await shamanWith("ZZ ShT Focus", { ranks: { "Static Charge": 1, "Elemental Focus": 2 }, spells: ["Lightning Bolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(shaman, "mana");
      const bolt = await cast(shaman, "Lightning Bolt", { targets: [rowOf(ghoul)], face: 20 });
      assert.isAtLeast(bolt.flags["azeroth-rpg"].sl, 3);
      await until(() => shaman.pendingNextSpell().amount === 4, "4 Mana off the next spell");
    });

    it("LAVA BURST: the line on a Fire spell ignores 2 Ward a rank, and strikes a use", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Lava", { ranks: { "Lava Burst": 1 }, spells: ["Scorch"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const warded = rowOf(ghoul, { wardBySchool: { fire: 2 } });
      await fill(shaman, "mana");
      const plain = await cast(shaman, "Scorch", { targets: [warded] });
      const left = usesOf(shaman, "Lava Burst");
      await fill(shaman, "mana");
      const burst = await cast(shaman, "Scorch", { targets: [warded], talentLines: ["lava-burst"] });
      assert.isAbove(burst.flags["azeroth-rpg"].damageByTarget[0].damage, plain.flags["azeroth-rpg"].damageByTarget[0].damage, "the Ward was not ignored");
      await until(() => usesOf(shaman, "Lava Burst") === left - 1, "a use struck");
    });

    it("OVERLOAD: an SL 3 damage spell's card fires again at half on a press, strikes a use, and refuses a second press", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Overload", { ranks: { "Static Charge": 1, "Elemental Focus": 1, Overload: 1 }, spells: ["Lightning Bolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(shaman, "mana");
      const card = await cast(shaman, "Lightning Bolt", { targets: [rowOf(ghoul)], face: 20 });
      const button = parsed(card).querySelector('[data-action="talentPress"][data-press="overload"]');
      assert.ok(button, "the card offers no Overload");
      const left = usesOf(shaman, "Overload");
      const again = await CARD_ACTIONS.talentPress(button, card);
      assert.ok(again, "the press posted no card");
      made.push(again);
      assert.equal(again.flags["azeroth-rpg"].kind, "overload");
      assert.equal(again.flags["azeroth-rpg"].targets[0].actorId, ghoul.id, "the second firing is not at the same target");
      await until(() => usesOf(shaman, "Overload") === left - 1, "a use struck");
      const said = await warnings(async () => {
        assert.isNull(await CARD_ACTIONS.talentPress(button, card), "a second press fired again");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.TalentLine.Pressed", { name: "Overload" }));
    });

    it("ASCENDANCE: out of a fight a round of the world's clock (D-778); in one, a Nature damage spell counts as one SL higher", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Ascend", { level: 13, ranks: { Ascendance: 2 }, spells: ["Lightning Bolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      // Rank 2 holds two uses a Long Rest: one here, one in the fight.
      assert.ok(await use(shaman, "Ascendance"), "Ascendance was refused out of a fight");
      const loose = await until(() => shaman.effects.find(e => e.getFlag("azeroth-rpg", "ascendance")), "the state laid out of a fight");
      assert.equal(loose.duration?.units, "seconds", "out of a fight the span is not the world's clock");
      await loose.delete();
      const combat = await fightWith([shaman, ghoul]);
      const mine = await giveTurn(combat, shaman);
      assert.ok(await use(shaman, "Ascendance"), "Ascendance was refused");
      await until(() => shaman.effects.some(e => e.getFlag("azeroth-rpg", "ascendance")), "the state laid");
      await mine.resetBudget();
      await fill(shaman, "mana");
      const bolt = await cast(shaman, "Lightning Bolt", { targets: [rowOf(ghoul)], face: 16 });
      assert.include(formulas(bolt), game.i18n.format("AZEROTH.Ascendance.Row", { n: 1 }), "the card does not say the SL rose");
    });

    /* ---- Enhancement ---------------------------------------------------- */

    it("STORMLASH: a weapon hit adds the rank once a round; DOOM WINDS lets it ride every hit", async function () {
      this.timeout(300000);
      const shaman = await shamanWith("ZZ ShT Lash", { level: 13, ranks: { Stormlash: 2, "Doom Winds": 1 }, weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([shaman, ghoul]);
      const mine = await giveTurn(combat, shaman);
      const lash = game.i18n.format("AZEROTH.Stormlash.Card", { n: 2 });
      const first = await strike(shaman, { targets: [rowOf(ghoul)], budget: "none" });
      assert.include(textOf(first), lash, "the first hit carried no Stormlash");
      const second = await strike(shaman, { targets: [rowOf(ghoul)], budget: "none" });
      assert.notInclude(textOf(second), lash, "Stormlash fired twice in a round");
      assert.ok(await use(shaman, "Doom Winds"), "Doom Winds was refused");
      await until(() => shaman.effects.some(e => e.getFlag("azeroth-rpg", "doomWinds")), "Doom Winds laid");
      await mine.resetBudget();
      const third = await strike(shaman, { targets: [rowOf(ghoul)], budget: "none" });
      assert.include(textOf(third), lash, "Doom Winds did not lift the once");
    });

    it("ROCKBITER: the first attack each round at a shaman with a shield meets the rank's Armor Points more, and the next does not", async function () {
      this.timeout(300000);
      const shaman = await shamanWith("ZZ ShT Rock", { ranks: { Rockbiter: 2 }, weapons: ["Mace"], armor: ["Kite shield"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([shaman, ghoul]);
      await giveTurn(combat, ghoul);
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const token = shaman.getActiveTokens(true)[0];
      const base = shaman.system.ap?.body ?? 0;
      const firstSnap = targetSnapshots([token])[0];
      assert.equal(firstSnap.apByLocation.body, base + 2, "the first attack does not meet Rockbiter's 2");
      const card = await strike(ghoul, { targets: [firstSnap], budget: "none" });
      assert.ok(card, "the ghoul's attack posted no card");
      const theirs = combat.getCombatantsByActor(shaman)[0];
      await until(() => (theirs.getFlag("azeroth-rpg", "round")?.once ?? []).includes("firstAttack"), "the first attack marked");
      assert.equal(targetSnapshots([token])[0].apByLocation.body, base, "the second attack met Rockbiter too");
    });

    it("STORMSTRIKE: the rider spends 3 Mana and lays a Bane on the target's next attack", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Storm", { ranks: { Stormlash: 1, Stormstrike: 1 }, weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(shaman, "mana");
      const full = poolOf(shaman, "mana").value;
      const card = await strike(shaman, { targets: [rowOf(ghoul)], riders: ["stormstrike"] });
      assert.isTrue(card.rolls[0].outcome.success);
      await until(() => poolOf(shaman, "mana").value === full - 3, "3 Mana spent");
      const bane = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "laidBane"))?.getFlag("azeroth-rpg", "laidBane"), "the Bane on the ghoul");
      assert.equal(bane.kind, "attack");
      assert.equal(bane.banes, 1);
    });

    it("MAELSTROM: every third weapon hit returns 2 Mana a rank", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Maelstrom", { ranks: { Maelstrom: 2 }, weapons: ["Mace"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await setPool(shaman, "mana", 0);
      await strike(shaman, { targets: [rowOf(ghoul)] });
      await strike(shaman, { targets: [rowOf(ghoul)] });
      assert.equal(poolOf(shaman, "mana").value, 0, "Mana before the third hit");
      await strike(shaman, { targets: [rowOf(ghoul)] });
      await until(() => poolOf(shaman, "mana").value === Math.min(poolOf(shaman, "mana").max, 4), "4 Mana on the third hit");
      assert.equal(shaman.getFlag("azeroth-rpg", "maelstrom"), 0, "the count did not start over");
    });

    it("SHAMANISTIC RAGE: the Use regains the tier in Mana", async function () {
      this.timeout(180000);
      const shaman = await shamanWith("ZZ ShT Rage", { level: 13, ranks: { "Shamanistic Rage": 1 } });
      await setPool(shaman, "mana", 0);
      assert.ok(await use(shaman, "Shamanistic Rage"), "the Use was refused");
      await until(() => poolOf(shaman, "mana").value === Math.min(poolOf(shaman, "mana").max, shaman.system.tier), "the tier's Mana, not 1");
    });

    it("SPIRIT WALK: out of a fight a round of the world's clock (D-778); in one, the Half-Action is the Move, and the walk is Disengaged and ignores Difficult ground", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Walk", { ranks: { "Spirit Walk": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      // Rank 2 holds two uses a Short Rest: one here, one in the fight.
      assert.ok(await use(shaman, "Spirit Walk"), "Spirit Walk was refused out of a fight");
      const loose = await until(() => shaman.effects.find(e => e.statuses?.has("disengaging")), "Disengaging out of a fight");
      assert.equal(loose.duration?.units, "seconds", "out of a fight the span is not the world's clock");
      assert.isTrue(loose.getFlag("azeroth-rpg", "ignoresGround"), "the walk does not ignore Difficult ground out of a fight");
      await loose.delete();
      const combat = await fightWith([shaman, ghoul]);
      const mine = await giveTurn(combat, shaman);
      const halves = mine.getFlag("azeroth-rpg", "budget").halfActions;
      const paid = Number(mine.getFlag("azeroth-rpg", "moveHalves")) || 0;
      assert.ok(await use(shaman, "Spirit Walk"), "Spirit Walk was refused");
      await until(() => mine.getFlag("azeroth-rpg", "budget").halfActions === halves - 1, "one Half-Action");
      await until(() => (Number(mine.getFlag("azeroth-rpg", "moveHalves")) || 0) === paid + 1, "the Move paid in the same write");
      const walking = await until(() => shaman.effects.find(e => e.statuses?.has("disengaging")), "Disengaging");
      assert.isTrue(walking.getFlag("azeroth-rpg", "ignoresGround"), "the walk does not ignore Difficult ground");
    });

    it("EARTHEN SHIELD: 2 less damage from every source while a totem of the shaman's stands, and none once it is gone", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Earthen", { level: 13, ranks: { "Earthen Shield": 1 } });
      const before = shaman.system.damageReduction ?? 0;
      const totem = await B().bind({ owner: shaman, feature: featureNamed(shaman, "Totem"), entry: await entryNamed("Searing Totem"), kind: "totem", until: "encounter" });
      assert.ok(totem, "no totem was bound");
      made.push(totem);
      await until(() => (shaman.system.damageReduction ?? 0) === before + 2, "2 less damage while it stands");
      await B().release(shaman, totem.uuid);
      await until(() => (shaman.system.damageReduction ?? 0) === before, "the reduction gone with the totem");
    });

    /* ---- Restoration ---------------------------------------------------- */

    it("HEALING WAVE at rank 3 restores 3 more, and the card says so", async function () {
      this.timeout(180000);
      const shaman = await shamanWith("ZZ ShT Wave", { ranks: { "Healing Wave": 3 } });
      const ally = await allyNamed("ZZ ShT Wave Ally");
      await fill(shaman, "mana");
      const card = await cast(shaman, "Healing Wave", { targets: [rowOf(ally)] });
      assert.include(formulas(card), game.i18n.format("AZEROTH.Card.HealAddRow", { n: 3 }));
    });

    it("CHAIN HEAL: Healing Wave's further friends take half, rounded down; one too many is refused", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Chain", { ranks: { "Healing Wave": 1, "Chain Heal": 1 } });
      const three = [];
      for (const n of ["A", "B", "C"]) three.push(await allyNamed(`ZZ ShT Chain ${n}`));
      await fill(shaman, "mana");
      const said = await warnings(async () => {
        assert.isNull(await cast(shaman, "Healing Wave", { targets: three.map(a => rowOf(a)) }), "Healing Wave named three at rank 1");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Heal.TooMany", { name: "Healing Wave", max: 2 }));
      const card = await cast(shaman, "Healing Wave", { targets: three.slice(0, 2).map(a => rowOf(a)) });
      const [whole, half] = healButtons(card);
      assert.equal(half, Math.floor(whole / 2), "the further friend does not take half");
    });

    it("ANCESTRAL KNOWLEDGE: a failed Casting Test's card takes back the Mana it paid, strikes a use, and refuses a second press", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Knowledge", { ranks: { "Ancestral Knowledge": 1 }, spells: ["Lightning Bolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(shaman, "mana");
      const full = poolOf(shaman, "mana").value;
      const card = await cast(shaman, "Lightning Bolt", { targets: [rowOf(ghoul)], face: 1 });
      assert.isFalse(card.flags["azeroth-rpg"].success ?? card.rolls[0].outcome.success, "the pinned bolt succeeded");
      await until(() => poolOf(shaman, "mana").value === full - 2, "the failed Test paid its 2");
      const button = parsed(card).querySelector('[data-action="talentPress"][data-press="refund"]');
      assert.ok(button, "the failed card offers no Mana back");
      await CARD_ACTIONS.talentPress(button, card);
      await until(() => poolOf(shaman, "mana").value === full, "the Mana back");
      await until(() => usesOf(shaman, "Ancestral Knowledge") === 0, "the use struck");
      const said = await warnings(async () => {
        assert.isNull(await CARD_ACTIONS.talentPress(button, card), "a second press took Mana back again");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.TalentLine.Pressed", { name: "Ancestral Knowledge" }));
    });

    it("EARTHLIVING and ANCESTRAL GUIDANCE: a melee attack heals the shaman, and the card's button the friend targeted within 10 feet, once at rank 1", async function () {
      this.timeout(300000);
      const shaman = await shamanWith("ZZ ShT Living", { level: 13, ranks: { Earthliving: 2, "Ancestral Guidance": 1 }, weapons: ["Mace"] });
      const friend = await allyNamed("ZZ ShT Living Friend");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: friend, x: 1100, y: 1000 }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }]);
      await setHealth(shaman, 1);
      await setHealth(friend, 1);
      const heal = Math.floor(shaman.system.tier / 2) + 2;
      const card = await strike(shaman, { targets: [rowOf(ghoul)] });
      await until(() => shaman.system.health.value === 1 + heal, "Earthliving's heal");
      const button = parsed(card).querySelector('[data-action="guidanceHeal"]');
      assert.ok(button, "the card offers Ancestral Guidance no button");
      canvas.tokens.setTargets([friend.getActiveTokens(true)[0].id]);
      await CARD_ACTIONS.guidanceHeal(button, card);
      await until(() => friend.system.health.value === 1 + heal, "the friend's heal");
      const said = await warnings(async () => {
        assert.isNull(await CARD_ACTIONS.guidanceHeal(button, card), "a second press healed at rank 1");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Card.HealsSpent", { name: "Ancestral Guidance", n: 1 }));
      canvas.tokens.setTargets([]);
    });

    it("ANCESTRAL GUIDANCE at rank 2: a second friend is healed, the same friend twice is refused in words (the architect's review)", async function () {
      this.timeout(300000);
      const shaman = await shamanWith("ZZ ShT Guidance Two", { level: 13, ranks: { Earthliving: 1, "Ancestral Guidance": 2 }, weapons: ["Mace"] });
      const a = await allyNamed("ZZ ShT Guidance A");
      const b = await allyNamed("ZZ ShT Guidance B");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: a, x: 1100, y: 1000 }, { actor: b, x: 900, y: 1000 }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }]);
      await setHealth(a, 1);
      await setHealth(b, 1);
      const card = await strike(shaman, { targets: [rowOf(ghoul)] });
      const button = parsed(card).querySelector('[data-action="guidanceHeal"]');
      assert.ok(button, "the card offers Ancestral Guidance no button");
      canvas.tokens.setTargets([a.getActiveTokens(true)[0].id]);
      await CARD_ACTIONS.guidanceHeal(button, card);
      await until(() => a.system.health.value > 1, "the first friend healed");
      const healedOnce = a.system.health.value;
      const said = await warnings(async () => {
        assert.isNull(await CARD_ACTIONS.guidanceHeal(button, card), "the same friend was healed twice");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Guidance.Again", { name: "Ancestral Guidance", target: a.name }));
      assert.equal(a.system.health.value, healedOnce, "the refused press healed anyway");
      canvas.tokens.setTargets([b.getActiveTokens(true)[0].id]);
      await CARD_ACTIONS.guidanceHeal(button, card);
      await until(() => b.system.health.value > 1, "the second friend healed");
      assert.deepEqual(game.messages.get(card.id).getFlag("azeroth-rpg", "guidanceHealed"), [a.uuid, b.uuid]);
      canvas.tokens.setTargets([]);
    });

    it("RIPTIDE: Healing Wave cast at a Half-Action once a round at rank 1; a second swift cast is refused", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Riptide", { ranks: { "Healing Wave": 1, Riptide: 1 } });
      const ally = await allyNamed("ZZ ShT Riptide Ally");
      const combat = await fightWith([shaman, ally]);
      const mine = await giveTurn(combat, shaman);
      await fill(shaman, "mana");
      const halves = mine.getFlag("azeroth-rpg", "budget").halfActions;
      assert.ok(await cast(shaman, "Healing Wave", { targets: [rowOf(ally)], swift: true }), "the swift cast was refused");
      await until(() => mine.getFlag("azeroth-rpg", "budget").halfActions === halves - 1, "a Half-Action, not an action");
      assert.include(mine.getFlag("azeroth-rpg", "round").once, "riptide:1");
      const said = await warnings(async () => {
        assert.isNull(await cast(shaman, "Healing Wave", { targets: [rowOf(ally)], swift: true }), "a second swift cast in the round");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Cast.Swift.NoRoundUses", { talent: "Riptide" }));
    });

    it("CLOUDBURST: the next Healing Wave restores the same to every ally within 20 feet of its target, and the promise is spent", async function () {
      this.timeout(300000);
      const shaman = await shamanWith("ZZ ShT Cloud", { level: 13, ranks: { Cloudburst: 1 }, spells: ["Healing Wave"] });
      const first = await allyNamed("ZZ ShT Cloud First");
      const near = await allyNamed("ZZ ShT Cloud Near");
      const far = await allyNamed("ZZ ShT Cloud Far");
      await sceneWith([{ actor: shaman, x: 2600, y: 1000 }, { actor: first, x: 1000, y: 1000 }, { actor: near, x: 1200, y: 1000 }, { actor: far, x: 2000, y: 1000 }]);
      assert.ok(await use(shaman, "Cloudburst"), "Cloudburst was refused");
      await until(() => shaman.getFlag("azeroth-rpg", "cloudburst"), "the promise laid");
      await fill(shaman, "mana");
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const card = await cast(shaman, "Healing Wave", { targets: targetSnapshots([first.getActiveTokens(true)[0]]) });
      const names = card.flags["azeroth-rpg"].targets.map(t => t.name);
      assert.include(names, "ZZ ShT Cloud Near");
      assert.notInclude(names, "ZZ ShT Cloud Far", "an ally 50 feet away took the heal");
      const [whole, again] = healButtons(card);
      assert.equal(again, whole, "the ally does not take the same amount");
      await until(() => !shaman.getFlag("azeroth-rpg", "cloudburst"), "the promise spent");
    });

    it("REINCARNATION with UNDYING SPIRIT: refused while standing; from Dying at half the maximum, a Dying friend beside at 1", async function () {
      this.timeout(240000);
      const shaman = await shamanWith("ZZ ShT Reincarnation", { level: 13, ranks: { "Undying Spirit": 1 } });
      const friend = await allyNamed("ZZ ShT Reincarnation Friend");
      const said = await warnings(async () => {
        assert.isNull(await use(shaman, "Reincarnation", { targets: [rowOf(friend)] }), "Reincarnation was used standing");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Reincarnation.NotDying", { name: shaman.name, ally: friend.name }));
      assert.equal(usesOf(shaman, "Reincarnation"), 1, "a refused Reincarnation spent its use");
      await setHealth(shaman, 0);
      await setHealth(friend, 0);
      assert.ok(await use(shaman, "Reincarnation", { targets: [rowOf(friend)] }), "Reincarnation was refused at 0");
      await until(() => shaman.system.health.value === Math.max(1, Math.floor(shaman.system.health.max / 2)), "half the maximum");
      await until(() => friend.system.health.value === 1, "the friend at 1");
      await until(() => usesOf(shaman, "Reincarnation") === 0, "the once a Long Rest struck");
    });

    it("ANCESTRAL TIDE: the cast stamps 4 Health at the start of each target's next turn", async function () {
      this.timeout(180000);
      const shaman = await shamanWith("ZZ ShT Tide", { level: 20, ranks: { Cloudburst: 1, "Ancestral Tide": 1 } });
      const ally = await allyNamed("ZZ ShT Tide Ally");
      await fightWith([ally]);
      await fill(shaman, "mana");
      const card = await cast(shaman, "Ancestral Tide", { targets: [rowOf(ally)] });
      assert.ok(card, "Ancestral Tide was refused");
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "heal", amount: 4 }, "the cast stamps no tick of 4");
    });
  });
}
