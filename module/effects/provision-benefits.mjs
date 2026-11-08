/** GM-authorized ordinary drink carriers and independent, durable next-Test claims. */
import {PROVISION_BENEFIT,DRINK_BENEFITS,drinkBenefitOf,liveDrinkBenefits,drinkTestBenefits} from "../rules/provision-benefits.mjs";
export const PROVISION_TEST_QUERY="azeroth-rpg.provisionTest";
export function drinkBenefitReady(entry,actor,now=game.time?.worldTime??0){const last=actor?.getFlag("azeroth-rpg","provisionBenefitLedger")?.daily?.[entry?.key];return !entry?.daily||!Number.isFinite(last)||now-last>=86400;}
const NS="azeroth-rpg",RECEIPTS="provisionTestReceipts",CLAIM="provisionTestClaim",busy=new Set();
const grantBusy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM===game.user;
const requireWriter=()=>{if(!writer())throw Error("Provision writer changed");};
const receipts=actor=>actor.getFlag(NS,RECEIPTS)??{};
async function save(actor,id,value){requireWriter();const all={...receipts(actor),[id]:value};
  const pending=Object.entries(all).filter(([,r])=>["claimed","consuming"].includes(r.state));
  const done=Object.entries(all).filter(([,r])=>!["claimed","consuming"].includes(r.state)).slice(-64);
  const next=Object.fromEntries([...done,...pending]);await actor.setFlag(NS,RECEIPTS,next);requireWriter();
  if(JSON.stringify(receipts(actor))!==JSON.stringify(next))throw Error("Provision receipt write was not confirmed");}
