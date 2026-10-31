import {queueSignatureCard} from './signature-card-queue.mjs';
import {deliverRecordedHealing} from './signature-healing-apply.mjs';
import {strikeFromArea} from './area-strikes.mjs';
import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
const scope='azeroth-rpg';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
/** A scheduled Region pulse. The combat caller rechecks current membership,
 * relation, sustain and payload using the same source reader as ordinary areas.
 * No client payload may choose the amount, event, source or recipient.
 */
export async function landSignatureAreaHealing({combat,combatant,source,payload,validate}={}){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||typeof validate!=='function')return {ok:false,reason:'authority'};
 const region=source?.region,area=region?.flags?.[scope],message=game.messages.get(area?.messageId);
 const caster=source?.caster,actor=combatant?.actor,token=combatant?.token;
 if(!message||!region||!caster||!actor||!token||!area.signatureHealingCast)return {ok:false,reason:'context'};
 const flags=message.flags?.[scope],stamp={round:combat.round,turn:combat.turn,combatant:combatant.id};
 if(flags?.kind!=='spell'||flags.success!==true||flags.cast!==area.signatureHealingCast||flags.cast!==area.cast
  ||flags.healingSignatureCaster!==caster.uuid||!flags.chosenHealingBonuses?.length)return {ok:false,reason:'cast'};
 const savedArea=structuredClone(area),savedPayload=structuredClone(payload);
 // Duplicate Regions from the same casting are still one pulse for this
 // combatant, even if the first Region disappears before a repeated hook.
 const event=`areaHeal:${flags.cast}:${combat.uuid}:${stamp.round}:${stamp.turn}:${stamp.combatant}`;
 const key=encodeURIComponent(event).replaceAll('.','%2E');
 const targets=flags.targets?.filter(ref=>ref.actorId===actor.id
  &&(ref.sceneId||ref.tokenId?ref.sceneId===token.parent?.id&&ref.tokenId===token.id:true))??[];
 const keys=new Set(targets.map(signatureRecipientKey));
 const recipients=new Set(flags.chosenHealingBonuses.filter(row=>keys.has(row.recipient)).map(row=>row.recipient));
 if(recipients.size>1)return {ok:false,reason:'recipient'};
 const valid=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id&&combat.started&&game.combats.get(combat.id)===combat
  &&combat.combatant===combatant&&combat.round===stamp.round&&combat.turn===stamp.turn
  &&combatant.actor===actor&&combatant.token===token&&token.actor===actor&&resolve(region.uuid)===region
  &&same(region.flags?.[scope],savedArea)&&same(payload,savedPayload)&&resolve(message.uuid)===message&&validate()===true;
 return queueSignatureCard(message,async()=>{
  if(!valid())return {ok:false,reason:'changed'};
  const prior=message.getFlag(scope,'signatureHealingDelivery')?.events?.[key];
  if(prior?.state==='complete')return {ok:true,already:true,lines:[]};
  let lines=[];
  const result=await deliverRecordedHealing({message,caster,target:actor,recipient:[...recipients][0]??null,amount:payload.heal,key,event,validate:valid,
   heal:async(total,outcome)=>{lines=await strikeFromArea({actor,caster,spell:source.spell??{},damage:payload.damage,heal:total,healingOutcome:outcome});}});
  return result.ok?{ok:true,lines}:result;
 });
}
