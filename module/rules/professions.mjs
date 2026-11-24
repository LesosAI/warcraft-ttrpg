/**
 * Professions (03-PROFESSIONS; D-1903 to D-1930). Pure functions, no Foundry
 * imports (CLAUDE.md §3).
 *
 * A character holds ONE profession, chosen at creation (D-1903). It gives the
 * cheap skills (D-1906: five fixed at tier 1, then two of four at each tier
 * after), it rises a tier with the character for nothing (D-1905), and it lets
 * the character gather and craft. Its Rank is bought with XP at the cheap rate
 * and is what a Craft Test rolls. **No Proficiency** reaches a Craft or a
 * Gathering Test (D-1926): ability modifier + Rank + the tool's rarity bonus.
 *
 * `PROFESSIONS` is the approved mockup's table (`docs/design/mockups/
 * professions-recipes.json`); `professions.test.mjs` holds it to
 * `docs/book/03-PROFESSIONS.md` once that chapter exists, and to the mockup's
 * JSON until then.
 */

import { AZEROTH } from "../config.mjs";
import { tierForLevel } from "./progression.mjs";

/** The tiers a profession runs through: the character's own four (D-1905). */
export const PROFESSION_TIERS = Object.freeze([1, 2, 3, 4]);

/** Five cheap skills fixed at tier 1 (D-1906). */
export const FIXED_SKILLS = 5;

/** Two picked at each later tier, of the four 03 section 2 lists there (D-1906). */
export const PICKS_PER_TIER = 2;

/** The tiers that owe a pick. */
export const PICK_TIERS = Object.freeze([2, 3, 4]);

/** 5 + 2 + 2 + 2: what a tier 4 character holds at the cheap rate (D-1906). */
export const SKILLS_AT_TIER_FOUR = FIXED_SKILLS + PICKS_PER_TIER * PICK_TIERS.length;

/** A new character starts at Rank 1, free (D-1917). */
export const STARTING_RANK = 1;

/**
 * The flag a character carries while it owes a profession (D-1916): set by
 * migration 0.17.0 on a character that held a career and no profession, and
 * removed when a profession arrives (`AzerothActor#_onCreateDescendantDocuments`).
 * The banner draws *Choose a profession* while it stands (the plan's M1).
 */
export const PROFESSION_OWED_FLAG = "professionOwed";

/**
 * The seven (D-1904, D-1917). `id` is the parser's slug of the name, which is
 * the identifier every pack document carries: the mockup's `wilderness` is
 * `wilderness-survival` here. `tool` is the gear item's identifier (D-1923):
 * one tool covers making and gathering. `skills` are 02 §8's keys
 * (`AZEROTH.skills`), five then four, four, four, all distinct (D-1906).
 * `gathers.family` is a key of `AZEROTH.gatherFamilies` and `gathers.skill`
 * the skill a Gathering Test rolls (D-1915, D-1926).
 */
export const PROFESSIONS = Object.freeze([
  row("blacksmithing", "Blacksmithing", "str", "ore", "athletics", "smiths-tools", {
    1: ["athletics", "tinkering", "warfare", "barter", "perception"],
    2: ["intimidation", "investigation", "handling", "survival"],
    3: ["archaeology", "insight", "persuasion", "streetwise"],
    4: ["leadership", "arcana", "performance", "seafaring"]
  }),
  row("leatherworking", "Leatherworking", "dex", "hide", "survival", "leatherworkers-tools", {
    1: ["survival", "handling", "stealth", "barter", "perception"],
    2: ["athletics", "tinkering", "streetwise", "sleightOfHand"],
    3: ["acrobatics", "insight", "persuasion", "warfare"],
    4: ["spiritLore", "leadership", "intimidation", "seafaring"]
  }),
  row("tailoring", "Tailoring", "dex", "cloth", "investigation", "tailors-kit", {
    1: ["sleightOfHand", "barter", "persuasion", "insight", "perception"],
    2: ["performance", "streetwise", "arcana", "deception"],
    3: ["investigation", "leadership", "stealth", "tinkering"],
    4: ["archaeology", "spiritLore", "intimidation", "medicine"]
  }),
  row("alchemy", "Alchemy", "int", "herb", "survival", "alchemists-kit", {
    1: ["medicine", "survival", "arcana", "investigation", "perception"],
    2: ["barter", "insight", "sleightOfHand", "spiritLore"],
    3: ["deception", "streetwise", "archaeology", "tinkering"],
    4: ["persuasion", "leadership", "stealth", "intimidation"]
  }),
  row("enchanting", "Enchanting", "int", "essence", "arcana", "enchanters-rod", {
    1: ["arcana", "investigation", "archaeology", "insight", "perception"],
    2: ["spiritLore", "barter", "persuasion", "tinkering"],
    3: ["deception", "performance", "medicine", "leadership"],
    4: ["intimidation", "streetwise", "warfare", "sleightOfHand"]
  }),
  row("engineering", "Engineering", "int", "ore", "athletics", "tinkers-kit", {
    1: ["tinkering", "investigation", "athletics", "barter", "perception"],
    2: ["warfare", "sleightOfHand", "streetwise", "seafaring"],
    3: ["arcana", "archaeology", "deception", "handling"],
    4: ["leadership", "intimidation", "persuasion", "acrobatics"]
  }),
  row("wilderness-survival", "Wilderness Survival", "wis", "fish", "survival", "survivalists-kit", {
    1: ["survival", "medicine", "seafaring", "handling", "perception"],
    2: ["stealth", "athletics", "insight", "barter"],
    3: ["spiritLore", "acrobatics", "persuasion", "streetwise"],
    4: ["leadership", "investigation", "performance", "warfare"]
  })
]);

