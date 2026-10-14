/**
 * Durations on the conditions the system itself applies (A1, D-628), on
 * v14's own fields: `duration {value, units, expiry}` and `start {combat,
 * combatant, round, turn}`. Core's registry expires them at the event named
 * and, with `CONFIG.ActiveEffect.expiryAction` set to "delete" at init, the
 * document goes rather than lingering suppressed.
 *
 * Core keys "turnEnd" on `start.combatant` when `start.combat` is the running
 * fight, and fills both at creation with whoever's turn it is - the
 * attacker's. So the victim's own combatant is written here, and the effect
 * ends at the end of the VICTIM's next turn whichever side leads.
 *
 * Conditions toggled by hand carry no duration and never expire; injuries
 * carry one only where the result says "until the end of your next turn".
 *
 * And a scene deleted takes its tokens' timed effects out of core's registry
 * (`forgetSceneEffects`), which core does for a deleted token and forgets for
 * a deleted scene.
 */

// 05's *Round - ~6 seconds*, which the area law reads off the chapter (D-756).
import { ROUND_SECONDS } from "../rules/area-ticks.mjs";

/** `duration` and `start` for "until the end of your next turn", or null out of a started fight. */
export function untilEndOfNextTurn(actor, combat = actor.activeFight?.() ?? game.combat) {
  if (!combat?.started) return null;
  const combatant = combat.getCombatantsByActor(actor)?.[0] ?? null;
  if (!combatant) return null;
  return {
    duration: { value: 1, units: "turns", expiry: "turnEnd" },
    start: { combat: combat.id, combatant: combatant.id, round: combat.round, turn: combat.turn, time: game.time.worldTime }
  };
}

/** `duration` and `start` for "until your next turn" - it ends as the victim's turn starts. */
export function untilNextTurn(actor, combat = actor.activeFight?.() ?? game.combat) {
  const d = untilEndOfNextTurn(actor, combat);
  return d ? { ...d, duration: { ...d.duration, expiry: "turnStart" } } : null;
}

/**
 * **A SPAN THAT WAITS ON A TURN, OUT OF A FIGHT** (D-778; the lead, 2026-10-03, on
 * O-161: *"Player can use them at anytime if selected."*). Fourteen Uses refused
 * out of a fight because nothing would end what they laid - Taunt, Judgement,
 * Deterrence, Cloak of Shadows, Shadow Dance, Overkill, 02's Ward, Silence,
 * Ascendance, Doom Winds, Spirit Walk, Icy Veins, Prismatic Ward and Soul Fire. Out
 * of a fight such a span is **one round of the world's clock**: 05's *Round - ~6
 * seconds* (`rules/area-ticks.mjs#ROUND_SECONDS`), a v14 span in `seconds` that
 * core's own registry ends when the clock passes it - the route a spell's minute
 * already takes out of a fight (`spellTiming`, `ticks.mjs#tickHasClock`'s *a span
 * the world's clock counts*). MY READING, for the lead: *until your next turn* and
 * *until the end of your next turn* are both one round there, since no turn has a
 * length out of a fight, and *N rounds* is N of them.
 *
 * @param {number} [rounds]
 * @param {number} [time]  the world's time now
 * @returns {{duration: {value: number, units: "seconds"}, start: {time: number}}}
 */
export function clockRounds(rounds = 1, time = globalThis.game?.time?.worldTime ?? 0) {
  const n = Math.max(1, Math.trunc(Number(rounds)) || 1);
  return { duration: { value: n * ROUND_SECONDS, units: "seconds" }, start: { time: Number(time) || 0 } };
}

/** *Until your next turn*: the fight's span, or one round of the world's clock out of one (D-778). */
export function untilNextTurnOrRound(actor) {
  return untilNextTurn(actor) ?? clockRounds(1);
}

/** *Until the end of your next turn*: the fight's span, or one round of the world's clock (D-778). */
export function untilEndOfNextTurnOrRound(actor) {
  return untilEndOfNextTurn(actor) ?? clockRounds(1);
}

/** *For N rounds*: the fight's rounds, or N rounds of the world's clock out of one (D-778). */
export function roundsOrClock(actor, rounds = 1) {
  return spellTiming(actor, { value: Math.max(1, Math.trunc(Number(rounds)) || 1), units: "rounds", expiry: "turnEnd" }) ?? clockRounds(rounds);
}

/**
 * Put a condition on an actor with a duration (D-628): the status through
 * `toggleStatusEffect`, then the duration written onto the effect it made.
 * With no fight running the condition is applied and holds, as it would by
 * hand.
 */
