import {approvedSignatureValues} from './approved-signature-values.mjs';
export function parrySignatureBonus({signatures=[],ranks={}}={}){
 const source=signatures.find(row=>row.identifier==='conquerors-battlegear'&&row.itemId);
 if(!source)return null;
 const value=approvedSignatureValues(source.identifier,{skillRanks:{warfare:ranks.warfare??0}});
 return value?{...source,amount:value.parryTest}:null;
}
