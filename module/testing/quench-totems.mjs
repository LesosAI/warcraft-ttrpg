/**
 * A totem is planted, and the ground it holds is drawn (02 §7, D-708).
 *
 * Everything here needs real tokens on a real scene, because the whole point
 * is that something lands on the board: the pick makes a bound world actor
 * (D-643) and this is what says the actor arrives somewhere, wearing its art,
 * inside a Region of 02's own radius that follows it and goes with it.
 *
 * **Poll for the write you are about to assert on**, never for a neighbour of
 * it (CLAUDE.md §15): a token's document position is interpolated while it
 * travels in v14, core's attached-Region updates ride the same operation, and
 * the Region deletion that follows a token deletion is NOT awaited
 * (`TokenDocument._onDeleteOperation`, 14.367).
 */

import { cleanup, made, makeCharacter, pinDie, settle } from "./fixtures.mjs";
import { checkText } from "./geometry.mjs";
// A bound creature's blow, and the card's Apply (the lead's item 24).
import { npcAttackWithDialog } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ELEMENT_COLORS, totemAura } from "../rules/totems.mjs";
import { pixelsPerFoot } from "../canvas/regions.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";

const until = async (fn, what, ms = 10000) => {
  const t0 = Date.now();
  let value = fn();
  while (!value) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
    value = fn();
  }
  return value;
};

const featureNamed = (actor, name) => actor.items.find(i => i.type === "feature" && i.name === name) ?? null;

/** Every Power pool to its cap: `useFeature` pays before it does anything. */
async function fillPools(actor) {
  for (const pool of (actor.poolSnapshot?.() ?? []).filter(p => p.kind === "power" && p.max > 0 && p.value < p.max)) {
    await actor.updatePool({ itemId: pool.itemId, kind: "power", value: pool.max });
  }
}

/**
 * The chooser a menu feature opened, or null after five seconds.
 *
 * `running` is the `useFeature` promise, where the caller has one: a use that
 * is REFUSED BEFORE THE CHOOSER (no room for another totem, D-710) opens
 * nothing at all, and waiting the full five seconds for a window that will
 * never come reads as a hang rather than as the refusal it is.
 */
