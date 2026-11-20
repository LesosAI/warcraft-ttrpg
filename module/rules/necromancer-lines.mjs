/**
 * **WHAT A NECROMANCER SPENDS AS PART OF A CAST, AS LINES ON THE CAST'S OWN DIALOG** (the
 * Necromancer plan's Phase 4 door 2). Pure: no Foundry imports (CLAUDE.md §3).
 *
 * The Chronomancer's Sand lines are the pattern (D-869; `rules/sand-casts.mjs`): each line is
 * unticked, priced in its pool, greyed with its reason in words where the pool will not cover
 * it, drawn through `AzerothActor#talentLineOffer` and judged again in `castSpell` through
 * `class-talents.mjs#talentLinesTaken` before the budget.
 *
 * - **02 §7's four empower benefits** - *When you cast a spell, you may spend Essence before you
 *   make its Casting Test. Choose one benefit for each Essence you spend. You may choose each
 *   benefit once a casting. The Essence is spent even if the Casting Test fails.* One line a
 *   benefit, offered only where the spell has the fact the benefit needs
 *   (`essence.mjs#empowerFacts`), and judged WHOLE at the cast (`essence.mjs#empowerPlan`).
 * - **04's Flesh Offering** - *When you cast a Death spell, you may destroy one corpse within 30
 *   feet of you. The spell costs 1 less Mana per rank, to a minimum of 1.* The spell's own
 *   school decides (O-335; the lead, 2026-11-18: *"Yes read the death school"*).
 */

import { EMPOWER_OPTIONS, ESSENCE, empowerFacts, potentBonus } from "./essence.mjs";

/** The prefix every empower line's identifier carries: `empower-potent`, `empower-binding`, ... */
export const EMPOWER_LINE_PREFIX = "empower-";

/** The line kind `castSpell` collects the empower picks by. */
export const EMPOWER_LINE_KIND = "empower";

/** 04's Flesh Offering, by its identifier and its numbers. */
export const FLESH_OFFERING = Object.freeze({ identifier: "flesh-offering", className: "Necromancer", feet: 30, perRank: 1, floor: 1, school: "death" });

/** The order the four lines are drawn in: 02's table. */
const ORDER = Object.freeze(["potent", "binding", "lasting", "farReaching"]);

/**
 * **THE FOUR EMPOWER LINES** a spell may take, for a caster holding Essence. None where the
 * caster holds no Essence pool; each greyed with its reason where the pool is empty.
 *
 * @param {object} spell  the spell's `system`
 * @param {{essence?: number|null, tier?: number}} o  `essence` the Essence held, null where the
 *   caster has no Essence pool
 * @returns {Array<object>} talent-line rows (`roll-dialog.mjs` draws `doesKey`, `pool`, `left`)
 */
export function empowerLines(spell = {}, { essence = null, tier = 1 } = {}) {
  if (essence === null || essence === undefined) return [];
  const held = Math.max(0, Math.trunc(Number(essence)) || 0);
  const facts = empowerFacts(spell);
  const out = [];
  for (const key of ORDER) {
    const option = EMPOWER_OPTIONS[key];
    if (!facts[option.needs]) continue;
    const enough = held >= option.cost;
    out.push({
      id: `talent-line-${EMPOWER_LINE_PREFIX}${key}`, identifier: `${EMPOWER_LINE_PREFIX}${key}`, empower: key,
      // `amount` is what the dialog's words print (Potent's rise), `price` the Essence it costs.
      name: option.label, kind: EMPOWER_LINE_KIND, amount: key === "potent" ? potentBonus(tier) : option.cost, price: option.cost, pool: ESSENCE,
      doesKey: `AZEROTH.Essence.EmpowerDoes.${key}`, tier: key === "potent" ? potentBonus(tier) : null,
      left: held, available: enough, checked: false,
      reason: enough ? null : "AZEROTH.Essence.EmpowerShort"
    });
  }
  return out;
}

/**
 * The empower benefits a set of taken lines names, as `EMPOWER_OPTIONS` keys, in 02's order.
 *
 * @param {Array<{kind?: string, empower?: string}>} taken
 * @returns {string[]}
 */
export function empowerPicks(taken = []) {
  const keys = new Set((taken ?? []).filter(l => l?.kind === EMPOWER_LINE_KIND && EMPOWER_OPTIONS[l.empower]).map(l => l.empower));
  return ORDER.filter(k => keys.has(k));
}

/**
 * **WHAT THE BENEFITS DO TO ONE CAST**, as the card and its doors read them: Potent's rise (the
 * caster's tier), Binding's Bane, Lasting's doubling and Far-reaching's doubling.
 *
 * @param {string[]} picks
 * @param {{tier?: number}} o
 * @returns {{potent: number, binding: boolean, lasting: boolean, farReaching: boolean}}
 */
