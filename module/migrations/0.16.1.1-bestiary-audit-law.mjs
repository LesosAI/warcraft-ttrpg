/**
 * The law of migration 0.16.1.1 (D-1801 to D-1803): what a world creature takes from the
 * bestiary pack after the 2026-11 audit, judged field by field against the value the pack held
 * at release 0.16.1. Pure: no `game`, no `foundry` at import, so `0.16.1.1-bestiary-audit.test.mjs`
 * and the generator (`tools/bestiary-audit-before.mjs`) load it in Node.
 *
 * **THE BEFORE TABLE** (`0.16.1.1-bestiary-audit.json`) holds, for every creature whose document
 * the audit changed, only the OLD value of each stored field that differs, as a MARKER: a short
 * value literally, anything longer (and every attack or ability row) as a fingerprint of its
 * canonical form. The new value is never in the table: it is read off the compiled pack at run
 * time (the pack copy, D-665), as 0.16.0.1 reads its spells.
 *
 * **A FIELD IS WRITTEN ONLY WHERE THE STORED VALUE IS STILL THE OLD PACK'S** (0.12.25's
 * `buildCreatureUpdate`, 0.13.1's rows). A field equal to the pack's new value has nothing to do; a
 * field equal to neither is a GM's own and is kept, and judged alone, so a GM's Health edit never
 * blocks an Initiative fix. A row list is judged ROW BY ROW, matched by name; a row the audit
 * renamed is matched by its old name, and a row the audit added is added only where no row of
 * that name stands. The use a creature has spent is play, never an edit.
 */

import { cleanAutomation } from "../rules/ability-automation.mjs";

/** The pack every new value is read from. */
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/** The release the BEFORE table was read from: release 0.16.1's commit. */
export const BASE_COMMIT = "b595e2253a7dd6d17ee37345dffad14b90d83259";

/** The stored lists judged row by row, by name. */
export const ROW_LISTS = Object.freeze(["attacks", "creatureAbilities", "bossActions"]);

/** The lists whose rows carry an ability descriptor, and so a spent use. */
const ABILITY_LISTS = new Set(["creatureAbilities", "bossActions"]);

/** The `TypedObjectField`s: written whole through `ForcedReplacement`, never merged (CLAUDE.md §15). */
export const TYPED_OBJECT_FIELDS = Object.freeze(["ward", "skills", "spellpowerBase"]);

/**
 * The fields this migration never writes, whatever the pack says: what a creature spends in play,
 * the world's own filing, and a GM's own numbers the pack carries none of.
 */
export const NEVER_WRITTEN = Object.freeze([
  "health.value", "health.temp", "bossPoints.value", "power.value", "momentum.value", "coin",
  "spellpowerBase", "castingBonus", "boonsBanes", "conditionImmune", "factions"
]);

/**
 * The stored pools judged by their maximum alone; the value is spent in play. Power and Momentum
 * joined with the 2026-11 build (D-1824): Immol'thar gained a Power of 16, and a world creature's
 * stored Power holds the derived floor as its value, which read the whole pool as a GM's own.
 */
export const POOL_FIELDS = Object.freeze(["health", "bossPoints", "power", "momentum"]);

/** A literal marker is kept only up to this many characters of canonical JSON. */
const LITERAL_LIMIT = 64;

/* -------------------------------------------- */
/*  Canonical form and fingerprints              */
/* -------------------------------------------- */

/**
 * A value as the comparison reads it: key order ignored and a null or absent key read as absent
 * at every depth (`walk.mjs#sameStored`'s rule), and every run of whitespace in a string read as
 * one space, so the parser's wrapping never makes the old book look like a GM's words.
 *
 * @param {*} value
 * @returns {*}
 */
export function canon(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === null || value[key] === undefined) continue;
      out[key] = canon(value[key]);
    }
    return out;
  }
  return value ?? null;
}

/**
 * One row as the comparison reads it: an ability row's descriptor cleaned to its whole shape
 * (`cleanAutomation`, which the model's `migrateData` runs on every stored row) with the spent use
 * left out, because spending one is play (0.13.1's rule).
 *
 * @param {object} row
 * @param {string} list  one of `ROW_LISTS`
 */
export function canonRow(row, list) {
  if (!row || typeof row !== "object") return canon(row);
  if (!ABILITY_LISTS.has(list)) return canon(row);
  const automation = cleanAutomation(row.automation);
  automation.uses.value = null;
  return canon({ ...row, automation });
}

/** cyrb53: a 53-bit string hash, the same in Node and the browser. */
function cyrb53(text, seed) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * The fingerprint of an already canonical value: two seeds of cyrb53, about 106 bits.
 *
 * @param {*} canonical
 * @returns {string}
 */
