import {utilityDraught,UTILITY_DRAUGHT_FLAG,owlVisionChanges} from "../rules/utility-draughts.mjs";
import {writeConsumableEffect} from "./consumable-effect.mjs";
import {spellTiming} from "./durations.mjs";

/** Called only after the existing use receipt confirms action and dose payment. */
export async function applyUtilityDraught(actor,item,use,timing){
  const rule=utilityDraught(use);if(!rule)return null;
  const record={version:1,kind:rule.kind,expiresAt:(game.time?.worldTime??0)+rule.seconds};
  const capability=rule.kind==="environmentalCold"?"ignoreEnvironmentalCold":rule.kind;
  const data={name:item.name,img:item.img,origin:actor.uuid,disabled:false,transfer:false,
    description:item.system.description,system:{changes:rule.kind==="darkvision"?owlVisionChanges():[]},...spellTiming(actor,{value:rule.seconds,units:"seconds"}),
    flags:{"azeroth-rpg":{consumable:item.system.identifier||item.name,[UTILITY_DRAUGHT_FLAG]:record,
      [capability]:{source:item.name,by:actor.uuid}}}};
  const matches=[...actor.effects].filter(e=>e.flags?.["azeroth-rpg"]?.[UTILITY_DRAUGHT_FLAG]?.kind===rule.kind);
  const effect=await writeConsumableEffect(actor,data,matches[0]??null);
  const duplicates=matches.slice(1).map(e=>e.id);
  if(duplicates.length)await actor.deleteEmbeddedDocuments("ActiveEffect",duplicates);
  return effect;
}
