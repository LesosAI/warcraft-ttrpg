/**
 * **THE DEMON HUNTER'S CLASS FEATURES, THROUGH THE REAL CONTROLS** (02 §7; the Demon Hunter plan's Phase 4a,
 * D-1520). Every case presses what a player presses - the sheet's Use, the attack dialog's rider
 * lines, the cast dialog's Fel Surge lines, the Short Rest button and its window, the Devour Soul card's
 * button - with the die pinned through `fixtures.mjs#pinDie`, and reads the RESULT off the actor and the card:
 *
 * - a Short Rest turning 4 Hatred into 2 Fel Corruption;
 * - a Fel Lash hit at Fel 6 dealing tier + 1 and leaving Fel 5, and a hit at Fel 20 taking nothing off;
 * - in a fight, only the first Fel Lash hit in a turn sheds, and the next turn sheds again (D-1721);
 * - Beyond Limits asked after a Body Test's die and adding its 2 once a turn (D-1720, D-1724);
 * - I Have Prepared's end costing half of (20 minus the Fel held when it began);
 * - Hunter's Leap at Dexterity +3 reaching 30 feet and refusing 35;
 * - Demon Unleashed spending all the Hatred and gaining none while it stands;
 * - Beyond Limits, Mana Rend, Bane of the Legion, Devour Soul, Fel Surge's order and Spectral Sight.
 *
 * Needs the Demon Hunter in the packs (`packs:parse`, then `packs:build`). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.demon-hunter-features`.
 */

import { cleanup, dialogFor, give, made, makeCharacter, makeNpc, openSheet, pinDie, restDialogFor, settle, untilHook, useAction, warnings } from "./fixtures.mjs";
import { castFromSheet, chooser, fightWith, freshTurn, pick, pressCard, pressUse, sceneWith, textOf, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

const SCOPE = "azeroth-rpg";
const hatredOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "hatred") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const felOf = actor => actor.system?.corruption?.fel ?? 0;

/** A Night Elf Demon Hunter at a level, its pools in place. */
async function hunterWith(name, { level = 1, spells = [], weapons = [], abilities = { dex: 16, wis: 14 }, fel = 0 } = {}) {
  const actor = await makeCharacter({ name, classes: [["Demon Hunter", level]], race: "Night Elf", spells, weapons, abilities, corruption: { fel } });
  await until(() => hatredOf(actor) && energyOf(actor), "the Hatred and Energy pools");
  return actor;
}

/** Hatred set by a GM's hand (the named `hand` door). */
async function setHatred(actor, value) {
  const pool = hatredOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { hatredGain: "hand" });
  await until(() => hatredOf(actor).value === value, `${value} Hatred`);
}

/** Energy set (a plain pool write; Energy rises through no named door). */
async function setEnergy(actor, value) {
  const pool = energyOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value });
  await until(() => energyOf(actor).value === value, `${value} Energy`);
}

/** The first weapon held, equipped. */
async function equipFirst(actor) {
  const weapon = actor.items.find(i => i.type === "weapon");
  await weapon.update({ "system.equipped": true });
  await settle();
  return weapon;
}

