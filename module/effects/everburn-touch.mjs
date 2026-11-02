import {endTurnDamageStamp,casterLifeEnded} from '../rules/end-turn-damage.mjs';
import {deliverSignatureAreaDamage} from './signature-area-delivery.mjs';
import {AZEROTH} from '../config.mjs';
const scope='azeroth-rpg',running=new Set();
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};

/** Physical contact is adjudicated by the GM, including a hand reaching into
 * the fire without moving the creature's token into a Region. */
export async function touchEverburn(message){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||running.has(message?.id))return {ok:false,reason:'authority'};
 const f=message?.flags?.[scope],caster=resolve(f?.spellLockCaster);
 const source=endTurnDamageStamp(f,'area')?.endTurnDamage,cast=f?.cast,writer=game.user.id;
 const snapshot=JSON.stringify(source);
 const targets=[...(game.user.targets??[])].map(token=>token.document??token);
 if(f?.identifier!=='everburn'||f.kind!=='spell'||f.success!==true||!cast||!caster||!source?.touch
  ||targets.length!==1||!targets[0].actor)return {ok:false,reason:'target'};
 const token=targets[0],actor=token.actor;
 const valid=()=>game.user.id===writer&&game.users.activeGM?.id===writer&&game.messages.get(message.id)===message
  &&message.flags[scope].cast===cast&&message.flags[scope].spellLockCaster===caster.uuid
  &&message.flags[scope].success===true&&!message.flags[scope].everburnDismissed
  &&JSON.stringify(message.flags[scope].endTurnDamage)===snapshot
  &&resolve(caster.uuid)===caster&&token.parent?.tokens.get(token.id)===token&&token.actor===actor
  &&!casterLifeEnded({type:caster.type,health:caster.system.health.value,steps:caster.system.deathSteps,limit:caster.system.deathStepLimit??AZEROTH.DEATH_STEPS});
 if(!valid())return {ok:false,reason:'inactive'};
 running.add(message.id);
 try{
  const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize('AZEROTH.Everburn.Touch')},
   content:`<p>${foundry.utils.escapeHTML(game.i18n.format('AZEROTH.Everburn.TouchConfirm',{target:actor.name}))}</p>`,rejectClose:false});
  if(accepted!==true)return {ok:false,reason:'cancelled'};
  if(!valid())return {ok:false,reason:'changed'};
  return await deliverSignatureAreaDamage({message,caster,actor,token,spell:f.tickSpell,damage:source.damage,
   event:`everburnTouch:${cast}:${token.uuid}:${foundry.utils.randomID()}`,validate:valid});
 }finally{running.delete(message.id);}
}
