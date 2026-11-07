/**
 * **HEX AND POLYMORPH, LIVE** (D-808; the lead, 2026-11-06): a shape laid on a
 * creature by somebody else's failed Test, driven through the real doors - the
 * Spells tab's Cast, a feature's Use on the sheet, the card's own Resist row, an
 * attack card's Apply, the Stop on the Spells tab - with the die pinned.
 *
 * - Hex from the shaman's sheet at an UNLINKED token, a failed Spirit Test: the token
 *   is 14 §15's Frog at the Tiny footprint with its centre held, the Speed 10, its own
 *   Defense, a line in chat; the world actor and its other token untouched;
 * - the frog's attack refused in words with its Half-Action kept, in a fight;
 * - damage from an attack card's Apply ends it, the token comes back, and the
 *   shaman's Sustain ends with it;
 * - a passed Test lays nothing; the shaman's Stop ends the frog through the
 *   Sustain's own sweep;
 * - Polymorph from the mage's sheet at a player's character: the Rabbit, the cast,
 *   the Use and the Parry refused, and the GM's query judging the asker.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.forced-shapes`. Every document a test
 * makes is deleted in `after`.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, pinDie, quietScrollingText, settle, tokenData, tokenDrawn, untilHook, warnings, giveTurn, cardOf, fromPack } from "./fixtures.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { targetSnapshots } from "../applications/roll-dialog.mjs";
import { FORCED_SHAPE_QUERY } from "../documents/shapes.mjs";
import { FORCED_SPEED, RESTORE_FLAG } from "../rules/shapes.mjs";
import { tokenFor } from "../rules/bestiary-art.mjs";
import { checkText } from "./geometry.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const FROG = () => tokenFor("Frog");
const RABBIT = () => tokenFor("Rabbit");
const parsed = message => new DOMParser().parseFromString(message.content, "text/html");
const spellNamed = (actor, name) => actor.items.find(i => i.type === "spell" && i.name === name) ?? null;
const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const sustains = (actor, name) => (actor.getFlag("azeroth-rpg", "sustaining") ?? []).some(s => s?.name === name);
const forcedCards = () => game.messages.filter(m => m.getFlag("azeroth-rpg", "kind") === "forcedShape");

/** The roll dialog skipped (the setting is the STRING "skip"), the die pinned. */
async function pressed(face, fn) {
  const before = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
  await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  try { return await fn(); } finally {
    unpin();
    await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, before);
  }
}

/** A token's stored appearance and the centre it holds, off its SOURCE (D-669). */
function appearance(token) {
  const s = token._source;
  const grid = token.parent.grid.size;
  return { width: s.width, height: s.height, src: s.texture?.src ?? null, centre: { x: s.x + (s.width * grid) / 2, y: s.y + (s.height * grid) / 2 } };
}

/**
 * A scene at five feet a square, viewed, with the placements as tokens: a
 * character's linked, a creature's UNLINKED where `link` is false - each its own
 * synthetic actor, as a GM's ghouls are.
 */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Forced Shapes Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly", link = true } of placements) {
    await actor.update({ "prototypeToken.actorLink": link });
    data.push(await tokenData(actor, { x, y, actorLink: link, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"] }));
  }
  const created = await scene.createEmbeddedDocuments("Token", data);
  // EACH PLACEMENT'S OWN TOKEN, never the answer's order: run straight after the
  // animation batch, the create answered [priest, mage] for [mage, priest] and
  // [?, shaman, ?] for [shaman, bear, bear], and the mage polymorphed himself.
  const pool = [...created];
  const tokens = placements.map(({ actor, x, y }) => {
    const mine = pool.filter(t => t.actorId === actor.id)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] ?? null;
    if (!mine) throw new Error(`no token was made for ${actor.name} at ${x}, ${y}`);
    pool.splice(pool.indexOf(mine), 1);
    return mine;
  });
  await until(() => tokens.every(t => tokenDrawn(t.object)), "every token drawn");
  await settle();
  return { scene, tokens };
}

/** The windows open now, by id: what a press that posted nothing may have opened instead. */
const openWindows = () => [...foundry.applications.instances.values()].filter(a => a.rendered).map(a => a.id).join(", ") || "none";

/**
 * Press a sheet's control and take the chat card it posts. Where none comes, the
 * error says what the press said and what stood open (CLAUDE.md §14: print the
 * refusal's reason before changing code).
 */
