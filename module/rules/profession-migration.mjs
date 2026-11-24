/**
 * Migration 0.17.0's decisions, pure (D-1903, D-1916; CLAUDE.md §10, §3).
 * `migrations/0.17.0-professions.mjs` walks the world and writes what these
 * answer; every decision is here, under a Vitest.
 *
 * **It rebalances nothing** (D-1916, D-742's precedent): skill Ranks and the XP
 * spent stay exactly as they are. What it does:
 *
 * - every career item is DELETED, embedded and world alike (`careerDeletes`);
 * - a character's `system.career` is cleared (`planCharacter`);
 * - a character that holds no profession is marked `professionOwed`, so the
 *   sheet asks it to choose one, and one that holds one has its pointer set;
 * - a stub profession item (11's old `rank` and `trainer` only) takes the pack
 *   copy's 03 fields and KEEPS its Rank (`planProfession`);
 * - an owned weapon, suit or piece of gear takes the pack copy's `craft` and
 *   `material` where the two differ, compared against the PACK COPY and never
 *   against `undefined` (D-665: a schema field with an initial is never
 *   absent), and a Cooked food its new Use (`planStamps`).
 *
 * **Idempotent**: every plan compares against what is stored and answers null
 * where they agree, so a second run touches nothing.
 */

import { PROFESSION_OWED_FLAG, professionSwap } from "./professions.mjs";

/** The types a craft stamp can sit on (`recipes.mjs#CRAFTED_TYPES`). */
const STAMPED = Object.freeze(["weapon", "armor", "gear"]);

/** Plain-data equality, key order ignored, null and undefined absent (`walk.mjs#sameStored`'s rule). */
export function same(a, b) {
  const norm = v => (Array.isArray(v) ? v.map(norm)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== null && v[k] !== undefined).map(k => [k, norm(v[k])]))
      : v);
  return JSON.stringify(norm(a ?? null)) === JSON.stringify(norm(b ?? null));
}

/** Every career item among an actor's (or the world's) items, ids sorted. */
export function careerDeletes(items = []) {
  return [...(items ?? [])].filter(i => i?.type === "career").map(i => String(i.id ?? i._id)).sort();
}

/**
 * One character's actor-level writes: the career cleared, the profession
 * pointer set where one is held and unpointed, `professionOwed` where none is.
 *
 * @param {{system?: object, flags?: object, items?: Array<{id: string, type: string}>}} actor
 *   the stored actor; `items` what it will hold once its careers are deleted
 * @returns {object|null}  a flat update, or null where nothing moves
 */
export function planCharacter({ system = {}, flags = {}, items = [] } = {}) {
  const update = {};
  const career = system?.career ?? null;
  if (career && (career.itemId !== null && career.itemId !== undefined)) update["system.career.itemId"] = null;
  if (career && Number(career.tier ?? 1) !== 1) update["system.career.tier"] = 1;
  const professions = (items ?? []).filter(i => i?.type === "profession").map(i => String(i.id ?? i._id)).sort();
  const pointer = system?.profession?.itemId ?? null;
  const owed = flags?.["azeroth-rpg"]?.[PROFESSION_OWED_FLAG] === true;
  if (professions.length) {
    if (!professions.includes(pointer)) update["system.profession.itemId"] = professions[0];
    if (owed) update[`flags.azeroth-rpg.${PROFESSION_OWED_FLAG}`] = false;
  } else if (!owed) {
    update[`flags.azeroth-rpg.${PROFESSION_OWED_FLAG}`] = true;
  }
  return Object.keys(update).length ? update : null;
}

/**
 * **TWO PROFESSIONS ON ONE CHARACTER COLLAPSE TO ONE** (03 §4: one at a time; the
 * professions review's minor 7). A world that held two of 11's old stub items
 * would otherwise keep both until a profession was next dropped. The one the
 * character points at is kept (else the first by id), with the highest Rank any
 * of them held - `professions.mjs#professionSwap`'s own rule, so the migration
 * and a drop on the sheet can never disagree - and the others are deleted.
 * Null where the character holds one or none.
 *
 * @param {Array<{id: string, type: string, system?: {rank?: number}}>} items
 * @param {string|null} pointer  the stored `system.profession.itemId`
 * @returns {{keep: string, remove: string[], rank: number, rankChanged: boolean}|null}
 */
