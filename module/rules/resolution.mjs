/**
 * Core resolution math — pure functions, no Foundry imports.
 * d20 + modifier vs. DC produces a Success Level (SL).
 */

export const SL_CAP = 6;

/** Four dice is the ceiling: a fourth Boon changes nothing (05 §4). */
export const DICE_CEILING = 4;

/**
 * Compute the Success Level for a check.
 * SL = floor((total - dc) / 5), capped at ±SL_CAP.
 *
 * **FLOOR, NOT TRUNC.** 05 §2's table is the authority and it reads:
 *
 *   | 0 to +4 | Bare | 0 |   | −1 to −5 | Near miss | −1 |
 *   | +5 to +9 | Strong | +1 |   | −6 to −10 | Clear failure | −2 |
 *   | +10 to +14 | Decisive | +2 |   | −11 to −15 | Bad failure | −3 |
 *
 * Floor reproduces every row of that table; trunc reproduces only the top
 * half, because it rounds a negative margin TOWARD zero. This function used
 * `Math.trunc`, so **a Test that missed its DC by 1 to 4 came back at SL 0 —
 * and SL 0 was then scored as a success.** Missing a Defense of 15 with a
 * total of 12 was a hit. It ran through every Attack, Casting, skill and
 * Resilience Test in the game (the lead, 2026-09-07).
 *
 * The two boundary rows above the first were wrong the same way: a margin of
 * −6 to −9 read as SL −1 where the book says −2, and −11 to −14 as −2 where
 * the book says −3.
 *
 * CLAUDE.md §7 asserted the trunc form too, and so did this file's own test —
 * the spec and the code agreed with each other and both disagreed with the
 * book, which is why nothing caught it. `resolution.test.mjs` reads the
 * chapter's table now rather than restating it.
 *
 * @param {number} total  Final roll total (d20 + all modifiers).
 * @param {number} dc     Difficulty Class the check is made against.
 * @returns {number}      Success Level in [-SL_CAP, SL_CAP].
 */
export function computeSL(total, dc) {
  const sl = Math.floor((total - dc) / 5) || 0;
  return Math.max(-SL_CAP, Math.min(SL_CAP, sl));
}

/**
 * Whether a Test succeeded: the total meets or beats the DC, and nothing else.
 *
 * 05 §2: *A bare success at SL 0 still succeeds*, and the table gives every
 * shortfall a negative SL. Reading success off the SL is what let a miss by
 * three score as a hit, so success is read off the MARGIN and the SL is left
 * to say how well.
 */
export function succeeded(total, dc) {
  return total >= dc;
}

/**
 * "Count your Boons and your Banes and cancel them one for one." (05 §4)
 * Positive is net Boons, negative net Banes, zero an even roll.
 */
export function netAdvantage(boons = 0, banes = 0) {
  return Math.trunc(boons) - Math.trunc(banes);
}

/**
 * The dice a net advantage rolls: one d20 plus one more for each left over,
 * keeping the highest for Boons and the lowest for Banes, to a ceiling of four.
 *
 * @returns {{count: number, keep: "high"|"low"|"all", formula: string}}
 */
export function diceFor(net) {
  const n = Math.trunc(net) || 0;
  const extra = Math.min(Math.abs(n), DICE_CEILING - 1);
  const count = 1 + extra;
  if (n === 0 || extra === 0) return { count: 1, keep: "all", formula: "1d20" };
  const keep = n > 0 ? "high" : "low";
  return { count, keep, formula: `${count}d20${keep === "high" ? "kh" : "kl"}` };
}

/** Shorthand: the roll formula for a given Boon and Bane count. */
export function testFormula(boons = 0, banes = 0) {
  return diceFor(netAdvantage(boons, banes)).formula;
}

/**
 * Resolve a Test once the dice are known.
 *
 * "Natural 20 always succeeds, and counts as at least SL 1 however impossible
 * the task looked. Natural 1 always fails. Work out the Success Level of that
 * failure normally." (05 §1, D-046)
 *
 * The KEPT die is the natural roll for every purpose; the others are set aside
 * without effect (05 §4).
 *
 * @param {object} o
 * @param {number} o.natural   The kept d20 face.
 * @param {number} o.modifier  Everything added to it.
 * @param {number} o.dc        The target number.
 */
export function resolveTest({ natural, modifier = 0, dc = 10, criticalOn = 20 } = {}) {
  const total = natural + modifier;
  const raw = computeSL(total, dc);

  // Keen widens the Critical Injury to a 19, or an 18 (08 §5, 2026-09-06); a
  // natural 20 is always one.
  if (natural === 20 || (natural >= criticalOn && natural > 1)) {
    return { total, sl: Math.max(1, raw), success: true, natural, critical: true, fumble: false };
  }
  if (natural === 1) {
    // The failure's Success Level is worked out normally, so a natural 1 on an
    // easy task is a stumble and on a desperate one a catastrophe.
    return { total, sl: Math.min(raw, 0), success: false, natural, critical: false, fumble: true };
  }
  return { total, sl: raw, success: succeeded(total, dc), natural, critical: false, fumble: false };
}

/**
 * **AN ATTACK THAT HITS WITHOUT A ROLL** (04's Trueshot: *The attack hits without
 * a roll and counts as SL 2, or SL 3 at rank 2*; D-773): the outcome a forced SL
 * stands for. A hit at that SL whatever the die says - so no natural 20 inflicts a
 * Critical Injury on it and no natural 1 misses it - with the total kept for what
 * reads it (a Parry's DC is the attacker's total, 06 §6).
 *
 * @param {{sl: number, total?: number, natural?: number|null}} o
 */
/**
 * **THE FORCED SL A ROLL CARRIES, OR NONE** (the architect's review of D-773): a
 * finite NUMBER on the roll's options. `Number("")` is 0, so a test on
 * `Number.isFinite(Number(x))` forced an empty string to SL 0 - a hit on a roll
 * Trueshot never touched.
 *
 * @param {object|null} options  the roll's options
 * @returns {number|null}
 */
export function forcedSlOf(options) {
  const n = options?.forcedSl;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function forcedOutcome({ sl = 0, total = 0, natural = null } = {}) {
  return { total, sl: Math.max(0, Math.trunc(Number(sl)) || 0), success: true, natural, critical: false, fumble: false, forced: true };
}

/**
 * The book's name for a margin (05 SS2, D-622): Overwhelming at SL 3 or more,
 * Decisive at 2, Strong at 1, Bare at 0, Near miss at -1, Clear failure at
 * -2, Bad failure at -3 or worse. A failure at SL 0 - a natural 1 on an easy
 * task - is a near miss, never bare: bare is a success. Keys, not words; the
 * card localizes them.
 *
 * @param {{sl?: number, success?: boolean}} o
 * @returns {"overwhelming"|"decisive"|"strong"|"bare"|"nearMiss"|"clearFailure"|"badFailure"}
 */
export function resultName({ sl = 0, success = undefined } = {}) {
  const n = Math.trunc(Number(sl)) || 0;
  const won = success === undefined ? n >= 0 : success === true;
  if (!won) {
    if (n >= -1) return "nearMiss";
    if (n === -2) return "clearFailure";
    return "badFailure";
  }
  if (n >= 3) return "overwhelming";
  if (n === 2) return "decisive";
  if (n === 1) return "strong";
  return "bare";
}
