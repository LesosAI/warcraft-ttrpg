/**
 * **08 §18's ENCHANTER'S SIGNATURES, LIVE** (D-2147, D-2164 to D-2168;
 * CLASS-ITEMS-AND-ENCHANTS-2026-11 phase 4).
 *
 * Every case presses the control a player presses (CLAUDE.md §15): the Profession tab's item
 * select, a Signature row's own button and *Start project*, then the Craft Tests through the one
 * door and the item read back; Minor Speed by equipping the boots; Unholy Weapon by the Combat
 * tab's attack; Gathering through the roll dialog's own preparation.
 */

import { KNOWN, PACK_FOR, cleanup, give, made, makeCharacter, makeNpc, openSheet, pinDie, settle } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING, CRAFTING_DOWNTIME_SETTING } from "../settings.mjs";
import { freshTurn, fightWith, pressCard, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { attackFrom } from "./quench-witch-hunter-common.mjs";
import { CRAFT_PROJECT_FLAG } from "../dice/profession-workflows.mjs";
import { ENCHANTER_FLAG, ENCHANTER_SIGNATURES, WEAPON_CUT_FLAG, carriesSignature, enchanterSignatureHtml, enchanterSignatureVerdict } from "../rules/enchanter-signatures.mjs";
import { prepareRoll } from "../applications/roll-dialog.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

const SCOPE = "azeroth-rpg";
const W = () => game.system.azeroth.workflows;
const tab = sheet => sheet.element?.querySelector('section[data-tab="profession"]') ?? null;
const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const change = (el, value) => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); };
const projects = actor => actor.getFlag(SCOPE, CRAFT_PROJECT_FLAG) ?? [];
const held = (actor, identifier) => actor.items.filter(i => i.system?.identifier === identifier).reduce((n, i) => n + Number(i.system.quantity ?? 1), 0);

/** Put `count` units of a material into the actor's bags, by identifier (the professions batch's own helper). */
async function stock(actor, identifier, count) {
  const materials = await W().professionMaterials();
  const entry = materials[identifier];
  if (!entry?.uuid) throw new Error(`no material ${identifier}`);
  const data = (await fromUuid(entry.uuid)).toObject();
  delete data._id;
  data.system.quantity = count;
  const [item] = await actor.createEmbeddedDocuments("Item", [data], { ...KNOWN });
  if (!item) throw new Error(`no room for ${count} ${identifier}`);
  return item;
}

/** The first gear entry of the gear pack worn in one slot, as an owned item. */
async function wornIn(actor, slot) {
  const index = await game.packs.get(PACK_FOR.equipment).getIndex({ fields: ["system.slot", "system.rarity", "system.source"] });
  const entry = [...index].filter(e => e.system?.slot === slot && e.system?.rarity === "common" && e.system?.source?.document !== "Classic")
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!entry) throw new Error(`no ${slot} gear in the pack`);
  return give(actor, entry.name, PACK_FOR.equipment);
}

/** A descriptor written onto an owned item, as a GM's Forge or a found item carries one. */
async function carrying(item, key, extra = {}) {
  await item.update({ "system.signature": enchanterSignatureHtml(key), "system.signatureEffect": ENCHANTER_SIGNATURES[key].effect, ...extra });
  await until(() => item.parent.items.get(item.id)?.system?.signature === enchanterSignatureHtml(key), `${item.name} carries ${key}`);
  return item.parent.items.get(item.id);
}

