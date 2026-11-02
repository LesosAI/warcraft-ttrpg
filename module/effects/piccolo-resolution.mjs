import {piccoloResistance,PICCOLO_IDENTIFIER} from '../rules/piccolo.mjs';
import {layBane} from './banes.mjs';
import {untilEndOfNextTurnOrRound} from './durations.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const PICCOLO_REVIEW='systems/azeroth-rpg/templates/chat/partials/piccolo-review.hbs';
export const PICCOLO_RESOLVE_QUERY='azeroth-rpg.resolvePiccolo';
export const PICCOLO_SAVE_QUERY='azeroth-rpg.performPiccoloSave';
const busy=new Set();
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const gmHere=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function performanceOf(message){
  const flags=message?.flags?.['azeroth-rpg'],performance=flags?.piccolo;
  return message?.author?.isGM&&flags.kind==='signature'&&flags.identifier===PICCOLO_IDENTIFIER
    &&performance?.version===1&&performance.identifier===PICCOLO_IDENTIFIER
    &&Number.isInteger(performance.dc)&&performance.dc>=10&&Array.isArray(performance.targets)?performance:null;
}
function targetOf(row){
  const ref=row?.ref;if(!ref)return null;
  const actor=ref.sceneId&&ref.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor
    :!ref.sceneId&&!ref.tokenId?resolve(`Actor.${ref.actorId}`):null;
  return actor?.uuid===row.uuid&&actor?.id===ref.actorId?actor:null;
}
export async function performPiccoloSave({messageUuid,index,key}={}, {user}={}){
  if(!user?.isGM||user.id!==game.users.activeGM?.id||!Number.isInteger(index)||index<0)return {ok:false};
  const message=resolve(messageUuid),performance=performanceOf(message),row=performance?.targets[index],actor=targetOf(row);
  const valid=()=>actor?.isOwner&&resolve(messageUuid)===message&&same(performanceOf(message),performance)
    &&targetOf(row)===actor&&row?.state==='saving'&&row.claim?.key===key
    &&row.claim.requester===game.user.id&&game.users.activeGM?.id===user.id;
  if(!valid())return {ok:false};
  const {resilienceWithDialog}=await import('../applications/actions.mjs');
  const card=await resilienceWithDialog(actor,'spirit',null,{dc:performance.dc,
    link:{messageId:message.id,index,...row.ref,identifier:PICCOLO_IDENTIFIER,cast:key}});
  if(!valid())return {ok:false};
  return card?{ok:true,cardUuid:card.uuid}:{ok:true,cancelled:true};
}

/** Saved, GM-authored recipients each get one claimed Spirit Test and one
 * claimed Bane delivery. Interrupted writes remain pending, never replayed. */
