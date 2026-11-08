import {regionDataFor} from "../canvas/regions.mjs";
import {regionInWorld,tokenInWorld,sceneInWorld} from "../canvas/in-world.mjs";
import {footprintOf,feetBetweenFootprints} from "../canvas/footprints.mjs";
import {halvedAmount} from "../rules/legacy-uses.mjs";
const NS="azeroth-rpg",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const requireWriter=()=>{if(!writer())throw Error("Mine writer changed");};
const snapshot=region=>{const s=region._source??region;return JSON.stringify({shapes:s.shapes,elevation:s.elevation,levels:s.levels,attachment:s.attachment});};
const cardUnchanged=message=>{const f=message.flags?.[NS],s=f?.equipmentExplosive;return s?.fingerprint===JSON.stringify({itemId:f.itemId,targets:f.targets,title:f.title,damage:f.damageByTarget,preparation:f.explosivePreparation});};
const liveMine=(message,region,mine)=>regionInWorld(region)&&game.messages.get(message.id)===message&&cardUnchanged(message)
  &&region.flags?.[NS]?.equipmentMine?.messageUuid===message.uuid&&mine.geometrySnapshot===snapshot(region);
export function mineContact(document,region,path,enterType){
  const mine=region.flags?.[NS]?.equipmentMine;
  if(!mine||path.length<2)return false;
  let from=path[0],action=from.action??document.movementAction??"walk";
  for(const waypoint of path.slice(1)){
    const to={...from,...waypoint};action=waypoint.action??action;
    if(action!=="fly"&&to.level===mine.levelId&&to.elevation===mine.elevation){
      if(action==="blink"){
        if(!document.testInsideRegion(region,from)&&document.testInsideRegion(region,to))return true;
      }else if(document.segmentizeRegionMovementPath(region,[from,to]).some(s=>s.type===enterType))return true;
    }
    from=to;
  }
  return false;
}
export async function placeEquipmentMine(message,preparation,validate){
  const geometry=preparation.geometry,scene=game.scenes.get(geometry.sceneId);
  if(!writer()||!sceneInWorld(scene)||!scene.levels.get(geometry.levelId)||!validate())throw Error("Mine placement changed");
  const data=regionDataFor({areaText:"A point on the ground",name:message.flags[NS].title,scene,origin:geometry.origin,attach:false,
    flags:{equipmentMine:{version:1,messageUuid:message.uuid,messageId:message.id,levelId:geometry.levelId,elevation:geometry.elevation,origin:geometry.origin,stage:"unarmed"}}});
  data.levels=[geometry.levelId];data.elevation={bottom:geometry.elevation,top:geometry.elevation,topInclusive:true};
  const [region]=await scene.createEmbeddedDocuments("Region",[data]);requireWriter();
  if(!regionInWorld(region)||!validate())throw Error("Mine placement unconfirmed");
  const occupied=[...scene.tokens].some(t=>t.actor&&t.testInsideRegion(region));
  const mine={...region.flags[NS].equipmentMine,geometrySnapshot:snapshot(region),stage:occupied?"unarmed":"armed"};
  await region.setFlag(NS,"equipmentMine",mine);requireWriter();
  if(!regionInWorld(region)||JSON.stringify(region.flags[NS].equipmentMine)!==JSON.stringify(mine))throw Error("Mine arming unconfirmed");
  return {...geometry,regionUuid:region.uuid,geometrySnapshot:mine.geometrySnapshot,stage:mine.stage};
}
export async function armEquipmentMine(message){
  const state=message.flags?.[NS]?.equipmentExplosive,mine=state?.mine;
  if(!writer()||!mine||mine.stage!=="unarmed"||busy.has(message.uuid))return {ok:false};
  busy.add(message.uuid);
  try{
    const region=await fromUuid(mine.regionUuid);requireWriter();
    if(!liveMine(message,region,mine)||JSON.stringify(message.flags[NS].equipmentExplosive)!==JSON.stringify(state)
      ||[...region.parent.tokens].some(t=>t.actor&&t.testInsideRegion(region)))return {ok:false,occupied:true};
    await region.setFlag(NS,"equipmentMine",{...region.flags[NS].equipmentMine,stage:"armed"});requireWriter();
    if(!liveMine(message,region,mine)||region.flags[NS].equipmentMine.stage!=="armed"
      ||JSON.stringify(message.flags[NS].equipmentExplosive)!==JSON.stringify(state))throw Error("Mine arming changed");
    const armed={...state,mine:{...mine,stage:"armed"}};
    await message.setFlag(NS,"equipmentExplosive",armed);requireWriter();
    if(!liveMine(message,region,mine)||region.flags[NS].equipmentMine.stage!=="armed"
      ||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(armed))throw Error("Mine arming unconfirmed");
    return {ok:true};
  }finally{busy.delete(message.uuid);}
}
/** Called synchronously by the existing move entry door. The local reservation
 * is acquired before the first await; the paid card persists the trigger before
 * damage, and no disposition or hidden-token filter excludes a creature. */
