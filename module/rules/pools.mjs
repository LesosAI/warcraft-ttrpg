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
 * 2. otherwise the **only** Power pool, whatever it is called, where it belongs
 *    to no class - a creature's (a character's Energy or Focus is never Mana);
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
 * **05 §11's KIND WORD, AS A COST** (02 §5's War Stomp: *Spend a Half-Action and 4
 * Momentum*; the B8a pass). A tauren may be a Warrior, a Ranger, a Shaman or a Druid, so
 * the racial talent's price names no pool: it is the Momentum pool the character holds -
 * Rage, Quarry or Ferocity - and a Shaman, who holds none, cannot pay it.
 * `AZEROTH.costPoolTypes` carries its word.
 */
export const ANY_MOMENTUM = "momentum";

/**
 * **A COST PAID FROM ANY POOL THE CHARACTER HOLDS** (02 §5's Tail Sweep; the lead,
 * 2026-11-09, verbatim: *"Pay 4 from your Momentum or your Power pool (Rage, Energy,
 * Mana...). The DC is 8 + Constitution modifier + proficiency, so it works the same for
 * every class."*). The pool is chosen at the door, before anything is paid, through
 * `anyPoolChoice`; `poolNamed` never guesses it. `AZEROTH.costPoolTypes` carries its word.
 */
export const ANY_POOL = "any";

/**
 * The pools that can pay `amount` of an `ANY_POOL` cost: every Momentum and Power pool
 * holding at least that much, Momentum first, then by name and class, so a list a
 * person reads never wobbles.
 *
 * @param {PoolSnapshot[]} [pools]
 * @param {number} [amount]
 * @returns {PoolSnapshot[]}
 */
export function anyPoolPayers(pools = [], amount = 0) {
  const due = Math.max(0, Math.trunc(Number(amount)) || 0);
  const order = { momentum: 0, power: 1 };
  return (Array.isArray(pools) ? pools : [])
    .filter(p => p && (p.kind === "momentum" || p.kind === "power") && (Number(p.value) || 0) >= due)
    .sort((a, b) => (order[a.kind] - order[b.kind])
      || String(a.name ?? "").localeCompare(String(b.name ?? ""))
      || String(a.itemId ?? "").localeCompare(String(b.itemId ?? "")));
}

/** The key a chooser row names a pool by: its class and its kind, which a character holds once each. */
export function anyPoolKey(pool) {
  return `${pool?.itemId ?? ""}:${pool?.kind ?? ""}`;
}

/**
 * **WHICH POOL AN `ANY_POOL` COST COMES OUT OF**: none can pay it, and the door refuses in
 * words naming the price; exactly one can, and it pays without asking; more than one
 * can, and the door asks which through the one chooser before anything is paid (D-768's
 * order). Pure: the door does the asking.
 *
 * @param {PoolSnapshot[]} [pools]
 * @param {number} [amount]
 * @returns {{pool: PoolSnapshot|null, ask: PoolSnapshot[]|null, refusal: "NoPool"|null}}
 */
export function anyPoolChoice(pools = [], amount = 0) {
  const payers = anyPoolPayers(pools, amount);
  if (!payers.length) return { pool: null, ask: null, refusal: "NoPool" };
  if (payers.length === 1) return { pool: payers[0], ask: null, refusal: null };
  return { pool: null, ask: payers, refusal: null };
}

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
 * Mana go*, and the lead's ruling lets it land in a creature's only Power pool
 * whatever its GM called it (never a character's Energy or Focus, which 05 §11
 * says is not Mana). This answers *what may
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
  // **A COST THAT NAMES THE KIND** (`ANY_MOMENTUM`): the paying class's own Momentum pool
  // where it holds one, else the first the creature holds - the primary's, which is the
  // maneuver's reading (`AzerothActor#momentumPayer`: `momenta[0]`). A racial talent's
  // grant names no class, so it takes the primary's.
  if (name === ANY_MOMENTUM) {
    const momenta = list.filter(p => p?.kind === "momentum");
    return momenta.find(p => itemId && p.itemId === itemId) ?? momenta[0] ?? null;
  }
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
  // **STEP 2 IS THE CREATURE'S, AND ONLY THE CREATURE'S** (the Chromatic Champion
  // plan, finding 1). The lead's ruling of 2026-09-10 is about a creature: *a
  // creature's Power pool IS what it casts from*. A creature's pool belongs to no
  // class (`itemId` null); a character's always does, and 05 §11 says a Rogue and a
  // Ranger hold no Mana - so Hymn of Hope, a Mana draught and a Mana tick refilled a
  // Rogue's Energy and a Ranger's Focus while this read every lone Power pool.
  return powers.length === 1 && !powers[0].itemId ? powers[0] : null;
}
