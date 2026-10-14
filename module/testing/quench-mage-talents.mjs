/**
 * **THE MAGE'S THIRTY-SIX, LIVE** (04-TALENTS; D-775, the talent plan's Phase
 * 10). One focused test per talent the phase builds, through the real doors:
 *
 * - Arcane: Improved Blink's reach and free Blink; Slow Time's friend;
 *   Overchanneller's Health; Clearcasting's Mana back; Mana Shield held free;
 *   Arcane Power on every spell; Spellsteal ending a Sustain; Netherwind's limit;
 *   Prismatic Ward; Archmage's Sustain and Boons.
 * - Fire: Ignite's tick; Fire Blast's Half-Action and Ward; Combustion's rank;
 *   Molten Skin's Fire back; Pyroblast's Stun at SL 3; Living Bomb; Burning Soul;
 *   Firestorm's area; Cauterize; Sunfire's DC.
 * - Frost: Frost Armor's Ward 2; Shatter's Boon and Critical Injury; Cone of
 *   Cold's length; Icy Veins' state; Frozen Core's immunity; and the "You know X"
 *   ranks (Fireball, Frostbolt, Arcane Missiles).
 *
 * The ten left are each a `gap` with its reason on the row (D-775) and have
 * nothing here to run.
 *
 * Written in Phase 10 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.mage-talents`.
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
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const formulas = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.formula).filter(Boolean);
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.label).filter(Boolean);
const usesOf = (actor, name) => featureNamed(actor, name)?.system?.uses?.value ?? null;
const sustained = actor => actor.getFlag("azeroth-rpg", "sustaining") ?? [];

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  speedDropped: false, health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
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
  const scene = await Scene.create({ name: "ZZ Mage Talents Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** A Mage at a level with these talents taken and these spells known, waiting for what each grants or teaches. */
