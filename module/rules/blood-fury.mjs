/**
 * **02 §5's BLOOD FURY, FOR AN ORC WITH NO MOMENTUM POOL TO TAKE IT** (the
 * lead, 2026-11-02; D-798). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * *Once per encounter, spend a Half-Action to gain 2 Momentum.* A Momentum pool
 * is a class's - Rage, Zeal, Ferocity, Quarry, Combo Points (05 §11) - so an
 * orc Shaman, Warlock, Mage or Priest held none, and the Use spent its
 * Half-Action and its use and did nothing: `workflows.useFeature` found no pool
 * of the kind and wrote nothing. The lead's ruling: *for a character with no
 * Momentum pool, Blood Fury instead grants +1 to physical damage and +1 to
 * spell damage (Damage Rating bonus on both).* 02 says it as *your weapon
 * attacks and spells instead add 1 to their Damage Rating until the encounter
 * ends*.
 *
 * **ONE DOOR, TWO OUTCOMES** (`gainOutcome`): a character holding ANY pool of
 * the Momentum kind - a multiclass Warrior/Shaman holds Rage - gains the 2
 * Momentum exactly as before and takes no damage; one holding none takes the
 * fury. The fury is `talent-effects.mjs#damageBuffFor`'s own shape, so it is
 * written as every encounter damage buff is (04's Seal of Command and The
 * Mountain Wakes): `final`-phase `add` changes on `system.damageBonus.attack.all`
 * and `.spell.all`, which the attack door (`actions.mjs`, `laneBonus(..,
 * "attack", ..)`), the spell door (`spell-bonus.mjs#standingSpellBonus`) and a
 * casting feature's door (`standingFeatureBonus`) already read.
 *
 * **MY READINGS, for the lead** (D-798):
 *
 * - *Physical damage* is the ATTACK lane - every weapon attack, whatever type
 *   an enchantment turns its damage into - rather than the Physical damage
 *   TYPE alone. `types: ["physical"]` on the attack lane is the one-word
 *   change if the type was meant.
 * - **The span is the encounter**, which the once-per-encounter use already
 *   names: in a started fight the effect carries no duration and
 *   `AzerothCombat#_leaveFight` lifts it with the fight's other encounter buffs
 *   (`talentBuff` and `until: "encounter"`). **Out of a fight there is no
 *   encounter to end**, so the span is the world's clock (D-778's rule for a
 *   Use out of a fight): `ENCOUNTER_CLOCK_ROUNDS` rounds of it, 13 §3's *No
 *   fight runs past six rounds* - the longest an encounter is meant to last.
 */

import { RACE_TRAITS } from "./class-features.mjs";
import { damageBuffFor } from "./talent-effects.mjs";

/** The trait's name, the races pack's and 02 §5's (`RACE_TRAITS.orc`). */
export const BLOOD_FURY = RACE_TRAITS.orc.name;

/** The feature item's identifier: the trait's name, slugified by the feature sync. */
export const BLOOD_FURY_ID = "blood-fury";

/** The flag the fury's effect carries, so a second Use replaces it rather than stacking. */
export const BLOOD_FURY_FLAG = "bloodFury";

/**
 * **THE FURY**: the lead's +1 to weapon attacks and +1 to spells, until the
 * encounter ends - a `damage` row in `talent-effects.mjs`' vocabulary, read by
 * its one builder (`damageBuffFor`).
 */
export const FURY = Object.freeze({
  damage: Object.freeze({ types: Object.freeze(["all"]), applies: "both", amount: 1, until: "encounter" })
});

/**
 * The rounds of the world's clock the fury lasts out of a fight: 13 §3's
 * *No fight runs past six rounds*, read off the chapter by the Vitest.
 */
export const ENCOUNTER_CLOCK_ROUNDS = 6;

/**
 * Whether a character holds a pool of the Momentum kind (05 §11), from any of
 * its classes: `actor.poolSnapshot()`'s rows.
 *
 * @param {Array<{kind?: string}>} [pools]
 * @returns {boolean}
 */
export function holdsMomentumPool(pools = []) {
  return (pools ?? []).some(p => p?.kind === "momentum");
}

/**
 * **WHAT A FEATURE'S `gain` DOES ON A USE** (02 §5, D-620, D-798).
 *
 * - `{kind: "pool", pool, amount}` - a pool of the gain's kind is held: the
 *   first one (the primary class's), and the amount it can still take, never
 *   past its cap;
 * - `{kind: "fury", until, amount, changes}` - Blood Fury, and no pool of the
 *   Momentum kind is held: `damageBuffFor(FURY)`;
 * - `{kind: "none"}` - nothing to gain, or a gain of another kind with no pool.
 *
 * @param {{gain?: {pool?: string|null, amount?: number}|null, pools?: object[], identifier?: string|null}} o
 * @returns {{kind: "pool", pool: object, amount: number}|{kind: "fury", until: string, amount: number, changes: object[]}|{kind: "none"}}
 */
export function gainOutcome({ gain = null, pools = [], identifier = null } = {}) {
  const amount = Math.trunc(Number(gain?.amount) || 0);
  if (!gain?.pool || amount <= 0) return { kind: "none" };
  const pool = (pools ?? []).find(p => p?.kind === gain.pool) ?? null;
  if (pool) {
    const room = Math.max(0, (Number(pool.max) || 0) - (Number(pool.value) || 0));
    return { kind: "pool", pool, amount: Math.max(0, Math.min(amount, room)) };
  }
  if (identifier === BLOOD_FURY_ID && gain.pool === "momentum") {
    const buff = damageBuffFor(FURY);
    if (buff) return { kind: "fury", ...buff };
  }
  return { kind: "none" };
}

/**
 * The Active Effect the fury lays on the orc: named for the trait, the trait's
 * text, the two lanes in the `final` phase, and the flags that make it what it
 * is - `talentBuff` and `until: "encounter"` for `_leaveFight`'s lift and for
 * the animation layer's loop (`rules/animation-records.mjs#stateEntriesOf`),
 * `bloodFury` for the door that replaces it.
 *
 * @param {{name?: string, img?: string|null, origin?: string|null, description?: string,
 *   changes?: object[], timing?: object|null}} o  `timing` a `{duration, start}` or null
 * @returns {object}
 */
export function furyEffectData({ name = BLOOD_FURY, img = null, origin = null, description = "", changes = [], timing = null } = {}) {
  return {
    name,
    ...(img ? { img } : {}),
    ...(origin ? { origin } : {}),
    description,
    system: { changes: changes.map(c => ({ ...c })) },
    ...(timing ?? {}),
    flags: { "azeroth-rpg": { talentBuff: name, until: "encounter", [BLOOD_FURY_FLAG]: true } }
  };
}
