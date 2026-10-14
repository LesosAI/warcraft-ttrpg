/**
 * Migration to 0.10.0 - the character creator and the NPC generator (D-636,
 * D-637).
 *
 * A character gains three stored fields - the languages spoken, the purse in
 * copper and the motive sentence - all additive with initials, so nothing
 * fails to load; the pass STAMPS the defaults so a raw source read never
 * meets an absent key. A class copied before 01 §6's kit was parsed onto it
 * carries an empty one, and a career copied before 03 §5's side was read
 * carries the initial `anyone`; both are restored from the pack copy of the
 * same identifier (or, failing that, the same name), as 0.7.0 and 0.9.0 did.
 * Idempotent: a document that already carries the value is left alone.
 */

import { AZEROTH } from "../config.mjs";

/** The class tables this version adds, copied from the pack where a held copy lacks them. */
export const CLASS_TABLES = Object.freeze(["kit"]);

/** The rows a creature's keyword table stores as keys from this version. */
const LOWERCASE_ROWS = Object.freeze(["immune", "vulnerable", "resilience", "inflicts"]);

/**
 * Reshape a creature's source before the schema cleans it (D-637).
 *
 * THE LOAD GUARD. 0.10.0 gives `immune` and `vulnerable` the damage-type
 * keys as `choices`, and every pack entry before it stored the chapter's
 * capitalised words - `Holy`, `Fire`. A world copy carrying one would fail
 * validation at construction, land in `invalidDocumentIds`, and never be
 * seen by the world migration below (CLAUDE.md §15). `skills` becomes a
 * keyed map of Ranks the same version, so a stored `{rank: n}` or a key 02 §8
 * does not hold is coerced or dropped here for the same reason.
 */
export function migrateNpcSource(source) {
  if (!source || typeof source !== "object") return source;
  for (const key of LOWERCASE_ROWS) {
    if (Array.isArray(source[key])) source[key] = source[key].map(v => String(v).toLowerCase());
  }
  if (source.skills && typeof source.skills === "object") {
    const out = {};
    for (const [key, value] of Object.entries(source.skills)) {
      if (!(key in AZEROTH.skills)) continue;
      const rank = Math.trunc(Number(value?.rank ?? value));
      if (Number.isFinite(rank) && rank >= 1 && rank <= AZEROTH.RANK_MAX) out[key] = rank;
    }
    source.skills = out;
  }
  if (source.threatShare !== undefined && source.threatShare !== null) {
    const n = Number(source.threatShare);
    source.threatShare = Number.isFinite(n) ? n : null;
  }
  return source;
}

/**
 * The update for one creature's raw system source, or null: lowercase
 * keywords where the case differs, and for a copy of a pack creature whose
 * Boss Actions were glued into its abilities before the parser split them,
 * the split copied from the pack entry of the same name. A creature the
 * generator built or reworked (`flags.azeroth-rpg.built`) is the GM's and
 * is left alone.
 */
