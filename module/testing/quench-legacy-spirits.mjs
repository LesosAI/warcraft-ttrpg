/**
 * **THE LEGACY BRANCHES' SPIRITS, LIVE** (the approved plan's phase B3). The Legacy
 * talents' ROWS land in phase B6, so each door is driven here through what Foundry
 * already holds - a character at 0 Health, the combat tracker's own turn, the gnome's
 * Blueprint (whose rows are B2's) building the Cloaking Device and the Recombobulator,
 * a creature's own attack row, a Region placed as a card places one, and the doors'
 * own state laid as the Use lays it - and B8 presses each Legacy talent from the
 * sheet's own control once its row exists:
 *
 * - door 10: a Dying character's turn takes one Half-Action and no Reaction, its
 *   prompt offers Reach at DC 18 to its owner, and the sheet's Attack and a Use are
 *   refused in words with nothing spent; the second Death Step posts 06 §10's offer,
 *   taken through the one chooser; Ethereal Form halves a physical blow and refuses
 *   an attack;
 * - door 11: the third Death Step is recorded at the fight's moment, and Burial
 *   Ground's area at rank 2 spares a Dying ally the step an attack adds;
 * - door 12: a floor an aura lays holds an ally at 1 by any source, and its end
 *   restores nothing;
 * - door 25: the Cloaking Device hides the gnome and an ally, even while observed, and
 *   an attack ends the gnome's alone; the Recombobulator ends the condition on the
 *   creature touched; Drawn Across's state halves a creature's own attack; a thrall
 *   takes its owner's side and Initiative and is given back when the Charmed ends;
 * - the lead's rulings: a construct's Cutting Gear, pressed on its own sheet, ends one
 *   Entangled once a turn with no action; a standing trap springs with no fight
 *   running; a Poisoned keeps the highest DC its layers name.
 *
 * - the B3 fix run: a Dying body's Stand refused at the sheet's own Prone control and its
 *   walk on its turn; a heal that also burns refused under Ethereal Form from the Spells
 *   tab; a thrall bound only on the named creature's failure, one token of an unlinked
 *   pack alone, through D-643's bond (the lead: *"Have the creature stat block for the
 *   token set to bound to the player by GM who can then remove it"*), released from its
 *   banner; the third Death Step the last; Guard refused from the realm; two floors both
 *   marked; a GM-hidden token springing no trap; Ancestral Spirit's return on an
 *   unlinked character's own token actor, its defeat taken off.
 *
 * Written in B3 and its fix run and NOT run there (the brief: offline, Vitest only). Run
 * alone with `QUENCH_BATCH=azeroth-rpg.legacy-spirits`. Every document a test makes is
 * deleted in `after`.
 */

import { cleanup, drainAreaWork, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, PACK_FOR, fromPack, tokenDrawn, quietScrollingText, tokenData } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { cancelPick } from "../canvas/place.mjs";
import { placeArea } from "../canvas/regions.mjs";
import { TRAP_FLAG, trapArea } from "../rules/traps.mjs";
import { ESCAPE_FLAG, SHED_DC_FLAG, featureEscapeRecord } from "../rules/escapes.mjs";
import { CONCEAL_FLAG, HALVES_DEALT_FLAG, THRALL_FLAG } from "../rules/legacy-uses.mjs";
import { RETURNED_FLAG, THIRD_STEP_FLAG } from "../rules/death-holds.mjs";
import { FLOOR_FLAG } from "../rules/blow-doors.mjs";
import { healthFloorFlag, aura } from "../rules/auras.mjs";
import { cleanAreaTick } from "../rules/area-ticks.mjs";
import { onUseMageWarlock } from "../rules/class-talents.mjs";
import { layEthereal } from "../effects/spirit-realm.mjs";
import { layState } from "../effects/talent-states.mjs";
import { bindThrall, reviveCreature } from "../effects/legacy-uses.mjs";
// The B3 fix run: the thrall's bond (the lead's ruling of 2026-10-22).
import { bondOf } from "../documents/bound.mjs";
import { inflictCondition } from "../effects/inflict.mjs";
import { applyCondition, minuteSpan } from "../effects/durations.mjs";
import { AZEROTH } from "../config.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 15000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const workflows = () => game.system.azeroth.workflows;
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const textOf = message => (parsed(message).body.textContent ?? "").replace(/\s+/g, " ");
const itemNamed = (actor, name) => actor.items.find(i => i.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const tokenOf = actor => actor.getActiveTokens(true)[0] ?? null;
const health = actor => actor.system?.health?.value ?? 0;

/** A scene at five feet a hundred-pixel square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements, { name = "ZZ Legacy Spirits Scene" } = {}) {
  const scene = await Scene.create({ name, width: 4000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  await until(() => canvas.scene?.id === scene.id && canvas.ready, `${name} viewed`);
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await tokenData(actor, { x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] })));
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  await until(() => placements.every(p => tokenDrawn(p.actor.getActiveTokens(true)[0])), "every token drawn, its texture loaded and its arrows made");
  await settle();
  return scene;
}

/** A started fight holding these actors, by their tokens, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => {
    const token = a.getActiveTokens?.(true)?.[0]?.document ?? null;
    return token ? { actorId: a.id, tokenId: token.id, sceneId: token.parent.id } : { actorId: a.id };
  }));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every combatant's own budget landing", 30000);
  return combat;
}

/** Every warning said while `fn` runs, swallowed, until `done` holds. */
async function hear(fn, { done = said => said.length > 0, ms = 15000 } = {}) {
  const own = Object.prototype.hasOwnProperty.call(ui.notifications, "warn");
  const held = ui.notifications.warn;
  const said = [];
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    await fn();
    await until(() => done(said), "a refusal in words", ms);
    await settle();
    await sleep(250);
  } finally {
    if (own) ui.notifications.warn = held;
    else delete ui.notifications.warn;
  }
  return said;
}

