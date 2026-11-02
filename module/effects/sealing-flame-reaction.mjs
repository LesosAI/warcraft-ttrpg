import {sealingFlameFrom} from '../rules/sealing-flame.mjs';
import {reserveSealingFlame,finishSealingFlameReservation,SEALING_FLAME_RECIPIENT} from './sealing-flame-recipient.mjs';
import {ownTokenOf} from './death-holds.mjs';
import {feetApart} from '../canvas/footprints.mjs';
import {answererOf,confirmHere} from './blow-doors.mjs';
import {injuryFightOf,injuriesFromFight} from './injury-provenance.mjs';
import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
import {queueSignatureCard} from './signature-card-queue.mjs';
import {sealingFlameWrites,sealingFlameReservations} from './sealing-flame-write-state.mjs';
const scope='azeroth-rpg',same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const SEALING_FLAME_CAST_QUERY='azeroth-rpg.sealingFlameCast';
export const SEALING_FLAME_HOLD_QUERY='azeroth-rpg.sealingFlameHold';
export const SEALING_FLAME_FINISH_QUERY='azeroth-rpg.sealingFlameFinish';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
function authorizedTarget(target,user){
 return game.user?.isGM&&game.users.activeGM?.id===game.user.id&&target&&user?.id
  &&game.users.get(user.id)===user&&(user.isGM||target.testUserPermission(user,'OWNER'));
}
export async function sealingFlameHoldQuery({targetUuid,before,amount}={}, {user}={}){
 const target=resolve(targetUuid);
 if(!authorizedTarget(target,user)||!Number.isFinite(before)||!Number.isFinite(amount)
  ||before<=0||amount<before||target.system.health.value!==before)throw Error('Sealing Flame hold request is invalid.');
 return askSealingFlame(target,{before,amount});
}
export async function sealingFlameFinishQuery({targetUuid,messageUuid,casterUuid}={}, {user}={}){
 const target=resolve(targetUuid);
 if(!authorizedTarget(target,user))throw Error('Sealing Flame finish request is invalid.');
 return finishSealingFlame(target,{messageUuid,casterUuid});
}
export async function requestSealingFlameHold(target,{before,amount}){
 const gm=game.users.activeGM;if(!gm)return null;
 const payload={targetUuid:target.uuid,before,amount};
 return gm.id===game.user.id?sealingFlameHoldQuery(payload,{user:game.user})
  :gm.query(SEALING_FLAME_HOLD_QUERY,payload,{timeout:150000});
}
export async function requestSealingFlameFinish(target,{messageUuid,casterUuid}){
 const gm=game.users.activeGM;if(!gm)throw Error('Sealing Flame cleanup needs an active GM.');
 const payload={targetUuid:target.uuid,messageUuid,casterUuid};
 return gm.id===game.user.id?sealingFlameFinishQuery(payload,{user:game.user})
  :gm.query(SEALING_FLAME_FINISH_QUERY,payload,{timeout:30000});
}

export function sealingFlameWindow({caster,target,claim,before}){
 if(!caster||!target||!claim||claim.state!=='reserved'||claim.casterUuid!==caster.uuid
  ||claim.writer!==game.users.activeGM?.id
  ||!same(target.getFlag(scope,SEALING_FLAME_RECIPIENT),claim)||target.system.health.value!==before||before<=0)return false;
 const origin=ownTokenOf(target),source=ownTokenOf(caster);
 if(!origin||!source||origin.parent!==source.parent)return false;
 const distance=feetApart(origin,source);
 return distance!==null&&distance<=30;
}

