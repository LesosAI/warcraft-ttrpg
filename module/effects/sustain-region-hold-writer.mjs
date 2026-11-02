import {suspendSustainTransferRegion} from '../rules/sustain-region-suspension.mjs';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).filter(key=>key!=='_stats').sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const snapshot=region=>({...region.toObject(),uuid:region.uuid,parentUuid:region.parent.uuid});

/** Internal coordinator stage only. Record the marker before disabling behaviors;
 * any failure leaves durable pending state for explicit recovery, never rollback.
 */
export async function writeSustainRegionHold({region:source,destinationUuid,receipt,validate}={}){
 if(typeof validate!=='function'||receipt?.attempted!=='holdRecipient'||!same(receipt.completed,[]))throw Error('Invalid Region hold claim');
 receipt=structuredClone(receipt);
 let expected=structuredClone(source);
 const planned=suspendSustainTransferRegion({region:expected,receipt,destinationUuid});
 if(!planned.ok)throw Error('Invalid Region suspension plan');
 const region=fromUuidSync(expected.uuid);
 const check=async()=>{
  if(await validate()!==true||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id)throw Error('Region transfer authority changed');
  if(region?.documentName!=='Region'||fromUuidSync(expected.uuid)!==region||!same(snapshot(region),expected))throw Error('Region transfer source changed');
 };
 await check();
 await region.update(planned.regionPatch);
 expected.restriction.enabled=false;
 expected.flags['azeroth-rpg'].sustainRegionTransfer=structuredClone(planned.regionPatch['flags.azeroth-rpg.sustainRegionTransfer']);
 await check();
 if(planned.behaviorUpdates.length){
  await region.updateEmbeddedDocuments('RegionBehavior',planned.behaviorUpdates);
  expected.behaviors=expected.behaviors.map(row=>({...row,disabled:true}));
  await check();
 }
 return {suspended:region.uuid,snapshot:expected};
}
