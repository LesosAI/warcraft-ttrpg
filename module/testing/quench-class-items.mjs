/**
 * **THE CLASS ITEMS' READERS, THROUGH THE REAL CONTROLS** (CLASS-ITEMS-AND-ENCHANTS-2026-11 phase 3;
 * D-2156 to D-2162). Every case presses what a player presses - the sheet's Use, a Signature's own
 * press on the Combat tab, the attack dialog, a card's button, the one chooser - and reads what the
 * door wrote. Setup goes through public doors (a fixture is a GM's macro); the thing under test never
 * does. The d20 is pinned through `fixtures.mjs#pinDie`.
 *
 * Written in phase 3 and run in phase 5:
 * `QUENCH_BATCH=azeroth-rpg.class-items npx playwright test tests/e2e/smoke.spec.mjs`.
 */

import { KNOWN, PACK_FOR, cleanup, dialogFor, fromPack, give, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { conditionValueOf } from "../effects/legendary-doors.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { answerAsk, castFromSheet, chooser, featureNamed, fightWith, freshTurn, pick, pressCard, sceneWith, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { attackFrom, hunterWith, pressBoard } from "./quench-witch-hunter-common.mjs";
import { pickState } from "../canvas/place.mjs";
import { capacityOf, hordeActorsOf } from "../effects/necromancer-horde.mjs";
import { inscribeRunes, spendRunesOn } from "../documents/runes.mjs";
import { tomeOf } from "../effects/witch-hunter-tome.mjs";
import { TOME_TYPES_FLAG } from "../rules/signatures.mjs";
import { DRUST_STUDIED_FLAG } from "../rules/witch-hunter-standing.mjs";
import { AURA_ENDS_FLAG } from "../rules/auras.mjs";
import { AZEROTH } from "../config.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const poolOf = (actor, name) => (actor.poolSnapshot?.() ?? []).find(p => p.name === name) ?? null;
const itemNamed = (actor, name) => actor.items.find(i => i.name === name) ?? null;

/** Put an owned item on (or off) through the write the sheet's own control makes, and wait for it. */
async function setWorn(actor, name, on = true, extra = {}) {
  const item = await until(() => itemNamed(actor, name), `${name} carried`);
  await item.update({ "system.equipped": on, ...extra });
  await until(() => actor.items.get(item.id)?.system?.equipped === on, `${name} ${on ? "on" : "off"}`);
  await settle();
  return actor.items.get(item.id);
}

/** A pool filled by a GM's hand, under the named `hand` door where one is needed. */
async function fill(actor, name, value) {
  const pool = await until(() => poolOf(actor, name), `the ${name} pool`);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: Math.min(value, pool.max) }, {},
    { essenceGain: "hand", tributeGain: "hand", vitaeGain: "hand", hatredGain: "hand", runicGain: "hand" });
  await until(() => poolOf(actor, name)?.value === Math.min(value, pool.max), `${name} set`);
}

/**
 * **PRESS A SIGNATURE'S OWN BUTTON** on the Combat tab's Signatures panel (`templates/actor/combat.hbs`,
 * `data-action="useSignature"` with the run's `data-press`), the roll dialog skipped and the die pinned.
 * Answers `{card, said}`: the card the press posted (or null) and the warnings it said.
 */
async function pressSignature(actor, item, press, { targets = [], face = 15, ms = 20000 } = {}) {
  if (canvas?.scene || targets.length) canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const selector = `section[data-tab="combat"] .azeroth-signatures [data-item-id="${item.id}"] [data-action="useSignature"]${press ? `[data-press="${press}"]` : ":not([data-press])"}`;
  const control = await until(() => sheet.element.querySelector(selector), `${item.name}'s ${press ?? "Use"} drawn`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "signature")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  let card = null;
  const said = await warnings(async () => {
    control.click();
    card = await posted;
  });
  unpin();
  canvas.tokens?.setTargets([]);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  await sheet.close();
  return { card, said };
}

/**
 * **CAST FROM THE SHEET, ANSWERING EACH CHOOSER IN TURN** (the horde batch's own shape): the Spells tab's Cast,
 * the roll dialog skipped, the die pinned, each `steps` entry answering one chooser the cast opens.
 */