export function empowerEffects(picks = [], { tier = 1 } = {}) {
  const has = k => (picks ?? []).includes(k);
  return { potent: has("potent") ? potentBonus(tier) : 0, binding: has("binding"), lasting: has("lasting"), farReaching: has("farReaching") };
}

/**
 * **LASTING: A DURATION DOUBLED** - the span `spell-effects.mjs#effectDuration` read, its count
 * twice as long. A span keyed on the caster's turn (*until the end of your next turn*) is under a
 * minute and never Lasting, so it is never handed here.
 *
 * @param {{value?: number}|null} duration
 * @returns {object|null}
 */
export function lastingDuration(duration) {
  if (!duration || !Number.isFinite(Number(duration.value)) || duration.of === "caster") return duration ?? null;
  return { ...duration, value: Number(duration.value) * 2 };
}

/**
 * **LASTING ON A LAID TICK**: a tick counted over the spell's own span (its `rounds` the span's)
 * counts twice as many rounds; a tick with a count of its own is left alone. Answers the patch
 * to spread over the tick (`{rounds}`), or nothing.
 *
 * @param {{rounds?: number|null}|null} tick
 * @param {number|null} spanRounds  `area-ticks.mjs#roundsIn` of the spell's Duration
 * @returns {{rounds?: number}}
 */
export function lastingTickRounds(tick, spanRounds = null) {
  const rounds = Number(tick?.rounds);
  if (!(Number(spanRounds) > 0) || !(rounds > 0) || rounds !== Number(spanRounds)) return {};
  return { rounds: rounds * 2 };
}

/**
 * **FAR-REACHING: A RANGE DOUBLED** - a reach `range.mjs#readRange` read, in feet. Self, Touch,
 * an unlimited and an unread range are never doubled (*if it is not Self or Touch*).
 *
 * @param {{kind?: string, feet?: number|null}|null} reach
 * @param {boolean} farReaching
 */
export function farReach(reach, farReaching = false) {
  if (!farReaching || reach?.kind !== "feet" || !Number.isFinite(Number(reach.feet))) return reach;
  return { ...reach, feet: Number(reach.feet) * 2 };
}

/* ------------------------------------------------------------------ */
/*  Skeletal Mastery's Empowered line                                   */
/* ------------------------------------------------------------------ */

/** 04's Skeletal Mastery, by its identifier, and its Empowered line's numbers. */
export const SKELETAL_MASTERY = Object.freeze({ identifier: "skeletal-mastery", className: "Necromancer", spell: "raise-dead", essence: 1, line: "skeletal-mastery-empowered" });

/**
 * **04's SKELETAL MASTERY, EMPOWERED, AS A LINE** (*Spend 1 Essence when you cast Raise Dead. One
 * more skeleton may rise as a Skeletal Mage*; the 4b review's MUST-FIX 5) on Raise Dead's dialog,
 * for a holder of the talent with an Essence pool: unticked, priced in Essence, greyed in words
 * where the pool is empty. `castSpell` judges it in the one Essence check and hands `mastery + 1`
 * to the raise; the GM's handler asks it again.
 *
 * @param {Array<{identifier: string, className?: string, name?: string, taken?: number}>} talents
 * @param {{identifier?: string|null, essence?: number|null}} o  the spell's identifier, the Essence held (null: no pool)
 * @returns {Array<object>}
 */
export function skeletalMasteryLines(talents = [], { identifier = null, essence = null } = {}) {
  if (identifier !== SKELETAL_MASTERY.spell || essence === null || essence === undefined) return [];
  const rank = rankOf(talents, SKELETAL_MASTERY.identifier, SKELETAL_MASTERY.className);
  if (!rank) return [];
  const row = (talents ?? []).find(t => t?.identifier === SKELETAL_MASTERY.identifier);
  const held = Math.max(0, Math.trunc(Number(essence)) || 0);
  const enough = held >= SKELETAL_MASTERY.essence;
  return [{
    id: `talent-line-${SKELETAL_MASTERY.line}`, identifier: SKELETAL_MASTERY.line, talentId: row?.id ?? null,
    name: row?.name ?? "Skeletal Mastery", kind: "masteryEmpower", amount: SKELETAL_MASTERY.essence, price: SKELETAL_MASTERY.essence,
    pool: ESSENCE, doesKey: "AZEROTH.Necromancer.SkeletalMastery.Does", left: held, rank,
    available: enough, checked: false, reason: enough ? null : "AZEROTH.Essence.EmpowerShort"
  }];
}

