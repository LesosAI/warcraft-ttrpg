import {EXPLOSIVES,explosiveRule} from "../rules/equipment-explosives.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {targetActorOf,verifiedResist} from "../dice/annotate.mjs";
import {orderedResists,rowMatches} from "../rules/records.mjs";
import {layTickOn} from "./ticks.mjs";
import {inflictCondition} from "./inflict.mjs";
import {untilNextTurnOrRound} from "./durations.mjs";
import {ROUND_SECONDS} from "../rules/area-ticks.mjs";
import {dealtHalvedBy,halvedAmount} from "../rules/legacy-uses.mjs";
import {actorInWorld} from "../canvas/in-world.mjs";
import {placeEquipmentMine,armEquipmentMine} from "./equipment-mine.mjs";
import {registerEquipmentSmoke,smokeGeometry} from "../canvas/equipment-smoke.mjs";
import {placeEquipmentCharge,detonateEquipmentCharge,detonateDueEquipmentCharges} from "./equipment-placed-charge.mjs";
export const EXPLOSIVE_QUERY="azeroth-rpg.equipmentExplosive";
const NS="azeroth-rpg",locks=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const requireWriter=()=>{if(!writer())throw Error("Explosive writer changed");};
const words=key=>game.i18n.localize(`AZEROTH.Explosives.${key}`);
const fingerprint=f=>JSON.stringify({itemId:f.itemId,targets:f.targets,title:f.title,damage:f.damageByTarget,preparation:f.explosivePreparation});
async function request(data){
  try{return writer()?await explosiveQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(EXPLOSIVE_QUERY,data,{timeout:30000});}
  catch{return {ok:false,pending:true};}
}
/** Called after the paid card exists, before its consumable receipt completes.
 * The GM's dose receipt retains the real Item identity even if the last dose
 * removed that Item. A later inventory use cannot invalidate this card. */
export async function authorizeExplosiveCard(actor,message,receiptKey){
  const result=await request({operation:"authorize",actorUuid:actor.uuid,messageUuid:message.uuid,receiptKey});
  if(!result?.ok)throw Error("Explosive authorization requires GM review");
  return result;
}
/** The object is identified before payment. Only the active GM confirms that
 * it is a metal lock, chain or bar; no Wall/Tile is modified or destroyed. */
