/**
 * Migration to 0.16.0.1 - the spell audit on the spells a world already holds (D-1700 to D-1705;
 * the system half, D-1710 to D-1715).
 *
 * A point step inside the same unreleased 0.16.0 as the Demon Hunter's own migration, numbered
 * past it as 0.15.3.1 and 0.15.4.6 were numbered past theirs, so `system.json` stays at the
 * release it is part of and no migration stands past the manifest.
 *
 * `AzerothActor#spellFromPack` embeds a spell only where the actor holds none, so a copy taken
 * before the audit keeps its old Mana, action, damage, duration, words and descriptors for good.
 * Every spell in the world - world items, every actor's embedded spells (characters and
 * creatures, linked or on an unlinked token) and unlocked world packs - is read against its PACK
 * COPY, never against `undefined` (D-665), for the 77 spells the audit moved (`OLD_WORDS`):
 *
 * 1. **The book's numbers and words** (`RESTAMP_KEYS`): the Mana and its pool, the action, the
 *    range, target, duration, damage, the effect and every descriptor the parser reads off it
 *    (`applies`, `rider`, `onFail`, `areaTick`, `areaGround`, `tick`, `splash`, `cost`, `test`,
 *    `heal`, `prerequisite`, `corruption`), each written only where it differs.
 * 2. **Never the tier** (D-996's rule for a moved spell): a held Fade stays tier 1, a held
 *    Icelock tier 4 and so keeps 07 §4's once-a-Short-Rest gate, a held Rebuke, Firebrand or
 *    Barkskin tier 3. **Never the CLASSES line**: the 44 Restricted lines govern learning alone
 *    (D-1700), and a copy held is kept.
 * 3. **Never a GM's own words**: a held copy is restamped only while its effect is the old book's
 *    (`OLD_WORDS`) or already the new book's, as the model migrations read it (0.15.3, 0.12.22).
 * 4. **A Starweave held as a Sustain is released** (D-1705): it is an Instant of 1 minute now, so
 *    the caster's Sustain record for it goes in the same pass, and the active GM's sweep then takes
 *    its Region off as for any Sustain that has ended (`canvas/sustained-areas.mjs`). A caster whose
 *    Starweave is a GM's own rewrite keeps the record.
 *
 * **A pack built before the audit warns and stamps nothing** (D-758's rule): its Starweave is still
 * Sustained, so a pass over it would write the old words back and mark the world past this version.
 * Every document touched is logged by `walkWorld`; a second run writes nothing.
 */

import { packCopy, packSystems, rawSystem, sameStored, walkWorld } from "./walk.mjs";
import { OLD_WORDS } from "./0.16.0.1-spell-audit-words.mjs";

export { OLD_WORDS };

/** The keys a held copy takes from its pack copy, in the model's order. Never `tier`, `classes` or `prepared`. */
export const RESTAMP_KEYS = Object.freeze([
  "effect", "mana", "costPool", "action", "range", "target", "duration", "damage", "applies", "rider", "onFail",
  "areaTick", "areaGround", "tick", "splash", "cost", "test", "heal", "prerequisite", "corruption"
]);

/** The keys this migration never writes, whatever the pack says. */
export const KEPT_KEYS = Object.freeze(["tier", "classes", "prepared", "identifier", "school", "description", "source"]);

// Key order ignored and a null key read as absent (`walk.mjs#sameStored`): the stored `areaTick.damage`
// carries `drain` and `castRating` as null where the pack copy leaves them out, so a plain string
// comparison restamped every audited held spell again on a second run.
const same = sameStored;
const clone = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * **WORDS, AS A COMPARISON READS THEM**: a content link read as its label, the tags and every
 * space taken out and the case folded, so the parser's spacing and a resolved `@UUID` never make
 * the old book's words look like a GM's.
 *
 * @param {string} value  an effect, HTML or plain
 * @returns {string}
 */
export function wordsOf(value) {
  return String(value ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, "").toLowerCase();
}