/** The caster answers and rolls on their own client; the GM owns the reservation. */
export async function sealingFlameCast({casterUuid,targetUuid,spellId,claim,before}={}, {user}={}){
 if(!user?.isGM)return null;
 const caster=resolve(casterUuid),target=resolve(targetUuid),spell=caster?.items.get(spellId);
 if(!caster?.isOwner||!sealingFlameFrom(spell)||!sealingFlameWindow({caster,target,claim,before}))return null;
 if(!await confirmHere(caster,{title:'Sealing Flame',text:`Cast Sealing Flame to save ${foundry.utils.escapeHTML(target.name)} from dropping to 0 Health?`}))return null;
 const token=ownTokenOf(target);
 const targets=[{actorId:target.id,sceneId:token.parent.id,tokenId:token.id,name:target.name}];
 const card=await game.system.azeroth.actions.castWithDialog(caster,spell,null,{targets,run:options=>{
  if(!sealingFlameWindow({caster,target,claim,before}))return null;
  return game.system.azeroth.workflows.castSpell({...options,sealingFlameClaim:{targetUuid,claim,before}});
 }});
 return card?.uuid??null;
}

/** Called by the authoritative zero-Health hold door. */
export async function askSealingFlame(target,{before,amount}){
 if(sealingFlameReservations.has(target.uuid))throw Error('Sealing Flame reaction is still running.');
 sealingFlameReservations.add(target.uuid);
 try{return await resolveSealingFlameReaction(target,{before,amount});}
 finally{sealingFlameReservations.delete(target.uuid);}
}

async function resolveSealingFlameReaction(target,{before,amount}){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||before<=0||amount<before
  ||target.getFlag(scope,SEALING_FLAME_RECIPIENT))return null;
 const origin=ownTokenOf(target);if(!origin)return null;
 const seen=new Set();
 for(const token of origin.parent.tokens){
  const caster=token.actor;if(!caster||seen.has(caster.uuid))continue;seen.add(caster.uuid);
  const spell=caster.items.find(item=>sealingFlameFrom(item));
  if(!spell||caster.system.health.value<=0||game.system.azeroth.workflows.turnBudgetRefusal(caster,'reaction'))continue;
  const distance=feetApart(origin,token);if(distance===null||distance>30)continue;
  const who=answererOf(caster);if(!who)continue;
  const reserved=await reserveSealingFlame(target,{cast:foundry.utils.randomID(),casterUuid:caster.uuid});
  if(!reserved.ok)return null;
  const payload={casterUuid:caster.uuid,targetUuid:target.uuid,spellId:spell.id,claim:reserved.claim,before};
  let card;
  try{
   const uuid=who.id===game.user.id?await sealingFlameCast(payload,{user:game.user})
    :await who.query(SEALING_FLAME_CAST_QUERY,payload,{timeout:120000});
   card=resolve(uuid);
  }catch{
   if(same(target.getFlag(scope,SEALING_FLAME_RECIPIENT),reserved.claim))await target.setFlag(scope,SEALING_FLAME_RECIPIENT,{...reserved.claim,state:'uncertain'});
   throw Error('Sealing Flame casting is unresolved; review the pending damage and rescue before continuing.');
  }
  if(!card||card.flags?.[scope]?.success!==true){
   const released=await finishSealingFlameReservation(target,reserved.claim,{rescued:false});
   if(!released.ok)throw Error('Sealing Flame reservation release could not be confirmed.');
   continue;
  }
  if(!sealingFlameWindow({caster,target,claim:reserved.claim,before}))throw Error('Sealing Flame target changed during casting.');
  const castFlags=card.flags[scope];
  if(castFlags.spellLockCaster!==caster.uuid||castFlags.sealingFlame?.targetUuid!==target.uuid
   ||!same(castFlags.sealingFlame?.claim,reserved.claim))throw Error('Sealing Flame returned a different cast.');
  if(!await finishSealingFlameReservation(target,reserved.claim,{rescued:true}).then(r=>r.ok))throw Error('Sealing Flame benefit could not be confirmed.');
  return {amount:Math.max(0,before-1),held:{kind:'sealingFlame',name:spell.name},sealingFlame:{messageUuid:card.uuid,casterUuid:caster.uuid}};
 }
 return null;
}

