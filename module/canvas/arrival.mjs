/**
 * WAIT UNTIL A MOVING TOKEN HAS ARRIVED WHERE THIS MOVE PUT IT (D-669, D-757;
 * the final review, 2026-09-26). The ONE wait: `effects/auras.mjs` measures an
 * aura off it and `effects/area-strikes.mjs` sweeps the leavers after it, and
 * each carried its own copy until the review found them.
 *
 * **A token's DOCUMENT position is interpolated while it travels** (v14,
 * D-669): `doc.x` reads where the token was a moment ago, and a distance
 * measured straight after a move measures that. CLAUDE.md §15: *poll the
 * document until it holds the value you wrote*.
 *
 * **The value written is the LAST PASSED WAYPOINT of this move**, never the
 * movement's `destination`. A move that pauses at a waypoint, or is constrained
 * short, never reaches its destination, and both copies waited out the whole
 * ten seconds on every one. The passed path is exactly what this update wrote
 * to the document's source (14.367, `TokenDocument#preUpdateMovement`: the
 * checkpoint is `passed.at(-1)`), so the document always gets there. A newer
 * move taking the token over ends the wait at once: what it does is its own
 * move's business, and its own hook waits for it.
 *
 * **The active GM's client alone** polls. Every caller writes on that client
 * and nowhere else, so another client's wait returns at once, rather than every
 * connected browser polling every step of every token for ten seconds.
 *
 * `TokenDocument#testInsideRegion` reads the document's `_source` and needs no
 * wait (14.367); a footprint (`canvas/footprints.mjs`) reads `doc.x` and does.
 *
 * **A token deleted, or its scene, arrives nowhere** (the full-suite fix of
 * D-757): the wait ends the moment it is out of the world, rather than polling
 * the ten seconds out and handing a pass on to a scene that has gone.
 */

import { tokenInWorld } from "./in-world.mjs";

/** How long the poll waits at most: ten seconds, in 50 ms steps (D-757's live batch). */
export const ARRIVAL_POLLS = 200;
export const ARRIVAL_MS = 50;

/** The waits in flight, for a batch's teardown to wait out (`arrivalsIdle`). */
const WAITING = new Set();

/**
 * Resolve once the token's document stands where this move put it.
 *
 * @param {TokenDocument|null} document
 * @param {object|null} [movement]  the move's own operation (`moveToken`'s second
 *   argument); the document's current movement where none is handed in
 * @returns {Promise<boolean>} whether it arrived; false where this client does
 *   not write, the move was taken over, the token left the world, or ten
 *   seconds passed
 */
export function arrived(document, movement = null) {
  const wait = waitFor(document, movement);
  WAITING.add(wait);
  const done = () => WAITING.delete(wait);
  wait.then(done, done);
  return wait;
}

/** The poll itself; only ever run through `arrived`. */
async function waitFor(document, movement) {
  if (!document || globalThis.game?.users?.activeGM?.isSelf !== true) return false;
  const moving = movement ?? document.movement ?? null;
  const last = moving?.passed?.waypoints?.at?.(-1) ?? null;
  const target = last ?? document._source ?? null;
  if (!target) return false;
  const id = moving?.id ?? null;
  for (let i = 0; i < ARRIVAL_POLLS; i++) {
    if (document.x === target.x && document.y === target.y) return true;
    if (!tokenInWorld(document)) return false;
    // Taken over by a newer move: that move's hook waits for its own arrival.
    if (id && document.movement?.id && document.movement.id !== id) return false;
    await new Promise(resolve => setTimeout(resolve, ARRIVAL_MS));
  }
  return false;
}

/** How many waits are in flight. */
export function arrivalsPending() {
  return WAITING.size;
}

/** Until every wait in flight has ended (the full-suite fix of D-757). */
export async function arrivalsIdle() {
  while (WAITING.size) await Promise.allSettled([...WAITING]);
}
