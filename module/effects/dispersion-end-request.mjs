import {dispersionFor,dispersionCanEnd} from '../rules/dispersion.mjs';
import {deliverDispersionEnding} from './dispersion-ending.mjs';
export const DISPERSION_END_QUERY='azeroth-rpg.endDispersion';
const writer=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id;
const refuse=reason=>({ok:false,reason});
const queues=new Map();
export function canEndDispersion(actor) {
  const fight=actor?.activeFight?.();
  const onTurn=fight?.started===true && fight.getCombatantsByActor(actor)?.some(c=>c.isCurrentTurn===true);
  return dispersionCanEnd({actor,onTurn});
}
export async function requestEndDispersion(actor,effect) {
  const gm=game.users?.activeGM;if(!gm)return refuse('gmRequired');
  const payload={actorUuid:actor.uuid,effectId:effect.id,cast:effect.flags?.['azeroth-rpg']?.dispersion?.cast};
  try{return gm.id===game.user.id ? await endDispersion(payload,{user:game.user})
    : await gm.query(DISPERSION_END_QUERY,payload,{timeout:15000});}
  catch{return refuse('writeUncertain');}
}
export async function endDispersion(payload={},context={}) {
  if(!writer())return refuse('gmRequired');
  const key=payload.actorUuid,previous=queues.get(key) ?? Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>endNow(payload,context));queues.set(key,pending);
  try{return await pending;}finally{if(queues.get(key)===pending)queues.delete(key);}
}
async function endNow({actorUuid,effectId,cast},{user}) {
  if(!writer())return refuse('gmRequired');
  if(!user?.id || ![actorUuid,effectId,cast].every(v=>typeof v==='string' && v.length))return refuse('request');
  const actor=await fromUuid(actorUuid);
  if(!writer())return refuse('gmRequired');
  if(actor?.documentName!=='Actor' || actor.uuid!==actorUuid)return refuse('actor');
  if(!user.isGM && !actor.testUserPermission(user,'OWNER'))return refuse('permission');
  const effect=dispersionFor(actor);
  if(!effect || effect.id!==effectId || effect.flags['azeroth-rpg'].dispersion.cast!==cast)return refuse('changed');
  if(!canEndDispersion(actor))return refuse('notYourTurn');
  const snapshot=effect.toObject();
  try {
    await effect.delete();
    if(actor.effects.has(effectId))return refuse('writeIncomplete');
    const aftermath=await deliverDispersionEnding(actor,snapshot);
    return aftermath.ok ? {ok:true,effectId} : refuse('aftermathReview');
  } catch{return refuse('writeUncertain');}
}
