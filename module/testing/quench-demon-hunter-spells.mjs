/**
 * **THE DEMON HUNTER'S SPELLS, THROUGH THE REAL CONTROLS** (07 §15, *Restricted Demon Hunter*, and the Fel spells
 * it borrows; the Demon Hunter plan's Phase 4b, C53 to C58; D-1540 onward). Every cast is the sheet's own Cast with
 * its dialog skipped; every pick is the one chooser or the board pick answered as a player would; every Resist,
 * Apply and press is the card's own button in the chat log; every move is a token moved on the board; dice are
 * pinned through `fixtures.mjs#pinDie`. The pure laws and the census are `module/rules/demon-hunter-spells.test.mjs`.
 *
 * Needs the Demon Hunter's spells in the compiled packs (`packs:parse`, then `packs:build`). Run alone with
 * `QUENCH_BATCH=azeroth-rpg.demon-hunter-spells`.
 */

import { cleanup, give, made, makeCharacter, quietScrollingText, settle, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, fightWith, pick, pressCard, sceneWith, tokenOf, turnForward, until, viewFight } from "./quench-chronomancer-common.mjs";
import { bankMana, board, castOk, creature, resist } from "./quench-necromancer-spells.mjs";
import {
  AGILITY_FLAG, AURA_LIGHT_FLAG, AWAY_FLAG, BRAND_FLAG, GAZE_FLAG, HUNTING_FLAG, SHEAR_FLAG, SNARE_FLAG, TORMENT_FLAG
} from "../rules/demon-hunter-spells.mjs";
import { dhSparesOpportunity } from "../effects/demon-hunter-sight.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const health = actor => actor.system.health.value;
const effectOf = (actor, pred) => (actor.effects ?? []).find(pred) ?? null;
const flagged = (actor, key) => effectOf(actor, e => e.flags?.[SCOPE]?.[key]);
const statusOf = (actor, id) => effectOf(actor, e => [...(e.statuses ?? [])].includes(id));
const energyOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "energy") ?? null;
const hatredOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "hatred") ?? null;

/** A Night Elf Demon Hunter at a level, these spells known (inside the cast cap), its Energy full. */
async function hunter(name, { level = 1, spells = [] } = {}) {
  const actor = await makeCharacter({ name, classes: [["Demon Hunter", level]], race: "Night Elf", spells, abilities: { dex: 16, wis: 16, con: 14 } });
  await until(() => energyOf(actor) && hatredOf(actor), "the Energy and Hatred pools");
  await bankMana(actor);
  return actor;
}

