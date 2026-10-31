import { mindControlRecord } from '../rules/mind-control.mjs';
import { iceBlockFor } from '../rules/ice-block.mjs';

/** Read-only admission for the eventual active-GM control writer. Accept real
 * registered documents, never client-provided result totals or target actors. */
export function readMindControlFailure({ message, result, user } = {}, {
  game = globalThis.game, resolve = globalThis.fromUuidSync,
  speakerActor = speaker => globalThis.ChatMessage.getSpeakerActor(speaker)
} = {}) {
  if (!game?.user?.isGM || game.users?.activeGM !== game.user || !user?.active
    || game.users.get(user.id) !== user || !message?.uuid || !result?.uuid
    || message.documentName !== 'ChatMessage' || result.documentName !== 'ChatMessage'
    || resolve(message.uuid) !== message || resolve(result.uuid) !== result) return null;
  const flags = message.flags?.['azeroth-rpg'], cast = flags?.mindControlCast;
  const rolled = result.flags?.['azeroth-rpg'], link = rolled?.resistOf;
  if (flags?.kind !== 'feature' || flags.featureKey !== 'mind-control' || flags.success !== true
    || flags.casting !== true || cast?.version !== 1 || !Array.isArray(flags.targets) || flags.targets.length !== 1
    || rolled?.kind !== 'resilience' || rolled.resilience !== 'spirit' || link?.messageId !== message.id
    || link.index !== 0 || result.author?.id !== user.id
    || result.rolls?.[0]?.outcome?.success !== false || result.rolls[0].options?.dc !== cast.dc) return null;
  const row = flags.targets[0];
  if (link.actorId !== row.actorId || (link.sceneId ?? null) !== (row.sceneId ?? null)
    || (link.tokenId ?? null) !== (row.tokenId ?? null)) return null;
  const target = row.sceneId && row.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
    : !row.sceneId && !row.tokenId ? resolve(`Actor.${row.actorId}`) : null;
  const caster = resolve(cast.casterUuid);
  if (!target || !caster || speakerActor(message.speaker) !== caster || speakerActor(result.speaker) !== target
    || !target.testUserPermission(user, 'OWNER') || iceBlockFor(target) || iceBlockFor(caster)) return null;
  const casterToken = message.speaker?.token
    ? { sceneId: message.speaker.scene, tokenId: message.speaker.token } : null;
  if (casterToken && (!casterToken.sceneId
    || resolve(`Scene.${casterToken.sceneId}.Token.${casterToken.tokenId}`)?.actor !== caster)) return null;
  const record = mindControlRecord({ casterUuid: caster.uuid, targetUuid: target.uuid,
    messageUuid: message.uuid, resultUuid: result.uuid, dc: cast.dc,
    turnIdentity: { caster: casterToken, target: row.sceneId && row.tokenId
      ? { sceneId: row.sceneId, tokenId: row.tokenId } : null } });
  return record ? { caster, target, message, result, record } : null;
}
