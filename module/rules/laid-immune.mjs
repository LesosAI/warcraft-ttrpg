/**
 * **AN IMMUNE TAKEN AWAY BY AN EFFECT OR AN AREA** (08 §12's Silver dust: *On a failure, until the end of its
 * next turn, a creature regains no Health and loses **Immune (Physical)***; 02 §7's Ash Sign: *A creature in the
 * ring loses **Immune (Physical)***; the Witch Hunter plan's O-707). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * `laid-vulnerable.mjs`' twin, the other way round. A creature's Immune types are DERIVED on both actor models
 * and the damage door reads them through the target's snapshot; a laid effect takes a type OFF through a flag the
 * two models read in `prepareDerivedData` (`REMAINS_FLAG`), never an Active Effect change on the list, so the
 * type comes back with the effect's end and the stored block is never touched. An area hands its own rows in
 * (`areas`), so the Ash ring's reader needs no effect on every creature inside it.
 */

/** The flag a laid strip rides on its effect: `{loseImmune: string[], source: string}`. */
export const REMAINS_FLAG = "remains";

/** The types an effect may take off a creature's Immune: the seven schools and Physical. */
export const STRIPPABLE_TYPES = Object.freeze(["physical", "fire", "frost", "nature", "arcane", "shadow", "holy", "fel"]);

const typesOf = row => (Array.isArray(row?.loseImmune) ? row.loseImmune : []).filter(t => STRIPPABLE_TYPES.includes(t));

/**
 * The types every effect in force (and every area row handed in) takes off, sorted, each once.
 *
 * @param {Iterable<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @param {{areas?: Iterable<{loseImmune?: string[]}>}} [o]
 * @returns {string[]}
 */
export function laidLoseImmune(effects = [], { areas = [] } = {}) {
  const out = new Set();
  for (const e of effects ?? []) {
    if (!e || e.active === false || e.disabled === true) continue;
    for (const t of typesOf(e.flags?.["azeroth-rpg"]?.[REMAINS_FLAG])) out.add(t);
  }
  for (const a of areas ?? []) for (const t of typesOf(a)) out.add(t);
  return [...out].sort();
}

/**
 * A derived Immune list with the stripped types taken out, the rest in their order. Called after every line that
 * ADDS an Immune (CLAUDE.md §15: a derived line never recomputes from `_source`), so a strip outlasts a potion's.
 *
 * @param {string[]} list
 * @param {Iterable<object>} effects
 * @param {{areas?: Iterable<object>}} [o]
 * @returns {string[]}
 */
export function withoutLaidImmune(list = [], effects = [], { areas = [] } = {}) {
  const gone = new Set(laidLoseImmune(effects, { areas }));
  return (Array.isArray(list) ? list : []).filter(t => !gone.has(t));
}
