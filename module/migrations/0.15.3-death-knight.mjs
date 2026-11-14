/**
 * Migration to 0.15.3 - the Death Knight release, on what a world already holds
 * (D-917 to D-995; the repairs are D-948 and D-996).
 *
 * One version, three repairs, each read against the PACK COPY and never against
 * `undefined` (D-665), each a no-op on its second pass:
 *
 * 1. **A class that refuses shields trains none** (D-948): `0.15.3-class-shields.mjs`,
 *    built in run F1 and registered here.
 * 2. **The spells 07 moved out of Shadow are Death spells** (D-922, D-941). Contagion,
 *    Death Coil, Drain Life, Exsanguinate, Grave Coil, Graveblight, Necrosis, Necrotic
 *    Shell, Siphon Life, Speak with the Dead and Wasting are 07 §17's now. A copy a world
 *    already holds still says `school: shadow`, so a Warlock's Death Coil was never *Death
 *    magic* to the healing law (`rules/undead.mjs#healingRefusal`) and its section sat
 *    under Shadow on every list. Only the pair `shadow` held / `death` in the pack is
 *    written, with the section beside it. **The cost pool and the CLASSES line are left
 *    alone**: what a Warlock who already knows Grave Coil, Graveblight or Necrotic Shell
 *    keeps is the lead's call (O-385), and restamping either would take the spell away.
 * 3. **The descriptors run F4b's parse moved** (O-373, D-985): Wall of Ice's and Ossuary
 *    Wall's `applies.changes` (a section's Ward is not the target's) and Pall of Despair's
 *    `areaTick.who` and `areaTick.remains` (the Bane on an enemy inside). Written only
 *    while the held entry's words are the book's, so a GM's rewrite is kept.
 * 4. **A held Legendary takes 08 §20's rune slots** (D-943): the weapons pack stamps
 *    `runeSlots {two, one}` on the ten Legendaries the table names, and a copy a world
 *    already holds stores none, so the rune law would read the 8 / 4 default off it.
 *    Written only where the held copy stores no count of its own.
 *
 * **A PACK THAT PREDATES A REPAIR WARNS AND STAMPS NOTHING** (D-758's rule, as step 1 has it;
 * the final review's finding 7, D-997): a spells pack in which no spell is a Death spell, or a
 * weapons pack in which no weapon names a rune-slot count, was built before the repair, and a
 * pass over it would write nothing and mark the world past this version. Each warns in words and
 * skips its own steps; it never throws, because a throw is a console error on every load.
 *
 * Every document touched is logged by `walkWorld`.
 */

import { migrate as migrateShields } from "./0.15.3-class-shields.mjs";
import { plainOf } from "./0.12.12-paladin-areas.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The spells whose held descriptors O-373 names, and which keys each restamps. */
export const DESCRIPTOR_RESTAMPS = Object.freeze({
  "wall-of-ice": Object.freeze(["applies.changes"]),
  "ossuary-wall": Object.freeze(["applies.changes"]),
  "pall-of-despair": Object.freeze(["areaTick.who", "areaTick.remains"])
});

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const at = (object, dotted) => dotted.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), object);
const clone = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * The update for one held spell's raw system, or null.
 *
 * @param {object} raw        the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const update = {};
  // 2. A moved spell: exactly the pair, so a GM's own school choice is kept.
  if (raw.school === "shadow" && pack.school === "death") {
    update["system.school"] = "death";
    const section = pack.source?.section;
    if (section && raw.source?.section !== section) update["system.source.section"] = section;
  }
  // 3. O-373's descriptors, while the entry's words are the book's.
  const keys = DESCRIPTOR_RESTAMPS[pack.identifier] ?? null;
  if (keys && raw.identifier === pack.identifier && plainOf(raw.effect) === plainOf(pack.effect)) {
    for (const key of keys) {
      const want = at(pack, key);
      if (want === undefined) continue;
      if (!same(at(raw, key), want)) update[`system.${key}`] = clone(want);
    }
  }
  return Object.keys(update).length ? update : null;
}

/** Whether a stored rune-slot count names a number of its own. */
function holdsCount(slots) {
  return Boolean(slots && typeof slots === "object" && (Number.isInteger(slots.two) || Number.isInteger(slots.one)));
}

/**
 * The update for one held weapon's raw system, or null: 08 §20's rune slots where the
 * pack names a count and the held copy stores none.
 *
 * @param {object} raw        the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {object|null}
 */
export function buildRuneSlotsUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  if (!holdsCount(pack.runeSlots) || holdsCount(raw.runeSlots)) return null;
  return { "system.runeSlots": { two: pack.runeSlots.two ?? null, one: pack.runeSlots.one ?? null } };
}

/**
 * **WHETHER THE SPELLS PACK CARRIES STEPS 2 AND 3** (finding 7): a pack built before 07 moved the
 * eleven spells holds no Death spell at all.
 *
 * @param {{byIdentifier?: Map<string, object>}|null} table  `walk.mjs#packSystems`
 */
export function spellPackCarriesRepair(table) {
  for (const system of table?.byIdentifier?.values?.() ?? []) if (system?.school === "death") return true;
  return false;
}

/**
 * **WHETHER THE WEAPONS PACK CARRIES STEP 4** (finding 7): a pack built before the parser stamped
 * 08 §20's counts names no rune-slot count on any weapon.
 *
 * @param {{byIdentifier?: Map<string, object>}|null} table  `walk.mjs#packSystems`
 */
export function weaponPackCarriesRepair(table) {
  for (const system of table?.byIdentifier?.values?.() ?? []) if (holdsCount(system?.runeSlots)) return true;
  return false;
}

/** The words a stale pack is warned in: what to run, and to set the version back. */
const STALE = (pack, what) => `azeroth-rpg | ${pack} predates the 0.15.3 repair (${what}), so nothing of it was restamped. `
  + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.3 and reload.";

export async function migrate(log = console.log) {
  const shields = await migrateShields(log);
  const spells = await packSystems("azeroth-rpg.spells");
  const weapons = await packSystems("azeroth-rpg.weapons");
  // Steps 2 to 4 stamp nothing off a pack that predates them (finding 7): warned, never thrown.
  const spellsFresh = spellPackCarriesRepair(spells);
  const weaponsFresh = weaponPackCarriesRepair(weapons);
  if (!spellsFresh) console.warn(STALE("azeroth-rpg.spells", "no spell is a Death spell (D-922, D-941)"));
  if (!weaponsFresh) console.warn(STALE("azeroth-rpg.weapons", "no weapon names its rune slots (D-943)"));
  if (!spellsFresh && !weaponsFresh) return shields;
  const restamped = await walkWorld({
    item: doc => {
      const raw = rawSystem(doc);
      if (doc.type === "spell" && spellsFresh) return buildSpellUpdate(raw, packCopy(spells, raw, doc.name));
      if (doc.type === "weapon" && weaponsFresh) return buildRuneSlotsUpdate(raw, packCopy(weapons, raw, doc.name));
      return null;
    }
  }, log);
  return shields + restamped;
}
