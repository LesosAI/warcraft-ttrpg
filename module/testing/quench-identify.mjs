/**
 * **08 §4's UNIDENTIFIED ITEMS AND 08 §14's SCROLLS, THROUGH THE REAL CONTROLS** (D-1435,
 * D-1436; the plan's Verification). Two batches, each run alone:
 *
 * - `azeroth-rpg.identify`: the stamp on arrival and its opt-outs, the item menu's Identify with
 *   the die pinned (a failure marks the item tried, a second press is refused in words, the Long
 *   Rest clears the mark, a success writes it known), an Epic's stone, the locked Use and spells
 *   beside a passive that still works, and the GM's Identified box written through the form.
 * - `azeroth-rpg.scrolls`: a GM's spell dropped on a blank scroll's sheet with the writer's total
 *   answered in the dialog, the refusals, a non-caster reading one of a stack of two from the
 *   menu with no dialog, a scroll written below its DC that fails and is still spent, and the
 *   reader's Spell DC (or the writer's level) on the card.
 *
 * PHASE 4 adds the surfaces: a player-view render (the sheet drawn with `game.user.isGM` stubbed
 * false for the length of one render, the only user in the test world), the GM's controls greyed
 * and said and refused when forced, the GM box against a stale sheet, the loot window's row and
 * the settle's stamp, a find dropped on a known twin, a character created with its things on it,
 * the Rare stone, and the scroll's single-target DC, its resist DC and its *Written at* row.
 */

import { bagZone, cleanup, dialogFor, forgeDrop, fromPack, gearInspector, gearTile, give, inspect, made, makeCharacter, makeNpc, openSheet, pinDie, settle, warnings, KNOWN, PACK_FOR } from "./fixtures.mjs";
import { until } from "./quench-chronomancer-common.mjs";
import { attackWithDialog, castItemSpell, reactionRows } from "../applications/actions.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { sourceOf } from "../applications/roll-dialog.mjs";
import { disguisedNameOf } from "../helpers/identify-words.mjs";
import { isUnidentified, triedThisRest } from "../rules/identify.mjs";
import { isInscribed } from "../rules/scrolls.mjs";
import { stackKey } from "../rules/slots.mjs";
import { lootOffer } from "../settings.mjs";
import { cancelOffer, claimLootQueryHandler, presentLoot } from "../documents/loot-offer.mjs";

const SCOPE = "azeroth-rpg";
const flag = (item, key) => item?.flags?.[SCOPE]?.[key];
const lastMessage = pred => [...game.messages].reverse().find(pred) ?? null;

/** Open the row menu on a bag tile and answer its entries' words. */
async function openMenu(sheet, id) {
  document.querySelector("#context-menu")?.remove();
  sheet.changeTab("gear", "primary");
  await settle();
  const row = gearTile(sheet, id);
  if (!row) throw new Error(`no bag tile for ${id}`);
  const r = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 }));
  await new Promise(res => setTimeout(res, 400));
  const menu = document.querySelector("#context-menu");
  return menu ? [...menu.querySelectorAll(".context-item")] : [];
}

/** Press one entry of a row's menu by its words. */
async function pressMenu(sheet, id, key) {
  const label = game.i18n.localize(key);
  const entry = (await openMenu(sheet, id)).find(i => i.textContent.trim() === label);
  if (!entry) throw new Error(`no ${label} on the row`);
  entry.click();
}

/** The roll dialog, answered with its Roll. */
async function rollTheDialog(actor) {
  const dialog = await dialogFor(actor, 8000);
  if (!dialog) throw new Error("the roll dialog did not open");
  dialog.element.querySelector('button[data-action="roll"]').click();
}

