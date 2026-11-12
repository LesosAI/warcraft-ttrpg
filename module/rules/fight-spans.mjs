/**
 * **A SPAN THE FIGHT WAS COUNTING, HANDED TO THE WORLD'S CLOCK WHEN THE FIGHT ENDS** (the
 * sweep's stage 2, D-891; narrowed by O-289, D-893). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * In a started fight a spell's minute is ten of its rounds (`effects/durations.mjs#minuteSpan`,
 * `spellTiming`), and *until the end of your next turn* is a span of turns. Core counts both
 * against the fight that laid them. Once that fight is deleted, core reframes a span as seconds
 * through `CONFIG.time.<unit>Time` (14.367 `client/documents/active-effect.mjs`
 * `_prepareCombatBasedDuration`), and a span it cannot reframe reads as having no time left, so
 * `isExpiryEvent("updateWorldTime")` ends it at the first tick of the world's clock.
 *
 * **A SPAN IN ROUNDS IS CORE'S NOW** (the lead, 2026-11-10: *"6 second round is fine."*):
 * `CONFIG.time.roundTime` is 05's six seconds (`azeroth.mjs`), so core reframes it as its rounds
 * at six seconds counted from the world time it was laid, and the clock has moved six seconds at
 * every round of the fight - which is exactly what was left. D-891's rewrite of rounds came out:
 * left in, it would have counted from the fight's end what core counts from the laying.
 *
 * **A SPAN IN TURNS IS STILL THIS FILE'S**: a turn has no length (`CONFIG.time.turnTime` is 0, or
 * the clock would move twice a round), so core reframes nothing and ends the span at the next
 * tick of the clock. *Until the end of your next turn* left when the fight ends is one round of
 * the clock, D-778's reading of such a span out of a fight. A span that ends with the fight
 * (`combatEnd`) or at the round's end is left to core, which ends it.
 */

import { ROUND_SECONDS } from "./area-ticks.mjs";

/** Expiries a rewritten span may have carried: the turn's starts and ends. */
const TURN_EXPIRIES = Object.freeze(["turnEnd", "turnStart", null, undefined, ""]);

/**
 * The world-clock seconds a fight's span of TURNS has left when its fight ends, or null where
 * the span is not one this rewrites (a span in rounds, which core reframes; a time span already;
 * an indefinite one; one that ends with the fight; one already run out).
 *
 * @param {{value?: number|null, units?: string|null, expiry?: string|null}|null} duration
 * @returns {number|null}
 */
export function secondsLeftAfterFight(duration) {
  if (!duration || typeof duration !== "object") return null;
  const value = Number(duration.value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (!TURN_EXPIRIES.includes(duration.expiry)) return null;
  // *Until the end of THAT turn* (a span of 0 turns) ended with the turn; any other span in
  // turns is one round of the clock.
  if (duration.units === "turns") return value > 0 ? ROUND_SECONDS : null;
  return null;
}
