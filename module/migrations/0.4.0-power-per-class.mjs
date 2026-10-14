/**
 * Migration to 0.4.0 — 02 §10's per-class Power pools.
 *
 * `system.power` was one pool on the actor. 02 §10 is flat about it: *"Each
 * class keeps its own Power pool and casting chart. There is no combined
 * caster."* EIGHT OF THE NINE CLASSES CARRY POWER, so 28 of the 36 possible
 * two-class pairings are double-Power — a Mage/Rogue was holding Mana and no
 * Energy at all. The value moves to the class entry that owns it:
 *
 *   system.power.value        ->  system.classes[0].power.value
 *
 * `system.power` stays in the schema as the primary caster's pool, derived
 * rather than stored, so a chat card or macro reading one pool still works.
 *
 * MOMENTUM IS NOT SPLIT. 05 §11: "Where a rule says Momentum, it means
 * whichever of these you have" — Rage, Zeal, Quarry, Combo Points and Ferocity
 * are five names for one resource, and 02 §10 says nothing about a second.
 * Inventing one is not ours to do.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

/**
 * Reshape raw source BEFORE the schema cleans it.
 *
 * Without this the move is unrecoverable: `system.power.value` is read off a
 * cleaned model that has already defaulted it, so the number is gone by the
 * time any world migration runs. See `CharacterData.migrateData`.
 *
 * @param {object} system  Raw, uncleaned system source.
 * @returns {object}
 */
export function migrateSource(system) {
  if (!system || typeof system !== "object") return system;

  const stored = system.power?.value;
  if (!Number.isFinite(stored) || stored <= 0) return system;

  // Only the primary class takes it. Which class the pool belonged to was not
  // recorded, and index 0 is the only defensible guess: a pre-0.4.0 world had
  // one pool, and one pool is what a single-class character has.
  if (!Array.isArray(system.classes) || !system.classes.length) return system;

  const primary = system.classes[0];
  if (!primary || typeof primary !== "object") return system;

  // Do not overwrite a value the class entry already carries - a half-migrated
  // world keeps the newer number.
  if (primary.power?.value == null) {
    primary.power = { value: Math.max(0, Math.trunc(stored)) };
  }

  return system;
}

/**
 * Build the update for one actor, or null if nothing needs doing.
 * Pure — takes a plain object, returns a plain object.
 *
 * @param {object} system  The actor's `system` data.
 * @returns {object|null}
 */
export function buildActorUpdate(system) {
  if (!system) return null;
  if (!Array.isArray(system.classes) || !system.classes.length) return null;

  const stored = system.power?.value;
  if (!Number.isFinite(stored) || stored <= 0) return null;
  if (system.classes[0]?.power?.value) return null;

  // The whole array is written back: an ArrayField has no dotted path that can
  // reach one element without replacing the rest.
  const classes = system.classes.map((c, i) => ({
    ...c,
    power: i === 0 ? { value: Math.max(0, Math.trunc(stored)) } : (c.power ?? { value: 0 })
  }));
  return { "system.classes": classes };
}

/**
 * @param {(msg: string) => void} log  Where to report each document touched.
 * @returns {Promise<number>} How many documents were updated.
 */
export async function migrate(log = console.log) {
  let touched = 0;

  const applyTo = async (actor, where) => {
    if (actor.type !== "character") return;
    const update = buildActorUpdate(actor.toObject?.().system ?? actor.system);
    if (!update) return;
    await actor.update(update, { render: false, diff: false });
    log(`azeroth-rpg | ${where}: ${actor.name} (${actor.id})`);
    touched++;
  };

  for (const actor of game.actors) await applyTo(actor, "world actor");

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      await applyTo(token.actor, `token on ${scene.name}`);
    }
  }

  for (const pack of game.packs) {
    if (pack.metadata.packageType !== "world" || pack.locked) continue;
    if (pack.documentName !== "Actor") continue;
    for (const doc of await pack.getDocuments()) await applyTo(doc, `pack ${pack.metadata.id}`);
  }

  return touched;
}
