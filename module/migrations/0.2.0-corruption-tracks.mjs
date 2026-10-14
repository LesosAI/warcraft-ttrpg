/**
 * Migration to 0.2.0.
 *
 * Three changes, all of them the book catching up with itself:
 *
 *   1. Corruption narrows from five tracks to three (D-456). `arcane` and
 *      `flesh` are deferred, not struck, so their values are dropped rather
 *      than folded into another track.
 *   2. `system.wounds` becomes `system.health`. "Wounds" was retired as a
 *      pool name by D-006 and the schema never followed.
 *   3. `system.spiritTether` starts at 3, per 05-CORE-RULES §14. A character
 *      still sitting on the old default of 2 is raised; one that has spent
 *      Tether in play is left alone.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

const DROPPED_TRACKS = ["arcane", "flesh"];

/**
 * Reshape raw source BEFORE the schema cleans it.
 *
 * A LIVE ACTOR NEVER PRESENTS LEGACY DATA TO `buildActorUpdate`. `SchemaField`
 * cleaning runs at construction: `system.wounds` is not in the schema, so it is
 * dropped, and by the time any migration reads `actor.system` the old numbers
 * are already gone. `DataModel.migrateData` is the only hook that runs early
 * enough to see them, which is why this exists separately from the update
 * builder below.
 *
 * Mutates and returns `system`, as `migrateData` requires.
 *
 * @param {object} system  Raw, uncleaned system source.
 * @returns {object}
 */
export function migrateSource(system) {
  if (!system || typeof system !== "object") return system;

  // wounds -> health, unless health already carries a value.
  if (system.wounds && typeof system.wounds === "object") {
    if (!system.health) {
      system.health = {
        value: system.wounds.value ?? 10,
        max: system.wounds.max ?? 10
      };
    }
    delete system.wounds;
  }

  // The two deferred tracks are dropped rather than folded into another.
  if (system.corruption && typeof system.corruption === "object") {
    for (const key of DROPPED_TRACKS) delete system.corruption[key];
  }

  // The Tether floor. A character who spent Tether in play keeps what they have.
  if (system.spiritTether?.max === 2) {
    system.spiritTether.max = 3;
    if ((system.spiritTether.value ?? 0) === 2) system.spiritTether.value = 3;
  }

  return system;
}

/**
 * Build the update for one actor, or null if nothing needs doing.
 * Pure enough to unit-test — takes a plain object, returns a plain object.
 *
 * @param {object} system  The actor's `system` data.
 * @returns {object|null}  A flattened update, or null.
 */
export function buildActorUpdate(system) {
  const update = {};
  if (!system) return null;

  // 1. corruption tracks. A CHARACTER carries tracks as an object; an NPC
  //    carries the corruption KEYWORD as a string (D4 §10.2), and `"arcane"
  //    in "undeath"` throws. This migration met its first NPC on 2026-09-02,
  //    a world actor a canvas-drop test had imported, and stopped the whole
  //    chain at its first step.
  if (system.corruption && typeof system.corruption === "object") {
    for (const key of DROPPED_TRACKS) {
      if (key in system.corruption) update[`system.corruption.-=${key}`] = null;
    }
  }

  // 2. wounds -> health. Only when health is not already carrying the value,
  //    so a half-migrated world does not lose the newer number.
  if (system.wounds && !system.health) {
    update["system.health.value"] = system.wounds.value ?? 10;
    update["system.health.max"] = system.wounds.max ?? 10;
    update["system.-=wounds"] = null;
  } else if (system.wounds) {
    update["system.-=wounds"] = null;
  }

  // 3. Tether floor. Raise the maximum only where it still reads as the old
  //    default; a character who bought or burned Tether keeps what they have.
  if (system.spiritTether?.max === 2) {
    update["system.spiritTether.max"] = 3;
    if ((system.spiritTether.value ?? 0) === 2) update["system.spiritTether.value"] = 3;
  }

  return Object.keys(update).length ? update : null;
}

/**
 * @param {(msg: string) => void} log  Where to report each document touched.
 * @returns {Promise<number>} How many documents were updated.
 */
export async function migrate(log = console.log) {
  let touched = 0;

  const applyTo = async (actor, where) => {
    // Every field this migration moves is a character's; an NPC has none of
    // them and reading it is where the chain used to die.
    if (actor.type !== "character") return;
    const update = buildActorUpdate(actor.system ?? actor.toObject?.().system);
    if (!update) return;
    await actor.update(update, { render: false, diff: false });
    log(`azeroth-rpg | ${where}: ${actor.name} (${actor.id})`);
    touched++;
  };

  // World actors
  for (const actor of game.actors) await applyTo(actor, "world actor");

  // Unlinked token actors, on every scene
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      await applyTo(token.actor, `token on ${scene.name}`);
    }
  }

  // Unlocked world compendium packs
  for (const pack of game.packs) {
    if (pack.metadata.packageType !== "world" || pack.locked) continue;
    if (pack.documentName !== "Actor") continue;
    for (const doc of await pack.getDocuments()) await applyTo(doc, `pack ${pack.metadata.id}`);
  }

  return touched;
}
