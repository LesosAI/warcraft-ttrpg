import {mindControlCombatLinks} from "./mind-control-combat.mjs";
import {mindControlOrder} from "../rules/mind-control-turns.mjs";
import {MIND_CONTROL_SCHEDULE} from "../rules/mind-control-schedule.mjs";

/** Prepare the same Combat update that advances the round, before core chooses
 * lifecycle participants. No separate write or action-budget reset happens here.
 */
export function prepareMindControlRound(combat,changed,options={}, {read=mindControlCombatLinks}={}) {
  if(!Number.isSafeInteger(changed.round) || changed.round<1 || changed.round===combat.round)
    return {ok:true};
  const controls=read(combat);
  if(controls.issues.length) return {ok:false,reason:"unresolvedControl"};
  if(!controls.links.length && !combat.getFlag("azeroth-rpg",MIND_CONTROL_SCHEDULE)) return {ok:true};
  const plan=mindControlOrder(combat._baseTurnSlots(),controls.links);
  if(!plan.ok) return plan;
  const record={version:1,round:changed.round,keys:plan.slots.map(slot=>slot.key)};
  changed[`flags.azeroth-rpg.${MIND_CONTROL_SCHEDULE}`]=record;
  // Core nextRound calculates this index from the previous order. Recompute
  // its first eligible turn against the new order; preserve explicit no-turn.
  if(changed.turn!==null && (options.direction===1 || combat.round===0)) {
    const first=combat.settings?.skipDefeated
      ? plan.slots.findIndex(slot=>!combat.combatants.get(slot.id)?.isDefeated) : 0;
    changed.turn=plan.slots.length ? Math.max(0,first) : null;
    if(options.worldTime && typeof combat.getTimeDelta==="function")
      options.worldTime.delta=combat.getTimeDelta(combat.round,combat.turn,changed.round,changed.turn);
  }
  return {ok:true};
}
