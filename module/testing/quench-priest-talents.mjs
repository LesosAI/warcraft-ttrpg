/**
 * **THE PRIEST'S THIRTY-SIX, LIVE** (04-TALENTS; D-774, the talent plan's Phase
 * 8). One focused test per talent the phase builds, through the real doors:
 *
 * - 02's Ward, a laid effect: laid on the creature targeted for the school
 *   chosen, keyed on the priest's own next turn - and out of a fight on a round
 *   of the world's clock (D-778; the lead on O-161).
 * - Discipline: Mass Ward's two; Shield Discipline's reduction; Aegis Eternal's
 *   every school with no chooser; Absorption's Mana and Atonement's heal off a
 *   warded blow; Inner Focus's free Mana; Pain Suppression's reduction.
 * - Radiance: Renew's tick; Circle of Healing's halves; Divine Providence's two;
 *   Empowered Mending's reach and action; Guardian Spirit's heal; Chastise's
 *   pierce; Hymn of Hope's Mana.
 * - Shadow: Shadow Word: Pain's and Mind Flay's ticks; Shadowform's mark and its
 *   clearing; Vampiric Touch's heal; Twisted Faith's Boon; Silence; Shadowy
 *   Apparition's card; Void Eruption's Silenced.
 *
 * Written in Phase 8 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.priest-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { castWithDialog } from "../applications/actions.mjs";
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
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const labels = card => (card.rolls[0]?.options?.provenance ?? []).map(p => p.label);
const healButtons = card => [...parsed(card).querySelectorAll('[data-action="applyHealing"]')].map(b => Number(b.dataset.heal));
const wardOn = actor => actor.effects.find(e => e.getFlag("azeroth-rpg", "priestWard")) ?? null;

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
  const scene = await Scene.create({ name: "ZZ Priest Talents Scene", width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** A Priest at a level with these talents taken, waiting for what each grants or teaches. */
