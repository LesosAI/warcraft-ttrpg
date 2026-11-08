import {PARACHUTE_ACTION,PARACHUTE_FALL,parachuteState,glideAllowance,horizontalGlide} from '../rules/parachute.mjs';
import {squareFeet} from '../rules/movement.mjs';
import {creaturesWithin} from '../canvas/engaged.mjs';
import {realmRefusalFor} from './spirit-realm.mjs';
import {refuseDispersion} from './dispersion-protection.mjs';
import {refuseAncientDespair} from './ancient-despair-refusal.mjs';
import {guardPendingCustodyItem} from '../rules/item-custody-guard.mjs';
export const PARACHUTE_QUERY='azeroth-rpg.parachute';
const NS='azeroth-rpg',RECEIPT='parachuteReceipt',busy=new Set(),permissions=new WeakMap();
const writer=()=>game.user?.isGM===true&&game.users?.activeGM?.id===game.user.id;
const words=key=>game.i18n.localize(`AZEROTH.Parachute.${key}`);
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const requireWriter=()=>{if(!writer())throw Error('Parachute writer changed');};
const effectsOf=actor=>[...(actor?.effects??[])].filter(parachuteState);
const featureOf=item=>item?.type==='feature'&&item.getFlag(NS,'feature')?.gadget==='parachute-cloak';
const snapshot=token=>({x:token.x,y:token.y,elevation:token.elevation,level:token.level});
const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.elevation===b.elevation&&a.level===b.level;
const present=token=>token?.parent?.tokens?.get?.(token.id)===token;
const roundOf=(actor,state)=>{
  const fight=actor.activeFight?.();
  return fight?.started?`${fight.uuid??fight.id}:${fight.round}`:`fall:${state.manualRound??0}`;
};
const eligible=actor=>!realmRefusalFor(actor,'feature')&&!refuseDispersion(actor,'gear')
  &&!refuseAncientDespair(actor,'feature')&&!actor.refuseForcedShape?.('feature');
