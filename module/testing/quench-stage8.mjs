/**
 * **STAGE 8: DISPEL AND A HELD AREA SUSTAIN, THROUGH THE REAL CONTROLS** (O-312; the lead,
 * 2026-11-11, verbatim: *"312 - yes it can"*, *"unweave - yes"*, *"disenchant - yes"*).
 *
 * One batch, run alone with `QUENCH_BATCH=azeroth-rpg.stage8`. Each test casts its own
 * Sandstorm from the Chronomancer's sheet, places it on a Raptor through the card's Place area,
 * and Dispels it from a Priest's sheet - the Priest stands on the scene, out of the fight:
 *
 * - **aimed at the CASTER**: the chooser lists the caster's Sustain by the spell's name with the
 *   creature standing in it;
 * - **aimed at a CREATURE standing in the area**, during its turn after the storm Blinded it:
 *   Dispel aimed at the caster beyond 30 feet is refused first with nothing spent; the Blinded
 *   the storm laid (no mark, D-899) runs out at the end of that turn after the area is gone;
 * - **aimed at the AREA itself**: Dispel with nothing targeted picks a point, refuses one past
 *   30 feet in words and waits, then lists the storm at the point picked.
 *
 * Each reads: the Sustain gone and ended once, the Region deleted once, the caster's Sustain
 * list empty, no tick at the Raptor's next turn start, no upkeep at the caster's, the Dispel's 4
 * Mana paid once and the card saying what ended. Every document a test makes is deleted in
 * `after`.
 */

import { made, makeCharacter, tokenData, tokenDrawn, untilHook, warnings } from "./fixtures.mjs";
import { castFromSheet, chooser, chronoInFight, freshTurn, manaOf, nextTurnUntil, pick, pressUse, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import {
  AT, FT, east, flagsOf, frame, live, pickActive, placeFrom, press, pressBoard, regionOfCast, sleep, stepTurn, sustainOf
} from "./quench-chronomancer-sweep-t12.mjs";

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

/** A Priest standing at a point, its Mana full, linked and drawn on the scene, out of the fight. */
async function priestAt(scene, name, { x, y }) {
  const priest = await makeCharacter({ name, classes: [["Priest", 5]], abilities: { wis: 16 } });
  await priest.update({ "prototypeToken.actorLink": true });
  await scene.createEmbeddedDocuments("Token", [await tokenData(priest, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })]);
  await until(() => tokenDrawn(tokenOf(priest)), "the priest's token drawn");
  const pm = priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
  if (pm) await priest.updatePool({ itemId: pm.itemId, kind: "power", value: pm.max });
  return priest;
}

const priestMana = priest => priest.poolSnapshot().find(p => p.kind === "power" && p.name === "mana").value;

