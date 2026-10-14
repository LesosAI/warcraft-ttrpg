/**
 * Migration to 0.11.0 - ammunition (D-641), and what the later phases of the
 * same release add to it.
 *
 * A weapon gains three fields: `launcher` (what it shoots with), `fits` (what
 * a shot is cut to) and `ammunition` (the bundle nocked). All are additive
 * with initials, so nothing fails to load; the pass STAMPS them so a raw
 * source read never meets an absent key, and restores `launcher` and `fits`
 * from the pack copy of the same identifier or name, as 0.7.0, 0.9.0 and
 * 0.10.0 did for their tables. A weapon the pack does not hold - a renamed
 * copy, a GM's own - takes its kind from its name where 08 §7 names it, and
 * keeps what it has otherwise. Idempotent: a document that already carries
 * every value is left alone.
 */

import { classifyLauncher } from "../rules/ammunition.mjs";
import { wardMapOf } from "../rules/ward.mjs";
import { emptyAutomation } from "../rules/ability-automation.mjs";
import { bindingFor } from "../rules/bound.mjs";
import { createBoundActor, syncBoundFor } from "../documents/bound.mjs";
import { packCopy, packSystems, rawSystem, walkWorld } from "./walk.mjs";
import { seedSpellEffects } from "../rules/spell-effects.mjs";

/**
 * The update for one weapon's raw system source, or null.
 * @param {object} raw          the stored system
 * @param {object|null} pack    the pack copy's system, where one exists
 * @param {object} [context]    `name` and `base` (the §20 flag) for a copy the pack lacks
 */
export function buildWeaponUpdate(raw, pack = null, { name = "", base = null } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  const held = raw.launcher ?? null;
  const known = pack?.launcher ?? classifyLauncher({ name, base }) ?? null;
  if (held === null && (known !== null || raw.launcher === undefined)) update["system.launcher"] = known;
  const fits = Array.isArray(raw.fits) ? raw.fits : null;
  if ((!fits || !fits.length) && Array.isArray(pack?.fits) && pack.fits.length) update["system.fits"] = [...pack.fits];
  else if (fits === null) update["system.fits"] = [];
  if (raw.ammunition === undefined) update["system.ammunition"] = null;
  return Object.keys(update).length ? update : null;
}

/**
 * The update for one spell's raw system source, or null: the three card
 * descriptors (2026-09-06), from the pack copy where the world spell is a
 * pack spell, else seeded off its own words. Stamped where absent only.
 */
export function buildSpellUpdate(raw, pack = null) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.applies !== undefined && raw.rider !== undefined && raw.onFail !== undefined) return null;
  const seeds = pack?.applies ? { applies: pack.applies, rider: pack.rider, onFail: pack.onFail } : (() => {
    const own = seedSpellEffects({ effect: raw.effect ?? "", duration: raw.duration ?? {}, target: raw.target ?? "", damage: raw.damage ?? {} });
    return {
      applies: own.applies ? { active: true, ...own.applies } : { active: false, changes: [], statuses: [] },
      rider: own.rider ?? { statuses: [], rating: null, mode: null },
      onFail: own.onFail ?? { resilience: null, statuses: [] }
    };
  })();
  const update = {};
  if (raw.applies === undefined) update["system.applies"] = seeds.applies;
  if (raw.rider === undefined) update["system.rider"] = seeds.rider;
  if (raw.onFail === undefined) update["system.onFail"] = seeds.onFail;
  return update;
}

/**
 * The update for one feature's raw system source, or null: the three fields
 * D-642 adds, stamped where absent. The stamps themselves - a talent's
 * patch, a talent's grant - arrive through the restamp every character
 * gets at world load (D-621), never here.
 */
export function buildFeatureUpdate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  if (!Array.isArray(raw.modifiedBy)) update["system.modifiedBy"] = [];
  if (!raw.bound || typeof raw.bound !== "object") update["system.bound"] = { kind: null, action: null };
  if (!raw.summons || typeof raw.summons !== "object") update["system.summons"] = { entries: [], count: 0, until: null };
  return Object.keys(update).length ? update : null;
}

