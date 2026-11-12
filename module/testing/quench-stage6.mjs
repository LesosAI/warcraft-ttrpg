/**
 * **STAGE 6: THE LEAD'S RULINGS ON O-307 AND O-308, THROUGH THE REAL CONTROLS** (2026-11-11,
 * verbatim: *"307 - one field per target"*, *"308 - sustained spells are ended by dispel, so Sand
 * Prison would be stopped."*). O-309 (*"309 - yes keep"*) changed no code and is pinned in Vitest.
 *
 * One batch, run alone with `QUENCH_BATCH=azeroth-rpg.stage6`:
 *
 * - **O-307**: Stasis (Stasis Lore, 5 Sand) at two Raptors from the sheet through the OPEN roll
 *   dialog: one labelled DC field per target, each defaulting to that Raptor's Defense; a higher
 *   number typed into the second field survives a re-render of the dialog and reaches that Raptor
 *   alone, so one total of 18 hits the first and misses the second; a cleared field is its default.
 * - **O-308, Sand Prison**: held on a Raptor and Dispelled by a Priest's Use from the sheet: the
 *   chooser lists the Sustain once by the spell's name with the creature it holds, a bare Prone
 *   stays greyed; picked, the Sustain ends once, the Entangled and Blinded go with it, the Decay
 *   stays (07 §9: Decay is not a condition and lasts its minute), and no upkeep is paid.
 * - **O-308, Stasis on two creatures**: one cast holding two Raptors, Dispelled from one of them:
 *   both carriers go, the Sustain ends once, and the timed effect Stasis held on the other resumes.
 *
 * Every document a test makes is deleted in `after`.
 */

import { made, makeCharacter, openSheet, pinDie, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { SUSPEND_FLAG } from "../rules/chronomancer.mjs";
import { HELD_FLAG } from "../rules/sand-auras.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";
import { checkOverlap, checkText, formatFindings } from "./geometry.mjs";
import {
  castFromSheet, chooser, chronoInFight, freshTurn, manaOf, nextTurnUntil, pick, pressUse, sandOf, textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import { AT, FT, east, flagsOf, frame, live, resistRow, sleep, stepTurn, sustainOf, decayOf } from "./quench-chronomancer-sweep-t12.mjs";

/** A sweep stand-in the t12 kit's press helpers take: a throw is the test's failure. */
const strict = () => ({
  log: () => {}, check: ok => ok,
  fail: (what, err) => { throw new Error(`${what}: ${err?.message ?? err}`); },
  wait: (fn, what, ms) => until(fn, what, ms)
});

/** What `ui.notifications.info` said while `fn` ran, and for `ms` after. */
async function infosDuring(fn, ms = 0) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "info");
  const held = ui.notifications.info;
  const said = [];
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return held.apply(ui.notifications, args); };
  try {
    await fn();
    if (ms) await sleep(ms);
  } finally {
    if (own) ui.notifications.info = held;
    else delete ui.notifications.info;
  }
  return said;
}

/** The dialog's per-target DC rows as drawn: the label, the field's name, id and text, the reason. */
function fieldRows(dialog) {
  return [...dialog.element.querySelectorAll(".azeroth-dialog-each-row")].map(li => {
    const input = li.querySelector("input");
    return {
      label: li.querySelector("label")?.textContent?.trim() ?? "", labelFor: li.querySelector("label")?.getAttribute("for") ?? "",
      name: input?.name ?? "", id: input?.id ?? "", value: input?.value ?? null,
      reason: li.querySelector(".azeroth-dialog-note")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
    };
  });
}

