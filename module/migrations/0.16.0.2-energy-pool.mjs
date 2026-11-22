/**
 * Migration to 0.16.0.2 - the Demon Hunter's third round (the lead's rulings of 2026-11-22; D-1717 to D-1721, the
 * system half D-1723 to D-1726).
 *
 * A point step inside the same unreleased 0.16.0, numbered past 0.16.0.1 as that one was numbered past 0.16.0, so
 * `system.json` stays at the release it is part of.
 *
 * 1. **ONE ENERGY POOL** (02 §10, 05 §12; D-1719, D-1723): a character whose two classes both give Energy - the
 *    Rogue, the Chromatic Champion and the Demon Hunter, in any pair - stored two values, one on each class entry,
 *    and the one pool they now share reads the first (the holder). Every member entry is set to the larger stored
 *    value, held to the merged cap (`rules/energy-merge.mjs#mergeEnergyPlan`), so nobody loses Energy they held and
 *    the mirror every later write keeps (`AzerothActor#writePoolsNow`) starts true. No pack is read for it.
 * 2. **THE GLAIVES LOSE FAST** (08 §7; D-1718): a held Short warglaive or Curved warglaive still carrying Fast is the
 *    old book's copy, and takes its pack copy's traits and description (*Light, Nick, Deft*; *Pierce 1, Bleed,
 *    Deft*). A copy without Fast is a GM's own or already restamped, and is left alone.
 * 3. **DEVOUR THE SPELL'S TRIGGER** (07; D-1717): a held copy whose words still say *Cast this at any moment* takes
 *    its pack copy's effect (*Cast this at the start of the turn of a creature ...*).
 *
 * Each restamp is against the PACK COPY, never `undefined` (D-665). **A pack built before the round warns and
 * stamps nothing of its own part** (D-758's rule): its glaives still carry Fast, or its Devour the Spell still says
 * *at any moment*; the Energy merge runs regardless. Every document touched is logged by `walkWorld`; a second run
 * writes nothing.
 */

import { mergeEnergyPlan } from "../rules/energy-merge.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The two glaives whose traits the round changed (08 §7, D-1718). */
export const RESTAMPED_GLAIVES = Object.freeze(["short-warglaive", "curved-warglaive"]);

const isFast = t => /^fast$/i.test(String(t ?? "").trim());
const words = v => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/**
 * Whether the weapons pack carries the round's glaives: both present and neither carrying Fast.
 *
 * @param {{byIdentifier?: Map<string, object>}|null} table  `walk.mjs#packSystems`
 */
export function weaponPackCarriesRound(table) {
  return RESTAMPED_GLAIVES.every(id => {
    const sys = table?.byIdentifier?.get?.(id) ?? null;
    return Boolean(sys) && Array.isArray(sys.traits) && !sys.traits.some(isFast);
  });
}

/**
 * The update a held glaive takes, or null: a Short or Curved warglaive whose held traits still carry Fast while its
 * pack copy carries none takes the pack's traits and, where it differs, its description.
 *
 * @param {object|null} raw   the held weapon's stored system
 * @param {object|null} pack  its pack copy's system
 */
export function buildGlaiveRestamp(raw, pack = null) {
  if (!raw || !pack || !RESTAMPED_GLAIVES.includes(pack.identifier) || raw.identifier !== pack.identifier) return null;
  const held = Array.isArray(raw.traits) ? raw.traits : [];
  const fresh = Array.isArray(pack.traits) ? pack.traits : [];
  if (!held.some(isFast) || fresh.some(isFast)) return null;
  const update = { "system.traits": clone(fresh) };
  if (typeof pack.description === "string" && raw.description !== pack.description) update["system.description"] = pack.description;
  return update;
}

/** Whether the spells pack carries Devour the Spell's new trigger. */
export function spellPackCarriesRound(table) {
  const sys = table?.byIdentifier?.get?.("devour-the-spell") ?? null;
  return /at the start of the turn of a creature/.test(words(sys?.effect));
}

/**
 * The update a held Devour the Spell takes, or null: its words still the old book's (*Cast this at any moment*) and
 * the pack copy's the new.
 *
 * @param {object|null} raw   the held spell's stored system
 * @param {object|null} pack  its pack copy's system
 */
export function buildDevourRestamp(raw, pack = null) {
  if (!raw || !pack || raw.identifier !== "devour-the-spell" || pack.identifier !== "devour-the-spell") return null;
  if (!/cast this at any moment/.test(words(raw.effect))) return null;
  if (!/at the start of the turn of a creature/.test(words(pack.effect))) return null;
  return { "system.effect": pack.effect };
}

/**
 * The actor update one character takes for the merged Energy pool, or null. Read off the stored classes and the
 * class items it holds, each at its entry's level.
 *
 * @param {{type?: string, _source?: object, items?: Iterable<object>}} doc
 */
export function energyUpdateFor(doc) {
  if (doc?.type !== "character") return null;
  const sys = doc._source?.system ?? doc.system ?? {};
  const classes = Array.isArray(sys.classes) ? sys.classes : [];
  if (classes.length < 2) return null;
  const items = [...(doc.items ?? [])].filter(i => i.type === "class");
  const classItems = classes.map(c => {
    const item = items.find(i => i.id === c.itemId);
    return item ? { ...(rawSystem(item) ?? {}), itemId: item.id, level: c.level ?? 1 } : null;
  }).filter(Boolean);
  const plan = mergeEnergyPlan({ classes, classItems, level: sys.level ?? classes[0]?.level ?? 1 });
  return plan ? { "system.classes": plan.classes } : null;
}

export async function migrate(log = console.log) {
  const weapons = await packSystems("azeroth-rpg.weapons");
  const spells = await packSystems("azeroth-rpg.spells");
  const glaives = weaponPackCarriesRound(weapons);
  const devour = spellPackCarriesRound(spells);
  if (!glaives) console.warn("azeroth-rpg | 0.16.0.2: azeroth-rpg.weapons predates the round (its warglaives still carry Fast), so no held glaive was restamped. Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0.2 and reload.");
  if (!devour) console.warn("azeroth-rpg | 0.16.0.2: azeroth-rpg.spells predates the round (its Devour the Spell still says at any moment), so no held copy was restamped. Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0.2 and reload.");
  return walkWorld({
    actor: doc => {
      const update = energyUpdateFor(doc);
      if (update) log(`azeroth-rpg | 0.16.0.2: ${doc.name}'s two Energy classes share one pool now`);
      return update;
    },
    item: doc => {
      const raw = rawSystem(doc);
      if (glaives && doc.type === "weapon" && RESTAMPED_GLAIVES.includes(raw?.identifier)) {
        const update = buildGlaiveRestamp(raw, packCopy(weapons, raw, doc.name));
        if (update) log(`azeroth-rpg | 0.16.0.2: ${doc.name} loses Fast (08 §7)`);
        return update;
      }
      if (devour && doc.type === "spell" && raw?.identifier === "devour-the-spell") {
        const update = buildDevourRestamp(raw, packCopy(spells, raw, doc.name));
        if (update) log(`azeroth-rpg | 0.16.0.2: ${doc.name} takes its turn-start trigger (07)`);
        return update;
      }
      return null;
    }
  }, log);
}
