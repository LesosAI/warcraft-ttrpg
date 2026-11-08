/** Approved equipment writes. One GM authority, durable claims before payment, no socket writes. */
import {SPECIAL_EQUIPMENT_FLAG as FLAG,SPECIAL_LIMIT_FLAG as LIMIT,specialEquipmentOf,
  equipmentState,activeEquipmentEffects,equipmentLimitAvailable,rechargeEquipmentUses,
  runeExchange,noggenfoggerResult} from "../rules/special-equipment.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {untilEndOfNextTurn,spellTiming} from "./durations.mjs";
import {IMMUNE_FLAG} from "../rules/legacy-uses.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {registerEquipmentTestQuery} from "./equipment-test.mjs";
import {grantPaidDrinkBenefit,drinkBenefitOf,registerProvisionBenefits} from "./provision-benefits.mjs";
import {registerDeviceContext} from "./device-context.mjs";
import {registerProsthetics} from "./prosthetics.mjs";
import {registerRocketBoots} from "./rocket-boots.mjs";
import {registerOrdinaryDrinks} from "./ordinary-drinks.mjs";
import {registerSharedFeasts} from "./shared-feast.mjs";
import {registerPlacedDevices} from "./placed-devices.mjs";
import {registerEquipmentTravel,endEquipmentInvisibility} from "./equipment-travel.mjs";
import {registerChiliEquipment} from "./equipment-chili.mjs";
import {dispersionRefusal} from "../rules/dispersion.mjs";
import {forcedShapeRefusal} from "../rules/shapes.mjs";
import {feetBetweenTokens} from "../canvas/engaged.mjs";
import {registerOnyxiaEngulfment} from "./onyxia-engulfment.mjs";
import {registerEquipmentRepair} from "./equipment-repair.mjs";
import {registerEquipmentExplosives} from "./equipment-explosives.mjs";
import {registerParachute} from "./parachute.mjs";
import {registerAlarmBot} from "./alarm-bot.mjs";
import {registerHealerKit} from "./healer-kit.mjs";
import {registerHarmBelt} from "./harm-prevention.mjs";
import {registerUtilityVision} from "./utility-vision.mjs";

export const SPECIAL_EQUIPMENT_QUERY="azeroth-rpg.specialEquipment";
export const WOLFSHEAD_QUERY="azeroth-rpg.wolfsheadEntry";
export const SOUP_QUERY="azeroth-rpg.specialRest";
const NS="azeroth-rpg", RECEIPT="specialEquipmentReceipt", busy=new Set();
const restQueues=new Map();
export async function withSpecialEquipmentRest(actor,work){
  const key=ownerOf(actor).uuid,previous=restQueues.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(work);restQueues.set(key,next);
  try{return await next;}finally{if(restQueues.get(key)===next)restQueues.delete(key);}
}
const gm=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const requireWriter=()=>{if(!gm())throw new Error("Equipment writer changed; receipt requires review");};
const clock=()=>game.time?.worldTime??0;
// An unlinked token is a distinct creature; its persisted synthetic actor owns its limits.
const ownerOf=actor=>actor;
const usesOf=doc=>doc.getFlag(NS,LIMIT)??{};
const warn=()=>ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused"));
async function pendingReview(actor){
  if(!gm())return;
  const receipt=actor.getFlag(NS,RECEIPT);if(!receipt||receipt.stage==="complete")return;
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Pending")}</p><button type="button" data-equipment-review="${foundry.utils.escapeHTML(actor.uuid)}">${game.i18n.localize("AZEROTH.SpecialEquipment.Review")}</button>`});
}
const eligible=actor=>actor?.documentName==="Actor"&&actor.system?.health?.value>0
  &&!["stunned","dying","unconscious"].some(s=>actor.statuses?.has(s));
