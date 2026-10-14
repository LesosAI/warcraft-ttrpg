/**
 * Migration to 0.7.0 - a class item's tables are refreshed from the pack.
 *
 * 0.6.0 added `totems` to ClassData and 0.7.0 adds `forms` (D-618, D-619).
 * Both are read off the class item a character OWNS, and one copied from the
 * pack before the table existed carries an empty one: Use on Totem or on
 * Shapeshift then has nothing to list, on a class that looks complete. This
 * restores each empty table from the pack class with the same identifier
 * (or, failing that, the same name) and leaves a table that already has rows
 * alone. Idempotent.
 */

/** The tables a class carries that were added after the pack was first cut. */
export const TABLES = Object.freeze(["totems", "forms"]);

/**
 * The update for one class item, or null when nothing needs doing.
 *
 * @param {object} system      The item's system source.
 * @param {object} packSystem  The system source of the pack's copy of the class.
 * @returns {object|null}
 */
export function buildItemUpdate(system, packSystem) {
  if (!packSystem || typeof packSystem !== "object") return null;
  const update = {};
  for (const key of TABLES) {
    const stored = Array.isArray(system?.[key]) ? system[key] : [];
    const source = Array.isArray(packSystem[key]) ? packSystem[key] : [];
    if (stored.length || !source.length) continue;
    update[`system.${key}`] = source.map(row => ({ ...row }));
  }
  return Object.keys(update).length ? update : null;
}

export async function migrate(log = console.log) {
  let touched = 0;

  const byIdentifier = new Map();
  const byName = new Map();
  const pack = game.packs.get("azeroth-rpg.classes");
  if (pack) {
    for (const doc of await pack.getDocuments()) {
      const system = doc.toObject().system ?? {};
      if (system.identifier) byIdentifier.set(system.identifier, system);
      byName.set(doc.name, system);
    }
  }

  const applyTo = async (item, where) => {
    if (item.type !== "class") return;
    const system = item.toObject?.().system ?? item.system;
    const source = byIdentifier.get(system?.identifier) ?? byName.get(item.name);
    const update = buildItemUpdate(system, source);
    if (!update) return;
    await item.update(update, { render: false, diff: false });
    log(`azeroth-rpg | ${where}: ${item.name} (${item.id})`);
    touched++;
  };

  for (const item of game.items) await applyTo(item, "world item");

  for (const actor of game.actors) {
    for (const item of actor.items) await applyTo(item, `on ${actor.name}`);
  }

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      for (const item of token.actor.items) await applyTo(item, `token on ${scene.name}`);
    }
  }

  for (const worldPack of game.packs) {
    if (worldPack.metadata.packageType !== "world" || worldPack.locked) continue;
    if (worldPack.documentName === "Item") {
      for (const doc of await worldPack.getDocuments()) await applyTo(doc, `pack ${worldPack.metadata.id}`);
    } else if (worldPack.documentName === "Actor") {
      for (const doc of await worldPack.getDocuments()) {
        for (const item of doc.items) await applyTo(item, `pack ${worldPack.metadata.id}, ${doc.name}`);
      }
    }
  }

  return touched;
}