async function cardFrom(actor, control, kind) {
  const posted = untilHook("createChatMessage", 30000, m => m.speaker?.actor === actor.id && m.flags?.["azeroth-rpg"]?.kind === kind);
  let card = null;
  let failure = null;
  const said = await warnings(async () => {
    control.click();
    try {
      [card] = await posted;
    } catch (err) {
      failure = err;
    }
  });
  if (!card) {
    throw new Error(`${failure?.message ?? "no card"}; said: ${said.join(" | ") || "nothing"}; open: ${openWindows()}; fight: ${game.combat?.id ?? "none"} turn ${game.combat?.combatant?.name ?? "-"}`);
  }
  made.push(card);
  return card;
}

/** A weapon from the pack, in hand (`quench-damage.mjs`'s own shape). */
async function arm(actor, name) {
  const doc = await fromPack("azeroth-rpg.weapons", name);
  if (!doc) throw new Error(`the weapons pack holds no "${name}"`);
  const source = doc.toObject();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ ...source, system: { ...source.system, equipped: true } }]);
  await until(() => actor.items.get(item.id)?.system?.equipped === true, `${name} in hand`);
  return actor.items.get(item.id);
}

/** Fill the Mana pool, so a cast or a Use is never refused for its price. */
async function fillMana(actor) {
  const pool = actor.poolSnapshot().find(p => p.name === "mana");
  if (!pool || pool.value >= pool.max) return;
  await actor.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
  await until(() => actor.poolSnapshot().find(p => p.name === "mana")?.value === pool.max, `${actor.name}'s Mana full`);
}

/** Cast a spell from the Spells tab at the tokens targeted, the die pinned. */
async function castFromSheet(actor, spellName, targets, face = 20) {
  await fillMana(actor);
  const spell = spellNamed(actor, spellName);
  canvas.tokens.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  try {
    const cast = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${spell.id}"] [data-action="castSpell"]`);
    if (!cast) throw new Error(`the Spells tab draws no Cast for ${spellName}`);
    return await pressed(face, () => cardFrom(actor, cast, "spell"));
  } finally {
    canvas.tokens.setTargets([]);
    await sheet.close();
  }
}

/** Use a feature from the sheet at the tokens targeted, the die pinned. */
async function useFromSheet(actor, featureName, targets, face = 20) {
  await fillMana(actor);
  const feature = featureNamed(actor, featureName);
  canvas.tokens.setTargets(targets.map(t => t.id));
  const sheet = await openSheet(actor);
  try {
    const use = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${feature.id}"] [data-action="useFeature"]`)
      ?? sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
    if (!use) throw new Error(`the sheet draws no Use for ${featureName}`);
    return await pressed(face, () => cardFrom(actor, use, "feature"));
  } finally {
    canvas.tokens.setTargets([]);
    await sheet.close();
  }
}

/** Press a card's Resist row for its first target, and keep the Resilience card it posts. */
async function resist(card, face) {
  const button = parsed(card).querySelector('[data-action="resistTest"][data-target-index="0"]');
  if (!button) throw new Error("the card drew no Resist row for its target");
  const before = new Set(game.messages.map(m => m.id));
  await pressed(face, () => CARD_ACTIONS.resistTest(button, card));
  const posted = game.messages.filter(m => !before.has(m.id));
  made.push(...posted);
  return posted.find(m => m.flags?.["azeroth-rpg"]?.kind === "resilience") ?? null;
}

