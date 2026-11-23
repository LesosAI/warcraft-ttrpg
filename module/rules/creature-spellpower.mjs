/**
 * A creature's own Spellpower (D-1727). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * A character takes Spellpower by school from what it wears (08 §6's suffix,
 * 08 §10's Spellpower gear, a Signature) and from its talents. A bestiary
 * creature carries no gear, so 14's blocks print none and a GM had no way to
 * give a creature any. `NpcData.spellpowerBase` is the GM's own number, set in
 * the NPC generator's Spellpower rows, and the derived `system.spellpower` that
 * `rules/spell-bonus.mjs#standingSpellBonus` reads at every cast and tick adds
 * it to what the creature's passives and carried gear give.
 *
 * **The stored field is NOT named `spellpower`.** That name is the derived
 * total, and Rework reads the stored source back into the window: a stored
 * field of the same name would load the total and write it back as the base,
 * counting a passive's and a ring's points twice on every Apply.
 */

import { AZEROTH } from "../config.mjs";

/**
 * The most Spellpower gear gives in one school. 08 §10, *Spellpower*: *Two of
 * them in the same school stack to 2, and 3 is the ceiling from gear*, and the
 * Regalia of the school is *Spellpower 3 in one school, the ceiling from gear*.
 * The review notes a creature above it (a note, never a refusal: D-104 lets
 * theme set a number), and `creature-spellpower.test.mjs` reads the number off
 * the chapter.
 */
export const GEAR_SPELLPOWER_CEILING = 3;

/** A plain object, as core's `isPlainObject` reads one: a data operator is not. */
function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether a value in source data is a data operator (core's `ForcedReplacement`
 * or `ForcedDeletion`) rather than stored data. Stored data is JSON, so any
 * object that is neither plain nor an array is one. A `migrateData` guard
 * leaves it whole: rebuilding it as a plain object turns a replacement into a
 * merge (D-1727's review).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDataOperator(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !isPlainObject(value);
}

/**
 * The stored `spellpowerBase` made valid before the schema reads it, **only
 * where it is PRESENT** (CLAUDE.md §15): `migrateData` runs over partial update
 * data too, so a key the update did not name is left alone. A school 07 does
 * not hold is dropped (the field's `validateKey` would drop it in silence), a
 * value becomes a whole number of 0 or more, and a value that is no number at
 * all is dropped rather than refusing the creature.
 *
 * **A data operator is left whole.** Rework writes the map as a
 * `ForcedReplacement`, which is not a plain object; core cleans its value
 * itself, and rebuilding it here as a plain map would turn the replacement
 * into a merge, so a school the GM removed would survive.
 *
 * Mutates and returns its argument, as every `cleanX` source helper does.
 *
 * @param {object} source  an NPC's system source, whole or partial
 * @returns {object}
 */
export function cleanSpellpowerBaseSource(source) {
  if (!source || typeof source !== "object" || !("spellpowerBase" in source)) return source;
  const map = source.spellpowerBase;
  if (map === null || map === undefined || typeof map !== "object" || Array.isArray(map)) {
    delete source.spellpowerBase;
    return source;
  }
  if (isDataOperator(map)) return source;
  for (const key of Object.keys(map)) {
    if (!(key in AZEROTH.schools)) { delete map[key]; continue; }
    const n = Math.trunc(Number(map[key]));
    if (Number.isFinite(n)) map[key] = Math.max(0, n);
    else delete map[key];
  }
  return source;
}

/**
 * The derived Spellpower by school: every school at 0, what an `initial`-phase
 * effect already wrote, then the creature's own base, then each bag of points
 * (its passives, what it carries) ADDED. Never recomputed from `_source`,
 * which would erase an effect on the same field (D-691).
 *
 * @param {object} [o]
 * @param {Record<string, number>} [o.base]      `system.spellpowerBase`, as prepared
 * @param {Record<string, number>} [o.prepared]  `system.spellpower` before this ran
 * @param {Array<Record<string, number>>} [o.bags]
 * @returns {Record<string, number>}
 */
export function spellpowerTotals({ base = {}, prepared = {}, bags = [] } = {}) {
  const out = {
    ...Object.fromEntries(Object.keys(AZEROTH.schools).map(key => [key, 0])),
    ...(prepared && typeof prepared === "object" ? prepared : {})
  };
  for (const bag of [base, ...(bags ?? [])]) {
    for (const [school, value] of Object.entries(bag ?? {})) {
      const n = Math.trunc(Number(value)) || 0;
      if (n) out[school] = (out[school] ?? 0) + n;
    }
  }
  return out;
}

/**
 * The schools a creature holds Spellpower in, in `AZEROTH.schools`' order,
 * for the sheet's chips: a label key and the number, 0 left out.
 *
 * @param {Record<string, number>} [map]  the derived `system.spellpower`
 * @returns {Array<{school: string, label: string, value: number}>}
 */
export function spellpowerRows(map = {}) {
  return Object.keys(AZEROTH.schools)
    .map(school => ({ school, label: AZEROTH.schools[school], value: Math.trunc(Number(map?.[school])) || 0 }))
    .filter(row => row.value > 0);
}

/**
 * The generator's rows off a stored map (Rework, Start from an entry): one row
 * a school holding more than 0, in `AZEROTH.schools`' order.
 *
 * @param {Record<string, number>} [base]  the stored `spellpowerBase`
 * @returns {Array<{school: string, value: number}>}
 */
export function spellpowerStateRows(base = {}) {
  return spellpowerRows(base).map(({ school, value }) => ({ school, value }));
}

/**
 * The map the generator writes off its rows: a known school with more than 0,
 * a whole number. A row at 0 is dropped, so Apply never stores a school the GM
 * cleared.
 *
 * @param {Array<{school?: string|null, value?: number|string|null}>} [rows]
 * @returns {Record<string, number>}
 */
export function spellpowerFromRows(rows = []) {
  const out = {};
  for (const row of rows ?? []) {
    if (!row?.school || !(row.school in AZEROTH.schools)) continue;
    const n = Math.trunc(Number(row.value));
    if (Number.isFinite(n) && n > 0) out[row.school] = n;
  }
  return out;
}
