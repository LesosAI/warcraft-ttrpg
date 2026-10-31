import {AZEROTH} from '../config.mjs';
import {isAntivenom,antivenomJudgement} from '../rules/antivenom.mjs';
import {spendOne} from '../rules/consumables.mjs';
import {plainEffect,archmageCasters,dispelGatesOn} from './dispel.mjs';
import {endNullifiedEffect} from './nullifier.mjs';
import {acquireConsumableUse} from './consumable-use-lock.mjs';
import {refuseDispersion} from './dispersion-protection.mjs';
import {refuseAncientDespair} from './ancient-despair-refusal.mjs';
import {realmRefusalFor} from './spirit-realm.mjs';

export const ANTIVENOM_QUERY='azeroth-rpg.antivenom';
const FLAG='antivenomUse';
const words=key=>game.i18n.localize(`AZEROTH.Use.Antivenom.${key}`);
const itemState=item=>JSON.stringify({name:item.name,use:item.system.use,quantity:item.system.quantity});
const effectState=effect=>JSON.stringify(effect.toObject());
const judgement=(effect,classification=null)=>antivenomJudgement(plainEffect(effect),
  {classification,archmage:archmageCasters([plainEffect(effect)])});
const eligible=(actor,effect,classification=null)=>!!effect&&judgement(effect,classification).ok&&!dispelGatesOn(actor,[effect.id]).length;
const barred=actor=>refuseDispersion(actor,'gear')||refuseAncientDespair(actor,'gear')||realmRefusalFor(actor,'gear');

export function antivenomReviewState(actor) {
  const receipt=actor?.getFlag('azeroth-rpg',FLAG)??null;
  const pending=!!receipt&&!['complete','reviewed'].includes(receipt.stage);
  const item=actor?.items.get(receipt?.itemId),effect=actor?.effects.get(receipt?.effectId);
  const budget=actor?.activeFight?.()?.getCombatantsByActor(actor)?.[0]?.budget??null;
  const current={receipt,item:item?.toObject()??null,effect:effect?.toObject()??null,budget};
  return {pending,receipt,quantity:item?.system.quantity??0,effectPresent:!!effect,budget,
    expected:JSON.stringify(current)};
}

/** Review closes an uncertain attempt only after the GM settles its actual consequences. */
export async function reviewAntivenom(actor,{expected,acknowledged=false}={}) {
  if(!game.user?.isGM||game.users.activeGM?.id!==game.user.id||acknowledged!==true)return {ok:false,reason:'permission'};
  const release=acquireConsumableUse(actor);if(!release)return {ok:false,reason:'busy'};
  try{
    const state=antivenomReviewState(actor);
    if(!state.pending||state.expected!==expected)return {ok:false,reason:'changed'};
    const writer=state.receipt.writerId;
    if(writer&&writer!==game.user.id&&game.users.get(writer)?.active)return {ok:false,reason:'writerActive'};
    await actor.setFlag('azeroth-rpg',FLAG,{...state.receipt,stage:'reviewed',reviewedBy:game.user.id,reviewedAt:Date.now()});
    return {ok:true};
  }finally{release();}
}

/** The owner's chooser precedes every authoritative mutation. */
export async function useAntivenom(actor,item) {
  if(!actor?.isOwner||!isAntivenom(item?.system?.use)||barred(actor))return null;
  const release=acquireConsumableUse(actor);
  if(!release){ui.notifications.warn(game.i18n.localize('AZEROTH.Use.Busy'));return null;}
  let data;
  try{
    const state=itemState(item);
    const options=[...actor.effects].flatMap(effect=>{
      const judged=judgement(effect),review=judged.reason==='needsReview';
      if((!judged.ok&&!review)||dispelGatesOn(actor,[effect.id]).length)return [];
      return [{key:effect.id,name:effect.name,description:review?words('NeedsClassification'):'',fingerprint:effectState(effect)}];
    });
    if(!options.length){ui.notifications.warn(words('NoChoice'));return null;}
    const {chooseOption}=await import('../dice/workflows.mjs');
    const pick=await chooseOption(item,options,null,{prompt:words('Choose')});
    if(!pick)return null;
    if(actor.items.get(item.id)!==item||itemState(item)!==state){ui.notifications.warn(game.i18n.localize('AZEROTH.Use.Changed'));return null;}
    data={requestId:foundry.utils.randomID(),actorUuid:actor.uuid,itemId:item.id,effectId:pick.key,
      itemState:state,effectState:pick.fingerprint};
  }finally{release();}
  const result=game.user.isGM?await antivenomQueryHandler(data,{user:game.user}):game.users.activeGM
    ?await game.users.activeGM.query(ANTIVENOM_QUERY,data,{timeout:180000}):{ok:false,reason:'noGM'};
  if(!result.ok){ui.notifications.warn(words(result.pending?'Pending':'Refused'));return null;}
  return game.messages.get(result.messageId)??null;
}

