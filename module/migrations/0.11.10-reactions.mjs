/**
 * Migration to 0.11.10 — 06 §6's Reactions (D-693).
 *
 * One field moved on a stored document, and it is a VALUE rather than a
 * shape: `system.signatureEffect.blockBonus` is a new nullable number with an
 * initial of null, so every item ever stored already has it — what changed is
 * that **Drillborer Disk's Signature stopped being `none`**. Its *Block
 * reduces damage by a further 2* was recorded `noEquivalent` because 06 §6's
 * Block did not exist in `module/` at all; the Reaction is built now, so the
 * pack copy carries `kind: "standing"` and `blockBonus: 2` and a world copy
 * taken before this keeps a descriptor that does nothing forever. The
 * compendium is rebuilt by `packs:parse`; a dragged copy is not.
 *
 * **Compared against the PACK COPY, never against `undefined`** (D-665).
 * `blockBonus` has an initial, and `_source` is the model's cleaned copy, so
 * `raw.signatureEffect.blockBonus === undefined` is false on every item ever
 * stored; the pack's own descriptor for the same identifier is the reference.
 *
 * **A GM's own descriptor is never overwritten.** Only an item whose stored
 * Signature says nothing at all — `kind: "none"` with no gate-independent
 * payload — takes the pack's `blockBonus` and its kind. An item a GM has
 * forged or hand-edited keeps every number it holds.
 *
 * **What deliberately has NO migration here:**
 *
 * - `FeatureData.lays`, which is how Pummel finally lays its two Banes. A
 *   feature item is stamped by `AzerothActor#syncClassFeatures`, and the
 *   `ready` hook restamps every character's features against the table at
 *   world load (D-621) — so a held Pummel takes its new descriptor with no
 *   migration to write, which is the whole reason that pass exists.
 * - `system.laidBanes`, `system.testBanes`, `system.testBoons` and
 *   `system.skillBanes` on a character. All four are DERIVED in
 *   `prepareDerivedData` and nothing is stored (CLAUDE.md §4).
 *
 * Idempotent: a second run finds the descriptor already standing and returns
 * null.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { cleanSignature } from "../rules/signatures.mjs";

/** The packs a Signature can live in — a weapon, a suit and a worn thing alike. */
const PACKS = Object.freeze([
  ["weapon", "azeroth-rpg.weapons"],
  ["armor", "azeroth-rpg.armor"],
  ["gear", "azeroth-rpg.gear"]
]);

/**
 * Whether a stored descriptor says nothing at all, and so may take the pack's.
 *
 * A `none` row with a gate is still nothing — the gate reads and the effect
 * does not, which is exactly what Drillborer Disk was — so the gate is not
 * consulted here.
 */
export function saysNothing(descriptor) {
  if (!descriptor || typeof descriptor !== "object") return true;
  return (descriptor.kind ?? "none") === "none";
}

/**
 * The update for one item, or null.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 */
export function buildReactionUpdate(raw, pack) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const want = pack.signatureEffect ?? null;
  // Only where the pack now says a Block takes more off. Nothing else in 08
  // §20 modifies a Reaction, and a blanket restamp would overwrite a GM's own.
  if (!want || !(want.blockBonus > 0)) return null;
  const held = raw.signatureEffect ?? null;
  if ((held?.blockBonus ?? null) === want.blockBonus) return null;
  if (!saysNothing(held)) return null;
  return { "system.signatureEffect": cleanSignature(want) };
}

export async function migrate(log = console.log) {
  const tables = new Map();
  for (const [type, packId] of PACKS) tables.set(type, await packSystems(packId));
  if (![...tables.values()].some(t => t.byIdentifier.size)) {
    log("azeroth-rpg | 0.11.10: the equipment packs are unavailable; no Signature was restamped");
    return 0;
  }
  const forItem = doc => {
    const table = tables.get(doc.type) ?? null;
    if (!table) return null;
    const raw = rawSystem(doc);
    return buildReactionUpdate(raw, packCopy(table, raw, doc.name));
  };
  return walkWorld({ item: forItem }, log);
}
