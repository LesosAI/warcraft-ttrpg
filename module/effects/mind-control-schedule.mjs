import {companionTurnLinks} from "./kodo-bond.mjs";
import {mindControlOrder} from "../rules/mind-control-turns.mjs";
import {MIND_CONTROL_SCHEDULE} from "../rules/mind-control-schedule.mjs";
const busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Internal until carrier creation/removal and round transitions invoke it.
 * One combat update changes only order and its matching current-turn index.
 */
export async function refreshMindControlSchedule(combat,{game=globalThis.game,resolve=globalThis.fromUuidSync}={}) {
  const authorized=()=>game?.user?.isGM && game.users?.activeGM===game.user
    && game.combats?.get(combat?.id)===combat;
  if (!authorized() || !combat.started) return {ok:false,reason:"invalid"};
  if (busy.has(combat.uuid)) return {ok:false,reason:"busy"};
  busy.add(combat.uuid);
  try {
    const round=combat.round,turn=combat.turn;
    const standing=[...(combat.turnSlots ?? [])],currentKey=standing[turn]?.key ?? null;
    if (turn!==null && !currentKey) return {ok:false,reason:"unknownTurn"};
    const read=()=>companionTurnLinks(combat,{resolve});
    const controls=read();
    if (controls.issues.length) return {ok:false,reason:"unresolvedControl",issues:controls.issues};
    const plan=mindControlOrder(combat._baseTurnSlots(),controls.links,{previous:standing,currentKey});
    if(!plan.ok) return plan;
    const slots=plan.slots;
    const nextTurn=currentKey===null ? null : slots.findIndex(s=>s.key===currentKey);
    const record={version:1,round,keys:slots.map(s=>s.key)};
    if (!authorized() || combat.round!==round || combat.turn!==turn
      || !same(combat.turnSlots,standing) || !same(read(),controls)) return {ok:false,reason:"changed"};
    if (turn===nextTurn && same(combat.getFlag("azeroth-rpg",MIND_CONTROL_SCHEDULE),record)) return {ok:true};
    await combat.update({[`flags.azeroth-rpg.${MIND_CONTROL_SCHEDULE}`]:record,turn:nextTurn},{turnEvents:false});
    return authorized() && combat.round===round && combat.turn===nextTurn
      && same(combat.getFlag("azeroth-rpg",MIND_CONTROL_SCHEDULE),record)
      && same(combat.turnSlots.map(slot=>slot.key),record.keys)
      ? {ok:true} : {ok:false,reason:"pending"};
  } catch {return {ok:false,reason:"pending"};}
  finally {busy.delete(combat.uuid);}
}