export function fingerprint(canonical) {
  const text = JSON.stringify(canonical ?? null);
  return `${cyrb53(text, 0).toString(36)}.${cyrb53(text, 1).toString(36)}`;
}

/**
 * The marker the table holds for an old value: the canonical value where it is short, else
 * `{"#": fingerprint}`. A row and a run of prose are always a fingerprint.
 *
 * @param {*} value
 * @param {string|null} [list]  the row list, for a row
 */
export function markerOf(value, list = null) {
  const canonical = list ? canonRow(value, list) : canon(value);
  // The book's prose is always a fingerprint, however short: the table carries no paragraph of 14
  // (Deathmaw's one-line Ecology, D-1824).
  const prose = typeof canonical === "string" && canonical.includes("<");
  if (!list && !prose && JSON.stringify(canonical ?? null).length <= LITERAL_LIMIT) return canonical;
  return { "#": fingerprint(canonical) };
}

/** Whether a marker is a fingerprint. */
const isPrint = marker => Boolean(marker) && typeof marker === "object" && !Array.isArray(marker) && typeof marker["#"] === "string" && Object.keys(marker).length === 1;

/**
 * Whether a stored value is the one a marker records.
 *
 * @param {*} stored
 * @param {*} marker
 * @param {string|null} [list]
 */
export function matchesMarker(stored, marker, list = null) {
  const canonical = list ? canonRow(stored, list) : canon(stored);
  if (isPrint(marker)) return fingerprint(canonical) === marker["#"];
  return JSON.stringify(canonical ?? null) === JSON.stringify(canon(marker) ?? null);
}

/** Whether two values read the same. */
export function sameCanon(a, b, list = null) {
  const read = v => JSON.stringify((list ? canonRow(v, list) : canon(v)) ?? null);
  return read(a) === read(b);
}

/* -------------------------------------------- */
/*  Field paths                                  */
/* -------------------------------------------- */

/** The value at a dotted path, or undefined. */
export function valueAt(object, path) {
  let at = object;
  for (const key of String(path).split(".")) {
    if (!at || typeof at !== "object") return undefined;
    at = at[key];
  }
  return at;
}

/**
 * The stored fields one old system and one new system disagree on, at the granularity the
 * migration writes: every top-level key of `system`, but each ability score by itself
 * (`abilities.str.value`), and never a row list (those are `rowOps`).
 *
 * @param {object} before  the old system
 * @param {object} after   the new system
 * @returns {string[]}
 */
export function changedFields(before = {}, after = {}) {
  const out = [];
  const keys = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])];
  for (const key of keys) {
    if (ROW_LISTS.includes(key)) continue;
    if (key === "abilities") {
      const scores = [...new Set([...Object.keys(after?.abilities ?? {}), ...Object.keys(before?.abilities ?? {})])];
      for (const score of scores) {
        const path = `abilities.${score}.value`;
        if (!sameCanon(valueAt(before, path), valueAt(after, path))) out.push(path);
      }
      continue;
    }
    // A pool's maximum by itself (D-1806, King Mosh made a Boss): its value and its temporary Health
    // are play (`NEVER_WRITTEN`), and a stored `temp: 0` the pack never carries would read the
    // whole object as a GM's own and keep the old maximum for ever.
    if (POOL_FIELDS.includes(key)) {
      const path = `${key}.max`;
      if (!sameCanon(valueAt(before, path), valueAt(after, path))) out.push(path);
      continue;
    }
    if (!sameCanon(before?.[key], after?.[key])) out.push(key);
  }
  return out;
}

/**
 * What the audit did to one row list, as operations the migration replays: an EDIT or a RENAME of
 * a row the old pack held (`name`, its old name; `to`, its new name; `was`, its marker), a DROP
 * (`to: null`) and an ADD (`name: null`). A row gone and a row added at the SAME index are one
 * renamed row, so a GM's rework of the old row keeps the new one out too.
 *
 * @param {object[]} before
 * @param {object[]} after
 * @param {string} list
 * @returns {object[]}
 */
export function rowOps(before = [], after = [], list) {
  const oldRows = Array.isArray(before) ? before : [];
  const newRows = Array.isArray(after) ? after : [];
  const oldNames = oldRows.map(r => r?.name);
  const newNames = newRows.map(r => r?.name);
  const ops = [];
  const paired = new Set();
  oldRows.forEach((row, at) => {
    const name = row?.name;
    let to = newNames.includes(name) ? name : null;
    if (to === null && at < newRows.length && !oldNames.includes(newNames[at])) to = newNames[at];
    if (to !== null) paired.add(to);
    const fresh = to === null ? null : newRows[newNames.indexOf(to)];
    if (to === name && sameCanon(row, fresh, list)) return;
    ops.push({ name, to, was: markerOf(row, list) });
  });
  newRows.forEach(row => {
    if (!paired.has(row?.name)) ops.push({ name: null, to: row?.name });
  });
  return ops;
}

