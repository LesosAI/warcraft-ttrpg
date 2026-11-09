/**
 * **THE CHROMATIC CHAMPION'S ENGINE, LIVE** (stage 1B of the Chromatic Champion plan,
 * `F:/tmp/chromatic-champion/PLAN.md`): the general machinery the tenth class needs,
 * driven through the real doors.
 *
 * - finding 1: a Rogue's Energy takes no Mana gift (`pools.mjs#manaPool`);
 * - finding 2: a Sustain a talent pays in Rage is recorded in Rage and upkept there;
 * - the Ward maximum: a stack past 10 reads 10 on a character and a creature, a laid
 *   `final` change included, and Anti-Magic Shield's 8 still lands;
 * - four branches on a class item;
 * - the Mortal guise: the creator's strip, the Outcast set for the Champion, the guise
 *   written, its size and tongue, no guise talents, the sheet's line;
 * - an Outcast Warrior made through `apply(state)`, its class and guise kept (the lead,
 *   2026-11-09: the Outcast opens the Warrior, Mage, Rogue and Warlock as well);
 * - no multiclassing either way, refused in words with nothing embedded;
 * - Draconic Discipline: the called shot's payer and a Parry in Energy;
 * - a free cast once per Short Rest, ticked, spent and refilled; the Void a branch spell
 *   builds;
 * - the drake form as 02 writes it (the 1B review's MUST-FIX): no score taken, what is
 *   worn melded and its Augment still counting, the block's attacks in place of the
 *   weapons, the better of the block's and the character's own Defense and Armor Points -
 *   the melded suit's included - Large, 240 feet flying, kept through a rest and 0 Health,
 *   left only by the Champion.
 *
 * **WRITTEN, NOT YET RUN** (the plan's stage 1B): most of it needs the Champion's pack
 * documents (the class, the Chromatic Outcast, the four drake blocks) and its talent and
 * feature rows, which a later stage brings. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.chromatic-engine`. Every document a test makes is deleted in
 * `after`.
 */

import { cleanup, fromPack, give, made, makeCharacter, makeNpc, PACK_FOR, pinDie, settle, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { giveMana } from "../effects/gifts.mjs";
import { antiMagicShieldEffect } from "../rules/anti-magic-shield.mjs";
import { WARD_MAX } from "../rules/ward.mjs";
import { FREE_CAST_FLAG } from "../rules/free-casts.mjs";
import { takeShape, leaveShape } from "../documents/shapes.mjs";

const CHAMPION = "Chromatic Champion";
const OUTCAST = "Chromatic Outcast";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** The roll dialog skipped (the setting is the STRING "skip"), the die pinned. */
async function pressed(face, fn) {
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  try { return await fn(); } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  }
}

