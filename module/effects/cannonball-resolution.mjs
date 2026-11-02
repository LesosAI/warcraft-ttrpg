import {cannonballDamage,CANNONBALL_IDENTIFIER} from '../rules/cannonball-runner.mjs';
import {dealtHalvedBy} from '../rules/legacy-uses.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const CANNONBALL_REVIEW='systems/azeroth-rpg/templates/chat/partials/cannonball-review.hbs';
export const CANNONBALL_RESOLVE_QUERY='azeroth-rpg.resolveCannonball';
export const CANNONBALL_SAVE_QUERY='azeroth-rpg.performCannonballSave';
const busy=new Set();
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const gmHere=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function targetOf(shot){
 const ref=shot?.target;if(!ref)return null;
 const actor=ref.sceneId&&ref.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor
  :!ref.sceneId&&!ref.tokenId?resolve(`Actor.${ref.actorId}`):null;
 return actor?.id===ref.actorId&&actor?.uuid===shot.targetUuid?actor:null;
}
function shotOf(message){
 const flags=message?.flags?.['azeroth-rpg'],shot=flags?.cannonball;
 return message?.author?.isGM&&flags.kind==='signature'&&flags.identifier===CANNONBALL_IDENTIFIER
  &&shot?.version===1&&shot.identifier===CANNONBALL_IDENTIFIER
  &&Number.isInteger(shot.dc)&&shot.dc>=10&&Number.isInteger(shot.damage)&&shot.damage>=0?shot:null;
}
/** Only the active GM may ask the target's client to roll this saved shot. */
export async function performCannonballSave({messageUuid,key}={}, {user}={}){
 if(!user?.isGM||user.id!==game.users.activeGM?.id)return {ok:false};
 const message=resolve(messageUuid),shot=shotOf(message),actor=targetOf(shot);
 const valid=()=>actor?.isOwner&&resolve(messageUuid)===message&&targetOf(shotOf(message))===actor
  &&shotOf(message)?.state==='saving'&&shotOf(message).claim?.key===key
  &&shotOf(message).claim.requester===game.user.id&&game.users.activeGM?.id===user.id;
 if(!valid())return {ok:false};
 const {resilienceWithDialog}=await import('../applications/actions.mjs');
 const card=await resilienceWithDialog(actor,'reflex',null,{dc:shot.dc,
  link:{messageId:message.id,index:0,...shot.target,identifier:CANNONBALL_IDENTIFIER,cast:key}});
 if(!valid())return {ok:false};
 return card?{ok:true,cardUuid:card.uuid}:{ok:true,cancelled:true};
}
/** One claimed save and one claimed delivery. Amounts and recipients are read
 * from the GM-authored shot, never accepted from the caller. */
