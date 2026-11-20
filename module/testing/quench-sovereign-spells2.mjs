/**
 * **THE SOVEREIGN'S SECOND EIGHTEEN, THROUGH THE REAL CONTROLS** (07 §17, *Restricted Sovereign*; the lead, 2026-11-20:
 * *"After these edits let's build and add these with automation and animation"*; D-1360 onward). Every cast is the
 * sheet's own Cast with its dialog skipped; every Resist, Apply and repeat Test is pressed on the card as drawn; every
 * incoming blow comes off a creature's real attack card; dice are pinned through `fixtures.mjs#pinDie`. The pure laws
 * are `module/rules/sovereign-spells2.test.mjs`, the census `sovereign-spells.test.mjs`.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.sovereign-spells2`.
 */

import { cleanup, made, makeCharacter, openSheet, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { fightWith, freshTurn, pressCard, sceneWith, talentNamed, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castOk, creature, resist } from "./quench-necromancer-spells.mjs";
import { npcAttacks } from "./quench-necromancer-review.mjs";
import { BLOOD_CURSE_FLAG, BOND_FLAG, BURDEN_FLAG, COMMAND_FLAG, HEMOPLAGUE_FLAG, VEIL_FLAG, WEAPON_LESS_FLAG } from "../rules/sovereign-spells.mjs";
import { VULNERABLE_FLAG } from "../rules/laid-vulnerable.mjs";
import { FEED_DAYS_FLAG, feedDaysOf, withFeedDay } from "../rules/feeding.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { NEXT_ATTACK_FLAG } from "../rules/next-attack.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vitaeOf = actor => actor.poolSnapshot().find(p => p.kind === "power" && p.name === "vitae") ?? null;
const tributeOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "tribute") ?? null;
const health = actor => actor.system.health.value;
const effectOf = (actor, pred) => (actor.effects ?? []).find(pred) ?? null;
const statusEffect = (actor, id) => effectOf(actor, e => e.active !== false && [...(e.statuses ?? [])].includes(id));
const ownEffect = (actor, id) => effectOf(actor, e => e.flags?.[SCOPE]?.sovereignOwn === id);
const cursed = actor => effectOf(actor, e => e.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG]);
const textOf = message => (message?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** A Sovereign at a level, these spells known (embedded past the learning door, as fixtures may), its Vitae full. */
async function sovereign(name, { level = 11, spells = [], ranks = {}, abilities = { con: 16, cha: 16, dex: 14 }, weapons = [] } = {}) {
  const s = await makeCharacter({ name, classes: [["Sovereign", level]], race: "San'layn", spells, abilities, weapons });
  await s._talentGrant;
  await until(() => vitaeOf(s) && tributeOf(s), "the Vitae and Tribute pools");
  for (const [talent, taken] of Object.entries(ranks)) {
    const item = await until(() => talentNamed(s, talent), `${talent} embedded`);
    await item.update({ "system.taken": taken });
  }
  await setPool(s, vitaeOf(s).max);
  return s;
}

/** The Vitae set by a GM's hand (the named `hand` door). */
async function setPool(actor, value) {
  const pool = vitaeOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value }, {}, { vitaeGain: "hand" });
  await until(() => vitaeOf(actor).value === Math.min(value, pool.max), "the Vitae set");
}

/** Press a card's Apply damage for a row; resolves once the row's creature has taken it. */
async function applyRow(card, index, victim) {
  const before = health(victim);
  const selector = `button[data-action="applyDamage"][data-target-index="${index}"]`;
  // O-482 (FIXC): the flake was an Apply pressed before the Resist's record reached the card. The GM's Apply
  // operation judged the card *changed* once the record landed, after claiming the row `applying`, so the row stayed
  // claimed and every press read *being written now*. `resist` now waits for that record; one press is the rule
  // (a card's damage lands on a creature once), and a failure says what the card and the door said.
  let failed = null;
  const said = await warnings(async () => {
    const p = await pressCard(card, selector);
    try {
      await until(() => health(victim) !== before, `${victim.name}'s Health to move`, 15000);
    } catch (err) {
      failed = err;
    } finally { await p.release(); }
  });
  if (failed) {
    const row = card.flags?.[SCOPE]?.attackResolution ?? null;
    throw new Error(`${failed.message}; warnings: ${said.join(" | ") || "none"}; resolution: ${JSON.stringify(row)?.slice(0, 300)}`);
  }
  return before - health(victim);
}

