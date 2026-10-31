import {signatureKillRewards} from '../rules/signature-kill-rewards.mjs';
import {countsAsEnemy} from '../rules/distance.mjs';
import {allyStandingOf,combatantIn} from '../canvas/engaged.mjs';
import {deliverTurnSignature,signatureHealingReceipt} from './signature-turn-use.mjs';

export const SIGNATURE_KILL_QUERY='azeroth-rpg.signatureWeaponKill';
export const SIGNATURE_KILL_FLAG='signatureWeaponKill';
const busy=new Set();
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
      if(receipts[reward.identifier])continue;
      const stillValid=()=>valid()&&rewardsFor(attacker,target,message,data).some(row=>same(row,reward));
      if(!stillValid())return {ok:false,results};
      const claim={state:'pending',writer:game.user.id,targetUuid,before,after,reward};
      receipts[reward.identifier]=claim;
      await message.setFlag('azeroth-rpg',SIGNATURE_KILL_FLAG,receipts);
      const held=()=>stillValid()&&same(message.getFlag('azeroth-rpg',SIGNATURE_KILL_FLAG),receipts);
      if(!held())return {ok:false,results};
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
      if(!held())return {ok:false,results};
      if(result.ok||result.reason==='unavailable'){
        receipts={...receipts,[reward.identifier]:{...claim,state:result.ok?'complete':'unavailable',result}};
        await message.setFlag('azeroth-rpg',SIGNATURE_KILL_FLAG,receipts);
        if(!held())return {ok:false,results};
      }
    }
    return {ok:results.every(row=>row.ok||row.reason==='unavailable'),results};
  }catch(error){
    console.warn('azeroth-rpg | Weapon kill signature delivery is uncertain; retained receipts',error);
    return {ok:false,uncertain:true};
  }finally{busy.delete(messageId);}
}
