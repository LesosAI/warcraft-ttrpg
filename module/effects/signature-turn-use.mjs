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
