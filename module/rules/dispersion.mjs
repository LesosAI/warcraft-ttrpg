/** Dispersion's identified form, separate from Ice Block's immobile protection.
 * No Foundry imports or writes. Gear stays carried but cannot be used. */
export const DISPERSION_FLAG='dispersion';
export const DISPERSION_REASON='AZEROTH.Dispersion.Restricted';
const scope='azeroth-rpg';
const id=value=>typeof value==='string' && value.trim().length>0;

/** Equipment benefits can live on the item or on its wearer. Consumed-item
 * and spell carriers have their own lifetime; item provenance alone does not
 * turn those into a currently carried equipment benefit. */
export function dispersionSuppressesEquipmentEffect(effect, physicalItemUuids = new Set()) {
  const parent = effect?.parent;
  if (parent?.documentName === 'Item' && ['weapon','armor','gear'].includes(parent.type)) return true;
  const flags = effect?.flags?.[scope] ?? {};
  if (typeof flags.signature === 'string' && physicalItemUuids.has(flags.signature)) return true;
  return physicalItemUuids.has(effect?.origin) && !flags.consumable && !flags.spell;
}

function validTiming({start,duration}={}) {
  if(!Number.isSafeInteger(start?.time) || start.time<0) return false;
  if(duration?.units==='minutes') return duration.value===1;
  if(duration?.units==='seconds') return duration.value===60;
  return duration?.units==='rounds' && duration.value===10 && duration.expiry==='turnEnd'
    && id(start.combat) && id(start.combatant)
    && Number.isSafeInteger(start.round) && start.round>=0
    && Number.isSafeInteger(start.turn) && start.turn>=0;
}

export function dispersionEffect({ownerUuid,spellUuid,messageUuid,cast,timing,description='',img='icons/svg/mystery-man.svg'}={}) {
  if(![ownerUuid,spellUuid,messageUuid,cast,img].every(id) || typeof description!=='string' || !validTiming(timing)) return null;
  return {name:'Dispersion',img,description,origin:spellUuid,disabled:false,transfer:false,statuses:[],
    system:{changes:[{key:'system.speed',type:'multiply',value:'0.5',phase:'final',priority:50}]},
    start:{combat:null,combatant:null,initiative:0,round:0,turn:0,...structuredClone(timing.start)},
    duration:{expiry:'turnEnd',expired:false,...structuredClone(timing.duration)},
    flags:{[scope]:{identifier:'dispersion',[DISPERSION_FLAG]:{version:1,ownerUuid,spellUuid,messageUuid,cast}}}};
}

export function dispersionFor(actor) {
  if(!id(actor?.uuid))return null;
  return [...(actor.effects ?? [])].find(effect=>{
    const flags=effect?.flags?.[scope],record=flags?.[DISPERSION_FLAG];
    return flags?.identifier==='dispersion' && record?.version===1 && record.ownerUuid===actor.uuid
      && [record.spellUuid,record.messageUuid,record.cast].every(id) && effect.origin===record.spellUuid
      && !effect.disabled && !effect.isSuppressed && effect.active!==false && !effect.duration?.expired
      && validTiming({start:effect._source?.start ?? effect.start,duration:effect._source?.duration ?? effect.duration});
  }) ?? null;
}

/** Voluntary movement, Tests and non-damage Health costs are not damage or
 * attacks. Each writing adapter must name the operation it actually performs. */
export function dispersionRefusal(actor,operation) {
  return ['damage','target','forcedMove','attack','cast','gear'].includes(operation) && dispersionFor(actor)
    ? DISPERSION_REASON : null;
}

export function dispersionCanEnd({actor,onTurn}={}) {
  return onTurn===true && Boolean(dispersionFor(actor));
}
