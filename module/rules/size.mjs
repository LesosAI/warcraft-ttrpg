/**
 * Size and what it carries. Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * D-545 built the ladder because EIGHT RULES WERE ALREADY READING A SIZE AND
 * NOTHING HAD ONE. Size does exactly three things (05 §10) — carrying capacity,
 * moving through a space, and resisting being moved. It changes no Health, no
 * Defense, no reach and no square: "a Large creature and a Small one both hold
 * five feet of ground." Adding a fourth use here would undo what D-007 protects.
 */

/** Six rungs, smallest first. Medium is the default. */
export const SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "enormous"]);

export const DEFAULT_SIZE = "medium";

/** Carrying doubles with every rung above Medium and halves below (05 §10). */
export const CARRY_MULTIPLIER = Object.freeze({
  tiny: 0.25, small: 0.5, medium: 1, large: 2, huge: 4, enormous: 8
});

/** Base Speed before race and armor (05). Encumbering costs 5 feet. */
export const BASE_SPEED = 30;

/**
 * 05 §10's two load rungs, in feet of Speed (D-675). Encumbered costs 5 and
 * Overloaded 15 — not 5 and a stop, which is what the rule said before the
 * lead struck the Reflex Bane and made both rungs Speed.
 */
export const ENCUMBERED_SPEED_PENALTY = 5;
export const OVERLOADED_SPEED_PENALTY = 15;

/** What each load state costs in feet. */
export const LOAD_PENALTY = Object.freeze({
  unencumbered: 0,
  encumbered: ENCUMBERED_SPEED_PENALTY,
  overloaded: OVERLOADED_SPEED_PENALTY
});

/** Where a size sits on the ladder, or -1 if it is not one of the six. */
export function rung(size) {
  return SIZES.indexOf(String(size ?? DEFAULT_SIZE).toLowerCase());
}

export function isSize(size) {
  return rung(size) !== -1;
}

/**
 * "You carry your Strength score in pounds, ten times over, and nothing
 * happens." (05) — scaled by size.
 *
 * **NO STRENGTH SCORE MEANS NO CARRY LIMIT**, and that is `null` rather than 0.
 * A character always has a score (the schema gives it `min: 1`), but 14 §1
 * prints `—` for a slot a creature does not have and `NpcData` keeps it null on
 * purpose. `Math.trunc(null)` is 0, so the rule as written made a `—` Strength
 * a capacity of ZERO — and one dagger then Overloaded a Mindless ooze and took
 * 15 feet off its Speed. There is no rule in 05 for what a thing with no
 * Strength can carry, so the tool refuses to invent one and the sheet prints a
 * dash.
 */
export function carryCapacity(strength, size = DEFAULT_SIZE) {
  const n = strength === null || strength === undefined ? NaN : Number(strength);
  if (!Number.isFinite(n)) return null;
  const mult = CARRY_MULTIPLIER[String(size).toLowerCase()] ?? 1;
  return Math.trunc(n) * 10 * mult;
}

/**
 * The two load thresholds (05 §10, D-675). Past the first you are
 * **Encumbered** and Speed drops 5 feet; past twice it you are **Overloaded**
 * and it drops 15 instead. Both scale with size.
 *
 * With no capacity to compare against — a creature with a `—` Strength — there
 * is no threshold to cross and nothing is ever Encumbered.
 */
export function loadState(carried, strength, size = DEFAULT_SIZE) {
  const capacity = carryCapacity(strength, size);
  if (capacity === null) return "unencumbered";
  if (carried > capacity * 2) return "overloaded";
  if (carried > capacity) return "encumbered";
  return "unencumbered";
}

/**
 * The carry line both Gear tabs draw, out of what the model already derived.
 *
 * Lifted out of `character-sheet.mjs` when the creature's Gear tab arrived (the
 * lead's N3): two sheets printing the same four numbers is two places for the
 * rounding, the label key and the bar's ceiling to drift. Nothing here is
 * localised — `label` is a KEY the template resolves, since a pure module holds
 * no `game.i18n` (CLAUDE.md §3).
 *
 * **A NULL CAPACITY IS NOT A ZERO.** A creature with a `—` Strength has no
 * carry limit at all (`carryCapacity` above), and reading it as 0 made the bar
 * full and the count read `12 / 0 lb`. `capacity` stays null, `percent` is 0
 * and the tab prints a dash where the ceiling would be. A character always has
 * a score, so this branch is the creature's alone and no character's line moves.
 *
 * @param {object} o
 * @param {number} [o.carried]           `system.carried`, in pounds
 * @param {number|null} [o.capacity]     `system.carryCapacity`, or null
 * @param {string} [o.state]             `system.load`
 * @returns {{carried, capacity, state, label, penalty, percent, unlimited}}
 */
export function loadLine({ carried = 0, capacity = null, state = "unencumbered" } = {}) {
  const lb = Number(carried) || 0;
  const max = capacity === null || capacity === undefined || !Number.isFinite(Number(capacity))
    ? null : Number(capacity);
  const key = LOAD_PENALTY[state] === undefined ? "unencumbered" : state;
  return {
    carried: Math.round(lb * 10) / 10,
    capacity: max,
    state: key,
    label: `AZEROTH.Sheet.Load${key.charAt(0).toUpperCase()}${key.slice(1)}`,
    // Negative feet, because the line reads "-5 ft Speed".
    penalty: LOAD_PENALTY[key] ? -LOAD_PENALTY[key] : 0,
    // The bar fills to capacity and stays full past it; the STATE says how far
    // over, in words, because colour is never the only carrier.
    percent: max > 0 ? Math.min(100, Math.round((lb / max) * 100)) : 0,
    unlimited: max === null
  };
}

/**
 * "You may move through the space of a creature two or more sizes larger than
 * you, and it may move through yours. Neither of you may end a Move there."
 * Symmetrical, which is why one function answers for both directions.
 */
export function canMoveThrough(moverSize, otherSize) {
  const a = rung(moverSize);
  const b = rung(otherSize);
  if (a === -1 || b === -1) return false;
  return Math.abs(b - a) >= 2;
}

/**
 * "You cannot be pushed, pulled or knocked Prone against your will by anything
 * more than one size smaller than you."
 *
 * Returns true when the target RESISTS — that is, when the source is more than
 * one rung smaller.
 */
export function resistsForcedMovement(targetSize, sourceSize) {
  const t = rung(targetSize);
  const s = rung(sourceSize);
  if (t === -1 || s === -1) return false;
  return t - s > 1;
}

/**
 * The token footprint by rung, in grid squares (D-636, D-637): the lead's
 * call for the map, and CONVENTION rather than a rule — 05 §10 gives a
 * Large creature five feet of ground, and every rule that reads a size
 * reads `system.size`, never the token. Large peoples and creatures alike.
 */
export const TOKEN_SIZE = Object.freeze({
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, enormous: 4
});

export function tokenSize(size = DEFAULT_SIZE) {
  return TOKEN_SIZE[String(size ?? DEFAULT_SIZE).toLowerCase()] ?? 1;
}

/**
 * A flying pace is fixed by TIER, not by the creature (D-530): 120 feet at
 * tiers 1-2 and 240 at tiers 3-4, taken from the tier of whatever is doing the
 * flying. Defined in 14 §1 and nowhere else until 09 covers mounts.
 */
export function flyingPace(tier) {
  return Number(tier) >= 3 ? 240 : 120;
}
