/**
 * D11 §9's layout checks, against a rendered sheet.
 *
 * **Every layout fault in D11's own pass was found by measuring, and several
 * were invisible in a screenshot.** These are the checks that pass proved by
 * reintroducing the fault each one catches, carried into the Foundry sheet
 * where the same traps recur for the same reasons.
 *
 * They take a root element and return findings, so they run anywhere a sheet is
 * rendered: in Quench against the real client, and in `npm run preview` against
 * the same templates. No Foundry globals, no test framework — the caller
 * asserts. `checkSheet()` is the ONE entry point both consumers call; the
 * three original checks had two callers hand-rolling them with different
 * selectors, which is a drift point this closes.
 *
 * **A finding is a measurement, not a verdict.** A chip deliberately hung
 * outside its plate is the design (D11 §9 says to build it that way); what the
 * clip check catches is that chip being a *descendant* of the clipped element
 * rather than its sibling, which silently cuts it off.
 */

import { composite, contrast, parseColour, toHex } from "./colour.mjs";

/** Elements that hold text of their own, rather than only holding children. */
function leafText(root) {
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.children.length) continue;
    const text = (el.textContent ?? "").trim();
    if (text) out.push(el);
  }
  return out;
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
}

const hidden = r => r.width === 0 && r.height === 0;

/**
 * Whether an element is actually being PAINTED.
 *
 * A zero-size rect is not the only way to be invisible, and the one that
 * caught us is `content-visibility`: **a closed `<details>` still hands back a
 * real `getBoundingClientRect`.** Chromium collapses it by making the content
 * slot `content-visibility: hidden`, which skips painting but leaves the
 * children with a layout of their own — the compendium browser's closed facets
 * measured as 10px-wide, 65px-tall strips sitting on top of the entry list,
 * and `checkOverlap` reported 33 overprints between text nobody could see
 * (2026-09-07).
 *
 * **NARROW ON PURPOSE.** `Element.checkVisibility` is the DOM's general answer
 * and it is the wrong tool here: these checks' own break tests measure a
 * scratch container that is `visibility: hidden`, because they care about
 * geometry and nothing else, and `checkVisibility` refuses every element in
 * it. `display: none` and `visibility: hidden` already give a zero rect where
 * they matter, so a closed `<details>` is the one case the rect misses.
 */
function painted(el) {
  if (!el || el.nodeType !== 1) return true;
  return !el.closest?.("details:not([open])");
}

/** A leaf worth measuring: it has a box, and something is drawing it. */
const unmeasurable = (el, rect) => hidden(rect) || !painted(el);

/**
 * The part of a leaf that is actually PAINTED — its rect intersected with
 * every clipping ancestor's padding box — or `null` when none of it is.
 *
 * `getBoundingClientRect` knows nothing about an ancestor's clip, so the
 * twenty-third skill — below the fold of a column whose `overflow-y` is
 * `auto` — hands back a rect thirty pixels past the column's bottom edge, on
 * top of whatever the sheet draws there. For as long as the tab strip sat
 * ABOVE the body columns nothing was drawn there and the phantom overprinted
 * nothing; D-734 hangs the tabs off the frame's bottom edge, and `checkOverlap`
 * reported seven tab labels overprinting rows nobody can see.
 *
 * **INTERSECT, rather than ask whether it is out of sight.** The first cut of
 * this skipped a leaf lying WHOLLY outside its clipper and still reported
 * *"Gear" and "No effects in force." overprint* on the loaded character: the
 * row STRADDLES the fold, so half of it is real and the half the reader cannot
 * see is the half on the tab. Only the painted rectangle answers both.
 *
 * Same family as `painted` above, and narrow for the same reason: this is used
 * by `checkOverlap` ALONE. `checkOverflowClip`'s whole job is to find the leaf
 * that its clipping ancestor swallowed, so a leaf outside its clipper must stay
 * measurable there; and `checkText` judges a colour, which a scroll position
 * does not change.
 *
 * @param {Element} el
 * @param {object} rect
 * @param {Window} view
 * @returns {object|null}
 */
