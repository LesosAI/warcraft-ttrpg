import { transferSentinelPower } from "./anubisath-pack.mjs";
import { sentinelFeedback } from "./sentinel-feedback.mjs";

/** The tabletop Heal Brethren restores 20 Health, capped at maximum.
 * This is an adaptation, not the client spell's numeric scaling. */
export const SENTINEL_BRETHREN_HEAL = 20;
const values = collection => collection?.values?.() ?? collection ?? [];

export function registerSentinelPackHooks() {
  const observed = new WeakMap();
  const prime = actor => {
    if (actor && Number.isInteger(actor.system?.health?.value)) observed.set(actor, actor.system.health.value);
  };
  const primeAll = () => {
    for (const actor of values(game.actors)) prime(actor);
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) prime(token.actor);
  };
  const observe = async actor => {
    if (!actor) return;
    const previousHealth = observed.get(actor);
    prime(actor);
    if (!(previousHealth > 0) || actor.system?.health?.value !== 0
      || !actor.flags?.["azeroth-rpg"]?.sentinelPack?.assignment
      || !game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    try {
      const result = await transferSentinelPower({ source: actor, previousHealth,
        healing: SENTINEL_BRETHREN_HEAL,
        valid: () => actor.system?.health?.value === 0 });
      for (const recipient of result.recipients ?? []) {
        const survivor = fromUuidSync(recipient.uuid);
        if (survivor) await sentinelFeedback(survivor, "ability:sentinel-pack",
          `${survivor.name} inherits ${recipient.power} and recovers ${recipient.healing} Health.`);
      }
      if (!result.ok || result.unavailable?.length) ui.notifications?.warn(
        "Sentinel power transfer needs review. Check the recorded recipients and Health before correcting an unfinished transfer.");
    } catch (error) {
      console.warn("azeroth-rpg | Sentinel death observer", error);
      ui.notifications?.warn("Sentinel power transfer could not be confirmed. Review the pack before making a correction.");
    }
  };
  Hooks.on("ready", primeAll);
  Hooks.on("canvasReady", primeAll);
  Hooks.on("createActor", prime);
  Hooks.on("createToken", token => prime(token.actor));
  Hooks.on("updateActor", observe);
}
