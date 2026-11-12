/**
 * Areas of effect — reading a spell's Target line into a shape (07 §9).
 *
 * Pure functions, no Foundry imports. Turning the shape into a Scene Region is
 * `module/canvas/regions.mjs`'s job; this decides *what* shape the book asked
 * for, which is the half worth testing.
 *
 * **07 §9 defines the geometry and nothing here invents any of it:**
 *
 * > Distances are in feet and measured from the caster unless the entry says
 * > otherwise. A **radius** is measured out from a point in every direction, a
 * > **cone** spreads from you to the width of its length, and a **line** is
 * > five feet wide.
 *
 * So a cone's angle is fixed rather than chosen: at distance L the cone is L
 * wide, giving a half-angle of `atan(0.5)` and a full angle of about 53.13°.
 * That is the same cone D&D 5e draws, which is worth knowing but is not the
 * reason — the reason is the sentence above.
 */

/** 07 §9: a line is five feet wide. */
export const LINE_WIDTH_FT = 5;

/**
 * 07 §9: a cone spreads to the width of its length.
 *
 * Half-width `L/2` at distance `L` -> half-angle `atan(0.5)`. Stated as the
 * derivation rather than as `53.13` so it cannot drift from the sentence.
 */
export const CONE_ANGLE_DEGREES = 2 * Math.atan(0.5) * (180 / Math.PI);

/**
 * Where the shape is anchored.
 *
 *  - `self`   — on the caster. A circle moves with them if it lasts; a cone
 *               starts there and stays where it was aimed (D-723)
 *  - `point`  — somewhere the caster chooses
 *  - `target` — on another creature ("centered on one creature")
 *
 * Which clicks each of these asks for, and whether the Region follows a
 * token, is `rules/placement.mjs#placementSteps`.
 */
const ORIGINS = Object.freeze({ SELF: "self", POINT: "point", TARGET: "target" });

export { ORIGINS };

/**
 * `20 ft`, `100 ft` — the only distance form 07 uses — and a half foot, `7.5 ft`:
 * 14's *A 15-foot area* is a circle fifteen feet across (the lead's ruling on Q2,
 * D-809), so its radius is a half foot.
 */
const DISTANCE = /(\d+(?:\.5)?)\s*ft\b/i;

/**
 * **ONE SPACE ON THE GROUND** (07's Frozen Rune: *Target A point on the ground*, and
 * *The first creature to enter the space*; the B9a pass): a circle half of 05's
 * five-foot square across, centred on the space the caster picks
 * (`canvas/place.mjs#placeItemArea` puts the point at that space's centre), so a
 * creature entering the square enters it and one beside it does not.
 */
export const SPACE_RADIUS_FT = 2.5;

/**
 * Read a spell's Target line into an area, or `null` where the spell has no
 * area at all.
 *
 * **A single creature is not an area**, and neither is `Self`. Returning `null`
 * for those is what stops the sheet offering a placement tool for
 * `One creature`, which is 153 of the 406 spells.
 *
 * @param {string} target  The spell's `system.target`.
 * @returns {{shape: "circle"|"cone"|"line", distanceFt: number,
 *            widthFt?: number, angle?: number, origin: string} | null}
 */
export function areaFor(target) {
  if (typeof target !== "string") return null;
  const text = target.trim();
  if (!text) return null;

  // Frozen Rune's space (the B9a pass): the one Target line naming a point and no feet.
  if (/^A point on the ground$/i.test(text)) return { shape: "circle", distanceFt: SPACE_RADIUS_FT, origin: ORIGINS.POINT, space: true };

  const distance = text.match(DISTANCE);
  if (!distance) return null;
  const distanceFt = Number(distance[1]);
  if (!Number.isFinite(distanceFt) || distanceFt <= 0) return null;

  // "A 15 ft cone" — 07 §9: a cone spreads from you. It starts at the caster
  // and no entry places one anywhere else; which way it faces is the caster's
  // choice, and `rules/placement.mjs` asks for it (D-723).
  if (/\bcone\b/i.test(text)) {
    return {
      shape: "cone",
      distanceFt,
      angle: CONE_ANGLE_DEGREES,
      origin: ORIGINS.SELF
    };
  }

  // "A 20 ft line on the ground" — five feet wide, always. All five lines in
  // 07 are written *on the ground*, which is the same placed point a ground
  // circle is: the caster chooses where the line STARTS, then which way it
  // runs, and the entry fixes how long it is (D-723). A bare "A 30 ft line"
  // names no ground, so it keeps 07 §9's default and starts at the caster.
  if (/\bline\b/i.test(text)) {
    return {
      shape: "line",
      distanceFt,
      widthFt: LINE_WIDTH_FT,
      origin: /\bon the ground\b/i.test(text) ? ORIGINS.POINT : ORIGINS.SELF
    };
  }

  // "A wall up to 30 ft long" (07 §12's Sandwall, D-864): a line the caster places,
  // five feet thick as 07 writes it, starting where they choose.
  if (/\bwall\b/i.test(text)) {
    return { shape: "line", distanceFt, widthFt: LINE_WIDTH_FT, origin: ORIGINS.POINT, wall: true };
  }

  // "A 20 ft radius", "... on the ground", "... centered on you",
  // "... centered on one creature", and the `within N ft` forms, which are the
  // same circle written as a rule about who it catches.
  if (/\bradius\b/i.test(text) || /\bwithin\b/i.test(text)) {
    return { shape: "circle", distanceFt, origin: originOf(text) };
  }

  return null;
}

