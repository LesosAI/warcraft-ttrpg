import {weaponReloadState} from "../effects/reload-state.mjs";
import {RELOAD_PAYMENT} from "../effects/reload-payment.mjs";
import {requestWeaponReload,requestWeaponReloadReview} from "../effects/reload-query.mjs";

const words = key => game.i18n.localize(`AZEROTH.Reload.${key}`);
export function pendingReload(weapon) {
  const receipt=weapon?.getFlag?.("azeroth-rpg",RELOAD_PAYMENT);
  return receipt?.version === 1 && ["paying","firing"].includes(receipt.stage) ? receipt : null;
}

/** Read-only text shared by character and NPC carried rows. */
export function reloadStatus(weapon) {
  if (weapon?.type !== "weapon") return null;
  if (pendingReload(weapon)) return words("Pending");
  const current=weaponReloadState(weapon.parent,weapon.id);
  if (!current || current.cost === null) return null;
  if (current.remaining === null) return words("Pending");
  return current.remaining > 0
    ? game.i18n.format("AZEROTH.Reload.Progress",{remaining:current.remaining}) : null;
}

/** NPCs use the same ownership, payment and recovery controls as characters. */
export function npcReloadMenu(sheet) {
  const itemOf=target=>sheet.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId)??null;
  return new foundry.applications.ux.ContextMenu.implementation(sheet.element,
    ".azeroth-carried-item[data-item-id], .azeroth-attack-held[data-item-id]",
    reloadMenuEntries(itemOf),{jQuery:false,fixed:true});
}

export async function reloadFromSheet(weapon) {
  if (!weapon?.isOwner) return null;
  const current=weaponReloadState(weapon.parent,weapon.id);
  if (!current || !(current.remaining > 0)) return null;
  const result=await requestWeaponReload(weapon,structuredClone(current.state));
  ui.notifications[result.ok ? "info" : "warn"](result.ok
    ? game.i18n.format("AZEROTH.Reload.Progress",{remaining:result.remaining})
    : words(result.reason === "pending" ? "Pending" : "Refused"));
  return result;
}

export async function reviewReloadFromSheet(weapon) {
  if (!game.user?.isGM) return null;
  const receipt=pendingReload(weapon);
  if (!receipt) return null;
  const expected=structuredClone(receipt);
  const isShot=receipt.stage === "firing";
  const content=await foundry.applications.handlebars.renderTemplate(
    "systems/azeroth-rpg/templates/dialog/reload-review.hbs",{name:weapon.name,isShot});
  const decision=await foundry.applications.api.DialogV2.wait({
    window:{title:words("Review")},classes:["azeroth","azeroth-ice-block-review"],
    position:{width:540},content,rejectClose:false,
    buttons:[{action:"review",label:words("Confirm"),callback:(_event,button)=>{
      const form=button.form;
      if (form.elements.acknowledged?.checked !== true || !["yes","no"].includes(form.elements.occurred?.value)) return null;
      return {acknowledged:true,[isShot ? "fired" : "paid"]:form.elements.occurred.value === "yes"};
    }},{action:"cancel",label:words("Cancel"),default:true,callback:()=>null}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector("form");
      const update=()=>{form.querySelector('[data-action="review"]').disabled=
        form.elements.acknowledged?.checked !== true || !["yes","no"].includes(form.elements.occurred?.value);};
      form.addEventListener("change",update);update();
    }
  });
  if (!decision) return null;
  const result=await requestWeaponReloadReview(weapon,expected,decision);
  ui.notifications[result.ok ? "info" : "warn"](words(result.ok ? "Reviewed" : "Pending"));
  return result;
}

/** Same entries on carried rows and equipped weapon sockets. */
export function reloadMenuEntries(itemOf) {
  return [{label:"AZEROTH.Reload.Action",icon:"fa-solid fa-rotate-right",
    visible:target=>{
      const weapon=itemOf(target);
      return !!weapon?.isOwner && !pendingReload(weapon)
        && (weaponReloadState(weapon.parent,weapon.id)?.remaining ?? 0) > 0;
    },onClick:(_event,target)=>reloadFromSheet(itemOf(target))},
  {label:"AZEROTH.Reload.Review",icon:"fa-solid fa-triangle-exclamation",
    visible:target=>!!game.user?.isGM && !!pendingReload(itemOf(target)),
    onClick:(_event,target)=>reviewReloadFromSheet(itemOf(target))}];
}
