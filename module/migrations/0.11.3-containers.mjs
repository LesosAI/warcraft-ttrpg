/**
 * Migration to 0.11.3 - what a thing holds, and where it is kept (D-671).
 *
 * `GearData.capacity` and `charges` are new, and `container` is new on every
 * physical thing, so a world's gear carries the schema's initials: a
 * backpack that holds nothing, a waterskin with no day in it. The pack copy
 * is the authority, since the parser reads the capacity off 08's own
 * **Holds** and **Carries** runs; a piece of gear the pack does not hold is
 * read off its own description, so a GM's own sack works too.
 *
 * Idempotent, and compared by SHAPE rather than against `undefined` - a
 * document loaded through the model never has an absent field, which is
 * D-667's fault and is not repeated.
 */

import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { flatten, runAfter } from "../rules/consumables.mjs";
import { capacityFrom, chargesFrom, emptyCapacity, emptyCharges } from "../rules/containers.mjs";
import { sameUse } from "./0.11.2-consumable-use.mjs";

/** What a description's own words say it holds and has to spend. */
export function holdingOf(raw) {
  const text = flatten(raw?.description ?? "");
  const run = runAfter(text, "Holds") ?? runAfter(text, "Carries");
  return {
    capacity: run ? capacityFrom(run) : emptyCapacity(),
    charges: chargesFrom(text)
  };
}

/**
 * The update for one gear item's raw system, or null.
 *
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 */
export function buildHoldingUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object") return null;
  const own = holdingOf(raw);
  const wanted = {
    capacity: pack?.capacity ?? own.capacity,
    charges: pack?.charges ?? own.charges
  };
  const update = {};
  if (!sameUse(raw.capacity ?? null, wanted.capacity)) update["system.capacity"] = JSON.parse(JSON.stringify(wanted.capacity));
  if (!sameUse(raw.charges ?? null, wanted.charges)) update["system.charges"] = JSON.parse(JSON.stringify(wanted.charges));
  return Object.keys(update).length ? update : null;
}

/** Every physical thing gains the field that says where it is kept. */
export function buildKeptUpdate(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw.container === undefined ? { "system.container": null } : null;
}

export async function migrate(log = console.log) {
  const gear = await packSystems("azeroth-rpg.gear");
  return walkWorld({
    item: doc => {
      const raw = rawSystem(doc);
      if (doc.type === "gear") {
        // An empty object is still an update to `walkWorld`, and would touch
        // every item on every run: null is what "nothing to do" looks like.
        const update = { ...(buildHoldingUpdate(raw, packCopy(gear, raw, doc.name)) ?? {}), ...(buildKeptUpdate(raw) ?? {}) };
        return Object.keys(update).length ? update : null;
      }
      if (doc.type === "weapon" || doc.type === "armor") return buildKeptUpdate(raw);
      return null;
    }
  }, log);
}
