import {signatureTurnIdentity} from './signature-turn-uses.mjs';

/** Undo only the expenditure bearing THIS attack event. A newer use or a
 * pending delivery is never overwritten. The previous value comes from the
 * authenticated publication receipt, captured while the allowance was locked.
 */
export function withdrawHitSignatureTurns(records,{event,identifiers=[],previous={}}={}){
  if(!records||typeof records!=='object'||Array.isArray(records)||typeof event!=='string'||!event)return null;
  const next=structuredClone(records),restored=[];
  for(const identifier of new Set(identifiers)){
    const id=signatureTurnIdentity(identifier),record=records[id];
    if(!id||record?.version!==1||record.pending||record.last?.event!==event)continue;
    if(!Object.hasOwn(previous,id))return null;
    const prior=previous[id];
    if(prior!==null&&(!prior||!Number.isFinite(prior.now)||prior.now<0
      ||!Object.hasOwn(prior,'combat')||!Object.hasOwn(prior,'turn')))return null;
    next[id]={version:1,last:structuredClone(prior),pending:null};
    restored.push(id);
  }
  return {records:next,restored};
}
