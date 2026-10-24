/**
 * **WHAT A SPELL DEALS AROUND ITS TARGET, A TEST AT A TIME** (07's Stormfury: *The target
 * takes 20 Nature damage, bypassing armor and Ward. Every creature within 15 feet of it
 * makes a Reflex Resilience Test against your Spell DC or takes 10 Nature damage. If the
 * target is wearing or holding metal it takes the Test with a Bane, and if it is standing
 * in water every creature in the water takes the 10 as well*; the B8a pass). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * Nothing carried the 10. The card dealt the Rating's 20 to the creature targeted and said
 * nothing of the creatures around it, so the Test the entry asks of them was never made and
 * its damage never landed - on a failure or otherwise. The splash is its own descriptor,
 * `system.splash`, read off the entry's own sentence by the parser:
 *
 * - **who**: every creature within `feet` of the target, **the target included** - *If the
 *   target is wearing or holding metal it takes the Test with a Bane* says the target makes
 *   the Test too - and the caster, where they stand inside (*every creature*);
 * - **what**: a Resilience Test against the caster's Spell DC, the `rating` of `school`
 *   landing on a failure and **nothing on a pass** - the failure's damage, as the B8a
 *   pass's `damage.onFail` is on a spell's own Rating (`rules/resisted.mjs`);
 * - **how**: each creature is posted the AREA TEST CARD a placed area posts (D-757's
 *   `effects/area-strikes.mjs#postAreaTest`, through `splashCheck`'s row), made once on its
 *   card and landed through `strikeFromArea` - Ward, Immune and Vulnerable, the caster's
 *   standing bonuses - so a splash needs no door of its own;
 * - **the table's**: the target's Bane for metal and the creatures standing in water (D2
 *   §12), named in `reason` and said on the card.
 *
 * 07's one other splash is not this one: Conflagration's *Every creature within 20 feet of
 * it takes 4 Fire damage with no Test* - no failure deals it, and whether its target takes
 * the 4 beside the 20 is a reading for the lead (Stormfury's target makes its Test by name,
 * Conflagration's is not said to). `SPLASH_UNREAD` names it with its reason, and the census
 * in `splash.test.mjs` fails an *Every creature within N feet of it* damage sentence 07
 * writes that is read by neither. A creature the GM names around the target (Arcane
 * Barrage's *a second creature*) and an arc (Chain Lightning's) are no *every creature*.
 */

import { AZEROTH } from "../config.mjs";
import { emptyCheck } from "./area-ticks.mjs";
import { flatText } from "./resisted.mjs";

/** *Every creature within 15 feet of it makes a Reflex Resilience Test against your Spell DC or takes 10 Nature damage*. */
export const SPLASH_RE = /\bEvery creature within (\d+) feet of it makes an? (Body|Reflex|Spirit) Resilience Test against your Spell DC or takes (\d+) ([A-Za-z]+) damage\b/i;

/**
 * **WHAT THE TABLE KEEPS OF A SPLASH**, in the entry's own clauses: each a pattern over
 * the flattened effect and the words the descriptor's `reason` carries for it.
 */
const SPLASH_TABLE_CLAUSES = Object.freeze([
  { re: /\bwearing or holding metal\b/i, text: "the target's Bane for wearing or holding metal" },
  { re: /\bstanding in water\b/i, text: "the creatures standing in water" }
]);

/**
 * **THE SPLASH SENTENCES 07 WRITES THAT `readSplash` DOES NOT TAKE**, by spell, with the
 * reason. The census fails a sentence the reader does not take and this list does not name.
 */
export const SPLASH_UNREAD = Object.freeze({
  Conflagration: "its 4 Fire on every creature within 20 feet of the target is dealt with no Test, so no failure deals it; whether the target takes the 4 beside its 20 is not said (Stormfury's target makes its Test by name), a reading for the lead"
});

/** A splash with nothing in it: the whole shape, every key present, as the parser stamps every spell. */
export function emptySplash() {
  return { feet: null, rating: null, school: null, resilience: null, reason: "" };
}

/**
 * **THE SPLASH 07's WORDS STATE**, or the empty shape: the feet, the Rating and its
 * school, the Resilience the creatures around the target make, and what stays the
 * table's, in words.
 *
 * @param {unknown} effectText  the entry's effect, HTML or Markdown
 * @returns {ReturnType<typeof emptySplash>}
 */
export function readSplash(effectText) {
  const text = flatText(effectText);
  const m = SPLASH_RE.exec(text);
  if (!m) return emptySplash();
  const school = m[4].toLowerCase();
  const resilience = m[2].toLowerCase();
  return {
    feet: Number(m[1]),
    rating: Number(m[3]),
    school: AZEROTH.schools?.[school] ? school : null,
    resilience: AZEROTH.resiliences?.[resilience] ? resilience : null,
    reason: SPLASH_TABLE_CLAUSES.filter(c => c.re.test(text)).map(c => c.text).join("; ")
  };
}

/**
 * Whether a stored splash reaches anybody: a distance, a Rating and a Test.
 *
 * @param {unknown} splash
 * @returns {boolean}
 */
export function hasSplash(splash) {
  return Boolean(splash && typeof splash === "object"
    && Number(splash.feet) > 0
    && Number.isFinite(Number(splash.rating)) && splash.rating !== null
    && typeof splash.resilience === "string" && splash.resilience);
}

/**
 * **THE AREA TEST ROW A SPLASH POSTS** (D-757's `checks` shape, `area-ticks.mjs
 * #emptyCheck`): the Resilience, and the Rating of its school on a failure - nothing on a
 * pass, and no condition either way. `area-ticks.mjs#checkOutcome` reads it at the card's
 * own Resist door, as it reads an area's Test.
 *
 * @param {ReturnType<typeof emptySplash>} splash
 * @returns {ReturnType<typeof emptyCheck>|null}
 */
export function splashCheck(splash) {
  if (!hasSplash(splash)) return null;
  const check = emptyCheck();
  check.resilience = splash.resilience;
  check.fail.rating = Math.max(0, Math.trunc(Number(splash.rating)) || 0);
  check.fail.school = splash.school ?? null;
  return check;
}

/**
 * **A STORED SPLASH, CLEANED KEY BY KEY** (CLAUDE.md §15: `migrateData` runs over a
 * partial update as readily as over a whole document, so only the keys handed in are
 * touched). A value of the wrong shape is put back to the empty shape's.
 *
 * @param {object} splash  mutated in place
 * @returns {object}
 */
export function cleanSplash(splash) {
  if (!splash || typeof splash !== "object" || Array.isArray(splash)) return splash;
  const blank = emptySplash();
  for (const key of ["feet", "rating"]) {
    if (!(key in splash) || splash[key] === null) continue;
    const n = Math.trunc(Number(splash[key]));
    splash[key] = Number.isFinite(n) && n >= 0 ? n : blank[key];
  }
  if ("school" in splash && splash.school !== null && !AZEROTH.schools?.[splash.school]) splash.school = blank.school;
  if ("resilience" in splash && splash.resilience !== null && !AZEROTH.resiliences?.[splash.resilience]) splash.resilience = blank.resilience;
  if ("reason" in splash && typeof splash.reason !== "string") splash.reason = blank.reason;
  return splash;
}
