import {feetApart} from '../canvas/footprints.mjs';
import {endTurnDamageStamp} from '../rules/end-turn-damage.mjs';
import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
import {actorOf,areaRecord,staleIn,worldClock} from '../canvas/sustained-areas.mjs';
const scope='azeroth-rpg';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Ground contact from an actual Region ENTER segment; works outside combat. */
export async function deliverGroundTouchDamage({region,document,movement,path,enterType}={}){
 const scene=document?.parent,actor=document?.actor,flags=region?.flags?.[scope];
 const message=game.messages.get(flags?.messageId),f=message?.flags?.[scope],source=endTurnDamageStamp(f,'area');
 const caster=actorOf(flags?.caster);
 if(!scene||!actor||!caster||!source?.endTurnDamage.touch||typeof movement?.id!=='string'||!movement.id
  ||flags.cast!==f.cast||f.spellLockCaster!==caster.uuid||!same(flags.endTurnDamage,source.endTurnDamage))return {ok:false,reason:'context'};
 const snapshot=JSON.stringify(region.toObject()),writer=game.user.id;
 const valid=()=>{
  const record=areaRecord(region);
  return game.user.isGM&&game.user.id===writer&&game.users.activeGM?.id===writer
   &&game.scenes.get(scene.id)===scene&&scene.regions.get(region.id)===region
   &&scene.tokens.get(document.id)===document&&document.actor===actor&&actorOf(flags.caster)===caster
   &&game.messages.get(message.id)===message&&same(message.flags[scope].endTurnDamage,source.endTurnDamage)
   &&record&&!record.transferPending&&!staleIn(scene,[record],worldClock()).length
   &&JSON.stringify(region.toObject())===snapshot
   &&document.segmentizeRegionMovementPath(region,path).some(segment=>segment.type===enterType);
 };
 try{
  if(!valid())return {ok:false,reason:'notContact'};
  return await deliverSignatureAreaDamage({message,caster,actor,token:document,spell:f.tickSpell,
   damage:source.endTurnDamage.damage,event:`groundTouch:${f.cast}:${document.uuid}:${movement.id}`,validate:valid});
 }catch{return {ok:false,reason:'uncertain'};}
}

/** Called by the authoritative combat turn-end hook, before effect expiry. */
export async function deliverEndTurnDamage(combat,combatant,stamp){
 const token=combatant?.token,scene=token?.parent,actor=combatant?.actor;
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||!combat.started||!actor||!scene
  ||!Number.isInteger(stamp?.round)||!Number.isInteger(stamp?.turn))return [];
 const writer=game.user.id,boundary={round:combat.round,turn:combat.turn},results=[],seen=new Set();
 for(const other of scene.tokens){
  if(other.id===token.id||!other.actor)continue;
  for(const effect of other.actor.effects){
   const flags=effect.flags?.[scope],message=game.messages.get(flags?.messageId),f=message?.flags?.[scope];
   const source=endTurnDamageStamp(f,'self');
   if(!source||flags?.cast!==f.cast||!same(flags.endTurnDamage,source.endTurnDamage)
    ||effect.origin!==other.actor.uuid||f.spellLockCaster!==other.actor.uuid||seen.has(f.cast))continue;
   const descriptor=source.endTurnDamage,snapshot=JSON.stringify(effect.toObject());
   const valid=()=>game.user.id===writer&&game.users.activeGM?.id===writer&&game.combats.get(combat.id)===combat
    &&combat.started&&combat.round===boundary.round&&combat.turn===boundary.turn
    &&combat.combatants.get(combatant.id)===combatant&&combatant.actor===actor&&combatant.token===token
    &&scene.tokens.get(token.id)===token&&scene.tokens.get(other.id)===other
    &&other.actor?.effects.get(effect.id)===effect&&effect.active!==false&&!effect.disabled&&!effect.duration?.expired
    &&game.messages.get(message.id)===message&&same(message.flags[scope].endTurnDamage,descriptor)
    &&JSON.stringify(effect.toObject())===snapshot
    &&(()=>{const feet=feetApart(other,token);return feet!==null&&feet<=descriptor.feet;})();
   if(!valid())continue;
   seen.add(f.cast);
   results.push(await deliverSignatureAreaDamage({message,caster:other.actor,actor,token,spell:f.tickSpell,
    damage:descriptor.damage,event:`endTurnDamage:${f.cast}:${combat.uuid}:${stamp.round}:${stamp.turn}:${combatant.id}`,validate:valid}));
  }
 }
 for(const region of scene.regions){
  const flags=region.flags?.[scope],message=game.messages.get(flags?.messageId),f=message?.flags?.[scope];
  const source=endTurnDamageStamp(f,'area'),caster=actorOf(flags?.caster);
  if(!source||!caster||flags.cast!==f.cast||f.spellLockCaster!==caster.uuid
   ||!same(flags.endTurnDamage,source.endTurnDamage)||seen.has(f.cast))continue;
  const snapshot=JSON.stringify(region.toObject()),descriptor=source.endTurnDamage;
  const valid=()=>{
   const record=areaRecord(region);
   return game.user.id===writer&&game.users.activeGM?.id===writer&&game.combats.get(combat.id)===combat
    &&combat.started&&combat.round===boundary.round&&combat.turn===boundary.turn
    &&combat.combatants.get(combatant.id)===combatant&&combatant.actor===actor&&combatant.token===token
    &&scene.tokens.get(token.id)===token&&scene.regions.get(region.id)===region
    &&record&&!record.transferPending&&!staleIn(scene,[record],worldClock()).length
    &&game.messages.get(message.id)===message&&same(message.flags[scope].endTurnDamage,descriptor)
    &&JSON.stringify(region.toObject())===snapshot&&token.testInsideRegion(region);
  };
  if(!valid())continue;
  seen.add(f.cast);
  results.push(await deliverSignatureAreaDamage({message,caster,actor,token,spell:f.tickSpell,
   damage:descriptor.damage,event:`endTurnDamage:${f.cast}:${combat.uuid}:${stamp.round}:${stamp.turn}:${combatant.id}`,validate:valid}));
 }
 return results;
}
