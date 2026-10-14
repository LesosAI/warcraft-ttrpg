/**
 * **THE CREATURE'S SPELLS TAB** (D-705).
 *
 * 14's `**Spells** (DC n)` run was one paragraph of inline Cast buttons wedged
 * into the Statistics tab, with 07's entry on each name's tooltip: what a spell
 * DID was readable only on hover, and a spell item a GM dropped on a creature
 * was drawn nowhere at all. This batch is the live layer over the tab that
 * replaced it.
 *
 * Every test goes through the SHEET — a rendered control, a real click, a real
 * drop — because a context field and a registered handler both pass a unit test
 * while the tab does nothing at all (D-681). Two shapes no static test can see:
 *
 *  - **Every `data-action` the tab renders is registered.** An unregistered
 *    action is a silent no-op in ApplicationV2, and `module/actions.test.mjs`
 *    cannot see a branch a template renders conditionally — `endSustain` is
 *    drawn only on a row that is sustaining, so this batch makes one sustain.
 *  - **A floor-Power creature actually spends** (A2). `poolSnapshot` and
 *    `updatePool` both read the STORED `power.max`, which 123 of the 164
 *    creatures leave null; a spell given to one of them cast for free while the
 *    sheet drew `4 / 4` beside it, because `#pool()` had taken the derived
 *    maximum since D-637 and the write door had not.
 */

import { cleanup, forgeDrop, fromPack, made, makeNpc, openSheet, pinDie, settle, PACK_FOR } from "./fixtures.mjs";
// A pool's count is an input on an editable sheet (2026-09-13), so the reader
// is shared rather than copied into every test that asserts on it.
import { poolCount } from "./expectations.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

