/**
 * Phase 5 batch: the tools around the sheet. The browser's filters and search
 * as uses; the side-based tracker with its budget spends; Ward derived from
 * what is worn and taken off a spell's damage.
 */

import { cleanup, settle, untilHook, firstFromPack, made, makeCharacter, makeNpc, PACK_FOR } from "./fixtures.mjs";
import { AzerothCompendiumBrowser } from "../applications/compendium-browser.mjs";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

/** Open the browser on a category and wait for its data. */
async function openBrowser(category, filters = {}) {
  const app = await AzerothCompendiumBrowser.browse({ category, filters });
  for (let i = 0; i < 100 && !app._dataLoaded; i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return app;
}

const visible = (app, category) =>
  [...app.element.querySelectorAll(`[data-category="${category}"] li[data-uuid]:not([hidden])`)];

/**
 * The browser's filters are CHECKBOXES, not selects (the lead, 2026-09-07):
 * a reader could ask for Rare or Epic and never for both. These reach one
 * option's box, tick it, and wait.
 */
const facet = (app, category, id) =>
  app.element.querySelector(`[data-category="${category}"] [data-facet="${id}"]`);

const facetBox = (app, category, id, value) =>
  facet(app, category, id)?.querySelector(`input[data-facet-value="${value}"]`);

async function tick(box, on = true) {
  box.checked = on;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
}

/** Every option value a facet offers. */
const facetValues = (app, category, id) =>
  [...(facet(app, category, id)?.querySelectorAll("input[data-facet-value]") ?? [])].map(b => b.dataset.facetValue);

export function toolsBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The tools around the sheet", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    // ---- the browser -----------------------------------------------------------
    it("a school filter narrows the spells to that school, and unticking restores them", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const all = visible(app, "spells").length;
        assert.isAbove(all, 100, "the spells category shows fewer than the pack holds");
        const box = facetBox(app, "spells", "school", "fire");
        assert.ok(box, "no school filter inside the spells category");
        await tick(box);
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.school"] });
        const expected = index.filter(e => e.system.school === "fire").length;
        assert.equal(visible(app, "spells").length, expected, "the fire filter does not match the pack's count");
        await tick(box, false);
        assert.equal(visible(app, "spells").length, all, "unticking did not restore every spell");
      } finally {
        await app.close();
      }
    });

    it("two boxes in one facet are an OR, which a single select could never ask", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.school"] });
        const count = school => index.filter(e => e.system.school === school).length;
        await tick(facetBox(app, "spells", "school", "fire"));
        await tick(facetBox(app, "spells", "school", "frost"));
        assert.equal(visible(app, "spells").length, count("fire") + count("frost"),
          "two schools ticked did not show the union");
      } finally {
        await app.close();
      }
    });

    it("a facet counts what each option would show, against the OTHER filters", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const countOf = value => Number(
          facet(app, "spells", "school").querySelector(`li[data-value="${value}"] .azeroth-browser-facet-count`)?.textContent
        );
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.school", "system.tier"] });
        assert.equal(countOf("fire"), index.filter(e => e.system.school === "fire").length,
          "the fire count does not match the pack");

        // Narrowing by TIER must move the school counts; a count computed
        // against the whole pack would be decoration.
        await tick(facetBox(app, "spells", "tier", "1"));
        assert.equal(countOf("fire"), index.filter(e => e.system.school === "fire" && String(e.system.tier) === "1").length,
          "the school counts did not follow the tier filter");
        // A facet never counts ITSELF, or ticking one option would zero the rest.
        assert.isAbove(countOf("frost"), 0, "a facet counted against its own selection");
      } finally {
        await app.close();
      }
    });

    it("Clear all filters puts every row back", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const all = visible(app, "spells").length;
        await tick(facetBox(app, "spells", "school", "fire"));
        assert.isBelow(visible(app, "spells").length, all);
        const clear = app.element.querySelector('[data-category="spells"] [data-action="clearFilters"]');
        assert.ok(clear, "no Clear all filters button");
        assert.isFalse(clear.disabled, "Clear all is disabled while a filter is on");
        click(clear);
        await settle();
        assert.equal(visible(app, "spells").length, all, "Clear all did not restore every spell");
        assert.isFalse(facetBox(app, "spells", "school", "fire").checked, "the box stayed ticked after Clear all");
      } finally {
        await app.close();
      }
    });

    it("sorting reorders the rows, and reversing turns them round", async function () {
      this.timeout(40000);
      const app = await openBrowser("weapons");
      try {
        const names = () => visible(app, "weapons").map(li => li.querySelector(".azeroth-browser-name").textContent.trim());
        const byName = [...names()];
        assert.isAbove(byName.length, 20);
        assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)), "the default order is not by name");

        const dir = app.element.querySelector('[data-category="weapons"] [data-sort-dir]');
        assert.ok(dir, "no reverse control");
        dir.checked = true;
        dir.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        assert.deepEqual(names(), [...byName].reverse(), "reversing did not turn the list round");

        const select = app.element.querySelector('[data-category="weapons"] [data-sort-key]');
        assert.ok(select, "no sort-by control");
        assert.isTrue([...select.options].some(o => o.value === "system.cost"), "cannot sort by price");
      } finally {
        await app.close();
      }
    });

    it("a price range is typed in 08's coin and narrows by copper", async function () {
      this.timeout(40000);
      const app = await openBrowser("weapons");
      try {
        const index = await game.packs.get(PACK_FOR.weapon).getIndex({ fields: ["system.cost"] });
        const min = app.element.querySelector('[data-category="weapons"] [data-facet="cost"] [data-facet-bound="min"]');
        assert.ok(min, "no price range on the weapons category");
        // `2s` is 200 copper (D-672): the box takes the coin a shop names.
        min.value = "2s";
        min.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        const expected = index.filter(e => Number(e.system.cost) >= 200).length;
        assert.equal(visible(app, "weapons").length, expected, "the price floor did not match the pack");
      } finally {
        await app.close();
      }
    });

    it("the search matches names, an empty query shows all, and a filter and the search compose", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const all = visible(app, "spells").length;
        const input = app.element.querySelector("input[type=search]");
        assert.ok(input, "no search input");
        input.value = "fire";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 400)); // SearchFilter debounces 200ms
        const named = visible(app, "spells");
        assert.isAbove(named.length, 0, "a query for 'fire' matched nothing");
        assert.isBelow(named.length, all, "a query for 'fire' matched everything");
        assert.isTrue(named.every(li => /fire/i.test(li.querySelector(".azeroth-browser-name").textContent)), "a visible row does not match the query");

        const box = facetBox(app, "spells", "school", "frost");
        await tick(box);
        const both = visible(app, "spells");
        assert.isAtMost(both.length, named.length, "the filter did not compose with the query");

        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await tick(box, false);
        await new Promise(r => setTimeout(r, 400));
        assert.equal(visible(app, "spells").length, all, "clearing both did not restore every spell");
      } finally {
        await app.close();
      }
    });

    it("browse() opens with a filter already applied, and the box shows it ticked", async function () {
      this.timeout(40000);
      // The public contract is BY PATH; the state is keyed by filter id, and
      // `browse` translates. A caller that had to know the ids would be a
      // second list to keep in step.
      const app = await openBrowser("spells", { "system.school": "frost" });
      try {
        const box = facetBox(app, "spells", "school", "frost");
        assert.isTrue(box?.checked, "the pre-applied filter is not shown ticked");
        const expected = (await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.school"] })).filter(e => e.system.school === "frost").length;
        assert.equal(visible(app, "spells").length, expected);
      } finally {
        await app.close();
      }
    });

    it("an array filter (class access) matches spells whose list includes the class", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const values = facetValues(app, "spells", "classes");
        assert.isAbove(values.length, 0, "the class-access filter offers no choices");
        const value = values[0];
        await tick(facetBox(app, "spells", "classes", value));
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.classes"] });
        const expected = index.filter(e => (e.system.classes ?? []).includes(value)).length;
        assert.equal(visible(app, "spells").length, expected, `the ${value} filter does not match the pack`);
      } finally {
        await app.close();
      }
    });

    it("All of these and Any of these ask different questions of an array", async function () {
      this.timeout(40000);
      const app = await openBrowser("spells");
      try {
        const index = await game.packs.get(PACK_FOR.spell).getIndex({ fields: ["system.classes"] });
        const values = facetValues(app, "spells", "classes");
        // Two classes that both have spells, so neither mode is trivially empty.
        const pair = values.filter(v => index.some(e => (e.system.classes ?? []).includes(v))).slice(0, 2);
        assert.equal(pair.length, 2, "fewer than two classes hold any spell");
        for (const v of pair) await tick(facetBox(app, "spells", "classes", v));

        const any = index.filter(e => pair.some(v => (e.system.classes ?? []).includes(v))).length;
        assert.equal(visible(app, "spells").length, any, "Any of these is not the union");

        const all = facet(app, "spells", "classes").querySelector('[data-facet-mode][value="all"]');
        assert.ok(all, "no All of these control on an array filter");
        all.checked = true;
        all.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        const both = index.filter(e => pair.every(v => (e.system.classes ?? []).includes(v))).length;
        assert.equal(visible(app, "spells").length, both, "All of these is not the intersection");
      } finally {
        await app.close();
      }
    });

    it("a suit's traits reach the browser at all", async function () {
      this.timeout(40000);
      // `system.traits` was NOT indexed for armor, so a suit could be neither
      // filtered by its traits nor shown carrying any: an unindexed field
      // reads as absent rather than erroring (the lead, 2026-09-07).
      const app = await openBrowser("armor");
      try {
        const index = await game.packs.get(PACK_FOR.armor).getIndex({ fields: ["system.traits"] });
        const withTraits = index.filter(e => (e.system.traits ?? []).length);
        assert.isAbove(withTraits.length, 0, "no suit in the pack carries a trait");
        const trait = withTraits[0].system.traits[0];
        const box = facetBox(app, "armor", "traits", trait);
        assert.ok(box, `the armor traits facet does not offer ${trait}`);
        await tick(box);
        const expected = index.filter(e => (e.system.traits ?? []).includes(trait)).length;
        assert.equal(visible(app, "armor").length, expected, "the armor trait filter does not match the pack");

        // And the row SAYS it, which is the half a filter cannot show.
        const row = visible(app, "armor")[0].querySelector(".azeroth-browser-meta");
        assert.include(row?.textContent ?? "", trait, "a suit's row does not print its traits");
      } finally {
        await app.close();
      }
    });

    // ---- the tracker -----------------------------------------------------------------
    it("the tracker groups the sides with the leader first, and a spend takes a pip", async function () {
      this.timeout(60000);
      const hero = await makeCharacter({ name: "ZZ Tools Hero", classes: [["Warrior", 5]], abilities: { dex: 18 } });
      const ghoul = await makeNpc("Plagued Ghoul");
      // The block's own initiative outranks a Dex 18 hero; pin it low so the
      // party leads and the assertion is about the tracker, not the bestiary.
      await ghoul.update({ "system.initiative": 5 });
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      try {
        // The created documents come back in either order (the contents[0]
        // lesson): pick each by its actor, never by position.
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: hero.id }, { actorId: ghoul.id }]);
        const a = combat.combatants.find(c => c.actorId === hero.id);
        const b = combat.combatants.find(c => c.actorId === ghoul.id);
        await a.setSide("friendly");
        await b.setSide("hostile");
        await combat.startCombat();
        await settle();
        const who = `hero ${a.derivedInitiative} (${a.side}) vs ghoul ${b.derivedInitiative} (${b.side}); stored ${a.initiative}/${b.initiative}`;
        assert.equal(a.derivedInitiative, 14, `Dex 18 is initiative 14: ${who}`);
        assert.equal(b.derivedInitiative, 5, `the ghoul was pinned to 5: ${who}`);
        assert.equal(combat.leadingSide, "friendly", `14 leads 5: ${who}`);
        await ui.combat.render({ force: true });
        await settle();
        const el = ui.combat.element;
        assert.ok(el.querySelector(".azeroth-tracker"), "the system's tracker template is not in use (CONFIG.ui.combat)");
        const sides = [...el.querySelectorAll(".azeroth-side")].map(s => s.className.match(/azeroth-side-(\w+)/)[1]);
        assert.deepEqual(sides, [combat.leadingSide, sides[1]], "the leading side is not first");
        assert.equal(sides[0], "friendly", "Dex 18 against initiative 5 should lead");
        assert.equal(sides.length, 2);

        const row = el.querySelector(`[data-combatant-id="${a.id}"]`);
        assert.ok(row, "the hero's row is missing");
        assert.equal(row.querySelectorAll(".azeroth-pip:not(.is-spent)").length, 3, "a fresh turn shows two Half-Actions and a Reaction");
        assert.isNull(row.querySelector('[data-action="rollInitiative"]'), "initiative is never rolled (D-256)");
        const spend = row.querySelector('[data-action="spendHalf"]');
        assert.ok(spend, "no Half-Action spend on an owned row");
        const wait = untilHook("updateCombatant", 5000, c => c.id === a.id);
        click(spend);
        await wait;
        assert.equal(a.budget.halfActions, 1, "the spend did not take a Half-Action");
        await settle();
        assert.equal(ui.combat.element.querySelector(`[data-combatant-id="${a.id}"]`).querySelectorAll(".azeroth-pip.is-spent").length, 1, "the pip did not show the spend");
      } finally {
        await combat.delete().catch(() => {});
      }
    });

    it("the GM moves a combatant to the other side, and the order follows", async function () {
      this.timeout(60000);
      const hero = await makeCharacter({ name: "ZZ Tools Turncoat", classes: [["Warrior", 5]] });
      const combat = await Combat.create({});
      made.push(combat);
      await combat.activate();
      try {
        const [a] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: hero.id }]);
        await a.setSide("friendly");
        await ui.combat.render({ force: true });
        await settle();
        const toggle = ui.combat.element.querySelector(`[data-combatant-id="${a.id}"] [data-action="toggleSide"]`);
        assert.ok(toggle, "no side toggle for the GM");
        const wait = untilHook("updateCombatant", 5000, c => c.id === a.id);
        click(toggle);
        await wait;
        assert.equal(a.side, "hostile");
      } finally {
        await combat.delete().catch(() => {});
      }
    });

    // ---- Ward -----------------------------------------------------------------------
    it("Ward is derived from an equipped Ward affix and comes off a spell of that school (D-300)", async function () {
      this.timeout(60000);
      // Documents, not index entries: the affix lives on a flag.
      const cloak = (await game.packs.get("azeroth-rpg.affixes").getDocuments())
        .find(d => d.getFlag("azeroth-rpg", "affix")?.family === "ward" && d.getFlag("azeroth-rpg", "affix")?.school === "arcane");
      assert.ok(cloak, "no Arcane Ward affix in the pack");
      const target = await makeCharacter({ name: "ZZ Tools Warded", classes: [["Warrior", 5]] });
      const [worn] = await target.createEmbeddedDocuments("Item", [{ ...cloak.toObject(), system: { ...cloak.system.toObject(), equipped: true } }]);
      assert.equal(target.system.ward?.arcane, 1, "an equipped Arcane Ward affix did not derive Ward 1 (Arcane)");
      await worn.update({ "system.equipped": false });
      assert.equal(target.system.ward?.arcane, 0, "an unequipped Ward is still counted");
      await worn.update({ "system.equipped": true });

      // Documents: the index does not carry `system.damage`.
      const spell = (await game.packs.get(PACK_FOR.spell).getDocuments())
        .find(d => d.system.school === "arcane" && (d.system.damage?.rating ?? 0) >= 2);
      assert.ok(spell, "no damaging Arcane spell");
      const caster = await makeCharacter({ name: "ZZ Tools Caster", classes: [["Mage", 5]], spells: [spell.name] });
      const pool = caster.system.powers.find(p => p.name === "mana");
      await caster.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const snapshot = {
        tokenId: null, sceneId: null, actorId: target.id, name: target.name, defense: 1,
        apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: { arcane: 1 },
        immune: [], vulnerable: [], statuses: []
      };
      const real = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.001; // a natural 20
      let message;
      try {
        message = await game.system.azeroth.workflows.castSpell({ actor: caster, spell: caster.items.find(i => i.type === "spell"), targets: [snapshot] });
      } finally {
        CONFIG.Dice.randomUniform = real;
      }
      const dmg = message.getFlag("azeroth-rpg", "damageByTarget")?.[0];
      assert.ok(dmg, "no per-target damage");
      assert.equal(dmg.damage, spell.system.damage.rating - 1, "Ward 1 did not come off the spell's Rating");
      assert.equal(dmg.mitigation, 1);
    });
  });
}
