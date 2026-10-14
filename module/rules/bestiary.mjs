/**
 * Building a creature (13 §5, 14 §1, D4 §10.2; D-637). Pure functions, no
 * Foundry imports (CLAUDE.md §3): the NPC generator is a form over these.
 *
 * Two things live here and nowhere else in code. The BANDS - 13 §5's tier
 * table, its weight-class table and its Boss table - which until now sat
 * only in the chapter, in D1 and in `tools/check-bestiary.ps1`'s Python; a
 * Vitest reads 13 §5 from disk and holds the frozen data to it, so the two
 * cannot drift. And REVIEW - the checker's hard invariants as refusals and
 * its band deviations as notes, because theme sets the block and math checks
 * it (D-104): a GM's creature two off the Defense band is theirs to keep, a
 * Beast with no Handling DC is not a creature the chapter would print.
 */

import { AZEROTH } from "../config.mjs";
import { htmlFromProse, proseFromHtml } from "./prose.mjs";
import { cleanAutomation, reviewAutomation } from "./ability-automation.mjs";
import { canSwarm, swarmExpectations, swarmsFrom } from "./swarm.mjs";
import { ABILITIES, SCORE_MAX_NATURAL, SCORE_MIN_NATURAL, abilityModifier } from "./abilities.mjs";
import { baseArmorPoints } from "./armor.mjs";
import { SIZES, flyingPace, isSize, tokenSize } from "./size.mjs";
import { initiativeFor } from "./initiative.mjs";
import { RANK_MAX } from "./xp.mjs";

/* -------------------------------------------- */
/*  13 §5's tables                               */
/* -------------------------------------------- */

/** "Take its numbers from the table" - a Standard, by tier. */
export const BAND = Object.freeze({
  health:  Object.freeze({ 1: 12, 2: 32, 3: 35, 4: 41 }),
  defense: Object.freeze({ 1: 12, 2: 14, 3: 16, 4: 18 }),
  bonus:   Object.freeze({ 1: 4, 2: 6, 3: 8, 4: 10 }),
  damage:  Object.freeze({ 1: 5, 2: 7, 3: 9, 4: 11 }),
  ap:      Object.freeze({ 1: 2, 2: 3, 3: 5, 4: 6 }),
  ward:    Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4 }),
  spellDC: Object.freeze({ 1: 15, 2: 16, 3: 17, 4: 20 })
});

/** "Then move the Health by weight class." Threat Share beside it. */
export const WEIGHTS = Object.freeze({
  chaff:    Object.freeze({ mult: 0.25, share: 0.25, extraAP: 0 }),
  soldier:  Object.freeze({ mult: 0.5, share: 0.5, extraAP: 0 }),
  standard: Object.freeze({ mult: 1, share: 1, extraAP: 0 }),
  elite:    Object.freeze({ mult: 2, share: 2, extraAP: 1 }),
  boss:     Object.freeze({ mult: null, share: null, extraAP: 0 })
});

/** "A Boss": Health a centre, the DC and the actions off the tier, what an action deals. */
export const BOSS = Object.freeze({
  health:       Object.freeze({ 1: 75, 2: 194, 3: 212, 4: 246 }),
  spellDC:      Object.freeze({ ...AZEROTH.BOSS_DC }),
  power:        Object.freeze({ 1: 8, 2: 10, 3: 12, 4: 16 }),
  actions:      Object.freeze({ ...AZEROTH.BOSS_ACTIONS }),
  actionDamage: Object.freeze({ 1: 4, 2: 6, 3: 8, 4: 10 }),
  healthTolerance: 0.2,
  defenseSlack: 2,
  // 14 §1: "A Boss also ignores the first two Critical Injuries it takes in an
  // encounter. That is true of every Boss in this chapter and no block repeats
  // it." Nothing read it and every Boss took every injury (the lead,
  // 2026-09-07).
  criticalsIgnored: 2
});

/**
 * Whether this Critical Injury is one the creature shrugs off.
 *
 * ENCOUNTER-SCOPED, and the encounter is what makes it meaningful: a Boss
 * struck with no fight running has no encounter to count against, so the
 * caller passes no count and the injury lands. `taken` is how many it has
 * already shrugged off in this fight.
 *
 * @param {string} weightClass
 * @param {number} taken
 * @returns {boolean}
 */
export function ignoresCritical(weightClass, taken = 0) {
  if (weightClass !== "boss") return false;
  return Math.max(0, Math.trunc(Number(taken) || 0)) < BOSS.criticalsIgnored;
}

/**
 * THE POOLS EVERY CREATURE HOLDS - and these numbers are THE TOOL'S, not the
 * book's.
 *
 * 13 §5 publishes a Power row for a **Boss** and for nothing else, and no
 * Momentum anywhere, so 123 of the 164 creatures had no Power at all and none
 * had Momentum: an ability written to spend either had nothing to spend (the
 * lead, 2026-09-07). The same shape as the loot generator's rates (D-666) -
 * the tool supplies what the book leaves to the table, and says so.
 *
 * Power is half the Boss row of the same tier, rounded up, which puts a
 * standard creature's pool at about two of its own abilities a fight.
 * Momentum is 05 §11's higher cap, the one Rage, Zeal and Ferocity take.
 *
 * A block that STATES a pool keeps it: this is a floor for the blocks that
 * state none, never an override.
 */
