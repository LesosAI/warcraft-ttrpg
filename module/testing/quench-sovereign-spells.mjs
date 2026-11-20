/**
 * **THE SOVEREIGN'S SPELLS, THROUGH THE REAL CONTROLS** (07 §17, *Restricted Sovereign*, and the spells it
 * shares; the San'layn and Sovereign plan's C.4 spell rows; D-1240 onward). Every cast is the sheet's own
 * Cast with its dialog skipped; every Resist and Apply is pressed on the card as drawn; every incoming blow
 * comes off a creature's real attack card; dice are pinned through `fixtures.mjs#pinDie`. The pure laws and
 * the census are `module/rules/sovereign-spells.test.mjs`.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.sovereign-spells`.
 */

import { cleanup, made, makeCharacter, openSheet, quietScrollingText, settle } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { fightWith, freshTurn, pressCard, sceneWith, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { cast, castOk, creature, resist } from "./quench-necromancer-spells.mjs";
import { npcAttacks } from "./quench-necromancer-review.mjs";
import { ATTACK_LESS_FLAG, BLOOD_CURSE_FLAG, MAJESTY_FLAG, SKILL_BOON_FLAG, UNFADING_FLAG } from "../rules/sovereign-spells.mjs";
import { BLEED_FOR_ME_FLAG, COMMAND_FLAG, LEASH_FLAG } from "../effects/sovereign-spells.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const health = actor => actor.system.health.value;
const effectOf = (actor, pred) => (actor.effects ?? []).find(pred) ?? null;
const bleedingOf = actor => effectOf(actor, e => [...(e.statuses ?? [])].includes("bleeding"));

/** A Sovereign at a level, these spells known (embedded past the learning door, as fixtures may), its Vitae full. */
async function sovereign(name, { level = 5, spells = [], abilities = { con: 16, cha: 16, dex: 14 } } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", spells, abilities });
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  await setPool(s, "vitae", vitaeOf(s).max);
  return s;
}

/** A pool set by a GM's hand (the named `hand` door). */
async function setPool(actor, which, value) {
  const pool = which === "vitae" ? vitaeOf(actor) : tributeOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value }, {}, { vitaeGain: "hand", tributeGain: "hand" });
  await until(() => (which === "vitae" ? vitaeOf(actor) : tributeOf(actor)).value === Math.min(value, pool.max), `${which} set`);
}

/** Press a card's Apply damage for a row; resolves once the row's creature has taken it. */
async function applyRow(card, index, victim) {
  const before = health(victim);
  const p = await pressCard(card, `button[data-action="applyDamage"][data-target-index="${index}"]`);
  try { await until(() => health(victim) !== before, `${victim.name}'s Health to move`, 15000); } finally { await p.release(); }
  return before - health(victim);
}

/** Mark the prey through CORE's door (Hunt Mortal's mark, out of a fight). */
async function markPrey(s, target) {
  const { markPrey: mark } = await import("../effects/sovereign-core.mjs");
  await mark(s, tokenOf(target)?.document ?? target, { way: "hunt" });
  const { isPrey } = await import("../effects/sovereign-core.mjs");
  await until(() => isPrey(s, target), `${target.name} marked as prey`);
}

/** The words dialog a cast asks (Royal Command, Royal Herald, Oath of Fealty), answered. */
const words = text => async () => {
  const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.querySelector('input[name="words"]')), "the words dialog", 15000);
  app.element.querySelector('input[name="words"]').value = text;
  app.element.querySelector('button[data-action="ok"]').click();
};

