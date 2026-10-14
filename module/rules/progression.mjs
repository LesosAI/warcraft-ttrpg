import { AZEROTH } from "../config.mjs";

/**
 * Progression: levels, tiers, Proficiency, Health and the class pools.
 *
 * Pure functions, no Foundry imports (CLAUDE.md §3). Everything here takes
 * plain objects so it can be tested without a running game.
 *
 * THE RULE THAT BREAKS THIS FILE IF FORGOTTEN: a character holds up to two
 * classes and every derived value reads the whole array. `classes[0]` alone is
 * the most likely bug in this system (CLAUDE.md §4, D2 §2.2).
 */

const POWER_FLAT = AZEROTH.POWER_FLAT;
const MANA_BY_BAND = AZEROTH.MANA_BY_BAND;

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 20;

/**
 * Tier by level (05 §1, D-297). 02 §6's advancement table agrees since the
 * 2026-09-01 reconciliation; it had read 2-5 / 6-10 and was the only document
 * putting tier 2 at level 6.
 */
export function tierForLevel(level) {
  const l = clampLevel(level);
  if (l <= 4) return 1;
  if (l <= 10) return 2;
  if (l <= 15) return 3;
  return 4;
}

/** The level a tier runs to. Index 0 is tier 1. */
export const TIER_TOP = Object.freeze([4, 10, 15, 20]);

/**
 * The tier a second class runs at: ONE BELOW THE CHARACTER'S, FLOORED AT 1.
 *
 * 02 §10 - "it grants its level 1 features at once, then runs one tier behind".
 * The lead's ruling fixes the arithmetic as tier minus one with a floor: 4 to 3,
 * 3 to 2, 2 to 1, and 1 to 1. A tier 1 character's second class is not tier 0.
 */
export function secondaryTier(tier) {
  return Math.max(1, Math.min(4, Math.trunc(tier) || 1) - 1);
}

/**
 * The level a second class functions at, given the character's level.
 *
 * The tier is the rule; the level is what a band table needs, so this is the
 * top of that tier - capped by the character's own level, because a level 3
 * character's second class cannot be running at level 4.
 */
export function secondaryLevel(characterLevel) {
  const level = clampLevel(characterLevel);
  return Math.min(level, TIER_TOP[secondaryTier(tierForLevel(level)) - 1]);
}

/** Proficiency Bonus by level: +2 / +3 / +4 / +5 across the four tiers (05 §1). */
export function proficiencyBonus(level) {
  return tierForLevel(level) + 1;
}

/**
 * Fortitude accumulated by a given level (05, D1 §3):
 * +2 a level at 2-10, +1 a level at 11-20. Level 1 grants none.
 */
export function fortitudeAt(level) {
  const l = clampLevel(level);
  return 2 * Math.max(0, Math.min(l, 10) - 1) + Math.max(0, l - 10);
}

/** Frame Base by class frame (05, D1 §3). */
export const FRAME_BASE = Object.freeze({ slight: 10, standard: 11, hardy: 13 });

/**
 * Health maximum: Frame Base + Constitution modifier + Fortitude, plus
 * anything armor, talents or provenance gear grant.
 *
 * The frame comes from the PRIMARY class (index 0). A multiclass does not add
 * a second frame — 02 §10 grants the second class its features, not a second
 * body.
 */
export function healthMax({ frame = "standard", conMod = 0, level = 1, bonus = 0 } = {}) {
  const base = FRAME_BASE[frame] ?? FRAME_BASE.standard;
  return Math.max(1, base + conMod + fortitudeAt(level) + bonus);
}

/**
 * The character's level. Levels are granted to the character, not bought per
 * class (02 §9), so this is the highest level across the class array rather
 * than a sum — two classes do not make a level 20 character out of 10 and 10.
 */
export function characterLevel(classes = []) {
  const levels = classes.map(c => clampLevel(c?.level ?? LEVEL_MIN));
  return levels.length ? Math.max(...levels) : LEVEL_MIN;
}

/** The character's tier, from the character's level. */
export function characterTier(classes = []) {
  return tierForLevel(characterLevel(classes));
}