/** The incoming hit has now left 1 Health; close wounds and resolve the printed
 * Fire through the normal mitigation path with this hit's floor only. */
export async function finishSealingFlame(target,options){
 const message=resolve(options.messageUuid);
 if(!message)throw Error('Sealing Flame card is missing.');
 if(sealingFlameWrites.has(message.id))throw Error('Sealing Flame cleanup is still running.');
 sealingFlameWrites.add(message.id);
 try{return await finishSealingFlameCleanup(target,options);}
 finally{sealingFlameWrites.delete(message.id);}
}

async function finishSealingFlameCleanup(target,{messageUuid,casterUuid}){
 const message=resolve(messageUuid),caster=resolve(casterUuid),f=message?.flags?.[scope];
 const saved=f?.sealingFlame,recipient=target.getFlag(scope,SEALING_FLAME_RECIPIENT);
 const cast=f?.cast,savedSnapshot=JSON.stringify(saved),writer=game.user.id;
 const valid=()=>game.user.isGM&&game.user.id===writer&&game.users.activeGM?.id===writer&&f?.success===true
  &&resolve(messageUuid)===message&&message.flags[scope].cast===cast
  &&message.flags[scope].success===true&&JSON.stringify(message.flags[scope].sealingFlame)===savedSnapshot
  &&f.spellLockCaster===caster?.uuid&&saved?.targetUuid===target.uuid
  &&recipient?.state==='used'&&same(target.getFlag(scope,SEALING_FLAME_RECIPIENT),recipient)
  &&recipient.cast===saved.claim.cast&&target.system.health.value>=1;
 if(!valid())throw Error('Sealing Flame rescue requires review.');
 const claim={state:'pending',cast,writer,targetUuid:target.uuid};
 const admission=await queueSignatureCard(message,async()=>{
  if(!valid())throw Error('Sealing Flame changed before cleanup.');
  const prior=message.getFlag(scope,'sealingFlameCleanup');
  if(prior){if(prior.cast===cast&&['complete','reviewed'].includes(prior.state))return false;throw Error('Sealing Flame cleanup needs review.');}
  await message.setFlag(scope,'sealingFlameCleanup',claim);
  if(!valid()||!same(message.getFlag(scope,'sealingFlameCleanup'),claim))throw Error('Sealing Flame cleanup claim was not confirmed.');
  return true;
 });
 if(!admission)return {ok:true,already:true};
 const held=()=>valid()&&same(message.getFlag(scope,'sealingFlameCleanup'),claim);
 const bleeding=[...target.effects].filter(effect=>effect.statuses?.has('bleeding')).map(effect=>effect.id);
 if(bleeding.length)await target.deleteEmbeddedDocuments('ActiveEffect',bleeding);
 if(!held())throw Error('Sealing Flame cleanup changed during resolution.');
 const injuries=injuriesFromFight(target.effects,injuryFightOf(target));
 for(const effect of injuries){
  if(!held())throw Error('Sealing Flame injury cleanup requires review.');
  await effect.update({[`flags.${scope}.sealingFlameStabilized`]:{cast:f.cast,messageUuid},description:`${effect.description??''}<p>Sealing Flame: this injury stops worsening. Its existing penalties remain.</p>`});
 }
 const token=ownTokenOf(target);
 const result=await deliverSignatureAreaDamage({message,caster,actor:target,token,spell:f.tickSpell,damage:saved.descriptor.damage,
  event:`sealingFlame:${f.cast}:${target.uuid}`,validate:held});
 if(!result.ok)throw Error('Sealing Flame Fire damage requires review.');
 await queueSignatureCard(message,async()=>{
  if(!held())throw Error('Sealing Flame cleanup changed before completion.');
  const complete={...claim,state:'complete'};await message.setFlag(scope,'sealingFlameCleanup',complete);
  if(!valid()||!same(message.getFlag(scope,'sealingFlameCleanup'),complete))throw Error('Sealing Flame completion was not confirmed.');
 });
 return result;
}
