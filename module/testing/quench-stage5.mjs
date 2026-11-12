/**
 * **STAGE 5: THE LEAD'S RULINGS ON STAGE 4'S QUESTIONS, THROUGH THE REAL CONTROLS** (2026-11-10,
 * verbatim: *"306 - I agree"*, *"class gap - yes fix"*; D-898). Turn the Glass's read sits in
 * `quench-chronomancer-sweep-ft.mjs`, where Stage 4's was.
 *
 * One batch, run alone with `QUENCH_BATCH=azeroth-rpg.stage5`:
 *
 * - **O-306**: Stasis, taught by Stasis Lore and cast for 5 Sand from the sheet, at a Raptor whose
 *   Spirit Test the card's own Resist fails on a pinned die: the Raptor is held through Suspend's
 *   door - Stunned, the hold on the damage door (Sand Blast's Apply lands nothing), no forced move,
 *   the timed effect it already carried switched off and not counting down for two rounds - and
 *   the Sustain's end from the Spells tab frees it, the held effect resumed with the rounds it was
 *   held. A pinned pass lays nothing; a failure then a passed repeat Test at the end of its turn
 *   leaves the spell, and the Sustain ends with its last creature (O-303).
 * - **The Priest gap**: Mass Mend from the sheet at an ally, without Empowered Mending and at each
 *   rank: the ally at the reach's edge is healed, the ally one square past it refused in words with
 *   nothing spent.
 *
 * Every document a test makes is deleted in `after`.
 */

import { made, makeCharacter, openSheet, pinDie, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { forceMove } from "../effects/forced-movement.mjs";
import { SUSPEND_FLAG } from "../rules/chronomancer.mjs";
import { HELD_FLAG } from "../rules/sand-auras.mjs";
import { SPELL_USES_FLAG } from "../rules/spell-limits.mjs";
import {
  chronoInFight, featureNamed, freshTurn, manaOf, nextTurnUntil, pressCard, pressUse, sandOf, sceneWith, talentNamed, textOf, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import { AT, FT, east, endSustainFromSheet, flagsOf, frame, live, resistRow, sleep, stepTurn, sustainOf } from "./quench-chronomancer-sweep-t12.mjs";

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

/** Cast from the sheet through the OPEN dialog, ticking the lines `ticks` names, the die pinned. */
async function castTicking(actor, spellName, { targets = [], face = 15, ticks = () => false } = {}) {
  const spell = actor.items.find(i => i.type === "spell" && i.name === spellName);
  if (!spell) throw new Error(`${actor.name} holds no ${spellName}`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${spell.id}"] [data-action="castSpell"]`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "always");
  const unpin = pinDie(face);
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === "spell")
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  try {
    control.click();
    const dialog = await until(() => {
      const d = foundry.applications.instances.get(`azeroth-roll-${actor.id}`);
      return d?.rendered && d.element?.querySelector('button[data-action="roll"]') ? d : null;
    }, `${spellName}'s roll dialog`);
    for (const box of [...dialog.element.querySelectorAll('input[name^="tline-"]')]) {
      if (ticks(box.name.slice(6)) && !box.disabled) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    dialog.element.querySelector('button[data-action="roll"]').click();
    return await posted;
  } finally {
    unpin();
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Press a feature's Use on the sheet expecting a refusal: what was warned, and whether a card posted. */
async function refusedUse(actor, featureName, targets = [], ms = 2500) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id ?? t));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
    ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) { await sheet.close(); canvas.tokens?.setTargets([]); throw new Error(`the sheet draws no Use for ${featureName}`); }
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  let posted = null;
  const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === actor.id) { posted = m; made.push(m); } });
  try {
    const said = await warnings(async () => { control.click(); await sleep(ms); });
    return { said, card: posted };
  } finally {
    Hooks.off("createChatMessage", hook);
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Stasis's carrier on a creature: the hold whose kind is Stasis, or null. */
const stasisOn = actor => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[SUSPEND_FLAG]?.kind === "stasis") ?? null;

/** The escape prompt the end of a creature's turn posts for an effect. */
function escapePrompt(effectId) {
  return untilHook("createChatMessage", 60000, m => /data-purpose="escape"/.test(m.content ?? "") && Boolean(effectId) && (m.content ?? "").includes(effectId))
    .then(([m]) => { made.push(m); return m; }).catch(() => null);
}