export async function prepareExplosiveUse({actor,item}={}){
  const rule=explosiveRule(item);
  if(rule?.mine||rule?.smoke||rule?.placed){
    const {placeItemArea}=await import("../canvas/place.mjs");
    const geometry=await placeItemArea({actor,item,areaText:rule.mine?"A point on the ground":`${rule.radius??20} ft radius on the ground`,guessToken:false,
      createArea:({scene,origin})=>({sceneId:scene.id,levelId:canvas.level?.id,origin})});
    if(!geometry?.levelId)return null;
    const elevation=await foundry.applications.api.DialogV2.prompt({window:{title:item.name},
      content:`<label>${words("GroundElevation")} <input name="elevation" type="number" step="any" required></label>`,rejectClose:false,
      ok:{label:words("ConfirmTarget"),callback:(_event,button)=>button.form.elements.elevation.value}});
    if(elevation==null||String(elevation).trim()===""||!Number.isFinite(Number(elevation)))return null;
    geometry.elevation=Number(elevation);
    const result=await request({operation:"prepare",actorUuid:actor.uuid,itemId:item.id,geometry});
    if(!result?.ok){ui.notifications?.warn(words("PreparationRefused"));return null;}
    return result.preparation;
  }
  if(!rule?.metal)return undefined;
  const name=await foundry.applications.api.DialogV2.prompt({window:{title:item.name},
    content:`<label>${words("MetalTarget")} <input name="target" required maxlength="240"></label>`,rejectClose:false,
    ok:{label:words("ConfirmTarget"),callback:(_event,button)=>button.form.elements.target.value.trim()}});
  if(typeof name!=="string"||!name.trim())return null;
  const result=await request({operation:"prepare",actorUuid:actor.uuid,itemId:item.id,target:name.trim()});
  if(!result?.ok){ui.notifications?.warn(words("PreparationRefused"));return null;}
  return result.preparation;
}
async function prepareHere(data,user){
  const actor=await fromUuid(data.actorUuid),item=actor?.items?.get(data.itemId),key=`prepare:${data.actorUuid}`;
  const rule=explosiveRule(item),g=data.geometry;
  const geometryRule=rule?.mine||rule?.smoke||rule?.placed;
  const geometryValid=()=>g&&Number.isFinite(g.origin?.x)&&Number.isFinite(g.origin?.y)&&Number.isFinite(g.elevation)
    &&game.scenes.get(g.sceneId)?.levels?.get(g.levelId);
  if(!writer()||!actor?.testUserPermission(user,"OWNER")||(!rule?.metal&&!geometryRule)||locks.has(key)
    ||(rule.metal&&(typeof data.target!=="string"||!data.target.trim()||data.target.length>240))
    ||(geometryRule&&!geometryValid()))return {ok:false};
  locks.add(key);
  try{
    const source=JSON.stringify({name:item.name,use:item.system.use}),quantity=item.system.quantity;
    const valid=()=>writer()&&user.active&&actor.testUserPermission(user,"OWNER")&&actor.items.get(item.id)===item
      &&item.parent===actor&&guardPendingCustodyItem(item).ok&&item.system.quantity===quantity
      &&JSON.stringify({name:item.name,use:item.system.use})===source;
    let fuseSeconds;
    if(rule.placed){
      const answer=await foundry.applications.api.DialogV2.prompt({window:{title:item.name},content:`<label>${words("FuseSeconds")} <input name="fuse" type="number" min="0" step="any" required></label>`,rejectClose:false,
        ok:{label:words("ConfirmTarget"),callback:(_event,button)=>button.form.elements.fuse.value}});
      if(answer==null||String(answer).trim()===""||!Number.isFinite(Number(answer))||Number(answer)<0||!valid())return {ok:false};
      fuseSeconds=Number(answer);
    }
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},
      content:`<p>${geometryRule?game.i18n.format(`AZEROTH.Explosives.${rule.mine?"ConfirmMine":rule.placed?"ConfirmCharge":"ConfirmSmoke"}`,{scene:foundry.utils.escapeHTML(game.scenes.get(g.sceneId).name),level:foundry.utils.escapeHTML(g.levelId),x:g.origin.x,y:g.origin.y,elevation:g.elevation,seconds:fuseSeconds}):game.i18n.format("AZEROTH.Explosives.ConfirmMetal",{target:foundry.utils.escapeHTML(data.target)})}</p>`});
    if(!confirmed||!valid()||(geometryRule&&!geometryValid()))return {ok:false};
    const preparation={version:1,itemId:item.id,key:item.system.identifier,target:data.target,source,quantity,
      ...(geometryRule?{geometry:structuredClone(g)}:{}),...(rule.placed?{fuseSeconds}:{}),id:foundry.utils.randomID(32),writer:game.user.id};
    await actor.setFlag(NS,"explosivePreparation",preparation);requireWriter();
    if(!valid()||JSON.stringify(actor.getFlag(NS,"explosivePreparation"))!==JSON.stringify(preparation))return {ok:false};
    return {ok:true,preparation};
  }finally{locks.delete(key);}
}
/** The existing Apply door calls this only after accepting its target damage,
 * including zero. Publication or a mitigated damage number never lays a rider. */