/**
 * **AN AREA WHOSE SIZE IS THE CASTER'S INTELLIGENCE** (07 §12's Time Trap, D-864; the
 * lead: *"5ft x intelligence modifier"*, the radius the orchestrator's reading): *You lay
 * a glyph with a radius of 5 feet times your Intelligence modifier.* The glyph is a circle
 * about the point placed, its radius worked out at the cast; a modifier under 1 gives the
 * glyph its one space. `isIntScaled` answers whether an entry's area is sized so - the card's
 * Place area then lays the glyph the cast worked out (`flags.area`), never the Target line's
 * one space (the sweep's stage 2, D-891).
 *
 * @param {string} effectText
 */
export function isIntScaled(effectText) {
  return /\bwith a radius of (\d+) feet times your Intelligence modifier\b/.test(String(effectText ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

/**
 * The glyph itself: the area to place, or the area it was handed (see above).
 *
 * @param {object|null} area  `areaFor(target)`
 * @param {string} effectText
 * @param {number} intMod  the caster's Intelligence modifier
 */
export function intScaledArea(area, effectText, intMod = 0) {
  const m = /\bwith a radius of (\d+) feet times your Intelligence modifier\b/.exec(String(effectText ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
  if (!m || !area) return area;
  const n = Math.max(0, Math.trunc(Number(intMod)) || 0);
  if (n < 1) return area;
  return { shape: "circle", distanceFt: Number(m[1]) * n, origin: ORIGINS.POINT };
}

/**
 * Where 07's phrasing anchors the shape.
 *
 * **`on the ground` is a placed point, not the caster.** Twenty-three spells
 * say `A 20 ft radius on the ground` and three say `centered on you`; treating
 * them alike would drop every ground-targeted spell onto the caster.
 */
function originOf(text) {
  if (/centered on (?:you|yourself)\b/i.test(text)) return ORIGINS.SELF;
  if (/centered on\b/i.test(text)) return ORIGINS.TARGET;
  if (/\bon the ground\b/i.test(text)) return ORIGINS.POINT;
  if (/of a point you can see\b/i.test(text)) return ORIGINS.POINT;
  // "Each ally within 15 ft" — 07 §9 measures from the caster unless the entry
  // says otherwise, and this entry does not.
  if (/\bwithin\b/i.test(text)) return ORIGINS.SELF;
  return ORIGINS.POINT;
}

/**
 * Does this area catch everyone in it, or does the spell pick?
 *
 * 07 §9: *An area spell catches everything inside it, allies included, unless
 * its entry says it picks its targets.* The `Each ally within` forms are the
 * entries that say so.
 */
export function picksTargets(target) {
  if (typeof target !== "string") return false;

  // "Any number of creatures within 30 ft" - the caster chooses outright.
  if (/\bany number of\b/i.test(target)) return true;

  // "Each ally within 15 ft", "Each undead creature within 30 ft" - the entry
  // names WHO it catches. A bare "each creature" names nobody and so catches
  // everything, which is 07 SS9's default rather than its exception.
  const each = target.match(/\beach\s+([a-z]+)/i);
  if (each && each[1].toLowerCase() !== "creature") return true;

  return false;
}

/**
 * The area's longest reach in feet, for range checking and for deciding
 * whether a placement even fits.
 */
export function reachOf(area) {
  if (!area) return 0;
  return area.distanceFt;
}

/**
 * An area whose RADIUS a talent widens (D-756): 04's Consecrated Ground at
 * rank 2 - *its radius is 10 feet wider* - Psychic Scream's, Void Eruption's.
 *
 * **A circle alone has a radius.** A cone's length and a line's are not what
 * any of 04's sentences names, so every other shape, and no area at all, comes
 * back exactly as it was handed in. A widening of nothing, or of less than
 * nothing, is no widening. A new object: `areaFor`'s is never written to.
 *
 * @param {object|null} area  `areaFor`'s shape
 * @param {number} feet       how many feet wider
 * @returns {object|null}
 */
export function widenArea(area, feet = 0) {
  const by = Math.trunc(Number(feet)) || 0;
  if (!area || area.shape !== "circle" || by <= 0) return area;
  return { ...area, distanceFt: area.distanceFt + by };
}

/**
 * A CONE OR A LINE a talent makes LONGER (04's Cone of Cold: *Each rank adds 5 feet
 * to the cone*; D-775) - the length `widenArea` leaves alone, because 04 names the
 * two apart: a circle's radius is widened, a cone's or a line's length lengthened.
 * A circle, no area and a lengthening of nothing come back as they were handed in.
 * A new object: `areaFor`'s is never written to.
 *
 * @param {object|null} area  `areaFor`'s shape
 * @param {number} feet
 * @returns {object|null}
 */
export function lengthenArea(area, feet = 0) {
  const by = Math.trunc(Number(feet)) || 0;
  if (!area || (area.shape !== "cone" && area.shape !== "line") || by <= 0) return area;
  return { ...area, distanceFt: area.distanceFt + by };
}

/**
 * **AN AREA'S OWN WORDS, WIDENED** (04's Empowered Mending: *Your Mass Mend class
 * feature reaches 10 feet further per rank*; D-774): the first distance the
 * words carry, raised by the feet, where `areaFor` reads them as a circle - so a
 * patched feature's stamp says the wider circle and the card's Place area draws
 * it. A cone, a line, words with no distance and a widening of nothing come back
 * as they were handed in, `widenArea`'s rule.
 *
 * @param {string} text  e.g. "Each ally within 20 ft"
 * @param {number} feet
 * @returns {string}
 */
export function widenAreaText(text, feet = 0) {
  const by = Math.trunc(Number(feet)) || 0;
  if (typeof text !== "string" || by <= 0 || areaFor(text)?.shape !== "circle") return text;
  return text.replace(DISTANCE, (whole, n) => whole.replace(n, String(Number(n) + by)));
}
