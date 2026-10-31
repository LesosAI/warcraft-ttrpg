import { GEYSER as SPEC } from "../rules/geyser.mjs";
import { forceMove } from "./forced-movement.mjs";
import { inflictCondition } from "./inflict.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";

/** Adapters for runGeyser, never a public entry point. The owning GM handler
 * authorizes geometry and acknowledges only this operation's forced movement.
 * Every callback runs after its durable claim has been saved by the controller. */
export function geyserTargetAdapters({ actor, source, targets, valid, acceptMovement } = {}) {
  if (!actor?.uuid || source?.actor !== actor || !Array.isArray(targets) || !targets.length
    || targets.some(token => !token?.uuid || !token.actor?.uuid || token.actor === actor)
    || new Set(targets.map(token => token.uuid)).size !== targets.length
    || [valid,acceptMovement].some(fn => typeof fn !== "function")) return null;
  const tokens=new Map(targets.map(token=>[token.uuid,token]));
  const victims=new Map(targets.map(token=>[token.uuid,token.actor]));
  const current=async uuid=>tokens.has(uuid) && source.actor === actor
    && tokens.get(uuid).actor === victims.get(uuid) && await valid(uuid)
    && source.actor === actor && tokens.get(uuid).actor === victims.get(uuid);
  return {
    resist: async uuid => {
      if (!await current(uuid)) return null;
      const victim=victims.get(uuid);
      if (!(victim.system?.health?.value > 0)) return null;
      const { rollResilience }=await import("../dice/workflows.mjs");
      const card=await rollResilience({actor:victim,resilience:SPEC.resist,dc:SPEC.dc,subtitle:SPEC.name});
      const passed=card?.rolls?.[0]?.outcome?.success;
      if (!card?.id || typeof passed !== "boolean") return null;
      // Preserve a completed Test even if geometry changed during the dialog;
      // the controller validates again before it claims any resulting effect.
      return {cardId:card.id,passed};
    },
    push: async uuid => {
      if (!await current(uuid)) return null;
      const victim=victims.get(uuid), token=tokens.get(uuid);
      if (!(victim.system?.health?.value > 0)) return {moved:false,feet:0,reason:"fallen"};
      if ((victim.system?.refuses ?? []).includes("forcedMovement")) return {moved:false,feet:0,reason:"immovable"};
      const from=source.getCenterPoint();
      if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y)) return null;
      const before={x:token.x,y:token.y,elevation:token.elevation,level:token._source?.level};
      const result=await forceMove({token,from,feet:SPEC.push,toward:"away",by:actor});
      if (!result || ["gone","noGM","unchecked","unmeasured"].includes(result.reason)
        || typeof result.moved !== "boolean" || !Number.isFinite(result.feet)) return null;
      if (!await acceptMovement(token,before,result) || source.actor !== actor || token.actor !== victim) return null;
      return {moved:result.moved,feet:result.moved ? result.feet : 0,reason:result.reason ?? null};
    },
    slow: async uuid => {
      if (!await current(uuid)) return null;
      const victim=victims.get(uuid), token=tokens.get(uuid);
      if (!(victim.system?.health?.value > 0)) return {status:"fallen"};
      if ((victim.system?.conditionImmunities ?? []).includes(SPEC.condition)) return {status:"immune"};
      if (victim.statuses?.has(SPEC.condition)) return {status:"existing"};
      const until=untilEndOfNextTurnOrRound(victim);
      if (!until) return null;
      if (!await current(uuid)) return null;
      const result=await inflictCondition({victim,by:actor,id:SPEC.condition,name:token.name,until});
      return result?.landed === true ? {status:"applied"} : result?.reason === "immune" ? {status:"immune"} : null;
    }
  };
}