export async function requestExplosiveApply(message,index){
  if(!message?.flags?.[NS]?.equipmentExplosive)return null;
  const result=await request({operation:"apply",messageUuid:message.uuid,index});
  if(!result?.ok)ui.notifications?.warn(words("Pending"));
  return result;
}
export async function explosiveQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  if(data.operation==="prepare")return prepareHere(data,user);
  if(locks.has(data.messageUuid))return {ok:false};
  locks.add(data.messageUuid);
  try{
    const message=await fromUuid(data.messageUuid),f=message?.flags?.[NS];requireWriter();
    const actor=message&&ChatMessage.getSpeakerActor(message.speaker);
    const detonation=f?.equipmentExplosive?.mineDetonation??f?.equipmentExplosive?.placedDetonation;
    if((!actor&&!detonation)||!f||f.kind!=="gear")return {ok:false};
    const valid=()=>writer()&&user.active&&ChatMessage.getSpeakerActor(message.speaker)===actor;
    if(data.operation==="authorize"){
      const receipt=actor.getFlag(NS,"consumableUse"),rule=EXPLOSIVES[receipt?.itemIdentifier];
      if(!actor.testUserPermission(user,"OWNER")||!rule||receipt.key!==data.receiptKey||receipt.stage!=="dosePaid"||receipt.requester!==user.id
        ||receipt.itemId!==f.itemId||message.author?.id!==user.id||receipt.itemName!==f.title)return {ok:false};
      let use;
      try{use=JSON.parse(receipt.source).use;}catch{return {ok:false};}
      const amount=use?.damage?.amount??null;
      const dealerHalved=Boolean(dealtHalvedBy(actor)),initialAmount=halvedAmount(amount,dealerHalved);
      if(f.explosiveDealerHalved!==undefined&&f.explosiveDealerHalved!==dealerHalved)return {ok:false};
      if(!Array.isArray(f.targets)||!Array.isArray(f.damageByTarget)||f.targets.length!==f.damageByTarget.length
        ||f.damageByTarget.some(row=>amount?row?.damage!==initialAmount:row!==null))return {ok:false};
      const frozenReceipt=JSON.stringify(receipt),frozenCard=fingerprint(f);
      const authorization={version:1,key:receipt.itemIdentifier,receipt:receipt.key,actorUuid:actor.uuid,fingerprint:frozenCard,dealerHalved,targets:{}};
      if(rule.metal||rule.mine||rule.smoke||rule.placed){
        const prepared=actor.getFlag(NS,"explosivePreparation");
        if(!prepared||JSON.stringify(prepared)!==JSON.stringify(f.explosivePreparation)||prepared.itemId!==receipt.itemId
          ||prepared.source!==receipt.source||prepared.quantity!==receipt.quantity)return {ok:false};
        if(rule.metal)authorization.thermite={stage:"burning",target:prepared.target,dueAt:game.time.worldTime+ROUND_SECONDS};
        else if(rule.mine)authorization.mine={stage:"placing"};
        else if(rule.smoke)authorization.smoke={stage:"placing",expiresAt:game.time.worldTime+60};
        else{
          if(!Number.isFinite(prepared.fuseSeconds)||prepared.fuseSeconds<0)return {ok:false};
          authorization.charge={stage:"placing",dueAt:game.time.worldTime+prepared.fuseSeconds,radius:rule.radius,amount};
        }
      }
      if(f.equipmentExplosive)return f.equipmentExplosive.receipt===receipt.key&&f.equipmentExplosive.key===receipt.itemIdentifier
        &&f.equipmentExplosive.fingerprint===frozenCard?{ok:true,already:true}:{ok:false};
      if(!valid())return {ok:false};
      await message.setFlag(NS,"equipmentExplosive",authorization);requireWriter();
      if(!valid()||!actor.testUserPermission(user,"OWNER")||JSON.stringify(actor.getFlag(NS,"consumableUse"))!==frozenReceipt
        ||fingerprint(message.flags[NS])!==frozenCard||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(authorization))
        throw Error("Explosive paid source or authorization changed");
      if(rule.mine){
        const mine=await placeEquipmentMine(message,f.explosivePreparation,()=>valid()&&fingerprint(message.flags[NS])===frozenCard
          &&JSON.stringify(message.getFlag(NS,"equipmentExplosive"))===JSON.stringify(authorization));
        requireWriter();await message.setFlag(NS,"equipmentExplosive",{...authorization,mine});requireWriter();
      }
      if(rule.smoke){
        const {regionDataFor}=await import("../canvas/regions.mjs");requireWriter();
        const g=f.explosivePreparation.geometry,scene=game.scenes.get(g.sceneId),level=scene?.levels.get(g.levelId);
        if(!level||!valid()||fingerprint(message.flags[NS])!==frozenCard)throw Error("Smoke geometry changed");
        const data=regionDataFor({areaText:"20 ft radius on the ground",name:f.title,scene,origin:g.origin,attach:false,
          flags:{equipmentSmoke:{version:1,messageUuid:message.uuid,...g,expiresAt:authorization.smoke.expiresAt}}});
        data.levels=[g.levelId];data.elevation={...level.elevation};
        data.locked=true;
        const [region]=await scene.createEmbeddedDocuments("Region",[data]);requireWriter();
        if(!valid()||game.scenes.get(scene.id)!==scene||scene.regions.get(region.id)!==region)throw Error("Smoke placement unconfirmed");
        const smoke={...region.flags[NS].equipmentSmoke,expiresAt:game.time.worldTime+60,geometrySnapshot:smokeGeometry(region)};
        await region.setFlag(NS,"equipmentSmoke",smoke);requireWriter();
        if(!valid()||scene.regions.get(region.id)!==region||JSON.stringify(region.getFlag(NS,"equipmentSmoke"))!==JSON.stringify(smoke))throw Error("Smoke source unconfirmed");
        const active={...authorization,smoke:{...authorization.smoke,expiresAt:smoke.expiresAt,stage:"active",regionUuid:region.uuid}};
        await message.setFlag(NS,"equipmentExplosive",active);requireWriter();
        if(JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(active))throw Error("Smoke publication unconfirmed");
      }
      if(rule.placed){
        const charge=await placeEquipmentCharge(message,f.explosivePreparation,()=>valid()&&fingerprint(message.flags[NS])===frozenCard
          &&JSON.stringify(message.getFlag(NS,"equipmentExplosive"))===JSON.stringify(authorization));
        requireWriter();const placed={...authorization,charge};await message.setFlag(NS,"equipmentExplosive",placed);requireWriter();
        if(JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(placed))throw Error("Charge arming unconfirmed");
        if(charge.dueAt<=game.time.worldTime)await detonateEquipmentCharge(message);
      }
      return {ok:true};
    }
    const state=f.equipmentExplosive,rule=EXPLOSIVES[state?.key],index=data.index;
    if(data.operation==="armMine")return user.isGM?armEquipmentMine(message):{ok:false};
    if(detonation){
      const source=await fromUuid(detonation.sourceMessageUuid);requireWriter();
      const original=source?.flags?.[NS]?.equipmentExplosive;
      const carrier=state.mineDetonation?original?.mine:original?.charge;
      if(!user.isGM||!message.author?.isGM||carrier?.stage!=="triggered"
        ||carrier.blastMessageUuid!==message.uuid||carrier.regionUuid!==detonation.regionUuid
        ||original.receipt!==state.receipt)return {ok:false};
    }
    if(data.operation==="completeMetal"){
      if(!state||!rule?.metal||!actor.testUserPermission(user,"OWNER")||state.fingerprint!==fingerprint(f))return {ok:false};
      if(state.thermite?.stage==="complete")return {ok:true,already:true};
      if(state.thermite?.stage!=="burning"||game.time.worldTime<state.thermite.dueAt)return {ok:false,waiting:true};
      const expected=JSON.stringify(state);
      const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:f.title},content:`<p>${game.i18n.format("AZEROTH.Explosives.CompleteMetal",{target:foundry.utils.escapeHTML(state.thermite.target)})}</p>`});
      if(!confirmed||!valid()||!actor.testUserPermission(user,"OWNER")||fingerprint(message.flags[NS])!==state.fingerprint
        ||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==expected||game.time.worldTime<state.thermite.dueAt)return {ok:false};
      await message.setFlag(NS,"equipmentExplosive",{...state,thermite:{...state.thermite,stage:"complete",completedBy:game.user.id}});requireWriter();return {ok:true};
    }
    if(rule?.metal||((rule?.mine||rule?.placed)&&!detonation)||rule?.smoke)return {ok:false};
    if(!["apply","deliver"].includes(data.operation)||!state||!rule||!Number.isInteger(index)||index<0||!f.targets?.[index]
      ||state.actorUuid!==(actor?.uuid??null)||state.fingerprint!==fingerprint(f)||f.damageByTarget?.[index]?.withdrawn)return {ok:false};
    const prior=state.targets[index];
    if(prior&&["complete","reviewed"].includes(prior.stage))return {ok:true,already:true};
    const target=targetActorOf(f.targets[index]);
    if(!target||!valid()||(!user.isGM&&!actor?.testUserPermission(user,"OWNER")&&!target.testUserPermission?.(user,"OWNER")))return {ok:false};
    const current=()=>valid()&&message.getFlag(NS,"equipmentExplosive")?.receipt===state.receipt
      &&fingerprint(message.flags[NS])===state.fingerprint&&targetActorOf(f.targets[index])===target;
    let save=null;
    if(rule.resist){
      const record=orderedResists(f.resists).find(r=>r.index===index&&rowMatches(f.targets[index],r));
      if(!record)return {ok:false,needsTest:true};
      const verified=await verifiedResist({messageId:message.id,resultId:record.resultId});requireWriter();
      const result=game.messages.get(record.resultId);
      if(!verified.ok||verified.record.index!==index||verified.record.dc!==rule.resist.dc
        ||result?.flags?.[NS]?.resilience!==rule.resist.resilience||!current())return {ok:false};
      save=verified.record;
    }
    if(data.operation==="apply"){
      if(prior)return {ok:false,pending:true};
      await message.setFlag(NS,"equipmentExplosive",{...state,targets:{...state.targets,[index]:{stage:"applying",actorUuid:target.uuid}}});requireWriter();
      if(!current())throw Error("Explosive changed before damage");
      if(!rule.resist){
        const {applyRecordedExplosiveDamage}=await import("../dice/chat.mjs");
        if(!current())throw Error("Explosive changed before damage adapter");
        const damage=await applyRecordedExplosiveDamage(message,index);requireWriter();
        if(!damage?.ok||damage.damageOutcome?.complete!==true||damage.damageOutcome.targetUuid!==target.uuid||!current())throw Error("Explosive damage not confirmed");
      }
      const applied=message.getFlag(NS,"equipmentExplosive");
      await message.setFlag(NS,"equipmentExplosive",{...applied,targets:{...applied.targets,[index]:{stage:"applied",actorUuid:target.uuid}}});requireWriter();
    }else if(prior?.stage!=="applied")return {ok:false,pending:!!prior};
    const ready=message.getFlag(NS,"equipmentExplosive");
    if(ready?.targets?.[index]?.stage!=="applied"||!current())throw Error("Explosive Apply receipt not confirmed");
    await message.setFlag(NS,"equipmentExplosive",{...ready,targets:{...ready.targets,[index]:{stage:"reserved",actorUuid:target.uuid}}});requireWriter();
    if(!current())throw Error("Explosive recipient changed");
    if(rule.repeat){
      // This carrier belongs to the target, not the Region. Moving away cannot
      // remove it. The ordinary turn-start tick counts down exactly once.
      const tick={kind:"damage",type:null,amount:rule.repeat,rounds:1,until:"",when:"startOfTurn",spellpower:false,
        source:actor.uuid,castUuid:null,cast:message.uuid,name:f.title,
        equipmentExplosive:{version:1,stage:"armed",messageUuid:message.uuid,index,dealerHalved:state.dealerHalved,dueAt:game.time.worldTime+ROUND_SECONDS}};
      const effect=await layTickOn(target,{tick,origin:message.uuid,replace:false});requireWriter();
      if(!effect)throw Error("Incendiary repeat not confirmed");
    }
    if(rule.condition&&save?.success!==true){
      if(rule.resist&&!rule.nextTurn){
        const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:f.title},content:`<p>${words("UnstatedDuration")}</p>`});
        requireWriter();if(!confirmed||!current())throw Error("Explosive duration awaits GM adjudication");
      }
      const until=rule.condition==="slowed"||rule.nextTurn?untilNextTurnOrRound(target):null;
      const result=await inflictCondition({victim:target,id:rule.condition,by:actor,until});requireWriter();
      if(!result.landed&&result.reason!=="immune")throw Error("Explosive condition not confirmed");
    }
    if(!current())throw Error("Explosive changed after delivery");
    const latest=message.getFlag(NS,"equipmentExplosive");
    await message.setFlag(NS,"equipmentExplosive",{...latest,targets:{...latest.targets,[index]:{stage:"complete",actorUuid:target.uuid}}});requireWriter();
    return {ok:true};
  }catch(error){console.warn("azeroth-rpg | explosive application needs GM review",error);return {ok:false,pending:true};}
  finally{locks.delete(data.messageUuid);}
}
/** One exact paid flask/target carrier; shared by turn starts and world time.
 * Unnamed damage remains untyped, following the existing tick engine's policy.
 * This ongoing damage is neither an attack nor a new on-hit event. */
