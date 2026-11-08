/** 08 §13's carried device judgements. Exact item identity, not free-form prose parsing. */
import {guardPendingCustodyItem} from "./item-custody-guard.mjs";
export const DEVICE_BROKEN="deviceBroken";
export const CONTEXT_DEVICES=Object.freeze({
  "portable-ram":{skill:"athletics",label:"Ram",name:"Portable ram"},
  "goggles-magnifying":{skill:"investigation",label:"Magnifying",name:"Goggles, magnifying"},
  "gyro-compass":{skill:"survival",label:"Compass",name:"Gyro-compass"},
  "clockwork-lockpick":{skill:"tinkering",label:"Lockpick",name:"Clockwork lockpick",breaks:true},
  "jumper-cables":{skill:"medicine",label:"Cables",name:"Jumper cables",breaks:true},
  "crowbar":{skill:"athletics",label:"Crowbar",name:"Crowbar",tool:true},
  "climbing-kit":{skill:"athletics",label:"Climbing",name:"Climbing kit",tool:true},
  "magnifying-glass":{skill:"investigation",label:"Magnifying",name:"Magnifying glass",tool:true},
  "disguise-kit":{skill:"deception",label:"Disguise",name:"Disguise kit",tool:true},
  "splint-and-sling":{skill:"medicine",label:"Splint",name:"Splint and sling",section:"12 · Consumables · Bandages and dressings"}
});
export function contextDevice(item){
  if(item?.type!=="gear"||item.system?.source?.document!=="08-EQUIPMENT"
    ||item.isSuppressed||item.system.suppressed||(item.system.quantity??1)<=0||!guardPendingCustodyItem(item).ok)return null;
  const key=item.system.identifier,entry=CONTEXT_DEVICES[key];
  if(!entry||item.system.source.section!==(entry.section??(entry.tool?"11 · Adventuring gear · Adventuring tools":"13 · Ordnance and devices · Devices")))return null;
  return {key,...entry};
}
export function deviceBroken(item){return item?.flags?.["azeroth-rpg"]?.[DEVICE_BROKEN]?.version===1;}
export function deviceRows(items=[],{kind,skill}={}){
  if(kind!=="skill")return [];
  const seen=new Set();return [...items].flatMap(item=>{
    const entry=contextDevice(item),id=item.id??item._id;
    if(!entry||entry.skill!==skill||deviceBroken(item)||!id||seen.has(entry.key))return [];
    seen.add(entry.key);return [{id:`device:${id}`,name:item.name??entry.name,
      label:`AZEROTH.DeviceContext.${entry.label}`,img:item.img,boons:1,banes:0,modifier:0,checked:false}];
  });
}
export function selectedContextDevices(items=[],context={},chosen=[]){
  const rows=deviceRows(items,context),ids=chosen.filter(id=>id.startsWith("device:"));
  if(new Set(ids).size!==ids.length||ids.some(id=>!rows.some(row=>row.id===id)))return {ok:false,items:[]};
  return {ok:true,items:[...items].filter(item=>ids.includes(`device:${item.id??item._id}`))};
}