/** Type into one target's DC field as a person would: the text, then `input` and `change`. */
function typeInto(dialog, name, text) {
  const el = dialog.element.querySelector(`input[name="${name}"]`);
  if (!el) throw new Error(`the dialog draws no field ${name}`);
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The open roll dialog for an actor, once its Roll button is drawn. */
const openDialog = (actor, what) => until(() => {
  const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
  return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
}, what);

/**
 * Cast from the sheet through the OPEN dialog: tick the lines `ticks` names, run `work(dialog)`
 * (which may type into fields and re-render), and press Roll with the die pinned.
 */
async function castThroughDialog(actor, spellName, { targets = [], face = 15, ticks = () => false, work = async () => {} } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`)
    ?? sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    const dialog = await openDialog(actor, `${spellName}'s roll dialog`);
    for (const box of [...dialog.element.querySelectorAll('input[name^="tline-"]')]) {
      if (ticks(box.name.slice(6)) && !box.disabled) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    const read = await work(dialog);
    // A render replaces the form: the button is queried again.
    dialog.element.querySelector('button[data-action="roll"]').click();
    return { read, card: await posted };
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** A Chronomancer with Stasis Lore and Sand Prison in a fight with two Raptors east of it. */
async function twoRaptors(name, { spells = [] } = {}) {
  const fight = await chronoInFight(name, {
    level: 20, ranks: { "Stasis Lore": 1 }, sand: 8, spells,
    enemies: [{ name: "Raptor", ...east(20), health: 200 }, { name: "Raptor", x: AT.x + 25 * FT, y: AT.y + 200, health: 200 }]
  });
  await until(() => fight.c.items.find(i => i.type === "spell" && i.name === "Stasis"), "Stasis learned", 30000);
  return fight;
}

/** Sand and Mana full enough to cast Stasis for 5 Sand, its once-a-rest gate cleared (07 §4). */
async function readyStasis(c) {
  const mana = manaOf(c);
  if (mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  const sand = sandOf(c);
  if (sand.value < 5) await c.updatePool({ itemId: sand.itemId, kind: "momentum", value: Math.min(sand.max, 8) });
  await until(() => sandOf(c).value >= 5 && manaOf(c).value === manaOf(c).max, "Sand and Mana to cast");
  if (c.getFlag("azeroth-rpg", SPELL_USES_FLAG)) await c.unsetFlag("azeroth-rpg", SPELL_USES_FLAG);
  await freshTurn(c, 1);
}

/** A Priest standing near a creature, its Mana full, linked and drawn on the scene. */
async function priestNear(scene, name, { x, y }) {
  const priest = await makeCharacter({ name, classes: [["Priest", 5]], abilities: { wis: 16 } });
  await priest.update({ "prototypeToken.actorLink": true });
  await scene.createEmbeddedDocuments("Token", [await tokenData(priest, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })]);
  await until(() => tokenDrawn(tokenOf(priest)), "the priest's token drawn");
  const pm = priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
  if (pm) await priest.updatePool({ itemId: pm.itemId, kind: "power", value: pm.max });
  return priest;
}

/** Stasis's carrier on a creature: the hold whose kind is Stasis, or null. */
const stasisOn = actor => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[SUSPEND_FLAG]?.kind === "stasis") ?? null;

/** Every condition effect a cast laid on a creature. */
const castEffects = (actor, cast) => actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.sustained === true && e.flags["azeroth-rpg"].cast === cast);

export function stage6Batch(context) {
  const { describe, it, assert } = context;

  describe("Stage 6: one DC field per target (O-307), and Dispel ends a Sustained spell as the cast (O-308)", function () {
    frame(context);

    /* ---- O-307 ------------------------------------------------------------ */

    it("O-307: Stasis at two Raptors draws a DC field for each; a number typed for one survives a re-render and reaches it alone", async function () {
      this.timeout(600000);
      const { c, foes } = await twoRaptors("ZZ S6 Fields");
      const [first, second] = foes;
      await second.actor.update({ "system.defense": first.actor.system.defense });
      await until(() => second.actor.system.defense === first.actor.system.defense, "the two Raptors share a Defense");
      const defense = Number(first.actor.system.defense);
      assert.isBelow(defense, 18, "a total of 18 beats the Raptors' Defense");
      const mod = Number(c.system.abilities.int.mod) + Number(c.system.proficiency);
      const face = 18 - mod;
      assert.isTrue(face >= 2 && face <= 19, `a die face lands the total on 18 (modifier ${mod})`);
      await readyStasis(c);
      const sandBefore = sandOf(c).value;
      const targets = [first.doc.object, second.doc.object];
      const { read, card } = await castThroughDialog(c, "Stasis", {
        targets, face, ticks: id => id.startsWith("sand-"),
        work: async dialog => {
          const out = { single: dialog.element.querySelector('input[name="dc"]'), opened: fieldRows(dialog) };
          // The rows legible (13px floor in a row, 4.5:1, 1.35 leading) and nothing in the dialog overprinting.
          out.legibility = [...checkText(dialog.element.querySelector(".azeroth-dialog-each")), ...checkOverlap(dialog.element.querySelector(".dialog-content") ?? dialog.element)];
          // The first field cleared (its default stands), the second typed over.
          typeInto(dialog, "dcTarget-0", "");
          typeInto(dialog, "dcTarget-1", "25");
          // A render draws the form again from the frozen content: the typed text must come back.
          await dialog.render();
          await until(() => dialog.rendered && dialog.element.querySelector('input[name="dcTarget-1"]')?.value === "25", "the typed DC survives the re-render", 8000);
          out.rendered = fieldRows(dialog);
          // A render redraws every other control at its default (only the DC fields and the way of the
          // Test are carried, D-731 and O-307), so the Sand line is ticked again on the fresh form.
          for (const box of [...dialog.element.querySelectorAll('input[name^="tline-sand-"]')]) {
            if (!box.disabled && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
          }
          return out;
        }
      });
      // One field per target, labelled with its name, its Defense the default and the reason beside it.
      assert.isNull(read.single, "several targets: no single DC field");
      assert.deepEqual(read.opened.map(r => [r.label, r.name, r.id, r.labelFor, Number(r.value)]), [
        [targets[0].name, "dcTarget-0", "azeroth-dialog-dc-0", "azeroth-dialog-dc-0", defense],
        [targets[1].name, "dcTarget-1", "azeroth-dialog-dc-1", "azeroth-dialog-dc-1", defense]
      ], "a labelled field per target, its Defense the default");
      assert.deepEqual(read.opened.map(r => r.reason), [0, 1].map(() => game.i18n.format("AZEROTH.Dialog.DC.EachDefense", { dc: defense })), "the reason beside each, in words");
      assert.deepEqual(read.legibility, [], `the dialog reads cleanly:\n${formatFindings(read.legibility)}`);
      assert.deepEqual(read.rendered.map(r => r.value), ["", "25"], "after the re-render: the cleared field empty, the typed one 25");
      // The card: one total, the first Raptor hit on its Defense, the second missed on the typed 25.
      assert.ok(card, "the cast posted a card");
      const f = flagsOf(card);
      assert.equal(Number(live(card).rolls[0].total), 18, "one roll, total 18");
      assert.deepEqual(f.eachTarget.map(r => [r.name, r.dc, r.typed, r.success]), [[targets[0].name, defense, false, true], [targets[1].name, 25, true, false]],
        "each target's own number: the cleared field its default, the typed one 25 and that Raptor alone");
      const text = textOf(live(card));
      assert.include(text, game.i18n.format("AZEROTH.Cast.EachTarget.MissTyped", { total: 18, dc: 25, default: defense }), "the typed miss said as typed");
      assert.include(text, game.i18n.format("AZEROTH.Cast.EachTarget.HitDefense", { sl: Math.floor((18 - defense) / 5), total: 18, dc: defense }), "the first Raptor's hit on its Defense");
      assert.deepEqual(f.targets.map(t => t.tokenId), [targets[0].id], "only the target the Test beat is recorded");
      await until(() => sandOf(c).value === sandBefore - 5, "5 Sand paid, once");
    });

    /* ---- O-308: Sand Prison -------------------------------------------------- */

    it("O-308: Dispel lists Sand Prison once and ends it - the Sustain once, its Entangled and Blinded with it, the Decay left, a bare Prone greyed, no upkeep", async function () {
      this.timeout(600000);
      const { c, scene, combat, foes } = await chronoInFight("ZZ S6 Prison", { level: 11, spells: ["Sand Prison"], enemies: [{ name: "Raptor", ...east(40), health: 80 }] });
      const [raptor] = foes;
      const spell = c.items.find(i => i.name === "Sand Prison");
      const priest = await priestNear(scene, "ZZ S6 Prison Priest", { x: AT.x + 40 * FT, y: AT.y + 200 });
      const mana = manaOf(c);
      if (mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await freshTurn(c, 2);
      const castCard = await castFromSheet(c, "Sand Prison", { targets: [raptor.doc.object], face: 18 });
      assert.ok(castCard, "Sand Prison posted a card");
      const r = await resistRow(strict(), castCard, 0, 1);
      assert.isFalse(r?.success, "the Reflex Test failed");
      await until(() => raptor.actor.statuses.has("entangled") && raptor.actor.statuses.has("blinded"), "Entangled and Blinded laid");
      const decay = await until(() => decayOf(raptor.actor), "Sand Prison's Decay 1");
      const cast = flagsOf(castCard).cast;
      assert.ok(sustainOf(c, spell), "the caster sustains Sand Prison");
      // A bare condition nothing Sustained laid.
      await raptor.actor.toggleStatusEffect("prone", { active: true });
      await until(() => raptor.actor.statuses.has("prone"), "a bare Prone on the Raptor");
      const manaPriest = priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value;
      let said = [];
      const { feature, card } = await pressUse(priest, "Dispel", [raptor.doc.object], 18);
      const app = await chooser(feature);
      const text = app.element.textContent.replace(/\s+/g, " ");
      const row = game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Sand Prison", caster: c.name, held: raptor.doc.name });
      assert.include(text, row, "the chooser lists the Sustain by the spell's name, its caster and the creature held");
      const labels = [...app.element.querySelectorAll('input[name="choice"]')].map(b => b.closest("label")?.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .concat([...(app.element.querySelector("#azeroth-choose-select")?.options ?? [])].map(o => o.textContent.replace(/\s+/g, " ").trim()));
      assert.equal(labels.filter(l => l.startsWith("Sand Prison")).length, 1, `the Sustain is one row, not one per condition: ${JSON.stringify(labels)}`);
      assert.include(text, game.i18n.format("AZEROTH.Dispel.Refuse.Condition", { conditions: game.i18n.localize(CONFIG.AZEROTH.conditions.prone) }), "the bare Prone stays greyed in words");
      assert.include(text, decay.name, "the Decay is its own row");
      let dispelCard = null;
      said = await infosDuring(async () => {
        await pick(app, "Sand Prison");
        dispelCard = await card;
        assert.ok(dispelCard, "the Dispel posted its card");
        await until(() => !sustainOf(c, spell), "O-308: the Sustain ends", 20000);
        await until(() => !raptor.actor.statuses.has("entangled") && !raptor.actor.statuses.has("blinded"), "the Entangled and Blinded go with it", 20000);
      }, 3000);
      assert.deepEqual(castEffects(raptor.actor, cast).map(e => e.name), [], "nothing the cast laid is left on the Raptor");
      assert.ok(decayOf(raptor.actor), "07 §9: the Decay stays - not a condition, it runs its minute");
      assert.isTrue(raptor.actor.statuses.has("prone"), "the bare Prone was not ended");
      assert.deepEqual(c.getFlag("azeroth-rpg", "sustaining") ?? [], [], "the caster's Sustain list is empty");
      const notice = game.i18n.format("AZEROTH.Dispel.SustainNotice", { name: c.name, spell: "Sand Prison" });
      assert.equal(said.filter(s => s === notice).length, 1, `the Sustain was ended exactly once: ${JSON.stringify(said)}`);
      assert.notInclude(said.join(" | "), game.i18n.format("AZEROTH.Escape.SustainLeftNotice", { name: c.name, spell: "Sand Prison" }), "no second end through the freed door");
      assert.equal(priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value, manaPriest - 4, "the Dispel cost its 4 Mana");
      // The card says what was ended, in words.
      assert.include(textOf(live(dispelCard)), game.i18n.format("AZEROTH.Dispel.SustainEnded", { spell: "Sand Prison", caster: c.name, held: raptor.doc.name }), "the card names the Sustain ended");
      // No upkeep at the caster's next turn start.
      const manaThen = manaOf(c).value;
      if (combat.combatant?.id === combat.getCombatantsByActor(c)[0]?.id) await stepTurn(combat);
      await nextTurnUntil(c, combat);
      await sleep(2000);
      assert.equal(manaOf(c).value, manaThen, "no upkeep once Dispel has ended the Sustain");
    });

    /* ---- O-308: Stasis on two creatures ---------------------------------------- */

    it("O-308: one Stasis holding two Raptors, Dispelled from one: both are freed, the Sustain ends once, and what Stasis held resumes", async function () {
      this.timeout(900000);
      const { c, scene, combat, foes } = await twoRaptors("ZZ S6 Stasis");
      const [first, second] = foes;
      const spell = c.items.find(i => i.type === "spell" && i.name === "Stasis");
      // A timed effect the second Raptor carries before the hold: Stasis switches it off.
      const rTurn = combat.combatants.find(x => x.tokenId === second.doc.id);
      const [timed] = await second.actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ S6 Timed", img: "icons/svg/aura.svg",
        duration: { value: 3, units: "rounds", expiry: "turnEnd" },
        start: { combat: combat.id, combatant: rTurn.id, round: combat.round, turn: combat.turn, time: game.time.worldTime }
      }]);
      await readyStasis(c);
      const mod = Number(c.system.abilities.int.mod) + Number(c.system.proficiency);
      const { card } = await castThroughDialog(c, "Stasis", { targets: [first.doc.object, second.doc.object], face: Math.min(20, 25 - mod), ticks: id => id.startsWith("sand-") });
      assert.ok(card, "Stasis posted a card");
      assert.isTrue(flagsOf(card).success, "the Casting Test went off");
      assert.equal(flagsOf(card).targets.length, 2, "both Raptors hit");
      const cast = flagsOf(card).cast;
      await resistRow(strict(), card, 0, 1);
      await resistRow(strict(), card, 1, 1);
      await until(() => stasisOn(first.actor) && stasisOn(second.actor), "both Raptors held");
      await until(() => second.actor.effects.get(timed.id)?.disabled === true, "the timed effect held by Stasis");
      const priest = await priestNear(scene, "ZZ S6 Stasis Priest", { x: AT.x + 20 * FT, y: AT.y + 200 });
      const { feature, card: used } = await pressUse(priest, "Dispel", [first.doc.object], 18);
      const app = await chooser(feature);
      const text = app.element.textContent.replace(/\s+/g, " ");
      const held = [first.doc.name, second.doc.name].sort((a, b) => a.localeCompare(b)).join(", ");
      assert.include(text, game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Stasis", caster: c.name, held }), "the Sustain listed with both creatures it holds");
      const said = await infosDuring(async () => {
        await pick(app, "Stasis");
        assert.ok(await used, "the Dispel posted its card");
        await until(() => !sustainOf(c, spell), "O-308: the Stasis Sustain ends", 20000);
        await until(() => !stasisOn(first.actor) && !stasisOn(second.actor), "both Raptors freed", 20000);
      }, 3000);
      assert.deepEqual([...castEffects(first.actor, cast), ...castEffects(second.actor, cast)].map(e => e.name), [], "nothing the cast laid is left on either");
      const notice = game.i18n.format("AZEROTH.Dispel.SustainNotice", { name: c.name, spell: "Stasis" });
      assert.equal(said.filter(s => s === notice).length, 1, `the Sustain was ended exactly once: ${JSON.stringify(said)}`);
      assert.notInclude(said.join(" | "), game.i18n.format("AZEROTH.Escape.SustainLeftNotice", { name: c.name, spell: "Stasis" }), "no second end through the freed door");
      // *Nothing already affecting it advances*: released with the hold, its stamp gone.
      await until(() => second.actor.effects.get(timed.id)?.disabled === false && !second.actor.effects.get(timed.id)?.flags?.["azeroth-rpg"]?.[HELD_FLAG], "the held effect resumes", 20000);
      void warnings;
    });
  });
}
