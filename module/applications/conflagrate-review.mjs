import {conflagrateApplyReady,conflagrateReviewState,requestConflagrateReview} from '../effects/conflagrate.mjs';

const words=key=>game.i18n.localize(`AZEROTH.Conflagrate.${key}`);

/** Called before chat's ordinary data-action listeners are installed. */
export function showConflagrateState(message,html) {
  const state=conflagrateReviewState(message);
  if(!state)return;
  const done=message.getFlag('azeroth-rpg','conflagrateDamage')?.stage==='complete';
  for(const button of html.querySelectorAll('[data-action="applyDamage"]')){
    button.disabled=state.reviewed||done||!conflagrateApplyReady(message);
    if(state.reviewed||done)button.textContent=words(state.reviewed?'ReviewedButton':'DamageApplied');
    else if(button.disabled)button.title=words('Unresolved');
  }
  let box=html.querySelector('[data-conflagrate-status]');
  // Legacy cards predate the placeholder. Keep their review door available.
  if(!box){
    box=document.createElement('div');box.dataset.conflagrateStatus='';
    const note=document.createElement('p');note.dataset.conflagrateNote='';box.append(note);
    (html.querySelector('.azeroth-card')??html).append(box);
  }
  box.hidden=!state.pending&&!state.reviewed;
  box.querySelector('[data-conflagrate-note]').textContent=words(state.reviewed?'Reviewed':'Unresolved');
  let button=box.querySelector('[data-action="reviewConflagrate"]');
  if(!button&&state.pending&&game.user.isGM){
    const actions=document.createElement('div');actions.className='azeroth-card-actions';
    button=document.createElement('button');button.type='button';button.dataset.action='reviewConflagrate';
    button.textContent=words('Review');actions.append(button);box.append(actions);
  }
  if(button&&(!state.pending||!game.user.isGM))button.remove();
}

/** Explicit GM acknowledgement; closing or Cancel writes nothing. */
export async function reviewConflagrate(message) {
  if(!game.user.isGM)return null;
  const state=conflagrateReviewState(message);
  if(!state?.pending)return null;
  const remaining=state.sources.filter(source=>source.remaining).length;
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/conflagrate-review.hbs',{
    target:state.target,damage:state.damage??words('NotRecorded'),remaining,
    sources:state.sources.map(source=>({...source,status:words(source.remaining?'BurnRemaining':'BurnEnded')}))
  });
  const acknowledged=await foundry.applications.api.DialogV2.wait({
    window:{title:words('Review')},classes:['azeroth','azeroth-conflagrate-review'],position:{width:500},content,rejectClose:false,
    buttons:[{action:'review',label:words('MarkReviewed'),callback:(_event,button)=>!remaining&&button.form.elements.acknowledged?.checked===true},
      {action:'cancel',label:words('Cancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const update=()=>{form.querySelector('[data-action="review"]').disabled=Boolean(remaining)||form.elements.acknowledged?.checked!==true;};
      form.addEventListener('change',update);update();
    }
  });
  if(!acknowledged)return null;
  const result=await requestConflagrateReview(message,state.expected);
  ui.notifications[result?.ok?'info':'warn'](words(result?.ok?'Reviewed':'ReviewChanged'));
  return result;
}
