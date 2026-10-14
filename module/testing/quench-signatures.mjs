/**
 * What a Signature DOES, inside a live world (08 §20, D-692).
 *
 * **These are use tests, and they exist because a unit test cannot see a
 * missing caller.** `rules/signatures.mjs` and `rules/signature-doors.test.mjs`
 * cover the law and the composition in Node; what neither can reach is a
 * DOCUMENT METHOD over a PREPARED actor — `CharacterData#prepareDerivedData`
 * composing the refusals, `AzerothActor#resetUses` finding a Signature's uses
 * at a path no other pass walks, `AzerothCombat#_onStartTurn` moving the Mana,
 * and `attackWithDialog` carrying a widened Critical Injury all the way onto a
 * rolled card. Every one of those was right code with no caller until this
 * pass, and every one of them would still have had a passing unit test
 * (D-681).
 *
 * The content is the SHIPPED PACKS wherever the packs carry it: the Critical
 * Injury test picks a real find off the armor pack rather than inventing one,
 * so a conversion that stopped producing them fails here as well.
 *
 * Every document a test makes is deleted in `after`.
 */

import { cardOf, cleanup, fromPack, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle } from "./fixtures.mjs";
import { attackWithDialog, useSignatureWithDialog } from "../applications/actions.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { checkNoRawKeys } from "./expectations.mjs";
import { checkText } from "./geometry.mjs";
import { manaPool } from "../rules/pools.mjs";
import { seedSignature } from "../rules/signatures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** A target as the card's flags carry one — `quench-phase7.mjs`'s own shape. */
const snapshotOf = npc => ({
  tokenId: null, sceneId: null, actorId: npc.id, name: npc.name, defense: npc.system.defense,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], ward: 0, wardSchool: null, wardBySchool: {},
  immune: [], vulnerable: [], statuses: []
});

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

/**
 * Notifications of one kind raised while `fn` runs, with the original put back.
 * **A refusal that says nothing is the fault this exists to catch**: the tracker
 * has to say WHY a thing is unavailable, never merely grey it out.
 */
async function noticesFrom(kind, fn) {
  const raised = [];
  const original = ui.notifications[kind];
  ui.notifications[kind] = function (...args) { raised.push(args[0]); return original.apply(this, args); };
  try { await fn(raised); } finally { ui.notifications[kind] = original; }
  return raised;
}

/**
 * A shipped document whose Signature widens the Critical Injury and is gated
 * on nothing, off the armor or the gear pack.
 *
 * **NOT A WEAPON, and that is the point.** A crit line on a weapon converts to
 * `Keen (Lesser)` (D-690), which the roll has read since D-662; the shelf this
 * door opens is the one the trait could never sit on.
 */
async function widensCritical() {
  for (const key of ["azeroth-rpg.armor", "azeroth-rpg.gear"]) {
    const pack = game.packs.get(key);
    if (!pack) continue;
    for (const doc of await pack.getDocuments()) {
      const s = doc.system?.signatureEffect;
      if (s?.criticalOn === 19 && !(s.gates ?? []).length) return doc;
    }
  }
  throw new Error("no shipped document widens the Critical Injury without a gate");
}

/** A shipped document that gives Mana back at the top of the turn. */
async function ticksMana() {
  for (const key of ["azeroth-rpg.gear", "azeroth-rpg.armor"]) {
    const pack = game.packs.get(key);
    if (!pack) continue;
    for (const doc of await pack.getDocuments()) {
      const s = doc.system?.signatureEffect;
      if ((s?.tick?.mana ?? 0) > 0 && !(s.gates ?? []).length) return doc;
    }
  }
  throw new Error("no shipped document regains Mana at the start of the turn");
}

/**
 * A shipped creature holding a Power pool with room in it, off the bestiary.
 *
 * Read off the PACK rather than named, because 14 is edited and a pinned name
 * fails on correct behaviour as the book grows (D-681). What it must have is
 * a Power pool of at least 2 and **no pool type**, which is every one of them:
 * the block prints a number and no name (D-637).
 */
async function creatureWithPower() {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) throw new Error("no bestiary pack");
  for (const entry of pack.index) {
    const doc = await pack.getDocument(entry._id);
    const power = doc.system?.power ?? null;
    if (power && power.max >= 2 && !power.name) return doc;
  }
  throw new Error("no creature in the bestiary holds a Power pool");
}

/**
 * A world creature that refuses no condition of its own, so a refusal a
 * Signature adds is visible as one.
 *
 * Chosen off the pack by that PROPERTY and never by name: 14 is edited, and a
 * test pinned to a creature's name fails on correct behaviour as the book
 * grows (D-681).
 */
async function plainCreature() {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) throw new Error("no bestiary pack");
  for (const entry of pack.index) {
    const doc = await pack.getDocument(entry._id);
    if ((doc.system?.conditionImmunities ?? []).length) continue;
    const actor = await Actor.create({ ...doc.toObject(), name: `ZZ Bearer ${doc.name}` });
    made.push(actor);
    return actor;
  }
  throw new Error("every creature in the bestiary refuses a condition of its own");
}

/** Put a pack document on an actor, equipped. */
async function equip(actor, source, name = `ZZ ${source.name}`) {
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source.toObject(), name }]);
  await item.update({ "system.equipped": true });
  return item;
}

