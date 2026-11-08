/** One adjacent kit-assisted Stabilize, paid and written by the active GM. */
import {healerKit,healerKitCharges,canStabilize} from "../rules/healer-kit.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {feetBetweenTokens} from "../canvas/engaged.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {dispersionRefusal} from "../rules/dispersion.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
import {ETHEREAL_FLAG,SPIRIT_FLAG} from "../rules/spirit-realm.mjs";
export const HEALER_KIT_QUERY="azeroth-rpg.healerKit";
const NS="azeroth-rpg",RECEIPT="healerKitReceipt",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const words=key=>game.i18n.localize(`AZEROTH.HealerKit.${key}`);
function reach(actor,target){
  if(actor===target)return true;
  const aa=actor.getActiveTokens?.()??[],bb=target.getActiveTokens?.()??[];
  if(aa.length!==1||bb.length!==1)return null;
  const a=aa[0],b=bb[0];
  if(a.document.parent!==b.document.parent||a.document._source?.level!==b.document._source?.level)return false;
  const feet=feetBetweenTokens(a,b);return feet===null?null:Number.isFinite(feet)&&feet<=5;
}
const targetState=target=>JSON.stringify({health:target.system.health.value,steps:target.system.deathSteps,
  max:target.system.deathStepLimit,stabilized:target.getFlag(NS,"stabilized")??false});
const physical=target=>![...(target.effects??[])].some(e=>e.active!==false&&!e.disabled&&!e.isSuppressed
  &&e.duration?.expired!==true&&(e.flags?.[NS]?.[ETHEREAL_FLAG]||e.flags?.[NS]?.[SPIRIT_FLAG]));
