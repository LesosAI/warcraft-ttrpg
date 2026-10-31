import {signatureUseReviewState,reviewApprovedSignatureUses} from '../effects/approved-signature-use.mjs';
export async function reviewSignatureUses(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=signatureUseReviewState(actor);if(!state.pending)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.Review.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-use-review.hbs',{
  actor:actor.name,health:state.health,halves:state.budget?.halfActions??'—',
   entries:Object.entries(state.records).map(([id,row])=>({id,itemUuid:row.itemUuid,writer:row.writer,shot:row.shot??null,
   healing:row.values?.healing??0,temporaryHealth:row.values?.temporaryHealth??0}))
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-use-review'],position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:words('Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{
   const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
   form.addEventListener('change',refresh);refresh();
  }});
 if(!accepted)return null;
 const result=await reviewApprovedSignatureUses(actor,{expected:state.expected,acknowledged:true});
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
