import {conflagrateState} from '../rules/conflagrate.mjs';
import {sustainedSpellLive} from './sustained-spells.mjs';
import {queueSignatureCard} from './signature-card-queue.mjs';
import {deliverChosenSignature} from './signature-delivery.mjs';
import {signatureApplyRows} from '../rules/signature-apply.mjs';
import {signatureRecipientKey} from '../rules/signature-scaling.mjs';

const SCOPE='azeroth-rpg';
const CLAIM='conflagrateClaim';
const RECEIPT='conflagrateResolution';
let consumptionQueue=Promise.resolve();
const damageQueues=new Map();
const DAMAGE='conflagrateDamage';
const REVIEW='conflagrateReview';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const writer=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id;
export const CONFLAGRATE_PREPARE_QUERY='azeroth-rpg.conflagratePrepare';
export const CONFLAGRATE_CONSUME_QUERY='azeroth-rpg.conflagrateConsume';
export const CONFLAGRATE_DAMAGE_QUERY='azeroth-rpg.conflagrateDamage';
export const CONFLAGRATE_REVIEW_QUERY='azeroth-rpg.conflagrateReview';
const targetOf=row=>row?.sceneId&&row?.tokenId ? game.scenes.get(row.sceneId)?.tokens.get(row.tokenId)?.actor
  : !row?.sceneId&&!row?.tokenId ? game.actors.get(row?.actorId) : null;

/** Read on the GM, including effects a player cannot inspect on an enemy. */
export async function prepareConflagrate({casterUuid,spellUuid,targets,burning=false}={}, {user}={}) {
  if(!writer())return {ok:false,reason:'authority'};
  const caster=resolve(casterUuid);
  if(!caster?.testUserPermission(user,'OWNER'))return {ok:false,reason:'permission'};
  const spell=await fromUuid(spellUuid);
  if(spell?.type!=='spell'||spell.system?.identifier!=='conflagrate')return {ok:false,reason:'spell'};
  if(!Array.isArray(targets)||targets.length!==1)return {ok:false,reason:'target'};
  const target=targetOf(targets[0]);
  if(!target || !writer() || !caster.testUserPermission(user,'OWNER'))return {ok:false,reason:'changed'};
  if(target.getFlag(SCOPE,CLAIM))return {ok:false,reason:'reconcile'};
  const state=conflagrateOn(target,{burning:burning===true});
  return {ok:true,targets:[{...state,...(burning===true?{manualBurning:true}:{})}]};
}

async function request(query,payload,handler) {
  const gm=game.users?.activeGM;
  if(!gm)return {ok:false,reason:'authority'};
  try{return gm.id===game.user.id ? await handler(payload,{user:game.user}) : await gm.query(query,payload);}
  catch{return {ok:false,reason:'uncertain'};}
}

export function requestConflagratePreparation(actor,spell,targets,{burning=false}={}) {
  return request(CONFLAGRATE_PREPARE_QUERY,{casterUuid:actor.uuid,spellUuid:spell.uuid,targets,burning:burning===true},prepareConflagrate);
}

export function requestConflagrateConsumption(card) {
  return request(CONFLAGRATE_CONSUME_QUERY,{messageId:card.id},consumeConflagrate);
}

export function requestConflagrateDamage(card) {
  return request(CONFLAGRATE_DAMAGE_QUERY,{messageId:card.id},applyConflagrateDamage);
}

export function requestConflagrateReview(card,expected) {
  return request(CONFLAGRATE_REVIEW_QUERY,{messageId:card.id,expected,acknowledged:true},reviewConflagrateResolution);
}

