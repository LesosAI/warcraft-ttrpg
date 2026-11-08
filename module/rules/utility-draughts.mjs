/** Existing 08 utility table effects; capability identity, not inferred damage immunity. */
export const UTILITY_DRAUGHT_FLAG="utilityDraught";
export function utilityDraught(use={}){
  const note=String(use.note??"").trim();
  const definitions=[
    ["Ignore cold for six hours","environmentalCold",21600],
    ["See in the dark for an hour","darkvision",3600],
    ["See in the dark to 60 feet for an hour","darkvision",3600],
    ["Take no damage from a fall for ten minutes","fallProtection",600],
    ["Breathe water for an hour","waterBreathing",3600]
  ];
  const row=definitions.find(([text])=>text===note);
  return use.kind==="draught"&&row?{kind:row[1],seconds:row[2]}:null;
}
export function activeUtilityDraught(effect,now=null){
  const state=effect?.flags?.["azeroth-rpg"]?.[UTILITY_DRAUGHT_FLAG];
  return state?.version===1&&!effect.disabled&&effect.active!==false&&effect.isSuppressed!==true
    &&effect.duration?.expired!==true&&!(now!==null&&Number.isFinite(state.expiresAt)&&state.expiresAt<=now)?state:null;
}
export function utilityCapability(effects,kind,now=null){
  return [...(effects?.values?.()??effects??[])].some(e=>activeUtilityDraught(e,now)?.kind===kind);
}
export function owlVisionChanges(){
  return [
    {key:"token.sight.enabled",type:"upgrade",value:"true",phase:"initial",priority:10},
    {key:"token.sight.range",type:"upgrade",value:"60",phase:"final",priority:30},
    {key:"token.detectionModes.basicSight.enabled",type:"upgrade",value:"true",phase:"final",priority:30},
    {key:"token.detectionModes.basicSight.range",type:"upgrade",value:"60",phase:"final",priority:30}
  ];
}
/** Old owned carriers receive the approved token changes without rewriting source. */
export function utilityEffectView(effect,now){
  const state=effect?.flags?.["azeroth-rpg"]?.[UTILITY_DRAUGHT_FLAG];
  if(!state)return effect;
  if(!activeUtilityDraught(effect,now))return null;
  if(state.kind!=="darkvision")return effect;
  const own=owlVisionChanges(),keys=new Set(own.map(row=>row.key));
  const changes=[...(effect.system?.changes??[]).filter(row=>!keys.has(row.key)),...own];
  const system=new Proxy(effect.system??{},{get(target,key){return key==="changes"?changes:Reflect.get(target,key,target);}});
  return new Proxy(effect,{get(target,key){if(key==="system")return system;const value=Reflect.get(target,key,target);
    return typeof value==="function"?value.bind(target):value;}});
}
