import { endLesserInvisibility } from "./lesser-invisibility.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Observe damage on the active GM, including synthetic token actors. Merely
 * losing temporary Health to expiry is not damage; applyDamage supplies the
 * actual absorbed amount through the document update options. */
export function registerLesserInvisibilityHooks() {
  const health = new WeakMap();
  const observe = actor => { if (actor) health.set(actor, actor.system?.health?.value); };
  const prime = () => {
    const actors = new Set([...values(game.actors), ...values(game.scenes).flatMap(scene => values(scene.tokens).map(token => token.actor))]);
    for (const actor of actors) if (actor && !health.has(actor)) observe(actor);
  };
  Hooks.on("ready", prime);
  Hooks.on("canvasReady", prime);
  Hooks.on("createActor", observe);
  Hooks.on("createToken", token => observe(token.actor));
  Hooks.on("updateActor", async (actor, _change = {}, options = {}) => {
    const before = health.get(actor), after = actor.system?.health?.value;
    observe(actor);
    if (!gmHere()) return;
    const reported = options.azerothDamageApplied;
    const damage = Number.isFinite(reported) && reported > 0 ? reported
      : Number.isFinite(before) && Number.isFinite(after) && after < before ? before - after : 0;
    if (damage <= 0) return;
    try { await endLesserInvisibility(actor, { event: "damage", damage }); }
    catch (error) {
      console.warn("azeroth-rpg | Lesser Invisibility damage cleanup failed", actor.uuid, error);
    }
  });
}
