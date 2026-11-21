/**
 * Scrolls that cast (08 §14, *Scrolls*; D-1436). Pure: no Foundry imports.
 *
 * *A scroll is one casting of a spell by somebody who does not know it.
 * Reading one is the spell's own Action, the scroll is consumed, and no Mana
 * is spent.* And: *A scroll casts at the writer's Casting Test, not yours.*
 * The writer's total is written on the scroll; its Success Level is read from
 * that total against the spell's Casting Test DC, and a total below the DC
 * fails - the spell does not go off and the scroll is still spent. Any
 * character may read one.
 *
 * **The GM writes a scroll** by dropping a spell on a blank scroll's sheet
 * (the lead's ruling): the tiers must match, the scroll takes the spell's name
 * and text, and its one `system.spells[]` entry carries the writer's total.
 * **An inscribed scroll keeps its `scroll-tier-N` identifier**, which is how
 * every door can still tell it is a scroll; it stays Common, so it is never
 * unidentified.
 *
 * **The SL is `resolution.mjs`'s and nobody else's**: `writerOutcome` reads
 * `succeeded` off the margin and `computeSL`'s floor and cap, and never
 * re-derives either.
 */

import { computeSL, forcedOutcome, succeeded } from "./resolution.mjs";
import { castingDC, statedCastingDC } from "./casting.mjs";

/** A blank or written scroll's identifier, with its tier captured. */
export const SCROLL_IDENTIFIER = /^scroll-tier-([1-5])$/;

/** Every refusal `inscribeRefusal` can answer, in the order it judges them. */
export const INSCRIBE_REFUSALS = Object.freeze(["notGM", "notScroll", "notSpell", "alreadyInscribed", "tierMismatch"]);

/** Whether the item is one of 08 §14's scrolls, blank or written. */
export function isScroll(item) {
  return SCROLL_IDENTIFIER.test(String(item?.system?.identifier ?? ""));
}

/** The scroll's tier, 1 to 5, or null for anything that is not a scroll. */
export function scrollTier(item) {
  const m = SCROLL_IDENTIFIER.exec(String(item?.system?.identifier ?? ""));
  return m ? Number(m[1]) : null;
}

/** Whether a spell is already written on it. A scroll is written once. */
export function isInscribed(item) {
  return Array.isArray(item?.system?.spells) && item.system.spells.length > 0;
}

/** A spell's tier, 1 at the least, as `castingDC` reads it. */
function tierOf(spell) {
  return Math.max(1, Math.trunc(Number(spell?.system?.tier)) || 1);
}

/**
 * The bare DC a scroll of this spell is written at: the Casting Test DC the entry prints where
 * it prints one (07, D-775), else 07 §2's 10 + 2 per tier. **The inscription dialog's prefill
 * and nothing else.** A READ scroll's total is judged against the DC the cast itself works out
 * - the target's Defense for a spell aimed at one creature (07 §2; the lead, 2026-11-21: *"Same
 * as casting it"*) - in `dice/workflows.mjs#castSpell`, never against this number.
 */
export function scrollDC(spell) {
  return statedCastingDC(spell?.system?.effect ?? "") ?? castingDC({ tier: tierOf(spell) });
}

/**
 * **THE BARE DC A WRITTEN SCROLL'S ROW PRINTS** beside its total (*Written at 17 (DC 12)*): what
 * `scrollDC` gave the inscription, read off the scroll itself - its tier, and the entry's own
 * printed DC from the spell's text the inscription wrote into its description. A read is still
 * judged against the DC the cast works out for its targets (`castSpell`); this is the number a
 * reader can see before choosing one.
 *
 * @param {object} scroll  an inscribed scroll
 * @returns {number}
 */
export function writtenDC(scroll) {
  return scrollDC({ system: { tier: scrollTier(scroll) ?? 1, effect: String(scroll?.system?.description ?? "") } });
}

/**
 * Why this spell may not be written on this scroll, or null where it may.
 *
 * @param {object} args
 * @param {object} args.scroll  the item the spell was dropped on
 * @param {object} args.spell   the dropped document
 * @param {boolean} args.isGM   whether the dropping user is a GM
 * @returns {null|{reason: string, scrollTier?: number, spellTier?: number}}
 */
export function inscribeRefusal({ scroll, spell, isGM = false } = {}) {
  if (!isGM) return { reason: "notGM" };
  if (!isScroll(scroll)) return { reason: "notScroll" };
  if (spell?.type !== "spell") return { reason: "notSpell" };
  if (isInscribed(scroll)) return { reason: "alreadyInscribed" };
  const have = scrollTier(scroll);
  const want = tierOf(spell);
  if (have !== want) return { reason: "tierMismatch", scrollTier: have, spellTier: want };
  return null;
}

