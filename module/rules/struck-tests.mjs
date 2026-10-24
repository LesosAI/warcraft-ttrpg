/**
 * **THE TEST THE NEXT BLOW ASKS OF WHOEVER STRUCK IT** (07's Nature's Grasp: *The next
 * creature to hit you with a melee attack must pass a Reflex Resilience Test against your
 * Spell DC or be **Entangled** and unable to make Opportunity Attacks while it is held.
 * The spell then ends whether the Test passed or failed.*; the B9a pass, the lead: *"Build
 * the triggers"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The B8a2 pass took the cast card's Resist away, correctly - 07 asks nothing of whoever
 * was targeted at the cast - and left the Test with no door at all. Its moment is a blow:
 *
 * - **At the cast** (`readStruckTest`, read off the entry's own words as `readEscape` is,
 *   no stored shape): the card carries the trigger at the caster's Spell DC, and its Apply
 *   lays it on the caster with the spell's own effect (`STRUCK_TEST_FLAG`).
 * - **At the next melee hit on its holder** (`effects/struck-tests.mjs`, the active GM's
 *   client): the first card whose blow hits the holder in melee (`meleeHitOf`) ends the
 *   spell - *whether the Test passed or failed* - and posts the striker's Test card, the
 *   area Test's own (`effects/area-strikes.mjs#postAreaTest`'s shape), made once and
 *   recorded on its card. A failure lands **Entangled** through the area Test's door,
 *   marked so the creature makes no Opportunity Attack while that Entangled holds
 *   (`NO_OPPORTUNITY_FLAG`, read by `rules/reactions.mjs#canReact`).
 * - **A hit turned into a miss** (06 §6's Parry, 04's Afterimage; the Legacy branches'
 *   door 13) was no hit: the spell waits again, the striker's Test card is refused in
 *   words, and what its failure laid is taken off.
 */

import { flatText, conditionId } from "./spell-effects.mjs";

/** The flag the trigger rides on its holder's laid effect. */
export const STRUCK_TEST_FLAG = "struckTest";

/** The flag on a condition a struck Test laid that bars its bearer's Opportunity Attacks. */
export const NO_OPPORTUNITY_FLAG = "noOpportunity";

/** The flag on what a struck Test's failure laid, naming the Test card, for a withdrawal to take back. */
export const STRUCK_OF_FLAG = "struckOf";

/** The moments a struck Test is made at: a melee hit on its holder. */
export const STRUCK_ON = Object.freeze(["meleeHit"]);

/**
 * 07's sentence, over flattened text that keeps 07's bold (`spell-effects.mjs#flatText`):
 * the Resilience, the condition, and whether it bars Opportunity Attacks.
 */
const STRUCK_RE = /\bThe next creature to hit you with a melee attack must pass an? (Body|Reflex|Spirit) Resilience Test against your Spell DC or be \*\*([A-Za-z]+)\*\*( and unable to make Opportunity Attacks while it is held)?\./;

/** *The spell then ends whether the Test passed or failed.* */
const ENDS_RE = /\bThe spell then ends whether the Test passed or failed\b/;

/**
 * **WHAT THE NEXT BLOW ASKS**, read off 07's words, or null: when (`meleeHit`), the
 * Resilience, the condition a failure lays, whether it bars Opportunity Attacks while it
 * holds, and whether the spell ends at the Test.
 *
 * @param {unknown} effectText  the entry's effect, HTML or Markdown
 * @returns {{on: "meleeHit", resilience: string, statuses: string[], noOpportunity: boolean, ends: boolean}|null}
 */
export function readStruckTest(effectText) {
  const text = flatText(effectText);
  const m = STRUCK_RE.exec(text);
  if (!m) return null;
  const condition = conditionId(m[2]);
  if (!condition) return null;
  return { on: "meleeHit", resilience: m[1].toLowerCase(), statuses: [condition], noOpportunity: Boolean(m[3]), ends: ENDS_RE.test(text) };
}

