/**
 * Phase 0 batches: the instruments, written to fail on the code they measure.
 *
 * Registered from `quench-tests.mjs`; kept here so that file's 3,000 lines gain
 * four registrations rather than a thousand lines. Every batch here follows the
 * `usable` batch's shape - a rendered app, a control found by `data-action`,
 * the handler asserted registered, the side effect asserted - because the last
 * session's three faults all passed a render test and failed a person.
 *
 * Three batches:
 *   geometry-extended  self-tests for the five checks Phase 0 added, each
 *                      building its fault in a real DOM (the break tests)
 *   sheet-matrix       every surface x every tab x both viewports, through the
 *                      ONE entry point `checkSheet()`, plus the runtime
 *                      `data-action` audit over the same surfaces
 *   drops              forged DragEvents on every drop target the system has
 */

import {
  checkColumns, checkClipping, checkNotEmpty, checkOverflowClip, checkTruncation,
  checkViewport, checkOverlap, checkText, checkSheet, formatFindings
} from "./geometry.mjs";
import { checkNoRawKeys } from "./expectations.mjs";
import { fieldsFor } from "../applications/item-fields.mjs";
// Whose macro may be reused: a GM owns every document, so the predicate is
// what a test can stand on the other side of (the final review, 2026-09-13).
import { macroReusable } from "../rules/macros.mjs";
// A macro press goes through the attack door, which opens the dialog unless
// the client setting says otherwise (CLAUDE.md §15: it is a STRING).
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import {
  made, cleanup, settle, untilHook, fromPack, firstFromPack, makeCharacter, makeNpc,
  makeBoss, itemOf, openSheet, browserOpen, useAction, forgeDrop, cardOf, PACK_FOR
} from "./fixtures.mjs";

/**
 * The legibility debt, per surface, as a ceiling. The lead's type-floor ruling
 * (12px hard, 13px in a row, 1.35 leading, opacity is not a colour) flags the
 * sheets as built; Phase 6 drives every number here to zero. A finding count
 * ABOVE its ceiling is a regression and fails; the message prints the list so
 * the debt is read, not hidden. Set from the first run and only ever lowered.
 */
// character: 3142 measured before Phase 1; 3322 after it. A probe on the
// loaded character histogrammed every small finding by tab and element
// (2026-09-02): none is a Phase 1 control - the whole list is the 12px skill
// column under the 13px row floor, on every tab (D-506), the 10px attribute
// chips and the 10px definition labels. The rise came with the overflow fixes
// making rows measurable that were clipped before. Phase 6 drives it to zero.
// Then re-measured at 2685 once the row buttons took the iron tokens and the
// leading check counted line boxes; npc 295 -> 270 and item 264 -> 175 on the
// Phase 3 lifted the chips, notes, headings, card text and the NPC attack row
// to the floor at their tokens: character 2387, npc 215, card 23 (2026-09-02).
// Phase 4 (2026-09-02): the skill rows at 13px in a fixed five-track grid, the strip,
// the NPC headings in light ink: character 2387 -> 816.
// And the ink where the ground is parchment: character 816 -> 773, npc 215 -> 171.
// Phase 5 (2026-09-02): character 773 -> 699, npc 171 -> 162.
// Phase 6 sweep (2026-09-02): character 699 -> 42, npc 162 -> 20, item 175 -> 0.
// Phase 6 sweep, second pass: npc 20 -> 0, card 23 -> 0.
// Phase 6, the talent tree: character 42 -> 0.
// same run, the item's leading being the same false positive (small: 2601, contrast: 58, leading: 26).
const LEGIBILITY_CEILING = {
  // Measured 2026-09-02, run 6, every state reaching every tab: character
  // 3142 (small 2601, leading 462, contrast 79), npc 295 (leading 51,
  // contrast 52, small 192), item 264 (contrast 97 - light ink on parchment),
  // card 29, browser 0. Phase 6 lowers each to zero. LOWER ONLY.
  character: 0,
  npc: 0,
  item: 0,
  browser: 0,
  card: 0
};

const CORE_ACTIONS = new Set(["close", "tab", "toggleControls", "copyUuid", "configureSheet", "showArtwork", "showImage", "toggleSheet"]);

const fmt = (label, findings) => `${label}:\n${formatFindings(findings)}`;

// ---------------------------------------------------------------------------

