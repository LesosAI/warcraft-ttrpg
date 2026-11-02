/** Revalidate a chooser's source before spending the action or dose. */
export function consumableSourceCurrent({actor,item,held,source}={}) {
 const quantity=item?.system?.quantity===undefined?1:item?.system?.quantity;
 return !!(actor?.isOwner&&item?.parent===actor&&globalThis.fromUuidSync?.(actor.uuid)===actor
  &&actor.items.get(item.id)===item&&quantity===held
  &&(source===undefined||source===JSON.stringify({name:item.name,use:item.system.use})));
}

/** Confirm the already-planned dose payment before delivering any benefit.
 * This does not retry, refund the turn budget, or claim cross-client locking. */
export async function payConsumableDose({actor,item,held,spend,source}={}) {
 const owns=()=>actor?.isOwner&&item?.parent===actor&&globalThis.fromUuidSync?.(actor.uuid)===actor;
 if(!consumableSourceCurrent({actor,item,held,source}))
  throw Error('Consumable source changed before dose payment');
 if(spend===null)return;
 if(spend?.delete)await item.delete();
 else if(spend)await item.update({'system.quantity':spend.quantity});
 else throw Error('Consumable dose payment is invalid');
 const saved=actor.items.get(item.id);
 const mechanicsCurrent=source===undefined||source===JSON.stringify({name:item.name,use:item.system.use});
 if(!owns()||!mechanicsCurrent||(spend.delete?saved!=null:saved!==item||item.system.quantity!==spend.quantity))
  throw Error('Consumable dose payment was not confirmed');
}
