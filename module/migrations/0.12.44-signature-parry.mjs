import {rawSystem,walkWorld} from './walk.mjs';
export function signatureParryUpdate(raw){
 const signature=raw?.signatureEffect;if(!signature)return null;const changes={};
 if(!Object.hasOwn(signature,'firstParryTest'))changes['system.signatureEffect.firstParryTest']=false;
 if(signature.gated?.some(part=>!Object.hasOwn(part,'firstParryTest')))
  changes['system.signatureEffect.gated']=signature.gated.map(part=>({firstParryTest:false,...part}));
 return Object.keys(changes).length?changes:null;
}
export async function migrate(log=console.log){
 return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureParryUpdate(rawSystem(doc)):null},log);
}