const pool = (actor, name) => (actor.poolSnapshot?.() ?? []).find(p => p.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;

export function chromaticEngineBatch(context) {
  const { describe, it, after, assert } = context;

  describe("the Chromatic Champion's engine (the plan's stage 1B)", function () {
    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    it("finding 1: a Rogue's Energy takes no Mana gift", async function () {
      this.timeout(60000);
      const rogue = await makeCharacter({ name: "ZZ Engine Rogue", classes: [["Rogue", 3]] });
      await until(() => pool(rogue, "energy"), "the Rogue's Energy");
      const energy = pool(rogue, "energy");
      await rogue.updatePool({ itemId: energy.itemId, kind: "power", value: 2 });
      await until(() => pool(rogue, "energy")?.value === 2, "the Energy lowered");
      const landed = await giveMana({ giver: rogue, recipient: rogue, amount: 4 });
      assert.equal(landed, 0, "a Mana gift landed in a Rogue's Energy");
      assert.equal(pool(rogue, "energy").value, 2, "the Energy moved");
    });

    it("finding 2: a Sustain a talent pays in Rage is held and upkept in Rage", async function () {
      this.timeout(90000);
      const champion = await makeCharacter({ name: "ZZ Engine Hearth", classes: [[CHAMPION, 5]], race: OUTCAST, talents: ["Hearthfire"] });
      await champion._talentGrant;
      const hearth = champion.items.find(i => i.type === "talent" && i.name === "Hearthfire");
      await hearth.update({ "system.taken": 1 });
      const immolation = await until(() => spellNamed(champion, "Immolation"), "Hearthfire's Immolation learned");
      const rage = pool(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: "momentum", value: 5 });
      await until(() => pool(champion, "rage")?.value === 5, "the Rage raised");
      await pressed(20, () => game.system.azeroth.workflows.castSpell({ actor: champion, spell: immolation }));
      const entry = await until(() => (champion.getFlag("azeroth-rpg", "sustaining") ?? []).find(e => e.name === "Immolation"), "the Sustain recorded");
      assert.equal(entry.pool, "rage", "the Sustain does not name the Rage it is paid in");
      // The upkeep's own rule over the pools as they stand: Rage, never Energy.
      const { upkeep } = await import("../rules/turn-effects.mjs");
      const r = upkeep([entry], champion.poolSnapshot(), { costOf: () => 1 });
      assert.deepEqual(r.paidIn, { rage: 1 });
      assert.ok(r.updates.every(u => u.kind === "momentum"), "the upkeep wrote the Energy");
    });

    it("holds every Ward to 10 after the final phase, on a character and a creature, and leaves Anti-Magic Shield's 8", async function () {
      this.timeout(60000);
      const warrior = await makeCharacter({ name: "ZZ Engine Ward", classes: [["Warrior", 5]] });
      await warrior.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Ward stack", system: { changes: [
          { key: "system.ward.fire", type: "add", value: "4", phase: "final" },
          { key: "system.ward.fire", type: "add", value: "3", phase: "final" },
          { key: "system.ward.fire", type: "add", value: "5", phase: "final" }
        ] }
      }]);
      await until(() => warrior.system.ward.fire === WARD_MAX, "the Ward clamped to 10");
      assert.equal(warrior.system.ward.fire, 10, "a Ward of 12 read past the maximum");
      // The sheet's own row reads the clamped number.
      const sheet = warrior.sheet;
      await sheet.render({ force: true });
      await settle();
      await sheet.close();
      // Anti-Magic Shield's upgrade to 8 still lands under the cap.
      const shield = antiMagicShieldEffect({ sourceUuid: warrior.uuid, cast: "zz-cast", time: game.time.worldTime });
      await warrior.createEmbeddedDocuments("ActiveEffect", [shield]);
      await until(() => warrior.system.ward.frost === 8, "Anti-Magic Shield's Ward 8");
      assert.equal(warrior.system.ward.fire, 10, "the stack lost its cap under the Shield");
      // A creature the suite leans on everywhere (no "Kobold Miner" was ever in 14).
      const ogre = await makeNpc("Plagued Ghoul");
      await ogre.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Creature Ward", system: { changes: [{ key: "system.ward.shadow", type: "add", value: "14", phase: "final" }] }
      }]);
      await until(() => ogre.system.ward.shadow === WARD_MAX, "the creature's Ward clamped");
    });

    it("lets a class item carry four branches", async function () {
      this.timeout(30000);
      const item = await Item.create({ name: "ZZ Four Branches", type: "class", system: { branches: [
        { name: "Life-Binder" }, { name: "Spell-Weaver" }, { name: "Timewalker" }, { name: "Earth-Warder" }
      ] } });
      made.push(item);
      assert.equal(item.system.branches.length, 4, "the fourth branch was cut");
    });

    it("walks the Mortal guise for the Champion, sets the Outcast and writes the guise", async function () {
      this.timeout(120000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        const champion = await fromPack(PACK_FOR.class, CHAMPION);
        const dwarf = await fromPack(PACK_FOR.race, "Dwarf");
        const outcast = await fromPack(PACK_FOR.race, OUTCAST);
        await creator.setState({ race: dwarf.uuid, cls: champion.uuid, step: "guise" });
        await settle();
        assert.equal(creator.state.race, outcast.uuid, "the Champion did not set the Outcast");
        assert.equal(creator.state.guise, dwarf.uuid, "the people picked did not become the guise");
        const strip = [...creator.element.querySelectorAll(".azeroth-creator-step")].map(b => b.dataset.step);
        assert.include(strip, "guise");
        assert.notInclude(strip, "race");
        const career = (await game.packs.get(PACK_FOR.career).getDocuments()).find(c => (c.system?.tier ?? 1) === 1);
        const racial = (outcast.system.talents ?? []).find(t => (t.tier ?? 1) <= 1);
        const classTalent = (await game.packs.get(PACK_FOR.talent).getIndex({ fields: ["system.className", "system.tier", "system.identifier", "system.race"] }))
          .find(t => t.system?.className === CHAMPION && (t.system?.tier ?? 1) === 1 && !t.system?.race);
        const result = await creator.apply({
          method: "array", abilities: { str: 14, dex: 12, con: 16, int: 10, wis: 13, cha: 8 }, rolled: null,
          career: career.uuid, ranks: {}, racialTalent: racial?.name ?? null, classTalent: classTalent?.system?.identifier ?? null,
          spells: [], side: "alliance", equipment: [], name: "ZZ Engine Vaelstrasz", img: "icons/svg/mystery-man.svg"
        });
        assert.ok(result.ok, `the creator refused: ${JSON.stringify(result.reasons)}`);
        const actor = result.actor;
        made.push(actor);
        assert.equal(actor.system.guise?.name, "Dwarf");
        assert.equal(actor.raceItem?.name, OUTCAST);
        assert.notOk(actor.items.some(i => i.type === "talent" && i.system?.race === "Dwarf"), "a Dwarf talent was embedded");
        assert.equal(actor.system.size, dwarf.system.size, "the size is not the guise's");
        assert.include(actor.system.languages, (dwarf.system.languages ?? [])[0], "the guise's tongue is missing");
        const sheet = actor.sheet;
        await sheet.render({ force: true });
        await settle();
        assert.include(sheet.element.querySelector(".azeroth-race")?.textContent ?? "",
          game.i18n.format("AZEROTH.Guise.Line", { race: OUTCAST, guise: "Dwarf" }));
        await sheet.close();
      } finally {
        await creator.close();
      }
    });

    it("makes an Outcast Warrior through apply(state): the class kept, the guise walked and written", async function () {
      // The lead, 2026-11-09, verbatim: *"Allow the Chromatic Outcast Race to be Warrior,
      // Mage, Rogue, or Warlock classes as well."* Picking the Outcast no longer sets the
      // Champion, and every Outcast wears a guise whatever its class. Needs the races pack
      // regenerated from 02 §3 (`packs:parse`, `packs:build`).
      this.timeout(120000);
      const creator = new (game.system.azeroth.creator)({});
      await creator.render({ force: true });
      await settle();
      try {
        const warrior = await fromPack(PACK_FOR.class, "Warrior");
        const dwarf = await fromPack(PACK_FOR.race, "Dwarf");
        const outcast = await fromPack(PACK_FOR.race, OUTCAST);
        assert.include(outcast.system.classes ?? [], "Warrior", "the races pack still opens the Champion alone: run packs:parse and packs:build");
        await creator.setState({ race: outcast.uuid, cls: warrior.uuid, guise: dwarf.uuid, step: "guise" });
        await settle();
        assert.equal(creator.state.cls, warrior.uuid, "the Outcast replaced the Warrior with the Champion");
        assert.equal(creator.state.race, outcast.uuid, "the Warrior took the Outcast away");
        assert.equal(creator.state.guise, dwarf.uuid, "the guise was dropped");
        const strip = [...creator.element.querySelectorAll(".azeroth-creator-step")].map(b => b.dataset.step);
        assert.include(strip, "guise", "an Outcast Warrior did not walk the Mortal guise");
        assert.notInclude(strip, "race");
        const career = (await game.packs.get(PACK_FOR.career).getDocuments()).find(c => (c.system?.tier ?? 1) === 1);
        const racial = (outcast.system.talents ?? []).find(t => (t.tier ?? 1) <= 1);
        // Not a Legacy talent: a Legacy branch belongs to one people (04 §1, D-781), and a
        // guise gives looks, size, Speed and tongue only, so the creator rightly refuses a
        // Dwarf Legacy's talent to an Outcast in a Dwarf guise.
        const classTalent = (await game.packs.get(PACK_FOR.talent).getIndex({ fields: ["system.className", "system.tier", "system.identifier", "system.race", "system.legacy"] }))
          .find(t => t.system?.className === "Warrior" && (t.system?.tier ?? 1) === 1 && !t.system?.race && !t.system?.legacy);
        const result = await creator.apply({
          method: "array", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 }, rolled: null,
          career: career.uuid, ranks: {}, racialTalent: racial?.name ?? null, classTalent: classTalent?.system?.identifier ?? null,
          spells: [], side: "alliance", equipment: [], name: "ZZ Engine Outcast Warrior", img: "icons/svg/mystery-man.svg"
        });
        assert.ok(result.ok, `the creator refused: ${JSON.stringify(result.reasons)}`);
        const actor = result.actor;
        made.push(actor);
        assert.equal(actor.raceItem?.name, OUTCAST);
        assert.deepEqual(actor.items.filter(i => i.type === "class").map(i => i.name), ["Warrior"]);
        assert.equal(actor.system.guise?.name, "Dwarf");
        assert.equal(actor.system.size, dwarf.system.size, "the size is not the guise's");
        assert.notOk(actor.items.some(i => i.type === "talent" && i.system?.race === "Dwarf"), "a Dwarf talent was embedded");
        // The Champion is still never a second class, for an Outcast either.
        const champion = (await fromPack(PACK_FOR.class, CHAMPION)).toObject();
        const said = await warnings(() => actor.createEmbeddedDocuments("Item", [champion]));
        assert.notOk(actor.items.some(i => i.name === CHAMPION), "an Outcast Warrior took the Champion as a second class");
        assert.include(said, game.i18n.format("AZEROTH.Multiclass.NotSecond", { name: CHAMPION }));
        // The second class must be on the race's row (the lead, 2026-11-09: *"The second
        // class must be on your race's row in 02 §3, refused in words otherwise."*): a Druid
        // is refused in words, a Mage is taken.
        const druid = (await fromPack(PACK_FOR.class, "Druid")).toObject();
        const offRow = await warnings(() => actor.createEmbeddedDocuments("Item", [druid]));
        assert.notOk(actor.items.some(i => i.name === "Druid"), "an Outcast took a Druid as a second class");
        assert.include(offRow, game.i18n.format("AZEROTH.Multiclass.NotOnRow", { name: "Druid", race: OUTCAST }));
        const mage = (await fromPack(PACK_FOR.class, "Mage")).toObject();
        await actor.createEmbeddedDocuments("Item", [mage]);
        await until(() => actor.items.some(i => i.type === "class" && i.name === "Mage"), "the Mage taken as a second class");
      } finally {
        await creator.close();
      }
    });

    it("refuses a second class either way, in words, with nothing embedded", async function () {
      this.timeout(90000);
      const warrior = await makeCharacter({ name: "ZZ Engine Two Classes", classes: [["Warrior", 3]] });
      const champion = (await fromPack(PACK_FOR.class, CHAMPION)).toObject();
      const said = await warnings(() => warrior.createEmbeddedDocuments("Item", [champion]));
      assert.notOk(warrior.items.some(i => i.name === CHAMPION), "the Champion became a second class");
      assert.include(said, game.i18n.format("AZEROTH.Multiclass.NotSecond", { name: CHAMPION }));
      const drake = await makeCharacter({ name: "ZZ Engine No Second", classes: [[CHAMPION, 3]], race: OUTCAST });
      const mage = (await fromPack(PACK_FOR.class, "Mage")).toObject();
      const refused = await warnings(() => drake.createEmbeddedDocuments("Item", [mage]));
      assert.notOk(drake.items.some(i => i.name === "Mage"), "a Champion took a second class");
      assert.include(refused, game.i18n.format("AZEROTH.Multiclass.HoldsCreationOnly", { name: CHAMPION }));
    });

    it("pays the called shot and a Parry in Energy through Draconic Discipline", async function () {
      this.timeout(90000);
      const champion = await makeCharacter({ name: "ZZ Engine Discipline", classes: [[CHAMPION, 3]], race: OUTCAST });
      await champion._talentGrant;
      await until(() => featureNamed(champion, "Draconic Discipline"), "Draconic Discipline granted");
      assert.equal(champion.maneuverPool, "energy", "the feature names no maneuver pool");
      const payer = champion.momentumPayer({ amount: 2 });
      assert.equal(payer?.pool?.name, "energy", "the called shot is not paid in Energy");
      const energy = pool(champion, "energy");
      const rage = pool(champion, "rage");
      await champion.updatePool([{ itemId: energy.itemId, kind: "power", value: 6 }, { itemId: rage.itemId, kind: "momentum", value: 4 }]);
      await until(() => pool(champion, "energy")?.value === 6, "the pools set");
      await game.system.azeroth.workflows.useManeuver({ actor: champion, key: "press" });
      await until(() => pool(champion, "energy")?.value < 6, "the Press paid in Energy");
      assert.equal(pool(champion, "rage").value, 4, "the Press took Rage");
    });

    it("casts a utility spell free once per Short Rest, ticked, and refills it at the rest", async function () {
      this.timeout(120000);
      const champion = await makeCharacter({ name: "ZZ Engine Free", classes: [[CHAMPION, 3]], race: OUTCAST, talents: ["Kindled Blood"] });
      await champion._talentGrant;
      const talent = champion.items.find(i => i.type === "talent" && i.name === "Kindled Blood");
      await talent.update({ "system.taken": 1 });
      const speed = await until(() => spellNamed(champion, "Blazing Speed"), "Blazing Speed learned");
      const offer = champion.talentLineOffer({ roll: "spell", school: speed.system.school, mana: speed.system.mana, spell: "Blazing Speed" });
      const line = offer.find(l => l.kind === "freeCast");
      assert.ok(line?.checked, "the free cast is not offered ticked");
      const rage = pool(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: "momentum", value: 0 });
      await pressed(20, () => game.system.azeroth.workflows.castSpell({ actor: champion, spell: speed, talentLines: [line.identifier] }));
      await until(() => (talent.getFlag("azeroth-rpg", FREE_CAST_FLAG) ?? []).includes("Blazing Speed"), "the free cast marked spent");
      const again = champion.talentLineOffer({ roll: "spell", school: speed.system.school, mana: speed.system.mana, spell: "Blazing Speed" }).find(l => l.kind === "freeCast");
      assert.equal(again?.available, false, "a spent free cast was offered again");
      await champion.resetUses("short");
      await until(() => !(talent.getFlag("azeroth-rpg", FREE_CAST_FLAG) ?? []).length, "the rest refilled the free cast");
    });

    it("builds Void on a Black branch spell's cast", async function () {
      this.timeout(120000);
      const champion = await makeCharacter({ name: "ZZ Engine Void", classes: [[CHAMPION, 12]], race: OUTCAST, talents: ["Earth-Warder's Craft"] });
      await champion._talentGrant;
      const craft = champion.items.find(i => i.type === "talent" && i.name === "Earth-Warder's Craft");
      await craft.update({ "system.taken": 1 });
      const bolt = await until(() => spellNamed(champion, "Thunderlash"), "Thunderlash learned");
      const rage = pool(champion, "rage");
      await champion.updatePool({ itemId: rage.itemId, kind: "momentum", value: 10 });
      const before = champion.system.corruption?.void ?? 0;
      await pressed(1, () => game.system.azeroth.workflows.castSpell({ actor: champion, spell: bolt }));
      await until(() => (champion.system.corruption?.void ?? 0) > before, "the cast built Void");
      assert.equal(champion.system.corruption.void, before + 1, "the cast built the wrong Void");
    });

    it("wears a drake as 02 writes it, keeps it through a rest and 0 Health, and leaves it only by hand", async function () {
      this.timeout(120000);
      const champion = await makeCharacter({ name: "ZZ Engine Drake", classes: [[CHAMPION, 20]], race: OUTCAST, armor: ["Field plate"], weapons: ["Longsword"] });
      await champion._talentGrant;
      for (const item of champion.items.filter(i => ["weapon", "armor"].includes(i.type))) await item.update({ "system.equipped": true });
      const block = await fromPack("azeroth-rpg.bestiary", "Red Drake");
      // 08 §8's Plate is Body 5 and 14's Red Drake is Body 6, so a bare Field plate is the
      // LOWER and cannot show the melded suit winning. The suit is raised past the block by a
      // GM's item bonus (`apBonus`, 08 §20's margin) - the fixture moves, never the rule.
      const plate = champion.items.find(i => i.type === "armor" && i.name === "Field plate");
      const raise = Math.max(0, (block.system.ap?.body ?? 0) + 2 - (plate.system.armorPoints?.body ?? 0));
      await plate.update({ "system.apBonus": raise });
      await until(() => champion.system.ap.body > (block.system.ap?.body ?? 0), "the raised plate out-armoring the block");
      const own = { str: champion.system.abilities.str.value, ap: { ...champion.system.ap }, defense: champion.system.defense, speed: champion.system.speed };
      const effect = await takeShape(champion, { kind: "drake", entries: [block] });
      assert.ok(effect, "the drake form was not written");
      await until(() => champion.shape?.kind === "drake", "the drake form held");
      assert.equal(champion.system.abilities.str.value, own.str, "the drake took the character's Strength");
      for (const l of ["body", "head", "limb"]) {
        assert.equal(champion.system.ap[l], Math.max(own.ap[l] ?? 0, block.system.ap?.[l] ?? 0), `${l} is not the better Armor Points`);
      }
      assert.equal(champion.system.defense, Math.max(own.defense, block.system.defense ?? 0));
      assert.equal(champion.system.size, "large");
      assert.equal(champion.system.flyingSpeed, 240, "the drake does not fly at its tier 3 pace");
      assert.equal(champion.system.speed, own.speed, "the drake took the character's ground pace");
      // *You fight with the block's attacks in place of your weapons* (02): the sword melds.
      const ready = champion.readyWeapons();
      assert.notOk(ready.some(w => w.name === "Longsword"), "the sword was not melded");
      assert.ok(ready.length && ready.every(w => w.natural), "the drake's attacks are not the only ones in hand");
      // Field plate's Body Armor Points are the higher, and they win WHILE MELDED (the 1B
      // review, items c and d): the comparison is with the suit worn before the form.
      assert.isAbove(own.ap.body, block.system.ap.body, "the fixture's plate does not out-armor the block");
      assert.equal(champion.system.ap.body, own.ap.body, "the melded plate's Body Armor Points lost to the block's");
      // A final-phase change on the character's own side counts in the comparison, never on
      // the block's (the lead's ruling of 2026-11-08): +1 Defense on a block that is higher
      // leaves the block's number standing.
      if ((block.system.defense ?? 0) > own.defense + 1) {
        await champion.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Drake Defense", system: { changes: [{ key: "system.defense", type: "add", value: "1", phase: "final" }] } }]);
        await settle();
        assert.equal(champion.system.defense, block.system.defense, "a final-phase Defense stacked on the block's");
      }
      // An Augment held still reaches the Casting Test in the form (the lead's ruling of
      // 2026-11-08: the Broodstone bears on the branch spells).
      const { castingAugment } = await import("../rules/augments.mjs");
      const stone = await give(champion, "Broodstone (+1)");
      await stone.update({ "system.equipped": true });
      await until(() => castingAugment(champion.items.filter(i => i.type === "gear"), champion.classNames ?? []), "the Broodstone counting in the drake form");
      await champion.longRest();
      assert.equal(champion.shape?.kind, "drake", "a Long Rest ended the drake form");
      await champion.update({ "system.health.value": 0 });
      await settle();
      assert.equal(champion.shape?.kind, "drake", "0 Health ended the drake form");
      assert.isTrue(champion.system.dying, "0 Health in drake form is not dying");
      await leaveShape(champion);
      await until(() => !champion.shape, "the Champion left the drake form");
    });
  });
}