/* -------------------------------------------- */
/*  Finding a creature's entry                   */
/* -------------------------------------------- */

/**
 * The bestiary entry a stored compendium source names, or null (0.13.1's reading).
 *
 * @param {string|null|undefined} uuid
 * @returns {string|null}
 */
export function bestiaryEntryId(uuid) {
  const match = /^Compendium\.azeroth-rpg\.bestiary\.(?:Actor\.)?([A-Za-z0-9]{16})$/.exec(String(uuid ?? ""));
  return match ? match[1] : null;
}

/**
 * A world creature's BEFORE entry, with its pack id: by the bestiary entry it was dragged from
 * where it records one (a copy a GM renamed is still found), else by its name, else by its bond's
 * `entryName` (a bound or raised creature, made from the entry). A source naming an entry the
 * audit did not change answers null: that creature has nothing to take.
 *
 * @param {{name?: string|null, source?: string|null, entryName?: string|null}} creature
 * @param {object} table  the BEFORE table
 * @returns {object|null}  `{id, name, fields, rows}`
 */
export function entryFor({ name = null, source = null, entryName = null } = {}, table) {
  const creatures = table?.creatures ?? {};
  const id = bestiaryEntryId(source);
  if (id) return Object.hasOwn(creatures, id) ? { id, ...creatures[id] } : null;
  for (const candidate of [name, entryName]) {
    if (!candidate) continue;
    const hit = Object.entries(creatures).find(([, e]) => e.name === candidate);
    if (hit) return { id: hit[0], ...hit[1] };
  }
  return null;
}

/**
 * Whether a creature's Initiative is DERIVED rather than read off its block: a bound, raised or
 * thrall creature acts on its owner's (`AzerothCombatant#derivedInitiative`, D-643), so its stored
 * number is left as it stands.
 *
 * @param {object|null} flags  the stored `flags`
 */
export function initiativeDerived(flags) {
  return Boolean(flags?.["azeroth-rpg"]?.bond?.ownerUuid);
}

/* -------------------------------------------- */
/*  The plan                                     */
/* -------------------------------------------- */

const clone = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/** A `TypedObjectField` written whole (CLAUDE.md §15: never `-=`). */
export function forced(value) {
  return globalThis.foundry?.data?.operators?.ForcedReplacement?.create?.(value) ?? value;
}

/**
 * The pack's row, restamped onto a stored one: the pack's whole row, keeping the use the creature
 * has spent where the pack's uses count the same (0.13.1's `restamp`).
 */
function restampRow(stored, fresh, list) {
  const out = clone(fresh);
  if (!ABILITY_LISTS.has(list) || !out?.automation) return out;
  const held = cleanAutomation(stored?.automation).uses;
  const want = cleanAutomation(out.automation).uses;
  if (want.max !== null && held.max === want.max && held.per === want.per && held.value !== null) {
    out.automation.uses = { ...(out.automation.uses ?? {}), value: Math.min(held.value, want.max) };
  }
  return out;
}

/**
 * One row list replayed: the new list, or null where nothing moved.
 *
 * @returns {{rows: object[]|null, written: string[], kept: string[], unmatched: string[]}}
 */
export function planRows(stored, fresh, ops, list) {
  const out = { rows: null, written: [], kept: [], unmatched: [] };
  if (!Array.isArray(ops) || !ops.length) return out;
  const rows = Array.isArray(stored) ? stored.map(clone) : [];
  const packRows = Array.isArray(fresh) ? fresh : [];
  const packRow = name => packRows.find(r => r?.name === name) ?? null;
  let moved = false;
  for (const op of ops.filter(o => o.name !== null)) {
    const at = rows.findIndex(r => r?.name === op.name);
    if (at < 0) {
      // Already renamed by a run before, or a drop already made: nothing to do. A row under
      // neither name was taken off or renamed by a GM.
      if (op.to === null || rows.some(r => r?.name === op.to)) continue;
      out.unmatched.push(op.name);
      continue;
    }
    const want = op.to === null ? null : packRow(op.to);
    if (op.to !== null && !want) { out.unmatched.push(op.name); continue; }
    if (want && sameCanon(rows[at], want, list)) continue;
    if (!matchesMarker(rows[at], op.was, list)) { out.kept.push(op.name); continue; }
    if (want) rows[at] = restampRow(rows[at], want, list);
    else rows.splice(at, 1);
    out.written.push(op.to ?? op.name);
    moved = true;
  }
  for (const op of ops.filter(o => o.name === null)) {
    if (rows.some(r => r?.name === op.to)) continue;
    const want = packRow(op.to);
    if (!want) { out.unmatched.push(op.to); continue; }
    const p = packRows.indexOf(want);
    const before = p > 0 ? rows.findIndex(r => r?.name === packRows[p - 1]?.name) : -1;
    const insertAt = p === 0 ? 0 : before >= 0 ? before + 1 : rows.length;
    rows.splice(insertAt, 0, clone(want));
    out.written.push(op.to);
    moved = true;
  }
  if (moved) out.rows = rows;
  return out;
}

