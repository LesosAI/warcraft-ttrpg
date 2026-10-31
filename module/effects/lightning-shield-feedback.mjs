const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Feedback is posted only after the durable delivery receipt. Failure here
 * never retries the already delivered damage or restores a charge. */
export async function postLightningShieldDischarge({ message, index, owner, attacker, remaining, lines }) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const holder = flags.targets?.[index];
  const source = holder?.sceneId && holder?.tokenId ? { sceneId: holder.sceneId, tokenId: holder.tokenId } : null;
  const target = flags.source ?? null;
  const content = `<p><strong>Lightning Shield</strong></p>${lines.map(line => `<p>${escape(line)}</p>`).join("")}<p>${escape(game.i18n.format("AZEROTH.LightningShield.Remaining", { n: remaining }))}</p>`;
  try {
    return await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: owner }), content,
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:lightning-shield-discharge",
        casting: false, success: true,
        targets: target?.sceneId && target?.tokenId ? [{ ...target, actorUuid: attacker.uuid, name: attacker.name }] : [],
        attackUuid: message.uuid, remaining, retaliation: true } }
    });
  } catch (error) {
    console.warn("azeroth-rpg | Lightning Shield feedback", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.LightningShield.FeedbackInterrupted"));
    return null;
  }
}
