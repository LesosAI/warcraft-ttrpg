/** The prepared meal's one Reaction follows a confirmed hit, never another attack. */
import {activeEquipmentEffects,equipmentState} from "../rules/special-equipment.mjs";
import {areaFor} from "../rules/areas.mjs";
import {resolveDamage} from "../rules/mitigation.mjs";
import {resistKey} from "../rules/records.mjs";
import {rowWithdrawn} from "../rules/miss.mjs";
import {AZEROTH} from "../config.mjs";
import {dealtHalvedBy} from "../rules/legacy-uses.mjs";
export const CHILI_QUERY="azeroth-rpg.chiliReaction";
const NS="azeroth-rpg",locks=new Set();
const writer=()=>game.user?.isGM&&game.users?.activeGM?.id===game.user.id;
const mealOf=actor=>activeEquipmentEffects(actor.effects,game.time.worldTime).find(e=>equipmentState(e).key==="dragonbreath-chili");
const turnOf=actor=>{const c=actor.activeFight?.();return c?.started?`${c.id}:${c.round}:${c.turn}`:`world:${game.time.worldTime}`;};
export async function offerChiliReaction({actor,message}={}){
  const meal=actor&&mealOf(actor),f=message?.flags?.[NS];
  if(!meal||f?.kind!=="attack"||f.parry||f.strike?.rangeKind!=="melee"||f.chiliOffer)return null;
  const data={actorUuid:actor.uuid,messageUuid:message.uuid,effectId:meal.id,turn:turnOf(actor)};
  await message.setFlag(NS,"chiliOffer",data);
  return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
    content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Chili")}</p><button type="button" data-chili-message="${foundry.utils.escapeHTML(message.uuid)}">${game.i18n.localize("AZEROTH.SpecialEquipment.Reaction")}</button>`});
}
export async function chiliReactionHandler({messageUuid}={}, {user}={}){
  if(!writer()||!user)return {ok:false};
  const message=await fromUuid(messageUuid),f=message?.flags?.[NS],offer=f?.chiliOffer;
  const actor=offer&&await fromUuid(offer.actorUuid);
  if(!actor?.testUserPermission(user,"OWNER")||locks.has(actor.uuid)||offer.messageUuid!==message.uuid)return {ok:false};
  locks.add(actor.uuid);
  try{
    const valid=()=>writer()&&fromUuidSync(message.uuid)===message&&actor.testUserPermission(user,"OWNER")
      &&actor.system.health.value>0&&turnOf(actor)===offer.turn&&!message.flags[NS].chiliClaim
      &&mealOf(actor)?.id===offer.effectId;
    if(!valid()||f.kind!=="attack"||f.parry||f.strike?.rangeKind!=="melee")return {ok:false};
    const index=(f.damageByTarget??[]).findIndex((r,i)=>r?.hit===true&&!rowWithdrawn(f,i)&&f.attackResolution?.targets?.[i]?.stage==="applied");
    if(index<0)return {ok:false};
    const scene=game.scenes.get(f.source?.sceneId),source=scene?.tokens.get(f.source?.tokenId),target=scene?.tokens.get(f.targets?.[index]?.tokenId);
    if(!source||source.actor!==actor||!target||scene!==canvas.scene||!source.object||!target.object||source._source.level!==target._source.level)return {ok:false};
    const geometry=()=>JSON.stringify([source.object?.center,target.object?.center,source._source.level,target._source.level]);
    const expected=geometry(),placed=()=>scene===canvas.scene&&scene.tokens.get(source.id)===source&&scene.tokens.get(target.id)===target
      &&source.actor===actor&&geometry()===expected;
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Dragonbreath Chili"},content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Chili")}</p>`});
    if(!confirmed||!valid()||!placed()||rowWithdrawn(message.flags[NS],index)||message.flags[NS].attackResolution?.targets?.[index]?.stage!=="applied")return {ok:false};
    const {spendTurnBudget}=await import("../dice/workflows.mjs");
    if(!valid()||!placed())return {ok:false};
    await message.setFlag(NS,"chiliClaim",{stage:"reserved",effectId:offer.effectId,writerId:game.user.id});
    if(!writer())throw Error("Chili writer changed after reservation");
    if(!await spendTurnBudget(actor,"reaction")){
      if(!writer())throw Error("Chili writer changed after budget refusal");
      await message.setFlag(NS,"chiliClaim",null);return {ok:false};
    }
    if(!writer()||!placed()||mealOf(actor)?.id!==offer.effectId)throw Error("Chili changed after payment");
    await message.setFlag(NS,"chiliClaim",{stage:"paid",effectId:offer.effectId,writerId:game.user.id});
    if(message.getFlag(NS,"chiliClaim")?.stage!=="paid")throw Error("Chili claim unconfirmed");
    if(!writer())throw Error("Chili writer changed before meal consumption");
    await actor.deleteEmbeddedDocuments("ActiveEffect",[offer.effectId]);
    if(actor.effects.has(offer.effectId))throw Error("Chili benefit consumption unconfirmed");
    if(!writer()||!placed())throw Error("Chili source changed before cone placement");
    const from=source.object.center,to=target.object.center,rotation=Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI;
    const {placeArea}=await import("../canvas/regions.mjs");
    const region=await placeArea({areaText:"A 10 ft cone",name:"Dragonbreath Chili",scene,origin:from,token:source,rotation,attach:false});
    if(!region)throw Error("Chili cone not confirmed");
    if(!writer())throw Error("Chili writer changed after placement");
    const {targetSnapshots}=await import("../applications/roll-dialog.mjs");
    const tokens=[...region.tokens].filter(t=>t.id!==source.id&&t._source.level===source._source.level&&t.object);
    const targets=targetSnapshots(tokens.map(t=>t.object));
    const halved=dealtHalvedBy(actor);
    const damageFor=(t,passed)=>resolveDamage({rating:2,sl:0,kind:"magical",school:"fire",ward:t.wardBySchool?.fire??0,dealtHalved:halved,
      schoolArmor: t.schoolArmor?.["fire"]??0,immune:t.immune??[],vulnerable:t.vulnerable??[],slAddsToDamage:false,passedHalf:passed});
    const damageByTarget=targets.map(t=>damageFor(t,false)),passedByTarget=targets.map(t=>damageFor(t,true));
    const area=areaFor("A 10 ft cone"),resist={key:"reflex",label:AZEROTH.resiliences.reflex,dc:16};
    const resistRows=targets.map((t,index)=>({index,name:t.name,actorUuid:tokens[index].actor.uuid,key:resistKey(t),resilience:"reflex",label:resist.label,dc:16}));
    const content=await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs",{
      config:AZEROTH,title:"Dragonbreath Chili",subtitle:actor.name,action:"reaction",rolled:false,
      damage:{final:2,explanation:game.i18n.localize(AZEROTH.damageTypes.fire)},resist,resistRows,area,attack:false,inflicts:[],
      effect:game.i18n.localize("AZEROTH.SpecialEquipment.Chili"),targets:targets.map((t,index)=>({...t,index})),provenance:[]});
    const card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,flags:{[NS]:{
      kind:"feature",featureKey:"dragonbreath-chili",title:"Dragonbreath Chili",targets,source:f.source,
      notAttack:true,
      damageByTarget,passedByTarget,damagePassed:1,halfOnPass:true,damageType:"fire",sl:0,area,
      specialEquipmentChili:{sourceMessageUuid:message.uuid,regionUuid:region.uuid}}}});
    if(!writer())throw Error("Chili writer changed after card");
    await message.setFlag(NS,"chiliClaim",{...message.getFlag(NS,"chiliClaim"),stage:"complete",messageUuid:card.uuid});
    return {ok:true,messageUuid:card.uuid};
  }catch(error){console.warn("azeroth-rpg | paid chili requires GM review",error);ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Pending"));
    if(writer())await ChatMessage.create({content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.Pending")}</p><button type="button" data-chili-review="${foundry.utils.escapeHTML(message.uuid)}">${game.i18n.localize("AZEROTH.SpecialEquipment.Review")}</button>`});
    return {ok:false,pending:true};}
  finally{locks.delete(actor.uuid);}
}
export function registerChiliEquipment(){
  CONFIG.queries[CHILI_QUERY]=chiliReactionHandler;
  Hooks.on("renderChatMessageHTML",(_message,html)=>{
    if(writer())for(const button of html.querySelectorAll("[data-chili-review]"))button.addEventListener("click",async()=>{
      const source=await fromUuid(button.dataset.chiliReview);if(source)await reviewChiliReceipt(source);
    });
    for(const button of html.querySelectorAll("[data-chili-message]"))button.addEventListener("click",async()=>{
      const payload={messageUuid:button.dataset.chiliMessage};
      const result=writer()?await chiliReactionHandler(payload,{user:game.user}):await game.users?.activeGM?.query(CHILI_QUERY,payload,{timeout:180000});
      if(!result?.ok)ui.notifications?.warn(game.i18n.localize("AZEROTH.SpecialEquipment.Refused"));
    });
  });
}
export async function reviewChiliReceipt(message){
  if(!writer())return false;
  const receipt=message.getFlag(NS,"chiliClaim");if(!receipt||receipt.stage==="complete")return false;
  const snapshot=JSON.stringify(receipt);
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("AZEROTH.SpecialEquipment.Review")},
    content:`<p>${game.i18n.localize("AZEROTH.SpecialEquipment.ReviewInstructions")}</p><pre>${foundry.utils.escapeHTML(snapshot)}</pre>`});
  if(!yes||!writer()||JSON.stringify(message.getFlag(NS,"chiliClaim"))!==snapshot)return false;
  await message.setFlag(NS,"chiliClaim",{...receipt,stage:"complete",reviewedBy:game.user.id});return true;
}
