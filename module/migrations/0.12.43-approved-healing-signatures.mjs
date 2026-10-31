import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
const OLD={
 'mace-of-unending-life':'Signature to be written. The rest of the set carried it. What it did has no equivalent in these rules.',
 'cloak-of-unending-life':'Signature to be written. The rest of the set carried it. What it did has no equivalent in these rules.',
 'libram-of-hope':'Signature to be written. What it did has no equivalent in these rules.'
};
export function approvedHealingSignatureUpdate(raw,pack,classic={}){
 if(!Object.hasOwn(OLD,raw?.identifier)||pack?.identifier!==raw.identifier)return null;
 if(flat(raw.signature)!==flat(OLD[raw.identifier])
  ||!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:{...emptySignature(),reason:'noEquivalent'}})))return null;
 if(pack.signatureEffect?.kind!=='standing'||pack.signatureEffect.chosenSpellHealing!==true)return null;
 return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),
  'flags.azeroth-rpg.classic.signatureOverride':true,
  ...(Array.isArray(classic.flagged)?{'flags.azeroth-rpg.classic.flagged':classic.flagged.filter(row=>row.code!=='signature:unwritten')}: {})};
}
export async function migrate(log=console.log){
 const tables={weapon:await packSystems('azeroth-rpg.weapons'),gear:await packSystems('azeroth-rpg.gear')};
 return walkWorld({item:doc=>{
  const table=tables[doc.type];if(!table)return null;const raw=rawSystem(doc);
  return approvedHealingSignatureUpdate(raw,packCopy(table,raw,doc.name),doc.flags?.['azeroth-rpg']?.classic);
 }},log);
}
