/**
 * Migration to 0.11.4 — a tier 5 Fel or Shadow spell names the track it
 * charges (07 §8, 2026-09-07).
 *
 * `castSpell` never read a spell's tier or school to touch Corruption at all,
 * so no tome ever marked anybody. The rule is built now and the track is a new
 * field on the spell, stamped by the parser; a spell already embedded on a
 * character carries the schema's initial instead, which is null — so without
 * this pass a warlock's own copy of *The Long Bargain* would go on costing
 * nothing.
 *
 * **NOT "where the key is absent."** A document loaded through the model never
 * has an absent key: the schema fills the initial, so `raw.corruption ===
 * undefined` is false on every spell in every world, and a migration written
 * that way stamps nothing at all. That is exactly how the 0.11.1 descriptors
 * were missed. This compares against the PACK COPY, which is the authority,
 * and moves the field only where the two differ.
 *
 * Idempotent: a second run finds nothing to move.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { CASTING_CORRUPTION_TIER } from "../rules/corruption.mjs";

/**
 * The update for one spell's raw system source, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildCastingCorruptionUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object") return null;
  const held = raw.corruption ?? null;

  // The pack is the authority where the world spell came from the book. The
  // Health a cast costs (07 §8) rides the same pass: sixteen spells name one
  // in their own effect and the field is new, so an embedded copy carries the
  // schema's null and Doom Bolt would go on being free.
  if (pack) {
    const update = {};
    const want = pack.corruption ?? null;
    if (want !== held) update["system.corruption"] = want;
    const wantHealth = pack.cost?.health ?? null;
    if (wantHealth !== (raw.cost?.health ?? null)) update["system.cost.health"] = wantHealth;
    return Object.keys(update).length ? update : null;
  }

  // A spell the pack does not hold — a GM's own — is left alone unless it is
  // a Fel one, where 07 §8 leaves no choice: a Fel spell's point is Fel. A
  // Shadow spell's track is the entry's to name and is never guessed here.
  //
  // Asked PLAINLY. Handing `castingCorruption` a forced `corruption: "fel"`
  // to see what it made of it answered "fel" for a Shadow spell too, because
  // that is a legal track and the function had no reason to refuse it.
  const isFel = String(raw.school ?? "").toLowerCase() === "fel";
  const charges = Math.trunc(Number(raw.tier) || 0) >= CASTING_CORRUPTION_TIER;
  if (!held && isFel && charges) return { "system.corruption": "fel" };
  return null;
}

export async function migrate(log = console.log) {
  const spells = await packSystems("azeroth-rpg.spells");
  return walkWorld({
    item: doc => (doc.type === "spell"
      ? buildCastingCorruptionUpdate(rawSystem(doc), packCopy(spells, rawSystem(doc), doc.name))
      : null)
  }, log);
}