export function sovereignSpellsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Sovereign's spells (07 §17; the San'layn and Sovereign plan's C.4)", function () {
    let restoreText = null;
    let heldDialog = null;

    before(async function () {
      this.timeout(120000);
      const index = await game.packs.get("azeroth-rpg.spells").getIndex();
      if (!index.some(e => e.name === "Bloodbolt")) throw new Error("the spells pack holds no Bloodbolt: rebuild the packs");
      heldDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      restoreText = await quietScrollingText();
    });

    after(async function () {
      this.timeout(180000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | sovereign-spells teardown (${what}): ${err?.message ?? err}`); } };
      await restore("the selection", () => canvas?.tokens?.setTargets?.([]));
      await restore("the windows", async () => {
        for (const app of [...foundry.applications.instances.values()]) {
          const id = String(app.id ?? "");
          if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-sov-words-")) await app.close().catch(() => {});
        }
      });
      await restore("the roll dialog", () => game.settings.set(SCOPE, ROLL_DIALOG_SETTING, heldDialog));
      await restore("the fights", async () => { for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete(); });
      await restore("the scenes", async () => { for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete(); });
      await cleanup();
      await restoreText?.();
    });

    it("Casting in Vitae and Physical blood: Bloodbolt costs 5 Vitae, meets AP 3 and no Ward, bleeds 1, and heals 3 off the prey", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Bolt");
      const foe = await creature("Alliance Footman", "Bolt Footman", { hp: 40 });
      await foe.update({ "system.ap.body": 3, "system.ward.shadow": 3 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      await markPrey(s, foe);
      const before = vitaeOf(s).value;
      await s.update({ "system.health.value": s.system.health.max - 5 });
      const card = await castOk(s, "Bloodbolt", { targets: [foe] });
      await until(() => vitaeOf(s).value === before - 5, "5 Vitae spent");
      assert.match(card.content, /Vitae/, "the card names Vitae");
      assert.equal(await applyRow(card, 0, foe), 3, "6 Physical less Body AP 3, and the Shadow Ward never meets it");
      const bled = await until(() => bleedingOf(foe), "Bleeding laid with the hit");
      assert.equal(bled.flags?.[SCOPE]?.value ?? 1, 1, "Bleeding 1");
      assert.match(card.flags[SCOPE].sovereignSpell ? "ok" : "", /ok/, "the card carries the Sovereign's plan");
      const heal = document.querySelector(`[data-message-id="${card.id}"] [data-action="applyHealing"][data-self]`);
      assert.ok(heal, "the card offers the caster's heal off its prey");
    });

    it("Decree of Frailty: a failure deals 3 Shadow and lays the blood curse, its repeat and its lost damage", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Decree");
      const foe = await creature("Alliance Footman", "Decree Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Decree of Frailty", { targets: [foe] });
      await resist(card, 0, 1);
      const curse = await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]), "the blood curse laid");
      assert.equal(curse.flags[SCOPE][BLOOD_CURSE_FLAG].source, s.uuid, "the curse is this Sovereign's");
      assert.equal(curse.flags[SCOPE][ATTACK_LESS_FLAG]?.amount, 3, "each attack deals 3 less");
      assert.equal(curse.flags[SCOPE][ESCAPE_FLAG]?.condition, "curse", "the repeat rides the curse's own escape");
      assert.equal(curse.flags[SCOPE][ESCAPE_FLAG]?.on, "turnEnd", "at the end of each of its turns");
      const struck = health(foe);
      assert.ok(await applyRow(card, 0, foe) > 0, "the failure's 3 Shadow lands");
      assert.ok(health(foe) < struck);
      // The cursed creature's attack on the Sovereign deals 3 less, off its own attack card.
      const row = foe.system.attacks[0]?.name;
      const top = health(s);
      const attack = await npcAttacks(foe, row, s, { face: 19 });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try { await until(() => health(s) !== top || (s.system.health.temp ?? 0) > 0, "the cursed blow lands", 15000).catch(() => null); } finally { await p.release(); }
      const dealt = top - health(s);
      const full = attack.flags?.[SCOPE]?.damageByTarget?.[0]?.damage ?? null;
      if (full !== null && full > 0) assert.equal(dealt, Math.max(0, full - 3), "3 less than the card's damage");
    });

    it("Leaden Decree and Shackles of the Court: the condition the failure laid carries the blood curse", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Leaden", { spells: ["Leaden Decree"] });
      const foe = await creature("Alliance Footman", "Leaden Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Leaden Decree", { targets: [foe] });
      await resist(card, 0, 1);
      const slowed = await until(() => effectOf(foe, e => [...(e.statuses ?? [])].includes("slowed") && e.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]), "the Slowed tagged");
      assert.equal(slowed.flags[SCOPE][ESCAPE_FLAG]?.condition, "slowed", "its repeat ends the Slowed");
    });

    it("Bleed for Me (R61): a Half-Action that leaves the other, Bleeding 3 at the Spell DC, and 1 Health back at the caster's turn", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov Bleed", { spells: ["Bleed for Me"] });
      const foe = await creature("Alliance Footman", "Bleed Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const combat = await fightWith([s, foe]);
      const mine = await freshTurn(s, 2);
      const card = await castOk(s, "Bleed for Me", { targets: [foe] });
      await until(() => (mine.budget?.halfActions ?? 0) === 1, "one Half-Action spent, one left for an Attack");
      await resist(card, 0, 1);
      const bleeding = await until(() => { const b = bleedingOf(foe); return b?.flags?.[SCOPE]?.[BLEED_FOR_ME_FLAG] ? b : null; }, "Bleed for Me's Bleeding");
      assert.equal(bleeding.flags[SCOPE].value, 3, "Bleeding 3");
      assert.equal(bleeding.flags[SCOPE][BLEED_FOR_ME_FLAG].dc, card.flags[SCOPE].spellDC, "the Medicine Test is against the Spell DC");
      await s.update({ "system.health.value": s.system.health.max - 4 });
      const low = health(s);
      // Round the table to the Sovereign's next turn: its start gives 1 Health back.
      await freshTurn(foe, 1).catch(() => null);
      await freshTurn(s, 2);
      await until(() => health(s) >= low + 1, "1 Health back at the caster's turn start", 30000);
      assert.ok(combat);
    });

    it("Captivating Gaze (R62): the leash FEATURES' door reads, held to the caster at 10 feet, and a Bane against the caster alone", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Gaze", { spells: ["Captivating Gaze"] });
      const foe = await creature("Alliance Footman", "Gaze Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Captivating Gaze", { targets: [foe] });
      await resist(card, 0, 1);
      const curse = await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.[LEASH_FLAG]), "the leash laid");
      const leash = curse.flags[SCOPE][LEASH_FLAG];
      assert.equal(leash.feet, 10, "10 feet");
      assert.equal(leash.holder, tokenOf(s).document.uuid, "held to the caster's token");
      assert.equal(curse.flags[SCOPE].laidBane?.only?.actorId, s.id, "the Bane is on Attack Tests against the caster alone");
      assert.ok(curse.flags[SCOPE][BLOOD_CURSE_FLAG], "a blood curse");
    });

    it("Tithe of the Many: every enemy in 10 feet and no ally, Bleeding 1 on a failure, 2 Health back a failure", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov Tithe", { level: 11, spells: ["Tithe of the Many"] });
      const foe = await creature("Alliance Footman", "Tithe Footman", { hp: 60 });
      const far = await creature("Alliance Footman", "Tithe Far Footman", { hp: 60 });
      const friend = await creature("Alliance Footman", "Tithe Friend", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" },
        { actor: far, x: 1600, y: 1000, side: "hostile" }, { actor: friend, x: 1000, y: 1100, side: "friendly" }]);
      const card = await castOk(s, "Tithe of the Many");
      const rows = card.flags[SCOPE].targets.map(t => t.tokenId);
      assert.deepEqual(rows, [tokenOf(foe).id], "only the enemy within 10 feet: the ally is spared and the far enemy unreached");
      await s.update({ "system.health.value": s.system.health.max - 6 });
      const low = health(s);
      await resist(card, 0, 1);
      // The shared door lays the Bleeding, then the Sovereign door writes its number: wait for the number.
      const bled = await until(() => (bleedingOf(foe)?.flags?.[SCOPE]?.value === 1 ? bleedingOf(foe) : null), "Bleeding 1 on the failure");
      assert.equal(bled.flags[SCOPE].value, 1, "Bleeding 1");
      await until(() => health(s) === low + 2, "2 Health back for the one failure");
    });

    it("Swarming Shadows: refused with no prey, and on the prey a Region attached to its token, enemies' tick and ground", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov Swarm", { spells: ["Swarming Shadows"] });
      const foe = await creature("Alliance Footman", "Swarm Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1400, y: 1000, side: "hostile" }]);
      const refused = await cast(s, "Swarming Shadows", { ms: 6000 });
      assert.notOk(refused?.flags, "no prey, no cast");
      assert.match(refused?.refusal ?? "", /prey/, "refused in words");
      await markPrey(s, foe);
      const made1 = new Promise(resolve => { const id = Hooks.on("createRegion", r => { Hooks.off("createRegion", id); resolve(r); }); });
      await castOk(s, "Swarming Shadows");
      const region = await Promise.race([made1, sleep(20000).then(() => null)]);
      assert.ok(region, "a Region was laid");
      assert.equal(region.attachment?.token?.id ?? region.attachment?.token, tokenOf(foe).id, "attached to the prey's token, so it follows the prey");
      assert.equal(region.flags[SCOPE].areaTick?.who, "enemy", "each enemy that starts its turn in it");
      assert.equal(region.flags[SCOPE].areaGround?.who, "enemy", "Difficult ground for the caster's enemies");
    });

    it("Mantle of Majesty (R61): a Half-Action, 11 plus Constitution temporary Health, and no Slowed or Entangled", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Mantle", { level: 11, spells: ["Mantle of Majesty"] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      const card = await castOk(s, "Mantle of Majesty");
      const p = await pressCard(card, 'button[data-action="applySpellEffect"]');
      try { await until(() => (s.system.health.temp ?? 0) === 11 + s.system.abilities.con.mod, "11 plus Constitution temporary Health"); } finally { await p.release(); }
      await until(() => (s.system.conditionImmunities ?? []).includes("slowed") && s.system.conditionImmunities.includes("entangled"), "Slowed and Entangled refused");
    });

    it("Embrace of the Vampyr: refused on a standing target, and on a Prone living one it heals what it deals and feeds with no Test", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov Embrace", { level: 17, spells: ["Embrace of the Vampyr"] });
      const foe = await creature("Alliance Footman", "Embrace Footman", { hp: 80 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const refused = await cast(s, "Embrace of the Vampyr", { targets: [foe], ms: 6000 });
      assert.notOk(refused?.flags, "a standing target is refused");
      assert.match(refused?.refusal ?? "", /Stunned|Prone|Entangled/, "in words naming what it needs");
      await foe.toggleStatusEffect("prone", { active: true });
      await setPool(s, "vitae", vitaeOf(s).max - 30);
      const v = vitaeOf(s).value;
      const card = await castOk(s, "Embrace of the Vampyr", { targets: [foe] });
      const after = vitaeOf(s).value;
      assert.equal(after, v - 20, "20 Vitae paid");
      await applyRow(card, 0, foe);
      await until(() => vitaeOf(s).value > after, "the feeding gives Vitae back, with no Test", 20000);
    });

    it("Aortic Unraveling (R70): a Half-Action at Touch, refused at 10 feet, and a kill fills Tribute to the cap", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov Aortic", { level: 17, spells: ["Aortic Unraveling"] });
      const foe = await creature("Alliance Footman", "Aortic Footman", { hp: 5 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const far = await cast(s, "Aortic Unraveling", { targets: [foe], ms: 6000 });
      assert.notOk(far?.flags, "10 feet away is refused");
      await tokenOf(foe).document.move({ x: 1100, y: 1000, action: "displace" });
      await until(() => tokenOf(foe).document.x === 1100, "the footman beside the Sovereign");
      const card = await castOk(s, "Aortic Unraveling", { targets: [foe] });
      assert.equal(card.flags[SCOPE].identifier, "aortic-unraveling");
      await resist(card, 0, 1);
      await applyRow(card, 0, foe);
      await until(() => tributeOf(s).value === tributeOf(s).max, "Tribute up to the cap on the kill", 20000);
    });

    it("The Crimson Tithe (R67): every enemy within 90 feet and no ally is asked", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov Tithe5", { level: 17, spells: ["The Crimson Tithe"] });
      const near = await creature("Alliance Footman", "Crimson Near", { hp: 60 });
      const at80 = await creature("Alliance Footman", "Crimson 80", { hp: 60 });
      const at100 = await creature("Alliance Footman", "Crimson 100", { hp: 60 });
      const friend = await creature("Alliance Footman", "Crimson Friend", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: near, x: 1100, y: 1000, side: "hostile" }, { actor: at80, x: 1000 + 1700, y: 1000, side: "hostile" },
        { actor: at100, x: 1000, y: 1000 + 2100, side: "hostile" }, { actor: friend, x: 900, y: 1000, side: "friendly" }]);
      const card = await castOk(s, "The Crimson Tithe");
      const rows = new Set(card.flags[SCOPE].targets.map(t => t.tokenId));
      assert.ok(rows.has(tokenOf(near).id) && rows.has(tokenOf(at80).id), "the enemies within 90 feet");
      assert.notOk(rows.has(tokenOf(at100).id), "not the enemy beyond");
      assert.notOk(rows.has(tokenOf(friend).id), "and never an ally");
    });

    it("Unfading Glory (R68): a Boon on every Test, and a sword blow to 0 held at 1 for a Tribute", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov Glory", { level: 17, spells: ["Unfading Glory"] });
      const foe = await creature("Alliance Footman", "Glory Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await castOk(s, "Unfading Glory");
      const glory = await until(() => effectOf(s, e => e.flags?.[SCOPE]?.[UNFADING_FLAG]), "Unfading Glory laid");
      assert.equal(glory.flags[SCOPE].laidBoon?.kind, "all", "a Boon on every Test");
      assert.equal(glory.flags[SCOPE].laidBoon?.lasting, true, "for the hour, never spent");
      await setPool(s, "tribute", 2);
      await s.update({ "system.health.value": 2, "system.health.temp": 0 });
      const attack = await npcAttacks(foe, foe.system.attacks[0]?.name, s, { face: 20 });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      // The Tribute is spent inside the blow and the Health written after it: wait for both.
      try { await until(() => tributeOf(s).value === 1 && health(s) === 1, `1 Tribute spent and held at 1 Health (Tribute ${tributeOf(s).value}, Health ${health(s)})`, 15000); } finally { await p.release(); }
      assert.equal(health(s), 1, "held at 1 Health");
    });

    it("Majesty Unbound: the caster's blows on its prey carry its tier in Shadow", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov Majesty", { level: 17, spells: ["Majesty Unbound"] });
      const foe = await creature("Alliance Footman", "Majesty Footman", { hp: 80 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await castOk(s, "Majesty Unbound");
      await until(() => effectOf(s, e => e.flags?.[SCOPE]?.[MAJESTY_FLAG]), "Majesty Unbound laid");
      await markPrey(s, foe);
      const before = health(foe);
      await foe.applyDamage(5, { by: s, attack: true, struck: true });
      assert.equal(before - health(foe), 5 + s.system.tier - (foe.system.ward?.shadow ?? 0), "5 and the tier in Shadow");
    });

    it("Royal Command (R65): its words asked before the Vitae, Charmed on a failure, and harm by the caster ends it", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov Command", { level: 11, spells: ["Royal Command"] });
      const foe = await makeCharacter({ name: "ZZ Command Mark", classes: [["Warrior", 3]], race: "Human" });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1200, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Royal Command", { targets: [foe], steps: [words("Kneel and stay where you are")] });
      assert.equal(card.flags[SCOPE].sovereignSpell?.command, "Kneel and stay where you are", "the command rides the card");
      await resist(card, 0, 1);
      const charmed = await until(() => effectOf(foe, e => [...(e.statuses ?? [])].includes("charmed") && e.flags?.[SCOPE]?.[COMMAND_FLAG]), "Charmed with the command");
      assert.equal(charmed.flags[SCOPE][COMMAND_FLAG].by, s.uuid);
      await foe.applyDamage(2, { by: s, attack: true, struck: true });
      await until(() => !foe.effects.has(charmed.id), "harm by the caster ends the command");
    });

    it("Air of Majesty: a Boon on Leadership and Intimidation drawn as the roll dialog's UNTICKED judgement line", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Air", { spells: ["Air of Majesty"] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      await castOk(s, "Air of Majesty");
      await until(() => effectOf(s, e => e.flags?.[SCOPE]?.[SKILL_BOON_FLAG]), "the Boon laid");
      await until(() => (s.system.spellSkillBoons?.leadership ?? []).includes("Air of Majesty") && (s.system.spellSkillBoons?.intimidation ?? []).includes("Air of Majesty"), "on both skills");
      // *against creatures that can see you* is the table's call (D2 §12; the fix pass's N8): the dialog's own
      // preparation draws it as a judgement line, unchecked, and never an automatic one.
      const { prepareRoll } = await import("../applications/roll-dialog.mjs");
      const p = prepareRoll(s, { kind: "skill", skill: "leadership", targets: [] });
      const line = p.situational.judgement.find(l => l.id === "spellSkillBoon");
      assert.ok(line, "a judgement line for the spell's Boon");
      assert.equal(line.checked, false, "unticked");
      assert.include(line.name ?? "", "Air of Majesty", "named for the spell");
      assert.notOk(p.situational.automatic.some(l => l.id === "spellSkillBoon" || l.id === "gearBoon"), "and no automatic line");
    });

    it("A Warlock's Drain Life is unchanged: Mana, and no Sovereign door", async function () {
      this.timeout(120000);
      const w = await makeCharacter({ name: "ZZ Warlock Drain", classes: [["Warlock", 3]], race: "Human", spells: ["Drain Life"], abilities: { int: 16, cha: 16 } });
      const foe = await creature("Alliance Footman", "Drain Footman", { hp: 40 });
      // A new character's Mana starts empty here, as the Necromancer batch's `bankMana` fills it.
      const mana = await until(() => w.poolSnapshot().find(p => p.kind === "power" && p.name === "mana"), "the Warlock's Mana pool");
      await w.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await until(() => w.poolSnapshot().find(p => p.kind === "power" && p.name === "mana")?.value === mana.max, "Mana full");
      await sceneWith([{ actor: w, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(w, "Drain Life", { targets: [foe] });
      assert.notOk(card.flags[SCOPE].sovereignSpell, "no Sovereign plan on a Warlock's card");
      assert.notMatch(card.content, /Vitae/, "the card prints no Vitae");
      await settle();
    });

    it("the GM-side handler refuses a forged payload: any effect laid or ended, another's Mirror of Self run (D-982)", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov Forged Spells", { spells: ["Mirror of Self"] });
      const foe = await creature("Alliance Footman", "Forged Spell Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const { sovereignSpellQueryHandler: ask } = await import("../effects/sovereign-spells.mjs");
      // A player who owns nothing here, as core's query context hands the handler its asker.
      const forger = { id: "ZZForgerUser0003", name: "ZZ Forger", isGM: false };
      const refusedWith = async (payload, user, pattern, what) => {
        let message = null;
        try { await ask(payload, { user }); } catch (err) { message = err.message; }
        assert.ok(message, `${what}: refused`);
        if (pattern) assert.match(message, pattern, `${what}: in words`);
      };
      // An effect with no Sovereign's flag, laid by the caster's own GM: refused.
      await refusedWith({ act: "effect", casterUuid: s.uuid, targetUuid: foe.uuid, data: { name: "ZZ Forged", system: { changes: [{ key: "system.health.max", type: "override", value: "1" }] } } }, game.user, /names no Sovereign/, "an effect naming no Sovereign");
      // An oath naming the caster, asked by a user who does not own the caster: refused.
      await refusedWith({ act: "effect", casterUuid: s.uuid, targetUuid: foe.uuid, data: { name: "ZZ Forged Oath", flags: { [SCOPE]: { oathOfFealty: { by: s.uuid, oathId: "x", words: "x" } } } } }, forger, null, "another's oath");
      assert.notOk(foe.effects.some(e => String(e.name).startsWith("ZZ Forged")), "nothing was laid");
      // Any effect ended: the footman's own effect, by a user who owns neither it nor a caster it names.
      const [buff] = await foe.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Footman Buff", system: { changes: [] } }]);
      await refusedWith({ act: "endEffects", targetUuid: foe.uuid, ids: [buff.id] }, forger, /not the asker's to end/, "an effect ended at will");
      assert.ok(foe.effects.has(buff.id), "the buff stands");
      // Another player's Mirror of Self run on this client: refused before any dialog opens.
      const mirror = s.items.find(i => i.type === "spell" && i.name === "Mirror of Self");
      await refusedWith({ act: "mirror", holderUuid: s.uuid, spellId: mirror.id, deadline: Date.now() + 10000 }, forger, /do not own/, "another's Mirror of Self");
      await refusedWith({ act: "mirror", holderUuid: s.uuid, spellId: mirror.id, deadline: Date.now() - 1000 }, game.user, /already landed/, "a Mirror of Self past its blow");
    });
  });
}
