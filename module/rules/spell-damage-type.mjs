/**
 * **A SPELL'S DAMAGE TYPE, AND THE LANE IT TAKES AT EVERY SPELL DAMAGE DOOR**
 * (07 §9, D-853, D-864; the lead: *"sand school spells hsould deal physical damage,
 * reduced by armor points not ward"*, and asked whether Sand is a school: **Arcane
 * spells, Physical damage**; on the location: *"true"* - the Body, no called shot).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 07 §9: *A spell that deals Physical damage meets Armor Points, not Ward. It strikes
 * the Body, and the target's Body Armor Points come off its damage. It takes no called
 * shot. No Ward comes off its damage or its Success Level.*
 *
 * A sand spell keeps `system.school: "arcane"` (its Restricted line, the Augment, its
 * Arcane Spellpower and Mana discounts) and stamps `system.damage.type: "physical"`
 * beside a null `damage.school` (the parser, D-853). **Every door that resolves a
 * spell's damage asks `spellDamageLane`**, never `damage.school ?? school` on its own:
 * the cast's card (`dice/workflows.mjs#castSpell`), an area's tick, entry and failed
 * Test (`effects/area-strikes.mjs#areaDamageOn`, which `AzerothCombat#_areaTicks` and a
 * laid tick through `_effectTicks` both reach), and a retaliation. A census in
 * `spell-damage-type.test.mjs` fails a spell damage door that types a spell by its
 * school without reading the damage type.
 *
 * **Spellpower, a Signature scoped to a school and a talent's spell damage read the
 * spell's SCHOOL** (the lead's call in the plan: *Gear's spell damage and Mana discounts
 * reach the sand spells by the spell's school (Arcane)*) - `bonusSchool` - while Ward,
 * an ally's school armor, Immune and Vulnerable read the damage TYPE.
 */

/** The one damage type a spell may deal that is not one of 07's seven schools. */
export const PHYSICAL = "physical";

/** 07's seven schools, the words the chapter writes (06 §4's keyword space). */
const SCHOOL_WORDS = Object.freeze(["fire", "frost", "arcane", "nature", "shadow", "fel", "holy"]);

/**
 * **A DAMAGE WORD AS 07 WRITES IT, AS A KEY**: *Fire* is `fire`, *Physical* is
 * `physical`, anything else null. Every reader of a sentence's damage (`area-ticks`,
 * `ticks`, `splash`) reads its word through this, so a sand spell's *takes 5 Physical
 * damage* is read where a school's always was.
 *
 * @param {string|null|undefined} word
 * @returns {string|null}
 */
export function damageTypeKey(word) {
  const w = String(word ?? "").trim().toLowerCase();
  if (w === PHYSICAL) return PHYSICAL;
  return SCHOOL_WORDS.includes(w) ? w : null;
}

/** Whether a stored damage-type key is one a descriptor may carry: a school or `physical`. */
export function isDamageTypeKey(key) {
  return typeof key === "string" && (key === PHYSICAL || SCHOOL_WORDS.includes(key));
}

/**
 * **THE TYPE A SPELL'S OWN DAMAGE IS**: `physical` for a sand spell, else the
 * damage's school, else the spell's. A world copy stored before D-853 carries no
 * `damage.type` and reads as its school, exactly as it did.
 *
 * @param {{school?: string|null, damage?: {school?: string|null, type?: string|null}}} sys
 * @returns {string|null}
 */
export function spellDamageType(sys = {}) {
  if (sys?.damage?.type === PHYSICAL) return PHYSICAL;
  return sys?.damage?.school ?? sys?.school ?? null;
}

/**
 * **THE LANE ONE SPELL BLOW TAKES**, as `resolveDamage`'s own fields.
 *
 * - **Physical** (07 §9): `kind: "physical"` at the **Body**, the target's Armor
 *   Points by location; no Ward, no ally's school armor, no Pierce (a spell carries
 *   none), and the Success Level never adds (D-330).
 * - **A school**: `kind: "magical"` of that school, its Ward and an ally's school
 *   armor, as every spell has always been resolved.
 *
 * `bonusSchool` is what Spellpower, a school Signature and a talent's spell damage
 * read: the spell's own school, whatever the damage's type.
 *
 * @param {{type: string|null, spellSchool?: string|null, apByLocation?: object,
 *   ward?: number, schoolArmor?: number}} o
 * @returns {{kind: "physical"|"magical", school: string|null, location: "body",
 *   apByLocation: object, ward: number, schoolArmor: number, penetration: 0,
 *   slAddsToDamage: false, bonusSchool: string|null, physical: boolean}}
 */
export function spellDamageLane({ type = null, spellSchool = null, apByLocation = {}, ward = 0, schoolArmor = 0 } = {}) {
  if (type === PHYSICAL) {
    return {
      kind: "physical", school: PHYSICAL, location: "body", apByLocation: apByLocation ?? {},
      ward: 0, schoolArmor: 0, penetration: 0, slAddsToDamage: false,
      bonusSchool: spellSchool ?? null, physical: true
    };
  }
  return {
    kind: "magical", school: type, location: "body", apByLocation: {},
    ward: Math.max(0, Math.trunc(Number(ward)) || 0), schoolArmor: Math.max(0, Math.trunc(Number(schoolArmor)) || 0),
    penetration: 0, slAddsToDamage: false, bonusSchool: spellSchool ?? type ?? null, physical: false
  };
}
