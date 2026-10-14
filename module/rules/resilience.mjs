/**
 * Resilience Tests (05): Body on Constitution, Reflex on Dexterity, Spirit
 * on Wisdom; a class trains some of them, and a trained Resilience adds the
 * Proficiency Bonus. Pure: no Foundry.
 *
 * One function for the sheet's chip, the exposure workflow and the NPC, so
 * the three cannot disagree about what a trained Resilience adds - the sheet
 * used to compute this privately and the exposure workflow ignored training.
 */

import { AZEROTH } from "../config.mjs";

/** The ability a Resilience reads (05). */
export function resilienceAbility(resilience) {
  return AZEROTH.resilienceAbility[resilience] ?? null;
}

/** The Resilience an ability answers for, or null where it answers none. */
export function resilienceOfAbility(ability) {
  const entry = Object.entries(AZEROTH.resilienceAbility).find(([, a]) => a === ability);
  return entry ? entry[0] : null;
}

/**
 * The modifier a Resilience Test carries.
 * @param {object} o
 * @param {number} o.abilityMod
 * @param {number} [o.proficiency]
 * @param {boolean} [o.trained]
 */
export function resilienceModifier({ abilityMod = 0, proficiency = 0, trained = false } = {}) {
  return abilityMod + (trained ? proficiency : 0);
}

/**
 * The provenance rows for a Resilience Test, in the order the card shows them.
 * @returns {Array<{label: string, value: number}>}
 */
export function resilienceRows({ resilience, abilityMod = 0, proficiency = 0, trained = false } = {}) {
  const ability = resilienceAbility(resilience);
  const rows = [{ label: AZEROTH.abilities[ability] ?? "AZEROTH.Sheet.Resilience", value: abilityMod }];
  if (trained) rows.push({ label: "AZEROTH.Sheet.Proficiency", value: proficiency });
  return rows;
}
