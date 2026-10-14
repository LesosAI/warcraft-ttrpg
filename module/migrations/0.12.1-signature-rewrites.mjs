/**
 * Migration to 0.12.1 — the last six §20 Signatures, on what a world already
 * holds (08 §20; D-696).
 *
 * Six of the chapter's twenty-six fired nothing, each for a recorded reason,
 * and five of the six were not gaps in the descriptor at all: the SENTENCE
 * turned on something no tool could judge — *a creature already taking Fire
 * damage over time*, *a creature standing in fire*, *while you hold both this
 * and its pair*, a book that refuses to open, a rule about what Shapeshift does
 * not take away. The lead rewrote all six, so **both halves of the entry moved
 * at once**: the prose the sheet draws and the descriptor that fires.
 *
 * The packs are regenerated, so a copy dragged out afresh is right. This is the
 * repair pass over what is already in a world, which is the half a rule
 * enforced only on create never gets (CLAUDE.md §15, and 0.12.0's own note).
 *
 * **THE GUARD IS THE OLD SENTENCE AND AN INERT DESCRIPTOR, TOGETHER.** All six
 * were `kind: "none"` before this version — that is what the census counted —
 * so an item still carrying the old words AND still firing nothing is the old
 * pack copy and nothing else. A GM who rewrote either half keeps both, and the
 * pass is idempotent by construction: after it runs neither test holds.
 *
 * **The old sentences are recorded here rather than derived.** They are gone
 * from the chapter, so there is nowhere else to read them from, and a migration
 * is the one place in this repository where a historical string belongs.
 */

import { signatureEffectOf, signatureProse } from "../rules/signatures.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** Which pack answers for a type. */
const PACK_FOR = Object.freeze({
  weapon: "azeroth-rpg.weapons",
  armor: "azeroth-rpg.armor",
  gear: "azeroth-rpg.gear"
});

/**
 * What each of the six said BEFORE the rewrite, by `system.identifier`. Read as
 * a reader would — tags stripped, runs of space collapsed, case ignored — so a
 * copy stored as plain text matches one stored as the pack's HTML.
 */
export const OLD_SIGNATURES = Object.freeze({
  "perditions-blade":
    "Against a creature already taking Fire damage over time, add 2 to this weapon's Damage Rating.",
  "dalrends-sacred-charge":
    "While you hold both this and its pair, gain 1 additional Momentum the first time you hit each round.",
  "sulfuron-hammer":
    "Against a creature standing in fire, or one you set alight this turn, add 2 to its Damage Rating.",
  "grimoire-of-the-fourth-signatory":
    "A warlock with Fel Corruption 1 or more may read it; one with none cannot open it at all. "
    + "The third signatory made that joke and wrote it down.",
  "the-bulwark-of-tyrs-hand":
    "While you are below half Health, allies within 15 feet take 2 less damage from every source.",
  "stormrage-raiment":
    "A Druid wearing it keeps its Armor Points and its Signature in any form they take."
});

/** A sentence as a reader takes it: no markup, one space, no case. */
export function flat(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The update for one document's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildRewriteUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object" || !pack) return null;
  const old = OLD_SIGNATURES[raw.identifier];
  if (!old) return null;
  // Still the words that were replaced?
  if (flat(signatureProse(raw)) !== flat(old)) return null;
  // And still firing nothing? All six were `kind: "none"`, so anything else is
  // a descriptor somebody wrote by hand and it is theirs.
  const held = signatureEffectOf(raw);
  if (held && held.kind !== "none") return null;
  // The pack is the authority for both halves, and they move together: a
  // descriptor without its sentence would leave the sheet arguing with the die.
  const update = { "system.signature": pack.signature ?? "" };
  if (pack.signatureEffect) update["system.signatureEffect"] = clone(pack.signatureEffect);
  return update;
}

export async function migrate(log = console.log) {
  const packs = {};
  for (const [type, id] of Object.entries(PACK_FOR)) packs[type] = await packSystems(id);

  return walkWorld({
    item: doc => {
      const table = packs[doc.type] ?? null;
      if (!table) return null;
      const raw = rawSystem(doc);
      return buildRewriteUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
