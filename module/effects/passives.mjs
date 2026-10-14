/**
 * A creature's standing passives, where they touch the canvas (D-691).
 *
 * The law is pure - `rules/ability-automation.mjs#passiveEffects` and
 * `#gateHolds` - and `NpcData#prepareDerivedData` applies it. Two of those
 * gates read the field rather than the block, and this is the only place that
 * measurement is made:
 *
 * - **`nearAlly`** is *while the footman is adjacent to another Alliance
 *   Footman*: the tokens on the creature's own scene, by name, with the feet
 *   between them, measured through core's grid the way every other distance
 *   in this system is (D-669).
 * - **A gate re-derives on every data preparation**, and a token moving or an
 *   ally dying does not prepare anybody else's data. `refreshNearby` is the
 *   nudge: it resets the creatures on the scene whose passives gate on
 *   proximity, and nothing else.
 *
 * A creature with no token on the scene measures NOTHING and keeps its
 * passive: 14 writes it as the creature's ordinary state, and a token nobody
 * has placed is not evidence that it stands alone.
 */

import { feetBetweenFootprints, footprintOf } from "../canvas/footprints.mjs";

/**
 * Every other creature on this actor's scene, by name and by distance in feet.
 * `null` where there is no canvas or no token to measure from.
 *
 * @param {Actor} actor
 * @returns {Array<{name: string, feet: number}>|null}
 */
export function nearbyCreatures(actor) {
  const token = actor?.isToken ? actor.token?.object : actor?.getActiveTokens?.()?.[0];
  if (!token || !canvas?.ready || !canvas.grid || !canvas.tokens) return null;
  const grid = token.document?.parent?.grid ?? canvas.grid;
  // This runs inside data preparation on every client and every move, so the
  // creature's own footprint is laid out once (D-732's review).
  const own = footprintOf(token);
  const out = [];
  for (const other of canvas.tokens.placeables) {
    if (other === token || !other.actor) continue;
    // A creature at 0 Health has stopped holding the line (14 §1's *while he
    // stands*), so a fallen ally is not one to be adjacent to.
    if ((other.actor.system?.health?.value ?? 1) <= 0) continue;
    // Between the nearest spaces and in three dimensions, as every distance is
    // (D-732): a creature standing against a 3×3 token is beside it, not ten
    // feet from its centre. A token off the grid measures nothing.
    const feet = feetBetweenFootprints(own, footprintOf(other), grid);
    if (feet !== null) out.push({ name: other.actor.name, feet });
  }
  return out;
}

/** Whether any of this creature's passives measures the field. */
export function measuresField(actor) {
  const s = actor?.system ?? {};
  return [...(s.creatureAbilities ?? []), ...(s.bossActions ?? [])]
    .some(row => row?.automation?.passive?.when === "nearAlly");
}

/**
 * Re-prepare the creatures on a scene whose passives gate on proximity.
 *
 * A token moved, a token placed or removed, and an ally reduced to 0 Health
 * all change a `nearAlly` gate for somebody who was not updated. Nothing else
 * is touched, so this is a handful of actors on a busy scene and none at all
 * on most.
 */
export function refreshNearby(scene) {
  if (!scene || !canvas?.ready || canvas.scene?.id !== scene.id) return 0;
  let touched = 0;
  for (const token of scene.tokens) {
    const actor = token.actor;
    if (!actor || actor.type !== "npc" || !measuresField(actor)) continue;
    actor.reset();
    // The sheet redraws only where somebody has it open.
    actor.sheet?.rendered && actor.sheet.render(false);
    touched++;
  }
  return touched;
}

/** Register at ready. Every hook here is a change to what stands beside what. */
export function registerPassiveHooks() {
  const nudge = doc => refreshNearby(doc?.parent ?? doc?.scene ?? canvas?.scene ?? null);
  Hooks.on("createToken", doc => nudge(doc));
  Hooks.on("deleteToken", doc => nudge(doc));
  Hooks.on("moveToken", doc => nudge(doc));
  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.health.value")) return;
    refreshNearby(canvas?.scene ?? null);
  });
}
