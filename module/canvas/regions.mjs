/**
 * Areas of effect as Scene Regions (D2 §5, V14).
 *
 * **`MeasuredTemplate` was deleted in V14** — the first core document type ever
 * removed — so there is nothing to port and this is written against Regions
 * from the start. `module/rules/areas.mjs` decides what shape 07 §9 asked for;
 * this places it.
 *
 * The shape data was read off core's own `BaseRegion._migrateMeasuredTemplateData`
 * (`common/documents/region.mjs`), which is the authority on what a V14 shape
 * looks like because it is what core writes when it converts a V13 world.
 *
 * **Shapes are measured in PIXELS, not in feet.** `distancePixels = grid.size /
 * grid.distance`, so a 20-foot radius on a 100px/5ft grid is 400. Passing feet
 * straight through draws an area a twentieth of its proper size, which looks
 * like a rendering bug rather than a units bug.
 */

import { areaFor, lengthenArea, picksTargets, widenArea } from "../rules/areas.mjs";
import { placementSteps } from "../rules/placement.mjs";

/** Feet -> pixels for a given scene's grid. */
export function pixelsPerFoot(scene) {
  const grid = scene?.grid;
  if (!grid?.size || !grid?.distance) return 1;
  return grid.size / grid.distance;
}

/**
 * Build the V14 shape for an area at a point.
 *
 * @param {object} area              From `areaFor`.
 * @param {{x: number, y: number}} origin  Where it sits, in pixels.
 * @param {number} scale             Pixels per foot.
 * @param {number} [rotation]        Facing in degrees, for a cone or a line.
 */
export function shapeFor(area, origin, scale, rotation = 0) {
  const { x, y } = origin;
  const radius = area.distanceFt * scale;

  switch (area.shape) {
    case "circle":
      return { type: "circle", x, y, radius, gridBased: false };

    case "cone":
      // 07 §9 fixes the angle: a cone spreads to the width of its length.
      // `round` matches how core migrates a template on a gridless scene.
      return {
        type: "cone", x, y, radius,
        angle: area.angle, rotation, curvature: "round", gridBased: false
      };

    case "line":
      return {
        type: "line", x, y,
        length: radius,
        width: (area.widthFt ?? 5) * scale,
        rotation, gridBased: false
      };

    default:
      return null;
  }
}

/**
 * The full Region document data for a spell's area.
 *
 * @param {object} options
 * @param {Item} options.spell            The spell being cast.
 * @param {Scene} options.scene           Where it is going.
 * @param {{x: number, y: number}} options.origin  In pixels.
 * @param {Token|TokenDocument} [options.token]  The caster's token, or the
 *   token an attached area is drawn on. Either shape is read.
 * @param {number} [options.rotation]     Facing, for a cone or a line.
 * @param {string} [options.title]        The Region's whole name, where the
 *   caller says it in its own words — a totem's aura is
 *   *Stoneskin Totem (30 ft radius)* through `AZEROTH.Totem.AuraName`
 *   (D-708). Without one the name is composed here, as it always was.
 * @param {boolean|null} [options.attach] Whether the Region follows `token`.
 *   Left out, the placement law decides (`rules/placement.mjs`, D-723): only
 *   a circle centred on the caster attaches. `placeItemArea` passes the
 *   law's own answer.
 * @param {object|null} [options.flags]   More `azeroth-rpg` flags for the
 *   Region, written UNDER the three this function owns: `area`, `spellUuid`
 *   and `picks` are read off the area itself and always win.
 * @param {number} [options.widenFt]      Feet a talent adds to a circle's
 *   radius (D-756): Consecrated Ground at rank 2 places *(30 ft circle)*.
 *   The `area` flag is the widened one, so everything reading it agrees.
 * @param {number} [options.lengthenFt]   Feet a talent adds to a cone's or a
 *   line's length (D-775: Cone of Cold's 5 a rank), through
 *   `rules/areas.mjs#lengthenArea`.
 * @returns {object|null}  Region data, or null where the spell has no area.
 */
