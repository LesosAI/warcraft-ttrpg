/** Repair the unchanged note-only Chromatic Resistance flask. */
import {packSystems,rawSystem,walkWorld} from './walk.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';
import {AZEROTH} from '../config.mjs';
const NAME='Flask of Chromatic Resistance';
const NOTE='For one hour, gain Ward 2 in every school. It does not stack with a Ward you already carry; take the higher.';
const valid=pack=>sameUse(pack?.use?.changes,Object.keys(AZEROTH.schools).map(school=>({key:`system.ward.${school}`,type:'upgrade',value:'2',phase:'final'})));

export function buildChromaticFlaskUpdate(raw,pack,name){
  if(name!==NAME||!valid(pack)||!sameUse(raw?.use,{...pack.use,changes:[],note:NOTE}))return null;
  return {'system.use.changes':structuredClone(pack.use.changes),'system.use.note':pack.use.note};
}
export async function migrate(log=console.log){
  const pack=(await packSystems('azeroth-rpg.gear')).byName.get(NAME);
  if(!valid(pack))throw new Error('Rebuild the gear pack before migrating Flask of Chromatic Resistance.');
  return walkWorld({item:doc=>doc.type==='gear'?buildChromaticFlaskUpdate(rawSystem(doc),pack,doc.name):null},log);
}
