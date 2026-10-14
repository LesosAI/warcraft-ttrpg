/**
 * WHETHER A DOCUMENT IS STILL IN THE WORLD, asked immediately before a write
 * (the full-suite fix of D-757, 2026-09-26).
 *
 * Every pass that writes a scene's Regions, a Region's behaviors or a token's
 * actor is DEFERRED - a queued sweep (`canvas/sustained-areas.mjs`), an aura
 * pass behind its latch (`effects/auras.mjs`), a move judged after the update
 * that began it (`effects/area-strikes.mjs`), a turn's work after the update
 * that moved it (`documents/combat.mjs`) - and a GM may delete the scene while
 * it waits. The SERVER refuses a write into a scene it no longer has, *The
 * Scene <id> does not exist in scenes*, and core raises the refusal as an
 * error notification however the promise is caught.
 *
 * **A deleted scene's embedded collections are not emptied on the client**:
 * `scene.regions.has(id)` and `scene.tokens.has(id)` stay true on the stale
 * object, so every question here starts at the world's own collection.
 *
 * **A scene whose deletion THIS client has asked for is out of the world from
 * the ask.** `preDeleteScene` fires on the asking client before the request
 * is sent, and a pass that runs during the round trip reaches the server after
 * the deletion. `deleteScene` clears the mark once the world has dropped the
 * scene; a mark older than `GOING_LAPSE_MS` is a deletion that was refused or
 * vetoed, and the scene is read as in the world again.
 *
 * No imports: `canvas/arrival.mjs` reads it, and so can a Vitest.
 */

/** Scene id to the time this client asked for its deletion. */
const GOING = new Map();

/** How long a deletion this client asked for may take before the scene is read as in the world again. */
export const GOING_LAPSE_MS = 30000;

/**
 * Whether the world still holds this scene, and this client has not asked to
 * delete it.
 *
 * @param {Scene|null} scene
 * @param {number} [now]
 * @returns {boolean}
 */
export function sceneInWorld(scene, now = Date.now()) {
  const id = scene?.id ?? null;
  if (!id || globalThis.game?.scenes?.has?.(id) !== true) return false;
  const asked = GOING.get(id);
  if (asked === undefined) return true;
  if (now - asked < GOING_LAPSE_MS) return false;
  GOING.delete(id);
  return true;
}

/** Whether this Region is in the world: its scene is, and the scene still holds it. */
export function regionInWorld(region) {
  const scene = region?.parent ?? null;
  return Boolean(region?.id) && sceneInWorld(scene) && scene.regions?.has?.(region.id) === true;
}

/** Whether this token is in the world: its scene is, and the scene still holds it. */
export function tokenInWorld(token) {
  const scene = token?.parent ?? null;
  return Boolean(token?.id) && sceneInWorld(scene) && scene.tokens?.has?.(token.id) === true;
}

/**
 * Whether this actor can still be written: a token's actor while its token is
 * in the world, a world actor while the world holds it.
 *
 * @param {Actor|null} actor
 * @returns {boolean}
 */
export function actorInWorld(actor) {
  if (!actor?.id) return false;
  if (actor.isToken) return tokenInWorld(actor.token ?? null);
  return globalThis.game?.actors?.has?.(actor.id) === true;
}

/** Mark a deletion this client has asked for. */
export function markSceneGoing(id, now = Date.now()) {
  if (id) GOING.set(id, now);
}

/** Clear it, once the world has dropped the scene. */
export function clearSceneGoing(id) {
  if (id) GOING.delete(id);
}

/** Registered at init: the ask marks the scene, the deletion clears the mark. */
export function registerInWorldHooks() {
  Hooks.on("preDeleteScene", scene => {
    markSceneGoing(scene?.id ?? null);
  });
  Hooks.on("deleteScene", scene => {
    clearSceneGoing(scene?.id ?? null);
  });
}
