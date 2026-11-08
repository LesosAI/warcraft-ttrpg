/** 04: a stationary eight-hour watch. Location revelation is not dispelling
 * Invisibility, and its noise does not cure magical Dreadlord Sleep. */
import {ALARM_BOT,ALARM_SECONDS,activeAlarm,watchGeometry,closestWatchPoint} from '../rules/alarm-bot.mjs';
import {placeArea} from '../canvas/regions.mjs';
import {feetBetweenFootprints,footprintOf} from '../canvas/footprints.mjs';
import {isNpcSneakEffect} from '../rules/npc-sneak.mjs';
import {guardPendingCustodyItem} from '../rules/item-custody-guard.mjs';
import {realmRefusalFor} from './spirit-realm.mjs';
import {refuseDispersion} from './dispersion-protection.mjs';
import {refuseAncientDespair} from './ancient-despair-refusal.mjs';
export const ALARM_QUERY='azeroth-rpg.alarmBot';
const NS='azeroth-rpg',RECEIPT='alarmBotReceipt',queues=new Map(),deploying=new Set();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const requireWriter=()=>{if(!writer())throw Error('Alarm-o-Bot writer changed');};
const words=key=>game.i18n.localize(`AZEROTH.AlarmBot.${key}`);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const present=region=>region?.parent?.regions?.get?.(region.id)===region;
const validToken=token=>token?.actor&&token.parent?.tokens?.get?.(token.id)===token;
const stateOf=region=>activeAlarm(region,game.time.worldTime);
const featureOf=item=>item?.type==='feature'&&item.getFlag(NS,'feature')?.gadget==='alarm-o-bot';
const eligible=actor=>!realmRefusalFor(actor,'feature')&&!refuseDispersion(actor,'gear')
  &&!refuseAncientDespair(actor,'feature')&&!actor.refuseForcedShape?.('feature');
