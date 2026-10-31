import {castDispersionReaction} from './dispersion-reaction-cast.mjs';
export const DISPERSION_REACTION_QUERY='azeroth-rpg.dispersionReaction';
const scope='azeroth-rpg';
const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const gmHere=()=>game.user?.isGM===true && game.users?.activeGM?.id===game.user.id;
const turnOf=actor=>{const fight=actor.activeFight?.();return fight?.started?`${fight.uuid}:${fight.round}:${fight.turn}`:null;};

export async function dispersionReactionHandler({messageUuid,index,spellUuid,options={}}={}, {user}={}) {
  if(!gmHere() || !user?.active || game.users.get(user.id)!==user || !Number.isInteger(index) || index<0)
    return {ok:false,reason:'request'};
  const message=resolve(messageUuid),f=message?.flags?.[scope],target=f?.targets?.[index];
  const targetActor=()=>target?.sceneId && target?.tokenId
    ? resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`)?.actor
    : !target?.sceneId && !target?.tokenId && target?.actorId?game.actors.get(target.actorId):null;
  const actor=targetActor(),spell=resolve(spellUuid);
  if(message?.documentName!=='ChatMessage' || !actor?.testUserPermission(user,'OWNER'))return {ok:false,reason:'permission'};
  if(spell?.parent!==actor || spell.type!=='spell' || spell.system?.identifier!=='dispersion'
    || spell.system.action!=='reaction')return {ok:false,reason:'spell'};
  if(!options || typeof options!=='object' || Array.isArray(options))return {ok:false,reason:'options'};
  const choices={};
  for(const key of ['modifier','dc','boons','banes','overchannel','augment']) {
    if(options[key]==null)continue;
    if(typeof options[key]!=='number' || !Number.isFinite(options[key]))return {ok:false,reason:'options'};
    choices[key]=options[key];
  }
  if(options.talentLines!=null) {
    if(!Array.isArray(options.talentLines) || !options.talentLines.every(v=>typeof v==='string'))return {ok:false,reason:'options'};
    choices.talentLines=[...options.talentLines];
  }
  if(target.sceneId && target.tokenId)choices.source={sceneId:target.sceneId,tokenId:target.tokenId};
  const now=game.time.worldTime,turn=turnOf(actor),targetSnapshot=JSON.stringify(target),damageSnapshot=JSON.stringify(f.damageByTarget?.[index]);
  const attacker=ChatMessage.getSpeakerActor(message.speaker);
  const current=()=>gmHere() && game.users.get(user.id)===user && user.active
    && resolve(messageUuid)===message && resolve(actor.uuid)===actor && targetActor()===actor
    && resolve(spellUuid)===spell && spell.parent===actor && actor.testUserPermission(user,'OWNER')
    && game.time.worldTime===now && turnOf(actor)===turn
    && JSON.stringify(message.flags?.[scope]?.targets?.[index])===targetSnapshot
    && JSON.stringify(message.flags?.[scope]?.damageByTarget?.[index])===damageSnapshot
    && ChatMessage.getSpeakerActor(message.speaker)===attacker;
  const {reactionStateOf}=await import('../applications/actions.mjs');
  const validate=()=>{
    if(!current())return false;
    const flags=message.flags[scope],row=flags.attackResolution?.targets?.[index],damage=flags.damageByTarget?.[index];
    if(!['attack','spell'].includes(flags.kind) || flags.parry || flags.notAttack || flags.retaliation
      || flags.kind==='spell' && flags.success!==true || row?.targetUuid!==actor.uuid
      || !['pending','dispersing'].includes(row.stage) || row.dispersionAttempted
      || !(damage?.damage>0) || damage.withdrawn || damage.to===0 || actor.system.health?.value<=0
      || actor.statuses?.has('stunned'))return false;
    const state=reactionStateOf(actor,{messageId:message.id,against:attacker,targetIndex:index});
    return !['alreadyReacted','unanswered','spiritRealm','asleep','disoriented','phaseShifted','iceBlocked','dispersed','reactionBarred','seduced']
      .some(key=>state[key]) && (!state.inFight || state.reactionsLeft>0);
  };
  if(!validate())return {ok:false,reason:'ineligible'};
  return castDispersionReaction({message,index,actor,spell,options:choices,validate,current});
}

export async function requestDispersionReaction(message,index,spell,options={}) {
  try {
    // The roll callback includes Actor/Item documents; send only plain choices.
    const choices={};
    for(const key of ['modifier','dc','boons','banes','overchannel','augment','talentLines'])
      if(Object.hasOwn(options,key))choices[key]=options[key];
    const payload={messageUuid:message.uuid,index,spellUuid:spell.uuid,options:choices};
    return gmHere()?await dispersionReactionHandler(payload,{user:game.user})
      : await game.users?.activeGM?.query(DISPERSION_REACTION_QUERY,payload,{timeout:60000}) ?? {ok:false,reason:'gmUnavailable'};
  }catch{return {ok:false,reason:'writeUncertain'};}
}
