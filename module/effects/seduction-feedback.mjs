import { activeSeductions } from "../rules/seduction.mjs";
const busy = new Set();

/** A successful charm gets its own cue; the original attempt cannot emit it. */
export async function postSeductionFeedback({ victim, by, message, effectId } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id
    || ![victim, by, message].every(doc => doc?.uuid && fromUuidSync(doc.uuid) === doc)) return null;
  const receipt = message.getFlag("azeroth-rpg", "seductionDeliveries")?.find(row => row.targetUuid === victim.uuid);
  const effect = activeSeductions(victim.effects, victim.uuid).find(row => row.id === effectId);
  const state = effect?.flags?.["azeroth-rpg"]?.seduction;
  if (receipt?.stage !== "applied" || receipt.effectId !== effectId || receipt.sourceUuid !== by.uuid
    || state?.sourceUuid !== by.uuid || state.messageUuid !== message.uuid) return null;
  const sourceToken = fromUuidSync(state.sourceTokenUuid), targetToken = fromUuidSync(state.targetTokenUuid);
  if (sourceToken?.actor !== by || targetToken?.actor !== victim) return null;
  const key = `${message.uuid}:${victim.uuid}`;
  const prior = [...(game.messages?.values?.() ?? [])].find(row => row.flags?.["azeroth-rpg"]?.seductionResult === key);
  if (prior) return prior;
  if (busy.has(key)) return null;
  busy.add(key);
  const source = { sceneId: sourceToken.parent.id, tokenId: sourceToken.id };
  const label = foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.Seduction.HarmEnd"));
  const hint = foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.Seduction.HarmHint"));
  try {
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: by }),
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      content: `<p><strong>Seduction</strong></p><p>${foundry.utils.escapeHTML(String(victim.name ?? "Target"))} is Charmed until the end of its next turn and must spend that turn moving toward the succubus. The charm ends if the succubus or one of its allies harms it.</p><button type="button" data-action="seductionEndHarm" data-gm-only title="${hint}">${label}</button>`,
      flags: { "azeroth-rpg": { kind: "ability",
        featureKey: "ability:seduction-charm",
        source: source ?? null,
        casting: false, success: true,
        targets: [{ sceneId: targetToken.parent.id, tokenId: targetToken.id, actorUuid: victim.uuid, name: victim.name }],
        seductionHarm: { actorUuid: victim.uuid, effectId, messageUuid: message.uuid },
        seductionResult: key } } });
  } finally { busy.delete(key); }
}
