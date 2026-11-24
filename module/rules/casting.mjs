/**
 * Casting, as 07 §2 and §8 state it. Pure: no Foundry.
 *
 *   DC          the target's Defense for a spell at one creature, else
 *               10 + 2 per tier of the spell (07 §2's table).
 *   Overchannel 2 Health per tier of the spell for each point taken, each
 *               point +1 SL. Paid before the roll and kept on a failure. Never
 *               below 1 Health (05, Spending Health).
 *   Granting    a spell gates on the class that granted it (02 §10): the class
 *               whose schools include the spell's school, else the first class
 *               that casts at all.
 *   Spell DC    10 + that class's casting ability modifier + Proficiency, per
 *               class - two casting classes are two DCs, not one.
 */

import { AZEROTH } from "../config.mjs";
// The class that pays its spells in Momentum (D-944), kept beside the runes it holds.
import { CLASS_SPELL_POOL, CLASS_SPELL_POOL_BY_CLASS } from "./runes.mjs";
// The Sovereign's Vitae: short of a cost it takes Health, 1 for 1 (02 §7; the plan's V4).
import { VITAE, vitaePayment } from "./vitae.mjs";
// 05's *Round - ~6 seconds*: a turn's span out of a fight is one of them (D-778).
import { ROUND_SECONDS } from "./area-ticks.mjs";
// *Before the end of your next turn* (04's Clearcasting; the class talent audit, D-1890): the one reading.
import { nextTurnStands } from "./next-attack.mjs";
// 07's *The Druid in a form*: 1 Ferocity for every 2 Mana, rounded up (D-769).
import { ferocityFor } from "./shapes.mjs";
// A creature's Power pool IS its Mana (the lead, 2026-09-10).
import { manaPool } from "./pools.mjs";
// The one predicate for a class a Restricted line names (D-930).
import { classLearnsSpell } from "./spell-access.mjs";
// 05 §1 and §2: one roll read against each target's own number (O-301).
import { SL_CAP, computeSL, resolveTest, succeeded } from "./resolution.mjs";

/** 07 §2: two numbers cover every spell. */
export function castingDC({ tier = 1, targetDefense = null } = {}) {
  if (targetDefense !== null && targetDefense !== undefined) return targetDefense;
  return 10 + 2 * Math.max(1, Math.trunc(tier) || 1);
}

/**
 * **07 §2's TWO NUMBERS, CHOSEN FOR A CAST** (the Chronomancer sweep's stage 3, D-892): *Aimed at
 * one creature - That creature's Defense; Aimed at an area, at an ally, or at nothing - 10 + 2 per
 * tier of the spell.* The dialog and the cast door took the first target's Defense for any spell
 * with a creature targeted, so Shifting Hours (*A 20 ft radius*) rolled against a Raptor's
 * Defense 12 rather than 16, and Sands Run Back at an ally against the ally's Defense.
 *
 * **07 §2's *ally* IS A WILLING TARGET** (O-296; the lead, 2026-11-10: *"296 - ally means willing
 * target"*): the one predicate `rules/target-line.mjs#willingFrom`, read at the door through
 * `canvas/range.mjs#willingOf` (D-893) - the caster; D-755's ally (the sides in a fight the two
 * share, the Party outside one); a NEUTRAL creature, in a fight or out of one (the lead,
 * 2026-11-11: *"300 - neutral can be willing"*, D-900, so a NEUTRAL target gives 10 + 2 a tier
 * and never its Defense); and outside a shared fight a token on the caster's own side of the
 * board. Nothing asks the target's player. The door that answers it is
 * `canvas/engaged.mjs#spellAimsAtTier`, which hands the verdict here.
 *
 * @param {{tier?: number, area?: boolean, ally?: boolean, targetDefense?: number|null}} o
 *   `area` - the spell's Target line names an area (`rules/areas.mjs#areaFor`); `ally` - the
 *   creature it is aimed at is willing (`canvas/range.mjs#willingOf`, the caster included)
 */
export function spellCastingDC({ tier = 1, area = false, ally = false, targetDefense = null } = {}) {
  if (area === true || ally === true) return castingDC({ tier });
  return castingDC({ tier, targetDefense });
}

/**
 * **EVERY TARGET IS JUDGED ON ITS OWN NUMBER** (O-301; the lead, 2026-11-10: *"o301 - each target
 * needs to be rolled against it's defense or make it's own resilence test if relevant."*). A spell
 * that names several creatures and is not an area takes ONE Casting Test - one roll, one total,
 * the Mana paid once (07 §2's steps name one Test a cast) - and that total is compared with each
 * target's own 07 §2 number: an unwilling creature's Defense, a willing one's 10 + 2 a tier. It
 * replaces the first target's Defense standing for the whole cast (D-892's second reading).
 *
 * True where the cast is aimed at two or more creatures, is not an area, and no DC was handed in or
 * stated by the entry (a stated DC is the entry's, for every target).
 *
 * @param {{area?: boolean, given?: number|null, stated?: number|null, count?: number}} o
 */
export function judgesEachTarget({ area = false, given = null, stated = null, count = 0 } = {}) {
  return area !== true && (given === null || given === undefined) && (stated === null || stated === undefined)
    && (Math.trunc(Number(count)) || 0) >= 2;
}

/**
 * Each target's 07 §2 number, in the order handed in: `{dc, willing}`.
 *
 * @param {{tier?: number, targets?: Array<{willing?: boolean, defense?: number|null}>}} o
 * @returns {Array<{dc: number, willing: boolean}>}
 */
export function eachTargetDCs({ tier = 1, targets = [] } = {}) {
  return (targets ?? []).map(t => {
    const willing = t?.willing === true;
    const defense = Number.isFinite(Number(t?.defense)) && t?.defense !== null ? Number(t.defense) : null;
    return { dc: spellCastingDC({ tier, ally: willing, targetDefense: defense }), willing };
  });
}

/**
 * **A DC TYPED IN ONE TARGET'S FIELD** (O-307; the lead, 2026-11-11: *"307 - one field per
 * target"*): the number a field holds, or null where it holds nothing usable - empty, blank, not a
 * number, below 0 - so a field cleared returns to its default. A whole number (a fraction is
 * truncated, as the single DC field's `step="1"` reads it).
 *
 * @param {unknown} raw  the field's value
 * @returns {number|null}
 */
