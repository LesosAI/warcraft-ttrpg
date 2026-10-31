/** Foundry 14.367 preMoveToken is synchronous and cancels movement on false.
 * Enforce outside combat and even when optional movement limits are disabled.
 * An external displacement/undo is not the creature choosing to move. */
import { creatureMoved } from "../rules/movement.mjs";
import { refuseAncientDespair } from "./ancient-despair-refusal.mjs";
import { permittedDespairWalk } from "./despair-walk-permission.mjs";

export function despairPreMove(document, movement, options = {}) {
  if (permittedDespairWalk(document, movement)) return true;
  if (!creatureMoved(movement, options)) return true;
  return !refuseAncientDespair(document?.actor, "movement");
}

export function registerAncientDespairMovement() {
  Hooks.on("preMoveToken", despairPreMove);
}