function nearby(token){
  if(!present(token))return [];
  return creaturesWithin(token.actor,10,{from:token.object??token,who:'ally'})
    .map(row=>row.token.document??row.token).filter(t=>present(t)&&t.parent===token.parent&&t.level===token.level);
}
function measured(token,to){
  if(!horizontalGlide(snapshot(token),to))return null;
  try{
    const value=token.measureMovementPath([{...snapshot(token),action:PARACHUTE_ACTION},{...to,action:PARACHUTE_ACTION}],{cost:squareFeet});
    const distance=value.waypoints?.[1]?.backward?.cost;
    return Number.isFinite(distance)&&distance>=0?distance:null;
  }catch{return null;}
}
async function save(actor,receipt){
  requireWriter();await actor.setFlag(NS,RECEIPT,structuredClone(receipt));requireWriter();
  if(JSON.stringify(actor.getFlag(NS,RECEIPT))!==JSON.stringify(receipt))throw Error('Parachute receipt changed');
}
async function request(data){
  try{return writer()?await parachuteQueryHandler(data,{user:game.user})
    :await game.users?.activeGM?.query(PARACHUTE_QUERY,data,{timeout:60000})??{ok:false};}
  catch(error){console.warn('azeroth-rpg | Parachute request uncertain',error);return {ok:false,pending:true};}
}
export async function useParachute({actor,item,source}={}){
  if(!actor||!featureOf(item))return null;
  const explicit=source?.sceneId&&source?.tokenId;
  const token=explicit?game.scenes?.get(source.sceneId)?.tokens?.get(source.tokenId)
    :source?.document??source??actor.token??actor.getActiveTokens?.(true)?.[0]?.document;
  if(explicit&&!token){ui.notifications?.warn(words('Refused'));return null;}
  const result=await request({operation:'deploy',actorUuid:actor.uuid,itemId:item.id,tokenUuid:token?.uuid,
    requestId:foundry.utils.randomID(32),uses:item.system.uses?.value});
  if(!result.ok)ui.notifications?.warn(words(result.pending?'Uncertain':'Refused'));
  return result;
}
export async function landParachute(actor){
  const ids=[...actor.effects].filter(e=>e.flags?.[NS]?.[PARACHUTE_FALL]?.version===1).map(e=>e.id);
  if(!ids.length)return true;
  if(!writer()){
    const result=await request({operation:'land',actorUuid:actor.uuid,requestId:foundry.utils.randomID(32)});
    if(!result.ok)ui.notifications?.warn(words('Uncertain'));
    return result.ok===true;
  }
  if(ids.length)await actor.deleteEmbeddedDocuments('ActiveEffect',ids);
  requireWriter();return ![...actor.effects].some(e=>ids.includes(e.id));
}
/** The pre-move capability is GM-local; serialized flags/options never grant it. */
export function parachuteMovementAllowed(token,movement){
  const path=movement?.passed?.waypoints??[];
  if(!path.some(w=>w.action===PARACHUTE_ACTION))return true;
  const p=permissions.get(token);
  if(!writer()||!p||!p.valid()||!same(snapshot(token),p.from)||!same(movement.origin??{},p.from)||!path.length)return false;
  let previous=0;
  const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y,length=dx*dx+dy*dy;
  for(const w of path){
    if(w.action!==PARACHUTE_ACTION||!horizontalGlide(p.from,w))return false;
    const x=w.x-p.from.x,y=w.y-p.from.y,along=x*dx+y*dy;
    if(along<previous||along>length+0.001||Math.abs(x*dy-y*dx)>0.001)return false;
    previous=along;
  }
  return previous>0;
}
export async function parachuteQueryHandler(data={}, {user}={}){
  if(!writer()||!user?.active||game.users.get(user.id)!==user)return {ok:false};
  const actor=resolve(data.actorUuid);
  if(!actor||!actor.testUserPermission(user,'OWNER')||busy.has(actor.uuid)
    ||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??''))return {ok:false};
  busy.add(actor.uuid);
  let receipt=null;
  const current=()=>writer()&&user.active&&game.users.get(user.id)===user&&resolve(actor.uuid)===actor&&actor.testUserPermission(user,'OWNER');
  try{
    if(data.operation==='land'){
      const yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Land')},
        content:`<p>${words('ConfirmLand')}</p><p>${foundry.utils.escapeHTML(actor.name)}</p>`});
      if(!yes||!current())return {ok:false};
      return {ok:await landParachute(actor)};
    }
    const old=actor.getFlag(NS,RECEIPT);
    if(old&&!['complete','reviewed'].includes(old.stage))return {ok:false,pending:true};
    if(old?.requestId===data.requestId)return {ok:true,already:true};
    if(data.operation==='deploy'){
      const item=actor.items.get(data.itemId),token=resolve(data.tokenUuid);
      const sourceValid=(uses=data.uses)=>current()&&featureOf(item)&&actor.items.get(item.id)===item&&item.parent===actor
        &&guardPendingCustodyItem(item).ok&&eligible(actor)&&(token?present(token)&&token.actor===actor:!data.tokenUuid)
        &&Number.isInteger(data.uses)&&data.uses>0&&item.system.uses?.value===uses;
      const valid=()=>sourceValid();
      if(!valid()||!/^[A-Za-z0-9]{16,64}$/.test(data.requestId??''))return {ok:false};
      const tokens=token?[...new Map([token,...nearby(token)].map(t=>[t.actor.uuid,t])).values()]:[];
      const positions=tokens.map(t=>[t,snapshot(t)]);
      let recipients=tokens.map(t=>({tokenUuid:t.uuid,actorUuid:t.actor.uuid,stage:'pending'})),yes;
      if(token)yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Deploy')},content:`<p>${words('ConfirmFall')}</p><p>${tokens.map(t=>foundry.utils.escapeHTML(t.name??t.actor.name)).join(', ')}</p>`});
      else{
        // No scene geometry is invented. The GM identifies both the actual fall
        // and the allies within ten feet, exactly as the table would off-map.
        const candidates=[...(game.actors??[])].filter(a=>a!==actor&&resolve(a.uuid)===a);
        const selected=await foundry.applications.api.DialogV2.prompt({window:{title:words('Deploy')},
          content:`<p>${words('ConfirmUnmeasured')}</p><p>${foundry.utils.escapeHTML(actor.name)}</p>${candidates.map(a=>`<label><input type="checkbox" name="ally" value="${foundry.utils.escapeHTML(a.uuid)}">${foundry.utils.escapeHTML(a.name)}</label>`).join('')}`,
          ok:{callback:(_event,button)=>[...button.form.querySelectorAll('input[name="ally"]:checked')].map(input=>input.value)},rejectClose:false});
        yes=Array.isArray(selected)&&selected.every(uuid=>candidates.some(a=>a.uuid===uuid&&resolve(uuid)===a));
        recipients=[actor.uuid,...new Set(selected??[])].map(actorUuid=>({actorUuid,tokenUuid:null,stage:'pending'}));
      }
      if(!yes||!valid()||positions.some(([t,at])=>!present(t)||!same(snapshot(t),at))
        ||tokens.some(t=>t!==token&&!nearby(token).includes(t)))return {ok:false};
      receipt={version:1,requestId:data.requestId,operation:'deploy',stage:'reserved',targets:recipients};
      await save(actor,receipt);
      const {spendTurnBudget}=await import('../dice/workflows.mjs');
      if(!valid())throw Error('Parachute source changed');
      if(!await spendTurnBudget(actor,'reaction')){receipt.stage='complete';receipt.refused=true;await save(actor,receipt);return {ok:false};}
      requireWriter();receipt.stage='reactionPaid';await save(actor,receipt);
      if(!valid()||positions.some(([t,at])=>!present(t)||!same(snapshot(t),at)))throw Error('Parachute deployment changed after payment');
      await item.update({'system.uses.value':data.uses-1});requireWriter();
      if(!sourceValid(data.uses-1))throw Error('Parachute counter/source uncertain');
      receipt.stage='paid';await save(actor,receipt);
      for(const row of receipt.targets){
        const target=row.tokenUuid?resolve(row.tokenUuid):null,targetActor=resolve(row.actorUuid);
        const recipientValid=()=>sourceValid(data.uses-1)&&targetActor&&resolve(row.actorUuid)===targetActor
          &&(!token||(present(target)&&target.actor===targetActor&&target.parent===token.parent&&target.level===token.level
          &&(target===token||nearby(token).includes(target))));
        if(!recipientValid())throw Error('Parachute recipient changed');
        row.stage='creating';await save(actor,receipt);
        if(!recipientValid())throw Error('Parachute recipient changed before write');
        if(effectsOf(targetActor).length){row.stage='alreadyCovered';await save(actor,receipt);continue;}
        const fall={version:1,activationId:data.requestId,tokenUuid:target?.uuid??null,sourceActorUuid:actor.uuid,manualRound:0,round:null,spent:0};
        const created=await targetActor.createEmbeddedDocuments('ActiveEffect',[{name:item.name,img:item.img,type:'base',origin:item.uuid,
          flags:{[NS]:{[PARACHUTE_FALL]:fall}}}]);
        requireWriter();if(created.length!==1||created[0].parent!==targetActor||targetActor.effects.get(created[0].id)!==created[0]
          ||JSON.stringify(parachuteState(created[0]))!==JSON.stringify(fall))throw Error('Parachute carrier unconfirmed');
        row.stage='applied';row.effectUuid=created[0].uuid;await save(actor,receipt);
      }
    }else if(data.operation==='glide'){
      const effect=resolve(data.effectUuid),state=parachuteState(effect),token=state&&resolve(state.tokenUuid);
      const valid=()=>current()&&effect.parent===actor&&actor.effects.get(effect.id)===effect&&parachuteState(effect)===state
        &&present(token)&&token.actor===actor&&eligible(actor);
      if(!state||!valid()||!horizontalGlide(snapshot(token),data.to))return {ok:false};
      const round=roundOf(actor,state),from=snapshot(token),feet=measured(token,data.to);
      if(!(feet>0)||feet>glideAllowance(state,{round,speed:actor.system.speed})+1e-8)return {ok:false};
      receipt={version:1,requestId:data.requestId,operation:'glide',stage:'moving',effectUuid:effect.uuid,from,to:data.to,feet,round,
        baseSpent:state.round===round?state.spent??0:0};
      await save(actor,receipt);
      const still=()=>valid()&&roundOf(actor,state)===round&&same(snapshot(token),from)
        &&measured(token,data.to)===feet&&feet<=glideAllowance(state,{round,speed:actor.system.speed})+1e-8;
      if(!still())throw Error('Parachute glide changed');
      permissions.set(token,{from,to:data.to,valid:still});
      let moved;
      try{moved=await token.move({...data.to,action:PARACHUTE_ACTION});}finally{permissions.delete(token);}
      requireWriter();
      if(!moved&&same(snapshot(token),from)){receipt.stage='complete';receipt.refused=true;await save(actor,receipt);return {ok:false};}
      // A partial/cancelled walk is charged only for the actual horizontal segment.
      const actual=snapshot(token),travelled=measured({...token,x:from.x,y:from.y,elevation:from.elevation,level:from.level,
        measureMovementPath:token.measureMovementPath.bind(token)},actual);
      const dx=data.to.x-from.x,dy=data.to.y-from.y,x=actual.x-from.x,y=actual.y-from.y;
      if(!current()||!horizontalGlide(from,actual)||!(travelled>=0)||travelled>feet+1e-8
        ||Math.abs(x*dy-y*dx)>0.001||x*dx+y*dy<0||x*dx+y*dy>dx*dx+dy*dy+0.001)throw Error('Parachute movement outcome uncertain');
      if(!parachuteState(effect)||roundOf(actor,state)!==round)throw Error('Parachute fall changed during movement');
      receipt.stage='moved';receipt.feet=travelled;await save(actor,receipt);
      const next={...state,round,spent:(state.round===round?state.spent??0:0)+travelled};
      await effect.setFlag(NS,PARACHUTE_FALL,next);requireWriter();
      if(actor.effects.get(effect.id)!==effect||JSON.stringify(parachuteState(effect))!==JSON.stringify(next))throw Error('Parachute glide ledger unconfirmed');
    }else return {ok:false};
    receipt.stage='complete';await save(actor,receipt);return {ok:true};
  }catch(error){
    console.warn('azeroth-rpg | Parachute needs GM review',error);
    if(receipt&&writer())try{receipt.holdStage=receipt.stage;receipt.stage='uncertain';await save(actor,receipt);}catch(secondary){console.warn(secondary);}
    ui.notifications?.warn(words('Uncertain'));return {ok:false,pending:true};
  }finally{busy.delete(actor.uuid);}
}
export async function glideParachute(effect){
  const state=parachuteState(effect),token=state&&resolve(state.tokenUuid);if(!token)return false;
  const {pickPoint}=await import('../canvas/place.mjs');
  let to=null;
  const point=await pickPoint({sceneId:token.parent.id,hint:words('Pick'),accept:p=>{
    const grid=token.parent.grid,position={x:p.x-(token.width??1)*(grid.sizeX??grid.size)/2,y:p.y-(token.height??1)*(grid.sizeY??grid.size)/2};
    to={...snapshot(token),...(token.getSnappedPosition?.(position)??position)};
    const feet=measured(token,to);return feet>0&&feet<=glideAllowance(parachuteState(effect),{round:roundOf(effect.parent,state),speed:effect.parent.system.speed});
  }});
  return point&&to?request({operation:'glide',actorUuid:effect.parent.uuid,effectUuid:effect.uuid,to,requestId:foundry.utils.randomID(32)}):false;
}
export function registerParachute(){
  // V14.367 TokenMovementActionConfigDescriptor: canSelect:false keeps ordinary
  // drags ordinary; this voluntary action retains walls, area entry and OA.
  CONFIG.Token.movement.actions[PARACHUTE_ACTION]={label:'AZEROTH.Parachute.Glide',icon:'fa-solid fa-parachute-box',order:9,canSelect:false,terrainAction:'fly'};
  CONFIG.queries[PARACHUTE_QUERY]=parachuteQueryHandler;
  Hooks.on('preMoveToken',parachuteMovementAllowed);
  for(const sheet of ['AzerothCharacterSheet','AzerothNpcSheet'])Hooks.on(`getHeaderControls${sheet}`,(app,controls)=>{
    const actor=app.actor??app.document,receipt=actor?.getFlag?.(NS,RECEIPT);
    if(writer()&&receipt&&!['complete','reviewed'].includes(receipt.stage))
      controls.push({label:words('Review'),icon:'fa-solid fa-clipboard-check',onClick:()=>reviewParachute(actor)});
  });
  Hooks.on('getHeaderControlsActiveEffectConfig',(app,controls)=>{
    const effect=app.document,state=parachuteState(effect);if(!state)return;
    if(effect.parent?.isOwner)controls.push({label:words('Glide'),icon:'fa-solid fa-wind',onClick:()=>glideParachute(effect)});
    if(!writer())return;
    controls.push({label:words('Land'),icon:'fa-solid fa-shoe-prints',onClick:async()=>{
      if(await foundry.applications.api.DialogV2.confirm({window:{title:words('Land')},content:`<p>${words('ConfirmLand')}</p>`}))await landParachute(effect.parent);
    }});
    controls.push({label:words('NextRound'),icon:'fa-solid fa-forward',onClick:async()=>{
      if(effect.parent.activeFight?.()?.started||busy.has(effect.parent.uuid))return;
      if(await foundry.applications.api.DialogV2.confirm({window:{title:words('NextRound')},content:`<p>${words('ConfirmRound')}</p>`})){
        if(writer()&&parachuteState(effect)===state)await effect.setFlag(NS,PARACHUTE_FALL,{...state,manualRound:(state.manualRound??0)+1});
      }
    }});
    controls.push({label:words('Review'),icon:'fa-solid fa-clipboard-check',onClick:()=>reviewParachute(effect.parent)});
  });
}
export async function reviewParachute(actor){
  if(!writer()||busy.has(actor.uuid))return false;
  const receipt=actor.getFlag(NS,RECEIPT),before=JSON.stringify(receipt);
  if(!receipt||['complete','reviewed'].includes(receipt.stage))return false;
  const effect=receipt.operation==='glide'?resolve(receipt.effectUuid):null;
  const state=parachuteState(effect),stateBefore=JSON.stringify(state);
  const content=`<p>${words('ReviewHelp')}</p><pre>${foundry.utils.escapeHTML(before)}</pre>`;
  let yes,actualFeet=null;
  if(state){
    actualFeet=await foundry.applications.api.DialogV2.prompt({window:{title:words('Review')},
      content:`${content}<label>${words('ReviewFeet')}<input name="feet" type="number" min="0" max="${receipt.feet}" step="any" required></label>`,
      ok:{callback:(_event,button)=>Number(button.form.elements.namedItem('feet').value)},rejectClose:false});
    yes=actualFeet!==null&&Number.isFinite(actualFeet)&&actualFeet>=0&&actualFeet<=receipt.feet;
  }else yes=await foundry.applications.api.DialogV2.confirm({window:{title:words('Review')},content});
  if(!yes||!writer()||busy.has(actor.uuid)||JSON.stringify(actor.getFlag(NS,RECEIPT))!==before
    ||JSON.stringify(parachuteState(effect))!==stateBefore)return false;
  busy.add(actor.uuid);
  try{
    if(state){
      // Reconcile from the pre-movement ledger, never add a second charge if
      // the original effect write landed but its acknowledgement was lost.
      const reconciled={...state,round:receipt.round,spent:(receipt.baseSpent??0)+actualFeet};
      await effect.setFlag(NS,PARACHUTE_FALL,reconciled);requireWriter();
      if(JSON.stringify(parachuteState(effect))!==JSON.stringify(reconciled))throw Error('Parachute review ledger uncertain');
    }
    await save(actor,{...receipt,stage:'reviewed',reviewedFeet:actualFeet});return true;
  }finally{busy.delete(actor.uuid);}
}
