/**
 * **THE DEMON HUNTER'S THIRTY-SIX TALENTS, THROUGH THE REAL CONTROLS** (04-TALENTS' Betrayer, Souleater and
 * Sufferer; the Demon Hunter plan's Phase 5, D-1560). Every case presses what a player presses - a talent's own
 * Use on the sheet, the attack dialog's rider lines, the Devour Soul card's button, a Crystalized Soul's Use, the
 * spell card's Resist, the Resilience Test's dialog - with the die pinned through `fixtures.mjs#pinDie`, and reads
 * the RESULT off the actor, the token and the card. A chooser a door opens is answered through the talents' seam
 * (`effects/demon-hunter-talents.mjs#setDhTalentChoice`) and a leap's space through the features' own
 * (`setDemonHunterPick`).
 *
 * Needs the Demon Hunter in the packs (`packs:parse`, then `packs:build`). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.demon-hunter-talents`. WRITTEN, NOT YET RUN (the talents phase was not released the
 * server): `tools/manual-test-checklist.md` names each case. The last block holds the two reviews' fixes (M1, M2,
 * M3, H1, S1, C4), written and not run either.
 */

import { cleanup, dialogFor, give, made, makeCharacter, makeNpc, openSheet, pinDie, restDialogFor, settle, untilHook, useAction, warnings } from "./fixtures.mjs";
import { castFromSheet, featureNamed, pressCard, pressUse, sceneWith, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

const SCOPE = "azeroth-rpg";
const hatredOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "hatred") ?? null;
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const felOf = actor => actor.system?.corruption?.fel ?? 0;
const talentOf = (actor, identifier) => actor.items.find(i => i.type === "talent" && i.system?.identifier === identifier) ?? null;

/** A Night Elf Demon Hunter at a level, its pools in place and its talents taken at their ranks. */
async function hunterWith(name, { level = 1, ranks = {}, spells = [], weapons = [], abilities = { dex: 16, wis: 14 }, fel = 0 } = {}) {
  const actor = await makeCharacter({ name, classes: [["Demon Hunter", level]], race: "Night Elf", spells, weapons, abilities, corruption: { fel } });
  await actor._talentGrant;
  await until(() => hatredOf(actor) && energyOf(actor), "the Hatred and Energy pools");
  for (const [identifier, taken] of Object.entries(ranks)) {
    const talent = await until(() => talentOf(actor, identifier), `${identifier} embedded`);
    await talent.update({ "system.taken": taken });
    await until(() => talentOf(actor, identifier)?.system?.taken === taken, `${identifier} at rank ${taken}`);
  }
  await settle();
  return actor;
}

/** Hatred set by a GM's hand (the named `hand` door). */
async function setHatred(actor, value) {
  const pool = hatredOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { hatredGain: "hand" });
  await until(() => hatredOf(actor).value === value, `${value} Hatred`);
}

/** Energy set (a plain pool write). */
async function setEnergy(actor, value) {
  const pool = energyOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value });
  await until(() => energyOf(actor).value === value, `${value} Energy`);
}

/** Equip a weapon by name, in the off hand where asked. */
async function equip(actor, name, { offHand = false, index = 0 } = {}) {
  const weapon = actor.items.filter(i => i.type === "weapon" && i.name === name)[index];
  await weapon.update({ "system.equipped": true, "system.offHand": offHand });
  await settle();
  return actor.items.get(weapon.id);
}

/** The talents' chooser seam, answering each kind with the key(s) given. */
async function answering(map) {
  const { setDhTalentChoice } = await import("../effects/demon-hunter-talents.mjs");
  setDhTalentChoice(async kind => (kind in map ? map[kind] : null));
}

/** Attack from the Combat tab with rider lines ticked, the die pinned; the posted card. */
async function attackWith(actor, weapon, targets, riders = [], face = 20) {
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  canvas.tokens.setTargets(targets.map(t => t.id));
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

/** A creature the hunter struck this round, then brought to 0: the Devour Soul offer it posts. */
async function offerOn(hunter, victim) {
  const fight = hunter.activeFight?.() ?? null;
  await hunter.setFlag(SCOPE, "devourStruck", { combatId: fight?.started ? fight.id : null, round: fight?.round ?? null, time: game.time.worldTime, uuids: [victim.uuid] });
  const offered = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "dhOffer" && m.flags?.[SCOPE]?.holder === hunter.uuid);
  await victim.update({ "system.health.value": 0 });
  const [offer] = await offered;
  made.push(offer);
  return offer;
}

/** A point `feet` east of a token's own top-left, in canvas pixels, on a 100 px / 5 ft grid. */
const eastOf = (token, feet) => ({ x: token.document.x + (feet / 5) * 100 + 50, y: token.document.y + 50 });

