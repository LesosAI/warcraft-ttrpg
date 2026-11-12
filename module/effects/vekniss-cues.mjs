/** Supplemental poison lifecycle records. These never apply damage. */
export async function postVeknissPulse({ actor, combat, phase } = {}) {
  if (!["mature", "tick"].includes(phase) || !game.user?.isGM) return false;
  const combatant = combat?.combatant;
  // The scene the combatant's token stands on (O-294): core makes a fight unlinked.
  let sceneId = combatant?.token?.parent?.id ?? combatant?.sceneId ?? combat?.scene?.id ?? combat?.sceneId;
  let token = sceneId && combatant?.tokenId ? game.scenes?.get(sceneId)?.tokens?.get(combatant.tokenId) : null;
  if (combat && (!token || combatant?.actor?.uuid !== actor?.uuid)) return false;
  if (!combat) {
    const matches = [];
    for (const scene of game.scenes ?? []) for (const candidate of scene.tokens ?? []) {
      if (candidate.actor?.uuid === actor?.uuid) matches.push({ token: candidate, sceneId: scene.id });
    }
    // A linked actor can have several tokens. Do not guess which duplicate
    // carries an exploration dose when no combatant identifies it.
    if (matches.length !== 1) return false;
    ({ token, sceneId } = matches[0]);
  }
  if (!token || token.actor?.uuid !== actor?.uuid) return false;
  const source = { sceneId, tokenId: token.id };
  const featureKey = phase === "mature" ? "ability:vekniss-catalyst" : "ability:catalyst-pulse";
  const text = phase === "mature"
    ? "Vekniss Itch becomes Catalyst: Poisoned and Slowed. This transition deals no damage."
    : "Vekniss Catalyst's poison pulse resolved using normal immunity and mitigation.";
  try {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${text}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: featureKey,
        casting: false, success: true, targets: [source] } } });
    return true;
  } catch {
    ui.notifications?.warn("Vekniss Catalyst resolved, but its visual cue could not be posted. Do not apply it again.");
    return false;
  }
}
