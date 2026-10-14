/**
 * **THE DRUID'S THIRTY-SIX, LIVE** (04-TALENTS; D-771, the talent plan's Phase
 * 3). One focused test per talent the phase builds, through the real doors:
 *
 * - Balance: Moonfire's and Rejuvenation's tick raised by the rank; Nature's
 *   Grace laid by an SL 2 Casting Test and taken by the next cast's Mana;
 *   Eclipse alternating; Celestial Alignment's two minutes and its 2 Ward;
 *   Typhoon's Prone at rank 2 beside Hurricane's own Slowed (02, found unbuilt).
 * - Feral: Primal Fury's further Ferocity once a turn; Savage Shift's free
 *   shift once a round; Survival Instincts' halving and Ferocity, refused out
 *   of a form and while a mark stands, and a Parry refused while its halving
 *   stands; Predator's Swiftness's next spell that turn; Berserk's discount
 *   and its form lane.
 * - Restoration: Regrowth's lingering tick and Improved Regrowth's turns; Wild
 *   Growth's tick; Swiftmend's end and heal, refused with nothing to end;
 *   Nature's Swiftness's Half-Action; Gift of Nature's further Health; Nature's
 *   Ward's school asked at the Apply; Dreamstate's Dreamwalk; Symbiosis's share.
 *
 * Written in Phase 3 and NOT run there (the lead, 2026-10-03: *"The quench
 * batches can be limited, just log what to test and I'll handle it later past
 * the first pass"*). Run alone with `QUENCH_BATCH=azeroth-rpg.druid-talents`.
 * Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { leaveShapeControl } from "../applications/combat-actions.mjs";
import { reactWithDialog } from "../applications/actions.mjs";
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
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const tickEffect = (actor, name) => actor.effects.find(e => e.name === name && e.getFlag("azeroth-rpg", "tick")) ?? null;

/** A target snapshot with no token, at a Defense of 10, as `targetSnapshots` shapes one. */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null, ...extra
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

