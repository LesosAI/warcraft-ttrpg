import {flat} from './0.12.1-signature-rewrites.mjs';
import {racialClarificationUpdate} from './0.12.58-racial-clarifications.mjs';
import {packSystems,rawSystem,walkWorld} from './walk.mjs';
export const blueprintExpiry = [{race:'Gnome',name:"Mekkatorque's Blueprint",old:'Between Long Rests, build one device from 08-EQUIPMENT or one gadget from 04-TALENTS that you have the parts for, at no cost in gold. It works for a day'}];
export const blueprintExpiryUpdate=(type,raw,name,races)=>racialClarificationUpdate(type,raw,name,races,blueprintExpiry);
export async function migrate(log=console.log){
 const {byName}=await packSystems('azeroth-rpg.races');
 const next=byName.get('Gnome')?.talents?.find(t=>t.name===blueprintExpiry[0].name);
 if(!flat(next?.description).includes(flat('It works until your next Long Rest')))throw Error('Rebuild races before Blueprint expiry migration 0.12.66.');
 return walkWorld({item:doc=>blueprintExpiryUpdate(doc.type,rawSystem(doc),doc.name,byName)},log);
}