/** A creature made Bleeding by the condition door (A1's Bleeding 1), waited for. */
async function bleed(actor) {
  await actor.toggleStatusEffect("bleeding", { active: true });
  await until(() => actor.statuses.has("bleeding"), `${actor.name} Bleeding`);
}

/** The repeat Test the end of a creature's turn posts for this effect, pressed at a face; resolves on its roll. */
async function repeatTest(combat, cursedActor, effectId, nextActor, face = 20) {
  const prompt = untilHook("createChatMessage", 60000, m => /data-purpose="escape"/.test(m.content ?? "") && (m.content ?? "").includes(effectId))
    .then(([m]) => { made.push(m); return m; });
  await freshTurn(cursedActor, 1);
  await freshTurn(nextActor, 1);
  const card = await prompt;
  const p = await pressCard(card, 'button[data-action="resistTest"][data-purpose="escape"]', { face });
  return { card, release: () => p.release() };
}

export function sovereignSpells2Batch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Sovereign's second eighteen spells (07 §17; D-1360 onward)", function () {
    let restoreText = null;
    let heldDialog = null;

    before(async function () {
      this.timeout(120000);
      const index = await game.packs.get("azeroth-rpg.spells").getIndex();
      if (!index.some(e => e.name === "Hemoplague")) throw new Error("the spells pack holds no Hemoplague: rebuild the packs");
      heldDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      restoreText = await quietScrollingText();
    });

    after(async function () {
      this.timeout(180000);
      const restore = async (what, fn) => { try { await fn(); } catch (err) { console.warn(`azeroth-rpg | sovereign-spells2 teardown (${what}): ${err?.message ?? err}`); } };
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

    it("Sanguine Barrier: a Half-Action that takes half the Constitution modifier (at least 1) off a weapon blow, and nothing off a spell", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Barrier", { spells: ["Sanguine Barrier"], abilities: { con: 18, cha: 16, dex: 14 } });
      const foe = await creature("Alliance Footman", "Barrier Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await castOk(s, "Sanguine Barrier");
      const fx = await until(() => ownEffect(s, "sanguine-barrier"), "Sanguine Barrier's own effect");
      assert.equal(fx.flags[SCOPE][WEAPON_LESS_FLAG].amount, 2, "Constitution +4 halved is 2");
      await s.update({ "system.health.value": s.system.health.max });
      const top = health(s);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, s, { face: 19 });
      const p = await pressCard(attack, 'button[data-action="applyDamage"][data-target-index="0"]');
      try { await until(() => health(s) !== top, "the sword blow lands", 15000).catch(() => null); } finally { await p.release(); }
      const full = attack.flags?.[SCOPE]?.damageByTarget?.[0]?.damage ?? null;
      if (full !== null && full > 0) assert.equal(top - health(s), Math.max(0, full - 2), "the weapon blow deals 2 less");
      // A spell's blow is no weapon attack: the Barrier takes nothing off it.
      const now = health(s);
      await s.applyDamage(5, { struck: true, attack: true, spell: true, by: foe, type: "shadow" });
      await until(() => health(s) < now, "the spell's blow lands");
      assert.isAtLeast(now - health(s), 1, "the spell's damage is not cut by the Barrier");
    });

    it("Scent of Blood: the Bleeding creatures within 60 feet named to the caster, and a Boon held to an attack on one of them", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Scent", { spells: ["Scent of Blood"] });
      const bleeder = await creature("Alliance Footman", "Scent Bleeder", { hp: 40 });
      const dry = await creature("Alliance Footman", "Scent Dry", { hp: 40 });
      const far = await creature("Alliance Footman", "Scent Far", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: bleeder, x: 1600, y: 1000, side: "hostile" },
        { actor: dry, x: 1000, y: 1400, side: "hostile" }, { actor: far, x: 2400, y: 1000, side: "hostile" }]);
      await bleed(bleeder);
      await bleed(far);
      await fightWith([s, bleeder, dry, far]);
      await freshTurn(s, 2);
      const told = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.kind === "sovereignSpell" && /Bleeding/.test(textOf(m))).then(([m]) => { made.push(m); return m; });
      await castOk(s, "Scent of Blood");
      const card = await told;
      assert.match(textOf(card), /Scent Bleeder/, "the Bleeding creature within 60 feet is named");
      assert.notMatch(textOf(card), /Scent Dry|Scent Far/, "neither the dry creature nor the one past 60 feet");
      assert.ok(ownEffect(s, "scent-of-blood"), "the caster's own effect for the turn");
      const promise = await until(() => (s.getFlag(SCOPE, NEXT_ATTACK_FLAG) ?? []).find(e => e.source === "scent-of-blood"), "the Boon promised");
      assert.equal(promise.targetStatus, "bleeding", "held to a Bleeding target");
      assert.equal(s.pendingNextAttack({ targetStatuses: ["bleeding"] }).boons, 1, "an attack on a Bleeding creature takes it");
      assert.equal(s.pendingNextAttack({ targetStatuses: [] }).boons, 0, "an attack on a dry one does not");
    });

    it("Delirious Slash: Bleeding 2 and a Bane on its next Attack Test on a failure; half the damage and neither on a success", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Slash", { spells: ["Delirious Slash"] });
      const foe = await creature("Alliance Footman", "Slash Footman", { hp: 40 });
      const other = await creature("Alliance Footman", "Slash Other", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: other, x: 1000, y: 1100, side: "hostile" }]);
      const card = await castOk(s, "Delirious Slash", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "bleeding")?.flags?.[SCOPE]?.value === 2, "Bleeding 2 laid");
      await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.laidBane?.source === "Delirious Slash"), "the Bane on its next Attack Test");
      assert.isAtLeast(await applyRow(card, 0, foe), 1, "the failure's 7 Physical lands");
      await other.update({ "system.ap.body": 0, "system.ap.head": 0, "system.ap.limb": 0 });
      const pass = await castOk(s, "Delirious Slash", { targets: [other] });
      await resist(pass, 0, 20);
      const dealt = await applyRow(pass, 0, other);
      assert.equal(dealt, 3, "half of 7, rounded down, on a body with no Armor Points");
      await sleep(800);
      assert.notOk(statusEffect(other, "bleeding"), "no Bleeding on a success");
    });

    it("Summons to Court: pulled 15 feet toward the caster and Slowed on a failure (the lead: \"reduce to 15 foot pull\")", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Summons", { spells: ["Summons to Court"] });
      const foe = await creature("Alliance Footman", "Summoned Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Summons to Court", { targets: [foe] });
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "slowed"), "Slowed until the end of its next turn");
      const tk = await until(() => (tokenOf(foe)?.document?.x ?? 1500) === 1200 ? tokenOf(foe).document : null, "pulled 15 feet toward the caster", 20000);
      assert.equal(tk.x, 1200, "three squares of 5 feet nearer");
      assert.isAtLeast(await applyRow(card, 0, foe), 1, "3 Shadow on the failure");
    });

    it("Incite Terror: every enemy in 15 feet of the point, an ally spared, 4 Shadow and Frightened of the caster on a failure", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Terror", { spells: ["Incite Terror"] });
      const foe = await creature("Alliance Footman", "Terror Footman", { hp: 40 });
      const friend = await creature("Alliance Footman", "Terror Friend", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }, { actor: friend, x: 1600, y: 1100, side: "friendly" }]);
      const card = await castOk(s, "Incite Terror", { targets: [foe, friend] });
      const rows = card.flags[SCOPE].targets ?? card.flags[SCOPE].targetRows ?? [];
      assert.notMatch(card.content, /Terror Friend/, "the ally the caster targeted is spared");
      assert.isAtMost(rows.length || 1, 1, "one row, the enemy's");
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "frightened"), "Frightened on a failure");
      assert.isAtLeast(await applyRow(card, 0, foe), 1, "4 Shadow on the failure");
    });

    it("Wracking Pain: a blood curse that makes the creature Vulnerable (Physical), read by its derived list", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Wrack", { spells: ["Wracking Pain"] });
      const foe = await creature("Alliance Footman", "Wracked Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const card = await castOk(s, "Wracking Pain", { targets: [foe] });
      await resist(card, 0, 1);
      const curse = await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.[VULNERABLE_FLAG]), "the curse laid");
      assert.equal(curse.flags[SCOPE][BLOOD_CURSE_FLAG].source, s.uuid, "the Sovereign's blood curse");
      assert.deepEqual(curse.flags[SCOPE][VULNERABLE_FLAG].types, ["physical"]);
      assert.notOk(curse.flags[SCOPE][ESCAPE_FLAG], "no repeat: it lasts until the end of its next turn");
      await until(() => (foe.system.vulnerable ?? []).includes("physical"), "Vulnerable (Physical) derived");
      await curse.delete();
      await until(() => !(foe.system.vulnerable ?? []).includes("physical"), "and gone with the effect");
    });

    it("Veil of Mist: a Bane on weapon attacks at the caster, and the caster's own weapon attack refused in words", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Veil", { spells: ["Veil of Mist"], weapons: ["Dagger"] });
      const foe = await creature("Alliance Footman", "Veil Footman", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await castOk(s, "Veil of Mist");
      const fx = await until(() => ownEffect(s, "veil-of-mist"), "Veil of Mist's own effect");
      assert.equal(fx.flags[SCOPE][VEIL_FLAG].noWeapon, true);
      await until(() => (s.system.sovereignDeterred ?? []).some(d => d.source === "Veil of Mist"), "the Bane on weapon attacks at the caster");
      const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
      const [snap] = targetSnapshots([tokenOf(s)]);
      assert.ok((snap?.sovDeterred ?? []).some(d => d.source === "Veil of Mist"), "an attacker's dialog reads it off the target");
      const sheet = await openSheet(s);
      sheet.changeTab("combat", "primary");
      await settle();
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const control = sheet.element.querySelector('section[data-tab="combat"] .azeroth-weapon [data-action="rollAttack"]');
      assert.ok(control, "the Combat tab draws the dagger's attack");
      let posted = false;
      const hook = Hooks.on("createChatMessage", m => { if (m.speaker?.actor === s.id && m.flags?.[SCOPE]?.kind === "attack") posted = true; });
      const said = await warnings(async () => { control.click(); await sleep(1200); });
      Hooks.off("createChatMessage", hook);
      canvas.tokens.setTargets([]);
      assert.ok(said.some(w => /mist/i.test(w)), `refused in words: ${said.join(" | ")}`);
      assert.isFalse(posted, "no attack card");
    });

    it("Mesmerize: a living Humanoid Charmed for the minute, the spell ended when the caster harms it; a beast refused before the Vitae", async function () {
      this.timeout(150000);
      const s = await sovereign("ZZ Sov2 Mesmer", { spells: ["Mesmerize"] });
      const foe = await creature("Alliance Footman", "Mesmer Footman", { hp: 40 });
      const beast = await creature("Adult Plainstrider", "Mesmer Strider", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: beast, x: 1000, y: 1100, side: "hostile" }]);
      const vitae = vitaeOf(s).value;
      const said = await warnings(async () => { await (await import("./quench-necromancer-spells.mjs")).cast(s, "Mesmerize", { targets: [beast], ms: 6000 }); });
      assert.ok(said.some(w => /Humanoid|humanoid/.test(w)), `the beast refused in words: ${said.join(" | ")}`);
      assert.equal(vitaeOf(s).value, vitae, "nothing spent");
      const card = await castOk(s, "Mesmerize", { targets: [foe] });
      await resist(card, 0, 1);
      const charmed = await until(() => { const e = statusEffect(foe, "charmed"); return e?.flags?.[SCOPE]?.[COMMAND_FLAG]?.harmEnds ? e : null; }, "Charmed, ended by harm");
      assert.equal(charmed.flags[SCOPE][COMMAND_FLAG].kind, "charm");
      await foe.applyDamage(3, { struck: true, attack: true, by: s });
      await until(() => !foe.effects.has(charmed.id), "the caster's blow ends it");
    });

    it("Shroud of Sorrow: no area placed, a Sustain round the caster, half the Charisma modifier on each enemy at its turn, and 1 Health back each", async function () {
      this.timeout(240000);
      const s = await sovereign("ZZ Sov2 Shroud", { spells: ["Shroud of Sorrow"], abilities: { con: 16, cha: 18, dex: 14 } });
      const foe = await creature("Alliance Footman", "Shroud Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      const combat = await fightWith([s, foe]);
      await freshTurn(s, 2);
      const card = await castOk(s, "Shroud of Sorrow");
      assert.notOk(card.flags[SCOPE].area, "the card places no Region: the area moves with the caster");
      const entry = await until(() => (s.getFlag(SCOPE, "sustaining") ?? []).find(e => /Shroud/.test(e.name ?? "")), "the Sustain");
      assert.equal(entry.areaTick?.damage?.rating, 2, "Charisma +4 halved is 2");
      assert.equal(entry.areaTick?.damage?.drain, 1, "1 Health a creature");
      await s.update({ "system.health.value": s.system.health.max - 5 });
      const low = health(s);
      const top = health(foe);
      await freshTurn(foe, 1);
      await until(() => health(foe) < top, "the enemy's turn start in the Shroud strikes it", 30000);
      await until(() => health(s) >= low + 1, "the caster regains 1 Health", 30000);
      // The tick's card (FIXC, O-482): spoken from the caster, naming the enemy struck, which the director plays.
      const tickCard = await until(() => [...game.messages].reverse().find(m => m.flags?.[SCOPE]?.shroudTick === true && m.flags[SCOPE].targetUuid === foe.uuid) ?? null, "the Shroud's tick card", 20000);
      made.push(tickCard);
      assert.equal(tickCard.speaker?.actor, s.id, "spoken from the caster");
      assert.match(textOf(tickCard), /regains 1 Health/, "the card says the drain");
      assert.ok(combat);
    });

    it("Burden of Sin: a blood curse with its repeat, and 3 Shadow on the cursed creature each time its attack damages a creature", async function () {
      this.timeout(240000);
      const s = await sovereign("ZZ Sov2 Burden", { spells: ["Burden of Sin"] });
      const foe = await creature("Alliance Footman", "Burdened Footman", { hp: 60 });
      const ally = await creature("Alliance Footman", "Burden Ally", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }, { actor: ally, x: 1200, y: 1000, side: "friendly" }]);
      const card = await castOk(s, "Burden of Sin", { targets: [foe] });
      await resist(card, 0, 1);
      const curse = await until(() => effectOf(foe, e => e.flags?.[SCOPE]?.[BURDEN_FLAG]), "the burden laid");
      assert.equal(curse.flags[SCOPE][ESCAPE_FLAG]?.condition, "curse", "its repeat rides the curse's own escape");
      const top = health(foe);
      await ally.applyDamage(6, { struck: true, attack: true, by: foe });
      await until(() => health(foe) < top, "the burden strikes back", 20000);
      assert.equal(top - health(foe), 3, "3 Shadow");
      const now = health(foe);
      await ally.applyDamage(6, { struck: true, attack: true, spell: true, by: foe });
      await sleep(1500);
      assert.equal(health(foe), now, "a spell is no attack the burden reads");
      // The repeat: a pass at the end of the creature's turn ends the spell.
      await fightWith([s, foe]);
      const r = await repeatTest(game.combat, foe, curse.id, s, 20);
      try { await until(() => !foe.effects.has(curse.id), "a pass ends the curse", 30000); } finally { await r.release(); }
    });

    it("Edict of Silence: Silenced for the minute, carrying the curse, and its repeat ends both", async function () {
      this.timeout(240000);
      const s = await sovereign("ZZ Sov2 Edict", { spells: ["Edict of Silence"] });
      const foe = await creature("Alliance Footman", "Silenced Footman", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([s, foe]);
      await freshTurn(s, 2);
      const card = await castOk(s, "Edict of Silence", { targets: [foe] });
      await resist(card, 0, 1);
      const silenced = await until(() => { const e = statusEffect(foe, "silenced"); return e?.flags?.[SCOPE]?.[BLOOD_CURSE_FLAG] ? e : null; }, "Silenced, cursed");
      assert.equal(silenced.flags[SCOPE][ESCAPE_FLAG]?.condition, "silenced", "the repeat ends the Silenced");
      const r = await repeatTest(combat, foe, silenced.id, s, 20);
      try { await until(() => !foe.statuses.has("silenced"), "a pass ends it", 30000); } finally { await r.release(); }
    });

    it("Crimson Carapace: 2 Armor Points at every location and no Bleeding laid, on one effect", async function () {
      this.timeout(120000);
      const s = await sovereign("ZZ Sov2 Carapace", { spells: ["Crimson Carapace"] });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }]);
      const ap = { body: s.system.ap?.body ?? 0, head: s.system.ap?.head ?? 0, limb: s.system.ap?.limb ?? 0 };
      await castOk(s, "Crimson Carapace");
      await until(() => ownEffect(s, "crimson-carapace"), "the Carapace laid");
      await until(() => (s.system.ap?.body ?? 0) === ap.body + 2, "Body AP 2 higher");
      assert.equal(s.system.ap.head, ap.head + 2);
      assert.equal(s.system.ap.limb, ap.limb + 2);
      await s.toggleStatusEffect("bleeding", { active: true }).catch(() => null);
      await sleep(800);
      assert.isFalse(s.statuses.has("bleeding"), "no Bleeding can be laid on the caster");
    });

    it("Sanguine Draught: at 30 feet, the tier in Health off a Bleeding creature and a feeding with no Test; nothing off a dry one, the Vitae spent", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Draught", { spells: ["Sanguine Draught"] });
      const foe = await creature("Alliance Footman", "Draught Footman", { hp: 40 });
      const dry = await creature("Alliance Footman", "Draught Dry", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" }, { actor: dry, x: 1000, y: 1500, side: "hostile" }]);
      await bleed(foe);
      await setPool(s, vitaeOf(s).max - 20);
      const top = health(foe);
      await castOk(s, "Sanguine Draught", { targets: [foe] });
      await until(() => health(foe) === top - s.system.tier, "the tier in Health lost", 20000);
      await until(() => feedDaysOf(s.getFlag(SCOPE, FEED_DAYS_FLAG) ?? {}, foe.uuid) === 1, "the feeding recorded for Blood Bond");
      await until(() => Object.hasOwn(s.getFlag(SCOPE, "fedToday") ?? {}, foe.uuid), "once a day recorded");
      const v = vitaeOf(s).value;
      const dryTop = health(dry);
      await castOk(s, "Sanguine Draught", { targets: [dry] });
      await sleep(1200);
      assert.equal(health(dry), dryTop, "a creature not Bleeding loses nothing");
      assert.isBelow(vitaeOf(s).value, v, "and the Vitae is spent");
    });

    it("Hemoplague: Bleeding 3 cursed, a spread of Bleeding 1 to the caster's enemies within 10 feet at its turn, and its repeat ends it", async function () {
      this.timeout(300000);
      const s = await sovereign("ZZ Sov2 Plague", { level: 17, spells: ["Hemoplague"] });
      const foe = await creature("Alliance Footman", "Plague Carrier", { hp: 80 });
      const near = await creature("Alliance Footman", "Plague Near", { hp: 80 });
      const friend = await creature("Alliance Footman", "Plague Friend", { hp: 80 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1500, y: 1000, side: "hostile" },
        { actor: near, x: 1600, y: 1000, side: "hostile" }, { actor: friend, x: 1500, y: 1100, side: "friendly" }]);
      const combat = await fightWith([s, foe, near, friend]);
      await freshTurn(s, 2);
      const card = await castOk(s, "Hemoplague", { targets: [foe] });
      await resist(card, 0, 1);
      const plague = await until(() => { const e = statusEffect(foe, "bleeding"); return e?.flags?.[SCOPE]?.[HEMOPLAGUE_FLAG] ? e : null; }, "Bleeding 3 with the spread");
      assert.equal(plague.flags[SCOPE].value, 3, "Bleeding 3");
      assert.ok(plague.flags[SCOPE][BLOOD_CURSE_FLAG], "a blood curse");
      assert.equal(plague.flags[SCOPE][ESCAPE_FLAG]?.condition, "curse", "its repeat rides the curse's escape on the Bleeding");
      await freshTurn(foe, 1);
      await until(() => near.statuses.has("bleeding"), "the enemy within 10 feet is Bleeding at the carrier's turn start", 30000);
      await sleep(1000);
      assert.isFalse(friend.statuses.has("bleeding"), "the caster's ally is spared");
      const r = await repeatTest(combat, foe, plague.id, near, 20);
      try { await until(() => !foe.effects.has(plague.id), "a pass ends the spell", 30000); } finally { await r.release(); }
    });

    it("Blood Wound: every enemy in the area, Bleeding 2 and Entangled until the end of its next turn on a failure; half on a success", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Wound", { level: 17, spells: ["Blood Wound"] });
      const foe = await creature("Alliance Footman", "Wound Footman", { hp: 60 });
      const other = await creature("Alliance Footman", "Wound Other", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 1600, y: 1000, side: "hostile" }, { actor: other, x: 1600, y: 1100, side: "hostile" }]);
      const card = await castOk(s, "Blood Wound", { targets: [foe, other] });
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "bleeding")?.flags?.[SCOPE]?.value === 2, "Bleeding 2 laid");
      await until(() => statusEffect(foe, "entangled"), "Entangled until the end of its next turn");
      await resist(card, 1, 20);
      await sleep(1000);
      assert.notOk(statusEffect(other, "entangled"), "neither on a success");
      assert.notOk(statusEffect(other, "bleeding"));
    });

    it("Blood Bond: refused short of three feeding days; with three, a Charmed creature bonded with no duration, ended by the caster's press", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Bond", { level: 17, spells: ["Blood Bond"] });
      const thrall = await creature("Alliance Footman", "Bond Thrall", { hp: 40 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: thrall, x: 1100, y: 1000, side: "hostile" }]);
      await thrall.toggleStatusEffect("charmed", { active: true });
      let rec = {};
      for (const day of [0, 1]) rec = withFeedDay(rec, thrall.uuid, (game.time.worldTime ?? 0) - day * 86400);
      // Written as the feeding door writes it: a record keyed by uuid, whose dots `setFlag` would expand into paths.
      await s.update({ [`flags.${SCOPE}.${FEED_DAYS_FLAG}`]: foundry.data.operators.ForcedReplacement.create(rec) });
      const vitae = vitaeOf(s).value;
      const said = await warnings(async () => { await (await import("./quench-necromancer-spells.mjs")).cast(s, "Blood Bond", { targets: [thrall], ms: 6000 }); });
      assert.ok(said.some(w => /different day/.test(w)), `refused in words: ${said.join(" | ")}`);
      assert.equal(vitaeOf(s).value, vitae, "nothing spent");
      rec = withFeedDay(rec, thrall.uuid, (game.time.worldTime ?? 0) - 2 * 86400);
      await s.update({ [`flags.${SCOPE}.${FEED_DAYS_FLAG}`]: foundry.data.operators.ForcedReplacement.create(rec) });
      await until(() => feedDaysOf(s.getFlag(SCOPE, FEED_DAYS_FLAG) ?? {}, thrall.uuid) === 3, "three feeding days on record");
      const told = untilHook("createChatMessage", 30000, m => m.flags?.[SCOPE]?.sovereignCard?.press === "bondEnd").then(([m]) => { made.push(m); return m; });
      await castOk(s, "Blood Bond", { targets: [thrall] });
      const bond = await until(() => effectOf(thrall, e => e.flags?.[SCOPE]?.[BOND_FLAG]?.by === s.uuid), "the bond laid");
      assert.ok([...(bond.statuses ?? [])].includes("charmed"), "Charmed");
      assert.notOk(bond._source?.duration?.value, "until the bond is broken: no duration");
      const press = await told;
      const p = await pressCard(press, 'button[data-action="sovereignCard"][data-sov-press="bondEnd"]');
      try { await until(() => !thrall.effects.has(bond.id), "the caster ends the bond", 20000); } finally { await p.release(); }
    });

    it("Cauldron of Blood: 20 Shadow and Bleeding 3 on a failure, half and no Bleeding on a success", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Cauldron", { level: 17, spells: ["Cauldron of Blood"] });
      const foe = await creature("Alliance Footman", "Cauldron Footman", { hp: 80 });
      const other = await creature("Alliance Footman", "Cauldron Other", { hp: 80 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 2000, y: 1000, side: "hostile" }, { actor: other, x: 2000, y: 1100, side: "hostile" }]);
      const card = await castOk(s, "Cauldron of Blood", { targets: [foe, other] });
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "bleeding")?.flags?.[SCOPE]?.value === 3, "Bleeding 3 laid");
      assert.isAtLeast(await applyRow(card, 0, foe), 15, "20 Shadow, less the Ward");
      await resist(card, 1, 20);
      assert.isAtMost(await applyRow(card, 1, other), 10, "half of 20 on a success");
      await sleep(800);
      assert.notOk(statusEffect(other, "bleeding"), "no Bleeding on a success");
    });

    it("Hour of the Court: every enemy in 90 feet Prone and Frightened on a failure, a Sanguine Shield of 12 + Con and a flying Speed of 15", async function () {
      this.timeout(180000);
      const s = await sovereign("ZZ Sov2 Hour", { level: 17, spells: ["Hour of the Court"] });
      const foe = await creature("Alliance Footman", "Court Footman", { hp: 60 });
      const friend = await creature("Alliance Footman", "Court Friend", { hp: 60 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: foe, x: 2200, y: 1000, side: "hostile" }, { actor: friend, x: 1100, y: 1000, side: "friendly" }]);
      const card = await castOk(s, "Hour of the Court");
      assert.notMatch(card.content, /Court Friend/, "the ally is spared");
      await resist(card, 0, 1);
      await until(() => statusEffect(foe, "prone") && statusEffect(foe, "frightened"), "Prone and Frightened");
      const fx = await until(() => ownEffect(s, "hour-of-the-court"), "the flight laid");
      assert.equal(fx.flags[SCOPE].sovereignData?.flight?.feet, 15);
      await until(() => Number(s.system.flyingSpeed) === 15, "a flying Speed of 15 feet");
      await until(() => (s.system.health.temp ?? 0) === 12 + (s.system.abilities.con.mod ?? 0), "12 plus Constitution in temporary Health");
    });

    it("the talents that read a blood curse read the four new ones: Heavy Tread drops each cursed creature's Speed, Unworthy Hand cuts its weapon blow", async function () {
      this.timeout(300000);
      const s = await sovereign("ZZ Sov2 Talents", { level: 17, spells: ["Wracking Pain", "Burden of Sin", "Edict of Silence", "Hemoplague"], ranks: { "Heavy Tread": 2, "Unworthy Hand": 2 } });
      const foes = [];
      for (const [i, name] of ["Wracking Pain", "Burden of Sin", "Edict of Silence", "Hemoplague"].entries()) foes.push({ name, foe: await creature("Alliance Footman", `Talent Foe ${i}`, { hp: 80 }) });
      const ally = await creature("Alliance Footman", "Talent Ally", { hp: 200 });
      await sceneWith([{ actor: s, x: 1000, y: 1000 }, { actor: ally, x: 1000, y: 1500, side: "friendly" },
        ...foes.map(({ foe }, i) => ({ actor: foe, x: 1300 + i * 100, y: 1000, side: "hostile" }))]);
      for (const { name, foe } of foes) {
        await setPool(s, vitaeOf(s).max);
        const speed = foe.system.speed;
        const card = await castOk(s, name, { targets: [foe] });
        await resist(card, 0, 1);
        const curse = await until(() => cursed(foe), `${name}: the curse laid`);
        assert.equal(curse.flags[SCOPE][BLOOD_CURSE_FLAG].source, s.uuid, `${name}: the Sovereign's`);
        await until(() => foe.system.speed === speed - 10, `${name}: Heavy Tread drops its Speed 10 feet`);
        const top = health(ally);
        await ally.applyDamage(5, { struck: true, attack: true, by: foe });
        await until(() => health(ally) < top, `${name}: the blow lands`);
        assert.equal(top - health(ally), 3, `${name}: Unworthy Hand takes 2 off the weapon blow`);
      }
    });
  });
}
