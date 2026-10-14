/**
 * The Classic conversion law (D-685). Pure, no Foundry imports and no `fs`
 * (CLAUDE.md §3): the bases, the affixes, the zones' tiers and the cohorts all
 * arrive in `ctx`, and the tests read the packs.
 *
 * **The pack is a rendering of the vendored record through this module.** One
 * record in, one document out, deterministically: the same file converts to
 * the same bytes twice and shuffling the input changes nothing, because every
 * ordering here is on a stable key and the one number that depends on the
 * whole file — a weapon's rank inside its cohort — is read off a sorted list.
 *
 * The shape of a conversion, in order:
 *
 * 1. **`classify`** — what the thing IS: a base row off `BASES`, refined by
 *    the item's own name, its swing, whether it is a caster's, and the Effect
 *    trait a proc wants. **Effect traits are unpriced** (08 §4 has no row for
 *    one and §20 never adds one), so a crowd-control proc is carried by
 *    picking a base that already has the trait rather than by buying it.
 * 2. **`tierFor`** — 14 §14's index through `tierForLevel`, or `ZONES`' hand
 *    row where the index has no Boss in that place (A3).
 * 3. **`candidates`** — every WoW line 08 §4 can price, as a candidate with a
 *    cost and a weight. A line 08 cannot price is DROPPED with a reason or
 *    FLAGGED with its own words, never quietly rounded into something else.
 * 4. **`fill`** — the budget. Not a general knapsack: five slots, enumerated
 *    exhaustively over a bounded candidate list, scored on (Σ weight, spent,
 *    earliest line) and won by the argmax. Under the band, a second pass adds
 *    the least it can from a fixed ladder; still under, the record is refused
 *    rather than padded.
 * 5. **`signatureFor`** — 08 §20's Signature table, with the numbers scaled to
 *    the tier off D1 §4.4a and the durations on the book's own ladder.
 * 6. **the doc**, and the **legality gate**: every emitted document goes back
 *    through `forge.mjs#plan` with `spent === budget`, once per grant. A
 *    document the chapter would refuse is never emitted.
 *
 * **Nothing here invents content.** Where a line has no conversion its words
 * are quoted onto a Signature and the item is flagged for the lead's hand
 * (A9); where an assumption is in play the item records it in `how[]` and
 * carries a flag, so every assumption's scope is a number in the report.
 *
 * **The prefix slot holds ONE thing** — a School enchantment, a Craft
 * enchantment, or *Sturdy*. 08 §6 gives an item one prefix, and `+1 Fortitude`
 * IS the Sturdy prefix, so the plan's separate fortitude slot would have put
 * two prefixes on one item and `plan()` refuses that on anything but a
 * Legendary.
 */

import { attributeGrant, attributeRung, canGoOn } from "./affixes.mjs";
import { SIGNATURE_KINDS, bandFor, plan } from "./forge.mjs";
import { tierForLevel } from "./progression.mjs";
import { classifyLauncher } from "./ammunition.mjs";
import { baseArmorPoints } from "./armor.mjs";
import { bonusAtTier } from "./augments.mjs";
import { isWornSlot } from "./worn.mjs";
import { damageIn, parseTooltip } from "./classic-tooltip.mjs";
import { emptySignature, gate } from "./signatures.mjs";
import {
  ABILITY_NAMED, CONDITION_WORD, CREATURE_WORD, ENCHANT_OF_SCHOOL, OVERRIDES, REASON_TEXT,
  SCHOOL_OF_CLASS, SETS, STAT_MAP, SUMMON_ENTRY, TEMPLATES, USE_ATTRIBUTE, baseRowFor, zoneFor
} from "./classic-tables.mjs";

/* =============================================================== the caps */

/** 08 §20: Damage Rating stops at 9 and Armor Points at 8, named or not. */
export const RATING_CEILING = 9;
export const BODY_AP_CEILING = 8;

/**
 * A4: how far over its base a found item's number may go, by rarity. A Rare
 * buys one point of Damage Rating and an Epic two, which is 08 §4's own
 * exchange rate read against each band — a Rare spending its whole budget of 2
 * on Rating has nothing left — and §20's own conversions never exceed base +2
 * even on a Legendary.
 */
export const NUMBER_CAP = Object.freeze({ rare: 1, epic: 2 });

/**
 * A suit's Armor Point margin, which is tighter than a weapon's Rating: an
 * Armor Point is worth more than a point of Rating at every tier and §20's
 * nine named suits all sit at their category's own AP or one over it.
 */
export const SUIT_AP_CAP = Object.freeze({ rare: 1, epic: 1 });

/**
 * A shield's, counted on top of the 1 every §8 shield already carries, so the
 * ceiling is §20's Skullflame Shield at +2 and nothing goes past it.
 */
export const SHIELD_AP_CAP = Object.freeze({ rare: 1, epic: 1 });

/** The rank a number needs before it is offered at all, and for its second point. */
export const RANK_FOR_FIRST = 0.33;
export const RANK_FOR_SECOND = 0.8;
/** A shield is graded on a coarser rung: §8 gives every shield the same 1. */
export const RANK_FOR_SHIELD = 0.5;

/**
 * How many grants an item may carry. §6 gives a generated item one suffix;
 * §20 opens by putting a named item outside the affix system, and an Epic's
 * band of 4 to 5 has room for two one-point grants where a Rare's 2 to 3 does
 * not. Each is gated by its own `plan()` call, so neither rides free.
 */
export const GRANT_CAP = Object.freeze({ rare: 1, epic: 2 });

/**
 * D1 §4.4a's healing band by tier, which is what a `Use:` restoring Health or
 * granting temporary Health is priced against.
 */
export const HEAL_BY_TIER = Object.freeze({ 1: 6, 2: 8, 3: 11, 4: 13 });

/**
 * Mana, off 08 §12's own two draughts rather than out of the air: a mana
 * draught restores 6 and a greater one 12, so the tiers run between them.
 */
export const MANA_BY_TIER = Object.freeze({ 1: 6, 2: 8, 3: 10, 4: 12 });

/**
 * The WoW professions a `+N <Trade>` line names, to the skill 05 §3 carries.
 * A `null` is a WoW skill this game has no equivalent for — weapon skill,
 * Defense — and is flagged rather than mapped onto the nearest thing.
 */
export const SKILL_OF_PROFESSION = Object.freeze({
  Fishing: "Seafaring",
  Herbalism: "Survival",
  Skinning: "Survival",
  "First Aid": "Medicine",
  Lockpicking: "Sleight of Hand",
  Engineering: "Tinkering",
  Mining: "Tinkering",
  Blacksmithing: "Tinkering",
  Defense: null,
  Swords: null,
  Daggers: null,
  Axes: null,
  Maces: null,
  Bows: null,
  Guns: null,
  Staves: null,
  Polearms: null,
  Dodge: null,
  Parry: null
});

/**
 * The Effect trait a proc's condition is carried by, where 08 §5 has one. A
 * condition with no trait behind it — a slow, an armor break — becomes a
 * Signature instead, because 08 prices no Effect trait and inventing one is
 * content (CLAUDE.md §17).
 */
export const TRAIT_FOR_CONDITION = Object.freeze({
  stun: "Daze",
  bleed: "Bleed",
  knockback: "Shove",
  root: "Entangle",
  extraAttack: "Fast"
});

/* ============================================================ free traits */

/**
 * **A trait costs no budget and there is no limit on how many** (the lead,
 * 2026-09-09). 08 §5's limits table caps a MADE thing at one enchantment;
 * §20 already says a named item may carry more, and a found item is a named
 * item, so what a barrow left in a blade is not what a smith would put there.
 * `forge.mjs#plan` carries the exception as `found: true` and nothing else
 * changes: the FAMILY rules still hold, through `canGoOn` and the weapon rule
 * below.
 *
 * Every row here is a WoW line whose meaning is UNAMBIGUOUS. Anything else
 * stays flagged and goes in the report; reading intent into a line is
 * inventing content (CLAUDE.md §17).
 *
 * **Four of the lead's rows convert nothing and are not here**, because a
 * table row that matches nothing is code with no caller (D-681):
 *
 *  - *ranged range increase* → **Farshot**: no record says it.
 *  - *cannot be disarmed, returns to hand* → **Sure-grip**: the nearest line
 *    is *Disarm duration reduced by 50%* on the Death Grips, which is a
 *    reduction and not an immunity.
 *  - *light source, never dulls* → **Everbright**: no record says it.
 *  - *detects a creature type* → **Whispering (Type)**: no record says it,
 *    and the trait's own name carries a placeholder nothing could fill.
 */
export const TRAIT_FOR_LINE = Object.freeze({
  crit: "Keen",
  parry: "Balanced",
  blockValue: "Deflecting",
  blockChance: "Deflecting",
  armorPenetration: "Sundering",
  waterBreathing: "Buoyant",
  stealth: "Hushed"
});

/**
 * The trait a proc's condition puts on the weapon, over `TRAIT_FOR_CONDITION`'s
 * base-row list: an armor break is 08 §5's **Sundering**, which is a Bound
 * trait and so has no affix and no grade.
 */
export const TRAIT_FOR_PROC = Object.freeze({ ...TRAIT_FOR_CONDITION, sunder: "Sundering" });

/**
 * A proc whose sentence is life stolen off the blow: 08 §5's **Thirsting**,
 * the Bound trait for exactly that. Read narrowly — *Steals N life*, *drains
 * N health* — because *Restores 150 mana … when you kill* is a kill trigger
 * that heals nothing (the Spinal Reaper).
 */
export const LIFE_STEAL = /\b(?:steal|drain|leech)\w*\s+(?:up to\s+)?\d+(?:\s+to\s+\d+)?\s+(?:life|health)\b|\btransfers?\s+\d+\s+health\b/i;

/** 08 §5's Bound traits and Effect traits: found on a weapon, never worn. */
const WEAPON_ONLY = new Set(["Sundering", "Thirsting", "Daze", "Bleed", "Shove", "Entangle", "Fast"]);

/** The Signature template a condition with no base trait falls to. */
export const TEMPLATE_FOR_CONDITION = Object.freeze({
  slow: "T-slow",
  stun: "T-stun",
  root: "T-root",
  bleed: "T-bleed",
  knockback: "T-shove",
  sunder: "T-sunder"
});

/* ============================================================== ratings */

/**
 * **A CLASSIC COMBAT RATING, AS THE LEAD SETTLED IT** (2026-09-10, D-697).
 *
 * Nothing in 05 or 06 has a rating: to-hit is the Attack Test, and dodge,
 * parry, block and defense are Defense, a Reaction or Armor Points. So each
 * family is read onto the thing this system does have, once, here:
 *
 * | The WoW line | Becomes |
 * |---|---|
 * | hit rating, spell hit rating, expertise rating | `+N Attack` |
 * | dodge rating, defense rating | `+N Defense` |
 * | parry rating | a Boon on Parry Tests |
 * | haste rating | `+N Speed`, in feet |
 * | block rating, block value | 08 §20's own `blockBonus` |
 *
 * **The carrier is the Signature and never an affix.** 08 §6's pool sells
 * attributes, Fortitude, Spellpower, Ward and skill Boons and nothing else, so
 * `offerAbility` and `offerBoon` would drop every one of these as `noAffix`;
 * §20 prices a standing Signature carrying a grant sentence directly, and
 * `rules/grants.mjs#grantsFor` sums exactly these four scalars off it.
 *
 * **Spell penetration is NOT here, and that is the answer rather than a gap.**
 * It lowers the target's resistance, which is Ward, and no key in the
 * descriptor touches somebody else's Ward — so the eleven items that carry one
 * keep `reasonFor`'s own `noEquivalent`, because a descriptor that disagrees
 * with its own sentence is worse than none (D-692).
 */
export const RATING_SCALAR = Object.freeze({
  hit: "attack", spellHit: "attack", expertise: "attack",
  dodge: "defense", defense: "defense",
  parry: "parry",
  haste: "speed",
  blockChance: "block", blockValue: "block"
});

/** The template each family takes, and what ONE graded point is worth in it. */
export const RATING_TEMPLATE = Object.freeze({
  attack: "T-hit", defense: "T-guard", parry: "T-parry", speed: "T-haste", block: "T-block"
});

/**
 * **Speed's step is FIVE FEET.** A Signature costs 2 whatever its magnitude
 * (08 §20), so the rank does not buy the number — it grades it, and the grade
 * has to land on a rung the book already moves Speed in: 10-CORRUPTION takes
 * 5 and 10 feet off, 05 §10's load takes 5 and 15. One foot is not a number
 * this game says. Everything else is a flat +1 or +2, which is 08 §4's own
 * exchange rate for a point of anything.
 */
export const RATING_STEP = Object.freeze({ attack: 1, defense: 1, parry: 1, speed: 5, block: 1 });

/**
 * A rating run inside a sentence — a proc's, a `Use:`'s, or an `other` equip
 * line's — where the tooltip reader gave it no kind of its own.
 *
 * **Keyed on the words *X rating by N*, which is unambiguous**, rather than on
 * the verb in front of them: the record writes *Increases your haste rating
 * by 300*, *increase your haste rating by 505* and *Increases damage done by
 * 20 and haste rating by 50* for the same thing. A family this table does not
 * name — a critical strike rating, an armor penetration rating, a resilience
 * rating — matches nothing and keeps whatever it had.
 */
const RATING_RUN = /\b(spell hit|hit|haste|expertise|defense|dodge|parry|block) rating by (\d+)/i;

/** The tooltip `kind` a rating word answers to. */
const RATING_WORD = Object.freeze({
  "spell hit": "spellHit", hit: "hit", haste: "haste", expertise: "expertise",
  defense: "defense", dodge: "dodge", parry: "parry", block: "blockChance"
});

/**
 * The first rating a sentence names, as `{kind, value}`, or null.
 * @param {string} text
 */
export function ratingIn(text) {
  const m = RATING_RUN.exec(String(text ?? ""));
  if (!m) return null;
  const kind = RATING_WORD[m[1].toLowerCase()];
  return kind ? { kind, value: Number(m[2]) } : null;
}

/**
 * EVERY rating a record names, wherever it is written — a typed `Equip:` line,
 * an `other` line the reader could not type, a proc's sentence or a `Use:`'s.
 *
 * This is what `buildCohorts` ranks against, so a rating written inside a proc
 * counts towards the file's own distribution exactly as a plain `Equip:` line
 * does. **Whether a candidate is OFFERED is a separate question** and is
 * `ratingOffers`': a proc or a `Use:` the tables already read keeps what it
 * has, and the rating is only read where nothing else could read the line.
 *
 * @param {object} parsed  `parseTooltip`'s output
 * @returns {Array<{kind: string, value: number, index: number, raw: string}>}
 */
export function ratingLines(parsed) {
  const out = [];
  for (const line of parsed?.equips ?? []) {
    if (RATING_SCALAR[line.kind] && Number.isFinite(line.value)) {
      out.push({ kind: line.kind, value: line.value, index: line.index, raw: line.raw });
      continue;
    }
    if (line.kind !== "other") continue;
    const found = ratingIn(line.text ?? line.raw);
    if (found) out.push({ ...found, index: line.index, raw: line.raw });
  }
  for (const proc of parsed?.procs ?? []) {
    const found = ratingIn(proc.other ?? proc.raw);
    if (found) out.push({ ...found, index: proc.index, raw: proc.raw });
  }
  for (const use of parsed?.uses ?? []) {
    const found = ratingIn(use.text || use.raw);
    if (found) out.push({ ...found, index: use.index, raw: use.raw });
  }
  return out;
}

/** The Signature template a `Use:` kind falls to. */
export const TEMPLATE_FOR_USE = Object.freeze({
  buffAP: "T-use-dr",
  buffSpell: "T-use-spell",
  heal: "T-use-heal",
  absorb: "T-use-absorb",
  mana: "T-use-mana",
  armor: "T-use-armor",
  speed: "T-use-speed",
  freeAction: "T-use-free"
});