export async function triggerEquipmentMine({region,document,path,enterType}={}){
  const mine=region.flags?.[NS]?.equipmentMine,scene=region.parent,message=game.messages.get(mine?.messageId);
  const state=message?.flags?.[NS]?.equipmentExplosive;
  if(!writer()||!regionInWorld(region)||!tokenInWorld(document)||document.parent!==scene||!document.actor
    ||mine?.stage!=="armed"||state?.mine?.stage!=="armed"||state.mine.regionUuid!==region.uuid||!liveMine(message,region,state.mine)
    ||busy.has(message.uuid)||!mineContact(document,region,path,enterType))return false;
  const blastPoint={kind:"points",points:[mine.origin],elevation:mine.elevation};
  const victims=[...scene.tokens].filter(t=>t.actor&&(t===document||(t._source.level===mine.levelId
    &&(feetBetweenFootprints(footprintOf(t),blastPoint,scene.grid)??Infinity)<=10)));
  const targets=victims.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actor.id,actorUuid:t.actor.uuid,name:t.name??t.actor.name}));
  const caster=ChatMessage.getSpeakerActor(message.speaker),amount=halvedAmount(5,state.dealerHalved);
  busy.add(message.uuid);
  try{
    const claim={...state.mine,stage:"triggered",triggerTokenUuid:document.uuid};
    await message.setFlag(NS,"equipmentExplosive",{...state,mine:claim});requireWriter();
    if(!liveMine(message,region,state.mine)||!tokenInWorld(document)||JSON.stringify(message.flags[NS].equipmentExplosive.mine)!==JSON.stringify(claim))throw Error("Mine trigger unconfirmed");
    await region.setFlag(NS,"equipmentMine",{...mine,stage:"triggered"});requireWriter();
    const flags={kind:"gear",itemId:message.flags[NS].itemId,title:message.flags[NS].title,targets,
      damageByTarget:targets.map(()=>({damage:amount})),notAttack:true};
    const fingerprint=JSON.stringify({itemId:flags.itemId,targets:flags.targets,title:flags.title,damage:flags.damageByTarget});
    flags.equipmentExplosive={version:1,key:"goblin-land-mine",receipt:state.receipt,actorUuid:caster?.uuid??null,
      fingerprint,targets:{},mineDetonation:{sourceMessageUuid:message.uuid,regionUuid:region.uuid}};
    const {AZEROTH}=await import("../config.mjs");
    const content=await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs",{
      config:AZEROTH,title:flags.title,subtitle:caster?.name??"",rolled:false,damage:{final:amount,explanation:String(amount)},
      targets:targets.map((t,index)=>({...t,index})),inflicts:[],attack:false,provenance:[]});
    requireWriter();
    const card=await ChatMessage.create({speaker:message.speaker,whisper:[game.user.id],content,flags:{[NS]:flags}});requireWriter();
    const linked={...message.flags[NS].equipmentExplosive,mine:{...claim,blastMessageUuid:card.uuid}};
    await message.setFlag(NS,"equipmentExplosive",linked);requireWriter();
    if(game.messages.get(card.id)!==card||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(linked))throw Error("Mine blast link unconfirmed");
    const {explosiveQueryHandler}=await import("./equipment-explosives.mjs");
    for(let index=0;index<targets.length;index++){
      requireWriter();const result=await explosiveQueryHandler({operation:"apply",messageUuid:card.uuid,index},{user:game.user});
      if(!result.ok)throw Error("Mine victim delivery held");
    }
    await region.delete();requireWriter();
    if(regionInWorld(region))throw Error("Mine region removal unconfirmed");
    const complete={...message.flags[NS].equipmentExplosive,mine:{...claim,stage:"complete",blastMessageUuid:card.uuid}};
    await message.setFlag(NS,"equipmentExplosive",complete);requireWriter();
    if(game.messages.get(message.id)!==message||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(complete))throw Error("Mine completion unconfirmed");
    return true;
  }catch(error){console.warn("azeroth-rpg | mine detonation requires GM review",error);ui.notifications?.warn(game.i18n.localize("AZEROTH.Explosives.Pending"));return false;}
  finally{busy.delete(message.uuid);}
}
