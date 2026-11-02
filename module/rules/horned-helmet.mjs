import {approvedSignatureValues} from './approved-signature-values.mjs';
import { strikeForRow } from './strikes.mjs';
export const HELMET_IDENTIFIER='horned-viking-helmet';
export function helmetNaturalStrike(strike, { readyWeapons = [], npcAttacks = [] } = {}) {
  const index = strike?.row?.index;
  if (strike?.weapon || strike?.rangeKind !== 'melee' || !Number.isInteger(index) || index < 0) return null;
  const natural = readyWeapons.find(weapon => weapon.natural?.index === index)?.natural;
  const row = natural?.row ?? npcAttacks[index];
  if (!row || JSON.stringify(strikeForRow(row, { index, mode: 'hand' })) !== JSON.stringify(strike)) return null;
  return { index, form: natural?.form ?? null, row: structuredClone(row) };
}
export function helmetHitValues({kind,success,parry,notAttack,weaponId,naturalAttack=false,rangeKind,hit,withdrawn,stage,
  preventedByDispersion,ownModifiers={},skillRanks={}}={}){
  if(kind!=='attack'||success!==true||parry===true||notAttack===true||(!weaponId&&!naturalAttack)||rangeKind!=='melee'
    ||hit!==true||withdrawn===true||stage!=='applied'||preventedByDispersion===true)return null;
  return approvedSignatureValues(HELMET_IDENTIFIER,{ownModifiers,skillRanks:{athletics:skillRanks.athletics??0}});
}
export function helmetResistance({dc,total,success}={}){
  if(!Number.isInteger(dc)||dc<10||!Number.isFinite(total)
    ||(success!==undefined&&typeof success!=='boolean'))return null;
  const passed=success??total>=dc;
  return {passed,prone:!passed};
}
