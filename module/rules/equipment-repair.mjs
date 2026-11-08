/** 08 §5 Unreliable and §13's one-kit repair; no Foundry writes. */
export const UNRELIABLE_DAMAGE = "unreliableDamage";
export const REPAIR_KIT = "repair-kit-mechanical";
export function unreliableDamage(item) {
  const state=item?.flags?.["azeroth-rpg"]?.[UNRELIABLE_DAMAGE];
  return state?.version===1&&typeof state.event==="string"&&state.event?state:null;
}
export function unreliableWeapon(item) {
  return item?.type==="weapon"&&(item.system?.traits??[]).some(t=>String(t).toLowerCase()==="unreliable");
}
export function repairKit(item) {return item?.type==="gear"&&item.system?.identifier===REPAIR_KIT;}
export function unresolvedUnreliable(item,messages=[]) {
  return [...messages].find(m=>m.flags?.["azeroth-rpg"]?.unreliableWeapon?.weaponUuid===item?.uuid
    &&m.flags["azeroth-rpg"].unreliableWeapon.natural===1&&!m.flags["azeroth-rpg"].unreliableDamageApplied)??null;
}
