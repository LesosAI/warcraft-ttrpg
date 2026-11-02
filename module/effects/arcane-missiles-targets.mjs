import {feetApart} from '../canvas/footprints.mjs';
import {arcaneMissilesTargets} from '../rules/arcane-missiles.mjs';
/** Tokenless targeting follows the ordinary table-adjudicated distance path. */
export function validArcaneMissilesTargets(targets=[]){
 const [first,second]=targets;
 const token=ref=>ref?.sceneId&&ref?.tokenId?game.scenes.get(ref.sceneId)?.tokens.get(ref.tokenId):null;
 const a=token(first),b=token(second);
 if(targets.length===2&&((first.sceneId||first.tokenId)&&!a||(second.sceneId||second.tokenId)&&!b))return false;
 if(a&&b&&a.parent!==b.parent)return false;
 return arcaneMissilesTargets({count:targets.length,distinct:!second||first.actorId!==second.actorId,
  distance:a&&b?feetApart(a,b):null});
}
