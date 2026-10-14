/**
 * The Overview tab (D-687, laid out as WoW's own paper doll by D-689): the
 * figure of twenty tiles, drop-to-wear, the picker over what is carried, and
 * the column that says what all of it is doing.
 *
 * **These are use tests.** The pure half - which tile holds what, what a tile
 * accepts, what an equip puts away - is `rules/worn.mjs` and its Vitest; what
 * cannot be tested there is that the CONSUMER moved (D-681): that the tab
 * draws the tile the roster names, that a drop on it reaches `#dropOnSlot`
 * rather than the container path, that a click opens the PICKER and not the
 * compendium browser, and that a barred Off hand says why in words.
 *
 * **The three images (D-700) are here too**, because the same two questions
 * apply and neither can be asked in Node: does the banner follow the field the
 * Prototype Token dialog writes, and does each control's write land on the
 * document (D-603)? `module/applications/portraits.test.mjs` reads the source
 * and says which field each surface names; these press the controls.
 *
 * **The tab is one dark slab since 2026-09-20** (the lead, reading it beside
 * the finished Gear tab: *Let's update the overview next*), which brings two
 * more questions no Node test can ask: does a rarity tint survive the ink the
 * plates and the rows set (O-101), and is the barred Off hand still greyed by
 * a FLAT ground with its reason in words beside it (D-608, D-689)?
 *
 * Every test makes its own documents and `cleanup` removes them.
 */

import { PACK_FOR, cleanup, dragOver, forgeDrop, makeCharacter, openSheet, settle } from "./fixtures.mjs";
import { checkNoRawKeys } from "./expectations.mjs";
import { checkText } from "./geometry.mjs";
import { parseColour } from "./colour.mjs";
import { applyAffixInPlace, affixOf } from "../applications/affix-dialog.mjs";
import { FIGURE_HANDS, FIGURE_LEFT, FIGURE_RIGHT, WORN_SLOTS, capacityOf } from "../rules/worn.mjs";
import { AZEROTH } from "../config.mjs";

/** The figure's own roster, in the order the reader meets the tiles. */
const FIGURE = [...FIGURE_LEFT, ...FIGURE_RIGHT, ...FIGURE_HANDS];

/** Wait for a condition, or say what was being waited for. */
const until = async (fn, what, ms = 5000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
};

/** A pack item embedded on an actor, by name. */
async function give(actor, name, packId = PACK_FOR.equipment) {
  const docs = await game.packs.get(packId).getDocuments();
  // An exact name first: *Ring* and *Ring of the school* are both in the pack.
  const doc = docs.find(d => d.name === name);
  if (!doc) throw new Error(`${name} is not in ${packId}`);
  const [item] = await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
  return item;
}

/**
 * The first pack document a predicate accepts, BY NAME so the pick is the
 * same on every run - a pack's own order is not a contract.
 */
async function giveWhere(actor, predicate, packId = PACK_FOR.equipment) {
  const docs = (await game.packs.get(packId).getDocuments())
    .filter(predicate)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!docs.length) throw new Error(`nothing in ${packId} matches`);
  const [item] = await actor.createEmbeddedDocuments("Item", [docs[0].toObject()]);
  return item;
}

/** The Overview panel of an open sheet, on its tab. */
async function overviewOf(sheet) {
  sheet.changeTab("overview", "primary");
  await settle();
  const panel = sheet.element.querySelector('section[data-tab="overview"]');
  if (!panel) throw new Error("the sheet drew no Overview panel");
  return panel;
}

/** The Core panel of an open sheet, on its tab - where a condition is switched ON. */
async function coreOf(sheet) {
  sheet.changeTab("core", "primary");
  await settle();
  const panel = sheet.element.querySelector('section[data-tab="core"]');
  if (!panel) throw new Error("the sheet drew no Core panel");
  return panel;
}

/**
 * The strip of what is acting on the character, RE-QUERIED off the sheet every
 * time (2026-09-20): AppV2 replaces the elements on every render, so a node
 * held across one is detached and every assertion on it reads the old world.
 */
const stripOf = sheet => sheet.element.querySelector('section[data-tab="overview"] .azeroth-in-play');
const stripRows = sheet => [...(stripOf(sheet)?.querySelectorAll(".azeroth-in-play-row") ?? [])];
const stripRow = (sheet, selector) => stripOf(sheet)?.querySelector(`.azeroth-in-play-row${selector}`) ?? null;
/**
 * What one strip row says, with the whitespace the template's indentation
 * leaves collapsed. With no selector it is the WHOLE row: `querySelector`
 * searches descendants only, so `:scope` matches nothing at all there.
 */
const rowText = (row, selector = null) =>
  ((selector ? row?.querySelector(selector) : row)?.textContent ?? "").replace(/\s+/g, " ").trim();

/** One tile, by the slot it draws and - on a two-tile slot - which of the two. */
function tileFor(panel, slot, index = null) {
  const selector = index === null ? `[data-slot="${slot}"]` : `[data-slot="${slot}"][data-index="${index}"]`;
  return panel.querySelector(selector);
}

/** Notifications of one kind raised while `fn` runs, with the original put back. */
async function noticesFrom(kind, fn) {
  const raised = [];
  const original = ui.notifications[kind];
  ui.notifications[kind] = function (...args) { raised.push(args[0]); return original.apply(this, args); };
  try { await fn(raised); } finally { ui.notifications[kind] = original; }
  return raised;
}

