/**
 * Phase 3 batch: rolls with somewhere to be configured. Casting pays first
 * and rolls; Overchannel pays Health and stops at 1; exposure at a preset
 * DC moves a track; a Resilience Test from the rail; a Critical Injury drawn
 * from its table and suffered; Apply Damage per target; an NPC's skill; a
 * pool spent from the sheet. Every one a click or a call, read back off the
 * actor.
 */

import { cleanup, settle, untilHook, firstFromPack, makeCharacter, makeNpc, openSheet, PACK_FOR } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { dialogId } from "../applications/roll-dialog.mjs";
import { castWithDialog } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";

const shift = () => new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true });

/** Pin every d20 to one face for the duration of `fn` (see fixtures.mjs#pinDie for the mapping). */
async function withDie(face, fn) {
  const real = CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform = () => (20 - face) / 20 + 0.001;
  try { return await fn(); } finally { CONFIG.Dice.randomUniform = real; }
}

async function dialogFor(actor, ms = 4000) {
  const id = dialogId(actor);
  for (let i = 0; i < ms / 50; i++) {
    const app = foundry.applications.instances.get(id);
    if (app?.rendered && app.element?.querySelector("form")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

export function configuredRollsBatch(context) {
  const { describe, it, assert, after, before } = context;

  describe("Rolls with somewhere to be configured", function () {
    let setting;
    before(function () { setting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING); });
    after(async function () {
      this.timeout(60000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, setting);
      await cleanup();
    });

    // ---- casting ----------------------------------------------------------------
    it("casting pays the Mana first, rolls a Casting Test, and refuses below the cost (07 SS8)", async function () {
      this.timeout(40000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const source = await firstFromPack(PACK_FOR.spell, d => d.system.school === "fire" && d.system.tier === 1 && (d.system.mana ?? 0) > 0);
      assert.ok(source, "no tier-1 Fire spell with a Mana cost in the pack");
      const actor = await makeCharacter({ name: "ZZ Cfg Mage", classes: [["Mage", 5]], spells: [source.name] });
      const spell = actor.items.find(i => i.type === "spell");
      const pool = actor.system.powers.find(p => p.name === "mana");
      assert.ok(pool, "a Mage 5 holds Mana");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      const before = actor.system.powers.find(p => p.name === "mana").value;

      const message = await castWithDialog(actor, spell, shift());
      assert.ok(message, "casting posted no card");
      assert.equal(message.getFlag("azeroth-rpg", "kind"), "spell");
      assert.equal(actor.system.powers.find(p => p.name === "mana").value, before - spell.system.mana, "the Mana was not paid");
      const roll = message.rolls[0];
      assert.ok(roll, "the spell card carries no Casting Test");
      assert.equal(roll.options.kind, "casting");
      assert.equal(roll.dc, 12, "a tier-1 spell at nothing is DC 12 (07 SS2)");
      assert.include(message.content, String(roll.total), "the card does not show the Test's total");
      const sum = roll.provenance.filter(r => typeof r.value === "number").reduce((a, r) => a + r.value, 0);
      assert.equal(roll.natural + sum, roll.total, "natural + provenance values != total");

      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: 0 });
      const count = game.messages.size;
      const refused = await castWithDialog(actor, spell, shift());
      assert.isNull(refused, "a cast below the Mana cost was not refused");
      assert.equal(game.messages.size, count, "a refused cast posted a card");
    });

    it("Overchannel pays Health before the roll and never below 1 (07 SS8, 05)", async function () {
      this.timeout(40000);
      const source = await firstFromPack(PACK_FOR.spell, d => d.system.school === "fire" && d.system.tier === 1);
      const actor = await makeCharacter({ name: "ZZ Cfg Pusher", classes: [["Mage", 5]], spells: [source.name] });
      const spell = actor.items.find(i => i.type === "spell");
      const pool = actor.system.powers.find(p => p.name === "mana");
      await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max }, { "system.health.value": 5 });
      const message = await game.system.azeroth.workflows.castSpell({ actor, spell, overchannel: 3, targets: [] });
      assert.ok(message, "the cast posted no card");
      // 5 Health at 2 a point: two points, never the third.
      assert.equal(message.getFlag("azeroth-rpg", "overchannel"), 2, "Overchannel took a point it could not pay for");
      assert.equal(actor.system.health.value, 1, "Overchannel went below 1 Health");
      assert.ok(message.rolls[0].provenance.some(r => r.label === "AZEROTH.Cast.Overchannel"), "no Overchannel row on the card");
    });

    // ---- exposure -----------------------------------------------------------------
    it("Exposure at a preset DC moves the track on a failure, from the corruption tab", async function () {
      this.timeout(40000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
      const actor = await makeCharacter({ name: "ZZ Cfg Exposed", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("corruption", "primary");
        await settle();
        const el = sheet.element.querySelector('[data-action="exposure"][data-track="fel"]');
        assert.ok(el, "no Exposure button on the Fel track");
        assert.isFunction(sheet.options.actions.exposure, "exposure is not registered");
        await withDie(1, async () => {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          const dialog = await dialogFor(actor);
          assert.ok(dialog, "the exposure dialog did not open");
          const form = dialog.element.querySelector("form");
          assert.ok(form.elements.occasion, "no occasion select on the exposure dialog");
          form.elements.occasion.value = "saturated";
          form.elements.occasion.dispatchEvent(new Event("change", { bubbles: true }));
          await settle();
          assert.equal(Number(form.elements.dc.value), 18, "Saturated ground is DC 18 (10 SS3)");
          const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
          dialog.element.querySelector('button[data-action="roll"]').click();
          const [message] = await wait;
          assert.equal(message.getFlag("azeroth-rpg", "kind"), "corruption");
          assert.equal(message.rolls[0].dc, 18);
          assert.equal(actor.system.corruption.fel, 1, "a failed exposure did not add a point");
        });
      } finally {
        await sheet.close();
      }
    });

    it("the banner's name and Health inputs write the character - every input on the sheet depends on it", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Cfg Banner", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        const name = sheet.element.querySelector('input[name="name"]');
        assert.ok(name, "no name input on the banner");
        assert.equal(name.value, actor.name, "the name input renders empty - and an empty required name fails every submit");
        const health = sheet.element.querySelector('input[name="system.health.value"]');
        assert.ok(health, "no Health input on the banner");
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        health.value = "3";
        health.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(actor.system.health.value, 3, "the Health input did not save");
        assert.equal(actor.name, "ZZ Cfg Banner", "saving Health changed the name");
      } finally {
        await sheet.close();
      }
    });

    it("the NPC banner's Health input writes the creature", async function () {
      this.timeout(30000);
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      try {
        const name = sheet.element.querySelector('input[name="name"]');
        assert.equal(name?.value, npc.name, "the NPC name input renders empty");
        const health = sheet.element.querySelector('input[name="system.health.value"]');
        assert.ok(health, "no Health input on the NPC banner");
        const wait = untilHook("updateActor", 5000, a => a.id === npc.id);
        health.value = "2";
        health.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(npc.system.health.value, 2, "the NPC Health input did not save");
      } finally {
        await sheet.close();
      }
    });

    it("the corruption tab's inputs write the tracks", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Cfg Tracks", classes: [["Warrior", 5]] });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("corruption", "primary");
        await settle();
        const input = sheet.element.querySelector('input[name="system.corruption.void"]');
        assert.ok(input, "the Void track has no input");
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        input.value = "7";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await wait;
        assert.equal(actor.system.corruption.void, 7);
      } finally {
        await sheet.close();
      }
    });

    // ---- Resilience ----------------------------------------------------------------
    it("a Resilience Test from the rail carries the ability and, when trained, Proficiency", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Cfg Resilient", classes: [["Warrior", 5]] });
      const trained = actor.classItems[0].system.resiliences ?? [];
      const sheet = await openSheet(actor);
      try {
        const el = sheet.element.querySelector('[data-action="rollResilience"][data-resilience="body"]');
        assert.ok(el, "no Body Resilience button on the rail");
        assert.isFunction(sheet.options.actions.rollResilience, "rollResilience is not registered");
        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === actor.id);
        el.dispatchEvent(shift());
        const [message] = await wait;
        const roll = message.rolls[0];
        assert.equal(roll.options.kind, "resilience");
        const hasProf = roll.provenance.some(r => r.label === "AZEROTH.Sheet.Proficiency");
        assert.equal(hasProf, trained.includes("body"), `Proficiency on the card should follow training (${trained.join(", ") || "none"})`);
        const con = roll.provenance.find(r => r.label === "AZEROTH.Ability.Con.Label");
        assert.ok(con && con.value === actor.system.abilities.con.mod, "the Body Test does not read Constitution");
      } finally {
        await sheet.close();
      }
    });

    // ---- criticals -------------------------------------------------------------------
    it("a Critical Injury draws its table, and Suffer puts the result on the character", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Cfg Injured", classes: [["Warrior", 5]] });
      const message = await withDie(9, () => game.system.azeroth.workflows.rollCriticalInjury({ actor, location: "body" }));
      const flags = message.getFlag("azeroth-rpg", "result");
      assert.ok(flags, "the card drew no table result");
      assert.equal(flags.name, "Deep cut", "9 on the Body table is Deep cut (06 SS8)");
      assert.include(message.content, "Deep cut");
      assert.include(message.content, 'data-action="sufferInjury"', "no Suffer button on the card");

      await game.system.azeroth.workflows.sufferInjury({
        actor, location: "body", band: message.getFlag("azeroth-rpg", "band"), result: flags
      });
      assert.ok(actor.effects.some(e => e.getFlag("azeroth-rpg", "injury")), "no injury effect on the character");
      assert.isTrue(actor.statuses.has("bleeding"), "Deep cut did not apply Bleeding");
      const bleeding = actor.effects.find(e => e.statuses?.has("bleeding"));
      assert.equal(bleeding?.getFlag("azeroth-rpg", "value"), 1, "Bleeding 1 did not carry its value");
    });

    it("the 20 band drops the character to 0 Health and no further (D-082)", async function () {
      this.timeout(40000);
      const actor = await makeCharacter({ name: "ZZ Cfg Mortal", classes: [["Warrior", 5]] });
      const message = await withDie(20, () => game.system.azeroth.workflows.rollCriticalInjury({ actor, location: "body" }));
      assert.isTrue(message.getFlag("azeroth-rpg", "band")?.dying === true);
      await game.system.azeroth.workflows.sufferInjury({
        actor, location: "body", band: message.getFlag("azeroth-rpg", "band"), result: message.getFlag("azeroth-rpg", "result")
      });
      assert.equal(actor.system.health.value, 0);
    });

    // ---- Apply Damage, per target ---------------------------------------------------
    it("Apply Damage on a target row takes that target's mitigated damage off its Health", async function () {
      this.timeout(40000);
      const attacker = await makeCharacter({ name: "ZZ Cfg Attacker", classes: [["Warrior", 5]] });
      const victim = await makeNpc("Plagued Ghoul");
      const health = victim.system.health.value;
      const target = {
        tokenId: null, sceneId: null, actorId: victim.id, name: victim.name,
        defense: victim.system.defense, apByLocation: { body: 3, head: 0, limb: 0 }, absent: [],
        ward: 0, wardSchool: null, immune: [], vulnerable: [], statuses: []
      };
      const message = await withDie(20, () => game.system.azeroth.workflows.rollTest({
        actor: attacker, kind: "attack", dc: 10, title: "Test", targets: [target],
        modifiers: [{ label: "AZEROTH.Sheet.AttackBonus", value: 5 }], damage: { rating: 7, kind: "physical" }
      }));
      const byTarget = message.getFlag("azeroth-rpg", "damageByTarget");
      assert.ok(byTarget?.[0], "no per-target damage on the card");
      assert.include(message.content, 'data-target-index="0"', "no per-target Apply button");
      const expected = byTarget[0].damage;
      assert.isAbove(expected, 0);
      await CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0", damage: String(expected) } }, message);
      assert.equal(victim.system.health.value, Math.max(0, health - expected), "the target's Health did not drop by the mitigated damage");
    });

    // ---- 05 §2's margin, at the table -------------------------------------------------
    it("a Test that misses its DC by three MISSES, and lands at SL -1", async function () {
      this.timeout(30000);
      // `computeSL` truncated toward zero, so a margin of -1 to -4 came back
      // at SL 0 and SL 0 was scored as a success: missing a Defense of 15 with
      // a total of 12 was a hit, on every roll in the game (the lead,
      // 2026-09-07). Vitest covers the pure function; this is the proof it
      // reaches the pipeline, which is the half that was in play.
      const attacker = await makeCharacter({ name: "ZZ Margin", classes: [["Warrior", 1]] });
      // Natural 12, no modifiers, against DC 15: a margin of -3.
      const message = await withDie(12, () => game.system.azeroth.workflows.rollTest({
        actor: attacker, kind: "attack", dc: 15, title: "Test", targets: [], modifiers: []
      }));
      const roll = message.rolls?.[0];
      assert.equal(roll.total, 12, "the die was not pinned to 12");
      assert.isFalse(roll.outcome.success, "a total of 12 against DC 15 was scored as a success");
      assert.equal(roll.outcome.sl, -1, "a margin of -3 is 05 §2's Near miss band, SL -1");

      // And the boundary above it: a margin of -7 is Clear failure, SL -2.
      const worse = await withDie(8, () => game.system.azeroth.workflows.rollTest({
        actor: attacker, kind: "attack", dc: 15, title: "Test", targets: [], modifiers: []
      }));
      assert.equal(worse.rolls[0].outcome.sl, -2, "a margin of -7 is SL -2");

      // A margin of 0 still succeeds: "A bare success at SL 0 still succeeds."
      const bare = await withDie(15, () => game.system.azeroth.workflows.rollTest({
        actor: attacker, kind: "attack", dc: 15, title: "Test", targets: [], modifiers: []
      }));
      assert.isTrue(bare.rolls[0].outcome.success, "a total that meets the DC exactly did not succeed");
      assert.equal(bare.rolls[0].outcome.sl, 0);
    });

    // ---- the NPC's skill ---------------------------------------------------------------
    it("an NPC's skill Test is attribute + Proficiency + Rank (14 SS1)", async function () {
      this.timeout(30000);
      const npc = await makeNpc("Plagued Ghoul");
      await npc.update({ "system.skills": { athletics: 2 } });
      const sheet = await openSheet(npc);
      try {
        sheet.changeTab("traits", "primary");
        await settle();
        const el = sheet.element.querySelector('[data-action="rollSkill"][data-skill="athletics"]');
        assert.ok(el, "the NPC sheet lists no Athletics button");
        assert.isFunction(sheet.options.actions.rollSkill, "rollSkill is not registered on the NPC sheet");
        const wait = untilHook("createChatMessage", 8000, m => m.speaker?.actor === npc.id);
        el.dispatchEvent(shift());
        const [message] = await wait;
        const roll = message.rolls[0];
        const sum = roll.provenance.filter(r => typeof r.value === "number").reduce((a, r) => a + r.value, 0);
        assert.equal(sum, npc.system.abilities.str.mod + npc.system.proficiency + 2, "the modifier is not Str + Proficiency + Rank");
        assert.equal(roll.natural + sum, roll.total);
      } finally {
        await sheet.close();
      }
    });

    // ---- spending a pool ---------------------------------------------------------------
    it("Spend takes the amount off the pool and refuses more than it holds", async function () {
      this.timeout(30000);
      const actor = await makeCharacter({ name: "ZZ Cfg Spender", classes: [["Warrior", 5]] });
      const pool = actor.system.momenta[0];
      await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: 6 });
      const sheet = await openSheet(actor);
      try {
        const button = sheet.element.querySelector(`[data-action="spendPool"][data-item-id="${pool.itemId}"][data-kind="momentum"]`);
        assert.ok(button, "no Spend button on the Rage pool");
        assert.isFunction(sheet.options.actions.spendPool, "spendPool is not registered");
        const input = button.parentElement.querySelector("input.azeroth-spend");
        assert.ok(input, "no amount beside the Spend button");
        input.value = "2";
        const wait = untilHook("updateActor", 5000, a => a.id === actor.id);
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await wait;
        assert.equal(actor.system.momenta[0].value, 4);

        await settle();
        const again = sheet.element.querySelector(`[data-action="spendPool"][data-item-id="${pool.itemId}"][data-kind="momentum"]`);
        again.parentElement.querySelector("input.azeroth-spend").value = "9";
        again.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 300));
        assert.equal(actor.system.momenta[0].value, 4, "a spend above the pool went through");
      } finally {
        await sheet.close();
      }
    });

    // ---- the stepper beside it (the lead, 2026-09-13) ----------------------------------
    it("the pool stepper adds a point, takes one back, and takes a value typed straight in", async function () {
      this.timeout(60000);
      // *"There should also be a way to just add/remove [a] point."* The pool
      // had a Spend button and nothing else, so a GM handing a Warrior 2 Rage
      // back after a miscount had to open the class item.
      const actor = await makeCharacter({ name: "ZZ Pool Stepper", classes: [["Warrior", 5]] });
      const pool = actor.system.momenta[0];
      await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: 3 });
      const sheet = await openSheet(actor);
      const held = () => actor.system.momenta[0].value;
      const until = async (want, what) => {
        for (let i = 0; i < 200 && held() !== want; i++) await new Promise(r => setTimeout(r, 25));
        assert.equal(held(), want, what);
      };
      try {
        assert.isFunction(sheet.options.actions.stepPool, "stepPool is not registered on the character sheet");
        // RE-QUERIED EVERY TIME: a control found before a render is dead after
        // it, and every one of these writes re-renders the sheet.
        const step = delta => sheet.element.querySelector(
          `[data-action="stepPool"][data-item-id="${pool.itemId}"][data-kind="momentum"][data-delta="${delta}"]`);
        const box = () => sheet.element.querySelector(
          `input.azeroth-pool-value[data-item-id="${pool.itemId}"][data-kind="momentum"]`);

        assert.ok(step("1"), "the pool draws no + button");
        assert.ok(step("-1"), "the pool draws no − button");
        assert.ok(box(), "the pool draws no value box");
        // AND THE BOX IS NAMELESS, so `submitOnChange` never writes it: the
        // value lives on `system.classes[]` and no input could name it.
        assert.isNotOk(box().getAttribute("name"), "the pool's value box carries a name and would be submitted");
        assert.isNotOk(box().dataset.action, "an input may not carry a data-action: it emits change, not click");

        step("1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await until(4, "+ did not add a point");
        step("-1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await until(3, "− did not take a point back");

        const type = async value => {
          const input = box();
          input.value = value;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await settle();
        };
        await type("7");
        await until(7, "a value typed into the box did not land");
        // CLAMPED, both ways, by `updatePool` and nothing else.
        await type("99");
        await until(10, "a value above the maximum was not clamped");
        await type("-3");
        await until(0, "a negative value was not clamped to zero");
        // AND A TYPO CHANGES NOTHING. A number input reports "" for anything
        // it cannot parse, and `Number("")` is 0 — which would have emptied
        // the pool on a slip.
        await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: 5 });
        await settle();
        await type("abc");
        await new Promise(r => setTimeout(r, 300));
        assert.equal(held(), 5, "a value the box could not parse emptied the pool");
        assert.equal(box().value, "5", "the box was left holding what could not be read");
      } finally {
        await sheet.close();
      }
    });

    it("a creature's Power steps the same way, from the NPC sheet", async function () {
      this.timeout(60000);
      const npc = await makeNpc("Plagued Ghoul");
      const sheet = await openSheet(npc);
      const held = () => npc.system.power.value;
      const until = async (want, what) => {
        for (let i = 0; i < 200 && held() !== want; i++) await new Promise(r => setTimeout(r, 25));
        assert.equal(held(), want, what);
      };
      try {
        assert.isFunction(sheet.options.actions.stepPool, "stepPool is not registered on the NPC sheet");
        // A creature's pools are FLAT: no class item, so `data-item-id` is
        // empty and `updatePool` takes the NPC branch.
        const step = delta => sheet.element.querySelector(
          `section[data-tab="statistics"] [data-action="stepPool"][data-kind="power"][data-delta="${delta}"]`);
        assert.ok(step("-1"), "the creature's Power draws no − button");
        const before = held();
        assert.isAbove(before, 0, "the fixture's Power is empty, so a step down would prove nothing");
        step("-1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await until(before - 1, "the creature's Power did not move");
        step("1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await until(before, "the creature's Power did not come back");
        // The Spend row is still the character sheet's alone (D-705).
        assert.isNull(sheet.element.querySelector('[data-action="spendPool"]'),
          "a Spend button reached the NPC sheet, where nothing registers it");
      } finally {
        await sheet.close();
      }
    });
  });
}
