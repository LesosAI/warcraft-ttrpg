import { suspendSustainTransferRegion } from './sustain-region-suspension.mjs';
import { sustainRegionRelocation } from './sustain-region-relocation.mjs';

/** Derive every Region stage from one immutable inventory and transaction.
 * These are expected snapshots, not permission to write. Each stage writer
 * still validates its actual durable receipt, actors, scene and token.
 */
export function sustainRegionStagePlans(plan) {
  const fail=reason=>({ok:false,reason});
  const originals=plan?.inventory?.regions,transfers=plan?.regionTransfers ?? [];
  if(!Array.isArray(originals)||!Array.isArray(transfers)||originals.length!==transfers.length)
    return fail('regionInventory');
  if(!originals.length)return {ok:true,regions:[]};
  const fields=['transactionId','cast','casterUuid','recipientUuid'];
  if(fields.some(key=>typeof plan[key]!=='string'||!plan[key].trim())
    ||plan.casterUuid===plan.recipientUuid||plan.inventory.casterUuid!==plan.casterUuid
    ||plan.inventory.cast!==plan.cast)return fail('regionClaim');
  const receipt={version:1,state:'claimed',...Object.fromEntries(fields.map(key=>[key,plan[key]])),
    attempted:'holdRecipient',completed:[]};
  const seenSources=new Set(),seenDestinations=new Set(),regions=[];
  for(const transfer of transfers){
    const matches=originals.filter(row=>row.uuid===transfer?.sourceUuid);
    if(matches.length!==1||seenSources.has(transfer.sourceUuid))return fail('regionSource');
    const original=structuredClone(matches[0]);
    if(original.uuid!==`${original.parentUuid}.Region.${original._id}`)return fail('regionSource');
    const destinationUuid=`Scene.${transfer.destinationSceneId}.Region.${transfer.destinationId}`;
    if(seenDestinations.has(destinationUuid)||originals.some(row=>row.uuid===destinationUuid))return fail('regionDestination');
    if(plan.recipientEntry?.source?.sceneId!==transfer.destinationSceneId
      ||plan.recipientEntry.source.tokenId!==transfer.target?.tokenId)return fail('regionRecipient');
    const hold=suspendSustainTransferRegion({region:original,receipt,destinationUuid});
    if(!hold.ok)return hold;
    const held=structuredClone(original);
    held.restriction.enabled=false;
    held.flags['azeroth-rpg'].sustainRegionTransfer=hold.regionPatch['flags.azeroth-rpg.sustainRegionTransfer'];
    for(const behavior of held.behaviors)behavior.disabled=true;
    const input={region:held,receipt:{...receipt,attempted:'relocateCarriers',completed:['holdRecipient']},
      destinationSceneId:transfer.destinationSceneId,destinationId:transfer.destinationId,
      sourceScale:transfer.sourceScale,targetScale:transfer.targetScale,target:structuredClone(transfer.target)};
    const relocation=sustainRegionRelocation(input);
    if(!relocation.ok)return relocation;
    regions.push({original,hold,held,input,relocation,destination:{...relocation.destination.data,
      uuid:relocation.destination.uuid,parentUuid:relocation.destination.parentUuid}});
    seenSources.add(original.uuid);seenDestinations.add(destinationUuid);
  }
  return {ok:true,regions};
}