function inside(region,token,state=stateOf(region),position=token?._source??{}){
  if(!state||!validToken(token)||token.parent!==region.parent||(position.level??token.level)!==state.level)return false;
  const anchor=state.anchor;
  if(!anchor)return false;
  const distance=feetBetweenFootprints(footprintOf(token,position),{kind:'points',points:[anchor],elevation:anchor.elevation},region.parent.grid);
  try{return distance!==null&&distance<=30&&token.testInsideRegion(region,position)===true;}catch{return false;}
}
const occupants=(region,state=stateOf(region))=>[...region.parent.tokens].filter(t=>inside(region,t,state));
function physicalEntries(region,token,movement,state){
  const segments=token.segmentizeRegionMovementPath(region,[movement.origin,...movement.passed.waypoints]);
  const grid=region.parent.grid,scale=(grid.sizeX??grid.size)/grid.distance;
  let wasInside=inside(region,token,state,movement.origin);
  const entries=[];
  for(const segment of segments){
    const from={...movement.origin,...segment.from},to={...from,...segment.to};
    const points=[from];
    const teleport=CONFIG.Token.movement.actions[segment.action??to.action]?.teleport===true;
    if(!teleport)points.push(closestWatchPoint(from,to,state.anchor,scale,
      {x:(token.width??1)*(grid.sizeX??grid.size)/2,y:(token.height??1)*(grid.sizeY??grid.size)/2}));
    points.push(to);
    for(const point of points){
      const nowInside=inside(region,token,state,point);
      if(nowInside&&!wasInside)entries.push({to:point});
      wasInside=nowInside;
    }
  }
  return entries;
}
async function save(region,state){
  requireWriter();if(!present(region))throw Error('Alarm watch removed');
  await region.setFlag(NS,ALARM_BOT,structuredClone(state));requireWriter();
  if(JSON.stringify(region.flags?.[NS]?.[ALARM_BOT])!==JSON.stringify(state))throw Error('Alarm watch write uncertain');
}
async function serial(region,work){
  const previous=queues.get(region.uuid)??Promise.resolve();
  const next=previous.catch(()=>{}).then(work);queues.set(region.uuid,next);
  try{return await next;}finally{if(queues.get(region.uuid)===next)queues.delete(region.uuid);}
}
async function request(data){
  try{return writer()?await alarmBotQueryHandler(data,{user:game.user})
    :await game.users?.activeGM?.query(ALARM_QUERY,data,{timeout:60000})??{ok:false};}
  catch(error){console.warn('azeroth-rpg | Alarm-o-Bot request uncertain',error);return {ok:false,pending:true};}
}
export async function useAlarmBot({actor,item,source}={}){
  if(!actor||!featureOf(item))return null;
  const explicit=source?.sceneId&&source?.tokenId;
  const token=explicit?game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId)
    :source?.document??source??actor.token??actor.getActiveTokens?.(true)?.[0]?.document;
  const scene=token?.parent??globalThis.canvas?.scene;
  if(!scene||explicit&&!token){ui.notifications?.warn(words('NeedsScene'));return null;}
  const level=token?.level??globalThis.canvas?.level?.id??null;
  const elevation=token?.elevation??globalThis.canvas?.level?.elevation?.bottom??0;
  const {pickPoint}=await import('../canvas/place.mjs');
  const point=await pickPoint({sceneId:scene.id,hint:words('Pick')});if(!point)return null;
  const result=await request({actorUuid:actor.uuid,itemId:item.id,sourceUuid:token?.uuid,sceneUuid:scene.uuid,
    point:{x:point.x,y:point.y},level,elevation,uses:item.system.uses?.value,requestId:foundry.utils.randomID(32)});
  if(!result.ok)ui.notifications?.warn(words(result.pending?'Uncertain':'Refused'));
  return result;
}
export async function alarmBotQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  const actor=resolve(data.actorUuid),scene=resolve(data.sceneUuid),item=actor?.items?.get(data.itemId),source=data.sourceUuid?resolve(data.sourceUuid):null;
  const level=source?.level??data.level??null,elevation=source?.elevation??data.elevation??0;
  const valid=(uses=data.uses)=>writer()&&user.active&&game.users.get(user.id)===user&&resolve(actor?.uuid)===actor
    &&actor?.testUserPermission(user,'OWNER')&&featureOf(item)&&item.parent===actor&&actor.items.get(item.id)===item
    &&guardPendingCustodyItem(item).ok&&eligible(actor)&&Number.isInteger(data.uses)&&data.uses>0&&item.system.uses?.value===uses
    &&scene&&game.scenes.get(scene.id)===scene&&(!data.sourceUuid||validToken(source)&&source.actor===actor&&source.parent===scene)
    &&(!scene.levels?.size||scene.levels.has(level))&&Number.isFinite(elevation)
    &&(!source||source.level===level&&source.elevation===elevation)
    &&Number.isFinite(data.point?.x)&&Number.isFinite(data.point?.y);
  if(!valid()||deploying.has(actor.uuid)||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??''))return {ok:false};
  const old=actor.getFlag(NS,RECEIPT);
  if(old&&!['complete','reviewed'].includes(old.stage))return {ok:false,pending:true};
  if(old?.requestId===data.requestId)return {ok:true,already:true};
  deploying.add(actor.uuid);
  let receipt;
  const write=async value=>{requireWriter();await actor.setFlag(NS,RECEIPT,structuredClone(value));requireWriter();
    if(JSON.stringify(actor.getFlag(NS,RECEIPT))!==JSON.stringify(value))throw Error('Alarm deployment receipt uncertain');};
  try{
    const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Deploy')},content:`<p>${words('ConfirmMinute')}</p>`});
    if(!yes||!valid())return {ok:false};
    receipt={version:1,requestId:data.requestId,stage:'reserved',sceneUuid:scene.uuid,point:data.point,itemUuid:item.uuid};await write(receipt);
    if(!valid())throw Error('Alarm source changed before payment');
    receipt.stage='paying';await write(receipt);
    if(!valid())throw Error('Alarm source changed during reservation');
    await item.update({'system.uses.value':data.uses-1});requireWriter();
    if(!valid(data.uses-1))throw Error('Alarm counter/source uncertain');
    receipt.stage='placing';await write(receipt);
    if(!valid(data.uses-1))throw Error('Alarm source changed before placement');
    const region=await placeArea({areaText:'A 30 ft radius on the ground',name:item.name,scene,origin:data.point,
      token:source,attach:false,flags:{[ALARM_BOT]:{version:1,expiresAt:game.time.worldTime+ALARM_SECONDS,level,anchor:{...data.point,elevation},geometry:null,inside:[],lastMoves:{},event:null,pendingEntries:[]}}});
    requireWriter();if(!present(region))throw Error('Alarm region unconfirmed');
    receipt.regionUuid=region.uuid;await write(receipt);
    if(!valid(data.uses-1))throw Error('Alarm source changed during placement');
    // The generic Region placer deliberately uses all levels; this particular
    // stationary ground watch is explicitly authored on the confirmed level.
    await region.update({levels:level?[level]:[],elevation:{bottom:elevation-30,top:elevation+30,topInclusive:true}});requireWriter();
    if(!valid(data.uses-1))throw Error('Alarm placement level changed');
    const state={...region.flags[NS][ALARM_BOT],geometry:watchGeometry(region)};
    // Seed existing occupants before enabling the watch; placement does not
    // make the party arrive in its own watch or ring an immediate alarm.
    state.inside=occupants(region,state).map(t=>t.uuid);
    await save(region,state);
    receipt.stage='complete';await write(receipt);
    await ChatMessage.create({content:`<p>${words('Deployed')}</p>`});
    return {ok:true,regionUuid:region.uuid};
  }catch(error){
    console.warn('azeroth-rpg | Alarm deployment needs GM review',error);
    if(receipt&&writer())try{receipt.stage='uncertain';await write(receipt);}catch(secondary){console.warn(secondary);}
    return {ok:false,pending:true};
  }finally{deploying.delete(actor.uuid);}
}
/** Uses V14.367's same path segmentation as the established area-entry door:
 * physical crossings count even with both endpoints outside; teleports only
 * enter at their destination. No center-only endpoint approximation. */
