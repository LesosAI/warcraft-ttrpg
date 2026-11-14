/**
 * **THE DEATH KNIGHT'S RAISES, PRESENCES AND MOUNTS, THROUGH THE REAL DOORS** (the plan's Phase 4
 * doors 9 to 13, *Raising the dead*, and the F2 review's findings; run F3). Every feature is
 * pressed from the sheet's own Use control, every raise spell cast through `castSpell` with its
 * corpses chosen in the one chooser, and the result read off the documents.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.death-knight-necromancy`. Every document a test makes
 * is deleted in `after`, the raised dead (named for their 14 entry, not `ZZ`) among them.
 */

import { cleanup, dialogFor, drainAreaWork, give, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, untilHook, warnings } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { chooser, featureNamed, fightWith, freshTurn, sceneWith, tokenOf, turnForward, until } from "./quench-chronomancer-common.mjs";
import { CORPSE_FLAG, RAISE_FLAG } from "../rules/raise.mjs";
import { PRESENCE_FLAG } from "../rules/death-knight.mjs";
import { AURA_FLAG, meleeTypedExtras } from "../rules/auras.mjs";
import { IGNORES_GROUND_FLAG } from "../rules/area-ground.mjs";
import { IMMUNE_FLAG } from "../rules/legacy-uses.mjs";
import { MOUNT_WORK_FLAG, SPECTRAL_TRAIT } from "../rules/mount-works.mjs";
import { bondOf } from "../documents/bound.mjs";
import { inscribeRunes, spendRunesOn } from "../documents/runes.mjs";
import { forceMove } from "../effects/forced-movement.mjs";
import { spendRuneBare } from "../effects/death-knight.mjs";
import { spectralMove } from "../effects/mount-works.mjs";
import { annotateMitigation } from "../dice/annotate.mjs";
import { withdrawHit } from "../effects/miss.mjs";

const SCOPE = "azeroth-rpg";
const runicPower = actor => actor.poolSnapshot().find(p => p.kind === "momentum" && p.name === "runicPower") ?? null;
const runes = actor => actor.system?.runes ?? { weapons: [], value: 0, max: 0 };
const health = actor => actor.system?.health?.value ?? 0;
const raisedOf = (owner, raise) => game.actors.filter(a => bondOf(a)?.kind === "raised" && bondOf(a)?.ownerUuid === owner.uuid && (!raise || bondOf(a)?.raise === raise));

/** A Human Death Knight, Charisma 16 (+3: a cap of 13), its greatsword Rare and wielded. */
async function knightWith(name, { level = 20, spells = [] } = {}) {
  const k = await makeCharacter({ name, classes: [["Death Knight", level]], race: "Human", weapons: ["Greatsword"], spells, abilities: { str: 16, cha: 16, con: 14 } });
  const blade = await until(() => k.items.find(i => i.type === "weapon" && i.name === "Greatsword"), "the greatsword carried");
  await blade.update({ "system.rarity": "rare", "system.equipped": true });
  await until(() => runes(k).slots > 0, "the rune slots");
  await k.update({ "system.health.value": k.system.health.max });
  await settle();
  return k;
}

/** Runic Power banked by a GM's hand (`runicGain: "hand"`, the one hand door). */
async function bank(knight, value = 13) {
  const rp = runicPower(knight);
  await knight.updatePool({ itemId: rp.itemId, kind: "momentum", value }, {}, { runicGain: "hand" });
  await until(() => runicPower(knight).value === Math.min(value, rp.max), "Runic Power banked");
}

/** Press a feature's Use on the sheet; the card, or null where nothing was posted within `ms`. */
async function pressFeature(actor, name, { ms = 15000, answer = null } = {}) {
  const feature = await until(() => featureNamed(actor, name), `${name} granted`);
  const sheet = await openSheet(actor);
  sheet.changeTab("combat", "primary");
  await settle();
  const control = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
  if (!control) throw new Error(`the sheet draws no Use for ${name}`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === actor.id && ["feature", "mountWork"].includes(m.flags?.[SCOPE]?.kind))
    .then(([card]) => { made.push(card); return card; }).catch(() => null);
  const unpin = pinDie(15);
  try {
    control.click();
    if (answer) await answer(feature);
    return await posted;
  } finally {
    unpin();
    await sheet.close();
  }
}

