/**
 * What stands on an ALLY, inside a live world (D-755; the lead's play-test,
 * 2026-09-25: *the Paladin's Aura of Resolve does not show the Boon on Spirit
 * Tests to members of the party within range in combat*).
 *
 * `rules/auras.mjs` and `auras.test.mjs` hold the law and every judgement it
 * makes; what neither can reach is the whole path on a prepared world - the
 * sync stamping the feature, the active GM's pass measuring real tokens through
 * core's grid, the effect landing on the ally, the ally's own roll dialog
 * reading the flag, a real cast meeting the Paladin's Armor Points, a floor
 * landing in the `final` phase, a Bound Demon's token being the centre. Each
 * of those was right code with no caller somewhere in this system before
 * (D-681), and each is only visible here.
 *
 * **Poll for exactly what is asserted** (CLAUDE.md §15): the pass runs off
 * hooks on the active GM's client and nothing here awaits it, and a token's
 * document position is interpolated while it travels.
 */

import { cleanup, drainAreaWork, fromPack, made, makeCharacter, makeNpc, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { effectAction, effectsContext, exposeWithDialog } from "../applications/actions.mjs";
import { prepareRoll, targetSnapshots } from "../applications/roll-dialog.mjs";
import { AURA_FLAG } from "../rules/auras.mjs";
import { syncAuras } from "../effects/auras.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;

/** The aura effect a named source laid on this actor, or null. */
const auraOn = (actor, source) => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[AURA_FLAG]?.source === source) ?? null;

/**
 * **LET EVERY PASS THAT IS OWED RUN**, for an assertion that something did NOT
 * happen. A pass is started by hooks nothing here awaits, so a bare check
 * would pass before the pass that should have refused had even begun. Two
 * awaited passes and a frame: the first finishes whatever is in flight, the
 * second is one this test asked for and saw end.
 */
async function aurasSettled() {
  await settle();
  await syncAuras(canvas?.scene ?? null);
  await syncAuras(canvas?.scene ?? null);
  await settle();
}

/** Put a token where it is asked and WAIT FOR IT TO ARRIVE (D-669). */
async function moveTo(actor, x, y = 500) {
  const doc = actor.getActiveTokens(true)[0]?.document;
  if (!doc) throw new Error(`${actor.name} has no token on the scene`);
  await doc.update({ x, y });
  for (let i = 0; i < 200 && (doc.x !== x || doc.y !== y); i++) await new Promise(r => setTimeout(r, 50));
  await settle();
  if (doc.x !== x) throw new Error(`${actor.name} stopped at ${doc.x} on its way to ${x}`);
  return doc;
}

/**
 * Tokens for these actors on the batch's scene, linked, at a disposition.
 * **Core makes every token HOSTILE by default** (14.367's schema), so a test
 * that means *friendly* says so. A square is five feet: 300 px is 15 ft.
 */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y = 500, disposition = "FRIENDLY" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS[disposition] })).toObject());
  }
  const tokens = await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => p.actor.getActiveTokens(true).length), "every token drawn");
  await settle();
  return tokens;
}

