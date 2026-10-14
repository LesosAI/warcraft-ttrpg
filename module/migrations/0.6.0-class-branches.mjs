/**
 * Migration to 0.6.0 — a class's branches are `{name, description}`.
 *
 * `ClassData.branches` was typed as an array of strings while the pack source
 * carried objects. `StringField#_cast` turned each into "[object Object]" on
 * import, so every class copied into a world or onto a character held three
 * identical strings and named no branch. The schema is repaired in this
 * version.
 *
 * TWO STEPS, BECAUSE A DOCUMENT THAT FAILS VALIDATION IS NEVER SEEN. Under
 * the repaired schema a stored string casts to `{}` and `name` is undefined,
 * and core refuses to initialize the item - "Failed to initialize Item" on
 * the console at world load, and the item absent from `actor.items`, where
 * this migration would look for it. So `ClassData.migrateData` calls
 * `migrateClassSource` first, at construction, and drops the strings; the
 * document then loads with no branches, and `migrate()` restores them from
 * the pack class with the same identifier (or, failing that, the same name).
 *
 * Idempotent: an item whose branches already carry names is left alone.
 */

/**
 * Reshape raw class source BEFORE the schema cleans it: a branch that is not
 * an object carrying a name is dropped. Called from `ClassData.migrateData`.
 * Named apart from `migrateSource`, which the chain applies to CHARACTER
 * source.
 *
 * @param {object} system  Raw, uncleaned class system source.
 * @returns {object}
 */
export function migrateClassSource(system) {
  if (!system || typeof system !== "object") return system;
  if (!Array.isArray(system.branches)) return system;
  const kept = system.branches.filter(b => b && typeof b === "object" && typeof b.name === "string" && b.name);
  if (kept.length !== system.branches.length) system.branches = kept;
  return system;
}

/** Do these stored branches need restoring? Empty, or any without a name. */
export function needsRepair(branches) {
  if (!Array.isArray(branches)) return true;
  if (!branches.length) return true;
  return branches.some(b => !b || typeof b !== "object" || !b.name);
}

/**
 * The update for one class item, or null when nothing needs doing.
 *
 * @param {object} system         The item's system source.
 * @param {object[]} packBranches The branches on the pack's copy of the class.
 * @returns {object|null}
 */
export function buildItemUpdate(system, packBranches) {
  if (!needsRepair(system?.branches)) return null;
  if (!Array.isArray(packBranches) || !packBranches.length) return null;
  if (packBranches.some(b => !b?.name)) return null;
  return {
    "system.branches": packBranches.map(b => ({ name: b.name, description: b.description ?? "" }))
  };
}

export async function migrate(log = console.log) {
  let touched = 0;

  const byIdentifier = new Map();
  const byName = new Map();
  const pack = game.packs.get("azeroth-rpg.classes");
  if (pack) {
    for (const doc of await pack.getDocuments()) {
      const branches = doc.toObject().system?.branches ?? [];
      if (doc.system?.identifier) byIdentifier.set(doc.system.identifier, branches);
      byName.set(doc.name, branches);
    }
  }

  const applyTo = async (item, where) => {
    if (item.type !== "class") return;
    const system = item.toObject?.().system ?? item.system;
    const branches = byIdentifier.get(system?.identifier) ?? byName.get(item.name);
    const update = buildItemUpdate(system, branches);
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
