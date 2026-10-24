/**
 * Migration to 0.12.25 - the Legacies become talent branches (D-781; the Legacy
 * branches' door 1 and its data).
 *
 * What a world made before this version holds, and what it is brought to:
 *
 * 1. **A character of a people who keeps a Legacy on a class it holds is given
 *    the branch**: its twelve talents, untaken, embedded from the pack (04 §1 -
 *    *open from level 1 to a character of its people who holds its class*). Only
 *    embedded, never withdrawn: what a character should NOT hold arrives with no
 *    world before this version, and the race's own resync (`AzerothActor
 *    #syncLegacyBranches`) is the door that takes a branch away.
 * 2. **A Legacy item is rewritten whole as the lore item it is now**: the retired
 *    title's `entry`, `rank` and `ranks` (D-581, D-588) are stripped from the
 *    stored document - `LegacyData.migrateData` and the schema already keep them
 *    out of memory, and a whole replacement is the only write that takes them
 *    out of the database - and its people, class, branch, *What it builds* and
 *    lore come off the pack copy. **The GM is told which characters held one**,
 *    because the ranks they paid XP for are gone with the title.
 * 3. **A weapon takes 08 §7's Type off its pack copy** (the Legacy branches'
 *    door 15). **Compared against the pack copy, never against `undefined`**
 *    (D-665): `weaponType` has an initial of null, so every weapon stored before
 *    reads null rather than absent, and the pack's type is stamped only over
 *    that null - a type a GM chose on the item sheet stands.
 * 4. **Five undead take D-781's Mindless with the dashed Int and Cha**, and three
 *    creatures the seeder misread take their ability's new descriptor - each
 *    only where the world copy still holds the OLD pack value it replaces, so a
 *    GM's own number is never overwritten.
 *
 * Idempotent by construction: every builder compares against the pack copy and
 * answers null once the world holds it. Every document touched is logged.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { isLegacyTalent, owedTalents } from "../rules/legacy-branches.mjs";
import { cleanWeaponType } from "../rules/wield.mjs";
import { cleanAutomation } from "../rules/ability-automation.mjs";

const clone = value => JSON.parse(JSON.stringify(value ?? null));

/** Deep equality with key order ignored: a stored object and a pack copy may list keys differently. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/** Replace a value whole where core's operator exists; the plain value under Vitest. */
function replaceWhole(value) {
  return globalThis.foundry?.data?.operators?.ForcedReplacement?.create?.(value) ?? value;
}

/* -------------------------------------------- */
/*  1. The Legacy branches a character is owed   */
/* -------------------------------------------- */

/** The fields the talent index carries for the grant. */
export const TALENT_INDEX_FIELDS = Object.freeze(["system.className", "system.identifier", "system.legacy", "system.race"]);

/**
 * The Legacy talents one actor is owed and does not hold, off the talent pack's
 * index: a character, of the people that keeps a Legacy on a class it holds.
 *
 * @param {{type?: string, people?: string|null, classNames?: string[], held?: {className?: string, identifier?: string}[]}} actor
 * @param {object[]} index  the talent pack's index (`TALENT_INDEX_FIELDS`)
 * @returns {object[]} the index entries to embed
 */
export function owedLegacyEntries({ type = null, people = null, classNames = [], held = [] } = {}, index = []) {
  if (type !== "character" || !people || !classNames?.length) return [];
  const have = new Set((held ?? []).map(t => `${t.className ?? ""}::${t.identifier ?? ""}`));
  return owedTalents(index, { classNames, people })
    .filter(e => isLegacyTalent(e.system) && !have.has(`${e.system.className}::${e.system.identifier}`));
}

/** An actor as `owedLegacyEntries` reads it. */
function actorFacts(doc) {
  const items = [...(doc.items ?? [])];
  return {
    type: doc.type,
    people: items.find(i => i.type === "race")?.name ?? null,
    classNames: [...new Set(items.filter(i => i.type === "class").map(i => i.name))],
    held: items.filter(i => i.type === "talent" && !i.system?.race)
      .map(i => ({ className: i.system?.className ?? "", identifier: i.system?.identifier ?? "" }))
  };
}

