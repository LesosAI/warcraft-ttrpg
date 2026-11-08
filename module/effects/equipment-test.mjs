/** A pending meal has one GM-authorized Test, including concurrent prepared dialogs. */
import { pendingEquipmentTest } from "../rules/special-equipment.mjs";

export const EQUIPMENT_TEST_QUERY="azeroth-rpg.equipmentTest";
export const EQUIPMENT_TEST_CLAIM="equipmentTestClaim";
const NS="azeroth-rpg",RECEIPTS="equipmentTestReceipts",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM===game.user;
const receiptsOf=actor=>actor.getFlag(NS,RECEIPTS)??{};
const save=async(actor,id,receipt)=>{
  if(!writer())throw Error("Equipment Test writer changed");
  const all={...receiptsOf(actor),[id]:receipt};
  const pending=Object.entries(all).filter(([,r])=>["claimed","consuming"].includes(r.state));
  const completed=Object.entries(all).filter(([,r])=>!["claimed","consuming"].includes(r.state)).slice(-64);
  await actor.setFlag(NS,RECEIPTS,Object.fromEntries([...completed,...pending]));
  if(!writer())throw Error("Equipment Test writer changed after receipt write");
};
const liveClaim=(actor,effect)=>effect&&pendingEquipmentTest([{
  id:effect.id,disabled:effect.disabled,active:effect.active,isSuppressed:effect.isSuppressed,duration:effect.duration,
  flags:{...effect.flags,[NS]:{...effect.flags?.[NS],[EQUIPMENT_TEST_CLAIM]:null}}
}],{kind:"skill",ability:"int",now:game.time?.worldTime}).includes(effect.id);

export async function equipmentTestQueryHandler({actorUuid,requestId,operation="claim",expectedId=null}={}, {user}={}) {
  if(!writer()||!user?.active||game.users.get(user.id)!==user||typeof actorUuid!=="string"
    ||typeof requestId!=="string"||!requestId||requestId.length>64||busy.has(actorUuid))return {ok:false};
  const actor=fromUuidSync(actorUuid);
  if(!actor?.testUserPermission(user,"OWNER"))return {ok:false};
  busy.add(actorUuid);
  try {
    const old=receiptsOf(actor)[requestId];
    if(old&&old.userId!==user.id&&!(operation==="retire"&&user.isGM))return {ok:false};
    if(operation==="claim") {
      if(old){
        const held=actor.effects.get(old.effectId);
        const ok=Boolean(old.state==="claimed"&&old.effectId===expectedId&&liveClaim(actor,held)
          &&held.getFlag(NS,EQUIPMENT_TEST_CLAIM)===requestId);
        return {ok,claim:ok,requestId};
      }
      if(Object.values(receiptsOf(actor)).some(r=>["claimed","consuming"].includes(r.state)))return {ok:false,pending:true};
      const ids=pendingEquipmentTest(actor.effects??[],{kind:"skill",ability:"int",now:game.time?.worldTime});
      if(!ids.includes(expectedId))return {ok:false};
      const effect=actor.effects.get(expectedId);
      if(!effect||effect.getFlag(NS,EQUIPMENT_TEST_CLAIM))return {ok:false};
      await save(actor,requestId,{effectId:expectedId,state:"claimed",userId:user.id});
      if(!writer())throw Error("Equipment Test writer changed before effect claim");
      if(actor.effects.get(expectedId)!==effect||!liveClaim(actor,effect))throw Error("Equipment Test carrier changed before claim");
      await effect.setFlag(NS,EQUIPMENT_TEST_CLAIM,requestId);
      if(!writer())throw Error("Equipment Test writer changed after effect claim");
      const ok=actor.effects.get(expectedId)===effect&&liveClaim(actor,effect)&&effect.getFlag(NS,EQUIPMENT_TEST_CLAIM)===requestId;
      return {ok,claim:ok,requestId,...(!ok?{pending:true}:{})};
    }
    if(!old)return {ok:false};
    const effect=actor.effects.get(old.effectId);
    if(operation==="retire") {
      if(!user.isGM||!["claimed","consuming"].includes(old.state))return {ok:false};
      if(effect)await actor.deleteEmbeddedDocuments("ActiveEffect",[old.effectId]);
      await save(actor,requestId,{...old,state:"retired",reviewedBy:user.id});
      return {ok:true};
    }
    if(operation==="release") {
      if(old.state==="released")return {ok:true};
      if(old.state!=="claimed"||effect?.getFlag(NS,EQUIPMENT_TEST_CLAIM)!==requestId)return {ok:false};
      await effect.setFlag(NS,EQUIPMENT_TEST_CLAIM,null);
      if(!writer())throw Error("Equipment Test writer changed after release");
      await save(actor,requestId,{...old,state:"released"});
      return {ok:true};
    }
    if(operation==="consume") {
      if(old.state==="consumed")return {ok:true};
      if(old.state!=="claimed"||effect?.getFlag(NS,EQUIPMENT_TEST_CLAIM)!==requestId)return {ok:false};
      // Once the die happened, failed deletion/publication leaves a durable
      // unavailable receipt rather than permitting a second benefit.
      await save(actor,requestId,{...old,state:"consuming"});
      await actor.deleteEmbeddedDocuments("ActiveEffect",[old.effectId]);
      await save(actor,requestId,{...old,state:"consumed"});
      return {ok:true};
    }
    return {ok:false};
  } catch{return {ok:false,pending:true};}
  finally{busy.delete(actorUuid);}
}
async function request(actor,data) {
  try {
    const gm=game.users?.activeGM;
    return gm===game.user?await equipmentTestQueryHandler({actorUuid:actor.uuid,...data},{user:game.user})
      :await gm?.query(EQUIPMENT_TEST_QUERY,{actorUuid:actor.uuid,...data},{timeout:15000})??{ok:false};
  } catch{return {ok:false};}
}
export async function claimEquipmentTest(actor,{kind,ability,expectedIds=null,chosen=[]}={}) {
  if(kind!=="skill"||ability!=="int")return {ok:true,claim:false};
  const live=pendingEquipmentTest(actor.effects??[],{kind,ability,now:game.time?.worldTime});
  if(expectedIds!==null&&!expectedIds.length&&live.length)return {ok:false};
  const ids=expectedIds??live;
  if(!ids.length)return {ok:!chosen.includes("equipment:runn-tum-tuber-surprise"),claim:false};
  if(ids.length!==1)return {ok:false};
  return request(actor,{requestId:foundry.utils.randomID(),expectedId:ids[0]});
}
export async function finishEquipmentTest(actor,claim,{rolled=false}={}) {
  if(!claim?.claim)return {ok:true};
  return request(actor,{requestId:claim.requestId,operation:rolled?"consume":"release"});
}
/** Explicit GM recovery retires an uncertain benefit; it never refunds it. */
export async function retireEquipmentTestClaim(actor,requestId) {
  if(!writer())return {ok:false};
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Pending equipment Test"},
    content:"<p>Retire this pending equipment Test and its meal benefit without refund?</p>"});
  if(!confirmed||!writer())return {ok:false};
  return request(actor,{requestId,operation:"retire"});
}
export function registerEquipmentTestQuery(){CONFIG.queries[EQUIPMENT_TEST_QUERY]=equipmentTestQueryHandler;}
