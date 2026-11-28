/**
 * **THE WITCH HUNTER'S TEMPO** (02 §7; the Witch Hunter plan's R1, the class entry's *Tempo*
 * paragraph). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead's call, R1, verbatim: **"Tempo + Energy (Recommended)"**, whose option text reads
 * *Momentum "Tempo", cap 5, built by hits, with +1 on a hit against your prepared creature type;
 * it pays Parry, the maneuvers and the sword techniques.* The draft text the approval accepted:
 *
 * > **Tempo.** You begin every fight with none. You gain it from the two triggers in
 * > **05-CORE-RULES**, and a hit against a creature of a **Studied** type gives you 1 more. Your
 * > Tempo is capped at 5. When two rounds pass in which you hit nothing, it empties. A Critical
 * > Injury and the **Guard** action empty it. You spend it on **Parry**, on every maneuver, and
 * > where a feature or talent names it.
 *
 * **TEMPO IS NOT A KEPT POOL** (the plan's MY READING, accepted by the approval: *Tempo is a new,
 * non-kept Momentum type*). Every lifecycle step `momentum.mjs` already takes for an ordinary
 * Momentum pool is Tempo's, with nothing added: `fightStart` sets it to 0, `momentumAfter` and
 * `lossOnGuard` empty it on a Critical Injury and a Guard, `leaveFightPools` empties it as the fight
 * ends, and `gainOnHit` gives it 05 §11's +1 for a hit and +1 more at SL 2. It is in none of
 * `kept-pools.mjs#EMPTIED_BY`, `momentum.mjs#GUARD_KEEPS`, `runes.mjs#NO_UNIVERSAL_GAINS` or
 * `named-gains.mjs`, and `tempo.test.mjs` holds it out of all four.
 *
 * Three things are Tempo's own, and each lives in the one module its kind already lives in:
 *
 * - **The cap**: 5, 8 with 04's Ursine Fury, 10 while 02's The Last Hunt stands. `momentum.mjs
 *   #capFor` asks `tempoCap` (the flag `lastHunt` handed in by the caller, the talent read through
 *   `ranks(URSINE_FURY)` - a constant, so the inline census of 04's names reads it once the talent
 *   exists; `talent-effects.test.mjs`).
 * - **The idle drain**: Combo Points' rule (02 §7's *lose them all if you go two rounds without
 *   striking anything*), which `momentum.mjs#idleDecay` already holds; Tempo joins its
 *   `IDLE_DECAY_POOLS`.
 * - **The further 1 against a Studied type**: `poolExtra.tempo` at the hit door, the amount
 *   `TEMPO_STUDIED_EXTRA` (`tome.mjs#tomeHitBonus` hands it in).
 *
 * **WHAT TEMPO PAYS** (MY READING of R1 and the class text, for the lead): every cost a Momentum
 * pool pays by kind - **Parry** at 1 Tempo, every maneuver, and *any Momentum* - exactly as 02's
 * Tribute does (*on **Parry**, and on the maneuvers in **05-CORE-RULES***). So `essence.mjs
 * #paysByKind` answers true for it with no branch of its own, and Tempo is NOT in `reactions.mjs
 * #PARRY_ENERGY_MOMENTA`: unlike the Rogue's Combo Points and the Demon Hunter's Hatred, whose Parry
 * 06 §6 and 02 send to Energy, the Witch Hunter's Parry comes out of Tempo itself. Tempo never pays a
 * spell, because nothing asks a Momentum pool for one: a spell is paid from a Power pool by name
 * (`pools.mjs#poolNamed`), and the Witch Hunter casts no 07 spell.
 */

/** The pool's key, as `AZEROTH.momentumTypes` names it (wave 1c registers the type). */
export const TEMPO = "tempo";

/** The class's identifier, as 02 §7 heads it. */
export const WITCH_HUNTER = "witch-hunter";

/** *Your Tempo is capped at 5.* */
export const TEMPO_CAP_BASE = 5;

/** 04's Ursine Fury (Bear, tier 4): *Your Tempo is capped at 8 instead of 5.* */
export const URSINE_FURY = "Ursine Fury";
export const URSINE_FURY_CAP = 8;

/** 02's The Last Hunt (level 20): *your Tempo is capped at 10*, for 1 minute. */
export const THE_LAST_HUNT = "The Last Hunt";
export const THE_LAST_HUNT_CAP = 10;

/** *a hit against a creature of a **Studied** type gives you 1 more.* */
export const TEMPO_STUDIED_EXTRA = 1;

/** *What a **Parry** costs you*: 1 Tempo (06 §6's 1 Momentum, paid from Tempo itself). */
export const TEMPO_PARRY_COST = 1;

/**
 * *When two rounds pass in which you hit nothing, it empties* - the rounds without a hit that empty
 * it, read by `momentum.mjs#idleDecay` for Tempo exactly as for Combo Points.
 */
export const TEMPO_IDLE_ROUNDS = 2;

/** Whether a pool name is Tempo. */
export function isTempo(name) {
  return name === TEMPO;
}

/**
 * **TEMPO'S CAP**: 10 while The Last Hunt stands, else 8 with Ursine Fury, else 5. The two never
 * add: The Last Hunt *caps* it at 10, and 10 is above Ursine Fury's 8.
 *
 * @param {{ursineFury?: boolean, lastHunt?: boolean}} [o]
 * @returns {number}
 */
export function tempoCap({ ursineFury = false, lastHunt = false } = {}) {
  if (lastHunt === true) return THE_LAST_HUNT_CAP;
  if (ursineFury === true) return URSINE_FURY_CAP;
  return TEMPO_CAP_BASE;
}

/**
 * **THE TEMPO LEFT WHEN A CAP FALLS** (the plan's door note on The Last Hunt: *A flag read by
 * `capFor`, clipped when it ends*): what the pool holds, never above the cap it falls back to. A
 * value at or below the cap is returned as it is.
 *
 * @param {number} value  the Tempo held
 * @param {number} cap    the cap once The Last Hunt has ended (`tempoCap` without `lastHunt`)
 * @returns {number}
 */
export function tempoClip(value, cap) {
  const v = Math.max(0, Math.trunc(Number(value)) || 0);
  const c = Math.max(0, Math.trunc(Number(cap)) || 0);
  return Math.min(v, c);
}
