import {MIND_CONTROL_FLAG} from "../rules/mind-control.mjs";
import {MIND_CONTROL_SCHEDULE} from "../rules/mind-control-schedule.mjs";
import {refreshMindControlSchedule} from "./mind-control-schedule.mjs";
import {registerMindControlActivation} from "./mind-control-activation.mjs";
const jobs=new Map();

/** End-turn expiry uses Combat.previous. Finish our queued order writes before
 * the native end-turn method restores that historical state for expiry. */
export async function settleMindControlSchedule(combat) {
  let task;
  while ((task=jobs.get(combat?.uuid))) {
    await task.catch(()=>{});
    if(jobs.get(combat.uuid)===task) break;
  }
}

/** Effect lifecycle updates placement only; never create turns or change
 * ownership. Queue per combat so a rapid create/delete observes final state.
 */
export function registerMindControlHooks({hooks=globalThis.Hooks,game=globalThis.game,
  refresh=refreshMindControlSchedule,warn=()=>globalThis.ui?.notifications?.warn(
    game.i18n.localize("AZEROTH.MindControl.ScheduleUnresolved"))}={}) {
  const writer=()=>game?.user?.isGM && game.users?.activeGM===game.user;
  registerMindControlActivation({hooks,game});
  const enqueue=combat=>{
    if (!writer() || !combat.started) return Promise.resolve();
    const task=(jobs.get(combat.uuid) ?? Promise.resolve()).catch(()=>{}).then(async()=>{
      if (!writer() || game.combats.get(combat.id)!==combat) return;
      const result=await refresh(combat);
      if (!result?.ok && writer() && game.combats.get(combat.id)===combat) warn(result);
    }).catch(error=>{if(writer()) warn(error);});
    jobs.set(combat.uuid,task);
    return task.finally(()=>{if(jobs.get(combat.uuid)===task) jobs.delete(combat.uuid);});
  };
  const changed=(effect,delta={})=>{
    const flags=delta.flags?.["azeroth-rpg"];
    if (!effect?.flags?.["azeroth-rpg"]?.[MIND_CONTROL_FLAG]
      && !(flags && (Object.hasOwn(flags,MIND_CONTROL_FLAG) || Object.hasOwn(flags,`-=${MIND_CONTROL_FLAG}`)))) return;
    const actor=effect.parent;
    if (actor?.documentName!=="Actor") return;
    return Promise.all(Array.from(game.combats ?? []).filter(combat=>
      Array.from(combat.combatants ?? []).some(row=>row.actor===actor)).map(enqueue));
  };
  hooks.on("createActiveEffect",effect=>changed(effect));
  hooks.on("updateActiveEffect",changed);
  hooks.on("deleteActiveEffect",effect=>changed(effect));
  const hasBonds=actor=>Array.isArray(actor?.getFlag?.("azeroth-rpg","kodoBond")?.beasts)
    && actor.getFlag("azeroth-rpg","kodoBond").beasts.length>0;
  const relevant=combat=>combat.getFlag("azeroth-rpg",MIND_CONTROL_SCHEDULE)
    || Array.from(combat.combatants ?? []).some(row=>hasBonds(row.actor)
      || Array.from(row.actor?.effects ?? []).some(effect=>effect.flags?.["azeroth-rpg"]?.[MIND_CONTROL_FLAG]));
  const talentChanged=item=>{
    const actor=item?.parent;
    // The saved relationship remains available if a talent is bought again.
    // Rebuilding now removes its timing immediately when the talent is lost.
    if(item?.type!=="talent" || !hasBonds(actor)) return;
    return Promise.all(Array.from(game.combats ?? []).filter(combat=>
      Array.from(combat.combatants ?? []).some(row=>row.actor===actor)).map(enqueue));
  };
  hooks.on("createItem",talentChanged);
  hooks.on("updateItem",talentChanged);
  hooks.on("deleteItem",talentChanged);
  const participantChanged=row=>{
    const combat=row?.parent;
    if(combat && relevant(combat)) return enqueue(combat);
  };
  hooks.on("createCombatant",participantChanged);
  hooks.on("updateCombatant",(row,delta={})=>{
    const flags=delta.flags?.["azeroth-rpg"] ?? delta["flags.azeroth-rpg"] ?? {};
    if (!["actorId","tokenId","sceneId","name","initiative","defeated",
      "flags.azeroth-rpg.side"].some(key=>Object.hasOwn(delta,key))
      && !Object.hasOwn(flags,"side") && !Object.hasOwn(flags,"-=side")) return;
    return participantChanged(row);
  });
  hooks.on("deleteCombatant",participantChanged);
  hooks.on("updateActor",(actor,delta={})=>{
    const flags=delta.flags?.["azeroth-rpg"] ?? delta["flags.azeroth-rpg"] ?? {};
    const bondChanged=["bond","-=bond"].some(key=>Object.hasOwn(flags,key)
      || Object.hasOwn(delta,`flags.azeroth-rpg.${key}`));
    if(!bondChanged && !Object.hasOwn(delta,"system.creatureType") && !Object.hasOwn(delta.system ?? {},"creatureType")) return;
    return Promise.all(Array.from(game.combats ?? []).filter(combat=>(bondChanged||relevant(combat))
      && Array.from(combat.combatants ?? []).some(row=>row.actor===actor
        || (bondChanged && row.actor?.isToken && row.actorId===actor.id))).map(enqueue));
  });
  const reconcile=()=>Promise.all(Array.from(game.combats ?? []).filter(combat=>
    relevant(combat)).map(enqueue));
  hooks.on("ready",reconcile);
  let gmId=game.users?.activeGM?.id;
  hooks.on("updateUser",()=>{
    const next=game.users?.activeGM?.id;
    if(next!==gmId) {gmId=next;return reconcile();}
  });
}
