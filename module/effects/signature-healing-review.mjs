import {queueSignatureCard} from './signature-card-queue.mjs';
import {healingSignatureTurnReviewState,reviewHealingSignatureTurns} from './signature-turn-use.mjs';
import {healingTickReviewPatch} from '../rules/signature-healing-tick-review.mjs';
const scope='azeroth-rpg',flag='signatureHealingDelivery';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const authority=actor=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id&&resolve(actor.uuid)===actor;
const rows=()=>Array.from(game.messages?.values?.()??game.messages??[]);
function pendingCarriers(caster){
 const actors=new Map(Array.from(game.actors?.values?.()??[]).map(actor=>[actor.uuid,actor]));
 for(const scene of game.scenes?.values?.()??[])for(const token of scene.tokens?.values?.()??[]){
  if(token.actor)actors.set(token.actor.uuid,token.actor);
 }
 const carriers=[];
 for(const actor of actors.values())for(const effect of actor.effects?.values?.()??[]){
  const flags=effect.flags?.[scope],receipt=flags?.signatureHealingTickDelivery;
  if(flags?.tick?.source!==caster.uuid||receipt?.phase!=='pending')continue;
  const message=receipt.messageUuid?resolve(receipt.messageUuid):rows().find(card=>card.flags?.[scope]?.cast===receipt.cast&&card.flags?.[scope]?.healingSignatureCaster===caster.uuid);
  carriers.push({uuid:effect.uuid,data:effect.toObject(),actorUuid:actor.uuid,health:structuredClone(actor.system?.health??{}),messageUuid:message?.uuid??null});
 }
 return carriers.sort((a,b)=>a.uuid.localeCompare(b.uuid));
}
function recipient(ref){
 const actor=ref?.sceneId&&ref?.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor:game.actors?.get(ref?.actorId);
 return actor?.id===ref?.actorId?actor:null;
}
export function healingSignatureReviewState(actor){
 const turns=healingSignatureTurnReviewState(actor);
 const carriers=pendingCarriers(actor),linkedCards=new Set(carriers.map(row=>row.messageUuid));
 const cards=rows().filter(message=>message.flags?.[scope]?.healingSignatureCaster===actor.uuid
  &&(linkedCards.has(message.uuid)||Object.values(message.getFlag(scope,flag)?.events??{}).some(event=>event?.state==='pending')))
  .sort((a,b)=>a.uuid.localeCompare(b.uuid)).map(message=>{
   const flags=message.flags[scope],actors=new Map([[actor.uuid,actor]]);
   for(const ref of flags.targets??[]){const target=recipient(ref);if(target)actors.set(target.uuid,target);}
   for(const event of Object.values(message.getFlag(scope,flag)?.events??{})){
    const target=resolve(event?.targetUuid);if(target)actors.set(target.uuid,target);
   }
   return {uuid:message.uuid,data:message.toObject(),recipients:[...actors.values()].map(target=>({uuid:target.uuid,health:structuredClone(target.system?.health??{})}))};
  });
 const context={cards,carriers,health:structuredClone(actor.system?.health??{})};
 const state={turns,context};
 return {...state,pending:turns.pending.length>0||cards.length>0||context.carriers.length>0,expected:JSON.stringify(state)};
}
/** Internal active-GM review. It closes uncertain events as reviewed, never as
 * successful delivery. Later legitimate events retain base healing; the uncertain
 * casting's bonuses are conservatively consumed after explicit reconciliation. */
