/**
 * **SIX SHELLS TAKE THEIR USE, PRESSED** (D-811; the lead, 2026-11-06: *"Fix this. A Use that lays
 * nothing records why. [...] A ceiling of 20 on such rows may only fall."*).
 *
 * D-807's twenty shells spent what 14 prices and laid nothing. Six state a mechanic one of D-809's
 * Boss doors lands, and `rules/creature-plans.mjs` gives each its row. A Vitest holds the table to
 * 14 and the pack and reads the doors' bodies; what none of it can see is the PRESS: the NPC
 * sheet's own Use control, the targets on the canvas, the doors landing on real documents, the
 * roll dialog reading a namer's exposure, a delayed summon's Place, and the encounter's lift.
 * Then migration 0.13.4 on a world actor and an unlinked token staled on purpose (CLAUDE.md §15).
 *
 * Every creature here is a `ZZ` copy, deleted in `after`; the bodies Calls the Watch places are
 * the Summoned folder's and are deleted with them.
 */

import { cleanup, drainAreaWork, made, makeCharacter, pinDie, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { cleanAutomation } from "../rules/ability-automation.mjs";
import { EXPOSED_FLAG, exposuresAgainst } from "../rules/class-talents.mjs";
import { LAID_BANE_FLAG, LAID_BOON_FLAG } from "../rules/banes.mjs";
import { exposuresOf } from "../applications/roll-dialog.mjs";
import { forgetPacks } from "../migrations/walk.mjs";
import { BESTIARY_PACK, OLD_CREATURE_PLANS, migrate } from "../migrations/0.13.4-creature-plans.mjs";

const SCOPE = "azeroth-rpg";
const until = async (fn, what, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 40));
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Deep equality with key order ignored. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/** What a call SAYS, both channels, and the notifier put back. */
async function saidDuring(fn) {
  const said = [];
  const originals = { warn: ui.notifications.warn, info: ui.notifications.info };
  for (const key of ["warn", "info"]) {
    ui.notifications[key] = function (message, ...rest) { said.push(String(message)); return originals[key].call(this, message, ...rest); };
  }
  try { return { result: await fn(), said }; } finally { Object.assign(ui.notifications, originals); }
}

/** The card's own button, off its stored content. */
function buttonsOf(card, selector) {
  const html = document.createElement("div");
  html.innerHTML = card.content;
  return [...html.querySelectorAll(selector)];
}

