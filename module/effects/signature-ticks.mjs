import {signatureRecipientKey} from '../rules/signature-scaling.mjs';
import {signatureDamageOutcome} from '../rules/signature-delivery.mjs';
import {tickLanding,tickCountdown} from '../rules/ticks.mjs';
import {deliverChosenSignature} from './signature-delivery.mjs';
import {strikeFromArea} from './area-strikes.mjs';
import {actorInWorld} from '../canvas/in-world.mjs';
import {sustainedSpellLive} from './sustained-spells.mjs';
import {queueSignatureCard} from './signature-card-queue.mjs';

const scope='azeroth-rpg',receiptKey='signatureTickDelivery',busy=new Set();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const targetActor=ref=>ref.sceneId&&ref.tokenId ? resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`)?.actor
 : !ref.sceneId&&!ref.tokenId ? game.actors.get(ref.actorId) : null;
const cardsFor=tick=>game.messages.filter(message=>{
 const f=message.flags?.[scope];return f?.kind==='spell'&&f.success===true&&f.cast===tick?.cast
  &&f.spellLockCaster===tick?.source&&f.spellUuid===tick?.castUuid;
});

export function landSignatureTick(args={}) {
 if(game.user?.isGM!==true||game.users?.activeGM?.id!==game.user.id)return Promise.resolve({ok:false,reason:'context'});
 const {combat,combatant,tick}=args;
 const stamp={combat:combat?.id,round:combat?.round,turn:combat?.turn,combatant:combatant?.id};
 const cards=cardsFor(tick);
 if(cards.length!==1)return Promise.resolve({ok:false,reason:'cast'});
 // Capture the scheduled turn before waiting. A delayed operation must not
 // borrow the identity of a later turn when it finally reaches the queue head.
 return queueSignatureCard(cards[0],()=>landTick(args,stamp,cards[0]));
}

/** Called from the active combatant's tick lifecycle, never a remote payload.
 * The carrier claim covers damage and countdown together. A failed write keeps
 * that claim pending; no later turn may silently repeat uncertain damage.
 */
async function landTick({actor,carrier,tick,combat,combatant,caster,spell},stamp,expectedMessage) {
 const refuse=reason=>({ok:false,reason});
 const turnLive=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id
  &&combat?.started&&game.combats.get(combat.id)===combat&&combat.combatant===combatant&&combatant?.actor===actor
  &&combat.round===stamp.round&&combat.turn===stamp.turn;
 if(!turnLive()||!carrier?.uuid||typeof tick?.signatureCast!=='string'||!tick.signatureCast
  ||tick.signatureCast!==tick.cast||tick.kind!=='damage'||!tick.type)return refuse('context');
 if(busy.has(carrier.uuid))return refuse('busy');
 busy.add(carrier.uuid);
 try{
  const cards=cardsFor(tick);
  if(cards.length!==1||cards[0]!==expectedMessage)return refuse('cast');
  const message=cards[0],flags=message.flags[scope],state=flags.chosenSignatureDelivery;
  if(state?.version!==1||state.cast!==tick.cast||!Array.isArray(state.entries)
    ||!Array.isArray(flags.chosenSignatureBonuses)||!flags.chosenSignatureBonuses.length
    ||!same(state.entries.map(e=>e.bonus),flags.chosenSignatureBonuses))return refuse('plan');
  const references=flags.targets?.filter(ref=>targetActor(ref)===actor&&ref.actorId===actor.id)??[];
  // A moved carrier (for example Soul Swap) keeps its ordinary tick. Moving
  // the effect does not move the casting's explicitly selected bonus recipient.
  const keys=new Set(references.map(signatureRecipientKey));
  const entries=state.entries.filter(e=>keys.has(e.bonus.recipient));
  const recipients=new Set(entries.map(e=>e.bonus.recipient));
  if(recipients.size>1||entries.some(e=>e.pending||typeof e.used!=='boolean'))return refuse('pending');
  const recipient=entries[0]?.bonus.recipient;
  const plan=structuredClone(flags.chosenSignatureBonuses),savedTick=structuredClone(tick),targets=structuredClone(flags.targets);
  const valid=()=>turnLive()&&actorInWorld(actor)&&actor.effects.get(carrier.id)===carrier&&carrier.active!==false
   &&sustainedSpellLive(carrier)&&resolve(message.uuid)===message
   &&same(carrier.flags?.[scope]?.tick,savedTick)&&same(message.flags?.[scope]?.chosenSignatureBonuses,plan)
   &&message.flags?.[scope]?.cast===tick.cast&&message.flags[scope].spellLockCaster===tick.source
   &&message.flags[scope].spellUuid===tick.castUuid&&same(message.flags[scope].targets,targets)
   &&references.every(ref=>targetActor(ref)===actor);
  const event=`tick:${carrier.uuid}:${stamp.combat}:${stamp.round}:${stamp.turn}:${stamp.combatant}`;
  const previous=carrier.getFlag(scope,receiptKey);
  if(previous?.phase==='pending')return refuse('review');
  if(previous?.event===event)return previous.phase==='complete'?{ok:true,already:true,lines:[]}:refuse('review');
  if(!valid())return refuse('changed');
  const claimed={version:1,event,phase:'pending',writer:game.user.id,cast:tick.cast};
  await carrier.setFlag(scope,receiptKey,claimed);
  const claimedLive=()=>valid()&&same(carrier.getFlag(scope,receiptKey),claimed);
  if(!claimedLive())return refuse('claimUncertain');
  const landing=tickLanding(tick);let lines=[];
  const execute=async({bonuses=[],valid:allowed=claimedLive}={})=>{
   if(!allowed()||!claimedLive())return refuse('changed');
   const damageOutcome={};
   lines=await strikeFromArea({actor,caster,spell,damage:{rating:landing.amount,school:tick.type},
    signatureExtras:bonuses.map(b=>({type:b.school,amount:b.amount})),damageOutcome});
   return {ok:signatureDamageOutcome(damageOutcome)!==null,damageOutcome};
  };
  const unspent=entries.some(e=>e.used!==true);
  const result=unspent ? await deliverChosenSignature({message,cast:tick.cast,recipient,event,validate:claimedLive,execute}) : await execute();
  if(!result?.ok||!claimedLive())return refuse('deliveryUncertain');
  const next=tickCountdown(tick);
  if(next?.delete){await carrier.delete();if(actor.effects.get(carrier.id))return refuse('countdownUncertain');}
  else{
   const patch={[`flags.${scope}.${receiptKey}`]:{...claimed,phase:'complete'}};
   if(next)patch[`flags.${scope}.tick.rounds`]=next.rounds;
   if(landing.doubled)patch[`flags.${scope}.tick.doubled`]=landing.left;
   await carrier.update(patch);
   if(carrier.getFlag(scope,receiptKey)?.phase!=='complete')return refuse('countdownUncertain');
  }
  return {ok:true,lines};
 }catch(error){console.warn('azeroth-rpg | signature tick write unconfirmed',error);return refuse('writeUncertain');}
 finally{busy.delete(carrier.uuid);}
}
