import {signatureRecipientKey,withoutChosenSignatureDamage} from './signature-scaling.mjs';

/** Both transfer preparation and Apply must read the same effective rows.
 * Saved cards remain immutable: only a bonus already spent by another event
 * is removed from this initial hit's pre-mitigation inputs.
 */
export function signatureApplyRows(flags,index) {
  const original={row:flags?.damageByTarget?.[index],passedRow:flags?.passedByTarget?.[index]??null,consumed:false};
  if(flags?.kind!=='spell'||!flags.chosenSignatureBonuses?.length)return original;
  const recipient=signatureRecipientKey(flags.targets?.[index]);
  if(!recipient || flags.targets.findIndex(target=>signatureRecipientKey(target)===recipient)!==index)return original;
  const bonuses=flags.chosenSignatureBonuses.filter(bonus=>bonus.recipient===recipient);
  if(!bonuses.length)return original;
  const state=flags.chosenSignatureDelivery;
  if(state?.version!==1 || state.cast!==flags.cast || !Array.isArray(state.entries))return null;
  const entries=bonuses.map(bonus=>state.entries.filter(entry=>entry.bonus?.identifier===bonus.identifier));
  if(entries.some((rows,i)=>rows.length!==1 || typeof rows[0].used!=='boolean'
    || JSON.stringify(rows[0].bonus)!==JSON.stringify(bonuses[i])))return null;
  if(entries.every(([entry])=>!entry.used))return original;
  if(entries.some(([entry])=>!entry.used || entry.pending))return null;
  const row=withoutChosenSignatureDamage(original.row,bonuses);
  const passedRow=original.passedRow ? withoutChosenSignatureDamage(original.passedRow,bonuses) : null;
  if(!row || (original.passedRow && !passedRow))return null;
  return {row,passedRow,consumed:true};
}