/* -------------------------------------------- */
/*  2. A Legacy item, the lore item it is now    */
/* -------------------------------------------- */

/** The retired title's fields (D-581, D-588), stripped from the stored document. */
export const RETIRED_FIELDS = Object.freeze(["entry", "rank", "ranks"]);

/**
 * A Legacy item's update, or null: its whole system replaced by the pack copy's,
 * which strips the retired title's fields from the database. Null where there is
 * no pack copy (a GM's own Legacy item keeps what it holds; the schema already
 * hides the retired fields) or where the stored system is already the pack's.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildLegacyItemUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  // A pack that predates D-781 names no branch: nothing to bring the item to.
  if (!pack.branch) return null;
  if (same(raw, pack) && !RETIRED_FIELDS.some(k => k in raw)) return null;
  return { system: replaceWhole(clone(pack)) };
}

/* -------------------------------------------- */
/*  3. A weapon's Type                            */
/* -------------------------------------------- */

/**
 * A weapon's update, or null: the pack copy's 08 §7 Type stamped over the
 * stored null (D-665: the pack, never `undefined`). A type the weapon already
 * carries - the pack's, or a GM's own off the item sheet - stands.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildWeaponTypeUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const want = cleanWeaponType(pack.weaponType);
  if (want === null) return null;
  if (cleanWeaponType(raw.weaponType) !== null) return null;
  return { "system.weaponType": want };
}

/* -------------------------------------------- */
/*  4. The creatures D-781 moved                  */
/* -------------------------------------------- */

/**
 * The old pack's values on the five undead D-781 made Mindless (*"Accept it;
 * dash Int and Cha"*): a world copy still holding exactly these takes the pack's
 * `typeMarker` and its dashed Int and Cha. The Risen Skeleton and the Risen
 * Zombie already carried the marker.
 */
export const MINDLESS_BEFORE = Object.freeze({
  "Abomination": Object.freeze({ typeMarker: null, int: 3, cha: 3 }),
  "Gargoyle": Object.freeze({ typeMarker: null, int: 6, cha: 4 }),
  "Plagued Ghoul": Object.freeze({ typeMarker: null, int: 3, cha: 3 }),
  "Risen Skeleton": Object.freeze({ int: 4, cha: 4 }),
  "Risen Zombie": Object.freeze({ int: 3, cha: 3 })
});

/**
 * Three abilities the seeder read as attacks the creature makes, because a Boon
 * on an Attack Test was read flat (`ability-automation.mjs#seedAutomation`, fixed
 * with D-781's Battle Chicken): the old descriptor differs from the pack's in the
 * fields `was` names alone, and a world copy still holding exactly the old one
 * takes the new. The Rifleman's Steady also stood its Boon on every attack,
 * because *in a turn in which it did not move* was not read as the gate it is.
 */
const NO_NEAR = Object.freeze({ name: null, feet: null, count: null });
export const RESEEDED = Object.freeze({
  "Rifleman": Object.freeze({
    list: "creatureAbilities", ability: "Steady",
    was: Object.freeze({
      kind: "attack", reason: "",
      passive: Object.freeze({ grants: Object.freeze(["A Boon on attack"]), refuses: Object.freeze([]), senses: Object.freeze([]), when: null, near: NO_NEAR })
    })
  }),
  "Scarlet Chaplain": Object.freeze({ list: "creatureAbilities", ability: "Sermon", was: Object.freeze({ kind: "attack", reason: "" }) }),
  "Syndicate Highwayman": Object.freeze({ list: "creatureAbilities", ability: "From Cover", was: Object.freeze({ kind: "attack", reason: "" }) })
});