export async function applyCondition(actor, id, { value = null, until = null } = {}) {
  if (!actor.statuses?.has(id)) await actor.toggleStatusEffect(id, { active: true });
  const effect = actor.effects.find(e => e.statuses?.has(id)) ?? null;
  if (!effect) return null;
  const update = {};
  if (value !== null) update["flags.azeroth-rpg.value"] = value;
  // A ready-made `{duration, start}` (a spell's minute, 2026-09-06) rides as it is.
  const timing = until && typeof until === "object" ? until
    : until === "endOfNextTurn" ? untilEndOfNextTurn(actor) : until === "nextTurn" ? untilNextTurn(actor) : null;
  if (timing) Object.assign(update, timing);
  if (Object.keys(update).length) await effect.update(update);
  return effect;
}

/**
 * The v14 `duration` and `start` for a spell laid on an actor (2026-09-06):
 * rounds in the actor's started fight, keyed on the actor's own combatant
 * as every timed condition is (D-628); world time otherwise; null where the
 * spell has no span the clock can hold.
 * @param {Actor} actor
 * @param {{value: number, units: string, expiry?: string}|null} spec  From rules/spell-effects.mjs#effectDuration.
 */
export function spellTiming(actor, spec) {
  if (!spec) return null;
  if (spec.units === "rounds" || spec.units === "turns") {
    const combat = actor.activeFight?.() ?? game.combat;
    if (!combat?.started) return null;
    const combatant = combat.getCombatantsByActor(actor)?.[0] ?? null;
    return {
      duration: { value: spec.value, units: spec.units, expiry: spec.expiry ?? "turnEnd" },
      start: { combat: combat.id, combatant: combatant?.id ?? null, round: combat.round, turn: combat.turn, time: game.time.worldTime }
    };
  }
  return { duration: { value: spec.value, units: spec.units }, start: { time: game.time.worldTime } };
}

/**
 * **A SCENE DELETED TAKES ITS TOKENS' TIMED EFFECTS OUT OF CORE'S REGISTRY**
 * (the full-suite fix of D-757, 2026-09-26).
 *
 * Core expires a timed effect through `ActiveEffect.registry` (14.367,
 * `client/helpers/active-effect-registry.mjs`), and takes a token actor's
 * effects out of it when the TOKEN is deleted (`TokenDocument#_onDelete` runs
 * the synthetic actor's `_onDelete`). A SCENE deleted runs neither:
 * `Scene#_onDelete` never visits its tokens, so every unlinked token on it
 * keeps its timed effects registered until the garbage collector happens by.
 * The next event that judges one expired - the world's clock passing a
 * spell's minute, or passing at all for *until the end of its next turn* on a
 * creature in no fight - has the active GM's client delete it in a batch
 * naming the deleted scene. The server refuses it, *The Scene <id> does not
 * exist in scenes*, and answers a batch with a refusal in it with every
 * operation's DRY RUN, whose serialized parent the client then refuses too:
 * *A parent Document provided to the database operation must be a Document
 * instance*. The full suite raised all four at the first `game.time.advance`
 * it ever made, off three Slows the spell-effects batch had laid on unlinked
 * Ghouls of two scenes it deleted long before.
 *
 * So this does what core does for a deleted token, for every token of a
 * deleted scene, on every client (each keeps its own registry). The spans are
 * untouched - A1's *until the end of its next turn* and 07's minute are still
 * core's to count - and a token of a scene the world still holds is never
 * read here.
 */

/**
 * The actors whose timed effects a deleted scene strands in the registry: the
 * synthetic actor of every unlinked token whose delta was ever materialized.
 * A linked token's actor is the world's and outlives the scene; a LAZY delta
 * was never materialized, so nothing of it was registered, and reading its
 * `delta` would build it only to forget it.
 *
 * @param {Scene|null} scene
 * @returns {Actor[]}
 */
export function strandedActors(scene) {
  const out = [];
  for (const token of scene?.tokens ?? []) {
    if (!token || token.actorLink || token.isLazyDelta) continue;
    const actor = token.delta?.syntheticActor ?? null;
    if (actor) out.push(actor);
  }
  return out;
}

/**
 * Take a deleted scene's token actors out of core's effect registry, through
 * core's own door (`ActiveEffectRegistry#deleteFromParent`, which walks the
 * actor's effects and its items').
 *
 * @param {Scene|null} scene
 * @param {object|null} [registry]  core's `ActiveEffect.registry`
 * @returns {number} how many actors had an effect forgotten
 */
export function forgetSceneEffects(scene, registry = globalThis.foundry?.documents?.ActiveEffect?.registry ?? null) {
  if (typeof registry?.deleteFromParent !== "function") return 0;
  let forgotten = 0;
  for (const actor of strandedActors(scene)) {
    if (registry.deleteFromParent(actor)) forgotten++;
  }
  return forgotten;
}

/** Registered at init beside `CONFIG.ActiveEffect.expiryAction`, on every client. */
export function registerDurationHooks() {
  Hooks.on("deleteScene", scene => {
    forgetSceneEffects(scene);
  });
}