export function typedDcValue(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * **EACH TARGET'S NUMBER, WITH WHAT WAS TYPED OVER IT** (O-307): the rows `eachTargetDCs` gave
 * (each carrying its own `key`), every one keeping its 07 §2 number as `default`, and the one a GM
 * or player typed in that target's own field as `dc` where it differs (`typed: true`). A number
 * typed for one key reaches that target alone: a key no row carries, and a field cleared, change
 * nothing.
 *
 * @param {Array<{dc: number, key?: string}>} rows
 * @param {Record<string, unknown>|null} [typed]  the fields' values by target key
 * @returns {Array<{dc: number, default: number, typed: boolean}>}
 */
export function typedTargetDCs(rows = [], typed = null) {
  const by = typed && typeof typed === "object" ? typed : {};
  return (rows ?? []).map(r => {
    const raw = typeof r?.key === "string" && Object.hasOwn(by, r.key) ? by[r.key] : null;
    const n = typedDcValue(raw);
    return n === null || n === r.dc ? { ...r, default: r.dc, typed: false } : { ...r, dc: n, default: r.dc, typed: true };
  });
}

/**
 * **THE ONE ROLL, READ AGAINST EACH TARGET'S NUMBER**: per target `{dc, total, success, sl,
 * critical}`. A natural 20 succeeds against every number and a natural 1 fails against every one
 * (05 §1); success is the margin (CLAUDE.md §7). A Test the rules call a success outright (Halt
 * bought with Sand, Soul Fire, Miracle: `forcedSl`) succeeds against every target at that SL, and
 * a Test that failed outright (`failed`, a forced failure) fails against every one.
 *
 * @param {{natural?: number|null, total?: number, dcs?: number[], criticalOn?: number, forcedSl?: number|null, failed?: boolean}} o
 */
export function judgeEachTarget({ natural = null, total = 0, dcs = [], criticalOn = 20, forcedSl = null, failed = false } = {}) {
  return (dcs ?? []).map(dc => {
    if (failed === true) return { dc, total, success: false, sl: computeSL(total, dc), critical: false };
    if (forcedSl !== null && forcedSl !== undefined && Number.isFinite(Number(forcedSl))) {
      return { dc, total, success: true, sl: Math.max(0, Math.trunc(Number(forcedSl)) || 0), critical: false, forced: true };
    }
    // **NO FACE, NO NATURAL** (a read scroll, 08 §14; the Phase 3 review, S7): the total alone,
    // through 05 §2's margin, and never a critical - rather than a 0 handed to `resolveTest`.
    if (natural === null || natural === undefined) return { dc, total, success: succeeded(total, dc), sl: computeSL(total, dc), critical: false };
    const nat = Math.trunc(Number(natural));
    const r = resolveTest({ natural: nat, modifier: total - nat, dc, criticalOn });
    return { dc, total: r.total, success: r.success, sl: r.sl, critical: r.critical === true };
  });
}

/**
 * **A TARGET'S OWN SUCCESS LEVEL** - what its riders read: the cast's SL (worked out against the
 * lowest number, with Overchannel, Grit of Ages and Ascendance already on it) less however many
 * Success Levels this target's higher number takes off the same total. Null for a target the
 * Test missed. A forced success is the cast's SL for every target.
 *
 * @param {number} castSl
 * @param {{dc: number, success: boolean, critical?: boolean, forced?: boolean}} row  `judgeEachTarget`'s
 * @param {{total: number, lowest: number}} o
 * @returns {number|null}
 */
export function targetSl(castSl, row, { total = 0, lowest = 0 } = {}) {
  if (!row?.success) return null;
  const sl = Math.trunc(Number(castSl)) || 0;
  if (row.forced === true) return sl;
  const less = computeSL(total, lowest) - computeSL(total, row.dc);
  return Math.max(row.critical === true ? 1 : 0, Math.min(SL_CAP, sl - Math.max(0, less)));
}

/** 07 §8: Health per Overchannel point, by the spell's tier. */
export function overchannelPerPoint(tier = 1) {
  return AZEROTH.OVERCHANNEL_HEALTH_PER_TIER * Math.max(1, Math.trunc(tier) || 1);
}

/**
 * 07 §8, 05: as many points as leave you at 1 Health or more.
 *
 * **AND WHAT A TALENT TAKES OFF THE PRICE** (04's Overchanneller: *When you
 * Overchannel, its cost to you is reduced by 1 per rank*; D-775): `relief` is
 * the Health taken off each Overchannel - MY READING, for the lead: off the
 * cast's whole price, never off each point - so a point more may be affordable.
 */
export function maxOverchannel({ health = 0, tier = 1, relief = 0, free = 0 } = {}) {
  // **PER POINT** (the class talent audit's C3; 07 §8 and 04 now agree, D-1890): Overchanneller
  // takes its rank off EACH point, to a minimum of 1 a point; Clearcasting's free points
  // (`free`) cost nothing and are counted first.
  const per = overchannelPointHealth(tier, relief);
  const f = Math.max(0, Math.trunc(Number(free)) || 0);
  return f + Math.max(0, Math.floor((Math.max(0, health) - 1) / per));
}

/** 07 §8's Health a point at a tier, less Overchanneller's rank, never below 1 (D-1890). */
export function overchannelPointHealth(tier = 1, relief = 0) {
  return Math.max(1, overchannelPerPoint(tier) - Math.max(0, Math.trunc(Number(relief)) || 0));
}

/** 02's Overchannel Mastery's Mana a point - the spell's tier - less Overchanneller's rank, never below 1 (D-1890). */
export function overchannelPointMana(tier = 1, relief = 0) {
  return Math.max(1, Math.max(1, Math.trunc(Number(tier)) || 1) - Math.max(0, Math.trunc(Number(relief)) || 0));
}

/**
 * **WHAT A PAYMENT LEAVES, OFF THE POOL AS IT STANDS NOW** (the final review of
 * D-768 to D-775; `rollTest`'s rule since the D-770 review, item D). A door judges
 * its price against the pool it read first, then spends the turn's budget and ends
 * a Hide, and only then pays: the write is worked out from the value read AGAIN, so
 * a gain that landed in between is kept, and a pool that fell below the price pays
 * what it holds - down to its floor, 0 for a pool and 1 for Health where there was
 * more (05, *Spending Health*). The refusals stay where they were; this is the pay.
 *
 * @param {number} now    the value read again, after the budget and the reveal
 * @param {number} price  what the judgement agreed to pay
 * @param {{floor?: number}} [o]
 * @returns {{value: number, paid: number}}  the value to write, and what that pays
 */
export function payFromNow(now = 0, price = 0, { floor = 0 } = {}) {
  const have = Math.trunc(Number(now)) || 0;
  const cost = Math.max(0, Math.trunc(Number(price)) || 0);
  const bottom = Math.min(have, Math.max(0, Math.trunc(Number(floor)) || 0));
  const value = Math.max(bottom, have - cost);
  return { value, paid: have - value };
}

/**
 * The Health a number of points costs, clamped to what can be paid, with a
 * talent's relief taken off the whole price and the price floored at nothing.
 */
export function overchannelCost({ points = 0, health = 0, tier = 1, relief = 0, free = 0 } = {}) {
  const taken = Math.min(Math.max(0, Math.trunc(points) || 0), maxOverchannel({ health, tier, relief, free }));
  // Clearcasting's points are taken first and cost nothing (D-1890).
  const freeTaken = Math.min(taken, Math.max(0, Math.trunc(Number(free)) || 0));
  const paid = taken - freeTaken;
  const gross = paid * overchannelPerPoint(tier);
  const net = paid * overchannelPointHealth(tier, relief);
  return { points: taken, health: net, relief: gross - net, ...(freeTaken > 0 ? { free: freeTaken } : {}) };
}

/**
 * **02's EVOCATION'S MANA BACK** (*regain half your total Mana, rounded down*; the wave-2 review): the
 * pool handed is the Mage class's own (`workflows.mjs#poolFor` by the feature's class item), never
 * the first Mana pool, so a Warlock / Mage refills the Mage's. Null where there is no pool.
 *
 * @param {{itemId?: string, kind?: string, value?: number, max?: number}|null} pool
 * @returns {{itemId: string, kind: string, value: number, restored: number}|null}
 */
export function halfManaRestore(pool = null) {
  if (!pool) return null;
  const max = Math.max(0, Math.trunc(Number(pool.max)) || 0);
  const value = Math.max(0, Math.trunc(Number(pool.value)) || 0);
  const restored = Math.floor(max / 2);
  return { itemId: pool.itemId, kind: pool.kind ?? "power", value: Math.min(max, value + restored), restored };
}

/**
 * **WHETHER A CAST LAYS 04's CLEARCASTING** (*When you Overchannel and the Casting Test succeeds*; the
 * class talent audit, D-1890). A successful cast that took at least one Overchannel point it PAID for.
 * The orchestrator's reading (the wave-2 review), by the audit's aim of closing the Mana loop: a cast
 * whose points were all Clearcasting's free ones lays none, or the free points would refresh
 * themselves for ever.
 *
 * @param {{success?: boolean, points?: number, free?: number}} o  `points` taken, `free` of them free
 * @returns {boolean}
 */
export function clearcastingLays({ success = false, points = 0, free = 0 } = {}) {
  const taken = Math.max(0, Math.trunc(Number(points)) || 0);
  const gratis = Math.max(0, Math.trunc(Number(free)) || 0);
  return success === true && taken > gratis;
}

/**
 * The most Overchannel points a cast may take where Health does not bound them:
 * each point is +1 SL and 05 §2 caps a Success Level at `SL_CAP` (10 since O-699; it was 6).
 */
export const OVERCHANNEL_MAX_POINTS = SL_CAP;

/**
 * **WHAT AN OVERCHANNEL COSTS, WITH 02's OVERCHANNEL MASTERY** (the Mage's level 9:
 * *Overchannelling does not cost you Health, instead you may spend twice the Mana
 * cost for the effect*; the lead, 2026-10-03, on O-192: *"Per cast"*; D-779). With
 * the feature an Overchannel costs no Health: the spell's Mana is charged a second
 * time, ONCE a cast however many points are taken (READING of the ruling: 07 §8's
 * *pays twice the Mana instead of the Health*), and 04's Overchanneller takes its
 * rank off that second charge (*the doubled Mana once you hold Overchannel
 * Mastery*), never below nothing. The points are bounded by 05 §2's SL cap alone.
 * Without the feature it is `overchannelCost`, Health per point.
 *
 * @param {{points?: number, health?: number, tier?: number, relief?: number, mastery?: boolean, mana?: number}} o
 *   `mana` the cast's Mana as it will be charged, every discount taken
 * @returns {{points: number, health: number, relief: number, mana: number}}
 */
export function overchannelPrice({ points = 0, health = 0, tier = 1, relief = 0, mastery = false, mana = 0, free = 0 } = {}) {
  // **PER POINT, AT THE TIER** (the class talent audit's C3, overturning O-192's *"Per cast"*;
  // 02: *Each point costs Mana equal to the spell's tier instead*; D-1890): with the feature each
  // point costs the spell's tier in Mana and no Health, Overchanneller takes its rank off each
  // point to a minimum of 1, and Clearcasting's free points (`free`) cost nothing. `mana` (the
  // cast's own price) no longer prices it, and is kept for the callers that hand it.
  void mana;
  if (!mastery) return { ...overchannelCost({ points, health, tier, relief, free }), mana: 0 };
  const taken = Math.min(Math.max(0, Math.trunc(Number(points)) || 0), OVERCHANNEL_MAX_POINTS);
  if (!taken) return { points: 0, health: 0, relief: 0, mana: 0 };
  const freeTaken = Math.min(taken, Math.max(0, Math.trunc(Number(free)) || 0));
  const paid = taken - freeTaken;
  const gross = paid * Math.max(1, Math.trunc(Number(tier)) || 1);
  const net = paid * overchannelPointMana(tier, relief);
  return { points: taken, health: 0, relief: gross - net, mana: net, ...(freeTaken > 0 ? { free: freeTaken } : {}) };
}

/**
 * **A CASTING TEST'S DC THE ENTRY STATES** (07: *Make a Casting Test against DC
 * 26*; D-775, found beside 04's Sunfire and Cataclysm): Sunfire, Cataclysm and
 * Absolute Zero print their own, and the dialog opened at 07 §2's 10 + 2 per
 * tier, or at the first target's Defense, as though they printed none. Read off
 * the entry's own imperative sentence only - Kindle's *makes it a Casting Test
 * against DC 12* is a condition the table judges, and stays the table's.
 *
 * @param {string} effect  the entry's effect, HTML or plain
 * @returns {number|null}
 */
export function statedCastingDC(effect = "") {
  const text = String(effect ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const m = /(?:^|[.!?]\s+)Make a Casting Test against DC (\d+)\b/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Which class grants a spell of this school (02 §10).
 * @param {Array<{itemId: string, schools?: string[], castingAbility?: string|null}>} classes
 * @param {string} school
 */
export function grantingClass(classes = [], school = null, named = null) {
  const bySchool = classes.find(c => Array.isArray(c.schools) && c.schools.includes(school));
  if (bySchool) return bySchool;
  // **A RESTRICTED LINE THAT NAMES THE CLASS** (D-930): the Death Knight casts the Frost
  // and Shadow spells that name it as its own - the one predicate the creator asks.
  const byLine = Array.isArray(named) && named.length
    ? classes.find(c => c.name && classLearnsSpell(c, { school, classes: named })) : null;
  return byLine ?? classes.find(c => c.castingAbility) ?? null;
}

/** Spell DC = 10 + casting ability modifier + Proficiency (05), for ONE class. */
export function spellDCFor({ abilityMod = 0, proficiency = 0 } = {}) {
  return 10 + abilityMod + proficiency;
}

/** The Success Level after Overchannel, capped where every SL is capped. */
export function overchannelledSL(sl, points = 0) {
  return Math.min(SL_CAP, sl + Math.max(0, Math.trunc(points) || 0));
}

/**
 * **WHAT A SPELL COSTS THIS CASTER IN MANA** (07 §8; 08 §20, D-698; the lead,
 * 2026-09-14: *spell and/or a school should be possible*): the entry's Mana,
 * less a Signature naming this spell (`empowers[name].cost`) and less one
 * scoped to its school (`spellCost[school]`, the SPELL's own school), floored at
 * nothing; an item's casting pays none (D-633).
 *
 * **ONE FUNCTION FOR THE CAST AND ITS DIALOG** (D-768). `castWithDialog`
 * compared the pool against the bare entry, so a caster a Signature made able
 * to pay was told *cannot pay* and one it could not was told nothing.
 *
 * **AND WHAT THE NEXT SPELL WAS PROMISED** (04's Nature's Grace and Predator's
 * Swiftness, D-771): `next` is the Mana the caster's pending discounts take off
 * (`pendingNextSpell`), floored with the rest at nothing.
 *
 * **AND WHAT A TALENT TAKES OFF** (04's Emberstorm and Icy Veins; D-775): `less`
 * is `rules/class-talents.mjs#spellDiscountFor`'s amount, worked out against the
 * entry's own Mana with each talent's own floor, and taken off with the rest.
 *
 * @param {{mana?: number, name?: string, school?: string|null}} spell  the entry's Mana, name and school
 * @param {object} [signatureEffects]  the caster's derived `system.signatureEffects`
 * @param {{viaItem?: boolean, next?: number, less?: number}} [o]
 * @returns {number}
 */
export function spellManaCost({ mana = 0, name = "", school = null } = {}, signatureEffects = {}, { viaItem = false, next = 0, less = 0 } = {}) {
  if (viaItem) return 0;
  // **A SPELL A SIGNATURE CASTS FOR NOTHING** (08 §20's The Fifth Pylon: *pays no Mana to
  // cast **Banish**, and pays its upkeep as the spell says*; D-912): the cast's Mana, by
  // name. The upkeep is the Sustain's own door (`rules/upkeep.mjs`) and is untouched.
  const flatName = v => String(v ?? "").trim().toLowerCase();
  if (name && (signatureEffects?.freeSpell ?? []).some(s => flatName(s) === flatName(name))) return 0;
  const n = v => Number(v) || 0;
  const named = name ? n(signatureEffects?.empowers?.[name]?.cost) : 0;
  const bySchool = school ? n(signatureEffects?.spellCost?.[school]) : 0;
  // **A NEXT SPELL'S DISCOUNT NEVER TAKES THE COST BELOW 1** (the class talent audit's R7; D-1865):
  // what the other discounts leave is the cost the promise is taken off, and it stops at 1.
  const before = Math.max(0, n(mana) - named - bySchool - Math.max(0, n(less)));
  const paid = before - nextDiscountTaken({ cost: before, next });
  // **A SCHOOL DISCOUNT'S OWN FLOOR** (Atiesh's Guardian's Economy, *to a
  // minimum of 1*; D-910): where a Signature discounting this school names one,
  // the Mana goes no lower than it - and never above the entry's own Mana, so a
  // spell that costs nothing is not made to cost 1.
  const floor = bySchool > 0 && school ? Math.max(0, n(signatureEffects?.spellCostFloor?.[school])) : 0;
  return Math.max(paid, Math.min(floor, Math.max(0, n(mana))));
}

/** The actor flag the next spell's discounts stand under (D-771). */
export const NEXT_SPELL_FLAG = "nextSpell";

/**
 * **R7's MANA LIMITS** (the class talent audit; the lead's *"All other propsals are approved"*;
 * D-1865): *a Mana discount never refunds more than the spell's cost and never takes a point
 * below 1* - the Clearcasting loop, Nature's Grace and Predator's Swiftness, Overchanneller,
 * Illumination and Hammer of Justice's refund. The refund half is `class-talents.mjs#manaBackFor`'s
 * `cost`, the one door Mana comes back through on a cast.
 */
export const NEXT_SPELL_MANA_FLOOR = 1;

/**
 * How much of a next spell's discount a cost of `cost` takes: never past the floor of 1, and
 * nothing off a cost already under it (a spell that costs nothing is not made to cost 1).
 *
 * @param {{cost?: number, next?: number}} o
 * @returns {number}
 */
export function nextDiscountTaken({ cost = 0, next = 0 } = {}) {
  const c = Math.max(0, Math.trunc(Number(cost)) || 0);
  const d = Math.max(0, Math.trunc(Number(next)) || 0);
  return Math.max(0, Math.min(d, c - NEXT_SPELL_MANA_FLOOR));
}

/**
 * **THE NEXT SPELL'S DISCOUNTS THAT STILL STAND** (04's Nature's Grace and
 * Predator's Swiftness; D-771). Each entry was laid by a trigger
 * (`talent-effects.mjs#nextSpellGrants`) and is taken WHOLE by the next spell
 * cast for Mana - *your next spell*, a count and not a span. One laid for
 * *that turn* (Predator's Swiftness) carries the turn it was laid in, and
 * lapses the moment the fight stands anywhere else; one with no turn stands
 * until a spell takes it.
 *
 * **AND THE REST A NEXT SPELL MAY BE PROMISED** (D-775): 04's Backdraft's
 * Half-Action (`cast: "half"`) and Soul Fire's *counts its Casting Test as
 * reaching SL 3 and adds your tier to its damage* (`forcedSl`, `damage`) stand
 * beside a discount and lapse with their turn the same way; `amount` stays the
 * Mana alone. What a cast TAKES of them is `takeNextSpell`'s.
 *
 * **AND *THAT TURN* OUT OF A FIGHT** (D-778; the lead, 2026-10-03, on O-161:
 * *"Player can use them at anytime if selected."*): Soul Fire is no longer refused
 * out of a fight, and its *this turn* is then one round of the world's clock - the
 * entry carries `turn: {clock}`, the world's time it was laid at, and lapses once
 * the clock has passed 05's round (`area-ticks.mjs#ROUND_SECONDS`) or a fight's
 * turn stands (MY READING, for the lead).
 *
 * @param {Array<{source?: string, name?: string, amount: number, cast?: string, forcedSl?: number, damage?: number,
 *   turn?: {combat: string, round: number, combatant: string}|{clock: number}|null}>} entries
 * @param {{now?: {combat: string, round: number, combatant: string}|null, time?: number|null}} [o]  the fight's
 *   turn as it stands, or null; and the world's time
 * @returns {{amount: number, live: object[], lapsed: object[]}}
 */
export function pendingNextSpell(entries = [], { now = null, time = null } = {}) {
  const live = [];
  const lapsed = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !promisesAnything(e)) {
      lapsed.push(e);
      continue;
    }
    const turn = e.turn && typeof e.turn === "object" ? e.turn : null;
    // **BEFORE THE END OF YOUR NEXT TURN** (04's Clearcasting; the class talent audit, D-1890):
    // `through: "nextTurn"` and the turn it was laid in - lapsed once the caster's next turn has
    // ended (`next-attack.mjs#nextTurnStands`), or out of a fight two rounds of the world's clock.
    if (e.through === "nextTurn" && turn) {
      if (Number.isFinite(Number(turn.clock)) && turn.combat === undefined) {
        const at = time === null || time === undefined ? NaN : Number(time);
        if (now || !Number.isFinite(at) || at - Number(turn.clock) >= 2 * ROUND_SECONDS) lapsed.push(e);
        else live.push(e);
      } else if (now && turn.combat === now.combat && nextTurnStands(turn, now)) live.push(e);
      else lapsed.push(e);
      continue;
    }
    if (turn && Number.isFinite(Number(turn.clock)) && turn.combat === undefined) {
      // A caller that names no time cannot say the round is still running: lapsed.
      const at = time === null || time === undefined ? NaN : Number(time);
      if (now || !Number.isFinite(at) || at - Number(turn.clock) >= ROUND_SECONDS) lapsed.push(e);
      else live.push(e);
      continue;
    }
    if (turn && !(now && turn.combat === now.combat && turn.round === now.round && turn.combatant === now.combatant)) {
      lapsed.push(e);
      continue;
    }
    live.push(e);
  }
  return { amount: live.reduce((sum, e) => sum + Math.max(0, Math.trunc(Number(e.amount)) || 0), 0), live, lapsed };
}

/**
 * Whether a next spell's entry promises anything at all (D-775). **And 04's
 * Miracle** (D-779): `miracle` promises the next HEALING spell no Casting Test
 * and a heal nothing reduces.
 */
function promisesAnything(e) {
  return Math.trunc(Number(e.amount)) > 0 || e.cast === "half" || Math.trunc(Number(e.forcedSl)) > 0 || Math.trunc(Number(e.damage)) > 0 || e.miracle === true
    // 04's Clearcasting's free Overchannel points (the class talent audit, D-1890).
    || Math.trunc(Number(e.overchannel)) > 0;
}

/**
 * **WHAT ONE CAST TAKES OF WHAT THE NEXT SPELL WAS PROMISED** (D-771, D-775): a
 * discount and Soul Fire's promise are taken by the next spell whatever it is (*your
 * next spell*, a count); Backdraft's Half-Action only by a spell that costs an
 * action (MY READING, for the lead: on a spell that costs a Half-Action already
 * it would change nothing, so it waits for one it changes). What is not taken is
 * kept, and the cast writes the kept list back in its payment's own write.
 *
 * **AND 04's MIRACLE** (the lead, 2026-10-03, on O-185: *"use of it's own, Cast a
 * healing spell without requiring a casting test for the next healing spell. That
 * healing spell amoutn can't be reduced."*; D-779): an entry with `miracle` is
 * taken by the next HEALING spell alone (`healing`), and kept for one otherwise.
 *
 * @param {object[]} live  `pendingNextSpell`'s live entries
 * @param {{action?: string|null, healing?: boolean}} [o]  the rung the cast is about to be
 *   charged, and whether the spell heals (`isHealingSpell`)
 * @returns {{taken: object[], kept: object[], amount: number, cast: object|null, forcedSl: number, damage: number,
 *   miracle: object|null}}
 */
export function takeNextSpell(live = [], { action = null, healing = false, school = null, roundUsed = [] } = {}) {
  const taken = [];
  const kept = [];
  for (const e of live ?? []) {
    // **R7: A LOWERED RUNG ONCE A ROUND** (D-1865): a Half-Action promise laid by a row marked
    // `perRound` (Backdraft) is kept, not taken, while the round's record holds its mark.
    if (e?.cast === "half" && e.perRound === true && (roundUsed ?? []).includes(`${e.source}:1`)) {
      kept.push(e);
      continue;
    }
    // **A PROMISE TO ONE SCHOOL** (04's Runic Frost: *the next Frost spell you cast*; run F4a): an
    // entry naming its schools is taken only by a spell of one of them, and kept otherwise.
    if (Array.isArray(e?.schools) && e.schools.length && !e.schools.includes(school)) {
      kept.push(e);
      continue;
    }
    if (e?.miracle === true) {
      if (healing === true) taken.push(e);
      else kept.push(e);
      continue;
    }
    const rung = e?.cast === "half";
    const other = Math.trunc(Number(e?.amount)) > 0 || Math.trunc(Number(e?.forcedSl)) > 0 || Math.trunc(Number(e?.damage)) > 0
      || Math.trunc(Number(e?.overchannel)) > 0;
    if (rung && !other && action !== "action") kept.push(e);
    else taken.push(e);
  }
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  return {
    taken,
    kept,
    // 04's Clearcasting (D-1890): *your next spell* takes the free points whatever it is.
    overchannel: taken.reduce((sum, e) => sum + n(e.overchannel), 0),
    amount: taken.reduce((sum, e) => sum + n(e.amount), 0),
    cast: action === "action" ? (taken.find(e => e.cast === "half") ?? null) : null,
    forcedSl: taken.reduce((m, e) => Math.max(m, n(e.forcedSl)), 0),
    damage: taken.reduce((sum, e) => sum + n(e.damage), 0),
    miracle: taken.find(e => e.miracle === true) ?? null
  };
}

/**
 * **WHAT A CASTING FEATURE TAKES OF WHAT THE NEXT SPELL WAS PROMISED** (04's
 * Nature's Grace; the lead, 2026-10-03, on O-168: *"Yes to both."*; D-779): the
 * Mana discounts laid by a row that reaches a class feature making a Casting Test
 * (`features`), taken WHOLE as a spell takes them; every other promise - another
 * talent's discount, Backdraft's rung, Soul Fire's, Miracle's - is kept for a
 * spell.
 *
 * @param {object[]} live  `pendingNextSpell`'s live entries
 * @returns {{taken: object[], kept: object[], amount: number}}
 */
export function takeForFeature(live = []) {
  const taken = [];
  const kept = [];
  for (const e of live ?? []) {
    const onlyMana = Math.trunc(Number(e?.amount)) > 0 && !e?.cast && !(Math.trunc(Number(e?.forcedSl)) > 0) && !(Math.trunc(Number(e?.damage)) > 0) && e?.miracle !== true;
    if (e?.features === true && onlyMana) taken.push(e);
    else kept.push(e);
  }
  return { taken, kept, amount: taken.reduce((sum, e) => sum + Math.max(0, Math.trunc(Number(e.amount)) || 0), 0) };
}

/**
 * **WHETHER A SPELL HEALS** (04's Nature's Swiftness: *A healing spell of
 * yours*; D-771): its entry restores Health to a creature - a heal, a heal over
 * time, or an area's start-of-turn heal. A drain (`fromDamage`) heals its
 * caster off the damage it dealt and is a damaging spell, not a healing one
 * (MY READING, for the lead).
 *
 * @param {object} sys  a spell's `system`
 * @returns {boolean}
 */
export function isHealingSpell(sys = {}) {
  const heal = sys?.heal ?? {};
  return (heal.amount !== null && heal.amount !== undefined)
    || (heal.perTurn !== null && heal.perTurn !== undefined)
    || sys?.tick?.kind === "heal"
    || (sys?.areaTick?.heal !== null && sys?.areaTick?.heal !== undefined);
}

/** Why a swift cast is refused, as `lang/en.json` keys (D-771). */
export const SWIFT_REFUSALS = Object.freeze({
  notHealing: "AZEROTH.Cast.Swift.NotHealing",
  notAction: "AZEROTH.Cast.Swift.NotAction",
  noUses: "AZEROTH.Cast.Swift.NoUses",
  // A row counted on the round's record (04's Riptide, D-774): spent until the
  // next round, never until a rest.
  noRoundUses: "AZEROTH.Cast.Swift.NoRoundUses",
  none: "AZEROTH.Cast.Swift.None"
});

/**
 * **A HEALING SPELL CAST AT A HALF-ACTION** (04's Nature's Swiftness; D-771):
 * whether this cast may be made at the row's lower rung, and with what words
 * where it may not. Judged with every other refusal, before anything is spent
 * (D-768's order; the lead: *"Keeps the Half-Action"*).
 *
 * @param {{row: {action: string}|null, spellAction?: string|null, healing?: boolean, usesLeft?: number}} o
 *   `row` `talent-effects.mjs#castAsFor`'s answer for this spell; null where the
 *   caster holds no such talent or the spell is not one it reaches
 * @returns {{ok: boolean, action: string|null, reason: string|null}}
 */
export function swiftCast({ row = null, spellAction = null, healing = false, usesLeft = 0 } = {}) {
  if (!row) {
    if (!healing) return { ok: false, action: null, reason: SWIFT_REFUSALS.notHealing };
    if (spellAction !== "action") return { ok: false, action: null, reason: SWIFT_REFUSALS.notAction };
    return { ok: false, action: null, reason: SWIFT_REFUSALS.none };
  }
  if (!(Math.trunc(Number(usesLeft)) > 0)) return { ok: false, action: null, reason: row.perRound ? SWIFT_REFUSALS.noRoundUses : SWIFT_REFUSALS.noUses };
  return { ok: true, action: row.action, reason: null };
}

/**
 * **WHAT A MANA PRICE IS PAID WITH, AND HOW MUCH** (07, *The Druid in a form*;
 * D-769): *While in a Shapeshift form, a Druid may pay Ferocity in place of
 * Mana, at 1 Ferocity for every 2 Mana, rounded up.* 02 §7 bars the Mana
 * itself in a Shapeshift form, so in one the Ferocity is the ONLY way to pay.
 * The ONE reading for a spell (`castSpell`, `castWithDialog`) and a class
 * feature (`class-features.mjs#featurePayment`) alike - the plan's reading
 * that 07's sentence reaches a Mana-cost feature too, flagged for the lead.
 *
 * **AND A POOL A TALENT NAMES** (04's Shadowcraft: *paying Focus where 07-MAGIC
 * asks for Mana*; the Legacy branches' door 8): `pool` - `class-talents.mjs
 * #spellPoolFor`'s answer - takes 07's number as it stands, in that pool. It is
 * asked first: the talent names the price, and no Druid holds one.
 *
 * **AND A FREE CAST** (the Chromatic Champion plan: *"the utility spells can be cast
 * without rage once per short rest"*): `free` - a talent's free cast ticked on the
 * dialog and still unspent (`rules/free-casts.mjs`) - prices it at nothing, in the pool
 * it would have been paid from.
 *
 * @param {number} mana  the price in Mana, every discount already taken off
 * @param {{inShapeshiftForm?: boolean, pool?: string|null, free?: boolean}} [o]
 * @returns {{pool: string, amount: number}}
 */
export function spellPrice(mana = 0, { inShapeshiftForm = false, pool = null, free = false } = {}) {
  if (free === true) return { pool: typeof pool === "string" && pool ? pool : "mana", amount: 0 };
  const m = Math.max(0, Number(mana) || 0);
  if (typeof pool === "string" && pool && pool !== "mana" && m > 0) return { pool, amount: m };
  if (inShapeshiftForm && m > 0) return { pool: "ferocity", amount: ferocityFor(m) };
  return { pool: "mana", amount: m };
}

/**
 * **A CLASS THAT PAYS EVERY SPELL IN ITS MOMENTUM** (D-944; the Chromatic Champion's
 * D-819 door, *"a spell costing its Mana in Rage"*, taken by a class rather than a
 * talent): the Death Knight holds no Mana - its Power is its runes - and pays 07's
 * Mana in Runic Power, 1 for 1, a Sustain's upkeep included (the lead: *Runic Power
 * pays for spells at 1 per Mana*; *"they don't use mana"*). Keyed by the class's
 * POWER name, since the runes are what leave the Mana with nowhere to come from.
 */
export { CLASS_SPELL_POOL, CLASS_SPELL_POOL_BY_CLASS };

/**
 * **THE OLD NAME, KEPT ONE RELEASE** (the San'layn and Sovereign plan's V1: *Rename `manaPrice` to
 * `spellPrice`, keeping an alias for one release and a census on the old name*). A price is no longer
 * always Mana - Ferocity, Rage, Runic Power, Focus, Vitae - so the reader is `spellPrice`, and
 * `vitae.test.mjs` fails a caller of this name anywhere in `module/` outside this file.
 */
export const manaPrice = spellPrice;

/**
 * The pool a cast pays in: a talent's (`class-talents.mjs#spellPoolFor`, asked first,
 * because a talent names its price), else the class's (`CLASS_SPELL_POOL`), else null
 * for Mana. The ONE reading the cast, its dialog, the Spells tab and the free-cast
 * line take, so the four never price one spell two ways.
 *
 * @param {{pool: string, ability?: string|null, name?: string}|null} talentPool
 * @param {Iterable<{name?: string, system?: {power?: {name?: string}}, power?: {name?: string}}>} classes
 *   the caster's class items, or their systems
 * @returns {{pool: string, ability: string|null, name: string}|null}
 */
export function spellPayment(talentPool = null, classes = [], spell = null) {
  if (talentPool) return talentPool;
  const list = [...(classes ?? [])];
  for (const c of list) {
    const power = c?.system?.power?.name ?? c?.power?.name ?? null;
    const pool = power ? CLASS_SPELL_POOL[power] : null;
    if (pool) return { pool, ability: null, name: String(c?.name ?? "") };
  }
  return classSpellPayment(list, spell);
}

const classSysOf = c => c?.system ?? c ?? {};
const classIdOf = c => String(classSysOf(c).identifier ?? c?.identifier ?? "");
const casts = c => ["full", "half"].includes(classSysOf(c).power?.caster ?? null);

/**
 * **A CLASS THAT PAYS ITS SPELLS FROM A POOL KEYED BY THE CLASS** (`runes.mjs#CLASS_SPELL_POOL_BY_CLASS`:
 * the Demon Hunter's Energy, R1). The pool pays a spell the class itself learns
 * (`spell-access.mjs#classLearnsSpell` off the spell's school and Restricted line): the first class the
 * caster holds that learns it, primary first (MY READING for a Warlock and a Demon Hunter sharing a
 * borrowed Fel spell). Handed no spell, the pool pays only where no other class the caster holds casts,
 * so a Demon Hunter and a Mage never price a Mage spell in Energy. The answer names the class item
 * (`itemId`); beside a Rogue's or a Champion's Energy it names a member of the ONE pool they share (02 §10,
 * D-1723), which `pools.mjs#poolHeldBy` and the fallback to the first by name both reach.
 *
 * @param {Array<object>} classes  the caster's class items, or their systems
 * @param {{school?: string|null, classes?: string[]|null}|null} spell
 * @returns {{pool: string, ability: null, name: string, itemId: string|null}|null}
 */
export function classSpellPayment(classes = [], spell = null) {
  const keyed = (classes ?? []).filter(c => CLASS_SPELL_POOL_BY_CLASS[classIdOf(c)]);
  if (!keyed.length) return null;
  const answer = c => ({ pool: CLASS_SPELL_POOL_BY_CLASS[classIdOf(c)], ability: null, name: String(c?.name ?? ""), itemId: c?.id ?? c?._id ?? null });
  if (spell && typeof spell === "object") {
    const learner = (classes ?? []).find(c => classLearnsSpell({ name: c?.name, schools: classSysOf(c).schools ?? [] }, { school: spell.school ?? null, classes: spell.classes ?? null }));
    return learner && CLASS_SPELL_POOL_BY_CLASS[classIdOf(learner)] ? answer(learner) : null;
  }
  const otherCaster = (classes ?? []).some(c => !CLASS_SPELL_POOL_BY_CLASS[classIdOf(c)] && casts(c));
  return otherCaster ? null : answer(keyed[0]);
}

/**
 * **THE WORD A SPELL'S COST IS PRINTED IN** (07 §9; D-944; the F1 review's note): the pool
 * the caster pays it from where that is not Mana (`spellPayment`'s pool - a Champion's Rage,
 * a Death Knight's Runic Power), else the pool 07 prints the cost in (`system.costPool`:
 * `**Runic Power** 2` on a spell only a Death Knight can learn), else Mana. The browser row,
 * the spell sheet and the spell card read it, so a Runic Power spell never says *Mana*.
 *
 * **A POOL PAID IS THE WORD, MANA INCLUDED** (the Necromancer plan's finding 1): a card that
 * knows the payment names it, so a Necromancer paying Mana for a spell 07 prints in Runic Power
 * (Graveblight before Phase 3b's parse) reads *Mana*. `paidIn` null is a row with no payer -
 * the browser - and reads the pool 07 prints.
 *
 * @param {{costPool?: string|null, paidIn?: string|null}} o
 * @returns {string}  a lang key
 */
export function spellCostLabel({ costPool = "mana", paidIn = null } = {}) {
  const pool = paidIn ? (paidIn !== "mana" ? paidIn : null) : (costPool && costPool !== "mana" ? costPool : null);
  if (!pool) return "AZEROTH.Card.Mana";
  return AZEROTH.momentumTypes?.[pool] ?? AZEROTH.powerTypes?.[pool] ?? "AZEROTH.Card.Mana";
}

/**
 * **THE POOL A CAST'S MANA COMES OUT OF** (the B1 review), the ONE reading `castSpell`
 * and `castWithDialog` share. A character's is its Mana pool - the granting class's,
 * where it holds two (02 §10) - and NEVER another Power pool: a Rogue's Energy and a
 * Ranger's Focus pay no spell's Mana, so a learned spell on a class with no Mana is
 * refused (door 8). A CREATURE's is its Power pool, whatever the block names it (the
 * lead, 2026-09-10: *a creature's Power pool IS its Mana*; `rules/pools.mjs#manaPool`):
 * a pool named `mana`, else the only Power pool. Door 8's refusal turned a creature
 * whose pool bore another name from casting free to not casting at all.
 *
 * @param {{creature?: boolean, powers?: Array<{itemId?: string|null, name?: string}>, snapshot?: Array<object>, grantItemId?: string|null}} o
 *   `powers` a character's `system.powers`; `snapshot` a creature's `poolSnapshot()`
 * @returns {object|null}
 */
export function castingManaPool({ creature = false, powers = [], snapshot = [], grantItemId = null } = {}) {
  if (creature) return manaPool(snapshot);
  const list = Array.isArray(powers) ? powers : [];
  return list.find(p => p?.name === "mana" && grantItemId && p.itemId === grantItemId)
    ?? list.find(p => p?.name === "mana") ?? null;
}

/**
 * **WHY A CAST IS REFUSED, JUDGED BEFORE ANYTHING IS SPENT** (D-768; the lead,
 * 2026-10-03: *Keeps the Half-Action*). `castSpell` spent the turn's budget and
 * ended a Hide BEFORE it asked whether the Mana was there, so a refused cast
 * cost the caster their Half-Action and their cover for nothing. Every refusal
 * a cast can meet is asked here, in the order the card names them:
 *
 * - **InForm**: 02 §7 - no Mana is spent in a Shapeshift form, and a caster in
 *   one with no Ferocity pool at all has nothing to pay 07's price with;
 * - **NoFerocity**: in a Shapeshift form the price is Ferocity (07, D-769) and
 *   the pool holds less than `ferocityFor(mana)`;
 * - **NoMana**: the pool holds less than the cost;
 * - **NoHealth**: 07 §8's own Health price, with Overchannel's, would leave less
 *   than 1 Health (05, *Spending Health*);
 * - **Garroted** (04's Garrote: *the target gains Bleeding equal to your rank and
 *   cannot cast while that Bleeding lasts*; D-773): the caster carries a Bleeding
 *   a Garrote laid, and `noCasting` names what laid it. Asked FIRST - nothing about
 *   the Mana matters to a caster who cannot cast at all.
 *
 * - **NoPool** (the Legacy branches' door 8): a price with NO pool to pay it -
 *   a learned spell on a class that holds no Mana (a Warrior, a Rogue, a Ranger
 *   with no talent naming another pool) used to be cast free, because the Mana
 *   was asked only where a Mana pool existed. `payWith` names the pool a talent
 *   pays in instead (Shadowcraft's Focus), and `payPool` is that pool;
 * - **NoPower**: the pool a talent names holds less than the price.
 *
 * @param {{mana: number, pool: {value: number}|null, inForm?: boolean, ferocity?: {value: number}|null,
 *   health?: number, overchannelHealth?: number, spellHealth?: number, noCasting?: string[],
 *   payWith?: string|null, payPool?: {value: number}|null}} o
 * @returns {{reason: "Garroted"|"InForm"|"NoFerocity"|"NoPool"|"NoPower"|"NoMana"|"NoHealth", amount?: number, by?: string[], pool?: string}|null}
 */
export function castRefusal({ mana = 0, pool = null, inForm = false, ferocity = null, health = 0, overchannelHealth = 0, spellHealth = 0, noCasting = [], payWith = null, payPool = null } = {}) {
  const barred = (noCasting ?? []).filter(n => typeof n === "string" && n);
  if (barred.length) return { reason: "Garroted", by: barred };
  const price = spellPrice(mana, { inShapeshiftForm: inForm, pool: payWith });
  if (price.pool === "ferocity") {
    if (!ferocity) return { reason: "InForm" };
    if ((ferocity.value ?? 0) < price.amount) return { reason: "NoFerocity", amount: price.amount };
  } else if (price.pool === VITAE) {
    // **VITAE, AND HEALTH BEHIND IT** (02 §7: *When a cost is more than the Vitae you hold, spend all
    // your Vitae and pay the rest in Health ... You cannot pay more Health than you have*; R10): refused
    // only where the cost is more than the Vitae plus the Health the cast's own Health prices leave.
    if (!payPool) return { reason: "NoPool", pool: price.pool, amount: price.amount };
    const left = Math.max(0, (Number(health) || 0) - (Number(overchannelHealth) || 0) - (Number(spellHealth) || 0));
    if (vitaePayment({ held: payPool.value ?? 0, cost: price.amount, health: left }).refusal) return { reason: "NoVitae", pool: VITAE, amount: price.amount };
  } else if (price.pool !== "mana") {
    if (!payPool) return { reason: "NoPool", pool: price.pool, amount: price.amount };
    if ((payPool.value ?? 0) < price.amount) return { reason: "NoPower", pool: price.pool, amount: price.amount };
  } else if (mana > 0) {
    if (!pool) return { reason: "NoPool", pool: "mana", amount: mana };
    if ((pool.value ?? 0) < mana) return { reason: "NoMana" };
  }
  if (spellHealth > 0 && health - overchannelHealth - spellHealth < 1) return { reason: "NoHealth" };
  return null;
}

/**
 * **WHETHER THE DIALOG MAY SAY THE CAST CAN BE PAID** (door 8): the pool that pays -
 * Mana, Ferocity in a form, or a pool a talent names - holds the price, and a
 * price with no pool to pay it can never be paid. `castWithDialog`'s `canPay`,
 * the ONE reading beside `castRefusal`.
 *
 * @param {{price: {pool: string, amount: number}, pool?: {value: number}|null, ferocity?: {value: number}|null, payPool?: {value: number}|null}} o
 */
export function castCanPay({ price, pool = null, ferocity = null, payPool = null, health = 0 } = {}) {
  const amount = Math.max(0, Number(price?.amount) || 0);
  if (amount === 0) return true;
  if (price.pool === "ferocity") return Boolean(ferocity) && (ferocity.value ?? 0) >= amount;
  // Vitae with Health behind it (02 §7; R10).
  if (price.pool === VITAE) return Boolean(payPool) && !vitaePayment({ held: payPool.value ?? 0, cost: amount, health }).refusal;
  if (price.pool !== "mana") return Boolean(payPool) && (payPool.value ?? 0) >= amount;
  return Boolean(pool) && (pool.value ?? 0) >= amount;
}

/**
 * The spells a class grants at a tier (07 SS5): the casting ability's fourth
 * job. A full caster begins with 4 + the modifier and adds 2 + the modifier
 * at each tier rise; a half caster 2 + and 1 +. A class that casts nothing
 * grants none. The modifier may be negative; the count never falls below 0.
 */
export function spellsKnown({ caster = "none", castingMod = 0, tier = 1 } = {}) {
  const grade = { full: { start: 4, rise: 2 }, half: { start: 2, rise: 1 } }[caster];
  if (!grade) return 0;
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  const mod = Math.trunc(Number(castingMod)) || 0;
  const start = Math.max(0, grade.start + mod);
  const perRise = Math.max(0, grade.rise + mod);
  return start + (t - 1) * perRise;
}

/**
 * **07 §4's CHART: THE HIGHEST TIER A CLASS CASTS AT EACH CHARACTER TIER** - a full caster reaches
 * every tier as they come to it; a half caster keeps pace to tier 2 and falls a step behind (1, 2, 2,
 * 3). Its Vitest reads the chart off the chapter.
 */
export const HALF_CASTER_REACH = Object.freeze([1, 2, 2, 3]);

/**
 * The tier a class casts up to (07 §4's chart), at the tier that class runs at - the character's for
 * the first class, one behind for the second (02 §10, `progression.mjs#secondaryTier`). A class
 * whose grade is none casts at the character's own tier: the cap is *your own tier*.
 *
 * @param {{caster?: "full"|"half"|"none", tier?: number}} o
 * @returns {number}
 */
export function castingReach({ caster = "full", tier = 1 } = {}) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  return caster === "half" ? HALF_CASTER_REACH[t - 1] : t;
}