function sourceOf(item){return JSON.stringify([item.id,item.system?.identifier,item.system?.quantity,item.system?.charges,item.system?.equipped,item.flags?.[NS]?.[LIMIT]]);}
async function pick(item,rows,prompt){
  const {chooseOption}=await import("../dice/workflows.mjs");
  return chooseOption(item,rows,null,{prompt:game.i18n.localize(prompt)});
}
/** Local choices contain IDs only; the GM derives every amount and checks all documents again. */
export async function requestSpecialEquipment({actor,item,targets=[],reaction=false}={}) {
  if(!actor||!item)return null;
  const entry=specialEquipmentOf(item);
  if(!entry||entry.passive)return null;
  const source=sourceOf(item);
  let targetUuid=null,poolId=null,effectId=null;
  if(entry.touch){
    const rows=[actor,...targets.map(t=>t.actor??game.scenes?.get(t.sceneId)?.tokens?.get(t.tokenId)?.actor
      ??(t.uuid||t.actorUuid?fromUuidSync(t.uuid??t.actorUuid):null))].filter((a,i,a2)=>a&&a2.findIndex(b=>b?.uuid===a.uuid)===i);
    const choice=await pick(item,rows.map(a=>({key:a.uuid,name:a.name,description:""})),"AZEROTH.SpecialEquipment.Target");
    if(!choice)return null;targetUuid=choice.key;
  }
  if(entry.key==="demonic-rune"){
    const pools=(actor.poolSnapshot?.()??[]).filter(p=>p.kind==="power"&&p.name==="mana"&&p.value<p.max);
    if(!pools.length){warn();return null;}
    const choice=await pick(item,pools.map(p=>({key:p.itemId,name:p.className??p.name,description:`${p.value}/${p.max}`})),"AZEROTH.SpecialEquipment.Pool");
    if(!choice)return null;poolId=choice.key;
  }
  if(entry.key==="luffa"){
    const rows=[...actor.effects].filter(e=>e.active!==false&&e.statuses?.has("bleeding"));
    if(!rows.length){warn();return null;}
    const choice=await pick(item,rows.map(e=>({key:e.id,name:e.name,description:e.description??""})),"AZEROTH.SpecialEquipment.Bleed");
    if(!choice)return null;effectId=choice.key;
    const budget=await pick(item,[{key:"half",name:game.i18n.localize("AZEROTH.SpecialEquipment.Half"),description:""},{key:"reaction",name:game.i18n.localize("AZEROTH.SpecialEquipment.Reaction"),description:""}],"AZEROTH.SpecialEquipment.Budget");
    if(!budget)return null;reaction=budget.key==="reaction";
  }
  if(entry.preparation){
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Minute")}</p>`});
    if(!confirmed)return null;
  }
  if(sourceOf(item)!==source){warn();return null;}
  const data={actorUuid:actor.uuid,itemId:item.id,source,targetUuid,poolId,effectId,reaction,requestId:foundry.utils.randomID(32),issuedAt:Date.now()};
  try{
    const result=gm()?await specialEquipmentQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(SPECIAL_EQUIPMENT_QUERY,data,{timeout:180000});
    if(!result?.ok)warn();return result;
  }catch(error){console.warn("azeroth-rpg | special equipment pending review",error);warn();return null;}
}
function withinTouch(actor,target){
  if(actor===target)return true;
  const aa=actor.getActiveTokens?.()??[],bb=target.getActiveTokens?.()??[];
  // A synthetic actor identifies its token. Multiple world-actor copies need table judgement.
  const a=aa.length===1?aa[0]:null,b=bb.length===1?bb[0]:null;
  if(!a||!b)return null;
  if(a.document.parent!==b.document.parent||a.document._source?.level!==b.document._source?.level)return false;
  const distance=feetBetweenTokens(a,b);
  if(distance===null)return null;
  return Number.isFinite(distance)&&distance<=5;
}
async function claim(actor,item,entry,requestId){
  requireWriter();
  const owner=ownerOf(actor),prior=owner.getFlag(NS,RECEIPT);
  if(prior&&prior.stage!=="complete")throw new Error("Pending equipment receipt requires review");
  if(entry.per&&!equipmentLimitAvailable(entry.key,usesOf(owner),usesOf(item)))throw new Error("Equipment rest limit");
  await owner.setFlag(NS,RECEIPT,{version:1,id:requestId,itemUuid:item.uuid,key:entry.key,stage:"claimed"});
  requireWriter();
  if(owner.getFlag(NS,RECEIPT)?.id!==requestId)throw new Error("Equipment claim unconfirmed");
  const recent=owner.getFlag(NS,"specialEquipmentRequests")??[];
  await owner.setFlag(NS,"specialEquipmentRequests",[...recent.filter(r=>Date.now()-r.at<300000),{id:requestId,at:Date.now()}]);
  requireWriter();
  if(entry.per){
    const mark={spent:true,requestId,per:entry.per};
    await owner.setFlag(NS,LIMIT,{...usesOf(owner),[entry.key]:mark});
    requireWriter();
    await item.setFlag(NS,LIMIT,{...usesOf(item),[entry.key]:mark});
    requireWriter();
  }
  return owner;
}
async function timed(actor,item,entry,{result=null,seconds=entry.seconds,changes=[],extraFlags={}}={}){
  const old=[...actor.effects].filter(e=>{
    const s=equipmentState(e);
    return s?.key===entry.key||(entry.food&&s?.food)||(entry.appearance&&result!=="featherfall"&&s?.appearance);
  }).map(e=>e.id);
  if(old.length)await actor.deleteEmbeddedDocuments("ActiveEffect",old);
  requireWriter();
  const timing=entry.key==="spider-belt"?untilEndOfNextTurn(actor):null;
  const data={name:item.name,img:item.img,origin:item.uuid,disabled:false,transfer:false,
    description:item.system.description,system:{changes},
    ...(timing??spellTiming(actor,{value:seconds,units:"seconds"})),
    flags:{[NS]:{[FLAG]:{version:1,key:entry.key,result,expiresAt:timing?null:clock()+seconds,food:entry.food===true,appearance:entry.appearance===true&&result!=="featherfall"},...extraFlags}}};
  const made=(await actor.createEmbeddedDocuments("ActiveEffect",[data]))[0];
  if(!made||made.parent!==actor||equipmentState(made)?.key!==entry.key)throw new Error("Equipment effect unconfirmed");
  return made;
}
/** The handler owns costs, random outcomes and recipients; clients cannot inject changes or rolls. */
export async function specialEquipmentQueryHandler(data={}, {user}={}){
  if(!gm()||!user?.id||typeof data.requestId!=="string"||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId)
    ||!Number.isFinite(data.issuedAt)||Math.abs(Date.now()-data.issuedAt)>180000)return {ok:false};
  const actor=await fromUuid(data.actorUuid),owner=actor&&ownerOf(actor);
  if(!eligible(actor)||!actor.testUserPermission(user,"OWNER")||busy.has(owner.uuid))return {ok:false};
  busy.add(owner.uuid);
  try{
    if((owner.getFlag(NS,"specialEquipmentRequests")??[]).some(r=>r.id===data.requestId))return {ok:false,replay:true};
    if(realmRefusalFor(actor,"gear")||dispersionRefusal(actor,"gear"))return {ok:false};
    const item=actor.items.get(data.itemId),entry=specialEquipmentOf(item);
    const doorsOpen=()=>!realmRefusalFor(actor,"gear")&&!dispersionRefusal(actor,"gear")
      &&!forcedShapeRefusal(actor.shape,entry?.slot?"signature":data.reaction?"reaction":null,{gm:user.isGM===true});
    const current=()=>gm()&&eligible(actor)&&doorsOpen()&&actor.testUserPermission(user,"OWNER")&&actor.items.get(data.itemId)===item&&sourceOf(item)===data.source&&guardPendingCustodyItem(item).ok;
    if(!entry||entry.passive||!current()||(entry.slot&&!item.system.equipped)||(!entry.slot&&item.system.quantity!==null&&item.system.quantity<=0))return {ok:false};
    if(entry.preparation){
      const completed=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Minute")}</p>`});
      if(!completed||!current())return {ok:false};
    }
    if(entry.per&&!equipmentLimitAvailable(entry.key,usesOf(owner),usesOf(item)))return {ok:false};
    let target=actor,exchange=null,bleed=null,unmeasuredTouchApproved=false;
    const touchAllowed=async()=>{
      const measured=withinTouch(actor,target);
      if(measured!==null)return measured;
      if(unmeasuredTouchApproved)return true;
      unmeasuredTouchApproved=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("AZEROTH.SpecialEquipment.Target")},content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Touch")}</p>`});
      // Geometry can become available while the GM is deciding. Its answer wins.
      const refreshed=withinTouch(actor,target);
      return refreshed===null?unmeasuredTouchApproved:refreshed;
    };
    if(entry.touch){
      target=await fromUuid(data.targetUuid);
      if(!target||!await touchAllowed())return {ok:false};
      if(!target.testUserPermission(user,"OWNER")){
        const yes=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>${foundry.utils.escapeHTML(game.i18n.format("AZEROTH.SpecialEquipment.Consent",{name:target.name}))}</p>`});
        if(!yes||!current()||!await touchAllowed())return {ok:false};
      }
    }
    if(entry.key==="demonic-rune"){
      exchange=runeExchange({health:actor.system.health.value,pools:actor.poolSnapshot?.()??[],poolId:data.poolId});
      if(!exchange)return {ok:false};
    }
    if(entry.key==="luffa"){
      bleed=actor.effects.get(data.effectId);
      if(!bleed||bleed.active===false||!bleed.statuses.has("bleeding"))return {ok:false};
    }
    const {spendTurnBudget}=await import("../dice/workflows.mjs");
    if(!current())return {ok:false};
    if(entry.touch&&(!await touchAllowed()||!eligible(actor)))return {ok:false};
    if(!current())return {ok:false};
    const priorOwnerUses=usesOf(owner),priorItemUses=usesOf(item),expectedQuantity=item.system.quantity;
    await claim(actor,item,entry,data.requestId);
    if(!await spendTurnBudget(actor,data.reaction&&entry.reaction?"reaction":entry.action??null)){
      requireWriter();
      await owner.setFlag(NS,LIMIT,priorOwnerUses);requireWriter();
      await item.setFlag(NS,LIMIT,priorItemUses);requireWriter();
      await owner.setFlag(NS,RECEIPT,{...owner.getFlag(NS,RECEIPT),stage:"complete",refused:true});return {ok:false};
    }
    requireWriter();
    if(actor.items.get(item.id)!==item||item.parent!==actor||!eligible(actor)||!doorsOpen()
      ||!guardPendingCustodyItem(item).ok||(entry.slot&&!item.system.equipped)
      ||(!entry.slot&&(item.system.quantity!==expectedQuantity||item.system.quantity!==null&&item.system.quantity<=0))
      ||(bleed&&(actor.effects.get(bleed.id)!==bleed||!bleed.statuses.has("bleeding"))))throw new Error("Equipment changed after claim");
    if(entry.touch&&!await touchAllowed())throw Error("Touch recipient moved after claim");
    requireWriter();
    if(!entry.slot){
      if(item.system.quantity!==null)await item.update({"system.quantity":Math.max(0,item.system.quantity-1)});
      requireWriter();
      if(actor.items.get(item.id)!==item)throw new Error("Equipment item disappeared during payment");
      await endEquipmentInvisibility(actor,{event:"consumable"});
      requireWriter();
    }
    await owner.setFlag(NS,RECEIPT,{...owner.getFlag(NS,RECEIPT),stage:"paid"});
    requireWriter();
    let result=null;
    if(entry.random){
      const roll=await new Roll(`1d${entry.random}`).evaluate();
      result=roll.total;await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:item.name});
      requireWriter();
    }
    if(exchange){
      const reread=runeExchange({health:actor.system.health.value,pools:actor.poolSnapshot?.()??[],poolId:data.poolId});
      if(JSON.stringify(reread)!==JSON.stringify(exchange))throw new Error("Rune resources changed after payment");
      await actor.updatePool(exchange.pool,{"system.health.value":exchange.health});
    }
    else if(entry.heal)await target.applyHealing(entry.heal,{from:actor});
    else if(bleed){
      // Preserve every other status, stat change, injury and flag on a mixed carrier.
      const statuses=[...bleed.statuses].filter(s=>s!=="bleeding");
      await bleed.update({statuses});
      if(bleed.statuses.has("bleeding"))throw new Error("Bleeding source cleanup unconfirmed");
    }else if(entry.key==="spider-belt"){
      for(const e of [...actor.effects].filter(e=>e.statuses.has("entangled"))){
        requireWriter();
        const statuses=[...e.statuses].filter(s=>s!=="entangled");
        // Only a dedicated condition carrier owns its speed override. Mixed carriers
        // may also contain another immobilization; preserve their stat changes.
        const dedicated=e.statuses.size===1;
        const changes=(e.system?.changes??[]).filter(c=>!(dedicated&&c.key==="system.speed"&&c.type==="override"&&Number(c.value)===0));
        await e.update({statuses,"system.changes":changes});
      }
      await timed(actor,item,entry,{extraFlags:{[IMMUNE_FLAG]:{conditions:["entangled"],source:item.name}}});
    }else{
      let seconds=entry.seconds,changes=[];
      if(entry.key==="noggenfogger-elixir"){
        const outcome=noggenfoggerResult(result);result=outcome.result;seconds=outcome.seconds;
        if(outcome.str)changes=[{key:"system.abilities.str.value",type:"add",value:String(outcome.str),phase:"initial"},{key:"system.abilities.dex.value",type:"add",value:String(outcome.dex),phase:"initial"}];
      }else if(entry.key==="savory-deviate-delight")result=result===1?"pirate":"ninja";
      await timed(actor,item,entry,{result,seconds,changes});
    }
    requireWriter();
    const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<h3>${foundry.utils.escapeHTML(item.name)}</h3>${item.system.description}`,
      flags:{[NS]:{kind:"specialEquipment",key:entry.key,result,requestId:data.requestId}}});
    requireWriter();await owner.setFlag(NS,RECEIPT,{...owner.getFlag(NS,RECEIPT),stage:"complete",messageUuid:message.uuid});
    return {ok:true,messageUuid:message.uuid};
  }catch(error){
    console.warn("azeroth-rpg | special equipment requires review",error);
    const pending=owner.getFlag(NS,RECEIPT)??null;
    if(gm()&&pending&&pending.stage!=="complete")await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
      content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Pending")}</p><button type="button" data-equipment-review="${foundry.utils.escapeHTML(owner.uuid)}">${game.i18n.localize("AZEROTH.SpecialEquipment.Review")}</button>`});
    return {ok:false,pending};
  }
  finally{busy.delete(owner.uuid);}
}

