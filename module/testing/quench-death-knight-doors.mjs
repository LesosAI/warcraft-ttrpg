/**
 * **THE DEATH KNIGHT'S DOORS, THROUGH THE REAL CONTROLS** (the plan's Phase 4 doors 1 to 8 and
 * the F1 review's findings; run F2). Every door is pressed from the sheet's own control where
 * it has one - the rune panel's Inscribe and Spend, the feature's Use (`featureAims` for a
 * targeted one), the attack dialog's rider lines - and the result read off the documents.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.death-knight-doors`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, dialogFor, drainAreaWork, made, makeBoss, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, featureNamed, pick, pressUse, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { INSCRIBE_FLAG } from "../rules/death-knight.mjs";
import { DIFFICULT_BEHAVIOR } from "../rules/area-ground.mjs";
import { spendRunesOn } from "../documents/runes.mjs";
import { forceMove } from "../effects/forced-movement.mjs";
import { layPlague, layWardDrop, spreadBloodPlague } from "../effects/death-knight.mjs";

const SCOPE = "azeroth-rpg";
const runicPower = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "runicPower") ?? null;
const runes = actor => actor.system?.runes ?? { weapons: [], value: 0, max: 0 };
const health = actor => actor.system?.health?.value ?? 0;

/** A target snapshot with no token, as `targetSnapshots` shapes one. */
function snapshotOf(actor) {
  const s = actor.system ?? {};
  return {
    tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: s.defense ?? 10,
    apByLocation: { body: s.ap?.body ?? 0, head: s.ap?.head ?? 0, limb: s.ap?.limb ?? 0 },
    absent: [], wardBySchool: {}, immune: [], vulnerable: [], statuses: [...(actor.statuses ?? [])],
    size: s.size ?? null, swarm: false, creatureType: s.creatureType ?? null, acted: null
  };
}

/** A Human Death Knight with Charisma 16 (+3: 4 Runic Power a rune, a cap of 13), wielding these. */
async function knightWith(name, { level = 5, weapons = ["Greatsword"], rarity = "rare", spells = [] } = {}) {
  const k = await makeCharacter({ name, classes: [["Death Knight", level]], race: "Human", weapons, spells, abilities: { str: 16, cha: 16, con: 14 } });
  for (const n of weapons) {
    const item = await until(() => k.items.find(i => i.type === "weapon" && i.name === n && i.system?.equipped !== true), `${n} carried`);
    await item.update({ "system.rarity": rarity, "system.equipped": true });
    await until(() => k.items.get(item.id)?.system?.equipped === true, `${n} wielded`);
  }
  await until(() => runes(k).slots > 0, "the rune slots");
  await k.update({ "system.health.value": k.system.health.max });
  await settle();
  return k;
}

/** Inscribe every wielded weapon through the panel's own control, answering the one chooser. */
async function inscribeFromPanel(knight, answers) {
  const sheet = await openSheet(knight);
  sheet.changeTab("combat", "primary");
  await settle();
  const feature = await until(() => featureNamed(knight, "Inscribed Runeweapon"), "Inscribed Runeweapon granted");
  const control = sheet.element.querySelector('section[data-tab="combat"] [data-action="inscribeRunes"]');
  if (!control) throw new Error("the rune panel draws no Inscribe");
  if (control.disabled) throw new Error("the panel's Inscribe is greyed");
  control.click();
  for (const answer of answers) await pick(await chooser(feature), answer);
  await settle();
  await sheet.close();
}

