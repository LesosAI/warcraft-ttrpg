/** Refuse an invalid Acid Spit before the normal ability workflow pays. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { ACID_SPIT } from "../rules/rock-worm.mjs";

export function acidSpitTargetValid(actor, source, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return false;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId);
  const ref = targets[0];
  const token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
  const victim = token?.actor;
  if (!actor || origin?.actor !== actor || !victim || victim === actor) return false;
  if (realmRefusalFor(victim, "ability")) return false;
  const feet = feetApart(origin, token);
  return Number.isFinite(feet) && feet >= 0 && feet <= ACID_SPIT.feet;
}
