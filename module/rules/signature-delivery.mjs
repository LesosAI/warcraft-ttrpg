/** Pure once-per-casting state for a chosen signature bonus. Runtime writers
 * must serialize claim/persist/deliver/finish on the active GM. A claim left by
 * an interrupted write blocks automatic replay; it is not evidence of delivery.
 */
const key=value=>typeof value==='string'&&value.length>0;
const copy=value=>structuredClone(value);

/** True/false only when the original target and every transferred share have
 * completed. Missing or interrupted receipts are not proof of zero damage.
 * Transfers cannot chain under the approved rules; reject nested transfers.
 */
export function signatureDamageOutcome(outcome) {
  if(outcome?.complete!==true || typeof outcome.dealtDamage!=='boolean')return null;
  if(outcome.transferred===false)return outcome.dealtDamage;
  if(outcome.transferred!==true || !Array.isArray(outcome.transfers) || !outcome.transfers.length)return null;
  if(outcome.transfers.some(share=>share?.complete!==true || share.transferred!==false || typeof share.dealtDamage!=='boolean'))return null;
  return outcome.dealtDamage || outcome.transfers.some(share=>share.dealtDamage);
}

export function signatureDeliverySeed({cast,bonuses=[]}={}) {
  if(!key(cast)||!Array.isArray(bonuses))return null;
  const seen=new Set();
  for(const bonus of bonuses){
    if(!key(bonus?.identifier)||!key(bonus?.recipient)||!Number.isInteger(bonus?.amount)||bonus.amount<=0
      ||!key(bonus.school)||seen.has(bonus.identifier))return null;
    seen.add(bonus.identifier);
  }
  return {version:1,cast,entries:bonuses.map(bonus=>({bonus:copy(bonus),used:false,pending:null,emptyEvents:[]}))};
}

/** One event may claim every distinct signature selected for its recipient.
 * An interrupted claim blocks the whole recipient rather than allowing a
 * different effect to slip into an unresolved damage write.
 */
export function claimSignatureDelivery(state,{cast,recipient,event,writer}={}) {
  if(state?.version!==1||state.cast!==cast||!key(recipient)||!key(event)||!key(writer)||!Array.isArray(state.entries))return null;
  const rows=state.entries.filter(row=>row.bonus.recipient===recipient);
  if(rows.some(row=>row.pending))return null;
  const eligible=rows.filter(row=>!row.used&&!row.emptyEvents.includes(event));
  if(!eligible.length)return null;
  const next=copy(state),identifiers=eligible.map(row=>row.bonus.identifier);
  for(const row of next.entries)if(identifiers.includes(row.bonus.identifier))row.pending={event,writer};
  return {state:next,bonuses:eligible.map(row=>copy(row.bonus))};
}

/** Finish only the exact writer/event claim. A mitigated-to-zero event releases
 * the bonus for a later distinct event, but cannot repeatedly retry itself.
 */
export function finishSignatureDelivery(state,{cast,event,writer,dealtDamage}={}) {
  if(state?.version!==1||state.cast!==cast||!key(event)||!key(writer)||typeof dealtDamage!=='boolean'||!Array.isArray(state.entries))return null;
  const matching=state.entries.filter(row=>row.pending?.event===event);
  if(!matching.length||matching.some(row=>row.pending.writer!==writer))return null;
  const next=copy(state);
  for(const row of next.entries){
    if(row.pending?.event!==event)continue;
    row.pending=null;
    if(dealtDamage)row.used=true;
    else row.emptyEvents.push(event);
  }
  return next;
}
