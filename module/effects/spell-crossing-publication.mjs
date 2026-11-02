import {signatureDeliverySeed} from '../rules/signature-delivery.mjs';
import {crossingWrites} from './spell-crossing-write-state.mjs';
import {queueSignatureCard} from './signature-card-queue.mjs';
const scope='azeroth-rpg',same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const interrupted=()=>new Error('Emberflight publication could not be confirmed. Review the pending cast; do not cast again to retry movement.');

/** Persist a recoverable paid cast before displacement can change the world. */
export async function recordCrossingMove({actor,spell,cast,bonuses,plan,perform}) {
 const claim={cast,state:'pending',phase:'movement',writer:game.user.id};
 const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
  content:'<p>Emberflight is resolving. If interrupted, the GM must review this paid cast before any further movement or damage.</p>',
  flags:{[scope]:{kind:'spell',success:true,cast,spellLockCaster:actor.uuid,caster:actor.uuid,
   spellUuid:spell.uuid,spellName:spell.name,chosenSignatureBonuses:bonuses,
   chosenSignatureDelivery:signatureDeliverySeed({cast,bonuses}),
   spellCrossingPlan:structuredClone(plan),spellCrossingResolution:claim}}});
 const held=()=>message&&game.messages.get(message.id)===message
  &&same(message.flags?.[scope]?.spellCrossingResolution,claim);
 if(!held())throw interrupted();
 crossingWrites.add(message.id);
 try{
  const lines=await perform();
  if(!held())throw interrupted();
  return {message,claim,lines};
 }finally{crossingWrites.delete(message.id);}
}

/** Replace the placeholder, retaining a pending receipt until delivery takes over. */
export async function publishCrossingCard(record,data) {
 return queueSignatureCard(record.message,async()=>{
  const {message,claim}=record;
  if(game.messages.get(message.id)!==message
   ||!same(message.flags?.[scope]?.spellCrossingResolution,claim))throw interrupted();
  const ready={...claim,phase:'ready'};
  const flags={...data.flags,[scope]:{...data.flags[scope],spellCrossingResolution:ready}};
  await message.update({...data,flags});
  if(game.messages.get(message.id)!==message
   ||!same(message.flags?.[scope]?.spellCrossingResolution,ready)
   ||message.flags[scope].cast!==claim.cast)throw interrupted();
  return message;
 });
}
