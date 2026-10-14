/**
 * Colour maths for the legibility sweep.
 *
 * Framework-free and Foundry-free, so `geometry.mjs` (Quench) and
 * `tools/sheet-preview/preview.mjs` share ONE implementation. The preview had
 * its own copy at preview.mjs:73-88 that only parsed six-digit hex - fine for
 * the token readout, useless against `getComputedStyle`, which hands back
 * `rgb(28, 26, 23)`, `rgba(0, 0, 0, 0.04)` or `color(srgb 0.11 0.1 0.09)`.
 */

/**
 * Parse a CSS colour into `[r, g, b, a]` on 0-255 / 0-1, or `null` for
 * anything that is not a colour (`currentcolor`, `inherit`, an image).
 * @param {string} str
 * @returns {number[]|null}
 */
export function parseColour(str) {
  if (typeof str !== "string") return null;
  const s = str.trim().toLowerCase();
  if (!s || s === "transparent") return [0, 0, 0, 0];

  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a = "ff"] = h.split("").map(c => c + c);
      return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), parseInt(a, 16) / 255];
    }
    if (h.length === 6 || h.length === 8) {
      const n = parseInt(h.slice(0, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
    return null;
  }

  // rgb(r, g, b) / rgba(r, g, b, a) / rgb(r g b / a) - commas or spaces.
  m = /^rgba?\(\s*([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = v => v.endsWith("%") ? parseFloat(v) * 2.55 : parseFloat(v);
    const a = parts[3] === undefined ? 1 : (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]));
    return [ch(parts[0]), ch(parts[1]), ch(parts[2]), Number.isFinite(a) ? a : 1];
  }

  // color(srgb r g b / a) - Chromium's computed form for some values.
  m = /^color\(srgb\s+([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].replace("/", " ").split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const a = parts[3] === undefined ? 1 : parseFloat(parts[3]);
    return [parseFloat(parts[0]) * 255, parseFloat(parts[1]) * 255, parseFloat(parts[2]) * 255, Number.isFinite(a) ? a : 1];
  }

  return null;
}

const toLinear = c => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of an opaque `[r, g, b]`. */
export const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG 2.1 contrast ratio between two opaque colours, 1 to 21. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a translucent `[r, g, b, a]` over an opaque `[r, g, b]`.
 * A dimmed label is the ink at its opacity over whatever ground it sits on,
 * and that is the colour a reader actually sees.
 */
export function composite([r, g, b, a], [br, bg, bb]) {
  const k = Math.max(0, Math.min(1, a ?? 1));
  return [r * k + br * (1 - k), g * k + bg * (1 - k), b * k + bb * (1 - k)];
}

/** `#rrggbb` for a report line. */
export function toHex([r, g, b]) {
  return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
