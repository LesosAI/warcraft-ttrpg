/**
 * **THE NECROMANCER'S FLESH, BONE AND DAMNED, THROUGH THE REAL CONTROLS** (the Necromancer plan's
 * Phase 4c-T). Every Use is pressed from the sheet (`pressUse`), every chooser answered as a player
 * answers it, every blow landed by an attack card's own Apply, every turn start reached with the
 * tracker's Next Turn, every circle placed by the circle's own pick door (`setCirclePick`, the board's
 * stand-in, as Stitch Abomination's space is) and every Test card pressed on the card.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.necromancer-talents`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { answerAskIfAny, chooser, featureNamed, manaOf, nextTurnUntil, pick, pressCard, pressUse, sceneWith, talentNamed, textOf, tokenOf, until } from "./quench-chronomancer-common.mjs";
import { castWith, nextCard, npcAttacks, tick } from "./quench-necromancer-review.mjs";
import { hordeActorsOf, leadOf } from "../effects/necromancer-horde.mjs";
import { boneArmorStacks, circleOf, setCirclePick } from "../effects/necromancer-talents.mjs";
import { PLAGUE_CARRIER_FLAG } from "../rules/necromancer-animations.mjs";

const SCOPE = "azeroth-rpg";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const essenceOf = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "essence") ?? null;
const bondOf = actor => actor.getFlag(SCOPE, "bond") ?? null;
const entryOf = actor => bondOf(actor)?.entryName ?? actor.name;
const NECROS = [];

/** The ranks every test below reads (Skeletal Archery, Mastery and Grafted Flesh left at 0, so a raise opens no extra chooser). */
const RANKS = {
  "Ghoul Frenzy": 3, "Gorge": 1, "Plague Carrier": 2, "Bloated Dead": 2, "Regenerating Tissue": 2, "Exhume": 1,
  "Bone Armor": 2, "Bone Vanguard": 2, "Restless Bones": 1, "Marrowguard": 2, "Commander of Bone": 2, "Bone Storm": 1,
  "Acolyte's Sacrifice": 1, "Unsummon": 1, "Circle of the Damned": 3, "Cult Fervor": 2, "Sacrificial Strength": 2,
  "Unholy Fervor": 2, "Watchful Shades": 2, "Grand Circle": 2, "Life for a Life": 2, "Dark Communion": 1, "The Black Rite": 1
};

async function bankEssence(actor, value) {
  const pool = essenceOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value }, {}, { essenceGain: "hand" });
  await until(() => essenceOf(actor).value === Math.min(value, pool.max), "Essence banked");
}

async function bankMana(actor, value = 999) {
  const pool = manaOf(actor);
  await actor.updatePool({ itemId: pool.itemId, kind: "power", value: Math.min(value, pool.max) });
  await until(() => manaOf(actor).value === Math.min(value, pool.max), "Mana banked");
}

/** A bestiary creature named for the test, at full Health or at the Health named. */
async function creature(entry, name, health = null) {
  const npc = await makeNpc(entry);
  const update = { name: `ZZ ${name}`, "prototypeToken.name": `ZZ ${name}`, "prototypeToken.actorLink": true };
  if (health !== null) update["system.health.value"] = health;
  await npc.update(update);
  return npc;
}

/** A linked token for an actor on the viewed scene. */
async function place(actor, x, y, disposition = CONST.TOKEN_DISPOSITIONS.HOSTILE) {
  await actor.update({ "prototypeToken.actorLink": true });
  await canvas.scene.createEmbeddedDocuments("Token", [await tokenData(actor, { x, y, actorLink: true, disposition })]);
  return until(() => tokenDrawn(tokenOf(actor)) ? tokenOf(actor) : null, `${actor.name}'s token`);
}

/** Move a token on the board at once, and wait for its document to hold the square (D-669). */
async function moveTo(actor, x, y) {
  const doc = tokenOf(actor)?.document;
  await doc.update({ x, y }, { animate: false, action: "displace" });
  await until(() => doc.x === x && doc.y === y, `${actor.name} at ${x},${y}`);
  await settle();
}

/** Give a creature's token a name the one chooser can tell apart (two skeletons share their block's). */
async function nameToken(actor, name) {
  const doc = tokenOf(actor)?.document;
  await doc.update({ name });
  await until(() => doc.name === name, `${name} named`);
  return name;
}

/** One of the raised dead standing beside the Necromancer: Raise Dead on a fresh corpse where none stands. */
let CORPSES = 0;
async function ensureServant(necro) {
  let servant = hordeOf(necro).find(x => (x.system.health.value ?? 0) > 0 && tokenOf(x));
  if (servant) return servant;
  CORPSES += 1;
  const body = await creature("Bandit", `Spare Corpse ${CORPSES}`, 0);
  await place(body, 1100, 1100 + 100 * CORPSES);
  await bankMana(necro);
  await castWith(necro, "Raise Dead", { steps: [app => pick(app, `ZZ Spare Corpse ${CORPSES}`)] });
  servant = await until(() => hordeOf(necro).find(x => (x.system.health.value ?? 0) > 0 && tokenOf(x)), "a fresh servant");
  return servant;
}

/** The horde, oldest first. */
const hordeOf = necro => hordeActorsOf(necro).sort((a, b) => (bondOf(a).since ?? 0) - (bondOf(b).since ?? 0));

/** Press a Use, answer each chooser it opens in turn, and return its card (or null with the warnings caught). */
async function useWith(actor, featureName, steps = [], { face = 15, ms = 30000 } = {}) {
  const warned = [];
  const original = ui.notifications.warn.bind(ui.notifications);
  ui.notifications.warn = (msg, ...rest) => { warned.push(String(msg)); return original(msg, ...rest); };
  try {
    const { feature, card } = await pressUse(actor, featureName, [], face);
    for (const step of steps) {
      const app = await chooser(feature, 15000).catch(err => { throw new Error(`${err.message}; warnings: ${warned.join(" | ") || "none"}`); });
      await step(app);
      await sleep(150);
    }
    const message = await Promise.race([card, sleep(ms).then(() => null)]);
    return { message, warned };
  } finally {
    ui.notifications.warn = original;
  }
}

/** A Use that must refuse: the words, and no card. */
async function refusedUse(actor, featureName) {
  const { message, warned } = await useWith(actor, featureName, [], { ms: 4000 });
  return message ? null : warned.join(" | ");
}

/** An attack card's own Apply, pressed. */
async function applyFrom(attack) {
  const { release } = await pressCard(attack, '[data-action="applyDamage"]');
  await sleep(600);
  await release();
}

