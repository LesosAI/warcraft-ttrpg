import {queueSignatureCard} from './signature-card-queue.mjs';
import {deliverTurnSignatures,signatureHealingReceipt} from './signature-turn-use.mjs';
import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
import {signatureTurnIdentity} from '../rules/signature-turn-uses.mjs';
export const SIGNATURE_HEALING_QUERY='azeroth-rpg.signatureHealingApply';
const FLAG='signatureHealingDelivery';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const targetActor=target=>{
 const actor=target?.sceneId&&target?.tokenId?resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`)?.actor
  : !target?.sceneId&&!target?.tokenId?game.actors.get(target?.actorId):null;
 return actor?.id===target?.actorId?actor:null;
};
const authority=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const snapshot=flags=>JSON.stringify({kind:flags.kind,success:flags.success,cast:flags.cast,spellUuid:flags.spellUuid,
 caster:flags.healingSignatureCaster,self:flags.healingSignatureSelf,amount:flags.heal,amounts:flags.healingSignatureAmounts,
 targets:flags.targets,bonuses:flags.chosenHealingBonuses,aegis:flags.aegis,miracle:flags.miracle,overflow:flags.healOverflow});

export async function requestSignatureHealing(message,index){
 const gm=game.users.activeGM;if(!gm)return {ok:false,reason:'noGM'};
 const payload={messageUuid:message.uuid,index};
 try{return gm.id===game.user.id?await signatureHealingQueryHandler(payload,{user:game.user}):await gm.query(SIGNATURE_HEALING_QUERY,payload);}
 catch{return {ok:false,reason:'uncertain'};}
}
export function signatureHealingQueryHandler(payload={},context={}){
 const message=resolve(payload.messageUuid);
 return queueSignatureCard(message,()=>apply(message,payload.index,context.user));
}
async function apply(message,index,user){
 if(!authority()||!user?.id||message?.documentName!=='ChatMessage')return {ok:false,reason:'authority'};
 const flags=message.flags?.['azeroth-rpg']??{};
 if(flags.kind!=='spell'||flags.success!==true||!flags.cast||!Array.isArray(flags.chosenHealingBonuses)||!flags.chosenHealingBonuses.length)
  return {ok:false,reason:'card'};
 const caster=resolve(flags.healingSignatureCaster),self=flags.healingSignatureSelf===true;
 if(!caster||resolve(flags.spellUuid)?.parent!==caster||!Number.isInteger(index)||(self?index!==-1:index<0))return {ok:false,reason:'source'};
 const target=self?caster:targetActor(flags.targets?.[index]);
 const permitted=()=>Boolean(target&&(user.isGM||target.testUserPermission(user,'OWNER')));
 if(!permitted())return {ok:false,reason:'permission'};
 const recipient=self?flags.chosenHealingBonuses[0]?.recipient:signatureRecipientKey(flags.targets[index]);
 const amount=self?flags.heal:(flags.healingSignatureAmounts?.[index]??flags.heal);
 if(!Number.isFinite(amount)||amount<=0)return {ok:false,reason:'amount'};
 const key=self?'self':`target${index}`,event=`${flags.cast}:${key}`,original=snapshot(flags);
 return deliverRecordedHealing({message,caster,target,recipient,amount,key,event,
  validate:()=>authority()&&resolve(message.uuid)===message&&resolve(caster.uuid)===caster
   &&(self?target===caster:targetActor(flags.targets[index])===target)&&permitted()&&snapshot(message.flags['azeroth-rpg'])===original,
  heal:(total,outcome)=>target.applyHealing(total,{from:caster,spell:true,aegis:flags.aegis??null,unreduced:flags.miracle===true,
   overflow:self&&flags.healOverflow===true,overflowSource:flags.spellName??'',outcome})});
}

/** Internal shared delivery; callers hold the card queue and authenticate the
 * initial target or scheduled tick before entering. Never a query payload. */
export async function deliverRecordedHealing({message,caster,target,recipient,amount,key,event,validate,heal}){
 if(!authority()||typeof validate!=='function'||typeof heal!=='function'||!Number.isFinite(amount)||amount<=0)return {ok:false,reason:'context'};
 const flags=message.flags['azeroth-rpg'],original=snapshot(flags);
 const state=structuredClone(message.getFlag('azeroth-rpg',FLAG)??{version:1,events:{},used:[]});
 if(state.version!==1||!Array.isArray(state.used)||state.events?.[key])return {ok:false,reason:'claimed'};
 const liveSources=()=>caster.system?.signatureEffects?.chosenSpellHealing??[];
 const bonuses=flags.chosenHealingBonuses.filter(row=>row.recipient===recipient&&!state.used.includes(row.identity)
  &&liveSources().some(source=>source.itemId===row.itemId&&source.identifier===row.identifier));
 if(bonuses.some(row=>!['mace-of-unending-life','cloak-of-unending-life','libram-of-hope'].includes(row.identifier)
  ||signatureTurnIdentity(row.identifier)!==row.identity||!Number.isInteger(row.amount)||row.amount<=0)
  ||new Set(bonuses.map(row=>row.identity)).size!==bonuses.length)return {ok:false,reason:'bonus'};
 const writer=game.user.id;
 const valid=()=>authority()&&game.user.id===writer&&resolve(message.uuid)===message&&resolve(caster.uuid)===caster
  &&validate()===true
  &&snapshot(message.flags['azeroth-rpg'])===original
  &&bonuses.every(row=>liveSources().some(source=>source.itemId===row.itemId&&source.identifier===row.identifier));
 const pending={...state,events:{...state.events,[key]:{state:'pending',writer,event}}};
 let executed=false,used=[];
 try{
  if(!valid())return {ok:false,reason:'changed'};
  await message.setFlag('azeroth-rpg',FLAG,pending);
  const held=()=>valid()&&same(message.getFlag('azeroth-rpg',FLAG),pending);
  if(!held())return {ok:false,reason:'claimUncertain'};
  const result=await deliverTurnSignatures({actor:caster,identifiers:bonuses.map(row=>row.identifier),event,validate:held,
   execute:async({valid:claimed,identifiers})=>{
    if(!claimed())return {complete:false};
    executed=true;const selected=bonuses.filter(row=>identifiers.includes(row.identifier)),outcome={};
    await heal(amount+selected.reduce((sum,row)=>sum+row.amount,0),outcome);
    const receipt=signatureHealingReceipt(outcome);
    if(receipt.committed)used=selected.map(row=>row.identity);
    return receipt;
   }});
  if(!held())return {ok:false,reason:'deliveryUncertain'};
  if(!result.ok){
   if(!executed&&['busy','unavailable'].includes(result.reason))await message.setFlag('azeroth-rpg',FLAG,{...state,events:{...state.events,[key]:null}});
   return result;
  }
  const completed={...pending,used:[...new Set([...state.used,...used])],events:{...pending.events,[key]:{state:'complete',writer,event}}};
  await message.setFlag('azeroth-rpg',FLAG,completed);
  return {ok:valid()&&same(message.getFlag('azeroth-rpg',FLAG),completed)};
 }catch{return {ok:false,reason:'uncertain'};}
}
