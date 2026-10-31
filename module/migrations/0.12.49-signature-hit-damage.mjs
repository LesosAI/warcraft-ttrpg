import {rawSystem,walkWorld} from './walk.mjs';
export function signatureHitDamageUpdate(raw){
  const signature=raw?.signatureEffect;if(!signature)return null;const changes={};
  if(!Object.hasOwn(signature,'scalingHitDamage'))changes['system.signatureEffect.scalingHitDamage']=false;
  if(signature.gated?.some(part=>!Object.hasOwn(part,'scalingHitDamage')))
    changes['system.signatureEffect.gated']=signature.gated.map(part=>({scalingHitDamage:false,...part}));
  return Object.keys(changes).length?changes:null;
}
export async function migrate(log=console.log){
  return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureHitDamageUpdate(rawSystem(doc)):null},log);
}