export function creaturePlansBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("D-811: six of D-807's shells take their Use, pressed from the sheet", function () {
    let scene = null;
    let baseActors = null;
    let mage = null;

    /** A pack creature as a ZZ world actor, linked. */
    async function worldCopy(name, suffix = "") {
      const pack = game.packs.get(BESTIARY_PACK);
      const entry = (await pack.getIndex()).find(e => e.name === name);
      assert.ok(entry, `${BESTIARY_PACK} holds no "${name}"`);
      const doc = await pack.getDocument(entry._id);
      const data = game.actors.fromCompendium(doc, { clearFolder: true });
      const actor = await Actor.create({ ...data, name: `ZZ ${name}${suffix}`, prototypeToken: { ...data.prototypeToken, actorLink: true } });
      made.push(actor);
      return actor;
    }

    /** Tokens for these actors, each found by its actor. */
    async function place(placements) {
      const data = [];
      for (const { actor, x, y, side } of placements) data.push(await tokenData(actor, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS[side] }));
      const created = await scene.createEmbeddedDocuments("Token", data);
      const tokens = placements.map(({ actor }) => created.find(t => t.actorId === actor.id));
      await until(() => tokens.every(t => tokenDrawn(t.object)), "every token drawn", 20000);
      await settle();
      return tokens;
    }

    /** Press a creature ability through the NPC sheet's own Use control, dialogs skipped. */
    async function press(actor, name, targets = []) {
      const index = actor.system.creatureAbilities.findIndex(r => r.name === name);
      assert.isAtLeast(index, 0, `${actor.name} holds no ${name}`);
      canvas.tokens.setTargets(targets.map(t => t.id));
      await settle();
      await actor.sheet.render({ force: true });
      const button = await until(() => actor.sheet.rendered && actor.sheet.element?.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`), `${actor.name}'s Use for ${name}`);
      const posted = untilHook("createChatMessage", 20000, m => m.speaker?.actor === actor.id && m.flags?.[SCOPE]?.kind === "ability" && m.flags[SCOPE].title === name).then(([m]) => m);
      const prior = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(20);
      try {
        button.click();
        return await posted;
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, prior);
        await actor.sheet.close().catch(() => {});
      }
    }

    /** Press, expecting a refusal in words and no card. */
    async function pressRefused(actor, name, targets = []) {
      const index = actor.system.creatureAbilities.findIndex(r => r.name === name);
      canvas.tokens.setTargets(targets.map(t => t.id));
      await settle();
      const n = game.messages.size;
      const { useAbility } = await import("../dice/workflows.mjs");
      const { said } = await saidDuring(() => useAbility({ actor, list: "creatureAbilities", index, targets: [] }));
      await sleep(300);
      return { said, posted: game.messages.size !== n };
    }

    const powerOf = actor => (actor.poolSnapshot?.() ?? []).find(p => p.kind === "power")?.value ?? null;

    /**
     * A started fight of these tokens, on the presser's turn. An ALLY is a side in a fight and a
     * Party member out of one (`rules/distance.mjs#countsAsAlly`, D-755), so a press that reaches
     * allies is made in a fight.
     */
    async function fightOn(name, tokens, presser) {
      const combat = await Combat.create({ scene: scene.id, name });
      await combat.createEmbeddedDocuments("Combatant", tokens.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      await combat.activate();
      await combat.startCombat();
      await until(() => combat.started, "the fight started");
      const idx = combat.turns.findIndex(c => c.tokenId === presser.id);
      if (combat.turn !== idx) await combat.update({ turn: idx });
      await until(() => combat.combatant?.tokenId === presser.id, "the presser's turn");
      return combat;
    }

    /**
     * End a fight once the work its turn and round changes started has landed: the active GM's
     * turn hooks are not awaited by the write that moved the turn (D-627), and a combatant write
     * that reaches the server after the fight is deleted is a page error.
     */
    async function endFight(combat) {
      await drainAreaWork().catch(() => null);
      await sleep(1500);
      await combat.delete();
    }

    before(async function () {
      this.timeout(120000);
      baseActors = new Set(game.actors.map(a => a.id));
      scene = await Scene.create({ name: "ZZ Creature Plans", width: 3000, height: 2400, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene viewed", 20000);
      mage = await makeCharacter({ name: "ZZ Plans Mage", classes: [["Mage", 3]] });
      await mage.update({ "prototypeToken.actorLink": true });
    });

    after(async function () {
      this.timeout(180000);
      await game.combats.filter(c => c.scene?.id === scene?.id).reduce((p, c) => p.then(() => c.delete().catch(() => {})), Promise.resolve());
      const extra = game.actors.filter(a => !baseActors.has(a.id) && !made.includes(a));
      for (const a of extra) await a.delete().catch(() => {});
      forgetPacks();
      await cleanup();
    });

    it("reads a rebuilt pack: the six carry their plans and no reason", async function () {
      this.timeout(30000);
      const pack = game.packs.get(BESTIARY_PACK);
      for (const [creature, ability] of [["Gnomish Battle Chicken", "Battle Squawk"], ["Farstrider", "Named Quarry"], ["Kirin Tor Magus", "Counterspell"],
        ["Silvermoon Citizen", "Arcane Torrent"], ["Town Guard", "Calls the Watch"], ["Troll Berserker", "Berserk"],
        // D-846: the Blue Drake's pull rides the same doors.
        ["Blue Drake", "Arcane Vacuum"]]) {
        const entry = (await pack.getIndex()).find(e => e.name === creature);
        const doc = await pack.getDocument(entry._id);
        const a = cleanAutomation(doc.system.creatureAbilities.find(r => r.name === ability).automation);
        assert.equal(a.reason, "", `${creature} / ${ability} still records a reason: the pack was not rebuilt from packs-src`);
        assert.ok(a.plan || a.kind === "summon", `${creature} / ${ability} carries no plan: the pack was not rebuilt from packs-src`);
      }
    });

    it("Battle Squawk lays a Boon on its next Attack Test on every ally within 10 feet, itself among them, and on no enemy", async function () {
      this.timeout(60000);
      const chicken = await worldCopy("Gnomish Battle Chicken");
      const kobold = await worldCopy("Kobold", " Squawk Ally");
      const far = await worldCopy("Kobold", " Squawk Far");
      const hunter = await worldCopy("Felhunter", " Squawk Enemy");
      const tokens = await place([
        { actor: chicken, x: 500, y: 500, side: "HOSTILE" },
        { actor: kobold, x: 600, y: 500, side: "HOSTILE" },
        { actor: far, x: 1000, y: 500, side: "HOSTILE" },
        { actor: hunter, x: 400, y: 500, side: "FRIENDLY" }
      ]);
      // *Once per encounter*: in a fight, where the chicken's side is its allies.
      const combat = await fightOn("ZZ Squawk", tokens, tokens[0]);
      const card = await press(chicken, "Battle Squawk");
      assert.ok(card, "no card");
      const boon = a => a.effects.find(e => e.getFlag(SCOPE, LAID_BOON_FLAG)?.source === "Battle Squawk");
      await until(() => boon(chicken) && boon(kobold), "the Boons on the chicken and the kobold beside it");
      assert.equal(boon(kobold).getFlag(SCOPE, LAID_BOON_FLAG).kind, "attack");
      assert.notEqual(boon(kobold).getFlag(SCOPE, LAID_BOON_FLAG).lasting, true, "a Boon on the NEXT Attack Test is a count, not a span");
      assert.notOk(boon(far), "a kobold 25 feet off took the Boon");
      assert.notOk(boon(hunter), "an enemy took the Boon");
      // Once per encounter: the use is struck.
      await until(() => chicken.system.creatureAbilities.find(r => r.name === "Battle Squawk").automation.uses.value === 0, "the use struck");
      await endFight(combat);
    });

    it("Named Quarry gives the farstrider alone a Boon against the creature it names, and a second name ends the first", async function () {
      this.timeout(60000);
      const far = await worldCopy("Farstrider");
      const other = await worldCopy("Kobold", " Quarry Other");
      const hunter = await worldCopy("Felhunter", " Quarry");
      const [farTok, , mageTok, hunterTok] = await place([
        { actor: far, x: 500, y: 1200, side: "HOSTILE" },
        { actor: other, x: 500, y: 1400, side: "HOSTILE" },
        { actor: mage, x: 900, y: 1200, side: "FRIENDLY" },
        { actor: hunter, x: 900, y: 1400, side: "FRIENDLY" }
      ]);
      assert.ok(farTok);
      // One creature, or nothing is spent.
      const none = await pressRefused(far, "Named Quarry", []);
      assert.isFalse(none.posted, "a quarry named nobody and posted a card");
      assert.isAbove(none.said.length, 0, "naming nobody was refused in silence");
      await press(far, "Named Quarry", [mageTok]);
      const quarry = a => a.effects.find(e => e.getFlag(SCOPE, EXPOSED_FLAG)?.source === "Named Quarry");
      await until(() => quarry(mage), "the mage named");
      const raw = quarry(mage).getFlag(SCOPE, EXPOSED_FLAG);
      assert.equal(raw.by, far.uuid, "the quarry is not the farstrider's alone");
      assert.isFalse(raw.ranged, "the quarry is a ranged attack's alone");
      // The dialog's reading: the farstrider's blow takes it, another hostile creature's does not.
      assert.equal(exposuresAgainst(exposuresOf(mage), { side: "hostile", uuid: far.uuid }).length, 1);
      assert.equal(exposuresAgainst(exposuresOf(mage), { side: "hostile", uuid: other.uuid }).length, 0);
      // A second name ends the first.
      await press(far, "Named Quarry", [hunterTok]);
      await until(() => quarry(hunter) && !quarry(mage), "the quarry moved to the felhunter");
    });

    it("Counterspell spends 4 Mana and lays a Bane on the next Casting Test of the one caster targeted within 30 feet", async function () {
      this.timeout(60000);
      const magus = await worldCopy("Kirin Tor Magus");
      const [, mageTok] = await place([
        { actor: magus, x: 1500, y: 500, side: "HOSTILE" },
        { actor: mage, x: 1600, y: 500, side: "FRIENDLY" }
      ]);
      const max = (magus.poolSnapshot?.() ?? []).find(p => p.kind === "power")?.max ?? 0;
      await magus.updatePool({ kind: "power", value: max });
      await until(() => powerOf(magus) === max, "the magus's Power full");
      const none = await pressRefused(magus, "Counterspell", []);
      assert.isFalse(none.posted, "Counterspell aimed at nobody posted a card");
      assert.isAbove(none.said.length, 0, "Counterspell aimed at nobody was refused in silence");
      assert.equal(powerOf(magus), max, "a refused Counterspell spent Mana");
      await press(magus, "Counterspell", [mageTok]);
      const bane = () => mage.effects.find(e => e.getFlag(SCOPE, LAID_BANE_FLAG)?.source === "Counterspell");
      await until(bane, "the Bane on the mage's Casting Test");
      assert.equal(bane().getFlag(SCOPE, LAID_BANE_FLAG).kind, "casting");
      await until(() => powerOf(magus) === max - 4, "4 Mana spent");
      await mage.deleteEmbeddedDocuments("ActiveEffect", [bane().id]);
    });

    it("Arcane Torrent drains 1 Power from every creature within 10 feet and the citizen gains what it drained", async function () {
      this.timeout(60000);
      const citizen = await worldCopy("Silvermoon Citizen");
      const neighbour = await worldCopy("Silvermoon Citizen", " Neighbour");
      await place([
        { actor: citizen, x: 1500, y: 1200, side: "HOSTILE" },
        { actor: neighbour, x: 1600, y: 1200, side: "FRIENDLY" }
      ]);
      await citizen.updatePool({ kind: "power", value: 0 });
      await neighbour.updatePool({ kind: "power", value: 2 });
      await until(() => powerOf(citizen) === 0 && powerOf(neighbour) === 2, "the pools set");
      await press(citizen, "Arcane Torrent");
      await until(() => powerOf(neighbour) === 1, "the neighbour drained of 1 Power");
      await until(() => powerOf(citizen) === 1, "the citizen gains the 1 it drained");
    });

    // D-846: *every enemy within 30 feet is pulled 20 feet toward the drake unless it passes a
    // Resilience (Spirit) Test at DC 17*. The circle gathers the enemy in range and no ally, the
    // failed Resist lands the pull through the forced-movement door, and the Short Rest's use is
    // struck. A pull was never asserted live before (the Boss batch checks only a push).
    it("Arcane Vacuum gathers the enemies within 30 feet, and a failed Spirit Test pulls one 20 feet toward the Blue Drake", async function () {
      this.timeout(90000);
      const drake = await worldCopy("Blue Drake");
      const kin = await worldCopy("Kobold", " Vacuum Ally");
      const hunter = await worldCopy("Felhunter", " Vacuum Far");
      // The drake is Large, two squares from (500, 1900); the mage stands 30 feet from its
      // nearest square, the kobold beside it, the felhunter 40 feet off.
      const [drakeTok, mageTok, kinTok, hunterTok] = await place([
        { actor: drake, x: 500, y: 1900, side: "HOSTILE" },
        { actor: mage, x: 1200, y: 1900, side: "FRIENDLY" },
        { actor: kin, x: 500, y: 2100, side: "HOSTILE" },
        { actor: hunter, x: 1400, y: 2200, side: "FRIENDLY" }
      ]);
      const card = await press(drake, "Arcane Vacuum");
      assert.ok(card, "no card");
      const named = (card.flags[SCOPE].targets ?? []).map(t => t.tokenId);
      assert.include(named, mageTok.id, "the mage 25 feet off was not gathered");
      assert.notInclude(named, kinTok.id, "the drake's own side was gathered");
      assert.notInclude(named, hunterTok.id, "a creature past 30 feet was gathered");
      const before = { x: mageTok.x, y: mageTok.y };
      const button = buttonsOf(card, '[data-action="resistTest"][data-target-index]')
        .find(b => (card.flags[SCOPE].targets ?? [])[Number(b.dataset.targetIndex)]?.tokenId === mageTok.id);
      assert.ok(button, "the card offers the mage no Resist");
      // The Resist opens the roll dialog unless it is skipped, and a dialog nobody answers is a
      // test that never ends.
      const prior = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, game.messages.get(card.id));
      } finally {
        unpin();
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, prior);
      }
      // A token's document position is interpolated while it travels (CLAUDE.md §15): wait for
      // it to come to rest, then read how far it went - four squares, never more.
      const at = () => scene.tokens.get(mageTok.id);
      await until(() => at().x < before.x, "the mage pulled toward the drake");
      await until(async () => { const was = `${at().x},${at().y}`; await sleep(300); return was === `${at().x},${at().y}`; }, "the pull at rest", 15000);
      const moved = Math.hypot(at().x - before.x, at().y - before.y);
      assert.isAtLeast(moved, 300, `the mage moved ${moved}px, less than 15 feet`);
      assert.isAtMost(moved, 400 * Math.SQRT2, `the mage moved ${moved}px, more than 20 feet`);
      await until(() => drake.system.creatureAbilities.find(r => r.name === "Arcane Vacuum").automation.uses.value === 0, "the Short Rest's use struck");
    });

    it("Berserk takes Boon on its attacks and exposes it for the encounter, and both lift when the fight ends", async function () {
      this.timeout(90000);
      const berserker = await worldCopy("Troll Berserker");
      const [berTok, mageTok] = await place([
        { actor: berserker, x: 2200, y: 500, side: "HOSTILE" },
        { actor: mage, x: 2300, y: 500, side: "FRIENDLY" }
      ]);
      const combat = await fightOn("ZZ Berserk", [berTok, mageTok], berTok);
      await press(berserker, "Berserk");
      const boon = () => berserker.effects.find(e => e.getFlag(SCOPE, LAID_BOON_FLAG)?.source === "Berserk");
      const exposed = () => berserker.effects.find(e => e.getFlag(SCOPE, EXPOSED_FLAG)?.source === "Berserk");
      await until(() => boon() && exposed(), "the Boon and the exposure");
      assert.isTrue(boon().getFlag(SCOPE, LAID_BOON_FLAG).lasting, "the Boon is spent by one attack, not held for the encounter");
      assert.equal(boon().getFlag(SCOPE, "until"), "encounter");
      assert.isFalse(exposed().getFlag(SCOPE, EXPOSED_FLAG).ranged, "only a ranged attack against it takes the Boon");
      assert.equal(exposed().getFlag(SCOPE, "until"), "encounter");
      // Every attack against it, melee included, as the dialog reads it.
      assert.equal(exposuresAgainst(exposuresOf(berserker), { side: "friendly", uuid: mage.uuid }).length, 1);
      await endFight(combat);
      await until(() => !boon() && !exposed(), "both lifted at the fight's end", 20000);
    });

    it("Calls the Watch places two Town Guards at the start of the third round after it, and not before", async function () {
      this.timeout(120000);
      const guard = await worldCopy("Town Guard");
      const [guardTok, mageTok] = await place([
        { actor: guard, x: 2200, y: 1500, side: "HOSTILE" },
        { actor: mage, x: 2300, y: 1500, side: "FRIENDLY" }
      ]);
      const combat = await fightOn("ZZ Watch", [guardTok, mageTok], guardTok);
      const called = combat.round;
      const card = await press(guard, "Calls the Watch");
      const summon = card.flags[SCOPE].summon;
      assert.equal(summon?.entry, "Town Guard");
      assert.equal(summon?.count, 2);
      assert.equal(summon?.from, "thirdRound");
      assert.equal(summon?.due, called + 3, "the card does not record the round they arrive in");
      const guards = () => scene.tokens.filter(t => t.actor?.name === "Town Guard" && t.id !== guardTok.id).length;
      const was = guards();
      const placeBtn = buttonsOf(card, '[data-action="placeSummon"]')[0];
      assert.ok(placeBtn, "the card offers no Place");
      const early = await saidDuring(() => CARD_ACTIONS.placeSummon(placeBtn, game.messages.get(card.id)));
      await sleep(400);
      assert.equal(guards(), was, "the watch was placed before it arrived");
      assert.isAbove(early.said.length, 0, "an early Place was refused in silence");
      await combat.update({ round: called + 3 });
      await until(() => combat.round === called + 3, "the third round after it");
      await CARD_ACTIONS.placeSummon(placeBtn, game.messages.get(card.id));
      await until(() => guards() === was + 2, "two Town Guards placed", 20000);
      // The guards placed join the fight and act at once: no arrival mark, which only *from the
      // next round* writes.
      await until(() => combat.combatants.filter(c => scene.tokens.get(c.tokenId)?.actor?.name === "Town Guard").length === 2, "the guards in the fight");
      assert.isFalse(combat.combatants.some(c => scene.tokens.get(c.tokenId)?.actor?.name === "Town Guard" && c.getFlag(SCOPE, "arrives")),
        "a guard placed in its own round waits for another");
      await endFight(combat);
    });

    it("Migration 0.13.4 restamps a stale Berserk on a world actor and an unlinked token, and twice changes nothing", async function () {
      this.timeout(120000);
      const pack = game.packs.get(BESTIARY_PACK);
      const entry = (await pack.getIndex()).find(e => e.name === "Troll Berserker");
      const doc = await pack.getDocument(entry._id);
      const fresh = cleanAutomation(doc.system.creatureAbilities.find(r => r.name === "Berserk").automation);
      const data = game.actors.fromCompendium(doc, { clearFolder: true });
      data.name = "ZZ Troll Berserker 0.13.4";
      const actor = await Actor.create(data);
      made.push(actor);
      const old = OLD_CREATURE_PLANS["troll-berserker"].creatureAbilities.Berserk.at(-1);
      const stale = async target => {
        const rows = foundry.utils.deepClone(target._source.system.creatureAbilities);
        rows.find(r => r.name === "Berserk").automation = cleanAutomation(old);
        await target.update({ "system.creatureAbilities": rows });
      };
      const held = target => cleanAutomation(target._source.system.creatureAbilities.find(r => r.name === "Berserk").automation);
      const [placed] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, actorLink: false, x: 2600, y: 2000 }]);
      const token = () => scene.tokens.get(placed.id);
      await stale(token().actor);
      await stale(actor);
      await until(() => held(actor).reason === "narrative" && held(token().actor).reason === "narrative", "the stale to take");
      forgetPacks();
      const logged = [];
      const touched = await migrate(line => logged.push(line));
      assert.isAtLeast(touched, 2, "the migration did not touch the world actor and the token");
      await until(() => same(held(actor), fresh) && same(held(token().actor), fresh), "both restamped from the pack");
      assert.equal(actor.system.creatureAbilities.find(r => r.name === "Berserk").automation.plan?.door, "amaniFury");
      assert.ok(logged.some(l => l.includes(token().actor.uuid)), "the token was touched and not logged");
      forgetPacks();
      assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
    });
  });
}
