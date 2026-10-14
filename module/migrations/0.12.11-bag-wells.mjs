/**
 * Migration to 0.12.11 — WHICH WELL each thing sits in (05 *Speed and
 * movement*, 08 §11; the lead, 2026-09-20).
 *
 * Before this a bag stored an ORDER and not a POSITION: `ledger` walked a
 * panel's contents and `bags.mjs#wellMap` laid them out from the first well
 * with no gaps, so *which well* did not exist and a thing dropped on well 12
 * of an empty backpack landed in well 1. `system.well` is the position now,
 * and `rules/slots.mjs#packPanel` honours it.
 *
 * **NOTHING RESHUFFLES ON LOAD.** Every character's things are stamped with
 * the well they are ALREADY DRAWN IN, so the first render after the migration
 * is pixel for pixel the render before it; a world that never migrates would
 * read every well as null and pack from the front, which is the same picture
 * by a different route, but a half-migrated collection would not be.
 *
 * The order it reproduces is `bags.mjs`' OWN order as it stood at 0.12.10 —
 * stored `sort`, then 08's type order, then the name, then the id — inlined
 * here rather than imported, because the function it came from is now sorted
 * by type, rarity and name and would lay a tidied bag down instead of the one
 * the reader is looking at.
 *
 * **A creature is untouched.** 05 keeps 14's creatures in pounds, ten times
 * over, and an NPC's Gear tab draws `carried-row.hbs` and has no wells at all.
 *
 * Idempotent, and every write is VALUE-COMPARED against what is stored rather
 * than against `undefined` — a document loaded through the model never has an
 * absent field, which is D-665's fault and is not repeated.
 */

import { rawSystem, walkWorld } from "./walk.mjs";
import { BASE_SLOTS, ledger, slotsIn } from "../rules/slots.mjs";

/** The item subtypes a bag can hold. */
const PHYSICAL = Object.freeze(["weapon", "armor", "gear"]);

/** 08's own order: a weapon (§7), then a suit (§8), then gear (§9 onwards). */
const TYPE_ORDER = Object.freeze({ weapon: 0, armor: 1, gear: 2 });

/**
 * `bags.mjs#compareTiles` as it stood at 0.12.10, frozen here.
 *
 * It is the order the reader was looking at when this runs, and it has to
 * stay that order however the live comparator changes.
 */
function asDrawn(a, b) {
  return (Number(a?.sort) || 0) - (Number(b?.sort) || 0)
    || (TYPE_ORDER[a?.type] ?? 9) - (TYPE_ORDER[b?.type] ?? 9)
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
    || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/**
 * The updates one character's items need, as `[{_id, "system.well": n}]`.
 *
 * `wellMap` at 0.12.10 ENDED THE GRID at the first tile that did not fit and
 * sent everything after it to the over row, so this does the same: a thing
 * that was drawn in the wells gets the well it was drawn in, and a thing that
 * was in the over row gets null, which is the shape the law reads as *pack
 * me* and which **Make room** can move.
 *
 * @param {Array<{id: string, type: string, name: string, sort: number, system: object}>} items
 * @param {number} base  the character's own base pack, off `system.bagSlots.base`
 * @returns {Array<object>} `[]` where there is nothing to do, which is a second run
 */
export function buildWellUpdate(items = [], base = BASE_SLOTS) {
  const rows = [...(items ?? [])].filter(row => row && row.id && PHYSICAL.includes(row.type));
  if (!rows.length) return [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const led = ledger(rows, base);
  const writes = [];

  for (const panel of led.panels) {
    const tiles = (panel.itemIds ?? []).map(id => byId.get(id)).filter(Boolean).sort(asDrawn);
    let at = 0;
    let full = false;
    for (const row of tiles) {
      const size = Math.max(1, Math.trunc(Number(slotsIn(row, panel))) || 1);
      let want = null;
      if (!full && at + size <= panel.wells) { want = at; at += size; } else full = true;
      const held = row.system?.well ?? null;
      if (held !== want) writes.push({ _id: row.id, "system.well": want });
    }
  }
  return writes;
}

export async function migrate(log = console.log) {
  return walkWorld({
    items: doc => {
      if (doc.type !== "character") return null;
      const rows = [...doc.items].map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        sort: item.sort ?? 0,
        system: rawSystem(item)
      }));
      const base = Number(doc.system?.bagSlots?.base);
      return buildWellUpdate(rows, Number.isFinite(base) ? base : BASE_SLOTS);
    }
  }, log);
}
