/**
 * **SHAPES ON ONE TOKEN AND ONE SHEET** (02 §7; D-769), inside a live world.
 * Every shift is driven through the real class feature and its chooser where
 * the test is about the door, and through `takeShape` - the one writer - where
 * it is about what the shape does.
 *
 * - the Black Bear taken on the Druid's turn: the token 2×2 in the bear's art
 *   with its centre held, one Half-Action for the shift and no movement charged,
 *   no Opportunity Attack offered, and the sheet reading the physical half with
 *   the Druid's own Health;
 * - the Claws through the weapon door at the form's Strength and Proficiency;
 * - a 7-Mana spell paid in 4 Ferocity; Extra Attack in a form and out of one;
 * - Bear to Wolf restoring from the true original; a hand delete; a new token;
 * - a refused shift leaving nothing; the Avatar ending at a rest and at 0;
 * - Metamorphosis's Ward, Damage Rating and Fel; Chimera's better-of;
 * - migration 0.12.20.
 *
 * Run alone with `QUENCH_BATCH=azeroth-rpg.shapes`. Every document a test makes
 * is deleted in `after`.
 */

import { cleanup, drainAreaWork, fromPack, give, giveTurn, made, makeCharacter, makeNpc, openSheet, pinDie, settle, untilHook, warnings } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { attackWithDialog } from "../applications/actions.mjs";
import { migrate as migrateShapes } from "../migrations/0.12.20-shapes.mjs";
import { RESTORE_FLAG } from "../rules/shapes.mjs";

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

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;
const talentNamed = (actor, name) => actor.items.find(i => i.type === "talent" && i.name === name) ?? null;
const poolOf = (actor, name) => actor.poolSnapshot().find(p => p.name === name) ?? null;
const shapes = () => game.system.azeroth.shapes;

