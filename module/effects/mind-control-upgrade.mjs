import { mindControlOn } from '../rules/mind-control.mjs';
import { prepareMindControlSustain, claimMindControlCaster, releaseMindControlCaster } from './mind-control-sustain.mjs';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** Explicit GM reconciliation of a pre-Sustain carrier. No casting, payment,
 * turn reset or replacement. A matching reservation makes interrupted retries
 * idempotent; capacity must be freed explicitly before adopting another hold. */
export async function upgradeMindControlSustain({actor,effect,expected,acknowledged}={}, {
  game=globalThis.game,resolve=globalThis.fromUuidSync
}={}) {
  const authority=()=>game?.user?.isGM && game.users?.activeGM===game.user;
  if(!acknowledged) return {ok:false,reason:'acknowledgement'};
  if(!authority()) return {ok:false,reason:'permission'};
  const record=mindControlOn(effect,actor?.uuid),caster=record && resolve(record.casterUuid);
  if(!record || !caster || effect.origin!==caster.uuid || !(caster.system?.health?.value>0)
    || resolve(actor.uuid)!==actor || actor.effects.get(effect.id)!==effect
    || !same(effect.toObject(),expected)) return {ok:false,reason:'changed'};
  if(!claimMindControlCaster(caster.uuid)) return {ok:false,reason:'busy'};
  try {
    const features=[...caster.items.values()].filter(i=>i.type==='feature' && i.name==='Mind Control');
    if(features.length!==1) return {ok:false,reason:'feature'};
    let held=structuredClone(caster.getFlag('azeroth-rpg','sustaining') ?? []);
    const existing=held.filter(entry=>entry.cast===record.messageUuid);
    if(existing.length>1) return {ok:false,reason:'changed'};
    const snapshot={items:caster.items,effects:caster.effects,uuid:caster.uuid,
      takenTalents:()=>caster.takenTalents(),poolSnapshot:()=>caster.poolSnapshot(),
      getFlag:()=>held.filter(entry=>entry.cast!==record.messageUuid)};
    const source=record.turnIdentity?.target;
    const message={uuid:record.messageUuid,flags:{'azeroth-rpg':{
      mindControlCast:{featureUuid:features[0].uuid},targets:[{actorId:actor.id,name:actor.name,
        ...(source ? {sceneId:source.sceneId,tokenId:source.tokenId} : {})}]}}};
    const plan=prepareMindControlSustain(snapshot,message);
    if(!plan.ok) return plan;
    if(plan.dropped.length) return {ok:false,reason:'capacity'};
    if(existing.length && !same(existing[0],plan.entry)) return {ok:false,reason:'changed'};
    const valid=()=>authority() && resolve(caster.uuid)===caster && resolve(actor.uuid)===actor
      && actor.effects.get(effect.id)===effect && same(effect.toObject(),expected)
      && same(caster.getFlag('azeroth-rpg','sustaining') ?? [],held);
    if(!valid()) return {ok:false,reason:'changed'};
    if(existing.length && effect.flags['azeroth-rpg'].sustained===true
      && effect.flags['azeroth-rpg'].cast===plan.entry.cast && effect.flags['azeroth-rpg'].spell===plan.entry.uuid)
      return {ok:true};
    if(!existing.length) {
      const next=[...held,plan.entry];
      await caster.setFlag('azeroth-rpg','sustaining',next);held=next;
      if(!valid()) return {ok:false,reason:'pending'};
    }
    await effect.update({'flags.azeroth-rpg.sustained':true,'flags.azeroth-rpg.cast':plan.entry.cast,
      'flags.azeroth-rpg.spell':plan.entry.uuid});
    const flags=effect.flags['azeroth-rpg'];
    return authority() && actor.effects.get(effect.id)===effect && flags.sustained===true
      && flags.cast===plan.entry.cast && flags.spell===plan.entry.uuid
      && same(caster.getFlag('azeroth-rpg','sustaining') ?? [],held)
      ? {ok:true} : {ok:false,reason:'pending'};
  } catch {return {ok:false,reason:'pending'};}
  finally {releaseMindControlCaster(caster.uuid);}
}