export function geometryExtendedBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The Phase 0 checks catch what they are for", function () {
    let scratch;

    before(function () {
      scratch = document.createElement("div");
      scratch.style.cssText = "position:fixed;left:0;top:0;width:400px;background:#e8dcc0;color:#1c1a17;font-size:14px;";
      document.body.appendChild(scratch);
    });
    after(function () { scratch?.remove(); });

    const build = html => { scratch.innerHTML = html; return scratch; };

    it("checkOverflowClip: a leaf past an overflow:hidden ancestor is cut", function () {
      const root = build(`<div style="overflow:hidden;width:100px;height:20px;"><span style="display:inline-block;width:300px;white-space:nowrap">a long line that runs well past the box</span></div>`);
      const f = checkOverflowClip(root);
      assert.isAtLeast(f.length, 1, "the cut leaf was not reported");
      assert.equal(f[0].kind, "cut");
    });

    it("checkOverflowClip: a leaf inside its box passes", function () {
      const root = build(`<div style="overflow:hidden;width:200px;height:40px;"><span>short</span></div>`);
      assert.deepEqual(checkOverflowClip(root), []);
    });

    it("checkOverflowClip: a leaf below a scroller's fold, inside a clipping box, is reachable", function () {
      // The sheet's shape: window-content clips, the skills column scrolls.
      const root = build(`<div style="overflow:hidden;width:200px;height:40px;"><div style="overflow-y:auto;height:40px;"><p>one</p><p>two</p><p>three</p><p>four</p><p>five</p></div></div>`);
      assert.deepEqual(checkOverflowClip(root), [], "a row one scroll away was reported as cut (run 4)");
    });

    it("checkOverflowClip: a leaf past a clipping box with no scroller between is cut", function () {
      const root = build(`<div style="overflow:hidden;width:200px;height:20px;"><div><p>one</p><p>two</p><p>three</p></div></div>`);
      assert.ok(checkOverflowClip(root).some(f => f.kind === "cut"), "the clipped row was not reported");
    });

    it("checkOverflowClip: an absolute child a scroller can never reach has escaped", function () {
      // Above the content start: no amount of scrolling shows it.
      const root = build(`<div style="overflow:auto;position:relative;width:100px;height:40px;"><span>x</span><div style="position:absolute;left:0;top:-30px">out</div></div>`);
      const f = checkOverflowClip(root);
      assert.ok(f.some(x => x.kind === "escaped"), "the escaped absolute child was not reported");
    });

    it("checkOverflowClip: an absolute child below a scroller's fold is one scroll away, not escaped", function () {
      // The full talent tree: every tier arrow past the first screen was
      // reported escaped by a rule that judged against the fold (D-610).
      const root = build(`<div style="overflow:auto;position:relative;width:100px;height:40px;"><div style="height:200px"><div style="position:relative;top:150px;height:20px"><span style="position:absolute;top:-6px;left:50%;height:8px;border-left:2px solid black"></span>row</div></div></div>`);
      const f = checkOverflowClip(root);
      assert.notOk(f.some(x => x.kind === "escaped"), "a reachable absolute child was reported escaped");
    });

    it("checkTruncation: an ellipsis that fired is reported", function () {
      const root = build(`<div style="width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">a name far too long for sixty pixels</div>`);
      const f = checkTruncation(root);
      assert.isAtLeast(f.length, 1);
      assert.equal(f[0].kind, "ellipsis");
    });

    it("checkTruncation: text that fits passes", function () {
      const root = build(`<div style="width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">short</div>`);
      assert.deepEqual(checkTruncation(root), []);
    });

    it("checkViewport: a root past the viewport is offscreen", function () {
      const root = build(`<div style="height:10px">x</div>`);
      const f = checkViewport(root, { width: 100, height: 100 });
      // scratch is 400px wide at left:0, so it runs past a 100px viewport.
      assert.ok(f.some(x => x.kind === "offscreen"), "the offscreen root was not reported");
    });

    it("checkViewport: hidden overflow with more content than height is below the fold", function () {
      const root = build(`<div style="overflow:hidden;height:20px;"><p>one</p><p>two</p><p>three</p><p>four</p></div>`);
      const f = checkViewport(root, { width: 4000, height: 4000 });
      assert.ok(f.some(x => x.kind === "below-fold"), "the fold was not reported");
    });

    it("checkOverlap: two leaves on the same pixels overprint", function () {
      const root = build(`<div style="position:relative;height:40px"><span style="position:absolute;left:0;top:0">first</span><span style="position:absolute;left:4px;top:2px">second</span></div>`);
      const f = checkOverlap(root);
      assert.isAtLeast(f.length, 1);
      assert.equal(f[0].kind, "overlap");
    });

    it("checkOverlap: an ignored chip is the design", function () {
      const root = build(`<div style="position:relative;height:40px"><span style="position:absolute;left:0;top:0">first</span><span class="azeroth-chip" style="position:absolute;left:4px;top:2px">+2</span></div>`);
      assert.deepEqual(checkOverlap(root, { ignore: [".azeroth-chip"] }), []);
    });

    // THE SHEET'S OWN SHAPE SINCE D-734: a scrolling body column, and the tab
    // strip hanging in the band beneath it. `getBoundingClientRect` knows
    // nothing about a clip, so a row below the column's fold keeps a rect on
    // top of a tab label - seven of them across the matrix, against rows
    // nobody can see. What is PAINTED is what can overprint.
    //
    // The scroller is 30px over three 20px rows, so "one" is whole, "two"
    // STRADDLES the fold and "three" is gone; the label sits at 34px, which
    // the raw rects of "two" and "three" both reach and the painted rect of
    // neither does. The straddling row is the case the first cut of this guard
    // missed - it skipped a leaf lying wholly outside its clipper and still
    // reported the loaded character's "No effects in force." on three tabs.
    const SCROLLED = `<div style="position:relative;height:80px">
      <div style="overflow-y:auto;height:30px;line-height:20px;">
        <div>one</div><div>two</div><div>three</div>
      </div>
      <span style="position:absolute;left:0;top:34px;line-height:20px;">tab</span>
    </div>`;

    it("checkOverlap: a row clipped by its column's fold overprints nothing below it", function () {
      const root = build(SCROLLED);
      assert.deepEqual(checkOverlap(root), [],
        "a row the scrolling column cut off was reported overprinting the strip beneath it");
    });

    it("checkOverlap: the same rows with nothing clipping them DO overprint", function () {
      // The positive control: identical markup, `overflow: visible`, so the
      // rows really are drawn over the label and the check must still say so.
      const root = build(SCROLLED.replace("overflow-y:auto", "overflow-y:visible"));
      assert.isAtLeast(checkOverlap(root).length, 1, "a real overprint went unreported");
    });

    it("checkText: 10px text is below the 12px floor", function () {
      const root = build(`<p style="font-size:10px">tiny</p>`);
      const f = checkText(root);
      assert.ok(f.some(x => x.kind === "small"), "10px was not reported");
    });

    it("checkText: 12px body text passes and 12px row text does not", function () {
      const root = build(`<p style="font-size:12px">body</p><ul><li style="font-size:12px">row</li></ul>`);
      const f = checkText(root);
      const small = f.filter(x => x.kind === "small");
      assert.equal(small.length, 1, "expected exactly the row to fail the 13px floor");
      assert.include(small[0].detail, "13px");
    });

    it("checkText: opacity as a dimmer is reported as contrast, with the cause named", function () {
      const root = build(`<p style="font-size:14px;opacity:0.4">dimmed</p>`);
      const f = checkText(root);
      const c = f.find(x => x.kind === "contrast");
      assert.ok(c, "the dimmed text was not reported");
      assert.include(c.detail, "opacity");
    });

    it("checkText: gold on parchment fails and ink on parchment passes", function () {
      const root = build(`<p style="font-size:14px;color:#c9a227">gold</p><p style="font-size:14px;color:#1c1a17">ink</p>`);
      const f = checkText(root).filter(x => x.kind === "contrast");
      assert.equal(f.length, 1);
      assert.include(f[0].detail, '"gold"');
    });

    it("checkText: requireGroundWithin reports a leaf with no ground inside the root", function () {
      // The frame guard (Phase 1): `.application` goes transparent, and
      // without this option the walk climbs past the sheet to core's opaque
      // `body` and every leaf reads clean against a ground the sheet never
      // drew. The SAME leaf over a flat ground inside the root is not a
      // finding, which is the half that says the option is not just noise.
      const outer = build(`
        <div id="az-groundless" style="background:transparent"><p style="font-size:14px;color:#1c1a17">adrift</p></div>
        <div id="az-grounded" style="background:#e8dcc0"><p style="font-size:14px;color:#1c1a17">adrift</p></div>`);
      const groundless = outer.querySelector("#az-groundless");
      const grounded = outer.querySelector("#az-grounded");

      const f = checkText(groundless, { requireGroundWithin: true });
      assert.ok(f.some(x => x.kind === "no-ground"), `the groundless leaf was not reported: ${JSON.stringify(f)}`);
      assert.deepEqual(checkText(grounded, { requireGroundWithin: true }), [],
        "the same leaf over a flat ground was reported");
      // Off by default: the walk reaches the scratch ground and judges colour.
      assert.notOk(checkText(groundless).some(x => x.kind === "no-ground"),
        "no-ground fired with the option off");
    });

    it("checkText: a background-image under text is textured", function () {
      const root = build(`<div style="background-image:linear-gradient(#fff,#eee);background-color:#e8dcc0"><p style="font-size:14px">on texture</p></div>`);
      const f = checkText(root);
      assert.ok(f.some(x => x.kind === "textured"), "the textured ground was not reported");
    });

    it("checkText: a tall single-line button is not 'wrapped'", function () {
      const root = build(`<button style="font-size:13px;line-height:1.2;min-height:40px;padding:1px 6px">&times;</button>`);
      const f = checkText(root);
      assert.notOk(f.some(x => x.kind === "leading"), `a one-glyph button was reported as wrapped: ${JSON.stringify(f)}`);
    });

    it("checkText: an inline child on the same line does not count as a second line", function () {
      const root = build(`<p style="font-size:14px;line-height:1.1;width:400px"><b>one</b> line</p>`);
      const f = checkText(root);
      assert.notOk(f.some(x => x.kind === "leading"), "a bold fragment on the same line counted as a wrap");
    });

    it("checkText: wrapped text at 1.1 leading is reported", function () {
      const root = build(`<p style="font-size:14px;line-height:1.1;width:60px">enough words to wrap onto several lines here</p>`);
      const f = checkText(root);
      assert.ok(f.some(x => x.kind === "leading"), "the tight leading was not reported");
    });

    it("checkSheet: expectColumns reports a track count that is wrong", function () {
      const root = build(`<div class="window-content"><div style="width:100px;height:10px">a</div><div style="width:100px;height:10px">b</div></div>`);
      const f = checkSheet(root, { expectColumns: 3, text: false, panels: ".nothing" });
      assert.ok(f.some(x => x.kind === "count"), "the wrong column count was not reported");
    });
  });
}