/** The chooser a feature opened, once rendered. */
async function chooser(item, ms = 10000) {
  for (let i = 0; i < ms / 50; i++) {
    const app = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (app?.rendered && app.element?.querySelector(".azeroth-choose")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`${item.name} opened no chooser`);
}

/**
 * Pick by name in the chooser a feature has open and press its button: the
 * select where it takes one, every named box where it takes several.
 */
async function pick(item, names) {
  const app = await chooser(item);
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(names[0]));
    if (!option) throw new Error(`${item.name}'s chooser offers no ${names[0]}`);
    select.value = option.value;
  } else {
    for (const box of app.element.querySelectorAll('input[name="choice"]')) {
      const label = box.closest("label")?.querySelector("span")?.textContent.trim() ?? "";
      const want = names.includes(label);
      if (box.checked !== want) {
        box.checked = want;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
  app.element.querySelector('button[data-action="choose"]').click();
  return app;
}

/** Use a feature through its own door, answering its choosers in order. */
async function useWithPicks(actor, name, ...answers) {
  const item = featureNamed(actor, name);
  if (!item) throw new Error(`${actor.name} holds no ${name}`);
  const used = game.system.azeroth.workflows.useFeature({ actor, item });
  for (const names of answers) {
    const app = await pick(item, names);
    // The next chooser takes the same id: wait for THIS window to close, so the
    // next pick finds the next one rather than this one on its way out.
    await until(() => !app.rendered, `${name}'s chooser to close`);
  }
  return used;
}

/** A started fight holding these actors, with the turn events settled (D-627). */
async function fightWith(actors) {
  const combat = await Combat.create({});
  made.push(combat);
  await combat.activate();
  await combat.createEmbeddedDocuments("Combatant", actors.map(a => ({ actorId: a.id })));
  const settled = untilHook("combatTurnChange", 60000, c => c.id === combat.id);
  await combat.startCombat();
  await settled;
  await until(() => combat.combatants.every(c => c.getFlag("azeroth-rpg", "budget") !== undefined),
    "every combatant's own budget landing", 30000);
  return combat;
}

/** A scene at five feet a square with the actors' linked tokens on it, viewed. */
async function sceneWith(placements) {
  const scene = await Scene.create({ name: "ZZ Shapes Scene", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
  made.push(scene);
  await scene.view();
  const data = [];
  for (const { actor, x, y, side = "friendly" } of placements) {
    await actor.update({ "prototypeToken.actorLink": true });
    data.push((await actor.getTokenDocument({
      x, y, disposition: CONST.TOKEN_DISPOSITIONS[side === "friendly" ? "FRIENDLY" : "HOSTILE"]
    })).toObject());
  }
  await scene.createEmbeddedDocuments("Token", data);
  for (let i = 0; i < 60 && !placements.every(p => p.actor.getActiveTokens(true).length); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await settle();
  return scene;
}

/** A token's stored appearance and the centre it holds, off its SOURCE (D-669). */
function appearance(token) {
  const s = token._source;
  const grid = token.parent.grid.size;
  return {
    width: s.width, height: s.height, src: s.texture?.src ?? null,
    centre: { x: s.x + (s.width * grid) / 2, y: s.y + (s.height * grid) / 2 }
  };
}

/** Opportunity Attack offers in the log. */
const offers = () => game.messages.filter(m => m.getFlag("azeroth-rpg", "reaction") === "opportunityAttack").length;

/** The final number on a card's damage line, and the Rating its explanation opens on. */
const damageText = message => new DOMParser().parseFromString(message.content, "text/html").querySelector(".azeroth-damage em")?.textContent ?? "";

export function shapesBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Shapes: one effect, one token, the physical half (D-769)", function () {
    let restore = null;
    let wasViewing = null;
    let bear = null;
    let wolf = null;
    before(async function () {
      this.timeout(30000);
      restore = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      bear = await fromPack("azeroth-rpg.bestiary", "Black Bear");
      wolf = await fromPack("azeroth-rpg.bestiary", "Wolf");
    });
    after(async function () {
      this.timeout(180000);
      if (restore !== null) await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, restore);
      // Fights first, then the scene, then everything else (D-757's order).
      for (const doc of made.filter(d => d instanceof Combat)) await doc.delete().catch(() => {});
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await drainAreaWork();
      for (const doc of made.filter(d => d instanceof Scene)) await doc.delete().catch(() => {});
      await cleanup();
    });

    it("SHIFT: the Black Bear on the Druid's turn - the token 2x2 in the bear's art round its own centre, one Half-Action and no movement, no Opportunity Attack, and the sheet reads the bear", async function () {
      this.timeout(180000);
      const druid = await makeCharacter({ name: "ZZ Shapes Druid", classes: [["Druid", 5]] });
      await until(() => featureNamed(druid, "Shapeshift"), "Shapeshift");
      const own = { health: druid.system.health.max, str: druid.system.abilities.str.value, bags: druid.system.bagSlots.base, ward: foundry.utils.deepClone(druid.system.ward ?? {}) };
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1100, y: 1000, side: "hostile" }]);
      const token = druid.getActiveTokens(true, true)[0];
      assert.ok(token, "the Druid has no token on the scene");
      const before = appearance(token);
      assert.equal(before.width, 1);
      const combat = await fightWith([druid, ghoul]);
      const mine = await giveTurn(combat, druid);
      const budget = foundry.utils.deepClone(mine.getFlag("azeroth-rpg", "budget"));
      const offered = offers();

      const card = await useWithPicks(druid, "Shapeshift", ["Black Bear"]);
      made.push(card);
      assert.ok(card, "the shift posted no card");
      await until(() => druid.shape?.kind === "shapeshift", "the shape effect");
      const effect = druid.effects.find(e => e.getFlag("azeroth-rpg", "shape"));
      assert.equal(effect.name, game.i18n.format("AZEROTH.Shape.EffectName.shapeshift", { name: "Black Bear" }));
      assert.equal(effect.showIcon, CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, "the effect is not drawn on the token");
      assert.equal(effect.img, bear.prototypeToken.texture.src);

      // The token: the bear's footprint and art, round the same centre.
      await until(() => token._source.width === 2 && token._source.texture.src === bear.prototypeToken.texture.src, "the token dressed as the bear");
      const after = appearance(token);
      assert.deepEqual(after.centre, before.centre, "the resize moved the token's centre");
      assert.deepEqual(token.getFlag("azeroth-rpg", RESTORE_FLAG), { width: 1, height: 1, src: before.src }, "the token did not keep its own appearance");
      // The turn: one Half-Action for the shift, and the resize charged nothing.
      await settle();
      const now = mine.getFlag("azeroth-rpg", "budget");
      assert.equal(now.halfActions, budget.halfActions - 1, "the shift did not cost its one Half-Action, or the resize cost more");
      assert.notOk(mine.getFlag("azeroth-rpg", "moveHalves"), "the resize was charged as a Move");
      assert.equal(offers(), offered, "the resize offered an Opportunity Attack");

      // The sheet's numbers are the bear's physical half, and the Health is the Druid's.
      const s = druid.system;
      assert.equal(s.abilities.str.value, bear.system.abilities.str.value);
      assert.equal(s.abilities.str.mod, 2, "the form's Strength did not move the modifier");
      assert.equal(s.abilities.con.value, bear.system.abilities.con.value);
      assert.equal(s.abilities.str.own.value, own.str, "the character's own Strength is lost");
      assert.equal(s.defense, bear.system.defense);
      assert.deepEqual({ ...s.ap }, { body: bear.system.ap.body, head: bear.system.ap.head, limb: bear.system.ap.limb });
      assert.equal(s.speed, bear.system.speed);
      assert.equal(s.size, "large");
      assert.equal(s.health.max, own.health, "the bear's Constitution moved the Druid's Health");
      // The lead: *"Druid's own carry"* - the bear's Strength and Large frame
      // move the token and the space, never the bag slots.
      assert.equal(s.bagSlots.base, own.bags, "the bear's Strength or size moved the Druid's own carry");
      // A block's own Ward is not on the physical half: the character's stands.
      assert.deepEqual({ ...(s.ward ?? {}) }, own.ward, "the shape changed the Druid's Ward");

      // And the sheet says so: the banner's line, the plates' marks, the bear's rows.
      const sheet = await openSheet(druid);
      try {
        const line = sheet.element.querySelector(".azeroth-shape-line");
        assert.ok(line, "the banner does not say the Druid is in a form");
        assert.include(line.textContent, "Black Bear");
        assert.ok(line.querySelector('[data-action="leaveShape"]'), "the banner offers no Leave");
        assert.lengthOf(sheet.element.querySelectorAll(".azeroth-chip-form"), 3, "Strength, Dexterity and Constitution are not marked form");
        await sheet.changeTab("combat", "primary");
        await settle();
        const rows = sheet.element.querySelectorAll('section[data-tab="combat"] [data-natural-index]');
        assert.lengthOf(rows, bear.system.attacks.length, "the Combat tab does not draw the bear's attacks");
        assert.equal(typeof sheet.options.actions.rollNaturalAttack, "function", "rollNaturalAttack has no handler");
        assert.deepEqual(checkText(line), [], "the shape line is not legible");
        assert.deepEqual(checkText(sheet.element.querySelector(".azeroth-natural-attacks")), [], "the attack rows are not legible");
      } finally {
        await sheet.close();
      }
      await combat.delete();
    });

    it("CLAWS: the bear's Claws through the weapon door, at the form's Strength and the Druid's Proficiency, Rating 5", async function () {
      this.timeout(90000);
      const druid = await makeCharacter({ name: "ZZ Shapes Claws", classes: [["Druid", 5]], weapons: ["Halberd"] });
      await druid.items.find(i => i.name === "Halberd").update({ "system.equipped": true });
      const { reachOfActor } = await import("../canvas/engaged.mjs");
      assert.equal(reachOfActor(druid), 10, "the halberd's Reach is not read out of a form");
      // A plate drawn BEFORE the shift (the review): its stale input is bound
      // still, and an edit on it must not store anything of the bear's.
      const sheet = await openSheet(druid);
      const stale = sheet.element.querySelector('input.azeroth-score[data-ability-score="str"]');
      assert.ok(stale, "the Strength plate has no input out of a form");
      const ownStr = druid._source.system.abilities.str.value;
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.system.abilities.str.mod === 2, "the bear's Strength");
      // Through `readyWeapons` (the review): a melded halberd threatens nothing.
      assert.equal(reachOfActor(druid), 5, "a melded halberd still gives the Druid ten feet of reach");
      try {
        const said = await warnings(async () => {
          stale.value = "18";
          stale.dispatchEvent(new Event("change", { bubbles: true }));
          await settle();
        });
        assert.isTrue(said.some(s => s.includes("Black Bear")), `the refusal does not name the shape: ${said.join(" | ")}`);
        assert.equal(druid._source.system.abilities.str.value, ownStr, "an edit in the form stored a Strength");
      } finally {
        await sheet.close();
      }
      const [claws] = druid.readyWeapons();
      assert.ok(claws?.natural, "readyWeapons does not hand back the bear's own rows");
      assert.equal(claws.name, "Claws");
      const unpin = pinDie(19);
      let card;
      try {
        card = await attackWithDialog(druid, claws);
      } finally {
        unpin();
      }
      made.push(card);
      assert.ok(card, "the Claws posted no card");
      const roll = card.rolls[0];
      assert.equal(roll.total - roll.natural, 2 + druid.system.proficiency, "the bonus is not the form's Strength and the Proficiency");
      assert.match(damageText(card), /^5\b/, `the Claws are not Rating 5: ${damageText(card)}`);
      assert.equal(card.flags["azeroth-rpg"].strike?.form, "claw", "the card does not record a claw");
    });

    it("FEROCITY: a 7-Mana spell in a form takes 4 Ferocity and no Mana, and one short is refused with nothing spent", async function () {
      this.timeout(90000);
      const druid = await makeCharacter({ name: "ZZ Shapes Moonfall", classes: [["Druid", 9]], spells: ["Moonfall"] });
      const spell = druid.items.find(i => i.type === "spell" && i.name === "Moonfall");
      assert.equal(spell.system.mana, 7);
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.inShapeshiftForm, "the form");
      const ferocity = poolOf(druid, "ferocity");
      const mana = poolOf(druid, "mana");
      await druid.updatePool([{ itemId: ferocity.itemId, kind: "momentum", value: 5 }, { itemId: mana.itemId, kind: "power", value: mana.max }]);
      await until(() => poolOf(druid, "ferocity").value === 5, "Ferocity 5");
      const unpin = pinDie(15);
      let card;
      try {
        card = await game.system.azeroth.workflows.castSpell({ actor: druid, spell, targets: [] });
      } finally {
        unpin();
      }
      made.push(card);
      assert.ok(card, "the cast in a form was refused with its Ferocity there");
      assert.equal(poolOf(druid, "ferocity").value, 1, "the 7-Mana spell did not take 4 Ferocity");
      assert.equal(poolOf(druid, "mana").value, mana.max, "Mana was spent in a Shapeshift form");
      assert.include(card.content, game.i18n.format("AZEROTH.Shape.FerocityPaidRow", { ferocity: 4, mana: 7 }), "the card does not say what paid");

      await druid.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: 3 });
      await until(() => poolOf(druid, "ferocity").value === 3, "Ferocity 3");
      let refused = null;
      const said = await warnings(async () => {
        refused = await game.system.azeroth.workflows.castSpell({ actor: druid, spell, targets: [] });
      });
      assert.isNull(refused, "a cast with too little Ferocity was made");
      assert.isTrue(said.some(s => s.includes("4")), `the refusal does not name the price: ${said.join(" | ")}`);
      assert.equal(poolOf(druid, "ferocity").value, 3, "the refused cast spent Ferocity");
    });

    it("EXTRA ATTACK: the Druid rolls twice in a Shapeshift form and once out of one (02 §7)", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Twice", classes: [["Druid", 5]], weapons: ["Amani hatchet"] });
      await until(() => featureNamed(druid, "Extra Attack"), "Extra Attack");
      const hatchet = druid.items.find(i => i.name === "Amani hatchet");
      await hatchet.update({ "system.equipped": true });
      assert.isFalse(druid.hasExtraAttack, "a Druid out of form holds Extra Attack");
      const count = () => game.messages.filter(m => m.getFlag("azeroth-rpg", "kind") === "attack").length;
      const unpin = pinDie(15);
      try {
        const before = count();
        made.push(await attackWithDialog(druid, hatchet));
        await until(() => count() >= before + 1, "the hatchet's card");
        await settle();
        assert.equal(count(), before + 1, "a Druid out of form rolled twice");

        await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
        await until(() => druid.hasExtraAttack === true, "Extra Attack in the form");
        const inForm = count();
        made.push(await attackWithDialog(druid, druid.readyWeapons()[0]));
        await until(() => count() >= inForm + 2, "the second roll in the form");
        assert.equal(count(), inForm + 2, "the Druid did not roll twice in a Shapeshift form");
      } finally {
        unpin();
      }
      // The Avatar is not a Shapeshift form (D-251).
      await shapes().takeShape(druid, { kind: "avatar", entries: [await fromPack("azeroth-rpg.bestiary", "Avatar")] });
      await until(() => druid.shape?.kind === "avatar", "the Avatar");
      assert.isFalse(druid.hasExtraAttack, "the Avatar doubled the Druid's blow");
    });

    it("BEAR TO WOLF, AND A HAND DELETE: the wolf is dressed from the true original, and deleting the effect puts the token back and empties the Ferocity", async function () {
      this.timeout(180000);
      const druid = await makeCharacter({ name: "ZZ Shapes Wolf", classes: [["Druid", 5]] });
      await until(() => featureNamed(druid, "Shapeshift"), "Shapeshift");
      const ghoul = await makeNpc("Plagued Ghoul");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }, { actor: ghoul, x: 1200, y: 1000, side: "hostile" }]);
      const token = druid.getActiveTokens(true, true)[0];
      const original = appearance(token);
      const combat = await fightWith([druid, ghoul]);
      await giveTurn(combat, druid);
      const offered = offers();

      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => token._source.width === 2, "the bear's footprint");
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [wolf] });
      await until(() => token._source.width === 1 && token._source.texture.src === wolf.prototypeToken.texture.src, "the wolf dressed");
      assert.lengthOf(druid.effects.filter(e => e.getFlag("azeroth-rpg", "shape")), 1, "the wolf did not replace the bear in one");
      // Restored from the TRUE original, never from the bear.
      assert.deepEqual(token.getFlag("azeroth-rpg", RESTORE_FLAG), { width: 1, height: 1, src: original.src });
      assert.deepEqual(appearance(token).centre, original.centre, "the bear and back moved the token's centre");
      assert.equal(offers(), offered, "the shrink offered an Opportunity Attack");

      // A hand delete IS leaving the shape: core's own door, no system call.
      const ferocity = poolOf(druid, "ferocity");
      await druid.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: 3 });
      await until(() => poolOf(druid, "ferocity").value === 3, "Ferocity 3");
      const effect = druid.effects.find(e => e.getFlag("azeroth-rpg", "shape"));
      await effect.delete();
      await until(() => !druid.shape, "the shape gone");
      await until(() => token._source.texture.src === original.src && !token.getFlag("azeroth-rpg", RESTORE_FLAG), "the token put back");
      assert.equal(token._source.width, 1);
      await until(() => poolOf(druid, "ferocity").value === 0, "the Ferocity gone with the form");

      // SWITCHED OFF on core's effect sheet is left the same way (the review):
      // the token back AND the Ferocity gone, free as the table's override.
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => token._source.width === 2, "the bear again");
      await druid.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: 2 });
      await until(() => poolOf(druid, "ferocity").value === 2, "Ferocity 2");
      const again = druid.effects.find(e => e.getFlag("azeroth-rpg", "shape"));
      await again.update({ disabled: true });
      await until(() => !druid.shape, "the switched-off shape left");
      await until(() => poolOf(druid, "ferocity").value === 0, "the Ferocity gone with the switched-off form");
      await until(() => token._source.width === 1 && !token.getFlag("azeroth-rpg", RESTORE_FLAG), "the token put back after the switch");
      await again.delete();
      await combat.delete();
    });

    it("A NEW TOKEN: one placed for a shifted Druid wears the shape round the centre it was dropped at", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Placed", classes: [["Druid", 5]] });
      const scene = await sceneWith([]);
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.shape, "the shape");
      const own = druid.prototypeToken.texture.src;
      const data = (await druid.getTokenDocument({ x: 500, y: 500 })).toObject();
      const [placed] = await scene.createEmbeddedDocuments("Token", [data]);
      assert.equal(placed._source.width, 2, "the new token does not wear the bear's footprint");
      assert.equal(placed._source.texture.src, bear.prototypeToken.texture.src, "the new token does not wear the bear's art");
      assert.deepEqual(appearance(placed).centre, { x: 550, y: 550 }, "the new token is not round the centre it was dropped at");
      assert.deepEqual(placed.getFlag("azeroth-rpg", RESTORE_FLAG), { width: 1, height: 1, src: own });
      assert.equal(druid.prototypeToken.texture.src, own, "the prototype token was changed");
      // What a copy and paste of the dressed token carries.
      const copy = placed.toObject();
      delete copy._id;
      // Two leaves at once delete once (the review): the second waits for the first.
      await Promise.all([shapes().leaveShape(druid), shapes().leaveShape(druid)]);
      await until(() => placed._source.width === 1 && placed._source.texture.src === own, "the placed token put back");
      assert.lengthOf(druid.effects.filter(e => e.getFlag("azeroth-rpg", "shape")), 0, "a shape effect outlived two leaves");
      // PASTED after the Druid left the form (the review): put back, never a bear.
      const [pasted] = await scene.createEmbeddedDocuments("Token", [copy]);
      assert.equal(pasted._source.width, 1, "a pasted bear stands beside a Druid who left the form");
      assert.equal(pasted._source.texture.src, own);
      assert.isUndefined(pasted.getFlag("azeroth-rpg", RESTORE_FLAG), "the pasted token kept an original it no longer needs");
      assert.deepEqual(appearance(pasted).centre, { x: 550, y: 550 }, "the pasted token moved off the centre it was pasted at");
    });

    it("REFUSED: a shift the turn cannot pay for leaves no shape, no form learned and the token as it was", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Refused", classes: [["Druid", 5]] });
      await until(() => featureNamed(druid, "Shapeshift"), "Shapeshift");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }]);
      const token = druid.getActiveTokens(true, true)[0];
      const original = appearance(token);
      const combat = await fightWith([druid]);
      const mine = await giveTurn(combat, druid);
      await mine.spendAction("half");
      await mine.spendAction("half");
      await until(() => mine.getFlag("azeroth-rpg", "budget")?.halfActions === 0, "the turn spent");
      let used;
      const said = await warnings(async () => {
        used = await useWithPicks(druid, "Shapeshift", ["Black Bear"]);
      });
      assert.isNull(used, "a shift with no Half-Action left was made");
      assert.isAbove(said.length, 0, "the refusal said nothing");
      await settle();
      assert.isNull(druid.shape, "a refused shift left the Druid in the form");
      assert.lengthOf(featureNamed(druid, "Shapeshift").system.known, 0, "a refused shift learned the form");
      assert.deepEqual(appearance(token), original, "a refused shift dressed the token");
      await combat.delete();
    });

    it("LEAVE: a Half-Action from the banner on the Druid's turn; refused with the shape kept from the sheet's effect list once none is left; free once from the chip with Predator's Swiftness; nothing out of a fight (the lead: *\"Half-Action to leave\"*)", async function () {
      this.timeout(180000);
      const druid = await makeCharacter({ name: "ZZ Shapes Leave", classes: [["Druid", 5]] });
      await until(() => talentNamed(druid, "Predator's Swiftness"), "the Druid's talents");
      const combat = await fightWith([druid]);
      const mine = await giveTurn(combat, druid);
      const halves = () => mine.getFlag("azeroth-rpg", "budget")?.halfActions;
      const start = halves();
      assert.isAbove(start, 1, "the turn has fewer than two Half-Actions to test with");
      const sheet = await openSheet(druid);
      const control = selector => until(() => sheet.element?.querySelector(selector), `the control ${selector}`);
      try {
        // The banner's Leave: one Half-Action.
        await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
        (await control('.azeroth-shape-line [data-action="leaveShape"]')).click();
        await until(() => !druid.shape, "the banner's Leave");
        await until(() => halves() === start - 1, "the Half-Action the Leave costs");

        // None left: the sheet's own effect list is the same door, and refuses in words.
        await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
        await until(() => druid.shape, "the bear again");
        for (let i = 0; i < 4 && halves() > 0; i++) await mine.spendAction("half");
        await until(() => halves() === 0, "the turn spent");
        const effect = druid.effects.find(e => e.getFlag("azeroth-rpg", "shape"));
        const said = await warnings(async () => {
          (await control(`section[data-tab="core"] [data-effect-id="${effect.id}"] [data-action="deleteEffect"]`)).click();
          await settle();
        });
        assert.isAbove(said.length, 0, "the refused Leave said nothing");
        assert.ok(druid.shape, "a Leave with no Half-Action left took the shape off");

        // Predator's Swiftness: its Short Rest counter instead of the Half-Action, once.
        await talentNamed(druid, "Predator's Swiftness").update({ "system.taken": 1 });
        await until(() => featureNamed(druid, "Predator's Swiftness")?.system?.uses?.value === 1, "the Short Rest counter");
        await sheet.changeTab("combat", "primary");
        await settle();
        (await control('section[data-tab="combat"] [data-action="leaveShape"]')).click();
        await until(() => !druid.shape, "the free leave");
        assert.equal(featureNamed(druid, "Predator's Swiftness").system.uses.value, 0, "the counter was not spent");
        assert.equal(halves(), 0, "a Half-Action came from nowhere");
      } finally {
        await sheet.close();
      }
      // Out of a fight there is no turn to charge, and the counter is not wasted on one.
      await combat.delete();
      await featureNamed(druid, "Predator's Swiftness").update({ "system.uses.value": 1 });
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.shape, "the bear out of the fight");
      const { leaveShapeControl } = await import("../applications/combat-actions.mjs");
      await leaveShapeControl(druid);
      assert.isNull(druid.shape, "the Leave out of a fight was refused");
      assert.equal(featureNamed(druid, "Predator's Swiftness").system.uses.value, 1, "a free leave spent the counter");
    });

    it("UPKEEP IN A FORM: a Sustain held before the shift is still paid in Mana at the Druid's turn, and kept (the lead: *\"Upkeep unchanged\"*)", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Upkeep", classes: [["Druid", 5]] });
      const mana = poolOf(druid, "mana");
      await druid.updatePool({ itemId: mana.itemId, kind: "power", value: 5 });
      await until(() => poolOf(druid, "mana").value === 5, "Mana 5");
      // A Sustain as `castSpell` records one: against the Mana pool that paid for it.
      await druid.setFlag("azeroth-rpg", "sustaining", [{ spellId: null, uuid: null, name: "ZZ Held Spell", itemId: mana.itemId }]);
      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.inShapeshiftForm, "the bear");
      const ferocity = poolOf(druid, "ferocity").value;
      // The fight's first turn is the Druid's, and its start pays the upkeep.
      const combat = await fightWith([druid]);
      await until(() => poolOf(druid, "mana").value === 4, "the upkeep paid in Mana in the form");
      await settle();
      assert.equal(poolOf(druid, "mana").value, 4, "the upkeep was paid more than once");
      assert.lengthOf(druid.getFlag("azeroth-rpg", "sustaining") ?? [], 1, "the bar on Mana ended the Sustain");
      assert.equal(poolOf(druid, "ferocity").value, ferocity, "the upkeep was turned into Ferocity");
      await combat.delete();
    });

    it("REPAIR: a token stranded in the bear's art is put back when its scene is viewed again (canvasReady, on the GM)", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Stranded", classes: [["Druid", 5]] });
      const scene = await sceneWith([{ actor: druid, x: 1000, y: 1000 }]);
      const token = druid.getActiveTokens(true, true)[0];
      const own = appearance(token);
      // Stranded by hand: the bear's art and an original kept, on a Druid in no shape.
      await token.update({ texture: { src: bear.prototypeToken.texture.src }, flags: { "azeroth-rpg": { [RESTORE_FLAG]: { width: own.width, height: own.height, src: own.src } } } });
      await until(() => token._source.texture.src === bear.prototypeToken.texture.src, "the token stranded");
      const elsewhere = await Scene.create({ name: "ZZ Shapes Elsewhere", width: 1000, height: 1000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(elsewhere);
      await elsewhere.view();
      await settle();
      await scene.view();
      await until(() => token._source.texture.src === own.src && !token.getFlag("azeroth-rpg", RESTORE_FLAG), "the stranded token put back by the repair pass");
      assert.equal(token._source.width, own.width);
    });

    it("AVATAR: it ends at a Short Rest, and 0 Health in it ends it with an additional Critical Injury", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Avatar", classes: [["Druid", 20]] });
      const avatar = await fromPack("azeroth-rpg.bestiary", "Avatar");
      const ward = foundry.utils.deepClone(druid.system.ward ?? {});
      await shapes().takeShape(druid, { kind: "avatar", entries: [avatar] });
      await until(() => druid.shape?.kind === "avatar", "the Avatar");
      assert.isFalse(druid.inShapeshiftForm, "the Avatar read as a Shapeshift form (D-251)");
      // The block's own Ward is not on the physical half (the lead's list): the Druid's stands.
      assert.isAbove(Object.values(avatar.system.ward ?? {}).reduce((a, b) => a + (Number(b) || 0), 0), 0, "the Avatar's block lost its Ward, and this proves nothing");
      assert.deepEqual({ ...(druid.system.ward ?? {}) }, ward, "the Avatar's own Ward was taken");
      await druid.shortRest({ food: await give(druid, "Rations, one day") });
      await until(() => !druid.shape, "the Avatar ended by the Short Rest");

      await shapes().takeShape(druid, { kind: "avatar", entries: [avatar] });
      await until(() => druid.shape?.kind === "avatar", "the Avatar again");
      const injuries = () => game.messages.filter(m => m.getFlag("azeroth-rpg", "kind") === "critical" && m.speaker?.actor === druid.id).length;
      const before = injuries();
      await druid.applyDamage(druid.system.health.value + 5, { struck: true, attack: true, type: "physical" });
      await until(() => !druid.shape, "the Avatar ended at 0 Health");
      await until(() => injuries() >= before + 2, "the Critical Injury and the Avatar's additional one");
      assert.equal(injuries(), before + 2, "the Avatar's additional Critical Injury did not come, or came twice");
    });

    it("AVATAR FROM A FORM: its 15 Mana is paid as 8 Ferocity in a Shapeshift form, and one short of it is refused with the bear still worn (the plan's reading)", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Wild", classes: [["Druid", 20]] });
      await until(() => featureNamed(druid, "Avatar of the Wild") && talentNamed(druid, "Heart of the Wild"), "Avatar of the Wild and Heart of the Wild");
      // THE LEAD: *"No Avatar without it"* - refused in words before the
      // chooser opens and before anything is paid, and greyed on the sheet.
      const avatarItem = featureNamed(druid, "Avatar of the Wild");
      const full = poolOf(druid, "mana");
      await druid.updatePool({ itemId: full.itemId, kind: "power", value: full.max });
      await until(() => poolOf(druid, "mana").value === full.max, "a full Mana pool");
      let barred;
      const told = await warnings(async () => {
        barred = await game.system.azeroth.workflows.useFeature({ actor: druid, item: avatarItem });
      });
      assert.isNull(barred, "the Avatar was taken without Heart of the Wild");
      assert.isTrue(told.some(s => s.includes("Heart of the Wild")), `the refusal does not name the talent: ${told.join(" | ")}`);
      assert.notOk(foundry.applications.instances.get(`azeroth-choose-${avatarItem.id}`)?.rendered, "the chooser opened before the refusal");
      assert.equal(poolOf(druid, "mana").value, full.max, "the refused Avatar spent Mana");
      const sheet = await openSheet(druid);
      try {
        await sheet.changeTab("combat", "primary");
        await settle();
        const row = sheet.element.querySelector(`section[data-tab="combat"] li.azeroth-feature[data-item-id="${avatarItem.id}"]`);
        assert.ok(row, "the Avatar has no row on Combat");
        assert.isTrue(row.querySelector('[data-action="useFeature"]')?.disabled, "the Avatar's Use is not greyed");
        assert.include(row.querySelector(".azeroth-feature-why")?.textContent ?? "", "Heart of the Wild", "the greyed Use does not say why");
        assert.deepEqual(checkText(row.querySelector(".azeroth-feature-why")), [], "the reason is not legible");
      } finally {
        await sheet.close();
      }
      await talentNamed(druid, "Heart of the Wild").update({ "system.taken": 1 });
      await settle();

      await shapes().takeShape(druid, { kind: "shapeshift", entries: [bear] });
      await until(() => druid.inShapeshiftForm, "the bear");
      const ferocity = poolOf(druid, "ferocity");
      const mana = poolOf(druid, "mana");
      await druid.updatePool([{ itemId: ferocity.itemId, kind: "momentum", value: 7 }, { itemId: mana.itemId, kind: "power", value: mana.max }]);
      await until(() => poolOf(druid, "ferocity").value === 7, "Ferocity 7");
      let refused;
      const said = await warnings(async () => {
        refused = await useWithPicks(druid, "Avatar of the Wild", ["Avatar"]);
      });
      assert.isNull(refused, "the Avatar was taken with 7 Ferocity against a price of 8");
      assert.isAbove(said.length, 0, "the refusal said nothing");
      assert.equal(druid.shape?.kind, "shapeshift", "a refused Avatar left the bear");
      assert.equal(poolOf(druid, "ferocity").value, 7, "the refused Avatar spent Ferocity");

      await druid.updatePool({ itemId: ferocity.itemId, kind: "momentum", value: 9 });
      await until(() => poolOf(druid, "ferocity").value === 9, "Ferocity 9");
      const card = await useWithPicks(druid, "Avatar of the Wild", ["Avatar"]);
      made.push(card);
      assert.ok(card, "the Avatar was refused with its Ferocity there");
      // The card names the pool that PAID, not the price's own (D-769).
      const ferocityLabel = game.i18n.localize("AZEROTH.Pool.Ferocity");
      assert.include(card.content, `<dt>${ferocityLabel}</dt><dd>8</dd>`, `the card does not say 8 Ferocity was paid: ${card.content}`);
      await until(() => druid.shape?.kind === "avatar", "the Avatar");
      assert.equal(poolOf(druid, "mana").value, mana.max, "the Avatar's Mana was paid in Mana from a Shapeshift form");
      // 8 paid, and the 1 left goes with the Shapeshift form (02 §7).
      assert.equal(poolOf(druid, "ferocity").value, 0);
    });

    it("METAMORPHOSIS: the greater demon and the school asked in turn, Ward 3, +2 Damage Rating and 1 Fel, through the class feature", async function () {
      this.timeout(120000);
      const warlock = await makeCharacter({ name: "ZZ Shapes Warlock", classes: [["Warlock", 17]] });
      await until(() => featureNamed(warlock, "Metamorphosis"), "Metamorphosis");
      const mana = poolOf(warlock, "mana");
      await warlock.updatePool({ itemId: mana.itemId, kind: "power", value: mana.max });
      await until(() => poolOf(warlock, "mana").value === mana.max, "a full Mana pool");
      const ward = warlock.system.ward?.fel ?? 0;
      const fel = warlock.system.corruption.fel;
      const card = await useWithPicks(warlock, "Metamorphosis", ["Felhunter"], [game.i18n.localize("AZEROTH.School.Fel")]);
      made.push(card);
      assert.ok(card, "Metamorphosis posted no card");
      await until(() => warlock.shape?.kind === "metamorphosis", "the greater demon's form");
      assert.equal(poolOf(warlock, "mana").value, mana.max - 12, "Metamorphosis did not cost its 12 Mana");
      assert.equal(warlock.system.ward.fel, ward + 3, "no Ward 3 against Fel");
      await until(() => warlock.system.corruption.fel === fel + 1, "the 1 Fel Corruption");
      const felhunter = await fromPack("azeroth-rpg.bestiary", "Felhunter");
      const [bite] = warlock.readyWeapons();
      assert.equal(bite?.name, felhunter.system.attacks[0].name);
      const unpin = pinDie(19);
      let swing;
      try {
        swing = await attackWithDialog(warlock, bite);
      } finally {
        unpin();
      }
      made.push(swing);
      const rating = felhunter.system.attacks[0].damage + 2;
      assert.match(damageText(swing), new RegExp(`^${rating}\\b`), `Metamorphosis did not add 2 to the Damage Rating: ${damageText(swing)}`);
      assert.include(swing.content, game.i18n.localize("AZEROTH.Shape.DamageBonus"), "the card does not say where the 2 came from");
    });

    it("CHIMERA: two forms in one shape, the better of each statistic, the attacks of both, and the larger footprint in the first form's art", async function () {
      this.timeout(120000);
      const druid = await makeCharacter({ name: "ZZ Shapes Chimera", classes: [["Druid", 16]] });
      await until(() => talentNamed(druid, "Chimera") && featureNamed(druid, "Shapeshift"), "Chimera and Shapeshift");
      await talentNamed(druid, "Chimera").update({ "system.taken": 1 });
      await until(() => featureNamed(druid, "Shapeshift")?.system?.picks === 2, "Chimera's two picks on Shapeshift");
      await sceneWith([{ actor: druid, x: 1000, y: 1000 }]);
      const token = druid.getActiveTokens(true, true)[0];
      const raptor = await fromPack("azeroth-rpg.bestiary", "Raptor");
      const card = await useWithPicks(druid, "Shapeshift", ["Black Bear", "Raptor"]);
      made.push(card);
      assert.ok(card, "the merged shift posted no card");
      await until(() => druid.shape?.forms?.length === 2, "the two forms merged");
      const s = druid.system;
      assert.equal(s.abilities.dex.value, raptor.system.abilities.dex.value, "not the better Dexterity");
      assert.equal(s.abilities.con.value, bear.system.abilities.con.value, "not the better Constitution");
      assert.equal(s.speed, raptor.system.speed, "not the better Speed");
      assert.equal(s.size, "large", "not the larger size");
      assert.lengthOf(druid.readyWeapons(), bear.system.attacks.length + raptor.system.attacks.length, "not the attacks of both");
      await until(() => token._source.width === 2 && token._source.texture.src === bear.prototypeToken.texture.src, "the larger footprint in the first form's art");
      assert.sameMembers(featureNamed(druid, "Shapeshift").system.known.map(k => k.name), ["Black Bear", "Raptor"], "the two forms were not learned");
    });

    it("MIGRATION 0.12.20: the old flag becomes the shape effect, a string flag is dropped, and a second run touches nothing", async function () {
      this.timeout(120000);
      const kept = await makeCharacter({ name: "ZZ Shapes Old Flag" });
      const stale = await makeCharacter({ name: "ZZ Shapes Old String" });
      // The OLD world's flags, staged here and nowhere else (`shapes.test.mjs`).
      await kept.setFlag("azeroth-rpg", "form", { uuid: bear.uuid, name: bear.name });
      await stale.setFlag("azeroth-rpg", "form", "bear");
      const touched = await migrateShapes(() => {});
      assert.isAtLeast(touched, 2, "the migration touched neither character");
      await until(() => kept.shape?.kind === "shapeshift", "the old flag become the shape");
      assert.equal(kept.shape.forms[0].name, "Black Bear");
      assert.equal(kept.system.abilities.str.value, bear.system.abilities.str.value, "the migrated shape does not carry the bear's half");
      assert.isUndefined(kept._source.flags?.["azeroth-rpg"]?.form, "the old flag outlived the migration");
      assert.isUndefined(stale._source.flags?.["azeroth-rpg"]?.form, "the string flag was not dropped");
      assert.isNull(stale.shape, "a string flag became a shape");
      assert.equal(await migrateShapes(() => {}), 0, "a second run touched a document");
    });
  });
}
