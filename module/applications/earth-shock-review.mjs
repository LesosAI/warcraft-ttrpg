import {earthShockPending,reviewEarthShock} from '../effects/reaction-bar.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
const EARTH_SHOCK_REVIEW='systems/azeroth-rpg/templates/chat/partials/earth-shock-review.hbs';
const words=key=>game.i18n.localize(`AZEROTH.ReactionBar.Review.${key}`);
const activeGM=()=>game.user?.isGM && game.users?.activeGM===game.user;

export function showEarthShockReview(message,html) {
  const show=activeGM() && Boolean(earthShockPending(message));
  let box=html.querySelector('[data-earth-shock-review]');
  if(!box && show) {
    box=drawCardPartial(EARTH_SHOCK_REVIEW,{},message);
    if(box)(html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if(box)box.hidden=!show;
}

export async function reviewEarthShockFromCard(card) {
  if(!activeGM())return null;
  const expected=earthShockPending(card);if(!expected)return null;
  const target=card.flags['azeroth-rpg'].targets[expected.claim.index];
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/earth-shock-review.hbs',{
    target:target.name ?? target.actorId,index:expected.claim.index+1});
  const acknowledged=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
    classes:['azeroth','azeroth-earth-shock-review'],position:{width:600},content,rejectClose:false,
    buttons:[{action:'review',label:words('Confirm'),callback:(_event,button)=>button.form.elements.acknowledged.checked===true},
      {action:'cancel',label:words('Cancel'),default:true,callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const update=()=>{form.querySelector('[data-action="review"]').disabled=!form.elements.acknowledged.checked;};
      form.addEventListener('change',update);update();
    }});
  if(acknowledged!==true)return null;
  const result=await reviewEarthShock({card,expected,acknowledged});
  const key=result.ok?'Done':result.reason==='busy'?'Busy':result.reason==='writerActive'?'WriterActive':'Changed';
  ui.notifications[result.ok?'info':'warn'](words(key));return result;
}
