import {signatureKillRewards} from '../rules/signature-kill-rewards.mjs';
import {countsAsEnemy} from '../rules/distance.mjs';
import {allyStandingOf,combatantIn} from '../canvas/engaged.mjs';
import {deliverTurnSignature,signatureHealingReceipt} from './signature-turn-use.mjs';

export const SIGNATURE_KILL_QUERY='azeroth-rpg.signatureWeaponKill';
export const SIGNATURE_KILL_FLAG='signatureWeaponKill';
export const SIGNATURE_KILL_REVIEW_FLAG='signatureWeaponKillReview';
const busy=new Set();
export const killRewardInFlight=messageId=>busy.has(messageId);
const gmHere=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function targetOf(row){
  if(row?.tokenId){
    const token=game.scenes?.get(row.sceneId)?.tokens?.get(row.tokenId);
    return token?.actor?.id===row.actorId?token.actor:null;
  }
  return game.actors?.get(row?.actorId)??null;
}

/** Enemy checks normally exclude fallen creatures. This check answers the
 * relationship immediately before the confirmed Health transition instead. */
function hostileBefore(attacker,target,before){
  const fight=attacker.activeFight?.()??target.activeFight?.()??null;
  const standing=actor=>{
    const token=actor.token??actor.getActiveTokens?.(true)?.[0]??actor.prototypeToken;
    return allyStandingOf({actor,token,fight,combatant:combatantIn(fight,actor,token)});
  };
  return countsAsEnemy(standing(attacker),{...standing(target),health:before,defeated:false},{gm:true});
}

function rewardsFor(attacker,target,message,{before,after}){
  const flags=message.flags?.['azeroth-rpg']??{};
  const outcome=message.rolls?.[0]?.outcome;
  if(flags.kind!=='attack'||flags.parry===true||flags.notAttack===true||outcome?.success!==true)return [];
  const index=(flags.targets??[]).findIndex(row=>targetOf(row)===target);
  if(index<0)return [];
  const damage=flags.damageByTarget?.length?flags.damageByTarget[index]:flags.damage;
  if(damage?.withdrawn===true||!Number.isFinite(damage?.damage)||before-after>damage.damage)return [];
  const weaponId=flags.strike?.weapon?.id;
  const weapon=attacker.items?.get(weaponId);
  if(weapon?.type!=='weapon')return [];
  const ownModifiers=Object.fromEntries(Object.entries(attacker.system.abilities??{})
    .map(([key,value])=>[key,value.own?.mod??value.mod]));
  return signatureKillRewards({signatures:attacker.system.signatureEffects?.weaponKillReward??[],
    ownModifiers,attackerUuid:attacker.uuid,targetUuid:target.uuid,before,after,
    hostile:hostileBefore(attacker,target,before),weaponId,
    rangeKind:flags.strike.rangeKind,successfulWeaponAttack:true,sl:outcome.sl});
}

export async function requestSignatureKillRewards({attacker,target,before,after,messageId}={}){
  if(!messageId||!target?.isOwner||before<=0||after!==0
    ||!attacker?.system?.signatureEffects?.weaponKillReward?.length)return null;
  const data={attackerUuid:attacker.uuid,targetUuid:target.uuid,before,after,messageId};
  const gm=game.users?.activeGM;
  return gm?(gmHere()?signatureKillQueryHandler(data,{user:game.user}):gm.query(SIGNATURE_KILL_QUERY,data)):null;
}

/** The owner who actually wrote the victim's Health reports the transition.
 * Amounts and SL are read locally, never accepted from the query payload.
 * Card receipts survive turn refreshes; uncertain writes are never replayed. */
