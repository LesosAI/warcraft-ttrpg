/** V14.367 Token.prepareData applies native token changes after detection-mode
 * defaults. Supply only the missing basicSight fallback in derived data; never
 * update Token source, user settings, other modes, or blindness detection. */
import {utilityCapability,UTILITY_DRAUGHT_FLAG} from "../rules/utility-draughts.mjs";
const WRAPPED=Symbol.for("azeroth-rpg.owlVisionPrepare"),states=new WeakMap(),queued=new Set();
const owlEffects=actor=>[...(actor?.effects??[])].filter(e=>e.flags?.["azeroth-rpg"]?.[UTILITY_DRAUGHT_FLAG]?.kind==="darkvision");
const signature=actor=>JSON.stringify(owlEffects(actor).map(e=>[e.id,utilityCapability([e],"darkvision",game.time?.worldTime??0)]));
export function prepareUtilityVision(token){
  if(!utilityCapability(token.actor?.effects,"darkvision",game.time?.worldTime??0))return;
  token._prepareDetectionModes();
  const mode=token.detectionModes.basicSight??={enabled:true,range:60};
  mode.enabled=true;mode.range=Math.max(mode.range??Infinity,60);
}
export function refreshUtilityVision(actor){
  if(!actor)return;
  actor.reset();states.set(actor,signature(actor));
  const seen=new Set();
  for(const scene of game.scenes??[])for(const token of scene.tokens??[]){
    if(token.actor?.uuid!==actor.uuid||seen.has(token.uuid))continue;seen.add(token.uuid);
    token.reset();token.object?.initializeVisionSource();
  }
  globalThis.canvas?.perception?.update({initializeVisionModes:true,refreshVision:true,refreshLighting:true});
}
function queue(actor){
  if(!actor||queued.has(actor))return;queued.add(actor);
  queueMicrotask(()=>{queued.delete(actor);refreshUtilityVision(actor);});
}
export function registerUtilityVision(){
  const prototype=CONFIG.Token?.documentClass?.prototype;
  if(prototype&&!prototype[WRAPPED]){
    const original=prototype.prepareData;
    prototype.prepareData=function(...args){const result=original.apply(this,args);prepareUtilityVision(this);return result;};
    Object.defineProperty(prototype,WRAPPED,{value:true});
  }
  const actors=()=>{
    const found=new Map([...(game.actors??[])].map(a=>[a.uuid,a]));
    for(const scene of game.scenes??[])for(const token of scene.tokens??[])if(token.actor)found.set(token.actor.uuid,token.actor);
    return [...found.values()];
  };
  for(const hook of ["ready","canvasReady"])Hooks.on(hook,()=>{for(const a of actors())if(owlEffects(a).length)queue(a);});
  Hooks.on("updateWorldTime",()=>{for(const a of actors())if(owlEffects(a).length||states.has(a)){
    const next=signature(a);if(states.get(a)!==next)queue(a);
  }});
  for(const hook of ["createActiveEffect","updateActiveEffect","deleteActiveEffect"])Hooks.on(hook,e=>{
    if(e.flags?.["azeroth-rpg"]?.[UTILITY_DRAUGHT_FLAG]?.kind==="darkvision"||states.has(e.parent))queue(e.parent);
  });
}
