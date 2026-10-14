/**
 * Migration to 0.12.10 — where a character's things are kept, in bag slots
 * (05 *Speed and movement*, 08 §11; D-735, D-736, D-739, D-742).
 *
 * Three things were true of every world made before this and are not true
 * after it, and none of them can be repaired one document at a time — whether
 * a backpack is being worn depends on what else the actor holds:
 *
 * - **A thing could be worn AND kept in a bag at once.** Nothing enforced
 *   D-739's exclusion, so a chain shirt could sit inside a backpack and be
 *   drawn on the paper doll at the same time, weighing nothing either way. The
 *   worn half wins: `containerOf` already reads it that way, so this only
 *   writes down what the sheet was already showing.
 * - **A container was never worn.** Under D-671 a sack held things while it
 *   sat in the pack, and `system.equipped` on a bag meant nothing at all. Now
 *   a container adds its bag slots ONLY while it is worn and comes off empty,
 *   so a world holding six things in an unequipped sack would read as six
 *   loose things and a sack, over capacity, with the sack refusing to be worn
 *   because it is full. Every container that HOLDS SOMETHING is put on.
 * - **Nesting is gone.** A sack inside a backpack has no place in the bar, so
 *   whatever it held falls loose rather than disappearing with it.
 *
 * **Nothing is rebalanced.** Over capacity is legal (a Strength drain, a size
 * change, a legacy world) and is drawn in words on the Gear tab; a migration
 * that moved a player's things about to make the numbers tidy would be
 * deciding something the table gets to decide.
 *
 * A creature keeps pounds (05 gives it its Strength score ten times over), so
 * an NPC takes the worn-or-kept step and nothing else.
 *
 * Idempotent, and every write is VALUE-COMPARED against what is stored rather
 * than against `undefined` — a document loaded through the model never has an
 * absent field, which is D-665's fault and is not repeated.
 */

import { rawSystem, walkWorld } from "./walk.mjs";
import { MAX_CONTAINERS, isMount, wellsOf } from "../rules/slots.mjs";

/** The item subtypes a bag can hold. */
const PHYSICAL = Object.freeze(["weapon", "armor", "gear"]);

/** Stable order for "largest first": wells down, then name, then id. */
function byRoom(a, b) {
  return (b.wells - a.wells)
    || String(a.row.name ?? "").localeCompare(String(b.row.name ?? ""))
    || String(a.row.id ?? "").localeCompare(String(b.row.id ?? ""));
}

/**
 * The updates one actor's items need, as `[{_id, "system.x": v}]`.
 *
 * @param {Array<{id: string, type: string, name: string, system: object}>} items
 * @param {{character?: boolean}} [options]  an NPC takes the first step alone
 * @returns {Array<object>} `[]` where there is nothing to do, which is a second run
 */
export function buildBagUpdate(items = [], { character = true } = {}) {
  const rows = [...(items ?? [])].filter(row => row && row.id && PHYSICAL.includes(row.type));
  const writes = new Map();
  const set = (id, key, value) => {
    const held = writes.get(id) ?? { _id: id };
    held[key] = value;
    writes.set(id, held);
  };
  const sys = row => row.system ?? {};

  // 1. WORN OR KEPT, NEVER BOTH (D-739). Worn wins, because that is what
  //    `containerOf` has always read and so what the sheet has always drawn.
  for (const row of rows) {
    if (sys(row).equipped === true && sys(row).container) set(row.id, "system.container", null);
  }
  if (!character) return [...writes.values()];

  // 2. A CONTAINER THAT HOLDS SOMETHING IS BEING WORN (D-736). A container
  //    nobody put anything in is left exactly as the world had it: it may be
  //    a spare in the pack, and putting it on would spend a place for nothing.
  const holding = new Set(rows.map(row => sys(row).container).filter(Boolean));
  const mountedAlready = rows.some(row => isMount(row) && sys(row).equipped === true);
  const wants = row => sys(row).equipped === true || holding.has(row.id);

  // The mount first: the Saddlebags' own row adds nothing without one.
  const mounts = rows.filter(row => isMount(row) && wants(row))
    .map(row => ({ row, wells: wellsOf(row, { mounted: true }).wells ?? 0 }))
    .sort(byRoom);
  const mount = mounts[0]?.row ?? null;
  const mounted = Boolean(mount) || mountedAlready;

  const placed = new Set();
  if (mount) placed.add(mount.id);

  const holders = rows
    .filter(row => !isMount(row) && wants(row))
    .map(row => ({ row, ...wellsOf(row, { mounted }) }))
    .filter(entry => !entry.reason && entry.wells > 0)
    .sort(byRoom);

  let general = 0;
  const kinds = new Set();
  for (const entry of holders) {
    if (entry.of) {
      if (kinds.has(entry.of)) continue;
      kinds.add(entry.of);
    } else {
      if (general >= MAX_CONTAINERS) continue;
      general += 1;
    }
    placed.add(entry.row.id);
  }

  // Everything that took a place is WORN and is in no bag itself.
  for (const row of rows) {
    if (!placed.has(row.id)) continue;
    if (sys(row).equipped !== true) set(row.id, "system.equipped", true);
    if (sys(row).container) set(row.id, "system.container", null);
  }

  // 3. What was in anything else falls LOOSE rather than out of the world: a
  //    fifth container, a sack inside a backpack, a bag deleted long ago.
  for (const row of rows) {
    const inside = sys(row).container;
    if (!inside || placed.has(inside)) continue;
    // A worn thing was already cleared in step 1; writing it twice is the same
    // value and harmless, but the map keeps one entry either way.
    set(row.id, "system.container", null);
  }

  return [...writes.values()];
}

export async function migrate(log = console.log) {
  return walkWorld({
    items: doc => {
      if (doc.type !== "character" && doc.type !== "npc") return null;
      const rows = [...doc.items].map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        system: rawSystem(item)
      }));
      return buildBagUpdate(rows, { character: doc.type === "character" });
    }
  }, log);
}
