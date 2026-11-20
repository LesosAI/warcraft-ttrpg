/**
 * **THE NECROMANCER'S ESSENCE, THROUGH THE REAL DOORS** (the Necromancer plan's Phase 4a: doors 1,
 * 2 and 12, and the learning door). A death is made by writing the creature's Health or marking it
 * defeated, exactly as a blow or the tracker does; the death watch judges it on the active GM and
 * the gain is written through the holder's own pool queue. A cast is pressed from the sheet's Cast
 * with its empower line ticked on the roll dialog; a learn is a drop forged on the sheet.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-essence`.
 */

import { cleanup, forgeDrop, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { castFromSheet, sceneWith, tokenOf, until, manaOf, fightWith } from "./quench-chronomancer-common.mjs";

const SCOPE = "azeroth-rpg";
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A Necromancer at a level, Constitution 14 (a cap of 5), Intelligence 16. */
async function necromancerWith(name, { level = 5, race = "Human", spells = [] } = {}) {
  const n = await makeCharacter({ name, classes: [["Necromancer", level]], race, spells, abilities: { int: 16, con: 14 } });
  await until(() => essenceOf(n), "the Essence pool");
  return n;
}

/** Essence set by a GM's hand (`essenceGain: "hand"`, the one hand door). */
async function bankEssence(actor, value) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === Math.min(value, pool.max), "Essence banked");
}

/** Mana set for a cast. */
async function bankMana(actor, value) {
  const pool = manaOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value });
  await until(() => manaOf(actor).value === Math.min(value, pool.max), "Mana banked");
}

/** A creature from the bestiary, at full Health, named for the test. */
async function creature(entry, name) {
  const npc = await makeNpc(entry);
  await npc.update({ name: `ZZ ${name}`, "system.health.value": npc.system.health.max });
  return npc;
}

/** The creature dies: its Health written to 0, as a blow writes it. */
const kill = npc => npc.update({ "system.health.value": 0 });

/** The pack document's uuid, for a forged drop. */
async function spellUuid(name) {
  const pack = game.packs.get("azeroth-rpg.spells");
  const entry = (await pack.getIndex()).find(e => e.name === name);
  if (!entry) throw new Error(`the spells pack holds no ${name}`);
  return entry.uuid ?? `Compendium.azeroth-rpg.spells.Item.${entry._id}`;
}

/**
 * Drop a spell from the pack on the character's Spells tab; whether the actor holds it after. The
 * GM's drop of a spell the door refuses asks *teach anyway* (the lead, 2026-11-18): it is answered
 * NO here, so what is read is the door's own judgement, which a player meets as a refusal.
 */
async function dropSpell(actor, name) {
  const sheet = await openSheet(actor);
  sheet.changeTab("spells", "primary");
  await settle();
  const target = sheet.element.querySelector('section[data-tab="spells"]') ?? sheet.element;
  forgeDrop(target, { type: "Item", uuid: await spellUuid(name) });
  const title = game.i18n.localize("AZEROTH.Spell.Teach.Title");
  const started = Date.now();
  while (Date.now() - started < 1500) {
    const ask = [...foundry.applications.instances.values()].find(a => a.rendered && (a.title ?? "") === title && a.element?.querySelector('button[data-action="no"]'));
    if (ask) { ask.element.querySelector('button[data-action="no"]').click(); break; }
    await sleep(50);
  }
  await sleep(500);
  await sheet.close();
  return actor.items.some(i => i.type === "spell" && i.name === name);
}