/** The chooser's rows as drawn, one string a row. */
function rowsOf(app) {
  return [...app.element.querySelectorAll('input[name="choice"]')].map(b => b.closest("label")?.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .concat([...(app.element.querySelector("#azeroth-choose-select")?.options ?? [])].map(o => o.textContent.replace(/\s+/g, " ").trim()));
}

/**
 * A Chronomancer holding Sandstorm placed on a Raptor 45 feet east, a Priest at `priest`, and a
 * watch on the storm's Region being deleted.
 */
async function stormHeld(name, priestPoint) {
  const { c, scene, combat, foes } = await chronoInFight(name, { level: 9, spells: ["Sandstorm"], enemies: [{ name: "Raptor", ...east(45), health: 80 }] });
  const [raptor] = foes;
  const spell = c.items.find(i => i.name === "Sandstorm");
  const mana = manaOf(c);
  if (mana.value !== mana.max) await c.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
  await freshTurn(c, 2);
  const card = await castFromSheet(c, "Sandstorm", { face: 18 });
  if (!card) throw new Error("Sandstorm posted no card");
  const region = await placeFrom(strict(), card, raptor.doc.object.center);
  if (!region) throw new Error("Place area laid no Region");
  await until(() => sustainOf(c, spell), "the caster sustains Sandstorm");
  const watch = { deletes: 0 };
  const hookId = Hooks.on("deleteRegion", r => { if (r.id === region.id) watch.deletes += 1; });
  watch.off = () => Hooks.off("deleteRegion", hookId);
  const priest = await priestAt(scene, `${name} Priest`, priestPoint);
  return { c, scene, combat, raptor, spell, card, region, cast: flagsOf(card).cast, priest, watch, rTurn: combat.combatants.find(x => x.tokenId === raptor.doc.id) };
}

/**
 * What every run reads once the Dispel has landed: the Sustain gone and ended once, the Region
 * deleted once, the list empty, and the card naming the Sustain ended.
 */
async function readEnded(assert, { c, scene, spell, card, watch, priest, manaBefore, said, used, raptor }) {
  await until(() => !regionOfCast(scene, card), "the storm's Region deleted", 20000);
  await sleep(1500);
  assert.equal(watch.deletes, 1, "the Region was deleted exactly once");
  assert.isNull(sustainOf(c, spell), "the Sustain is gone");
  assert.deepEqual(c.getFlag("azeroth-rpg", "sustaining") ?? [], [], "the caster's Sustain list is empty");
  const notice = game.i18n.format("AZEROTH.Dispel.SustainNotice", { name: c.name, spell: "Sandstorm" });
  assert.equal(said.filter(s => s === notice).length, 1, `the Sustain was ended exactly once: ${JSON.stringify(said)}`);
  assert.notInclude(said.join(" | "), game.i18n.format("AZEROTH.Area.SustainTakenOff", { name: c.name, spell: "Sandstorm" }), "the Region's deletion ended nothing a second time");
  assert.equal(priestMana(priest), manaBefore - 4, "the Dispel cost its 4 Mana, once");
  assert.include(textOf(live(used)), game.i18n.format("AZEROTH.Dispel.SustainEnded", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name }), "the card names the Sustain ended");
}

/** No tick at the Raptor's next turn start, and no upkeep at the caster's. */
async function readQuiet(assert, { c, combat, raptor, rTurn }) {
  const manaThen = manaOf(c).value;
  if (combat.combatant?.id === combat.getCombatantsByActor(c)[0]?.id) await stepTurn(combat);
  await nextTurnUntil(c, combat);
  await sleep(2000);
  assert.equal(manaOf(c).value, manaThen, "no upkeep once Dispel has ended the Sustain");
  const hp = raptor.actor.system.health.value;
  const tested = untilHook("createChatMessage", 8000, m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === raptor.actor.uuid)
    .then(([m]) => { made.push(m); return m; }).catch(() => null);
  await nextTurnUntil(rTurn, combat);
  await sleep(2000);
  assert.equal(raptor.actor.system.health.value, hp, "no tick at the Raptor's turn start: the storm is gone");
  assert.isNull(await tested, "no area Test card at the Raptor's turn start");
}