/** Only the exact original casts/carriers matter; a newer Immolate is unrelated. */
export function conflagrateReviewState(card) {
  const f=card?.flags?.[SCOPE];
  if(f?.kind!=='spell'||f.identifier!=='conflagrate')return null;
  const target=targetOf(f.targets?.[0]),damage=card.getFlag(SCOPE,DAMAGE),review=card.getFlag(SCOPE,REVIEW);
  const sources=(f.conflagrate?.targets?.[0]?.immolates??[]).map(source=>{
    const owner=resolve(source.casterUuid);
    const sustained=(owner?.getFlag(SCOPE,'sustaining')??[]).some(row=>row.cast===source.cast);
    const carrier=[...(target?.effects??[])].some(e=>e.id===source.effectId&&e.origin===source.casterUuid
      &&e.flags?.[SCOPE]?.cast===source.cast&&e.flags?.[SCOPE]?.identifier==='immolate');
    return {...source,name:owner?.name??source.casterUuid,remaining:sustained||carrier};
  });
  const reviewed=review?.stage==='complete';
  const pending=f.success===true&&!reviewed&&(
    f.conflagrate?.ok!==true || (f.conflagrate.targets?.[0]?.burning===true
      &&(f[RECEIPT]?.[0]?.stage!=='complete'||f[RECEIPT][0].targetUuid!==target?.uuid))
    ||(damage&&(damage.stage!=='complete'||damage.identity!==damageIdentity(card))));
  return {pending,reviewed,sources,target:target?.name??f.targets?.[0]?.name??'',damage:f.damageByTarget?.[0]?.damage??null,
    expected:JSON.stringify({identity:damageIdentity(card),damage,review,claim:target?.getFlag(SCOPE,CLAIM),sources})};
}

