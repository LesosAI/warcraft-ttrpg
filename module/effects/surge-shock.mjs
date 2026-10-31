/** Validate the current single target before the ordinary ability workflow pays. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { MANA_SHOCK } from "../rules/mana-surge.mjs";

export function surgeShockTargetValid(actor, source, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return false;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId), ref = targets[0];
  const token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
  const victim = token?.actor;
  if (!actor || origin?.actor !== actor || !victim || victim === actor || victim.uuid && victim.uuid === actor.uuid) return false;
  if (realmRefusalFor(victim, "ability")) return false;
  const feet = feetApart(origin, token);
  return Number.isFinite(feet) && feet >= 0 && feet <= MANA_SHOCK.feet;
}
