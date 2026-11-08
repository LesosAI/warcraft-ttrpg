import {UNRELIABLE_DAMAGE,unreliableDamage,unreliableWeapon,repairKit,unresolvedUnreliable} from "../rules/equipment-repair.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {refuseDispersion} from "./dispersion-protection.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
export const EQUIPMENT_REPAIR_QUERY="azeroth-rpg.equipmentRepair";
const NS="azeroth-rpg",RECEIPT="equipmentRepairReceipt",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const requireWriter=()=>{if(!writer())throw Error("Equipment repair writer changed");};
const messages=()=>game.messages?.contents??[];
const words=key=>game.i18n.localize(`AZEROTH.EquipmentRepair.${key}`);
const warn=()=>ui.notifications?.warn(words("Broken"));
export function refuseUnreliableWeapon(actor,weaponId) {
  const item=actor?.items?.get?.(weaponId);
  if(item&&(unreliableDamage(item)||unresolvedUnreliable(item,messages()))){warn();return true;}
  return false;
}
/** The actual evaluated die marks its owned physical weapon before any chat
 * publication. A GM later acknowledges the card; publication failure leaves
 * this durable unavailable marker intact rather than permitting another shot. */
export async function prepareUnreliableDamage({actor,weaponId,roll}={}) {
  const weapon=actor?.items?.get?.(weaponId);
  if(Number(roll?.natural)!==1||!unreliableWeapon(weapon))return null;
  const event=`unpublished:${foundry.utils.randomID(32)}`;
  await weapon.setFlag(NS,UNRELIABLE_DAMAGE,{version:1,event,pending:true,natural:1});
  if(unreliableDamage(weapon)?.event!==event)throw Error("Unreliable damage could not be persisted; GM review required");
  return {weaponUuid:weapon.uuid,natural:1,event};
}
async function request(data){
  try{return writer()?await equipmentRepairQueryHandler(data,{user:game.user})
    :await game.users?.activeGM?.query(EQUIPMENT_REPAIR_QUERY,data,{timeout:15000})??{ok:false};}
  catch{return {ok:false,pending:true};}
}
export async function recordUnreliableDamage(message) {
  if(!message?.flags?.[NS]?.unreliableWeapon)return {ok:true};
  const result=await request({operation:"break",messageUuid:message.uuid});
  if(!result.ok)ui.notifications?.warn(words("PendingBreak"));
  return result;
}
export async function useMechanicalRepairKit({actor,item}={}) {
  if(!actor||!repairKit(item))return null;
  const candidates=[...actor.items].filter(i=>unreliableDamage(i)&&unreliableWeapon(i));
  if(!candidates.length){ui.notifications?.warn(words("NoTarget"));return null;}
  const {chooseOption}=await import("../dice/workflows.mjs");
  const choice=await chooseOption(item,candidates.map(i=>({key:i.id,name:i.name,description:words("Damaged")})),null,{prompt:words("ChooseTarget")});
  if(!choice)return null;
  const target=actor.items.get(choice.key);
  if(!target||!unreliableDamage(target))return null;
  const result=await request({operation:"repair",actorUuid:actor.uuid,kitId:item.id,weaponId:target.id,
    event:unreliableDamage(target).event,quantity:item.system.quantity,requestId:foundry.utils.randomID(32)});
  if(!result.ok)ui.notifications?.warn(words(result.pending?"PendingRepair":"Refused"));
  return result;
}
export async function equipmentRepairQueryHandler(data={}, {user}={}) {
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  let actor=null,locked=false;
  try{
    if(data.operation==="break"){
      const message=await fromUuid(data.messageUuid),marker=message?.flags?.[NS]?.unreliableWeapon;
      if(!marker||message.flags[NS].kind!=="attack"||Number(message.rolls?.[0]?.natural)!==1)return {ok:false};
      const weapon=await fromUuid(marker.weaponUuid);actor=weapon?.parent;
      const validSource=()=>writer()&&user.active&&game.users.get(user.id)===user
        &&actor?.testUserPermission(user,"OWNER")&&unreliableWeapon(weapon)&&actor.items.get(weapon.id)===weapon
        &&ChatMessage.getSpeakerActor(message.speaker)?.uuid===actor.uuid
        &&message.flags?.[NS]?.kind==="attack"&&message.flags[NS].unreliableWeapon===marker&&Number(message.rolls?.[0]?.natural)===1;
      if(!validSource())return {ok:false};
      if(busy.has(actor.uuid))return {ok:false,pending:true};busy.add(actor.uuid);locked=true;requireWriter();
      if(message.getFlag(NS,"unreliableDamageApplied"))return {ok:true,already:true};
      const pending=unreliableDamage(weapon);
      if(!pending||![marker.event,message.uuid].includes(pending.event))return {ok:false,pending:true};
      if(pending.event!==message.uuid){
        if(!validSource())return {ok:false};
        await weapon.setFlag(NS,UNRELIABLE_DAMAGE,{version:1,event:message.uuid});requireWriter();
      }
      if(unreliableDamage(weapon)?.event!==message.uuid)throw Error("Unreliable damage unconfirmed");
      if(!validSource())throw Error("Unreliable source changed before acknowledgment");
      await message.setFlag(NS,"unreliableDamageApplied",true);requireWriter();
      return {ok:true};
    }
    actor=await fromUuid(data.actorUuid);
    if(!actor?.testUserPermission(user,"OWNER")||busy.has(actor.uuid))return {ok:false};
    busy.add(actor.uuid);locked=true;requireWriter();
    const previous=actor.getFlag(NS,RECEIPT);
    if(previous?.requestId===data.requestId&&previous.stage==="complete")return {ok:true,already:true};
    if(previous&&!['complete','reviewed'].includes(previous.stage))return {ok:false,pending:true};
    const kit=actor.items.get(data.kitId),weapon=actor.items.get(data.weaponId);
    const valid=(quantity=data.quantity)=>!!kit&&!!weapon&&writer()&&user.active&&game.users.get(user.id)===user&&actor.testUserPermission(user,"OWNER")
      &&actor.items.get(data.kitId)===kit&&kit.parent===actor&&actor.items.get(data.weaponId)===weapon&&weapon.parent===actor
      &&repairKit(kit)&&unreliableWeapon(weapon)&&unreliableDamage(weapon)?.event===data.event
      &&guardPendingCustodyItem(kit).ok&&guardPendingCustodyItem(weapon).ok
      &&kit.system.quantity===quantity&&Number.isInteger(data.quantity)&&data.quantity>0
      &&!unresolvedUnreliable(weapon,messages())&&!realmRefusalFor(actor,"gear")
      &&!refuseDispersion(actor,"gear")&&!refuseAncientDespair(actor,"gear")&&!actor.refuseForcedShape?.("gear");
    if(data.operation!=="repair"||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??"")||!valid())return {ok:false};
    await actor.setFlag(NS,RECEIPT,{version:1,requestId:data.requestId,kitUuid:kit.uuid,weaponUuid:weapon.uuid,event:data.event,stage:"reserved"});
    requireWriter();if(await fromUuid(data.actorUuid)!==actor||!valid())throw Error("Repair source changed after reservation");
    await kit.update({"system.quantity":data.quantity-1});requireWriter();
    if(await fromUuid(data.actorUuid)!==actor||!valid(data.quantity-1))throw Error("Repair kit payment or custody unconfirmed");
    await actor.setFlag(NS,RECEIPT,{...actor.getFlag(NS,RECEIPT),stage:"paid"});requireWriter();
    if(await fromUuid(data.actorUuid)!==actor||!valid(data.quantity-1))throw Error("Repair recipient changed after payment");
    await weapon.setFlag(NS,UNRELIABLE_DAMAGE,null);requireWriter();
    if(unreliableDamage(weapon))throw Error("Repair unconfirmed");
    const card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p>${game.i18n.format("AZEROTH.EquipmentRepair.Repaired",{name:foundry.utils.escapeHTML(weapon.name)})}</p>`});
    requireWriter();await actor.setFlag(NS,RECEIPT,{...actor.getFlag(NS,RECEIPT),stage:"complete",messageUuid:card.uuid});
    return {ok:true,messageUuid:card.uuid};
  }catch(error){console.warn("azeroth-rpg | equipment repair requires GM review",error);return {ok:false,pending:true};}
  finally{if(locked)busy.delete(actor.uuid);}
}
/** Explicit active-GM acknowledgment: never retries payment or grants a repair.
 * Manual repair is a separate confirmation that another adjudicated means has
 * already repaired this exact physical weapon. */
export async function reviewEquipmentRepair(actor,{weaponId=null}={}){
  if(!writer()||!actor||busy.has(actor.uuid))return {ok:false};
  const receipt=actor.getFlag(NS,RECEIPT),weapon=weaponId?actor.items.get(weaponId):null;
  const state=unreliableDamage(weapon);
  if(weaponId?(!state||!guardPendingCustodyItem(weapon).ok):(!receipt||["complete","reviewed"].includes(receipt.stage)))return {ok:false};
  busy.add(actor.uuid);
  try{
    const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},
      content:`<p>${words(weaponId?"ManualPrompt":"ReviewPrompt")}</p><pre>${foundry.utils.escapeHTML(JSON.stringify(weaponId?{weapon:weapon.name,damage:state}:receipt,null,2))}</pre>`});
    requireWriter();if(!accepted)return {ok:false};
    if(weaponId){
      if(actor.items.get(weaponId)!==weapon||unreliableDamage(weapon)?.event!==state.event||!guardPendingCustodyItem(weapon).ok)return {ok:false};
      // Acknowledge old cards first, so replay can never re-break a repaired gun.
      for(const message of messages().filter(m=>m.flags?.[NS]?.unreliableWeapon?.weaponUuid===weapon.uuid)){
        const marker=message.flags[NS].unreliableWeapon;
        if(marker.event!==state.event&&message.uuid!==state.event)continue;
        await message.setFlag(NS,"unreliableDamageApplied",true);requireWriter();
      }
      if(actor.items.get(weaponId)!==weapon||unreliableDamage(weapon)?.event!==state.event||!guardPendingCustodyItem(weapon).ok)return {ok:false};
      await weapon.setFlag(NS,UNRELIABLE_DAMAGE,null);requireWriter();
      return {ok:!unreliableDamage(weapon)};
    }
    if(actor.getFlag(NS,RECEIPT)?.requestId!==receipt.requestId||actor.getFlag(NS,RECEIPT)?.stage!==receipt.stage)return {ok:false};
    await actor.setFlag(NS,RECEIPT,{...receipt,stage:"reviewed",reviewedBy:game.user.id});requireWriter();
    return {ok:true};
  }catch(error){console.warn("azeroth-rpg | equipment repair review incomplete",error);return {ok:false,pending:true};}
  finally{busy.delete(actor.uuid);}
}
async function chooseRepairReview(actor){
  const receipt=actor.getFlag(NS,RECEIPT),options=[];
  if(receipt&&!["complete","reviewed"].includes(receipt.stage))options.push({key:"receipt",name:words("ReviewPayment"),description:words("ReviewPrompt")});
  for(const item of actor.items)if(unreliableDamage(item))options.push({key:item.id,name:item.name,description:words("ManualPrompt")});
  const {chooseOption}=await import("../dice/workflows.mjs");
  const choice=await chooseOption({name:words("Review")},options,null,{prompt:words("Review")});
  if(choice)return reviewEquipmentRepair(actor,{weaponId:choice.key==="receipt"?null:choice.key});
}
export function registerEquipmentRepair(){
  CONFIG.queries[EQUIPMENT_REPAIR_QUERY]=equipmentRepairQueryHandler;
  const reconcile=async message=>{if(writer()&&message.flags?.[NS]?.unreliableWeapon&&!message.flags[NS].unreliableDamageApplied)await recordUnreliableDamage(message);};
  Hooks.on("createChatMessage",reconcile);
  Hooks.once("ready",async()=>{if(writer())for(const message of messages())await reconcile(message);});
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({
    label:"AZEROTH.EquipmentRepair.Review",icon:"fa-solid fa-screwdriver-wrench",
    visible:li=>{const actor=game.actors.get(li.dataset.entryId),receipt=actor?.getFlag(NS,RECEIPT);
      return writer()&&!!actor&&((receipt&&!["complete","reviewed"].includes(receipt.stage))||[...actor.items].some(i=>unreliableDamage(i)));},
    onClick:(_event,li)=>chooseRepairReview(game.actors.get(li.dataset.entryId))
  }));
}
