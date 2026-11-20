/**
 * **WHAT THE DEFT MIGRATION DECIDES** (the San'layn and Sovereign plan, DF4; the lead, R15:
 * *"new weapon trait - Deft.  Part of this build needs to apply this to the relevant items
 * across the entire system"*; D-1169). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The weapons pack gained 08 §5's Deft on the 08 §7 rows the book names, and every Classic
 * find on those bases inherited it (D-685's conversion reads the base's traits). A weapon a
 * world already holds - a world item, a character's dagger, a creature's held blade, an
 * unlocked world pack's copy - carries the old trait list, and a rule enforced only on what
 * is dragged out fresh never reaches it (CLAUDE.md §15).
 *
 * **THE GUARD IS THE PACK COPY, NEVER `undefined`** (D-665): a held weapon is restamped only
 * where its pack copy, found by identifier then by name, carries Deft and the held copy does
 * not. The trait goes in at the pack copy's own place in the list, so the held list reads as
 * the pack's does; nothing else in the list moves. A second pass finds Deft present and
 * writes nothing. A weapon with no pack copy, or whose copy carries no Deft, is left alone -
 * a longsword is never touched.
 */

/** Whether a trait name is Deft. */
export function isDeftTrait(name) {
  return /^deft$/i.test(String(name ?? "").trim());
}

/**
 * Whether the pack the migration reads already carries Deft anywhere. A stale pack (built
 * before the book named the trait) carries none, and the migration then warns and stamps
 * nothing rather than throwing on every load (D-758).
 *
 * @param {Iterable<{traits?: string[]}>} systems  the pack's systems
 */
export function packCarriesDeft(systems = []) {
  for (const sys of systems ?? []) if ((sys?.traits ?? []).some(isDeftTrait)) return true;
  return false;
}

/**
 * The update for one held weapon's stored system, or null.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @returns {{"system.traits": string[]}|null}
 */
export function buildDeftUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const packTraits = Array.isArray(pack.traits) ? pack.traits.map(String) : [];
  const at = packTraits.findIndex(isDeftTrait);
  if (at < 0) return null;
  const held = Array.isArray(raw.traits) ? raw.traits.map(String) : [];
  if (held.some(isDeftTrait)) return null;
  const word = packTraits[at];
  // The pack's own place: after the trait that stands before it in the pack, where the held
  // list has it, else at the same index, never past the end.
  const before = at > 0 ? packTraits[at - 1] : null;
  const after = before !== null ? held.indexOf(before) : -1;
  const index = after >= 0 ? after + 1 : Math.min(at, held.length);
  const traits = [...held.slice(0, index), word, ...held.slice(index)];
  return { "system.traits": traits };
}