/** An open DialogV2 by its class, or null after `ms`. */
async function dialogByClass(cls, ms = 6000) {
  for (let i = 0; i < ms / 50; i++) {
    const app = [...foundry.applications.instances.values()].find(a => a.rendered && a.element?.classList?.contains(cls));
    if (app) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/**
 * **RUN `fn` AS A PLAYER SEES IT** (Phase 4): `game.user.isGM` reads false until `fn` settles. The
 * test world holds one user, so nothing else is looking; `quench-animation.mjs#asPlayer` is the
 * synchronous shape. Every surface asks `hiddenFrom(item, {isGM: game.user.isGM})`, so this is
 * exactly the question a player's client answers.
 */
async function asPlayer(fn) {
  Object.defineProperty(game.user, "isGM", { value: false, configurable: true });
  try {
    return await fn();
  } finally {
    delete game.user.isGM;
  }
}

/** A target snapshot with no token, as `targetSnapshots` shapes one (`quench-class-answers.mjs`). */
const rowOf = (actor, extra = {}) => ({
  tokenId: null, sceneId: null, actorId: actor.id, name: actor.name, defense: 10,
  apByLocation: { body: 0, head: 0, limb: 0 }, absent: [], wardBySchool: {}, schoolArmor: {}, immune: [], vulnerable: [],
  statuses: [...(actor.statuses ?? [])], conditions: {}, size: null, swarm: false, creatureType: null, acted: null,
  speedDropped: false, health: { value: actor.system?.health?.value ?? 0, max: actor.system?.health?.max ?? 0 }, ...extra
});

/**
 * **EVERYTHING POSTED AND SAID WHILE `fn` RUNS** (the final review's behavioural guard): the
 * content and flavor of every chat message created - what a player READS - and every warning and
 * info line, as one string a test asserts the true name is absent from. A card's FLAGS are left
 * out on purpose: the strike record keeps the weapon's identifier, which the claws' rule and the
 * animation read, and its name beside it, and a flag reaches nobody but a console (the plan:
 * *"Console access is out of scope"*).
 */
async function everythingSaid(fn) {
  const before = new Set(game.messages.map(m => m.id));
  const said = [];
  const held = { warn: ui.notifications.warn, info: ui.notifications.info };
  ui.notifications.warn = (...args) => { said.push(String(args[0] ?? "")); return null; };
  ui.notifications.info = (...args) => { said.push(String(args[0] ?? "")); return null; };
  try {
    await fn();
    await new Promise(r => setTimeout(r, 300));
  } finally {
    ui.notifications.warn = held.warn;
    ui.notifications.info = held.info;
  }
  const posted = game.messages.filter(m => !before.has(m.id))
    .map(m => JSON.stringify([m.content, m.flavor ?? ""]));
  return { posted, said, all: [...posted, ...said].join("\n") };
}

/** A weapons-pack document by its rarity, read off the index. */
async function weaponOf(rarity, predicate = () => true) {
  const pack = game.packs.get(PACK_FOR.weapon);
  const index = await pack.getIndex({ fields: ["system.rarity", "system.signatureEffect", "system.spells", "system.isLauncher", "system.range"] });
  const entry = index.find(e => e.system?.rarity === rarity && predicate(e));
  if (!entry) throw new Error(`the weapons pack holds no ${rarity} weapon that fits`);
  return pack.getDocument(entry._id);
}

export function identifyBatch(context) {
  const { describe, it, after } = context;
  const { assert } = context;
  // The fixtures' sweep takes longer than Mocha's 2 s default once a batch has made a dozen actors.
  after(async function () { this.timeout(120000); await cleanup(); });

  describe("08 §4: a found thing arrives unidentified, and a fixture's arrives known", function () {
    it("stamps a Rare a GM embeds on a character, and nothing on a creature or a world item", async function () {
      this.timeout(60000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify stamp" });
      const [found] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      assert.strictEqual(flag(found, "unidentified"), true, "a Rare embedded on a character was not stamped");
      assert.ok(isUnidentified(found));
      // A fixture states what the character holds: known is written false, never left absent.
      const [known] = await actor.createEmbeddedDocuments("Item", [rare.toObject()], { ...KNOWN });
      assert.strictEqual(flag(known, "unidentified"), false, "an opted-out arrival was not written known");
      const npc = await makeNpc("Kobold");
      const [held] = await npc.createEmbeddedDocuments("Item", [rare.toObject()]);
      assert.strictEqual(flag(held, "unidentified"), undefined, "a creature's thing was stamped");
      const world = await Item.create(rare.toObject());
      made.push(world);
      assert.strictEqual(flag(world, "unidentified"), undefined, "a world item was stamped");
      // A Common thing is never stamped.
      const torch = await give(actor, "Torch", PACK_FOR.equipment, { unidentified: true });
      assert.strictEqual(flag(torch, "unidentified"), undefined, "a Common thing was stamped");
    });
  });

  describe("08 §4: the Identify menu entry, with the die pinned", function () {
    it("a failure marks it tried, a second press is refused in words, the Long Rest clears it, and a success writes it known", async function () {
      this.timeout(120000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify door", abilities: { int: 10 } });
      const [item] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      assert.ok(isUnidentified(item));
      // A Rare attempt uses up a Lesser magic essence (the lead, 2026-11-21): two, one a try.
      const stone = await give(actor, "Lesser magic essence");
      await stone.update({ "system.quantity": 2 });
      const sheet = await openSheet(actor);
      try {
        // A failure: the face is 2, against DC 16.
        let unpin = pinDie(2);
        try {
          await pressMenu(sheet, item.id, "AZEROTH.Identify.Menu");
          await rollTheDialog(actor);
          await until(() => triedThisRest(actor.items.get(item.id)), "the tried mark");
        } finally { unpin(); }
        assert.ok(isUnidentified(actor.items.get(item.id)), "a failed Test identified the item");
        const card = await until(() => lastMessage(m => m.flags?.[SCOPE]?.kind === "identify" && m.flags[SCOPE].itemId === item.id), "the Identify card");
        assert.strictEqual(card.flags[SCOPE].success, false);

        // A second press is refused in words and opens no dialog.
        const said = await warnings(async () => {
          await pressMenu(sheet, item.id, "AZEROTH.Identify.Menu");
          await new Promise(r => setTimeout(r, 400));
        });
        assert.ok(said.length > 0, "the second press was not refused in words");
        assert.notOk(await dialogFor(actor, 600), "a second try opened the dialog");

        // The Long Rest gives the Test back.
        await actor.longRest();
        await until(() => !triedThisRest(actor.items.get(item.id)), "the Long Rest clearing the mark");

        // A success: the face is 20.
        unpin = pinDie(20);
        try {
          await pressMenu(sheet, item.id, "AZEROTH.Identify.Menu");
          await rollTheDialog(actor);
          await until(() => flag(actor.items.get(item.id), "unidentified") === false, "the item written known");
        } finally { unpin(); }
        assert.notOk(isUnidentified(actor.items.get(item.id)));
        assert.strictEqual(flag(actor.items.get(item.id), "identifyTried"), undefined, "the tried mark outlived the success");
        // Both essences are gone, the failure's and the success's (08 §4: *whether the Test succeeds or fails*).
        await until(() => !actor.items.get(stone.id), "both essences used up");
      } finally {
        document.querySelector("#context-menu")?.remove();
        await sheet.close();
      }
    });

    it("a Rare with no Lesser magic essence is refused in words, with nothing spent", async function () {
      this.timeout(60000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify rare stone" });
      const [item] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      // A Greater essence is not the Lesser one the Rare row names.
      const greater = await give(actor, "Greater magic essence");
      const said = await warnings(() => game.system.azeroth.workflows.identifyTest({ actor, item }));
      assert.ok(said.some(w => /Lesser magic essence/i.test(w)), `the refusal did not name the stone: ${said.join(" | ")}`);
      assert.notOk(await dialogFor(actor, 600), "a refused attempt opened the dialog");
      assert.notOk(triedThisRest(actor.items.get(item.id)), "a refused attempt marked the item");
      assert.strictEqual(actor.items.get(greater.id)?.system?.quantity ?? 1, 1, "a refused attempt spent a stone");
    });

    it("an Epic with no stone is refused with nothing spent; with two, a failure leaves one", async function () {
      this.timeout(120000);
      const epic = await weaponOf("epic");
      const actor = await makeCharacter({ name: "ZZ Identify stone" });
      const [item] = await actor.createEmbeddedDocuments("Item", [epic.toObject()]);
      const said = await warnings(() => game.system.azeroth.workflows.identifyTest({ actor, item }));
      assert.ok(said.length, "an Epic with no stone was not refused in words");
      assert.notOk(triedThisRest(actor.items.get(item.id)), "a refused attempt marked the item");

      const stone = await give(actor, "Greater magic essence");
      await stone.update({ "system.quantity": 2 });
      const unpin = pinDie(2);
      try {
        const pending = game.system.azeroth.workflows.identifyTest({ actor, item });
        await rollTheDialog(actor);
        await pending;
      } finally { unpin(); }
      await until(() => actor.items.get(stone.id)?.system?.quantity === 1, "one essence used up");
      assert.ok(triedThisRest(actor.items.get(item.id)));
    });
  });

  describe("08 §4: an unidentified item works, and its Use and spells are locked", function () {
    it("Benediction's spell is refused in words, and its sheet draws no Cast", async function () {
      this.timeout(60000);
      const benediction = await weaponOf("epic", e => (e.system?.spells ?? []).length > 0);
      const actor = await makeCharacter({ name: "ZZ Identify lock", classes: [["Priest", 5]] });
      const [item] = await actor.createEmbeddedDocuments("Item", [benediction.toObject()]);
      assert.ok(isUnidentified(item));
      const said = await warnings(() => castItemSpell(actor, item, 0));
      assert.ok(said.length, "the locked spell was not refused in words");
      const sheet = await openSheet(item);
      try {
        assert.notOk(sheet.element.querySelector('[data-action="castItemSpell"]'), "an unidentified item's sheet drew a Cast");
      } finally { await sheet.close(); }
      const used = await warnings(() => game.system.azeroth.workflows.useSignature({ actor, item }));
      assert.ok(used.length, "the locked Use was not refused in words");
    });
  });

  describe("08 §4: the GM's Identified box", function () {
    it("writes the flag both ways through the form", async function () {
      this.timeout(60000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify box" });
      const [item] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      const sheet = await openSheet(item);
      try {
        let box = sheet.element.querySelector("input[data-identify-toggle]");
        assert.ok(box, "no Identified box for a GM");
        assert.notOk(box.checked, "an unidentified item's box is ticked");
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => flag(actor.items.get(item.id), "unidentified") === false, "ticked: written known");
        await settle();
        box = sheet.element.querySelector("input[data-identify-toggle]");
        box.checked = false;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => flag(actor.items.get(item.id), "unidentified") === true, "unticked: written hidden");
        // The rest of the form survives the write (CLAUDE.md §14: read the document back).
        assert.strictEqual(actor.items.get(item.id).name, rare.name);
      } finally { await sheet.close(); }
    });

    it("writes from what the sheet DREW, so a stale sheet never re-hides a thing just identified, and ticking ends the tried mark", async function () {
      this.timeout(60000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify stale box" });
      const [item] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      await item.update({ "flags.azeroth-rpg.identifyTried": true });
      const sheet = await openSheet(item);
      try {
        // A player identifies it while the GM's sheet stands open and is NOT redrawn (the review's S2).
        await item.update({ "flags.azeroth-rpg.unidentified": false }, { render: false });
        await until(() => flag(actor.items.get(item.id), "unidentified") === false, "identified underneath the sheet");
        const box = sheet.element.querySelector("input[data-identify-toggle]");
        assert.strictEqual(box.dataset.was, "false", "the box did not record what it drew");
        assert.notOk(box.checked, "the stale box should still read unticked");
        // An unrelated edit submits the form with the stale box in it.
        const name = sheet.element.querySelector('input[name="name"]');
        name.value = `${rare.name} (edited)`;
        name.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => actor.items.get(item.id).name.endsWith("(edited)"), "the name edit");
        assert.strictEqual(flag(actor.items.get(item.id), "unidentified"), false, "a stale box re-hid a thing a player identified");
        // Ticking it ends the tried mark (S3).
        await item.update({ "flags.azeroth-rpg.unidentified": true });
        await settle();
        const fresh = sheet.element.querySelector("input[data-identify-toggle]");
        fresh.checked = true;
        fresh.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => flag(actor.items.get(item.id), "unidentified") === false, "ticked: known");
        await until(() => flag(actor.items.get(item.id), "identifyTried") === undefined, "the tried mark ended with the tick");
      } finally { await sheet.close(); }
    });
  });

  describe("08 §4: wearing and taking off never moves the identified state", function () {
    it("an unidentified Rare stays unidentified and a known one stays known through Equip and Unequip from the row's menu, with the item sheet open", async function () {
      this.timeout(120000);
      const rare = await weaponOf("rare");
      const actor = await makeCharacter({ name: "ZZ Identify equip" });
      const [hidden] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      const [known] = await actor.createEmbeddedDocuments("Item", [{ ...rare.toObject(), name: `${rare.name} (known)` }], { ...KNOWN });
      assert.strictEqual(flag(hidden, "unidentified"), true);
      assert.strictEqual(flag(known, "unidentified"), false);
      const item = await openSheet(hidden);
      const sheet = actor.sheet;
      await sheet.render({ force: true });
      try {
        for (const [doc, want] of [[hidden, true], [known, false]]) {
          for (let cycle = 0; cycle < 2; cycle += 1) {
            await pressMenu(sheet, doc.id, "AZEROTH.Sheet.Equip");
            await until(() => actor.items.get(doc.id)?.system?.equipped === true, `${doc.name} worn`);
            await settle();
            assert.strictEqual(flag(actor.items.get(doc.id), "unidentified"), want, `Equip moved the state of ${doc.name}`);
            await pressMenu(sheet, doc.id, "AZEROTH.Sheet.Unequip");
            await until(() => actor.items.get(doc.id)?.system?.equipped === false, `${doc.name} taken off`);
            await settle();
            assert.strictEqual(flag(actor.items.get(doc.id), "unidentified"), want, `Unequip moved the state of ${doc.name}`);
          }
        }
        // The open item sheet still draws the box as it was, and an Equipped tick or a rename does not write it.
        const box = item.element.querySelector("input[data-identify-toggle]");
        assert.ok(box, "no Identified box on the open sheet");
        assert.notOk(box.checked, "the open sheet's box flipped");
        assert.strictEqual(actor.items.get(hidden.id).name, rare.name, "the name moved");
      } finally { await item.close(); }
    });
  });

  describe("08 §4: what a player sees, and what a GM sees (Phase 4)", function () {
    it("a player sees the kind and the rarity on every surface, and none of the numbers; a GM sees the true thing", async function () {
      this.timeout(120000);
      const rare = await weaponOf("rare", e => Boolean(e.system?.signatureEffect));
      const actor = await makeCharacter({ name: "ZZ Identify player view" });
      const [item] = await actor.createEmbeddedDocuments("Item", [rare.toObject()]);
      await item.update({ "system.equipped": true });
      await until(() => actor.items.get(item.id)?.system?.equipped === true, "the sword in hand");
      const disguise = disguisedNameOf(item);
      assert.notEqual(disguise, rare.name);
      assert.include(disguise, game.i18n.localize("AZEROTH.Identify.Disguise").replace("{kind}", "").trim());

      const sheet = actor.sheet;
      try {
        await asPlayer(async () => {
          // A player's client prepares the actor itself: what the sword grants is credited there.
          actor.reset();
          await sheet.render({ force: true });
          await settle();
          // The bag tile: its label and its card.
          sheet.changeTab("gear", "primary");
          await settle();
          const tile = gearTile(sheet, item.id);
          assert.ok(tile, "no tile for the sword");
          const label = tile.getAttribute("aria-label") ?? "";
          assert.include(label, disguise, "the tile's label is not the disguise");
          assert.notInclude(label, rare.name, "the tile's label names the sword");
          const tip = tile.dataset.tooltipHtml ?? "";
          assert.include(tip, disguise);
          assert.notInclude(tip, rare.name);
          assert.include(tip, game.i18n.localize("AZEROTH.Identify.TipLine"), "the card does not say unidentified");
          // The inspector, opened by the real click: no fields, the Identify note, no Signature.
          const card = await inspect(sheet, item.id);
          assert.ok(card, "no inspector card");
          assert.include(card.textContent, disguise);
          assert.notInclude(card.textContent, rare.name, "the inspector names the sword");
          assert.isNull(card.querySelector(".azeroth-bag-inspect-fields"), "the inspector lists the sword's fields");
          assert.ok(card.querySelector(".azeroth-item-unidentified"), "the inspector does not say how to identify it");
          // The paper doll's tile.
          const doll = sheet.element.querySelector(`section[data-tab="overview"] [data-slot][data-item-id="${item.id}"]`);
          assert.ok(doll, "the sword has no paper-doll tile");
          assert.notInclude(doll.getAttribute("aria-label") ?? "", rare.name, "the paper doll names the sword");
          assert.notInclude(doll.dataset.tooltipHtml ?? "", rare.name, "the paper doll's card names the sword");
          // The Combat tab: the kind, a dash for the Rating, and no Signature row.
          const combat = sheet.element.querySelector('section[data-tab="combat"]');
          const row = combat.querySelector(`.azeroth-weapon[data-item-id="${item.id}"]`);
          assert.ok(row, "no weapon row");
          assert.include(row.querySelector(".azeroth-weapon-name").textContent, disguise);
          assert.equal(row.querySelector(".azeroth-weapon-traits").textContent.trim(), "", "the row lists the sword's traits");
          assert.isNull(combat.querySelector(`.azeroth-signatures [data-item-id="${item.id}"]`), "a player sees the sword's Signature row");
          // Anywhere at all: the deepest element whose text names it is reported.
          const naming = [...sheet.element.querySelectorAll("*")]
            .filter(el => el.textContent.includes(rare.name) && ![...el.children].some(c => c.textContent.includes(rare.name)))
            .map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
          assert.deepEqual(naming, [], "the sheet names the sword somewhere");
        });
        // The item sheet as the player sees it: the disguised part alone.
        await asPlayer(async () => {
          const own = await openSheet(item);
          try {
            assert.ok(own.element.querySelector('[data-application-part="unidentified"]'), "a player's item sheet is not the disguised card");
            assert.isNull(own.element.querySelector('[data-application-part="header"]'), "a player's item sheet draws the true header");
            assert.isNull(own.element.querySelector("input[data-identify-toggle]"), "a player's sheet carries the GM's box");
            assert.include(own.title, disguise);
            assert.notInclude(own.element.textContent, rare.name, "the player's item sheet names the sword");
          } finally { await own.close(); }
        });

        // The GM: the true name everywhere, and the item sheet's true parts.
        actor.reset();
        await sheet.render({ force: true });
        await settle();
        sheet.changeTab("gear", "primary");
        await settle();
        assert.include(gearTile(sheet, item.id).getAttribute("aria-label"), rare.name, "the GM's tile is disguised");
        const gmItem = await openSheet(item);
        try {
          assert.ok(gmItem.element.querySelector('[data-application-part="header"]'));
          assert.isNull(gmItem.element.querySelector('[data-application-part="unidentified"]'));
          // Identified while open: a player's sheet switches in place, the stale part gone.
          await asPlayer(async () => {
            await gmItem.render({ force: true });
            await settle();
            assert.ok(gmItem.element.querySelector('[data-application-part="unidentified"]'));
            await item.update({ "flags.azeroth-rpg.unidentified": false });
            await until(() => gmItem.element.querySelector('[data-application-part="header"]'), "the true parts after identifying");
            assert.isNull(gmItem.element.querySelector('[data-application-part="unidentified"]'), "the disguised part outlived the switch");
          });
        } finally { await gmItem.close(); }
      } finally { await sheet.close(); }
    });

    it("nothing posted or said names a hidden Rare: an attack, a Parry, a Block, a gear Use and a special-equipment Use (the final review)", async function () {
      this.timeout(180000);
      const skip = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
      await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
      try {
        const sword = await weaponOf("rare", e => !e.system?.isLauncher && !e.system?.range);
        const shieldDoc = await fromPack(PACK_FOR.armor, "Aegis of the Scarlet Commander");
        const parrier = await makeCharacter({ name: "ZZ Identify parrier", classes: [["Warrior", 5]] });
        const blocker = await makeCharacter({ name: "ZZ Identify blocker", classes: [["Warrior", 5]] });
        const attacker = await makeCharacter({ name: "ZZ Identify swinger", classes: [["Warrior", 1]] });
        // A GM's embed on a character arrives unidentified (no KNOWN): the stamp is the state.
        const [blade] = await parrier.createEmbeddedDocuments("Item", [sword.toObject()]);
        const [shield] = await blocker.createEmbeddedDocuments("Item", [shieldDoc.toObject()]);
        assert.isTrue(isUnidentified(blade) && isUnidentified(shield), "the Rares did not arrive unidentified");
        await blade.update({ "system.equipped": true });
        await shield.update({ "system.equipped": true });
        await until(() => parrier.items.get(blade.id)?.system?.equipped && blocker.items.get(shield.id)?.system?.equipped, "both in hand");
        const names = [sword.name, shieldDoc.name];
        // A leak is reported with the words around it, so the line that carries it can be found.
        const clean = (text, what) => {
          for (const n of names) {
            const at = text.indexOf(n);
            assert.isTrue(at < 0, `${what} names ${n}: ...${text.slice(Math.max(0, at - 160), at + n.length + 60)}...`);
          }
        };

        // 1. The attack card at each, with the Reaction rows the door builds: a player reads it.
        const card = async victim => {
          const target = rowOf(victim);
          const unpin = pinDie(5);
          try {
            return await game.system.azeroth.workflows.rollTest({
              actor: attacker, kind: "attack", dc: 5, title: "ZZ Identify attack", targets: [target],
              reactions: reactionRows([target]), modifiers: [], damage: { rating: 6, kind: "physical" }
            });
          } finally { unpin(); }
        };
        const rage = parrier.poolSnapshot().find(p => p.name === "rage");
        await parrier.updatePool({ itemId: rage.itemId, kind: rage.kind, value: 6 });
        await until(() => (parrier.poolSnapshot().find(p => p.name === "rage")?.value ?? 0) === 6, "the parrier's Rage");
        const atParrier = await card(parrier);
        assert.include(atParrier.content, 'data-action="reactParry"', "the card offers no Parry");
        assert.include(atParrier.content, disguisedNameOf(blade), "the Parry row does not name the kind");
        clean(atParrier.content, "the Parry row");
        const atBlocker = await card(blocker);
        assert.include(atBlocker.content, 'data-action="reactBlock"', "the card offers no Block");
        clean(atBlocker.content, "the Block row");

        // 2. The Parry and the Block pressed: their dialogs' titles, cards and lines.
        const parried = await everythingSaid(async () => {
          const unpin = pinDie(20);
          try { await CARD_ACTIONS.reactParry({ dataset: { targetIndex: "0" } }, atParrier); } finally { unpin(); }
        });
        assert.isAbove(parried.posted.length, 0, "the Parry posted nothing");
        clean(parried.all, "the Parry");
        const blocked = await everythingSaid(() => CARD_ACTIONS.reactBlock({ dataset: { targetIndex: "0" } }, atBlocker));
        assert.isAbove(blocked.posted.length, 0, "the Block posted nothing");
        clean(blocked.all, "the Block");

        // 3. An attack WITH the hidden Rare: its card, its title, its traits.
        const swung = await everythingSaid(async () => {
          const unpin = pinDie(15);
          try { await attackWithDialog(parrier, parrier.items.get(blade.id)); } finally { unpin(); }
        });
        assert.isAbove(swung.posted.length, 0, "the attack posted nothing");
        clean(swung.all, "the attack");

        // 4. A gear Use of a hidden Epic draught, and 5. a special-equipment Use of a hidden Rare belt.
        const flask = await give(blocker, "Flask of Chromatic Resistance", PACK_FOR.equipment, { unidentified: true });
        const belt = await give(blocker, "Spider Belt", PACK_FOR.equipment, { unidentified: true });
        assert.isTrue(isUnidentified(flask) && isUnidentified(belt), "the flask and the belt did not arrive unidentified");
        await belt.update({ "system.equipped": true });
        await until(() => blocker.items.get(belt.id)?.system?.equipped === true, "the belt worn");
        const drunk = await everythingSaid(() => game.system.azeroth.workflows.useGear({ actor: blocker, item: blocker.items.get(flask.id) }));
        assert.isAbove(drunk.posted.length, 0, "the draught posted nothing");
        for (const n of [flask.name]) assert.notInclude(drunk.all, n, "the draught's Use names the flask");
        const belted = await everythingSaid(() => game.system.azeroth.workflows.useGear({ actor: blocker, item: blocker.items.get(belt.id) }));
        assert.isAbove(belted.posted.length, 0, "the belt posted nothing");
        assert.notInclude(belted.all, belt.name, "the belt's Use names the belt");
        const prose = String(belt.system.description ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 40);
        if (prose) assert.notInclude(belted.all, prose, "the belt's card posts its prose");
      } finally {
        await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, skip);
      }
    });

    it("the GM's Signature Use and Cast are greyed and said, and refused in words when forced", async function () {
      this.timeout(120000);
      const benediction = await weaponOf("epic", e => (e.system?.spells ?? []).length > 0 && Boolean(e.system?.signatureEffect));
      const actor = await makeCharacter({ name: "ZZ Identify GM controls", classes: [["Priest", 5]] });
      const [item] = await actor.createEmbeddedDocuments("Item", [benediction.toObject()]);
      await item.update({ "system.equipped": true });
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("spells", "primary");
        await settle();
        const cast = sheet.element.querySelector(`section[data-tab="spells"] .azeroth-item-spell[data-item-id="${item.id}"] [data-action="castItemSpell"]`);
        assert.ok(cast, "the GM sees no From items row for the unidentified item");
        assert.isTrue(cast.disabled, "the Cast is not greyed");
        cast.disabled = false;
        const before = game.messages.size;
        const said = await warnings(async () => { cast.click(); await new Promise(r => setTimeout(r, 500)); });
        assert.ok(said.some(w => w.includes(disguisedNameOf(item))), `the forced Cast was not refused in words: ${said.join(" | ")}`);
        assert.equal(game.messages.size, before, "a forced Cast posted a card");
        // The Signature's Use, where the item has one to press.
        sheet.changeTab("combat", "primary");
        await settle();
        const use = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-signatures li[data-item-id="${item.id}"] [data-action="useSignature"]`);
        if (use) {
          assert.isTrue(use.disabled, "the Use is not greyed");
          assert.equal(use.dataset.tooltip, game.i18n.localize("AZEROTH.Identify.UseLockedShort"), "the greyed Use is not said in words");
          use.disabled = false;
          const used = await warnings(async () => { use.click(); await new Promise(r => setTimeout(r, 500)); });
          assert.ok(used.length, "the forced Use was not refused in words");
        }
      } finally { await sheet.close(); }
    });

    it("a find dropped on a known twin stands beside it, unidentified (M1)", async function () {
      this.timeout(120000);
      const pack = game.packs.get(PACK_FOR.equipment);
      const index = await pack.getIndex({ fields: ["system.rarity", "system.quantity", "system.charges", "system.slot", "system.kind"] });
      let source = null;
      for (const entry of index.filter(e => ["uncommon", "rare"].includes(e.system?.rarity) && Number.isFinite(Number(e.system?.quantity)))) {
        const doc = await pack.getDocument(entry._id);
        if (stackKey(doc.toObject()) !== null) { source = doc; break; }
      }
      if (!source) this.skip();
      const actor = await makeCharacter({ name: "ZZ Identify twin" });
      const [known] = await actor.createEmbeddedDocuments("Item", [source.toObject()], { ...KNOWN });
      assert.strictEqual(flag(known, "unidentified"), false);
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        forgeDrop(bagZone(sheet, ""), { type: "Item", uuid: source.uuid });
        await until(() => actor.items.filter(i => i.name === source.name).length === 2, "a second stack, not a merge");
        const fresh = actor.items.find(i => i.name === source.name && i.id !== known.id);
        assert.strictEqual(flag(fresh, "unidentified"), true, "the newcomer arrived known");
        assert.equal(actor.items.get(known.id).system.quantity, known.system.quantity, "the known stack swallowed the find");
      } finally { await sheet.close(); }
    });

    it("a character created with its things already on it holds them known (S6)", async function () {
      this.timeout(60000);
      const rare = await weaponOf("rare");
      const actor = await Actor.create({ name: "ZZ Identify pregen", type: "character", items: [rare.toObject()] });
      made.push(actor);
      const held = actor.items.find(i => i.name === rare.name);
      assert.ok(held, "the pregen's sword is missing");
      assert.strictEqual(flag(held, "unidentified"), false, "a pregen's sword arrived unidentified or unflagged");
    });

    it("an offered Rare reads as its kind in a player's loot window, and the settle stamps it", async function () {
      this.timeout(180000);
      const rare = await weaponOf("rare");
      const savedCharacter = game.user.character?.id ?? null;
      const looter = await makeCharacter({ name: "ZZ Identify looter" });
      await game.user.update({ character: looter.id });
      const world = await Item.create(rare.toObject());
      made.push(world);
      try {
        if (lootOffer()) await cancelOffer();
        const offer = await presentLoot({ items: [world], copper: 0, label: "ZZ Identify offer", userIds: [game.user.id] });
        assert.ok(offer, "presentLoot refused the offer");
        const win = () => foundry.applications.instances.get("azeroth-loot-offer") ?? null;
        await until(() => win()?.rendered, "the loot window");
        const nameOf = () => win().element.querySelector(".azeroth-loot-offer-name")?.textContent?.trim() ?? "";
        const disguise = disguisedNameOf(game.items.get(world.id));
        await asPlayer(async () => {
          await win().render({ force: true });
          await settle();
          assert.equal(nameOf(), disguise, "a player's row names the find");
          const view = win().element.querySelector('[data-action="lootOfferView"]');
          assert.notInclude(view.dataset.tooltip ?? "", rare.name, "the View button names the find");
        });
        await win().render({ force: true });
        await settle();
        assert.equal(nameOf(), rare.name, "the GM's row is disguised");
        const row = lootOffer().rows.find(r => r.kind === "item");
        await claimLootQueryHandler({ offerId: offer.id, rowId: row.id, action: "take" }, { user: game.user });
        await until(() => lootOffer() === null, "the offer to settle itself");
        const gained = await until(() => looter.items.find(i => i.name === rare.name), "the find on the sheet");
        assert.strictEqual(flag(gained, "unidentified"), true, "the settle did not stamp the find");
      } finally {
        if (lootOffer()) await cancelOffer().catch(() => {});
        await foundry.applications.instances.get("azeroth-loot-offer")?.close().catch(() => {});
        await game.user.update({ character: savedCharacter }).catch(() => {});
        const cards = game.messages.filter(m => ["lootOffer", "lootSettled"].includes(m.flags?.[SCOPE]?.kind)).map(m => m.id);
        if (cards.length) await ChatMessage.deleteDocuments(cards).catch(() => {});
      }
    });
  });
}

export function scrollsBatch(context) {
  const { describe, it, after } = context;
  const { assert } = context;
  // The fixtures' sweep takes longer than Mocha's 2 s default once a batch has made a dozen actors.
  after(async function () { this.timeout(120000); await cleanup(); });

  /** A blank scroll of this tier on an actor, `n` of them. */
  async function blankScroll(actor, tier = 1, n = 1) {
    const scroll = await give(actor, `Scroll (tier ${tier})`);
    if (n !== 1) await scroll.update({ "system.quantity": n });
    return actor.items.get(scroll.id);
  }

  /** Drop a spell on a scroll's sheet and answer the writer's total. */
  async function inscribe(scroll, spell, total) {
    const sheet = await openSheet(scroll);
    try {
      const dropping = sheet._onDropDocument(new DragEvent("drop"), spell);
      const dialog = await dialogByClass("azeroth-inscribe-dialog");
      if (!dialog) throw new Error("the inscription dialog did not open");
      const input = dialog.element.querySelector('input[name="total"]');
      input.value = String(total);
      dialog.element.querySelector('button[data-action="ok"]').click();
      await dropping;
    } finally { await sheet.close(); }
  }

  describe("08 §14: the GM writes a scroll by dropping a spell on it", function () {
    it("renames it, takes the spell's text and stores one entry carrying the total", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Scroll writer" });
      const scroll = await blankScroll(actor, 1);
      const spell = await fromPack(PACK_FOR.spell, "Conjure Water");
      await inscribe(scroll, spell, 17);
      const written = await until(() => isInscribed(actor.items.get(scroll.id)) && actor.items.get(scroll.id), "the scroll written");
      assert.include(written.name, "Conjure Water");
      assert.strictEqual(written.system.spells.length, 1);
      assert.strictEqual(written.system.spells[0].writerTotal, 17);
      assert.strictEqual(written.system.spells[0].dc, null);
      assert.include(written.system.description, spell.system.effect.slice(0, 20));
      // The sheet's row says whose Test it is, and a GM may correct the total in place.
      const sheet = await openSheet(written);
      try {
        const row = sheet.element.querySelector(".azeroth-item__spells .azeroth-item-spell");
        assert.include(row.textContent, game.i18n.format("AZEROTH.Scroll.WrittenAt", { total: 17, dc: 12 }));
        assert.isNull(row.querySelector(".azeroth-item-spell-uses"), "a written scroll draws a uses count");
        const total = row.querySelector("input[data-writer-total]");
        assert.ok(total, "a GM has no writer's total to correct");
        total.value = "19";
        total.dispatchEvent(new Event("change", { bubbles: true }));
        await until(() => actor.items.get(scroll.id)?.system?.spells?.[0]?.writerTotal === 19, "the corrected total");
        assert.strictEqual(actor.items.get(scroll.id).name, written.name, "the correction touched the name");
      } finally { await sheet.close(); }
    });

    it("refuses a spell of another tier and a scroll already written, in words", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Scroll refusals" });
      const scroll = await blankScroll(actor, 1);
      const tier2 = (await game.packs.get(PACK_FOR.spell).getDocuments()).find(s => s.system?.tier === 2);
      const sheet = await openSheet(scroll);
      try {
        const said = await warnings(() => sheet._onDropDocument(new DragEvent("drop"), tier2));
        assert.ok(said.length, "a tier 2 spell on a tier 1 scroll was not refused");
      } finally { await sheet.close(); }
      await inscribe(scroll, await fromPack(PACK_FOR.spell, "Conjure Water"), 14);
      const coldSnap = await fromPack(PACK_FOR.spell, "Cold Snap");
      const again = await openSheet(actor.items.get(scroll.id));
      try {
        const said = await warnings(() => again._onDropDocument(new DragEvent("drop"), coldSnap));
        assert.ok(said.length, "a written scroll took a second spell");
      } finally { await again.close(); }
    });
  });

  describe("08 §14: anyone reads a scroll, at the writer's total, and it is consumed", function () {
    it("a Warrior reads one of two from the menu with no dialog and no Mana, at SL 1", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Scroll reader", classes: [["Warrior", 3]] });
      const scroll = await blankScroll(actor, 1, 2);
      await inscribe(scroll, await fromPack(PACK_FOR.spell, "Conjure Water"), 17);
      const sheet = await openSheet(actor);
      try {
        const before = game.messages.size;
        await pressMenu(sheet, scroll.id, "AZEROTH.Scroll.Menu");
        assert.notOk(await dialogFor(actor, 600), "reading a scroll opened the roll dialog");
        const card = await until(() => game.messages.size > before && lastMessage(m => m.flags?.[SCOPE]?.kind === "spell" && m.speaker?.actor === actor.id), "the spell card");
        const roll = card.rolls?.[0];
        assert.ok(roll?.options?.written, "the card's roll is not the writer's total");
        assert.strictEqual(roll.total, 17);
        // Conjure Water is aimed at nothing: 07 §2's 10 + 2 a tier, DC 12, SL 1.
        assert.strictEqual(roll.outcome.sl, 1);
        assert.strictEqual(roll.outcome.success, true);
        // A Warrior has no Spell DC: a target resists the writer's level (the lead, 2026-11-21).
        assert.strictEqual(card.flags[SCOPE].spellDC, 12);
        // The card says whose Test it was (08 §14): *From Scroll of Conjure Water, written at 17*.
        assert.include(card.content, game.i18n.format("AZEROTH.Scroll.FromWritten", { name: actor.items.get(scroll.id)?.name ?? "", total: 17 }));
        await until(() => actor.items.get(scroll.id)?.system?.quantity === 1, "one scroll of two consumed");
      } finally {
        document.querySelector("#context-menu")?.remove();
        await sheet.close();
      }
    });

    it("a scroll written below its DC fails, the spell does not go off, and it is still spent", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Scroll failed" });
      const scroll = await blankScroll(actor, 1, 1);
      await inscribe(scroll, await fromPack(PACK_FOR.spell, "Conjure Water"), 9);
      const before = game.messages.size;
      await castItemSpell(actor, actor.items.get(scroll.id), 0);
      const card = await until(() => game.messages.size > before && lastMessage(m => m.flags?.[SCOPE]?.kind === "spell" && m.speaker?.actor === actor.id), "the spell card");
      assert.strictEqual(card.rolls?.[0]?.outcome?.success, false, "a total below the DC succeeded");
      await until(() => !actor.items.get(scroll.id), "the last scroll deleted on a failed read");
    });

    it("a scroll aimed at one creature is judged against that creature's Defense", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Scroll aimed", classes: [["Warrior", 3]] });
      const foe = await makeNpc("Kobold");
      const scroll = await blankScroll(actor, 1, 1);
      await inscribe(scroll, await fromPack(PACK_FOR.spell, "Frostbolt"), 22);
      const written = actor.items.get(scroll.id);
      const spell = await fromUuid(written.system.spells[0].uuid);
      const before = game.messages.size;
      await game.system.azeroth.workflows.castSpell({
        actor, spell, targets: [rowOf(foe, { defense: 17 })], source: sourceOf(actor),
        provenanceExtra: [], viaItem: { itemId: written.id, index: 0, name: written.name, dc: null }
      });
      const card = await until(() => game.messages.size > before && lastMessage(m => m.flags?.[SCOPE]?.kind === "spell" && m.speaker?.actor === actor.id), "the spell card");
      const roll = card.rolls?.[0];
      assert.ok(roll?.options?.written, "not the writer's total");
      assert.strictEqual(roll.options.dc, 17, "the read was not judged against the target's Defense");
      assert.strictEqual(roll.outcome.sl, 1, "22 against a Defense of 17 is SL 1");
    });

    it("a reader with no Spell DC sets a tier 2 scroll's resist at 10 + 2 x 2", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Scroll tier two", classes: [["Warrior", 3]] });
      const scroll = await blankScroll(actor, 2, 1);
      await inscribe(scroll, await fromPack(PACK_FOR.spell, "Earthguard"), 20);
      const before = game.messages.size;
      await castItemSpell(actor, actor.items.get(scroll.id), 0);
      const card = await until(() => game.messages.size > before && lastMessage(m => m.flags?.[SCOPE]?.kind === "spell" && m.speaker?.actor === actor.id), "the spell card");
      assert.strictEqual(card.flags[SCOPE].spellDC, 14, "a tier 2 scroll read by a Warrior is not resisted at 14");
    });
  });
}
