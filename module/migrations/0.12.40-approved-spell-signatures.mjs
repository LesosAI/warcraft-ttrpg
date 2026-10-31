import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
const OLD={
 'staff-of-the-qiraji-prophets':['Signature to be written. What it did is a rate these rules do not keep.','scaled'],
 'drape-of-vaulted-secrets':['Signature to be written. The rest of the set carried it. What it did is a rate these rules do not keep.','scaled'],
 'libram-of-truth':['Signature to be written. What it did has no equivalent in these rules.','noEquivalent'],
 'pimgibs-collar':['Signature to be written. A Warlock only. What it did has no equivalent in these rules.','noEquivalent']
};
export function approvedSpellSignatureUpdate(raw,pack,classic={}) {
 if(!Object.hasOwn(OLD,raw?.identifier)||pack?.identifier!==raw.identifier)return null;
 const [text,reason]=OLD[raw.identifier];
 const prior={...emptySignature(),reason,gates:raw.identifier==='pimgibs-collar'?[{kind:'class',value:'Warlock'}]:[]};
 if(flat(raw.signature)!==flat(text)||!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:prior})))return null;
 if(pack.signatureEffect?.kind!=='standing'||!pack.signatureEffect.chosenSpellDamage?.school)return null;
 return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),
  'flags.azeroth-rpg.classic.signatureOverride':true,
  ...(Array.isArray(classic.flagged)?{'flags.azeroth-rpg.classic.flagged':classic.flagged.filter(row=>row.code!=='signature:unwritten')}: {})};
}
export async function migrate(log=console.log) {
 const tables={weapon:await packSystems('azeroth-rpg.weapons'),gear:await packSystems('azeroth-rpg.gear')};
 return walkWorld({item:doc=>{
  const table=tables[doc.type];if(!table)return null;
  const raw=rawSystem(doc);
  return approvedSpellSignatureUpdate(raw,packCopy(table,raw,doc.name),doc.flags?.['azeroth-rpg']?.classic);
 }},log);
}
