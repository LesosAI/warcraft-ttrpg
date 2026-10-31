import {mindControlOn,mindControlTurnKey} from "../rules/mind-control.mjs";
import {repeatMindControl} from "./mind-control-repeat.mjs";
import {settleMindControlSchedule} from "./mind-control-hooks.mjs";

/** Called only from the authoritative native end-turn lifecycle, not a client
 * query. Context is the completed turn, which may differ from combat.turn now.
 */
export async function endMindControlTurn(combat,combatant,context,{
  game=globalThis.game,resolve=globalThis.fromUuidSync,repeat=repeatMindControl,settle=settleMindControlSchedule,
  roll=async({actor,resilience,dc,resistOf})=>{
    const {resilienceWithDialog}=await import("../applications/actions.mjs");
    return resilienceWithDialog(actor,resilience,null,{dc,link:resistOf});
  }
}={}) {
  const actor=combatant?.actor;
  const valid=()=>game?.user?.isGM && game.users?.activeGM===game.user
    && game.combats?.get(combat?.id)===combat && combatant?.parent===combat
    && combat.combatants.get(combatant.id)===combatant && combatant.actor===actor
    && resolve?.(actor?.uuid)===actor;
  const turn={combatUuid:combat?.uuid,combatantId:combatant?.id,round:context?.round,turn:context?.turn};
  if(!valid() || !mindControlTurnKey(turn) || turn.round>combat.round) return [];
  const effects=Array.from(actor.effects ?? []).filter(effect=>mindControlOn(effect,actor.uuid));
  const results=[];
  for(const effect of effects) {
    if(!valid() || resolve(effect.uuid)!==effect || !mindControlOn(effect,actor.uuid)) continue;
    results.push(await repeat({actor,effect,turn,user:game.user,roll},{game,resolve}));
    await settle(combat);
  }
  return results;
}
