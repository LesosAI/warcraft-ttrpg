import {approvedSignatureValues} from './approved-signature-values.mjs';
export const PICCOLO_IDENTIFIER='piccolo-of-the-flaming-fire';
export const PICCOLO_RANGE=15;

/** Eligibility is explicit: runtime resolves hearing and token distance.
 * Null distance preserves the existing off-map range judgment convention. */
export function piccoloRecipient(target){
  if(typeof target?.uuid!=='string'||!target.uuid)return {ok:false,reason:'target'};
  if(target.canHear!==true)return {ok:false,reason:'hearing'};
  if(target.distance!==null&&(!Number.isFinite(target.distance)||target.distance<0||target.distance>PICCOLO_RANGE))
    return {ok:false,reason:'range'};
  return {ok:true,target:{uuid:target.uuid,rangeMeasured:target.distance!==null}};
}

/** Validate the whole explicit selection before any Half-Action or rest use.
 * Never truncate an over-limit selection or silently drop an ineligible target. */
export function piccoloPerformance({ownModifiers={},skillRanks={},targets=[]}={}){
  const values=approvedSignatureValues(PICCOLO_IDENTIFIER,{ownModifiers,
    skillRanks:{performance:skillRanks.performance??0}});
  if(!values)return {ok:false,reason:'values'};
  if(!Array.isArray(targets)||!targets.length)return {ok:false,reason:'empty'};
  if(targets.length>values.targets)return {ok:false,reason:'limit'};
  const selected=[];
  for(const target of targets){
    const judged=piccoloRecipient(target);
    if(!judged.ok)return judged;
    if(selected.some(row=>row.uuid===judged.target.uuid))return {ok:false,reason:'duplicate'};
    selected.push(judged.target);
  }
  return {ok:true,performance:{version:1,identifier:PICCOLO_IDENTIFIER,
    dc:values.dc,resilience:'spirit',range:PICCOLO_RANGE,targets:selected}};
}

/** One saved recipient's actual Spirit Test. The runtime owns the next-Attack
 * consumption, end-of-next-turn expiry and per-recipient delivery receipt. */
export function piccoloResistance(performance,{targetUuid,total}={}){
  if(performance?.version!==1||performance.identifier!==PICCOLO_IDENTIFIER
    ||!Number.isInteger(performance.dc)||performance.dc<10||!Number.isFinite(total)
    ||!performance.targets?.some(row=>row.uuid===targetUuid))return null;
  const passed=total>=performance.dc;
  return {passed,attackBanes:passed?0:1,expires:'endOfNextTurn'};
}
