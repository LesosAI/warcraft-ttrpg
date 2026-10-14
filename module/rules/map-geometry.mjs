/**
 * Where a region sits on the plate (D-680). Pure, no Foundry imports and no
 * canvas (CLAUDE.md §3) — everything here takes plain typed arrays, so the
 * whole partition is testable in Node against a nine-pixel picture.
 *
 * **The plates draw no region borders**, and the ones they imply are a
 * different setting's. So a region is not traced: it is a SEED POINT, and the
 * ground goes to whichever seed is nearest — a Voronoi partition, masked to
 * the land so the sea is never coloured and the coastline is the plate's own,
 * pixel for pixel, rather than something anybody had to draw.
 *
 * That trades 49 hand-drawn outlines for 49 dragged points, and it is the
 * whole reason the boundary work is an afternoon rather than a week. Where a
 * seed gives the wrong answer — a long region wrapping a short one, an island
 * closer to the mainland's seed than its own — `region-shapes.json` takes an
 * explicit polygon in `shapes` and that wins over the seed.
 *
 * **The sea is sampled, never hardcoded.** The reference colour comes off the
 * plate's own corners, which are open water on both, so a plate swapped for a
 * better one needs no threshold retuned.
 */

/**
 * How far a pixel may sit from the sampled sea colour and still be sea.
 *
 * **The reference is the deep ocean and the coast is not that colour.** It is
 * averaged off the plate's corners, which are open water at its darkest; the
 * bright teal shelf ringing every coastline sits about 90 away from it. At 62
 * that whole shelf read as territory, so the mask came back with a fringe of
 * land around each island and speckle scattered across the water wherever the
 * upscaled art marbled — 41,107 land components on a plate holding about a
 * dozen landmasses.
 *
 * It can be raised much further than it looks, because `SEA_BLUE_BIAS` refuses
 * anything redder than it is blue whatever the distance: forest at (90,120,60)
 * is 109 from the reference and is rejected on the bias, not the tolerance.
 * The plate's land fraction falls steeply from 62 to 90 as the shelf goes and
 * then flattens — 30.6%, 23.7%, 22.0%, 21.0% at 62/90/110/130 — and the mask
 * was rendered at each. 110 is the knee: the shelf is water and the coastline
 * is still crisp, where 130 has begun to nibble it.
 */
export const SEA_TOLERANCE = 110;

/** Sea is never redder than it is blue. Guards sunlit rock against the mask. */
export const SEA_BLUE_BIAS = -6;

/**
 * A speck of land smaller than this fraction of the plate is noise.
 *
 * **The colour test alone is not enough on good art.** The 828px plates had a
 * flat, JPEG-smeared ocean that a single reference colour covered; the 3264px
 * upscales have a marbled one, and its lighter passages read as territory.
 * The mask came back as 41,107 land components where the Eastern Kingdoms
 * hold about a dozen landmasses — 40,760 of them under 200 pixels, scattered
 * across open water, each one given to a region and ringed in its border.
 * Nothing in the unit tests could see it; it is only visible in a picture of
 * the mask.
 *
 * The tolerance is what fixes the cause; this mops up what survives it. It is
 * deliberately LOW — 852 pixels of the Eastern Kingdoms plate — because the
 * Isle of Quel'Danas is a region of the book on 1,771 pixels of ground, and a
 * threshold set to catch the largest speck would take the island with it.
 */
export const MIN_ISLAND = 0.00004;

/**
 * An ENCLOSED body of water smaller than this fraction of the plate is a hole
 * in the mask, not a lake.
 *
 * **Much larger than `MIN_ISLAND`, and deliberately so.** The two jobs are not
 * symmetrical: a speck in the ocean is either noise or an island, and islands
 * can be tiny, but a pocket of water with no way out to the sea in the middle
 * of a continent is almost always the darkest forest reading close to the
 * deep-ocean reference. Filling everything under 0.05% of the plate clears the
 * northern highlands of both continents and still leaves every lake the plates
 * actually draw — the biggest are 0.31% and 0.38%, six times the threshold.
 *
 * Both were chosen by rendering the mask at four values and looking at it.
 */
