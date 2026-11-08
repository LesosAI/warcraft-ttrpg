/** 08 §13: one physical pair, exactly60 feet straight. No action/Test/reset is invented. */
import {guardPendingCustodyItem} from "./item-custody-guard.mjs";
export const ROCKET_BOOTS_ACTION="rocketBoots";
export const ROCKET_BOOTS_STATE="rocketBootsUse";
export function rocketBoots(item){return item?.type==="gear"&&item.system?.identifier==="rocket-boots"
  &&item.system?.source?.document==="08-EQUIPMENT"&&item.system.source.section==="13 · Ordnance and devices · Devices";}
export function bootsAvailable(item){return rocketBoots(item)&&(item.system.quantity??1)>0&&guardPendingCustodyItem(item).ok
  &&!item.flags?.["azeroth-rpg"]?.[ROCKET_BOOTS_STATE]?.spent&&!item.flags?.["azeroth-rpg"]?.deviceBroken;}
export function straightBootPath(from,to,path=[]){
  if(!path.length||![from?.x,from?.y,to?.x,to?.y].every(Number.isFinite))return false;
  const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;if(!length)return false;
  let previous=0;
  for(const p of path){
    if(p.action!==ROCKET_BOOTS_ACTION||![p.x,p.y].every(Number.isFinite)||p.elevation!==from.elevation||p.level!==from.level)return false;
    const x=p.x-from.x,y=p.y-from.y,along=x*dx+y*dy;
    if(along<previous||along>length+0.001||Math.abs(x*dy-y*dx)>0.001)return false;previous=along;
  }
  return Math.abs(path.at(-1).x-to.x)<0.001&&Math.abs(path.at(-1).y-to.y)<0.001;
}
