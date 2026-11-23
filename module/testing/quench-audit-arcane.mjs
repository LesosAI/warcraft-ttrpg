/**
 * **THE CLASS TALENT AUDIT'S MAGE, WARLOCK AND DRUID, LIVE** (D-1890 to D-1899; the lead,
 * 2026-11-22: *"Build these changes and ensure all automation and any animtaions/sounds work as
 * well"*).
 *
 * The rows, the readers and their consumers' censuses are Vitest (`mage-talents.test.mjs`,
 * `warlock-talents.test.mjs`, `druid-talents.test.mjs`, the migration's). What only a world can show
 * is the real doors, and every changed feature or talent that has a control is PRESSED on the sheet
 * (the Combat tab's own `useFeature` button), never handed to the workflow:
 *
 * - 02's Evocation (once a Long Rest, a Full Action), Time Warp (once an encounter);
 * - 04's Arcane Power (no action, the tier on every spell's own type), Overchannel Mastery and
 *   Overchanneller per point, Clearcasting's free points laid on an Overchannelled success;
 * - 02's Drain (no action, once a turn, half the damage back), Curse's 6 and Ritual of Summoning's
 *   stamp; 04's Dark Pact (the demon's Health into the Warlock's Mana), Shadowfury (Health paid, a
 *   Body Test whose failure Stuns);
 * - 02's Regrowth (twice the tier plus the casting modifier), Hurricane (a Reflex Test, half on a
 *   pass, Slowed on a failure), Hibernate (the rest window asked before the use is struck).
 *
 * Every creature is a `ZZ` fixture, deleted in `after`. Written in the class pass; not run there (the
 * live pass runs it alone through `QUENCH_BATCH=azeroth-rpg.audit-arcane`).
 */

