/**
 * WHICH POOL A READER MEANS, over a `poolSnapshot()` (D-507, D-637). Pure: an
 * array of plain rows in, one row out, no Foundry imports (CLAUDE.md §3).
 *
 * **A pool is held by its VALUE, never by its name.** 14's stat block prints a
 * number in the Power row and no type at all, so `AzerothActor#poolSnapshot`
 * hands back `name: null` for every pack creature — all 164 of them. Anything
 * keyed on `p.name === "mana"` therefore matches nothing on a creature and
 * skips in silence, which is the fault CLAUDE.md §15 already records against
 * the NPC sheet (D-637) and which had reappeared in the Signature tick and in
 * two of the Use handlers (2026-09-10).
 *
 * **The ruling** (the lead, 2026-09-10): *a creature's Power pool IS what it
 * casts from, so it takes the Mana tick.* `useAbility` has read it that way
 * since D-647 — the Spells line casts with the creature's Power as its Mana —
 * and this is the same reading everywhere else.
 *
 * **Resolve LENIENTLY, and never guess between two named pools:**
 *
 * 1. a Power pool actually named `mana`, if there is one;
 * 2. otherwise the **only** Power pool, whatever it is called;
 * 3. otherwise nothing.
 *
 * Step 2 is what reaches a creature. Step 3 is what keeps a Warrior's Rage
 * from being drunk as Mana: Rage is Momentum, so it is filtered out before
 * the count, but a class that ever held two differently-named Power pools
 * would be a guess and this refuses to make it. A two-class caster holds two
 * pools both named `mana`, and step 1 takes the first — the primary's, which
 * is what every reader here took before this module existed.
 *
 * **`manaPool` ANSWERS A GAIN; `poolNamed` ANSWERS A COST.** The same scar had
 * been left in `workflows.mjs#poolFor`, one line from the `manaPool` call
 * written to cure it, so a Signature that costs a pool refused with *no pool*
 * on all 164. `poolNamed` is that reading for any pool name, and its lenient
 * step is narrower on purpose: a pool that NAMES NOTHING is a creature's, and
 * a Paladin's Zeal may not quietly pay a cost of 4 Rage. Each function carries
 * the reason on itself.
 */

import { AZEROTH } from "../config.mjs";

/**
 * @typedef {object} PoolSnapshot
 * @property {string|null} itemId   the class item that owns it; null on a creature
 * @property {"power"|"momentum"} kind
 * @property {string|null} name     a key of `AZEROTH.poolTypes`, or null on a creature
 * @property {number} value
 * @property {number} max
 */

/** The pool key a caster spends. */
export const MANA = "mana";

/**
 * Which half of 05 §11 a pool name belongs to, off `config.mjs`'s own two maps.
 * `null` for a word that is neither, so a caller can fail closed on it.
 *
 * @param {string|null} name  a key of `AZEROTH.poolTypes`
 * @returns {"power"|"momentum"|null}
 */
export function poolKind(name) {
  if (!name) return null;
  if (name in AZEROTH.powerTypes) return "power";
  if (name in AZEROTH.momentumTypes) return "momentum";
  return null;
}

/**
 * The pool a reader means BY NAME — the general case of `manaPool` below, and
 * the one a COST goes through (`workflows.mjs#poolFor`).
 *
 * 1. a pool actually named `name`, the one the given class owns where two
 *    classes carry the same name;
 * 2. otherwise, the **only** pool of that name's kind **that names nothing**;
 * 3. otherwise nothing.
 *
 * Step 2 is the creature, and only the creature: 14's block prints a number in
 * the Power row and no type, so every pack creature's `name` is null and a
 * `find(p => p.name === "mana")` matched none of the 164. `useSignature` paid
 * its cost through exactly that shape, so *spend 4 Mana* refused with **no
 * pool** on every creature in the book.
 *
 * **IT IS DELIBERATELY STRICTER THAN `manaPool`, and the difference is the
 * difference between a gain and a cost.** `manaPool` answers *where does this
 * Mana go*, and the lead's ruling lets it land in the only Power pool whatever
 * it is called — a Hunter's Focus takes a Mana potion. This answers *what may
 * this be paid out of*, and a pool that names a different thing may not pay it:
 * a Paladin holds one Momentum pool and it is Zeal, so a cost of 4 Rage is
 * refused rather than quietly drunk out of it. A pool that names NOTHING names
 * nothing else either, which is why the creature case is safe.
 *
 * @param {PoolSnapshot[]} [pools]   what `AzerothActor#poolSnapshot()` returned
 * @param {string|null} [name]       a key of `AZEROTH.poolTypes`
 * @param {object} [o]
 * @param {string|null} [o.itemId]   the class item that granted the thing being paid for
 * @returns {PoolSnapshot|null}
 */
export function poolNamed(pools = [], name = null, { itemId = null } = {}) {
  if (!name) return null;
  const list = Array.isArray(pools) ? pools : [];
  const named = list.filter(p => p?.name === name);
  if (named.length) return named.find(p => p.itemId === itemId) ?? named[0];
  const kind = poolKind(name);
  if (!kind) return null;
  const unnamed = list.filter(p => p?.kind === kind && !p.name);
  return unnamed.length === 1 ? unnamed[0] : null;
}

/**
 * The Mana pool in a snapshot, by the three-step reading above.
 *
 * @param {PoolSnapshot[]} [pools]  what `AzerothActor#poolSnapshot()` returned
 * @returns {PoolSnapshot|null}
 */
export function manaPool(pools = []) {
  const powers = (Array.isArray(pools) ? pools : []).filter(p => p?.kind === "power");
  const named = powers.find(p => p.name === MANA);
  if (named) return named;
  return powers.length === 1 ? powers[0] : null;
}