export function stage8Batch(context) {
  const { describe, it, assert } = context;

  describe("Stage 8: Dispel ends a held area Sustain aimed at its caster, a creature in it, or the area itself (O-312)", function () {
    frame(context);

    it("aimed at the CASTER: the chooser lists Sandstorm by name with the creature in it, and Dispel ends the whole cast once", async function () {
      this.timeout(900000);
      const s = await stormHeld("ZZ S8 Caster", { x: AT.x + 10 * FT, y: AT.y + 200 });
      try {
        const { c, priest, raptor } = s;
        // Nothing of the cast stands on the caster or the Raptor: the storm has struck nobody yet.
        assert.deepEqual(raptor.actor.effects.filter(e => e.flags?.["azeroth-rpg"]?.cast === s.cast).map(e => e.name), [], "the storm laid nothing marked on the Raptor");
        const manaBefore = priestMana(priest);
        const { feature, card } = await pressUse(priest, "Dispel", [tokenOf(c)], 18);
        const app = await chooser(feature);
        const row = game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name });
        assert.include(app.element.textContent.replace(/\s+/g, " "), row, "the caster's Sustain listed by the spell's name, with the Raptor standing in it");
        assert.equal(rowsOf(app).filter(l => l.startsWith("Sandstorm")).length, 1, "one row for the cast");
        let used = null;
        const said = await infosDuring(async () => {
          await pick(app, "Sandstorm");
          used = await card;
          assert.ok(used, "the Dispel posted its card");
          await until(() => !sustainOf(c, s.spell), "the Sustain ends", 20000);
        }, 3000);
        await readEnded(assert, { ...s, manaBefore, said, used });
        await readQuiet(assert, s);
      } finally { s.watch.off(); }
    });

    it("aimed at a CREATURE in the area: refused past 30 feet at the caster with nothing spent, then ends the storm through the Raptor; its Blinded runs out on its own", async function () {
      this.timeout(900000);
      // The Priest stands 20 feet below the Raptor, outside the storm: within 30 feet of the
      // Raptor, over 30 from the caster.
      const s = await stormHeld("ZZ S8 Creature", { x: AT.x + 45 * FT, y: AT.y + 400 });
      try {
        const { c, combat, priest, raptor, rTurn } = s;
        // The Raptor's turn: the storm strikes and its failed Reflex Test Blinds it to the end of the turn.
        const tested = untilHook("createChatMessage", 40000, m => m.flags?.["azeroth-rpg"]?.kind === "areaTest" && m.flags["azeroth-rpg"].area?.actorUuid === raptor.actor.uuid)
          .then(([m]) => { made.push(m); return m; }).catch(() => null);
        await nextTurnUntil(rTurn, combat);
        const tc = await tested;
        assert.ok(tc, "the Raptor's Reflex Test card posted");
        const p = await press(strict(), tc, 'button[data-action="resistTest"]', { face: 1 });
        await until(() => raptor.actor.statuses.has("blinded"), "the storm Blinded the Raptor", 30000);
        if (p) await p.release();
        const blind = raptor.actor.effects.find(e => e.statuses?.has("blinded"));
        assert.notOk(blind.flags?.["azeroth-rpg"]?.sustained, "the storm's Blinded carries no mark of the cast (D-899)");
        // Aimed at the caster, 46 feet away: refused in words before anything is paid.
        const manaBefore = priestMana(priest);
        const refused = await warnings(async () => { await (await pressUse(priest, "Dispel", [tokenOf(c)], 18)).card; });
        // The range door's words (D-893), the first refusal of every Use.
        assert.ok(refused.some(w => w.includes(tokenOf(c).name) && /\b30 feet\b/.test(w)), `refused past 30 feet, in words: ${JSON.stringify(refused)}`);
        assert.equal(priestMana(priest), manaBefore, "nothing spent on the refusal");
        assert.ok(sustainOf(c, s.spell), "the storm still stands");
        // Aimed at the Raptor: the storm is a row beside its bare Blinded, which stays greyed.
        const { feature, card } = await pressUse(priest, "Dispel", [raptor.doc.object], 18);
        const app = await chooser(feature);
        const text = app.element.textContent.replace(/\s+/g, " ");
        assert.include(text, game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name }), "the storm listed through the creature standing in it");
        assert.include(text, game.i18n.format("AZEROTH.Dispel.Refuse.Condition", { conditions: game.i18n.localize(CONFIG.AZEROTH.conditions.blinded) }), "the bare Blinded stays greyed in words");
        let used = null;
        const said = await infosDuring(async () => {
          await pick(app, "Sandstorm");
          used = await card;
          assert.ok(used, "the Dispel posted its card");
          await until(() => !sustainOf(c, s.spell), "the Sustain ends", 20000);
        }, 3000);
        await readEnded(assert, { ...s, manaBefore, said, used });
        // The Blinded is left, and runs out at the end of the Raptor's turn with the area gone.
        assert.isTrue(raptor.actor.statuses.has("blinded"), "ending the area leaves the Blinded it laid");
        await stepTurn(combat);
        await until(() => !raptor.actor.statuses.has("blinded"), "the Blinded ran out at the end of that turn", 20000);
        await readQuiet(assert, s);
      } finally { s.watch.off(); }
    });

    it("aimed at the AREA itself: a point past 30 feet is refused and the pick waits; the storm at the point is listed and ended once", async function () {
      this.timeout(900000);
      // The Priest stands 30 feet east and 10 below the caster: about 18 feet from the storm's centre.
      const s = await stormHeld("ZZ S8 Area", { x: AT.x + 30 * FT, y: AT.y + 200 });
      try {
        const { c, priest, raptor, scene } = s;
        const manaBefore = priestMana(priest);
        let feature = null;
        let card = null;
        const said = [];
        const far = await warnings(async () => {
          ({ feature, card } = await pressUse(priest, "Dispel", [], 18));
          await until(pickActive, "the point pick armed", 15000);
          assert.include(game.system.azeroth.canvas.pickState()?.hint ?? "", game.i18n.format("AZEROTH.Dispel.PickArea", { name: "Dispel", feet: 30 }), "the hint says what to pick");
          // A point 80 feet east: inside no area, and past 30 feet from the Priest.
          pressBoard(east(80));
          await sleep(600);
          assert.isTrue(pickActive(), "the pick waits on after a point too far");
        });
        const tail = game.i18n.format("AZEROTH.Range.PointRefused", { name: "Dispel", distance: "@@", feet: 30 }).split("@@")[1];
        assert.ok(far.some(w => w.startsWith("That point is") || w.endsWith(tail)), `a point past 30 feet refused in the range door's words: ${JSON.stringify(far)}`);
        assert.ok(far.some(w => w.endsWith(tail)), `the refusal names Dispel's 30 feet: ${JSON.stringify(far)}`);
        assert.equal(priestMana(priest), manaBefore, "nothing spent on the refused point");
        pressBoard(raptor.doc.object.center);
        const app = await chooser(feature);
        assert.include(app.element.textContent.replace(/\s+/g, " "), game.i18n.format("AZEROTH.Dispel.SustainRow", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name }), "the storm at the point is listed");
        let used = null;
        said.push(...await infosDuring(async () => {
          await pick(app, "Sandstorm");
          used = await card;
          assert.ok(used, "the Dispel posted its card");
          await until(() => !sustainOf(c, s.spell), "the Sustain ends", 20000);
        }, 3000));
        await readEnded(assert, { ...s, manaBefore, said, used });
        assert.include(textOf(live(used)), game.i18n.format("AZEROTH.Dispel.Ended", { target: game.i18n.localize("AZEROTH.Dispel.TheArea"), effects: game.i18n.format("AZEROTH.Dispel.SustainEnded", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name }) }), "the card says it ended on the area");
        void scene;
        await readQuiet(assert, s);
      } finally { s.watch.off(); }
    });

    it("07's Unweave at a creature standing in the storm ends the storm whole, once (the lead: *\"unweave - yes\"*)", async function () {
      this.timeout(900000);
      const s = await stormHeld("ZZ S8 Unweave", { x: AT.x + 10 * FT, y: AT.y + 300 });
      try {
        const { c, scene, raptor } = s;
        const mage = await makeCharacter({ name: "ZZ S8 Unweave Mage", classes: [["Mage", 11]], abilities: { int: 16 }, spells: ["Unweave"] });
        await mage.update({ "prototypeToken.actorLink": true });
        await scene.createEmbeddedDocuments("Token", [await tokenData(mage, { x: AT.x + 30 * FT, y: AT.y + 300, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })]);
        await until(() => tokenDrawn(tokenOf(mage)), "the mage's token drawn");
        const mm = mage.poolSnapshot().find(p => p.kind === "power" && p.name === "mana");
        if (mm) await mage.updatePool({ itemId: mm.itemId, kind: "power", value: mm.max });
        let woven = null;
        const said = await infosDuring(async () => {
          woven = await castFromSheet(mage, "Unweave", { targets: [raptor.doc.object], face: 18 });
          assert.ok(woven, "Unweave posted its card");
          assert.isTrue(flagsOf(woven).success, "the Casting Test went off");
          await until(() => !sustainOf(c, s.spell), "the storm's Sustain ends", 20000);
        }, 3000);
        await until(() => !regionOfCast(scene, s.card), "the storm's Region deleted", 20000);
        await sleep(1500);
        assert.equal(s.watch.deletes, 1, "the Region was deleted exactly once");
        assert.deepEqual(c.getFlag("azeroth-rpg", "sustaining") ?? [], [], "the caster's Sustain list is empty");
        const notice = game.i18n.format("AZEROTH.Dispel.SustainNotice", { name: c.name, spell: "Sandstorm" });
        assert.equal(said.filter(x => x === notice).length, 1, `the Sustain was ended exactly once: ${JSON.stringify(said)}`);
        assert.include(textOf(live(woven)), game.i18n.format("AZEROTH.Dispel.SustainEnded", { spell: "Sandstorm", caster: c.name, held: raptor.doc.name }), "the card names the Sustain ended");
        await readQuiet(assert, s);
      } finally { s.watch.off(); }
    });
  });
}
