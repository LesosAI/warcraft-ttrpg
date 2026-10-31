import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
const OLD='Signature to be written. The rest of the set carried it. What it did is a rate these rules do not keep.';
export function approvedConquerorUpdate(raw,pack,classic={}){
 if(raw?.identifier!=='conquerors-battlegear'||pack?.identifier!==raw.identifier)return null;
 if(flat(raw.signature)!==flat(OLD)
  ||!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:{...emptySignature(),reason:'scaled'}})))return null;
 if(pack.signatureEffect?.kind!=='standing'||pack.signatureEffect.firstParryTest!==true)return null;
 return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),
  'flags.azeroth-rpg.classic.signatureOverride':true,
  ...(Array.isArray(classic.flagged)?{'flags.azeroth-rpg.classic.flagged':classic.flagged.filter(row=>row.code!=='signature:unwritten')}: {})};
}
export async function migrate(log=console.log){
 const table=await packSystems('azeroth-rpg.armor');
 return walkWorld({item:doc=>{
  if(doc.type!=='armor')return null;const raw=rawSystem(doc);
  return approvedConquerorUpdate(raw,packCopy(table,raw,doc.name),doc.flags?.['azeroth-rpg']?.classic);
 }},log);
}
