/** 04's Parachute Cloak has its own sideways allowance, never a Move. */
export const PARACHUTE_ACTION="parachuteGlide";
export const PARACHUTE_FALL="parachuteFall";
export function parachuteState(effect){
  const state=effect?.flags?.['azeroth-rpg']?.[PARACHUTE_FALL];
  return state?.version===1&&effect.disabled!==true&&effect.active!==false&&effect.isSuppressed!==true
    &&effect.duration?.expired!==true?state:null;
}
export function parachuteProtected(effects){
  return [...(effects?.values?.()??effects??[])].some(parachuteState);
}
export function glideAllowance(state,{round,speed}={}){
  const spent=state?.round===round?Math.max(0,Number(state.spent)||0):0;
  return Math.max(0,(Number(speed)||0)-spent);
}
export function horizontalGlide(from,to){
  return !!from&&!!to&&Number.isFinite(to.x)&&Number.isFinite(to.y)
    &&to.elevation===from.elevation&&to.level===from.level;
}
