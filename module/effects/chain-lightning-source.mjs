/** Resolve an omitted source in the initial target's scene. Never choose between
 * multiple linked tokens or substitute a base actor for a synthetic actor.
 * This returns only the caster's identity; the GM still validates the route. */
export function chainLightningSource(actor, targets) {
  if (!actor || !Array.isArray(targets) || targets.length !== 1) return null;
  const scene = game.scenes?.get(targets[0]?.sceneId);
  if (!scene) return null;
  const tokens = [...scene.tokens.values()].filter(token => token.actor === actor);
  if (tokens.length !== 1) return null;
  return { sceneId: scene.id, tokenId: tokens[0].id };
}
