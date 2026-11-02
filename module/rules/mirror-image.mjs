/** 07, Mirror Image: three images; each qualifying hit spends one.
 * Keep remaining images on the held cast so transfer never recreates them. */
export const MIRROR_IMAGE_COUNT=3;
export function mirrorImageBanes(entries=[]){
 return Array.isArray(entries)&&entries.some(entry=>(mirrorImageState(entry)?.remaining??0)>0)?1:0;
}
export function mirrorImageState(entry){
 if(!entry || entry.identifier!=='mirror-image' || typeof entry.cast!=='string'||!entry.cast.trim()
  || entry.sustainTransfer!=null || !Number.isInteger(entry.mirrorImages)
  || entry.mirrorImages<0 || entry.mirrorImages>MIRROR_IMAGE_COUNT)return null;
 return {cast:entry.cast,remaining:entry.mirrorImages,banes:entry.mirrorImages>0?1:0};
}

/** Input hit/attack facts must come from the resolved attack, not a client
 * declaration. This only plans state; the caller must claim the hit first. */
export function consumeMirrorImage({entry,hit=false,attack=false}={}){
 const state=mirrorImageState(entry);
 if(!state)return null;
 const consumed=hit===true&&attack===true&&state.remaining>0;
 const remaining=state.remaining-(consumed?1:0);
 return {...state,consumed,preventDamage:consumed,remaining,banes:remaining>0?1:0,
  entry:{...structuredClone(entry),mirrorImages:remaining}};
}