/**
 * One creature's plan: the update or null, and what it wrote, kept and could not match.
 *
 * @param {object|null} raw    the stored system
 * @param {object|null} pack   the pack copy's system
 * @param {object|null} entry  its BEFORE entry
 * @param {{derivedInitiative?: boolean}} [options]
 * @returns {{update: object|null, written: string[], kept: string[], unmatched: string[], skipped: string[]}}
 */
export function planCreature(raw, pack = null, entry = null, { derivedInitiative = false } = {}) {
  const plan = { update: null, written: [], kept: [], unmatched: [], skipped: [] };
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !entry) return plan;
  const update = {};
  for (const [path, marker] of Object.entries(entry.fields ?? {})) {
    if (NEVER_WRITTEN.includes(path)) continue;
    if (path === "initiative" && derivedInitiative) { plan.skipped.push(path); continue; }
    const stored = valueAt(raw, path);
    const want = valueAt(pack, path);
    if (sameCanon(stored, want)) continue;
    if (!matchesMarker(stored, marker)) { plan.kept.push(path); continue; }
    update[`system.${path}`] = TYPED_OBJECT_FIELDS.includes(path) ? forced(clone(want ?? {})) : clone(want);
    plan.written.push(path);
    // A creature at its full Health stays full when its maximum moves (King Mosh, 70 to 212); one
    // already wounded keeps the Health it has, which is play. A Power or Momentum pool the creature
    // never held (no stored maximum) opens full, as a new creature's does (Immol'thar, D-1824).
    const pool = POOL_FIELDS.find(k => path === `${k}.max`);
    if (pool && Number.isFinite(want)) {
      const value = valueAt(raw, `${pool}.value`);
      const unheld = pool !== "health" && pool !== "bossPoints" && (stored === null || stored === undefined);
      if ((Number.isFinite(stored) && value === stored) || unheld) update[`system.${pool}.value`] = want;
    }
  }
  for (const [list, ops] of Object.entries(entry.rows ?? {})) {
    const rows = planRows(raw[list], pack[list], ops, list);
    if (rows.rows) update[`system.${list}`] = rows.rows;
    plan.written.push(...rows.written.map(n => `${list}: ${n}`));
    plan.kept.push(...rows.kept.map(n => `${list}: ${n}`));
    plan.unmatched.push(...rows.unmatched.map(n => `${list}: ${n}`));
  }
  plan.update = Object.keys(update).length ? update : null;
  return plan;
}

/* -------------------------------------------- */
/*  Whether the pack was rebuilt                 */
/* -------------------------------------------- */

/**
 * Six values only a pack compiled after the audit holds: one from phase 1 (Hakkar's renamed
 * label, D-1788), two from the attribute pass (Dracolich's Bite +9, the Shade's Str dash, D-1790 to
 * D-1795), one from the size rule (the Infernal's Str 18, D-1799) and two from the 2026-11 build
 * (the Molten Giant an Elemental, Immol'thar's Power 16; D-1824).
 */
export const PASS_SENTINELS = Object.freeze([
  Object.freeze({ name: "Hakkar the Soulflayer", says: "Hakkar Cause Insanity", holds: s => (s?.creatureAbilities ?? []).some(r => r?.name === "Hakkar Cause Insanity") }),
  Object.freeze({ name: "Dracolich", says: "Bite +9", holds: s => (s?.attacks ?? []).find(a => a?.name === "Bite")?.bonus === 9 }),
  Object.freeze({ name: "Shade", says: "Str —", holds: s => Boolean(s?.abilities?.str) && (s.abilities.str.value ?? null) === null }),
  Object.freeze({ name: "Infernal", says: "Str 18", holds: s => s?.abilities?.str?.value === 18 }),
  // The 2026-11 build's edits to existing creatures (D-1810, D-1824): a pack compiled between the
  // audit and the build would otherwise read every one of them as already written.
  Object.freeze({ name: "Molten Giant", says: "Elemental", holds: s => s?.creatureType === "elemental" }),
  Object.freeze({ name: "Immol'thar", says: "Power 16", holds: s => s?.power?.max === 16 })
]);

/**
 * The sentinels a pack fails, by name: empty where the pack carries the audit.
 *
 * @param {Map<string, object>|null|undefined} byName  the pack's systems by creature name
 * @returns {string[]}
 */
export function missingSentinels(byName) {
  return PASS_SENTINELS.filter(s => !s.holds(byName?.get?.(s.name) ?? null)).map(s => `${s.name} (${s.says})`);
}
