import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";

/** Windreaver's damage-only Shock. Validate before the ordinary ability
 * workflow pays; its resistance and damage cards handle mitigation. */
export function windreaverShockTargetValid(actor, source, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return false;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId), ref = targets[0];
  const target = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
  const victim = target?.actor;
  if (!actor || origin?.actor !== actor || !victim || victim === actor || victim.uuid === actor.uuid
    || !(victim.system?.health?.value > 0)) return false;
  if (!scene.levels?.get(origin._source?.level) || target._source?.level !== origin._source?.level) return false;
  if (realmRefusalFor(victim, "ability") || projectionRefusal(victim, "ability")) return false;
  const feet = feetApart(origin, target);
  return Number.isFinite(feet) && feet >= 0 && feet <= 20;
}