/** A promise, or a failure after `ms` naming what was waited on and every window left open. */
async function within(promise, ms, what) {
  let timer = null;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const open = [...foundry.applications.instances.values()].filter(a => a.rendered).map(a => `${a.id}: ${a.element?.textContent?.replace(/\s+/g, " ").slice(0, 160)}`);
      reject(new Error(`${what} did not settle in ${ms} ms; open: ${open.join(" || ")}`));
    }, ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Press the one chooser's button as it opened, with whatever it preselected. */
async function chooseAsOffered(item) {
  const app = await chooser(item);
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** Pick an option by its words in the one chooser and press its button. */
async function chooseNamed(item, words) {
  const app = await chooser(item);
  const select = app.element.querySelector("#azeroth-choose-select");
  const option = [...select.options].find(o => o.textContent.includes(words));
  if (!option) throw new Error(`the chooser offers no ${words}: ${[...select.options].map(o => o.textContent.trim()).join(" | ")}`);
  select.value = option.value;
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** A corpse: a Kobold (Small, Humanoid) at 0 Health, hostile. */
async function corpse(name) {
  const npc = await makeNpc("Kobold");
  await npc.update({ name: `ZZ ${name}`, "system.health.value": 0 });
  return npc;
}

export function deathKnightNecromancyBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Death Knight's raises, presences and mounts (run F3)", function () {
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
      // The raised dead are named for their entry, not `ZZ`: swept by their bond to a knight this batch made.
      const knights = new Set(made.filter(d => d instanceof Actor).map(d => d.uuid));
      for (const a of game.actors.filter(x => bondOf(x)?.kind === "raised" && knights.has(bondOf(x)?.ownerUuid))) await a.delete().catch(() => {});
      for (const doc of made.filter(d => d instanceof Scene && game.scenes.has(d.id))) await doc.delete().catch(() => {});
      await cleanup();
      await restoreText?.();
    });

    describe("door 10: Unholy Presence", function () {
      it("is laid from the sheet's Use for 8 Runic Power, refuses Frightened, and a second Use ends it for nothing", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Presence");
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await bank(knight);
        assert.ok(await pressFeature(knight, "Unholy Presence"), "the Use posted its card");
        await until(() => runicPower(knight).value === 5, "8 Runic Power spent");
        const laid = await until(() => knight.effects.find(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "presence"), "the presence laid");
        assert.include(laid.flags[SCOPE][IMMUNE_FLAG].conditions, "frightened", "the presence refuses Frightened");
        assert.include([...(knight.system.conditionImmunities ?? [])], "frightened", "read into the knight's immunities");
        const again = await pressFeature(knight, "Unholy Presence", { ms: 4000 });
        assert.isNull(again, "a Use while it stands posts no card");
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]), "the second Use ends the presence");
        assert.equal(runicPower(knight).value, 5, "and spends nothing");
      });

      it("gives an ally +10 feet Speed, an undead ally its Health at its turn, and feeds the knight once a round", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK Aura");
        const living = await makeCharacter({ name: "ZZ DK Living Ally", classes: [["Warrior", 1]], race: "Human" });
        const ghoul = await makeNpc("Plagued Ghoul");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: living, x: 700, y: 500 }, { actor: ghoul, x: 500, y: 700 }]);
        const combat = await fightWith([knight, living, ghoul]);
        await freshTurn(knight, 1);
        await bank(knight);
        const speedBefore = tokenOf(living).actor.system.speed;
        assert.ok(await pressFeature(knight, "Unholy Presence"), "the Use posted its card");
        const theirs = tokenOf(living).actor;
        const dead = tokenOf(ghoul).actor;
        await until(() => theirs.effects.some(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":unholyPresence:speed")), "the living ally takes the Speed");
        await until(() => theirs.system.speed === speedBefore + 10, "+10 feet Speed");
        assert.isFalse(theirs.effects.some(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":unholyPresence:regen")), "a living ally regains nothing");
        await until(() => dead.effects.some(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":unholyPresence:regen") && e.flags?.[SCOPE]?.tick?.kind === "heal"), "the undead ally takes its Health at the turn");
        // The ghoul's turn start lands the 1 Health.
        await dead.update({ "system.health.value": Math.max(1, dead.system.health.max - 3) });
        const before = health(dead);
        await turnForward(combat, ghoul);
        await until(() => health(dead) === before + 1, "1 Health at the start of the ghoul's turn");
        // Feeds on Blows: the first blow of the round gives 1 Runic Power, the second none.
        const rp = runicPower(knight).value;
        await knight.applyDamage(2, { struck: true, attack: false, type: null });
        await until(() => runicPower(knight).value === rp + 1, "1 Runic Power for the first blow");
        await knight.applyDamage(2, { struck: true, attack: false, type: null });
        await settle();
        assert.equal(runicPower(knight).value, rp + 1, "and none for the second in the round");
        // A Long Rest ends it.
        await combat.delete();
        await knight.longRest();
        await until(() => !knight.effects.some(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "presence"), "the Long Rest ends the presence");
      });
    });

    describe("door 12: March of the Damned", function () {
      it("holds an ally within 30 feet against ground, Frightened, Slowed and a push, and gives an undead ally within 60 its Shadow", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK March");
        const living = await makeCharacter({ name: "ZZ DK March Ally", classes: [["Warrior", 1]], race: "Human" });
        const ghoul = await makeNpc("Plagued Ghoul");
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: living, x: 700, y: 500 }, { actor: ghoul, x: 500, y: 1400 }, { actor: foe, x: 800, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, living, ghoul, foe]);
        await freshTurn(knight, 2);
        await bank(knight);
        assert.ok(await pressFeature(knight, "March of the Damned"), "the Use posted its card");
        await until(() => runicPower(knight).value === 8, "5 Runic Power spent");
        const march = await until(() => knight.effects.find(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === "march"), "the march laid");
        assert.equal(march.flags[SCOPE][PRESENCE_FLAG].shadow, 1, "half of +3, rounded down, stamped at the Use");
        assert.ok(march.duration?.value, "it lasts 1 minute");
        const theirs = tokenOf(living).actor;
        const held = await until(() => theirs.effects.find(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":marchOfTheDamned:allies")), "the ally takes the march");
        assert.isTrue(held.flags[SCOPE][IGNORES_GROUND_FLAG] === true, "the ally ignores Difficult ground");
        assert.includeMembers(held.flags[SCOPE][IMMUNE_FLAG].conditions, ["frightened", "slowed"], "and refuses Frightened and Slowed");
        const pushed = await forceMove({ token: tokenOf(living).document, from: tokenOf(foe).document.getCenterPoint(), feet: 10, toward: "away", by: tokenOf(foe).actor });
        assert.isFalse(pushed.moved, "a push against the ally's will is refused");
        assert.equal(pushed.reason, "refuses");
        // The ghoul stands 45 feet off: past 30, inside 60.
        const dead = tokenOf(ghoul).actor;
        await until(() => dead.effects.some(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":marchOfTheDamned:undead")), "the undead ally within 60 feet takes the Shadow");
        assert.isFalse(dead.effects.some(e => e.flags?.[SCOPE]?.[AURA_FLAG]?.key?.endsWith(":marchOfTheDamned:allies")), "and nothing of the 30 feet");
        assert.deepEqual(meleeTypedExtras([...dead.effects], { melee: true }), [{ type: "shadow", amount: 1 }], "1 Shadow on a melee hit");
        assert.deepEqual(meleeTypedExtras([...theirs.effects], { melee: true }), [], "a living ally deals none");
        await combat.delete();
      });
    });

    describe("door 11 and the raise spells", function () {
      it("Army of the Dead raises the corpses chosen within 60 feet as Risen Skeletons for 6 Runic Power and its one use; the carrier's end collapses them", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK Army");
        const a = await corpse("Army A");
        const b = await corpse("Army B");
        const far = await corpse("Army Far");
        const scene = await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: a, x: 700, y: 500, side: "hostile" }, { actor: b, x: 900, y: 500, side: "hostile" }, { actor: far, x: 2400, y: 500, side: "hostile" }]);
        await bank(knight);
        const card = await pressFeature(knight, "Army of the Dead", { answer: async feature => {
          const app = await chooser(feature);
          // The token keeps its pack name (Kobold): the far corpse is the one 95 feet off.
          const far = [...app.element.querySelectorAll('input[name="choice"]')].find(box => box.closest("label")?.textContent?.includes("(95 ft)"));
          assert.isTrue(Boolean(far?.disabled), "a corpse past 60 feet is greyed");
          app.element.querySelector('button[data-action="choose"]').click();
          await until(() => !app.rendered, "the chooser to close");
        } });
        assert.ok(card, "the Use posted its card");
        await until(() => runicPower(knight).value === 7, "6 Runic Power spent");
        const raised = await until(() => raisedOf(knight, "army-of-the-dead")[0], "the Risen Skeletons bound");
        assert.equal(raised.name, "Risen Skeleton");
        assert.equal(bondOf(raised).count, 2, "one skeleton a corpse");
        await until(() => scene.tokens.filter(t => t.actorId === raised.id).length === 2, "two tokens placed");
        assert.isTrue(scene.tokens.filter(t => t.actorId === raised.id).every(t => t.actorLink === false), "unlinked: each carries its own Health");
        assert.equal(tokenOf(a).document.getFlag(SCOPE, CORPSE_FLAG)?.state, "raised", "the corpse has risen");
        const carrier = await until(() => knight.effects.find(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "army-of-the-dead"), "the carrier on the knight");
        assert.ok(carrier.duration?.value, "the carrier has a span: three rounds");
        assert.equal(featureNamed(knight, "Army of the Dead").system.uses.value, 0, "the Long Rest's one use is struck");
        // The carrier's end is the collapse.
        await carrier.delete();
        await until(() => !game.actors.has(raised.id), "the skeletons collapse");
        await until(() => !scene.tokens.some(t => t.actorId === raised.id), "with their tokens");
      });

      it("Raise Ghoul raises a Humanoid corpse in range; a recast collapses the first", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK Ghoul", { spells: ["Raise Ghoul"] });
        const one = await corpse("Ghoul One");
        const two = await corpse("Ghoul Two");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: one, x: 700, y: 500, side: "hostile" }, { actor: two, x: 500, y: 700, side: "hostile" }]);
        await bank(knight);
        const spell = knight.items.find(i => i.type === "spell" && i.name === "Raise Ghoul");
        const cast = async () => {
          const unpin = pinDie(20);
          try {
            const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] });
            await chooseAsOffered(spell);
            const card = await going;
            made.push(card);
            return card;
          } finally { unpin(); }
        };
        await cast();
        const first = await until(() => raisedOf(knight, "raise-ghoul")[0], "the ghoul bound");
        assert.equal(first.name, "Plagued Ghoul");
        assert.equal(runicPower(knight).value, 10, "3 Runic Power spent");
        assert.ok(knight.effects.find(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raiseId === bondOf(first).raiseId), "its carrier on the knight");
        await cast();
        await until(() => !game.actors.has(first.id), "the recast collapses the first ghoul");
        const second = await until(() => raisedOf(knight, "raise-ghoul")[0], "the second ghoul bound");
        assert.notEqual(second.id, first.id);
        // The first corpse has risen already: the recast took the second.
        await until(() => tokenOf(two).document.getFlag(SCOPE, CORPSE_FLAG)?.state === "raised", "the second corpse risen");
        assert.equal(tokenOf(one).document.getFlag(SCOPE, CORPSE_FLAG)?.state, "raised", "the first stays risen");
        assert.lengthOf(raisedOf(knight, "raise-ghoul"), 1, "one of each kind");
        assert.lengthOf(knight.effects.filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === "raise-ghoul"), 1, "one carrier");
      });

      it("refuses Raise Dracolich in words below a Runic Power cap of 15, with nothing spent", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Dracolich", { spells: ["Raise Dracolich"] });
        await sceneWith([{ actor: knight, x: 500, y: 500 }]);
        await bank(knight);
        const spell = knight.items.find(i => i.type === "spell" && i.name === "Raise Dracolich");
        let card = null;
        const said = await warnings(async () => { card = await game.system.azeroth.workflows.castSpell({ actor: knight, spell, dc: 5, targets: [] }); });
        assert.isNull(card ?? null, "no card");
        assert.isTrue(said.some(w => w.includes("below 15")), `refused in words for the cap: ${said.join(" | ")}`);
        assert.equal(runicPower(knight).value, 13, "nothing spent");
      });

      it("Corpse Burst destroys its corpse, and no raise may take it", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Burst", { spells: ["Corpse Burst", "Raise Ghoul"] });
        const body = await corpse("Burst");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: body, x: 700, y: 500, side: "hostile" }]);
        await bank(knight);
        const burst = knight.items.find(i => i.type === "spell" && i.name === "Corpse Burst");
        const unpin = pinDie(20);
        try {
          const going = game.system.azeroth.workflows.castSpell({ actor: knight, spell: burst, dc: 5, targets: [] });
          await chooseAsOffered(burst);
          made.push(await within(going, 30000, "Corpse Burst's cast"));
        } finally { unpin(); }
        await until(() => tokenOf(body).document.getFlag(SCOPE, CORPSE_FLAG)?.state === "destroyed", "the corpse destroyed");
        const rp = runicPower(knight).value;
        const ghoul = knight.items.find(i => i.type === "spell" && i.name === "Raise Ghoul");
        const refused = await within(game.system.azeroth.workflows.castSpell({ actor: knight, spell: ghoul, dc: 5, targets: [] }), 30000, "Raise Ghoul's refusal");
        assert.isNull(refused ?? null, "no corpse that may rise: no cast");
        assert.equal(runicPower(knight).value, rp, "nothing spent");
      });
    });

    describe("door 9: the Deathcharger", function () {
      it("makes a mount spectral, refuses a second working before the Long Rest, then makes it undead and takes Spectral back", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK Steed");
        const worg = await give(knight, "Blackrock worg");
        assert.ok(await pressFeature(knight, "Deathcharger", { answer: f => chooseNamed(f, "Spectral") }), "the working posted its card");
        await until(() => (worg.system.traits ?? []).includes(SPECTRAL_TRAIT), "the worg gains Spectral");
        assert.equal(worg.getFlag(SCOPE, MOUNT_WORK_FLAG)?.option, "spectral");
        assert.isNull(await pressFeature(knight, "Deathcharger", { ms: 4000 }), "a second working before the Long Rest is refused");
        await knight.longRest();
        assert.ok(await pressFeature(knight, "Deathcharger", { answer: f => chooseNamed(f, "Undead") }), "after the rest it works again");
        await until(() => (worg.system.traits ?? []).includes("Deathless"), "the worg gains Deathless");
        assert.notInclude(worg.system.traits, SPECTRAL_TRAIT, "Spectral comes back off");
        assert.include(worg.system.traits, "Steadfast", "and its own Steadfast stays");
        assert.deepEqual(worg.getFlag(SCOPE, MOUNT_WORK_FLAG)?.added, ["Deathless"], "only what this feature gave it");
      });

      it("a Spectral mount's dismiss or call is a Half-Action in a fight", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK Spectral");
        const foe = await makeNpc("Kobold");
        const worg = await give(knight, "Blackrock worg");
        await worg.update({ "system.traits": [...worg.system.traits, SPECTRAL_TRAIT] });
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
        const combat = await fightWith([knight, foe]);
        const mine = await freshTurn(knight, 2);
        assert.isTrue(await spectralMove(knight, worg), "the call is paid");
        await until(() => mine.budget?.halfActions === 1, "one Half-Action spent");
        await combat.delete();
      });
    });

    describe("Unholy Lore (O-343)", function () {
      it("embeds Death Coil on the knight, flagged with the feature, outside the spells known", async function () {
        this.timeout(60000);
        const knight = await knightWith("ZZ DK Lore", { level: 1 });
        const lore = await until(() => featureNamed(knight, "Unholy Lore"), "Unholy Lore granted");
        const coil = await until(() => knight.items.find(i => i.type === "spell" && i.name === "Death Coil"), "Death Coil embedded");
        assert.equal(coil.getFlag(SCOPE, "spellFrom"), lore.id, "the feature taught it");
      });
    });

    describe("the F2 review's findings", function () {
      it("must-fix 1: two bare spends at once with one rune left spend one rune and one Half-Action", async function () {
        this.timeout(120000);
        const knight = await knightWith("ZZ DK One Rune");
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 900, y: 500, side: "hostile" }]);
        const blade = knight.items.find(i => i.name === "Greatsword");
        // Through the one writer (the census holds `module/` to it): four inscribed, three spent.
        assert.isTrue((await inscribeRunes(knight, blade, { blood: 4, frost: 0 })).ok, "inscribed");
        await until(() => runes(knight).value === 4, "four runes");
        await spendRunesOn(knight, { kind: "any", count: 3 });
        await until(() => runes(knight).value === 1, "one unspent rune");
        const combat = await fightWith([knight, foe]);
        const mine = await freshTurn(knight, 2);
        const [x, y] = await Promise.all([spendRuneBare(knight), spendRuneBare(knight)]);
        assert.equal([x, y].filter(Boolean).length, 1, "one spend paid");
        await until(() => runes(knight).value === 0, "the one rune spent");
        assert.equal(mine.budget?.halfActions, 1, "and one Half-Action, never two");
        await combat.delete();
      });

      it("must-fix 2: a withdrawn Plague hit gives its rune back, takes its Runic Power off, and the disease comes off", async function () {
        this.timeout(180000);
        const knight = await knightWith("ZZ DK Refund", { level: 9 });
        const foe = await makeNpc("Kobold");
        await sceneWith([{ actor: knight, x: 500, y: 500 }, { actor: foe, x: 600, y: 500, side: "hostile" }]);
        const blade = knight.items.find(i => i.name === "Greatsword");
        assert.isTrue((await inscribeRunes(knight, blade, { blood: 2, frost: 2 })).ok, "inscribed");
        await until(() => runes(knight).value === 4, "four runes");
        // The attack through the dialog, its Frost Fever line ticked.
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "always");
        const sheet = await openSheet(knight);
        const unpin = pinDie(20);
        canvas.tokens.setTargets([tokenOf(foe).id]);
        let card;
        try {
          sheet.changeTab("combat", "primary");
          await settle();
          const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === knight.id && m.flags?.[SCOPE]?.kind === "attack");
          sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${blade.id}"] [data-action="rollAttack"]`).click();
          const dialog = await dialogFor(knight, 8000);
          assert.ok(dialog, "the attack dialog opened");
          const line = dialog.element.querySelector('input[name="rider-plague-frost-fever"]');
          assert.ok(line && !line.disabled, "the Frost Fever line is open");
          line.checked = true;
          const select = dialog.element.querySelector('select[name="extraWeapon"]');
          if (select && !select.value) {
            const first = [...select.options].find(o => o.value && !o.disabled);
            if (first) { select.value = first.value; select.dispatchEvent(new Event("change", { bubbles: true })); }
          }
          const roll = dialog.element.querySelector('button[data-action="roll"]');
          await until(() => !roll.disabled, "the Roll button enabled", 5000);
          roll.click();
          [card] = await posted;
          made.push(card);
        } finally {
          unpin();
          canvas.tokens.setTargets([]);
          await sheet.close();
          await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
        }
        const theirs = tokenOf(foe).actor;
        await until(() => theirs.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "Frost Fever laid");
        await until(() => runes(knight).value === 3 && runicPower(knight).value === 4, "a rune spent for 4 Runic Power");
        // The two doors a Parry withdraws a hit through (`applications/actions.mjs`'s Parry).
        const mark = { name: "Parry", halve: false, amount: null, negate: true, reaction: "parry", messageId: card.id };
        await annotateMitigation({ messageId: card.id, index: 0, mark, reaction: "parry" });
        await withdrawHit(theirs, { messageId: card.id, index: 0 });
        await until(() => runes(knight).value === 4, "the rune is given back");
        await until(() => runicPower(knight).value === 0, "and the Runic Power it gave comes back off");
        await until(() => !theirs.effects.some(e => e.flags?.[SCOPE]?.tick?.plague === "frostFever"), "the disease comes off: the hit never landed");
      });

      it("should-fix 3: a Long Rest leaves a Versatile weapon's two-handed count and opens the window", async function () {
        this.timeout(90000);
        const knight = await makeCharacter({ name: "ZZ DK Versatile F3", classes: [["Death Knight", 5]], race: "Human", weapons: ["Longsword"], abilities: { str: 16, cha: 16 } });
        const sword = await until(() => knight.items.find(i => i.name === "Longsword"), "the longsword");
        await sword.update({ "system.rarity": "rare", "system.equipped": true });
        await until(() => knight.readyWeapons().some(w => w.id === sword.id), "the longsword wielded");
        assert.isTrue((await inscribeRunes(knight, sword, { blood: 2, frost: 2, grip: "two" })).ok, "inscribed at the two-handed count");
        await until(() => runes(knight).value === 4, "four runes");
        await spendRunesOn(knight, { kind: "any", count: 1 });
        await until(() => runes(knight).value === 3, "three of four unspent");
        await knight.longRest();
        await until(() => runes(knight).value === 4, "the rest refills the rune");
        assert.equal(sword.system.runes.grip, "two", "the two-handed count stands until the next inscription");
        assert.isTrue(knight.getFlag(SCOPE, "inscription")?.open === true, "the window to inscribe is open");
        await knight.shortRest({});
        assert.isTrue(knight.getFlag(SCOPE, "inscription")?.open === true, "a Short Rest closes nothing");
      });

      it("should-fix 5: Desecration with no token on the scene is refused before anything is spent", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK No Ground");
        const other = await makeNpc("Kobold");
        await sceneWith([{ actor: other, x: 500, y: 500, side: "hostile" }]);
        await bank(knight);
        assert.isNull(await pressFeature(knight, "Desecration", { ms: 4000 }), "no card");
        assert.equal(runicPower(knight).value, 13, "nothing spent");
      });

      it("should-fix 4: a rune spend and a pool write made at once both land", async function () {
        this.timeout(90000);
        const knight = await knightWith("ZZ DK Queue");
        const blade = knight.items.find(i => i.name === "Greatsword");
        assert.isTrue((await inscribeRunes(knight, blade, { blood: 2, frost: 2 })).ok, "inscribed");
        await until(() => runes(knight).value === 4, "four runes");
        await bank(knight, 6);
        const rp = runicPower(knight);
        // A Runic Power price (2) beside a rune's gain (+4): queued, both land and neither is lost.
        await Promise.all([knight.updatePool({ itemId: rp.itemId, kind: "momentum", value: 4 }), spendRunesOn(knight, { kind: "any", count: 1 })]);
        await until(() => runes(knight).value === 3, "the rune spent");
        assert.equal(runicPower(knight).value, 8, "4 after the price, then 4 more for the rune: the queue kept both");
      });
    });
  });
}
