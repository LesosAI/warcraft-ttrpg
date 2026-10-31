import {cannonballReviewState,reviewCannonballResolution} from '../effects/cannonball-resolution.mjs';
export async function reviewCannonball(message){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=cannonballReviewState(message);if(!state.pending)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.Cannonball.Review.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/cannonball-review.hbs',{
  target:state.shot.target.name??state.shot.target.actorId,stage:state.shot.state,
  dc:state.shot.dc,damage:state.shot.damage,passed:state.shot.passedDamage,
  health:state.health?.value??'—',temp:state.health?.temp??0,
  saveTotal:state.shot.save?.total??'—',resolvedDamage:state.shot.damageResult?.damage??'—'
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-cannonball-review'],position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{
   const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
   form.addEventListener('change',refresh);refresh();
  }});
 if(!accepted)return null;
 const result=await reviewCannonballResolution(message,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
