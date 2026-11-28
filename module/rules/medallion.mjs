/**
 * **THE WITCH HUNTER'S MEDALLION AND ITS SPELL DC** (08 §11's Witch hunter's medallion; 02 §7's
 * Medallion feature; the Witch Hunter plan's *Other content*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The lead, 2026-11-26, verbatim: **"The medallion should be worn in a neck slot and each rarity above
 * common gives a +1 to casting tests for reach rarity up to epic"**. The draft text: *Each rarity above
 * Common adds 1 to your Spell DC, up to +3 at Epic.* Uncommon +1, Rare +2, Epic +3, Legendary +3.
 *
 * MY READING, accepted by the approval: a Witch Hunter makes no Casting Test (a creature resists a Sign
 * with a Resilience Test against the Spell DC), so the bonus lands on the Spell DC that Signs, bombs and
 * the non-maker's drink are resisted against. Legendary stays at +3.
 *
 * **A WITCH HUNTER'S BONUS ALONE** (D-2112, closing O-710's text half): 08 §11 says *A Witch Hunter
 * wearing it adds 1 to their Spell DC for each rarity above Common, up to +3 at Epic.* The only reader is
 * `witchHunterDC`, the class's own DC, so a caster of another class who wears one gains nothing.
 *
 * **THE SPELL DC STACK** (the plan's D1 note: *Firebloom cordial +2, a Spell DC feature or talent, and
 * the medallion's +3*): the class's own Spell DC (05's 10 + the Intelligence modifier + Proficiency, R6:
 * **"Intelligence. Constitution should be used for toxicity cap."**), plus the medallion while it is
 * worn in the Neck slot, plus Firebloom cordial's 1 (2 at tier 3 or higher) for a **Sign** alone (*Your
 * Spell DC for **Signs** rises by 1, or 2 at tier 3 or higher*).
 */

/** The medallion's identifier, the parser's slug of 08's row name. */
export const MEDALLION = "witch-hunters-medallion";

/** The slot it must be worn in (08 §11's Neck). */
export const MEDALLION_SLOT = "neck";

/** *A Witch Hunter wearing it adds 1 to their Spell DC for each rarity above Common, up to +3 at Epic.* Legendary stays at +3. */
export const MEDALLION_BONUS = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 });

/** The bonus a medallion of this rarity gives; an unknown rarity gives nothing. */
export function medallionBonus(rarity) {
  return MEDALLION_BONUS[String(rarity ?? "").toLowerCase()] ?? 0;
}

/** Whether an item is a Witch Hunter's medallion, by identifier. */
export function isMedallion(item) {
  const sys = item?.system ?? item ?? {};
  return sys.identifier === MEDALLION;
}

/**
 * **THE MEDALLION WORN IN THE NECK SLOT**, off the actor's items as plain rows: the first medallion that is
 * equipped and whose slot is the Neck, the highest rarity first, or null. A medallion carried in a bag
 * gives nothing, and neither does one with no slot.
 *
 * @param {Iterable<{type?: string, system?: {identifier?: string, equipped?: boolean, slot?: string, rarity?: string}}>} items
 * @returns {object|null}
 */
export function wornMedallion(items = []) {
  const worn = [...(items ?? [])].filter(i => i && isMedallion(i) && i.system?.equipped === true && i.system?.slot === MEDALLION_SLOT);
  worn.sort((a, b) => medallionBonus(b.system?.rarity) - medallionBonus(a.system?.rarity) || String(a.id ?? a._id ?? "").localeCompare(String(b.id ?? b._id ?? "")));
  return worn[0] ?? null;
}

/** The Spell DC bonus the actor's worn medallion gives, 0 with none worn. */
export function medallionDCBonus(items = []) {
  const m = wornMedallion(items);
  return m ? medallionBonus(m.system?.rarity) : 0;
}

/** 08 §12's Firebloom cordial: *Your Spell DC for **Signs** rises by 1, or 2 at tier 3 or higher.* */
export function firebloomBonus(tier = 1) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  return t >= 3 ? 2 : 1;
}

/**
 * **THE DC A CREATURE RESISTS THE WITCH HUNTER AGAINST**: the class's Spell DC, the worn medallion's bonus,
 * and - for a Sign alone - Firebloom cordial while it acts on the Witch Hunter. Null where there is no
 * Spell DC to add to.
 *
 * @param {{spellDC?: number|null, medallion?: number, firebloom?: boolean, tier?: number, sign?: boolean}} o
 *   `medallion` the worn medallion's bonus (`medallionDCBonus`); `firebloom` whether the cordial acts on
 *   the Witch Hunter; `sign` whether the DC is a Sign's
 * @returns {number|null}
 */
export function witchHunterDC({ spellDC = null, medallion = 0, firebloom = false, tier = 1, sign = false } = {}) {
  if (spellDC === null || spellDC === undefined || !Number.isFinite(Number(spellDC))) return null;
  const worn = Math.max(0, Math.trunc(Number(medallion)) || 0);
  const cordial = sign === true && firebloom === true ? firebloomBonus(tier) : 0;
  return Math.trunc(Number(spellDC)) + worn + cordial;
}
