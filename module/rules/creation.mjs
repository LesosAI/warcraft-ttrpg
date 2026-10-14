/**
 * Character creation (01-CHARACTER-CREATION, D-636). Pure functions, no
 * Foundry imports (CLAUDE.md §3): the creator window is a form over these,
 * and every number it shows or writes is computed here so a Vitest can hold
 * it to the chapter's own worked example, Kaelen Voss.
 *
 * 01 is a procedure of ten steps and restates nothing: the array, the point
 * buy and the roll are D-478's, the hundred experience D-479's, the purse
 * D-480's, and every derived value is 05's, reached through the rules that
 * already hold it — `healthMax`, `suitEffects`, `poolsFor`, `skillTotal`.
 *
 * `validate` returns REASONS and NOTES. A reason refuses the character; a
 * note is a judgement 01 or 03 leaves to the table — an Entry "plausibly
 * met", a career the other side does not recognise, a weapon outside the
 * class's Access — and is shown, never enforced (D2 §12).
 */

import { AZEROTH } from "../config.mjs";
import { ABILITIES, abilityModifier, isNaturalScore, skillTotal, spellDC } from "./abilities.mjs";
import { fortitudeAt, healthMax, poolsFor, proficiencyBonus, tierForLevel } from "./progression.mjs";
import { suitEffects } from "./armor.mjs";
import { speedFrom, speedParts } from "./speed.mjs";
import { tokenSize } from "./size.mjs";
import { MAX_CONTAINERS, arrange, baseCapacity, isMount, ledger, wellsOf } from "./slots.mjs";
import { carryFactor, classKey } from "./talent-effects.mjs";
import { characterToken } from "./tokens.mjs";
import { RANK_MAX, rankCost, rankCostBetween } from "./xp.mjs";
import { spellsKnown } from "./casting.mjs";

/** The ten steps, in 01 §1's order. Nothing in a step depends on a step below it. */
export const STEPS = Object.freeze([
  "race", "class", "abilities", "career", "skills", "talents", "spells", "languages", "equipment", "numbers", "name"
]);

/** The step a caster's spells are chosen on (07 §5); a class that casts nothing skips it (2026-09-06). */
export const SPELLS_STEP = "spells";

/**
 * The abilities 01 §3 points a new character at: *"A 16 in the ability your
 * class fights or casts with."*
 *
 * Two halves, and a class may hold either, both or neither:
 *
 * - **`casting`** is the class item's own `castingAbility`. Seven of the nine
 *   carry one — Paladin and Warlock Charisma, Ranger, Priest, Shaman and Druid
 *   Wisdom, Mage Intelligence — and it is already what `castingMod` and the
 *   Spell DC read, so nothing here restates it.
 * - **`primary`** is the one the class FIGHTS with, which no document stored:
 *   `AZEROTH.primaryAbility` names the three the chapter leaves implicit
 *   (Warrior Strength, Rogue and Ranger Dexterity), keyed by identifier.
 *
 * **The Ranger holds both**, deliberately: it fights with Dexterity and casts
 * with Wisdom, and the creator marks both rather than picking a winner.
 *
 * @param {{identifier?: string, castingAbility?: string|null}|null} cls
 * @returns {{primary: string|null, casting: string|null}}
 */
export function primaryAbilities(cls) {
  const identifier = String(cls?.identifier ?? "").toLowerCase();
  return {
    primary: AZEROTH.primaryAbility?.[identifier] ?? null,
    casting: cls?.castingAbility ?? null
  };
}

/** Whether a class shows the spells step at all: it holds a Power pool that casts. */
export function castsSpells(cls) {
  return Boolean(cls) && (cls.power?.caster ?? "none") !== "none";
}

/** The steps a proposal walks: every step, less the spells step for a class that casts nothing. */
export function stepsFor(p = {}) {
  return STEPS.filter(key => key !== SPELLS_STEP || castsSpells(p.cls));
}

