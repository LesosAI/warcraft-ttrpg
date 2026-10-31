import {approvedSignatureValues} from './approved-signature-values.mjs';
export const JANGTHRAZE_IDENTIFIER='jangthraze-the-protector';
/** A confirmed weapon hit, including a hit absorbed by armor or Block. The
 * optional reward is not available from a pending, withdrawn or avoided hit. */
export function jangthrazeReward({identifier,itemId,weaponId,kind,success,parry,notAttack,
  hit,withdrawn,stage,preventedByDispersion,ownModifiers={}}={}){
  if(identifier!==JANGTHRAZE_IDENTIFIER||!itemId||itemId!==weaponId||kind!=='attack'
    ||success!==true||parry===true||notAttack===true||hit!==true||withdrawn===true
    ||stage!=='applied'||preventedByDispersion===true)return null;
  const values=approvedSignatureValues(identifier,{ownModifiers});
  return values?.temporaryHealth>0?values:null;
}