export async function signatureKillQueryHandler(data={}, {user}={}){
  const {attackerUuid,targetUuid,messageId,before,after}=data;
  if(!gmHere()||!user||!messageId||busy.has(messageId))return {ok:false};
  busy.add(messageId);
  try{
    const attacker=await fromUuid(attackerUuid),target=await fromUuid(targetUuid);
    const message=game.messages?.get(messageId);
    if(message?.getFlag('azeroth-rpg',SIGNATURE_KILL_REVIEW_FLAG))return {ok:false,reason:'reviewed'};
    const valid=()=>gmHere()&&attacker?.documentName==='Actor'&&target?.documentName==='Actor'
      &&fromUuidSync(attackerUuid)===attacker&&fromUuidSync(targetUuid)===target
      &&message&&game.messages?.get(messageId)===message
      &&target.testUserPermission(user,'OWNER')
      &&ChatMessage.getSpeakerActor(message.speaker)===attacker
      &&attacker.system.health.value>0&&target.system.health.value===after
      &&Number.isFinite(target.system.health.max)&&before<=target.system.health.max;
    if(!valid())return {ok:false};
    const rewards=rewardsFor(attacker,target,message,data);
    if(!rewards.length)return {ok:false};
    const results=[];
    for(const reward of rewards){
      let receipts=structuredClone(message.getFlag('azeroth-rpg',SIGNATURE_KILL_FLAG)??{});
      if(Object.hasOwn(receipts,reward.identifier)){
        if(!['complete','unavailable'].includes(receipts[reward.identifier]?.state))
          return {ok:false,reason:'review',results};
        continue;
      }
      const stillValid=()=>valid()&&rewardsFor(attacker,target,message,data).some(row=>same(row,reward));
      if(!stillValid())return {ok:false,results};
      const claim={state:'pending',writer:game.user.id,targetUuid,before,after,reward};
      receipts[reward.identifier]=claim;
      await message.setFlag('azeroth-rpg',SIGNATURE_KILL_FLAG,receipts);
      const held=()=>stillValid()&&same(message.getFlag('azeroth-rpg',SIGNATURE_KILL_FLAG),receipts);
      if(!held())return {ok:false,reason:'review',results};
      const result=await deliverTurnSignature({actor:attacker,identifier:reward.identifier,
        event:`weapon-kill:${messageId}:${targetUuid}:${reward.identifier}`,validate:held,
        execute:async({valid:authorized})=>{
          if(!authorized())return {complete:false};
          if(reward.kind==='healing'){
            const outcome={};
            await attacker.applyHealing(reward.amount,{from:attacker,feature:true,outcome});
            return signatureHealingReceipt(outcome);
          }
          const done=await attacker.grantTemporaryHealth(reward.amount,{source:reward.name,span:'encounter'});
          return typeof done?.landed==='boolean'&&Number.isFinite(done.temp)
            ?{complete:true,committed:done.landed}:{complete:false};
        }});
      results.push({identifier:reward.identifier,...result});
      if(!held())return {ok:false,reason:'review',results};
      if(result.ok||result.reason==='unavailable'){
        receipts={...receipts,[reward.identifier]:{...claim,state:result.ok?'complete':'unavailable',result}};
        await message.setFlag('azeroth-rpg',SIGNATURE_KILL_FLAG,receipts);
        if(!held())return {ok:false,reason:'review',results};
      }
    }
    return {ok:results.every(row=>row.ok||row.reason==='unavailable'),results};
  }catch(error){
    console.warn('azeroth-rpg | Weapon kill signature delivery is uncertain; retained receipts',error);
    return {ok:false,reason:'review',uncertain:true};
  }finally{busy.delete(messageId);}
}

/** Snapshot pending card claims, including claims which never reached the
 * actor allowance writer. Deleted targets and unequipped sources are valid
 * recovery cases; the original attacker and card must still be identifiable. */
export function killCardReviewState(actor){
 if(!gmHere()||fromUuidSync(actor?.uuid)!==actor)return null;
 const cards=[...(game.messages?.values?.()??[])].filter(message=>
  ChatMessage.getSpeakerActor(message.speaker)===actor
  &&!message.getFlag('azeroth-rpg',SIGNATURE_KILL_REVIEW_FLAG)).flatMap(message=>{
   const receipts=message.getFlag('azeroth-rpg',SIGNATURE_KILL_FLAG);
   if(!receipts||!['death-grips','spinal-reaper'].some(id=>receipts[id]?.state==='pending'))return [];
   return [{messageId:message.id,receipts:structuredClone(receipts)}];
  }).sort((a,b)=>a.messageId.localeCompare(b.messageId));
 const state={cards,records:structuredClone(actor.getFlag('azeroth-rpg','signatureTurnUses')??{}),health:structuredClone(actor.system.health)};
 return {...state,expected:JSON.stringify(state)};
}

/** Explicit GM closure only: never replays a benefit or manufactures a
 * successful delivery receipt. The whole old card becomes non-replayable. */
export async function reviewKillCards(actor,{expected,acknowledged=false}={}){
 const state=killCardReviewState(actor);
 if(!state||!acknowledged)return {ok:false,reason:'authority'};
 if(!state.cards.length||state.expected!==expected)return {ok:false,reason:'changed'};
 if(state.cards.some(card=>busy.has(card.messageId)))return {ok:false,reason:'busy'};
 for(const card of state.cards)for(const id of ['death-grips','spinal-reaper']){
  const receipt=card.receipts[id];if(receipt?.state!=='pending')continue;
  if(receipt.writer!==game.user.id&&game.users.get(receipt.writer)?.active)return {ok:false,reason:'writerActive'};
  if(state.records[id]?.pending?.event===`weapon-kill:${card.messageId}:${receipt.targetUuid}:${id}`)
   return {ok:false,reason:'allowancePending'};
 }
 for(const card of state.cards)busy.add(card.messageId);
 try{
  let currentExpected=state.expected;
  for(const card of state.cards){
   if(killCardReviewState(actor)?.expected!==currentExpected)return {ok:false,reason:'changed'};
   const message=game.messages.get(card.messageId);
   const mark={by:game.user.id,at:Date.now(),receipts:structuredClone(card.receipts)};
   await message.setFlag('azeroth-rpg',SIGNATURE_KILL_REVIEW_FLAG,mark);
   if(!gmHere()||fromUuidSync(actor.uuid)!==actor||game.messages.get(card.messageId)!==message
    ||!same(message.getFlag('azeroth-rpg',SIGNATURE_KILL_REVIEW_FLAG),mark)
    ||!same(message.getFlag('azeroth-rpg',SIGNATURE_KILL_FLAG),card.receipts))return {ok:false,reason:'uncertain'};
   state.cards=state.cards.filter(row=>row.messageId!==card.messageId);
   currentExpected=JSON.stringify({cards:state.cards,records:state.records,health:state.health});
   if(killCardReviewState(actor)?.expected!==currentExpected)return {ok:false,reason:'changed'};
  }
  return {ok:true};
 }catch{return {ok:false,reason:'uncertain'};}
 finally{for(const card of JSON.parse(expected).cards)busy.delete(card.messageId);}
}
