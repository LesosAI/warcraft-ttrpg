import {claimSignatureTurn,finishSignatureTurn,signatureTurnIdentity} from '../rules/signature-turn-uses.mjs';
import {withdrawHitSignatureTurns} from '../rules/signature-hit-withdrawal.mjs';
export const SIGNATURE_TURN_FLAG='signatureTurnUses';
const busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const authoritative=actor=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id&&fromUuidSync(actor?.uuid)===actor;
/** Shares the publication lock: withdrawal cannot overwrite a new hit's claim. */
export async function restoreTurnSignatures({actor,event,identifiers,previous,validate}={}){
 if(!authoritative(actor)||typeof validate!=='function')return {ok:false,reason:'authority'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  if(validate()!==true)return {ok:false,reason:'changed'};
  const records=actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{};
  const result=withdrawHitSignatureTurns(records,{event,identifiers,previous});
  if(!result)return {ok:false,reason:'receipt'};
  if(result.restored.length)await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,result.records);
  return {ok:authoritative(actor)&&validate()===true&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{},result.records),
    restored:result.restored};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(actor.uuid);}
}
export function parrySignatureReviewState(actor){
 const records=actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{};
 const record=records['conquerors-battlegear'];
 const state={records,reacted:actor.getFlag('azeroth-rpg','reacted')??null,
  mitigate:actor.getFlag('azeroth-rpg','mitigate')??null,pools:actor.poolSnapshot?.()??[],
  budget:actor.activeFight?.()?.getCombatantsByActor(actor)?.[0]?.budget??null};
 return {...state,record,pending:record?.version===1&&Boolean(record.pending),expected:JSON.stringify(state)};
}
/** GM reconciliation closes an uncertain Parry allowance without replaying
 * its Test, payment or effects. The original turn remains the spent turn. */
export async function reviewParrySignature(actor,{expected,acknowledged=false}={}){
 if(!authoritative(actor)||acknowledged!==true)return {ok:false,reason:'authority'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const state=parrySignatureReviewState(actor);
  if(!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
  const pending=state.record.pending;
  if(pending.writer!==game.user.id&&game.users.get(pending.writer)?.active)return {ok:false,reason:'writerActive'};
  const completed=finishSignatureTurn(state.records,{identifier:'conquerors-battlegear',
   event:pending.event,writer:pending.writer,committed:true});
  if(!completed)return {ok:false,reason:'invalid'};
  completed['conquerors-battlegear'].review={by:game.user.id,event:pending.event,at:Date.now()};
  await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,completed);
  return {ok:authoritative(actor)&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG),completed)};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(actor.uuid);}
}
export function signatureTurnContext(actor){
 const fight=actor.activeFight?.();
 return {now:game.time?.worldTime,combat:fight?.uuid??null,
  turn:fight?`${fight.round}:${fight.turn}:${fight.combatant?.id??''}`:null};
}

const killIds=['death-grips','spinal-reaper'];
const healingIds=['unending-life','libram-of-hope'];
export function healingSignatureTurnReviewState(actor){
 const records=structuredClone(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{});
 const pending=healingIds.filter(id=>records[id]?.version===1&&records[id]?.pending);
 const state={records,health:structuredClone(actor.system?.health??{})};
 return {...state,pending,expected:JSON.stringify(state)};
}

/** Internal allowance step of healing recovery. The outer coordinator must hold
 * affected card queues and validate recipient/carrier snapshots. This step never
 * marks a healing receipt delivered, heals, or refunds a spent allowance. */
