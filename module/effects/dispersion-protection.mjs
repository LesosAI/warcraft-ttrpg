import {dispersionRefusal} from '../rules/dispersion.mjs';
import {registerDispersionEndingHooks} from './dispersion-ending.mjs';

export function refuseDispersion(actor,operation) {
  const reason=dispersionRefusal(actor,operation);
  if(reason)globalThis.ui?.notifications?.info(globalThis.game?.i18n?.localize(reason) ?? reason);
  return Boolean(reason);
}

/** Catch a form entered while an earlier damage operation awaited a write.
 * Manual Health edits and non-damage costs are not inferred to be damage. */
export function dispersionDamageUpdateBlocked(actor,change={},options={}) {
  if(!(options.azerothDamageApplied>0) || !dispersionRefusal(actor,'damage'))return false;
  return ['value','temp'].some(key=>{
    const path=`system.health.${key}`;
    const value=Object.hasOwn(change,path)?change[path]:change.system?.health?.[key];
    return typeof value==='number' && value<(actor.system?.health?.[key] ?? 0);
  });
}

export function registerDispersionProtectionHooks() {
  registerDispersionEndingHooks();
  Hooks.on('preUpdateActor',(actor,change,options)=>{
    if(dispersionDamageUpdateBlocked(actor,change,options)) {
      refuseDispersion(actor,'damage');return false;
    }
  });
}