export function regionDataFor({ spell = null, item = null, areaText = null, name = null, color = null, scene, origin, token = null, rotation = 0, title = null, attach = null, flags = null, widenFt = 0, lengthenFt = 0 }) {
  // A spell's Target line, a feature's area (D-616), or a bare measurement
  // from the Measure control - one grammar, `areaFor`, for all three.
  const source = spell ?? item;
  const area = lengthenArea(widenArea(areaFor(areaText ?? source?.system?.target ?? ""), widenFt), lengthenFt);
  if (!area) return null;
  const label = name ?? source?.name ?? "";

  const scale = pixelsPerFoot(scene);
  const shape = shapeFor(area, origin, scale, rotation);
  if (!shape) return null;

  // "Centered on you" follows the caster. Attaching the Region to the token is
  // what makes that true for a lasting spell rather than only at the moment it
  // was cast — a V14 Region moves with the token it is attached to.
  //
  // **AND IT ROTATES WITH IT, which is why only a circle attaches** (D-723). A
  // cone spreads from the caster but is aimed at the ground: attached, an
  // Instant cone swings round and walks off wherever the caster goes next.
  // The token is still handed over for a cone, for its elevation below.
  //
  // WRITE AN ID, READ A DOCUMENT. `RegionDocument` replaces
  // `attachment.token` with the resolved TokenDocument on initialize
  // (client/documents/region.mjs:174) despite the schema's `idOnly: true`, so
  // a live region's `attachment.token` is a document and the stored id is at
  // `_source.attachment.token`.
  const follows = attach ?? placementSteps(area, { hasToken: Boolean(token) })?.attach ?? false;
  const attachedTo = follows && token ? token.id : null;

  // A caller's own record — a measured area's mark, what cast placed it —
  // goes on first, and the three keys read off the area go on over it, so no
  // caller can write an `area` the shape does not have.
  const extra = flags && typeof flags === "object" && !Array.isArray(flags) ? flags : {};

  return {
    name: title ?? `${label} (${area.distanceFt} ft ${area.shape})`,
    color: color ?? schoolColor(source?.system?.school),
    shapes: [shape],
    // A PLACEABLE or a DOCUMENT. `placeItemArea` hands over the caster's
    // placeable Token; a totem's aura is drawn on a TokenDocument that was
    // created a line earlier and has no placeable yet (D-708).
    elevation: { bottom: token?.document?.elevation ?? token?.elevation ?? 0, top: null },
    levels: [],
    // An area of effect marks ground; it does not wall anybody out. A spell
    // that blocks movement says so in its own text and gets a behavior.
    restriction: { enabled: false, type: "move", priority: 0 },
    attachment: { token: attachedTo },
    behaviors: [],
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "coverage",
    displayMeasurements: true,
    hidden: false,
    locked: false,
    flags: {
      "azeroth-rpg": {
        ...extra,
        area,
        spellUuid: source?.uuid ?? null,
        // 07 §9: an area catches everything inside it, allies included, unless
        // the entry says it picks. The chat card reads this to decide whether
        // to offer "apply to everyone in the area".
        picks: picksTargets(areaText ?? source?.system?.target ?? "")
      }
    }
  };
}

/**
 * Place a spell's area on the scene, returning the created Region. Takes
 * everything `regionDataFor` takes, `attach` and `flags` included.
 */
export async function placeArea(options) {
  const data = regionDataFor(options);
  if (!data) return null;
  const [region] = await options.scene.createEmbeddedDocuments("Region", [data]);
  return region;
}

/**
 * The school's colour, so a Fire area does not look like a Frost one.
 *
 * **There is no school palette anywhere else in the system to key to** —
 * `styles/_tokens.scss` carries the faction and corruption colours only, and
 * D11 §7 does not reach the canvas. These are new, and Fel matches
 * `--azeroth-fel` so the one school that does have a token agrees with it.
 * If D11 grows a school palette, this should read from it rather than stay a
 * second copy.
 *
 * Exported for the aim preview (`canvas/place.mjs#pickFacing`), which draws
 * in the colour the Region will be.
 */
export function schoolColor(school) {
  const palette = {
    fire: "#c1440e", frost: "#4a90d9", arcane: "#7e57c2",
    holy: "#e0c060", shadow: "#4a2d5c", nature: "#4c9a2a", fel: "#6dbf2e"
  };
  return palette[school] ?? "#8b1a1a";
}
