/**
 * WHAT AN ACTOR IS CARRYING, for whichever Gear tab is drawing it.
 *
 * Lifted verbatim out of `character-sheet.mjs` when the creature got a Gear tab
 * of its own (the lead's N3, 2026-09-10). Every line of `#carried()` was already
 * **fully actor-generic** — it reads `actor.items` and the item's own system
 * fields and touches nothing a character has that a creature has not — so
 * copying it would have made a second place for 08 §11's slot chip, 08 §12's
 * Use and 08 §13's coating to rot. Two sheets, one reader.
 *
 * **WHAT IS DELIBERATELY NOT HERE: containers.** The character's tab groups by
 * `system.container` and draws a section per bag (D-671, D-673); the creature's
 * does not, because the lead ruled the containers out (N3) and the paper doll
 * with them. `carriedGroups` is the loose-list regroup alone and the container
 * sections stay on the character sheet, where the only thing that reads them is.
 */

import { AZEROTH } from "../config.mjs";
import { detailFields, detailProse } from "./actions.mjs";
import { hasUse } from "../rules/consumables.mjs";
import { hasCharges } from "../rules/containers.mjs";
import { isWornSlot } from "../rules/worn.mjs";
import { rarityClass } from "../helpers/rarity.mjs";

/**
 * The three subtypes that are things rather than progression. Private: an
 * export with no importer is this repository's commonest real fault (D-681),
 * and both readers of it are in this file.
 */
const PHYSICAL = Object.freeze(["weapon", "armor", "gear"]);

/**
 * Every physical thing the actor holds, as the Gear tab's rows.
 *
 * Sorted by kind and then by name: an embedded collection's order is not stable
 * across a re-sync and a list a person reads must not wobble (CLAUDE.md §15).
 *
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function carriedRows(actor) {
  const kinds = new Set(PHYSICAL);
  return [...(actor?.items ?? [])]
    .filter(i => kinds.has(i.type))
    .map(item => ({
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      weight: item.system.weight ?? null,
      // A weapon or a suit can be worn, and an Augment is HELD - 07 §3's
      // caster *casts through* the one in hand, so it takes the off hand
      // and its row says so rather than saying Equip (D-674). A worn thing
      // with one of 08 §11's slots is equippable too (D-686); until then
      // a ring could be equipped only from the item sheet's checkbox.
      equippable: item.type === "weapon" || item.type === "armor" || !!item.system.augment || isWornSlot(item.system.slot),
      equipped: item.system.equipped === true,
      // 08 §11's slot, as a chip beside the name.
      slot: isWornSlot(item.system.slot) ? game.i18n.localize(AZEROTH.wornSlots[item.system.slot]) : null,
      augment: item.system.augment ? { ...item.system.augment } : null,
      rarityClass: rarityClass(item.system.rarity),
      // What Use does, where 08 gives the thing one (D-668).
      usable: hasUse(item.system.use),
      quantity: item.type === "gear" ? (item.system.quantity ?? null) : null,
      // A stone, an oil or a poison laid on this thing, while it lasts (D-670).
      coating: item.getFlag("azeroth-rpg", "coating")?.name ?? null,
      // Where it is kept, and what it holds (08 SS11, D-671).
      container: item.system.container ?? null,
      capacity: item.system.capacity ?? null,
      charges: hasCharges(item.system.charges) ? { ...item.system.charges } : null,
      detail: detailFields(item)
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/**
 * The loose rows regrouped under a heading per kind, in 08's own order —
 * weapons, then armor, then gear. A kind with nothing in it draws no heading.
 *
 * `loose` is what the character's tab passes false for: a thing inside a
 * container is listed under the container there and would otherwise be listed
 * twice. A creature has no containers, so everything it holds is loose.
 *
 * @param {Array<object>} rows  `carriedRows` output
 * @param {object} [o]
 * @param {boolean} [o.loose]   drop a row that names a container it holds
 */
export function carriedGroups(rows = [], { loose = true } = {}) {
  return PHYSICAL
    .map(type => ({
      type,
      label: `TYPES.Item.${type}`,
      items: rows.filter(i => i.type === type && (!loose || !i.container))
    }))
    .filter(g => g.items.length);
}

/**
 * The prose under a row, enriched once per item however many lists carry it.
 * Mutates the rows, which is what both sheets already did with it.
 *
 * @param {Actor} actor
 * @param {Array<object>} rows
 */
export async function describeRows(actor, rows) {
  const cache = new Map();
  for (const row of rows) {
    if (!row?.id || row.description !== undefined) continue;
    if (!cache.has(row.id)) cache.set(row.id, await detailProse(actor.items.get(row.id)));
    row.description = cache.get(row.id);
  }
}
