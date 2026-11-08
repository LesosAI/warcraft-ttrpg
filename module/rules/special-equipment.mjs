/** Approved 08 special equipment (2026-11-07). Pure descriptors, never Foundry documents. */
import {drinkModifiers} from "./provision-benefits.mjs";
import {deviceRows} from "./device-context.mjs";
import {prostheticRows} from "./prosthetics.mjs";
export const SPECIAL_EQUIPMENT_FLAG = "specialEquipment";
export const SPECIAL_LIMIT_FLAG = "specialEquipmentUses";
const row = (name, extra) => Object.freeze({ name, ...extra });
export const SPECIAL_EQUIPMENT = Object.freeze({
  "witch-doctor-headdress": row("Witch-doctor headdress", {slot:"head", passive:true}),
  "wolfshead-helm": row("Wolfshead Helm", {slot:"head", passive:true, per:"long", wisdom:1}),
  "lucky-fishing-hat": row("Lucky Fishing Hat", {slot:"head", passive:true}),
  "catseye-ultra-goggles": row("Catseye Ultra Goggles", {slot:"head", passive:true}),
  "spider-belt": row("Spider Belt", {slot:"waist", per:"long", action:"half", seconds:6}),
  "gauntlets-of-the-sea": row("Gauntlets of the Sea", {slot:"hands", per:"long", action:"half", heal:4, touch:true}),
  "onyxia-scale-cloak": row("Onyxia Scale Cloak", {slot:"back", passive:true, manual:"Only approved Shadow Flame lingering engulfment; initial impact still resolves. GM adjudicates until an encounter identity exists."}),
  luffa: row("Luffa", {slot:"trinket", per:"long", action:"half", reaction:true}),
  "savory-deviate-delight": row("Savory Deviate Delight", {food:true, provision:"food", action:null, preparation:60, seconds:3600, random:2, appearance:true}),
  "dragonbreath-chili": row("Dragonbreath Chili", {food:true, provision:"food", action:null, preparation:60, seconds:600, reaction:true, cone:10, damage:2, dc:16}),
  "nightfin-soup": row("Nightfin Soup", {food:true, provision:"food", passive:true, per:"long", restMana:2}),
  "runn-tum-tuber-surprise": row("Runn Tum Tuber Surprise", {food:true, provision:"food", action:null, preparation:60, seconds:3600}),
  "kreegs-stout-beatdown": row("Kreeg's Stout Beatdown", {provision:"drink", action:"half", seconds:600}),
  "winterfall-firewater": row("Winterfall Firewater", {provision:"drink", per:"long", action:"half", seconds:600}),
  "demonic-rune": row("Demonic Rune", {per:"long", action:"half", healthCost:3, mana:4}),
  "swim-speed-potion": row("Swim Speed Potion", {action:"half", seconds:60, swim:10}),
  "invisibility-potion": row("Invisibility Potion", {per:"short", action:"half", seconds:18}),
  "noggenfogger-elixir": row("Noggenfogger Elixir", {per:"short", action:"half", seconds:600, random:3, appearance:true})
});
export function specialEquipmentOf(item) {
  const key = item?.system?.identifier ?? item?.identifier;
  return Object.hasOwn(SPECIAL_EQUIPMENT,key) ? {key,...SPECIAL_EQUIPMENT[key]} : null;
}
export function equipmentState(effect) {
  return effect?.flags?.["azeroth-rpg"]?.[SPECIAL_EQUIPMENT_FLAG] ?? null;
}
export function activeEquipmentEffects(effects=[], now=null) {
  const seen=new Set();
  return [...effects].filter(e=>{
    const s=equipmentState(e);
    if(e.disabled||e.active===false||e.isSuppressed===true||e.duration?.expired===true||e.flags?.["azeroth-rpg"]?.equipmentTestClaim||s?.version!==1
      ||(now!==null&&Number.isFinite(s.expiresAt)&&s.expiresAt<=now)||seen.has(s.key))return false;
    seen.add(s.key);return true;
  });
}
/** Both the creature and physical item must be eligible; trades never refill a spent item. */
export function equipmentLimitAvailable(key, actorUses={}, itemUses={}) {
  return actorUses?.[key]?.spent!==true && itemUses?.[key]?.spent!==true;
}
export function rechargeEquipmentUses(uses={},rest="short") {
  return Object.fromEntries(Object.entries(uses).filter(([key])=>{
    const per=SPECIAL_EQUIPMENT[key]?.per;
    return !(per==="short" || (rest==="long" && per==="long"));
  }));
}
export function runeExchange({health=0,pools=[],poolId=null}={}) {
  const pool=pools.find(p=>p.kind==="power" && p.name==="mana" && (poolId===null || p.itemId===poolId));
  if(health<4 || !pool || pool.value>=pool.max)return null;
  return {health:health-3,pool:{itemId:pool.itemId,kind:pool.kind,value:Math.min(pool.max,pool.value+4)}};
}
export function noggenfoggerResult(face) {
  if(![1,2,3].includes(face))return null;
  return [{result:"shrink",seconds:600,str:-2,dex:2},{result:"skeleton",seconds:600},{result:"featherfall",seconds:60}][face-1];
}
/** Contextual permissions remain unchecked table judgements, never reveal hidden information. */
export function equipmentModifiers({items=[],effects=[],actor=null,rangeKind=null,kind="skill",skill=null,ability=null,resilience=null,now=null,social=false,messages={}}={}) {
  const automatic=[],judgement=[];
  const add=(list,key,name,note,boons=1,banes=0)=>{const label=messages[key]??`AZEROTH.SpecialEquipment.Context.${key}`;list.push({id:`equipment:${key}`,name,label,note:label,boons,banes,modifier:0,checked:list===automatic});};
  const worn=new Map([...items].filter(i=>i.system?.equipped).map(i=>[i.system?.identifier,i]));
  if(kind==="skill"&&skill==="medicine"&&worn.has("witch-doctor-headdress"))add(judgement,"headdress","Witch-doctor headdress","Treat disease or stop Bleeding only");
  if(kind==="skill"&&skill==="survival"&&worn.has("lucky-fishing-hat"))add(judgement,"fishing","Lucky Fishing Hat","Daily foraging by fishing; fishable water and tackle/net required");
  const engineering=[...items].some(i=>i.type==="profession"&&(i.system?.identifier==="engineering"||i.name==="Engineering")&&Number(i.system?.rank)>=1);
  if(kind==="skill"&&skill==="perception"&&engineering&&worn.has("catseye-ultra-goggles"))add(judgement,"catseye","Catseye Ultra Goggles","Engineering training; sight-based detection of hiding creatures only; no invisible reveal");
  for(const e of activeEquipmentEffects(effects,now)) {
    const s=equipmentState(e),key=s.key;
    if(key==="savory-deviate-delight"&&kind==="skill"&&["deception","persuasion"].includes(skill))add(judgement,key,"Savory Deviate Delight","Against pirates or roguish-aligned factions only");
    if(key==="noggenfogger-elixir"&&s.result==="skeleton"&&(social||kind==="skill"||kind==="ability"))add(judgement,key,"Noggenfogger Elixir","Social Test against undead only");
    if(key==="runn-tum-tuber-surprise"&&kind==="skill"&&ability==="int")add(automatic,key,"Runn Tum Tuber Surprise","Next Intelligence-based Skill Test");
    if(key==="kreegs-stout-beatdown") {
      if(kind==="resilience"&&resilience==="spirit")add(judgement,"kreeg-fear","Kreeg's Stout Beatdown","Against fear only; does not add to Orcish grog or Dwarven stout");
      if(ability==="int")add(automatic,"kreeg-int","Kreeg's Stout Beatdown","Intelligence-based Test",0,1);
    }
  }
  const drinks=drinkModifiers(effects,{kind,resilience});
  automatic.push(...drinks.automatic);judgement.push(...drinks.judgement);
  judgement.push(...deviceRows(items,{kind,skill}));
  for(const row of prostheticRows(actor,{kind,skill,rangeKind}))(row.checked?automatic:judgement).push(row);
  return {automatic,judgement};
}
export function pendingEquipmentTest(effects,context={}) {
  if(context.kind!=="skill"||context.ability!=="int")return [];
  return activeEquipmentEffects(effects,context.now??null).filter(e=>equipmentState(e).key==="runn-tum-tuber-surprise").map(e=>e.id??e._id);
}
export function equipmentMeleeBonus(effects,{melee=false,attack=false,now=null}={}) {
  return melee&&attack&&activeEquipmentEffects(effects,now).some(e=>equipmentState(e).key==="winterfall-firewater")?1:0;
}
export function specialEquipmentUse(entry,empty) {
  if(!entry || entry.passive)return empty;
  return {...empty,kind:"special",action:entry.action??null,target:entry.touch?"creature":"self",note:entry.name};
}
