/**
 * **THE DEATH KNIGHT'S SPELLS, THROUGH THE SHEET'S CAST AND THE CARD'S BUTTONS** (07 §11, §14 and
 * §17; run F4b), and the F4a architect review's S6: the talents whose live coverage the review
 * found missing, each pressed from the sheet's own control and read back off the documents.
 *
 * Every spell is cast from the Spells tab's Cast control at the tokens targeted, every Resist and
 * Apply pressed on the card as drawn, every Use from the sheet. Run alone with
 * `QUENCH_BATCH=azeroth-rpg.death-knight-spells`. Every document a test makes is deleted in `after`.
 */

import { cleanup, drainAreaWork, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import {
  answerAsk, castFromSheet, fightWith, freshTurn, nextTurnUntil, pick, pressCard, pressUse, sceneWith, talentNamed, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import { resolveRecord, withSteps } from "../rules/blow-records.mjs";
import { bondOf } from "../documents/bound.mjs";
import { inscribeRunes } from "../documents/runes.mjs";
import { layPlague } from "../effects/death-knight.mjs";
import { DK_FLAGS, SPEED_ZERO_CLAIM } from "../rules/death-knight-talents.mjs";
import { NEXT_ATTACK_FLAG } from "../rules/next-attack.mjs";
import { LAID_BOON_FLAG } from "../rules/banes.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { reactionBarred } from "../rules/reaction-bar.mjs";
import { NO_HEALING_FLAG } from "../rules/no-healing.mjs";
import { NO_DISENGAGE_FLAG } from "../effects/death-knight-spells.mjs";
import { RAISE_FLAG } from "../rules/raise.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { SPEED_ZERO_FLAG, dkTalentQueryHandler, laySpeedZero } from "../effects/death-knight-talents.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { strikeFromArea } from "../effects/area-strikes.mjs";
import { presenceOf } from "../rules/death-knight.mjs";
import { withdrawHit } from "../effects/miss.mjs";
import { applyCondition, clockRounds } from "../effects/durations.mjs";

const SCOPE = "azeroth-rpg";
const runicPower = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "runicPower") ?? null;
const runes = actor => actor.system?.runes ?? { weapons: [], value: 0, max: 0, slots: 0, blood: { value: 0 }, frost: { value: 0 } };
const health = actor => actor.system?.health?.value ?? 0;
const flagsOf = message => game.messages.get(message?.id ?? message)?.flags?.[SCOPE] ?? {};
const liveActor = actor => tokenOf(actor)?.actor ?? actor;

/** A Human Death Knight, its weapons wielded and inscribed half Blood, half Frost. */
async function knightWith(name, { level = 20, weapons = ["Greatsword"], rarity = "rare", ranks = {}, spells = [], cha = 16 } = {}) {
  const k = await makeCharacter({ name, classes: [["Death Knight", level]], race: "Human", weapons, spells, abilities: { str: 16, cha, con: 14 } });
  await k._talentGrant;
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(k, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  for (const [i, n] of weapons.entries()) {
    const item = await until(() => k.items.find(x => x.type === "weapon" && x.name === n && x.system?.equipped !== true), `${n} carried`);
    await item.update({ "system.rarity": rarity, "system.equipped": true, ...(i > 0 ? { "system.offHand": true } : {}) });
    await until(() => k.items.get(item.id)?.system?.equipped === true, `${n} wielded`);
  }
  await until(() => runes(k).slots > 0, "the rune slots");
  for (const row of runes(k).weapons) {
    const blood = Math.ceil(row.slots / 2);
    await inscribeRunes(k, k.items.get(row.itemId), { blood, frost: row.slots - blood, grip: row.grip ?? null });
  }
  await until(() => runes(k).value === runes(k).slots, "every slot inscribed");
  await k.update({ "system.health.value": k.system.health.max });
  await settle();
  return k;
}

/** Runic Power banked by a GM's hand. */
async function bank(knight, value = 13) {
  const rp = runicPower(knight);
  await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value }, {}, { runicGain: "hand" });
  await until(() => runicPower(knight).value === Math.min(value, rp.max), "Runic Power banked");
}

/** A Kobold with room in its Health. */
async function foe(hp = 30) {
  const npc = await makeNpc("Kobold");
  await npc.update({ "system.health.max": hp, "system.health.value": hp });
  return npc;
}

/** A Resist row on a spell card pressed with the die pinned; the record once it lands. */
async function resistRow(card, index, face) {
  const target = flagsOf(card).targets?.[index] ?? null;
  const key = target?.tokenId ?? target?.actorId ?? null;
  const pressed = await pressCard(card, `button[data-action="resistTest"][data-purpose="spell"][data-target-index="${index}"]`, { face });
  try {
    return await until(() => {
      const r = flagsOf(card).resists?.[key];
      return r && typeof r.success === "boolean" ? r : null;
    }, `${target?.name ?? "the target"}'s Test recorded`, 30000);
  } finally { await pressed.release(); }
}

/** An Apply row on a card pressed; waits for the Health to move by what the row recorded. */
async function applyRow(card, index, victim) {
  const n = Number(flagsOf(card).damageByTarget?.[index]?.damage) || 0;
  const hp = health(victim);
  // A card writes one row's damage at a time and refuses a press while the last is landing, in
  // words (*being written now*): the press is made again once that one has landed.
  const said = [];
  for (let attempt = 0; attempt < 6 && health(victim) >= hp; attempt++) {
    said.push(...await warnings(async () => {
      const pressed = await pressCard(card, `button[data-action="applyDamage"][data-target-index="${index}"]:not([data-rider])`);
      await pressed.release();
      await until(() => health(victim) < hp, `${victim.name} damaged`, 5000).catch(() => null);
    }));
  }
  if (health(victim) !== Math.max(0, hp - n)) {
    throw new Error(`row ${index}: ${victim.name} at ${health(victim)} after ${hp}, the row ${n}; warned ${JSON.stringify(said)}; row ${JSON.stringify(flagsOf(card).damageByTarget?.[index] ?? null).slice(0, 300)}; target ${JSON.stringify(flagsOf(card).targets?.[index] ?? null).slice(0, 200)}`);
  }
  return n;
}

/** The roll dialog this actor has open, or null. */
async function dialogFor(actor, ms = 8000) {
  return until(() => {
    const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
    return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
  }, `${actor.name}'s roll dialog`, ms).catch(() => null);
}

/** An attack from the sheet's weapon row at one target, the die pinned, optional rider lines ticked. */
async function attackFromSheet(actor, weapon, target, { face = 20, riders = [] } = {}) {
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, riders.length ? "always" : "skip");
  const sheet = await openSheet(actor);
  const unpin = pinDie(face);
  canvas.tokens.setTargets([target.id]);
  try {
    sheet.changeTab("combat", "primary");
    await settle();
    const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "attack");
    sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${weapon.id}"] [data-action="rollAttack"]`).click();
    if (riders.length) {
      const dialog = await dialogFor(actor);
      if (!dialog) throw new Error("the attack dialog did not open");
      for (const id of riders) {
        const box = dialog.element.querySelector(`input[name="rider-${id}"]`);
        if (!box || box.disabled) throw new Error(`the dialog's ${id} line is missing or greyed`);
        box.checked = true;
      }
      // The second weapon's select, where the dialog draws one (the F2 batch's own helper).
      const select = dialog.element.querySelector('select[name="extraWeapon"]');
      if (select && !select.value) {
        const first = [...select.options].find(o => o.value && !o.disabled);
        if (first) { select.value = first.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      const roll = dialog.element.querySelector('button[data-action="roll"]');
      await until(() => !roll.disabled, "the Roll button enabled", 5000);
      roll.click();
    }
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
    canvas.tokens.setTargets([]);
    await sheet.close();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  }
}

/** Reveal a card's damage where a Foresight priest held it back (CLAUDE.md §14, 2026-11-04). */
async function revealed(card, index = 0) {
  if (flagsOf(card)?.attackResolution?.damageRevealed === false) {
    await CARD_ACTIONS.revealAttackDamage({ dataset: { targetIndex: String(index) } }, game.messages.get(card.id));
    await until(() => flagsOf(card)?.attackResolution?.damageRevealed !== false, "the damage revealed");
  }
}

