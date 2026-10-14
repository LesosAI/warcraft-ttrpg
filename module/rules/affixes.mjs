/**
 * Affixes: what a base item plus a prefix and a suffix makes (08 §6, D-377).
 *
 * "The book publishes the grammar. Foundry holds the catalogue." Foundry holds
 * it by GENERATING AN INSTANCE when somebody asks for one, not by storing the
 * cross-product: 183 base items × 27 prefixes × 49 suffixes is 242,109
 * documents, against a decision whose own words are "hundreds of legal items in
 * ~2 pages".
 *
 * Pure functions, no Foundry imports (CLAUDE.md §3).
 */

import { AZEROTH } from "../config.mjs";

/** 08 §2's rarity ladder and what each budget buys. */
export const RARITY_BUDGET = AZEROTH.RARITY_BUDGET;
export const PRICE_MULTIPLIER = AZEROTH.RARITY_PRICE_MULTIPLIER;

/** The budget bands, since Rare and Epic each span two points (08 §2). */
export const RARITY_BAND = Object.freeze({
  common: [0, 0],
  uncommon: [1, 1],
  rare: [2, 3],
  epic: [4, 5]
  // Legendary is not costed: it spends no budget and its entry prints a dash.
});

/* -------------------------------------------- */
/*  What an attribute suffix delivers (D-701)    */
/* -------------------------------------------- */

/**
 * 08 §6: **an attribute suffix costs the same wherever it is set and the
 * item's rarity says what it grants.**
 *
 * §6's two-rung table — *of the Bear* at one point, *of the Gronn* at two —
 * serves an Uncommon and a Rare and prices both at 08 §4's rate. An Epic and a
 * Legendary are *named individually* (§4's own Quality table) and grant +3 to
 * +5 for the same one or two points; the entry names the number inside that
 * band. **Nothing about §4's exchange rate moves and no beast name is
 * invented** — the suffix is the same suffix and the rarity is what changed.
 *
 * Three grades rather than two, because the band's middle is what a found
 * item's cohort rank reaches (`rules/classic-loot.mjs`): a line that dominates
 * its item AND tops its kind across the whole record earns the band's ceiling
 * where a line that only dominates its item earns the middle. Uncommon and
 * Rare repeat their second grade, so **nothing below Epic moves at all**.
 */
export const ATTRIBUTE_GRANT = AZEROTH.RARITY_ATTRIBUTE_GRANT;

/**
 * What one attribute suffix grants on an item of this rarity, at this grade.
 *
 * @param {string} rarity
 * @param {number} [grade]  1, 2 or 3; anything else is clamped into the band
 * @returns {number} the number the grant sentence prints, or 0 where the
 *   rarity grants nothing at all
 */
export function attributeGrant(rarity, grade = 1) {
  const row = ATTRIBUTE_GRANT[rarity];
  if (!Array.isArray(row) || !row.length) return 0;
  const g = Math.min(Math.max(Math.trunc(Number(grade)) || 1, 1), row.length);
  return row[g - 1] ?? 0;
}

/**
 * The BAND a rarity grants inside, as the chapter prints it: `[lo, hi]`.
 *
 * Its callers are the tests that hold the page and the packs against each
 * other — `affixes.test.mjs` reads §6's own table off the chapter and compares,
 * and `classic-pack.test.mjs` judges every find on disk by it. The book checker
 * reads the `RARITY_ATTRIBUTE_GRANT` table out of `config.mjs` as TEXT, since a
 * PowerShell script cannot import this (the shape `check-corruption.ps1` uses
 * for the three corruption tracks).
 */
export function attributeGrantBand(rarity) {
  const row = ATTRIBUTE_GRANT[rarity];
  if (!Array.isArray(row) || !row.length) return [0, 0];
  return [row[0], row[row.length - 1]];
}

/**
 * The COST rung a grade takes: 08 §6's one-point name, or the greater beast at
 * two. Grades 2 and 3 are the same suffix and the same two points; they differ
 * in what the item's entry says it grants, which is what a named item is for.
 */
export function attributeRung(grade = 1) {
  return (Math.trunc(Number(grade)) || 1) >= 2 ? 2 : 1;
}

/**
 * The grade a suffix CHOSEN BY HAND carries — in the Forge, in the affix
 * dialog, on a loot generator's row. There is no cohort to rank it against, so
 * the one-point name takes the band's floor and the greater beast its ceiling;
 * the middle belongs to the conversion, which has a rank to read.
 */
export function attributeGradeOf(affix) {
  const points = Number(affix?.points ?? affix?.cost ?? 1);
  return points >= 2 ? 3 : 1;
}

