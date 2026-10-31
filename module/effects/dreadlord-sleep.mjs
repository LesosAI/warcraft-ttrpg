/** Sleep owns its carrier; waking never toggles another effect's condition. */
import { SLEEP_FLAG, dreadlordSleepEffect, sleepEligible, sleepHealthObserver } from "../rules/dreadlord-sleep.mjs";
import { untilEndOfNextTurnOrRound } from "./durations.mjs";
import { kindsOfActor } from "./area-strikes.mjs";
const laying = new Set(), waking = new Map();
const observer = sleepHealthObserver();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const state = effect => effect?.flags?.["azeroth-rpg"]?.[SLEEP_FLAG];
const carriers = actor => [...(actor?.effects ?? [])].filter(effect => state(effect)?.version === 1 && state(effect).targetUuid === actor.uuid);
const eligible = actor => sleepEligible({ kinds: kindsOfActor(actor), immunities: actor.system?.conditionImmunities ?? [], health: actor.system?.health?.value });
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;

export async function layDreadlordSleep({ victim, by, valid } = {}) {
  const allowed = () => gmHere() && present(victim) && present(by) && typeof valid === "function" && valid();
  if (!allowed()) return { ok: false, reason: "authority" };
  if (!eligible(victim)) return { ok: false, immune: true, reason: "immune" };
  if (laying.has(victim.uuid) || carriers(victim).length) return { ok: false, reason: "alreadyAsleepOrBusy" };
  laying.add(victim.uuid);
  let effect;
  try {
    const health = victim.system.health.value;
    observer.prime(victim);
    const losses = observer.losses(victim);
    const data = dreadlordSleepEffect({ origin: by.uuid, targetUuid: victim.uuid, timing: untilEndOfNextTurnOrRound(victim) });
    if (!data || !allowed() || !eligible(victim)) return { ok: false, reason: "changed" };
    [effect] = await victim.createEmbeddedDocuments("ActiveEffect", [data]);
    const held = effect && carriers(victim).some(row => row === effect);
    if (!held || !allowed() || !eligible(victim) || victim.system.health.value < health || observer.losses(victim) !== losses) {
      // A hit arriving during creation must not leave a newly sleeping target.
      if (held && gmHere() && present(victim)) await victim.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      return { ok: false, reason: "changed", effectId: effect?.id ?? null };
    }
    return { ok: true, effectId: effect.id };
  } catch (error) {
    console.warn("azeroth-rpg | Sleep effect write could not be confirmed", error);
    return { ok: false, reason: "writeUncertain", effectId: effect?.id ?? null };
  } finally { laying.delete(victim.uuid); }
}

export async function wakeDreadlordSleep(actor, ids = []) {
  if (!gmHere() || !present(actor) || !ids.length) return [];
  const previous = waking.get(actor.uuid) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (!gmHere() || !present(actor)) return [];
    const remove = carriers(actor).filter(effect => ids.includes(effect.id)).map(effect => effect.id);
    if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove);
    return remove;
  });
  waking.set(actor.uuid, task);
  try { return await task; }
  finally { if (waking.get(actor.uuid) === task) waking.delete(actor.uuid); }
}

export function registerDreadlordSleepHooks() {
  const values = collection => collection?.values?.() ?? collection ?? [];
  const prime = () => {
    for (const actor of values(game.actors)) observer.prime(actor);
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) observer.prime(token.actor);
  };
  Hooks.on("ready", prime);
  Hooks.on("canvasReady", prime);
  Hooks.on("createActor", actor => observer.prime(actor));
  Hooks.on("createToken", token => observer.prime(token.actor));
  Hooks.on("createActiveEffect", effect => {
    if (state(effect) && effect.parent?.documentName === "Actor") observer.prime(effect.parent);
  });
  Hooks.on("updateActor", actor => {
    const ids = observer.observe(actor);
    if (!ids.length || !gmHere()) return;
    return wakeDreadlordSleep(actor, ids).catch(error => {
      console.warn("azeroth-rpg | Sleep waking could not be confirmed", error);
      ui.notifications?.warn("Sleep could not be removed after Health loss. Check the target's effects.");
    });
  });
}
