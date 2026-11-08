import {PLACED_DEVICE,PLACED_DEVICE_RECEIPT,placedDeviceKind,dummyElapsed,dummyClaim,grappleDistanceAllowed} from "../rules/placed-devices.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {spellTiming} from "./durations.mjs";
import {dispersionFor} from "../rules/dispersion.mjs";
import {forcedShapeRefusal} from "../rules/shapes.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
import {feetBetweenFootprints,footprintOf} from "../canvas/footprints.mjs";
export const PLACED_DEVICE_QUERY="azeroth-rpg.placedDevice";
const NS="azeroth-rpg",busy=new Set(),writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const words=k=>game.i18n.localize(`AZEROTH.PlacedDevice.${k}`),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clock=actor=>{const c=actor.activeFight?.();return {combatUuid:c?.started?c.uuid:null,round:c?.started?c.round:null,time:game.time?.worldTime??0};};
const pending=actor=>{const r=actor.getFlag(NS,PLACED_DEVICE_RECEIPT);return r&&!['complete','reviewed'].includes(r.stage);};
const held=(actor,item)=>actor.items.get(item?.id)===item&&item?.parent===actor&&(item.system.quantity??1)>0&&guardPendingCustodyItem(item).ok;
const mayActivate=actor=>actor.system?.health?.value>0&&!dispersionFor(actor)&&!forcedShapeRefusal(actor.shape,"feature")
  &&!realmRefusalFor(actor,"gear")&&!refuseAncientDespair(actor,"gear");
async function request(data){try{const gm=game.users?.activeGM;return writer()?await placedDeviceQueryHandler(data,{user:game.user})
  :await gm?.query(PLACED_DEVICE_QUERY,data,{timeout:180000})??{ok:false};}catch{return {ok:false};}}
