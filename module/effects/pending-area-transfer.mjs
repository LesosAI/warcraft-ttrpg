import {sustainRegionTransferPending} from '../rules/sustain-region-suspension.mjs';

/** Read the live Region referenced by a previously posted area card. */
export function pendingAreaTransfer(area){
 if(!area?.sceneId||!area?.regionId||!area?.cast)return false;
 const region=game.scenes?.get(area.sceneId)?.regions?.get(area.regionId);
 return region?.flags?.['azeroth-rpg']?.cast===area.cast&&sustainRegionTransferPending(region);
}

/** A deleted source has no pending marker. Its durable transfer plan still
 * identifies the retired card, including after activation or GM recovery. */
export function areaTransferRefusal(area){
 if(pendingAreaTransfer(area))return 'AZEROTH.AreaTest.Pending';
 if(!area?.sceneId||!area?.regionId||!area?.cast||!area?.caster)return null;
 const region=game.scenes?.get(area.sceneId)?.regions?.get(area.regionId);
 if(region?.flags?.['azeroth-rpg']?.cast===area.cast)return null;
 let caster;
 try{caster=fromUuidSync(area.caster);}catch{return null;}
 const rows=caster?.getFlag?.('azeroth-rpg','spellstealTransfers');
 if(!Array.isArray(rows))return null;
 const sourceUuid=`Scene.${area.sceneId}.Region.${area.regionId}`;
 return rows.some(row=>row.delivery?.casterUuid===area.caster
  &&row.delivery?.cast===area.cast
  &&row.delivery?.plan?.inventory?.regions?.some(source=>source.uuid===sourceUuid))
  ?'AZEROTH.AreaTest.Transferred':null;
}
