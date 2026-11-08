export const ALARM_BOT='alarmBot';
export const ALARM_SECONDS=8*60*60;
export function watchGeometry(region){
  const raw=region?.toObject?.()??region;
  return JSON.stringify({shapes:raw?.shapes??[],levels:raw?.levels??[],elevation:raw?.elevation??null});
}
export function activeAlarm(region,now){
  const state=region?.flags?.['azeroth-rpg']?.[ALARM_BOT];
  return state?.version===1&&Number.isFinite(now)&&state.expiresAt>now
    &&state.geometry===watchGeometry(region)?state:null;
}
/** A point on a straight physical segment nearest the bot; the runtime still
 * judges actual reach through the common three-dimensional footprint measure. */
export function closestWatchPoint(from,to,anchor,pixelsPerFoot,offset={x:0,y:0}){
  const dx=to.x-from.x,dy=to.y-from.y,dz=(to.elevation-from.elevation)*pixelsPerFoot;
  const x=from.x+(offset.x??0)-anchor.x,y=from.y+(offset.y??0)-anchor.y;
  const z=(from.elevation-anchor.elevation)*pixelsPerFoot,length=dx*dx+dy*dy+dz*dz;
  const t=length>0?Math.max(0,Math.min(1,-(x*dx+y*dy+z*dz)/length)):0;
  return {...from,x:from.x+dx*t,y:from.y+dy*t,elevation:from.elevation+(to.elevation-from.elevation)*t};
}
