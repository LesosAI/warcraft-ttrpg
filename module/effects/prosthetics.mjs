/** GM attaches a prosthetic to an existing, explicitly identified injury. No injury is cured. */
import {PROSTHETIC_BINDING,PROSTHETIC_LIMBS,TYPED_INJURY,prostheticKind,bindingEligible,injuryFingerprint,activeProsthetics} from "../rules/prosthetics.mjs";
import {DEVICE_BROKEN} from "../rules/device-context.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {skillRowsFor} from "../rules/skills.mjs";
const NS="azeroth-rpg",writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
async function confirmClassification(actor,injury,{limb,handSlot}){
  if(!writer()||!injury)return false;
  const html=foundry.utils.escapeHTML,t=k=>game.i18n.localize(`AZEROTH.Prosthetic.${k}`);
  return foundry.applications.api.DialogV2.confirm({window:{title:t("Classify")},content:`<p>${game.i18n.format("AZEROTH.Prosthetic.Preview",{
    actor:html(actor.name),injury:html(injury.name),limb:html(t(limb)),hand:html(t(handSlot==="offHand"?"OffHand":"MainHand"))})}</p>`});
}
const heldLeg=(actor,item)=>writer()&&actor?.isOwner&&item?.parent?.uuid===actor.uuid&&actor.items.get(item.id)===item
  &&prostheticKind(item)==="leg"&&(item.system.quantity??1)>0&&guardPendingCustodyItem(item).ok;