export async function reviewHealingSignatureTurns(actor,{expected,acknowledged=false,validate}={}){
 if(!authoritative(actor)||acknowledged!==true)return {ok:false,reason:'authority'};
 if(typeof validate!=='function')return {ok:false,reason:'context'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const state=healingSignatureTurnReviewState(actor);
  if(state.expected!==expected||validate()!==true)return {ok:false,reason:'changed'};
  if(!state.pending.length)return {ok:true,already:true};
  let completed=state.records;
  for(const identifier of state.pending){
   const pending=state.records[identifier].pending;
   if(pending.writer!==game.user.id&&game.users.get(pending.writer)?.active)return {ok:false,reason:'writerActive'};
   completed=finishSignatureTurn(completed,{identifier:identifier==='unending-life'?'mace-of-unending-life':identifier,event:pending.event,writer:pending.writer,committed:true});
   if(!completed)return {ok:false,reason:'invalid'};
   completed[identifier].review={by:game.user.id,event:pending.event,at:Date.now()};
  }
  if(!authoritative(actor)||validate()!==true)return {ok:false,reason:'changed'};
  await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,completed);
  return {ok:authoritative(actor)&&validate()===true&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG),completed)};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(actor.uuid);}
}
const hitIds=['the-horsemans-blade','idol-of-brutality','idol-of-ferocity','band-of-veiled-shadows'];
export function hitSignatureReviewState(actor){
 const records=actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{};
 const pending=hitIds.filter(id=>records[id]?.version===1&&records[id]?.pending);
 const events=new Set(pending.map(id=>records[id].pending.event));
 const cards=(game.messages?.filter(message=>{
  const receipt=message.getFlag('azeroth-rpg','signatureHitBonuses');
  return receipt?.actorUuid===actor.uuid&&events.has(receipt.event);
 })??[]).map(message=>({id:message.id,data:message.toObject()}));
 const state={records,cards,health:structuredClone(actor.system?.health??{}),pools:actor.poolSnapshot?.()??[],
  budget:actor.activeFight?.()?.getCombatantsByActor(actor)?.[0]?.budget??null};
 return {...state,pending,expected:JSON.stringify(state)};
}

/** Reconcile an interrupted hit publication without publishing, applying damage,
 * or refunding its allowance. Missing cards/items do not erase the actor record.
 * The GM must settle any already published attack separately before acknowledging. */
export async function reviewHitSignatures(actor,{expected,acknowledged=false}={}){
 if(!authoritative(actor)||acknowledged!==true)return {ok:false,reason:'authority'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const state=hitSignatureReviewState(actor);
  if(!state.pending.length||state.expected!==expected)return {ok:false,reason:'changed'};
  let completed=state.records;
  for(const identifier of state.pending){
   const pending=state.records[identifier].pending;
   if(pending.writer!==game.user.id&&game.users.get(pending.writer)?.active)return {ok:false,reason:'writerActive'};
   completed=finishSignatureTurn(completed,{identifier,event:pending.event,writer:pending.writer,committed:true});
   if(!completed)return {ok:false,reason:'invalid'};
   completed[identifier].review={by:game.user.id,event:pending.event,at:Date.now()};
  }
  await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,completed);
  return {ok:authoritative(actor)&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG),completed)};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(actor.uuid);}
}

export function killSignatureReviewState(actor){
 const records=actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{};
 const pending=killIds.filter(id=>records[id]?.version===1&&records[id]?.pending);
 const state={records,health:structuredClone(actor.system?.health??{}),
  cards:pending.map(id=>{
   const event=records[id].pending.event;
   const messageId=typeof event==='string'&&event.startsWith('weapon-kill:')?event.split(':')[1]:null;
   const message=game.messages?.get(messageId);
   return {id,event,messageId,exists:Boolean(message),receipt:structuredClone(message?.getFlag('azeroth-rpg','signatureWeaponKill')?.[id]??null)};
  })};
 return {...state,pending,expected:JSON.stringify(state)};
}

/** Explicit GM reconciliation of actor-held kill allowances. Old cards stay
 * non-replayable; this never grants or refunds Health/temporary Health. */
