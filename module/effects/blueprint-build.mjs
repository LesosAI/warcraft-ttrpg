import {BLUEPRINT_FLAG} from '../rules/gadgets.mjs';
const scope='azeroth-rpg',busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Confirm the created device and saved relationship before announcing a build.
 * Failure preserves any completed writes for GM inspection; no blind retry. */
export async function buildBlueprint(actor,chosen,talentId=null){
 if(!actor?.uuid||busy.has(actor.uuid))throw Error('Blueprint construction is already running.');
 busy.add(actor.uuid);
 try{
  // Resolve the new device before removing a previous build.
  const device=chosen?.gadget?null:chosen?.uuid?await fromUuid(chosen.uuid):null;
  if(!chosen?.gadget&&!device)throw Error('Blueprint device is no longer available; no build was made.');
  const data=device?.toObject();
  const held=actor.getFlag(scope,BLUEPRINT_FLAG)??null;
  if(held?.itemId&&actor.items.has(held.itemId)){
   await actor.deleteEmbeddedDocuments('Item',[held.itemId]);
   if(actor.items.has(held.itemId))throw Error('Previous Blueprint device removal was not confirmed.');
  }
  let record;
  if(chosen.gadget)record={gadget:chosen.key,itemId:null,talentId};
  else{
   const [made]=await actor.createEmbeddedDocuments('Item',[{...data,flags:{...(data.flags??{}),[scope]:{...(data.flags?.[scope]??{}),[BLUEPRINT_FLAG]:true}}}]);
   if(!made?.id||actor.items.get(made.id)!==made)throw Error('Blueprint device creation was not confirmed.');
   record={gadget:null,itemId:made.id,talentId};
  }
  const expected=structuredClone(record);
  await actor.setFlag(scope,BLUEPRINT_FLAG,record);
  if(!same(actor.getFlag(scope,BLUEPRINT_FLAG),expected))throw Error('Blueprint record was not confirmed; inspect the created device before retrying.');
  // A device also replaces the previous gadget's granted feature.
  await actor.syncClassFeatures?.();
  if(!same(actor.getFlag(scope,BLUEPRINT_FLAG),expected))throw Error('Blueprint changed during feature synchronization.');
  if(held?.gadget && (held.gadget!==expected.gadget || held.talentId!==talentId)){
   const stale=[...actor.items.values()].some(item=>item.type==='feature'
    &&item.flags?.[scope]?.feature?.gadget===held.gadget&&item.flags[scope].feature.talentId===held.talentId);
   if(stale)throw Error('Previous Blueprint gadget removal was not confirmed; inspect the saved build before retrying.');
  }
  if(chosen.gadget){
   const granted=[...actor.items.values()].some(item=>item.type==='feature'
    &&item.flags?.[scope]?.feature?.gadget===chosen.key&&item.flags[scope].feature.talentId===talentId);
   if(!granted)throw Error('Blueprint gadget grant was not confirmed; inspect the saved build before retrying.');
  }
  return expected;
 }finally{busy.delete(actor.uuid);}
}
