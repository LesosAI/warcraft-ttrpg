/** Post-form aftermath. Persist intent before creating Numbed; never retry an
 * uncertain creation automatically, even if its effect has since expired. */
import {dispersionFor} from '../rules/dispersion.mjs';
import {untilEndOfNextTurnOrRound} from './durations.mjs';
export const DISPERSION_ENDINGS='dispersionEndings';
const scope='azeroth-rpg',queues=new Map();
const writer=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id;
const refuse=reason=>({ok:false,reason});

export function endedDispersionRecord(actor,effect) {
  const data=effect?.toObject?.() ?? effect;
  if(!actor?.uuid || !data?._id)return null;
  const probe={...data,disabled:false,active:true,isSuppressed:false,
    duration:{...data.duration,expired:false}};
  if(!dispersionFor({uuid:actor.uuid,effects:[probe]}))return null;
  const held=actor.effects?.get?.(data._id);
  if(held && !held.disabled && !held.duration?.expired)return null;
  return {effectId:data._id,...data.flags[scope].dispersion};
}

export async function deliverDispersionEnding(actor,effect) {
  const previous=queues.get(actor?.uuid) ?? Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>deliver(actor,effect));
  queues.set(actor?.uuid,pending);
  try{return await pending;}finally{if(queues.get(actor?.uuid)===pending)queues.delete(actor?.uuid);}
}

async function deliver(actor,effect) {
  if(!writer())return refuse('gmRequired');
  const record=endedDispersionRecord(actor,effect);
  if(!record)return refuse('notEnded');
  const key=record.effectId;
  const receipts=actor.getFlag(scope,DISPERSION_ENDINGS) ?? {};
  const old=receipts[key];
  if(old)return old.cast===record.cast && ['done','reviewed'].includes(old.state) ? {ok:true,replayed:true} : refuse('reviewRequired');
  const timing=untilEndOfNextTurnOrRound(actor);
  const status=CONFIG.statusEffects.numbed;
  if(!status)return refuse('conditionMissing');
  const claim={version:1,cast:record.cast,writerId:game.user.id,state:'creating',timing:structuredClone(timing)};
  const stillClaimed=()=>writer() && game.user.id===claim.writerId
    && JSON.stringify(actor.getFlag(scope,DISPERSION_ENDINGS)?.[key])===JSON.stringify(claim);
  try {
    await actor.setFlag(scope,DISPERSION_ENDINGS,{...receipts,[key]:structuredClone(claim)});
    if(!stillClaimed())return refuse('reviewRequired');
    const data={name:game.i18n.localize(status.name),img:status.img,description:status.description ?? '',
      statuses:['numbed'],system:structuredClone(status.system ?? {}),origin:record.spellUuid,transfer:false,
      ...timing,flags:{[scope]:{dispersionAftermath:{effectId:key,cast:record.cast,ownerUuid:actor.uuid}}}};
    const made=await actor.createEmbeddedDocuments('ActiveEffect',[data]);
    if(!stillClaimed() || made.length!==1 || !made[0]?.id)return refuse('reviewRequired');
    const completed={...claim,state:'done',aftermathId:made[0].id};
    await actor.setFlag(scope,DISPERSION_ENDINGS,{...(actor.getFlag(scope,DISPERSION_ENDINGS) ?? {}),
      [key]:structuredClone(completed)});
    if(!writer() || game.user.id!==claim.writerId
      || JSON.stringify(actor.getFlag(scope,DISPERSION_ENDINGS)?.[key])!==JSON.stringify(completed))return refuse('reviewRequired');
    return {ok:true,aftermathId:made[0].id};
  } catch{return refuse('reviewRequired');}
}

export function registerDispersionEndingHooks() {
  const ended=effect=>{
    if(!writer() || effect.parent?.documentName!=='Actor' || !effect.flags?.[scope]?.dispersion)return;
    void deliverDispersionEnding(effect.parent,effect).then(result=>{
      if(!result.ok && result.reason!=='notEnded')
        ui.notifications?.warn('Dispersion ended, but its Numbed aftermath needs GM review. Do not repeat delivery without checking the recorded attempt.');
    }).catch(error=>console.warn('azeroth-rpg | Dispersion aftermath',error));
  };
  Hooks.on('deleteActiveEffect',ended);
  Hooks.on('updateActiveEffect',ended);
}

export function dispersionEndingReviewState(actor) {
  const receipts=actor?.getFlag(scope,DISPERSION_ENDINGS) ?? {};
  const pending=Object.entries(receipts).filter(([,r])=>r?.version===1 && r.state==='creating')
    .map(([effectId,receipt])=>({effectId,receipt}));
  const effects=[...(actor?.effects?.values?.() ?? actor?.effects ?? [])].map(e=>e.toObject?.() ?? e)
    .sort((a,b)=>String(a._id).localeCompare(String(b._id)));
  return {pending,effects,expected:JSON.stringify({uuid:actor?.uuid,receipts,effects})};
}

/** Close only the selected receipt after the GM reconciles Numbed manually. */
export async function reviewDispersionEnding(actor,{effectId,expected,acknowledged}={}) {
  if(!writer() || acknowledged!==true)return refuse('permission');
  const previous=queues.get(actor?.uuid) ?? Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{
    if(!writer() || fromUuidSync(actor.uuid)!==actor)return refuse('authority');
    const state=dispersionEndingReviewState(actor),row=state.pending.find(r=>r.effectId===effectId);
    if(!row || state.expected!==expected)return refuse('changed');
    if(row.receipt.writerId!==game.user.id && game.users.get?.(row.receipt.writerId)?.active)return refuse('writerConnected');
    const reviewed={...row.receipt,state:'reviewed',reviewedBy:game.user.id,reviewedAt:Date.now()};
    try {
      await actor.setFlag(scope,DISPERSION_ENDINGS,{...(actor.getFlag(scope,DISPERSION_ENDINGS) ?? {}),[effectId]:reviewed});
      return writer() && JSON.stringify(actor.getFlag(scope,DISPERSION_ENDINGS)?.[effectId])===JSON.stringify(reviewed)
        ? {ok:true,reviewed:true} : refuse('uncertain');
    }catch{return refuse('uncertain');}
  });
  queues.set(actor?.uuid,pending);
  try{return await pending;}finally{if(queues.get(actor?.uuid)===pending)queues.delete(actor?.uuid);}
}