export async function reviewKillSignatures(actor,{expected,acknowledged=false}={}){
 const {killRewardInFlight}=await import('./signature-kill-rewards.mjs');
 if(!authoritative(actor)||acknowledged!==true)return {ok:false,reason:'authority'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const state=killSignatureReviewState(actor);
  if(!state.pending.length||state.expected!==expected)return {ok:false,reason:'changed'};
  if(state.cards.some(card=>killRewardInFlight(card.messageId)))return {ok:false,reason:'busy'};
  let completed=state.records;
  for(const identifier of state.pending){
   const pending=state.records[identifier].pending;
   if(pending.writer!==game.user.id&&game.users.get(pending.writer)?.active)return {ok:false,reason:'writerActive'};
   if(typeof pending.event!=='string'||!pending.event.startsWith('weapon-kill:')||!pending.event.endsWith(`:${identifier}`))return {ok:false,reason:'invalid'};
   completed=finishSignatureTurn(completed,{identifier,event:pending.event,writer:pending.writer,committed:true});
   if(!completed)return {ok:false,reason:'invalid'};
   completed[identifier].review={by:game.user.id,event:pending.event,at:Date.now()};
  }
  await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,completed);
  return {ok:authoritative(actor)&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG),completed)};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{busy.delete(actor.uuid);}
}

/** Internal coordinator. The authenticated caller validates the triggering
 * card, selected recipient, equipped source and saved amount. No client-supplied
 * amount or public query is accepted here. Pending claims survive uncertain
 * writes. Execute reports committed only from a complete benefit receipt.
 */
export async function deliverTurnSignature({actor,identifier,event,validate,execute}={}){
 return deliverTurnSignatures({actor,identifiers:[identifier],event,validate,execute,requireAvailable:true});
}
export async function deliverTurnSignatures({actor,identifiers=[],event,validate,execute,requireAvailable=false}={}){
 if(!actor?.uuid||typeof validate!=='function'||typeof execute!=='function'||!authoritative(actor))return {ok:false,reason:'authority'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const writer=game.user.id,context=signatureTurnContext(actor);
  const valid=()=>authoritative(actor)&&game.user.id===writer&&validate()===true&&same(signatureTurnContext(actor),context);
  if(!valid())return {ok:false,reason:'changed'};
  const args={event,writer,...context},selected=[],seen=new Set();
  let records=structuredClone(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{});
  for(const identifier of identifiers){
   const identity=signatureTurnIdentity(identifier);if(!identity||seen.has(identity))continue;
   seen.add(identity);
   if(records[identity]?.pending)return {ok:false,reason:'unavailable'};
   const claim=claimSignatureTurn(records,{...args,identifier});
   if(claim){records=claim.records;selected.push(identifier);}
  }
  if(requireAvailable&&!selected.length)return {ok:false,reason:'unavailable'};
  if(selected.length)await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,records);
  const held=()=>valid()&&same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{},records);
  if(!held())return {ok:false,reason:'claimUncertain'};
  const result=await execute({valid:held,identifiers:selected});
  if(!held()||result?.complete!==true||typeof result.committed!=='boolean')return {ok:false,reason:'deliveryUncertain'};
  let completed=records;
  for(const identifier of selected){completed=finishSignatureTurn(completed,{...args,identifier,committed:result.committed});
   if(!completed)return {ok:false,reason:'deliveryUncertain'};}
  if(selected.length)await actor.setFlag('azeroth-rpg',SIGNATURE_TURN_FLAG,completed);
  if(!valid()||!same(actor.getFlag('azeroth-rpg',SIGNATURE_TURN_FLAG)??{},completed))return {ok:false,reason:'completionUncertain'};
  return {ok:true,committed:result.committed};
 }catch{return {ok:false,reason:'writeUncertain'};}
 finally{busy.delete(actor.uuid);}
}

/** Only actual Health restored consumes the healing allowance. A thrown or
 * incomplete heal cannot release a claim based on an inferred zero. */
export function signatureHealingReceipt(outcome){
 if(outcome?.complete!==true||!Number.isFinite(outcome.restored)||outcome.restored<0)return {complete:false};
 return {complete:true,committed:outcome.restored>0};
}
