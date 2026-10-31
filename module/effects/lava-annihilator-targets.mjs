import { feetApart } from "../canvas/footprints.mjs";
import { standingOf, combatantIn } from "../canvas/engaged.mjs";
import { countsAsEnemy, reachOf } from "../rules/distance.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

// Verified against local Foundry 14.367 Token#checkCollision: sight uses
// the source token's scene level and the sight polygon backend.
function sightClear(origin, target) {
  if (!origin.object?.checkCollision || !target.getMovementOrigin
    || !origin.parent?.levels?.get(origin._source?.level)
    || origin._source?.level !== target._source?.level) return false;
  try {
    const destination = target.getMovementOrigin(target._source);
    return origin.object.checkCollision(destination, { type: "sight", mode: "any" }) === false;
  } catch { return false; }
}

/** Observe exact scene tokens, never whichever linked token happens to be first
 * in getActiveTokens(). Hidden/invisible alternatives do not force a switch. */
export function annihilatorSceneTargets({ actor, source, targets, traits = [] } = {}) {
  if (!Array.isArray(targets) || targets.length !== 1) return null;
  const scene = game.scenes?.get(source?.sceneId);
  const origin = scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.parent !== scene || origin.actor !== actor) return null;
  const ref = targets[0];
  const chosen = ref.sceneId === scene.id ? scene.tokens.get(ref.tokenId) : null;
  if (!chosen?.actor || chosen.parent !== scene || chosen === origin
    || (ref.actorUuid && ref.actorUuid !== chosen.actor.uuid)) return null;
  const fight = actor.activeFight?.() ?? null;
  const stance = token => standingOf(token, combatantIn(fight, token.actor, token), fight);
  const mine = stance(origin), reach = reachOf(traits);
  const candidates = [];
  for (const token of scene.tokens) {
    if (token === origin || token.parent !== scene || !token.actor || token.actor === actor) continue;
    const other = stance(token), distance = feetApart(origin, token);
    candidates.push({
      id: token.uuid,
      alive: other.defeated !== true && typeof other.health === "number" && other.health > 0,
      hostile: countsAsEnemy(mine, other, { gm: false }),
      visible: other.hidden !== true && sightClear(origin, token),
      inReach: Number.isFinite(distance) && distance <= reach
        && !projectionRefusal(token.actor, "ability") && !realmRefusalFor(token.actor, "ability")
    });
  }
  return { scope: `${scene.id}:${origin.id}:${fight?.id ?? "outside-combat"}`,
    recordDocument: origin, targetId: chosen.uuid, targets: candidates };
}