/**
 * Every flag code the conversion may raise, so the census holds a closed list
 * and a typo fails a test rather than hiding in the report. `line:<kind>` and
 * `signature:proposed:<template>` are parameterised and `isFlagCode` checks
 * their tails.
 */
export const FLAG_CODES = Object.freeze([
  "base:dagger", "base:relic", "base:none",
  "spellpower:school", "ward:allSchools", "skill:unknown",
  "signature:unwritten", "set:bonus",
  "budget:topUp", "budget:underBand",
  "zone:unknown", "cohort:none", "randomEnchantment", "plan"
]);

/** The tooltip equip kinds a `line:` flag may name. */
const LINE_KINDS = Object.freeze([
  "hit", "spellHit", "spellCrit", "crit", "haste", "expertise", "defense", "dodge",
  "parry", "blockChance", "blockValue", "resilience", "spellPenetration",
  "armorPenetration", "mp5", "hp5", "health", "mana", "armorBonus", "stealth",
  "speed", "skill", "waterBreathing", "rangedAttackPower", "attackPower",
  "spellDamage", "healing", "weaponDamage", "resistance", "other"
]);

/** Whether a code is one this module may raise. */
export function isFlagCode(code) {
  const s = String(code ?? "");
  if (FLAG_CODES.includes(s)) return true;
  if (s.startsWith("line:")) return LINE_KINDS.includes(s.slice(5));
  if (s.startsWith("signature:proposed:")) return Boolean(TEMPLATES[s.slice("signature:proposed:".length)]);
  return false;
}

/* ================================================================= tiers */

/**
 * The tier a record's zone sits at (A3).
 *
 * The zone comes from the drop where there is one and from the set roster
 * where there is not: a class-set piece carries `source.category: "Quest"` and
 * no zone of its own, and `SETS` is the only thing that says where the token
 * came from.
 *
 * @param {object} record  one row of the vendored file
 * @param {object} ctx     `{dungeonLevel: Map<dungeon, level>}` off 14 §14
 * @returns {{zone: object|null, tier: number}}
 */
export function tierFor(record, ctx = {}) {
  const ids = Array.isArray(record?.source?.zone) ? record.source.zone : [record?.source?.zone];
  let zone = null;
  for (const id of ids) {
    if (id === null || id === undefined) continue;
    zone = zoneFor(id);
    if (zone) break;
  }
  if (!zone) {
    const set = setNameOf(record);
    const id = set ? SETS[set] : null;
    if (id) zone = zoneFor(id);
  }
  if (!zone) {
    // Only a calibration record reaches this: every record in the vendored
    // pool resolves a zone, and the invariant test says so. An Epic with no
    // place is read at the top tier and anything else one rung down.
    return { zone: null, tier: record?.quality === "Epic" ? 4 : 3 };
  }
  if (zone.tier !== null && zone.tier !== undefined) return { zone, tier: zone.tier };
  const level = ctx?.dungeonLevel?.get?.(zone.dungeon) ?? null;
  return { zone, tier: level === null ? 4 : tierForLevel(level) };
}

/** The set a record's tooltip names, without parsing the whole thing. */
function setNameOf(record) {
  for (const line of record?.tooltip ?? []) {
    if (line?.format !== "Misc") continue;
    const m = /^(.+?) \(0\/(\d+)\)$/.exec(String(line.label ?? ""));
    if (m) return m[1];
  }
  return null;
}

/* ============================================================== classify */

/** Whether a record reads as a caster's: Intellect or spell power, and no Strength. */
export function isCaster(parsed) {
  const spell = (parsed?.equips ?? []).some(e => e.kind === "spellDamage" || e.kind === "healing" || e.kind === "mp5");
  return (Boolean(parsed?.stats?.intellect) || spell) && !parsed?.stats?.strength;
}

/** The Effect trait the item's first proc condition wants, or null. */
export function wantedTraitOf(parsed) {
  for (const proc of parsed?.procs ?? []) {
    const trait = TRAIT_FOR_CONDITION[proc.condition];
    if (trait) return trait;
  }
  return null;
}

/**
 * What the record becomes.
 *
 * @param {object} parsed  `parseTooltip`'s output
 * @param {object} ctx     `{bases: Map<name, doc>}`
 * @param {number} tier
 * @returns {object|null} the shape, or null where no base row claims it
 */
export function classify(parsed, ctx = {}, tier = 1) {
  const row = baseRowFor(parsed?.subclass, parsed?.slot);
  if (!row) return null;

  const name = String(parsed?.name ?? "");
  const wantedTrait = wantedTraitOf(parsed);
  const how = [];
  let baseName = row.rows[0].name;
  let because = "the plainest base of its kind";

  const augment = row.augment
    ? { className: row.augment.className, category: row.augment.category, bonus: bonusAtTier(tier) }
    : null;
  const named = row.byName?.find(([re]) => re.test(name)) ?? null;
  if (augment) {
    // A6: a relic is that class's Augment at the tier's own bonus.
    baseName = `${row.augment.category} (+${augment.bonus})`;
    because = `a ${augment.className}'s Augment at tier ${tier}`;
  } else if (named) {
    baseName = named[1];
    because = `its name says ${named[1].toLowerCase()}`;
  } else if (row.bySpeed && speedFits(row.bySpeed, parsed?.damage?.speed)) {
    baseName = row.bySpeed.name;
    because = `it swings at ${parsed.damage.speed}`;
  } else if (row.casterRow && isCaster(parsed)) {
    baseName = row.casterRow;
    because = "Intellect and no Strength: a caster's";
  } else if (row.epicRow && tier >= row.epicRow.tier && parsed?.quality === "Epic") {
    baseName = row.epicRow.name;
    because = `an Epic at tier ${tier}`;
  } else if (wantedTrait) {
    const carrier = row.rows.find(r => r.trait === wantedTrait);
    if (carrier) {
      baseName = carrier.name;
      because = `it carries ${wantedTrait}, which 08 §4 does not price`;
    }
  }
  how.push({ kind: "base", to: baseName, because });

  const base = ctx?.bases?.get?.(baseName) ?? null;
  const carried = row.rows.find(r => r.name === baseName)?.trait ?? null;
  const shape = {
    type: row.type,
    key: `${parsed?.subclass}|${parsed?.slot}`,
    baseName,
    base,
    grip: row.grip ?? null,
    category: row.category ?? null,
    shield: row.shield === true,
    // Upstream's `Off Hand` is a rule about the other hand, and it is the one
    // thing the base row cannot say: a sword filed there is the same sword.
    offHand: row.offHand === true || parsed?.slot === "Off Hand",
    augment,
    caster: isCaster(parsed),
    wantedTrait,
    traitCarried: wantedTrait && carried === wantedTrait ? wantedTrait : null,
    flag: row.flag ?? null,
    flagBase: row.flagBase ?? null,
    how
  };
  shape.launcher = shape.type === "weapon" ? classifyLauncher({ name, base: baseFlagOf(shape) }) : null;
  shape.worn = shape.type === "gear" && isWornSlot(base?.system?.slot) ? base.system.slot : null;
  return shape;
}

function speedFits(rule, speed) {
  if (speed === null || speed === undefined) return false;
  if (rule.max !== undefined) return speed <= rule.max;
  if (rule.min !== undefined) return speed >= rule.min;
  return false;
}

/** `flags.azeroth-rpg.base`, in §20's own vocabulary. */
export function baseFlagOf(shape) {
  if (!shape) return null;
  if (shape.augment) return `${shape.augment.category}, a ${shape.augment.className}'s Augment`;
  if (shape.flagBase) return shape.flagBase;
  return shape.grip ? `${shape.baseName}, ${shape.grip}` : shape.baseName;
}

/* ================================================================= ranks */

/**
 * The cohorts a number is ranked inside: a weapon against weapons on the same
 * base at its rarity and tier, a suit against suits of its category, a shield
 * against shields. **The rank is what makes a Damage Rating relative** — the
 * pool spans Ragefire Chasm to Naxxramas, and an absolute threshold would put
 * every Naxxramas blade at the ceiling and every Deadmines one at the floor.
 *
 * `stats` is the same idea over every attribute line in the file, and it is
 * what stops `+3 Stamina` on a lone ring reading as +2 Constitution: the share
 * says the line dominates ITS item, the rank says whether it is a real number.
 *
 * **`ratings` is the third, and it is what makes the lead's conversion honest**
 * (D-697). A hit rating of 50 out of Naxxramas and one of 7 out of Uldaman must
 * not land on the same number, and an absolute threshold — *20 hit rating is
 * +1 Attack* — is exactly the thing that would. It is keyed by the LINE'S OWN
 * KIND, file-wide, as `stats` is: hit, haste and expertise are three different
 * scales in the record and each is ranked inside its own.
 */
export function buildCohorts(entries = []) {
  const numbers = new Map();
  const stats = new Map();
  const ratings = new Map();
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const { parsed, shape, tier } of entries) {
    if (!shape) continue;
    const key = cohortKey(shape, parsed, tier);
    const value = numberOf(parsed, shape);
    if (key && value !== null) push(numbers, key, value);
    for (const [kind, n] of Object.entries(parsed?.stats ?? {})) push(stats, kind, n);
    for (const line of ratingLines(parsed)) push(ratings, line.kind, line.value);
  }
  for (const list of numbers.values()) list.sort((a, b) => a - b);
  for (const list of stats.values()) list.sort((a, b) => a - b);
  for (const list of ratings.values()) list.sort((a, b) => a - b);
  return { numbers, stats, ratings };
}

/** The cohort a shape ranks inside. */
export function cohortKey(shape, parsed, tier) {
  if (!shape) return null;
  if (shape.type === "weapon") return `w|${shape.baseName}|${parsed?.quality}|${tier}`;
  if (shape.type === "armor") return `a|${shape.shield ? "shield" : shape.category}|${parsed?.quality}|${tier}`;
  return null;
}

/** The number a shape is ranked on: a weapon's dps, a suit's or shield's armor. */
export function numberOf(parsed, shape) {
  if (!shape) return null;
  if (shape.type === "weapon") return parsed?.damage?.dps ?? null;
  if (shape.type === "armor") return parsed?.armor ?? null;
  return null;
}

/** The share of a sorted list that lies below a value; ties split the difference. */
export function rankIn(list, value) {
  if (!Array.isArray(list) || !list.length || value === null || value === undefined) return null;
  let below = 0;
  let equal = 0;
  for (const n of list) {
    if (n < value) below++;
    else if (n === value) equal++;
  }
  return (below + equal / 2) / list.length;
}

/* ============================================================ candidates */

/** A weight, rounded so two runs cannot disagree in the last bit. */
const w = n => Math.round(n * 1000) / 1000;

const capitalise = s => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);

/** The rungs of the top-up ladder, cheapest first (the plan's fixed order). */
const RUNG = Object.freeze({ fortitude: 1, attribute: 2, number: 3, quote: 4 });

/**
 * Every line 08 §4 can price, as a candidate.
 *
 * `slot` is which of the five it competes for, `cost` is 08 §4's own rate, and
 * `weight` is how much of the item's identity the line carries, so a budget
 * too small keeps the headline and drops the trimmings. A candidate marked
 * `topUp` is offered only in the second pass, when the first has landed under
 * the band's floor.
 *
 * @returns {{candidates: Array, dropped: Array, flagged: Array}}
 */