export function enchanterSignaturesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("08 §18's Enchanter's Signatures through the real controls (phase 4)", function () {
    let dialogSetting, enforce;
    before(function () {
      dialogSetting = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      enforce = game.settings.get(SCOPE, CRAFTING_DOWNTIME_SETTING);
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, dialogSetting);
      await game.settings.set(SCOPE, CRAFTING_DOWNTIME_SETTING, enforce);
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("LAY A SIGNATURE: the Profession tab's row and Start project make one project, and the item comes back carrying Crusader", async function () {
      this.timeout(300000);
      await game.settings.set(SCOPE, CRAFTING_DOWNTIME_SETTING, false);
      const actor = await makeCharacter({ name: "ZZ ES Enchanter", classes: [["Mage", 11]], profession: "Enchanting", bags: ["Backpack"], abilities: { int: 18 } });
      await give(actor, "Enchanter's rod");
      const sword = await give(actor, "Longsword", PACK_FOR.weapon);
      // A Rare blade with room in its budget for a cost 2 Signature (a Rare spends 2 to 3).
      await sword.update({ "system.rarity": "rare", "system.budget": 0 });
      await stock(actor, "greater-magic-essence", 1);
      const sheet = await openSheet(actor);
      try {
        await sheet.showProfession({ view: "crafting" });
        const select = tab(sheet).querySelector('select[data-prof-enchant="item"]');
        assert.ok(select, "no item select on Lay an enchantment");
        change(select, sword.id);
        await until(() => tab(sheet)?.querySelector('select[data-prof-enchant="item"]')?.value === sword.id, "the sword picked");
        // A row the blade cannot take is drawn disabled, its reason beside it in words.
        const healing = tab(sheet).querySelector('[data-sig-row="healing"]');
        assert.ok(healing, "no Healing row");
        assert.isTrue(healing.querySelector('[data-action="pickEnchantSignature"]').disabled, "Healing is pressable on a weapon");
        assert.match(healing.querySelector(".azeroth-prof-refusal")?.textContent ?? "", /suit or worn thing/i, "Healing's reason is not in words");
        // Crusader: its own button, then Start project.
        const pick = tab(sheet).querySelector('[data-action="pickEnchantSignature"][data-sig-key="crusader"]');
        assert.ok(pick && !pick.disabled, "Crusader is not offered on a Rare blade with room");
        assert.match(tab(sheet).querySelector('[data-sig-row="crusader"]').textContent, /cost 2/, "the row does not print its cost");
        click(pick);
        await until(() => tab(sheet)?.querySelector('[data-action="pickEnchantSignature"][data-sig-key="crusader"]')?.getAttribute("aria-pressed") === "true", "Crusader chosen");
        const start = tab(sheet).querySelector('[data-action="layEnchantment"]');
        assert.isFalse(start.disabled, "Start project is disabled with a Signature chosen");
        click(start);
        await until(() => projects(actor).some(p => p.quality?.enchant?.signature === "crusader"), "the project stored");
      } finally {
        await sheet.close();
      }
      const project = projects(actor).find(p => p.quality?.enchant?.signature === "crusader");
      assert.equal(project.rarity, "rare", "the item's rarity is not the target's");
      assert.equal(project.tier, 3, "a Rare's Signature is not a tier 3 recipe");
      assert.equal(held(actor, "greater-magic-essence"), 0, "the Signature line's essence was not spent");
      // The Craft Tests through the one door, the die pinned.
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(20);
      try {
        for (let i = 0; i < 10 && projects(actor).some(p => p.id === project.id); i++) await W().workProject(actor, { projectId: project.id });
      } finally {
        unpin();
      }
      const laid = await until(() => (actor.items.get(sword.id)?.getFlag(SCOPE, ENCHANTER_FLAG) === "crusader" ? actor.items.get(sword.id) : null), "Crusader written on the blade");
      assert.include(laid.system.signature, "you regain Health equal to your tier", "the prose is not the row's sentence");
      assert.equal(laid.system.signatureEffect.onHit.healPerTier, 1, "the descriptor did not land");
      assert.equal(laid.system.signatureEffect.onHit.per, "round", "the once a round did not land");
      assert.equal(laid.system.budget, 2, "the budget did not take the cost");
      // A second lay on it is refused in words, with nothing spent.
      await stock(actor, "greater-magic-essence", 1);
      const again = await W().enchant(actor, { itemId: sword.id, signature: "icy-chill" });
      assert.isNull(again, "a second Signature was laid");
      assert.equal(held(actor, "greater-magic-essence"), 1, "a refused lay spent the essence");
    });

    it("A CLASSIC FIND: listed for a Signature, its affix list refused in words, and Demonslaying picked and started (O-778)", async function () {
      // The lead: *"yes, allow Signatures on Classic finds"* (D-2171). The fixture is a found Rare weapon with
      // no Signature and room for a cost 1 row, chosen off the pack; the window under test must offer it.
      this.timeout(300000);
      await game.settings.set(SCOPE, CRAFTING_DOWNTIME_SETTING, false);
      const actor = await makeCharacter({ name: "ZZ ES Find", classes: [["Mage", 11]], profession: "Enchanting", bags: ["Backpack"], abilities: { int: 18 } });
      await give(actor, "Enchanter's rod");
      const pack = game.packs.get(PACK_FOR.weapon);
      const index = await pack.getIndex({ fields: ["system.rarity", "system.source", "flags.azeroth-rpg.classic"] });
      const candidates = [...index].filter(e => e.system?.rarity === "rare" && (e.system?.source?.document === "Classic" || e.flags?.["azeroth-rpg"]?.classic))
        .sort((a, b) => a.name.localeCompare(b.name));
      let entry = null;
      for (const e of candidates) {
        const doc = await pack.getDocument(e._id);
        const data = doc.toObject();
        if (!carriesSignature(data) && enchanterSignatureVerdict({ key: "demonslaying", item: data, tier: 4 }).ok) { entry = doc; break; }
      }
      assert.ok(entry, "the weapons pack holds no found Rare with room for Demonslaying");
      const [find] = await actor.createEmbeddedDocuments("Item", [entry.toObject()], { ...KNOWN });
      await stock(actor, "greater-magic-essence", 1);
      const sheet = await openSheet(actor);
      try {
        await sheet.showProfession({ view: "crafting" });
        const select = tab(sheet).querySelector('select[data-prof-enchant="item"]');
        assert.ok([...select.options].some(o => o.value === find.id), `${find.name} is not listed on Lay an enchantment`);
        change(select, find.id);
        await until(() => tab(sheet)?.querySelector('select[data-prof-enchant="item"]')?.value === find.id, "the find picked");
        // The affix branch keeps a find out, in words.
        assert.match(tab(sheet).textContent.replace(/\s+/g, " "), /A found item takes no enchantment affix/, "the affix refusal is not said in words");
        const pick = tab(sheet).querySelector('[data-action="pickEnchantSignature"][data-sig-key="demonslaying"]');
        assert.ok(pick && !pick.disabled, "Demonslaying is not offered on the find");
        click(pick);
        await until(() => tab(sheet)?.querySelector('[data-action="pickEnchantSignature"][data-sig-key="demonslaying"]')?.getAttribute("aria-pressed") === "true", "Demonslaying chosen");
        click(tab(sheet).querySelector('[data-action="layEnchantment"]'));
        await until(() => projects(actor).some(p => p.quality?.enchant?.signature === "demonslaying" && p.quality.enchant.itemId === find.id), "the find's project stored");
      } finally {
        await sheet.close();
      }
      // One project an item (the phase 4 review): a second, on the same find, is refused with nothing spent.
      await stock(actor, "greater-magic-essence", 1);
      assert.isNull(await W().enchant(actor, { itemId: find.id, signature: "demonslaying" }), "a second project was started on the find");
      assert.equal(held(actor, "greater-magic-essence"), 1, "the refused second project spent the essence");
    });

    it("LIFESTEALING: a hit records the drain, nothing heals at the roll, and the Apply heals what the Shadow part took (D-2169)", async function () {
      // 08 §18: *the target takes 2 Shadow damage, and Ward applies. You regain Health equal to the damage it takes.*
      this.timeout(300000);
      const fighter = await makeCharacter({ name: "ZZ ES Lifesteal", classes: [["Warrior", 5]], weapons: ["Longsword"], abilities: { str: 18 } });
      const blade = await carrying(fighter.items.find(i => i.name === "Longsword"), "lifestealing", { "system.equipped": true, "system.rarity": "rare" });
      const foe = await makeNpc("Alliance Footman");
      await sceneWith([{ actor: fighter, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      // A new character starts below its maximum, so fill it first (the phase 5 run).
      await fighter.update({ "system.health.value": fighter.system.health.max });
      await until(() => fighter.system.health.value === fighter.system.health.max, "the fighter at full Health");
      await fighter.applyDamage(10, { attack: false, type: null });
      await until(() => fighter.system.health.value === fighter.system.health.max - 10, "10 damage taken");
      const before = fighter.system.health.value;
      const { card } = await attackFrom(fighter, blade, [tokenOf(foe)], { face: 20 });
      assert.ok(card, "the attack posted its card");
      const record = card.flags?.[SCOPE]?.lifesteal ?? null;
      assert.ok(record, "the card carries no Lifestealing record");
      assert.equal(record.by, fighter.uuid, "the record names someone else");
      const owed = Number(record.amounts?.[0]) || 0;
      assert.isAbove(owed, 0, "the record owes nothing on a hit at SL 2");
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(fighter.system.health.value, before, "the roll healed the bearer before the blow landed");
      const press = await pressCard(card, '[data-action="applyDamage"]');
      try {
        await until(() => fighter.system.health.value === before + owed, `the Apply healed ${owed}, at ${fighter.system.health.value}`, 20000);
      } finally { await press.release(); }
    });

    it("CRUSADER AND A PARRY: the hit's Health and its once a round come back with the hit, and a second real hit heals (O-171)", async function () {
      // 08 §18: *The first time each round you hit with it, you regain Health equal to your tier.* The lead's O-171:
      // *a hit that gains nothing spends no once*. Level 4: one roll an Attack, so one card (no Extra Attack).
      this.timeout(300000);
      const equipped = async (actor, name) => {
        const it = await until(() => actor.items.find(i => i.name === name), `${name} held`);
        await it.update({ "system.equipped": true });
        await until(() => actor.items.get(it.id)?.system?.equipped === true, `${name} equipped`);
        return actor.items.get(it.id);
      };
      const fighter = await makeCharacter({ name: "ZZ ES Crusader", classes: [["Warrior", 4]], weapons: ["Longsword"], abilities: { str: 18 } });
      const blade = await carrying(await equipped(fighter, "Longsword"), "crusader", { "system.rarity": "rare" });
      const parrier = await makeCharacter({ name: "ZZ ES Parrier", classes: [["Warrior", 4]], weapons: ["Longsword"], abilities: { str: 18 } });
      await equipped(parrier, "Longsword");
      await sceneWith([{ actor: fighter, x: 1000, y: 1000 }, { actor: parrier, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([fighter, parrier]);
      await freshTurn(fighter, 2);
      const rage = parrier.poolSnapshot().find(p => p.name === "rage");
      if (rage) {
        await parrier.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 1 });
        await until(() => parrier.poolSnapshot().find(p => p.name === "rage")?.value === 1, "the parrier's 1 Rage");
      }
      await fighter.update({ "system.health.value": fighter.system.health.max - 10 });
      await until(() => fighter.system.health.value === fighter.system.health.max - 10, "the fighter 10 below its maximum");
      const before = fighter.system.health.value;
      const heal = fighter.system.tier ?? 1;
      const { card } = await attackFrom(fighter, blade, [tokenOf(parrier)], { face: 20 });
      assert.ok(card, "the attack posted its card");
      assert.isTrue(card.rolls[0].outcome.success, "the pinned blow missed");
      await until(() => fighter.system.health.value === before + heal, `Crusader healed ${heal} at the hit (read ${fighter.system.health.value})`);
      const flags = card.flags[SCOPE];
      const healRow = (flags.momentumOnMiss ?? []).find(r => r.kind === "health" && r.actorUuid === fighter.uuid);
      assert.ok(healRow, "the card records no Health the hit gave");
      assert.equal(healRow.amount, heal, "the card records the wrong Health");
      const marks = (flags.onceOnMiss?.once ?? []).filter(k => k.startsWith("signature:"));
      assert.equal(marks.length, 1, `the card records no Crusader once-mark: ${JSON.stringify(flags.onceOnMiss)}`);
      const mine = combat.getCombatantsByActor(fighter)[0];
      assert.include(mine.getFlag(SCOPE, "round")?.once ?? [], marks[0], "the hit did not spend the once a round");
      // The Parry, pressed on the card the hit drew and pinned to hold (meet or beat the striker's total).
      const parry = new DOMParser().parseFromString(card.content, "text/html").querySelector('button[data-action="reactParry"][data-target-index="0"]');
      assert.ok(parry, "the card offers no Parry");
      const unpin = pinDie(20);
      try {
        const parried = await CARD_ACTIONS.reactParry(parry, game.messages.get(card.id));
        assert.ok(parried, "the Parry was refused");
        made.push(parried);
      } finally { unpin(); }
      await until(() => game.messages.get(card.id)?.flags?.[SCOPE]?.damageByTarget?.[0]?.withdrawn === true, "the card's row written as a miss");
      await until(() => fighter.system.health.value === before, `the withdrawn hit's Health taken back (read ${fighter.system.health.value})`);
      await until(() => !(mine.getFlag(SCOPE, "round")?.once ?? []).includes(marks[0]), "the withdrawn hit's once a round given back");
      const after = game.messages.get(card.id);
      assert.isTrue((after.flags[SCOPE].momentumWithdrawn ?? []).some(t => t.pool === "health" && t.amount === heal), "the card does not say the Health was taken back");
      // A second real hit this round: the parrier's Reaction is spent, and Crusader heals again.
      const second = await attackFrom(fighter, blade, [tokenOf(parrier)], { face: 20 });
      assert.isTrue(second.card?.rolls?.[0]?.outcome?.success === true, "the second pinned blow missed");
      await until(() => fighter.system.health.value === before + heal, `the second real hit healed ${heal} (read ${fighter.system.health.value})`);
    });

    it("MINOR SPEED: boots carrying it add 5 feet to Speed while worn, and nothing off", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ ES Speed", classes: [["Warrior", 1]], bags: ["Backpack"] });
      const boots = await carrying(await wornIn(actor, "feet"), "minor-speed");
      const before = actor.system.speed;
      await boots.update({ "system.equipped": true });
      await until(() => actor.system.speed === before + 5, `Speed ${before} + 5 with the boots on (read ${actor.system.speed})`);
      assert.isTrue((actor.system.speedParts ?? []).some(p => p.key === "grant" && p.value === 5), "Speed carries no grant part of 5");
      await boots.update({ "system.equipped": false });
      await until(() => actor.system.speed === before, "Speed back with the boots off");
    });

    it("GATHERING: gloves carrying it raise the worn-Boon line, ticked, on a Gathering Test and never a Craft Test", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ ES Gathering", classes: [["Warrior", 1]], profession: "Wilderness Survival", bags: ["Backpack"] });
      const gloves = await carrying(await wornIn(actor, "hands"), "gathering");
      await gloves.update({ "system.equipped": true });
      await settle();
      const spec = gathering => ({ kind: "profession", title: "ZZ", dc: 12, dcLocked: true, modifiers: [], skill: null, gatherSkill: gathering ? "survival" : null, gathering, targets: [] });
      const line = prepareRoll(actor, spec(true)).situational.automatic.find(l => l.id === "gearTestBoon");
      assert.ok(line, "no worn-Boon line on a Gathering Test");
      assert.isTrue(line.checked, "the line is not ticked");
      assert.equal(line.boons, 1, "the line is not one Boon");
      assert.include(line.name ?? "", gloves.name, "the line does not name the gloves");
      assert.notOk(prepareRoll(actor, spec(false)).situational.automatic.find(l => l.id === "gearTestBoon"), "a Craft Test took the Boon");
    });

    it("UNHOLY WEAPON: a hit at SL 2 lays the cut on the creature struck, and its own weapon blow then deals 2 less", async function () {
      this.timeout(300000);
      const fighter = await makeCharacter({ name: "ZZ ES Unholy", classes: [["Warrior", 5]], weapons: ["Longsword"], abilities: { str: 18 } });
      const blade = await carrying(fighter.items.find(i => i.name === "Longsword"), "unholy-weapon", { "system.equipped": true, "system.rarity": "rare" });
      const foe = await makeNpc("Alliance Footman");
      await sceneWith([{ actor: fighter, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await fightWith([fighter, foe]);
      await freshTurn(fighter, 2);
      const victim = () => tokenOf(foe)?.actor ?? foe;
      const cut = () => victim().effects.find(e => e.flags?.[SCOPE]?.[WEAPON_CUT_FLAG]);
      await attackFrom(fighter, blade, [tokenOf(foe)], { face: 20 });
      const laid = await until(() => cut(), "the cut laid on the hit", 30000);
      assert.equal(laid.flags[SCOPE][WEAPON_CUT_FLAG].amount, 2, "the cut is not 2");
      assert.ok(laid.duration?.value || laid.start?.combatant || laid.system?.duration, "the cut carries no span");
      // The footman's weapon blow on the fighter: 2 less, through the one damage door.
      const before = fighter.system.health.value;
      await fighter.applyDamage(6, { attack: true, struck: true, by: victim() });
      await until(() => fighter.system.health.value !== before, "the blow landed");
      assert.equal(before - fighter.system.health.value, 4, "the creature's weapon blow did not deal 2 less");
      // A spell from it is no weapon blow, and loses nothing.
      const mid = fighter.system.health.value;
      await fighter.applyDamage(3, { attack: true, struck: true, spell: true, by: victim() });
      await until(() => fighter.system.health.value !== mid, "the spell landed");
      assert.equal(mid - fighter.system.health.value, 3, "a spell lost the weapon cut");
    });
  });
}
