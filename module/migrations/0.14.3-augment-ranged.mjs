/**
 * Migration to 0.14.3 - an Augment is carried in the Ranged slot for every class
 * (D-850; the lead: *"An augment should use the ranged weapon slot for all
 * classes"*).
 *
 * Before this an Augment was held in the off hand (D-674) and a bow sat in the
 * Ranged tile beside it, so a world may hold a character with both equipped.
 * Now the two share one slot and `rules/worn.mjs#displacedBy` puts each away for
 * the other - but a stored pair from before is never re-judged until somebody
 * equips something, and the figure would draw the launcher and lose the Augment.
 *
 * **KEEP THE AUGMENT, BAG THE LAUNCHER** (the drafts' item 9, the orchestrator's
 * reading of *"build it"*): every equipped launcher on an actor that also has an
 * equipped Augment is unequipped. `system.equipped: false` is the whole write -
 * an equipped launcher is never in a bag (D-739's worn-or-kept rule), so it lands
 * loose in the base pack, which is what *bag it* means. The write carries the bag
 * doors' bypass through `walkWorld`'s `items` builder, because a full pack would
 * otherwise refuse the repair it is for (D-737), and a character over capacity
 * afterwards is drawn in words on the Gear tab as it always is (D-742: nothing is
 * rebalanced).
 *
 * **NO SAND MOVES.** The Augment stays in the slot, so an Hourglass keeps its Sand.
 *
 * Every actor type, because the NPC sheet equips an Augment through the same
 * `displacedBy` (D-705). Idempotent: after one pass no actor holds both, and a
 * second pass finds nothing. Every document touched is logged by `walkWorld`.
 */

import { augmentOf } from "../rules/augments.mjs";
import { rawSystem, walkWorld } from "./walk.mjs";

/** Whether a row is an Augment, off its derived shape or its readable one. */
function isAugmentRow(row) {
  if (row?.type !== "gear") return false;
  if (row.system?.augment) return true;
  return augmentOf({ name: row.name, system: row.system, flags: row.flags }) !== null;
}

/** Whether a row is a launcher, the other thing the Ranged slot holds. */
function isLauncherRow(row) {
  return row?.type === "weapon" && Boolean(row.system?.launcher);
}

/**
 * The writes one actor's items need: `[{_id, "system.equipped": false}]` for every
 * equipped launcher, where an Augment is equipped too. Sorted by id, so a run's
 * log reads the same twice.
 *
 * @param {Array<{id: string, type: string, name?: string, system: object, flags?: object}>} items
 * @returns {Array<object>}  `[]` where there is nothing to do, which is a second run
 */
export function rangedPlan(items = []) {
  const rows = [...(items ?? [])].filter(row => row?.id && row.system?.equipped === true);
  if (!rows.some(isAugmentRow)) return [];
  return rows.filter(isLauncherRow)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(row => ({ _id: row.id, "system.equipped": false }));
}

export async function migrate(log = console.log) {
  return walkWorld({
    items: doc => {
      if (doc.type !== "character" && doc.type !== "npc") return null;
      const rows = [...doc.items].map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        system: rawSystem(item),
        flags: item.flags
      }));
      const plan = rangedPlan(rows);
      for (const write of plan) {
        const name = rows.find(r => r.id === write._id)?.name ?? write._id;
        log(`azeroth-rpg | 0.14.3: ${doc.name} keeps its Augment in the Ranged slot; ${name} goes to the pack`);
      }
      return plan;
    }
  }, log);
}