export function candidates(parsed, shape, tier, ctx = {}) {
  const out = [];
  const dropped = [];
  const flagged = [];
  const rarity = String(parsed?.quality ?? "").toLowerCase();
  const draft = draftFor(parsed, shape);
  const affixOf = name => ctx?.affixes?.get?.(name) ?? null;
  const affixGranting = text => [...(ctx?.affixes?.values?.() ?? [])].find(a => a.grants === text) ?? null;
  const flag = (code, line, note) => flagged.push({ code, line: line ?? null, note: note ?? null });
  const drop = (id, why, line) => dropped.push({ id, why, line: line ?? null });
  /**
   * Every `Equip:` line has to LAND somewhere — a candidate, a drop, or a flag
   * — and this is the ledger that says so. A line folded into another
   * candidate's weight (attack power behind a Damage Rating, defense behind an
   * Armor Point) is marked by hand, since it makes no candidate of its own.
   */
  const handled = new Set();
  const account = index => { if (typeof index === "number" && index >= 0) handled.add(index); };

  /* ---- the attribute lines, shared out over the item's own total ---- */
  const magnitudes = statMagnitudes(parsed);
  const total = Object.values(magnitudes).reduce((a, b) => a + b, 0);
  for (const [kind, value] of Object.entries(parsed?.stats ?? {})) {
    const ability = STAT_MAP[kind];
    if (!ability) continue;
    if (value <= 0) { drop(`stat:${kind}`, "penalty", `${value} ${kind}`); continue; }
    const share = total > 0 ? magnitudes[kind] / total : 0;
    const rank = rankIn(ctx?.cohorts?.stats?.get?.(kind), value) ?? 0;
    const grade = statGrade(share, rank);
    const weight = w(kind === "stamina" ? share * 0.5 : share);
    const from = { index: -1, raw: `+${value} ${capitalise(kind)}` };
    offerAbility(out, { affixOf, draft, ability, grade, rarity, weight, from, drop });
  }

  /* ---- the number: a weapon's Damage Rating, a suit's or shield's Armor Point ---- */
  const rank = rankIn(ctx?.cohorts?.numbers?.get?.(cohortKey(shape, parsed, tier)), numberOf(parsed, shape));
  if (rank === null && numberOf(parsed, shape) !== null) flag("cohort:none", null, cohortKey(shape, parsed, tier));
  const attackPower = (parsed?.equips ?? []).filter(e => e.kind === "attackPower" || e.kind === "rangedAttackPower");
  // A flat armor line is the same family as a defense one and belongs in the
  // same lift: a class set's `+200 Armor` is the suit stopping more (D-692).
  const guard = (parsed?.equips ?? []).filter(e => e.kind === "defense" || e.kind === "dodge" || e.kind === "armorBonus");
  const lift = (attackPower.length ? 0.3 : 0) + (guard.length && shape?.type === "armor" ? 0.5 : 0);

  if (shape?.type === "weapon" && Number.isFinite(draft.system.rating)) {
    const cap = Math.max(0, Math.min(NUMBER_CAP[rarity] ?? 0, RATING_CEILING - draft.system.rating));
    const graded = shape.caster ? 0 : pointsForRank(rank, cap);
    if (shape.caster) drop("rating", "caster", "a caster's weapon spends nothing on the swing");
    const from = { index: -1, raw: `${parsed?.damage?.min}-${parsed?.damage?.max} damage at speed ${parsed?.damage?.speed}` };
    for (let i = 1; i <= cap; i++) {
      out.push({
        id: `rating:${i}`, kind: "rating", slot: "number", cost: 2,
        weight: w(1 + (rank ?? 0) + lift - (i - 1) * 0.4),
        topUp: i > graded, rung: RUNG.number, from, payload: { points: 1 }
      });
    }
  } else if (shape?.type === "armor") {
    const capBy = shape.shield ? SHIELD_AP_CAP : SUIT_AP_CAP;
    const room = BODY_AP_CEILING - baseArmorPoints(shape.category).body - (draft.system.apBonus ?? 0);
    const cap = Math.max(0, Math.min(capBy[rarity] ?? 0, room));
    const graded = shape.shield ? pointsForRank(rank, cap, RANK_FOR_SHIELD) : pointsForRank(rank, cap);
    const from = { index: -1, raw: `${parsed?.armor} armor` };
    for (let i = 1; i <= cap; i++) {
      out.push({
        id: `apBonus:${i}`, kind: "apBonus", slot: "number", cost: 2,
        weight: w(1 + (rank ?? 0) + lift - (i - 1) * 0.4),
        topUp: i > graded, rung: RUNG.number, from, payload: { points: 1 }
      });
    }
  }

  /* ---- attack power on a worn thing is Strength, or Dexterity on a shooter ---- */
  for (const line of attackPower) {
    // Folded into the Rating's weight above — but only where there IS a
    // Rating: 08 §7 gives a bow a dash, so a bow's attack power line has
    // nowhere else to go and became a grant of its own (D-406).
    if (shape?.type === "weapon" && Number.isFinite(draft.system.rating)) { account(line.index); continue; }
    const ability = shape?.launcher || line.kind === "rangedAttackPower" ? "Dexterity" : "Strength";
    account(line.index);
    // `statMagnitudes` already folded this line into that ability's share, so
    // an item carrying BOTH `+10 Strength` and an attack power line has one
    // Strength candidate and not two of the same thing.
    if (out.some(c => c.payload?.family === "attribute" && c.payload?.key === ability)) continue;
    offerAbility(out, {
      affixOf, draft, ability, grade: 1, rarity, weight: 0.45,
      from: { index: line.index, raw: line.raw }, drop
    });
  }
  for (const line of guard) {
    // Folded into the Armor Point's weight above, on a suit or a shield.
    if (shape?.type === "armor") account(line.index);
  }

  /* ---- resistances become Ward, where 08 §6's own cell puts it ---- */
  for (const [school, value] of Object.entries(parsed?.resistances ?? {})) {
    if (value <= 0) { drop(`resistance:${school}`, "penalty", `${value} ${school} resistance`); continue; }
    const grant = `+1 Ward in ${capitalise(school)}`;
    const affix = affixOf(`of ${capitalise(school)} Warding`);
    const line = `+${value} ${capitalise(school)} Resistance`;
    if (!affix) { drop(`resistance:${school}`, "noAffix", line); continue; }
    if (!canGoOn(affix, draft)) { drop(`resistance:${school}`, "goesOn", line); continue; }
    out.push({
      id: `grant:ward:${school}`, kind: "grant", slot: "grant", cost: 2,
      weight: w(0.35 + 0.35 * Math.min(1, value / 25)),
      from: { index: -1, raw: line },
      payload: { grant, affix: affix.name, family: "ward", key: school }
    });
  }
  // **A `Use:` THAT RESISTS EVERY SCHOOL IS THE SAME LINE** (D-698). Loatheb's
  // Reflection reads *increases resistances to all schools of magic by 40* and
  // no `USE_KINDS` row took it, so it reached the table as a placeholder; the
  // lead's rule is *passive effects while equipped*, and a passive that resists
  // every school is exactly what the `+N All Resistances` STAT line already
  // becomes. It is read here so the two share one answer rather than one
  // becoming a grant and the other a Signature.
  const allSchoolUse = (parsed?.uses ?? []).concat(
    (parsed?.equips ?? []).filter(e => e.kind === "other").map(e => ({ raw: e.raw, text: e.text, index: e.index }))
  ).find(u => allResistIn(u.text || u.raw)) ?? null;
  if (parsed?.allResistances > 0 || allSchoolUse) {
    // 08 §6 prices Ward one school at a time and sells nothing that wards
    // every school at once — but 08 §10 sells its own warded gear as `1, one
    // school`, with the points on the item and the school on the wearer
    // (D-690). A class set's `+8 All Resistances` is exactly that shape, so
    // the points are stamped and the choice is outstanding (D-692); the flag
    // says so rather than saying something is wrong.
    const line = parsed?.allResistances > 0 ? `+${parsed.allResistances} All Resistances` : allSchoolUse.raw;
    if (allSchoolUse) account(allSchoolUse.index);
    flag("ward:allSchools", line,
      "08 §6 prices Ward one school at a time, so the item carries the POINTS and the wearer chooses the school (08 §10)");
    const family = [...(ctx?.affixes?.values?.() ?? [])]
      .filter(a => a.family === "ward")
      .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
    if (!family) drop("wardPoints", "noAffix", line);
    else if (!canGoOn(family, draft)) drop("wardPoints", "goesOn", line);
    else {
      const because = "it wards every school at once, which 08 §6 does not sell, so the wearer chooses one (08 §10)";
      out.push({
        id: "grant:wardPoints", kind: "points", slot: "grant", cost: 2,
        weight: w(0.7), from: { index: -1, raw: line },
        payload: { points: 1, family: "ward", key: "unchosen", because }
      });
      pointsTopUp(out, { id: "grant:wardPoints", family: "ward", line, because });
    }
  }

  /* ---- spell power and healing become Spellpower in the class's school (A5) ---- */
  const spell = (parsed?.equips ?? []).filter(e => e.kind === "spellDamage" || e.kind === "healing");
  if (spell.length) {
    // A relic's class is not guessed: 08 §9's own table says a Libram is a
    // Paladin's and an Idol a Druid's, so a relic with no `Classes:` line
    // still knows its school.
    const school = schoolOfClasses(parsed?.classes) ?? schoolOfClasses([shape?.augment?.className].filter(Boolean));
    for (const line of spell) account(line.index);
    if (!school) {
      // 08 §10 sells its own Spellpower gear as `1, one school` and prices it
      // at 08 §4's rate all the same, so the school being unchosen does not
      // make the item cheaper (the lead, 2026-09-09). The points are stamped,
      // the wearer picks the school, and `rules/grants.mjs` composes the
      // sentence — the flag below says the choice is outstanding rather than
      // that anything is wrong.
      flag("spellpower:school", spell[0].raw, "the later client's tooltip names no school and there is no `Classes:` line, so the wearer chooses it (08 §10)");
      // **Where 08 §6 puts Spellpower, and nowhere else.** The points ride on a
      // flag rather than on an affix, so nothing in the schema reaches
      // `canGoOn` and the rule has to be asked for here. **The rule itself is
      // never restated**: it is the pack's own `goesOn`, read off §6's Goes-on
      // cell by the affix parser, so the lead widening that cell to a weapon
      // (2026-09-09) moved this with it and nothing here had to change. Every
      // Spellpower suffix carries the same `goesOn` and the same
      // `minimumRarity`, so any of them answers for the family; the sort only
      // makes the answer the same on two runs.
      const family = [...(ctx?.affixes?.values?.() ?? [])]
        .filter(a => a.family === "spellpower")
        .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
      if (!family) drop("spellpowerPoints", "noAffix", spell[0].raw);
      else if (!canGoOn(family, draft)) drop("spellpowerPoints", "goesOn", spell[0].raw);
      else {
        const because = "it carries spell power and names no school, so the wearer chooses one (08 §10)";
        out.push({
          id: "grant:spellpowerPoints", kind: "points", slot: "grant", cost: 2,
          weight: w(0.75), from: { index: spell[0].index, raw: spell[0].raw },
          payload: { points: 1, family: "spellpower", key: "unchosen", because }
        });
        pointsTopUp(out, {
          id: "grant:spellpowerPoints", family: "spellpower", because,
          line: spell[0].raw, index: spell[0].index
        });
      }
    } else {
      const grant = `+1 Spellpower in ${capitalise(school)}`;
      const affix = affixGranting(grant);
      if (!affix) drop("spellpower", "noAffix", grant);
      else if (!canGoOn(affix, draft)) drop("spellpower", "goesOn", grant);
      else {
        out.push({
          id: `grant:spellpower:${school}`, kind: "grant", slot: "grant", cost: 2,
          weight: w(0.75), from: { index: spell[0].index, raw: spell[0].raw },
          payload: { grant, affix: affix.name, family: "spellpower", key: school }
        });
      }
    }
  }

  /* ---- a profession line is a Boon on the trade's skill ---- */
  for (const line of (parsed?.equips ?? []).filter(e => e.kind === "skill")) {
    const skill = SKILL_OF_PROFESSION[line.skill];
    account(line.index);
    if (skill === undefined) { flag("skill:unknown", line.raw, `no skill answers to "${line.skill}"`); continue; }
    if (skill === null) { flag("line:skill", line.raw, `"${line.skill}" is not a skill 05 §3 carries`); continue; }
    offerBoon(out, { affixGranting, draft, skill, weight: 0.3, from: { index: line.index, raw: line.raw }, drop });
  }

  /* ---- the prefix slot: one enchantment, one Craft trait, or Sturdy ---- */
  prefixCandidates(out, parsed, shape, draft, { affixOf, affixGranting, drop });

  /* ---- the Signature: 08 §20's table ---- */
  for (const cand of signatureCandidates(parsed, shape, tier, ctx)) out.push(cand);

  /* ---- what is left is recorded verbatim, never rounded into something else ---- */
  for (const c of out) account(c.from?.index);
  for (const line of parsed?.equips ?? []) {
    if (handled.has(line.index) || line.kind === "other") continue;
    flag(`line:${line.kind}`, line.raw);
  }
  if (parsed?.randomEnchantment) flag("randomEnchantment", null, "upstream carries a random suffix rather than a fixed one");

  /* ---- A9's last resort: an item whose only line had no conversion ---- */
  // **A LINE THAT WAS CONVERTED IS NOT AN ORPHAN.** `spellpower:school` says
  // the school is the wearer's to choose, not that the line was lost, and it
  // was read FIRST — so four items whose spell power had already been stamped
  // as points quoted the same line back at the player as a Signature (D-692).
  // A `line:` flag is read first now, and the spellpower case survives only as
  // the last resort it always should have been: an item whose whole content is
  // one unchosen school has nothing else to spend its budget on, and refusing
  // it out of the pack is worse than an honest *Signature to be written*.
  const lost = flagged.find(f => f.code.startsWith("line:"));
  const orphan = lost ?? flagged.find(f => f.code === "spellpower:school");
  if (orphan?.line && !out.some(c => c.slot === "signature")) {
    const quote = orphan.line.replace(/^Equip:\s*/i, "");
    const sig = signatureFor("T-quote", {
      tier, shape, classes: parsed?.classes ?? [], quote,
      reason: lost ? reasonFor(quote) : "unwritten"
    });
    if (sig) {
      out.push({
        id: "signature:T-quote", kind: "signature", slot: "signature", cost: sig.cost,
        weight: w(0.2), topUp: true, rung: RUNG.quote,
        from: { index: -1, raw: orphan.line }, payload: sig
      });
    }
  }

  out.sort(candidateOrder);
  return { candidates: out, dropped, flagged };
}

/**
 * **THE GRADE A STAT LINE EARNS, 1 TO 3** (D-701).
 *
 * The share says the line dominates ITS item; the rank says where the number
 * sits among every line of its kind in the whole record. A line that does both
 * AND tops its kind earns the third grade, which is the band's ceiling.
 *
 * Grades 1 and 2 are exactly the old two-way split — `share >= 0.5 && rank >=
 * 0.5` was the whole of it — so **the cost of every line is what it was** and
 * nothing below Epic moves at all. What the third grade buys is the middle of
 * an Epic's +3 to +5, off the cohort rather than off a divisor: the pool runs
 * Ragefire Chasm to Naxxramas and an absolute threshold would put every
 * Naxxramas line at the ceiling (`buildCohorts`).
 */
export function statGrade(share, rank) {
  if ((share ?? 0) < RANK_FOR_STAT) return 1;
  if ((rank ?? 0) >= RANK_FOR_SECOND) return 3;
  if ((rank ?? 0) >= RANK_FOR_STAT) return 2;
  return 1;
}

/** The share of its item a stat line needs before it grades above the floor. */
export const RANK_FOR_STAT = 0.5;

/**
 * One attribute grant, and — where the graded one is a single point — the
 * grade above it as the top-up ladder's second rung. 08 §6's suffix table
 * carries both: the beast is one point and the greater beast two.
 *
 * **THE RUNG IS THE COST AND THE RARITY IS THE MAGNITUDE** (D-701). The suffix
 * a grade takes off §6's table is `attributeRung` and it is what the budget is
 * charged; what the sentence says is `attributeGrant`, which reads the
 * rarity's own band. Grades 2 and 3 are the same greater beast at the same two
 * points and differ only in what the entry grants, which is what §4's *named
 * individually* leaves to the entry.
 */
function offerAbility(out, { affixOf, draft, ability, grade, rarity, weight, from, drop }) {
  const push = (g, topUp) => {
    const rung = attributeRung(g);
    const points = attributeGrant(rarity, g);
    const sentence = `+${points} ${ability}`;
    if (points <= 0) { if (!topUp) drop(`stat:${ability}`, "noGrant", `${rarity} grants no attribute`); return; }
    const affix = affixOf(`of the ${BEAST[`${ability}:${rung}`] ?? ""}`);
    if (!affix) { if (!topUp) drop(`stat:${ability}`, "noAffix", sentence); return; }
    if (!canGoOn(affix, draft)) { if (!topUp) drop(`stat:${ability}`, "goesOn", sentence); return; }
    out.push({
      id: `grant:ability:${ability}${topUp ? ":2" : ""}`, kind: "grant", slot: "grant", cost: rung,
      weight: w(weight), topUp, rung: RUNG.attribute, from,
      payload: { grant: sentence, affix: affix.name, family: "attribute", key: ability }
    });
  };
  push(grade, false);
  if (grade === 1) push(2, true);
}

/**
 * **A SECOND POINT OF 08 §10's OWN GRANT, AS A TOP-UP RUNG** (D-698).
 *
 * The lead's answer for the Ring of Spell Power is *Spell Power +5* under a
 * heading that says the rest out loud: *08 §6 prices this as a grant. If it
 * belongs on the suit, it is a grant and not a Signature at all.* The ring
 * carried the point already and reached the band by taking A9's quote beside
 * it, so it printed *Signature to be written* on top of the one thing it does.
 *
 * A second point is one candidate at cost 4 rather than two at 2, because
 * `grantsCompatible` allows an item ONE of each family and 08 §6's pool holds
 * one-point suffixes only — the points ride inside the base's own budget the
 * way 08 §10's warded gear carries them, so `gateFor` asks `plan()` about the
 * residual and never about a second affix.
 *
 * It is `topUp: true` and sits on the NUMBER rung, so it is offered only where
 * the first pass landed under the band and it is preferred to the quote above
 * it — which is the whole point.
 */
function pointsTopUp(out, { id, family, line, because, index = -1 }) {
  out.push({
    id: `${id}:2`, kind: "points", slot: "grant", cost: 4,
    weight: w(family === "ward" ? 0.7 : 0.75), topUp: true, rung: RUNG.number,
    from: { index, raw: line },
    payload: { points: 2, family, key: "unchosen", because }
  });
}

/** 08 §6's suffix table: the beast is the attribute and the greater beast the second point. */
const BEAST = Object.freeze({
  "Strength:1": "Bear", "Strength:2": "Gronn",
  "Dexterity:1": "Fox", "Dexterity:2": "Panther",
  "Constitution:1": "Boar", "Constitution:2": "Kodo",
  "Intelligence:1": "Owl", "Intelligence:2": "Raven",
  "Wisdom:1": "Wolf", "Wisdom:2": "Stag",
  "Charisma:1": "Falcon", "Charisma:2": "Lion"
});

function offerBoon(out, { affixGranting, draft, skill, weight, from, drop }) {
  const grant = `A Boon on ${skill}`;
  const affix = affixGranting(grant);
  if (!affix) { drop(`skill:${skill}`, "noAffix", grant); return; }
  if (!canGoOn(affix, draft)) { drop(`skill:${skill}`, "goesOn", grant); return; }
  out.push({
    id: `grant:boon:${skill}`, kind: "grant", slot: "grant", cost: 2,
    weight: w(weight), from, payload: { grant, affix: affix.name, family: "boon", key: skill }
  });
}

/** How many points a rank buys, under a cap. */
function pointsForRank(rank, cap, first = RANK_FOR_FIRST) {
  if (cap <= 0 || rank === null) return 0;
  if (rank >= RANK_FOR_SECOND) return Math.min(2, cap);
  if (rank >= first) return Math.min(1, cap);
  return 0;
}