/** A Chronomancer with Stasis Lore in a fight with a Raptor 20 feet off, Stasis learned. */
async function stasisFight(name) {
  const fight = await chronoInFight(name, { level: 16, ranks: { "Stasis Lore": 1 }, sand: 8, spells: ["Sand Blast"], enemies: [{ name: "Raptor", ...east(20), health: 200 }] });
  await until(() => fight.c.items.find(i => i.type === "spell" && i.name === "Stasis"), "Stasis learned", 30000);
  return { ...fight, raptor: fight.foes[0], spell: fight.c.items.find(i => i.type === "spell" && i.name === "Stasis") };
}

/** Cast Stasis for 5 Sand at the Raptor from the sheet (the dialog's Sand line ticked), a success. */
async function castStasis(c, raptor) {
  const mana = manaOf(c);
  if (mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  const sand = sandOf(c);
  if (sand.value < 5) await c.updatePool({ itemId: sand.itemId, kind: "momentum", value: Math.min(sand.max, 8) });
  await until(() => sandOf(c).value >= 5 && manaOf(c).value === manaOf(c).max, "Sand and Mana to cast");
  // 07 §4: a tier 4 spell is cast once until a Short Rest (D-882). A second cast in one test stands
  // for the rest a table would take between them; a rest itself would empty the Sand (02 §7).
  if (c.getFlag("azeroth-rpg", SPELL_USES_FLAG)) await c.unsetFlag("azeroth-rpg", SPELL_USES_FLAG);
  await freshTurn(c, 1);
  const before = { mana: manaOf(c).value, sand: sandOf(c).value };
  let card = null;
  const said = await warnings(async () => { card = await castTicking(c, "Stasis", { targets: [raptor.doc.object], face: 18, ticks: id => id.startsWith("sand-") }); });
  if (!card) throw new Error(`Stasis posted no card: ${JSON.stringify(said)} (turn: ${c.activeFight?.()?.combatant?.name ?? "none"})`);
  if (flagsOf(card).success !== true) throw new Error("the Casting Test did not succeed");
  return { card, before };
}

export function stage5Batch(context) {
  const { describe, it, assert } = context;

  describe("Stage 5 (D-898): Stasis held through Suspend's door, and Mass Mend's reach widened by Empowered Mending", function () {
    frame(context);

    it("O-306: a failed Spirit Test holds the Raptor - Stunned, no damage, no forced move, nothing advancing - until the Sustain ends", async function () {
      this.timeout(900000);
      const { c, combat, raptor, spell } = await stasisFight("ZZ S5 Stasis Held");
      const rTurn = combat.combatants.find(x => x.tokenId === raptor.doc.id);
      // A timed effect the Raptor already carries: one round, so two rounds would end it unheld.
      const [timed] = await raptor.actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ S5 Timed", img: "icons/svg/aura.svg",
        duration: { value: 1, units: "rounds", expiry: "turnEnd" },
        start: { combat: combat.id, combatant: rTurn.id, round: combat.round, turn: combat.turn, time: game.time.worldTime }
      }]);
      assert.ok(timed?.isTemporary, "the timed effect is temporary");
      const { card, before } = await castStasis(c, raptor);
      // Stasis Lore: 5 Sand, no Mana; the Sustain stands.
      await until(() => sandOf(c).value === before.sand - 5, "5 Sand paid (Stasis Lore)");
      assert.equal(manaOf(c).value, before.mana, "no Mana");
      assert.ok(sustainOf(c, spell), "the caster sustains Stasis");
      // The Raptor's own Spirit Test, failed on the card's own Resist.
      const r = await resistRow(strict(), card, 0, 1);
      assert.isFalse(r?.success, "the Spirit Test failed");
      const carrier = await until(() => stasisOn(raptor.actor), "O-306: Stasis's hold laid on the Raptor");
      const roundHeld = combat.round;
      assert.isTrue(carrier.statuses.has("stunned"), "the hold is a Stunned");
      assert.isTrue(raptor.actor.statuses.has("stunned"), "the Raptor is Stunned");
      const f = carrier.flags["azeroth-rpg"];
      assert.equal(f.cast, flagsOf(card).cast, "the carrier names the cast");
      assert.isTrue(f.sustained === true && f.holds === true, "the carrier wears the held-Sustain mark (O-303)");
      assert.equal(carrier.origin, c.uuid, "the caster laid it");
      assert.include(f.escape ?? {}, { condition: "stunned", on: "turnEnd", resilience: "spirit", leaves: true }, "07's repeat Test rides the Stunned");
      assert.isNull(carrier._source.duration?.value ?? null, "the hold has no span of its own: it stands while the Sustain does");
      assert.isFalse(carrier.isTemporary, "and is not a timed effect");
      // *nothing already affecting it advances*: the timed effect switched off and stamped.
      await until(() => raptor.actor.effects.get(timed.id)?.disabled === true && raptor.actor.effects.get(timed.id)?.flags?.["azeroth-rpg"]?.[HELD_FLAG], "the timed effect held");
      assert.isFalse(carrier.disabled, "the hold never switches its own carrier off");
      // *it takes no damage from any source*: Sand Blast's Apply lands nothing.
      await freshTurn(c, 2);
      const blast = await castTicking(c, "Sand Blast", { targets: [raptor.doc.object], face: 20 });
      assert.ok(blast, "Sand Blast posted a card");
      const hp = raptor.actor.system.health.value;
      const said = await infosDuring(async () => {
        const p = await pressCard(blast, 'button[data-action="applyDamage"][data-target-index="0"]:not([data-rider])');
        await sleep(2000);
        await p.release();
      });
      assert.equal(raptor.actor.system.health.value, hp, "no damage reached the held Raptor");
      assert.include(said.join(" | "), game.i18n.format("AZEROTH.Chrono.SuspendImmune", { name: raptor.actor.name }), `said in words: ${JSON.stringify(said)}`);
      // *or be moved*: the forced-move door refuses it.
      const x0 = raptor.doc.x;
      const moved = await forceMove({ token: raptor.doc, from: tokenOf(c).center, feet: 10, toward: "away", by: c, name: raptor.doc.name });
      assert.isFalse(moved.moved, "the held Raptor is not pushed");
      assert.equal(moved.reason, "held", "refused as held");
      assert.equal(raptor.doc.x, x0, "the token did not move");
      // Two rounds on: the one-round effect is still there, still held.
      for (let i = 0; i < 12 && combat.round < roundHeld + 2; i++) await stepTurn(combat);
      assert.isAtLeast(combat.round, roundHeld + 2, "two rounds have passed");
      assert.ok(raptor.actor.effects.get(timed.id), "the one-round effect did not run out while held");
      assert.isTrue(raptor.actor.effects.get(timed.id).disabled, "and it is still held");
      assert.ok(stasisOn(raptor.actor), "the Raptor is still held");
      // The Sustain's end from the Spells tab frees it, and what it carried resumes with the rounds held.
      if (combat.combatant?.id !== combat.getCombatantsByActor(c)[0]?.id) await nextTurnUntil(c, combat);
      const roundFreed = combat.round;
      await endSustainFromSheet(strict(), c, spell);
      await until(() => !stasisOn(raptor.actor) && !raptor.actor.statuses.has("stunned"), "the hold ends with the Sustain", 20000);
      await until(() => raptor.actor.effects.get(timed.id)?.disabled === false, "the timed effect resumed");
      const resumed = raptor.actor.effects.get(timed.id);
      assert.isUndefined(resumed.flags?.["azeroth-rpg"]?.[HELD_FLAG], "the hold's stamp is gone");
      assert.equal(resumed.duration.value, 1 + (roundFreed - roundHeld), `the span grew by the ${roundFreed - roundHeld} round(s) held`);
      // And damage lands again.
      await raptor.actor.applyDamage(3, { attack: false });
      await until(() => raptor.actor.system.health.value < hp, "damage lands once the hold is gone");
    });

    it("O-306: a passed Test lays nothing; a failure then a passed repeat Test at the end of its turn leaves the spell, and the Sustain ends", async function () {
      this.timeout(900000);
      const { c, combat, raptor, spell } = await stasisFight("ZZ S5 Stasis Pass");
      const rTurn = combat.combatants.find(x => x.tokenId === raptor.doc.id);
      const first = await castStasis(c, raptor);
      const r1 = await resistRow(strict(), first.card, 0, 20);
      assert.isTrue(r1?.success, "the Spirit Test passed");
      await sleep(2500);
      assert.isNull(stasisOn(raptor.actor), "a passed Test lays no hold");
      assert.isFalse(raptor.actor.statuses.has("stunned"), "and no Stun");
      if (sustainOf(c, spell)) await endSustainFromSheet(strict(), c, spell);
      // A failure, then the repeat Test at the end of the Raptor's turn, passed.
      const second = await castStasis(c, raptor);
      const r2 = await resistRow(strict(), second.card, 0, 1);
      assert.isFalse(r2?.success, "the second Spirit Test failed");
      const carrier = await until(() => stasisOn(raptor.actor), "held");
      const prompt = escapePrompt(carrier.id);
      await nextTurnUntil(rTurn, combat);
      await stepTurn(combat);
      const pc = await prompt;
      assert.ok(pc, "the end of its turn posted 07's repeat Test");
      const outcome = untilHook("createChatMessage", 30000, m => m.flags?.["azeroth-rpg"]?.kind === "escapeOutcome").then(([m]) => { made.push(m); return m; }).catch(() => null);
      const p = await pressCard(pc, 'button[data-action="resistTest"][data-purpose="escape"]', { face: 20 });
      await until(() => !stasisOn(raptor.actor), "a passed repeat Test leaves the spell", 30000);
      await p.release();
      await until(() => !sustainOf(c, spell), "O-303: the Sustain ends with its last creature", 20000);
      const oc = await outcome;
      assert.ok(oc, "the escape's card posted");
      assert.include(textOf(live(oc)), game.i18n.format("AZEROTH.Escape.SustainLeft", { name: raptor.actor.name, source: "Stasis", caster: c.name }), "the card says the Sustain ends");
    });

    it("the Priest gap: Mass Mend reaches 20 feet, 30 with Empowered Mending 1 and 40 with 2; one square past is refused in words with nothing spent", async function () {
      this.timeout(600000);
      const priest = await makeCharacter({ name: "ZZ S5 Mender", classes: [["Priest", 9]], abilities: { wis: 16 } });
      const ally = await makeCharacter({ name: "ZZ S5 Mended", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: priest, ...AT }, { actor: ally, ...east(20) }]);
      const allyToken = tokenOf(ally);
      const fillMana = async () => {
        const m = manaOf(priest);
        if (m.value !== m.max) await priest.updatePool({ itemId: m.itemId, kind: "power", value: m.max });
        await until(() => manaOf(priest).value === manaOf(priest).max, "the priest's Mana full");
      };
      const at = async feet => {
        await allyToken.document.move({ x: AT.x + feet * FT, y: AT.y, action: "displace" });
        await until(() => allyToken.document.x === AT.x + feet * FT, `the ally ${feet} feet off`);
      };
      const healed = async feet => {
        await fillMana();
        await at(feet);
        await ally.update({ "system.health.value": 1 });
        const { card } = await pressUse(priest, "Mass Mend", [allyToken], 18);
        assert.ok(await card, `Mass Mend reaches the ally ${feet} feet off`);
      };
      const refused = async (feet, reach) => {
        await fillMana();
        await at(feet);
        const mana = manaOf(priest).value;
        const r = await refusedUse(priest, "Mass Mend", [allyToken]);
        assert.isNull(r.card, `${feet} feet: no card`);
        assert.include(r.said.join(" | "), game.i18n.format("AZEROTH.Range.Refused", { target: allyToken.name, distance: String(feet), name: "Mass Mend", feet: reach }), `${feet} feet refused naming ${reach}: ${JSON.stringify(r.said)}`);
        assert.equal(manaOf(priest).value, mana, `${feet} feet: no Mana spent`);
      };
      // Without the talent: 02's 20 feet.
      await healed(20);
      await refused(25, 20);
      // Empowered Mending (Renew first, its prerequisite) at rank 1, then 2.
      for (const [talent, rank] of [["Renew", 1], ["Empowered Mending", 1]]) {
        const t = await until(() => talentNamed(priest, talent), `${talent} on the sheet`);
        await t.update({ "system.taken": rank });
        await until(() => talentNamed(priest, talent)?.system?.taken === rank, `${talent} at rank ${rank}`);
      }
      await healed(20);
      await healed(30);
      await refused(35, 30);
      await talentNamed(priest, "Empowered Mending").update({ "system.taken": 2 });
      await until(() => talentNamed(priest, "Empowered Mending")?.system?.taken === 2, "Empowered Mending at rank 2");
      await healed(40);
      await refused(45, 40);
    });
  });
}
