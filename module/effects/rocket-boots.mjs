import {ROCKET_BOOTS_ACTION,ROCKET_BOOTS_STATE,rocketBoots,bootsAvailable,straightBootPath} from "../rules/rocket-boots.mjs";
import {squareFeet} from "../rules/movement.mjs";
import {DEVICE_BROKEN} from "../rules/device-context.mjs";
import {realmRefusalFor} from "./spirit-realm.mjs";
import {guardPendingCustodyItem} from "../rules/item-custody-guard.mjs";
import {dispersionFor} from "../rules/dispersion.mjs";
import {forcedShapeRefusal} from "../rules/shapes.mjs";
import {refuseAncientDespair} from "./ancient-despair-refusal.mjs";
export const ROCKET_BOOTS_QUERY="azeroth-rpg.rocketBoots";
const NS="azeroth-rpg",busy=new Set(),permissions=new WeakMap();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const words=k=>game.i18n.localize(`AZEROTH.RocketBoots.${k}`);
const position=t=>({x:t.x,y:t.y,elevation:t.elevation,level:t.level});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const sameBootPosition=(a,b)=>["x","y","elevation","level"].every(k=>a?.[k]===b?.[k]);
/** Native V14 walking collision/occupancy, same level, exactly60 grid feet. */
export function planRocketBoots(token,destination){
  const scene=token?.parent,object=token?.object,grid=scene?.grid,bounds=globalThis.canvas?.dimensions?.sceneRect;
  if(!scene||canvas.scene!==scene||scene.tokens.get(token.id)!==token||!object?.checkCollision
    ||!token.measureMovementPath||!token.getMovementOrigin||!token.getSnappedPosition||!bounds
    ||!(token.actor?.system?.speed>0)||realmRefusalFor(token.actor,"feature"))return null;
  try{
    const to={...position(token),...(grid.isGridless?{x:Math.round(destination.x),y:Math.round(destination.y)}:token.getSnappedPosition(destination))};
    if(![to.x,to.y].every(Number.isFinite)||to.x<bounds.x||to.y<bounds.y
      ||to.x+token.width*grid.size>bounds.x+bounds.width||to.y+token.height*grid.size>bounds.y+bounds.height)return null;
    for(const other of scene.tokens.values())if(other!==token&&other.actor&&other.level===token.level
      &&to.x<other.x+other.width*grid.size&&to.x+token.width*grid.size>other.x
      &&to.y<other.y+other.height*grid.size&&to.y+token.height*grid.size>other.y)return null;
    const origin=token.getMovementOrigin(token._source),end=token.getMovementOrigin({...token._source,...to});
    if(object.checkCollision(end,{origin,type:"move",mode:"any"})!==false)return null;
    const path=[{...position(token),action:ROCKET_BOOTS_ACTION},{...to,action:ROCKET_BOOTS_ACTION}];
    const measure=token.measureMovementPath(path,{cost:squareFeet}),feet=measure.waypoints?.[1]?.backward?.cost;
    return Number.isFinite(feet)&&Math.abs(feet-60)<1e-6?{from:position(token),to,feet}:null;
  }catch{return null;}
}
export function rocketBootMovementAllowed(token,movement){
  const path=movement?.passed?.waypoints??[];if(!path.some(p=>p.action===ROCKET_BOOTS_ACTION))return true;
  const p=permissions.get(token);
  return Boolean(writer()&&p&&p.valid()&&sameBootPosition(position(token),p.from)&&sameBootPosition(movement.origin,p.from)&&straightBootPath(p.from,p.to,path));
}
export async function useRocketBoots({actor,item,source=null}={}){
  const controlled=(globalThis.canvas?.tokens?.controlled??[]).filter(t=>t.actor===actor).map(t=>t.document);
  const standing=(actor?.getActiveTokens?.(true)??[]).map(t=>t.document??t);
  const token=source?.sceneId&&source?.tokenId?game.scenes.get(source.sceneId)?.tokens.get(source.tokenId)
    :actor?.token??(controlled.length===1?controlled[0]:standing.length===1?standing[0]:null);
  const gm=game.users?.activeGM;
  if(!gm||token?.actor!==actor||!actor?.isOwner||!bootsAvailable(item)){ui.notifications?.warn(words("Refused"));return null;}
  const data={actorUuid:actor.uuid,itemId:item.id,tokenUuid:token.uuid,requestId:foundry.utils.randomID(32)};
  try{return writer()?await rocketBootsQueryHandler(data,{user:game.user}):await gm.query(ROCKET_BOOTS_QUERY,data,{timeout:180000});}
  catch{ui.notifications?.warn(words("Pending"));return null;}
}
export async function rocketBootsQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??""))return {ok:false};
  const actor=fromUuidSync(data.actorUuid),token=fromUuidSync(data.tokenUuid),item=actor?.items.get(data.itemId);
  if(!actor?.testUserPermission(user,"OWNER")||token?.actor!==actor||!bootsAvailable(item)||busy.has(actor.uuid))return {ok:false};
  busy.add(actor.uuid);let receipt=null;
  const fight=actor.activeFight?.(),clock=fight?.started?`${fight.uuid}:${fight.round}:${fight.turn}`:null;
  const sameTurn=()=>!clock||(()=>{const f=actor.activeFight?.();return f?.started&&`${f.uuid}:${f.round}:${f.turn}`===clock;})();
  const valid=()=>writer()&&user.active&&game.users.get(user.id)===user&&actor.testUserPermission(user,"OWNER")
    &&actor.items.get(item.id)===item&&item.parent===actor&&token.actor===actor&&token.parent?.tokens.get(token.id)===token
    &&rocketBoots(item)&&(item.system.quantity??1)>0&&guardPendingCustodyItem(item).ok&&!dispersionFor(actor)&&sameTurn()
    &&actor.system.health?.value>0&&actor.system.speed>0&&!realmRefusalFor(actor,"gear")
    &&!forcedShapeRefusal(actor.shape,"feature")&&!refuseAncientDespair(actor,"gear");
  const save=async value=>{if(!valid()||receipt&&!same(item.getFlag(NS,ROCKET_BOOTS_STATE),receipt))throw Error("Rocket boots changed");await item.setFlag(NS,ROCKET_BOOTS_STATE,value);
    if(!valid()||!same(item.getFlag(NS,ROCKET_BOOTS_STATE),value))throw Error("Rocket boots receipt write uncertain");receipt=value;};
  try{
    // The GM supplies the missing action contract; no action is preselected.
    const html=foundry.utils.escapeHTML;
    const declaration=await foundry.applications.api.DialogV2.prompt({window:{title:words("Declare")},content:`<p>${words("Declaration")}</p>
      <label>${words("Action")}<select name="action" required><option value=""></option>${["none","half","full","reaction"].map(k=>`<option value="${k}">${html(words(k))}</option>`).join("")}</select></label>`,
      ok:{label:words("Declare"),callback:(_e,b)=>({action:b.form.elements.action.value})},rejectClose:false});
    if(!declaration||!["none","half","full","reaction"].includes(declaration.action)||!valid()||!bootsAvailable(item))return {ok:false};
    const {pickPoint}=await import("../canvas/place.mjs");let plan=null;
    const picked=await pickPoint({sceneId:token.parent.id,hint:words("Pick"),accept:p=>{
      plan=planRocketBoots(token,{x:p.x-token.width*token.parent.grid.size/2,y:p.y-token.height*token.parent.grid.size/2});
      if(!plan)ui.notifications?.warn(words("Path"));return Boolean(plan);}});
    if(!picked||!plan||!valid()||!bootsAvailable(item))return {ok:false};
    const {turnBudgetRefusal,spendTurnBudget}=await import("../dice/workflows.mjs");
    if(turnBudgetRefusal(actor,declaration.action==="none"?null:declaration.action))return {ok:false};
    await save({version:1,id:data.requestId,stage:"claimed",spent:true,from:plan.from,to:plan.to,tokenUuid:token.uuid,declaration});
    if(!sameBootPosition(position(token),plan.from)||!planRocketBoots(token,plan.to))throw Error("Rocket path changed before payment");
    if(!await spendTurnBudget(actor,declaration.action==="none"?null:declaration.action))throw Error("Declared rocket action was not paid");
    await save({...receipt,stage:"paid"});
    const roll=await new Roll("1d20").evaluate(),natural=Number(roll.total);
    if(!Number.isInteger(natural)||natural<1||natural>20)throw Error("Rocket malfunction die did not complete");
    await save({...receipt,stage:"rolled",natural});
    if(natural===1){
      await item.setFlag(NS,DEVICE_BROKEN,{version:1,event:data.requestId,natural:1});
      if(!valid()||item.getFlag(NS,DEVICE_BROKEN)?.event!==data.requestId)throw Error("Rocket boots break requires review");
    }
    const rollCard=await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:words("Malfunction")});
    if(!rollCard?.uuid)throw Error("Rocket malfunction publication failed");
    await save({...receipt,testMessage:rollCard.uuid});
    if(!valid()||!sameBootPosition(position(token),plan.from)||!planRocketBoots(token,plan.to))throw Error("Rocket path changed after payment");
    permissions.set(token,{...plan,valid:()=>valid()&&item.getFlag(NS,ROCKET_BOOTS_STATE)?.id===data.requestId});
    let moved;try{moved=await token.move({...plan.to,action:ROCKET_BOOTS_ACTION});}finally{permissions.delete(token);}
    if(!moved||!valid()||!sameBootPosition(position(token),plan.to))throw Error("Rocket move stopped before its declared sixty-foot endpoint");
    await save({...receipt,stage:"complete"});return {ok:true,moved:true};
  }catch(error){console.warn("azeroth-rpg | Rocket boots need GM review",error);
    if(receipt&&writer())try{await save({...receipt,stage:"uncertain"});}catch{}
    ui.notifications?.warn(words("Pending"));return {ok:false,pending:Boolean(receipt)};
  }finally{busy.delete(actor.uuid);}
}
export function registerRocketBoots(){
  CONFIG.queries[ROCKET_BOOTS_QUERY]=rocketBootsQueryHandler;
  CONFIG.Token.movement.actions[ROCKET_BOOTS_ACTION]={label:"AZEROTH.RocketBoots.Declare",icon:"fa-solid fa-rocket",order:10,canSelect:false,terrainAction:"walk"};
  Hooks.on("preMoveToken",rocketBootMovementAllowed);
  Hooks.on("getActorContextOptions",(_app,options)=>options.push({label:"AZEROTH.RocketBoots.Review",icon:"fa-solid fa-clipboard-check",
    visible:li=>writer()&&[...(game.actors.get(li.dataset.entryId)?.items??[])].some(i=>rocketBoots(i)&&i.getFlag(NS,ROCKET_BOOTS_STATE)?.spent&&!['complete','reviewed'].includes(i.getFlag(NS,ROCKET_BOOTS_STATE)?.stage)),
    onClick:async(_e,li)=>{
      const actor=game.actors.get(li.dataset.entryId);if(!writer()||!actor?.isOwner)return;
      if(!await foundry.applications.api.DialogV2.confirm({window:{title:words("Review")},content:`<p>${words("ReviewInstruction")}</p>`}))return;
      for(const item of actor.items)if(writer()&&rocketBoots(item)&&item.getFlag(NS,ROCKET_BOOTS_STATE)?.spent&&!['complete','reviewed'].includes(item.getFlag(NS,ROCKET_BOOTS_STATE)?.stage))
        await item.setFlag(NS,ROCKET_BOOTS_STATE,{...item.getFlag(NS,ROCKET_BOOTS_STATE),stage:"reviewed",spent:true});
    }}));
}