export function necromancerTalentsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Necromancer's talents (Phase 4c-T)", function () {
    let restoreDialog = null;
    let restoreText = null;
    let necro = null;
    let ally = null;
    let foe = null;
    let base = {};
    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(240000);
      setCirclePick(null);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-blow-ask-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      const owners = new Set(NECROS.map(n => n.uuid));
      for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete().catch(() => {});
      for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    it("sets up: a level 17 Necromancer raises two skeletons, a ghoul and a zombie, beside a living foe and an ally, then takes its talents", async function () {
      this.timeout(300000);
      necro = await makeCharacter({ name: "ZZ Necro Talents", classes: [["Necromancer", 17]], race: "Human", spells: ["Ghoul Rising"], abilities: { int: 18, con: 14 } });
      NECROS.push(necro);
      await necro._talentGrant;
      await until(() => essenceOf(necro), "the Essence pool");
      await until(() => ["Raise Dead", "Animate Corpse"].every(s => necro.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
      // A Mage in cloth, so a Bandit's blow reaches its Health; both in The Party, so each counts the
      // other an ally out of a fight (`countsAsAlly`, D-658).
      ally = await makeCharacter({ name: "ZZ Necro Ally", classes: [["Mage", 5]] });
      await necro.setParty(true);
      await ally.setParty(true);
      const a = await creature("Bandit", "Corpse A", 0);
      const b = await creature("Bandit", "Corpse B", 0);
      const c = await creature("Bandit", "Corpse C", 0);
      foe = await creature("Bandit", "Foe");
      await sceneWith([
        { actor: necro, x: 1000, y: 1000 }, { actor: ally, x: 800, y: 1000 },
        { actor: a, x: 1200, y: 1000, side: "hostile" }, { actor: b, x: 1200, y: 1200, side: "hostile" }, { actor: c, x: 1000, y: 1200, side: "hostile" },
        { actor: foe, x: 1800, y: 1000, side: "hostile" }
      ]);
      for (const [spell, who] of [["Raise Dead", "ZZ Corpse A"], ["Ghoul Rising", "ZZ Corpse B"], ["Animate Corpse", "ZZ Corpse C"]]) {
        await bankMana(necro);
        const card = await castWith(necro, spell, { steps: [app => pick(app, who)] });
        assert.ok(card?.flags[SCOPE].success, `${spell} was cast`);
      }
      const horde = hordeOf(necro);
      assert.deepEqual(horde.map(entryOf).sort(), ["Plagued Ghoul", "Risen Skeleton", "Risen Skeleton", "Risen Zombie"], "two skeletons, a ghoul and a zombie");
      const ghoul = horde.find(x => entryOf(x) === "Plagued Ghoul");
      const skeletons = horde.filter(x => entryOf(x) === "Risen Skeleton");
      base = { ghoulDR: ghoul.system.damageBonus, ghoulSpeed: ghoul.system.speed, skelDR: skeletons.map(s => s.system.damageBonus), skelDef: skeletons.map(s => s.system.defense) };
      for (const [name, taken] of Object.entries(RANKS)) {
        const item = await until(() => talentNamed(necro, name), `${name} embedded`);
        await item.update({ "system.taken": taken });
      }
      await until(() => featureNamed(necro, "The Black Rite") && featureNamed(necro, "Grand Circle") && featureNamed(necro, "Watchful Shades"), "the talents' features granted");
    });

    it("Ghoul Frenzy, Commander of Bone and Bone Vanguard lie on the raised dead through the bound sync", async function () {
      this.timeout(60000);
      const horde = hordeOf(necro);
      const ghoul = horde.find(x => entryOf(x) === "Plagued Ghoul");
      const skeletons = horde.filter(x => entryOf(x) === "Risen Skeleton");
      await until(() => ghoul.system.damageBonus === base.ghoulDR + 3, "Ghoul Frenzy 3 on the ghoul's Damage Rating");
      assert.equal(ghoul.system.speed, base.ghoulSpeed + 10, "rank 3: 10 feet of Speed");
      const lead = leadOf(necro);
      for (const [i, s] of skeletons.entries()) {
        const isLead = s.id === lead;
        await until(() => s.system.damageBonus === base.skelDR[i] + 2 + (isLead ? 2 : 0), `${s.name}'s Damage Rating`);
        assert.equal(s.system.defense, base.skelDef[i] + (isLead ? 2 : 0), isLead ? "the skeleton that leads adds Bone Vanguard 2 to Defense" : "a skeleton that does not lead adds none");
      }
    });

    it("Ghoul Frenzy's and Commander of Bone's Empowered surges: 1 Essence each, twice the rank until the end of the next turn", async function () {
      this.timeout(90000);
      await bankEssence(necro, 5);
      const ghoul = hordeOf(necro).find(x => entryOf(x) === "Plagued Ghoul");
      const { message, warned } = await useWith(necro, "Ghoul Frenzy");
      assert.ok(message, `the surge posted its card; warnings: ${warned.join(" | ")}`);
      assert.equal(message.flags[SCOPE].featureKey, "ghoul-frenzy", "under its animation key");
      assert.equal(essenceOf(necro).value, 4, "1 Essence spent");
      await until(() => ghoul.system.damageBonus === base.ghoulDR + 6, "twice the rank while surged");
      const skeleton = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton" && x.id !== leadOf(necro));
      const before = skeleton.system.damageBonus;
      const second = await useWith(necro, "Commander of Bone");
      assert.equal(second.message?.flags[SCOPE].featureKey, "commander-of-bone");
      await until(() => skeleton.system.damageBonus === before + 2, "Commander of Bone doubled on a skeleton");
      assert.equal(essenceOf(necro).value, 3, "1 more Essence");
    });

    it("Regenerating Tissue's Empowered mending and Bone Vanguard's: five and three times the tier", async function () {
      this.timeout(90000);
      const tier = necro.system.tier;
      const ghoul = hordeOf(necro).find(x => entryOf(x) === "Plagued Ghoul");
      await ghoul.update({ "system.health.value": 1 });
      const ghoulName = await nameToken(ghoul, "ZZ Ghoul");
      const { message, warned } = await useWith(necro, "Regenerating Tissue", [app => pick(app, ghoulName)]);
      assert.ok(message, `the mending posted its card; warnings: ${warned.join(" | ")}`);
      await until(() => ghoul.system.health.value === Math.min(ghoul.system.health.max, 1 + 5 * tier), "the ghoul regains five times the tier");
      const lead = game.actors.get(leadOf(necro));
      await lead.update({ "system.health.value": 1 });
      const second = await useWith(necro, "Bone Vanguard");
      assert.ok(second.message, "Bone Vanguard's mending posted");
      await until(() => lead.system.health.value === Math.min(lead.system.health.max, 1 + 3 * tier), "the lead skeleton regains three times the tier");
    });

    it("Gorge: the ghoul devours a corpse in its reach, regains all its Health and, empowered, twice the tier in temporary Health", async function () {
      this.timeout(90000);
      const tier = necro.system.tier;
      const ghoul = hordeOf(necro).find(x => entryOf(x) === "Plagued Ghoul");
      const body = await creature("Bandit", "Gorge Corpse", 0);
      const gx = tokenOf(ghoul).document.x;
      const gy = tokenOf(ghoul).document.y;
      await place(body, gx + 100, gy);
      await ghoul.update({ "system.health.value": 1, "system.health.temp": 0 });
      await bankEssence(necro, 2);
      const { message, warned } = await useWith(necro, "Gorge", [app => pick(app, tokenOf(ghoul).name), app => pick(app, "ZZ Gorge Corpse"), app => pick(app, "Empowered")]);
      assert.ok(message, `Gorge posted its card; warnings: ${warned.join(" | ")}`);
      await until(() => ghoul.system.health.value === ghoul.system.health.max, "all its Health");
      await until(() => ghoul.system.health.temp === 2 * tier, "twice the tier in temporary Health");
      assert.equal(tokenOf(body).document.getFlag(SCOPE, "corpse")?.state, "destroyed", "the corpse is destroyed");
      assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
    });

    it("Bone Armor at rank 2: a Risen Skeleton collapses for +1 Armor Point everywhere, a second for +2, a third refused in words", async function () {
      this.timeout(180000);
      const ap = () => necro.system.ap?.body ?? 0;
      const before = ap();
      const lead = leadOf(necro);
      const victim = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton" && x.id !== lead);
      await nameToken(victim, "ZZ Bone Victim");
      const { message, warned } = await useWith(necro, "Bone Armor", [app => pick(app, "ZZ Bone Victim")]);
      assert.ok(message, `Bone Armor posted; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(victim.id), "the skeleton collapsed");
      await until(() => ap() === before + 1, "+1 Armor Point");
      assert.equal(boneArmorStacks(necro), 1, "one stack");
      // A second skeleton: Raise Dead again.
      const d = await creature("Bandit", "Corpse D", 0);
      await place(d, 1200, 800);
      await bankMana(necro);
      await castWith(necro, "Raise Dead", { steps: [app => pick(app, "ZZ Corpse D")] });
      const fresh = hordeOf(necro).filter(x => entryOf(x) === "Risen Skeleton" && x.id !== lead);
      await nameToken(fresh[0], "ZZ Bone Victim Two");
      await useWith(necro, "Bone Armor", [app => pick(app, "ZZ Bone Victim Two")]);
      await until(() => ap() === before + 2, "+2 at two stacks");
      const words = await refusedUse(necro, "Bone Armor");
      assert.match(words ?? "", /most its rank allows/, "the third is refused in words");
      assert.equal(ap(), before + 2, "nothing more");
    });

    it("Marrowguard: an attack's Physical damage falls by the rank while a skeleton stands adjacent", async function () {
      this.timeout(90000);
      const skeleton = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton");
      await moveTo(skeleton, 1100, 1000);
      await moveTo(foe, 1000, 900);
      await necro.update({ "system.health.value": necro.system.health.max, "system.health.temp": 0 });
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, necro);
      const dealt = Number(document.querySelector(`[data-message-id="${attack.id}"] [data-action="applyDamage"]`)?.dataset?.damage ?? 0);
      const before = necro.system.health.value;
      const { release } = await pressCard(attack, '[data-action="applyDamage"]');
      // Grave Guard (level 11) asks in the blow: declined, so the blow lands on the Necromancer.
      await answerAskIfAny(false, 6000);
      await release();
      if (dealt > 2) await until(() => necro.system.health.value < before, "the blow landed");
      await sleep(500);
      const lost = before - necro.system.health.value;
      assert.equal(lost, Math.max(0, dealt - 2), `the blow's ${dealt} fell by Marrowguard's 2`);
    });

    it("Restless Bones: a skeleton felled by a blow stands again with half its Health, once; out of a fight at once", async function () {
      this.timeout(90000);
      await bankEssence(necro, 0);
      const skeleton = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton" && !x.getFlag(SCOPE, "restlessStood"));
      await moveTo(foe, tokenOf(skeleton).document.x, tokenOf(skeleton).document.y - 100);
      await skeleton.update({ "system.health.value": 1, "system.health.temp": 0 });
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "restless-bones", 30000);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, skeleton);
      await applyFrom(attack);
      const posted = await card;
      assert.ok(posted, "Restless Bones posted its card");
      assert.isAbove(posted.flags[SCOPE].risen?.[0]?.tokenIds?.length ?? 0, 0, "recording the skeleton in risen");
      await until(() => skeleton.system.health.value === Math.max(1, Math.floor(skeleton.system.health.max / 2)), "half its Health");
      assert.isTrue(skeleton.getFlag(SCOPE, "restlessStood"), "marked: once");
      // Felled again, it collapses.
      await skeleton.update({ "system.health.value": 1, "system.health.temp": 0 });
      const again = await npcAttacks(foe, foe.system.attacks[0].name, skeleton);
      await applyFrom(again);
      await until(() => !game.actors.has(skeleton.id), "the second fall collapses it");
    });

    it("Bloated Dead: a zombie that drops bursts, each enemy within 10 feet (rank 2) taking the tier in Shadow", async function () {
      this.timeout(90000);
      const zombie = hordeOf(necro).find(x => entryOf(x) === "Risen Zombie");
      await moveTo(foe, tokenOf(zombie).document.x + 100, tokenOf(zombie).document.y);
      await foe.update({ "system.health.value": foe.system.health.max });
      await zombie.update({ "system.health.value": 1, "system.health.temp": 0 });
      await bankEssence(necro, 0);
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "bloated-dead", 30000);
      const before = foe.system.health.value;
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, zombie);
      await applyFrom(attack);
      const posted = await card;
      assert.ok(posted, "the burst posted its card from the body");
      assert.equal(posted.flags[SCOPE].targets?.[0]?.tokenId, tokenOf(foe).id, "naming the foe");
      await until(() => foe.system.health.value < before, "the foe took the burst");
    });

    it("Plague Carrier: the ghoul's hit asks a Body Test at the Spell DC, and a failure lays the rank's Shadow tick", async function () {
      this.timeout(90000);
      const ghoul = hordeOf(necro).find(x => entryOf(x) === "Plagued Ghoul");
      await moveTo(foe, tokenOf(ghoul).document.x + 100, tokenOf(ghoul).document.y);
      const test = nextCard(m => m.flags?.[SCOPE]?.graftTest?.graft === "plagueCarrier", 30000);
      await npcAttacks(ghoul, ghoul.system.attacks[0].name, foe, { face: 20 });
      const card = await test;
      assert.equal(card.flags[SCOPE].graftTest.dc, Math.trunc(Number(necro.system.spellDC)), "at the Necromancer's Spell DC");
      const { release } = await pressCard(card, '[data-action="resistTest"]', { face: 1 });
      await until(() => foe.effects.some(e => e.flags?.[SCOPE]?.[PLAGUE_CARRIER_FLAG]), "the plague laid");
      await release();
      const effect = foe.effects.find(e => e.flags?.[SCOPE]?.[PLAGUE_CARRIER_FLAG]);
      assert.equal(effect.flags[SCOPE].tick.amount, 2, "Shadow equal to the rank (2)");
      assert.equal(effect.flags[SCOPE].tick.type, "shadow");
    });

    it("Bone Storm: a skeleton beside the foe collapses, and the foe takes the tier plus Spellpower: Shadow", async function () {
      this.timeout(90000);
      const skeleton = hordeOf(necro).find(x => entryOf(x) === "Risen Skeleton");
      await nameToken(skeleton, "ZZ Storm Skeleton");
      await moveTo(foe, tokenOf(skeleton).document.x + 100, tokenOf(skeleton).document.y);
      await foe.update({ "system.health.value": foe.system.health.max });
      const before = foe.system.health.value;
      const { message, warned } = await useWith(necro, "Bone Storm", [app => tick(app, ["ZZ Storm Skeleton"])]);
      assert.ok(message, `Bone Storm posted its card; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(skeleton.id), "the skeleton collapsed");
      await until(() => foe.system.health.value < before, "the foe was struck");
      assert.include(message.flags[SCOPE].targets.map(t => t.tokenId), tokenOf(foe).id, "the card names the foe");
    });

    it("Acolyte's Sacrifice: a servant collapses and a Shade rises in its space, seeing the invisible (Watchful Shades)", async function () {
      this.timeout(120000);
      const ghoul = hordeOf(necro).find(x => entryOf(x) === "Plagued Ghoul");
      await bankEssence(necro, 0);
      const { message, warned } = await useWith(necro, "Acolyte's Sacrifice", [app => pick(app, tokenOf(ghoul).name)]);
      assert.ok(message, `the sacrifice posted its card; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(ghoul.id), "the ghoul collapsed");
      const shade = await until(() => hordeOf(necro).find(x => entryOf(x) === "Shade"), "a Shade in the horde");
      assert.isAbove(message.flags[SCOPE].risen?.[0]?.tokenIds?.length ?? 0, 0, "the card records the Shade in risen");
      const token = await until(() => tokenOf(shade), "the Shade's token");
      await until(() => token.document.detectionModes?.seeInvisibility?.enabled === true, "the Shade sees the invisible");
      assert.equal(token.document.detectionModes.seeInvisibility.range, 60, "within 60 feet");
      const second = await useWith(necro, "Watchful Shades", [app => pick(app, shade.name)]);
      assert.ok(second.message, "Watchful Shades' rank 2 Use posted");
      assert.ok(necro.effects.some(e => e.flags?.[SCOPE]?.watchfulShade?.shadeUuid === shade.uuid), "the borrowed senses stand until the next turn");
    });

    it("Circle of the Damned at rank 3 with Grand Circle 2 and Cult Fervor 2: a 20 ft circle, 3 temporary Health at an ally's turn start, its Boons", async function () {
      this.timeout(180000);
      setCirclePick(() => ({ x: 900, y: 1050 }));
      await bankEssence(necro, 0);
      const { message, warned } = await useWith(necro, "Circle of the Damned");
      assert.ok(message, `the circle's Use posted; warnings: ${warned.join(" | ")}`);
      const region = await until(() => circleOf(necro), "the circle's Region");
      const f = region.flags[SCOPE];
      assert.equal(f.featureKey, "circle-of-the-damned", "its key");
      assert.equal(f.circle.radius, 20, "Grand Circle 2: 20 feet");
      assert.equal(f.areaTick.temp, 3, "the rank's temporary Health");
      assert.deepEqual(f.areaTick.remains.map(r => r.boon), ["spirit", "body"], "Cult Fervor 2's two Boons");
      // The aura door's third centre: the ally inside carries the Boons.
      await until(() => ally.effects.some(e => JSON.stringify(e.flags?.[SCOPE]?.aura ?? null).includes('"spirit"')), "Cult Fervor's Spirit Boon on the ally", 30000);
      await ally.update({ "system.health.temp": 0 });
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ally]);
      await nextTurnUntil(ally, combat);
      await until(() => ally.system.health.temp === 3, "3 temporary Health at the ally's turn start");
      await combat.delete();
      // Grand Circle's move at rank 2: the circle goes to a point seen.
      setCirclePick(() => ({ x: 1400, y: 1400 }));
      const moved = await useWith(necro, "Grand Circle");
      assert.ok(moved.message, "Grand Circle's move posted");
      await until(() => {
        const shape = circleOf(necro)?.shapes?.[0];
        return shape && Math.abs((shape.x ?? 0) - 1400) < 2 && Math.abs((shape.y ?? 0) - 1400) < 2;
      }, "the circle moved");
      setCirclePick(() => ({ x: 900, y: 1050 }));
      await useWith(necro, "Circle of the Damned");
      await until(() => Math.abs((circleOf(necro)?.shapes?.[0]?.x ?? 0) - 900) < 2, "one circle at a time: the new one stands");
      assert.equal(canvas.scene.regions.filter(r => r.flags?.[SCOPE]?.featureKey === "circle-of-the-damned").length, 1, "and only one");
    });

    it("Life for a Life: an ally in the circle at 1 Health is struck; a servant collapses and the ally stays at 1 and regains the tier", async function () {
      this.timeout(120000);
      const tier = necro.system.tier;
      const servant = hordeOf(necro).find(x => (x.system.health.value ?? 0) > 0 && tokenOf(x));
      await nameToken(servant, "ZZ Life Servant");
      await moveTo(servant, 800, 1100);
      await moveTo(foe, 800, 900);
      await ally.update({ "system.health.value": 1, "system.health.temp": 0 });
      const talent = talentNamed(necro, "Life for a Life");
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, ally);
      const press = pressCard(attack, '[data-action="applyDamage"]');
      const app = await chooser(talent, 20000);
      await pick(app, "ZZ Life Servant");
      const { release } = await press;
      await until(() => !game.actors.has(servant.id), "the servant collapsed in its place");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + tier), "the ally stays at 1 and regains the tier");
      await release();
    });

    it("Unholy Fervor at rank 2: the ally's hits gain Shadow and it loses 1 Health at its next turn's start", async function () {
      this.timeout(120000);
      await ally.update({ "system.health.value": ally.system.health.max });
      const { message, warned } = await useWith(necro, "Unholy Fervor", [app => tick(app, ["ZZ Necro Ally"])]);
      assert.ok(message, `Unholy Fervor posted; warnings: ${warned.join(" | ")}`);
      const effect = await until(() => ally.effects.find(e => e.flags?.[SCOPE]?.unholyFervor), "the fervor laid on the ally");
      assert.equal(Number(effect.system.changes[0].value), Math.floor(necro.system.abilities.int.mod / 2), "half the Intelligence modifier");
      assert.equal(effect.system.changes[0].key, "system.damageBonus.typed.attack.shadow", "as Shadow, its own type");
      // **ONLY IN A FIGHT** (the lead, 2026-11-19: *"only in combat"*): out of a fight the world's
      // clock runs the fervor out and the 1 Health is never lost.
      const outside = ally.system.health.value;
      await game.time.advance(12);
      await until(() => !ally.effects.some(e => e.flags?.[SCOPE]?.unholyFervor), "the fervor run out on the world's clock");
      await sleep(500);
      assert.equal(ally.system.health.value, outside, "no Health lost out of a fight");
      // In a fight it lands at the ally's next turn start.
      const again = await useWith(necro, "Unholy Fervor", [app => tick(app, ["ZZ Necro Ally"])]);
      assert.ok(again.message, `Unholy Fervor posted again; warnings: ${again.warned.join(" | ")}`);
      await until(() => ally.effects.find(e => e.flags?.[SCOPE]?.unholyFervor), "the fervor laid again");
      const before = ally.system.health.value;
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ally]);
      await nextTurnUntil(ally, combat);
      await until(() => ally.system.health.value === before - 1, "1 Health lost at its next turn's start");
      await combat.delete();
    });

    it("Unsummon: a servant collapses for the Intelligence modifier in Mana; a second in the round is refused", async function () {
      this.timeout(120000);
      const servant = await ensureServant(necro);
      await nameToken(servant, "ZZ Unsummoned");
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ...hordeOf(necro).filter(x => tokenOf(x))]);
      await nextTurnUntil(necro, combat);
      await bankMana(necro, 1);
      const { message, warned } = await useWith(necro, "Unsummon", [app => pick(app, "ZZ Unsummoned")]);
      assert.ok(message, `Unsummon posted; warnings: ${warned.join(" | ")}`);
      await until(() => manaOf(necro).value === 1 + necro.system.abilities.int.mod, "the Intelligence modifier in Mana");
      const words = await refusedUse(necro, "Unsummon");
      assert.match(words ?? "", /this round already/, "a second in the round is refused in words");
      await combat.delete();
    });

    it("Dark Communion: out of a fight, a willing ally regains three times the tier", async function () {
      this.timeout(60000);
      const tier = necro.system.tier;
      await ally.update({ "system.health.value": 1 });
      const { message, warned } = await useWith(necro, "Dark Communion", [app => tick(app, ["ZZ Necro Ally"])]);
      assert.ok(message, `the rite posted; warnings: ${warned.join(" | ")}`);
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + 3 * tier), "three times the tier");
    });

    it("The Black Rite: a servant collapses for an ally, who regains five times the tier and has a Boon on every Test", async function () {
      this.timeout(120000);
      const tier = necro.system.tier;
      const servant = await ensureServant(necro);
      await nameToken(servant, "ZZ Offering");
      await moveTo(servant, 1100, 1000);
      await ally.update({ "system.health.value": 1 });
      await bankEssence(necro, 0);
      const { message, warned } = await useWith(necro, "The Black Rite", [app => tick(app, ["ZZ Offering"]), app => pick(app, "ZZ Necro Ally")]);
      assert.ok(message, `the rite posted; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(servant.id), "the offering collapsed");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 1 + 5 * tier), "five times the tier");
      assert.ok(ally.effects.some(e => e.flags?.[SCOPE]?.laidBoon?.kind === "all"), "a Boon on every Test until the end of its next turn");
    });

    it("Exhume: once per Long Rest, its Use counted and its card posted", async function () {
      this.timeout(60000);
      const { message, warned } = await useWith(necro, "Exhume");
      assert.equal(message?.flags[SCOPE].featureKey, "exhume", "under its key");
      assert.equal(featureNamed(necro, "Exhume").system.uses.value, 0, "the Long Rest's one use spent");
    });

    it("Bone Armor's Empowered line, in a fight: 1 Essence for 1 more Armor Point until the encounter ends, no stack", async function () {
      this.timeout(90000);
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ally]);
      await nextTurnUntil(necro, combat);
      await bankEssence(necro, 2);
      const stacks = boneArmorStacks(necro);
      const before = necro.system.ap?.body ?? 0;
      await useWith(necro, "Bone Armor", [app => pick(app, "Empowered")]);
      await until(() => (necro.system.ap?.body ?? 0) === before + 1, "1 more Armor Point");
      assert.equal(boneArmorStacks(necro), stacks, "not a stack");
      assert.equal(essenceOf(necro).value, 1, "1 Essence spent");
      await combat.delete();
      await until(() => (necro.system.ap?.body ?? 0) === before, "gone with the encounter");
    });
  });

  necromancerTalentsPathsB(context);
}

/* ------------------------------------------------------------------ */
/*  Fix run 4-T: the paths the 4c review found untested                */
/* ------------------------------------------------------------------ */

/** Answer the one Essence ask (`askEmpower`'s confirm) whose words hold `match`; whether one opened. */
async function answerEssenceAsk(match, yes = true, ms = 20000) {
  try {
    const app = await until(() => [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains("azeroth-blow-ask") && a.element.textContent.includes(match)) ?? null, `the ask naming ${match}`, ms);
    app.element.querySelector(`button[data-action="${yes ? "yes" : "no"}"]`).click();
    return true;
  } catch { return false; }
}

/** The Necromancer's Half-Actions left this turn. */
const halvesLeft = (actor, combat) => combat.getCombatantsByActor(actor)[0]?.budget?.halfActions ?? null;

/** This creature's turn, freshly started: through someone else's turn first where it is its turn now. */
async function freshTurnOf(actor, combat, other) {
  if (combat.combatant?.actor?.id === actor.id) await nextTurnUntil(other, combat);
  return nextTurnUntil(actor, combat);
}

function necromancerTalentsPathsB(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Necromancer's talents: the paths the 4c review found untested (fix run 4-T)", function () {
    let restoreDialog = null;
    let restoreText = null;
    let necro = null;
    let ally = null;
    let foe = null;
    let fight = null;
    let corpse = 0;
    const named = {};
    const spellDC = () => Math.trunc(Number(necro.system.spellDC));
    /** End any fight still standing, so an out-of-fight test is out of one whatever failed before it. */
    async function noFight() {
      for (const c of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await c.delete().catch(() => {});
      fight = null;
      await until(() => !necro.activeFight?.(), "out of every fight");
    }

    /** A corpse beside the Necromancer raised by a spell from the sheet; the new servant, its token named. */
    async function raiseOne(spell, label) {
      corpse += 1;
      const body = await creature("Bandit", `B Corpse ${corpse}`, 0);
      // Within 10 feet of the Necromancer at (1000, 1000), clear of the ally and the foe.
      const RING = [[1200, 800], [1200, 1200], [800, 1200], [800, 800], [1000, 1200], [1000, 800], [1200, 1000], [900, 1200], [1100, 1200], [900, 800], [1100, 800], [1200, 900], [1200, 1100]];
      const [x, y] = RING[(corpse - 1) % RING.length];
      await place(body, x, y);
      await bankMana(necro);
      const had = new Set(hordeActorsOf(necro).map(a => a.id));
      const card = await castWith(necro, spell, { steps: [app => pick(app, `ZZ B Corpse ${corpse}`)], ms: 30000 });
      if (!card) {
        // Say what stood open instead of a card: a second chooser, a dialog, the last chat line.
        const open = [...foundry.applications.instances.values()].filter(a => a.rendered && /azeroth-(choose|roll|blow-ask)/.test(String(a.id ?? ""))).map(a => `${a.id}: ${a.element?.textContent?.replace(/\s+/g, " ").slice(0, 200)}`);
        const last = game.messages.contents.at(-1);
        throw new Error(`${spell} posted no card; open: ${open.join(" || ") || "none"}; last chat: ${last ? last.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200) : "none"}`);
      }
      assert.ok(card?.flags[SCOPE].success, `${spell} was cast`);
      const servant = await until(() => hordeActorsOf(necro).find(a => !had.has(a.id) && tokenOf(a)), `${spell}'s servant`);
      await sleep(800);
      // A level 17 Raise Dead raises two skeletons from the one corpse: the second is named `<label> b`.
      const risen = hordeActorsOf(necro).filter(a => !had.has(a.id) && tokenOf(a)).sort((a, b) => (a.id === servant.id ? -1 : b.id === servant.id ? 1 : a.id.localeCompare(b.id)));
      for (const [i, a] of risen.entries()) {
        const key = i === 0 ? label : `${label} ${String.fromCharCode(97 + i)}`;
        named[key] = a;
        // An extra is named so no pick by the first one's name can match it (the pickers match a prefix).
        await nameToken(a, i === 0 ? `ZZ ${label}` : `ZZ Extra ${String.fromCharCode(97 + i)} ${label}`);
      }
      return servant;
    }

    before(async function () {
      restoreDialog = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      restoreText = await quietScrollingText();
    });
    after(async function () {
      this.timeout(240000);
      setCirclePick(null);
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-") || id.startsWith("azeroth-blow-ask-")) await app.close().catch(() => {});
      }
      if (restoreDialog !== null) await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, restoreDialog);
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      const owners = new Set(NECROS.map(n => n.uuid));
      for (const a of game.actors.filter(a => owners.has(bondOf(a)?.ownerUuid))) await a.delete().catch(() => {});
      for (const f of game.folders.filter(f => f.type === "Actor" && owners.has(f.getFlag(SCOPE, "hordeOf")))) await f.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      NECROS.length = 0;
      await restoreText?.();
    });

    it("sets up: a level 17 Necromancer raises a ghoul, a zombie and three skeletons beside an ally and a tough foe, and takes its talents", async function () {
      this.timeout(300000);
      necro = await makeCharacter({ name: "ZZ Necro Paths", classes: [["Necromancer", 17]], race: "Human", spells: ["Ghoul Rising"], abilities: { int: 18, con: 14 } });
      NECROS.push(necro);
      await necro._talentGrant;
      await until(() => essenceOf(necro), "the Essence pool");
      await until(() => ["Raise Dead", "Animate Corpse"].every(s => necro.items.some(i => i.type === "spell" && i.name === s)), "Grave Calling's spells");
      ally = await makeCharacter({ name: "ZZ Paths Ally", classes: [["Mage", 5]] });
      await necro.setParty(true);
      await ally.setParty(true);
      foe = await creature("Bandit", "Paths Foe");
      await foe.update({ "system.health.max": 300, "system.health.value": 300 });
      await sceneWith([{ actor: necro, x: 1000, y: 1000 }, { actor: ally, x: 800, y: 1000 }, { actor: foe, x: 1800, y: 1000, side: "hostile" }]);
      // Two skeletons a Raise Dead at level 17: four skeletons, a ghoul and a zombie fill the six places.
      await raiseOne("Raise Dead", "Paths Skeleton 1");
      await raiseOne("Raise Dead", "Paths Skeleton 3");
      named["Paths Skeleton 2"] = named["Paths Skeleton 1 b"];
      named["Paths Skeleton 4"] = named["Paths Skeleton 3 b"];
      await nameToken(named["Paths Skeleton 2"], "ZZ Paths Skeleton 2");
      await nameToken(named["Paths Skeleton 4"], "ZZ Paths Skeleton 4");
      await raiseOne("Ghoul Rising", "Paths Ghoul");
      await raiseOne("Animate Corpse", "Paths Zombie");
      for (const [name, taken] of Object.entries(RANKS)) {
        const item = await until(() => talentNamed(necro, name), `${name} embedded`);
        await item.update({ "system.taken": taken });
      }
      await until(() => featureNamed(necro, "The Black Rite") && featureNamed(necro, "Plague Carrier") && featureNamed(necro, "Bone Storm"), "the talents' features granted");
      assert.equal(entryOf(named["Paths Ghoul"]), "Plagued Ghoul");
      assert.equal(entryOf(named["Paths Zombie"]), "Risen Zombie");
      assert.deepEqual([1, 2, 3].map(n => entryOf(named[`Paths Skeleton ${n}`])), ["Risen Skeleton", "Risen Skeleton", "Risen Skeleton"]);
    });

    it("Plague Carrier's Empowered surge: 1 Essence, and a ghoul's hit that fails its Test lays Poisoned 1 against the Spell DC beside the tick", async function () {
      this.timeout(180000);
      const ghoul = named["Paths Ghoul"];
      await moveTo(ghoul, 1700, 1000);
      fight = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ghoul, foe]);
      await nextTurnUntil(necro, fight);
      await bankEssence(necro, 1);
      const { message, warned } = await useWith(necro, "Plague Carrier");
      assert.ok(message, `the surge posted; warnings: ${warned.join(" | ")}`);
      assert.equal(message.flags[SCOPE].featureKey, "plague-carrier", "under its animation key");
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
      await ghoul.update({ "system.health.value": 1 });
      await nextTurnUntil(ghoul, fight);
      const test = nextCard(m => m.flags?.[SCOPE]?.graftTest?.graft === "plagueCarrier", 30000);
      await npcAttacks(ghoul, ghoul.system.attacks[0].name, foe, { face: 20 });
      const card = await test;
      const { release } = await pressCard(card, '[data-action="resistTest"]', { face: 1 });
      await until(() => foe.effects.some(e => e.flags?.[SCOPE]?.[PLAGUE_CARRIER_FLAG]), "the plague's tick laid");
      const poison = await until(() => foe.effects.find(e => e.statuses?.has("poisoned") && e.flags?.[SCOPE]?.shedDc), "Poisoned laid while the surge stands, carrying its shed DC");
      await release();
      assert.equal(poison.flags[SCOPE].shedDc.dc, spellDC(), "shed against the Necromancer's Spell DC");
      assert.equal(poison.getFlag(SCOPE, "value") ?? 1, 1, "Poisoned 1");
    });

    it("Regenerating Tissue at rank 2: the ghoul regains twice the tier at the start of its turn, through the tracker's Next Turn", async function () {
      this.timeout(120000);
      // The ghoul was set to 1 Health on the Necromancer's turn above and its own turn has started since.
      const ghoul = named["Paths Ghoul"];
      const tier = necro.system.tier;
      await ghoul.update({ "system.health.value": 1 });
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "regenerating-tissue", 60000);
      await freshTurnOf(ghoul, fight, foe);
      await until(() => ghoul.system.health.value === Math.min(ghoul.system.health.max, 1 + 2 * tier), "twice the tier at its turn's start");
      assert.ok(await card, "the mending posted its card");
    });

    it("Restless Bones at rank 1 in a fight: a felled skeleton stays down until the Necromancer's turn starts, then stands with half its Health", async function () {
      this.timeout(180000);
      await bankEssence(necro, 0);
      const skeleton = named["Paths Skeleton 1"];
      await moveTo(foe, 1500, 1000);
      await moveTo(skeleton, 1400, 1000);
      await nextTurnUntil(foe, fight);
      await skeleton.update({ "system.health.value": 1, "system.health.temp": 0 });
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, skeleton);
      await applyFrom(attack);
      await until(() => skeleton.getFlag(SCOPE, "restlessPending"), "held up until the Necromancer's turn");
      assert.equal(skeleton.system.health.value, 0, "still down on the foe's turn");
      assert.notOk(skeleton.getFlag(SCOPE, "restlessStood"), "not stood yet");
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "restless-bones", 60000);
      await nextTurnUntil(necro, fight);
      await until(() => skeleton.system.health.value === Math.max(1, Math.floor(skeleton.system.health.max / 2)), "half its Health at the Necromancer's turn start");
      assert.ok(await card, "its card posted");
      assert.isTrue(skeleton.getFlag(SCOPE, "restlessStood"), "marked once");
    });

    it("Restless Bones at rank 2 in a fight: the skeleton stands again at once, on the foe's own turn", async function () {
      this.timeout(180000);
      await talentNamed(necro, "Restless Bones").update({ "system.taken": 2 });
      await bankEssence(necro, 0);
      const skeleton = named["Paths Skeleton 2"];
      await moveTo(skeleton, 1400, 1100);
      await nextTurnUntil(foe, fight);
      const foeTurn = fight.combatant.id;
      await skeleton.update({ "system.health.value": 1, "system.health.temp": 0 });
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, skeleton);
      await applyFrom(attack);
      await until(() => skeleton.getFlag(SCOPE, "restlessStood") === true, "stood again");
      assert.equal(fight.combatant.id, foeTurn, "still the foe's turn");
      assert.equal(skeleton.system.health.value, Math.max(1, Math.floor(skeleton.system.health.max / 2)), "with half its Health");
    });

    it("Restless Bones' Empowered line: 1 Essence asked at the stand, and the skeleton stands with all its Health", async function () {
      this.timeout(180000);
      const skeleton = named["Paths Skeleton 3"];
      await moveTo(skeleton, 1400, 900);
      await nextTurnUntil(necro, fight);
      await nextTurnUntil(foe, fight);
      await bankEssence(necro, 1);
      await skeleton.update({ "system.health.value": 1, "system.health.temp": 0 });
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "restless-bones", 60000);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, skeleton);
      const press = pressCard(attack, '[data-action="applyDamage"]');
      assert.isTrue(await answerEssenceAsk("Restless Bones", true), "the Essence was asked");
      const { release } = await press;
      await until(() => skeleton.system.health.value === skeleton.system.health.max, "all its Health");
      await release();
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
      assert.include(textOf(await card), "all its Health", "the card says so");
    });

    it("Bloated Dead's Empowered line: the zombie drops, the Essence is asked, and the foe takes twice the tier", async function () {
      this.timeout(180000);
      const tier = necro.system.tier;
      const zombie = named["Paths Zombie"];
      await moveTo(zombie, 1500, 1100);
      await nextTurnUntil(necro, fight);
      await nextTurnUntil(foe, fight);
      await bankEssence(necro, 1);
      await zombie.update({ "system.health.value": 1, "system.health.temp": 0 });
      const card = nextCard(m => m.flags?.[SCOPE]?.featureKey === "bloated-dead", 60000);
      const attack = await npcAttacks(foe, foe.system.attacks[0].name, zombie);
      const press = pressCard(attack, '[data-action="applyDamage"]');
      assert.isTrue(await answerEssenceAsk("bursts", true), "the Essence was asked");
      const { release } = await press;
      const posted = await card;
      await release();
      assert.include(textOf(posted), "empowered", "the empowered burst");
      assert.include(textOf(posted), `${2 * tier} Shadow`, "twice the tier");
      assert.equal(posted.flags[SCOPE].targets?.[0]?.tokenId, tokenOf(foe).id, "naming the foe");
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
    });

    it("Bone Armor's Empowered line: Essence that runs out while the chooser stands is refused in words with nothing spent", async function () {
      this.timeout(120000);
      await freshTurnOf(necro, fight, foe);
      await bankEssence(necro, 1);
      const halves = halvesLeft(necro, fight);
      const before = necro.system.ap?.body ?? 0;
      const { message, warned } = await useWith(necro, "Bone Armor", [async app => { await bankEssence(necro, 0); await pick(app, "Empowered"); }], { ms: 4000 });
      assert.notOk(message, "no card");
      assert.match(warned.join(" | "), /too little Essence/, "refused in words");
      assert.equal(halvesLeft(necro, fight), halves, "the Half-Action kept");
      assert.equal(necro.system.ap?.body ?? 0, before, "no Armor Point");
    });

    it("Bone Armor's Empowered line: Essence that runs out after the Half-Action is paid falls back to the plain use, said in words", async function () {
      this.timeout(120000);
      await bankEssence(necro, 1);
      const pool = essenceOf(necro);
      const mine = fight.getCombatantsByActor(necro)[0];
      const halves = halvesLeft(necro, fight);
      const stacks = boneArmorStacks(necro);
      const before = necro.system.ap?.body ?? 0;
      const skeleton = named["Paths Skeleton 1"];
      await moveTo(skeleton, 1100, 1000);
      // The pool is emptied the moment the Half-Action is written: queued ahead of the Use's own spend.
      const hook = Hooks.on("updateCombatant", (c, changed) => {
        if (c.id !== mine.id || !foundry.utils.hasProperty(changed, `flags.${SCOPE}.budget`)) return;
        Hooks.off("updateCombatant", hook);
        necro.updatePool({ itemId: pool.itemId, kind: "momentum", value: 0 }, {}, { essenceGain: "hand" });
      });
      try {
        const { message, warned } = await useWith(necro, "Bone Armor", [app => pick(app, "Empowered"), app => pick(app, "ZZ Paths Skeleton 1")]);
        assert.ok(message, `the Use posted; warnings: ${warned.join(" | ")}`);
        assert.include(textOf(message), "falls back to its plain use", "the card says it fell back");
      } finally {
        Hooks.off("updateCombatant", hook);
      }
      await until(() => !game.actors.has(skeleton.id), "the skeleton collapsed for the plain use");
      await until(() => boneArmorStacks(necro) === stacks + 1, "one stack to the Long Rest");
      await until(() => (necro.system.ap?.body ?? 0) === before + 1, "+1 Armor Point");
      assert.equal(halvesLeft(necro, fight), halves - 1, "one Half-Action, once");
      assert.equal(essenceOf(necro).value, 0, "no Essence taken");
    });

    it("Unsummon at rank 2 takes no action: the servant collapses for the Intelligence modifier in Mana and the Half-Actions stand", async function () {
      this.timeout(120000);
      await talentNamed(necro, "Unsummon").update({ "system.taken": 2 });
      await until(() => !featureNamed(necro, "Unsummon")?.system?.action, "Unsummon restamped to no action");
      const servant = named["Paths Skeleton 2"];
      await moveTo(servant, 1100, 1100);
      await bankMana(necro, 1);
      const halves = halvesLeft(necro, fight);
      const { message, warned } = await useWith(necro, "Unsummon", [app => pick(app, "ZZ Paths Skeleton 2")]);
      assert.ok(message, `Unsummon posted; warnings: ${warned.join(" | ")}`);
      await until(() => manaOf(necro).value === 1 + necro.system.abilities.int.mod, "the Intelligence modifier in Mana");
      assert.equal(halvesLeft(necro, fight), halves, "no Half-Action spent");
    });

    it("Unsummon on a creature raised this round returns no Mana, even with no Half-Action left", async function () {
      this.timeout(180000);
      await freshTurnOf(necro, fight, foe);
      const fresh = await raiseOne("Raise Dead", "Paths Fresh");
      assert.equal(halvesLeft(necro, fight), 0, "Raise Dead spent the turn's two Half-Actions");
      await bankMana(necro, 1);
      const { message, warned } = await useWith(necro, "Unsummon", [app => pick(app, "ZZ Paths Fresh")]);
      assert.ok(message, `Unsummon posted with no Half-Action left; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(fresh.id), "the fresh servant collapsed");
      assert.include(textOf(message), "raised this round", "said in words");
      assert.equal(manaOf(necro).value, 1, "no Mana for a creature raised this round");
    });

    it("Dark Communion is refused in a fight, in words, with nothing spent", async function () {
      this.timeout(60000);
      const uses = featureNamed(necro, "Dark Communion").system.uses?.value ?? null;
      const words = await refusedUse(necro, "Dark Communion");
      assert.match(words ?? "", /cannot be led in a fight/, "refused in words");
      assert.equal(featureNamed(necro, "Dark Communion").system.uses?.value ?? null, uses, "its use kept");
      await noFight();
    });

    it("Sacrificial Strength at rank 2: a servant collapsed by choice gives each ally within 10 feet of it twice the tier in temporary Health", async function () {
      this.timeout(120000);
      await noFight();
      const tier = necro.system.tier;
      const servant = named["Paths Skeleton 3"];
      await moveTo(servant, 700, 1000);
      await ally.update({ "system.health.temp": 0 });
      const { message, warned } = await useWith(necro, "Unsummon", [app => pick(app, "ZZ Paths Skeleton 3")]);
      assert.ok(message, `Unsummon posted; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(servant.id), "the servant collapsed by choice");
      await until(() => ally.system.health.temp === 2 * tier, "the ally beside it gains the tier per rank");
    });

    it("Acolyte's Sacrifice's Empowered line: 1 Essence, and the Shade rises taking no place in the horde", async function () {
      this.timeout(120000);
      await noFight();
      const ghoul = named["Paths Ghoul"];
      await moveTo(ghoul, 1100, 1000);
      await bankEssence(necro, 1);
      const { message, warned } = await useWith(necro, "Acolyte's Sacrifice", [app => pick(app, "ZZ Paths Ghoul"), app => pick(app, "Empowered")]);
      assert.ok(message, `the sacrifice posted; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(ghoul.id), "the ghoul collapsed");
      const shade = await until(() => hordeActorsOf(necro).find(a => entryOf(a) === "Shade"), "a Shade in the horde");
      assert.isTrue(bondOf(shade).outside === true, "outside the horde's places");
      assert.include(textOf(message), "taking no place", "said on the card");
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
    });

    it("Circle of the Damned's Empowered line: 1 Essence, and an ally starting its turn inside gains the rank plus the Intelligence modifier", async function () {
      this.timeout(180000);
      await noFight();
      const expected = 3 + Math.max(0, necro.system.abilities.int.mod);
      setCirclePick(() => ({ x: 900, y: 1050 }));
      await bankEssence(necro, 1);
      const { message, warned } = await useWith(necro, "Circle of the Damned", [app => pick(app, "Empowered")]);
      assert.ok(message, `the circle posted; warnings: ${warned.join(" | ")}`);
      const region = await until(() => circleOf(necro), "the circle's Region");
      assert.isTrue(region.flags[SCOPE].circle.empowered, "drawn empowered");
      assert.equal(region.flags[SCOPE].areaTick.temp, expected, "the rank plus the Intelligence modifier");
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
      await ally.update({ "system.health.temp": 0 });
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, ally]);
      await freshTurnOf(ally, combat, necro);
      await until(() => ally.system.health.temp === expected, `${expected} temporary Health at the ally's turn start`);
      await combat.delete();
    });

    it("The Black Rite's Empowered line on a Dying ally: it regains five times the tier, stops Dying, and gains the Intelligence modifier in temporary Health", async function () {
      this.timeout(180000);
      const tier = necro.system.tier;
      await noFight();
      const offering = await raiseOne("Raise Dead", "Paths Offering");
      await moveTo(offering, 1100, 1100);
      await ally.update({ "system.health.value": 0, "system.health.temp": 0 });
      await until(() => ally.system.dying === true, "the ally is Dying");
      await bankEssence(necro, 1);
      const { message, warned } = await useWith(necro, "The Black Rite", [app => tick(app, ["ZZ Paths Offering"]), app => pick(app, "ZZ Paths Ally"), app => pick(app, "Empowered")]);
      assert.ok(message, `the rite posted; warnings: ${warned.join(" | ")}`);
      await until(() => !game.actors.has(offering.id), "the offering collapsed");
      await until(() => ally.system.health.value === Math.min(ally.system.health.max, 5 * tier), "five times the tier");
      assert.isFalse(ally.system.dying, "no longer Dying");
      await until(() => ally.system.health.temp === Math.max(0, necro.system.abilities.int.mod), "the Intelligence modifier in temporary Health");
      assert.equal(essenceOf(necro).value, 0, "1 Essence spent");
    });

    it("Bone Storm: once per encounter, and a foe beside four collapsing skeletons takes three blows, no more", async function () {
      this.timeout(300000);
      await noFight();
      await raiseOne("Raise Dead", "Storm Raise");
      // Any four skeletons standing: the two just raised and those left from the paths above.
      const four = hordeActorsOf(necro).filter(a => entryOf(a) === "Risen Skeleton" && (a.system.health.value ?? 0) > 0 && tokenOf(a)).slice(0, 4);
      assert.equal(four.length, 4, "four skeletons standing");
      for (const [i, a] of four.entries()) { named[`Storm ${i + 1}`] = a; await nameToken(a, `ZZ Storm ${i + 1}`); }
      await moveTo(foe, 2000, 1000);
      await foe.update({ "system.health.value": 300 });
      const spots = [[1900, 1000], [2100, 1000], [2000, 900], [2000, 1100]];
      for (const [i, [x, y]] of spots.entries()) await moveTo(named[`Storm ${i + 1}`], x, y);
      const combat = await (await import("./quench-chronomancer-common.mjs")).fightWith([necro, foe]);
      await freshTurnOf(necro, combat, foe);
      let blows = 0;
      let last = foe.system.health.value;
      const hook = Hooks.on("updateActor", (a, changed) => {
        if (a.id !== foe.id || !foundry.utils.hasProperty(changed, "system.health.value")) return;
        const now = changed.system.health.value;
        if (now < last) blows += 1;
        last = now;
      });
      try {
        const { message, warned } = await useWith(necro, "Bone Storm", [app => tick(app, ["ZZ Storm 1", "ZZ Storm 2", "ZZ Storm 3", "ZZ Storm 4"])]);
        assert.ok(message, `Bone Storm posted; warnings: ${warned.join(" | ")}`);
        await until(() => [1, 2, 3, 4].every(n => !game.actors.has(named[`Storm ${n}`].id)), "all four collapsed");
        await until(() => blows >= 3, "three blows landed");
        await sleep(1500);
        assert.equal(blows, 3, "three blows, never four");
      } finally {
        Hooks.off("updateActor", hook);
      }
      // A second in the encounter: its one use is spent, so the sheet greys its Use beside the uses it shows.
      assert.equal(featureNamed(necro, "Bone Storm").system.uses.value, 0, "its one use spent");
      const sheet = await openSheet(necro);
      await settle();
      const storm = featureNamed(necro, "Bone Storm");
      const row = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${storm.id}"]`);
      assert.isTrue(row?.querySelector('[data-action="useFeature"]')?.disabled === true, "the second Use is greyed");
      assert.isTrue(row?.classList?.contains("is-spent"), "drawn as spent");
      const second = await refusedUse(necro, "Bone Storm");
      assert.isNotNull(second, "pressing it posts nothing");
      await sheet.close();
      await combat.delete();
    });
  });
}
