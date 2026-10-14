/**
 * Swarms (13 §4, D-548/D-549; D-646). Pure: no Foundry.
 *
 * Creatures of one kind fighting together in the chapter's numbers are run
 * as one body: Health and Threat Share the total of the members, Defense two
 * lower than one member, everything else one member's. Below half its
 * Health a swarm is Thinned - its attack takes a Bane and its Damage Rating
 * drops by two - and a swarm takes a Bane on Reflex Resilience Tests. It has
 * no Critical Injury table. The attack resolves against every creature it is
 * engaged with, and a Test it forces is made once a turn.
 */

import { WEIGHTS } from "./bestiary.mjs";

/** "Swarms from": the members a weight class needs, or null where it never swarms. */
export const SWARMS_FROM = Object.freeze({ chaff: 6, soldier: 5, standard: 4, elite: null, boss: null });

/** A swarm's Defense is two lower than one member's. */
export const SWARM_DEFENSE_DROP = 2;

/** A Thinned swarm's Damage Rating drops by two. */
export const THINNED_RATING_DROP = 2;

/** Whether the weight class swarms at all. */
export function canSwarm(weightClass) {
  return (SWARMS_FROM[weightClass] ?? null) !== null;
}

/** The members the weight class swarms from, or null. */
export function swarmsFrom(weightClass) {
  return SWARMS_FROM[weightClass] ?? null;
}

/**
 * The numbers a swarm takes from one member (13 §4, *Building one*).
 * @param {{health: number, defense: number, weightClass?: string, threatShare?: number|null}} member
 * @param {number} members
 */
export function buildSwarm(member = {}, members = 2) {
  const n = Math.max(2, Math.trunc(Number(members)) || 2);
  const health = Math.max(1, Math.trunc(Number(member.health)) || 1) * n;
  const share = member.threatShare ?? WEIGHTS[member.weightClass]?.share ?? null;
  return {
    members: n,
    health: { value: health, max: health },
    defense: Math.max(0, (Math.trunc(Number(member.defense)) || 0) - SWARM_DEFENSE_DROP),
    threatShare: share === null ? null : Math.round(share * n * 100) / 100
  };
}

/** Below half its Health - strictly - a swarm is Thinned. */
export function isThinned({ value = 0, max = 0 } = {}) {
  const m = Number(max) || 0;
  if (m <= 0) return false;
  return (Number(value) || 0) < m / 2;
}

/** A Thinned swarm's Damage Rating, never below 0. */
export function thinnedRating(rating = 0) {
  return Math.max(0, (Number(rating) || 0) - THINNED_RATING_DROP);
}

/**
 * What the band wants of a swarm: its members' Health, Defense two under, the
 * members' Threat Share. For `review`.
 */
export function swarmExpectations({ weightClass = "standard", members = 2, band = {} } = {}) {
  const n = Math.max(2, Math.trunc(Number(members)) || 2);
  const share = WEIGHTS[weightClass]?.share ?? null;
  return {
    health: (Number(band.health) || 0) * n,
    defense: Math.max(0, (Number(band.defense) || 0) - SWARM_DEFENSE_DROP),
    threatShare: share === null ? null : Math.round(share * n * 100) / 100
  };
}