export const CREATURE_POOLS = Object.freeze({
  power: Object.freeze({ 1: 4, 2: 5, 3: 6, 4: 8 }),
  momentum: 10
});

/**
 * The pool maxima a creature holds, the block's own where it states them.
 *
 * @param {{weightClass?: string, tier?: number, power?: object, momentum?: object}} sys
 * @returns {{power: number, momentum: number}}
 */
export function creaturePools(sys = {}) {
  const tier = Math.min(4, Math.max(1, Math.trunc(Number(sys.tier) || 1)));
  const stated = sys.power?.max;
  const power = stated === null || stated === undefined
    ? (sys.weightClass === "boss" ? (BOSS.power[tier] ?? 0) : (CREATURE_POOLS.power[tier] ?? 0))
    : stated;
  const momentum = sys.momentum?.max ?? CREATURE_POOLS.momentum;
  return { power, momentum };
}

/**
 * How high a creature casts (D-706). 14 §1 states it and D1 §5.3e carries the
 * reasoning: the ceiling is 07 §4's full-caster column read at the creature's
 * tier, because a creature is rated on the same four tiers a character passes
 * through (14 §1).
 *
 * **Tier 5 is outside the ladder rather than above it** (07 §4) - it is found,
 * so a tier 4 Boss may hold ONE besides its ceiling. The allowance is a count,
 * and a second tier 5 spell is refused.
 *
 * @param {{tier?: number, weightClass?: string}} sys
 * @returns {{ceiling: number, tierFive: number}}
 */
export function spellTierCeiling(sys = {}) {
  const tier = Math.min(4, Math.max(1, Math.trunc(Number(sys.tier) || 1)));
  return { ceiling: tier, tierFive: sys.weightClass === "boss" && tier === 4 ? 1 : 0 };
}

/** D4 §10.2's closed vocabularies. */
export const TYPES = Object.freeze(Object.keys(AZEROTH.creatureTypes));
export const MARKERS = Object.freeze(["Mindless"]);
export const WEIGHT_CLASSES = Object.freeze(Object.keys(AZEROTH.weightClasses));
export const TIERS = Object.freeze([1, 2, 3, 4]);

/**
 * D-531: an attack whose last word is one of these reaches past melee and
 * names a distance. Ported from tools/check-bestiary.ps1, with `...bow` and
 * `...bolt` for the single-word compounds.
 */
export const RANGED_LAST_WORDS = Object.freeze(("sling crossbow rifle pistol cannon blunderbuss repeater "
  + "carbine boomstick musket javelin dart harpoon bolt web net flask bomb charge arrow quarrel").split(" "));