export async function markProstheticLegDamaged(actor,item){
  if(!heldLeg(actor,item))return false;
  const event=foundry.utils.randomID(32);await item.setFlag(NS,DEVICE_BROKEN,{version:1,event,fall:true});
  return heldLeg(actor,item)&&item.getFlag(NS,DEVICE_BROKEN)?.event===event;
}
export async function repairProstheticLeg(actor,item,{repairer=actor,dc,run=null}={}){
  if(!heldLeg(actor,item)||!Number.isSafeInteger(dc)||dc<0||!repairer?.isOwner)return false;
  const broken=item.getFlag(NS,DEVICE_BROKEN);if(broken?.version!==1)return false;
  if(!run){const {rollWithDialog}=await import("../applications/actions.mjs");run=rollWithDialog;}
  const card=await run(repairer,{kind:"skill",skill:"tinkering",title:game.i18n.localize("AZEROTH.Prosthetic.LegRepair"),
    dc,modifiers:skillRowsFor(repairer,"tinkering"),alwaysPrompt:true});
  if(!heldLeg(actor,item)||item.getFlag(NS,DEVICE_BROKEN)?.event!==broken.event
    ||card?.rolls?.[0]?.outcome?.success!==true)return false;
  await item.unsetFlag(NS,DEVICE_BROKEN);return heldLeg(actor,item)&&!item.getFlag(NS,DEVICE_BROKEN);
}
export async function classifyProstheticInjury(actor,injury,{kind,limb,handSlot}={}){
  if(!writer()||!actor?.isOwner||injury?.parent?.uuid!==actor.uuid||actor.effects.get(injury.id)!==injury
    ||injury.getFlag(NS,"injury")!==true||!PROSTHETIC_LIMBS[kind]?.includes(limb)
    ||injury.getFlag(NS,"location")!==(kind==="eye"?"head":"limb")
    ||kind==="hand"&&!["mainHand","offHand"].includes(handSlot))return false;
  await injury.setFlag(NS,TYPED_INJURY,{version:1,kind,limb,...(kind==="hand"?{handSlot}:{})});return writer();
}
export async function bindProsthetic(actor,item,injury,limb){
  if(!writer()||!actor?.isOwner||!bindingEligible(actor,item,injury,limb))return false;
  const binding={version:1,actorUuid:actor.uuid,itemUuid:item.uuid,injuryUuid:injury.uuid,kind:prostheticKind(item),limb,fingerprint:injuryFingerprint(injury)};
  await item.setFlag(NS,PROSTHETIC_BINDING,binding);
  return writer()&&bindingEligible(actor,item,injury,limb)&&item.getFlag(NS,PROSTHETIC_BINDING)?.fingerprint===binding.fingerprint;
}
export async function detachProsthetic(actor,item){
  if(!writer()||!actor?.isOwner||item?.parent?.uuid!==actor.uuid||actor.items.get(item.id)!==item)return false;
  await item.unsetFlag(NS,PROSTHETIC_BINDING);return writer();
}
export function registerProsthetics(){
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.Prosthetic.MarkDamage",icon:"fa-solid fa-person-falling-burst",
    visible:li=>writer()&&[...(game.actors.get(li.dataset.entryId)?.items??[])].some(i=>prostheticKind(i)==="leg"),
    onClick:async(_event,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;
      const html=foundry.utils.escapeHTML,t=k=>game.i18n.localize(`AZEROTH.Prosthetic.${k}`);
      const legs=[...actor.items].filter(i=>prostheticKind(i)==="leg");
      const selected=await foundry.applications.api.DialogV2.prompt({window:{title:t("MarkDamage")},content:`<p>${t("MarkDamageInstruction")}</p><select name="leg">${legs.map(i=>`<option value="${html(i.id)}">${html(i.name)}</option>`).join("")}</select>`,
        ok:{label:t("Apply"),callback:(_e,b)=>b.form.elements.leg.value},rejectClose:false});
      if(selected&&!await markProstheticLegDamaged(actor,actor.items.get(selected)))ui.notifications?.warn(t("Refused"));
    }}));
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.Prosthetic.Manage",icon:"fa-solid fa-hand",
    visible:li=>writer()&&[...(game.actors.get(li.dataset.entryId)?.items??[])].some(prostheticKind),
    onClick:async(_event,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;
      const items=[...actor.items].filter(prostheticKind),injuries=[...actor.effects].filter(e=>e.getFlag(NS,"injury")===true);
      const t=k=>game.i18n.localize(`AZEROTH.Prosthetic.${k}`),html=foundry.utils.escapeHTML;
      const option=(key,label)=>`<option value="${html(key)}">${html(label)}</option>`;
      const selected=await foundry.applications.api.DialogV2.prompt({window:{title:t("Manage")},
        content:`<p>${t("Instruction")}</p><label>${t("Item")}<select name="item">${items.map(i=>option(i.id,i.name)).join("")}</select></label>
        <label>${t("Injury")}<select name="injury">${option("detach",t("Detach"))}${injuries.map(e=>option(e.id,e.name)).join("")}</select></label>
        <label>${t("Limb")}<select name="limb">${Object.values(PROSTHETIC_LIMBS).flat().map(k=>option(k,t(k))).join("")}</select></label>
        <label>${t("HandSlot")}<select name="handSlot">${option("mainHand",t("MainHand"))}${option("offHand",t("OffHand"))}</select></label>`,
        ok:{label:t("Apply"),callback:(_e,b)=>({item:b.form.elements.item.value,injury:b.form.elements.injury.value,limb:b.form.elements.limb.value,handSlot:b.form.elements.handSlot.value})},rejectClose:false});
      if(!selected||!writer())return;
      const item=actor.items.get(selected.item);
      if(selected.injury!=="detach"&&!await confirmClassification(actor,actor.effects.get(selected.injury),selected))return;
      if(selected.injury!=="detach"&&!await classifyProstheticInjury(actor,actor.effects.get(selected.injury),{kind:prostheticKind(item),limb:selected.limb,handSlot:selected.handSlot}))return;
      const ok=selected.injury==="detach"?await detachProsthetic(actor,item):await bindProsthetic(actor,item,actor.effects.get(selected.injury),selected.limb);
      if(!ok)ui.notifications?.warn(t("Refused"));
    }}));
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.Prosthetic.Classify",icon:"fa-solid fa-notes-medical",
    visible:li=>writer()&&[...(game.actors.get(li.dataset.entryId)?.effects??[])].some(e=>e.getFlag(NS,"injury")===true),
    onClick:async(_event,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;
      const t=k=>game.i18n.localize(`AZEROTH.Prosthetic.${k}`),html=foundry.utils.escapeHTML;
      const injuries=[...actor.effects].filter(e=>e.getFlag(NS,"injury")===true),option=(k,v)=>`<option value="${html(k)}">${html(v)}</option>`;
      const selected=await foundry.applications.api.DialogV2.prompt({window:{title:t("Classify")},content:`<p>${t("ClassifyInstruction")}</p>
        <select name="injury">${injuries.map(e=>option(e.id,e.name)).join("")}</select>
        <select name="limb">${Object.values(PROSTHETIC_LIMBS).flat().map(k=>option(k,t(k))).join("")}</select>
        <select name="handSlot">${option("mainHand",t("MainHand"))}${option("offHand",t("OffHand"))}</select>`,
        ok:{label:t("Apply"),callback:(_e,b)=>({injury:b.form.elements.injury.value,limb:b.form.elements.limb.value,handSlot:b.form.elements.handSlot.value})},rejectClose:false});
      if(!selected)return;
      const kind=Object.keys(PROSTHETIC_LIMBS).find(k=>PROSTHETIC_LIMBS[k].includes(selected.limb));
      if(!await confirmClassification(actor,actor.effects.get(selected.injury),selected))return;
      if(!await classifyProstheticInjury(actor,actor.effects.get(selected.injury),{kind,limb:selected.limb,handSlot:selected.handSlot}))ui.notifications?.warn(t("Refused"));
    }}));
}
