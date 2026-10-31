import {castWithDialog,reactionStateOf} from './actions.mjs';
import {requestDispersionReaction} from '../effects/dispersion-reaction-request.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const DISPERSION_REACTION='systems/azeroth-rpg/templates/chat/partials/dispersion-reaction.hbs';
const words=key=>game.i18n.localize(`AZEROTH.Dispersion.${key}`);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
function offer(message,index) {
  const flags=message.flags?.['azeroth-rpg'],target=flags?.targets?.[index],row=flags?.attackResolution?.targets?.[index];
  if(!['attack','spell'].includes(flags?.kind) || flags.parry || flags.notAttack || flags.retaliation
    || flags.kind==='spell' && flags.success!==true || row?.stage!=='pending' || row.dispersionAttempted)return null;
  const damage=flags.damageByTarget?.[index];
  if(!(damage?.damage>0) || damage.withdrawn || damage.to===0)return null;
  const actor=target?.sceneId && target?.tokenId?resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`)?.actor
    : !target?.sceneId && !target?.tokenId?game.actors.get(target?.actorId):null;
  if(!actor?.isOwner || actor.uuid!==row.targetUuid || !(actor.system.health?.value>0) || actor.statuses?.has('stunned'))return null;
  const spell=actor.items.find(i=>i.type==='spell' && i.system.identifier==='dispersion' && i.system.action==='reaction');
  if(!spell)return null;
  const state=reactionStateOf(actor,{messageId:message.id,against:ChatMessage.getSpeakerActor(message.speaker),targetIndex:index});
  if(['alreadyReacted','unanswered','spiritRealm','asleep','disoriented','phaseShifted','iceBlocked','dispersed','reactionBarred','seduced']
    .some(key=>state[key]) || state.inFight && !(state.reactionsLeft>0))return null;
  return {actor,spell};
}
export function showDispersionReactions(message,html) {
  for(const old of html.querySelectorAll('[data-dispersion-reaction]'))old.remove();
  const targets=message.flags?.['azeroth-rpg']?.targets??[];
  targets.forEach((_target,index)=>{
    const choice=offer(message,index);if(!choice)return;
    const row=drawCardPartial(DISPERSION_REACTION,{index,actorUuid:choice.actor.uuid,name:choice.actor.name},message);
    if(row)(html.querySelector('.azeroth-card-body')??html).append(row);
  });
}
export async function dispersionReactionFromCard(message,index) {
  const choice=offer(message,index);if(!choice){ui.notifications.warn(words('ReactionRefused'));return null;}
  return castWithDialog(choice.actor,choice.spell,{shiftKey:game.settings.get('azeroth-rpg','rollDialog')==='skip'},
    {targets:[],run:async options=>{
      const result=await requestDispersionReaction(message,index,choice.spell,options);
      if(!result?.ok)ui.notifications.warn(words('ReactionRefused'));
      return result;
    }});
}