/**
 * **07 §4's CAST CAP** (*What you may cast is capped at your own tier, whatever a tome says. A tier 2
 * character who copies a tier 4 spell out of a tome carries it until the level arrives.*): a spell of
 * a tier above the reach is refused. **Tier 5 is outside that cap** (*because it is outside the
 * ladder. It is found rather than reached, so there is no tier to be behind*). The lead,
 * 2026-11-18: *"Yes"* to building it for every class.
 *
 * @param {{spellTier?: number, reach?: number}} o
 * @returns {{reason: "tierCap", reach: number}|null}
 */
export function castCapRefusal({ spellTier = 1, reach = 1 } = {}) {
  const t = Math.trunc(Number(spellTier)) || 1;
  if (t >= 5) return null;
  const r = Math.max(1, Math.trunc(Number(reach)) || 1);
  return t > r ? { reason: "tierCap", reach: r } : null;
}

/**
 * A class that casts: a caster grade and an ability to cast with. The Ranger
 * carries a casting ability for its Spell DC alone (02 §6: traps and the
 * companion force Tests) with a grade of none, and is not a caster.
 */
export function isCaster({ caster = "none", castingAbility = null } = {}) {
  return caster !== "none" && Boolean(castingAbility);
}

/**
 * Whether a sheet has a spell to show (D-639): a casting class, a spell item
 * held, or an item that casts one (D-633). A Warrior with a scroll shows the
 * tab; a Ranger with none does not.
 */
