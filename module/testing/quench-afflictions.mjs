/**
 * POISONS AND DISEASES CARRIED UNTIL CURED, inside a live world (D12, Phase 5a).
 *
 * `rules/afflictions.mjs` has its Vitests and knows the law. What none of them can
 * reach is whether anything CALLS it: the writer, the fight beat on
 * `AzerothCombat#_effectTicks`, the world clock on `updateWorldTime`, the coating
 * stamp, the card's Test, the Medicine dialog's Healer select. Right code with no
 * caller is this repository's commonest real fault (D-681).
 *
 * **Poll for exactly what is asserted** (CLAUDE.md section 15): a turn's work runs on
 * the active GM's client after the update that moved the turn, and the world clock's
 * hook is unawaited. **Pin the die through `fixtures.pinDie`** (core maps a LOW r to a
 * HIGH face).
 */

import {
  cleanup, drainAreaWork, fromPack, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, tokenDrawn, untilHook, warnings, PACK_FOR
} from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { CARD_ACTIONS, regionFlagsFromCard } from "../dice/chat.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { cureAreaOnPlace } from "../effects/cures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { DAY, HOUR, makeDisease, makePoison, readCarried } from "../rules/afflictions.mjs";
import { afflict, afflictQueryHandler, afflictionsOf } from "../effects/afflictions.mjs";
import { advanceAfflictionsWorld } from "../effects/affliction-clock.mjs";
import { postPrompt } from "../effects/prompts.mjs";
import { attackWithDialog } from "../applications/actions.mjs";

/** Poll for exactly the thing the next line asserts. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 40));
  }
}

const workflows = () => game.system.azeroth.workflows;
const rowOf = (actor, key) => afflictionsOf(actor).find(r => r.aff.key === key) ?? null;

/** A button off a card, as the chat door reads it: only its dataset matters. */
function buttonFor(dataset) {
  const button = document.createElement("button");
  Object.assign(button.dataset, dataset);
  return button;
}

/** The messages one action posts. */
async function postedBy(fn) {
  const posted = [];
  const id = Hooks.on("createChatMessage", msg => posted.push(msg));
  try { await fn(); await settle(); } finally { Hooks.off("createChatMessage", id); }
  return posted;
}

/** A poison carrier built from a Carried cell's words, laid with the batch's own door. */
function poisonFrom(name, cell, { dc = 14, resilience = "body", inFight = false } = {}) {
  return makePoison({ name, dc, resilience, carried: readCarried(cell), source: null, now: game.time.worldTime, inFight });
}

/** Whether the world clock has finished with a creature. */
const clockIdle = () => true;