// ---------------------------------------------------------------------------

/** Several documents from a pack, by predicate, for the loaded fixtures. */
async function manyFromPack(packId, n, predicate = () => true) {
  const pack = game.packs.get(packId);
  const docs = await pack.getDocuments();
  return docs.filter(predicate).slice(0, n).map(d => d.name);
}

/** Measure a sheet on every tab it has, both viewports, through checkSheet(). */
async function measureSheet(assert, sheet, { label, expectColumns, wideColumns, wideTabs = [], text }) {
  // The rendered nav, not the static map: Spells is drawn only where there
  // is a spell to show (D-639), and a tab the nav lacks measures nothing.
  const drawn = [...(sheet.element?.querySelectorAll("nav.tabs [data-tab]") ?? [])].map(a => a.dataset.tab);
  const tabs = drawn.length ? drawn : (sheet.constructor.TABS?.primary?.tabs?.map(t => t.id) ?? [null]);
  const legibility = [];
  for (const tab of tabs) {
    if (tab) sheet.changeTab(tab, "primary");
    await settle();
    const wide = wideTabs.includes(tab);
    const findings = checkSheet(sheet.element, {
      expectColumns: wide ? wideColumns : expectColumns,
      text: false
    });
    assert.deepEqual(findings, [], fmt(`${label}, tab "${tab}"`, findings));
    // No raw key, no "undefined", on any tab.
    const raw = checkNoRawKeys(sheet.element);
    assert.deepEqual(raw, [], fmt(`${label}, tab "${tab}"`, raw));
    legibility.push(...checkText(sheet.element, text).map(f => ({ ...f, detail: `[${tab}] ${f.detail}` })));
  }
  // The 1366x768 floor: the window must not run off it.
  const pos = { ...sheet.position };
  // Left AND top: an 860px sheet centred on a 1920 screen sits at x=530, and
  // measuring that against a 1366 box reported it offscreen (run 2).
  await sheet.setPosition({ height: 700, top: 0, left: 0 });
  await settle();
  const vp = checkViewport(sheet.element, { width: 1366, height: 768 }).filter(f => f.kind === "offscreen");
  assert.deepEqual(vp, [], fmt(`${label} at the 768 floor`, vp));
  await sheet.setPosition(pos);
  return legibility;
}

/** Every [data-action] on a rendered app has a registered handler or is core's. */
function assertActionsRegistered(assert, app, label) {
  const faults = [];
  for (const el of app.element.querySelectorAll("[data-action]")) {
    const action = el.dataset.action;
    if (CORE_ACTIONS.has(action)) continue;
    if (typeof app.options?.actions?.[action] !== "function") {
      faults.push(`${label}: <${el.tagName.toLowerCase()} data-action="${action}"> has no registered handler`);
    }
  }
  assert.deepEqual(faults, [], faults.join("\n"));
}

