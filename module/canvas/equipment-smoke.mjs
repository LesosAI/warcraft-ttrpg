/** Foundry 14.367: PointDarknessSource supplies opaque edges and inside-source
 * sight suppression. Physical smoke ignores light priority suppression only.
 * Nonvisual detection gets a separate LOS preserving ordinary walls/surfaces. */
const NS="azeroth-rpg",sources=new Map(),wrapped=new WeakSet();
const expiring=new Set();
const levelContext=[],visionWrapped=new WeakSet();
const smokeOf=object=>(object?.document??object)?.flags?.[NS]?.equipmentSmoke;
export const smokeGeometry=region=>{const s=region._source??region;return JSON.stringify({shapes:s.shapes,levels:s.levels,elevation:s.elevation,attachment:s.attachment});};
export function smokeRayBlocked(shape,a,b,span={bottom:null,top:null}){
  if(!shape)return false;
  const bottom=span.bottom??-Infinity,top=span.top??Infinity,dz=b.elevation-a.elevation;
  let lo=0,hi=1;
  if(dz===0){if(a.elevation<bottom||a.elevation>=top)return false;}
  else{const ts=[(bottom-a.elevation)/dz,(top-a.elevation)/dz].sort((x,y)=>x-y);lo=Math.max(0,ts[0]);hi=Math.min(1,ts[1]);if(lo>=hi)return false;}
  const from={x:a.x+(b.x-a.x)*lo,y:a.y+(b.y-a.y)*lo},to={x:a.x+(b.x-a.x)*hi,y:a.y+(b.y-a.y)*hi};
  if(shape.contains(from.x,from.y)||shape.contains(to.x,to.y))return true;
  const points=shape.points??[],dx=to.x-from.x,dy=to.y-from.y;
  for(let i=0;i<points.length;i+=2){
    const j=(i+2)%points.length,c={x:points[i],y:points[i+1]},e={x:points[j]-c.x,y:points[j+1]-c.y};
    const cross=dx*e.y-dy*e.x,qx=c.x-from.x,qy=c.y-from.y;
    if(Math.abs(cross)<1e-9)continue;
    const t=(qx*e.y-qy*e.x)/cross,u=(qx*dy-qy*dx)/cross;
    if(t>=0&&t<=1&&u>=0&&u<=1)return true;
  }return false;
}
export function wrapSmokeVisionUpdate(prototype){
  if(!prototype||visionWrapped.has(prototype))return;
  const original=prototype._updateVisionMode;
  if(typeof original!=="function")return;
  // Verified synchronous in 14.367. The native origin omits Level, so pass
  // only that missing context through the native darkness test, including
  // overlapping Levels at the same elevation. Never keep it across an await.
  prototype._updateVisionMode=function(...args){
    levelContext.push(this.level?.id);
    try{return original.apply(this,args);}finally{levelContext.pop();}
  };visionWrapped.add(prototype);
}
export function smokeSourceClass(Base){
  return class EquipmentSmokeSource extends Base {
    get suppressed(){return Object.entries(this.suppression).some(([key,value])=>key!=="light"&&value===true);}
    _getPolygonConfiguration(){return {...super._getPolygonConfiguration(),equipmentIgnoreSmoke:true};}
    testPoint(point){
      const span=this.level?.elevation;
      const level=point.level?.id??point.level??levelContext.at(-1);
      if(level!==this.level?.id)return false;
      if(!span||!Number.isFinite(point.elevation)||point.elevation<(span.bottom??-Infinity)||point.elevation>=(span.top??Infinity))return false;
      return super.testPoint(point);
    }
  };
}
export function smokePolygonClass(Base){
  return class EquipmentSmokePolygon extends Base {
    _testEdgeInclusion(edge,edgeTypes){
      if(this.config.equipmentIgnoreSmoke===true&&smokeOf(edge.object))return false;
      return super._testEdgeInclusion(edge,edgeTypes);
    }
  };
}
export function nonvisualSmokeSource(source,backend,{maxR,testInsideDarkness}){
  const blinded={...source.blinded,darkness:testInsideDarkness(source.origin,{condition:dark=>!smokeOf(dark.object)&&source.priority<=dark.priority})};
  const los=backend.create(source.origin,{...source.los.config,radius:maxR,equipmentIgnoreSmoke:true});
  return new Proxy(source,{get(target,key){
    if(key==="blinded")return blinded;if(key==="los")return los;
    const value=Reflect.get(target,key,target);return typeof value==="function"&&key!=="constructor"?value.bind(target):value;
  }});
}
export function installSmokeDetection(){
  wrapSmokeVisionUpdate(CONFIG.Canvas.visionSourceClass?.prototype);
  const configured=CONFIG.Canvas.polygonBackends;
  for(const key of ["sight","darkness"]){
    const Base=configured[key];
    if(Base&&!Base.equipmentSmoke){const Backend=smokePolygonClass(Base);Backend.equipmentSmoke=true;configured[key]=Backend;}
  }
  const sightType=foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT;
  for(const mode of Object.values(CONFIG.Canvas.detectionModes)){
    if(mode.type===sightType||wrapped.has(mode))continue;
    const original=mode.testVisibility;
    mode.testVisibility=function(source,setting,config){
      if(!sources.size)return original.call(this,source,setting,config);
      const facade=nonvisualSmokeSource(source,configured.sight,{maxR:canvas.dimensions.maxR,
        testInsideDarkness:canvas.effects.testInsideDarkness.bind(canvas.effects)});
      // The cache belongs to this facade; sight's result must never leak into
      // a nonvisual sense or vice versa.
      const isolated={...config,tests:config.tests.map(test=>({...test,los:new Map()}))};
      return original.call(this,facade,setting,isolated);
    };wrapped.add(mode);
  }
}
export function refreshEquipmentSmoke(){
  if(!canvas?.ready)return;
  installSmokeDetection();
  const wanted=new Map([...canvas.scene.regions].filter(region=>{
    const smoke=smokeOf(region);return smoke?.version===1&&smoke.expiresAt>game.time.worldTime
      &&smoke.geometrySnapshot===smokeGeometry(region)&&canvas.scene.levels.has(smoke.levelId);
  }).map(region=>[region.uuid,region]));
  let changed=false;
  for(const [id,source] of sources)if(!wanted.has(id)||source.object!==wanted.get(id)){
    source.destroy();sources.delete(id);changed=true;
  }
  const Source=smokeSourceClass(foundry.canvas.sources.PointDarknessSource);
  for(const [id,region] of wanted){
    const smoke=smokeOf(region),signature=JSON.stringify({smoke,span:canvas.scene.levels.get(smoke.levelId)?.elevation});
    if(sources.get(id)?.equipmentSignature===signature)continue;
    sources.get(id)?.destroy();
    const source=new Source({object:region,sourceId:`equipment-smoke.${region.id}`});
    source.initialize({x:smoke.origin.x,y:smoke.origin.y,elevation:smoke.elevation,level:smoke.levelId,
      bright:20*canvas.scene.grid.size/canvas.scene.grid.distance,dim:0,priority:Number.MAX_SAFE_INTEGER,disabled:false});
    source.add();source.equipmentSignature=signature;sources.set(id,source);changed=true;
  }
  if(changed)canvas.perception.update({initializeVision:true,refreshLighting:true,refreshVision:true});
}
export async function expireEquipmentSmoke(){
  if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id)return;
  const requireWriter=()=>{if(game.users?.activeGM?.id!==game.user.id)throw Error("Smoke writer changed");};
  for(const scene of game.scenes??[])for(const region of [...scene.regions]){
    const smoke=smokeOf(region);
    if(!smoke||smoke.expiresAt>game.time.worldTime||expiring.has(region.uuid))continue;
    expiring.add(region.uuid);
    try{requireWriter();await region.delete();requireWriter();}
    catch(error){console.warn("azeroth-rpg | smoke expiry cleanup",error);}
    finally{expiring.delete(region.uuid);}
  }
}
let registered=false;
export function registerEquipmentSmoke(){
  if(registered)return;registered=true;
  Hooks.on("canvasReady",refreshEquipmentSmoke);
  Hooks.on("updateWorldTime",expireEquipmentSmoke);Hooks.on("ready",expireEquipmentSmoke);Hooks.on("updateUser",expireEquipmentSmoke);
  for(const hook of ["createRegion","updateRegion","deleteRegion","updateWorldTime","updateLevel","deleteLevel"])
    Hooks.on(hook,refreshEquipmentSmoke);
  Hooks.on("canvasTearDown",()=>{for(const source of sources.values())source.destroy();sources.clear();});
}

