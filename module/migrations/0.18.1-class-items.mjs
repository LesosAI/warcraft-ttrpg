/**
 * Migration to 0.18.1 - the new classes' named items and the Enchanter's Signatures
 * (CLASS-ITEMS-AND-ENCHANTS-2026-11; D-2145 to D-2170).
 *
 * Every document is read against its PACK COPY, never against `undefined` (D-665):
 *
 * 1. **A held named Augment takes its pack copy's Augment flag** (08 §20: *at the bonus section 9 sets
 *    for your tier*; D-2152). The Grimoire of the Fourth Signatory, the Codex of the Five Pylons and the
 *    Idol of the Dreamer were worn things before this release; the parser now stamps
 *    `flags.azeroth-rpg.augment {className, category, bonus: "tier"}` on them, which
 *    `rules/augments.mjs#flaggedAugment` reads. A copy a world already holds carries no flag and so is
 *    no Augment at all until it is stamped. Only a copy that came from the pack - the same identifier
 *    AND the same 08 section - is read, and only where it carries no Augment flag of its own, so a GM's
 *    own flag is left alone.
 * 2. **The rules chapters the world already imported** are brought up to the book whose 08 §18 and §20
 *    print the Enchanter's Signatures and the twelve items (`repairRulesJournals`, idempotent: a held
 *    page the book changed gets the book's page beside it, never over it).
 *
 * Nothing else this release adds needs a write: the new `signatureEffect` keys are filled by the
 * schema's `initial` and `signatures.mjs#cleanSignature` on read; `flags.azeroth-rpg.enchanterSignature`
 * and a card's `lifesteal` record are written only by the doors that make them; the twelve items are
 * new pack documents no world holds.
 *
 * **A PACK BUILT BEFORE THIS RELEASE DEFERS AND STAMPS NOTHING** (D-758's rule; 0.17.0's shape): step 1
 * needs a gear pack whose Grimoire of the Fourth Signatory carries the flag; without one it answers
 * `{deferred: true, reason}`, writes nothing and does not throw, and `runMigrations` leaves the world
 * setting below 0.18.1 so the step runs again once the pack is rebuilt. Every document touched is logged
 * by `walkWorld`; a second run writes nothing.
 */

import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The named Augment whose pack copy says the gear pack is this release's (08 §20). */
export const READY_MARKER = "grimoire-of-the-fourth-signatory";

/** Whether a held item is the pack's own copy: the same identifier and the same 08 section. */
function fromPack(raw, pack) {
  return Boolean(raw?.identifier && pack?.identifier === raw.identifier
    && String(raw?.source?.section ?? "") === String(pack?.source?.section ?? ""));
}

/**
 * The update one held gear item takes, or null (step 1).
 *
 * @param {object|null} raw         the held item's stored `system`
 * @param {object|null} pack        its pack copy's `system`
 * @param {object|null} heldFlags   the held item's `flags.azeroth-rpg`
 * @param {object|null} packFlags   the pack copy's `flags.azeroth-rpg`
 * @returns {object|null}
 */
export function buildClassItemsGearUpdate(raw, pack = null, heldFlags = null, packFlags = null) {
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !fromPack(raw, pack)) return null;
  const flag = packFlags?.augment ?? null;
  if (!flag || typeof flag !== "object" || heldFlags?.augment) return null;
  return { "flags.azeroth-rpg.augment": structuredClone(flag) };
}

/** Whether the gear pack carries this release's 08 §20: its Grimoire names its Augment. */
export function gearPackCarriesClassItems(table) {
  return Boolean(table?.flagsByIdentifier?.get?.(READY_MARKER)?.augment);
}

/**
 * What a stale gear pack answers (`index.mjs#migrationOutcome`): deferred, with the reason in words, so
 * the world setting is not advanced and nothing is written.
 *
 * @param {(key: string) => string} [localize]
 * @returns {{deferred: true, reason: string}}
 */
export function classItemsDeferred(localize = key => game.i18n.localize(key)) {
  return { deferred: true, reason: localize("AZEROTH.Migration.ClassItemsPackStale") };
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  // **DEFERRED, NOT DONE** (the final review of 0.18.1): answered as 0.17.0 answers a stale pack, so
  // `runMigrations` leaves the world setting where it is and this step runs again once the pack is rebuilt.
  if (!gearPackCarriesClassItems(gear)) return classItemsDeferred();
  let touched = await walkWorld({
    item: doc => {
      if (doc.type !== "gear") return null;
      const raw = rawSystem(doc);
      const pack = gear.byIdentifier.get(raw?.identifier) ?? null;
      const update = buildClassItemsGearUpdate(raw, pack, doc.flags?.["azeroth-rpg"] ?? null, gear.flagsByIdentifier?.get(raw?.identifier) ?? null);
      if (update) log(`azeroth-rpg | 0.18.1: ${doc.name} is an Augment at the tier's bonus`);
      return update;
    }
  }, log);
  const { repairRulesJournals } = await import("../applications/rules-journals.mjs");
  const journals = await repairRulesJournals(log);
  touched += journals?.pages ?? 0;
  return touched;
}
