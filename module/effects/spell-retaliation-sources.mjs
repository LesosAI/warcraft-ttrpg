import {spellRetaliationCarrier,spellRetaliationSources} from '../rules/spell-retaliation-sources.mjs';
import {sustainEntryTransferPending} from '../rules/sustain-entry-transfer.mjs';
const scope='azeroth-rpg';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};

export function heldSpellRetaliations(holder){
 if(!holder?.uuid)return [];
 const sustaining=[];
 for(const entry of holder.getFlag(scope,'sustaining')??[]){
  if(sustainEntryTransferPending(entry,holder.uuid))continue;
  const cards=[...game.messages.values()].filter(m=>m.flags?.[scope]?.cast===entry.cast
   &&m.flags[scope].spellLockCaster===holder.uuid&&m.flags[scope].spellRetaliation?.descriptor?.recipient==='caster');
  if(cards.length!==1)continue;
  const carrier=spellRetaliationCarrier(cards[0].flags[scope],cards[0].uuid,holder.uuid);
  if(carrier)sustaining.push({spellRetaliation:carrier});
 }
 const effects=[...(holder.effects??[])].map(effect=>({origin:effect.origin,flags:effect.flags,
  disabled:effect.disabled,active:effect.active,expired:effect.duration?.expired===true}));
 return spellRetaliationSources({holderUuid:holder.uuid,sustaining,effects}).flatMap(row=>{
  const message=resolve(row.messageUuid),caster=resolve(row.casterUuid),f=message?.flags?.[scope];
  const canonical=f&&spellRetaliationCarrier(f,message.uuid,holder.uuid);
  if(!caster||f?.success!==true||f.cast!==row.cast||f.spellLockCaster!==caster.uuid
   ||!canonical||JSON.stringify(row.damage)!==JSON.stringify(f.spellRetaliation.descriptor.damage))return [];
  return [{...row,spell:f.tickSpell,spellUuid:f.spellUuid,name:f.spellName}];
 });
}