/** Wait for a condition, the way every other batch does. */
const until = async (fn, what, ms = 5000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** The creature's sheet, open on the Spells tab, with the tab's section element. */
async function spellTab(actor) {
  const sheet = await openSheet(actor);
  await sheet.changeTab("spells", "primary");
  await settle();
  const tab = sheet.element.querySelector('section[data-tab="spells"]');
  if (!tab) throw new Error("the NPC sheet rendered no Spells tab");
  return { sheet, tab };
}

/** The tab strip, in the order it is drawn. */
const tabIds = sheet => [...sheet.element.querySelectorAll("nav.sheet-tabs a[data-tab]")].map(a => a.dataset.tab);

/** The rendered rows, in document order, whatever kind they are. */
const rowsOf = tab => [...tab.querySelectorAll("li.azeroth-spell")];

export function creatureSpellsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("A creature's Spells tab (D-705)", function () {
    let priorSetting;
    before(async function () {
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(90000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor.name === "AzerothNpcSheet") await app.close();
      }
      await cleanup();
    });

    /* ---- the tab is drawn where the block casts, and only there ------------- */

    it("is a THIRD tab on a caster and absent on a creature that casts nothing (D-639)", async function () {
      this.timeout(60000);
      const caster = await makeNpc("Adept of the Schools");
      assert.isNotEmpty(caster.system.spells.names, "the fixture casts nothing, so this proves nothing");
      const { sheet } = await spellTab(caster);
      assert.deepEqual(tabIds(sheet), ["statistics", "traits", "spells", "gear", "notes"],
        `the caster's tab strip reads ${tabIds(sheet).join(", ")}`);
      const label = sheet.element.querySelector('nav.sheet-tabs a[data-tab="spells"]').textContent.trim();
      assert.equal(label, game.i18n.localize("AZEROTH.NpcTab.spells"),
        "the Spells tab draws no label, so its lang key is missing");

      const kobold = await makeNpc("Kobold");
      assert.isEmpty(kobold.system.spells.names, "the Kobold casts something now");
      assert.isNull(kobold.system.spells.dc, "the Kobold carries a Spell DC now");
      const plain = await openSheet(kobold);
      assert.deepEqual(tabIds(plain), ["statistics", "traits", "gear", "notes"],
        `a non-caster's tab strip reads ${tabIds(plain).join(", ")}`);
      assert.isNull(plain.element.querySelector('section[data-tab="spells"]'),
        "the Spells part rendered on a creature with no tab to show it");
    });

    /* ---- every control on it is wired --------------------------------------- */

    it("REGISTERS EVERY ACTION IT RENDERS - an unregistered one is a silent no-op", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Adept of the Schools");
      // A given spell (so the star, open and delete controls are drawn) and a
      // Sustain in progress (so `endSustain` is drawn at all): both branches
      // are conditional, which is exactly what the static audit cannot see.
      const frostbolt = await fromPack(PACK_FOR.spell, "Frostbolt");
      await actor.createEmbeddedDocuments("Item", [frostbolt.toObject()]);
      const first = await fromPack(PACK_FOR.spell, actor.system.spells.names[0]);
      await actor.setFlag("azeroth-rpg", "sustaining", [{ spellId: null, uuid: first.uuid, name: first.name, itemId: null }]);

      const { sheet, tab } = await spellTab(actor);
      const actions = [...new Set([...tab.querySelectorAll("[data-action]")].map(el => el.dataset.action))];
      const missing = actions.filter(a => typeof sheet.options.actions?.[a] !== "function");
      assert.deepEqual(missing, [], `the tab renders ${missing.join(", ")} and the sheet registers no handler`);
      for (const wanted of ["castSpell", "expandItem", "endSustain", "browseItems", "openItem", "deleteItem", "toggleFavorite"]) {
        assert.include(actions, wanted, `the tab draws no ${wanted} control`);
      }
      await actor.unsetFlag("azeroth-rpg", "sustaining");
    });

    /* ---- the rows say what the pack says ------------------------------------ */

    it("lists 14's own names BY TIER ASCENDING, with 07's school and Mana on each row", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Adept of the Schools");
      const names = actor.system.spells.names;
      const { tab } = await spellTab(actor);

      const rows = rowsOf(tab);
      assert.lengthOf(rows, names.length, `the block names ${names.length} spells and the tab drew ${rows.length} rows`);
      // Grouped, and the groups climb.
      const tiers = [...tab.querySelectorAll("h3.azeroth-tier-heading")].map(h => Number(h.dataset.tier));
      assert.isNotEmpty(tiers, "the tab drew no tier heading");
      assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b), `the tier headings read ${tiers.join(", ")}`);
      // The counts beside the headings add up to the rows.
      const counts = [...tab.querySelectorAll("h3.azeroth-tier-heading .azeroth-school-count")].map(s => Number(s.textContent));
      assert.equal(counts.reduce((a, b) => a + b, 0), rows.length, "a heading's count disagrees with its list");

      // Every row against 07's own entry, read out of the pack rather than
      // out of a constant: the chip is the LOCALISED school and the Mana is
      // the pack's number.
      for (const name of names) {
        const row = rows.find(li => li.dataset.name === name);
        assert.ok(row, `${name} has no row (the tab draws ${rows.map(r => r.dataset.name).join(", ")})`);
        const doc = await fromPack(PACK_FOR.spell, name);
        assert.equal(row.querySelector(".azeroth-spell-school").textContent.trim(),
          game.i18n.localize(CONFIG.AZEROTH.schools[doc.system.school]), `${name}'s chip is not its school`);
        assert.equal(row.querySelector(".azeroth-spell-mana").textContent.trim(),
          String(doc.system.mana), `${name}'s Mana is not 07's`);
        assert.ok(row.closest("ol").previousElementSibling.dataset.tier === String(doc.system.tier),
          `${name} is listed under the wrong tier`);
      }
    });

    /* ---- and the Statistics tab no longer does ------------------------------ */

    it("TAKES THE SPELLS LINE OFF THE STATISTICS TAB - one surface, not two", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Adept of the Schools");
      const sheet = await openSheet(actor);
      const statistics = sheet.element.querySelector('section[data-tab="statistics"]');
      assert.ok(statistics, "no Statistics tab");
      assert.lengthOf(statistics.querySelectorAll('[data-action="castSpell"]'), 0,
        "the old inline Cast buttons are still on the Statistics tab");
      // Both pools are still drawn there, through the shared partial (D-509).
      assert.lengthOf(statistics.querySelectorAll(".azeroth-pool"), 2,
        "the Statistics tab stopped drawing both pools");
    });

    /* ---- the header ---------------------------------------------------------- */

    it("prints the block's Spell DC and Power in the header", async function () {
      this.timeout(60000);
      const actor = await makeNpc("High Inquisitor Whitemane");
      const { tab } = await spellTab(actor);
      const header = tab.querySelector(".azeroth-spells-header");
      assert.ok(header, "the tab drew no header");
      const dc = [...header.querySelectorAll("dt")].find(dt => dt.textContent.trim() === game.i18n.localize("AZEROTH.Sheet.SpellDC"));
      assert.ok(dc, "the header prints no Spell DC");
      assert.equal(dc.nextElementSibling.textContent.trim(), String(actor.system.spells.dc),
        "the header's Spell DC is not the block's");
      // A creature's Power IS its Mana (D-647), through the SAME partial the
      // Statistics tab draws, so the two can never print different numbers.
      const count = poolCount(header);
      assert.equal(count, `${actor.system.power.value} / ${actor.system.powerMax}`, `the header's pool reads "${count}"`);
      const known = [...header.querySelectorAll("dt")].find(dt => dt.textContent.trim() === game.i18n.localize("AZEROTH.Sheet.SpellsKnown"));
      assert.equal(known.nextElementSibling.textContent.trim(), String(actor.system.spells.names.length),
        "the header's count is not the number of rows");
    });

    /* ---- the name opens what the entry says --------------------------------- */

    it("opens 07's OWN ENTRY under the row - what the spell does, before it is cast", async function () {
      this.timeout(60000);
      const actor = await makeNpc("Adept of the Schools");
      const name = actor.system.spells.names[0];
      const { sheet, tab } = await spellTab(actor);
      const row = rowsOf(tab).find(li => li.dataset.name === name);
      const detail = row.querySelector(".azeroth-item-detail");
      assert.ok(detail, "the row carries no detail to open");
      assert.isTrue(detail.hidden, "the detail is open before anything was clicked");
      row.querySelector('[data-action="expandItem"]').click();
      await settle();
      assert.isFalse(sheet.element.querySelector(`li.azeroth-spell[data-name="${name}"] .azeroth-item-detail`).hidden,
        "clicking the name opened nothing");
      // The entry's own effect text, not the field list alone.
      const doc = await fromPack(PACK_FOR.spell, name);
      const words = String(doc.system.effect ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
      assert.isNotEmpty(words, `${name} carries no effect text, so this proves nothing`);
      const prose = detail.querySelector(".azeroth-item-prose")?.textContent.replace(/\s+/g, " ") ?? "";
      assert.include(prose, words, "the detail does not carry the pack entry's effect");
    });

    /* ---- casting from the row ------------------------------------------------ */

    it("CASTS from the row: a card naming the spell, and the creature's Power falls", async function () {
      this.timeout(60000);
      const actor = await makeNpc("High Inquisitor Whitemane");
      const name = actor.system.spells.names[0];
      const doc = await fromPack(PACK_FOR.spell, name);
      assert.isAbove(doc.system.mana ?? 0, 0, `${name} costs no Mana, so this proves nothing`);
      const { tab } = await spellTab(actor);
      const cast = rowsOf(tab).find(li => li.dataset.name === name).querySelector('[data-action="castSpell"]');
      assert.ok(cast, `${name}'s row draws no Cast button`);
      assert.isNotOk(cast.disabled, "a spell 07 holds drew a disabled Cast");
      const before = { power: actor.system.power.value, messages: game.messages.size };
      const unpin = pinDie(15);
      try {
        cast.click();
        await until(() => game.messages.size > before.messages, "the Casting Test's card");
        const card = [...game.messages].at(-1);
        made.push(card);
        assert.include(card.content, name, "the click cast something other than the row's spell");
        await until(() => actor.system.power.value === before.power - doc.system.mana, "the Mana to come off her Power");
      } finally {
        unpin();
      }
    });

    /* ---- a spell a GM dropped on a creature ---------------------------------- */

    it("LISTS A DROPPED SPELL, marks it Given, spends the FLOOR Power (A2), and goes when it goes", async function () {
      this.timeout(90000);
      const actor = await makeNpc("Kobold");
      assert.isNull(actor.system.power.max, "the Kobold's block states a Power, so the floor proves nothing");
      assert.isAbove(actor.system.powerMax, 0, "the Kobold derives no floor Power at all");
      const sheet = await openSheet(actor);
      assert.notInclude(tabIds(sheet), "spells", "the Kobold already has a Spells tab");

      // Dropped, not embedded by hand: the door a GM uses.
      const frostbolt = await fromPack(PACK_FOR.spell, "Frostbolt");
      forgeDrop(sheet.element, { type: "Item", uuid: frostbolt.uuid });
      await until(() => actor.items.find(i => i.name === "Frostbolt"), "the spell to land on the creature");
      const item = actor.items.find(i => i.name === "Frostbolt");
      await sheet.render();
      await settle();
      assert.include(tabIds(sheet), "spells", "a spell landed on the creature and no tab appeared");

      await sheet.changeTab("spells", "primary");
      await settle();
      const tab = sheet.element.querySelector('section[data-tab="spells"]');
      const row = tab.querySelector(`li.azeroth-spell[data-item-id="${item.id}"]`);
      assert.ok(row, "the dropped spell is on the creature and not on its Spells tab");
      // A WORD, never a tint alone (D5).
      assert.include(row.textContent, game.i18n.localize("AZEROTH.Sheet.GivenSpell"),
        "the given spell carries no mark saying so");

      // A2: the floor Power stands FULL and is spendable. Read off the stored
      // `power.max` alone, `updatePool` skipped and the cast spent nothing;
      // read off the stored `power.value` alone the pool stood at 0 and the
      // cast was refused for want of Mana against a pool the sheet drew `0 / 4`.
      const mana = item.system.mana ?? 0;
      assert.isAbove(mana, 0, "Frostbolt costs no Mana, so the spend proves nothing");
      assert.equal(actor.system.power.value, actor.system.powerMax,
        "a creature whose block states no Power does not stand at its floor");
      const before = { power: actor.system.power.value, messages: game.messages.size };
      const unpin = pinDie(15);
      try {
        row.querySelector('[data-action="castSpell"]').click();
        await until(() => game.messages.size > before.messages, "the Casting Test's card");
        made.push([...game.messages].at(-1));
        await until(() => actor.system.power.value === before.power - mana, "the Kobold's floor Power to be spent");
      } finally {
        unpin();
      }
      assert.equal(actor.system.power.value, actor.system.powerMax - mana,
        "a creature with no stored Power spent nothing at all");

      // And deleting it takes the tab with it.
      await item.delete();
      await until(() => !actor.items.find(i => i.name === "Frostbolt"), "the spell to leave");
      await sheet.render();
      await settle();
      assert.notInclude(tabIds(sheet), "spells", "the last spell left and the tab stayed");
      assert.isNull(sheet.element.querySelector('section[data-tab="spells"]'),
        "the Spells part outlived the tab that named it");
    });
  });
}