/** Refuse sight-dependent defence only where the card identifies both scene
 * tokens. A configured nonvisual detection mode may still perceive the striker
 * through its ordinary wall/range/condition tests. Unmeasured play stays GM-led. */
export function smokeObscuresAttack(actor,message,index){
  const row=message?.flags?.[NS]?.targets?.[index],speaker=message?.speaker;
  const scene=game.scenes?.get(row?.sceneId),target=scene?.tokens?.get(row?.tokenId);
  const source=speaker?.scene===scene?.id?scene?.tokens?.get(speaker.token):null;
  if(!scene||canvas?.scene!==scene||!target||target.actor!==actor||!source||target._source.level!==source._source.level)return false;
  const size=scene.grid.size,center=t=>({x:t.x+t.width*size/2,y:t.y+t.height*size/2,elevation:t.elevation});
  const a=center(target),b=center(source);
  const obscured=[...scene.regions].some(region=>{
    const smoke=smokeOf(region);if(!smoke||smoke.levelId!==target._source.level||smoke.expiresAt<=game.time.worldTime)return false;
    const native=sources.get(region.uuid);
    return native&&smoke.geometrySnapshot===smokeGeometry(region)&&smokeRayBlocked(native.shape,a,b,scene.levels.get(smoke.levelId).elevation);
  });
  if(!obscured)return false;
  const vision=target.object?.vision,object=source.object,level=scene.levels.get(source._source.level);
  if(vision&&object&&canvas?.scene===scene){
    const sightType=foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT;
    for(const setting of target.detectionModes??[]){
      const mode=CONFIG.Canvas.detectionModes[setting.id];
      if(setting.enabled&&mode&&mode.type!==sightType
        &&mode.testVisibility(vision,setting,{object,level,tests:[{point:b,level,los:new Map()}]}))return false;
    }
  }
  return true;
}
