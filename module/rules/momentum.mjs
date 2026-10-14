/**
 * Momentum (05 SS11, 02 SS7; D-627). Pure: no Foundry imports.
 *
 * This file holds what the fight's lifecycle needs of the pools: what they
 * hold as a fight begins, and what a Critical Injury or Guard leaves. The
 * gains on a hit and the class drains join it in D-627's second half.
 */

// The ONE hold at 1 Health (D-777): Unkillable's floor reads it.
import { heldAt } from "./blow-doors.mjs";

/**
 * What every pool holds as a fight starts (02 SS7): Momentum at 0 - Zeal at
 * Fanaticism's 3 where the talent says so - and Energy and Focus full ("you
 * begin every fight full"). Returns only the pools that move.
 *
 * **AND A FANATIC'S ZEAL CARRIES INTO THE NEXT FIGHT** (D-779; the lead,
 * 2026-10-03, on O-172: *"Yes"* to *does the Zeal kept out of one fight carry
 * into the next?*): `keepsZeal` (Fanaticism at rank 1) leaves the Zeal as the
 * last fight left it. Rank 2's *begin every fight holding 3* is left as built -
 * `zealStart` sets it - because whether the 3 is a floor or a reset is still
 * the lead's (CLARIFY, O-172).
 *
 * @param {{itemId: string|null, kind: "power"|"momentum", name: string, value: number, max: number}[]} pools
 * @param {{zealStart?: number, keepsZeal?: boolean}} [o]
 */
export function fightStart(pools = [], { zealStart = 0, keepsZeal = false } = {}) {
  const updates = [];
  for (const p of pools) {
    if (p.kind === "momentum") {
      if (p.name === "zeal" && keepsZeal && !(Number(zealStart) > 0)) continue;
      const value = p.name === "zeal" ? Math.max(0, Math.min(p.max ?? 0, zealStart)) : 0;
      if (value !== (p.value ?? 0)) updates.push({ itemId: p.itemId, kind: "momentum", value });
    } else if (p.kind === "power" && (p.name === "energy" || p.name === "focus") && (p.value ?? 0) < (p.max ?? 0)) {
      updates.push({ itemId: p.itemId, kind: "power", value: p.max });
    }
  }
  return updates;
}

/**
 * Momentum decay. A Critical Injury costs all of it, and so does the Guard
 * action (05 SS11). The Warrior's end-of-round drain is the class's own.
 */
export function momentumAfter(value, { criticalInjury = false, guarded = false } = {}) {
  if (criticalInjury || guarded) return 0;
  return Math.max(0, value);
}

/* -------------------------------------------- */
/*  The map (05 SS11, 02 SS7, 04; D-627)          */
/* -------------------------------------------- */

/** The universal gain: +1 on a hit with an Attack Test, +1 more at SL 2 or higher. */
export function hitGain(sl = 0) {
  return 1 + ((Math.trunc(Number(sl)) || 0) >= 2 ? 1 : 0);
}

/**
 * What each Momentum pool gains from a hit. Every pool the actor holds gains
 * by its own trigger (the lead's ruling): Rage, Zeal and Combo Points on any
 * hit; Quarry only against the mark; Ferocity only in a form. An off-hand
 * attack builds none (06 SS2), and neither does a feature that says so.
 * A hit absorbed to nothing is still a hit (06 SS4).
 *
 * **`extra` IS SUBJECT TO THE OFF-HAND RULE AND `always` IS NOT** (D-696).
 * 08 SS5's Fast rides `extra` and is refused off the hand with everything else,
 * which is 06 SS2 as written. Dal'Rend's Sacred Charge is the other case: *gain
 * 1 additional Momentum ... if the blow was an Off-Hand Attack*, which is a
 * specific rule beating the general one and names the off hand as the very
 * thing it pays for. Riding it on `extra` would have made half that Signature
 * dead on the branch it was written for - right code with no caller, and with
 * a passing unit test (D-681).
 *
 * A feature that says the character builds none still refuses `always`: that
 * is not the off-hand rule, it is a rule about the character.
 *
 * **`poolExtra` IS A FURTHER GAIN INTO ONE POOL BY NAME** (04's Primal Fury:
 * *gain 1 further Ferocity per rank*; D-771), beside the gain every pool takes
 * and under the same rules: refused on an off-hand blow, as `extra` is (MY
 * READING, for the lead - 06 §2's off hand builds none), and into a pool only
 * where that pool builds at all (Ferocity in a form).
 *
 * @returns {{itemId: string|null, kind: "momentum", name: string, value: number, gained: number}[]}
 */