/** Attack from the Combat tab with rider lines ticked, the die pinned; the posted card. */
async function attackWithRiders(actor, weapon, target, riders, face = 20) {
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  canvas.tokens.setTargets([target.id]);
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack");
    sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`).click();
    const dialog = await dialogFor(actor, 8000);
    if (!dialog) throw new Error("the attack dialog did not open");
    for (const id of riders) {
      const box = dialog.element.querySelector(`input[name="rider-${id}"]`);
      if (!box) throw new Error(`the dialog draws no ${id} line`);
      if (box.disabled) throw new Error(`the ${id} line is greyed`);
      box.checked = true;
    }
    // **A HUNTER WITH EXTRA ATTACK CHOOSES THE SECOND ROLL'S WEAPON** (0.12.32's `extraWeapon` select is
    // `required`, and the Roll stays greyed until it holds a weapon): the first ready one, as the DK batch does.
    const select = dialog.element.querySelector('select[name="extraWeapon"]');
    if (select && !select.value) {
      const first = [...select.options].find(o => o.value && !o.disabled);
      if (first) { select.value = first.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    const roll = dialog.element.querySelector('button[data-action="roll"]');
    await until(() => !roll.disabled, "the Roll button enabled", 5000);
    roll.click();
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await sheet.close();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  }
}

/** A point `feet` east of a token's own top-left, in canvas pixels, on a 100 px / 5 ft grid. */
const eastOf = (token, feet) => ({ x: token.document.x + (feet / 5) * 100 + 50, y: token.document.y + 50 });

export function demonHunterFeaturesBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("The Demon Hunter's class features (the Demon Hunter plan's Phase 4a)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.classes").getIndex();
      if (!index.some(e => e.name === "Demon Hunter")) throw new Error("the classes pack holds no Demon Hunter: run packs:parse and rebuild the packs");
    });
    afterEach(async function () {
      const { setDemonHunterPick } = await import("../effects/demon-hunter-features.mjs");
      setDemonHunterPick(null);
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("a Short Rest from the sheet turns 4 Hatred into 2 Fel Corruption and empties the pool (R2)", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Rest");
      await give(dh, "Bread and cheese");
      await setHatred(dh, 4);
      const sheet = await openSheet(dh);
      try {
        const { el, registered } = useAction(sheet, "shortRest");
        assert.ok(el && registered, "the sheet draws a Short Rest");
        el.click();
        const window = await restDialogFor(dh, 8000);
        assert.ok(window, "the Short Rest window opened");
        const food = window.element.querySelector('select[name="food"]');
        const first = food ? [...food.options].find(o => o.value) : null;
        if (food && first && !food.value) { food.value = first.value; food.dispatchEvent(new Event("change", { bubbles: true })); }
        window.element.querySelector('button[data-action="rest"]').click();
      } finally {
        await sheet.close();
      }
      await until(() => felOf(dh) === 2, "2 Fel Corruption");
      await until(() => hatredOf(dh).value === 0, "the pool emptied");
    });

    it("a Fel Lash hit at Fel 6 deals tier + 1 Fel damage and leaves Fel 5; a hit at Fel 20 takes nothing off", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Lash", { level: 1, weapons: ["Short warglaive"], fel: 6 });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equipFirst(dh);
      await setHatred(dh, 2);
      const card = await attackWithRiders(dh, weapon, tokenOf(foe), ["fel-lash"], 20);
      await until(() => felOf(dh) === 5, "Fel 5 after the hit");
      assert.equal(hatredOf(dh).value, 0, "2 Hatred paid");
      assert.match(textOf(card), /\+2 Fel damage/, "tier 1, plus 1 for 5 Fel held before the hit");
      assert.match(textOf(card), /loses 1 Fel Corruption \(6 to 5\)/, "the card says what came off");
      // At Fel 20 the track has ended: the hit takes nothing off.
      await dh.update({ "system.corruption.fel": 20 });
      await setHatred(dh, 2);
      const ended = await attackWithRiders(dh, weapon, tokenOf(foe), ["fel-lash"], 20);
      await settle();
      assert.equal(felOf(dh), 20, "an ended track does not fall");
      assert.match(textOf(ended), /\+5 Fel damage/, "tier 1, plus 4 at Fel 20");
      assert.match(textOf(ended), /has reached 20/, "the card says why nothing came off");
    });

    it("D-1721: in a fight the first Fel Lash hit in a turn sheds, a second hit that turn sheds none, and the next turn sheds again", async function () {
      this.timeout(240000);
      const dh = await hunterWith("ZZ DH Lash Once", { level: 1, weapons: ["Short warglaive"], fel: 10 });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equipFirst(dh);
      const combat = await fightWith([dh, foe]);
      const mine = await freshTurn(dh, 2);
      await setHatred(dh, 4);
      const first = await attackWithRiders(dh, weapon, tokenOf(foe), ["fel-lash"], 20);
      await until(() => felOf(dh) === 9, "Fel 9 after the first hit");
      assert.match(textOf(first), /loses 1 Fel Corruption \(10 to 9\)/, "the first hit's card says what came off");
      // A second weapon attack the same turn (the budget reset by hand, the round's once-marks untouched): it still
      // pays and deals its Fel damage, and takes no Fel off.
      await mine.resetBudget({ ownTurn: true });
      const second = await attackWithRiders(dh, weapon, tokenOf(foe), ["fel-lash"], 20);
      await settle();
      assert.equal(felOf(dh), 9, "a later hit in the same turn takes none");
      assert.equal(hatredOf(dh).value, 0, "both hits paid their 2 Hatred");
      // The Fel Lash bonus reads the Fel held at the hit (02: tier plus 1 for each 5 Fel): the first hit took it to 9,
      // so the second deals tier 1 plus 1.
      assert.match(textOf(second), /\+2 Fel damage/, "the second hit still deals tier 1 plus 1 for the 9 Fel held");
      assert.match(textOf(second), /already taken Fel Corruption off/, "the card says why nothing came off");
      // The next turn of the hunter's sheds again.
      await turnForward(combat, foe);
      await turnForward(combat, dh);
      await setHatred(dh, 2);
      await attackWithRiders(dh, weapon, tokenOf(foe), ["fel-lash"], 20);
      await until(() => felOf(dh) === 8, "Fel 8 on the next turn's first hit");
    });

    it("D-1720, D-1724: Beyond Limits is asked after a Body Test's die, where the 2 turns it, and adds the 2 and 1 Hatred once a turn", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Limits After", { level: 1 });
      const { setBeyondLimitsAnswer } = await import("../effects/demon-hunter-features.mjs");
      const asked = [];
      setBeyondLimitsAnswer(o => { asked.push(o); return true; });
      const rollBody = async (face, over) => {
        const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        const sheet = await openSheet(dh);
        const unpin = pinDie(face);
        try {
          const chip = sheet.element.querySelector('[data-action="rollResilience"][data-resilience="body"]');
          if (!chip) throw new Error("the Core tab draws no Body chip");
          const mod = parseInt(String(chip.textContent).replace(/[^0-9+-]/g, ""), 10) || 0;
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === dh.id && m.rolls?.length);
          chip.click();
          const dialog = await dialogFor(dh, 8000);
          if (!dialog) throw new Error("the Resilience dialog did not open");
          // The DC set so the die and the modifier miss it by `over`.
          const dc = dialog.element.querySelector('input[name="dc"]');
          dc.value = String(face + mod + over);
          dc.dispatchEvent(new Event("change", { bubbles: true }));
          dialog.element.querySelector('button[data-action="roll"]').click();
          const [card] = await posted;
          made.push(card);
          return { card, dc: face + mod + over };
        } finally {
          unpin();
          await sheet.close();
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
        }
      };
      try {
        // Missed by 1: the 2 turns it, so it is asked; a yes adds the 2 to the roll the card keeps, and 1 Hatred.
        const { card } = await rollBody(10, 1);
        assert.equal(asked.length, 1, "asked once, after the die");
        const roll = card.rolls[0];
        assert.ok(roll.options.beyondLimits, "the roll carries Beyond Limits");
        assert.equal(roll.options.beyondLimits.totals[1], roll.options.beyondLimits.totals[0] + 2, "the 2 is on the kept total");
        assert.equal(roll.outcome.success, true, "the Test turned to a success");
        assert.equal(hatredOf(dh).value, 1, "1 Hatred");
        // Once a turn: a second Test in the same round of the world's clock is not asked.
        await rollBody(10, 1);
        assert.equal(asked.length, 1, "not asked twice in one turn");
        assert.equal(hatredOf(dh).value, 1, "nothing gained twice");
      } finally {
        setBeyondLimitsAnswer(null);
      }
    });

    it("Hunter's Leap at Dexterity +3 reaches 30 feet, refuses 35 with nothing spent, and costs 2 Energy and the Reaction", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Leap", { level: 3, abilities: { dex: 16, wis: 12 } });
      await sceneWith([{ actor: dh, x: 500, y: 500 }]);
      await setEnergy(dh, 10);
      const { setDemonHunterPick } = await import("../effects/demon-hunter-features.mjs");
      const token = tokenOf(dh);
      // 35 feet: refused in words, nothing spent, the token where it stood.
      setDemonHunterPick(() => eastOf(token, 35));
      const said = await warnings(async () => {
        const pressed = await pressUse(dh, "Hunter's Leap");
        await Promise.race([pressed.card, new Promise(r => setTimeout(r, 3000))]);
      });
      assert.ok(said.length, "a leap past 30 feet is refused in words");
      assert.equal(energyOf(dh).value, 10, "nothing spent");
      // 30 feet: the leap lands, 2 Energy paid.
      const x0 = token.document.x;
      setDemonHunterPick(() => eastOf(token, 30));
      const { card } = await pressUse(dh, "Hunter's Leap");
      assert.ok(await card, "the leap posted its card");
      await until(() => token.document.x === x0 + 600, "the token six squares east");
      assert.equal(energyOf(dh).value, 8, "2 Energy paid");
    });

    it("Demon Unleashed spends all the Hatred, takes the shape, and gains no Hatred while it stands", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Unleashed", { level: 17, spells: ["Fel Armor"], fel: 10 });
      // A token on a viewed scene: the Use's cue is anchored on it (the animations batch reruns this test, and a
      // hunter with no token is refused `no-anchor`).
      await sceneWith([{ actor: dh, x: 500, y: 500 }]);
      await setHatred(dh, 6);
      const { card } = await pressUse(dh, "Demon Unleashed");
      assert.ok(await card, "the Use posted its card");
      await until(() => dh.shape?.kind === "unleashed", "the unleashed shape");
      assert.equal(hatredOf(dh).value, 0, "every Hatred spent");
      const effect = dh.effects.find(e => e.getFlag(SCOPE, "shape")?.kind === "unleashed");
      assert.ok(effect?.duration?.value > 0, "the shape carries its span");
      assert.equal(dh.system.flyingSpeed, 240, "wings at Fel 10");
      assert.ok(dh.system.conditionImmunities.includes("frightened") && dh.system.conditionImmunities.includes("charmed"), "Frightened and Charmed refused");
      assert.isAtLeast(dh.system.ward?.fel ?? 0, 2, "Ward 2 against Fel");
      // A cast while unleashed gives no Hatred.
      await setEnergy(dh, 10);
      const cast = await castFromSheet(dh, "Fel Armor", { face: 20 });
      assert.ok(cast, "the cast posted its card");
      await settle();
      assert.equal(hatredOf(dh).value, 0, "no Hatred while unleashed");
      assert.match(textOf(cast), /gains no Hatred while unleashed/, "the card says why");
      // Nor Beyond Limits.
      const pressed = await pressUse(dh, "Beyond Limits");
      const app = await chooser(dh.items.find(i => i.type === "feature" && i.name === "Beyond Limits"));
      await pick(app, "One Move ignores");
      await pressed.card;
      await settle();
      assert.equal(hatredOf(dh).value, 0, "Beyond Limits gives none while unleashed");
    });

    it("I Have Prepared reads Fel as 20, fills Hatred to 13, and at its end costs half of (20 - the Fel held when it began)", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Prepared", { level: 20, fel: 6 });
      await sceneWith([{ actor: dh, x: 500, y: 500 }]); // the Use's cue anchor (see Demon Unleashed's test)
      const first = await pressUse(dh, "I Have Prepared");
      assert.ok(await first.card, "the Use posted its card");
      await until(() => dh.getFlag(SCOPE, "felReadAs") === 20, "Fel read as 20");
      await until(() => hatredOf(dh).value === 13, "Hatred filled to 13");
      await until(() => dh.shape?.kind === "unleashed", "the shape for the minute");
      assert.equal(felOf(dh), 6, "the real Fel does not change");
      // The hunter ends the minute at no cost: the sheet's Use again.
      const second = await pressUse(dh, "I Have Prepared");
      await Promise.race([second.card, new Promise(r => setTimeout(r, 3000))]);
      await until(() => felOf(dh) === 13, "6 + ceil((20 - 6) / 2) = 13");
      await until(() => hatredOf(dh).value === 0, "all Hatred lost");
      assert.equal(dh.getFlag(SCOPE, "felReadAs"), undefined, "Fel read as itself again");
      await until(() => dh.shape === null, "the shape left");
    });

    it("Beyond Limits lays the choice for the turn and gives 1 Hatred, once a round out of a fight", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Limits");
      await sceneWith([{ actor: dh, x: 500, y: 500 }]); // the Use's cue anchor (see Demon Unleashed's test)
      const speed = dh.system.speed;
      const feature = dh.items.find(i => i.type === "feature" && i.name === "Beyond Limits");
      const pressed = await pressUse(dh, "Beyond Limits");
      await pick(await chooser(feature), "Your next Move");
      assert.ok(await pressed.card, "the Use posted its card");
      await until(() => dh.system.speed === speed + 10, "10 feet further for the turn");
      assert.equal(hatredOf(dh).value, 1, "1 Hatred");
      const said = await warnings(async () => {
        const again = await pressUse(dh, "Beyond Limits");
        await Promise.race([again.card, new Promise(r => setTimeout(r, 3000))]);
      });
      assert.ok(said.some(w => /once each turn/.test(w)), `the second press is refused in words: ${said.join(" | ")}`);
      assert.equal(hatredOf(dh).value, 1, "nothing gained twice");
    });

    it("Mana Rend takes the Wisdom modifier of Power off the target and deals Fel for what it could not lose", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Rend", { level: 9, weapons: ["Short warglaive"], abilities: { dex: 16, wis: 14 } });
      const foe = await makeNpc("Kobold Geomancer");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equipFirst(dh);
      await setEnergy(dh, 10);
      await foe.update({ "system.power.value": 1 });
      const card = await attackWithRiders(dh, weapon, tokenOf(foe), ["mana-rend"], 20);
      await until(() => (foe.system.power?.value ?? 0) === 0, "the Power lost");
      assert.equal(energyOf(dh).value, 7, "3 Energy paid");
      assert.match(textOf(card), /loses 1 Power and takes 1 Fel damage/, "Wisdom +2: 1 lost, 1 Fel for the rest");
      assert.equal(hatredOf(dh).value, 1, "1 Hatred on the hit");
    });

    it("Bane of the Legion adds the tier against a demon and marks it until the end of the hunter's next turn", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Bane", { level: 1, weapons: ["Short warglaive"] });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equipFirst(dh);
      const card = await attackWithRiders(dh, weapon, tokenOf(imp), [], 20);
      assert.match(textOf(card), /\+1 damage against/, "the tier against a demon");
      await until(() => imp.effects.some(e => e.getFlag(SCOPE, "legionBane")?.by === dh.uuid), "the mark on the demon");
    });

    it("Devour Soul is offered when a creature the hunter struck drops to 0 nearby, and its button heals and gives a demon's Hatred", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Devour", { level: 11, weapons: ["Short warglaive"], abilities: { dex: 16, wis: 14 } });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equipFirst(dh);
      await dh.update({ "system.health.value": 1 });
      await attackWithRiders(dh, weapon, tokenOf(imp), [], 20);
      await until(() => (dh.getFlag(SCOPE, "devourStruck")?.uuids ?? []).length, "the struck record");
      const offered = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "dhOffer" && m.flags?.[SCOPE]?.holder === dh.uuid);
      await imp.update({ "system.health.value": 0 });
      const [offer] = await offered;
      made.push(offer);
      const { release } = await pressCard(offer, '[data-action="devourSoul"]');
      try {
        // Tier 3 at level 11: 2 x 3 + Wisdom +2 = 8, from 1 Health.
        await until(() => dh.system.health.value === Math.min(dh.system.health.max, 9), "8 Health regained");
        await until(() => hatredOf(dh).value === 2, "2 Hatred for a demon's soul");
        await until(() => imp.getFlag(SCOPE, "soulDevoured") === true, "the soul marked taken");
      } finally {
        await release();
      }
    });

    it("Fel Surge is paid from the Hatred held before the cast and the cast's own gain comes after (C64 (d))", async function () {
      this.timeout(180000);
      // Eye Beam (tier 2, an Action, damage and a Reflex Test): a spell that goes off with nothing set up first.
      // Spellsunder was the first choice and is refused with nothing to end (*finds no spell of tier 1 or lower*),
      // which is its own rule and no part of Fel Surge's order.
      const dh = await hunterWith("ZZ DH Surge", { level: 5, spells: ["Eye Beam"] });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 700, y: 500, side: "hostile" }]);
      await setEnergy(dh, 10);
      await setHatred(dh, 5);
      // Paid first: 5 - 1 = 4, then 4 + (1 + tier 2) capped at 5 = 5. Gained first would be 5 (capped) - 1 = 4.
      const card = await castFromSheet(dh, "Eye Beam", { targets: [tokenOf(foe)], face: 20, lines: ["fel-surge-dc-1"] });
      assert.ok(card, "the cast posted its card");
      await until(() => hatredOf(dh).value === 5, "the surge paid before the cast's gain");
      assert.match(textOf(card), /\+1 Spell DC/, "the card names the DC point");
    });

    it("Spectral Sight writes the token's sight: 30 feet, 40 at Fel 5", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Sight");
      await until(() => dh.prototypeToken.sight.range === 30 && dh.prototypeToken.sight.visionMode === "darkvision", "30 feet of darkvision");
      assert.equal(dh.prototypeToken.detectionModes?.seeInvisibility?.range, 30, "invisible creatures seen to 30 feet");
      assert.ok(dh.system.conditionImmunities.includes("blinded"), "cannot be Blinded");
      await dh.update({ "system.corruption.fel": 5 });
      await until(() => dh.prototypeToken.sight.range === 40, "40 feet at Fel 5");
    });
  });
}