export async function resolveCannonball({messageUuid}={}, {user}={}){
 if(!gmHere()||!user?.id)return {ok:false,reason:'authority'};
 const message=resolve(messageUuid);let expected=shotOf(message);
 const target=targetOf(expected),caster=resolve(expected?.casterUuid);
 if(!expected||!target||caster?.documentName!=='Actor'||!target.testUserPermission(user,'OWNER'))return {ok:false,reason:'target'};
 if(expected.state!=='awaitingSave')return {ok:false,reason:'used'};
 if(busy.has(messageUuid))return {ok:false,reason:'busy'};
 busy.add(messageUuid);
 const valid=()=>gmHere()&&resolve(messageUuid)===message&&same(shotOf(message),expected)
  &&targetOf(expected)===target&&resolve(expected.casterUuid)===caster&&target.testUserPermission(user,'OWNER');
 const save=async next=>{
  if(!valid())throw Error('Cannonball state changed');
  await message.setFlag('azeroth-rpg','cannonball',next);expected=next;
  if(!valid())throw Error('Cannonball write unconfirmed');
 };
 try{
  const key=foundry.utils.randomID(32);
  await save({...expected,state:'saving',claim:{key,writer:game.user.id,requester:user.id}});
  const payload={messageUuid,key};
  const answer=user.id===game.user.id?await performCannonballSave(payload,{user:game.user})
   :await user.query(CANNONBALL_SAVE_QUERY,payload,{timeout:180000});
  if(!valid()||answer?.ok!==true)return {ok:false,reason:'saveUncertain'};
  if(answer.cancelled===true&&!answer.cardUuid){
   await save({...expected,state:'awaitingSave',claim:null});return {ok:true,cancelled:true};
  }
  const card=await fromUuid(answer.cardUuid),flags=card?.flags?.['azeroth-rpg'],link=flags?.resistOf,roll=card?.rolls?.[0];
  if(!valid()||card?.author?.id!==user.id||card?.speaker?.actor!==target.id||flags?.kind!=='resilience'
   ||flags.resilience!=='reflex'||link?.messageId!==message.id||link.cast!==key||link.index!==0
   ||link.actorId!==target.id||link.sceneId!==(expected.target.sceneId??null)||link.tokenId!==(expected.target.tokenId??null)
   ||link.identifier!==CANNONBALL_IDENTIFIER||!Number.isFinite(roll?.total)
   ||roll?.options?.dc!==expected.dc||typeof roll?.outcome?.success!=='boolean')return {ok:false,reason:'saveUncertain'};
  const passed=roll.outcome.success;
  const row=cannonballDamage(expected,{passed,apByLocation:target.system.ap??{},immune:target.system.immune??[],
   vulnerable:target.system.vulnerable??[],dealtHalved:dealtHalvedBy(caster)});
  if(!row)return {ok:false,reason:'damage'};
  await save({...expected,state:'applying',save:{uuid:card.uuid,total:roll.total,passed},damageResult:row});
  const outcome={};
  if(row.damage>0)await target.applyDamage(row.damage,{by:caster,struck:true,attack:false,spell:false,
   type:'physical',location:'body',messageId:message.id,outcome});
  else outcome.complete=true;
  if(!valid()||outcome.complete!==true)return {ok:false,reason:'damageUncertain'};
  await save({...expected,state:'complete',outcome});
  return {ok:true,passed,damage:row.damage};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(messageUuid);}
}
export async function requestCannonballSave(message){
 const gm=game.users.activeGM;let result;
 try{
  result=gm?(gm.id===game.user.id?await resolveCannonball({messageUuid:message.uuid},{user:game.user})
   :await gm.query(CANNONBALL_RESOLVE_QUERY,{messageUuid:message.uuid},{timeout:240000})):null;
 }catch{/* An uncertain save or damage write remains claimed. */}
 if(!result?.ok)ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.Cannonball.Unresolved'));
 return result;
}
export function cannonballReviewState(message){
 const shot=shotOf(message),target=targetOf(shot),caster=resolve(shot?.casterUuid);
 const snapshot={shot:shot??null,target:target?.uuid??null,health:target?.system?.health??null,
  caster:caster?.uuid??null,pools:caster?.poolSnapshot?.()??[],
  budget:caster?.activeFight?.()?.getCombatantsByActor(caster)?.[0]?.budget??null};
 return {...snapshot,pending:['saving','applying'].includes(shot?.state),expected:JSON.stringify(snapshot)};
}
/** Close a manually reconciled shot; never reroll, refund or replay damage. */
export async function reviewCannonballResolution(message,{expected,acknowledged=false}={}){
 if(!gmHere()||acknowledged!==true)return {ok:false,reason:'authority'};
 if(busy.has(message?.uuid))return {ok:false,reason:'busy'};
 const state=cannonballReviewState(message);
 if(resolve(message?.uuid)!==message||!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
 const writer=state.shot.claim?.writer;
 if(writer&&writer!==game.user.id&&game.users.get(writer)?.active)return {ok:false,reason:'writerActive'};
 busy.add(message.uuid);
 try{
  const next={...state.shot,state:'reviewed',review:{by:game.user.id,at:Date.now()}};
  await message.setFlag('azeroth-rpg','cannonball',next);
  return {ok:gmHere()&&resolve(message.uuid)===message&&same(shotOf(message),next)};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(message.uuid);}
}
export function showCannonballState(message,html){
 const shot=shotOf(message);if(!shot)return;
 const button=html.querySelector('[data-action="cannonballSave"]');
 if(button)button.disabled=shot.state!=='awaitingSave';
 const line=html.querySelector('[data-cannonball-state]');
 if(line)line.textContent=shot.state==='complete'
  ?game.i18n.format('AZEROTH.Signature.Cannonball.Complete',{total:shot.save.total,damage:shot.damageResult.damage})
  :game.i18n.localize(shot.state==='reviewed'?'AZEROTH.Signature.Cannonball.Review.Done'
   :shot.state==='awaitingSave'?'AZEROTH.Signature.Cannonball.AwaitingSave':'AZEROTH.Signature.Cannonball.Unresolved');
 if(gmHere()&&['saving','applying'].includes(shot.state)){
  const review=drawCardPartial(CANNONBALL_REVIEW,{},message);
  if(review)html.querySelector('.azeroth-card')?.append(review);
 }
}
