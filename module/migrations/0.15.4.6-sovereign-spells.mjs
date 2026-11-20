/**
 * Migration to 0.15.4.6 - the Sovereign's spells on the spells a world already holds (the San'layn
 * and Sovereign plan, B.10 and V1; D-1240, D-1241, D-1242).
 *
 * A point step inside the same unreleased build as RACE's 0.15.4.1 and WEAPON's 0.15.4.2, numbered
 * past them so the agents of one build never share a version.
 *
 * Every spell in the world - world items, every actor's embedded spells (characters and creatures,
 * linked or on an unlinked token) and unlocked world packs - is read against its PACK COPY, never
 * against `undefined` (D-665):
 *
 * 1. **07 prints Vitae** on the Sovereign's 36 spells, and the spell model refused the word until
 *    this build (its choices held Mana and Runic Power alone, and `migrateData` folded any other word
 *    to Mana), so a copy taken from a pack built mid-way reads Mana. It takes Vitae where its pack copy
 *    prints Vitae.
 * 2. **The blood-curse tag** (02 §7) is a field this build added; a held copy whose pack copy carries
 *    it takes it.
 * 3. **Drain Life, Siphon Life and Exsanguinate name the Sovereign**, and Graveblight and Contagion
 *    reach it as open Death spells. The released 0.15.4 adds the Necromancer only where the pack's list
 *    is the held list plus the Necromancer, so against the pack this build parses it writes nothing for
 *    those five: this step adds what the pack names beyond the held list, where every class it adds is
 *    the Necromancer or the Sovereign and the held list is otherwise untouched. A GM who gave a spell to
 *    another class keeps that list.
 *
 * **A pack built before the Sovereign's 07** carries no Vitae spell: nothing is stamped and the console
 * says why, rather than the chain throwing on every load (D-758). Every document touched is logged by
 * `walkWorld`; a second run writes nothing.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

export const SOVEREIGN = "Sovereign";

/** The classes this build added to a Restricted line, and the Necromancer 0.15.4 added before it. */
const ADDED = Object.freeze(["Necromancer", SOVEREIGN]);

/**
 * The update one held spell takes, or null.
 *
 * @param {object|null} raw   the held spell's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildSovereignSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  const update = {};
  // 1. The pool 07 prints: Vitae, where the pack copy prints it and the held copy does not.
  if (pack.costPool === "vitae" && raw.costPool !== "vitae") update["system.costPool"] = "vitae";
  // 2. The blood-curse tag, where the pack copy carries it.
  if (pack.bloodCurse === true && raw.bloodCurse !== true) update["system.bloodCurse"] = true;
  // 3. The Restricted line that gained the Sovereign (and the Necromancer, where 0.15.4 did not reach).
  const held = Array.isArray(raw.classes) ? raw.classes : null;
  const now = Array.isArray(pack.classes) ? pack.classes : null;
  if (held && now && now.includes(SOVEREIGN) && !held.includes(SOVEREIGN)) {
    const added = now.filter(c => !held.includes(c));
    const kept = held.every(c => now.includes(c));
    if (kept && added.length && added.every(c => ADDED.includes(c))) update["system.classes"] = [...now];
  }
  return Object.keys(update).length ? update : null;
}

/** Whether the spells pack carries the Sovereign's 07: its Bloodbolt prints Vitae. */
export function spellPackCarriesSovereign(table) {
  const bolt = table?.byIdentifier?.get?.("bloodbolt") ?? null;
  return Boolean(bolt) && bolt.costPool === "vitae";
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  if (!spellPackCarriesSovereign(spells)) {
    console.warn("azeroth-rpg | azeroth-rpg.spells predates the Sovereign's 07 (no spell prints Vitae), so no held spell was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.4.6 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      const update = buildSovereignSpellUpdate(raw, packCopy(spells, raw, doc.name));
      if (update) log(`azeroth-rpg | 0.15.4.6: ${doc.name} takes the Sovereign's 07 (${Object.keys(update).join(", ")})`);
      return update;
    }
  }, log);
}
