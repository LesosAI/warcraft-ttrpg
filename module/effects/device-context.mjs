/** Break only the exact carried tools selected on a real qualifying rolled natural1. */
import {DEVICE_BROKEN,contextDevice,deviceBroken,selectedContextDevices} from "../rules/device-context.mjs";
import {dispersionFor} from "../rules/dispersion.mjs";
const NS="azeroth-rpg";
const repairable=item=>contextDevice(item)?.breaks||(item?.type==="gear"&&item.system?.identifier==="mechanical-leg"
  &&item.system?.source?.document==="08-EQUIPMENT"&&item.system.source.section==="13 · Ordnance and devices · Devices");
export function validateDeviceChoices(actor,context,chosen){return selectedContextDevices(dispersionFor(actor)?[]:actor.items??[],context,chosen).ok;}
export async function breakSelectedDevices(actor,{kind,skill,chosen=[],roll}={}){
  if(Number(roll?.natural)!==1)return;
  // Re-evaluate the selected physical items; a broken/stale choice never grants a fresh bonus.
  const selected=selectedContextDevices(actor.items??[],{kind,skill},chosen);
  if(!selected.ok)throw Error("Selected device changed before its break was recorded");
  for(const item of selected.items){
    if(!contextDevice(item)?.breaks)continue;
    const event=foundry.utils.randomID(32);
    await item.setFlag(NS,DEVICE_BROKEN,{version:1,event,natural:1,skill});
    if(item.getFlag(NS,DEVICE_BROKEN)?.event!==event)throw Error("Device break write requires GM review");
  }
}
/** Repair costs/time are GM-adjudicated; this door only records an already completed repair. */
export function registerDeviceContext(){
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.DeviceContext.Repair",icon:"fa-solid fa-screwdriver-wrench",
    visible:li=>game.user?.isGM&&[...(game.actors.get(li.dataset.entryId)?.items??[])].some(deviceBroken),
    onClick:async(_event,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!game.user?.isGM||!actor?.isOwner)return;
      const t=key=>game.i18n.localize(`AZEROTH.DeviceContext.${key}`);
      const broken=[...actor.items].filter(item=>repairable(item)&&deviceBroken(item));
      const html=foundry.utils.escapeHTML;
      const selected=await foundry.applications.api.DialogV2.prompt({window:{title:t("Repair")},
        content:`<p>${t("RepairInstruction")}</p><select name="device">${broken.map(item=>`<option value="${html(item.id)}">${html(item.name)}</option>`).join("")}</select>`,
        ok:{label:t("Repair"),callback:(_e,button)=>button.form.elements.device.value},rejectClose:false});
      if(!selected||!game.user?.isGM||!actor.isOwner)return;
      const item=actor.items.get(selected);if(!repairable(item)||!deviceBroken(item))return;
      if(item.system.identifier==="mechanical-leg"){
        const repairers=[...game.actors].filter(a=>a.isOwner);
        const pick=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("AZEROTH.Prosthetic.LegRepair")},
          content:`<label>${game.i18n.localize("AZEROTH.Prosthetic.RepairDC")}<input name="dc" type="number" min="0" step="1" required></label><select name="repairer">${repairers.map(a=>`<option value="${html(a.id)}">${html(a.name)}</option>`).join("")}</select>`,
          ok:{label:t("Repair"),callback:(_e,b)=>({dc:Number(b.form.elements.dc.value),repairer:b.form.elements.repairer.value})},rejectClose:false});
        if(!pick)return;
        const {repairProstheticLeg}=await import("./prosthetics.mjs");
        await repairProstheticLeg(actor,item,{dc:pick.dc,repairer:game.actors.get(pick.repairer)});return;
      }
      await item.unsetFlag(NS,DEVICE_BROKEN);
    }}));
}
