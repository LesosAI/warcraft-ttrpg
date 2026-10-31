import {dispersionEffect,dispersionFor} from '../rules/dispersion.mjs';
import {minuteSpan} from './durations.mjs';
export const DISPERSION_PREPARE='azeroth-rpg.dispersionPrepare';
export const DISPERSION_RESOLVE='azeroth-rpg.dispersionResolve';
export const DISPERSION_CLAIM='dispersionCreationClaim';
export const DISPERSION_RECEIPT='dispersionResolution';
export const DISPERSION_REVIEW='dispersionCreationReview';
export const DISPERSION_REVIEW_QUERY='azeroth-rpg.dispersionCreationReview';
const scope='azeroth-rpg',refuse=reason=>({ok:false,reason});
const writer=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id;
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const owns=(actor,user)=>Boolean(user?.id && (user.isGM || actor?.testUserPermission(user,'OWNER')));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let queue=Promise.resolve();
function context({casterUuid,spellUuid},user) {
  if(!writer())return refuse('authority');
  const actor=resolve(casterUuid),spell=resolve(spellUuid);
  if(actor?.documentName!=='Actor' || actor.uuid!==casterUuid || !owns(actor,user))return refuse('permission');
  if(spell?.type!=='spell' || spell.uuid!==spellUuid || spell.system?.identifier!=='dispersion'
    || (spell.parent && spell.parent!==actor))return refuse('spell');
  return {ok:true,actor,spell};
}
export async function prepareDispersionCast(payload={}, {user}={}) {
  const ctx=context(payload,user);if(!ctx.ok)return ctx;
  if(ctx.actor.getFlag(scope,DISPERSION_CLAIM) || dispersionFor(ctx.actor))return refuse('reconcile');
  return {ok:true};
}
export async function resolveDispersionCast({messageId}={}, {user}={}) {
  const run=async()=>{
    const card=game.messages?.get(messageId),f=card?.flags?.[scope];
    if(!writer() || f?.kind!=='spell' || f.identifier!=='dispersion' || f.success!==true
      || typeof f.cast!=='string' || !f.cast.trim())return refuse('card');
    const ctx=context({casterUuid:f.caster,spellUuid:f.spellUuid},user);if(!ctx.ok)return ctx;
    const {actor,spell}=ctx;if(!owns(actor,card.author))return refuse('permission');
    const identity=()=>JSON.stringify(['kind','identifier','cast','caster','spellUuid','success'].map(k=>card.flags?.[scope]?.[k]));
    const signature=identity(),claim={messageId,identity:signature,writerId:game.user.id};
    const current=()=>writer() && game.messages.get(messageId)===card && resolve(actor.uuid)===actor && resolve(spell.uuid)===spell
      && identity()===signature && owns(actor,user) && owns(actor,card.author);
    const cleanup=async()=>{
      if(!current())return false;const held=actor.getFlag(scope,DISPERSION_CLAIM);
      if(held && !same(held,claim))return false;
      if(held)await actor.unsetFlag(scope,DISPERSION_CLAIM);
      return current() && !actor.getFlag(scope,DISPERSION_CLAIM);
    };
    try {
      if(card.getFlag(scope,DISPERSION_REVIEW))return refuse('reviewed');
      const prior=card.getFlag(scope,DISPERSION_RECEIPT);
      if(prior){
        if(prior.stage!=='complete' || prior.identity!==signature)return refuse('reconcile');
        return await cleanup() ? {ok:true,already:true,effectId:prior.effectId} : refuse('uncertain');
      }
      if(actor.getFlag(scope,DISPERSION_CLAIM) || dispersionFor(actor))return refuse('reconcile');
      const data=dispersionEffect({ownerUuid:actor.uuid,spellUuid:spell.uuid,messageUuid:card.uuid,cast:f.cast,
        timing:minuteSpan(actor),description:spell.system.effect ?? '',img:spell.img});
      if(!data)return refuse('effect');
      const effectId=foundry.utils.randomID(16),receipt={stage:'applying',identity:signature,effectId};
      await actor.setFlag(scope,DISPERSION_CLAIM,claim);
      const claimed=()=>current() && same(actor.getFlag(scope,DISPERSION_CLAIM),claim);
      if(!claimed())return refuse('uncertain');
      await card.setFlag(scope,DISPERSION_RECEIPT,receipt);
      if(!claimed() || !same(card.getFlag(scope,DISPERSION_RECEIPT),receipt))return refuse('uncertain');
      await actor.createEmbeddedDocuments('ActiveEffect',[{_id:effectId,...data}],{keepId:true});
      const effect=dispersionFor(actor);
      if(!claimed() || effect?.id!==effectId || !same(effect.flags[scope].dispersion,data.flags[scope].dispersion))return refuse('uncertain');
      const complete={...receipt,stage:'complete'};await card.setFlag(scope,DISPERSION_RECEIPT,complete);
      if(!claimed() || !same(card.getFlag(scope,DISPERSION_RECEIPT),complete) || !await cleanup())return refuse('uncertain');
      return {ok:true,effectId};
    }catch{return refuse('uncertain');}
  };
  const next=queue.then(run,run);queue=next.catch(()=>{});return next;
}
async function request(query,payload,handler) {
  const gm=game.users?.activeGM;if(!gm)return refuse('authority');
  try{return gm.id===game.user.id ? await handler(payload,{user:game.user}) : await gm.query(query,payload,{timeout:30000});}
  catch{return refuse('uncertain');}
}
export const requestDispersionPreparation=(actor,spell)=>request(DISPERSION_PREPARE,{casterUuid:actor.uuid,spellUuid:spell.uuid},prepareDispersionCast);
export const requestDispersionResolution=card=>request(DISPERSION_RESOLVE,{messageId:card.id},resolveDispersionCast);

