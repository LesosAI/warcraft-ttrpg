import {dispersionEndingReviewState,reviewDispersionEnding} from '../effects/dispersion-ending.mjs';
export async function reviewDispersionAftermath(actor) {
  if(!game.user?.isGM || game.users?.activeGM?.id!==game.user.id)return null;
  const state=dispersionEndingReviewState(actor);if(!state.pending.length)return null;
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/dispersion-aftermath-review.hbs',{
    actor:actor.name,pending:state.pending.map(r=>({id:r.effectId,cast:r.receipt.cast})),
    effects:state.effects.map(e=>({id:e._id,name:e.name}))});
  const selected=await foundry.applications.api.DialogV2.wait({window:{title:'Review Dispersion aftermath'},
    classes:['azeroth','azeroth-dispersion-aftermath-review'],position:{width:560},content,rejectClose:false,
    buttons:[{action:'review',label:'Mark reviewed',callback:(_event,button)=>button.form.elements.acknowledged?.checked
      ? button.form.elements.effectId?.value : false},{action:'cancel',label:'Cancel',default:true,callback:()=>false}],
    render:(_event,dialog)=>{const form=dialog.element.querySelector('form');
      const refresh=event=>{
        if(event?.target===form.elements.effectId)form.elements.acknowledged.checked=false;
        form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked || !form.elements.effectId?.value;
      };
      form.addEventListener('change',refresh);refresh();}});
  if(typeof selected!=='string'||!state.pending.some(row=>row.effectId===selected))return null;
  const result=await reviewDispersionEnding(actor,{effectId:selected,expected:state.expected,acknowledged:true});
  ui.notifications?.[result?.ok?'info':'warn'](result?.ok?'Dispersion aftermath marked reviewed. No effects changed.'
    :'The aftermath review could not finish. Check the current effects and pending receipt before reviewing again.');
  return result;
}