export function necromancerEssenceBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Necromancer's Essence (Phase 4a)", function () {
    let restoreDialog = null;
    let restoreText = null;
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(180000);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    describe("door 1: the death watch", function () {
      it("a living enemy dying 100 feet away gives 1 Essence; at 130 feet none; an undead none", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Watch");
        const near = await creature("Kobold", "Near Kobold");
        const far = await creature("Kobold", "Far Kobold");
        const bones = await creature("Risen Skeleton", "Hostile Skeleton");
        await sceneWith([
          { actor: necro, x: 200, y: 1000 },
          { actor: near, x: 2200, y: 1000, side: "hostile" },
          { actor: far, x: 2800, y: 1400, side: "hostile" },
          { actor: bones, x: 700, y: 1400, side: "hostile" }
        ]);
        await settle();
        assert.equal(essenceOf(necro).value, 0, "the Necromancer starts with none");
        await kill(far);
        await sleep(1500);
        assert.equal(essenceOf(necro).value, 0, "a death 130 feet away gives none");
        await kill(bones);
        await sleep(1500);
        assert.equal(essenceOf(necro).value, 0, "an undead's fall gives none");
        await kill(near);
        await until(() => essenceOf(necro).value === 1, "a living enemy 100 feet away gives 1 Essence");
        await kill(near);
        await sleep(1000);
        assert.equal(essenceOf(necro).value, 1, "a corpse written again gives nothing more");
      });

      it("outside a fight a neutral creature's death gives 1, and the defeated mark gives it as 0 Health does", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Neutral");
        const deer = await creature("Kobold", "Neutral Kobold");
        const marked = await creature("Kobold", "Marked Kobold");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: deer, x: 600, y: 600, side: "hostile" }, { actor: marked, x: 600, y: 1000, side: "hostile" }]);
        await tokenOf(deer).document.update({ disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL });
        await settle();
        await kill(deer);
        await until(() => essenceOf(necro).value === 1, "a neutral creature's death outside a fight gives 1");
        await marked.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED ?? "dead", { active: true, overlay: true });
        await until(() => essenceOf(necro).value === 2, "the defeated mark gives 1");
        await kill(marked);
        await sleep(1000);
        assert.equal(essenceOf(necro).value, 2, "and the two together give it once");
      });

      it("the cap at Constitution 14 is 5, and Essence survives a fight's end and a Short Rest", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Cap");
        assert.equal(essenceOf(necro).max, 5, "3 plus a Constitution modifier of +2");
        const foe = await creature("Kobold", "Cap Kobold");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 600, y: 600, side: "hostile" }]);
        await bankEssence(necro, 9);
        assert.equal(essenceOf(necro).value, 5, "nothing past the cap");
        await bankEssence(necro, 3);
        const combat = await fightWith([necro, foe]);
        await combat.delete();
        await settle();
        assert.equal(essenceOf(necro).value, 3, "a fight's end leaves it alone");
        await necro.shortRest({});
        await settle();
        assert.equal(essenceOf(necro).value, 3, "a Short Rest leaves it alone");
      });

      it("Soul Harvest gives a Warlock 2 Mana when a creature dies within 30 feet", async function () {
        this.timeout(120000);
        const lock = await makeCharacter({ name: "ZZ Necro Lock", classes: [["Warlock", 14]], race: "Human" });
        await until(() => lock.items.some(i => i.type === "feature" && i.name === "Soul Harvest"), "Soul Harvest granted");
        const foe = await creature("Kobold", "Harvest Kobold");
        await sceneWith([{ actor: lock, x: 200, y: 600 }, { actor: foe, x: 700, y: 600, side: "hostile" }]);
        await bankMana(lock, 3);
        await kill(foe);
        await until(() => manaOf(lock).value === 5, "2 Mana from a death 25 feet away");
      });
    });

    describe("door 12: holding Essence through a Long Rest", function () {
      it("holding 2 asks a Body Test at DC 14, and a failure adds 1 Undeath", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Rest");
        await bankEssence(necro, 2);
        const posted = untilHook("createChatMessage", 60000, m => m.speaker?.actor === necro.id
          && m.flags?.[SCOPE]?.kind === "corruption" && m.flags[SCOPE].occasion === "essence");
        const unpin = pinDie(1);
        let card;
        try {
          await necro.longRest();
          [card] = await posted;
          made.push(card);
        } finally {
          unpin();
        }
        assert.equal(card.rolls[0].options.dc, 14, "DC 12 plus the 2 Essence held");
        assert.equal(card.flags[SCOPE].track, "undeath", "on the Undeath track");
        await until(() => (necro.system.corruption?.undeath ?? 0) === 1, "a failure adds 1 Undeath");
        assert.equal(essenceOf(necro).value, 2, "the rest leaves the Essence where it was");
      });

      it("a Forsaken Necromancer makes no Test", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Forsaken", { race: "Forsaken" });
        await bankEssence(necro, 3);
        let tested = false;
        const id = Hooks.on("createChatMessage", m => {
          if (m.speaker?.actor === necro.id && m.flags?.[SCOPE]?.kind === "corruption" && m.flags[SCOPE].occasion === "essence") tested = true;
        });
        try {
          await necro.longRest();
          await sleep(2500);
        } finally {
          Hooks.off("createChatMessage", id);
        }
        assert.isFalse(tested, "no exposure card for a Forsaken");
        assert.equal(necro.system.corruption?.undeath ?? 0, 0, "and no Undeath");
      });
    });

    describe("door 2: empowering a spell", function () {
      it("Potent on Bone Shards at tier 2 deals 7, and the Essence is spent", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Potent", { level: 5, spells: ["Bone Shards"] });
        const foe = await creature("Kobold", "Potent Kobold");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro, 10);
        await bankEssence(necro, 2);
        const card = await castFromSheet(necro, "Bone Shards", { targets: [tokenOf(foe)], face: 19, lines: ["empower-potent"] });
        assert.ok(card, "the cast posted its card");
        assert.isTrue(card.flags[SCOPE].success, "the Casting Test succeeded");
        assert.equal(card.flags[SCOPE].damageByTarget?.[0]?.damage, 7, "5 Shadow plus the tier of 2");
        assert.deepEqual(card.flags[SCOPE].empower?.picks, ["potent"], "the card records the benefit");
        assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
      });

      it("a failed Casting Test still spends the Essence", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Fail", { level: 5, spells: ["Bone Shards"] });
        const foe = await creature("Kobold", "Fail Kobold");
        await sceneWith([{ actor: necro, x: 200, y: 600 }, { actor: foe, x: 500, y: 600, side: "hostile" }]);
        await bankMana(necro, 10);
        await bankEssence(necro, 2);
        const card = await castFromSheet(necro, "Bone Shards", { targets: [tokenOf(foe)], face: 1, lines: ["empower-potent"] });
        assert.ok(card, "the cast posted its card");
        assert.isFalse(card.flags[SCOPE].success, "the Casting Test failed");
        assert.equal(essenceOf(necro).value, 1, "the Essence is spent even so");
      });

      it("the dialog greys the empower lines in words where no Essence is held", async function () {
        this.timeout(60000);
        const necro = await necromancerWith("ZZ Necro Grey", { level: 5, spells: ["Bone Shards"] });
        await sceneWith([{ actor: necro, x: 200, y: 600 }]);
        await bankMana(necro, 10);
        // The REAL dialog, opened by the sheet's Cast (the 4a review: never `castLineOffer` alone).
        const spell = necro.items.find(i => i.name === "Bone Shards");
        const sheet = await openSheet(necro);
        sheet.changeTab("spells", "primary");
        await settle();
        const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        try {
          sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`).click();
          const dialog = await until(() => {
            const d = foundry.applications.instances.get(`azeroth-roll-${necro.id}`);
            return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
          }, "Bone Shards' roll dialog");
          const boxes = [...dialog.element.querySelectorAll('input[name^="tline-empower-"]')];
          assert.isAbove(boxes.length, 0, "Bone Shards takes an empower line");
          for (const box of boxes) assert.isTrue(box.disabled, `${box.name} is greyed with no Essence`);
          const reasons = [...dialog.element.querySelectorAll(".azeroth-dialog-talent-lines .azeroth-dialog-rider-reason")].map(p => p.textContent.trim());
          assert.isAtLeast(reasons.length, boxes.length, "each greyed line says why, in words");
          await dialog.close();
        } finally {
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
          await sheet.close();
        }
      });
    });

    describe("the learning door (07 §9)", function () {
      it("refuses a Necromancer spell to a Death Knight and a Death Knight spell to a Necromancer, and lets both learn Graveblight", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Learner");
        const knight = await makeCharacter({ name: "ZZ Necro Knight Learner", classes: [["Death Knight", 5]], race: "Human" });
        assert.isFalse(await dropSpell(knight, "Bone Shards"), "a Death Knight cannot learn Bone Shards");
        assert.isFalse(await dropSpell(necro, "Corpse Burst"), "a Necromancer cannot learn Corpse Burst");
        assert.isTrue(await dropSpell(knight, "Graveblight"), "a Death Knight learns Graveblight");
        assert.isTrue(await dropSpell(necro, "Graveblight"), "a Necromancer learns Graveblight");
      });

      it("refuses Contagion until Graveblight is known", async function () {
        this.timeout(120000);
        const necro = await necromancerWith("ZZ Necro Contagion", { level: 16 });
        assert.isFalse(await dropSpell(necro, "Contagion"), "Contagion waits on Graveblight");
        assert.isTrue(await dropSpell(necro, "Graveblight"), "Graveblight learned");
        assert.isTrue(await dropSpell(necro, "Contagion"), "then Contagion");
      });
    });
  });
}