export async function alarmBotMove(token,movement,operation={}){
  if(!writer()||!validToken(token))return 0;
  let count=0;
  for(const region of token.parent.regions){
    if(!stateOf(region))continue;
    count+=await serial(region,async()=>{
      let state=stateOf(region);if(!writer()||!present(region)||!state)return 0;
      if(state.pendingEntries?.length||state.event&&!['complete','reviewed'].includes(state.event.stage))return 0;
      const prior=state.inside.includes(token.uuid),after=inside(region,token);
      const key=movement?.id??JSON.stringify([movement?.origin,movement?.passed?.waypoints]);
      let entries=[];
      if(operation.created===true){if(after&&!prior)entries=[{to:token._source??token}];}
      else if(operation.isUndo!==true&&operation.isPaste!==true&&movement?.method!=='undo'&&movement?.method!=='paste'
        &&movement?.passed?.waypoints?.length&&state.lastMoves[token.uuid]!==key){
        try{entries=physicalEntries(region,token,movement,state);}catch{throw Error('Alarm path could not be measured');}
      }
      state={...state,inside:occupants(region).map(t=>t.uuid),lastMoves:{...state.lastMoves,[token.uuid]:key},
        pendingEntries:entries.map(entry=>({x:entry.to.x,y:entry.to.y,tokenUuid:token.uuid,movementKey:key}))};
      await save(region,state);
      let detected=0;
      for(let index=0;index<entries.length;index++){
        if(!writer()||!stateOf(region)||!validToken(token))break;
        const event={id:foundry.utils.randomID(32),stage:'revealing',tokenUuid:token.uuid,
          point:{x:entries[index].to.x,y:entries[index].to.y},at:game.time.worldTime};
        state={...state,event};await save(region,state);
        try{
          if(!writer()||!stateOf(region)||!validToken(token))throw Error('Alarm trigger changed');
          const {reveal}=await import('./stealth.mjs');
          if(!writer()||!stateOf(region))throw Error('Alarm writer changed before reveal');
          const hidden=token.actor.getFlag(NS,'hidden')===true;
          const sneaking=[...token.actor.effects].filter(e=>isNpcSneakEffect(e,token.actor.uuid)).map(e=>e.id);
          await reveal(token.actor,{preserveIndependentInvisibility:true,valid:()=>writer()&&!!stateOf(region)&&validToken(token)});requireWriter();
          if(hidden&&token.actor.getFlag(NS,'hidden')===true||sneaking.some(id=>token.actor.effects.has(id)))throw Error('Alarm owned Hide/Sneak removal unconfirmed');
          const {dreamFor,dreamQueryHandler}=await import('./thematic-dream.mjs');
          for(const sleeper of occupants(region)){
            if(!writer()||!stateOf(region))throw Error('Alarm wake authority changed');
            const held=dreamFor(sleeper.actor);
            if(held&&inside(region,sleeper)){
              const result=await dreamQueryHandler({phase:'leave',ticket:held.ticket,memberUuid:sleeper.actor.uuid,reason:'woke'},{user:game.user});
              requireWriter();if(!result.ok)throw Error('Dream waking uncertain');
            }
          }
          const grid=region.parent.grid,sizeX=grid.sizeX??grid.size,sizeY=grid.sizeY??grid.size;
          const location=`${Math.floor(event.point.x/sizeX)+1}, ${Math.floor(event.point.y/sizeY)+1}`;
          // No actor/token name or private NPC identity is disclosed publicly.
          const message=await ChatMessage.create({content:`<p>${words('Detected')} (${foundry.utils.escapeHTML(location)})</p><p>${words('WakeNotice')}</p><button type="button" data-alarm-wake="${event.id}">${words('DeclareWake')}</button>`,
            flags:{[NS]:{alarmBotEvent:{id:event.id,regionUuid:region.uuid}}}});
          requireWriter();event.stage='complete';event.messageUuid=message.uuid;
          state={...state,event,pendingEntries:state.pendingEntries.slice(1)};await save(region,state);detected++;
        }catch(error){
          console.warn('azeroth-rpg | Alarm event held for GM review',error);
          if(writer()&&present(region))try{event.stage='uncertain';state={...state,event};await save(region,state);}catch(secondary){console.warn(secondary);}
          ui.notifications?.warn(words('Uncertain'));break;
        }
      }
      return detected;
    });
  }
  return count;
}
export async function reconcileAlarm(region,{reposition=false}={}){
  return serial(region,async()=>{
    if(!writer()||!present(region))return false;
    const state=region.flags?.[NS]?.[ALARM_BOT];if(state?.version!==1||state.expiresAt<=game.time.worldTime)return false;
    const before=JSON.stringify(state),geometry=watchGeometry(region);
    if(reposition){
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Reposition')},content:`<p>${words('ConfirmPosition')}</p>`});
      if(!yes||!writer()||!present(region)||state.expiresAt<=game.time.worldTime
        ||JSON.stringify(region.flags?.[NS]?.[ALARM_BOT])!==before||watchGeometry(region)!==geometry)return false;
    }else if(!stateOf(region))return false;
    const shape=region.shapes?.[0],anchor=reposition?{x:shape?.x,y:shape?.y,elevation:(region.elevation.bottom+region.elevation.top)/2}:state.anchor;
    if(![anchor?.x,anchor?.y,anchor?.elevation].every(Number.isFinite))return false;
    const next={...state,geometry:watchGeometry(region),anchor,level:reposition?(region.levels?.values?.().next().value??state.level):state.level};
    await save(region,next);next.inside=occupants(region).map(t=>t.uuid);await save(region,next);return true;
  });
}
export function registerAlarmBot(){
  CONFIG.queries[ALARM_QUERY]=alarmBotQueryHandler;
  const run=task=>task.catch(error=>{console.warn('azeroth-rpg | Alarm watch unresolved',error);ui.notifications?.warn(words('Uncertain'));});
  Hooks.on('moveToken',(token,movement,operation)=>{if(writer())run(alarmBotMove(token,movement,operation));});
  Hooks.on('createToken',token=>{if(writer())run(alarmBotMove(token,null,{created:true}));});
  const reconcile=()=>{if(writer())for(const scene of game.scenes)for(const region of scene.regions)if(stateOf(region))run(reconcileAlarm(region));};
  Hooks.once('ready',reconcile);Hooks.on('canvasReady',reconcile);
  Hooks.on('updateWorldTime',()=>{if(writer())for(const scene of game.scenes)for(const region of scene.regions){
    const state=region.flags?.[NS]?.[ALARM_BOT];
    if(state?.version===1&&state.expiresAt<=game.time.worldTime&&!state.pendingEntries?.length
      &&(!state.event||['complete','reviewed'].includes(state.event.stage)))run(scene.deleteEmbeddedDocuments('Region',[region.id]));
  }});
  Hooks.on('getHeaderControlsRegionConfig',(app,controls)=>{
    const region=app.document;if(!writer()||region.flags?.[NS]?.[ALARM_BOT]?.version!==1)return;
    controls.push({label:words('Reposition'),icon:'fa-solid fa-location-dot',onClick:()=>reconcileAlarm(region,{reposition:true})});
    controls.push({label:words('Review'),icon:'fa-solid fa-clipboard-check',onClick:()=>reviewAlarm(region)});
  });
  for(const sheet of ['AzerothCharacterSheet','AzerothNpcSheet'])Hooks.on(`getHeaderControls${sheet}`,(app,controls)=>{
    const actor=app.actor??app.document,receipt=actor?.getFlag?.(NS,RECEIPT);
    if(writer()&&receipt&&!['complete','reviewed'].includes(receipt.stage))controls.push({label:words('Review'),icon:'fa-solid fa-clipboard-check',onClick:()=>reviewAlarmDeployment(actor)});
  });
  Hooks.on('renderChatMessageHTML',(message,html)=>{
    if(!writer())return;
    for(const button of html.querySelectorAll('[data-alarm-wake]'))button.addEventListener('click',async()=>{
      const mark=message.flags?.[NS]?.alarmBotEvent,region=mark&&resolve(mark.regionUuid),state=stateOf(region);
      if(!state||mark.id!==button.dataset.alarmWake||state.event?.id!==mark.id)return;
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('DeclareWake')},content:`<p>${words('OrdinaryWake')}</p>`});
      if(yes&&writer()&&stateOf(region)?.event?.id===mark.id)await ChatMessage.create({content:`<p>${words('AwakeDeclared')}</p>`});
    });
  });
}
export async function reviewAlarm(region){
  return serial(region,async()=>{
    if(!writer()||!present(region))return false;
    const state=region.flags?.[NS]?.[ALARM_BOT],before=JSON.stringify(state);
    if(!state?.pendingEntries?.length&&(!state?.event||['complete','reviewed'].includes(state.event.stage)))return false;
    const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Review')},content:`<p>${words('ReviewHelp')}</p><pre>${foundry.utils.escapeHTML(before)}</pre>`});
    if(!yes||!writer()||JSON.stringify(region.flags?.[NS]?.[ALARM_BOT])!==before)return false;
    await save(region,{...state,event:{...state.event,stage:'reviewed'},pendingEntries:[],inside:occupants(region).map(t=>t.uuid)});return true;
  });
}
export async function reviewAlarmDeployment(actor){
  if(!writer()||deploying.has(actor.uuid))return false;
  const receipt=actor.getFlag(NS,RECEIPT),before=JSON.stringify(receipt);
  if(!receipt||['complete','reviewed'].includes(receipt.stage))return false;
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Review')},content:`<p>${words('ReviewHelp')}</p><pre>${foundry.utils.escapeHTML(before)}</pre>`});
  if(!yes||!writer()||deploying.has(actor.uuid)||JSON.stringify(actor.getFlag(NS,RECEIPT))!==before)return false;
  await actor.setFlag(NS,RECEIPT,{...receipt,stage:'reviewed'});return true;
}