/** D-543: a Boss Action that brings bodies onto the field, read for the effect rather than one idiom. */
export const BRINGS = /act(s)? on (his|her|its|the \w+'s) side|stands? as a\b|step out of|come(s)? (in|over|up|through)|arrive(s)? through|out of the (floor|ground|graves|walls|chamber)|comes through/i;

/** 14 §13, where a class feature's own creatures live (D-547, D-707). */
const SUMMONED_SECTION = /^13\./;

/**
 * A shaman's totem (D-707). Six of the seven do not attack at all, so their
 * blocks carry no attacks table and `review` must not refuse them for it —
 * every other creature in 14 keeps that refusal, and a creature with no way
 * to hurt anybody is otherwise a stat block somebody forgot to finish.
 *
 * **SCOPED TO 14 §13.** The name alone would exempt anything a GM called
 * "… Totem" in the NPC generator, and the generator's whole job is to refuse
 * a half-made creature. A snapshot with no source is not a chapter entry and
 * is not exempt.
 */
export function isTotemEntry({ name = "", source = null } = {}) {
  if (!/\sTotem$/.test(String(name).trim())) return false;
  const section = String(source?.section ?? "").trim();
  return SUMMONED_SECTION.test(section);
}

/* -------------------------------------------- */
/*  The band                                     */
/* -------------------------------------------- */

function tierOf(tier) {
  const t = Math.trunc(Number(tier)) || 1;
  return Math.min(4, Math.max(1, t));
}

/**
 * The figures 13 §5 suggests for a weight class at a tier: what a form
 * fills in before the GM touches anything.
 */
export function bandFor({ weightClass = "standard", tier = 1 } = {}) {
  const t = tierOf(tier);
  const weight = WEIGHTS[weightClass] ?? WEIGHTS.standard;
  const boss = weightClass === "boss";
  const actions = boss ? { min: BOSS.actions[t], max: BOSS.actions[t] }
    : weightClass === "elite" && t >= 3 ? { min: 0, max: 1 }
    : { min: 0, max: 0 };
  return {
    tier: t,
    health: boss ? BOSS.health[t] : Math.max(1, Math.round(BAND.health[t] * weight.mult)),
    healthTolerance: boss ? BOSS.healthTolerance : null,
    defense: BAND.defense[t],
    bonus: BAND.bonus[t],
    damage: BAND.damage[t],
    ap: BAND.ap[t] + weight.extraAP,
    ward: BAND.ward[t],
    spellDC: boss ? BOSS.spellDC[t] : BAND.spellDC[t],
    power: boss ? BOSS.power[t] : null,
    bossActions: actions,
    actionDamage: boss ? BOSS.actionDamage[t] : null,
    share: weight.share
  };
}

/** D-522: an attack's Bonus is the governing attribute's modifier plus the tier's Proficiency, `1 + tier`. */
export function attackBonus(mod = 0, tier = 1) {
  return (Math.trunc(Number(mod)) || 0) + 1 + tierOf(tier);
}

/**
 * A trait as 08 §5 names it: `Pierce 2` → `Pierce`, `Thrown (40 ft)` →
 * `Thrown`, the checker's `base()`. The traits pack names its rated traits
 * with a placeholder — `Pierce X`, `Impale (X)`, `Thrown (range)` — and the
 * bare `X` is stripped too, so a pack name and a rated use meet on the same
 * base (D-645).
 */
export function baseTrait(name = "") {
  return String(name).replace(/\s*\(.*\)\s*$/, "").replace(/\s+\d+\s*$/, "").replace(/\s+X\s*$/, "").trim();
}

/**
 * What a pack trait's name leaves for the GM to fill in: `number` for `X`
 * or `(X)`, `range` for `(range)`, `school` for `(School)`, `type` for
 * `(Type)`, and null for a trait that is complete as named.
 */
export function traitPlaceholder(name = "") {
  const m = /\(\s*([A-Za-z]+)\s*\)\s*$/.exec(String(name));
  const word = m ? m[1].toLowerCase() : (/\s+X\s*$/.test(String(name)) ? "x" : null);
  if (word === null) return null;
  if (word === "x") return "number";
  if (["range", "school", "type"].includes(word)) return word;
  return null;
}

/* -------------------------------------------- */
/*  A suggestion                                 */
/* -------------------------------------------- */

/**
 * A proposed `system` block from a short spec, every number off the band
 * (13 §5) and every rule 14 §1 states: Initiative off Dexterity as a
 * suggestion, AP typical or off a worn category with the Elite's extra
 * point, a location the creature lacks left null, Int and Cha absent on a
 * Mindless thing, a Boss's DC and Power off the Boss table, a lesser
 * caster's Power the GM's (the chapter prices none).
 *
 * @param {object} spec
 * @returns {object}  A partial NPC `system` the generator merges into its state.
 */
export function suggest(spec = {}) {
  const weightClass = WEIGHTS[spec.weightClass] ? spec.weightClass : "standard";
  const tier = tierOf(spec.tier);
  const band = bandFor({ weightClass, tier });
  const boss = weightClass === "boss";
  const marker = spec.typeMarker === "Mindless" ? "Mindless" : null;
  const scores = Object.fromEntries(ABILITIES.map(k => {
    const v = spec.abilities?.[k];
    const absent = marker && (k === "int" || k === "cha") && (v === null || v === undefined);
    return [k, absent ? null : (Number.isFinite(Number(v)) && v !== null ? Number(v) : 10)];
  }));
  const dexMod = scores.dex === null ? 0 : abilityModifier(scores.dex);

  let ap;
  if (spec.armor && spec.armor !== "typical" && AZEROTH.ARMOR_AP[spec.armor]) {
    ap = baseArmorPoints(spec.armor);
  } else {
    const n = BAND.ap[tier];
    ap = { body: n, head: Math.max(0, n - 1), limb: Math.max(0, n - 1) };
  }
  ap.body += WEIGHTS[weightClass].extraAP;
  if (spec.hasHead === false) ap.head = null;
  if (spec.hasLimbs === false) ap.limb = null;

  const caster = Boolean(spec.caster);
  const attackAbility = ABILITIES.includes(spec.attackAbility) ? spec.attackAbility : "str";
  const attackMod = scores[attackAbility] === null ? 0 : abilityModifier(scores[attackAbility]);

  return {
    weightClass, tier,
    creatureType: TYPES.includes(spec.creatureType) ? spec.creatureType : "humanoid",
    typeMarker: marker,
    size: isSize(spec.size) ? spec.size : "medium",
    race: spec.race ?? null,
    threatShare: band.share,
    health: { value: band.health, max: band.health },
    defense: band.defense,
    ap,
    ward: spec.ward && AZEROTH.schools[spec.ward] ? { [spec.ward]: band.ward } : {},
    speed: 30,
    flies: Boolean(spec.flies),
    flyingSpeed: spec.flies ? flyingPace(tier) : null,
    initiative: initiativeFor({ dexMod }),
    abilities: Object.fromEntries(ABILITIES.map(k => [k, { value: scores[k] }])),
    attack: { ability: attackAbility, bonus: attackBonus(attackMod, tier), damage: band.damage },
    spells: { dc: caster ? band.spellDC : null, names: [] },
    power: { name: null, value: boss && caster ? band.power : null, max: boss && caster ? band.power : null },
    momentum: { name: null, value: null, max: null },
    bossActionCount: band.bossActions.max,
    actionDamage: band.actionDamage
  };
}

/* -------------------------------------------- */
/*  Review                                       */
/* -------------------------------------------- */

const lower = s => String(s ?? "").toLowerCase();
const plainText = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Whether an attack reaches past melee by its name or its traits (D-531). */
export function reachesPastMelee(attack = {}) {
  const name = lower(attack.name).trim();
  const last = name.split(/\s+/).pop() ?? "";
  if (RANGED_LAST_WORDS.includes(last) || /bow$|bolt$/.test(last)) return true;
  return (attack.traits ?? []).some(t => /^thrown\b/i.test(String(t)));
}

/**
 * Hold a creature to the chapter. Reasons refuse; notes are D-104's licence
 * to deviate, printed beside Create.
 *
 * @param {{name: string, system: object}} doc
 * @param {object} [refs]
 * @param {Iterable<string>} [refs.spellNames]   07's spell names.
 * @param {Map<string, {tier: number, mana: number, prerequisite: ?string}>|object} [refs.spells]
 *   07's entries by name (D-706). `spellNames` still works on its own and is
 *   derived from this where both are absent, so an older caller is unchanged.
 * @param {Iterable<string>} [refs.traitNames]   08 §5's trait names, as `baseTrait` reads them.
 * @param {Map<string, string>|object} [refs.raceSizes]  02 §5's eleven peoples and their sizes.
 * @returns {{ok: boolean, reasons: {code: string, params?: object}[], notes: {code: string, params?: object}[]}}
 */
export function review(doc = {}, refs = {}) {
  const s = doc.system ?? {};
  const reasons = [];
  const notes = [];
  const refuse = (code, params) => reasons.push(params ? { code, params } : { code });
  const note = (code, params) => notes.push(params ? { code, params } : { code });

  const spells = refs.spells instanceof Map ? refs.spells
    : refs.spells ? new Map(Object.entries(refs.spells)) : null;
  const spellNames = refs.spellNames ? new Set([...refs.spellNames])
    : spells ? new Set(spells.keys()) : null;
  const traitNames = refs.traitNames ? new Set([...refs.traitNames].map(t => lower(baseTrait(t)))) : null;
  const raceSizes = refs.raceSizes instanceof Map ? refs.raceSizes
    : refs.raceSizes ? new Map(Object.entries(refs.raceSizes)) : null;

  const weightClass = s.weightClass;
  const boss = weightClass === "boss";
  const tier = Number(s.tier);
  const t = TIERS.includes(tier) ? tier : null;
  const band = t ? bandFor({ weightClass: WEIGHTS[weightClass] ? weightClass : "standard", tier: t }) : null;

  // ---- identity ----------------------------------------------------------
  if (!String(doc.name ?? "").trim()) refuse("NoName");
  if (!WEIGHTS[weightClass]) refuse("WeightClass");
  if (!t) refuse("Tier");
  if (!TYPES.includes(s.creatureType)) refuse("Type");
  if (s.typeMarker !== null && s.typeMarker !== undefined && !MARKERS.includes(s.typeMarker)) refuse("Marker", { marker: s.typeMarker });
  if (!isSize(s.size)) refuse("Size");
  if (s.race) {
    if (raceSizes && !raceSizes.has(s.race)) refuse("Race", { race: s.race });
    else if (raceSizes && raceSizes.get(s.race) !== s.size) refuse("RaceSize", { race: s.race, want: raceSizes.get(s.race), have: s.size });
  }
  // A swarm (13 §4, D-646): never an Elite or a Boss, from the chapter's count;
  // its share is its members'.
  const members = s.swarm?.members ?? null;
  const swarm = members !== null && members !== undefined;
  if (swarm) {
    const from = swarmsFrom(weightClass);
    if (from === null) refuse("SwarmWeight");
    else if (members < from) refuse("SwarmMembers", { members, from, weight: weightClass });
  }
  if (WEIGHTS[weightClass]) {
    const want = boss ? null : Math.round(WEIGHTS[weightClass].share * (swarm ? members : 1) * 100) / 100;
    const have = s.threatShare ?? null;
    if (boss ? have !== null : Number(have) !== want) refuse("ThreatShare", { want });
  }
  if (boss && !String(s.dungeon ?? "").trim()) refuse("BossDungeon");
  if (!boss && String(s.dungeon ?? "").trim()) refuse("DungeonNotBoss");
  const beast = s.creatureType === "beast";
  const handling = s.handlingDC ?? null;
  if (beast && handling === null) refuse("BeastHandling");
  if (!beast && handling !== null) refuse("HandlingNotBeast");
  if (s.corruption && !AZEROTH.corruptionTracks[s.corruption]) refuse("Corruption", { track: s.corruption });
  if (t && t >= 3) note("Tier3");

  // ---- the defense table ---------------------------------------------------
  // A slot the creature does not have prints `—` (D4 §10.2) - a Mindless
  // thing's Int and Cha, a banshee's Str, a totem's six - so a null is never
  // refused; a score that is there runs 3 to 20.
  const scores = {};
  for (const key of ABILITIES) {
    const v = s.abilities?.[key]?.value;
    if (v === null || v === undefined) { scores[key] = null; continue; }
    if (v < SCORE_MIN_NATURAL || v > SCORE_MAX_NATURAL) refuse("Score", { ability: key, value: v });
    scores[key] = Number(v);
  }
  const health = Number(s.health?.max ?? s.health?.value ?? 0);
  if (!(health >= 1)) refuse("HealthZero");
  if (band) {
    if (boss) {
      if (Math.abs(health - band.health) > band.health * BOSS.healthTolerance) note("BossHealth", { health, centre: band.health });
      if (Math.abs(Number(s.defense) - band.defense) > BOSS.defenseSlack) note("Defense", { defense: s.defense, band: band.defense });
    } else {
      if (swarm && swarmsFrom(weightClass) !== null) {
        const want = swarmExpectations({ weightClass, members, band });
        if (Math.abs(health - want.health) > members) note("SwarmHealth", { health, members, want: want.health });
        if (Number(s.defense) !== want.defense) note("SwarmDefense", { defense: s.defense, want: want.defense });
      } else {
        if (Math.abs(health - band.health) > 1) note("Health", { health, want: band.health });
        if (Number(s.defense) !== band.defense) note("Defense", { defense: s.defense, band: band.defense });
      }
    }
  }
  for (const [school, value] of Object.entries(s.ward ?? {})) {
    if (Number(value) >= 5) note("Ward", { value: Number(value), school });
  }

  // ---- attacks -------------------------------------------------------------
  const abilityNames = new Set([...(s.creatureAbilities ?? []), ...(s.bossActions ?? [])].map(a => lower(a?.name)));
  const attacks = Array.isArray(s.attacks) ? s.attacks : [];
  // A totem that does not attack carries no attacks table, and 14 §13 says so
  // (D-707). Everything else in the chapter has a row, and a creature with no
  // way to hurt anybody is a block somebody forgot to finish.
  if (!attacks.length && !isTotemEntry({ name: doc.name, source: s.source })) refuse("NoAttack");
  attacks.forEach((attack, index) => {
    if (!String(attack?.name ?? "").trim()) refuse("AttackName", { index: index + 1 });
    for (const trait of attack?.traits ?? []) {
      // `Range 100 ft` rides in the traits cell as the shot's distance (D-531); it is not a trait.
      if (/^range\s+\d+\s*ft$/i.test(String(trait).trim())) continue;
      const base = lower(baseTrait(trait));
      if (traitNames && !traitNames.has(base) && !abilityNames.has(lower(trait))) refuse("Trait", { attack: attack.name, trait });
    }
    if (reachesPastMelee(attack) && (attack.range === null || attack.range === undefined)) refuse("Range", { attack: attack.name });
    if (band) {
      const bonus = Number(attack?.bonus) || 0;
      if (bonus > band.bonus) note("Bonus", { attack: attack.name, bonus, band: band.bonus });
      const mods = ABILITIES.map(k => (scores[k] === null ? null : abilityModifier(scores[k]))).filter(m => m !== null);
      if (mods.length && !mods.some(m => attackBonus(m, t) === bonus)) note("BonusNoAttribute", { attack: attack.name, bonus, proficiency: 1 + t });
      if ((Number(attack?.damage) || 0) > band.damage) note("Damage", { attack: attack.name, damage: attack.damage, band: band.damage });
    }
  });

  // ---- spells ----------------------------------------------------------------
  const names = Array.isArray(s.spells?.names) ? s.spells.names : [];
  const dc = s.spells?.dc ?? null;
  if (spellNames) for (const name of names) if (!spellNames.has(name)) refuse("Spell", { name });
  if (names.length && dc === null) refuse("SpellDC");
  if (band && names.length && dc !== null && Number(dc) !== band.spellDC) note("SpellDC", { dc, want: band.spellDC });
  if (names.length && (s.power?.max === null || s.power?.max === undefined)) note("CasterNoPower");
  // D-706: the tier ceiling, the prerequisite rule and what the pool can buy.
  // 14 §1 states the first two; D1 §5.3e carries the reasoning.
  if (spells && names.length) {
    const { ceiling, tierFive } = spellTierCeiling({ tier: t ?? 1, weightClass });
    let fives = tierFive;
    for (const name of names) {
      const entry = spells.get(name);
      if (!entry) continue;
      const spellTier = Number(entry.tier);
      if (spellTier === 5) {
        // Tier 5 is found rather than reached (07 §4), so one is a signature
        // and a second is a spell list nobody can read.
        if (fives > 0) fives -= 1;
        else refuse("SpellTier", { name, tier: spellTier, ceiling });
      } else if (spellTier > ceiling) refuse("SpellTier", { name, tier: spellTier, ceiling });
      // 07 §9 makes a Prerequisite an effect gate as well as a learning gate:
      // the target must already be under the named spell or the effect does
      // nothing and the Mana is spent. A run with one and not the other holds
      // a spell that can never fire.
      const prerequisite = entry.prerequisite ?? null;
      if (prerequisite && !names.includes(prerequisite)) refuse("SpellPrerequisite", { name, prerequisite });
    }
    // A spell the pool cannot buy, the prerequisite paid in the same fight
    // because 07 §9 wants it live on the target. A note and never a refusal -
    // gear carries Mana (07 §6) and a once-a-day spell is legitimate (D-104).
    const power = creaturePools({ tier: t ?? 1, weightClass, power: s.power, momentum: s.momentum }).power;
    if (power) {
      for (const name of names) {
        const entry = spells.get(name);
        if (!entry) continue;
        const pre = entry.prerequisite ? spells.get(entry.prerequisite) : null;
        const mana = (Number(entry.mana) || 0) + (Number(pre?.mana) || 0);
        if (mana > power) note("SpellMana", { name, mana, power });
      }
    }
  }
  if (boss && band && s.power?.max !== null && s.power?.max !== undefined && Number(s.power.max) !== band.power) note("Power", { power: s.power.max, want: band.power });

  // ---- abilities and Boss Actions -------------------------------------------
  const bossActions = Array.isArray(s.bossActions) ? s.bossActions : [];
  if (band) {
    const { min, max } = band.bossActions;
    if (bossActions.length < min || bossActions.length > max) refuse("BossActions", { want: max, have: bossActions.length });
  }
  for (const action of bossActions) {
    const text = plainText(action?.description);
    const brings = BRINGS.test(text);
    const marked = Number(action?.cost) === 2;
    if (brings !== marked) note("SummonMark", { name: action?.name ?? "" });
  }
  // What Use does, held to the block (D-647): a cost off a pool it lacks
  // refuses; a figure that disagrees with the prose's one clear number notes.
  for (const entry of [...(s.creatureAbilities ?? []), ...bossActions]) {
    const r = reviewAutomation(entry, { momentum: s.momentum?.max ?? null, power: s.power?.max ?? null });
    for (const x of r.reasons) refuse(x.code, x.params);
    for (const x of r.notes) note(x.code, x.params);
  }
  if (boss && band) {
    for (const entry of [...(s.creatureAbilities ?? []), ...bossActions]) {
      const text = plainText(entry?.description);
      const dmg = text.match(/takes (\d+) damage/i);
      if (dmg && Number(dmg[1]) > band.actionDamage) note("ActionDamage", { name: entry.name, n: Number(dmg[1]), ceiling: band.actionDamage });
      const dcs = [...text.matchAll(/\bDC (\d+)/g)].map(m => Number(m[1]));
      for (const d of dcs) if (d !== band.spellDC) { note("ActionDC", { name: entry.name, dc: d, want: band.spellDC }); break; }
    }
  }
  for (const entry of s.creatureAbilities ?? []) {
    const raw = String(entry?.description ?? "");
    const points = /\b\d\d[AB]?-[A-Z][A-Z-]+\b|@UUID\[/i.test(raw);
    // The reference itself carries a chapter number; strip it before asking
    // whether anything mechanical is left (D-533).
    const text = plainText(raw.replace(/@UUID\[[^\]]*\](\{[^}]*\})?/g, " ").replace(/\b\d\d[AB]?-[A-Z][A-Z-]+\b/g, " "));
    const mechanical = /\d|\b(Test|Boon|Bane|damage|Health|Speed|Defense)\b/i.test(text)
      || Object.keys(AZEROTH.conditions).some(id => new RegExp(`\\b${id}\\b`, "i").test(text));
    if (points && !mechanical) note("AbilityDefers", { name: entry?.name ?? "" });
  }

  // ---- the keyword table -----------------------------------------------------
  for (const [key, rank] of Object.entries(s.skills ?? {})) {
    if (!(key in AZEROTH.skills)) { refuse("Skill", { skill: key }); continue; }
    const r = Number(rank?.rank ?? rank);
    if (!Number.isInteger(r) || r < 1 || r > RANK_MAX) refuse("Rank", { skill: key, rank: r });
  }
  for (const kind of s.resilience ?? []) if (!AZEROTH.resiliences[kind]) refuse("Resilience", { kind });
  for (const row of ["immune", "vulnerable"]) {
    for (const name of s[row] ?? []) if (!AZEROTH.damageTypes[lower(name)]) refuse("DamageType", { row, name });
  }
  for (const name of s.inflicts ?? []) if (!AZEROTH.conditions[lower(name)]) refuse("Inflicts", { name });
  const inflicts = new Set((s.inflicts ?? []).map(lower));
  const corpus = [...(s.creatureAbilities ?? []), ...bossActions].map(a => plainText(a?.description)).join(" ")
    + " " + attacks.flatMap(a => a?.traits ?? []).join(" ") + " " + plainText(s.behavior);
  for (const id of Object.keys(AZEROTH.conditions)) {
    if (inflicts.has(id)) continue;
    if (new RegExp(`\\b${id}\\b`, "i").test(corpus)) note("InflictsMissing", { condition: id });
  }
  if (!plainText(s.behavior)) refuse("Behavior");
  for (const field of ["lore", "tactics", "ecology"]) {
    const text = plainText(s[field]);
    const m = text.match(/\bDC \d+|\d+ damage\b/i);
    if (m) note("MechanicInProse", { field, match: m[0] });
  }

  return { ok: reasons.length === 0, reasons, notes };
}