export function forcedShapesBatch(context) {
  const { describe, it, before, after, assert } = context;

  describe("Hex and Polymorph lay a form on the creature that fails (D-808)", function () {
    let restoreText = null;
    let shaman = null;
    let bear = null;
    let tokenA = null;
    let tokenB = null;
    let bearCentre = null;
    // The fight the frog's turn and the shaman's blow are made in: inside a fight only its
    // own combatants hold a Foresight reveal (`workflows.mjs#foresightHeld`), so the
    // world's other characters cannot hide the blow's damage.
    let fight = null;

    before(async function () {
      this.timeout(180000);
      restoreText = await quietScrollingText();
      shaman = await makeCharacter({ name: "ZZ FS Shaman", classes: [["Shaman", 3]], spells: ["Hex"] });
      // A Large creature, so the frog's Tiny footprint moves the token; two UNLINKED
      // tokens off one world actor, each its own creature.
      bear = await makeNpc("Black Bear");
      const placed = await sceneWith([
        { actor: shaman, x: 600, y: 600 },
        { actor: bear, x: 1000, y: 600, side: "hostile", link: false },
        { actor: bear, x: 1400, y: 600, side: "hostile", link: false }
      ]);
      [, tokenA, tokenB] = placed.tokens;
      for (const token of [tokenA, tokenB]) {
        assert.equal(token.actorId, bear.id, "a bear's placement is not the bear's token");
        assert.isFalse(token.actorLink, "a bear's token is linked");
      }
      await until(() => spellNamed(shaman, "Hex"), "the shaman's Hex");
    });

    after(async function () {
      this.timeout(180000);
      canvas.tokens?.setTargets?.([]);
      await cleanup();
      await restoreText?.();
    });

    it("Hex from the Spells tab and a failed Spirit Test on the card's own Resist: the unlinked token is the Frog, Tiny, its centre held, Speed 10, its own Defense, said in chat", async function () {
      this.timeout(180000);
      const before = appearance(tokenA);
      assert.equal(before.width, 2, "the bear's token is not Large, so the Tiny footprint would move nothing");
      bearCentre = before.centre;
      const defense = tokenA.actor.system.defense;
      const card = await castFromSheet(shaman, "Hex", [tokenA.object]);
      assert.isTrue(card.flags["azeroth-rpg"].success, "the Casting Test failed");
      assert.isTrue(sustains(shaman, "Hex"), "Hex is Sustained and the shaman holds no Sustain");
      assert.isNull(parsed(card).querySelector('[data-action="applySpellEffect"]'), "Hex's card offers an Apply: the frog is laid by its Test");
      const cardsBefore = forcedCards().length;
      const test = await resist(card, 1);
      assert.isFalse(test?.rolls?.[0]?.outcome?.success, "the Spirit Test passed");
      await until(() => tokenA._source.texture?.src === FROG(), "the token wearing the Frog");
      const after = appearance(tokenA);
      assert.equal(after.width, 1, "not the Tiny footprint");
      assert.deepEqual(after.centre, before.centre, "the centre moved");
      assert.deepEqual(tokenA.getFlag("azeroth-rpg", RESTORE_FLAG), { width: before.width, height: before.height, src: before.src });
      const frog = tokenA.actor;
      assert.equal(frog.shape?.kind, "hexed");
      assert.isTrue(frog.shape.forced);
      assert.isNull(frog.shape.physical, "a forced shape took the block's half");
      assert.equal(frog.system.speed, FORCED_SPEED, "the frog does not move 10 feet");
      assert.equal(frog.system.defense, defense, "the frog took the Frog's Defense rather than keeping its own");
      const effect = frog.effects.find(e => e.getFlag("azeroth-rpg", "shape"));
      assert.equal(effect.showIcon, CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, "the token does not show the effect");
      assert.include(effect.name, "Frog");
      assert.equal(effect.origin, shaman.uuid, "the frog does not answer to its caster");
      assert.isTrue(effect.getFlag("azeroth-rpg", "sustained"));
      await until(() => forcedCards().length === cardsBefore + 1, "the line in chat");
      // The world actor and its OTHER token are untouched: each token is its own creature.
      assert.isNull(bear.shape, "the world actor took the frog");
      assert.isNull(tokenB.actor.shape, "the other token took the frog");
      assert.notEqual(tokenB._source.texture?.src, FROG());
    });

    it("the frog's attack is refused in words and spends nothing, on its own turn in a fight", async function () {
      this.timeout(180000);
      const combat = fight = await Combat.create({});
      made.push(combat);
      await combat.activate();
      await combat.createEmbeddedDocuments("Combatant", [
        { actorId: shaman.id, tokenId: shaman.getActiveTokens(true)[0].id, sceneId: tokenA.parent.id },
        { actorId: bear.id, tokenId: tokenA.id, sceneId: tokenA.parent.id }
      ]);
      const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
      await combat.startCombat();
      await settled;
      await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined), "every budget", 30000);
      const mine = await giveTurn(combat, tokenA.actor);
      await until(() => mine.getFlag("azeroth-rpg", "budget"), "the frog's budget");
      const budget = foundry.utils.deepClone(mine.getFlag("azeroth-rpg", "budget"));
      const count = game.messages.size;
      const sheet = await openSheet(tokenA.actor);
      try {
        const attack = sheet.element.querySelector('[data-action="rollAttack"][data-attack="0"]');
        const parts = [...sheet.element.querySelectorAll("[data-application-part]")].map(p => p.dataset.applicationPart).join(",");
        assert.ok(attack, `the creature's sheet draws no attack row (tab ${sheet.tabGroups?.primary}; parts ${parts}; `
          + `${tokenA.actor.system.attacks?.length ?? "no"} attacks stored; ${sheet.element.querySelectorAll(".azeroth-attack").length} rows; open: ${openWindows()})`);
        const said = await warnings(async () => { attack.click(); await new Promise(r => setTimeout(r, 500)); });
        assert.isTrue(said.some(w => /cannot attack/.test(w)), `the refusal was not said in words: ${said.join(" | ")}`);
      } finally {
        await sheet.close();
      }
      assert.equal(game.messages.size, count, "a refused attack posted a card");
      assert.deepEqual(mine.getFlag("azeroth-rpg", "budget"), budget, "a refused attack spent the frog's budget");
    });

    it("an attack card's Apply ends the frog, the token comes back as it was, and the shaman stops sustaining Hex", async function () {
      this.timeout(180000);
      // The shaman's own Mace, swung from the Combat tab at the frog targeted, on the
      // shaman's own turn in the fight the frog is in.
      const mace = await arm(shaman, "Mace");
      await giveTurn(fight, shaman);
      canvas.tokens.setTargets([tokenA.id]);
      const sheet = await openSheet(shaman);
      let blow = null;
      try {
        const swing = sheet.element.querySelector(`section[data-tab="combat"] [data-item-id="${mace.id}"] [data-action="rollAttack"]`);
        assert.ok(swing, "the Combat tab draws no Attack for the Mace");
        blow = await pressed(20, () => cardFrom(shaman, swing, "attack"));
      } finally {
        canvas.tokens.setTargets([]);
        await sheet.close();
      }
      assert.isAbove(blow.flags["azeroth-rpg"].damageByTarget?.[0]?.damage ?? 0, 0, "the blow carries no damage to apply");
      const health = tokenA.actor.system.health.value;
      const said = await warnings(() => CARD_ACTIONS.applyDamage({ dataset: { targetIndex: "0" } }, blow));
      await until(() => tokenA.actor.system.health.value < health, `the blow landing (said: ${said.join(" | ")})`);
      await until(() => !tokenA.actor.shape, "the frog ending on damage");
      await until(() => tokenA._source.texture?.src !== FROG(), "the token coming back");
      const back = appearance(tokenA);
      assert.equal(back.width, 2, "the bear's footprint did not come back");
      assert.deepEqual(back.centre, bearCentre, "the centre moved on the way back");
      assert.isUndefined(tokenA.getFlag("azeroth-rpg", RESTORE_FLAG), "the original outlived the restore");
      await until(() => !sustains(shaman, "Hex"), "the shaman's Hex Sustain ending with its frog");
      await fight.delete();
      fight = null;
    });

    it("a passed Test lays nothing; a dropped Sustain ends the frog through the Sustain's own sweep", async function () {
      this.timeout(240000);
      const first = await castFromSheet(shaman, "Hex", [tokenB.object]);
      await resist(first, 20);
      await new Promise(r => setTimeout(r, 1000));
      assert.isNull(tokenB.actor.shape, "a passed Test laid the frog");
      assert.notEqual(tokenB._source.texture?.src, FROG());
      // The Stop on the Spells tab, then the same creature hexed and stopped again.
      let sheet = await openSheet(shaman);
      try {
        const stop = sheet.element.querySelector('section[data-tab="spells"] [data-action="endSustain"]')
          ?? sheet.element.querySelector('[data-action="stopSustaining"]');
        assert.ok(stop, "the sheet draws no Stop for Hex");
        stop.click();
        await until(() => !sustains(shaman, "Hex"), "the Sustain ending");
      } finally {
        await sheet.close();
      }
      const second = await castFromSheet(shaman, "Hex", [tokenB.object]);
      await resist(second, 1);
      await until(() => tokenB._source.texture?.src === FROG(), "the second token wearing the Frog");
      sheet = await openSheet(shaman);
      try {
        const stop = sheet.element.querySelector('section[data-tab="spells"] [data-action="endSustain"]')
          ?? sheet.element.querySelector('[data-action="stopSustaining"]');
        stop.click();
      } finally {
        await sheet.close();
      }
      await until(() => !tokenB.actor.shape, "the frog ending with the Sustain");
      await until(() => tokenB._source.texture?.src !== FROG(), "the token coming back");
      assert.equal(tokenB._source.width, 2);
    });
  });

  describe("Polymorph on a player's character, and the GM's query (D-808)", function () {
    let restoreText = null;
    let mage = null;
    let priest = null;
    let player = null;
    let priestToken = null;

    before(async function () {
      this.timeout(180000);
      restoreText = await quietScrollingText();
      mage = await makeCharacter({ name: "ZZ FS Mage", classes: [["Mage", 14]] });
      priest = await makeCharacter({ name: "ZZ FS Priest", classes: [["Priest", 3]], spells: ["Smite"] });
      player = await User.create({ name: "ZZ FS Player", role: CONST.USER_ROLES.PLAYER });
      made.push(player);
      await priest.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
      const placed = await sceneWith([{ actor: mage, x: 600, y: 600 }, { actor: priest, x: 1000, y: 600 }]);
      priestToken = placed.tokens[1];
      assert.equal(priestToken.actorId, priest.id, "the priest's placement is not the priest's token");
      await until(() => featureNamed(mage, "Polymorph"), "the mage's Polymorph");
      await until(() => spellNamed(priest, "Smite"), "the priest's Smite");
      const pool = mage.poolSnapshot().find(p => p.name === "mana");
      await mage.updatePool({ itemId: pool.itemId, kind: pool.kind, value: pool.max });
    });

    after(async function () {
      this.timeout(180000);
      canvas.tokens?.setTargets?.([]);
      await cleanup();
      await restoreText?.();
    });

    it("Polymorph from the mage's sheet and a failed Spirit Test on the card's Resist: the character is the Rabbit, and its cast, its Use and its Parry are refused in words", async function () {
      this.timeout(180000);
      const card = await useFromSheet(mage, "Polymorph", [priestToken.object]);
      assert.isTrue(card.flags["azeroth-rpg"].success, "Polymorph's Casting Test failed");
      assert.equal(card.flags["azeroth-rpg"].featureKey, "polymorph");
      // What happens to the priest's effects while the rabbit is laid, said if the shape is not there.
      const seen = [];
      const deleted = Hooks.on("deleteActiveEffect", (e, options, userId) => {
        if (e.parent?.id === priest.id) seen.push(`deleted ${e.name} [${Object.keys(options ?? {}).join(",")}] by ${userId}`);
      });
      const updated = Hooks.on("updateActiveEffect", (e, change, options, userId) => {
        if (e.parent?.id === priest.id) seen.push(`updated ${e.name} ${JSON.stringify(change).slice(0, 120)} by ${userId}`);
      });
      try {
        await resist(card, 1);
        await until(() => priestToken._source.texture?.src === RABBIT(), "the priest wearing the Rabbit");
        await settle();
      } finally {
        Hooks.off("deleteActiveEffect", deleted);
        Hooks.off("updateActiveEffect", updated);
      }
      const effects = priest.effects.map(e => `${e.name}${e.disabled ? " (off)" : ""}${e.getFlag("azeroth-rpg", "shape") ? " [shape]" : ""}`).join("; ") || "none";
      assert.equal(priest.shape?.kind, "polymorphed", `the priest holds no rabbit: effects ${effects}; seen ${seen.join(" / ") || "nothing"}`);
      assert.equal(priest.system.speed, FORCED_SPEED);
      const mana = priest.poolSnapshot().find(p => p.name === "mana")?.value;
      const count = game.messages.size;
      const sheet = await openSheet(priest);
      try {
        const smite = spellNamed(priest, "Smite");
        const cast = sheet.element.querySelector(`section[data-tab="spells"] [data-item-id="${smite.id}"] [data-action="castSpell"]`);
        assert.ok(cast, "the Spells tab draws no Cast for Smite");
        const said = await warnings(async () => { cast.click(); await new Promise(r => setTimeout(r, 500)); });
        assert.isTrue(said.some(w => /cannot cast/.test(w)), `the cast was not refused in words: ${said.join(" | ")}`);
        const feature = priest.items.find(i => i.type === "feature" && sheet.element.querySelector(`[data-item-id="${i.id}"] [data-action="useFeature"]`));
        if (feature) {
          const use = sheet.element.querySelector(`[data-item-id="${feature.id}"] [data-action="useFeature"]`);
          const refused = await warnings(async () => { use.click(); await new Promise(r => setTimeout(r, 500)); });
          assert.isTrue(refused.some(w => /cannot use a class feature/.test(w)), `the Use was not refused: ${refused.join(" | ")}`);
        }
      } finally {
        await sheet.close();
      }
      assert.equal(game.messages.size, count, "a refused cast or Use posted a card");
      assert.equal(priest.poolSnapshot().find(p => p.name === "mana")?.value, mana, "a refused cast spent Mana");
      // A Parry pressed on an attack card's own row.
      const [target] = targetSnapshots([priestToken.object]);
      const blow = await cardOf("attack", mage, { face: 20, args: { targets: [target] } });
      const said = await warnings(() => CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, blow.message));
      assert.isTrue(said.some(w => /cannot take a Reaction/.test(w)), `the Parry was not refused: ${said.join(" | ")}`);
      // The banner's Leave is a GM's here (the table's override): the rabbit comes off.
      const own = await openSheet(priest);
      try {
        // The banner says the rabbit in words, legibly (D-608).
        const line = own.element.querySelector(".azeroth-shape-line");
        assert.ok(line, "the banner draws no shape line for the rabbit");
        assert.include(line.textContent, "Rabbit");
        assert.deepEqual(checkText(line), [], "the shape line is not legible");
        const leave = own.element.querySelector('[data-action="leaveShape"]');
        assert.ok(leave, "the GM's sheet draws no Leave for the rabbit");
        leave.click();
      } finally {
        await own.close();
      }
      await until(() => !priest.shape, "the GM's Leave");
      await until(() => priestToken._source.texture?.src !== RABBIT(), "the priest's token back");
    });

    it("the GM's query lays the form for the player who owns the creature and failed the Test, and refuses a stranger", async function () {
      this.timeout(180000);
      const card = await useFromSheet(mage, "Polymorph", [priestToken.object]);
      const handler = CONFIG.queries[FORCED_SHAPE_QUERY];
      assert.isFunction(handler, "the query is not registered");
      // Press the Test as the GM with the form's write held off, then hand the
      // Test to the player, who owns the creature, and ask as them.
      const result = await resist(card, 1);
      assert.ok(result, "no Resilience card");
      await until(() => priest.shape?.kind === "polymorphed", "the GM's own press laying the rabbit");
      // Off again, then the player's ask through the handler, judged as theirs.
      await priest.deleteEmbeddedDocuments("ActiveEffect", priest.effects.filter(e => e.getFlag("azeroth-rpg", "shape")).map(e => e.id));
      await until(() => !priest.shape, "the rabbit off");
      await result.update({ author: player.id });
      const stranger = await User.create({ name: "ZZ FS Stranger", role: CONST.USER_ROLES.PLAYER });
      made.push(stranger);
      let refused = null;
      try {
        await handler({ targetUuid: priest.uuid, kind: "polymorphed", messageId: card.id, resultId: result.id }, { user: stranger });
      } catch (err) {
        refused = err;
      }
      assert.ok(refused, "a stranger's ask laid the form");
      assert.isNull(priest.shape);
      const done = await handler({ targetUuid: priest.uuid, kind: "polymorphed", messageId: card.id, resultId: result.id }, { user: player });
      assert.deepEqual(done, { laid: true, reason: null });
      await until(() => priest.shape?.kind === "polymorphed", "the player's rabbit");
      await until(() => priestToken._source.texture?.src === RABBIT(), "the token wearing it");
      // And through the socket: the GM's own query reaches the registered handler.
      await priest.deleteEmbeddedDocuments("ActiveEffect", priest.effects.filter(e => e.getFlag("azeroth-rpg", "shape")).map(e => e.id));
      await until(() => !priest.shape, "the rabbit off again");
      await result.update({ author: game.user.id });
      const viaSocket = await game.user.query(FORCED_SHAPE_QUERY, { targetUuid: priest.uuid, kind: "polymorphed", messageId: card.id, resultId: result.id }, { timeout: 15000 });
      assert.deepEqual(viaSocket, { laid: true, reason: null });
      await until(() => priest.shape?.kind === "polymorphed", "the rabbit through the socket");
    });
  });
}
