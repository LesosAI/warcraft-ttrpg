import {consumeMirrorImage,mirrorImageState} from '../rules/mirror-image.mjs';
const scope='azeroth-rpg', busy=new Set();

export function hasMirrorImage(actor){
 return actor?.system?.health?.value>0 && (actor.getFlag(scope,'sustaining')??[])
  .some(entry=>consumeMirrorImage({entry,hit:true,attack:true})?.consumed);
}

/** Internal to a durably claimed hit. A failed/uncertain write must leave
 * that claim unresolved, never fall through to ordinary damage. */
export async function interceptMirrorImage(actor,{valid=()=>false}={}){
 if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id
  ||fromUuidSync(actor?.uuid)!==actor||!valid())throw Error('Mirror Image hit is not authorized');
 if(busy.has(actor.uuid))throw Error('Mirror Image hit is already resolving');
 busy.add(actor.uuid);
 try{
  if(!(actor.system?.health?.value>0))return false;
  const held=actor.getFlag(scope,'sustaining')??[];
  const index=held.findIndex(entry=>consumeMirrorImage({entry,hit:true,attack:true})?.consumed);
  if(index<0)return false;
  const plan=consumeMirrorImage({entry:held[index],hit:true,attack:true});
  if(held.filter(entry=>entry.cast===plan.cast).length!==1)throw Error('Mirror Image cast is ambiguous');
  if(!valid())throw Error('Mirror Image hit changed');
  const next=structuredClone(held);next[index]=plan.entry;
  const expected=JSON.stringify(next);
  await actor.setFlag(scope,'sustaining',next);
  const savedHeld=actor.getFlag(scope,'sustaining')??[];
  const saved=savedHeld.filter(entry=>entry.cast===plan.cast);
  if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id
   ||fromUuidSync(actor.uuid)!==actor||!valid()||saved.length!==1
   ||mirrorImageState(saved[0])?.remaining!==plan.remaining || JSON.stringify(savedHeld)!==expected)
   throw Error('Mirror Image consumption is unconfirmed');
  return true;
 }finally{busy.delete(actor.uuid);}
}
