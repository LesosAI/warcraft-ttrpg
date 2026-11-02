import {queueSignatureCard} from './signature-card-queue.mjs';
import {withSignatureDeliveryLock} from './signature-delivery.mjs';
import {damageTickReviewPatch} from '../rules/signature-damage-tick-review.mjs';
import {pendingSignatureAreaSaves} from './signature-area-save-review.mjs';
import {areaSaveWrites} from './area-save-write-state.mjs';
import {crossingWrites} from './spell-crossing-write-state.mjs';
import {sealingFlameWrites} from './sealing-flame-write-state.mjs';
import {withAttackResolutionReviewLock} from './attack-resolution-state.mjs';
import {TRANSFER_DELIVERIES} from '../rules/damage-transfer-review.mjs';
const scope='azeroth-rpg',bonusFlag='chosenSignatureDelivery',areaFlag='signatureAreaDelivery';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const authority=message=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id&&resolve(message?.uuid)===message;
const pendingAttacks=flags=>Array.isArray(flags?.chosenSignatureDelivery?.entries)&&flags.chosenSignatureDelivery.entries.length
 &&Array.isArray(flags.attackResolution?.targets)?flags.attackResolution.targets.flatMap((row,index)=>row?.stage==='applying'?[{row,index}]:[]):[];

function pendingDamageCarriers(){
 const actors=new Map([...(game.actors?.values?.()??[])].map(actor=>[actor.uuid,actor]));
 for(const scene of game.scenes?.values?.()??[])for(const token of scene.tokens?.values?.()??[])if(token.actor)actors.set(token.actor.uuid,token.actor);
 return [...actors.values()].flatMap(actor=>[...(actor.effects?.values?.()??[])].filter(effect=>effect.flags?.[scope]?.signatureTickDelivery?.phase==='pending'));
}
function belongsTo(effect,message){
 const f=effect.flags[scope],original=message.flags?.[scope];
 return f.tick?.cast===original?.cast&&f.tick?.source===original?.spellLockCaster&&f.tick?.castUuid===original?.spellUuid
  &&(!f.signatureTickDelivery.messageUuid||f.signatureTickDelivery.messageUuid===message.uuid
   ||original.signatureDamageRecovery?.originalMessageUuids?.includes(f.signatureTickDelivery.messageUuid));
}

export function damageSignatureCards(actor){
 const carriers=pendingDamageCarriers();
 return [...(game.messages?.values?.()??[])].filter(message=>{
  const flags=message.flags?.[scope];
  return flags?.spellLockCaster===actor?.uuid&&(flags.chosenSignatureDelivery?.entries?.some(row=>row.pending)
   ||flags.sealingFlameCleanup?.state==='pending'||flags.spellCrossingResolution?.state==='pending'||pendingAttacks(flags).length>0||Object.values(flags.signatureAreaDelivery??{}).some(row=>row?.state==='pending')||carriers.some(effect=>belongsTo(effect,message))||pendingSignatureAreaSaves(message).length>0);
 });
}

/** A review snapshots both receipts and visible recipient Health. It never
 * infers whether an interrupted damage write reached Health or a transfer. */
export function damageSignatureReviewState(message){
 const flags=structuredClone(message?.flags?.[scope]??{}),state=flags[bonusFlag],pulses=flags[areaFlag]??{};
 const carriers=pendingDamageCarriers().filter(effect=>belongsTo(effect,message)).map(effect=>({uuid:effect.uuid,actorUuid:effect.parent.uuid,data:effect.toObject()})).sort((a,b)=>a.uuid.localeCompare(b.uuid));
 const saves=pendingSignatureAreaSaves(message);
 const pending=flags.sealingFlameCleanup?.state==='pending'||flags.spellCrossingResolution?.state==='pending'||state?.entries?.some(row=>row.pending)||pendingAttacks(flags).length>0||Object.values(pulses).some(row=>row?.state==='pending')||carriers.length>0||saves.length>0;
 const actors=new Map();
 const add=actor=>{if(actor?.uuid)actors.set(actor.uuid,actor);};
 add(resolve(flags.spellLockCaster));
 add(resolve(flags.sealingFlameCleanup?.targetUuid));
 for(const ref of [...(flags.targets??[]),...(flags.chosenSignatureTargets??[])]){
  add(ref.sceneId&&ref.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor:game.actors?.get(ref.actorId));
 }
 for(const pulse of Object.values(pulses))add(resolve(pulse?.targetUuid));
 for(const carrier of carriers)add(resolve(carrier.actorUuid));
 for(const save of saves)add(resolve(save.flags.area.actorUuid));
 const health=[...actors.values()].map(actor=>({uuid:actor.uuid,health:structuredClone(actor.system?.health??{})})).sort((a,b)=>a.uuid.localeCompare(b.uuid));
 return {pending:Boolean(pending),flags,health,carriers,saves,expected:JSON.stringify({flags,health,carriers,saves})};
}