export function dispersionCreationReviewState(card) {
  const f=card?.flags?.[scope];if(f?.kind!=='spell' || f.identifier!=='dispersion')return null;
  const receipt=card.getFlag(scope,DISPERSION_RECEIPT) ?? null,review=card.getFlag(scope,DISPERSION_REVIEW) ?? null;
  let original;try{original=JSON.parse(receipt?.identity ?? 'null');}catch{original=null;}
  const uuid=Array.isArray(original)?original[3]:f.caster,caster=resolve(uuid);
  const claim=caster?.getFlag(scope,DISPERSION_CLAIM) ?? null;
  const actor={uuid,name:caster?.name ?? uuid,missing:!caster,effects:[...(caster?.effects ?? [])]
    .map(e=>e.toObject?.() ?? e).sort((a,b)=>String(a._id).localeCompare(String(b._id)))};
  const pending=f.success===true && (claim?.messageId===card.id || (review?.cleanup!=='complete'
    && (Boolean(review) || receipt?.stage!=='complete')));
  const basis=JSON.stringify({identity:['kind','identifier','cast','caster','spellUuid','success'].map(k=>f[k]),receipt,actor});
  return {pending,actor,claim,receipt,review,basis,expected:JSON.stringify({basis,claim,review})};
}

/** The GM reconciles the visible form first. This closes delivery only; it
 * never casts, creates/deletes protection, refunds Mana, or changes a use. */
export async function reviewDispersionCreation({messageId,expected,acknowledged}={}, {user}={}) {
  if(!writer() || !user?.isGM || acknowledged!==true)return refuse('permission');
  const run=async()=>{
    if(!writer() || !user?.isGM)return refuse('authority');
    const card=game.messages?.get(messageId),state=dispersionCreationReviewState(card);
    if(!state?.pending || state.expected!==expected)return refuse('changed');
    if(state.claim?.writerId && state.claim.writerId!==game.user.id && game.users.get?.(state.claim.writerId)?.active)
      return refuse('writerConnected');
    const caster=resolve(state.actor.uuid),reviewed=state.review ?? {by:user.id,at:Date.now(),expected};
    const valid=()=>writer() && game.messages.get(messageId)===card && resolve(state.actor.uuid)===caster
      && same(card.getFlag(scope,DISPERSION_REVIEW),reviewed) && dispersionCreationReviewState(card)?.basis===state.basis;
    try {
      if(!state.review)await card.setFlag(scope,DISPERSION_REVIEW,reviewed);
      if(!valid())return refuse('uncertain');
      if(caster && state.claim?.messageId===messageId){
        if(!same(caster.getFlag(scope,DISPERSION_CLAIM),state.claim))return refuse('changed');
        await caster.unsetFlag(scope,DISPERSION_CLAIM);if(!valid() || caster.getFlag(scope,DISPERSION_CLAIM))return refuse('uncertain');
      }
      const complete={...reviewed,cleanup:'complete'};await card.setFlag(scope,DISPERSION_REVIEW,complete);
      return writer() && game.messages.get(messageId)===card && same(card.getFlag(scope,DISPERSION_REVIEW),complete)
        ? {ok:true,reviewed:true} : refuse('uncertain');
    }catch{return refuse('uncertain');}
  };
  const next=queue.then(run,run);queue=next.catch(()=>{});return next;
}
export const requestDispersionCreationReview=(card,expected)=>request(DISPERSION_REVIEW_QUERY,
  {messageId:card.id,expected,acknowledged:true},reviewDispersionCreation);