export function showsSpells({ classes = [], spellItems = 0, itemSpells = 0 } = {}) {
  return classes.some(isCaster) || spellItems > 0 || itemSpells > 0;
}

/**
 * Whether a CREATURE has a spell to show (D-705), the same rule read off 14's
 * own block rather than off a character's classes.
 *
 * `showsSpells` above cannot answer this: a creature holds no class item at
 * all, so `classes` is always empty and every creature would hide the tab. What
 * a creature has instead is 14 §1's `**Spells** (DC n)` run — the names it
 * casts and the DC it casts at — and whatever spell items a GM dropped on it.
 *
 * A DC on its own is enough: a block that prints a Spell DC and no names is a
 * caster whose list the chapter left to the table, and the tab is where a GM
 * adds to it.
 *
 * @param {object} [o]
 * @param {string[]} [o.names]     `system.spells.names`
 * @param {number|null} [o.dc]     `system.spells.dc`
 * @param {number} [o.spellItems]  spell Items held
 */
export function showsCreatureSpells({ names = [], dc = null, spellItems = 0 } = {}) {
  return (Array.isArray(names) && names.length > 0) || dc !== null && dc !== undefined || spellItems > 0;
}

/**
 * **A CAST THAT TAKES 1 MINUTE, IN A FIGHT** (O-351; run close-F2; AGENT READING, for the lead): 07
 * prints *1 minute* as the Action of fourteen roleplay spells (Read the Dead, Grave Labor, Raise
 * Dracolich and their kin), and a minute is ten of 05's six-second rounds, longer than any turn's
 * two Half-Actions. In a started fight the caster has fought in, the cast is refused in words
 * before anything is paid; out of a fight it spends no turn's budget, as no cast out of a fight
 * does. The lang key, or null.
 *
 * @param {{action?: string|null, inFight?: boolean}} o
 * @returns {string|null}
 */
// And *10 minutes* (the Necromancer's roleplay spells, D-1050): the same refusal, its own word.
// And *1 hour* (07 §17's Blood Bond, a ritual; D-1360).
export const TIMED_SPELL_ACTIONS = Object.freeze(["minute", "tenMinutes", "hour"]);
export function timedCastRefusal({ action = null, inFight = false } = {}) {
  return TIMED_SPELL_ACTIONS.includes(action) && inFight === true ? "AZEROTH.Action.TimedInFight" : null;
}
