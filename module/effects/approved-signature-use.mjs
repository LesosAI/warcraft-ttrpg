import {approvedSignatureValues} from '../rules/approved-signature-values.mjs';
import {approvedRestSignature,approvedHitSignature,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
import {prepareCannonballShot} from './cannonball-preparation.mjs';
import {reviewPiccoloPerformance} from './piccolo-review.mjs';
import {prepareJangthrazeHit} from './signature-hit-use.mjs';
import {prepareHelmetHit} from './helmet-hit-use.mjs';
export {approvedCharm,approvedRestSignature,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
export const APPROVED_SIGNATURE_USE_QUERY='azeroth-rpg.approvedSignatureUse';
export const SIGNATURE_USE_AUTHORITY=Symbol('approved signature execution');
const queues=new Map();
const writer=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

async function request(data){
 const gm=game.users.activeGM;
 if(!gm)return {ok:false,reason:'noGM'};
 return gm.id===game.user.id?approvedSignatureUseQueryHandler(data,{user:game.user}):gm.query(APPROVED_SIGNATURE_USE_QUERY,data,{timeout:600000});
}
export async function requestApprovedSignatureUse(actor,item,targets=[],hit=null){
 const result=await request({actorUuid:actor.uuid,itemId:item.id,targets,hit});
 if(!result.ok){ui.notifications?.warn(game.i18n.localize('AZEROTH.Signature.UseUnavailable'));return null;}
 return result.messageUuid?fromUuid(result.messageUuid):null;
}
export async function restoreApprovedSignatureUses(actor,rest){
 if(!['short','long'].includes(rest)||!Object.keys(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)??{}).length)return;
 const result=await request({actorUuid:actor.uuid,rest});
 if(!result.ok)throw Error(game.i18n.localize('AZEROTH.Signature.UseUnavailable'));
}

export function signatureUseReviewState(actor){
 const records=Object.fromEntries(Object.entries(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)??{})
  .filter(([id,row])=>approvedRestSignature(id)&&row.state==='pending'));
 const health={value:actor.system?.health?.value??null,temp:actor.system?.health?.temp??0};
 const fight=actor.activeFight?.(),budget=fight?.getCombatantsByActor(actor)?.[0]?.budget??null;
 return {records,health,budget,pending:Object.keys(records).length>0,expected:JSON.stringify({records,health,budget})};
}

/** Acknowledges manual reconciliation, never repeats a benefit or refunds a
 * potentially paid action. Works even after the source item/card is deleted. */
export async function reviewApprovedSignatureUses(actor,{expected,acknowledged=false}={}){
 if(!writer()||acknowledged!==true)return {ok:false,reason:'permission'};
 if(queues.has(actor.uuid))return {ok:false,reason:'busy'};
 const run=async()=>{
  const state=signatureUseReviewState(actor);
  if(!writer()||fromUuidSync(actor.uuid)!==actor||!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
  if(Object.values(state.records).some(row=>row.writer&&row.writer!==game.user.id&&game.users.get(row.writer)?.active))return {ok:false,reason:'writerActive'};
  const records=structuredClone(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)??{});
  for(const id of Object.keys(state.records))records[id]={...records[id],state:'spent',reviewedBy:game.user.id,reviewedAt:Date.now()};
  try{
   await actor.setFlag('azeroth-rpg',SIGNATURE_USES_FLAG,records);
   return {ok:writer()&&fromUuidSync(actor.uuid)===actor&&same(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG),records)};
  }catch{return {ok:false,reason:'uncertain'};}
 };
 const next=Promise.resolve().then(run);queues.set(actor.uuid,next);
 try{return await next;}finally{if(queues.get(actor.uuid)===next)queues.delete(actor.uuid);}
}

/** Serialize uses and rests on the active GM. Pending records survive reload
 * and cannot be cleared by a rest after an uncertain benefit/payment write. */