/** A Druid at a level with these talents taken, waiting for what each grants or teaches. */
async function druidWith(name, { level = 5, ranks = {}, spells = [], abilities = { wis: 16 } } = {}) {
  const druid = await makeCharacter({ name, classes: [["Druid", level]], spells, abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(druid, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  // A grant's feature, a patch's chip, a taught spell: the sync has run when
  // every taken talent's rank reads back.
  for (const [talent, rank] of Object.entries(ranks)) {
    await until(() => talentNamed(druid, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  }
  await settle();
  return druid;
}

/** Fill a pool to its maximum. */
async function fill(actor, name) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => poolOf(actor, name).value === pool.max, `${name} full`);
  return poolOf(actor, name);
}

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/** Cast through the workflow, the die pinned. */
async function cast(actor, name, { targets = [], face = 18, swift = false } = {}) {
  const spell = await until(() => spellNamed(actor, name), `${name} known`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().castSpell({ actor, spell, targets, swift });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** Use a feature through the workflow, the die pinned. */
async function useFeature(actor, name, { targets = [], face = 18, dc = 10 } = {}) {
  const item = await until(() => featureNamed(actor, name), `${name} granted`);
  const unpin = pinDie(face);
  try {
    const card = await workflows().useFeature({ actor, item, targets, dc });
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** The chooser a feature or a talent opened, once rendered. */
async function chooser(item, ms = 10000) {
  for (let i = 0; i < ms / 50; i++) {
    const app = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (app?.rendered && app.element?.querySelector(".azeroth-choose")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`${item.name} opened no chooser`);
}

/** Pick one option by name in a chooser that takes one, and press its button. */
async function pickOne(item, name) {
  const app = await chooser(item);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...(select?.options ?? [])].find(o => o.textContent.trim().startsWith(name));
  if (!option) throw new Error(`${item.name}'s chooser offers no ${name}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `${item.name}'s chooser to close`);
}

/** Take a Shapeshift form through the feature's own door, answering its chooser. */
async function shift(druid, form) {
  const item = featureNamed(druid, "Shapeshift");
  const used = workflows().useFeature({ actor: druid, item });
  await pickOne(item, form);
  const card = await used;
  if (card) made.push(card);
  await until(() => druid.shape?.forms?.some(f => f.name === form), `${druid.name} in the ${form}`);
  return card;
}

export function druidTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Druid's thirty-six (D-771)", function () {
    let restore = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      await cleanup();
    });

    /* ---- Balance ------------------------------------------------------- */

    it("MOONFIRE at rank 2 stamps a tick of 2 + 2, and its card says so", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Moonfire", { ranks: { Moonfire: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The target fights and the druid does not: the tick has its clock, and
      // the cast spends no turn it is not the druid's to spend.
      await fightWith([ghoul]);
      await fill(druid, "mana");
      const card = await cast(druid, "Moonfire", { targets: [rowOf(ghoul)] });
      assert.ok(card, "Moonfire posted no card");
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "damage", type: "arcane", amount: 4 }, "the tick is not 2 + the rank");
      assert.include(textOf(card), game.i18n.format("AZEROTH.Tick.BonusRow", { n: 2 }), "the card does not name what the talent adds each turn");
    });

    it("REJUVENATION at rank 3 stamps a heal of 2 + 3 a turn", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Rejuvenation", { ranks: { Rejuvenation: 3 } });
      const patient = await makeCharacter({ name: "ZZ DT Rejuv Patient", classes: [["Warrior", 3]] });
      await fightWith([patient]);
      await fill(druid, "mana");
      const card = await cast(druid, "Rejuvenation", { targets: [rowOf(patient)] });
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "heal", amount: 5 }, "Rejuvenation's tick is not 2 + 3");
    });

    it("NATURE'S GRACE: an SL 2 Casting Test lays 1 Mana a rank off the next spell, which takes it whole", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Grace", { ranks: { "Nature's Grace": 2 }, spells: ["Wrath", "Moonfire"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(druid, "mana");
      const first = await cast(druid, "Wrath", { targets: [rowOf(ghoul)], face: 20 });
      assert.isAtLeast(first.flags["azeroth-rpg"].sl, 2, "the pinned Wrath did not reach SL 2");
      await until(() => druid.pendingNextSpell().amount === 2, "Nature's Grace laid at 2");
      const before = poolOf(druid, "mana").value;
      // A low die: this cast takes the discount and lays no new one.
      const second = await cast(druid, "Moonfire", { targets: [rowOf(ghoul)], face: 2 });
      assert.ok(second, "Moonfire was refused");
      assert.equal(poolOf(druid, "mana").value, before - Math.max(0, spellNamed(druid, "Moonfire").system.mana - 2), "the next spell's Mana was not discounted by 2");
      await until(() => druid.pendingNextSpell().amount === 0, "the discount taken whole");
      assert.include(textOf(second), "Nature's Grace", "the card does not name the discount");
    });

    it("ECLIPSE: a Nature cast leaves the next Arcane spell its rank, and that spell leaves the next Nature", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Eclipse", { ranks: { Starfire: 1, Eclipse: 2 }, spells: ["Wrath", "Moonfire"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(druid, "mana");
      await cast(druid, "Wrath", { targets: [rowOf(ghoul)] });
      await until(() => druid.getFlag("azeroth-rpg", "alternate") === "arcane", "the Arcane bonus pending");
      const moon = await cast(druid, "Moonfire", { targets: [rowOf(ghoul)] });
      assert.equal(moon.flags["azeroth-rpg"].damageByTarget[0].damage, 4 + 2, "Moonfire did not take Eclipse's 2");
      await until(() => druid.getFlag("azeroth-rpg", "alternate") === "nature", "the Nature bonus pending");
    });

    it("CELESTIAL ALIGNMENT: two minutes on the card, and its 2 Ward ignored while it stands", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Alignment", { level: 20, ranks: { "Lunar Guidance": 1, "Celestial Alignment": 1 }, spells: ["Wrath"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await fill(druid, "mana");
      const card = await cast(druid, "Celestial Alignment");
      assert.deepEqual(card.flags["azeroth-rpg"].duration, { value: 2, units: "minutes" }, "the span is not the talent's two minutes");
      // Before it stands: Ward 3 takes 3 off Wrath's 4.
      const warded = rowOf(ghoul, { wardBySchool: { nature: 3 } });
      const plain = await cast(druid, "Wrath", { targets: [warded] });
      assert.equal(plain.flags["azeroth-rpg"].damageByTarget[0].damage, 1);
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"]');
      assert.ok(apply, "the card offers no Apply");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      await until(() => druid.effects.some(e => e.getFlag("azeroth-rpg", "identifier") === "celestial-alignment"), "Celestial Alignment laid");
      assert.equal(druid.spellWardPierce("nature"), 2);
      const pierced = await cast(druid, "Wrath", { targets: [warded] });
      assert.equal(pierced.flags["azeroth-rpg"].damageByTarget[0].damage, 3, "Wrath did not ignore 2 of the Ward");
    });

    it("TYPHOON: Hurricane lays Slowed at rank 1 and Prone beside it at rank 2, and Slowed ends at the druid's turn start", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Typhoon", { level: 9, ranks: { Typhoon: 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const conditions = message => [...parsed(message).querySelectorAll('[data-action="applyCondition"]')].map(b => b.dataset.condition);
      // Out of a fight first: two Uses that cost an action each spend no turn.
      await fill(druid, "mana");
      const one = await useFeature(druid, "Hurricane", { targets: [rowOf(ghoul)] });
      assert.deepEqual(conditions(one), ["slowed"], "Hurricane does not lay its own Slowed");
      await talentNamed(druid, "Typhoon").update({ "system.taken": 2 });
      await until(() => (featureNamed(druid, "Hurricane")?.system?.inflicts ?? []).length === 2, "Typhoon's Prone stamped on Hurricane");
      // In a fight, on the druid's turn, so Slowed takes the druid's turn start.
      const combat = await fightWith([druid, ghoul]);
      await giveTurn(combat, druid);
      await fill(druid, "mana");
      const two = await useFeature(druid, "Hurricane", { targets: [rowOf(ghoul)] });
      assert.deepEqual(conditions(two), ["slowed", "prone"]);
      const slowed = parsed(two).querySelector('[data-action="applyCondition"][data-condition="slowed"]');
      assert.equal(slowed.dataset.until, "casterTurnStart");
      await CARD_ACTIONS.applyCondition(slowed, two);
      const effect = await until(() => ghoul.effects.find(e => e.statuses?.has("slowed")), "Slowed on the ghoul");
      const mine = combat.getCombatantsByActor(druid)[0];
      assert.equal(effect.start?.combatant, mine.id, "Slowed is not keyed on the druid's own turn");
      assert.equal(effect.duration?.expiry, "turnStart");
    });

    /* ---- Feral --------------------------------------------------------- */

    it("PRIMAL FURY: an attack at SL 2 in a form gains the rank's further Ferocity, once a turn", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Fury", { ranks: { "Feral Instinct": 1, "Primal Fury": 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      await giveTurn(combat, druid);
      await shift(druid, "Black Bear");
      await setPool(druid, "ferocity", 0);
      const claws = druid.readyWeapons()[0];
      const swing = async () => {
        const unpin = pinDie(20);
        try {
          const card = await workflows().rollTest({ actor: druid, kind: "attack", dc: 10, title: claws.name, damage: { rating: claws.system.rating ?? 0, kind: "physical" }, strike: { rangeKind: "melee" }, budget: "none" });
          if (card) made.push(card);
          return card;
        } finally {
          unpin();
        }
      };
      const first = await swing();
      assert.isAtLeast(first.rolls[0].outcome.sl, 2);
      await until(() => poolOf(druid, "ferocity").value === 2 + 2, "05's 2 and Primal Fury's 2");
      await swing();
      await until(() => poolOf(druid, "ferocity").value === 4 + 2, "05's 2 alone the second time");
      assert.include(combat.getCombatantsByActor(druid)[0].getFlag("azeroth-rpg", "round").once, "primal-fury");
    });

    it("SAVAGE SHIFT: the first shift of a round costs no Half-Action, the second does", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Savage", { ranks: { "Savage Shift": 1 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      const before = mine.getFlag("azeroth-rpg", "budget").halfActions;
      await shift(druid, "Black Bear");
      assert.equal(mine.getFlag("azeroth-rpg", "budget").halfActions, before, "the free shift spent a Half-Action");
      assert.include(mine.getFlag("azeroth-rpg", "round").once, "savage-shift");
      await shift(druid, "Wolf");
      await until(() => mine.getFlag("azeroth-rpg", "budget").halfActions === before - 1, "the second shift's Half-Action");
    });

    it("SURVIVAL INSTINCTS: refused out of a form with its use kept; in one, the next attack is halved and Ferocity rises by the rank", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Instincts", { level: 9, ranks: { "Survival Instincts": 2 } });
      const item = await until(() => featureNamed(druid, "Survival Instincts"), "the counter");
      const uses = item.system.uses.value;
      let refused = null;
      const said = await warnings(async () => { refused = await useFeature(druid, "Survival Instincts"); });
      assert.isNull(refused);
      assert.include(said, game.i18n.format("AZEROTH.Feature.NeedsForm", { name: "Survival Instincts" }));
      assert.equal(featureNamed(druid, "Survival Instincts").system.uses.value, uses, "a refused Use struck a use");
      await shift(druid, "Black Bear");
      await setPool(druid, "ferocity", 1);
      await useFeature(druid, "Survival Instincts");
      assert.equal(poolOf(druid, "ferocity").value, 3, "Ferocity did not rise by the rank");
      assert.deepInclude(druid.getFlag("azeroth-rpg", "mitigate"), { halve: true });
      const health = druid.system.health.value;
      await druid.applyDamage(10, { struck: true, attack: true });
      await until(() => druid.system.health.value === health - 5, "the attack halved");
      assert.isNotOk(druid.getFlag("azeroth-rpg", "mitigate"), "the mark was not spent");
    });

    it("SURVIVAL INSTINCTS is refused while a Parry's mark stands, and a Parry while its halving stands - nothing written over, nothing spent", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Marks", { level: 9, ranks: { "Survival Instincts": 2 } });
      await shift(druid, "Black Bear");
      await setPool(druid, "ferocity", 3);
      const words = mark => game.i18n.format("AZEROTH.Reaction.Refuse.MarkStands", { name: druid.name, mark });
      // A Parry pressed on a card nobody has applied yet.
      const parry = { name: "Parry", halve: false, amount: null, negate: true, reaction: "parry", messageId: "zz-unapplied" };
      await druid.setFlag("azeroth-rpg", "mitigate", parry);
      const uses = featureNamed(druid, "Survival Instincts").system.uses.value;
      let refused = null;
      const said = await warnings(async () => { refused = await useFeature(druid, "Survival Instincts"); });
      assert.isNull(refused);
      assert.include(said, words("Parry"));
      assert.deepEqual(druid.getFlag("azeroth-rpg", "mitigate"), parry, "the Parry was written over");
      assert.equal(featureNamed(druid, "Survival Instincts").system.uses.value, uses, "a refused Use struck a use");
      assert.equal(poolOf(druid, "ferocity").value, 3, "a refused Use paid in Ferocity");
      // Its own halving, then a Parry: refused before the Reaction is spent.
      await druid.unsetFlag("azeroth-rpg", "mitigate");
      await useFeature(druid, "Survival Instincts");
      assert.deepInclude(druid.getFlag("azeroth-rpg", "mitigate"), { halve: true });
      let parried = null;
      const said2 = await warnings(async () => { parried = await reactWithDialog(druid, "parry", {}); });
      assert.isNull(parried);
      assert.include(said2, words("Survival Instincts"));
      assert.deepInclude(druid.getFlag("azeroth-rpg", "mitigate"), { name: "Survival Instincts", halve: true }, "the halving was written over");
      assert.isNotOk(druid.getFlag("azeroth-rpg", "reacted"), "a refused Parry recorded a Reaction");
    });

    it("PREDATOR'S SWIFTNESS: the free leave lays 2 Mana off the next spell THAT TURN", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Swiftness", { level: 9, ranks: { "Predator's Swiftness": 1 }, spells: ["Rejuvenation"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      await giveTurn(combat, druid);
      // The shift takes one Half-Action; the free leave none; Rejuvenation the other.
      await shift(druid, "Black Bear");
      await leaveShapeControl(druid);
      await until(() => !druid.shape, "the bear left");
      assert.equal(druid.pendingNextSpell().amount, 2, "the discount was not laid");
      const mana = await fill(druid, "mana");
      const card = await cast(druid, "Rejuvenation", { face: 2 });
      assert.ok(card, "Rejuvenation was refused");
      assert.equal(poolOf(druid, "mana").value, mana.value - Math.max(0, spellNamed(druid, "Rejuvenation").system.mana - 2));
      assert.equal(druid.pendingNextSpell().amount, 0);
    });

    it("BERSERK: one effect until the end of the next turn - Mangle 1 Ferocity cheaper, and the rank on attacks in a form alone", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Berserk", { level: 13, ranks: { Mangle: 1, Berserk: 2 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      await giveTurn(combat, druid);
      await useFeature(druid, "Berserk");
      const effect = await until(() => druid.effects.find(e => e.getFlag("azeroth-rpg", "talentBuff") === "Berserk"), "Berserk's effect");
      assert.deepEqual(effect.getFlag("azeroth-rpg", "riderDiscount"), { identifier: "berserk" });
      assert.equal(druid.system.damageBonus.form.all, 2, "the form lane does not carry the rank");
      assert.equal(druid.system.damageBonus.attack.all, 0, "the rank reached the ordinary attack lane");
      await shift(druid, "Black Bear");
      await setPool(druid, "ferocity", 3);
      const mangle = druid.riderLines().find(l => l.identifier === "mangle");
      assert.equal(mangle.cost, 1, "Mangle is not 1 Ferocity cheaper under Berserk");
    });

    /* ---- Restoration --------------------------------------------------- */

    it("REGROWTH with IMPROVED REGROWTH 2: the heal plus 2 on the card, and its lingering tick laid for 1 + 2 turns", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Regrowth", { ranks: { "Improved Regrowth": 2 } });
      const patient = await makeCharacter({ name: "ZZ DT Regrowth Patient", classes: [["Warrior", 3]] });
      await fightWith([patient]);
      await fill(druid, "mana");
      const tier = druid.system.tier;
      const card = await useFeature(druid, "Regrowth", { targets: [rowOf(patient)] });
      assert.equal(card.flags["azeroth-rpg"].heal, 2 * tier + 2, "the heal is not twice the tier plus the rank");
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "heal", amount: tier, rounds: 3, via: "feature" });
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      assert.ok(apply, "the card offers no Apply for the lingering heal");
      await CARD_ACTIONS.applySpellEffect(apply, card);
      const laid = await until(() => tickEffect(patient, "Regrowth"), "Regrowth's tick laid");
      assert.deepInclude(laid.getFlag("azeroth-rpg", "tick"), { amount: tier, rounds: 3, source: druid.uuid });
    });

    it("WILD GROWTH: no heal at the use, a tick of the tier for the rank's rounds on each target", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Wild Growth", { level: 9, ranks: { "Wild Growth": 2 } });
      const patient = await makeCharacter({ name: "ZZ DT Wild Patient", classes: [["Warrior", 3]] });
      await fightWith([patient]);
      await fill(druid, "mana");
      const card = await useFeature(druid, "Wild Growth", { targets: [rowOf(patient)] });
      assert.isNull(card.flags["azeroth-rpg"].heal, "Wild Growth still heals at the use");
      assert.deepInclude(card.flags["azeroth-rpg"].tick, { kind: "heal", amount: druid.system.tier, rounds: 2 });
    });

    it("SWIFTMEND: refused in words with nothing to end and the Half-Action kept; then ends the Rejuvenation and heals twice the tier plus the rank", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Swiftmend", { ranks: { Rejuvenation: 1, Swiftmend: 2 } });
      const patient = await makeCharacter({ name: "ZZ DT Swiftmend Patient", classes: [["Warrior", 3]] });
      const combat = await fightWith([druid, patient]);
      const mine = await giveTurn(combat, druid);
      const budget = foundry.utils.deepClone(mine.getFlag("azeroth-rpg", "budget"));
      let refused = null;
      const said = await warnings(async () => { refused = await useFeature(druid, "Swiftmend", { targets: [rowOf(patient)] }); });
      assert.isNull(refused);
      assert.include(said, game.i18n.format("AZEROTH.Swiftmend.NoTick", { name: "Swiftmend", target: patient.name }));
      assert.deepEqual(mine.getFlag("azeroth-rpg", "budget"), budget, "a refused Swiftmend spent the Half-Action");
      await game.system.azeroth.ticks.layTickOn(patient, {
        tick: { kind: "heal", type: null, amount: 3, rounds: 5, until: "", when: "startOfTurn", spellpower: false, source: druid.uuid, castUuid: null, cast: null, name: "Rejuvenation" }
      });
      await until(() => tickEffect(patient, "Rejuvenation"), "a heal over time laid");
      await patient.update({ "system.health.value": 1 });
      const card = await useFeature(druid, "Swiftmend", { targets: [rowOf(patient)] });
      assert.ok(card, "Swiftmend was refused with a heal over time standing");
      await until(() => !tickEffect(patient, "Rejuvenation"), "the heal over time ended");
      await until(() => patient.system.health.value === 1 + 2 * druid.system.tier + 2, "the heal of twice the tier plus the rank");
      assert.isNull(parsed(card).querySelector('[data-action="applyHealing"]'), "the card offers the heal a second time");
    });

    it("NATURE'S SWIFTNESS: a healing spell that costs an action is cast at a Half-Action, one use a time", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Natures Swiftness", { level: 9, ranks: { "Nature's Swiftness": 1 }, spells: ["Moonwell"] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      await fill(druid, "mana");
      assert.equal(spellNamed(druid, "Moonwell").system.action, "action");
      const before = mine.getFlag("azeroth-rpg", "budget").halfActions;
      const card = await cast(druid, "Moonwell", { swift: true });
      assert.ok(card, "the swift cast was refused");
      await until(() => mine.getFlag("azeroth-rpg", "budget").halfActions === before - 1, "one Half-Action, not two");
      const counter = featureNamed(druid, "Nature's Swiftness");
      assert.equal(counter.system.uses.value, 0, "the use was not struck");
      await fill(druid, "mana");
      let again = null;
      const said = await warnings(async () => { again = await cast(druid, "Moonwell", { swift: true }); });
      assert.isNull(again);
      assert.include(said, game.i18n.format("AZEROTH.Cast.Swift.NoUses", { name: "Moonwell", talent: "Nature's Swiftness" }));
    });

    it("GIFT OF NATURE: a heal a spell or a feature gives a conditioned target restores the rank more, and nothing more otherwise", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Gift", { ranks: { "Gift of Nature": 2 } });
      const patient = await makeCharacter({ name: "ZZ DT Gift Patient", classes: [["Warrior", 5]] });
      await patient.update({ "system.health.value": 1 });
      await patient.applyHealing(3, { from: druid, spell: true });
      await until(() => patient.system.health.value === 4, "a bare heal of 3");
      await patient.toggleStatusEffect("bleeding", { active: true });
      await patient.applyHealing(3, { from: druid, feature: true });
      await until(() => patient.system.health.value === 4 + 3 + 2, "Gift of Nature's 2 on a bleeding target");
      await patient.applyHealing(3, { from: druid });
      await until(() => patient.system.health.value === 9 + 3, "a draught takes nothing from it");
    });

    it("NATURE'S WARD: the Apply of a heal over time asks the school and lays Ward 1 a rank against it", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Natures Ward", { level: 9, ranks: { Rejuvenation: 1, "Living Seed": 1, "Nature's Ward": 2 } });
      const patient = await makeCharacter({ name: "ZZ DT Ward Patient", classes: [["Warrior", 3]] });
      await fightWith([patient]);
      await fill(druid, "mana");
      const card = await cast(druid, "Rejuvenation", { targets: [rowOf(patient)] });
      const apply = parsed(card).querySelector('[data-action="applySpellEffect"][data-target-index="0"]');
      const ward = patient.system.ward?.shadow ?? 0;
      const pressed = CARD_ACTIONS.applySpellEffect(apply, card);
      await pickOne(talentNamed(druid, "Nature's Ward"), game.i18n.localize(AZEROTH.schools.shadow));
      await pressed;
      const laid = await until(() => tickEffect(patient, "Rejuvenation"), "Rejuvenation laid");
      assert.deepInclude(laid.system.changes[0], { key: "system.ward.shadow", value: "2" });
      await until(() => (patient.system.ward?.shadow ?? 0) === ward + 2, "Ward 2 against Shadow on the patient");
    });

    it("DREAMSTATE: Dreamwalk is a Use - twice the tier on the card, one of the rank's uses struck", async function () {
      this.timeout(180000);
      const druid = await druidWith("ZZ DT Dreamstate", { level: 13, ranks: { Dreamstate: 2 } });
      const dream = await until(() => featureNamed(druid, "Dreamwalk")?.system?.kind === "action" && featureNamed(druid, "Dreamwalk"), "Dreamwalk made a Use");
      assert.equal(dream.system.uses.max, 2);
      const card = await useFeature(druid, "Dreamwalk");
      assert.equal(card.flags["azeroth-rpg"].heal, 2 * druid.system.tier);
      assert.equal(featureNamed(druid, "Dreamwalk").system.uses.value, 1);
    });

    it("SYMBIOSIS: names one creature, shares half of what each restores with the other, and ends at the druid's Long Rest", async function () {
      this.timeout(240000);
      const druid = await druidWith("ZZ DT Symbiosis", { level: 13, ranks: { Symbiosis: 1 } });
      const ally = await makeCharacter({ name: "ZZ DT Symbiosis Ally", classes: [["Paladin", 5]] });
      let refused = null;
      const said = await warnings(async () => { refused = await useFeature(druid, "Symbiosis"); });
      assert.isNull(refused);
      assert.include(said, game.i18n.format("AZEROTH.Symbiosis.Refused.None", { name: "Symbiosis", target: "" }));
      await useFeature(druid, "Symbiosis", { targets: [rowOf(ally)] });
      await until(() => druid.getFlag("azeroth-rpg", "symbiosis")?.partner === ally.uuid, "the bond named");
      await druid.update({ "system.health.value": 1 });
      await ally.update({ "system.health.value": 1 });
      await druid.applyHealing(6);
      await until(() => ally.system.health.value === 1 + 3, "half of the druid's 6 on the ally");
      await ally.applyHealing(5);
      await until(() => druid.system.health.value === 7 + 2, "half of the ally's 5 on the druid");
      await druid.longRest();
      await until(() => !druid.getFlag("azeroth-rpg", "symbiosis"), "the bond ended at the Long Rest");
    });
  });
}
