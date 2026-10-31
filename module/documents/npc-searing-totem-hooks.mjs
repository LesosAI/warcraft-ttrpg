import { cleanupNpcSearingTotems } from "./npc-searing-totem.mjs";

let running = null, pending = false;
/** Coalesce bursts, but run again if a document changes during a sweep. */
export function queueNpcSearingCleanup() {
  pending = true;
  if (running) return running;
  running = Promise.resolve().then(async () => {
    try {
      do { pending = false; await cleanupNpcSearingTotems(); } while (pending);
    } catch (error) { console.warn("azeroth-rpg | NPC Searing Totem lifecycle", error); }
    finally { running = null; }
  });
  return running;
}

export function registerNpcSearingTotemHooks() {
  Hooks.once("ready", queueNpcSearingCleanup);
  Hooks.on("updateWorldTime", queueNpcSearingCleanup);
  Hooks.on("updateActor", actor => { if (actor.type === "npc") return queueNpcSearingCleanup(); });
  Hooks.on("deleteActor", queueNpcSearingCleanup);
  Hooks.on("deleteToken", queueNpcSearingCleanup);
  Hooks.on("deleteScene", queueNpcSearingCleanup);
  Hooks.on("userConnected", queueNpcSearingCleanup);
}
