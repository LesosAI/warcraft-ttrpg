/**
 * Corruption. Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * Three tracks, each 0-20, thresholds at 5 / 10 / 15, 20 terminal (D-457).
 * A threshold ARRIVES AUTOMATICALLY — nothing to accept, nothing to refuse, no
 * roll (D-458) — so what is crossed is a function of the number and is never
 * stored. That is why this module exists at all.
 */

import { AZEROTH } from "../config.mjs";

export const THRESHOLDS = Object.freeze([...AZEROTH.CORRUPTION_THRESHOLDS]);
export const MAX = AZEROTH.CORRUPTION_MAX;

/** The track keys, from config so the book's checker covers them (D-456). */
export const TRACKS = Object.freeze(Object.keys(AZEROTH.corruptionTracks));

/** How many thresholds a track value has crossed: 0 to 3. */
export function thresholdsCrossed(value) {
  const v = clamp(value);
  return THRESHOLDS.filter(t => v >= t).length;
}

/** The highest threshold crossed, or null below the first. */
export function highestThreshold(value) {
  const v = clamp(value);
  const crossed = THRESHOLDS.filter(t => v >= t);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

/** A track ends at 20 (D-457). The terminal state is playable (D-462). */
export function isTerminal(value) {
  return clamp(value) >= MAX;
}

/** How far to the next threshold, or null once every one is crossed. */
export function toNextThreshold(value) {
  const v = clamp(value);
  const next = THRESHOLDS.find(t => v < t);
  return next === undefined ? null : next - v;
}

/**
 * The state of every track on an actor.
 *
 * THERE IS NO TOTAL, and this module deliberately offers no way to compute one.
 * "Tracks never add together. Fel 4 and Undeath 4 have crossed nothing"
 * (10-CORRUPTION). A summed corruption score is the single most tempting wrong
 * number in this system, so it is not available to be printed by accident.
 */
export function trackStates(corruption = {}) {
  return Object.fromEntries(TRACKS.map(key => {
    const value = clamp(corruption[key]);
    return [key, {
      value,
      crossed: thresholdsCrossed(value),
      highest: highestThreshold(value),
      toNext: toNextThreshold(value),
      terminal: isTerminal(value)
    }];
  }));
}

/**
 * The thresholds a character has crossed, as rows for the sheet: one per
 * threshold per track, DERIVED from the number and never a document
 * (D-457, D-596). The effect of each is 10-CORRUPTION's ladder, which the
 * table applies; the row says which rung is in force.
 * @param {ReturnType<typeof trackStates>} states
 * @returns {Array<{track: string, threshold: number}>}
 */
export function derivedThresholds(states = {}) {
  const out = [];
  for (const track of TRACKS) {
    const value = states[track]?.value ?? 0;
    for (const t of THRESHOLDS) if (value >= t) out.push({ track, threshold: t });
  }
  return out;
}

/**
 * Which Resilience answers a track (D-459): fel and void are Spirit, undeath
 * is Body. Read from config rather than restated, so 05's assignment and this
 * cannot drift.
 */
export function resilienceFor(track) {
  return AZEROTH.corruptionResilience[track] ?? null;
}

/**
 * Exposure: a Resilience Test at the DC of whatever exposed you; on a failure,
 * gain one point. No partial exposure and no Success Level (10-CORRUPTION).
 *
 * NOTHING ACCRUES DURING A FIGHT — every occasion is a Long Rest, being reduced
 * to 0 Health, or something picked up deliberately. D1 §9's turn budget has no
 * room for a Test per incoming blow, so the roll pipeline never calls this.
 *
 * `reduction` is what a Signature takes off (08 §20, D-692). Nemesis Raiment:
 * *a Warlock wearing it takes 1 less Fel Corruption, to a minimum of 0, each
 * time they would take any.* **The floor is on the POINTS, not on the track**
 * — reducing 1 point by 1 leaves 0 and the score does not fall, which is what
 * *1 less, to a minimum of 0* says. Taking it off the track instead would make
 * the suit CURE Corruption every time an exposure was resisted.
 */
export function applyExposure(value, { failed = false, points = 1, reduction = 0 } = {}) {
  if (!failed) return clamp(value);
  const owed = Math.max(0, points - Math.max(0, Math.trunc(Number(reduction) || 0)));
  return clamp(clamp(value) + owed);
}

function clamp(value) {
  const n = Math.trunc(Number(value) || 0);
  return Math.min(MAX, Math.max(0, n));
}

/** The tier at which Fel and Shadow start to charge (07 §8). */
export const CASTING_CORRUPTION_TIER = 5;

/** The schools that charge at all. Nothing below tier 5, and no other school ever. */
export const CASTING_CORRUPTION_SCHOOLS = Object.freeze(["fel", "shadow"]);

/**
 * What casting this spell puts on the caster (07 §8).
 *
 * > *Casting a tier 5 Fel or Shadow spell accrues 1 point of Corruption on its
 * > own track.*
 *
 * **UNRESISTED.** 10 §3 lists this among three occasions that are *agreed to
 * rather than suffered — you take the offer, you cast the spell, you keep the
 * blade — so no Test is made and the point lands.* That is why it does not go
 * through `applyExposure`'s Test at all. Nothing read tier or school on a cast
 * and no Corruption was ever accrued from one (the lead, 2026-09-07).
 *
 * A Fel spell puts a point on **Fel**. A Shadow spell puts one on **Void** or
 * on **Undeath**, and 07 says each entry names which — so the track is read
 * off the spell, and a Shadow spell that names none accrues nothing rather
 * than having a track guessed for it.
 *
 * @param {{tier?: number, school?: string, corruption?: string|null}} spell
 * @returns {{track: string, points: number}|null}
 */
export function castingCorruption(spell = {}) {
  const tier = Math.trunc(Number(spell?.tier) || 0);
  const school = String(spell?.school ?? "").toLowerCase();
  if (tier < CASTING_CORRUPTION_TIER || !CASTING_CORRUPTION_SCHOOLS.includes(school)) return null;

  const named = String(spell?.corruption ?? "").toLowerCase();
  const track = school === "fel" ? "fel" : (TRACKS.includes(named) ? named : null);
  return track ? { track, points: 1 } : null;
}
