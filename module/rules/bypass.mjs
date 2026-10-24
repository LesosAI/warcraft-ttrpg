/**
 * **DAMAGE THAT BYPASSES ARMOR AND WARD** (the Legacy branches' B8a2 pass; the lead: *"Build
 * them now"*). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * 07 writes it on nine spells' own damage - *The target takes 20 Nature damage, bypassing
 * armor and Ward* (Stormfury, Conflagration, Disintegration, Entropy, Killing Winter,
 * Annihilation and The Last Word at tier 5; Chaos Bolt's *It takes 12 Fel damage*; Purging
 * Flame's 2 Fire) - and the card's Apply met each one with the target's Armor Points and Ward
 * as any other spell's. The parser now stamps `system.damage.bypass` where the sentence that
 * names the entry's own Damage Rating says so (`bypassesArmorAndWard`), and the cast's
 * mitigation reads it (`rules/mitigation.mjs#resolveDamage`'s `bypass`): no Armor Points, no
 * Ward and no ally's aura Armor Points come off that damage. Immune, Vulnerable and a halving
 * still stand - the words name armor and Ward and nothing else.
 *
 * **What the same words say elsewhere is no damage of the Rating's**, and the census in
 * `bypass.test.mjs` names each: a Health price (*Casting it costs you 3 Health, bypassing armor
 * and Ward*, 07 §8's cost, paid and never mitigated), Health lost at a turn's start, the damage
 * a broken term or an ended passage deals, a share another creature takes.
 */

import { flatText } from "./resisted.mjs";
// The repository's one sentence splitter (CLAUDE.md §4, D-722).
import { sentences } from "./spell-effects.mjs";

/**
 * **THE ENTRY'S OWN DAMAGE, BYPASSING ARMOR AND WARD**: *takes N <School> damage, bypassing
 * armor and Ward*, in the sentence that names it.
 */
export const BYPASS_RE = /\btakes (\d+) ([A-Z][a-z]+) damage, bypassing (?:their )?armor and Ward\b/;

/**
 * Every damage the words deal past armor and Ward, a sentence at a time.
 *
 * @param {unknown} text  an entry's effect, HTML or Markdown
 * @returns {Array<{amount: number, school: string, sentence: string}>}
 */
export function bypassedDamage(text) {
  const out = [];
  for (const sentence of sentences(flatText(text))) {
    const m = BYPASS_RE.exec(sentence);
    if (m) out.push({ amount: Number(m[1]), school: m[2].toLowerCase(), sentence });
  }
  return out;
}

/**
 * **WHETHER THE ENTRY'S OWN DAMAGE BYPASSES ARMOR AND WARD** - what the parser stamps as a
 * spell's `damage.bypass`: a sentence that deals the entry's Damage Rating past armor and
 * Ward. A number that is not the Rating (a broken term's 8 on a spell with no Rating) is no
 * mark of the Rating's.
 *
 * @param {unknown} text
 * @param {{rating?: number|null, school?: string|null}} [o]  the entry's own Damage field
 * @returns {boolean}
 */
export function bypassesArmorAndWard(text, { rating = null, school = null } = {}) {
  if (rating === null || rating === undefined) return false;
  const want = Math.trunc(Number(rating));
  return bypassedDamage(text).some(d => d.amount === want && (!school || d.school === school));
}