export async function reviewHealingSignatures(actor,{expected,acknowledged=false}={}){
 if(!authority(actor)||acknowledged!==true)return {ok:false,reason:'authority'};
 const initial=healingSignatureReviewState(actor);
 if(!initial.pending||initial.expected!==expected)return {ok:false,reason:'changed'};
 const writer=game.user.id;
 const queueIds=[...new Set([...initial.context.cards.map(card=>card.uuid),...initial.context.carriers.map(carrier=>carrier.messageUuid).filter(Boolean)])].sort();
 const locked=async index=>{
  if(index<queueIds.length){
   const message=resolve(queueIds[index]);
   if(!message)return {ok:false,reason:'changed'};
   return queueSignatureCard(message,()=>locked(index+1));
  }
  let context=initial.context;
  const valid=()=>authority(actor)&&game.user.id===writer&&same(healingSignatureReviewState(actor).context,context);
  if(!valid())return {ok:false,reason:'changed'};
  for(const row of context.cards)for(const event of Object.values(row.data.flags?.[scope]?.[flag]?.events??{})){
   if(event?.state==='pending'&&event.writer!==writer&&game.users.get(event.writer)?.active)return {ok:false,reason:'writerActive'};
  }
  for(const row of context.carriers){
   const receipt=row.data.flags[scope].signatureHealingTickDelivery;
   if(receipt.writer!==writer&&game.users.get(receipt.writer)?.active)return {ok:false,reason:'writerActive'};
   if(!healingTickReviewPatch(row.data.flags[scope].tick,receipt,{by:writer,at:Date.now()}))return {ok:false,reason:'carrierChanged'};
  }
  const closed=await reviewHealingSignatureTurns(actor,{expected:initial.turns.expected,acknowledged:true,validate:valid});
  if(!closed.ok)return closed;
  try{
   for(const row of initial.context.cards){
    if(!valid())return {ok:false,reason:'changed'};
    const message=resolve(row.uuid),state=structuredClone(message.getFlag(scope,flag)??{version:1,events:{},used:[]});
    const events=Object.fromEntries(Object.entries(state.events).map(([key,event])=>[key,event?.state==='pending'
     ?{...event,state:'reviewed',review:{by:writer,at:Date.now()}}:event]));
    const identities=(message.flags[scope].chosenHealingBonuses??[]).map(bonus=>bonus.identity)
     .filter(id=>['unending-life','libram-of-hope'].includes(id));
    const next={...state,events,used:[...new Set([...(state.used??[]),...identities])]};
    await message.setFlag(scope,flag,next);
    if(!authority(actor)||game.user.id!==writer||resolve(row.uuid)!==message||!same(message.getFlag(scope,flag),next))return {ok:false,reason:'uncertain'};
    if(row.recipients.some(target=>!same(resolve(target.uuid)?.system?.health,target.health)))return {ok:false,reason:'changed'};
    // Only the expected card receipt changed; never accept unrelated recipient
    // Health or other card changes that happened while awaiting its write.
    const remaining=context.cards.flatMap(card=>card.uuid!==row.uuid?[card]:context.carriers.some(carrier=>carrier.messageUuid===row.uuid)?[{...row,data:message.toObject()}]:[]);
    context={...context,cards:remaining};
    if(!valid())return {ok:false,reason:'changed'};
   }
   for(const row of initial.context.carriers){
    if(!valid())return {ok:false,reason:'changed'};
    const effect=resolve(row.uuid),flags=row.data.flags[scope];
    const change=healingTickReviewPatch(flags.tick,flags.signatureHealingTickDelivery,{by:writer,at:Date.now()});
    if(!effect||!change)return {ok:false,reason:'changed'};
    if(change.delete)await effect.delete();else await effect.update(change.patch);
    if(!authority(actor)||game.user.id!==writer||!same(resolve(row.actorUuid)?.system?.health,row.health))return {ok:false,reason:'uncertain'};
    if(change.delete?Boolean(resolve(row.uuid)):resolve(row.uuid)?.getFlag(scope,'signatureHealingTickDelivery')?.phase!=='reviewed')return {ok:false,reason:'uncertain'};
    context={...context,carriers:context.carriers.filter(carrier=>carrier.uuid!==row.uuid)};
    context.cards=context.cards.filter(card=>context.carriers.some(carrier=>carrier.messageUuid===card.uuid)
     ||Object.values(card.data.flags?.[scope]?.[flag]?.events??{}).some(event=>event?.state==='pending'));
    if(!valid())return {ok:false,reason:'changed'};
   }
   return {ok:true};
  }catch{return {ok:false,reason:'uncertain'};}
 };
 return locked(0);
}
