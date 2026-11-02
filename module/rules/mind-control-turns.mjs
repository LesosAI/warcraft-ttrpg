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

/** A caster's controlled creatures form one consecutive group, in base turn
 * order. Preserve completed turns and refuse conflicting controllers. */
export function mindControlOrder(base,links,{previous=[],currentKey=null}={}) {
  let slots=preserveTurnProgress(base,previous,currentKey);
  if (!slots) return {ok:false,reason:"unknownTurn"};
  const groups=new Map(),placed=[];
  for(const link of links) {
    const targets=groups.get(link.casterId) ?? new Set();
    targets.add(link.targetId);groups.set(link.casterId,targets);
  }
  for(const [casterId,targets] of groups) {
    const ordered=[...targets].sort((a,b)=>base.findIndex(s=>s.id===a && !s.extra)-base.findIndex(s=>s.id===b && !s.extra));
    const active=[];
    // Inserting in reverse retains the group's ordinary relative order.
    for(const targetId of ordered.reverse()) {
      const plan=mindControlPlacement(slots,{casterId,targetId,currentKey});
      if(plan.reason && plan.reason!=="nextRound") return {ok:false,reason:plan.reason};
      slots=plan.slots;if(!plan.reason) active.unshift(targetId);
      if(plan.reason==="nextRound") {
        const oldTarget=previous.findIndex(s=>s.id===targetId && !s.extra);
        const oldCursor=previous.findIndex(s=>s.key===currentKey);
        // The caster has acted: keep a pending target's existing position.
        // Rebuilding from base order here would undo the rest of a group as
        // soon as its first creature acts or its control ends.
        if(oldTarget>oldCursor && oldCursor>=0) {
          const target=slots.find(s=>s.id===targetId && !s.extra);
          const next=previous.slice(oldTarget+1).find(s=>slots.some(row=>row.key===s.key));
          slots=slots.filter(s=>s!==target);
          slots.splice(next ? slots.findIndex(s=>s.key===next.key) : slots.length,0,target);
        }
      }
    }
    placed.push({casterId,targets:active});
  }
  for(const {casterId,targets} of placed) {
    const caster=slots.findIndex(slot=>slot.id===casterId && !slot.extra);
    if(targets.some((id,index)=>slots[caster+index+1]?.id!==id || slots[caster+index+1]?.extra))
      return {ok:false,reason:"conflictingPlacement"};
  }
  return {ok:true,slots};
}
