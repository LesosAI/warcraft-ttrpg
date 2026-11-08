import {ENGULFMENT_FLAG,engulfmentSnapshot,cloakProtectsEngulfment} from "../rules/onyxia-engulfment.mjs";
import {dispersionFor} from "../rules/dispersion.mjs";
const NS="azeroth-rpg",SETTING="shadowFlameSources",RECEIPTS="shadowFlameApplications",verified=new Map(),busy=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const registry=()=>game.settings.get(NS,SETTING)??{};
const words=key=>game.i18n.localize(`AZEROTH.Engulfment.${key}`);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,"0")).join("");
const sourceRaw=source=>source?.documentName==="ActiveEffect"?source.toObject():null;
const settingQueues=new Map();
async function updateMap(key,change){
  const previous=settingQueues.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    if(!writer())throw Error("Engulfment setting writer changed");
    const value=change(game.settings.get(NS,key)??{});
    await game.settings.set(NS,key,value);
    if(!writer())throw Error("Engulfment setting writer changed after write");
  });
  settingQueues.set(key,next);
  try{return await next;}finally{if(settingQueues.get(key)===next)settingQueues.delete(key);}
}
async function approvedSource(source){
  const raw=sourceRaw(source),mark=raw?.flags?.[NS]?.[ENGULFMENT_FLAG];
  const root=mark&&resolve(mark.sourceUuid),record=mark&&registry()[mark.sourceUuid];
  if(!root||!record||mark.version!==1||mark.nonce!==record.nonce)return null;
  const snapshot=engulfmentSnapshot(raw),original=engulfmentSnapshot(root.toObject());
  if(snapshot!==original||await hash(original)!==record.fingerprint)return null;
  if(registry()[mark.sourceUuid]?.nonce!==mark.nonce||engulfmentSnapshot(root.toObject())!==original)return null;
  verified.set(mark.sourceUuid,{nonce:mark.nonce,snapshot:original});
  return {mark,snapshot,source:root};
}
/** A GM explicitly identifies only the lingering carrier, never its initial hit. */
export async function identifyEngulfment(source,{revoke=false}={}){
  if(!writer()||!sourceRaw(source))return false;
  const snapshot=engulfmentSnapshot(source.toObject()),records=registry();
  if(revoke){
    const mark=source.getFlag(NS,ENGULFMENT_FLAG),uuid=mark?.sourceUuid??source.uuid;
    if(!records[uuid])return false;
    await updateMap(SETTING,current=>Object.fromEntries(Object.entries(current).filter(([key])=>key!==uuid)));
    verified.delete(uuid);if(writer())await source.unsetFlag(NS,ENGULFMENT_FLAG);return true;
  }
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words("Identify")},content:`<p>${words("IdentifyHelp")}</p>`});
  if(!yes||!writer()||engulfmentSnapshot(source.toObject())!==snapshot)return false;
  const fingerprint=await hash(snapshot),nonce=foundry.utils.randomID(32);
  if(!writer()||engulfmentSnapshot(source.toObject())!==snapshot)return false;
  await updateMap(SETTING,current=>{
    if(engulfmentSnapshot(source.toObject())!==snapshot)throw Error("Engulfment source changed during identification");
    return {...current,[source.uuid]:{nonce,fingerprint}};
  });
  if(!writer())return false;
  await source.setFlag(NS,ENGULFMENT_FLAG,{version:1,sourceUuid:source.uuid,nonce});
  return !!await approvedSource(source);
}
function protectedNow(actor,identified){
  const items=[...(actor.items??[])].filter(item=>item.type==="gear"&&item.parent===actor&&actor.items.get?.(item.id)===item);
  return cloakProtectsEngulfment({items,suppressed:!!dispersionFor(actor),identified});
}
const receipts=()=>game.settings.get(NS,RECEIPTS)??{};
async function saveReceipt(uuid,receipt){
  if(!writer())throw Error("Engulfment writer changed");
  const saved=structuredClone(receipt);
  await updateMap(RECEIPTS,current=>({...current,[uuid]:saved}));
  if(!writer()||JSON.stringify(receipts()[uuid])!==JSON.stringify(receipt))throw Error("Engulfment receipt unconfirmed");
}
/** The explicit GM apply door is authoritative; the synchronous hook is an additional guard. */
export async function applyIdentifiedEngulfment(source,targets,{newApplication=false}={}){
  if(!writer())return {ok:false};
  const authorization=await approvedSource(source);if(!authorization||!writer())return {ok:false};
  const uuid=authorization.mark.sourceUuid;
  if(busy.has(uuid))return {ok:false,pending:true};busy.add(uuid);
  let receipt;
  try{
    const prior=receipts()[uuid],terminal=r=>["complete","reviewed"].includes(r?.stage);
    if(prior&&(!newApplication||!terminal(prior)))return {ok:terminal(prior),replay:true,pending:!terminal(prior),results:prior.targets};
    if(newApplication){
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words("New")},content:`<p>${words("NewHelp")}</p>`});
      if(!yes||!writer())return {ok:false};
    }
    const selected=[...new Map([...targets].filter(a=>a?.documentName==="Actor"&&resolve(a.uuid)===a).map(a=>[a.uuid,a])).values()];
    if(!selected.length)return {ok:false};
    receipt={id:foundry.utils.randomID(32),stage:"applying",targets:selected.map(a=>({actorUuid:a.uuid,stage:"pending"}))};
    await saveReceipt(uuid,receipt);
    for(let index=0;index<selected.length;index++){
      const actor=selected[index],fresh=await approvedSource(source);
      if(!writer()||!fresh||resolve(source.uuid)!==source||resolve(actor.uuid)!==actor)throw Error("Engulfment source or recipient changed");
      receipt.targets[index]={actorUuid:actor.uuid,stage:"creating"};await saveReceipt(uuid,receipt);
      const current=await approvedSource(source);
      if(!writer()||!current||current.mark.sourceUuid!==uuid||resolve(actor.uuid)!==actor||resolve(source.uuid)!==source
        ||engulfmentSnapshot(source.toObject())!==current.snapshot)throw Error("Engulfment authorization changed before application");
      if(protectedNow(actor,true))receipt.targets[index]={actorUuid:actor.uuid,stage:"prevented",prevented:true};
      else{
        const data=source.toObject();delete data._id;delete data._stats;delete data.sort;
        data.origin=data.origin??source.parent?.actor?.uuid??(source.parent?.documentName==="Actor"?source.parent.uuid:null);
        data.transfer=false;data.disabled=false;data.start={time:game.time.worldTime};
        if(data.duration)data.duration.expired=false;
        data.flags={...data.flags,[NS]:{...data.flags?.[NS],[ENGULFMENT_FLAG]:current.mark}};
        const effects=await actor.createEmbeddedDocuments("ActiveEffect",[data]);
        if(!writer())throw Error("Engulfment writer changed after effect write");
        if(!effects.length&&!protectedNow(actor,true))throw Error("Engulfment effect was refused by another protection");
        receipt.targets[index]={actorUuid:actor.uuid,stage:effects.length?"applied":"prevented",prevented:!effects.length,effectUuid:effects[0]?.uuid??null};
      }
      await saveReceipt(uuid,receipt);
    }
    receipt.stage="complete";await saveReceipt(uuid,receipt);
    await ChatMessage.create({content:`<p>${words("Result")}</p><ul>${receipt.targets.map(r=>`<li>${foundry.utils.escapeHTML(resolve(r.actorUuid)?.name??r.actorUuid)}: ${words(r.prevented?"Prevented":"Applied")}</li>`).join("")}</ul>`});
    return {ok:true,results:receipt.targets};
  }catch(error){
    console.warn("azeroth-rpg | Engulfment application needs GM review",error);
    if(writer()){
      // The original durable creating/paid stage remains actionable even when
      // a secondary receipt or notification write fails during recovery.
      try{const held=receipts()[uuid];if(held){held.stage="uncertain";await saveReceipt(uuid,held);}}
      catch(secondary){console.warn("azeroth-rpg | Engulfment review receipt remains held",secondary);}
      try{await ChatMessage.create({content:`<p>${words("Uncertain")}</p>`});}
      catch(secondary){console.warn("azeroth-rpg | Engulfment review notification failed",secondary);}
    }
    return {ok:false,pending:true,results:receipts()[uuid]?.targets??[]};
  }finally{busy.delete(uuid);}
}
export async function reviewEngulfmentReceipt(source){
  if(!writer())return false;
  const uuid=source.getFlag(NS,ENGULFMENT_FLAG)?.sourceUuid??source.uuid,receipt=receipts()[uuid];
  if(!receipt||busy.has(uuid)||["complete","reviewed"].includes(receipt.stage))return false;
  const snapshot=JSON.stringify(receipt);
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},content:`<p>${words("ReviewHelp")}</p><pre>${foundry.utils.escapeHTML(snapshot)}</pre>`});
  if(!yes||!writer()||JSON.stringify(receipts()[uuid])!==snapshot||busy.has(uuid))return false;
  await saveReceipt(uuid,{...receipt,stage:"reviewed"});return true;
}
export function taggedEngulfmentProtected(effect){
  const mark=effect?.flags?.[NS]?.[ENGULFMENT_FLAG],record=mark&&registry()[mark.sourceUuid],cached=mark&&verified.get(mark.sourceUuid);
  const source=mark&&resolve(mark.sourceUuid);
  if(!source||mark.version!==1||record?.nonce!==mark.nonce||cached?.nonce!==mark.nonce)return false;
  const snapshot=engulfmentSnapshot(source.toObject());
  if(snapshot!==cached.snapshot||engulfmentSnapshot(effect.toObject())!==snapshot)return false;
  return protectedNow(effect.parent,true);
}
export function registerOnyxiaEngulfment(){
  game.settings.register(NS,SETTING,{scope:"world",config:false,type:Object,default:{},restricted:true});
  game.settings.register(NS,RECEIPTS,{scope:"world",config:false,type:Object,default:{},restricted:true});
  Hooks.on("getHeaderControlsActiveEffectConfig",(app,controls)=>{
    if(!writer()||app.document?.documentName!=="ActiveEffect")return;
    const source=app.document;
    controls.push({icon:"fa-solid fa-dragon",label:words("Identify"),onClick:()=>identifyEngulfment(source)});
    if(source.getFlag(NS,ENGULFMENT_FLAG)){
      controls.push({icon:"fa-solid fa-ban",label:words("Revoke"),onClick:()=>identifyEngulfment(source,{revoke:true})});
      controls.push({icon:"fa-solid fa-fire",label:words("Apply"),onClick:()=>applyIdentifiedEngulfment(source,[...(game.user.targets??[])].map(t=>t.actor))});
      controls.push({icon:"fa-solid fa-rotate",label:words("New"),onClick:()=>applyIdentifiedEngulfment(source,[...(game.user.targets??[])].map(t=>t.actor),{newApplication:true})});
    }
    controls.push({icon:"fa-solid fa-clipboard-check",label:words("Review"),onClick:()=>reviewEngulfmentReceipt(source)});
  });
  Hooks.on("preCreateActiveEffect",effect=>{
    if(effect.parent?.documentName==="Actor"&&taggedEngulfmentProtected(effect)){
      ui.notifications?.info(words("Prevented"));return false;
    }
  });
  Hooks.once("ready",async()=>{
    for(const uuid of Object.keys(registry())){const source=resolve(uuid);if(source)await approvedSource(source);}
  });
  Hooks.on("updateSetting",setting=>{
    if(setting.key===`${NS}.${SETTING}`)for(const uuid of Object.keys(registry())){const source=resolve(uuid);if(source)void approvedSource(source);}
  });
  Hooks.on("updateActiveEffect",source=>{if(source.getFlag(NS,ENGULFMENT_FLAG))void approvedSource(source);});
}
