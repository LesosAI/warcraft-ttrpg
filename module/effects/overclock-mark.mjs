import {OVERCLOCK_FLAG} from '../rules/gadgets.mjs';
const scope='azeroth-rpg';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Device improvements remain adjudicated; gadgets carry a confirmed mark. */
export async function markOverclock(actor,chosen,by){
 if(!chosen?.featureId)return false;
 const item=actor.items.get(chosen.featureId);
 if(!item)throw Error('The selected Overclock gadget is no longer available.');
 const expected={by,fight:actor.activeFight?.()?.id??null};
 await item.setFlag(scope,OVERCLOCK_FLAG,structuredClone(expected));
 if(actor.items.get(item.id)!==item||!same(item.getFlag(scope,OVERCLOCK_FLAG),expected))throw Error('Overclock was not confirmed; inspect the gadget before retrying.');
 return true;
}

/** A retained mark must not silently supply another enhanced use. */
export async function consumeOverclock(item){
 await item.unsetFlag(scope,OVERCLOCK_FLAG);
 if(item.getFlag(scope,OVERCLOCK_FLAG)!=null)throw Error('Overclock consumption was not confirmed; inspect the gadget before retrying.');
}