export function professionCollapse(items = [], pointer = null) {
  const held = (items ?? []).filter(i => i?.type === "profession")
    .map(i => ({ id: String(i.id ?? i._id), system: { rank: i.system?.rank } }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (held.length < 2) return null;
  const keep = held.find(p => p.id === pointer) ?? held[0];
  const swap = professionSwap({ arriving: keep, held });
  return { keep: swap.keep, remove: swap.remove, rank: swap.rank, rankChanged: swap.rankChanged };
}

/** The fields 03 §2 gives a profession, in the model's order (`ProfessionData`). */
export const PROFESSION_FIELDS = Object.freeze(["identifier", "ability", "gathers", "tools", "makes", "skills"]);

/**
 * A stored profession item against its pack copy: the 03 fields the copy holds
 * and the stored item lacks or holds differently. **The Rank and the picks are
 * the character's and are never written** (D-1916: a stub keeps its Rank).
 * Null where the copy is unknown or the two already agree.
 *
 * @param {object|null} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 */
export function planProfession(raw, pack) {
  if (!raw || !pack) return null;
  const update = {};
  for (const key of PROFESSION_FIELDS) {
    if (!same(raw[key], pack[key])) update[`system.${key}`] = structuredCloneSafe(pack[key]);
  }
  return Object.keys(update).length ? update : null;
}

/**
 * An owned weapon, suit or gear item against its pack copy: `craft`,
 * `material` and, for a gear item whose copy's Use is new (a Cooked food, a
 * Troll's Blood, a Rage potion), its `use` and `provision`. **Never on a
 * Classic find** (D-685): the copy of one carries no stamp, and a stored
 * stamp on one is removed. Null where the two agree.
 *
 * @param {{type: string, system: object, classic?: boolean}} stored
 * @param {object|null} pack  the pack copy's system
 */
export function planStamps({ type, system = {}, classic = false } = {}, pack = null) {
  if (!STAMPED.includes(type)) return null;
  const update = {};
  if (classic) {
    if (system.craft) update["system.craft"] = null;
    if (system.material) update["system.material"] = null;
    return Object.keys(update).length ? update : null;
  }
  if (!pack) return null;
  if (!same(system.craft ?? null, pack.craft ?? null)) update["system.craft"] = structuredCloneSafe(pack.craft ?? null);
  if (type === "gear" && !same(system.material ?? null, pack.material ?? null)) update["system.material"] = structuredCloneSafe(pack.material ?? null);
  if (type === "gear" && usesNewReading(pack.use) && !same(system.use ?? null, pack.use ?? null)) {
    update["system.use"] = structuredCloneSafe(pack.use);
    if (!same(system.provision ?? null, pack.provision ?? null)) update["system.provision"] = pack.provision ?? null;
  }
  return Object.keys(update).length ? update : null;
}

/** Whether a pack Use carries one of the professions' new readings (D-1945). */
export function usesNewReading(use) {
  if (!use || typeof use !== "object") return false;
  return use.kind === "meal" || use.wellFed === true
    || Number(use.regen?.health) > 0 || Number(use.regen?.mana) > 0 || Number(use.gain?.amount) > 0
    || ["shortRest", "longRest"].includes(use.duration?.units);
}

function structuredCloneSafe(v) {
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}

/* -------------------------------------------- */
/*  The retired rules chapter (O-700)            */
/* -------------------------------------------- */

/**
 * **THE RULES CHAPTER 03-PROFESSIONS REPLACED** (O-700, closed by the decision recorded with this
 * code). `applications/rules-journals.mjs#importRulesJournals` matches a held chapter by the pack's
 * id, and 03-PROFESSIONS has a new one, so a world that imported 03-CAREERS took 03-PROFESSIONS
 * beside it and kept the old chapter, career rules and all. Migration 0.17.0 removes it, and ONLY
 * where the importer made it and nobody has made it into something else:
 *
 * - **made by the importer**: `flags.azeroth-rpg.sourcePack` is the rules pack, and the source id is
 *   03-CAREERS' own or the entry carries the pack's `chapter` flag for it;
 * - **still the chapter**: its name is the chapter's, every page is one of the chapter's nine (or
 *   the repair pass's `<page> (book)` copy of one), and no page was edited after it was made.
 *
 * A journal of that name the GM made, or the importer's copy renamed, given a page of the GM's own or
 * edited, is KEPT and warned about in the log. The chapter's page names are 03-CAREERS' as it last
 * shipped (`packs-src/rules/03-careers.yaml` at 0.16.5), since the pack no longer carries it.
 */
export const RETIRED_CHAPTERS = Object.freeze([Object.freeze({
  name: "03-CAREERS",
  sourceId: "U7CDB3DbXLjFhq5q",
  pages: Object.freeze([
    "1. What a career is", "2. The template", "3. Entering, advancing, and leaving", "4. Standing",
    "5. Tier 1 careers", "6. Tier 2 careers", "7. Tier 3 careers", "8. Tier 4 careers", "9. Building your own"
  ])
})]);

/** The pack the importer stamps on every chapter it makes (`rules-journals.mjs#RULES_PACK`). */
export const RULES_PACK = "azeroth-rpg.rules";

/** Seconds a page may sit between its create and its last write and still count as unedited. */
export const EDIT_GRACE_MS = 60_000;

/**
 * What migration 0.17.0 does with the world's journals for the retired chapters.
 *
 * @param {object} o
 * @param {Array<{id: string, name: string, flags?: object, pages?: Array<{name: string, _stats?: {createdTime?: number, modifiedTime?: number}}>}>} o.journals
 *   the world's journal entries as plain rows
 * @param {string[]} o.bookIds  the ids the rules pack holds NOW
 * @param {string} [o.suffix]  the repair pass's book-copy suffix (`AZEROTH.Journals.BookCopy`)
 * @returns {{deletes: string[], kept: Array<{id: string, name: string, reason: string}>, stale: boolean}}
 *   `stale` where the rules pack still holds a retired chapter (built before the professions): the
 *   caller defers and touches nothing
 */
export function planRetiredChapters({ journals = [], bookIds = [], suffix = "(book)" } = {}) {
  const book = new Set(bookIds ?? []);
  if (RETIRED_CHAPTERS.some(c => book.has(c.sourceId))) return { deletes: [], kept: [], stale: true };
  const deletes = [];
  const kept = [];
  const nameKey = n => String(n ?? "").trim().toUpperCase();
  for (const j of journals ?? []) {
    const ns = j?.flags?.["azeroth-rpg"] ?? {};
    const chapter = RETIRED_CHAPTERS.find(c => ns.sourceId === c.sourceId || nameKey(ns.chapter) === c.name || nameKey(j?.name) === c.name);
    if (!chapter) continue;
    const id = String(j.id ?? j._id ?? "");
    const fromImporter = ns.sourcePack === RULES_PACK && (ns.sourceId === chapter.sourceId || nameKey(ns.chapter) === chapter.name);
    if (!fromImporter) { kept.push({ id, name: String(j.name ?? ""), reason: "notImported" }); continue; }
    if (nameKey(j.name) !== chapter.name) { kept.push({ id, name: String(j.name ?? ""), reason: "renamed" }); continue; }
    const known = new Set([...chapter.pages, ...chapter.pages.map(n => `${n} ${suffix}`.trim())]);
    const pages = [...(j.pages ?? [])];
    if (pages.some(p => !known.has(String(p?.name ?? "")))) { kept.push({ id, name: String(j.name), reason: "pageAdded" }); continue; }
    const edited = pages.some(p => {
      const made = Number(p?._stats?.createdTime);
      const last = Number(p?._stats?.modifiedTime);
      return Number.isFinite(made) && Number.isFinite(last) && last - made > EDIT_GRACE_MS;
    });
    if (edited) { kept.push({ id, name: String(j.name), reason: "pageEdited" }); continue; }
    deletes.push(id);
  }
  return { deletes: deletes.sort(), kept: kept.sort((a, b) => a.id.localeCompare(b.id)), stale: false };
}

/**
 * The world map's links that point into a deleted journal (a region's or a settlement's `journal`,
 * an entry or one of its pages), cleared; the map state as stored, or null where nothing pointed
 * there. Present-key safe: only a `journal` naming a deleted entry is taken off its row, and a row
 * left empty goes with it.
 *
 * @param {object|null} state  the stored `worldMap` setting
 * @param {string[]} deleted  the journal entry ids deleted
 * @returns {object|null}
 */
export function planMapLinks(state, deleted = []) {
  if (!state || typeof state !== "object" || !deleted?.length) return null;
  const gone = new Set(deleted);
  const points = uuid => {
    const m = /^JournalEntry\.([^.]+)/.exec(String(uuid ?? ""));
    return Boolean(m && gone.has(m[1]));
  };
  const next = JSON.parse(JSON.stringify(state));
  let moved = false;
  const clean = row => {
    if (!row || typeof row !== "object" || !points(row.journal)) return row;
    moved = true;
    const { journal, ...rest } = row;
    return Object.keys(rest).length ? rest : null;
  };
  for (const [key, row] of Object.entries(next.links?.regions ?? {})) {
    const c = clean(row);
    if (c === null) delete next.links.regions[key]; else next.links.regions[key] = c;
  }
  for (const [key, names] of Object.entries(next.links?.settlements ?? {})) {
    for (const [name, row] of Object.entries(names ?? {})) {
      const c = clean(row);
      if (c === null) delete names[name]; else names[name] = c;
    }
    if (!Object.keys(names ?? {}).length) delete next.links.settlements[key];
  }
  return moved ? next : null;
}
