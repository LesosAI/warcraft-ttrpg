import {jangthrazeReward,JANGTHRAZE_IDENTIFIER} from '../rules/signature-hit-use.mjs';
export const SIGNATURE_HIT_USES='signatureHitUses';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function targetOf(ref){
  if(ref?.sceneId&&ref?.tokenId){
    const actor=resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor;
    return actor?.id===ref.actorId?actor:null;
  }
  return !ref?.sceneId&&!ref?.tokenId&&ref?.actorId?resolve(`Actor.${ref.actorId}`):null;
}
/** Read-only on both clients. The active-GM shared-use coordinator owns all
 * writes, rest serialization and requester permission checks. */
export function prepareJangthrazeHit({actor,item,hit}={}){
  if(!actor||!item||!Number.isInteger(hit?.index)||hit.index<0)return {ok:false,reason:'hit'};
  const message=resolve(hit.messageUuid),index=hit.index;
  if(!message||message.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)?.[JANGTHRAZE_IDENTIFIER])return {ok:false,reason:'hitUsed'};
  const read=()=>{
    if(resolve(actor.uuid)!==actor||resolve(hit.messageUuid)!==message||item.parent!==actor
      ||actor.items.get(item.id)!==item||item.system.identifier!==JANGTHRAZE_IDENTIFIER
      ||item.system.equipped!==true||item.system.signatureEffect?.kind!=='onHit'
      ||!actor.readyWeapons?.().includes(item)||ChatMessage.getSpeakerActor(message.speaker)!==actor)return null;
    const flags=message.flags?.['azeroth-rpg']??{},ref=flags.targets?.[index],target=targetOf(ref);
    const damage=flags.damageByTarget?.[index],resolution=flags.attackResolution?.targets?.[index];
    if(!target||flags.attackResolution?.version!==1||resolution?.targetUuid!==target.uuid)return null;
    const ownModifiers=Object.fromEntries(Object.entries(actor.system.abilities??{})
      .map(([key,value])=>[key,value.own?.mod??value.mod]));
    const values=jangthrazeReward({identifier:item.system.identifier,itemId:item.id,weaponId:flags.strike?.weapon?.id,
      kind:flags.kind,success:message.rolls?.[0]?.outcome?.success,parry:flags.parry,notAttack:flags.notAttack,
      hit:damage?.hit,withdrawn:damage?.withdrawn,stage:resolution.stage,
      preventedByDispersion:resolution.preventedByDispersion,ownModifiers});
    return values?{hit:{messageUuid:message.uuid,index,targetUuid:target.uuid},values,
      ref:structuredClone(ref),damage:structuredClone(damage),resolution:structuredClone(resolution)}:null;
  };
  const snapshot=read();if(!snapshot)return {ok:false,reason:'hit'};
  return {ok:true,hit:snapshot.hit,values:snapshot.values,valid:()=>same(read(),snapshot)};
}
/** Called only inside the approved-use workflow after its ordinary refusal
 * checks. Claim the hit before granting Health, and retain uncertainty. */
export async function deliverJangthrazeHit({actor,item,hit,values,valid,paid}={}){
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||!valid())return null;
  const message=resolve(hit?.messageUuid),records=structuredClone(message?.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)??{});
  if(!message||records[JANGTHRAZE_IDENTIFIER])return null;
  const claim={state:'pending',writer:game.user.id,itemUuid:item.uuid,index:hit.index,targetUuid:hit.targetUuid,values};
  const next={...records,[JANGTHRAZE_IDENTIFIER]:claim};
  // A failed claim write may have succeeded remotely: leave the shared use
  // pending rather than returning it to ready and permitting a second delivery.
  paid();await message.setFlag('azeroth-rpg',SIGNATURE_HIT_USES,next);
  const held=()=>valid()&&resolve(message.uuid)===message&&same(message.getFlag('azeroth-rpg',SIGNATURE_HIT_USES),next);
  if(!held())return null;
  const outcome=await actor.grantTemporaryHealth(values.temporaryHealth,{source:item.name,span:'encounter'});
  if(!held()||typeof outcome?.landed!=='boolean'||!Number.isFinite(outcome.temp))return null;
  next[JANGTHRAZE_IDENTIFIER]={...claim,state:'complete',outcome};
  await message.setFlag('azeroth-rpg',SIGNATURE_HIT_USES,next);
  return held()?message:null;
}
