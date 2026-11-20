/**
 * Migration to 0.15.4 - the Necromancer release, on the spells a world already holds. Every
 * step reads the PACK COPY (D-665), writes only where the held copy still carries the old pack's
 * value, and is a no-op on its second pass.
 *
 * 1. **Graveblight is shared and printed in Mana** (the lead's pick, *Graveblight shared*: open to
 *    both, reprinted in Mana; the knight pays Runic Power). A held copy carries `costPool:
 *    "runicPower"`, so its card and its Spells-tab cost read Runic Power for a Necromancer who
 *    pays Mana. Only the pair `runicPower` held / `mana` in the pack is written (O-385 left the
 *    same question open for the Death Knight's moved spells).
 * 2. **Its Sustain sentence** (07 §5.7: *While sustaining this spell you pay 3 Mana at the start
 *    of each of your turns*). `rules/upkeep.mjs` reads a held spell's own words, so a held copy
 *    without the sentence would charge a Necromancer 05's 1 Mana. Written only where the held
 *    effect is the pack's effect less that sentence; a GM's own words are left alone. A Death
 *    Knight pays Runic Power and owes no upkeep either way (D-949).
 * 3. **The Restricted lines that gained the Necromancer** (Drain Life, Speak with the Dead,
 *    Curse of Weakness, Curse of Agony, Curse of Tongues, Graveblight, Contagion): a held copy's
 *    derived `classes` is written where it is exactly the pack's list less the Necromancer.
 *
 * **A PACK THAT PREDATES THE BOOK WARNS AND STAMPS NOTHING** (D-758's rule): a spells pack whose
 * Graveblight still prints Runic Power was built before the Necromancer's 07.
 *
 * No `system.json` bump here: the version is the release's (the Necromancer plan's Phase 7).
 * `runMigrations` runs this entry wherever the code is present (CLAUDE.md §15).
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The class the Restricted lines gained. */
export const NECROMANCER = "Necromancer";

/** HTML to flat text, for a comparison that ignores the parser's line wrapping. */
function flat(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 07 §5.7's Sustain cost sentence, as an entry prints it. */
const SUSTAIN_SENTENCE = /\s*While sustaining this spell you pay \d+ (?:Mana|Health)[^.]*\./;

/**
 * The update for one held spell's raw system, or null.
 *
 * @param {object} raw  the held spell's `_source.system`
 * @param {object|null} pack  the pack copy's system
 * @returns {Record<string, unknown>|null}
 */
export function buildNecromancerSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const update = {};
  // 1. The pool 07 prints moved from Runic Power to Mana.
  if (raw.costPool === "runicPower" && (pack.costPool ?? "mana") === "mana") update["system.costPool"] = "mana";
  // 2. The Sustain sentence the entry gained, where the held words are the old ones.
  const packEffect = String(pack.effect ?? "");
  if (SUSTAIN_SENTENCE.test(flat(packEffect)) && !SUSTAIN_SENTENCE.test(flat(raw.effect))
    && flat(raw.effect) === flat(packEffect).replace(SUSTAIN_SENTENCE, "").trim()) {
    update["system.effect"] = packEffect;
  }
  // 3. The Restricted line that gained the Necromancer, where the held list is the old one.
  const held = Array.isArray(raw.classes) ? raw.classes : null;
  const now = Array.isArray(pack.classes) ? pack.classes : null;
  if (held && now && now.includes(NECROMANCER) && !held.includes(NECROMANCER)) {
    const old = now.filter(c => c !== NECROMANCER);
    if (old.length === held.length && old.every(c => held.includes(c))) update["system.classes"] = [...now];
  }
  return Object.keys(update).length ? update : null;
}

/** Whether the spells pack carries the Necromancer's 07: its Graveblight prints Mana. */
export function spellPackCarriesNecromancer(table) {
  const graveblight = table?.byIdentifier?.get?.("graveblight") ?? null;
  return Boolean(graveblight) && (graveblight.costPool ?? "mana") === "mana";
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  if (!spellPackCarriesNecromancer(spells)) {
    console.warn("azeroth-rpg | azeroth-rpg.spells predates the Necromancer's 07 (Graveblight still prints Runic Power), so no held spell was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.15.4 and reload.");
    return 0;
  }
  return walkWorld({
    item: doc => (doc.type === "spell" ? buildNecromancerSpellUpdate(rawSystem(doc), packCopy(spells, rawSystem(doc), doc.name)) : null)
  }, log);
}