export async function landExplosiveTick({actor,carrier,combat=null}={}){
  const tick=carrier?.flags?.[NS]?.tick,key=carrier?.uuid,state=tick?.equipmentExplosive;
  if(!writer()||!actorInWorld(actor)||!state||state.stage!=="armed"||locks.has(key)||actor.effects.get(carrier.id)!==carrier)return {ok:false};
  if(!combat&&(actor.activeFight?.()?.started||Number(game.time.worldTime)<state.dueAt))return {ok:false};
  locks.add(key);
  try{
    const reserved={...tick,equipmentExplosive:{...state,stage:"landing"}},expected=JSON.stringify(reserved);
    await carrier.setFlag(NS,"tick",reserved);requireWriter();
    if(!actorInWorld(actor)||actor.effects.get(carrier.id)!==carrier||JSON.stringify(carrier.flags[NS].tick)!==expected)throw Error("Explosive burn recipient changed");
    const hand=fromUuidSync(tick.source),amount=halvedAmount(tick.amount,hand?dealtHalvedBy(hand):state.dealerHalved);
    const outcome={};
    await actor.applyDamage(amount,{attack:false,struck:false,type:null,by:hand,messageId:state.messageUuid,outcome});requireWriter();
    if(outcome.complete!==true||outcome.targetUuid!==actor.uuid||!actorInWorld(actor)||actor.effects.get(carrier.id)!==carrier
      ||JSON.stringify(carrier.flags[NS].tick)!==expected)throw Error("Explosive burn damage or carrier unconfirmed");
    await carrier.setFlag(NS,"tick",{...tick,equipmentExplosive:{...state,stage:"complete"}});requireWriter();
    await carrier.delete();requireWriter();return {ok:true};
  }catch(error){console.warn("azeroth-rpg | incendiary repeat needs GM review",error);ui.notifications?.warn(words("Pending"));return {ok:false,pending:true};}
  finally{locks.delete(key);}
}
export async function landWorldExplosiveTicks(){
  if(!writer())return;
  await detonateDueEquipmentCharges();
  const values=collection=>[...(collection?.values?.()??collection??[])];
  const actors=new Set([...values(game.actors),...values(game.scenes).flatMap(scene=>values(scene.tokens).map(t=>t.actor))]);
  for(const actor of actors){
    if(!actor||actor.activeFight?.()?.started)continue;
    for(const carrier of [...actor.effects]){
      const tick=carrier.flags?.[NS]?.tick;
      if(tick?.equipmentExplosive)await landExplosiveTick({actor,carrier,tick});
    }
  }
}
export async function reviewExplosiveBurn(actor,carrier){
  const state=carrier?.flags?.[NS]?.tick?.equipmentExplosive,key=carrier?.uuid;
  if(!writer()||!actorInWorld(actor)||!state||state.stage==="armed"||locks.has(key))return {ok:false};
  locks.add(key);
  try{
    const expected=JSON.stringify(carrier.flags[NS].tick);
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:words("ReviewBurn")},
      content:`<p>${words("ReviewBurnPrompt")}</p><pre>${foundry.utils.escapeHTML(expected)}</pre>`});
    requireWriter();if(!confirmed||!actorInWorld(actor)||actor.effects.get(carrier.id)!==carrier||JSON.stringify(carrier.flags[NS].tick)!==expected)return {ok:false};
    await carrier.setFlag(NS,"tick",{...carrier.flags[NS].tick,equipmentExplosive:{...state,stage:"reviewed"}});requireWriter();
    await carrier.delete();requireWriter();return {ok:true};
  }finally{locks.delete(key);}
}
export async function reviewExplosiveTarget(message,index){
  if(!writer()||locks.has(message.uuid))return {ok:false};
  const state=message.getFlag(NS,"equipmentExplosive"),row=state?.targets?.[index];
  if(!row||["complete","reviewed"].includes(row.stage))return {ok:false};
  locks.add(message.uuid);
  try{
    const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},
      content:`<p>${words("ReviewPrompt")}</p><pre>${foundry.utils.escapeHTML(JSON.stringify(row,null,2))}</pre>`});
    requireWriter();if(!accepted||message.getFlag(NS,"equipmentExplosive")?.targets?.[index]?.stage!==row.stage)return {ok:false};
    const latest=message.getFlag(NS,"equipmentExplosive");
    await message.setFlag(NS,"equipmentExplosive",{...latest,targets:{...latest.targets,[index]:{...row,stage:"reviewed",reviewedBy:game.user.id}}});
    requireWriter();return {ok:true};
  }finally{locks.delete(message.uuid);}
}
export function registerEquipmentExplosives(){
  registerEquipmentSmoke();
  CONFIG.queries[EXPLOSIVE_QUERY]=explosiveQueryHandler;
  const sweep=()=>landWorldExplosiveTicks().catch(error=>console.warn("azeroth-rpg | explosive clock",error));
  Hooks.on("updateWorldTime",sweep);Hooks.once("ready",sweep);Hooks.on("updateUser",sweep);
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    if(!writer())return;
    const state=message.flags?.[NS]?.equipmentExplosive;
    const placed=state?.charge??state?.smoke;
    if(placed&&!['complete','reviewed'].includes(placed.stage)){
      const button=document.createElement("button");button.type="button";button.textContent=words("ReviewPlacement");
      button.addEventListener("click",async()=>{
        if(!writer()||!await foundry.applications.api.DialogV2.confirm({window:{title:words("ReviewPlacement")},content:words("ReviewPlacementPrompt")}))return;
        const current=message.getFlag(NS,"equipmentExplosive"),key=current.charge?"charge":"smoke";
        const regions=[...game.scenes].flatMap(scene=>[...scene.regions]).filter(region=>
          (region.flags?.[NS]?.equipmentCharge??region.flags?.[NS]?.equipmentSmoke)?.messageUuid===message.uuid);
        requireWriter();await message.setFlag(NS,"equipmentExplosive",{...current,[key]:{...current[key],stage:"reviewed"}});requireWriter();
        for(const region of regions){requireWriter();await region.delete();}
      });html.append(button);
    }
    if(state?.key==="goblin-land-mine"&&!state.mineDetonation){
      if(state.mine?.stage==="unarmed"){
        const button=document.createElement("button");button.type="button";button.textContent=words("ArmMine");
        button.addEventListener("click",async()=>{const result=await request({operation:"armMine",messageUuid:message.uuid});
          if(result?.ok)button.disabled=true;else ui.notifications?.warn(words(result?.occupied?"MineOccupied":"Pending"));});html.append(button);
      }
      if(state.mine&&!['complete','reviewed'].includes(state.mine.stage)){
        const button=document.createElement("button");button.type="button";button.textContent=words("ReviewMine");
        button.addEventListener("click",async()=>{
          if(!writer()||!await foundry.applications.api.DialogV2.confirm({window:{title:words("ReviewMine")},content:words("ReviewMinePrompt")}))return;
          const current=message.getFlag(NS,"equipmentExplosive");
          const regions=[...game.scenes].flatMap(scene=>[...scene.regions]).filter(region=>region.flags?.[NS]?.equipmentMine?.messageUuid===message.uuid);
          requireWriter();await message.setFlag(NS,"equipmentExplosive",{...current,mine:{...current.mine,stage:"reviewed"}});requireWriter();
          for(const region of regions){requireWriter();await region.delete();}
        });html.append(button);
      }
    }
    if(state?.thermite?.stage==="burning"){
      const button=document.createElement("button");button.type="button";button.textContent=words("FinishMetal");
      button.addEventListener("click",async()=>{
        const result=await request({operation:"completeMetal",messageUuid:message.uuid});
        if(result?.waiting)ui.notifications?.warn(words("BurningWait"));
        if(result?.ok){button.disabled=true;button.textContent=words("MetalComplete");}
      });html.append(button);
    }
    for(const [index,row] of Object.entries(state?.targets??{}))if(!["complete","reviewed"].includes(row.stage)){
      const button=document.createElement("button");button.type="button";button.textContent=words("Review");
      button.addEventListener("click",()=>reviewExplosiveTarget(message,Number(index)));html.append(button);
    }
    for(const row of message.flags?.[NS]?.targets??[]){
      const actor=targetActorOf(row);
      for(const carrier of actor?.effects??[]){
        const burn=carrier.flags?.[NS]?.tick?.equipmentExplosive;
        if(!burn||burn.messageUuid!==message.uuid||burn.stage==="armed")continue;
        const button=document.createElement("button");button.type="button";button.textContent=words("ReviewBurn");
        button.addEventListener("click",()=>reviewExplosiveBurn(actor,carrier));html.append(button);
      }
    }
  });
}
