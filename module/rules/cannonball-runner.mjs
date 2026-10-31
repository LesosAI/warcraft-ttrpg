import {approvedSignatureValues} from './approved-signature-values.mjs';
import {resolveRecordedDamage} from './damage-record.mjs';
export const CANNONBALL_IDENTIFIER='cannonball-runner';
export const CANNONBALL_RANGE=30;
/** One projectile, not a summon or an Attack Test. Null distance follows the
 * system's off-map convention: range is a table judgment, explicitly reported. */
export function cannonballShot({ownModifiers={},skillRanks={},targetUuid,distance=null}={}){
 if(typeof targetUuid!=='string'||!targetUuid)return {ok:false,reason:'target'};
 if(distance!==null&&(!Number.isFinite(distance)||distance<0||distance>CANNONBALL_RANGE))return {ok:false,reason:'range'};
 const values=approvedSignatureValues(CANNONBALL_IDENTIFIER,{ownModifiers,skillRanks:{tinkering:skillRanks.tinkering??0}});
 if(!values)return {ok:false,reason:'values'};
 return {ok:true,shot:{version:1,identifier:CANNONBALL_IDENTIFIER,targetUuid,range:CANNONBALL_RANGE,
  rangeMeasured:distance!==null,resilience:'reflex',dc:values.dc,damage:values.damage,passedDamage:values.passedDamage}};
}
/** Resolve the saved shot, not the user's current gear. Resistance halves
 * the raw Physical amount before normal mitigation; no attack SL is added. */
export function cannonballDamage(shot,{passed,apByLocation={},immune=[],vulnerable=[],dealtHalved=false}={}){
 if(shot?.version!==1||shot.identifier!==CANNONBALL_IDENTIFIER||!Number.isInteger(shot.damage)||shot.damage<0
  ||typeof passed!=='boolean')return null;
 return resolveRecordedDamage({rating:shot.damage,kind:'physical',location:'body',sl:0,slAddsToDamage:false,
  passedHalf:passed,apByLocation,immune,vulnerable,dealtHalved});
}
