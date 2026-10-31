/** Reconcile channels across every scene, including unviewed synthetic actors. */
import { MIND_FLAY_FLAG, QIRAJI_MIND_FLAY, mindFlayEligible, mindFlayHeld, validMindFlayLink } from "../rules/qiraji-mind-flay.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";

// Creation holds a cast here while its two documents are written. Its adapter
// must reconcile on exit, even after an uncertain or partial write.
export const mindFlayMutations = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const state = effect => effect?.flags?.["azeroth-rpg"]?.[MIND_FLAY_FLAG];
const sustains = actor => actor?.flags?.["azeroth-rpg"]?.sustaining ?? [];
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;

export function mindFlayParticipants(link) {
  if (!validMindFlayLink(link)) return null;
  const scene = game.scenes?.get(link.sceneId);
  const sourceToken = scene?.tokens?.get(link.sourceTokenId), targetToken = scene?.tokens?.get(link.targetTokenId);
  const source = sourceToken?.actor, target = targetToken?.actor;
  if (source?.uuid !== link.sourceUuid || target?.uuid !== link.targetUuid || !present(source) || !present(target)) return null;
  return { scene, sourceToken, targetToken, source, target };
}

/** Synchronous tick guard: stale channel damage must not wait for hook cleanup. */
export function mindFlayChannelLive(link, effect) {
  const pair = mindFlayParticipants(link);
  if (!pair || !effect || !values(pair.target.effects).includes(effect) || effect.disabled || effect.isSuppressed || effect.active === false) return false;
  const { source, target, sourceToken, targetToken } = pair;
  if (!mindFlayHeld(link, sustains(source)) || !mindFlayEligible({ health: target.system?.health?.value, typeMarker: target.system?.typeMarker })
    || !(source.system?.health?.value > 0) || realmRefusalFor(source, "ability") || realmRefusalFor(target, "ability")
    || sleepRefusal(source, "ability") || despairRefusal(source, "ability")
    || source.statuses?.has("stunned") || source.statuses?.has("silenced")) return false;
  const distance = feetApart(sourceToken, targetToken);
  return Number.isFinite(distance) && distance >= 0 && distance <= QIRAJI_MIND_FLAY.feet;
}

function actorsEverywhere() {
  const actors = new Map();
  for (const actor of values(game.actors)) if (present(actor)) actors.set(actor.uuid, actor);
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
    if (present(token.actor)) actors.set(token.actor.uuid, token.actor);
  }
  return [...actors.values()];
}

let queued = Promise.resolve();
export function reconcileMindFlay() {
  const work = async () => {
    if (!gmHere()) return { removedEffects: 0, removedSustains: 0 };
    const result = { removedEffects: 0, removedSustains: 0 };
    const actors = actorsEverywhere();
    for (const target of actors) {
      for (const effect of values(target.effects)) {
        const link = state(effect);
        if (!link || mindFlayMutations.has(link.cast) || mindFlayChannelLive(link, effect)) continue;
        if (!gmHere() || !present(target) || !values(target.effects).includes(effect)) continue;
        await target.deleteEmbeddedDocuments("ActiveEffect", [effect.id]); result.removedEffects++;
      }
    }
    for (const source of actors) {
      if (!gmHere() || !present(source)) continue;
      const before = sustains(source);
      if (!Array.isArray(before)) continue;
      const keep = before.filter(entry => {
        const link = entry?.[MIND_FLAY_FLAG];
        if (!link || mindFlayMutations.has(link.cast)) return true;
        const pair = mindFlayParticipants(link);
        return pair?.source === source && values(pair.target.effects).some(effect => {
          const held = state(effect);
          return held?.cast === link.cast && mindFlayChannelLive(held, effect);
        });
      });
      if (keep.length === before.length) continue;
      // Always write [], including for synthetic actors: unsetting would let
      // an inherited world-actor Sustain reappear.
      await source.setFlag("azeroth-rpg", "sustaining", keep);
      result.removedSustains += before.length - keep.length;
    }
    return result;
  };
  const next = queued.then(work, work);
  queued = next.catch(() => {});
  return next;
}

export function registerMindFlayLifecycleHooks() {
  const sweep = () => reconcileMindFlay().catch(error => {
    console.warn("azeroth-rpg | Mind Flay cleanup", error);
    ui.notifications?.warn("Mind Flay cleanup could not be confirmed. Check its target effect and source Sustain.");
  });
  for (const name of ["ready", "updateActor", "deleteActor", "updateToken", "deleteToken", "deleteScene",
    "updateActiveEffect", "deleteActiveEffect", "deleteCombat", "combatTurnChange"]) Hooks.on(name, sweep);
}
