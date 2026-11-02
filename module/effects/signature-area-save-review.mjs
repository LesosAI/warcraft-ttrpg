const scope='azeroth-rpg';

/** Find saved area results whose delivery is interrupted, including older
 * results written before the explicit save-delivery marker existed. */
export function pendingSignatureAreaSaves(original){
 const source=original?.flags?.[scope];
 return [...(game.messages?.values?.()??[])].filter(message=>{
  const f=message.flags?.[scope],area=f?.area,record=f?.areaResult;
  const linked=area?.signatureMessageId===original.id
   ||(source?.signatureDamageRecovery?.bonusesClosed===true
    &&source.signatureDamageRecovery.originalMessageUuids?.includes(`ChatMessage.${area?.signatureMessageId}`));
  if(f?.kind!=='areaTest'||!message.author?.isGM||!record?.resultId
   ||!linked||area.signatureDamageCast!==source?.cast
   ||area.cast!==source.cast||area.caster!==source.spellLockCaster)return false;
  if(f.signatureAreaSaveDelivery)return f.signatureAreaSaveDelivery.state==='pending';
  if(!(Number((record.success?area.check?.success:area.check?.fail)?.rating)>0))return false;
  const event=`areaSave:${message.uuid}:ChatMessage.${record.resultId}`;
  const receipt=Object.values(source.signatureAreaDelivery??{}).find(row=>row.event===event);
  return !receipt||receipt.state!=='complete';
 }).map(message=>({uuid:message.uuid,id:message.id,flags:structuredClone(message.flags[scope]),author:message.author.id}))
  .sort((a,b)=>a.uuid.localeCompare(b.uuid));
}
