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
// 05's *Round - ~6 seconds*: a turn's span out of a fight is one of them (D-778).
import { ROUND_SECONDS } from "./area-ticks.mjs";
// 07's *The Druid in a form*: 1 Ferocity for every 2 Mana, rounded up (D-769).
import { ferocityFor } from "./shapes.mjs";

/** 07 §2: two numbers cover every spell. */
export function castingDC({ tier = 1, targetDefense = null } = {}) {
  if (targetDefense !== null && targetDefense !== undefined) return targetDefense;
  return 10 + 2 * Math.max(1, Math.trunc(tier) || 1);
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
export function maxOverchannel({ health = 0, tier = 1, relief = 0 } = {}) {
  const per = overchannelPerPoint(tier);
  const less = Math.max(0, Math.trunc(Number(relief)) || 0);
  return Math.max(0, Math.floor((Math.max(0, health) - 1 + less) / per));
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
export function overchannelCost({ points = 0, health = 0, tier = 1, relief = 0 } = {}) {
  const taken = Math.min(Math.max(0, Math.trunc(points) || 0), maxOverchannel({ health, tier, relief }));
  const gross = taken * overchannelPerPoint(tier);
  const less = taken > 0 ? Math.min(gross, Math.max(0, Math.trunc(Number(relief)) || 0)) : 0;
  return { points: taken, health: gross - less, relief: less };
}

/**
 * The most Overchannel points a cast may take where Health does not bound them:
 * each point is +1 SL and 05 §2 caps a Success Level at 6.
 */
export const OVERCHANNEL_MAX_POINTS = 6;

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
export function overchannelPrice({ points = 0, health = 0, tier = 1, relief = 0, mastery = false, mana = 0 } = {}) {
  if (!mastery) return { ...overchannelCost({ points, health, tier, relief }), mana: 0 };
  const taken = Math.min(Math.max(0, Math.trunc(Number(points)) || 0), OVERCHANNEL_MAX_POINTS);
  if (!taken) return { points: 0, health: 0, relief: 0, mana: 0 };
  const doubled = Math.max(0, Math.trunc(Number(mana)) || 0);
  const less = Math.min(doubled, Math.max(0, Math.trunc(Number(relief)) || 0));
  return { points: taken, health: 0, relief: less, mana: doubled - less };
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
export function grantingClass(classes = [], school = null) {
  const bySchool = classes.find(c => Array.isArray(c.schools) && c.schools.includes(school));
  return bySchool ?? classes.find(c => c.castingAbility) ?? null;
}

/** Spell DC = 10 + casting ability modifier + Proficiency (05), for ONE class. */
export function spellDCFor({ abilityMod = 0, proficiency = 0 } = {}) {
  return 10 + abilityMod + proficiency;
}

/** The Success Level after Overchannel, capped where every SL is capped. */
export function overchannelledSL(sl, points = 0) {
  return Math.min(AZEROTH.SL_CAP, sl + Math.max(0, Math.trunc(points) || 0));
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
  const n = v => Number(v) || 0;
  const named = name ? n(signatureEffects?.empowers?.[name]?.cost) : 0;
  const bySchool = school ? n(signatureEffects?.spellCost?.[school]) : 0;
  return Math.max(0, n(mana) - named - bySchool - Math.max(0, n(next)) - Math.max(0, n(less)));
}

/** The actor flag the next spell's discounts stand under (D-771). */
export const NEXT_SPELL_FLAG = "nextSpell";

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
  return Math.trunc(Number(e.amount)) > 0 || e.cast === "half" || Math.trunc(Number(e.forcedSl)) > 0 || Math.trunc(Number(e.damage)) > 0 || e.miracle === true;
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
export function takeNextSpell(live = [], { action = null, healing = false } = {}) {
  const taken = [];
  const kept = [];
  for (const e of live ?? []) {
    if (e?.miracle === true) {
      if (healing === true) taken.push(e);
      else kept.push(e);
      continue;
    }
    const rung = e?.cast === "half";
    const other = Math.trunc(Number(e?.amount)) > 0 || Math.trunc(Number(e?.forcedSl)) > 0 || Math.trunc(Number(e?.damage)) > 0;
    if (rung && !other && action !== "action") kept.push(e);
    else taken.push(e);
  }
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  return {
    taken,
    kept,
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
 * @param {number} mana  the price in Mana, every discount already taken off
 * @param {{inShapeshiftForm?: boolean}} [o]
 * @returns {{pool: "mana"|"ferocity", amount: number}}
 */
export function manaPrice(mana = 0, { inShapeshiftForm = false } = {}) {
  const m = Math.max(0, Number(mana) || 0);
  if (inShapeshiftForm && m > 0) return { pool: "ferocity", amount: ferocityFor(m) };
  return { pool: "mana", amount: m };
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
 * @param {{mana: number, pool: {value: number}|null, inForm?: boolean, ferocity?: {value: number}|null,
 *   health?: number, overchannelHealth?: number, spellHealth?: number, noCasting?: string[]}} o
 * @returns {{reason: "Garroted"|"InForm"|"NoFerocity"|"NoMana"|"NoHealth", amount?: number, by?: string[]}|null}
 */
export function castRefusal({ mana = 0, pool = null, inForm = false, ferocity = null, health = 0, overchannelHealth = 0, spellHealth = 0, noCasting = [] } = {}) {
  const barred = (noCasting ?? []).filter(n => typeof n === "string" && n);
  if (barred.length) return { reason: "Garroted", by: barred };
  const price = manaPrice(mana, { inShapeshiftForm: inForm });
  if (price.pool === "ferocity") {
    if (!ferocity) return { reason: "InForm" };
    if ((ferocity.value ?? 0) < price.amount) return { reason: "NoFerocity", amount: price.amount };
  } else if (pool && mana > 0 && (pool.value ?? 0) < mana) return { reason: "NoMana" };
  if (spellHealth > 0 && health - overchannelHealth - spellHealth < 1) return { reason: "NoHealth" };
  return null;
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
