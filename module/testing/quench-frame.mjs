/**
 * **THE CHARACTER SHEET IN WoW's CHARACTER PANE** (D-734) — the live half of
 * `styles/_frame.scss`.
 *
 * `module/testing/frame-scope.test.mjs` holds the amendment's BOUNDARY in
 * Node: one file, one selector root, no `clip-path`, and a fresh clone that
 * asks for no texture. Nothing it can do reaches the thing the frame is built
 * out of, which is **core's own frame markup**: the amendment names
 * `.window-header`, `.window-title`, `.header-control`, `.window-resize-handle`
 * and `.window-icon`, slides `.window-content` up under the header by a
 * negative margin, and hangs `nav.sheet-tabs` in the content's bottom padding.
 * Every one of those is a claim about a shape core owns and may move.
 *
 * So the first test here is a GUARD rather than an assertion about the design:
 * it names the verified build (14.367) and the file to repair, because when
 * core's frame changes the fault will present as a sheet that looks wrong in
 * five unrelated ways.
 *
 * The rest measure what no screenshot and no unit test can:
 *
 *  - the band is REAL — the nav sits inside the window box, below every
 *    column, and nothing scrolls because of it;
 *  - the parchment is on `.window-content` and the frame is transparent, which
 *    is the pair `checkText`'s `requireGroundWithin` depends on;
 *  - the default width is derived from the token rather than typed twice;
 *  - the title is the character's name and follows a rename;
 *  - core's tab text-shadow is cancelled on the state that carries it;
 *  - minimise still collapses the window, which our `min-width` would defeat;
 *  - a tab can be reached and pressed from the keyboard (`#applyTabSemantics`);
 *  - **and the NPC sheet did not move**, which is the whole point of the
 *    amendment being bounded.
 */

import { cleanup, made, makeCharacter, makeNpc, openSheet, settle } from "./fixtures.mjs";
import { parseColour } from "./colour.mjs";

/** Wait for a condition, the way every other batch does. */
const until = async (fn, what, ms = 5000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** A custom property off an element, as a number of pixels. */
const pxToken = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name));

/** A plain rect, rounded, so a message reads. */
const rectOf = el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
};

/** The laid-out children of `.window-content`, which is what the matrix counts. */
const columnsOf = root => [...root.querySelectorAll(".window-content > *")]
  .filter(el => el.getBoundingClientRect().width > 0);

