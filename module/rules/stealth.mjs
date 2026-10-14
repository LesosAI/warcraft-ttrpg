/**
 * Hiding (D-717). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * **THE BOOK HAS NO HIDDEN CONDITION** and D-717 does not add one: A1 holds
 * twelve conditions and *hidden* is not among them, while 02 §8 gives Stealth
 * as *moving unseen and unheard, opposed by Perception* and 04's Subtlety
 * branch and the Rogue's Vanish both use the word without defining it (O-113).
 * So this is a TOOL ruling and says so: the Test is 02 §8's Stealth against
 * 05 §5's Opposed DC 12, and what carries the result is **core's own
 * `invisible` status**, because that is the one thing in Foundry that takes a
 * token off the other players' screens while its owner keeps control and
 * vision of it.
 *
 * **Once a round, and it costs nothing.** The lead's ruling: a Hide button
 * beside Guard, Disengage and Ready that spends no Half-Action — so the only
 * thing bounding it is the round, and that bound is the combatant's own round
 * flag, exactly as 08 §5's Fast is bounded (D-662).
 *
 * Out of a fight there is no round to bound it with, and the Test is free
 * anyway: every fight control on the Combat tab works outside a fight (the
 * lead, 2026-09-04) and this one is no different.
 */

/** Core's own status id (`CONFIG.statusEffects.invisible`, verified at 14.367). */
export const HIDDEN_STATUS = "invisible";

/** 02 §8's skill: *moving unseen and unheard. Opposed by Perception.* */
export const STEALTH_SKILL = "stealth";

/** Why a Hide was refused, as an i18n key (CLAUDE.md §11). */
export const STEALTH_REFUSALS = Object.freeze({
  thisRound: "AZEROTH.Combat.StealthThisRound"
});

/**
 * Whether a Stealth Test may be made this round.
 *
 * @param {{number?: number, stealth?: boolean}|null} roundFlag
 *   The combatant's `azeroth-rpg.round` flag, the same one 08 §5's Fast marks.
 * @param {number|null} fightRound
 *   The round the fight is on, or null where there is no fight - and then
 *   there is no bound, because a round is what the limit counts.
 * @returns {{ok: boolean, reason: string|null}}
 */
export function stealthAllowed(roundFlag, fightRound = null) {
  if (fightRound === null || fightRound === undefined) return { ok: true, reason: null };
  const spent = roundFlag?.number === fightRound && roundFlag?.stealth === true;
  return spent ? { ok: false, reason: STEALTH_REFUSALS.thisRound } : { ok: true, reason: null };
}

/**
 * The round flag after a Stealth Test, keeping whatever else the round holds -
 * Fast's point, the hit that was struck - and stamping the round's number, so
 * a flag left over from an earlier round never reads as this round's spend.
 */
export function markStealth(roundFlag, fightRound) {
  const sameRound = roundFlag?.number === fightRound;
  return { ...(sameRound ? roundFlag : {}), number: fightRound, stealth: true };
}
