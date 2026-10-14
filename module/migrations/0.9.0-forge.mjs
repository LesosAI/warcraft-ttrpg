/**
 * Migration to 0.9.0 - the catalogue and the Forge (D-632 to D-634): a
 * weapon, a suit and a piece of gear learn a Signature and the spells they
 * cast, and a suit a Body Armor Point bonus.
 *
 * All three are additive fields with initials, so no document fails to load
 * and no source needs reshaping. The pass STAMPS the defaults onto documents
 * already in worlds, so a raw source read (a macro, an export) never meets
 * an absent `system.spells`, and logs every document it touches. Idempotent:
 * a document that already carries the three is left alone.
 */

const PHYSICAL = new Set(["weapon", "armor", "gear"]);

/** The class tables this version adds; copied from the pack where a held copy lacks them (as 0.7.0 did). */
export const CLASS_TABLES = Object.freeze(["demons"]);

/** The update for one class item's raw system source against the pack's copy, or null. */
export function buildClassUpdate(system, packSystem) {
  if (!packSystem || typeof packSystem !== "object") return null;
  const update = {};
  for (const key of CLASS_TABLES) {
    const stored = Array.isArray(system?.[key]) ? system[key] : [];
    const source = Array.isArray(packSystem[key]) ? packSystem[key] : [];
    if (stored.length || !source.length) continue;
    update[`system.${key}`] = source.map(row => ({ ...row }));
  }
  return Object.keys(update).length ? update : null;
}

/** The update for one item's raw system source, or null. */
export function buildEquipmentUpdate(type, system) {
  if (!PHYSICAL.has(type) || !system || typeof system !== "object") return null;
  const update = {};
  if (system.signature === undefined || system.signature === null) update["system.signature"] = "";
  if (!Array.isArray(system.spells)) update["system.spells"] = [];
  if (type === "armor" && (system.apBonus === undefined || system.apBonus === null)) update["system.apBonus"] = 0;
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
    const raw = item._source?.system ?? item.toObject?.().system ?? item.system;
    const update = item.type === "class"
      ? buildClassUpdate(raw, byIdentifier.get(raw?.identifier) ?? byName.get(item.name))
      : buildEquipmentUpdate(item.type, raw);
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