/** Completed rests recharge physical carried copies and the creature-family ledger only. */
export async function rechargeSpecialEquipment(actor,rest){
  const owner=ownerOf(actor);
  await owner.setFlag(NS,LIMIT,rechargeEquipmentUses(usesOf(owner),rest));
  for(const item of actor.items)if(item.getFlag(NS,LIMIT))await item.setFlag(NS,LIMIT,rechargeEquipmentUses(usesOf(item),rest));
}
/** Soup is chosen as food, never activated as a potion. Choice/limit checked before food payment. */
export async function prepareSpecialRest(actor,eaten,drunk){
  const entry=specialEquipmentOf(eaten);
  if(!eaten&&!drunk)return {ok:true};
  const owner=ownerOf(actor),pools=(actor.poolSnapshot?.()??[]).filter(p=>p.kind==="power"&&p.name==="mana");
  let picked=null;
  if(entry?.key==="nightfin-soup"){
    if(!drunk||!pools.length||(actor.getFlag(NS,"shortRests")??0)>=2||!equipmentLimitAvailable(entry.key,usesOf(owner),usesOf(eaten)))return {ok:false};
    picked=await pick(eaten,pools.map(p=>({key:p.itemId,name:p.className??p.name,description:`${p.value}/${p.max}`})),"AZEROTH.SpecialEquipment.Pool");
    if(!picked)return {ok:false};
  }
  const data={phase:"prepare",actorUuid:actor.uuid,itemId:eaten?.id??null,drinkId:drunk?.id??null,poolId:picked?.key??null,
    source:eaten?sourceOf(eaten):null,drinkSource:drunk?sourceOf(drunk):null,requestId:foundry.utils.randomID(32)};
  const result=gm()?await specialRestQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(SOUP_QUERY,data,{timeout:180000});
  return result?.ok?{ok:true,prepared:true,requestId:data.requestId}:{ok:false};
}
export async function finishSpecialRest(actor,prepared){
  if(!prepared?.prepared)return;
  const data={phase:"finish",actorUuid:actor.uuid,requestId:prepared.requestId};
  const result=gm()?await specialRestQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(SOUP_QUERY,data,{timeout:180000});
  if(!result?.ok)throw Error("Soup rest receipt requires GM review");
}
export async function specialRestQueryHandler(data={}, {user}={}){
  if(!gm()||!user)return {ok:false};
  const actor=await fromUuid(data.actorUuid);
  if(!actor?.testUserPermission(user,"OWNER")||busy.has(actor.uuid))return {ok:false};
  busy.add(actor.uuid);
  try{
    if(data.phase==="prepare"){
      const item=actor.items.get(data.itemId),drink=actor.items.get(data.drinkId),foodEntry=specialEquipmentOf(item),drinkEntry=specialEquipmentOf(drink);
      const soup=foodEntry?.key==="nightfin-soup",firewater=drinkEntry?.key==="winterfall-firewater";
      const pool=actor.poolSnapshot().find(p=>p.kind==="power"&&p.name==="mana"&&p.itemId===data.poolId);
      if(!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??"")||(!item&&!drink)||item&&item===drink
        ||(data.itemId&&(!item||sourceOf(item)!==data.source||item.system.quantity<=0||!["food","hotMeal"].includes(item.system.provision)||!guardPendingCustodyItem(item).ok))
        ||(data.drinkId&&(!drink||sourceOf(drink)!==data.drinkSource||drink.system.quantity<=0||drink.system.provision!=="drink"||!guardPendingCustodyItem(drink).ok))
        ||(soup&&(!pool||!drink||(actor.getFlag(NS,"shortRests")??0)>=2||!equipmentLimitAvailable(foodEntry.key,usesOf(actor),usesOf(item))))
        ||(firewater&&!equipmentLimitAvailable(drinkEntry.key,usesOf(actor),usesOf(drink))))return {ok:false};
      const entry=soup?foodEntry:firewater?drinkEntry:{key:"rest-provisions"};
      await claim(actor,soup?item:firewater?drink:item??drink,entry,data.requestId);requireWriter();
      if(soup&&firewater){
        const mark={spent:true,requestId:data.requestId,per:"long"};
        await actor.setFlag(NS,LIMIT,{...usesOf(actor),[drinkEntry.key]:mark});requireWriter();
        await drink.setFlag(NS,LIMIT,{...usesOf(drink),[drinkEntry.key]:mark});requireWriter();
      }
      await actor.setFlag(NS,RECEIPT,{...actor.getFlag(NS,RECEIPT),rest:true,soup,poolId:data.poolId,foodId:item?.id??null,
        foodQuantity:item?.system.quantity??null,drinkId:drink?.id??null,drinkQuantity:drink?.system.quantity??null,
        drinkBenefit:drinkBenefitOf(drink)});
      return {ok:true};
    }
    const receipt=actor.getFlag(NS,RECEIPT);
    if(data.phase!=="finish"||!receipt?.rest||receipt.id!==data.requestId||receipt.stage!=="claimed")return {ok:false};
    const item=actor.items.get(receipt.foodId),drink=actor.items.get(receipt.drinkId),pool=actor.poolSnapshot().find(p=>p.kind==="power"&&p.name==="mana"&&p.itemId===receipt.poolId);
    // Food payment may delete its exhausted item. A surviving copy must have paid one portion.
    if((receipt.soup&&!pool)||(item&&item.system.quantity!==null&&item.system.quantity>=receipt.foodQuantity)||(drink&&drink.system.quantity!==null&&drink.system.quantity>=receipt.drinkQuantity))throw Error("Rest provisions or pool payment not confirmed");
    await actor.setFlag(NS,RECEIPT,{...receipt,stage:"paid"});requireWriter();
    await grantPaidDrinkBenefit(actor,receipt.drinkBenefit,receipt.id);requireWriter();
    // The one-hour rest includes preparation and outlasts these food/drink durations.
    const ended=[...actor.effects].filter(e=>{const s=equipmentState(e);return s&&((receipt.foodId&&s.food)||["kreegs-stout-beatdown","winterfall-firewater"].includes(s.key));}).map(e=>e.id);
    if(ended.length)await actor.deleteEmbeddedDocuments("ActiveEffect",ended);requireWriter();
    if(receipt.soup){
      const fresh=actor.poolSnapshot().find(p=>p.kind==="power"&&p.name==="mana"&&p.itemId===receipt.poolId);
      const held=actor.getFlag(NS,RECEIPT);
      if(!fresh||!actor.testUserPermission(user,"OWNER")||held?.id!==receipt.id||held.stage!=="paid")throw Error("Soup pool or receipt changed before recovery");
      await actor.updatePool({itemId:fresh.itemId,kind:fresh.kind,value:Math.min(fresh.max,fresh.value+2)});requireWriter();
    }
    await actor.setFlag(NS,RECEIPT,{...receipt,stage:"complete"});return {ok:true};
  }catch(error){console.warn("azeroth-rpg | Soup rest receipt requires review",error);await pendingReview(actor);return {ok:false,pending:true};}
  finally{busy.delete(actor.uuid);}
}
/** Only a successful entry from an unshifted body qualifies. The wearer may decline. */
export async function wolfsheadAfterShape(actor,{before,kind,effect}){
  if(!effect||before||kind!=="shapeshift")return;
  const item=[...actor.items].find(i=>i.system?.equipped&&i.system.identifier==="wolfshead-helm");
  if(!item)return;
  const entry=specialEquipmentOf(item),owner=ownerOf(actor);
  if(!equipmentLimitAvailable(entry.key,usesOf(owner),usesOf(item)))return;
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Wolfshead")}</p>`});
  if(!yes||!item.system.equipped||!actor.effects.has(effect.id)||!equipmentLimitAvailable(entry.key,usesOf(owner),usesOf(item)))return;
  const data={actorUuid:actor.uuid,itemId:item.id,effectId:effect.id,entryId:effect.getFlag(NS,"equipmentShapeEntry")?.id};
  return gm()?wolfsheadQueryHandler(data,{user:game.user}):game.users?.activeGM?.query(WOLFSHEAD_QUERY,data,{timeout:180000});
}
export async function wolfsheadQueryHandler(data={}, {user}={}){
  if(!gm()||!user)return {ok:false};
  const actor=await fromUuid(data.actorUuid);
  if(!actor?.testUserPermission(user,"OWNER")||busy.has(actor.uuid))return {ok:false};
  busy.add(actor.uuid);
  try{
    const effect=actor.effects.get(data.effectId),stamp=effect?.getFlag(NS,"equipmentShapeEntry"),item=actor.items.get(data.itemId);
    const entry=specialEquipmentOf(item),pool=actor.poolSnapshot().find(p=>p.kind==="momentum"&&p.name==="ferocity");
    if(!eligible(actor)||entry?.key!=="wolfshead-helm"||!item.system.equipped||!guardPendingCustodyItem(item).ok
      ||!stamp?.id||stamp.id!==data.entryId||stamp.used||stamp.at!==clock()||effect.disabled||effect.isSuppressed
      ||!pool||pool.value!==0||!equipmentLimitAvailable(entry.key,usesOf(actor),usesOf(item)))return {ok:false};
    await claim(actor,item,entry,stamp.id);
    requireWriter();await effect.setFlag(NS,"equipmentShapeEntry",{...stamp,used:true});requireWriter();
    const fresh=actor.poolSnapshot().find(p=>p.kind==="momentum"&&p.name==="ferocity"&&p.itemId===pool.itemId);
    if(actor.effects.get(effect.id)!==effect||effect.disabled||effect.isSuppressed||stamp.at!==clock()||!fresh||fresh.value!==0
      ||effect.getFlag(NS,"equipmentShapeEntry")?.id!==stamp.id)throw Error("Wolfshead entry changed after claim");
    await actor.updatePool({itemId:fresh.itemId,kind:fresh.kind,value:Math.min(fresh.max,2)});requireWriter();
    await actor.setFlag(NS,RECEIPT,{...actor.getFlag(NS,RECEIPT),stage:"complete"});
    return {ok:true};
  }catch(error){console.warn("azeroth-rpg | Wolfshead receipt needs GM review",error);await pendingReview(actor);warn();return {ok:false,pending:true};}
  finally{busy.delete(actor.uuid);}
}
export function registerSpecialEquipment(){
  registerHealerKit();
  registerHarmBelt();
  registerUtilityVision();
  registerOnyxiaEngulfment();
  registerEquipmentRepair();
  registerEquipmentExplosives();
  registerParachute();
  registerAlarmBot();
  registerEquipmentTestQuery();
  registerProvisionBenefits();
  registerOrdinaryDrinks();
  registerSharedFeasts();
  registerDeviceContext();
  registerProsthetics();
  registerRocketBoots();
  registerPlacedDevices();
  registerEquipmentTravel();
  registerChiliEquipment();
  CONFIG.queries[SPECIAL_EQUIPMENT_QUERY]=specialEquipmentQueryHandler;
  CONFIG.queries[WOLFSHEAD_QUERY]=wolfsheadQueryHandler;
  CONFIG.queries[SOUP_QUERY]=specialRestQueryHandler;
  const clean=async actor=>{
    if(!gm()||!actor)return;
    const dead=actor.type==="character" ? actor.system?.health?.value<=0
      &&actor.system?.deathSteps>=(actor.system?.deathStepLimit??3) : actor.system?.health?.value<=0;
    const ids=[...actor.effects].filter(e=>equipmentState(e)&&(dead||(Number.isFinite(equipmentState(e).expiresAt)&&equipmentState(e).expiresAt<=clock()))).map(e=>e.id);
    if(ids.length)await actor.deleteEmbeddedDocuments("ActiveEffect",ids);
  };
  const allActors=()=>{
    const actors=[...game.actors];
    for(const scene of game.scenes)for(const token of scene.tokens)if(!token.actorLink&&token.actor)actors.push(token.actor);
    return actors;
  };
  Hooks.on("updateWorldTime",()=>{if(gm())for(const a of allActors())void clean(a);});
  Hooks.on("updateActor",actor=>void clean(actor));
  Hooks.once("ready",()=>{if(gm())for(const a of allActors())void clean(a);});
  Hooks.on("renderChatMessageHTML",(_message,html)=>{
    if(!gm())return;
    for(const button of html.querySelectorAll("[data-equipment-review]"))button.addEventListener("click",async()=>{
      const actor=await fromUuid(button.dataset.equipmentReview);if(actor)await reviewSpecialEquipmentReceipt(actor);
    });
  });
}

/** GM review never refunds a paid use or silently reapplies an uncertain effect. */
export async function reviewSpecialEquipmentReceipt(actor){
  if(!gm())return false;
  const receipt=actor.getFlag(NS,RECEIPT);
  if(!receipt||receipt.stage==="complete")return false;
  const snapshot=JSON.stringify(receipt);
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("AZEROTH.SpecialEquipment.Review")},
    content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.ReviewInstructions")}</p><pre>${foundry.utils.escapeHTML(snapshot)}</pre>`});
  if(!yes||!gm()||JSON.stringify(actor.getFlag(NS,RECEIPT))!==snapshot)return false;
  await actor.setFlag(NS,RECEIPT,{...receipt,stage:"complete",reviewedBy:game.user.id,reviewedAt:clock()});
  return true;
}
