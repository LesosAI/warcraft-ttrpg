import {stolenRegionGeometry} from './sustain-region-geometry.mjs';
import {sustainRegionTransferPending} from './sustain-region-suspension.mjs';
import {DIFFICULT_BEHAVIOR} from './area-ground.mjs';
const id=value=>typeof value==='string'&&value.trim().length>0;

/** Plan creation of an inert destination from the exact suspended source.
 * No document writes: the coordinator must validate destination occupancy,
 * actor/token identity and source snapshots again at the write boundary.
 */
export function sustainRegionRelocation({region,receipt,destinationSceneId,destinationId,sourceScale,targetScale,target}={}){
 const fail=reason=>({ok:false,reason});
 const f=region?.flags?.['azeroth-rpg'],m=f?.sustainRegionTransfer;
 if(!sustainRegionTransferPending(region)||receipt?.version!==1||receipt.state!=='claimed'
  ||receipt.attempted!=='relocateCarriers'||JSON.stringify(receipt.completed)!==JSON.stringify(['holdRecipient'])
  ||['transactionId','cast','casterUuid','recipientUuid'].some(key=>m[key]!==receipt[key])
  ||region.uuid!==m.sourceUuid||f.caster!==receipt.casterUuid)return fail('claim');
 if(!id(destinationSceneId)||!id(destinationId)||!id(target?.tokenId)
  ||m.destinationUuid!==`Scene.${destinationSceneId}.Region.${destinationId}`)return fail('destination');
 if(region.restriction?.enabled!==false||!Array.isArray(region.behaviors)
  ||region.behaviors.some(b=>b.disabled!==true)||region.behaviors.length!==m.behaviors.length
  ||region.behaviors.some(b=>!m.behaviors.some(saved=>saved._id===b._id)))return fail('notSuspended');
 // Unknown/script behaviors may carry hidden references or executable side effects.
 if(region.behaviors.some(b=>b.type!==DIFFICULT_BEHAVIOR
  ||(b.system?.caster!=null&&b.system.caster!==receipt.casterUuid)))return fail('behaviorHandler');
 const geometry=stolenRegionGeometry({region,sourceScale,targetScale,target});
 if(!geometry.ok)return geometry;
 const data=structuredClone(region);
 for(const key of ['uuid','parentUuid','_stats'])delete data[key];
 Object.assign(data,geometry.patch,{_id:destinationId});
 data.flags['azeroth-rpg']={...data.flags['azeroth-rpg'],caster:receipt.recipientUuid,
  source:{sceneId:destinationSceneId,tokenId:target.tokenId}};
 for(const behavior of data.behaviors){delete behavior._stats;behavior.system={...behavior.system,caster:receipt.recipientUuid};}
 return {ok:true,source:{uuid:region.uuid,expected:structuredClone(region)},
  destination:{uuid:m.destinationUuid,parentUuid:`Scene.${destinationSceneId}`,id:destinationId,data}};
}
