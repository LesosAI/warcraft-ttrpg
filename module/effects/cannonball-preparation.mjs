import {cannonballShot,CANNONBALL_IDENTIFIER} from '../rules/cannonball-runner.mjs';
import {feetBetweenTokens} from '../canvas/engaged.mjs';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
function targetOf(ref){
 if(ref?.sceneId&&ref?.tokenId){
  const token=resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`);
  return token?.actor?.id===ref.actorId?{actor:token.actor,token}:null;
 }
 if(ref?.sceneId||ref?.tokenId||!ref?.actorId)return null;
 const actor=resolve(`Actor.${ref.actorId}`);return actor?{actor,token:null}:null;
}
/** Prepayment preparation only. The use coordinator must own the shared
 * rest allowance; the card resolver must own the save and damage receipt. */
export function prepareCannonballShot({actor,item,targets=[]}={}){
 if(!actor||item?.parent!==actor||item.system?.identifier!==CANNONBALL_IDENTIFIER
  ||item.system.equipped!==true||item.system.signatureEffect?.kind!=='use')return {ok:false,reason:'source'};
 if(!Array.isArray(targets)||targets.length!==1)return {ok:false,reason:'oneTarget'};
 const ref=structuredClone(targets[0]),target=targetOf(ref);
 if(!target)return {ok:false,reason:'target'};
 const read=()=>{
  if(resolve(actor.uuid)!==actor||actor.items.get(item.id)!==item||item.parent!==actor
   ||!item.system.equipped||item.system.signatureEffect?.kind!=='use'||item.system.identifier!==CANNONBALL_IDENTIFIER)return null;
  const current=targetOf(ref);if(current?.actor!==target.actor||current.token!==target.token)return null;
  const sourceToken=actor.getActiveTokens?.(true)?.[0]??null;
  if(sourceToken&&target.token&&sourceToken.document?.parent?.id!==target.token.parent?.id)return null;
  const distance=feetBetweenTokens(sourceToken,target.token?.object??null);
  const ownModifiers=Object.fromEntries(Object.entries(actor.system.abilities??{}).map(([key,value])=>[key,value.own?.mod??value.mod]));
  const skillRanks=actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{};
  const result=cannonballShot({ownModifiers,skillRanks,targetUuid:target.actor.uuid,distance});
  return result.ok?{...result.shot,target:ref,sourceTokenUuid:sourceToken?.document?.uuid??null,distance}:result;
 };
 const shot=read();if(!shot)return {ok:false,reason:'changed'};
 if(shot.ok===false)return shot;
 const expected=JSON.stringify(shot);
 return {ok:true,shot,valid:()=>JSON.stringify(read())===expected};
}
