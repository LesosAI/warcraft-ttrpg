/**
 * **SPELL SCHOOLS AND DAMAGE SCHOOLS** (D-941; the Death Knight plan, *The Death
 * school*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead: *"Death damage: **Shadow damage.** Death is a school for access. Its
 * spells deal Shadow damage, so Shadow Ward stops them and Shadow Spellpower adds
 * to them."* So there are two lists where there was one:
 *
 * - **the spell schools** (`AZEROTH.spellSchools`, eight): what a spell IS - the
 *   list a class learns from, 07's sections, the browser's facet;
 * - **the damage schools** (`AZEROTH.schools`, seven, plus Physical in
 *   `AZEROTH.damageTypes`): what a blow IS - Ward, Spellpower, school armor, the
 *   damage lanes, Immune and Vulnerable.
 *
 * A spell of a damage school (every one of the seven) reads its bonuses off its own
 * school, exactly as before. A spell of an ACCESS-ONLY school (Death) reads them off
 * the damage it deals, and where it deals none, off the school its damage would be
 * (`ACCESS_DAMAGE`). The Chronomancer's sand spell stays as D-853 built it: its school
 * is Arcane, a damage school, so its bonuses read Arcane while its blow is Physical.
 */

import { AZEROTH } from "../config.mjs";

/** The access-only school this plan adds. */
export const DEATH = "death";

/**
 * The damage school an access-only spell school's damage is, where its entry states
 * none (a Death heal, a Death roleplay spell): the lead's *"Death damage: Shadow
 * damage"*.
 */
export const ACCESS_DAMAGE = Object.freeze({ [DEATH]: "shadow" });

/** Whether a key is one of the seven DAMAGE schools (never Physical, never Death). */
export function isDamageSchool(key) {
  return typeof key === "string" && Object.hasOwn(AZEROTH.schools, key);
}

/** Whether a key is one of the eight SPELL schools. */
export function isSpellSchool(key) {
  return typeof key === "string" && Object.hasOwn(AZEROTH.spellSchools, key);
}

/**
 * The damage school a spell school's damage falls under: itself for the seven,
 * `ACCESS_DAMAGE` for Death, null for anything else.
 *
 * @param {string|null|undefined} spellSchool
 * @returns {string|null}
 */
export function damageSchoolOf(spellSchool) {
  if (isDamageSchool(spellSchool)) return spellSchool;
  return ACCESS_DAMAGE[spellSchool] ?? null;
}

/**
 * **THE SCHOOL A SPELL'S BONUSES READ** - Spellpower, a talent's spell damage, a
 * talent's Ward pierce, a Signature scoped to a school's spells: the spell's own
 * school where it is a damage school (a sand spell's Arcane, D-853), else the school
 * of the damage it deals (a Death spell's Shadow), else its access school's damage
 * school. The three readers the plan names - talent damage, `spellWardPierce` and
 * `spellDamageLane`'s `bonusSchool` - all ask this.
 *
 * @param {{school?: string|null, damageSchool?: string|null}} o
 * @returns {string|null}
 */
export function bonusSchool({ school = null, damageSchool = null } = {}) {
  if (isDamageSchool(school)) return school;
  if (isDamageSchool(damageSchool)) return damageSchool;
  return damageSchoolOf(school);
}