function paintedRect(el, rect, view) {
  const r = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  for (let n = el.parentElement; n; n = n.parentElement) {
    const cs = view.getComputedStyle(n);
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
    const b = n.getBoundingClientRect();
    const box = { left: b.left + n.clientLeft, top: b.top + n.clientTop };
    box.right = box.left + n.clientWidth;
    box.bottom = box.top + n.clientHeight;
    // A collapsed box clips nothing anybody can reason about; leave it alone.
    if (box.right <= box.left || box.bottom <= box.top) continue;
    if (cs.overflowX !== "visible") {
      r.left = Math.max(r.left, box.left);
      r.right = Math.min(r.right, box.right);
    }
    if (cs.overflowY !== "visible") {
      r.top = Math.max(r.top, box.top);
      r.bottom = Math.min(r.bottom, box.bottom);
    }
    if (r.right <= r.left || r.bottom <= r.top) return null;
  }
  r.width = r.right - r.left;
  r.height = r.bottom - r.top;
  return r;
}

/** Do two rectangles overlap by more than a rounding error? */
function overlaps(a, b, tolerance = 1) {
  return a.left < b.right - tolerance
    && b.left < a.right - tolerance
    && a.top < b.bottom - tolerance
    && b.top < a.bottom - tolerance;
}

function viewOf(root) {
  return root.ownerDocument?.defaultView ?? window;
}

/**
 * How many line boxes an element's text occupies: the distinct tops of the
 * client rects of a Range over its contents. Fragments sharing a line share a
 * top, so inline children do not inflate the count.
 */
function lineCount(el, view) {
  const doc = el.ownerDocument;
  if (!doc?.createRange) return 1;
  const range = doc.createRange();
  range.selectNodeContents(el);
  const tops = new Set();
  for (const rect of range.getClientRects()) {
    if (rect.width < 0.5 || rect.height < 0.5) continue;
    tops.add(Math.round(rect.top));
  }
  range.detach?.();
  void view;
  return tops.size || 1;
}

function matchesAny(el, selectors) {
  return selectors.some(s => { try { return el.matches(s) || el.closest(s); } catch { return false; } });
}

/**
 * 1. Column containment.
 *
 * Three measurements, because they catch different things: a column that
 * scrolls sideways is holding something too wide for it; two columns whose
 * boxes intersect are a broken grid; and a leaf of text outside its own
 * column's box has escaped without either of the first two noticing.
 *
 * @param {Element[]} columns  The grid's tracks, in order.
 */
