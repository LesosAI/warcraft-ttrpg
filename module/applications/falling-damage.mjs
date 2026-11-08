/** GM adjudicates the amount; the existing damage door applies D-813 protection. */
export async function applyFallingDamage(actor){
  if(!game.user?.isGM||!actor?.isOwner)return null;
  const t=key=>game.i18n.localize(`AZEROTH.Falling.${key}`);
  const amount=await foundry.applications.api.DialogV2.prompt({
    window:{title:t('Title')},classes:['azeroth'],
    content:`<p>${t('Instruction')}</p><label>${t('Amount')} <input name="damage" type="number" min="0" step="1" value="0" required></label>`,
    ok:{label:t('Apply'),callback:(_event,button)=>Number(button.form.elements.damage.value)},rejectClose:false
  });
  if(!Number.isSafeInteger(amount)||amount<0||!game.user?.isGM||!actor.isOwner)return null;
  const outcome={};await actor.applyDamage(amount,{falling:true,attack:false,struck:false,outcome});
  return outcome;
}
export function registerFallingDamage(){
  Hooks.on('getActorContextOptions',(_app,options)=>options.push({
    label:'AZEROTH.Falling.Title',icon:'fa-solid fa-person-falling',
    visible:li=>game.user?.isGM&&!!game.actors.get(li.dataset.entryId)?.system?.health,
    onClick:(_event,li)=>applyFallingDamage(game.actors.get(li.dataset.entryId))
  }));
}
