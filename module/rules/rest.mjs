/**
 * Rests, from 05 §16 and 05 §12's recovery column. Pure: a snapshot in, an
 * update out, no Foundry.
 *
 * The sheet's handlers used to do this arithmetic themselves and got two
 * things wrong at once: a Long Rest restored FULL Health, where 05 §16 says
 * *"You do not wake at full Health"*, and both rests wrote `system.power.value`
 * - the legacy single-pool mirror that `prepareDerivedData` overwrites from
 * `classes[]` on the next preparation, so the rest never reached the pool the
 * sheet draws.
 *
 * What each rest recovers (05 §16, 05 §12, 02 §6):
 *
 *   Short Rest   Health: Constitution modifier + tier, AND ONLY IF FOOD WAS
 *                EATEN (05 §16, D-733); twice a day, counted by the table and
 *                not here. Mana: half the pool, AND ONLY IF DRINK WAS DRUNK.
 *                Focus: full either way (05 §12: "Short Rest, and by holding
 *                position"). Energy and Momentum: untouched - Energy refills
 *                per turn and Momentum dies with the fight.
 *   Long Rest    Health: a quarter of the maximum, rounded up, plus the
 *                Constitution modifier. Mana and Focus: full. Fatigue: minus
 *                one. Resolve refreshes but is derived, so nothing is stored.
 *                Spirit's Tether: NEVER on a rest (D2 §2.2).
 */

import { AZEROTH } from "../config.mjs";

/** @typedef {{itemId: string, kind: "power"|"momentum", name: string, value: number, max: number}} PoolSnapshot */

/**
 * The pool updates a rest makes, and what each gained, in one pass.
 * @returns {{updates: object[], gains: object[]}}
 */
function poolRecovery(pools, valueFor) {
  const updates = [];
  const gains = [];
  for (const p of pools) {
    if (p.kind !== "power") continue;
    const value = valueFor(p);
    if (value === null || value === undefined) continue;
    updates.push({ itemId: p.itemId, kind: p.kind, value });
    if (value > p.value) gains.push({ kind: "pool", name: p.name, itemId: p.itemId, amount: value - p.value });
  }
  return { updates, gains };
}

/**
 * A Short Rest, and what it is given to eat and drink (05 §16, 08 §12; D-733).
 *
 * **THE DEFAULTS WITHHOLD.** The lead, 2026-09-19: *rest alone never restores
 * Health or Mana; only consuming food or drink does.* So `eats` and `drinks`
 * are false unless the caller says otherwise, and a door that forgets the
 * picks restores nothing rather than everything - the failure that costs
 * nothing rather than the one that gives the rule away. **Focus fills either
 * way** (05 §12: it comes back on a Short Rest and by holding position, and
 * nothing there mentions a drink).
 *
 * The NPC door passes both explicitly: a creature carries no rations and 14
 * states no such condition, so its exemption is written where it rests rather
 * than assumed here.
 *
 * @param {object} s
 * @param {{value: number, max: number}} s.health
 * @param {number} s.conMod
 * @param {number} s.tier
 * @param {number} [s.fatigue]
 * @param {PoolSnapshot[]} [s.pools]
 * @param {boolean} [s.eats]   food was spent on this rest
 * @param {boolean} [s.drinks] drink was spent on this rest
 * @param {boolean} [s.tierAgain] the food was a hot meal or a feast (08 §12)
 * @param {{itemId?: string|null, amount?: number}} [s.manaExtra] Mana a talent
 *   returns beyond 05's half, WITH a drink and only with one (04's Light's
 *   Reserve: *A Short Rest with a drink returns 3 more Mana per rank*; D-772),
 *   into the ONE pool `itemId` names - the talent's own class's, where a
 *   character holds two (02 §10: *each class keeps its own Power pool*) - or the
 *   first Mana pool where it names none; capped with the rest by the maximum
 * @returns {{health: number, fatigue: number, pools: object[], gains: object[]}}
 *   `gains` lists what came back - `{kind: "health", amount}`, `{kind:
 *   "pool", name, itemId, amount}` - for the card (D-623), and what did not:
 *   `{kind: "noFood"}` and `{kind: "noDrink"}` are printed as flags so an
 *   empty rest says WHY rather than looking broken. A hot meal adds
 *   `{kind: "tierAgain", amount}` beside the Health.
 */
