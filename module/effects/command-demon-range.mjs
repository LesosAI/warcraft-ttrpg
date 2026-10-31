import { feetApart } from "../canvas/footprints.mjs";

/** Re-read the exact tokens selected for Command Demon on the writer's client.
 * Null placement preserves the system's off-scene, table-measured workflow.
 * Once a placed token was named, losing it must not become off-scene permission.
 */
export function commandDemonRangeRefusal(owner, target, placement = null) {
  if (placement === null) return null;
  const tokenAt = row => row?.sceneId && row?.tokenId
    ? game.scenes?.get(row.sceneId)?.tokens.get(row.tokenId) : null;
  const source = tokenAt(placement?.source), destination = tokenAt(placement?.target);
  if (!source || !destination || source.actor?.uuid !== owner?.uuid
    || destination.actorId !== target?.id || source.parent?.id !== destination.parent?.id
    || source._source?.level !== destination._source?.level) return "AZEROTH.CommandDemon.PlacementChanged";
  const distance = feetApart(source, destination);
  if (!Number.isFinite(distance)) return "AZEROTH.CommandDemon.PlacementChanged";
  return distance > 20 ? "AZEROTH.CommandDemon.OutOfRange" : null;
}