/* -------------------------------------------- */
/*  Prose                                        */
/* -------------------------------------------- */

/**
 * A typed paragraph or two to the HTML the parser stores, and back.
 *
 * **BOTH LIVE IN `rules/prose.mjs` NOW** (the lead, 2026-09-14). The Forge's
 * Signature box wanted exactly this and had nothing, so a GM opening a pack
 * item saw `<p>` and `<strong>` in a plain textarea and reasonably typed tags
 * of their own. Re-exported by name here, because every caller in this file
 * and in `bestiary.test.mjs` imports them from `bestiary.mjs`.
 *
 * Written as an import plus a named export rather than `export { X } from`:
 * the re-export form binds no local name, and every `htmlFromProse(...)` call
 * below would be a reference error at render.
 */
export { htmlFromProse, proseFromHtml };

/* -------------------------------------------- */
/*  The generator's state                        */
/* -------------------------------------------- */

/** The window's state for a creature, read off a stored `system` (Rework, Start from). */
export function stateFromSystem(system = {}, { name = "", img = "" } = {}) {
  const s = system;
  return {
    name, img,
    identity: {
      weightClass: s.weightClass ?? "standard", tier: s.tier ?? 1,
      creatureType: s.creatureType ?? "humanoid", typeMarker: s.typeMarker ?? null,
      size: s.size ?? "medium", race: s.race ?? null, corruption: s.corruption ?? null,
      handlingDC: s.handlingDC ?? null, dungeon: s.dungeon ?? null,
      // A swarm of how many, of what (13 §4, D-646); `swarmBase` is the one
      // member's Health and Defense, kept while the swarm is on so it can be
      // turned off or resized.
      swarm: { members: s.swarm?.members ?? null, of: s.swarm?.of ?? null },
      swarmBase: null
    },
    numbers: {
      health: s.health?.max ?? s.health?.value ?? 1,
      defense: s.defense ?? 10,
      ap: { body: s.ap?.body ?? null, head: s.ap?.head ?? null, limb: s.ap?.limb ?? null },
      hasHead: s.ap?.head !== null && s.ap?.head !== undefined,
      hasLimbs: s.ap?.limb !== null && s.ap?.limb !== undefined,
      armor: "typical",
      // One row a school (D-644); the book's blocks carry one, a built creature may carry more.
      wards: Object.entries(s.ward ?? {})
        .filter(([k, v]) => AZEROTH.schools[k] && Number(v) > 0)
        .map(([school, value]) => ({ school, value: Number(value) })),
      speed: s.speed ?? 30, flies: Boolean(s.flies), initiative: s.initiative ?? 10
    },
    abilities: Object.fromEntries(ABILITIES.map(k => [k, s.abilities?.[k]?.value ?? null])),
    attacks: (s.attacks ?? []).map(a => ({
      name: a.name ?? "", ability: "str", bonus: a.bonus ?? 0, damage: a.damage ?? null,
      traits: [...(a.traits ?? [])], range: a.range ?? null
    })),
    spells: { caster: Boolean((s.spells?.names ?? []).length || s.spells?.dc), dc: s.spells?.dc ?? null, names: [...(s.spells?.names ?? [])] },
    creatureAbilities: (s.creatureAbilities ?? []).map(a => ({ name: a.name ?? "", description: proseFromHtml(a.description), automation: cleanAutomation(a.automation) })),
    bossActions: (s.bossActions ?? []).map(a => ({ name: a.name ?? "", description: proseFromHtml(a.description), cost: a.cost ?? 1, automation: cleanAutomation(a.automation) })),
    keywords: {
      skills: Object.fromEntries(Object.entries(s.skills ?? {}).map(([k, v]) => [k, Number(v?.rank ?? v)])),
      resilience: [...(s.resilience ?? [])],
      immune: (s.immune ?? []).map(lower), vulnerable: (s.vulnerable ?? []).map(lower),
      inflicts: (s.inflicts ?? []).map(lower),
      momentum: { name: s.momentum?.name ?? null, max: s.momentum?.max ?? null },
      power: { name: s.power?.name ?? null, max: s.power?.max ?? null }
    },
    prose: {
      behavior: proseFromHtml(s.behavior), lore: proseFromHtml(s.lore),
      tactics: proseFromHtml(s.tactics), ecology: proseFromHtml(s.ecology),
      swarm: proseFromHtml(s.swarmNote)
    }
  };
}

