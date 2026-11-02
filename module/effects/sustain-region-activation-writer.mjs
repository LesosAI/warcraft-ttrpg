import {releaseSustainTransferRegion} from '../rules/sustain-region-suspension.mjs';
import {releaseSustainTransferEntry} from '../rules/sustain-entry-transfer.mjs';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).filter(key=>key!=='_stats').sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const snapshot=region=>({...region.toObject(),uuid:region.uuid,parentUuid:region.parent.uuid});

/** Internal finalization after the recipient hold becomes active. The coordinator
 * must persist activation.pending first; failure requires review, never replay.
 */
export async function writeSustainRegionActivation({region:expected,receipt,entry,validate}={}){
 if(typeof validate!=='function'||receipt?.activation?.state!=='pending')throw Error('Missing Region activation claim');
 expected=structuredClone(expected);receipt=structuredClone(receipt);entry=structuredClone(entry);
 const release=releaseSustainTransferRegion({region:expected,receipt,entry});
 const held=releaseSustainTransferEntry({entry,ownerUuid:receipt.recipientUuid,receipt});
 if(!release.ok||!held.ok)throw Error('Incomplete Region transfer');
 const sourceUuid=expected.flags['azeroth-rpg'].sustainRegionTransfer.sourceUuid;
 const region=fromUuidSync(expected.uuid),actor=fromUuidSync(receipt.recipientUuid);
 const check=async()=>{
  if(await validate()!==true||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id)throw Error('Region activation authority changed');
  const entries=actor?.getFlag?.('azeroth-rpg','sustaining');
  if(actor?.documentName!=='Actor'||fromUuidSync(actor.uuid)!==actor||!Array.isArray(entries)
   ||entries.filter(row=>row.cast===receipt.cast).length!==1||!same(entries.find(row=>row.cast===receipt.cast),held.entry)
   ||fromUuidSync(sourceUuid))throw Error('Region activation hold changed');
  if(region?.documentName!=='Region'||fromUuidSync(expected.uuid)!==region||!same(snapshot(region),expected))throw Error('Region activation source changed');
 };
 await check();
 // Embedded behaviors and the Region marker change in one parent update.
 await region.update({...release.regionPatch,behaviors:release.behaviorUpdates});
 expected.restriction.enabled=release.regionPatch['restriction.enabled'];expected.flags['azeroth-rpg'].sustainRegionTransfer=null;
 for(const change of release.behaviorUpdates)Object.assign(expected.behaviors.find(row=>row._id===change._id),change);
 await check();
 return {activated:region.uuid,snapshot:expected};
}