/** The three methods of 01 §3 (D-478). The table picks one; any player may. */
export const METHODS = Object.freeze(["array", "pointBuy", "roll"]);

/** The nine classes in 02 §7's order, which is how the class step lays its tiles (D-638); a Vitest reads it off the chapter. */
export const CLASS_ORDER = Object.freeze(["warrior", "paladin", "ranger", "rogue", "priest", "shaman", "mage", "warlock", "druid"]);

/** "Take these six numbers and assign each to an ability." */
export const ARRAY = Object.freeze([16, 14, 13, 12, 10, 8]);

/** Point buy: every ability starts at 8, thirty points, nothing above 16. */
export const POINT_BUY = Object.freeze({
  points: 30,
  floor: 8,
  ceiling: 16,
  cost: Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, 16: 12 })
});

/** Rolling: 4d6 drop the lowest, six times; reroll the whole set if no score reaches 14. */
export const ROLL_FLOOR = 14;
export const ROLL_DICE = 4;
export const ROLL_KEEP = 3;

/** 01 §4 (D-479): one tier 1 career, free, and a hundred experience for Ranks. */
export const STARTING_XP = 100;
export const STARTING_LEVEL = 1;
export const STARTING_CAREER_TIER = 1;

/** 01 §6 (D-480): ten silver, in copper (D-422). */
export const PURSE = 1000;

/**
 * A skill recorded on a feature's `known` list (D-636): Adaptable names one
 * skill that is always in-career, and the Human trait feature holds it as
 * `{uuid: "azeroth-rpg.skill.<key>", name}` so the Core tab's Known line
 * prints it and the skills rail prices it. A `known` uuid opening on this
 * prefix names a skill and nothing a `fromUuid` could find.
 */
export const SKILL_UUID_PREFIX = "azeroth-rpg.skill.";

export function skillUuid(key) {
  return `${SKILL_UUID_PREFIX}${key}`;
}

/** The skill key a feature's `known` list names, or null. */
export function skillFromKnown(known = []) {
  for (const entry of known ?? []) {
    const uuid = String(entry?.uuid ?? "");
    if (uuid.startsWith(SKILL_UUID_PREFIX)) {
      const key = uuid.slice(SKILL_UUID_PREFIX.length);
      if (key in AZEROTH.skills) return key;
    }
  }
  return null;
}

/* -------------------------------------------- */
/*  Abilities                                    */
/* -------------------------------------------- */

/** The point-buy cost of one score, or null outside the ladder. */
export function pointBuyCost(score) {
  const cost = POINT_BUY.cost[Number(score)];
  return cost === undefined ? null : cost;
}

/** The points a set of scores spends. A score off the ladder counts nothing; `validate` refuses it. */
export function pointBuyTotal(scores = {}) {
  return ABILITIES.reduce((sum, key) => sum + (pointBuyCost(scores?.[key]) ?? 0), 0);
}

/** The three highest of four dice, summed — one rolled score. */
export function keepHighest(faces = [], keep = ROLL_KEEP) {
  return [...faces].map(Number).sort((a, b) => b - a).slice(0, keep).reduce((s, n) => s + n, 0);
}

/** Whether a rolled set stands: six scores and one of them at 14 or better. */
export function rollFloorMet(set) {
  return Array.isArray(set) && set.length === ABILITIES.length && Math.max(...set.map(Number)) >= ROLL_FLOOR;
}

