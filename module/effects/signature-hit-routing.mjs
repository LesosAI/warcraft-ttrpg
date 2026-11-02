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
export async function prepareSignatureHitTarget({actor,weaponId,strike=null,targets=[],chosen=[],choose}={}){
  const idolSource=weaponId?null:captureIdolHitSource(actor,strike);
  const snapshot=idolSource?{idolSource}:{};
  const source=(actor.system.signatureEffects?.scalingHitDamage??[])
    .find(row=>row.identifier==='the-horsemans-blade'&&row.itemId===weaponId);
  if(source)snapshot.bladeSource={itemId:weaponId,signature:structuredClone(source),ranks:intimidationRanks(actor)};
  const band=weaponId&&(actor.system.signatureEffects?.scalingHitDamage??[]).find(row=>row.identifier==='band-of-veiled-shadows');
  const eligible=targets.map((row,index)=>({row,index})).filter(({index})=>source||idolSource||band&&chosen.includes(`signature-band-hidden-${index}`));
  const finish=index=>({ok:true,index,...snapshot,...(band&&index>=0&&chosen.includes(`signature-band-hidden-${index}`)?{
    bandSource:{itemId:band.itemId,ranks:stealthRanks(actor),target:targetRefs([targets[index]])[0]}
  }:{})});
  if(!eligible.length)return finish(targets.length?0:-1);
  if(eligible.length===1)return finish(eligible[0].index);
  const pick=await choose(actor.items.get(weaponId??idolSource?.activeAugmentId??band.itemId),eligible.map(({row,index})=>({
    key:String(index),name:row.name??'',description:''})),null,
    {prompt:game.i18n.localize('AZEROTH.Signature.HitTarget')});
  const index=pick?.key!==undefined?Number(pick.key):NaN;
  return eligible.some(row=>row.index===index)?finish(index):{ok:false};
}
const stealthRanks=actor=>Number((actor.type==='npc'?actor.system.skills:actor.getFlag('azeroth-rpg','skillRanks'))?.stealth??0);
const intimidationRanks=actor=>Number((actor.type==='npc'?actor.system.skills:actor.getFlag('azeroth-rpg','skillRanks'))?.intimidation??0);
const bladeMatches=(actor,source,weaponId)=>!source||Boolean(source.itemId===weaponId
  &&actor.readyWeapons?.().includes(actor.items?.get(weaponId))
  &&source.ranks===intimidationRanks(actor)
  &&JSON.stringify(source.signature)===JSON.stringify((actor.system.signatureEffects?.scalingHitDamage??[])
    .find(row=>row.identifier==='the-horsemans-blade'&&row.itemId===weaponId)));
const bandMatches=(actor,band,targets,index)=>!band||Boolean(
  (actor.system.signatureEffects?.scalingHitDamage??[]).some(row=>row.identifier==='band-of-veiled-shadows'&&row.itemId===band.itemId)
  &&stealthRanks(actor)===band.ranks&&targets[index]
  &&JSON.stringify(targetRefs([targets[index]])[0])===JSON.stringify(band.target));
const rollIdentity=data=>JSON.stringify({class:data?.class,formula:data?.formula,terms:data?.terms,total:data?.total,
  kind:data?.options?.kind,dc:data?.options?.dc,forcedSl:data?.options?.forcedSl,criticalOn:data?.options?.criticalOn});

function candidates(actor,weaponId,roll,idolSource=null,bandSource=null){
  if(idolSource){
    if(weaponId||!idolHitSourceMatches(actor,idolSource))return [];
    return signatureHitBonuses({...idolSource,naturalWeapon:true,weaponId:null,
      success:roll.outcome?.success===true,sl:roll.outcome?.sl});
  }
  const weapon=actor.items?.get(weaponId);
  if(!weapon||!actor.readyWeapons?.().some(row=>row===weapon))return [];
  return signatureHitBonuses({
    signatures:(actor.system.signatureEffects?.scalingHitDamage??[])
      .filter(row=>row.identifier==='the-horsemans-blade'||bandSource&&row.identifier==='band-of-veiled-shadows'&&row.itemId===bandSource.itemId),
    ownModifiers:{},skillRanks:actor.type==='npc'?actor.system.skills??{}:actor.getFlag('azeroth-rpg','skillRanks')??{},
    weaponId,hiddenFromTarget:Boolean(bandSource),success:roll.outcome?.success===true,sl:roll.outcome?.sl
  });
}

/** The actor's owner remains the roller/card author. Only the active GM may
 * invoke the stored publication callback, exactly once for its request. */
