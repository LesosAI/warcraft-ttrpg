import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
import {tickLanding,tickCountdown} from '../rules/ticks.mjs';
import {actorInWorld} from '../canvas/in-world.mjs';
import {sustainedSpellLive} from './sustained-spells.mjs';
import {strikeFromArea} from './area-strikes.mjs';
import {queueSignatureCard} from './signature-card-queue.mjs';
import {deliverRecordedHealing} from './signature-healing-apply.mjs';
const scope='azeroth-rpg',receiptKey='signatureHealingTickDelivery';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const cardsFor=tick=>game.messages.filter(message=>{
 const f=message.flags?.[scope];return f?.kind==='spell'&&f.success===true&&f.cast===tick.cast
  &&f.spellLockCaster===tick.source&&f.spellUuid===tick.castUuid&&f.healingSignatureCaster===tick.source;
});
const actorFor=ref=>{
 const actor=ref.sceneId&&ref.tokenId?resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor:game.actors.get(ref.actorId);
 return actor?.id===ref.actorId?actor:null;
};
export function landSignatureHealingTick(args={}){
 if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id)return Promise.resolve({ok:false,reason:'authority'});
 const {combat,combatant,tick}=args,cards=cardsFor(tick);
 if(cards.length!==1)return Promise.resolve({ok:false,reason:'cast'});
 const stamp={round:combat?.round,turn:combat?.turn,combatant:combatant?.id};
 return queueSignatureCard(cards[0],()=>land(args,stamp,cards[0]));
}
async function land({actor,carrier,tick,combat,combatant,caster,spell},stamp,message){
 const refuse=reason=>({ok:false,reason});
 const turnLive=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id&&combat?.started
  &&game.combats.get(combat.id)===combat&&combat.combatant===combatant&&combatant?.actor===actor
  &&combat.round===stamp.round&&combat.turn===stamp.turn;
 if(!turnLive()||tick.kind!=='heal'||!tick.cast||tick.signatureHealingCast!==tick.cast
  ||caster?.uuid!==tick.source||!carrier?.uuid)return refuse('context');
 const flags=message.flags[scope];
 if(!Array.isArray(flags.chosenHealingBonuses)||!flags.chosenHealingBonuses.length)return refuse('plan');
 const refs=flags.targets?.filter(ref=>actorFor(ref)===actor)??[],keys=new Set(refs.map(signatureRecipientKey));
 // A moved carrier retains its base heal, but not the former recipient's bonus.
 const recipients=new Set(flags.chosenHealingBonuses.filter(row=>keys.has(row.recipient)).map(row=>row.recipient));
 if(recipients.size>1)return refuse('recipient');
 const recipient=[...recipients][0]??null,savedTick=structuredClone(tick),targets=structuredClone(flags.targets);
 const valid=()=>turnLive()&&actorInWorld(actor)&&actor.effects.get(carrier.id)===carrier&&carrier.active!==false
  &&sustainedSpellLive(carrier)&&resolve(message.uuid)===message&&cardsFor(tick).length===1
  &&same(carrier.flags?.[scope]?.tick,savedTick)&&same(message.flags[scope].targets,targets)
  &&refs.every(ref=>actorFor(ref)===actor);
 const event=`heal:${carrier.uuid}:${combat.id}:${stamp.round}:${stamp.turn}:${stamp.combatant}`;
 const prior=carrier.getFlag(scope,receiptKey);
 if(prior?.phase==='pending')return refuse('review');
 if(prior?.event===event)return prior.phase==='complete'?{ok:true,already:true,lines:[]}:refuse('review');
 try{
  if(!valid())return refuse('changed');
  const claim={version:1,event,phase:'pending',writer:game.user.id,cast:tick.cast};
  await carrier.setFlag(scope,receiptKey,claim);
  const held=()=>valid()&&same(carrier.getFlag(scope,receiptKey),claim);
  if(!held())return refuse('claimUncertain');
  const landing=tickLanding(tick);let lines=[];
  const key=encodeURIComponent(event).replaceAll('.','%2E');
  const result=await deliverRecordedHealing({message,caster,target:actor,recipient,amount:landing.amount,key,event,validate:held,
   heal:async(total,outcome)=>{lines=await strikeFromArea({actor,caster,spell,heal:total,healingOutcome:outcome});}});
  if(!result.ok||!held())return refuse('deliveryUncertain');
  const next=tickCountdown(tick);
  if(next?.delete){await carrier.delete();if(actor.effects.get(carrier.id))return refuse('countdownUncertain');}
  else{
   const patch={[`flags.${scope}.${receiptKey}`]:{...claim,phase:'complete'}};
   if(next)patch[`flags.${scope}.tick.rounds`]=next.rounds;
   if(landing.doubled)patch[`flags.${scope}.tick.doubled`]=landing.left;
   await carrier.update(patch);
   if(carrier.getFlag(scope,receiptKey)?.phase!=='complete')return refuse('countdownUncertain');
  }
  return {ok:true,lines};
 }catch{return refuse('writeUncertain');}
}
