/**
 * **EVERY SUCCESS-LEVEL-GATED EFFECT LANDS** (D-812; the lead: *"complete them"*),
 * inside a live world, through the real doors:
 *
 * - 08 §5's Rattle, Snag, Shove and Daze through a real swing (`attackWithDialog`):
 *   a point of Momentum off the creature struck, its Opportunity Attacks barred in
 *   Snag's own words, a push of 5 feet straight away, its Reaction gone - and the
 *   miss door (`effects/miss.mjs#withdrawHit`, what a Parry that holds runs) giving
 *   back every one of them;
 * - 07's hit riders through `castSpell`: Searing Pain's Bane (a span at SL 2), Fel
 *   Bolt's Ward drop at SL 3, Stone Spike's Prone at SL 2;
 * - 07's failure riders through the card's own Resist: Shadow Wave's Blinded (and a
 *   creature whose Ward takes the SL below the clause spared it), Slow's lost
 *   Reaction, Frostbite's Entangled beside its Slowed, Turn Undead destroying a tier
 *   1 undead.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.sl-riders`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, pinDie, settle, untilHook, tokenDrawn, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { attackWithDialog, reactionStateOf } from "../applications/actions.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { canReact } from "../rules/reactions.mjs";
import { HIT_MARK_FLAG } from "../rules/hit-marks.mjs";
import { LAID_BANE_FLAG } from "../rules/banes.mjs";
import { reactionBarred } from "../rules/reaction-bar.mjs";
import { withdrawHit } from "../effects/miss.mjs";

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

const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const momentumOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum") ?? null;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ SL Riders Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
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

/** A started fight holding these actors, with the turn events settled (D-627). */
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

/** Fill a caster's Mana. */
async function fullMana(actor) {
  for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
  await until(() => actor.poolSnapshot().some(p => p.name === "mana" && p.value > 2), `${actor.name}'s Mana`);
}

/** Cast a known spell at these creatures through the cast door, the die pinned. */
async function castAt(caster, name, victims, face = 19) {
  const spell = await until(() => caster.items.find(i => i.type === "spell" && i.name === name), `${name} known`);
  canvas.tokens.setTargets(victims.map(v => tokenOf(v).id));
  const targets = targetSnapshots();
  canvas.tokens.setTargets([]);
  const unpin = pinDie(face);
  let card = null;
  try {
    card = await game.system.azeroth.workflows.castSpell({ actor: caster, spell, dc: 5, targets });
  } finally { unpin(); }
  if (card) made.push(card);
  return card;
}

/** Press the card's own Resist for one row, the die pinned to fail. */
async function failResist(card, index) {
  const doc = game.messages.get(card.id);
  const button = parsed(doc).querySelector(`button[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`);
  if (!button) throw new Error(`the card offers no Resist on row ${index}`);
  const unpin = pinDie(1);
  try { await CARD_ACTIONS.resistTest(button, doc); } finally { unpin(); }
  await settle();
}

