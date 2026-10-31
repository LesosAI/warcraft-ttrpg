/** Conditional equipment Boons are choices, never automatic skill bonuses.
 * Sources come from the equipped, usable, gated signature aggregate.
 */
export function signatureSkillChoices({kind,skill,signatures=[]}={}){
  if(kind!=='skill'||skill!=='stealth')return [];
  const band=signatures.find(row=>row.identifier==='band-of-veiled-shadows'&&row.itemId);
  return band?[{id:'signature-band-hide',name:band.name??'',
    label:'AZEROTH.Signature.BandHide',boons:1,banes:0,checked:false}]:[];
}