/**
 * A creature's update, or null.
 *
 * @param {string} name  the creature's name, as the pack and the two tables above key it
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildCreatureUpdate(name, raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const update = {};
  const before = Object.hasOwn(MINDLESS_BEFORE, name) ? MINDLESS_BEFORE[name] : null;
  if (before) {
    if ("typeMarker" in before) {
      const stored = raw.typeMarker ?? null;
      const want = pack.typeMarker ?? null;
      if (stored === before.typeMarker && want !== stored) update["system.typeMarker"] = want;
    }
    for (const key of ["int", "cha"]) {
      if (!(key in before)) continue;
      const stored = raw.abilities?.[key]?.value ?? null;
      const want = pack.abilities?.[key]?.value ?? null;
      if (stored === before[key] && want !== stored) update[`system.abilities.${key}.value`] = want;
    }
  }
  const reseed = Object.hasOwn(RESEEDED, name) ? RESEEDED[name] : null;
  if (reseed) {
    const rows = Array.isArray(raw[reseed.list]) ? raw[reseed.list] : [];
    const fresh = (Array.isArray(pack[reseed.list]) ? pack[reseed.list] : []).find(r => r?.name === reseed.ability) ?? null;
    const at = rows.findIndex(r => r?.name === reseed.ability);
    if (fresh && at >= 0) {
      const stale = { ...cleanAutomation(fresh.automation), ...reseed.was };
      if (same(cleanAutomation(rows[at].automation), stale) && !same(stale, cleanAutomation(fresh.automation))) {
        const next = rows.map((r, i) => (i === at ? { ...r, automation: clone(fresh.automation) } : r));
        update[`system.${reseed.list}`] = next;
      }
    }
  }
  return Object.keys(update).length ? update : null;
}

/* -------------------------------------------- */
/*  The walk                                      */
/* -------------------------------------------- */

export async function migrate(log = console.log) {
  const talents = game.packs.get("azeroth-rpg.talents");
  const index = talents ? await talents.getIndex({ fields: [...TALENT_INDEX_FIELDS] }) : [];
  const legacyEntries = index.filter(e => isLegacyTalent(e.system));
  if (talents && !legacyEntries.length) {
    console.warn("azeroth-rpg | 0.12.25: the talents pack holds no Legacy branch yet (D-781), so no character was given one. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.12.24 and reload.");
  }
  const documents = new Map();
  const documentOf = async entry => {
    if (!documents.has(entry._id)) documents.set(entry._id, (await talents.getDocument(entry._id))?.toObject() ?? null);
    return documents.get(entry._id);
  };

  const weapons = await packSystems("azeroth-rpg.weapons");
  const legacies = await packSystems("azeroth-rpg.legacies");
  const bestiary = await packSystems("azeroth-rpg.bestiary");
  const titled = new Set();

  const touched = await walkWorld({
    item: doc => {
      const raw = rawSystem(doc);
      if (doc.type === "weapon") return buildWeaponTypeUpdate(raw, packCopy(weapons, raw, doc.name));
      if (doc.type === "legacy") {
        if (doc.parent?.type === "character") titled.add(doc.parent.name);
        return buildLegacyItemUpdate(raw, packCopy(legacies, raw, doc.name));
      }
      return null;
    },
    actor: doc => (doc.type === "npc" ? buildCreatureUpdate(doc.name, rawSystem(doc), bestiary.byName.get(doc.name) ?? null) : null),
    embeds: async doc => {
      if (!legacyEntries.length) return null;
      const owed = owedLegacyEntries(actorFacts(doc), legacyEntries);
      if (!owed.length) return null;
      return (await Promise.all(owed.map(documentOf))).filter(Boolean).map(clone);
    }
  }, log);

  // The ranks a character paid for are gone with the title (D-781): say whose.
  if (titled.size) {
    const names = [...titled].sort().join(", ");
    log(`azeroth-rpg | 0.12.25: these characters held a Legacy title, retired by D-781: ${names}`);
    ui.notifications?.warn(game.i18n.format("AZEROTH.Migration.LegacyTitles", { names }), { permanent: true });
  }
  return touched;
}