/** The attribute lines' magnitudes, Stamina at half — it is the cheap stat in Classic. */
export function statMagnitudes(parsed) {
  const out = {};
  for (const [kind, value] of Object.entries(parsed?.stats ?? {})) {
    if (!STAT_MAP[kind] || value <= 0) continue;
    out[kind] = kind === "stamina" ? value * 0.5 : value;
  }
  for (const line of parsed?.equips ?? []) {
    if (line.kind !== "attackPower" && line.kind !== "rangedAttackPower") continue;
    const key = line.kind === "rangedAttackPower" ? "agility" : "strength";
    out[key] = (out[key] ?? 0) + (line.value ?? 0) / 2;
  }
  return out;
}

/** The one school a `Classes:` line settles, or null where it settles none (A5). */
export function schoolOfClasses(classes = []) {
  const schools = new Set();
  for (const name of classes ?? []) {
    const school = SCHOOL_OF_CLASS[name];
    if (school) schools.add(school);
  }
  return schools.size === 1 ? [...schools][0] : null;
}

/** The prefix candidates. At most one is ever chosen (08 §6). */
function prefixCandidates(out, parsed, shape, draft, { affixOf, affixGranting, drop }) {
  const offer = (name, weight, from, because) => {
    const affix = affixOf(name);
    if (!affix) { drop(`prefix:${name}`, "noAffix", from.raw); return; }
    if (!canGoOn(affix, draft)) { drop(`prefix:${name}`, "goesOn", from.raw); return; }
    out.push({
      id: `prefix:${name}`, kind: "trait", slot: "prefix", cost: affix.cost ?? 2,
      weight: w(weight), from,
      payload: {
        affix: affix.name,
        trait: affix.enchantment ? `${affix.name} (Lesser)` : null,
        grant: affix.enchantment ? null : affix.grants,
        family: affix.enchantment ? "enchantment" : "smith",
        key: affix.name,
        because
      }
    });
  };

  // A blow that lands an element is that school's enchantment (08 §5, §20).
  const proc = (parsed?.procs ?? []).find(p => p.trigger === "hit" && p.damage?.school);
  const school = proc?.damage?.school ?? parsed?.damage?.school ?? null;
  if (school && ENCHANT_OF_SCHOOL[school]) {
    offer(ENCHANT_OF_SCHOOL[school], 1.2,
      { index: proc?.index ?? -1, raw: proc?.raw ?? `${parsed?.damage?.min}-${parsed?.damage?.max} ${capitalise(school)} damage` },
      `it lands ${capitalise(school)} damage`);
  }
  // The ratings 08 does have a trait for.
  const crit = (parsed?.equips ?? []).find(e => e.kind === "crit");
  if (crit && shape?.type === "weapon") offer("Keen", 0.55, { index: crit.index, raw: crit.raw }, "it hits critically more often");
  const parry = (parsed?.equips ?? []).find(e => e.kind === "parry");
  if (parry) offer("Balanced", 0.5, { index: parry.index, raw: parry.raw }, "it parries");
  const block = (parsed?.equips ?? []).find(e => e.kind === "blockValue" || e.kind === "blockChance");
  if (block && shape?.shield) offer("Deflecting", 0.5, { index: block.index, raw: block.raw }, "it blocks harder");
  const stealth = (parsed?.equips ?? []).find(e => e.kind === "stealth");
  if (stealth && shape?.type === "armor") offer("Hushed", 0.5, { index: stealth.index, raw: stealth.raw }, "it is quiet");
  if (stealth && shape?.type === "gear") {
    offerBoon(out, { affixGranting, draft, skill: "Stealth", weight: 0.4, from: { index: stealth.index, raw: stealth.raw }, drop });
  }

  // The top-up ladder's first rung: Sturdy, which is a prefix like any other.
  const sturdy = affixOf("Sturdy");
  if (sturdy && canGoOn(sturdy, draft)) {
    out.push({
      id: "prefix:Sturdy", kind: "grant", slot: "prefix", cost: 1,
      weight: w(0.05), topUp: true, rung: RUNG.fortitude,
      from: { index: -1, raw: "" },
      payload: { affix: "Sturdy", trait: null, grant: "+1 Fortitude", family: "fortitude", key: "fortitude", because: "the budget's floor" }
    });
  }
}

/* ========================================================== found traits */

/**
 * The traits a found thing's own lines left in it, **outside the budget**.
 *
 * The lead read the shipped conversion and said the items did not do anything:
 * a line that could not win the budget contest reached the table as nothing at
 * all. So every convertible line is a real trait now, a trait contributes 0 to
 * `spent`, and this runs beside `fill` rather than inside it — which is why
 * the band, the top-ups and the refusals are all exactly where they were.
 *
 * **The FAMILY rules are not relaxed.** An enchantment goes where 08 §6's
 * *Goes on* column puts it, through `canGoOn`, so a School enchantment lands
 * on a weapon and never on a suit; a Bound or Effect trait has no affix at all
 * — §5: they are found, not commissioned — and lands on a weapon and nowhere
 * else. Only the COUNT is relaxed, and `forge.mjs#plan`'s `found` carries it.
 *
 * @param {object} parsed   `parseTooltip`'s output
 * @param {object} shape    `classify`'s output
 * @param {object} ctx      `{affixes}`
 * @param {string[]} held   what the item already carries: the base row's
 *                          traits and the prefix the budget bought
 * @returns {Array<{trait: string, line: string, because: string}>}
 */
export function foundTraits(parsed, shape, ctx = {}, held = []) {
  const draft = draftFor(parsed, shape);
  const out = [];
  const seen = new Set(held.map(t => String(t)));
  const affixOf = name => ctx?.affixes?.get?.(name) ?? null;

  const add = (name, line, because) => {
    if (!name) return;
    const affix = affixOf(name);
    if (affix?.enchantment) {
      // The pack's own sentence carries the grade, so a trait whose name holds
      // a placeholder keeps it rather than becoming `Whispering (Lesser)`.
      const trait = affix.grants;
      if (seen.has(trait) || !canGoOn(affix, draft)) return;
      seen.add(trait);
      out.push({ trait, line, because });
      return;
    }
    if (seen.has(name) || !WEAPON_ONLY.has(name) || shape?.type !== "weapon") return;
    seen.add(name);
    out.push({ trait: name, line, because });
  };

  // A blow that lands an element is that school's enchantment (08 §5, §20).
  const damaging = (parsed?.procs ?? []).find(p => p.trigger === "hit" && p.damage?.school);
  const school = damaging?.damage?.school ?? parsed?.damage?.school ?? null;
  if (school && ENCHANT_OF_SCHOOL[school]) {
    add(ENCHANT_OF_SCHOOL[school],
      damaging?.raw ?? `${parsed?.damage?.min}-${parsed?.damage?.max} ${capitalise(school)} damage`,
      `it lands ${capitalise(school)} damage`);
  }

  // The `Equip:` lines 08 §5 has a trait for, in the tooltip's own order.
  for (const line of parsed?.equips ?? []) {
    const name = TRAIT_FOR_LINE[line.kind];
    if (name) add(name, line.raw, LINE_BECAUSE[line.kind]);
  }

  // What a proc does to whatever it lands on.
  for (const proc of parsed?.procs ?? []) {
    if (proc.condition) add(TRAIT_FOR_PROC[proc.condition], proc.raw, `its blow ${PROC_BECAUSE[proc.condition] ?? "lands an effect"}`);
    const words = proc.other ?? proc.raw ?? "";
    if (LIFE_STEAL.test(words)) add("Thirsting", proc.raw, "its blow takes the life it spills");
  }

  return out;
}

/** Why a line became its trait, in the register `how[]` is written in. */
const LINE_BECAUSE = Object.freeze({
  crit: "it hits critically more often",
  parry: "it parries",
  blockValue: "it blocks harder",
  blockChance: "it blocks harder",
  armorPenetration: "it goes through armor",
  waterBreathing: "it lets its bearer breathe under water",
  stealth: "it is quiet"
});

/** The same, for a proc's condition. */
const PROC_BECAUSE = Object.freeze({
  stun: "stuns",
  bleed: "opens a wound",
  knockback: "knocks the target back",
  root: "roots the target",
  sunder: "breaks armor",
  extraAttack: "comes round again"
});

/* ============================================================= signature */

/**
 * A cooldown becomes a rest: five minutes is the line between them. **The key
 * and the words come off one function** so the sentence and the descriptor's
 * `uses.per` cannot disagree (D-692).
 */
export function restKey(cooldown) {
  return cooldown !== null && cooldown !== undefined && cooldown > 300 ? "long" : "short";
}

export function restFor(cooldown) {
  return restKey(cooldown) === "long" ? "Once per Long Rest" : "Once per Short Rest";
}

/** A WoW duration on the book's own ladder. No seconds and no dice (D2 §12). */
export function durationFor(seconds) {
  if (seconds === null || seconds === undefined) return "";
  if (seconds <= 12) return "until the end of your next turn";
  if (seconds <= 30) return "for three rounds";
  if (seconds <= 120) return "for one minute";
  return "for the rest of the encounter";
}

/**
 * The same rung, as the `{value, units}` an Active Effect's duration takes
 * (D-692). **The encounter rung is a UNIT WITH NO NUMBER**: an encounter has
 * no length, so `SIGNATURE_DURATION_UNITS` carries `encounter` and the value
 * stays null. It used to come back `{null, null}`, which left the sentence
 * saying *for the rest of the encounter* and the descriptor saying nothing at
 * all — the two halves disagreeing, which is the one thing this pair exists to
 * prevent.
 */
export function durationRungFor(seconds) {
  if (seconds === null || seconds === undefined) return { value: null, units: null };
  if (seconds <= 12) return { value: 1, units: "turns" };
  if (seconds <= 30) return { value: 3, units: "rounds" };
  if (seconds <= 120) return { value: 1, units: "minutes" };
  return { value: null, units: "encounter" };
}

/**
 * 08 §20's own highest rider is **3** — the Skullflame Shield's thorns and
 * Thunderfury's arc — and nothing named in the chapter goes past it (D-698).
 *
 * The dump is rendered in a later client's numbers (see `classic-tooltip.mjs`),
 * so an unbounded conversion is fine for a Classic proc of 55-85 and absurd for
 * a WotLK one: the Bandit's Insignia deals *1504 to 2256 arcane damage*, which
 * divides to 19. **Nothing in the packs moved when this ceiling was added** —
 * the highest rider any find already carried was the Skullflame Shield's 3 —
 * so it bounds the new readings and disturbs none of the old ones.
 */
export const RIDER_CEILING = 3;

/** A rider's damage: a WoW proc of 300 is 3, which is what §20's Thunderfury says. */
export function riderFor(damage) {
  if (!damage) return 1;
  const avg = ((damage.min ?? 0) + (damage.max ?? damage.min ?? 0)) / 2;
  return Math.min(RIDER_CEILING, Math.max(1, Math.round(avg / 100)));
}

/** Yards to the nearest rung of the book's own distances. */
export function feetFor(yards) {
  const feet = (Number(yards) || 0) * 3;
  for (const rung of [5, 10, 15, 30]) if (feet <= rung) return rung;
  return 30;
}

/** `&` and `<` in a quoted line, so an upstream character cannot break the card. */
const escapeText = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * A1's names for the conditions one blow lands, in bold and joined with *and*
 * — 08 §20's own register (*that creature is **Slowed** …*), and the sentence
 * `descriptorWords` holds the descriptor against (D-698).
 */
function conditionWords(ids = []) {
  const words = ids.map(id => `<strong>${CONDITION_WORD[id]}</strong>`).filter(Boolean);
  if (words.length <= 1) return words[0] ?? "affected";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * One Signature, from a template and the line behind it.
 *
 * **The sentence and the descriptor are built from ONE bag** (D-692). Every
 * number the text substitutes is in `vars`, and `template.automation(vars)`
 * reads the same values, so a Signature whose prose says 3 Nature damage
 * cannot carry a descriptor that says anything else. That is the guard against
 * the two drifting, and the whole-pack census asserts it holds.
 *
 * @returns {{id, kind, cost, text, status, quote, automation}|null}
 */
export function signatureFor(id, {
  tier = 1, shape = null, classes = [], damage = null, duration = null,
  cooldown = null, useCooldown = null, quote = "", count = null, pair = null,
  reason = "unwritten", entry = "", creatureType = null, condition = null,
  points = null, conditions = [], ability = "", attribute = ""
} = {}) {
  const template = TEMPLATES[id];
  if (!template) return null;
  const gated = Boolean(template.gateable && classes.length === 1);
  // 08 §20's last two rows price a thing used once per rest: a tier 1 spell
  // once per Short Rest is 2 and a tier 2 spell once per Long Rest is 4. A
  // `Use:` is that shape, so a long cooldown is priced up the same ladder.
  const long = useCooldown !== null && useCooldown !== undefined && useCooldown > 300;
  const kind = gated
    ? (long ? "convertingGated" : "gated")
    : (long ? "converting" : template.kind);
  const holds = shape?.type === "weapon" ? "wielding" : "wearing";
  const vars = {
    tier,
    shape,
    classes,
    gated,
    K: riderFor(damage),
    school: damage?.school ?? "physical",
    H: HEAL_BY_TIER[tier] ?? HEAL_BY_TIER[4],
    M: MANA_BY_TIER[tier] ?? MANA_BY_TIER[4],
    // A graded rating, in the family's own unit (D-697). Never undefined: a
    // template reading `v.N` would write `+undefined Attack`, which
    // `cleanSignature` drops on the floor and the census would then read as a
    // Signature that says something and does nothing.
    N: Math.max(1, Math.trunc(Number(points)) || 1),
    per: restKey(cooldown),
    duration: durationRungFor(duration),
    gates: gated ? [gate("class", classes[0])] : [],
    entry,
    creatureType,
    condition,
    // The conditions ONE blow lands (D-698). A list, because the lead's
    // sentence for the Dark Edge of Insanity names two.
    conditions: conditions.filter(id2 => id2 in CONDITION_WORD),
    ability,
    attribute,
    reason
  };
  const text = (gated && template.gatedText ? template.gatedText : template.text)
    .replace(/\{K\}/g, String(vars.K))
    .replace(/\{School\}/g, capitalise(vars.school))
    .replace(/\{H\}/g, String(vars.H))
    .replace(/\{M\}/g, String(vars.M))
    .replace(/\{N\}/g, String(vars.N))
    .replace(/\{Rest\}/g, restFor(cooldown))
    .replace(/\{Class\}/g, classes[0] ?? "bearer")
    .replace(/\{holds\}/g, holds)
    .replace(/\{count\}/g, String(count ?? 2))
    .replace(/\{kinds\}/g, CREATURE_WORD[creatureType] ?? "them")
    .replace(/\{Condition\}/g, CONDITION_WORD[condition] ?? "affected")
    // A1's names in bold, as 08 §20 writes them, and joined with *and* where
    // one blow lands two (D-698).
    .replace(/\{Conditions\}/g, conditionWords(vars.conditions))
    .replace(/\{ability\}/g, escapeText(ability))
    .replace(/\{Attribute\}/g, escapeText(attribute))
    .replace(/\{entry\}/g, escapeText(entry))
    .replace(/\{pair\}/g, escapeText(pair ?? "its pair"))
    .replace(/\{because\}/g, REASON_TEXT[reason] ?? "")
    .replace(/\s*\{duration\}/g, duration === null || duration === undefined ? "" : ` ${durationFor(duration)}`)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
  // A row with no `automation` would be a Signature that says something and
  // does nothing, which is the whole fault D-692 exists to close; the census
  // fails one, and this keeps the caller from reading `undefined`.
  const automation = typeof template.automation === "function" ? template.automation(vars) : null;
  return { id, kind, cost: SIGNATURE_KINDS[kind]?.cost ?? 2, text, status: template.status, quote, automation };
}

/**
 * The kind of creature a `when fighting X` line names, as a `config.mjs` key.
 * Read strictly: four items in the record write it and every one names one of
 * 14 §1's eight types.
 */
export function creatureTypeIn(text) {
  const m = /\bwhen fighting (undead|beasts?|demons?|elementals?|dragonkin|humanoids?|constructs?|oozes?)\b/i
    .exec(String(text ?? ""));
  if (!m) return null;
  const word = m[1].toLowerCase().replace(/s$/, "");
  return word in CREATURE_WORD ? word : null;
}

/**
 * The bestiary entry a summoning line names, or null. **Only the three words
 * 14 holds a creature for**: *the Black Brewmaiden* and *a cannon* are not in
 * the chapter, so those keep a placeholder rather than being pointed at the
 * nearest thing that is (CLAUDE.md §17).
 */
export function summonEntryIn(text) {
  const s = String(text ?? "").toLowerCase();
  if (!/\b(?:summons?|summoning|calls? forth)\b/.test(s)) return null;
  for (const word of Object.keys(SUMMON_ENTRY).sort((a, b) => b.length - a.length)) {
    if (s.includes(word)) return SUMMON_ENTRY[word];
  }
  return null;
}

/**
 * What a blow landed ON THE BEARER leaves on whoever landed it, as a condition
 * key, or null (D-692).
 *
 * **It names the attacker or it is not this.** A hit proc that slows what it
 * strikes is `T-slow` and reads through `conditionOf`; this reads the other
 * direction, and requiring the word keeps the two apart with no ordering
 * dependency between them.
 *
 * Two shapes and no more, because the record only writes two: *freezing the
 * attacker in place* is held, which is A1's **Entangled** rather than
 * **Stunned** — the sentence says where it is, not that it cannot act — and
 * *reducing the attacker's movement speed* is **Slowed**. A third find,
 * `Force of Will`, reduces the damage taken instead and keeps its placeholder:
 * there is no key for that and inventing one would be this module guessing.
 */
export function struckConditionIn(text) {
  const s = String(text ?? "");
  if (!/\battackers?\b/i.test(s)) return null;
  if (/\bfreez\w*\b[^.]*\bin place\b/i.test(s)) return "entangled";
  if (/\breduc\w*\b[^.]*\bmovement speed\b/i.test(s)) return "slowed";
  return null;
}

/**
 * Whether a hit proc worsens EVERY attribute of what it strikes, which is a
 * Bane in this system's vocabulary (D-692).
 *
 * Read narrowly on purpose. *Lowers all attributes of target* is two finds and
 * both mean the same thing; *reduces target's Strength* and *reduces target
 * enemy's attack power* are one attribute and one derived number, which are
 * not a Bane on everything and keep their placeholders. *Lowers all stats* on
 * `Seeping Willow` names an eight-yard radius rather than the target, and an
 * area is a different rule.
 */
const ATTRIBUTE_DEBUFF = /\blowers all attributes of (?:the )?target\b/i;

/** *All attacks are guaranteed to land* — Felstriker's, and only Felstriker's. */
const GUARANTEED = /\bguaranteed to (?:land|hit)\b/i;

/**
 * The life a blow steals, as a damage range `riderFor` can scale.
 *
 * **THE TRANSFER FORM READS TOO** (D-698). `LIFE_STEAL` has matched
 * *transfers N health* since D-685 and this did not, so the Demonfork passed
 * the family's own test and came back null one line later, fell through every
 * branch below it and reached the table as *Signature to be written*. The two
 * patterns are one family and now they are one grammar.
 */
export function lifeStolenIn(text) {
  const m = /\b(?:steal|drain|leech)\w*\s+(?:up to\s+)?(\d+)(?:\s+to\s+(\d+))?\s+(?:life|health)\b/i
    .exec(String(text ?? ""))
    ?? /\btransfers?\s+(\d+)(?:\s+to\s+(\d+))?\s+health\b/i.exec(String(text ?? ""));
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2] ?? m[1]), school: null };
}

