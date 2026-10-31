import {hitBonusTargetsWithdrawn} from '../rules/signature-hit-target.mjs';
import {restoreTurnSignatures} from './signature-turn-use.mjs';
export const WITHDRAW_HIT_SIGNATURE_QUERY='azeroth-rpg.withdrawSignatureHit';
const FLAG='signatureHitWithdrawal',busy=new Set();
const gmHere=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const targetOf=row=>row?.sceneId&&row?.tokenId
  ?resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor:game.actors?.get(row?.actorId);

export async function requestSignatureHitWithdrawal(message,index){
  if(!message?.getFlag('azeroth-rpg','signatureHitBonuses'))return {ok:true};
  const gm=game.users?.activeGM,data={messageUuid:message.uuid,index};
  return gm?(gmHere()?signatureHitWithdrawalHandler(data,{user:game.user})
    :gm.query(WITHDRAW_HIT_SIGNATURE_QUERY,data)):{ok:false,reason:'noGM'};
}

export async function signatureHitWithdrawalHandler({messageUuid,index}={}, {user}={}){
  if(!gmHere()||!user||busy.has(messageUuid))return {ok:false,reason:'authority'};
  busy.add(messageUuid);
  try{
    const message=resolve(messageUuid),receipt=message?.getFlag('azeroth-rpg','signatureHitBonuses');
    const actor=resolve(receipt?.actorUuid),flags=message?.flags?.['azeroth-rpg'];
    if(!message||receipt?.version!==1||!receipt.previous||!Array.isArray(receipt.bonuses)
      ||actor?.documentName!=='Actor'||ChatMessage.getSpeakerActor(message.speaker)!==actor
      ||!Number.isInteger(index)||!flags?.damageByTarget?.[index])return {ok:false,reason:'receipt'};
    const target=targetOf(flags.targets?.[index]);
    if(!user.isGM&&!actor.testUserPermission(user,'OWNER')&&!target?.testUserPermission(user,'OWNER'))return {ok:false,reason:'permission'};
    const snapshot=JSON.stringify({receipt,rows:flags.damageByTarget,refunded:flags.refunded});
    if(!hitBonusTargetsWithdrawn(receipt.bonuses,flags.damageByTarget))return {ok:true,reason:'standingHit'};
    const valid=()=>gmHere()&&resolve(messageUuid)===message&&resolve(actor.uuid)===actor
      &&hitBonusTargetsWithdrawn(receipt.bonuses,message.flags['azeroth-rpg'].damageByTarget)
      &&JSON.stringify({receipt:message.getFlag('azeroth-rpg','signatureHitBonuses'),
        rows:message.flags['azeroth-rpg'].damageByTarget,refunded:message.flags['azeroth-rpg'].refunded})===snapshot;
    if(!valid())return {ok:false,reason:'standingHit'};
    const prior=message.getFlag('azeroth-rpg',FLAG);
    if(prior)return {ok:prior.state==='complete',reason:prior.state};
    const claim={state:'pending',event:receipt.event,writer:game.user.id};
    await message.setFlag('azeroth-rpg',FLAG,claim);
    const held=()=>valid()&&same(message.getFlag('azeroth-rpg',FLAG),claim);
    if(!held())return {ok:false,reason:'claimUncertain'};
    const result=await restoreTurnSignatures({actor,event:receipt.event,
      identifiers:receipt.bonuses.map(row=>row.identifier),previous:receipt.previous,validate:held});
    if(!result.ok||!held())return {ok:false,reason:result.reason??'changed'};
    const done={...claim,state:'complete',restored:result.restored};
    await message.setFlag('azeroth-rpg',FLAG,done);
    return {ok:valid()&&same(message.getFlag('azeroth-rpg',FLAG),done),restored:result.restored};
  }catch{return {ok:false,reason:'uncertain'};}
  finally{busy.delete(messageUuid);}
}
