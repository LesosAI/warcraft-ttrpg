import {helmetHitValues,helmetNaturalStrike,HELMET_IDENTIFIER} from '../rules/horned-helmet.mjs';
import {SIGNATURE_HIT_USES} from './signature-hit-use.mjs';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function targetOf(ref){
  if(ref?.sceneId&&ref?.tokenId){const actor=resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor;return actor?.id===ref.actorId?actor:null;}
  return !ref?.sceneId&&!ref?.tokenId&&ref?.actorId?resolve(`Actor.${ref.actorId}`):null;
}
export function prepareHelmetHit({actor,item,hit}={}){
  if(!actor||!item||!Number.isInteger(hit?.index)||hit.index<0)return {ok:false,reason:'hit'};
  const message=resolve(hit.messageUuid),index=hit.index;
  if(!message||message.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)?.[HELMET_IDENTIFIER])return {ok:false,reason:'hitUsed'};
  const read=()=>{
    if(resolve(actor.uuid)!==actor||resolve(hit.messageUuid)!==message||item.parent!==actor
      ||actor.items.get(item.id)!==item||item.system.identifier!==HELMET_IDENTIFIER
      ||item.system.equipped!==true||item.system.signatureEffect?.kind!=='onHit'
      ||ChatMessage.getSpeakerActor(message.speaker)!==actor)return null;
    const flags=message.flags?.['azeroth-rpg']??{},ref=flags.targets?.[index],target=targetOf(ref);
    const weapon=actor.items.get(flags.strike?.weapon?.id),damage=flags.damageByTarget?.[index],resolution=flags.attackResolution?.targets?.[index];
    const readyWeapons = actor.readyWeapons?.() ?? [];
    const natural = helmetNaturalStrike(flags.strike, { readyWeapons, npcAttacks: actor.type === 'npc' ? actor.system.attacks ?? [] : [] });
    if(!target||(!natural&&(weapon?.type!=='weapon'||!readyWeapons.includes(weapon)))
      ||flags.attackResolution?.version!==1||resolution?.targetUuid!==target.uuid)return null;
    const ownModifiers=Object.fromEntries(Object.entries(actor.system.abilities??{}).map(([key,value])=>[key,value.own?.mod??value.mod]));
    const skillRanks=actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{};
    const values=helmetHitValues({kind:flags.kind,success:message.rolls?.[0]?.outcome?.success,parry:flags.parry,notAttack:flags.notAttack,
      weaponId:weapon?.id,naturalAttack:Boolean(natural),rangeKind:flags.strike.rangeKind,hit:damage?.hit,withdrawn:damage?.withdrawn,stage:resolution.stage,
      preventedByDispersion:resolution.preventedByDispersion,ownModifiers,skillRanks});
    return values?{hit:{messageUuid:message.uuid,index,targetUuid:target.uuid,target:structuredClone(ref),weaponId:weapon?.id ?? null,
      ...(natural ? { natural } : {})},
      values,damage:structuredClone(damage),resolution:structuredClone(resolution)}:null;
  };
  const snapshot=read();if(!snapshot)return {ok:false,reason:'hit'};
  return {ok:true,hit:snapshot.hit,values:snapshot.values,valid:()=>same(read(),snapshot)};
}
/** Consume the optional hit once and publish one GM-authored Body-save card.
 * No damage or additional action is charged here. */
export async function publishHelmetHit({actor,item,hit,values,valid,paid}={}){
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||!valid())return null;
  const attack=resolve(hit?.messageUuid),records=structuredClone(attack?.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)??{});
  if(!attack||records[HELMET_IDENTIFIER])return null;
  const claim={state:'pending',writer:game.user.id,itemUuid:item.uuid,index:hit.index,targetUuid:hit.targetUuid,values};
  const next={...records,[HELMET_IDENTIFIER]:claim};
  paid();await attack.setFlag('azeroth-rpg',SIGNATURE_HIT_USES,next);
  const held=()=>valid()&&resolve(attack.uuid)===attack&&same(attack.getFlag('azeroth-rpg',SIGNATURE_HIT_USES),next);
  if(!held())return null;
  const strike={version:1,identifier:HELMET_IDENTIFIER,dc:values.dc,target:hit.target,targetUuid:hit.targetUuid,
    casterUuid:actor.uuid,itemUuid:item.uuid,attackUuid:attack.uuid,index:hit.index,weaponId:hit.weaponId,state:'awaitingSave'};
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/chat/helmet-card.hbs',{
    title:item.name,speakerName:actor.name,targetName:hit.target.name??resolve(hit.targetUuid)?.name??hit.target.actorId,targetUuid:hit.targetUuid,dc:values.dc});
  if(!held())return null;
  const card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,
    flags:{'azeroth-rpg':{kind:'signature',identifier:HELMET_IDENTIFIER,itemId:item.id,helmetStrike:strike}}});
  if(!held()||!card||resolve(card.uuid)!==card)return null;
  next[HELMET_IDENTIFIER]={...claim,state:'complete',cardUuid:card.uuid};
  await attack.setFlag('azeroth-rpg',SIGNATURE_HIT_USES,next);
  return held()?card:null;
}
