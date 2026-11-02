import {helmetResistance,HELMET_IDENTIFIER} from '../rules/horned-helmet.mjs';
import {refuseIceBlockTarget} from './ice-block-protection.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const HELMET_REVIEW='systems/azeroth-rpg/templates/chat/partials/helmet-review.hbs';
export const HELMET_RESOLVE_QUERY='azeroth-rpg.resolveHelmetStrike';
export const HELMET_SAVE_QUERY='azeroth-rpg.performHelmetSave';
const busy=new Set();
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const gmHere=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function strikeOf(message){
  const flags=message?.flags?.['azeroth-rpg'],strike=flags?.helmetStrike;
  return message?.author?.isGM&&flags.kind==='signature'&&flags.identifier===HELMET_IDENTIFIER
    &&strike?.version===1&&strike.identifier===HELMET_IDENTIFIER&&Number.isInteger(strike.dc)&&strike.dc>=10?strike:null;
}
function targetOf(strike){
  const ref=strike?.target;if(!ref)return null;
  const actor=ref.sceneId&&ref.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor
    :!ref.sceneId&&!ref.tokenId?resolve(`Actor.${ref.actorId}`):null;
  return actor?.id===ref.actorId&&actor?.uuid===strike.targetUuid?actor:null;
}
export async function performHelmetSave({messageUuid,key}={}, {user}={}){
  if(!user?.isGM||user.id!==game.users.activeGM?.id)return {ok:false};
  const message=resolve(messageUuid),strike=strikeOf(message),actor=targetOf(strike);
  const valid=()=>actor?.isOwner&&resolve(messageUuid)===message&&same(strikeOf(message),strike)
    &&targetOf(strike)===actor&&strike.state==='saving'&&strike.claim?.key===key
    &&strike.claim.requester===game.user.id&&game.users.activeGM?.id===user.id;
  if(!valid())return {ok:false};
  const {resilienceWithDialog}=await import('../applications/actions.mjs');
  const card=await resilienceWithDialog(actor,'body',null,{dc:strike.dc,
    link:{messageId:message.id,index:0,...strike.target,identifier:HELMET_IDENTIFIER,cast:key}});
  if(!valid())return {ok:false};
  return card?{ok:true,cardUuid:card.uuid}:{ok:true,cancelled:true};
}
export async function resolveHelmetStrike({messageUuid}={}, {user}={}){
  if(!gmHere()||!user?.id)return {ok:false,reason:'authority'};
  const message=resolve(messageUuid);let expected=strikeOf(message);
  const target=targetOf(expected),caster=resolve(expected?.casterUuid);
  if(!expected||!target||caster?.documentName!=='Actor'||!target.testUserPermission(user,'OWNER'))return {ok:false,reason:'target'};
  if(expected.state!=='awaitingSave')return {ok:false,reason:'used'};
  if(busy.has(messageUuid))return {ok:false,reason:'busy'};
  busy.add(messageUuid);
  const valid=()=>gmHere()&&resolve(messageUuid)===message&&same(strikeOf(message),expected)
    &&targetOf(expected)===target&&resolve(expected.casterUuid)===caster&&target.testUserPermission(user,'OWNER');
  const save=async next=>{
    if(!valid())throw Error('Helmet strike changed');
    await message.setFlag('azeroth-rpg','helmetStrike',next);expected=next;
    if(!valid())throw Error('Helmet write unconfirmed');
  };
  try{
    const key=foundry.utils.randomID(32);
    await save({...expected,state:'saving',claim:{key,writer:game.user.id,requester:user.id}});
    const payload={messageUuid,key};
    const answer=user.id===game.user.id?await performHelmetSave(payload,{user:game.user})
      :await user.query(HELMET_SAVE_QUERY,payload,{timeout:180000});
    if(!valid()||answer?.ok!==true)return {ok:false,reason:'saveUncertain'};
    if(answer.cancelled===true&&!answer.cardUuid){
      await save({...expected,state:'awaitingSave',claim:null});return {ok:true,cancelled:true};
    }
    const card=await fromUuid(answer.cardUuid),flags=card?.flags?.['azeroth-rpg'],link=flags?.resistOf,roll=card?.rolls?.[0];
    const ref=expected.target;
    if(!valid()||card?.author?.id!==user.id||card?.speaker?.actor!==target.id||flags?.kind!=='resilience'
      ||flags.resilience!=='body'||link?.messageId!==message.id||link.cast!==key||link.index!==0
      ||link.actorId!==target.id||link.sceneId!==(ref.sceneId??null)||link.tokenId!==(ref.tokenId??null)
      ||link.identifier!==HELMET_IDENTIFIER||!Number.isFinite(roll?.total)
      ||roll?.options?.dc!==expected.dc||typeof roll?.outcome?.success!=='boolean')return {ok:false,reason:'saveUncertain'};
    const result=helmetResistance({dc:expected.dc,total:roll.total,success:roll.outcome.success});if(!result)return {ok:false,reason:'resistance'};
    await save({...expected,state:'applying',save:{uuid:card.uuid,total:roll.total,passed:result.passed}});
    let prevented=false;
    if(result.prone&&!target.statuses.has('prone')){
      if(refuseIceBlockTarget(target))prevented=true;
      else{
        const applied=await target.toggleStatusEffect('prone',{active:true});
        if(!valid())return {ok:false,reason:'deliveryUncertain'};
        if(!target.statuses.has('prone')){
          if(applied===false)prevented=true; // Confirmed immunity or Stabilizer refusal.
          else return {ok:false,reason:'deliveryUncertain'};
        }
      }
    }
    await save({...expected,state:'complete',prevented,prone:result.prone&&!prevented});
    return {ok:true,passed:result.passed,prevented};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(messageUuid);}
}
export async function requestHelmetSave(message){
  const gm=game.users.activeGM;let result;
  try{
    const payload={messageUuid:message.uuid};
    result=gm?(gm.id===game.user.id?await resolveHelmetStrike(payload,{user:game.user})
      :await gm.query(HELMET_RESOLVE_QUERY,payload,{timeout:240000})):null;
  }catch{/* Keep any uncertain save or condition delivery claimed. */}
  if(!result?.ok)ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.Helmet.Unresolved'));
  return result;
}
export function helmetReviewState(message){
  const strike=strikeOf(message),target=targetOf(strike),caster=resolve(strike?.casterUuid);
  const snapshot={strike,target:target?.uuid??null,statuses:[...(target?.statuses??[])],
    effects:[...(target?.effects??[])].map(e=>e.toObject?.()??{id:e.id,flags:e.flags,disabled:e.disabled}),
    caster:caster?.uuid??null};
  return {...snapshot,pending:['saving','applying'].includes(strike?.state),expected:JSON.stringify(snapshot)};
}
export async function reviewHelmetResolution(message,{expected,acknowledged=false}={}){
  if(!gmHere()||acknowledged!==true)return {ok:false,reason:'authority'};
  if(busy.has(message?.uuid))return {ok:false,reason:'busy'};
  const state=helmetReviewState(message);
  if(resolve(message?.uuid)!==message||!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
  const writer=state.strike.claim?.writer;
  if(writer&&writer!==game.user.id&&game.users.get?.(writer)?.active)return {ok:false,reason:'writerActive'};
  busy.add(message.uuid);
  try{
    const next={...state.strike,state:'reviewed',review:{by:game.user.id,at:Date.now()}};
    await message.setFlag('azeroth-rpg','helmetStrike',next);
    return {ok:Boolean(gmHere()&&resolve(message.uuid)===message&&same(strikeOf(message),next))};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(message.uuid);}
}
export function showHelmetState(message,html){
  const strike=strikeOf(message);if(!strike)return;
  const button=html.querySelector('[data-action="helmetSave"]');if(button)button.disabled=strike.state!=='awaitingSave';
  const line=html.querySelector('[data-helmet-state]');
  if(line)line.textContent=game.i18n.localize(strike.state==='complete'
    ?strike.prevented?'AZEROTH.Signature.Helmet.Prevented':strike.save.passed?'AZEROTH.Signature.Helmet.Passed':'AZEROTH.Signature.Helmet.Failed'
    :strike.state==='reviewed'?'AZEROTH.HungerMastered.ReviewDone'
    :strike.state==='awaitingSave'?'AZEROTH.Signature.Helmet.AwaitingSave':'AZEROTH.Signature.Helmet.Unresolved');
  if(gmHere()&&['saving','applying'].includes(strike.state)){
    const review=drawCardPartial(HELMET_REVIEW,{},message);
    if(review)html.querySelector('.azeroth-card')?.append(review);
  }
}