export const MIN_LAKE = 0.0005;

/**
 * The plate's own water colour, averaged over its four corners.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {number} [inset]  How far in from each corner to sample, in pixels.
 * @returns {{r: number, g: number, b: number}}
 */
export function seaReference({ data, width, height }, patch = 5) {
  // A PATCH IN THE CORNER, NEVER AN INSET. Insetting a fixed distance walks
  // inland on a small plate — on a six-pixel test picture it lands on the
  // island itself, and the reference then reads the LAND colour, which
  // inverts the whole mask into a map that colours the ocean.
  const side = Math.max(1, Math.min(patch, Math.floor(Math.min(width, height) / 4)));
  const corners = [[0, 0], [width - side, 0], [0, height - side], [width - side, height - side]];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + side; y++) {
      for (let x = cx; x < cx + side; x++) {
        const i = ((y * width) + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

/** Whether one pixel reads as open water. */
export function isSea(r, g, b, ref, tolerance = SEA_TOLERANCE) {
  if (b - r < SEA_BLUE_BIAS) return false;
  const dr = r - ref.r;
  const dg = g - ref.g;
  const db = b - ref.b;
  return (dr * dr + dg * dg + db * db) <= tolerance * tolerance;
}

/**
 * Which pixels are ground. 1 is land, 0 is sea or excluded.
 *
 * `exclude` carries the plate's own furniture in normalised rectangles — its
 * faction legend is drawn on parchment, which is nothing like water and would
 * otherwise be painted as territory in the corner of the map.
 *
 * **It cleans by default**, because all three callers want a clean mask and a
 * caller that forgets is a caller that draws confetti (`cleanMask`). Pass
 * `keep` so a seeded island survives the filter; pass `clean: false` only to
 * look at what the colour test alone decided.
 *
 * @returns {Uint8Array} one byte a pixel, row-major.
 */
export function landMask({ data, width, height }, {
  exclude = [], tolerance = SEA_TOLERANCE, clean = true, keep = [],
  minIsland = MIN_ISLAND, minLake = MIN_LAKE
} = {}) {
  const ref = seaReference({ data, width, height });
  const mask = new Uint8Array(width * height);
  const boxes = exclude.map(e => ({
    x0: Math.floor(e.x * width),
    y0: Math.floor(e.y * height),
    x1: Math.ceil((e.x + e.w) * width),
    y1: Math.ceil((e.y + e.h) * height)
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (boxes.some(bx => x >= bx.x0 && x < bx.x1 && y >= bx.y0 && y < bx.y1)) continue;
      const i = p * 4;
      if (!isSea(data[i], data[i + 1], data[i + 2], ref, tolerance)) mask[p] = 1;
    }
  }
  return clean ? cleanMask(mask, width, height, { minIsland, minLake, keep }) : mask;
}

/**
 * Label a mask's four-connected components.
 *
 * ITERATIVE, never recursive: a 21-megapixel plate is one component of five
 * million pixels and a recursive flood fill blows the stack on it.
 *
 * @param {Uint8Array} mask
 * @param {number} want  which value to group — 1 for land, 0 for sea
 * @returns {{label: Int32Array, sizes: number[]}} -1 where the pixel is not `want`
 */
function components(mask, width, height, want) {
  const label = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== want || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0 && mask[i - 1] === want && label[i - 1] === -1) { label[i - 1] = id; stack[top++] = i - 1; }
      if (x < width - 1 && mask[i + 1] === want && label[i + 1] === -1) { label[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && mask[i - width] === want && label[i - width] === -1) { label[i - width] = id; stack[top++] = i - width; }
      if (y < height - 1 && mask[i + width] === want && label[i + width] === -1) { label[i + width] = id; stack[top++] = i + width; }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/**
 * Drop specks of land and fill pinholes of sea.
 *
 * Two passes, islands first — dropping a speck can only open sea, which lets
 * a hole it was plugging join the ocean and be judged on its merits.
 *
 * **A component holding one of `keep` is never dropped, whatever its size.**
 * The Isle of Quel'Danas is 1,771 pixels of a 21-megapixel plate, well inside
 * the confetti band, and it is a region of the book with a seed on it. The
 * threshold decides what is noise; a seed decides what is a place.
 *
 * A hole is only filled when it is ENCLOSED. An inlet open to the ocean
 * reaches the plate's edge through the water and is left alone, so a bay is
 * never quietly turned into ground.
 *
 * @param {Uint8Array} mask  modified in place and returned
 * @param {object} [options]
 * @param {number} [options.minIsland]  fraction of the plate below which a speck of land is noise
 * @param {number} [options.minLake]  fraction below which enclosed water is a hole in the mask
 * @param {Array<{x: number, y: number}>} [options.keep]  normalised points whose land survives
 */
export function cleanMask(mask, width, height, {
  minIsland = MIN_ISLAND, minLake = MIN_LAKE, keep = []
} = {}) {
  const islandFloor = Math.floor(minIsland * width * height);
  const lakeFloor = Math.floor(minLake * width * height);
  if (islandFloor < 1 && lakeFloor < 1) return mask;

  const land = components(mask, width, height, 1);
  const spared = new Set();
  for (const point of keep) {
    const x = Math.round(point.x * (width - 1));
    const y = Math.round(point.y * (height - 1));
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const id = land.label[(y * width) + x];
    if (id >= 0) spared.add(id);
  }
  for (let i = 0; i < mask.length; i++) {
    const id = land.label[i];
    if (id >= 0 && land.sizes[id] < islandFloor && !spared.has(id)) mask[i] = 0;
  }

  const sea = components(mask, width, height, 0);
  const open = new Set();
  for (let x = 0; x < width; x++) {
    if (sea.label[x] >= 0) open.add(sea.label[x]);
    const bottom = ((height - 1) * width) + x;
    if (sea.label[bottom] >= 0) open.add(sea.label[bottom]);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    if (sea.label[left] >= 0) open.add(sea.label[left]);
    const right = left + width - 1;
    if (sea.label[right] >= 0) open.add(sea.label[right]);
  }
  for (let i = 0; i < mask.length; i++) {
    const id = sea.label[i];
    if (id >= 0 && !open.has(id) && sea.sizes[id] < lakeFloor) mask[i] = 1;
  }

  return mask;
}

/**
 * The nearest seed to a normalised point, by squared distance.
 * @param {number} x  0 to 1
 * @param {number} y  0 to 1
 * @param {Array<{key: string, x: number, y: number}>} seeds
 * @returns {number} the seed's index, or -1 where there are none.
 */
export function nearestSeed(x, y, seeds) {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < seeds.length; i++) {
    const dx = x - seeds[i].x;
    const dy = y - seeds[i].y;
    const d = (dx * dx) + (dy * dy);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * Give every land pixel to a seed. Sea and excluded ground carry -1.
 *
 * Distances are measured in NORMALISED space rather than pixels, so a plate
 * that is twice as tall as it is wide does not stretch its regions — the seeds
 * are stored normalised and mean the same thing on any plate.
 *
 * @returns {Int16Array} one seed index a pixel, row-major.
 */
export function assignOwners({ width, height, land, seeds }) {
  const owners = new Int16Array(width * height).fill(-1);
  if (!seeds.length) return owners;
  for (let y = 0; y < height; y++) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!land[p]) continue;
      owners[p] = nearestSeed((x + 0.5) / width, ny, seeds);
    }
  }
  return owners;
}

/**
 * The pixels where one region meets another, or meets the sea.
 *
 * D5 §8 and D-608: colour is never the only carrier, so a region is edged as
 * well as tinted and the edge is what survives at a glance and in greyscale.
 *
 * @returns {Uint8Array} 1 on a border pixel.
 */
export function borderMask(owners, width, height, thickness = 1) {
  const edges = new Uint8Array(width * height);
  const t = Math.max(1, Math.round(thickness));

  // A ONE-PIXEL BORDER DISAPPEARS. The plate is drawn at a fraction of its
  // natural size, so a single source pixel is sub-pixel on screen and the
  // partition reads as nothing at all on the darker plate.
  //
  // FIND THE SEAM, THEN WIDEN IT. Testing every pixel's whole neighbourhood is
  // O(pixels x thickness squared) — fine at 2 on an 828px plate and six
  // billion operations at 8 on a 3264px one, which is the width the same rule
  // asks for once the plate is four times the size. The seam itself is a
  // perimeter, a fraction of a per cent of the plate, so widening it costs
  // almost nothing.
  //
  // The two are the same set. A pixel has a different owner within Chebyshev
  // distance t exactly when it lies within t-1 of a pixel whose immediate
  // neighbour differs: walk the straight path to the offending pixel and some
  // step along it changes owner, and that step is at most t-1 away.
  const seam = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width) + x;
      const mine = owners[p];
      const left = x > 0 ? owners[p - 1] : -1;
      const right = x < width - 1 ? owners[p + 1] : -1;
      const up = y > 0 ? owners[p - width] : -1;
      const down = y < height - 1 ? owners[p + width] : -1;
      // The diagonals matter: a corner where three regions meet is a seam the
      // four-neighbour test walks straight past.
      const ul = (x > 0 && y > 0) ? owners[p - width - 1] : -1;
      const ur = (x < width - 1 && y > 0) ? owners[p - width + 1] : -1;
      const dl = (x > 0 && y < height - 1) ? owners[p + width - 1] : -1;
      const dr = (x < width - 1 && y < height - 1) ? owners[p + width + 1] : -1;
      if (left !== mine || right !== mine || up !== mine || down !== mine
        || ul !== mine || ur !== mine || dl !== mine || dr !== mine) seam.push(p);
    }
  }

  const r = t - 1;
  for (const p of seam) {
    const x = p % width;
    const y = (p - x) / width;
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(width - 1, x + r);
    for (let qy = y0; qy <= y1; qy++) {
      const row = qy * width;
      for (let qx = x0; qx <= x1; qx++) {
        // The sea is never inked, however close the seam runs.
        if (owners[row + qx] >= 0) edges[row + qx] = 1;
      }
    }
  }
  return edges;
}

