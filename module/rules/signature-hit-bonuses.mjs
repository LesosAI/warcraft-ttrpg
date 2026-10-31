import {approvedSignatureValues} from './approved-signature-values.mjs';

/** Qualifying bonuses for ONE recipient of a successful Attack Test. Sources
 * are the usable equipment aggregate, modifiers are the bearer's own values,
 * and hiddenFromTarget must be snapshotted before the Test reveals the attacker.
 * This calculates candidates only; runtime must claim each actor-owned allowance
 * and include the selected rows before the hit's normal damage mitigation.
 */
export function signatureHitBonuses({signatures=[],ownModifiers={},skillRanks={},
  success=false,parry=false,notAttack=false,sl,weaponId=null,naturalWeapon=false,
  form=null,activeAugmentId=null,hiddenFromTarget=false}={}){
  if(success!==true||parry===true||notAttack===true||!Number.isInteger(sl)||sl<0)return [];
  const weapon=typeof weaponId==='string'&&weaponId.length>0;
  const seen=new Set(),rows=[];
  for(const source of signatures){
    if(!source?.itemId||seen.has(source.identifier))continue;
    let type;
    switch(source.identifier){
      case 'the-horsemans-blade':
        if(!weapon||source.itemId!==weaponId)continue;
        type='fire';break;
      case 'band-of-veiled-shadows':
        if(!weapon||hiddenFromTarget!==true)continue;
        type=null;break; // Adds to this hit's primary damage, including non-Physical hits.
      case 'idol-of-brutality':
      case 'idol-of-ferocity': {
        const required=source.identifier==='idol-of-brutality'?'bear':'cat';
        const matching=Array.isArray(form)?form.includes(required):form===required;
        if(naturalWeapon!==true||weapon||!matching||source.itemId!==activeAugmentId)continue;
        type='physical';break;
      }
      default:continue;
    }
    const values=approvedSignatureValues(source.identifier,{ownModifiers,skillRanks,sl});
    if(!values||values.damage<=0)continue;
    seen.add(source.identifier);
    rows.push({identifier:source.identifier,itemId:source.itemId,name:source.name??'',
      extraDamage:values.damage,extraType:type});
  }
  return rows;
}
