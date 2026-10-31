import {resolveAttackOperation} from './attack-resolution-state.mjs';
import {dispersionFor} from '../rules/dispersion.mjs';
import {DISPERSION_RECEIPT} from './dispersion-casting.mjs';

/** The owner confirms the ordinary casting popup before entering this writer.
 * Casting pays its own Reaction and Mana; this operation never pays either. */
export async function resolveDispersionReaction({message,index,actor,validate,cast,annotate}={}) {
  if(typeof validate!=='function' || typeof cast!=='function' || typeof annotate!=='function'
    || !actor?.uuid || fromUuidSync(actor.uuid)!==actor || !game.messages?.values)return {ok:false,reason:'invalid'};
  if(dispersionFor(actor))return {ok:false,reason:'alreadyDispersed'};
  const row=message?.flags?.['azeroth-rpg']?.damageByTarget?.[index];
  if(!row || !Number.isFinite(row.damage) || row.damage<=0 || row.withdrawn===true)return {ok:false,reason:'damage'};
  const damage=JSON.stringify(row);
  const held=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id
    && fromUuidSync(actor.uuid)===actor && fromUuidSync(message.uuid)===message
    && message.getFlag('azeroth-rpg','attackResolution')?.targets?.[index]?.stage==='dispersing'
    && message.getFlag('azeroth-rpg','attackResolution')?.targets?.[index]?.targetUuid===actor.uuid;
  return resolveAttackOperation({message,index,targetUuid:actor.uuid,operation:'disperse',validate,
    execute:async()=>{
      if(!held() || JSON.stringify(message.flags['azeroth-rpg'].damageByTarget[index])!==damage)return {ok:false};
      // A successful card from before this claim cannot pay for this Reaction.
      const previousCards=new Set([...game.messages.values()].map(card=>card.uuid));
      const card=await cast({valid:()=>held() && JSON.stringify(message.flags['azeroth-rpg'].damageByTarget[index])===damage});
      const f=card?.flags?.['azeroth-rpg'];
      if(!held() || JSON.stringify(message.flags['azeroth-rpg'].damageByTarget[index])!==damage
        || previousCards.has(card?.uuid) || card?.documentName!=='ChatMessage' || game.messages.get(card.id)!==card
        || fromUuidSync(card?.uuid)!==card || f?.kind!=='spell' || f.identifier!=='dispersion' || f.caster!==actor.uuid
        || typeof f.success!=='boolean')return {ok:false};
      await actor.setFlag('azeroth-rpg','reacted',{messageId:message.id,reaction:'dispersion'});
      if(!held())return {ok:false};
      if(!f.success)return {ok:true,prevented:false};
      const form=dispersionFor(actor),receipt=card.getFlag('azeroth-rpg',DISPERSION_RECEIPT);
      if(!form || form.flags['azeroth-rpg'].dispersion.messageUuid!==card.uuid || receipt?.stage!=='complete'
        || receipt.effectId!==form.id)return {ok:false};
      if(!held() || dispersionFor(actor)!==form)return {ok:false};
      const changed=await annotate({messageId:message.id,index,reaction:'dispersion',to:0,mitigated:row.damage});
      if(!held() || changed?.to!==0 || dispersionFor(actor)!==form)return {ok:false};
      return {ok:true,prevented:true};
    }});
}
