/** 07, Mana Shield: spend Mana one-for-one before damage reaches Health.
 * The caller supplies damage remaining at the Health boundary and the actual
 * casting pool. No selection, payment, document mutation or upkeep here. */
export function manaShieldDamage({damage,mana}={}) {
  if(!Number.isSafeInteger(damage)||damage<0||!Number.isSafeInteger(mana)||mana<0)return null;
  const spent=Math.min(damage,mana);
  return {spent,mana:mana-spent,absorbed:spent,damage:damage-spent,ends:damage>mana};
}

/** Plan against the exact Sustain and casting pool, never the first Mana
 * pool on a multiclass character. Pending transfers cannot provide defense. */
export function manaShieldPlan({entry,pools,damage}={}) {
  const fail=reason=>({ok:false,reason});
  if(!entry || (entry.identifier!=='mana-shield' && !(entry.identifier==null&&entry.name==='Mana Shield'))
    || typeof entry.cast!=='string' || !entry.cast.trim())return fail('cast');
  if(entry.sustainTransfer!=null)return fail('transfer');
  if(!Object.hasOwn(entry,'itemId') || !Array.isArray(pools))return fail('pool');
  const matches=pools.filter(pool=>pool.kind==='power'&&pool.itemId===entry.itemId
    && (pool.name==='mana'||(pool.itemId===null&&pool.name==null)));
  if(matches.length!==1)return fail('pool');
  const pool=matches[0],result=manaShieldDamage({damage,mana:pool.value});
  if(!result)return fail('values');
  return {ok:true,cast:entry.cast,...result,pool:{itemId:pool.itemId,kind:'power',value:result.mana},
    expected:{entry:structuredClone(entry),pool:structuredClone(pool)}};
}
