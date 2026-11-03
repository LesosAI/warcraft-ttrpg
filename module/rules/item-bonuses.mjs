/**
 * A GM's own bonuses on a thing: Spellpower, Damage Rating, an Attack Test bonus
 * and a Casting Test bonus (the lead, 2026-11-02: the GM can always add them on
 * the item's edit menu). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * **They are a tool's number, not the book's.** 08 §6's affix pool sells none of
 * them as a flat line and 08 §20's Signatures are gated, so a GM who wants a
 * ring that adds 2 to every Casting Test has no way to say it. This is that way,
 * and it stays out of the book's own fields: `system.bonus` is stored beside
 * `grants` and never rewrites a number the chapter owns (`rating`, `apBonus`).
 *
 * **Every one counts only while the thing is EQUIPPED**, like every other grant
 * (08 §6): a ring in the pack is not worn.
 *
 * **They ride the doors that already exist** rather than a second reader:
 *  - Spellpower and the Attack bonus are grant SENTENCES (`bonusGrants`), so
 *    `grants.mjs#grantsOn` hands them to `grantsFor` and they land on the same
 *    Spellpower-by-school map and `attackBonus` scalar a worn Signature uses,
 *    with the item's name as their source.
 *  - Damage Rating joins the character's `damageBonus.attack.all` lane, the one
 *    the attack door already reads.
 *  - The Casting bonus is `castingBonusOf`, a line on the Casting Test.
 */

/** The four numbers, in the order the sheet draws them. */
export const BONUS_KEYS = Object.freeze(["spellpower", "damageRating", "attack", "casting"]);

/** The largest magnitude a bonus may carry: a GM's typo is not a rule. */
export const BONUS_LIMIT = 20;

/** A whole number inside the limit; anything else is 0. */
export function cleanPoints(value, { min = -BONUS_LIMIT } = {}) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(BONUS_LIMIT, n));
}

/**
 * A stored `bonus` made valid, **only where a key is PRESENT** (CLAUDE.md §15,
 * and recursively): `migrateData` runs over partial update data too, so
 * `update({"system.bonus.attack": 2})` must not write a zero over Spellpower.
 * Mutates and returns its argument, as every `cleanX` here does.
 *
 * @param {object|undefined} bonus
 * @param {(school: string) => boolean} [knownSchool]
 */
export function cleanBonus(bonus, knownSchool = () => true) {
  if (!bonus || typeof bonus !== "object") return bonus;
  // Damage Rating and the Casting bonus may be penalties (a cursed ring); the
  // Attack bonus and Spellpower are grant sentences, which carry no minus.
  for (const key of ["damageRating", "casting"]) {
    if (key in bonus) bonus[key] = cleanPoints(bonus[key]);
  }
  if ("attack" in bonus) bonus.attack = cleanPoints(bonus.attack, { min: 0 });
  const sp = bonus.spellpower;
  if (sp && typeof sp === "object") {
    if ("points" in sp) sp.points = cleanPoints(sp.points, { min: 0 });
    if ("school" in sp && sp.school !== null && !knownSchool(sp.school)) sp.school = null;
  }
  return bonus;
}

/** Whether a stored bonus carries anything at all. */
export function hasBonus(bonus) {
  return Boolean(
    Number(bonus?.spellpower?.points) || Number(bonus?.damageRating)
    || Number(bonus?.attack) || Number(bonus?.casting)
  );
}

/**
 * The grant SENTENCES a bonus composes, in 08 §6's grammar, so `parseGrant`
 * reads them like any other: `+2 Spellpower in Fire`, `+1 Attack`. Neither
 * takes a penalty (the grammar has no minus), so both are cleaned to 0 or more.
 *
 * **Spellpower with no school grants nothing**: Spellpower is by school
 * (the map `grantsFor` builds), and an unmade choice is not an error, exactly
 * as 08 §10's `1, one school` is quiet until the wearer picks.
 *
 * Damage Rating and the Casting bonus are NOT sentences: `grantsFor` drops the
 * first (it is stamped on the item's own number) and the second has no family.
 *
 * @param {object|undefined} bonus
 * @param {(school: string) => string} [labelOf]  a school key to the word the
 *   sentence prints; the default capitalises, as `schoolGrants` does
 * @returns {string[]}
 */
export function bonusGrants(bonus, labelOf = key => String(key).charAt(0).toUpperCase() + String(key).slice(1)) {
  const out = [];
  const sp = bonus?.spellpower;
  const points = cleanPoints(sp?.points);
  if (points > 0 && sp?.school) out.push(`+${points} Spellpower in ${labelOf(sp.school)}`);
  const attack = cleanPoints(bonus?.attack);
  if (attack > 0) out.push(`+${attack} Attack`);
  return out;
}

/**
 * What a character's EQUIPPED things add by the two numbers that have no grant
 * sentence. A penalty is kept (a cursed ring) and subtracts.
 *
 * @param {Array<{equipped?: boolean, bonus?: object}>} items  plain snapshots
 * @returns {{damageRating: number, casting: number, sources: {damageRating: Array<{name: string, points: number}>, casting: Array<{name: string, points: number}>}}}
 */
export function bonusTotals(items = []) {
  const out = { damageRating: 0, casting: 0, sources: { damageRating: [], casting: [] } };
  for (const item of items) {
    if (!item?.equipped) continue;
    for (const key of ["damageRating", "casting"]) {
      const points = cleanPoints(item.bonus?.[key]);
      if (!points) continue;
      out[key] += points;
      out.sources[key].push({ name: item.name ?? "", points });
    }
  }
  return out;
}

/** The Casting Test line a roll adds, or null where there is none. */
export function castingBonusOf(total) {
  const n = cleanPoints(total);
  return n ? n : null;
}
