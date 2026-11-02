import {queueSignatureCard} from './signature-card-queue.mjs';
import {damageSignatureReviewState,reviewDamageSignature} from './signature-damage-review.mjs';
import {areaSaveWrites} from './area-save-write-state.mjs';
const scope='azeroth-rpg';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const authority=actor=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id&&resolve(actor.uuid)===actor;

/** Surviving timed effects are evidence of the base spell, never evidence that
 * an uncertain signature bonus did or did not land. */
export function orphanDamageCasts(actor){
 const actors=new Map([...(game.actors?.values?.()??[])].map(row=>[row.uuid,row]));
 for(const scene of game.scenes?.values?.()??[])for(const token of scene.tokens?.values?.()??[])if(token.actor)actors.set(token.actor.uuid,token.actor);
 const groups=new Map();
 for(const card of game.messages?.values?.()??[]){
  const f=card.flags?.[scope];
  if(f?.spellLockCaster===actor.uuid&&f.signatureDamageRecovery?.state==='pending'){
   const key=JSON.stringify([f.cast,f.spellUuid]);groups.set(key,{key,cast:f.cast,spellUuid:f.spellUuid,name:actor.name,cardUuid:card.uuid,carriers:[],regions:[]});
  }
 }
 for(const target of actors.values())for(const effect of target.effects?.values?.()??[]){
  const f=effect.flags?.[scope],tick=f?.tick;
  if(tick?.kind!=='damage'||!tick.cast||tick.signatureCast!==tick.cast||tick.source!==actor.uuid||!tick.castUuid)continue;
  const cards=[...(game.messages?.values?.()??[])].filter(card=>{const c=card.flags?.[scope];return c?.kind==='spell'&&c.success===true&&c.cast===tick.cast&&c.spellLockCaster===actor.uuid&&c.spellUuid===tick.castUuid;});
  if(cards.length>1||(cards.length===1&&cards[0].flags[scope].signatureDamageRecovery?.state!=='pending'))continue;
  const key=JSON.stringify([tick.cast,tick.castUuid]);
  const group=groups.get(key)??{key,cast:tick.cast,spellUuid:tick.castUuid,name:tick.name||effect.name,cardUuid:cards[0]?.uuid??null,carriers:[],regions:[]};
  group.carriers.push({uuid:effect.uuid,actorUuid:target.uuid,health:structuredClone(target.system.health),data:effect.toObject()});groups.set(key,group);
 }
 for(const scene of game.scenes?.values?.()??[])for(const region of scene.regions?.values?.()??[]){
  const f=region.flags?.[scope];if(!f?.cast||f.signatureDamageCast!==f.cast||f.caster!==actor.uuid)continue;
  const linked=game.messages.get(f.messageId);
  if(linked&&linked.flags?.[scope]?.signatureDamageRecovery?.state!=='pending')continue;
  const cards=[...(game.messages?.values?.()??[])].filter(card=>{const c=card.flags?.[scope];return c?.kind==='spell'&&c.success===true&&c.cast===f.cast&&c.spellLockCaster===actor.uuid;});
  if(cards.length>1||(cards.length===1&&!cards[0].flags[scope].signatureDamageRecovery))continue;
  const existing=[...groups.values()].find(group=>group.cast===f.cast),spellUuid=existing?.spellUuid??cards[0]?.flags[scope].spellUuid??f.signatureDamageSpellUuid??null;
  const key=existing?.key??JSON.stringify([f.cast,spellUuid]);
  const group=existing??{key,cast:f.cast,spellUuid,name:f.spell?.name||region.name,cardUuid:cards[0]?.uuid??null,carriers:[],regions:[]};
  group.regions.push({uuid:region.uuid,data:region.toObject(),health:[...(scene.tokens?.values?.()??[])].filter(token=>token.actor).map(token=>({uuid:token.actor.uuid,health:structuredClone(token.actor.system.health)}))});groups.set(key,group);
 }
 const selfSources=[...(actor.getFlag?.(scope,'sustaining')??[]).map(entry=>({kind:'sustain',data:entry,spellUuid:entry.uuid})),
  ...[...(actor.effects?.values?.()??[])].filter(effect=>effect.active!==false).map(effect=>({kind:'effect',uuid:effect.uuid,data:effect.flags?.[scope],spellUuid:effect.flags?.[scope]?.spell}))];
 for(const source of selfSources){
  const f=source.data;if(!f?.cast||f.signatureDamageCast!==f.cast||f.areaTick?.centre!=='self')continue;
  const cards=[...game.messages.values()].filter(card=>{const c=card.flags?.[scope];return c?.kind==='spell'&&c.success===true&&c.cast===f.cast&&c.spellLockCaster===actor.uuid;});
  if(cards.length>1||(cards.length===1&&cards[0].flags[scope].signatureDamageRecovery?.state!=='pending'))continue;
  const existing=[...groups.values()].find(group=>group.cast===f.cast),spellUuid=existing?.spellUuid??source.spellUuid??null;
  const key=existing?.key??JSON.stringify([f.cast,spellUuid]);
  const group=existing??{key,cast:f.cast,spellUuid,name:f.name||f.tickSpell?.name||actor.name,cardUuid:cards[0]?.uuid??null,carriers:[],regions:[]};
  (group.selfSources??=[]).push({...source,data:structuredClone(f)});groups.set(key,group);
 }
 for(const message of game.messages?.values?.()??[]){
  const f=message.flags?.[scope],area=f?.area,record=f?.areaResult;
  if(f?.kind!=='areaTest'||!message.author?.isGM||!record?.resultId||!area?.cast
   ||area.signatureDamageCast!==area.cast||area.caster!==actor.uuid||!area.signatureMessageId
   ||game.messages.has(area.signatureMessageId))continue;
  if(f.signatureAreaSaveDelivery?f.signatureAreaSaveDelivery.state!=='pending'
   :!(Number((record.success?area.check?.success:area.check?.fail)?.rating)>0))continue;
  const cards=[...game.messages.values()].filter(card=>{const c=card.flags?.[scope];return c?.kind==='spell'&&c.success===true&&c.cast===area.cast&&c.spellLockCaster===actor.uuid;});
  if(cards.length>1||(cards.length===1&&cards[0].flags[scope].signatureDamageRecovery?.state!=='pending'))continue;
  const existing=[...groups.values()].find(group=>group.cast===area.cast),spellUuid=existing?.spellUuid??null;
  const key=existing?.key??JSON.stringify([area.cast,spellUuid]);
  const group=existing??{key,cast:area.cast,spellUuid,name:area.spell?.name||actor.name,cardUuid:cards[0]?.uuid??null,carriers:[],regions:[]};
  (group.saves??=[]).push({uuid:message.uuid,id:message.id,author:message.author.id,flags:structuredClone(f),actorUuid:area.actorUuid,health:structuredClone(resolve(area.actorUuid)?.system?.health??null)});
  groups.set(key,group);
 }
 return [...groups.values()].map(group=>{group.selfSources??=[];group.selfHealth=group.selfSources.length?[...actors.values()].map(a=>({uuid:a.uuid,health:structuredClone(a.system?.health??null)})):[];group.saves??=[];group.saves.sort((a,b)=>a.uuid.localeCompare(b.uuid));group.carriers.sort((a,b)=>a.uuid.localeCompare(b.uuid));group.regions.sort((a,b)=>a.uuid.localeCompare(b.uuid));return {...group,expected:JSON.stringify(group)};});
}

