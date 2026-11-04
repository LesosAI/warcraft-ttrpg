/**
 * **THE CREATURE POISONS' CARRIER** (D12 section 2, Phase 5b). Pure.
 *
 * Virulent Poison, Vekniss Itch and Catalyst, Maggot Goo, Venom Spit, Dredge Poison,
 * Localized Toxin and Deadly Poison keep their own stacking, onset and per-stack damage
 * rules, and their own flag beside it. Each is also a valid affliction carrier
 * (`flags.azeroth-rpg.affliction`, kind "poison") so the sheet, the cures and the
 * Medicine and nullifier doors see it. Each is carried until cured: nothing counts
 * ticks down, and its damage repeats at the start of each of the carrier's turns in a
 * fight and once an hour of world time outside one.
 *
 * ONE CLOCK LANDS EACH BEAT. These modules keep their own advancer because their damage
 * is typed Nature damage that Ward reduces, one tick at a time. The carrier is marked
 * `repeat.beats: []` and `repeat.reason: OWN_CLOCK`, so `rules/afflictions.mjs`'s
 * `afflictionDue` and `turnBeat` (the shared clock) return nothing for it. Never give
 * one of these a shared beat as well: it would tick twice.
 */

import { AFFLICTION_FLAG, HOUR, makePoison } from "./afflictions.mjs";

export { AFFLICTION_FLAG, HOUR };
export const OWN_CLOCK = "own-clock";

/** True for a carrier whose beat belongs to its own module. */
export const ownsClock = aff => aff?.repeat?.reason === OWN_CLOCK;

/**
 * A whole carrier for one creature poison.
 * @param {object} o
 * @param {string} o.name        the poison's printed name
 * @param {string} o.key         a slug that does not collide with 08's poisons
 * @param {number} o.dc          the DC to shed its Poisoned stack
 * @param {string|null} [o.sourceUuid]
 * @param {string} [o.sourceName]
 * @param {number} [o.now]       world time, seconds
 * @param {boolean} [o.inFight]
 * @param {number} [o.value]     Poisoned value held (0 holds none)
 * @param {number} [o.damage]    Nature damage a beat lands now
 * @param {string[]} [o.statuses] statuses held (default Poisoned when value > 0)
 */
export function creaturePoisonAff({ name, key, dc, sourceUuid = null, sourceName = "", now = 0, inFight = false,
  value = 1, damage = 0, statuses = null } = {}) {
  const held = statuses ?? (value > 0 ? ["poisoned"] : []);
  return makePoison({
    name, key, dc, resilience: "body", source: { uuid: sourceUuid, name: sourceName }, now, inFight,
    carried: {
      carried: true, damage, fatigue: 0, statuses: held, value, firstTestBane: null,
      healingFactor: null, beats: [], reason: OWN_CLOCK
    }
  });
}

/** The dotted update that keeps the carrier's picture of its own dose current. */
export function creaturePoisonPatch({ value, damage, statuses } = {}) {
  const base = `flags.azeroth-rpg.${AFFLICTION_FLAG}.repeat`;
  const out = {};
  if (Number.isFinite(value)) out[`${base}.value`] = value;
  if (Number.isFinite(damage)) out[`${base}.damage`] = damage;
  if (Array.isArray(statuses)) out[`${base}.statuses`] = [...statuses];
  return out;
}