/** The control the Combat tab draws for one feature, re-queried at every press. */
const useControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] [data-item-id="${item.id}"] [data-action="useFeature"]`)
  ?? sheet.element?.querySelector(`[data-item-id="${item.id}"] [data-action="useFeature"]`) ?? null;

/** The Attack the Combat tab draws for one weapon in hand. */
const attackControl = (sheet, item) => () => sheet.element?.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${item.id}"] [data-action="rollAttack"]`) ?? null;

/** A creature's own attack row, the block's first. */
const clawsControl = sheet => () => sheet.element?.querySelector('[data-action="rollAttack"][data-attack="0"]') ?? null;

/** A creature's ability Use on its Traits tab, by the row's index. */
const abilityControl = (sheet, index) => () => sheet.element?.querySelector(`[data-action="useAbility"][data-list="creatureAbilities"][data-index="${index}"]`) ?? null;

/** Press a sheet's control, the die pinned, and take the card it posts. */
async function pressForCard(control, speaker, face = 15, { kind = null, ms = 30000 } = {}) {
  const el = typeof control === "function" ? control() : control;
  if (!el) throw new Error(`no control to press on ${speaker.name}'s sheet`);
  const posted = untilHook("createChatMessage", ms, m => m.speaker?.actor === speaker.id && (!kind || m.flags?.["azeroth-rpg"]?.kind === kind));
  const unpin = pinDie(face);
  try {
    el.click();
    // **EXTRA ATTACK ASKS FOR THE SECOND ROLL'S WEAPON** (02 SS6, D-704): a character holding it is
    // always shown the roll dialog, whatever the skip setting says, and Roll stays greyed until a
    // weapon is picked. An attack pressed from the sheet answers it, as the player would.
    if (kind === "attack") {
      const dialog = await until(() => [...foundry.applications.instances.values()]
        .find(a => String(a.id ?? "").startsWith("azeroth-roll-") && a.rendered) ?? null, "the attack's roll dialog", 8000).catch(() => null);
      if (dialog) {
        const second = dialog.element.querySelector('select[name="extraWeapon"]');
        if (second) {
          second.value = [...second.options].find(o => o.value)?.value ?? "";
          second.dispatchEvent(new Event("change", { bubbles: true }));
        }
        dialog.element.querySelector('button[data-action="roll"]')?.click();
      }
    }
    const [card] = await posted;
    made.push(card);
    return card;
  } finally {
    unpin();
  }
}

/** A weapon from the pack, in hand. */
async function wield(actor, name) {
  const source = (await fromPack(PACK_FOR.weapon, name)).toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} in hand`);
  return actor.items.get(item.id);
}

/** The chooser an item (or a `{id}`) opened, once rendered. */
async function chooser(item, ms = 10000) {
  return until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `${item.name ?? item.id}'s chooser`, ms);
}

