/** Cosmetic feedback only after a confirmed mutation. Missing or ambiguous
 * scene tokens never select a different instance of the same world actor. */
export async function sentinelFeedback(actor, key, text) {
  if (!globalThis.ChatMessage?.create || !globalThis.canvas?.scene) return false;
  const candidates = (canvas.tokens?.placeables ?? []).filter(token => token.actor === actor);
  const token = actor?.isToken ? actor.token : candidates.length === 1 ? candidates[0].document : null;
  if (!token?.id || token.parent?.id !== canvas.scene.id) return false;
  const source = { sceneId: canvas.scene.id, tokenId: token.id, actorUuid: actor.uuid };
  try {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: key,
        casting: false, success: true, targets: [source] } } });
    return true;
  } catch (error) {
    console.warn("azeroth-rpg | Sentinel feedback", error);
    return false;
  }
}
