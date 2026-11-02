import {killSignatureReviewState,reviewKillSignatures} from '../effects/signature-turn-use.mjs';
import {killCardReviewState,reviewKillCards} from '../effects/signature-kill-rewards.mjs';
export async function reviewSignatureKills(actor){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return null;
 const state=killSignatureReviewState(actor),cards=killCardReviewState(actor);
 if(!state.pending.length&&!cards?.cards.length)return null;
 const words=key=>game.i18n.localize(`AZEROTH.Signature.KillReview.${key}`);
 const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/signature-kill-review.hbs',{
  actor:actor.name,health:state.health.value,temp:state.health.temp??0,
  rows:[...state.cards.map(row=>({name:row.id==='death-grips'?'Death Grips':'Spinal Reaper',missing:!row.exists})),
   ...(cards?.cards??[]).flatMap(card=>['death-grips','spinal-reaper'].filter(id=>card.receipts[id]?.state==='pending'
    &&!state.cards.some(row=>row.id===id&&row.messageId===card.messageId)).map(id=>({name:id==='death-grips'?'Death Grips':'Spinal Reaper',missing:false})))]
 });
 const accepted=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
  classes:['azeroth','azeroth-signature-kill-review'],position:{width:540},content,rejectClose:false,
  buttons:[{action:'review',label:words('Complete'),callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
   {action:'cancel',label:game.i18n.localize('AZEROTH.Signature.Review.Cancel'),default:true,callback:()=>false}],
  render:(_event,dialog)=>{
   const form=dialog.element.querySelector('form'),refresh=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged?.checked;};
   form.addEventListener('change',refresh);refresh();
  }});
 if(!accepted)return null;
 let result={ok:false,reason:'changed'};
 if(killCardReviewState(actor)?.expected===cards?.expected){
  result=state.pending.length?await reviewKillSignatures(actor,{expected:state.expected,acknowledged:true}):{ok:true};
  if(result.ok&&cards.cards.length){
   const current=killCardReviewState(actor);
   result=current&&JSON.stringify(current.cards)===JSON.stringify(cards.cards)&&JSON.stringify(current.health)===JSON.stringify(cards.health)
    ?await reviewKillCards(actor,{expected:current.expected,acknowledged:true}):{ok:false,reason:'changed'};
  }
 }
 ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Failed'));return result;
}