/**
 * WHY a line the tables cannot read is still a placeholder, as a key of
 * `AZEROTH.signatureReasons` (D-692). The sentence the player reads carries
 * `REASON_TEXT`'s clause for it, and never the tooltip.
 *
 * Three answers and no more, because a finer split would be this module
 * guessing at intent: a line naming a rating, a threat, a resource cost or a
 * cooldown names a mechanic these rules do not have; a line that is a
 * percentage or a per-N-seconds tick is a RATE the rules do not keep; a line
 * that is not there at all is simply unwritten.
 */
export function reasonFor(quote) {
  const s = String(quote ?? "").trim();
  if (!s) return "unwritten";
  if (/\brating\b|\bthreat\b|\b(?:mana|energy|rage) cost\b|\bcooldown\b|\bresilience\b|\bpenetration\b/i.test(s)) {
    return "noEquivalent";
  }
  if (/\d+\s*%|\bper \d+ sec/i.test(s)) return "scaled";
  return "noEquivalent";
}

/* ------------------------------------------------------------------ */
/*  D-698: what a line the tables could not read says, in our words     */
/* ------------------------------------------------------------------ */

/**
 * **THE LEAD'S FOUR RULES FOR THE SIXTY THAT FIRED NOTHING** (2026-09-10),
 * written as rules over the LINE and never over named rows:
 *
 * | The lead's rule | What reads it |
 * |---|---|
 * | *SL 3 or higher "Effect"* (chance on hit) | `procConditionsIn`, `procRiderIn`, `procDebuffIn`, `procManaIn`, `procArcIn`, `procDotIn`, `procDamageIn` |
 * | *Passive effects while equipped, not a use with cooldown* | `useAttributeIn`, `allResistIn` |
 * | *Passive effect that improves bound companions* | `boundLineIn` |
 * | *Change to Class Feature or Talent Improvement* | `empowerIn` over `ABILITY_NAMED` |
 * | *Remove Threat mention* | `isThreatLine` — no candidate at all |
 *
 * Every one is tried only AFTER every reader that already existed has
 * declined, which is what keeps a working conversion where it is (D-697's own
 * rule for the ratings). The prefix a tooltip puts in front of a proc is
 * stripped first, so an anchored pattern can be anchored.
 */
function lineWords(text) {
  return String(text ?? "")
    .replace(/^(?:Equip|Use|Chance on hit|Chance on melee hit)\s*:\s*/i, "")
    .trim();
}

/**
 * A line about THREAT. 14 §1's Threat Share is an encounter-building number
 * and there is no aggro mechanic in 02, 04, 05, 06 or 13, so the lead's answer
 * is *remove Threat mention*: the line offers NO Signature candidate at all,
 * rather than a placeholder that says one is owed.
 */
export function isThreatLine(text) {
  return /\bthreat\b/i.test(String(text ?? ""));
}

/**
 * The conditions an SL 3 rider lands, in A1's own keys, or an empty list.
 *
 * Read narrowly and in a fixed order, so a sentence naming two things takes
 * the one it is remembered for. **There is no Feared condition** — the lead
 * asked for one and the system's is `Frightened` — and *wanders aimlessly* is
 * Frightened AND Slowed, which is the only line in the union that lands two.
 */
export function procConditionsIn(text) {
  const s = lineWords(text);
  if (/\bdisorient\w*\b/i.test(s)) return ["frightened", "slowed"];
  if (/\bsilenc\w*\b/i.test(s)) return ["silenced"];
  if (/\bknocks?\b[^.]*\bsilly\b/i.test(s)) return ["stunned"];
  return [];
}

/**
 * Whether the line raises the BEARER'S OWN blow — *increases attack power*,
 * *increases Strength*, *increases damage* — which the lead priced at *SL3 add
 * 2 more damage to weapons rating*.
 *
 * **ANCHORED, because the unanchored form eats the whole ability group**:
 * *Increases the damage dealt by your Maul ability by 50* is a line about
 * something 02 does not have, and a loose `increases … damage` would have
 * given every one of those a damage rider it never says.
 */
export function procRiderIn(text) {
  const s = lineWords(text);
  if (/^(?:increases?|improves)\s+(?:your\s+)?(?:(?:ranged|melee)\s+)?(?:attack power|strength|damage(?:\s+done)?)\b/i.test(s)) return true;
  return /\battack power increased by\b/i.test(s);
}

/**
 * Whether the line worsens ONE of the target's own numbers, which is a Bane
 * in this system's vocabulary. `T-debuff` is the same effect off a line that
 * lowers EVERY attribute; this is the SL 3 group's, and it names the numbers
 * rather than matching *reduces … target*, because *reduce the magical
 * resistances of your spell targets* is somebody else's Ward and no key in the
 * descriptor touches one (D-697).
 */
export function procDebuffIn(text) {
  return /\breduc\w*\b[^.]*\btargets?\b[^.]*\b(?:attack power|strength|agility|stamina|intellect|spirit|attributes?|stats?)\b/i
    .test(lineWords(text));
}

/** Whether the blow gives the bearer Mana back. A kill is a different trigger. */
export function procManaIn(text) {
  const s = lineWords(text);
  if (/\bwhen you kill\b/i.test(s)) return false;
  return /\brestores?\b[^.]*\bmana\b/i.test(s);
}

/** Whether the blow reaches every creature standing near the one struck. */
export function procArcIn(text) {
  return /\ball nearby enem/i.test(lineWords(text));
}

/**
 * Whether the blow leaves the target losing Health turn after turn, which is
 * A1's **Bleeding** — the one damage-over-time in the list that names no
 * school. `Scorched` is Fire and is D-695's; a soul drain is not one.
 */
export function procDotIn(text) {
  return /\bloses?\b[^.]*\bhealth\b[^.]*\b(?:every|per)\s+\d+\s*sec/i.test(lineWords(text));
}

/** Whether the line is a chance to land typed damage of its own on a blow. */
export function procDamageIn(text) {
  const s = lineWords(text);
  if (!/\bchance to (?:strike|deal|discharge|inflict)\b|\bchance\b[^.]*\bdealing\b/i.test(s)) return null;
  return damageIn(s);
}

/**
 * Whether the line heals somebody ELSE off a blow — the Lawbringer Armor's
 * eight-piece bonus and nothing else in the union.
 */
export function allyHealIn(text) {
  const s = lineWords(text);
  if (!/\bheals?\b[^.]*\b(?:your party|the party|party|allies|group)\b/i.test(s)) return null;
  return damageIn(s.replace(/\bfor (\d+) to (\d+)\b/i, "$1 to $2 damage")) ?? { min: 1, max: 1, school: null };
}

/**
 * Whether the line improves what the BEARER'S OWN healing spells restore.
 *
 * **Whose spells matters and the first version did not ask.** The Dreadnaught's
 * Battlegear reads *healing spells cast on you … increasing healing done to
 * you*, which is the other direction entirely — `healingBonus` is what the
 * bearer GIVES (08 §20's Vestments of Transcendence) — and it took this row off
 * a working Signature until the clause was read.
 */
export function healingLineIn(text) {
  const s = lineWords(text);
  if (/\bcast on you\b|\bdone to you\b|\bhealing you\b/i.test(s)) return false;
  return /\byour (?:direct )?healing spells?\b/i.test(s);
}

/**
 * Whether the line improves a summoned creature — a *pet*, which is D-643's
 * bond here. Four Ahn'Qiraj set bonuses say it and nothing else does.
 */