export async function useHealerKit({actor,item,targets=null}={}){
  if(!actor||!item)return null;
  const chosen=targets??[...(game.user.targets??[])].map(t=>({actorUuid:t.actor?.uuid}));
  if(chosen.length!==1){ui.notifications?.warn(words("ChooseTarget"));return null;}
  const row=chosen[0],target=row.actorUuid?await fromUuid(row.actorUuid)
    :row.sceneId&&row.tokenId?game.scenes.get(row.sceneId)?.tokens.get(row.tokenId)?.actor:game.actors.get(row.actorId);
  if(!target){ui.notifications?.warn(words("ChooseTarget"));return null;}
  const data={actorUuid:actor.uuid,itemId:item.id,targetUuid:target.uuid,requestId:foundry.utils.randomID(24)};
  try{
    const result=writer()?await healerKitQueryHandler(data,{user:game.user})
      :await game.users?.activeGM?.query(HEALER_KIT_QUERY,data,{timeout:180000});
    if(!result?.ok){ui.notifications?.warn(words(result?.pending?"Pending":"Refused"));return null;}
    return result.messageUuid?await fromUuid(result.messageUuid):null;
  }catch(error){console.warn("azeroth-rpg | healer kit",error);ui.notifications?.warn(words("Pending"));return null;}
}
export async function healerKitQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  const actor=await fromUuid(data.actorUuid),target=await fromUuid(data.targetUuid);
  if(!writer()||!actor||!target||busy.has(actor.uuid)||busy.has(target.uuid))return {ok:false};
  const item=actor.items.get(data.itemId),charges=healerKitCharges(item?.system),quantity=item?.system.quantity;
  const prior=actor.getFlag(NS,RECEIPT);
  if(!actor.testUserPermission(user,"OWNER"))return {ok:false};
  if(prior?.requestId===data.requestId&&prior.stage==="complete")return {ok:true,messageUuid:prior.messageUuid};
  if(prior&&!['complete','reviewed','cancelled'].includes(prior.stage))return {ok:false,pending:true};
  if(!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??"")||!canStabilize(target))return {ok:false};
  const initial=targetState(target),after=JSON.stringify({...JSON.parse(initial),stabilized:true});let unmeasured=false,receipt=null;
  const receiptMatches=()=>!receipt||JSON.stringify(actor.getFlag(NS,RECEIPT))===JSON.stringify(receipt);
  const valid=(remaining=charges?.value)=>writer()&&user.active&&game.users.get(user.id)===user
    &&fromUuidSync(actor.uuid)===actor&&fromUuidSync(target.uuid)===target&&actor.testUserPermission(user,"OWNER")
    &&actor.system?.health?.value>0&&!["stunned","dying","unconscious"].some(s=>actor.statuses?.has(s))
    &&actor.items.get(item?.id)===item&&item.parent===actor&&healerKit(item)&&quantity>0&&item.system.quantity===quantity
    &&guardPendingCustodyItem(item).ok&&healerKitCharges(item.system)?.value===remaining
    &&Number.isSafeInteger(remaining)&&remaining>=0&&canStabilize(target)&&targetState(target)===initial
    &&physical(target)&&receiptMatches()&&!realmRefusalFor(actor,"gear")&&!dispersionRefusal(actor,"gear")
    &&!refuseAncientDespair(actor,"gear")&&!actor.refuseForcedShape?.("gear")
    &&(reach(actor,target)===true||(reach(actor,target)===null&&unmeasured));
  const requireValid=remaining=>{if(!valid(remaining))throw Error("Healer kit state changed");};
  busy.add(actor.uuid);busy.add(target.uuid);
  try{
    if(!(charges?.value>0))return {ok:false};
    const r=reach(actor,target);if(r===false)return {ok:false};
    if(r===null){
      unmeasured=await foundry.applications.api.DialogV2.confirm({window:{title:words("Title")},content:`<p>${words("ConfirmReach")}</p>`});
      if(!unmeasured)return {ok:false};
    }
    requireValid(charges.value);
    const consent=await foundry.applications.api.DialogV2.confirm({window:{title:words("Title")},content:`<p>${words("ConfirmTarget")}</p><p>${foundry.utils.escapeHTML(target.name)}</p>`});
    if(!consent)return {ok:false};requireValid(charges.value);
    receipt={version:1,requestId:data.requestId,itemUuid:item.uuid,targetUuid:target.uuid,charges:charges.value,stage:"reserved"};
    await actor.setFlag(NS,RECEIPT,receipt);requireValid(charges.value);
    const paid=await game.system.azeroth.workflows.spendTurnBudget(actor,"half");requireValid(charges.value);
    if(!paid){receipt={...receipt,stage:"cancelled"};await actor.setFlag(NS,RECEIPT,receipt);
      if(!writer()||!receiptMatches())throw Error("Kit cancellation unconfirmed");return {ok:false};}
    await item.update({"system.charges":{value:charges.value-1,max:10,unit:"use"}});requireValid(charges.value-1);
    receipt={...receipt,stage:"paid"};await actor.setFlag(NS,RECEIPT,receipt);requireValid(charges.value-1);
    await target.setFlag(NS,"stabilized",true);
    if(!writer()||fromUuidSync(target.uuid)!==target||targetState(target)!==after||!physical(target)
      ||!receiptMatches())throw Error("Stabilization unconfirmed");
    const card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p>${words("Stabilized")}</p>`,
      flags:{[NS]:{kind:"healerKit",actorUuid:actor.uuid,targetUuid:target.uuid}}});
    if(!writer())throw Error("Kit writer changed");
    receipt={...receipt,stage:"complete",messageUuid:card.uuid};await actor.setFlag(NS,RECEIPT,receipt);
    if(!writer()||!receiptMatches())throw Error("Kit completion unconfirmed");
    return {ok:true,messageUuid:card.uuid};
  }catch(error){console.warn("azeroth-rpg | healer kit requires GM review",error);return {ok:false,pending:!!receipt};}
  finally{busy.delete(actor.uuid);busy.delete(target.uuid);}
}
export async function reviewHealerKit(actor){
  if(!writer())return false;const held=actor.getFlag(NS,RECEIPT);
  if(!held||['complete','reviewed','cancelled'].includes(held.stage))return false;
  const snapshot=JSON.stringify(held),yes=await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},
    content:`<p>${words("ReviewHelp")}</p><pre>${foundry.utils.escapeHTML(snapshot)}</pre>`});
  if(!yes||!writer()||JSON.stringify(actor.getFlag(NS,RECEIPT))!==snapshot)return false;
  await actor.setFlag(NS,RECEIPT,{...held,stage:"reviewed"});return actor.getFlag(NS,RECEIPT)?.stage==="reviewed";
}
export function registerHealerKit(){
  CONFIG.queries[HEALER_KIT_QUERY]=healerKitQueryHandler;
  Hooks.on("getHeaderControlsActorSheetV2",(app,controls)=>{if(writer()&&app.actor?.getFlag(NS,RECEIPT))controls.push({
    icon:"fa-solid fa-kit-medical",label:"AZEROTH.HealerKit.Review",onClick:()=>reviewHealerKit(app.actor)});});
}
