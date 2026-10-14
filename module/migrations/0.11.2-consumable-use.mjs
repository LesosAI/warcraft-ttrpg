/**
 * Migration to 0.11.2 - what a consumable's Use does (D-668).
 *
 * `GearData.use` is new, so a world's gear carries the schema's initial -
 * `kind: "none"`, no Use button - and a healing draught bought last week
 * would sit inert beside one out of the pack. The pack copy is the
 * authority (the parser seeds it off the chapter's own words); a piece of
 * gear the pack does not hold is seeded off its own description, so a GM's
 * hand-made draught works too.
 *
 * Idempotent: a document whose descriptor already matches is left alone.
 * The comparison is structural rather than against `undefined`, because a
 * document loaded through the model NEVER has an absent field - that was
 * D-667's fault and it is not repeated here.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { seedUse } from "../rules/consumables.mjs";
import { AZEROTH } from "../config.mjs";

/** Structural equality over the small plain objects a descriptor is. */
export function sameUse(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => sameUse(a[k], b[k]));
}

/** The vocabularies the seed reads a condition and a school against. */
const known = () => ({
  conditions: Object.keys(AZEROTH.conditions ?? {}),
  schools: Object.keys(AZEROTH.schools ?? {})
});

/**
 * The update for one gear item's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {object} [o]          `name`, for a seed off the item's own words
 */
export function buildUseUpdate(raw, pack = null, { name = "" } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const wanted = pack?.use ?? seedUse({
    name: name || "",
    section: raw.source?.section ?? "",
    description: raw.description ?? ""
  }, known());
  if (sameUse(raw.use ?? null, wanted)) return null;
  return { "system.use": JSON.parse(JSON.stringify(wanted)) };
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  return walkWorld({
    item: doc => {
      if (doc.type !== "gear") return null;
      const raw = rawSystem(doc);
      return buildUseUpdate(raw, packCopy(gear, raw, doc.name), { name: doc.name });
    }
  }, log);
}
