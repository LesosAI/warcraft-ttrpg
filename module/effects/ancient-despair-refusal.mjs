/** A refusal only: do not spend an action, charge, ammunition or resource. */
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { phaseShiftRefusal } from "../rules/phase-shift.mjs";
import { seductionRefusal } from "./seduction-refusal.mjs";
import { iceBlockFor } from "../rules/ice-block.mjs";
// Retain the existing entry point used by action and movement workflows.
// Incapacitating phases refuse voluntary acts before any payment or roll.
export function refuseAncientDespair(actor, operation) {
  if (operation !== "resilience" && iceBlockFor(actor)) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.IceBlock.Protected"));
    return true;
  }
  const reason = projectionRefusal(actor, operation) ?? sleepRefusal(actor, operation)
    ?? despairRefusal(actor, operation) ?? phaseShiftRefusal(actor, operation) ?? seductionRefusal(actor, operation);
  if (!reason) return false;
  ui.notifications?.warn(game.i18n.localize(reason));
  return true;
}
