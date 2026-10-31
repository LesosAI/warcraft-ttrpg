/** Tendon Rip's targeting preflight; resolution uses the normal ability card. */
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export function tendonRipTargetValid(actor, source, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return false;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId);
  const ref = targets[0];
  const token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
  const victim = token?.actor;
  if (!actor || origin?.actor !== actor || !victim || victim === actor) return false;
  if (realmRefusalFor(victim, "ability")) return false;
  const feet = feetApart(origin, token);
  return Number.isFinite(feet) && feet >= 0 && feet <= 5;
}