/**
 * **EVERY ESSENCE ONE CAST SPENDS, JUDGED AS ONE** (the 4b review's MUST-FIX 2 and 5): the empower
 * lines, Stitch Abomination's grafts, Skeletal Mastery's Empowered line and Claim the Fallen's
 * Empowered Reaction, out of one pool and held whole before anything is paid.
 *
 * @param {{empower?: number, graft?: number, mastery?: number, claim?: number, held?: number|null}} o
 * @returns {{due: number, ok: boolean}}
 */
export function essenceDue({ empower = 0, graft = 0, mastery = 0, claim = 0, held = null } = {}) {
  const n = v => Math.max(0, Math.trunc(Number(v)) || 0);
  const due = n(empower) + n(graft) + n(mastery) + n(claim);
  return { due, ok: due === 0 || (held !== null && held !== undefined && n(held) >= due) };
}

/* ------------------------------------------------------------------ */
/*  Flesh Offering                                                      */
/* ------------------------------------------------------------------ */

/** A taken talent's rank by identifier and class, 0 where it is not taken. */
function rankOf(talents, identifier, className) {
  const row = (talents ?? []).find(t => t?.identifier === identifier && (!className || t.className === className));
  return Math.max(0, Math.trunc(Number(row?.taken)) || 0);
}

/**
 * The Mana a Flesh Offering leaves: 1 less a rank, never below 1, and never raising a price
 * already under 1 (a free cast stays free).
 *
 * @param {number} mana
 * @param {number} rank
 */
export function fleshOfferingPrice(mana = 0, rank = 0) {
  const m = Math.max(0, Math.trunc(Number(mana)) || 0);
  const r = Math.max(0, Math.trunc(Number(rank)) || 0);
  if (m <= FLESH_OFFERING.floor || r <= 0) return m;
  return Math.max(FLESH_OFFERING.floor, m - r * FLESH_OFFERING.perRank);
}

/**
 * **04's FLESH OFFERING, AS A LINE** on a Death spell's dialog: unticked, greyed where the price
 * is already 1 or less. The corpse is chosen at the cast, before anything is paid.
 *
 * @param {Array<{identifier: string, className?: string, name?: string, taken?: number}>} talents
 * @param {{school?: string|null, mana?: number}} o  the spell's OWN school and its Mana due
 * @returns {Array<object>}
 */
export function fleshOfferingLines(talents = [], { school = null, mana = 0 } = {}) {
  if (school !== FLESH_OFFERING.school) return [];
  const rank = rankOf(talents, FLESH_OFFERING.identifier, FLESH_OFFERING.className);
  if (!rank) return [];
  const row = (talents ?? []).find(t => t?.identifier === FLESH_OFFERING.identifier);
  const after = fleshOfferingPrice(mana, rank);
  const saves = Math.max(0, (Math.trunc(Number(mana)) || 0) - after);
  return [{
    id: `talent-line-${FLESH_OFFERING.identifier}`, identifier: FLESH_OFFERING.identifier, talentId: row?.id ?? null,
    name: row?.name ?? "Flesh Offering", kind: "fleshOffering", amount: saves, rank, feet: FLESH_OFFERING.feet,
    doesKey: "AZEROTH.Necromancer.FleshOffering.Does", pool: "mana", left: 1,
    available: saves > 0, checked: false, reason: saves > 0 ? null : "AZEROTH.Necromancer.FleshOffering.Floor"
  }];
}

/**
 * **THE PRICE THE CAST DIALOG DRAWS, WITH THE TICKED LINES THAT TAKE MANA OFF** (O-412, the 4a
 * review: *the roll dialog's line handler takes the ticked Flesh Offering amount off the drawn
 * price*): the price the dialog opened at, less each ticked Flesh Offering line's saving - the
 * number `castSpell` charges, never below nothing.
 *
 * @param {number} base  the price drawn when the dialog opened
 * @param {Array<{identifier: string, kind?: string, amount?: number}>} lines  the lines the dialog drew
 * @param {string[]} ticked  the identifiers ticked now
 * @returns {number}
 */
export function drawnManaPrice(base = 0, lines = [], ticked = []) {
  const price = Math.max(0, Math.trunc(Number(base)) || 0);
  const on = new Set(Array.isArray(ticked) ? ticked : []);
  const off = (lines ?? []).filter(l => l?.kind === "fleshOffering" && on.has(l.identifier))
    .reduce((n, l) => n + Math.max(0, Math.trunc(Number(l.amount)) || 0), 0);
  return Math.max(0, price - off);
}