export function afflictionsBatch(context) {
  const { describe, it, assert, before, after } = context;

  /** A started fight over these actors, its first turn's events over. */
  async function fightWith(actors) {
    const combat = await Combat.create({});
    made.push(combat);
    await combat.activate();
    await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
    const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
    await combat.startCombat();
    await settled;
    await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
      "every combatant's own budget landing");
    return combat;
  }

  describe("Poisons and diseases carried until cured (D12)", function () {
    let prior;
    before(async function () {
      prior = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, prior);
      await cleanup();
    });

    it("a coated Deathweed hit whose Test fails lays the carrier", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Afflict Poisoner", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = actor.items.find(i => i.name === "Dagger");
      await actor.updateEmbeddedDocuments("Item", [{ _id: dagger.id, "system.equipped": true }]);
      const foe = await makeNpc("Kobold");
      const vial = await give(actor, "Deathweed extract");
      assert.isTrue(vial.system.use.carried?.carried, "the pack's Deathweed carries no descriptor");
      await workflows().useGear({ actor, item: vial });
      const coating = dagger.getFlag("azeroth-rpg", "coating");
      assert.ok(coating, "the poison did not land on the blade");
      assert.equal(coating.key, "deathweedextract", "the coating was not stamped with its key");
      assert.equal(coating.carried?.damage, 4, "the coating carries no descriptor");

      const unpin = pinDie(19);
      let card;
      try {
        const posted = await postedBy(() => attackWithDialog(actor, dagger));
        card = posted.find(m => m.flags?.["azeroth-rpg"]?.kind === "attack");
      } finally { unpin(); }
      assert.ok(card, "no attack card");
      const poison = card.flags["azeroth-rpg"].poisons?.[0];
      assert.equal(poison?.afflict?.key, "deathweedextract", "the card offers no Test for a carried poison");
      assert.isNotOk(poison.tick, "a carried poison also stamped the old tick");

      const failing = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(buttonFor({
          action: "resistTest", purpose: "poison", poisonIndex: "0", actorUuid: foe.uuid, resilience: "body", dc: "14"
        }), card);
      } finally { failing(); }
      await until(() => rowOf(foe, "deathweedextract"), "the carrier on the creature that failed");
      const row = rowOf(foe, "deathweedextract");
      assert.isNull(row.effect._source.duration?.value ?? null, "the carrier has a duration");
      assert.isTrue(row.effect.flags["azeroth-rpg"].poison, "no poison flag for the nullifier");
      assert.isTrue(row.effect.flags["azeroth-rpg"].harmful);
    });

    it("an immune actor is refused, in words, and a second exposure changes nothing", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Afflict Immune", classes: [["Warrior", 2]] });
      const aff = poisonFrom("Serpent's tears", "2 damage");
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Proof", flags: { "azeroth-rpg": { immuneTo: { conditions: ["poisoned"] } } }
      }]);
      await until(() => actor.system.conditionImmunities.includes("poisoned"), "the immunity to derive");
      const refused = await afflict(actor, { aff });
      assert.equal(refused.reason, "immune");
      assert.lengthOf(afflictionsOf(actor), 0, "an immune creature was afflicted");

      const other = await makeCharacter({ name: "ZZ Afflict Twice", classes: [["Warrior", 2]] });
      const first = await afflict(other, { aff });
      assert.isTrue(first.ok);
      const second = await afflict(other, { aff });
      assert.equal(second.reason, "alreadyCarried");
      assert.lengthOf(afflictionsOf(other), 1, "a second exposure laid a second carrier");
    });

    it("the tick lands at the start of the carrier's turn in a fight", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Afflict Ticker", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      // The turn moves by the tracker's own Next Turn, as a table moves it (D-627).
      const advance = async () => {
        const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
        await combat.nextTurn();
        await settled;
      };
      if (combat.combatant?.actor?.id === actor.id) await advance();
      const done = await afflict(actor, { aff: poisonFrom("Deathweed extract", "4 damage", { inFight: true }) });
      assert.isTrue(done.ok, `the carrier was not laid: ${done.reason}`);
      assert.equal(rowOf(actor, "deathweedextract").aff.clock.mode, "fight");
      const before = actor.system.health.value;
      await advance();
      assert.equal(combat.combatant?.actor?.id, actor.id, "it is not the carrier's turn");
      await until(() => actor.system.health.value === before - 4, "four damage at the start of the carrier's turn");
      // The world clock does not count a creature that is in a fight.
      const mark = actor.system.health.value;
      await game.time.advance(HOUR);
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(actor.system.health.value, mark, "the world clock ticked a creature in a fight");
    });

    it("out of a fight, 2 hours of world time land 2 ticks on ONE card", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Afflict Clock", classes: [["Warrior", 3]] });
      const done = await afflict(actor, { aff: poisonFrom("Deathweed extract", "4 damage") });
      assert.isTrue(done.ok);
      const before = actor.system.health.value;
      const posted = [];
      const hookId = Hooks.on("createChatMessage", msg => posted.push(msg));
      try {
        await game.time.advance(2 * HOUR);
        await until(() => actor.system.health.value === before - 8, "two ticks of four");
        // The health lands FIRST; the clock's patch and the card follow it (landEvents), so wait for
        // each thing asserted below, not for the one that came first.
        const isCard = m => m.flags?.["azeroth-rpg"]?.kind === "afflictions" && m.flags["azeroth-rpg"].actorUuid === actor.uuid;
        await until(() => posted.some(isCard), "the one card of the jump");
        await until(() => rowOf(actor, "deathweedextract")?.aff.clock?.nextAt === game.time.worldTime + HOUR, "the clock moving to the next beat");
        await settle();
      } finally { Hooks.off("createChatMessage", hookId); }
      const cards = posted.filter(m => m.flags?.["azeroth-rpg"]?.kind === "afflictions" && m.flags["azeroth-rpg"].actorUuid === actor.uuid);
      assert.lengthOf(cards, 1, "a jump of the clock posted more than one card");
      assert.include(cards[0].content, "2 times");
      assert.equal(rowOf(actor, "deathweedextract").aff.clock.nextAt, game.time.worldTime + HOUR, "the clock did not move to the next beat");
    });

    it("a carried Loa venom re-lays Poisoned 2 after a shed", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Afflict Loa", classes: [["Warrior", 3]] });
      const aff = poisonFrom("Loa-blessed venom", "Poisoned 2, re-laid to 2");
      assert.isTrue((await afflict(actor, { aff })).ok);
      const row = rowOf(actor, "loablessedvenom");
      assert.isTrue(row.effect.statuses.has("poisoned"));
      assert.equal(row.effect.getFlag("azeroth-rpg", "value"), 2);
      assert.deepEqual(row.effect.getFlag("azeroth-rpg", "shedDc"), { dc: 14, source: "Loa-blessed venom" });

      const shed = async () => {
        const prompt = await postPrompt(actor, {
          purpose: "poisoned", resilience: "body", dc: 14, effectId: row.id, title: "Poisoned", text: "Shed", testLabel: "Test"
        });
        const unpin = pinDie(20);
        try {
          await CARD_ACTIONS.resistTest(buttonFor({
            action: "resistTest", purpose: "poisoned", actorUuid: actor.uuid, resilience: "body", dc: "14", effectId: row.id
          }), prompt);
        } finally { unpin(); }
      };
      await shed();
      await until(() => actor.effects.get(row.id)?.getFlag("azeroth-rpg", "value") === 1, "one stack shed");
      await shed();
      await until(() => actor.effects.get(row.id)?.getFlag("azeroth-rpg", "value") === 0, "both stacks shed");
      const kept = actor.effects.get(row.id);
      assert.ok(kept, "shedding the last stack deleted the carrier");
      assert.isFalse(kept.statuses.has("poisoned"), "Poisoned stayed on at 0");

      await game.time.advance(HOUR);
      await until(() => actor.effects.get(row.id)?.getFlag("azeroth-rpg", "value") === 2
        && actor.effects.get(row.id).statuses.has("poisoned"), "Poisoned 2 laid again at the beat");
    });

    it("exposure lays Rot-fever at onset; a day later it is carried and Diseased", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Afflict Fever", classes: [["Warrior", 3]] });
      const unpin = pinDie(1);
      try { await workflows().exposeAffliction({ actor, key: "rotFever", kind: "disease" }); } finally { unpin(); }
      await until(() => rowOf(actor, "rotFever"), "Rot-fever laid by the failed Test");
      const row = rowOf(actor, "rotFever");
      assert.equal(row.aff.disease.stage, "onset");
      assert.isFalse(actor.statuses.has("diseased"), "Diseased at onset");
      assert.equal(actor.system.fatigueFloor ?? 0, 0, "a Fatigue floor at onset");

      await game.time.advance(DAY);
      await until(() => rowOf(actor, "rotFever")?.aff.disease.stage === "carried", "onset to run out after a day");
      await until(() => actor.statuses.has("diseased"), "Diseased once carried");
      await until(() => actor.system.fatigueFloor === 1, "the carried Rot-fever's Fatigue floor");
    });

    it("a Medicine Test by a non-carrier passes and starts recovery; a second is refused in words; recovery ends the disease", async function () {
      this.timeout(180000);
      const patient = await makeCharacter({ name: "ZZ Afflict Patient", classes: [["Warrior", 2]] });
      const healer = await makeCharacter({ name: "ZZ Afflict Healer", classes: [["Priest", 2]] });
      assert.isTrue((await afflict(patient, { aff: makeDisease("carrionPalsy", { source: null, now: game.time.worldTime }) })).ok);
      const row = rowOf(patient, "carrionPalsy");
      assert.equal(row.aff.disease.stage, "carried", "Carrion palsy has no onset");

      const treat = async () => {
        const pending = workflows().medicineTest({ patient, afflictionId: row.id });
        const dialog = await until(() => [...foundry.applications.instances.values()]
          .find(a => a.rendered && String(a.id).startsWith("azeroth-roll-") && a.element?.querySelector("select[data-attack-mode]")),
          "the Medicine dialog");
        const select = dialog.element.querySelector("select[data-attack-mode]");
        const options = [...select.options];
        const own = options.find(o => o.value === patient.uuid);
        assert.ok(own, "the patient is not listed as a healer");
        assert.isTrue(own.disabled, "a carrier of the disease can be chosen as the healer");
        select.value = healer.uuid;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        dialog.element.querySelector('button[data-action="roll"]').click();
        return pending;
      };

      const unpin = pinDie(20);
      let card;
      try { card = await treat(); } finally { unpin(); }
      assert.ok(card, "no Medicine card");
      assert.equal(card.rolls[0].options?.kind ?? "skill", "skill");
      await until(() => rowOf(patient, "carrionPalsy")?.aff.disease.stage === "recovering", "the recovery to start");
      assert.equal(rowOf(patient, "carrionPalsy").aff.disease.recoverAt, game.time.worldTime + 2 * DAY);

      let refused;
      const said = await warnings(async () => { refused = await workflows().medicineTest({ patient, afflictionId: row.id }); });
      assert.ok(refused?.refused, "a second Medicine Test was allowed");
      assert.lengthOf(said, 1);
      assert.include(said[0], "ZZ Afflict Patient");

      await game.time.advance(2 * DAY);
      await until(() => !rowOf(patient, "carrionPalsy"), "the recovery to end the disease");
    });

    it("a failed Medicine Test is refused again within 24 hours, and allowed after", async function () {
      this.timeout(180000);
      const patient = await makeCharacter({ name: "ZZ Afflict Patient Two", classes: [["Warrior", 2]] });
      const healer = await makeCharacter({ name: "ZZ Afflict Healer Two", classes: [["Priest", 2]] });
      assert.isTrue((await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) })).ok);
      const row = rowOf(patient, "lockjaw");
      const unpin = pinDie(1);
      try {
        const pending = workflows().medicineTest({ patient, afflictionId: row.id });
        const dialog = await until(() => [...foundry.applications.instances.values()]
          .find(a => a.rendered && String(a.id).startsWith("azeroth-roll-") && a.element?.querySelector("select[data-attack-mode]")),
          "the Medicine dialog");
        const select = dialog.element.querySelector("select[data-attack-mode]");
        select.value = healer.uuid;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await settle();
        dialog.element.querySelector('button[data-action="roll"]').click();
        await pending;
      } finally { unpin(); }
      await until(() => rowOf(patient, "lockjaw")?.aff.disease.triedAt === game.time.worldTime, "the attempt to be dated");
      assert.equal(rowOf(patient, "lockjaw").aff.disease.stage, "carried", "a failed Test started recovery");
      let refused;
      const said = await warnings(async () => { refused = await workflows().medicineTest({ patient, afflictionId: row.id }); });
      assert.equal(refused?.refused, "triedToday");
      assert.lengthOf(said, 1);
      void clockIdle; void PACK_FOR; void advanceAfflictionsWorld;
    });

    it("the Corruption tab's Afflictions panel: groups, rows and the sheet's own controls (D12, Phase 7)", async function () {
      this.timeout(180000);
      const patient = await makeCharacter({ name: "ZZ Afflict Panel", classes: [["Warrior", 2]] });
      const healer = await makeCharacter({ name: "ZZ Afflict Panel Healer", classes: [["Priest", 2]] });
      assert.isTrue((await afflict(patient, { aff: poisonFrom("Deathweed extract", "Carried: 4 damage each hour.") })).ok);
      assert.isTrue((await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) })).ok);
      const poisonRow = rowOf(patient, "deathweedextract");
      const diseaseRow = rowOf(patient, "lockjaw");
      assert.ok(poisonRow && diseaseRow, "both carriers were laid");
      const sheet = await openSheet(patient);
      const scope = () => sheet.element.querySelector('section[data-tab="corruption"]');
      try {
        sheet.changeTab("corruption", "primary");
        await settle();
        const groups = [...scope().querySelectorAll("details[data-affliction-group]")].map(d => d.dataset.afflictionGroup);
        assert.deepEqual(groups, ["poison", "disease"], "Poisons then Diseases");
        for (const summary of scope().querySelectorAll(".azeroth-aff-summary")) {
          assert.isNull(summary.querySelector("button, a, input, select"), "a control nested in a summary");
          assert.match(summary.textContent, /\d/, "the heading keeps its count");
        }
        const toggle = scope().querySelector(`[data-affliction-row="${poisonRow.id}"] .azeroth-aff-toggle`);
        assert.equal(toggle.getAttribute("aria-expanded"), "false", "a row starts closed");
        assert.isTrue(toggle.id.length > 0, "the disclosure has an id for focus restore");

        // The row's disclosure, pressed as a player presses it.
        toggle.click();
        await until(() => game.user.getFlag("azeroth-rpg", "afflictionRows")?.includes(poisonRow.id), "the open row to be remembered");
        assert.equal(toggle.getAttribute("aria-expanded"), "true");
        assert.isFalse(scope().querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls"))}`).hidden, "the detail stayed hidden");

        // A group closes through its own heading and is remembered per viewer.
        scope().querySelector('details[data-affliction-group="poison"] > summary').click();
        await until(() => game.user.getFlag("azeroth-rpg", "afflictionGroups.poison") === false, "the closed group to be remembered");
        await sheet.render({ force: true });
        await settle();
        assert.isFalse(scope().querySelector('details[data-affliction-group="poison"]').open, "a render re-opened the group");
        assert.equal(scope().querySelector(`[data-affliction-row="${poisonRow.id}"] .azeroth-aff-toggle`).getAttribute("aria-expanded"), "true",
          "a render closed the remembered row");
        scope().querySelector('details[data-affliction-group="poison"] > summary').click();
        await until(() => game.user.getFlag("azeroth-rpg", "afflictionGroups.poison") !== false, "the group to be remembered open again");

        // The legibility of the panel with both groups open and a row open.
        const findings = checkText(scope().querySelector("[data-afflictions]"), { requireGroundWithin: true });
        assert.deepEqual(findings, [], findings.map(f => `${f.kind} ${f.detail}`).join("; "));

        // The Medicine Test button opens the system's roll dialog.
        const press = scope().querySelector(`[data-affliction-row="${diseaseRow.id}"] button[data-action="medicineTest"]:not([disabled])`);
        assert.ok(press, "an open Medicine Test draws a live control");
        press.click();
        const dialog = await until(() => [...foundry.applications.instances.values()]
          .find(a => a.rendered && String(a.id).startsWith("azeroth-roll-") && a.element?.querySelector("select[data-attack-mode]")), "the Medicine dialog");
        assert.isOk(dialog.element.querySelector("select[data-attack-mode]"), "the Healer select");
        void healer;
        await dialog.close();

        // The GM's x ends the disease outright.
        const end = scope().querySelector(`[data-affliction-row="${diseaseRow.id}"] button[data-action="endAffliction"]`);
        assert.ok(end, "the GM draws an end control");
        end.click();
        await until(() => !rowOf(patient, "lockjaw"), "the disease to end");
        await until(() => !scope().querySelector(`[data-affliction-row="${diseaseRow.id}"]`), "the sheet to redraw without it");
      } finally {
        await sheet.close();
        await game.user.unsetFlag("azeroth-rpg", "afflictionRows");
        await game.user.unsetFlag("azeroth-rpg", "afflictionGroups");
      }
    });
  });

  describe("Migration 0.13.0: the old timed shapes become carriers (D-806)", function () {
    after(async function () {
      this.timeout(120000);
      await cleanup();
    });

    it("converts a stale disease and a coating tick, and a second run changes nothing", async function () {
      this.timeout(120000);
      const { convertActorEffects } = await import("../migrations/0.13.0-afflictions.mjs");
      const { packSystems } = await import("../migrations/walk.mjs");
      const { poisonsFromPack } = await import("../rules/affliction-migration.mjs");
      const poisons = poisonsFromPack((await packSystems("azeroth-rpg.gear")).byName);
      assert.isAbove(poisons.length, 0, "the gear pack holds no carried poison to migrate to");
      const poison = poisons[0];

      const victim = await makeNpc("Kobold");
      // createEmbeddedDocuments does NOT hand the documents back in the order they were given, so
      // each is picked out by its own name (a destructure by position swapped them at random).
      const created = await victim.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Tetanus", statuses: ["diseased"], system: { changes: [] },
          duration: { value: 5, units: "minutes" }, start: { time: game.time.worldTime },
          flags: { "azeroth-rpg": { tetanus: { version: 1 }, harmful: true, disease: true } }
        },
        {
          name: poison.name, statuses: [], system: { changes: [] },
          duration: { value: 3, units: "rounds", expiry: "turnEnd" },
          flags: { "azeroth-rpg": { tick: { kind: "damage", type: "nature", amount: 1, rounds: 3, when: "startOfTurn", name: poison.name, source: null, castUuid: null } } }
        },
        {
          name: "Moonfire", statuses: [], system: { changes: [] },
          flags: { "azeroth-rpg": { tick: { kind: "damage", type: "arcane", amount: 2, rounds: 3, when: "startOfTurn", name: "Moonfire", source: null, castUuid: "Item.spell" } } }
        }
      ]);

      const byName = name => created.find(e => e.name === name);
      const stale = byName("Tetanus");
      const tick = byName(poison.name);
      const spellTick = byName("Moonfire");
      assert.ok(stale && tick && spellTick, "a stale effect was not created: " + created.map(e => e.name).join(", "));

      const first = await convertActorEffects(victim, { poisons });
      assert.equal(first, 2, "the disease and the coating tick should each convert once");

      const lockjaw = victim.effects.get(stale.id);
      assert.ok(lockjaw, "the disease was replaced rather than converted in place");
      const aff = lockjaw.flags["azeroth-rpg"].affliction;
      assert.equal(aff?.key, "lockjaw");
      assert.equal(aff?.disease?.stage, "carried");
      assert.isNull(lockjaw._source.duration?.value ?? null, "the converted disease still has a duration");
      assert.isNull(lockjaw._source.start?.time ?? null, "the converted disease still has a start");

      assert.isNotOk(victim.effects.get(tick.id), "the old coating tick was not deleted");
      const carrier = afflictionsOf(victim).find(r => r.aff.kind === "poison" && r.aff.key === poison.key);
      assert.ok(carrier, "no poison carrier replaced the tick");
      assert.isNull(carrier.effect._source.duration?.value ?? null, "the poison carrier has a duration");

      assert.ok(victim.effects.get(spellTick.id), "a spell tick was converted or deleted");

      const count = victim.effects.size;
      assert.equal(await convertActorEffects(victim, { poisons }), 0, "a second run changed something");
      assert.equal(victim.effects.size, count, "a second run added or removed an effect");
    });
  });

  describe("Cures through one door (D12, Phase 6)", function () {
    let prior = null;
    let wasViewing = null;
    let scene = null;
    let quietText = null;

    before(async function () {
      this.timeout(60000);
      // Core floats a PIXI text over a struck token for two seconds and nothing awaits it, so
      // viewing another scene in `after` tears the canvas down under it (fixtures.mjs has the reason).
      quietText = await quietScrollingText();
      prior = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({ name: "ZZ Cures", width: 4000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene to be viewed");
    });

    after(async function () {
      this.timeout(180000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, prior);
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
      await quietText?.();
    });

    const tokenOf = actor => actor.getActiveTokens(true)[0]?.document ?? null;
    const refFor = actor => { const t = tokenOf(actor); return { sceneId: scene.id, tokenId: t.id }; };

    async function place(placements) {
      const data = [];
      for (const { actor, x, y, disposition = "FRIENDLY" } of placements) {
        await actor.update({ "prototypeToken.actorLink": true });
        data.push(await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[disposition] }));
      }
      const tokens = await scene.createEmbeddedDocuments("Token", data);
      await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn");
      await settle();
      return tokens;
    }

    async function fillMana(actor) {
      for (const pool of actor.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) {
        await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
      }
    }

    /** Answer the one chooser for `itemId`: tick/select the rows whose text starts with each name. */
    async function answer(itemId, names) {
      const app = await until(() => {
        const a = foundry.applications.instances.get(`azeroth-choose-${itemId}`);
        return a?.rendered ? a : null;
      }, "the chooser");
      const form = app.element;
      const select = form.querySelector("select[name=choice]");
      if (select) {
        const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
        assert.ok(option, `no chooser row starts with ${names[0]}: ${[...select.options].map(o => o.textContent.trim()).join(" | ")}`);
        select.value = option.value;
      } else {
        for (const box of form.querySelectorAll("input[name=choice]")) box.checked = false;
        for (const name of names) {
          const row = [...form.querySelectorAll("input[name=choice]")].find(b => b.closest("label")?.textContent.trim().startsWith(name));
          assert.ok(row, `no checkbox row starts with ${name}`);
          row.checked = true;
        }
      }
      form.querySelector('button[data-action="choose"]').click();
    }

    const poison = (name, cell = "**Slowed**, held") => poisonFrom(name, cell);
    const keys = actor => afflictionsOf(actor).map(r => r.aff.key).sort();
    const bleed = async (actor, value) => {
      const [e] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Bleeding", statuses: ["bleeding"], flags: { "azeroth-rpg": { value } } }]);
      return e;
    };
    const slowed = async actor => {
      const [e] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Slowed", statuses: ["slowed"] }]);
      return e;
    };
    async function caster(name, cls, spells, at = { x: 1000, y: 1000 }) {
      const actor = await makeCharacter({ name, classes: [[cls, 10]] });
      for (const s of spells) if (!actor.items.find(i => i.type === "spell" && i.name === s)) await give(actor, s, PACK_FOR.spell);
      await fillMana(actor);
      return actor;
    }
    async function castOn(actor, spellName, target, { face = 18, dc = 5, answers = [] } = {}) {
      const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
      assert.ok(spell, `${actor.name} does not hold ${spellName}`);
      const unpin = pinDie(face);
      try {
        const pending = workflows().castSpell({ actor, spell, dc, targets: [refFor(target)] });
        for (const names of answers) await answer(spell.id, names);
        const card = await pending;
        if (card) made.push(card);
        return card;
      } finally { unpin(); }
    }

    it("Antivenom ends a gear poison carrier that holds Slowed, and never a disease (the old needsReview gap)", async function () {
      this.timeout(120000);
      const patient = await makeCharacter({ name: "ZZ Cure Antivenom" });
      await afflict(patient, { aff: poison("Slow Venom") });
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await until(() => afflictionsOf(patient).length === 2, "both carriers");
      const carrier = afflictionsOf(patient).find(r => r.aff.kind === "poison");
      assert.include([...carrier.effect.statuses], "slowed", "the gear poison holds no Slowed: the old gap is not under test");
      const vial = await give(patient, "Antivenom");
      const pending = workflows().useGear({ actor: patient, item: vial });
      await answer(vial.id, ["Slow Venom"]);
      const card = await pending;
      if (card) made.push(card);
      await until(() => !afflictionsOf(patient).some(r => r.aff.kind === "poison"), "the poison to end");
      assert.deepEqual(afflictionsOf(patient).map(r => r.aff.kind), ["disease"], "Antivenom touched the disease");
    });

    it("a remedy ends its disease, and another disease is refused in words with nothing spent", async function () {
      this.timeout(120000);
      const patient = await makeCharacter({ name: "ZZ Cure Remedy" });
      const poultice = await give(patient, "Silverleaf poultice");
      assert.equal(poultice.system.use.kind, "remedy", "the poultice is no remedy");
      const quantity = poultice.system.quantity;
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await until(() => rowOf(patient, "lockjaw"), "lockjaw");
      const said = await warnings(() => workflows().useGear({ actor: patient, item: poultice }));
      assert.isAbove(said.length, 0, "the refusal said nothing");
      assert.isOk(rowOf(patient, "lockjaw"), "a wrong remedy ended a disease");
      assert.equal(patient.items.get(poultice.id)?.system.quantity, quantity, "a refused remedy was spent");
      await afflict(patient, { aff: makeDisease("rotFever", { source: null, now: game.time.worldTime }) });
      await until(() => rowOf(patient, "rotFever"), "rot fever");
      const posted = await postedBy(() => workflows().useGear({ actor: patient, item: poultice }));
      await until(() => !rowOf(patient, "rotFever"), "rot fever to end");
      assert.isOk(rowOf(patient, "lockjaw"), "the remedy ended the wrong disease");
      assert.isOk(posted.find(m => /Rot/i.test(m.content)), "no card says what ended");
      const left = patient.items.get(poultice.id)?.system.quantity ?? 0;
      assert.equal(left, quantity - 1, "one dose was not spent");
    });

    it("a remedy goes on a targeted creature within 5 feet, else on the user, and refuses one further away", async function () {
      this.timeout(120000);
      const healer = await makeCharacter({ name: "ZZ Cure Healer" });
      const patient = await makeCharacter({ name: "ZZ Cure Patient" });
      const far = await makeCharacter({ name: "ZZ Cure Far" });
      await place([{ actor: healer, x: 300, y: 300 }, { actor: patient, x: 400, y: 300 }, { actor: far, x: 1200, y: 300 }]);
      await afflict(patient, { aff: makeDisease("rotFever", { source: null, now: game.time.worldTime }) });
      await afflict(far, { aff: makeDisease("rotFever", { source: null, now: game.time.worldTime }) });
      await until(() => rowOf(patient, "rotFever") && rowOf(far, "rotFever"), "both fevers");
      const poultice = await give(healer, "Silverleaf poultice", PACK_FOR.equipment);
      const tooFar = await warnings(() => workflows().useGear({ actor: healer, item: poultice, targets: [refFor(far)] }));
      assert.isAbove(tooFar.length, 0, "a creature 45 feet away was not refused in words");
      assert.isOk(rowOf(far, "rotFever"), "a far creature was cured");
      await workflows().useGear({ actor: healer, item: poultice, targets: [refFor(patient)] });
      await until(() => !rowOf(patient, "rotFever"), "the touched creature to be cured");
    });

    it("Cure Poison ends a gear poison that holds Slowed on a creature touched", async function () {
      this.timeout(180000);
      const priest = await caster("ZZ Cure Druid", "Druid", ["Cure Poison"]);
      const patient = await makeCharacter({ name: "ZZ Cure Poison Patient" });
      await place([{ actor: priest, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: poison("Slow Venom") });
      await until(() => afflictionsOf(patient).length === 1, "the poison");
      const spell = priest.items.find(i => i.name === "Cure Poison");
      const unpin = pinDie(18);
      try {
        const pending = workflows().castSpell({ actor: priest, spell, dc: 5, targets: [refFor(patient)] });
        await answer(spell.id, ["Slow Venom"]);
        const card = await pending;
        if (card) made.push(card);
        assert.isOk(card, "no card");
      } finally { unpin(); }
      await until(() => afflictionsOf(patient).length === 0, "Cure Poison to end the carrier");
    });

    it("Cleanse ends one at rank 1 and two at rank 2, and a failed cast ends nothing", async function () {
      this.timeout(240000);
      const paladin = await caster("ZZ Cure Paladin", "Paladin", ["Cleanse"]);
      const patient = await makeCharacter({ name: "ZZ Cleanse Patient" });
      await place([{ actor: paladin, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await afflict(patient, { aff: poison("Blind Venom", "Bane on the first Attack Test of each of the target's turns") });
      await until(() => afflictionsOf(patient).length === 2, "both carriers");
      // A failed Casting Test does nothing (07 s8).
      await castOn(paladin, "Cleanse", patient, { face: 1, dc: 30, answers: [["Lockjaw"]] });
      assert.equal(afflictionsOf(patient).length, 2, "a failed Cleanse ended something");
      await castOn(paladin, "Cleanse", patient, { answers: [["Lockjaw"]] });
      await until(() => afflictionsOf(patient).length === 1, "one carrier to end at rank 1");
      assert.equal(afflictionsOf(patient)[0].aff.kind, "poison", "rank 1 ended the wrong one");
      // Rank 2: two.
      await afflict(patient, { aff: makeDisease("rotFever", { source: null, now: game.time.worldTime }) });
      await until(() => afflictionsOf(patient).length === 2, "a second carrier");
      const talent = paladin.items.find(i => i.type === "talent" && i.name === "Cleanse");
      assert.ok(talent, "the Paladin has no Cleanse talent");
      await talent.update({ "system.taken": 2 });
      await until(() => paladin.talentRanks("Cleanse") >= 2, "rank 2");
      await castOn(paladin, "Cleanse", patient);
      await until(() => afflictionsOf(patient).length === 0, "two carriers to end at rank 2");
    });

    it("Cleanse at SL 3 also ends one condition, through the chooser", async function () {
      this.timeout(240000);
      const paladin = await caster("ZZ Cure Paladin Three", "Paladin", ["Cleanse"]);
      const patient = await makeCharacter({ name: "ZZ Cleanse Three Patient" });
      await place([{ actor: paladin, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await until(() => rowOf(patient, "lockjaw"), "lockjaw");
      const condition = await slowed(patient);
      const [other] = await patient.createEmbeddedDocuments("ActiveEffect", [{ name: "Blinded", statuses: ["blinded"] }]);
      await castOn(paladin, "Cleanse", patient, { dc: -10, answers: [["Slowed"]] });
      await until(() => !patient.effects.get(condition.id), "the chosen condition to end");
      assert.isOk(patient.effects.get(other.id), "one condition only: the other was ended too");
      await until(() => !rowOf(patient, "lockjaw"), "the disease to end");
    });

    it("Nature's Cure ends one poison, disease or condition and lowers Bleeding by 4", async function () {
      this.timeout(240000);
      const druid = await caster("ZZ Cure Druid Two", "Druid", ["Nature's Cure"]);
      const patient = await makeCharacter({ name: "ZZ Nature Patient" });
      await place([{ actor: druid, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: poison("Slow Venom") });
      await until(() => afflictionsOf(patient).length === 1, "the poison");
      const condition = await slowed(patient);
      const bleeding = await bleed(patient, 6);
      await castOn(druid, "Nature's Cure", patient, { answers: [["Slowed"]] });
      await until(() => !patient.effects.get(condition.id), "the condition to end");
      await until(() => patient.effects.get(bleeding.id)?.flags["azeroth-rpg"].value === 2, "Bleeding to fall by 4");
      assert.equal(afflictionsOf(patient).length, 1, "the poison was ended as well: one pick only");
    });

    it("Purging Flame deals 2 damage past armor and Ward, then ends one disease or poison", async function () {
      this.timeout(240000);
      const shaman = await caster("ZZ Cure Shaman", "Shaman", ["Purging Flame"]);
      const patient = await makeCharacter({ name: "ZZ Flame Patient", armor: [] });
      await place([{ actor: shaman, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await patient.update({ "system.ward.fire": 5 }).catch(() => {});
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await until(() => rowOf(patient, "lockjaw"), "lockjaw");
      const before = patient.system.health.value;
      // 07: "2 Fire damage, bypassing armor and Ward" - TYPED Fire, and Ward 5 takes none of it.
      const dealt = [];
      const proto = CONFIG.Actor.documentClass.prototype;
      const real = proto.applyDamage;
      proto.applyDamage = function (amount, opts = {}) {
        if (this.id === patient.id) dealt.push({ amount, type: opts.type ?? null });
        return real.call(this, amount, opts);
      };
      try {
        await castOn(shaman, "Purging Flame", patient);
        await until(() => !rowOf(patient, "lockjaw"), "the disease to end");
        await until(() => patient.system.health.value === before - 2, "exactly 2 damage");
      } finally { proto.applyDamage = real; }
      assert.deepEqual(dealt, [{ amount: 2, type: "fire" }], "the cure's damage was not 2 typed Fire");
    });

    it("a poison coated on a weapon never poisons the user: it lays on the TARGET the weapon hits (Test or no Test)", async function () {
      this.timeout(240000);
      const user = await makeCharacter({ name: "ZZ Coat User", classes: [["Rogue", 3]], weapons: ["Dagger"] });
      const dagger = user.items.find(i => i.name === "Dagger");
      await user.updateEmbeddedDocuments("Item", [{ _id: dagger.id, "system.equipped": true }]);
      const foe = await makeNpc("Kobold");
      const spare = await makeNpc("Kobold");
      await place([{ actor: user, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, disposition: "HOSTILE" }, { actor: spare, x: 1000, y: 1100, disposition: "HOSTILE" }]);
      const userIsClean = what => {
        assert.lengthOf(afflictionsOf(user), 0, `${what}: the user carries an affliction`);
        assert.isFalse(user.statuses.has("poisoned"), `${what}: the user is Poisoned`);
        assert.isFalse(user.statuses.has("slowed"), `${what}: the user is Slowed`);
      };
      const hit = async target => {
        const unpin = pinDie(19);
        try {
          const posted = await postedBy(() => attackWithDialog(user, dagger, null, { targets: [refFor(target)] }));
          return posted.find(m => m.flags?.["azeroth-rpg"]?.kind === "attack");
        } finally { unpin(); }
      };

      // A poison with a Test: coating changes nothing on the user; a hit offers the TARGET's Test; its failure lays the carrier on the target.
      const deathweed = await give(user, "Deathweed extract");
      await workflows().useGear({ actor: user, item: deathweed });
      assert.equal(dagger.getFlag("azeroth-rpg", "coating")?.key, "deathweedextract", "the poison did not land on the blade");
      userIsClean("after coating with a Test poison");
      const card = await hit(foe);
      assert.ok(card, "no attack card");
      assert.equal(card.flags["azeroth-rpg"].poisons?.[0]?.afflict?.key, "deathweedextract", "the hit offers no Test");
      assert.lengthOf(afflictionsOf(foe), 0, "the poison laid before the target's Test");
      userIsClean("after the hit");
      const failing = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(buttonFor({
          action: "resistTest", purpose: "poison", poisonIndex: "0", actorUuid: foe.uuid, resilience: "body", dc: "14"
        }), card);
      } finally { failing(); }
      await until(() => rowOf(foe, "deathweedextract"), "the carrier on the target");
      userIsClean("after the target's failed Test");

      // A poison with no Test: the hit lays it on the target at once; the user is untouched.
      await dagger.unsetFlag("azeroth-rpg", "coating");
      const crippling = await give(user, "Crippling poison");
      await workflows().useGear({ actor: user, item: crippling });
      assert.equal(dagger.getFlag("azeroth-rpg", "coating")?.key, "cripplingpoison", "the second poison did not land on the blade");
      userIsClean("after coating with a no-Test poison");
      await hit(spare);
      await until(() => rowOf(spare, "cripplingpoison"), "the carrier on the target of the no-Test poison");
      assert.isTrue(spare.statuses.has("slowed"), "the target is not Slowed");
      userIsClean("after the no-Test hit");
    });

    it("Cure Blight ends every poison and disease and takes Bleeding to 0", async function () {
      this.timeout(240000);
      const druid = await caster("ZZ Cure Druid Three", "Druid", ["Cure Blight"]);
      const patient = await makeCharacter({ name: "ZZ Blight Patient" });
      await place([{ actor: druid, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: poison("Slow Venom") });
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      await until(() => afflictionsOf(patient).length === 2, "both carriers");
      const bleeding = await bleed(patient, 5);
      await castOn(druid, "Cure Blight", patient);
      await until(() => afflictionsOf(patient).length === 0, "every carrier to end");
      await until(() => !patient.effects.get(bleeding.id)?.statuses.has("bleeding"), "Bleeding to reach 0");
    });

    it("Absolution ends every condition, poison and disease, heals 8 and lays a Bane", async function () {
      this.timeout(240000);
      const priest = await caster("ZZ Cure Priest", "Priest", ["Absolution"]);
      const patient = await makeCharacter({ name: "ZZ Absolve Patient" });
      await place([{ actor: priest, x: 1000, y: 1000 }, { actor: patient, x: 1100, y: 1000 }]);
      await afflict(patient, { aff: poison("Slow Venom") });
      await afflict(patient, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
      const condition = await slowed(patient);
      await until(() => afflictionsOf(patient).length === 2, "both carriers");
      const max = patient.system.health.max;
      await patient.update({ "system.health.value": Math.max(1, max - 12) });
      const before = patient.system.health.value;
      await castOn(priest, "Absolution", patient);
      await until(() => afflictionsOf(patient).length === 0 && !patient.effects.get(condition.id), "everything to end");
      await until(() => patient.system.health.value === Math.min(max, before + 8), "8 Health");
    });

    it("Moonwell, at the start of an ally's turn, heals 4 and ends one poison", async function () {
      this.timeout(300000);
      const druid = await caster("ZZ Cure Moon Druid", "Druid", ["Moonwell"]);
      const ally = await makeCharacter({ name: "ZZ Moon Ally" });
      await place([{ actor: druid, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      const spell = druid.items.find(i => i.name === "Moonwell");
      const unpin = pinDie(18);
      let card;
      try { card = await workflows().castSpell({ actor: druid, spell, dc: 5 }); } finally { unpin(); }
      assert.isOk(card, "no card");
      made.push(card);
      const region = await placeArea({ item: spell, scene, origin: { x: 1100, y: 1000 }, flags: regionFlagsFromCard(card, druid, spell) });
      assert.ok(region, "no Region");
      await afflict(ally, { aff: poison("Slow Venom") });
      await until(() => afflictionsOf(ally).length === 1, "the poison");
      const max = ally.system.health.max;
      await ally.update({ "system.health.value": Math.max(1, max - 10) });
      const before = ally.system.health.value;
      const combat = await Combat.create({ scene: scene.id });
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [druid, ally].map(a => ({ actorId: a.id, tokenId: tokenOf(a).id, sceneId: scene.id })));
      const started = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await started;
      await giveTurn(combat, ally);
      await until(() => afflictionsOf(ally).length === 0, "Moonwell to end the poison at the ally's turn");
      await until(() => ally.system.health.value >= Math.min(max, before + 4), "4 Health from the well");
    });

    it("Restoration and Deliverance end every poison and disease inside the placed area, Deliverance only on the willing", async function () {
      this.timeout(300000);
      const priest = await caster("ZZ Cure Area Priest", "Priest", ["Deliverance"]);
      const druid = await caster("ZZ Cure Area Druid", "Druid", ["Restoration"]);
      const ally = await makeCharacter({ name: "ZZ Area Ally" });
      const foe = await makeNpc("Bandit");
      await place([
        { actor: priest, x: 2000, y: 1200 }, { actor: druid, x: 2100, y: 1200 },
        { actor: ally, x: 2200, y: 1200 }, { actor: foe, x: 2300, y: 1200, disposition: "HOSTILE" }
      ]);
      const sicken = async who => { await afflict(who, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) }); await until(() => rowOf(who, "lockjaw"), "lockjaw"); };
      await sicken(ally); await sicken(foe); await sicken(priest);
      const cast = async (who, spell) => {
        const item = who.items.find(i => i.name === spell);
        const unpin = pinDie(18);
        try { return await workflows().castSpell({ actor: who, spell: item, dc: 5 }); } finally { unpin(); }
      };
      // Deliverance: the willing only; the caster is left Fatigued.
      const fatigue = priest.system.fatigue ?? 0;
      let card = await cast(priest, "Deliverance");
      made.push(card);
      const deliverance = priest.items.find(i => i.name === "Deliverance");
      const region = await placeArea({ item: deliverance, scene, origin: { x: 2200, y: 1200 }, flags: regionFlagsFromCard(card, priest, deliverance) });
      await cureAreaOnPlace(region, priest, "Deliverance");
      await until(() => !rowOf(ally, "lockjaw") && !rowOf(priest, "lockjaw"), "the willing to be cured");
      assert.isOk(rowOf(foe, "lockjaw"), "Deliverance cured a creature that is not willing");
      await until(() => (priest.system.fatigue ?? 0) === fatigue + 1, "the caster to be left Fatigued");
      // Restoration: everyone inside, the foe too.
      card = await cast(druid, "Restoration");
      made.push(card);
      const restoration = druid.items.find(i => i.name === "Restoration");
      const area = await placeArea({ item: restoration, scene, origin: { x: 2200, y: 1200 }, flags: regionFlagsFromCard(card, druid, restoration) });
      await sicken(ally);
      await cureAreaOnPlace(area, druid, "Restoration");
      await until(() => !rowOf(ally, "lockjaw") && !rowOf(foe, "lockjaw"), "everyone in the area to be cured");
    });

    it("a Long Rest inside a laid Haven ends every disease and poison; outside it, none", async function () {
      this.timeout(240000);
      const priest = await makeCharacter({ name: "ZZ Cure Haven Priest", classes: [["Priest", 10]] });
      const outsider = await makeCharacter({ name: "ZZ Cure Haven Outsider", classes: [["Priest", 10]] });
      await place([{ actor: priest, x: 1000, y: 1000 }, { actor: outsider, x: 3500, y: 2000 }]);
      const haven = await fromPack(PACK_FOR.spell, "Haven");
      const region = await placeArea({ item: haven, scene, origin: { x: 1000, y: 1000 }, flags: { spell: { name: "Haven" } } });
      assert.ok(region, "no Region");
      for (const who of [priest, outsider]) {
        await afflict(who, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) });
        await afflict(who, { aff: poison("Slow Venom") });
        await until(() => afflictionsOf(who).length === 2, "both carriers");
      }
      await outsider.longRest();
      assert.equal(afflictionsOf(outsider).length, 2, "a rest outside the Haven ended something");
      await priest.longRest();
      await until(() => afflictionsOf(priest).length === 0, "the Long Rest in the Haven to end both");
    });

    it("Rot-of-the-marsh ticks by the hour EVEN IN A FIGHT, and a fight never moves its clock", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Afflict Rot Fight", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Kobold");
      const combat = await fightWith([actor, foe]);
      assert.isTrue(combat.started);
      const aff = poisonFrom("Rot-of-the-marsh", "1 Fatigue an hour, even in a fight", { inFight: true });
      assert.deepEqual(aff.repeat.beats, ["hour"], "the Carried cell is not hour-only");
      const done = await afflict(actor, { aff });
      assert.isTrue(done.ok, `the carrier was not laid: ${done.reason}`);
      const before = actor.system.fatigue ?? 0;
      await game.time.advance(HOUR);
      await until(() => (actor.system.fatigue ?? 0) === before + 1, "one Fatigue from the hour, in a fight");
    });

    describe("a player's query is an intent, never a mechanic (the permission finding)", function () {
      let player;
      before(async function () { player = await User.create({ name: "ZZ Afflict Player", role: CONST.USER_ROLES.PLAYER }); });
      after(async function () { await player?.delete(); });

      const ownedBy = async (name, extra = {}) => {
        const actor = await makeCharacter({ name, classes: [["Warrior", 2]], ...extra });
        await actor.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        return actor;
      };
      const asPlayer = payload => afflictQueryHandler(payload, { user: player });

      it("refuses a forged cure, a forged update, an end, and a hand the asker does not own", async function () {
        this.timeout(120000);
        const hand = await ownedBy("ZZ Forge Hand");
        const victim = await makeCharacter({ name: "ZZ Forge Victim", classes: [["Warrior", 2]] });
        await afflict(victim, { aff: poisonFrom("Deathweed extract", "4 damage") });
        const row = await until(() => rowOf(victim, "deathweedextract"), "the carrier");
        const unrelated = (await victim.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Unrelated", statuses: ["slowed"] }]))[0];
        const hp = victim.system.health.value;
        const base = { actorUuid: victim.uuid, byUuid: hand.uuid };

        const cure = await asPlayer({ ...base, op: "cure", cure: { ends: [unrelated.id, row.id], heal: 999, damage: 999 } });
        assert.isTrue(cure.refused, "a forged cure was written");
        const heal = await asPlayer({ ...base, op: "cure", ask: { spell: "Cure Blight", heal: true, damage: true }, cure: { heal: 999 } });
        assert.isTrue(heal.refused, "a spell the hand does not hold was cured");
        const patch = await asPlayer({ ...base, op: "update", effectId: row.id, patch: { "repeat.damage": 0, "clock.nextAt": 1e12 } });
        assert.isTrue(patch.refused, "a forged patch was written");
        let threw = false;
        try { await asPlayer({ ...base, op: "end", effectId: row.id }); } catch { threw = true; }
        assert.isTrue(threw, "a player ended a carrier");
        threw = false;
        try { await asPlayer({ actorUuid: victim.uuid, byUuid: victim.uuid, op: "lay", ask: { kind: "disease", key: "rotFever" } }); } catch { threw = true; }
        assert.isTrue(threw, "a hand the asker does not own laid a carrier");

        assert.isOk(victim.effects.get(unrelated.id), "an arbitrary effect was ended");
        assert.isOk(rowOf(victim, "deathweedextract"), "the carrier was ended");
        assert.equal(rowOf(victim, "deathweedextract").aff.repeat.damage, 4, "the carrier's numbers were rewritten");
        assert.equal(victim.system.health.value, hp, "a forged heal or damage landed");
      });

      it("a lay is rebuilt from the catalogue: a forged payload's numbers are ignored and an unpublished key is refused", async function () {
        this.timeout(120000);
        const hand = await ownedBy("ZZ Forge Layer");
        const victim = await makeCharacter({ name: "ZZ Forge Laid", classes: [["Warrior", 2]] });
        const forged = { kind: "disease", key: "rotFever", name: "Plague of gods", dc: 1, repeat: { fatigue: 99 }, clock: { mode: "world", nextAt: 0 } };
        let threw = false;
        try { await asPlayer({ actorUuid: victim.uuid, byUuid: hand.uuid, op: "lay", aff: forged, ask: { kind: "poison", key: "godkiller" } }); } catch { threw = true; }
        assert.isTrue(threw, "an unpublished poison was laid");
        const done = await asPlayer({ actorUuid: victim.uuid, byUuid: hand.uuid, op: "lay", aff: forged, ask: { kind: "disease", key: "rotFever" } });
        assert.isTrue(done.ok, `the published disease was refused: ${done.reason}`);
        const laid = rowOf(victim, "rotFever");
        assert.equal(laid.aff.name, "Rot-fever", "the payload's name was used");
        assert.equal(laid.aff.dc, 12, "the payload's DC was used");
        assert.equal(laid.aff.repeat.fatigue, 1, "the payload's numbers were used");
      });
    });
  });

  describe("A bare Poisoned or Diseased is tracked (D12 R1)", function () {
    let prior;
    before(async function () {
      prior = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
    });
    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, prior);
      await cleanup();
    });

    /** A chip on the Core tab, as `effectAction` reads it. */
    const chip = condition => ({ dataset: { condition }, closest: () => null });

    /** The chooser's window for an actor or item, once rendered. */
    const chooserFor = id => until(() => {
      const a = foundry.applications.instances.get(`azeroth-choose-${id}`);
      return a?.rendered ? a : null;
    }, "the chooser");

    async function answerChooser(id, names) {
      const app = await chooserFor(id);
      const form = app.element;
      const select = form.querySelector("select[name=choice]");
      if (select) {
        const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
        assert.ok(option, `no chooser row starts with ${names[0]}: ${[...select.options].map(o => o.textContent.trim()).join(" | ")}`);
        select.value = option.value;
      } else {
        for (const box of form.querySelectorAll("input[name=choice]")) box.checked = false;
        for (const name of names) {
          const row = [...form.querySelectorAll("input[name=choice]")].find(b => b.closest("label")?.textContent.trim().startsWith(name));
          assert.ok(row, `no checkbox row starts with ${name}`);
          row.checked = true;
        }
      }
      form.querySelector('button[data-action="choose"]').click();
    }

    const bareOf = actor => [...actor.effects].filter(e => (e.statuses.has("poisoned") || e.statuses.has("diseased")) && !e.flags?.["azeroth-rpg"]?.affliction);

    it("the Core chip opens the Add picker and the picked disease is laid; cancelling applies nothing", async function () {
      this.timeout(120000);
      const { effectAction } = await import("../applications/actions.mjs");
      const actor = await makeCharacter({ name: "ZZ Bare Chip", classes: [["Warrior", 2]] });
      const pending = effectAction(actor, "toggleCondition", chip("diseased"));
      const app = await chooserFor(actor.id);
      const text = app.element.textContent;
      assert.include(text, "Lockjaw", "the disease picker does not list a disease");
      assert.notInclude(text, "Deathweed", "the disease picker lists a poison");
      await answerChooser(actor.id, ["Lockjaw"]);
      await pending;
      await until(() => rowOf(actor, "lockjaw"), "the picked disease to be laid");
      assert.isTrue(actor.statuses.has("diseased"));
      assert.lengthOf(bareOf(actor), 0, "a bare Diseased was laid beside the carrier");

      const other = await makeCharacter({ name: "ZZ Bare Chip Cancel", classes: [["Warrior", 2]] });
      const cancelled = effectAction(other, "toggleCondition", chip("poisoned"));
      const picker = await chooserFor(other.id);
      assert.notInclude(picker.element.textContent, "Lockjaw", "the poison picker lists a disease");
      await picker.close();
      await cancelled;
      await settle();
      assert.equal(other.effects.size, 0, "cancelling the picker applied something");
    });

    it("a bare Poisoned made by a code door is wrapped as a carrier, and the clock re-lays what the chip sheds", async function () {
      this.timeout(120000);
      const { effectAction } = await import("../applications/actions.mjs");
      const actor = await makeCharacter({ name: "ZZ Bare Wrap", classes: [["Warrior", 3]] });
      const [made1] = await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Serpent Ward", statuses: ["poisoned"], system: { changes: [] },
        duration: { value: 2, units: "rounds", expiry: "turnEnd" },
        flags: { "azeroth-rpg": { value: 2, shedDc: { dc: 15, source: "Serpent Ward" } } }
      }]);
      const row = await until(() => rowOf(actor, "serpentward"), "the wrapped carrier");
      assert.equal(row.id, made1.id, "the bare effect was not wrapped in place");
      assert.equal(row.aff.kind, "poison");
      assert.equal(row.aff.name, "Serpent Ward");
      assert.equal(row.aff.dc, 15, "the shed DC was lost");
      assert.equal(row.aff.repeat.value, 2);
      assert.isNull(row.effect._source.duration?.value ?? null, "the wrapped poison still has a duration");
      assert.isNull(row.effect._source.start ?? null, "the wrapped poison still has a start");
      assert.equal(row.effect.getFlag("azeroth-rpg", "value"), 2);
      assert.deepEqual(row.effect.getFlag("azeroth-rpg", "shedDc"), { dc: 15, source: "Serpent Ward" });
      assert.isTrue(row.effect.statuses.has("poisoned"));
      assert.lengthOf(afflictionsOf(actor), 1);

      // The Core stepper changes the STACKS and never the carrier.
      await effectAction(actor, "stepCondition", { dataset: { condition: "poisoned", delta: "1" }, closest: () => null });
      await until(() => row.effect.getFlag("azeroth-rpg", "value") === 3, "the stacks to rise");
      assert.ok(actor.effects.get(row.id), "stepping deleted the carrier");

      // The chip's off-toggle sheds the stacks and keeps the carrier.
      const told = await warnings(async () => {
        await effectAction(actor, "toggleCondition", chip("poisoned"));
        await until(() => !row.effect.statuses.has("poisoned"), "Poisoned to be shed");
      });
      assert.ok(actor.effects.get(row.id), "the chip deleted the carrier");
      assert.equal(row.effect.getFlag("azeroth-rpg", "value"), 0);
      assert.isFalse(actor.statuses.has("poisoned"));
      void told;

      // The poison lays it again at its next beat.
      await game.time.advance(HOUR);
      await until(() => actor.effects.get(row.id)?.statuses.has("poisoned") && actor.effects.get(row.id)?.getFlag("azeroth-rpg", "value") === 2,
        "the next hour to lay Poisoned 2 again");
    });

    it("clearing Diseased from the chip or the strip is refused in words; the panel's end still works", async function () {
      this.timeout(120000);
      const { effectAction } = await import("../applications/actions.mjs");
      const { clearRefusal } = await import("../rules/in-play.mjs");
      const actor = await makeCharacter({ name: "ZZ Bare Diseased", classes: [["Warrior", 2]] });
      assert.isTrue((await afflict(actor, { aff: makeDisease("lockjaw", { source: null, now: game.time.worldTime }) })).ok);
      const row = await until(() => rowOf(actor, "lockjaw"), "lockjaw");
      await until(() => row.effect.statuses.has("diseased"), "Diseased to show");
      const said = await warnings(async () => { await effectAction(actor, "toggleCondition", chip("diseased")); });
      assert.deepEqual(said, [game.i18n.localize("AZEROTH.Afflictions.Bare.DiseasedClear")], "the refusal is not in words");
      assert.ok(actor.effects.get(row.id), "the chip deleted the disease's carrier");
      assert.equal(clearRefusal({ kind: "condition", id: "diseased", carried: true }), "AZEROTH.Afflictions.Bare.DiseasedClear");
      const conditions = (await import("../applications/actions.mjs")).effectsContext(actor).conditions;
      assert.isTrue(conditions.find(c => c.id === "diseased").carried, "the context does not mark the chip as a carrier's");
      const { endAffliction } = await import("../effects/afflictions.mjs");
      await endAffliction(actor, row.id);
      await until(() => !actor.effects.get(row.id), "the panel's end");
    });

    it("Antivenom cures a wrapped bare poison", async function () {
      this.timeout(120000);
      const actor = await makeCharacter({ name: "ZZ Bare Antivenom", classes: [["Warrior", 3]] });
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Wasp Sting", statuses: ["poisoned"], system: { changes: [] },
        flags: { "azeroth-rpg": { value: 1, shedDc: { dc: 13, source: "Wasp Sting" } } }
      }]);
      const row = await until(() => rowOf(actor, "waspsting"), "the wrapped Wasp Sting");
      const vial = await give(actor, "Antivenom");
      const pending = workflows().useGear({ actor, item: vial });
      await answerChooser(vial.id, ["Wasp Sting"]);
      const card = await pending;
      if (card) made.push(card);
      await until(() => !actor.effects.get(row.id), "Antivenom to end the wrapped poison");
      assert.lengthOf(afflictionsOf(actor), 0);
    });
  });

}
