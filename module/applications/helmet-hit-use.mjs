import {prepareHelmetHit} from '../effects/helmet-hit-use.mjs';
import {SIGNATURE_HIT_USES} from '../effects/signature-hit-use.mjs';
import {HELMET_IDENTIFIER} from '../rules/horned-helmet.mjs';
import {requestApprovedSignatureUse} from '../effects/approved-signature-use.mjs';
import {charmUseView,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const HELMET_USE='systems/azeroth-rpg/templates/chat/partials/helmet-use.hbs';
export function showHelmetUse(message,html){
  const actor=ChatMessage.getSpeakerActor(message.speaker);if(!actor?.isOwner)return;
  const receipt=message.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)?.[HELMET_IDENTIFIER];
  const block=html.querySelector('.azeroth-card');if(!block)return;
  if(receipt){
    const line=document.createElement('p');
    line.textContent=game.i18n.localize(receipt.state==='complete'?'AZEROTH.Signature.Helmet.Offered':'AZEROTH.Signature.Helmet.Unresolved');
    block.append(line);return;
  }
  const helmets=actor.items.filter(item=>item.system.identifier===HELMET_IDENTIFIER&&item.system.equipped===true)
    .sort((a,b)=>a.id.localeCompare(b.id));
  for(const index of (message.flags?.['azeroth-rpg']?.targets??[]).keys()){
    for(const item of helmets){
      const prepared=prepareHelmetHit({actor,item,hit:{messageUuid:message.uuid,index}});if(!prepared.ok)continue;
      const button=drawCardPartial(HELMET_USE,{index,itemId:item.id,name:item.name,
        target:prepared.hit.target.name??prepared.hit.target.actorId,dc:prepared.values.dc,
        disabled:Boolean(charmUseView(HELMET_IDENTIFIER,actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG),true)?.refusal)},message);
      if(button)block.append(button);break;
    }
  }
}
export function useHelmet(message,index,itemId){
  const actor=ChatMessage.getSpeakerActor(message.speaker),item=actor?.items.get(itemId);
  return actor&&item?requestApprovedSignatureUse(actor,item,[],{messageUuid:message.uuid,index}):null;
}
