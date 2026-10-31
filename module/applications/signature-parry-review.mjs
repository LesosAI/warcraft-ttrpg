import {parrySignatureReviewState,reviewParrySignature} from '../effects/signature-turn-use.mjs';
export async function reviewSignatureParry(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=parrySignatureReviewState(actor);if(!state.pending)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.ParryReview.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-parry-review.hbs',{
  actor:actor.name,event:state.record.pending.event,writer:state.record.pending.writer,
  pools:state.pools.map(pool=>({name:pool.name,value:pool.value})),
  halves:state.budget?.halfActions??'—'
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-parry-review'],position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{
   const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
   form.addEventListener('change',refresh);refresh();
  }});
 if(!accepted)return null;
 const result=await reviewParrySignature(actor,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