/**
 * **A STRUCK TEST AS A CARD OR AN EFFECT CARRIES IT**, cleaned: the known keys and the
 * cast's own record - the caster's Spell DC, who cast it, the spell, the cast - and
 * nothing a caller slipped in beside them. Null where it asks nothing.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function cleanStruckTest(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!STRUCK_ON.includes(raw.on)) return null;
  const resilience = ["body", "reflex", "spirit"].includes(raw.resilience) ? raw.resilience : null;
  if (!resilience) return null;
  const statuses = Array.isArray(raw.statuses) ? raw.statuses.filter(s => typeof s === "string" && s) : [];
  const dc = Number.isFinite(Number(raw.dc)) && raw.dc !== null ? Math.trunc(Number(raw.dc)) : null;
  return {
    on: raw.on, resilience, statuses,
    noOpportunity: raw.noOpportunity === true,
    ends: raw.ends === true,
    dc,
    caster: typeof raw.caster === "string" && raw.caster ? raw.caster : null,
    spell: typeof raw.spell === "string" ? raw.spell : "",
    cast: typeof raw.cast === "string" && raw.cast ? raw.cast : null
  };
}

/**
 * **WHETHER A CARD'S BLOW IS A MELEE HIT A STRUCK TEST ANSWERS**: an attack, never a
 * Parry's Attack Test, struck in melee - the way `struckBack` judges Immolation's *hits
 * you with a melee attack* (D-757): a blow whose way was never recorded is melee - and
 * the rows it HIT that no Parry or Afterimage has since withdrawn.
 *
 * @param {object|null} flags  the attack card's `flags["azeroth-rpg"]`
 * @returns {number[]}  the indices of the rows hit in melee
 */
export function meleeHitsOf(flags) {
  if (!flags || flags.kind !== "attack" || flags.parry === true) return [];
  if ((flags.strike?.rangeKind ?? "melee") !== "melee") return [];
  const rows = Array.isArray(flags.damageByTarget) ? flags.damageByTarget : [];
  const out = [];
  rows.forEach((row, index) => {
    if (row && typeof row === "object" && row.withdrawn !== true) out.push(index);
  });
  return out;
}

/**
 * **THE STRIKER'S TEST, AS AN AREA TEST CARD CARRIES IT**: `rules/area-ticks.mjs`'
 * check-row shape, whose failure lays the struck Test's condition - so the area Test's
 * one door rolls it, records it once and lands it (`areaTestOutcome`).
 *
 * @param {object} struck  `cleanStruckTest`'s
 * @param {object} emptyRow  `rules/area-ticks.mjs#emptyCheck()`, handed in so this module imports none of that one's
 * @returns {object|null}
 */
export function struckCheck(struck, emptyRow) {
  const s = cleanStruckTest(struck);
  if (!s || !emptyRow) return null;
  return { ...emptyRow, on: "struck", resilience: s.resilience, fail: { ...emptyRow.fail, statuses: [...s.statuses] } };
}

/**
 * **WHETHER A STRUCK TEST CARD MAY STILL BE PRESSED**: not where the hit it answers was
 * turned into a miss (door 13: *a hit turned into a miss withdraws everything it laid*),
 * and not where that withdrawal has already been settled. The reason, as a lang key, or
 * null.
 *
 * @param {{withdrawn?: boolean, undone?: boolean}} o
 * @returns {string|null}
 */
export function struckRefusal({ withdrawn = false, undone = false } = {}) {
  if (withdrawn === true || undone === true) return "AZEROTH.Struck.Withdrawn";
  return null;
}

/**
 * **WHETHER A CREATURE IS BARRED FROM OPPORTUNITY ATTACKS NOW**: an active effect of its
 * own carrying `NO_OPPORTUNITY_FLAG` whose condition still stands on that effect - so the
 * bar goes with the Entangled it rides (*while it is held*).
 *
 * @param {Array<{active?: boolean, statuses?: Set<string>|string[], flags?: object}>} effects
 * @returns {boolean}
 */
export function barredFromOpportunity(effects = []) {
  for (const e of effects ?? []) {
    if (!e || e.active === false) continue;
    const mark = e.flags?.["azeroth-rpg"]?.[NO_OPPORTUNITY_FLAG] ?? null;
    if (!mark || typeof mark !== "object") continue;
    const statuses = e.statuses instanceof Set ? e.statuses : new Set(e.statuses ?? []);
    if (typeof mark.condition === "string" && statuses.has(mark.condition)) return true;
  }
  return false;
}
