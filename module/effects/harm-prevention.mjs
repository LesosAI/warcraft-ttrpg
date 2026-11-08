/** Harm Prevention Belt answers only an original hit already held by Apply. */
import {answererOf,confirmHere,ASK_MS} from "./blow-doors.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {dispersionRefusal} from "../rules/dispersion.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {OVERCLOCK_FLAG} from "../rules/gadgets.mjs";
export const HARM_BELT_QUERY="azeroth-rpg.harmBeltAnswer";
const NS="azeroth-rpg",FLAG="harmBelt",RECEIPT="harmBeltReceipt",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const words=key=>game.i18n.localize(`AZEROTH.HarmBelt.${key}`);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const writes=new Map();
async function saveBeltMark(message,key,next,valid=writer){
  const previous=writes.get(message.uuid)??Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if(!valid())throw Error("Belt writer changed");
    const rows={...(message.getFlag(NS,FLAG)??{}),[key]:next};await message.setFlag(NS,FLAG,rows);
    if(!valid()||!same(message.getFlag(NS,FLAG)?.[key],next))throw Error("Belt resolution unconfirmed");
  });writes.set(message.uuid,task);
  try{await task;}finally{if(writes.get(message.uuid)===task)writes.delete(message.uuid);}
}
const beltOf=actor=>actor.items?.find(i=>i.type==="feature"&&i.getFlag(NS,"feature")?.gadget==="harm-prevention-belt");
function hitOf(actor,message){
  const f=message?.flags?.[NS];if(!f||f.notAttack||f.parry
    ||!(f.kind==="attack"||f.kind==="spell"&&f.mirrorImageDefense===true&&f.success===true))return null;
  const rows=f.attackResolution?.targets?.map((r,index)=>({r,index})).filter(({r})=>r.targetUuid===actor.uuid&&r.stage==="applying"&&r.writerId===game.user.id)??[];
  if(f.attackResolution?.version!==1||rows.length!==1)return null;
  const {r,index}=rows[0],damage=f.damageByTarget?.[index];
  if(damage?.hit!==true||damage.withdrawn||!Number.isFinite(damage.damage)||damage.damage<0)return null;
  return {index,row:structuredClone(r),damage:structuredClone(damage),target:structuredClone(f.targets?.[index])};
}
export async function harmBeltAnswerHandler({actorUuid,messageUuid,index}={}, {user}={}){
  if(!user?.isGM||user.id!==game.users?.activeGM?.id||!user.active||game.users.get(user.id)!==user)return {accepted:false};
  const actor=await fromUuid(actorUuid),message=await fromUuid(messageUuid),belt=actor&&beltOf(actor);
  if(!actor?.isOwner||answererOf(actor)?.id!==game.user.id||!belt
    ||message?.flags?.[NS]?.attackResolution?.targets?.[index]?.targetUuid!==actor.uuid)return {accepted:false};
  return {accepted:await confirmHere(actor,{title:belt.name,text:words("Ask")})};
}
/** False leaves Apply visibly unresolved; it never delivers damage past an uncertain payment. */
export async function offerHarmPrevention(actor,messageId){
  if(!writer())return true;
  const message=game.messages.get(messageId),belt=beltOf(actor),hit=message&&hitOf(actor,message);
  if(!belt||!hit)return true;
  const key=String(hit.index),old=message.getFlag(NS,FLAG)?.[key];
  if(old)return ['complete','declined','reviewed'].includes(old.stage);
  const prior=actor.getFlag(NS,RECEIPT);
  if(busy.has(actor.uuid)||prior&&!['complete','declined','reviewed'].includes(prior.stage))return false;
  const uses=belt.system?.uses?.value,tier=actor.system?.tier;
  let receipt=null;
  const eligible=(remaining=uses,budget=true)=>writer()&&fromUuidSync(actor.uuid)===actor&&fromUuidSync(message.uuid)===message
    &&same(hitOf(actor,message),hit)&&actor.items.get(belt.id)===belt&&belt.parent===actor
    &&beltOf(actor)===belt&&guardPendingCustodyItem(belt).ok&&belt.system.uses.value===remaining
    &&actor.system.tier===tier&&Number.isInteger(tier)&&tier>=1&&tier<=4&&actor.system.health.value>0
    &&!["unconscious","dying","stunned"].some(s=>actor.statuses?.has(s))
    &&!realmRefusalFor(actor,"feature")&&!dispersionRefusal(actor,"gear")&&!refuseAncientDespair(actor,"feature")
    &&!actor.refuseForcedShape?.("feature")&&(!receipt||same(actor.getFlag(NS,RECEIPT),receipt))
    &&(!budget||game.system.azeroth.workflows.turnBudgetRefusal(actor,"reaction")===null);
  if(!(uses>0)||!eligible())return true;
  const saveMessage=async next=>{
    await saveBeltMark(message,key,next,()=>writer()&&same(hitOf(actor,message),hit));
  };
  busy.add(actor.uuid);
  try{
    const who=answererOf(actor);if(!who)return true;
    const payload={actorUuid:actor.uuid,messageUuid:message.uuid,index:hit.index};
    let answer;
    try{answer=who.id===game.user.id?await harmBeltAnswerHandler(payload,{user:game.user})
      :await who.query(HARM_BELT_QUERY,payload,{timeout:ASK_MS});}
    catch{answer={accepted:false};}
    if(!writer()||fromUuidSync(actor.uuid)!==actor||fromUuidSync(message.uuid)!==message
      ||!same(hitOf(actor,message),hit))return false;
    if(!eligible())return true;
    if(answer?.accepted!==true){await saveMessage({stage:"declined",actorUuid:actor.uuid});return true;}
    receipt={version:1,messageUuid:message.uuid,index:hit.index,itemUuid:belt.uuid,uses,stage:"reserved"};
    await actor.setFlag(NS,RECEIPT,receipt);if(!eligible())throw Error("Belt reservation changed");
    await saveMessage(receipt);
    const paid=await game.system.azeroth.workflows.spendTurnBudget(actor,"reaction");
    // The Reaction is now spent, so subsequent checks must not require it still free.
    if(!eligible(uses,false))throw Error("Belt payment uncertain");
    if(!paid){receipt={...receipt,stage:"declined"};await actor.setFlag(NS,RECEIPT,receipt);
      if(!writer()||!same(actor.getFlag(NS,RECEIPT),receipt))throw Error("Belt refusal unconfirmed");await saveMessage(receipt);return true;}
    if(actor.items.get(belt.id)!==belt||belt.system.uses.value!==uses||!guardPendingCustodyItem(belt).ok)throw Error("Belt source changed");
    await belt.update({"system.uses.value":uses-1});
    if(!eligible(uses-1,false))throw Error("Belt counter unconfirmed");
    receipt={...receipt,stage:"paid"};await actor.setFlag(NS,RECEIPT,receipt);
    if(!eligible(uses-1,false))throw Error("Belt paid receipt unconfirmed");
    const held=actor.system.health.temp??0,amount=2*tier;
    await actor.grantTemporaryHealth(amount,{source:belt.name,span:"encounter"});
    if(!eligible(uses-1,false)||actor.system.health.temp!==Math.max(held,amount))throw Error("Belt temporary Health unconfirmed");
    if(belt.getFlag(NS,OVERCLOCK_FLAG)){
      const {consumeOverclock}=await import("./overclock-mark.mjs");await consumeOverclock(belt);
      if(!writer())throw Error("Belt writer changed");
    }
    receipt={...receipt,stage:"complete"};await actor.setFlag(NS,RECEIPT,receipt);
    if(!writer()||!same(actor.getFlag(NS,RECEIPT),receipt))throw Error("Belt completion unconfirmed");
    await saveMessage(receipt);return true;
  }catch(error){console.warn("azeroth-rpg | Harm Prevention Belt requires GM review",error);ui.notifications?.warn(words("Pending"));return false;}
  finally{busy.delete(actor.uuid);}
}
export async function reviewHarmBelt(actor){
  if(!writer())return false;const held=actor.getFlag(NS,RECEIPT);if(!held)return false;
  const snapshot=JSON.stringify(held),yes=await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},
    content:`<p>${words("ReviewHelp")}</p><pre>${foundry.utils.escapeHTML(snapshot)}</pre>`});
  if(!yes||!writer()||JSON.stringify(actor.getFlag(NS,RECEIPT))!==snapshot)return false;
  const next={...held,stage:"reviewed"};await actor.setFlag(NS,RECEIPT,next);
  if(!writer()||!same(actor.getFlag(NS,RECEIPT),next))return false;
  const message=await fromUuid(held.messageUuid);if(!writer()||!message)return false;
  await saveBeltMark(message,String(held.index),next);return true;
}
export function registerHarmBelt(){
  CONFIG.queries[HARM_BELT_QUERY]=harmBeltAnswerHandler;
  Hooks.on("getHeaderControlsActorSheetV2",(app,controls)=>{if(writer()&&app.actor?.getFlag(NS,RECEIPT))controls.push({
    icon:"fa-solid fa-shield",label:"AZEROTH.HarmBelt.Review",onClick:()=>reviewHarmBelt(app.actor)});});
}