export function signatureBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("What a Signature does (08 §20, D-692)", function () {
    let restore = null;
    before(async function () {
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await cleanup();
    });

    /* ---- the roll ---------------------------------------------------------- */

    it("makes a natural 19 a Critical Injury while the thing is worn, and a 19 nothing when it is not", async function () {
      this.timeout(90000);
      const source = await widensCritical();
      const actor = await makeCharacter({
        name: "ZZ Signature Crit", classes: [["Warrior", 3]], weapons: ["Longsword"]
      });
      const sword = actor.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });
      assert.notMatch((sword.system.traits ?? []).join(" "), /Keen/i,
        "the fixture's sword carries Keen, so this would pass without a Signature");

      const item = await equip(actor, source);
      await until(() => actor.system.signatureEffects?.criticalOn === 19,
        `${source.name}'s Signature reaching the prepared actor`);

      // 06 §8's Critical Injury on an ATTACK. A natural 19 is 19 + modifiers
      // against DC 5, so the Test hits either way and the only thing under
      // test is the threshold.
      const unpin = pinDie(19);
      try {
        const card = await attackWithDialog(actor, sword, null, { dc: 5 });
        assert.ok(card, "the attack produced no card");
        const roll = card.rolls[0];
        assert.equal(roll.natural, 19, "the die was not pinned to 19");
        assert.equal(roll.options.criticalOn, 19,
          "the Signature's threshold never reached the roll: `mergeWeaponEffects` has no caller");
        assert.isTrue(roll.outcome.critical, "a natural 19 was not a Critical Injury with the item worn");
        assert.include(card.content, game.i18n.localize("AZEROTH.Card.CriticalInjury"),
          "the card offers no Critical Injury");

        // Take it off and the same 19 is an ordinary hit again.
        await item.update({ "system.equipped": false });
        await until(() => (actor.system.signatureEffects?.criticalOn ?? null) === null, "the Signature coming off");
        const plain = await attackWithDialog(actor, sword, null, { dc: 5 });
        assert.equal(plain.rolls[0].natural, 19);
        assert.isFalse(plain.rolls[0].outcome.critical, "a 19 was still critical with the thing in the pack");
      } finally {
        unpin();
      }
    });

    /* ---- the refusals ------------------------------------------------------ */

    it("adds a Signature's refusal to the list `toggleStatusEffect` reads, beside Corruption's own", async function () {
      this.timeout(60000);
      // 10 §4: Fel 15 is **Burning**, and *you cannot be Blinded*.
      const actor = await makeCharacter({
        name: "ZZ Signature Refusals", classes: [["Warrior", 3]], corruption: { fel: 15 }
      });
      await until(() => (actor.system.conditionImmunities ?? []).includes("blinded"),
        "the Fel rung's own refusal");

      // A hand-written Signature: nothing in the packs refuses a condition
      // yet, and `rules/signature-doors.test.mjs` holds that as an assertion.
      const [helm] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Helm of the Unafraid", type: "gear",
        system: {
          equipped: true,
          signature: "<p>You cannot be Frightened.</p>",
          signatureEffect: { kind: "standing", gates: [], refuses: ["frightened"] }
        }
      }]);
      made.push(helm);
      await until(() => (actor.system.conditionImmunities ?? []).includes("frightened"),
        "the Signature's refusal reaching the prepared actor");

      // **BOTH**, which is what says the line appends rather than replacing:
      // a plain assignment would have erased 10's rung (D-691's own scar).
      const held = actor.system.conditionImmunities ?? [];
      assert.include(held, "blinded", "the Signature's refusal erased Corruption's");
      assert.include(held, "frightened", "the Corruption rung erased the Signature's");

      // And the door refuses both, which is the only thing that makes them mean
      // anything at the table.
      assert.isFalse(await actor.toggleStatusEffect("frightened", { active: true }),
        "the Signature's refusal did not reach `toggleStatusEffect`");
      assert.isFalse(actor.statuses.has("frightened"), "Frightened landed anyway");
      assert.isFalse(await actor.toggleStatusEffect("blinded", { active: true }),
        "the Corruption rung's refusal stopped working");

      // A gate that does not hold withholds the refusal.
      await helm.update({ "system.signatureEffect.gates": [{ kind: "class", value: "Paladin" }] });
      await until(() => !(actor.system.conditionImmunities ?? []).includes("frightened"),
        "the gated refusal being withheld from a Warrior");
      assert.include(actor.system.conditionImmunities ?? [], "blinded",
        "withholding the Signature took the Corruption rung with it");
    });

    /* ---- the rest ---------------------------------------------------------- */

    it("refills a pressed Signature's uses at a rest, at a path no other pass walks", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Signature Uses", classes: [["Warrior", 3]] });
      const [item] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Horn of the Vanguard", type: "gear",
        system: {
          equipped: true,
          signature: "<p>Once per Short Rest, as a Half-Action, every ally within 20 feet takes a Boon.</p>",
          signatureEffect: {
            kind: "use", gates: [],
            use: { action: "half", uses: { max: 1, value: 0, per: "short" }, note: "ZZ the note" }
          }
        }
      }]);
      made.push(item);
      assert.equal(item.system.signatureEffect.use.uses.value, 0, "the fixture did not spend the use");

      const names = await actor.resetUses("short");
      assert.include(names, item.name, "the rest card never names the Signature it refilled");
      assert.equal(item.system.signatureEffect.use.uses.value, 1,
        "a Short Rest did not refill the Signature: `resetUses` walks `system.uses` alone");

      // **THE PARTIAL UPDATE SURVIVED IT** (D-671). The write is a dotted
      // path, so `migrateData` sees `{use: {uses: {value: 1}}}` and a guard
      // that rebuilt the object would have written a null over the action and
      // the note.
      assert.equal(item.system.signatureEffect.use.action, "half", "the refill emptied the Signature's action");
      assert.equal(item.system.signatureEffect.use.note, "ZZ the note", "the refill emptied the Signature's note");
      assert.equal(item.system.signatureEffect.use.uses.per, "short", "the refill emptied the Signature's clock");

      // A Long Rest refreshes a Short Rest's uses too, and a second run at a
      // full counter touches nothing.
      assert.deepEqual(await actor.resetUses("short"), [], "a full Signature was refilled again");
    });

    /* ---- the tick ---------------------------------------------------------- */

    it("gives Mana back at the start of the turn from what is worn", async function () {
      this.timeout(90000);
      const source = await ticksMana();
      const actor = await makeCharacter({
        name: "ZZ Signature Tick", classes: [["Mage", 5]], abilities: { int: 16 }
      });
      await equip(actor, source);
      const gain = await until(() => actor.system.signatureEffects?.tick?.mana || null,
        `${source.name}'s tick reaching the prepared actor`);

      const pool = actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
      assert.ok(pool, "the Mage has no Mana pool");
      assert.isAbove(pool.max, 1, "the Mana pool has no room to give anything back");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: 0 });
      await until(() => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana")?.value === 0,
        "the Mana pool emptying");

      const since = game.messages.size;
      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await combat.startCombat();
        // The lifecycle hooks run on the active GM's client after the update
        // that moved the turn, and the click does not await them (D-627), so
        // poll for exactly the number this is about to assert.
        const want = Math.min(gain, pool.max);
        await until(() => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana")?.value >= want,
          "the Signature's Mana tick at the start of the turn");

        // **AND WAIT FOR THE CARD SEPARATELY.** `_turnTicks` moves every pool
        // first and posts ONE message at the end, so a bare assertion here
        // caught the card in flight about one run in two — which is the
        // wait-on-one-field-assert-another race CLAUDE.md §14 names, and this
        // test hit it on its first live run.
        await until(() => game.messages.contents.slice(since).some(m =>
          m.getFlag("azeroth-rpg", "kind") === "tick" && m.content.includes(actor.name)),
        "the tick's own line in chat");
      } finally {
        await combat.delete();
      }
    });

    it("GIVES MANA BACK TO A CREATURE, WHOSE POOL NAMES NOTHING", async function () {
      this.timeout(90000);
      // **THE TICK WAS A NO-OP ON ALL 164 CREATURES** until 2026-09-10, and the
      // docblock over `_signatureTicks` asserted the opposite. `poolSnapshot()`
      // gives a creature `name: null` — 14's block prints a number in the Power
      // row and no type — so `find(p => p.name === "mana")` matched nothing and
      // the whole Mana half was skipped in silence (D-637's own pitfall, and
      // D-681's shape: a unit test on the pure rule could never see it).
      //
      // This is the assertion that the CONSUMER moved. It fails against the
      // line as it stood, because the creature's Power never leaves 0.
      const source = await ticksMana();
      const creature = await creatureWithPower();
      const actor = await makeNpc(creature.name);
      await equip(actor, source);
      const gain = await until(() => actor.system.signatureEffects?.tick?.mana || null,
        `${source.name}'s tick reaching ${creature.name}`);

      const pool = manaPool(actor.poolSnapshot());
      assert.ok(pool, `${creature.name} has no Power pool for the tick to find`);
      assert.isNull(pool.name, "the creature's pool names a type, so this test proves nothing");
      assert.isAbove(pool.max, 1, "the Power pool has no room to give anything back");
      await actor.updatePool({ kind: "power", value: 0 });
      await until(() => actor.system.power?.value === 0, "the creature's Power emptying");

      const combat = await Combat.create({});
      await combat.activate();
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await combat.startCombat();
        const want = Math.min(gain, pool.max);
        // Wait for exactly what is asserted (CLAUDE.md §14's own race).
        await until(() => (actor.system.power?.value ?? 0) >= want,
          `${creature.name}'s Power coming back from ${source.name}`);
        assert.isAtLeast(actor.system.power.value, want,
          "the creature's Power did not move on the Signature's tick");
      } finally {
        await combat.delete();
      }
    });

    /* ---- the standing column ----------------------------------------------- */

    it("carries a Signature's grant to an ability score, through the one grant door", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({
        name: "ZZ Signature Grant", classes: [["Paladin", 3]], abilities: { str: 12 }
      });
      const before = actor.system.abilities.str.total;
      const [belt] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Girdle of the Silver Hand", type: "gear",
        system: {
          equipped: true,
          signature: "<p>A Paladin wearing it adds 2 to their Strength.</p>",
          signatureEffect: { kind: "standing", gates: [{ kind: "class", value: "Paladin" }], grants: ["+2 Strength"] }
        }
      }]);
      made.push(belt);
      await until(() => actor.system.abilities.str.total === before + 2,
        "the Signature's grant reaching the score");
      // The plate names what gave it, which is what the Overview column draws.
      assert.deepEqual(actor.system.abilities.str.sources.map(s => s.name), [belt.name],
        "the score moved and the plate does not say what moved it");

      // The gate is judged on the BEARER: the same belt on a Rogue grants
      // nothing, and this is the only thing that says the gate is read at all.
      await belt.update({ "system.signatureEffect.gates": [{ kind: "class", value: "Rogue" }] });
      await until(() => actor.system.abilities.str.total === before, "the gate withholding the grant");
    });

    /* ---- the scalar families (2026-09-10) ---------------------------------- */

    /**
     * **THE FOUR SCALARS A WORN THING GRANTS, ON A PREPARED ACTOR.**
     *
     * `parseGrant` had read `+N Defense`, `+N Attack`, `+N Speed` and
     * `+N Initiative` since D-691 and `grantsFor` dropped every one of them -
     * *"`grantsFor` ignores them because no worn thing grants one"*, said the
     * module, while 08 §20's Signature is exactly a worn thing that does. So
     * the lead's dodge, hit and haste ratings had nowhere to land. This is the
     * assertion that each number MOVED, which is the only kind a unit test
     * cannot make (D-681).
     */
    it("MOVES DEFENSE, SPEED AND INITIATIVE ON THE ACTOR, AND PUTS THEM BACK", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({
        name: "ZZ Signature Scalars", classes: [["Warrior", 3]], abilities: { dex: 14 }
      });
      const before = {
        defense: actor.system.defense,
        speed: actor.system.speed,
        initiative: actor.system.initiative,
        attack: actor.system.attackBonus ?? 0
      };
      const [charm] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Charm of the Quickening", type: "gear",
        system: {
          equipped: true,
          signature: "<p>It adds 2 to your Defense, 10 feet to your Speed and 1 to your Initiative.</p>",
          signatureEffect: {
            kind: "standing", gates: [],
            grants: ["+2 Defense", "+10 Speed", "+1 Initiative", "+3 Attack"]
          }
        }
      }]);
      made.push(charm);
      await until(() => actor.system.defense === before.defense + 2,
        "the Signature's +2 Defense reaching the prepared actor");
      assert.equal(actor.system.speed, before.speed + 10, "the +10 Speed never reached system.speed");
      assert.equal(actor.system.initiative, before.initiative + 1, "the +1 Initiative never reached system.initiative");
      assert.equal(actor.system.attackBonus, before.attack + 3, "the +3 Attack never reached system.attackBonus");

      // A PART, not a floor: the tooltip's parts say where the feet came from.
      const part = (actor.system.speedParts ?? []).find(p => p.key === "grant");
      assert.ok(part, "the Speed grant is not a part, so the banner cannot say where it came from");
      assert.equal(part.value, 10);

      // And the Overview column names the thing behind every point, which is
      // what stops a number moving with nothing on the sheet to explain it.
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("overview", "primary");
        await settle();
        const column = sheet.element.querySelector('section[data-tab="overview"] .azeroth-overview-force');
        assert.ok(column, "the Overview tab draws no In-force column");
        assert.include(column.textContent, game.i18n.localize("AZEROTH.Overview.Bonuses"),
          "the In-force column has no Bonuses heading");
        assert.include(column.textContent, charm.name,
          "the In-force column does not name what granted the bonus");
        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached the In-force column");
      } finally {
        await sheet.close();
      }

      // Take it off and every one of them goes back.
      await charm.update({ "system.equipped": false });
      await until(() => actor.system.defense === before.defense, "the Defense going back when the thing came off");
      assert.equal(actor.system.speed, before.speed, "the Speed stayed up with the thing in the pack");
      assert.equal(actor.system.initiative, before.initiative, "the Initiative stayed up with the thing in the pack");
      assert.equal(actor.system.attackBonus, before.attack, "the Attack bonus stayed up with the thing in the pack");
    });

    it("RAISES THE ATTACK TEST'S OWN TOTAL, which is composed at the door and has no stored number", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({
        name: "ZZ Signature Attack", classes: [["Warrior", 3]], weapons: ["Longsword"]
      });
      const sword = actor.items.find(i => i.name === "Longsword");
      await sword.update({ "system.equipped": true });

      const unpin = pinDie(10);
      try {
        const plain = await attackWithDialog(actor, sword, null, { dc: 5 });
        assert.ok(plain, "the attack produced no card");
        const [ring] = await actor.createEmbeddedDocuments("Item", [{
          name: "ZZ Gauntlets of the True Strike", type: "gear",
          system: {
            equipped: true,
            signature: "<p>It adds 3 to your Attack Tests.</p>",
            signatureEffect: { kind: "standing", gates: [], grants: ["+3 Attack"] }
          }
        }]);
        made.push(ring);
        await until(() => actor.system.attackBonus === 3, "the +3 Attack reaching the prepared actor");
        const armed = await attackWithDialog(actor, sword, null, { dc: 5 });
        assert.equal(armed.rolls[0].natural, 10, "the die was not pinned");
        assert.equal(armed.rolls[0].total, plain.rolls[0].total + 3,
          "the worn +3 Attack never reached the roll: `attackWithDialog` builds its modifiers at the door");
        // The card says WHY the number was what it was (CLAUDE.md §7).
        assert.include(armed.content, game.i18n.localize("AZEROTH.Sheet.Passive"),
          "the card does not say where the extra 3 came from");
      } finally {
        unpin();
      }
    });

    it("CARRIES A WORN BOON ONTO THE PARRY, WHICH IS AN ATTACK TEST OF ITS OWN (06 §6)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({
        name: "ZZ Signature Parry", classes: [["Warrior", 3]], weapons: ["Longsword"]
      });
      await actor.items.find(i => i.name === "Longsword").update({ "system.equipped": true });
      const [aegis] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Aegis of the Duelist", type: "gear",
        system: {
          equipped: true,
          signature: "<p>You take a Boon on Parry Tests.</p>",
          signatureEffect: { kind: "standing", gates: [], grants: ["A Boon on Parry Tests"] }
        }
      }]);
      made.push(aegis);
      await until(() => (actor.system.grants?.testBoonSources?.parry ?? []).length === 1,
        "the Boon on the Parry reaching the prepared actor");

      // The line the roll dialog raises, through the door the dialog itself
      // uses. A Parry is `kind: "attack"` with `parry: true`, and the Boon
      // narrows to it: an ordinary swing gets nothing.
      const parried = prepareRoll(actor, { kind: "attack", parry: true });
      const line = parried.situational.automatic.find(l => l.id === "gearTestBoon");
      assert.ok(line, "the Parry's dialog raises no line for the worn Boon");
      assert.equal(line.boons, 1);
      assert.isTrue(line.checked, "the roller's own gear is automatic");
      assert.include(line.name ?? "", aegis.name, "the line does not name what is granting it");
      const swung = prepareRoll(actor, { kind: "attack" });
      assert.isUndefined(swung.situational.automatic.find(l => l.id === "gearTestBoon"),
        "a Boon that names only the Parry reached an ordinary swing");

      // And the widening holds the other way: a Boon on Attack Tests reaches
      // the Parry, because 06 §6 says the Parry IS one.
      await aegis.update({ "system.signatureEffect.grants": ["A Boon on Attack Tests"] });
      await until(() => (actor.system.grants?.testBoonSources?.attack ?? []).length === 1,
        "the Boon on Attack Tests reaching the prepared actor");
      assert.ok(prepareRoll(actor, { kind: "attack", parry: true }).situational.automatic.find(l => l.id === "gearTestBoon"),
        "a Boon on Attack Tests did not reach the Parry");
    });

    it("CARRIES THE INITIATIVE GRANT INTO THE TRACKER, which used to re-derive it off Dexterity alone", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({
        name: "ZZ Signature Initiative", classes: [["Warrior", 3]], abilities: { dex: 14 }
      });
      const [pendant] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Pendant of Quickening", type: "gear",
        system: {
          equipped: true,
          signature: "<p>It adds 2 to your Initiative.</p>",
          signatureEffect: { kind: "standing", gates: [], grants: ["+2 Initiative"] }
        }
      }]);
      made.push(pendant);
      await until(() => actor.system.initiative === 14, "the +2 Initiative on a Dex 14 character (10 + 2 + 2)");

      const combat = await Combat.create({});
      try {
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        const combatant = combat.combatants.find(c => c.actorId === actor.id);
        assert.ok(combatant, "the combatant was never made");
        assert.equal(combatant.derivedInitiative, 14,
          "the tracker recomputed the Initiative off the Dex modifier and threw the grant away");
      } finally {
        await combat.delete();
      }
    });

    it("ADDS THE VESTMENTS' 2 HEALTH TO A SPELL AND NOT TO A DRAUGHT", async function () {
      this.timeout(120000);
      // 08 §20: *A Priest wearing it restores 2 additional Health with every
      // **spell** that restores any.* `applyHealing` added it to ANY healing
      // that named a giver until 2026-09-10, so a Priest in the Vestments
      // drinking a healing draught got 2 the chapter does not give - and so did
      // Lay on Hands, which 02 owns as a class feature. The book wins
      // (CLAUDE.md §17). The draught is the half nothing caught.
      const priest = await makeCharacter({
        name: "ZZ Vestments Priest", classes: [["Priest", 5]], spells: ["Holy Light"], abilities: { wis: 16 }
      });
      const vestments = await equip(priest, await fromPack("azeroth-rpg.armor", "Vestments of Transcendence"));
      await until(() => priest.system.signatureEffects?.healingBonus === 2,
        "the Vestments' healing bonus reaching the prepared Priest");

      // ---- the spell. Its card's own Apply healing button, pressed.
      const target = await makeNpc("Plagued Ghoul");
      await target.update({ "system.health.value": 1 });
      const spell = priest.items.find(i => i.name === "Holy Light");
      assert.equal(spell.system.heal.amount, 6, "the pack no longer heals 6 with Holy Light");
      const card = await cardOf("spell", priest, { spell, face: 20, args: { targets: [snapshotOf(target)] } });
      const button = card.element.querySelector('[data-action="applyHealing"][data-target-index="0"]');
      assert.ok(button, "no Apply healing for the target on Holy Light's card");
      await CARD_ACTIONS.applyHealing(button, card.message);
      assert.equal(target.system.health.value, 1 + 6 + 2,
        "the Vestments did not add their 2 Health to the spell");

      // ---- the draught, through the real door. NO BONUS.
      const draught = await fromPack("azeroth-rpg.gear", "Healing draught");
      assert.equal(draught.system.use.heal.health, 4, "the pack no longer heals 4 with a Healing draught");
      const [held] = await priest.createEmbeddedDocuments("Item", [{ ...draught.toObject(), name: "ZZ Healing draught" }]);
      const hurt = Math.max(1, priest.system.health.max - 10);
      await priest.update({ "system.health.value": hurt });
      await until(() => priest.system.health.value === hurt, "the Priest's Health set");
      await game.system.azeroth.workflows.useGear({ actor: priest, item: held });
      await until(() => priest.system.health.value !== hurt, "the draught landing");
      assert.equal(priest.system.health.value, hurt + 4,
        "the Vestments added their 2 Health to a DRAUGHT, which 08 §20 does not give");
      assert.ok(vestments.system.equipped, "the Vestments came off in the middle of the test");
    });

    /* ---- the press (Phase 4b) ---------------------------------------------- */

    it("spends the use, posts one card, and refuses the second press", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Signature Press", classes: [["Warrior", 3]] });
      const [horn] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Horn of the Second Wind", type: "gear",
        system: {
          equipped: true,
          signature: "<p>Once per Short Rest, as a Half-Action, you regain 4 Health.</p>",
          signatureEffect: {
            kind: "use", gates: [],
            use: { action: "half", uses: { max: 1, value: 1, per: "short" }, heal: { health: 4 } }
          }
        }
      }]);
      made.push(horn);
      // Health with room to give back, so the heal is visible.
      await actor.update({ "system.health.value": 1 });

      const since = game.messages.size;
      const card = await useSignatureWithDialog(actor, horn);
      assert.ok(card, "pressing the Signature posted no card: `useSignature` has no caller");
      assert.equal(card.getFlag("azeroth-rpg", "kind"), "signature", "the card is not a Signature's");
      // The item's OWN sentence on the card, never a line shared by all of them.
      assert.include(card.content, "Once per Short Rest", "the card does not carry the item's own sentence");
      assert.equal(game.messages.size - since, 1, "one press posted more than one card");
      assert.isAbove(actor.system.health.value, 1, "the press healed nothing");
      assert.equal(horn.system.signatureEffect.use.uses.value, 0, "the press did not strike the use");
      // AND THE PARTIAL UPDATE SURVIVED IT (D-671): the strike is a dotted path.
      assert.equal(horn.system.signatureEffect.use.action, "half", "striking the use emptied the action");
      assert.equal(horn.system.signatureEffect.use.uses.per, "short", "striking the use emptied the clock");

      // The second press refuses, NAMING WHY, and posts nothing.
      const before = game.messages.size;
      const warned = await noticesFrom("warn", async () => {
        assert.isNull(await useSignatureWithDialog(actor, horn), "a spent Signature pressed again");
      });
      assert.equal(game.messages.size, before, "a refused press still posted a card");
      assert.isTrue(warned.some(w => String(w).includes(game.i18n.localize("AZEROTH.Signature.Refusal.Spent"))),
        `the refusal did not say WHY: ${JSON.stringify(warned)}`);
    });

    it("refuses a gated press for the wrong class and holds it for the right one", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Signature Gated Press", classes: [["Rogue", 3]] });
      const [plate] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Battleplate of the Sworn", type: "armor",
        system: {
          equipped: true,
          signature: "<p>A Warrior wearing it may halve the damage of one attack that hits them.</p>",
          signatureEffect: {
            kind: "use", gates: [{ kind: "class", value: "Warrior" }],
            use: { action: "reaction", mitigates: { halve: true } }
          }
        }
      }]);
      made.push(plate);

      const warned = await noticesFrom("warn", async () => {
        assert.isNull(await useSignatureWithDialog(actor, plate), "a Rogue pressed a Warrior's Signature");
      });
      assert.isTrue(warned.some(w => String(w).includes(game.i18n.localize("AZEROTH.Signature.Refusal.Gate"))),
        `the gate refusal did not say WHY: ${JSON.stringify(warned)}`);

      // The same plate on a Warrior holds, and the mark it lays takes the next
      // blow down - which is the only thing that says `use.mitigates` is read.
      await plate.update({ "system.signatureEffect.gates": [{ kind: "class", value: "Rogue" }] });
      // Wait for EXACTLY what the next line depends on (CLAUDE.md §14): the
      // rewritten gate on the prepared item, not a bare tick.
      await until(() => plate.system.signatureEffect.gates[0]?.value === "Rogue", "the gate rewritten");
      assert.ok(await useSignatureWithDialog(actor, plate), "the gated Signature refused its own class");
      assert.isTrue(Boolean(actor.getFlag("azeroth-rpg", "mitigate")), "the press laid no mark on the bearer");
      const health = actor.system.health.value;
      await actor.applyDamage(8, { struck: true });
      assert.equal(actor.system.health.value, health - 4, "the mark did not halve the blow");
      assert.isNotOk(actor.getFlag("azeroth-rpg", "mitigate"), "the mark survived the blow it spent itself on");
    });

    it("REFUSES A `spell` SIGNATURE AT THE PRESS, GATE AND ALL", async function () {
      this.timeout(90000);
      // `useSignatureWithDialog` sent a `spell` kind STRAIGHT to `castItemSpell`
      // until 2026-09-10, so the gate, the uses and the `noSpell` refusal were
      // held up by the template's `disabled` attribute alone and `pressRefusal`
      // was never consulted on that path. A macro pressing this on a Rogue cast
      // the Priest's spell. It is the one door in the file that did not re-check
      // at the press, and this is the test that says it does now.
      const spells = game.packs.get("azeroth-rpg.spells");
      const first = spells.index.contents[0];
      const uuid = `Compendium.azeroth-rpg.spells.Item.${first._id}`;
      const actor = await makeCharacter({ name: "ZZ Signature Spell Press", classes: [["Rogue", 3]] });
      const [robe] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Vestments of the Refused", type: "armor",
        system: {
          equipped: true,
          signature: "<p>A Priest wearing it may cast the spell woven into it.</p>",
          spells: [{ uuid, name: first.name, dc: 13, uses: { max: 0, value: 0 } }],
          signatureEffect: { kind: "spell", gates: [{ kind: "class", value: "Priest" }] }
        }
      }]);
      made.push(robe);

      const since = game.messages.size;
      const warned = await noticesFrom("warn", async () => {
        assert.isNull(await useSignatureWithDialog(actor, robe), "a Rogue cast the Priest's woven spell");
      });
      assert.isTrue(warned.some(w => String(w).includes(game.i18n.localize("AZEROTH.Signature.Refusal.Gate"))),
        `the spell press refused without saying WHY: ${JSON.stringify(warned)}`);
      await settle();
      assert.equal(game.messages.size, since, "the refused press still posted a card");

      // And the `noSpell` refusal on the same path: the gate holds, the list is
      // empty, and the door says so rather than doing nothing.
      await robe.update({ "system.signatureEffect.gates": [{ kind: "class", value: "Rogue" }], "system.spells": [] });
      await until(() => (robe.system.spells ?? []).length === 0 && robe.system.signatureEffect.gates[0]?.value === "Rogue",
        "the spell list emptied and the gate rewritten");
      const empty = await noticesFrom("warn", async () => {
        assert.isNull(await useSignatureWithDialog(actor, robe), "a Signature with no spell cast something");
      });
      assert.isTrue(empty.some(w => String(w).includes(game.i18n.localize("AZEROTH.Signature.Refusal.NoSpell"))),
        `the empty spell list refused without saying WHY: ${JSON.stringify(empty)}`);
    });

    /* ---- one sentence at a time (D-722) ------------------------------------ */

    it("A GATE COVERS ONLY ITS OWN SENTENCE: a Rogue takes the retaliation and not the Damage Rating", async function () {
      this.timeout(120000);
      // The lead's own worked item, typed at the Forge on 2026-09-14. Before
      // D-722 the Shaman clause sat at the top level and `gateHolds` withheld
      // the WHOLE descriptor from everybody else, so the retaliation that
      // sentence gives to the table was silently a Shaman's.
      const actor = await makeCharacter({ name: "ZZ Signature Branch", classes: [["Rogue", 3]] });
      const [axe] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Stormstrike Axe", type: "weapon",
        system: {
          rarity: "epic",
          equipped: true,
          signature: "<p>A creature that hits you takes 1 Nature damage. "
            + "A Shaman wielding it adds 2 to its Damage Rating.</p>",
          signatureEffect: {
            kind: "whenStruck",
            gates: [],
            whenStruck: { damage: { amount: 1, type: "nature" } },
            gated: [{ gates: [{ kind: "class", value: "Shaman" }], grants: ["+2 Damage Rating"] }]
          }
        }
      }]);
      made.push(axe);

      // **THE PREPARED ACTOR** — `CharacterData#prepareDerivedData` composes
      // the aggregate, and it is where the old shape hid the fault.
      await until(() => (actor.system.signatureEffects?.whenStruck ?? []).length === 1,
        "the ungated sentence reaching the prepared Rogue");
      assert.deepEqual(actor.system.signatureEffects.whenStruck[0].damage, { amount: 1, type: "nature" },
        "the retaliation was withheld from the Rogue by the Shaman's gate");
      assert.equal(actor.system.signatureEffects.damageRating, 0,
        "a Rogue took the Shaman's Damage Rating");
      assert.notInclude(actor.system.signatureEffects.grants, "+2 Damage Rating",
        "the branch's grant reached a Rogue through `grantsOn`");

      // ---- and the sheet says WHY, against the right half of the sentence.
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const panel = sheet.element.querySelector('section[data-tab="combat"] .azeroth-signatures');
        assert.ok(panel, "the Combat tab draws no Signatures panel");
        const row = [...panel.querySelectorAll("li")].find(li => li.textContent.includes("Stormstrike Axe"));
        assert.ok(row, "the worn Signature has no row");
        const text = row.textContent.replace(/\s+/g, " ");
        assert.include(text, game.i18n.localize("AZEROTH.Signature.PartFails"),
          "the branch's refusal is not said in words beside the row");
        assert.include(text, game.i18n.localize("AZEROTH.Signature.Gate.Class"),
          "the branch does not name its gate, so a player cannot learn why");
        assert.include(text, "Shaman", "the branch's gate does not print the class it names");
        // AND NOT THE WHOLE-ITEM REFUSAL, which would say the opposite of the
        // truth: the retaliation IS working for this Rogue.
        assert.notInclude(text, game.i18n.localize("AZEROTH.Signature.GateFails"),
          "the sheet says the whole Signature is withheld, and half of it is not");

        // The Overview column carries the gate too, as a summary.
        sheet.changeTab("overview", "primary");
        await settle();
        const force = sheet.element.querySelector('section[data-tab="overview"] .azeroth-force-signatures');
        assert.ok(force, "the Overview tab draws no Signatures row");
        assert.include(force.textContent, "Shaman",
          "the In-force column reads the Signature as ungated");

        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached a Signature surface");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [],
          `the gated-sentence lines are not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    it("greys a GATED PRESS for the wrong class, with words beside it, and fires it for the right one", async function () {
      this.timeout(120000);
      // The lead's second example: *A Shaman may spend a Half-Action to call
      // the elements. Anyone wielding it takes a Boon on Parry.* The press is a
      // Shaman's and the sentence beside it is everybody's, so the gate rides
      // `useGates` and the trunk's own list is empty - and `pressGates` is the
      // ONE reading the door and all three surfaces judge the button on.
      const horn = () => ({
        name: "ZZ Horn of the Elements", type: "gear",
        system: {
          rarity: "rare",
          equipped: true,
          signature: "<p>A Shaman wielding it may spend a Half-Action to regain 4 Health. "
            + "A creature that hits you takes 1 Nature damage.</p>",
          signatureEffect: {
            kind: "use",
            gates: [],
            useGates: [{ kind: "class", value: "Shaman" }],
            use: { action: "half", heal: { health: 4 } },
            whenStruck: { damage: { amount: 1, type: "nature" } }
          }
        }
      });

      const rogue = await makeCharacter({ name: "ZZ Press Gate Rogue", classes: [["Rogue", 3]] });
      const [rogueHorn] = await rogue.createEmbeddedDocuments("Item", [horn()]);
      made.push(rogueHorn);
      await rogue.update({ "system.health.value": 1 });

      const since = game.messages.size;
      const warned = await noticesFrom("warn", async () => {
        assert.isNull(await useSignatureWithDialog(rogue, rogueHorn), "a Rogue pressed a Shaman's button");
      });
      await settle();
      assert.equal(game.messages.size, since, "a refused press still posted a card");
      assert.isTrue(warned.some(w => String(w).includes(game.i18n.localize("AZEROTH.Signature.Refusal.Gate"))),
        `the press refusal did not say WHY: ${JSON.stringify(warned)}`);
      assert.equal(rogue.system.health.value, 1, "the refused press healed the Rogue anyway");

      // The sentence BESIDE the press still works for the Rogue, which is the
      // whole point: an empty trunk gate holds for everybody.
      await until(() => (rogue.system.signatureEffects?.whenStruck ?? []).length === 1,
        "the ungated sentence reaching the Rogue");

      // The button is greyed on the sheet and its own gate is printed beside it.
      const sheet = await openSheet(rogue);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const panel = sheet.element.querySelector('section[data-tab="combat"] .azeroth-signatures');
        const row = [...panel.querySelectorAll("li")].find(li => li.textContent.includes("Horn of the Elements"));
        assert.ok(row, "the pressed Signature has no row");
        const button = row.querySelector('[data-action="useSignature"]');
        assert.ok(button, "the pressed Signature has no Use button");
        assert.isTrue(button.disabled, "the button is live for a Rogue the press refuses");
        const text = row.textContent.replace(/\s+/g, " ");
        assert.include(text, "Shaman", "the greyed button does not name the class it is for");
        assert.include(text, game.i18n.localize("AZEROTH.Signature.Refusal.Gate"),
          "the greyed button says nothing: a grey alone is the state a player asks the GM about");
      } finally {
        await sheet.close();
      }

      // ---- and the same item on a Shaman presses.
      const shaman = await makeCharacter({ name: "ZZ Press Gate Shaman", classes: [["Shaman", 3]] });
      const [shamanHorn] = await shaman.createEmbeddedDocuments("Item", [horn()]);
      made.push(shamanHorn);
      await shaman.update({ "system.health.value": 1 });
      const before = game.messages.size;
      const card = await useSignatureWithDialog(shaman, shamanHorn);
      assert.ok(card, "the gated press refused the class it names");
      made.push(card);
      assert.equal(game.messages.size - before, 1, "one press posted more than one card");
      assert.isAbove(shaman.system.health.value, 1, "the press healed nothing");
    });

    it("SAYS A GATED PRESS'S CLAUSE ONCE on a Rogue's sheet, off the seeder's own descriptor", async function () {
      this.timeout(120000);
      // D-722's own correction (2026-09-15). `liftPress` moves the pressed half
      // of a gated sentence onto the trunk and used to leave a branch carrying
      // that sentence's gate and NOTHING ELSE - no family, no reason - which
      // `signatureContext` draws as a `gatedParts` row. A Rogue then read *Only
      // for one class: Shaman* twice on one row: beside the greyed button, and
      // again as *One sentence only … That sentence does not apply to you*
      // standing over no rule at all.
      //
      // **The descriptor is SEEDED here rather than typed**, unlike the two
      // tests above it: the fault is in what `seedSignature` returns, and a
      // hand-written `signatureEffect` would test the surface against a shape
      // the reader never produces. The class roster comes off the pack, which
      // is the Forge's own path (`forge.mjs#classNames`).
      const pack = game.packs.get("azeroth-rpg.classes");
      const classes = pack ? [...(await pack.getIndex())].map(e => e.name) : [];
      assert.isAbove(classes.length, 0, "the classes pack named nothing, so no class gate can be read");
      const prose = "<p>A Shaman wielding it may spend a Half-Action to regain 4 Health. "
        + "Anyone wielding it adds 1 to its Damage Rating.</p>";
      const descriptor = seedSignature({ name: "ZZ Tidecaller's Blade", text: prose }, { classes });
      assert.equal(descriptor.kind, "use", "the seeder did not read the press");
      assert.deepEqual(descriptor.useGates, [{ kind: "class", value: "Shaman" }],
        "the press lost its own gate");
      assert.deepEqual(descriptor.gated, [],
        "the seeder left a branch carrying a gate and nothing else behind");

      const actor = await makeCharacter({ name: "ZZ Gate Once Rogue", classes: [["Rogue", 3]] });
      const [blade] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Tidecaller's Blade", type: "weapon",
        system: { rarity: "epic", equipped: true, signature: prose, signatureEffect: descriptor }
      }]);
      made.push(blade);
      // THE STORED SHAPE, through the schema and `cleanSignature`: an empty
      // branch that reached the document would draw the row all the same.
      assert.deepEqual(blade.system.signatureEffect.gated, [],
        "a branch of gate and nothing else survived into the document");

      // The ungated sentence is everybody's, so the Rogue really does get it.
      await until(() => (actor.system.signatureEffects?.damageRating ?? 0) === 1,
        "the ungated Damage Rating reaching the Rogue");

      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const panel = sheet.element.querySelector('section[data-tab="combat"] .azeroth-signatures');
        assert.ok(panel, "the Combat tab draws no Signatures panel");
        const row = [...panel.querySelectorAll("li")].find(li => li.textContent.includes("Tidecaller's Blade"));
        assert.ok(row, "the worn Signature has no row");
        const button = row.querySelector('[data-action="useSignature"]');
        assert.ok(button, "the pressed Signature has no Use button");
        assert.isTrue(button.disabled, "the button is live for a Rogue the press refuses");

        // **THE GATE LINES, AND NOTHING ELSE.** The row's collapsed detail
        // carries the item's own prose, which names the Shaman too, so the
        // count is taken over the lines the context wrote.
        const whys = [...row.querySelectorAll(".azeroth-signature-why")]
          .map(el => el.textContent.replace(/\s+/g, " ").trim());
        const named = whys.filter(w => w.includes("Shaman"));
        assert.equal(named.length, 1,
          `the Shaman clause is drawn ${named.length} times on one row: ${JSON.stringify(whys)}`);
        assert.include(named[0], game.i18n.localize("AZEROTH.Signature.PressOnly"),
          "the one clause left is not the button's");
        assert.isFalse(whys.some(w => w.includes(game.i18n.localize("AZEROTH.Signature.PartOnly"))),
          `a gated-sentence row was drawn over no rule: ${JSON.stringify(whys)}`);
        assert.isFalse(whys.some(w => w.includes(game.i18n.localize("AZEROTH.Signature.PartFails"))),
          `the sheet refuses a sentence that is not there: ${JSON.stringify(whys)}`);
        // And the refusal is still said in words beside the greyed button (D5).
        assert.isTrue(whys.some(w => w.includes(game.i18n.localize("AZEROTH.Signature.Refusal.Gate"))),
          `the greyed button says nothing: ${JSON.stringify(whys)}`);

        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached a Signature surface");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [],
          `the gated-press lines are not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    /* ---- the three surfaces (S3) ------------------------------------------- */

    it("draws the Signature on the Combat tab and the Overview column, with a button only where there is one to press", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({
        name: "ZZ Signature Surfaces", classes: [["Warrior", 3]], race: "Dwarf"
      });
      const [pressed] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Drum of the Vanguard", type: "gear",
        system: {
          equipped: true,
          signature: "<p>Once per Short Rest, as a Half-Action, you regain 4 Health.</p>",
          signatureEffect: {
            kind: "use", gates: [],
            use: { action: "half", uses: { max: 1, value: 1, per: "short" }, heal: { health: 4 } }
          }
        }
      }, {
        name: "ZZ Ring of the Unafraid", type: "gear",
        system: {
          equipped: true,
          signature: "<p>You cannot be Frightened.</p>",
          signatureEffect: { kind: "standing", gates: [], refuses: ["frightened"] }
        }
      }, {
        name: "ZZ Circlet of the Silver Hand", type: "gear",
        system: {
          equipped: true,
          signature: "<p>A Paladin wearing it inflicts a Critical Injury on a natural 19.</p>",
          signatureEffect: { kind: "standing", gates: [{ kind: "class", value: "Paladin" }], criticalOn: 19 }
        }
      }]);
      made.push(pressed);
      for (const i of actor.items.filter(x => x.name.startsWith("ZZ "))) made.push(i);

      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const panel = sheet.element.querySelector('section[data-tab="combat"] .azeroth-signatures');
        assert.ok(panel, "the Combat tab draws no Signatures panel");
        const rows = [...panel.querySelectorAll("li")];
        assert.equal(rows.length, 3, `the panel drew ${rows.length} rows for three worn Signatures`);

        const rowFor = name => rows.find(li => li.textContent.includes(name));
        // A PRESSED one has a Use button and it is live.
        const pressRow = rowFor("Drum of the Vanguard");
        const button = pressRow.querySelector('[data-action="useSignature"]');
        assert.ok(button, "the pressed Signature has no Use button");
        assert.isFalse(button.disabled, "the Use button is greyed on a Signature with a use in hand");
        // A STANDING one has none anywhere (D-681).
        assert.isNull(rowFor("Ring of the Unafraid").querySelector('[data-action="useSignature"]'),
          "a standing Signature drew a Use button, which does nothing when pressed");
        // A gate that does not hold says so IN WORDS, never by a grey alone.
        const gated = rowFor("Circlet of the Silver Hand");
        assert.include(gated.textContent, game.i18n.localize("AZEROTH.Signature.GateFails"),
          "the withheld Signature does not say why");
        assert.include(gated.textContent, game.i18n.localize("AZEROTH.Signature.Gate.Class"),
          "the withheld Signature does not name its gate");

        // The card the button posts, from the sheet's own control - the whole
        // point of the surface, and a `data-action` nothing registers is a
        // silent no-op (the audit cannot see a conditional branch).
        const since = game.messages.size;
        button.click();
        await until(() => game.messages.size > since, "the card the Combat tab's Use button posts");

        // ---- the Overview column ----
        sheet.changeTab("overview", "primary");
        await settle();
        const force = sheet.element.querySelector('section[data-tab="overview"] .azeroth-force-signatures');
        assert.ok(force, "the Overview tab draws no Signatures row");
        assert.equal(force.querySelectorAll("li").length, 3, "the In-force column drew a different set from the panel");
        assert.include(force.textContent, game.i18n.localize("AZEROTH.Signature.GateFails"),
          "the In-force column does not say the gate failed");
        // The spent use greys the column's button too, off the same judgement.
        const forceButton = [...force.querySelectorAll("li")]
          .find(li => li.textContent.includes("Drum of the Vanguard"))
          .querySelector('[data-action="useSignature"]');
        assert.ok(forceButton, "the In-force column has no Use button on a pressed Signature");
        assert.isTrue(forceButton.disabled, "the spent Signature's button is live on the Overview column");

        // ---- and both read (D-608) ----
        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached a Signature surface");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [],
          `the Signature surfaces are not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    it("draws the block on a RARE's item sheet, which the old condition excluded", async function () {
      this.timeout(90000);
      // D-686 made a named Rare carry a Signature and the Classic conversion
      // made it common; `signatureShown` asked for Epic or Legendary OR a
      // stored sentence, so a Rare with a descriptor and no prose drew nothing.
      const actor = await makeCharacter({ name: "ZZ Signature Rare", classes: [["Warrior", 3]] });
      const [ring] = await actor.createEmbeddedDocuments("Item", [{
        name: "ZZ Rare Band", type: "gear",
        system: {
          rarity: "rare",
          equipped: true,
          signature: "<p>At the start of each of your turns, regain 1 Health.</p>",
          signatureEffect: { kind: "tick", gates: [], tick: { health: 1 } }
        }
      }]);
      made.push(ring);
      const sheet = ring.sheet;
      await sheet.render({ force: true });
      await settle();
      try {
        const block = sheet.element.querySelector(".azeroth-item__signature");
        assert.ok(block, "a Rare with a Signature draws no Signature block");
        // The CHIP carries the short label; the sentence is its tooltip, since
        // *It gives back at the start of your turn* is 190px of chip in a row
        // of one-word ones (the first screenshot, D-611).
        assert.include(block.textContent, game.i18n.localize("AZEROTH.Signature.Short.Tick"),
          "the block does not say what kind of Signature it is");
        assert.equal(block.querySelector(".azeroth-feature-chip")?.dataset.tooltip,
          game.i18n.localize("AZEROTH.Signature.Kind.Tick"),
          "the chip's tooltip does not carry the sentence the short label stands for");
        // A tick is standing: no button anywhere (D-681).
        assert.isNull(block.querySelector('[data-action="useSignature"]'),
          "a tick Signature drew a Use button");
        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached the item sheet's Signature block");
      } finally {
        await sheet.close();
      }
    });

    /* ---- the career's own capability (03 §5, Phase 6) ----------------------- */

    it("counts a career Signature's uses, which nothing kept before (03 §5)", async function () {
      this.timeout(120000);
      // The Field Surgeon is the one career 03 §5 writes *Once between Short
      // Rests* on, and `CareerData` had no `signatureEffect` field to strike a
      // use against - `AzerothActor#resetUses` walks
      // `system.signatureEffect.use.uses`, which only `forged()` carried - so
      // the Combat row printed *the count is the table's; nothing here keeps
      // it*. This is the assertion that the CONSUMER moved (D-681).
      const actor = await makeCharacter({
        name: "ZZ Career Signature", classes: [["Warrior", 3]], career: "Field Surgeon"
      });
      const career = actor.careerItem;
      assert.ok(career, "the fixture embedded no career");
      assert.equal(career.system.signatureEffect?.use?.uses?.per, "short",
        "the career carries no limit at all: the parser stamped no descriptor");
      assert.equal(career.system.signatureEffect.use.uses.value, 1, "the career's use is stamped empty");

      const since = game.messages.size;
      const card = await useSignatureWithDialog(actor, career);
      assert.ok(card, "pressing a career Signature posted no card");
      assert.equal(game.messages.size - since, 1, "one press posted more than one card");
      assert.include(card.content, "Stabilizing a Dying character",
        "the card does not carry 03 §5's own sentence");
      assert.equal(career.system.signatureEffect.use.uses.value, 0, "the press did not strike the use");
      // AND THE PARTIAL UPDATE SURVIVED IT (D-671): `CareerData.migrateData`
      // cleans only the keys the dotted write names.
      assert.equal(career.system.signatureEffect.use.action, "half", "striking the use emptied the action");
      assert.equal(career.system.signatureEffect.use.uses.max, 1, "striking the use emptied the maximum");

      const names = await actor.resetUses("short");
      assert.include(names, career.name, "a Short Rest never named the career it refilled");
      assert.equal(career.system.signatureEffect.use.uses.value, 1,
        "a Short Rest did not refill the career's Signature");

      // And the Combat tab draws the counter and a live button on that row.
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const row = [...sheet.element.querySelectorAll('section[data-tab="combat"] .azeroth-signatures li')]
          .find(li => li.dataset.itemId === career.id);
        assert.ok(row, "the Combat tab draws no row for the career's Signature");
        assert.include(row.textContent, career.system.signature.name,
          "the career row does not name the capability");
        assert.ok(row.querySelector(".azeroth-feature-uses"), "the career row draws no counter");
        assert.ok(row.querySelector('[data-action="useSignature"]'), "the career row has no Use button");
        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached the career's Signature row");
      } finally {
        await sheet.close();
      }
    });

    /* ---- the two that cast (08 §20, Phase 6) -------------------------------- */

    it("casts the spell each of 08 §20's two casting Signatures names", async function () {
      this.timeout(120000);
      // `system.spells` + `castItemSpell` has been a complete, working, tested
      // feature since D-633 with ZERO CONTENT BEHIND IT, and 08 §20 prices two
      // Signature rows for exactly this. Benediction and Netherwind Regalia are
      // the two; the §20 parser fills the list off each entry's bold run.
      const pack = game.packs.get("azeroth-rpg.weapons");
      const entry = pack.index.find(e => e.name === "Benediction");
      assert.ok(entry, "Benediction is no longer in the weapons pack");
      const source = await pack.getDocument(entry._id);
      assert.equal(source.system.spells.length, 1, "Benediction names no spell");
      assert.equal(source.system.spells[0].name, "Renew");

      const actor = await makeCharacter({ name: "ZZ Casting Signature", classes: [["Priest", 3]] });
      const item = await equip(actor, source, "ZZ Benediction");
      // Nothing greys the control any more: the gate holds for a Priest and
      // the item names a spell, so `pressRefusal` has no answer.
      const since = game.messages.size;
      const card = await useSignatureWithDialog(actor, item);
      assert.ok(card, "pressing the casting Signature cast nothing");
      await until(() => game.messages.size > since, "the Casting Test's own card");
      assert.include(card.content, "Renew", "the card does not name the spell the item casts");
      // The uuid RESOLVED, which is the whole point of stamping it: a name the
      // spells pack does not hold warns and returns null, and `spellUuid` is
      // what the card carries back. The card's own kind is `spell`, since it is
      // a spell's card whoever paid for it.
      assert.equal(card.getFlag("azeroth-rpg", "kind"), "spell", "the card is not a spell's");
      assert.equal(card.getFlag("azeroth-rpg", "spellUuid"), item.system.spells[0].uuid,
        "the card cast something other than the spell stamped on the item");
      // And it says the item paid for it (08 §20: for no Mana).
      assert.equal(card.getFlag("azeroth-rpg", "viaItem")?.itemId, item.id,
        "the card does not record that the item cast it");
      // And the item's own casting is struck, on the SPELL's counter and never
      // on a second one carried by the descriptor.
      assert.equal(item.system.spells[0].uses.value, 0, "the casting did not strike the item's use");
      assert.equal(item.system.signatureEffect.use.uses.per, null,
        "the descriptor carries a second counter over one *once per Short Rest*");
    });

    /* ---- what a spell COSTS, less (the lead, 2026-09-14) -------------------- */

    /**
     * **THE MANA COMES OFF THE CAST**, off a sentence a GM typed at the bench.
     *
     * The lead, asked whether a Signature could say *if a Shaman wields this,
     * reduce Lightning Shield's mana cost by 2*: **spell and/or a school should
     * be possible.** Both halves are aggregated in `rules/signatures.mjs` and
     * read at ONE door — the Mana line of `workflows.castSpell` — and neither
     * can be proved in Node, because that module reads `foundry` at import.
     *
     * So the whole chain runs here, the way a GM drives it: the Forge reads the
     * typed sentence through `seedSignature`, stores the descriptor beside the
     * prose, `CharacterData#prepareDerivedData` aggregates what is WORN, and
     * the cast pays the difference. The named half (`empowers.cost`) existed
     * from D-698 with no reader in front of it and no live test behind it, so
     * both are asserted here.
     */
    it("TAKES THE MANA OFF A CAST, by SCHOOL and by NAME, off a sentence the Forge read", async function () {
      this.timeout(300000);
      const { AzerothForge } = await import("../applications/forge.mjs");

      const actor = await makeCharacter({
        name: "ZZ Mana Discount", classes: [["Mage", 5]], spells: ["Blizzard"], abilities: { int: 16 }
      });
      const spell = actor.items.find(i => i.name === "Blizzard");
      assert.ok(spell, "the fixture embedded no spell");
      // READ OFF THE PACK, never pinned: 07 is edited and a constant here would
      // fail on a correct change (CLAUDE.md §14).
      const school = spell.system.school;
      const cost = spell.system.mana;
      assert.include(Object.keys(CONFIG.AZEROTH.schools), school, "the spell names no school");
      assert.isAbove(cost, 1, "the fixture's spell is too cheap to show two discounts");
      const School = school[0].toUpperCase() + school.slice(1);

      /**
       * A forgeable base off the pack, chosen by PROPERTY rather than by name:
       * 08 §20 as D-686 amended it lets a named RARE carry a Signature out of
       * its own budget of 2 to 3, so a base at budget 2 leaves exactly room
       * for a gated one (cost 1).
       */
      const pack = game.packs.get("azeroth-rpg.gear");
      const index = await pack.getIndex({ fields: ["system.rarity", "system.budget", "system.signature"] });
      const bases = index.filter(e => e.system?.rarity === "rare" && e.system?.budget === 2
        && !String(e.system?.signature ?? "").trim());
      assert.isAtLeast(bases.length, 2, "the gear pack holds no two Rares at budget 2 without a Signature");

      /** One base, forged with the sentence, embedded on the Mage and worn. */
      const forgeOnto = async (entry, text, label) => {
        const source = await pack.getDocument(entry._id);
        const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source.toObject(), name: `ZZ ${label}` }]);
        assert.isTrue(AzerothForge.forgeable(item), `${label} cannot be forged`);
        const forge = new AzerothForge({ item });
        const p = await forge.apply({ signatureKind: "gated", signatureText: text });
        assert.isTrue(p.ok, `the Forge refused ${label}: ${p.reasons.join("; ")}`);
        await item.update({ "system.equipped": true });
        return item;
      };

      /** Fill the pool, cast, and hand back what the cast actually spent. */
      const manaPool = () => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
      const spendOnACast = async want => {
        const pool = manaPool();
        assert.ok(pool, "the Mage holds no Mana pool");
        assert.isAtLeast(pool.max, cost, "the Mana pool has no room for one casting");
        await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
        await until(() => manaPool()?.value === pool.max, "the Mana pool filling");
        const card = await cardOf("spell", actor, { spell, face: 20 });
        assert.ok(card, "the cast produced no card");
        // **WAIT FOR EXACTLY WHAT IS ABOUT TO BE ASSERTED** (CLAUDE.md §14):
        // the pool value, not some other field the same write moved.
        await until(() => manaPool()?.value === pool.max - want,
          `the Mana pool to read ${pool.max - want} after the cast`);
        return pool.max - manaPool().value;
      };

      // ---- nothing worn: the entry's own Mana.
      assert.equal(await spendOnACast(cost), cost, "a plain cast did not cost the spell's own Mana");

      // ---- ONE WHOLE SCHOOL. *A Mage wearing it: their Frost spells cost 1
      // less Mana.* The class gate is what makes it a `gated` Signature, and
      // the Mage is who it holds for.
      const bySchool = await forgeOnto(bases[0],
        `A Mage wearing it: their ${School} spells cost 1 less Mana.`, "School Discount");
      await until(() => actor.system.signatureEffects?.spellCost?.[school] === 1,
        "the school-wide Mana discount reaching the prepared Mage");
      assert.equal(bySchool.system.signatureEffect.spellCost.school, school,
        "the Forge stored no school on the descriptor it seeded");
      assert.equal(await spendOnACast(cost - 1), cost - 1,
        "the school-wide discount never reached the Mana line of `castSpell`");

      // ---- ONE SPELL BY NAME, on its own. The named half is `empowers.cost`,
      // which D-698 built and no seeder could reach until now.
      await bySchool.update({ "system.equipped": false });
      await until(() => !actor.system.signatureEffects?.spellCost?.[school], "the school discount coming off");
      const byName = await forgeOnto(bases[1],
        `A Mage wearing it reduces ${spell.name}'s Mana cost by ${cost - 1}.`, "Named Discount");
      await until(() => actor.system.signatureEffects?.empowers?.[spell.name]?.cost === cost - 1,
        "the named spell's Mana discount reaching the prepared Mage");
      assert.equal(byName.system.signatureEffect.empowers.name, spell.name,
        "the Forge read the sentence and named no spell");
      assert.equal(await spendOnACast(1), 1, "the named discount never reached the Mana line of `castSpell`");

      // ---- BOTH AT ONCE, and the floor. 08 charges no negative Mana.
      await bySchool.update({ "system.equipped": true });
      await until(() => actor.system.signatureEffects?.spellCost?.[school] === 1, "both discounts standing");
      assert.equal(await spendOnACast(0), 0, "the two discounts did not both come off");
      assert.equal(manaPool().value, manaPool().max, "a free cast spent something");

      // **AND THE DOTTED WRITE AT THE NEW DEPTH** (D-671, D-692). `migrateData`
      // sees `{spellCost: {amount: 9}}` and a guard that rebuilt the object
      // would write a null over the school beside it — the exact fault that
      // let a Signature refill once and never again, which every unit test
      // missed and only a live write caught.
      await byName.update({ "system.equipped": false });
      await bySchool.update({ "system.signatureEffect.spellCost.amount": cost + 5 });
      await until(() => actor.system.signatureEffects?.spellCost?.[school] === cost + 5,
        "the widened discount reaching the prepared Mage");
      assert.equal(bySchool.system.signatureEffect.spellCost.school, school,
        "the partial update emptied the school beside the amount it named");
      assert.equal(await spendOnACast(0), 0, "a discount larger than the Mana refunded the caster");

      // ---- and off again: what is in the pack discounts nothing.
      await bySchool.update({ "system.equipped": false });
      await until(() => !actor.system.signatureEffects?.spellCost?.[school], "the discount coming off");
      assert.equal(await spendOnACast(cost), cost, "the Mana never went back up with the items off");
    });

    /* ---- the world migration (CLAUDE.md §10) -------------------------------- */

    it("stamps a world's Signatures once, and a second run touches nothing (0.12.0)", async function () {
      this.timeout(600000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.0-signature-effects.mjs");
      const { emptySignature } = await import("/systems/azeroth-rpg/module/rules/signatures.mjs");

      // A world made before the descriptor existed: the item and the career
      // both carry the schema's initial, and both say something on their sheets
      // that no roll in the game has heard of.
      const source = await widensCritical();
      const actor = await makeCharacter({
        name: "ZZ Migration 0.12.0", classes: [["Warrior", 3]], career: "Field Surgeon"
      });
      const item = await equip(actor, source, `ZZ Stale ${source.name}`);
      const career = actor.careerItem;
      await item.update({ "system.signatureEffect": emptySignature() });
      await career.update({ "system.signatureEffect": emptySignature() });
      await until(() => item.system.signatureEffect.criticalOn === null, "the item's descriptor emptied");
      await until(() => career.system.signatureEffect.use.uses.per === null, "the career's descriptor emptied");

      // **THE NAME IS NOT THE PACK'S**, so this also says the pack copy is
      // found by IDENTIFIER rather than by name alone.
      assert.notEqual(item.name, source.name);

      const touched = await migrate(() => {});
      assert.isAbove(touched, 0, "the migration touched nothing at all");
      await until(() => item.system.signatureEffect.criticalOn === 19,
        "the pack's descriptor reaching the stale item");
      await until(() => career.system.signatureEffect.use.uses.per === "short",
        "03 §5's limit reaching the stale career");
      assert.equal(career.system.signatureEffect.use.uses.max, 1, "the career's limit came through half-formed");

      // AND A SECOND RUN MOVES NOTHING (CLAUDE.md §10). The builder compares
      // against the pack copy rather than against `undefined`, so a field with
      // an initial is judged by its SHAPE and a re-run finds every stamp in
      // place.
      assert.equal(await migrate(() => {}), 0, "a second run of the migration touched a document");
    });

    /* ---- the last six of 08 §20 (D-696) ------------------------------------ */

    it("adds Stormrage Raiment's Armor Points to a shapeshifted Druid and takes them back out of the form", async function () {
      this.timeout(90000);
      // The gate is a class AND a form, and both are the bearer's own state, so
      // this is a document method over a prepared actor and nothing in Node can
      // reach it. `signature-doors.test.mjs` holds the rate; this holds the
      // ARMOR POINTS moving.
      const source = await fromPack("azeroth-rpg.armor", "Stormrage Raiment");
      const actor = await makeCharacter({ name: "ZZ Stormrage", classes: [["Druid", 9]] });
      const tier = actor.system.tier;
      assert.isAbove(tier, 1, "the fixture is tier 1, so the tier and the rate are indistinguishable");
      await equip(actor, source, "ZZ Stormrage Raiment");
      await until(() => actor.system.ap?.body !== undefined, "the suit reaching the prepared actor");
      const outOfForm = actor.system.ap.body;

      // A real shape through its one writer (D-769). The suit MELDS (the lead:
      // *"Melds; Signatures count"*), so the Body AP in a form is the block's
      // own, and Stormrage's Signature still adds its tier on top of it.
      const shapes = game.system.azeroth.shapes;
      const bear = await fromPack("azeroth-rpg.bestiary", "Black Bear");
      await shapes.takeShape(actor, { kind: "shapeshift", entries: [bear] });
      await until(() => actor.system.ap.body === bear.system.ap.body + tier,
        `the bear's Armor Points rising by the tier (${bear.system.ap.body} + ${tier})`);
      // *In any form they take* names no form, so a second one answers as well.
      const wolf = await fromPack("azeroth-rpg.bestiary", "Wolf");
      await shapes.takeShape(actor, { kind: "shapeshift", entries: [wolf] });
      await until(() => actor.system.ap.body === wolf.system.ap.body + tier, "the second form answering the same gate");
      // And out of a form they go again, to the suit's own.
      await shapes.leaveShape(actor);
      await until(() => actor.system.ap.body === outOfForm, "the Armor Points coming back off out of a form");
    });

    it("gives Dal'Rend's Sacred Charge its Momentum off the hand, once a round, and never on a plain blow", async function () {
      this.timeout(180000);
      // The gate reads what is true of THE BLOW, which only `attackWithDialog`
      // knows, so a unit test can compose it and only this can say the door
      // passes it. **06 §2 builds NO Momentum off the hand**, which is what
      // makes an off-hand blow the clean measurement: everything the pool gains
      // there is the Signature's.
      const source = await fromPack("azeroth-rpg.weapons", "Dal'Rend's Sacred Charge");
      const actor = await makeCharacter({ name: "ZZ Dal'Rend", classes: [["Warrior", 3]] });
      const blade = await equip(actor, source, "ZZ Dal'Rend's Sacred Charge");
      const npc = await makeNpc("Grunt");
      const pools = () => actor.poolSnapshot().filter(p => p.kind === "momentum");
      const rageOf = () => pools().find(p => p.name === "rage")?.value ?? 0;
      const empty = async () => {
        await actor.updatePool(pools().map(p => ({ itemId: p.itemId, kind: "momentum", value: 0 })));
        await until(() => rageOf() === 0, "the pool emptied");
      };

      const fight = await Combat.create({});
      await fight.activate();
      await fight.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }, { actorId: npc.id }]);
      await fight.startCombat();
      await until(() => fight.started, "the fight to start");
      // *In a turn in which you Attack* (06 SS1, D-720): the off-hand blows
      // below are this character's own turn's, and two tokenless combatants
      // are ordered by whichever Initiative came out higher.
      await giveTurn(fight, actor);
      const combatant = fight.getCombatantsByActor(actor)[0];
      // A NEW ROUND, without waiting for one: the budget carries 06 §6's one
      // Attack a round and the round flag carries Fast's mark and the
      // Signature's. Both have to go, or the second blow is simply refused and
      // the pool never moves - which is what the first live run reported.
      const nextRound = async () => {
        await combatant.resetBudget();
        await combatant.unsetFlag("azeroth-rpg", "round");
      };

      const unpin = pinDie(15);
      try {
        // OFF THE HAND: 1, and it is entirely the Signature's.
        await empty();
        await nextRound();
        const off = await attackWithDialog(actor, blade, null, { dc: 1, offHand: true });
        assert.ok(off, "the off-hand attack produced no card");
        await until(() => rageOf() === 1,
          "the Signature's Momentum on an off-hand blow: `gainOnHit` refuses one every other point", 15000);

        // AND ONCE A ROUND. A second off-hand blow in the SAME round adds
        // nothing, which is `onHit.per` reaching `spendLimitedRows`. The budget
        // is refreshed and the round flag is NOT - the round is what the limit
        // is measured in.
        await combatant.resetBudget();
        await attackWithDialog(actor, blade, null, { dc: 1, offHand: true });
        await settle();
        assert.equal(rageOf(), 1, "the Signature fired twice in one round");

        // IN THE MAIN HAND the two clauses are measured against each other,
        // not against a number: 05 §11's own gain and **08 §5's Fast, which
        // Dal'Rend carries**, are both in the total, and pinning that total
        // would be this test doing the roll's arithmetic a second time.
        // The DIFFERENCE is the Signature and nothing else.
        await empty();
        await nextRound();
        await combatant.unsetFlag("azeroth-rpg", "moveHalves");
        await attackWithDialog(actor, blade, null, { dc: 1 });
        await until(() => rageOf() > 0, "the hit's own Momentum", 15000);
        const still = rageOf();

        // The same blow on a turn the character HAS moved: the other half of
        // the OR, and exactly one point more.
        await empty();
        await nextRound();
        await combatant.setFlag("azeroth-rpg", "moveHalves", 1);
        await attackWithDialog(actor, blade, null, { dc: 1 });
        await until(() => rageOf() > 0, "the hit's Momentum after moving", 15000);
        assert.equal(rageOf(), still + 1,
          "the Signature paid nothing on a blow struck after moving, or paid on the one before it");
      } finally {
        unpin();
        await fight.delete().catch(() => {});
      }
    });

    it("lays the Bulwark's aura on a party member in reach and takes 5 off the blow", async function () {
      this.timeout(180000);
      // **THE ONE SIGNATURE THAT LANDS ON SOMEBODY ELSE** (D-696). Every half of
      // it needs a live world: the effect is written by `effects/auras.mjs` on
      // the active GM's client, the distance is measured through core's grid,
      // and the number is spent in `AzerothActor#applyDamage`.
      const scene = await Scene.create({
        name: "ZZ Bulwark", width: 2000, height: 2000, grid: { size: 100, distance: 5, units: "ft" }
      });
      made.push(scene);
      const source = await fromPack("azeroth-rpg.armor", "The Bulwark of Tyr's Hand");
      const bearer = await makeCharacter({ name: "ZZ Bulwark Bearer", classes: [["Paladin", 5]] });
      const ally = await makeCharacter({ name: "ZZ Bulwark Ally", classes: [["Rogue", 5]] });
      await bearer.setParty(true);
      await ally.setParty(true);
      await equip(bearer, source, "ZZ The Bulwark of Tyr's Hand");
      await bearer.update({ "prototypeToken.actorLink": true });
      await ally.update({ "prototypeToken.actorLink": true });

      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed", 20000);
      const tokens = await scene.createEmbeddedDocuments("Token", [
        { ...bearer.prototypeToken.toObject(), actorId: bearer.id, actorLink: true, x: 500, y: 500 },
        { ...ally.prototypeToken.toObject(), actorId: ally.id, actorLink: true, x: 600, y: 500 }
      ]);
      try {
        // At full Health the gate does not hold and nobody carries anything.
        await settle();
        assert.equal(ally.system.damageReduction ?? 0, 0, "the aura stood at full Health");

        // Below half, five feet away: the ally takes 5 less from every source.
        await bearer.update({ "system.health.value": 1 });
        await until(() => (ally.system.damageReduction ?? 0) === 5,
          "the aura reaching the ally standing beside the bearer", 20000);
        // **The bearer is not in their own aura**: *every OTHER member*.
        assert.equal(bearer.system.damageReduction ?? 0, 0, "the bearer shielded themselves");

        // And `applyDamage` is what spends it.
        const before = ally.system.health.value;
        await ally.applyDamage(9, { struck: true });
        await until(() => ally.system.health.value === before - 4,
          `9 damage arriving as 4 (from ${before})`, 20000);

        // Walk out of the fifteen feet and it lifts. **`moveToken` fires as the
        // move STARTS and the document position is interpolated while the token
        // travels** (v14, D-669), so the sync has to run again off
        // `movement.finished` - without that second pass the aura stayed on an
        // ally forty-five feet away, which is what this caught.
        await tokens[1].update({ x: 1400 });
        await until(() => (ally.system.damageReduction ?? 0) === 0,
          "the aura lifting when the ally walks out of it", 20000);
        assert.isFalse(ally.effects.some(e => e.getFlag("azeroth-rpg", "aura")),
          "the effect was left standing on an ally out of reach");

        // And the gate going false lifts it as readily as the distance does.
        await tokens[1].update({ x: 600 });
        await until(() => (ally.system.damageReduction ?? 0) === 5, "the aura coming back", 20000);
        await bearer.update({ "system.health.value": bearer.system.health.max });
        await until(() => (ally.system.damageReduction ?? 0) === 0,
          "the aura lifting when the bearer stands up", 20000);
      } finally {
        await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id).filter(Boolean)).catch(() => {});
      }
    });

    it("stamps the rewritten §20 sentences onto a stale world, once (0.12.1)", async function () {
      this.timeout(600000);
      const { migrate, OLD_SIGNATURES } = await import("/systems/azeroth-rpg/module/migrations/0.12.1-signature-rewrites.mjs");
      const { emptySignature } = await import("/systems/azeroth-rpg/module/rules/signatures.mjs");

      // A copy of Perdition's Blade as a world held it before the rewrite: the
      // old sentence on the sheet and a descriptor that fires nothing.
      const source = await fromPack("azeroth-rpg.weapons", "Perdition's Blade");
      const actor = await makeCharacter({ name: "ZZ Migration 0.12.1", classes: [["Warrior", 3]] });
      const item = await equip(actor, source, "ZZ Stale Perdition's Blade");
      await item.update({
        "system.signature": `<p>${OLD_SIGNATURES["perditions-blade"]}</p>`,
        "system.signatureEffect": { ...emptySignature(), reason: "tableCall" }
      });
      await until(() => item.system.signatureEffect.kind === "none", "the stale descriptor");

      const touched = await migrate(() => {});
      assert.isAbove(touched, 0, "the migration touched nothing at all");
      await until(() => item.system.signatureEffect.onHit?.damageFromCondition?.id === "scorched",
        "the rewritten descriptor reaching the stale item");
      assert.include(item.system.signature, "Scorched",
        "the descriptor moved and the sentence on the sheet did not");

      // AND A SECOND RUN MOVES NOTHING: after the first the sentence no longer
      // matches the old one, so the guard closes behind it.
      assert.equal(await migrate(() => {}), 0, "a second run of the migration touched a document");
    });

    /**
     * **A CLASSIC FIND'S RATING, OFF THE PACK AND ON A PREPARED ACTOR**
     * (D-697). The tests above prove each scalar reaches its number from a
     * fixture this file wrote; this is the one that says `packs-src/` really
     * carries them, which is the layer between the law and the table and the
     * one D-681 keeps finding empty. The item is dragged out of the compendium
     * exactly as a GM would drag it.
     */
    it("MOVES THE ATTACK TEST OFF A REAL FIND OUT OF THE PACK, and repairs a stale one (0.12.2)", async function () {
      this.timeout(600000);
      const { migrate } = await import("/systems/azeroth-rpg/module/migrations/0.12.2-classic-ratings.mjs");
      const { emptySignature } = await import("/systems/azeroth-rpg/module/rules/signatures.mjs");

      // *Equip: Increases your hit rating by 10* out of Ahn'Qiraj, which the
      // lead's rule makes `+1 Attack`.
      const source = await fromPack("azeroth-rpg.gear", "Boots of the Fallen Hero");
      assert.equal(source.system.signatureEffect.kind, "standing",
        "the pack copy of the find fires nothing at all");
      assert.deepEqual(source.system.signatureEffect.grants, ["+1 Attack"],
        "the pack copy does not carry the lead's own sentence");

      const actor = await makeCharacter({ name: "ZZ Classic Rating", classes: [["Warrior", 3]] });
      const before = actor.system.attackBonus ?? 0;
      const boots = await equip(actor, source, "ZZ Boots of the Fallen Hero");
      await until(() => actor.system.attackBonus === before + 1,
        "the find's +1 Attack reaching the prepared actor");

      // Now stale it, exactly as a world that took its copy before D-697 holds
      // it: A9's placeholder on the sheet and a descriptor firing nothing.
      await boots.update({
        "system.signature": "<p>Signature to be written. What it did has no equivalent in these rules.</p>",
        "system.signatureEffect": { ...emptySignature(), reason: "noEquivalent" }
      });
      await until(() => (actor.system.attackBonus ?? 0) === before, "the stale copy granting nothing");

      const touched = await migrate(() => {});
      assert.isAbove(touched, 0, "the migration touched nothing at all");
      await until(() => actor.system.attackBonus === before + 1,
        "the repaired descriptor moving the number again");
      assert.include(boots.system.signature, "Attack",
        "the descriptor moved and the sentence on the sheet did not");

      // AND A SECOND RUN MOVES NOTHING: the descriptor fires now, so the guard
      // closes behind it.
      assert.equal(await migrate(() => {}), 0, "a second run of the migration touched a document");
    });

    /* ---- the bearer is a CREATURE (Phase 4) -------------------------------- */

    /**
     * **A CREATURE IS A BEARER AND FOUR DOORS WERE THE CHARACTER'S SHAPE.**
     * `NpcData#prepareDerivedData` has composed `signatureEffects` off
     * `AzerothActor#signatureState` since D-692, so every one of these is live
     * today; what none of them had was a way for a GM to put something in a
     * creature's hands, which is what the Gear tab adds. The laws are asserted
     * in `module/rules/signature-doors.test.mjs`; these are the four doors,
     * which are document methods over a prepared actor and which no Vitest can
     * reach (D-681).
     */

    it("does not write a career or delete a race when one is dropped on a CREATURE", async function () {
      this.timeout(90000);
      const npc = await plainCreature();

      // `_onCreateDescendantDocuments` wrote `system.career.itemId` against a
      // model with no career field. The write is pruned by
      // `ClientDatabaseBackend##preUpdateDocumentArray` before it is
      // dispatched - but `preUpdateActor` has already fired by then, which is
      // the only thing there is to see, and it is what the guard removes.
      const careers = game.packs.get("azeroth-rpg.careers");
      const career = await careers.getDocument(careers.index.contents[0]._id);
      const raised = [];
      const hook = Hooks.on("preUpdateActor", doc => { if (doc.id === npc.id) raised.push(doc.id); });
      try {
        await npc.createEmbeddedDocuments("Item", [career.toObject()]);
        await settle();
        await new Promise(r => setTimeout(r, 250));
        assert.deepEqual(raised, [], "dropping a career on a creature still updates it");
      } finally {
        Hooks.off("preUpdateActor", hook);
      }
      assert.isUndefined(npc.system.career, "a creature grew a career field");

      // And *one race at a time* is 02 §5's rule about a character. A creature
      // states its people on the block, so a race item on it is a GM's note
      // and nothing here may delete it.
      const races = game.packs.get("azeroth-rpg.races");
      const two = races.index.contents.slice(0, 2);
      assert.equal(two.length, 2, "the races pack holds fewer than two peoples");
      for (const entry of two) {
        const doc = await races.getDocument(entry._id);
        await npc.createEmbeddedDocuments("Item", [doc.toObject()]);
        await settle();
      }
      await new Promise(r => setTimeout(r, 250));
      assert.equal(npc.items.filter(i => i.type === "race").length, 2,
        "the second race dropped on a creature deleted the first");
    });

    it("HOLDS A RACE-GATED SIGNATURE ON A CREATURE, off the people its block names", async function () {
      this.timeout(90000);
      // 14 §1's `**Race** Orc` run is a STRING on the model; a character wears
      // a race ITEM. `signatureState` asked `raceItem?.name` and nothing else,
      // so an orc could never satisfy *an Orc wielding it*.
      const npc = await plainCreature();
      await npc.update({ "system.race": "Orc" });
      await until(() => npc.signatureState.race === "Orc",
        "the creature's own people reaching `signatureState`");

      // `refuses` is the grant a creature's model already consumes, into the
      // list `toggleStatusEffect` refuses at - so this is the whole seam:
      // gate, state, aggregate, enforcement.
      const [banner] = await npc.createEmbeddedDocuments("Item", [{
        name: "ZZ Banner of the Warsong", type: "gear",
        system: {
          equipped: true,
          signature: "<p>An Orc carrying it cannot be Frightened.</p>",
          signatureEffect: {
            kind: "standing", gates: [{ kind: "race", value: "Orc" }], refuses: ["frightened"]
          }
        }
      }]);
      made.push(banner);
      await until(() => (npc.system.conditionImmunities ?? []).includes("frightened"),
        "the race-gated refusal reaching the creature");

      // And the gate still bites: a tauren carrying the orcs' banner gets
      // nothing, which is what says the clause is read rather than dropped.
      await npc.update({ "system.race": "Tauren" });
      await until(() => !(npc.system.conditionImmunities ?? []).includes("frightened"),
        "the gate withholding it from another people");
    });

    it("NEVER READS A CREATURE'S CORRUPTION KEYWORD AS A SCORE", async function () {
      this.timeout(90000);
      // 14 §1: the Corruption entry *names the track the creature exposes*,
      // which is not a score it holds - `NpcData` stores a string where
      // `CharacterData` stores three numbers. Handed to the map reader,
      // `held["fel"]` was undefined on every track, came back 0, and a floor
      // of 0 held on a creature carrying an entirely different keyword.
      const npc = await plainCreature();
      await npc.update({ "system.corruption": "undeath" });
      await until(() => npc.system.corruption === "undeath", "the keyword on the creature");
      assert.isNull(npc.signatureState.corruption,
        "a track NAME reached the gate as a map of scores");

      const [idol] = await npc.createEmbeddedDocuments("Item", [{
        name: "ZZ Idol of the Fel-Touched", type: "gear",
        system: {
          equipped: true,
          signature: "<p>A bearer with Fel Corruption cannot be Frightened.</p>",
          signatureEffect: {
            kind: "standing", gates: [{ kind: "corruption", value: "fel 0" }], refuses: ["frightened"]
          }
        }
      }]);
      made.push(idol);
      await settle();
      await new Promise(r => setTimeout(r, 250));
      assert.notInclude(npc.system.conditionImmunities ?? [], "frightened",
        "an Undeath keyword satisfied a Fel gate: the string read as a map of zeroes");
    });

    it("PAYS A SIGNATURE'S COST OUT OF A CREATURE'S POOL, WHICH NAMES NOTHING", async function () {
      this.timeout(90000);
      // D-637's own scar one line from the `manaPool` call written to cure it:
      // `poolFor` matched `p.name === poolName`, and all 164 pack creatures
      // snapshot `name: null`, so every creature refused with *no pool*.
      const source = await creatureWithPower();
      const npc = await Actor.create({ ...source.toObject(), name: `ZZ Pool ${source.name}` });
      made.push(npc);
      await npc.update({ "system.power.value": npc.system.power.max });
      const pool = await until(() => {
        const p = manaPool(npc.poolSnapshot());
        return p && p.value > 0 ? p : null;
      }, "the creature's Power pool filled");
      assert.isNotOk(pool.name, "the fixture creature NAMES its pool, so this proves nothing");
      const before = pool.value;

      const [rod] = await npc.createEmbeddedDocuments("Item", [{
        name: "ZZ Rod of the Kirin Tor", type: "gear",
        system: {
          equipped: true,
          signature: "<p>As a Half-Action, spend 1 Mana to regain 3 Health.</p>",
          signatureEffect: {
            kind: "use", gates: [],
            use: { action: "half", cost: { pool: "mana", amount: 1 }, heal: { health: 3 } }
          }
        }
      }]);
      made.push(rod);
      await npc.update({ "system.health.value": 1 });

      const warned = await noticesFrom("warn", async () => {
        const card = await useSignatureWithDialog(npc, rod);
        assert.ok(card, "the press posted no card at all");
      });
      assert.deepEqual(warned, [], "the press refused, and the refusal is for want of a pool");
      await until(() => manaPool(npc.poolSnapshot()).value === before - 1,
        "the cost coming out of the creature's Power pool");
      assert.isAbove(npc.system.health.value, 1, "the press healed nothing");
    });

    it("puts the CREATURE'S OWN Spell DC on a Signature's Resist button", async function () {
      this.timeout(90000);
      // 14 §1's `**Spells** (DC n)` run is `system.spells.dc`; `system.spellDC`
      // is the character's derived one and no creature has it, so the button
      // came out with an em-dash where its number should be.
      const pack = game.packs.get("azeroth-rpg.bestiary");
      let source = null;
      for (const entry of pack.index) {
        const doc = await pack.getDocument(entry._id);
        if ((doc.system?.spells?.dc ?? null) !== null) { source = doc; break; }
      }
      assert.ok(source, "no creature in the bestiary carries a Spell DC");
      const npc = await Actor.create({ ...source.toObject(), name: `ZZ DC ${source.name}` });
      made.push(npc);
      assert.isUndefined(npc.system.spellDC, "a creature carries a character's derived Spell DC");

      const [censer] = await npc.createEmbeddedDocuments("Item", [{
        name: "ZZ Censer of the Deathspeaker", type: "gear",
        system: {
          equipped: true,
          signature: "<p>As a Half-Action, each creature nearby makes a Spirit Resilience Test.</p>",
          signatureEffect: {
            kind: "use", gates: [],
            use: { action: "half", resist: { resilience: "spirit", dc: null } }
          }
        }
      }]);
      made.push(censer);

      const card = await useSignatureWithDialog(npc, censer);
      assert.ok(card, "the press posted no card");
      const el = document.createElement("div");
      el.innerHTML = card.content;
      const resist = el.querySelector('[data-action="resistTest"]');
      assert.ok(resist, "no Resist button on the creature's Signature card");
      assert.equal(Number(resist.dataset.dc), npc.system.spells.dc,
        "the button carries no DC: the door reads `system.spellDC` alone");
      assert.include(resist.textContent, String(npc.system.spells.dc));
    });

    it("SAYS A CREATURE HAS NO FATIGUE TRACK rather than claiming a recovery", async function () {
      this.timeout(90000);
      // 14 gives a creature no Fatigue track and `NpcData` carries no field, so
      // `update({"system.fatigue": n})` was pruned by the schema while the card
      // still printed *1 Fatigue removed*.
      const npc = await plainCreature();
      const [draught] = await npc.createEmbeddedDocuments("Item", [{
        name: "ZZ Draught of Wakefulness", type: "gear",
        system: {
          quantity: 1,
          description: "<p><strong>Effect.</strong> The drinker removes 1 Fatigue.</p>",
          use: { kind: "draught", action: "half", target: "self", heal: { fatigue: 1 } }
        }
      }]);
      made.push(draught);

      const card = await game.system.azeroth.workflows.useGear({ actor: npc, item: draught, targets: [] });
      assert.ok(card, "using the draught posted no card");
      assert.include(card.content, game.i18n.localize("AZEROTH.Use.NoFatigue"),
        "the card does not say the creature has no Fatigue track");
      assert.notInclude(card.content, game.i18n.format("AZEROTH.Use.Fatigue", { n: 1 }),
        "the card claimed a Fatigue recovery on a creature with no track");
      assert.isUndefined(npc.system.fatigue, "a creature grew a Fatigue field");
    });
  });
}
