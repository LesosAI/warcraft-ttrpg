/**
 * **WHAT BARS A DISENGAGE, JUDGED ONCE FOR EVERY DOOR THAT LAYS ONE** (the F4b review, S5). Pure:
 * no Foundry imports (CLAUDE.md §3).
 *
 * Four things say a creature cannot Disengage: an Anchor it is Engaged with (04's Anchor, D-772),
 * a Chronomancer's Decay at Heavy Hours' rank 2, a Death Knight's Relentless Advance over a Slowed
 * creature within reach, and the Slowed Chains of Ice laid (07 §11: *While it is Slowed by this
 * spell, it cannot **Disengage***). They were asked at the sheet's Disengage alone, while three
 * other doors lay the same `disengaging` state - 04's Elusive (Evade, on an attack's card), 02's
 * Spirit Walk and a Boss Action's Disengage - and walked straight past every bar.
 *
 * `disengageBar` is the one judgement; `effects/disengage-bars.mjs#refuseDisengage` gathers the
 * facts off the world, says the refusal in words and is asked at every writer of `disengaging`
 * before anything is spent. `disengage-bars.test.mjs` fails a writer that does not ask it.
 */

import { ANCHORED, disengageRefusal } from "./reactions.mjs";

/** The words each bar is refused in, in the order they are asked. */
export const DISENGAGE_BAR_KEYS = Object.freeze({
  anchored: ANCHORED,
  heavyHours: "AZEROTH.Chrono.HeavyHoursDisengage",
  relentless: "AZEROTH.DeathKnight.Talent.NoDisengage",
  chained: "AZEROTH.DeathKnight.Spell.NoDisengage"
});

/**
 * **WHETHER THIS CREATURE MAY DISENGAGE**: the first bar that holds, as the lang key and the data
 * it is said with, or null.
 *
 * @param {{name?: string, anchoredBy?: string[], heavy?: {name: string, talent: string}|null,
 *   relentless?: {name: string, talent: string}|null, chained?: {source: string}|null}} facts
 * @returns {{bar: string, key: string, data: object}|null}
 */
export function disengageBar({ name = "", anchoredBy = [], heavy = null, relentless = null, chained = null } = {}) {
  // 04's Anchor keeps its own reading (`rules/reactions.mjs#disengageRefusal`), asked here.
  const anchored = disengageRefusal(anchoredBy);
  if (anchored) return { bar: "anchored", key: anchored.key, data: { name, ...anchored.params } };
  if (heavy) return { bar: "heavyHours", key: DISENGAGE_BAR_KEYS.heavyHours, data: { name, holder: heavy.name ?? "", talent: heavy.talent ?? "" } };
  if (relentless) return { bar: "relentless", key: DISENGAGE_BAR_KEYS.relentless, data: { name, holder: relentless.name ?? "", talent: relentless.talent ?? "" } };
  if (chained) return { bar: "chained", key: DISENGAGE_BAR_KEYS.chained, data: { name, spell: chained.source ?? "" } };
  return null;
}
