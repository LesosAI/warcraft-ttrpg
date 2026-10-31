const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Informational only. Damage has already been durably recorded; a failed
 * result-card write cannot authorize another damage application. */
export async function postFireShieldDischarge({ message, index, owner, attacker, lines }) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const holder = flags.targets?.[index];
  const source = holder?.sceneId && holder?.tokenId ? { sceneId: holder.sceneId, tokenId: holder.tokenId } : null;
  const target = flags.source ?? null;
  try {
    return await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: owner }),
      content: `<p><strong>${escape(game.i18n.localize("AZEROTH.FireShield.Name"))}</strong></p>${lines.map(line => `<p>${escape(line)}</p>`).join("")}`,
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:fire-shield-discharge",
        casting: false, success: true,
        targets: target?.sceneId && target?.tokenId ? [{ ...target, actorUuid: attacker.uuid, name: attacker.name }] : [],
        attackUuid: message.uuid, retaliation: true } }
    });
  } catch (error) {
    console.warn("azeroth-rpg | Fire Shield feedback", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.FireShield.DischargeFeedbackInterrupted"));
    return null;
  }
}
