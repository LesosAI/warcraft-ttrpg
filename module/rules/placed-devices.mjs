/** 08 §13: bounded device records, without invented target stats or climbing rules. */
export const PLACED_DEVICE="placedDevice";
export const PLACED_DEVICE_RECEIPT="placedDeviceReceipt";
export function placedDeviceKind(item){
  if(item?.type!=="gear"||item.system?.source?.document!=="08-EQUIPMENT"
    ||item.system.source.section!=="13 · Ordnance and devices · Devices")return null;
  return {"target-dummy":"dummy","spring-loaded-grapple":"grapple"}[item.system.identifier]??null;
}
export function dummyElapsed(state,{combatUuid=null,round=null,time=0}={}){
  if(state?.version!==1||state.kind!=="dummy"||!Number.isFinite(state.time)||!Number.isInteger(state.startRound))return null;
  if(state.combatUuid&&state.combatUuid===combatUuid&&Number.isInteger(round))return round-state.startRound;
  return Math.max(state.manualRound??0,state.lastElapsed??0,Math.floor((time-state.time)/6));
}
export function dummyClaim(state,{requestId,...clock}={}){
  if(typeof requestId!=="string"||!requestId||!Array.isArray(state?.claims))return {ok:false};
  if(state.claims.some(c=>c.requestId===requestId))return {ok:true,already:true,state};
  const elapsed=dummyElapsed(state,clock);
  if(elapsed===null||elapsed<0||elapsed>=3||state.claims.length>=3||state.claims.some(c=>c.round===elapsed))return {ok:false};
  return {ok:true,state:{...state,lastElapsed:elapsed,claims:[...state.claims,{round:elapsed,requestId}]}};
}
export function grappleDistanceAllowed(feet){return Number.isFinite(feet)&&feet>=0&&feet<=60;}
