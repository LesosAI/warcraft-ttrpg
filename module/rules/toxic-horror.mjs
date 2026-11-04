/** Toxic Horror's distinct curable poisons. Pure; runtime owns durable claims. Each is carried
 *  until it is cured (D12): no count of ticks runs out, the damage repeats at the start of each
 *  of the carrier's turns in a fight and once an hour outside one, and each is also an affliction
 *  carrier whose beat this module's own advancer lands (`rules/creature-poisons.mjs`). */
import { SHED_DC_FLAG } from "./escapes.mjs";
import { AFFLICTION_FLAG } from "./afflictions.mjs";
import { creaturePoisonAff } from "./creature-poisons.mjs";
import { resolveDamage } from "./mitigation.mjs";
import { wardBySchool } from "./ward.mjs";
import { schoolArmorBySchool } from "./auras.mjs";
export const TOXIC_FLAG = "toxicHorrorPoison";
export const TOXIC_POISONS = Object.freeze({
  localized: Object.freeze({name:"Localized Toxin",action:"action",feet:5,dc:17,stacks:5,damage:1,seconds:3600}),
  deadly: Object.freeze({name:"Deadly Poison",action:"action",feet:10,dc:17,stacks:1,damage:3,seconds:3600,uses:1,per:"encounter"})
});
/** Biological poison takes Nature defenses, never caster spell bonuses. */
export function toxicPoisonDamage(target = {}, rating = 0, { dealtHalved = false } = {}) {
  return resolveDamage({ rating, sl: 0, kind: "magical", school: "nature",
    ward: wardBySchool(target.ward).nature ?? 0,
    schoolArmor: schoolArmorBySchool(target.schoolArmor).nature ?? 0,
    immune: target.immune ?? [], vulnerable: target.vulnerable ?? [],
    slAddsToDamage: false, dealtHalved });
}
const id=v=>typeof v === "string" && v.trim().length > 0;
const clock=c=>!!c && Number.isInteger(c.round) && c.round>=0 && Number.isInteger(c.turn) && c.turn>=0;
const later=(a,b)=>a.round>b.round || (a.round===b.round && a.turn>b.turn);
const spec=kind=>Object.hasOwn(TOXIC_POISONS,kind ?? "") ? TOXIC_POISONS[kind] : null;
export function validToxicPoison(s) {
  return !!(spec(s?.kind) && s.version===1 && id(s.sourceUuid) && id(s.targetUuid)
    && Array.isArray(s.exposures) && s.exposures.length && s.exposures.every(id) && new Set(s.exposures).size===s.exposures.length
    && (s.pending===null || id(s.pending))
    && (s.mode==="world" ? s.combatUuid===null && s.last===null && Number.isFinite(s.nextAt)
      : s.mode==="combat" && id(s.combatUuid) && clock(s.last) && s.nextAt===null));
}
export function toxicPoisonClock(state,{combatUuid=null,clock:at=null,time}={}) {
  if (!validToxicPoison(state) || state.pending) return null;
  if (combatUuid!==null) {
    if (!id(combatUuid) || !clock(at)) return null;
    return state.mode==="combat" && state.combatUuid===combatUuid ? state
      : {...state,mode:"combat",combatUuid,last:{round:at.round,turn:at.turn},nextAt:null};
  }
  if (!Number.isFinite(time)) return null;
  return state.mode==="world" ? state : {...state,mode:"world",combatUuid:null,last:null,nextAt:time+spec(state.kind).seconds};
}
/** The dose's stacks: one for each exposure, to the poison's cap. This is the poison's own state
 *  (D12 R1); the carrier's Poisoned value is only what the condition shows, and a beat lays it
 *  again at this number whatever was shed. */
export const toxicStacks=state=>Math.min(spec(state?.kind)?.stacks ?? 0,Array.isArray(state?.exposures) ? state.exposures.length : 0);
/** Call after a confirmed failed Body Test. `currentValue` matters only for a first dose (it must
 * be 0): an existing dose counts its own stacks, so shedding never lowers it. */
