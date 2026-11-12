/**
 * **07 §12's SANDWALL, ITS WALLS** (O-267, the 2a fix stage): *It blocks sight.* A Region placed
 * from a Sandwall card carries `blocksSight` (`dice/chat.mjs#regionFlagsFromCard`); this raises one
 * Wall along its long axis that blocks sight and nothing else (`rules/sand-walls.mjs`), and takes it
 * down when the Region goes - the Sustain ended, the area swept, a GM's delete. Only a GM may create
 * a Wall, so it runs on the active GM's client alone (`sustained-areas.mjs#isWriter`), one pass at
 * a time, diffed so an unchanged scene writes nothing.
 *
 * Verified against 14.367: `common/documents/wall.mjs` (`c` is four integers; `sight`, `light` and
 * `sound` take `CONST.EDGE_SENSE_TYPES`, `move` takes `CONST.WALL_MOVEMENT_TYPES`; v14 made the
 * old wall sense constant a deprecated proxy, and it is never read here).
 */

import { SAND_WALL_FLAG, diffSandWalls, sandWallData, wallSegments } from "../rules/sand-walls.mjs";
import { isWriter } from "./sustained-areas.mjs";
import { sceneInWorld } from "./in-world.mjs";

const SCOPE = "azeroth-rpg";

let CHAIN = Promise.resolve();

/** One pass at a time: a pass reads the scene as the last one left it. */
function serial(task) {
  const next = CHAIN.then(task, task);
  CHAIN = next.catch(() => 0);
  return next;
}

/** The scene's standing sight-blocking areas, each with the segments its shape raises. */
function sandwallsOn(scene) {
  return [...(scene?.regions ?? [])]
    .filter(r => r.flags?.[SCOPE]?.cast && r.flags[SCOPE].blocksSight === true)
    .map(r => ({ id: r.id, segments: wallSegments((r.shapes ?? []).map(s => (typeof s.toObject === "function" ? s.toObject() : s))) }));
}

/** The scene's Walls a Sandwall raised. */
function flaggedWalls(scene) {
  return [...(scene?.walls ?? [])]
    .filter(w => typeof w.flags?.[SCOPE]?.[SAND_WALL_FLAG] === "string")
    .map(w => ({ id: w.id, region: w.flags[SCOPE][SAND_WALL_FLAG], c: [...(w.c ?? [])] }));
}

/**
 * **BRING EVERY SANDWALL'S WALLS INTO LINE**, on the scenes named (every scene by default).
 * Answers how many Walls it wrote.
 *
 * @param {{scenes?: Scene[]|null}} [o]
 * @returns {Promise<number>}
 */
export function reconcileSandWalls({ scenes = null } = {}) {
  return serial(async () => {
    if (!isWriter()) return 0;
    let written = 0;
    for (const scene of scenes ?? game.scenes ?? []) {
      if (!scene?.walls || !sceneInWorld(scene)) continue;
      const { create, remove } = diffSandWalls(sandwallsOn(scene), flaggedWalls(scene));
      const gone = remove.filter(id => scene.walls.has(id));
      if (gone.length) await scene.deleteEmbeddedDocuments("Wall", gone);
      if (create.length && sceneInWorld(scene)) {
        await scene.createEmbeddedDocuments("Wall", create.map(w => sandWallData(w.c, w.region, CONST.EDGE_SENSE_TYPES, CONST.WALL_MOVEMENT_TYPES.NONE)));
      }
      written += gone.length + create.length;
    }
    return written;
  });
}

/** Never reject out of a hook. */
function quietly(promise) {
  return promise.catch(err => { console.warn("azeroth-rpg | Sandwall's walls", err); return 0; });
}

/**
 * The hooks, on the active GM's client: a Region placed, moved or taken away, and the world's
 * first load. Registered at `init` (`azeroth.mjs`).
 */
export function registerSandWallHooks() {
  const sight = region => region?.flags?.[SCOPE]?.blocksSight === true;
  Hooks.on("createRegion", region => { if (isWriter() && sight(region)) quietly(reconcileSandWalls({ scenes: [region.parent] })); });
  Hooks.on("updateRegion", (region, changes) => { if (isWriter() && sight(region) && "shapes" in (changes ?? {})) quietly(reconcileSandWalls({ scenes: [region.parent] })); });
  Hooks.on("deleteRegion", region => { if (isWriter() && sight(region)) quietly(reconcileSandWalls({ scenes: [region.parent] })); });
  Hooks.once("ready", () => { if (isWriter()) quietly(reconcileSandWalls()); });
}
