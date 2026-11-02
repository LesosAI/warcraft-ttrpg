/** Conditional equipment Boons are choices, never automatic skill bonuses.
 * Sources come from the equipped, usable, gated signature aggregate.
 */
export function signatureSkillChoices({kind,skill,signatures=[]}={}){
  if(kind!=='skill'||skill!=='stealth')return [];
  const band=signatures.find(row=>row.identifier==='band-of-veiled-shadows'&&row.itemId);
  return band?[{id:'signature-band-hide',name:band.name??'',
    label:'AZEROTH.Signature.BandHide',boons:1,banes:0,checked:false}]:[];
}

/** A target-relative declaration, not a Boon or a global Hidden-state inference. */
export function signatureHiddenChoices({kind,weaponId,damage,parry=false,targets=[],signatures=[]}={}){
  if(kind!=='attack'||!weaponId||!damage||parry)return [];
  const band=signatures.find(row=>row.identifier==='band-of-veiled-shadows'&&row.itemId);
  return band?targets.map((target,index)=>({id:`signature-band-hidden-${index}`,
    name:target.name??'',label:'AZEROTH.Signature.BandHiddenTarget',boons:0,banes:0,checked:false})):[];
}
