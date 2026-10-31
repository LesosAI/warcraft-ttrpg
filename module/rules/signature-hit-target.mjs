/** A targetless attack uses its single unassigned damage result (-1). */
export function validHitBonusTarget(index,count){
  return Number.isInteger(count)&&count>=0&&Number.isInteger(index)
    &&(count===0?index===-1:index>=0&&index<count);
}
export function hitBonusDamageForTarget(bonuses,index,primaryType){
  const selected=bonuses.filter(row=>row.targetIndex===index);
  return {rating:selected.filter(row=>!row.extraType||row.extraType===primaryType)
    .reduce((n,row)=>n+row.extraDamage,0),
    extras:selected.filter(row=>row.extraType&&row.extraType!==primaryType)
      .map(row=>({type:row.extraType,amount:row.extraDamage}))};
}
export function hitBonusTargetsWithdrawn(bonuses,rows){
  if(!bonuses?.length||!rows?.length)return false;
  return bonuses.every(row=>Number.isInteger(row.targetIndex)
    ?rows[row.targetIndex]?.withdrawn===true:rows.every(d=>d?.withdrawn===true));
}
