/**
 * Migration to 0.12.22 - two spells' laid effects, read off 07 again (D-774).
 *
 * The lay door (`rules/spell-effects.mjs#seedApplies`) read *Damage the target
 * takes is reduced by 3 for the duration* as nothing, and Pain Suppression's
 * *the target may ignore one **Bleeding** effect* as Bleeding LAID on the
 * creature it was cast to protect. Found beside 04's Pain Suppression (*Each
 * rank adds 1 to the damage it prevents*), whose rank had nothing to add to:
 *
 * - **Pain Suppression** lays `system.damageReduction` 3, and no Bleeding;
 * - **Barkskin** (07's Druid spell, the same sentence) lays its 3 beside its
 *   Speed.
 *
 * The packs are regenerated, so a copy dragged out afresh is right already. This
 * is 0.12.21's own repair pass run again (`buildSpellUpdate`): **compared
 * against the pack copy, never against `undefined`** (D-665), and only while the
 * spell's words are the book's - a GM who rewrote an entry keeps what they wrote.
 * Idempotent by construction. What a world has already LAID is not touched: an
 * effect laid before this version keeps what it carries, and the next cast lays
 * the new one.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { buildSpellUpdate } from "./0.12.21-spell-ticks.mjs";

/** The two spells whose `applies` this version moves, for the log and the test. */
export const MOVED = Object.freeze(["Barkskin", "Pain Suppression"]);

export { buildSpellUpdate };

export async function migrate(log = console.log) {
  const table = await packSystems("azeroth-rpg.spells");
  return walkWorld({
    item: doc => {
      if (doc.type !== "spell") return null;
      const raw = rawSystem(doc);
      return buildSpellUpdate(raw, packCopy(table, raw, doc.name));
    }
  }, log);
}