/** Called only after the enclosing rest receipt has confirmed payment. No new portion is spent. */
export async function grantPaidDrinkBenefit(actor,entry,portionId){
  if(!entry||!DRINK_BENEFITS[entry.key]||typeof portionId!=="string")return;
  requireWriter();if(grantBusy.has(actor.uuid))throw Error("Drink grant already pending");grantBusy.add(actor.uuid);
  try{
  const now=game.time?.worldTime??0,ledger=actor.getFlag(NS,"provisionBenefitLedger")??{daily:{},portions:{}};
  const old=ledger.portions?.[portionId];if(old?.state==="complete")return {already:true};if(old)throw Error("Drink grant needs GM review");
  if(Object.values(ledger.portions??{}).some(p=>p.state==="pending"))throw Error("Previous drink grant needs GM review");
  const ready=drinkBenefitReady(entry,actor,now),next={daily:{...(ledger.daily??{})},portions:{...(ledger.portions??{}),[portionId]:{state:"pending",key:entry.key,at:now}}};
  if(ready&&entry.daily)next.daily[entry.key]=now;
  await actor.setFlag(NS,"provisionBenefitLedger",next);requireWriter();
  if(JSON.stringify(actor.getFlag(NS,"provisionBenefitLedger"))!==JSON.stringify(next))throw Error("Drink ledger write unconfirmed");
  const complete=async()=>{const portions=Object.fromEntries(Object.entries({...next.portions,[portionId]:{...next.portions[portionId],state:"complete"}}).slice(-128));
    const done={...next,portions};await actor.setFlag(NS,"provisionBenefitLedger",done);requireWriter();if(JSON.stringify(actor.getFlag(NS,"provisionBenefitLedger"))!==JSON.stringify(done))throw Error("Drink ledger completion unconfirmed");};
  if(!ready){await complete();return {cooldown:true};}
  const prior=liveDrinkBenefits(actor.effects,{includeClaimed:true}).find(e=>e.getFlag(NS,PROVISION_BENEFIT)?.portionId===portionId);
  if(prior){await complete();return {already:true};}
  const same=liveDrinkBenefits(actor.effects,{includeClaimed:true}).filter(e=>e.getFlag(NS,PROVISION_BENEFIT).key===entry.key);
  if(same.some(e=>e.getFlag(NS,CLAIM)||Object.values(receipts(actor)).some(r=>["claimed","consuming"].includes(r.state)&&r.ids.includes(e.id))))throw Error("Drink Test is pending; inspect receipt before replacing its benefit");
  if(same.length)await actor.deleteEmbeddedDocuments("ActiveEffect",same.map(e=>e.id));requireWriter();
  if(same.some(e=>actor.effects.get(e.id)))throw Error("Previous drink carrier deletion was not confirmed");
  const created=await actor.createEmbeddedDocuments("ActiveEffect",[{name:entry.name,img:entry.img??actor.img,system:{changes:[]},
    flags:{[NS]:{[PROVISION_BENEFIT]:{key:entry.key,portionId}}}}]);requireWriter();
  if(created.length!==1||actor.effects.get(created[0].id)?.getFlag(NS,PROVISION_BENEFIT)?.portionId!==portionId)
    throw Error("Drink carrier write was not confirmed");
  await complete();return {ok:true};
  }finally{grantBusy.delete(actor.uuid);}
}
export {drinkBenefitOf};
export async function provisionTestQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user||typeof data.actorUuid!=="string"
    ||typeof data.requestId!=="string"||!data.requestId||data.requestId.length>64||busy.has(data.actorUuid))return {ok:false};
  const actor=fromUuidSync(data.actorUuid);
  if(!actor?.testUserPermission(user,"OWNER"))return {ok:false};
  busy.add(actor.uuid);
  try{
    const old=receipts(actor)[data.requestId];
    if(old&&old.userId!==user.id&&!(data.operation==="retire"&&user.isGM))return {ok:false};
    if(data.operation==="claim"){
      if(old)return {ok:false};
      const eligible=drinkTestBenefits(actor.effects,data.context),actual=eligible.map(e=>e.id).sort();
      if(JSON.stringify(actual)!==JSON.stringify([...(data.expectedIds??[])].sort()))return {ok:false};
      const selected=drinkTestBenefits(actor.effects,{...data.context,chosen:data.chosen??[]});
      if(selected.some(e=>e.getFlag(NS,CLAIM)||Object.values(receipts(actor)).some(r=>["claimed","consuming"].includes(r.state)&&r.ids.includes(e.id))))return {ok:false};
      if(!selected.length)return {ok:true,claim:false};
      const ids=selected.map(e=>e.id);
      await save(actor,data.requestId,{state:"claimed",userId:user.id,ids});
      for(const effect of selected){
        requireWriter();if(actor.effects.get(effect.id)!==effect||!liveDrinkBenefits([effect],{includeClaimed:true}).length)throw Error("Drink carrier changed");
        await effect.setFlag(NS,CLAIM,data.requestId);
        requireWriter();if(actor.effects.get(effect.id)!==effect||!liveDrinkBenefits([effect],{includeClaimed:true}).length||effect.getFlag(NS,CLAIM)!==data.requestId)throw Error("Drink carrier changed after claim");
      }
      requireWriter();
      if(selected.some(effect=>actor.effects.get(effect.id)!==effect||!liveDrinkBenefits([effect],{includeClaimed:true}).length||effect.getFlag(NS,CLAIM)!==data.requestId))throw Error("Drink carriers changed during reservation");
      return {ok:true,claim:true,requestId:data.requestId};
    }
    if(!old)return {ok:false};
    if(data.operation==="retire"){
      if(!user.isGM||!["claimed","consuming"].includes(old.state))return {ok:false};
      await actor.deleteEmbeddedDocuments("ActiveEffect",old.ids.filter(id=>actor.effects.has(id)));requireWriter();
      if(old.ids.some(id=>actor.effects.get(id)))throw Error("Drink retirement deletion was not confirmed");
      await save(actor,data.requestId,{...old,state:"retired",reviewedBy:user.id});return {ok:true};
    }
    if(data.operation==="consume"&&old.state==="consumed"||data.operation==="release"&&old.state==="released")return {ok:true};
    if(old.state!=="claimed"||old.ids.some(id=>actor.effects.get(id)?.getFlag(NS,CLAIM)!==data.requestId))return {ok:false};
    if(data.operation==="consume"){
      const held=old.ids.map(id=>actor.effects.get(id));
      await save(actor,data.requestId,{...old,state:"consuming"});
      if(held.some(e=>actor.effects.get(e.id)!==e||e.getFlag(NS,CLAIM)!==data.requestId))throw Error("Drink carrier changed before consumption");
      await actor.deleteEmbeddedDocuments("ActiveEffect",old.ids);requireWriter();
      if(old.ids.some(id=>actor.effects.get(id)))throw Error("Drink consumption deletion was not confirmed");
      await save(actor,data.requestId,{...old,state:"consumed"});return {ok:true};
    }
    if(data.operation==="release"){
      const held=old.ids.map(id=>actor.effects.get(id));
      for(const effect of held){requireWriter();if(actor.effects.get(effect.id)!==effect)throw Error("Drink carrier changed before release");
        await effect.setFlag(NS,CLAIM,null);requireWriter();
        if(actor.effects.get(effect.id)!==effect||effect.getFlag(NS,CLAIM)!==null)throw Error("Drink release was not confirmed");}
      if(held.some(effect=>actor.effects.get(effect.id)!==effect||effect.getFlag(NS,CLAIM)!==null))throw Error("Drink carriers changed during release");
      await save(actor,data.requestId,{...old,state:"released"});return {ok:true};
    }
    return {ok:false};
  }catch(error){console.warn("azeroth-rpg | Provision Test receipt requires GM review",error);return {ok:false,pending:true};}
  finally{busy.delete(actor.uuid);}
}
async function request(actor,data){try{const gm=game.users?.activeGM;return gm===game.user
  ?await provisionTestQueryHandler({actorUuid:actor.uuid,...data},{user:game.user})
  :await gm?.query(PROVISION_TEST_QUERY,{actorUuid:actor.uuid,...data},{timeout:15000})??{ok:false};}catch{return {ok:false};}}
