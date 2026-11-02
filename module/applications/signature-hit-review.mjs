import {hitSignatureReviewState,reviewHitSignatures} from '../effects/signature-turn-use.mjs';
export async function reviewSignatureHit(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=hitSignatureReviewState(actor);if(!state.pending.length)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.HitReview.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-hit-review.hbs',{
  actor:actor.name,attempts:state.pending.map(id=>({id,event:state.records[id].pending.event})),
  cards:state.cards.map(card=>card.id),pools:state.pools.map(pool=>({name:pool.name,value:pool.value}))
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-hit-review'],position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{
   const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
   form.addEventListener('change',refresh);refresh();
  }});
 if(!accepted)return null;
 const result=await reviewHitSignatures(actor,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
