import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
export function approvedCharmUpdate(raw,pack){
 if(!['balebrew-charm','brightbrew-charm'].includes(raw?.identifier)||pack?.identifier!==raw.identifier)return null;
 if(flat(raw.signature)!==flat('Signature to be written. What it did has no equivalent in these rules.'))return null;
 if(!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:{...emptySignature(),reason:'noEquivalent'}})))return null;
 if(pack.signatureEffect?.kind!=='use'||pack.signatureEffect.use?.action!=='half')return null;
 return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),'flags.azeroth-rpg.classic.signatureOverride':true};
}
export async function migrate(log=console.log){
 const table=await packSystems('azeroth-rpg.gear');
 return walkWorld({item:doc=>{
  if(doc.type!=='gear')return null;const raw=rawSystem(doc),update=approvedCharmUpdate(raw,packCopy(table,raw,doc.name));
  const flagged=doc.flags?.['azeroth-rpg']?.classic?.flagged;
  if(update&&Array.isArray(flagged))update['flags.azeroth-rpg.classic.flagged']=flagged.filter(row=>row.code!=='signature:unwritten');
  return update;
 }},log);
}
