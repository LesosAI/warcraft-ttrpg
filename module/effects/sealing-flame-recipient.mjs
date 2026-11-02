import {sealingFlameReservations} from './sealing-flame-write-state.mjs';
const scope='azeroth-rpg';
export const SEALING_FLAME_RECIPIENT='sealingFlameRecipient';
const queues=new Map();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function serial(actor,work){
 const previous=queues.get(actor?.uuid)??Promise.resolve();
 const current=previous.catch(()=>{}).then(work);queues.set(actor?.uuid,current);
 return current.finally(()=>{if(queues.get(actor?.uuid)===current)queues.delete(actor?.uuid);});
}
const authority=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;

export function sealingFlameReservationReview(actor){
 const claim=actor?.getFlag?.(scope,SEALING_FLAME_RECIPIENT);
 return {pending:['reserved','uncertain'].includes(claim?.state),expected:JSON.stringify({claim,health:actor?.system?.health})};
}

/** GM adjudicates the interrupted hit and casting before choosing whether the
 * recipient benefited. No damage, resource payment or cleanup is replayed. */
export function reviewSealingFlameReservation(actor,{expected,acknowledged=false,rescued}={}){
 return serial(actor,async()=>{
  if(!authority()||acknowledged!==true||typeof rescued!=='boolean')return {ok:false,reason:'authority'};
  if(sealingFlameReservations.has(actor?.uuid))return {ok:false,reason:'busy'};
  const state=sealingFlameReservationReview(actor),claim=actor.getFlag(scope,SEALING_FLAME_RECIPIENT),writer=game.user.id;
  if(state.expected!==expected)return {ok:false,reason:'changed'};
  if(!state.pending)return {ok:true,already:true};
  if(!claim.writer||claim.writer!==writer&&game.users.get(claim.writer)?.active)return {ok:false,reason:'writerActive'};
  const review={...claim,state:'reviewed',rescued,reviewedBy:writer,at:Date.now()};
  const used={...claim,state:'used',review};
  try{
   await actor.update({[`flags.${scope}.sealingFlameReservationReview`]:review,
    ...(rescued?{[`flags.${scope}.${SEALING_FLAME_RECIPIENT}`]:used}:{[`flags.${scope}.-=${SEALING_FLAME_RECIPIENT}`]:null})});
   return {ok:authority()&&game.user.id===writer&&same(actor.getFlag(scope,'sealingFlameReservationReview'),review)
    &&(rescued?same(actor.getFlag(scope,SEALING_FLAME_RECIPIENT),used):!actor.getFlag(scope,SEALING_FLAME_RECIPIENT))};
  }catch{return {ok:false,reason:'uncertain'};}
 });
}

/** Internal GM reservation before the reaction cast; competing casters share it. */
export function reserveSealingFlame(actor,{cast,casterUuid}={}){
 return serial(actor,async()=>{
  if(!authority()||!actor?.uuid||typeof cast!=='string'||!cast||typeof casterUuid!=='string'||!casterUuid)return {ok:false,reason:'context'};
  if(actor.getFlag(scope,SEALING_FLAME_RECIPIENT))return {ok:false,reason:'unavailable'};
  const claim={cast,casterUuid,writer:game.user.id,state:'reserved'};
  try{
   await actor.setFlag(scope,SEALING_FLAME_RECIPIENT,claim);
   return authority()&&game.user.id===claim.writer&&same(actor.getFlag(scope,SEALING_FLAME_RECIPIENT),claim)?{ok:true,claim}:{ok:false,reason:'uncertain'};
  }catch{return {ok:false,reason:'uncertain'};}
 });
}

/** Release only a confirmed cancelled/failed cast; a successful rescue consumes
 * the recipient's benefit even if later damage/condition writes need review. */
export function finishSealingFlameReservation(actor,claim,{rescued}={}){
 return serial(actor,async()=>{
  if(!authority()||!claim||claim.state!=='reserved'||typeof rescued!=='boolean'
   ||claim.writer!==game.user.id||!same(actor?.getFlag(scope,SEALING_FLAME_RECIPIENT),claim))return {ok:false,reason:'changed'};
  try{
   if(rescued){
    const used={...claim,state:'used'};await actor.setFlag(scope,SEALING_FLAME_RECIPIENT,used);
    return {ok:authority()&&game.user.id===claim.writer&&same(actor.getFlag(scope,SEALING_FLAME_RECIPIENT),used)};
   }
   await actor.unsetFlag(scope,SEALING_FLAME_RECIPIENT);
   return {ok:authority()&&game.user.id===claim.writer&&!actor.getFlag(scope,SEALING_FLAME_RECIPIENT)};
  }catch{return {ok:false,reason:'uncertain'};}
 });
}