export function checkColumns(columns) {
  const findings = [];
  const rects = columns.map(rectOf);
  const view = columns[0] ? viewOf(columns[0]) : window;

  columns.forEach((column, i) => {
    // A horizontal scrollbar the design never asked for. `box-sizing` not
    // being border-box is the usual cause (D11 §9).
    // ONLY A SCROLL CONTAINER CAN SHOW THE SCROLLBAR THIS IS ABOUT. With
    // overflow visible, scrollWidth > clientWidth means a descendant sticks
    // out - and core's `.scrollable` parts do that BY DESIGN, with a negative
    // right margin so the scrollbar sits in a 0.75rem gutter (foundry2.css
    // line 5742). Run 4 reported the browser's gutter as a 12px fault. A leaf
    // that actually leaves the column is the stray check's job below.
    const ox = view.getComputedStyle(column).overflowX;
    const scrollsX = ox === "auto" || ox === "scroll";
    if (scrollsX && column.scrollWidth > column.clientWidth + 1) {
      // Name the culprit: the descendant reaching furthest past the column's
      // right edge is almost always the one asking for the scrollbar.
      const edge = rects[i].right;
      let worst = null, over = 0;
      for (const el of column.querySelectorAll("*")) {
        const d = el.getBoundingClientRect().right - edge;
        if (d > over) { over = d; worst = el; }
      }
      // No box crosses the edge and the column still scrolls: the width is
      // TEXT overflowing a shrunken box (a flex item at min-width 0 with a
      // word it cannot break), which no bounding rect shows. Name the box
      // whose content overflows it most (2026-09-02: the first such finding
      // named only the column).
      let inner = null, innerBy = 0;
      if (!worst) {
        for (const el of column.querySelectorAll("*")) {
          const d = el.scrollWidth - el.clientWidth;
          if (d > innerBy) { innerBy = d; inner = el; }
        }
      }
      findings.push({
        check: "columns",
        kind: "overflow",
        detail: `column ${i} scrolls sideways: ${column.scrollWidth} > ${column.clientWidth}`
          + (worst ? `; ${describe(worst)} reaches ${Math.round(over)}px past its right edge` : "")
          + (inner ? `; text overflows ${describe(inner)} by ${Math.round(innerBy)}px` : ""),
        element: describe(column)
      });
    }

    for (let j = i + 1; j < columns.length; j++) {
      if (overlaps(rects[i], rects[j])) {
        findings.push({
          check: "columns",
          kind: "intersect",
          detail: `column ${i} and column ${j} overlap`,
          element: describe(columns[j])
        });
      }
    }

    for (const leaf of leafText(column)) {
      const r = rectOf(leaf);
      if (unmeasurable(leaf, r)) continue;   // hidden, not stray
      if (r.left < rects[i].left - 1 || r.right > rects[i].right + 1) {
        findings.push({
          check: "columns",
          kind: "stray",
          detail: `"${(leaf.textContent ?? "").trim().slice(0, 30)}" sits outside column ${i}`,
          element: describe(leaf)
        });
      }
    }
  });

  return findings;
}

/**
 * 2. Clip containment.
 *
 * **`clip-path` clips descendants.** D11 §9 records this biting twice — the
 * attribute modifier chips, then the talent rank badges — and says to assume it
 * will happen again. For every element, walk up for a clipped ancestor and flag
 * the ones whose box extends past it.
 */
export function checkClipping(root) {
  const findings = [];
  const view = viewOf(root);

  const clipped = new Map();
  for (const el of root.querySelectorAll("*")) {
    const clip = view.getComputedStyle(el).clipPath;
    if (clip && clip !== "none") clipped.set(el, rectOf(el));
  }
  if (!clipped.size) return findings;

  for (const [ancestor, box] of clipped) {
    for (const child of ancestor.querySelectorAll("*")) {
      const r = rectOf(child);
      if (unmeasurable(child, r)) continue;
      const escapes = r.left < box.left - 1 || r.right > box.right + 1
        || r.top < box.top - 1 || r.bottom > box.bottom + 1;
      if (escapes) {
        findings.push({
          check: "clip",
          kind: "clipped",
          detail: `${describe(child)} extends past its clip-path ancestor ${describe(ancestor)}`
            + " — make it a SIBLING of the clipped plate, not a child",
          element: describe(child)
        });
      }
    }
  }

  return findings;
}

/**
 * 3. Non-empty panels.
 *
 * **Geometry alone reports a blank panel as clean.** A panel that renders,
 * measures correctly, and says nothing passes every other check here.
 */
export function checkNotEmpty(panels) {
  const findings = [];
  for (const panel of panels) {
    const text = (panel.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2) {
      findings.push({
        check: "empty",
        kind: "blank",
        detail: `panel ${describe(panel)} rendered nothing`,
        element: describe(panel)
      });
    }
  }
  return findings;
}

/**
 * 4. Overflow clipping - the "cut off" the clip-path check cannot see.
 *
 * An ancestor with `overflow: hidden` (or `clip`) swallows any leaf of text that
 * extends past its padding box, and nothing scrolls to reveal it. A scrolling
 * ancestor (`auto`/`scroll`) still swallows an absolutely-positioned child that
 * lies outside it, and adds a scrollbar nobody asked for. This is the check
 * that finds the talent detail card at tier 5, at the bottom of a scrolling
 * panel, and anything the sheet's own grid clips.
 *
 * @param {Element} root
 * @param {object} [opts]
 * @param {string[]} [opts.ignore]  Selectors whose matches (or descendants) are the design.
 */
