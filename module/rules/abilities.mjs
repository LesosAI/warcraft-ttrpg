/**
 * Abilities. Pure functions, no Foundry imports (CLAUDE.md §3).
 */

/** The six, in book order (05 §1). */
export const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/** The three Resiliences and the ability each reads (05 §1). A class trains two. */
export const RESILIENCES = Object.freeze({ body: "con", reflex: "dex", spirit: "wis" });

/** Scores run 3-20 unaided (D-482). An affix or a Legacy carries one past 20. */
export const SCORE_MIN_NATURAL = 3;
export const SCORE_MAX_NATURAL = 20;

/**
 * `(score - 10) / 2`, rounded down (05 §1). Rounding down rather than toward
 * zero is what makes Int 3 read as -4 and not -3, which is the figure every
 * stat block in 14 prints.
 */
export function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

/**
 * A Resilience Test adds the Proficiency Bonus only where the class is trained
 * in that Resilience (05 §1) — the one Test in the game that does not always
 * get it.
 */
export function resilienceBonus({ score = 10, proficiency = 2, trained = false } = {}) {
  return abilityModifier(score) + (trained ? proficiency : 0);
}

/** Skill Test = ability modifier + Proficiency Bonus + Skill Rank (02 §8). */
export function skillTotal({ score = 10, proficiency = 2, rank = 0 } = {}) {
  return abilityModifier(score) + proficiency + rank;
}

/** Spell DC = 10 + casting ability modifier + Proficiency Bonus (05). */
export function spellDC({ score = 10, proficiency = 2 } = {}) {
  return 10 + abilityModifier(score) + proficiency;
}

/** Whether a score sits inside the range a body reaches unaided. */
export function isNaturalScore(score) {
  return score >= SCORE_MIN_NATURAL && score <= SCORE_MAX_NATURAL;
}

/**
 * **WHAT AN EDIT ON THE PLATE STORES** (D-769, the review). The plate shows the
 * score AS WORN - the stored score, every Active Effect on it (an elixir's +2)
 * and what the gear grants - and a reader edits that number, so the stored
 * score moves by exactly what the shown one was moved by: `typed - (shown -
 * stored)`. Only the gear used to be netted out, so an edit made under an
 * elixir wrote its +2 into the creation score for good.
 *
 * A score an OVERRIDE holds (a shape's Strength, `scoreHeldBy`) has no stored
 * score behind the number shown: the edit is refused, null, and nothing of the
 * bear's 14 can reach the character's own Strength.
 *
 * @param {{typed: number|string, shown: number, stored: number, held?: boolean}} o
 * @returns {number|null}  the score to store, at least 1, or null to write nothing
 */
export function storedFromShown({ typed, shown, stored, held = false } = {}) {
  if (held) return null;
  if (typed === null || typed === undefined || String(typed).trim() === "") return null;
  const t = Math.trunc(Number(typed));
  if (!Number.isFinite(t)) return null;
  const s = Number(shown);
  const b = Number(stored);
  const net = Number.isFinite(s) && Number.isFinite(b) ? s - b : 0;
  return Math.max(1, t - net);
}

/**
 * The name of the effect whose `override` holds a score, or null: an override
 * replaces the score outright, so the plate has nothing it can write back to.
 *
 * @param {Array<{name?: string, changes?: Array<{key?: string, type?: string}>}>} effects  the applied effects, plainly
 * @param {string} key  the ability
 * @returns {string|null}
 */
export function scoreHeldBy(effects = [], key) {
  const path = `system.abilities.${key}.value`;
  const held = (effects ?? []).find(e => (e?.changes ?? []).some(c => c?.key === path && c?.type === "override"));
  return held ? String(held.name ?? "") : null;
}