export function deathKnightDoorsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Death Knight's doors (run F2)", function () {
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
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    describe("door 1: the rune panel and Inscribed Runeweapon", function () {
      it("draws a socket a rune slot on the Combat tab and under the main hand on the paper doll", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Panel");
        const sheet = await openSheet(knight);
        sheet.changeTab("combat", "primary");
        await settle();
        const sockets = sheet.element.querySelectorAll('section[data-tab="combat"] .azeroth-rune-panel .azeroth-rune-socket');
        assert.equal(sockets.length, 4, "a Rare greatsword holds 4 rune slots");
        assert.isTrue([...sockets].every(s => s.dataset.runeState === "empty"), "an uninscribed weapon draws empty sockets");
        assert.ok(sockets[0].getAttribute("data-tooltip"), "a socket says its state in words");
        sheet.changeTab("overview", "primary");
        await settle();
        const row = sheet.element.querySelectorAll('section[data-tab="overview"] .azeroth-doll-hand .azeroth-rune-sockets.is-compact .azeroth-rune-socket');
        assert.equal(row.length, 4, "the paper doll draws the main hand's sockets");
        await sheet.close();
      });

      it("inscribes through the panel's Inscribe and the one chooser, then spends a rune bare for 4 Runic Power", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Inscribe");
        await inscribeFromPanel(knight, ["2 Blood, 2 Frost"]);
        const weapon = knight.items.find(i => i.name === "Greatsword");
        await until(() => (weapon.system?.runes?.slots ?? []).length === 4, "the inscription written");
        assert.deepEqual(weapon.system.runes.slots.map(r => r.kind), ["blood", "blood", "frost", "frost"]);
        assert.equal(runes(knight).value, 4, "four unspent runes are the Power");

        const sheet = await openSheet(knight);
        sheet.changeTab("combat", "primary");
        await settle();
        const posted = untilHook("createChatMessage", 20000, m => m.flags?.[SCOPE]?.kind === "runeSpend");
        sheet.element.querySelector('section[data-tab="combat"] [data-action="spendRune"]').click();
        const [card] = await posted;
        made.push(card);
        await until(() => runicPower(knight)?.value === 4, "4 Runic Power gained (3 plus half of +3)");
        assert.equal(runes(knight).value, 3, "one rune spent");
        const states = () => [...sheet.element.querySelectorAll('section[data-tab="combat"] .azeroth-rune-socket')].map(e => e.dataset.runeState).join(",");
        await until(() => sheet.element.querySelectorAll('section[data-tab="combat"] .azeroth-rune-socket[data-rune-state="spent"]').length === 1, "the spent socket drawn struck", 10000)
          .catch(() => { throw new Error(`the panel draws ${states()} after the spend; the weapon holds ${JSON.stringify(knight.items.find(i => i.name === "Greatsword")?.system?.runes?.slots)}`); });
        // The first rune spent closes the window: Inscribe is greyed and says why in words.
        const inscribe = sheet.element.querySelector('section[data-tab="combat"] [data-action="inscribeRunes"]');
        assert.isTrue(inscribe.disabled, "Inscribe is greyed once a rune is spent");
        assert.ok(sheet.element.querySelector(".azeroth-rune-why")?.textContent?.trim(), "the refusal is said in words");
        await sheet.close();
      });

      it("asks a Versatile longsword its count; the two-handed count stands through the Long Rest until the next inscription (D-950)", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Versatile", { weapons: ["Longsword"] });
        await inscribeFromPanel(knight, ["Two-handed", "2 Blood, 2 Frost"]);
        const sword = knight.items.find(i => i.name === "Longsword");
        await until(() => sword.system?.runes?.grip === "two", "the two-handed count chosen");
        assert.equal(runes(knight).slots, 4, "a Rare Versatile weapon at the two-handed count holds 4");
        await knight.longRest();
        await until(() => knight.getFlag(SCOPE, INSCRIBE_FLAG)?.open === true, "the Long Rest opens the window to inscribe anew");
        // The F2 review's should-fix 3: the count stands until the NEW inscription writes its own.
        assert.equal(sword.system?.runes?.grip, "two", "the rest leaves the two-handed count");
        await inscribeFromPanel(knight, ["One-handed", "1 Blood, 1 Frost"]);
        await until(() => sword.system?.runes?.grip === "one", "the new inscription writes its own count");
      });
    });

    describe("door 2: the one rune spend", function () {
      it("spends two runes for two gains when pressed twice at once, and a Long Rest refills and empties", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Double");
        await inscribeFromPanel(knight, ["4 Blood, 0 Frost"]);
        await until(() => runes(knight).value === 4, "four runes inscribed");
        const [a, b] = await Promise.all([spendRunesOn(knight, { kind: "any", count: 1 }), spendRunesOn(knight, { kind: "any", count: 1 })]);
        assert.isTrue(a.ok && b.ok, "both spends paid");
        await until(() => runes(knight).value === 2, "two runes spent, never one");
        assert.equal(runicPower(knight).value, 8, "two runes give 8, never 4 or 12");
        await knight.longRest();
        await until(() => runes(knight).value === 4 && runicPower(knight).value === 0, "the Long Rest refills the runes and empties the Runic Power");
      });

      it("refuses a hand write to the runes pool in words, and writes nothing", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK Refuse");
        await inscribeFromPanel(knight, ["2 Blood, 2 Frost"]);
        await until(() => runes(knight).value === 4, "four runes inscribed");
        const pool = knight.poolSnapshot().find(p => p.kind === "power" && p.name === "runes");
        await knight.updatePool({ itemId: pool.itemId, kind: "power", value: 0 });
        await settle();
        assert.equal(runes(knight).value, 4, "the derived runes pool is untouched");
      });
    });

    describe("the undead healing judgement (the F1 review's MUST-FIX)", function () {
      it("refuses a shared or another creature's unnamed heal on a Death Knight, lets a Death spell's land, and a living creature takes both", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK Heal");
        await knight.update({ "system.health.value": 1 });
        await knight.applyHealing(3, { shared: true });
        await knight.applyHealing(3, { givenBy: "other", spell: true, school: "holy" });
        await settle();
        assert.equal(health(knight), 1, "a share and another creature's Holy heal restore nothing");
        await knight.applyHealing(3, { givenBy: "other", spell: true, school: "death" });
        await until(() => health(knight) === 4, "another creature's Death spell heals");
        const living = await makeCharacter({ name: "ZZ DK Living", classes: [["Warrior", 1]], race: "Human" });
        await living.update({ "system.health.value": 1 });
        await living.applyHealing(3, { shared: true });
        await until(() => health(living) === 4, "a living creature takes the share");
      });
    });

    describe("door 3: Death Coil heals the undead", function () {
      it("heals the knight it is cast on and takes no damage, and harms a living creature", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Coil", { spells: ["Death Coil"] });
        const rp = runicPower(knight);
        await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value: 10 }, {}, { runicGain: "hand" });
        await until(() => runicPower(knight).value === 10, "Runic Power banked");
        const coil = knight.items.find(i => i.type === "spell" && i.name === "Death Coil");
        const unpin = pinDie(20);
        let self, other;
        try {
          self = await game.system.azeroth.workflows.castSpell({ actor: knight, spell: coil, dc: 5, targets: [snapshotOf(knight)] });
          const npc = await makeNpc("Kobold");
          other = await game.system.azeroth.workflows.castSpell({ actor: knight, spell: coil, dc: 5, targets: [snapshotOf(npc)] });
        } finally { unpin(); }
        made.push(self, other);
        const f = self.flags[SCOPE];
        assert.isNull(f.damageByTarget?.[0] ?? null, "an undead target takes no damage");
        // The card's per-target heal button carries the clause's 4 (`templates/chat/partials/heal.hbs`).
        const button = new DOMParser().parseFromString(self.content, "text/html").querySelector('button[data-action="applyHealing"][data-target-index="0"]');
        assert.equal(button?.dataset.heal, "4", "an undead target regains 4");
        assert.ok(other.flags[SCOPE].damageByTarget?.[0], "a living target takes the damage");
        assert.isBelow(runicPower(knight).value, 10, "Death Coil is paid in Runic Power");
      });
    });

    describe("doors 4, 5, 7 and 8 on a board", function () {
      /** Attack from the Combat tab with rider lines ticked, the die pinned. */
      async function attackWithRiders(actor, weapon, target, riders, face = 20) {
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        const sheet = await openSheet(actor);
        const unpin = pinDie(face);
        canvas.tokens.setTargets([target.id]);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack");
          sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`).click();
          const dialog = await dialogFor(actor, 8000);
          assert.ok(dialog, "the attack dialog opened");
          for (const id of riders) {
            const box = dialog.element.querySelector(`input[name="rider-${id}"]`);
            assert.ok(box, `the dialog draws the ${id} line`);
            assert.isFalse(box.disabled, `the ${id} line is open`);
            box.checked = true;
          }
          const select = dialog.element.querySelector('select[name="extraWeapon"]');
          if (select && !select.value) {
            const first = [...select.options].find(o => o.value && !o.disabled);
            if (first) { select.value = first.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
          }
          const roll = dialog.element.querySelector('button[data-action="roll"]');
          await until(() => !roll.disabled, "the Roll button enabled", 5000);
          roll.click();
          const [card] = await posted;
          made.push(card);
          return card;
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await sheet.close();
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
        }
      }

      it("Death Strike rides the attack: a rune spent, its Runic Power given, the damage taken since healed", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Strike");
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        await inscribeFromPanel(knight, ["2 Blood, 2 Frost"]);
        await until(() => runes(knight).value === 4, "runes inscribed");
        await knight.applyDamage(5, { attack: false, type: null });
        await until(() => health(knight) === knight.system.health.max - 5, "5 damage taken");
        const weapon = knight.items.find(i => i.name === "Greatsword");
        await attackWithRiders(knight, weapon, tokenOf(foe), ["death-strike"]);
        await until(() => runes(knight).value === 3, "Death Strike spent a rune");
        await until(() => runicPower(knight).value === 4, "the rune gave its Runic Power");
        await until(() => health(knight) === knight.system.health.max, "the damage taken since healed (cap 4 plus twice the tier)");
      });

      it("Plague lays a typed Frost Fever carrier on the creature struck, Slowed while it lasts", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Plague", { level: 9 });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        await inscribeFromPanel(knight, ["2 Blood, 2 Frost"]);
        await until(() => runes(knight).value === 4, "runes inscribed");
        const weapon = knight.items.find(i => i.name === "Greatsword");
        await attackWithRiders(knight, weapon, tokenOf(foe), ["plague-frost-fever"]);
        const theirs = tokenOf(foe).actor;
        const carrier = await until(() => theirs.effects.find(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Frost Fever carrier");
        assert.equal(carrier.flags[SCOPE].tick.type, "frost", "the tick is typed Frost");
        assert.isTrue(carrier.statuses.has("slowed"), "Frost Fever holds Slowed");
        assert.equal(runes(knight).value, 3, "the hit spent a rune");
      });

      it("Death Grip from the sheet: a rune spent and the card carries the pull with the size waiver", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Grip", { level: 3 });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 1100, y: 500, side: "hostile" }]);
        await inscribeFromPanel(knight, ["2 Blood, 2 Frost"]);
        await until(() => runes(knight).value === 4, "runes inscribed");
        const { card } = await pressUse(knight, "Death Grip", [tokenOf(foe)]);
        const posted = await card;
        assert.ok(posted, "Death Grip posted its card");
        const forced = posted.flags[SCOPE].forced;
        assert.equal(forced?.toward, "toward", "the card carries a pull");
        // Six squares apart: 30 feet between the nearest squares, less the 5 feet of reach, so the
        // pull ends in the square beside the knight.
        assert.equal(forced?.feet, 25, "30 feet apart less the knight's 5 feet of reach");
        assert.equal(posted.flags[SCOPE].forcedIgnoresSize, "nonBoss", "and Death Grip's waiver of the size rule");
        await until(() => runes(knight).value === 3 && runicPower(knight).value === 4, "a rune spent for its Runic Power");
      });

      it("pulls a Huge non-Boss with the waiver, and a Boss is refused on size", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Pull");
        const huge = await makeNpc("Kobold");
        await huge.update({ "system.size": "huge" });
        const boss = await makeBoss();
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: huge, x: 1100, y: 500, side: "hostile" }, { actor: boss, x: 500, y: 1300, side: "hostile" }]);
        const from = tokenOf(knight).document.getCenterPoint();
        const pulled = await forceMove({ token: tokenOf(huge).document, from, feet: 20, toward: "toward", by: knight, ignoreSize: "nonBoss" });
        assert.isTrue(pulled.moved, `the Huge creature is pulled (${pulled.reason})`);
        await boss.update({ "system.size": "huge" });
        const refused = await forceMove({ token: tokenOf(boss).document, from, feet: 20, toward: "toward", by: knight, ignoreSize: "nonBoss" });
        assert.isFalse(refused.moved, "a Boss is refused");
        assert.equal(refused.reason, "outsized", "on 05's size rule");
      });

      it("Desecration from the sheet: 3 Runic Power, its ground laid where the knight stands, for the enemies", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Desecrate", { level: 11 });
        const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        const rp = runicPower(knight);
        await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value: 10 }, {}, { runicGain: "hand" });
        await until(() => runicPower(knight).value === 10, "Runic Power banked");
        const { card } = await pressUse(knight, "Desecration");
        made.push(await card);
        await until(() => runicPower(knight).value === 7, "3 Runic Power spent");
        const region = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.featureKey === "desecration"), "the desecrated ground placed");
        assert.isNull(region._source.attachment?.token ?? null, "the ground does not follow the knight");
        assert.equal(region.flags[SCOPE].areaTick.checks[0].fail.wardDrop.amount, 3, "a failure takes the knight's Charisma modifier");
        const ground = await until(() => region.behaviors.find(b => b.type === DIFFICULT_BEHAVIOR), "the GM lays its Difficult ground");
        assert.equal(ground.system.who, "enemy", "for the knight's enemies alone");
        assert.equal(ground.system.spares, "shadow", "sparing a creature immune to Shadow");
      });

      it("Desecration's failure lowers the Ward against Shadow by the modifier, never below 0", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK Ward");
        const npc = await makeNpc("Kobold");
        await npc.update({ "system.ward": { shadow: 2 } });
        await until(() => (npc.system.ward?.shadow ?? 0) === 2, "Ward 2 against Shadow");
        await layWardDrop({ victim: npc, school: "shadow", amount: 3, by: knight, source: "Desecration" });
        await until(() => (npc.system.ward?.shadow ?? 0) === 0, "the Ward reduced to 0");
        assert.ok(npc.effects.find(e => e.flags?.[SCOPE]?.wardDrop), "one laid effect carries it");
      });

      it("Blood Plague spreads: a creature within 5 feet is posted its Body Test (D-962)", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Spread", { level: 9 });
        const a = await makeNpc("Kobold");
        const b = await makeNpc("Kobold");
        await a.update({ name: "ZZ Carrier" });
        await b.update({ name: "ZZ Neighbour" });
        await sceneWith([{ actor: knight, x: 300, y: 300 }, { actor: a, x: 800, y: 500, side: "hostile" }, { actor: b, x: 900, y: 500, side: "hostile" }]);
        const carrier = tokenOf(a).actor;
        await layPlague({ victim: carrier, kind: "bloodPlague", by: knight });
        await until(() => carrier.effects.find(e => e.flags?.[SCOPE]?.tick?.plague === "bloodPlague"), "Blood Plague laid");
        assert.isTrue(carrier.system.healingHalved === true, "Blood Plague halves the healing its carrier receives");
        const posted = untilHook("createChatMessage", 20000, m => m.flags?.[SCOPE]?.kind === "areaTest" && m.flags[SCOPE].area?.check?.fail?.plague === "bloodPlague");
        await spreadBloodPlague({ carrier, knight });
        const [card] = await posted;
        made.push(card);
        assert.equal(card.flags[SCOPE].area.check.resilience, "body", "a Body Resilience Test");
        assert.equal(card.flags[SCOPE].area.actorUuid, tokenOf(b).actor.uuid, "for the neighbour, and nobody else");
      });
    });

    describe("door 6 and D-949", function () {
      it("Runic Discipline prices a maneuver at 1 Runic Power", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK Discipline");
        await until(() => featureNamed(knight, "Runic Discipline"), "Runic Discipline granted");
        const rp = runicPower(knight);
        await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value: 5 }, {}, { runicGain: "hand" });
        await until(() => runicPower(knight).value === 5, "Runic Power banked");
        const card = await game.system.azeroth.workflows.useManeuver({ actor: knight, key: "overbear", targets: [] });
        made.push(card);
        await until(() => runicPower(knight).value === 4, "Overbear cost 1 Runic Power");
      });

      it("records a Sustain cast with Runic Power as owing no upkeep", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Sustain", { spells: ["Death and Decay"] });
        const rp = runicPower(knight);
        await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value: 10 }, {}, { runicGain: "hand" });
        await until(() => runicPower(knight).value === 10, "Runic Power banked");
        const spell = knight.items.find(i => i.type === "spell" && i.name === "Death and Decay");
        const unpin = pinDie(20);
        try {
          made.push(await game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] }));
        } finally { unpin(); }
        const entry = await until(() => (knight.getFlag(SCOPE, "sustaining") ?? []).find(s => s.name === "Death and Decay"), "the Sustain held");
        assert.isTrue(entry.upkeepFree === true, "paid in Runic Power, it owes no upkeep (D-949)");
      });
    });
  });
}
