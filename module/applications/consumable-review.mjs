import {consumableReviewState,reviewConsumableReceipt} from '../effects/consumable-receipt.mjs';
export async function reviewConsumableUse(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=consumableReviewState(actor);if(!state.pending)return null;
 const t=key=>game.i18n.localize(`AZEROTH.Use.Receipt.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/consumable-review.hbs',
  {actor:actor.name,receipt:state.receipt,quantity:state.quantity});
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:t('Review')},classes:['azeroth','azeroth-consumable-review'],
  position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:t('MarkReviewed'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:t('Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{const form=dialog.element.querySelector('form');
   const refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};form.addEventListener('change',refresh);refresh();}});
 if(!accepted)return null;
 const result=await reviewConsumableReceipt(actor,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](t(result.ok?'Reviewed':'Failed'));return result;
}
