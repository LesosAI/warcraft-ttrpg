import {antivenomReviewState,reviewAntivenom} from '../effects/antivenom-use.mjs';

export async function reviewAntivenomUse(actor) {
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
  const state=antivenomReviewState(actor);if(!state.pending)return null;
  const localize=key=>game.i18n.localize(`AZEROTH.Use.Antivenom.${key}`);
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/antivenom-review.hbs',{
    actor:actor.name,receipt:state.receipt,quantity:state.quantity,effectPresent:state.effectPresent,
    halves:state.budget?.halfActions??null
  });
  const accepted=await foundry.applications.api.DialogV2.wait({window:{title:localize('Review')},
    classes:['azeroth','azeroth-antivenom-review'],position:{width:540},content,rejectClose:false,
    buttons:[{action:'review',label:localize('MarkReviewed'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
      {action:'cancel',label:localize('Cancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
      form.addEventListener('change',refresh);refresh();
    }});
  if(!accepted)return null;
  const result=await reviewAntivenom(actor,{expected:state.expected,acknowledged:true});
  ui.notifications[result.ok?'info':'warn'](localize(result.ok?'Reviewed':'ReviewFailed'));
  return result;
}
