const busy = new Set();
/** Report only a confirmed resolution. Preserve the incoming card's audience;
 * repeating feedback must never repeat payment, refunds or the effect. */
export async function postPhaseShiftFeedback({ actor, message, index } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !actor?.uuid || !message?.uuid
    || fromUuidSync(actor.uuid) !== actor || fromUuidSync(message.uuid) !== message) return null;
  const record = message.getFlag("azeroth-rpg", "attackResolution")?.targets?.[index];
  if (record?.stage !== "phased" || record.targetUuid !== actor.uuid) return null;
  const target = message.flags?.["azeroth-rpg"]?.targets?.[index];
  const token = target?.sceneId && target?.tokenId ? fromUuidSync(`Scene.${target.sceneId}.Token.${target.tokenId}`) : null;
  const source = token?.actor === actor ? { sceneId: target.sceneId, tokenId: target.tokenId } : null;
  const key = `${message.uuid}:${index}`;
  const existing = [...(game.messages?.values?.() ?? [])].find(entry => entry.flags?.["azeroth-rpg"]?.phaseShiftResult === key);
  if (existing) return existing;
  if (busy.has(key)) return null;
  busy.add(key);
  try {
    const name = foundry.utils.escapeHTML(String(actor.name ?? "Imp"));
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      content: `<p><strong>Phase Shift</strong></p><p>${name} used its Reaction to avoid this attack. It cannot act until the start of its next turn (6 seconds outside combat).</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        featureKey: "ability:phase-shift",
        source: source ?? null,
        casting: false, success: true, targets: [], phaseShiftResult: key } } });
  } finally { busy.delete(key); }
}
