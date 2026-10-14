/**
 * Migration to 0.11.8 - the Classic conversion redone (D-690).
 *
 * Two repairs, both to items a world already holds. Neither is a schema
 * change: `system.school` is a new nullable field with an initial of null and
 * needs no migration at all (CLAUDE.md §10). These are the data faults the
 * same decision fixed.
 *
 * **1. The `**Classic.**` stat paragraph goes.** The lead read the shipped
 * items: *there are multiple items that mention their WoW stat lines in the
 * description. This is not relevant to this system.* The pack no longer writes
 * it, and a world copy taken before that keeps it forever - the compendium is
 * rebuilt, a dragged copy is not. Only that ONE paragraph is removed, so a
 * flavour paragraph beside it and anything the GM added themselves both
 * survive; a description with nothing else in it is left empty, which is what
 * the parser now writes.
 *
 * **2. The Consecrated tabard stops warding Shadow twice.** `gear.mjs` read
 * `2, Shadow` and stamped BOTH the fixed grant and `wardPoints: 2`, so an item
 * whose school is already chosen carried points waiting for a school as well.
 * Nothing read the points before D-690, which is why it never showed; now that
 * something does, picking a school on that tabard would grant `+2 Ward in
 * Shadow` twice. The points are nulled rather than deleted, because v14's
 * `-=key` deletion syntax is deprecated and the smoke test fails on the
 * warning (CLAUDE.md §15).
 *
 * Idempotent: a description with no marker and an item with no doubled family
 * both return null, so a second run writes nothing.
 */

import { rawSystem, walkWorld } from "./walk.mjs";
import { POINT_FAMILIES, parseGrant } from "../rules/grants.mjs";

/** The one paragraph the conversion used to compose, and nothing around it. */
export const CLASSIC_PARAGRAPH = /<p><strong>Classic\.<\/strong>[\s\S]*?<\/p>/g;

/**
 * The description with the stat paragraph taken out, or null where there is
 * none to take.
 *
 * @param {string} description  the stored HTML
 * @returns {string|null}
 */
export function strippedDescription(description) {
  const held = String(description ?? "");
  if (!CLASSIC_PARAGRAPH.test(held)) return null;
  CLASSIC_PARAGRAPH.lastIndex = 0;
  return held.replace(CLASSIC_PARAGRAPH, "").trim();
}

/**
 * The points an item carries that its own grants have already spelled out, by
 * flag key. A `Warded cloak` carrying `wardPoints: 1` and no grant is the
 * ordinary case and is left alone.
 *
 * @param {object} flags  the item's whole flags object
 * @returns {string[]} the flag keys to null
 */
export function doubledPoints(flags = {}) {
  const held = flags?.["azeroth-rpg"] ?? {};
  const written = new Set((held.grants ?? []).map(g => parseGrant(g)?.kind).filter(Boolean));
  return Object.entries(POINT_FAMILIES)
    .filter(([key, family]) => Number(held[key]) > 0 && written.has(family.toLowerCase()))
    .map(([key]) => key);
}

/**
 * The update for one item, or null.
 *
 * @param {object} raw    the stored system
 * @param {object} flags  the stored flags
 */
export function buildFoundItemUpdate(raw, flags = {}) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  // Only a find ever carried the paragraph, and the flag is what says so.
  if (flags?.["azeroth-rpg"]?.classic) {
    const description = strippedDescription(raw.description);
    if (description !== null) update["system.description"] = description;
  }
  for (const key of doubledPoints(flags)) update[`flags.azeroth-rpg.${key}`] = null;
  return Object.keys(update).length ? update : null;
}

export async function migrate(log = console.log) {
  return walkWorld({
    item: doc => {
      if (!["weapon", "armor", "gear"].includes(doc.type)) return null;
      return buildFoundItemUpdate(rawSystem(doc), doc.toObject?.().flags ?? doc.flags);
    }
  }, log);
}