export function gainOnHit({ pools = [], sl = 0, offHand = false, againstMark = false, inForm = false, builds = true, extra = 0, always = 0, poolExtra = {} } = {}) {
  if (!builds) return [];
  const whatever = Math.max(0, Math.trunc(Number(always)) || 0);
  // 06 SS2: an off-hand attack builds none, except what a rule grants FOR
  // being off-hand.
  const gain = offHand
    ? whatever
    : hitGain(sl) + Math.max(0, Math.trunc(Number(extra)) || 0) + whatever;
  const further = name => (offHand ? 0 : Math.max(0, Math.trunc(Number(poolExtra?.[name])) || 0));
  const out = [];
  for (const p of pools) {
    if (p.kind !== "momentum") continue;
    if (p.name === "quarry" && !againstMark) continue;
    if (p.name === "ferocity" && !inForm) continue;
    const total = gain + further(p.name);
    if (total <= 0) continue;
    const value = Math.min(p.max ?? 0, (p.value ?? 0) + total);
    if (value > (p.value ?? 0)) out.push({ itemId: p.itemId, kind: "momentum", name: p.name, value, gained: value - (p.value ?? 0) });
  }
  return out;
}

/**
 * **WHETHER A FURTHER GAIN GAINS ANYTHING** (D-779; the lead, 2026-10-03, on
 * O-171: *"No."* to *does a hit that gains nothing spend Once during your
 * turn?*). Primal Fury's *once during your turn* - and every once-a-turn or
 * once-a-round further gain that rides `poolExtra` - is spent only where the
 * row's own amount raises its pool past what the hit gives without it: a pool
 * already full, or filled by 05's own gain, leaves the once for a later hit.
 *
 * `args` is exactly what the door hands `gainOnHit`, with `poolExtra` holding
 * this row's amount among the rest. A Power pool (Aimed Volley's Focus) is
 * returned by `class-talents.mjs#powerReturns`, so its room is read here the
 * same way: the pool's value with the further amounts, against without.
 *
 * @param {object} args  `gainOnHit`'s arguments, this row's amount included
 * @param {string} pool  the pool the row names
 * @param {number} amount  the row's amount
 * @returns {boolean}
 */
export function furtherGains(args = {}, pool = null, amount = 0) {
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (!pool || !n) return false;
  const held = (args.pools ?? []).find(p => p?.name === pool) ?? null;
  if (!held) return false;
  const withRow = { ...(args.poolExtra ?? {}) };
  const without = { ...withRow, [pool]: Math.max(0, (Math.trunc(Number(withRow[pool])) || 0) - n) };
  const before = Number(held.value) || 0;
  const valueWith = extra => {
    if (held.kind === "power") {
      const add = Math.max(0, Math.trunc(Number(extra[pool])) || 0);
      return Math.min(Number(held.max) || 0, before + add);
    }
    return gainOnHit({ ...args, poolExtra: extra }).find(g => g.name === pool)?.value ?? before;
  };
  return valueWith(withRow) > valueWith(without);
}

/** Rage when a blow reaches Health (02 SS7): +1, and +1 more per rank of Enrage (04). */
export function gainWhenStruck({ pools = [], damage = 0, enrageRanks = 0 } = {}) {
  if (!(damage > 0)) return [];
  const out = [];
  for (const p of pools) {
    if (p.kind !== "momentum" || p.name !== "rage") continue;
    const value = Math.min(p.max ?? 0, (p.value ?? 0) + 1 + Math.max(0, Math.trunc(enrageRanks) || 0));
    if (value > (p.value ?? 0)) out.push({ itemId: p.itemId, kind: "momentum", name: p.name, value, gained: value - (p.value ?? 0) });
  }
  return out;
}

