import {restorativeTotemContext,RESTORATIVE_TOTEM_FLAG} from "./restorative-totems.mjs";
// The scenes a fight stands on (O-294): core makes a fight unlinked, so `combat.scene` is null at the table.
import {fightOnScene,fightScenes} from "../rules/fight-scenes.mjs";

export const RESTORATIVE_TOTEM_OFFER = "restorativeTotemOffer";
const TEMPLATE = "systems/azeroth-rpg/templates/chat/restorative-totem.hbs";
const pending = new Set();
const gmHere = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const text = (key,data={}) => game.i18n.format(`AZEROTH.RestorativeTotem.${key}`,data);
const offeredMessages = key => game.messages.filter(message=>message.author?.isGM
  && message.flags?.["azeroth-rpg"]?.[RESTORATIVE_TOTEM_OFFER]?.key===key);

export async function renderRestorativeTotemCard(offer, receipt = null) {
  return foundry.applications.handlebars.renderTemplate(TEMPLATE,{
    title:offer.name,name:offer.actorName,actorUuid:offer.actorUuid,
    description:text(offer.resource==="health"?"HealthOffer":"ManaOffer",offer),
    done:receipt?.stage==="done",reviewed:receipt?.stage==="reviewed",uncertain:receipt && !["done","reviewed"].includes(receipt.stage),
    results:(receipt?.targets ?? []).map((row,index)=>({name:text("TargetNumber",{n:index+1}),amount:row.restored ?? 0}))
  });
}

/** Prompt creation is harmless and deduplicated by durable chat identity.
 * Resource mutation has its separate, authoritative once-per-turn receipt. */
export async function postRestorativeTotemOffers(combat) {
  if (!gmHere() || !combat?.started || !combat.combatant?.token) return;
  const stamp={combatId:combat.id,round:combat.round,turn:combat.turn};
  const tokens=fightScenes(combat,game.scenes).flatMap(scene=>[...scene.tokens.values()]);
  for (const token of tokens) {
    const payload={...stamp,sourceUuid:token.uuid};
    const context=restorativeTotemContext(payload,game.user);
    if (!context.ok || pending.has(context.key)) continue;
    const {key,owner,current,restoration,offered}=context;
    if (offeredMessages(key).length || (combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? []).some(row=>row.key===key)) continue;
    const useful=offered.some(row=>!row.refusal && (restoration.resource==="health"
      ? row.actor.system.health.value < row.actor.system.health.max : row.pools.some(pool=>pool.value<pool.max)));
    if (!useful) continue;
    pending.add(key);
    try {
      const actor=restoration.trigger==="owner"?owner:current.actor;
      const offer={...payload,key,name:restoration.name,resource:restoration.resource,amount:restoration.amount,
        range:restoration.range,targets:restoration.targets,actorUuid:actor.uuid,actorName:actor.name};
      const content=await renderRestorativeTotemCard(offer);
      if (!gmHere() || combat.round!==stamp.round || combat.turn!==stamp.turn || !combat.started) continue;
      await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,
        whisper:game.users.filter(user=>user.isGM || actor.testUserPermission(user,"OWNER")).map(user=>user.id),
        flags:{"azeroth-rpg":{kind:"prompt",actorUuid:actor.uuid,[RESTORATIVE_TOTEM_OFFER]:offer}}});
    } catch(error) {
      console.warn("azeroth-rpg | restorative totem offer",error);
      ui.notifications?.warn(text("OfferFailed"));
    } finally {pending.delete(key);}
  }
}

export async function refreshRestorativeTotemCards(combat,key) {
  if (!gmHere()) return;
  const receipt=(combat.getFlag("azeroth-rpg",RESTORATIVE_TOTEM_FLAG) ?? []).find(row=>row.key===key);
  for (const message of offeredMessages(key)) {
    const offer=message.flags["azeroth-rpg"][RESTORATIVE_TOTEM_OFFER];
    await message.update({content:await renderRestorativeTotemCard(offer,receipt)});
  }
}

export function registerRestorativeTotemHooks() {
  const review=sceneId=>{
    if (!gmHere()) return;
    for (const combat of game.combats) if (combat.started && (!sceneId || fightOnScene(combat,sceneId,game.scenes))) {
      void postRestorativeTotemOffers(combat).catch(error=>console.warn("azeroth-rpg | restorative totems",error));
    }
  };
  Hooks.on("combatTurnChange",combat=>{void postRestorativeTotemOffers(combat);});
  Hooks.on("createToken",token=>review(token.parent?.id));
  Hooks.on("updateToken",token=>review(token.parent?.id));
  Hooks.on("updateActor",()=>review());
  Hooks.once("ready",()=>review());
}
