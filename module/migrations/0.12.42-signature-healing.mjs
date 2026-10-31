import {rawSystem,walkWorld} from './walk.mjs';
export function signatureHealingUpdate(raw){
 const signature=raw?.signatureEffect;if(!signature)return null;
 const changes={};
 if(!Object.hasOwn(signature,'chosenSpellHealing'))changes['system.signatureEffect.chosenSpellHealing']=false;
 if(signature.gated?.some(part=>!Object.hasOwn(part,'chosenSpellHealing')))
  changes['system.signatureEffect.gated']=signature.gated.map(part=>({chosenSpellHealing:false,...part}));
 return Object.keys(changes).length?changes:null;
}
export async function migrate(log=console.log){
 return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureHealingUpdate(rawSystem(doc)):null},log);
}
