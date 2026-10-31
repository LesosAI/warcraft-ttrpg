import {dispersionCreationReviewState,requestDispersionCreationReview} from '../effects/dispersion-casting.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const DISPERSION_CREATION_REVIEW='systems/azeroth-rpg/templates/chat/partials/dispersion-creation-review.hbs';
const activeGM=()=>game.user?.isGM && game.users?.activeGM?.id===game.user.id;
export function showDispersionCreationState(message,html) {
  if(!activeGM() || !dispersionCreationReviewState(message)?.pending)return;
  const body=html.querySelector('.azeroth-card-body');if(!body || body.querySelector('[data-action="reviewDispersionCreation"]'))return;
  const button=drawCardPartial(DISPERSION_CREATION_REVIEW,{},message);if(button)body.append(button);
}
export async function reviewDispersionCreationCard(message) {
  if(!activeGM())return null;const state=dispersionCreationReviewState(message);if(!state?.pending)return null;
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/dispersion-review.hbs',{
    actor:state.actor.name,missing:state.actor.missing,effects:state.actor.effects.map(e=>({id:e._id,name:e.name,disabled:e.disabled}))});
  const acknowledged=await foundry.applications.api.DialogV2.wait({window:{title:game.i18n.localize('AZEROTH.Dispersion.ReviewCreation')},
    classes:['azeroth','azeroth-dispersion-review'],position:{width:560},content,rejectClose:false,
    buttons:[{action:'review',label:game.i18n.localize('AZEROTH.Dispersion.ReviewMark'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
      {action:'cancel',label:game.i18n.localize('AZEROTH.Dispersion.ReviewCancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{const form=dialog.element.querySelector('form');
      const refresh=()=>{form.querySelector('[data-action="review"]').disabled=form.elements.acknowledged?.checked!==true;};
      form.addEventListener('change',refresh);refresh();}});
  if(!acknowledged)return null;
  const result=await requestDispersionCreationReview(message,state.expected);
  ui.notifications?.[result?.ok?'info':'warn'](game.i18n.localize(result?.ok?'AZEROTH.Dispersion.ReviewDone':'AZEROTH.Dispersion.ReviewFailed'));
  return result;
}