async function priestWith(name, { level = 9, ranks = {}, spells = [], abilities = { wis: 16 } } = {}) {
  const priest = await makeCharacter({ name, classes: [["Priest", level]], spells, abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(priest, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(priest, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return priest;
}

/** A plain ally to ward and heal. */
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

/** The Ward's Use, answering its school chooser. */
async function ward(priest, targets, school = "fire") {
  const item = await until(() => featureNamed(priest, "Ward"), "the Ward feature");
  const used = workflows().useFeature({ actor: priest, item, targets });
  await pickOne(item, game.i18n.localize(AZEROTH.schools[school]));
  const card = await used;
  if (card) made.push(card);
  return card;
}

export function priestTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Priest's thirty-six (D-774)", function () {
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

    /* ---- 02's Ward ------------------------------------------------------ */

    it("WARD: out of a fight a round of the world's clock (D-778); in one, Ward 1 of the school chosen on the creature targeted, until the priest's next turn", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Ward");
      const ally = await allyNamed("ZZ PrT Ward Ally");
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(priest, "mana");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      assert.ok(await ward(priest, [rowOf(ally)], "fire"), "the Ward was refused out of a fight");
      const loose = await until(() => wardOn(ally), "the Ward laid out of a fight");
      assert.equal(loose.duration?.units, "seconds", "out of a fight the span is not the world's clock");
      assert.equal(loose.duration?.value, 6, "out of a fight the span is not one round");
      await loose.delete();
      const combat = await fightWith([priest, ally, ghoul]);
      await giveTurn(combat, priest);
      await fill(priest, "mana");
      const before = ally.system.ward?.fire ?? 0;
      const card = await ward(priest, [rowOf(ally)], "fire");
      assert.ok(card, "the Ward posted no card");
      const effect = await until(() => wardOn(ally), "the Ward on the ally");
      assert.deepEqual(effect.getFlag("azeroth-rpg", "priestWard").schools, ["fire"]);
      await until(() => (ally.system.ward?.fire ?? 0) === before + 1, "Ward 1 against Fire");
      assert.equal(effect.duration?.expiry, "turnStart", "the Ward does not end at a turn's start");
      assert.equal(effect.start?.combatant, combat.getCombatantsByActor(priest)[0].id, "the Ward is not keyed on the priest's own turn");
      assert.equal(poolOf(priest, "mana").value, poolOf(priest, "mana").max - 2, "the Ward did not cost 2 Mana");
      // One Ward a priest a creature: a second replaces the first. The round's
      // one Reaction is spent, so the test hands it back first.
      await combat.getCombatantsByActor(priest)[0].resetBudget();
      await fill(priest, "mana");
      await ward(priest, [rowOf(ally)], "frost");
      await until(() => wardOn(ally)?.getFlag("azeroth-rpg", "priestWard")?.schools?.[0] === "frost", "the second Ward");
      assert.lengthOf(ally.effects.filter(e => e.getFlag("azeroth-rpg", "priestWard")), 1, "two Wards from one priest stand on one creature");
    });

    it("MASS WARD: the Ward names two; without it a second target is refused", async function () {
      this.timeout(240000);
      const plain = await priestWith("ZZ PrT Plain Ward");
      const priest = await priestWith("ZZ PrT Mass Ward", { ranks: { "Mass Ward": 1 } });
      const a = await allyNamed("ZZ PrT Mass A");
      const b = await allyNamed("ZZ PrT Mass B");
      await fightWith([plain, priest, a, b]);
      await fill(plain, "mana");
      const said = await warnings(async () => {
        assert.isNull(await use(plain, "Ward", { targets: [rowOf(a), rowOf(b)] }), "a plain Ward named two");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Ward.TooMany", { name: "Ward", n: 1 }));
      await fill(priest, "mana");
      await ward(priest, [rowOf(a), rowOf(b)], "shadow");
      await until(() => wardOn(a) && wardOn(b), "both warded");
    });

    it("SHIELD DISCIPLINE: the warded creature takes the rank less damage from every source", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Discipline", { ranks: { "Shield Discipline": 2 } });
      const ally = await allyNamed("ZZ PrT Discipline Ally");
      await fightWith([priest, ally]);
      await fill(priest, "mana");
      const before = ally.system.damageReduction ?? 0;
      await ward(priest, [rowOf(ally)], "fire");
      await until(() => (ally.system.damageReduction ?? 0) === before + 2, "2 less damage from every source");
      const health = ally.system.health.value;
      await ally.applyDamage(5, { struck: true, attack: true, type: "physical" });
      await until(() => ally.system.health.value === health - Math.max(0, 5 - before - 2), "the blow less the reduction");
    });

    it("AEGIS ETERNAL: no chooser, every school, and the effect says Dispel cannot remove it", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Aegis", { level: 20, ranks: { "Spirit Shell": 1, "Aegis Eternal": 1 } });
      const ally = await allyNamed("ZZ PrT Aegis Ally");
      await fightWith([priest, ally]);
      await fill(priest, "mana");
      assert.isNull(featureNamed(priest, "Ward").system.choice ?? null, "Aegis Eternal left the Ward a chooser");
      const card = await use(priest, "Ward", { targets: [rowOf(ally)] });
      assert.ok(card, "the Ward was refused");
      const effect = await until(() => wardOn(ally), "the Ward");
      assert.sameMembers(effect.getFlag("azeroth-rpg", "priestWard").schools, Object.keys(AZEROTH.schools));
      assert.include(effect.name, game.i18n.format("AZEROTH.Ward.EffectNameAegis", { schools: game.i18n.localize("AZEROTH.Ward.EverySchool"), name: priest.name }));
    });

    it("ABSORPTION and ATONEMENT: a Fire blow the Ward takes to nothing returns the rank's Mana, and heals the tier", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Atone", { ranks: { "Power Word: Shield": 1, Absorption: 2, Atonement: 1 } });
      const ally = await allyNamed("ZZ PrT Atone Ally");
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([priest, ally, ghoul]);
      await fill(priest, "mana");
      await ward(priest, [rowOf(ally)], "fire");
      await until(() => wardOn(ally), "the Ward");
      await setPool(priest, "mana", 0);
      await setHealth(ally, Math.max(1, ally.system.health.max - 6));
      const hurt = ally.system.health.value;
      // The card's Apply carries what the Ward took; the blow came to nothing.
      await ally.applyDamage(0, { struck: true, attack: true, type: "fire", by: ghoul, wardTook: 1 });
      await until(() => poolOf(priest, "mana").value === 2, "Absorption's 2 Mana");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, hurt + priest.system.tier), "Atonement's tier");
      // A blow of a school the Ward does not cover prevents nothing.
      await ally.applyDamage(0, { struck: true, attack: true, type: "frost", by: ghoul, wardTook: 1 });
      await settle();
      assert.equal(poolOf(priest, "mana").value, 2, "a Frost blow paid Absorption");
    });

    it("ATONEMENT credits only the priest's own Ward: a blow another Ward could take alone heals nothing (the architect's review)", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Own Ward", { ranks: { Atonement: 1 } });
      const ally = await allyNamed("ZZ PrT Own Ward Ally");
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([priest, ally, ghoul]);
      // A ring's Ward 2 against Fire, beside the priest's 1.
      await ally.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Fire ring", img: "icons/svg/fire.svg",
        system: { changes: [{ key: "system.ward.fire", type: "add", value: "2", phase: "final" }] }
      }]);
      await fill(priest, "mana");
      await ward(priest, [rowOf(ally)], "fire");
      await until(() => (ally.system.ward?.fire ?? 0) >= 3, "Ward 3 against Fire");
      await setHealth(ally, Math.max(1, ally.system.health.max - 6));
      const hurt = ally.system.health.value;
      // The ring alone takes a blow of 2: the priest's Ward prevented nothing.
      await ally.applyDamage(0, { struck: true, attack: true, type: "fire", by: ghoul, wardTook: 2 });
      await settle();
      assert.equal(ally.system.health.value, hurt, "Atonement healed off a blow the ring took alone");
      // A blow that took 3 needed the priest's point.
      await ally.applyDamage(0, { struck: true, attack: true, type: "fire", by: ghoul, wardTook: 3 });
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, hurt + priest.system.tier), "Atonement's tier");
    });

    /* ---- Discipline ----------------------------------------------------- */

    it("INNER FOCUS: the ticked line waives the cast's Mana and strikes the use; with none left the cast is refused, nothing spent", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Focus", { ranks: { "Inner Focus": 1 }, spells: ["Smite"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(priest, "mana");
      const full = poolOf(priest, "mana").value;
      const card = await cast(priest, "Smite", { targets: [rowOf(ghoul)], talentLines: ["inner-focus"] });
      assert.ok(card, "the cast was refused");
      assert.equal(poolOf(priest, "mana").value, full, "Inner Focus's cast spent Mana");
      await until(() => featureNamed(priest, "Inner Focus")?.system?.uses?.value === 0, "the use struck");
      const said = await warnings(async () => {
        assert.isNull(await cast(priest, "Smite", { targets: [rowOf(ghoul)], talentLines: ["inner-focus"] }), "a spent line was taken");
      });
      assert.include(said.join(" "), "inner-focus");
      assert.equal(poolOf(priest, "mana").value, full, "a refused cast spent Mana");
    });

    it("PAIN SUPPRESSION: the Apply lays 07's reduction of 3 and the rank's 1 more, and no Bleeding", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Pain", { ranks: { "Pain Suppression": 2 } });
      const ally = await allyNamed("ZZ PrT Pain Ally");
      await fill(priest, "mana");
      const before = ally.system.damageReduction ?? 0;
      const card = await cast(priest, "Pain Suppression", { targets: [rowOf(ally)] });
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"]');
      assert.ok(apply, "the card offers no Apply");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      await until(() => (ally.system.damageReduction ?? 0) === before + 5, "3 + 2 less damage");
      assert.isFalse(ally.statuses.has("bleeding"), "the Bleeding it may ignore was laid");
    });

    /* ---- Radiance ------------------------------------------------------- */

    it("RENEW at rank 2 stamps a heal of 2 + 2 a turn", async function () {
      this.timeout(180000);
      const priest = await priestWith("ZZ PrT Renew", { ranks: { Renew: 2 } });
      const ally = await allyNamed("ZZ PrT Renew Ally");
      await fightWith([ally]);
      await fill(priest, "mana");
      const card = await cast(priest, "Renew", { targets: [rowOf(ally)] });
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "heal", amount: 4 }, "Renew's tick is not 2 + 2");
    });

    it("CIRCLE OF HEALING: Mend's further targets take half, rounded down; a fourth is refused at rank 2", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Circle", { ranks: { "Circle of Healing": 2 } });
      const four = [];
      for (const n of ["A", "B", "C", "D"]) four.push(await allyNamed(`ZZ PrT Circle ${n}`));
      const [a, b, c, d] = four;
      await fill(priest, "mana");
      const said = await warnings(async () => {
        assert.isNull(await use(priest, "Mend", { targets: [rowOf(a), rowOf(b), rowOf(c), rowOf(d)] }), "Mend named four");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Heal.TooMany", { name: "Mend", max: 3 }));
      const card = await use(priest, "Mend", { targets: [rowOf(a), rowOf(b), rowOf(c)] });
      const [whole, ...halves] = healButtons(card);
      assert.isAbove(whole, 0, "Mend restored nothing");
      assert.deepEqual(halves, [Math.floor(whole / 2), Math.floor(whole / 2)], "the further targets do not take half");
    });

    it("DIVINE PROVIDENCE: Mend names two at the whole heal; without it, a second is refused", async function () {
      this.timeout(240000);
      const plain = await priestWith("ZZ PrT Mend Plain");
      const priest = await priestWith("ZZ PrT Providence", { ranks: { "Divine Providence": 1 } });
      const a = await allyNamed("ZZ PrT Providence A");
      const b = await allyNamed("ZZ PrT Providence B");
      await fill(plain, "mana");
      const said = await warnings(async () => {
        assert.isNull(await use(plain, "Mend", { targets: [rowOf(a), rowOf(b)] }), "02's Mend named two");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Heal.TooMany", { name: "Mend", max: 1 }));
      await fill(priest, "mana");
      const card = await use(priest, "Mend", { targets: [rowOf(a), rowOf(b)] });
      const [one, two] = healButtons(card);
      assert.equal(one, two, "the second named target does not take the whole heal");
    });

    it("EMPOWERED MENDING: Mass Mend reaches 10 feet further a rank, and costs an action at rank 2", async function () {
      this.timeout(180000);
      const priest = await priestWith("ZZ PrT Mending", { level: 9, ranks: { Renew: 1, "Empowered Mending": 1 } });
      const mass = await until(() => featureNamed(priest, "Mass Mend"), "Mass Mend");
      await until(() => featureNamed(priest, "Mass Mend")?.system?.area === "Each ally within 30 ft", "the reach at rank 1");
      assert.equal(mass.system.action, "full");
      await talentNamed(priest, "Empowered Mending").update({ "system.taken": 2 });
      await until(() => featureNamed(priest, "Mass Mend")?.system?.area === "Each ally within 40 ft", "the reach at rank 2");
      assert.equal(featureNamed(priest, "Mass Mend").system.action, "action", "rank 2 did not make it an action");
    });

    it("GUARDIAN SPIRIT: the Use restores the tier to the one creature targeted, and is refused with none", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Guardian", { ranks: { "Guardian Spirit": 1 } });
      const ally = await allyNamed("ZZ PrT Guardian Ally");
      const said = await warnings(async () => {
        assert.isNull(await use(priest, "Guardian Spirit", { targets: [] }), "Guardian Spirit was used at nobody");
      });
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Laid.OneTarget", { name: "Guardian Spirit" }));
      await setHealth(ally, 1);
      const card = await use(priest, "Guardian Spirit", { targets: [rowOf(ally)] });
      assert.deepEqual(healButtons(card), [priest.system.tier], "the Use does not restore the tier");
      const button = parsed(card).querySelector('[data-action="applyHealing"]');
      await CARD_ACTIONS.applyHealing(button, card);
      await until(() => ally.system.health.value === 1 + priest.system.tier, "the tier restored");
    });

    it("CHASTISE: the priest's Holy damage ignores 2 Ward a rank, and Shadow none", async function () {
      this.timeout(180000);
      const priest = await priestWith("ZZ PrT Chastise", { ranks: { "Divine Aegis": 1, Chastise: 2 } });
      assert.equal(priest.spellWardPierce("holy"), 4);
      assert.equal(priest.spellWardPierce("shadow"), 0);
    });

    it("HYMN OF HOPE: every ally within 30 feet, the priest among them, regains the tier a rank in Mana; one further away does not", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Hymn", { level: 13, ranks: { "Hymn of Hope": 2 } });
      const near = await makeCharacter({ name: "ZZ PrT Hymn Near", classes: [["Mage", 5]] });
      const far = await makeCharacter({ name: "ZZ PrT Hymn Far", classes: [["Mage", 5]] });
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }, { actor: near, x: 1400, y: 1000 }, { actor: far, x: 2400, y: 1000 }]);
      for (const a of [priest, near, far]) await setPool(a, "mana", 0);
      const card = await use(priest, "Hymn of Hope");
      assert.ok(card, "Hymn of Hope was refused");
      const gain = priest.system.tier * 2;
      await until(() => poolOf(near, "mana").value === Math.min(poolOf(near, "mana").max, gain), "the near ally's Mana");
      await until(() => poolOf(priest, "mana").value === Math.min(poolOf(priest, "mana").max, gain), "the priest's own Mana");
      assert.equal(poolOf(far, "mana").value, 0, "an ally 70 feet away regained Mana");
    });

    /* ---- Shadow --------------------------------------------------------- */

    it("SHADOW WORD: PAIN and MIND FLAY: the rank rides each spell's tick", async function () {
      this.timeout(180000);
      const priest = await priestWith("ZZ PrT Ticks", { ranks: { "Shadow Word: Pain": 3, "Mind Flay": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([ghoul]);
      await fill(priest, "mana");
      const pain = await cast(priest, "Shadow Word: Pain", { targets: [rowOf(ghoul)] });
      assert.deepInclude(pain.flags["azeroth-rpg"].tick, { kind: "damage", type: "shadow", amount: 2 + 3 });
      await fill(priest, "mana");
      const flay = await cast(priest, "Mind Flay", { targets: [rowOf(ghoul)] });
      assert.deepInclude(flay.flags["azeroth-rpg"].tick, { kind: "damage", type: "shadow", amount: 3 + 2 });
    });

    it("SHADOWFORM: the line comes ticked in a fight, a heal given marks it off, and the end of the priest's turn clears the mark", async function () {
      this.timeout(300000);
      const priest = await priestWith("ZZ PrT Shadowform", { ranks: { Shadowform: 2 }, spells: ["Mind Blast"] });
      const ally = await allyNamed("ZZ PrT Shadowform Ally");
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([priest, ally, ghoul]);
      const mine = await giveTurn(combat, priest);
      await fill(priest, "mana");
      const blast = async () => {
        const unpin = pinDie(18);
        try {
          const card = await castWithDialog(priest, spellNamed(priest, "Mind Blast"));
          if (card) made.push(card);
          return card;
        } finally {
          unpin();
        }
      };
      const first = await blast();
      assert.ok(first, "Mind Blast was refused");
      assert.include(labels(first), "Shadowform", "the line was not ticked with no Holy and no heal since the last turn");
      // Each step costs the turn's budget; the test hands it back between them.
      await mine.resetBudget();
      await setHealth(ally, 1);
      await fill(priest, "mana");
      await use(priest, "Mend", { targets: [rowOf(ally)] });
      await until(() => priest.getFlag("azeroth-rpg", "lightUsed")?.combat === combat.id, "the heal's mark");
      await mine.resetBudget();
      await fill(priest, "mana");
      const second = await blast();
      assert.ok(second, "the second Mind Blast was refused");
      assert.notInclude(labels(second), "Shadowform", "the line came ticked after a heal");
      await combat.nextTurn();
      await until(() => !priest.getFlag("azeroth-rpg", "lightUsed"), "the mark cleared at the end of the priest's turn", 30000);
    });

    it("VAMPIRIC TOUCH: Shadow damage dealt heals the rank, once a round", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Vampiric", { ranks: { "Shadow Word: Pain": 1, "Vampiric Touch": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([priest, ghoul]);
      await setHealth(priest, 2);
      await ghoul.applyDamage(2, { struck: true, attack: true, type: "shadow", by: priest });
      await until(() => priest.system.health.value === 4, "the rank restored");
      await ghoul.applyDamage(2, { struck: true, attack: true, type: "shadow", by: priest });
      await settle();
      assert.equal(priest.system.health.value, 4, "a second Shadow blow in the round healed again");
      await ghoul.applyDamage(1, { struck: true, attack: true, type: "holy", by: priest });
      await settle();
      assert.equal(priest.system.health.value, 4, "a Holy blow healed");
    });

    it("TWISTED FAITH: a Casting Test at a creature dealt Shadow takes a Boon; an attack only at rank 2", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Faith", { ranks: { "Twisted Faith": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fightWith([priest, ghoul]);
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const boonOf = kind => prepareRoll(priest, { kind, targets: [rowOf(ghoul)] }).situational.automatic.find(l => l.id === "talentBoon")?.boons ?? 0;
      assert.equal(boonOf("casting"), 0, "a Boon before any Shadow was dealt");
      await ghoul.applyDamage(1, { struck: true, attack: true, type: "shadow", by: priest });
      await until(() => Object.keys(priest.activeFight().getCombatantsByActor(priest)[0].getFlag("azeroth-rpg", "damaged") ?? {}).some(k => k.endsWith(":shadow")), "the Shadow mark");
      assert.equal(boonOf("casting"), 1, "no Boon on the Casting Test");
      assert.equal(boonOf("attack"), 0, "an attack took the Boon at rank 1");
      await talentNamed(priest, "Twisted Faith").update({ "system.taken": 2 });
      await until(() => talentNamed(priest, "Twisted Faith").system.taken === 2, "rank 2");
      assert.equal(boonOf("attack"), 1, "no Boon on the attack at rank 2");
    });

    it("SILENCE: out of a fight a round of the world's clock (D-778); in one, the creature targeted is Silenced until the priest's next turn", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Silence", { level: 13, ranks: { Silence: 2 } });
      const mage = await makeCharacter({ name: "ZZ PrT Silenced Mage", classes: [["Mage", 5]] });
      await fill(priest, "mana");
      // The lead, 2026-10-03, on O-161: *"Player can use them at anytime if selected."*
      // Rank 2 holds two uses a Short Rest: one here, one in the fight.
      assert.ok(await use(priest, "Silence", { targets: [rowOf(mage)] }), "Silence was refused out of a fight");
      const loose = await until(() => mage.effects.find(e => e.statuses?.has("silenced")), "Silenced out of a fight");
      assert.equal(loose.duration?.units, "seconds", "out of a fight the span is not the world's clock");
      await loose.delete();
      const combat = await fightWith([priest, mage]);
      await giveTurn(combat, priest);
      await fill(priest, "mana");
      assert.ok(await use(priest, "Silence", { targets: [rowOf(mage)] }), "Silence was refused");
      const effect = await until(() => mage.effects.find(e => e.statuses?.has("silenced")), "Silenced");
      assert.equal(effect.start?.combatant, combat.getCombatantsByActor(priest)[0].id, "Silenced is not keyed on the priest's turn");
      assert.equal(effect.duration?.expiry, "turnStart");
    });

    it("SHADOWY APPARITION: a creature dying under the priest's Shadow tick strikes every other enemy within 20 feet for the tier", async function () {
      this.timeout(300000);
      const priest = await priestWith("ZZ PrT Apparition", { level: 13, ranks: { "Shadowy Apparition": 1 } });
      const fallen = await makeNpc("Plagued Ghoul");
      const near = await makeNpc("Plagued Ghoul");
      const far = await makeNpc("Plagued Ghoul");
      await fallen.update({ name: "ZZ PrT Fallen" });
      await near.update({ name: "ZZ PrT Near" });
      await far.update({ name: "ZZ PrT Far" });
      await sceneWith([
        { actor: priest, x: 600, y: 1000 }, { actor: fallen, x: 1000, y: 1000, side: "hostile" },
        { actor: near, x: 1200, y: 1000, side: "hostile" }, { actor: far, x: 2400, y: 1000, side: "hostile" }
      ]);
      await fallen.createEmbeddedDocuments("ActiveEffect", [{
        name: "Shadow Word: Pain", img: "icons/svg/skull.svg",
        flags: { "azeroth-rpg": { tick: { kind: "damage", type: "shadow", amount: 2, rounds: 3, source: priest.uuid, name: "Shadow Word: Pain" } } }
      }]);
      const count = game.messages.size;
      await fallen.applyDamage(fallen.system.health.value + 5, { struck: true, attack: true, type: "shadow", by: priest });
      const card = await until(() => game.messages.contents.slice(count).find(m => m.flags?.["azeroth-rpg"]?.kind === "apparition"), "the apparition's card", 30000);
      made.push(card);
      const names = card.flags["azeroth-rpg"].targets.map(t => t.name);
      assert.include(names, "ZZ PrT Near");
      assert.notInclude(names, "ZZ PrT Far", "an enemy 70 feet away was struck");
      assert.notInclude(names, "ZZ PrT Fallen", "the fallen creature was struck again");
      assert.isTrue(card.flags["azeroth-rpg"].notAttack, "the apparition is an attack");
    });

    it("VOID ERUPTION: a creature that fails the Test is Silenced beside 07's Stunned", async function () {
      this.timeout(240000);
      const priest = await priestWith("ZZ PrT Eruption", { level: 20, ranks: { Silence: 1, "Void Eruption": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(priest, "mana");
      const card = await cast(priest, "Void Eruption", { targets: [rowOf(ghoul)], face: 20 });
      assert.ok(card, "Void Eruption was refused");
      assert.sameMembers(card.flags["azeroth-rpg"].onFail.statuses, ["stunned", "silenced"]);
    });
  });
}
