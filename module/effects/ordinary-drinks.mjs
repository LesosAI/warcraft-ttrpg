/** Paid outside-rest ordinary drinking. Next-Test benefit and daily lock share the rest grant ledger. */
import {drinkBenefitOf,grantPaidDrinkBenefit} from "./provision-benefits.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {dispersionFor} from "../rules/dispersion.mjs";
import {forcedShapeRefusal} from "../rules/shapes.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
import {endEquipmentInvisibility} from "./equipment-travel.mjs";
const NS="azeroth-rpg",FLAG="ordinaryDrinkReceipt",QUERY="azeroth-rpg.ordinaryDrink",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function ordinaryDrinkOf(item){return item?.system?.source?.document==="08-EQUIPMENT"&&item.system.source.section==="12 · Consumables · Food and drink"?drinkBenefitOf(item):null;}
export async function useOrdinaryDrink({actor,item}={}){
  if(!actor?.isOwner||!ordinaryDrinkOf(item))return null;
  const data={actorUuid:actor.uuid,itemId:item.id,requestId:foundry.utils.randomID(32)};
  const result=writer()?await ordinaryDrinkQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(QUERY,data,{timeout:180000});
  if(!result?.ok)ui.notifications?.warn(game.i18n.localize("AZEROTH.ProvisionBenefit.DrinkPending"));return result;
}
export async function ordinaryDrinkQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??""))return {ok:false};
  const actor=fromUuidSync(data.actorUuid),old=actor?.getFlag(NS,FLAG);
  if(!actor?.testUserPermission(user,"OWNER")||busy.has(actor.uuid))return {ok:false};
  if(old?.id===data.requestId)return old.userId===user.id&&old.stage==="complete"?{ok:true,already:true}:{ok:false};
  const item=actor.items.get(data.itemId),entry=ordinaryDrinkOf(item),identity=JSON.stringify({entry,source:item?.system.source,identifier:item?.system.identifier});
  if(!entry||old&&!['complete','reviewed'].includes(old.stage))return {ok:false};
  busy.add(actor.uuid);let receipt=null;
  const valid=()=>writer()&&user.active&&game.users.get(user.id)===user&&fromUuidSync(actor.uuid)===actor&&actor.testUserPermission(user,"OWNER");
  const eligible=()=>valid()&&actor.system.health.value>0&&!dispersionFor(actor)&&!forcedShapeRefusal(actor.shape,"gear")&&!realmRefusalFor(actor,"gear")&&!refuseAncientDespair(actor,"gear");
  const source=()=>eligible()&&actor.items.get(item.id)===item&&item.parent===actor&&guardPendingCustodyItem(item).ok&&!item.isSuppressed&&!item.system.suppressed
    &&JSON.stringify({entry:ordinaryDrinkOf(item),source:item.system.source,identifier:item.system.identifier})===identity;
  const save=async next=>{if(!valid()||receipt&&!same(actor.getFlag(NS,FLAG),receipt))throw Error("Drink receipt changed");await actor.setFlag(NS,FLAG,next);
    if(!valid()||!same(actor.getFlag(NS,FLAG),next))throw Error("Drink receipt write unconfirmed");receipt=next;};
  try{
    const quantity=item.system.quantity;if(!source()||!Number.isInteger(quantity)||quantity<1)return {ok:false};
    const {turnBudgetRefusal,spendTurnBudget}=await import("../dice/workflows.mjs");
    if(turnBudgetRefusal(actor,"half"))return {ok:false};
    await save({id:data.requestId,userId:user.id,stage:"claimed",itemId:item.id,itemUuid:item.uuid,key:entry.key,quantity});
    if(!source()||item.system.quantity!==quantity)throw Error("Drink source changed before payment");
    if(!await spendTurnBudget(actor,"half"))throw Error("Drink action payment failed");
    if(!source()||item.system.quantity!==quantity)throw Error("Drink source changed during payment");
    await save({...receipt,stage:"actionPaid"});
    if(quantity===1)await item.delete();else await item.update({"system.quantity":quantity-1});
    const remaining=actor.items.get(item.id);if(!valid()||(quantity===1?Boolean(remaining):remaining!==item||remaining.system.quantity!==quantity-1))throw Error("Drink portion payment unconfirmed");
    await save({...receipt,stage:"paid"});await endEquipmentInvisibility(actor,{event:"consumable"});
    if(!eligible())throw Error("Drink recipient changed after portion payment");
    await grantPaidDrinkBenefit(actor,entry,data.requestId);await save({...receipt,stage:"complete"});return {ok:true};
  }catch(error){console.warn("azeroth-rpg | Ordinary drink requires GM review",error);return {ok:false,pending:Boolean(receipt)};}
  finally{busy.delete(actor.uuid);}
}
export function registerOrdinaryDrinks(){
  CONFIG.queries[QUERY]=ordinaryDrinkQueryHandler;
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.ProvisionBenefit.DrinkReview",icon:"fa-solid fa-mug-hot",
    visible:li=>{const r=game.actors.get(li.dataset.entryId)?.getFlag(NS,FLAG);return writer()&&r&&!['complete','reviewed'].includes(r.stage);},
    onClick:async(_e,li)=>{const actor=game.actors.get(li.dataset.entryId),r=actor?.getFlag(NS,FLAG);if(!writer()||!actor?.isOwner||!r||busy.has(actor.uuid))return;
      if(!await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("AZEROTH.ProvisionBenefit.DrinkReview")},content:`<p>${game.i18n.localize("AZEROTH.ProvisionBenefit.DrinkReviewInstruction")}</p>`}))return;
      if(writer()&&same(actor.getFlag(NS,FLAG),r)&&!busy.has(actor.uuid))await actor.setFlag(NS,FLAG,{...r,stage:"reviewed"});}}));
}
