export const SIGNATURE_USES_FLAG='approvedSignatureUses';
export const approvedCharm=id=>['balebrew-charm','brightbrew-charm'].includes(id);
export const approvedHitSignature=id=>['jangthraze-the-protector','horned-viking-helmet'].includes(id);
export const approvedRestSignature=id=>approvedCharm(id)||approvedHitSignature(id)||['cannonball-runner','piccolo-of-the-flaming-fire'].includes(id);
/** One read model for every copy and surface; unknown claims fail closed. */
export function charmUseView(identifier,records={},equipped=true){
 if(!approvedRestSignature(identifier))return null;
 const state=records?.[identifier]?.state;
 const ready=!state||state==='ready';
 return {value:ready?1:0,max:1,per:'short',
  refusal:!equipped?'unequipped':ready?null:state==='spent'?'spent':'pending'};
}