import { cleanup, made, makeCharacter, openSheet, pinDie, restDialogFor, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { DRAIN_STATE_FLAG } from "../rules/warlock-drain.mjs";
import { NEXT_SPELL_FLAG, overchannelPointMana } from "../rules/casting.mjs";

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

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const bondOf = actor => actor?.getFlag?.("azeroth-rpg", "bond") ?? null;

/** A character of a class at a level, these talents taken, waiting for what each grants. */
async function characterWith(name, cls, { level = 9, ranks = {}, spells = [], abilities = { int: 16, wis: 16, cha: 16 } } = {}) {
  const actor = await makeCharacter({ name, classes: [[cls, level]], spells, abilities });
  for (const [talent, rank] of Object.entries(ranks)) {
    const t = await until(() => talentNamed(actor, talent), `${talent} on the sheet`);
    await t.update({ "system.taken": rank });
  }
  for (const [talent, rank] of Object.entries(ranks)) await until(() => talentNamed(actor, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
  await settle();
  return actor;
}

/** Set a pool to a value. */
async function setPool(actor, name, value) {
  const pool = poolOf(actor, name);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value });
  await until(() => poolOf(actor, name).value === value, `${value} ${name}`);
}

/**
 * **PRESS THE SHEET'S OWN USE** for a feature: the Combat tab's `useFeature` button, the die pinned,
 * and the card it posts (or null where the press made none within the wait).
 */
async function press(actor, featureName, { face = 18, ms = 20000 } = {}) {
  const item = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  try {
    const control = await until(() => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`), `${featureName}'s Use drawn`);
    // `untilHook` resolves the hook's arguments, so the message is the first.
    const posted = untilHook("createChatMessage", ms, m => m.flags?.["azeroth-rpg"]?.itemId === item.id).then(([m]) => m).catch(() => null);
    control.click();
    const card = await posted;
    if (card) made.push(card);
    return card;
  } finally {
    unpin();
    await sheet.close().catch(() => {});
  }
}

/** The chooser a feature opened, once rendered. */
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

export function auditArcaneBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The class talent audit's Mage, Warlock and Druid (D-1890 to D-1899)", function () {
    let restore = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(180000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.element?.id?.startsWith("azeroth-roll-") || app.element?.id?.startsWith("azeroth-choose-") || app.element?.id?.startsWith("azeroth-rest-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await cleanup();
    });

    /* ---- the Mage ---- */

    it("02's Evocation: pressed, it restores half the Mana and is struck for the Long Rest, a Full Action (C2)", async function () {
      this.timeout(60000);
      const mage = await characterWith("ZZ Arcane Evoker", "Mage", { level: 3 });
      const item = await until(() => featureNamed(mage, "Evocation"), "Evocation granted");
      assert.equal(item.system.action, "full", "Evocation is not a Full Action");
      assert.equal(item.system.uses?.per, "long", "Evocation does not count a Long Rest");
      await setPool(mage, "mana", 0);
      const max = poolOf(mage, "mana").max;
      await press(mage, "Evocation");
      await until(() => poolOf(mage, "mana").value === Math.floor(max / 2), "half the Mana restored");
      assert.equal(featureNamed(mage, "Evocation").system.uses.value, 0, "the use was not struck");
    });

    it("02's Time Warp counts an encounter now (C4)", async function () {
      this.timeout(60000);
      const mage = await characterWith("ZZ Arcane Warper", "Mage", { level: 17 });
      const item = await until(() => featureNamed(mage, "Time Warp"), "Time Warp granted");
      assert.equal(item.system.uses?.per, "encounter");
    });

    it("04's Arcane Power: pressed, it costs no action and 4 Mana, and lays the tier on every spell's type until the turn ends", async function () {
      this.timeout(60000);
      const mage = await characterWith("ZZ Arcane Powered", "Mage", { level: 9, ranks: { "Arcane Missiles": 1, "Arcane Power": 1 } });
      await setPool(mage, "mana", 10);
      const card = await press(mage, "Arcane Power");
      assert.ok(card, "Arcane Power posted no card");
      await until(() => poolOf(mage, "mana").value === 6, "the 4 Mana paid");
      const effect = await until(() => mage.effects.find(e => e.getFlag("azeroth-rpg", "talentBuff") === "Arcane Power"), "the state laid");
      const change = (effect.system?.changes ?? []).find(c => c.key === "system.damageBonus.spell.all");
      assert.equal(Number(change?.value), mage.system.tier, "the change is not the mage's tier");
      assert.isUndefined((effect.system?.changes ?? []).find(c => String(c.key).includes(".typed.")), "a second Arcane amount was laid");
    });

    it("02's Overchannel Mastery with 04's Overchanneller: each point costs the tier in Mana less the rank, never below 1 (C3)", async function () {
      this.timeout(60000);
      const mage = await characterWith("ZZ Arcane Channeller", "Mage", { level: 9, ranks: { Overchanneller: 2, Fireball: 1 } });
      assert.ok(featureNamed(mage, "Overchannel Mastery"), "Overchannel Mastery not held at level 9");
      const fireball = await until(() => spellNamed(mage, "Fireball"), "Fireball known");
      await setPool(mage, "mana", 30);
      const health = mage.system.health.value;
      const unpin = pinDie(18);
      try {
        const card = await game.system.azeroth.workflows.castSpell({ actor: mage, spell: fireball, targets: [], overchannel: 2 });
        if (card) made.push(card);
      } finally { unpin(); }
      const per = overchannelPointMana(fireball.system.tier, 2);
      await until(() => poolOf(mage, "mana").value === 30 - (fireball.system.mana ?? 0) - 2 * per, "the Mana paid per point");
      assert.equal(mage.system.health.value, health, "Overchannel Mastery took Health");
    });

    it("04's Clearcasting: an Overchannelled success lays free points on the next spell, before the end of the next turn", async function () {
      this.timeout(60000);
      const mage = await characterWith("ZZ Arcane Clear", "Mage", { level: 3, ranks: { Overchanneller: 1, Clearcasting: 2, Fireball: 1 } });
      const fireball = await until(() => spellNamed(mage, "Fireball"), "Fireball known");
      await setPool(mage, "mana", poolOf(mage, "mana").max);
      const unpin = pinDie(20);
      try {
        const card = await game.system.azeroth.workflows.castSpell({ actor: mage, spell: fireball, targets: [], overchannel: 1 });
        if (card) made.push(card);
      } finally { unpin(); }
      const entry = await until(() => (mage.getFlag("azeroth-rpg", NEXT_SPELL_FLAG) ?? []).find(e => e?.source === "clearcasting"), "Clearcasting's promise laid");
      assert.equal(entry.overchannel, 2, "the free points are not the rank");
      assert.equal(entry.through, "nextTurn");
    });

    /* ---- the Warlock ---- */

    it("02's Drain: pressed, it costs no action and 4 Mana, lays the state, and refuses a second press this turn in words", async function () {
      this.timeout(60000);
      const warlock = await characterWith("ZZ Arcane Drainer", "Warlock", { level: 5 });
      const item = await until(() => featureNamed(warlock, "Drain"), "Drain granted");
      assert.isNull(item.system.action ?? null, "Drain still costs an action");
      await setPool(warlock, "mana", 10);
      await press(warlock, "Drain");
      await until(() => warlock.effects.some(e => e.getFlag("azeroth-rpg", DRAIN_STATE_FLAG)), "the Drain state laid");
      await until(() => poolOf(warlock, "mana").value === 6, "the 4 Mana paid");
      let second = null;
      const said = await warnings(async () => { second = await game.system.azeroth.workflows.useFeature({ actor: warlock, item: featureNamed(warlock, "Drain") }); });
      assert.isNull(second, "a second Drain was made in one turn");
      assert.include(said.join(" "), game.i18n.format("AZEROTH.Drain.Standing", { name: "Drain" }));
      assert.equal(poolOf(warlock, "mana").value, 6, "the refused Drain spent Mana");
    });

    it("02's Curse costs 6 on its success, and Ritual of Summoning is DC 20 once a Long Rest (C5)", async function () {
      this.timeout(60000);
      const warlock = await characterWith("ZZ Arcane Ritualist", "Warlock", { level: 20 });
      const curse = await until(() => featureNamed(warlock, "Curse"), "Curse granted");
      assert.equal(curse.system.cost?.amount, 6);
      const ritual = await until(() => featureNamed(warlock, "Ritual of Summoning"), "Ritual granted");
      assert.equal(ritual.system.dc, 20);
      assert.equal(ritual.system.uses?.per, "long");
    });

    it("04's Dark Pact: pressed, the Bound Demon loses twice the tier, never below 1, and the Warlock gains that Mana", async function () {
      this.timeout(120000);
      const warlock = await characterWith("ZZ Arcane Pact", "Warlock", { level: 9, ranks: { "Dark Pact": 1 } });
      const bound = await until(() => featureNamed(warlock, "Bound Demon"), "Bound Demon held");
      await setPool(warlock, "mana", poolOf(warlock, "mana").max);
      const summoned = game.system.azeroth.workflows.useFeature({ actor: warlock, item: bound });
      await pickOne(bound, "Imp");
      const summonCard = await summoned;
      if (summonCard) made.push(summonCard);
      const demon = await until(() => game.actors.find(a => bondOf(a)?.ownerUuid === warlock.uuid && bondOf(a)?.kind === "demon"), "the Imp bound");
      made.push(demon);
      await setPool(warlock, "mana", 0);
      const before = demon.system.health.value;
      const loss = Math.min(2 * warlock.system.tier, before - 1);
      await press(warlock, "Dark Pact");
      await until(() => demon.system.health.value === before - loss, "the demon's Health drawn");
      await until(() => poolOf(warlock, "mana").value === loss, "the Mana gained");
      assert.equal(featureNamed(warlock, "Dark Pact").system.uses.value, 0, "the Short Rest's use was not struck");
    });

    it("04's Shadowfury: pressed, it pays twice the tier in Health, and its card asks a Body Test whose failure Stuns", async function () {
      this.timeout(60000);
      const warlock = await characterWith("ZZ Arcane Fury", "Warlock", { level: 17, ranks: { "Chaos Bolt": 1, Shadowfury: 1 } });
      const health = warlock.system.health.value;
      const card = await press(warlock, "Shadowfury");
      assert.ok(card, "Shadowfury posted no card");
      await until(() => warlock.system.health.value === health - 2 * warlock.system.tier, "the Health paid");
      const fails = card.flags?.["azeroth-rpg"]?.onFailInflicts ?? [];
      assert.deepEqual(fails.map(f => [f.condition, f.until]), [["stunned", "targetTurnEnd"]]);
      assert.equal(featureNamed(warlock, "Shadowfury").system.uses.value, 0, "the Short Rest's use was not struck");
    });

    /* ---- the Druid ---- */

    it("02's Regrowth: pressed, it restores twice the tier plus the casting modifier, for 2 Mana", async function () {
      this.timeout(60000);
      const druid = await characterWith("ZZ Arcane Grower", "Druid", { level: 5 });
      await setPool(druid, "mana", 10);
      const card = await press(druid, "Regrowth");
      assert.ok(card, "Regrowth posted no card");
      assert.equal(card.flags?.["azeroth-rpg"]?.heal, 2 * druid.system.tier + (druid.system.castingMod ?? 0));
      await until(() => poolOf(druid, "mana").value === 8, "the 2 Mana paid");
    });

    it("02's Hurricane: pressed, its card asks a Reflex Test, halves on a pass and Slows on a failure (C10)", async function () {
      this.timeout(60000);
      const druid = await characterWith("ZZ Arcane Storm", "Druid", { level: 9 });
      await setPool(druid, "mana", 10);
      const card = await press(druid, "Hurricane");
      assert.ok(card, "Hurricane posted no card");
      const f = card.flags?.["azeroth-rpg"] ?? {};
      assert.isTrue(f.halfOnPass === true, "Hurricane takes no half on a passed Test");
      assert.deepEqual((f.onFailInflicts ?? []).map(i => i.condition), ["slowed"]);
    });

    it("02's Hibernate: pressed, it asks for the rest window first, and a dismissed window strikes no use (C7)", async function () {
      this.timeout(60000);
      const druid = await characterWith("ZZ Arcane Sleeper", "Druid", { level: 17 });
      const item = await until(() => featureNamed(druid, "Hibernate"), "Hibernate granted");
      assert.equal(item.system.uses?.per, "long");
      const sheet = await openSheet(druid);
      try {
        const control = await until(() => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`), "Hibernate's Use drawn");
        control.click();
        const window = await restDialogFor(druid, 8000);
        assert.ok(window, "Hibernate opened no rest window");
        await window.close();
      } finally { await sheet.close().catch(() => {}); }
      await settle();
      assert.equal(featureNamed(druid, "Hibernate").system.uses.value, 1, "a dismissed rest struck Hibernate's use");
    });
  });
}
