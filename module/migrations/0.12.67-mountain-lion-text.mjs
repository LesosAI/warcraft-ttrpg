import {flat} from './0.12.1-signature-rewrites.mjs';
import {packSystems,rawSystem,walkWorld} from './walk.mjs';

export const mountainLionException = 'Mountain Lion is also an eligible form, despite its Soldier weight class.';

export function mountainLionTextUpdate(type,raw,name,current){
 if(type!=='class'||name!=='Druid'||raw?.identifier!=='druid'
   ||raw.source?.document!=='02-CHARACTER-OPTIONS')return null;
 const next=current?.description;
 if(typeof next!=='string'||!next.includes(mountainLionException))return null;
 const previous=next.replace(mountainLionException,'');
 if(flat(raw.description)!==flat(previous))return null;
 return {'system.description':next};
}

export async function migrate(log=console.log){
 const {byName}=await packSystems('azeroth-rpg.classes');
 const current=byName.get('Druid');
 if(!current?.description?.includes(mountainLionException))throw Error('Rebuild classes before Mountain Lion migration 0.12.67.');
 return walkWorld({item:doc=>mountainLionTextUpdate(doc.type,rawSystem(doc),doc.name,current)},log);
}