/** A glaive from 08 §7, equipped (the second in the off hand). */
async function glaive(actor, name = "Short warglaive", { offHand = false } = {}) {
  const item = await give(actor, name, "azeroth-rpg.weapons");
  await item.update({ "system.equipped": true, ...(offHand ? { "system.offHand": true } : {}) });
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} equipped`);
  return actor.items.get(item.id);
}

/** The next card of a kind this actor's client posts. */
function nextCard(pred, ms = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { Hooks.off("createChatMessage", id); reject(new Error("no card")); }, ms);
    const id = Hooks.on("createChatMessage", m => {
      if (!pred(m)) return;
      clearTimeout(timer);
      Hooks.off("createChatMessage", id);
      made.push(m);
      resolve(m);
    });
  });
}

/** The infos said while `fn` runs. */
async function sayingInfo(fn) {
  const said = [];
  const original = ui.notifications.info.bind(ui.notifications);
  ui.notifications.info = (msg, ...rest) => { said.push(String(msg)); return original(msg, ...rest); };
  try { return { value: await fn(), said }; } finally { ui.notifications.info = original; }
}

/** Accept the chooser as drawn (its ticked defaults). */
const acceptChooser = async spell => {
  const app = await chooser(spell, 15000);
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
};
const choose = name => async spell => pick(await chooser(spell, 15000), name);

export function demonHunterSpellsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Demon Hunter's spells (07 §15; the Demon Hunter plan's Phase 4b)", function () {
    let restoreText = null;
    let heldDialog = null;

    before(async function () {
      this.timeout(120000);
      const index = await game.packs.get("azeroth-rpg.spells").getIndex();
      if (!index.some(e => e.name === "Hunter's Brand")) throw new Error("the spells pack holds no Hunter's Brand: run packs:parse and rebuild the packs");
      heldDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      restoreText = await quietScrollingText();
    });

    after(async function () {
      this.timeout(180000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | demon-hunter-spells teardown (${what}): ${err?.message ?? err}`); } };
      await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
      await restore("the windows", async () => {
        for (const app of [...foundry.applications.instances.values()]) {
          const id = String(app.id ?? "");
          if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
        }
      });
      await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, heldDialog));
      await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
      await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
      await cleanup();
      await restoreText?.();
    });

    it("Hunter's Brand: laid at the cast on a demon, a Track card, and the direction and distance read off the board", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Brand", { spells: ["Hunter's Brand"] });
      const demon = await creature("Felguard", "Brand Felguard", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: demon, x: 1000, y: 600, side: "hostile" }]);
      const tracked = nextCard(m => m.flags?.[SCOPE]?.dhCard?.press === "track");
      const card = await castOk(dh, "Hunter's Brand", { targets: [demon] });
      assert.ok(card.flags[SCOPE].demonHunterSpell, "the card carries the Demon Hunter's plan");
      const brand = await until(() => flagged(demon, BRAND_FLAG), "the brand on the demon");
      assert.equal(brand.flags[SCOPE][BRAND_FLAG].by, dh.uuid, "the brand is this hunter's");
      assert.equal(brand.flags[SCOPE][BRAND_FLAG].demon, true, "a demon: it cannot be invisible to the hunter");
      assert.ok(!document.querySelector(`[data-message-id="${card.id}"] [data-action="applySpellEffect"]`), "the card offers no second Apply");
      const track = await tracked;
      const { said } = await sayingInfo(async () => { const p = await pressCard(track, 'button[data-dh-press="track"]'); await sleep(800); await p.release(); });
      // Measured between the NEAREST squares the two tokens occupy (D-732, `canvas/footprints.mjs`), never top-left to
      // top-left: the Felguard is Large (2x2) on rows 6 and 7, the hunter on row 10, so three squares lie between.
      assert.ok(said.some(s => /15 feet away/.test(s) && /north/.test(s)), `the reading names 15 feet to the north: ${said.join(" | ")}`);
      // The attacker's dialog drops the invisible target's Banes for the hunter alone.
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const [snap] = targetSnapshots([tokenOf(demon)]);
      assert.ok((snap.revealTo ?? []).includes(dh.uuid), "the snapshot names the hunter who sees through it");
    });

    it("Searing Edge: 1 more Fel on every weapon hit for the minute, on the attack door's typed lane, and nothing at the cast", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Edge", { spells: ["Searing Edge"] });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      const before = energyOf(dh).value;
      const card = await castOk(dh, "Searing Edge");
      await until(() => energyOf(dh).value === before - 3, "3 Energy spent");
      await until(() => (dh.system.damageBonus?.typed?.attack?.fel ?? 0) === 1, "the typed lane's 1 Fel");
      assert.ok(!document.querySelector(`[data-message-id="${card.id}"] [data-action="applyDamage"]`), "the card deals no damage at the cast");
    });

    it("Gaze of the Sightless: the circle where the hunter stands and the allies it chose", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Gaze", { spells: ["Gaze of the Sightless"] });
      const ally = await makeCharacter({ name: "ZZ DH Gaze Ally", classes: [["Warrior", 1]], race: "Human" });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      // OUTSIDE A FIGHT an ally is a fellow member of the Party (`rules/distance.mjs#countsAsAlly`, D-755, D-658): a
      // friendly token nobody has put in the Party is not the hunter's ally, and the Gaze would offer it nothing.
      await dh.setParty(true);
      await ally.setParty(true);
      await castOk(dh, "Gaze of the Sightless", { steps: [acceptChooser] });
      const gaze = await until(() => flagged(dh, GAZE_FLAG), "the Gaze on the hunter");
      assert.equal(gaze.flags[SCOPE][GAZE_FLAG].feet, 15, "a 15 ft radius");
      assert.deepEqual(gaze.flags[SCOPE][GAZE_FLAG].allies, [ally.uuid], "the ally chosen sees too");
    });

    it("Spellsunder: a tier 1 spell on the creature touched, picked at the cast, ends on its failed Spirit Test", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Sunder", { spells: ["Spellsunder"] });
      const warlock = await makeCharacter({ name: "ZZ DH Sunder Warlock", classes: [["Warlock", 1]], race: "Human", spells: ["Fel Armor"] });
      await bankMana(warlock); // a character is made with an empty Mana pool out of a fight
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: warlock, x: 1100, y: 1000, side: "hostile" }]);
      const armor = await castOk(warlock, "Fel Armor");
      const p = await pressCard(armor, 'button[data-action="applySpellEffect"][data-self]');
      try { await until(() => effectOf(warlock, e => e.name === "Fel Armor"), "Fel Armor laid"); } finally { await p.release(); }
      const card = await castOk(dh, "Spellsunder", { targets: [warlock], steps: [choose("Fel Armor")] });
      assert.equal(card.flags[SCOPE].demonHunterSpell.picked.kind, "effect", "the pick rides the card");
      await resist(card, 0, 1);
      await until(() => !effectOf(warlock, e => e.name === "Fel Armor"), "Fel Armor ended");
    });

    it("Immolation Aura: 1 Energy upkeep, its light, and 2 Fel on an enemy that moves within 5 feet on its turn, once", async function () {
      this.timeout(180000);
      const dh = await hunter("ZZ DH Aura", { spells: ["Immolation Aura"] });
      const foe = await creature("Alliance Footman", "Aura Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }]);
      const combat = await fightWith([dh, foe]);
      await castOk(dh, "Immolation Aura");
      await until(() => (dh.getFlag(SCOPE, "sustaining") ?? []).some(e => e.identifier === "immolation-aura"), "the Sustain held");
      const own = tokenOf(dh).document;
      await until(() => own.light?.bright === 20 && own.getFlag(SCOPE, AURA_LIGHT_FLAG), "the bright light at 20 ft");
      // The footman's turn: it walks in beside the hunter.
      const fc = combat.combatants.find(c => c.actor?.id === foe.id || c.actorId === foe.id);
      await combat.update({ turn: combat.turns.findIndex(c => c.id === fc.id) });
      await until(() => combat.combatant?.id === fc.id, "the footman's turn");
      const top = health(foe);
      await tokenOf(foe).document.move({ x: 1100, y: 1000, action: "walk" });
      await until(() => health(foe) === top - 2, "2 Fel on entering", 20000);
      // Away and back in on the same turn: once a turn.
      await tokenOf(foe).document.move({ x: 1400, y: 1000, action: "walk" });
      await sleep(600);
      await tokenOf(foe).document.move({ x: 1100, y: 1000, action: "walk" });
      await sleep(1500);
      assert.equal(health(foe), top - 2, "struck once a turn");
      // The Sustain dropped: the light goes back.
      await game.system.azeroth.workflows.endSustain({ actor: dh, cast: (dh.getFlag(SCOPE, "sustaining") ?? []).find(e => e.identifier === "immolation-aura")?.cast });
      await until(() => !own.getFlag(SCOPE, AURA_LIGHT_FLAG), "the token's own light back");
    });

    it("Demon Spikes: the Apply lays 1 Armor Point on every location and the melee retaliation", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Spikes", { spells: ["Demon Spikes"] });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      const body = dh.system.ap.body;
      const card = await castOk(dh, "Demon Spikes");
      const p = await pressCard(card, 'button[data-action="applySpellEffect"][data-self]');
      try { await until(() => dh.system.ap.body === body + 1, "Body AP +1"); } finally { await p.release(); }
      const laid = effectOf(dh, e => e.name === "Demon Spikes");
      assert.ok(laid?.flags?.[SCOPE]?.spellRetaliation, "the carrier holds the 1 Fel retaliation");
    });

    it("Agonizing Flames: the rising tick laid, and the target's own Put out ends it", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Flames", { level: 5, spells: ["Agonizing Flames"] });
      const foe = await creature("Alliance Footman", "Flames Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(dh, "Agonizing Flames", { targets: [foe] });
      const offered = nextCard(m => m.flags?.[SCOPE]?.dhCard?.press === "putOut");
      const p = await pressCard(card, 'button[data-action="applySpellEffect"][data-target-index="0"]');
      let tick;
      try { tick = await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.tick?.ramp), "the rising tick"); } finally { await p.release(); }
      assert.equal(tick.flags[SCOPE].tick.ramp.max, 4, "capped at the caster's tier plus 2");
      const offer = await offered;
      const q = await pressCard(offer, 'button[data-dh-press="putOut"]');
      try { await until(() => !foe.effects.get(tick.id), "the flames out"); } finally { await q.release(); }
    });

    it("Call the Glaives: the equipped glaives lying away come back to the hand", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Recall", { spells: ["Call the Glaives"] });
      const scene = await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      const a = await glaive(dh, "Short warglaive");
      await a.update({ [`flags.${SCOPE}.${AWAY_FLAG}`]: { sceneId: scene.id, x: 1600, y: 1000 } });
      assert.ok(!dh.readyWeapons().some(w => w.id === a.id), "a thrown glaive is no ready weapon");
      await castOk(dh, "Call the Glaives");
      await until(() => !dh.items.get(a.id)?.flags?.[SCOPE]?.[AWAY_FLAG], "the glaive back");
      assert.ok(dh.readyWeapons().some(w => w.id === a.id), "in the hand again");
    });

    it("Hellstrike: the leap to the space picked, and Prone on the creature near the landing that fails", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Hellstrike", { level: 5, spells: ["Hellstrike"] });
      const foe = await creature("Alliance Footman", "Hellstrike Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }]);
      const card = await castOk(dh, "Hellstrike", { steps: [board({ x: 1550, y: 1050 })] });
      await until(() => tokenOf(dh).document.x === 1500, "the hunter landed");
      assert.equal(card.flags[SCOPE].targets?.length ?? 0, 1, "the footman beside the landing is the card's row");
      await resist(card, 0, 1);
      await until(() => statusOf(foe, "prone"), "Prone on a failure");
    });

    it("Siphon the Weave: a tier 2 or lower spell on another creature ends with no Test, and the Energy comes back", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Siphon", { level: 5, spells: ["Siphon the Weave"] });
      const warlock = await makeCharacter({ name: "ZZ DH Siphon Warlock", classes: [["Warlock", 1]], race: "Human", spells: ["Fel Armor"] });
      await bankMana(warlock); // a character is made with an empty Mana pool out of a fight
      const footman = await makeCharacter({ name: "ZZ DH Siphon Ally", classes: [["Warrior", 1]], race: "Human" });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: warlock, x: 1300, y: 1000, side: "hostile" }, { actor: footman, x: 1200, y: 1200, side: "hostile" }]);
      // Fel Armor laid by the warlock on another creature (its own spell, Apply to the footman).
      const armor = await castOk(warlock, "Fel Armor");
      const sys = warlock.items.find(i => i.name === "Fel Armor");
      await footman.createEmbeddedDocuments("ActiveEffect", [{ name: "Fel Armor", origin: warlock.uuid, flags: { [SCOPE]: { spell: sys.uuid, spellName: "Fel Armor", identifier: "fel-armor", cast: armor.flags[SCOPE].cast } } }]);
      const pool = energyOf(dh);
      await dh.updatePool({ itemId: pool.itemId, kind: "power", value: 5 });
      await until(() => energyOf(dh).value === 5, "Energy at 5");
      await castOk(dh, "Siphon the Weave", { steps: [choose("Fel Armor")] });
      await until(() => !effectOf(footman, e => e.name === "Fel Armor"), "the spell ended");
      // 5, less 4 for the cast, plus twice tier 1.
      await until(() => energyOf(dh).value === 3, "2 Energy back");
    });

    it("Unnatural Agility: a Bane on every attack at the hunter and no Opportunity Attack", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Agility", { level: 5, spells: ["Unnatural Agility"] });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      await castOk(dh, "Unnatural Agility");
      await until(() => flagged(dh, AGILITY_FLAG), "the Agility on the hunter");
      assert.ok((dh.system.sovereignDeterred ?? []).some(r => r.source === "Unnatural Agility" && r.banes === 1), "the attacker's Bane lane");
      assert.equal(dhSparesOpportunity(dh, tokenOf(dh).document, [{ x: 1000, y: 1000 }]), true, "no Opportunity Attack");
    });

    it("Nether Snare: a demon that fails cannot turn invisible, and Banish against it takes the Boon", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Snare", { level: 5, spells: ["Nether Snare"] });
      const demon = await creature("Felguard", "Snare Felguard", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: demon, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(dh, "Nether Snare", { targets: [demon] });
      await resist(card, 0, 1);
      await until(() => flagged(demon, SNARE_FLAG), "the snare laid");
      const turned = await demon.toggleStatusEffect("invisible", { active: true });
      assert.equal(turned, false, "it cannot turn invisible");
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const [snap] = targetSnapshots([tokenOf(demon)]);
      assert.ok(snap.netherSnared, "the snapshot carries the snare for the Banish Boon");
    });

    it("Eye Beam: 3 Fel and Scorched 2 on a failure (the spell audit, D-1701)", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Beam", { level: 5, spells: ["Eye Beam"] });
      const foe = await creature("Alliance Footman", "Beam Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const card = await castOk(dh, "Eye Beam", { targets: [foe] });
      await resist(card, 0, 1);
      const scorched = await until(() => statusOf(foe, "scorched"), "Scorched laid");
      await until(() => scorched.flags?.[SCOPE]?.value === 2, "Scorched 2");
    });

    it("Flame Crash: both glaives thrown to two points, out of the hand, and one burning Region with a circle each", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Crash", { level: 5, spells: ["Flame Crash"] });
      const scene = await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      const a = await glaive(dh, "Short warglaive");
      const b = await glaive(dh, "Crescent glaive", { offHand: true });
      const card = await castOk(dh, "Flame Crash", { steps: [acceptChooser, board({ x: 1350, y: 1050 }), board({ x: 1050, y: 1350 })] });
      await until(() => dh.items.get(a.id)?.flags?.[SCOPE]?.[AWAY_FLAG] && dh.items.get(b.id)?.flags?.[SCOPE]?.[AWAY_FLAG], "both glaives away");
      const region = await until(() => scene.regions.find(r => r.flags?.[SCOPE]?.cast === card.flags[SCOPE].cast), "the burning ground");
      assert.equal(region.shapes.length, 2, "a circle where each glaive landed");
      assert.equal(region.flags[SCOPE].areaTick?.enter?.once, true, "once a turn however many areas");
      assert.equal(dh.readyWeapons().length, 0, "both hands are empty");
    });

    it("Hunting Ground: 3 Energy upkeep, and the area's ground, sight and Opportunity Attacks inside it alone", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Hunting", { level: 17, spells: ["Hunting Ground"] });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }]);
      await castOk(dh, "Hunting Ground");
      const held = await until(() => flagged(dh, HUNTING_FLAG), "the Hunting Ground on the hunter");
      const row = held.flags[SCOPE][HUNTING_FLAG];
      assert.equal(row.feet, 30, "a 30 ft radius");
      const doc = tokenOf(dh).document;
      assert.equal(dhSparesOpportunity(dh, doc, [{ x: 1000, y: 1000 }, { x: 1200, y: 1000 }]), true, "a move inside provokes none");
      assert.equal(dhSparesOpportunity(dh, doc, [{ x: 1000, y: 1000 }, { x: 2200, y: 1000 }]), false, "a move out of it provokes as normal");
      const { huntingGroundFree } = await import("../effects/demon-hunter-sight.mjs");
      const inside = canvas.grid.getOffset({ x: 1150, y: 1050 });
      const outside = canvas.grid.getOffset({ x: 2550, y: 1050 });
      assert.equal(huntingGroundFree(doc, inside), true, "Difficult ground ignored inside");
      assert.equal(huntingGroundFree(doc, outside), false, "and paid outside");
      await game.system.azeroth.workflows.endSustain({ actor: dh, cast: (dh.getFlag(SCOPE, "sustaining") ?? []).find(e => e.identifier === "hunting-ground")?.cast });
      await until(() => !flagged(dh, HUNTING_FLAG), "the area lifted with its Sustain");
    });

    it("Devour the Spell at a creature's turn start (D-1717, D-1726): asked before its upkeep, cast with the claim, its failed Spirit Test ends the Sustain for tier plus 2 Hatred", async function () {
      this.timeout(240000);
      const dh = await hunter("ZZ DH Devour", { level: 17, spells: ["Devour the Spell", "Immolation Aura"] });
      const warlock = await makeCharacter({ name: "ZZ DH Devour Warlock", classes: [["Warlock", 1]], race: "Human", spells: ["Felstep"] });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: warlock, x: 1300, y: 1000, side: "hostile" }]);
      await bankMana(warlock);
      await castOk(warlock, "Felstep");
      await until(() => (warlock.getFlag(SCOPE, "sustaining") ?? []).some(e => e.identifier === "felstep"), "Felstep sustained");
      // Cast from the sheet, outside its trigger: refused in words, nothing spent.
      const energyBefore = energyOf(dh).value;
      const refused = await warnings(async () => {
        await Promise.race([castOk(dh, "Devour the Spell").catch(() => null), sleep(4000)]);
      });
      assert.ok(refused.some(w => /start of the turn of a creature/.test(w)), `cast outside its trigger is refused in words: ${refused.join(" | ")}`);
      assert.equal(energyOf(dh).value, energyBefore, "nothing spent");
      // The turn start: the hunter answers yes (the batch's seam), the Casting Test succeeds (a natural 20), then the
      // warlock's Spirit Test fails (a natural 1) - the die switched once the cast's card is posted.
      const { setDevourAnswer } = await import("../effects/devour-the-spell-reaction.mjs");
      const asked = [];
      setDevourAnswer(o => { asked.push(o.creature?.uuid ?? null); return { yes: true }; });
      const priorDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      const original = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.001;
      const castCard = Hooks.on("createChatMessage", m => {
        if (m.flags?.[SCOPE]?.kind === "spell" && m.flags?.[SCOPE]?.identifier === "devour-the-spell") CONFIG.Dice.randomUniform = () => 0.999;
      });
      try {
        const combat = await fightWith([dh, warlock]);
        await viewFight(combat);
        if (combat.combatant?.actor?.id !== warlock.id) await turnForward(combat, warlock);
        // Seen once in four runs (the animations rerun, 2026-11-22): the Sustain still held after 60 s. A turn start
        // with a devour measured 66 s on this world (`_turnTicks` alone 13 s), so the failure says what it saw.
        try {
          await until(() => !(warlock.getFlag(SCOPE, "sustaining") ?? []).some(e => e.identifier === "felstep"), "the Sustain devoured before its upkeep", 60000);
        } catch (err) {
          const refusal = game.system.azeroth.workflows.turnBudgetRefusal?.(dh, "reaction") ?? null;
          throw new Error(`${err.message} (asked: ${JSON.stringify(asked)}; turn: ${combat.combatant?.name ?? "none"}; energy ${energyOf(dh)?.value}; reaction: ${refusal?.reason ?? "left"})`);
        }
        assert.deepEqual(asked, [warlock.uuid], "the hunter was asked once, at the warlock's turn start");
        // The cast's own 1 + 3 and the devoured tier 1's 1 + 2, capped at the pool's top.
        await until(() => hatredOf(dh).value >= Math.min(hatredOf(dh).max, 4 + 3), "the Hatred for the cast and the spell devoured");
        // A hunter never devours its own Sustain: Immolation Aura held at its own turn start is not asked.
        CONFIG.Dice.randomUniform = () => 0.001;
        await turnForward(combat, dh);
        await castOk(dh, "Immolation Aura");
        await until(() => (dh.getFlag(SCOPE, "sustaining") ?? []).some(e => e.identifier === "immolation-aura"), "Immolation Aura sustained");
        await turnForward(combat, warlock);
        await turnForward(combat, dh);
        await settle();
        assert.deepEqual(asked, [warlock.uuid], "the hunter was never asked about its own Sustain");
      } finally {
        Hooks.off("createChatMessage", castCard);
        CONFIG.Dice.randomUniform = original;
        setDevourAnswer(null);
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, priorDialog);
      }
    });

    it("Glaive Tempest: one attack against each enemy within reach, through the attack door", async function () {
      this.timeout(180000);
      const dh = await hunter("ZZ DH Tempest", { level: 17, spells: ["Glaive Tempest"] });
      const a = await creature("Alliance Footman", "Tempest Footman A", { hp: 40 });
      const b = await creature("Alliance Footman", "Tempest Footman B", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: a, x: 1100, y: 1000, side: "hostile" }, { actor: b, x: 900, y: 1000, side: "hostile" }]);
      await glaive(dh, "Short warglaive");
      const attacks = [];
      const id = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === dh.id && m.flags?.[SCOPE]?.kind === "attack") { attacks.push(m); made.push(m); } });
      try {
        await castOk(dh, "Glaive Tempest");
        await until(() => attacks.length === 2, "two attack cards", 30000);
      } finally { Hooks.off("createChatMessage", id); }
      await until(() => (dh.system.damageBonus?.typed?.attack?.fel ?? 0) === 0, "the 2 Fel lifted after the last attack");
    });

    it("Shear: the Health maximum drops by twice the tier for the minute, and the Health with it", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Shear", { level: 17, spells: ["Shear"] });
      const foe = await makeCharacter({ name: "ZZ DH Shear Target", classes: [["Warrior", 5]], race: "Human" });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const max = foe.system.health.max;
      await foe.update({ "system.health.value": max });
      const card = await castOk(dh, "Shear", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => flagged(foe, SHEAR_FLAG), "the drop laid");
      await until(() => foe.system.health.max === max - 2 * dh.system.tier, "the maximum dropped by twice the tier");
      await until(() => foe.system.health.value <= foe.system.health.max, "the Health no higher than the new maximum");
    });

    it("Draw Soul: the hunter regains 2 Health for the creature that failed", async function () {
      this.timeout(120000);
      const dh = await hunter("ZZ DH Draw", { level: 17, spells: ["Draw Soul"] });
      const foe = await creature("Alliance Footman", "Draw Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await dh.update({ "system.health.value": dh.system.health.max - 10 });
      const card = await castOk(dh, "Draw Soul", { targets: [foe] });
      assert.ok(!document.querySelector(`[data-message-id="${card.id}"] [data-action="applyHealing"]`), "the card offers the footman no heal");
      const top = health(dh);
      await resist(card, 0, 1);
      await until(() => health(dh) === top + 2, "2 Health back");
    });

    it("Inner Demon: Frightened and Entangled, the torment's tick, and a pass on its repeat ends all of it", async function () {
      this.timeout(150000);
      const dh = await hunter("ZZ DH Inner", { level: 17, spells: ["Inner Demon"] });
      const foe = await creature("Alliance Footman", "Inner Footman", { hp: 40 });
      await sceneWith([{ actor: dh, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(dh, "Inner Demon", { targets: [foe] });
      assert.ok(!document.querySelector(`[data-message-id="${card.id}"] [data-action="applyDamage"]`), "no damage at the cast: the 3 is the torment's");
      await resist(card, 0, 1);
      const frightened = await until(() => statusOf(foe, "frightened"), "Frightened");
      await until(() => statusOf(foe, "entangled"), "Entangled");
      const torment = await until(() => flagged(foe, TORMENT_FLAG), "the torment's carrier");
      assert.equal(torment.flags[SCOPE].tick.amount, 3, "3 Fel a turn");
      assert.equal(frightened.flags[SCOPE].escape?.condition, "frightened", "the repeat rides the Frightened");
      await foe.deleteEmbeddedDocuments("ActiveEffect", [frightened.id]);
      await until(() => !flagged(foe, TORMENT_FLAG), "the torment ends with the Frightened");
    });

    it("A borrowed Fel spell casts for a Warlock exactly as before: Fel Armor's Apply, and no Demon Hunter plan", async function () {
      this.timeout(120000);
      const warlock = await makeCharacter({ name: "ZZ DH Borrowed Warlock", classes: [["Warlock", 1]], race: "Human", spells: ["Fel Armor"] });
      await bankMana(warlock); // a character is made with an empty Mana pool out of a fight
      await sceneWith([{ actor: warlock, x: 1000, y: 1000 }]);
      const card = await castOk(warlock, "Fel Armor");
      assert.ok(!card.flags[SCOPE].demonHunterSpell, "no Demon Hunter door for the Warlock's cast");
      const p = await pressCard(card, 'button[data-action="applySpellEffect"][data-self]');
      try { await until(() => (warlock.system.ward?.fel ?? 0) >= 2, "Fel Armor's Ward"); } finally { await p.release(); }
      await settle();
    });
  });
}
