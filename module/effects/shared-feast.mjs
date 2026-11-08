/** One paid Feast, up to six independently chosen rests in an explicit GM shared-rest session. */
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
const NS="azeroth-rpg",SESSION="sharedFeastSession",CLAIM="sharedFeastClaim",QUERY="azeroth-rpg.sharedFeast",busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),t=k=>game.i18n.localize(`AZEROTH.SharedFeast.${k}`);
export const restGeneration=actor=>actor.getFlag(NS,"restGeneration")??0;
const feast=item=>item?.type==="gear"&&item.system?.identifier==="feast-for-six"&&item.system.source?.document==="08-EQUIPMENT"&&item.system.provision==="hotMeal";
async function request(data){try{return writer()?await sharedFeastQueryHandler(data,{user:game.user}):await game.users?.activeGM?.query(QUERY,data,{timeout:180000})??{ok:false};}catch{return {ok:false};}}
export async function sharedFeastOptions(actor){const result=await request({operation:"list",actorUuid:actor.uuid});return result.ok?result.options:[];}
export async function prepareSharedFeast(actor,reference){return request({operation:"claim",actorUuid:actor.uuid,reference,requestId:foundry.utils.randomID(32)});}
export async function finishSharedFeast(actor,claim){if(!claim)return;const result=await request({operation:"finish",actorUuid:actor.uuid,reference:claim.reference,requestId:claim.requestId});if(!result.ok)throw Error("Shared Feast rest needs GM review");}
export function pendingSharedFeast(actor){return actor.getFlag(NS,CLAIM)?.state==="claimed";}
export async function sharedFeastQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  const actor=fromUuidSync(data.actorUuid);if(!actor?.testUserPermission(user,"OWNER"))return {ok:false};
  if(data.operation==="retireOrphan"){
    const c=actor.getFlag(NS,CLAIM),owner=fromUuidSync(c?.reference?.payerUuid),s=owner?.getFlag(NS,SESSION);
    if(!user.isGM||busy.has(actor.uuid)||c?.state!=="claimed"||s?.id===c.reference.sessionId&&s.stage!=="closed")return {ok:false};
    await actor.setFlag(NS,CLAIM,{...c,state:"retired"});return {ok:writer()&&actor.getFlag(NS,CLAIM)?.state==="retired"};
  }
  if(data.operation==="list")return {ok:true,options:[...game.actors].flatMap(payer=>{const s=payer.getFlag(NS,SESSION),p=s?.participants?.[actor.uuid];
    return s?.stage==="open"&&p?.state==="available"&&p.generation===restGeneration(actor)?[{value:`feast:${payer.uuid}:${s.id}`,label:`${s.name} (${payer.name})`,tag:t("SharedTag")}]:[];})};
  const payer=data.operation==="create"?actor:fromUuidSync(data.reference?.payerUuid),old=payer?.getFlag(NS,SESSION);
  if(!payer||busy.has(payer.uuid)||busy.has(actor.uuid))return {ok:false};
  if(data.operation==="create"&&!user.isGM)return {ok:false};
  if(data.operation!=="create"&&(!old||old.id!==data.reference?.sessionId))return {ok:false};
  busy.add(payer.uuid);busy.add(actor.uuid);let expected=old;
  const valid=()=>writer()&&user.active&&game.users.get(user.id)===user&&fromUuidSync(actor.uuid)===actor&&fromUuidSync(payer.uuid)===payer&&actor.testUserPermission(user,"OWNER");
  const save=async next=>{if(!valid()||!same(payer.getFlag(NS,SESSION),expected))throw Error("Shared Feast session changed");await payer.setFlag(NS,SESSION,next);
    if(!valid()||!same(payer.getFlag(NS,SESSION),next))throw Error("Shared Feast session write unconfirmed");expected=next;};
  try{
    if(data.operation==="create"){
      const item=payer.items.get(data.itemId),quantity=item?.system.quantity;
      const ids=data.participants??[];
      if(old&&!["closed"].includes(old.stage)||!feast(item)||item.parent!==payer||!guardPendingCustodyItem(item).ok||!Number.isInteger(quantity)||quantity<1
        ||!Array.isArray(ids)||!ids.length||ids.length>6||new Set(ids).size!==ids.length)return {ok:false};
      const people=ids.map(id=>fromUuidSync(id));if(people.some(a=>!a||a.type!=="character"||!game.actors.has(a.id)||pendingSharedFeast(a)))return {ok:false};
      const id=foundry.utils.randomID(32),identity=JSON.stringify(item.system.source);
      await save({id,stage:"claimed",name:item.name,img:item.img,itemUuid:item.uuid,itemId:item.id,quantity,
        participants:Object.fromEntries(people.map(a=>[a.uuid,{state:"available",generation:restGeneration(a)}]))});
      if(payer.items.get(item.id)!==item||!feast(item)||item.system.quantity!==quantity||JSON.stringify(item.system.source)!==identity||!guardPendingCustodyItem(item).ok)throw Error("Feast changed before portion payment");
      if(quantity===1)await item.delete();else await item.update({"system.quantity":quantity-1});
      const remaining=payer.items.get(item.id);if(!valid()||(quantity===1?Boolean(remaining):remaining!==item||remaining.system.quantity!==quantity-1))throw Error("Feast item payment unconfirmed");
      await save({...expected,stage:"open"});return {ok:true};
    }
    if(data.operation==="close"){
      if(!user.isGM)return {ok:false};
      // Close first: an interruption never returns a paid portion or makes a claim available again.
      await save({...old,stage:"closing"});
      for(const uuid of Object.keys(old.participants)){const person=fromUuidSync(uuid),c=person?.getFlag(NS,CLAIM);
        if(c?.reference?.sessionId===old.id&&c.state==="claimed"){await person.setFlag(NS,CLAIM,{...c,state:"retired"});if(person.getFlag(NS,CLAIM)?.state!=="retired")throw Error("Feast participant retirement unconfirmed");}}
      await save({...expected,stage:"closed"});return {ok:true};
    }
    const participant=old.participants[actor.uuid];if(!participant)return {ok:false};
    if(data.operation==="claim"){
      if(old.stage!=="open"||participant.state!=="available"||participant.generation!==restGeneration(actor)||pendingSharedFeast(actor)
        ||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??""))return {ok:false};
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:t("Confirm")},content:`<p>${foundry.utils.escapeHTML(actor.name)} — ${t("SameRest")}</p>`});
      if(!yes||!valid()||!same(payer.getFlag(NS,SESSION),old)||participant.generation!==restGeneration(actor)||pendingSharedFeast(actor))return {ok:false};
      const claim={state:"claimed",requestId:data.requestId,reference:data.reference,generation:participant.generation};
      await save({...old,participants:{...old.participants,[actor.uuid]:{...participant,...claim}}});
      await actor.setFlag(NS,CLAIM,claim);if(!valid()||!same(actor.getFlag(NS,CLAIM),claim))throw Error("Feast participant claim unconfirmed");
      return {ok:true,...claim,name:old.name};
    }
    if(data.operation==="finish"){
      if(participant.requestId!==data.requestId)return {ok:false};
      const claim=actor.getFlag(NS,CLAIM);
      if(participant.state==="complete"){
        if(claim?.requestId!==data.requestId||!same(claim.reference,data.reference))return {ok:false};
        if(claim.state==="claimed"){await actor.setFlag(NS,CLAIM,{...claim,state:"complete"});if(!valid()||actor.getFlag(NS,CLAIM)?.state!=="complete")throw Error("Feast completion retry unconfirmed");}
        if(actor.getFlag(NS,CLAIM)?.state!=="complete")return {ok:false};
        if(Object.entries(old.participants).every(([uuid,p])=>p.state==="complete"&&fromUuidSync(uuid)?.getFlag(NS,CLAIM)?.state==="complete"))await save({...old,stage:"closed"});
        return {ok:true,already:true};
      }
      if(old.stage!=="open"||participant.state!=="claimed"||claim?.requestId!==data.requestId||claim.state!=="claimed"||restGeneration(actor)!==participant.generation+1)return {ok:false};
      await save({...old,participants:{...old.participants,[actor.uuid]:{...participant,state:"complete"}}});
      await actor.setFlag(NS,CLAIM,{...claim,state:"complete"});if(!valid()||actor.getFlag(NS,CLAIM)?.state!=="complete")throw Error("Feast rest completion unconfirmed");
      if(Object.entries(expected.participants).every(([uuid,p])=>p.state==="complete"&&fromUuidSync(uuid)?.getFlag(NS,CLAIM)?.state==="complete"))await save({...expected,stage:"closed"});
      return {ok:true};
    }
    return {ok:false};
  }catch(error){console.warn("azeroth-rpg | Shared Feast requires GM reconciliation",error);return {ok:false,pending:true};}
  finally{busy.delete(payer.uuid);busy.delete(actor.uuid);}
}
export function registerSharedFeasts(){
  CONFIG.queries[QUERY]=sharedFeastQueryHandler;
  Hooks.on("getActorContextOptions",(_app,options)=>{
    options.push({label:"AZEROTH.SharedFeast.RetireOrphan",icon:"fa-solid fa-clipboard-check",visible:li=>{const a=game.actors.get(li.dataset.entryId),c=a?.getFlag(NS,CLAIM),s=fromUuidSync(c?.reference?.payerUuid)?.getFlag(NS,SESSION);return writer()&&c?.state==="claimed"&&(!s||s.id!==c.reference.sessionId||s.stage==="closed");},
      onClick:async(_e,li)=>{const actor=game.actors.get(li.dataset.entryId);if(writer()&&actor&&await foundry.applications.api.DialogV2.confirm({window:{title:t("RetireOrphan")},content:`<p>${t("CloseInstruction")}</p>`}))await request({operation:"retireOrphan",actorUuid:actor.uuid});}});
    options.push({label:"AZEROTH.SharedFeast.Manage",icon:"fa-solid fa-utensils",visible:li=>writer()&&Boolean(game.actors.get(li.dataset.entryId)),
    onClick:async(_e,li)=>{const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;const old=actor.getFlag(NS,SESSION),html=foundry.utils.escapeHTML;
      if(old&&old.stage!=="closed"){
        const lines=Object.entries(old.participants).map(([uuid,p])=>`${html(fromUuidSync(uuid)?.name??uuid)}: ${html(p.state)}`).join("<br>");
        const yes=await foundry.applications.api.DialogV2.confirm({window:{title:t("Manage")},content:`<p>${lines}</p><p>${t("CloseInstruction")}</p>`});
        if(yes)await request({operation:"close",actorUuid:actor.uuid,reference:{payerUuid:actor.uuid,sessionId:old.id}});return;
      }
      const items=[...actor.items].filter(i=>feast(i)&&i.system.quantity>0&&guardPendingCustodyItem(i).ok),people=[...game.actors].filter(a=>a.type==="character");if(!items.length)return;
      const selected=await foundry.applications.api.DialogV2.prompt({window:{title:t("Manage")},content:`<p>${t("CreateInstruction")}</p><select name="item">${items.map(i=>`<option value="${html(i.id)}">${html(i.name)}</option>`).join("")}</select>${people.map(a=>`<label><input type="checkbox" name="participants" value="${html(a.uuid)}">${html(a.name)}</label>`).join("")}`,
        ok:{label:t("Create"),callback:(_e,b)=>({itemId:b.form.elements.item.value,participants:[...b.form.querySelectorAll('input[name="participants"]:checked')].map(e=>e.value)})},rejectClose:false});
      if(selected){const result=await request({operation:"create",actorUuid:actor.uuid,...selected});if(!result.ok)ui.notifications?.warn(t("Refused"));}
    }});});
}
