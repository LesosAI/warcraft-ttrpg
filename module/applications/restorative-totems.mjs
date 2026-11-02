import {restorativeTotemContext,requestRestorativeTotem,RESTORATIVE_TOTEM_FLAG} from "../effects/restorative-totems.mjs";
import {RESTORATIVE_TOTEM_OFFER} from "../effects/restorative-totem-offers.mjs";

const text=(key,data={})=>game.i18n.format(`AZEROTH.RestorativeTotem.${key}`,data);

/** A player's choice is submitted as identities only; the GM rereads every fact. */
export async function chooseRestorativeTotem(message) {
  const offer=message?.flags?.["azeroth-rpg"]?.[RESTORATIVE_TOTEM_OFFER];
  if (!message?.author?.isGM || !offer) return null;
  const receipt=(game.combats.get(offer.combatId)?.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? []).find(row=>row.key===offer.key);
  if (receipt) {
    if (!["done","reviewed"].includes(receipt.stage) && game.user.isGM) return reviewRestorativeTotem(message);
    ui.notifications.info(text(["done","reviewed"].includes(receipt.stage)?"Already":"Uncertain"));return null;
  }
  const context=restorativeTotemContext(offer,game.user);
  if (!context.ok) {ui.notifications.warn(text("Unavailable"));return null;}
  const {restoration}=context;
  const targets=context.offered.filter(row=>game.user.isGM || row.actor.isOwner || row.token.object?.isVisible===true).map(row=>({
    id:row.id,name:row.name,disabled:Boolean(row.refusal),reason:row.refusal?text("OutOfReach"):null,
    pools:row.pools.map(pool=>({id:pool.itemId ?? "npc",name:row.actor.items?.get(pool.itemId)?.name ?? text("Mana"),value:pool.value,max:pool.max}))
  }));
  const health=restoration.resource==="health";
  const content=await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/restorative-totem.hbs",{
    health,targets,description:text(health?"HealthOffer":"ManaOffer",restoration),
    pools:targets.find(row=>!row.disabled)?.pools ?? []
  });
  const read=form=>({targets:health?[...form.querySelectorAll('input[name="target"]:checked')].map(input=>input.value)
    :targets.filter(row=>!row.disabled).map(row=>row.id),pool:form.elements.pool?.value ?? null});
  const valid=choice=>choice.targets.length>0 && (health ? choice.targets.length<=restoration.targets : Boolean(choice.pool));
  const choice=await foundry.applications.api.DialogV2.wait({
    window:{title:restoration.name},classes:["azeroth","azeroth-restorative-totem"],position:{width:440},
    content,rejectClose:false,buttons:[
      {action:"restore",label:text("Restore"),default:true,callback:(_event,button)=>{const choice=read(button.form);return valid(choice)?choice:false;}},
      {action:"cancel",label:text("Cancel"),callback:()=>false}
    ],render:(_event,dialog)=>{
      const form=dialog.element.querySelector("form");
      const update=()=>{form.querySelector('[data-action="restore"]').disabled=!valid(read(form));};
      form.addEventListener("change",update);update();
    }
  });
  if (!Array.isArray(choice?.targets) || !valid(choice)) return null;
  const result=await requestRestorativeTotem({...offer,...choice});
  if (!result?.ok) ui.notifications.warn(text(["reconcile","writeUncertain"].includes(result?.reason)?"Uncertain":"Unavailable"));
  else ui.notifications.info(text(result.already?"Already":"Restored"));
  return result;
}

/** Resolve uncertainty explicitly, after the GM inspects/adjusts the actors.
 * This door never heals, fills a pool, clears a claim, or offers a retry. */
export async function reviewRestorativeTotem(message) {
  const offer=message?.flags?.["azeroth-rpg"]?.[RESTORATIVE_TOTEM_OFFER];
  if (!game.user.isGM || !message?.author?.isGM || !offer) return null;
  const combat=game.combats.get(offer.combatId);
  const receipt=(combat?.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? []).find(row=>row.key===offer.key);
  if (!receipt || ["done","reviewed"].includes(receipt.stage)) {ui.notifications.info(text("Already"));return null;}
  const expected=structuredClone(receipt);
  const content=await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/restorative-totem-review.hbs",{
    targets:receipt.targets.map((row,index)=>({uuid:row.actorUuid,name:fromUuidSync(row.actorUuid)?.name ?? text("TargetNumber",{n:index+1}),
      status:text(row.stage==="done"?"Confirmed":row.stage==="pending"?"NotStarted":"Unconfirmed"),restored:row.restored,confirmed:row.stage==="done"}))
  });
  const acknowledged=await foundry.applications.api.DialogV2.wait({
    window:{title:text("Review")},classes:["azeroth","azeroth-totem-review"],position:{width:480},content,rejectClose:false,
    buttons:[{action:"review",label:text("MarkReviewed"),default:true,callback:(_event,button)=>button.form.elements.acknowledged?.checked===true},
      {action:"cancel",label:text("Cancel"),callback:()=>false}],
    render:(_event,dialog)=>{
      const form=dialog.element.querySelector("form");
      const update=()=>{form.querySelector('[data-action="review"]').disabled=form.elements.acknowledged?.checked!==true;};
      form.addEventListener("change",update);update();
      for (const link of form.querySelectorAll("[data-totem-actor]")) link.addEventListener("click",event=>{
        event.preventDefault();fromUuidSync(link.dataset.totemActor)?.sheet?.render({force:true});
      });
    }
  });
  if (!acknowledged) return null;
  const result=await requestRestorativeTotem({operation:"review",combatId:combat.id,key:receipt.key,expected,acknowledged:true});
  ui.notifications[result?.ok?"info":"warn"](text(result?.ok?"Reviewed":"ReviewChanged"));
  return result;
}