export function checkOverflowClip(root, { ignore = [] } = {}) {
  const findings = [];
  const view = viewOf(root);
  const CLIPS = new Set(["hidden", "clip"]);
  const SCROLLS = new Set(["auto", "scroll"]);
  const px = n => Math.round(n);

  /** The padding box of an element, as a rect. */
  const paddingBox = el => {
    const b = rectOf(el);
    b.left += el.clientLeft; b.top += el.clientTop;
    b.right = b.left + el.clientWidth; b.bottom = b.top + el.clientHeight;
    return b;
  };

  /**
   * The nearest ancestor whose overflow is not visible, and what it does.
   * JUDGE AGAINST THE NEAREST ONE. A leaf past a scrolling ancestor is one
   * scroll away; only a leaf past a clipping ancestor with no scroller
   * between is gone. Run 4 reported every row below a scroller's fold as cut.
   */
  const nearestOverflow = el => {
    for (let n = el.parentElement; n && n !== root.parentElement; n = n.parentElement) {
      const cs = view.getComputedStyle(n);
      const x = cs.overflowX, y = cs.overflowY;
      if (CLIPS.has(x) || CLIPS.has(y) || SCROLLS.has(x) || SCROLLS.has(y)) {
        return { el: n, clipsX: CLIPS.has(x), clipsY: CLIPS.has(y), scrolls: SCROLLS.has(x) || SCROLLS.has(y), cs };
      }
    }
    return null;
  };

  for (const child of root.querySelectorAll("*")) {
    if (matchesAny(child, ignore)) continue;
    const r = rectOf(child);
    if (unmeasurable(child, r)) continue;
    const isLeaf = !child.children.length && (child.textContent ?? "").trim();
    const absolute = view.getComputedStyle(child).position === "absolute";
    if (!isLeaf && !absolute) continue;

    const near = nearestOverflow(child);
    if (!near) continue;
    const box = paddingBox(near.el);
    if (box.right <= box.left || box.bottom <= box.top) continue;   // collapsed, not clipping

    const pastX = r.left < box.left - 1 || r.right > box.right + 1;
    const pastY = r.top < box.top - 1 || r.bottom > box.bottom + 1;

    if (isLeaf && !near.scrolls && ((near.clipsX && pastX) || (near.clipsY && pastY))) {
      findings.push({
        check: "overflow",
        kind: "cut",
        detail: `"${(child.textContent ?? "").trim().slice(0, 30)}" is cut off by ${describe(near.el)} (overflow ${near.cs.overflowX}/${near.cs.overflowY}): leaf ${px(r.left)},${px(r.top)}-${px(r.right)},${px(r.bottom)} vs box ${px(box.left)},${px(box.top)}-${px(box.right)},${px(box.bottom)}`,
        element: describe(child)
      });
    } else if (absolute && near.scrolls) {
      // A scroller holds more than it shows: judge against the scrollable
      // extent, not the fold. A full talent tree put every arrow below the
      // first screen and each was reported "escaped" (D-610). What a scroller
      // cannot reach is what lies above or left of its content start, or
      // beyond what it can scroll to.
      const ext = { left: box.left - near.el.scrollLeft, top: box.top - near.el.scrollTop };
      ext.right = ext.left + Math.max(near.el.scrollWidth, near.el.clientWidth);
      ext.bottom = ext.top + Math.max(near.el.scrollHeight, near.el.clientHeight);
      const outX = r.left < ext.left - 1 || r.right > ext.right + 1;
      const outY = r.top < ext.top - 1 || r.bottom > ext.bottom + 1;
      if (outX || outY) {
        findings.push({
          check: "overflow",
          kind: "escaped",
          detail: `${describe(child)} is positioned outside its scrolling ancestor ${describe(near.el)}`,
          element: describe(child)
        });
      }
    }
  }
  return findings;
}

/**
 * 5. Truncation.
 *
 * A name ending in an ellipsis passes every containment check and is still
 * cut off. Flag any element that asks for `text-overflow: ellipsis`, or that
 * refuses to wrap under a clipping ancestor, and is wider than its box.
 */