/** A started fight over these tokens, its turn events over (D-627). */
async function fightOver(scene, actors) {
  const combat = await Combat.create({ scene: scene.id });
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens(true)[0]?.document;
    return { actorId: a.id, tokenId: token?.id ?? null, sceneId: scene.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  return combat;
}

/** A button-like element the sheet's effect handler reads its effect off. */
function effectRow(effectId) {
  const el = document.createElement("div");
  el.dataset.effectId = effectId;
  return el;
}

export function aurasBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("What stands on an ally (D-755)", function () {
    let restore = null;
    let wasViewing = null;
    let scene = null;

    before(async function () {
      this.timeout(60000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      // The STRING "skip", never a boolean (CLAUDE.md §15).
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Auras", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(180000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // FIGHTS FIRST, then the scene, then everything else: a Combat deleted
      // after its actors makes core look them up strictly (the reactions
      // batch's own teardown, and its reason). Every pass of ours that is owed
      // runs out BEFORE the scene goes (the full-suite fix of D-757).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      // What the batch bound goes with its owner.
      for (const actor of game.actors.filter(a => a.getFlag("azeroth-rpg", "bond")?.ownerName?.startsWith("ZZ"))) await actor.delete().catch(() => {});
      await cleanup();
    });

    /* ---- 02 §7's Aura of Resolve, and Wide Aura -------------------------- */

    it("lays Aura of Resolve on an ally 15 ft away and on the Paladin: a ticked Spirit Boon, none on Body, and a Fel exposure rolled with it", async function () {
      this.timeout(240000);
      const paladin = await makeCharacter({ name: "ZZ Aura Paladin", classes: [["Paladin", 9]] });
      const ally = await makeCharacter({ name: "ZZ Aura Ally", classes: [["Rogue", 5]] });
      await paladin.setParty(true);
      await ally.setParty(true);
      // THE STAMP: the sync writes the feature with its aura, 20 feet.
      await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 20, "the Aura of Resolve feature stamped with its aura");
      const tokens = await place(scene, [{ actor: paladin, x: 500 }, { actor: ally, x: 800 }]);
      try {
        const effect = await until(() => auraOn(ally, "Aura of Resolve"), "the aura reaching the ally 15 ft away");
        assert.equal(effect.name, `Aura of Resolve (${paladin.name})`, "the effect does not name the aura and its holder");
        // **ON THE TOKEN**: a durationless effect is drawn only at ALWAYS.
        assert.equal(effect.showIcon, CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
        assert.equal(effect.showIcon, 2);
        assert.include(effect.img, "spell_holy_devotionaura", "the effect wears the class's crest, not the aura's icon");
        assert.include(effect.description, "20", "the effect does not say how far it reaches");
        assert.lengthOf(effect.system.changes, 0, "a Boon was written as a change: a Boon is dice (CLAUDE.md §6)");
        // THE PALADIN STANDS IN THEIR OWN AURA (the lead, 2026-09-26: *the
        // caster counts as an ally unless the spell or aura specifically says
        // "other than you"*), reversing 2026-09-25's *allies, not the Paladin*.
        const own = await until(() => auraOn(paladin, "Aura of Resolve"), "the aura laid on the Paladin themselves");
        assert.equal(own.name, `Aura of Resolve (${paladin.name})`);

        // THE ALLY'S OWN DIALOG: a ticked line on a Spirit Test, naming whose it is.
        const spirit = prepareRoll(ally, { kind: "resilience", resilience: "spirit" });
        const line = spirit.situational.automatic.find(l => l.id === "auraBoon");
        assert.ok(line, "no aura line on the ally's Spirit dialog");
        assert.isTrue(line.checked);
        assert.equal(line.boons, 1);
        assert.include(line.name, "Aura of Resolve");
        assert.include(line.name, paladin.name);
        // Nothing on Body, in either list.
        const body = prepareRoll(ally, { kind: "resilience", resilience: "body" });
        assert.isFalse([...body.situational.automatic, ...body.situational.judgement].some(l => l.id.startsWith("auraBoon")),
          "the Spirit Boon reached a Body Test");
        // THE PALADIN'S OWN SPIRIT DIALOG TICKS THE SAME LINE, off the effect on
        // them, ONCE - and the old unticked reminder is not restored.
        const mine = prepareRoll(paladin, { kind: "resilience", resilience: "spirit" });
        const ownLine = mine.situational.automatic.filter(l => l.id === "auraBoon");
        assert.lengthOf(ownLine, 1, "the Paladin's own Spirit dialog does not tick the aura's Boon exactly once");
        assert.isTrue(ownLine[0].checked);
        assert.equal(ownLine[0].boons, 1, "the Paladin's own aura gave them more than one Boon");
        assert.include(ownLine[0].name, paladin.name);
        assert.isFalse([...mine.situational.automatic, ...mine.situational.judgement].some(l => l.id === "feature-aura-of-resolve" || l.id === "auraBoonJudged"),
          "the Paladin's own dialog still carries the old reminder");
        const ownBody = prepareRoll(paladin, { kind: "resilience", resilience: "body" });
        assert.isFalse([...ownBody.situational.automatic, ...ownBody.situational.judgement].some(l => l.id.startsWith("auraBoon")),
          "the Paladin's Spirit Boon reached their own Body Test");

        // A FEL EXPOSURE is a Spirit Test (10 §3), and it rolls with the Boon.
        const unpin = pinDie(18);
        let card;
        try {
          card = await exposeWithDialog(ally, "fel");
        } finally {
          unpin();
        }
        assert.ok(card, "the exposure posted no card");
        assert.equal(card.rolls[0].options.boons, 1, "the Fel exposure Test rolled without the aura's Boon");

        // DELETION IS REFUSED IN WORDS (D-751's door), and the effect stays.
        assert.equal(effectsContext(ally).rows.find(r => r.id === effect.id)?.synced, "aura");
        const said = await warnings(() => effectAction(ally, "deleteEffect", effectRow(effect.id)));
        assert.include(said.join(" "), game.i18n.localize("AZEROTH.InPlay.FromAura"), "the refusal said nothing");
        assert.ok(ally.effects.get(effect.id), "a hand delete took the aura's effect off");

        // A RENAMED HOLDER (D-755's review): the ally's effect follows the new
        // name, rather than carrying the old one until somebody moves.
        await paladin.update({ name: "ZZ Aura Paladin Renamed" });
        await until(() => auraOn(ally, "Aura of Resolve")?.name === "Aura of Resolve (ZZ Aura Paladin Renamed)",
          "the laid aura following its holder's new name");
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    it("reaches nobody at 25 ft until Wide Aura, and lifts when the ally walks out of it", async function () {
      this.timeout(240000);
      const paladin = await makeCharacter({ name: "ZZ Wide Paladin", classes: [["Paladin", 9]] });
      const ally = await makeCharacter({ name: "ZZ Wide Ally", classes: [["Rogue", 5]] });
      await paladin.setParty(true);
      await ally.setParty(true);
      await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 20, "the Aura of Resolve feature");
      // 25 ft: five squares.
      const tokens = await place(scene, [{ actor: paladin, x: 500 }, { actor: ally, x: 1000 }]);
      try {
        await aurasSettled();
        assert.isNull(auraOn(ally, "Aura of Resolve"), "the aura reached 25 feet with no Wide Aura");

        // 04's Wide Aura: *10 feet further per rank*. The sync restamps the
        // feature and the pass reads the new reach.
        await talentNamed(paladin, "Wide Aura").update({ "system.taken": 1 });
        await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 30, "Wide Aura's 30 feet on the feature");
        assert.include(featureNamed(paladin, "Aura of Resolve").system.modifiedBy, "Wide Aura");
        const effect = await until(() => auraOn(ally, "Aura of Resolve"), "the widened aura reaching the ally at 25 ft");
        assert.include(effect.description, "30");

        // Walking out lifts it (45 ft).
        await moveTo(ally, 1400);
        await until(() => !auraOn(ally, "Aura of Resolve"), "the aura lifting when the ally walks out of it");
        assert.isFalse(prepareRoll(ally, { kind: "resilience", resilience: "spirit" }).situational.automatic.some(l => l.id === "auraBoon"),
          "the Boon stayed on the dialog of an ally out of reach");
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    it("reaches a friendly creature outside the Party only in a fight, and a hostile one never", async function () {
      this.timeout(240000);
      const paladin = await makeCharacter({ name: "ZZ Fight Paladin", classes: [["Paladin", 9]] });
      await paladin.setParty(true);
      await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 20, "the Aura of Resolve feature");
      const friend = await makeNpc("Wolf");
      await friend.update({ name: "ZZ Friendly Wolf" });
      const foe = await makeNpc("Wolf");
      await foe.update({ name: "ZZ Hostile Wolf" });
      const tokens = await place(scene, [
        { actor: paladin, x: 500, y: 500 },
        { actor: friend, x: 700, y: 500, disposition: "FRIENDLY" },
        { actor: foe, x: 500, y: 700, disposition: "HOSTILE" }
      ]);
      let combat = null;
      try {
        // OUTSIDE A FIGHT the ally rule is the Party's, and neither wolf is in it.
        await aurasSettled();
        assert.isNull(auraOn(friend, "Aura of Resolve"), "a friendly creature outside the Party took the aura outside a fight");
        assert.isNull(auraOn(foe, "Aura of Resolve"), "a hostile creature took the aura");

        // IN A FIGHT the tracker's side decides: the friendly wolf is on the
        // Paladin's side and takes it, the hostile one never does.
        combat = await fightOver(scene, [paladin, friend, foe]);
        await until(() => auraOn(friend, "Aura of Resolve"), "the aura reaching a friendly creature once the fight starts");
        assert.equal(combat.getCombatantsByActor(friend)[0]?.side, "friendly");
        await aurasSettled();
        assert.isNull(auraOn(foe, "Aura of Resolve"), "a hostile creature in the fight took the aura");
        // And the creature's own dialog reads it, as a character's does.
        const line = prepareRoll(friend, { kind: "resilience", resilience: "spirit" }).situational.automatic.find(l => l.id === "auraBoon");
        assert.ok(line?.checked, "the creature's dialog does not tick the aura's Boon");

        // The fight over, the Party's rule again.
        await combat.delete();
        combat = null;
        await until(() => !auraOn(friend, "Aura of Resolve"), "the aura lifting from the friendly creature when the fight ends");
      } finally {
        if (combat) await combat.delete().catch(() => {});
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    /* ---- 04's Avenging Bulwark -------------------------------------------- */

    it("takes the Paladin's Body AP off a real Shadow Bolt after the Ward, and lifts when the shield comes off", async function () {
      this.timeout(240000);
      const paladin = await makeCharacter({ name: "ZZ Bulwark Paladin", classes: [["Paladin", 5]], armor: ["Buckler"] });
      const ally = await makeCharacter({ name: "ZZ Bulwark Ally", classes: [["Rogue", 5]] });
      const warlock = await makeCharacter({ name: "ZZ Bulwark Caster", classes: [["Warlock", 5]] });
      await paladin.setParty(true);
      await ally.setParty(true);
      const buckler = paladin.items.find(i => i.name === "Buckler");
      await buckler.update({ "system.equipped": true });
      await talentNamed(paladin, "Avenging Bulwark").update({ "system.taken": 1 });
      const ap = await until(() => paladin.system.ap?.body, "the Paladin's Body Armor Points with the shield on");
      assert.isAbove(ap, 0);
      assert.isBelow(ap, 5, "Shadow Bolt's 5 would be taken to nothing and the test would prove nothing");
      // The caster pays first (07 §8): a Mana pool at its cap.
      for (const pool of warlock.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
        await warlock.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      }
      await until(() => warlock.poolSnapshot().some(p => p.name === "mana" && p.value >= 2), "the caster's Mana");
      const tokens = await place(scene, [{ actor: paladin, x: 500 }, { actor: ally, x: 700 }]);
      try {
        const effect = await until(() => auraOn(ally, "Avenging Bulwark"), "the Bulwark reaching the ally 10 ft away");
        assert.equal(effect.showIcon, 2);
        await until(() => ally.system.schoolArmor?.shadow === ap && ally.system.schoolArmor?.fel === ap,
          `the ally's Shadow and Fel Armor Points at the Paladin's ${ap}`);
        assert.equal(ally.system.schoolArmor.fire, 0, "the Bulwark reached a school the talent does not name");
        // The Paladin is a *friendly target* of their own Bulwark too (the lead,
        // 2026-09-26): their own Armor Points stand against Shadow and Fel.
        await until(() => paladin.system.schoolArmor?.shadow === ap && auraOn(paladin, "Avenging Bulwark"),
          "the Bulwark laid on the Paladin themselves");

        // A REAL CAST: the target snapshot carries it, and `castSpell` takes
        // it off the damage after the Ward and never off the Success Level.
        const bolt = await fromPack("azeroth-rpg.spells", "Shadow Bolt");
        const [target] = targetSnapshots([ally.getActiveTokens(true)[0]]);
        assert.equal(target.schoolArmor?.shadow, ap, "the target snapshot does not carry the aura's Armor Points");
        const rating = bolt.system.damage.rating;
        const unpin = pinDie(18);
        let card;
        try {
          card = await game.system.azeroth.workflows.castSpell({ actor: warlock, spell: bolt, dc: 5, targets: [target] });
        } finally {
          unpin();
        }
        assert.ok(card, "the cast posted no card");
        const [row] = card.flags["azeroth-rpg"].damageByTarget;
        assert.equal(row.damage, Math.max(0, rating - ap), `Shadow Bolt's ${rating} did not lose the Paladin's ${ap}`);
        assert.equal(row.schoolArmor, ap);
        assert.equal(row.effectiveSL, card.flags["azeroth-rpg"].sl, "the aura reached the Success Level");

        // SWITCHED OFF, THE PALADIN'S ARMOR POINTS MOVE, SWITCHED BACK ON (D-755's
        // review). The diff leaves a switched-off aura alone whatever it says, so
        // the moment a GM switches it back on is the moment it must catch up.
        const laid = auraOn(ally, "Avenging Bulwark");
        await laid.update({ disabled: true });
        await until(() => (ally.system.schoolArmor?.shadow ?? 0) === 0, "a switched-off Bulwark no longer counting");
        const [stoneskin] = await paladin.createEmbeddedDocuments("ActiveEffect", [{
          name: "ZZ Stoneskin",
          system: { changes: [{ key: "system.ap.body", type: "add", value: "1", phase: "final" }] }
        }]);
        await until(() => paladin.system.ap?.body === ap + 1, "the Paladin's Body AP one higher");
        await aurasSettled();
        const off = auraOn(ally, "Avenging Bulwark");
        assert.equal(off?.id, laid.id, "the pass replaced an aura a GM had switched off");
        assert.isTrue(off.disabled, "the pass switched a GM's switched-off aura back on");
        await off.update({ disabled: false });
        await until(() => ally.system.schoolArmor?.shadow === ap + 1,
          `the re-enabled Bulwark following the Paladin's Body AP to ${ap + 1}`);
        await stoneskin.delete();
        await until(() => ally.system.schoolArmor?.shadow === ap, "the Bulwark following the Paladin's Body AP back down");

        // The shield comes off and the aura lifts.
        await buckler.update({ "system.equipped": false });
        await until(() => !auraOn(ally, "Avenging Bulwark") && (ally.system.schoolArmor?.shadow ?? 0) === 0,
          "the Bulwark lifting when the shield comes off");
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    /* ---- 04's Tree of Life ------------------------------------------------ */

    it("puts a FLOOR under an ally's Armor Points and Ward while the druid is a tree: 0 rises to 2, 5 stays 5", async function () {
      this.timeout(240000);
      const druid = await makeCharacter({ name: "ZZ Tree Druid", classes: [["Druid", 5]] });
      const bare = await makeCharacter({ name: "ZZ Tree Bare", classes: [["Rogue", 5]] });
      const plated = await makeCharacter({ name: "ZZ Tree Plated", classes: [["Warrior", 5]], armor: ["Field plate"] });
      for (const a of [druid, bare, plated]) await a.setParty(true);
      await plated.items.find(i => i.name === "Field plate").update({ "system.equipped": true });
      await until(() => plated.system.ap?.body === 5, "the plated ally's Body AP 5");
      await talentNamed(druid, "Tree of Life").update({ "system.taken": 1 });
      const spell = await until(() => druid.items.find(i => i.type === "spell" && i.name === "Tree of Life"), "the talent teaching Tree of Life");
      const tokens = await place(scene, [{ actor: druid, x: 500 }, { actor: bare, x: 800 }, { actor: plated, x: 500, y: 800 }]);
      try {
        // No tree, no floor.
        await aurasSettled();
        assert.isNull(auraOn(bare, "Tree of Life"), "the floor stood with the druid not a tree");
        assert.equal(bare.system.ap.body, 0);

        // The spell's laid effect, flagged as its card flags it (D-657, D-724).
        const [laid] = await druid.createEmbeddedDocuments("ActiveEffect", [{
          name: "Tree of Life", img: spell.img,
          flags: { "azeroth-rpg": { spell: spell.uuid, spellName: spell.name, identifier: "tree-of-life" } }
        }]);
        await until(() => bare.system.ap.body === 2 && bare.system.ap.head === 2 && bare.system.ap.limb === 2,
          "the bare ally's Armor Points rising to 2 at every location");
        for (const school of Object.keys(CONFIG.AZEROTH.schools)) {
          assert.equal(bare.system.ward[school], 2, `the bare ally's Ward against ${school}`);
        }
        await until(() => auraOn(plated, "Tree of Life"), "the floor reaching the plated ally");
        assert.equal(plated.system.ap.body, 5, "the floor lowered an AP 5 ally");
        assert.equal(plated.system.ap.head, 4);
        const change = auraOn(bare, "Tree of Life").system.changes.find(c => c.key === "system.ap.body");
        assert.equal(change.type, "upgrade");
        assert.equal(change.phase, "final");
        // THE DRUID IS AN ALLY INSIDE THEIR OWN TREE (the lead, 2026-09-26):
        // the effect is laid on them, and a floor lowers nothing.
        await until(() => auraOn(druid, "Tree of Life") && druid.system.ap.body >= 2, "the floor laid on the druid themselves");

        // The tree ends and the floor goes with it.
        await laid.delete();
        await until(() => !auraOn(bare, "Tree of Life") && bare.system.ap.body === 0, "the floor lifting when the tree ends");
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    /* ---- 04's Demonic Pact ------------------------------------------------ */

    it("gives the warlock +1 spell damage within 20 ft of the Bound Demon and nothing at 30, and the demon nothing at all", async function () {
      this.timeout(240000);
      const warlock = await makeCharacter({ name: "ZZ Pact Warlock", classes: [["Warlock", 5]] });
      await warlock.setParty(true);
      await until(() => featureNamed(warlock, "Bound Demon") && talentNamed(warlock, "Demonic Pact"), "the Warlock's feature and talent");
      await talentNamed(warlock, "Demonic Pact").update({ "system.taken": 1 });
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const entry = (await pack.getIndex()).find(e => e.name === "Imp");
      const imp = await game.system.azeroth.bound.bind({ owner: warlock, feature: featureNamed(warlock, "Bound Demon"), entry: await pack.getDocument(entry._id), kind: "demon", until: null });
      assert.ok(imp, "no Imp was bound");
      made.push(imp);
      // 30 ft from the imp: six squares.
      const tokens = await place(scene, [{ actor: imp, x: 500 }, { actor: warlock, x: 1100 }]);
      try {
        await aurasSettled();
        assert.isNull(auraOn(warlock, "Demonic Pact"), "the Pact reached the warlock 30 ft from the demon");
        assert.equal(warlock.system.damageBonus.spell.all, 0);

        // Ten feet from the demon, the warlock is in their own Pact.
        await moveTo(warlock, 700);
        const effect = await until(() => auraOn(warlock, "Demonic Pact"), "the Pact reaching the warlock 10 ft from the demon");
        await until(() => warlock.system.damageBonus.spell.all === 1, "the warlock's spells adding 1");
        assert.deepEqual(effect.system.changes.map(c => [c.key, c.type, String(c.value), c.phase]),
          [["system.damageBonus.spell.all", "add", "1", "final"]]);
        // A creature has no spell lane: the demon carries nothing.
        assert.isNull(auraOn(imp, "Demonic Pact"), "the demon took a Pact effect that gives a creature nothing");
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    /* ---- D-755's review: a Long Rest's exposure --------------------------- */

    it("rolls a Long Rest's hostile-school exposure with the aura's Boon and every other automatic line, and names whose aura it was", async function () {
      this.timeout(300000);
      const paladin = await makeCharacter({ name: "ZZ Rest Paladin", classes: [["Paladin", 9]] });
      // Holy and Fel (02 §10): 10 §7 exposes the holder at every Long Rest, on
      // the Fel track, and Fel is a Spirit Test (10 §3).
      const heretic = await makeCharacter({ name: "ZZ Rest Heretic", classes: [["Priest", 5], ["Warlock", 4]] });
      await paladin.setParty(true);
      await heretic.setParty(true);
      await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 20, "the Aura of Resolve feature");
      assert.isTrue((heretic.system.hostilePairings ?? []).some(p => p.includes("holy") && p.includes("fel")),
        "a Priest who is also a Warlock holds no Holy and Fel pairing");
      const tokens = await place(scene, [{ actor: paladin, x: 500 }, { actor: heretic, x: 800 }]);
      try {
        await until(() => auraOn(heretic, "Aura of Resolve"), "the aura reaching the heretic 15 ft away");
        // Poisoned is an AUTOMATIC Bane on every Test (A1): a skipped dialog
        // counts it, and the bare d20 this door used to roll did not.
        await heretic.toggleStatusEffect("poisoned", { active: true });
        const exposed = untilHook("createChatMessage", 60000,
          m => m.flags?.["azeroth-rpg"]?.kind === "corruption" && m.speaker?.actor === heretic.id);
        const unpin = pinDie(18);
        try {
          await heretic.longRest();
        } finally {
          unpin();
        }
        const [card] = await exposed;
        assert.equal(card.flags["azeroth-rpg"].occasion, "hostileSchools");
        assert.equal(card.flags["azeroth-rpg"].track, "fel");
        const roll = card.rolls[0];
        assert.equal(roll.options.boons, 1, "the Long Rest's exposure rolled without the ally's Aura of Resolve");
        assert.equal(roll.options.banes, 1, "the Long Rest's exposure rolled without the Poisoned Bane a skipped dialog counts");
        // The card is the only place this Test is drawn, so it says whose Boon it was.
        const named = (roll.options.provenance ?? []).find(p => p.label === "AZEROTH.Modifier.AuraBoon");
        assert.ok(named, "the exposure card does not say whose aura gave the Boon");
        assert.include(named.formula, "Aura of Resolve");
        assert.include(named.formula, paladin.name);
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id)).catch(() => {});
      }
    });

    /* ---- D-755's review: the viewed scene, and a party on another --------- */

    it("keeps the party's auras while the GM views another scene, and lifts one from an ally whose token leaves this one", async function () {
      this.timeout(300000);
      const paladin = await makeCharacter({ name: "ZZ Scene Paladin", classes: [["Paladin", 9]] });
      const ally = await makeCharacter({ name: "ZZ Scene Ally", classes: [["Rogue", 5]] });
      await paladin.setParty(true);
      await ally.setParty(true);
      await until(() => featureNamed(paladin, "Aura of Resolve")?.system?.aura?.feet === 20, "the Aura of Resolve feature");
      const tokens = await place(scene, [{ actor: paladin, x: 500 }, { actor: ally, x: 800 }]);
      try {
        const effect = await until(() => auraOn(ally, "Aura of Resolve"), "the aura reaching the ally 15 ft away");
        assert.equal(effect.flags["azeroth-rpg"][AURA_FLAG].scene, scene.id, "the laid aura does not name the scene that laid it");

        // THE PREP MAP: another scene, viewed, where neither of them stands.
        // The pass used to sweep every world actor wearing an aura, and lift
        // this one because nothing on the prep map reached the ally.
        const elsewhere = await Scene.create({ name: "ZZ Auras Elsewhere", width: 1000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
        made.push(elsewhere);
        await elsewhere.view();
        await until(() => canvas.ready && canvas.scene?.id === elsewhere.id, "the other scene to be viewed");
        await aurasSettled();
        assert.ok(ally.effects.get(effect.id), "viewing another scene lifted the aura off an ally standing on this one");

        // And back: nothing to write, so the SAME effect is still standing.
        await scene.view();
        await until(() => canvas.ready && canvas.scene?.id === scene.id, "the batch's own scene viewed again");
        await until(() => ally.getActiveTokens(true).length && paladin.getActiveTokens(true).length, "both tokens drawn again");
        await aurasSettled();
        assert.ok(ally.effects.get(effect.id), "coming back re-laid the aura rather than keeping it");

        // THE ALLY LEAVES THIS SCENE: its token goes, and what this scene laid
        // on it goes with it, though it stands on no scene now.
        const allyToken = tokens.find(t => t.actorId === ally.id);
        await scene.deleteEmbeddedDocuments("Token", [allyToken.id]);
        await until(() => !auraOn(ally, "Aura of Resolve"), "the aura lifting from an ally whose token has left the scene");
      } finally {
        if (canvas?.scene?.id !== scene.id) {
          await scene.view().catch(() => {});
          for (let i = 0; i < 200 && !(canvas?.ready && canvas.scene?.id === scene.id); i++) await new Promise(r => setTimeout(r, 50));
        }
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id).filter(id => scene.tokens.has(id))).catch(() => {});
      }
    });
  });
}
