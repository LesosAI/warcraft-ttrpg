/**
 * The world map (D-680): the plate is decoded, the ground is shared out, the
 * GM's flip reaches the setting, and the panel prints the chapter's entry.
 *
 * The one thing here that no unit test can reach is **the partition over the
 * real plate**. `map-geometry.test.mjs` proves the algorithm against a
 * nine-pixel picture; only a browser can decode an 828×1640 JPEG, mask its
 * sea and share 700,000 land pixels between thirty seeds. A region holding
 * NONE of the continent is a seed in the water, and that is a fault the eye
 * would have to hunt for.
 */

import { cleanup, settle } from "./fixtures.mjs";
import { checkClipping, checkColumns, checkNotEmpty, checkText, formatFindings } from "./geometry.mjs";
import { MAP_STATE_SETTING } from "../settings.mjs";
import {
  RULES_FOLDER, importRulesJournals, isImportedChapter, worldChapterNamed
} from "../applications/rules-journals.mjs";
import {
  CONTROLS, FIELDS, REGIONS, controlOf, emptyState, isFieldVisible, isOverridden,
  isRegionVisible, isSettlementVisible, noteOf, pinnedSettlements, regionOf,
  settlementLink, tally
} from "../rules/regions.mjs";

/** A region holding less of its continent than this has a seed in the sea. */
const FLOOR = 0.001;
/** One holding more than this has nothing bounding it. */
const CEILING = 0.20;

const fmt = (label, findings) => `${label}:\n${formatFindings(findings)}`;

/** Open the map and wait for the plate to be decoded and painted. */
async function openMap() {
  const { AzerothWorldMap } = await import("../applications/world-map.mjs");
  const app = new AzerothWorldMap();
  await app.render({ force: true });
  await app.ready();
  await settle();
  return app;
}

