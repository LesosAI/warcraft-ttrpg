/**
 * Gathering (D-1915, D-1926, D-1927). Pure functions, no Foundry imports
 * (CLAUDE.md §3).
 *
 * The lead: *"What can be gathered is selected by biome, the GM tells the
 * player what the biome is for them to select on the dropdown."* Once a biome
 * is picked, the materials of the profession's family found there are listed
 * at the tier and below (nothing above it is drawn, D-1927). A Gathering Test
 * is d20 + the gathering skill's ability modifier + that skill's Rank + the
 * tool's rarity bonus, never Proficiency (D-1926), against the material tier's
 * Standard DC, and yields 1 + SL on a success. On a defeated creature Skin,
 * Butcher and Salvage are the same Test; Enchanting's essence comes from
 * Disenchant on an Uncommon or better item, with Arcana, and takes no biome.
 *
 * **The biome table is DATA.** The parser builds it from the chapter; every
 * function here takes it as `table`, shaped
 * `{[biome]: {[family]: [{material, tier}]}}` with `material` an identifier.
 */

import { AZEROTH } from "../config.mjs";
import { PROFESSION_BY_ID, clampTier } from "./professions.mjs";

/**
 * The skill a family's Gathering Test rolls (D-1915, the lead's reading
 * confirmed in the mockup): ore Athletics; hides, herbs, fish and game
 * Survival; salvaged cloth Investigation; essence (Disenchant) Arcana.
 */
export const GATHER_SKILL = Object.freeze({
  ore: "athletics",
  hide: "survival",
  herb: "survival",
  fish: "survival",
  cloth: "investigation",
  essence: "arcana"
});

/** A material's Gathering DC: 05 §3's Standard DC at its tier. */
export function gatherDC(tier) {
  return AZEROTH.STANDARD_DC[clampTier(tier)];
}

const STONE = /stone$/;

/**
 * The nodes of one family in one biome at the tier and below (D-1927), sorted
 * by tier, ores before stones, then identifier (the mockup's `nodesFor`).
 * Essence takes no biome and returns nothing.
 *
 * @returns {Array<{material: string, tier: number, dc: number}>}
 */
export function gatherable({ biome, family, tier = 1, table = {} } = {}) {
  if (!family || family === "essence") return [];
  const t = clampTier(tier);
  const nodes = table?.[biome]?.[family] ?? [];
  return nodes
    .filter(n => n && typeof n.material === "string" && clampTier(n.tier) <= t)
    .map(n => ({ material: n.material, tier: clampTier(n.tier), dc: gatherDC(n.tier) }))
    .sort((a, b) => a.tier - b.tier
      || Number(STONE.test(a.material)) - Number(STONE.test(b.material))
      || a.material.localeCompare(b.material));
}

/**
 * Why a gather may not be rolled, as a code, or null: no profession or one
 * that gathers by Disenchant, the tool not carried (D-1923), no node picked,
 * a node above the tier (a guard: the sheet never draws one), no bag room.
 * Downtime never gates gathering (the plan's M8).
 */
export function gatherRefusal({ profession = null, toolCarried = false, node = null, tier = 1, room = true } = {}) {
  const p = PROFESSION_BY_ID[profession];
  if (!p) return { reason: "noProfession" };
  if (p.gathers.family === "essence") return { reason: "disenchantOnly" };
  if (toolCarried !== true) return { reason: "tool", tool: p.tool };
  if (!node) return { reason: "noNode" };
  if (clampTier(node.tier) > clampTier(tier)) return { reason: "tierLocked", tier: clampTier(node.tier) };
  if (room === false) return { reason: "room" };
  return null;
}

/** What a gather yields (D-1915): 1 + SL on a success, nothing on a failure. */
export function yieldFor(sl, success = true) {
  if (!success) return 0;
  return 1 + Math.max(0, Math.trunc(Number(sl)) || 0);
}

/* -------------------------------------------- */
/*  A defeated creature (D-1915)                 */
/* -------------------------------------------- */

/**
 * The three harvests on a defeated creature's banner: who may press each, on
 * what kind of creature, and the skill, as 11 section 11's table prints them
 * (`gathering.test.mjs` reads it): Skin and Butcher take a Beast, Salvage
 * takes cloth off a Humanoid.
 */
export const HARVEST = Object.freeze({
  skin: Object.freeze({ profession: "leatherworking", skill: "survival", family: "hide", kinds: Object.freeze(["beast"]) }),
  butcher: Object.freeze({ profession: "wilderness-survival", skill: "survival", family: "game", kinds: Object.freeze(["beast"]) }),
  salvage: Object.freeze({ profession: "tailoring", skill: "investigation", family: "cloth", kinds: Object.freeze(["humanoid"]) })
});