export async function resolvePiccolo({messageUuid,index}={}, {user}={}){
  if(!gmHere()||!user?.id||!Number.isInteger(index)||index<0)return {ok:false,reason:'authority'};
  const message=resolve(messageUuid);let expected=performanceOf(message);
  const target=targetOf(expected?.targets[index]),caster=resolve(expected?.casterUuid);
  if(!expected||!target||caster?.documentName!=='Actor'||!target.testUserPermission(user,'OWNER'))return {ok:false,reason:'target'};
  if(expected.targets[index].state!=='awaitingSave')return {ok:false,reason:'used'};
  if(busy.has(messageUuid))return {ok:false,reason:'busy'};
  busy.add(messageUuid);
  const valid=()=>gmHere()&&resolve(messageUuid)===message&&same(performanceOf(message),expected)
    &&targetOf(expected.targets[index])===target&&resolve(expected.casterUuid)===caster&&target.testUserPermission(user,'OWNER');
  const save=async patch=>{
    if(!valid())throw Error('Piccolo state changed');
    const next=structuredClone(expected);Object.assign(next.targets[index],patch);
    await message.setFlag('azeroth-rpg','piccolo',next);expected=next;
    if(!valid())throw Error('Piccolo write unconfirmed');
  };
  try{
    const key=foundry.utils.randomID(32);
    await save({state:'saving',claim:{key,writer:game.user.id,requester:user.id}});
    const payload={messageUuid,index,key};
    const answer=user.id===game.user.id?await performPiccoloSave(payload,{user:game.user})
      :await user.query(PICCOLO_SAVE_QUERY,payload,{timeout:180000});
    if(!valid()||answer?.ok!==true)return {ok:false,reason:'saveUncertain'};
    if(answer.cancelled===true&&!answer.cardUuid){
      await save({state:'awaitingSave',claim:null});return {ok:true,cancelled:true};
    }
    const card=await fromUuid(answer.cardUuid),flags=card?.flags?.['azeroth-rpg'],link=flags?.resistOf,roll=card?.rolls?.[0];
    const row=expected.targets[index],ref=row.ref;
    if(!valid()||card?.author?.id!==user.id||card?.speaker?.actor!==target.id||flags?.kind!=='resilience'
      ||flags.resilience!=='spirit'||link?.messageId!==message.id||link.cast!==key||link.index!==index
      ||link.actorId!==target.id||link.sceneId!==(ref.sceneId??null)||link.tokenId!==(ref.tokenId??null)
      ||link.identifier!==PICCOLO_IDENTIFIER||!Number.isFinite(roll?.total)
      ||roll?.options?.dc!==expected.dc||typeof roll?.outcome?.success!=='boolean')return {ok:false,reason:'saveUncertain'};
    const result=piccoloResistance(expected,{targetUuid:target.uuid,total:roll.total,success:roll.outcome.success});
    if(!result)return {ok:false,reason:'resistance'};
    await save({state:'applying',save:{uuid:card.uuid,total:roll.total,passed:result.passed}});
    let effect=null;
    if(result.attackBanes){
      effect=await layBane({victim:target,kind:'attack',banes:result.attackBanes,source:expected.name,
        by:caster,span:untilEndOfNextTurnOrRound(target),stackGroup:PICCOLO_IDENTIFIER});
      if(!valid()||!effect?.effectId)return {ok:false,reason:'deliveryUncertain'};
    }
    await save({state:'complete',effectId:effect?.effectId??null});
    return {ok:true,passed:result.passed};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(messageUuid);}
}
export async function requestPiccoloSave(message,index){
  const gm=game.users.activeGM;let result;
  try{
    const payload={messageUuid:message.uuid,index};
    result=gm?(gm.id===game.user.id?await resolvePiccolo(payload,{user:game.user})
      :await gm.query(PICCOLO_RESOLVE_QUERY,payload,{timeout:240000})):null;
  }catch{/* Retain any uncertain save or effect claim. */}
  if(!result?.ok)ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.Piccolo.Unresolved'));
  return result;
}
export function piccoloReviewState(message,index){
  const performance=performanceOf(message),row=Number.isInteger(index)&&index>=0?performance?.targets[index]:null;
  const target=targetOf(row),caster=resolve(performance?.casterUuid);
  const effects=(target?.effects??[]).filter(effect=>effect.getFlag('azeroth-rpg','laidBane')?.stackGroup===PICCOLO_IDENTIFIER)
    .map(effect=>effect.toObject()).sort((a,b)=>String(a._id).localeCompare(String(b._id)));
  const snapshot={performance:performance??null,index,row:row??null,target:target?.uuid??null,effects,
    caster:caster?.uuid??null,use:caster?.getFlag?.('azeroth-rpg','approvedSignatureUses')?.[PICCOLO_IDENTIFIER]??null,
    budget:caster?.activeFight?.()?.getCombatantsByActor(caster)?.[0]?.budget??null};
  return {...snapshot,pending:['saving','applying'].includes(row?.state),expected:JSON.stringify(snapshot)};
}
/** Close only this manually reconciled recipient. Survives deleted participants
 * and items; never changes effects, action payment or the shared rest allowance. */
export async function reviewPiccoloResolution(message,index,{expected,acknowledged=false}={}){
  if(!gmHere()||acknowledged!==true)return {ok:false,reason:'authority'};
  if(busy.has(message?.uuid))return {ok:false,reason:'busy'};
  const state=piccoloReviewState(message,index);
  if(resolve(message?.uuid)!==message||!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
  const writer=state.row.claim?.writer;
  if(writer&&writer!==game.user.id&&game.users.get(writer)?.active)return {ok:false,reason:'writerActive'};
  busy.add(message.uuid);
  try{
    const next=structuredClone(state.performance);
    next.targets[index]={...next.targets[index],state:'reviewed',review:{by:game.user.id,at:Date.now()}};
    await message.setFlag('azeroth-rpg','piccolo',next);
    return {ok:gmHere()&&resolve(message.uuid)===message&&same(performanceOf(message),next)};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(message.uuid);}
}
export function showPiccoloState(message,html){
  const performance=performanceOf(message);if(!performance)return;
  for(const [index,row] of performance.targets.entries()){
    const block=html.querySelector(`[data-piccolo-target="${index}"]`);if(!block)continue;
    const button=block.querySelector('[data-action="piccoloSave"]');
    if(button)button.disabled=row.state!=='awaitingSave';
    const line=block.querySelector('[data-piccolo-state]');
    if(line)line.textContent=game.i18n.localize(row.state==='complete'
      ?row.save.passed?'AZEROTH.Signature.Piccolo.Passed':'AZEROTH.Signature.Piccolo.Failed'
      :row.state==='reviewed'?'AZEROTH.Signature.Piccolo.Review.Done'
      :row.state==='awaitingSave'?'AZEROTH.Signature.Piccolo.AwaitingSave':'AZEROTH.Signature.Piccolo.Unresolved');
    if(gmHere()&&['saving','applying'].includes(row.state)){
      const review=drawCardPartial(PICCOLO_REVIEW,{index},message);
      if(review)block.append(review);
    }
  }
}