export async function performSignatureHit({event,receipt}={}, {user}={}){
  const entry=local.get(event);
  if(!user?.isGM||game.users?.activeGM?.id!==user.id||!entry||entry.started
    ||receipt?.version!==1||receipt.event!==event||receipt.actorUuid!==entry.actor.uuid
    ||!Array.isArray(receipt.bonuses)||resolve(entry.actor.uuid)!==entry.actor||!entry.actor.isOwner
    ||(entry.idolSource&&!idolHitSourceMatches(entry.actor,entry.idolSource))
    ||!bladeMatches(entry.actor,entry.bladeSource,entry.weaponId))return {ok:false};
  entry.started=true;
  const card=await entry.publish({bonuses:receipt.bonuses,receipt,
    valid:()=>game.users?.activeGM?.id===user.id&&resolve(entry.actor.uuid)===entry.actor&&entry.actor.isOwner
      &&(!entry.idolSource||idolHitSourceMatches(entry.actor,entry.idolSource))
      &&bladeMatches(entry.actor,entry.bladeSource,entry.weaponId)});
  entry.card=card;
  return {ok:Boolean(card),messageUuid:card?.uuid??null};
}

export async function signatureHitQueryHandler({actorUuid,event,weaponId,idolSource=null,bandSource=null,bladeSource=null,roll:raw,targets=[],targetIndex=-1}={}, {user}={}){
  if(!gmHere()||!user||typeof event!=='string'||!event)return {ok:false,reason:'authority'};
  const actor=resolve(actorUuid);
  if(actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER'))return {ok:false,reason:'owner'};
  if(!Array.isArray(targets)||!validHitBonusTarget(targetIndex,targets.length))return {ok:false,reason:'target'};
  if(!bandMatches(actor,bandSource,targets,targetIndex))return {ok:false,reason:'source'};
  if(!bladeMatches(actor,bladeSource,weaponId))return {ok:false,reason:'source'};
  let roll;
  try{roll=Roll.fromData(raw);}catch{return {ok:false,reason:'roll'};}
  if(raw?.class!=='AzerothRoll'||roll.options?.kind!=='attack'||roll.outcome?.success!==true
    ||!Number.isFinite(roll.total))return {ok:false,reason:'roll'};
  const rows=candidates(actor,weaponId,roll,idolSource,bandSource);
  if(!rows.length)return {ok:false,reason:'source'};
  const valid=()=>gmHere()&&resolve(actorUuid)===actor&&actor.testUserPermission(user,'OWNER')
    &&(!idolSource||idolHitSourceMatches(actor,idolSource))&&bandMatches(actor,bandSource,targets,targetIndex)
    &&bladeMatches(actor,bladeSource,weaponId);
  return publishSignatureHit({actor,event,readCandidates:()=>candidates(actor,weaponId,roll,idolSource,bandSource).map(row=>({...row,targetIndex,
    ...(row.identifier==='band-of-veiled-shadows'?{hiddenFromTarget:true}:{})})),validate:valid,
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

export async function routeSignatureHit({actor,roll,weaponId,idolSource=null,bandSource=null,bladeSource=null,publish,targets=[],targetIndex=-1}){
  if(idolSource&&!idolHitSourceMatches(actor,idolSource))throw Error('Signature hit source changed during the Test');
  if(!bandMatches(actor,bandSource,targets,targetIndex))throw Error('Band source or confirmed target changed during the Test');
  if(!bladeMatches(actor,bladeSource,weaponId))throw Error('Horseman source changed during the Test');
  if(!candidates(actor,weaponId,roll,idolSource,bandSource).length)return publish({bonuses:[],receipt:null,valid:()=>true});
  const gm=game.users?.activeGM;
  if(!gm)throw Error('An active GM is required for signature hit publication');
  const event=foundry.utils.randomID(),entry={actor,publish,idolSource,bladeSource,weaponId,started:false,card:null};
  local.set(event,entry);
  try{
    const data={actorUuid:actor.uuid,event,weaponId,idolSource,bandSource,bladeSource,roll:roll.toJSON(),targets:targetRefs(targets),targetIndex};
    const result=gmHere()?await signatureHitQueryHandler(data,{user:game.user})
      :await gm.query(HIT_SIGNATURE_QUERY,data,{timeout:240000});
    if(!result?.ok)throw Error(`Signature hit publication requires review: ${result?.reason??'uncertain'}`);
    return entry.card??resolve(result.messageUuid);
  }finally{local.delete(event);}
}
