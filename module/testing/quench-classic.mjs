/**
 * Classic dungeon and raid loot, inside a live world (D-685, D-686).
 *
 * **These are use tests.** The conversion law is `rules/classic-loot.mjs` and
 * its Vitest reads the whole vendored record; the parser's output is pinned
 * byte for byte by `tools/check-packs.mjs`. What neither of those can see is
 * that the COMPILED packs carry what `packs-src` holds, that the folders and
 * the shelves a person actually browses are there, and that the CONSUMER moved
 * (D-681): a Classic ring's grant reaching an actor's Strength, its weight
 * reaching the carry line, the Signature block reaching a sheet, and the Forge
 * offering a Rare the Signature box that D-686 relaxed.
 *
 * A locked LevelDB compiles to nothing and reports success (CLAUDE.md §9), so
 * the count assertions here are the only place a world that loaded an empty
 * pack says so.
 *
 * Every document a test makes is deleted in `after`.
 */

import { PACK_COUNTS } from "./pack-counts.mjs";
import { PACK_FOR, browserOpen, cleanup, fromPack, inspect, made, makeCharacter, openSheet, settle } from "./fixtures.mjs";
import { checkNoRawKeys } from "./expectations.mjs";
import { checkText } from "./geometry.mjs";
import { plan } from "../rules/forge.mjs";
import { AZEROTH } from "../config.mjs";

/**
 * What the three equipment packs hold, chapter plus finds.
 *
 * **Read from `pack-counts.mjs`, never restated here.** This file carried its
 * own copy of `tools/check-packs.mjs`'s numbers and it went stale twice in one
 * day — D-689's Mantle, then D-690's fourteen recovered finds — taking the
 * whole in-Foundry run red on a number that had legitimately moved.
 *
 * They are pinned rather than floored on purpose: the packs are generated and
 * diffed byte for byte, so a count that has moved in a live world means the
 * compiled LevelDB and `packs-src` disagree — which is exactly the silent
 * failure a world holding the packs open produces.
 */
const EXPECTED = Object.freeze(Object.fromEntries(
  ["weapons", "armor", "gear"].map(key => [key, {
    pack: `azeroth-rpg.${key}`,
    total: PACK_COUNTS[key].count,
    classic: PACK_COUNTS[key].classic
  }])
));

/** The find whose grant the consumer test follows all the way to a score. */
const RING = "Overlord's Crimson Band";
/**
 * An EPIC find carrying 08 §6's raised band at both ends (D-701): `+5
 * Strength` and `+3 Constitution` on one belt. The Rare above proves the path;
 * this proves the MAGNITUDE reaches the score, which is the whole decision.
 */
const GIRDLE = "Ablative Chitin Girdle";
/** A find whose Signature the book did convert, so the block has words in it. */
const SIGNED = "Bloodfist";
/** The raid the shelf facet is read on. */
const RAID = "Molten Core";

const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const change = el => el.dispatchEvent(new Event("change", { bubbles: true }));

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 10000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** A pack's index carrying the fields the Classic census reads. */
const classicIndex = pack => pack.getIndex({
  fields: ["system.source.document", "system.source.section", "system.rarity",
    "system.budget", "system.signature", "folder"]
});

/** The visible rows of one browser category — `hidden` is how the filter narrows. */
const shownIn = (browser, category) =>
  [...browser.element.querySelectorAll(`.azeroth-browser-category[data-category="${category}"] .azeroth-browser-entry`)]
    .filter(el => !el.hidden);