/**
 * The bounding box of every region's ground, indexed by seed.
 *
 * Lighting the region under the cursor means repainting it on every mouse
 * move, and a plate is over a million pixels — far too many to walk per frame.
 * A region is a few per cent of that, so the paint is limited to its own box.
 *
 * @returns {Array<{x0: number, y0: number, x1: number, y1: number}|null>}
 *   one box a seed, or null where the seed holds no ground at all.
 */
export function regionBounds(owners, count, width, height) {
  const boxes = Array.from({ length: count }, () => ({
    x0: Infinity, y0: Infinity, x1: -1, y1: -1
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const owner = owners[(y * width) + x];
      if (owner < 0) continue;
      const b = boxes[owner];
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
  }
  return boxes.map(b => (b.x1 < 0 ? null : b));
}

/** Which region a normalised point falls in, or -1. */
export function ownerAtPoint(owners, width, height, x, y) {
  const px = Math.floor(x * width);
  const py = Math.floor(y * height);
  if (px < 0 || py < 0 || px >= width || py >= height) return -1;
  return owners[py * width + px];
}

/**
 * How much ground each seed ended up with, as a share of the land.
 *
 * The one number that says a seed is misplaced without anybody looking at the
 * map: a region holding none of the plate is a seed that has landed in the sea
 * or inside another region's ground, and a region holding a third of a
 * continent is a seed with no neighbours to bound it.
 *
 * @returns {Array<{key: string, pixels: number, share: number}>}
 */
export function areaShares(owners, seeds) {
  const counts = new Array(seeds.length).fill(0);
  let total = 0;
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];
    if (owner < 0) continue;
    counts[owner]++;
    total++;
  }
  return seeds.map((seed, i) => ({
    key: seed.key,
    pixels: counts[i],
    share: total ? counts[i] / total : 0
  }));
}