export function shortRest({
  health, conMod = 0, tier = 1, fatigue = 0, pools = [],
  eats = false, drinks = false, tierAgain = false, manaExtra = null
} = {}) {
  const extraAmount = drinks ? Math.max(0, Math.trunc(Number(manaExtra?.amount)) || 0) : 0;
  const manaPools = pools.filter(p => p.kind === "power" && p.name === "mana");
  const extraInto = extraAmount > 0
    ? (manaPools.find(p => manaExtra?.itemId && p.itemId === manaExtra.itemId) ?? manaPools[0] ?? null)
    : null;
  const extra = p => (extraInto && p === extraInto ? extraAmount : 0);
  // 08 §12: *Health equal to your tier again* on the rest a hot meal feeds -
  // added to the rest's own recovery, and only where there was a rest to feed.
  const plain = eats ? Math.max(0, conMod + tier) : 0;
  const bonus = eats && tierAgain ? Math.max(0, tier) : 0;
  const before = health.value ?? 0;
  // THE TWO LINES ADD UP TO WHAT MOVED. The rest's own recovery lands first
  // and the hot meal's tier on top of it, each capped by the maximum, so the
  // card never prints a point of Health the cap swallowed and never counts
  // the tier twice (once inside *Health* and once beside it).
  const fedTo = Math.min(health.max, before + plain);
  const after = Math.min(health.max, fedTo + bonus);
  // Only a character who HOLDS Mana is told the drink was missing: a
  // Warrior's card says nothing about a pool the Warrior does not have.
  const holdsMana = pools.some(p => p.kind === "power" && p.name === "mana");
  const { updates, gains } = poolRecovery(pools, p => {
    if (p.name === "mana") return drinks ? Math.min(p.max, p.value + Math.floor(p.max / 2) + extra(p)) : null;
    if (p.name === "focus") return p.max;
    return null;
  });
  return {
    health: after,
    fatigue,
    pools: updates,
    gains: [
      ...(fedTo > before ? [{ kind: "health", amount: fedTo - before }] : []),
      ...(after > fedTo ? [{ kind: "tierAgain", amount: after - fedTo }] : []),
      ...gains,
      ...(eats ? [] : [{ kind: "noFood" }]),
      ...(!drinks && holdsMana ? [{ kind: "noDrink" }] : [])
    ]
  };
}

/**
 * @param {Parameters<typeof shortRest>[0]} s
 * Diseased (A1): "You regain no Health from a Long Rest and it removes no
 * Fatigue." The pools still fill; the card carries `{kind: "diseased"}`.
 */
export function longRest({ health, conMod = 0, tier = 1, fatigue = 0, pools = [], diseased = false } = {}) {
  const gain = Math.max(0, Math.ceil(health.max / 4) + conMod);
  const before = health.value ?? 0;
  const after = diseased ? before : Math.min(health.max, before + gain);
  const rested = diseased ? fatigue : Math.max(0, fatigue - 1);
  const { updates, gains } = poolRecovery(pools, p => (p.name === "mana" || p.name === "focus" ? p.max : null));
  return {
    health: after,
    fatigue: rested,
    pools: updates,
    gains: [
      ...(after > before ? [{ kind: "health", amount: after - before }] : []),
      ...gains,
      ...(rested < fatigue ? [{ kind: "fatigue", amount: rested - fatigue }] : []),
      ...(diseased ? [{ kind: "diseased" }] : [])
    ]
  };
}

/**
 * What a combatant's Power pools gain at the start of their turn (05 §12:
 * Energy "refills 3 a turn", Focus "refills 2 a turn"). Mana refills on no
 * turn. Momentum is not a Power pool and is built, not refilled.
 */
export const REFILL_PER_TURN = AZEROTH.POWER_REFILL_PER_TURN;

/**
 * @param {PoolSnapshot[]} pools
 * @param {{extra?: Record<string, number>}} [o]  what a talent adds to a pool's
 *   refill (04's Adrenaline: *Your Energy pool returns 1 more per rank at the
 *   start of your turn*; D-773), by pool name, on a pool that refills at all
 */
export function turnRefill(pools = [], { extra = {} } = {}) {
  return pools.flatMap(p => {
    if (p.kind !== "power") return [];
    const rate = REFILL_PER_TURN[p.name];
    const more = Math.max(0, Math.trunc(Number(extra?.[p.name])) || 0);
    if (!rate || p.value >= p.max) return [];
    return [{ itemId: p.itemId, kind: p.kind, value: Math.min(p.max, p.value + rate + more) }];
  });
}

/**
 * Burn a Spirit's Tether (05 §14, 06 §9): stand at 1 Health, no Test. Death
 * Steps clear with it once they exist. Returns null when there is nothing to
 * burn, which the caller reports rather than silently doing nothing.
 */
export function burnTether({ tether, health }) {
  if (!tether || (tether.value ?? 0) < 1) return null;
  return { tether: tether.value - 1, health: Math.max(1, Math.min(health.max, 1)) };
}