export function slRidersBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Every Success-Level-gated effect lands (D-812)", function () {
    let restore = null;
    let wasViewing = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("RATTLE, SNAG, SHOVE AND DAZE land with a real swing on the creature struck, and the miss door takes every one back", async function () {
      this.timeout(240000);
      const warrior = await makeCharacter({ name: "ZZ SL Rattler", classes: [["Warrior", 3]], weapons: ["Longsword"], abilities: { str: 18, dex: 12, con: 14 } });
      const sword = await until(() => warrior.items.find(i => i.name === "Longsword"), "the Longsword held");
      await sword.update({ "system.equipped": true, "system.traits": ["Rattle", "Snag", "Shove", "Daze"] });
      await until(() => warrior.items.get(sword.id)?.system?.equipped === true, "the Longsword equipped");
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: warrior, x: 1000, y: 1000 }, { actor: bandit, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([warrior, bandit]);
      // AFTER the fight starts: a fight begins every Momentum pool at 0 (02 §7, D-627).
      const pool = momentumOf(bandit);
      assert.ok(pool && pool.max >= 2, "the Bandit holds no Momentum pool to lose a point from");
      await bandit.updatePool({ itemId: pool.itemId, kind: "momentum", value: 2 });
      await until(() => momentumOf(bandit).value === 2, "the Bandit's 2 Momentum");
      await giveTurn(combat, warrior);
      const banditCombatant = combat.getCombatantsByActor(bandit)[0];
      assert.equal(banditCombatant.budget?.reactions ?? 1, 1, "the Bandit came in without its Reaction");
      canvas.tokens.setTargets([tokenOf(bandit).id]);
      const unpin = pinDie(19);
      let card = null;
      try { card = await attackWithDialog(warrior, warrior.items.get(sword.id)); } finally { unpin(); canvas.tokens.setTargets([]); }
      assert.ok(card, "the swing posted no card");
      made.push(card);
      const outcome = card.rolls[0].outcome;
      assert.isTrue(outcome.success, "the pinned 19 missed");
      assert.isAtLeast(outcome.sl, 2, "the swing reached SL 1, which Daze does not fire on");
      // RATTLE: a point off its Momentum.
      await until(() => momentumOf(bandit).value === 1, "the Bandit losing 1 Momentum");
      // SNAG: barred from Opportunity Attacks in Snag's own words.
      await until(() => bandit.effects.some(e => e.getFlag("azeroth-rpg", HIT_MARK_FLAG)?.kind === "noOpportunity"), "the Snag mark on the Bandit");
      assert.equal(canReact("opportunityAttack", reactionStateOf(bandit, { combatant: banditCombatant })).reason, "AZEROTH.Reaction.Refuse.Snagged",
        "a snagged Bandit may still make an Opportunity Attack");
      // SHOVE: 5 feet (one square) straight away from the warrior.
      await until(() => Math.round(tokenOf(bandit).document.x) === 1200, "the Bandit pushed 5 feet away", 20000);
      assert.equal(Math.round(tokenOf(bandit).document.y), 1000, "the push was not straight away");
      // DAZE: its Reaction gone.
      await until(() => banditCombatant.budget?.reactions === 0, "the Bandit's Reaction taken");
      const text = textOf(game.messages.get(card.id));
      assert.include(text, game.i18n.format("AZEROTH.TraitLanding.Momentum", { name: card.flags["azeroth-rpg"].targets[0].name, n: 1 }), "the card does not say Rattle landed");
      assert.include(text, game.i18n.format("AZEROTH.TraitLanding.Snag", { name: card.flags["azeroth-rpg"].targets[0].name }), "the card does not say Snag landed");
      const record = game.messages.get(card.id).flags["azeroth-rpg"].landedOnHit ?? [];
      for (const kind of ["momentum", "mark", "push", "reaction"]) assert.isTrue(record.some(r => r.kind === kind), `the card records no ${kind} landing`);

      // A HIT TURNED INTO A MISS (what a Parry that holds runs): every one comes back.
      const undone = await withdrawHit(bandit, { messageId: card.id, index: 0 });
      assert.isTrue(undone.momentum === true, "the Momentum did not come back");
      await until(() => momentumOf(bandit).value === 2, "the Bandit's Momentum back at 2");
      await until(() => !bandit.effects.some(e => e.getFlag("azeroth-rpg", HIT_MARK_FLAG)?.kind === "noOpportunity"), "the Snag mark taken off");
      await until(() => Math.round(tokenOf(bandit).document.x) === 1100, "the Bandit put back where it stood", 20000);
      await until(() => banditCombatant.budget?.reactions === 1, "the Bandit's Reaction back");
    });

    it("SEARING PAIN, FEL BOLT AND STONE SPIKE land their hit riders at the SL each creature's Ward leaves", async function () {
      this.timeout(300000);
      const mage = await makeCharacter({ name: "ZZ SL Mage", classes: [["Mage", 5]], spells: ["Searing Pain"], abilities: { int: 18 } });
      const warlock = await makeCharacter({ name: "ZZ SL Warlock", classes: [["Warlock", 3]], spells: ["Fel Bolt"], abilities: { cha: 18 } });
      const druid = await makeCharacter({ name: "ZZ SL Druid", classes: [["Druid", 5]], spells: ["Stone Spike"], abilities: { wis: 18 } });
      const bandit = await makeNpc("Bandit");
      await bandit.update({ "system.health.value": 200, "system.health.max": 200, "system.ward.fel": 1 });
      await sceneWith([{ actor: mage, x: 800, y: 1000 }, { actor: warlock, x: 800, y: 1200 }, { actor: druid, x: 800, y: 1400 },
        { actor: bandit, x: 1100, y: 1200, side: "hostile" }]);
      const combat = await fightWith([mage, warlock, druid, bandit]);
      for (const c of [mage, warlock, druid]) await fullMana(c);

      // SEARING PAIN at SL 2 or better: a Bane on every Attack Test before the end of its next turn.
      await giveTurn(combat, mage);
      const searing = await castAt(mage, "Searing Pain", [bandit]);
      assert.isTrue(searing?.flags["azeroth-rpg"].success, "Searing Pain did not go off");
      assert.isAtLeast(searing.flags["azeroth-rpg"].sl, 2, "Searing Pain reached below SL 2");
      const bane = await until(() => bandit.effects.find(e => e.getFlag("azeroth-rpg", LAID_BANE_FLAG)?.source === "Searing Pain"), "Searing Pain's Bane on the Bandit");
      assert.equal(bane.getFlag("azeroth-rpg", LAID_BANE_FLAG).kind, "attack", "the Bane is not on Attack Tests");
      assert.isTrue(bane.getFlag("azeroth-rpg", LAID_BANE_FLAG).lasting === true, "at SL 2 the Bane is a count, not the span 07 gives it");

      // FEL BOLT at SL 3 after a Fel Ward of 1: the Ward drops by 1 until the end of the warlock's next turn.
      await giveTurn(combat, warlock);
      const bolt = await castAt(warlock, "Fel Bolt", [bandit]);
      const boltFlags = bolt?.flags["azeroth-rpg"];
      assert.isTrue(boltFlags?.success, "Fel Bolt did not go off");
      assert.isAtLeast(boltFlags.damageByTarget[0].effectiveSL, 3, "the Bandit's Fel Ward left Fel Bolt below SL 3");
      const drop = await until(() => bandit.effects.find(e => e.getFlag("azeroth-rpg", HIT_MARK_FLAG)?.kind === "wardDrop"), "Fel Bolt's Ward drop on the Bandit");
      assert.equal(drop.start?.combatant, combat.getCombatantsByActor(warlock)[0].id, "the drop is not keyed on the warlock's turn");
      await until(() => (bandit.system.ward?.fel ?? 0) === 0, "the Bandit's Ward against Fel at 0");

      // STONE SPIKE at SL 2 or better: knocked Prone.
      await giveTurn(combat, druid);
      const spike = await castAt(druid, "Stone Spike", [bandit]);
      assert.isTrue(spike?.flags["azeroth-rpg"].success, "Stone Spike did not go off");
      await until(() => bandit.statuses.has("prone"), "the Bandit knocked Prone");
    });

    it("SHADOW WAVE, SLOW, FROSTBITE AND TURN UNDEAD land their failure riders through the card's own Resist", async function () {
      this.timeout(300000);
      const priest = await makeCharacter({ name: "ZZ SL Priest", classes: [["Priest", 5]], spells: ["Shadow Wave", "Turn Undead"], abilities: { wis: 18 } });
      const mage = await makeCharacter({ name: "ZZ SL Frost", classes: [["Mage", 5]], spells: ["Slow", "Frostbite"], abilities: { int: 18 } });
      const bandit = await makeNpc("Bandit");
      const thug = await makeNpc("Bandit");
      const ghoul = await makeNpc("Plagued Ghoul");
      for (const a of [bandit, thug, ghoul]) await a.update({ "system.health.value": 200, "system.health.max": 200 });
      await sceneWith([{ actor: priest, x: 800, y: 1000 }, { actor: mage, x: 800, y: 1300 },
        { actor: bandit, x: 1000, y: 1000, side: "hostile" }, { actor: ghoul, x: 1000, y: 1100, side: "hostile" }, { actor: thug, x: 1000, y: 1300, side: "hostile" }]);
      const combat = await fightWith([priest, mage, bandit, thug, ghoul]);
      for (const c of [priest, mage]) await fullMana(c);

      // SHADOW WAVE at SL 3: the Bandit that fails is Blinded; the ghoul's Shadow Ward 2 takes the SL below 3.
      await giveTurn(combat, priest);
      const wave = await castAt(priest, "Shadow Wave", [bandit, ghoul], 20);
      const waveFlags = wave?.flags["azeroth-rpg"];
      assert.isTrue(waveFlags?.success, "Shadow Wave did not go off");
      assert.equal(waveFlags.slRider?.kind, "failCondition", "the card carries no failure rider");
      const at = actor => waveFlags.targets.findIndex(t => t.tokenId === tokenOf(actor).id);
      assert.isAtLeast(waveFlags.damageByTarget[at(bandit)].effectiveSL, 3, "the Bandit's SL is below the clause");
      assert.isBelow(waveFlags.damageByTarget[at(ghoul)].effectiveSL, 3, "the ghoul's Shadow Ward did not come off the SL");
      await failResist(wave, at(bandit));
      await until(() => bandit.statuses.has("blinded"), "the Bandit Blinded on its failure");
      await failResist(wave, at(ghoul));
      await settle();
      assert.isFalse(ghoul.statuses.has("blinded"), "the ghoul was Blinded though its Ward took the SL below 3 (07 §8)");

      // SLOW at SL 3: Slowed, and no Reaction for the duration.
      await giveTurn(combat, mage);
      const slow = await castAt(mage, "Slow", [bandit]);
      assert.isTrue(slow?.flags["azeroth-rpg"].success, "Slow did not go off");
      await failResist(slow, 0);
      await until(() => bandit.statuses.has("slowed"), "the Bandit Slowed");
      await until(() => reactionBarred(bandit), "the Bandit's Reaction barred for the duration");
      assert.equal(canReact("opportunityAttack", reactionStateOf(bandit)).reason, "AZEROTH.ReactionBar.Refused", "a Slowed Bandit at SL 3 may still react");

      // FROSTBITE at SL 3: Entangled for the first round beside the Slowed for the rest; its Apply lays no Entangled.
      // The mage cast Slow this turn (an action): a fresh turn's budget for the second cast.
      const mageTurn = await giveTurn(combat, mage);
      await mageTurn.resetBudget();
      await until(() => (mageTurn.budget?.halfActions ?? 0) === 2, "the mage's fresh turn");
      await fullMana(mage);
      const frost = await castAt(mage, "Frostbite", [thug]);
      assert.isTrue(frost?.flags["azeroth-rpg"].success, "Frostbite did not go off");
      assert.deepEqual(frost.flags["azeroth-rpg"].applies?.statuses ?? [], [], "Frostbite's Apply still lays a condition only an SL lands");
      await failResist(frost, 0);
      await until(() => thug.statuses.has("slowed") && thug.statuses.has("entangled"), "the thug Slowed and Entangled");

      // TURN UNDEAD at SL 3: a tier 1 undead that fails is destroyed outright.
      await giveTurn(combat, priest);
      await fullMana(priest);
      assert.equal(ghoul.system.tier, 1, "the Plagued Ghoul is not tier 1");
      const turn = await castAt(priest, "Turn Undead", [ghoul]);
      assert.isTrue(turn?.flags["azeroth-rpg"].success, "Turn Undead did not go off");
      await failResist(turn, 0);
      await until(() => (ghoul.system.health?.value ?? 1) === 0, "the ghoul destroyed outright");
    });
  });
}
