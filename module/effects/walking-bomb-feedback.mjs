const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** A completed receipt is the authority. Posting failure must never replay damage. */
export async function postWalkingBombResult({ message, bomb, origin, targets, receipt }) {
  if (receipt?.phase !== "finished" || receipt.bombUuid !== bomb?.uuid
    || receipt.tokenUuid !== origin?.uuid || receipt.attackId !== message?.uuid) return null;
  try {
    const rows = receipt.targets ?? [];
    const resolved = rows.map(row => ({ row, target: targets.find(target => target.tokenUuid === row.tokenUuid) }));
    // Missing or hidden token identities are never revealed through a public summary.
    const privateResult = origin.hidden === true || resolved.some(({ target }) => !target || target.token.hidden === true);
    const whisper = privateResult ? game.users.filter(user => user.isGM).map(user => user.id) : [...(message.whisper ?? [])];
    const lines = resolved.map(({ row, target }) => {
      const result = row.result;
      const name = target?.token.name ?? target?.actor.name ?? "Target";
      if (row.phase !== "delivered" || typeof result?.resisted !== "boolean" || !Number.isFinite(result.damage)) {
        throw new Error("Incomplete Walking Bomb result");
      }
      return `${escape(name)}: Reflex ${result.resisted ? "succeeded" : "failed"}; ${result.immune ? "immune to Physical damage" : `${result.damage} Physical damage after armor`}.`;
    });
    const source = { sceneId: origin.parent.id, tokenId: origin.id, actorUuid: bomb.uuid };
    return await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: bomb }), whisper, blind: message.blind === true,
      content: `<p><strong>Walking Bomb Explosion</strong></p>${lines.map(line => `<p>${line}</p>`).join("")}<p>The bomb is destroyed.</p><p>Damage above is before temporary Health, redirection, and other effects applied when damage is taken.</p>`,
      flags: { "azeroth-rpg": { walkingBombResult: true, attackUuid: message.uuid, tokenUuid: origin.uuid,
        kind: "ability",
        source: source ?? null,
        featureKey: "ability:walking-bomb-explosion",
        casting: false, success: true, targets: [] } }
    });
  } catch (error) {
    console.warn("azeroth-rpg | Walking Bomb feedback", error);
    ui.notifications?.warn("The explosion finished, but its result card could not be posted. Check the bomb's detonation record; do not apply the explosion again.");
    return null;
  }
}