export function boundLineIn(text) {
  const s = lineWords(text);
  return /\bpets?['’]?s?\b/i.test(s) && /\bdamage\b/i.test(s);
}

/**
 * Whether a `Use:` raises one of 05 §1's attributes, which the lead's rule
 * turns into a passive grant while the thing is worn.
 */
export function useAttributeIn(text) {
  const s = lineWords(text);
  const m = /\b(?:increases?|improves|gives|adds|additional)\b[^.]*?\b(strength|agility|stamina|intellect|spirit)\b/i.exec(s)
    ?? /\b(strength|agility|stamina|intellect|spirit)\b[^.]*\b(?:increased|additional)\b/i.exec(s);
  return m ? USE_ATTRIBUTE[m[1].toLowerCase()] ?? null : null;
}

/**
 * Whether the line resists EVERY school at once, which 08 §6 does not sell and
 * 08 §10 does: the item carries the POINTS and the wearer chooses the school.
 * It is a GRANT and not a Signature at all, which is the same answer the
 * `+N All Resistances` stat line already gets (D-690).
 */
export function allResistIn(text) {
  return /\bresistances?\b[^.]*\ball schools\b|\ball schools of magic\b/i.test(lineWords(text));
}

/**
 * The named ability a line improves and what it does to it (D-698), or null.
 *
 * The NAME comes off `ABILITY_NAMED`, longest first so *Shadow Word: Pain*
 * beats nothing shorter, and the DIRECTION comes off the line's own verb:
 * a cost, a cooldown, a casting time or a refund is *costs 1 less*, and a
 * damage or a critical is *1 more Damage Rating* on a damaging thing and *1
 * more Health* on a healing one. A `utility` row's damage clause reads as
 * nothing at all — Mana Shield's absorb and Devotion Aura's armor are numbers
 * this system does not keep — and the item records a reason.
 *
 * @returns {{name: string, cost?: number, damageRating?: number, heal?: number}|null}
 */
export function empowerIn(text) {
  const s = lineWords(text).toLowerCase();
  let row = null;
  for (const key of Object.keys(ABILITY_NAMED).sort((a, b) => b.length - a.length)) {
    if (s.includes(key)) { row = ABILITY_NAMED[key]; break; }
  }
  if (!row) return null;
  if (/\b(?:mana|rage|energy|focus) cost\b|\bcooldown\b|\bcasting time\b|\brefunds?\b|\bregain \d+ mana\b/i.test(s)) {
    return { name: row.name, cost: 1 };
  }
  if (/\bdamage\b|\bcritical\b|\bcrit\b/i.test(s)) {
    if (row.kind === "damage") return { name: row.name, damageRating: 1 };
    if (row.kind === "heal") return { name: row.name, heal: 1 };
  }
  return null;
}

/**
 * The Signature a line the older readers could not take becomes (D-698), as
 * `{id, args}` for `signatureFor`, or `null` where nothing here reads it, or
 * `{threat: true}` where the lead's answer is to offer nothing at all.
 *
 * **The order is the order the readings are specific in.** A pet's damage, a
 * named ability and a party heal are all sentences about DAMAGE and would each
 * fall into the SL 3 rider if the rider were asked first.
 *
 * **`use` IS THE ONE THING THE WORDS CANNOT SAY.** *Increases Strength by 300
 * for 8 sec* is a passive grant on a `Use:` line and the SL 3 rider on a
 * *Chance on hit*, and the sentence is identical: the Untamed Blade and
 * Malown's Slam both took the grant until the caller said which door it came
 * through.
 *
 * @param {string} text
 * @param {{use?: boolean}} [o]  whether the line is a `Use:` rather than a
 *   proc, an `Equip:` or a set bonus
 */
export function lineSignature(text, { use = false } = {}) {
  const s = lineWords(text);
  if (!s) return null;
  if (isThreatLine(s)) return { threat: true };
  // 08 §10's `1, one school`: `candidates` has already stamped the POINTS off
  // this line, so it is a GRANT and not a Signature at all — the lead's own
  // words for the same shape one heading up. `handled` is the second answer
  // that adds nothing, beside `threat`.
  if (allResistIn(s)) return { handled: true };
  if (boundLineIn(s)) return { id: "T-bound", args: {} };
  const empowered = empowerIn(s);
  if (empowered) {
    const id = empowered.cost ? "T-empower-cost" : empowered.heal ? "T-empower-heal" : "T-empower-damage";
    return { id, args: { ability: empowered.name } };
  }
  const ally = allyHealIn(s);
  if (ally) return { id: "T-ally-heal", args: { damage: ally } };
  if (healingLineIn(s)) return { id: "T-healing", args: {} };
  const attribute = use ? useAttributeIn(s) : null;
  if (attribute) return { id: "T-attribute", args: { attribute } };
  const conditions = procConditionsIn(s);
  if (conditions.length) return { id: "T-onhit-condition", args: { conditions } };
  if (procDotIn(s)) return { id: "T-bleed", args: {} };
  if (procArcIn(s)) return { id: "T-arc", args: {} };
  if (procManaIn(s)) return { id: "T-onhit-mana", args: {} };
  const struck = procDamageIn(s);
  if (struck) return { id: "T-proc-damage", args: { damage: struck } };
  if (procRiderIn(s)) return { id: "T-onhit-rating", args: {} };
  if (procDebuffIn(s)) return { id: "T-onhit-bane", args: {} };
  return null;
}

/**
 * Whether a rating family has anywhere ELSE to land on this item, which is the
 * one thing that stops a line being counted twice (D-697).
 *
 * Each answer is the law's own, never a re-derived shape test: a defense or
 * dodge line on a suit or a shield is already folded into the Armor Point
 * candidate's weight and accounted there, and 08 §5's Balanced and Deflecting
 * are read through `canGoOn`, so the day 08 §6 widens either *Goes on* cell
 * this moves with it.
 */
function ratingOfferable(family, shape, draft, affixOf) {
  const carries = name => {
    const affix = affixOf(name);
    return Boolean(affix) && canGoOn(affix, draft);
  };
  if (family === "defense") return shape?.type !== "armor";
  if (family === "parry") return !carries("Balanced");
  if (family === "block") return !carries("Deflecting");
  return true;
}

/** Every Signature the record could carry, as candidates for the one slot. */
function signatureCandidates(parsed, shape, tier, ctx) {
  const out = [];
  const classes = parsed?.classes ?? [];
  const add = (id, args, weight, from) => {
    const sig = signatureFor(id, { tier, shape, classes, ...args });
    if (!sig) return;
    out.push({
      id: `signature:${id}`, kind: "signature", slot: "signature", cost: sig.cost,
      weight: w(weight), from, payload: sig
    });
  };

  /**
   * D-698's readers, as the LAST thing tried on any line (`lineSignature`).
   *
   * It answers **true** when the line has been dealt with — either a Signature
   * was added, or the line is about THREAT and the lead's answer is to offer
   * nothing at all rather than a placeholder saying one is owed.
   */
  const readLine = (words, from, weight, use = false) => {
    const read = lineSignature(words, { use });
    if (!read) return false;
    if (read.threat || read.handled) return true;
    add(read.id, read.args, weight, from);
    return true;
  };

  /**
   * The ratings, gathered as the loops below read them and reduced to ONE
   * CANDIDATE PER FAMILY at the end (D-697) — an item carrying a hit rating
   * and an expertise rating earns one `+N Attack` at the better of the two,
   * not two of them, because there is one Signature slot to compete for.
   *
   * A typed `Equip:` line is offered outright; a rating written inside a proc,
   * a `Use:` or an `other` line is offered only where every other reader has
   * already declined it, which is what keeps `T-use-speed` on the Manual Crowd
   * Pummeler and `T-slow` on a blade that also happens to say *hit rating*.
   */
  const ratings = [];
  const draft = draftFor(parsed, shape);
  const affixOf = name => ctx?.affixes?.get?.(name) ?? null;
  const takeRating = (line, index, raw) => {
    const family = line && RATING_SCALAR[line.kind];
    if (!family || !ratingOfferable(family, shape, draft, affixOf)) return false;
    ratings.push({ kind: line.kind, value: line.value, index, raw });
    return true;
  };
  for (const line of parsed?.equips ?? []) {
    if (RATING_SCALAR[line.kind] && Number.isFinite(line.value)) takeRating(line, line.index, line.raw);
  }

  for (const proc of parsed?.procs ?? []) {
    const from = { index: proc.index, raw: proc.raw };
    const words = proc.other ?? proc.raw.replace(/^Equip:\s*/i, "");
    // A blow that comes back at whoever landed it, on anything worn.
    if (proc.trigger === "struck" && proc.damage && shape?.type !== "weapon") {
      add("T-reflect", { damage: proc.damage }, 1, from);
      continue;
    }
    // The same blow, leaving a condition on the attacker rather than damage.
    // Read BEFORE `proc.condition`, because that reader answers about the
    // TARGET and would file a slowed attacker as a slowed victim.
    if (proc.trigger === "struck") {
      const answered = struckConditionIn(words);
      if (answered) { add("T-struck", { condition: answered }, 0.9, from); continue; }
    }
    // The base row already carries the condition, and it cost nothing.
    if (proc.condition && shape?.traitCarried === TRAIT_FOR_CONDITION[proc.condition]) continue;
    if (proc.condition === "extraAttack") { add("T-momentum", {}, 0.9, from); continue; }
    if (proc.condition && TEMPLATE_FOR_CONDITION[proc.condition]) {
      add(TEMPLATE_FOR_CONDITION[proc.condition], { duration: proc.duration }, 0.85, from);
      continue;
    }
    // A damage proc on a weapon is the School enchantment, bought in the prefix slot.
    if (proc.damage && proc.trigger === "hit" && shape?.type === "weapon") continue;
    // The same blow on a WORN thing has nowhere for the enchantment to sit —
    // 08 §5 puts a School enchantment on a weapon and nowhere else (D-692).
    if (proc.damage && proc.trigger === "hit") { add("T-onhit-damage", { damage: proc.damage }, 0.9, from); continue; }
    // Every attribute of the target worsened, which is a Bane and not a stat
    // change on somebody else's sheet.
    if (ATTRIBUTE_DEBUFF.test(words)) { add("T-debuff", {}, 0.9, from); continue; }
    // Life off the blow. The blade also carries 08 §5's Thirsting, free, off
    // the same line: that one pays on a kill and this one pays on the hit.
    const stolen = LIFE_STEAL.test(words) ? lifeStolenIn(words) : null;
    if (stolen) { add("T-lifesteal", { damage: stolen }, 0.9, from); continue; }
    if (GUARANTEED.test(words)) { add("T-guaranteed", { cooldown: proc.cooldown }, 0.9, from); continue; }
    const called = summonEntryIn(words);
    if (called) { add("T-summon", { entry: called, cooldown: proc.cooldown }, 0.9, from); continue; }
    // A rating inside the proc's own sentence, LAST, so nothing above is
    // displaced (D-697). *Chance on hit: increases your haste rating by 300*
    // has no rate this system keeps and no key for a temporary Speed, so the
    // lead's rework is the standing conversion the equip line takes.
    if (takeRating(ratingIn(words), proc.index, proc.raw)) continue;
    // **THE LEAD'S SL 3 RIDER** (D-698), after every older reader has
    // declined, so nothing already converting is displaced.
    if (readLine(words, from, 0.85)) continue;
    // Anything left is A9's backlog: the words go in the report and on the
    // item's flags, and the sentence says WHY rather than quoting them.
    add("T-quote", { quote: words, reason: reasonFor(words) }, 0.6, from);
  }

  for (const use of parsed?.uses ?? []) {
    const from = { index: use.index, raw: use.raw };
    const words = use.text || use.raw;
    const rest = { cooldown: use.cooldown, useCooldown: use.cooldown };
    const called = summonEntryIn(words);
    if (called) { add("T-summon", { entry: called, ...rest }, 0.9, from); continue; }
    const id = TEMPLATE_FOR_USE[use.kind];
    if (id) { add(id, { duration: use.duration, ...rest }, 0.8, from); continue; }
    // A `Use:` the kinds do not read, whose sentence still names a damage run.
    if (use.damage) { add("T-use-damage", { damage: use.damage, duration: use.duration, ...rest }, 0.8, from); continue; }
    // A rating inside the sentence, after every reader above has declined it:
    // Nat Pagle's Broken Reel is *spell hit rating for 15 sec* and the lead's
    // rule makes it a passive `+N Attack` rather than a pressable Use (D-697).
    // The Manual Crowd Pummeler keeps `T-use-speed`, because `USE_KINDS` read
    // its haste as speed two branches ago.
    if (takeRating(ratingIn(words), use.index, use.raw)) continue;
    // **A PASSIVE, NOT A USE WITH A COOLDOWN** (the lead, D-698): a `Use:` the
    // kinds could not read becomes what its own words say, standing.
    if (readLine(words, from, 0.8, true)) continue;
    add("T-quote", { quote: words, reason: reasonFor(words), ...rest }, 0.6, from);
  }

  // 08 §20's Judgment Armor is a crit Signature on a suit, which is where a
  // crit line goes when there is no blade to sharpen.
  const crit = (parsed?.equips ?? []).find(e => e.kind === "crit");
  if (crit && shape?.type !== "weapon") add("T-crit", {}, 0.6, { index: crit.index, raw: crit.raw });

  // An `other` equip line: the vs-a-kind family reads, and the rest is A9's
  // backlog — the words on the flag and in the report, the reason on the item.
  //
  // **A relic keeps its placeholder.** The plan had one dropped, on the
  // grounds that the Augment's bonus already carries the line; it does, but
  // the Signature slot is the ONLY thing five Rare relics spend anything on,
  // and dropping it refused all five out of the pack. The thing the plan was
  // objecting to — the number stated twice — is gone anyway, because the
  // sentence no longer quotes the line.
  for (const line of (parsed?.equips ?? []).filter(e => e.kind === "other")) {
    const words = line.text ?? line.raw;
    const from = { index: line.index, raw: line.raw };
    const against = creatureTypeIn(words);
    if (against) { add("T-vs-kind", { creatureType: against }, 0.9, from); continue; }
    // **A struck line reaches here too.** `PROC_SHAPES` matches *When struck
    // in combat …* and the Stygian Buckler writes *When struck has …*, so its
    // sentence is an `other` equip line rather than a proc. `struckConditionIn`
    // needs the word *attacker*, which no equip line but a struck one carries,
    // so this cannot take anything the proc branch would not have.
    const answered = struckConditionIn(words);
    if (answered) { add("T-struck", { condition: answered }, 0.9, from); continue; }
    // *Your spells have a chance to increase your haste rating by 505* is an
    // `other` line rather than a proc, because no `PROC_SHAPE` opens that way.
    if (takeRating(ratingIn(words), line.index, line.raw)) continue;
    if (readLine(words, from, 0.8)) continue;
    add("T-quote", { quote: words, reason: reasonFor(words) }, 0.55, from);
  }

  /**
   * The regeneration lines, which 08 §20 carries as a tick.
   *
   * **THE RARITY GATE WAS THE BUG** (D-697). This read `parsed?.quality !==
   * "Epic"` and the six Rares that carry a regeneration line and nothing else
   * — Mindtap Talisman, Fluctuating Cloak, Necromantic Band, Archivist Cape,
   * Foresight Girdle, Slime-encrusted Pads — were never OFFERED the tick at
   * all, so the line stayed unhandled, `line:mp5` made it an orphan, and A9's
   * quote came back off the top-up ladder to reach the Rare's floor. It was
   * never a selection between a tick and a quote: the tick was not in the
   * running. The gate was written when a found Rare's ceiling was 3 and a
   * 2-point Signature crowded out everything else; D-692 raised it to 5.
   */
  for (const kind of ["mp5", "hp5"]) {
    const line = (parsed?.equips ?? []).find(e => e.kind === kind);
    if (!line) continue;
    add(kind === "mp5" ? "T-mp5" : "T-hp5", {}, 0.45, { index: line.index, raw: line.raw });
  }

  /**
   * ONE CANDIDATE PER RATING FAMILY, at the strongest line's grade (D-697).
   *
   * The grade is `pointsForRank` over the file's own distribution of that
   * rating and never a fixed divisor, and the weight rises with the same rank
   * — so a Naxxramas hit rating of 50 outranks an Uldaman one of 7 both in
   * what it grants and in how hard it competes for the slot. The band is
   * deliberately BELOW every proc and `Use:` template above (0.8 to 1.0) and
   * below 08 §20's own crit Signature at 0.6: a rating is what an item also
   * says, not what it is remembered for. It still beats every placeholder,
   * because `fill`'s `signed` outranks the weights entirely.
   *
   * The families are walked in `RATING_TEMPLATE`'s own order rather than the
   * Map's, so two runs cannot disagree about the candidate order.
   */
  const best = new Map();
  for (const line of ratings) {
    const family = RATING_SCALAR[line.kind];
    const rank = rankIn(ctx?.cohorts?.ratings?.get?.(line.kind), line.value) ?? 0;
    const held = best.get(family) ?? null;
    if (held && (held.rank > rank || (held.rank === rank && held.from.index <= line.index))) continue;
    best.set(family, { rank, from: { index: line.index, raw: line.raw } });
  }
  for (const [family, id] of Object.entries(RATING_TEMPLATE)) {
    const pick = best.get(family);
    if (!pick) continue;
    const points = Math.max(1, pointsForRank(pick.rank, 2)) * RATING_STEP[family];
    add(id, { points }, 0.42 + 0.16 * pick.rank, pick.from);
  }

  // The set bonus, handed in by `convertAll` because it needs the whole file.
  const setSig = ctx?.setSignature ?? null;
  if (setSig) add(setSig.id, setSig.args, 0.7, setSig.from);

  return out;
}

/* ================================================================== fill */

/** The order candidates are read in, and the only tie-break there is. */
export function candidateOrder(a, b) {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.cost !== b.cost) return a.cost - b.cost;
  const ai = a.from?.index ?? 0;
  const bi = b.from?.index ?? 0;
  if (ai !== bi) return ai - bi;
  return a.id.localeCompare(b.id);
}

/** How many of each kind the enumeration looks at, so it stays exhaustive and bounded. */
const LOOK_AT = Object.freeze({ prefix: 3, grant: 6, signature: 4 });

/**
 * Spend the budget.
 *
 * Five slots — a number of 0 to 2 points, one prefix, one or two grants, one
 * Signature — enumerated exhaustively over the top few candidates of each
 * kind, every legal assignment scored on (Σ weight, spent, earliest line), and
 * the argmax taken. It is not a knapsack solver and does not need to be: the
 * slots cap the search at a few hundred assignments.
 *
 * **The second pass is the top-up.** If the first lands under the band's
 * floor, the whole enumeration runs again with the `topUp` candidates admitted
 * — Sturdy, then an attribute's second point, then a number beyond its rank's
 * grade, then A9's quote — and the winner is the one that reaches the floor
 * with the FEWEST additions off the LOWEST rung. That is the plan's fixed
 * order, expressed as a preference rather than as a staircase.
 *
 * @returns {{chosen: Array, dropped: Array, spent: number, toppedUp: Array}}
 */
export function fill(list, band, shape, rarity) {
  const all = [...(list ?? [])].sort(candidateOrder);
  const enumerate = admitTopUp => {
    const pool = all.filter(c => admitTopUp || !c.topUp);
    const numbers = pool.filter(c => c.slot === "number" && shape?.type !== "gear");
    const prefixes = pool.filter(c => c.slot === "prefix").slice(0, LOOK_AT.prefix + 1);
    const grants = pool.filter(c => c.slot === "grant").slice(0, LOOK_AT.grant);
    const signatures = pool.filter(c => c.slot === "signature").slice(0, LOOK_AT.signature);
    const grantSets = combinations(grants, GRANT_CAP[rarity] ?? 1).filter(grantsCompatible);

    let best = null;
    for (let n = 0; n <= numbers.length; n++) {
      for (const prefix of [null, ...prefixes]) {
        for (const set of grantSets) {
          for (const signature of [null, ...signatures]) {
            const chosen = [
              ...numbers.slice(0, n), ...(prefix ? [prefix] : []), ...set, ...(signature ? [signature] : [])
            ];
            const spent = chosen.reduce((sum, c) => sum + c.cost, 0);
            if (band && spent > band.hi) continue;
            if (admitTopUp && band && spent < band.lo) continue;
            const extras = chosen.filter(c => c.topUp);
            const score = {
              extras: extras.length,
              rung: extras.reduce((max, c) => Math.max(max, c.rung ?? 0), 0),
              // A WRITTEN Signature outranks the weights (D-692, the lead's
              // S2). A placeholder does not: *Signature to be written* beating
              // a real +2 Strength would be the wrong half kept.
              signed: chosen.some(c => c.slot === "signature" && c.payload?.status !== "placeholder") ? 1 : 0,
              weight: w(chosen.reduce((sum, c) => sum + c.weight, 0)),
              spent,
              line: chosen.reduce((min, c) => Math.min(min, c.from?.index ?? 99), 99),
              chosen
            };
            if (!best || better(score, best, admitTopUp)) best = score;
          }
        }
      }
    }
    return best;
  };

  let best = enumerate(false);
  let toppedUp = [];
  if (band && (!best || best.spent < band.lo)) {
    const second = enumerate(true);
    if (second) {
      best = second;
      toppedUp = second.chosen.filter(c => c.topUp);
    }
  }

  const chosen = best ? best.chosen : [];
  const keep = new Set(chosen.map(c => c.id));
  const dropped = all
    .filter(c => !keep.has(c.id) && !c.topUp)
    .map(c => ({ id: c.id, why: "budget", line: c.from?.raw ?? null }));
  return { chosen, dropped, spent: chosen.reduce((sum, c) => sum + c.cost, 0), toppedUp };
}

