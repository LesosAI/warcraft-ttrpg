import {claimSignatureDelivery,finishSignatureDelivery,signatureDamageOutcome} from '../rules/signature-delivery.mjs';

export const SIGNATURE_DELIVERY_FLAG='chosenSignatureDelivery';
const busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const authoritative=message=>globalThis.game?.user?.isGM===true
  && game.users?.activeGM?.id===game.user.id && fromUuidSync(message?.uuid)===message;

/** Shared by delivery and explicit GM reconciliation; never break a live write. */
export async function withSignatureDeliveryLock(message,execute){
  if(!message?.uuid||typeof execute!=='function')return {ok:false,reason:'context'};
  if(busy.has(message.uuid))return {ok:false,reason:'busy'};
  busy.add(message.uuid);
  try{return await execute();}finally{busy.delete(message.uuid);}
}

/** Called only by an authenticated delivery path after target admission.
 * The callback must report whether the hit actually dealt damage, not whether
 * a chat card was posted. Pending writes are preserved on any uncertain result.
 * This coordinator is shared by Apply and tick delivery, so both hold one lock.
 */
export async function deliverChosenSignature({message,cast,recipient,event,validate,execute}={}) {
  if(!message?.uuid||typeof validate!=='function'||typeof execute!=='function'||!authoritative(message))return {ok:false,reason:'authority'};
  return withSignatureDeliveryLock(message,async()=>{
  try{
    const writer=game.user.id;
    const original=structuredClone(message.getFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG));
    const valid=()=>authoritative(message)&&game.user.id===writer&&validate()===true;
    if(!valid())return {ok:false,reason:'changed'};
    const claimed=claimSignatureDelivery(original,{cast,recipient,event,writer});
    if(!claimed)return {ok:false,reason:'unavailable'};
    await message.setFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG,claimed.state);
    if(!valid()||!same(message.getFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG),claimed.state))return {ok:false,reason:'claimUncertain'};
    const stillValid=()=>valid()&&same(message.getFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG),claimed.state);
    const result=await execute({bonuses:structuredClone(claimed.bonuses),valid:stillValid});
    // An Actor receipt takes precedence over a callback's inferred boolean.
    // A zero retained share says nothing about damage to transfer recipients.
    const outcome=result?.damageOutcome;
    const dealtDamage=outcome !== undefined
      ? signatureDamageOutcome(outcome)
      : result?.dealtDamage;
    if(!stillValid()||result?.ok!==true||typeof dealtDamage!=='boolean')return {ok:false,reason:'deliveryUncertain'};
    const complete=finishSignatureDelivery(claimed.state,{cast,event,writer,dealtDamage});
    if(!complete)return {ok:false,reason:'deliveryUncertain'};
    await message.setFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG,complete);
    if(!valid()||!same(message.getFlag('azeroth-rpg',SIGNATURE_DELIVERY_FLAG),complete))return {ok:false,reason:'completionUncertain'};
    return {ok:true,dealtDamage};
  }catch{return {ok:false,reason:'writeUncertain'};}
  });
}
