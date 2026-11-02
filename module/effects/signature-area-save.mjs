import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
import {checkOutcome} from '../rules/area-ticks.mjs';
import {kindsOfActor} from './area-strikes.mjs';
import {areaTransferRefusal} from './pending-area-transfer.mjs';
const scope='azeroth-rpg';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};

/** Internal continuation of verifiedAreaTest, after its record is saved.
 * No caller-supplied damage, recipient or bonus is accepted. */
export async function deliverRecordedAreaSignature({message,result,record,user}={}){
 const area=message?.flags?.[scope]?.area;
 const original=game.messages.get(area?.signatureMessageId);
 const actor=resolve(area?.actorUuid),caster=resolve(area?.caster);
 const region=game.scenes.get(area?.sceneId)?.regions.get(area?.regionId);
 const token=region?.parent?.tokens.get(area?.tokenId);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const admitted=()=>game.user?.isGM===true&&game.users.activeGM?.id===game.user.id
  &&message?.author?.isGM===true&&actor&&caster&&original&&region&&token?.actor===actor
  &&(!message.flags?.[scope]?.signatureAreaSaveDelivery
   ||(message.flags[scope].signatureAreaSaveDelivery.state==='pending'
    &&message.flags[scope].signatureAreaSaveDelivery.writer===game.user.id
    &&message.flags[scope].signatureAreaSaveDelivery.resultId===result?.id))
  &&game.messages.get(message.id)===message&&game.messages.get(result?.id)===result
  &&actor.testUserPermission(user,'OWNER')&&result.author?.id===user?.id
  &&result.flags?.[scope]?.kind==='resilience'
  &&result.flags?.[scope]?.resistOf?.messageId===message.id
  &&message.flags[scope].areaResult?.resultId===result.id
  &&same(message.flags[scope].areaResult,record)
  &&record.success===(result.rolls?.[0]?.outcome?.success===true)
  &&record.total===result.rolls?.[0]?.total&&record.dc===result.rolls?.[0]?.options?.dc
  &&original.flags?.[scope]?.cast===area.signatureDamageCast&&area.cast===area.signatureDamageCast
  &&region.flags?.[scope]?.cast===area.cast&&region.flags[scope].caster===caster.uuid
  &&region.flags[scope].signatureDamageCast===area.cast
  &&region.flags[scope].messageId===original.id&&!areaTransferRefusal(area);
 if(!admitted())return {ok:false,reason:'saveEvidence'};
 const evidence=()=>JSON.stringify({area:message.flags[scope].area,record:message.flags[scope].areaResult,claim:message.flags[scope].signatureAreaSaveDelivery,
  roll:result.rolls[0].toJSON(),region:region.flags[scope],kinds:kindsOfActor(actor)});
 const saved=evidence();
 const outcome=checkOutcome(area.check,{success:record.success,kinds:kindsOfActor(actor)});
 if(!outcome.damage)return {ok:true,lines:[]};
 return deliverSignatureAreaDamage({message:original,caster,actor,token,spell:area.spell??{},damage:outcome.damage,
  event:`areaSave:${message.uuid}:${result.uuid}`,
  validate:()=>admitted()&&resolve(region.uuid)===region&&evidence()===saved});
}
