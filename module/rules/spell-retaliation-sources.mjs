import {spellRetaliationFrom} from './spell-retaliation.mjs';

export function spellRetaliationCarrier(flags,messageUuid,holderUuid) {
  const source=flags?.spellRetaliation;
  if(flags?.kind!=='spell'||flags.success!==true||!flags.cast
    ||typeof messageUuid!=='string'||!messageUuid.trim()
    ||typeof holderUuid!=='string'||!holderUuid.trim()
    ||source?.version!==1||typeof source.casterUuid!=='string'||!source.casterUuid.trim()
    ||source.casterUuid!==flags.spellLockCaster)return null;
  const descriptor=spellRetaliationFrom(source.spell);
  if(!descriptor||JSON.stringify(descriptor)!==JSON.stringify(source.descriptor))return null;
  if(descriptor.recipient==='caster'&&holderUuid!==source.casterUuid)return null;
  return {version:1,cast:flags.cast,casterUuid:source.casterUuid,holderUuid,messageUuid,
    spell:structuredClone(source.spell)};
}

/** Plain snapshots only. Recipient effects retain the original caster: the
 * creature being struck does not acquire the caster's spell bonuses.
 * Callers remain responsible for resolving documents and enforcing authority.
 */
export function spellRetaliationSources({holderUuid,sustaining=[],effects=[]}={}) {
  if(typeof holderUuid!=='string'||!holderUuid.trim())return [];
  const rows=[];
  const add=(record,source)=>{
    const state=record?.spellRetaliation;
    if(state?.version!==1||state.holderUuid!==holderUuid
      ||typeof state.cast!=='string'||!state.cast.trim()
      ||typeof state.casterUuid!=='string'||!state.casterUuid.trim()
      ||typeof state.messageUuid!=='string'||!state.messageUuid.trim()
      ||state.transferPending===true)return;
    const descriptor=spellRetaliationFrom(state.spell);
    // A Self spell's laid effect on its own caster (07 §12's Scouring Veil) carries it too.
    if(!descriptor || (source==='sustain' ? descriptor.recipient!=='caster'||state.casterUuid!==holderUuid
      :!(descriptor.recipient==='target'||(descriptor.recipient==='caster'&&state.casterUuid===holderUuid))))return;
    rows.push({source,cast:state.cast,casterUuid:state.casterUuid,holderUuid,
      messageUuid:state.messageUuid,damage:descriptor.damage,...(descriptor.decay?{decay:descriptor.decay}:{})});
  };
  for(const entry of sustaining) add(entry,'sustain');
  for(const effect of effects){
    if(effect.disabled||effect.active===false||effect.expired===true)continue;
    const record=effect.flags?.['azeroth-rpg'];
    if(effect.origin!==record?.spellRetaliation?.casterUuid)continue;
    add(record,'effect');
  }
  // Ambiguous duplicate carriers cannot multiply damage or choose a winner.
  return rows.filter(row=>rows.filter(other=>other.cast===row.cast).length===1);
}