export async function usePlacedDevice({actor,item}={}){
  if(!actor?.isOwner||!placedDeviceKind(item))return null;
  const controlled=(globalThis.canvas?.tokens?.controlled??[]).filter(t=>t.actor===actor).map(t=>t.document);
  const standing=(actor.getActiveTokens?.(true)??[]).map(t=>t.document??t);
  const token=actor.token??(controlled.length===1?controlled[0]:standing.length===1?standing[0]:null);
  if(!token){ui.notifications?.warn(words("Scene"));return null;}
  const result=await request({operation:"deploy",actorUuid:actor.uuid,itemId:item.id,tokenUuid:token.uuid,requestId:foundry.utils.randomID(32)});
  if(!result.ok)ui.notifications?.warn(words(result.pending?"Pending":"Refused"));return result;
}
async function declaredAction(){
  const html=foundry.utils.escapeHTML;
  return foundry.applications.api.DialogV2.prompt({window:{title:words("Declare")},content:`<p>${words("Declaration")}</p><select name="action" required><option value=""></option>${['none','half','full','reaction'].map(k=>`<option value="${k}">${html(game.i18n.localize(`AZEROTH.RocketBoots.${k}`))}</option>`).join("")}</select>`,
    ok:{label:words("Declare"),callback:(_e,b)=>b.form.elements.action.value},rejectClose:false});
}
export function measureGrapple(token,point){
  try{return feetBetweenFootprints(footprintOf(token),{kind:"points",points:[{x:point.x,y:point.y}],elevation:point.elevation??token.elevation},token.parent.grid);}catch{return null;}
}
export async function placedDeviceQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??""))return {ok:false};
  const actor=fromUuidSync(data.actorUuid);
  if(!actor?.testUserPermission(user,"OWNER")||busy.has(actor.uuid)||pending(actor))return {ok:false};
  if(data.operation!=="deploy"&&!user.isGM)return {ok:false};
  busy.add(actor.uuid);let receipt=null;
  const valid=()=>writer()&&user.active&&game.users.get(user.id)===user&&actor.testUserPermission(user,"OWNER")&&fromUuidSync(actor.uuid)===actor;
  const save=async next=>{
    if(!valid()||receipt&&!same(actor.getFlag(NS,PLACED_DEVICE_RECEIPT),receipt))throw Error("Device receipt changed");
    await actor.setFlag(NS,PLACED_DEVICE_RECEIPT,next);
    if(!valid()||!same(actor.getFlag(NS,PLACED_DEVICE_RECEIPT),next))throw Error("Device receipt write unconfirmed");receipt=next;
  };
  try{
    if(data.operation==="deploy"){
      const item=actor.items.get(data.itemId),kind=placedDeviceKind(item),token=fromUuidSync(data.tokenUuid);
      const identity=JSON.stringify({identifier:item?.system.identifier,source:item?.system.source});
      const environment=()=>valid()&&token?.actor===actor&&canvas.scene===token.parent&&token.parent.tokens.get(token.id)===token&&mayActivate(actor);
      const source=()=>environment()&&held(actor,item)&&JSON.stringify({identifier:item.system.identifier,source:item.system.source})===identity;
      if(!kind||!source()||kind==="grapple"&&item.getFlag(NS,PLACED_DEVICE)?.placed
        ||kind==="dummy"&&(!Number.isInteger(item.system.quantity)||item.system.quantity<1))return {ok:false};
      const action=await declaredAction();if(!['none','half','full','reaction'].includes(action)||!source())return {ok:false};
      const initialFrom={x:token.x,y:token.y,elevation:token.elevation,level:token.level};
      let anchorElevation=token.elevation;
      if(kind==="grapple"){
        const selected=await foundry.applications.api.DialogV2.prompt({window:{title:words("AnchorElevation")},content:`<p>${words("AnchorInstruction")}</p><input name="elevation" type="number" step="any" required value="${token.elevation}">`,ok:{label:words("Declare"),callback:(_e,b)=>Number(b.form.elements.elevation.value)},rejectClose:false});
        if(selected===null||selected===undefined||!Number.isFinite(selected)||!source())return {ok:false};anchorElevation=selected;
      }
      const {pickPoint}=await import("../canvas/place.mjs");let point=null,feet=null;
      const picked=await pickPoint({sceneId:token.parent.id,hint:words(kind==="dummy"?"PlaceDummy":"PlaceGrapple"),accept:p=>{
        if(![p?.x,p?.y].every(Number.isFinite))return false;
        feet=kind==="grapple"?measureGrapple(token,{...p,elevation:anchorElevation}):null;
        if(kind==="grapple"&&!grappleDistanceAllowed(feet)){ui.notifications?.warn(words("Range"));return false;}
        point={x:p.x,y:p.y,elevation:anchorElevation,level:token.level};return true;
      }});
      if(!picked||!point||!source())return {ok:false};
      const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>${words(kind==="dummy"?"ConfirmDummy":"ConfirmGrapple")}</p>`});
      if(!confirmed||!source()||!same(initialFrom,{x:token.x,y:token.y,elevation:token.elevation,level:token.level})
        ||kind==="grapple"&&!grappleDistanceAllowed(measureGrapple(token,point)))return {ok:false};
      const from={x:token.x,y:token.y,elevation:token.elevation,level:token.level},quantity=item.system.quantity;
      const {turnBudgetRefusal,spendTurnBudget}=await import("../dice/workflows.mjs");
      if(turnBudgetRefusal(actor,action==="none"?null:action))return {ok:false};
      await save({id:data.requestId,stage:"claimed",kind,itemId:item.id,itemUuid:item.uuid,quantity,point,sceneId:token.parent.id,action});
      if(!source()||item.system.quantity!==quantity)throw Error("Device changed before action payment");
      if(!await spendTurnBudget(actor,action==="none"?null:action))throw Error("Device action not paid");
      if(!source()||item.system.quantity!==quantity||!same(from,{x:token.x,y:token.y,elevation:token.elevation,level:token.level}))throw Error("Device source moved or changed during payment");
      if(kind==="grapple"&&!grappleDistanceAllowed(measureGrapple(token,point)))throw Error("Grapple range changed");
      await save({...receipt,stage:"actionPaid"});
      const fixedPosition=()=>same(from,{x:token.x,y:token.y,elevation:token.elevation,level:token.level});
      if(!source()||item.system.quantity!==quantity||!fixedPosition())throw Error("Device changed after action receipt");
      if(kind==="dummy"){
        if(quantity===1)await item.delete();else await item.update({"system.quantity":quantity-1});
        const remaining=actor.items.get(item.id);
        if(!valid()||(quantity===1?Boolean(remaining):remaining!==item||remaining.system.quantity!==quantity-1))throw Error("Dummy portion payment unconfirmed");
        await save({...receipt,stage:"paid"});
        if(!environment()||!fixedPosition()||!guardPendingCustodyItem(item).ok
          ||JSON.stringify({identifier:item.system.identifier,source:item.system.source})!==identity)throw Error("Dummy changed after portion payment");
        const now=clock(actor),state={version:1,kind:"dummy",requestId:data.requestId,sceneId:token.parent.id,point,
          combatUuid:now.combatUuid,startRound:now.round??0,time:now.time,manualRound:0,lastElapsed:0,claims:[]};
        const timing=spellTiming(actor,now.combatUuid?{value:3,units:"rounds"}:{value:18,units:"seconds"});
        const made=await actor.createEmbeddedDocuments("ActiveEffect",[{name:item.name,img:item.img,system:{changes:[]},...timing,
          flags:{[NS]:{[PLACED_DEVICE]:state}}}]);
        if(!valid()||made.length!==1||actor.effects.get(made[0].id)?.getFlag(NS,PLACED_DEVICE)?.requestId!==data.requestId)throw Error("Dummy tracker creation unconfirmed");
        await save({...receipt,stage:"complete",effectUuid:made[0].uuid});return {ok:true,effectUuid:made[0].uuid};
      }
      const line={version:1,kind:"grapple",placed:true,requestId:data.requestId,sceneId:token.parent.id,from,point,feet};
      if(!source()||!fixedPosition()||!grappleDistanceAllowed(measureGrapple(token,point)))throw Error("Grapple changed before placement");
      await item.setFlag(NS,PLACED_DEVICE,line);
      if(!source()||!same(item.getFlag(NS,PLACED_DEVICE),line))throw Error("Grapple placement unconfirmed");
      await save({...receipt,stage:"complete"});return {ok:true};
    }
    const effect=fromUuidSync(data.effectUuid),state=effect?.getFlag(NS,PLACED_DEVICE);
    if(effect?.parent!==actor||actor.effects.get(effect.id)!==effect||state?.kind!=="dummy"||state.version!==1||effect.disabled||effect.isSuppressed||effect.duration?.expired)return {ok:false};
    if(data.operation==="draw"){
      const result=dummyClaim(state,{requestId:data.requestId,...clock(actor)});if(!result.ok||result.already)return {ok:result.ok,already:result.already??false};
      await save({id:data.requestId,stage:"claimed",kind:"dummyDraw",effectUuid:effect.uuid,round:result.state.lastElapsed});
      if(actor.effects.get(effect.id)!==effect||effect.disabled||effect.isSuppressed||effect.duration?.expired
        ||!same(effect.getFlag(NS,PLACED_DEVICE),state)||dummyElapsed(state,clock(actor))!==result.state.lastElapsed)throw Error("Dummy changed before claim");
      await effect.setFlag(NS,PLACED_DEVICE,result.state);
      if(!valid()||actor.effects.get(effect.id)!==effect||effect.disabled||effect.isSuppressed||effect.duration?.expired
        ||dummyElapsed(result.state,clock(actor))!==result.state.lastElapsed||!same(effect.getFlag(NS,PLACED_DEVICE),result.state))throw Error("Dummy attack claim unconfirmed");
      await save({...receipt,stage:"complete"});return {ok:true};
    }
    if(data.operation==="nextRound"){
      if(actor.activeFight?.()?.started)return {ok:false};
      const next={...state,manualRound:Math.max(state.manualRound??0,dummyElapsed(state,clock(actor)))+1};
      await effect.setFlag(NS,PLACED_DEVICE,next);if(!valid()||!same(effect.getFlag(NS,PLACED_DEVICE),next))throw Error("Dummy round unconfirmed");
      if(dummyElapsed(next,clock(actor))>=3){await actor.deleteEmbeddedDocuments("ActiveEffect",[effect.id]);if(actor.effects.get(effect.id))throw Error("Dummy expiry deletion unconfirmed");}return {ok:true};
    }
    return {ok:false};
  }catch(error){console.warn("azeroth-rpg | Placed device needs GM review",error);
    if(receipt&&writer())try{await save({...receipt,stage:"uncertain"});}catch{}
    ui.notifications?.warn(words("Pending"));return {ok:false,pending:Boolean(receipt)};
  }finally{busy.delete(actor.uuid);}
}
export function registerPlacedDevices(){
  CONFIG.queries[PLACED_DEVICE_QUERY]=placedDeviceQueryHandler;
  Hooks.on("getHeaderControlsActiveEffectConfig",(app,controls)=>{
    const effect=app.document,state=effect.getFlag(NS,PLACED_DEVICE);if(!writer()||state?.kind!=="dummy")return;
    const send=async operation=>{const result=await request({operation,actorUuid:effect.parent.uuid,effectUuid:effect.uuid,requestId:foundry.utils.randomID(32)});if(!result.ok)ui.notifications?.warn(words(result.pending?"Pending":"Refused"));return result;};
    controls.push({label:words("Draw"),icon:"fa-solid fa-bullseye",onClick:()=>send("draw")});
    if(!effect.parent.activeFight?.()?.started)controls.push({label:words("NextRound"),icon:"fa-solid fa-forward",onClick:()=>send("nextRound")});
  });
  const expire=async actor=>{if(!writer()||!actor||busy.has(actor.uuid))return;
    const ids=[...actor.effects].filter(e=>{const s=e.getFlag(NS,PLACED_DEVICE),elapsed=dummyElapsed(s,clock(actor));return s?.kind==="dummy"&&elapsed!==null&&(elapsed<0||elapsed>=3);}).map(e=>e.id);
    if(ids.length)await actor.deleteEmbeddedDocuments("ActiveEffect",ids);
  };
  const clean=()=>{if(writer()){const actors=new Set([...game.actors]);for(const scene of game.scenes??[])for(const token of scene.tokens??[])if(token.actor)actors.add(token.actor);for(const actor of actors)void expire(actor).catch(console.warn);}};
  Hooks.on("updateCombat",clean);Hooks.on("updateWorldTime",clean);Hooks.once("ready",clean);
  Hooks.on("getActorContextOptions",(_app,options)=>{
    options.push({label:"AZEROTH.PlacedDevice.Retrieve",icon:"fa-solid fa-anchor",visible:li=>writer()&&[...(game.actors.get(li.dataset.entryId)?.items??[])].some(i=>placedDeviceKind(i)==="grapple"&&i.getFlag(NS,PLACED_DEVICE)?.placed),
      onClick:async(_e,li)=>{const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;
        const items=[...actor.items].filter(i=>placedDeviceKind(i)==="grapple"&&i.getFlag(NS,PLACED_DEVICE)?.placed),html=foundry.utils.escapeHTML;
        const id=await foundry.applications.api.DialogV2.prompt({window:{title:words("Retrieve")},content:`<p>${words("RetrieveInstruction")}</p><select name="item">${items.map(i=>`<option value="${html(i.id)}">${html(i.name)}</option>`).join("")}</select>`,ok:{label:words("Retrieve"),callback:(_e,b)=>b.form.elements.item.value},rejectClose:false});
        const item=actor.items.get(id);if(writer()&&held(actor,item)&&placedDeviceKind(item)==="grapple"){await item.unsetFlag(NS,PLACED_DEVICE);if(item.getFlag(NS,PLACED_DEVICE))ui.notifications?.warn(words("Pending"));}
      }});
    options.push({label:"AZEROTH.PlacedDevice.Review",icon:"fa-solid fa-clipboard-check",visible:li=>writer()&&pending(game.actors.get(li.dataset.entryId)??{getFlag:()=>null}),
      onClick:async(_e,li)=>{const actor=game.actors.get(li.dataset.entryId),receipt=actor?.getFlag(NS,PLACED_DEVICE_RECEIPT);
        if(!writer()||!actor?.isOwner||!pending(actor)||busy.has(actor.uuid))return;
        if(!await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},content:`<p>${words("ReviewInstruction")}</p>`}))return;
        if(!writer()||!same(actor.getFlag(NS,PLACED_DEVICE_RECEIPT),receipt)||busy.has(actor.uuid))return;
        if(receipt.kind==="dummyDraw"){const effect=fromUuidSync(receipt.effectUuid);if(effect?.parent===actor){await actor.deleteEmbeddedDocuments("ActiveEffect",[effect.id]);if(actor.effects.get(effect.id))return;}}
        await actor.setFlag(NS,PLACED_DEVICE_RECEIPT,{...receipt,stage:"reviewed"});
      }});
  });
}
