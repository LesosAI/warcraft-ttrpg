const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const values = collection => [...(collection?.values?.() ?? collection ?? [])];

/** Only an unambiguous victim token receives the cue. A linked actor with
 * several tokens still gets a private result card, without a guessed origin. */
function victimSource(victim, preferred) {
  if (preferred?.sceneId && preferred?.tokenId) {
    const token = game.scenes?.get(preferred.sceneId)?.tokens?.get(preferred.tokenId);
    if (token?.actor === victim) return { sceneId: preferred.sceneId, tokenId: preferred.tokenId, actorUuid: victim.uuid };
  }
  const tokens = values(game.scenes).flatMap(scene => values(scene.tokens).filter(token => token.actor === victim));
  return tokens.length === 1 ? { sceneId: tokens[0].parent.id, tokenId: tokens[0].id, actorUuid: victim.uuid } : null;
}

/** Feedback never changes the mechanical result or retries an effect write. */
export async function postBleakheartResult({ victim, kind, receipt, preferred = null } = {}) {
  if (game.user?.isGM !== true || game.users?.activeGM?.id !== game.user.id
    || !victim?.uuid || receipt?.state !== "finished" || !["curse", "pain"].includes(kind)
    || (kind === "curse" ? !receipt.effectId : receipt.proc !== true)) return null;
  try {
    const source = victimSource(victim, preferred);
    const content = kind === "curse"
      ? "<p><strong>Curse of the Bleakheart</strong></p><p>The victim is cursed for three minutes. Further applications refresh the curse.</p>"
      : `<p><strong>Chest Pains</strong></p>${(receipt.lines ?? []).map(line => `<p>${escape(line)}</p>`).join("")}<p>${receipt.stunned ? "Stunned for six seconds." : "No Stunned effect was applied."}</p>`;
    const data = { speaker: ChatMessage.getSpeaker({ actor: victim }), whisper: [game.user.id], content };
    if (!source) return await ChatMessage.create({ ...data, flags: { "azeroth-rpg": { kind: "bleakheartReport", bleakheart: receipt } } });
    return await ChatMessage.create({ ...data, flags: { "azeroth-rpg": { kind: "ability",
      source: source ?? null,
      featureKey: kind === "curse" ? "ability:bleakheart-curse" : "ability:bleakheart-chest-pains",
      casting: false, success: true, targets: [], bleakheart: receipt } } });
  } catch (error) {
    console.warn("azeroth-rpg | Bleakheart result card failed; do not replay the completed effect", error);
    globalThis.ui?.notifications?.warn("The Bleakheart effect finished, but its result card could not be posted. Check the stored receipt; do not apply it again.");
    return null;
  }
}