export function checkTruncation(root) {
  const findings = [];
  const view = viewOf(root);
  for (const el of root.querySelectorAll("*")) {
    const cs = view.getComputedStyle(el);
    const ellipsis = cs.textOverflow === "ellipsis";
    const nowrap = cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
    if (!ellipsis && !nowrap) continue;
    if (el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? "").trim()) {
      findings.push({
        check: "truncation",
        kind: ellipsis ? "ellipsis" : "nowrap",
        detail: `"${(el.textContent ?? "").trim().slice(0, 30)}" is wider than its box (${el.scrollWidth} > ${el.clientWidth})`,
        element: describe(el)
      });
    }
  }
  return findings;
}

/**
 * 6. Viewport.
 *
 * A window that opens taller than the screen loses its bottom; an
 * `overflow: hidden` box with more content than height loses its tail. Both
 * are content nobody can reach.
 *
 * @param {Element} root
 * @param {object} [viewport]  `{width, height}`; defaults to the window's.
 */
export function checkViewport(root, viewport = {}) {
  const findings = [];
  const view = viewOf(root);
  const width = viewport.width ?? view.innerWidth;
  const height = viewport.height ?? view.innerHeight;

  const r = rectOf(root);
  if (r.right > width + 1 || r.bottom > height + 1 || r.left < -1 || r.top < -1) {
    findings.push({
      check: "viewport",
      kind: "offscreen",
      detail: `${describe(root)} runs off a ${width}x${height} viewport (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`,
      element: describe(root)
    });
  }

  const REPLACED = new Set(["IMG", "VIDEO", "CANVAS", "SVG", "IFRAME", "INPUT", "SELECT", "TEXTAREA", "PROGRESS", "METER"]);
  for (const el of root.querySelectorAll("*")) {
    // A replaced element has no content below any fold: an <img>'s scrollHeight
    // is its intrinsic box, and the first run reported every portrait hiding
    // 4px. Only a box that HOLDS things can hide some of them.
    if (REPLACED.has(el.tagName) || !el.childElementCount) continue;
    const cs = view.getComputedStyle(el);
    if (cs.overflowY !== "hidden" && cs.overflowY !== "clip") continue;
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      findings.push({
        check: "viewport",
        kind: "below-fold",
        detail: `${describe(el)} hides ${el.scrollHeight - el.clientHeight}px of content below its fold and cannot scroll`,
        element: describe(el)
      });
    }
  }
  return findings;
}

/**
 * 7. Overlap.
 *
 * Two pieces of text drawn on the same pixels. The column check sees only
 * columns; this sees leaves within one.
 *
 * **WHAT IS PAINTED, not what is laid out.** A leaf scrolled past its column's
 * fold keeps a rect where nothing is drawn, so the comparison is made on
 * `paintedRect` — the leaf clipped by every clipping ancestor — and a leaf with
 * nothing left of it is skipped. The clip is resolved ONCE per leaf, before the
 * pairwise loop, because it walks the ancestor chain.
 */
export function checkOverlap(root, { ignore = [] } = {}) {
  const findings = [];
  const view = viewOf(root);
  const leaves = leafText(root).filter(el => !matchesAny(el, ignore));
  const raw = leaves.map(rectOf);
  const rects = leaves.map((el, i) => (unmeasurable(el, raw[i]) ? null : paintedRect(el, raw[i], view)));
  for (let i = 0; i < leaves.length; i++) {
    if (!rects[i]) continue;
    for (let j = i + 1; j < leaves.length; j++) {
      if (!rects[j]) continue;
      if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
      if (overlaps(rects[i], rects[j], 2)) {
        findings.push({
          check: "overlap",
          kind: "overlap",
          detail: `"${(leaves[i].textContent ?? "").trim().slice(0, 20)}" and "${(leaves[j].textContent ?? "").trim().slice(0, 20)}" overprint`,
          element: describe(leaves[j])
        });
      }
    }
  }
  return findings;
}

