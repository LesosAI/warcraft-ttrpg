import {packSystems,rawSystem,walkWorld} from './walk.mjs';
import {sameUse} from './0.11.2-consumable-use.mjs';

export const OLD_TEA_NOTE='A Rogue drinking it as a Half-Action goes to their full Combo Points at once. Anyone else is sick for an hour and gains a **Fatigued**.';
const OLD_TEA_HTML='A Rogue drinking it as a Half-Action goes to their full Combo Points at once. Anyone else is sick for an hour and gains a <strong>Fatigued</strong>.';
export const NEW_TEA_NOTE='A Rogue drinking it as a Half-Action goes to their full Combo Points at once. Anyone else gains one Fatigue point, recovered normally. This is not a timed Fatigued effect.';
const REMOVAL='<p><strong>Removal.</strong> If an effect carries one of these conditions alongside other conditions or benefits, the entire effect ends.</p>';
const REPEAT="<p><strong>Repeat doses.</strong> Another dose replaces this flask's previous school bonus and refreshes its one-hour duration. Bonuses from multiple doses do not stack.</p>";
export const CONSUMABLE_NAMES=['Thistle Tea','Restorative Potion','Free Action Potion','Flask of Supreme Power'];

export function buildConsumableRulingUpdate(raw,pack,name){
  if(!CONSUMABLE_NAMES.includes(name)||!raw||!pack)return null;
  const update={};
  let oldDescription;
  if(name==='Thistle Tea'){
    if(pack.use?.note!==NEW_TEA_NOTE)return null;
    const oldUse={...pack.use,note:OLD_TEA_NOTE,duration:{value:1,units:'hours'}};
    if(sameUse(raw.use,oldUse)){
      update['system.use.note']=pack.use.note;
      update['system.use.duration']=structuredClone(pack.use.duration);
    }
    oldDescription=pack.description?.replace(NEW_TEA_NOTE,OLD_TEA_HTML);
  }else{
    const addition=name==='Flask of Supreme Power'?REPEAT:REMOVAL;
    if(!pack.description?.includes(addition))return null;
    oldDescription=pack.description.replace(addition,'');
  }
  if(oldDescription!==pack.description&&raw.description===oldDescription)update['system.description']=pack.description;
  return Object.keys(update).length?update:null;
}

export async function migrate(log=console.log){
  const gear=await packSystems('azeroth-rpg.gear');
  for(const name of CONSUMABLE_NAMES){
    const pack=gear.byName.get(name);
    if(!pack || name==='Thistle Tea'&&pack.use?.note!==NEW_TEA_NOTE
      || name!=='Thistle Tea'&&!pack.description?.includes(name==='Flask of Supreme Power'?REPEAT:REMOVAL))
      throw new Error('Rebuild the gear pack before migrating the approved consumable wording.');
  }
  return walkWorld({item:doc=>doc.type==='gear'?buildConsumableRulingUpdate(rawSystem(doc),gear.byName.get(doc.name),doc.name):null},log);
}