/** The picker `chooseOption` opened on this actor, or null after five seconds. */
async function chooserFor(actor, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const app = foundry.applications.instances.get(`azeroth-choose-${actor.id}`);
    if (app?.rendered && app.element?.querySelector("#azeroth-choose-select")) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/** The option rows a chooser is showing, as text. */
const optionsOf = chooser => [...chooser.element.querySelectorAll("#azeroth-choose-select option")];

/** The ink a rendered element actually draws in, as `[r, g, b]`. */
const inkOf = el => parseColour(getComputedStyle(el).color)?.slice(0, 3);

/**
 * A design token as it RESOLVES on this element, as `[r, g, b]`.
 *
 * Read off the element rather than off `_tokens.scss`, because the point of
 * the test is the cascade: `azeroth-on-dark` re-points `--azeroth-rarity-*`
 * at its dark sibling on every dark root, and a comparison against the file
 * would pass whether the mixin reached the element or not.
 */
const tokenOf = (el, name) => parseColour(getComputedStyle(el).getPropertyValue(name).trim())?.slice(0, 3);

/** Pick the option whose text contains `text` and press the button. */
function choose(chooser, text) {
  const option = optionsOf(chooser).find(o => o.textContent.includes(text));
  if (!option) throw new Error(`the chooser offers no "${text}": ${optionsOf(chooser).map(o => o.textContent.trim()).join(" | ")}`);
  const select = chooser.element.querySelector("#azeroth-choose-select");
  select.value = option.value;
  chooser.element.querySelector('button[data-action="choose"]').click();
  return option;
}

export function overviewBatch(context) {
  const { describe, it, assert, after } = context;

  describe("The Overview tab (D-687, D-689)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    it("draws the twenty tiles in the rosters' order and says Empty in words", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Bare", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const tiles = [...panel.querySelectorAll("[data-slot]")];
        assert.equal(tiles.length, FIGURE.length, "the figure does not draw one tile per roster entry");
        assert.equal(FIGURE.length, 20, "the roster is not the twenty tiles D-689 froze");

        // IN THE ROSTER'S ORDER, and the roster is the module's - a list
        // retyped in the template would be a second roster to keep in step.
        const drawn = tiles.map(el => ({
          slot: el.dataset.slot,
          index: el.dataset.index === undefined ? undefined : Number(el.dataset.index)
        }));
        assert.deepEqual(drawn, FIGURE.map(t => ({ slot: t.slot, index: t.index })),
          "the tiles are not in the order FIGURE_LEFT, FIGURE_RIGHT, FIGURE_HANDS give them");

        // Every one of 08 §11's thirteen slots is on the figure, once per
        // point of its capacity, or a character can wear a thing and never
        // see it.
        for (const slot of WORN_SLOTS) {
          const count = drawn.filter(t => t.slot === slot).length;
          assert.equal(count, capacityOf(slot), `the ${slot} slot draws ${count} tiles and holds ${capacityOf(slot)}`);
        }
        for (const slot of ["body", "mainHand", "offHand", "ranged", "ammo"]) {
          assert.ok(tileFor(panel, slot), `no tile for ${slot}`);
        }
        // A shield and an Augment are HELD IN THE OFF HAND (07 §3, D-674) and
        // draw no tile of their own since D-689; the Off hand names which it
        // is showing instead.
        for (const gone of ["shield", "augment"]) {
          assert.isNull(tileFor(panel, gone), `${gone} still draws a tile of its own`);
        }

        // IN WORDS, never an empty box alone (D5) - and since the socket
        // became icon-only (the lead, 2026-09-20) those words are in the
        // `aria-label` and in the tooltip rather than on the plate. The label
        // names the SLOT first and then what is in it, so a reader with no
        // pointer hears the same two things a reader with a pointer sees.
        const empty = game.i18n.localize("AZEROTH.Overview.Empty");
        const first = tileFor(panel, "finger", 0);
        assert.equal(first.textContent.trim(), "", "an empty socket still draws words on its face");
        assert.include(first.getAttribute("aria-label"), empty, "an empty socket does not say so to a reader");
        assert.include(first.getAttribute("data-tooltip") ?? "", game.i18n.localize("AZEROTH.Slot.Finger"),
          "an empty socket offers no tooltip naming its slot");
        // A two-tile slot is numbered, through a format key.
        assert.include(tileFor(panel, "finger", 1).getAttribute("aria-label"),
          game.i18n.format("AZEROTH.Overview.SlotNumber", { slot: game.i18n.localize("AZEROTH.Slot.Finger"), n: 2 }),
          "the second Finger socket is not numbered");
        // And the whole tile is the picker's control - never the browser.
        assert.equal(tileFor(panel, "finger", 0).dataset.action, "pickSlot");
        assert.isUndefined(tileFor(panel, "finger", 0).dataset.type, "a tile still carries a browse type");
        assert.isFunction(sheet.options.actions.pickSlot, "pickSlot is not registered - the click is a silent no-op");
      } finally {
        await sheet.close();
      }
    });

    it("shows an equipped Classic ring on Finger 1, with its icon, its label and its card", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Ring", classes: [["Warrior", 1]] });
      // A found ring (D-685), so the tile is proved against a Classic
      // document as well as a §11 base item.
      const ring = await giveWhere(actor, d => d.system?.slot === "finger" && d.flags?.["azeroth-rpg"]?.classic);
      await ring.update({ "system.equipped": true });
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const tile = tileFor(panel, "finger", 0);
        assert.equal(tile.dataset.itemId, ring.id, "Finger 1 does not carry the ring");
        assert.ok(tile.querySelector(".azeroth-icon img"), "the socket draws no icon");
        assert.equal(tile.querySelector(".azeroth-icon img").getAttribute("src"), ring.img);

        // **THE SOCKET CARRIES NO WORDS** (the lead, 2026-09-20), so the name
        // is said twice instead: in the label a reader hears, and in the card
        // a reader hovers - which is the Gear tab's own card through
        // `rules/bags.mjs#tipModel`, with the SLOT where that tab says where
        // the thing is kept.
        assert.equal(tile.textContent.trim(), "", "the socket still draws words on its face");
        assert.include(tile.getAttribute("aria-label"), ring.name, "the socket does not name the ring to a reader");
        assert.include(tile.getAttribute("aria-label"), game.i18n.localize("AZEROTH.Slot.Finger"),
          "the socket's label does not name the slot first");
        // **READ THROUGH THE DOM, not off the attribute.** Handlebars escapes
        // the name it writes, so a Classic find called *Agamaggan's Clutch*
        // sits in the attribute as `Agamaggan&#x27;s Clutch` and a raw
        // `include` fails on the apostrophe alone. Core parses it the same way
        // when it shows the card.
        const card = document.createElement("div");
        card.innerHTML = tile.getAttribute("data-tooltip-html") ?? "";
        assert.include(card.textContent, ring.name, "the socket's card does not name the ring");
        assert.include(card.textContent, game.i18n.localize("AZEROTH.Slot.Finger"),
          "the socket's card does not name the slot");
        assert.ok(card.querySelector(".azeroth-item-tip-name"),
          "the socket's card is not the item tooltip the bags use");
        // And the class core needs to style it is on an ancestor, because
        // `TooltipManager` reads `closest("[data-tooltip-class]")`.
        assert.ok(tile.closest("[data-tooltip-class]"), "nothing over the socket names the tooltip's class");

        assert.equal(tile.dataset.action, "pickSlot", "a filled socket is not the picker's control");
        // NO INNER CONTROL AT ALL: the name that carried `openItem` is gone
        // with the words, and a second `[data-action]` inside the socket would
        // steal the click core dispatches on the closest one.
        assert.isNull(tile.querySelector("[data-action]"), "the socket carries an inner control");
        // The per-tile Unequip is GONE (D-689): twenty of them crowded the
        // tab and *Take it off* is the picker's first row now.
        assert.isNull(tile.querySelector('[data-action="toggleEquipped"]'), "the tile still carries an Unequip button");
      } finally {
        await sheet.close();
      }
    });

    it("a right click on a worn socket offers Edit, Unequip and the rest", async function () {
      this.timeout(60000);
      // THE SECOND DOOR (the lead, 2026-09-20). A paper-doll socket has no
      // name to carry `openItem` any more and takes no double-click - the
      // single click already opens the picker - so `itemContextMenu`'s
      // selector names the tile, and a worn thing keeps every entry a carried
      // one has.
      const actor = await makeCharacter({ name: "ZZ Overview Menu", classes: [["Warrior", 1]] });
      const belt = await give(actor, "Belt");
      await belt.update({ "system.equipped": true });
      await until(() => actor.items.get(belt.id)?.system.equipped === true, "the belt to go on");
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const tile = tileFor(panel, "waist");
        assert.equal(tile.dataset.itemId, belt.id, "the Waist socket does not hold the belt");
        const r = tile.getBoundingClientRect();
        tile.dispatchEvent(new MouseEvent("contextmenu",
          { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 }));
        await until(() => document.querySelector("#context-menu"), "the context menu to open", 3000);
        const menu = document.querySelector("#context-menu");
        const texts = [...menu.querySelectorAll(".context-item")].map(i => i.textContent.trim());
        for (const key of ["AZEROTH.Sheet.Edit", "AZEROTH.Sheet.Unequip"]) {
          assert.include(texts, game.i18n.localize(key), `the socket's menu lacks ${key}: ${texts.join(" | ")}`);
        }
        // And it really acts on the thing under the pointer.
        const edit = [...menu.querySelectorAll(".context-item")]
          .find(i => i.textContent.trim() === game.i18n.localize("AZEROTH.Sheet.Edit"));
        edit.click();
        await until(() => belt.sheet?.rendered === true, "the item sheet to open from the socket's menu");
        await belt.sheet.close();
      } finally {
        await sheet.close();
      }
    });

    it("fills both Finger tiles, and a third ring displaces the one it was dropped on", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Fingers", classes: [["Warrior", 1]] });
      const ring = await give(actor, "Ring");
      const signet = await give(actor, "Signet ring");
      // Made BEFORE the sheet opens: an embed re-renders it, and a node held
      // across that render is detached.
      const third = await giveWhere(actor, d => d.system?.slot === "finger" && d.flags?.["azeroth-rpg"]?.classic);
      await actor.updateEmbeddedDocuments("Item", [
        { _id: ring.id, "system.equipped": true },
        { _id: signet.id, "system.equipped": true }
      ]);
      // TWO RINGS, and neither displaced the other: the finger holds two
      // (08 §11, D-689) and `SLOT_CAPACITY` is what says so.
      await settle();
      assert.isTrue(actor.items.get(ring.id).system.equipped, "the first ring came off");
      assert.isTrue(actor.items.get(signet.id).system.equipped, "the second ring did not stay on");

      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        // Filled in the sorted order: *Ring* before *Signet ring*.
        assert.equal(tileFor(panel, "finger", 0).dataset.itemId, ring.id, "Finger 1 does not show the ring");
        assert.equal(tileFor(panel, "finger", 1).dataset.itemId, signet.id, "Finger 2 does not show the signet ring");

        // A third, dropped on FINGER 2: the index travels with the drop, so
        // what is in Finger 2 is what comes off.
        forgeDrop(tileFor(panel, "finger", 1), { type: "Item", uuid: third.uuid });
        await until(() => actor.items.get(third.id)?.system.equipped === true, "the third ring to go on");
        await until(() => actor.items.get(signet.id)?.system.equipped === false, "the signet ring to come off");
        assert.isTrue(actor.items.get(ring.id).system.equipped, "the drop on Finger 2 took the Finger 1 ring off");
        // And nothing was put in a container by the drop.
        assert.isNull(actor.items.get(third.id).system.container ?? null, "the drop moved the ring into a container");
      } finally {
        await sheet.close();
      }
    });

    // ---- the picker, which is the point of D-689 ---------------------------

    it("an empty Waist tile opens the picker over what is CARRIED, never the browser", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Pick", classes: [["Warrior", 1]] });
      const belt = await give(actor, "Belt");
      // Something that fits no worn slot at all, so the picker is proved to
      // narrow rather than to list the pack.
      const rope = await give(actor, "Rope, 50 ft (hemp)");
      const sheet = await openSheet(actor);
      let chooser = null;
      try {
        const panel = await overviewOf(sheet);
        const tile = tileFor(panel, "waist");
        assert.equal(tile.dataset.action, "pickSlot", "the empty Waist tile is not the picker's control");
        tile.click();
        chooser = await chooserFor(actor);
        assert.ok(chooser, "clicking the Waist tile opened no picker");
        // NOT THE BROWSER. The lead asked for it gone from this tab.
        const browser = foundry.applications.instances.get("azeroth-compendium-browser");
        assert.isNotTrue(browser?.rendered, "the tile opened the compendium browser");

        const shown = optionsOf(chooser).map(o => o.textContent.trim());
        assert.include(shown.join(" | "), belt.name, "the picker does not offer the belt the character carries");
        assert.notInclude(shown.join(" | "), rope.name, "the picker offers something that fits no slot");
        // Nothing is worn there yet, so there is nothing to take off.
        assert.notInclude(shown.join(" | "), game.i18n.localize("AZEROTH.Overview.TakeOff"),
          "an empty tile offers *Take it off*");
        assert.deepEqual(checkText(chooser.element.querySelector(".azeroth-choose")), [],
          "the picker is not legible");

        choose(chooser, belt.name);
        await until(() => actor.items.get(belt.id)?.system.equipped === true, "the belt to go on");
        await until(() => !foundry.applications.instances.get(`azeroth-choose-${actor.id}`), "the picker to close");
        chooser = null;

        // And now the tile is filled and *Take it off* is the first row.
        await sheet.render({ force: true });
        const filled = tileFor(await overviewOf(sheet), "waist");
        assert.equal(filled.dataset.itemId, belt.id, "the Waist tile does not show the belt");
        filled.click();
        chooser = await chooserFor(actor);
        assert.ok(chooser, "the filled tile opened no picker");
        assert.include(optionsOf(chooser)[0].textContent, game.i18n.localize("AZEROTH.Overview.TakeOff"),
          "*Take it off* is not the first row of a filled tile's picker");
        choose(chooser, game.i18n.localize("AZEROTH.Overview.TakeOff"));
        await until(() => actor.items.get(belt.id)?.system.equipped === false, "the belt to come off");
        await until(() => !foundry.applications.instances.get(`azeroth-choose-${actor.id}`), "the picker to close");
        chooser = null;
      } finally {
        await chooser?.close();
        await sheet.close();
      }
    });

    it("says so and opens nothing where the character carries nothing for the slot", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Nothing", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const raised = await noticesFrom("info", async list => {
          tileFor(panel, "head").click();
          await until(() => list.length > 0, "the notice to be raised", 3000);
        });
        assert.ok(raised.length, "an empty picker said nothing");
        assert.include(raised[0], game.i18n.localize("AZEROTH.Slot.Head"), "the notice does not name the slot");
        assert.isNotOk(await chooserFor(actor, 500), "a picker opened with nothing to pick");
        const browser = foundry.applications.instances.get("azeroth-compendium-browser");
        assert.isNotTrue(browser?.rendered, "an empty slot fell back to the compendium browser");
      } finally {
        await sheet.close();
      }
    });

    // ---- the lead's fourth ask ---------------------------------------------

    it("a two-handed main hand bars the Off hand tile and the tile says why", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({
        name: "ZZ Overview Two Hands", classes: [["Warrior", 1]], armor: ["Kite shield"],
        // Made before the sheet opens: an embed re-renders it (D-681).
        weapons: ["Greataxe", "Dagger", "Shortbow"]
      });
      const axe = actor.items.find(i => i.name === "Greataxe");
      const dagger = actor.items.find(i => i.name === "Dagger");
      const bow = actor.items.find(i => i.name === "Shortbow");
      const shield = actor.items.find(i => i.type === "armor" && i.system.shield);
      assert.ok(shield, "the fixture embedded no shield");
      await shield.update({ "system.equipped": true });
      await until(() => actor.items.get(shield.id)?.system.equipped === true, "the shield to go on");

      // SYMMETRIC (D-689): the two-hander puts the shield away, because a
      // greyed tile whose shield still granted Armor Points would be a lie.
      await axe.update({ "system.equipped": true });
      await until(() => actor.items.get(shield.id)?.system.equipped === false, "the shield to come off");

      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const off = tileFor(panel, "offHand");
        assert.ok(off.classList.contains("is-barred"), "the Off hand tile is not barred");
        assert.equal(off.getAttribute("aria-disabled"), "true", "the barred tile is not disabled to a reader");
        // NO ACTION: neither the picker nor a drop may reach it.
        assert.isUndefined(off.dataset.action, "the barred tile is still a control");
        // GREYED *AND* SAID - colour is never the only carrier (D5). Since
        // the socket became icon-only the sentence is printed UNDER THE HANDS
        // ROW rather than on the plate: a tooltip nobody hovers is not a
        // refusal, so it has to be somewhere a reader simply sees it.
        const why = game.i18n.format("AZEROTH.Overview.TwoHanded", { name: axe.name });
        const line = panel.querySelector(".azeroth-doll-barred");
        assert.ok(line, "the figure prints no reason for the barred off hand");
        assert.include(line.textContent, axe.name, "the reason does not name the weapon holding the hand shut");
        assert.include(line.textContent, why, "the reason is not said in words");
        // And the socket itself says the same to a reader with no pointer.
        assert.include(off.getAttribute("aria-label"), why, "the barred socket's label does not say why");

        // And a drop on it is refused BY NAME, and moves nothing.
        const raised = await noticesFrom("warn", async list => {
          forgeDrop(off, { type: "Item", uuid: dagger.uuid });
          await until(() => list.length > 0, "the refusal to be raised", 3000);
        });
        assert.isFalse(actor.items.get(dagger.id).system.equipped, "a dagger reached the barred off hand");
        assert.include(raised[0], dagger.name, "the refusal does not name the thing");
        assert.include(raised[0], axe.name, "the refusal does not name what is holding the hand shut");

        // A bow is two-handed and bars NOTHING (D-689): it sits in Ranged.
        await axe.update({ "system.equipped": false });
        await bow.update({ "system.equipped": true });
        await until(() => actor.items.get(bow.id)?.system.equipped === true, "the bow to go on");
        await sheet.render({ force: true });
        const after = await overviewOf(sheet);
        assert.equal(after.querySelector('[data-slot="ranged"]').dataset.itemId, bow.id, "the bow is not in the Ranged tile");
        assert.isNotOk(tileFor(after, "offHand").classList.contains("is-barred"), "a bow barred the off hand");
      } finally {
        await sheet.close();
      }
    });

    it("lights every socket that will take the drop, and never the barred one", async function () {
      this.timeout(120000);
      // **WHAT LIGHTS IS WHAT TAKES THE DROP** (the lead, 2026-09-20). Every
      // socket is its own zone and its own box - `data-slot` is on the tile
      // itself - and a barred Off hand must never light, or the one moment the
      // reader is aiming is the moment the sheet tells them a lie (D-689).
      const actor = await makeCharacter({
        name: "ZZ Overview Lit", classes: [["Warrior", 1]], weapons: ["Greataxe"]
      });
      const axe = actor.items.find(i => i.name === "Greataxe");
      await axe.update({ "system.equipped": true });
      await until(() => actor.items.get(axe.id)?.system.equipped === true, "the two-hander to go on");
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const faults = [];
        for (const tile of panel.querySelectorAll("[data-slot]")) {
          const barred = tile.classList.contains("is-barred");
          const lit = dragOver(tile);
          if (barred && lit) faults.push(`the barred ${tile.dataset.slot} socket lit`);
          if (!barred && lit !== tile) {
            faults.push(`${tile.dataset.slot}${tile.dataset.index ? ` ${tile.dataset.index}` : ""}`
              + `: lit ${lit ? `<${lit.tagName.toLowerCase()} class="${lit.className}">` : "nothing"}`);
          }
        }
        assert.deepEqual(faults, [], faults.join("\n"));
        assert.isAtLeast(panel.querySelectorAll("[data-slot]").length, 20, "the figure lost sockets");
      } finally {
        await sheet.close();
      }
    });

    it("hands a drop between the sockets back to core, and lights nothing there", async function () {
      this.timeout(120000);
      // The figure's own furniture - the hands row, its heading, the portrait -
      // is not a zone and deliberately stays one: a drop there is the ordinary
      // pickup and the outline never says otherwise.
      const actor = await makeCharacter({ name: "ZZ Overview Between" });
      const ring = await give(actor, "Signet ring");
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        for (const selector of [".azeroth-doll-hands", ".azeroth-doll-heading", ".azeroth-overview-force"]) {
          const el = panel.querySelector(selector);
          assert.ok(el, `the figure draws no ${selector}`);
          assert.isNull(dragOver(el), `${selector} lit as a drop zone`);
        }
        const held = actor.items.size;
        forgeDrop(panel.querySelector(".azeroth-doll-hands"), { type: "Item", uuid: ring.uuid });
        await new Promise(r => setTimeout(r, 400));
        assert.equal(actor.items.size, held, "a drop between the sockets duplicated the ring");
        assert.isFalse(actor.items.get(ring.id).system.equipped, "a drop between the sockets put the ring on");
      } finally {
        await sheet.close();
      }
    });

    it("two of one weapon go one in each hand, and the picker tells the copies apart", async function () {
      this.timeout(90000);
      // *Two identical weapons cannot be equipped one in each hand* (the lead,
      // 2026-09-13). `toggleEquipped` wrote `system.equipped` alone, so the
      // second Dagger stayed a main-hand weapon and `figureSlots` parked it in
      // `alsoReady` — one Dagger drawn and an empty off hand.
      const actor = await makeCharacter({ name: "ZZ Overview Two Daggers", classes: [["Warrior", 1]] });
      const first = await give(actor, "Dagger", PACK_FOR.weapon);
      const second = await give(actor, "Dagger", PACK_FOR.weapon);
      const sheet = await openSheet(actor);
      try {
        // Through the Gear tab's own Equip button, which is the door the lead
        // pressed: a test that writes the field proves nothing about it.
        sheet.changeTab("gear", "primary");
        await settle();
        const equipOf = id => sheet.element.querySelector(
          `section[data-tab="gear"] [data-item-id="${id}"] [data-action="toggleEquipped"]`);
        assert.ok(equipOf(first.id), "the Gear tab draws no Equip on a carried weapon");
        equipOf(first.id).click();
        await until(() => actor.items.get(first.id)?.system.equipped === true, "the first Dagger to go on");
        await settle();
        equipOf(second.id).click();
        await until(() => actor.items.get(second.id)?.system.equipped === true, "the second Dagger to go on");
        await until(() => actor.items.get(second.id)?.system.offHand === true, "the second Dagger to reach the off hand");

        assert.isFalse(actor.items.get(first.id).system.offHand, "the first Dagger left the main hand");
        const panel = await overviewOf(sheet);
        assert.equal(tileFor(panel, "mainHand").dataset.itemId, first.id, "the main hand is not the first Dagger");
        assert.equal(tileFor(panel, "offHand").dataset.itemId, second.id, "the off hand is not the second Dagger");
        // NOTHING LEFT OVER: `alsoReady` is what the second copy used to fall into.
        const also = panel.querySelector(".azeroth-overview-ready");
        assert.notOk(also && also.textContent.includes("Dagger"), "a Dagger is still listed as also ready");

        // And the picker over the main hand tells the two apart and says where
        // the other one is.
        tileFor(panel, "mainHand").click();
        const chooser = await chooserFor(actor);
        assert.ok(chooser, "the main hand tile opened no picker");
        const texts = optionsOf(chooser).map(o => o.textContent.trim());
        assert.ok(texts.some(t => t.includes(game.i18n.format("AZEROTH.Overview.Copy", { name: "Dagger", n: 1 }))),
          `the picker does not number the copies: ${texts.join(" | ")}`);
        assert.ok(texts.some(t => t.includes(game.i18n.format("AZEROTH.Overview.Copy", { name: "Dagger", n: 2 }))),
          `the picker does not number the copies: ${texts.join(" | ")}`);
        assert.ok(texts.some(t => t.includes(game.i18n.localize("AZEROTH.Overview.InOffHand"))),
          `the picker does not say which copy is in the other hand: ${texts.join(" | ")}`);
        await chooser.close();
      } finally {
        await sheet.close();
      }
    });

    it("shows the bundle nocked on an equipped bow, and nocks another from the tile", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({
        name: "ZZ Overview Ammo", classes: [["Warrior", 1]],
        weapons: ["Shortbow", "Hunting arrows", "Broadhead arrows"]
      });
      const bow = actor.items.find(i => i.name === "Shortbow");
      const hunting = actor.items.find(i => i.name === "Hunting arrows");
      const broadhead = actor.items.find(i => i.name === "Broadhead arrows");
      assert.ok(bow && hunting && broadhead, "the fixture did not embed the bow and two bundles");
      await bow.update({ "system.equipped": true });
      await until(() => actor.items.get(bow.id)?.system.equipped === true, "the bow to go on");

      const sheet = await openSheet(actor);
      let chooser = null;
      try {
        const panel = await overviewOf(sheet);
        const ammo = tileFor(panel, "ammo");
        // The tile shows what the shot would ACTUALLY spend, through
        // `selectAmmunition` (D-641), not the first bundle in the bag.
        assert.ok(ammo.dataset.itemId, "the Ammunition tile is empty with a bow equipped and arrows carried");
        const nocked = actor.items.get(ammo.dataset.itemId);
        // The socket carries no words since 2026-09-20, so the bundle is named
        // in the label a reader hears rather than on the plate.
        assert.include(ammo.getAttribute("aria-label"), nocked.name,
          "the Ammunition socket does not name the bundle");

        // The picker writes the LAUNCHER's field; it equips nothing.
        const other = nocked.id === hunting.id ? broadhead : hunting;
        ammo.click();
        chooser = await chooserFor(actor);
        assert.ok(chooser, "the Ammunition tile opened no picker");
        choose(chooser, other.name);
        await until(() => actor.items.get(bow.id)?.system.ammunition === other.id, "the other bundle to be nocked");
        await until(() => !foundry.applications.instances.get(`azeroth-choose-${actor.id}`), "the picker to close");
        chooser = null;
        assert.isFalse(actor.items.get(other.id).system.equipped, "nocking a bundle equipped it");

        await sheet.render({ force: true });
        assert.equal(tileFor(await overviewOf(sheet), "ammo").dataset.itemId, other.id,
          "the Ammunition tile still shows the old bundle");
      } finally {
        await chooser?.close();
        await sheet.close();
      }
    });

    // ---- the OTHER door: a bare write (D-686, 2026-09-09) -------------------
    //
    // **A RULE ENFORCED AT ONE DOOR IS ENFORCED NOWHERE.** The item sheet's
    // Equipped checkbox submits through the ordinary form path and never
    // reaches the sheet's `#onToggleEquipped`, so two belts equipped from
    // their own sheets BOTH granted while the Waist tile drew one of them. The
    // law moved onto the actor (`AzerothActor#displaceWorn`, off
    // `_onUpdateDescendantDocuments`); these are the tests that say the
    // consumer moved (D-681). They write `system.equipped` directly, which is
    // exactly what the checkbox writes - not the sheet action.

    it("a second belt equipped by a bare write puts the first away, and grants once", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Two Belts", classes: [["Warrior", 1]] });
      const affixes = await game.packs.get("azeroth-rpg.affixes").getDocuments();
      const bear = affixes.find(d => d.name === "of the Bear");
      assert.ok(bear, "the affix pool has no *of the Bear*");

      const first = await give(actor, "Belt");
      const second = await give(actor, "Belt");
      for (const belt of [first, second]) await applyAffixInPlace(belt, affixOf(bear));
      await until(() => actor.items.get(second.id)?.name === "Belt of the Bear", "the affixed names");

      // The item sheet's own door, twice.
      await first.update({ "system.equipped": true });
      await until(() => actor.system.abilities.str.bonus === 1, "the first belt's grant");
      await second.update({ "system.equipped": true });
      await until(() => actor.items.get(first.id)?.system.equipped === false, "the first belt to come off");

      assert.isTrue(actor.items.get(second.id).system.equipped, "the second belt did not stay on");
      const worn = actor.items.filter(i => i.system?.slot === "waist" && i.system?.equipped === true);
      assert.lengthOf(worn, 1, "two things are worn in one slot");
      assert.equal(worn[0].id, second.id, "the wrong belt survived");
      // The point of the rule: 08 §6 grants once, not twice.
      assert.equal(actor.system.abilities.str.bonus, 1, "both belts granted");

      // A SASH IS THE SAME SLOT (D-689): *a sash and a belt are the same slot
      // even if the name is different* (the lead, 2026-09-09). Under D-686
      // they were two slots and both were worn at once.
      const sash = await give(actor, "Sash");
      await sash.update({ "system.equipped": true });
      await until(() => actor.items.get(second.id)?.system.equipped === false, "the belt to come off for the sash");
      assert.isTrue(actor.items.get(sash.id).system.equipped, "the sash did not go on");

      // A bare write that takes a thing OFF displaces nothing, so there is no
      // recursion and nothing else moves.
      await sash.update({ "system.equipped": false });
      await until(() => actor.system.abilities.str.bonus === 0, "the belt to stop granting");
      assert.isFalse(actor.items.get(second.id).system.equipped, "unequipping the sash put a belt back on");
    });

    it("refuses a thing the tile does not take, by name, and moves nothing", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Refusal", classes: [["Warrior", 1]] });
      const belt = await give(actor, "Belt");
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const raised = await noticesFrom("warn", async list => {
          forgeDrop(tileFor(panel, "trinket", 0), { type: "Item", uuid: belt.uuid });
          await until(() => list.length > 0, "the refusal to be raised", 3000);
        });
        assert.isFalse(actor.items.get(belt.id).system.equipped, "a belt was worn in the Trinket slot");
        assert.ok(raised.length, "the refusal said nothing");
        assert.include(raised[0], belt.name, "the refusal does not name the thing");
        assert.include(raised[0], game.i18n.localize("AZEROTH.Slot.Trinket"), "the refusal does not name the slot");
      } finally {
        await sheet.close();
      }
    });

    it("the In force column names what a worn thing grants", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Overview Grants", classes: [["Warrior", 1]] });
      const ring = await give(actor, "Ring");
      const affixes = await game.packs.get("azeroth-rpg.affixes").getDocuments();
      const bear = affixes.find(d => d.name === "of the Bear");
      assert.ok(bear, "the affix pool has no *of the Bear*");
      await applyAffixInPlace(ring, affixOf(bear));
      await until(() => actor.items.get(ring.id)?.name === "Ring of the Bear", "the affixed name");
      await ring.update({ "system.equipped": true });
      await until(() => actor.system.abilities.str.bonus === 1, "Strength to move");
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const force = panel.querySelector(".azeroth-overview-force");
        assert.ok(force, "there is no In force column");
        // Off config, never a key typed here: the label is
        // `AZEROTH.Ability.Str.Label` and a hand-typed stem localises to
        // itself, which reads as the tab printing a raw key when it is not.
        assert.include(force.textContent, game.i18n.localize(AZEROTH.abilities.str), "In force does not name the attribute");
        assert.include(force.textContent, "Ring of the Bear", "In force does not name what granted it");
        // The numbers it always prints, whatever is worn.
        assert.include(force.textContent, game.i18n.localize("AZEROTH.Sheet.ArmorPoints"));
        assert.include(force.textContent, String(actor.system.defense), "In force does not print the Defense");
      } finally {
        await sheet.close();
      }
    });

    // ---- the dark slab (2026-09-20) ----------------------------------------

    it("a rarity tint survives the tab's own ink, on a socket, a row and a Signature (O-101)", async function () {
      this.timeout(90000);
      // **THE FAULT THIS IS WRITTEN FOR.** A rarity class is 0-2-0
      // (`.azeroth .azeroth-rarity-legendary`) and `.azeroth-slot-name` /
      // `.azeroth-overview-ready-name` each carried a `color` of their own
      // under the sheet scope, which outranks it - so the tint vanished in
      // SILENCE on every Overview name for as long as the tab had existed
      // (D-692 records it as O-101). The ink is on the roots now and the names
      // inherit. A source read cannot see this: both rules were legal CSS.
      //
      // **THE SOCKET'S HALF IS NOW THE RING** (the lead, 2026-09-20): the
      // paper-doll tile has no name to tint, so what has to survive there is
      // the icon's rarity OUTLINE - and it has to resolve to the DARK sibling,
      // which is `azeroth-on-dark` reaching the socket.
      //
      // The three surfaces are deterministic: `figureSlots` picks the main
      // hand off a NAME sort, so *Ashbringer* is the main hand and
      // *Perdition's Blade* falls to *also ready* whichever grip either has.
      const actor = await makeCharacter({ name: "ZZ Overview Tint", classes: [["Warrior", 5]] });
      const ash = await give(actor, "Ashbringer", PACK_FOR.weapon);
      const blade = await give(actor, "Perdition's Blade", PACK_FOR.weapon);
      assert.equal(ash.system.rarity, "legendary", "Ashbringer is not the pack's Legendary");
      assert.equal(blade.system.rarity, "epic", "Perdition's Blade is not the pack's Epic");
      await actor.updateEmbeddedDocuments("Item", [
        { _id: ash.id, "system.equipped": true },
        { _id: blade.id, "system.equipped": true }
      ]);
      await until(() => actor.items.get(ash.id)?.system.equipped === true, "the sword to go on");
      await until(() => actor.items.get(blade.id)?.system.equipped === true, "the second blade to go on");

      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);

        // 1. THE SOCKET'S RING. `azeroth-on-dark` is on the tile, so the
        //    outline has to resolve to the DARK sibling rather than to the
        //    parchment tint, which measures 3.1 to 3.9 on every dark ground
        //    here and could not carry a ring either.
        const tile = tileFor(panel, "mainHand");
        assert.equal(tile.dataset.itemId, ash.id, "the main hand socket does not hold the sword");
        const icon = tile.querySelector(".azeroth-icon");
        assert.ok(icon.classList.contains("azeroth-rarity-legendary"), "the socket's icon carries no rarity class");
        assert.deepEqual(parseColour(getComputedStyle(icon).outlineColor)?.slice(0, 3),
          tokenOf(icon, "--azeroth-rarity-legendary-dark"),
          `the socket's ring draws ${getComputedStyle(icon).outlineColor} rather than the dark Legendary tint`);

        // 2. THE *ALSO READY* ROW, which is the half of O-101 that was named
        //    in D-692 and left standing. The row sets the ink and the name
        //    inherits it, so the rarity class is free to paint over it.
        const figure = panel.querySelector(".azeroth-overview-figure");
        const second = figure.querySelector(`.azeroth-overview-ready [data-item-id="${blade.id}"]`);
        assert.ok(second, "the second blade is not listed as also ready");
        assert.deepEqual(inkOf(second), tokenOf(second, "--azeroth-ink-light"),
          "the ready row's own ink is not the dark ground's - there would be nothing for the tint to beat");
        const secondName = second.querySelector(".azeroth-overview-ready-name");
        assert.ok(secondName.classList.contains("azeroth-rarity-epic"), "the second blade's name carries no rarity class");
        assert.deepEqual(inkOf(secondName), tokenOf(secondName, "--azeroth-rarity-epic-dark"),
          `the second blade draws ${getComputedStyle(secondName).color} rather than the dark Epic tint`);
        assert.notDeepEqual(inkOf(secondName), tokenOf(secondName, "--azeroth-ink-light"),
          "the ready name draws the row's ink - the rarity class lost again (O-101)");

        // 3. THE STATS PANE's Signature row, on `--azeroth-panel-dark`: a
        //    third ground, and one the tint has to hold on too.
        const force = panel.querySelector(".azeroth-force-signatures");
        assert.ok(force, "the In force column draws no Signatures row");
        const row = [...force.querySelectorAll("li")].find(li => li.textContent.includes(ash.name));
        assert.ok(row, `the sword's standing Signature has no row: ${force.textContent.replace(/\s+/g, " ").trim()}`);
        assert.deepEqual(inkOf(row), tokenOf(row, "--azeroth-ink-light"), "the Signature row's own ink is not the dark ground's");
        const sigName = row.querySelector(".azeroth-force-signature-name");
        assert.ok(sigName.classList.contains("azeroth-rarity-legendary"), "the Signature's name carries no rarity class");
        assert.deepEqual(inkOf(sigName), tokenOf(sigName, "--azeroth-rarity-legendary-dark"),
          `the Signature's name draws ${getComputedStyle(sigName).color} rather than the dark Legendary tint`);

        // And every one of them is still legible on the ground it landed on.
        const findings = checkText(panel);
        assert.deepEqual(findings, [],
          `a tinted name is not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    it("the barred Off hand is greyed by a FLAT ground and still says why in words", async function () {
      this.timeout(60000);
      // D-689 greys it AND says why; D-608 forbids an opacity as the dimmer,
      // because a dimmed label has to be measured at the colour a reader sees.
      // On the slab the muted ground is the slab's own, so the socket reads as
      // a slot that is not there rather than as an empty one - and since the
      // socket carries no words, **the sentence is printed under the hands
      // row**, where a reader simply sees it. A tooltip nobody hovers is not a
      // refusal.
      const actor = await makeCharacter({
        name: "ZZ Overview Barred Dark", classes: [["Warrior", 1]], weapons: ["Greataxe"]
      });
      const axe = actor.items.find(i => i.name === "Greataxe");
      await axe.update({ "system.equipped": true });
      await until(() => actor.items.get(axe.id)?.system.equipped === true, "the greataxe to go on");

      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        const off = tileFor(panel, "offHand");
        assert.ok(off.classList.contains("is-barred"), "the greataxe did not bar the off hand");

        // IN WORDS, beside the grey - never the grey alone.
        const why = game.i18n.format("AZEROTH.Overview.TwoHanded", { name: axe.name });
        const line = panel.querySelector(".azeroth-doll-barred");
        assert.ok(line, "nothing on the figure says why the off hand is shut");
        assert.include(line.textContent, why, "the line under the hands row does not say why");
        assert.include(line.textContent, game.i18n.format("AZEROTH.Overview.BarredLabel", { note: why }),
          "the line does not say that the slot is barred as well as why");
        assert.include(off.getAttribute("aria-label"), why, "the barred socket's own label does not say why");

        // A FLAT OPAQUE GROUND, and no opacity anywhere in the socket, and no
        // silhouette either: a picture of a shield is the opposite of what a
        // barred off hand means.
        const ground = parseColour(getComputedStyle(off).backgroundColor);
        assert.equal(ground?.[3], 1, `the barred socket's ground is not opaque (${getComputedStyle(off).backgroundColor})`);
        assert.deepEqual(ground.slice(0, 3), tokenOf(off, "--azeroth-stone-dark"),
          "the barred socket does not sink into the slab");
        assert.equal(getComputedStyle(off).backgroundImage, "none", "the barred socket still draws a silhouette");
        for (const el of [off, line, ...off.querySelectorAll("*")]) {
          assert.equal(getComputedStyle(el).opacity, "1",
            `${el.className || el.tagName} dims with opacity; a flat ground is the rule (D-608)`);
        }
        // And the sentence is measured beside every other line rather than
        // trusted.
        const findings = checkText(line);
        assert.deepEqual(findings, [],
          `the barred line is not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    // ---- the three images (D-700) -----------------------------------------
    //
    // The lead set the Prototype Token dialog's Image Path and the banner did
    // not move, because the banner drew `actor.img` and the dialog writes
    // `prototypeToken.texture.src`. These are the tests that say each surface
    // reads the field it is supposed to read AND that each control's write
    // lands on the document (D-603) - the source reads are in
    // `module/applications/portraits.test.mjs`.

    it("the banner portrait follows the prototype token, and img stays the directory's", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Portrait Token", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const portrait = () => sheet.element.querySelector("img.azeroth-portrait");
        assert.ok(portrait(), "the banner draws no portrait");
        // It starts on the token, which core backfills from `img` at
        // initialisation - `BaseActor#_initializeSource` runs
        // `src = src || source.img`, so it is never blank.
        assert.equal(portrait().getAttribute("src"), actor.prototypeToken.texture.src,
          "the banner does not draw the prototype token");

        // WHAT THE LEAD DID: the Prototype Token dialog writes this one field
        // through `actor.update`, which is what has to reach the banner.
        const token = "icons/svg/target.svg";
        const before = actor.img;
        await actor.update({ "prototypeToken.texture.src": token });
        // Re-query on every turn: an AppV2 re-render detaches the node.
        await until(() => sheet.element.querySelector("img.azeroth-portrait")?.getAttribute("src") === token,
          "the banner to follow the prototype token");
        assert.equal(actor.img, before, "setting the token changed the Actor directory's portrait");
      } finally {
        await sheet.close();
      }
    });

    it("the banner's portrait writes the TOKEN, and the document reads it back", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Portrait Write", classes: [["Warrior", 1]] });
      // A token that differs from `img`, so the picker below is proved to have
      // walked the NESTED path rather than to have fallen back to the portrait.
      const opened = "icons/svg/target.svg";
      await actor.update({ "prototypeToken.texture.src": opened });
      const sheet = await openSheet(actor);
      let picker = null;
      try {
        const portrait = () => sheet.element.querySelector("img.azeroth-portrait");
        // The click is core's `editImage` ACTION - `data-edit` alone is dead in
        // AppV2 - and it is registered by `DocumentSheetV2`, never by us.
        assert.equal(portrait().dataset.action, "editImage", "the portrait carries no editImage action");
        assert.equal(portrait().dataset.edit, "prototypeToken.texture.src", "the portrait edits the wrong field");
        assert.isOk(sheet.options.actions.editImage, "editImage is not registered - the click is a silent no-op");

        // THE CLICK REALLY OPENS THE PICKER, on the nested path's own value.
        // `#onEditImage` reads `dataset.edit` through `getProperty` against
        // `_source`; a path it could not walk would open on `undefined`.
        portrait().click();
        await until(() => foundry.applications.instances.get("file-picker")?.rendered === true,
          "the FilePicker to open from the banner");
        picker = foundry.applications.instances.get("file-picker");
        assert.equal(picker.request, opened, "the picker did not open on the prototype token's own path");
        assert.notEqual(picker.request, actor.img, "the picker opened on the directory portrait");
        await picker.close();
        picker = null;

        // EXACTLY WHAT CORE'S FILEPICKER CALLBACK DOES (document-sheet.mjs):
        // set the src and dispatch a submit. A nested `data-edit` path only
        // works if `FormDataExtended` carries it through the update, which is
        // the half that cannot be checked by reading the source.
        const token = "icons/svg/shield.svg";
        portrait().src = token;
        sheet.form.dispatchEvent(new Event("submit", { cancelable: true }));
        await until(() => actor.prototypeToken.texture.src === token,
          "the token image to land on the document");
        assert.equal(actor.prototypeToken.texture.src, token);
      } finally {
        if (picker?.rendered) await picker.close();
        await sheet.close();
      }
    });

    it("the Overview centre draws system.art and sets it from the tab (D-603)", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Portrait Art", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      let picker = null;
      try {
        let panel = await overviewOf(sheet);
        const centre = () => sheet.element.querySelector(".azeroth-doll-portrait img");
        assert.ok(centre(), "the figure draws no centre image");
        // Nothing set: it falls back to the directory portrait, and there is
        // no View control, because opening nothing is worse than no door.
        assert.equal(actor.system.art, "", "the fixture already carries art");
        assert.equal(centre().getAttribute("src"), actor.img, "the centre does not fall back to img");
        assert.isNull(panel.querySelector('[data-action="viewArt"]'),
          "a View button is drawn with no art to view");
        assert.equal(centre().dataset.action, "editArt", "the centre image is not the control that sets the art");
        assert.isFunction(sheet.options.actions.editArt, "editArt is not registered - the click is a silent no-op");
        assert.isFunction(sheet.options.actions.viewArt, "viewArt is not registered");

        // The control's own door: click it, take the FilePicker it built, and
        // run the callback it was given. The browser UI itself is core's.
        centre().click();
        await until(() => foundry.applications.instances.get("file-picker")?.rendered === true,
          "the FilePicker to open");
        picker = foundry.applications.instances.get("file-picker");
        assert.isFunction(picker.callback, "the picker was built with no callback");
        assert.equal(picker.request, actor.img, "the picker did not open on the resolved art");

        const art = "icons/svg/book.svg";
        await picker.callback(art);
        await until(() => actor.system.art === art, "the art to land on the document");
        assert.equal(actor.system.art, art);

        // And the tab moved with it: the plate is drawn and the View door is
        // there now.
        await until(() => sheet.element.querySelector(".azeroth-doll-portrait img")?.getAttribute("src") === art,
          "the centre to draw the art");
        panel = sheet.element.querySelector('section[data-tab="overview"]');
        const view = panel.querySelector('[data-action="viewArt"]');
        assert.ok(view, "no View button once art is set");
        assert.include(view.textContent, game.i18n.localize("AZEROTH.Overview.ViewArt"),
          "the View button says nothing in words");
        // The banner is UNMOVED: three images, and this one is the plate.
        assert.equal(sheet.element.querySelector("img.azeroth-portrait").getAttribute("src"),
          actor.prototypeToken.texture.src, "setting the art moved the banner's token");
        assert.notEqual(actor.img, art, "setting the art moved the Actor directory's portrait");
      } finally {
        if (picker?.rendered) await picker.close();
        await sheet.close();
      }
    });

    /* ---- what is acting on the character right now (2026-09-20) ----------
     *
     * The lead: *Could use the open space in overview to show currently
     * active effects or conditions.* The strip is a READING of
     * `effectsContext` - the object Core's grid and its effect list are drawn
     * from on the same render - so what these prove is that the reading
     * FOLLOWS: a condition switched on two tabs away is on the strip, a clear
     * pressed here lands everywhere, and a row the door would refuse draws no
     * control at all (D-681's shape). Every write goes through a real
     * control; nothing here stages state (D-748).
     */

    it("a condition switched on from the Core grid is on the strip, named, with A1's X", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ InPlay Conditions", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const core = await coreOf(sheet);
        assert.isFunction(sheet.options.actions.toggleCondition, "toggleCondition is not registered");
        // THE REAL DOOR: the Core grid's own chip, which is where a condition
        // is switched on. Scoped to the panel, because the strip carries the
        // same action for the clear.
        core.querySelector('[data-action="toggleCondition"][data-condition="stunned"]').click();
        await until(() => actor.statuses.has("stunned"), "Stunned to apply");
        // And a valued one, stepped twice: A1 gives Bleeding an X.
        for (let i = 0; i < 2; i++) {
          sheet.element.querySelector('section[data-tab="core"] [data-action="stepCondition"][data-condition="bleeding"][data-delta="1"]').click();
          await until(() => (actor.effects.find(e => e.statuses?.has("bleeding"))?.getFlag("azeroth-rpg", "value") ?? 0) === i + 1,
            `Bleeding ${i + 1}`);
          await settle();
        }

        await overviewOf(sheet);
        await until(() => stripRow(sheet, '[data-condition="stunned"]'), "Stunned on the Overview strip");
        assert.equal(rowText(stripRow(sheet, '[data-condition="stunned"]'), ".azeroth-in-play-name"),
          game.i18n.localize(AZEROTH.conditions.stunned), "the strip does not name the condition");
        assert.equal(rowText(stripRow(sheet, '[data-condition="bleeding"]'), ".azeroth-in-play-name"),
          game.i18n.format("AZEROTH.InPlay.Valued", { name: game.i18n.localize(AZEROTH.conditions.bleeding), n: 2 }),
          "a valued condition does not print its X");
        // WHAT IS OFF IS NOT ON THE STRIP: it shows and cancels, it does not apply.
        assert.isNull(stripRow(sheet, '[data-condition="prone"]'), "a condition that is off reached the strip");

        // A CENSUS THAT THE READING FOLLOWED (D-681): one strip row for every
        // lit chip on Core, on the same render, because both are the same
        // `effectsContext` object.
        const lit = [...sheet.element.querySelectorAll("section[data-tab=\"core\"] .azeroth-condition.is-active")]
          .map(el => el.dataset.condition).sort();
        const strip = stripRows(sheet).filter(r => r.dataset.condition).map(el => el.dataset.condition).sort();
        assert.deepEqual(strip, lit, "the strip and the Core grid disagree about what is on");
        assert.isAtLeast(lit.length, 2, "the fixture lit fewer conditions than it set");
      } finally {
        await sheet.close();
      }
    });

    it("clearing a condition from the strip clears it everywhere, and the Core grid follows", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ InPlay Clear", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const core = await coreOf(sheet);
        core.querySelector('[data-action="toggleCondition"][data-condition="slowed"]').click();
        await until(() => actor.statuses.has("slowed"), "Slowed to apply");

        await overviewOf(sheet);
        await until(() => stripRow(sheet, '[data-condition="slowed"]'), "Slowed on the strip");
        // THE SAME FUNCTION CORE'S CONTROL CALLS - `effectAction`, through the
        // action the chip itself carries. A second rule for removal is what
        // this system keeps getting wrong (D-686).
        const clear = stripRow(sheet, '[data-condition="slowed"]').querySelector("button[data-action]");
        assert.equal(clear.dataset.action, "toggleCondition", "the strip invented a door of its own");
        clear.click();

        await until(() => !actor.statuses.has("slowed"), "Slowed to lift");
        await until(() => !stripRow(sheet, '[data-condition="slowed"]'), "the row to leave the strip");
        // AND THE GRID TWO TABS AWAY FOLLOWS, because it is one reading.
        await coreOf(sheet);
        const chip = sheet.element.querySelector('section[data-tab="core"] .azeroth-condition[data-condition="slowed"]');
        assert.notOk(chip.classList.contains("is-active"), "the Core chip is still lit");
        assert.equal(chip.querySelector('[data-action="toggleCondition"]').getAttribute("aria-pressed"), "false",
          "the Core chip still reads as pressed");
      } finally {
        await sheet.close();
      }
    });

    it("an Active Effect in force is listed with core's own span, and the x removes it", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ InPlay Effects", classes: [["Warrior", 1]] });
      // BY NAME, never `contents[0]`: a collection's order is not a contract.
      await actor.createEmbeddedDocuments("ActiveEffect", [
        { name: "ZZ Blessing of Might", img: "icons/svg/aura.svg", duration: { value: 1, units: "minutes" } },
        { name: "ZZ Dormant Ward", img: "icons/svg/aura.svg", disabled: true }
      ]);
      const blessing = actor.effects.find(e => e.name === "ZZ Blessing of Might");
      const dormant = actor.effects.find(e => e.name === "ZZ Dormant Ward");
      const sheet = await openSheet(actor);
      try {
        await overviewOf(sheet);
        const row = stripRow(sheet, `[data-effect-id="${blessing.id}"]`);
        assert.ok(row, "an effect in force is not on the strip");
        assert.equal(rowText(row, ".azeroth-in-play-name"), "ZZ Blessing of Might");
        // CORE'S OWN LABEL, read off the document rather than recomposed here:
        // the strip prints `duration.label` and nothing else, so the two can
        // never say different spans.
        assert.equal(rowText(row, ".azeroth-in-play-when"), blessing.duration.label,
          "the strip's span is not the document's own");
        // ONLY WHAT IS IN FORCE. A disabled effect keeps its On/Off toggle on
        // Core, which is the only place it can be turned back on.
        assert.isNull(stripRow(sheet, `[data-effect-id="${dormant.id}"]`), "a disabled effect reached the strip");
        assert.ok(sheet.element.querySelector(`.azeroth-effect[data-effect-id="${dormant.id}"]`),
          "the disabled effect left Core's own list too");

        assert.isFunction(sheet.options.actions.deleteEffect, "deleteEffect is not registered");
        const clear = row.querySelector("button[data-action]");
        assert.equal(clear.dataset.action, "deleteEffect", "the strip invented a door of its own");
        clear.click();
        await until(() => !actor.effects.get(blessing.id), "the effect to be deleted");
        await until(() => !stripRow(sheet, `[data-effect-id="${blessing.id}"]`), "the row to leave the strip");
        assert.ok(actor.effects.get(dormant.id), "clearing one effect took another with it");
      } finally {
        await sheet.close();
      }
    });

    it("an effect the system itself writes draws no control and says why, at both doors", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ InPlay Refused", classes: [["Warrior", 1]] });
      // A REAL TALENT, taken through the field the tree writes: the actor's own
      // `syncTalentEffects` is what lays the passive down (D-648), and it lays
      // it down again after any delete - which is why the strip refuses.
      const toughness = actor.items.find(i => i.type === "talent" && i.name === "Toughness");
      assert.ok(toughness, "the Warrior's talents did not arrive");
      await toughness.update({ "system.taken": 1 });
      await until(() => actor.effects.some(e => e.getFlag("azeroth-rpg", "talentEffect") === "toughness"),
        "the talent's passive to be written");
      const passive = actor.effects.find(e => e.getFlag("azeroth-rpg", "talentEffect") === "toughness");

      const sheet = await openSheet(actor);
      try {
        await overviewOf(sheet);
        const row = stripRow(sheet, `[data-effect-id="${passive.id}"]`);
        assert.ok(row, "the talent's passive is not on the strip");
        // NO DEAD CONTROL, and the refusal said in words beside it (D5 §7).
        assert.isNull(row.querySelector("button"), "a refused clear still drew a control");
        assert.equal(rowText(row, ".azeroth-in-play-note"), game.i18n.localize("AZEROTH.InPlay.FromTalent"),
          "the strip does not say why it cannot be cleared");

        // THE DOOR SAYS THE SAME THING. One rule, two doors: pressing Core's
        // own x refuses in the same sentence rather than deleting an effect
        // the next sync writes back.
        await coreOf(sheet);
        const coreDelete = sheet.element.querySelector(`.azeroth-effect[data-effect-id="${passive.id}"] [data-action="deleteEffect"]`);
        assert.ok(coreDelete, "the talent's passive is not on Core's own list");
        const said = await noticesFrom("warn", async () => {
          coreDelete.click();
          await settle();
          await new Promise(r => setTimeout(r, 300));
        });
        assert.ok(actor.effects.get(passive.id), "the door deleted an effect the sync would write back");
        assert.include(said.join(" "), game.i18n.localize("AZEROTH.InPlay.FromTalent"), "the door refused in silence");

        // AND FATIGUED, which is the Long Rest's to lift (A1's Ends line,
        // D-624) and has refused at that door since the chip was built.
        await actor.update({ "system.fatigue": 1 });
        await until(() => actor.statuses.has("fatigued"), "the Fatigue track to light the status");
        await overviewOf(sheet);
        await until(() => stripRow(sheet, '[data-condition="fatigued"]'), "Fatigued on the strip");
        const fatigued = stripRow(sheet, '[data-condition="fatigued"]');
        assert.isNull(fatigued.querySelector("button"), "Fatigued drew a clear the door would refuse");
        assert.equal(rowText(fatigued, ".azeroth-in-play-note"), game.i18n.localize("AZEROTH.Sheet.FatiguedByRest"));
      } finally {
        await sheet.close();
      }
    });

    it("with nothing in force one quiet line says so, and the sockets do not move when something arrives", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ InPlay Empty", classes: [["Warrior", 1]] });
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        // IN THE FIGURE'S OWN COLUMN, never a track of its own: the matrix
        // counts four laid-out children of `.window-content` on a wide tab.
        assert.ok(panel.querySelector(".azeroth-overview-figure .azeroth-in-play"),
          "the strip is not inside the figure column");
        const rows = stripRows(sheet);
        assert.equal(rows.length, 1, "an empty strip drew more than the one line");
        assert.ok(rows[0].classList.contains("azeroth-in-play-row--empty"));
        assert.equal(rowText(rows[0]), game.i18n.localize("AZEROTH.InPlay.Nothing"));

        // THE PANEL KEEPS ITS OWN HEIGHT, so the tab does not jump as a fight
        // starts and stops. Measured on the SOCKET above it, which is the
        // thing a reader would see move.
        const socketTop = () => sheet.element.querySelector('section[data-tab="overview"] [data-slot="mainHand"]')
          .getBoundingClientRect().top;
        const before = socketTop();
        assert.isAtLeast(stripOf(sheet).getBoundingClientRect().height, 140, "the empty panel collapsed");

        await coreOf(sheet);
        sheet.element.querySelector('section[data-tab="core"] [data-action="toggleCondition"][data-condition="prone"]').click();
        await until(() => actor.statuses.has("prone"), "Prone to apply");
        await overviewOf(sheet);
        await until(() => stripRow(sheet, '[data-condition="prone"]'), "Prone on the strip");
        assert.equal(stripRows(sheet).length, 1, "the empty line stayed beside the row");
        assert.closeTo(socketTop(), before, 1, "the hands row moved when a condition arrived");
      } finally {
        await sheet.close();
      }
    });

    it("reads in words and measures clean, filled and barred", async function () {
      this.timeout(90000);
      const actor = await makeCharacter({ name: "ZZ Overview Legible", classes: [["Warrior", 1]], race: "Dwarf" });
      // With ART set, so the View button beneath the plate is in the frame and
      // measured beside every other line (D-700, D-608).
      await actor.update({ "system.art": "icons/svg/book.svg" });
      // **AND WITH THE STRIP LOADED** (2026-09-20), or every ink on it - the
      // icon's well, the name, core's own span, the refusal and the x - is
      // measured by nothing at all. One condition that clears, one that does
      // not (Fatigued, the Long Rest's to lift) and one effect with a span.
      await actor.createEmbeddedDocuments("ActiveEffect", [
        { name: "ZZ Blessing of Might", img: "icons/svg/aura.svg", duration: { value: 1, units: "minutes" } }
      ]);
      await actor.toggleStatusEffect("stunned", { active: true });
      await actor.update({ "system.fatigue": 1 });
      const worn = [];
      for (const name of ["Ring", "Signet ring", "Cloak", "Belt", "Boots", "Mantle", "Common clothes"]) {
        worn.push(await give(actor, name));
      }
      worn.push(await give(actor, "Greataxe", PACK_FOR.weapon));
      await actor.updateEmbeddedDocuments("Item", worn.map(i => ({ _id: i.id, "system.equipped": true })));
      const sheet = await openSheet(actor);
      try {
        const panel = await overviewOf(sheet);
        // The barred tile is in the frame, so its muted ground is measured
        // beside every other line (D-608: opacity is never the dimmer).
        assert.ok(tileFor(panel, "offHand").classList.contains("is-barred"), "the greataxe did not bar the off hand");
        // And so is the View button (D-700), or its ground is measured by
        // nothing at all.
        assert.ok(panel.querySelector('[data-action="viewArt"]'), "the art's View button is not in the frame");
        // AND THE STRIP IS LOADED IN THE FRAME (2026-09-20). Asserted rather
        // than assumed: a measurement of an empty panel would pass whatever
        // happened to the inks on its rows.
        await until(() => stripRow(sheet, '[data-condition="fatigued"]'), "Fatigued on the strip");
        assert.equal(stripRows(sheet).length, 3, "the strip is not carrying the three rows the fixture set");
        assert.ok(stripRow(sheet, '[data-condition="stunned"]').querySelector("button"), "no clear control is in the frame");
        assert.ok(stripRow(sheet, '[data-condition="fatigued"]').querySelector(".azeroth-in-play-note"), "no refusal is in the frame");
        assert.ok(stripOf(sheet).querySelector(".azeroth-in-play-when"), "no duration is in the frame");
        assert.deepEqual(checkNoRawKeys(panel), [], "a raw key reached the Overview tab");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [],
          `the Overview tab is not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });
  });
}
