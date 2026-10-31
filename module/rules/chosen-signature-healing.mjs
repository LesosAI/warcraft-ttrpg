import {approvedSignatureValues} from './approved-signature-values.mjs';
import {signatureTurnIdentity} from './signature-turn-uses.mjs';
const HEALERS=new Set(['mace-of-unending-life','cloak-of-unending-life','libram-of-hope']);
/** Inputs have already passed equipped-item and signature gates. The libram
 * also requires the spell's granting class, not merely a Paladin multiclass. */
export function chosenHealingOptions({signatures=[],ownModifiers={},grantingClass=null}={}){
 const options=[],seen=new Set();
 for(const source of signatures){
  if(!HEALERS.has(source?.identifier)||!source.itemId)continue;
  if(source.identifier==='libram-of-hope'&&grantingClass!=='Paladin')continue;
  const identity=signatureTurnIdentity(source.identifier);
  if(seen.has(identity))continue;
  const amount=approvedSignatureValues(source.identifier,{ownModifiers})?.healing;
  if(!Number.isInteger(amount)||amount<=0)continue;
  seen.add(identity);options.push({...source,identity,amount});
 }
 return options;
}
