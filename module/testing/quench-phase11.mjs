/**
 * Ammunition (08 §7, D-641): a launcher fires the bundle nocked on it, the
 * Combat tab offers what fits and counts the shot beneath the weapons, one
 * is marked off before the die, an empty bundle refuses, and a shot or a
 * throw adds Dexterity where a swing adds Strength.
 */

import { cleanup, give, made, makeCharacter, makeNpc, openSheet, pinDie, settle, useAction } from "./fixtures.mjs";
import { npcAttackWithDialog } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { totemBlock } from "../rules/bound.mjs";
import { checkText } from "./geometry.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { attackWithDialog } from "../applications/actions.mjs";

const until = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
};

/** Collect the warnings a call raises, and restore the notifier. */
async function warningsDuring(fn) {
  const warned = [];
  const original = ui.notifications.warn;
  ui.notifications.warn = function (message, ...rest) { warned.push(String(message)); return original.call(this, message, ...rest); };
  try { return { result: await fn(), warned }; }
  finally { ui.notifications.warn = original; }
}

export function ammunitionBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Ammunition (08 §7, D-641)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      await cleanup();
    });

    it("offers the bundles that fit on the launcher's row, and counts the shot beneath the weapons", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Ammo Ranger", classes: [["Ranger", 1]], weapons: ["Shortbow", "Hunting arrows", "Crossbow bolts"] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const rows = [...sheet.element.querySelectorAll(".azeroth-weapons:not(.azeroth-ammunition) .azeroth-weapon[data-item-id]")];
        assert.lengthOf(rows, 1, "a bundle of shot drew as a weapon to swing");
        const select = rows[0].querySelector("select.azeroth-ammo-select");
        assert.ok(select, "no ammunition select on the bow's row");
        assert.deepEqual([...select.options].map(o => o.textContent.trim()), ["Hunting arrows (5)"], "the bolts fit a bow, or the arrows do not");
        assert.equal(rows[0].querySelector(".azeroth-weapon-rating").textContent.trim(), "3", "the bow's row does not carry the shot's Rating");
        const bundles = [...sheet.element.querySelectorAll(".azeroth-ammunition .azeroth-weapon[data-item-id]")];
        assert.lengthOf(bundles, 2, "the two bundles are not listed beneath");
        assert.include(bundles.map(b => b.querySelector(".azeroth-ammo-quantity").textContent.trim()), "×5");
        assert.isNull(bundles[0].querySelector('[data-action="rollAttack"]'), "a bundle offers Attack");
        const findings = checkText(sheet.element.querySelector("section[data-tab='combat']"));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
        // The select writes the launcher's own field.
        const bow = actor.items.find(i => i.name === "Shortbow");
        const arrows = actor.items.find(i => i.name === "Hunting arrows");
        select.value = arrows.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => bow.system.ammunition === arrows.id, "the nocked bundle");
        // A bundle sold or spent leaves nothing nocked.
        await arrows.delete();
        await until(() => bow.system.ammunition === null, "the launcher to let go of a deleted bundle");
      } finally {
        await sheet.close();
      }
    });

    it("fires the shot: Dexterity on the roll, the shot's Rating on the card, one marked off, and an empty bundle refused", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Ammo Shot", classes: [["Ranger", 1]], abilities: { dex: 14, str: 10 }, weapons: ["Shortbow", "Hunting arrows"] });
      const bow = actor.items.find(i => i.name === "Shortbow");
      const arrows = actor.items.find(i => i.name === "Hunting arrows");
      const unpin = pinDie(15);
      try {
        const message = await attackWithDialog(actor, bow);
        assert.ok(message, "the attack posted no card");
        const flags = message.flags["azeroth-rpg"];
        assert.deepEqual({ name: flags.ammunition.name, remaining: flags.ammunition.remaining }, { name: "Hunting arrows", remaining: 4 });
        assert.equal(arrows.system.quantity, 4, "one was not marked off the bundle");
        assert.include(message.content, "Hunting arrows", "the card does not name the shot");
        assert.include(message.content, game.i18n.format("AZEROTH.Card.ShotsLeft", { n: 4 }));
        const explanation = new DOMParser().parseFromString(message.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";
        assert.match(explanation, /^3 \+ /, `the damage is not the shot's 3 plus the SL: ${explanation}`);
        assert.include(message.content, game.i18n.localize("AZEROTH.Ability.Dex.Label"), "a shot does not roll Dexterity");
        assert.notInclude(message.content, game.i18n.localize("AZEROTH.Ability.Str.Label"), "a shot rolls Strength");
        // Down to nothing: the refusal names the bundle and spends nothing.
        await arrows.update({ "system.quantity": 0 });
        const { result, warned } = await warningsDuring(() => attackWithDialog(actor, bow));
        assert.isNull(result, "an empty bundle still fired");
        assert.isTrue(warned.some(w => w.includes(game.i18n.format("AZEROTH.Attack.EmptyBundle", { weapon: "Shortbow", launcher: "" }).trim())), `no warning for the empty bundle: ${warned.join(" | ")}`);
        // Nothing that fits at all.
        await arrows.delete();
        const none = await warningsDuring(() => attackWithDialog(actor, bow));
        assert.isNull(none.result);
        assert.isTrue(none.warned.some(w => w.includes("Bow")), `the warning does not name the launcher's kind: ${none.warned.join(" | ")}`);
      } finally {
        unpin();
      }
    });

    it("names every column on the same grid, and defines the traits on the card: a Hand axe's Thrown, a Boar's Impale and its own Gore (D-649)", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Grid Ranger", classes: [["Ranger", 1]], weapons: ["Hand axe", "Shortbow", "Hunting arrows"] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const heads = [...sheet.element.querySelectorAll(".azeroth-weapons .azeroth-weapon-head")];
        assert.lengthOf(heads, 2, "a header row on each list");
        const text = el => el.textContent.replace(/\s+/g, " ").trim();
        assert.include(text(heads[0]), game.i18n.localize("AZEROTH.Sheet.DMG"));
        assert.include(text(heads[0]), game.i18n.localize("AZEROTH.Item.Range"));
        assert.include(text(heads[1]), game.i18n.localize("AZEROTH.Item.Fits"));
        assert.include(text(heads[1]), game.i18n.localize("AZEROTH.Sheet.Qty"));
        // The numbers sit under their names: the same left edge as the header's cell.
        const row = sheet.element.querySelector(".azeroth-weapons:not(.azeroth-ammunition) .azeroth-weapon[data-item-id]");
        const left = sel => Math.round(row.querySelector(sel).getBoundingClientRect().left);
        const headLeft = sel => Math.round(heads[0].querySelector(sel).getBoundingClientRect().left);
        assert.equal(left(".azeroth-weapon-rating"), headLeft(".azeroth-weapon-rating"), "DMG is not under its name");
        assert.equal(left(".azeroth-weapon-range"), headLeft(".azeroth-weapon-range"), "Range is not under its name");
        const findings = checkText(sheet.element.querySelector("section[data-tab='combat']"));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
      const axe = actor.items.find(i => i.name === "Hand axe");
      const thrown = (await game.packs.get("azeroth-rpg.traits").getDocuments()).find(d => d.name.startsWith("Thrown"));
      assert.ok(thrown, "the traits pack holds no Thrown");
      const plain = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(actor, axe);
        assert.ok(card, "the axe posted no card");
        const dl = new DOMParser().parseFromString(card.content, "text/html").querySelector(".azeroth-card-traits");
        assert.ok(dl, "no traits on the card");
        const names = [...dl.querySelectorAll("dt")].map(d => d.textContent.trim());
        assert.include(names.join(" "), "Thrown", "Thrown is not defined on the card");
        assert.include(plain(dl.innerHTML), plain(thrown.system.description).slice(0, 30), "the definition is not 08's");
        // A creature's attack: 08's trait and the block's own ability.
        const boar = await makeNpc("Boar");
        const tusks = boar.system.attacks.findIndex(a => a.name === "Tusks");
        assert.isAtLeast(tusks, 0, "the Boar has no Tusks");
        const gore = boar.system.creatureAbilities.find(a => a.name === "Gore");
        assert.ok(gore, "the Boar has no Gore ability");
        const sheet2 = await openSheet(boar);
        try {
          const head = sheet2.element.querySelector(".azeroth-attack-head");
          assert.ok(head, "no header row over the attacks");
          assert.include(head.textContent, game.i18n.localize("AZEROTH.Sheet.Bonus"));
          assert.include(head.textContent, game.i18n.localize("AZEROTH.Sheet.DMG"));
        } finally {
          await sheet2.close();
        }
        const card2 = await npcAttackWithDialog(boar, tusks);
        assert.ok(card2, "the Tusks posted no card");
        const dl2 = new DOMParser().parseFromString(card2.content, "text/html").querySelector(".azeroth-card-traits");
        assert.ok(dl2, "no traits on the Boar's card");
        const names2 = [...dl2.querySelectorAll("dt")].map(d => d.textContent.trim());
        assert.include(names2, "Impale");
        assert.include(names2, "Gore");
        assert.include(plain(dl2.innerHTML), plain(gore.description).slice(0, 30), "Gore's definition is not the block's");
      } finally {
        unpin();
      }
    });

    it("adds the launcher's own Rating and Pierce to the bolt's, and rolls Strength for a swing and Dexterity for a throw", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Ammo Crossbow", classes: [["Ranger", 1]], abilities: { dex: 12, str: 16 }, weapons: ["Light crossbow", "Crossbow bolts", "Greataxe", "Dart"] });
      const crossbow = actor.items.find(i => i.name === "Light crossbow");
      const unpin = pinDie(15);
      try {
        const shot = await attackWithDialog(actor, crossbow);
        const explanation = new DOMParser().parseFromString(shot.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";
        assert.match(explanation, /^4 \+ /, `the bolt's 2 and the crossbow's 2 do not make 4: ${explanation}`);
        assert.equal(actor.items.find(i => i.name === "Crossbow bolts").system.quantity, 4);
        const swing = await attackWithDialog(actor, actor.items.find(i => i.name === "Greataxe"));
        assert.include(swing.content, game.i18n.localize("AZEROTH.Ability.Str.Label"), "a swing does not roll Strength");
        assert.isNull(swing.flags["azeroth-rpg"].ammunition, "a swing fired a shot");
        const throwCard = await attackWithDialog(actor, actor.items.find(i => i.name === "Dart"));
        assert.include(throwCard.content, game.i18n.localize("AZEROTH.Ability.Dex.Label"), "a throw does not roll Dexterity");
      } finally {
        unpin();
      }
    });
  });
}

