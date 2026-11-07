/**
 * **ONE DOOR FOR A SKILL TEST'S NUMBERS** (05 §1, §8; D-810). Pure: no Foundry
 * import, read off a plain snapshot or a document alike.
 *
 * A Skill Test adds the SKILL modifier of the ability the skill reads, the
 * Proficiency Bonus and the Skill Rank. Five doors built those three rows by
 * hand before this - the character sheet, the creature sheet, Hide (and so 04's
 * Preparation and a creature's sneak), and the Medicine Test against a disease -
 * and the last of them read a character's Rank off `system.skills`, which only a
 * creature has, so every character healer rolled at Rank 0 (fault F1). Every
 * Skill Test spec takes its rows from `skillRowsFor`; `skill-modifier.test.mjs`
 * fails a door that builds them any other way.
 */

import { AZEROTH } from "../config.mjs";

/**
 * The label of each ability's skill modifier on a roll's provenance, written out
 * so the keys are greppable (CLAUDE.md §11) and `lang-unused` sees them read.
 */
export const SKILL_MODIFIER_LABEL = Object.freeze({
  str: "AZEROTH.Ability.Str.Skill",
  dex: "AZEROTH.Ability.Dex.Skill",
  con: "AZEROTH.Ability.Con.Skill",
  int: "AZEROTH.Ability.Int.Skill",
  wis: "AZEROTH.Ability.Wis.Skill",
  cha: "AZEROTH.Ability.Cha.Skill"
});

/**
 * The Rank an actor holds in a skill, whichever kind of actor it is.
 *
 * A character's Ranks live on the `azeroth-rpg.skillRanks` flag; a creature's
 * on `system.skills`, a `TypedObjectField` whose value is a bare number or a
 * `{rank}` row (D-637).
 *
 * @param {{type?: string, system?: object, flags?: object}|null} actor
 * @param {string} key  a skill key
 * @returns {number}
 */
export function skillRankOf(actor, key) {
  if (!actor || !key) return 0;
  if (actor.type === "npc") {
    const raw = actor.system?.skills?.[key];
    const rank = typeof raw === "number" ? raw : raw?.rank;
    return Number(rank) || 0;
  }
  return Number(actor.flags?.["azeroth-rpg"]?.skillRanks?.[key]) || 0;
}

/**
 * The three provenance rows of a Skill Test: the ability's skill modifier, the
 * Proficiency Bonus, the Rank. A score the creature does not have (an em-dash,
 * D4 §10.2) has no skill modifier; the row carries 0 and the door that can say
 * so in words (the creature sheet) refuses the roll first.
 *
 * @param {{ability: string, skillMod?: number|null, proficiency?: number, rank?: number}} o
 * @returns {Array<{label: string, value: number}>}
 */
export function skillRows({ ability, skillMod = 0, proficiency = 0, rank = 0 } = {}) {
  return [
    { label: SKILL_MODIFIER_LABEL[ability] ?? AZEROTH.abilities[ability] ?? "", value: Number(skillMod) || 0 },
    { label: "AZEROTH.Sheet.Proficiency", value: Number(proficiency) || 0 },
    { label: "AZEROTH.Sheet.Rank", value: Number(rank) || 0 }
  ];
}

/**
 * The skill modifier an actor's derived data holds for an ability, or null for
 * a score it does not have. Reads `abilities[a].skillMod`, which both actor
 * models derive off the score's TOTAL (05 §1, D-810).
 *
 * @param {{system?: object}|null} actor
 * @param {string} ability
 * @returns {number|null}
 */
export function skillModOf(actor, ability) {
  const a = actor?.system?.abilities?.[ability];
  if (!a || a.value === null || a.value === undefined) return null;
  const mod = a.skillMod;
  return typeof mod === "number" && Number.isFinite(mod) ? mod : null;
}

/**
 * **THE ONE DOOR**: the rows of a Skill Test this actor makes in this skill.
 *
 * @param {{type?: string, system?: object, flags?: object}|null} actor
 * @param {string} key  a skill key
 * @returns {Array<{label: string, value: number}>}
 */
export function skillRowsFor(actor, key) {
  const ability = AZEROTH.skillAbility[key];
  return skillRows({
    ability,
    skillMod: skillModOf(actor, ability) ?? 0,
    proficiency: actor?.system?.proficiency ?? 0,
    rank: skillRankOf(actor, key)
  });
}

/**
 * A modifier as the sheet prints it: a real minus sign or a plus, the
 * `azerothSigned` Handlebars helper's own form, for a tooltip built in code.
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function signedModifier(n) {
  const v = Number(n) || 0;
  return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
}

/**
 * The total a sheet prints beside a skill: the three rows summed.
 *
 * @param {{type?: string, system?: object, flags?: object}|null} actor
 * @param {string} key
 * @returns {number}
 */
export function skillTotalFor(actor, key) {
  return skillRowsFor(actor, key).reduce((sum, row) => sum + row.value, 0);
}
