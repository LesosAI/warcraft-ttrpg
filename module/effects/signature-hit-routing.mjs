import {publishSignatureHit} from './signature-hit-publication.mjs';
import {signatureHitBonuses} from '../rules/signature-hit-bonuses.mjs';
import {validHitBonusTarget} from '../rules/signature-hit-target.mjs';
import {captureIdolHitSource,idolHitSourceMatches} from './signature-idol-source.mjs';

export const HIT_SIGNATURE_QUERY='azeroth-rpg.publishSignatureHit';
export const PERFORM_HIT_SIGNATURE_QUERY='azeroth-rpg.performSignatureHit';
const local=new Map();
const gmHere=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const targetRefs=rows=>rows.map(row=>({actorId:row.actorId??null,sceneId:row.sceneId??null,tokenId:row.tokenId??null,name:row.name??''}));
export async function prepareSignatureHitTarget({actor,weaponId,strike=null,targets=[],choose}={}){
  const idolSource=weaponId?null:captureIdolHitSource(actor,strike);
  const snapshot=idolSource?{idolSource}:{};
  const source=(actor.system.signatureEffects?.scalingHitDamage??[])
    .find(row=>row.identifier==='the-horsemans-blade'&&row.itemId===weaponId);
  if((!source&&!idolSource)||targets.length<2)return {ok:true,index:targets.length?0:-1,...snapshot};
  const pick=await choose(actor.items.get(weaponId??idolSource.activeAugmentId),targets.map((row,index)=>({
    key:String(index),name:row.name??'',description:''})),null,
    {prompt:game.i18n.localize('AZEROTH.Signature.HitTarget')});
  const index=pick?.key!==undefined?Number(pick.key):NaN;
  return validHitBonusTarget(index,targets.length)?{ok:true,index,...snapshot}:{ok:false};
}
const rollIdentity=data=>JSON.stringify({class:data?.class,formula:data?.formula,terms:data?.terms,total:data?.total,
  kind:data?.options?.kind,dc:data?.options?.dc,forcedSl:data?.options?.forcedSl,criticalOn:data?.options?.criticalOn});

/** Band remains excluded until target-specific hiding is captured. */
function candidates(actor,weaponId,roll,idolSource=null){
  if(idolSource){
    if(weaponId||!idolHitSourceMatches(actor,idolSource))return [];
    return signatureHitBonuses({...idolSource,naturalWeapon:true,weaponId:null,
      success:roll.outcome?.success===true,sl:roll.outcome?.sl});
  }
  const weapon=actor.items?.get(weaponId);
  if(!weapon||!actor.readyWeapons?.().some(row=>row===weapon))return [];
  return signatureHitBonuses({
    signatures:(actor.system.signatureEffects?.scalingHitDamage??[])
      .filter(row=>row.identifier==='the-horsemans-blade'),
    ownModifiers:{},skillRanks:actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{},
    weaponId,success:roll.outcome?.success===true,sl:roll.outcome?.sl
  });
}

/** The actor's owner remains the roller/card author. Only the active GM may
 * invoke the stored publication callback, exactly once for its request. */
export async function performSignatureHit({event,receipt}={}, {user}={}){
  const entry=local.get(event);
  if(!user?.isGM||game.users?.activeGM?.id!==user.id||!entry||entry.started
    ||receipt?.version!==1||receipt.event!==event||receipt.actorUuid!==entry.actor.uuid
    ||!Array.isArray(receipt.bonuses)||resolve(entry.actor.uuid)!==entry.actor||!entry.actor.isOwner
    ||(entry.idolSource&&!idolHitSourceMatches(entry.actor,entry.idolSource)))return {ok:false};
  entry.started=true;
  const card=await entry.publish({bonuses:receipt.bonuses,receipt,
    valid:()=>game.users?.activeGM?.id===user.id&&resolve(entry.actor.uuid)===entry.actor&&entry.actor.isOwner
      &&(!entry.idolSource||idolHitSourceMatches(entry.actor,entry.idolSource))});
  entry.card=card;
  return {ok:Boolean(card),messageUuid:card?.uuid??null};
}

export async function signatureHitQueryHandler({actorUuid,event,weaponId,idolSource=null,roll:raw,targets=[],targetIndex=-1}={}, {user}={}){
  if(!gmHere()||!user||typeof event!=='string'||!event)return {ok:false,reason:'authority'};
  const actor=resolve(actorUuid);
  if(actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER'))return {ok:false,reason:'owner'};
  if(!Array.isArray(targets)||!validHitBonusTarget(targetIndex,targets.length))return {ok:false,reason:'target'};
  let roll;
  try{roll=Roll.fromData(raw);}catch{return {ok:false,reason:'roll'};}
  if(raw?.class!=='AzerothRoll'||roll.options?.kind!=='attack'||roll.outcome?.success!==true
    ||!Number.isFinite(roll.total))return {ok:false,reason:'roll'};
  const rows=candidates(actor,weaponId,roll,idolSource);
  if(!rows.length)return {ok:false,reason:'source'};
  const valid=()=>gmHere()&&resolve(actorUuid)===actor&&actor.testUserPermission(user,'OWNER')
    &&(!idolSource||idolHitSourceMatches(actor,idolSource));
  return publishSignatureHit({actor,event,readCandidates:()=>candidates(actor,weaponId,roll,idolSource).map(row=>({...row,targetIndex})),validate:valid,
    publish:async({receipt,valid:held})=>{
      if(!held())return null;
      const response=user.id===game.user.id
        ?await performSignatureHit({event,receipt},{user:game.user})
        :await user.query(PERFORM_HIT_SIGNATURE_QUERY,{event,receipt},{timeout:180000});
      const card=response?.ok?resolve(response.messageUuid):null;
      // Publication must preserve the very roll submitted by its owner.
      if(!card||card.author?.id!==user.id||rollIdentity(card.rolls?.[0]?.toJSON())!==rollIdentity(raw))return null;
      if(idolSource&&JSON.stringify(card.flags?.['azeroth-rpg']?.strike)!==JSON.stringify(idolSource.strike))return null;
      if(JSON.stringify(targetRefs(card.flags?.['azeroth-rpg']?.targets??[]))!==JSON.stringify(targetRefs(targets)))return null;
      return card;
    }});
}

export async function routeSignatureHit({actor,roll,weaponId,idolSource=null,publish,targets=[],targetIndex=-1}){
  if(idolSource&&!idolHitSourceMatches(actor,idolSource))throw Error('Signature hit source changed during the Test');
  if(!candidates(actor,weaponId,roll,idolSource).length)return publish({bonuses:[],receipt:null,valid:()=>true});
  const gm=game.users?.activeGM;
  if(!gm)throw Error('An active GM is required for signature hit publication');
  const event=foundry.utils.randomID(),entry={actor,publish,idolSource,started:false,card:null};
  local.set(event,entry);
  try{
    const data={actorUuid:actor.uuid,event,weaponId,idolSource,roll:roll.toJSON(),targets:targetRefs(targets),targetIndex};
    const result=gmHere()?await signatureHitQueryHandler(data,{user:game.user})
      :await gm.query(HIT_SIGNATURE_QUERY,data,{timeout:240000});
    if(!result?.ok)throw Error(`Signature hit publication requires review: ${result?.reason??'uncertain'}`);
    return entry.card??resolve(result.messageUuid);
  }finally{local.delete(event);}
}
