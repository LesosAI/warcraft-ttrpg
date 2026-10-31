import { feetApart } from "../canvas/footprints.mjs";
import { searingRangeRefusal } from "../rules/searing-totem.mjs";

/** Re-read exact token documents, including after a roll popup. Never fall back
 * to another linked token or treat unmeasurable geometry as an in-range shot. */
export function searingAttackRange(actor, source, targets) {
  if (!targets?.length) return "target";
  const scene = game.scenes?.get(source?.sceneId);
  const from = scene?.tokens?.get(source?.tokenId);
  if (!from || from.actor !== actor) return "geometry";
  return searingRangeRefusal(targets.map(target => {
    const to = target.sceneId === scene.id ? scene.tokens.get(target.tokenId) : null;
    if (!to?.actor || to.actor.id !== target.actorId || from._source?.level !== to._source?.level) return null;
    try { return feetApart(from, to); } catch { return null; }
  }));
}