/** The members a state's swarm holds, or null: two or more, on a weight class that swarms. */
function swarmMembers(id = {}) {
  const n = Math.trunc(Number(id.swarm?.members));
  if (!Number.isFinite(n) || n < 2) return null;
  if (!canSwarm(id.weightClass ?? "standard")) return null;
  return n;
}

/** The `system` block a state writes: the pack's shape exactly (D4 §10.2, `tools/parse-book/bestiary.mjs`). */
export function toSystem(state = {}) {
  const id = state.identity ?? {};
  const n = state.numbers ?? {};
  const k = state.keywords ?? {};
  const p = state.prose ?? {};
  const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
  const health = Math.max(0, Math.trunc(Number(n.health)) || 0);
  return {
    weightClass: id.weightClass ?? "standard",
    size: id.size ?? "medium",
    creatureType: id.creatureType ?? "humanoid",
    typeMarker: id.typeMarker || null,
    race: id.race || null,
    // A swarm's share is its members' (13 §4, D-646).
    threatShare: id.weightClass === "boss" ? null : Math.round((WEIGHTS[id.weightClass]?.share ?? 1) * (swarmMembers(id) ?? 1) * 100) / 100,
    swarm: { members: swarmMembers(id), of: swarmMembers(id) ? (String(id.swarm?.of ?? "").trim() || null) : null },
    swarmNote: swarmMembers(id) || String(p.swarm ?? "").trim() ? htmlFromProse(p.swarm ?? "") : "",
    tier: tierOf(id.tier),
    corruption: id.corruption || null,
    handlingDC: id.creatureType === "beast" ? num(id.handlingDC) : null,
    dungeon: id.weightClass === "boss" ? (String(id.dungeon ?? "").trim() || null) : null,
    health: { value: health, max: health },
    defense: Math.trunc(Number(n.defense)) || 0,
    ap: {
      body: num(n.ap?.body) ?? 0,
      head: n.hasHead === false ? null : (num(n.ap?.head) ?? 0),
      limb: n.hasLimbs === false ? null : (num(n.ap?.limb) ?? 0)
    },
    ward: Object.fromEntries((n.wards ?? [])
      .filter(w => w?.school && AZEROTH.schools[w.school] && num(w.value) !== null && num(w.value) > 0)
      .map(w => [w.school, Math.trunc(num(w.value))])),
    speed: Math.max(0, Math.trunc(Number(n.speed)) || 0),
    flies: Boolean(n.flies),
    initiative: Math.trunc(Number(n.initiative)) || 0,
    abilities: Object.fromEntries(ABILITIES.map(key => [key, { value: num(state.abilities?.[key]) }])),
    attacks: (state.attacks ?? []).map(a => ({
      name: String(a.name ?? "").trim(),
      bonus: Math.trunc(Number(a.bonus)) || 0,
      damage: num(a.damage),
      traits: (a.traits ?? []).map(t => String(t).trim()).filter(Boolean),
      range: num(a.range)
    })),
    spells: {
      dc: state.spells?.caster ? num(state.spells?.dc) : null,
      names: state.spells?.caster ? [...(state.spells?.names ?? [])] : []
    },
    creatureAbilities: (state.creatureAbilities ?? []).map(a => ({ name: String(a.name ?? "").trim(), description: htmlFromProse(a.description), automation: cleanAutomation(a.automation) })),
    bossActions: (state.bossActions ?? []).map(a => ({
      name: String(a.name ?? "").trim(), description: htmlFromProse(a.description), cost: Number(a.cost) === 2 ? 2 : 1, automation: cleanAutomation(a.automation)
    })),
    // 14 §1: the number printed with the list is what the creature holds each
    // round. A creature the generator builds has no printed label, so the
    // count of what it lists IS the label - and without this a built Boss
    // held no points and every one of its actions refused (D-691).
    bossPoints: (state.bossActions ?? []).length
      ? { value: (state.bossActions ?? []).length, max: (state.bossActions ?? []).length }
      : { value: null, max: null },
    skills: Object.fromEntries(Object.entries(k.skills ?? {}).filter(([, r]) => Number(r) >= 1).map(([key, r]) => [key, Math.trunc(Number(r))])),
    resilience: [...(k.resilience ?? [])],
    immune: (k.immune ?? []).map(lower),
    vulnerable: (k.vulnerable ?? []).map(lower),
    inflicts: (k.inflicts ?? []).map(lower),
    momentum: { name: k.momentum?.name || null, value: num(k.momentum?.max), max: num(k.momentum?.max) },
    power: { name: k.power?.name || null, value: num(k.power?.max), max: num(k.power?.max) },
    behavior: htmlFromProse(p.behavior),
    lore: htmlFromProse(p.lore),
    tactics: htmlFromProse(p.tactics),
    ecology: htmlFromProse(p.ecology)
  };
}

/** The prototype token a creature carries (D-637): its rung's footprint, hostile, a Health bar. */
export function prototypeTokenFor({ name = "", img = "", size = "medium" } = {}) {
  const squares = tokenSize(size);
  return {
    name,
    width: squares,
    height: squares,
    // CONST.TOKEN_DISPOSITIONS.HOSTILE and CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    // as literals: this runs under Node for the parser too.
    disposition: -1,
    displayBars: 20,
    bar1: { attribute: "health" },
    texture: { src: img },
    actorLink: false
  };
}
