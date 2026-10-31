import {preparePiccoloPerformance} from './piccolo-preparation.mjs';

const resolve=uuid=>{try{return fromUuidSync(uuid);}catch{return null;}};
const point=token=>token?JSON.stringify([token.x,token.y,token.elevation,token._source?.level]):null;

/** Review hearing on the active GM before the caller claims or pays a use.
 * The whole requested selection must remain eligible; a refused recipient is
 * not silently removed. No actor, item or action-budget writes happen here. */
export async function reviewPiccoloPerformance({actor,item,targets=[],validSource=()=>true,choose}={}){
  const gm=game.user;
  const authority=()=>gm?.isGM===true&&game.user===gm&&game.users.activeGM?.id===gm.id&&validSource();
  if(!authority())return {ok:false,reason:'authority'};
  const initial=preparePiccoloPerformance({actor,item,targets,canHear:()=>true});
  if(!initial.ok)return initial;
  const source=resolve(initial.performance.sourceTokenUuid);
  const recipients=initial.performance.targets.map(row=>({row,actor:resolve(row.uuid),
    token:row.ref.sceneId?resolve(`Scene.${row.ref.sceneId}.Token.${row.ref.tokenId}`):null}));
  // Movement or changing walls invalidates a hearing judgment even if both
  // endpoints remain in range. Off-map hearing stays an explicit GM judgment.
  const geometry=()=>JSON.stringify({source:point(source),targets:recipients.map(row=>point(row.token)),
    walls:[...new Set([source?.parent,...recipients.map(row=>row.token?.parent)].filter(Boolean))]
      .map(scene=>[scene.uuid,Array.from(scene.walls??[],wall=>wall.toObject())])});
  const originalGeometry=geometry();
  const itemState=()=>JSON.stringify({system:item.toObject().system,flags:item.flags});
  const originalItem=itemState();
  const valid=()=>authority()&&initial.valid()&&geometry()===originalGeometry&&itemState()===originalItem;
  const select=choose??(await import('../dice/workflows.mjs')).chooseOption;
  const heard=new Set();
  for(const {row,actor:recipient,token} of recipients){
    if(!valid())return {ok:false,reason:'changed'};
    const answer=await select(item,[
      {key:'no',name:game.i18n.localize('AZEROTH.Signature.PiccoloCannotHear'),description:''},
      {key:'yes',name:game.i18n.localize('AZEROTH.Signature.PiccoloCanHear'),description:''}
    ],null,{prompt:game.i18n.format('AZEROTH.Signature.PiccoloHearing',
      {target:token?.name??recipient.name,source:actor.name}),timeoutMs:120000});
    if(!valid())return {ok:false,reason:'changed'};
    if(!answer)return {ok:false,reason:'cancelled'};
    if(answer.key!=='yes')return {ok:false,reason:'hearing'};
    heard.add(row.uuid);
  }
  const prepared=preparePiccoloPerformance({actor,item,targets,canHear:recipient=>heard.has(recipient.uuid)});
  if(!prepared.ok)return prepared;
  return {...prepared,valid:()=>valid()&&prepared.valid()};
}