/* -------------------------------------------- */
/*  Talents on the sheet (04, D-642)             */
/* -------------------------------------------- */

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
/** Every Power pool to its cap: a fixture's pools are not always full, and a use or a cast pays first. */
async function fillPools(actor) {
  for (const pool of (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "power" && p.max > 0 && p.value < p.max)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
}

export function talentGrantBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Talents on the sheet (04, D-642)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    it("Sic 'Em taken grants a Reaction for 2 Focus with Use, named for the talent and its branch; rank 0 withdraws it", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Talent Ranger", classes: [["Ranger", 5]] });
      await until(() => featureNamed(actor, "Extra Attack") && talentNamed(actor, "Sic 'Em"), "the class's features and talents", 15000);
      const sicEm = talentNamed(actor, "Sic 'Em");
      await sicEm.update({ "system.taken": 1 });
      await until(() => featureNamed(actor, "Sic 'Em"), "the granted feature", 10000);
      const feature = featureNamed(actor, "Sic 'Em");
      assert.equal(feature.system.kind, "action");
      assert.equal(feature.system.action, "reaction");
      assert.deepEqual({ pool: feature.system.cost.pool, amount: feature.system.cost.amount }, { pool: "focus", amount: 2 });
      assert.equal(feature.system.bound.kind, "companion");
      assert.equal(feature.getFlag("azeroth-rpg", "feature").talentId, sicEm.id);
      assert.equal(feature.system.source.document, "04-TALENTS");
      const sheet = await openSheet(actor);
      try {
        // Features sit at the foot of Combat (D-665).
        sheet.changeTab("combat", "primary");
        await settle();
        const row = sheet.element.querySelector(`section[data-tab='combat'] .azeroth-features [data-item-id="${feature.id}"]`);
        assert.ok(row, "the granted feature is not under Features on Combat");
        assert.ok(row.querySelector('[data-action="useFeature"]'), "no Use on the granted feature");
        assert.include(row.textContent, "Beast Mastery", "the origin does not name the branch");
        assert.include(row.textContent, game.i18n.localize("AZEROTH.Origin.Talent"));
        assert.isNull(sheet.element.querySelector(`.azeroth-talents-in-play [data-item-id="${sicEm.id}"]`), "the talent also sits in Talents in play");
        const findings = checkText(sheet.element.querySelector("section[data-tab='combat'] .azeroth-features"));
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
      await sicEm.update({ "system.taken": 0 });
      await until(() => !featureNamed(actor, "Sic 'Em"), "the withdrawal", 10000);
    });

    it("Trapper takes Snare's action and names itself on it, Explosive Trap adds Fire at 3 a rank, and untaken Snare is restamped", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Talent Trapper", classes: [["Ranger", 1]] });
      await until(() => featureNamed(actor, "Snare") && talentNamed(actor, "Trapper") && talentNamed(actor, "Explosive Trap"), "Snare and the talents", 15000);
      assert.equal(featureNamed(actor, "Snare").system.action, "half");
      await talentNamed(actor, "Trapper").update({ "system.taken": 1 });
      await until(() => featureNamed(actor, "Snare")?.system.action === null, "Snare's action to leave", 10000);
      assert.deepEqual(featureNamed(actor, "Snare").system.modifiedBy, ["Trapper"]);
      await talentNamed(actor, "Explosive Trap").update({ "system.taken": 2 });
      // The NUMBER at rank 2, bound in by the sync (D-768): the stored word
      // `"3*rank"` was evaluated at rank 1 at Use, whatever rank was taken.
      await until(() => featureNamed(actor, "Snare")?.system.damage?.amount === "6", "Explosive Trap's damage", 10000);
      assert.equal(featureNamed(actor, "Snare").system.damage.type, "fire");
      assert.deepEqual(featureNamed(actor, "Snare").system.modifiedBy, ["Trapper", "Explosive Trap"]);
      const sheet = await openSheet(actor);
      try {
        const row = sheet.element.querySelector(`.azeroth-features [data-item-id="${featureNamed(actor, "Snare").id}"]`);
        assert.deepEqual([...row.querySelectorAll(".azeroth-feature-chip--talent")].map(c => c.textContent.trim()), ["Trapper", "Explosive Trap"]);
      } finally {
        await sheet.close();
      }
      await talentNamed(actor, "Trapper").update({ "system.taken": 0 });
      await until(() => featureNamed(actor, "Snare")?.system.action === "half", "Snare's action back", 10000);
      assert.deepEqual(featureNamed(actor, "Snare").system.modifiedBy, ["Explosive Trap"]);
    });

    it("04 §1's refund: a point comes back between fights, and what it would strand is NAMED", async function () {
      this.timeout(120000);
      // *"A point may be taken back between fights. A talent that another
      // talent requires, or whose point holds a higher tier open, gives
      // nothing back until that talent has been taken back first."* A REFUSAL
      // that names the blocker, which is what the chapter states.
      const actor = await makeCharacter({ name: "ZZ Talent Refund", classes: [["Ranger", 5]] });
      await until(() => talentNamed(actor, "Trapper") && talentNamed(actor, "Snake Trap")
        && talentNamed(actor, "Track") && talentNamed(actor, "Wing Clip"), "the Ranger's Survival branch", 15000);

      // Four points beneath tier 2, then Snake Trap on top of Trapper.
      await talentNamed(actor, "Trapper").update({ "system.taken": 1 });
      await talentNamed(actor, "Track").update({ "system.taken": 2 });
      await talentNamed(actor, "Wing Clip").update({ "system.taken": 1 });
      await talentNamed(actor, "Snake Trap").update({ "system.taken": 1 });
      await until(() => talentNamed(actor, "Snake Trap")?.system.taken === 1, "the branch to be spent into", 10000);

      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        const press = async (name, expectTaken) => {
          const talent = talentNamed(actor, name);
          const warned = await warningsDuring(async () => {
            await sheet.options.actions.untakeTalent.call(sheet, new MouseEvent("click"),
              { dataset: { itemId: talent.id } });
          });
          await settle();
          if (expectTaken !== null) {
            await until(() => talentNamed(actor, name)?.system.taken === expectTaken,
              `${name} to reach ${expectTaken}`, 10000);
          }
          return warned.warned;
        };

        // TRAPPER IS REQUIRED by Snake Trap, and the refusal says which.
        let warned = await press("Trapper", 1);
        assert.lengthOf(warned, 1, "taking back a required talent raised no refusal");
        assert.include(warned[0], "Snake Trap", `the refusal does not name the dependent: ${warned[0]}`);

        // A tier-1 point that would leave Snake Trap without its four beneath
        // is refused for the other reason, and also names it.
        warned = await press("Track", 2);
        assert.lengthOf(warned, 1, "taking a point from under a tier-2 talent raised no refusal");
        assert.include(warned[0], "Snake Trap", `the gate refusal does not name what would fall: ${warned[0]}`);

        // Snake Trap itself comes back, and then Trapper does.
        warned = await press("Snake Trap", 0);
        assert.deepEqual(warned, [], `taking back the top talent was refused: ${warned.join("; ")}`);
        warned = await press("Trapper", 0);
        assert.deepEqual(warned, [], `taking back Trapper was refused after its dependent went: ${warned.join("; ")}`);

        // AND THE BUTTON IS ON THE CARD, not only in the actions map.
        await sheet.render({ force: true });
        sheet.changeTab("progress", "primary");
        await settle();
        const branchButton = [...sheet.element.querySelectorAll('[data-action="openBranch"]')]
          .find(b => b.textContent.includes("Survival"));
        assert.ok(branchButton, "the Progress tab lists no Survival branch");
        branchButton.click();
        await settle();
        const trackRow = sheet.element.querySelector(`.azeroth-talent[data-item-id="${talentNamed(actor, "Track").id}"]`);
        assert.ok(trackRow?.querySelector('[data-action="untakeTalent"]'), "a taken talent's card offers no refund");

        // INSIDE A STARTED FIGHT it refuses, in words (04 §1's *between fights*).
        const combat = await Combat.create({});
        made.push(combat);
        // ACTIVATE BEFORE STARTING, as every other batch does (quench-totems.mjs):
        // core's `CombatTracker#_onRender` reads `"turn" in renderData.find(d =>
        // d._id === this.viewed?.id)` (14.367) and throws when the combat that
        // moved is not the viewed one. A world holding an active combat of its
        // own (the test world's play-test fight, 2026-09-27) keeps that one
        // viewed, and this test's start threw on every run.
        await combat.activate();
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
        await combat.startCombat();
        await until(() => actor.activeFight(), "the fight to start", 15000);
        warned = await press("Track", 2);
        assert.lengthOf(warned, 1, "a refund inside a fight was allowed");
        assert.equal(warned[0], game.i18n.localize("AZEROTH.Talent.Locked.inFight"));
        await combat.delete();
      } finally {
        await sheet.close();
      }
    });

    it("Shadow Dance at rank 2 grants two uses a Short Rest, struck by Use and restored by the rest, and Pyroblast's damage takes the rank", async function () {
      this.timeout(90000);
      const rogue = await makeCharacter({ name: "ZZ Talent Rogue", classes: [["Rogue", 1]] });
      await until(() => talentNamed(rogue, "Shadow Dance"), "the Rogue's talents", 15000);
      await talentNamed(rogue, "Shadow Dance").update({ "system.taken": 2 });
      await until(() => featureNamed(rogue, "Shadow Dance"), "the granted feature", 10000);
      const dance = featureNamed(rogue, "Shadow Dance");
      assert.deepEqual({ value: dance.system.uses.value, max: dance.system.uses.max, per: dance.system.uses.per }, { value: 2, max: 2, per: "short" });
      const w = game.system.azeroth.workflows;
      await fillPools(rogue);
      const card = await w.useFeature({ actor: rogue, item: dance });
      assert.ok(card, "Use posted no card");
      assert.equal(featureNamed(rogue, "Shadow Dance").system.uses.value, 1);
      // A character's Short Rest takes food or drink (05 §16, D-733).
      await rogue.shortRest({ food: await give(rogue, "Rations, one day") });
      await until(() => featureNamed(rogue, "Shadow Dance")?.system.uses.value === 2, "the rest to restore the use", 10000);

      const mage = await makeCharacter({ name: "ZZ Talent Mage", classes: [["Mage", 5]] });
      await until(() => talentNamed(mage, "Pyroblast"), "the Mage's talents", 15000);
      await talentNamed(mage, "Pyroblast").update({ "system.taken": 2 });
      await until(() => featureNamed(mage, "Pyroblast"), "Pyroblast", 10000);
      await fillPools(mage);
      const unpin = pinDie(15);
      try {
        const blast = await w.useFeature({ actor: mage, item: featureNamed(mage, "Pyroblast") });
        assert.ok(blast, "Pyroblast posted no card");
        const final = new DOMParser().parseFromString(blast.content, "text/html").querySelector(".azeroth-damage strong")?.textContent.trim();
        assert.equal(final, "6", "2×tier (2) + rank (2) is 6");
      } finally {
        unpin();
      }
    });

    it("Fireball taken embeds the spell from the pack, flagged with the talent, whose rider rides the spell's card; rank 0 takes it away", async function () {
      this.timeout(90000);
      const mage = await makeCharacter({ name: "ZZ Talent Fireball", classes: [["Mage", 1]] });
      await until(() => talentNamed(mage, "Fireball"), "the Mage's talents", 15000);
      const held = () => mage.items.find(i => i.type === "spell" && i.name === "Fireball") ?? null;
      assert.isNull(held(), "Fireball held before the talent");
      await talentNamed(mage, "Fireball").update({ "system.taken": 2 });
      await until(() => held(), "the spell", 10000);
      assert.equal(held().getFlag("azeroth-rpg", "spellFrom"), talentNamed(mage, "Fireball").id);
      await fillPools(mage);
      const unpin = pinDie(15);
      try {
        const card = await game.system.azeroth.workflows.castSpell({ actor: mage, spell: held(), targets: [] });
        assert.ok(card, "the cast posted no card");
        const note = new DOMParser().parseFromString(card.content, "text/html").querySelector(".azeroth-card-talent");
        assert.ok(note, "the talent's rider is not on the card");
        assert.include(note.textContent, "Each rank adds 1");
      } finally {
        unpin();
      }
      await talentNamed(mage, "Fireball").update({ "system.taken": 0 });
      await until(() => !held(), "the spell to leave", 10000);
    });
  });
}