/**
 * The pools a character holds, aggregated across every class.
 *
 * 05 §11: a class carries Momentum, Power, both or neither, and THE CAP COMES
 * FROM THE CLASS (D-507) — 10 for Rage, Zeal and Ferocity, 5 for Quarry and
 * Combo Points. A multiclass may hold one from each side: Rage from the Warrior
 * half and Mana from the Priest half.
 *
 * `classItems` are the class documents' system data, each optionally carrying
 * `momentum: {name, max}` and `power: {name, max}`. Nothing is read from a
 * constant here; a class that names no pool contributes none.
 *
 * @returns {{momentum: {name: string, max: number}|null, power: {name: string, max: number}|null}}
 */
/**
 * `system.classes[]` with a class entry added.
 *
 * Two entries at most (02 §10); index 0 is the primary. An entry for an item
 * already held replaces that entry in place rather than doubling it. Pure and
 * non-mutating: the actor hook that calls this is the one place a class writes
 * the array, and it wants a value it can hand straight to `update()`.
 *
 * @throws {Error} when a third class is offered.
 */
export function addClassEntry(classes = [], entry) {
  const i = classes.findIndex(c => c?.itemId === entry.itemId);
  if (i >= 0) return classes.map((c, j) => (j === i ? { ...c, ...entry } : { ...c }));
  if (classes.length >= 2) throw new Error("a character holds two classes at most (02 \u00a710)");
  return [...classes.map(c => ({ ...c })), { ...entry }];
}

/** `system.classes[]` without the entry for an item; the survivor is primary. */
export function removeClassEntry(classes = [], itemId) {
  return classes.filter(c => c?.itemId !== itemId).map(c => ({ ...c }));
}

/**
 * `system.classes[]` at a new character level.
 *
 * 02 §9: a level is granted to the CHARACTER, and the whole party takes it at
 * once. The primary entry carries it; a second class is stored at the level
 * it functions at (02 §10, `secondaryLevel`), so what is written agrees with
 * what `#classItems` derives and `characterLevel` - the max across the array
 * - reads the level that was set. Pure and non-mutating; clamps to 1..20.
 */
export function setCharacterLevel(classes = [], level) {
  const l = clampLevel(level);
  return classes.map((c, i) => ({ ...c, level: i === 0 ? l : secondaryLevel(l) }));
}

/**
 * The class features a level has reached, in level order, and the first one
 * still ahead (02 §6: features arrive at 1, 5, 9, 11, 14, 17 and 20).
 *
 * @param {{level: number, name: string}[]} features
 * @param {number} level  The level the class functions at.
 * @returns {{unlocked: object[], next: object|null}}
 */
export function featuresUnlocked(features = [], level = 1) {
  const l = clampLevel(level);
  const sorted = [...features].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  return {
    unlocked: sorted.filter(f => (f.level ?? 1) <= l),
    next: sorted.find(f => (f.level ?? 1) > l) ?? null
  };
}