export function sheetMatrixBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Sheet matrix: every surface, every tab, measured", function () {
    const debt = {};
    const record = (surface, findings) => (debt[surface] ??= []).push(...findings);

    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    // ---- character states ------------------------------------------------
    const CHARACTERS = {
      empty: () => makeCharacter({ name: "ZZ Matrix Empty" }),
      "level 1": () => makeCharacter({ name: "ZZ Matrix L1", classes: [["Warrior", 1]], race: "Orc" }),
      "level 11": async () => makeCharacter({
        name: "ZZ Matrix L11", classes: [["Warrior", 11]], race: "Dwarf", career: "Warden of the March",
        weapons: await manyFromPack(PACK_FOR.weapon, 3), armor: await manyFromPack(PACK_FOR.armor, 2),
        gear: await manyFromPack(PACK_FOR.gear, 4),
        talents: await manyFromPack(PACK_FOR.talent, 5, d => d.system.className === "Warrior" && d.system.branch === "Arms"),
        xp: { earned: 2400, spent: 1100 }, skillRanks: { athletics: 6, warfare: 4, perception: 3 }
      }),
      "two-class": () => makeCharacter({ name: "ZZ Matrix Mage/Rogue", classes: [["Mage", 9], ["Rogue", 5]], race: "Gnome" }),
      "two Momentum": () => makeCharacter({ name: "ZZ Matrix Warrior/Rogue", classes: [["Warrior", 9], ["Rogue", 5]], race: "Troll" }),
      loaded: async () => makeCharacter({
        name: "ZZ Matrix Loaded", classes: [["Mage", 15], ["Priest", 5]], race: "Human", career: "Constable",
        // **THE BAGS GO ON FIRST** (08 §11, D-736). Six weapons at nine bag
        // slots, a 40 lb suit at four and twenty pieces of gear at twenty is
        // thirty-three against a base of sixteen, so seventeen of the embeds
        // were REFUSED - silently, because a refused create is spliced out of
        // the batch (D-737). Four containers add twenty wells and the whole
        // fixture fits; without them this surface measured a character the
        // test had not asked for.
        bags: ["Backpack", "Sack", "Satchel", "Belt pouch"],
        weapons: await manyFromPack(PACK_FOR.weapon, 6), armor: await manyFromPack(PACK_FOR.armor, 1),
        gear: await manyFromPack(PACK_FOR.gear, 20), spells: await manyFromPack(PACK_FOR.spell, 30),
        corruption: { fel: 16, void: 11, undeath: 6 }, conditions: ["fatigued", "bleeding", "poisoned", "prone"],
        xp: { earned: 4000, spent: 3900 }
      })
    };

    for (const [state, build] of Object.entries(CHARACTERS)) {
      it(`character (${state}) measures clean on every tab`, async function () {
        this.timeout(90000);
        const actor = await build();
        const sheet = await openSheet(actor);
        try {
          assertActionsRegistered(assert, sheet, `character (${state})`);
          const wide = sheet.constructor.WIDE_TABS ?? [];
          record("character", await measureSheet(assert, sheet, {
            label: `character (${state})`, expectColumns: 5, wideColumns: 4, wideTabs: wide,
            // THE CHARACTER SHEET AND NOWHERE ELSE. Phase 1 makes
            // `.application` transparent and hangs the tabs off the frame,
            // so every leaf here must find a ground this sheet painted -
            // otherwise the walk climbs to core's `body` and a region that
            // stopped painting reads clean. The NPC and item sheets keep
            // core's chrome and are judged as they were.
            text: { requireGroundWithin: true }
          }));
        } finally {
          await sheet.close();
        }
      });
    }

    it("character (level 11) talent tree open measures clean", async function () {
      this.timeout(60000);
      const actor = await CHARACTERS["level 11"]();
      const sheet = await openSheet(actor);
      try {
        sheet.changeTab("progress", "primary");
        await settle();
        const { el, registered } = useAction(sheet, "openBranch");
        assert.ok(el, "no branch to open on the Progress tab");
        assert.ok(registered, "openBranch is not registered");
        el.click();
        // The click re-renders the part; wait for the tree it draws.
        for (let i = 0; i < 100 && !sheet.element.querySelector("section[data-tab='progress'] .azeroth-tree-field"); i++) {
          await new Promise(r => setTimeout(r, 50));
        }
        await settle();
        const tree = sheet.element.querySelector(".azeroth-talent-tree, .azeroth-tree, [data-branch]");
        assert.ok(tree, "opening a branch drew no tree");
        const findings = checkSheet(sheet.element, { expectColumns: 4, text: false });
        assert.deepEqual(findings, [], fmt("talent tree open", findings));
        // THE CHARACTER SHEET PAINTS ITS OWN GROUNDS (D-734): a leaf that finds
        // none inside the sheet is a finding, not a pass against core's body.
        record("character", checkText(sheet.element, { requireGroundWithin: true }));

        // AND WITH A CARD OPEN (O-115, D-758). The card is `display: none`
        // until a tile is hovered or focused, and a collapsed box is skipped,
        // so this surface carried no measurement at all until a pass opened
        // one: a tree socket's card, and a racial tile's.
        const progress = sheet.element.querySelector("section[data-tab='progress']");
        for (const scope of [".azeroth-tree", ".azeroth-racial-row"]) {
          const socket = progress.querySelector(`${scope} .azeroth-talent-socket`);
          assert.ok(socket, `no socket in ${scope}`);
          socket.focus();
          await settle();
          const card = socket.closest(".azeroth-talent").querySelector(".azeroth-talent-card");
          assert.equal(getComputedStyle(card).display, "block", `focus opened no card in ${scope}`);
          record("character", checkText(card, { requireGroundWithin: true }));
          socket.blur();
          await settle();
        }
      } finally {
        await sheet.close();
      }
    });

    // ---- NPC states ---------------------------------------------------------
    const NPCS = {
      standard: () => makeNpc("Plagued Ghoul"),
      boss: () => makeBoss(),
      // A caster, so the Spells tab is measured at all (D-705): `measureSheet`
      // walks the RENDERED nav, and the tab is drawn only where the block
      // casts. Whitemane carries both a Spell DC and a Power.
      caster: () => makeNpc("High Inquisitor Whitemane"),
      mindless: async () => {
        const pack = game.packs.get("azeroth-rpg.bestiary");
        const docs = await pack.getDocuments();
        const m = docs.find(d => d.system?.abilities?.int?.value === null);
        if (!m) throw new Error("no Mindless creature in the bestiary");
        return makeNpc(m.name);
      }
    };
    for (const [state, build] of Object.entries(NPCS)) {
      it(`NPC (${state}) measures clean on every tab`, async function () {
        this.timeout(60000);
        const actor = await build();
        const sheet = await openSheet(actor);
        try {
          assertActionsRegistered(assert, sheet, `NPC (${state})`);
          record("npc", await measureSheet(assert, sheet, { label: `NPC (${state})`, expectColumns: 4, wideColumns: 4 }));
          if (state === "mindless") {
            const absent = sheet.element.querySelector('.azeroth-plate[data-ability="int"]');
            assert.ok(absent, "no Int plate");
            assert.notOk(absent.dataset.action, "an absent plate carries an action - clicking it is a silent no-op");
            assert.include(absent.textContent, "—", "an absent plate must read an em-dash");
          }
        } finally {
          await sheet.close();
        }
      });
    }

    // ---- item sheets, every subtype, owned and unowned -----------------------
    it("every Item subtype measures clean, owned and unowned", async function () {
      this.timeout(120000);
      const owner = await makeCharacter({ name: "ZZ Matrix Item Owner", classes: [["Mage", 5]] });
      for (const type of Object.keys(game.system.documentTypes.Item)) {
        for (const owned of [false, true]) {
          const item = await itemOf(type, { owned: owned ? owner : null });
          const sheet = await openSheet(item);
          try {
            const label = `item ${type} (${owned ? "owned" : "unowned"})`;
            assertActionsRegistered(assert, sheet, label);
            const findings = checkSheet(sheet.element, { text: false, panels: ".azeroth-item__fields, .window-content" });
            assert.deepEqual(findings, [], fmt(label, findings));
            const raw = checkNoRawKeys(sheet.element);
            assert.deepEqual(raw, [], fmt(label, raw));
            record("item", checkText(sheet.element));
          } finally {
            await sheet.close();
          }
        }
      }
    });

    // ---- the browser, every category -------------------------------------------
    it("the compendium browser measures clean on every category", async function () {
      this.timeout(180000);
      for (const category of Object.keys(game.system.azeroth.CATEGORIES)) {
        const browser = await browserOpen(category);
        try {
          assertActionsRegistered(assert, browser, `browser (${category})`);
          const findings = checkSheet(browser.element, { text: false, panels: ".azeroth-browser-category.active, .window-content", columns: ".window-content > *" });
          assert.deepEqual(findings, [], fmt(`browser (${category})`, findings));
          record("browser", checkText(browser.element));
        } finally {
          await browser.close();
        }
      }
    });

    // ---- the four cards, in the log ----------------------------------------------
    it("every chat card measures clean where it lives", async function () {
      this.timeout(60000);
      const actor = await makeCharacter({ name: "ZZ Matrix Caster", classes: [["Mage", 5]], spells: await manyFromPack(PACK_FOR.spell, 1, d => d.system.school === "fire" && d.system.tier === 1) });
      ui.sidebar?.changeTab?.("chat", "primary");
      for (const kind of ["skill", "attack", "spell", "corruption", "critical"]) {
        const { message, element } = await cardOf(kind, actor);
        assert.ok(message, `${kind}: no message was posted`);
        assert.ok(element, `${kind}: the card did not render in #chat-log`);
        const w = element.getBoundingClientRect().width;
        assert.isAtMost(w, 302, `${kind} card is ${w}px wide; D11 SS5 says 300`);
        const findings = [
          ...checkColumns([element]), ...checkClipping(element), ...checkOverflowClip(element),
          ...checkTruncation(element), ...checkNotEmpty([...element.querySelectorAll(".azeroth-card-body, .azeroth-provenance")])
        ];
        assert.deepEqual(findings, [], fmt(`${kind} card`, findings));
        assert.deepEqual(checkNoRawKeys(element), [], `${kind} card carries a raw key`);
        record("card", checkText(element));
      }
    });

    // ---- the legibility debt, as a ceiling that only lowers -----------------------
    for (const surface of Object.keys(LEGIBILITY_CEILING)) {
      it(`legibility debt on ${surface} sheets is at or below its ceiling`, function () {
        const findings = debt[surface] ?? [];
        const byKind = {};
        for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
        const summary = Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(", ");
        assert.isAtMost(findings.length, LEGIBILITY_CEILING[surface],
          `${surface}: ${findings.length} legibility findings (${summary}) against a ceiling of ${LEGIBILITY_CEILING[surface]}\n`
          + formatFindings(findings.slice(0, 40)) + (findings.length > 40 ? `\n  ... and ${findings.length - 40} more` : ""));
        console.log(`azeroth-rpg | legibility ${surface}: ${findings.length} (${summary || "none"})`);
      });
    }
  });
}

