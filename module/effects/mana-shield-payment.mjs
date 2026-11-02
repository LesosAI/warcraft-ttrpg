import {manaShieldPlan} from '../rules/mana-shield.mjs';
const scope='azeroth-rpg',busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** The held cast supplies protection; no extra Apply click is needed for
 * this self spell. Transfer recovery records remain inert. */
export function manaShieldFor(actor,damage){
 if(!(damage>0)||!(actor?.system?.health?.value>0))return null;
 const entry=(actor.getFlag(scope,'sustaining')??[]).find(row=>row.sustainTransfer==null
  &&(row.identifier==='mana-shield'||(row.identifier==null&&row.name==='Mana Shield')));
 if(!entry)return null;
 const plan=manaShieldPlan({entry,pools:actor.poolSnapshot(),damage});
 if(!plan.ok)throw Error(`Mana Shield cannot resolve its casting pool: ${plan.reason}`);
 return plan;
}

/** Commit Mana, the caller's Health update, and a broken shield together.
 * This is an internal writer: the damage door supplies its planned Health
 * changes and retains ownership of injury/condition/outcome bookkeeping. */
export async function commitManaShieldHealth({actor,plan,update={},options={}}={}){
 if(!actor?.isOwner||!actor.uuid||globalThis.fromUuidSync?.(actor.uuid)!==actor||!plan?.ok)
  throw Error('Mana Shield payment is not authorized');
 if(busy.has(actor.uuid))throw Error('Mana Shield payment is already running');
 busy.add(actor.uuid);
 try{
  const held=actor.getFlag(scope,'sustaining')??[];
  const entries=held.filter(entry=>entry.cast===plan.cast);
  if(entries.length!==1)throw Error('Mana Shield Sustain changed before payment');
  const current=manaShieldPlan({entry:entries[0],pools:actor.poolSnapshot(),damage:plan.absorbed+plan.damage});
  if(!current.ok||!same(current,plan))throw Error('Mana Shield pool or Sustain changed before payment');
  const patch={...update};
  if(plan.ends)patch[`flags.${scope}.sustaining`]=held.filter(entry=>entry.cast!==plan.cast);
  const expectedPatch=structuredClone(patch);
  const written=await actor.updatePool([plan.pool],patch,options);
  const savedPools=actor.poolSnapshot().filter(pool=>pool.itemId===plan.pool.itemId&&pool.kind===plan.pool.kind);
  const savedEntries=(actor.getFlag(scope,'sustaining')??[]).filter(entry=>entry.cast===plan.cast);
  const patchSaved=Object.entries(expectedPatch).every(([path,value])=>
   same(path.split('.').reduce((row,key)=>row?.[key],actor),value));
  // A resolved update can still be canceled by a hook or lose its authority.
  // Leave the calling damage claim unresolved; never retry or refund here.
  if(!actor.isOwner||globalThis.fromUuidSync?.(actor.uuid)!==actor
   ||savedPools.length!==1||savedPools[0].value!==plan.pool.value||!patchSaved
   ||(plan.ends?savedEntries.length!==0:savedEntries.length!==1||!same(savedEntries[0],plan.expected.entry)))
   throw Error('Mana Shield payment was not confirmed');
  return written;
 }finally{busy.delete(actor.uuid);}
}