export function buildNpcUpdate(raw, packSystem = null, { built = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  for (const key of ["immune", "vulnerable"]) {
    const list = Array.isArray(raw[key]) ? raw[key] : [];
    const lowered = list.map(v => String(v).toLowerCase());
    if (lowered.some((v, i) => v !== list[i])) update[`system.${key}`] = lowered;
  }
  const fromChapter = raw.source?.document === "14-BESTIARY";
  // The parser dropped the decimal point from a Threat Share for a version:
  // a Soldier stored 5 and a Chaff 25. A pack creature's copy takes the
  // pack's figure back.
  if (fromChapter && !built && packSystem && "threatShare" in packSystem && (raw.threatShare ?? null) !== (packSystem.threatShare ?? null)) {
    update["system.threatShare"] = packSystem.threatShare ?? null;
  }
  const glued = fromChapter && !built && !(raw.bossActions?.length) && Array.isArray(packSystem?.bossActions) && packSystem.bossActions.length;
  if (glued) {
    update["system.creatureAbilities"] = (packSystem.creatureAbilities ?? []).map(row => ({ ...row }));
    update["system.bossActions"] = packSystem.bossActions.map(row => ({ ...row }));
    if (!raw.lore && packSystem.lore) update["system.lore"] = packSystem.lore;
  }
  return Object.keys(update).length ? update : null;
}

/** The update for one character's raw system source, or null. */
export function buildCharacterUpdate(system) {
  if (!system || typeof system !== "object") return null;
  const update = {};
  if (!Array.isArray(system.languages)) update["system.languages"] = [];
  if (!Number.isFinite(system.coin)) update["system.coin"] = 0;
  if (typeof system.motive !== "string") update["system.motive"] = "";
  return Object.keys(update).length ? update : null;
}

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

/**
 * The update for one career item, or null. A held copy that still reads
 * `anyone` (the initial) takes the pack's side; one a GM has set to a side
 * of their own is left alone.
 */
export function buildCareerUpdate(system, packSystem) {
  const side = packSystem?.side;
  if (!side || typeof side !== "string") return null;
  const stored = typeof system?.side === "string" ? system.side : null;
  if (stored === side) return null;
  if (stored && stored !== "anyone") return null;
  return { "system.side": side };
}

async function packSystems(packId) {
  const byIdentifier = new Map();
  const byName = new Map();
  const pack = game.packs.get(packId);
  if (pack) {
    for (const doc of await pack.getDocuments()) {
      const system = doc.toObject().system ?? {};
      if (system.identifier) byIdentifier.set(system.identifier, system);
      byName.set(doc.name, system);
    }
  }
  return { byIdentifier, byName };
}

export async function migrate(log = console.log) {
  let touched = 0;

  const classes = await packSystems("azeroth-rpg.classes");
  const careers = await packSystems("azeroth-rpg.careers");
  const bestiary = await packSystems("azeroth-rpg.bestiary");
  const lookup = (table, raw, name) => table.byIdentifier.get(raw?.identifier) ?? table.byName.get(name);

  const applyToItem = async (item, where) => {
    const raw = item._source?.system ?? item.toObject?.().system ?? item.system;
    let update = null;
    if (item.type === "class") update = buildClassUpdate(raw, lookup(classes, raw, item.name));
    else if (item.type === "career") update = buildCareerUpdate(raw, lookup(careers, raw, item.name));
    if (!update) return;
    await item.update(update, { render: false, diff: false });
    log(`azeroth-rpg | ${where}: ${item.name} (${item.id})`);
    touched++;
  };

  const applyToActor = async (actor, where) => {
    const raw = actor._source?.system ?? actor.toObject?.().system ?? actor.system;
    let update = null;
    if (actor.type === "character") update = buildCharacterUpdate(raw);
    else if (actor.type === "npc") {
      update = buildNpcUpdate(raw, bestiary.byName.get(actor.name) ?? null, {
        built: Boolean(actor.flags?.["azeroth-rpg"]?.built)
      });
    }
    if (update) {
      await actor.update(update, { render: false, diff: false });
      log(`azeroth-rpg | ${where}: ${actor.name} (${actor.id})`);
      touched++;
    }
    for (const item of actor.items) await applyToItem(item, `${where}, ${actor.name}`);
  };

  for (const item of game.items) await applyToItem(item, "world item");
  for (const actor of game.actors) await applyToActor(actor, "world actor");

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      await applyToActor(token.actor, `token on ${scene.name}`);
    }
  }

  for (const worldPack of game.packs) {
    if (worldPack.metadata.packageType !== "world" || worldPack.locked) continue;
    if (worldPack.documentName === "Item") {
      for (const doc of await worldPack.getDocuments()) await applyToItem(doc, `pack ${worldPack.metadata.id}`);
    } else if (worldPack.documentName === "Actor") {
      for (const doc of await worldPack.getDocuments()) await applyToActor(doc, `pack ${worldPack.metadata.id}`);
    }
  }

  return touched;
}