/** Close a manually reconciled cast. This never deals damage or ends a Sustain. */
export async function reviewConflagrateResolution({messageId,expected,acknowledged}={}, {user}={}) {
  if(!writer()||!user?.isGM||acknowledged!==true)return {ok:false,reason:'permission'};
  const card=game.messages.get(messageId);
  const run=async()=>{
    if(!writer()||game.messages.get(messageId)!==card)return {ok:false,reason:'changed'};
    const state=conflagrateReviewState(card);
    if(!state)return {ok:false,reason:'record'};
    const clearClaim=async review=>{
      const target=resolve(review.targetUuid),claim=target?.getFlag(SCOPE,CLAIM);
      if(claim?.messageId===messageId&&claim.index===0&&claim.targetUuid===target.uuid){
        await target.unsetFlag(SCOPE,CLAIM);
        if(target.getFlag(SCOPE,CLAIM)?.messageId===messageId)return {ok:false,reason:'uncertain'};
      }
      return {ok:true,reviewed:true};
    };
    try{
      if(state.reviewed)return await clearClaim(card.getFlag(SCOPE,REVIEW));
      if(!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
      if(state.sources.some(source=>source.remaining))return {ok:false,reason:'burns-remain'};
      const review={stage:'complete',by:user.id,at:Date.now(),targetUuid:targetOf(card.flags[SCOPE].targets?.[0])?.uuid??null,expected};
      await card.setFlag(SCOPE,REVIEW,review);
      if(!writer()||JSON.stringify(card.getFlag(SCOPE,REVIEW))!==JSON.stringify(review))return {ok:false,reason:'uncertain'};
      return await clearClaim(review);
    }catch{return {ok:false,reason:'uncertain'};}
  };
  // Join both queues before closing: a review cannot race a still-running cast.
  const priorDamage=damageQueues.get(messageId)??Promise.resolve();
  const next=consumptionQueue.then(()=>priorDamage).then(run,run);
  consumptionQueue=next.catch(()=>{});damageQueues.set(messageId,next);
  try{return await next;}finally{if(damageQueues.get(messageId)===next)damageQueues.delete(messageId);}
}

function damageIdentity(card) {
  const f=card?.flags?.[SCOPE];
  return JSON.stringify({kind:f?.kind,identifier:f?.identifier,success:f?.success,caster:f?.caster,
    targets:f?.targets,damage:f?.damageByTarget,conflagrate:f?.conflagrate,consumption:f?.[RECEIPT],
    ...(f?.chosenSignatureBonuses?.length ? {cast:f.cast,signatureBonuses:f.chosenSignatureBonuses} : {})});
}

export function conflagrateDamageClaimValid(card) {
  const receipt=card?.getFlag(SCOPE,DAMAGE);
  return writer() && game.messages.get(card?.id)===card && conflagrateApplyReady(card)
    && receipt?.stage==='applying' && receipt.identity===damageIdentity(card)
    && targetOf(card.flags[SCOPE].targets?.[0])?.uuid===receipt.targetUuid;
}

/** Serialize the entire damage door, including its ordinary on-hit riders. */
export function applyConflagrateDamage(payload={},context={}) {
  const card=game.messages.get(payload.messageId);
  return card?.flags?.[SCOPE]?.chosenSignatureDelivery
    ? queueSignatureCard(card,()=>applyDamageHere(payload,context)) : applyDamageHere(payload,context);
}

async function applyDamageHere({messageId}={}, {user}={}) {
  if(!writer())return {ok:false,reason:'authority'};
  const card=game.messages.get(messageId),f=card?.flags?.[SCOPE],caster=resolve(f?.caster);
  if(f?.kind!=='spell'||f.identifier!=='conflagrate'||!caster?.testUserPermission(user,'OWNER'))return {ok:false,reason:'permission'};
  if(card.getFlag(SCOPE,REVIEW)?.stage==='complete')return {ok:true,already:true,reviewed:true};
  if(!conflagrateApplyReady(card)||f.targets?.length!==1||!f.damageByTarget?.[0])return {ok:false,reason:'unprepared'};
  const target=targetOf(f.targets[0]),identity=damageIdentity(card);
  if(!target || f[RECEIPT]?.[0]?.targetUuid!==target.uuid)return {ok:false,reason:'changed'};
  const effective=signatureApplyRows(f,0);
  if(!effective)return {ok:false,reason:'signatureChanged'};
  const recipient=signatureRecipientKey(f.targets[0]);
  const chosen=!effective.consumed&&f.chosenSignatureBonuses?.some(bonus=>bonus.recipient===recipient);
  const valid=()=>writer()&&game.messages.get(messageId)===card&&resolve(caster.uuid)===caster
    &&caster.testUserPermission(user,'OWNER')&&targetOf(card.flags[SCOPE].targets?.[0])===target
    &&damageIdentity(card)===identity;
  const run=async()=>{
    if(card.getFlag(SCOPE,REVIEW)?.stage==='complete')return {ok:true,already:true,reviewed:true};
    if(!valid())return {ok:false,reason:'changed'};
    const prior=card.getFlag(SCOPE,DAMAGE);
    if(prior?.stage==='complete'&&prior.identity===identity)return {ok:true,already:true};
    if(prior)return {ok:false,reason:'reconcile'};
    const receipt={stage:'applying',targetUuid:target.uuid,identity};
    try{
      await card.setFlag(SCOPE,DAMAGE,receipt);
      if(!valid()||!conflagrateDamageClaimValid(card))return {ok:false,reason:'changed'};
      const {applyRecordedConflagrateDamage}=await import('../dice/chat.mjs');
      const execute=async({valid:allowed=valid}={})=>allowed()&&conflagrateDamageClaimValid(card)
        ? applyRecordedConflagrateDamage(card) : {ok:false};
      const result=chosen ? await deliverChosenSignature({message:card,cast:f.cast,recipient,event:'initial:0',validate:valid,execute})
        : await execute();
      if(!result?.ok || !valid() || !conflagrateDamageClaimValid(card))return {ok:false,reason:'uncertain'};
      const completed={...receipt,stage:'complete'};
      await card.setFlag(SCOPE,DAMAGE,completed);
      if(!valid() || JSON.stringify(card.getFlag(SCOPE,DAMAGE))!==JSON.stringify(completed))return {ok:false,reason:'uncertain'};
      return {ok:true};
    }catch{return {ok:false,reason:'uncertain'};}
  };
  const next=(damageQueues.get(messageId)??Promise.resolve()).then(run,run);
  damageQueues.set(messageId,next);
  try{return await next;}finally{if(damageQueues.get(messageId)===next)damageQueues.delete(messageId);}
}

/** Damage must not land while the burns that paid for it remain unresolved. */
export function conflagrateApplyReady(card) {
  const flags=card?.flags?.[SCOPE];
  return flags?.success===true && flags.conflagrate?.ok===true
    && card.getFlag(SCOPE,REVIEW)?.stage!=='complete'
    && flags.conflagrate.targets?.[0]?.burning===true
    && flags[RECEIPT]?.[0]?.stage==='complete';
}

/** Read exact live spell identities, never an effect's editable display name. */
export function conflagrateOn(target, {burning=false}={}) {
  return conflagrateState({burning, effects:[...(target?.effects ?? [])].map(effect=>({
    id:effect.id, origin:effect.origin, active:effect.active, disabled:effect.disabled,
    suppressed:effect.isSuppressed, duration:effect.duration, flags:effect.flags,
    live:sustainedSpellLive(effect)
  }))});
}

/** Backend consumption stage for a successful prepared Conflagrate card.
 * Both the card and target retain uncertain claims for review. */
export async function consumeConflagrate({messageId,index=0}={}, {user}={}) {
  if(!writer() || index!==0)return {ok:false,reason:'authority'};
  const card=game.messages.get(messageId), flags=card?.flags?.[SCOPE];
  const caster=resolve(flags?.caster);
  if(flags?.kind!=='spell'||flags.identifier!=='conflagrate'||flags.success!==true
    ||!caster?.testUserPermission(user,'OWNER'))return {ok:false,reason:'permission'};
  if(card.getFlag(SCOPE,REVIEW)?.stage==='complete')return {ok:true,already:true,reviewed:true};
  if(flags.targets?.length!==1 || flags.conflagrate?.targets?.length!==1)return {ok:false,reason:'unprepared'};
  const row=flags.targets?.[index];
  const target=targetOf(row);
  const prepared=flags.conflagrate?.targets?.[index];
  if(!target || !prepared || !Array.isArray(prepared.immolates))return {ok:false,reason:'unprepared'};
  const identity=()=>{
    const live=card.flags?.[SCOPE];
    return JSON.stringify({kind:live?.kind,identifier:live?.identifier,success:live?.success,
      caster:live?.caster,targets:live?.targets,prepared:live?.conflagrate?.targets});
  };
  const signature=identity();
  const valid=()=>writer() && game.messages.get(messageId)===card && resolve(target.uuid)===target
    && resolve(caster.uuid)===caster
    && caster.testUserPermission(user,'OWNER')
    && identity()===signature;
  const run=async()=>{
    if(card.getFlag(SCOPE,REVIEW)?.stage==='complete')return {ok:true,already:true,reviewed:true};
    if(!valid())return {ok:false,reason:'changed'};
    const receipts=structuredClone(card.getFlag(SCOPE,RECEIPT)??{});
    if(receipts[index]?.stage==='complete')return {ok:true,already:true};
    if(receipts[index] || target.getFlag(SCOPE,CLAIM))return {ok:false,reason:'reconcile'};
    const current=conflagrateOn(target,{burning:prepared.manualBurning===true});
    if(JSON.stringify(current.immolates)!==JSON.stringify(prepared.immolates)
      ||current.burning!==prepared.burning)return {ok:false,reason:'changed'};
    const claim={messageId,index,targetUuid:target.uuid};
    try {
      // Target serialization alone is insufficient across a client reload.
      await target.setFlag(SCOPE,CLAIM,claim);
      if(!valid() || JSON.stringify(target.getFlag(SCOPE,CLAIM))!==JSON.stringify(claim))return {ok:false,reason:'changed'};
      receipts[index]={stage:'applying',targetUuid:target.uuid,immolates:current.immolates};
      await card.setFlag(SCOPE,RECEIPT,receipts);
      const claimed=()=>valid() && JSON.stringify(card.getFlag(SCOPE,RECEIPT))===JSON.stringify(receipts)
        && JSON.stringify(target.getFlag(SCOPE,CLAIM))===JSON.stringify(claim);
      const seen=new Set();
      for(const source of current.immolates){
        const key=JSON.stringify([source.casterUuid,source.cast]);
        if(seen.has(key))continue;
        seen.add(key);
        if(!claimed())return {ok:false,reason:'changed'};
        const owner=resolve(source.casterUuid);
        if(!owner)throw Error('Immolate caster disappeared');
        const ended=await game.system.azeroth.workflows.endSustain({actor:owner,cast:source.cast});
        if(!ended || ended.cast!==source.cast)throw Error('Immolate end was not confirmed');
      }
      if(!claimed())return {ok:false,reason:'changed'};
      receipts[index].stage='complete';
      await card.setFlag(SCOPE,RECEIPT,receipts);
      if(!claimed())return {ok:false,reason:'changed'};
      await target.unsetFlag(SCOPE,CLAIM);
      return {ok:true,ended:seen.size};
    }catch{return {ok:false,reason:'uncertain'};}
  };
  // Different targets can share a caster's Sustain array. Ending two casts
  // concurrently would replace that array from competing snapshots.
  const next=consumptionQueue.then(run,run);
  consumptionQueue=next.catch(()=>{});
  return next;
}
