/**
 * What a turn's boundary does to a character (A1, 05 SS12, 06 SS8; D-628).
 * Pure: no Foundry imports.
 */

import { resolveDamage } from "./mitigation.mjs";
import { sustainEntryTransferPending } from "./sustain-entry-transfer.mjs";

/**
 * Bleeding X at the start of your turn (A1): lose X Health, armor and Ward
 * not applying; values from separate sources add. A Dying character pays a
 * Death Step instead of Health, however high the value (06 SS8).
 *
 * @param {{bleeding?: number[], dying?: boolean, health?: number}} o
 * @returns {{health: number, deathStep: boolean, bled: number}}
 */
export function bleedTick({ bleeding = [], dying = false, health = 0 } = {}) {
  const total = bleeding.reduce((n, v) => n + Math.max(0, Math.trunc(Number(v)) || 0), 0);
  if (total <= 0) return { health, deathStep: false, bled: 0 };
  if (dying) return { health, deathStep: true, bled: 0 };
  return { health: Math.max(0, health - total), deathStep: false, bled: total };
}

/**
 * Scorched X at the start of your turn (A1, D-695): *you take X Fire damage.
 * Armor and Ward do not apply to it. Values from separate sources add
 * together.* Bleeding's twin, and deliberately the same shape — the number is
 * the sum of the values, not a stack that decays.
 *
 * **IT IS FIRE, so 05 §15 answers it.** *Immune (Type)* is no damage of that
 * type at all and *Vulnerable (Type)* adds 2, so the total goes through
 * `resolveDamage` with the school named rather than straight onto Health. Ward
 * is passed as 0 and no Armor Point is passed at all, because A1's entry says
 * neither applies — this call is here for the two keywords and for nothing
 * else. `slAddsToDamage: false` keeps the Success Level out of it: there is no
 * roll at a turn's start.
 *
 * **A DYING CHARACTER TAKES NO DEATH STEP FROM IT.** 06 §8 names *Bleeding on
 * a Dying character* and nothing else, and extending that sentence to a second
 * condition is a rule the book does not have (CLAUDE.md §17). At 0 Health the
 * tick is silent.
 *
 * @param {{scorched?: number[], dying?: boolean, health?: number,
 *          immune?: string[], vulnerable?: string[], school?: string, fireTakenBonus?: number}} o
 * @returns {{health: number, burned: number, immune: boolean, vulnerable: boolean}}
 */
export function scorchTick({
  scorched = [], dying = false, health = 0, immune = [], vulnerable = [], school = "fire", fireTakenBonus = 0
} = {}) {
  const total = scorched.reduce((n, v) => n + Math.max(0, Math.trunc(Number(v)) || 0), 0);
  if (total <= 0) return { health, burned: 0, immune: false, vulnerable: false };
  // **NO `schoolArmor` HERE, deliberately** (D-755): an ally's aura adds Armor
  // Points after the Ward, and A1 says *Armor and Ward do not apply* to
  // Scorched - so nothing an aura gives reaches this tick, whatever its school.
  // `auras.test.mjs` names this call as the one exempt caller.
  const r = resolveDamage({
    rating: total, sl: 0, kind: "magical", school,
    ward: 0, immune, vulnerable, fireTakenBonus, slAddsToDamage: false
  });
  if (dying) return { health, burned: 0, immune: r.immune, vulnerable: r.vulnerable };
  return {
    health: Math.max(0, health - r.damage),
    burned: r.damage,
    immune: r.immune,
    vulnerable: r.vulnerable
  };
}

/**
 * The Sustain limit (05 SS12): one effect, plus one at Sustained Faith and
 * up to three at Shape the Weave. The larger grant wins; they do not add.
 *
 * **AND WHAT A TALENT ADDS ON TOP** (04's Netherwind: *Your Shape the Weave
 * class feature Sustains 1 further effect per rank*; Archmage: *you may sustain
 * one further spell than you otherwise could*; D-775): `extra`, worked out by
 * `class-talents.mjs#sustainsFor`.
 */
export function sustainLimit({ features = [], extra = 0 } = {}) {
  const names = new Set(features.map(f => f?.name));
  const more = Math.max(0, Math.trunc(Number(extra)) || 0);
  if (names.has("Shape the Weave")) return 3 + more;
  if (names.has("Sustained Faith")) return 2 + more;
  return 1 + more;
}

