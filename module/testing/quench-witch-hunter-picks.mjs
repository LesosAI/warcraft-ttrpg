/**
 * **THE WITCH HUNTER'S PICKS, ITS ONE SPELL DC AND THE LAST HUNT'S CLIP, THROUGH THE REAL DOORS** (the Witch Hunter
 * plan's wave 2c; O-727, O-735). One batch, run alone (`QUENCH_BATCH=azeroth-rpg.witch-hunter-picks`), every test
 * making its own `ZZ WH ...` actors and leaving nothing another test reads:
 *
 * - the creator's brews step driven through `apply(state)`: a Witch Hunter made with four elixirs, an oil, a bomb and
 *   a second Tome type, read back off the actor; and the step's refusal in words, with nothing made;
 * - the Hunter panel's **Learn formulas** pressed on a tier 2 hunter, each kind's chooser answered in the window;
 * - a pick past the tier's count refused in words, nothing written;
 * - the Spell DC with an Epic medallion worn and a Firebloom cordial drunk: the derived numbers and what the Combat
 *   tab prints (`[data-wh-dc]`, which wave 3's panel draws off `hunterPanelFor`'s `dc`);
 * - The Last Hunt's end clipping a stored 9 Tempo to 5, by a delete and by a rest.
 *
 * Needs the class, its brews and its medallion in the compiled packs. Written in wave 2c; wave 4 runs it.
 */

import { cleanup, fromPack, give, made, makeCharacter, openSheet, PACK_FOR, warnings } from "./fixtures.mjs";
import { until } from "./quench-chronomancer-common.mjs";
import { BREW_IDENTIFIERS, brewOf } from "../rules/witch-hunter-brews.mjs";
import { FORMULAS_FLAG, LAST_HUNT_FLAG, TOME_FLAG } from "../rules/witch-hunter-standing.mjs";
import { knownCount } from "../rules/brewing.mjs";

const SCOPE = "azeroth-rpg";
const TIER1 = ["liferoot-tonic", "kingsblood-draught", "peacebloom-draught", "mageroyal-draught", "hunters-oil", "liquid-fire"];
const tempoEntry = actor => {
  const pool = actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tempo") ?? null;
  return pool ? { pool, stored: actor.system.classes.find(c => c.itemId === pool.itemId)?.momentum?.value ?? 0 } : null;
};
const kindCount = (ids, kind) => (ids ?? []).filter(id => brewOf(id)?.kind === kind).length;

/** A Human Witch Hunter at a level, its Tome begun and its formulas known. */
async function hunterWith(name, { level = 1, second = "beast", formulas = TIER1, abilities = { str: 16, con: 14, int: 14, wis: 14 } } = {}) {
  const actor = await makeCharacter({ name, classes: [["Witch Hunter", level]], race: "Human", abilities });
  await until(() => tempoEntry(actor), "the Tempo pool");
  if (second) await (await import("../effects/witch-hunter-tome.mjs")).startTome(actor, { choice: second });
  if (formulas) await (await import("../effects/witch-hunter-brews.mjs")).chooseFormulas(actor, { picks: formulas });
  return actor;
}

/** Answer every chooser the Learn formulas press opens, ticking the first `n` rows still open in each. */
async function answerChoosers(feature, counts) {
  for (const n of counts) {
    let dialog = null;
    await until(() => (dialog = [...foundry.applications.instances.values()].find(a => a.id === `azeroth-choose-${feature.id}` && a.rendered)) !== undefined && dialog, "a Learn formulas chooser", 20000);
    const open = [...dialog.element.querySelectorAll('input[name="choice"]:not(:disabled)')];
    if (open.length && open[0].type === "radio") open[0].checked = true;
    else for (const box of open.slice(0, n)) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    dialog.element.querySelector('button[data-action="choose"]').click();
    await until(() => !dialog.rendered, "the chooser closed", 20000);
  }
}