/**
 * The harvests a profession may press on a creature (D-1915): `[{kind,
 * skill, dc, tier}]`, the DC the creature tier's Standard DC. Nothing for a
 * creature not yet defeated, one already harvested, or the wrong type.
 *
 * @param {{type?: string, tier?: number, defeated?: boolean, harvested?: boolean}} creature
 * @param {string} profession
 */
export function harvestOn(creature, profession) {
  if (!creature || creature.defeated !== true || creature.harvested === true) return [];
  const tier = clampTier(creature.tier);
  return Object.entries(HARVEST)
    .filter(([, h]) => h.profession === profession && h.kinds.includes(creature.type))
    .map(([kind, h]) => ({ kind, skill: h.skill, family: h.family, tier, dc: gatherDC(tier) }));
}

/**
 * **THE MATERIALS A HARVEST MAY YIELD** (11 §11: *a material of that family at
 * the creature's tier, which the GM names from section 12*; the professions
 * review's minor 3): every material of the harvest's family whose OWN stamp is
 * that tier (`materials` is identifier -> `{family, tier, price}`, the gear
 * pack's stamps), cheapest first, identifier breaking a tie. A material with no
 * tier (a scorpid stinger, a clam) is never counted as tier 1, and the
 * derivation ladders are not read here: they name what a RECIPE derives from,
 * and they put Silk at tier 2 where 08 §17 and 11 §12 make Wool the tier 2 cloth.
 *
 * The door cannot decide among several: the GM names it, so the harvest asks
 * through the one chooser where more than one stands (`harvestMaterial`).
 *
 * @returns {string[]}
 */
export function harvestCandidates(kind, tier = 1, materials = {}) {
  const h = HARVEST[kind];
  if (!h) return [];
  const t = clampTier(tier);
  return Object.entries(materials ?? {})
    .filter(([, m]) => m?.family === h.family && m.tier !== null && m.tier !== undefined && clampTier(m.tier) === t)
    .sort(([a, x], [b, y]) => (Number(x.price) || 0) - (Number(y.price) || 0) || a.localeCompare(b))
    .map(([id]) => id);
}

/**
 * The material a harvest yields: the one the GM named where it is a candidate,
 * else the only candidate there is; null where the GM must still name one (or
 * none stands at that tier).
 */
export function harvestMaterial(kind, tier = 1, materials = {}, named = null) {
  const list = harvestCandidates(kind, tier, materials);
  if (named && list.includes(named)) return named;
  return list.length === 1 ? list[0] : null;
}

/* -------------------------------------------- */
/*  Disenchant                                   */
/* -------------------------------------------- */

/** Disenchant's DC by the item's rarity (the mockup's `DIS_DC`). */
export const DISENCHANT_DC = Object.freeze({ uncommon: 16, rare: 20, epic: 24 });

/** What it yields by rarity, 1 + SL of it on a success. */
export const DISENCHANT_YIELD = Object.freeze({ uncommon: "arcane-dust", rare: "lesser-magic-essence", epic: "greater-magic-essence" });

/** The skill Disenchant rolls. */
export const DISENCHANT_SKILL = "arcana";

/**
 * Why an item may not be disenchanted, as a code, or null: not an enchanter,
 * the tool not carried, a Common or a Legendary item, a thing used up, an item
 * equipped (take it off first).
 */
export function disenchantRefusal({ profession = null, toolCarried = false, item = null } = {}) {
  if (profession !== "enchanting") return { reason: "notEnchanter" };
  if (toolCarried !== true) return { reason: "tool", tool: PROFESSION_BY_ID.enchanting.tool };
  if (!item || !["weapon", "armor", "gear"].includes(item.type)) return { reason: "notItem" };
  if (!DISENCHANT_DC[item.system?.rarity]) return { reason: "rarity" };
  const use = item.system?.use;
  if (use && use.kind && use.kind !== "none") return { reason: "consumable" };
  if (item.system?.equipped === true) return { reason: "equipped" };
  return null;
}

/** The Test and the yield for an item: `{dc, skill, material}` or null. */
export function disenchantOf(item) {
  const r = item?.system?.rarity;
  if (!DISENCHANT_DC[r]) return null;
  return { dc: DISENCHANT_DC[r], skill: DISENCHANT_SKILL, material: DISENCHANT_YIELD[r] };
}
