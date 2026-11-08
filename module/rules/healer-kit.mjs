/** 08 §11: a ten-use kit replaces only Stabilize's Medicine Test. */
export const HEALER_KIT_ID="healers-kit-10-uses";
export function healerKit(item){
  return item?.type==="gear"&&item.system?.identifier===HEALER_KIT_ID
    &&item.system.source?.document==="08-EQUIPMENT"
    &&item.system.source.section==="11 · Adventuring gear · Trade kits";
}
export function healerKitCharges(system){
  if(system?.identifier!==HEALER_KIT_ID||system.source?.document!=="08-EQUIPMENT"
    ||system.source.section!=="11 · Adventuring gear · Trade kits")return system?.charges;
  const raw=system.charges;
  // Old chapter items had no counter. Never refill a stored spent counter.
  return raw?.value==null&&raw?.max==null?{value:10,max:10,unit:"use"}:raw;
}
export function canStabilize(target){
  return target?.type==="character"&&Number.isFinite(target.system?.health?.value)&&target.system.health.value<=0
    &&Number.isFinite(target.system.deathSteps)&&Number.isFinite(target.system.deathStepLimit)
    &&target.system.deathSteps<target.system.deathStepLimit&&!target.getFlag?.("azeroth-rpg","stabilized");
}