export function witchHunterPicksBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Witch Hunter's picks, its one Spell DC and The Last Hunt's clip (wave 2c)", function () {
    before(async function () {
      this.timeout(60000);
      const index = await game.packs.get("azeroth-rpg.classes").getIndex();
      if (!index.some(e => e.name === "Witch Hunter")) throw new Error("the classes pack holds no Witch Hunter: run packs:parse and rebuild the packs");
    });
    after(async function () {
      this.timeout(90000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.id?.startsWith("azeroth-creator") || app.id?.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      await cleanup();
    });

    const uuidOf = async (packId, name) => (await fromPack(packId, name)).uuid;
    /** A Human Witch Hunter as the creator takes it: 01's array, the kit, and the brews step's picks. */
    async function proposal(overrides = {}) {
      return {
        race: await uuidOf(PACK_FOR.race, "Human"),
        cls: await uuidOf(PACK_FOR.class, "Witch Hunter"),
        method: "array",
        abilities: { str: 16, dex: 13, con: 14, int: 12, wis: 10, cha: 8 },
        rolled: null,
        profession: await uuidOf(PACK_FOR.profession, "Wilderness Survival"),
        ranks: { survival: 3, medicine: 2 },
        adaptable: "athletics",
        racialTalent: "Refugee's Road",
        classTalent: "extra-measure",
        spells: [],
        formulas: [...TIER1],
        tomeType: "beast",
        side: null,
        equipment: [
          { uuid: await uuidOf(PACK_FOR.armor, "Studded leather"), quantity: 1, road: false },
          { uuid: await uuidOf(PACK_FOR.weapon, "Longsword"), quantity: 1, road: false },
          { uuid: await uuidOf(PACK_FOR.weapon, "Dagger"), quantity: 1, road: false },
          { uuid: await uuidOf(PACK_FOR.equipment, "Witch hunter's medallion"), quantity: 1, road: false }
        ],
        name: "ZZ WH Made",
        img: "icons/svg/mystery-man.svg",
        motive: "The Drust are not gone.",
        ...overrides
      };
    }
    const creatorOf = () => new (game.system.azeroth.creator)({});

    it("the creator walks a brews step for a Witch Hunter, and Finish writes the formulas and the Tome read back off the actor", async function () {
      this.timeout(180000);
      const creator = creatorOf();
      await creator.setState(await proposal());
      assert.equal(await creator.goTo("brews"), "brews");
      await creator.render({ force: true });
      await until(() => creator.element?.querySelector('[data-brew-kind="elixir"]'), "the brews step drawn");
      assert.equal(creator.element.querySelectorAll('input[data-creator="formula"]').length, BREW_IDENTIFIERS.filter(id => brewOf(id).kind !== "decoction").length, "every formula of 08's table is a row");
      assert.ok(creator.element.querySelector('select[name="tomeType"] option[value="beast"]'), "the Tome's second type is a choice");
      assert.isNull(creator.element.querySelector('select[name="tomeType"] option[value="undead"]'), "Undead is the Tome's already");
      const result = await creator.apply(await proposal());
      assert.isTrue(result.ok, `the creator refused: ${JSON.stringify(result.reasons)}`);
      const actor = result.actor;
      made.push(actor);
      assert.deepEqual(actor.getFlag(SCOPE, FORMULAS_FLAG), TIER1, "the formulas chosen, in 08's order");
      const tome = actor.getFlag(SCOPE, TOME_FLAG);
      assert.deepEqual(tome.known, ["undead", "beast"], "Undead and the type of choice");
      assert.deepEqual(tome.studied, ["beast"], "Studied begins on the type of choice");
      const { hunterPanelFor } = await import("../effects/witch-hunter-brews.mjs");
      const panel = hunterPanelFor(actor);
      assert.equal(panel.formulasLeft, 0, "tier 1's six are known, none left to learn");
      assert.isTrue(panel.started, "the Tome is begun, so the panel asks for no type");
      // **THE FIRST BREWING** (the lead, 2026-11-27: *"Field Brews chosen at character creation should have doses available
      // at start"*): Finish opens the brewing window and the Prepare window, and brewing in it makes doses to carry.
      const { brewWindow, prepareBrews } = await import("../effects/witch-hunter-brews.mjs");
      await until(() => brewWindow(actor), "Finish opens the first brewing window");
      await until(() => foundry.applications.instances.get(`azeroth-brew-prepare-${actor.id}`), "Finish opens the Prepare window");
      const prepareApp = foundry.applications.instances.get(`azeroth-brew-prepare-${actor.id}`);
      await until(() => prepareApp.element?.querySelector("[data-brew-row]"), "the Prepare rows are drawn");
      const rows = [...prepareApp.element.querySelectorAll("[data-brew-row]")];
      assert.isAbove(rows.length, 0, "a row for each formula");
      for (const row of rows) assert.isAbove((row.dataset.tooltip ?? "").length, 10, `${row.dataset.brewRow} carries a tooltip`);
      for (const box of prepareApp.element.querySelectorAll("[data-brew-studied]")) assert.isAbove((box.closest("label")?.dataset.tooltip ?? "").length, 10, `${box.value} (Studied) carries a tooltip`);
      const doses = Math.max(2, 2 + (actor.system.abilities.wis.mod ?? 0));
      const elixir = TIER1.find(id => brewOf(id).kind === "elixir");
      const done = await prepareBrews(actor, { picks: { [elixir]: doses }, studied: ["beast"] });
      assert.isOk(done?.ok, "the first brewing is made");
      const held = actor.items.find(i => i.system?.identifier === elixir);
      assert.equal(held?.system?.quantity, doses, "the doses are in hand at the start");
      assert.isAbove((hunterPanelFor(actor).brews.find(b => b.id === held.id)?.tip ?? "").length, 10, "the Hunter panel's held brew carries its tip");
      await foundry.applications.instances.get(`azeroth-brew-prepare-${actor.id}`)?.close().catch(() => {});
    });

    it("the brews step refuses a short count and a missing type in words, and Finish makes nothing", async function () {
      this.timeout(120000);
      const creator = creatorOf();
      const before = game.actors.size;
      const short = await creator.apply(await proposal({ name: "ZZ WH Never", formulas: TIER1.slice(0, 5), tomeType: null }));
      assert.isFalse(short.ok);
      const codes = short.reasons.filter(r => r.step === "brews").map(r => r.code);
      assert.includeMembers(codes, ["formulaCount", "tomeType"]);
      assert.equal(game.actors.size, before, "a refused proposal makes no actor");
      await creator.close().catch(() => {});
    });

    it("the Hunter panel's Learn formulas, pressed on a tier 2 hunter, offers what the tier opened and writes it once", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Learns", { level: 5 });
      const sheet = await openSheet(wh);
      const control = sheet.element.querySelector('section[data-tab="combat"] [data-action="whFormulas"]');
      assert.ok(control, "the Hunter panel draws Learn formulas while the tier leaves formulas open");
      const feature = wh.items.find(i => i.type === "feature" && i.name === "Field Brews") ?? wh.items.find(i => i.type === "class");
      control.click();
      // Tier 2: elixirs 6 (2 open), oils 2 (1 open), bombs 2 (1 open).
      await answerChoosers(feature, [2, 1, 1]);
      await until(() => (wh.getFlag(SCOPE, FORMULAS_FLAG) ?? []).length === 10, "ten formulas known");
      const known = wh.getFlag(SCOPE, FORMULAS_FLAG);
      assert.equal(kindCount(known, "elixir"), knownCount("elixir", 2));
      assert.equal(kindCount(known, "oil"), knownCount("oil", 2));
      assert.equal(kindCount(known, "bomb"), knownCount("bomb", 2));
      await sheet.close();
    });

    it("a pick past the count the tier allows is refused in words, and nothing is written", async function () {
      this.timeout(120000);
      const wh = await hunterWith("ZZ WH Too Many");
      const { chooseFormulas } = await import("../effects/witch-hunter-brews.mjs");
      let out;
      const said = await warnings(async () => { out = await chooseFormulas(wh, { picks: ["goldthorn-draught"] }); });
      assert.isNull(out);
      assert.ok(said.some(s => s.length > 0), "the refusal is said in words");
      assert.deepEqual(wh.getFlag(SCOPE, FORMULAS_FLAG), TIER1, "nothing written");
    });

    it("an Epic medallion and a Firebloom cordial: one Spell DC, derived once, printed on the Combat tab", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH DC", { formulas: [...TIER1.slice(0, 3), "firebloom-cordial", "hunters-oil", "liquid-fire"] });
      const base = 10 + wh.system.abilities.int.mod + wh.system.proficiency;
      const medallion = await give(wh, "Witch hunter's medallion");
      await medallion.update({ "system.rarity": "epic", "system.equipped": true });
      await until(() => wh.system.spellDC === base + 3, "Epic adds 3 to the derived Spell DC");
      assert.equal(wh.system.signDC, base + 3, "no cordial yet");
      const { useBrew, whSpellDC } = await import("../effects/witch-hunter-brews.mjs");
      const cordial = await give(wh, brewOf("firebloom-cordial").name);
      await cordial.update({ [`flags.${SCOPE}.whBrewed`]: { maker: wh.uuid, generation: 0, brewed: 1, type: null, school: null, spellDC: whSpellDC(wh), tier: 1 } });
      await useBrew({ actor: wh, item: wh.items.get(cordial.id) });
      await until(() => wh.system.signDC === base + 4, "Firebloom cordial adds 1 at tier 1, to the Signs' DC alone");
      assert.equal(wh.system.spellDC, base + 3, "a bomb's and the drink's DC take no cordial");
      assert.equal(whSpellDC(wh), base + 3, "the reader adds nothing");
      assert.equal(whSpellDC(wh, { sign: true }), base + 4, "the Sign's reader adds nothing");
      const sheet = await openSheet(wh);
      const combat = sheet.element.querySelector('section[data-tab="combat"]');
      const spell = combat.querySelector('[data-wh-dc="spell"]');
      const sign = combat.querySelector('[data-wh-dc="sign"]');
      assert.ok(spell, "the Hunter panel prints the Spell DC (`data-wh-dc=\"spell\"`)");
      assert.include(spell.textContent, String(base + 3));
      assert.ok(sign, "the Hunter panel prints the Signs' DC (`data-wh-dc=\"sign\"`)");
      assert.include(sign.textContent, String(base + 4));
      await sheet.close();
    });

    it("The Last Hunt's end clips a stored 9 Tempo to 5, whether its carrier is deleted or a rest ends it", async function () {
      this.timeout(180000);
      const wh = await hunterWith("ZZ WH Last Hunt", { level: 20 });
      const lay = async () => {
        const [effect] = await wh.createEmbeddedDocuments("ActiveEffect", [{
          name: "The Last Hunt", img: "icons/svg/sun.svg", origin: wh.uuid, system: { changes: [] },
          flags: { [SCOPE]: { [LAST_HUNT_FLAG]: { by: wh.uuid, combatId: null }, restEnds: "short" } }
        }]);
        await until(() => tempoEntry(wh).pool.max === 10, "Tempo capped at 10 while it stands");
        const { pool } = tempoEntry(wh);
        await wh.writePoolsNow([{ itemId: pool.itemId, kind: "momentum", value: 9 }]);
        await until(() => tempoEntry(wh).stored === 9, "9 Tempo stored");
        return effect;
      };
      const first = await lay();
      await first.delete();
      await until(() => tempoEntry(wh).stored === 5, "the delete clipped the stored Tempo to 5");
      assert.equal(tempoEntry(wh).pool.value, 5);
      await lay();
      await wh.clearRestEnds("short");
      await until(() => !wh.effects.some(e => e.flags?.[SCOPE]?.[LAST_HUNT_FLAG]), "a rest ends The Last Hunt");
      await until(() => tempoEntry(wh).stored === 5, "and its end clipped the stored Tempo to 5");
    });
  });
}
