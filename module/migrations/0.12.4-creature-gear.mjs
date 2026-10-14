/**
 * Migration to 0.12.4 — what a creature is carrying (the lead's N1 to N3).
 *
 * **`NpcData.coin` NEEDS NO PASS, AND THIS SAYS SO RATHER THAN LEAVING IT
 * UNSAID.** CLAUDE.md §10 asks a migration of every schema change; the field
 * added here is `NumberField({required, integer, initial: 0, min: 0})` and a
 * document loaded through the model already carries that initial. So the usual
 * stamp-where-absent pass is not merely unnecessary, it is UNREACHABLE —
 * `_source` is the model's cleaned copy, so `raw.coin !== undefined` is true on
 * every creature that existed before the field did, which is [D-665] exactly.
 * There is no `choices` to refuse a stored value, no `TypedObjectField` whose
 * `validateKey` could drop one in silence, and no old shape to reshape: the
 * absence of the key is answered by the schema and by nothing else.
 *
 * **WHAT DOES NEED A PASS IS `system.container` ON A CREATURE'S ITEMS**, and it
 * is created by the same feature. Nothing on a creature read that field until
 * `NpcData` learned to weigh what it holds: `carriedTotal` counts a thing
 * inside a container the actor also holds as **free** (08 §11 — a full backpack
 * is priced at 40 lb and its contents cost nothing more). Core's drop copies
 * the field across whole and KEEPS THE IDS, so a GM who dragged a character's
 * backpack and its contents onto a creature — which core has embedded silently
 * for as long as both have existed — has a creature whose carry line quietly
 * omits every pound in the pack, with no container section anywhere on its
 * Gear tab to show where the weight went.
 *
 * The creature's tab has no containers at all (the lead's N3), so the field is
 * only ever an artefact of a copy there. `AzerothNpcSheet#_onDropItem` clears
 * it on arrival from today; this clears what is already in the world. Idempotent
 * — a second run finds nothing to clear — and scoped to items whose PARENT is a
 * creature, so nothing a character holds is touched.
 */

import { rawSystem, walkWorld } from "./walk.mjs";

/** The three subtypes that carry `system.container` at all. */
const PHYSICAL = new Set(["weapon", "armor", "gear"]);

/**
 * The update for one item held by a creature, or null.
 *
 * Compared against the VALUE rather than against `undefined`: the key is never
 * absent on a document loaded through the model (D-665), and `null` is what the
 * schema's initial gives every item that is not in anything.
 *
 * @param {string} type          the item's subtype
 * @param {object} raw           the stored system
 * @returns {object|null}
 */
export function buildLooseUpdate(type, raw) {
  if (!PHYSICAL.has(type) || !raw || typeof raw !== "object") return null;
  return raw.container ? { "system.container": null } : null;
}

export async function migrate(log = console.log) {
  return walkWorld({
    item: doc => (doc.parent?.type === "npc" ? buildLooseUpdate(doc.type, rawSystem(doc)) : null)
  }, log);
}
