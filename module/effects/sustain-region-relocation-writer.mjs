import {sustainRegionRelocation} from '../rules/sustain-region-relocation.mjs';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).filter(key=>key!=='_stats').sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const snapshot=region=>({...region.toObject(),uuid:region.uuid,parentUuid:region.parent.uuid});

/** Internal stage. The caller must have persisted the attempted relocation and
 * supply whole-transaction validation. No retry/rollback on uncertain writes.
 */
export async function writeSustainRegionRelocation({input,validate}={}){
 if(typeof validate!=='function')throw Error('Missing Region transfer validation');
 input=structuredClone(input);
 const move=sustainRegionRelocation(input);
 if(!move.ok)throw Error(`Invalid Region relocation: ${move.reason}`);
 const scene=fromUuidSync(move.destination.parentUuid),source=fromUuidSync(move.source.uuid);
 let sourceExpected=move.source.expected,destinationExpected=null;
 const check=async()=>{
  if(await validate()!==true||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id)throw Error('Region transfer authority changed');
  if(scene?.documentName!=='Scene'||fromUuidSync(scene.uuid)!==scene
   ||scene.tokens?.get(input.target.tokenId)?.actor?.uuid!==input.receipt.recipientUuid)throw Error('Region destination changed');
  const point=scene.tokens.get(input.target.tokenId).getCenterPoint?.();
  if(!point||['x','y','elevation'].some(key=>point[key]!==input.target[key])
   ||!same(scene.tokens.get(input.target.tokenId).level ? [scene.tokens.get(input.target.tokenId).level] : [],input.target.levels)
   ||scene.grid?.size/scene.grid?.distance!==input.targetScale
   ||source?.parent?.grid?.size/source?.parent?.grid?.distance!==input.sourceScale)
    throw Error('Region placement changed');
  const currentSource=fromUuidSync(move.source.uuid),currentDestination=fromUuidSync(move.destination.uuid);
  if(sourceExpected===null?currentSource!=null:currentSource!==source||source?.documentName!=='Region'||!same(snapshot(source),sourceExpected))throw Error('Region source changed');
  if(destinationExpected===null?currentDestination!=null:currentDestination?.documentName!=='Region'||!same(snapshot(currentDestination),destinationExpected))throw Error('Region destination changed');
 };
 await check();
 await scene.createEmbeddedDocuments('Region',[move.destination.data],{keepId:true,keepEmbeddedIds:true});
 destinationExpected={...move.destination.data,uuid:move.destination.uuid,parentUuid:scene.uuid};
 await check();
 // The source retains its pending marker, suppressing delete-to-end-Sustain.
 await source.delete();sourceExpected=null;
 await check();
 return {relocated:move.destination.uuid,removed:move.source.uuid,snapshot:destinationExpected};
}
