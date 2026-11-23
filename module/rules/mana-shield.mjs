/** 07, Mana Shield: spend Mana one-for-one before damage reaches Health.
 * The caller supplies damage remaining at the Health boundary and the actual
 * casting pool. No selection, payment, document mutation or upkeep here.
 *
 * **AND 04's MANA SHIELD AT RANK 2** (the class talent audit, D-1890: *every 2 damage it
 * takes costs you 1 Mana, rounded up*): `ratio` is the damage one Mana takes - 1 by 07, 2 with
 * the talent - so the Mana due is the damage over the ratio, rounded up. A pool that cannot pay
 * it all takes what it can (`mana * ratio` damage) and the shield ends, as 07 says. */
export function manaShieldDamage({damage,mana,ratio=1}={}) {
  if(!Number.isSafeInteger(damage)||damage<0||!Number.isSafeInteger(mana)||mana<0)return null;
  const r=Number.isSafeInteger(ratio)&&ratio>=1?ratio:1;
  const due=Math.ceil(damage/r);
  const absorbed=Math.min(damage,mana*r);
  const spent=Math.min(mana,Math.ceil(absorbed/r));
  return {spent,mana:mana-spent,absorbed,damage:damage-absorbed,ends:due>mana};
}

/** Plan against the exact Sustain and casting pool, never the first Mana
 * pool on a multiclass character. Pending transfers cannot provide defense. */
export function manaShieldPlan({entry,pools,damage,ratio=1}={}) {
  const fail=reason=>({ok:false,reason});
  if(!entry || (entry.identifier!=='mana-shield' && !(entry.identifier==null&&entry.name==='Mana Shield'))
    || typeof entry.cast!=='string' || !entry.cast.trim())return fail('cast');
  if(entry.sustainTransfer!=null)return fail('transfer');
  if(!Object.hasOwn(entry,'itemId') || !Array.isArray(pools))return fail('pool');
  const matches=pools.filter(pool=>pool.kind==='power'&&pool.itemId===entry.itemId
    && (pool.name==='mana'||(pool.itemId===null&&pool.name==null)));
  if(matches.length!==1)return fail('pool');
  const pool=matches[0],result=manaShieldDamage({damage,mana:pool.value,ratio});
  if(!result)return fail('values');
  return {ok:true,cast:entry.cast,...result,ratio:Number.isSafeInteger(ratio)&&ratio>=1?ratio:1,pool:{itemId:pool.itemId,kind:'power',value:result.mana},
    expected:{entry:structuredClone(entry),pool:structuredClone(pool)}};
}
