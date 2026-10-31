import {approvedSignatureValues} from './approved-signature-values.mjs';
export const HELMET_IDENTIFIER='horned-viking-helmet';
export function helmetHitValues({kind,success,parry,notAttack,weaponId,rangeKind,hit,withdrawn,stage,
  preventedByDispersion,ownModifiers={},skillRanks={}}={}){
  if(kind!=='attack'||success!==true||parry===true||notAttack===true||!weaponId||rangeKind!=='melee'
    ||hit!==true||withdrawn===true||stage!=='applied'||preventedByDispersion===true)return null;
  return approvedSignatureValues(HELMET_IDENTIFIER,{ownModifiers,skillRanks:{athletics:skillRanks.athletics??0}});
}
export function helmetResistance({dc,total}={}){
  if(!Number.isInteger(dc)||dc<10||!Number.isFinite(total))return null;
  return {passed:total>=dc,prone:total<dc};
}