/**
 * 8. Legibility.
 *
 * D5 §8 is a print document; the screen floor is the lead's ruling of
 * 2026-09-02: 12px hard, 13px for anything read in a row, 1.35 leading where
 * a line wraps, 4.5:1 contrast (3:1 for large text). **Opacity is not a text
 * colour** — a dimmed label is measured at the colour a reader sees, which is
 * the ink composited through every ancestor's opacity onto the first opaque
 * ground beneath it. A `background-image` met before that ground is its own
 * finding: rules text sits on a flat ground (D5), and this is the guard on
 * Phase 7 putting parchment texture under body copy.
 *
 * **`requireGroundWithin` is the guard on a sheet that stops painting one.**
 * Without it the walk climbs past `root` and finds core's `body`, so a region
 * of ours that paints nothing is measured against Foundry's ground and reads
 * clean; with it the walk stops at `root` and a leaf with no opaque ground
 * inside the sheet is a `no-ground` finding rather than a silent `continue`.
 * That is what catches the frame going transparent and taking the parchment
 * with it.
 *
 * @param {Element} root
 * @param {object} [opts]
 * @param {number} [opts.minFontPx=12]
 * @param {number} [opts.minRowFontPx=13]
 * @param {string} [opts.rowSelector]     Where the row floor applies.
 * @param {number} [opts.minContrast=4.5]
 * @param {number} [opts.minLineHeight=1.35]
 * @param {boolean} [opts.requireGroundWithin=false]  Stop the ground walk at `root`.
 * @param {string[]} [opts.ignore]
 */
export function checkText(root, {
  minFontPx = 12,
  minRowFontPx = 13,
  rowSelector = "li, tr, .azeroth-skill, .azeroth-weapon, .azeroth-spell, .azeroth-gear-row, .azeroth-talent, .azeroth-browser-entry",
  minContrast = 4.5,
  minLineHeight = 1.35,
  requireGroundWithin = false,
  ignore = []
} = {}) {
  const findings = [];
  const view = viewOf(root);

  for (const el of leafText(root)) {
    if (matchesAny(el, ignore)) continue;
    const r = rectOf(el);
    if (unmeasurable(el, r)) continue;
    const cs = view.getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const sample = `"${(el.textContent ?? "").trim().slice(0, 24)}"`;

    // Size.
    const floor = matchesAny(el, [rowSelector]) ? minRowFontPx : minFontPx;
    if (size < floor - 0.01) {
      findings.push({ check: "text", kind: "small", detail: `${sample} is ${size}px; the floor is ${floor}px`, element: describe(el) });
    }

    // Leading, only where the text wrapped. Wrapping is COUNTED LINE BOXES,
    // never the box height: a one-glyph button under core's min-height reads
    // as three lines tall and is one line of text (2026-09-02, 27 findings on
    // one tab, every one a delete button).
    const lh = cs.lineHeight === "normal" ? size * 1.2 : parseFloat(cs.lineHeight);
    if (lineCount(el, view) >= 2 && lh / size < minLineHeight - 0.01) {
      findings.push({ check: "text", kind: "leading", detail: `${sample} wraps at ${(lh / size).toFixed(2)} leading; the floor is ${minLineHeight}`, element: describe(el) });
    }

    // Colour: ink through the opacity chain, onto the first opaque ground.
    const ink = parseColour(cs.color);
    if (!ink) continue;
    let alpha = ink[3];
    let ground = null;
    let textured = null;
    for (let node = el; node && node !== root.ownerDocument; node = node.parentElement) {
      const ncs = view.getComputedStyle(node);
      if (node !== el) alpha *= parseFloat(ncs.opacity || "1");
      else alpha *= parseFloat(ncs.opacity || "1");
      const bg = parseColour(ncs.backgroundColor);
      if (ncs.backgroundImage && ncs.backgroundImage !== "none" && !textured) textured = node;
      if (bg && bg[3] > 0) {
        if (bg[3] >= 0.999) { ground = bg.slice(0, 3); break; }
        // A translucent layer: remember it and keep walking for the opaque one.
        ground = ground ? ground : null;
        // Composite later: collect layers.
        (el.__azLayers ??= []).push(bg);
      }
      // The sheet's own edge. Past it lies core's chrome and then `body`,
      // which is opaque and is nothing this sheet drew.
      if (requireGroundWithin && node === root) break;
    }
    if (textured && ground) {
      findings.push({ check: "text", kind: "textured", detail: `${sample} sits on a background-image (${describe(textured)}) — rules text wants a flat ground`, element: describe(el) });
    }
    if (!ground) {
      delete el.__azLayers;
      // nothing opaque found; cannot judge — and inside a sheet that is the fault
      if (requireGroundWithin) {
        findings.push({
          check: "text", kind: "no-ground",
          detail: `${sample} found no opaque ground inside ${describe(root)} — text always sits on a flat ground it drew itself`,
          element: describe(el)
        });
      }
      continue;
    }
    // Composite translucent layers innermost-last onto the opaque ground.
    let g = ground;
    for (const layer of (el.__azLayers ?? []).reverse()) g = composite(layer, g);
    delete el.__azLayers;
    const seen = composite([ink[0], ink[1], ink[2], alpha], g);
    const ratio = contrast(seen, g);
    const large = size >= 18.66 || (size >= 14 && bold);
    const need = large ? 3 : minContrast;
    if (ratio < need - 0.01) {
      findings.push({
        check: "text",
        kind: "contrast",
        detail: `${sample} is ${toHex(seen)} on ${toHex(g)} at ${ratio.toFixed(2)}:1; needs ${need}:1` + (alpha < 0.999 ? ` (opacity ${alpha.toFixed(2)} did this)` : ""),
        element: describe(el)
      });
    }
  }
  return findings;
}

