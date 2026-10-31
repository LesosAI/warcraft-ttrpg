import {rawSystem,walkWorld} from './walk.mjs';
export function signatureKillRewardUpdate(raw){
  const signature=raw?.signatureEffect;if(!signature)return null;
  const changes={};
  if(!Object.hasOwn(signature,'weaponKillReward'))changes['system.signatureEffect.weaponKillReward']=false;
  if(signature.gated?.some(part=>!Object.hasOwn(part,'weaponKillReward')))
    changes['system.signatureEffect.gated']=signature.gated.map(part=>({weaponKillReward:false,...part}));
  return Object.keys(changes).length?changes:null;
}
export async function migrate(log=console.log){
  return walkWorld({item:doc=>['weapon','armor','gear'].includes(doc.type)?signatureKillRewardUpdate(rawSystem(doc)):null},log);
}
