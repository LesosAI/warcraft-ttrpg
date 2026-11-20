/**
 * **TRIBUTE, THE SOVEREIGN'S MOMENTUM** (02 §7; the San'layn and Sovereign plan's B.4, T1, T3, C3). Pure:
 * no Foundry imports (CLAUDE.md §3).
 *
 * The lead (R7): *"Charisma would be used for Tribute scaling."*; (R17) *"the claw attacks should give
 * tribute regardless of once per round. The target failing any resilience test from the Sovereign
 * should provide 1 tribute once per round"*, claw hits **"Prey only"**, the failed Test **"Your
 * prey"**; (R18) *"guard does not empty it"*.
 *
 * - **The cap** (`tributeCap`): 3 plus the Charisma modifier, never below 3 (Essence's shape, D-1027),
 *   2 more with The Crimson Throne, doubled while Crowned in Blood stands.
 * - **The two lanes** (`clawGain`, `willGain`): every claw hit on the prey gives 1; the prey's failed
 *   Resilience Test against your spell, feature or talent gives 1, once a round.
 * - **Crowned in Blood** (`crownedGain`): *each time you gain Tribute, you gain 1 more*.
 *
 * What 05's Momentum rule does to it lives in `momentum.mjs` (`GUARD_KEEPS`): a Critical Injury and the
 * fight's end empty it, the Guard action does not. 05's universal gains never reach it
 * (`runes.mjs#NO_UNIVERSAL_GAINS`), and a rise names its door (`named-gains.mjs#TRIBUTE_GAIN_SOURCES`).
 */

/** The pool's key in `AZEROTH.momentumTypes`. */
export const TRIBUTE = "tribute";

/** *3 plus your Charisma modifier, and the cap is never below 3* (02 §7). */
export const TRIBUTE_CAP_BASE = 3;

/** The Crimson Throne's *Your Tribute cap rises by 2* (04). */
export const THRONE_CAP_BONUS = 2;
export const CRIMSON_THRONE = "The Crimson Throne";

/** The flag a Crowned in Blood effect carries (02 §7, level 20): the cap doubled, 1 more on each gain. */
export const CROWNED_FLAG = "crownedInBlood";

/** The round mark the will lane's once-a-round writes (`identifier:N` on the round's record). */
export const WILL_MARK = "tribute-will";

const int = v => Math.trunc(Number(v)) || 0;

/**
 * **THE TRIBUTE CAP** (02 §7, 04's The Crimson Throne, 02 §7's Crowned in Blood).
 *
 * @param {{chaMod?: number, throne?: boolean, crowned?: boolean}} o
 * @returns {number}
 */
export function tributeCap({ chaMod = 0, throne = false, crowned = false } = {}) {
  const base = Math.max(TRIBUTE_CAP_BASE, TRIBUTE_CAP_BASE + int(chaMod)) + (throne ? THRONE_CAP_BONUS : 0);
  return crowned ? base * 2 : base;
}

/**
 * **THE CLAW LANE** (R17): a claw hit on your prey gives 1, every hit, no round limit. A miss, a hit on
 * another creature, and a main-hand hit give none.
 *
 * @param {{hit?: boolean, claws?: boolean, isPrey?: boolean}} o
 */
export function clawGain({ hit = false, claws = false, isPrey = false } = {}) {
  return hit === true && claws === true && isPrey === true ? 1 : 0;
}

/**
 * **THE WILL LANE** (R17): your prey failing a Resilience Test against your spell, feature or talent
 * gives 1, once a round. `marks` is the round's record for the Sovereign's combatant; out of a fight
 * there is no round, and each failure gives (MY READING: *once a round* counts rounds, and outside a
 * fight none run, so the lane is not held back - the cap still bounds it).
 *
 * @param {{failed?: boolean, isPrey?: boolean, fromSovereign?: boolean, marks?: string[], inFight?: boolean}} o
 * @returns {{gain: number, mark: string|null}}
 */
export function willGain({ failed = false, isPrey = false, fromSovereign = false, marks = [], inFight = false } = {}) {
  if (!(failed === true && isPrey === true && fromSovereign === true)) return { gain: 0, mark: null };
  if (inFight && (marks ?? []).includes(WILL_MARK)) return { gain: 0, mark: null };
  return { gain: 1, mark: inFight ? WILL_MARK : null };
}

/** Crowned in Blood: *each time you gain Tribute, you gain 1 more*, on a gain of 1 or more. */
export function crownedGain(gain = 0, crowned = false) {
  const g = Math.max(0, int(gain));
  return g > 0 && crowned ? g + 1 : g;
}

/**
 * The pool after a gain, capped (*Tribute gained above the cap is lost*), and what it gained.
 *
 * @param {{value?: number, max?: number, gain?: number}} o
 * @returns {{value: number, gained: number}}
 */
export function tributeAfter({ value = 0, max = 0, gain = 0 } = {}) {
  const v = Math.max(0, int(value));
  const next = Math.max(v, Math.min(Math.max(0, int(max)), v + Math.max(0, int(gain))));
  return { value: next, gained: next - v };
}
