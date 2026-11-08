/** Exact 08 §13 identities. Unnamed ranges, fuses and DCs stay unnamed. */
export const EXPLOSIVES=Object.freeze({
  "flash-powder":Object.freeze({condition:"blinded",resist:{resilience:"reflex",dc:12},nextTurn:true}),
  "concussion-charge":Object.freeze({condition:"stunned",resist:{resilience:"reflex",dc:13}}),
  "dynamite":Object.freeze({}),
  "blasting-charge":Object.freeze({placed:true,radius:10}),
  "incendiary-flask":Object.freeze({repeat:3}),
  "frost-grenade":Object.freeze({condition:"slowed"}),
  "sappers-satchel":Object.freeze({action:"full",placed:true,radius:20}),
  "thermite-stick":Object.freeze({metal:true}),
  "goblin-land-mine":Object.freeze({mine:true}),
  "smoke-bomb":Object.freeze({smoke:true})
});
export function explosiveRule(item){return item?.type==="gear"?EXPLOSIVES[item.system?.identifier]??null:null;}
export function explosiveAction(item,use){return explosiveRule(item)?.action??use?.action??null;}
