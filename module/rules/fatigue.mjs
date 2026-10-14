/**
 * The Fatigue track's thresholds (05 SS9, A1; D-624). Pure: no Foundry.
 *
 *   1-2  no effect, but Fatigued is on you (A1: the condition ends with the Fatigue)
 *   3    a Bane on Skill and Attack Tests    - the roll dialog's line, rules/modifiers.mjs
 *   4    Slowed
 *   5    a Bane on Resilience Tests as well  - the dialog again
 *   6    "You collapse. Treat as 0 Health"   - Health 0 and Prone (the lead's ruling)
 */

import { AZEROTH } from "../config.mjs";

/**
 * @param {number} fatigue
 * @returns {{fatigued: boolean, slowed: boolean, collapse: boolean}}
 */
export function fatigueState(fatigue = 0) {
  const n = Math.max(0, Math.trunc(Number(fatigue) || 0));
  return {
    fatigued: n >= 1,
    slowed: n >= AZEROTH.FATIGUE_SLOWED_AT,
    collapse: n >= AZEROTH.FATIGUE_MAX
  };
}
