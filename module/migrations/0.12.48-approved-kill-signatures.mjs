import {emptySignature,signatureEffectOf} from '../rules/signatures.mjs';
import {flat} from './0.12.1-signature-rewrites.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {packCopy,packSystems,rawSystem,walkWorld} from './walk.mjs';
const OLD={
  'death-grips':{type:'gear',reason:'scaled',text:'Signature to be written. What it did is a rate these rules do not keep.'},
  'spinal-reaper':{type:'weapon',reason:'noEquivalent',text:'Signature to be written. What it did has no equivalent in these rules.'}
};
export function approvedKillSignatureUpdate(raw,pack,classic={}){
  const old=OLD[raw?.identifier];
  if(!old||pack?.identifier!==raw.identifier||flat(raw.signature)!==flat(old.text)
    ||!sameUse(signatureEffectOf(raw),signatureEffectOf({signatureEffect:{...emptySignature(),reason:old.reason}})))return null;
  if(pack.signatureEffect?.kind!=='standing'||pack.signatureEffect.weaponKillReward!==true)return null;
  return {'system.signature':pack.signature,'system.signatureEffect':structuredClone(pack.signatureEffect),
    'flags.azeroth-rpg.classic.signatureOverride':true,
    ...(Array.isArray(classic.flagged)?{'flags.azeroth-rpg.classic.flagged':classic.flagged.filter(row=>row.code!=='signature:unwritten')}: {})};
}
export async function migrate(log=console.log){
  const gear=await packSystems('azeroth-rpg.gear'),weapons=await packSystems('azeroth-rpg.weapons');
  return walkWorld({item:doc=>{
    const raw=rawSystem(doc),old=OLD[raw?.identifier];
    if(!old||old.type!==doc.type)return null;
    return approvedKillSignatureUpdate(raw,packCopy(doc.type==='gear'?gear:weapons,raw,doc.name),doc.flags?.['azeroth-rpg']?.classic);
  }},log);
}
