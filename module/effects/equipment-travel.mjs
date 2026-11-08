/** Shared 07 Invisibility / D-813 potion lifecycle, with source-specific deletes. */
import {equipmentState} from '../rules/special-equipment.mjs';
import {invisibilityEnds,spellInvisible} from '../rules/equipment-travel.mjs';
import {registerFallingDamage} from '../applications/falling-damage.mjs';
const NS='azeroth-rpg',queues=new Map();
const values=c=>[...(c?.values?.()??c??[])];
const potion=e=>equipmentState(e)?.key==='invisibility-potion';
const writer=()=>globalThis.game?.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const pending=work=>void work.catch(error=>console.warn('azeroth-rpg | Invisibility cleanup requires review',error));
async function serial(actor,work){
  const prior=queues.get(actor.uuid)??Promise.resolve();
  const next=prior.catch(()=>{}).then(work);queues.set(actor.uuid,next);
  try{return await next;}finally{if(queues.get(actor.uuid)===next)queues.delete(actor.uuid);}
}
export async function endEquipmentInvisibility(actor,{event,damage=0,except=null}={}){
  if(!actor?.uuid||actor.isOwner!==true||!invisibilityEnds({event,damage}))return false;
  return serial(actor,async()=>{
    // Other consumables break the potion alone. An attack/cast/damage also
    // ends the real spell, as 07 says; a GM's unrelated status stays intact.
    const effects=values(actor.effects).filter(e=>e.id!==except&&(potion(e)||(event!=='consumable'&&spellInvisible(e))));
    if(!effects.length)return false;
    await actor.deleteEmbeddedDocuments('ActiveEffect',effects.map(e=>e.id));
    return true;
  });
}
/** Replacing a spell carrier ends its exact Sustain through the existing door;
 * no potion duration is added to it and no upkeep is waived. */
export async function endDeletedInvisibility(effect){
  if(!writer()||!spellInvisible(effect))return false;
  // Re-applying the same card replaces its duplicate carrier, not its cast.
  if(values(effect.parent?.effects).some(e=>e.id!==effect.id&&spellInvisible(e)
    &&e.origin===effect.origin&&e.flags[NS].cast===effect.flags[NS].cast))return false;
  const caster=await fromUuid(effect.origin),cast=effect.flags[NS].cast;
  if(!caster||(caster.getFlag(NS,'sustaining')??[]).every(row=>row.cast!==cast))return false;
  const {endSustain}=await import('../dice/workflows.mjs');
  await endSustain({actor:caster,cast});return true;
}
export function registerEquipmentTravel(){
  registerFallingDamage();
  Hooks.on('updateActor',(actor,_change,options)=>{
    // Explicit committed damage, including temporary Health. A Rune's Health
    // payment or sheet edit is not damage and does not break the spell.
    if(writer()&&options?.azerothDamageApplied>0)pending(endEquipmentInvisibility(actor,{event:'damage',damage:options.azerothDamageApplied}));
  });
  Hooks.on('createActiveEffect',effect=>{
    if(!writer()||effect.parent?.documentName!=='Actor'||(!potion(effect)&&!spellInvisible(effect)))return;
    pending(serial(effect.parent,async()=>{
      const all=values(effect.parent.effects),index=all.findIndex(e=>e.id===effect.id);
      const older=all.slice(0,Math.max(0,index)).filter(e=>potion(e)||spellInvisible(e));
      if(older.length)await effect.parent.deleteEmbeddedDocuments('ActiveEffect',older.map(e=>e.id));
    }));
  });
  Hooks.on('deleteActiveEffect',effect=>{pending(endDeletedInvisibility(effect));});
}
