import {damageSignatureCards,damageSignatureReviewState,reviewDamageSignature} from '../effects/signature-damage-review.mjs';
import {orphanDamageCasts,recoverOrphanDamageCast} from '../effects/signature-damage-orphans.mjs';
import {sealingFlameReservationReview,reviewSealingFlameReservation} from '../effects/sealing-flame-recipient.mjs';
export async function reviewSignatureDamage(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const orphans=orphanDamageCasts(actor),orphanCards=new Set(orphans.map(row=>row.cardUuid));
 const cards=damageSignatureCards(actor).filter(message=>!orphanCards.has(message.uuid)).map(message=>({message,state:damageSignatureReviewState(message)}));
 const sealing=sealingFlameReservationReview(actor);
 if(!cards.length&&!orphans.length&&!sealing.pending)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.DamageReview.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-damage-review.hbs',{
  actor:actor.name,sealingReservation:sealing.pending,cards:[...cards.map(row=>row.message.uuid),...orphans.map(row=>row.name)]
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-damage-review'],position:{width:560},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>({acknowledged:button.form.elements.acknowledged?.checked===true,rescued:button.form.elements.sealingRescued?.value})},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked||(sealing.pending&&!form.elements.sealingRescued?.value);};form.addEventListener('change',refresh);refresh();}});
 if(accepted?.acknowledged!==true)return null;
 if(sealing.pending){
  if(!['yes','no'].includes(accepted.rescued))return null;
  const result=await reviewSealingFlameReservation(actor,{expected:sealing.expected,acknowledged:true,rescued:accepted.rescued==='yes'});
  if(!result.ok){ui.notifications.warn(words('Failed'));return result;}
 }
 for(const {message,state} of cards){
  const result=await reviewDamageSignature(message,{expected:state.expected,acknowledged:true});
  if(!result.ok){ui.notifications.warn(words('Failed'));return result;}
 }
 for(const orphan of orphans){
  const result=await recoverOrphanDamageCast(actor,{key:orphan.key,expected:orphan.expected,acknowledged:true});
  if(!result.ok){ui.notifications.warn(words('Failed'));return result;}
 }
 ui.notifications.info(words('Done'));actor.sheet?.render(false);return {ok:true};
}
