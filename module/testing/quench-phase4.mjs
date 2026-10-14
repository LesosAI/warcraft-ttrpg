/**
 * Phase 4 batch: the editing surface. Ranks bought and set; XP granted and
 * ledgered; talent points from level; the Spells tab; conditions toggled
 * and stepped; effects toggled; derived thresholds listed. Every one a
 * click or a form write, read back off the actor.
 */

import { cleanup, settle, untilHook, firstFromPack, makeCharacter, makeNpc, openSheet, useAction, PACK_FOR } from "./fixtures.mjs";
import { AZEROTH } from "../config.mjs";

const shift = () => new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true });
const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

export function editingBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The editing surface", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    // ---- ranks and XP ------------------------------------------------------------
    it("Buy on a skill spends the Rank's cost, raises the Rank and writes the ledger (02 SS8)", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Edit Buyer", classes: [["Warrior", 5]], xp: { earned: 100, spent: 0 } });
      const sheet = await openSheet(actor);
      try {
        const buy = sheet.element.querySelector('[data-action="buyRank"][data-skill="athletics"]');
        assert.ok(buy, "no Buy button on Athletics");
        assert.isFunction(sheet.options.actions.buyRank, "buyRank is not registered");
        const inCareer = (actor.careerItem?.system?.inCareer ?? []).includes("athletics");
        const cost = 10 * 1 * (inCareer ? 1 : 2);
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        click(buy);
        await wait;
        assert.equal(actor.getFlag("azeroth-rpg", "skillRanks")?.athletics, 1, "the Rank did not rise");
        assert.equal(actor.system.xp.spent, cost, `Rank 1 costs ${cost} XP`);
        const ledger = actor.getFlag("azeroth-rpg", "xpLedger") ?? [];
        assert.equal(ledger.length, 1, "no ledger entry");
        assert.equal(ledger[0].amount, cost);
      } finally {
        await sheet.close();
      }
    });

    it("Buy refuses when the purse is short, and the rank input writes the flag", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Edit Short", classes: [["Warrior", 5]], xp: { earned: 5, spent: 0 } });
      const sheet = await openSheet(actor);
      try {
        const buy = sheet.element.querySelector('[data-action="buyRank"][data-skill="stealth"]');
        assert.ok(buy, "no Buy button on Stealth");
        click(buy);
        await new Promise(r => setTimeout(r, 300));
        assert.notOk(actor.getFlag("azeroth-rpg", "skillRanks")?.stealth, "a Rank was bought with 5 XP");
        assert.equal(actor.system.xp.spent, 0);

        const input = sheet.element.querySelector('input[name="flags.azeroth-rpg.skillRanks.stealth"]');
        assert.ok(input, "the Rank is not an input");
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        input.value = "4";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(actor.getFlag("azeroth-rpg", "skillRanks")?.stealth, 4, "the rank input did not write");
        await settle();
        const row = sheet.element.querySelector('.azeroth-skill input[name="flags.azeroth-rpg.skillRanks.stealth"]')?.closest(".azeroth-skill");
        assert.include(row?.querySelector(".azeroth-skill-total")?.textContent ?? "", String(actor.system.abilities.dex.mod + actor.system.proficiency + 4).replace(/^(\d)/, "+$1"), "the total does not read the new Rank");
      } finally {
        await sheet.close();
      }
    });

    it("Grant XP raises the purse for the GM, and talent points are one a level (02 SS9)", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Edit Granted", classes: [["Warrior", 7]] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        const grant = sheet.element.querySelector('[data-action="grantXP"]');
        assert.ok(grant, "no Grant XP control for the GM");
        assert.isFunction(sheet.options.actions.grantXP, "grantXP is not registered");
        const amount = grant.parentElement.querySelector("input.azeroth-grant");
        amount.value = "150";
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        click(grant);
        await wait;
        assert.equal(actor.system.xp.earned, 150);
        await settle();
        const points = sheet.element.querySelector(".azeroth-talent-points strong")?.textContent;
        assert.equal(Number(points), 7, "a level-7 character has seven talent points to spend");
      } finally {
        await sheet.close();
      }
    });

    // ---- the Spells tab -----------------------------------------------------------------
    it("the Spells tab lists known spells by tier, the school on the row, and Cast posts a card", async function () {
      this.timeout(40000);
      const fire1 = await firstFromPack(PACK_FOR.spell, d => d.system.school === "fire" && d.system.tier === 1);
      const fire2 = await firstFromPack(PACK_FOR.spell, d => d.system.school === "fire" && d.system.tier === 2);
      const frost1 = await firstFromPack(PACK_FOR.spell, d => d.system.school === "frost" && d.system.tier === 1);
      const actor = await makeCharacter({ name: "ZZ Edit Caster", classes: [["Mage", 5]], spells: [fire2.name, frost1.name, fire1.name] });
      const pool = actor.system.powers.find(p => p.name === "mana");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const sheet = await openSheet(actor);
      try {
        assert.include(sheet.constructor.WIDE_TABS, "spells", "the Spells tab is not wide");
        sheet.changeTab("spells", "primary");
        await settle();
        // D-614: a heading per tier, ascending; within a tier the character's
        // own school order, the school a chip on the row.
        const headings = [...sheet.element.querySelectorAll(".azeroth-tier-heading")].map(h => h.dataset.tier);
        assert.deepEqual(headings, ["1", "2"], "tiers are not the headings, ascending");
        const tier1 = [...sheet.element.querySelectorAll('.azeroth-tier-heading[data-tier="1"] + .azeroth-spell-list .azeroth-spell')]
          .map(r => r.querySelector(".azeroth-spell-school").className.match(/is-([a-z]+)/)?.[1]);
        assert.deepEqual(tier1, ["fire", "frost"], "tier 1 is not in the character's own school order");
        const tier2 = [...sheet.element.querySelectorAll('.azeroth-tier-heading[data-tier="2"] + .azeroth-spell-list .azeroth-spell')];
        assert.lengthOf(tier2, 1);
        assert.include(tier2[0].querySelector(".azeroth-spell-school").className, "is-fire");
        assert.isNull(sheet.element.querySelector(".azeroth-skills:not([hidden])"), "the Skills column is still shown on a wide tab");

        const cast = sheet.element.querySelector(`.azeroth-spell[data-item-id] [data-action="castSpell"]`);
        assert.ok(cast, "no Cast button on a spell row");
        assert.isFunction(sheet.options.actions.castSpell, "castSpell is not registered on the character sheet");
        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
        cast.dispatchEvent(shift());
        const [message] = await wait;
        assert.equal(message.getFlag("azeroth-rpg", "kind"), "spell");

        const add = useAction(sheet, "browseSpells");
        assert.ok(add.el && add.registered, "no Add a spell door");
      } finally {
        await sheet.close();
      }
    });

    // ---- conditions and effects ----------------------------------------------------------
    it("the conditions strip toggles a status, and the stepper writes Poisoned's value (A1)", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Edit Poisoned", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        // SCOPED TO THE CORE PANEL. The Overview strip carries the SAME action
        // and the same `data-condition` on its clear control (2026-09-20) and
        // its part is rendered BEFORE `core` in the PARTS map, so an unscoped
        // query would return the strip's × for any condition that is already
        // on - the shape D-748 names.
        const toggle = sheet.element.querySelector('section[data-tab="core"] [data-action="toggleCondition"][data-condition="prone"]');
        assert.ok(toggle, "no Prone toggle on the Core tab");
        assert.isFunction(sheet.options.actions.toggleCondition, "toggleCondition is not registered");
        let wait = untilHook("createActiveEffect", 5000, e => e.parent?.id === actor.id);
        click(toggle);
        await wait;
        assert.isTrue(actor.statuses.has("prone"), "Prone did not apply");

        await settle();
        const plus = sheet.element.querySelector('[data-action="stepCondition"][data-condition="poisoned"][data-delta="1"]');
        assert.ok(plus, "no Poisoned stepper");
        wait = untilHook("createActiveEffect", 5000, e => e.parent?.id === actor.id);
        click(plus);
        await wait;
        assert.isTrue(actor.statuses.has("poisoned"), "Poisoned did not apply on the first step");
        await settle();
        const again = sheet.element.querySelector('[data-action="stepCondition"][data-condition="poisoned"][data-delta="1"]');
        wait = untilHook("updateActiveEffect", 5000, e => e.parent?.id === actor.id);
        click(again);
        await wait;
        const effect = actor.effects.find(e => e.statuses?.has("poisoned"));
        assert.equal(effect?.getFlag("azeroth-rpg", "value"), 2, "the second step did not write Poisoned 2");

        // Down to zero removes it.
        await settle();
        for (let i = 0; i < 2; i++) {
          const minus = sheet.element.querySelector('[data-action="stepCondition"][data-condition="poisoned"][data-delta="-1"]');
          assert.ok(minus && !minus.disabled, "no enabled minus on an active Poisoned");
          const w = i === 1 ? untilHook("deleteActiveEffect", 5000, e => e.parent?.id === actor.id) : untilHook("updateActiveEffect", 5000, e => e.parent?.id === actor.id);
          click(minus);
          await w;
          await settle();
        }
        assert.isFalse(actor.statuses.has("poisoned"), "stepping to 0 did not shed Poisoned");
      } finally {
        await sheet.close();
      }
    });

    it("an effect row toggles the effect off and on, and a crossed threshold is listed, derived", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Edit Effects", classes: [["Warrior", 5]], corruption: { fel: 11 } });
      await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Blessing", img: "icons/svg/aura.svg" }]);
      const sheet = await openSheet(actor);
      try {
        const row = sheet.element.querySelector('.azeroth-effect[data-effect-id]');
        assert.ok(row, "the effect is not listed");
        const toggle = row.querySelector('[data-action="toggleEffect"]');
        assert.isFunction(sheet.options.actions.toggleEffect, "toggleEffect is not registered");
        const wait = untilHook("updateActiveEffect", 5000, e => e.parent?.id === actor.id);
        click(toggle);
        await wait;
        const effect = actor.effects.get(row.dataset.effectId);
        assert.isTrue(effect.disabled, "the effect was not disabled");

        const thresholds = [...sheet.element.querySelectorAll(".azeroth-threshold-row")];
        assert.equal(thresholds.length, 2, "Fel 11 has crossed 5 and 10: two rows, derived");
        assert.include(thresholds[0].textContent, "5");
        assert.include(thresholds[1].textContent, "10");
        assert.equal(actor.effects.filter(e => e.getFlag("azeroth-rpg", "threshold")).length, 0, "a threshold became a document (D-596)");
      } finally {
        await sheet.close();
      }
    });

    it("the NPC sheet carries the same strip", async function () {
      this.timeout(30000);
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      try {
        sheet.changeTab("traits", "primary");
        await settle();
        const toggle = sheet.element.querySelector('[data-action="toggleCondition"][data-condition="slowed"]');
        assert.ok(toggle, "no conditions strip on the NPC sheet");
        assert.isFunction(sheet.options.actions.toggleCondition, "toggleCondition is not registered on the NPC sheet");
        const wait = untilHook("createActiveEffect", 5000, e => e.parent?.id === npc.id);
        click(toggle);
        await wait;
        assert.isTrue(npc.statuses.has("slowed"));
        assert.equal(Object.keys(AZEROTH.conditions).length, sheet.element.querySelectorAll(".azeroth-condition").length, "not every condition is on the strip");
      } finally {
        await sheet.close();
      }
    });
  });
}