/** The writer's total as stored: a whole number, never below 0. */
function cleanTotal(total) {
  const n = Math.trunc(Number(total));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * The one update that writes a spell on a scroll.
 *
 * `name` is the caller's localised template with `{spell}` (*Scroll of
 * {spell}*); `system.description` is the spell's lore then its effect, as HTML
 * the sheet enriches; `system.spells` is one casting at the reader's Spell DC
 * (`dc: null`, 08 §14: *use your Spell DC for anything the spell makes a
 * target resist*), used once, carrying the writer's total.
 *
 * @param {object} args
 * @param {object} args.scroll
 * @param {object} args.spell  carries `uuid`, `name` and `system.{description, effect}`
 * @param {number} args.writerTotal  the writer's Casting Test total
 * @param {{scrollName?: string}} [args.words]
 */
export function inscription({ scroll, spell, writerTotal, words = {} } = {}) {
  const name = String(spell?.name ?? "");
  const format = typeof words.scrollName === "string" && words.scrollName.includes("{spell}") ? words.scrollName : "{spell}";
  const description = [spell?.system?.description, spell?.system?.effect]
    .filter(part => typeof part === "string" && part.trim())
    .join("");
  // **THE PACK'S UUID WHERE THE SPELL CAME FROM ONE** (the architect's review, must-fix 5): a
  // spell dragged off a caster's sheet carries an Actor-embedded uuid that dies with the actor,
  // and its `_stats.compendiumSource` names the pack copy it was made from.
  const uuid = spell?._stats?.compendiumSource || spell?.uuid || "";
  return {
    // A FUNCTION replacement (must-fix 8a): a string one expands `$&` and `$1` in the name.
    name: format.replace("{spell}", () => name),
    "system.description": description,
    "system.spells": [{
      uuid: String(uuid),
      name,
      dc: null,
      uses: { max: 1, value: 1, per: null },
      writerTotal: cleanTotal(writerTotal)
    }]
  };
}

/**
 * The writer's Test, read as 05 §2 reads any Test: success off the margin, the
 * SL floored and capped by `resolution.mjs`.
 *
 * @returns {{sl: number, success: boolean}}
 */
export function writerOutcome(total, dc) {
  return { sl: computeSL(total, dc), success: succeeded(total, dc) };
}

/**
 * **THE OUTCOME OF A READ SCROLL, AS A ROLL REPORTS ONE** (`dice/azeroth-roll.mjs`'s `outcome`
 * for a roll with no die). `writerOutcome` is the one route to the SL (must-fix 7); there is no
 * natural face, so no natural 20 and no natural 1. A forced SL (Soul Fire, Miracle, Halt the
 * Sands) and a forced miss (Disrupt Weave) are read exactly as a rolled Test reads them.
 *
 * @param {{total: number, dc: number, forcedSl?: number|null, forcedMiss?: boolean}} o
 * @returns {{total: number, sl: number, success: boolean, natural: null, critical: false, fumble: false, written: true}}
 */
export function writtenOutcome({ total = 0, dc = 10, forcedSl = null, forcedMiss = false } = {}) {
  if (typeof forcedSl === "number" && Number.isFinite(forcedSl)) return { ...forcedOutcome({ sl: forcedSl, total, natural: null }), written: true };
  const read = writerOutcome(total, dc);
  if (forcedMiss) return { total, sl: Math.min(read.sl, -1), success: false, natural: null, critical: false, fumble: false, forcedMiss: true, written: true };
  return { total, sl: read.sl, success: read.success, natural: null, critical: false, fumble: false, written: true };
}

/**
 * **THE DC A TARGET RESISTS A READ SCROLL AT** (08 §14: *use your Spell DC for anything the
 * spell makes a target resist*). The reader's Spell DC; and where the reader has none (a
 * Warrior), the writer's level - 10 + 2 per tier of the spell, a DC belonging to the scroll
 * (the lead, 2026-11-21). The ONE place that reading lives.
 *
 * @param {number|null} spellDC  the reader's Spell DC
 * @param {number} [tier]        the spell's tier
 * @returns {number}
 */
export function readerResistDC(spellDC, tier = 1) {
  if (spellDC !== null && spellDC !== undefined && Number.isFinite(Number(spellDC))) return Number(spellDC);
  return castingDC({ tier: Math.max(1, Math.trunc(Number(tier)) || 1) });
}