export function toxicPoisonDose({kind,sourceUuid,targetUuid,exposureId,existing=null,currentValue=0,
  combatUuid=null,clock:at=null,time}={}) {
  const rule=spec(kind);
  if (!rule || !id(sourceUuid) || !id(targetUuid) || !id(exposureId)) return null;
  if (existing!==null) {
    if (!validToxicPoison(existing) || existing.pending || existing.kind!==kind
      || existing.targetUuid!==targetUuid) return null;
    const held=toxicStacks(existing);
    if (existing.exposures.includes(exposureId)) return {state:existing,value:held,changed:false,reason:"duplicate"};
    if (kind==="deadly") return {state:existing,value:held,changed:false,reason:"existing"};
    const moved=toxicPoisonClock(existing,{combatUuid,clock:at,time});
    if (!moved) return null;
    return {state:{...moved,sourceUuid,exposures:[...existing.exposures,exposureId]},
      value:Math.min(rule.stacks,held+1),changed:true,reason:null};
  }
  if (currentValue!==0 || !Number.isFinite(time)) return null;
  let state={version:1,kind,sourceUuid,targetUuid,exposures:[exposureId],pending:null,
    mode:"world",combatUuid:null,last:null,nextAt:time+rule.seconds};
  state=toxicPoisonClock(state,{combatUuid,clock:at,time});
  return state ? {state,value:1,changed:true,reason:null} : null;
}
/** Invoke combat pulses only at the victim's turn start. Save next before
 * damage, then confirm the pending key. Uncertainty blocks refresh and transfer. */
export function toxicPoisonPulse(state,{targetUuid,disabled=false,combatUuid=null,clock:at=null,time}={}) {
  if (!validToxicPoison(state) || state.targetUuid!==targetUuid) return {action:"invalid",next:state};
  if (state.pending) return {action:"reconcile",next:state};
  const rule=spec(state.kind);
  // Damage and the value laid again come from the dose's stacks, never from what was shed.
  const value=toxicStacks(state);
  if (value<1) return {action:"invalid",next:state};
  let next,key;
  if (state.mode==="combat") {
    if (combatUuid!==state.combatUuid || !clock(at) || !later(at,state.last)) return {action:"none",next:state};
    key=`${combatUuid}:${at.round}:${at.turn}`;
    next={...state,last:{round:at.round,turn:at.turn}};
  } else {
    if (combatUuid!==null || !Number.isFinite(time) || time<state.nextAt) return {action:"none",next:state};
    key=`world:${state.nextAt}`;
    next={...state,nextAt:state.nextAt+rule.seconds};
  }
  if (disabled) return {action:"advance",next};
  next.pending=key;
  return {action:"tick",next,key,value,damage:{rating:rule.damage*value,school:"nature"}};
}
export function confirmToxicPoisonTick(state,key) {
  return validToxicPoison(state) && id(key) && state.pending===key ? {...state,pending:null} : null;
}

/** One removable carrier per poison kind. Its value feeds ordinary Poisoned
 * shedding; its flag owns ticks, so curing it cannot leave an orphaned timer. */
export function toxicPoisonEffect({state,value}={},{now=0,inFight=false}={}) {
  if (!validToxicPoison(state) || state.pending || !Number.isInteger(value)
    || value<1 || value>spec(state.kind).stacks) return null;
  const rule=spec(state.kind);
  const aff=creaturePoisonAff({name:rule.name,key:`creature-${state.kind}`,dc:rule.dc,
    sourceUuid:state.sourceUuid,now,inFight,value,damage:rule.damage*value});
  return {name:rule.name,img:"icons/svg/poison.svg",origin:state.sourceUuid,disabled:false,
    statuses:["poisoned"],system:{changes:[]},flags:{"azeroth-rpg":{harmful:true,poison:true,value,
      [SHED_DC_FLAG]:{dc:rule.dc,source:rule.name},[AFFLICTION_FLAG]:aff,[TOXIC_FLAG]:structuredClone(state)}}};
}
