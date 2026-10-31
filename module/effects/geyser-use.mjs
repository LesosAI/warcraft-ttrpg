import { GEYSER as SPEC } from "../rules/geyser.mjs";
import { forcedPlan } from "../rules/forced-movement.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { runGeyser } from "./geyser-state.mjs";
import { geyserTargetAdapters } from "./geyser-targets.mjs";
export const GEYSER_QUERY = "azeroth-rpg.geyser";
const busy=new Set();
const gmHere=()=>game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point=(token,pos=token)=>JSON.stringify([pos.x,pos.y,token.elevation,token.width,token.height,token.rotation,token.disposition,token._source?.level]);
const text=key=>game.i18n.localize(`AZEROTH.Geyser.${key}`);

export async function requestGeyser(actor,index) {
  try {
    const {sourceOf}=await import("../applications/roll-dialog.mjs");
    const data={actorUuid:actor.uuid,index,source:sourceOf(actor),requestId:foundry.utils.randomID()};
    const result=gmHere() ? await geyserQueryHandler(data,{user:game.user})
      : await game.users?.activeGM?.query(GEYSER_QUERY,data,{timeout:300000});
    if (!result?.ok && result?.reason !== "cancelled") ui.notifications?.warn(text("Review"));
    return result;
  } catch(error) {
    console.warn("azeroth-rpg | Geyser request",error);ui.notifications?.warn(text("Review"));return null;
  }
}

/** Authorize on the GM. The whole scene snapshot stays fixed except a push
 * acknowledged against the same candidate plan the existing mover uses. */