/**
 * Whether a held copy is still the book's - the old words or the new - and so may be restamped.
 *
 * @param {object} raw   the held system
 * @param {object} pack  the pack copy's system
 */
export function heldIsBooks(raw, pack) {
  const id = pack?.identifier;
  if (!id || !(id in OLD_WORDS) || raw?.identifier !== id) return false;
  const held = wordsOf(raw.effect);
  return held === wordsOf(OLD_WORDS[id]) || held === wordsOf(pack.effect);
}

/**
 * The update one held spell takes, or null: every `RESTAMP_KEYS` key that differs from the pack
 * copy, for an audited spell whose words are still the book's.
 *
 * @param {object|null} raw   the held spell's stored `system`
 * @param {object|null} pack  its pack copy's `system`
 * @returns {object|null}
 */
export function buildAuditSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object") return null;
  if (!heldIsBooks(raw, pack)) return null;
  const update = {};
  for (const key of RESTAMP_KEYS) {
    if (!(key in pack)) continue;
    if (!same(raw[key], pack[key])) update[`system.${key}`] = clone(pack[key]);
  }
  return Object.keys(update).length ? update : null;
}

/**
 * **A STARWEAVE SUSTAIN RELEASED** (D-1705): the caster's `sustaining` list without its Starweave
 * entries, or null where it holds none - or where the Starweave it holds is a GM's own rewrite,
 * which keeps its Sustain.
 *
 * @param {Array<object>|null} sustaining  the actor's stored list
 * @param {object|null} heldStarweave      the actor's held Starweave's stored system, or null
 * @param {object|null} pack               the pack's Starweave system
 * @returns {object|null}  the actor update
 */
export function buildStarweaveRelease(sustaining, heldStarweave = null, pack = null) {
  if (!Array.isArray(sustaining) || !sustaining.some(e => e?.identifier === "starweave")) return null;
  if (heldStarweave && pack && !heldIsBooks(heldStarweave, pack)) return null;
  return { "flags.azeroth-rpg.sustaining": sustaining.filter(e => e?.identifier !== "starweave") };
}

/**
 * **WHETHER THE SPELLS PACK CARRIES THE AUDIT**: its Starweave is no longer Sustained and costs 9.
 *
 * @param {{byIdentifier?: Map<string, object>}|null} table  `walk.mjs#packSystems`
 */
export function spellPackCarriesAudit(table) {
  const weave = table?.byIdentifier?.get?.("starweave") ?? null;
  return Boolean(weave) && weave.duration?.kind !== "sustained" && weave.mana === 9;
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  if (!spellPackCarriesAudit(spells)) {
    console.warn("azeroth-rpg | azeroth-rpg.spells predates the spell audit (its Starweave is still Sustained), so no held spell was restamped. "
      + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back below 0.16.0.1 and reload.");
    return 0;
  }
  const weavePack = spells.byIdentifier.get("starweave") ?? null;
  return walkWorld({
    actor: doc => {
      const sustaining = doc._source?.flags?.["azeroth-rpg"]?.sustaining ?? doc.getFlag?.("azeroth-rpg", "sustaining") ?? null;
      const held = doc.items?.find?.(i => i.type === "spell" && rawSystem(i)?.identifier === "starweave") ?? null;
      const update = buildStarweaveRelease(sustaining, held ? rawSystem(held) : null, weavePack);
      if (update) log(`azeroth-rpg | 0.16.0.1: ${doc.name} no longer sustains Starweave, an Instant of 1 minute now`);
      return update;
    },
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      if (!(raw?.identifier in OLD_WORDS)) return null;
      const update = buildAuditSpellUpdate(raw, packCopy(spells, raw, doc.name));
      if (update) log(`azeroth-rpg | 0.16.0.1: ${doc.name} takes the spell audit's 07 (${Object.keys(update).join(", ")})`);
      return update;
    }
  }, log);
}
