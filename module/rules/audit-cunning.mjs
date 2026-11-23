/**
 * **THE CLASS TALENT AUDIT'S SHAMAN CAPSTONES AND PRIEST AREAS, AS NUMBERS** (D-1885 to
 * D-1887). Pure: no Foundry imports (CLAUDE.md §3). The writes are
 * `effects/audit-cunning.mjs`'s.
 *
 * - **Eye of the Storm** (04, the Elemental capstone): *at the start of each of your turns
 *   one creature of your choice within 60 feet takes Nature damage equal to your tier plus
 *   2, and you gain a Static Charge ... Sustaining it costs 2 Mana a turn*.
 * - **Tide of the Ancestors** (04, the Restoration capstone): *set a totem within 5 feet of
 *   you ... every friendly target within 30 feet of it regains Health equal to your tier,
 *   and one condition on one of them ends. It lasts until the encounter ends*.
 * - **Herald of the Void** (04, the Shadow capstone): *one other creature of your choice
 *   within 10 feet of it takes the same damage*.
 *
 * Both strikes are judged by one shape (`oneStrikeRefusal`): one creature, once, within the feet,
 * and never on a distance nobody could measure.
 */

/** Eye of the Storm's numbers, as 04 prints them. */
export const EYE_OF_THE_STORM = Object.freeze({ identifier: "eye-of-the-storm", feet: 60, add: 2, damageType: "nature", upkeep: 2 });

/** Tide of the Ancestors' numbers, as 04 prints them. */
export const TIDE_OF_THE_ANCESTORS = Object.freeze({ identifier: "tide-of-the-ancestors", totem: "Tide of the Ancestors", within: 5, feet: 30, cures: 1 });

/** Herald of the Void's spread, as 04 prints it. */
export const HERALD_OF_THE_VOID = Object.freeze({ identifier: "herald-of-the-void", feet: 10, school: "shadow", sustains: 1 });

/** Eye of the Storm's strike at a tier: the tier plus 2. */
export function eyeStrikeAmount(tier = 1) {
  return Math.max(1, Math.trunc(Number(tier)) || 1) + EYE_OF_THE_STORM.add;
}

/** Tide of the Ancestors' heal at a tier: the tier. */
export function tideHealAmount(tier = 1) {
  return Math.max(1, Math.trunc(Number(tier)) || 1);
}

/**
 * The Tide totem's bond, read off a bound creature's bond record: a totem bound by Tide of
 * the Ancestors' Use carries the feature's name as its source (`documents/bound.mjs`).
 *
 * @param {object|null} bond  `flags.azeroth-rpg.bond`
 */
export function isTideBond(bond) {
  return bond?.kind === "totem" && bond?.sourceName === TIDE_OF_THE_ANCESTORS.totem;
}

/**
 * **HERALD OF THE VOID'S SPREAD, JUDGED** off a tick that landed: a Shadow tick of a spell
 * the caster sustains, the herald's minute standing, damage dealt. Whom it spreads to is the
 * caster's choice, and the card names the amount.
 *
 * @param {{standing?: boolean, sustained?: boolean, type?: string|null, dealt?: number}} o
 * @returns {number}  the damage to spread, 0 for none
 */
export function heraldSpread({ standing = false, sustained = false, type = null, dealt = 0 } = {}) {
  if (standing !== true || sustained !== true || type !== HERALD_OF_THE_VOID.school) return 0;
  return Math.max(0, Math.trunc(Number(dealt)) || 0);
}

/**
 * **MIRACLE'S MEND** (04: *For one minute your Mend class feature costs no Mana, and once a
 * round you may use it as a Reaction*): what the minute does to one Use of Mend.
 *
 * @param {{standing?: boolean, name?: string, roundHeld?: boolean}} o  `roundHeld` the
 *   round's record already holds this round's Reaction
 * @returns {{free: boolean, rungs: string[]}}
 */
export function miracleMend({ standing = false, name = "", roundHeld = false } = {}) {
  if (standing !== true || name !== "Mend") return { free: false, rungs: [] };
  return { free: true, rungs: roundHeld ? ["half"] : ["half", "reaction"] };
}

/**
 * **TIDE OF THE ANCESTORS' ONE CONDITION** (*and one condition on one of them ends*; the wave 2
 * review): the chooser's options, one a creature healed and a condition it holds that may be
 * ended, keyed `<uuid>|<condition>`, in the order the creatures were healed and the conditions
 * sorted. Empty where nobody holds one.
 *
 * @param {Array<{uuid: string, name: string, conditions: string[]}>} rows
 * @param {(id: string) => string} [label]  a condition's words
 * @returns {Array<{key: string, name: string, description: string}>}
 */
