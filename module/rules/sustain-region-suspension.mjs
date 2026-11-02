/** Pure Region suspension plans. Writers must apply these under the transfer
 * coordinator; tick/lifecycle readers must also honor the marker before Region
 * transfer can be enabled. Behavior updates are separate embedded-document writes.
 */
import {releaseSustainTransferEntry} from './sustain-entry-transfer.mjs';
const scope='azeroth-rpg',key='sustainRegionTransfer';
const id=value=>typeof value==='string'&&value.trim().length>0;
const fields=['transactionId','cast','casterUuid','recipientUuid'];
const flags=region=>region?.flags?.[scope];
const behaviors=region=>Array.isArray(region?.behaviors)?region.behaviors:null;
const validBehaviors=rows=>Array.isArray(rows)&&rows.every(row=>id(row._id)&&typeof row.disabled==='boolean')
 &&new Set(rows.map(row=>row._id)).size===rows.length;

export function sustainRegionTransferPending(region){
 const f=flags(region),m=f?.[key];
 return Boolean(f?.sustained===true&&m?.version===1&&fields.every(k=>id(m[k]))
  &&m.casterUuid!==m.recipientUuid&&f.cast===m.cast&&[m.casterUuid,m.recipientUuid].includes(f.caster)
  &&id(m.sourceUuid)&&id(m.destinationUuid)&&m.sourceUuid!==m.destinationUuid
  &&[m.sourceUuid,m.destinationUuid].includes(region.uuid)&&typeof m.restrictionBefore==='boolean'
  &&validBehaviors(m.behaviors));
}

export function suspendSustainTransferRegion({region,receipt,destinationUuid}={}){
 const f=flags(region),old=f?.[key];
 if(receipt?.version!==1||receipt.state!=='claimed'||!fields.every(k=>id(receipt[k]))
  ||receipt.casterUuid===receipt.recipientUuid||f?.sustained!==true||f.cast!==receipt.cast
  ||f.caster!==receipt.casterUuid||!id(region.uuid)||!id(destinationUuid)||region.uuid===destinationUuid
  ||!validBehaviors(behaviors(region))||typeof region.restriction?.enabled!=='boolean')return {ok:false,reason:'claim'};
 if(old!=null&&(!sustainRegionTransferPending(region)||fields.some(k=>old[k]!==receipt[k])
  ||old.sourceUuid!==region.uuid||old.destinationUuid!==destinationUuid))return {ok:false,reason:'otherClaim'};
 const marker=old??{version:1,...Object.fromEntries(fields.map(k=>[k,receipt[k]])),sourceUuid:region.uuid,destinationUuid,
  restrictionBefore:region.restriction.enabled,behaviors:region.behaviors.map(row=>({_id:row._id,disabled:row.disabled}))};
 if(region.behaviors.length!==marker.behaviors.length||region.behaviors.some(row=>!marker.behaviors.some(saved=>saved._id===row._id)))return {ok:false,reason:'changedBehaviors'};
 return {ok:true,regionPatch:{'restriction.enabled':false,[`flags.${scope}.${key}`]:structuredClone(marker)},
  behaviorUpdates:region.behaviors.map(row=>({_id:row._id,disabled:true}))};
}

export function releaseSustainTransferRegion({region,receipt,entry}={}){
 const m=flags(region)?.[key];
 if(!sustainRegionTransferPending(region)||!releaseSustainTransferEntry({entry,ownerUuid:receipt?.recipientUuid,receipt}).ok
  ||fields.some(k=>m[k]!==receipt[k])||region.uuid!==m.destinationUuid||flags(region).caster!==receipt.recipientUuid
  ||!validBehaviors(behaviors(region))||region.behaviors.length!==m.behaviors.length
  ||region.behaviors.some(row=>!m.behaviors.some(saved=>saved._id===row._id)))return {ok:false,reason:'incomplete'};
 return {ok:true,regionPatch:{'restriction.enabled':m.restrictionBefore,[`flags.${scope}.${key}`]:null},
  behaviorUpdates:structuredClone(m.behaviors)};
}
