import {queueSignatureCard} from './signature-card-queue.mjs';
import {sustainRegionTransferPending} from '../rules/sustain-region-suspension.mjs';
const scope='azeroth-rpg';
export const EVERBURN_DISMISS_QUERY='azeroth-rpg.dismissEverburn';
export function dismissEverburn({messageId}={}, {user}={}){
 const message=game.messages.get(messageId);
 return queueSignatureCard(message,async()=>{
  const f=message?.flags?.[scope];
  const cast=f?.cast,casterUuid=f?.spellLockCaster;
  let caster;try{caster=fromUuidSync(f?.spellLockCaster);}catch{}
  const writer=game.user;
  const valid=()=>writer?.isGM&&game.user===writer&&game.users.activeGM?.id===writer.id
   &&game.messages.get(messageId)===message&&user?.id&&game.users.get(user.id)===user
   &&caster&&(user.isGM||caster.testUserPermission(user,'OWNER'))
   &&message.flags[scope].kind==='spell'&&message.flags[scope].identifier==='everburn'&&message.flags[scope].success===true
   &&message.flags[scope].cast===cast&&message.flags[scope].spellLockCaster===casterUuid&&caster.uuid===casterUuid;
  if(f?.kind!=='spell'||f.identifier!=='everburn'||f.success!==true||!f.cast||!valid())return {ok:false,reason:'context'};
  const regions=()=>[...game.scenes].flatMap(scene=>[...scene.regions].filter(r=>r.flags?.[scope]?.cast===cast&&r.flags[scope].caster===casterUuid));
  if(regions().some(sustainRegionTransferPending))return {ok:false,reason:'transfer'};
  try{
   if(f.everburnDismissed!==true)await message.setFlag(scope,'everburnDismissed',true);
   if(!valid()||message.getFlag(scope,'everburnDismissed')!==true)return {ok:false,reason:'unconfirmed'};
   for(const region of regions()){
    if(!valid()||sustainRegionTransferPending(region))return {ok:false,reason:'changed'};
    await region.delete();
   }
   return {ok:valid()&&regions().length===0};
  }catch{return {ok:false,reason:'uncertain'};}
 });
}
export async function requestEverburnDismiss(message){
 const gm=game.users.activeGM;if(!gm)return {ok:false,reason:'noGM'};
 try{return gm.id===game.user.id?await dismissEverburn({messageId:message.id},{user:game.user})
  :await gm.query(EVERBURN_DISMISS_QUERY,{messageId:message.id},{timeout:15000});}
 catch{return {ok:false,reason:'uncertain'};}
}
