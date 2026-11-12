/**
 * **THE CHRONOMANCER'S SAND SPELLS, THROUGH THE REAL DOORS** (07 §12; D-864 to D-869), inside
 * a live world:
 *
 * - Sand Blast at a mailed Bandit: the Body Armor Points come off and its Ward never does
 *   (07 §9's Physical lane), and at SL 2 the Bandit carries **Decay 1** - one effect, drawn
 *   on the token, its Armor Points 1 lower at every location; a second Decay 1 leaves it at 1;
 * - Hour of Dust's Decay 2, which a Short Rest ends;
 * - Sand Prison's Decay on a failed Resist, and its escape ending the Blinded with the Entangled;
 * - the Sand a spell that hits gives, and the Sand a failed Resist gives once a cast;
 * - a Critical Injury leaving Sand where it stands, and a swap of Hourglasses emptying it
 *   (the lead: *"no swapping empties sand"*);
 * - Dilation putting half a blow off to the start of the creature's next turn;
 * - Divert Timeway's second casting: 2 Fatigue on the floor and a Spirit's Tether spent;
 * - the 2a fix stage: Never Was and Moment's Warning pressed on the incoming card (O-264),
 *   Temporal Sanctuary's hold and refused condition and Bastion of Hours' Taunt Bane (O-265),
 *   Sandwall's sight-blocking Wall (O-267), and Dilation's half landing at the fight's end (M2).
 *
 * WRITTEN, NOT RUN in stage 2a (the orchestrator owns the server). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.sand-spells`. Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, give, made, makeCharacter, makeNpc, pinDie, settle, untilHook, tokenDrawn, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { DECAY_FLAG } from "../rules/decay.mjs";
import { DEFERRED_FLAG } from "../rules/deferred-damage.mjs";
import { LIFE_COUNT_FLAG } from "../rules/sand-spells.mjs";
import { chronomancerWith, freshTurn, halvesOf } from "./quench-chronomancer-common.mjs";

async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const sandOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "sand") ?? null;
const decayOf = actor => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]) ?? null;

async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Sand Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, "the scene viewed");
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push(await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => tokenDrawn(tokenOf(p.actor))); i++) await new Promise(r => setTimeout(r, 100));
  await settle();
  return scene;
}

async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id, sceneId: canvas.scene?.id, tokenId: tokenOf(a)?.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's budget", 30000);
  return combat;
}

async function fullMana(actor) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
}

async function castAt(caster, name, victims, face = 19) {
  const spell = await until(() => caster.items.find(i => i.type === "spell" && i.name === name), `${name} known`);
  // In a fight, on the caster's own turn with the Half-Actions the spell spends (the live fix).
  await freshTurn(caster, halvesOf(spell));
  canvas.tokens.setTargets(victims.map(v => tokenOf(v).id));
  const targets = targetSnapshots();
  canvas.tokens.setTargets([]);
  const unpin = pinDie(face);
  let card = null;
  try { card = await game.system.azeroth.workflows.castSpell({ actor: caster, spell, dc: 5, targets }); } finally { unpin(); }
  if (card) made.push(card);
  await settle();
  return card;
}

async function failResist(card, index) {
  const doc = game.messages.get(card.id);
  const button = parsed(doc).querySelector(`button[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`);
  if (!button) throw new Error(`the card offers no Resist on row ${index}`);
  const unpin = pinDie(1);
  try { await CARD_ACTIONS.resistTest(button, doc); } finally { unpin(); }
  await settle();
}

async function chronomancer(name, spells) {
  const c = await makeCharacter({ name, classes: [["Chronomancer", 15]], race: "Gnome", spells, bags: [], gear: [], abilities: { int: 18, con: 14 } });
  await fullMana(c);
  return c;
}

export function sandSpellsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Chronomancer's sand spells (07 §12, D-864 to D-869)", function () {
    let restore = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("SAND BLAST meets Body Armor Points and no Ward, and lays Decay 1 at SL 2 that a second keeps at 1", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Sand Blaster", ["Sand Blast"]);
      const bandit = await makeNpc("Bandit");
      await bandit.update({ "system.health.value": 200, "system.health.max": 200, "system.ward.arcane": 3, "system.ap.body": 4, "system.ap.head": 3, "system.ap.limb": 3 });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([caster, bandit]);
      const card = await castAt(caster, "Sand Blast", [bandit], 19);
      const row = card.flags["azeroth-rpg"].damageByTarget[0];
      assert.equal(row.type, "physical");
      assert.equal(row.armor, 4, "the Body Armor Points came off");
      assert.equal(row.ward, null, "no Ward on the Physical lane");
      const decay = await until(() => decayOf(bandit), "Decay laid");
      assert.equal(decay.flags["azeroth-rpg"][DECAY_FLAG].value, 1);
      assert.equal(bandit.system.ap.body, 3, "Body AP 4 less Decay 1");
      await castAt(caster, "Sand Blast", [bandit], 19);
      assert.equal(decayOf(bandit).flags["azeroth-rpg"][DECAY_FLAG].value, 1, "a second Decay 1 keeps the higher X");
      assert.equal(bandit.effects.filter(e => e.flags?.["azeroth-rpg"]?.[DECAY_FLAG]).length, 1, "one Decay effect a creature");
    });

    it("HOUR OF DUST's Decay 2 lasts until a Short Rest", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Dust Caster", ["Hour of Dust"]);
      const ally = await makeCharacter({ name: "ZZ Dust Target", classes: [["Warrior", 3]], armor: ["Mail hauberk"] });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 1100, y: 1000, side: "hostile" }]);
      await castAt(caster, "Hour of Dust", [ally], 19);
      const decay = await until(() => decayOf(ally), "Decay 2 laid");
      assert.equal(decay.flags["azeroth-rpg"][DECAY_FLAG].until, "shortRest");
      // A Short Rest takes food or drink (05 §16, D-733): with neither the door refuses the rest.
      await ally.shortRest({ food: await give(ally, "Bread and cheese") });
      await until(() => !decayOf(ally), "the Short Rest ended it");
    });

    it("SAND PRISON lays Decay on a failed Resist, and its escape ends the Blinded with the Entangled", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Prison Caster", ["Sand Prison"]);
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([caster, bandit]);
      const card = await castAt(caster, "Sand Prison", [bandit], 19);
      await failResist(card, 0);
      await until(() => bandit.statuses.has("entangled") && bandit.statuses.has("blinded"), "Entangled and Blinded");
      assert.ok(decayOf(bandit), "Decay 1 laid on the failure");
      const held = bandit.effects.find(e => e.statuses?.has("entangled"));
      assert.deepEqual(held.flags["azeroth-rpg"].escape.also, ["blinded"]);
    });

    it("SAND rises from a spell that hits, survives a Critical Injury, and a swap of Hourglasses empties it", async function () {
      this.timeout(300000);
      const caster = await makeCharacter({ name: "ZZ Sand Gatherer", classes: [["Chronomancer", 5]], race: "Gnome", spells: ["Sand Blast"], bags: ["Hourglass"], abilities: { int: 18 } });
      await fullMana(caster);
      const glass = await until(() => caster.items.find(i => i.name === "Hourglass"), "the Hourglass carried");
      await glass.update({ "system.equipped": true });
      await until(() => (sandOf(caster)?.max ?? 0) === 5, "a cap of 5");
      const bandit = await makeNpc("Bandit");
      await bandit.update({ "system.health.value": 200, "system.health.max": 200 });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      await castAt(caster, "Sand Blast", [bandit], 19);
      await until(() => (sandOf(caster)?.value ?? 0) >= 2, "Sand from the hit at SL 2");
      const before = sandOf(caster).value;
      // 06 §8's Critical Injury through the one door that lays one (the 2a review, M4: the door
      // named here before did not exist, and the optional call hid it).
      await game.system.azeroth.workflows.sufferInjury({ actor: caster, location: "limb", band: {}, result: { name: "ZZ graze" }, coordinated: false });
      assert.equal(sandOf(caster).value, before, "a Critical Injury leaves Sand (O-259)");
      // A SWAP (the lead: *"no swapping empties sand"*): a SECOND Hourglass put on the Ranged
      // tile puts the first away, and the pool reads 0 after the swap and stays there.
      assert.isAbove(before, 0, "Sand to lose");
      const second = await give(caster, "Hourglass");
      await second.update({ "system.equipped": true });
      await until(() => second.system.equipped === true && glass.system.equipped !== true, "the second Hourglass in the slot, the first put away");
      await until(() => sandOf(caster)?.value === 0, "Sand emptied by the swap");
      assert.equal(sandOf(caster).value, 0, "a swap of Hourglasses empties the pool");
      assert.equal((sandOf(caster)?.max ?? 0), 5, "the second glass holds Sand");
    });

    it("DILATION puts half a blow off, rounded up, to the start of the creature's next turn", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Dilator", ["Dilation"]);
      const ally = await makeCharacter({ name: "ZZ Dilated", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }]);
      await fightWith([caster, ally]);
      const card = await castAt(caster, "Dilation", [ally], 19);
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applySpellEffect"]');
      if (apply) await CARD_ACTIONS.applySpellEffect(apply, game.messages.get(card.id));
      await until(() => ally.effects.some(e => e.flags?.["azeroth-rpg"]?.deferral), "Dilation laid");
      const health = ally.system.health.value;
      await ally.applyDamage(7, { struck: true, attack: false });
      await until(() => ally.system.health.value === health - 4, "half now, rounded up");
      assert.deepEqual(ally.getFlag("azeroth-rpg", DEFERRED_FLAG).map(r => r.amount), [3]);
    });

    it("DIVERT TIMEWAY's second casting lays 2 permanent Fatigue and spends a Spirit's Tether", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Diverter", ["Divert Timeway"]);
      await caster.update({ [`flags.azeroth-rpg.${LIFE_COUNT_FLAG}`]: 1, "system.spiritTether.value": 2 });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }]);
      await castAt(caster, "Divert Timeway", [caster], 19);
      await until(() => caster.getFlag("azeroth-rpg", LIFE_COUNT_FLAG) === 2, "the life count");
      assert.equal(caster.system.spiritTether.value, 1);
      assert.ok(caster.system.fatigueFloor >= 2, "2 Fatigue that no rest removes");
    });

    // ---- The 2a fix stage (O-264, O-265, O-267). WRITTEN, NOT RUN: the orchestrator owns the server.

    /** A bandit's blow at a creature, posted as an attack card: total 15 + 3 against `dc`. */
    async function blowAt(bandit, victim, { face = 15, dc = 12 } = {}) {
      canvas.tokens.setTargets([tokenOf(victim).id]);
      const targets = targetSnapshots();
      canvas.tokens.setTargets([]);
      const unpin = pinDie(face);
      let card = null;
      try {
        card = await game.system.azeroth.workflows.rollTest({
          actor: bandit, kind: "attack", dc, title: "ZZ Sand blow", targets,
          modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 3 }], damage: { rating: 8, kind: "physical" }
        });
      } finally { unpin(); }
      if (card) made.push(card);
      await settle();
      return card;
    }

    it("NEVER WAS: pressed on the incoming card, the hit becomes a miss and the Apply deals nothing (O-264)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Never Was", ["Never Was"]);
      const ally = await makeCharacter({ name: "ZZ Never Struck", classes: [["Warrior", 5]] });
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }, { actor: bandit, x: 1000, y: 1000, side: "hostile" }]);
      await fightWith([caster, ally, bandit]);
      const card = await blowAt(bandit, ally, { face: 15, dc: 12 });
      // 15 + 3 against 12: a hit, read off the roll itself (no default stands in for it).
      assert.strictEqual(card.rolls[0].outcome?.success, true, "the pinned blow should hit (18 against 12)");
      const dealt = card.flags["azeroth-rpg"].damageByTarget?.[0]?.damage ?? 0;
      assert.isAbove(dealt, 0, "the hit carries damage an Apply would land");
      const button = parsed(game.messages.get(card.id)).querySelector('[data-sand-answer] button[data-action="reactSpell"][data-spell-identifier="never-was"][data-target-index="0"]');
      assert.ok(button, "the card offers no Never Was");
      const unpin = pinDie(19);
      let cast = null;
      try { cast = await CARD_ACTIONS.reactSpell(button, game.messages.get(card.id)); } finally { unpin(); }
      if (cast) made.push(cast);
      await until(() => game.messages.get(card.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true, "the card's row written as a miss");
      const health = ally.system.health.value;
      assert.isAbove(health, dealt, "Health enough that a landed blow would show");
      // The Apply door pressed whatever the card draws now: a withdrawn row draws no button, so
      // the press is made with one naming the row, and the door itself must refuse it.
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applyDamage"][data-target-index="0"]')
        ?? Object.assign(document.createElement("button"), { type: "button" });
      apply.dataset.action = "applyDamage";
      apply.dataset.targetIndex = "0";
      await CARD_ACTIONS.applyDamage(apply, game.messages.get(card.id));
      await settle();
      assert.equal(ally.system.health.value, health, `the erased hit should deal nothing (it carried ${dealt})`);
      // A second press is refused before anything is paid: the row is no longer a hit.
      const mana = caster.poolSnapshot().find(p => p.kind === "power")?.value;
      await game.system.azeroth.workflows.castSpell({ actor: caster, spell: caster.items.find(i => i.name === "Never Was"), dc: 5, answers: { messageId: card.id, index: 0 } });
      assert.equal(caster.poolSnapshot().find(p => p.kind === "power")?.value, mana, "the refused second cast spent Mana");
    });

    it("MOMENT'S WARNING: a hit that the raised Defense turns into a miss is withdrawn (O-264)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Warner", ["Moment's Warning"]);
      const ally = await makeCharacter({ name: "ZZ Warned", classes: [["Warrior", 5]] });
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }, { actor: bandit, x: 1000, y: 1000, side: "hostile" }]);
      await fightWith([caster, ally, bandit]);
      // A total of 13 + 3 = 16 against a Defense of 15: a hit, and a miss against 17.
      const card = await blowAt(bandit, ally, { face: 13, dc: 15 });
      const button = parsed(game.messages.get(card.id)).querySelector('[data-sand-answer] button[data-spell-identifier="moments-warning"]');
      assert.ok(button, "the card offers no Moment's Warning where it turns the hit into a miss");
      const unpin = pinDie(19);
      try { const cast = await CARD_ACTIONS.reactSpell(button, game.messages.get(card.id)); if (cast) made.push(cast); } finally { unpin(); }
      await until(() => game.messages.get(card.id)?.flags?.["azeroth-rpg"]?.damageByTarget?.[0]?.withdrawn === true, "the hit withdrawn");
    });

    it("TEMPORAL SANCTUARY holds an ally's Stunned, refuses a new condition, and resumes it when the ally leaves (O-265)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Sanctuary", ["Temporal Sanctuary"]);
      const ally = await makeCharacter({ name: "ZZ Sheltered", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }]);
      await fightWith([caster, ally]);
      await ally.toggleStatusEffect("stunned", { active: true });
      const stun = await until(() => ally.effects.find(e => e.statuses?.has("stunned")), "the ally Stunned");
      const card = await castAt(caster, "Temporal Sanctuary", [], 19);
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applySpellEffect"][data-self]');
      assert.ok(apply, "the card offers no Apply on the caster");
      await CARD_ACTIONS.applySpellEffect(apply, game.messages.get(card.id));
      await until(() => caster.effects.find(e => e.flags?.["azeroth-rpg"]?.sandAura?.kind === "sanctuary"), "the aura's carrier on the caster");
      await until(() => ally.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the aura on the ally", 30000);
      await until(() => ally.effects.get(stun.id)?.disabled === true, "the Stun held", 30000);
      assert.ok(ally.effects.get(stun.id).flags["azeroth-rpg"].sanctuaryHeld, "the hold's stamp");
      await ally.toggleStatusEffect("prone", { active: true });
      assert.isFalse(ally.statuses.has("prone"), "the ally gained a condition inside the Sanctuary");
      // Walked out of the 15 feet: the aura lifts and the Stun resumes.
      await tokenOf(ally).document.update({ x: 1800 });
      await until(() => !ally.effects.find(e => e.flags?.["azeroth-rpg"]?.aura?.source === "Temporal Sanctuary"), "the aura lifted", 30000);
      await until(() => ally.effects.get(stun.id)?.disabled === false, "the Stun resumed", 30000);
    });

    it("BASTION OF HOURS lays the Taunt Bane on an enemy within 10 feet, sparing the caster (O-265)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Bastion", ["Bastion of Hours"]);
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: bandit, x: 900, y: 1000, side: "hostile" }]);
      await fightWith([caster, bandit]);
      const card = await castAt(caster, "Bastion of Hours", [], 19);
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applySpellEffect"][data-self]');
      await CARD_ACTIONS.applySpellEffect(apply, game.messages.get(card.id));
      const taunt = await until(() => bandit.effects.find(e => e.flags?.["azeroth-rpg"]?.laidBane?.source === "Bastion of Hours"), "the Taunt Bane on the bandit", 30000);
      assert.equal(taunt.flags["azeroth-rpg"].laidBane.except.actorId, caster.id, "the Bane spares the caster");
      assert.isTrue(taunt.flags["azeroth-rpg"].laidBane.lasting, "the Bane is never spent");
    });

    it("SANDWALL raises a Wall that blocks sight and nothing else, and takes it down with its area (O-267)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Waller", ["Sandwall"]);
      const scene = await sceneWith([{ actor: caster, x: 800, y: 1000 }]);
      const points = [1000, 950, 1600, 950, 1600, 1050, 1000, 1050];
      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: "ZZ Sandwall", shapes: [{ type: "polygon", points }],
        flags: { "azeroth-rpg": { cast: "zz-wall", caster: caster.uuid, blocksSight: true, spell: { name: "Sandwall" } } }
      }]);
      const wall = await until(() => scene.walls.find(w => w.flags?.["azeroth-rpg"]?.sandwall === region.id), "the Wall raised", 30000);
      assert.deepEqual([...wall.c], [1000, 1000, 1600, 1000], "along the line's long axis");
      assert.equal(wall.sight, CONST.EDGE_SENSE_TYPES.NORMAL, "it blocks sight");
      assert.equal(wall.move, CONST.WALL_MOVEMENT_TYPES.NONE, "it blocks no movement");
      await region.delete();
      await until(() => !scene.walls.find(w => w.flags?.["azeroth-rpg"]?.sandwall === region.id), "the Wall taken down", 30000);
    });

    it("DILATION's half still waiting lands when the fight ends (the 2a review, M2)", async function () {
      this.timeout(300000);
      const caster = await chronomancer("ZZ Dilator End", ["Dilation"]);
      const ally = await makeCharacter({ name: "ZZ Dilated End", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: caster, x: 800, y: 1000 }, { actor: ally, x: 900, y: 1000 }]);
      const combat = await fightWith([caster, ally]);
      const card = await castAt(caster, "Dilation", [ally], 19);
      const apply = parsed(game.messages.get(card.id)).querySelector('button[data-action="applySpellEffect"]');
      if (apply) await CARD_ACTIONS.applySpellEffect(apply, game.messages.get(card.id));
      await until(() => ally.effects.some(e => e.flags?.["azeroth-rpg"]?.deferral), "Dilation laid");
      const health = ally.system.health.value;
      await ally.applyDamage(7, { struck: true, attack: false });
      await until(() => (ally.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? []).length === 1, "the half put off");
      await combat.delete();
      await until(() => ally.system.health.value === health - 7, "the half landed at the fight's end", 30000);
      assert.equal((ally.getFlag("azeroth-rpg", DEFERRED_FLAG) ?? []).length, 0, "nothing left waiting");
    });

    it("HALT bought with Sand: the dialog's line is offered, 5 Sand is paid and no Mana, and a pinned 1 succeeds (item 5)", async function () {
      this.timeout(300000);
      const c = await chronomancerWith("ZZ Halt Sands", { level: 20, ranks: { "Halt the Sands": 1 }, sand: 5 });
      const halt = await until(() => c.items.find(i => i.type === "spell" && i.name === "Halt"), "Halt learned from the talent", 30000);
      // The dialog hands the offer the spell's Mana, as `castSpell` and the roll dialog do: a spell
      // with no price has nothing for Sand to buy, and the offer returns before the line (the
      // live fix: the test asked with no Mana and read the early return as a missing line).
      const line = c.talentLineOffer({ roll: "spell", spell: "Halt", casting: true, school: halt.system.school, mana: halt.system.mana }).find(l => l.kind === "sandCast");
      assert.ok(line, "the dialog offers no Sand line for Halt");
      assert.isTrue(line.available, "5 Sand does not cover the line");
      const mana = c.poolSnapshot().find(p => p.kind === "power")?.value;
      const unpin = pinDie(1);
      let card = null;
      try { card = await game.system.azeroth.workflows.castSpell({ actor: c, spell: halt, talentLines: [line.identifier] }); } finally { unpin(); }
      if (card) made.push(card);
      assert.ok(card, "the Sand-bought cast posted no card");
      assert.isTrue(card.flags["azeroth-rpg"].success, "a Halt bought with Sand failed its Casting Test");
      await until(() => sandOf(c)?.value === 0, "the 5 Sand paid");
      assert.equal(c.poolSnapshot().find(p => p.kind === "power")?.value, mana, "the Sand-bought cast spent Mana");
    });
  });
}
