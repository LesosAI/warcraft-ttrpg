/**
 * Migration to 0.3.0 — D-507's two pools.
 *
 * The schema carried ONE pool where 05 §11 has two, and a constant where the
 * rules have a lookup:
 *
 *   system.momentum         a bare number, capped at a hardcoded 10
 *   system.resource.value   a single unnamed "class resource"
 *
 * 05 §11 gives a class Momentum, Power, both or neither, and the cap comes from
 * the class — 10 for Rage, Zeal and Ferocity, 5 for Quarry and Combo Points.
 * A multiclass may hold one from each side. So:
 *
 *   system.momentum.value   was the bare number
 *   system.power.value      was system.resource.value
 *
 * and neither stores a maximum any more.
 *
 * `momentum` changes shape from a number to an object, so it is replaced
 * wholesale rather than through a dotted path — a flattened `system.momentum.value`
 * against a numeric source is how you get a world holding both.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

/**
 * Reshape raw source BEFORE the schema cleans it.
 *
 * `momentum` was a bare number and the schema now holds a `SchemaField`, so
 * cleaning replaces the number with the field's initial and the value is lost;
 * `resource` is not in the schema at all and is dropped outright. Neither
 * survives to `actor.system`, so the update builder below can never see them on
 * a live actor - only `DataModel.migrateData` runs early enough.
 *
 * Mutates and returns `system`, as `migrateData` requires.
 *
 * @param {object} system  Raw, uncleaned system source.
 * @returns {object}
 */
export function migrateSource(system) {
  if (!system || typeof system !== "object") return system;

  if (typeof system.momentum === "number") {
    system.momentum = { value: Math.max(0, Math.trunc(system.momentum)) };
  }

  if (system.resource && typeof system.resource === "object") {
    // Only when power is not already carrying a value, so a half-migrated
    // world does not lose the newer number.
    if (system.power == null) {
      system.power = { value: Math.max(0, Math.trunc(system.resource.value ?? 0)) };
    }
    delete system.resource;
  }

  return system;
}

/**
 * Build the update for one actor, or null if nothing needs doing.
 * Pure — takes a plain object, returns a plain object.
 *
 * @param {object} system  The actor's `system` data.
 * @returns {object|null}  A flattened update, or null.
 */
export function buildActorUpdate(system) {
  if (!system) return null;
  const update = {};

  // 1. momentum: number -> { value }. Replace the whole field; a dotted path
  //    would leave the number in place underneath on some code paths.
  if (typeof system.momentum === "number") {
    update["system.momentum"] = { value: Math.max(0, Math.trunc(system.momentum)) };
  } else if (system.momentum == null) {
    update["system.momentum"] = { value: 0 };
  }

  // 2. resource -> power. Only when power is not already carrying a value, so
  //    a half-migrated world does not lose the newer number.
  if (system.resource) {
    if (system.power == null) {
      update["system.power"] = { value: Math.max(0, Math.trunc(system.resource.value ?? 0)) };
    }
    update["system.-=resource"] = null;
  } else if (system.power == null) {
    update["system.power"] = { value: 0 };
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
