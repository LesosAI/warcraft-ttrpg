/**
 * **07 §12's SANDWALL BLOCKS SIGHT** (O-267, built in the 2a fix stage): *A wall of whirling sand
 * up to 30 feet long, 10 feet high and 5 feet thick rises where you choose. It blocks sight.* The
 * placed line (`rules/placement.mjs`' `line`, five feet thick) raises one Wall along its long
 * axis that blocks sight and nothing else - movement through it is its Difficult ground's, light
 * and sound pass - and the Wall goes with the Region. Pure: no Foundry imports (CLAUDE.md §3).
 *
 * `canvas/sand-walls.mjs` is the writer, on the active GM's client (only a GM may create a Wall),
 * through `sustained-areas.mjs`' one queue.
 */

/** The flag a Sandwall's Wall carries: the id of the Region it stands in. */
export const SAND_WALL_FLAG = "sandwall";

/** A whole pixel. */
const px = v => Math.round(Number(v));

/**
 * **THE SEGMENTS A PLACED AREA'S SHAPES RAISE**: a four-cornered polygon - the placed line, laid
 * `start-left, end-left, end-right, start-right` - raises its long axis, from the middle of its
 * short start edge to the middle of its short end edge; any other polygon raises each of its
 * edges. A rectangle shape (a Region a GM drew) is read as its four corners. A segment of no
 * length is none.
 *
 * @param {Array<{type?: string, points?: number[], x?: number, y?: number, width?: number, height?: number}>} shapes
 * @returns {Array<[number, number, number, number]>}
 */
export function wallSegments(shapes = []) {
  const out = [];
  const push = (x0, y0, x1, y1) => {
    const c = [px(x0), px(y0), px(x1), px(y1)];
    if (c.some(v => !Number.isFinite(v)) || (c[0] === c[2] && c[1] === c[3])) return;
    out.push(c);
  };
  for (const shape of shapes ?? []) {
    // **v14's OWN LINE SHAPE** (the sweep's stage 2, D-891; 14.367 `client/data/shapes.mjs`
    // `LineShapeData`: its axis runs `length` pixels from `x, y` at `rotation` degrees): what
    // `canvas/regions.mjs#shapeFor` places for a line. Only a polygon was read here, so a
    // Sandwall placed from its card raised no Wall at all; the batch that proved the Wall drew
    // a polygon by hand.
    if (shape?.type === "line") {
      const r = (Number(shape.rotation) || 0) * Math.PI / 180;
      const len = Number(shape.length) || 0;
      push(shape.x, shape.y, Number(shape.x) + len * Math.cos(r), Number(shape.y) + len * Math.sin(r));
      continue;
    }
    let pts = null;
    if (shape?.type === "polygon" && Array.isArray(shape.points)) pts = shape.points.map(Number);
    else if (shape?.type === "rectangle") {
      const { x = 0, y = 0, width = 0, height = 0 } = shape;
      pts = [x, y, x + width, y, x + width, y + height, x, y + height].map(Number);
    }
    if (!pts || pts.length < 6 || pts.length % 2) continue;
    const corners = pts.length / 2;
    if (corners === 4) {
      const len = (a, b) => Math.hypot(pts[2 * a] - pts[2 * b], pts[2 * a + 1] - pts[2 * b + 1]);
      // The long axis runs between the midpoints of the two SHORT edges.
      const shortFirst = len(0, 3) <= len(0, 1);
      const [a0, a1, b0, b1] = shortFirst ? [0, 3, 1, 2] : [0, 1, 3, 2];
      push((pts[2 * a0] + pts[2 * a1]) / 2, (pts[2 * a0 + 1] + pts[2 * a1 + 1]) / 2,
        (pts[2 * b0] + pts[2 * b1]) / 2, (pts[2 * b0 + 1] + pts[2 * b1 + 1]) / 2);
      continue;
    }
    for (let i = 0; i < corners; i++) {
      const j = (i + 1) % corners;
      push(pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]);
    }
  }
  return out;
}

/**
 * **ONE WALL'S CREATE DATA**: blocks sight (`sense.NORMAL`), and nothing else (`sense.NONE` for
 * movement, light and sound), flagged with its Region.
 *
 * @param {number[]} c  `[x0, y0, x1, y1]`
 * @param {string} regionId
 * @param {{NONE: number, NORMAL: number}} sense  core's `CONST.EDGE_SENSE_TYPES`
 * @param {number} moveNone  core's `CONST.WALL_MOVEMENT_TYPES.NONE`
 */
export function sandWallData(c, regionId, sense, moveNone) {
  return { c: [...c], sight: sense.NORMAL, light: sense.NONE, sound: sense.NONE, move: moveNone, flags: { "azeroth-rpg": { [SAND_WALL_FLAG]: regionId } } };
}

/**
 * **WHICH WALLS TO RAISE AND WHICH TO TAKE DOWN ON ONE SCENE**: each sight-blocking area's
 * segments, against the Walls flagged for it. An area whose Walls already stand where its shape
 * says keeps them; one whose shape moved has them replaced; a Wall whose area is gone goes.
 *
 * @param {Array<{id: string, segments: number[][]}>} areas  the scene's standing Sandwalls
 * @param {Array<{id: string, region: string, c: number[]}>} walls  the scene's flagged Walls
 * @returns {{create: Array<{region: string, c: number[]}>, remove: string[]}}
 */
export function diffSandWalls(areas = [], walls = []) {
  const create = [];
  const remove = [];
  const key = c => (c ?? []).map(v => Math.round(Number(v))).join(",");
  const byRegion = new Map();
  for (const w of walls ?? []) byRegion.set(w.region, [...(byRegion.get(w.region) ?? []), w]);
  const kept = new Set();
  for (const area of areas ?? []) {
    kept.add(area.id);
    const have = byRegion.get(area.id) ?? [];
    const want = (area.segments ?? []).map(key).sort();
    const got = have.map(w => key(w.c)).sort();
    if (want.length === got.length && want.every((k, i) => k === got[i])) continue;
    remove.push(...have.map(w => w.id));
    for (const c of area.segments ?? []) create.push({ region: area.id, c: [...c] });
  }
  for (const [region, have] of byRegion) if (!kept.has(region)) remove.push(...have.map(w => w.id));
  return { create, remove: [...new Set(remove)].sort() };
}