/**
 * Fewest additions off the lowest rung first when topping up; then the
 * Signature; then heaviest.
 *
 * **THE SIGNATURE COMES BEFORE THE WEIGHT** (D-692). It is the one thing on a
 * found item that was written FOR that item, and the weights are shares of a
 * tooltip: 54 Rares reached the table as a plain +1 Damage Rating with their
 * proc costed and outbid, because a Rare's band of 2 to 3 holds a rating
 * point OR a Signature and the rating scored higher. A written Signature plus
 * a one-point grant is 3, which is exactly the band.
 */
function better(a, b, toppingUp) {
  if (toppingUp) {
    if (a.extras !== b.extras) return a.extras < b.extras;
    if (a.rung !== b.rung) return a.rung < b.rung;
  }
  if (a.signed !== b.signed) return a.signed > b.signed;
  if (a.weight !== b.weight) return a.weight > b.weight;
  if (a.spent !== b.spent) return a.spent > b.spent;
  if (a.line !== b.line) return a.line < b.line;
  return false;
}

/** §6: nothing stacks inside one item, so two grants never name the same thing. */
function grantsCompatible(set) {
  const keys = new Set();
  const families = new Set();
  for (const c of set) {
    const family = c.payload?.family;
    const key = `${family}:${c.payload?.key}`;
    if (keys.has(key)) return false;
    keys.add(key);
    // Ward and Spellpower are priced one point at a time and the pack carries
    // one-point suffixes only, so an item takes one of each and no more.
    if ((family === "ward" || family === "spellpower") && families.has(family)) return false;
    families.add(family);
  }
  return true;
}

/** Every subset of `list` up to `max` long, in the list's own order. */
function combinations(list, max) {
  const out = [[]];
  for (let size = 1; size <= max; size++) {
    const walk = (start, acc) => {
      if (acc.length === size) { out.push([...acc]); return; }
      for (let i = start; i < list.length; i++) {
        acc.push(list[i]);
        walk(i + 1, acc);
        acc.pop();
      }
    };
    walk(0, []);
  }
  return out;
}

/* =============================================================== the doc */

/** The item as it stands before anything is spent: the base's own numbers. */
function draftFor(parsed, shape) {
  const system = clone(shape?.base?.system ?? {});
  system.rarity = String(parsed?.quality ?? "").toLowerCase();
  system.equipped = false;
  if (shape?.type === "armor") {
    system.category = shape.category;
    system.shield = shape.shield;
    system.cuts = [];
    if (!shape.shield) system.apBonus = 0;
  }
  return { name: String(parsed?.name ?? ""), type: shape?.type ?? "gear", system };
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/** `Off Ragnaros in Molten Core` — 08 §20's Provenance line, in its register. */
export function provenanceFor(record, parsed, zone) {
  const place = zone?.name ?? null;
  const boss = record?.source?.name ?? parsed?.droppedBy ?? null;
  if (!place) return boss ? `Off ${boss}` : "";
  if (boss) return `Off ${boss} in ${place}`;
  if (record?.source?.category === "Quest") return `Handed over in ${place}`;
  return `Found in ${place}`;
}

/**
 * A8, as the lead settled it on 2026-09-09: **the description carries WoW's
 * flavour text or nothing.**
 *
 * It used to compose a `**Classic.**` paragraph of the record's own stat lines
 * — quality, slot, item level, armor, damage, every attribute, every `Equip:`
 * and the drop — and the lead read the shipped items and said so: *there are
 * multiple items that mention their WoW stat lines in the description. This is
 * not relevant to this system.* **Nothing is lost by deleting it**: every one
 * of those facts is on `flags.azeroth-rpg.classic` and in
 * `tools/classic/REPORT.md`, where the report reads them.
 *
 * An empty description is the ordinary case (2,079 of the 2,115 records carry
 * no flavour at all) and the sheet draws it as nothing rather than as a blank
 * field: the prose is read out of `<prose-mirror>`'s own text (D-667).
 */
export function descriptionFor(parsed, inlineHtml) {
  return parsed?.flavour ? `<p>${inlineHtml(parsed.flavour)}</p>` : "";
}

/* =============================================================== convert */

/**
 * One record to one document, or a refusal with the reason on it.
 *
 * @param {object} record  a row of the vendored file
 * @param {object} ctx     `{bases, affixes, cohorts, dungeonLevel, slugify, inlineHtml}`
 */
export function convert(record, ctx = {}) {
  const { slugify, inlineHtml } = ctx;
  if (typeof slugify !== "function") throw new Error("classic-loot: ctx.slugify is required");
  if (typeof inlineHtml !== "function") throw new Error("classic-loot: ctx.inlineHtml is required");

  const parsed = ctx.parsed ?? parseTooltip(record);
  // `ctx.how` is what the caller decided before the record reached here — the
  // set it was folded out of — so the document carries the whole chain.
  const how = [...(ctx.how ?? [])];
  const flagged = [];
  // `OVERRIDES` is the lead's table; `ctx.overrides` is how a test drives one
  // without a module mock, and how a future tool could hand in its own.
  const override = (ctx.overrides ?? OVERRIDES)[record?.itemId] ?? null;
  if (override?.skip) {
    return { ok: false, skipped: "override", doc: null, record, parsed, tier: null, how, dropped: [], flagged };
  }

  const { zone, tier } = tierFor(record, ctx);
  how.push({ kind: "tier", to: tier, because: zone ? zone.name : "no zone; read off its rarity" });
  if (!zone) flagged.push({ code: "zone:unknown", line: null, note: "no drop zone and no set roster row" });

  const shape = classify(parsed, ctx, tier);
  if (!shape) {
    flagged.push({ code: "base:none", line: null, note: `${parsed.subclass}|${parsed.slot} names no base row` });
    return { ok: false, skipped: null, doc: null, record, parsed, tier, how, dropped: [], flagged, reason: "no base row" };
  }
  how.push(...shape.how);
  if (!shape.base) {
    return {
      ok: false, skipped: null, doc: null, record, parsed, tier, how, dropped: [], flagged,
      reason: `no base document named ${shape.baseName}`
    };
  }
  if (shape.flag) flagged.push({ code: shape.flag, line: null, note: `converted onto ${shape.baseName}` });

  const rarity = String(parsed.quality ?? "").toLowerCase();
  // 08 §20's *Found things*: a found Epic spends 4 to 7 (D-692). Every emitted
  // document goes back through `plan()` with the same `found`, so the band the
  // fill works to and the band the gate refuses on are one number.
  const band = bandFor(rarity, { found: true });
  const { candidates: cands, dropped, flagged: lineFlags } = candidates(parsed, shape, tier, ctx);
  flagged.push(...lineFlags);

  const picked = fill(cands, band, shape, rarity);
  const { chosen, spent } = picked;
  if (picked.toppedUp.length) {
    flagged.push({
      code: "budget:topUp", line: null,
      note: `${picked.toppedUp.map(c => c.payload?.grant ?? c.payload?.id ?? c.id).join(", ")} to reach ${rarity}'s floor of ${band.lo}`
    });
  }
  if (band && spent < band.lo) {
    flagged.push({ code: "budget:underBand", line: null, note: `a spend of ${spent} is under ${rarity}'s floor of ${band.lo}` });
    return {
      ok: false, skipped: null, doc: null, record, parsed, tier, how,
      dropped: [...dropped, ...picked.dropped], flagged, reason: "under band"
    };
  }

  for (const c of chosen) {
    how.push({
      kind: c.kind,
      to: c.payload?.grant ?? c.payload?.trait ?? c.payload?.id ?? c.id,
      because: c.topUp ? `the budget's floor of ${band.lo}` : (c.payload?.because ?? c.from?.raw ?? "")
    });
  }

  // What the making left in it, outside the budget. It is worked out AFTER
  // the fill so a trait the budget already bought is not written twice.
  const held = [
    ...(shape.base.system?.traits ?? []),
    ...chosen.map(c => c.payload?.trait).filter(Boolean)
  ];
  const found = foundTraits(parsed, shape, ctx, held);
  for (const f of found) how.push({ kind: "trait", to: f.trait, because: f.because });

  const doc = buildDoc({ record, parsed, shape, tier, zone, rarity, chosen, found, spent, slugify, inlineHtml });
  const signature = chosen.find(c => c.slot === "signature") ?? null;
  if (signature?.payload.status === "proposed") {
    flagged.push({
      code: `signature:proposed:${signature.payload.id}`,
      line: signature.from?.raw ?? null,
      note: TEMPLATES[signature.payload.id]?.note ?? null
    });
  }
  if (signature?.payload.status === "placeholder") {
    const code = signature.payload.id === "T-set" || signature.payload.id === "T-pair" ? "set:bonus" : "signature:unwritten";
    // THE WORDS STAY HERE AND NOWHERE ELSE. The sentence on the item says why
    // it is unwritten; the tooltip line the lead has to read is on the flag,
    // in the report, with the reason in front of it (D-692).
    const why = signature.payload.automation?.reason || "unwritten";
    flagged.push({
      code, line: signature.from?.raw ?? null,
      note: signature.payload.quote ? `${why} · ${signature.payload.quote}` : why
    });
  }

  if (override) applyOverride(doc, override, how);

  // The legality gate: 08 §4 to §6 and §20, read through the Forge's own
  // planner. A document the chapter would refuse is never emitted.
  const bad = gateFor(doc, chosen, spent, rarity, ctx).find(g => !g.ok);
  if (bad) {
    flagged.push({ code: "plan", line: null, note: bad.reasons.join("; ") });
    return {
      ok: false, skipped: null, doc: null, record, parsed, tier, how,
      dropped: [...dropped, ...picked.dropped], flagged, reason: `plan: ${bad.reasons.join("; ")}`
    };
  }

  // **The conversion travels with the item.** `how` is why every part of it is
  // what it is, `dropped` is what its budget could not carry, and `flagged` is
  // what is waiting for a hand — on the document, so the sheet and the pack
  // diff both say it and neither has to be read against a report.
  const all = [...dropped, ...picked.dropped];
  const classic = doc.flags["azeroth-rpg"].classic;
  classic.signature = signature?.payload?.id ?? null;
  classic.how = how.map(h => ({ ...h }));
  classic.dropped = all.map(d => ({ ...d }));
  classic.flagged = flagged.map(f => ({ ...f }));

  return { ok: true, skipped: null, doc, record, parsed, tier, zone, shape, how, dropped: all, flagged };
}

/** Build the document, in §20's own key order per type. */
function buildDoc({ record, parsed, shape, tier, zone, rarity, chosen, found = [], spent, slugify, inlineHtml }) {
  const base = shape.base;
  const system = clone(base.system ?? {});
  const name = String(parsed.name);
  const grants = [];
  const traits = [...(system.traits ?? [])];
  let ratingPoints = 0;
  let apPoints = 0;
  let spellpowerPoints = 0;
  let wardPoints = 0;
  let signature = "";
  let signatureEffect = emptySignature();

  for (const c of chosen) {
    if (c.kind === "rating") ratingPoints += c.payload.points;
    else if (c.kind === "apBonus") apPoints += c.payload.points;
    else if (c.kind === "points") {
      if (c.payload.family === "ward") wardPoints += c.payload.points;
      else spellpowerPoints += c.payload.points;
    } else if (c.slot === "signature") {
      signature = `<p>${c.payload.text}</p>`;
      // WHAT THE SENTENCE DOES, beside the sentence (D-692). It was computed
      // and thrown away at this exact line for as long as the conversion had
      // existed - `signatureFor` returned a kind and a cost and only `text`
      // ever reached a document.
      signatureEffect = c.payload.automation ?? emptySignature();
    } else {
      if (c.payload?.trait) traits.push(c.payload.trait);
      if (c.payload?.grant) grants.push(c.payload.grant);
    }
  }
  // Free, and after the budget's own (D-690).
  for (const f of found) traits.push(f.trait);

  const flags = { "azeroth-rpg": { base: baseFlagOf(shape) } };
  if (grants.length) flags["azeroth-rpg"].grants = grants;
  // 08 §10's `1, one school`: the points are the item's and the school is the
  // wearer's, so the sentence is derived once it is chosen (D-690). The two
  // families are written in `grants.mjs#POINT_FAMILIES`' own order, so two
  // runs cannot disagree about the key order (D-692).
  if (spellpowerPoints) flags["azeroth-rpg"].spellpowerPoints = spellpowerPoints;
  if (wardPoints) flags["azeroth-rpg"].wardPoints = wardPoints;
  if (shape.augment) flags["azeroth-rpg"].augment = { ...shape.augment };
  flags["azeroth-rpg"].classic = {
    itemId: record.itemId,
    icon: parsed.icon,
    quality: parsed.quality,
    itemLevel: parsed.itemLevel,
    slot: parsed.slot,
    subclass: parsed.subclass,
    zone: zone?.name ?? null,
    boss: record?.source?.name ?? parsed.droppedBy ?? null,
    dropChance: parsed.dropChance,
    set: parsed.set?.name ?? null,
    tier
  };

  const common = {
    identifier: slugify(name),
    description: descriptionFor(parsed, inlineHtml),
    source: { document: "Classic", section: `Classic · ${zone?.name ?? "Unknown"}` },
    traits,
    rarity,
    budget: spent,
    cost: rarity === "rare" ? priceOf(base) : null,
    weight: null,
    provenance: provenanceFor(record, parsed, zone),
    equipped: false,
    signature,
    // BETWEEN `signature` AND `spells`, which is where `forged()` puts it in
    // the schema and where the §20 parser writes it. `check-packs.mjs` diffs
    // `JSON.stringify`, so the position is the diff (D-692).
    signatureEffect
  };

  if (shape.type === "weapon") {
    return {
      name, type: "weapon", img: "icons/svg/sword.svg",
      system: {
        ...common,
        rating: system.rating === null || system.rating === undefined ? null : system.rating + ratingPoints,
        range: system.range ?? null,
        offHand: shape.offHand,
        quantity: null,
        launcher: shape.launcher,
        fits: [],
        ammunition: null
      },
      flags
    };
  }
  if (shape.type === "armor") {
    // 08 §8's category table gives mail and plate Encumbering, and §20's own
    // suits print it, so a converted suit says it too.
    const encumbering = !shape.shield && (shape.category === "mail" || shape.category === "plate");
    return {
      name, type: "armor", img: "icons/svg/shield.svg",
      system: {
        ...common,
        traits: encumbering && !traits.includes("Encumbering") ? ["Encumbering", ...traits] : traits,
        category: shape.category,
        cuts: [],
        shield: shape.shield,
        apBonus: (shape.shield ? (system.apBonus ?? 1) : 0) + apPoints
      },
      flags
    };
  }
  // 08 §11's slot sits after `traits`, which is where the gear parser puts it,
  // and 08 §12's provision sits after the slot (D-733). A Classic find is
  // never food - the record holds no consumable this law converts - so the key
  // is emitted null for the key-order diff and nothing else.
  const { identifier, description, source, traits: worn, ...tail } = common;
  return {
    name, type: "gear", img: "icons/svg/aura.svg",
    system: { identifier, description, source, traits: worn, slot: shape.worn, provision: null, ...tail, quantity: 1 },
    flags
  };
}

/** A Rare is its base times twenty-five (08 §10); an Epic is not sold (A7). */
function priceOf(base) {
  const cost = base?.system?.cost;
  return cost === null || cost === undefined ? null : cost * 25;
}

/** The lead's hand, applied to a built document and recorded in `how[]`. */
function applyOverride(doc, override, how) {
  for (const key of ["rating", "apBonus", "traits", "signature", "cost", "weight"]) {
    if (override[key] === undefined) continue;
    doc.system[key] = override[key];
    how.push({ kind: "override", to: key, because: override.note ?? "the lead's hand" });
  }
  if (override.grants !== undefined) {
    doc.flags["azeroth-rpg"].grants = override.grants;
    how.push({ kind: "override", to: "grants", because: override.note ?? "the lead's hand" });
  }
  if (override.worn !== undefined && doc.type === "gear") {
    doc.system.slot = override.worn;
    how.push({ kind: "override", to: "slot", because: override.note ?? "the lead's hand" });
  }
}

/**
 * The legality gate. One `plan()` per grant, each at the grant's own cost, so
 * a second grant is checked as hard as the first rather than riding inside a
 * residual budget. Every call must come back `ok` with `spent` equal to the
 * document's budget.
 *
 * **`found: true`** is the one thing relaxed (D-690): 08 §5's one-enchantment
 * COUNT is a limit on what a smith will do, and a found item carries every
 * trait its making left in it. The family rules — where an enchantment goes,
 * which family a suit may take — are `plan`'s and are not relaxed.
 *
 * A grant that names no affix is 08 §10's `1, one school`: nothing in §6's
 * suffix pool sells it, and its points ride inside the base's own budget the
 * way §10's warded gear carries them.
 */
export function gateFor(doc, chosen, spent, rarity, ctx) {
  const prefix = chosen.find(c => c.slot === "prefix") ?? null;
  const signature = chosen.find(c => c.slot === "signature") ?? null;
  const grantList = chosen.filter(c => c.slot === "grant");
  const prefixAffix = prefix ? ctx?.affixes?.get?.(prefix.payload.affix) ?? null : null;
  const sig = signature ? { kind: signature.payload.kind, text: signature.payload.text } : null;
  const sigCost = signature ? signature.cost : 0;
  const prefixCost = prefix ? prefix.cost : 0;
  const out = [];
  for (const grant of grantList.length ? grantList : [null]) {
    const wanted = grant?.payload?.affix ?? null;
    const affix = wanted ? ctx?.affixes?.get?.(wanted) ?? null : null;
    if (wanted && !affix) { out.push({ ok: false, reasons: [`no affix named ${wanted}`] }); continue; }
    const residual = spent - prefixCost - sigCost - (affix ? grant.cost : 0);
    const base = {
      name: doc.name, type: doc.type,
      system: { ...clone(doc.system), budget: residual, traits: baseTraitsOf(doc, prefix) }
    };
    // The sentence goes through the gate with the suffix that carries it, so
    // 08 §6's attribute band is judged rather than assumed (D-701). A grant of
    // another family reads as nothing there and passes untouched.
    const sentence = grant?.payload?.grant ? [grant.payload.grant] : [];
    const result = plan({ base, rarity, prefixes: prefixAffix ? [prefixAffix] : [], suffix: affix, signature: sig, found: true, grants: sentence });
    const reasons = [...result.reasons];
    if (result.spent !== spent) reasons.push(`plan spent ${result.spent} against a budget of ${spent}`);
    out.push({ ok: reasons.length === 0, reasons });
  }
  return out;
}

/** The traits the base carried, without the prefix the gate is about to add. */
function baseTraitsOf(doc, prefix) {
  const trait = prefix?.payload?.trait ?? null;
  const traits = [...(doc.system.traits ?? [])];
  const at = trait ? traits.indexOf(trait) : -1;
  if (at >= 0) traits.splice(at, 1);
  return traits;
}

/* ============================================================= set logic */

/** The slots a piece fills before a set reads as a suit rather than a kit. */
const SUIT_SLOTS = new Set(["Head", "Shoulder", "Chest", "Waist", "Legs", "Feet", "Wrist", "Hands"]);

/**
 * L3: a WoW class armor set is ONE suit, as §20's nine tier 2 suits are.
 *
 * A set with three or more armor pieces collapses onto its Chest piece: the
 * attribute lines are summed, the Armor Point rank is the chest's, and the
 * largest set bonus becomes the Signature. Everything else — a pair of rings,
 * a weapon-and-cloak set — stays as separate items with the bonus on each.
 *
 * @returns {{merged: Map<number, object>, skipped: Map<number, object>, sets: Array}}
 */
export function collapseSets(records = []) {
  const groups = new Map();
  for (const record of records) {
    const name = setNameOf(record);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }

  const merged = new Map();
  const skipped = new Map();
  const sets = [];
  for (const [name, members] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = [...members].sort((a, b) => a.itemId - b.itemId);
    const pieces = ordered.filter(r => r.class === "Armor" && SUIT_SLOTS.has(r.slot));
    if (pieces.length >= 3) {
      // The Chest piece, else the piece stopping the most: a Zul'Gurub set has
      // no chest at all and its shoulders are what the suit is cut from.
      const chest = pieces.find(r => r.slot === "Chest")
        ?? [...pieces].sort((a, b) => (armorOf(b) - armorOf(a)) || (a.itemId - b.itemId))[0];
      merged.set(chest.itemId, { name, members: ordered, chest });
      for (const r of ordered) if (r.itemId !== chest.itemId) skipped.set(r.itemId, { reason: "set-piece", set: name });
      sets.push({ name, kind: "suit", size: ordered.length, representative: chest.itemId });
      continue;
    }
    sets.push({ name, kind: ordered.length === 2 ? "pair" : "group", size: ordered.length, representative: null });
  }
  return { merged, skipped, sets };
}

const STAT_LINE = /^[+-]\d+ (Strength|Agility|Stamina|Intellect|Spirit)$/i;
const RESIST_LINE = /^[+-]\d+ (Fire|Frost|Nature|Shadow|Arcane|Holy) Resistance$/i;

/** The armor a piece stops, off its own tooltip. */
function armorOf(record) {
  for (const line of record?.tooltip ?? []) {
    const m = /^(\d+) Armor$/i.exec(String(line?.label ?? ""));
    if (m) return Number(m[1]);
  }
  return 0;
}

/**
 * The record a collapsed set converts as: the representative piece wearing the
 * whole set's attribute and resistance lines, the set's own name, and the
 * Chest slot — because what it converts to is a SUIT, whichever piece the
 * numbers came off (L3).
 */
export function mergeSet({ name, members, chest }) {
  const merged = clone(chest);
  merged.name = name;
  merged.slot = "Chest";
  const stats = {};
  const resistances = {};
  for (const piece of members) {
    const p = parseTooltip(piece);
    for (const [k, v] of Object.entries(p.stats)) stats[k] = (stats[k] ?? 0) + v;
    for (const [k, v] of Object.entries(p.resistances)) resistances[k] = (resistances[k] ?? 0) + v;
  }
  merged.tooltip = [
    ...chest.tooltip.filter(l => {
      const label = String(l.label ?? "");
      return !STAT_LINE.test(label) && !RESIST_LINE.test(label) && label !== chest.name;
    }),
    ...Object.entries(stats).map(([k, v]) => ({ label: `${v > 0 ? "+" : ""}${v} ${capitalise(k)}` })),
    ...Object.entries(resistances).map(([k, v]) => ({ label: `${v > 0 ? "+" : ""}${v} ${capitalise(k)} Resistance` }))
  ];
  return merged;
}

/* ============================================================ convertAll */

/**
 * The whole file, in one pass. Sorted by `itemId` first, so the cohorts, the
 * ranks and the output are the same whatever order the records arrive in.
 *
 * @returns {{results: Array, cohorts: object, sets: Array, skipped: Map}}
 */
export function convertAll(records = [], ctx = {}) {
  const ordered = [...records].sort((a, b) => a.itemId - b.itemId);
  const { merged, skipped, sets } = collapseSets(ordered);

  const inputs = [];
  for (const record of ordered) {
    if (skipped.has(record.itemId)) continue;
    const group = merged.get(record.itemId) ?? null;
    inputs.push(group ? { record: mergeSet(group), group } : { record, group: null });
  }

  // Pass one: parse, classify and tier, which is what the cohorts need. **A
  // set bonus that is a GRANT is folded in here**, before the cohorts are
  // built, so `+10 Intellect` ranks against every other Intellect line in the
  // file exactly as an item's own would (D-692).
  const first = inputs.map(({ record, group }) => {
    let held = record;
    let parsed = parseTooltip(held);
    const folded = foldSetGrant(held, parsed);
    if (folded) { held = folded.record; parsed = folded.parsed; }
    const { tier } = tierFor(held, ctx);
    return { record: held, group, parsed, tier, folded: Boolean(folded), shape: classify(parsed, ctx, tier) };
  });
  const cohorts = buildCohorts(first);
  const inner = { ...ctx, cohorts };

  // Pass two: the budget and the document.
  const results = [];
  for (const entry of first) {
    const setSignature = entry.folded ? null : setSignatureFor(entry.parsed, ordered);
    const how = entry.group
      ? [{ kind: "set", to: entry.group.name, because: `one suit out of ${entry.group.members.length} pieces (L3)` }]
      : [];
    results.push(convert(entry.record, { ...inner, parsed: entry.parsed, setSignature, how }));
  }
  for (const [itemId, why] of skipped) {
    results.push({ ok: false, skipped: why.reason, set: why.set, itemId, doc: null, how: [], dropped: [], flagged: [] });
  }
  results.sort((a, b) => (a.record?.itemId ?? a.itemId) - (b.record?.itemId ?? b.itemId));
  return { results, cohorts, sets, skipped };
}

/**
 * The Signature a set bonus becomes: a pair names its other half, anything
 * larger names the set. Always a placeholder — 08 §20 prices the Signature and
 * the sentence is the lead's — and the sentence says WHY rather than quoting
 * the tooltip (D-692).
 */
function setSignatureFor(parsed, records) {
  const top = topSetBonus(parsed);
  if (!top) return null;
  const set = parsed.set;
  const held = records.filter(r => setNameOf(r) === set.name);
  const from = { index: -1, raw: `(${top.count}) Set: ${top.text}` };
  // **A SET BONUS IS A LINE LIKE ANY OTHER** (D-698). D-692 folded the ones the
  // ORDINARY GRAMMAR could price into the record's own tooltip; these are the
  // ones the lead's four rules read - a pet's damage, a named ability, a party
  // heal, a threat - and they take the same readers the procs and the `Use:`
  // lines do. A threat line offers nothing at all, which is the lead's answer.
  const read = lineSignature(top.text);
  if (read?.threat || read?.handled) return null;
  if (read) return { id: read.id, args: read.args, from };
  const args = { quote: top.text, count: top.count, reason: reasonFor(top.text) };
  if (held.length === 2) {
    const other = held.find(r => r.name !== parsed.name);
    return { id: "T-pair", args: { ...args, pair: other?.name ?? "its pair" }, from };
  }
  return { id: "T-set", args, from };
}

/** The bonus a set gives for the most pieces, which is the one the law reads. */
function topSetBonus(parsed) {
  const bonuses = parsed?.set?.bonuses ?? [];
  if (!bonuses.length) return null;
  return [...bonuses].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))[0];
}

