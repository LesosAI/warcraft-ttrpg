import { layDomination } from './compel.mjs';
import { spellTiming } from './durations.mjs';
const scope = 'azeroth-rpg';
export const DOMINATION_QUERY = 'azeroth-rpg.domination';
function targetOf(ref) {
  if (ref?.sceneId || ref?.tokenId) {
    if (!ref.sceneId || !ref.tokenId) return null;
    const actor = game.scenes?.get(ref.sceneId)?.tokens?.get(ref.tokenId)?.actor;
    return actor?.id === ref.actorId ? actor : null;
  }
  return game.actors?.get(ref?.actorId) ?? null;
}
export async function dominationDeliveryHandler({ actorUuid, messageId, resultId } = {}, { user } = {}) {
  if (![actorUuid, messageId, resultId].every(value => typeof value === 'string' && value)) return { ok: false };
  const actor = fromUuidSync(actorUuid), message = game.messages?.get(messageId), result = game.messages?.get(resultId);
  const casterUuid = message?.flags?.[scope]?.caster;
  const caster = typeof casterUuid === 'string' ? fromUuidSync(casterUuid) : null;
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && user?.active && game.users.get(user.id) === user && actor && fromUuidSync(actorUuid) === actor
    && actor.testUserPermission(user, 'OWNER') && game.messages.get(messageId) === message
    && game.messages.get(resultId) === result && result?.author?.id === user.id
    && message?.author && caster?.testUserPermission(message.author, 'OWNER')
    && result?.speaker?.actor === actor.id && result.flags?.[scope]?.resilience === 'spirit'
    && (message.flags?.[scope]?.targets ?? []).some(ref => targetOf(ref) === actor)
    && targetOf(result.flags?.[scope]?.resistOf) === actor;
  if (!valid()) return { ok: false };
  const effect = await layDomination(actor, message, spellTiming(actor, message.flags[scope].duration) ?? {}, result, valid);
  return { ok: Boolean(effect && valid()), effectId: effect?.id ?? null };
}
export async function requestDomination(actor, message, result) {
  const payload = { actorUuid: actor.uuid, messageId: message.id, resultId: result?.id };
  try {
    const gm = game.users?.activeGM;
    if (!gm) throw Error('No active GM');
    const answer = gm.id === game.user.id ? await dominationDeliveryHandler(payload, { user: game.user })
      : await gm.query(DOMINATION_QUERY, payload, { timeout: 15000 });
    if (answer?.ok) return answer;
  } catch (error) { console.warn('azeroth-rpg | Domination delivery', error); }
  ui.notifications?.warn(game.i18n.localize('AZEROTH.DominationOrder.DeliveryPending'));
  return { ok: false };
}
