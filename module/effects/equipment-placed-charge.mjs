import {regionDataFor} from "../canvas/regions.mjs";
import {regionInWorld,sceneInWorld} from "../canvas/in-world.mjs";
import {footprintOf,feetBetweenFootprints} from "../canvas/footprints.mjs";
import {halvedAmount} from "../rules/legacy-uses.mjs";
import {smokeGeometry} from "../canvas/equipment-smoke.mjs";
const NS="azeroth-rpg",busy=new Set();
const writer=()=>game.user?.isGM&&game.users?.activeGM?.id===game.user.id;
const checkWriter=()=>{if(!writer())throw Error("Charge writer changed");};
const fingerprint=f=>JSON.stringify({itemId:f.itemId,targets:f.targets,title:f.title,damage:f.damageByTarget,preparation:f.explosivePreparation});
export async function placeEquipmentCharge(message,preparation,validate){
  const g=preparation.geometry,scene=game.scenes.get(g.sceneId),state=message.flags[NS].equipmentExplosive;
  if(!writer()||!sceneInWorld(scene)||!scene.levels.get(g.levelId)||!validate())throw Error("Charge placement changed");
  const data=regionDataFor({areaText:`${state.charge.radius} ft radius on the ground`,name:message.flags[NS].title,scene,origin:g.origin,attach:false,
    flags:{equipmentCharge:{version:1,messageUuid:message.uuid}}});
  data.levels=[g.levelId];data.elevation={bottom:g.elevation,top:null};data.locked=true;
  const [region]=await scene.createEmbeddedDocuments("Region",[data]);checkWriter();
  if(!regionInWorld(region)||!validate())throw Error("Charge placement unconfirmed");
  return {...state.charge,...g,dueAt:game.time.worldTime+preparation.fuseSeconds,stage:"armed",geometrySnapshot:smokeGeometry(region),regionUuid:region.uuid};
}
/** A timed charge snapshots actual occupants only when its declared fuse ends.
 * Its setter need not remain in the world. A held/partial blast never replays. */
export async function detonateEquipmentCharge(message){
  const f=message.flags?.[NS],state=f?.equipmentExplosive,charge=state?.charge;
  if(!writer()||charge?.stage!=="armed"||charge.dueAt>game.time.worldTime||state.fingerprint!==fingerprint(f)||busy.has(message.uuid))return {ok:false};
  busy.add(message.uuid);
  try{
    const region=await fromUuid(charge.regionUuid);checkWriter();
    const current=()=>writer()&&game.messages.get(message.id)===message&&regionInWorld(region)
      &&smokeGeometry(region)===charge.geometrySnapshot&&message.getFlag(NS,"equipmentExplosive")?.charge?.stage==="armed"
      &&fingerprint(message.flags[NS])===state.fingerprint;
    if(!current()){
      const held={...state,charge:{...charge,stage:"held",reason:"geometry-or-source-changed"}};
      if(game.messages.get(message.id)===message){await message.setFlag(NS,"equipmentExplosive",held);checkWriter();}
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Explosives.Pending"));return {ok:false,pending:true};
    }
    const scene=region.parent,point={kind:"points",points:[charge.origin],elevation:charge.elevation};
    const targets=[...scene.tokens].filter(token=>token.actor&&token._source.level===charge.levelId
      &&(feetBetweenFootprints(footprintOf(token),point,scene.grid)??Infinity)<=charge.radius)
      .map(token=>({actorId:token.actor.id,actorUuid:token.actor.uuid,tokenId:token.id,sceneId:scene.id,name:token.name??token.actor.name}));
    const caster=ChatMessage.getSpeakerActor(message.speaker),amount=halvedAmount(charge.amount,state.dealerHalved);
    const triggered={...state,charge:{...charge,stage:"triggered"}};
    await message.setFlag(NS,"equipmentExplosive",triggered);checkWriter();
    if(!regionInWorld(region)||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(triggered))throw Error("Charge trigger unconfirmed");
    const flags={kind:"gear",itemId:f.itemId,title:f.title,targets,damageByTarget:targets.map(()=>({damage:amount})),notAttack:true};
    flags.equipmentExplosive={version:1,key:state.key,receipt:state.receipt,actorUuid:caster?.uuid??null,fingerprint:fingerprint(flags),targets:{},
      placedDetonation:{sourceMessageUuid:message.uuid,regionUuid:region.uuid}};
    const {AZEROTH}=await import("../config.mjs");
    const content=await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs",{
      config:AZEROTH,title:f.title,subtitle:caster?.name??"",rolled:false,damage:{final:amount,explanation:String(amount)},
      targets:targets.map((t,index)=>({...t,index})),inflicts:[],attack:false,provenance:[]});
    checkWriter();
    const blast=await ChatMessage.create({speaker:message.speaker,whisper:[game.user.id],content,flags:{[NS]:flags}});checkWriter();
    const linked={...triggered,charge:{...triggered.charge,blastMessageUuid:blast.uuid}};
    await message.setFlag(NS,"equipmentExplosive",linked);checkWriter();
    if(game.messages.get(blast.id)!==blast||JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(linked))throw Error("Charge blast link unconfirmed");
    const {explosiveQueryHandler}=await import("./equipment-explosives.mjs");
    for(let index=0;index<targets.length;index++){
      checkWriter();const result=await explosiveQueryHandler({operation:"apply",messageUuid:blast.uuid,index},{user:game.user});
      if(!result.ok)throw Error("Charge victim held");
    }
    await region.delete();checkWriter();
    if(regionInWorld(region))throw Error("Charge region removal unconfirmed");
    const complete={...linked,charge:{...linked.charge,stage:"complete"}};
    await message.setFlag(NS,"equipmentExplosive",complete);checkWriter();
    if(JSON.stringify(message.getFlag(NS,"equipmentExplosive"))!==JSON.stringify(complete))throw Error("Charge completion unconfirmed");
    return {ok:true};
  }catch(error){console.warn("azeroth-rpg | placed charge requires GM review",error);return {ok:false,pending:true};}
  finally{busy.delete(message.uuid);}
}
export async function detonateDueEquipmentCharges(){
  if(!writer())return;
  for(const message of game.messages??[])if(message.flags?.[NS]?.equipmentExplosive?.charge?.stage==="armed")await detonateEquipmentCharge(message);
}
