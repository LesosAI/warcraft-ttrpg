/** D-813: travel and concealment readers; no Foundry dependencies. */
import {activeEquipmentEffects,equipmentState} from './special-equipment.mjs';
import {meteredFeet,stepFeet} from './movement.mjs';
import {utilityCapability} from './utility-draughts.mjs';
import {parachuteProtected} from './parachute.mjs';

export function equipmentInvisible(effects,now){
  return activeEquipmentEffects(effects,now).some(e=>equipmentState(e).key==='invisibility-potion');
}
export function spellInvisible(effect){
  const f=effect?.flags?.['azeroth-rpg'];
  return f?.identifier==='invisibility'&&typeof f.spell==='string'&&typeof f.cast==='string';
}
export function invisibilityActive(effects,now){
  return equipmentInvisible(effects,now)||[...(effects?.values?.()??effects??[])].some(e=>spellInvisible(e)
    &&e.disabled!==true&&e.active!==false&&e.isSuppressed!==true&&e.duration?.expired!==true);
}
export function equipmentFallProtected(effects,now){
  return parachuteProtected(effects)||utilityCapability(effects,'fallProtection',now)||activeEquipmentEffects(effects,now).some(e=>equipmentState(e).key==='noggenfogger-elixir'
    &&equipmentState(e).result==='featherfall');
}
export function invisibilityEnds({event,damage=0}={}){
  return ['attack','cast','consumable'].includes(event)||(event==='damage'&&Number.isFinite(damage)&&damage>0);
}
/** Read the entire turn's core history, granting ten swimming feet per Move.
 * Split drags and water/land/water segments share the same credit. */
export function equipmentMovementFeet(movement,steps,{pace=0,effects=[],now}={}){
  return equipmentMovementPlan(movement,steps,{pace,effects,now}).feet;
}
export function equipmentMovementPlan(movement,steps,{pace=0,groundSpeed=pace,effects=[],now,ledger=null}={}){
  const fallback=()=>({feet:meteredFeet(movement,steps),ledger:null});
  if(!(pace>0))return fallback();
  const active=activeEquipmentEffects(effects,now).some(e=>equipmentState(e).key==='swim-speed-potion');
  const history=movement?.history;
  const sections=history&&(history.recorded||history.unrecorded)
    ?[[history.recorded,steps?.recorded],[history.unrecorded,steps?.unrecorded],[movement?.passed,steps?.passed]]
    :[[history,steps?.history],[movement?.passed,steps?.passed]];
  // A bare aggregate has no reliable swimming identity: preserve normal cost.
  if(sections.some(([section,measured])=>section&&(section.cost>0||section.distance>0)
    &&(!Array.isArray(section.waypoints)||!Array.isArray(measured))))return fallback();
  const speedBonuses=[...(effects?.values?.()??effects??[])].filter(e=>e.flags?.['azeroth-rpg']?.consumable
    &&e.disabled!==true&&e.active!==false&&e.isSuppressed!==true&&e.duration?.expired!==true)
    .flatMap(e=>(e.system?.changes??[]).filter(c=>c.key==='system.speed'&&c.type==='add').map(c=>Math.max(0,Number(c.value)||0)));
  const paceScale=groundSpeed>0?pace/groundSpeed:1;
  const genericSpeed=speedBonuses.reduce((a,b)=>a+b,0)*paceScale,greatestSpeed=Math.max(0,...speedBonuses)*paceScale;
  let move=0,spent=0,credit=10,cap=10,movePace=pace,touched=false,swam=false;
  const previous=Array.isArray(ledger?.segments)?ledger.segments:[],segments=[];
  let matching=true;
  for(const [section,measured] of sections)for(let i=0;i<(section?.waypoints?.length??0);i++){
    const waypoint=section.waypoints[i],step=measured?.[i];
    let cost=stepFeet(waypoint,step);
    let feet=Math.max(0,Number(typeof step==='object'?(step.squares??step.distance):step)||0);
    if(!(cost>0)||!(feet>0))continue;
    touched=true;const key=JSON.stringify([waypoint.x,waypoint.y,waypoint.elevation,waypoint.action,cost,feet]);
    const saved=previous[segments.length];
    if(matching&&saved?.key===key){
      ({move,spent,credit,cap,movePace}=saved);swam=swam||saved.swam===true;segments.push(saved);continue;
    }
    matching=false;let rate=cost/feet;const swimming=waypoint.action==='swim'&&active;swam=swam||swimming;
    if(swimming){
      // A generic consumable's Speed already contributes swimming distance.
      // Only the greater consumable bonus applies to that portion (08 §12).
      const nextCap=Math.max(0,10-greatestSpeed/rate);
      credit=Math.max(0,nextCap-(cap-credit));cap=nextCap;
      const normal=pace/rate,allowed=(pace-genericSpeed+greatestSpeed)/rate;
      if(allowed>0&&normal>allowed)rate*=normal/allowed;
    }
    while(feet>1e-9){
      if(swimming&&credit>0){const free=Math.min(feet,credit);feet-=free;credit-=free;if(feet<=1e-9)break;}
      if(spent>=movePace-1e-9){move++;spent=0;movePace=pace;credit=cap;continue;}
      const paid=Math.min(feet,(movePace-spent)/rate);spent+=paid*rate;feet-=paid;
    }
    segments.push({key,move,spent,credit,cap,movePace,swam:swimming});
  }
  // A Move consisting of bonus swimming still spends a Move. The epsilon is
  // above movementAllowed's float tolerance, but never a physical extra foot.
  // Move-accounting exists for the swimming credit alone. A turn with no paid swimming
  // reads exactly as core's metering does: rescaling a ledger saved at another pace
  // (Wings after a walk) turned thirty feet walked into the whole flying pace.
  if(!swam)return {feet:meteredFeet(movement,steps),ledger:null};
  return {feet:touched?move*pace+Math.max(spent*pace/movePace,0.001):0,ledger:{pace,segments}};
}