/** Internal active-GM operation. After manual reconciliation, close this
 * casting's bonuses and pending area pulses without dealing/refunding damage.
 * Applying attack rows close with the bonuses; transferred hits use their own review. */
export function reviewDamageSignature(message,{expected,acknowledged=false}={}){
 if(!authority(message)||acknowledged!==true)return Promise.resolve({ok:false,reason:'authority'});
 if(crossingWrites.has(message?.id)||sealingFlameWrites.has(message?.id))return Promise.resolve({ok:false,reason:'busy'});
 return queueSignatureCard(message,()=>withSignatureDeliveryLock(message,()=>withAttackResolutionReviewLock(message,async()=>{
  const initial=damageSignatureReviewState(message),flags=initial.flags,state=flags[bonusFlag];
  if(initial.expected!==expected)return {ok:false,reason:'changed'};
  if(!initial.pending)return {ok:true,already:true};
  if(flags.kind!=='spell'||flags.success!==true||state?.version!==1||state.cast!==flags.cast
   ||!Array.isArray(state.entries)||!same(state.entries.map(row=>row.bonus),flags.chosenSignatureBonuses))return {ok:false,reason:'cast'};
  if(crossingWrites.has(message?.id)||sealingFlameWrites.has(message?.id))return {ok:false,reason:'busy'};
  const sealing=flags.sealingFlameCleanup?.state==='pending'?flags.sealingFlameCleanup:null;
  if(sealing&&(!sealing.writer||sealing.cast!==flags.cast||sealing.targetUuid!==flags.sealingFlame?.targetUuid))return {ok:false,reason:'sealingChanged'};
  const crossing=flags.spellCrossingResolution?.state==='pending'?flags.spellCrossingResolution:null;
  if(crossing&&(!crossing.writer||crossing.cast!==flags.cast))return {ok:false,reason:'crossingChanged'};
  const writer=game.user.id,pulses=flags[areaFlag]??{};
  const claims=[...state.entries.map(row=>row.pending).filter(Boolean),...Object.values(pulses).filter(row=>row?.state==='pending'),
   ...initial.carriers.map(row=>row.data.flags[scope].signatureTickDelivery),
   ...initial.saves.map(row=>row.flags.signatureAreaSaveDelivery??{writer:row.author}),...(crossing?[crossing]:[]),...(sealing?[sealing]:[])];
  if(initial.saves.some(row=>areaSaveWrites.has(row.id)))return {ok:false,reason:'busy'};
  if(claims.some(row=>row.writer!==writer&&game.users.get(row.writer)?.active))return {ok:false,reason:'writerActive'};
  const review={by:writer,at:Date.now()};
  const attacks=pendingAttacks(flags);
  if(attacks.length&&flags.attackResolution.version!==1)return {ok:false,reason:'attackChanged'};
  if(attacks.some(({row})=>!row.writerId||(row.writerId!==writer&&game.users.get(row.writerId)?.active)))return {ok:false,reason:'writerActive'};
  if(attacks.some(({index})=>Array.isArray(flags[TRANSFER_DELIVERIES])&&flags[TRANSFER_DELIVERIES].some(row=>row?.index===index)))return {ok:false,reason:'transferReview'};
  const attackState=attacks.length?{...flags.attackResolution,targets:flags.attackResolution.targets.map(row=>row?.stage==='applying'
    ?{...row,stage:'applied',reviewedBy:writer,reviewedAt:review.at}:row)}:null;
  const changes=initial.carriers.map(row=>({row,change:damageTickReviewPatch(row.data.flags[scope].tick,row.data.flags[scope].signatureTickDelivery,review)}));
  if(changes.some(row=>!row.change))return {ok:false,reason:'carrierChanged'};
  const next={...state,entries:state.entries.map(row=>({...row,used:true,pending:null,
   ...(!row.used||row.pending?{review:{...review,previousPending:row.pending??null}}:{})}))};
  const area=Object.fromEntries(Object.entries(pulses).map(([key,row])=>[key,row?.state==='pending'?{...row,state:'reviewed',review}:row]));
  const reviewedCrossing=crossing?{...crossing,state:'reviewed',review}:null;
  const reviewedSealing=sealing?{...sealing,state:'reviewed',review}:null;
  const after={...flags,[bonusFlag]:next,[areaFlag]:area,...(attackState?{attackResolution:attackState}:{}),...(reviewedCrossing?{spellCrossingResolution:reviewedCrossing}:{}),...(reviewedSealing?{sealingFlameCleanup:reviewedSealing}:{})};
  try{
   if(!authority(message)||game.user.id!==writer||damageSignatureReviewState(message).expected!==expected)return {ok:false,reason:'changed'};
   // One document write closes both layers, including a pulse saved before its
   // bonus claim. Preserve original event/writer provenance on every receipt.
   await message.update({[`flags.${scope}.${bonusFlag}`]:next,[`flags.${scope}.${areaFlag}`]:area,
    ...(reviewedCrossing?{[`flags.${scope}.spellCrossingResolution`]:reviewedCrossing}:{}),
    ...(reviewedSealing?{[`flags.${scope}.sealingFlameCleanup`]:reviewedSealing}:{}),
    ...(attackState?{[`flags.${scope}.attackResolution`]:attackState}:{})});
   const current=damageSignatureReviewState(message);
   const healthUnchanged=()=>initial.health.every(row=>same(resolve(row.uuid)?.system?.health,row.health));
   let remaining=initial.carriers,remainingSaves=initial.saves;
   const valid=()=>authority(message)&&game.user.id===writer&&healthUnchanged()
    &&same(message.flags[scope],after)&&same(damageSignatureReviewState(message).carriers,remaining)
    &&same(pendingSignatureAreaSaves(message),remainingSaves)&&!remainingSaves.some(row=>areaSaveWrites.has(row.id));
   if(!same(current.flags,after)||!valid())return {ok:false,reason:'uncertain'};
   for(const row of initial.saves){
    if(!valid())return {ok:false,reason:'changed'};
    const save=resolve(row.uuid);if(!save||!same(save.flags[scope],row.flags))return {ok:false,reason:'changed'};
    const reviewed={...(row.flags.signatureAreaSaveDelivery??{writer:row.author,resultId:row.flags.areaResult.resultId}),state:'reviewed',review};
    await save.setFlag(scope,'signatureAreaSaveDelivery',reviewed);
    if(resolve(row.uuid)!==save||!same(save.flags[scope],{...row.flags,signatureAreaSaveDelivery:reviewed}))return {ok:false,reason:'uncertain'};
    remainingSaves=remainingSaves.filter(other=>other.uuid!==row.uuid);
    if(!valid())return {ok:false,reason:'uncertain'};
   }
   for(const {row,change} of changes){
    if(!valid())return {ok:false,reason:'changed'};
    const carrier=resolve(row.uuid);if(!carrier||!same(carrier.toObject(),row.data))return {ok:false,reason:'carrierChanged'};
    if(change.delete)await carrier.delete();else await carrier.update(change.patch);
    if(change.delete?Boolean(resolve(row.uuid)):!same(carrier.flags[scope].signatureTickDelivery,change.patch[`flags.${scope}.signatureTickDelivery`]))return {ok:false,reason:'uncertain'};
    if(!change.delete){
     const expectedTick={...row.data.flags[scope].tick};
     for(const key of ['rounds','doubled'])if(`flags.${scope}.tick.${key}` in change.patch)expectedTick[key]=change.patch[`flags.${scope}.tick.${key}`];
     if(!same(carrier.flags[scope].tick,expectedTick))return {ok:false,reason:'uncertain'};
    }
    remaining=remaining.filter(other=>other.uuid!==row.uuid);
    if(!valid())return {ok:false,reason:'uncertain'};
   }
   return {ok:true};
  }catch{return {ok:false,reason:'uncertain'};}
 })));
}
