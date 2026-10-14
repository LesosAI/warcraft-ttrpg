/**
 * Armor. Pure functions, no Foundry imports (CLAUDE.md §3).
 *
 * "The category sets every Armor Point. A named suit differs in price, weight
 * and provenance and never in what it stops." (08 §8) A Cut then moves points
 * between locations and pays for it elsewhere.
 *
 * Armor mostly does not make you harder to hit: only leather adds Defense
 * (D-452). Everything else armor does, it does by location.
 */

import { AZEROTH } from "../config.mjs";

export const LOCATIONS = Object.freeze(["body", "head", "limb"]);

/** Categories carrying the Encumbering trait, which costs 5 feet of Speed (08 §8). */
export const ENCUMBERING_CATEGORIES = Object.freeze(["mail", "plate"]);
export const ENCUMBERING_SPEED_PENALTY = 5;

/**
 * The categories that are METAL ARMOR (07's Crucible: *wearing metal armor or
 * holding a metal weapon*, D-757): 08 §8's Mail and Plate. Studded leather is
 * leather under its rivets, and a shield is held rather than worn, so neither
 * answers - the table's line reads them.
 */
export const METAL_CATEGORIES = Object.freeze(["mail", "plate"]);

/**
 * **WHETHER A CREATURE IS WEARING METAL ARMOR**, off what it has equipped:
 * `true` where a worn suit is Mail or Plate, else `null` - never `false`,
 * because *or holding a metal weapon* has no field in 08 to answer it, and the
 * table judges that half (`area-ticks.mjs#ridersFor`).
 *
 * @param {Array<{type?: string, equipped?: boolean, shield?: boolean, category?: string|null}>} items
 * @returns {true|null}
 */
export function wearsMetal(items = []) {
  const worn = (items ?? []).some(i => i?.type === "armor" && i.equipped === true && i.shield !== true && METAL_CATEGORIES.includes(i.category));
  return worn ? true : null;
}

/**
 * **A SHIELD IN HAND**: an armor item that is a shield and is equipped (08 §8).
 * The one reading Shield of Faith's gate (`syncTalentEffects`) and the three
 * doors that re-sync it share (D-648, D-768): a shield equipped or set down, and
 * one created already in hand or deleted while held - which re-synced nothing
 * before, so deleting the shield left its Defense standing.
 *
 * @param {{type?: string, system?: {shield?: boolean, equipped?: boolean}}|null} item  a document or its plain data
 * @returns {boolean}
 */
export function isEquippedShield(item) {
  return item?.type === "armor" && Boolean(item.system?.shield) && Boolean(item.system?.equipped);
}

/**
 * The four Cut traits (08 §5). A Cut is armor-only and each one buys its Armor
 * Points with something: a Bane, a Speed cost, or points from another location.
 */
export const CUTS = Object.freeze({
  closed: {
    ap: { head: +1 },
    speed: 0,
    banes: ["perception"],
    note: "Bane on Perception Tests that use sight or hearing"
  },
  open: {
    ap: { head: -1 },
    speed: +5,
    banes: [],
    note: "Speed +5 feet",
    // "A suit whose category grants no Head Armor Points cannot be Open."
    requiresHeadAP: true
  },
  long: {
    ap: { limb: +1 },
    speed: 0,
    banes: ["athletics"],
    note: "Bane on Athletics Tests to climb or swim"
  },
  harnessed: {
    ap: { body: +1, limb: -1 },
    speed: 0,
    banes: [],
    note: "Body +1, Limb -1",
    forbiddenCategories: ["plate"] // "Never on plate."
  }
});

/**
 * The traits a suit carries because of its CATEGORY, not because of itself.
 *
 * 08 §8's category table gives Mail and Plate **Encumbering**, and that is the
 * only place it is written. A suit's own `system.traits` is what the suit
 * table's own column says, so Field plate stored an empty list and its sheet
 * printed no Traits row at all — the suit looked as though it had none, when
 * every plate suit in the book is Encumbering (the lead, 2026-09-07).
 *
 * DERIVED, never stamped on the item: the category is the single source and a
 * stored copy would be the duplication D-512 forbids. Anything the item
 * already carries is left out, so a §20 unique that names Encumbering itself
 * does not say it twice.
 *
 * @param {string} category
 * @param {string[]} [own]   the item's own stored traits
 * @returns {string[]} trait names, in 08's own spelling
 */
export function categoryTraits(category, own = []) {
  if (!ENCUMBERING_CATEGORIES.includes(category)) return [];
  const held = new Set((own ?? []).map(t => String(t).toLowerCase()));
  return held.has("encumbering") ? [] : ["encumbering"];
}

/** The category's printed Armor Points, before any Cut. */
export function baseArmorPoints(category) {
  const row = AZEROTH.ARMOR_AP[category];
  return row ? { ...row } : { body: 0, head: 0, limb: 0 };
}

/**
 * Whether a Cut may sit on a category. Returns a reason rather than a bare
 * false, because the sheet has to say why the option is unavailable.
 */
export function cutLegality(category, cut) {
  const spec = CUTS[cut];
  if (!spec) return { ok: false, reason: `no such Cut: ${cut}` };
  if (spec.forbiddenCategories?.includes(category)) {
    return { ok: false, reason: `${cut} is never on ${category}` };
  }
  if (spec.requiresHeadAP && baseArmorPoints(category).head <= 0) {
    return { ok: false, reason: `${category} grants no Head Armor Points, so it cannot be ${cut}` };
  }
  return { ok: true, reason: null };
}

/**
 * Armor Points by location for a suit: its category's row, moved by its Cuts.
 * Points never fall below 0 — a Cut takes what is there and no more.
 */
export function armorPoints(category, cuts = []) {
  const ap = baseArmorPoints(category);
  for (const cut of cuts) {
    if (!cutLegality(category, cut).ok) continue;
    for (const [location, delta] of Object.entries(CUTS[cut].ap)) {
      ap[location] = Math.max(0, (ap[location] ?? 0) + delta);
    }
  }
  return ap;
}

/**
 * What a suit adds to Defense. Only leather does (D-452, 08 §8), plus 1 for a
 * shield on top of whatever the suit gives.
 */
export function defenseFrom(category, { shield = false } = {}) {
  const fromSuit = AZEROTH.ARMOR_DEFENSE[category] ?? 0;
  return fromSuit + (shield ? AZEROTH.SHIELD_DEFENSE : 0);
}

/** Speed change from the suit: Encumbering costs 5 feet, an Open cut gives 5 back. */
export function speedModifier(category, cuts = []) {
  let mod = ENCUMBERING_CATEGORIES.includes(category) ? -ENCUMBERING_SPEED_PENALTY : 0;
  for (const cut of cuts) {
    if (cutLegality(category, cut).ok) mod += CUTS[cut].speed ?? 0;
  }
  return mod;
}

/** The skills a suit's Cuts put a Bane on, for the sheet to show. */
export function cutBanes(category, cuts = []) {
  const out = new Set();
  for (const cut of cuts) {
    if (!cutLegality(category, cut).ok) continue;
    for (const skill of CUTS[cut].banes) out.add(skill);
  }
  return [...out];
}

/** Everything a suit contributes, in one call. */
export function suitEffects(category, cuts = [], { shield = false } = {}) {
  return {
    armorPoints: armorPoints(category, cuts),
    defense: defenseFrom(category, { shield }),
    speed: speedModifier(category, cuts),
    banes: cutBanes(category, cuts),
    encumbering: ENCUMBERING_CATEGORIES.includes(category),
    illegalCuts: cuts.filter(c => !cutLegality(category, c).ok)
  };
}
