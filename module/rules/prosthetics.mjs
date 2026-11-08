/** 08 §13: an exact physical prosthetic compensates its GM-identified injury only. */
import {guardPendingCustodyItem} from "./item-custody-guard.mjs";
import {isTwoHanded,hasTitansPresence} from "./worn.mjs";
import {deviceBroken} from "./device-context.mjs";
import {dispersionFor} from "./dispersion.mjs";
export const PROSTHETIC_BINDING="prostheticBinding";
export const TYPED_INJURY="prostheticInjury";
export const PROSTHETICS=Object.freeze({"mechanical-leg":"leg","mechanical-hand":"hand","clockwork-eye":"eye"});
export const PROSTHETIC_LIMBS=Object.freeze({leg:["left-leg","right-leg"],hand:["left-hand","right-hand"],eye:["left-eye","right-eye"]});
export function prostheticKind(item){
  return item?.type==="gear"&&item.system?.source?.document==="08-EQUIPMENT"
    &&item.system.source.section==="13 · Ordnance and devices · Devices"?PROSTHETICS[item.system.identifier]??null:null;
}
export function injuryFingerprint(effect){
  return JSON.stringify([effect?.uuid,effect?.name,effect?.description,effect?.flags?.["azeroth-rpg"]?.location,effect?.flags?.["azeroth-rpg"]?.[TYPED_INJURY],effect?.system?.changes??[]]);
}
export function typedInjury(effect){
  const row=effect?.flags?.["azeroth-rpg"]?.[TYPED_INJURY];
  return effect?.flags?.["azeroth-rpg"]?.injury===true&&effect.flags["azeroth-rpg"].location===(row?.kind==="eye"?"head":"limb")
    &&row?.version===1&&PROSTHETIC_LIMBS[row.kind]?.includes(row.limb)
    &&(row.kind!=="hand"||["mainHand","offHand"].includes(row.handSlot))?row:null;
}
const activeInjury=e=>e?.flags?.["azeroth-rpg"]?.injury===true&&!e.disabled&&e.active!==false&&!e.isSuppressed&&e.duration?.expired!==true;
export function bindingEligible(actor,item,injury,limb){
  const kind=prostheticKind(item),location=injury?.flags?.["azeroth-rpg"]?.location;
  return Boolean(kind&&PROSTHETIC_LIMBS[kind].includes(limb)&&actor?.uuid&&item.parent?.uuid===actor.uuid
    &&[...(actor.items??[])].some(i=>i===item)&&(item.system.quantity??1)>0&&guardPendingCustodyItem(item).ok&&!deviceBroken(item)
    &&item.isSuppressed!==true&&item.system.suppressed!==true&&!dispersionFor(actor)
    &&injury?.flags?.["azeroth-rpg"]?.injury===true&&injury.parent?.uuid===actor.uuid
    &&[...(actor.effects??[])].some(e=>e===injury)&&!injury.disabled&&injury.active!==false&&!injury.isSuppressed&&injury.duration?.expired!==true
    &&location===(kind==="eye"?"head":"limb")&&typedInjury(injury)?.kind===kind&&typedInjury(injury)?.limb===limb);
}
export function activeProsthetics(actor){
  const result=[],seen=new Set();
  for(const item of actor?.items??[]){
    const binding=item.flags?.["azeroth-rpg"]?.[PROSTHETIC_BINDING];
    const injury=[...(actor.effects??[])].find(e=>e.uuid===binding?.injuryUuid);
    if(binding?.version!==1||binding.actorUuid!==actor.uuid||binding.itemUuid!==item.uuid
      ||binding.kind!==prostheticKind(item)||!bindingEligible(actor,item,injury,binding.limb)
      ||binding.fingerprint!==injuryFingerprint(injury)||seen.has(binding.limb)||seen.has(injury.uuid))continue;
    seen.add(binding.limb);seen.add(injury.uuid);result.push({item,injury,kind:binding.kind,limb:binding.limb});
  }
  return result;
}
export function prostheticEffectView(actor,effect){
  const canonicalHand=activeInjury(effect)&&typedInjury(effect)?.kind==="hand"
    &&String(effect.description??"").replace(/<[^>]*>/g,"").replaceAll("*","").trim()
      ==="Permanent: Speed reduced by 5 feet, or that hand can no longer hold a weapon";
  const restoredLeg=activeProsthetics(actor).some(p=>p.kind==="leg"&&p.injury===effect);
  if(!canonicalHand&&!restoredLeg)return effect;
  const changes=(effect.system?.changes??[]).filter(c=>!(c.key==="system.speed"&&c.type==="add"
    &&(restoredLeg?Number(c.value)<0:Number(c.value)===-5)));
  if(changes.length===(effect.system?.changes??[]).length)return effect;
  // V14.367 Actor.applyActiveEffects reads system.changes then calls document methods.
  // This facade stays inside the application iterator; never persist/serialize it.
  const system=new Proxy(effect.system,{get(target,key){return key==="changes"?changes:Reflect.get(target,key,target);}});
  return new Proxy(effect,{get(target,key){if(key==="system")return system;
    const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
}
export function prostheticRows(actor,{kind,skill,rangeKind}={}){
  const active=activeProsthetics(actor),rows=[];
  const add=(id,label,name,checked=false)=>rows.push({id,label:`AZEROTH.Prosthetic.${label}`,name,boons:0,banes:1,modifier:0,checked});
  if(active.some(p=>p.kind==="hand"))add("prosthetic:fine-work","FineWork",active.find(p=>p.kind==="hand").item.name);
  const eyes=[...(actor?.effects??[])].filter(e=>activeInjury(e)&&typedInjury(e)?.kind==="eye");
  if(kind==="attack"&&rangeKind==="ranged"&&eyes.length)add("prosthetic:eye-ranged","RangedEye",eyes[0].name,true);
  if(kind==="skill"&&skill==="perception"&&eyes.some(e=>!active.some(p=>p.kind==="eye"&&p.injury===e)))add("prosthetic:eye-perception","PerceptionEye",eyes[0].name);
  return rows;
}
export function missingWeaponHands(actor){
  const active=activeProsthetics(actor);
  return new Set([...(actor?.effects??[])].filter(e=>activeInjury(e)&&typedInjury(e)?.kind==="hand"
    &&!active.some(p=>p.kind==="hand"&&p.injury===e)).map(e=>typedInjury(e).handSlot));
}
export function prostheticWieldAllowed(actor,item){
  const missing=missingWeaponHands(actor);if(!missing.size||!item)return true;
  if(item.type==="armor"&&item.system?.shield)return !missing.has("offHand");
  if(item.type!=="weapon")return true;
  if(isTwoHanded(item)&&!hasTitansPresence(actor?.items??[]))return false;
  return !missing.has(item.system?.offHand===true?"offHand":"mainHand");
}