/* -------------------------------------------- */
/*  Bound creatures (02 §7, 04, D2 §7; D-643)    */
/* -------------------------------------------- */

/** A bestiary entry by name. */
async function entryNamed(name) {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = await pack.getIndex();
  const entry = index.find(e => e.name === name);
  return entry ? pack.getDocument(entry._id) : null;
}

/** The first Beast in 14 with a Handling DC that is not the one named. */
async function anotherBeast(not) {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = await pack.getIndex({ fields: ["system.creatureType", "system.handlingDC"] });
  const entry = index.find(e => e.system?.creatureType === "beast" && e.system?.handlingDC && e.name !== not);
  return entry ? pack.getDocument(entry._id) : null;
}

export function boundBatch(context) {
  const { describe, it, assert, before, after } = context;
  const B = () => game.system.azeroth.bound;
  const w = () => game.system.azeroth.workflows;
  const html = message => new DOMParser().parseFromString(message.content, "text/html");

  describe("Bound creatures (02 §7, 04, D2 §7; D-643)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      // The creatures the batch bound go with their owners.
      for (const actor of game.actors.filter(a => a.getFlag("azeroth-rpg", "bond")?.ownerName?.startsWith("ZZ"))) await actor.delete().catch(() => {});
      await cleanup();
    });

    it("a Ranger binds a Wolf: a world actor in the Bound folder, friendly and linked, on the feature's known; a second waits on Second Beast", async function () {
      this.timeout(120000);
      const ranger = await makeCharacter({ name: "ZZ Bound Ranger", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Companion") && talentNamed(ranger, "Bonded"), "the Ranger's features and talents", 15000);
      const feature = featureNamed(ranger, "Companion");
      const wolf = await B().bind({ owner: ranger, feature, entry: await entryNamed("Wolf"), kind: "companion", until: null });
      assert.ok(wolf, "no wolf was bound");
      made.push(wolf);
      assert.equal(wolf.folder?.name, game.i18n.localize("AZEROTH.Bound.Folder"));
      assert.equal(wolf.prototypeToken.disposition, 1, "the token is not friendly");
      assert.isTrue(wolf.prototypeToken.actorLink, "a held creature's token is not linked");
      assert.deepEqual(feature.system.known.map(k => k.uuid), [wolf.uuid]);
      const bond = wolf.getFlag("azeroth-rpg", "bond");
      assert.equal(bond.ownerUuid, ranger.uuid);
      assert.equal(bond.kind, "companion");
      const sheet = await openSheet(wolf);
      try {
        const banner = sheet.element.querySelector(".azeroth-banner");
        assert.include(banner.textContent, ranger.name, "the banner does not name the owner");
        assert.ok(useAction(sheet, "release").el, "no Release on the banner");
        const findings = checkText(banner);
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));
      } finally {
        await sheet.close();
      }
      const other = await anotherBeast("Wolf");
      assert.ok(other, "14 holds no second beast with a Handling DC");
      assert.isNull(await B().bind({ owner: ranger, feature, entry: other, kind: "companion", until: null }), "a second bond was allowed at capacity one");
      await talentNamed(ranger, "Second Beast").update({ "system.taken": 1 });
      const second = await B().bind({ owner: ranger, feature, entry: other, kind: "companion", until: null });
      assert.ok(second, "Second Beast did not open a second bond");
      made.push(second);
      assert.lengthOf(B().boundOf(ranger, "companion"), 2);
    });

    it("Bonded raises the wolf's Health by a third of the Ranger's a rank, Hardy adds its point, Sic 'Em attacks from the card, Bestial Wrath lasts the fight, and Release keeps the wolf", async function () {
      this.timeout(120000);
      const ranger = await makeCharacter({ name: "ZZ Bound Beastmaster", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Companion") && talentNamed(ranger, "Bonded"), "the Ranger's features and talents", 15000);
      const feature = featureNamed(ranger, "Companion");
      const wolf = await B().bind({ owner: ranger, feature, entry: await entryNamed("Wolf"), kind: "companion", until: null });
      assert.ok(wolf);
      made.push(wolf);
      const base = wolf.system.health.max;
      const third = Math.floor(ranger.system.health.max / 3);
      await talentNamed(ranger, "Bonded").update({ "system.taken": 2 });
      // WAIT FOR BOTH. `syncBound` lands the effects, reads the new maximum
      // back and only THEN awaits a separate `update({"system.health.value"})`
      // (documents/bound.mjs), so there is a window where the maximum has
      // moved and the value has not. Waiting on the maximum alone made the
      // assertion below fail on about one run in three (2026-09-09).
      await until(() => wolf.system.health.max === base + 2 * third
        && wolf.system.health.value === wolf.system.health.max, "Bonded's Health", 15000);
      assert.ok(wolf.effects.find(e => e.getFlag("azeroth-rpg", "bond")?.talent === "bonded"), "no Bonded effect on the wolf");
      assert.equal(wolf.system.health.value, wolf.system.health.max, "a full wolf did not stay full");
      const apBase = wolf._source.system.ap.body;
      await talentNamed(ranger, "Hardy Companion").update({ "system.taken": 1 });
      await until(() => wolf.system.ap.body === apBase + 1, "Hardy Companion's point", 15000);

      await talentNamed(ranger, "Sic 'Em").update({ "system.taken": 1 });
      await until(() => featureNamed(ranger, "Sic 'Em"), "Sic 'Em's feature", 10000);
      await fillPools(ranger);
      const card = await w().useFeature({ actor: ranger, item: featureNamed(ranger, "Sic 'Em") });
      assert.ok(card, "Sic 'Em posted no card");
      assert.ok(html(card).querySelector('[data-action="boundAttack"]'), "no Attack for the companion on the card");
      assert.include(card.content, "Wolf", "the card does not name the companion");
      const unpin = pinDie(15);
      try {
        const attack = await CARD_ACTIONS.boundAttack(null, card);
        assert.ok(attack, "the companion's attack posted no card");
        assert.equal(attack.speaker.actor, wolf.id, "the attack is not the wolf's");
      } finally {
        unpin();
      }

      await talentNamed(ranger, "Bestial Wrath").update({ "system.taken": 2 });
      await until(() => featureNamed(ranger, "Bestial Wrath"), "Bestial Wrath's feature", 10000);
      await fillPools(ranger);
      assert.ok(await w().useFeature({ actor: ranger, item: featureNamed(ranger, "Bestial Wrath") }), "Bestial Wrath posted no card");
      await until(() => wolf.system.damageBonus === 4, "Bestial Wrath's bonus at rank 2", 15000);
      await B().endBoundEncounter(ranger);
      await until(() => wolf.system.damageBonus === 0, "the fight's end to lift the buff", 15000);
      assert.equal(wolf.system.health.max, base + 2 * third, "the fight's end took Bonded with it");

      await B().release(ranger, wolf.uuid);
      assert.isNull(wolf.getFlag("azeroth-rpg", "bond") ?? null, "the bond flag stayed");
      assert.lengthOf(wolf.effects.filter(e => e.getFlag("azeroth-rpg", "bond")), 0, "the bond's effects stayed");
      assert.ok(game.actors.get(wolf.id), "a released companion was deleted");
      assert.isFalse(feature.system.known.some(k => k.uuid === wolf.uuid), "the feature still knows the wolf");
    });

    it("a Warlock binds an Imp, a second waits on Master Summoner at rank 2, Demonic Embrace raises its Health, and the Felguard joins the menu with its talent", async function () {
      this.timeout(120000);
      const warlock = await makeCharacter({ name: "ZZ Bound Warlock", classes: [["Warlock", 5]] });
      await until(() => featureNamed(warlock, "Bound Demon") && talentNamed(warlock, "Felguard"), "the Warlock's features and talents", 15000);
      const feature = featureNamed(warlock, "Bound Demon");
      const names = async () => (await w().featureChoices(warlock, feature)).map(o => o.name);
      assert.notInclude(await names(), "Felguard", "the Felguard is on the menu without its talent");
      await talentNamed(warlock, "Felguard").update({ "system.taken": 1 });
      assert.include(await names(), "Felguard", "the Felguard talent did not widen the menu");
      const imp = await B().bind({ owner: warlock, feature, entry: await entryNamed("Imp"), kind: "demon", until: null });
      assert.ok(imp, "no Imp was bound");
      made.push(imp);
      assert.isNull(await B().bind({ owner: warlock, feature, entry: await entryNamed("Voidwalker"), kind: "demon", until: null }), "a second demon was allowed");
      await talentNamed(warlock, "Master Summoner").update({ "system.taken": 2 });
      const voidwalker = await B().bind({ owner: warlock, feature, entry: await entryNamed("Voidwalker"), kind: "demon", until: null });
      assert.ok(voidwalker, "Master Summoner at rank 2 did not open a second bond");
      made.push(voidwalker);
      const base = imp.system.health.max;
      await talentNamed(warlock, "Demonic Embrace").update({ "system.taken": 3 });
      await until(() => imp.system.health.max === base + 3 * Math.floor(warlock.system.health.max / 3), "Demonic Embrace's Health", 15000);
    });

    it("an elemental and a totem go with the encounter, a blockless totem takes 02's numbers, and Force of Nature calls three Treants as one actor", async function () {
      this.timeout(120000);
      const shaman = await makeCharacter({ name: "ZZ Bound Shaman", classes: [["Shaman", 1]] });
      await until(() => featureNamed(shaman, "Totem"), "the Shaman's features", 15000);
      const elemental = await B().bind({ owner: shaman, feature: null, entry: await entryNamed("Fire Elemental"), kind: "elemental", until: "encounter" });
      assert.ok(elemental, "no elemental was bound");
      assert.isFalse(elemental.prototypeToken.actorLink, "a called creature's token is linked");
      const id = elemental.id;
      const searing = await B().bind({ owner: shaman, feature: featureNamed(shaman, "Totem"), entry: await entryNamed("Searing Totem"), kind: "totem", until: "encounter" });
      assert.ok(searing, "the Searing Totem was not bound from 14");
      await B().endBoundEncounter(shaman);
      assert.isUndefined(game.actors.get(id), "a called elemental survived the fight's end");
      assert.isUndefined(game.actors.get(searing.id), "a totem survived the fight's end");
      const stream = await B().bind({
        owner: shaman, feature: featureNamed(shaman, "Totem"),
        block: { name: "Healing Stream Totem", img: "icons/svg/mystery-man.svg", system: totemBlock({ name: "Healing Stream", description: "<p>x</p>", tier: 1 }) },
        kind: "totem", until: "encounter"
      });
      assert.ok(stream, "a blockless totem was not bound");
      made.push(stream);
      assert.deepEqual({ max: stream.system.health.max, defense: stream.system.defense, body: stream.system.ap.body }, { max: 1, defense: 0, body: 0 });

      const druid = await makeCharacter({ name: "ZZ Bound Druid", classes: [["Druid", 1]] });
      await until(() => talentNamed(druid, "Force of Nature"), "the Druid's talents", 15000);
      await talentNamed(druid, "Force of Nature").update({ "system.taken": 1 });
      await until(() => featureNamed(druid, "Force of Nature"), "Force of Nature's feature", 10000);
      await fillPools(druid);
      const card = await w().useFeature({ actor: druid, item: featureNamed(druid, "Force of Nature") });
      assert.ok(card, "Force of Nature posted no card");
      const treants = B().boundOf(druid, "summon");
      assert.lengthOf(treants, 1, "three Treants are not one actor");
      made.push(treants[0]);
      assert.equal(treants[0].name, "Treant");
      assert.equal(treants[0].getFlag("azeroth-rpg", "bond").count, 3);
      assert.include(card.content, "Treant", "the card does not say what was called");
    });

    it("binds a creature already standing in the world from its banner (D-649): the flag, the owners, the feature, the talents' effects", async function () {
      this.timeout(120000);
      const ranger = await makeCharacter({ name: "ZZ Adopt Ranger", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Companion") && talentNamed(ranger, "Bonded"), "the Ranger's features", 15000);
      const boar = await makeNpc("Boar");
      let sheet = await openSheet(boar);
      try {
        assert.ok(useAction(sheet, "bindTo").el, "no Bind to a character on an unbound creature");
        assert.isNull(useAction(sheet, "release").el, "Release on an unbound creature");
      } finally {
        await sheet.close();
      }
      const feature = B().featureForKind(ranger, "companion");
      assert.equal(feature?.name, "Companion");
      const bound = await B().adopt({ owner: ranger, actor: boar, kind: "companion", feature });
      assert.ok(bound, "the boar was not bound");
      const bond = boar.getFlag("azeroth-rpg", "bond");
      assert.equal(bond?.ownerUuid, ranger.uuid);
      assert.equal(bond?.kind, "companion");
      assert.equal(boar.folder?.name, game.i18n.localize("AZEROTH.Bound.Folder"));
      assert.equal(boar.prototypeToken.disposition, 1);
      assert.isTrue(feature.system.known.some(k => k.uuid === boar.uuid), "the Companion feature does not know the boar");
      assert.lengthOf(B().boundOf(ranger, "companion"), 1);
      sheet = await openSheet(boar);
      try {
        assert.include(sheet.element.querySelector(".azeroth-banner").textContent, ranger.name);
        assert.isNull(useAction(sheet, "bindTo").el, "Bind to a character on a bound creature");
      } finally {
        await sheet.close();
      }
      const base = boar.system.health.max;
      await talentNamed(ranger, "Bonded").update({ "system.taken": 1 });
      await until(() => boar.system.health.max === base + Math.floor(ranger.system.health.max / 3), "Bonded on the adopted boar", 15000);
    });

    it("binds a pick made before the door at migration (D-649): the pack uuid on the feature becomes a bound world actor", async function () {
      this.timeout(120000);
      const { bindLegacyKnown } = await import("../migrations/0.11.0-play.mjs");
      const ranger = await makeCharacter({ name: "ZZ Legacy Ranger", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Companion"), "the Companion", 15000);
      const feature = featureNamed(ranger, "Companion");
      const entry = await entryNamed("Boar");
      await feature.update({ "system.known": [{ uuid: entry.uuid, name: "Boar" }] });
      const n = await bindLegacyKnown(() => {});
      assert.isAtLeast(n, 1, "nothing was bound");
      const bound = B().boundOf(ranger, "companion");
      assert.lengthOf(bound, 1, "no bound boar after the migration");
      made.push(bound[0]);
      assert.equal(bound[0].name, "Boar");
      assert.deepEqual(feature.system.known.map(k => k.uuid), [bound[0].uuid], "the feature still points at the pack");
      assert.equal(await bindLegacyKnown(() => {}), 0, "a second run bound again");
    });

    it("a Release pressed on a token's sheet frees the slot (D-650): the bond is the world actor's, and the next pick goes through", async function () {
      this.timeout(120000);
      const ranger = await makeCharacter({ name: "ZZ Token Ranger", classes: [["Ranger", 5]] });
      await until(() => featureNamed(ranger, "Companion"), "the Companion", 15000);
      const feature = featureNamed(ranger, "Companion");
      const wolf = await B().bind({ owner: ranger, feature, entry: await entryNamed("Wolf"), kind: "companion", until: null });
      assert.ok(wolf);
      made.push(wolf);
      const scene = await Scene.create({ name: "ZZ Bound Scene", width: 1000, height: 1000, grid: { size: 100 } });
      made.push(scene);
      // An unlinked token, as one placed before the bond would be: its actor is a copy.
      const [tokenDoc] = await scene.createEmbeddedDocuments("Token", [(await wolf.getTokenDocument({ x: 100, y: 100, actorLink: false })).toObject()]);
      const copy = tokenDoc.actor;
      assert.ok(copy?.isToken, "the token's actor is not a synthetic one");
      assert.equal(B().bondOf(copy)?.ownerUuid, ranger.uuid, "the token's sheet does not read the world actor's bond");
      await B().release(ranger, copy.uuid);
      assert.isNull(wolf.getFlag("azeroth-rpg", "bond") ?? null, "the release on the token did not reach the world actor");
      assert.equal(B().boundCount(ranger, "companion"), 0, "the slot is still counted full");
      const other = await anotherBeast("Wolf");
      const next = await B().bind({ owner: ranger, feature, entry: other, kind: "companion", until: null });
      assert.ok(next, "the next pick was refused after the release");
      made.push(next);
    });

    it("the Companion menu lists the GM's own beasts beside 14's, greys one above the character's tier or without a Handling DC, and a pick binds the world actor itself (D-650)", async function () {
      this.timeout(120000);
      const { featureChoices } = await import("../dice/workflows.mjs");
      const ranger = await makeCharacter({ name: "ZZ Menu World Ranger", classes: [["Ranger", 1]] });
      await until(() => featureNamed(ranger, "Companion"), "the Companion", 15000);
      const feature = featureNamed(ranger, "Companion");
      const boar = await makeNpc("Boar");
      const pack = game.packs.get("azeroth-rpg.bestiary");
      const index = await pack.getIndex({ fields: ["system.creatureType", "system.tier", "system.handlingDC"] });
      // Not the Avatar: the Druid's form is a beast in 14 and never a companion.
      // 14's beasts stop at tier 2 (the Avatar, a form, is the one above): a tier-2 beast against a tier-1 Ranger.
      const high = index.find(e => e.name !== "Avatar" && e.system?.creatureType === "beast" && (e.system?.tier ?? 1) >= 2 && e.system?.handlingDC);
      assert.ok(high, "14 holds no tier-2 beast with a Handling DC");
      const bigWorld = await Actor.create({ ...(await pack.getDocument(high._id)).toObject(), name: "ZZ Big World Beast" });
      made.push(bigWorld);
      const noHandling = await Actor.create({ ...boar.toObject(), name: "ZZ Unhandled Beast", system: { ...boar.toObject().system, handlingDC: null } });
      made.push(noHandling);
      const options = await featureChoices(ranger, feature);
      const mine = options.find(o => o.uuid === boar.uuid);
      assert.ok(mine, "the GM's Boar is not on the menu");
      assert.isTrue(mine.available !== false, "the GM's tier-1 Boar is greyed");
      assert.include(mine.tag, game.i18n.localize("AZEROTH.Bound.InWorld"));
      const big = options.find(o => o.uuid === bigWorld.uuid);
      assert.ok(big, "the GM's higher-tier beast is not listed");
      assert.isFalse(big.available, "a beast above the Ranger's tier is open");
      assert.include(big.tag, String(high.system.tier), "the greyed tag does not name the beast's tier");
      const packHigh = options.find(o => o.name === high.name && !o.world);
      assert.ok(packHigh && packHigh.available === false, "14's higher-tier beast is open to a tier-1 Ranger");
      const unhandled = options.find(o => o.uuid === noHandling.uuid);
      assert.ok(unhandled && unhandled.available === false, "a beast with no Handling DC is open");
      assert.equal(unhandled.tag, game.i18n.localize("AZEROTH.Bound.NoHandling"));
      assert.notInclude(options.map(o => o.name), "Dragon Whelp", "a dragonkin is listed without Master of Wilds");
      // The pick binds the Boar as it stands: no second actor.
      const before = game.actors.size;
      const pending = w().useFeature({ actor: ranger, item: feature });
      const app = await (async () => { for (let i = 0; i < 200; i++) { const a = foundry.applications.instances.get(`azeroth-choose-${feature.id}`); if (a?.rendered) return a; await new Promise(r => setTimeout(r, 50)); } return null; })();
      assert.ok(app, "no chooser opened");
      const select = app.element.querySelector("select[name=choice]");
      const option = [...select.options].find(o => o.textContent.trim().startsWith("ZZ Boar"));
      assert.ok(option, "the GM's Boar is not on the chooser");
      select.value = option.value;
      app.element.querySelector('button[data-action="choose"]').click();
      const card = await pending;
      assert.ok(card, "the pick posted no card");
      made.push(card);
      assert.equal(game.actors.size, before, "the pick made a second actor instead of binding the Boar");
      assert.equal(B().bondOf(boar)?.ownerUuid, ranger.uuid, "the Boar is not bound");
      assert.isTrue(feature.system.known.some(k => k.uuid === boar.uuid));
      // Held now: tagged Bonded, and offered again without a refusal message.
      const again = (await featureChoices(ranger, feature)).find(o => o.uuid === boar.uuid);
      assert.equal(again?.tag, game.i18n.localize("AZEROTH.Feature.Bonded"));
      assert.include((await w().featureMenu(ranger, feature)).note, "ZZ Boar", "the note does not name what is held");
    });

    it("the door refuses an entry that is not 14's and a kind at capacity, with the reason", async function () {
      this.timeout(60000);
      const ranger = await makeCharacter({ name: "ZZ Bound Refusals", classes: [["Ranger", 1]] });
      await until(() => featureNamed(ranger, "Companion"), "the Companion", 15000);
      let refused = null;
      try {
        await B().bindQueryHandler({ ownerUuid: ranger.uuid, entryUuid: ranger.uuid, kind: "companion" }, { user: game.user });
      } catch (err) {
        refused = err.message;
      }
      assert.ok(refused, "a world actor was accepted as 14's entry");
      const wolf = await B().bind({ owner: ranger, feature: featureNamed(ranger, "Companion"), entry: await entryNamed("Wolf"), kind: "companion", until: null });
      made.push(wolf);
      refused = null;
      try {
        await B().bindQueryHandler({ ownerUuid: ranger.uuid, entryUuid: (await entryNamed("Wolf")).uuid, kind: "companion" }, { user: game.user });
      } catch (err) {
        refused = err.message;
      }
      assert.include(refused ?? "", ranger.name, "the capacity refusal does not name the owner");
    });
  });
}

/* -------------------------------------------- */
/*  Talent passives and use counters (D-648)     */
/* -------------------------------------------- */

export function passiveBatch(context) {
  const { describe, it, assert, before, after } = context;
  const w = () => game.system.azeroth.workflows;
  const effectOf = (actor, identifier) => actor.effects.find(e => e.getFlag("azeroth-rpg", "talentEffect") === identifier) ?? null;

  describe("Talent passives and use counters (04, D-648)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      await cleanup();
    });

    it("Molten Skin lays Ward 1 a rank against Fire on the Mage as an effect, moved by the rank and gone untaken", async function () {
      this.timeout(90000);
      const mage = await makeCharacter({ name: "ZZ Passive Mage", classes: [["Mage", 1]] });
      await until(() => talentNamed(mage, "Molten Skin"), "the Mage's talents", 15000);
      assert.equal(mage.system.ward.fire ?? 0, 0);
      await talentNamed(mage, "Molten Skin").update({ "system.taken": 2 });
      await until(() => mage.system.ward.fire === 2, "Molten Skin's Ward at rank 2", 15000);
      const effect = effectOf(mage, "molten-skin");
      assert.ok(effect, "no Molten Skin effect on the Mage");
      assert.equal(effect.name, "Molten Skin");
      assert.deepEqual(effect.system.changes.map(c => [c.key, c.type, c.value, c.phase]), [["system.ward.fire", "add", "2", "final"]]);
      await talentNamed(mage, "Molten Skin").update({ "system.taken": 1 });
      await until(() => mage.system.ward.fire === 1, "the rank moving down", 15000);
      await talentNamed(mage, "Molten Skin").update({ "system.taken": 0 });
      await until(() => !effectOf(mage, "molten-skin"), "the effect going with the talent", 15000);
      assert.equal(mage.system.ward.fire ?? 0, 0);
    });

    it("Toughness raises the Warrior's Health maximum by 2 a rank, and Wounded Beast a weapon's Rating by the rank", async function () {
      this.timeout(90000);
      const warrior = await makeCharacter({ name: "ZZ Passive Warrior", classes: [["Warrior", 1]], weapons: ["Longsword"] });
      await until(() => talentNamed(warrior, "Toughness") && talentNamed(warrior, "Wounded Beast"), "the Warrior's talents", 15000);
      const before = warrior.system.health.max;
      await talentNamed(warrior, "Toughness").update({ "system.taken": 3 });
      await until(() => warrior.system.health.max === before + 6, "Toughness at rank 3", 15000);
      await talentNamed(warrior, "Wounded Beast").update({ "system.taken": 2 });
      const sword = warrior.items.find(i => i.name === "Longsword");
      const unpin = pinDie(15);
      try {
        const card = await attackWithDialog(warrior, sword);
        assert.ok(card, "the attack posted no card");
        const explanation = new DOMParser().parseFromString(card.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";
        assert.match(explanation, new RegExp(`^${sword.system.rating + 2} `), `Wounded Beast did not add 2 to ${sword.system.rating}: ${explanation}`);
        assert.include(card.content, game.i18n.localize("AZEROTH.Card.WoundedBeast"), "the card does not say where the 2 came from");
      } finally {
        unpin();
      }
    });

    it("Shield of Faith adds Defense while a shield is equipped and not otherwise; Thick Hide adds Armor Points in a form only", async function () {
      this.timeout(90000);
      const paladin = await makeCharacter({ name: "ZZ Passive Paladin", classes: [["Paladin", 1]], armor: ["Buckler"] });
      await until(() => talentNamed(paladin, "Shield of Faith"), "the Paladin's talents", 15000);
      const buckler = paladin.items.find(i => i.name === "Buckler");
      assert.ok(buckler?.system.shield, "the Buckler is not a shield");
      const defense = paladin.system.defense;
      await talentNamed(paladin, "Shield of Faith").update({ "system.taken": 1 });
      await settle();
      assert.isNull(effectOf(paladin, "shield-of-faith"), "Shield of Faith stood with no shield equipped");
      await buckler.update({ "system.equipped": true });
      const worn = paladin.system.defense;
      await until(() => paladin.system.defense === worn + 1, "Shield of Faith with the shield up", 15000);
      await buckler.update({ "system.equipped": false });
      await until(() => !effectOf(paladin, "shield-of-faith"), "the shield set down", 15000);
      assert.equal(paladin.system.defense, defense);

      const druid = await makeCharacter({ name: "ZZ Passive Druid", classes: [["Druid", 1]] });
      await until(() => talentNamed(druid, "Thick Hide"), "the Druid's talents", 15000);
      await talentNamed(druid, "Thick Hide").update({ "system.taken": 2 });
      await settle();
      assert.isNull(effectOf(druid, "thick-hide"), "Thick Hide stood outside a form");
      const body = druid.system.ap.body;
      // A real shape through its one writer (D-769): the Body AP is the bear's
      // own 2 in the form, and Thick Hide's 2 lands on it.
      const { fromPack } = await import("./fixtures.mjs");
      const bear = await fromPack("azeroth-rpg.bestiary", "Black Bear");
      await game.system.azeroth.shapes.takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.system.ap.body === bear.system.ap.body + 2, "Thick Hide on the bear's Armor Points in a form", 15000);
      await game.system.azeroth.shapes.leaveShape(druid);
      await until(() => !effectOf(druid, "thick-hide"), "the form left", 15000);
      assert.equal(druid.system.ap.body, body);
    });

    it("Inner Focus is a counter on the sheet: rank uses a Short Rest, one struck by Use", async function () {
      this.timeout(90000);
      const priest = await makeCharacter({ name: "ZZ Counter Priest", classes: [["Priest", 1]] });
      await until(() => talentNamed(priest, "Inner Focus"), "the Priest's talents", 15000);
      await talentNamed(priest, "Inner Focus").update({ "system.taken": 2 });
      await until(() => featureNamed(priest, "Inner Focus"), "Inner Focus's counter", 15000);
      const counter = featureNamed(priest, "Inner Focus");
      assert.deepEqual({ value: counter.system.uses.value, max: counter.system.uses.max, per: counter.system.uses.per }, { value: 2, max: 2, per: "short" });
      assert.isNull(counter.system.action, "a counter is not an action");
      const card = await w().useFeature({ actor: priest, item: counter });
      assert.ok(card, "Use posted no card");
      assert.equal(featureNamed(priest, "Inner Focus").system.uses.value, 1, "Use struck no use");
      assert.include(card.content, "costs no Mana", "the card does not carry the talent's text");
    });
  });
}