async function castWith(actor, spellName, steps = [], { face = 19, ms = 40000 } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  if (!control) throw new Error(`the sheet draws no Cast for ${spellName}`);
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    for (const step of steps) {
      await step(await chooser(spell, 15000));
      await sleep(150);
    }
    return await posted;
  } finally {
    unpin();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/**
 * **THE ATTACK DIALOG'S RIDER LINE** (`templates/dialog/roll-test.hbs`'s `rider-<identifier>`, D-770): the
 * Combat tab's attack opened with the dialog set to always, the line's label read, the dialog closed.
 * `quench-witch-hunter-common.mjs#readLines` reads the situational lines alone, never a rider.
 */
async function riderLine(actor, weapon, identifier, targets = []) {
  const sheet = await openSheet(actor);
  canvas.tokens.setTargets(targets.map(t => t.id));
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    const control = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`);
    if (!control) throw new Error(`the Combat tab draws no attack for ${weapon.name}`);
    control.click();
    const dialog = await dialogFor(actor, 8000);
    if (!dialog) throw new Error("the attack dialog did not open");
    const box = dialog.element.querySelector(`input[name="rider-${identifier}"]`);
    const label = box?.closest("label") ?? null;
    const line = label ? { text: label.textContent.replace(/\s+/g, " ").trim(), price: label.querySelector(".azeroth-dialog-cost")?.textContent?.trim() ?? "", disabled: box.disabled } : null;
    await dialog.close();
    return line;
  } finally {
    canvas.tokens.setTargets([]);
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** A press's uses left, read off the item as stored. */
const pressLeft = (actor, item, press) => actor.items.get(item.id)?.system?.signatureEffect?.presses?.[press]?.uses?.value ?? null;

/* -------------------------------------------- */

export function classItemsBatch(context) {
  const { describe, it, after, assert } = context;

  describe("the class items' readers at the real controls (CLASS-ITEMS-AND-ENCHANTS-2026-11 phase 3)", function () {
    after(async function () {
      this.timeout(120000);
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Step 0: the phase 2 review's fixes ---- */

    it("THE VESTMENTS: both creatures two Raise Dead casts make carry +1 attack Damage Rating, and an unequip takes it off", async function () {
      this.timeout(300000);
      const necro = await makeCharacter({ name: "ZZ CI Vestments", classes: [["Necromancer", 5]], race: "Human", armor: ["Vestments of the Cult of the Damned"], abilities: { int: 16, con: 14 } });
      await until(() => ["Raise Dead"].every(s => necro.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
      await setWorn(necro, "Vestments of the Cult of the Damned", true);
      const a = await makeNpc("Bandit");
      const b = await makeNpc("Bandit");
      for (const [c, n] of [[a, "ZZ CI Corpse A"], [b, "ZZ CI Corpse B"]]) await c.update({ name: n, "prototypeToken.name": n, "system.health.value": 0 });
      await sceneWith([{ actor: necro, x: 300, y: 600 }, { actor: a, x: 500, y: 600, side: "hostile" }, { actor: b, x: 500, y: 800, side: "hostile" }]);
      for (const who of ["ZZ CI Corpse A", "ZZ CI Corpse B"]) {
        await fill(necro, "mana", 99);
        const card = await castWith(necro, "Raise Dead", [app => pick(app, who)]);
        assert.ok(card?.flags?.[SCOPE]?.success, `Raise Dead was cast on ${who}`);
      }
      const plusOne = x => x.effects.some(e => e.origin === necro.uuid && (e.system?.changes ?? []).some(c => c.key === "system.damageBonus" && Number(c.value) === 1));
      await until(() => hordeActorsOf(necro).length >= 2, "two raises made their dead", 60000);
      for (const x of hordeActorsOf(necro)) await until(() => plusOne(x), `${x.name} carries the Vestments' +1`, 20000);
      // The equip door re-syncs the bound (`AzerothActor#_onUpdateDescendantDocuments` over `equipResyncs`).
      await setWorn(necro, "Vestments of the Cult of the Damned", false);
      for (const x of hordeActorsOf(necro)) await until(() => !plusOne(x), `${x.name} loses the +1 with the robes off`, 20000);
      await setWorn(necro, "Vestments of the Cult of the Damned", true);
      for (const x of hordeActorsOf(necro)) await until(() => plusOne(x), `${x.name} takes the +1 back`, 20000);
    });

    it("A BY-TIER AUGMENT: the Gear row's Equip tooltip prints the tier's bonus, never null", async function () {
      this.timeout(120000);
      const champion = await makeCharacter({ name: "ZZ CI Heart Row", classes: [["Chromatic Champion", 5]], race: "Chromatic Outcast" });
      await give(champion, "Heart of the Brood");
      const sheet = await openSheet(champion);
      sheet.changeTab("gear", "primary");
      await settle();
      const heart = itemNamed(champion, "Heart of the Brood");
      const tips = [...sheet.element.querySelectorAll(`[data-item-id="${heart.id}"] [data-tooltip]`)].map(e => e.dataset.tooltip ?? "");
      await sheet.close();
      assert.ok(tips.length, "the row draws a tooltip");
      assert.isFalse(tips.some(t => /null/.test(t)), `a tooltip prints null: ${tips.join(" | ")}`);
    });

    /* ---- A: featurePatch ---- */

    it("OATHBREAKER'S PLATE: Death Strike names the plate on its chip while it is worn, and drops it when it comes off", async function () {
      this.timeout(120000);
      const knight = await makeCharacter({ name: "ZZ CI Plate", classes: [["Death Knight", 5]], race: "Human", armor: ["Oathbreaker's Plate"] });
      const strike = await until(() => featureNamed(knight, "Death Strike"), "Death Strike granted");
      assert.notInclude(strike.system.modifiedBy ?? [], "Oathbreaker's Plate", "the chip stood before the plate was worn");
      await setWorn(knight, "Oathbreaker's Plate", true);
      await until(() => (featureNamed(knight, "Death Strike")?.system?.modifiedBy ?? []).includes("Oathbreaker's Plate"), "the plate's name on Death Strike's chip");
      await setWorn(knight, "Oathbreaker's Plate", false);
      await until(() => !(featureNamed(knight, "Death Strike")?.system?.modifiedBy ?? []).includes("Oathbreaker's Plate"), "the chip gone with the plate");
    });

    it("OATHBREAKER'S PLATE: a Death Strike hit heals 2 more than 02's cap while the plate is worn", async function () {
      // The phase 3 review's thin case, strengthened in phase 5: the HEALED number, not the chip. 02: *you
      // regain Health equal to the damage you took since the start of your last turn, up to 4 plus twice your
      // tier* (8 at tier 2); 08 §20: *regains 2 additional Health whenever Death Strike restores their Health*.
      this.timeout(240000);
      const knight = await makeCharacter({ name: "ZZ CI Plate Heal", classes: [["Death Knight", 5]], race: "Human", armor: ["Oathbreaker's Plate"], weapons: ["Greatsword"], abilities: { str: 16, cha: 16, con: 14 } });
      await setWorn(knight, "Oathbreaker's Plate", true);
      const sword = await setWorn(knight, "Greatsword", true, { "system.rarity": "rare" });
      await until(() => (knight.system?.runes?.slots ?? 0) > 0, "the greatsword's rune slots");
      const row = knight.system.runes.weapons[0];
      await inscribeRunes(knight, knight.items.get(row.itemId), { blood: Math.ceil(row.slots / 2), frost: Math.floor(row.slots / 2), grip: row.grip ?? null });
      await until(() => knight.system.runes.value === row.slots, "every slot inscribed");
      const foe = await makeNpc("Kobold");
      await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
      const max = knight.system.health.max;
      assert.isAbove(max, 12, "the knight can take 12");
      // A new character starts below its maximum (the phase 5 run: 10 of 23), so fill it first.
      await knight.update({ "system.health.value": max });
      await until(() => knight.system.health.value === max, "the knight at full Health");
      await knight.applyDamage(12, { attack: false, type: null });
      await until(() => knight.system.health.value === max - 12, "12 damage taken");
      // The attack dialog's own Death Strike line, ticked, the die pinned to a hit.
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
      const sheet = await openSheet(knight);
      const unpin = pinDie(20);
      canvas.tokens.setTargets([tokenOf(foe).id]);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === knight.id && m.flags?.[SCOPE]?.kind === "attack");
        sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${sword.id}"] [data-action="rollAttack"]`).click();
        const dialog = await dialogFor(knight, 8000);
        assert.ok(dialog, "the attack dialog opened");
        const box = dialog.element.querySelector('input[name="rider-death-strike"]');
        assert.ok(box && !box.disabled, "the Death Strike line is open");
        box.checked = true;
        // Extra Attack's second roll names its weapon (the Death Knight batch's own step).
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
      } finally {
        unpin();
        canvas.tokens.setTargets([]);
        await sheet.close();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      }
      // 8 (the cap at tier 2) plus the plate's 2: 10 of the 12.
      await until(() => knight.system.health.value === max - 2, `Death Strike healed 10 (8 and the plate's 2), at ${knight.system.health.value} of ${max}`, 20000);
    });

    it("OATHBREAKER'S PLATE, CREATED WORN: the chip lands with no equip write, and leaves when the worn plate is deleted", async function () {
      // The phase 3 review: `equipResyncs` read only an update naming `system.equipped`, so a plate
      // created already worn (a drop on its slot, the creator's kit, a macro) moved no chip.
      this.timeout(120000);
      const knight = await makeCharacter({ name: "ZZ CI Plate Created", classes: [["Death Knight", 5]], race: "Human" });
      await until(() => featureNamed(knight, "Death Strike"), "Death Strike granted");
      const data = (await fromPack(PACK_FOR.armor, "Oathbreaker's Plate")).toObject();
      data.system.equipped = true;
      const [plate] = await knight.createEmbeddedDocuments("Item", [data], { ...KNOWN });
      assert.isTrue(plate?.system?.equipped, "the plate was created worn");
      await until(() => (featureNamed(knight, "Death Strike")?.system?.modifiedBy ?? []).includes("Oathbreaker's Plate"), "the plate's name on Death Strike's chip, with no equip write");
      await plate.delete();
      await until(() => !(featureNamed(knight, "Death Strike")?.system?.modifiedBy ?? []).includes("Oathbreaker's Plate"), "the chip gone with the deleted plate");
    });

    it("HEART OF THE BROOD: Breath deals 2 more and its card names the stone; the feature wears the chip", async function () {
      this.timeout(240000);
      const champion = await makeCharacter({ name: "ZZ CI Heart", classes: [["Chromatic Champion", 5]], race: "Chromatic Outcast" });
      await champion._talentGrant;
      await give(champion, "Heart of the Brood");
      await setWorn(champion, "Heart of the Brood", true);
      await until(() => (featureNamed(champion, "Breath")?.system?.modifiedBy ?? []).includes("Heart of the Brood"), "the stone on Breath's chip");
      await fill(champion, "energy", 99);
      const front = await makeNpc("Defias Footpad");
      await sceneWith([{ actor: champion, x: 1000, y: 1000 }, { actor: front, x: 1100, y: 1000, side: "hostile" }]);
      const feature = featureNamed(champion, "Breath");
      const sheet = await openSheet(champion);
      sheet.changeTab("combat", "primary");
      await settle();
      const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`);
      assert.ok(control, "the sheet draws Breath's Use");
      const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === champion.id && m.flags?.[SCOPE]?.kind === "feature").then(([c]) => { made.push(c); return c; }).catch(() => null);
      control.click();
      // A tie asks which school; the leading branch breathes it. Either way the cone is aimed.
      const tie = await chooser(feature, 3000).catch(() => null);
      if (tie) await pick(tie, game.i18n.localize("AZEROTH.School.Fire"));
      await until(() => pickState()?.mode === "facing", "Breath's aim");
      pressBoard({ x: 1600, y: 1050 });
      const card = await posted;
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
      await sheet.close();
      assert.ok(card, "Breath posted a card");
      assert.include(card.content, "Heart of the Brood", "the card names the stone that added to the damage");
    });

    it("BLINDFOLD OF THE ILLIDARI: Spectral Sight's token sight reaches 10 feet further while worn", async function () {
      this.timeout(180000);
      const hunter = await makeCharacter({ name: "ZZ CI Blindfold", classes: [["Demon Hunter", 5]], race: "Night Elf" });
      await until(() => featureNamed(hunter, "Spectral Sight"), "Spectral Sight granted");
      await give(hunter, "Blindfold of the Illidari");
      await sceneWith([{ actor: hunter, x: 1000, y: 1000 }]);
      const range = () => tokenOf(hunter)?.document?.sight?.range ?? null;
      const base = await until(() => range(), "Spectral Sight written on the token");
      await setWorn(hunter, "Blindfold of the Illidari", true);
      await until(() => range() === base + 10, "10 feet further with the blindfold on");
      await setWorn(hunter, "Blindfold of the Illidari", false);
      await until(() => range() === base, "back with it off");
    });

    it("TWIN BLADES: the attack dialog's Fel Lash line costs 1 Hatred with a Warglaive in each hand, and 2 with one", async function () {
      this.timeout(240000);
      const hunter = await makeCharacter({ name: "ZZ CI Twin Blades", classes: [["Demon Hunter", 5]], race: "Night Elf", weapons: ["Warglaive of Azzinoth", "Warglaive of Azzinoth"] });
      const [main, off] = hunter.items.filter(i => i.type === "weapon" && i.name === "Warglaive of Azzinoth");
      await main.update({ "system.equipped": true, "system.offHand": false });
      await off.update({ "system.equipped": true, "system.offHand": true });
      await fill(hunter, "hatred", 5);
      const foe = await makeNpc("Bandit");
      await sceneWith([{ actor: hunter, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      // Fel Lash is a RIDER line (`rider-fel-lash`), priced in its own cell (the phase 5 run: the first
      // version read the situational lines, which never carry a rider).
      const paired = await riderLine(hunter, hunter.items.get(main.id), "fel-lash", [tokenOf(foe)]);
      assert.ok(paired, "the dialog draws a Fel Lash line");
      assert.match(paired.price, /\b1\b/, `with the pair, Fel Lash reads 1 Hatred: ${paired.text}`);
      await off.update({ "system.equipped": false });
      await settle();
      const single = await riderLine(hunter, hunter.items.get(main.id), "fel-lash", [tokenOf(foe)]);
      assert.ok(single, "the dialog draws a Fel Lash line with one glaive");
      assert.match(single.price, /\b2\b/, `with one, Fel Lash reads 2 Hatred: ${single.text}`);
    });

    it("SIGNET RING: Another Timeline, answered yes, gives 1 Sand beside its 2 Mana", async function () {
      this.timeout(240000);
      const { chronomancerWith } = await import("./quench-chronomancer-common.mjs");
      const c = await chronomancerWith("ZZ CI Signet", { level: 5 });
      await give(c, "Signet Ring of the Bronze Dragonflight");
      await setWorn(c, "Signet Ring of the Bronze Dragonflight", true);
      const bandit = await makeNpc("Bandit");
      await sceneWith([{ actor: c, x: 800, y: 1000 }, { actor: bandit, x: 1000, y: 1000, side: "hostile" }]);
      await fightWith([c, bandit]);
      const sand = poolOf(c, "sand").value;
      const unpin = pinDie(3);
      try {
        const rolled = game.system.azeroth.workflows.rollTest({ actor: bandit, kind: "attack", dc: 10, title: "ZZ CI Signet attack", modifiers: [] });
        await answerAsk(true);
        made.push(await rolled);
      } finally { unpin(); }
      await until(() => poolOf(c, "sand").value === Math.min(sand + 1, poolOf(c, "sand").max), "1 Sand from the Signet");
    });

    it("THE DARKFALLEN CHOKER: Royal Due is offered and paid at 1 Tribute, which 2 refused without it", async function () {
      this.timeout(240000);
      const s = await makeCharacter({ name: "ZZ CI Choker", classes: [["Sovereign", 5]], race: "San'layn", abilities: { con: 16, cha: 16, dex: 14 } });
      await until(() => featureNamed(s, "Royal Due"), "Royal Due granted");
      await give(s, "The Darkfallen Choker");
      const foe = await makeNpc("Alliance Footman");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await freshTurn(s, 2);
      await game.system.azeroth.sovereign.markPrey(s, tokenOf(foe));
      await until(() => s.preyMark?.()?.actorUuid === foe.uuid, "the prey marked");
      await fill(s, "tribute", 1);
      const { offerRoyalDue } = await import("../effects/sovereign-features.mjs");
      assert.notOk(await offerRoyalDue({ by: s, target: foe, dealt: 3, attack: true }), "1 Tribute bought Royal Due with no choker");
      await setWorn(s, "The Darkfallen Choker", true);
      const offer = await offerRoyalDue({ by: s, target: foe, dealt: 3, attack: true });
      assert.ok(offer, "the choker's Royal Due is offered at 1 Tribute");
      made.push(offer);
      await (await pressCard(offer, '[data-sovereign-offer="royalDue"]')).release();
      await until(() => poolOf(s, "tribute").value === 0, "1 Tribute paid");
    });

    /* ---- B: the other runs ---- */

    it("THE COUNCIL'S SPIRIT: refused with no spent rune on the blade, then refills one, its own use struck", async function () {
      this.timeout(240000);
      const knight = await makeCharacter({ name: "ZZ CI Council", classes: [["Death Knight", 5]], race: "Human", weapons: ["Gorefiend's Runeblade"], abilities: { str: 16, cha: 16, con: 14 } });
      const blade = await setWorn(knight, "Gorefiend's Runeblade", true);
      // `runes.slots` is what the wielded blade holds; `runes.max` counts the runes inscribed, 0 before
      // the inscription (`rules/runes.mjs#runePool`; the phase 5 run).
      await until(() => (knight.system?.runes?.slots ?? 0) === 10, "the blade's ten rune slots");
      await inscribeRunes(knight, blade, { blood: 5, frost: 5 });
      await until(() => (knight.items.get(blade.id)?.system?.runes?.slots ?? []).length === 10, "ten runes inscribed");
      const refused = await pressSignature(knight, blade, "the-councils-spirit");
      assert.isNull(refused.card, "a press with nothing to refill posted a card");
      assert.include(refused.said.join(" "), "no spent rune", "the refusal is said in words");
      assert.equal(pressLeft(knight, blade, "the-councils-spirit"), 1, "a refusal struck the use");
      await spendRunesOn(knight, { kind: "any", count: 1 });
      await until(() => knight.system.runes.value === 9, "one rune spent");
      const done = await pressSignature(knight, blade, "the-councils-spirit");
      assert.ok(done.card, "The Council's Spirit posted its card");
      await until(() => knight.system.runes.value === 10, "the spent rune refilled on the blade");
      assert.equal(pressLeft(knight, blade, "the-councils-spirit"), 0, "its own use struck, apart from the item's other runs");
    });

    it("FIRST OF THE DAMNED: Death Coil on an undead creature heals it 2 more than 07's 4", async function () {
      this.timeout(240000);
      const knight = await makeCharacter({ name: "ZZ CI Coil", classes: [["Death Knight", 5]], race: "Human", weapons: ["Gorefiend's Runeblade"], abilities: { str: 16, cha: 16, con: 14 } });
      await setWorn(knight, "Gorefiend's Runeblade", true);
      await until(() => knight.items.some(i => i.type === "spell" && i.name === "Death Coil"), "Unholy Lore's Death Coil");
      await fill(knight, "runicPower", 99);
      const ghoul = await makeNpc("Plagued Ghoul");
      await ghoul.update({ "system.health.value": 1 });
      await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const card = await castFromSheet(knight, "Death Coil", { targets: [tokenOf(ghoul)], face: 19 });
      assert.ok(card, "Death Coil was cast");
      const f = card.flags[SCOPE];
      // The spell card records the heal as a NUMBER (`flags.heal`), never `{amount}` (the phase 5 run).
      assert.equal(f.heal, 6, `the undead creature's heal is 4 plus the blade's 2 (${JSON.stringify(f.heal)})`);
      // And the Apply lands it: the ghoul at 1 regains the 6.
      const press = await pressCard(card, '[data-action="applyHealing"]');
      try {
        await until(() => (tokenOf(ghoul)?.actor ?? ghoul).system.health.value === Math.min(7, ghoul.system.health.max), "the ghoul regains 6", 20000);
      } finally { await press.release(); }
    });

    it("THE DARKMASTER'S ROD: one more horde place while held, and its aura reaches only the bearer's raised dead", async function () {
      this.timeout(300000);
      const necro = await makeCharacter({ name: "ZZ CI Rod", classes: [["Necromancer", 5]], race: "Human", weapons: ["The Darkmaster's Rod"], abilities: { int: 16, con: 14 } });
      const places = capacityOf(necro).total;
      await setWorn(necro, "The Darkmaster's Rod", true);
      await until(() => capacityOf(necro).total === places + 1, "A Larger Class's place");
      const other = await makeNpc("Bandit");
      await sceneWith([{ actor: necro, x: 1000, y: 1000 }, { actor: other, x: 1100, y: 1100, side: "friendly" }]);
      const rodAura = x => x.effects.some(e => e.flags?.[SCOPE]?.[AURA_ENDS_FLAG]?.includes?.("frightened"));
      await sleep(3000);
      assert.isFalse(rodAura(tokenOf(other).actor), "the aura reached a creature that is not the bearer's raised dead");
    });

    it("THE DARKMASTER'S ROD: a creature it raises carries the aura, and Frightened ends at the start of its turn", async function () {
      // The phase 3 review's thin case, strengthened in phase 5: raise one creature with the rod held,
      // make it Frightened, and watch The Headmaster's Discipline end it at its own turn start.
      this.timeout(300000);
      const necro = await makeCharacter({ name: "ZZ CI Rod Raise", classes: [["Necromancer", 5]], race: "Human", weapons: ["The Darkmaster's Rod"], abilities: { int: 16, con: 14 } });
      await until(() => necro.items.some(i => i.type === "spell" && i.name === "Raise Dead"), "Raise Dead");
      await setWorn(necro, "The Darkmaster's Rod", true);
      const corpse = await makeNpc("Bandit");
      await corpse.update({ name: "ZZ CI Rod Corpse", "prototypeToken.name": "ZZ CI Rod Corpse", "system.health.value": 0 });
      await sceneWith([{ actor: necro, x: 1000, y: 1000 }, { actor: corpse, x: 1100, y: 1000, side: "hostile" }]);
      await fill(necro, "mana", 99);
      const card = await castWith(necro, "Raise Dead", [app => pick(app, "ZZ CI Rod Corpse")]);
      assert.ok(card?.flags?.[SCOPE]?.success, "Raise Dead was cast");
      const raised = await until(() => hordeActorsOf(necro)[0] ?? null, "the raised creature", 60000);
      await until(() => tokenOf(raised), "the raised creature's token");
      const rodAura = x => x.effects.some(e => e.active !== false && e.flags?.[SCOPE]?.[AURA_ENDS_FLAG]?.includes?.("frightened"));
      // An aura's *allies* are the tracker's side in a fight, and out of one only the Party (D-755,
      // `distance.mjs#countsAsAlly`), so the raised creature is the Necromancer's ally once the fight puts
      // it on the same side (the phase 5 run: no aura was laid out of a fight, which is that rule).
      const fight = await fightWith([necro, raised]);
      await until(() => rodAura(raised), "the rod's aura on the raised creature", 30000);
      await raised.toggleStatusEffect("frightened", { active: true });
      await until(() => raised.statuses?.has?.("frightened"), "the raised creature Frightened");
      // A turn of the raised creature's that STARTS after the Frightened: past it first where it is current.
      if (fight.combatant?.actor?.uuid === raised.uuid) await turnForward(fight, necro);
      await turnForward(fight, raised);
      await until(() => !raised.statuses?.has?.("frightened"), "Frightened ended at the start of its turn", 30000);
    });

    it("LANA'THEL'S LAMENT: Vampiric Bite offered where the feeding is refused for the opening, The Queen's Kiss's tier added", async function () {
      this.timeout(300000);
      const s = await makeCharacter({ name: "ZZ CI Lament", classes: [["Sovereign", 5]], race: "San'layn", weapons: ["Lana'thel's Lament"], abilities: { con: 16, cha: 16, dex: 14 } });
      await setWorn(s, "Lana'thel's Lament", true);
      const blade = itemNamed(s, "Lana'thel's Lament");
      const foe = await makeNpc("Alliance Footman");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await freshTurn(s, 2);
      await fill(s, "vitae", 0);
      const sheet = await openSheet(s);
      sheet.changeTab("combat", "primary");
      await settle();
      canvas.tokens.setTargets([tokenOf(foe).id]);
      sheet.element.querySelector('section[data-tab="combat"] [data-action="feed"]').click();
      // The choice, in its own dialog: yes.
      const ask = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && /Vampiric Bite/.test(a.element?.textContent ?? "") && a.element?.querySelector('button[data-action="yes"]')), "Vampiric Bite's choice");
      ask.element.querySelector('button[data-action="yes"]').click();
      await sheet.close();
      const card = await until(() => [...game.messages].reverse().find(m => m.flags?.[SCOPE]?.feeding?.targetUuid === foe.uuid && m.flags[SCOPE].feeding.resolved !== true) ?? null, "the feeding card");
      made.push(card);
      assert.equal(pressLeft(s, blade, "vampiric-bite"), 0, "the bite's use struck after the budget");
      const press = await pressCard(card, '[data-action="resistTest"]', { face: 1 });
      try {
        // 02's feeding plus the Kiss's tier (2 at level 5).
        await until(() => poolOf(s, "vitae").value > 0, "the feeding gives Vitae");
      } finally { await press.release(); }
    });

    it("SWARMING SHADOWS: a hit on the prey lands Bleeding 2 with no button, and a second hit keeps it at 2", async function () {
      this.timeout(300000);
      const s = await makeCharacter({ name: "ZZ CI Swarming", classes: [["Sovereign", 5]], race: "San'layn", weapons: ["Lana'thel's Lament"], abilities: { con: 16, cha: 16, dex: 14 } });
      const blade = await setWorn(s, "Lana'thel's Lament", true);
      const foe = await makeNpc("Alliance Footman");
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([s, foe]);
      await freshTurn(s, 2);
      await game.system.azeroth.sovereign.markPrey(s, tokenOf(foe));
      await until(() => s.preyMark?.()?.actorUuid === foe.uuid, "the prey marked");
      const victim = () => tokenOf(foe)?.actor ?? foe;
      const bleeding = () => victim().effects.find(e => e.statuses?.has?.("bleeding"));
      await attackFrom(s, blade, [tokenOf(foe)], { face: 20 });
      await until(() => bleeding(), "Bleeding laid on the hit");
      await freshTurn(s, 2);
      await attackFrom(s, blade, [tokenOf(foe)], { face: 20 });
      await sleep(1500);
      // The value through the system's one reading (`legendary-doors.mjs#conditionValueOf`, summed over every
      // effect): one source keeps its higher value (R8), so a second hit leaves Bleeding 2 (the phase 5 run).
      assert.ok(bleeding(), "Bleeding still stands");
      assert.equal(conditionValueOf(victim(), "bleeding"), 2, "a second hit from one source keeps Bleeding at 2");
    });

    it("FLAME OF AZZINOTH: refused past its reach, then a card with a Reflex row a creature and half on a pass", async function () {
      this.timeout(300000);
      const hunter = await makeCharacter({ name: "ZZ CI Flame", classes: [["Demon Hunter", 5]], race: "Night Elf", weapons: ["Warglaive of Azzinoth"] });
      const glaive = await setWorn(hunter, "Warglaive of Azzinoth", true);
      const near = await makeNpc("Bandit");
      const by = await makeNpc("Bandit");
      const far = await makeNpc("Bandit");
      await sceneWith([{ actor: hunter, x: 600, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }, { actor: by, x: 1200, y: 1000, side: "hostile" }, { actor: far, x: 2000, y: 1000, side: "hostile" }]);
      const refused = await pressSignature(hunter, glaive, "flame-of-azzinoth", { targets: [tokenOf(far)] });
      assert.isNull(refused.card, "a creature past the throw's reach was struck");
      assert.equal(pressLeft(hunter, glaive, "flame-of-azzinoth"), 1, "a refusal struck the use");
      const { card } = await pressSignature(hunter, glaive, "flame-of-azzinoth", { targets: [tokenOf(near), tokenOf(by)] });
      assert.ok(card, "the Flame posted its card");
      const f = card.flags[SCOPE];
      assert.lengthOf(f.damageByTarget, 2, "each creature's damage, met by its own Armor Points and Ward");
      assert.isTrue(f.halfOnPass, "a passed Reflex Test halves it");
      assert.equal(card.content.match(/data-action="resistTest"/g)?.length ?? 0, 2, "a Resist row a creature");
      assert.equal(pressLeft(hunter, glaive, "flame-of-azzinoth"), 0, "its once a Short Rest struck");
    });

    it("WAYCREST SILVER: the same blow deals 2 more once the creature's type is Studied", async function () {
      this.timeout(300000);
      const hunter = await hunterWith("ZZ CI Waycrest", { level: 5, weapons: ["Waycrest Silver"], known: ["undead", "beast"], studied: [] });
      const sword = await setWorn(hunter, "Waycrest Silver", true);
      const wolf = await makeNpc("Timber Wolf");
      await sceneWith([{ actor: hunter, x: 1000, y: 1000 }, { actor: wolf, x: 1100, y: 1000, side: "hostile" }]);
      const dealt = card => card?.flags?.[SCOPE]?.damageByTarget?.[0]?.damage ?? null;
      const plain = dealt((await attackFrom(hunter, sword, [tokenOf(wolf)], { face: 15 })).card);
      await hunter.setFlag(SCOPE, "whTome", { ...hunter.getFlag(SCOPE, "whTome"), studied: ["beast"] });
      await settle();
      const studied = dealt((await attackFrom(hunter, sword, [tokenOf(wolf)], { face: 15 })).card);
      assert.ok(plain !== null && studied !== null, "both blows record their damage");
      assert.isAtLeast(studied - plain, 2, `a Studied beast took 2 more (${plain} then ${studied})`);
    });

    it("THE FIRST TOME: its two types chosen the first time it is carried, one more Studied, and The Drust Chapter learns a type", async function () {
      this.timeout(300000);
      const hunter = await hunterWith("ZZ CI First Tome", { level: 5, known: ["undead", "humanoid"], studied: ["humanoid"] });
      const book = await give(hunter, "The First Tome of Silver and Ash");
      await book.update({ "system.equipped": true });
      const app = await chooser(book, 15000);
      for (const box of app.element.querySelectorAll('input[name="choice"]')) {
        const label = box.closest("label")?.textContent?.trim() ?? "";
        box.checked = [game.i18n.localize(AZEROTH.creatureTypes.beast), game.i18n.localize(AZEROTH.creatureTypes.demon)].some(n => n && label.startsWith(n));
      }
      app.element.querySelector('button[data-action="choose"]').click();
      await until(() => (hunter.items.get(book.id)?.getFlag(SCOPE, TOME_TYPES_FLAG) ?? []).length === 2, "two types kept on the book");
      await until(() => tomeOf(hunter).known.length === 4, "the Tome's readers see the book's two");
      assert.deepEqual(hunter.getFlag(SCOPE, "whTome").known, ["undead", "humanoid"], "the book's types were written into the Tome");
      const ooze = await makeNpc("Plague Ooze");
      await sceneWith([{ actor: hunter, x: 1000, y: 1000 }, { actor: ooze, x: 1100, y: 1000, side: "hostile" }]);
      const { card } = await pressSignature(hunter, book, "the-drust-chapter", { targets: [tokenOf(ooze)] });
      assert.ok(card, "The Drust Chapter posted its card");
      await until(() => hunter.getFlag(SCOPE, "whTome").known.includes("ooze"), "the type learned through the Tome's writer");
      assert.ok(hunter.effects.some(e => e.flags?.[SCOPE]?.[DRUST_STUDIED_FLAG]?.type === "ooze"), "Studied until the encounter's end");
      assert.include(tomeOf(hunter).studied, "ooze", "the readers count it Studied");
      // The book put down takes its two types with it.
      await hunter.items.get(book.id).update({ "system.equipped": false });
      await until(() => !tomeOf(hunter).known.includes("demon"), "the book's types go with it");
    });
  });
}