export async function claimProvisionTest(actor,{kind,resilience,expectedIds=null,chosen=[]}={}){
  const actual=drinkTestBenefits(actor.effects,{kind,resilience}).map(e=>e.id??e._id);
  const ids=expectedIds??actual;
  if(!ids.length&&!actual.length)return {ok:!chosen.some(id=>id.startsWith("provision:")),claim:false};
  // An unchecked stay-awake judgement (or the alternative Kreeg benefit) needs no GM write.
  if(!drinkTestBenefits(actor.effects,{kind,resilience,chosen}).length && !chosen.some(id=>id.startsWith("provision:"))
    && JSON.stringify([...ids].sort())===JSON.stringify([...actual].sort()))return {ok:true,claim:false};
  return request(actor,{operation:"claim",requestId:foundry.utils.randomID(),context:{kind,resilience},expectedIds:ids,chosen});
}
export async function finishProvisionTest(actor,claim,{rolled=false}={}){
  if(!claim?.claim)return {ok:true};
  return request(actor,{requestId:claim.requestId,operation:rolled?"consume":"release"});
}
export function registerProvisionBenefits(){
  CONFIG.queries[PROVISION_TEST_QUERY]=provisionTestQueryHandler;
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.ProvisionBenefit.Review",icon:"fa-solid fa-mug-hot",
    visible:li=>{const actor=game.actors.get(li.dataset.entryId)??{getFlag:()=>null};return writer()&&(Object.values(receipts(actor)).some(r=>["claimed","consuming"].includes(r.state))||Object.values(actor.getFlag(NS,"provisionBenefitLedger")?.portions??{}).some(p=>p.state==="pending"));},
    onClick:async(_event,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor)return;
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("AZEROTH.ProvisionBenefit.Review")},
        content:`<p>${game.i18n.localize("AZEROTH.ProvisionBenefit.ReviewInstructions")}</p>`});
      if(!yes||!writer()||busy.has(actor.uuid)||grantBusy.has(actor.uuid))return;
      for(const [requestId,receipt] of Object.entries(receipts(actor)))if(["claimed","consuming"].includes(receipt.state))
        await request(actor,{requestId,operation:"retire"});
      const ledger=actor.getFlag(NS,"provisionBenefitLedger");
      if(writer()&&ledger&&!grantBusy.has(actor.uuid)&&!busy.has(actor.uuid)){const next={...ledger,portions:Object.fromEntries(Object.entries(ledger.portions??{}).map(([id,p])=>[id,p.state==="pending"?{...p,state:"complete",reviewed:true}:p]))};await actor.setFlag(NS,"provisionBenefitLedger",next);}
    }}));
}
