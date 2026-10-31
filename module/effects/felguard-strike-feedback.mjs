const busy = new Set();
const FLAG = "felguardStrikeFeedback";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

/** Cosmetic acknowledgement only. The attack and its effect have already landed.
 * A durable claim prevents replay if the chat write loses its acknowledgement. */
export async function postFelguardStrikeFeedback({ actor, victim, message, effectId } = {}) {
  const flags = () => message?.flags?.["azeroth-rpg"] ?? {};
  const source = flags().source, target = flags().targets?.[0];
  const sourceToken = source?.sceneId && source?.tokenId ? resolve(`Scene.${source.sceneId}.Token.${source.tokenId}`) : null;
  const targetToken = target?.sceneId && target?.tokenId ? resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`) : null;
  const valid = () => {
    const effect = [...(victim?.effects ?? [])].find(e => e.id === effectId);
    const state = effect?.flags?.["azeroth-rpg"]?.felguardMortalStrike;
    return game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
      && [actor, victim, message].every(doc => doc?.uuid && resolve(doc.uuid) === doc)
      && flags().sentinelStrikeAttack?.kind === "felguard" && flags().sentinelStrikeAttack?.sourceUuid === actor.uuid
      && flags().sentinelStrikeAttack?.targetUuid === victim.uuid && flags().sentinelStrikeClaim === true
      && flags().kind === "attack" && message.rolls?.[0]?.outcome?.success === true
      && flags().damageByTarget?.length === 1 && flags().damageByTarget[0]?.hit === true
      && flags().damageByTarget[0]?.withdrawn !== true && flags().targets?.length === 1
      && sourceToken?.actor === actor && targetToken?.actor === victim && source.sceneId === target.sceneId
      && flags().source?.sceneId === source.sceneId && flags().source?.tokenId === source.tokenId
      && flags().targets[0]?.sceneId === target.sceneId && flags().targets[0]?.tokenId === target.tokenId
      && resolve(sourceToken.uuid) === sourceToken && resolve(targetToken.uuid) === targetToken
      && effect?.origin === actor.uuid && effect.active !== false && !effect.disabled && !effect.isSuppressed
      && !effect.duration?.expired && state?.halved === true && state.sourceUuid === actor.uuid
      && state.targetUuid === victim.uuid && state.messageUuid === message.uuid;
  };
  if (!valid() || flags()[FLAG] || busy.has(message.uuid)) return null;
  busy.add(message.uuid);
  try {
    await message.update({ [`flags.azeroth-rpg.${FLAG}`]: { stage: "posting", effectId } });
    if (!valid() || flags()[FLAG]?.stage !== "posting" || flags()[FLAG]?.effectId !== effectId) return null;
    const sourceRef = { sceneId: source.sceneId, tokenId: source.tokenId };
    const card = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      whisper: [...(message.whisper ?? [])], blind: message.blind === true,
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.NpcMortalStrike.FelguardResult", {
        name: String(targetToken.name ?? victim.name ?? "") }))}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        featureKey: "ability:felguard-mortal-strike",
        source: sourceRef ?? null,
        casting: false, success: true,
        targets: [{ sceneId: target.sceneId, tokenId: target.tokenId, actorUuid: victim.uuid }],
        felguardStrikeResult: { messageUuid: message.uuid, effectId } } } });
    if (card?.id) await message.update({ [`flags.azeroth-rpg.${FLAG}`]: { stage: "posted", effectId, cardId: card.id } });
    return card ?? null;
  } catch (error) {
    console.warn("azeroth-rpg | Felguard Mortal Strike feedback", error);
    return null;
  } finally { busy.delete(message.uuid); }
}
