import {helmetReviewState,reviewHelmetResolution} from '../effects/helmet-resolution.mjs';
export async function reviewHelmet(message){
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
  const state=helmetReviewState(message);if(!state.pending)return null;
  const words=key=>game.i18n.localize(`AZEROTH.HungerMastered.${key}`);
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/helmet-review.hbs',{
    target:state.strike.target.name??state.strike.target.actorId,dc:state.strike.dc,
    total:state.strike.save?.total??'—',prone:state.statuses.includes('prone'),
    stage:game.i18n.localize(state.strike.state==='saving'?'AZEROTH.Signature.Helmet.AwaitingSave':'AZEROTH.Signature.Helmet.Applying')
  });
  const accepted=await foundry.applications.api.DialogV2.wait({
    window:{title:game.i18n.localize('AZEROTH.Signature.Helmet.Review')},classes:['azeroth'],position:{width:620},content,rejectClose:false,
    buttons:[{action:'review',label:words('ReviewConfirm'),callback:(_event,button)=>button.form.elements.acknowledged.checked===true},
      {action:'cancel',label:words('ReviewCancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged.checked;};
      form.addEventListener('change',refresh);refresh();
    }
  });
  if(!accepted)return null;
  const result=await reviewHelmetResolution(message,{expected:state.expected,acknowledged:true});
  ui.notifications[result.ok?'info':'warn'](words(result.ok?'ReviewDone':'ReviewChanged'));
  return result;
}