// ---------------------------------------------------------------------------

export function dropsBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("Drops: every target, through a real DragEvent", function () {
    let actor, sheet;

    before(async function () {
      this.timeout(30000);
      // A compendium Actor dropped on the canvas is IMPORTED into the world,
      // and the first two runs left one behind each time. One of those leaked
      // ghouls is how the 0.2.0 migration's NPC bug was found. Sweep any
      // earlier leak, then track this run's import below.
      const leaked = game.actors.filter(a => a.name === "Plagued Ghoul" && !a.folder);
      if (leaked.length) await Actor.deleteDocuments(leaked.map(a => a.id));
      actor = await makeCharacter({ name: "ZZ Drop Target" });
      sheet = await openSheet(actor);
    });

    after(async function () {
      this.timeout(60000);
      await sheet?.close();
      await cleanup();
    });

    it("a career dropped on the sheet becomes THE career", async function () {
      this.timeout(20000);
      const career = await fromPack(PACK_FOR.career, "Watchman");
      const wait = untilHook("createItem", 5000, item => item.parent?.id === actor.id);
      forgeDrop(sheet.element, { type: "Item", uuid: career.uuid });
      const [item] = await wait;
      await settle();
      assert.equal(item.type, "career");
      assert.equal(actor.system.career?.itemId, item.id, "the dropped career was not linked as system.career");
    });

    it("a class dropped on the sheet writes system.classes[]", async function () {
      this.timeout(20000);
      const cls = await fromPack(PACK_FOR.class, "Warrior");
      // Subscribe to BOTH before the drop: the link update can land before a
      // listener registered after the create resolves would ever see it.
      const wait = untilHook("createItem", 5000, item => item.parent?.id === actor.id);
      const linked = untilHook("updateActor", 5000, a => a.id === actor.id).catch(() => null);
      forgeDrop(sheet.element, { type: "Item", uuid: cls.uuid });
      const [item] = await wait;
      await linked;
      await settle();
      assert.equal(item.type, "class");
      assert.equal(actor.system.classes?.[0]?.itemId, item.id,
        "the dropped class was not linked - system.classes[] is empty, so level, pools, schools and spell DC stay at their defaults");
      assert.isAbove(actor.system.momentum?.max ?? actor.system.momenta?.[0]?.max ?? 0, 0,
        "a linked Warrior should give the character a Rage pool");
      // The class names its branches (0.6.0) and brings its talents: every
      // talent in the pack whose className is the class, after the link.
      assert.deepEqual(item.system.branches.map(b => b.name), ["Arms", "Fury", "Bulwark"],
        "the class's branches lost their names - the 0.6.0 schema or migration");
      for (let i = 0; i < 100 && actor.items.filter(t => t.type === "talent").length < 36; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      const talents = actor.items.filter(t => t.type === "talent");
      assert.lengthOf(talents, 36, "a dropped class did not bring its thirty-six talents");
      assert.isTrue(talents.every(t => t.system.className === "Warrior" && t.system.taken === 0));
    });

    it("a second race replaces the first rather than sitting beside it", async function () {
      this.timeout(20000);
      const orc = await fromPack(PACK_FOR.race, "Orc");
      const tauren = await fromPack(PACK_FOR.race, "Tauren");
      let wait = untilHook("createItem", 5000, i => i.parent?.id === actor.id);
      forgeDrop(sheet.element, { type: "Item", uuid: orc.uuid });
      await wait;
      wait = untilHook("createItem", 5000, i => i.parent?.id === actor.id);
      forgeDrop(sheet.element, { type: "Item", uuid: tauren.uuid });
      await wait;
      await new Promise(r => setTimeout(r, 300));
      const races = actor.items.filter(i => i.type === "race");
      assert.equal(races.length, 1, "two races on one character - the second should replace the first");
      assert.equal(races[0].name, "Tauren");
    });

    it("a browser row dropped on the hotbar assigns a macro to the slot", async function () {
      this.timeout(20000);
      const weapon = await fromPack(PACK_FOR.weapon, "Amani hatchet");
      const slot = ui.hotbar.element.querySelector('.slot[data-slot="10"]') ?? ui.hotbar.element.querySelector(".slot:last-of-type");
      assert.ok(slot, "no hotbar slot to drop on");
      const before = game.user.getHotbarMacros().find(m => m.slot === Number(slot.dataset.slot))?.macro?.id ?? null;
      const wait = untilHook("createMacro", 5000).catch(() => null);
      forgeDrop(slot, { type: "Item", uuid: weapon.uuid });
      const created = await wait;
      await settle();
      const now = game.user.getHotbarMacros().find(m => m.slot === Number(slot.dataset.slot))?.macro;
      assert.ok(now, "the slot got no macro");
      assert.notEqual(now.id, before, "the slot did not change");
      if (created) made.push(created[0]);
      await game.user.assignHotbarMacro(null, Number(slot.dataset.slot));
    });

    /* ---------------------------------------------------------------- */
    /*  A macro that SWINGS the thing (the lead, 2026-09-13)             */
    /* ---------------------------------------------------------------- */

    it("an OWNED row saved to the hotbar makes a macro that presses it, once, in the first free slot", async function () {
      this.timeout(60000);
      // *"There is no way to make macros for skills/spells/attacks."* Core's
      // own hotbarDrop makes a macro that OPENS the item's sheet, and the
      // system had no macro code at all.
      const sword = await fromPack(PACK_FOR.weapon, "Longsword");
      const [held] = await actor.createEmbeddedDocuments("Item", [sword.toObject()]);
      const macros = game.system.azeroth.macros;

      // Empty page 1 first, and put back whatever was there in the finally.
      const before = game.user.getHotbarMacros(1).map(e => ({ slot: e.slot, id: e.macro?.id ?? null }));
      const mine = [];
      try {
        for (const entry of before) if (entry.id) await game.user.assignHotbarMacro(null, entry.slot);

        const macro = await macros.saveToHotbar(held, { actor });
        assert.ok(macro, "saveToHotbar made nothing");
        mine.push(macro);
        assert.equal(macro.name, held.name, "the macro is not named for the item");
        assert.equal(macro.img, held.img, "the macro does not wear the item's icon");
        assert.equal(macro.type, "script");
        assert.include(macro.command, "game.system.azeroth.macros.useItem",
          `the macro does not press the item: ${macro.command}`);
        assert.equal(game.user.getHotbarMacros(1)[0].macro?.id, macro.id, "the macro is not in the first free slot");

        // PRESSED, with the token controlled: the sheet's own attack door.
        const scene = await Scene.create({ name: "ZZ Macro Scene", width: 1000, height: 1000, grid: { size: 100 } });
        made.push(scene);
        await scene.view();
        await settle();
        const [placed] = await scene.createEmbeddedDocuments("Token", [{
          name: actor.name, actorId: actor.id, actorLink: true, x: 200, y: 200
        }]);
        canvas.tokens.get(placed.id)?.control({ releaseOthers: true });
        const messages = game.messages.size;
        const priorSetting = game.settings.get("azeroth-rpg", ROLL_DIALOG_SETTING);
        await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, "skip");
        try {
          await macros.useItem({ kind: "attack", itemId: held.id, itemName: held.name, actorUuid: actor.uuid });
          await settle();
          assert.isAbove(game.messages.size, messages, "pressing the macro posted no card");
          const card = game.messages.contents.at(-1);
          assert.include(card.content + card.flavor, held.name, "the card is not the weapon's");
          await card.delete();
        } finally {
          await game.settings.set("azeroth-rpg", ROLL_DIALOG_SETTING, priorSetting);
        }

        // SAVED TWICE IS ONE MACRO. Dragging the row again, or pressing the
        // menu entry again, must not fill the directory with copies.
        const count = game.macros.size;
        const again = await macros.saveToHotbar(held, { actor });
        assert.equal(again.id, macro.id, "a second save made a second macro");
        assert.equal(game.macros.size, count, "a second save created a document");

        // **AND NOT SOMEBODY ELSE'S MACRO.** The search was over all of
        // `game.macros` by the flag alone, so a second player saving the same
        // weapon found the FIRST player's and got a slot holding a button that
        // refuses to run (core's default ownership is NONE). The predicate is
        // asserted rather than the search, because a GM owns every document
        // in the world and cannot sit on the other side of this from here.
        const flag = macro.getFlag("azeroth-rpg", "macro");
        assert.isTrue(macroReusable({ flag, isOwner: true }, { itemId: held.id, kind: "attack" }),
          "the user's own macro is no longer reused");
        assert.isFalse(macroReusable({ flag, isOwner: false }, { itemId: held.id, kind: "attack" }),
          "a macro this user cannot execute would still be reused");

        // **THE DROP ITSELF IS INTERCEPTED.** Core's own `hotbarDrop` path
        // makes a macro that TOGGLES the item's sheet; `registerHotbarDrop`
        // returns false to stop it, and nothing asserted that until now - the
        // browser-row test above drops a COMPENDIUM item, which falls through
        // to core on purpose.
        await game.user.assignHotbarMacro(null, 2);
        assert.isFalse(Hooks.call("hotbarDrop", ui.hotbar, { type: "Item", uuid: held.uuid }, "2"),
          "the drop was not intercepted: core made its own sheet-toggle macro");
        for (let i = 0; i < 100 && game.user.getHotbarMacros(1).find(e => e.slot === 2)?.macro?.id !== macro.id; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
        assert.equal(game.user.getHotbarMacros(1).find(e => e.slot === 2)?.macro?.id, macro.id,
          "the intercepted drop put no macro in the slot it landed on");
        assert.equal(game.macros.size, count, "the drop made a second macro for the same row");
        await game.user.assignHotbarMacro(null, 2);

        // AND THE ROW ITSELF IS DRAGGABLE, which is what reaches the hotbar.
        sheet.changeTab("combat", "primary");
        await settle();
        const row = sheet.element.querySelector(`section[data-tab="combat"] .azeroth-weapon[data-item-id="${held.id}"]`);
        assert.ok(row, "the Combat tab draws no row for the weapon");
        assert.ok(row.classList.contains("draggable"), "a weapon row cannot be dragged to the hotbar");

        // A FULL PAGE says so rather than overwriting slot 1.
        for (let i = 1; i <= 10; i++) await game.user.assignHotbarMacro(macro, i);
        const warned = [];
        const original = ui.notifications.warn;
        ui.notifications.warn = function (m, ...rest) { warned.push(String(m)); return original.call(this, m, ...rest); };
        try {
          const refused = await macros.saveToHotbar(held, { actor });
          // The macro already exists, so the refusal is about the PAGE.
          assert.isNull(refused, "a full page still assigned a slot");
          assert.lengthOf(warned, 1, "a full page said nothing");
          assert.equal(warned[0], game.i18n.localize("AZEROTH.Macro.PageFull"));
        } finally {
          ui.notifications.warn = original;
        }
      } finally {
        for (let i = 1; i <= 10; i++) await game.user.assignHotbarMacro(null, i);
        for (const m of mine) await m.delete().catch(() => {});
        for (const entry of before) {
          const doc = entry.id ? game.macros.get(entry.id) : null;
          if (doc) await game.user.assignHotbarMacro(doc, entry.slot);
        }
        await held.delete().catch(() => {});
      }
    });

    it("a bestiary row dropped on the canvas becomes a token", async function () {
      this.timeout(30000);
      const scene = await Scene.create({ name: "ZZ Drop Scene", width: 1000, height: 1000, grid: { size: 100 } });
      made.push(scene);
      await scene.view();
      await settle();
      const ghoul = await fromPack("azeroth-rpg.bestiary", "Plagued Ghoul");
      const rect = canvas.app.view.getBoundingClientRect();
      const wait = untilHook("createToken", 8000, t => t.parent?.id === scene.id);
      forgeDrop(canvas.app.view, { type: "Actor", uuid: ghoul.uuid },
        { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
      const [token] = await wait;
      assert.ok(token, "no token was created");
      assert.equal(token.actor?.name, "Plagued Ghoul");
      // The drop imported a world actor; it is ours to delete.
      if (token.actor && !token.actor.isToken) made.push(token.actor);
    });

    it("an Item dropped on an item sheet is a no-op, not a throw", async function () {
      this.timeout(20000);
      const item = await itemOf("weapon");
      const isheet = await openSheet(item);
      try {
        const spell = await fromPack(PACK_FOR.spell, "Shadow Ward");
        let created = false;
        const id = Hooks.on("createItem", () => { created = true; });
        forgeDrop(isheet.element, { type: "Item", uuid: spell.uuid });
        await new Promise(r => setTimeout(r, 800));
        Hooks.off("createItem", id);
        assert.notOk(created, "an item sheet accepted an Item drop - core accepts only ActiveEffect there");
      } finally {
        await isheet.close();
      }
    });
  });
}

// ---------------------------------------------------------------------------

/**
 * The item sheet, every subtype, AS A USE. The old batch had three tests for
 * twelve subtypes and asserted the name rendered; this asserts the field list
 * is `fieldsFor`'s in order, edits a field through the form and reads it back
 * off the document, clicks the description toggle, and checks Cast is offered
 * on an owned spell and nothing else.
 */
export function itemSubtypesBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Item sheet: every subtype, as a use", function () {
    let owner;

    after(async function () {
      this.timeout(60000);
      await cleanup();
    });

    for (const type of Object.keys(game.system.documentTypes.Item)) {
      it(`${type}: draws fieldsFor's fields in order, edits one, toggles the prose`, async function () {
        this.timeout(30000);
        owner ??= await makeCharacter({ name: "ZZ Subtype Owner", classes: [["Mage", 5]] });
        const item = await itemOf(type, { owned: owner });
        const sheet = await openSheet(item);
        try {
          // The reader's own flags, because a descriptor may be LOCKED for one
          // (a talent's `taken`, D-713): the batch runs as the GM, so nothing
          // locks here, and passing them is what keeps that true by accident
          // rather than by omission.
          const reader = { owned: Boolean(item.actor), isGM: game.user.isGM };
          const expected = fieldsFor(item.type, item.system, { editable: sheet.isEditable, ...reader })
            .map(f => game.i18n.localize(f.label));
          const drawn = [...sheet.element.querySelectorAll(".azeroth-item__field dt")]
            .map(d => d.textContent.trim());
          assert.deepEqual(drawn, expected, `${type}: the sheet drew a different field list than fieldsFor`);
          assert.deepEqual(checkNoRawKeys(sheet.element), [], `${type}: a raw key or "undefined" reached the page`);

          // An editable sheet has a control for EVERY field that is not a
          // table: the sheet drew text for all of them once (screenshot 5).
          if (sheet.isEditable) {
            const missing = fieldsFor(item.type, item.system, { editable: true, ...reader })
              .filter(f => f.type !== "table")
              // A field this reader may not write draws as text on purpose.
              .filter(f => !f.readOnly)
              // A derived figure is the model's and is drawn as text (D-667).
              .filter(f => f.type !== "derived")
              .filter(f => !sheet.element.querySelector(
                // A tag drawn from an enum is picked from a select, never typed (D-641).
                f.type === "tags"
                  ? `.azeroth-item__tags[data-path="system.${f.path}"] ~ .azeroth-item__tag-add :is(input, select)`
                  : `[name="system.${f.path}"]`))
              .map(f => f.path);
            assert.deepEqual(missing, [], `${type}: no control for ${missing.join(", ")} on an editable sheet`);
          }

          // Edit through the form, the way a person does, and read it back. A
          // number first, moved within its own min/max (a tier-4 career at 5
          // fails validation and writes nothing); a text field only where no
          // number exists, since some texts are choice-backed on the model.
          const input = sheet.element.querySelector('.azeroth-item__field input[type="number"][name]')
            ?? sheet.element.querySelector('.azeroth-item__field input[type="text"][name]');
          if (input && input.name) {
            const path = input.name;
            const before = foundry.utils.getProperty(item, path);
            let next;
            if (input.type === "number") {
              const current = Number(before) || 0;
              // The template carries no bounds; the model's own field does.
              const field = item.system.schema?.getField?.(path.replace(/^system\./, ""));
              const max = typeof field?.max === "number" ? field.max : Infinity;
              const min = typeof field?.min === "number" ? field.min : -Infinity;
              next = String(current + 1 <= max ? current + 1 : Math.max(min, current - 1));
            } else {
              next = `${before ?? ""} edited`;
            }
            input.value = next;
            const wait = untilHook("updateItem", 5000, i => i.id === item.id);
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await wait;
            assert.notEqual(String(foundry.utils.getProperty(item, path)), String(before),
              `${type}: editing ${path} through the form changed nothing on the document`);
          }

          // The description toggle is a click with a visible effect.
          const toggle = useAction(sheet, "toggleDescription");
          if (toggle.el) {
            assert.ok(toggle.registered, `${type}: toggleDescription has no handler`);
            // The prose is what the toggle hides; its parent section never changes.
            const prose = sheet.element.querySelector(".azeroth-item__prose");
            const shown = el => el && !el.hidden && getComputedStyle(el).display !== "none";
            const was = shown(prose);
            toggle.el.click();
            await settle();
            if (prose) assert.notEqual(shown(prose), was, `${type}: toggleDescription changed nothing visible`);
          }

          // Cast: offered on an owned spell, and on nothing else.
          const cast = useAction(sheet, "castSpell");
          if (type === "spell") assert.ok(cast.el && cast.registered, "an owned spell offers no Cast");
          else assert.notOk(cast.el, `${type} offers a Cast button`);
        } finally {
          await sheet.close();
        }
      });
    }

    it("an unowned spell offers no Cast", async function () {
      this.timeout(20000);
      const spell = await itemOf("spell");
      const sheet = await openSheet(spell);
      try {
        assert.notOk(useAction(sheet, "castSpell").el,
          "an unowned spell offers Cast - a compendium spell has nobody to spend Power");
      } finally {
        await sheet.close();
      }
    });

    it("A PLAYER CANNOT TYPE A RANK INTO A TALENT; the GM still can (D-713)", async function () {
      this.timeout(90000);
      // The fault: `isEditable` is true for the OWNER of an embedded item, so a
      // talent on a character drew `taken` as a number box. A player typed 0
      // into it mid-fight and the point came back with no `canUntake`, no
      // *between fights* gate, and nothing to notice that the talent above it
      // in the branch had just lost its footing. The tree is the door.
      // A dedicated character: this grants itself ownership below, and doing
      // that to the batch's shared fixture would follow the other tests round.
      const player = await makeCharacter({ name: "ZZ Talent Lock", classes: [["Rogue", 3]] });
      const talent = player.items.find(t => t.type === "talent");
      assert.ok(talent, "the class brought no talents to lock");
      // The sheet must stay EDITABLE while the GM flag moves, or the assertion
      // below would pass for the wrong reason: it is the LOCK under test and
      // not the ownership. Granted explicitly; the actor is `cleanup`'s.
      await player.update({ ownership: { ...(player.ownership ?? {}), [game.user.id]: 3 } });
      const sheet = await openSheet(talent);
      const box = () => sheet.element.querySelector('input[name="system.taken"]');
      try {
        assert.ok(box(), "the GM cannot type a rank either - the override is gone");
        Object.defineProperty(game.user, "isGM", { value: false, configurable: true });
        try {
          await sheet.render();
          await settle();
          assert.isTrue(sheet.isEditable, "the sheet stopped being editable; the lock is not what this measured");
          assert.notOk(box(), "a player typed a rank straight into the talent, past every refund rule");
          const dt = [...sheet.element.querySelectorAll(".azeroth-item__field dt")]
            .find(d => d.textContent.trim() === game.i18n.localize("AZEROTH.Item.RanksTaken"));
          assert.ok(dt, "the Taken row left the sheet altogether rather than going read-only");
          assert.equal(dt.dataset.tooltip, game.i18n.localize("AZEROTH.Item.RanksTakenLocked"),
            "the locked field says nothing about why - a grey control with no reason beside it");
        } finally {
          delete game.user.isGM;
        }
        await sheet.render();
        await settle();
        assert.ok(box(), "the GM's box did not come back");
      } finally {
        await sheet.close();
      }
    });
  });
}