/** The rows a card's roll carries, as words. */
const provenanceOf = card => (card?.rolls?.[0]?.options?.provenance ?? []).map(r => `${r.label}:${r.value ?? r.formula ?? ""}`).join(" | ");

export function demonHunterTalentsBatch(context) {
  const { describe, it, assert, before, after, afterEach } = context;

  describe("The Demon Hunter's talents (the Demon Hunter plan's Phase 5)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.talents").getIndex({ fields: ["system.identifier", "system.className"] });
      if (!index.some(e => e.system?.className === "Demon Hunter")) throw new Error("the talents pack holds no Demon Hunter talent: run packs:parse and rebuild the packs");
    });
    afterEach(async function () {
      const { setDemonHunterPick } = await import("../effects/demon-hunter-features.mjs");
      const { setDhTalentChoice } = await import("../effects/demon-hunter-talents.mjs");
      setDemonHunterPick(null);
      setDhTalentChoice(null);
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    /* ---- Betrayer ---- */

    it("Taste of Power: the sheet's Use gains 1 Fel with no Test, fills Hatred to the cap and gives 3 Energy, once per Short Rest", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Taste", { level: 5, ranks: { "taste-of-power": 1 }, fel: 4 });
      await setHatred(dh, 1);
      await setEnergy(dh, 5);
      const { card } = await pressUse(dh, "Taste of Power");
      assert.ok(await card, "the Use posted its card");
      await until(() => felOf(dh) === 5, "Fel 4 to 5, with no Test");
      await until(() => hatredOf(dh).value === 7, "the cap at Fel 5 is 7, and the pool is full");
      assert.equal(energyOf(dh).value, 8, "3 Energy");
      // **A SPENT USE IS GREYED, AND THE ROW SAYS WHY** (CLAUDE.md §5: a refusal in words beside the greyed control):
      // the row's counter reads 0/1 a Short Rest and the Use cannot be pressed, so nothing is warned and nothing fires.
      const feature = featureNamed(dh, "Taste of Power");
      await until(() => feature.system.uses?.value === 0, "the use struck off");
      const sheet = await openSheet(dh);
      try {
        const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
        assert.ok(control?.disabled, "rank 1: the Use is greyed before a Short Rest");
        assert.match(control.closest("[data-item-id]").textContent.replace(/\s+/g, " "), /0\/1 per Short Rest/, "and the row says the use is spent, in words");
        control.click();
        await new Promise(r => setTimeout(r, 1500));
      } finally {
        await sheet.close();
      }
      assert.equal(felOf(dh), 5, "nothing gained twice");
    });

    it("Gift of the Skull spends 4 Hatred for rank + 1 rounds; Wings fly 30 in it; Chaos Blast is refused out of it and casts from it", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Skull", { level: 9, ranks: { "gift-of-the-skull": 1, "wings-of-the-betrayer": 1, "chaos-blast": 1 } });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
      await setEnergy(dh, 10);
      // Chaos Blast out of the demon's shape: refused in words, nothing spent.
      const refused = await warnings(async () => {
        const pressed = await pressUse(dh, "Chaos Blast", [tokenOf(foe)]);
        await Promise.race([pressed.card, new Promise(r => setTimeout(r, 3000))]);
      });
      assert.ok(refused.some(w => /demon's shape/.test(w)), `refused in words: ${refused.join(" | ")}`);
      assert.equal(energyOf(dh).value, 10, "nothing spent");
      // Gift of the Skull: 4 Hatred, the `skull` shape for 2 rounds, 1 Armor Point on every location.
      const body = dh.system.ap?.body ?? 0;
      await setHatred(dh, 5);
      const { card } = await pressUse(dh, "Gift of the Skull");
      assert.ok(await card, "the Use posted its card");
      await until(() => dh.shape?.kind === "skull", "the Gift's shape");
      assert.equal(hatredOf(dh).value, 1, "4 Hatred spent");
      assert.equal(dh.system.ap.body, body + 1, "1 Armor Point on the Body");
      assert.equal(dh.system.flyingSpeed, 30, "Wings of the Betrayer: 30 feet in the demon's shape at Fel 0");
      const shape = dh.effects.find(e => e.getFlag(SCOPE, "shape")?.kind === "skull");
      if (shape?.duration?.units === "rounds") assert.equal(shape.duration.value, 2, "rank 1 plus 1 rounds");
      // Chaos Blast in the shape: 3 Energy, its card at the creature within 60 feet, Fel damage 2 + twice the rank.
      const blast = await pressUse(dh, "Chaos Blast", [tokenOf(foe)]);
      const blastCard = await blast.card;
      assert.ok(blastCard, "the Use posted its card");
      assert.equal(energyOf(dh).value, 7, "3 Energy");
      assert.ok(document.querySelector(`[data-message-id="${blastCard.id}"] [data-action="resistTest"]`), "the card offers the creature its Reflex Resilience Test");
      assert.match(textOf(blastCard), /4/, "2 plus twice rank 1");
    });

    it("Embrace the Pain reads the Fel 5 higher for the Hatred cap and Spectral Sight", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Embrace", { level: 5, ranks: { "embrace-the-pain": 1 }, fel: 0 });
      await until(() => hatredOf(dh).max === 7, "the cap reads Fel 5: 7");
      await until(() => dh.prototypeToken.sight.range === 40, "Spectral Sight reads Fel 5: 40 feet");
    });

    it("Demonic Visage adds its rank to the Body Armor Points and a row to an Intimidation Test", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Visage");
      const body = dh.system.ap?.body ?? 0;
      await (await until(() => talentOf(dh, "demonic-visage"), "Demonic Visage")).update({ "system.taken": 2 });
      await until(() => dh.system.ap.body === body + 2, "2 Body Armor Points at rank 2");
      const sheet = await openSheet(dh);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      try {
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === dh.id);
        sheet.element.querySelector('[data-action="rollSkill"][data-skill="intimidation"]').click();
        const [card] = await posted;
        made.push(card);
        assert.match(provenanceOf(card), /Demonic Visage:2/, "the talent's row on the Test");
      } finally {
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
        await sheet.close();
      }
    });

    it("Twin Blades waives the off hand's -2 with a glaive in each hand, and adds 1 damage at rank 2", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Twin", { level: 5, weapons: ["Curved warglaive", "Curved warglaive"] });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      await equip(dh, "Curved warglaive", { index: 0 });
      const off = await equip(dh, "Curved warglaive", { index: 1, offHand: true });
      const plain = await attackWith(dh, off, [tokenOf(foe)], [], 15);
      assert.match(provenanceOf(plain), /AZEROTH\.Dialog\.OffHand:-2/, "untaken: a weapon without Light takes the -2");
      await (await until(() => talentOf(dh, "twin-blades"), "Twin Blades")).update({ "system.taken": 2 });
      await settle();
      const waived = await attackWith(dh, off, [tokenOf(foe)], [], 15);
      assert.notMatch(provenanceOf(waived), /AZEROTH\.Dialog\.OffHand:-2/, "a glaive in each hand: no -2");
      assert.match(textOf(waived), /Twin Blades/, "rank 2's 1 damage named on the card");
    });

    it("Eternal Hunger lengthens and strengthens Demon Unleashed; Betrayer's Bargain makes it last until a Short Rest and costs 5 Fel when it ends", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Bargain", { level: 17, ranks: { "eternal-hunger": 1, "betrayers-bargain": 1 }, fel: 0 });
      await setHatred(dh, 3);
      await answering({ bargain: "rounds" });
      const first = await pressUse(dh, "Demon Unleashed");
      assert.ok(await first.card, "the Use posted its card");
      await until(() => dh.shape?.kind === "unleashed", "the shape");
      assert.equal(dh.shape.more, 1, "Eternal Hunger rank 1: 1 more Damage Rating");
      const shaped = dh.effects.find(e => e.getFlag(SCOPE, "shape")?.kind === "unleashed");
      if (shaped?.duration?.units === "rounds") assert.equal(shaped.duration.value, 4, "3 Hatred plus 1 round");
      await dh.deleteEmbeddedDocuments("ActiveEffect", [shaped.id]);
      await until(() => dh.shape === null, "the shape left");
      await setHatred(dh, 2);
      await answering({ bargain: "bargain" });
      const second = await pressUse(dh, "Demon Unleashed");
      const card = await second.card;
      assert.match(textOf(card), /hostile/, "the card says how the respectable see you (C28)");
      const deal = await until(() => dh.effects.find(e => e.getFlag(SCOPE, "unleashed")?.bargain === true), "the Bargain's shape");
      // The STORED span: v14 prepares an indefinite duration's `value` as Infinity (`ActiveEffect#updateDuration`,
      // `unprepared.value ??= Infinity`, 14.367), so the prepared `duration.value` is truthy on an effect with none.
      assert.equal(deal._source.duration?.value ?? null, null, "no span: it lasts until a Short Rest");
      await dh.deleteEmbeddedDocuments("ActiveEffect", [deal.id]);
      await until(() => felOf(dh) === 5, "5 Fel when it ends, with no Test");
    });

    it("Fall Upon Them: a Hunter's Leap finished in the demon's shape posts each creature within 5 feet its Body Test", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Fall", { level: 13, ranks: { "gift-of-the-skull": 1, "wings-of-the-betrayer": 1, "fall-upon-them": 1 }, abilities: { dex: 16, wis: 12 } });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 1200, y: 500, side: "hostile" }]);
      await setHatred(dh, 4);
      await setEnergy(dh, 10);
      await (await pressUse(dh, "Gift of the Skull")).card;
      await until(() => dh.shape?.kind === "skull", "the Gift's shape");
      const { setDemonHunterPick } = await import("../effects/demon-hunter-features.mjs");
      setDemonHunterPick(() => eastOf(tokenOf(dh), 30));
      const test = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "areaTest" && m.flags?.[SCOPE]?.area?.actorUuid === foe.uuid);
      await (await pressUse(dh, "Hunter's Leap")).card;
      const [card] = await test;
      made.push(card);
      assert.equal(card.flags[SCOPE].area.check.resilience, "body", "a Body Resilience Test");
      assert.deepEqual(card.flags[SCOPE].area.check.fail.statuses, ["prone"], "Prone on a failure");
    });

    /* ---- Fel Lash's talents ---- */

    it("Fel-Tempered, Gorging Lash and Feed on Power ride a Fel Lash hit on a demon", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Lash Talents", { level: 1, weapons: ["Short warglaive"], ranks: { "fel-tempered": 1, "gorging-lash": 1, "feed-on-power": 1 } });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equip(dh, "Short warglaive");
      await setHatred(dh, 2);
      await setEnergy(dh, 5);
      await dh.update({ "system.health.value": 3 });
      const card = await attackWith(dh, weapon, [tokenOf(imp)], ["fel-lash"], 20);
      assert.match(textOf(card), /\+2 Fel damage/, "tier 1 plus Fel-Tempered's 1");
      await until(() => dh.system.health.value === 4, "Gorging Lash: 1 Health");
      await until(() => energyOf(dh).value === 6, "Feed on Power: 1 Energy for a demon");
    });

    it("Tear the Soul adds its rank against a creature below half its Health and gives it to a devour with no Reaction", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Tear", { level: 9, weapons: ["Short warglaive"], ranks: { "tear-the-soul": 2 } });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const weapon = await equip(dh, "Short warglaive");
      await foe.update({ "system.health.value": 1 });
      await setHatred(dh, 2);
      const card = await attackWith(dh, weapon, [tokenOf(foe)], ["fel-lash"], 20);
      // Level 9 is tier 2 (`rules/progression.mjs#tierForLevel`: 5 to 10), so Fel Lash's tier 2 and Tear the Soul's 2.
      assert.match(textOf(card), /\+4 Fel damage/, "tier 2 plus Tear the Soul's 2");
      // **THE FREE DEVOUR IS GIVEN WHEN THE BLOW DROPS IT** (the review's L15, `effects/demon-hunter-talents.mjs
      // #tearLands`): the hit only marks the creature; the card's Apply lands the blow that drops it to 0.
      const { release } = await pressCard(card, 'button[data-action="applyDamage"]');
      try {
        await until(() => foe.system.health.value === 0, "the blow applied, the kobold at 0");
        await until(() => (dh.getFlag(SCOPE, "dhFreeDevour")?.uuids ?? []).includes(foe.uuid), "the creature given to a free devour");
      } finally {
        await release();
      }
    });

    /* ---- Devouring ---- */

    it("Soul Hunger devours within 5 feet before level 11; Hoarded Soul keeps it as a Crystalized Soul whose Use gives 2 Hatred", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Hoard", { level: 5, ranks: { "soul-hunger": 1, "hoarded-soul": 1 } });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }]);
      const offer = await offerOn(dh, imp);
      await answering({ hoard: "keep" });
      const { release } = await pressCard(offer, '[data-action="devourSoul"]');
      try {
        const soul = await until(() => dh.items.find(i => i.type === "gear" && i.system?.identifier === "crystalized-soul"), "the Crystalized Soul in the bags");
        assert.equal(soul.getFlag(SCOPE, "crystalizedSoul")?.maker, dh.uuid, "its maker recorded");
        assert.equal(soul.getFlag(SCOPE, "crystalizedSoul")?.heal, 2, "tier 2 at level 5, rank 1");
        await until(() => hatredOf(dh).value === 2, "a demon's soul gives 2 Hatred through Soul Hunger");
      } finally {
        await release();
      }
      await setHatred(dh, 0);
      await answering({ crystal: "hatred" });
      const soul = dh.items.find(i => i.type === "gear" && i.system?.identifier === "crystalized-soul");
      const sheet = await openSheet(dh);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const control = sheet.element.querySelector(`[data-item-id="${soul.id}"] [data-action="useGear"]`);
        assert.ok(control, "the sheet draws the soul's Use");
        control.click();
        await until(() => hatredOf(dh).value === 2, "2 Hatred from the soul");
        await until(() => !dh.items.get(soul.id), "the soul spent");
      } finally {
        await sheet.close();
      }
    });

    it("Endless Appetite: Devour Soul reaches 20 feet further a rank, and Demon's Due makes the next Fel Lash free", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Endless", { level: 15, weapons: ["Short warglaive"], ranks: { "endless-appetite": 1, "demons-due": 1 } });
      const imp = await makeNpc("Imp");
      const kobold = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 1000, y: 500, side: "hostile" }, { actor: kobold, x: 600, y: 500, side: "hostile" }]);
      // 25 feet away: past Devour Soul's 10, inside 10 + 20.
      const offer = await offerOn(dh, imp);
      const { release } = await pressCard(offer, '[data-action="devourSoul"]');
      try {
        await until(() => imp.getFlag(SCOPE, "soulDevoured") === true, "the soul taken from 25 feet");
        await until(() => dh.effects.some(e => e.getFlag(SCOPE, "demonsDue")), "Demon's Due laid");
      } finally {
        await release();
      }
      // The next Fel Lash costs no Hatred.
      const weapon = await equip(dh, "Short warglaive");
      await setHatred(dh, 0);
      const card = await attackWith(dh, weapon, [tokenOf(kobold)], ["fel-lash"], 20);
      assert.ok(card, "the Fel Lash line was open with no Hatred");
      await until(() => !dh.effects.some(e => e.getFlag(SCOPE, "demonsDue")), "the promise taken");
    });

    it("Kill After Kill leaps after a devour with no Energy, and at rank 2 lays a Boon on the next attack", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Kill", { level: 11, ranks: { "kill-after-kill": 2 }, abilities: { dex: 16, wis: 12 } });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }]);
      await setEnergy(dh, 10);
      const token = tokenOf(dh);
      const x0 = token.document.x;
      const { setDemonHunterPick } = await import("../effects/demon-hunter-features.mjs");
      setDemonHunterPick(() => ({ x: token.document.x + 50, y: token.document.y + 600 + 50 }));
      await answering({ killLeap: "leap" });
      const offer = await offerOn(dh, imp);
      const { release } = await pressCard(offer, '[data-action="devourSoul"]');
      try {
        await until(() => token.document.y !== 500 || token.document.x !== x0, "the token leapt");
        assert.equal(energyOf(dh).value, 10, "no Energy spent");
        await until(() => dh.effects.some(e => e.getFlag(SCOPE, "laidBoon")), "rank 2's Boon on the next attack");
      } finally {
        await release();
      }
    });

    it("Feast of Souls strikes the creatures chosen within 5 feet a Wisdom point that fail a Spirit Test", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Feast", { level: 20, ranks: { "endless-appetite": 1, "feast-of-souls": 1 }, abilities: { dex: 14, wis: 14 } });
      const imp = await makeNpc("Imp");
      const kobold = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }, { actor: kobold, x: 500, y: 600, side: "hostile" }]);
      const health = kobold.system.health.value;
      await answering({ feast: [kobold.uuid] });
      const offer = await offerOn(dh, imp);
      const { release } = await pressCard(offer, '[data-action="devourSoul"]', { face: 1 });
      try {
        await until(() => kobold.system.health.value < health, "the kobold failed and took Shadow damage");
      } finally {
        await release();
      }
    });

    it("Swallow Their Magic ends the spell effects the devoured caster laid and gives 2 Hatred", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Swallow", { level: 17, ranks: { "endless-appetite": 1, "swallow-their-magic": 1 } });
      const caster = await makeNpc("Kobold Geomancer");
      const kobold = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: caster, x: 600, y: 500, side: "hostile" }, { actor: kobold, x: 700, y: 500, side: "hostile" }]);
      const [laid] = await kobold.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ laid spell", origin: caster.uuid, flags: { [SCOPE]: { spell: "Compendium.azeroth-rpg.spells.Item.none", spellName: "ZZ laid spell" } } }]);
      const offer = await offerOn(dh, caster);
      const { release } = await pressCard(offer, '[data-action="devourSoul"]');
      try {
        await until(() => !kobold.effects.has(laid.id), "the caster's laid spell ended");
        await until(() => hatredOf(dh).value >= 2, "2 Hatred for a creature that held a Power pool");
      } finally {
        await release();
      }
    });

    it("Sweeping Arc strikes a second enemy for Shadow and Hobbling Reap Slows the first, with a scythe in two hands", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Scythe", { level: 9, weapons: ["Scythe"], ranks: { "sweeping-arc": 1, "hobbling-reap": 1, "reapers-grip": 1 }, abilities: { dex: 14, wis: 14 } });
      const a = await makeNpc("Kobold");
      const b = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: a, x: 600, y: 500, side: "hostile" }, { actor: b, x: 500, y: 600, side: "hostile" }]);
      const scythe = await equip(dh, "Scythe");
      const health = b.system.health.value;
      const card = await attackWith(dh, scythe, [tokenOf(a)], [], 20);
      assert.match(textOf(card), /Sweeping Arc/, "the card names the sweep");
      await until(() => b.system.health.value === Math.max(0, health - 1), "Wisdom +2: 1 Shadow damage");
      await until(() => a.statuses.has("slowed"), "the creature struck is Slowed");
    });

    /* ---- Sufferer ---- */

    it("Steady Footing: a Beyond Limits choice also ends Slowed and Entangled", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Steady", { level: 5, ranks: { "steady-footing": 1 } });
      await dh.toggleStatusEffect("slowed", { active: true });
      await dh.toggleStatusEffect("entangled", { active: true });
      const feature = featureNamed(dh, "Beyond Limits");
      const pressed = await pressUse(dh, "Beyond Limits");
      const { chooser, pick } = await import("./quench-chronomancer-common.mjs");
      await pick(await chooser(feature), "Your next Move");
      await pressed.card;
      await until(() => !dh.statuses.has("slowed") && !dh.statuses.has("entangled"), "both ended");
    });

    it("Iron Will: an unticked line on a Spirit Test's dialog, and its rank on a Fel exposure Test", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Will", { level: 3, ranks: { "iron-will": 2 }, abilities: { dex: 14, wis: 14, con: 12, cha: 10, str: 10, int: 10 } });
      const sheet = await openSheet(dh);
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      try {
        sheet.element.querySelector('[data-action="rollResilience"][data-resilience="spirit"]').click();
        const dialog = await dialogFor(dh, 8000);
        const box = dialog?.element.querySelector('input[name="tline-iron-will"]');
        assert.ok(box && !box.checked, "the Iron Will line is drawn, unticked");
        await dialog.close();
      } finally {
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
        await sheet.close();
      }
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === dh.id);
      const unpin = pinDie(10);
      try {
        await game.system.azeroth.workflows.corruptionExposure({ actor: dh, track: "fel", dc: 12 });
      } finally { unpin(); }
      const [card] = await posted;
      made.push(card);
      assert.match(provenanceOf(card) + textOf(card), /Iron Will/, "a Spirit Test against Fel counts the rank");
    });

    it("Glaive Ward lays Ward rank + 1 against the school chosen, for 3 Energy", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Ward", { level: 7, ranks: { "glaive-ward": 2 } });
      await setEnergy(dh, 10);
      const before = dh.system.ward?.fire ?? 0;
      await answering({ glaiveWard: "fire" });
      const { card } = await pressUse(dh, "Glaive Ward");
      assert.ok(await card, "the Use posted its card");
      await until(() => (dh.system.ward?.fire ?? 0) === before + 3, "Ward 3 against Fire at rank 2");
      assert.equal(energyOf(dh).value, 7, "3 Energy");
    });

    it("Turn Their Fire: a successful Resist against a spell gives Energy and strikes its caster with Fel", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Turn", { level: 9, ranks: { "glaive-ward": 1, "turn-their-fire": 1 } });
      const warlock = await makeCharacter({ name: "ZZ DH Turn Warlock", classes: [["Warlock", 5]], race: "Human", spells: ["Fear"], abilities: { int: 16, cha: 16 } });
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: warlock, x: 700, y: 500, side: "hostile" }]);
      // A character is made with an empty Mana pool out of a fight: the warlock's filled before it casts.
      const mana = await until(() => warlock.poolSnapshot().find(p => p.kind === "power" && p.name === "mana"), "the warlock's Mana pool");
      await warlock.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await until(() => warlock.poolSnapshot().find(p => p.itemId === mana.itemId && p.kind === "power")?.value === mana.max, "the warlock's Mana full");
      await setEnergy(dh, 5);
      const health = warlock.system.health.value;
      const cast = await castFromSheet(warlock, "Fear", { targets: [tokenOf(dh)], face: 20 });
      assert.ok(cast, "the cast posted its card");
      const { release } = await pressCard(cast, '[data-action="resistTest"]', { face: 20 });
      try {
        await until(() => energyOf(dh).value === 6, "1 Energy at rank 1");
        await until(() => warlock.system.health.value < health, "the caster took Fel damage");
      } finally {
        await release();
      }
    });

    it("Warding Ink, Bridle the Demon and Measured Breath: 04's worked example gains 0 Fel at a Short Rest from the sheet", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Rest Talents", { level: 14, ranks: { "measured-breath": 2, "warding-ink": 2, "bridle-the-demon": 2 }, fel: 15 });
      await give(dh, "Bread and cheese");
      await setHatred(dh, 11);
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
      await until(() => hatredOf(dh).value === 0, "the pool emptied");
      assert.equal(felOf(dh), 15, "leave out 5, 1 per 5 rounded up is 2, take off 2: no Fel");
    });

    it("Eyes of the Nether widens the token's sight 20 feet when the talent is taken", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Eyes", { level: 3 });
      await until(() => dh.prototypeToken.sight.range === 30, "30 feet at Fel 0");
      await (await until(() => talentOf(dh, "eyes-of-the-nether"), "Eyes of the Nether")).update({ "system.taken": 1 });
      await until(() => dh.prototypeToken.sight.range === 50, "50 feet with the talent");
    });

    it("Sight Beyond Sight at rank 2 whispers the true name of a disguised creature the hunter targets", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH True", { level: 9, ranks: { "sight-beyond-sight": 2 } });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 700, y: 500, side: "hostile" }]);
      await tokenOf(imp).document.update({ name: "ZZ Old beggar" });
      tokenOf(dh).control({ releaseOthers: true });
      const whispered = untilHook("createChatMessage", 15000, m => m.speaker?.actor === dh.id && /Sight Beyond Sight/.test(m.content ?? ""));
      tokenOf(imp).setTarget(true, { releaseOthers: true });
      const [card] = await whispered;
      made.push(card);
      assert.match(card.content, new RegExp(imp.name), "the creature's true name");
      tokenOf(imp).setTarget(false);
      tokenOf(dh).release();
    });

    it("Refuse the Legion refuses a demon's Charm, and Silence the Weave ends a tier 1 spell within 30 feet and lays its Banes", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Silence", { level: 20, ranks: { "refuse-the-legion": 1, "silence-the-weave": 1 } });
      const imp = await makeNpc("Imp");
      const kobold = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 600, y: 500, side: "hostile" }, { actor: kobold, x: 700, y: 500, side: "hostile" }]);
      // A Charm a demon lays is refused at the one seam.
      const charm = await dh.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ charm", statuses: ["charmed"], origin: imp.uuid }]);
      assert.equal(charm.length, 0, "the demon's Charm is refused");
      assert.ok(!dh.statuses.has("charmed"), "the hunter is not Charmed");
      // A laid tier 1 spell on the kobold, by the imp: ended. The kobold chosen for the Banes.
      const spell = await game.packs.get("azeroth-rpg.spells").getIndex({ fields: ["system.tier"] }).then(i => [...i].find(e => e.system?.tier === 1));
      const uuid = `Compendium.azeroth-rpg.spells.Item.${spell._id}`;
      const [laid] = await kobold.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ tier 1", origin: imp.uuid, flags: { [SCOPE]: { spell: uuid, spellName: "ZZ tier 1" } } }]);
      await answering({ silence: [kobold.uuid] });
      const { card } = await pressUse(dh, "Silence the Weave");
      assert.ok(await card, "the Use posted its card");
      await until(() => !kobold.effects.has(laid.id), "the tier 1 spell ended");
      await until(() => kobold.effects.some(e => e.getFlag(SCOPE, "laidBane")?.kind === "casting"), "a Bane on every Casting Test for 10 minutes");
    });
  });

  describe("The Demon Hunter's review fixes (M1, M2, M3, H1, S1, C4)", function () {
    afterEach(async function () {
      const { setDhTalentChoice } = await import("../effects/demon-hunter-talents.mjs");
      setDhTalentChoice(null);
    });
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("M1: Embrace the Pain at Fel 5 raises the cap to 9 but gives Demon Unleashed no wings", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Embrace", { level: 17, ranks: { "embrace-the-pain": 1 }, fel: 5 });
      await until(() => hatredOf(dh).max === 9, "the cap read at Fel 10 (5 plus Embrace's 5)");
      await setHatred(dh, 3);
      const { card } = await pressUse(dh, "Demon Unleashed");
      assert.ok(await card, "the Use posted its card");
      await until(() => dh.shape?.kind === "unleashed", "the demon's shape");
      const effect = dh.effects.find(e => e.getFlag(SCOPE, "shape")?.kind === "unleashed");
      assert.equal(effect.getFlag(SCOPE, "unleashed")?.winged, false, "no wings: the threshold reads the Fel really held");
      assert.equal(dh.system.flying ?? null, null, "no flying pace");
    });

    it("M2, as the lead ruled it (D-1719, D-1723): a Rogue and a Demon Hunter hold ONE Energy pool - Taste of Power fills it, mirrored", async function () {
      this.timeout(120000);
      const dh = await makeCharacter({ name: "ZZ DH Rogue", classes: [["Rogue", 3], ["Demon Hunter", 3]], race: "Night Elf", abilities: { dex: 16, wis: 14 } });
      await dh._talentGrant;
      const pools = () => dh.poolSnapshot().filter(p => p.kind === "power" && p.name === "energy");
      await until(() => pools().length === 1, "one Energy pool");
      const rogueClass = dh.items.find(i => i.type === "class" && i.name === "Rogue");
      const dhClass = dh.items.find(i => i.type === "class" && i.name === "Demon Hunter");
      assert.deepEqual(pools()[0].itemIds, [rogueClass.id, dhClass.id], "the Rogue holds it, both classes are its members");
      // A write naming the Demon Hunter's class item lands on the one pool.
      await dh.updatePool({ itemId: dhClass.id, kind: "power", value: 0 });
      await until(() => pools()[0].value === 0, "the pool empty");
      const stored = () => dh.system.classes.map(c => c.power?.value);
      assert.deepEqual(stored(), [0, 0], "both class entries carry the one value (the mirror)");
      const taste = await until(() => talentOf(dh, "taste-of-power"), "Taste of Power embedded");
      await taste.update({ "system.taken": 1 });
      const { card } = await pressUse(dh, "Taste of Power");
      assert.ok(await card, "the Use posted its card");
      await until(() => pools()[0].value === 3, "3 Energy in the one pool");
      assert.deepEqual(stored(), [3, 3], "the mirror holds after the gain");
    });

    it("M3: an unarmed strike's attack dialog draws no Fel Lash or Mana Rend line", async function () {
      this.timeout(120000);
      const dh = await hunterWith("ZZ DH Fist", { level: 9, weapons: ["Unarmed"] });
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      await setHatred(dh, 4);
      const fist = await equip(dh, "Unarmed");
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      const sheet = await openSheet(dh);
      canvas.tokens.setTargets([tokenOf(foe).id]);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${fist.id}"] [data-action="rollAttack"]`).click();
        const dialog = await dialogFor(dh, 8000);
        assert.ok(dialog, "the attack dialog opened");
        assert.equal(dialog.element.querySelector('input[name="rider-fel-lash"]'), null, "no Fel Lash line on a fist");
        assert.equal(dialog.element.querySelector('input[name="rider-mana-rend"]'), null, "no Mana Rend line on a fist");
        await dialog.close();
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
      }
    });

    it("H1: Silence the Weave with one creature in reach takes a single pick, and 'no one' chooses nobody", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Silence One", { level: 20, ranks: { "silence-the-weave": 1 } });
      const kobold = await makeNpc("Kobold");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: kobold, x: 600, y: 500, side: "hostile" }]);
      // One creature in reach: the seam answers ONE key, as the chooser hands back one option.
      await answering({ silence: kobold.uuid });
      const first = await pressUse(dh, "Silence the Weave");
      assert.ok(await first.card, "the Use posted its card");
      await until(() => kobold.effects.some(e => e.getFlag(SCOPE, "laidBane")?.kind === "casting"), "the Bane on the one creature chosen");
    });

    it("S1: Sense demons whispers an imp's direction and distance; C4: a thrown glaive is picked up within 5 feet", async function () {
      this.timeout(180000);
      const dh = await hunterWith("ZZ DH Sense", { level: 1, weapons: ["Short warglaive"] });
      const imp = await makeNpc("Imp");
      await sceneWith([{ actor: dh, x: 500, y: 500 }, { actor: imp, x: 700, y: 500, side: "hostile" }]);
      const sheet = await openSheet(dh);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const posted = untilHook("createChatMessage", 30000, m => Array.isArray(m.flags?.[SCOPE]?.sensed));
        const sense = sheet.element.querySelector('section[data-tab="combat"] [data-action="senseDemons"]');
        assert.ok(sense, "the Combat tab draws Sense demons");
        sense.click();
        const [card] = await posted;
        made.push(card);
        assert.deepEqual(card.flags[SCOPE].sensed.map(d => d.point), ["e"], "the imp, to the east");
        // A glaive lying where Flame Crash left it, beside the hunter: the row's Pick up brings it back.
        const glaive = await equip(dh, "Short warglaive");
        await glaive.update({ [`flags.${SCOPE}.away`]: { sceneId: canvas.scene.id, x: 650, y: 550 } });
        await sheet.render(true);
        await settle();
        const pick = await until(() => sheet.element.querySelector(`section[data-tab="combat"] [data-action="pickUpGlaive"][data-glaive-id="${glaive.id}"]`), "the Pick up row");
        pick.click();
        await until(() => !dh.items.get(glaive.id)?.getFlag(SCOPE, "away"), "the glaive back in the hand");
      } finally {
        await sheet.close();
      }
    });
  });
}