/** Pick an option by name in the chooser and press its button. */
async function pick(app, names) {
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
    if (!option) throw new Error(`the chooser offers no ${names[0]}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) {
      const label = box.closest("label")?.textContent?.trim() ?? "";
      box.checked = names.some(n => label.startsWith(n));
    }
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, "the chooser to close");
}

/** A gnome with Mekkatorque's Blueprint taken, waiting for its Use (B2's `gnomeWith`). */
async function blueprintGnome(name, extra = {}) {
  const gnome = await makeCharacter({ name, race: "Gnome", classes: [["Rogue", 9]], ...extra });
  const talent = await until(() => talentNamed(gnome, "Mekkatorque's Blueprint"), "Mekkatorque's Blueprint on the sheet");
  await talent.update({ "system.taken": 1 });
  await until(() => featureNamed(gnome, "Mekkatorque's Blueprint"), "the Blueprint's Use granted");
  await settle();
  return gnome;
}

/** A gadget built through the Blueprint, answering its chooser, and its own feature. */
async function buildGadget(gnome, gadget) {
  const blueprint = featureNamed(gnome, "Mekkatorque's Blueprint");
  const pending = workflows().useFeature({ actor: gnome, item: blueprint });
  await pick(await chooser(blueprint), [gadget]);
  const card = await pending;
  if (card) made.push(card);
  return until(() => gnome.items.find(i => i.type === "feature" && i.name === gadget && i.getFlag("azeroth-rpg", "feature")?.gadget), `${gadget} built`);
}

export function legacySpiritsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Legacy branches' spirits (B3)", function () {
    let restore = null;
    let wasViewing = null;
    let quietText = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      quietText = await quietScrollingText();
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
    });
    after(async function () {
      this.timeout(180000);
      cancelPick();
      canvas?.tokens?.setTargets?.([]);
      for (const app of [...foundry.applications.instances.values()]) {
        const id = String(app.id ?? "");
        if (id.startsWith("azeroth-roll-") || id.startsWith("azeroth-choose-")) await app.close().catch(() => {});
      }
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      await quietText?.();
      for (const doc of made.filter(d => d instanceof Combat && game.combats.has(d.id))) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    /* ---- Door 10 ----------------------------------------------------------- */

    it("DOOR 10: a Dying character's turn takes one Half-Action and no Reaction, and its prompt offers Reach at DC 18 to its owner", async function () {
      this.timeout(180000);
      const dying = await makeCharacter({ name: "ZZ LS Dying", classes: [["Warrior", 5]] });
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the character at 0 Health");
      await sceneWith([{ actor: dying, x: 1000, y: 1000 }]);
      const before = game.messages.size;
      const combat = await fightWith([dying]);
      const reach = await until(() => game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.purpose === "reach"), "the Spirit Realm's prompt", 30000);
      made.push(reach);
      const mine = combat.combatants.find(c => c.actorId === dying.id);
      assert.equal(mine.budget.halfActions, 1, "the realm's turn holds more than one Half-Action");
      assert.equal(mine.budget.reactions, 0, "the realm's turn holds a Reaction");
      const test = parsed(reach).querySelector('[data-action="resistTest"][data-purpose="reach"]');
      assert.ok(test, "the prompt offers no Reach");
      assert.equal(Number(test.dataset.dc), 18);
      assert.equal(test.dataset.resilience, "spirit");
      assert.equal(parsed(reach).querySelector(".azeroth-card-actions")?.dataset.reactionOwner, dying.uuid, "the prompt does not name its owner as its audience");
      // The Death Step's own prompt came first (06 §10: *in this order*).
      const order = game.messages.contents.slice(before).map(m => m.flags?.["azeroth-rpg"]?.purpose).filter(Boolean);
      assert.isBelow(order.indexOf("deathStep"), order.indexOf("reach"), `the prompts came out of order: ${order.join(", ")}`);
      // Reach, pressed: a Spirit Resilience Test, and the realm's Half-Action spent.
      const unpin = pinDie(20);
      try {
        await CARD_ACTIONS.resistTest(test, game.messages.get(reach.id));
      } finally {
        unpin();
      }
      await until(() => mine.budget.halfActions === 0, "Reach's Half-Action spent");
    });

    it("DOOR 10: from the Spirit Realm the sheet's Attack and a Use are refused in words, and nothing is spent", async function () {
      this.timeout(180000);
      // Level 4: a level 5 Warrior holds Extra Attack and is always shown the roll dialog first
      // (D-704), which would stand between the press and the refusal this test reads.
      const dying = await makeCharacter({ name: "ZZ LS Spirit", classes: [["Warrior", 4]] });
      const sword = await wield(dying, "Longsword");
      const foe = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: dying, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the character at 0 Health");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(dying);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const before = game.messages.size;
        const said = await hear(async () => attackControl(sheet, sword)()?.click());
        const words = game.i18n.format("AZEROTH.Spirit.Refuse.Attack", { name: dying.name });
        assert.isTrue(said.includes(words), `the attack's refusal: ${JSON.stringify(said)}`);
        assert.equal(game.messages.size, before, "a refused attack posted a card");
        // A Use from the same tab: every feature but a way back.
        const feature = dying.items.find(i => i.type === "feature" && useControl(sheet, i)());
        if (feature) {
          const heard = await hear(async () => useControl(sheet, feature)()?.click());
          assert.isTrue(heard.includes(game.i18n.format("AZEROTH.Spirit.Refuse.Feature", { name: dying.name })), `the Use's refusal: ${JSON.stringify(heard)}`);
        }
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
    });

    it("DOOR 10: the second Death Step posts the offer to the owner; Take, through the one chooser, costs the Corruption and stands the character at 1", async function () {
      this.timeout(180000);
      const dying = await makeCharacter({ name: "ZZ LS Offer", classes: [["Warrior", 5]] });
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the character at 0 Health");
      const before = game.messages.size;
      await dying.takeDeathStep();
      assert.isUndefined(game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.purpose === "spiritOffer"), "the offer came at the first step");
      await dying.takeDeathStep();
      const offer = await until(() => game.messages.contents.slice(before).find(m => m.flags?.["azeroth-rpg"]?.purpose === "spiritOffer"), "the offer's prompt");
      made.push(offer);
      const take = parsed(offer).querySelector('[data-action="takeOffer"]');
      assert.ok(take, "the offer has no Take");
      assert.isNull(parsed(offer).querySelector('[data-action="resistTest"]'), "the offer carries a Test");
      const track = Object.keys(AZEROTH.corruptionTracks)[0];
      const was = dying.system.corruption?.[track] ?? 0;
      const pending = CARD_ACTIONS.takeOffer(take, game.messages.get(offer.id));
      const id = { id: `offer-${dying.id}`, name: "offer" };
      await pick(await chooser(id), [game.i18n.localize(AZEROTH.corruptionTracks[track])]);
      await pick(await chooser(id), [game.i18n.format("AZEROTH.Spirit.Offer.Price2", { n: 2 })]);
      await pending;
      await until(() => health(dying) === 1 && dying.system.deathSteps === 0, "the character standing at 1 with the steps cleared");
      assert.equal(dying.system.corruption[track], was + 2, "the price was not paid");
    });

    it("DOOR 10: Ethereal Form halves the physical share of a blow at the one damage door, and refuses the attack", async function () {
      this.timeout(120000);
      const shaman = await makeCharacter({ name: "ZZ LS Ethereal", classes: [["Shaman", 7]] });
      const sword = await wield(shaman, "Longsword");
      const foe = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: shaman, x: 1000, y: 1000 }, { actor: foe, x: 1100, y: 1000, side: "hostile" }]);
      await layEthereal(shaman, { source: "Ethereal Form", span: null });
      await until(() => shaman.effects.some(e => e.flags?.["azeroth-rpg"]?.ethereal), "the ethereal state");
      const was = health(shaman);
      await shaman.applyDamage(9, { struck: true, type: "physical" });
      await until(() => health(shaman) === was - 4, "nine physical halved to four");
      const mid = health(shaman);
      await shaman.applyDamage(5, { struck: true, type: "fire" });
      await until(() => health(shaman) === mid - 5, "fire whole");
      canvas.tokens.setTargets([tokenOf(foe).id]);
      const sheet = await openSheet(shaman);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const said = await hear(async () => attackControl(sheet, sword)()?.click());
        assert.isTrue(said.includes(game.i18n.format("AZEROTH.Ethereal.Refuse.Attack", { name: shaman.name, source: "Ethereal Form" })), `no refusal: ${JSON.stringify(said)}`);
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
    });

    /* ---- Door 11 ----------------------------------------------------------- */

    it("DOOR 11: the third Death Step is recorded at the fight's moment, and Burial Ground's area at rank 2 spares a Dying ally the step an attack adds", async function () {
      this.timeout(240000);
      const shaman = await makeCharacter({ name: "ZZ LS Burial", classes: [["Shaman", 7]] });
      const dying = await makeCharacter({ name: "ZZ LS Buried", classes: [["Warrior", 5]] });
      const scene = await sceneWith([{ actor: shaman, x: 600, y: 1000 }, { actor: dying, x: 1000, y: 1000 }]);
      const combat = await fightWith([shaman, dying]);
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the ally at 0 Health");
      // Burial Ground at rank 2's area, as its card places it.
      const tick = cleanAreaTick(JSON.parse(JSON.stringify(onUseMageWarlock({
        areaTick: { who: "ally", rounds: 10, remains: [{ who: "ally", boon: "resilience" }], atRank: [{ rank: 2, remains: [{ who: "ally", boon: "resilience" }, { who: "ally", noDeathStep: true }] }] }
      }, { rank: 2, tier: 2 }).areaTick)));
      const region = await placeArea({
        areaText: "A 15 ft radius on the ground", name: "ZZ Burial Ground", scene, origin: { x: 1050, y: 1050 }, color: null,
        flags: { cast: foundry.utils.randomID(), caster: shaman.uuid, source: null, areaTick: tick, spell: { name: "Burial Ground", feature: true }, lasts: { rounds: 10 } }
      });
      assert.ok(region, "the area was not placed");
      made.push(region);
      await dying.applyDamage(3, { struck: true, attack: true });
      await sleep(500);
      assert.equal(dying.system.deathSteps, 0, "an attack on the Dying ally inside the area added a Death Step");
      // With the area gone, every attack adds its step, and the third is recorded.
      await region.delete();
      await until(() => !scene.regions.has(region.id), "the area taken up");
      for (let i = 0; i < 3; i++) await dying.applyDamage(1, { struck: true, attack: true });
      await until(() => dying.system.deathSteps === 3, "three Death Steps outside the area");
      const third = dying.getFlag("azeroth-rpg", THIRD_STEP_FLAG);
      assert.equal(third?.combatId, combat.id, "the third step names no fight");
      assert.equal(third?.round, combat.round);
    });

    /* ---- Door 12 ----------------------------------------------------------- */

    it("DOOR 12: a floor an aura lays holds an ally at 1 by any source, and its end restores nothing", async function () {
      this.timeout(120000);
      const ally = await makeCharacter({ name: "ZZ LS Voodoo Ally", classes: [["Warrior", 5]] });
      const row = { key: "ZZ:talent:big-bad-voodoo", group: "talent:big-bad-voodoo", name: "Big Bad Voodoo", origin: ally.uuid, ...aura({ feet: 20, healthFloor: 1 }) };
      // **THE AURA PASS IS THE ONE WRITER OF AURA EFFECTS** (D-755) and lifts one no holder
      // lays - which this hand-laid floor is - so it names a scene the GM is NOT viewing,
      // which no pass over the viewed scene touches (O-142; `auraLaidHere`). Named nowhere,
      // a pass took it under the test (B8b). Big Bad Voodoo's real laying is the Shadow
      // Hunter batch's.
      const elsewhere = await Scene.create({ name: "ZZ LS Voodoo Elsewhere" });
      made.push(elsewhere);
      const [effect] = await ally.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Big Bad Voodoo", img: "icons/svg/aura.svg",
        flags: { "azeroth-rpg": { aura: { key: row.key, group: row.group, source: "Big Bad Voodoo", owner: "ZZ", payload: { healthFloor: 1 }, v: 2, scene: elsewhere.id }, [FLOOR_FLAG]: healthFloorFlag(row, { by: null, name: "Big Bad Voodoo" }) } }
      }]);
      await until(() => ally.effects.has(effect.id), "the floor on the ally");
      await ally.applyDamage(999, { struck: true });
      await until(() => health(ally) === 1, "the ally held at 1");
      assert.isTrue(ally.effects.get(effect.id)?.getFlag("azeroth-rpg", FLOOR_FLAG)?.held === true, "the floor did not record that it held");
      assert.isFalse(ally.effects.get(effect.id)?.getFlag("azeroth-rpg", FLOOR_FLAG)?.noCritical, "the floor refuses a Critical Injury");
      await ally.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      await sleep(500);
      assert.equal(health(ally), 1, "the aura's floor restored Health as it went");
    });

    /* ---- Door 25 ----------------------------------------------------------- */

    it("DOOR 25: the Cloaking Device hides the gnome and an ally within 10 feet, even while observed, and an attack ends the gnome's alone", async function () {
      this.timeout(240000);
      const gnome = await blueprintGnome("ZZ LS Cloaker", { weapons: ["Dagger"] });
      const dagger = await until(() => itemNamed(gnome, "Dagger"), "the dagger");
      await dagger.update({ "system.equipped": true });
      const ally = await makeCharacter({ name: "ZZ LS Cloaked Ally", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Plagued Ghoul");
      // *You and allies within 10 ft*: out of a fight an ally is the Party's (D-755,
      // `countsAsAlly`), and a friendly token nobody put in the Party is not one (B8b).
      for (const a of [gnome, ally]) await a.setParty(true);
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }, { actor: foe, x: 1000, y: 1100, side: "hostile" }]);
      const device = await buildGadget(gnome, "Gnomish Cloaking Device");
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        await pressForCard(useControl(sheet, device), gnome, 15, { kind: "feature" });
        const concealed = actor => actor.effects.find(e => e.flags?.["azeroth-rpg"]?.[CONCEAL_FLAG]) ?? null;
        await until(() => concealed(gnome) && concealed(ally), "both hidden");
        assert.isTrue(gnome.statuses.has("invisible") && ally.statuses.has("invisible"), "the concealment carries no hidden status");
        canvas.tokens.setTargets([tokenOf(foe).id]);
        await pressForCard(attackControl(sheet, dagger), gnome, 15, { kind: "attack" });
        await until(() => !concealed(gnome), "the gnome's concealment ended by the attack");
        assert.ok(concealed(ally), "the ally's ended with the gnome's");
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
    });

    it("DOOR 25: the Recombobulator ends the one condition on the creature touched", async function () {
      this.timeout(240000);
      const gnome = await blueprintGnome("ZZ LS Recombobulator");
      const ally = await makeCharacter({ name: "ZZ LS Recombobulated", classes: [["Warrior", 3]] });
      await sceneWith([{ actor: gnome, x: 1000, y: 1000 }, { actor: ally, x: 1100, y: 1000 }]);
      await applyCondition(ally, "deafened");
      await until(() => ally.statuses.has("deafened"), "the ally Deafened");
      const gadget = await buildGadget(gnome, "Recombobulator");
      canvas.tokens.setTargets([tokenOf(ally).id]);
      const sheet = await openSheet(gnome);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const card = await pressForCard(useControl(sheet, gadget), gnome, 15, { kind: "feature" });
        await until(() => !ally.statuses.has("deafened"), "the condition ended");
        assert.include(textOf(card), game.i18n.format("AZEROTH.Cure.Ended", { target: tokenOf(ally).name, condition: game.i18n.localize(AZEROTH.conditions.deafened) }));
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
    });

    it("DOOR 25: a creature under Drawn Across deals half the damage on its own attack card", async function () {
      this.timeout(180000);
      const target = await makeCharacter({ name: "ZZ LS Drawn Target", classes: [["Warrior", 3]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: target, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      canvas.tokens.setTargets([tokenOf(target).id]);
      const sheet = await openSheet(ghoul);
      try {
        const whole = await pressForCard(clawsControl(sheet), ghoul, 15, { kind: "attack" });
        const full = whole.flags["azeroth-rpg"].damageByTarget?.[0]?.damage ?? null;
        assert.isNumber(full, "the pinned Claws dealt nothing to compare");
        await layState(ghoul, { flag: HALVES_DEALT_FLAG, data: { source: "Drawn Across", by: target.uuid }, name: "ZZ Drawn Across", span: null });
        await until(() => ghoul.effects.some(e => e.flags?.["azeroth-rpg"]?.[HALVES_DEALT_FLAG]), "the halving on the ghoul");
        const halved = await pressForCard(clawsControl(sheet), ghoul, 15, { kind: "attack" });
        const row = halved.flags["azeroth-rpg"].damageByTarget?.[0] ?? null;
        assert.isTrue(row?.dealtHalved === true, "the card does not say the damage was halved");
        assert.isBelow(row.damage, full, "the halving took nothing off the Claws");
      } finally {
        await sheet.close();
        canvas.tokens.setTargets([]);
      }
    });

    it("DOOR 25: a thrall takes its owner's side and Initiative through its bond, and the Charmed's end gives it back", async function () {
      this.timeout(180000);
      const banshee = await makeCharacter({ name: "ZZ LS Banshee", classes: [["Ranger", 9]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: banshee, x: 1000, y: 1000 }, { actor: ghoul, x: 1300, y: 1000, side: "hostile" }]);
      const combat = await fightWith([banshee, ghoul]);
      const thrall = tokenOf(ghoul).actor;
      const ownership = { ...thrall.ownership };
      const { effect, refused } = await bindThrall({ target: thrall, owner: banshee, source: "Thrall of the Banshee", span: minuteSpan(thrall), token: tokenOf(ghoul).document });
      assert.isNull(refused, `the bind was refused: ${refused}`);
      assert.ok(effect, "the thrall was not bound");
      assert.equal(effect.getFlag("azeroth-rpg", THRALL_FLAG)?.ownerUuid, banshee.uuid);
      // The lead (2026-10-22): *"... set to bound to the player by GM"* - D-643's bond, no ownership.
      await until(() => bondOf(thrall)?.kind === "thrall", "the thrall's bond");
      assert.equal(bondOf(thrall).ownerUuid, banshee.uuid);
      assert.deepEqual({ ...thrall.ownership }, ownership, "the thrall's ownership moved");
      await until(() => tokenOf(ghoul).document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY, "the thrall on its owner's side");
      const theirs = combat.combatants.find(c => c.actorId === ghoul.id);
      const mine = combat.combatants.find(c => c.actorId === banshee.id);
      assert.equal(theirs.derivedInitiative, mine.derivedInitiative, "the thrall does not act on its owner's Initiative");
      assert.equal(theirs.side, "friendly");
      await thrall.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      await until(() => tokenOf(ghoul).document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE, "the thrall given back its side");
      await until(() => !bondOf(thrall), "the bond released with the Charmed");
    });

    /* ---- The lead's rulings ------------------------------------------------- */

    it("THE LEAD'S CUTTING GEAR: a construct ends one Entangled from its own sheet once a turn, with no action; the second press that turn is refused in words", async function () {
      this.timeout(180000);
      const construct = await makeNpc("Plagued Ghoul");
      const rows = foundry.utils.deepClone(construct.system.creatureAbilities ?? []);
      rows.push({ name: "Cutting Gear", description: "<p>Once each turn, the construct ends one <strong>Entangled</strong> condition on itself. This takes no action.</p>" });
      await construct.update({ "system.creatureAbilities": rows });
      const index = construct.system.creatureAbilities.findIndex(r => r.name === "Cutting Gear");
      assert.isAtLeast(index, 0, "the ability did not land on the block");
      await sceneWith([{ actor: construct, x: 1000, y: 1000, side: "hostile" }]);
      const combat = await fightWith([construct]);
      await giveTurn(combat, construct);
      const mine = combat.combatants.find(c => c.actorId === construct.id);
      const budget = { ...mine.budget };
      await applyCondition(construct, "entangled");
      await until(() => construct.statuses.has("entangled"), "the construct Entangled");
      const sheet = await openSheet(construct);
      try {
        sheet.changeTab("traits", "primary");
        await settle();
        abilityControl(sheet, index)()?.click();
        await until(() => !construct.statuses.has("entangled"), "the Entangled cut free");
        assert.deepEqual({ halfActions: mine.budget.halfActions, reactions: mine.budget.reactions }, { halfActions: budget.halfActions, reactions: budget.reactions }, "Cutting Gear spent an action");
        await applyCondition(construct, "entangled");
        await until(() => construct.statuses.has("entangled"), "the construct Entangled again");
        const said = await hear(async () => abilityControl(sheet, index)()?.click());
        assert.isTrue(said.includes(game.i18n.format("AZEROTH.CuttingGear.Spent", { name: construct.name, condition: game.i18n.localize(AZEROTH.conditions.entangled) })), `the second press: ${JSON.stringify(said)}`);
        assert.isTrue(construct.statuses.has("entangled"), "the second press cut it free");
      } finally {
        await sheet.close();
      }
    });

    it("THE LEAD'S *Also outside a fight*: a standing trap springs on the first enemy to walk into it with no fight running", async function () {
      this.timeout(180000);
      const rogue = await makeCharacter({ name: "ZZ LS Trapper", classes: [["Rogue", 5]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([{ actor: rogue, x: 600, y: 1000 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }]);
      assert.isNotOk(game.combats.find(c => c.started && c.scene?.id === scene.id), "a fight is running");
      const escape = featureEscapeRecord({ on: "action", resilience: "reflex", dc: "spellDc", banes: 0 }, { condition: "entangled", spellDc: 13, caster: rogue.uuid, source: "Shadow Trap" });
      const region = await placeArea({
        areaText: trapArea(5), name: "ZZ Shadow Trap Outside", scene, origin: { x: 1050, y: 1050 }, color: null,
        flags: { [TRAP_FLAG]: { setter: rogue.uuid, identifier: "shadow-trap", source: "Shadow Trap", condition: "entangled", escape, who: "enemy", setAt: 0 } }
      });
      assert.ok(region, "the trap was not placed");
      made.push(region);
      await tokenOf(ghoul).document.update({ x: 1000, y: 1000 });
      await until(() => ghoul.statuses.has("entangled"), "the trap's Entangled on the enemy, with no fight");
      await until(() => !scene.regions.has(region.id), "the sprung trap taken up");
      assert.equal(ghoul.effects.find(e => e.statuses?.has("entangled"))?.getFlag("azeroth-rpg", ESCAPE_FLAG)?.dc, 13, "the Entangled carries no escape");
    });

    it("THE LEAD'S *Highest DC wins*: a Poisoned keeps the highest shed DC its layers name", async function () {
      this.timeout(120000);
      const victim = await makeCharacter({ name: "ZZ LS Poisoned", classes: [["Warrior", 3]] });
      const by = await makeCharacter({ name: "ZZ LS Poisoner", classes: [["Shaman", 5]] });
      const lay = dc => inflictCondition({ victim, id: "poisoned", value: 1, by, name: victim.name, marks: { [SHED_DC_FLAG]: { dc, source: `ZZ ${dc}` } } });
      const shed = () => victim.effects.find(e => e.statuses?.has("poisoned"))?.getFlag("azeroth-rpg", SHED_DC_FLAG)?.dc ?? null;
      await lay(12);
      await until(() => shed() === 12, "the first layer's DC");
      await lay(14);
      await until(() => shed() === 14, "the higher layer's DC kept");
      await lay(11);
      await sleep(400);
      assert.equal(shed(), 14, "a lower layer wrote its DC over the higher");
    });

    /* ---- The B3 fix run --------------------------------------------------- */

    it("B3 FIX (must-fix 1): a Dying body's Stand is refused at the sheet's own Prone control with nothing spent, and its walk is refused on its turn", async function () {
      this.timeout(240000);
      const dying = await makeCharacter({ name: "ZZ LS Body", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: dying, x: 1000, y: 1000 }]);
      const combat = await fightWith([dying]);
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the character at 0 Health");
      await giveTurn(combat, dying);
      const mine = combat.combatants.find(c => c.actorId === dying.id);
      await applyCondition(dying, "prone");
      await until(() => dying.statuses.has("prone"), "the body Prone");
      const budget = mine.budget.halfActions;
      const sheet = await openSheet(dying);
      try {
        sheet.changeTab("core", "primary");
        await settle();
        const prone = () => sheet.element?.querySelector('section[data-tab="core"] [data-action="toggleCondition"][data-condition="prone"]') ?? null;
        assert.ok(prone(), "the Core tab draws no Prone control");
        const said = await hear(async () => prone()?.click());
        assert.isTrue(said.includes(game.i18n.format("AZEROTH.Spirit.Refuse.Stand", { name: dying.name })), `the Stand's refusal: ${JSON.stringify(said)}`);
        assert.isTrue(dying.statuses.has("prone"), "the Dying body stood up");
        assert.equal(mine.budget.halfActions, budget, "the refused Stand spent the realm's Half-Action");
      } finally {
        await sheet.close();
      }
      // At 0 by a tick a body is never Prone - and still does not walk.
      await dying.toggleStatusEffect("prone", { active: false, free: true });
      await until(() => !dying.statuses.has("prone"), "Prone taken off for nothing");
      const doc = tokenOf(dying).document;
      const was = doc.x;
      const said = await hear(async () => doc.update({ x: was + 100 }));
      assert.isTrue(said.includes(game.i18n.format("AZEROTH.Spirit.Refuse.Move", { name: dying.name })), `the walk's refusal: ${JSON.stringify(said)}`);
      await sleep(400);
      assert.equal(tokenOf(dying).document.x, was, "the Dying body walked");
    });

    it("B3 FIX (must-fix 2): under Ethereal Form a heal that also burns is refused from the Spells tab in words, with no Mana spent", async function () {
      this.timeout(180000);
      const priest = await makeCharacter({ name: "ZZ LS Nova", classes: [["Priest", 9]] });
      const source = (await fromPack(PACK_FOR.spell, "Holy Nova")).toObject();
      const [nova] = await priest.createEmbeddedDocuments("Item", [source]);
      await sceneWith([{ actor: priest, x: 1000, y: 1000 }]);
      await layEthereal(priest, { source: "Ethereal Form", span: null });
      await until(() => priest.effects.some(e => e.flags?.["azeroth-rpg"]?.ethereal), "the ethereal state");
      const mana = () => (priest.poolSnapshot?.() ?? []).find(p => p.name === "mana")?.value ?? null;
      const before = mana();
      const sheet = await openSheet(priest);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        const cast = () => sheet.element?.querySelector(`section[data-tab="spells"] [data-item-id="${nova.id}"] [data-action="castSpell"]`) ?? null;
        assert.ok(cast(), "the Spells tab draws no Cast for Holy Nova");
        const said = await hear(async () => cast()?.click());
        assert.isTrue(said.includes(game.i18n.format("AZEROTH.Ethereal.Refuse.Cast", { name: priest.name, source: "Ethereal Form" })), `Holy Nova was cast: ${JSON.stringify(said)}`);
        assert.equal(mana(), before, "the refused cast spent Mana");
      } finally {
        await sheet.close();
      }
    });

    it("B3 FIX (must-fix 3 and the lead's thrall): only the named creature's failure binds it, one token of an unlinked creature alone, and the GM's Release on its banner ends it", async function () {
      this.timeout(240000);
      const banshee = await makeCharacter({ name: "ZZ LS Thrall Owner", classes: [["Ranger", 9]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([{ actor: banshee, x: 600, y: 1000 }]);
      // Two UNLINKED tokens of one world actor: a pack, as the bestiary places one.
      await ghoul.update({ "prototypeToken.actorLink": false });
      const one = (await tokenData(ghoul, { x: 1000, y: 1000, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE }));
      const two = (await tokenData(ghoul, { x: 1200, y: 1000, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE }));
      const [named, other] = await scene.createEmbeddedDocuments("Token", [one, two]);
      await until(() => named.object && other.object, "both ghouls drawn");
      const { renderTemplate } = foundry.applications.handlebars;
      const row = { sceneId: scene.id, tokenId: named.id, actorId: ghoul.id, name: named.name };
      const content = await renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs", {
        title: "Thrall of the Banshee", targets: [{ ...row, index: 0 }], config: AZEROTH,
        resist: { key: "spirit", label: AZEROTH.resiliences.spirit, dc: 30, targetIndex: "0" }
      });
      const card = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: banshee }), content,
        flags: { "azeroth-rpg": { kind: "feature", targets: [row], thrall: { by: banshee.uuid, ownerName: banshee.name, source: "Thrall of the Banshee", minutes: 1, target: { ...row, actorUuid: named.actor.uuid } } } }
      });
      made.push(card);
      const button = parsed(card).querySelector('[data-action="resistTest"]');
      assert.equal(button?.dataset.targetIndex, "0", "the card's Resist names no creature");
      // A press with only the OTHER ghoul selected, on a button naming nobody, rolls nothing.
      other.object.control({ releaseOthers: true });
      const bare = button.cloneNode();
      delete bare.dataset.targetIndex;
      const said = await hear(async () => CARD_ACTIONS.resistTest(bare, game.messages.get(card.id)));
      assert.isTrue(said.includes(game.i18n.format("AZEROTH.Card.NotNamed", { name: other.actor.name, target: row.name })), `the other ghoul's press: ${JSON.stringify(said)}`);
      assert.isNull(bondOf(other.actor), "the creature nobody named was bound");
      canvas.tokens.releaseAll();
      // The named one fails (a pinned 1 against DC 30) and is bound - its token alone.
      const unpin = pinDie(1);
      try {
        await CARD_ACTIONS.resistTest(button, game.messages.get(card.id));
      } finally {
        unpin();
      }
      await until(() => bondOf(named.actor)?.kind === "thrall", "the named ghoul's bond");
      assert.isTrue(named.actor.statuses.has("charmed"), "the thrall is not Charmed");
      assert.isNull(bondOf(other.actor), "the pack's other token was bound with it");
      assert.isNull(ghoul.getFlag("azeroth-rpg", "bond") ?? null, "the world actor was bound");
      assert.isFalse(other.actorLink, "the pack's tokens were linked");
      assert.equal(other.disposition, CONST.TOKEN_DISPOSITIONS.HOSTILE, "the other ghoul changed sides");
      await until(() => named.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY, "the thrall on its owner's side");
      // The stat block for the token says so, and the GM's Release there ends it.
      const sheet = await openSheet(named.actor);
      try {
        await settle();
        const banner = sheet.element?.textContent ?? "";
        assert.include(banner, game.i18n.format("AZEROTH.Bound.Banner", { owner: banshee.name, kind: game.i18n.localize("AZEROTH.Bound.Kind.Thrall") }));
        sheet.element.querySelector('[data-action="release"]')?.click();
        await until(() => !bondOf(named.actor), "the GM's release");
      } finally {
        await sheet.close();
      }
      await until(() => !named.actor.statuses.has("charmed"), "the Charmed ended with the bond");
      await until(() => named.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE, "its own side given back");
    });

    it("B3 FIX (must-fix 4): the third Death Step is the last - a further step asks nothing and posts nothing, and a healed character takes none", async function () {
      this.timeout(120000);
      const dying = await makeCharacter({ name: "ZZ LS Last Step", classes: [["Warrior", 5]] });
      await dying.update({ "system.health.value": 0, "system.deathSteps": 3 });
      await until(() => dying.system.deathSteps === 3, "three steps taken");
      const before = game.messages.size;
      await dying.takeDeathStep();
      await sleep(300);
      assert.equal(game.messages.size, before, "a fourth step posted a card");
      await dying.update({ "system.health.value": 6, "system.deathSteps": 1 });
      await until(() => health(dying) === 6, "the character healed");
      await dying.takeDeathStep();
      await sleep(300);
      assert.equal(dying.system.deathSteps, 1, "a step was written on a character no longer Dying");
      assert.equal(game.messages.size, before, "a healed character's step posted a card");
    });

    it("B3 FIX (should-fix 1): from the Spirit Realm the Combat tab's Guard is refused in words, nothing spent", async function () {
      this.timeout(180000);
      const dying = await makeCharacter({ name: "ZZ LS Guard", classes: [["Warrior", 5]] });
      await sceneWith([{ actor: dying, x: 1000, y: 1000 }]);
      const combat = await fightWith([dying]);
      await dying.update({ "system.health.value": 0 });
      await until(() => health(dying) === 0, "the character at 0 Health");
      await giveTurn(combat, dying);
      const mine = combat.combatants.find(c => c.actorId === dying.id);
      const budget = mine.budget.halfActions;
      const sheet = await openSheet(dying);
      try {
        sheet.changeTab("combat", "primary");
        await settle();
        const guard = () => sheet.element?.querySelector('section[data-tab="combat"] [data-action="guard"]') ?? null;
        const said = await hear(async () => guard()?.click());
        assert.isTrue(said.includes(game.i18n.format("AZEROTH.Spirit.Refuse.Action", { name: dying.name })), `Guard's refusal: ${JSON.stringify(said)}`);
        assert.isFalse(dying.statuses.has("guarded"), "the Dying body Guarded");
        assert.equal(mine.budget.halfActions, budget, "the refused Guard spent a Half-Action");
      } finally {
        await sheet.close();
      }
    });

    it("B3 FIX (should-fix 2): with Big Bad Voodoo's floor laid first and an Aegis after, a blow held at 1 marks both", async function () {
      this.timeout(120000);
      const ally = await makeCharacter({ name: "ZZ LS Two Floors", classes: [["Warrior", 5]] });
      const row = { key: "ZZ:talent:big-bad-voodoo", group: "talent:big-bad-voodoo", name: "Big Bad Voodoo", origin: ally.uuid, ...aura({ feet: 20, healthFloor: 1 }) };
      // A scene the GM is not viewing, so no aura pass lifts this hand-laid floor (DOOR 12's note).
      const elsewhere = await Scene.create({ name: "ZZ LS Two Floors Elsewhere" });
      made.push(elsewhere);
      const [voodoo] = await ally.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Big Bad Voodoo", img: "icons/svg/aura.svg",
        flags: { "azeroth-rpg": { aura: { key: row.key, group: row.group, source: "Big Bad Voodoo", owner: "ZZ", payload: { healthFloor: 1 }, v: 2, scene: elsewhere.id }, [FLOOR_FLAG]: healthFloorFlag(row, { by: null, name: "Big Bad Voodoo" }) } }
      }]);
      const [aegis] = await ally.createEmbeddedDocuments("ActiveEffect", [{
        name: "ZZ Aegis of the Light", img: "icons/svg/shield.svg",
        flags: { "azeroth-rpg": { [FLOOR_FLAG]: { stay: 1, by: null, name: "Aegis of the Light", held: false, noCritical: true } } }
      }]);
      await until(() => ally.effects.has(voodoo.id) && ally.effects.has(aegis.id), "both floors on the ally");
      await ally.applyDamage(999, { struck: true });
      await until(() => health(ally) === 1, "the ally held at 1");
      await until(() => ally.effects.get(aegis.id)?.getFlag("azeroth-rpg", FLOOR_FLAG)?.held === true, "the Aegis laid second marked as having held");
      assert.isTrue(ally.effects.get(voodoo.id)?.getFlag("azeroth-rpg", FLOOR_FLAG)?.held === true, "the aura's floor unmarked");
    });

    it("B3 FIX (should-fix 6): a token the GM has hidden walks into a standing trap with no fight running and springs nothing", async function () {
      this.timeout(180000);
      const rogue = await makeCharacter({ name: "ZZ LS Hidden Trapper", classes: [["Rogue", 5]] });
      const ghoul = await makeNpc("Plagued Ghoul");
      const scene = await sceneWith([{ actor: rogue, x: 600, y: 1000 }, { actor: ghoul, x: 1400, y: 1000, side: "hostile" }]);
      const escape = featureEscapeRecord({ on: "action", resilience: "reflex", dc: "spellDc", banes: 0 }, { condition: "entangled", spellDc: 13, caster: rogue.uuid, source: "Shadow Trap" });
      const region = await placeArea({
        areaText: trapArea(5), name: "ZZ Shadow Trap Hidden", scene, origin: { x: 1050, y: 1050 }, color: null,
        flags: { [TRAP_FLAG]: { setter: rogue.uuid, identifier: "shadow-trap", source: "Shadow Trap", condition: "entangled", escape, who: "enemy", setAt: 0 } }
      });
      assert.ok(region, "the trap was not placed");
      made.push(region);
      await tokenOf(ghoul).document.update({ hidden: true });
      await until(() => tokenOf(ghoul)?.document?.hidden === true || ghoul.getActiveTokens(false, true)[0]?.hidden === true, "the ghoul hidden by the GM");
      const doc = ghoul.getActiveTokens(false, true)[0];
      const before = game.messages.size;
      await doc.update({ x: 1000, y: 1000 });
      await sleep(1500);
      assert.isFalse(ghoul.statuses.has("entangled"), "a GM-hidden token sprang the trap");
      assert.isTrue(scene.regions.has(region.id), "the trap was taken up for a hidden token");
      assert.equal(game.messages.contents.slice(before).filter(m => (m.content ?? "").includes(doc.name)).length, 0, "the chat named the hidden token");
    });

    it("B3 FIX (should-fix 10): Ancestral Spirit's return writes an unlinked character's own token actor, and takes its defeat off", async function () {
      this.timeout(180000);
      const walker = await makeCharacter({ name: "ZZ LS Walker", classes: [["Shaman", 15]] });
      const fallen = await makeCharacter({ name: "ZZ LS Fallen", classes: [["Warrior", 5]] });
      const scene = await sceneWith([{ actor: walker, x: 600, y: 1000 }]);
      await fallen.update({ "prototypeToken.actorLink": false });
      const [doc] = await scene.createEmbeddedDocuments("Token", [(await tokenData(fallen, { x: 800, y: 1000 }))]);
      const body = doc.actor;
      await body.update({ "system.health.value": 0, "system.deathSteps": 3 });
      await until(() => body.system.deathSteps === 3, "the token's own three steps");
      await body.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED ?? "dead", { active: true });
      const combat = await Combat.create({});
      made.push(combat);
      const [fighter] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: fallen.id, tokenId: doc.id, sceneId: scene.id, defeated: true }]);
      const done = await reviveCreature({ target: body, by: walker, item: { id: null } });
      assert.isTrue(done.risen, "the creature was not called back");
      await until(() => body.system.deathSteps === 0 && health(body) === Math.max(1, Math.floor((body.system.health.max ?? 0) / 2)), "the token's own actor standing");
      await until(() => !body.statuses.has(CONFIG.specialStatusEffects.DEFEATED ?? "dead"), "the dead status taken off");
      await until(() => combat.combatants.get(fighter.id)?.defeated === false, "its combatant's defeat taken off");
      // The once-in-a-life mark is the token's own creature's, never its world actor's.
      assert.ok(body.getFlag("azeroth-rpg", RETURNED_FLAG), "the return left no mark on the creature it called back");
      assert.isNull(fallen.getFlag("azeroth-rpg", RETURNED_FLAG) ?? null, "the world actor was written");
    });
  });
}
