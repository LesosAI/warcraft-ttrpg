import {piccoloReviewState,reviewPiccoloResolution} from '../effects/piccolo-resolution.mjs';
export async function reviewPiccolo(message,index){
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
  const state=piccoloReviewState(message,index);if(!state.pending)return null;
  const words=key=>game.i18n.localize(`AZEROTH.Signature.Piccolo.Review.${key}`);
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/piccolo-review.hbs',{
    target:state.row.name??state.row.ref?.name??state.row.uuid,stage:state.row.state,
    dc:state.performance.dc,total:state.row.save?.total??'—',missing:!state.target,
    effects:state.effects.map(effect=>({name:effect.name,id:effect._id}))
  });
  const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
    classes:['azeroth','azeroth-piccolo-review'],position:{width:540},content,rejectClose:false,
    buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
      {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
      form.addEventListener('change',refresh);refresh();
    }});
  if(!accepted)return null;
  const result=await reviewPiccoloResolution(message,index,{expected:state.expected,acknowledged:true});
  ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
