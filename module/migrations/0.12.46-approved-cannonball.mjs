import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
export function approvedCannonballUpdate(raw,pack,classic={}){
 if(raw?.identifier!=='cannonball-runner'||pack?.identifier!==raw.identifier)return null;
 if(flat(raw.signature)!==flat('Signature to be written. What it did has no equivalent in these rules.')
  ||!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:{...emptySignature(),reason:'noEquivalent'}})))return null;
 if(pack.signatureEffect?.kind!=='use'||pack.signatureEffect.use?.uses?.per!=='short')return null;
 return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),
  'flags.azeroth-rpg.classic.signatureOverride':true,
  ...(Array.isArray(classic.flagged)?{'flags.azeroth-rpg.classic.flagged':classic.flagged.filter(row=>row.code!=='signature:unwritten')}: {})};
}
export async function migrate(log=console.log){
 const table=await packSystems('azeroth-rpg.gear');
 return walkWorld({item:doc=>{
  if(doc.type!=='gear')return null;const raw=rawSystem(doc);
  return approvedCannonballUpdate(raw,packCopy(table,raw,doc.name),doc.flags?.['azeroth-rpg']?.classic);
 }},log);
}