export function tideConditionOptions(rows = [], label = id => id) {
  const out = [];
  for (const r of rows ?? []) {
    if (!r?.uuid) continue;
    for (const id of [...(r.conditions ?? [])].filter(c => typeof c === "string" && c).sort()) {
      out.push({ key: `${r.uuid}|${id}`, name: `${r.name ?? ""}: ${label(id)}`, description: "" });
    }
  }
  return out;
}

/**
 * The pick a chooser answered, held to the options offered: `{uuid, id}`, or null for a key no
 * option carries (an answer from another client is never trusted past the list).
 *
 * @param {string|null} key
 * @param {Array<{key: string}>} options
 */
export function tidePick(key, options = []) {
  if (typeof key !== "string" || !(options ?? []).some(o => o.key === key)) return null;
  const at = key.lastIndexOf("|");
  return at > 0 ? { uuid: key.slice(0, at), id: key.slice(at + 1) } : null;
}

/**
 * **ONE CREATURE STRUCK ONCE, WITHIN SO MANY FEET** (the shape Eye of the Storm's and Herald of
 * the Void's cards share): the card not yet struck, exactly one creature named, not the one the
 * words exclude, and - where `measured` says the door has measured - a distance there is and that
 * is within `max`. **An unmeasured distance fails CLOSED at the landing** (the class talent audit's
 * final review): a creature with no token on the scene the card names cannot be shown to be in
 * reach, so the strike refuses in words rather than landing anywhere. The pre-check before the
 * door measures (`measured` false) judges the count and the record alone.
 *
 * @param {{named?: number, feet?: number|null, struck?: boolean, same?: boolean, measured?: boolean, max: number}} o
 * @returns {"one"|"other"|"far"|"unmeasured"|"struck"|null}
 */
function oneStrikeRefusal({ named = 0, feet = null, struck = false, same = false, measured = false, max } = {}) {
  if (struck === true) return "struck";
  if ((Math.trunc(Number(named)) || 0) !== 1) return "one";
  if (same === true) return "other";
  const known = feet !== null && feet !== undefined && Number.isFinite(Number(feet));
  if (measured === true && !known) return "unmeasured";
  if (known && Number(feet) > max) return "far";
  return null;
}

/**
 * **EYE OF THE STORM'S STRIKE, JUDGED AT ITS APPLY** (*one creature of your choice within 60
 * feet*; the wave 2 review): one creature, within the feet, and the card not yet struck - and at
 * the landing (`measured`) a distance that could be measured (the final review). A refusal key's
 * tail, or null.
 *
 * @param {{named?: number, feet?: number|null, struck?: boolean, measured?: boolean}} o
 * @returns {"one"|"far"|"unmeasured"|"struck"|null}
 */
export function eyeStrikeRefusal({ named = 0, feet = null, struck = false, measured = false } = {}) {
  return oneStrikeRefusal({ named, feet, struck, measured, max: EYE_OF_THE_STORM.feet });
}

/**
 * **HERALD OF THE VOID'S SPREAD, JUDGED AT ITS APPLY** (*one other creature of your choice within
 * 10 feet of it takes the same damage*; the class talent audit's final review): exactly one creature,
 * not the one the tick struck (`same`), within 10 feet of that one, and the card not yet struck -
 * at the landing (`measured`) a distance that could be measured. A refusal key's tail, or null.
 *
 * @param {{named?: number, feet?: number|null, struck?: boolean, same?: boolean, measured?: boolean}} o
 * @returns {"one"|"other"|"far"|"unmeasured"|"struck"|null}
 */
export function heraldStrikeRefusal({ named = 0, feet = null, struck = false, same = false, measured = false } = {}) {
  return oneStrikeRefusal({ named, feet, struck, same, measured, max: HERALD_OF_THE_VOID.feet });
}

/**
 * **THE DAMAGE HERALD OF THE VOID'S CARD CARRIES** (*the same damage*): the amount the card recorded
 * when the tick landed, a whole number at least 0 - read off the card, never off a request.
 *
 * @param {object|null} flags  the card's `flags.azeroth-rpg`
 * @returns {number}
 */
export function heraldCardAmount(flags) {
  return Math.max(0, Math.trunc(Number(flags?.heraldAmount)) || 0);
}