/**
 * The set-bonus lines the ORDINARY GRAMMAR can read (D-692, the lead's S1).
 * `(5) Set: +10 Intellect`, `(8) Set: +8 All Resistances`, `(8) Set: +200
 * Armor` and *Increases attack power by 30* are every one of them a line this
 * law already prices somewhere else — so the label is appended to the record's
 * own tooltip and read like any other line, and the set contributes no
 * PLACEHOLDER at all.
 *
 * **The ratings joined them on 2026-09-10** (D-697). `(6) Set: Increases your
 * hit rating by 10` and `(5) Set: Increases your parry rating by 20` were the
 * only thing twenty-one finds' sets said, and until the lead settled what a
 * rating means they had nowhere to go but *Signature to be written*. They are
 * a line this law prices now, so they fold like the rest; a critical strike
 * rating is deliberately NOT here, because nothing has settled that one.
 *
 * **The shapes are the tooltip's own**, so nothing is reworded on the way in:
 * a label that does not match one of them is left for the placeholder.
 */
const SET_GRANT_SHAPES = Object.freeze([
  /^[+-]\d+ (?:Strength|Agility|Stamina|Intellect|Spirit)$/i,
  /^[+-]\d+ All Resistances$/i,
  /^[+-]\d+ (?:Fire|Frost|Nature|Shadow|Arcane|Holy) Resistance$/i,
  /^[+-]\d+ Armor$/i,
  /^Increases? (?:your )?ranged attack power by \d+$/i,
  /^Increases? (?:your )?attack power by \d+$/i,
  /^Increases? (?:your )?spell power by \d+$/i,
  /^(?:Increases?|Improves) (?:your )?(?:melee |spell |ranged |shield )?(?:hit|haste|expertise|defense|dodge|parry|block) rating by \d+$/i
]);

/** The tooltip label a set bonus is, or null where it is not one of the shapes. */
export function setGrantLabel(text) {
  const s = String(text ?? "").trim().replace(/\.$/, "");
  return SET_GRANT_SHAPES.some(re => re.test(s)) ? s : null;
}

/**
 * The record with its set bonus folded in as an ordinary line, re-parsed, or
 * null where the bonus is not a grant. The copy is what converts, so the
 * document's own `flags.azeroth-rpg.classic` still names the record it came
 * from and nothing else moves.
 */
function foldSetGrant(record, parsed) {
  const top = topSetBonus(parsed);
  const label = top ? setGrantLabel(top.text) : null;
  if (!label) return null;
  const copy = clone(record);
  copy.tooltip = [...(record.tooltip ?? []), { label }];
  return { record: copy, parsed: parseTooltip(copy) };
}

/* ================================================================ report */

/**
 * What the lead reads: the counts, every flag code with the items and the
 * original line behind it, and the refusals. Pure;
 * `tools/classic/report.mjs` prints it.
 */
export function flaggedReport(results = []) {
  const counts = { converted: 0, refused: 0, skipped: 0, byType: {}, byRarity: {}, byZone: {}, byTier: {} };
  const byCode = new Map();
  const refusals = [];
  const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

  for (const r of results) {
    if (r.skipped) { counts.skipped++; continue; }
    if (r.ok) {
      counts.converted++;
      bump(counts.byType, r.doc.type);
      bump(counts.byRarity, r.doc.system.rarity);
      bump(counts.byZone, r.doc.flags["azeroth-rpg"].classic.zone ?? "—");
      bump(counts.byTier, String(r.tier));
    } else {
      counts.refused++;
      refusals.push({ name: r.record?.name ?? r.parsed?.name ?? String(r.itemId), reason: r.reason ?? "unknown" });
    }
    for (const f of r.flagged ?? []) {
      if (!byCode.has(f.code)) byCode.set(f.code, []);
      byCode.get(f.code).push({ name: r.record?.name ?? r.parsed?.name ?? null, line: f.line, note: f.note });
    }
  }
  const codes = [...byCode.entries()]
    .map(([code, items]) => ({ code, count: items.length, items }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { counts, byCode: codes, refusals };
}

/** Every unknown flag code a run raised, which should always be empty. */
export function unknownCodes(results = []) {
  const out = new Set();
  for (const r of results) for (const f of r.flagged ?? []) if (!isFlagCode(f.code)) out.add(f.code);
  return [...out].sort();
}