/** Internal GM recovery. A replacement ledger contains no cast roll or usable
 * bonus; it stays inert until reconciliation of every pending carrier finishes. */
export function recoverOrphanDamageCast(actor,{key,expected,acknowledged=false}={}){
 if(!authority(actor)||acknowledged!==true)return Promise.resolve({ok:false,reason:'authority'});
 return queueSignatureCard({uuid:`${actor.uuid}:orphan:${key}`},async()=>{
  const writer=game.user.id,group=orphanDamageCasts(actor).find(row=>row.key===key);
  if(!group||group.expected!==expected)return {ok:false,reason:'changed'};
  const matches=[...(game.messages?.values?.()??[])].filter(card=>{const f=card.flags?.[scope];return f?.kind==='spell'&&f.success===true&&f.cast===group.cast&&f.spellLockCaster===actor.uuid;});
  if(matches.length>1||(matches.length===1&&matches[0].uuid!==group.cardUuid))return {ok:false,reason:'ambiguous'};
  let remainingRegions=group.regions;
  const selfUnchanged=()=>group.selfSources.every(row=>same(row.kind==='effect'?resolve(row.uuid)?.flags?.[scope]
   :(actor.getFlag?.(scope,'sustaining')??[]).find(entry=>entry.cast===row.data.cast),row.data))
   &&group.selfHealth.every(row=>same(resolve(row.uuid)?.system?.health??null,row.health));
  const unchanged=()=>authority(actor)&&game.user.id===writer&&group.carriers.every(row=>{
   const effect=resolve(row.uuid);return effect&&same(effect.toObject(),row.data)&&same(resolve(row.actorUuid)?.system.health,row.health);
  })&&remainingRegions.every(row=>same(resolve(row.uuid)?.toObject(),row.data))
   &&group.regions.every(row=>row.health.every(target=>same(resolve(target.uuid)?.system.health,target.health)))
   &&selfUnchanged()&&group.saves.every(row=>same(resolve(row.uuid)?.flags?.[scope],row.flags)&&resolve(row.uuid)?.author?.id===row.author
    &&resolve(row.uuid)?.author?.isGM===true&&same(resolve(row.actorUuid)?.system?.health??null,row.health)&&!areaSaveWrites.has(row.id));
  const receipts=group.carriers.map(row=>row.data.flags[scope].signatureTickDelivery).filter(Boolean);
  if(receipts.some(row=>row.phase==='pending'&&row.writer!==writer&&game.users.get(row.writer)?.active))return {ok:false,reason:'writerActive'};
  if(group.saves.some(row=>{const owner=row.flags.signatureAreaSaveDelivery?.writer??row.author;return owner!==writer&&game.users.get(owner)?.active;}))return {ok:false,reason:'writerActive'};
  if(!unchanged())return {ok:false,reason:'changed'};
  try{
   let card=group.cardUuid?resolve(group.cardUuid):null;
   if(!card)card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:game.i18n.localize('AZEROTH.Signature.DamageReview.RecoveryRecord'),flags:{[scope]:{
    kind:'spell',success:true,cast:group.cast,spellUuid:group.spellUuid,spellLockCaster:actor.uuid,targets:[],chosenSignatureBonuses:[],
    chosenSignatureDelivery:{version:1,cast:group.cast,entries:[]},
    signatureDamageRecovery:{state:'pending',bonusesClosed:true,by:writer,
     skippedTurns:group.regions.length||group.selfSources.length?[...(game.combats?.values?.()??[])].filter(combat=>combat.started&&combat.active===true
      &&(group.regions.some(row=>resolve(row.uuid)?.parent?.id===combat.scene?.id)
       ||group.selfSources.length&&[...(combat.scene?.tokens?.values?.()??[])].some(token=>token.actor?.uuid===actor.uuid))).map(combat=>({id:combat.id,round:combat.round,turn:combat.turn})):[],
     originalMessageUuids:[...new Set([...receipts.map(row=>row.messageUuid),...group.saves.map(row=>`ChatMessage.${row.flags.area.signatureMessageId}`),...group.regions.map(row=>row.data.flags[scope].messageId?`ChatMessage.${row.data.flags[scope].messageId}`:null)].filter(Boolean))]}
   }}});
   if(!card||!unchanged())return {ok:false,reason:'uncertain'};
   if(card.flags[scope].signatureDamageRecovery.state!=='pending')return {ok:false,reason:'changed'};
   for(const row of group.regions){
    if(!unchanged())return {ok:false,reason:'changed'};
    const region=resolve(row.uuid);await region.setFlag(scope,'messageId',card.id);
    if(!authority(actor)||game.user.id!==writer||resolve(row.uuid)!==region
     ||!same(region.flags[scope],{...row.data.flags[scope],messageId:card.id}))return {ok:false,reason:'uncertain'};
    remainingRegions=remainingRegions.filter(other=>other.uuid!==row.uuid);
   }
   if(!unchanged())return {ok:false,reason:'changed'};
   const state=damageSignatureReviewState(card);
   const reviewed=await reviewDamageSignature(card,{expected:state.expected,acknowledged:true});
   if(!reviewed.ok)return reviewed;
   if(!authority(actor)||game.user.id!==writer||!selfUnchanged()
    ||group.saves.some(row=>!same(resolve(row.actorUuid)?.system?.health??null,row.health))
    ||group.carriers.some(row=>!same(resolve(row.actorUuid)?.system.health,row.health))
    ||group.regions.some(row=>row.health.some(target=>!same(resolve(target.uuid)?.system.health,target.health))))return {ok:false,reason:'uncertain'};
   const recovery={...card.flags[scope].signatureDamageRecovery,state:'complete',reviewedBy:writer};
   await card.setFlag(scope,'signatureDamageRecovery',recovery);
   if(!authority(actor)||game.user.id!==writer||!same(card.flags[scope].signatureDamageRecovery,recovery))return {ok:false,reason:'uncertain'};
   return {ok:true,cardUuid:card.uuid};
  }catch{return {ok:false,reason:'uncertain'};}
 });
}