export async function geyserQueryHandler({actorUuid,index,source,requestId}={}, {user}={}) {
  const refuse=reason=>({ok:false,reason});
  if (!gmHere() || !user?.id || typeof requestId !== "string" || !requestId.trim()) return refuse("gmOrRequest");
  const actor=await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user,"OWNER")) return refuse("owner");
  if (!Number.isInteger(index)) return refuse("ability");
  const scene=game.scenes?.get(source?.sceneId),origin=scene?.tokens.get(source?.tokenId);
  if (!scene || origin?.actor !== actor || !scene.levels?.get(origin._source?.level)) return refuse("source");
  if (busy.has(actor.uuid)) return refuse("busy");
  let consumed=false, selection=null, tokens=[];
  const initial=[...scene.tokens.values()];
  const points=new Map(initial.map(token=>[token,point(token)]));
  const actors=new Map(initial.map(token=>[token,token.actor]));
  const centres=new Map(initial.map(token=>[token,token.getCenterPoint()]));
  const walls=()=>JSON.stringify([...(scene.walls?.values?.() ?? [])].map(wall=>wall._source));
  const wallStamp=walls();
  const clock=()=>{const fight=actor.activeFight?.();return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}`
    : Number.isFinite(game.time?.worldTime) ? `world:${game.time.worldTime}` : null;};
  const started=clock();
  const validate=()=>{
    if (!gmHere() || fromUuidSync(actor.uuid) !== actor || !actor.testUserPermission(user,"OWNER")
      || started === null || clock() !== started || walls() !== wallStamp || game.scenes.get(scene.id) !== scene) return false;
    const rows=actor.system?.creatureAbilities ?? [],row=rows[index],a=row?.automation;
    if (rows.filter(entry=>entry.name === SPEC.name).length !== 1 || row?.name !== SPEC.name || a?.kind !== "utility"
      || a.action !== SPEC.action || a.cost?.amount || a.uses?.max !== 1 || a.uses?.per !== "encounter"
      || a.uses.value !== (consumed ? 0 : 1)) return false;
    if (!(actor.system?.health?.value > 0) || actor.statuses?.has("stunned") || actor.statuses?.has("silenced")
      || realmRefusalFor(actor,"ability") || projectionRefusal(actor,"ability")
      || sleepRefusal(actor,"ability") || despairRefusal(actor,"ability")) return false;
    if (scene.tokens.size !== initial.length || !scene.levels.get(origin._source?.level)) return false;
    if (!initial.every(token=>scene.tokens.get(token.id) === token && token.actor === actors.get(token) && point(token) === points.get(token))) return false;
    return tokens.every(token=>token._source?.level === origin._source?.level && fromUuidSync(token.actor.uuid) === token.actor
      && !realmRefusalFor(token.actor,"ability") && !projectionRefusal(token.actor,"ability"));
  };
  const acceptMovement=(token,before,result)=>{
    if (!tokens.includes(token) || point(token,before) !== points.get(token)) return false;
    let matches=!result.moved && point(token) === points.get(token);
    if (result.moved) {
      const grid=scene.grid;
      const type=grid?.isGridless ? "gridless" : grid?.isHexagonal ? "hex" : "square";
      const plan=forcedPlan({centre:centres.get(token),from:centres.get(origin),feet:SPEC.push,toward:"away",
        grid:{size:Number(grid?.size)||100,distance:Number(grid?.distance)||5,type}});
      matches=plan.ok && plan.steps.some(step=>{
        if (Math.trunc(step.feet) !== result.feet) return false;
        let pos={x:Math.round(before.x+step.dx),y:Math.round(before.y+step.dy)};
        if (type === "hex") {
          if (typeof token.getSnappedPosition !== "function") return false;
          const snap=token.getSnappedPosition(pos);pos={x:Math.round(snap.x),y:Math.round(snap.y)};
        }
        return point(token,pos) === point(token);
      });
    }
    if (!matches) return false;
    const previous=points.get(token);points.set(token,point(token));
    if (!validate()) {points.set(token,previous);return false;}
    return true;
  };
  busy.add(actor.uuid);
  try {
    if (!validate()) return refuse("changed");
    const {chooseOption,spendTurnBudget}=await import("../dice/workflows.mjs");
    selection=await reviewNearbyEnemies({actor,scene,sourceToken:origin,name:SPEC.name,radius:SPEC.radius,
      validOrigin:validate,includeToken:token=>token._source?.level === origin._source?.level,
      payment:text("Payment"),chooseOption:(menu,options,note,settings)=>chooseOption(menu,options.map(option=>option.key === "enemy"
        ? {...option,name:text("Enemy"),description:text("EnemyDescription")} : option.key === "other"
          ? {...option,name:text("Other"),description:text("OtherDescription")} : option),note,settings)});
    if (!selection.ok) return refuse(selection.reason);
    tokens=selection.targets.map(row=>row.token);
    if (!validate() || !selection.valid() || tokens.some(token=>!(token.actor.system?.health?.value > 0)
      || !Number.isFinite(feetApart(origin,token)) || feetApart(origin,token) > SPEC.radius)) return refuse("target");
    const adapters=geyserTargetAdapters({actor,source:origin,targets:tokens,valid:validate,acceptMovement});
    if (!adapters) return refuse("target");
    const result=await runGeyser({actor,requestId,targets:tokens.map(token=>token.uuid),validate,...adapters,pay:async()=>{
      if (!validate() || !selection.valid()) return {paid:false,consumed:false};
      if (!await spendTurnBudget(actor,SPEC.action)) return {paid:false,consumed:false};
      if (!validate()) return {paid:true,consumed:false};
      const rows=foundry.utils.deepClone(actor.system.creatureAbilities);rows[index].automation.uses.value=0;
      await actor.update({"system.creatureAbilities":rows});
      consumed=actor.system.creatureAbilities[index]?.automation?.uses?.value === 0;
      return {paid:true,consumed};
    }});
    if (result.ok) {
      try {await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>Geyser</strong></p><p>${text("Complete")}</p>`,
        flags:{"azeroth-rpg":{kind: "ability",
          source: source ?? null,
          featureKey: "ability:geyser",
          casting: false, success: true,
          targets:tokens.filter(token=>result.results.some(row=>row.targetUuid === token.uuid && !row.passed)).map(token=>({sceneId:scene.id,tokenId:token.id})),
          geyser:{requestId,results:result.results}}}});}catch(error){console.warn("azeroth-rpg | Geyser resolved; feedback unavailable",error);}
    }
    return result;
  } catch(error) {console.warn("azeroth-rpg | Geyser",error);return refuse("writeUncertain");}
  finally {busy.delete(actor.uuid);}
}
