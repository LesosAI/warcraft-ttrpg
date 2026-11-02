import { crossingPath } from './spell-crossing-path.mjs';
import { crossingOriginMatches, spellCrossingFrom } from '../rules/spell-crossing.mjs';
import { deliverSignatureAreaDamage } from './signature-area-delivery.mjs';
import { queueSignatureCard } from './signature-card-queue.mjs';
import { crossingWrites } from './spell-crossing-write-state.mjs';
const scope = 'azeroth-rpg';
export const SPELL_CROSSING_QUERY = 'azeroth-rpg.spellCrossing';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve only the persisted successful move, never another movement/payment. */
export async function deliverSpellCrossing({messageId} = {}, {user} = {}) {
  if (crossingWrites.has(messageId)) return {ok:false,reason:'busy'};
  crossingWrites.add(messageId);
  try { return await resolveSpellCrossing({messageId},{user}); }
  finally { crossingWrites.delete(messageId); }
}
async function resolveSpellCrossing({messageId}, {user}) {
  const message = game.messages.get(messageId), f = message?.flags?.[scope], move = f?.spellCrossing;
  let caster;
  try { caster = fromUuidSync(f?.spellLockCaster); } catch {}
  const scene = game.scenes.get(move?.sceneId), token = scene?.tokens.get(move?.tokenId);
  if (!caster || !token || token.actor !== caster || !user?.id || game.users.get(user.id) !== user
    || !(user.isGM || caster.testUserPermission(user, 'OWNER'))
    || f?.kind !== 'spell' || f.success !== true || !f.cast || !move
    || !f.steps?.some(step => step.sceneId === scene.id && step.tokenId === token.id)) return {ok:false,reason:'context'};
  const descriptor = spellCrossingFrom(move.spell);
  if (!descriptor || !same(descriptor, move.descriptor)) return {ok:false,reason:'descriptor'};
  const prior = message.getFlag(scope,'spellCrossingResolution');
  if (prior?.cast === f.cast && !(prior.state==='pending' && prior.phase==='ready'))
    return ['complete','reviewed'].includes(prior.state) ? {ok:true,already:true} : {ok:false,reason:'review'};
  const cast = f.cast, frozen = JSON.stringify(move), writer = game.user.id;
  const valid = () => game.user.isGM && game.users.activeGM?.id === writer && game.user.id === writer
    && game.messages.get(messageId) === message && message.flags[scope].cast === cast
    && message.flags[scope].success === true && message.flags[scope].spellLockCaster === caster.uuid
    && JSON.stringify(message.flags[scope].spellCrossing) === frozen
    && game.scenes.get(scene.id) === scene
    && scene.tokens.get(token.id) === token && token.actor === caster
    && crossingOriginMatches(token, {...move.origin, x:move.destination.x, y:move.destination.y});
  if (!valid()) return {ok:false,reason:'changed'};
  const path = crossingPath(token, move.destination, move.origin);
  if (!path) return {ok:false,reason:'path'};
  const claim = {cast,state:'pending',phase:'damage',writer};
  const admitted = await queueSignatureCard(message,async()=>{
    if (!valid() || !same(message.getFlag(scope,'spellCrossingResolution'),prior)) return false;
    await message.setFlag(scope,'spellCrossingResolution',claim);
    return valid() && same(message.getFlag(scope,'spellCrossingResolution'),claim);
  });
  if (!admitted) return {ok:false,reason:'review'};
  const held = () => valid() && same(message.getFlag(scope,'spellCrossingResolution'),claim);
  const results = [];
  for (const ref of path.targets) {
    const target = scene.tokens.get(ref.tokenId), actor = target?.actor;
    if (!actor) return {ok:false,reason:'target'};
    const result = await deliverSignatureAreaDamage({message,caster,actor,token:target,spell:f.tickSpell,
      damage:descriptor.damage,event:`crossing:${cast}:${target.uuid}`,
      validate:() => held() && target.actor === actor && actor.uuid === ref.actorUuid
        && crossingPath(token,move.destination,move.origin)?.targets.some(current => current.tokenId === ref.tokenId && same(current.space,ref.space)) === true});
    results.push(result);
    if (!result.ok) return {ok:false,reason:result.reason,results};
  }
  return queueSignatureCard(message,async()=>{
    if (!held()) return {ok:false,reason:'changed',results};
    const complete = {...claim,state:'complete'};
    await message.setFlag(scope,'spellCrossingResolution',complete);
    return {ok:valid() && same(message.getFlag(scope,'spellCrossingResolution'),complete),results};
  });
}
export async function requestSpellCrossing(message) {
  const gm = game.users.activeGM;
  if (!gm) return {ok:false,reason:'noGM'};
  try { return gm.id === game.user.id ? await deliverSpellCrossing({messageId:message.id},{user:game.user})
    : await gm.query(SPELL_CROSSING_QUERY,{messageId:message.id},{timeout:15000}); }
  catch { return {ok:false,reason:'uncertain'}; }
}
