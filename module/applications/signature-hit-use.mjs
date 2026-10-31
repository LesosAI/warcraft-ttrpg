import {prepareJangthrazeHit,SIGNATURE_HIT_USES} from '../effects/signature-hit-use.mjs';
import {requestApprovedSignatureUse} from '../effects/approved-signature-use.mjs';
import {charmUseView,SIGNATURE_USES_FLAG} from '../rules/approved-signature-uses.mjs';
import {JANGTHRAZE_IDENTIFIER} from '../rules/signature-hit-use.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const JANGTHRAZE_USE='systems/azeroth-rpg/templates/chat/partials/jangthraze-use.hbs';
export function showJangthrazeUse(message,html){
  const actor=ChatMessage.getSpeakerActor(message.speaker);
  if(!actor?.isOwner)return;
  const item=actor.items.get(message.flags?.['azeroth-rpg']?.strike?.weapon?.id);
  if(item?.system.identifier!==JANGTHRAZE_IDENTIFIER)return;
  const receipt=message.getFlag('azeroth-rpg',SIGNATURE_HIT_USES)?.[JANGTHRAZE_IDENTIFIER];
  const block=html.querySelector('.azeroth-card');if(!block)return;
  if(receipt){
    const line=document.createElement('p');line.dataset.signatureHitUseState='';
    line.textContent=game.i18n.localize(receipt.state==='complete'?'AZEROTH.Signature.HitUse.Complete':'AZEROTH.Signature.HitUse.Pending');
    block.append(line);return;
  }
  for(const index of (message.flags?.['azeroth-rpg']?.targets??[]).keys()){
    const prepared=prepareJangthrazeHit({actor,item,hit:{messageUuid:message.uuid,index}});
    if(!prepared.ok)continue;
    const button=drawCardPartial(JANGTHRAZE_USE,{index,name:item.name,n:prepared.values.temporaryHealth,
      disabled:Boolean(charmUseView(JANGTHRAZE_IDENTIFIER,actor.getFlag('azeroth-rpg',SIGNATURE_USES_FLAG),true)?.refusal)},message);
    if(button)block.append(button);break;
  }
}
export function useJangthraze(message,index){
  const actor=ChatMessage.getSpeakerActor(message.speaker),item=actor?.items.get(message.flags?.['azeroth-rpg']?.strike?.weapon?.id);
  return actor&&item?requestApprovedSignatureUse(actor,item,[],{messageUuid:message.uuid,index}):null;
}