export function poolsFor(classItems = [], level = 1) {
  // Momentum: 02 §7 PRINTS the cap, so the class carries it (D-507).
  //
  // ONE POOL PER CLASS, like Power. A multiclass whose two classes name
  // different Momentum resources holds BOTH - a Warrior/Rogue has Rage at 10
  // and Combo Points at 5, not one pool at the primary's cap. This kept only
  // the first until the lead ruled on it; 05 §11's "whichever of these you
  // have" reads as naming the resource, not as merging two of them.
  const momenta = [];
  for (const item of classItems) {
    const pool = item?.momentum;
    if (!pool?.name || !Number.isFinite(pool.max)) continue;
    momenta.push({
      name: pool.name,
      max: pool.max,
      level: clampLevel(item?.level ?? level),
      itemId: item?.itemId ?? item?._id ?? null
    });
  }

  // Power: ONE POOL PER CLASS, not one per character.
  //
  // 02 §10 is flat about it - "Each class keeps its own Power pool and casting
  // chart. There is no combined caster." This used to `break` on the first
  // match like Momentum does, which silently dropped the second pool. That is
  // not an edge case: EIGHT OF THE NINE CLASSES CARRY POWER, so 28 of the 36
  // possible pairings are double-Power and a Mage/Rogue was getting Mana and
  // no Energy at all.
  //
  // The level is per class, because 02 §10's second class runs behind the
  // first and Mana comes off a band table. A class entry that carries no level
  // falls back to the character's.
  const powers = [];
  for (const item of classItems) {
    const pool = item?.power;
    if (!pool?.name) continue;
    const at = clampLevel(item?.level ?? level);
    const base = Number.isFinite(pool.max)
      ? pool.max
      : powerMax(pool.name, at, pool.caster ?? "full");
    // A pool with no published size is a fault worth seeing, not a zero worth
    // drawing - powerMax returns null and the pool is left out.
    if (base === null) continue;
    // 02 §6: "Add your casting ability modifier to your Mana." The class item
    // carries the modifier the actor read off its casting ability (D-636);
    // Focus and Energy are flat and take none. Never below zero.
    const mod = pool.name === "mana" ? (Math.trunc(Number(item?.castingMod)) || 0) : 0;
    const max = Math.max(0, base + mod);
    powers.push({
      name: pool.name,
      max,
      caster: pool.caster ?? null,
      level: at,
      itemId: item?.itemId ?? item?._id ?? null
    });
  }

  return {
    momenta,
    powers,
    // The primary class's pools. Kept so a caller that only ever draws one
    // pool - a chat card, a macro - kept working when these went plural.
    momentum: momenta[0] ?? null,
    power: powers[0] ?? null
  };
}

/**
 * The maximum of a Power pool. Mana comes off 02 §6's band table and the
 * caster grade; Focus and Energy are flat (05 §11).
 *
 * Returns null for a pool with no published size, which is a fault worth
 * seeing rather than a zero worth drawing.
 */
export function powerMax(name, level = 1, caster = "full") {
  if (name !== "mana") return POWER_FLAT[name] ?? null;
  if (caster === "none") return null;
  const l = clampLevel(level);
  const band = MANA_BY_BAND.find(b => l <= b.maxLevel) ?? MANA_BY_BAND.at(-1);
  return caster === "half" ? band.half : band.full;
}

/**
 * Clamp a pool's current value to the cap its class sets. Returns the value
 * unchanged when the character holds no such pool, because a pool nobody has
 * is not a pool at zero — the sheet draws an em-dash for it (D-509).
 */
export function clampPool(value, pool) {
  if (!pool) return null;
  return Math.max(0, Math.min(Math.trunc(value ?? 0), pool.max));
}

/**
 * The schools a character may learn from, across every class.
 * A caster never adds a school by study (07 §1); multiclassing adds the second
 * class's schools to the first's, and each spell gates on the tier of the class
 * that granted it (02 §10).
 */
export function schoolsFor(classItems = []) {
  const out = new Set();
  for (const item of classItems) for (const s of item?.schools ?? []) out.add(s);
  return [...out];
}

/**
 * Hostile pairings cost more than XP (02 §10): Holy and Fel, Nature and Shadow,
 * Arcane and Fel. Returns the pairings a character's schools actually trip.
 */
/**
 * The levels EVERY class grants a feature at (02 §6).
 *
 * > *Class features arrive at levels 1, 5, 9, 11, 14, 17 and 20, and the
 * > Paladin and the Warlock each take one more at level 15, and the Rogue one
 * > more at level 4.*
 *
 * The seven common rungs, with the exceptions kept beside them rather than
 * folded in: a flat union cannot say that a Mage granting a feature at 15 is a
 * fault while a Paladin doing so is the rule.
 */
export const FEATURE_LADDER = Object.freeze([1, 5, 9, 11, 14, 17, 20]);

