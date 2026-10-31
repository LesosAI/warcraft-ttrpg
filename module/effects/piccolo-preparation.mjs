import {piccoloPerformance,PICCOLO_IDENTIFIER} from '../rules/piccolo.mjs';
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

/** Internal prepayment snapshot. `canHear` is supplied by the authoritative
 * hearing review, never copied from a player's query payload. The use caller
 * still owns rest/action payment and each recipient's save/delivery receipt. */
export function preparePiccoloPerformance({actor,item,targets=[],canHear}={}){
  if(!actor||item?.parent!==actor||typeof canHear!=='function'||!Array.isArray(targets))return {ok:false,reason:'source'};
  const refs=structuredClone(targets),resolved=refs.map(targetOf);
  if(resolved.some(row=>!row))return {ok:false,reason:'target'};
  const read=()=>{
    if(resolve(actor.uuid)!==actor||actor.items.get(item.id)!==item||item.parent!==actor
      ||item.system.identifier!==PICCOLO_IDENTIFIER||item.system.equipped!==true
      ||item.system.signatureEffect?.kind!=='use')return null;
    const source=actor.getActiveTokens?.(true)?.[0]??null,rows=[];
    for(const [index,ref] of refs.entries()){
      const current=targetOf(ref),original=resolved[index];
      if(!current||current.actor!==original.actor||current.token!==original.token
        ||resolve(current.actor.uuid)!==current.actor)return null;
      if(source&&current.token&&source.document?.parent?.id!==current.token.parent?.id)return null;
      rows.push({uuid:current.actor.uuid,distance:feetBetweenTokens(source,current.token?.object??null),
        canHear:!current.actor.statuses?.has('deafened')&&canHear(current.actor,current.token,source)===true});
    }
    const ownModifiers=Object.fromEntries(Object.entries(actor.system.abilities??{})
      .map(([key,value])=>[key,value.own?.mod??value.mod]));
    const skillRanks=actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{};
    const result=piccoloPerformance({ownModifiers,skillRanks,targets:rows});
    return result.ok?{...result.performance,targets:result.performance.targets.map((row,index)=>({...row,ref:refs[index]})),
      sourceTokenUuid:source?.document?.uuid??null}:result;
  };
  const performance=read();if(!performance)return {ok:false,reason:'changed'};
  if(performance.ok===false)return performance;
  const expected=JSON.stringify(performance);
  return {ok:true,performance,valid:()=>JSON.stringify(read())===expected};
}
