import {signatureDamageCardFor} from './signature-damage-areas.mjs';
import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
import {tickFor} from '../rules/area-ticks.mjs';
import {kindsOfActor,relationTo} from './area-strikes.mjs';
import {rowWithdrawn} from '../rules/miss.mjs';
import {sustainEntryTransferPending} from '../rules/sustain-entry-transfer.mjs';
import {heldSpellRetaliations} from './spell-retaliation-sources.mjs';
const scope='azeroth-rpg';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
/** The button identifies a published cast; damage is read from the held source. */
export async function deliverSignatureRetaliation({message,index,cast,permission=()=>true}={}){
 const flags=message?.flags?.[scope],rows=flags?.signatureRetaliations?.filter(row=>row.index===index&&row.cast===cast)??[];
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||flags?.kind!=='attack'||!Number.isInteger(index)||rows.length!==1||permission()!==true)return {ok:false,reason:'context'};
 const row=rows[0],caster=resolve(row.casterUuid),actor=ChatMessage.getSpeakerActor(message.speaker);
 if(row.spellRetaliation===true){
  const holder=resolve(row.holderUuid),original=resolve(row.messageUuid);
  const read=()=>heldSpellRetaliations(holder).find(s=>s.cast===cast&&s.casterUuid===row.casterUuid&&s.messageUuid===row.messageUuid);
  const source=read(),resolution=flags.attackResolution?.targets?.[index];
  if(!caster||!actor||!holder||!original||!source||resolution?.stage!=='applied'
   ||resolution.targetUuid!==holder.uuid||rowWithdrawn(flags,index)||flags.parry||flags.notAttack
   ||flags.retaliation||(flags.strike?.rangeKind??'melee')!=='melee')return {ok:false,reason:'hit'};
  const snapshot=JSON.stringify({source,rows,resolution});
  const token=message.speaker?.scene&&message.speaker?.token?game.scenes.get(message.speaker.scene)?.tokens.get(message.speaker.token):null;
  return deliverSignatureAreaDamage({message:original,caster,actor,token,spell:source.spell,damage:source.damage,
   event:`retaliation:${message.uuid}:${index}:${cast}`,
   validate:()=>permission()===true&&resolve(message.uuid)===message&&resolve(holder.uuid)===holder
    &&resolve(original.uuid)===original&&!rowWithdrawn(message.flags[scope],index)
    &&JSON.stringify({source:read(),rows:message.flags[scope].signatureRetaliations?.filter(r=>r.index===index&&r.cast===cast),resolution:message.flags[scope].attackResolution?.targets?.[index]})===snapshot});
 }
 const entry=()=>caster?.getFlag(scope,'sustaining')?.find(e=>e.cast===cast&&e.signatureDamageCast===cast&&e.uuid===row.spellUuid&&!sustainEntryTransferPending(e,caster.uuid));
 const held=entry(),resolution=flags.attackResolution?.targets?.[index];
 if(!held||!actor||resolution?.stage!=='applied'||resolution.targetUuid!==caster.uuid||rowWithdrawn(flags,index))return {ok:false,reason:'hit'};
 const source={caster,cast,tick:held.areaTick};
 const original=signatureDamageCardFor(source);
 if(!original||held.areaTick?.retaliate!==true)return {ok:false,reason:'source'};
 const payload=tickFor(held.areaTick,{relation:relationTo({caster,actor}),kinds:kindsOfActor(actor)});
 if(!payload?.damage)return {ok:false,reason:'damage'};
 const snapshot=JSON.stringify({held,rows,resolution});
 const token=message.speaker?.scene&&message.speaker?.token?game.scenes.get(message.speaker.scene)?.tokens.get(message.speaker.token):null;
 return deliverSignatureAreaDamage({message:original,caster,actor,token,spell:held.tickSpell,damage:payload.damage,
  event:`retaliation:${message.uuid}:${index}:${cast}`,
  validate:()=>permission()===true&&resolve(message.uuid)===message&&resolve(caster.uuid)===caster&&resolve(actor.uuid)===actor
   &&signatureDamageCardFor(source)===original&&!rowWithdrawn(message.flags[scope],index)
   &&JSON.stringify({held:entry(),rows:message.flags[scope].signatureRetaliations?.filter(r=>r.index===index&&r.cast===cast),resolution:message.flags[scope].attackResolution?.targets?.[index]})===snapshot});
}

export const SIGNATURE_RETALIATION_QUERY='azeroth-rpg.signatureRetaliation';
export async function signatureRetaliationHandler({messageId,index,cast}={}, {user}={}){
 const message=game.messages?.get(messageId),actor=message&&ChatMessage.getSpeakerActor(message.speaker);
 const permission=()=>Boolean(user?.id&&game.users.get(user.id)===user&&actor
  &&(user.isGM||actor.testUserPermission(user,'OWNER')));
 if(!message||!permission())return {ok:false,reason:'permission'};
 return deliverSignatureRetaliation({message,index,cast,permission});
}
export async function requestSignatureRetaliation({message,index,cast}={}){
 const data={messageId:message?.id,index,cast},gm=game.users?.activeGM;
 if(!gm)return {ok:false,reason:'noGM'};
 try{return game.user.id===gm.id?await signatureRetaliationHandler(data,{user:game.user})
  :await gm.query(SIGNATURE_RETALIATION_QUERY,data,{timeout:15000});}
 catch{return {ok:false,reason:'uncertain'};}
}
