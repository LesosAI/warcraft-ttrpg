/**
 * Migration to 0.5.0 — Momentum joins Power on the class entry.
 *
 * 0.4.0 moved Power onto `system.classes[].power` because 02 §10 gives each
 * class its own. Momentum was left on the actor on the reading that 05 §11's
 * *"where a rule says Momentum, it means whichever of these you have"* merged
 * two classes' resources into one.
 *
 * THE LEAD RULED OTHERWISE: that sentence names the resource, it does not merge
 * them. A Warrior/Rogue holds **Rage at 10 and Combo Points at 5**, two pools
 * with different caps. So the value moves the same way Power did:
 *
 *   system.momentum.value  ->  system.classes[0].momentum.value
 *
 * `system.momentum` stays in the schema as the primary class's pool, derived
 * rather than stored.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

/**
 * Reshape raw source BEFORE the schema cleans it.
 *
 * @param {object} system  Raw, uncleaned system source.
 * @returns {object}
 */
export function migrateSource(system) {
  if (!system || typeof system !== "object") return system;

  const stored = system.momentum?.value;
  if (!Number.isFinite(stored) || stored <= 0) return system;
  if (!Array.isArray(system.classes) || !system.classes.length) return system;

  const primary = system.classes[0];
  if (!primary || typeof primary !== "object") return system;

  // Which class the pool belonged to was never recorded. Index 0 is the only
  // defensible guess: a pre-0.5.0 world had one pool, and one pool is what a
  // single-class character has.
  if (primary.momentum?.value == null) {
    primary.momentum = { value: Math.max(0, Math.trunc(stored)) };
  }

  return system;
}

/**
 * Build the update for one actor, or null if nothing needs doing.
 * @param {object} system
 * @returns {object|null}
 */
export function buildActorUpdate(system) {
  if (!system) return null;
  if (!Array.isArray(system.classes) || !system.classes.length) return null;

  const stored = system.momentum?.value;
  if (!Number.isFinite(stored) || stored <= 0) return null;
  if (system.classes[0]?.momentum?.value) return null;

  // The whole array is written back: an ArrayField has no dotted path that can
  // reach one element without replacing the rest.
  const classes = system.classes.map((c, i) => ({
    ...c,
    momentum: i === 0
      ? { value: Math.max(0, Math.trunc(stored)) }
      : (c.momentum ?? { value: 0 })
  }));
  return { "system.classes": classes };
}

/**
 * @param {(msg: string) => void} log
 * @returns {Promise<number>}
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
