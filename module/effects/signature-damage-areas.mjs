import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
const scope='azeroth-rpg';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
export function signatureDamageCardFor(source){
 const area=source?.region?.flags?.[scope];
 if(area?.signatureDamageCast)return game.messages.get(area.messageId)??null;
 if(source?.region||source?.tick?.centre!=='self'||!source.cast||!source.caster?.uuid)return null;
 const matches=[...game.messages.values()].filter(message=>{
  const flags=message.flags?.[scope];return flags?.kind==='spell'&&flags.success===true&&flags.cast===source.cast
   &&flags.spellLockCaster===source.caster.uuid&&(flags.chosenSignatureBonuses?.length>0
    ||flags.signatureDamageRecovery?.bonusesClosed===true);
 });
 return matches.length===1?matches[0]:null;
}
/** Start-of-turn adapter; entry/save adapters use the same delivery coordinator
 * with their own authenticated event and lifecycle validation. */
export async function landSignatureAreaDamage({combat,combatant,source,payload,validate}={}){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||typeof validate!=='function')return {ok:false,reason:'authority'};
 const region=source?.region,area=region?.flags?.[scope],message=signatureDamageCardFor(source);
 const caster=source?.caster,actor=combatant?.actor,token=combatant?.token;
 if(!message||!caster||!actor||!token)return {ok:false,reason:'context'};
 const flags=message.flags?.[scope],stamp={round:combat.round,turn:combat.turn,combatant:combatant.id};
 if(flags?.cast!==(region?area.signatureDamageCast:source.cast)||(region&&flags.cast!==area.cast))return {ok:false,reason:'cast'};
 const savedArea=structuredClone(area),savedPayload=structuredClone(payload);
 const event=`areaDamage:${flags.cast}:${combat.uuid}:${stamp.round}:${stamp.turn}:${stamp.combatant}`;
 const valid=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id&&combat.started&&game.combats.get(combat.id)===combat
  &&combat.combatant===combatant&&combat.round===stamp.round&&combat.turn===stamp.turn
  &&combatant.actor===actor&&combatant.token===token&&token.actor===actor
  &&(region?resolve(region.uuid)===region&&same(region.flags?.[scope],savedArea):signatureDamageCardFor(source)===message)
  &&same(payload,savedPayload)&&validate()===true;
 return deliverSignatureAreaDamage({message,caster,actor,token,spell:source.spell??{},damage:payload.damage,heal:payload.heal,event,validate:valid});
}
