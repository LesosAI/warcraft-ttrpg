import {queueSignatureCard} from './signature-card-queue.mjs';
import {deliverChosenSignature} from './signature-delivery.mjs';
import {signatureDamageOutcome} from '../rules/signature-delivery.mjs';
import {strikeFromArea} from './area-strikes.mjs';
import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
const scope='azeroth-rpg',receiptFlag='signatureAreaDelivery';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};

/** Internal only. The area lifecycle supplies a stable turn/entry event and
 * validates current membership, relation, source and timing under the card queue. */
export function deliverSignatureAreaDamage({message,caster,actor,token,spell,damage,heal=null,event,validate}={}){
 return queueSignatureCard(message,async()=>{
  const authority=()=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id;
  if(!authority()||typeof validate!=='function'||typeof event!=='string'||!event||!actor?.uuid||!caster?.uuid)return {ok:false,reason:'context'};
  const flags=message.flags?.[scope],state=flags?.chosenSignatureDelivery;
  if(flags?.kind!=='spell'||flags.success!==true||!flags.cast||flags.spellLockCaster!==caster.uuid
   ||state?.version!==1||state.cast!==flags.cast||!Array.isArray(state.entries)
   ||!same(state.entries.map(row=>row.bonus),flags.chosenSignatureBonuses))return {ok:false,reason:'cast'};
  const references=(flags.chosenSignatureTargets??flags.targets??[]).filter(ref=>ref.actorId===actor.id
   &&(ref.sceneId||ref.tokenId?ref.sceneId===token?.parent?.id&&ref.tokenId===token?.id:true));
  const keys=new Set(references.map(signatureRecipientKey));
  const entries=state.entries.filter(row=>keys.has(row.bonus.recipient));
  const recipients=new Set(entries.map(row=>row.bonus.recipient));
  if(recipients.size>1||entries.some(row=>row.pending||typeof row.used!=='boolean'))return {ok:false,reason:'review'};
  const snapshot=()=>{const current=message.flags?.[scope]??{};return JSON.stringify({cast:current.cast,caster:current.spellLockCaster,targets:current.targets,signatureTargets:current.chosenSignatureTargets,bonuses:current.chosenSignatureBonuses,recovery:current.signatureDamageRecovery});};
  const original=snapshot();
  const writer=game.user.id,key=encodeURIComponent(event).replaceAll('.','%2E');
  const valid=()=>authority()&&game.user.id===writer&&resolve(message.uuid)===message&&resolve(caster.uuid)===caster
   &&resolve(actor.uuid)===actor&&(!token||token.actor===actor)&&validate()===true
   &&snapshot()===original;
  const receipts=structuredClone(message.getFlag(scope,receiptFlag)??{});
  if(flags.signatureDamageRecovery){
   if(flags.signatureDamageRecovery.state!=='complete'||!valid())return {ok:false,reason:'review'};
   if((flags.signatureDamageRecovery.skippedTurns??[]).some(stamp=>{const combat=game.combats?.get(stamp.id);return combat?.started&&combat.active===true&&combat.scene?.id===token?.parent?.id&&combat.round===stamp.round&&combat.turn===stamp.turn;}))return {ok:true,already:true,lines:[]};
  }
  if(['complete','reviewed'].includes(receipts[key]?.state))return {ok:true,already:true,lines:[]};
  if(receipts[key]||Object.values(receipts).some(row=>row?.state==='pending'&&row.targetUuid===actor.uuid))return {ok:false,reason:'review'};
  const claim={state:'pending',event,writer,targetUuid:actor.uuid,cast:flags.cast};
  const pending={...receipts,[key]:claim};let lines=[];
  try{
   if(!valid())return {ok:false,reason:'changed'};
   await message.setFlag(scope,receiptFlag,pending);
   const held=()=>valid()&&same(message.getFlag(scope,receiptFlag),pending);
   if(!held())return {ok:false,reason:'claimUncertain'};
   const execute=async({bonuses=[],valid:allowed=held}={})=>{
    if(!held()||!allowed())return {ok:false};
    const damageOutcome={};
    lines=await strikeFromArea({actor,caster,spell,damage,heal,signatureExtras:bonuses.map(row=>({type:row.school,amount:row.amount})),damageOutcome});
    return {ok:signatureDamageOutcome(damageOutcome)!==null,damageOutcome};
   };
   const result=entries.some(row=>!row.used)?await deliverChosenSignature({message,cast:flags.cast,recipient:[...recipients][0],event,validate:held,execute}):await execute();
   if(!result.ok||!held())return {ok:false,reason:'deliveryUncertain'};
   const completed={...pending,[key]:{...claim,state:'complete'}};
   await message.setFlag(scope,receiptFlag,completed);
   if(!valid()||!same(message.getFlag(scope,receiptFlag),completed))return {ok:false,reason:'completionUncertain'};
   return {ok:true,lines};
  }catch{return {ok:false,reason:'writeUncertain'};}
 });
}