/** Whether two lists hold the same values the same number of times. */
export function sameMultiset(a = [], b = []) {
  const sortNums = list => [...list].map(Number).sort((x, y) => x - y);
  const x = sortNums(a);
  const y = sortNums(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/* -------------------------------------------- */
/*  Race, languages, career, skills              */
/* -------------------------------------------- */

/** The side a people belongs to (02 §1), or null for the three that belong to neither. */
export function sideFor(race) {
  const id = race?.identifier ?? null;
  return id && id in AZEROTH.RACE_SIDE ? AZEROTH.RACE_SIDE[id] : null;
}

/**
 * 02 §4: your own tongue and Common or Orcish by the side that raised you.
 * A Human's own tongue is Common, so a Human speaks one language; nobody
 * starts bilingual across the war.
 */
export function languagesFor(race, side = null) {
  const own = Array.isArray(race?.languages) ? race.languages : [];
  const raised = side ?? sideFor(race);
  const out = [...own];
  const tongue = raised ? AZEROTH.SIDE_LANGUAGE[raised] : null;
  if (tongue && !out.includes(tongue)) out.push(tongue);
  return out;
}

/** Whether a race may take a class (02 §3's matrix, carried on the race item). */
export function classOpenTo(race, cls) {
  return Boolean(race?.classes?.includes(cls?.name));
}

/**
 * The skills at the cheap rate: the career's In-career list, plus the one a
 * Human's Adaptable names ("always in-career for you, whatever career you
 * hold", 02 §5).
 */
export function inCareerSkills({ career = null, adaptable = null } = {}) {
  const keys = new Set(career?.inCareer ?? []);
  if (adaptable) keys.add(adaptable);
  return keys;
}

/** What a spread of Ranks costs from Rank 0, at each skill's rate (02 §8). */
export function rankSpend(ranks = {}, inCareer = new Set()) {
  let total = 0;
  for (const [key, rank] of Object.entries(ranks)) {
    total += rankCostBetween(0, Number(rank) || 0, inCareer.has(key));
  }
  return total;
}

/** The ledger rows a spread of Ranks writes: one per Rank bought, oldest first. */
export function rankLedger(ranks = {}, inCareer = new Set()) {
  const rows = [];
  for (const key of Object.keys(AZEROTH.skills)) {
    const rank = Number(ranks?.[key]) || 0;
    for (let r = 1; r <= rank; r++) {
      rows.push({ kind: "rank", skill: key, rank: r, amount: rankCost(r, inCareer.has(key)) });
    }
  }
  return rows;
}

/** The spells a class grants at level 1 (07 §5): full `4 + mod`, half `2 + mod`, none for the rest. */
export function spellsRequired(cls, abilities = {}) {
  const caster = cls?.power?.caster ?? "none";
  if (caster === "none" || !cls?.castingAbility) return 0;
  return spellsKnown({ caster, castingMod: abilityModifier(abilities?.[cls.castingAbility] ?? 10), tier: 1 });
}

/* -------------------------------------------- */
/*  Equipment                                    */
/* -------------------------------------------- */

/**
 * What one row costs: the item's price, null for an Augment an order issues
 * (08 §9), doubled on a suit for an ogre — "armor must be made to fit you at
 * double price" (02 §5's Great Frame). A shield is not made to fit.
 */
export function priceOf(item, race = null) {
  const cost = Number.isFinite(item?.cost) ? item.cost : 0;
  const suit = item?.type === "armor" && !item?.shield;
  return suit && race?.identifier === "ogre" ? cost * 2 : cost;
}

/** The purse a list of rows spends. */
export function purseSpend(rows = [], race = null) {
  return rows.reduce((sum, row) => sum + priceOf(row, race) * (Number(row?.quantity) || 1), 0);
}

/**
 * The class's suggested kit as rows, each looked up in the catalogue by name
 * and pack (01 §6, D-636). A kit row the catalogue lacks is dropped and
 * named, so the window can say so rather than pricing a ghost.
 *
 * @param {object} cls
 * @param {(name: string, type: string) => object|null} find
 * @returns {{rows: object[], missing: string[]}}
 */
export function kitRows(cls, find) {
  const rows = [];
  const missing = [];
  for (const row of cls?.kit ?? []) {
    const item = find(row.name, row.type);
    if (!item) { missing.push(row.name); continue; }
    rows.push({ ...item, quantity: row.quantity ?? 1, road: Boolean(row.road) });
  }
  return { rows, missing };
}

/** The suit worn (the first non-shield armor row) and whether a shield is carried. */
export function wornFrom(rows = []) {
  const suit = rows.find(r => r.type === "armor" && !r.shield) ?? null;
  const shield = rows.find(r => r.type === "armor" && r.shield) ?? null;
  return { suit, shield };
}

/* -------------------------------------------- */
/*  The kit, and whether it fits (D-735, D-736)  */
/* -------------------------------------------- */

/**
 * One kit row as the bag law reads it.
 *
 * The catalogue spreads a pack item's system FLAT onto the row
 * (`creator.mjs#load` builds `{uuid, name, img, type, ...system}`), so this
 * puts it back where `rules/slots.mjs` looks for it. The id is the row's
 * position, which is enough for a ledger over a kit that does not exist yet
 * and is what makes `arrange`'s writes matchable below.
 */
function kitItem(row, index, equipped) {
  return {
    id: `kit${index}`,
    name: row?.name ?? "",
    type: row?.type ?? "gear",
    sort: index,
    system: { ...row, equipped, container: null }
  };
}

/**
 * The kit rows that arrive EQUIPPED (D-736).
 *
 * 01 §6's kit is what the character walks out of creation with, so a Backpack
 * in it is on their back rather than inside itself: an unequipped container
 * adds no bag slots at all (08 §11), and the kit would then have to fit in the
 * sixteen-odd the character has on their own.
 *
 * The suit, the shield and the first weapon were already marked; this adds up
 * to four general containers, one of each counted kind and one mount, in the
 * cart's own order. **`plan()` and `validate` both read it**, so what the
 * window refuses and what Finish writes cannot disagree.
 *
 * @param {object[]} rows   `p.equipment`
 * @returns {Set<object>}   the row objects, by identity
 */
export function equippedKit(rows = []) {
  const list = rows ?? [];
  const out = new Set();
  const { suit, shield } = wornFrom(list);
  if (suit) out.add(suit);
  if (shield) out.add(shield);
  const weapon = list.find(r => r.type === "weapon");
  if (weapon) out.add(weapon);

  // The mount first, because the Saddlebags' own row adds nothing without one
  // and the cart may hold them in either order.
  const mount = list.find(row => isMount(kitItem(row, 0, false)));
  if (mount) out.add(mount);

  let general = 0;
  const kinds = new Set();
  for (const [i, row] of list.entries()) {
    if (out.has(row)) continue;
    const item = kitItem(row, i, false);
    // One mount or vehicle at a time; the rest travel in the cart unridden.
    if (isMount(item)) continue;
    const held = wellsOf(item, { mounted: Boolean(mount) });
    if (held.reason || held.wells <= 0) continue;
    if (held.of) {
      if (kinds.has(held.of)) continue;
      kinds.add(held.of);
    } else {
      if (general >= MAX_CONTAINERS) continue;
      general += 1;
    }
    out.add(row);
  }
  return out;
}

/** The kit as items, carrying the marks `plan()` will write. */
export function kitItems(p = {}) {
  const rows = p.equipment ?? [];
  const equipped = equippedKit(rows);
  return rows.map((row, i) => kitItem(row, i, equipped.has(row)));
}

/**
 * The base pack's bag slots for a proposal: 16 plus the Strength modifier,
 * times the size rung, times Pack Hobgoblin (05, 08 §11; D-735).
 *
 * The racial pick is read by NAME, because 02's own talent rows carry a name
 * and a tier and nothing else; `grantRaceTalents` slugifies the same name into
 * the identifier the table is keyed by, so the two agree by construction.
 */
export function bagSlotsFor(p = {}) {
  return baseCapacity({
    strMod: abilityModifier(Number(p.abilities?.str) || 10),
    size: p.race?.size ?? "medium",
    factor: carryFactor(p.racialTalent?.name
      ? [{ identifier: classKey(p.racialTalent.name), race: p.race?.name ?? "", taken: 1 }]
      : [])
  });
}

/**
 * How many bag slots the kit is OVER, once everything has been put where it
 * fits — which is exactly what Finish does after the grant.
 *
 * `arrange` is the same call the creator makes on the real items, so a kit the
 * window passes is a kit that lands; a kit that would leave a panel reading
 * over is refused here in words instead.
 */
export function kitOverBy(p = {}) {
  const kit = kitItems(p);
  const base = bagSlotsFor(p);
  const writes = arrange(kit, base);
  const settled = kit.map(item => {
    const write = writes.find(w => w._id === item.id);
    return write ? { ...item, system: { ...item.system, ...write.system } } : item;
  });
  return ledger(settled, base).over;
}

/** Whether the class's Access covers an item (02 §7). Weapons are prose, so only armor answers. */
export function accessNote(item, cls) {
  if (!cls || item?.type !== "armor") return null;
  if (item.shield) return cls.shields ? null : "shieldAccess";
  const category = item.category ?? "none";
  return category === "none" || cls.armor?.includes(category) ? null : "armorAccess";
}

/* -------------------------------------------- */
/*  The numbers (01 §7, 05)                      */
/* -------------------------------------------- */

/**
 * Every figure the sheet will show, computed from the proposal alone.
 * @param {object} p  The proposal (see `validate`).
 */
export function numbersFor(p = {}) {
  const level = STARTING_LEVEL;
  const tier = tierForLevel(level);
  const proficiency = proficiencyBonus(level);
  const scores = Object.fromEntries(ABILITIES.map(k => [k, Number(p.abilities?.[k]) || 10]));
  const mods = Object.fromEntries(ABILITIES.map(k => [k, abilityModifier(scores[k])]));

  const { suit, shield } = wornFrom(p.equipment ?? []);
  const effects = suitEffects(suit?.category ?? "none", [], { shield: Boolean(shield) });
  const ap = { ...effects.armorPoints };
  ap.body += (Number(suit?.apBonus) || 0) + (Number(shield?.apBonus) || 0);

  const cls = p.cls ?? null;
  const castingAbility = cls?.castingAbility ?? null;
  // 02 §6 adds the casting ability modifier to Mana; the pool rule reads it
  // off the class item, as the actor's derived data hands it over.
  const castingMod = castingAbility ? mods[castingAbility] : 0;
  const pools = poolsFor(cls ? [{ ...cls, itemId: null, level, castingMod }] : [], level);

  const skills = Object.fromEntries(Object.keys(AZEROTH.skills).map(key => [key, {
    rank: Number(p.ranks?.[key]) || 0,
    ability: AZEROTH.skillAbility[key],
    total: skillTotal({ score: scores[AZEROTH.skillAbility[key]], proficiency, rank: Number(p.ranks?.[key]) || 0 })
  }]));

  return {
    level, tier, proficiency,
    fortitude: fortitudeAt(level),
    resolve: 3 + tier,
    spiritTether: 3,
    scores, mods,
    health: healthMax({ frame: cls?.frame ?? "standard", conMod: mods.con, level }),
    defense: 10 + mods.dex + effects.defense,
    initiative: 10 + mods.dex,
    ap,
    speed: speedFrom(speedParts({ raceSpeed: p.race?.speed ?? null, armorSpeed: effects.speed, encumbering: effects.encumbering })),
    // BAG SLOTS, not pounds (D-735): 16 plus the Strength modifier, times the
    // size rung, times Pack Hobgoblin. `bagSlotsFor` is the one place it is
    // worked out, so the number the window shows is the number `validate`
    // holds the kit to.
    carry: bagSlotsFor(p),
    momentum: pools.momentum ? { name: pools.momentum.name, value: 0, max: pools.momentum.max } : null,
    power: pools.power ? { name: pools.power.name, value: pools.power.max, max: pools.power.max } : null,
    spellDC: castingAbility ? spellDC({ score: scores[castingAbility], proficiency }) : null,
    spellsKnown: spellsRequired(cls, scores),
    attack: { melee: mods.str + proficiency, ranged: mods.dex + proficiency },
    skills,
    languages: languagesFor(p.race, p.side),
    spent: purseSpend(p.equipment ?? [], p.race),
    coin: PURSE - purseSpend(p.equipment ?? [], p.race)
  };
}

/* -------------------------------------------- */
/*  Validation                                   */
/* -------------------------------------------- */

/**
 * Hold a proposal to 01. Reasons refuse; notes are the table's to weigh.
 *
 * The proposal is plain data:
 *   race        {identifier, name, size, speed, classes[], talents[{name, tier}], languages[]}
 *   cls         {identifier, name, frame, armor[], shields, weapons, momentum, power, castingAbility, schools[], kit[]}
 *   method      "array" | "pointBuy" | "roll"
 *   abilities   {str..cha: number|null}
 *   rolled      number[] | null
 *   career      {name, tier, entry, inCareer[], side}
 *   allowTier2  the GM's toggle (03 §3)
 *   ranks       {skillKey: rank}
 *   adaptable   a skill key, for a Human
 *   racialTalent {name, tier} — a row of race.talents
 *   classTalent {identifier, name, tier, className}
 *   spells      [{uuid, name, tier, school, classes[]}]
 *   side        "alliance" | "horde" | null
 *   equipment   [{uuid, name, type, cost, quantity, category, shield, apBonus}]
 *   name, img, motive
 *
 * @returns {{ok: boolean, reasons: {code: string, step: string}[], notes: {code: string, step: string, data?: object}[]}}
 */
export function validate(p = {}) {
  const reasons = [];
  const notes = [];
  const refuse = (code, step, data) => reasons.push(data ? { code, step, data } : { code, step });
  const note = (code, step, data) => notes.push(data ? { code, step, data } : { code, step });

  // 1, 2 — race and class.
  if (!p.race) refuse("noRace", "race");
  if (!p.cls) refuse("noClass", "class");
  if (p.race && p.cls && !classOpenTo(p.race, p.cls)) refuse("classNotOpen", "class", { race: p.race.name, cls: p.cls.name });

  // 3 — abilities, by method.
  const scores = ABILITIES.map(k => p.abilities?.[k]);
  const assigned = scores.filter(s => Number.isFinite(s));
  if (!METHODS.includes(p.method)) refuse("noMethod", "abilities");
  if (assigned.length < ABILITIES.length) refuse("abilityUnassigned", "abilities");
  else {
    for (const s of assigned) if (!isNaturalScore(s)) { refuse("scoreUnnatural", "abilities", { score: s }); break; }
    if (p.method === "array") {
      if (assigned.some(s => !ARRAY.includes(s))) refuse("arrayValueOutside", "abilities");
      else if (!sameMultiset(assigned, ARRAY)) refuse("arrayValueTwice", "abilities");
    } else if (p.method === "pointBuy") {
      if (assigned.some(s => s < POINT_BUY.floor || s > POINT_BUY.ceiling)) refuse("pointBuyRange", "abilities");
      else if (pointBuyTotal(p.abilities) > POINT_BUY.points) refuse("pointBuyOver", "abilities", { spent: pointBuyTotal(p.abilities) });
    } else if (p.method === "roll") {
      if (!Array.isArray(p.rolled) || p.rolled.length !== ABILITIES.length) refuse("rollNoSet", "abilities");
      else if (!rollFloorMet(p.rolled)) refuse("rollBelowFloor", "abilities");
      else if (!sameMultiset(assigned, p.rolled)) refuse("rollNotFromSet", "abilities");
    }
  }

  // 4 — career.
  if (!p.career) refuse("noCareer", "career");
  else {
    const tier = Number(p.career.tier) || 1;
    if (tier > STARTING_CAREER_TIER && !(p.allowTier2 && tier === 2)) refuse("careerTier", "career", { tier });
    if (p.allowTier2 && tier === 2) note("tier2Allowed", "career");
    note("entryJudgement", "career", { entry: p.career.entry ?? "" });
    const side = sideFor(p.race);
    if (p.career.side && p.career.side !== "anyone" && p.career.side !== side) {
      note("careerSide", "career", { side: p.career.side });
    }
  }

  // 5 — the hundred experience.
  const inCareer = inCareerSkills({ career: p.career, adaptable: p.adaptable });
  for (const [key, rank] of Object.entries(p.ranks ?? {})) {
    const r = Number(rank);
    if (!(key in AZEROTH.skills) || !Number.isInteger(r) || r < 0 || r > RANK_MAX) { refuse("rankRange", "skills", { skill: key }); break; }
  }
  const spent = rankSpend(p.ranks ?? {}, inCareer);
  if (spent > STARTING_XP) refuse("xpOver", "skills", { spent });
  else if (spent < STARTING_XP) note("xpHeld", "skills", { held: STARTING_XP - spent });
  if (p.race?.identifier === "human" && !p.adaptable) refuse("noAdaptable", "skills");

  // 6 — one racial talent, one class talent, the spells a caster knows.
  if (!p.racialTalent) refuse("noRacialTalent", "talents");
  else {
    const row = p.race?.talents?.find(t => t.name === p.racialTalent.name);
    if (!row) refuse("racialTalentNotOfRace", "talents", { name: p.racialTalent.name });
    else if ((row.tier ?? 1) > tierForLevel(STARTING_LEVEL)) refuse("racialTalentTier", "talents", { name: row.name });
  }
  if (!p.classTalent) refuse("noClassTalent", "talents");
  else {
    if (p.cls && p.classTalent.className !== p.cls.name) refuse("classTalentNotOfClass", "talents", { name: p.classTalent.name });
    else if ((p.classTalent.tier ?? 1) > 1) refuse("classTalentTier", "talents", { name: p.classTalent.name });
  }
  const required = spellsRequired(p.cls, p.abilities);
  const chosen = p.spells ?? [];
  if (chosen.length !== required) refuse("spellCount", "spells", { required, chosen: chosen.length });
  for (const spell of chosen) {
    if ((spell.tier ?? 1) > 1) { refuse("spellTier", "spells", { name: spell.name }); break; }
    if (p.cls && !p.cls.schools?.includes(spell.school)) { refuse("spellSchool", "spells", { name: spell.name }); break; }
    if (p.cls && Array.isArray(spell.classes) && spell.classes.length && !spell.classes.includes(p.cls.name)) {
      refuse("spellRestricted", "spells", { name: spell.name }); break;
    }
  }

  // 7 — languages: the three peoples of neither side say which raised them.
  if (p.race && sideFor(p.race) === null && !p.side) refuse("sideUnchosen", "languages");

  // 8 — the purse, and the class's Access.
  const spend = purseSpend(p.equipment ?? [], p.race);
  if (spend > PURSE) refuse("purseOverspent", "equipment", { copper: spend });
  for (const row of p.equipment ?? []) {
    const code = accessNote(row, p.cls);
    if (code) note(code, "equipment", { name: row.name });
    if (row.type === "gear" && row.cost === null) note("augmentIssued", "equipment", { name: row.name });
  }
  if (p.race?.identifier === "ogre" && (p.equipment ?? []).some(r => r.type === "armor" && !r.shield)) {
    note("ogreArmorPrice", "equipment");
  }
  if (p.cls && p.cls.weapons && !/^any\b/i.test(p.cls.weapons)) note("weaponAccess", "equipment", { weapons: p.cls.weapons });
  // **AND THE KIT HAS TO FIT** (05 *Speed and movement*, 08 §11; D-735). The
  // containers in it are worn, so they add their own bag slots; what is left
  // over is what the character could not carry out of the door. A REASON
  // rather than a note: Finish embeds under the bypass, so nothing downstream
  // would refuse it and the character would simply start over capacity.
  const over = kitOverBy(p);
  if (over > 0) refuse("noRoom", "equipment", { over });

  // 10 — a name.
  if (!String(p.name ?? "").trim()) refuse("noName", "name");

  return { ok: reasons.length === 0, reasons, notes };
}

/* -------------------------------------------- */
/*  The writes                                   */
/* -------------------------------------------- */

/**
 * What Finish writes, as plain data the window materialises: the actor's
 * own fields, the documents to embed, the talent picks, and the update that
 * follows the grant. Computed even for a refused proposal, so a test can
 * read it; the window never applies one `validate` refuses.
 */
export function plan(p = {}) {
  const numbers = numbersFor(p);
  const inCareer = inCareerSkills({ career: p.career, adaptable: p.adaptable });
  const ranks = Object.fromEntries(Object.entries(p.ranks ?? {}).filter(([, r]) => (Number(r) || 0) > 0).map(([k, r]) => [k, Number(r)]));
  const ledger = rankLedger(ranks, inCareer);
  const spent = ledger.reduce((s, row) => s + row.amount, 0);
  const size = p.race?.size ?? "medium";

  const embeds = [];
  if (p.race?.uuid) embeds.push({ uuid: p.race.uuid, kind: "race" });
  if (p.cls?.uuid) embeds.push({ uuid: p.cls.uuid, kind: "class" });
  if (p.career?.uuid) embeds.push({ uuid: p.career.uuid, kind: "career" });
  for (const spell of p.spells ?? []) embeds.push({ uuid: spell.uuid, kind: "spell" });
  // THE SUIT, THE SHIELD, THE FIRST WEAPON — AND THE CONTAINERS AND THE MOUNT
  // (D-736). `equippedKit` is the one place that decides, and `validate` asks
  // it the same question before it judges whether the kit fits.
  const worn = equippedKit(p.equipment ?? []);
  for (const row of p.equipment ?? []) {
    const system = {};
    if (worn.has(row)) system.equipped = true;
    if ((Number(row.quantity) || 1) > 1 || row.type === "gear") system.quantity = Number(row.quantity) || 1;
    embeds.push({ uuid: row.uuid, kind: "equipment", system });
  }

  return {
    numbers,
    create: {
      name: String(p.name ?? "").trim(),
      type: "character",
      img: p.img || "icons/svg/mystery-man.svg",
      system: {
        abilities: Object.fromEntries(ABILITIES.map(k => [k, { value: numbers.scores[k] }])),
        health: { value: numbers.health, max: numbers.health },
        xp: { earned: STARTING_XP, spent },
        languages: numbers.languages,
        coin: Math.max(0, numbers.coin),
        motive: String(p.motive ?? "").trim()
      },
      // The PC token (the lead, 2026-09-13): friendly, named, linked, with a
      // Health bar. Spread from `rules/tokens.mjs` rather than listed again,
      // so the creator's door and `AzerothActor#_preCreate` cannot drift - the
      // creator passes `prototypeToken`, and `_preCreate` only fills in what
      // the create data does NOT name.
      prototypeToken: {
        // `characterToken()`, never the frozen table: `DataField#clean`
        // mutates what it is given IN PLACE and throws on a frozen `bar1`.
        ...characterToken(),
        width: tokenSize(size),
        height: tokenSize(size)
      }
    },
    embeds,
    picks: {
      racial: p.racialTalent?.name ?? null,
      classTalent: p.classTalent?.identifier ?? null,
      adaptable: p.adaptable ?? null
    },
    update: {
      "flags.azeroth-rpg.skillRanks": ranks,
      "system.xp.spent": spent,
      ledger
    }
  };
}