async function openChooser(item, running = null) {
  let settled = false;
  if (running) running.then(() => { settled = true; }, () => { settled = true; });
  for (let i = 0; i < 100; i++) {
    const app = foundry.applications.instances.get(`azeroth-choose-${item.id}`);
    if (app?.rendered) return app;
    if (settled) return null;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/**
 * Answer the chooser, whichever shape it is in: the select below one pick, a
 * tick on each row above one (02 §7's Totem Mastery, D-710). The `change` is
 * dispatched because the window holds itself to its own ceiling.
 */
function answerChooser(chooser, options, names) {
  const select = chooser.element.querySelector("#azeroth-choose-select");
  if (select) {
    select.value = String(options.findIndex(o => o.name === names[0]));
  } else {
    for (const name of names) {
      const index = options.findIndex(o => o.name === name);
      const box = chooser.element.querySelector(`input[name="choice"][value="${index}"]`);
      if (!box || box.disabled) throw new Error(`the chooser offers no tick for ${name}`);
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  chooser.element.querySelector('button[data-action="choose"]').click();
}

/** Collect the warnings a call raises, and restore the notifier. */
async function warningsDuring(fn) {
  const warned = [];
  const original = ui.notifications.warn;
  ui.notifications.warn = function (message, ...rest) { warned.push(String(message)); return original.call(this, message, ...rest); };
  try { return { result: await fn(), warned }; }
  finally { ui.notifications.warn = original; }
}

/** The Region drawn for a bound totem, by the flag the placement writes. */
const auraOf = (scene, totem) => scene.regions.find(r => r.getFlag("azeroth-rpg", "totemOf") === totem.uuid) ?? null;

/** The one token of a bound actor on a scene. */
const tokenOf = (scene, actor) => scene.tokens.find(t => t.actorId === actor.id) ?? null;

export function totemBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Totems planted, and the ground they hold (02 §7, D-708)", function () {
    let scene = null;
    let wasViewing = null;
    let priorSetting = null;

    before(async function () {
      this.timeout(120000);
      priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
      // The scene this batch was found on, so it is handed back at the end:
      // deleting a VIEWED scene tears the canvas down and leaves the world
      // with none (the distance batch learned this, 2026-09-06).
      wasViewing = game.scenes.active ?? canvas?.scene ?? null;
      scene = await Scene.create({
        name: "ZZ Totem Scene", width: 4000, height: 3000,
        grid: { size: 100, distance: 5, units: "ft" }
      });
      made.push(scene);
      await scene.view();
      await settle();
    });

    after(async function () {
      this.timeout(120000);
      await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
      if (wasViewing && !wasViewing.name?.startsWith("ZZ ")) await wasViewing.view().catch(() => {});
      await cleanup();
    });

    /** A Shaman with a token standing on the test scene. */
    async function shamanOnTheScene(name, level = 7, { x = 1000, y = 1000 } = {}) {
      const actor = await makeCharacter({ name, classes: [["Shaman", level]] });
      await until(() => featureNamed(actor, "Totem"), "the Shaman's Totem feature", 20000);
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await actor.getTokenDocument({ x, y, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })).toObject();
      await scene.createEmbeddedDocuments("Token", [data]);
      await until(() => tokenOf(scene, actor), `${name}'s token`);
      await fillPools(actor);
      return actor;
    }

    /**
     * Use Totem and pick one - or several, where Totem Mastery placed several
     * in the one Half-Action (D-710); resolves to the card, or to null where
     * the use was refused before the chooser opened.
     */
    async function plant(actor, ...totemNames) {
      const feature = featureNamed(actor, "Totem");
      const { featureChoices } = await import("../dice/workflows.mjs");
      const options = await featureChoices(actor, feature);
      const used = game.system.azeroth.workflows.useFeature({ actor, item: feature });
      const chooser = await openChooser(feature, used);
      if (!chooser) {
        const refused = await used;
        assert.isNull(refused, "Use on Totem opened no chooser and still used the feature");
        return null;
      }
      answerChooser(chooser, options, totemNames);
      const card = await used;
      if (card) made.push(card);
      return card;
    }

    const B = async () => import("../documents/bound.mjs");

    it("plants Stoneskin beside the shaman inside a 30 ft Earth aura attached to its token", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Plant Shaman");
      const anchor = tokenOf(scene, actor);
      const card = await plant(actor, "Stoneskin");
      assert.ok(card, "Use on Totem posted no card");
      assert.equal(card.flags["azeroth-rpg"].choice, "Stoneskin");

      const { boundOf } = await B();
      const totem = await until(() => boundOf(actor, "totem")[0] ?? null, "the bound totem");
      made.push(totem);
      assert.equal(totem.name, "Stoneskin Totem", "the totem 14 names was not the one bound");

      // A TOKEN OF IT, ADJACENT TO THE SHAMAN.
      const token = await until(() => tokenOf(scene, totem), "the totem's token");
      const step = scene.grid.size;
      assert.closeTo(Math.hypot(token.x - anchor.x, token.y - anchor.y), step, step * 0.5,
        `the totem stands at ${token.x},${token.y} and the shaman at ${anchor.x},${anchor.y} - not within one square`);
      assert.equal(token.disposition, anchor.disposition, "the totem did not take the shaman's side");
      assert.isFalse(token.actorLink, "a totem that lasts the encounter took a linked token");

      // AND THE GROUND IT HOLDS, as one circle of 02's own radius.
      const region = await until(() => auraOf(scene, totem), "the totem's aura");
      assert.lengthOf(region.shapes, 1, "the aura is not one shape");
      const shape = region.shapes[0];
      assert.equal(shape.type, "circle");
      assert.equal(shape.radius, pixelsPerFoot(scene) * 30, "the aura is not 02 §7's thirty feet, in pixels");
      assert.closeTo(shape.x, token.getCenterPoint().x, 1, "the aura is not centred on the totem");
      assert.closeTo(shape.y, token.getCenterPoint().y, 1, "the aura is not centred on the totem");
      assert.equal(region.visibility, CONST.REGION_VISIBILITY.ALWAYS, "the aura is not shown to everyone");
      assert.isTrue(region.displayMeasurements, "the aura does not print its measurement");
      // WRITE AN ID, READ A DOCUMENT: `attachment.token` resolves on
      // initialize, and the stored id is at `_source` (14.367).
      assert.equal(region._source.attachment.token, token.id, "the aura is not attached to the totem's token");
      assert.equal(region.attachment.token?.id, token.id);
      // The enamel on the token's own ring (assets/art/totems/manifest.json).
      assert.equal(String(region.color).toLowerCase(), ELEMENT_COLORS.earth, "the aura is not the Earth colour");
      assert.include(region.name, "Stoneskin Totem");
      assert.include(region.name, "30 ft");

      // The card says where it is standing, and offers nothing to press.
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.include(el.textContent, "stands within 5 feet", "the card does not say the totem was planted");
      assert.isNull(el.querySelector('[data-action="plantTotem"]'), "the card carries a Plant button for a totem already standing");
    });

    it("gives Windfury 02's fifteen feet and the Air colour, and Searing thirty in Fire", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Radius Shaman", 11, { x: 2000, y: 1000 });
      const { boundOf } = await B();

      await plant(actor, "Windfury");
      const windfury = await until(() => boundOf(actor, "totem").find(b => b.name.startsWith("Windfury")) ?? null, "the Windfury Totem");
      made.push(windfury);
      const windRegion = await until(() => auraOf(scene, windfury), "Windfury's aura");
      assert.equal(windRegion.shapes[0].radius, pixelsPerFoot(scene) * 15, "Windfury is not 02 §7's fifteen feet");
      assert.equal(String(windRegion.color).toLowerCase(), ELEMENT_COLORS.air, "Windfury's aura is not the Air colour");

      // A level 11 shaman is TIER 3 and stands three at once (02 §7, D-709),
      // so a second plants beside the first rather than being refused.
      await plant(actor, "Searing");
      const searing = await until(() => boundOf(actor, "totem").find(b => b.name.startsWith("Searing")) ?? null, "the Searing Totem");
      made.push(searing);
      const fireRegion = await until(() => auraOf(scene, searing), "Searing's aura");
      assert.equal(fireRegion.shapes[0].radius, pixelsPerFoot(scene) * 30, "Searing is not thirty feet");
      assert.equal(String(fireRegion.color).toLowerCase(), ELEMENT_COLORS.fire, "Searing's aura is not the Fire colour");

      // Two totems, two squares: nothing was stacked.
      const a = tokenOf(scene, windfury);
      const b = tokenOf(scene, searing);
      assert.notDeepEqual({ x: a.x, y: a.y }, { x: b.x, y: b.y }, "the second totem was planted on top of the first");
    });

    it("stands as many totems at once as the shaman's tier, and refuses one past it (D-709)", async function () {
      this.timeout(300000);
      const { boundOf } = await B();

      // A LEVEL 7 SHAMAN IS TIER 2. The old rule held ONE totem until Totem
      // Mastery at level 11, so this second plant is the whole change: under
      // it the bind was refused here, not at the third.
      const two = await shamanOnTheScene("ZZ Tier Two Shaman", 7, { x: 1500, y: 1500 });
      await plant(two, "Stoneskin");
      await plant(two, "Healing Stream");
      await until(() => boundOf(two, "totem").length === 2, "the tier 2 shaman's two totems", 20000);
      for (const bound of boundOf(two, "totem")) made.push(bound);

      // And the THIRD is refused: nothing bound, nothing planted, nothing paid,
      // because `bind` runs before the budget and the Mana (D-708).
      const tokens = scene.tokens.size;
      const regions = scene.regions.size;
      const mana = two.poolSnapshot().find(p => p.kind === "power").value;
      const { result: third, warned } = await warningsDuring(() => plant(two, "Windfury"));
      assert.isNull(third, "a tier 2 shaman planted a third totem");
      assert.ok(warned.some(w => /already holds/i.test(w)), `the refusal was not said: ${warned.join(" | ")}`);
      assert.lengthOf(boundOf(two, "totem"), 2, "the refused totem was bound anyway");
      assert.equal(scene.tokens.size, tokens, "the refused totem was planted anyway");
      assert.equal(scene.regions.size, regions, "the refused totem drew an aura anyway");
      assert.equal(two.poolSnapshot().find(p => p.kind === "power").value, mana, "the refused totem cost Mana");

      // AND A LEVEL 11 SHAMAN IS TIER 3 — three, not the four Totem Mastery
      // used to grant. Mana Tide is level 11, so all three are learned.
      // From D-710 this shaman's chooser is a CHECKLIST (Totem Mastery places
      // up to four in one Half-Action), so the three below are placed one at a
      // time on purpose: the ceiling falls 3, 2, 1 with the room, and the
      // fourth is refused before the chooser opens rather than at the bind.
      const three = await shamanOnTheScene("ZZ Tier Three Shaman", 11, { x: 2800, y: 1800 });
      for (const name of ["Stoneskin", "Healing Stream", "Mana Tide"]) await plant(three, name);
      await until(() => boundOf(three, "totem").length === 3, "the tier 3 shaman's three totems", 20000);
      for (const bound of boundOf(three, "totem")) made.push(bound);
      const { result: fourth, warned: refused } = await warningsDuring(() => plant(three, "Windfury"));
      assert.isNull(fourth, "a tier 3 shaman planted a fourth totem");
      assert.ok(refused.some(w => /already holds/i.test(w)), `the refusal was not said: ${refused.join(" | ")}`);
      assert.lengthOf(boundOf(three, "totem"), 3, "the fourth totem was bound anyway");
    });

    it("a Searing Totem's blow with nothing targeted never falls back onto its own shaman (the lead's item 24)", async function () {
      this.timeout(240000);
      const { boundOf } = await B();
      const actor = await shamanOnTheScene("ZZ Searing Shaman", 7, { x: 3400, y: 2400 });
      await plant(actor, "Searing");
      const totem = await until(() => boundOf(actor, "totem").find(b => b.name.startsWith("Searing")) ?? null, "the Searing Totem");
      made.push(totem);

      // The table as the lead had it: the SHAMAN's token selected, because it
      // is the one you were just moving, and nothing targeted at all.
      canvas.tokens.setTargets([]);
      const mine = canvas.tokens.get(tokenOf(scene, actor).id);
      assert.ok(mine, "the shaman has no token on the canvas");
      mine.control({ releaseOthers: true });
      await settle();
      assert.include(canvas.tokens.controlled.map(t => t.id), mine.id, "the shaman's token is not selected");

      const before = actor.system.health.value;
      const unpin = pinDie(15);
      let card = null;
      let rollWarnings = [];
      try {
        const rolled = await warningsDuring(() => npcAttackWithDialog(totem, 0));
        card = rolled.result;
        rollWarnings = rolled.warned;
      } finally {
        unpin();
      }
      assert.ok(card, "the totem's attack posted no card");
      made.push(card);
      // The roll itself says there is nobody to hit, and rolls anyway.
      assert.ok(rollWarnings.some(w => w.includes(totem.name)),
        `a bound creature's blow with nothing targeted said nothing: ${rollWarnings.join(" | ")}`);

      const el = document.createElement("div");
      el.innerHTML = card.content;
      const apply = el.querySelector('[data-action="applyDamage"]:not([data-self])');
      assert.ok(apply, "the card carries no Apply damage button");
      assert.isUndefined(apply.dataset.targetIndex, "the card named a target after all");

      try {
        const { warned } = await warningsDuring(() => CARD_ACTIONS.applyDamage(apply, card));
        assert.equal(actor.system.health.value, before, "the totem's own shaman took the damage");
        assert.ok(warned.some(w => w === game.i18n.localize("AZEROTH.Card.NoTargetsButSelf")),
          `the refusal was not said in words: ${warned.join(" | ")}`);
      } finally {
        // A card button with no target row falls back to what is SELECTED, so
        // a token left controlled by this test would answer a later batch's
        // card (`dice/chat.mjs`).
        canvas.tokens.releaseAll();
      }
    });

    it("drags the aura along with the totem, and deletes it with the token", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Drag Shaman", 7, { x: 1000, y: 2000 });
      const { boundOf } = await B();
      // Stoneskin is level 1: a level-7 shaman has not learned Tremor (level
      // 9) and `useFeature` refuses a pick above the level (D-635).
      await plant(actor, "Stoneskin");
      const totem = await until(() => boundOf(actor, "totem")[0] ?? null, "the bound totem");
      made.push(totem);
      const token = await until(() => tokenOf(scene, totem), "the totem's token");
      const region = await until(() => auraOf(scene, totem), "the totem's aura");
      const was = { x: region.shapes[0].x, y: region.shapes[0].y };

      // Core rewrites an attached Region's shapes on the move
      // (`TokenDocument##computeAttachedRegionUpdates`, 14.367). The DOCUMENT
      // is interpolated while the token travels, so wait for the arrival and
      // then for the shape, which is exactly what is asserted.
      const to = { x: token.x + 300, y: token.y };
      await token.update(to);
      await until(() => token.x === to.x, "the totem to finish moving", 20000);
      await until(() => region.shapes[0].x === was.x + 300, "the aura to follow the totem", 20000);
      assert.equal(region.shapes[0].y, was.y, "the aura drifted on the other axis");
      assert.equal(region._source.attachment.token, token.id, "the aura came off its token on the move");

      // And the deletion cascade: core deletes an attached Region with its
      // token, on the designated client and NOT awaited - so poll.
      const regionId = region.id;
      await scene.deleteEmbeddedDocuments("Token", [token.id]);
      await until(() => !scene.regions.get(regionId), "the aura to go with the token", 20000);
    });

    it("takes the totem, its token and its aura away when the encounter ends", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Fight Shaman", 7, { x: 3000, y: 1000 });
      const { boundOf, endBoundEncounter } = await B();
      await plant(actor, "Healing Stream");
      const totem = await until(() => boundOf(actor, "totem")[0] ?? null, "the bound totem");
      const token = await until(() => tokenOf(scene, totem), "the totem's token");
      const region = await until(() => auraOf(scene, totem), "the totem's aura");
      assert.equal(String(region.color).toLowerCase(), ELEMENT_COLORS.water, "Healing Stream's aura is not the Water colour");
      const ids = { actor: totem.id, token: token.id, region: region.id };

      await endBoundEncounter(actor);
      await until(() => !game.actors.get(ids.actor), "the totem to go with the fight", 20000);
      await until(() => !scene.tokens.get(ids.token), "the totem's token to go with it", 20000);
      await until(() => !scene.regions.get(ids.region), "the aura to go with the token", 20000);
    });

    it("joins the fight the shaman is in, on the shaman's Initiative", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Fighting Shaman", 7, { x: 1000, y: 500 });
      const anchor = tokenOf(scene, actor);
      const fight = await Combat.create({ scene: scene.id });
      made.push(fight);
      assert.equal(fight.scene?.id, scene.id, "the fight was not made on the test scene");
      await fight.createEmbeddedDocuments("Combatant", [{ tokenId: anchor.id, sceneId: scene.id, actorId: actor.id }]);
      await until(() => fight.combatants.find(c => c.tokenId === anchor.id), "the shaman's combatant");

      const { boundOf } = await B();
      await plant(actor, "Grounding");
      const totem = await until(() => boundOf(actor, "totem")[0] ?? null, "the bound totem");
      made.push(totem);
      const token = await until(() => tokenOf(scene, totem), "the totem's token");
      const combatant = await until(() => fight.combatants.find(c => c.tokenId === token.id), "the totem's combatant", 20000);
      // D2 §7: a bound creature acts on its owner's Initiative.
      assert.equal(combatant.derivedInitiative, fight.combatants.find(c => c.tokenId === anchor.id).derivedInitiative,
        "the totem does not act on the shaman's Initiative");
    });

    it("binds the totem and says why nothing was planted where the shaman has no token", async function () {
      this.timeout(180000);
      const actor = await makeCharacter({ name: "ZZ Groundless Shaman", classes: [["Shaman", 7]] });
      await until(() => featureNamed(actor, "Totem"), "the Shaman's Totem feature", 20000);
      await fillPools(actor);
      const { boundOf } = await B();
      const before = scene.regions.size;
      const { result: card, warned } = await warningsDuring(() => plant(actor, "Stoneskin"));
      assert.ok(card, "Use on Totem posted no card");
      const totem = await until(() => boundOf(actor, "totem")[0] ?? null, "the bound totem");
      made.push(totem);
      assert.isNull(tokenOf(scene, totem), "a shaman with no token still got a totem on the board");
      assert.equal(scene.regions.size, before, "a shaman with no token still got an aura");
      assert.ok(warned.some(w => /no token on a scene/i.test(w)), `the refusal was not said: ${warned.join(" | ")}`);
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.include(el.textContent, "bound but not planted", "the card does not say why nothing was placed");

      // AND THE SECOND DOOR: the banner plants it once the shaman is standing.
      await actor.update({ "prototypeToken.actorLink": true });
      const data = (await actor.getTokenDocument({ x: 2500, y: 2200, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY })).toObject();
      await scene.createEmbeddedDocuments("Token", [data]);
      await until(() => tokenOf(scene, actor), "the shaman's token");
      const sheet = totem.sheet;
      await sheet.render({ force: true });
      await settle();
      try {
        const button = sheet.element.querySelector('[data-action="plantTotem"]');
        assert.ok(button, "no Plant control on a bound totem standing nowhere");
        assert.isFunction(sheet.options.actions.plantTotem, "plantTotem is not a registered action");
        button.click();
        const token = await until(() => tokenOf(scene, totem), "the totem planted from its banner", 20000);
        const region = await until(() => auraOf(scene, totem), "the aura drawn from the banner", 20000);
        assert.equal(region.shapes[0].radius, pixelsPerFoot(scene) * 30, "the banner's aura is not thirty feet");
        assert.equal(region._source.attachment.token, token.id);
      } finally {
        await sheet.close();
      }
    });

    it("still lists the whole table in order, and a dismissed chooser costs nothing and plants nothing", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Chooser Shaman", 7, { x: 3500, y: 2500 });
      const feature = featureNamed(actor, "Totem");
      const { featureChoices } = await import("../dice/workflows.mjs");
      const options = await featureChoices(actor, feature);
      // D-635's contract, which this change must not have moved.
      assert.deepEqual(options.map(o => o.name),
        ["Stoneskin", "Searing", "Healing Stream", "Windfury", "Grounding", "Tremor", "Mana Tide"],
        "the chooser no longer lists 02 §7's whole table in level order");
      // EVERY ONE OF THEM NOW HAS A BLOCK IN 14 (the other half of D-708).
      assert.ok(options.every(o => o.uuid?.startsWith("Compendium.azeroth-rpg.bestiary.")),
        `a totem with no block in 14: ${options.filter(o => !o.uuid).map(o => o.name).join(", ")}`);
      // And every one of them reaches somewhere, off its own row.
      for (const o of options) {
        assert.ok(totemAura({ name: o.name, description: o.description }), `${o.name} names no distance in 02 §7`);
      }

      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      const before = mana.value;
      const tokens = scene.tokens.size;
      const regions = scene.regions.size;
      const messages = game.messages.size;
      const dismissed = game.system.azeroth.workflows.useFeature({ actor, item: feature });
      const chooser = await openChooser(feature);
      assert.ok(chooser, "Use on Totem opened no chooser");
      await chooser.close();
      assert.isNull(await dismissed, "a dismissed chooser still used the feature");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, before, "a dismissed chooser spent Mana");
      assert.equal(scene.tokens.size, tokens, "a dismissed chooser planted a totem");
      assert.equal(scene.regions.size, regions, "a dismissed chooser drew an aura");
      assert.equal(game.messages.size, messages, "a dismissed chooser posted a card");
    });

    it("plants nothing when the Mana is short, because payment comes first", async function () {
      this.timeout(180000);
      const actor = await shamanOnTheScene("ZZ Broke Shaman", 7, { x: 500, y: 2500 });
      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: 0 });
      const tokens = scene.tokens.size;
      const regions = scene.regions.size;
      // Stoneskin is level 1, so the refusal is the MANA and not the level.
      const { result: card } = await warningsDuring(() => plant(actor, "Stoneskin"));
      assert.isNull(card, "a shaman with no Mana still used the feature");
      assert.equal(scene.tokens.size, tokens, "a refused payment still planted a totem");
      assert.equal(scene.regions.size, regions, "a refused payment still drew an aura");
      // The bind still happened (D-643 binds before it pays); clear it up.
      const { boundOf } = await B();
      for (const bound of boundOf(actor, "totem")) made.push(bound);
    });

    /* ---- Totem Mastery: four totems in one Half-Action (02 §7, D-710) ---- */

    it("stamps four picks and sixty feet on a level 11 Totem, and one and thirty on a level 7's", async function () {
      this.timeout(120000);
      const early = await makeCharacter({ name: "ZZ Pre-Mastery Shaman", classes: [["Shaman", 7]] });
      await until(() => featureNamed(early, "Totem"), "the level 7 Totem feature", 20000);
      const before = featureNamed(early, "Totem");
      assert.equal(before.system.picks, 1, "a level 7 Totem places more than one");
      assert.equal(before.system.area, "A 30 ft radius centered on you", "a level 7 Totem does not hold 02 §7's thirty feet");
      assert.notInclude(before.system.modifiedBy, "Totem Mastery", "Totem Mastery reached a level 7 shaman");
      assert.isNull(featureNamed(early, "Totem Mastery"), "Totem Mastery is held below level 11");

      // ELEVEN: the feature the level grants patches the feature it names
      // (D-710), and the sync is the only thing that stamps it.
      const master = await makeCharacter({ name: "ZZ Mastery Shaman", classes: [["Shaman", 11]] });
      await until(() => featureNamed(master, "Totem Mastery"), "Totem Mastery", 20000);
      const totem = await until(() => {
        const f = featureNamed(master, "Totem");
        return f?.system?.picks === 4 ? f : null;
      }, "the Totem feature restamped at four picks", 20000);
      assert.equal(totem.system.area, "A 60 ft radius centered on you", "Totem Mastery's sixty feet did not reach the feature");
      assert.include(totem.system.modifiedBy, "Totem Mastery", "the feature does not name what changed it");
      // What Totem Mastery does NOT change: the action and the Mana are the
      // Totem feature's own, and each totem still pays the 2.
      assert.equal(totem.system.action, "half");
      assert.equal(totem.system.cost.amount, 2);
      assert.equal(totem.system.choice, "totems");

      // AND THE SHEET SAYS SO (D-681: the consumer, not the field). The
      // feature row carries the count as a chip beside the Mana, and the name
      // of what changed it beside that.
      const sheet = master.sheet;
      await sheet.render({ force: true });
      await settle();
      try {
        const row = await until(() => sheet.element.querySelector(`.azeroth-feature[data-item-id="${totem.id}"]`), "the Totem row", 20000);
        const chips = [...row.querySelectorAll(".azeroth-feature-chip")].map(c => c.textContent.trim());
        assert.include(chips, "up to 4", `the Totem row does not say how many it places: ${chips.join(" | ")}`);
        assert.include(chips, "Totem Mastery", `the Totem row does not name what changed it: ${chips.join(" | ")}`);
        assert.deepEqual(checkText(row), [], "the feature row breaks the legibility floor");
      } finally {
        await sheet.close();
      }
    });

    it("places three at level 11 for one Half-Action and 6 Mana, each in its own square inside its own aura", async function () {
      this.timeout(300000);
      const { boundOf } = await B();
      const actor = await shamanOnTheScene("ZZ Mastery Plant Shaman", 11, { x: 600, y: 600 });
      await until(() => featureNamed(actor, "Totem")?.system?.picks === 4, "the Totem feature at four picks", 20000);

      // In a fight, so the turn's budget is real: ONE Half-Action for all
      // three, which is the whole of what Totem Mastery buys.
      const anchor = tokenOf(scene, actor);
      const fight = await Combat.create({ scene: scene.id });
      made.push(fight);
      // ACTIVATE BEFORE STARTING, as every other batch does. Core's
      // `CombatTracker#_onRender` does `"turn" in renderData.find(d => d._id
      // === this.viewed?.id)` (14.367) and throws on the undefined when the
      // combat that moved is not the viewed one - a page error the smoke run
      // fails on, for a fault in core rather than in the fight.
      await fight.activate();
      const [combatant] = await fight.createEmbeddedDocuments("Combatant", [{ tokenId: anchor.id, sceneId: scene.id, actorId: actor.id }]);
      await fight.startCombat();
      await until(() => fight.started && combatant.budget.halfActions === 2, "a fresh budget", 20000);

      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      const before = mana.value;
      const tokens = scene.tokens.size;
      const card = await plant(actor, "Stoneskin", "Healing Stream", "Windfury");
      assert.ok(card, "three picks posted no card");

      // THREE BOUND, THREE PLANTED, THREE AURAS.
      await until(() => boundOf(actor, "totem").length === 3, "the three bound totems", 20000);
      const bound = boundOf(actor, "totem");
      for (const b of bound) made.push(b);
      assert.deepEqual(bound.map(b => b.name).sort(), ["Healing Stream Totem", "Stoneskin Totem", "Windfury Totem"].sort());
      await until(() => scene.tokens.size === tokens + 3, "three totem tokens", 20000);
      const spots = [];
      for (const b of bound) {
        const token = await until(() => tokenOf(scene, b), `${b.name}'s token`, 20000);
        const region = await until(() => auraOf(scene, b), `${b.name}'s aura`, 20000);
        assert.equal(region._source.attachment.token, token.id, `${b.name}'s aura is not attached to its token`);
        const feet = b.name.startsWith("Windfury") ? 15 : 30;
        assert.equal(region.shapes[0].radius, pixelsPerFoot(scene) * feet, `${b.name}'s aura is not 02 §7's ${feet} feet`);
        spots.push(`${token.x},${token.y}`);
      }
      assert.lengthOf(new Set(spots), 3, `the totems were stacked: ${spots.join(" | ")}`);

      // ONE HALF-ACTION, and 2 Mana EACH.
      await until(() => actor.poolSnapshot().find(p => p.kind === "power").value === before - 6, "6 Mana spent", 20000);
      assert.equal(combatant.budget.halfActions, 1, "three totems in one use spent more than one Half-Action");

      // ONE CARD, naming all three and saying where each stands.
      const el = document.createElement("div");
      el.innerHTML = card.content;
      const planted = [...el.querySelectorAll(".azeroth-card-line")].map(p => p.textContent).filter(t => /stands within 5 feet/.test(t));
      assert.lengthOf(planted, 3, `the card does not say where all three stand: ${el.textContent}`);
      for (const name of ["Stoneskin", "Healing Stream", "Windfury"]) {
        assert.include(el.querySelector(".azeroth-chosen").textContent, name, `the card does not name ${name}`);
      }
      assert.deepEqual(card.flags["azeroth-rpg"].choices, ["Stoneskin", "Healing Stream", "Windfury"]);
      assert.equal(card.flags["azeroth-rpg"].choice, "Stoneskin", "the single-pick flag stopped naming the first pick");
      assert.deepEqual(checkText(el), [], "the card breaks the legibility floor");
    });

    it("offers only the room the tier leaves, and refuses before the chooser when none is left", async function () {
      this.timeout(300000);
      const { boundOf } = await B();
      const actor = await shamanOnTheScene("ZZ Mastery Room Shaman", 11, { x: 3500, y: 600 });
      await until(() => featureNamed(actor, "Totem")?.system?.picks === 4, "the Totem feature at four picks", 20000);
      const feature = featureNamed(actor, "Totem");
      const { featureChoices } = await import("../dice/workflows.mjs");
      const options = await featureChoices(actor, feature);

      /** Open the chooser, read its prompt, and dismiss it. */
      const promptFor = async () => {
        const used = game.system.azeroth.workflows.useFeature({ actor, item: feature });
        const chooser = await openChooser(feature, used);
        if (!chooser) { await used; return null; }
        const prompt = chooser.element.querySelector(".azeroth-choose-prompt")?.textContent
          ?? chooser.element.querySelector("label[for=azeroth-choose-select]")?.textContent ?? "";
        assert.deepEqual(checkText(chooser.element.querySelector(".azeroth-choose")), [],
          "the checklist chooser breaks the legibility floor");
        await chooser.close();
        assert.isNull(await used, "a dismissed chooser still used the feature");
        return prompt;
      };

      // A TIER 3 SHAMAN WITH NOTHING STANDING: up to three of the four.
      const mana = actor.poolSnapshot().find(p => p.kind === "power").value;
      const tokens = scene.tokens.size;
      const messages = game.messages.size;
      assert.match(await promptFor(), /Up to 3/, "the chooser does not offer the room the tier leaves");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, mana, "a dismissed checklist spent Mana");
      assert.equal(scene.tokens.size, tokens, "a dismissed checklist planted a totem");
      assert.equal(game.messages.size, messages, "a dismissed checklist posted a card");

      // ONE STANDING: up to two.
      await plant(actor, "Stoneskin");
      await until(() => boundOf(actor, "totem").length === 1, "the first totem", 20000);
      for (const b of boundOf(actor, "totem")) made.push(b);
      assert.match(await promptFor(), /Up to 2/, "the chooser does not count what is already standing");

      // AT CAPACITY: no chooser at all, and the refusal is said in words.
      await plant(actor, "Healing Stream", "Windfury");
      await until(() => boundOf(actor, "totem").length === 3, "the tier 3 shaman's three totems", 20000);
      for (const b of boundOf(actor, "totem")) made.push(b);
      const standing = scene.tokens.size;
      const { result: refused, warned } = await warningsDuring(() => plant(actor, "Grounding"));
      assert.isNull(refused, "a shaman at capacity placed another totem");
      assert.ok(warned.some(w => /already holds/i.test(w)), `the refusal was not said: ${warned.join(" | ")}`);
      assert.equal(scene.tokens.size, standing, "the refused use still planted something");
      assert.lengthOf(boundOf(actor, "totem"), 3, "the refused use still bound something");
    });

    it("refuses three totems on four Mana before anything is bound, and plants none of them", async function () {
      this.timeout(240000);
      const { boundOf } = await B();
      const actor = await shamanOnTheScene("ZZ Mastery Broke Shaman", 11, { x: 600, y: 2600 });
      await until(() => featureNamed(actor, "Totem")?.system?.picks === 4, "the Totem feature at four picks", 20000);
      const mana = actor.poolSnapshot().find(p => p.kind === "power");
      await actor.updatePool({ itemId: mana.itemId, kind: "power", value: 4 });
      const tokens = scene.tokens.size;
      const regions = scene.regions.size;
      const messages = game.messages.size;

      // 2 Mana EACH, so three cost 6 and four are not enough - and the refusal
      // comes BEFORE the bind, which the single-pick path cannot do (D-643).
      const { result: card, warned } = await warningsDuring(() => plant(actor, "Stoneskin", "Searing", "Healing Stream"));
      assert.isNull(card, "a shaman short of Mana still placed three totems");
      assert.ok(warned.some(w => /Not enough/i.test(w)), `the refusal was not said: ${warned.join(" | ")}`);
      assert.lengthOf(boundOf(actor, "totem"), 0, "a refused payment still bound a totem");
      assert.equal(scene.tokens.size, tokens, "a refused payment still planted a totem");
      assert.equal(scene.regions.size, regions, "a refused payment still drew an aura");
      assert.equal(game.messages.size, messages, "a refused payment still posted a card");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, 4, "a refused payment still spent Mana");

      // And TWO of them, which the four Mana does cover, go up.
      const two = await plant(actor, "Stoneskin", "Searing");
      assert.ok(two, "two totems on four Mana were refused");
      await until(() => boundOf(actor, "totem").length === 2, "the two totems", 20000);
      for (const b of boundOf(actor, "totem")) made.push(b);
      await until(() => actor.poolSnapshot().find(p => p.kind === "power").value === 0, "the four Mana spent", 20000);
    });

    /**
     * A shaman standing in a started fight with both Half-Actions already
     * spent: the state in which the budget refuses AFTER the bind.
     */
    async function outOfActions(actor) {
      const anchor = tokenOf(scene, actor);
      const fight = await Combat.create({ scene: scene.id });
      made.push(fight);
      // ACTIVATE BEFORE STARTING (core's tracker throws on an update to a
      // combat it is not viewing - see the three-totem test above).
      await fight.activate();
      const [combatant] = await fight.createEmbeddedDocuments("Combatant", [{ tokenId: anchor.id, sceneId: scene.id, actorId: actor.id }]);
      await fight.startCombat();
      await until(() => fight.started && combatant.budget.halfActions === 2, "a fresh budget", 20000);
      await combatant.spendAction("half");
      await combatant.spendAction("half");
      await until(() => combatant.budget.halfActions === 0, "both Half-Actions spent", 20000);
      return { fight, combatant };
    }

    /**
     * A REFUSAL AFTER THE BIND PUTS THE CREATURE BACK (D-710). The bind is step
     * 1b and the budget 1c, so a shaman with no Half-Action left used to end
     * the use with a totem standing in the *Bound* folder that nobody had
     * placed and nobody had paid for - one before Totem Mastery and up to four
     * after it. Both counts are asserted: what the bond holds, and what the
     * world holds.
     */
    async function refusedAfterBind(actor, names) {
      const { bondOf, boundCount } = await B();
      const feature = featureNamed(actor, "Totem");
      const before = {
        bound: boundCount(actor, "totem"),
        known: (feature.system.known ?? []).length,
        actors: game.actors.size,
        tokens: scene.tokens.size,
        regions: scene.regions.size,
        messages: game.messages.size,
        mana: actor.poolSnapshot().find(p => p.kind === "power").value
      };
      const { result, warned } = await warningsDuring(() => plant(actor, ...names));
      assert.isNull(result, "a shaman with no Half-Action left still used the feature");
      assert.ok(warned.some(w => /Half-Action/i.test(w)), `the budget refusal was not said: ${warned.join(" | ")}`);
      // THE STATE FIRST, the sentence after: a failure has to name the damage
      // rather than the missing words. Everything back where it was - the bond,
      // the feature's own list, the world's actors (so the Bound folder holds no
      // orphan), the board, the Mana.
      await until(() => game.actors.size === before.actors, "the bound creature to go back", 20000);
      assert.equal(boundCount(actor, "totem"), before.bound, "the refused use left a totem bound");
      assert.equal((featureNamed(actor, "Totem").system.known ?? []).length, before.known, "the refused use left the totem on the feature's known list");
      assert.equal(scene.tokens.size, before.tokens, "the refused use planted a token");
      assert.equal(scene.regions.size, before.regions, "the refused use drew an aura");
      assert.equal(game.messages.size, before.messages, "the refused use posted a card");
      assert.equal(actor.poolSnapshot().find(p => p.kind === "power").value, before.mana, "the refused use spent Mana");
      const folder = game.folders.find(f => f.type === "Actor" && f.name === game.i18n.localize("AZEROTH.Bound.Folder")) ?? null;
      const left = folder ? game.actors.filter(a => a.folder?.id === folder.id && /Totem$/.test(a.name) && !bondOf(a)) : [];
      assert.lengthOf(left, 0, `the Bound folder kept an orphan: ${left.map(a => a.name).join(", ")}`);
      // And it is said in words beside the refusal, never left to the folder.
      assert.ok(warned.some(w => /went back/i.test(w)), `the unbinding was not said in words: ${warned.join(" | ")}`);
    }

    it("puts every totem back when the turn's budget refuses after the bind (D-710)", async function () {
      this.timeout(300000);
      const actor = await shamanOnTheScene("ZZ No Actions Shaman", 11, { x: 2200, y: 2600 });
      await until(() => featureNamed(actor, "Totem")?.system?.picks === 4, "the Totem feature at four picks", 20000);
      await outOfActions(actor);
      // Three picks, and all three go back.
      await refusedAfterBind(actor, ["Stoneskin", "Healing Stream", "Windfury"]);
    });

    it("puts the one totem back too, where the pick is single (D-710)", async function () {
      this.timeout(300000);
      // A LEVEL 7 SHAMAN takes one pick, so this is the path every feature
      // that binds has taken since D-643 and the fault it had all along.
      const actor = await shamanOnTheScene("ZZ One Action Shaman", 7, { x: 100, y: 100 });
      await outOfActions(actor);
      await refusedAfterBind(actor, ["Stoneskin"]);
    });

    it("places all four at level 16, where the tier stands four (D-709, D-710)", async function () {
      this.timeout(300000);
      const { boundOf } = await B();
      const actor = await shamanOnTheScene("ZZ Tier Four Shaman", 16, { x: 3500, y: 200 });
      await until(() => featureNamed(actor, "Totem")?.system?.picks === 4, "the Totem feature at four picks", 20000);
      const mana = actor.poolSnapshot().find(p => p.kind === "power").value;
      const tokens = scene.tokens.size;
      const card = await plant(actor, "Stoneskin", "Searing", "Healing Stream", "Windfury");
      assert.ok(card, "four picks posted no card");
      await until(() => boundOf(actor, "totem").length === 4, "the tier 4 shaman's four totems", 20000);
      for (const b of boundOf(actor, "totem")) made.push(b);
      await until(() => scene.tokens.size === tokens + 4, "four totem tokens", 20000);
      await until(() => actor.poolSnapshot().find(p => p.kind === "power").value === mana - 8, "8 Mana spent", 20000);
      const el = document.createElement("div");
      el.innerHTML = card.content;
      assert.lengthOf([...el.querySelectorAll(".azeroth-card-line")].map(p => p.textContent).filter(t => /stands within 5 feet/.test(t)), 4,
        "the card does not say where all four stand");
    });
  });
}