/**
 * Rage at a round's end (02 SS7): drains 2 in a round the Warrior neither
 * struck nor was struck; not below half Health with Frenzy or Deathwish (04).
 * Any other pool is left as it stands.
 */
export function drainAtRoundEnd(pool, { struck = false, wasStruck = false, belowHalf = false, holdsBelowHalf = false } = {}) {
  const value = pool?.value ?? 0;
  if (pool?.name !== "rage") return value;
  if (struck || wasStruck) return value;
  if (belowHalf && holdsBelowHalf) return value;
  return Math.max(0, value - 2);
}

/** Combo Points (02 SS7): all of them go after two rounds without a hit. */
export function idleDecay(pool, { round = 1, lastHitRound = null } = {}) {
  const value = pool?.value ?? 0;
  if (pool?.name !== "comboPoints" || value === 0) return value;
  if (lastHitRound === null || lastHitRound === undefined) return value;
  return round - lastHitRound >= 2 ? 0 : value;
}

/** Guard (05 SS11) costs all of it; Unbroken keeps the Rage, once an encounter (02 SS7). */
export function lossOnGuard(pool, { unbroken = false } = {}) {
  if (unbroken && pool?.name === "rage") return pool.value ?? 0;
  return 0;
}

/** Hammer of Justice (04): spend 5 or more Zeal at once and 1 a rank returns. */
export function refundOnSpend(pool, spent = 0, ranks = 0) {
  if (pool?.name !== "zeal" || spent < HAMMER_OF_JUSTICE_SPEND || ranks <= 0) return pool?.value ?? 0;
  return Math.min(pool.max ?? 0, (pool.value ?? 0) + Math.trunc(ranks));
}

/** Hammer of Justice's *5 or more Zeal at once* (04), the one number both its ranks read. */
export const HAMMER_OF_JUSTICE_SPEND = 5;

/** The 07 spell Hammer of Justice's rank 2 applies, by name. */
export const HAMMER_OF_JUSTICE_SPELL = "Hammer of Justice";

/**
 * **HAMMER OF JUSTICE AT RANK 2** (04: *At rank 2, a spell or feature of yours
 * that cost 5 or more Zeal also applies Hammer of Justice to its target, or to
 * one target of your choice if it had several, costing no Mana and no
 * action*; D-772). Whether this use does.
 *
 * @param {{pool?: string|null, spent?: number, ranks?: number}} o
 */
export function appliesHammerOfJustice({ pool = null, spent = 0, ranks = 0 } = {}) {
  return pool === "zeal" && (Math.trunc(Number(spent)) || 0) >= HAMMER_OF_JUSTICE_SPEND && (Math.trunc(Number(ranks)) || 0) >= 2;
}

/**
 * **WHAT LEAVES A FIGHT WITH A COMBATANT** (05 §11, 02 §7; D-627): every
 * Momentum pool goes to 0 - 02's *drains 2 a round out of combat* and Rage's
 * *gone within three rounds*, taken at once since nothing counts a round
 * outside one.
 *
 * **EXCEPT A FANATIC'S ZEAL** (04's Fanaticism at rank 1: *Your Zeal does not
 * drain out of combat*; D-772). It was emptied with the rest. **Whether the Zeal
 * a Paladin carries out of one fight is there when the next begins is a
 * QUESTION for the lead** - 02 says *You start every fight at 0 Zeal* and rank
 * 2 *you begin every fight holding 3* - so `fightStart` still sets it as 02 and
 * rank 2 say, and this keeps it only between the fights.
 *
 * @param {Array<{itemId: string|null, kind: string, name: string, value: number}>} pools
 * @param {{keepsZeal?: boolean}} [o]
 * @returns {Array<{itemId: string|null, kind: "momentum", value: 0}>}  only the pools that move
 */
