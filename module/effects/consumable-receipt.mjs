import {hasUse} from '../rules/consumables.mjs';
import {acquireConsumableUse} from './consumable-use-lock.mjs';
export const CONSUMABLE_RECEIPT_QUERY='azeroth-rpg.consumableReceipt';
export const CONSUMABLE_RECEIPT_FLAG='consumableUse';
const scope='azeroth-rpg',busy=new Set();
const terminal=row=>['complete','reviewed','cancelled'].includes(row?.stage);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const gmHere=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
const read=actor=>actor.getFlag(scope,CONSUMABLE_RECEIPT_FLAG);
const snapshot=actor=>({health:actor.system.health,fatigue:actor.system.fatigue,pools:actor.poolSnapshot?.()??[],
 effects:[...actor.effects].map(e=>e.toObject()),budget:actor.activeFight?.()?.getCombatantsByActor(actor)?.[0]?.budget??null});

/** Only the active GM serializes durable claims; benefits still run on the
 * requesting owner. Review cannot race a connected, unfinished owner. */
export async function consumableReceiptHandler(data={}, {user}={}){
 if(!gmHere()||!user?.active)return {ok:false,reason:'authority'};
 const actor=await fromUuid(data.actorUuid);
 if(actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER'))return {ok:false,reason:'owner'};
 if(typeof data.key!=='string'||!data.key||data.key.length>64)return {ok:false,reason:'request'};
 if(busy.has(actor.uuid))return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const prior=read(actor);let next;
  if(data.op==='begin'){
   if(prior&&(!terminal(prior)||prior.key===data.key))return {ok:false,reason:'pending'};
   const item=actor.items.get(data.itemId);
   if(!item||!hasUse(item.system.use)||item.parent!==actor
     ||JSON.stringify({name:item.name,use:item.system.use})!==data.source||item.system.quantity!==data.quantity)
    return {ok:false,reason:'changed'};
   next={version:1,key:data.key,stage:'claimed',requester:user.id,writer:game.user.id,itemId:item.id,itemName:item.name,
    quantity:item.system.quantity??null,source:data.source,before:structuredClone(snapshot(actor)),stopped:false,
    messageUuid:null,reviewedBy:null};
  }else{
   if(!prior||terminal(prior)||prior.key!==data.key||prior.requester!==user.id)return {ok:false,reason:'changed'};
   if(data.op==='uncertain')next={...prior,stopped:true};
   else if(data.op==='advance'){
    const legal={claimed:['actionPaid','cancelled'],actionPaid:['dosePaid'],dosePaid:['complete']};
    if(prior.stopped||!legal[prior.stage]?.includes(data.stage))return {ok:false,reason:'stage'};
    if(data.stage==='complete'){
     const card=await fromUuid(data.messageUuid),f=card?.flags?.[scope];
     if(card?.author?.id!==user.id||card.speaker?.actor!==actor.id||f?.kind!=='gear'||f.itemId!==prior.itemId)
      return {ok:false,reason:'card'};
    }
    next={...prior,stage:data.stage,...(data.messageUuid?{messageUuid:data.messageUuid}:{})};
   }else return {ok:false,reason:'request'};
  }
  if(!gmHere()||!user.active||!actor.testUserPermission(user,'OWNER')||!same(read(actor),prior))return {ok:false,reason:'changed'};
  await actor.setFlag(scope,CONSUMABLE_RECEIPT_FLAG,next);
  return gmHere()&&same(read(actor),next)?{ok:true,key:next.key,stage:next.stage}:{ok:false,reason:'uncertain'};
 }finally{busy.delete(actor.uuid);}
}

export async function requestConsumableReceipt(actor,payload){
 const gm=game.users.activeGM;
 const data={...payload,actorUuid:actor.uuid};
 const result=gm?(gm.id===game.user.id?await consumableReceiptHandler(data,{user:game.user})
  :await gm.query(CONSUMABLE_RECEIPT_QUERY,data,{timeout:30000})):null;
 if(!result?.ok)throw Error(`Consumable use needs GM review before another attempt (${result?.reason??'noGM'})`);
 return result;
}

export function consumableReviewState(actor){
 const receipt=read(actor),item=actor.items.get(receipt?.itemId);
 return {pending:!!receipt&&!terminal(receipt),receipt,quantity:item?.system.quantity??0,
  expected:JSON.stringify({receipt,item:item?.toObject()??null,current:snapshot(actor)})};
}
export async function reviewConsumableReceipt(actor,{expected,acknowledged=false}={}){
 if(!gmHere()||!acknowledged||busy.has(actor.uuid))return {ok:false,reason:'authority'};
 const release=acquireConsumableUse(actor);if(!release)return {ok:false,reason:'busy'};
 busy.add(actor.uuid);
 try{
  const state=consumableReviewState(actor),row=state.receipt;
  if(!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
  if(!row.stopped&&row.requester!==game.user.id&&game.users.get(row.requester)?.active)return {ok:false,reason:'writerActive'};
  const next={...row,stage:'reviewed',reviewedBy:game.user.id};
  await actor.setFlag(scope,CONSUMABLE_RECEIPT_FLAG,next);
  return {ok:gmHere()&&same(read(actor),next)};
 }finally{busy.delete(actor.uuid);release();}
}
