/**
 * **RANGE, WHOM A CAST NAMES, AND THE SIX-SECOND ROUND, THROUGH THE REAL CONTROLS** (O-288,
 * O-289, O-293; D-893). The lead, 2026-11-10: *"If an attempt to cast is out of the spells
 * range to the target, it should be stopped before resources are spent."*, *"for O-288 make
 * sure spell and ability range is considered system wide"*, *"293 - yes build that"*, *"296 -
 * ally means willing target"* and *"6 second round is fine."*
 *
 * Every refusal is pressed from the sheet's own Cast or Use, or the creature's own ability
 * button, and the test reads what was NOT spent: the Mana, the Half-Actions, the uses, and that
 * no card was posted. The round is moved by the tracker's own Next Turn and the fight ended as
 * the tracker's End Combat ends it (the fight deleted), and the clock and the spans are read.
 */

import { made, makeCharacter, makeNpc, openSheet, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import {
  castFromSheet, chronoInFight, featureNamed, freshTurn, manaOf, sceneWith, tokenOf, until
} from "./quench-chronomancer-common.mjs";
import { AT, east, frame, pools, sleep, sweepTest } from "./quench-chronomancer-sweep-t12.mjs";

/** Run `fn` and answer every warning it raised, in words. */
async function warnings(fn) {
  const said = [];
  const held = ui.notifications.warn;
  ui.notifications.warn = (msg, ...rest) => { said.push(String(msg)); return held.call(ui.notifications, msg, ...rest); };
  try { await fn(); } finally { ui.notifications.warn = held; }
  return said;
}

/** Move a creature's token by displacement (no feet charged, nothing metered) and wait for it. */
async function placeAt(doc, { x, y }) {
  await doc.move({ x, y, action: "displace" });
  await until(() => doc.x === x && doc.y === y, `${doc.name} at ${x},${y}`, 20000);
  await sleep(300);
}

/** Press a feature's Use on the sheet with a short wait for a card: answers the card or null. */
async function useFromSheet(actor, featureName, targets = [], ms = 6000) {
  const feature = await until(() => featureNamed(actor, featureName), `${featureName} granted`);
  canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${featureName}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Press a creature's ability on its own sheet: answers the card, or null where none was posted. */
async function abilityFromSheet(npc, name, targets = [], ms = 6000) {
  const index = (npc.system.creatureAbilities ?? []).findIndex(a => a.name === name);
  if (index < 0) throw new Error(`${npc.name} holds no ${name}`);
  canvas.tokens?.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(npc);
  const control = sheet.element.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`);
  if (!control) throw new Error(`${npc.name}'s sheet draws no Use for ${name}`);
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === npc.id).then(([m]) => { made.push(m); return m; }).catch(() => null);
  try {
    control.click();
    return await posted;
  } finally {
    canvas.tokens?.setTargets([]);
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
    await sheet.close();
  }
}

/** Press the tracker's Next Turn until the fight's round has moved on by one. */
async function nextRound(combat) {
  const round = combat.round;
  for (let i = 0; i <= combat.turns.length + 1 && combat.round === round; i++) {
    const settled = untilHook("combatTurnChange", 60000, x => x.id === combat.id);
    const control = ui.combat?.viewed?.id === combat.id ? ui.combat.element?.querySelector('button[data-action="nextTurn"]') : null;
    if (control && !control.disabled) control.click();
    else await combat.nextTurn();
    await settled;
  }
  await sleep(500);
}

export function rangeRoundTimeBatch(context) {
  const { describe, it, assert } = context;

  describe("Range, whom a cast names, and the six-second round (O-288, O-289, O-293; D-893)", function () {
    frame(context);

    it("SAND BLAST (60 ft): refused at 80 feet in words with nothing spent and no card; cast at exactly 60; refused at 65", async function () {
      this.timeout(600000);
      await sweepTest("Range: Sand Blast", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ RG Blast", { level: 9, spells: ["Sand Blast"], enemies: [{ name: "Raptor", ...east(80), health: 80 }] });
        const raptor = foes[0];
        await freshTurn(c, 2);
        const before = pools(c);
        let card = null;
        const said = await warnings(async () => { card = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18, ms: 6000 }); });
        sw.log("refusal", { said, before, after: pools(c) });
        sw.check(card === null, "no card was posted at 80 feet");
        sw.check(said.some(s => s.includes("Raptor") && s.includes("80 feet") && s.includes("60 feet")), "the refusal names the Raptor, its 80 feet and the 60 feet Sand Blast reaches", said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(before), "no Mana, Sand or Half-Action was spent", { before, after: pools(c) });
        // Exactly at the Range is inside it.
        await placeAt(raptor.doc, east(60));
        const at60 = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18 });
        sw.check(Boolean(at60), "cast at exactly 60 feet posts its card");
        sw.check(manaOf(c).value === before.mana - (Number(c.items.find(i => i.name === "Sand Blast").system.mana) || 0), "and pays its Mana", { before: before.mana, now: manaOf(c).value });
        // One square past it is outside.
        await freshTurn(c, 2);
        await placeAt(raptor.doc, east(65));
        const before65 = pools(c);
        let at65 = null;
        const said65 = await warnings(async () => { at65 = await castFromSheet(c, "Sand Blast", { targets: [raptor.doc.object], face: 18, ms: 6000 }); });
        sw.check(at65 === null && said65.some(s => s.includes("65 feet")), "refused at 65 feet", said65);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(before65), "and nothing spent", { before65, after: pools(c) });
      });
    });

    it("HOUR OF HASTE (Up to six allies): an enemy named is refused as not willing, nothing spent", async function () {
      this.timeout(600000);
      await sweepTest("Range: Hour of Haste", assert, async sw => {
        const { c, foes } = await chronoInFight("ZZ RG Haste", { level: 20, spells: ["Hour of Haste"], enemies: [{ name: "Raptor", ...east(20), health: 80 }] });
        await freshTurn(c, 2);
        const before = pools(c);
        let card = null;
        const said = await warnings(async () => { card = await castFromSheet(c, "Hour of Haste", { targets: [foes[0].doc.object], face: 18, ms: 6000 }); });
        sw.check(card === null, "no card at an enemy");
        sw.check(said.some(s => s.includes("Raptor") && /not willing/i.test(s)), "the refusal says the Raptor is not willing", said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(before), "nothing spent", { before, after: pools(c) });
      });
    });

    it("SANDS RUN BACK (Up to four creatures): five named is refused, nothing spent", async function () {
      this.timeout(600000);
      await sweepTest("Range: Sands Run Back", assert, async sw => {
        const enemies = [0, 1, 2, 3, 4].map(i => ({ name: "Raptor", x: AT.x + 200, y: AT.y - 400 + i * 200, health: 40 }));
        const { c, foes } = await chronoInFight("ZZ RG Run", { level: 20, spells: ["Sands Run Back"], enemies });
        const before = pools(c);
        let card = null;
        const said = await warnings(async () => { card = await castFromSheet(c, "Sands Run Back", { targets: foes.map(f => f.doc.object), face: 18, ms: 6000 }); });
        sw.check(card === null, "no card for five");
        sw.check(said.some(s => s.includes("up to 4") && s.includes("5")), "the refusal says up to 4 and 5 targeted", said);
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(before), "nothing spent", { before, after: pools(c) });
      });
    });

    it("SLIPSTREAM (One ally other than you within 30 feet): an ally 40 feet off is refused from the sheet's Use, its use and Mana kept", async function () {
      this.timeout(600000);
      await sweepTest("Range: Slipstream", assert, async sw => {
        const { c, friends } = await chronoInFight("ZZ RG Slip", { level: 20, enemies: [{ name: "Raptor", ...east(100), health: 80 }],
          allies: [{ name: "ZZ RG Friend", ...east(40) }] });
        const ally = friends[0];
        await freshTurn(c, 2);
        const slip = featureNamed(c, "Slipstream");
        const uses = slip.system.uses?.value ?? null;
        const before = pools(c);
        let card = null;
        const said = await warnings(async () => { card = await useFromSheet(c, "Slipstream", [tokenOf(ally)]); });
        sw.check(card === null, "no card");
        sw.check(said.some(s => s.includes("40 feet") && s.includes("30 feet")), "the refusal names 40 feet and the 30 feet Slipstream reaches", said);
        sw.check((featureNamed(c, "Slipstream").system.uses?.value ?? null) === uses, "the use is kept", { uses, now: featureNamed(c, "Slipstream").system.uses?.value });
        sw.check(JSON.stringify(pools(c)) === JSON.stringify(before), "no Mana or Half-Action spent", { before, after: pools(c) });
      });
    });

    it("A CREATURE'S ABILITY (Screech, one creature within fifteen feet): refused at 25 feet from its own sheet, used at 15", async function () {
      this.timeout(600000);
      await sweepTest("Range: Screech", assert, async sw => {
        const owl = await makeNpc("Winterspring Screecher");
        const hero = await makeCharacter({ name: "ZZ RG Heard", classes: [["Warrior", 3]] });
        await sceneWith([{ actor: owl, ...AT, side: "hostile" }, { actor: hero, ...east(25) }]);
        let card = null;
        const said = await warnings(async () => { card = await abilityFromSheet(owl, "Screech", [tokenOf(hero)]); });
        sw.check(card === null, "no card at 25 feet");
        sw.check(said.some(s => s.includes("25 feet") && s.includes("15 feet")), "the refusal names 25 feet and the 15 feet Screech reaches", said);
        await placeAt(tokenOf(hero).document, east(15));
        const near = await abilityFromSheet(owl, "Screech", [tokenOf(hero)]);
        sw.check(Boolean(near), "used at 15 feet, a card posted");
      });
    });

    it("A ROUND IS SIX SECONDS: the tracker's Next Turn moves the clock 6 a round; a span in rounds is not counted twice; at the fight's end a span in rounds runs on the clock, one in turns is one round, one that ends with the fight ends", async function () {
      this.timeout(600000);
      await sweepTest("Round time", assert, async sw => {
        sw.check(CONFIG.time.roundTime === 6 && !CONFIG.time.turnTime, "CONFIG.time.roundTime is 6 and turnTime 0", { roundTime: CONFIG.time.roundTime, turnTime: CONFIG.time.turnTime });
        const { c, combat, friends } = await chronoInFight("ZZ RG Clock", { level: 9, enemies: [{ name: "Raptor", ...east(100), health: 80 }],
          allies: [{ name: "ZZ RG Held", ...east(10) }] });
        const ally = friends[0];
        const t0 = game.time.worldTime;
        const r0 = combat.round;
        await nextRound(combat);
        await sw.wait(() => game.time.worldTime === t0 + 6, `the clock moved 6 seconds with the round (${t0} before)`);
        sw.check(combat.round === r0 + 1, "one round on");
        // Four spans laid in this round: three rounds (a short Decay-shaped span), a hundred rounds
        // (Quickening's ten minutes), one turn, and the rest of the encounter.
        const mine = combat.getCombatantsByActor(ally)[0];
        const start = { combat: combat.id, combatant: mine.id, round: combat.round, turn: combat.turn, time: game.time.worldTime };
        await ally.createEmbeddedDocuments("ActiveEffect", [
          { name: "ZZ RG three rounds", img: "icons/svg/clockwork.svg", duration: { value: 3, units: "rounds", expiry: "turnEnd" }, start },
          { name: "ZZ RG hundred rounds", img: "icons/svg/clockwork.svg", duration: { value: 100, units: "rounds", expiry: "turnEnd" }, start },
          { name: "ZZ RG one turn", img: "icons/svg/clockwork.svg", duration: { value: 1, units: "turns", expiry: "turnEnd" }, start },
          { name: "ZZ RG encounter", img: "icons/svg/clockwork.svg", duration: { value: 0, units: "rounds", expiry: "combatEnd" }, start }
        ]);
        // By name: the documents a create answers are not promised in the order handed in.
        const named = n => ally.effects.find(e => e.name === `ZZ RG ${n}`) ?? null;
        const three = named("three rounds"), hundred = named("hundred rounds"), turn = named("one turn"), encounter = named("encounter");
        sw.check(Boolean(three && hundred && turn && encounter), "the four spans laid");
        await nextRound(combat);
        await nextRound(combat);
        await sw.wait(() => game.time.worldTime === t0 + 18, "the clock at three rounds' worth");
        const live3 = ally.effects.get(three.id);
        sw.check(Boolean(live3) && live3.duration.remaining === 1, "the three-round span has 1 round left after two: the clock's 12 seconds were not counted again", live3 ? { remaining: live3.duration.remaining, secondsRemaining: live3.duration.secondsRemaining } : null);
        // The fight ends as the tracker's End Combat ends it, by deleting the fight.
        const tEnd = game.time.worldTime;
        await combat.delete();
        await sleep(1500);
        const h = ally.effects.get(hundred.id);
        // Stored in rounds still (nothing rewrote it), and prepared by core as seconds on the clock.
        sw.check(Boolean(h) && h._source.duration.units === "rounds" && h._source.duration.value === 100, "the hundred-round span is left in rounds for core to reframe", h ? { stored: h._source.duration, prepared: { units: h.duration.units, value: h.duration.value } } : null);
        sw.check(Boolean(h) && Math.abs((h.duration.secondsRemaining ?? 0) - (600 - (tEnd - start.time))) <= 6, "and core counts what is left of its ten minutes on the clock", h ? { secondsRemaining: h.duration.secondsRemaining, laidAt: start.time, tEnd } : null);
        const tn = ally.effects.get(turn.id);
        sw.check(!tn || (tn._source.duration.units === "seconds" && tn._source.duration.value === 6), "the span of turns is one round of the clock", tn ? { stored: tn._source.duration } : "gone");
        const t3 = ally.effects.get(three.id);
        sw.check(Boolean(t3) && t3._source.duration.units === "rounds" && Math.abs((t3.duration.secondsRemaining ?? 0) - 6) <= 1, "the three-round span's last round runs on the clock", t3 ? { stored: t3._source.duration, secondsRemaining: t3.duration.secondsRemaining } : null);
        await sw.wait(() => !ally.effects.get(encounter.id), "the span that ends with the fight is gone");
        await game.time.advance(7);
        await sw.wait(() => !ally.effects.get(turn.id), "the span of turns is gone a round later");
        sw.check(Boolean(ally.effects.get(hundred.id)), "the ten minutes still run");
        await game.time.advance(600);
        await sw.wait(() => !ally.effects.get(hundred.id), "and are gone once the clock has run them out", 20000);
        void c;
      });
    });
  });
}