export function leaveFightPools(pools = [], { keepsZeal = false } = {}) {
  return (pools ?? [])
    .filter(p => p?.kind === "momentum" && (p.value ?? 0) > 0)
    .filter(p => !(keepsZeal && p.name === "zeal"))
    .map(p => ({ itemId: p.itemId, kind: "momentum", value: momentumAfter(0) }));
}

/**
 * 04's Killing Blow: *When you reduce a target below half Health, gain 6 Rage.*
 * The Rage the ATTACKER gains for one blow, or 0 (D-627, D-768).
 */
export const KILLING_BLOW_RAGE = 6;
export function killingBlowRage({ before = 0, after = 0, max = 0, ranks = 0 } = {}) {
  if (!(Number(ranks) > 0)) return 0;
  return before >= max / 2 && after < max / 2 ? KILLING_BLOW_RAGE : 0;
}

/**
 * 02 §7: a Paladin gains *2 whenever a friendly target within 20 feet is
 * reduced to 0 Health*.
 */
export const ZEAL_FRIENDLY_DOWN = 2;

/**
 * **WHETHER 02's FALLEN-FRIEND ZEAL COUNTS THE PALADIN THEMSELF: NO** (D-768).
 * The sentence is *a friendly target within 20 feet*, Righteous Fury's own
 * wording, and the lead's D-755 reading makes the holder their own ally unless
 * the words say *other than you* - so it was asked. Asked whether a Paladin
 * reduced to 0 gains the 2 Zeal, the lead answered *"Others only"* (2026-10-03).
 * Righteous Fury still counts the Paladin.
 */
export const ZEAL_DOWN_COUNTS_SELF = false;

/**
 * The Zeal ONE Paladin gains for one blow that landed within 20 feet (02 §7,
 * 04's Righteous Fury; D-627, D-768): 2 when the friendly target is reduced to
 * 0, and Righteous Fury's 1 per rank *whenever a friendly target within 20
 * feet takes damage*.
 *
 * **RIGHTEOUS FURY COUNTS THE PALADIN** (D-768): *a friendly target* with no
 * *other than you*, and the lead's D-755 reading of 04's *friendly targets*
 * makes the holder their own ally. `afterBlow` skipped the struck creature for
 * every ally it walked, so a Paladin taking a blow never gained the Zeal.
 *
 * @param {{before: number, after: number, self?: boolean, righteousFury?: number}} o
 * @returns {number}
 */
export function zealFromBlow({ before = 0, after = 0, self = false, righteousFury = 0 } = {}) {
  let gain = 0;
  if (after === 0 && before > 0 && (!self || ZEAL_DOWN_COUNTS_SELF)) gain += ZEAL_FRIENDLY_DOWN;
  if (before > after) gain += Math.max(0, Math.trunc(Number(righteousFury) || 0));
  return gain;
}

/**
 * 02 §7's Unkillable: *While you have Rage remaining, no single blow can reduce
 * you below 1 Health. Each time this saves you, lose all Rage.* The damage that
 * lands after the floor, and whether the floor saved them - which empties the
 * Rage (D-627, D-768).
 *
 * @param {{before: number, amount: number, rage: number, holds: boolean}} o
 * @returns {{amount: number, saved: boolean}}
 */
export function unkillableFloor({ before = 0, amount = 0, rage = 0, holds = false } = {}) {
  if (!holds || !(rage > 0)) return { amount, saved: false };
  // The ONE hold every catch in the system reads (D-777): `blow-doors.mjs#heldAt`.
  const held = heldAt({ before, amount, stay: 1 });
  return held.saved ? { amount: held.amount, saved: true } : { amount, saved: false };
}

/**
 * A pool's cap with the talents that lift it (04): Zealotry caps Zeal at 15,
 * Hunter's Mark adds 2 Quarry a rank. `ranks` is a name-to-ranks lookup.
 */
export function capFor(pool, ranks = () => 0) {
  const max = pool?.max ?? 0;
  if (pool?.name === "zeal" && ranks("Zealotry") > 0) return 15;
  if (pool?.name === "quarry") return max + 2 * Math.max(0, ranks("Hunter's Mark"));
  return max;
}
