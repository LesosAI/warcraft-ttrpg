/**
 * Migration to 0.12.23 - 05's temporary Health (D-777; the lead, 2026-10-03:
 * *"raise HP past max as temp hp"*).
 *
 * Both actor models gain `system.health.temp`, a whole number from 0, which the
 * one damage door takes a blow off first. **Every actor a world holds reads 0**:
 * the field initialises there, and nothing granted temporary Health before this
 * version, so there is no grant to carry across - a migration that stamped the
 * field "where absent" would never fire (D-665: `_source` is the cleaned copy).
 *
 * What this version owes a world is the SOURCE GUARD. A `health.temp` a macro,
 * an import or a hand-edited document wrote as a negative, a fraction or a word
 * would refuse the whole actor at load - a refused document is invisible to a
 * migration (CLAUDE.md §15) - so `migrateSource` cleans it where it is PRESENT
 * and nowhere else (`rules/temporary-health.mjs#cleanTempSource`):
 * `CharacterData.migrateData` runs it through the chain, and `NpcData.migrateData`
 * calls the same guard. The world walk then clears a grant's record that stands
 * over no temporary Health - a span that ended with the number already spent -
 * which is idempotent by construction and finds nothing on a world this version
 * is the first to see.
 */

import { TEMP_FLAG, cleanTempSource, wholeTemp } from "../rules/temporary-health.mjs";
import { rawSystem, walkWorld } from "./walk.mjs";

/** The source reshape `CharacterData.migrateData` runs with the chain. */
export function migrateSource(source) {
  return cleanTempSource(source);
}

/**
 * What an actor needs, or null: a stored number that is not a whole number from
 * 0 written as one, and a grant's record standing over no temporary Health
 * cleared.
 *
 * @param {object} raw     the actor's stored `system`
 * @param {object} flags   the actor's stored `flags["azeroth-rpg"]`
 * @returns {{temp?: number, clearRecord?: boolean}|null}
 */
export function buildActorRepair(raw = {}, flags = {}) {
  const out = {};
  const stored = raw?.health?.temp;
  if (stored !== undefined && stored !== null && stored !== wholeTemp(stored)) out.temp = wholeTemp(stored);
  const left = out.temp ?? wholeTemp(stored);
  if (flags?.[TEMP_FLAG] !== undefined && flags?.[TEMP_FLAG] !== null && left === 0) out.clearRecord = true;
  return Object.keys(out).length ? out : null;
}

export async function migrate(log = console.log) {
  return walkWorld({
    actor: doc => {
      const repair = buildActorRepair(rawSystem(doc), doc._source?.flags?.["azeroth-rpg"] ?? {});
      if (!repair) return null;
      const update = {};
      if (repair.temp !== undefined) update["system.health.temp"] = repair.temp;
      // `-=key` is deprecated in v14 and the smoke run fails on the warning
      // (CLAUDE.md §15): the record is cleared with core's own operator.
      if (repair.clearRecord) update[`flags.azeroth-rpg.${TEMP_FLAG}`] = foundry.data.operators.ForcedDeletion.create();
      return update;
    }
  }, log);
}