function row(id, name, ability, family, skill, tool, skills) {
  return Object.freeze({
    id,
    name,
    label: AZEROTH.professions[id],
    ability,
    gathers: Object.freeze({ family, skill }),
    tool,
    skills: Object.freeze(Object.fromEntries(Object.entries(skills).map(([t, l]) => [t, Object.freeze([...l])])))
  });
}

/** Every profession by id. */
export const PROFESSION_BY_ID = Object.freeze(Object.fromEntries(PROFESSIONS.map(p => [p.id, p])));

/**
 * The four rungs (D-1912: Classic's titles, *Master* renamed *Artisan*). The
 * tier IS the character's tier (D-1905); `rank` is the Rank a profession
 * usually stands at by then (11's old 1/3/6/10), and nothing gates on it.
 */
export const RUNGS = Object.freeze([
  Object.freeze({ tier: 1, key: "apprentice", rank: 1, minLevel: 1, maxLevel: 4 }),
  Object.freeze({ tier: 2, key: "journeyman", rank: 3, minLevel: 5, maxLevel: 10 }),
  Object.freeze({ tier: 3, key: "expert", rank: 6, minLevel: 11, maxLevel: 15 }),
  Object.freeze({ tier: 4, key: "artisan", rank: 10, minLevel: 16, maxLevel: 20 })
]);

/** A tier held to 1..4. */
export function clampTier(tier) {
  const t = Math.trunc(Number(tier)) || 1;
  return Math.min(4, Math.max(1, t));
}

/** The rung a tier stands on. */
export function rungFor(tier) {
  return RUNGS[clampTier(tier) - 1];
}

/** The profession's tier: the character's tier, from the level (D-1905). */
export function professionTier(level) {
  return tierForLevel(level);
}

/**
 * A profession's skill lists, from a key, a `PROFESSIONS` row or an item's
 * `system` (which carries the same `skills {1..4}`). Null for nothing.
 */
export function skillListsOf(profession) {
  if (!profession) return null;
  const source = typeof profession === "string" ? PROFESSION_BY_ID[profession] : profession;
  const skills = source?.skills;
  if (!skills || typeof skills !== "object") return null;
  const out = {};
  for (const t of PROFESSION_TIERS) out[t] = Array.isArray(skills[t]) ? skills[t].filter(isSkill) : [];
  return out;
}

const isSkill = key => typeof key === "string" && Object.hasOwn(AZEROTH.skills, key);

/**
 * The picks made at one tier, read CLOSED: only skills that tier lists, each
 * once, two at most, in the order they were stored. A pick the list does not
 * name is ignored rather than honoured.
 */
