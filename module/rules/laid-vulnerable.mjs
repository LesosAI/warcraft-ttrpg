/**
 * **VULNERABLE, LAID ON A CREATURE BY AN EFFECT** (05's Vulnerable (Type): *Armor and Ward do not apply against
 * that type, and the damage rises by 2*; 07 §17's Wracking Pain, *is **Vulnerable (Physical)** until the end of
 * its next turn*; D-1366). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A creature's Vulnerable types are DERIVED on both actor models (`CharacterData` off 10's rungs and the Risen
 * class, `NpcData` off its block), and the damage door reads them through the target's snapshot
 * (`rules/mitigation.mjs#resolveDamage`'s `vulnerable`). A laid effect adds a type through a flag the two models
 * read in `prepareDerivedData` - never an Active Effect change on the list, which would land in the `final`
 * phase on a character after the list is built and on the stored copy of a creature's block - so the type comes
 * off with the effect, and the stored block is never touched.
 */

/** The flag a laid Vulnerable rides on its effect: `{types: string[], source: string}`. */
export const VULNERABLE_FLAG = "vulnerableTo";

/** The damage types an effect may make a creature Vulnerable to: the seven schools and Physical. */
export const LAID_VULNERABLE_TYPES = Object.freeze(["physical", "fire", "frost", "nature", "arcane", "shadow", "holy", "fel"]);

/**
 * The types every active effect on the creature lays, sorted, each once.
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @returns {string[]}
 */
export function laidVulnerable(effects = []) {
  const out = new Set();
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    const row = e.flags?.["azeroth-rpg"]?.[VULNERABLE_FLAG] ?? null;
    for (const type of Array.isArray(row?.types) ? row.types : []) {
      if (LAID_VULNERABLE_TYPES.includes(type)) out.add(type);
    }
  }
  return [...out].sort();
}

/**
 * A derived list with the laid types ADDED (CLAUDE.md §15: a derived line adds, it never recomputes from
 * `_source`): the list as it stood, then each laid type it lacked.
 *
 * @param {string[]} list
 * @param {Iterable<object>} effects
 * @returns {string[]}
 */
export function withLaidVulnerable(list = [], effects = []) {
  const out = Array.isArray(list) ? [...list] : [];
  for (const type of laidVulnerable(effects)) if (!out.includes(type)) out.push(type);
  return out;
}