/** One selected poison on an owned actor; the GM rechecks before payment. */
export async function antivenomQueryHandler(data={}, {user=null}={}) {
  const refuse=(reason,pending=false)=>({ok:false,reason,pending});
  if(!game.user?.isGM||(game.users.activeGM&&game.users.activeGM.id!==game.user.id)||!user?.active)return refuse('authority');
  if(typeof data.actorUuid!=='string'||typeof data.requestId!=='string'||!data.requestId||data.requestId.length>64)return refuse('request');
  const actor=await fromUuid(data.actorUuid);
  if(actor?.documentName!=='Actor'||!actor.testUserPermission(user,'OWNER'))return refuse('owner');
  const release=acquireConsumableUse(actor);
  if(!release)return refuse('busy');
  let claimed=false;
  try{
    const prior=actor.getFlag('azeroth-rpg',FLAG);
    if(prior&&!['complete','reviewed'].includes(prior.stage))return refuse('pending',true);
    if(prior?.requestId===data.requestId)return prior.stage==='complete'?{ok:true,messageId:prior.messageId}:refuse('reviewed');
    const item=actor.items.get(data.itemId),effect=actor.effects.get(data.effectId);
    const unchanged=()=>game.users.activeGM?.id===game.user.id&&user.active&&actor.testUserPermission(user,'OWNER')&&actor.items.get(data.itemId)===item
      &&item?.type==='gear'&&isAntivenom(item.system.use)&&itemState(item)===data.itemState
      &&!!effect&&actor.effects.get(data.effectId)===effect&&effectState(effect)===data.effectState&&!barred(actor);
    if(!unchanged())return refuse('changed');
    if(dispelGatesOn(actor,[effect.id]).length)return refuse('gateRequired');
    let classification=null;
    if(judgement(effect).reason==='needsReview'){
      const {chooseOption}=await import('../dice/workflows.mjs');
      const pick=await chooseOption(item,[{key:'cancel',name:words('Cancel'),description:''},
        {key:'poison',name:words('ClassifyPoison'),description:words('ClassificationEffect')}],null,
      {prompt:game.i18n.format('AZEROTH.Use.Antivenom.Classify',{actor:actor.name,effect:effect.name})});
      if(pick?.key!=='poison')return refuse('cancelled');
      // Only this active-GM choice can supply classification; ignore client fields.
      classification={harmful:true,category:'poison'};
    }
    const valid=()=>unchanged()&&eligible(actor,effect,classification);
    if(!valid())return refuse('changed');
    const held=item.system.quantity??1;
    if(held<=0)return refuse('empty');
    const receipt={requestId:data.requestId,stage:'claimed',userId:user.id,writerId:game.user.id,itemId:item.id,effectId:effect.id,
      itemName:item.name,effectName:effect.name,quantity:held,classification};
    await actor.setFlag('azeroth-rpg',FLAG,receipt);claimed=true;
    if(!valid()){
      await actor.unsetFlag('azeroth-rpg',FLAG);claimed=false;return refuse('changed');
    }
    const {spendTurnBudget}=await import('../dice/workflows.mjs');
    if(!await spendTurnBudget(actor,item.system.use.action)){
      await actor.unsetFlag('azeroth-rpg',FLAG);claimed=false;return refuse('action');
    }
    // From here an uncertain result remains visible on the actor for GM review;
    // never retry payment or choose a replacement poison automatically.
    await actor.setFlag('azeroth-rpg',FLAG,{...receipt,stage:'actionPaid'});
    if(!valid())return refuse('changedAfterPayment',true);
    const itemName=item.name,action=item.system.use.action,spend=spendOne(held);
    if(spend?.delete)await item.delete();
    else if(spend)await item.update({'system.quantity':spend.quantity});
    await actor.setFlag('azeroth-rpg',FLAG,{...receipt,stage:'dosePaid'});
    if(game.users.activeGM?.id!==game.user.id||!user.active||!actor.testUserPermission(user,'OWNER')
      ||actor.effects.get(data.effectId)!==effect||!eligible(actor,effect,classification)||effectState(effect)!==data.effectState||barred(actor))return refuse('changedAfterPayment',true);
    const result=await endNullifiedEffect({dispeller:actor,target:actor,effectId:effect.id,classification});
    if(!result.ok)return refuse(result.reason,true);
    await actor.setFlag('azeroth-rpg',FLAG,{...receipt,stage:'removed',result});
    const content=await foundry.applications.handlebars.renderTemplate('systems/azeroth-rpg/templates/chat/feature-card.hbs',{
      config:AZEROTH,title:itemName,subtitle:actor.name,speakerName:actor.name,action,
      uses:{value:spend?.delete?0:spend?.quantity??held,max:held},rolled:false,targets:[],provenance:[],
      note:game.i18n.format('AZEROTH.Use.Antivenom.Ended',{name:effect.name})
    });
    const card=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,
      flags:{'azeroth-rpg':{kind:'gear',itemId:data.itemId,title:itemName,antivenom:{requestId:data.requestId,effectId:effect.id,result}}}});
    await actor.setFlag('azeroth-rpg',FLAG,{...receipt,stage:'complete',messageId:card.id,result});
    return {ok:true,messageId:card.id};
  }catch(error){
    // Said in words on the requesting client (AZEROTH.Use.Antivenom.Pending or
    // Refused), so a warning here and never a console error (CLAUDE.md §16).
    console.warn('azeroth-rpg | Antivenom use did not finish',error);
    return refuse('interrupted',claimed);
  }finally{release();}
}
