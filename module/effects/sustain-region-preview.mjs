import { sustainRegionStagePlans } from '../rules/sustain-region-stage-plans.mjs';

/** Capture native placement without writing. The stage writers revalidate it
 * after payment and before creating or removing any Region. */
export function previewSustainRegions({inventory,recipient,source,allocateId}) {
  if (!inventory.regions.length) return {ok:true,regionTransfers:[]};
  const fail=reason=>({ok:false,reason});
  const scene=source?.sceneId ? fromUuidSync(`Scene.${source.sceneId}`) : null;
  const token=scene?.tokens?.get(source?.tokenId);
  if(scene?.documentName!=='Scene'||token?.documentName!=='Token'
    ||token.parent!==scene||token.actor!==recipient)return fail('regionRecipient');
  const point=token.getCenterPoint();
  const target={x:point.x,y:point.y,elevation:point.elevation,
    levels:token.level ? [token.level] : [],tokenId:token.id};
  const regionTransfers=[];
  for(const region of inventory.regions){
    const originalScene=fromUuidSync(region.parentUuid);
    if(originalScene?.documentName!=='Scene')return fail('regionSource');
    const destinationId=allocateId();
    if(scene.regions.get(destinationId))return fail('destinationOccupied');
    regionTransfers.push({sourceUuid:region.uuid,destinationSceneId:scene.id,destinationId,
      sourceScale:originalScene.grid.size/originalScene.grid.distance,
      targetScale:scene.grid.size/scene.grid.distance,target:structuredClone(target)});
  }
  // Run the same pure planner the durable stages use. The placeholder claim is
  // only for validation; no receipt or suspended snapshot leaves this preview.
  const checked=sustainRegionStagePlans({inventory,regionTransfers,transactionId:'preview',
    cast:inventory.cast,casterUuid:inventory.casterUuid,recipientUuid:recipient.uuid,
    recipientEntry:{source}});
  return checked.ok ? {ok:true,regionTransfers} : checked;
}