/**
 * The rungs 02 §6 gives to one class and not to the others, **keyed by class
 * identifier** as `rules/class-features.mjs` is.
 *
 * It was `LEVEL_15_CLASSES`, a list of two names, which could say only that a
 * class took *the* extra level. D-712 gives the Rogue one at **4** and the
 * shape had to change with it. `tools/parse-book/character-options.mjs` holds
 * the same table by display name and throws on a class that lands anywhere
 * else; this is the half `module/` reads, and `feature-levels.test.mjs` holds
 * both against the chapter's own sentence.
 */
export const EXTRA_FEATURE_LEVELS = Object.freeze({
  paladin: Object.freeze([15]),
  warlock: Object.freeze([15]),
  rogue: Object.freeze([4])
});

/** The levels one class grants a feature at: the ladder plus its own extras. */
export function featureLevelsFor(identifier) {
  const extra = EXTRA_FEATURE_LEVELS[String(identifier ?? "").toLowerCase()] ?? [];
  return [...new Set([...FEATURE_LADDER, ...extra])].sort((a, b) => a - b);
}

/**
 * Every level ANY class grants a feature at: the union, for a check that has
 * to ask *is this rung a rung at all* without knowing the class.
 *
 * **It is not what a class grants at**, and taking it for that is how the
 * DataModel's own copy came to omit the 15 and sit there unread (the lead,
 * 2026-09-07); `ClassData.FEATURE_LEVELS` re-exported this one afterwards and
 * nothing read that either, so it is gone. `featureLevelsFor(identifier)` is
 * the per-class answer and the one the census asks.
 */
export const FEATURE_LEVELS = Object.freeze(
  [...new Set([...FEATURE_LADDER, ...Object.values(EXTRA_FEATURE_LEVELS).flat()])].sort((a, b) => a - b)
);

export const HOSTILE_PAIRINGS = Object.freeze([
  Object.freeze(["holy", "fel"]),
  Object.freeze(["nature", "shadow"]),
  Object.freeze(["arcane", "fel"])
]);

/**
 * What holding a hostile pairing costs, and on which track (10 §7).
 *
 * > *A character holding two classes in hostile schools is exposed once per
 * > Long Rest, at DC 15, to the track named below.*
 *
 * | Holy and Fel | Fel | | Arcane and Fel | Fel | | Nature and Shadow | Void |
 *
 * The pairing detection was built and correct and **nothing ever consumed
 * it**: no Long Rest, no anything, so the cost was detected and never charged
 * (the lead, 2026-09-07). That is Tainted country's rate, and it runs from the
 * day the second class is taken.
 */
/** The key `HOSTILE_TRACK` is read by: sorted, so the pair's order cannot matter. */
export function pairingKey(pair = []) {
  return [...pair].map(s => String(s).toLowerCase()).sort().join("+");
}

export const HOSTILE_TRACK = Object.freeze(Object.fromEntries([
  // Built THROUGH `pairingKey` rather than typed in its sorted form: written
  // by hand as `holy+fel` the lookup silently missed, because the key the
  // function makes is `fel+holy` and a missing key is an exposure that does
  // not happen.
  [pairingKey(["holy", "fel"]), "fel"],
  [pairingKey(["arcane", "fel"]), "fel"],
  [pairingKey(["nature", "shadow"]), "void"]
]));

/** 10 §7: the same DC as Tainted country. */
export const HOSTILE_EXPOSURE_DC = 15;

export function hostilePairings(classItems = []) {
  const schools = new Set(schoolsFor(classItems));
  return HOSTILE_PAIRINGS.filter(([a, b]) => schools.has(a) && schools.has(b))
    .map(pair => [...pair]);
}

/**
 * The exposures a Long Rest owes, one per pairing held.
 *
 * @param {Array<string[]>} pairings  what `hostilePairings` returned
 * @returns {Array<{pair: string[], track: string, dc: number}>}
 */
export function hostileExposures(pairings = []) {
  return (pairings ?? [])
    .map(pair => ({ pair: [...pair], track: HOSTILE_TRACK[pairingKey(pair)] ?? null, dc: HOSTILE_EXPOSURE_DC }))
    .filter(row => row.track !== null);
}

function clampLevel(level) {
  const n = Math.trunc(Number(level) || LEVEL_MIN);
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n));
}
