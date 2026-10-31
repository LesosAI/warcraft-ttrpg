/** Rebuild pending turn slots while retaining the completed/current prefix.
 * Keys identify occurrences, not actors: an existing extra turn is distinct.
 * A missing current key is ambiguous and must be handled by the combat adapter.
 */
export function preserveTurnProgress(base = [], previous = [], currentKey = null) {
  if (currentKey === null) return [...base];
  const index = previous.findIndex(slot => slot.key === currentKey);
  if (index < 0 || !base.some(slot => slot.key === currentKey)) return null;
  const valid = new Set(base.map(slot => slot.key));
  const prefix = previous.slice(0,index+1).filter(slot => valid.has(slot.key));
  const used = new Set(prefix.map(slot => slot.key));
  return [...prefix,...base.filter(slot => !used.has(slot.key))];
}

/** Lead decision: the controlled creature acts immediately after the caster.
 * Move an existing normal turn; never create a turn, reset a budget or move an
 * already completed/current target. Placement after a past caster waits until
 * next round. The adapter resolves exact combatant IDs from effect identities.
 */
export function mindControlPlacement(slots = [], {casterId,targetId,currentKey = null} = {}) {
  const unchanged = reason => ({slots:[...slots],moved:false,reason});
  if (!casterId || !targetId || casterId === targetId) return unchanged("invalid");
  const caster = slots.filter(slot => slot.id === casterId && !slot.extra);
  const target = slots.filter(slot => slot.id === targetId && !slot.extra);
  if (caster.length !== 1 || target.length !== 1) return unchanged("ambiguous");
  const cursor = currentKey === null ? -1 : slots.findIndex(slot => slot.key === currentKey);
  if (currentKey !== null && cursor < 0) return unchanged("unknownTurn");
  const casterIndex = slots.indexOf(caster[0]), targetIndex = slots.indexOf(target[0]);
  if (targetIndex <= cursor || casterIndex < cursor) return unchanged("nextRound");
  const result = slots.filter(slot => slot !== target[0]);
  const after = result.indexOf(caster[0])+1;
  result.splice(after,0,target[0]);
  return {slots:result,moved:targetIndex !== casterIndex+1,reason:null};
}

/** Plan all controls together; refuse contradictory adjacency constraints. */
export function mindControlOrder(base,links,{previous=[],currentKey=null}={}) {
  let slots=preserveTurnProgress(base,previous,currentKey);
  if (!slots) return {ok:false,reason:"unknownTurn"};
  const placed=[];
  for(const link of links) {
    const plan=mindControlPlacement(slots,{...link,currentKey});
    if(plan.reason && plan.reason!=="nextRound") return {ok:false,reason:plan.reason};
    slots=plan.slots;if(!plan.reason) placed.push(link);
  }
  for(const link of placed) {
    const caster=slots.findIndex(slot=>slot.id===link.casterId && !slot.extra);
    if(slots[caster+1]?.id!==link.targetId || slots[caster+1]?.extra)
      return {ok:false,reason:"conflictingPlacement"};
  }
  return {ok:true,slots};
}