export function picksAt(lists, picks, tier) {
  const listed = lists?.[tier] ?? [];
  const stored = Array.isArray(picks?.[tier]) ? picks[tier] : [];
  const out = [];
  for (const key of stored) {
    if (out.length >= PICKS_PER_TIER) break;
    if (listed.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * The skills at the cheap rate (D-1906): the profession's five, the picks
 * made at every tier the character has reached, and the skill a Human's
 * Adaptable names, which is ALWAYS cheap (02 §5). Replaces
 * the career's in-career list (D-1930). **The gate defaults closed**: a skill this
 * set does not name costs double (`xp.mjs#rankCost`).
 *
 * @param {object} o
 * @param {string|object|null} o.profession  a key, a PROFESSIONS row, or an item's system
 * @param {number} o.tier                     the character's tier
 * @param {object} o.picks                    {2: [...], 3: [...], 4: [...]}
 * @param {string|null} o.adaptable           the skill key Adaptable names
 * @returns {Set<string>}
 */
export function professionSkills({ profession = null, tier = 1, picks = null, adaptable = null } = {}) {
  const keys = new Set();
  const lists = skillListsOf(profession);
  if (lists) {
    for (const key of lists[1]) keys.add(key);
    const reached = clampTier(tier);
    for (const t of PICK_TIERS) {
      if (t > reached) break;
      for (const key of picksAt(lists, picks, t)) keys.add(key);
    }
  }
  if (isSkill(adaptable)) keys.add(adaptable);
  return keys;
}

/**
 * The tiers with picks still owed (D-1906), oldest first: `[{tier, owed}]`
 * where `owed` is how many of the two are still to choose.
 */
export function owedPicks({ profession = null, tier = 1, picks = null } = {}) {
  const lists = skillListsOf(profession);
  if (!lists) return [];
  const reached = clampTier(tier);
  const out = [];
  for (const t of PICK_TIERS) {
    if (t > reached) break;
    const held = picksAt(lists, picks, t).length;
    if (held < PICKS_PER_TIER) out.push({ tier: t, owed: PICKS_PER_TIER - held });
  }
  return out;
}

/**
 * Whether a skill may be ADDED as a pick at a tier, or why not, as a reason
 * code (`AZEROTH.professionRefusals`): no profession, the tier not reached,
 * not on that tier's list, already picked, or both picks made. Null where the
 * pick may be made.
 */
export function pickRefusal({ profession = null, tier = 1, picks = null, pickTier, skill } = {}) {
  const lists = skillListsOf(profession);
  if (!lists) return { reason: "noProfession" };
  const t = Math.trunc(Number(pickTier));
  if (!PICK_TIERS.includes(t)) return { reason: "notListed" };
  if (t > clampTier(tier)) return { reason: "tierLocked", tier: t, level: rungFor(t).minLevel };
  if (!lists[t].includes(skill)) return { reason: "notListed" };
  const held = picksAt(lists, picks, t);
  if (held.includes(skill)) return { reason: "held" };
  if (held.length >= PICKS_PER_TIER) return { reason: "full", tier: t };
  return null;
}

/**
 * **ONE PROFESSION AT A TIME, AND THE RANK COMES WITH YOU** (D-1903; 03 §4:
 * *the old Rank is kept*, D-1933). When a profession arrives on a character
 * that holds another, the newest is THE profession, every other is deleted,
 * and the new one takes the highest Rank any of them held, so a Rank 6 smith
 * who takes up Alchemy is a Rank 6 alchemist. The picks are not carried: the
 * new profession's lists are picked again at every tier reached.
 *
 * @param {{arriving: {id: string, system?: object}, held?: Array<{id: string, system?: object}>}} o
 * @returns {{keep: string, remove: string[], rank: number, rankChanged: boolean}}
 */
export function professionSwap({ arriving, held = [] } = {}) {
  const others = (held ?? []).filter(p => p && p.id !== arriving?.id);
  const own = Math.trunc(Number(arriving?.system?.rank));
  const ranks = [Number.isFinite(own) ? own : STARTING_RANK, ...others.map(p => Math.trunc(Number(p.system?.rank)) || 0)];
  const rank = Math.min(AZEROTH.RANK_MAX, Math.max(...ranks));
  return {
    keep: arriving?.id ?? null,
    remove: others.map(p => p.id).sort(),
    rank,
    rankChanged: rank !== (Number.isFinite(own) ? own : STARTING_RANK)
  };
}

/* -------------------------------------------- */
/*  The tool and the Test (D-1923, D-1926)       */
/* -------------------------------------------- */

/** What a tool's rarity adds to a Craft and a Gathering Test (D-1926). */
export const TOOL_BONUS = AZEROTH.toolBonus;

/** A tool is 1s at a market (D-1923); a better one costs the Forge's multiple. */
export const TOOL_BASE_COST = 100;

/** The bonus a tool of this rarity gives, or 0 for a rarity the table does not price. */
export function toolBonus(rarity) {
  return Number(TOOL_BONUS[rarity]) || 0;
}

/** A tool's price in copper by the Forge's multipliers (08 §4), null where unpriced. */
export function toolPrice(rarity = "common") {
  const m = AZEROTH.RARITY_PRICE_MULTIPLIER[rarity];
  return m === null || m === undefined ? null : TOOL_BASE_COST * m;
}

/**
 * **THE GRADED TOOLS** (D-1936; 08 §11's `Graded tool | Rarity | Profession |
 * Cost` tables, `docs/design/PROFESSIONS-08-FORMAT.md` §6): each of the seven
 * is sold four times, Common and three grades, named `<Grade> <tool>` so its
 * identifier is `<grade>-<tool identifier>`. The grade word and the rarity
 * always agree; the bonus is read off the CARRIED item's `system.rarity`, so a
 * Forge-made or found Uncommon tool counts as a Fine one does.
 */
export const TOOL_GRADES = Object.freeze({ fine: "uncommon", superior: "rare", masterwork: "epic" });

/** Every identifier a profession's tool is sold under, Common first. */
export function toolIdsOf(profession) {
  const tool = (typeof profession === "string" ? PROFESSION_BY_ID[profession] : profession)?.tool ?? null;
  if (!tool) return [];
  return [tool, ...Object.keys(TOOL_GRADES).map(g => `${g}-${tool}`)];
}

/** The profession a tool serves, by identifier, or null (`smiths-tools` and `fine-smiths-tools` are Blacksmithing's). */
export function toolProfession(identifier) {
  const id = String(identifier ?? "");
  return PROFESSIONS.find(p => toolIdsOf(p).includes(id))?.id ?? null;
}

/**
 * **THE TOOL A CHARACTER CARRIES FOR A PROFESSION** (D-1923, D-1926): the best
 * of every gear item it holds that is that profession's tool at any grade, by
 * the bonus its rarity gives, ties broken by id. Worn or kept, in a bag or
 * loose, it is carried. Only gear counts: a law handed the whole collection
 * must not read a talent or a feature (D-737).
 *
 * @param {Iterable<{id?: string, type?: string, system?: object}>} items
 * @param {string} profession
 * @returns {{item: object, rarity: string, bonus: number}|null}
 */
export function carriedTool(items = [], profession) {
  const ids = toolIdsOf(profession);
  if (!ids.length) return null;
  let best = null;
  for (const item of items ?? []) {
    if (item?.type !== "gear" || !ids.includes(item.system?.identifier)) continue;
    if ((Number(item.system?.quantity ?? 1) || 0) <= 0) continue;
    const rarity = item.system?.rarity ?? "common";
    const bonus = toolBonus(rarity);
    if (!best || bonus > best.bonus || (bonus === best.bonus && String(item.id ?? "") < String(best.item.id ?? ""))) {
      best = { item, rarity, bonus };
    }
  }
  return best;
}

/**
 * The parts either Test adds up, for the dialog's breakdown and the card:
 * `ability`, `rank` and, where the tool adds something, `tool`. There is no
 * `proficiency` part and a census in the test says so.
 */
export function bonusParts({ abilityMod = 0, rank = 0, toolRarity = null, toolCarried = true } = {}) {
  const parts = [
    { key: "ability", value: Math.trunc(Number(abilityMod)) || 0 },
    { key: "rank", value: Math.trunc(Number(rank)) || 0 }
  ];
  const tool = toolCarried ? toolBonus(toolRarity) : 0;
  if (tool) parts.push({ key: "tool", value: tool, rarity: toolRarity });
  return parts;
}

/* -------------------------------------------- */
/*  The item's stored shape                      */
/* -------------------------------------------- */

/**
 * A stored profession item made valid before a `choices` or a `min` can
 * refuse it at load (CLAUDE.md §15). **Only the keys present are touched, at
 * every depth**: `migrateData` runs over partial update data too, so
 * `update({"system.picks.2": ["stealth"]})` must not write over tiers 3 and 4.
 * Mutates and returns `source`.
 */
export function cleanProfession(source) {
  if (!source || typeof source !== "object") return source;
  if ("ability" in source && source.ability !== null && !Object.hasOwn(AZEROTH.abilities, source.ability)) source.ability = null;
  if ("gathers" in source) {
    const g = source.gathers;
    if (!g || typeof g !== "object") source.gathers = { family: null, skill: null };
    else {
      if ("family" in g && g.family !== null && !Object.hasOwn(AZEROTH.gatherFamilies, g.family)) g.family = null;
      if ("skill" in g && g.skill !== null && !isSkill(g.skill)) g.skill = null;
    }
  }
  if ("tools" in source) source.tools = Array.isArray(source.tools) ? source.tools.filter(t => typeof t === "string" && t) : [];
  if ("skills" in source) {
    const s = source.skills;
    if (!s || typeof s !== "object") source.skills = { 1: [], 2: [], 3: [], 4: [] };
    else for (const t of PROFESSION_TIERS) if (t in s || String(t) in s) s[t] = uniqueSkills(s[t]);
  }
  if ("picks" in source) {
    const p = source.picks;
    if (!p || typeof p !== "object") source.picks = { 2: [], 3: [], 4: [] };
    else for (const t of PICK_TIERS) if (t in p || String(t) in p) p[t] = uniqueSkills(p[t]).slice(0, PICKS_PER_TIER);
  }
  if ("rank" in source) {
    const r = Math.trunc(Number(source.rank));
    source.rank = Number.isFinite(r) ? Math.min(AZEROTH.RANK_MAX, Math.max(0, r)) : STARTING_RANK;
  }
  return source;
}

function uniqueSkills(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const key of list) if (isSkill(key) && !out.includes(key)) out.push(key);
  return out;
}