export function deathKnightSpellsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Death Knight's spells, and the F4a review's live coverage (run F4b)", function () {
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
      const knights = new Set(made.filter(d => d instanceof Actor).map(d => d.uuid));
      for (const a of game.actors.filter(x => bondOf(x)?.kind === "raised" && knights.has(bondOf(x)?.ownerUuid))) await a.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    /* ---------------- Part B: the spells ---------------- */

    describe("the spells, cast from the sheet", function () {
      it("Unholy Armor: temporary Health of 2 plus the Charisma modifier, through the card's Apply", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK5 Armor", { spells: ["Unholy Armor"], cha: 16 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await bank(knight);
        const card = await castFromSheet(knight, "Unholy Armor", { face: 20 });
        assert.ok(card, "the cast posted its card");
        const pressed = await pressCard(card, 'button[data-action="applySpellEffect"]');
        await pressed.release();
        await until(() => (knight.system.health.temp ?? 0) === 5, "temporary Health 2 plus Charisma +3 = 5");
      });

      it("Death's Embrace: refused in words above half Health with nothing spent; cast at half", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Embrace", { spells: ["Death's Embrace"] });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        await bank(knight);
        const rp = runicPower(knight).value;
        let refused = null;
        const said = await warnings(async () => { refused = await castFromSheet(knight, "Death's Embrace", { targets: [tokenOf(npc)], face: 20, ms: 6000 }); });
        assert.isNull(refused, "no card above half Health");
        const npcName = tokenOf(npc)?.document?.name ?? npc.name;
        assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Spell.Refuse.notHalf", { spell: "Death's Embrace", name: npcName }), `refused in words: ${JSON.stringify(said)}`);
        assert.equal(runicPower(knight).value, rp, "nothing spent");
        await liveActor(npc).update({ "system.health.value": 15 });
        const card = await castFromSheet(knight, "Death's Embrace", { targets: [tokenOf(npc)], face: 20 });
        assert.ok(card, "the cast goes at half Health");
        assert.equal(runicPower(knight).value, rp - 6, "6 Runic Power paid");
        await resistRow(card, 0, 1);
        await until(() => liveActor(npc).statuses.has("stunned"), "Stunned on a failed Spirit Test");
      });

      it("Pestilence: the enemies within 15 feet of the carrier take 5 Shadow and gain its disease; the carrier and the far one do not", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Pestilence", { spells: ["Pestilence"] });
        const carrier = await foe(40);
        const near = await foe(40);
        const near2 = await foe(40);
        const far = await foe(40);
        await sceneWith([
          { actor: knight, x: 300, y: 500 }, { actor: carrier, x: 700, y: 500, side: "hostile" },
          { actor: near, x: 800, y: 500, side: "hostile" }, { actor: near2, x: 700, y: 700, side: "hostile" },
          { actor: far, x: 1500, y: 500, side: "hostile" }
        ]);
        await layPlague({ victim: liveActor(carrier), kind: "frostFever", by: knight });
        await until(() => liveActor(carrier).effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the carrier's Frost Fever");
        await bank(knight);
        const card = await castFromSheet(knight, "Pestilence", { targets: [tokenOf(carrier)], face: 20 });
        assert.ok(card, "the cast posted its card");
        const rows = (flagsOf(card).targets ?? []).map(t => t.tokenId);
        assert.sameMembers(rows, [tokenOf(near).id, tokenOf(near2).id], "the card's rows are the ring, never the carrier or the far one");
        assert.deepEqual(flagsOf(card).deathKnightSpell?.pestilence?.kinds, ["frostFever"], "the carrier's disease recorded");
        for (const [i, id] of rows.entries()) {
          const victim = [near, near2].map(liveActor).find(a => tokenOf(a)?.id === id || a.token?.id === id) ?? liveActor(id === tokenOf(near).id ? near : near2);
          const n = await applyRow(card, i, victim);
          assert.equal(n, 5, "5 Shadow damage (D-963)");
          await until(() => victim.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever" && e.flags[SCOPE].tick.source === knight.uuid), `${victim.name} gains the Frost Fever, the knight's own`);
        }
        assert.isFalse(liveActor(far).effects.some(e => e.flags?.[SCOPE]?.tick?.plague), "the far one gains nothing");
      });

      it("Pestilence on a creature with none of the knight's diseases is refused in words, nothing spent", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK5 Pest None", { spells: ["Pestilence"] });
        const clean = await foe(30);
        await sceneWith([{ actor: knight, x: 300, y: 500 }, { actor: clean, x: 700, y: 500, side: "hostile" }]);
        await bank(knight);
        const rp = runicPower(knight).value;
        let refused = null;
        const said = await warnings(async () => { refused = await castFromSheet(knight, "Pestilence", { targets: [tokenOf(clean)], face: 20, ms: 6000 }); });
        assert.isNull(refused, "no card");
        const cleanName = tokenOf(clean)?.document?.name ?? clean.name;
        assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Spell.Refuse.notCarrier", { spell: "Pestilence", name: cleanName }), `refused in words: ${JSON.stringify(said)}`);
        assert.equal(runicPower(knight).value, rp, "nothing spent");
        // The positive control: the knight's Frost Fever on it, an enemy beside it, and the cast goes.
        const beside = await foe(30);
        await canvas.scene.createEmbeddedDocuments("Token", [await tokenData(beside, { x: 800, y: 500, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
        await until(() => tokenOf(beside), "an enemy beside it");
        await layPlague({ victim: liveActor(clean), kind: "frostFever", by: knight });
        await until(() => liveActor(clean).effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Frost Fever");
        assert.ok(await castFromSheet(knight, "Pestilence", { targets: [tokenOf(clean)], face: 20 }), "with its disease on the carrier, the cast goes");
      });

      it("Death Pact: refused in words with nothing spent on a living creature and on an undead the knight does not control", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Pact No", { spells: ["Death Pact"] });
        const living = await foe(30);
        const wild = await makeNpc("Plagued Ghoul");
        await wild.update({ name: "ZZ DK5 Wild Ghoul" });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: living, x: 700, y: 500, side: "hostile" }, { actor: wild, x: 700, y: 700, side: "hostile" }]);
        await bank(knight, 13);
        const rp = runicPower(knight).value;
        for (const [victim, why] of [[living, "notYours"], [wild, "notYours"]]) {
          const said = await warnings(async () => {
            assert.isNull(await castFromSheet(knight, "Death Pact", { targets: [tokenOf(victim)], face: 20, ms: 6000 }), `no card for ${victim.name}`);
          });
          const name = tokenOf(victim)?.document?.name ?? victim.name;
          assert.include(said, game.i18n.format(`AZEROTH.DeathKnight.Spell.Refuse.${why}`, { spell: "Death Pact", name }), `refused in words for ${victim.name}: ${JSON.stringify(said)}`);
          assert.equal(runicPower(knight).value, rp, "nothing spent");
        }
      });

      it("Death Pact: a raised ghoul with 12 Health destroyed, the knight given back 8 of it (the cap), its Runic Power paid", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Pact", { spells: ["Raise Ghoul", "Death Pact"] });
        const body = await makeNpc("Kobold");
        await body.update({ name: "ZZ Pact Corpse", "system.health.value": 0 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: body, x: 700, y: 500, side: "hostile" }]);
        await bank(knight, 13);
        const spell = knight.items.find(i => i.type === "spell" && i.name === "Raise Ghoul");
        const unpin = pinDie(20);
        try {
          const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] });
          const app = await until(() => {
            const f = foundry.applications.instances.get(`azeroth-choose-${spell.id}`);
            return f?.rendered && f.element?.querySelector(".azeroth-choose") ? f : null;
          }, "the corpse chooser");
          app.element.querySelector('button[data-action="choose"]').click();
          const c = await going;
          if (c) made.push(c);
        } finally { unpin(); }
        const ghoul = await until(() => game.actors.find(a => bondOf(a)?.kind === "raised" && bondOf(a)?.ownerUuid === knight.uuid), "the ghoul raised");
        const gTok = await until(() => canvas.scene.tokens.find(t => t.actorId === ghoul.id), "the ghoul's token");
        await (gTok.actor ?? ghoul).update({ "system.health.max": 20, "system.health.value": 12 });
        await until(() => (gTok.actor ?? ghoul).system?.health?.value === 12, "the ghoul at 12 Health");
        await knight.update({ "system.health.value": knight.system.health.max - 15 });
        const hp = health(knight);
        await bank(knight, 13);
        const rp = runicPower(knight).value;
        const cost = Number(knight.items.find(i => i.type === "spell" && i.name === "Death Pact")?.system?.mana) || 0;
        const card = await castFromSheet(knight, "Death Pact", { targets: [gTok.object], face: 20 });
        assert.ok(card, "Death Pact posted its card");
        assert.isAbove(cost, 0, "Death Pact has a Runic Power price");
        assert.equal(runicPower(knight).value, rp - cost, "its Runic Power paid");
        await until(() => !canvas.scene.tokens.has(gTok.id), "the ghoul destroyed");
        await until(() => health(knight) === hp + 8, "the knight regains 8 of the 12 it had: the cap");
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "raise-ghoul"), "and the raise's carrier goes with its last");
      });

      it("Frostwyrm Breath: every creature Entangled with the action escape at the Spell DC; Stunned on a failed Reflex Test", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Wyrm", { spells: ["Frostwyrm Breath"] });
        const a = await foe(30);
        const b = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: a, x: 700, y: 500, side: "hostile" }, { actor: b, x: 700, y: 600, side: "hostile" }]);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Frostwyrm Breath", { targets: [tokenOf(a), tokenOf(b)], face: 20 });
        assert.ok(card, "the cast posted its card");
        for (const x of [a, b]) {
          const held = await until(() => liveActor(x).effects.find(e => e.statuses?.has("entangled") && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), `${x.name} Entangled whatever its Test, its escape with it`);
          const escape = held.flags?.[SCOPE]?.[ESCAPE_FLAG];
          assert.equal(escape?.on, "action", "ended with an action");
          assert.equal(escape?.resilience, "reflex", "and a Reflex Test");
          assert.equal(escape?.dc, knight.system.spellDC, "against the knight's Spell DC");
        }
        await resistRow(card, 0, 1);
        await until(() => liveActor(a).statuses.has("stunned"), "Stunned on a failure");
        await resistRow(card, 1, 20);
        assert.isFalse(liveActor(b).statuses.has("stunned"), "not Stunned on a success");
      });

      it("Soul Rend: a failed Spirit Test marks the creature so it regains no Health until the end of its next turn", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Rend", { spells: ["Soul Rend"] });
        const npc = await foe(40);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Soul Rend", { targets: [tokenOf(npc)], face: 20 });
        assert.ok(card, "the cast posted its card");
        assert.equal(Number(flagsOf(card).damageByTarget?.[0]?.damage), 7, "7 Shadow on the row against a Kobold with no Shadow Ward");
        await resistRow(card, 0, 1);
        const mark = await until(() => liveActor(npc).effects.find(e => e.flags?.[SCOPE]?.[NO_HEALING_FLAG]), "the no-healing mark");
        // *Until the end of its next turn*: the creature's OWN turn, keyed on its own combatant.
        const theirs = combat.getCombatantsByActor(liveActor(npc))[0] ?? combat.combatants.find(c => c.actorId === npc.id);
        assert.equal(mark.start?.combatant, theirs?.id, "the span is keyed on the creature's own combatant");
        assert.equal(mark.duration?.expiry, "turnEnd", "and ends at a turn's end");
        const n = await applyRow(card, 0, liveActor(npc));
        assert.equal(n, 7, "a failure takes the whole 7 Shadow");
        const hp = health(liveActor(npc));
        await liveActor(npc).applyHealing(5, { from: null, givenBy: "other" });
        assert.equal(health(liveActor(npc)), hp, "a heal restores nothing");
        // The mark ends on the creature's own next turn's end.
        await nextTurnUntil(npc, combat);
        await nextTurnUntil(knight, combat);
        await until(() => !liveActor(npc).effects.some(e => e.flags?.[SCOPE]?.[NO_HEALING_FLAG]), "the mark ends at the end of its next turn", 30000);
        // A success lays no mark (a second creature, a second cast).
        const other = await foe(40);
        await tokenOf(knight).document.parent.createEmbeddedDocuments("Token", [await tokenData(other, { x: 800, y: 500, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })]);
        await until(() => tokenOf(other), "the second creature placed");
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const card2 = await castFromSheet(knight, "Soul Rend", { targets: [tokenOf(other)], face: 20 });
        assert.ok(card2, "the second cast posted its card");
        const r = await resistRow(card2, 0, 20);
        assert.isTrue(r.success, "the Test passed");
        await settle();
        await new Promise(res => setTimeout(res, 800));
        assert.isFalse(liveActor(other).effects.some(e => e.flags?.[SCOPE]?.[NO_HEALING_FLAG]), "no mark on a success");
        await combat.delete();
      });

      it("Blood Bind: a failed Body Test Slows the creature, which takes no Reaction while that Slowed stands", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Bind", { spells: ["Blood Bind"] });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Blood Bind", { targets: [tokenOf(npc)], face: 20 });
        await resistRow(card, 0, 1);
        const slowed = await until(() => liveActor(npc).effects.find(e => e.statuses?.has("slowed") && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "Slowed, its escape with it");
        await until(() => reactionBarred(liveActor(npc)), "no Reaction while the Slowed stands");
        assert.ok(slowed.flags?.[SCOPE]?.[ESCAPE_FLAG], "and the repeated Test rides it");
        await slowed.delete();
        await until(() => !reactionBarred(liveActor(npc)), "the bar ends with the Slowed");
      });

      it("Chains of Ice: Entangled and Slowed, the Slowed held 10 rounds with the repeated Test, the Entangled ends after its next turn, and the sheet's Disengage refused", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Chains", { spells: ["Chains of Ice"] });
        const enemy = await makeCharacter({ name: "ZZ DK5 Chained", classes: [["Warrior", 3]], race: "Human", weapons: ["Longsword"] });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: enemy, x: 1100, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, enemy]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Chains of Ice", { targets: [tokenOf(enemy)], face: 20 });
        await resistRow(card, 0, 1);
        await until(() => enemy.statuses.has("entangled") && enemy.statuses.has("slowed"), "Entangled and Slowed");
        const slowed = await until(() => enemy.effects.find(e => e.statuses?.has("slowed") && e.flags?.[SCOPE]?.[NO_DISENGAGE_FLAG] && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "the Slowed carries the bar and the escape");
        assert.equal(slowed.flags?.[SCOPE]?.[ESCAPE_FLAG]?.condition, "slowed", "the repeated Test rides the Slowed");
        assert.deepInclude(slowed.toObject().duration ?? {}, { value: 10, units: "rounds" }, "the spell's minute: 10 rounds in a fight");
        const entangled = enemy.effects.find(e => e.statuses?.has("entangled"));
        assert.isUndefined(entangled?.flags?.[SCOPE]?.[ESCAPE_FLAG], "the Entangled has no escape left: it ends by itself");
        // Refused in words, nothing spent.
        const sheet = await openSheet(enemy);
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const control = sheet.element.querySelector('section[data-tab="combat"] [data-action="disengage"]');
          assert.ok(control, "the sheet draws Disengage");
          const said = await warnings(async () => {
            control.click();
            await settle();
            await new Promise(r => setTimeout(r, 500));
          });
          assert.isFalse(enemy.statuses.has("disengaging"), "the Disengage is refused");
          assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Spell.NoDisengage", { name: enemy.name, spell: "Chains of Ice" }), `in words: ${JSON.stringify(said)}`);
        } finally { await sheet.close(); }
        // The Entangled ends at the end of the creature's next turn; the Slowed stands.
        await nextTurnUntil(enemy, combat);
        await nextTurnUntil(knight, combat);
        await until(() => !enemy.statuses.has("entangled"), "the Entangled ends after its next turn", 30000);
        assert.isTrue(enemy.statuses.has("slowed"), "the Slowed stands for the rest of the minute");
        // The positive control: on its own turn, with the spell's Slowed gone, the same control Disengages.
        await nextTurnUntil(enemy, combat);
        await enemy.effects.find(e => e.statuses?.has("slowed"))?.delete();
        await until(() => !enemy.statuses.has("slowed"), "the Slowed gone");
        const again = await openSheet(enemy);
        try {
          again.changeTab("combat", "primary");
          await settle();
          again.element.querySelector('section[data-tab="combat"] [data-action="disengage"]').click();
          await until(() => enemy.statuses.has("disengaging"), "the Disengage goes once the bar is gone", 15000);
        } finally { await again.close(); }
        await combat.delete();
      });

      it("Chains of Ice on a creature Icy Touch already Slowed: the one Slowed takes the minute and the escape, nothing doubled (the F4b review, S4)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Chains2", { spells: ["Icy Touch", "Chains of Ice"] });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const touch = await castFromSheet(knight, "Icy Touch", { targets: [tokenOf(npc)], face: 20 });
        await resistRow(touch, 0, 1);
        const theirs = liveActor(npc);
        const first = await until(() => theirs.effects.find(e => e.statuses?.has("slowed")), "Icy Touch's Slowed");
        // Both are Half-Actions: Chains is cast in the same turn, while Icy Touch's Slowed stands.
        await bank(knight, 13);
        const chains = await castFromSheet(knight, "Chains of Ice", { targets: [tokenOf(npc)], face: 20 });
        await resistRow(chains, 0, 1);
        const held = await until(() => theirs.effects.find(e => e.id === first.id && e.flags?.[SCOPE]?.[NO_DISENGAGE_FLAG] && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "the one Slowed carries Chains' bar and escape");
        assert.equal(theirs.effects.filter(e => e.statuses?.has("slowed")).length, 1, "one Slowed, never two");
        assert.deepInclude(held.toObject().duration ?? {}, { value: 10, units: "rounds" }, "it takes the longer span: the minute");
        assert.equal(held.flags[SCOPE][ESCAPE_FLAG].cast, flagsOf(chains).cast, "the escape is Chains' own");
        await combat.delete();
      });

      it("Chains of Ice bars Evade (04's Elusive) as it bars Disengage, in words with nothing spent (the F4b review, S5)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Chains3", { spells: ["Chains of Ice"] });
        const rogue = await makeCharacter({ name: "ZZ DK5 Elusive", classes: [["Rogue", 9]], race: "Human", weapons: ["Dagger"] });
        const elusive = await until(() => talentNamed(rogue, "Elusive"), "Elusive embedded");
        await elusive.update({ "system.taken": 1 });
        await until(() => talentNamed(rogue, "Elusive")?.system?.taken === 1, "Elusive taken");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: rogue, x: 1100, y: 500, side: "hostile" }]);
        const energy = () => rogue.poolSnapshot().find(p => p.name === "energy");
        await rogue.updatePool({ itemId: energy().itemId, kind: energy().kind, value: 10 });
        await until(() => energy().value === 10, "10 Energy");
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Chains of Ice", { targets: [tokenOf(rogue)], face: 20 });
        await resistRow(card, 0, 1);
        const slowed = await until(() => rogue.effects.find(e => e.statuses?.has("slowed") && e.flags?.[SCOPE]?.[NO_DISENGAGE_FLAG]), "the Slowed carries the bar");
        // A miss's Evade row, as the attack door writes it (`flags.evades`), pressed through the card's own door.
        const miss = await ChatMessage.create({ content: "<p>ZZ DK5 miss</p>", speaker: ChatMessage.getSpeaker({ actor: knight }),
          flags: { [SCOPE]: { kind: "attack", evades: [{ actorUuid: rogue.uuid, name: rogue.name, talent: "Elusive", cost: 2, feet: 5 }] } } });
        made.push(miss);
        const button = { dataset: { actorUuid: rogue.uuid } };
        const said = await warnings(async () => { await CARD_ACTIONS.evade(button, game.messages.get(miss.id)); });
        assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Spell.NoDisengage", { name: rogue.name, spell: "Chains of Ice" }), `refused in words: ${JSON.stringify(said)}`);
        assert.isFalse(rogue.statuses.has("disengaging"), "no step taken");
        assert.equal(energy().value, 10, "no Energy spent");
        // The positive control: the Slowed gone, the same press steps away and pays.
        await slowed.delete();
        await until(() => !rogue.statuses.has("slowed"), "the Slowed gone");
        await CARD_ACTIONS.evade(button, game.messages.get(miss.id));
        await until(() => rogue.statuses.has("disengaging"), "the step as though Disengaged");
        assert.equal(energy().value, 8, "2 Energy paid");
      });

      it("Strangulate: a failed Body Test Silences the creature, with the repeated Body Test at the end of its turns, and a pass ends it", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Strangle", { spells: ["Strangulate"] });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Strangulate", { targets: [tokenOf(npc)], face: 20 });
        await resistRow(card, 0, 1);
        const theirs = liveActor(npc);
        const held = await until(() => theirs.effects.find(e => e.statuses?.has("silenced") && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "Silenced, its escape with it");
        assert.deepInclude(held.flags?.[SCOPE]?.[ESCAPE_FLAG] ?? {}, { condition: "silenced", on: "turnEnd", resilience: "body" }, "the escape on the one door");
        // The creature's turn ends: the Test is offered, and a pass ends the Silenced.
        const prompt = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.purpose === "escape" || /data-purpose="escape"/.test(m.content ?? ""));
        await nextTurnUntil(npc, combat);
        await nextTurnUntil(knight, combat);
        const [p] = await prompt;
        made.push(p);
        const said = await warnings(async () => {
          const press = await pressCard(p, 'button[data-action="resistTest"]', { face: 20 });
          try {
            await until(() => !theirs.statuses.has("silenced"), "a passed Test ends the Silenced", 15000).catch(() => null);
          } finally { await press.release(); }
        });
        assert.isFalse(theirs.statuses.has("silenced"), `a passed Test ends the Silenced (warned ${JSON.stringify(said)})`);
        await combat.delete();
      });

      it("Horn of Winter with no GM online, reaching an ally this client does not own: refused in words, nothing spent (the F4b review, M1)", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Horn NoGM", { spells: ["Horn of Winter"] });
        const near = await makeCharacter({ name: "ZZ DK5 Horn Theirs", classes: [["Warrior", 3]], race: "Human" });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: near, x: 700, y: 500 }, { actor: npc, x: 2500, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, near, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        // This client owns the knight and not the ally, as a player's client would.
        await knight.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        await near.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
        const rp = runicPower(knight).value;
        const user = game.user;
        const users = game.users;
        let said = [];
        let card = null;
        Object.defineProperty(user, "isGM", { get: () => false, configurable: true });
        Object.defineProperty(users, "activeGM", { get: () => null, configurable: true });
        try {
          assert.isTrue(knight.isOwner, "this client owns the knight");
          assert.isFalse(near.isOwner, "and not the ally");
          said = await warnings(async () => { card = await castFromSheet(knight, "Horn of Winter", { face: 20, ms: 6000 }); });
        } finally {
          delete user.isGM;
          delete users.activeGM;
        }
        assert.isNull(card, "no card");
        assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Spell.Refuse.noGM", { spell: "Horn of Winter" }), `refused in words: ${JSON.stringify(said)}`);
        assert.equal(runicPower(knight).value, rp, "no Runic Power spent");
        const mine = combat.getCombatantsByActor(knight)[0];
        assert.equal(mine.budget?.halfActions, 2, "no Half-Action spent");
        for (const a of [knight, near]) assert.isFalse(a.effects.some(e => e.flags?.[SCOPE]?.[LAID_BOON_FLAG]), `no Boon on ${a.name}`);
        await combat.delete();
      });

      it("Horn of Winter: a Boon laid on the knight and on an ally within 30 feet, none on one at 50; an Attack or a Resilience Test spends it, a skill Test does not", async function () {
        this.timeout(150000);
        // An ally is a creature on the knight's side in its fight, or the Party out of one
        // (`rules/distance.mjs#countsAsAlly`, D-755): so a fight.
        const knight = await knightWith("ZZ DK5 Horn", { spells: ["Horn of Winter"] });
        const near = await makeCharacter({ name: "ZZ DK5 Horn Near", classes: [["Warrior", 3]], race: "Human" });
        const far = await makeCharacter({ name: "ZZ DK5 Horn Far", classes: [["Warrior", 3]], race: "Human" });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: near, x: 700, y: 500 }, { actor: far, x: 1500, y: 500 }, { actor: npc, x: 2500, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, near, far, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const card = await castFromSheet(knight, "Horn of Winter", { face: 20 });
        assert.ok(card, "the cast posted its card");
        for (const a of [knight, near]) {
          await until(() => a.effects.some(e => e.flags?.[SCOPE]?.[LAID_BOON_FLAG]?.kind === "attackOrResilience"), `${a.name} holds the Boon`);
        }
        assert.isFalse(far.effects.some(e => e.flags?.[SCOPE]?.[LAID_BOON_FLAG]), "50 feet off, none");
        assert.isFalse(liveActor(npc).effects.some(e => e.flags?.[SCOPE]?.[LAID_BOON_FLAG]), "and none on an enemy");
        const boonOn = a => a.effects.some(e => e.flags?.[SCOPE]?.[LAID_BOON_FLAG]?.kind === "attackOrResilience");
        const w = game.system.azeroth.workflows;
        // A skill Test spends nothing; a Resilience Test spends the ally's Boon.
        const skill = await w.rollTest({ actor: near, kind: "skill", skill: "athletics", dc: 10, title: "ZZ Horn skill" });
        if (skill) made.push(skill);
        await settle();
        assert.isTrue(boonOn(near), "a skill Test leaves the Boon");
        const resist = await w.rollResilience({ actor: near, resilience: "body", dc: 10 });
        if (resist) made.push(resist);
        await until(() => !boonOn(near), "a Resilience Test spends the Boon");
        // An Attack Test spends the knight's.
        const weapon = knight.items.find(i => i.type === "weapon" && i.name === "Greatsword");
        await attackFromSheet(knight, weapon, tokenOf(npc), { face: 15 });
        await until(() => !boonOn(knight), "an Attack Test spends the Boon");
        await combat.delete();
      });

      it("Frost Strike: each roll of the next Attack this turn is promised 6 Frost (the spell audit, D-1711)", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Strike", { spells: ["Frost Strike"] });
        const npc = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        assert.ok(await castFromSheet(knight, "Frost Strike", { face: 20 }), "the cast posted its card");
        const entry = await until(() => (knight.getFlag(SCOPE, NEXT_ATTACK_FLAG) ?? []).find(e => e.name === "Frost Strike"), "the promise laid");
        assert.equal(entry.damage, 6);
        assert.equal(entry.type, "frost");
        assert.equal(entry.rolls, "each", "a promise to every roll of the Attack");
        // The next Attack's first roll reads it and MARKS it; that Attack's second roll (Extra
        // Attack's, which a level 20 knight makes: the run answers its roll dialog under "skip")
        // reads the marked promise and takes it. So both rolls carry 6 Frost and nothing is left.
        // (The first draft of this test waited for the mark to stand after the Attack, which it
        // never does once the second roll has made its take; the live run of the audit found it.)
        const frostOf = card => (flagsOf(card).damageByTarget?.[0]?.parts ?? []).filter(p => p?.type === "frost").map(p => p.damage);
        const cards = [];
        const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === knight.id && m.flags?.[SCOPE]?.kind === "attack") cards.push(m); });
        try {
          const weapon = knight.items.find(i => i.type === "weapon" && i.name === "Greatsword");
          const blow = await attackFromSheet(knight, weapon, tokenOf(npc), { face: 18 });
          assert.deepEqual(frostOf(blow), [6], `6 Frost rides the next attack (${JSON.stringify(flagsOf(blow).damageByTarget?.[0] ?? {}).slice(0, 300)})`);
          await until(() => cards.length >= 2, "Extra Attack's second roll posted its card");
        } finally {
          Hooks.off("createChatMessage", hook);
        }
        assert.deepEqual(frostOf(cards[1]), [6], `the second roll carries the 6 Frost too (${JSON.stringify(flagsOf(cards[1]).damageByTarget?.[0] ?? {}).slice(0, 300)})`);
        await until(() => !(knight.getFlag(SCOPE, NEXT_ATTACK_FLAG) ?? []).some(e => e.name === "Frost Strike"),
          `the second roll took the promise: ${JSON.stringify(knight.getFlag(SCOPE, NEXT_ATTACK_FLAG) ?? [])}`);
        assert.notOk(knight.pendingNextAttack().typed.some(t => t.name === "Frost Strike"), "another Attack's first roll reads nothing");
        assert.notOk(knight.pendingNextAttack({ secondRoll: true }).typed.some(t => t.name === "Frost Strike"), "nor its second roll");
        await combat.delete();
      });

      it("Plaguesight: a whispered card naming who carries Undeath within 60 feet, its threshold, and the ground", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Sight", { spells: ["Plaguesight"] });
        // A player in the world who does not own the knight (deleted in `after`).
        const player = await User.create({ name: "ZZ DK5 Player", role: CONST.USER_ROLES.PLAYER });
        made.push(player);
        const tainted = await makeCharacter({ name: "ZZ DK5 Tainted", classes: [["Warrior", 3]], race: "Human" });
        await tainted.update({ "system.corruption.undeath": 11 });
        // A hidden creature whose block names the Undeath keyword: sensed all the same (D-989).
        const lurker = await makeNpc("Plagued Ghoul");
        await lurker.update({ name: "ZZ DK5 Lurker", "system.corruption": "undeath" });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: tainted, x: 700, y: 500 }, { actor: lurker, x: 500, y: 800, side: "hostile" }]);
        await tokenOf(lurker).document.update({ hidden: true });
        await bank(knight, 13);
        const posted = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "plaguesight");
        assert.ok(await castFromSheet(knight, "Plaguesight", { face: 20 }), "the cast posted its card");
        const [sight] = await posted;
        made.push(sight);
        const text = sight.content.replace(/<[^>]+>/g, " ");
        assert.match(text, /ZZ DK5 Tainted/, "the tainted creature named");
        assert.match(text, /threshold crossed: 10/, "its highest threshold, 10");
        // Named by its TOKEN, as every row of the card is (the token keeps its prototype's name).
        const lurkerName = tokenOf(lurker)?.document?.name ?? canvas.scene.tokens.find(tk => tk.actorId === lurker.id)?.name ?? lurker.name;
        assert.include(text, `${lurkerName}:`, `the hidden creature sensed (D-989): ${text.slice(0, 400)}`);
        assert.isTrue(tokenOf(lurker)?.document?.hidden ?? true, "and its token still hidden on the board");
        // The direction off the knight's token: the tainted one east, the lurker south.
        assert.include(text, `ZZ DK5 Tainted: 10 feet ${game.i18n.localize("AZEROTH.Compass.E")}`, `the tainted one's distance and direction: ${text.slice(0, 400)}`);
        assert.include(text, `${lurkerName}: 15 feet ${game.i18n.localize("AZEROTH.Compass.S")}`, "the lurker's distance and direction");
        // The ground line, read the way the door reads it.
        const { mapState } = await import("../settings.mjs");
        const { exposureFor, partyRegion } = await import("../rules/regions.mjs");
        const { groundGrade } = await import("../rules/death-knight-spells.mjs");
        const region = partyRegion(mapState());
        const grade = region ? groundGrade(exposureFor(region.key).grades, "undeath") : 0;
        assert.include(text, grade ? game.i18n.format("AZEROTH.DeathKnight.Spell.SightGround", { n: grade }) : game.i18n.localize("AZEROTH.DeathKnight.Spell.SightClean"), "the ground's grade");
        // **WHISPERED TO THE CASTER ALONE** (D-989), with a player who does not own the knight in the
        // world: the GM who cast it, and no one else.
        assert.ok(player, "a player stands in the world for this row");
        assert.isFalse(knight.testUserPermission(player, "OWNER"), "the player does not own the knight");
        assert.deepEqual([...sight.whisper].sort(), [game.user.id], "whispered to the GM who cast it, not to the player");
        // And a knight the player owns: whispered to that player, never to the GM.
        await knight.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        await bank(knight, 13);
        const again = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "plaguesight");
        assert.ok(await castFromSheet(knight, "Plaguesight", { face: 20 }), "the second cast posted its card");
        const [owned] = await again;
        made.push(owned);
        assert.deepEqual([...owned.whisper].sort(), [player.id], "whispered to the owning player alone");
      });
    });

    /* ---------------- Part A, S6: the talents' live coverage ---------------- */

    describe("the F4a review's S6", function () {
      it("Remorseless Winter: an enemy already Slowed at its turn start takes the damage AND makes the Body Test; a failure Entangles (D-986)", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Winter", { rarity: "epic", ranks: { "Icebound Fortitude": 1, "Remorseless Winter": 1 } });
        const npc = await foe(40);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 1);
        assert.ok((await pressUse(knight, "Remorseless Winter")).card, "the Use was pressed");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.winter]), "the winter laid");
        const theirs = liveActor(npc);
        await theirs.toggleStatusEffect("slowed", { active: true });
        const hp = health(theirs);
        const test = untilHook("createChatMessage", 60000, m => /data-action="resistTest"/.test(m.content ?? ""));
        await nextTurnUntil(npc, combat);
        const [card] = await test;
        made.push(card);
        // The lead on O-356: *"Keeps the damage."*
        await until(() => health(theirs) === hp - (knight.system.tier ?? 1), "the tier in Frost, Slowed or not");
        const pressed = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
        try { await until(() => theirs.statuses.has("entangled"), "Entangled on a failure"); } finally { await pressed.release(); }
        await combat.delete();
      });

      it("Hungering Cold: the Entangled lands on a failed Body Test, holds through a failed turn-end Test and ends on a passed one", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Hungering", { ranks: { "Icy Grip": 1, "Relentless Advance": 1, "Hungering Cold": 1 } });
        const npc = await foe(40);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await freshTurn(knight, 1);
        const { card: going } = await pressUse(knight, "Hungering Cold", [tokenOf(npc)]);
        const card = await going;
        assert.ok(card, "the Use posted its card");
        made.push(card);
        const theirs = liveActor(npc);
        const resist = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
        let held = null;
        // Wait for exactly what is asserted (CLAUDE.md §15): the condition lands, and its escape
        // is written onto it by the same door a moment later - the combined run caught the gap.
        try { held = await until(() => theirs.effects.find(e => e.statuses?.has("entangled") && e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "Entangled on a failure, its escape with it"); } finally { await resist.release(); }
        assert.equal(held.flags?.[SCOPE]?.[ESCAPE_FLAG]?.on, "turnEnd", "the Test at the end of its turns");
        // The turn-end prompt: a failure keeps it.
        let prompt = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.purpose === "escape" || /data-purpose="escape"/.test(m.content ?? ""));
        await nextTurnUntil(npc, combat);
        await nextTurnUntil(knight, combat);
        let [p] = await prompt;
        made.push(p);
        let press = await pressCard(p, 'button[data-action="resistTest"]', { face: 1 });
        try {
          await until(() => game.messages.get(p.id)?.flags?.[SCOPE]?.pressed, "the failed escape recorded on the prompt");
          await settle();
          await new Promise(r => setTimeout(r, 1500));
        } finally { await press.release(); }
        assert.isTrue(theirs.statuses.has("entangled"), "a failed Test keeps it");
        prompt = untilHook("createChatMessage", 60000, m => m.flags?.[SCOPE]?.purpose === "escape" || /data-purpose="escape"/.test(m.content ?? ""));
        await nextTurnUntil(npc, combat);
        await nextTurnUntil(knight, combat);
        [p] = await prompt;
        made.push(p);
        const said = await warnings(async () => {
          press = await pressCard(p, 'button[data-action="resistTest"]', { face: 20 });
          try {
            await until(() => !theirs.statuses.has("entangled"), "a passed Test ends it", 15000).catch(() => null);
          } finally { await press.release(); }
        });
        assert.isFalse(theirs.statuses.has("entangled"), `a passed Test ends it (warned ${JSON.stringify(said)}; prompt ${JSON.stringify(p.flags?.[SCOPE] ?? {}).slice(0, 300)}; escape ${JSON.stringify(theirs.effects.find(e => e.statuses?.has("entangled"))?.flags?.[SCOPE]?.[ESCAPE_FLAG] ?? null)})`);
        await combat.delete();
      });

      it("Relentless Advance: a Slowed creature within reach presses the sheet's own Disengage and is refused", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK5 Relentless", { ranks: { "Icy Grip": 1, "Relentless Advance": 1 } });
        const enemy = await makeCharacter({ name: "ZZ DK5 Held", classes: [["Warrior", 3]], race: "Human", weapons: ["Longsword"] });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: enemy, x: 600, y: 500, side: "hostile" }]);
        await enemy.toggleStatusEffect("slowed", { active: true });
        const press = async () => {
          const sheet = await openSheet(enemy);
          try {
            sheet.changeTab("combat", "primary");
            await settle();
            return await warnings(async () => {
              sheet.element.querySelector('section[data-tab="combat"] [data-action="disengage"]').click();
              await settle();
              await new Promise(r => setTimeout(r, 500));
            });
          } finally { await sheet.close(); }
        };
        const said = await press();
        assert.isFalse(enemy.statuses.has("disengaging"), "the Disengage is refused");
        assert.include(said, game.i18n.format("AZEROTH.DeathKnight.Talent.NoDisengage", { name: enemy.name, holder: knight.name, talent: "Relentless Advance" }), `in words: ${JSON.stringify(said)}`);
        // The positive control: no longer Slowed, the same control Disengages.
        await enemy.toggleStatusEffect("slowed", { active: false });
        await until(() => !enemy.statuses.has("slowed"), "the Slowed gone");
        await press();
        await until(() => enemy.statuses.has("disengaging"), "the Disengage goes once the bar is gone");
      });

      it("Icebound Fortitude through the card's Apply: 12 against Armor Points 6 is asked, halved first, and deals 0", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Icebound", { ranks: { "Icebound Fortitude": 1 } });
        // Body Armor Points 6 laid as a `final` change, so halving before and after the Armor Points differ.
        await knight.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Body AP 6", img: "icons/svg/shield.svg",
          system: { changes: [{ key: "system.ap.body", type: "add", value: "6", phase: "final" }] } }]);
        await until(() => (knight.system.ap?.body ?? 0) >= 6, "Body Armor Points 6");
        const attacker = await makeCharacter({ name: "ZZ DK5 Ice Attacker", classes: [["Warrior", 5]], race: "Orc", weapons: ["Greatsword"], abilities: { str: 18 } });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: attacker, x: 600, y: 500, side: "hostile" }]);
        // **IN A FIGHT** (the F4c review, N8): out of one the state spans six seconds of the world's
        // clock, and any advance of the clock ends it - run 1 of F4c most likely failed on exactly
        // that. In a fight it is keyed to the knight's own combatant, to the end of its next turn.
        const combat = await fightWith([knight, attacker]);
        await freshTurn(attacker, 2);
        const weapon = attacker.items.find(i => i.type === "weapon" && i.name === "Greatsword");
        await weapon.update({ "system.equipped": true });
        const card = await attackFromSheet(attacker, weapon, tokenOf(knight), { face: 18 });
        await revealed(card);
        const row = flagsOf(card).damageByTarget?.[0];
        assert.ok(row?.mitigationSource?.input, "the card records the resolver's inputs");
        const input = row.mitigationSource.input;
        const halvedFirst = resolveDamage({ ...input, takenHalved: true }).damage;
        const halvedAfter = Math.floor(Number(row.damage) / 2);
        assert.notEqual(halvedFirst, halvedAfter, `the numbers tell before-AP from after-AP apart (row ${row.damage}, halved first ${halvedFirst})`);
        const hp = health(knight);
        const frost = runes(knight).frost.value;
        const pressed = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        await answerAsk(true);
        await pressed.release();
        await until(() => runes(knight).frost.value === frost - 1, "a Frost rune spent");
        const effectsNow = () => JSON.stringify(knight.effects.map(e => ({ name: e.name, flags: Object.keys(e.flags?.[SCOPE] ?? {}), duration: e.toObject().duration, start: e.toObject().start, active: e.active }))).slice(0, 900);
        const laidState = await until(() => knight.effects.find(e => e.flags?.[SCOPE]?.[DK_FLAGS.icebound]), "the Icebound state laid", 10000).catch(() => null);
        const seenAtLay = effectsNow();
        await until(() => health(knight) === hp - halvedFirst, `exactly the blow halved before Armor Points: ${halvedFirst} (row ${row.damage}; after-AP halving would be ${halvedAfter})`, 20000);
        // And a blow with no card behind it (an area's tick) while the state stands: 12 against Armor
        // Points 6, halved before them, deals 0 - halved after them it would deal 3.
        assert.ok(laidState, `the Icebound state was laid (effects ${seenAtLay}; world time ${game.time.worldTime})`);
        const theirsK = combat.combatants.find(c => c.actorId === knight.id);
        assert.equal(laidState.toObject().duration?.units, "turns", `the state is spanned in turns, not on the world's clock (${seenAtLay})`);
        assert.equal(laidState.toObject().start?.combatant, theirsK?.id, "keyed to the knight's own combatant");
        assert.ok(knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.icebound]), `the Icebound state stands (at its laying ${seenAtLay}; now ${effectsNow()}; world time ${game.time.worldTime})`);
        const before = health(knight);
        const outcome = {};
        await strikeFromArea({ actor: knight, caster: attacker, spell: { name: "ZZ Tick", school: null, item: true }, damage: { rating: 12, school: "physical" }, damageOutcome: outcome });
        await settle();
        assert.equal(health(knight), before, `an area's 12 against Armor Points 6 deals 0 to an Icebound knight (outcome ${JSON.stringify(outcome)})`);
        await combat.delete();
      });

      /**
       * O-362 (run close-F2): a blow MOVED or SHARED onto a creature holding Icebound Fortitude is
       * halved before the Armor Points and Ward that met it, through the card's real Apply, the
       * struck friend's transfer chooser and the holder's own ask. The state is laid by hand: the
       * talent's own ask and payment are the batch's other rows, and this one is about the door.
       */
      async function iceboundState(actor) {
        await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Icebound Fortitude", img: "icons/magic/water/barrier-ice-shield.webp",
          flags: { [SCOPE]: { [DK_FLAGS.icebound]: { name: "Icebound Fortitude" } } } }]);
        await until(() => actor.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.icebound]), `${actor.name}'s Icebound state`);
      }
      async function bodyAP(actor, n) {
        await actor.createEmbeddedDocuments("ActiveEffect", [{ name: `ZZ Body AP ${n}`, img: "icons/svg/shield.svg",
          system: { changes: [{ key: "system.ap.body", type: "add", value: String(n), phase: "final" }] } }]);
        await until(() => (actor.system.ap?.body ?? 0) >= n, `${actor.name}'s Body Armor Points ${n}`);
      }
      async function movedThrough(card, holderName) {
        const apply = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        try {
          const chooser = await until(() => [...foundry.applications.instances.values()].find(x => x.rendered && String(x.id ?? "").startsWith("azeroth-choose-transfer-")) ?? null, "the struck friend's transfer chooser", 20000);
          await pick(chooser, holderName);
          await answerAsk(true);
        } finally { await apply.release(); }
      }

      it("O-362 MOVED: Guardian takes a friend's blow under Icebound Fortitude, halved before the friend's Armor Points 2", async function () {
        this.timeout(240000);
        const holder = await makeCharacter({ name: "ZZ DK5 Moved Guardian", classes: [["Warrior", 9]], race: "Human" });
        await holder._talentGrant;
        const guardian = await until(() => talentNamed(holder, "Guardian"), "Guardian embedded");
        await guardian.update({ "system.taken": 1 });
        await until(() => talentNamed(holder, "Guardian")?.system?.taken === 1, "Guardian taken");
        const ally = await makeCharacter({ name: "ZZ DK5 Moved Friend", classes: [["Warrior", 5]], race: "Human" });
        const attacker = await makeCharacter({ name: "ZZ DK5 Moved Attacker", classes: [["Warrior", 5]], race: "Orc", weapons: ["Greatsword"], abilities: { str: 18 } });
        for (const a of [holder, ally]) await a.setParty(true);
        try {
          await sceneWith([{ actor: attacker, x: 500, y: 500, side: "hostile" }, { actor: ally, x: 600, y: 500 }, { actor: holder, x: 700, y: 500 }]);
          // Armor Points 2, never 6 (the close review's finding 6): against 6 a Greatsword's blow
          // halved first left 0, and a wait for "Health less 0" held before anything landed.
          await bodyAP(ally, 2);
          await iceboundState(holder);
          const rage = holder.poolSnapshot().find(p => p.name === "rage");
          await holder.updatePool({ itemId: rage.itemId, kind: rage.kind, value: rage.max });
          await until(() => holder.poolSnapshot().find(p => p.name === "rage")?.value === rage.max, "the Rage filled");
          const weapon = attacker.items.find(i => i.type === "weapon" && i.name === "Greatsword");
          await weapon.update({ "system.equipped": true });
          const card = await attackFromSheet(attacker, weapon, tokenOf(ally), { face: 18 });
          await revealed(card);
          const row = flagsOf(card).damageByTarget?.[0];
          assert.ok(row?.mitigationSource?.input, "the card records the resolver's inputs");
          const record = withSteps(row.mitigationSource, { moved: true });
          const halvedFirst = resolveRecord(record, { ...record.input, takenHalved: true }).damage;
          const halvedAfter = Math.floor(Number(row.damage) / 2);
          assert.notEqual(halvedFirst, halvedAfter, `the numbers tell before-AP from after-AP apart (row ${row.damage}, halved first ${halvedFirst})`);
          // The wait below must be one nothing but the landing can satisfy.
          assert.isAbove(halvedFirst, 0, `the blow halved first still deals Health (row ${row.damage}, halved first ${halvedFirst})`);
          const hpH = health(holder), hpA = health(ally);
          await movedThrough(card, "Guardian");
          await until(() => health(holder) === hpH - halvedFirst, `the Guardian takes the blow halved before the friend's Armor Points: ${halvedFirst} (row ${row.damage}; after-AP halving ${halvedAfter})`, 30000);
          assert.equal(health(ally), hpA, "the friend took the moved blow");
        } finally {
          for (const a of [holder, ally]) await a.setParty(false);
        }
      });

      it("O-362 SHARED: Shared Burden at rank 2 takes a friend's blow under Icebound Fortitude, halved before the holder's own Armor Points 2", async function () {
        this.timeout(240000);
        const tauren = await makeCharacter({ name: "ZZ DK5 Shared Burden", race: "Tauren", classes: [["Shaman", 9]], abilities: { wis: 16, con: 14 } });
        await until(() => tauren.items.filter(i => i.type === "talent" && i.system?.legacy === "Tauren").length === 12, "the Spirit Walker's twelve", 30000);
        const burden = await until(() => talentNamed(tauren, "Shared Burden"), "Shared Burden on the sheet");
        await burden.update({ "system.taken": 2 });
        await until(() => talentNamed(tauren, "Shared Burden")?.system?.taken === 2, "Shared Burden at rank 2");
        const ally = await makeCharacter({ name: "ZZ DK5 Shared Friend", classes: [["Warrior", 5]], race: "Human" });
        const attacker = await makeCharacter({ name: "ZZ DK5 Shared Attacker", classes: [["Warrior", 5]], race: "Orc", weapons: ["Greatsword"], abilities: { str: 18 } });
        for (const a of [tauren, ally]) await a.setParty(true);
        try {
          await sceneWith([{ actor: attacker, x: 500, y: 500, side: "hostile" }, { actor: ally, x: 600, y: 500 }, { actor: tauren, x: 800, y: 500 }]);
          // Armor Points 2 (the close review's finding 6), so the share halved first is above 0.
          await bodyAP(tauren, 2);
          await iceboundState(tauren);
          for (const pool of tauren.poolSnapshot().filter(p => p.kind === "power" && p.max > 0)) await tauren.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
          const weapon = attacker.items.find(i => i.type === "weapon" && i.name === "Greatsword");
          await weapon.update({ "system.equipped": true });
          const card = await attackFromSheet(attacker, weapon, tokenOf(ally), { face: 18 });
          await revealed(card);
          const flags = flagsOf(card);
          const row = flags.damageByTarget?.[0];
          assert.ok(row?.mitigationSource?.input, "the card records the resolver's inputs");
          const holder = { apByLocation: tauren.system.ap ?? {}, immune: tauren.system.immune ?? [], vulnerable: tauren.system.vulnerable ?? [] };
          const record = withSteps(row.mitigationSource, { burden: { share: "all", type: flags.damageType ?? row.type ?? null, location: flags.location ?? "body", holder } });
          const arrived = resolveRecord(record).damage;
          const halvedFirst = resolveRecord(record, { ...record.input, takenHalved: true }).damage;
          const halvedAfter = Math.floor(arrived / 2);
          assert.isAbove(arrived, 0, `the share gets past the holder's own Armor Points (row ${row.damage})`);
          assert.notEqual(halvedFirst, halvedAfter, `the numbers tell before-AP from after-AP apart (arrived ${arrived}, halved first ${halvedFirst})`);
          assert.isAbove(halvedFirst, 0, `the share halved first still deals Health (arrived ${arrived}, halved first ${halvedFirst})`);
          const hpT = health(tauren), hpA = health(ally);
          await movedThrough(card, "Shared Burden");
          await until(() => health(tauren) === hpT - halvedFirst, `the holder takes the share halved before its own Armor Points: ${halvedFirst} (arrived ${arrived}; after-AP halving ${halvedAfter})`, 30000);
          assert.equal(health(ally), hpA, "all of it moved at rank 2, and the friend kept some");
        } finally {
          for (const a of [tauren, ally]) await a.setParty(false);
        }
      });

      it("Mark of Blood and Vengeful Blood: a marked creature's melee blow heals the knight twice the rank and takes the rank back in Shadow", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 Mark", { ranks: { "Mark of Blood": 2, "Vengeful Blood": 1 } });
        const attacker = await makeCharacter({ name: "ZZ DK5 Mark Attacker", classes: [["Warrior", 5]], race: "Human", weapons: ["Longsword"] });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: attacker, x: 600, y: 500, side: "hostile" }]);
        const { card: marking } = await pressUse(knight, "Mark of Blood", [tokenOf(attacker)]);
        assert.ok(await marking, "Mark of Blood's card");
        await until(() => knight.effects.some(e => e.flags?.[SCOPE]?.[DK_FLAGS.markOfBlood]), "the mark laid");
        const weapon = attacker.items.find(i => i.type === "weapon" && i.name === "Longsword");
        await weapon.update({ "system.equipped": true });
        await knight.update({ "system.health.value": knight.system.health.max - 15 });
        const card = await attackFromSheet(attacker, weapon, tokenOf(knight), { face: 18 });
        await revealed(card);
        const atkHp = health(attacker);
        const hp = health(knight);
        const n = Number(flagsOf(card).damageByTarget?.[0]?.damage) || 0;
        assert.isAbove(n, 0, "the blow deals damage");
        const pressed = await pressCard(card, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        await pressed.release();
        await until(() => health(knight) === hp - n + 4, `the knight takes ${n} and regains twice rank 2 (${hp} before)`, 30000);
        await until(() => health(attacker) === atkHp - 1, "Vengeful Blood's 1 Shadow on the attacker", 30000);
      });

      it("Frozen Edge, Killing Machine at rank 2: two blades against a Slowed creature add the rank in Frost and a natural 19 is critical", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Edge", { weapons: ["Longsword", "Mace"], ranks: { "Frozen Edge": 2, "Killing Machine": 2 } });
        const npc = await foe(60);
        const control = await foe(60);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }, { actor: control, x: 500, y: 600, side: "hostile" }]);
        await liveActor(npc).toggleStatusEffect("slowed", { active: true });
        const weapon = knight.items.find(i => i.type === "weapon" && i.name === "Longsword");
        const frostOf = card => (flagsOf(card).damageByTarget?.[0]?.parts ?? []).filter(p => p?.type === "frost");
        const critOf = card => game.messages.get(card.id)?.rolls?.[0]?.isCritical === true;
        const card = await attackFromSheet(knight, weapon, tokenOf(npc), { face: 19 });
        // The rank in Frost, a second amount of its own type on the row (D-777), against a Kobold with no Frost Ward.
        assert.deepEqual(frostOf(card).map(p => p.damage), [2], `Frozen Edge's rank 2 in Frost (${JSON.stringify(flagsOf(card).damageByTarget?.[0] ?? {}).slice(0, 300)})`);
        assert.isTrue(critOf(card), "a natural 19 against a Slowed creature is a Critical Injury at rank 2");
        // The unslowed control: no Frost and no Critical Injury on the same 19.
        const plain = await attackFromSheet(knight, weapon, tokenOf(control), { face: 19 });
        assert.deepEqual(frostOf(plain), [], "no Frost against a creature that is not Slowed");
        assert.isFalse(critOf(plain), "no Critical Injury on a 19 against a creature that is not Slowed");
        // And at rank 1 the 19 is no Critical Injury, Slowed or not.
        await talentNamed(knight, "Killing Machine").update({ "system.taken": 1 });
        await until(() => talentNamed(knight, "Killing Machine")?.system?.taken === 1, "Killing Machine at rank 1");
        const rank1 = await attackFromSheet(knight, weapon, tokenOf(npc), { face: 19 });
        assert.isFalse(critOf(rank1), "no Critical Injury on a 19 at rank 1");
      });

      it("Icy Grip: a creature Death Grip pulls is Slowed until the end of its next turn; a pull that moved nothing Slows nothing", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 IcyGrip", { ranks: { "Icy Grip": 1 } });
        const npc = await foe(30);
        const beside = await foe(30);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 1100, y: 500, side: "hostile" }, { actor: beside, x: 600, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc, beside]);
        await freshTurn(knight, 2);
        const { card: going } = await pressUse(knight, "Death Grip", [tokenOf(npc)]);
        const card = await going;
        assert.ok(card, "Death Grip's card");
        made.push(card);
        const pressed = await pressCard(card, 'button[data-action="resistTest"]', { face: 1 });
        let slowed = null;
        const theirC = combat.combatants.find(c => c.actorId === npc.id);
        // The condition door toggles the status, then writes its span: wait for the span (CLAUDE.md §15).
        try { slowed = await until(() => liveActor(npc).effects.find(e => e.statuses?.has("slowed") && e.toObject().duration?.units === "turns"), "Slowed by the pull, its span written", 30000); } finally { await pressed.release(); }
        assert.equal(slowed.start?.combatant, theirC?.id, "the span is keyed on the creature's own combatant");
        assert.equal(slowed.duration?.expiry, "turnEnd", "and ends at the end of a turn");
        // A creature already beside the knight is pulled nowhere, and Icy Grip lays nothing on it.
        await freshTurn(knight, 2);
        const { card: going2 } = await pressUse(knight, "Death Grip", [tokenOf(beside)]);
        const card2 = await going2;
        assert.ok(card2, "the second Death Grip's card");
        made.push(card2);
        const pressed2 = await pressCard(card2, 'button[data-action="resistTest"]', { face: 1 });
        try {
          await until(() => game.messages.get(card2.id)?.flags?.[SCOPE]?.resists, "the Test recorded", 20000).catch(() => null);
          await settle();
          await new Promise(r => setTimeout(r, 1500));
        } finally { await pressed2.release(); }
        assert.isFalse(liveActor(beside).statuses.has("slowed"), "a pull that moved nothing Slows nothing");
        await combat.delete();
      });

      it("Frozen Desecration: an enemy starting its turn in the knight's Desecration is Slowed", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK5 FrozenDes", { level: 20, ranks: { "Frozen Desecration": 1 } });
        const npc = await foe(40);
        const outside = await foe(40);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }, { actor: outside, x: 3000, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc, outside]);
        await freshTurn(knight, 2);
        await bank(knight, 13);
        const { card } = await pressUse(knight, "Desecration");
        assert.ok(await card, "Desecration's card");
        await until(() => canvas.scene.regions.some(r => r.flags?.[SCOPE]?.featureKey && r.flags[SCOPE].caster === knight.uuid), "the desecrated ground placed", 30000);
        await nextTurnUntil(npc, combat);
        const theirC = combat.combatants.find(c => c.actorId === npc.id);
        const slowed = await until(() => liveActor(npc).effects.find(e => e.statuses?.has("slowed") && e.toObject().duration?.units === "turns"), "Slowed at its turn start, its span written", 30000);
        assert.equal(slowed.start?.combatant, theirC?.id, "keyed on the creature's own combatant");
        assert.equal(slowed.duration?.expiry, "turnEnd", "until the end of its turn");
        // The creature outside the ground starts its turn and is not Slowed; the one inside loses it at its turn's end.
        await nextTurnUntil(outside, combat);
        await until(() => !liveActor(npc).statuses.has("slowed"), "the Slowed ends at the end of its turn", 30000);
        assert.isFalse(liveActor(outside).statuses.has("slowed"), "nobody outside the ground is Slowed");
        await combat.delete();
      });

      /** A departure from the knight's reach, the Opportunity Attack offered and pressed with the die pinned. */
      async function opportunityHit(knight, npc, combat, { face = 20, asNotOwner = false } = {}) {
        await nextTurnUntil(npc, combat);
        const mine = combat.getCombatantsByActor(knight)[0];
        await until(() => mine.budget?.reactions === 1, "the knight's Reaction in hand");
        const offers = () => game.messages.filter(m => m.flags?.[SCOPE]?.reaction === "opportunityAttack");
        const before = offers().length;
        const doc = tokenOf(npc).document;
        await doc.update({ x: doc.x + 300, y: doc.y });
        await until(() => offers().length === before + 1, "the departure offered as an Opportunity Attack", 30000);
        const offer = offers().at(-1);
        made.push(offer);
        const button = new DOMParser().parseFromString(offer.content, "text/html").querySelector('[data-action="opportunityAttack"]');
        if (!button) throw new Error("the offer carries no button");
        const theirs = liveActor(npc);
        // A creature another client owns: the Speed 0 then goes through the GM's handler, judged off the card (S3).
        if (asNotOwner) Object.defineProperty(theirs, "isOwner", { get: () => false, configurable: true });
        const unpin = pinDie(face);
        let blow = null;
        try { blow = await CARD_ACTIONS.opportunityAttack(button, game.messages.get(offer.id)); } finally {
          unpin();
          canvas.tokens.setTargets([]);
          if (asNotOwner) delete theirs.isOwner;
        }
        if (blow) made.push(blow);
        return blow;
      }

      it("Relentless Advance at rank 2: an Opportunity Attack's hit sets the Speed to 0 until the end of the creature's own turn, through the GM's handler judged off the card (D-988; the F4b review, S3)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 RA2", { weapons: ["Longsword", "Mace"], ranks: { "Icy Grip": 1, "Relentless Advance": 2 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        const blow = await opportunityHit(knight, npc, combat, { asNotOwner: true });
        assert.ok(blow, "the Opportunity Attack rolled");
        assert.isTrue(flagsOf(blow).opportunity === true, "the card says it was an Opportunity Attack");
        const theirs = liveActor(npc);
        const laid = await until(() => theirs.effects.find(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]), "the Speed 0 laid on the hit", 30000);
        await until(() => (theirs.system.speed ?? null) === 0, "its Speed reads 0");
        assert.isFalse(theirs.statuses.has("entangled"), "never Entangled");
        assert.isFalse(theirs.effects.some(e => e.flags?.[SCOPE]?.[ESCAPE_FLAG]), "and no escape Test");
        // Until the end of ITS turn: keyed on the creature's own combatant, ending at a turn's end.
        const theirC = combat.combatants.find(c => c.actorId === npc.id);
        assert.equal(laid.start?.combatant, theirC?.id, "the span is keyed on the creature's own combatant");
        assert.equal(laid.duration?.expiry, "turnEnd", "and ends at its turn's end");
        // The GM's handler claimed the card's row, and judges every other ask off the world.
        await until(() => flagsOf(blow)?.[SPEED_ZERO_CLAIM]?.[0] === true, "the row claimed on the card");
        // And the GM's handler wrote the effect onto the card's landing record, for a Parry to take back (the F4c review, S1).
        await until(() => (flagsOf(blow).landedOnHit ?? []).some(r => r.kind === "speedDrop" && r.index === 0 && r.effectId === laid.id), "the Speed 0 on the card's landing record");
        const ask = extra => dkTalentQueryHandler({ act: "speedZero", knightUuid: knight.uuid, victimUuid: theirs.uuid, messageUuid: blow.uuid, index: 0, ...extra }, { user: game.user });
        const refusedWith = async (extra, key) => {
          let err = null;
          try { await ask(extra); } catch (e) { err = e; }
          assert.equal(err?.message, game.i18n.format(`AZEROTH.DeathKnight.Talent.SpeedZeroRefuse.${key}`, { name: theirs.name, talent: "Relentless Advance" }), `refused (${key})`);
        };
        await refusedWith({}, "claimed");
        await refusedWith({ index: 3 }, "notVictim");
        const plainCard = await ChatMessage.create({ content: "<p>ZZ plain</p>", speaker: ChatMessage.getSpeaker({ actor: knight }), flags: { [SCOPE]: { kind: "attack", targets: flagsOf(blow).targets, damageByTarget: flagsOf(blow).damageByTarget } } });
        made.push(plainCard);
        await refusedWith({ messageUuid: plainCard.uuid }, "notOpportunity");
        // The Speed 0 ends with the creature's turn.
        await nextTurnUntil(knight, combat);
        await until(() => !theirs.effects.some(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]), "the Speed 0 ends at the end of its turn", 30000);
        await combat.delete();
      });

      it("Relentless Advance at rank 2 with no GM online, an Opportunity Attack on a creature this client does not own: refused in words before the Reaction is spent (the F4c review, M1)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 RA2 NoGM", { weapons: ["Longsword", "Mace"], ranks: { "Icy Grip": 1, "Relentless Advance": 2 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await nextTurnUntil(npc, combat);
        const mine = combat.getCombatantsByActor(knight)[0];
        await until(() => mine.budget?.reactions === 1, "the knight's Reaction in hand");
        const offers = () => game.messages.filter(m => m.flags?.[SCOPE]?.reaction === "opportunityAttack");
        const count = offers().length;
        const doc = tokenOf(npc).document;
        await doc.update({ x: doc.x + 300, y: doc.y });
        await until(() => offers().length === count + 1, "the departure offered as an Opportunity Attack", 30000);
        const offer = offers().at(-1);
        made.push(offer);
        const button = new DOMParser().parseFromString(offer.content, "text/html").querySelector('[data-action="opportunityAttack"]');
        assert.ok(button, "the offer carries its button");
        // This client owns the knight and not the creature, as a player's client would.
        await knight.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        await npc.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
        const reactedBefore = JSON.stringify(knight.getFlag(SCOPE, "reacted") ?? null);
        const user = game.user;
        const users = game.users;
        let refused = "unset";
        let said = [];
        Object.defineProperty(user, "isGM", { get: () => false, configurable: true });
        Object.defineProperty(users, "activeGM", { get: () => null, configurable: true });
        try {
          assert.isTrue(knight.isOwner, "this client owns the knight");
          assert.isFalse(liveActor(npc).isOwner, "and not the creature");
          said = await warnings(async () => { refused = await CARD_ACTIONS.opportunityAttack(button, game.messages.get(offer.id)); });
        } finally {
          delete user.isGM;
          delete users.activeGM;
          canvas.tokens.setTargets([]);
        }
        assert.isNull(refused, "no Opportunity Attack");
        assert.include(said, game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"), `refused in words: ${JSON.stringify(said)}`);
        assert.equal(mine.budget?.reactions, 1, "the Reaction is still in hand");
        assert.equal(JSON.stringify(knight.getFlag(SCOPE, "reacted") ?? null), reactedBefore, "nothing recorded as reacted");
        // The positive control: a GM online, the same press takes the Opportunity Attack and spends the Reaction.
        const unpin = pinDie(20);
        let blow = null;
        try { blow = await CARD_ACTIONS.opportunityAttack(button, game.messages.get(offer.id)); } finally { unpin(); canvas.tokens.setTargets([]); }
        assert.ok(blow, "with a GM online the Opportunity Attack is taken");
        made.push(blow);
        await until(() => mine.budget?.reactions === 0, "and the Reaction spent");
        await combat.delete();
      });

      it("Relentless Advance at rank 2 with no GM online, an Opportunity Attack whose card names no token: judged on the user's own targets and refused before the Reaction (the F4d review, item 1)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 RA2 Stale", { weapons: ["Longsword", "Mace"], ranks: { "Icy Grip": 1, "Relentless Advance": 2 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        await nextTurnUntil(npc, combat);
        const mine = combat.getCombatantsByActor(knight)[0];
        await until(() => mine.budget?.reactions === 1, "the knight's Reaction in hand");
        const offers = () => game.messages.filter(m => m.flags?.[SCOPE]?.reaction === "opportunityAttack");
        const count = offers().length;
        const doc = tokenOf(npc).document;
        await doc.update({ x: doc.x + 300, y: doc.y });
        await until(() => offers().length === count + 1, "the departure offered as an Opportunity Attack", 30000);
        const offer = offers().at(-1);
        made.push(offer);
        const real = new DOMParser().parseFromString(offer.content, "text/html").querySelector('[data-action="opportunityAttack"]');
        assert.ok(real, "the offer carries its button");
        // The card's token lost (a stale offer): the door falls back on the user's own targets.
        const stale = { dataset: { ...real.dataset, tokenId: "" } };
        await knight.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        await npc.update({ [`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
        canvas.tokens.setTargets([tokenOf(npc).id]);
        await until(() => [...game.user.targets].some(t => t.actor?.id === npc.id), "the creature targeted");
        const reactedBefore = JSON.stringify(knight.getFlag(SCOPE, "reacted") ?? null);
        const user = game.user;
        const users = game.users;
        let refused = "unset";
        let said = [];
        Object.defineProperty(user, "isGM", { get: () => false, configurable: true });
        Object.defineProperty(users, "activeGM", { get: () => null, configurable: true });
        try {
          assert.isFalse(liveActor(npc).isOwner, "the targeted creature is not this client's");
          said = await warnings(async () => { refused = await CARD_ACTIONS.opportunityAttack(stale, game.messages.get(offer.id)); });
        } finally {
          delete user.isGM;
          delete users.activeGM;
        }
        assert.isNull(refused, "no Opportunity Attack");
        assert.include(said, game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"), `refused in words: ${JSON.stringify(said)}`);
        assert.equal(mine.budget?.reactions, 1, "the Reaction is still in hand");
        assert.equal(JSON.stringify(knight.getFlag(SCOPE, "reacted") ?? null), reactedBefore, "nothing recorded as reacted");
        // The positive control: a GM online, the same stale press strikes the target and spends the Reaction.
        const unpin = pinDie(20);
        let blow = null;
        try { blow = await CARD_ACTIONS.opportunityAttack(stale, game.messages.get(offer.id)); } finally { unpin(); canvas.tokens.setTargets([]); }
        assert.ok(blow, "with a GM online the Opportunity Attack is taken");
        made.push(blow);
        await until(() => mine.budget?.reactions === 0, "and the Reaction spent");
        await combat.delete();
      });

      it("Relentless Advance at rank 2: a hit withdrawn (a Parry that holds, Afterimage) takes the Speed 0 back (the F4c review, S1)", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 RA2 Parry", { weapons: ["Longsword", "Mace"], ranks: { "Icy Grip": 1, "Relentless Advance": 2 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        const blow = await opportunityHit(knight, npc, combat);
        assert.ok(blow, "the Opportunity Attack rolled");
        const theirs = liveActor(npc);
        const laid = await until(() => theirs.effects.find(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]), "the Speed 0 laid on the hit", 30000);
        const row = (flagsOf(blow).landedOnHit ?? []).find(r => r.kind === "speedDrop" && r.index === 0);
        assert.equal(row?.effectId, laid.id, `the card's landing record names the Speed 0 (${JSON.stringify(flagsOf(blow).landedOnHit ?? [])})`);
        // The door a Parry that holds and Afterimage both take (`effects/miss.mjs#withdrawHit`).
        await withdrawHit(theirs, { messageId: blow.id, index: 0 });
        await until(() => !theirs.effects.some(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]), "the Speed 0 taken back with the hit");
        await until(() => (theirs.system.speed ?? 0) > 0, "its Speed restored");
        await combat.delete();
      });

      it("Relentless Advance: no Speed 0 at rank 1; and a longer Speed 0 already standing is never shortened", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 RA1", { weapons: ["Longsword", "Mace"], ranks: { "Icy Grip": 1, "Relentless Advance": 1 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        const blow = await opportunityHit(knight, npc, combat);
        assert.ok(blow, "the Opportunity Attack rolled");
        assert.isTrue(game.messages.get(blow.id)?.rolls?.[0]?.outcome?.success === true, "and hit");
        await settle();
        await new Promise(r => setTimeout(r, 800));
        const theirs = liveActor(npc);
        assert.isFalse(theirs.effects.some(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]), "no Speed 0 at rank 1");
        // A Speed 0 of five rounds already standing: the door keeps it, whole.
        const [long] = await theirs.createEmbeddedDocuments("ActiveEffect", [{
          name: "ZZ long Speed 0", img: "icons/svg/downgrade.svg",
          system: { changes: [{ key: "system.speed", type: "override", value: "0", phase: "final" }] },
          duration: { value: 5, units: "rounds", expiry: "turnEnd" },
          start: { combat: combat.id, combatant: combat.combatants.find(c => c.actorId === npc.id)?.id ?? null, round: combat.round, turn: combat.turn, time: game.time.worldTime },
          flags: { [SCOPE]: { [SPEED_ZERO_FLAG]: { source: "Relentless Advance" } } }
        }]);
        const text = await laySpeedZero({ victim: theirs, by: knight, source: "Relentless Advance", name: theirs.name });
        assert.isTrue(text.landed, "the door answers it stands");
        const now = theirs.effects.filter(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]);
        assert.deepEqual(now.map(e => e.id), [long.id], "the longer Speed 0 kept, not replaced");
        assert.deepInclude(now[0].toObject().duration, { value: 5, units: "rounds" }, "and not shortened");
        await combat.delete();
      });

      it("O-384: a Slowed on the world's clock and Blood Bind's Slowed in a fight, and a clock Speed 0 against a turn-counted one, compare in seconds", async function () {
        this.timeout(300000);
        // Blood Bind and Chains of Ice are the spells whose failure goes through `keepLongerSpan`
        // (their bars and their rest); Icy Touch's Slowed is the shared condition door's alone.
        const knight = await knightWith("ZZ DK5 Span", { spells: ["Blood Bind"], ranks: { "Relentless Advance": 2 } });
        const npc = await foe(80);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        const theirs = liveActor(npc);
        const clockSlowed = async left => {
          for (const e of theirs.effects.filter(x => x.statuses?.has("slowed"))) await e.delete();
          const effect = await applyCondition(theirs, "slowed", { until: { duration: { value: left + 4, units: "seconds" }, start: { time: game.time.worldTime - 4 } } });
          return until(() => theirs.effects.get(effect?.id), `a clock Slowed with ${left} seconds left`);
        };
        const cast = async () => {
          await freshTurn(knight, 2);
          await bank(knight, 13);
          const card = await castFromSheet(knight, "Blood Bind", { targets: [tokenOf(npc)], face: 20 });
          await resistRow(card, 0, 1);
          await settle();
          await new Promise(r => setTimeout(r, 800));
        };
        // Two seconds left on the clock: Blood Bind's minute ends later and stands.
        const short = await clockSlowed(2);
        await cast();
        const kept1 = theirs.effects.get(short.id);
        assert.ok(kept1, "the one Slowed still stands");
        assert.equal(theirs.effects.filter(e => e.statuses?.has("slowed")).length, 1, "one Slowed, never two");
        assert.notEqual(kept1.toObject().duration?.units, "seconds", `the later end stands: Blood Bind's span (${JSON.stringify(kept1.toObject().duration)})`);
        // Two minutes left on the clock: the clock's span stands.
        const long = await clockSlowed(120);
        await cast();
        const kept2 = theirs.effects.get(long.id);
        assert.ok(kept2, "the one Slowed still stands");
        assert.deepInclude(kept2.toObject().duration ?? {}, { value: 124, units: "seconds" }, "the clock's longer span stands");
        // Relentless Advance's Speed 0 is counted in turns in a fight, and core gives a turn no seconds:
        // read off the fight's order, a one-second clock Speed 0 gives way and a thirty-second one stands.
        const clockZero = async left => {
          for (const e of theirs.effects.filter(x => x.flags?.[SCOPE]?.[SPEED_ZERO_FLAG])) await e.delete();
          const [e] = await theirs.createEmbeddedDocuments("ActiveEffect", [{
            name: "ZZ clock Speed 0", img: "icons/svg/downgrade.svg",
            system: { changes: [{ key: "system.speed", type: "override", value: "0", phase: "final" }] },
            duration: { value: left, units: "seconds" }, start: { time: game.time.worldTime },
            flags: { [SCOPE]: { [SPEED_ZERO_FLAG]: { source: "Relentless Advance" } } }
          }]);
          return e;
        };
        const brief = await clockZero(1);
        const replaced = await laySpeedZero({ victim: theirs, by: knight, source: "Relentless Advance", name: theirs.name });
        assert.ok(replaced.effectId && replaced.effectId !== brief.id, "a turn-counted Speed 0 replaces a one-second clock one");
        assert.equal(theirs.effects.get(replaced.effectId)?.toObject().duration?.units, "turns", "the new Speed 0 is counted in turns");
        const lasting = await clockZero(30);
        const keptZero = await laySpeedZero({ victim: theirs, by: knight, source: "Relentless Advance", name: theirs.name });
        assert.isNull(keptZero.effectId, "a thirty-second clock Speed 0 is never cut to a turn");
        assert.deepEqual(theirs.effects.filter(e => e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG]).map(e => e.id), [lasting.id], "the longer one kept");
        await combat.delete();
      });

      it("S3 live: an older Slowed whose span cannot be read keeps its place against Blood Bind, and gives way to Chains of Ice's minute", async function () {
        this.timeout(240000);
        const knight = await knightWith("ZZ DK5 Unread", { spells: ["Blood Bind", "Chains of Ice"] });
        const npc = await foe(80);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 700, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, npc]);
        const theirs = liveActor(npc);
        // A Slowed counted in turns and keyed on a creature no longer in this fight: core counts its
        // turns off the creature's own combatant, but no fight order says where it ends, so its
        // seconds cannot be read (`durations.mjs#turnPlaceOf` answers null).
        const unread = async () => {
          for (const e of theirs.effects.filter(x => x.statuses?.has("slowed"))) await e.delete();
          const [e] = await theirs.createEmbeddedDocuments("ActiveEffect", [{
            name: "ZZ unreadable Slowed", img: "icons/svg/downgrade.svg", statuses: ["slowed"],
            duration: { value: 5, units: "turns", expiry: "turnEnd" },
            start: { combat: combat.id, combatant: foundry.utils.randomID(16), round: combat.round, turn: combat.turn, time: game.time.worldTime }
          }]);
          return until(() => theirs.effects.get(e.id)?.statuses?.has("slowed") ? theirs.effects.get(e.id) : null, "the unreadable Slowed");
        };
        const castAt = async name => {
          await freshTurn(knight, 2);
          await bank(knight, 13);
          const card = await castFromSheet(knight, name, { targets: [tokenOf(npc)], face: 20 });
          await resistRow(card, 0, 1);
          await settle();
          await new Promise(r => setTimeout(r, 800));
        };
        const first = await unread();
        await castAt("Blood Bind");
        assert.deepInclude(theirs.effects.get(first.id)?.toObject().duration ?? {}, { value: 5, units: "turns" }, "Blood Bind never cuts a span it cannot read: the older stands");
        const second = await unread();
        await castAt("Chains of Ice");
        assert.deepInclude(theirs.effects.get(second.id)?.toObject().duration ?? {}, { value: 10, units: "rounds" }, "Chains of Ice's own minute stands over a span that cannot be read");
        await combat.delete();
      });

      it("N10 live: Relentless Advance's new Speed 0 is made before the shorter older one is deleted, so the creature is never without one", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 N10", { ranks: { "Relentless Advance": 2 } });
        const npc = await foe(60);
        await sceneWith([{ actor: knight, x: 1000, y: 1000 }, { actor: npc, x: 1100, y: 1000, side: "hostile" }]);
        const theirs = liveActor(npc);
        // A shorter Speed 0 already standing: one second of the world's clock.
        const [old] = await theirs.createEmbeddedDocuments("ActiveEffect", [{
          name: "ZZ short Speed 0", img: "icons/svg/downgrade.svg",
          system: { changes: [{ key: "system.speed", type: "override", value: "0", phase: "final" }] },
          duration: { value: 1, units: "seconds" }, start: { time: game.time.worldTime },
          flags: { [SCOPE]: { [SPEED_ZERO_FLAG]: { source: "Relentless Advance" } } }
        }]);
        const order = [];
        const speedZero = e => e.parent?.uuid === theirs.uuid && e.flags?.[SCOPE]?.[SPEED_ZERO_FLAG];
        const onCreate = Hooks.on("createActiveEffect", e => { if (speedZero(e)) order.push(["create", e.id, theirs.effects.filter(speedZero).length]); });
        const onDelete = Hooks.on("deleteActiveEffect", e => { if (speedZero(e)) order.push(["delete", e.id, theirs.effects.filter(x => speedZero(x)).length]); });
        try {
          const text = await laySpeedZero({ victim: theirs, by: knight, source: "Relentless Advance", name: theirs.name });
          assert.isTrue(text.landed, "the door answers it stands");
          assert.ok(text.effectId && text.effectId !== old.id, "a new Speed 0 made");
          await until(() => !theirs.effects.get(old.id), "the shorter older Speed 0 deleted");
        } finally {
          Hooks.off("createActiveEffect", onCreate);
          Hooks.off("deleteActiveEffect", onDelete);
        }
        assert.deepEqual(order.map(r => r[0]), ["create", "delete"], `made first, deleted after: ${JSON.stringify(order)}`);
        assert.isAbove(order[1][2], 0, "a Speed 0 still stood as the older one went");
        assert.equal(theirs.effects.filter(speedZero).length, 1, "one Speed 0 stands");
      });

      it("March of the Damned ends when the knight drops to 0 Health (D-987)", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 March", { level: 20 });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await bank(knight, 13);
        const { card } = await pressUse(knight, "March of the Damned");
        assert.ok(await card, "the Use posted its card");
        await until(() => presenceOf(knight.effects, "march"), "the march laid");
        await knight.applyDamage(knight.system.health.value + 10, { struck: true, attack: false, type: null });
        await until(() => health(knight) === 0, "the knight at 0 Health");
        await until(() => !presenceOf(knight.effects, "march"), "the march ends at 0 Health", 30000);
      });

      it("Blood Shield: Death Strike's heal gives temporary Health of twice the rank", async function () {
        this.timeout(150000);
        const knight = await knightWith("ZZ DK5 Shield", { ranks: { "Blood Shield": 2 } });
        const npc = await foe(40);
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: npc, x: 600, y: 500, side: "hostile" }]);
        await knight.applyDamage(5, { attack: false, type: null });
        await until(() => health(knight) === knight.system.health.max - 5, "5 damage taken");
        const weapon = knight.items.find(i => i.type === "weapon" && i.name === "Greatsword");
        await attackFromSheet(knight, weapon, tokenOf(npc), { face: 18, riders: ["death-strike"] });
        await until(() => health(knight) === knight.system.health.max, "Death Strike heals");
        await until(() => (knight.system.health.temp ?? 0) === 4, "Blood Shield's twice rank 2", 30000);
      });
    });

    /* ---------------- the final review (D-997) ---------------- */

    describe("the final review: a carrier is not the condition it holds (D-997)", function () {
      it("a Slowed laid on a Frost Fever carrier lays its own beside it: the disease keeps its span, Speed halves once, and toggling Slowed off leaves the disease", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK6 Fever");
        const npc = await foe(40);
        const speed = npc.system.speed;
        await layPlague({ victim: npc, kind: "frostFever", by: knight });
        const carrier = await until(() => npc.effects.find(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the Frost Fever carrier");
        await until(() => npc.statuses.has("slowed"), "the Fever's Slowed");
        const halved = npc.system.speed;
        assert.isBelow(halved, speed, "the Fever halves Speed");
        const span = JSON.stringify(carrier._source.duration);
        // Frozen Desecration's, Icy Grip's and a failed Resist's door: a shorter span of its own.
        const own = await applyCondition(npc, "slowed", { until: clockRounds(1) });
        assert.ok(own, "the condition door laid a Slowed");
        assert.notEqual(own.id, carrier.id, "the Slowed is not the disease");
        assert.equal(JSON.stringify(npc.effects.get(carrier.id)?._source?.duration), span, "the disease keeps its span");
        assert.equal(npc.effects.filter(e => e.statuses.has("slowed")).length, 2, "the disease and its own Slowed");
        assert.equal(npc.system.speed, halved, "Speed halves once, never twice");
        // Toggled off from a HUD or a sheet: the condition's own Slowed goes, the disease stays.
        await npc.toggleStatusEffect("slowed", { active: false });
        await until(() => !npc.effects.has(own.id), "the condition's own Slowed is gone");
        assert.ok(npc.effects.has(carrier.id), "the disease is not deleted");
        assert.isTrue(npc.statuses.has("slowed"), "the creature is still Slowed by the disease");
        assert.equal(npc.system.speed, halved, "the disease still halves Speed");
      });
    });
  });
}