/** The update for one creature's raw system source, or null: the bond's two numbers (D-643), stamped where absent. */
export function buildNpcUpdate(raw, packSystem = null) {
  if (!raw || typeof raw !== "object") return null;
  const update = {};
  if (typeof raw.damageBonus !== "number") update["system.damageBonus"] = 0;
  if (typeof raw.sunders !== "boolean") update["system.sunders"] = false;
  // A swarm's fields (D-646): one body by default, and 14's Swarm rider
  // copied from the pack entry onto a world copy that predates it.
  if (!raw.swarm || typeof raw.swarm !== "object") update["system.swarm"] = { members: null, of: null };
  // Every ability row carries a descriptor (D-647): prose only until the GM says otherwise.
  for (const key of ["creatureAbilities", "bossActions"]) {
    const rows = Array.isArray(raw[key]) ? raw[key] : [];
    if (rows.some(r => r && typeof r === "object" && (!r.automation || typeof r.automation !== "object"))) {
      update[`system.${key}`] = rows.map(r => (r && typeof r === "object" && !r.automation ? { ...r, automation: emptyAutomation() } : r));
    }
  }
  if (typeof raw.swarmNote !== "string") update["system.swarmNote"] = typeof packSystem?.swarmNote === "string" ? packSystem.swarmNote : "";
  // The Ward pair becomes the map (D-644). `migrateData` already reads the
  // pair at load, so the in-memory source shows no diff: the map is written
  // whole, which is what makes the stored shape move.
  if (raw.ward && typeof raw.ward === "object" && ("value" in raw.ward || "school" in raw.ward)) {
    update["system.ward"] = replaceWhole(wardMapOf(raw.ward));
  }
  return Object.keys(update).length ? update : null;
}

/** Replace a map whole where core's operator exists; the plain map under Vitest. */
function replaceWhole(value) {
  return globalThis.foundry?.data?.operators?.ForcedReplacement?.create?.(value) ?? value;
}

export async function migrate(log = console.log) {
  const weapons = await packSystems("azeroth-rpg.weapons");
  const bestiary = await packSystems("azeroth-rpg.bestiary");
  const spells = await packSystems("azeroth-rpg.spells");
  const walked = await walkWorld({
    actor: doc => (doc.type === "npc" ? buildNpcUpdate(rawSystem(doc), packCopy(bestiary, rawSystem(doc), doc.name)) : null),
    item: doc => {
      const raw = rawSystem(doc);
      if (doc.type === "weapon") {
        return buildWeaponUpdate(raw, packCopy(weapons, raw, doc.name), {
          name: doc.name, base: doc.flags?.["azeroth-rpg"]?.base ?? null
        });
      }
      if (doc.type === "feature") return buildFeatureUpdate(raw);
      if (doc.type === "spell") return buildSpellUpdate(raw, packCopy(spells, raw, doc.name));
      return null;
    }
  }, log);
  await bindLegacyKnown(log);
  return walked;
}

/** The bestiary pack's uuid prefix: a `known` entry still pointing at it is a pick made before the bound door (D-643). */
export const BESTIARY_PREFIX = "Compendium.azeroth-rpg.bestiary.";

/** The `known` entries of a feature that still point at 14's pack rather than a world actor. */
export function legacyKnown(known = []) {
  return (Array.isArray(known) ? known : []).filter(k => typeof k?.uuid === "string" && k.uuid.startsWith(BESTIARY_PREFIX));
}

/**
 * A companion, demon, elemental or totem picked before D-643 was a compendium
 * uuid on the feature and no actor. Make the actor the door would have made,
 * bound, and point the feature at it (D-649). Runs on the GM's client, once.
 */
export async function bindLegacyKnown(log = console.log) {
  let bound = 0;
  for (const owner of game.actors.filter(a => a.type === "character")) {
    let touched = false;
    for (const feature of owner.items.filter(i => i.type === "feature")) {
      const binding = bindingFor({ name: feature.name, choice: feature.system?.choice ?? null });
      if (!binding) continue;
      const legacy = legacyKnown(feature.system?.known);
      if (!legacy.length) continue;
      const kept = (feature.system.known ?? []).filter(k => !legacy.includes(k)).map(k => ({ uuid: k.uuid, name: k.name }));
      await feature.update({ "system.known": kept });
      for (const k of legacy) {
        const entry = await fromUuid(k.uuid);
        if (!entry) {
          log(`azeroth-rpg | 0.11.0: ${owner.name}'s ${feature.name} names ${k.name}, which 14 no longer holds`);
          continue;
        }
        const made = await createBoundActor({ owner, feature, entry, kind: binding.kind, until: binding.until ?? null, uncounted: Boolean(binding.uncounted) });
        log(`azeroth-rpg | 0.11.0: bound ${made.name} to ${owner.name} as ${binding.kind}`);
        bound++;
        touched = true;
      }
    }
    if (touched) await syncBoundFor(owner);
  }
  return bound;
}