/**
 * The upkeep at the start of your turn (05 SS12): the pool the spell was cast
 * from pays its Power; an entry that cannot pay ends. Returns the pool writes and
 * which entries stay.
 *
 * **ENTRY BY ENTRY** (D-775): `costOf(entry)` is what one entry costs. **THE
 * ENTRY'S OWN UPKEEP** (D-778; the lead, 2026-10-03, on O-163: *"cost by the entry
 * or 1 Power if not mentioned."*): `rules/upkeep.mjs#upkeepCost` answers `{mana,
 * health}` - 07's number with the talents laid on it - and a bare number is Mana,
 * as D-628's 1 was. A free entry (nothing at all to pay) is kept whatever its pool
 * holds, and named in `free`.
 *
 * **HEALTH IS PAID TOO** (07's Felfire Aura and Felstep, D-778): off the caster's
 * own `health`, never below 1 (05, *Spending Health*: *you may never spend
 * yourself below 1 Health*; temporary Health cannot be spent at all). An entry
 * either half of which cannot be paid ends, and pays neither.
 *
 * @param {{itemId: string, name: string}[]} entries  The actor's `sustaining` flag.
 * @param {{itemId: string, kind: string, name: string, value: number, max: number}[]} pools
 * @param {{costOf?: (entry: object) => number|{mana?: number, health?: number}, health?: number|null}} [o]
 * @returns {{updates: object[], kept: object[], ended: object[], free: object[], paid: {mana: number, health: number},
 *   paidIn: Record<string, number>, health: number|null}}  `health` the caster's Health after the upkeep, or null
 *   where none was paid; `paidIn` what was paid in a pool a talent named (`entry.pool`), by pool name
 */
export function upkeep(entries = [], pools = [], { costOf = () => 1, health = null } = {}) {
  // **THE POOL THE CAST WAS PAID FROM PAYS ITS UPKEEP** (the Chromatic Champion
  // plan, finding 2). A spell a talent pays in another pool (04's Shadowcraft's
  // Focus; the Champion's Rage) records that pool's name on its entry as `pool`,
  // and is upkept there - the class's Power pool would be Energy for a Champion. An
  // entry with no `pool` is paid from its class's Power pool, as before.
  const keyOf = p => `${p.itemId ?? ""}|${p.kind}|${p.name ?? ""}`;
  const remaining = new Map(pools.filter(p => p.kind === "power" || p.kind === "momentum").map(p => [keyOf(p), p.value ?? 0]));
  const payerOf = entry => {
    const named = typeof entry?.pool === "string" && entry.pool && entry.pool !== "mana" ? entry.pool : null;
    if (named) {
      const of = pools.filter(p => p.name === named);
      const pick = of.find(p => p.itemId === entry.itemId) ?? of[0] ?? null;
      return pick ? keyOf(pick) : null;
    }
    const power = pools.find(p => p.kind === "power" && p.itemId === entry?.itemId) ?? null;
    return power ? keyOf(power) : null;
  };
  const other = {};
  const start = health === null || health === undefined || !Number.isFinite(Number(health)) ? null : Math.trunc(Number(health));
  let healthLeft = start;
  const kept = [];
  const ended = [];
  const free = [];
  const suspended = [];
  const paid = { mana: 0, health: 0 };
  // How many kept Sustains paid in MANA or in HEALTH (the 1B review, item 3): the card's
  // *{count} sustained* line counts these alone, never one a talent's pool paid.
  let paidCount = 0;
  for (const entry of entries) {
    if (sustainEntryTransferPending(entry)) { kept.push(entry); suspended.push(entry); continue; }
    const raw = costOf(entry);
    const cost = raw && typeof raw === "object" ? raw : { mana: raw, health: 0 };
    const mana = Math.max(0, Math.trunc(Number(cost.mana)) || 0);
    const hp = Math.max(0, Math.trunc(Number(cost.health)) || 0);
    if (mana === 0 && hp === 0) { kept.push(entry); free.push(entry); continue; }
    const payer = payerOf(entry);
    const have = payer === null ? undefined : remaining.get(payer);
    if (mana > 0 && (have === undefined || have < mana)) { ended.push(entry); continue; }
    if (hp > 0 && (healthLeft === null || healthLeft - hp < 1)) { ended.push(entry); continue; }
    if (mana > 0) remaining.set(payer, have - mana);
    if (hp > 0) healthLeft -= hp;
    // A pool a talent named is not Mana, and the card says which it was.
    const named = typeof entry?.pool === "string" && entry.pool && entry.pool !== "mana" ? entry.pool : null;
    if (named && mana > 0) other[named] = (other[named] ?? 0) + mana;
    else paid.mana += mana;
    paid.health += hp;
    if ((!named && mana > 0) || hp > 0) paidCount += 1;
    kept.push(entry);
  }
  const updates = [];
  for (const p of pools) {
    if (p.kind !== "power" && p.kind !== "momentum") continue;
    const value = remaining.get(keyOf(p));
    if (value !== undefined && value !== p.value) updates.push({ itemId: p.itemId, kind: p.kind, value });
  }
  return { updates, kept, ended, free, suspended, paid, paidCount, paidIn: other, health: start !== null && healthLeft !== start ? healthLeft : null };
}