export function frameBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe("The character sheet's frame (D-734)", function () {
    let actor;
    let sheet;
    let root;

    before(async function () {
      this.timeout(60000);
      actor = await makeCharacter({ name: "ZZ Frame Shaman", classes: [["Shaman", 1]], race: "Orc" });
      sheet = await openSheet(actor);
      root = sheet.element;
      await settle();
    });

    after(async function () {
      this.timeout(60000);
      await sheet?.close();
      await cleanup();
    });

    /* ---------------------------------------------------------------- */

    it("core's frame is the shape `_frame.scss` is written against", function () {
      // THE GUARD. Verified against Foundry 14.367; if core moves any of this,
      // repair `styles/_frame.scss` rather than patching around it.
      const where = "verified against Foundry 14.367 — repair styles/_frame.scss";
      for (const selector of [".window-header", ".window-title", ".header-control", ".window-resize-handle", ".window-icon"]) {
        assert.ok(root.querySelector(selector), `core's frame no longer renders ${selector} (${where})`);
      }
      const kids = [...root.children];
      const header = kids.findIndex(el => el.matches(".window-header"));
      const content = kids.findIndex(el => el.matches(".window-content"));
      assert.isAtLeast(header, 0, `no .window-header among the frame's children (${where})`);
      assert.equal(content, header + 1,
        `.window-content no longer follows .window-header — the negative margin that slides the`
        + ` interior under the title bar assumes they are consecutive (${where})`);
      // `changeTab` looks its tabs up inside `.window-content` and THROWS when
      // it finds none (application.mjs:1613). The nav is absolutely positioned
      // into that element's bottom padding for exactly this reason.
      const nav = root.querySelector("nav.sheet-tabs");
      assert.ok(nav, `the sheet rendered no nav.sheet-tabs (${where})`);
      assert.equal(nav.parentElement, root.querySelector(".window-content"),
        `nav.sheet-tabs left .window-content — core's changeTab would throw (${where})`);
    });

    it("the frame is transparent and the page's own ground is on .window-content", function () {
      // The pair `checkText`'s `requireGroundWithin` rests on: the form paints
      // nothing, so every leaf has to find a ground the sheet drew INSIDE it.
      const frame = getComputedStyle(root).backgroundColor;
      assert.equal(parseColour(frame)?.[3] ?? 0, 0, `the frame still paints a ground (${frame})`);

      const content = root.querySelector(".window-content");
      const ground = parseColour(getComputedStyle(content).backgroundColor);
      assert.ok(ground, ".window-content paints no ground at all");
      assert.isAtLeast(ground[3] ?? 0, 0.999, "the interior's ground is translucent");

      // **THE GROUND IS READ OFF `--azeroth-page`, NOT OFF A NAMED COLOUR.**
      // It was `--azeroth-parchment` until every tab took the slab (the lead,
      // 2026-09-20: *all tabs follow the same color scheme and styling*), and a
      // test that named the colour would have had to be rewritten with the
      // decision rather than holding it. What matters here is the pair the
      // frame guarantees — a TRANSPARENT app box and an OPAQUE interior — and
      // that the interior is painting the role the sheet declares, whichever
      // page it is on.
      const page = parseColour(getComputedStyle(root).getPropertyValue("--azeroth-page").trim());
      assert.ok(page, "--azeroth-page resolves to no colour on the character sheet");
      assert.deepEqual(ground.slice(0, 3), page.slice(0, 3),
        "the interior's ground is not --azeroth-page");

      // And it is the SLAB on this sheet, stated once so a re-point that
      // silently put the parchment back is a failure rather than a surprise.
      const slab = parseColour(getComputedStyle(root).getPropertyValue("--azeroth-stone-dark").trim());
      assert.deepEqual(page.slice(0, 3), slab.slice(0, 3),
        "the character sheet's page is not --azeroth-stone-dark");

      assert.equal(getComputedStyle(content).backgroundClip, "content-box",
        "the page is not held out of the frame's edge and the tab band");
    });

    it("the tab band is inside the window box, below every column", function () {
      const app = rectOf(root);
      const nav = root.querySelector("nav.sheet-tabs");
      const navRect = rectOf(nav);
      const edge = pxToken(root, "--azeroth-frame-edge");

      assert.isAtLeast(navRect.left, app.left - 1, "the tab strip runs off the window's left edge");
      assert.isAtMost(navRect.right, app.right + 1, "the tab strip runs off the window's right edge");
      assert.isAtMost(navRect.bottom, app.bottom + 1, "the tab strip runs below the window");
      assert.isAbove(navRect.height, 0, "the tab strip has no height");

      for (const column of columnsOf(root)) {
        if (column === nav) continue;
        const r = rectOf(column);
        assert.isAtMost(r.bottom, navRect.top + 1,
          `${column.className} runs into the tab band (bottom ${Math.round(r.bottom)} vs band top ${Math.round(navRect.top)})`);
        assert.isAtLeast(r.left, app.left + edge - 1,
          `${column.className} runs under the frame's left edge`);
        assert.isAtMost(r.right, app.right - edge + 1,
          `${column.className} runs under the frame's right edge`);
      }
    });

    it("nothing is hidden below the interior's fold, on any tab", async function () {
      this.timeout(30000);
      // The band is PADDING on a box that scrolls: if the grid ever grew past
      // its row the whole interior would scroll and the nav would travel with
      // it. Every tab, because a wide tab drops a grid track.
      const content = root.querySelector(".window-content");
      const tabs = [...root.querySelectorAll("nav.sheet-tabs a[data-tab]")].map(a => a.dataset.tab);
      assert.isAtLeast(tabs.length, 5, "the nav drew fewer than five tabs");
      for (const tab of tabs) {
        sheet.changeTab(tab, "primary");
        await settle();
        assert.isAtMost(content.scrollHeight, content.clientHeight + 1,
          `the interior scrolls on the "${tab}" tab (${content.scrollHeight} > ${content.clientHeight})`);
      }
      sheet.changeTab("core", "primary");
      await settle();
    });

    it("the default width is the interior plus two frame edges", function () {
      // 880 is never typed on its own: a change to the token has to move the
      // window with it, or the three columns silently lose ten pixels.
      const edge = pxToken(root, "--azeroth-frame-edge");
      assert.equal(sheet.position.width, 860 + (2 * edge),
        `position.width is ${sheet.position.width}; 860 of interior plus two ${edge}px edges is ${860 + 2 * edge}`);
    });

    it("the title is the character's name, and follows a rename", async function () {
      this.timeout(30000);
      const title = () => root.querySelector(".window-title").textContent.trim();
      assert.equal(sheet.title, actor.name, "the sheet's title is not the actor's name");
      assert.equal(title(), actor.name, "the rendered title is not the actor's name");
      assert.notInclude(title(), ":", "core's `Character:` prefix is back on the title bar");

      const renamed = "ZZ Frame Renamed";
      await actor.update({ name: renamed });
      await until(() => title() === renamed, "the title bar to follow the rename", 10000);
      await actor.update({ name: "ZZ Frame Shaman" });
      await until(() => title() === "ZZ Frame Shaman", "the title bar to follow it back", 10000);
    });

    it("the gold title carries no text shadow, clears the bar's foot, and neither does the active tab", async function () {
      // Core draws `nav.tabs [data-tab].active` with `text-shadow: 0 0 10px`
      // and the header title with its own; both smear on a flat ground
      // (D-611), and both are cancelled in `_frame.scss`.
      const title = root.querySelector(".window-title");
      assert.equal(getComputedStyle(title).textShadow, "none",
        "the window title still casts core's shadow");
      const active = root.querySelector("nav.sheet-tabs a.active");
      assert.ok(active, "no tab is marked active");
      assert.equal(getComputedStyle(active).textShadow, "none",
        "the active tab still casts core's shadow");
      const inactive = root.querySelector("nav.sheet-tabs a:not(.active)");
      assert.equal(getComputedStyle(inactive).textShadow, "none",
        "an inactive tab casts a shadow");

      // THE FOOT IS THE ONE STRIP `checkText` CANNOT SEE (D-734, Phase 6).
      // With the WoW textures present the bar closes on `divider.png`, drawn
      // on `.window-header::after` - and a pseudo-element is not an ancestor,
      // so the ground walk never meets it and a title lying across it would
      // measure clean. The art is BRIGHT (p99 0.29; gold clears it at only
      // 2.1:1), so the guard is geometric: the title's line box ends at or
      // above the strip. The header's bottom padding and the title's
      // line-height are derived from the same `--azeroth-header-foot` and this
      // fails the moment one of them moves without the other. With no art the
      // foot is 0 and the two edges simply coincide.
      const header = root.querySelector(".window-header");
      const foot = pxToken(root, "--azeroth-header-foot");
      const gap = header.getBoundingClientRect().bottom - foot - title.getBoundingClientRect().bottom;
      assert.isAtLeast(gap, -0.5,
        `the title's line box runs ${(-gap).toFixed(1)}px into the ${foot}px bar foot, where the divider art is`);
    });

    it("the header buttons take our colours and fade at nothing", function () {
      // Core's `button` carries `transition: 0.5s` on every property, so a
      // colour measured right after a state change is mid-fade (D-733). Every
      // control we restyle sets `transition: none`.
      const close = root.querySelector('.window-header .header-control[data-action="close"]');
      assert.ok(close, "the frame has no close button");
      const cs = getComputedStyle(close);
      assert.equal(cs.transitionDuration, "0s", "the header buttons still fade");
      const red = parseColour(getComputedStyle(root).getPropertyValue("--azeroth-close-red").trim());
      assert.deepEqual(parseColour(cs.backgroundColor).slice(0, 3), red.slice(0, 3),
        "the close button is not on the red plate");
      // The FontAwesome glyph stays: a plain red square says nothing.
      assert.match(cs.fontFamily, /Font Awesome/i, "the close button lost its icon face");
    });

    it("the tab strip says what it is, and a tab is reachable from the keyboard", async function () {
      this.timeout(30000);
      const nav = root.querySelector("nav.sheet-tabs");
      assert.equal(nav.getAttribute("role"), "tablist", "the strip is not a tablist");
      const anchors = [...nav.querySelectorAll("a[data-tab]")];
      for (const a of anchors) {
        assert.equal(a.getAttribute("role"), "tab", `${a.dataset.tab} is not a tab`);
        assert.equal(a.tabIndex, 0, `${a.dataset.tab} is not in the tab order`);
      }
      const active = nav.querySelector("a.active");
      assert.equal(active.getAttribute("aria-selected"), "true", "the active tab does not say it is selected");

      // ENTER PRESSES IT. A bare `<a>` with no href takes no keyboard at all,
      // which is why `bindKeyActivation` is wired on the strip.
      const target = anchors.find(a => a.dataset.tab === "combat");
      assert.ok(target, "no Combat tab to press");
      target.focus();
      assert.equal(document.activeElement, target, "the tab did not take focus");
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await until(() => sheet.tabGroups.primary === "combat", "Enter to change tab", 10000);
      await settle();
      // Re-query: a render detaches the control (the AppV2 rule).
      const combat = root.querySelector('nav.sheet-tabs a[data-tab="combat"]');
      assert.equal(combat.getAttribute("aria-selected"), "true",
        "aria-selected did not follow changeTab, which swaps classes and never renders");
      const core = root.querySelector('nav.sheet-tabs a[data-tab="core"]');
      assert.equal(core.getAttribute("aria-selected"), "false", "the old tab still claims to be selected");

      sheet.changeTab("core", "primary");
      await settle();
    });

    it("minimises and comes back", async function () {
      this.timeout(30000);
      // OUR `min-width: 720px` WOULD DEFEAT CORE'S MINIMISE: core sets
      // `min-width/min-height: unset` on `.minimizing`, `.minimized` and
      // `.maximizing`, and a minimum of ours that is not scoped off those
      // three states wins over its `max-width: 200px` every time.
      assert.isTrue(sheet.options.window.minimizable, "the sheet cannot be minimised at all");
      const before = rectOf(root);
      await sheet.minimize();
      await settle();
      const small = rectOf(root);
      assert.isAtMost(small.width, 220,
        `minimised to ${Math.round(small.width)}px wide; our min-width is defeating core's unset`);
      assert.isAtMost(small.height, 56,
        `minimised to ${Math.round(small.height)}px tall; the header is ${pxToken(root, "--header-height")}px`);

      await sheet.maximize();
      await settle();
      const back = rectOf(root);
      assert.closeTo(back.width, before.width, 2, "the window did not come back to its width");
      assert.closeTo(back.height, before.height, 2, "the window did not come back to its height");
    });

    /* ---------------------------------------------------------------- */

    it("the NPC sheet did not move", async function () {
      this.timeout(60000);
      // THE WHOLE POINT OF THE AMENDMENT BEING BOUNDED. A rule dropped in
      // `_sheet.scss` instead of `_frame.scss` would look right on the one
      // surface anybody screenshotted and restyle every other sheet.
      const npc = await makeNpc("Plagued Ghoul");
      made.push(npc);
      const npcSheet = await openSheet(npc);
      try {
        const el = npcSheet.element;
        const parchment = parseColour(getComputedStyle(el).getPropertyValue("--azeroth-parchment").trim());
        assert.deepEqual(parseColour(getComputedStyle(el).backgroundColor).slice(0, 3), parchment.slice(0, 3),
          "the NPC sheet's frame went transparent — a frame rule escaped onto `.azeroth.sheet.actor`");
        const nav = el.querySelector("nav.sheet-tabs");
        assert.ok(nav, "the NPC sheet drew no tabs");
        assert.equal(getComputedStyle(nav).position, "static",
          "the NPC sheet's tabs were hung off the frame");
        const header = el.querySelector(".window-header");
        assert.equal(getComputedStyle(header).marginLeft, "0px",
          "the NPC sheet's header gave up a portrait strip");
        const content = el.querySelector(".window-content");
        assert.equal(getComputedStyle(content).marginTop, "0px",
          "the NPC sheet's interior slid under its header");
      } finally {
        await npcSheet.close();
      }
    });
  });
}