export async function approvedSignatureUseQueryHandler({actorUuid,itemId,rest,targets=[],hit=null}={}, {user}={}){
 if(!writer())return {ok:false,reason:'authority'};
 const actor=await fromUuid(actorUuid);
 if(actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER'))return {ok:false,reason:'owner'};
 const run=async()=>{
  const validActor=()=>writer()&&fromUuidSync(actorUuid)===actor&&actor.testUserPermission(user,'OWNER');
  if(!validActor())return {ok:false,reason:'changed'};
  const records=structuredClone(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)??{});
  if(rest){
   if(!['short','long'].includes(rest))return {ok:false,reason:'rest'};
    for(const [id,record] of Object.entries(records))if(approvedRestSignature(id)&&record.state==='spent')records[id]={...record,state:'ready'};
   await actor.setFlag('azeroth-rpg',SIGNATURE_USES_FLAG,records);
   return {ok:validActor()&&same(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG),records)};
  }
  const item=actor.items.get(itemId),id=item?.system?.identifier;
   const hitUse=approvedHitSignature(id);
   if(!approvedRestSignature(id)||!item.system.equipped||item.system.signatureEffect?.kind!==(hitUse?'onHit':'use'))return {ok:false,reason:'item'};
  if(records[id]&&records[id].state!=='ready')return {ok:false,reason:'spent'};
  const snapshot=()=>JSON.stringify({system:item.toObject().system,flags:item.flags});
  const original=snapshot();
  const ownModifiers=Object.fromEntries(Object.entries(actor.system.abilities??{}).map(([key,value])=>[key,value.own?.mod??value.mod]));
  const ranks=actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{};
   const prepared=id==='jangthraze-the-protector'?prepareJangthrazeHit({actor,item,hit})
    :id==='horned-viking-helmet'?prepareHelmetHit({actor,item,hit}):id==='cannonball-runner'?prepareCannonballShot({actor,item,targets})
    :id==='piccolo-of-the-flaming-fire'?await reviewPiccoloPerformance({actor,item,targets,
      validSource:()=>validActor()&&actor.items.get(itemId)===item&&snapshot()===original}):null;
   if(prepared&&!prepared.ok)return {ok:false,reason:prepared.reason};
   const values=approvedSignatureValues(id,{ownModifiers,skillRanks:{medicine:ranks.medicine??0,tinkering:ranks.tinkering??0,performance:ranks.performance??0,athletics:ranks.athletics??0}});
  if(!values)return {ok:false,reason:'values'};
   const claim={...(records[id]??{}),state:'pending',writer:game.user.id,itemUuid:item.uuid,values,
    ...(prepared?.shot?{shot:structuredClone(prepared.shot)}:{}),
    ...(prepared?.performance?{performance:structuredClone(prepared.performance)}:{}),
    ...(prepared?.hit?{hit:structuredClone(prepared.hit)}:{})};
  const valid=()=>validActor()&&actor.items.get(itemId)===item&&snapshot()===original
    &&same(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)?.[id],claim)&&(!prepared||prepared.valid());
  let paid=false;
  try{
   await actor.setFlag('azeroth-rpg',SIGNATURE_USES_FLAG,{...records,[id]:claim});
   if(!valid())return {ok:false,reason:'claim'};
   const message=await game.system.azeroth.workflows.useSignature({actor,item,
    targets:prepared?.shot?[prepared.shot.target]:prepared?.performance?.targets.map(row=>row.ref)??[],
    approved:{authority:SIGNATURE_USE_AUTHORITY,values,shot:prepared?.shot??null,
      performance:prepared?.performance??null,hit:prepared?.hit??null,valid,paid:()=>{paid=true;}}});
   // **THE END SETTLES THE RECORD AND NEVER REFUSES THE USE** (D-768; the lead:
   // *"I don't want a half-action wasted bug"*). The door asks `valid` last,
   // before the turn's budget, and calls `paid` once the budget has landed;
   // from there it is committed and delivers, so what moved since - the item,
   // a prepared target - changes nothing it delivered. All that is asked here
   // is whether this writer still holds the claim to settle it: spent with the
   // card, ready again where the door refused before anything was paid, and
   // left pending for the GM's review where the claim moved under it.
   const held=()=>validActor()&&same(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)?.[id],claim);
   if(!message&&paid)return {ok:false,reason:'uncertain'};
   if(!held())return {ok:false,reason:paid?'uncertain':'changed'};
   const completed=message?{...claim,state:'spent',messageUuid:message.uuid}:{...claim,state:'ready'};
   await actor.setFlag('azeroth-rpg',SIGNATURE_USES_FLAG,{...records,[id]:completed});
   if(!validActor()||!same(actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG)?.[id],completed))return {ok:false,reason:'uncertain'};
   return {ok:Boolean(message),messageUuid:message?.uuid};
  }catch{return {ok:false,reason:'uncertain'};}
 };
 const next=(queues.get(actorUuid)??Promise.resolve()).then(run,run);queues.set(actorUuid,next);
 try{return await next;}finally{if(queues.get(actorUuid)===next)queues.delete(actorUuid);}
}