/**
 * Every check, over a sheet. THE entry point.
 *
 * @param {Element} root
 * @param {object} [opts]
 * @param {string} [opts.columns]        Direct children of the grid.
 * @param {string} [opts.panels]         What must not be blank.
 * @param {number} [opts.expectColumns]  How many columns the sheet must have laid out.
 * @param {object} [opts.viewport]       `{width, height}` for the viewport check.
 * @param {string[]} [opts.ignore]       The design, not a fault.
 * @param {object} [opts.text]           Options for `checkText`; `false` skips it.
 */
export function checkSheet(root, {
  columns = ".window-content > *",
  panels = ".tab.active, .azeroth-attributes, .azeroth-skills:not([hidden]), .azeroth-talent-card:not([hidden])",
  expectColumns = null,
  viewport = {},
  ignore = [".azeroth-chip"],
  text = {}
} = {}) {
  if (!root) return [{ check: "root", kind: "missing", detail: "no element to measure", element: "" }];

  const columnEls = [...root.querySelectorAll(columns)]
    // A hidden track is not a column; `display: none` gives it a zero box that
    // intersects nothing and strays everywhere.
    .filter(el => el.getBoundingClientRect().width > 0);

  const findings = [];
  if (expectColumns !== null && columnEls.length !== expectColumns) {
    findings.push({
      check: "columns", kind: "count",
      detail: `laid out ${columnEls.length} column(s), expected ${expectColumns}`,
      element: describe(root)
    });
  }

  findings.push(
    ...checkColumns(columnEls),
    ...checkClipping(root),
    ...checkNotEmpty([...root.querySelectorAll(panels)]),
    ...checkOverflowClip(root, { ignore }),
    ...checkTruncation(root),
    ...checkViewport(root, viewport),
    ...checkOverlap(root, { ignore })
  );
  if (text !== false) findings.push(...checkText(root, { ignore, ...text }));
  return findings;
}

/** One line per finding, for an assertion message or a report panel. */
export function formatFindings(findings) {
  return findings.map(f => `  ${f.check}/${f.kind}: ${f.detail}`).join("\n");
}

/** A short, readable identifier for a finding. */
function describe(el) {
  if (!el) return "";
  const cls = typeof el.className === "string" && el.className
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  return `${el.tagName.toLowerCase()}${cls}`;
}
