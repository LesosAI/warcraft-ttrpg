import {healingSignatureReviewState,reviewHealingSignatures} from '../effects/signature-healing-review.mjs';
export async function reviewSignatureHealing(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=healingSignatureReviewState(actor);if(!state.pending)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.HealingReview.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-healing-review.hbs',{
  actor:actor.name,allowances:state.turns.pending,cards:state.context.cards.map(row=>row.uuid),
  carriers:state.context.carriers.map(row=>row.uuid)
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-healing-review'],position:{width:560},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};form.addEventListener('change',refresh);refresh();}});
 if(accepted!==true)return null;
 const result=await reviewHealingSignatures(actor,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
