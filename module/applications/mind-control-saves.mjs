import {mindControlOn} from '../rules/mind-control.mjs';
import {MIND_CONTROL_REPEATS,resumeMindControlRepeat,reviewMindControlRepeat} from '../effects/mind-control-repeat.mjs';
import {drawCardPartial} from '../helpers/card-partials.mjs';
import {upgradeMindControlSustain} from '../effects/mind-control-upgrade.mjs';
const MIND_CONTROL_SAVES='systems/azeroth-rpg/templates/chat/partials/mind-control-saves.hbs';
const words=key=>game.i18n.localize(`AZEROTH.MindControl.Saves.${key}`);
const activeGM=()=>game.user?.isGM && game.users?.activeGM===game.user;

export function showMindControlSaves(message,html) {
  const show=activeGM() && message.flags?.['azeroth-rpg']?.mindControlResolution?.stage==='active';
  let box=html.querySelector('[data-mind-control-saves]');
  if (!box && show) {
    box=drawCardPartial(MIND_CONTROL_SAVES,{},message);
    if(box)(html.querySelector('.azeroth-card-body') ?? html).append(box);
  }
  if(box) box.hidden=!show;
}

export async function mindControlSavesFromCard(message) {
  if(!activeGM()) return null;
  const receipt=message.flags?.['azeroth-rpg']?.mindControlResolution;
  const actor=fromUuidSync(receipt?.targetUuid ?? '');
  const effects=[...(actor?.effects ?? [])].filter(effect=>mindControlOn(effect,actor.uuid)?.messageUuid===message.uuid);
  if(effects.length!==1) {ui.notifications.info(words('None'));return null;}
  return mindControlSavesForEffect(actor,effects[0]);
}

/** The surviving carrier is sufficient even after its original chat card is deleted. */
export async function mindControlSavesForEffect(actor,effect) {
  if(!activeGM() || effect?.parent!==actor || actor?.effects?.get(effect.id)!==effect) return null;
  const record=mindControlOn(effect,actor.uuid);
  if(!record) {ui.notifications.info(words('None'));return null;}
  const legacy=effect.getFlag('azeroth-rpg','sustained')!==true;
  const carrierSnapshot=effect.toObject();
  const attempts=effect.getFlag('azeroth-rpg',MIND_CONTROL_REPEATS) ?? [];
  if(!Array.isArray(attempts)) {ui.notifications.info(words('None'));return null;}
  const expected=structuredClone({record,attempts});
  const rows=attempts.filter(row=>['cancelled','rolling','ending'].includes(row.stage)).map(row=>{
    let round='?',turn='?';try {const parts=JSON.parse(row.key);round=parts[1];turn=parts[2]+1;} catch {}
    return {...row,round,turn,cancelled:row.stage==='cancelled'};
  });
  if(!rows.length && !legacy) {ui.notifications.info(words('None'));return null;}
  const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/dialog/mind-control-saves.hbs',{
    target:actor.name,dc:record.dc,rows,legacy});
  const choice=await foundry.applications.api.DialogV2.wait({window:{title:words('Title')},
    classes:['azeroth','azeroth-mind-control-saves'],position:{width:600},content,rejectClose:false,
    buttons:[...(legacy ? [{action:'upgrade',label:words('Upgrade'),callback:(_event,button)=>({action:'upgrade',acknowledged:button.form.elements.upgradeAcknowledged.checked})}] : []),
      {action:'resume',label:words('Resume'),callback:(_event,button)=>({action:'resume',index:button.form.elements.attempt.value})},
      {action:'review',label:words('Review'),callback:(_event,button)=>({action:'review',index:button.form.elements.attempt.value,acknowledged:button.form.elements.acknowledged.checked})},
      {action:'cancel',label:words('Cancel'),default:true,callback:()=>null}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector('form');
      const update=event=>{
        if(event?.target===form.elements.attempt) form.elements.acknowledged.checked=false;
        const value=form.elements.attempt.value,row=value===''?null:rows[Number(value)];
        form.querySelector('[data-action="resume"]').disabled=!row?.cancelled;
        form.querySelector('[data-action="review"]').disabled=!row || row.cancelled || !form.elements.acknowledged.checked;
        if(legacy) form.querySelector('[data-action="upgrade"]').disabled=!form.elements.upgradeAcknowledged.checked;
      };form.addEventListener('change',update);update();
    }});
  if(choice?.action==='upgrade') {
    const result=await upgradeMindControlSustain({actor,effect,expected:carrierSnapshot,acknowledged:choice.acknowledged});
    ui.notifications[result.ok?'info':'warn'](words(result.ok?'Upgraded':result.reason==='capacity'?'Capacity':'UpgradeUnresolved'));
    return result;
  }
  if(!choice || choice.index==='') return null;
  const row=rows[Number(choice.index)];if(!row || !activeGM()) return null;
  const args={actor,effect,key:row.key,expected,user:game.user};
  let result;
  if(choice.action==='resume') result=await resumeMindControlRepeat({...args,roll:async({actor,resilience,dc,resistOf})=>{
    const {resilienceWithDialog}=await import('./actions.mjs');
    return resilienceWithDialog(actor,resilience,null,{dc,link:resistOf});
  }});
  else result=await reviewMindControlRepeat({...args,acknowledged:choice.acknowledged});
  ui.notifications[result.ok?'info':'warn'](words(result.ok?'Done':'Unresolved'));
  return result;
}
