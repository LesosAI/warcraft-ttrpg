import {approvedSignatureValues} from './approved-signature-values.mjs';

/** Resolve the approved weapon-kill rewards from authenticated event data.
 * `signatures` must contain only currently usable, active equipment sources.
 * Runtime owns hostility resolution, saved attack validation, delivery receipts,
 * and the shared actor turn allowance. A Health transition alone is not proof
 * of an attack: callers must confirm the successful weapon hit separately.
 */
export function signatureKillRewards({signatures=[], ownModifiers={}, attackerUuid,
  targetUuid, hostile=false, before, after, weaponId, rangeKind,
  successfulWeaponAttack=false, sl}={}) {
  if (typeof attackerUuid!=='string' || !attackerUuid || typeof targetUuid!=='string'
    || !targetUuid || attackerUuid===targetUuid || hostile!==true
    || successfulWeaponAttack!==true || typeof weaponId!=='string' || !weaponId
    || !['melee','ranged','thrown'].includes(rangeKind)
    || !Number.isFinite(before) || before<=0 || after!==0
    || !Number.isInteger(sl) || sl<0) return [];

  const rewards=[];
  const seen=new Set();
  for (const source of signatures) {
    if (!source?.itemId || seen.has(source.identifier)) continue;
    if (source.identifier==='death-grips') {
      if (rangeKind!=='melee') continue;
    } else if (source.identifier==='spinal-reaper') {
      if (source.itemId!==weaponId) continue;
    } else continue;
    const values=approvedSignatureValues(source.identifier,{ownModifiers,sl});
    if (!values) continue;
    const kind=source.identifier==='death-grips'?'healing':'temporaryHealth';
    if (values[kind]<=0) continue;
    seen.add(source.identifier);
    rewards.push({identifier:source.identifier,itemId:source.itemId,
      name:source.name??'',kind,amount:values[kind]});
  }
  return rewards;
}