async function mageWith(name, { level = 9, ranks = {}, spells = [], abilities = { int: 16 } } = {}) {
  const mage = await makeCharacter({ name, classes: [["Mage", level]], spells, abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(mage, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(mage, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return mage;
}

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

/** The Boons a skipped casting dialog takes for this actor against this target (the dialog's own reading). */
async function castingBoons(actor, target = null) {
  const { defaultChoice } = await import("../applications/roll-dialog.mjs");
  return defaultChoice(actor, { kind: "casting", title: "ZZ", modifiers: [], targets: target ? [target] : [] })?.boons ?? 0;
}

export function mageTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Mage's thirty-six (D-775)", function () {
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

    /* ---- Arcane ---------------------------------------------------------- */

    it("IMPROVED BLINK: the Blink reaches 40 feet at rank 2, the first a Short Rest costs no Mana, the next costs 2", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Blink", { ranks: { "Improved Blink": 2 } });
      const counter = await until(() => featureNamed(mage, "Improved Blink"), "the free Blink's counter granted");
      const before = (await fill(mage, "mana")).value;
      const free = await use(mage, "Blink");
      assert.ok(free, "the Blink was refused");
      assert.include(textOf(free), game.i18n.format("AZEROTH.Blink.Line", { name: mage.name, feet: 40 }));
      assert.equal(poolOf(mage, "mana").value, before, "the free Blink cost Mana");
      await until(() => mage.items.get(counter.id)?.system?.uses?.value === 0, "the counter's use struck");
      assert.ok(await use(mage, "Blink"), "the second Blink was refused");
      await until(() => poolOf(mage, "mana").value === before - 2, "the second Blink's 2 Mana");
    });

    it("SLOW TIME: the Blink names one friendly creature instead, and refuses a hostile one before the Mana", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Slow", { level: 11, ranks: { "Slow Time": 1 } });
      const ally = await makeCharacter({ name: "ZZ MaT Slow Ally", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: ally, x: 1200, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const before = (await fill(mage, "mana")).value;
      const said = await warnings(async () => {
        assert.isNull(await use(mage, "Blink", { targets: targetSnapshots([ghoul.getActiveTokens(true)[0]]) }), "a hostile creature was Blinked");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Laid.NotFriendly", { name: "Blink", target: ghoul.getActiveTokens(true)[0].name }));
      assert.equal(poolOf(mage, "mana").value, before, "the refusal cost Mana");
      const card = await use(mage, "Blink", { targets: targetSnapshots([ally.getActiveTokens(true)[0]]) });
      assert.include(textOf(card), game.i18n.format("AZEROTH.Blink.LineFriend", { name: ally.getActiveTokens(true)[0].name, feet: 20, talents: "Slow Time" }));
    });

    it("OVERCHANNELLER: an Overchannel's Health is the rank less, and the card says so", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Overch", { ranks: { Overchanneller: 2 }, spells: ["Frostbolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      await setHealth(mage, mage.system.health.max);
      const before = mage.system.health.value;
      const card = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)], overchannel: 1 });
      assert.ok(card, "the cast was refused");
      // Frostbolt is tier 1: a point costs 2 Health, and Overchanneller at rank 2 takes 2 off.
      assert.equal(mage.system.health.value, before, "the Overchannel still cost Health");
      assert.include(formulas(card), game.i18n.format("AZEROTH.Cast.OverchannelReliefRow", { n: 2 }));
    });

    it("CLEARCASTING: an Overchannelled cast that succeeds returns 2 Mana a rank", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Clear", { ranks: { Overchanneller: 1, Clearcasting: 2 }, spells: ["Frostbolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const full = await fill(mage, "mana");
      await setHealth(mage, mage.system.health.max);
      const card = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)], overchannel: 1, face: 18 });
      assert.isTrue(card.flags["azeroth-rpg"].success, "the pinned cast failed");
      const mana = card.flags["azeroth-rpg"].mana ?? 2;
      await until(() => poolOf(mage, "mana").value === Math.min(full.max, full.value - mana + 4), "4 Mana back");
      assert.include(labels(card).join(" "), "Clearcasting");
    });

    it("MANA SHIELD: at rank 2 the turn's start holds it for nothing, and says so", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Shield", { ranks: { "Mana Shield": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const card = await cast(mage, "Mana Shield");
      assert.ok(card, "Mana Shield was refused");
      await until(() => sustained(mage).length === 1, "Mana Shield held");
      const combat = await fightWith([mage, ghoul]);
      await giveTurn(combat, ghoul);
      const held = poolOf(mage, "mana").value;
      await giveTurn(combat, mage);
      await settle();
      assert.equal(poolOf(mage, "mana").value, held, "the upkeep charged Mana for a free Sustain");
      assert.lengthOf(sustained(mage), 1, "the Sustain ended");
    });

    it("ARCANE POWER: every spell adds the rank until the end of the next turn", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Power", { ranks: { "Arcane Missiles": 1, "Arcane Power": 2 }, spells: ["Frostbolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([mage, ghoul]);
      const mine = await giveTurn(combat, mage);
      await fill(mage, "mana");
      const plain = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)] });
      await mine.resetBudget();
      assert.ok(await use(mage, "Arcane Power"), "Arcane Power was refused");
      await until(() => mage.effects.some(e => e.getFlag("azeroth-rpg", "talentBuff") === "Arcane Power"), "the buff laid");
      await mine.resetBudget();
      await fill(mage, "mana");
      const powered = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)] });
      assert.equal(powered.flags["azeroth-rpg"].damageByTarget[0].damage, plain.flags["azeroth-rpg"].damageByTarget[0].damage + 2, "a Frost spell did not take Arcane Power's 2");
    });

    it("SPELLSTEAL: a Counterspell at a caster ends one Sustain it holds, chosen before the Mana", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Steal", { ranks: { Spellsteal: 1 } });
      const caster = await makeCharacter({ name: "ZZ MaT Steal Caster", classes: [["Mage", 5]], spells: ["Mana Shield"] });
      await fill(caster, "mana");
      await cast(caster, "Mana Shield");
      await until(() => sustained(caster).length === 1, "the caster's Sustain");
      await fill(mage, "mana");
      const card = await use(mage, "Counterspell", { targets: [rowOf(caster)] });
      assert.ok(card, "Counterspell was refused");
      await until(() => sustained(caster).length === 0, "the Sustain ended");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Spellsteal.Line", { target: caster.name, spell: "Mana Shield" }));
    });

    it("NETHERWIND: Shape the Weave holds a further Sustain a rank", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Nether", { level: 11, ranks: { Netherwind: 1 }, spells: ["Mana Shield"] });
      await until(() => featureNamed(mage, "Shape the Weave"), "Shape the Weave held");
      for (let i = 0; i < 5; i++) {
        await fill(mage, "mana");
        assert.ok(await cast(mage, "Mana Shield"), `cast ${i + 1} was refused`);
      }
      await until(() => sustained(mage).length === 4, "four Sustains held, not three or five");
    });

    it("PRISMATIC WARD: out of a fight a round of the world's clock (D-778); in one, Ward 2 against every school until the end of the next turn", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Prism", { level: 13, ranks: { "Prismatic Ward": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const before = { ...mage.system.ward };
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      assert.ok(await use(mage, "Prismatic Ward"), "Prismatic Ward was refused out of a fight");
      for (const school of Object.keys(CONFIG.AZEROTH.schools)) {
        await until(() => (mage.system.ward?.[school] ?? 0) === (before[school] ?? 0) + 2, `Ward 2 against ${school} out of a fight`);
      }
      const prism = () => mage.effects.filter(e => e.getFlag("azeroth-rpg", "cloakWard")?.source === "Prismatic Ward");
      assert.lengthOf(prism(), 1, "the Ward was not laid as one effect");
      assert.equal(prism()[0].duration?.units, "seconds", "out of a fight the span is not the world's clock");
      assert.equal(prism()[0].duration?.value, 6, "out of a fight the span is not one round");
      const combat = await fightWith([mage, ghoul]);
      await giveTurn(combat, mage);
      await fill(mage, "mana");
      assert.ok(await use(mage, "Prismatic Ward"), "Prismatic Ward was refused in a fight");
      await until(() => prism().length === 1 && prism()[0].duration?.units !== "seconds", "the fight's span replacing the clock's");
      for (const school of Object.keys(CONFIG.AZEROTH.schools)) {
        await until(() => (mage.system.ward?.[school] ?? 0) === (before[school] ?? 0) + 2, `Ward 2 against ${school}, replaced rather than stacked`);
      }
    });

    it("ARCHMAGE: while 07's spell stands, one Sustain more and a Boon a Sustain to four", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Archmage", { ranks: { Archmage: 1 }, spells: ["Mana Shield"] });
      await mage.createEmbeddedDocuments("ActiveEffect", [{ name: "Archmage", origin: mage.uuid, flags: { "azeroth-rpg": { identifier: "archmage" } } }]);
      for (let i = 0; i < 2; i++) {
        await fill(mage, "mana");
        await cast(mage, "Mana Shield");
      }
      await until(() => sustained(mage).length === 2, "two Sustains where 05 §12 alone allows one");
      await mage.setFlag("azeroth-rpg", "sustaining", [...sustained(mage), ...sustained(mage), { name: "ZZ" }]);
      assert.equal(await castingBoons(mage), 4, "Archmage's Boons are not four");
    });

    /* ---- Fire ------------------------------------------------------------ */

    it("IGNITE: Fire that reduced Health lays the rank as Fire at the target's next turn start, and the burn lays no other", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Ignite", { ranks: { Ignite: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await ghoul.applyDamage(3, { struck: true, attack: false, type: "fire", by: mage, spell: true });
      const laid = await until(() => ghoul.effects.find(e => e.getFlag("azeroth-rpg", "tick")?.ignite === true), "Ignite's tick");
      assert.equal(laid.getFlag("azeroth-rpg", "tick").amount, 2);
      await ghoul.applyDamage(2, { struck: true, attack: false, type: "fire", by: mage, ignite: true });
      await settle();
      assert.lengthOf(ghoul.effects.filter(e => e.getFlag("azeroth-rpg", "tick")?.ignite === true), 1, "Ignite's own tick laid another");
    });

    it("FIRE BLAST: a Fire spell at a Half-Action once a round, ignoring 2 Ward at rank 2", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Blast", { ranks: { Fireball: 1, "Fire Blast": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([mage, ghoul]);
      await giveTurn(combat, mage);
      await fill(mage, "mana");
      const warded = rowOf(ghoul, { wardBySchool: { fire: 2 } });
      const card = await cast(mage, "Fireball", { targets: [warded], swift: true });
      assert.ok(card, "the swift Fireball was refused");
      assert.include(formulas(card), game.i18n.localize("AZEROTH.Cast.Swift.Row"));
      assert.include(formulas(card), game.i18n.format("AZEROTH.Cast.WardPierceRow", { n: 2 }));
      const said = await warnings(async () => {
        await fill(mage, "mana");
        assert.isNull(await cast(mage, "Fireball", { targets: [warded], swift: true }), "a second Fire Blast in a round");
      });
      assert.isAbove(said.length, 0);
    });

    it("COMBUSTION: Fire on a creature burning from the mage's Ignite adds the rank, the dialog's line checked by the fact", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Combust", { ranks: { Fireball: 1, Ignite: 1, Combustion: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const token = ghoul.getActiveTokens(true)[0];
      const { castWithDialog } = await import("../applications/actions.mjs");
      const spell = await until(() => spellNamed(mage, "Fireball"), "Fireball learned");
      canvas.tokens.setTargets([token.id]);
      let card = null;
      try {
        await fill(mage, "mana");
        let unpin = pinDie(18);
        try { card = await castWithDialog(mage, spell); } finally { unpin(); }
        if (card) made.push(card);
        assert.notInclude(labels(card), "Combustion", "Combustion rode a target not yet burning");
        await ghoul.applyDamage(1, { struck: true, attack: false, type: "fire", by: mage, spell: true });
        await until(() => ghoul.effects.some(e => e.getFlag("azeroth-rpg", "tick")?.ignite === true), "Ignite burning");
        await fill(mage, "mana");
        unpin = pinDie(18);
        try { card = await castWithDialog(mage, spell); } finally { unpin(); }
        if (card) made.push(card);
      } finally {
        canvas.tokens.setTargets([]);
      }
      assert.ok((card.rolls[0].options.provenance ?? []).some(p => p.label === "Combustion" && p.value === 2), "Combustion's rank did not reach the burning target");
    });

    it("MOLTEN SKIN: Ward a rank against Fire, and Fire back on a creature that hits the mage in melee", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Molten", { ranks: { "Molten Skin": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await until(() => (mage.system.ward?.fire ?? 0) >= 2, "Ward 2 against Fire");
      const { retaliationRows } = await import("../effects/area-strikes.mjs");
      const rows = retaliationRows(mage, ghoul);
      const row = rows.find(r => r.name === "Molten Skin");
      assert.ok(row, "no Molten Skin row for a melee blow");
      assert.isTrue(row.melee);
      assert.equal(row.damage.type, "fire");
      assert.isAtLeast(row.damage.amount ?? 0, 1, "the rank's Fire reached nothing");
    });

    it("PYROBLAST: the Stun is offered at rank 2 on an SL 3 Test, and not on a bare success", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Pyro", { level: 11, ranks: { Pyroblast: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const high = await use(mage, "Pyroblast", { targets: [rowOf(ghoul)], face: 20, dc: 10 });
      assert.ok(parsed(high).querySelector('[data-action="applyCondition"][data-condition="stunned"]'), "an SL 3 Pyroblast offered no Stun");
      await fill(mage, "mana");
      const low = await use(mage, "Pyroblast", { targets: [rowOf(ghoul)], face: 11, dc: 10 });
      assert.isTrue(low.flags["azeroth-rpg"].sl < 3, "the pinned die reached SL 3");
      assert.isNull(parsed(low).querySelector('[data-action="applyCondition"][data-condition="stunned"]'), "the Stun was offered below SL 3");
    });

    it("LIVING BOMB: a creature that dies burning from Ignite sets off the tier a rank on every enemy within 10 feet", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Bomb", { ranks: { Ignite: 1, Combustion: 1, "Living Bomb": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const second = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 500, y: 1000 }, { actor: ghoul, x: 1000, y: 1000, side: "hostile" }, { actor: second, x: 1100, y: 1000, side: "hostile" }]);
      await ghoul.applyDamage(1, { struck: true, attack: false, type: "fire", by: mage, spell: true });
      await until(() => ghoul.effects.some(e => e.getFlag("azeroth-rpg", "tick")?.ignite === true), "Ignite burning");
      const before = second.system.health.value;
      await ghoul.applyDamage(ghoul.system.health.value + 5, { struck: true, attack: true, type: "physical", by: mage });
      await until(() => second.system.health.value < before, "the bomb's Fire on the creature beside");
    });

    it("BURNING SOUL: a Fire spell meets Immune (Fire) as Ward 3", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Soul", { ranks: { Fireball: 1, "Burning Soul": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const card = await cast(mage, "Fireball", { targets: [rowOf(ghoul, { immune: ["fire"] })] });
      const dealt = card.flags["azeroth-rpg"].damageByTarget[0];
      assert.isFalse(Boolean(dealt.immune), "the immunity stood");
      assert.isAbove(dealt.damage, 0, "Ward 3 took everything");
    });

    it("FIRESTORM: a success places a 20-foot area that burns at turn start for a round; a failure places nothing", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Storm", { level: 13, ranks: { Firestorm: 2 } });
      await fill(mage, "mana");
      const failed = await use(mage, "Firestorm", { face: 2, dc: 20 });
      assert.isFalse(failed.flags["azeroth-rpg"].success);
      assert.isNull(parsed(failed).querySelector('[data-action="placeArea"]'), "a failed Firestorm offered an area");
      // The failed Use struck its once a Short Rest; give it back for the success.
      await featureNamed(mage, "Firestorm").update({ "system.uses.value": 1 });
      await fill(mage, "mana");
      const card = await use(mage, "Firestorm", { face: 18, dc: 10 });
      const flags = card.flags["azeroth-rpg"];
      assert.equal(flags.areaTick?.damage?.rating, 2 * (mage.system.tier ?? 1), "the tick is not the tier a rank");
      assert.equal(flags.lasts?.rounds, 1);
      assert.ok(parsed(card).querySelector('[data-action="placeArea"]'), "the card offers no area");
    });

    it("CAUTERIZE: a blow to 0 leaves the mage at 1 once a Long Rest, and burns the enemies within 10 feet", async function () {
      this.timeout(300000);
      const mage = await mageWith("ZZ MaT Caut", { level: 13, ranks: { Cauterize: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: mage, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const counter = await until(() => featureNamed(mage, "Cauterize"), "the counter granted");
      const before = ghoul.system.health.value;
      await mage.applyDamage(mage.system.health.value + 10, { struck: true, attack: true, type: "physical", by: ghoul });
      await until(() => mage.system.health.value === 1, "held at 1");
      await until(() => mage.items.get(counter.id)?.system?.uses?.value === 0, "the use struck");
      await until(() => ghoul.system.health.value < before, "the Fire on the enemy beside");
      await mage.applyDamage(mage.system.health.value + 10, { struck: true, attack: true, type: "physical", by: ghoul });
      await until(() => mage.system.health.value === 0, "the second blow is not caught");
    });

    it("SUNFIRE: the Casting Test opens at DC 22, where 07 states 26", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Sun", { level: 17, ranks: { Firestorm: 1, Sunfire: 1 } });
      await until(() => spellNamed(mage, "Sunfire"), "Sunfire learned");
      await fill(mage, "mana");
      const card = await cast(mage, "Sunfire");
      assert.ok(card, "Sunfire was refused");
      assert.equal(card.rolls[0].options.dc, 22, "the Test was not made against DC 22");
    });

    /* ---- Frost ----------------------------------------------------------- */

    it("FROST ARMOR: at rank 2 the laid effect carries Ward 2 against Frost", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Armor", { ranks: { "Frost Armor": 2 } });
      await fill(mage, "mana");
      const card = await cast(mage, "Frost Armor");
      const change = (card.flags["azeroth-rpg"].applies?.changes ?? []).find(c => c.key === "system.ward.frost");
      assert.equal(String(change?.value), "2");
    });

    it("SHATTER: a Boon against a Slowed target, and at rank 2 a Critical Injury button on 19 or 20, pressed once", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Shatter", { ranks: { Frostbolt: 1, Permafrost: 1, Shatter: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const slowed = rowOf(ghoul, { statuses: ["slowed"] });
      assert.equal(await castingBoons(mage, slowed), 1, "no Boon against a Slowed target");
      assert.equal(await castingBoons(mage, rowOf(ghoul)), 0);
      await fill(mage, "mana");
      const card = await cast(mage, "Frostbolt", { targets: [slowed], face: 19 });
      const button = parsed(card).querySelector('[data-action="criticalInjury"]');
      assert.ok(button, "the card offers no Critical Injury");
      await CARD_ACTIONS.criticalInjury(button, card);
      const said = await warnings(async () => { await CARD_ACTIONS.criticalInjury(button, card); });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.TalentLine.Pressed", { name: "Frostbolt" }));
    });

    it("CONE OF COLD: the card's cone is 5 feet a rank longer", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Cone", { ranks: { "Cone of Cold": 2 } });
      await fill(mage, "mana");
      const card = await cast(mage, "Cone of Cold");
      assert.equal(card.flags["azeroth-rpg"].lengthen, 10);
    });

    it("ICY VEINS: out of a fight a round of the world's clock (D-778); in one, a Boon on Casting Tests and Frost spells 1 Mana a rank cheaper", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Veins", { level: 13, ranks: { Frostbolt: 1, "Icy Veins": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      // Once per Short Rest: the use out of a fight is given back before the fight's.
      assert.ok(await use(mage, "Icy Veins"), "Icy Veins was refused out of a fight");
      const veins = () => mage.effects.find(e => e.getFlag("azeroth-rpg", "icyVeins")) ?? null;
      await until(() => veins(), "the state laid out of a fight");
      assert.equal(veins().duration?.units, "seconds", "out of a fight the span is not the world's clock");
      await veins().delete();
      await featureNamed(mage, "Icy Veins").update({ "system.uses.value": featureNamed(mage, "Icy Veins").system.uses.max });
      const combat = await fightWith([mage, ghoul]);
      const mine = await giveTurn(combat, mage);
      assert.ok(await use(mage, "Icy Veins"), "Icy Veins was refused");
      await until(() => mage.effects.some(e => e.getFlag("azeroth-rpg", "icyVeins")), "the state laid");
      assert.equal(await castingBoons(mage), 1);
      await mine.resetBudget();
      const before = (await fill(mage, "mana")).value;
      const card = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)] });
      const entry = spellNamed(mage, "Frostbolt").system.mana;
      await until(() => poolOf(mage, "mana").value === before - Math.max(0, entry - 2), "Frostbolt 2 Mana cheaper");
      assert.include(labels(card), "Icy Veins");
    });

    it("FROZEN CORE: the mage is Immune (Frost), and Frost spells ignore 2 Ward", async function () {
      this.timeout(180000);
      const mage = await mageWith("ZZ MaT Core", { level: 13, ranks: { Frostbolt: 1, "Frozen Core": 1 } });
      await until(() => (mage.system.immune ?? []).includes("frost"), "Immune (Frost)");
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const warded = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul, { wardBySchool: { frost: 2 } })] });
      await fill(mage, "mana");
      const bare = await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)] });
      assert.equal(warded.flags["azeroth-rpg"].damageByTarget[0].damage, bare.flags["azeroth-rpg"].damageByTarget[0].damage, "the Ward took Frost damage");
    });

    it("YOU KNOW X: Fireball, Frostbolt and Arcane Missiles are learned with the talent and take its rank", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Know", { ranks: { Fireball: 2, Frostbolt: 1, "Arcane Missiles": 1 } });
      for (const name of ["Fireball", "Frostbolt", "Arcane Missiles"]) await until(() => spellNamed(mage, name), `${name} learned`);
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(mage, "mana");
      const card = await cast(mage, "Fireball", { targets: [rowOf(ghoul)] });
      assert.ok((card.rolls[0].options.provenance ?? []).some(p => p.label === "Fireball" && p.value === 2), "Fireball's rank did not reach the Rating");
    });

    /* ---- The final review of D-768 to D-775 ------------------------------ */

    it("FRESH POOLS: a Mana gain landing while the budget is written is kept by a cast's payment and a Use's", async function () {
      this.timeout(240000);
      const mage = await mageWith("ZZ MaT Fresh", { spells: ["Frostbolt"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([mage, ghoul]);
      const mine = await giveTurn(combat, mage);
      // 3 Mana lands after the budget's queued write and before the payment.
      const original = mine.spendAction.bind(mine);
      mine.spendAction = async (...args) => {
        const out = await original(...args);
        const p = poolOf(mage, "mana");
        await mage.updatePool({ itemId: p.itemId, kind: p.kind, value: Math.min(p.max, p.value + 3) });
        return out;
      };
      try {
        await setPool(mage, "mana", 5);
        const price = spellNamed(mage, "Frostbolt").system.mana;
        assert.ok(await cast(mage, "Frostbolt", { targets: [rowOf(ghoul)] }), "the cast was refused");
        await until(() => poolOf(mage, "mana").value === 5 + 3 - price, "the gain kept by the cast's payment");
        await mine.resetBudget();
        await setPool(mage, "mana", 5);
        assert.ok(await use(mage, "Blink"), "the Blink was refused");
        await until(() => poolOf(mage, "mana").value === 5 + 3 - 2, "the gain kept by the Use's payment");
      } finally {
        delete mine.spendAction;
      }
    });
  });
}
