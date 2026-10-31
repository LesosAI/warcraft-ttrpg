import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { fireguardTargetLegal } from "../rules/fireguard.mjs";

/** Resolve one current token pair before payment and again after each await.
 * The caller must also compare returned object identities with its original
 * selection, so replacing a token cannot silently redirect a paid cast.
 */
export function fireguardTarget(actor, key, source, targets) {
  if (!Array.isArray(targets) || targets.length !== 1) return null;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId), ref = targets[0];
  const token = ref?.sceneId === scene?.id ? scene?.tokens.get(ref?.tokenId) : null;
  const victim = token?.actor;
  if (!actor || origin?.actor !== actor || !victim || victim === actor) return null;
  if (ref.actorUuid && ref.actorUuid !== victim.uuid) return null;
  if (realmRefusalFor(victim, "ability") || projectionRefusal(victim, "ability")) return null;
  if (!fireguardTargetLegal(key, { sourceUuid: actor.uuid, targetUuid: victim.uuid,
    sameScene: token?.parent === scene && origin?.parent === scene, distance: feetApart(origin, token) })) return null;
  return { scene, origin, token, actor: victim };
}