/** Whether an affix is one of 08 §6's six attribute suffixes. */
export function isAttributeAffix(affix) {
  return affix?.family === "attribute" || /^\+\d+\s+(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)$/i.test(String(affix?.grants ?? ""));
}

const ATTRIBUTE_SENTENCE = /^\+(\d+)(\s+(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))$/i;

/**
 * One grant sentence, restated at the rarity it is being set on. A sentence
 * that is not an attribute grant comes back unchanged, so a caller may hand
 * every sentence it holds through this one door.
 *
 * @param {string} text    `+1 Strength`
 * @param {string} rarity
 * @param {number} [grade]
 * @returns {string} `+3 Strength` on an Epic
 */
export function grantAtRarity(text, rarity, grade = 1) {
  const m = ATTRIBUTE_SENTENCE.exec(String(text ?? "").trim());
  if (!m) return String(text ?? "");
  const points = attributeGrant(rarity, grade);
  return points > 0 ? `+${points}${m[2]}` : String(text ?? "");
}

/** The number an attribute grant sentence names, or null where it is not one. */
export function attributePointsIn(text) {
  const m = ATTRIBUTE_SENTENCE.exec(String(text ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Whether a rarity may grant this many points of an attribute off a suffix of
 * this rung. Rung 1 buys the band's floor and rung 2 anything above it inside
 * the band; with no rung named, membership of the row is the whole test.
 */
export function attributeGrantAllowed(rarity, points, rung = null) {
  const row = ATTRIBUTE_GRANT[rarity];
  if (!Array.isArray(row) || !row.length) return false;
  if (rung === null || rung === undefined) return row.includes(points);
  return attributeRung(rung) === 1
    ? points === row[0]
    : row.slice(1).includes(points);
}

/**
 * The rarity a given spend buys. Returns null above Epic, because a spend past
 * 5 is not a Legendary — a Legendary is written for the item rather than bought
 * from the table (D-376).
 */
export function rarityForBudget(points) {
  for (const [rarity, [lo, hi]] of Object.entries(RARITY_BAND)) {
    if (points >= lo && points <= hi) return rarity;
  }
  return null;
}

/**
 * Whether an affix may sit on a base item, read off 08 §6's "Goes on" column.
 *
 * The column is prose and stays prose in the book; this interprets it rather
 * than asking the chapter to carry a second machine-readable copy of the same
 * fact (D3 §4).
 */
export function canGoOn(affix, item) {
  const goes = String(affix?.goesOn ?? "").toLowerCase();
  const type = item?.type;

  // A THING YOU USE UP TAKES NO ENCHANTMENT. 08 §6's affixes go on gear a
  // character keeps; a draught, a poison and a manual are spent, and *Sturdy*
  // on a Pamphlet is nonsense — the pamphlet is read once and gone. It slipped
  // through because most of §6 reads *anything worn or carried*, which a
  // pamphlet is (the lead, 2026-09-07).
  const use = item?.system?.use ?? null;
  if (use && use.kind && use.kind !== "none") return false;

  const traits = (item?.system?.traits ?? []).map(t => String(t).toLowerCase());
  const isShield = item?.system?.shield === true;
  const isArmor = type === "armor" && !isShield;
  const isWeapon = type === "weapon";
  const isRanged = isWeapon && item.system?.range !== null && item.system?.range !== undefined;
  const isMelee = isWeapon && !isRanged;

  // "Weapons carrying Impale" / "Weapons carrying Reload" — a named trait gate.
  const carrying = /carrying \*?\*?(\w+)/.exec(goes);
  if (carrying) {
    return isWeapon && traits.some(t => t.startsWith(carrying[1].toLowerCase()));
  }

  if (goes.includes("anything worn or carried")) return true;
  if (goes.includes("trade kit") && type === "gear") return true;

  const mentionsWeapon = goes.includes("weapon");
  const mentionsArmor = goes.includes("armor") || goes.includes("suit");
  const mentionsShield = goes.includes("shield");
  const mentionsWorn = goes.includes("worn thing");

  if (goes.includes("melee weapon")) return isMelee;
  if (goes.includes("ranged weapon")) return isRanged;

  if (isShield) return mentionsShield;
  if (isArmor) return mentionsArmor;
  if (isWeapon) return mentionsWeapon;
  if (type === "gear") return mentionsWorn;
  return false;
}

/**
 * Validate a proposed item: at most one prefix and one suffix, both legal on
 * the base, both affordable inside the rarity's budget, and neither below the
 * rarity its family requires.
 *
 * @returns {{ok: boolean, reason: string|null, budget: number, rarity: string|null}}
 */
export function validate({ base, prefix = null, suffix = null } = {}) {
  const fail = reason => ({ ok: false, reason, budget: 0, rarity: null });

  if (!base) return fail("no base item");

  // "An item carries at most one of each, whatever its rarity." A Legendary
  // carries as many as its entry prints, and is not generated here at all.
  for (const [affix, kind] of [[prefix, "prefix"], [suffix, "suffix"]]) {
    if (!affix) continue;
    if (affix.kind !== kind) return fail(`${affix.name} is a ${affix.kind}, not a ${kind}`);
    if (!canGoOn(affix, base)) return fail(`${affix.name} does not go on ${base.name}`);
  }

  const budget = (prefix?.cost ?? 0) + (suffix?.cost ?? 0);
  const rarity = rarityForBudget(budget);
  if (!rarity) return fail(`a spend of ${budget} buys no rarity below Legendary`);

  // Ward, Spellpower and Skill do not appear below Rare, by exception to §4's
  // overspend rule.
  for (const affix of [prefix, suffix]) {
    if (!affix?.minimumRarity) continue;
    const floor = RARITY_BAND[affix.minimumRarity]?.[0] ?? 0;
    if (budget < floor) {
      return fail(`${affix.name} does not appear below ${affix.minimumRarity}`);
    }
  }

  return { ok: true, reason: null, budget, rarity };
}

/**
 * The item's name. *Keen Longsword of the Bear* — readable back into its parts,
 * which is what makes a generated instance legible without a database.
 *
 * Whispering names its quarry inside the name and the parenthesis is part of
 * it: *Whispering (Undead) Longsword*.
 */
export function nameFor({ base, prefix = null, suffix = null } = {}) {
  const parts = [];
  if (prefix) parts.push(prefix.name);
  parts.push(base.name);
  if (suffix) parts.push(suffix.name);
  return parts.join(" ");
}

/**
 * The price. "The multiplier is the rule and the band is what it usually comes
 * to" (08 §2), so this applies the multiplier and leaves the band to the GM.
 * Returns null for a base item with no price — a Legendary is not sold.
 */
export function priceFor({ base, rarity }) {
  const cost = base?.system?.cost;
  if (cost === null || cost === undefined) return null;
  const multiplier = PRICE_MULTIPLIER[rarity];
  return multiplier === null || multiplier === undefined ? null : cost * multiplier;
}

/**
 * Build the instance. Returns the item data a GM would get, or null with a
 * reason when the combination is not legal.
 */
export function generate({ base, prefix = null, suffix = null } = {}) {
  const check = validate({ base, prefix, suffix });
  if (!check.ok) return { ok: false, reason: check.reason, item: null };

  const system = foundryClone(base.system);
  system.rarity = check.rarity;
  system.budget = check.budget;
  system.cost = priceFor({ base, rarity: check.rarity });

  // A prefix that is an enchantment adds its trait at Lesser grade; the
  // smith's three add a number instead.
  if (prefix) applyPrefix(system, prefix);
  // The RARITY the spend bought is what an attribute suffix delivers (D-701).
  // Below Epic the sentence is §6's own and this is the identity; a spend of 4
  // or 5 buys an Epic, and an Epic grants +3 to +5 for the same points.
  if (suffix) applySuffix(system, suffix, check.rarity);

  return {
    ok: true,
    reason: null,
    item: { name: nameFor({ base, prefix, suffix }), type: base.type, system }
  };
}

function applyPrefix(system, prefix) {
  if (prefix.enchantment) {
    system.traits = [...(system.traits ?? []), `${prefix.name} (Lesser)`];
    return;
  }
  // Sturdy +1 Fortitude, Honed +1 Damage Rating, Reinforced +1 Armor Point.
  if (/Damage Rating/i.test(prefix.grants) && system.rating !== null) system.rating += 1;
  // Reinforced: a Body Armor Point on a suit, a shield or barding (D-632).
  if (/Armor Point/i.test(prefix.grants) && system.category !== undefined) system.apBonus = (system.apBonus ?? 0) + 1;
  // Fortitude and Armor Points are derived elsewhere, so they ride as a grant
  // rather than being written into a stored number here.
  system.grants = [...(system.grants ?? []), prefix.grants];
}

function applySuffix(system, suffix, rarity) {
  system.grants = [...(system.grants ?? []), grantAtRarity(suffix.grants, rarity, attributeGradeOf(suffix))];
}

/** structuredClone is available in V14's runtime and in Node 17+. */
function foundryClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