export function worldMapBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The world map (D-680)", function () {
    let saved = null;

    before(async function () {
      this.timeout(30000);
      // The map's state is a WORLD setting, so a test that writes it writes
      // the world. Put it back exactly as it was.
      saved = game.settings.get("azeroth-rpg", MAP_STATE_SETTING);
      await game.settings.set("azeroth-rpg", MAP_STATE_SETTING, emptyState());
    });

    after(async function () {
      this.timeout(60000);
      for (const app of [...foundry.applications.instances.values()]) {
        if (app.constructor.name === "AzerothWorldMap") await app.close();
      }
      await game.settings.set("azeroth-rpg", MAP_STATE_SETTING, saved ?? emptyState());
      await cleanup();
    });

    /* ---------------------------------------------------------------- */
    /*  The plate                                                        */
    /* ---------------------------------------------------------------- */

    /** How much of a canvas carries any ink at all. */
    function painted(canvas) {
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      let on = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) on++;
      return on / (canvas.width * canvas.height);
    }

    it("decodes both plates and leaves them CLEAN at rest", async function () {
      this.timeout(120000);
      // The lead's call, 2026-09-08: nothing is drawn over the art unless the
      // reader is pointing at it. A partition painted permanently competes
      // with the thing it is drawn on.
      const app = await openMap();
      try {
        for (const continent of ["eastern-kingdoms", "kalimdor"]) {
          await app.apply({ continent, selected: null });
          await app.ready();
          await settle();

          const base = app.element.querySelector(".azeroth-map-base");
          assert.ok(base, `${continent}: no base canvas`);
          assert.isAbove(base.width, 100, `${continent}: the canvas has no size, so the plate did not decode`);
          assert.equal(painted(base), 0, `${continent}: the plate is painted at rest`);
          assert.equal(painted(app.element.querySelector(".azeroth-map-hot")), 0,
            `${continent}: a region is lit with nothing under the cursor`);
          assert.equal(painted(app.element.querySelector(".azeroth-map-accent")), 0,
            `${continent}: a region is lit with nothing selected`);
        }
      } finally {
        await app.close();
      }
    });

    it("lights the selected region and nothing else", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({ continent: "eastern-kingdoms", selected: "tirisfal-glades" });
        await app.ready();
        await settle();
        const accent = app.element.querySelector(".azeroth-map-accent");
        const share = painted(accent);
        // One region of thirty: present, and nowhere near the whole plate.
        assert.isAbove(share, 0.0005, "the selected region was not lit");
        assert.isBelow(share, 0.25, `the lit area is ${(share * 100).toFixed(1)}% of the plate; more than one region is lit`);
        assert.equal(painted(app.element.querySelector(".azeroth-map-base")), 0, "the plate is painted underneath");
      } finally {
        await app.close();
      }
    });

    it("zooms and pans, and comes back to the whole plate", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        const stage = () => app.element.querySelector(".azeroth-map-stage");
        assert.ok(stage(), "no stage to transform");
        const at = () => stage().style.transform;

        app.element.querySelector('[data-action="mapZoomIn"]').click();
        await settle();
        const zoomed = at();
        assert.match(zoomed, /scale\(/, "zooming in wrote no transform");
        assert.notMatch(zoomed, /scale\(1\)/, "zooming in left the scale at one");

        // FIT MEANS THE WHOLE PLATE, not the whole width. The stage is laid
        // out at the frame's width, so a continent twice as tall as it is wide
        // runs off the bottom at scale 1 and the button would be lying.
        app.element.querySelector('[data-action="mapZoomFit"]').click();
        await settle();
        const frame = app.element.querySelector(".azeroth-map-viewport").getBoundingClientRect();
        const shown = stage().getBoundingClientRect();
        assert.isAtMost(Math.round(shown.height), Math.round(frame.height) + 1,
          `fit leaves ${Math.round(shown.height - frame.height)}px of the plate below the frame`);
        assert.isAtMost(Math.round(shown.width), Math.round(frame.width) + 1,
          "fit leaves the plate wider than the frame");

        // The button disables at the floor rather than going quiet.
        assert.isTrue(app.element.querySelector('[data-action="mapZoomOut"]').disabled,
          "zoom out is still offered at the widest view");

        // WIDE CHANGES THE FRAME, and the fit is a ratio against it: a zoom
        // that showed the whole plate a moment ago runs off the bottom the
        // instant the side columns close.
        await app.apply({ wide: true });
        await app.ready();
        await settle();
        const wideFrame = app.element.querySelector(".azeroth-map-viewport").getBoundingClientRect();
        const wideShown = stage().getBoundingClientRect();
        assert.isAtMost(Math.round(wideShown.height), Math.round(wideFrame.height) + 1,
          `going wide left ${Math.round(wideShown.height - wideFrame.height)}px of the plate below the frame`);
        await app.apply({ wide: false });
      } finally {
        await app.close();
      }
    });

    it("gives every region some of its continent", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        const empty = [];
        const huge = [];
        for (const continent of ["eastern-kingdoms", "kalimdor"]) {
          for (const row of await app.shares(continent)) {
            if (row.share < FLOOR) empty.push(`${row.name} holds ${(row.share * 100).toFixed(2)}%`);
            if (row.share > CEILING) huge.push(`${row.name} holds ${(row.share * 100).toFixed(1)}%`);
          }
        }
        assert.deepEqual(empty, [],
          "a region holding none of its continent has its seed in the sea or inside another region "
          + "— drag it in the boundary editor (npm run preview, /tools/map-editor/):\n  " + empty.join("\n  "));
        assert.deepEqual(huge, [],
          "a region holding this much has no neighbours bounding it:\n  " + huge.join("\n  "));
      } finally {
        await app.close();
      }
    });

    it("reads a region off a point on the plate", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        // Every region's own seed must resolve to itself: the seed is the
        // nearest point to itself by construction, so anything else means the
        // mask has removed the ground under it.
        const shapes = (await import("../rules/region-shapes.json", { with: { type: "json" } })).default;
        const wrong = [];
        for (const region of REGIONS.filter(r => r.continent === "eastern-kingdoms")) {
          const [x, y] = shapes.seeds[region.key];
          const canvas = app.element.querySelector(".azeroth-map-base");
          const box = canvas.getBoundingClientRect();
          const event = { clientX: box.left + (x * box.width), clientY: box.top + (y * box.height), currentTarget: canvas };
          const at = await app.regionAtPoint(event);
          if (at !== region.key) wrong.push(`${region.name} -> ${at ?? "(sea)"}`);
        }
        assert.deepEqual(wrong, [], "a region's own seed does not resolve to it:\n  " + wrong.join("\n  "));
      } finally {
        await app.close();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  Control                                                          */
    /* ---------------------------------------------------------------- */

    it("opens on the book's own picture", async function () {
      this.timeout(60000);
      // 10 Alliance, 6 Horde, 33 Neutral, parsed from 12A and 12B.
      assert.deepEqual(tally(emptyState()), { alliance: 10, horde: 6, neutral: 33 });
      assert.equal(controlOf(emptyState(), "tirisfal-glades"), "horde", "Tirisfal is the Forsaken's");
      assert.equal(controlOf(emptyState(), "elwynn-forest"), "alliance", "Elwynn is Stormwind's");
      assert.equal(controlOf(emptyState(), "eastern-plaguelands"), "neutral", "the Scourge is not a coalition");
    });

    it("writes a GM's flip to the world setting, and every open map re-renders", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ control: { key: "westfall", control: "horde" } });
        await settle();

        // Read it back off the SETTING, not off the app: the setting is the
        // whole synchronisation story, and a change that only moved the
        // window would look identical from inside it.
        const stored = game.settings.get("azeroth-rpg", MAP_STATE_SETTING);
        assert.equal(stored.control.westfall, "horde", "the flip did not reach the world setting");
        assert.equal(controlOf(app.world, "westfall"), "horde");
        assert.isTrue(isOverridden(app.world, "westfall"));
        assert.equal(stored.history.at(-1)?.key, "westfall", "the change of hand was not logged");

        // Back to what 12A says: the override is REMOVED rather than stored.
        await app.apply({ control: { key: "westfall", control: "neutral" } });
        const back = game.settings.get("azeroth-rpg", MAP_STATE_SETTING);
        assert.notProperty(back.control, "westfall", "returning to the book's value stored an override");
        assert.equal(controlOf(app.world, "westfall"), "neutral");
      } finally {
        await app.close();
      }
    });

    it("the GM's control buttons are on the panel and each one is registered", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ selected: "duskwood" });
        await settle();
        const buttons = [...app.element.querySelectorAll('[data-action="mapSetControl"]')];
        assert.lengthOf(buttons, CONTROLS.length, "the three control states are not all offered");
        for (const button of buttons) {
          assert.ok(CONTROLS.includes(button.dataset.control), `${button.dataset.control} is not a control state`);
          assert.equal(button.dataset.region, "duskwood");
        }
        // Every action the template names must be in the actions map, or the
        // button looks wired and does nothing (the browser-button rule).
        // Core's own frame actions are not the system's to register — the
        // window controls carry `toggleControls` whatever the template says.
        const CORE = new Set(["close", "tab", "toggleControls", "copyUuid", "configureSheet", "showArtwork", "showImage", "toggleSheet"]);
        const declared = new Set(Object.keys(app.constructor.DEFAULT_OPTIONS.actions));
        const used = new Set([...app.element.querySelectorAll("[data-action]")].map(el => el.dataset.action));
        const unregistered = [...used].filter(a => !declared.has(a) && !CORE.has(a));
        assert.deepEqual(unregistered, [], `the template names actions the map does not register: ${unregistered}`);
      } finally {
        await app.close();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  The entry                                                        */
    /* ---------------------------------------------------------------- */

    it("prints the chapter's own entry for the selected region", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ selected: "tirisfal-glades" });
        await settle();
        const panel = app.element.querySelector(".azeroth-map-panel");
        const text = panel.textContent;

        const region = regionOf("tirisfal-glades");
        assert.include(text, region.name);
        assert.include(text, "Tier 1", "the Threat field is not printed");
        // The chapter's HELD BY sentence verbatim: three control states cannot
        // carry `Contested`, so the sentence is what keeps the nuance.
        assert.include(text, "The Forsaken", "the Held by sentence is not printed");
        assert.include(text, "Scarlet Crusade", "the enclave clause was dropped");
        // D-491's five columns.
        assert.include(text, "The Undercity");
        assert.include(text, "Quartermaster");
        const rows = panel.querySelectorAll(".azeroth-map-settlement");
        assert.lengthOf(rows, region.settlements.length, "the settlements list is short");
      } finally {
        await app.close();
      }
    });

    it("says a region carries no settlement rather than printing an empty table", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        // Tol Barad is one of the seven that say "No settlement." in prose.
        await app.apply({ selected: "tol-barad" });
        await settle();
        const panel = app.element.querySelector(".azeroth-map-panel");
        assert.isNull(panel.querySelector(".azeroth-map-settlements"), "an empty settlements list was drawn");
        assert.include(panel.textContent, "No settlement");
      } finally {
        await app.close();
      }
    });

    it("offers the roads out, and each one selects that region", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ selected: "durotar" });
        await settle();
        const roads = [...app.element.querySelectorAll(".azeroth-map-road")];
        assert.isAbove(roads.length, 0, "Durotar shows no road out");
        const barrens = roads.find(r => r.dataset.region === "the-barrens");
        assert.ok(barrens, "Durotar does not reach the Barrens");
        barrens.click();
        await settle();
        assert.equal(app.state.selected, "the-barrens", "clicking a road did not follow it");
      } finally {
        await app.close();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  The campaign layer                                               */
    /* ---------------------------------------------------------------- */

    it("puts the company on the ground and reads the exposure off it", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ party: "eastern-plaguelands", selected: "eastern-plaguelands" });
        await settle();
        const text = app.element.textContent;
        assert.include(text, "Eastern Plaguelands");
        // 12 §6 grade 2 Undeath -> `tainted` -> DC 15, off EXPOSURE_OCCASIONS.
        assert.include(text, "DC 15", "the exposure DC is not shown");
        assert.match(text, /Undeath/i, "the track is not named");

        await app.apply({ party: null });
        await settle();
        assert.notInclude(app.element.querySelector(".azeroth-map-panel").textContent, "The company",
          "the company panel survived being taken off the map");
      } finally {
        await app.close();
      }
    });

    it("keeps a GM note against a region", async function () {
      this.timeout(90000);
      const app = await openMap();
      try {
        await app.apply({ selected: "duskwood", note: { key: "duskwood", text: "The Night Watch want a word." } });
        await settle();
        assert.equal(noteOf(app.world, "duskwood"), "The Night Watch want a word.");
        const box = app.element.querySelector('.azeroth-map-note[data-region="duskwood"]');
        assert.ok(box, "the note box is not on the panel");
        assert.equal(box.value, "The Night Watch want a word.", "the note did not render back into the box");
      } finally {
        await app.close();
      }
    });

    it("survives a stored state of a shape it has never seen", async function () {
      this.timeout(90000);
      // A setting has no `migrateData` and no document validation to refuse a
      // bad shape, so the read is the only guard there is.
      await game.settings.set("azeroth-rpg", MAP_STATE_SETTING, {
        control: { "no-such-region": "horde", westfall: "pirates" },
        party: "atlantis",
        notes: { nowhere: "x" },
        history: "not an array"
      });
      const app = await openMap();
      try {
        assert.deepEqual(app.world.control, {}, "a bad override was kept");
        assert.isNull(app.world.party, "a party in a region that does not exist was kept");
        assert.deepEqual(app.world.history, [], "a history that is not an array was kept");
        assert.ok(app.element.querySelector(".azeroth-map-base"), "the window did not render");
      } finally {
        await app.close();
        await game.settings.set("azeroth-rpg", MAP_STATE_SETTING, emptyState());
      }
    });

    /* ---------------------------------------------------------------- */
    /*  What a player is allowed to see                                  */
    /* ---------------------------------------------------------------- */

    it("keeps a hidden region out of a player's list and off their plate", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({ continent: "eastern-kingdoms", showRegion: { key: "westfall", shown: false } });
        await settle();

        // The GM still sees all thirty; the switch is theirs to read.
        const rows = () => [...app.element.querySelectorAll(".azeroth-map-row")].map(el => el.dataset.region);
        assert.include(rows(), "westfall", "the GM lost sight of a region they hid");

        // Now look at it the way a player does.
        await app.apply({ preview: true });
        await settle();
        assert.notInclude(rows(), "westfall", "a hidden region is still in a player's list");
        assert.lengthOf(rows(), 29, "exactly one region should be missing");

        await app.apply({ preview: false });
        await settle();
        assert.lengthOf(rows(), 30);
      } finally {
        await app.close();
      }
    });

    it("hides one field and leaves the rest of the entry standing", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({
          selected: "deadwind-pass",
          showField: { key: "deadwind-pass", field: "taint", shown: false },
          preview: true
        });
        await settle();
        const panel = () => app.element.querySelector(".azeroth-map-panel").textContent;
        assert.notInclude(panel(), "Karazhan", "the taint field is still shown to a player");
        assert.include(panel(), "Tier 4", "hiding taint took the Threat field with it");

        await app.apply({ preview: false });
        await settle();
        assert.include(panel(), "Karazhan", "the GM cannot see the field they hid");
      } finally {
        await app.close();
      }
    });

    it("hides who holds a region without hiding the chapter's sentence", async function () {
      this.timeout(120000);
      // 12's `Held by` prose and the live faction state are two disclosures.
      const app = await openMap();
      try {
        await app.apply({
          selected: "tirisfal-glades",
          showField: { key: "tirisfal-glades", field: "control", shown: false },
          preview: true
        });
        await settle();
        const panel = app.element.querySelector(".azeroth-map-panel");
        assert.isNull(panel.querySelector(".azeroth-map-control"), "control is still shown to a player");
        assert.include(panel.textContent, "The Forsaken", "the chapter's sentence went with it");
      } finally {
        await app.close();
      }
    });

    it("keeps EVERY settlement from a player until it is revealed", async function () {
      this.timeout(120000);
      // The lead, 2026-09-08: unlike a region or a field, a settlement never
      // follows `hideByDefault` — it starts hidden and is opened as it is found.
      const app = await openMap();
      try {
        await app.apply({ selected: "tirisfal-glades", preview: true });
        await settle();
        const names = () => [...app.element.querySelectorAll(".azeroth-map-settlement-name")]
          .map(el => el.textContent.trim());
        assert.deepEqual(names(), [], "a player sees settlements nobody revealed");

        await app.apply({ showSettlement: { key: "tirisfal-glades", name: "The Undercity", shown: true } });
        await settle();
        assert.deepEqual(names(), ["The Undercity"], "only the revealed settlement should show");

        // The GM still sees all seven.
        await app.apply({ preview: false });
        await settle();
        assert.lengthOf(names(), 7, "the GM cannot see the settlements they have not revealed");
      } finally {
        await app.apply({ showSettlement: { key: "tirisfal-glades", name: "The Undercity", shown: false } });
        await app.close();
      }
    });

    it("turns the whole map around on one switch", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({ hideByDefault: true, preview: true });
        await settle();
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-row"), 0,
          "a player still sees regions with everything hidden by default");

        await app.apply({ showRegion: { key: "elwynn-forest", shown: true } });
        await settle();
        const rows = [...app.element.querySelectorAll(".azeroth-map-row")].map(el => el.dataset.region);
        assert.deepEqual(rows, ["elwynn-forest"], "only the revealed region should show");
      } finally {
        await app.apply({ hideByDefault: false, preview: false });
        await app.close();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  Marking and linking                                              */
    /* ---------------------------------------------------------------- */

    it("marks a settlement on the plate, and only marked ones appear", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        // 272 settlements would bury the art, so nothing is pinned until placed.
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-pin"), 0);

        await app.apply({
          selected: "tirisfal-glades",
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: [0.31, 0.17] } }
        });
        await settle();
        const pins = [...app.element.querySelectorAll(".azeroth-map-pin")];
        assert.lengthOf(pins, 1, "the marked settlement did not appear on the plate");
        assert.equal(pins[0].dataset.settlement, "Brill");
        assert.equal(settlementLink(app.world, "tirisfal-glades", "Brill").pin[0], 0.31);

        // And it goes when the mark does.
        await app.apply({ settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: null } } });
        await settle();
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-pin"), 0);
      } finally {
        await app.close();
      }
    });

    it("keeps a marked settlement off a player's plate when it is hidden", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: [0.31, 0.17] } },
          preview: true
        });
        await settle();
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-pin"), 0,
          "a marked settlement reaches a player's plate before it is revealed");

        await app.apply({ showSettlement: { key: "tirisfal-glades", name: "Brill", shown: true } });
        await settle();
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-pin"), 1,
          "a revealed settlement is not on the plate");

        await app.apply({ preview: false });
        await settle();
        assert.lengthOf(app.element.querySelectorAll(".azeroth-map-pin"), 1);
      } finally {
        await app.apply({
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: null } },
          showSettlement: { key: "tirisfal-glades", name: "Brill", shown: false }
        });
        await app.close();
      }
    });

    it("keeps a marker the same size on screen at every zoom", async function () {
      this.timeout(120000);
      // Pins sit inside the stage so their position travels with the plate,
      // which also means the zoom scales them: at four times a marker was four
      // times too big and hid the ground it pointed at.
      const app = await openMap();
      try {
        await app.apply({
          selected: "tirisfal-glades",
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: [0.31, 0.17] } }
        });
        await app.ready();
        await settle();
        const pin = () => app.element.querySelector(".azeroth-map-pin");
        assert.ok(pin(), "the marked settlement is not on the plate");
        const before = pin().getBoundingClientRect().height;
        assert.isAbove(before, 4, "the marker has no size at all");

        const zoomIn = app.element.querySelector('[data-action="mapZoomIn"]');
        for (let i = 0; i < 4; i++) zoomIn.click();
        await settle();
        const after = pin().getBoundingClientRect().height;
        assert.closeTo(after, before, 2,
          `the marker is ${after.toFixed(1)}px zoomed in against ${before.toFixed(1)}px out; it scales with the plate`);
      } finally {
        await app.apply({ settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: null } } });
        await app.close();
      }
    });

    it("puts the marker's DOT on the point, not the middle of its label", async function () {
      this.timeout(120000);
      // The pin is a dot and a name side by side, and `translate(-50%)` on the
      // pair centres BOTH on the point — which leaves the dot half a label to
      // the left of the place it marks. It measured 39px out for The
      // Undercity and would be further for a longer name. The vertical half is
      // right, so it reads as a map drawn slightly wrong rather than a bug,
      // and only a measurement against the plate can see it (D-684).
      const app = await openMap();
      const at = [0.31, 0.17];
      try {
        await app.apply({
          selected: "tirisfal-glades",
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: at } }
        });
        await app.ready();
        await settle();

        // BY SETTLEMENT, never `querySelector`. The world may hold other
        // marked settlements, so the first pin in the DOM is not necessarily
        // this one - selecting by position passed on one run and failed on the
        // next against identical code.
        const dot = app.element.querySelector(
          '.azeroth-map-pin[data-settlement="Brill"] .azeroth-map-pin-dot');
        assert.ok(dot, "the marked settlement has no dot on the plate");

        // `.azeroth-map-base` and NOT the stage: the stage is a container and
        // its box is not the plate's — measuring against it put the expected
        // point 257px down the page. The base is the surface the application
        // itself maps a click through, so it is the one reference that cannot
        // disagree with the thing under test.
        const plate = app.element.querySelector(".azeroth-map-base").getBoundingClientRect();
        const mark = dot.getBoundingClientRect();
        assert.isAbove(plate.width, 50, "the plate has no size to measure against");

        const wantX = plate.left + (at[0] * plate.width);
        const wantY = plate.top + (at[1] * plate.height);
        const gotX = mark.left + (mark.width / 2);
        const gotY = mark.top + (mark.height / 2);
        // Say what was seen. An unpositioned pin and a mispositioned one are
        // both "off by N px" and they have completely different causes; three
        // whole Quench runs went by without that being visible.
        const pin = app.element.querySelector('.azeroth-map-pin[data-settlement="Brill"]');
        const seen = `pin left=${pin.style.left || "(none)"} top=${pin.style.top || "(none)"}, `
          + `${app.element.querySelectorAll(".azeroth-map-pin").length} pin(s), `
          + `plate ${plate.width.toFixed(0)}x${plate.height.toFixed(0)} at ${plate.left.toFixed(0)},${plate.top.toFixed(0)}`;
        assert.closeTo(gotX, wantX, 3,
          `the dot is ${(gotX - wantX).toFixed(1)}px off in x; a whole label is about 39px — ${seen}`);
        assert.closeTo(gotY, wantY, 3, `the dot is ${(gotY - wantY).toFixed(1)}px off in y — ${seen}`);
      } finally {
        await app.apply({ settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: null } } });
        await app.close();
      }
    });

    it("puts a marker back where the plate was clicked, at any zoom", async function () {
      this.timeout(120000);
      // The ROUND TRIP, which is the only thing that ties the two halves
      // together: `#placePin` turns a click into normalised coordinates and
      // `#applyView` turns them back into viewport pixels. Each half can be
      // wrong on its own and neither has output a unit test can read. Done at
      // a zoom, because at 1 an error in the pan offset is invisible.
      //
      // **THE ROUND TRIP IS A POINT ON THE PLATE, NOT ON THE SCREEN.** Placing
      // a marker re-renders the panel, which changes the frame's height, which
      // re-pans the plate to keep it in view — so the plate legitimately moves
      // under the cursor between the click and the drawing, and the marker
      // moves with it. Asserting the screen point comes back reported 27px of
      // error against correct behaviour.
      const app = await openMap();
      try {
        await app.apply({ editing: true, selected: "tirisfal-glades" });
        await app.ready();
        await settle();

        const zoomIn = app.element.querySelector('[data-action="mapZoomIn"]');
        zoomIn.click();
        zoomIn.click();
        await settle();

        const mark = app.element.querySelector(
          '[data-action="mapMarkSettlement"][data-settlement="Brill"]');
        assert.ok(mark, "the settlement row offers no way to mark it");
        mark.click();
        await settle();

        // POINTERDOWN THEN POINTERUP, never `click`: the plate acts on
        // pointerup and only when a pointerdown armed it, because a drag that
        // ends as a click would otherwise re-select on every pan (D-682).
        // A bare click event reaches no listener at all.
        const viewport = app.element.querySelector(".azeroth-map-viewport");
        const surface = app.element.querySelector(".azeroth-map-base");
        const frame = viewport.getBoundingClientRect();
        const clientX = frame.left + (frame.width * 0.42);
        const clientY = frame.top + (frame.height * 0.37);

        // What that click MEANS on the plate, measured before it moves.
        const atClick = surface.getBoundingClientRect();
        const wantNx = (clientX - atClick.left) / atClick.width;
        const wantNy = (clientY - atClick.top) / atClick.height;

        const send = type => surface.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX, clientY
        }));
        send("pointerdown");
        send("pointerup");
        await app.ready();
        await settle();

        // Half one: the click became the right point on the plate.
        const stored = settlementLink(app.world, "tirisfal-glades", "Brill").pin;
        assert.ok(stored, "the click did not place the marker");
        assert.closeTo(stored[0], wantNx, 0.005, `the click stored ${stored[0]} across, not ${wantNx.toFixed(4)}`);
        assert.closeTo(stored[1], wantNy, 0.005, `the click stored ${stored[1]} down, not ${wantNy.toFixed(4)}`);

        // Half two: that point is drawn where the plate now has it.
        // RE-QUERY THE SURFACE. The placement re-renders, which replaces the
        // canvas, and the reference taken before it is a detached node whose
        // rect is all zeros — so the expectation came out as 0 rather than as
        // a wrong number, which is at least loud.
        const plate = app.element.querySelector(".azeroth-map-base").getBoundingClientRect();
        const dot = app.element.querySelector(
          '.azeroth-map-pin[data-settlement="Brill"] .azeroth-map-pin-dot');
        assert.ok(dot, "the placed marker is not drawn");
        const drawn = dot.getBoundingClientRect();
        const pin = app.element.querySelector('.azeroth-map-pin[data-settlement="Brill"]');
        const seen = `stored ${JSON.stringify(stored)}, pin left=${pin.style.left || "(none)"} top=${pin.style.top || "(none)"}`;
        assert.closeTo(drawn.left + (drawn.width / 2), plate.left + (stored[0] * plate.width), 3,
          `the marker is not drawn on the point it stored, in x — ${seen}`);
        assert.closeTo(drawn.top + (drawn.height / 2), plate.top + (stored[1] * plate.height), 3,
          `the marker is not drawn on the point it stored, in y — ${seen}`);
      } finally {
        await app.apply({
          editing: false,
          settlement: { key: "tirisfal-glades", name: "Brill", patch: { pin: null } }
        });
        await app.close();
      }
    });

    it("links a region to a Scene and a Journal, and offers them", async function () {
      this.timeout(120000);
      const app = await openMap();
      const scene = await Scene.create({ name: "ZZ Map Link Scene" });
      const journal = await JournalEntry.create({ name: "ZZ Map Link Journal" });
      try {
        await app.apply({
          selected: "duskwood",
          link: { key: "duskwood", patch: { scene: scene.uuid, journal: journal.uuid } }
        });
        await settle();
        const links = [...app.element.querySelectorAll('.azeroth-map-link[data-action="mapOpenLink"]')];
        const uuids = links.map(el => el.dataset.uuid);
        assert.include(uuids, scene.uuid, "the linked Scene is not offered");
        assert.include(uuids, journal.uuid, "the linked Journal is not offered");
        assert.include(app.element.textContent, "ZZ Map Link Scene", "the Scene is not named");
      } finally {
        await app.apply({ link: { key: "duskwood", patch: { scene: null, journal: null } } });
        await scene.delete();
        await journal.delete();
        await app.close();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  The book in the Journals tab                                     */
    /* ---------------------------------------------------------------- */

    it("puts all eighteen chapters into the Journals tab, and does not duplicate them", async function () {
      this.timeout(180000);
      // A compendium shows in the Compendium tab and NOWHERE ELSE, so the
      // whole book was unreachable from the place a reader looks for it.
      const before = game.journal.filter(isImportedChapter).map(j => j.id);
      const first = await importRulesJournals();
      const all = game.journal.filter(isImportedChapter);
      assert.lengthOf(all, 18, `the world holds ${all.length} chapters of 18`);
      assert.equal(first.added.length + first.already.length, 18);

      // 231 pages across them, and every chapter in the Rules folder.
      const pages = all.reduce((n, j) => n + j.pages.size, 0);
      assert.equal(pages, 231, `the chapters carry ${pages} pages of 231`);
      for (const journal of all) assert.equal(journal.folder?.name, RULES_FOLDER, `${journal.name} is loose`);

      // Running it again adds nothing.
      const second = await importRulesJournals();
      assert.deepEqual(second.added, [], "a second import duplicated chapters");
      assert.lengthOf(game.journal.filter(isImportedChapter), 18);

      // The GM's chapters are the GM's (CLAUDE.md SS9).
      const bestiary = worldChapterNamed("14-BESTIARY");
      assert.ok(bestiary, "14-BESTIARY did not import");
      assert.equal(bestiary.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        "a player can open the bestiary");
      const combat = worldChapterNamed("06-COMBAT");
      assert.equal(combat.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
        "a player cannot read the combat chapter");

      // AND A CHAPTER ALREADY HERE IS RE-CLOSED. The import skips a chapter
      // the world holds, so one imported before `GM_ONLY` existed kept
      // OBSERVER forever - which is what the lead's own world was doing, and
      // the assertion above caught it only by that accident. Stale it on
      // purpose, or a clean world passes this test with the bug in place
      // (D-681: ship the assertion that the consumer moved).
      await bestiary.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
      const page = bestiary.pages.contents[0];
      if (page) await page.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
      const third = await importRulesJournals();
      assert.include(third.closed, bestiary.name, "an open bestiary was not closed by the import");
      assert.equal(bestiary.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        "the bestiary stayed open to players");
      if (page) {
        assert.equal(page.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT,
          "a page kept its own ownership and reads past the closed chapter");
      }

      // It only ever CLOSES. A player-facing chapter the GM has deliberately
      // shut stays shut: raising it here would overrule them on a chapter the
      // system has no security interest in.
      await combat.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
      const fourth = await importRulesJournals();
      assert.notInclude(fourth.closed, combat.name, "a player-facing chapter was touched");
      assert.equal(combat.ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        "the import reopened a chapter the GM had shut");
      await combat.update({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });

      // Leave the world as it was found.
      if (!before.length) {
        await JournalEntry.deleteDocuments(all.map(j => j.id));
        const folder = game.folders.find(f => f.type === "JournalEntry" && f.name === RULES_FOLDER);
        if (folder) await folder.delete();
      }
    });

    /* ---------------------------------------------------------------- */
    /*  The sidebar door (the lead, 2026-09-13)                          */
    /* ---------------------------------------------------------------- */

    it("opens from the JOURNALS footer, first, and no longer from Scenes", async function () {
      this.timeout(60000);
      const { MAP_BUTTON_CLASS, addWorldMapButton } = await import("../applications/world-map-button.mjs");
      const { JOURNALS_BUTTON_CLASS, addRulesJournalsButton } = await import("../applications/rules-journals-button.mjs");

      // A DETACHED FOOTER, so the ORDER is asserted without depending on which
      // of the two render hooks core happens to fire first. Both orders are
      // run, because that is exactly what the pair has to survive.
      const footerOf = () => {
        const el = document.createElement("div");
        el.innerHTML = '<footer class="directory-footer"><button class="core-create">Create</button></footer>';
        return el;
      };
      const classes = el => [...el.querySelectorAll("footer.directory-footer > button")]
        .map(b => b.classList[0]);
      const wanted = [MAP_BUTTON_CLASS, JOURNALS_BUTTON_CLASS, "core-create"];

      const mapFirst = footerOf();
      assert.isTrue(addWorldMapButton(mapFirst), "the map button was not added");
      assert.isTrue(addRulesJournalsButton(mapFirst), "the import button was not added");
      assert.deepEqual(classes(mapFirst), wanted, "map first: the footer does not read World map, Import, Create");

      const importFirst = footerOf();
      assert.isTrue(addRulesJournalsButton(importFirst), "the import button was not added");
      assert.isTrue(addWorldMapButton(importFirst), "the map button was not added");
      assert.deepEqual(classes(importFirst), wanted, "import first: the footer does not read World map, Import, Create");

      // A re-render stacks no second copy of either.
      assert.isFalse(addWorldMapButton(mapFirst), "a second render added a second map button");
      assert.isFalse(addRulesJournalsButton(mapFirst), "a second render added a second import button");

      // And the live sidebar, which is what the lead could not find it on.
      await ui.journal.render({ force: true });
      await settle();
      assert.ok(ui.journal.element.querySelector(`.${MAP_BUTTON_CLASS}`),
        "the Journals footer carries no World map button");
      await ui.scenes.render({ force: true });
      await settle();
      assert.isNull(ui.scenes.element.querySelector(`.${MAP_BUTTON_CLASS}`),
        "the World map button is still on the Scenes footer");
    });

    /* ---------------------------------------------------------------- */
    /*  The eye's measurements                                           */
    /* ---------------------------------------------------------------- */

    it("measures clean, on both continents and with a region selected", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        for (const [continent, selected] of [
          ["eastern-kingdoms", "eastern-plaguelands"],
          ["kalimdor", "the-barrens"]
        ]) {
          await app.apply({ continent, selected, party: selected });
          await app.ready();
          await settle();
          const findings = [
            ...checkColumns([app.element.querySelector(".azeroth-map-panel")]),
            ...checkClipping(app.element),
            ...checkNotEmpty([app.element.querySelector(".azeroth-map-list"), app.element.querySelector(".azeroth-map-panel")])
          ];
          assert.deepEqual(findings, [], fmt(`world map (${continent})`, findings));
        }
      } finally {
        await app.close();
      }
    });

    it("the legibility debt on the map is at or below its ceiling", async function () {
      this.timeout(120000);
      const app = await openMap();
      try {
        await app.apply({ selected: "tirisfal-glades", party: "tirisfal-glades" });
        await app.ready();
        await settle();
        const findings = checkText(app.element);
        const byKind = {};
        for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
        const summary = Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(", ");
        console.log(`azeroth-rpg | legibility map: ${findings.length} (${summary || "none"})`);
        // Set from the first run and only ever lowered (D-608).
        assert.isAtMost(findings.length, 0,
          `world map: ${findings.length} legibility findings (${summary})\n` + formatFindings(findings.slice(0, 40)));
      } finally {
        await app.close();
      }
    });
  });
}