export function classicBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Classic dungeon and raid loot (D-685)", function () {
    after(async function () {
      this.timeout(90000);
      await cleanup();
    });

    // ---- the packs, as compiled --------------------------------------------

    it("the three equipment packs carry the chapter's items and every Classic find", async function () {
      this.timeout(60000);
      for (const [key, want] of Object.entries(EXPECTED)) {
        const pack = game.packs.get(want.pack);
        assert.ok(pack, `the ${key} pack did not load`);
        const index = await classicIndex(pack);
        assert.equal(index.size, want.total,
          `${key} holds ${index.size} documents, expected ${want.total} — `
          + "packs-src and the compiled pack disagree (tools/check-packs.mjs EXPECTED)");
        const classic = index.filter(e => e.system?.source?.document === "Classic");
        assert.equal(classic.length, want.classic, `${key} holds ${classic.length} Classic finds, expected ${want.classic}`);

        // Every find is Rare or Epic (A1), and its section is the two-part one
        // `sectionTail`, `weightFor` and `iconFor` all read (D-685).
        const rarities = new Set(classic.map(e => e.system?.rarity));
        assert.deepEqual([...rarities].sort(), ["epic", "rare"], `${key}: a Classic find is neither Rare nor Epic`);
        const badSection = classic.find(e => !/^Classic · .+/.test(String(e.system?.source?.section ?? "")));
        assert.isUndefined(badSection, `${key}: ${badSection?.name} carries the section "${badSection?.system?.source?.section}"`);
      }
    });

    it("files every find under Classic loot, one folder to a zone", async function () {
      this.timeout(60000);
      for (const [key, want] of Object.entries(EXPECTED)) {
        const pack = game.packs.get(want.pack);
        const index = await classicIndex(pack);
        const root = pack.folders.find(f => f.name === "Classic loot" && !f.folder);
        assert.ok(root, `the ${key} pack has no "Classic loot" folder at its root`);

        // `Folder#folder` resolves to the parent DOCUMENT; an index entry's
        // `folder` is the raw id. Comparing the two silently matches nothing.
        const zones = pack.folders.filter(f => f.folder?.id === root.id);
        assert.isAtLeast(zones.length, 20, `${key}: only ${zones.length} zone folders under Classic loot`);
        assert.ok(zones.find(f => f.name === RAID), `${key}: no "${RAID}" folder under Classic loot`);

        // A document pointing at a folder the pack does not hold is not an
        // error in Foundry — it renders at the root, so the tree looks right
        // until you count what is in it.
        const zoneIds = new Set(zones.map(f => f.id));
        const stray = index.filter(e => e.system?.source?.document === "Classic" && !zoneIds.has(e.folder));
        assert.equal(stray.length, 0,
          `${key}: ${stray.length} find(s) sit outside Classic loot, e.g. ${stray[0]?.name}`);
      }
    });

    // ---- the browser, on a raid --------------------------------------------

    it("the browser on Weapons narrows to a raid's shelf and the rows read", async function () {
      this.timeout(120000);
      const pack = game.packs.get(EXPECTED.weapons.pack);
      const index = await classicIndex(pack);
      const inRaid = index.filter(e => e.system?.source?.section === `Classic · ${RAID}`).map(e => e.name);
      assert.isAtLeast(inRaid.length, 1, `the weapons pack holds nothing from ${RAID}`);

      const browser = await browserOpen("weapons", { "system.source.section": RAID });
      try {
        const facet = browser.element.querySelector(
          `.azeroth-browser-category[data-category="weapons"] details[data-facet="shelf"] input[data-facet-value="${RAID}"]`);
        assert.ok(facet, `the Shelf facet offers no "${RAID}" option`);
        assert.isTrue(facet.checked, "the browser opened without the shelf set");

        const shown = shownIn(browser, "weapons");
        assert.isAtLeast(shown.length, 1, "the browser shows no rows at all");
        assert.equal(shown.length, inRaid.length,
          `the shelf shows ${shown.length} rows where the pack holds ${inRaid.length} ${RAID} weapons`);

        for (const row of shown) {
          const name = row.querySelector(".azeroth-browser-name");
          assert.ok(name, "a row draws no name");
          assert.include(inRaid, name.textContent.trim(), `"${name.textContent.trim()}" is not a ${RAID} weapon`);
          // The ring is the second carrier of rarity, and every find wears its
          // own icon off the record (D-685).
          const img = row.querySelector(".azeroth-icon img");
          assert.ok(img, `${name.textContent.trim()} draws no icon`);
          assert.match(img.getAttribute("src") ?? "", /\.(png|webp|svg)$/i,
            `${name.textContent.trim()} has no image file behind it`);
          assert.match(name.className, /azeroth-rarity-(rare|epic|legendary)/,
            `${name.textContent.trim()} is not coloured for its rarity`);
        }

        assert.deepEqual(checkNoRawKeys(browser.element), [], "a raw key reached the browser");
        const findings = checkText(browser.element);
        assert.deepEqual(findings, [],
          `the browser is not legible on a Classic shelf:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await browser.close();
      }
    });

    // ---- a find's own sheet -------------------------------------------------

    it("a Classic Rare's sheet shows its Signature block and the Classic line", async function () {
      this.timeout(60000);
      const source = await fromPack(PACK_FOR.weapon, SIGNED);
      assert.equal(source.system.rarity, "rare", `${SIGNED} is no longer a Rare; pick another signed find`);
      assert.isNotEmpty(source.system.signature, `${SIGNED} carries no Signature`);
      const item = await Item.create({ ...source.toObject(), name: `ZZ ${source.name}` });
      made.push(item);

      const sheet = await openSheet(item);
      try {
        const block = sheet.element.querySelector(".azeroth-item__signature");
        assert.ok(block, "the sheet draws no Signature block");
        assert.include(block.textContent, game.i18n.localize("AZEROTH.Item.Signature"),
          "the Signature block has no heading");
        // The words, not the markup: D-667's `<prose-mirror>` keeps its text
        // INSIDE the element, so an empty block reads as a blank section.
        const words = block.textContent.replace(game.i18n.localize("AZEROTH.Item.Signature"), "").trim();
        assert.isAtLeast(words.length, 20, `the Signature block is empty: "${words}"`);

        // D-690 DELETED the Classic stat line. The lead read the shipped items
        // and said the WoW numbers were not relevant to this system and the
        // item did not appear to do anything, so a find's description is now
        // its flavour text or nothing at all, and what it does is its traits,
        // its grants and this Signature. A8 said the opposite and is retired.
        // The assertion is inverted rather than deleted: it is what would
        // catch the stat line coming back.
        const description = sheet.element.querySelector(".azeroth-item__description");
        assert.ok(description, "the sheet draws no description");
        assert.notInclude(sheet.element.textContent, "Classic.",
          "a find is printing its WoW stat line again (D-690)");
        // Where it drops is an editable field, so it is a VALUE and not text:
        // reading `textContent` for it finds nothing and looks like a gap.
        const provenance = sheet.element.querySelector('[name="system.provenance"]');
        assert.ok(provenance, "the sheet draws no Provenance field");
        assert.equal(provenance.value, source.system.provenance,
          "the sheet does not say where the item drops");

        assert.deepEqual(checkNoRawKeys(sheet.element), [], "a raw key reached a Classic item's sheet");
        const findings = checkText(sheet.element);
        assert.deepEqual(findings, [],
          `a Classic item's sheet is not legible:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await sheet.close();
      }
    });

    // ---- the consumer moved (D-681) ----------------------------------------

    it("a Classic ring worn from the Gear tab moves the Strength total and frees its bag slot", async function () {
      this.timeout(90000);
      const source = await fromPack(PACK_FOR.equipment, RING);
      const grants = source.getFlag("azeroth-rpg", "grants") ?? [];
      assert.include(grants, "+1 Strength", `${RING} no longer grants +1 Strength; pick another find`);
      assert.equal(source.system.slot, "finger", `${RING} is not worn on a finger`);
      assert.isNumber(source.system.weight, `${RING} carries no weight`);

      const actor = await makeCharacter({ name: "ZZ Classic Ring", classes: [["Warrior", 1]] });
      const usedBefore = actor.system.bagSlots.used;
      const strBefore = actor.system.abilities.str.total;

      const [ring] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);

      // **WHAT IS WORN TAKES NO BAG SLOT AND WHAT IS CARRIED TAKES ONE**
      // (05 *Speed and movement*, 08 §11; D-735). In a bag the ring is one
      // well; on a finger it is none.
      assert.equal(actor.system.bagSlots.used, usedBefore + 1, "a carried ring took no bag slot");
      assert.equal(actor.system.abilities.str.total, strBefore, "an unworn ring granted Strength");

      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("gear", "primary");
        await settle();
        const card = await inspect(sheet, ring.id);
        assert.ok(card, "the Gear tab draws no card for the ring");
        assert.include(card.textContent, game.i18n.localize(AZEROTH.wornSlots.finger),
          "the card does not say which of 08 §11's slots it is worn in");
        assert.include(card.textContent, game.i18n.localize("AZEROTH.Item.BagSlotsTakesOne"),
          "the card does not say what the ring takes");

        // D-686: a worn thing is equippable from the Gear tab at all. Before
        // it, a ring could only be equipped through the item sheet's checkbox.
        const equip = card.querySelector('[data-action="toggleEquipped"]');
        assert.ok(equip, "the ring's card carries no Equip control");
        assert.isFunction(sheet.options.actions.toggleEquipped,
          "toggleEquipped is not registered — the click is a silent no-op");
        click(equip);
        await until(() => actor.items.get(ring.id)?.system.equipped === true, "the ring to go on");
      } finally {
        await sheet.close();
      }

      assert.equal(actor.system.abilities.str.bonus, 1, "the ring's grant did not reach the score");
      assert.equal(actor.system.abilities.str.total, strBefore + 1, "the Strength total did not rise");
      const sources = actor.system.abilities.str.sources ?? [];
      assert.include(sources.map(s => s.name), ring.name, "the score does not name what granted the point");
      assert.equal(actor.system.bagSlots.used, usedBefore, "wearing the ring did not free its bag slot");

      await ring.update({ "system.equipped": false });
      assert.equal(actor.system.abilities.str.total, strBefore, "taking the ring off left the point behind");
      assert.equal(actor.system.bagSlots.used, usedBefore + 1, "taking it off did not put it back in a bag");
    });

    /**
     * **THE RAISED BAND REACHES A SCORE** (D-701). The pack census in
     * `classic-pack.test.mjs` says every Epic grants inside [3, 5]; this says
     * the number a find carries is the number a character wears, at both ends
     * of the band on one belt. Before D-701 every Epic in the packs granted +1
     * or +2 while the conversion had already graded it, which is D-681's shape.
     */
    it("an Epic find's raised grants reach both scores and come off together", async function () {
      this.timeout(90000);
      const source = await fromPack(PACK_FOR.equipment, GIRDLE);
      const grants = source.getFlag("azeroth-rpg", "grants") ?? [];
      assert.equal(source.system.rarity, "epic", `${GIRDLE} is no longer an Epic; pick another find`);
      assert.include(grants, "+5 Strength", `${GIRDLE} no longer grants +5 Strength; pick another find`);
      assert.include(grants, "+3 Constitution", `${GIRDLE} no longer grants +3 Constitution; pick another find`);

      const actor = await makeCharacter({ name: "ZZ Classic Girdle", classes: [["Warrior", 1]] });
      const strBefore = actor.system.abilities.str.total;
      const conBefore = actor.system.abilities.con.total;
      const [girdle] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);
      assert.equal(actor.system.abilities.str.total, strBefore, "an unworn belt granted Strength");

      await girdle.update({ "system.equipped": true });
      await until(() => actor.system.abilities.str.bonus === 5, "the Epic's five points of Strength");
      assert.equal(actor.system.abilities.str.total, strBefore + 5, "08 §6's Epic band did not reach the score");
      assert.equal(actor.system.abilities.con.total, conBefore + 3, "the second attribute did not reach its score");
      const named = (actor.system.abilities.str.sources ?? []).map(s => s.name);
      assert.include(named, girdle.name, "the score does not name what granted the five");

      await girdle.update({ "system.equipped": false });
      await until(() => actor.system.abilities.str.bonus === 0, "the grants to come off");
      assert.equal(actor.system.abilities.con.total, conBefore, "taking the belt off left the Constitution behind");
    });

    // ---- the Forge, on a Rare (D-686) --------------------------------------

    it("the Forge opens the Signature box on a Classic Rare and plan takes a gated one", async function () {
      this.timeout(120000);
      const { AzerothForge } = await import("../applications/forge.mjs");
      const pack = game.packs.get(EXPECTED.weapons.pack);
      const index = await classicIndex(pack);
      // A find with room in Rare's band of 2 to 3 for a gated Signature (1),
      // and none of its own to double-count.
      const entry = index.find(e => e.system?.source?.document === "Classic"
        && e.system?.rarity === "rare"
        && e.system?.budget === 2
        && !String(e.system?.signature ?? "").trim());
      assert.ok(entry, "the weapons pack holds no Classic Rare at budget 2 without a Signature");
      const source = await pack.getDocument(entry._id);

      const actor = await makeCharacter({ name: "ZZ Classic Forge", classes: [["Warrior", 5]] });
      const [item] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);
      const text = "<p>Once per Short Rest, a Warrior holding it strikes without paying the Half-Action.</p>";

      // The law first: 08 §20 as D-686 amended it. A Rare pays for its
      // Signature out of its own budget, so 2 + 1 lands inside 2 to 3.
      const base = { name: item.name, type: item.type, system: item.system.toObject() };
      const p = plan({ base, rarity: "rare", signature: { kind: "gated", text } });
      assert.isTrue(p.ok, `plan refused a Rare's gated Signature: ${p.reasons.join("; ")}`);
      assert.equal(p.spent, 3, "a Rare's gated Signature does not land at 3");
      assert.deepEqual(p.band, { lo: 2, hi: 3 });
      const refused = plan({ base: { ...base, system: { ...base.system, budget: 0 } }, rarity: "uncommon", signature: { kind: "gated", text } });
      assert.isFalse(refused.ok, "an Uncommon was allowed a Signature");
      assert.match(refused.reasons.join(" "), /named Rare/, "the refusal does not cite 08 §20");

      const forge = new AzerothForge({ item });
      await forge.render({ force: true });
      await settle();
      try {
        const kind = forge.element.querySelector('select[name="signatureKind"]');
        assert.ok(kind, "the Forge draws no Signature box on a Rare (D-686 relaxed this)");
        kind.value = "gated";
        change(kind);
        await until(() => forge.state?.signatureKind === "gated", "the Signature kind to take");
        await settle();
        const box = forge.element.querySelector('textarea[name="signatureText"]');
        assert.ok(box, "the Forge draws no Signature text box");
        box.value = text;
        change(box);
        await until(() => (forge.state?.signatureText ?? "").includes("Short Rest"), "the Signature text to take");
        await settle();

        const summary = forge.element.querySelector(".azeroth-forge-summary");
        assert.ok(summary, "the Forge prints no summary");
        assert.isNull(summary.querySelector(".azeroth-forge-reasons"),
          `the Forge refuses a Rare's gated Signature: ${summary.textContent.trim()}`);
        assert.isNull(forge.element.querySelector('button[type="submit"]').getAttribute("aria-disabled"),
          "Apply is disabled on a legal proposal");
        assert.include(summary.textContent, "3", "the summary does not print the spend");

        assert.deepEqual(checkNoRawKeys(forge.element), [], "a raw key reached the Forge");
        const findings = checkText(forge.element.querySelector(".window-content"));
        assert.deepEqual(findings, [],
          `the Forge is not legible on a Classic Rare:\n${findings.map(f => `  ${f.kind}: ${f.detail}`).join("\n")}`);
      } finally {
        await forge.close();
      }
    });
  });
}
