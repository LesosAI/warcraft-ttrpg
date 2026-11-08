/** Explicit GM-authored encounter identity, independent of damage type/name guesses. */
export const ENGULFMENT_FLAG="shadowFlameEngulfment";
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==="object"
  ?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,sorted(value[k])])):value;
export function engulfmentSnapshot(data={}){
  const flags=structuredClone(data.flags??{});
  if(flags["azeroth-rpg"])delete flags["azeroth-rpg"][ENGULFMENT_FLAG];
  if(flags["azeroth-rpg"]&&!Object.keys(flags["azeroth-rpg"]).length)delete flags["azeroth-rpg"];
  const duration=structuredClone(data.duration??{});delete duration.expired;
  // Full system and remaining flags include every tick/rider payload. The
  // application clock/origin and document identity are deliberately separate.
  return JSON.stringify(sorted({name:data.name??"",type:data.type??"base",system:data.system??{},
    statuses:[...(data.statuses??[])].sort(),duration,flags}));
}
export function cloakProtectsEngulfment({items=[],suppressed=false,identified=false}={}){
  return identified&&!suppressed&&[...items].some(i=>i.system?.identifier==="onyxia-scale-cloak"
    &&i.system.equipped===true&&i.isSuppressed!==true&&i.system.suppressed!==true);
}
